---
name: SVG Sanitization with DOMPurify
description: Replace regex-based SVG sanitizers with DOMPurify SVG profile — regex is trivially bypassable
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, react, security, xss, svg, dompurify]
---

# SVG Sanitization — DOMPurify over Regex

## Problem
Custom regex-based SVG sanitizers are trivially bypassable. Known bypasses include:
- Case variations: `<SCRIPT>`, `<ScRiPt>`
- Encoding tricks: `&#106;avascript:`, `\u006Aavascript:`
- Event handlers with newlines: `on\nload="alert(1)"`
- SVG-specific vectors: `<svg><use href="data:...">`, `<animate>`, `<set>`
- Mutation XSS where browser parsing differs from regex parsing

## Anti-Pattern
```typescript
function sanitizeSvg(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:');
}
```

## Safe Pattern
```bash
npm install dompurify
npm install -D @types/dompurify  # if using TypeScript
```

```typescript
import DOMPurify from 'dompurify';

function sanitizeSvg(markup: string): string {
  return DOMPurify.sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],           // if you need <use> for symbol references
    FORBID_ATTR: ['xlink:href'], // block legacy xlink if not needed
  });
}

// Usage with dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: sanitizeSvg(userSvg) }} />
```

## Why DOMPurify
- Battle-tested (10M+ weekly npm downloads)
- Uses browser's DOM parser — no regex/string mismatch exploits
- SVG-specific profile understands SVG elements and attributes
- Actively maintained against new bypass techniques
- ~7KB gzipped

## When This Applies
- Any user-uploaded SVG content
- HMI/SCADA custom component editors accepting SVG markup
- Rich text editors that allow SVG embedding
- Any `dangerouslySetInnerHTML` with SVG content
