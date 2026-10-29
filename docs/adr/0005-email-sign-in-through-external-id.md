# ADR 0005: E-mail sign-in through Microsoft Entra External ID

- **Status:** Accepted. Implemented, unit-tested and run against a real
  external tenant on 29 October 2026 ([results](../external-id-login.md#results-29-october-2026)).
- **Code:** `src/auth/external-id-config.ts`, `authorize-request.ts`,
  `id-token.ts`, `auth-controller.ts`, `auth-runtime.native.ts`,
  `session-storage.ts`, `components/AccountPanel.tsx`

## Context

The architecture plan of 21 October 2026 has two ways to sign in: Microsoft
accounts through Entra ID (implemented, [ADR 0001](0001-native-sign-in-and-token-storage.md))
and an e-mail address with a one-time code through Entra External ID. The
external tenant has its own authority (`ciamlogin.com`), app registrations and
issuer. The API accepts both issuers with a scheme each (backend ADR 0008).

## Decision

- **Browser-delegated sign-in with the same AuthRequest and token client**,
  only with the external tenant's endpoints, client ID and API scope. Not
  Microsoft's native authentication (in-app UI): it needs an extra SDK and
  native code, and the system browser keeps the code entry on Microsoft's
  page.
- **Providers behind one interface.** `AuthProviderClient` (authorize, redeem,
  refresh, read the ID token) per provider; `AuthController` keeps one
  session and renews it with the provider that created it. Everything else
  (generations, storage queue, renewal sharing) is unchanged.
- **The provider is stored with the session**; a session without one is a
  Microsoft session from before this change, so the existing sign-in on the
  phone survives the update.
- **`prompt=login` for the e-mail page**, so a new code is asked for after
  *Log ud*. Microsoft keeps `prompt=select_account`.
- **Optional and isolated.** E-mail sign-in appears only with valid settings
  and never turns Microsoft sign-in off.

## Alternatives considered

- **Two AuthControllers**, one per provider: two sessions could be live at
  once, and every request would have to choose; one session is simpler and
  matches "one person signed in".
- **A provider field read from the API (`GET /api/me`)** instead of storing
  it: the app needs the provider before it has a token, to renew the session.
- **MSAL React Native:** a third-party wrapper with native modules; the app
  already has a tested PKCE flow on expo-auth-session.

## Consequences

- The same development build serves both providers; only `.env.local`
  changes. The redirect URI must be registered in both tenants.
- A person who uses both is two Room Booking users until the identities are
  linked explicitly (separate change).
- Nothing about External ID's real pages, tokens or claims is verified until
  the tenant exists.
