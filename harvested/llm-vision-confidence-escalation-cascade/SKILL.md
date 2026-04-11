---
name: LLM Vision Confidence Escalation Cascade
description: Two-stage vision pipeline — cheap primary model on every request, expensive model only on low-confidence results. Cuts cost ~80% vs single-model while keeping tail accuracy.
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [llm, vision, gemini, anthropic, claude, cost-optimization, zod, confidence-scoring, ai-pipeline]
harvested: 2026-04-11
---

# LLM Vision Confidence Escalation Cascade

Run every image through a cheap LLM vision model first. Only escalate to an expensive model when the cheap one reports low confidence or fails schema validation. Keeps p99 accuracy close to the expensive model while paying mostly cheap rates.

**Different from `llm-model-routing`**: that skill routes based on *query characteristics* (length, keywords). This one routes based on the *primary model's output confidence* — so both patterns can stack.

## When to Use

- Any cost-sensitive production vision API (QC inspection, OCR, document extraction, content moderation)
- When you have two providers with different quality/price tiers and strict JSON output needs
- When you want SLA-grade accuracy but single-model-on-Opus is 10x over budget
- When training a self-hosted model is too slow — LLM cascade buys you time while you collect labelled data

## The pattern

```
image → sharp normalise (max 1024px, JPEG q=85)
   ↓
Gemini 2.5 Pro (primary)   ← ~$1.25 / 1M input tokens
   ↓ parse via strict Zod schema
   ↓ confidence ≥ 0.7 AND schema passes? → return
   ↓ otherwise
Claude Opus 4.6 (escalation)   ← ~$15 / 1M input tokens
   ↓ parse via same Zod schema
   ↓ return (or throw if both fail)
```

Roughly 85 % of traffic stays on the cheap provider, 15 % escalates. Blended cost:
- `0.85 × $0.003 + 0.15 × $0.03 ≈ $0.007 per image`
- At a $150/mo ceiling → ~21 000 inspections/month
- Single-model Opus would give you ~5 000 inspections at the same cost

## Implementation

### 1. Both SDKs

```bash
npm install @google/generative-ai @anthropic-ai/sdk sharp
```

Both typically already present if you've shipped either provider before — check before installing.

### 2. Shared Zod schema drives both APIs

```ts
import { z } from 'zod';

// ONE schema — used for both providers' structured output modes
export const weldInspectionSchema = z.object({
  verdict: z.enum(['pass', 'fail', 'review']),
  defects: z.array(z.object({
    type: z.string(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    severity: z.enum(['low', 'medium', 'high']),
  })),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});
```

### 3. Single public API, hides the cascade

```ts
export async function runVisionInference<TSchema extends z.ZodType>(opts: {
  moduleSlug: string;
  userId: string;
  image: Buffer | string;
  systemPrompt: string;
  schema: TSchema;
  escalationThreshold?: number;  // default 0.7
}): Promise<{
  output: z.infer<TSchema>;
  confidence: number;
  modelUsed: 'gemini-2.5-pro' | 'claude-opus-4-6';
  escalated: boolean;
  latencyMs: number;
  inferenceId: string;
}> {
  const threshold = opts.escalationThreshold ?? 0.7;
  const start = Date.now();

  // Stage 1: primary
  try {
    const primary = await callGemini(opts);
    const parsed = opts.schema.safeParse(primary);
    if (parsed.success && parsed.data.confidence >= threshold) {
      const inferenceId = await persistInference({
        ...opts,
        primary: 'gemini-2.5-pro',
        primaryConfidence: parsed.data.confidence,
        escalated: false,
        latencyMs: Date.now() - start,
      });
      return {
        output: parsed.data,
        confidence: parsed.data.confidence,
        modelUsed: 'gemini-2.5-pro',
        escalated: false,
        latencyMs: Date.now() - start,
        inferenceId,
      };
    }
  } catch (err) {
    // Fall through to escalation on any Gemini error
  }

  // Stage 2: escalation
  const escalation = await callClaude(opts);
  const parsed = opts.schema.parse(escalation);  // throw if Opus also fails
  const inferenceId = await persistInference({
    ...opts,
    primary: 'gemini-2.5-pro',
    primaryConfidence: 0,  // or the failed value
    escalated: true,
    final: 'claude-opus-4-6',
    finalConfidence: parsed.confidence,
    latencyMs: Date.now() - start,
  });

  return {
    output: parsed,
    confidence: parsed.confidence,
    modelUsed: 'claude-opus-4-6',
    escalated: true,
    latencyMs: Date.now() - start,
    inferenceId,
  };
}
```

### 4. Provider-specific structured-output invocations

```ts
// Gemini — responseMimeType + responseSchema
async function callGemini<T>(opts): Promise<T> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-pro',
    systemInstruction: opts.systemPrompt,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: zodToGeminiSchema(opts.schema),  // small adapter
    },
  });
  const result = await model.generateContent([
    { inlineData: { mimeType: 'image/jpeg', data: opts.image.toString('base64') } },
  ]);
  return JSON.parse(result.response.text());
}

// Claude — tool_use with the same schema as the tool input
async function callClaude<T>(opts): Promise<T> {
  const result = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    tools: [{
      name: 'record_inspection',
      description: 'Record the inspection result',
      input_schema: zodToJsonSchema(opts.schema),
    }],
    tool_choice: { type: 'tool', name: 'record_inspection' },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: opts.systemPrompt },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: opts.image.toString('base64') } },
      ],
    }],
  });
  const toolUse = result.content.find((c) => c.type === 'tool_use');
  if (!toolUse) throw new Error('Claude did not emit tool_use');
  return toolUse.input as T;
}
```

### 5. Telemetry columns (AiInference table)

Store enough to calculate per-module accuracy, blended cost, and escalation rate:

```sql
CREATE TABLE ai_inference (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_slug           TEXT NOT NULL,
  user_id               UUID REFERENCES users(id),
  input_hash            TEXT NOT NULL,        -- SHA-256 of image
  primary_model         TEXT NOT NULL,
  primary_confidence    FLOAT,
  primary_tokens        INT,
  escalated             BOOLEAN NOT NULL DEFAULT false,
  final_model           TEXT NOT NULL,
  final_confidence      FLOAT NOT NULL,
  final_tokens          INT,
  estimated_cost_usd    NUMERIC(10, 6) NOT NULL,
  latency_ms            INT NOT NULL,
  reviewer_user_id      UUID REFERENCES users(id),  -- for human-in-loop
  reviewed_at           TIMESTAMPTZ,
  electronic_signature_id UUID,  -- CFR 21 Part 11
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON ai_inference (user_id, created_at);
CREATE INDEX ON ai_inference (module_slug, created_at);
```

## Pitfalls

1. **Schema translation is the sharp edge.** Zod → Gemini `responseSchema` and Zod → Claude `input_schema` are slightly different dialects. Write a small adapter and test it with every new schema.
2. **Don't count primary tokens twice on escalation.** Log both `primary_tokens` and `final_tokens` separately so cost attribution is correct.
3. **SDK types lag behind features.** Gemini `responseModalities: ['image', 'text']` may not be in older `@google/generative-ai` types — cast to `any` on the generation config until you bump the SDK.
4. **Confidence from the primary is self-reported.** The primary model can be overconfident on adversarial inputs. Combine with a secondary signal (e.g. reject if `defects.length === 0` AND `confidence < 0.9`) for higher-stakes domains.
5. **CI must exercise the Opus path.** Add one golden image per module that forces escalation (e.g. an intentionally blurry frame) so the escalation code path runs on every build.

## Variants

- **Three-stage**: add Gemini Flash as a zeroth pre-filter for "obviously OK" cases — useful at very high volume.
- **Confidence floor not threshold**: escalate only if `confidence < 0.5` AND `verdict === 'review'` — reduces escalation rate further when the verdict itself is a reliable signal.
- **Provider-specific fallback chains**: inside each stage, try Pro → Flash → legacy as a within-provider fallback before crossing providers.

## Related skills

- `llm-model-routing` — routes by query characteristics, not confidence
- `prisma-sql-injection-defense` — relevant when storing the Zod-parsed output
- `zero-mock-zero-fallback` — don't silently fall back on failure; surface the error to the user
