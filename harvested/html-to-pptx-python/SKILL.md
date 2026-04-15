---
name: HTML-to-PPTX Programmatic Generation
description: Generate professional PowerPoint presentations (.pptx) programmatically using python-pptx — build slides with shapes, colored cards, code blocks, flow diagrams, tables, and team cards from pure Python, no template needed.
type: pattern
tags: [pptx, python-pptx, presentation, slides, pdf, training, report]
---

# HTML-to-PPTX Programmatic Generation

## Problem

You need professional slide decks (PPTX) generated programmatically — either from existing HTML content, structured data, or from scratch. You want:
- Consistent styling across all slides
- Real `.pptx` format (editable in PowerPoint/Keynote/Google Slides)
- No dependency on a running browser or Puppeteer

## Solution

Use `python-pptx` to build slides from scratch in Python. Define reusable helper functions for common elements (cards, numbered rows, code blocks, flow steps) and call them per slide.

---

## Install

```bash
pip install python-pptx
# or on externally-managed Python (macOS Homebrew):
pip install python-pptx --break-system-packages
```

---

## Core Setup Pattern

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

prs = Presentation()
prs.slide_width  = Inches(13.33)   # 16:9 widescreen
prs.slide_height = Inches(7.5)

blank = prs.slide_layouts[6]       # completely blank layout
```

---

## Essential Helper Functions

```python
def add_rect(slide, x, y, w, h, fill=None, line=None):
    """Add a colored rectangle."""
    shape = slide.shapes.add_shape(1, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.line.fill.background()
    if fill:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
    else:
        shape.fill.background()
    if line:
        shape.line.color.rgb = line
        shape.line.width = Pt(1)
    else:
        shape.line.fill.background()
    return shape

def add_text(slide, text, x, y, w, h, size=18, bold=False, color=None,
             align=PP_ALIGN.LEFT, wrap=True, italic=False):
    """Add a text box."""
    if color is None:
        color = RGBColor(0x1a, 0x1a, 0x2e)
    txb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    txb.word_wrap = wrap
    tf = txb.text_frame
    tf.word_wrap = wrap
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    return txb

def slide_header(slide, title, subtitle="", accent=None):
    """Add a colored header bar with title and subtitle."""
    if accent is None:
        accent = RGBColor(0x0f, 0x34, 0x60)
    add_rect(slide, 0, 0, 13.33, 1.5, fill=accent)
    add_text(slide, title,    0.4, 0.18, 12.5, 0.75, size=28, bold=True,
             color=RGBColor(0xff,0xff,0xff))
    if subtitle:
        add_text(slide, subtitle, 0.4, 0.88, 12.5, 0.45, size=13,
                 color=RGBColor(0xff,0xff,0xff), italic=True)

def num_row(slide, num, text, x, y, num_color=None, size=13):
    """Numbered bullet row with colored circle."""
    if num_color is None:
        num_color = RGBColor(0xe9,0x45,0x60)
    add_rect(slide, x, y, 0.32, 0.32, fill=num_color)
    add_text(slide, str(num), x+0.04, y+0.03, 0.26, 0.28, size=10, bold=True,
             color=RGBColor(0xff,0xff,0xff), align=PP_ALIGN.CENTER)
    add_text(slide, text, x+0.42, y, 5.2, 0.38, size=size,
             color=RGBColor(0x37,0x41,0x51), wrap=True)

def card(slide, x, y, w, h, fill=None, border=None):
    """Rounded-looking card (rectangle with border)."""
    if fill is None:
        fill = RGBColor(0xf1,0xf5,0xf9)
    return add_rect(slide, x, y, w, h, fill=fill,
                    line=border or RGBColor(0xd1,0xd5,0xdb))

def flow_step(slide, steps_with_colors, start_x, start_y, box_w=2.2, box_h=0.45):
    """Vertical flow diagram with arrows between steps."""
    for i, (color, label) in enumerate(steps_with_colors):
        add_rect(slide, start_x, start_y + i*(box_h+0.3), box_w, box_h, fill=color)
        add_text(slide, label, start_x+0.1, start_y + i*(box_h+0.3)+0.06,
                 box_w-0.2, box_h-0.1, size=11, bold=True,
                 color=RGBColor(0xff,0xff,0xff))
        if i < len(steps_with_colors)-1:
            add_text(slide, "↓",
                     start_x + box_w/2 - 0.1,
                     start_y + i*(box_h+0.3) + box_h + 0.02,
                     0.3, 0.28, size=14,
                     color=RGBColor(0x9c,0xa3,0xaf), align=PP_ALIGN.CENTER)
```

---

## Slide Example — Cover Slide

```python
sl = prs.slides.add_slide(blank)
NAVY  = RGBColor(0x0f, 0x34, 0x60)
RED   = RGBColor(0xe9, 0x45, 0x60)
WHITE = RGBColor(0xff, 0xff, 0xff)

add_rect(sl, 0, 0, 13.33, 7.5, fill=NAVY)
add_rect(sl, 0, 6.8, 13.33, 0.7, fill=RED)
add_text(sl, "DAY 1 OF 7", 0.5, 0.5, 4.0, 0.4, size=11, bold=True,
         color=RGBColor(0xa8,0xd8,0xea))
add_text(sl, "Foundation Day", 0.5, 1.1, 8.0, 1.0, size=42, bold=True, color=WHITE)
add_text(sl, "Python · Git · SSH · VPS", 0.5, 2.1, 8.0, 0.5, size=16, color=WHITE)
```

---

## Slide Example — Dark Code Slide

```python
sl = prs.slides.add_slide(blank)
DARK = RGBColor(0x1e, 0x29, 0x3b)
add_rect(sl, 0, 0, 13.33, 7.5, fill=DARK)
slide_header(sl, "Git Commands Cheat Sheet", accent=RGBColor(0x0f,0x17,0x2a))

code_bg = RGBColor(0x1e, 0x29, 0x3b)
card(sl, 0.4, 2.0, 6.0, 4.5, fill=code_bg, border=RGBColor(0x33,0x41,0x55))
add_text(sl, "git clone https://github.com/org/repo.git\ngit checkout -b feature-branch",
         0.6, 2.15, 5.7, 4.2, size=11,
         color=RGBColor(0x86,0xef,0xac), wrap=False)
```

---

## Save

```python
prs.save("/path/to/output.pptx")
```

---

## Key Coordinates System

- Slide is 13.33 × 7.5 inches (16:9)
- All coordinates in `Inches(x)` from top-left corner
- Header typically occupies y=0 to y=1.5
- Content area: y=1.65 to y=6.8
- Footer/slide number: y=7.1

---

## Example Domains

| Use Case | Approach |
|----------|---------|
| Training slides | One slide per topic, helper functions for consistency |
| Weekly reports | Data-driven slides from database/CSV |
| Proposal decks | Cover + agenda + content + CTA pattern |
| Product demos | Screenshot placeholders + bullet cards |
| Intern onboarding | Day-by-day slides with code blocks + team cards |
