---
name: Google OAuth COOP Popup Fix on Vercel
description: Two-stage fix for Google OAuth popup blocked by Cross-Origin-Opener-Policy (COOP) on Vercel — first add permissive headers, then switch to credential-based GoogleLogin component to eliminate popup dependency entirely
type: fix
tags: [google-oauth, vercel, coop, react, typescript]
---

# Google OAuth COOP Popup Fix on Vercel

## Problem

When deploying a React app to Vercel, Google OAuth using `useGoogleLogin()` with `flow: 'implicit'` (or any popup-based flow) fails silently or throws:

```
Cross-Origin-Opener-Policy policy would block the window.postMessage call
```

The popup opens but cannot communicate back to the parent window because Vercel's default COOP headers block cross-origin `postMessage`.

---

## Stage 1 — Add Permissive COOP Headers (vercel.json)

This alone may not fully fix it, but it's a prerequisite:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin-allow-popups"
        },
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "unsafe-none"
        }
      ]
    }
  ]
}
```

**Why `same-origin-allow-popups`:** allows the OAuth popup (opened by Google's domain) to `postMessage` back to the opener without being blocked.

---

## Stage 2 — Switch to `<GoogleLogin>` Component (No Popup)

The more robust fix: replace `useGoogleLogin()` popup flow with the `<GoogleLogin>` button component from `@react-oauth/google`. This renders Google's own button and returns a JWT credential — no popup window to block.

### Installation
```bash
npm install @react-oauth/google
```

### Provider setup (main.tsx / App.tsx)
```tsx
import { GoogleOAuthProvider } from '@react-oauth/google';

<GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
  <App />
</GoogleOAuthProvider>
```

### Component usage
```tsx
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';

// JWT decode helper (no external lib needed)
const decodeJwtPayload = (token: string) => {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
  );
  return JSON.parse(jsonPayload);
};

const handleCredentialSuccess = async (credentialResponse: CredentialResponse) => {
  if (!credentialResponse.credential) return;

  const decoded = decodeJwtPayload(credentialResponse.credential);
  // decoded.email, decoded.given_name, decoded.family_name, decoded.picture

  // Pass the raw JWT as access token to your backend/Supabase
  await authenticateWithGoogle(
    credentialResponse.credential,
    { email: decoded.email, firstName: decoded.given_name || '', lastName: decoded.family_name || '' }
  );
};

// In JSX:
<GoogleLogin
  onSuccess={handleCredentialSuccess}
  onError={() => setError('Google sign-in failed. Please try again.')}
  useOneTap={false}
  theme="outline"
  size="large"
  width="100%"
/>
```

---

## What NOT to do

```tsx
// ❌ This opens a popup — blocked by COOP on Vercel
const login = useGoogleLogin({
  onSuccess: async (tokenResponse) => { ... },
  flow: 'implicit',
});
<button onClick={() => login()}>Sign in with Google</button>
```

---

## Example Domains

| App type | Applies? |
|----------|----------|
| React SPA on Vercel | Yes — primary use case |
| Next.js on Vercel | Partial — use next-auth instead |
| React on Netlify/Railway | Yes — same COOP issue exists |
| Self-hosted (nginx) | Only if nginx sets restrictive COOP headers |

---

## Backend note

If your backend validates Google tokens, the `credential` JWT from `<GoogleLogin>` is a Google-signed ID token (not an access token). Verify it with Google's tokeninfo endpoint or a JWT library, not as an OAuth access token.

```ts
// Supabase: pass as the third-party token
const { data, error } = await supabase.auth.signInWithIdToken({
  provider: 'google',
  token: credentialResponse.credential,
});
```
