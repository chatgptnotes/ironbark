# SVG Icons for HTML-to-PDF Documents

## Skill Metadata
```yaml
name: SVG Icons for HTML-to-PDF Documents
description: Replace emoji HTML entities with inline SVG icons in HTML documents rendered to PDF via headless Chrome — emojis render inconsistently or as boxes in print; inline SVGs render perfectly
version: 1.0.0
tags: [pdf, html, svg, icons, print, proposals, documents]
```

## Problem

Emoji characters (Unicode or HTML entities like `&#128196;`, `&#9889;`, `&#128274;`) render inconsistently when Chrome headless converts HTML to PDF:
- May render as colored emoji (OS-dependent)
- May render as tofu/boxes on some systems
- Look unprofessional in client-facing printed documents

**Rule:** Never use emoji in any document intended for PDF output. Replace every emoji with an inline SVG icon.

## Solution

Use inline SVG paths (Feather Icons style: `viewBox="0 0 24 24"`, stroke-based, `stroke-width="1.8"`) placed directly in the HTML. Use `var(--navy)` or the document's primary color for stroke.

### CSS Pattern

```css
.card-icon { display: block; margin-bottom: 6px; line-height: 1; }
.card-icon svg { display: block; }
```

### SVG Icon Library — Common Document Use Cases

| Use Case | Icon Name | SVG Path |
|----------|-----------|----------|
| Document / Report | file-text | `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>` |
| Bug / Alert / Issue | alert-circle | `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>` |
| Form / Clipboard | clipboard | `<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>` |
| Quick Win / Speed | zap | `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>` |
| Done / Checklist | check-square | `<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>` |
| Documentation / Book | book-open | `<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>` |
| Validation / Success | check-circle | `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>` |
| User / Auth | user-check | `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>` |
| Security / Shield | shield | `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>` |
| Database / SQL | database | `<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>` |
| Server / API | server | `<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>` |
| Lock / Sensitive Data | lock | `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>` |
| Package / Dependency | package | `<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>` |
| Key / HTTPS | key | `<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>` |
| Settings / Gear | settings | `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>` |
| Globe / Network | globe | `<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>` |
| Chart / Analytics | bar-chart | `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>` |

### Usage Pattern

```html
<!-- WRONG — emoji breaks in PDF -->
<span class="card-icon">&#128196;</span>

<!-- CORRECT — inline SVG renders perfectly -->
<span class="card-icon">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
       stroke="var(--navy)" stroke-width="1.8"
       stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
</span>
```

## Example Domains

| Domain | Where this applies |
|--------|--------------------|
| Proposal generation | All proposal/invoice HTML templates rendered to PDF |
| Report generation | HR reports, analytics summaries, financial statements |
| Certificate generation | Training certificates, compliance docs |
| Invoice / quotation | Any billing document with icon cards |
| Contract documents | SLA documents, engagement letters |

## Anti-patterns

- `&#128196;` — emoji HTML entity → renders as colored emoji or box
- `&#9889;` — Unicode symbol → inconsistent rendering across Chrome versions
- Font Awesome via CDN — requires network access; headless Chrome may not load it
- Google Material Icons via CDN — same network dependency issue

## Key Rule

**If the document will be printed or converted to PDF via headless Chrome, every decorative element must be self-contained SVG. No emoji. No icon fonts. No CDN-loaded icon libraries.**
