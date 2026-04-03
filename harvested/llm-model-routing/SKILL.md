---
name: LLM Model Routing
description: Regex-based classifier to route simple user queries to cheap models (Haiku) and complex ones to expensive models (Sonnet), with conservative default
source_project: HazPredict-1
projects_used_in: [HazPredict-1]
tags: [llm, anthropic, model-routing, cost-optimization, copilot, chatbot]
harvested: 2026-04-03
---

# LLM Model Routing

Rule-based query classifier that routes user messages to the cheapest appropriate model. Simple lookups go to Haiku (fast, 10x cheaper), complex analysis goes to Sonnet.

## When to Use

- Any copilot, chatbot, or AI assistant with high query volume
- When LLM API costs need optimization without sacrificing quality
- When queries have a bimodal distribution (many simple lookups + some complex analysis)

## Architecture

```
User Message
  → Length check (>200 chars → Sonnet)
  → Tool pattern check (history, acknowledge → Sonnet + tools)
  → Complex pattern check (why, analyze, compare → Sonnet)
  → Simple pattern check (<100 chars + lookup pattern → Haiku)
  → Default: Sonnet (conservative)
```

## Pattern Categories

### Simple Lookups (route to cheap model)

```javascript
const SIMPLE_PATTERNS = [
  /^(what is|what's|show me|show|tell me|list|get|current|status|reading|value|check)\b/i,
  /^(is|are|how many|which zones?)\b/i,
];
```

These are factual lookups that need data retrieval, not reasoning.

### Complex Analysis (always use expensive model)

```javascript
const COMPLEX_PATTERNS = [
  /\b(why|explain|analyze|compare|trend|predict|recommend|should|cause|root cause|correlat|pattern|forecast|optimize)\b/i,
  /\b(report|summary|summarize|investigate|diagnose|troubleshoot)\b/i,
];
```

These require multi-step reasoning, synthesis, or domain expertise.

### Tool-Requiring (expensive model + enable tools)

```javascript
const TOOL_PATTERNS = [
  /\b(histor|historical|past|last\s+\d+\s+(hour|day|minute|week)s?|yesterday|ago)\b/i,
  /\b(acknowledge|ack|clear)\s+(the\s+)?alarm/i,
  /\b(device|sensor)\s+(status|online|offline|health)\b/i,
];
```

Tool calls need the more capable model to handle multi-turn tool loops.

## Classifier Function

```javascript
function classifyQuery(userMessage) {
  if (!userMessage || typeof userMessage !== "string") {
    return { model: MODEL_EXPENSIVE, needsTools: false, reason: "empty_query" };
  }

  const msg = userMessage.trim();

  // Long messages are likely complex
  if (msg.length > 200) {
    return { model: MODEL_EXPENSIVE, needsTools: false, reason: "long_query" };
  }

  // Check tool patterns first (always expensive + tools)
  for (const pattern of TOOL_PATTERNS) {
    if (pattern.test(msg)) {
      return { model: MODEL_EXPENSIVE, needsTools: true, reason: "tools_needed" };
    }
  }

  // Check complex patterns
  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(msg)) {
      return { model: MODEL_EXPENSIVE, needsTools: false, reason: "complex_analysis" };
    }
  }

  // Simple patterns — only if short AND simple
  if (msg.length < 100 && msg.split("\n").length <= 2) {
    for (const pattern of SIMPLE_PATTERNS) {
      if (pattern.test(msg)) {
        return { model: MODEL_CHEAP, needsTools: false, reason: "simple_lookup" };
      }
    }
  }

  // Conservative default — safety > cost savings
  return { model: MODEL_EXPENSIVE, needsTools: false, reason: "default_expensive" };
}
```

## Design Principles

1. **Conservative default**: When uncertain, use the expensive model. A wrong cheap-model response costs more in user trust than the API savings.

2. **Length as a signal**: Messages >200 chars are almost never simple lookups. Messages <100 chars with simple patterns are safe for cheap routing.

3. **Tool calls need capability**: Tool-use loops (call tool → parse result → decide next action) require the more capable model.

4. **Return the reason**: Always return `reason` alongside the routing decision for logging and debugging. This lets you tune the classifier by analyzing misroutes.

5. **Regex over LLM for routing**: Using an LLM to classify which LLM to use defeats the purpose. Regex is free, instant, and deterministic.

## Cost Impact

In a typical industrial monitoring copilot:
- ~60% of queries are simple lookups ("what's zone Z-01 reading?", "list active alarms")
- ~30% are complex ("why is H2 rising in coal mill area?", "compare last shift trends")
- ~10% need tools ("show me the last 4 hours of Z-03", "acknowledge alarm")

Routing 60% to Haiku saves ~50% of total LLM API cost with no quality degradation on those queries.
