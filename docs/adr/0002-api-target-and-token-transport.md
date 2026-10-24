# ADR 0002: API chosen at bundle time; token transport enforced in the app

- **Status:** Accepted. The token transport rule is on `main`; the switch
  script `scripts/Set-ApiTarget.ps1` is proposed in pull request #9 (Phase 4A).
- **Code:** `src/config/env.ts`, `src/api/http-client.ts`
  (`canSendBearerToken`), `scripts/Set-ApiTarget.ps1`

## Context

The project's local-portability milestone (internally "Phase 4A") requires
that Room Booking keeps working if paid hosting stops: the
same app must be able to talk to an HTTPS-hosted API **or** to the API running
on the owner's PC. A bearer token sent over plain HTTP across a network can be
read and replayed by anyone on that network.

## Decision

- The API address is `EXPO_PUBLIC_API_URL`, inlined into the JavaScript bundle
  by Metro. `Set-ApiTarget.ps1` switches it in `.env.local` between
  `http://localhost:5003` and an HTTPS URL, preserving the Entra settings.
- The app, not the configuration, decides where a token may go
  (`canSendBearerToken`): release bundles over HTTPS only; development bundles
  additionally to loopback and the emulator's `10.0.2.2`. Everything else gets
  no token.
- A physical phone reaches the local API over USB with
  `adb reverse tcp:5003 tcp:5003`, so HTTP stays on loopback at both ends.

## Alternatives considered

| Alternative | Why not (for now) |
| --- | --- |
| In-app server selector at runtime | Needed for release builds, but must be designed carefully: an allow-list or HTTPS-only rule, clearing tokens and organisation state when the server changes, and no phishing via a user-entered URL. Deferred. |
| Allow HTTP to private LAN addresses | Anyone on the Wi-Fi could read the token. |
| Self-signed HTTPS on the PC | The phone must trust the certificate; fragile setup for a fallback scenario. |
| Build-time variants (EAS profiles per environment) | Reasonable for releases, but there is no release pipeline yet. |

## Consequences

- Positive: a misconfigured `.env.local` cannot leak a token; the security
  rule is unit-tested.
- Positive: switching servers in development is one script call plus a Metro
  restart.
- Negative: an installed release build cannot be pointed at another server
  without rebuilding.
- Negative: a release build can only use an API with a trusted HTTPS
  certificate, so "local only" operation needs local HTTPS or stays limited to
  the development build.

## When to revisit

Before the first release build: decide on build variants or a runtime
selector, and how a locally hosted API gets a trusted certificate.
