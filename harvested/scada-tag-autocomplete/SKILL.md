---
name: SCADA Tag Autocomplete Component
description: Inline searchable dropdown for selecting PLC/SCADA tags scoped to the active project — fetches once, filters client-side
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, react, scada, autocomplete, dropdown, tag-binding]
---

# SCADA Tag Autocomplete Component

## Problem

SCADA HMI editors need tag binding — linking a visual element to a live PLC tag. Using a plain text input forces users to memorize tag names. Using a full modal is too heavy for a property panel. The right pattern is an inline autocomplete dropdown that fetches project tags once and filters client-side.

## Pattern

```typescript
interface TagAutocompleteProps {
  projectId: string;
  onSelect: (tag: { id: string; name: string; dataType: string }) => void;
  placeholder?: string;
}

function TagAutocomplete({ projectId, onSelect, placeholder }: TagAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch ONCE on mount — not on every keystroke
  useEffect(() => {
    api.get('/tags', { params: { projectId, limit: 500 } })
      .then(res => setTags(res.data));
  }, [projectId]);

  // Filter client-side
  const filtered = tags.filter(t =>
    t.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
}
```

## Key Design Decisions

1. **Fetch once, filter client-side** — avoids debounce complexity and API spam. 500 tags is <50KB
2. **Max 8 results** in dropdown — keeps it compact in a 260px property panel
3. **Show data type badge** (FLOAT/BOOLEAN/INTEGER) — helps users pick the right tag
4. **`onMouseDown preventDefault`** on dropdown items — prevents blur from closing dropdown before click registers
5. **Project-scoped** — only shows tags from the active project, not all tags in the system
6. **Close on outside click** via `document.addEventListener('mousedown')`

## When This Applies

- Any SCADA/HMI editor with tag binding
- IoT dashboards with sensor selection
- Any property panel that needs entity search from a bounded list (<1000 items)
