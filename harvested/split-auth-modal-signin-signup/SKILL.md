---
name: Split Auth Modal — Sign-In vs Sign-Up Mode
description: Single AuthModal component with a `mode` prop that drives distinct UX flows — sign-in rejects new users, sign-up shows details form for new users and fast-tracks existing ones
type: pattern
tags: [react, auth, modal, typescript, ux]
---

# Split Auth Modal — Sign-In vs Sign-Up Mode

## Problem

A combined "Auth" modal that handles both login and registration creates UX confusion:
- Existing users see a "fill in your details" form they already completed
- New users get logged in without creating a profile
- Context-specific prompts (e.g., "Sign in to Download") are impossible with a single mode

## Solution

Pass a `mode: 'signin' | 'signup'` prop and branch behavior after OAuth resolves.

---

## Component Interface

```tsx
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'signin' | 'signup';   // Default: 'signup'
  reason?: 'limit' | 'download' | 'share';  // Drives modal title
  onAuthSuccess?: (userData: any) => void;
}
```

---

## Post-OAuth Branch Logic

```tsx
const handleGoogleSuccess = async (credentialResponse) => {
  const { existingUser, isNewUser, error } = await authenticateWithGoogle(credential);

  if (mode === 'signin') {
    if (isNewUser || !existingUser) {
      // Reject — no account exists
      setError('No account found. Please sign up first.');
      return;
    }
    // Fast-track: log in immediately, skip details form
    setUserLoggedIn(existingUser);
    onAuthSuccess?.(existingUser);
    return;
  }

  // SIGNUP mode: show details form for new users
  // For existing users in signup flow: also show form (lets them update info)
  setGoogleUserInfo(gUserInfo);
  setIsNewUser(isNewUser);
  setStep('user-details');
};
```

---

## Dynamic Title by Mode + Reason

```tsx
const getTitle = () => {
  if (mode === 'signin') {
    return reason === 'download' ? 'Sign In to Download'
         : reason === 'share'    ? 'Sign In to Share'
         : 'Welcome Back';
  }
  return reason === 'download' ? 'Sign Up to Download'
       : reason === 'share'    ? 'Sign Up to Share'
       : 'Create Account';
};
```

---

## Trigger Sites

Call the modal with explicit mode from context:

```tsx
// Navbar "Sign In" button
<button onClick={() => openAuthModal({ mode: 'signin' })}>Sign In</button>

// Gated feature (download button)
<button onClick={() => openAuthModal({ mode: 'signup', reason: 'download' })}>
  Download
</button>

// Usage limit reached
openAuthModal({ mode: 'signup', reason: 'limit' });
```

---

## Auth Steps State Machine

```
'google-signin'
    ↓ (OAuth success)
'loading'
    ↓
signin mode → 'success' (existing user) | error (new user)
signup mode → 'user-details' → 'loading' → 'success' | 'pending-approval'
```

---

## Example Domains

| App type | Pattern applicable? |
|----------|-------------------|
| SaaS with approval-gated signups | Yes — pending-approval step fits naturally |
| Consumer app with instant access | Yes — skip pending-approval, go straight to success |
| App with invite-only registration | Yes — add 'invite-code' step in signup branch |
| SSO-only enterprise app | No — single flow, no signup vs signin distinction |
