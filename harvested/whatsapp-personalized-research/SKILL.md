---
name: WhatsApp Personalized Research Before Replying
description: Before replying to any BNI member on WhatsApp, research their company, specialty, city, and prior conversation context. Never send generic replies — every message must reference something specific to that person.
type: pattern
---

# WhatsApp Personalized Research Before Replying

## Rule

Before composing any WhatsApp reply to a BNI member, always:

1. Look up the contact record (name, company, city, specialty, prior notes)
2. Review the conversation history if available
3. Reference at least one specific detail about their work in the reply
4. Never send a generic, copy-paste response

## Why

BNI relationships are built on trust and genuine connection. A generic reply signals you didn't pay attention — it kills rapport. A reply that references their specific niche (e.g., "your PLC/SCADA work", "your AI surveillance products", "your work in medical tech AI") shows you've done your homework and sets the tone for a real referral partnership.

## Workflow

```
1. GET contact details
   - name, company, specialty, city, segment, notes, meeting_date

2. REVIEW prior conversation
   - What did they say last?
   - Have they agreed to a meeting? What was the outcome?
   - Any personal details they shared?

3. CRAFT personalised reply
   - Open with their name
   - Reference their company or specialty specifically
   - Connect it to Dr. Murali's AI consulting angle
   - Be warm and conversational, not salesy

4. SEND & UPDATE
   - Send via WhatsApp
   - Update notes in contacts.json with summary of the exchange
```

## Example — Good vs Bad

**Bad (generic):**
> Hi Pranjal, thanks for connecting! I'd love to set up a BNI 121 with you.

**Good (personalized):**
> Hi Pranjal, great connecting! Your work at Smoketrees on medical tech AI and manufacturing automation is exactly where I see huge opportunities — I've been helping similar companies implement AI-driven predictive systems. Would love to explore how we can refer business to each other on a Zoom 121.

## Contact Fields to Reference

| Field | Use it to... |
|-------|-------------|
| `specialty` | Name their exact niche in your reply |
| `company` | Mention the company by name |
| `city` | Add a local/regional context if relevant |
| `notes` | Reference any prior commitment or context |
| `meeting_date` | Confirm or follow up on the agreed time |
| `segment` | Frame AI value prop correctly (AI/Tech vs Industrial Automation) |

## When to Apply

- Every WhatsApp reply to a BNI member
- Outreach messages (use `get_message_template` which already pulls specialty)
- Follow-ups after a meeting is scheduled
- Reconnect messages after no reply

## Anti-patterns to Avoid

- Do NOT use the same message for multiple contacts
- Do NOT omit the person's specialty or company from the reply
- Do NOT skip reading `notes` — prior conversation context may change the reply entirely
- Do NOT assume the same template works for AI/Tech and Industrial Automation contacts
