---
name: excel-matrix-to-react-lookup
description: Convert a multi-dimensional Excel combination matrix into a JS lookup table and React UI card, dynamically driven by algorithm/API output scores.
tags: [react, data-transform, lookup-table, dynamic-ui, scoring]
---

# Excel Matrix → React Dynamic Lookup Card

## Problem

A domain expert provides an Excel file with N-parameter × M-level combinations (e.g. 3 params × 3 levels = 27 rows), each row mapping to a unique care/recommendation protocol. The app has an existing static UI that needs to become data-driven based on real algorithm output scores.

## Solution Pattern

### Step 1 — Encode the lookup table as a JS object

```js
// src/utils/domainCombinations.js
const COMBINATIONS = {
  'L-L-L': { code: 'L-L-L', severity: 21, priority: 'HIGH', description: '...', recommendation1: '...', recommendation2: '...' },
  'L-L-M': { ... },
  // ... all N^M rows
};
export default COMBINATIONS;
```

Key decisions:
- Key by the combination code string (`'L-L-M'`) for O(1) lookup
- Reference data is hardcoded here — it's a lookup table, not live data, so hardcoding is correct
- One object per combination, flat structure, no nesting

### Step 2 — Write a lookup utility with composite score computation

```js
// src/utils/protocolLookup.js
import COMBINATIONS from './domainCombinations';

// If parameters are composites of sub-scores, define the matrix
const COMPOSITE_MATRIX = {
  'L-L': 'L', 'L-M': 'L', 'L-H': 'M',
  'M-L': 'L', 'M-M': 'M', 'M-H': 'H',
  'H-L': 'M', 'H-M': 'H', 'H-H': 'H',
};

// Normalize algorithm classification strings to L/M/H
const normalizeLevel = (classification) => {
  if (!classification) return null;
  const c = classification.toLowerCase().trim();
  if (c === 'low' || c === 'mild') return 'L';
  if (c === 'medium' || c === 'moderate') return 'M';
  if (c === 'high' || c === 'severe') return 'H';
  return null;
};

// Fallback: derive from rawScore ('score/max' format, score 0-3)
const levelFromRawScore = (rawScore) => {
  if (!rawScore) return null;
  const score = parseInt(rawScore.split('/')[0], 10);
  if (isNaN(score)) return null;
  if (score <= 1) return 'L';
  if (score === 2) return 'M';
  return 'H';
};

const findParam = (data, names) =>
  data.find((item) => {
    if (!item?.parameter) return false;
    const p = item.parameter.toLowerCase();
    return names.some((n) => p.includes(n.toLowerCase()));
  });

export const getProtocol = (algorithmResultsArray) => {
  if (!Array.isArray(algorithmResultsArray) || algorithmResultsArray.length === 0) return null;

  const level = (item) => normalizeLevel(item?.classification) || levelFromRawScore(item?.rawScore);

  const param1 = level(findParam(algorithmResultsArray, ['param1', 'param1-alias']));
  const param2 = level(findParam(algorithmResultsArray, ['param2']));
  const param3 = level(findParam(algorithmResultsArray, ['param3']));

  // Optional: composite scoring (if P1 = f(subA, subB))
  const subA = level(findParam(algorithmResultsArray, ['sub-a']));
  const subB = level(findParam(algorithmResultsArray, ['sub-b']));
  const p1 = subA && subB ? COMPOSITE_MATRIX[`${subA}-${subB}`] : param1;

  if (!p1 || !param2 || !param3) return null;

  const code = `${p1}-${param2}-${param3}`;
  const combo = COMBINATIONS[code];
  if (!combo) return null;

  return { ...combo, inputs: { p1, param2, param3 } };
};
```

### Step 3 — Render a dynamic card in the React component

Insert the card inside the existing section using an IIFE to avoid new state:

```jsx
{/* Dynamic protocol card — only shown when algorithm data exists */}
{(() => {
  const protocol = getProtocol(algorithmResults?.data);
  if (!protocol) return null;

  const priorityStyle = {
    CRITICAL: 'bg-red-600',
    HIGH:     'bg-orange-500',
    MODERATE: 'bg-amber-500',
    OPTIMAL:  'bg-emerald-500',
  };

  const modalities = [
    { icon: '🔹', label: 'Recommendation 1', value: protocol.recommendation1 },
    { icon: '🔸', label: 'Recommendation 2', value: protocol.recommendation2 },
  ];

  return (
    <div className="rounded-xl shadow-lg border overflow-hidden">
      <div className={`${priorityStyle[protocol.priority]} px-4 py-3 flex items-center justify-between`}>
        <div>
          <span className="text-white font-bold">{protocol.priority} Priority</span>
          <span className="ml-2 bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-mono">{protocol.code}</span>
        </div>
        <div className="text-white font-bold">{protocol.severity}/30</div>
      </div>
      <div className="p-4 bg-gray-50">
        <p className="text-sm text-gray-700 italic">"{protocol.description}"</p>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {modalities.map((m, i) => (
          <div key={i} className="flex items-start space-x-2 p-3 bg-white rounded-lg border">
            <span>{m.icon}</span>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">{m.label}</div>
              <p className="text-sm font-medium whitespace-pre-line">{m.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
})()}
```

## Key Design Decisions

| Decision | Why |
|----------|-----|
| IIFE pattern in JSX | Avoids new state/useEffect; card is derived from existing `algorithmResults` state |
| `null` return when no data | Existing UI shows unchanged — graceful degradation |
| `classification` + `rawScore` fallback | Algorithm data format varies; dual-path ensures robustness |
| Flat lookup object keyed by code string | O(1) lookup, easy to audit, no runtime computation |
| Composite matrix as plain object | Readable, testable, no library needed |

## Example Domains

| Domain | Parameters | Combination Source |
|--------|------------|-------------------|
| Healthcare / neuro | Cognition + Stress/Burnout + Emotional Reg | KSB NSB 27-combination protocol |
| Fitness | Strength + Cardio + Flexibility | Training program matrix |
| Nutrition | Macros + Micronutrients + Hydration | Diet plan matrix |
| Education | Reading + Math + Attention | Learning intervention matrix |
| Finance | Income + Expenses + Savings | Financial planning protocol |

## Pitfalls

- **Classification strings vary**: always normalize with a map that handles synonyms (`low`/`mild` → `L`)
- **Missing parameters**: check all required params are non-null before building the code string
- **Array vs object format**: `algorithmResults.data` may be an array or object — handle both
- **Don't hardcode in the component**: keep the lookup table in a separate `utils/` file for testability
