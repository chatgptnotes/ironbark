---
name: Screenshot-to-Root-Cause Error Diagnosis
description: Decode minified React/production errors from browser screenshots — decode error URLs, trace stack traces, identify the actual component and data flow causing the crash
source_project: ampris-1
projects_used_in: [ampris-1]
tags: [react, debugging, production, error-diagnosis, multimodal]
harvested: 2026-04-04
---

# Screenshot-to-Root-Cause Error Diagnosis

## Problem

Users share browser screenshots of production errors. The errors are minified and the stack traces reference bundled filenames like `index-Cv2HogrL.js:39:6327`. You need to trace this back to the actual source code and root cause.

## Diagnosis Workflow

### Step 1: Decode the Error

React minified errors include a URL with the error code and args:

```
https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object+with+keys+%7Bcode%2C+message%7D
```

Decode the URL params:
- `invariant=31` → React error #31
- `args[]` → URL-decode to get the actual message: "object with keys {code, message}"

Common React errors:
| Code | Meaning |
|------|---------|
| #31 | Objects are not valid as a React child |
| #130 | Element type is invalid (wrong import) |
| #152 | Nothing was returned from render |
| #185 | Maximum update depth exceeded |
| #321 | Cannot update unmounted component |

### Step 2: Identify the Error Boundary

- **"Unexpected Application Error!"** → React Router's default error boundary (no custom `errorElement`)
- **"Something went wrong"** → Custom error boundary
- **White screen** → No error boundary at all

### Step 3: Trace the Component

1. Check which URL/route was loaded (from the browser address bar in the screenshot)
2. Find the route definition in `createBrowserRouter` or route config
3. Identify which component renders at that route
4. Read the component and check all JSX expressions `{variable}` for potential object rendering

### Step 4: Trace the Data Flow

For error #31 ("object rendered as child"), check:
1. All `useState` variables rendered in JSX — can any be set to an object?
2. All API error handlers — do they extract `.error` or `.message` as strings?
3. External data sources (localStorage, URL params, WebSocket) — can they return objects?
4. Proxy/CDN error responses — do they match the expected format?

### Step 5: Match the Object Shape

The error tells you the object's keys (e.g., `{code, message}`). Search for what produces that exact shape:
- `{code, message}` → proxy errors (Vercel, nginx), Zod issues, DOMException
- `{error, code}` → custom API error responses
- `{statusCode, message}` → HTTP framework errors (Express, Fastify)
- `{type, message}` → WebSocket errors, custom events

## Key Insight

The error is often NOT in the component's own code but in how external errors flow into rendered state. Check the full chain: API call → error response → catch block → setState → JSX render.

## When to Apply

- User shares a browser screenshot with a production error
- Error messages reference minified bundle filenames
- React "Minified error" messages in production
