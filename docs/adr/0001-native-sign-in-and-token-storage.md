# ADR 0001: Native sign-in as a public client with PKCE

- **Status:** Accepted (recorded retroactively, 2026-10-24)
- **Code:** `src/auth/auth-controller.ts`, `src/auth/auth-runtime.native.ts`,
  `src/auth/token-client.ts`, `src/auth/session-storage.ts`,
  `src/auth/secure-store.native.ts`, `src/auth/id-token.ts`

## Context

Users sign in with personal or work/school Microsoft accounts. The app must
obtain access tokens for the Room Booking API, keep users signed in across
restarts, and never leak a credential. A mobile app's code and bundle are
readable by anyone who installs it, so it cannot hold a secret.

## Decision

- **OAuth 2.0 authorization code flow with PKCE** in the system browser
  (`expo-auth-session`), registered in Entra as a *Mobile and desktop*
  public client with the redirect `roombookingdev://auth`. No client secret.
- **Refresh token** in `expo-secure-store` (Android Keystore / iOS Keychain,
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`), chunked to stay within platform size
  limits. **Access token in memory only.**
- **ID token for display only**; claims checked, signature not. The API
  validates the access token and decides who the user is (`GET /api/me`).
- A **generation counter** binds every request to the session it started in,
  so sign-out or account switches can never send a request as the wrong user.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Embedded WebView login | Discouraged by RFC 8252 and by Microsoft: the app could read the password, and single sign-on with the system browser is lost. |
| A React Native wrapper around Microsoft's MSAL libraries | Community-maintained and native; adds a larger dependency than the standard OAuth flow this app needs, which `expo-auth-session` already provides. |
| Implicit flow | Deprecated; no refresh token; tokens in the redirect URL. |
| Store the access token too | A longer-lived credential on disk for no benefit; renewal takes one request. |
| AsyncStorage for the refresh token | Not encrypted. |

## Consequences

- Positive: no secret exists that could leak; an intercepted authorization
  code is useless without the PKCE verifier; tokens at rest are encrypted by
  the OS.
- Positive: the flow is unit-tested with fakes for the browser, token
  endpoint and storage.
- Negative: sign-in only works in a development or release build, not in Expo
  Go or on web.
- Negative: a release build needs its own redirect URI registration.
- Negative: the real Entra flow can only be verified manually on a device.
