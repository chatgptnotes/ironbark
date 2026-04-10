---
name: React Error Object Rendering Guard
description: Prevent React error #31 when API proxy/intermediary returns {code, message} objects instead of {error: string} — always coerce error state to string before rendering in JSX
source_project: ampris-1
projects_used_in: [ampris-1]
tags: [react, error-handling, vercel, proxy, typescript]
harvested: 2026-04-04
---

# React Error Object Rendering Guard

## Problem

React error #31: "Objects are not valid as a React child (found: object with keys {code, message})".

When a React app proxies API calls through Vercel rewrites, Cloudflare, nginx, or any intermediary, the error response format can differ from the backend's format. Common proxy error shapes:

- Vercel: `{code: "FUNCTION_INVOCATION_FAILED", message: "..."}`
- Cloudflare: `{code: 502, message: "Bad Gateway"}`
- nginx: `{statusCode: 502, message: "..."}`

If frontend code does `err.response?.data?.error || 'fallback'` and the proxy returns `{code, message}` (no `error` key), the fallback string is used — safe. But if it returns `{error: {code, message}}`, the object becomes the error state and crashes React when rendered as `{error}` in JSX.

## Pattern

Create a type-safe error extraction helper:

```typescript
function extractErrorMsg(err: any, fallback: string): string {
  const data = err?.response?.data;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.message === 'string') return data.message;
  if (typeof err?.message === 'string') return err.message;
  return fallback;
}
```

### Usage

```typescript
// BEFORE — unsafe, object could leak into state
catch (err: any) {
  setError(err.response?.data?.error || 'Login failed');
}

// AFTER — always returns a string
catch (err: any) {
  setError(extractErrorMsg(err, 'Login failed'));
}
```

## Also Add: Route Error Boundary

React Router's default error boundary tries to render the raw error object, which itself can trigger error #31. Always add a custom `errorElement`:

```tsx
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';

function RouteErrorBoundary() {
  const error = useRouteError();
  let message = 'An unexpected error occurred.';
  if (isRouteErrorResponse(error)) {
    message = error.statusText || error.data?.message || message;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }
  // render message (always a string) with retry button
}
```

## When to Apply

- Any React app with API calls through a proxy/CDN
- Any `setError()` or `setMessage()` pattern where the value is rendered in JSX
- Any `createBrowserRouter` setup without custom `errorElement`

## Detection Checklist

Look for these unsafe patterns:
- `setError(err.response?.data?.error || 'fallback')` — unsafe if `.error` could be an object
- `setError(err.response?.data?.message || 'fallback')` — unsafe if `.message` could be an object
- `{error}` rendered in JSX where `error` comes from an API catch block
- `createBrowserRouter([...])` without `errorElement` on routes
