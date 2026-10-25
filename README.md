# Room Booking Mobile

[![CI](https://github.com/kris7011/room-booking-mobile/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kris7011/room-booking-mobile/actions/workflows/ci.yml)
[![E2E](https://github.com/kris7011/room-booking-mobile/actions/workflows/e2e.yml/badge.svg?branch=main)](https://github.com/kris7011/room-booking-mobile/actions/workflows/e2e.yml)

A React Native (Expo) client for the
[meeting-room-booking](https://github.com/kris7011/meeting-room-booking)
ASP.NET Core API. Find a free meeting room for a number of people, a day and
a time, and book it from an Android phone or a browser. Optional Microsoft
Entra ID sign-in gives access to organisations and their rooms.

## Screenshots — web demo mode

Actual Room Booking UI captured in Chrome's mobile viewport (390 × 844 CSS pixels),
cropped to remove the browser and DevTools. These are **Expo Web demo-mode**
captures, not screenshots of the native Android build. Data is fictional and
no Microsoft account is signed in.

| Search for a room | Available rooms | Booking form |
| :---: | :---: | :---: |
| <img src="docs/images/search.png" alt="Demo room search with participants, date and time" width="235"> | <img src="docs/images/results.png" alt="Demo search results showing Focus Room and Board Room" width="235"> | <img src="docs/images/booking-form.png" alt="Demo booking form for Focus Room" width="235"> |

Capture provenance and safety guidance: [screenshots documentation](docs/images/README.md).

## Purpose

People who share a set of meeting rooms need to find one that fits the group
and is free at the right time, without double bookings, and without seeing
another organisation's rooms. The API enforces those rules; this app is the
mobile client for it.

The project is also a deliberate exercise in the parts of a mobile app that
are easy to get wrong: native sign-in and token storage, sending tokens only
over safe transports, keeping one organisation's data out of another's
screens, local time versus UTC, and testing against a real backend rather
than mocks alone.

## Key features

- Search for free rooms by number of participants, day (next 14 days) and
  time in 30-minute steps; the smallest fitting room is listed first.
- Booking form with validation that matches the API's rules, and readable
  (Danish) messages for overlapping bookings (409) and validation errors (400).
- A suggested search time that keeps up with the clock, and a booking whose
  start has passed cannot be confirmed ([time handling](docs/time-handling.md)).
- Optional Microsoft Entra ID sign-in on Android and iOS for personal and
  work or school accounts: OAuth 2.0 authorization code flow with PKCE as a
  public client (no secret), refresh token in SecureStore, silent renewal
  ([details](docs/entra-login.md)).
- Organisations for signed-in users: choose the active organisation, create
  one, accept invitations; Owners and Admins manage rooms, members and
  invitations ([details](docs/organisations.md)).
- A clearly labelled demo mode with in-memory data, so the app runs without
  a backend.

The user interface is in Danish; code and documentation are in English.

## Implementation and testing status

| Area | Implemented | Automated tests | Checked by hand |
|---|---|---|---|
| Search and booking without sign-in | Yes | Unit tests; E2E in the web build against the real API | Web: yes. Android: no result recorded |
| Time handling | Yes | Unit tests; E2E with a controlled browser clock | Android checklist not run yet |
| Microsoft Entra sign-in | Android/iOS only | Unit tests with fakes for the browser, Entra and SecureStore | Microsoft sign-in opened on Samsung; a personal Hotmail account was rejected. **No completed login verified** |
| Organisations and administration | Yes, for signed-in users | Unit tests | **Not yet verified on a device** |
| Switching between a local and a hosted API | Development builds only ([details](docs/api-targets.md)) | Script smoke test in CI | Windows PowerShell 5.1 on an isolated copy |
| Android development build | Yes | `app.json` and generated manifest checked in tests | Built and installed on a Samsung SM-A057G; deep link verified. Must be rebuilt after the latest Expo patch update |
| iOS | Shared code only | – | Never built |
| Release builds and store distribution | No | – | – |

The full record of what was verified on the phone, and the open checklists,
is in [docs/device-testing.md](docs/device-testing.md).

## Architecture

```mermaid
flowchart LR
    subgraph mobile["This repository"]
        android["Android app<br/>(Expo development build)"]
        web["Expo web build<br/>(no sign-in)"]
    end
    subgraph server["meeting-room-booking repository"]
        angular["Angular web client<br/>(no sign-in)"]
        api["ASP.NET Core Minimal API<br/>(.NET 10)"]
        db[("SQLite<br/>via EF Core")]
    end
    entra["Microsoft Entra ID"]

    android -- "sign-in: authorization code + PKCE" --> entra
    android -- "REST + bearer token<br/>(HTTPS, or localhost over USB)" --> api
    web -- "REST, anonymous<br/>(API demo mode)" --> api
    angular -- "REST, anonymous<br/>(API demo mode)" --> api
    api -- "validates tokens against<br/>Entra signing keys" --> entra
    api --> db
```

- The **API is the authority**: it validates the access token, identifies the
  user by issuer and object ID, and enforces organisation membership and
  roles. The app never decides who the user is or what they may do.
- **Signed in**, the app calls `/api/organizations/{id}/…` for the active
  organisation. **Signed out** (and always on web), it calls the original
  `/api/rooms` and `/api/bookings`, which the API only serves anonymously in
  its Development-only demo mode. Neither web client has sign-in.

The code structure, sign-in flow and request handling are explained in the
[developer walkthrough](docs/PROJECT_WALKTHROUGH.md).

### What the backend guarantees

Correctness rules are enforced by the API and its database, not by this app.
Summarised from the
[backend walkthrough](https://github.com/kris7011/meeting-room-booking/blob/main/docs/PROJECT_WALKTHROUGH.md),
which links each point to its code and tests:

- **Tenant isolation.** Every organisation endpoint sits under
  `/api/organizations/{organizationId}` behind one route-group filter that
  checks the token, the registered user and membership of that organisation.
  Non-members get `404`, so they cannot tell whether it exists. Roles are read
  from the database on every request, never from the token, and queries are
  also filtered by organisation, so a guessed ID from another organisation is
  "not found".
- **No double bookings, also under concurrency.** The overlap check and the
  insert run in one transaction that takes SQLite's write lock at its start
  (`BEGIN IMMEDIATE`), so two parallel requests cannot both pass the check.
  Database triggers re-check overlaps on every insert and update, and a
  composite foreign key keeps a booking in its room's organisation.
  Integration tests use parallel requests and direct SQL to try to bypass it.
- **Safe retries.** Registration is idempotent per identity (issuer + object
  ID), and creating an organisation honours the `Idempotency-Key` this app
  sends, so a retry after a timeout never creates a duplicate.

## Tech stack

- Expo SDK 58, React Native 0.88, React 19.3, TypeScript 6 (strict)
- expo-auth-session, expo-web-browser, expo-crypto, expo-secure-store for
  sign-in; expo-dev-client for the Android development build
- react-native-web for the browser build
- Node's built-in test runner (`node:test`) for unit and integration tests
- Playwright for end-to-end tests
- GitHub Actions for CI
- Backend ([separate repository](https://github.com/kris7011/meeting-room-booking)):
  ASP.NET Core Minimal API on .NET 10, EF Core 10 with SQLite, Microsoft Entra
  ID token validation, and an Angular web client

## Engineering decisions

1. **Native sign-in as a public client with PKCE.** A mobile app cannot keep
   a secret, so it has none; PKCE binds the authorization code to the app
   instance that requested it. Only the refresh token is persisted, in
   SecureStore (Android Keystore / iOS Keychain); the access token stays in
   memory. The cost is that sign-in needs a development build instead of
   Expo Go. [ADR 0001](docs/adr/0001-native-sign-in-and-token-storage.md)
2. **The API decides identity and access; the app only displays.** The ID
   token is used for display only; the app asks `GET /api/me` who the user
   is. Role-based buttons are a convenience, not authorization. Every
   organisation request names the organisation in its URL, the booking area
   is re-created per organisation, and every request is bound to the session
   it started in, so a sign-out or account switch can never send it as
   someone else.
3. **Token transport is enforced in code, not configuration.**
   `canSendBearerToken` sends tokens over HTTPS only in a release bundle, and
   additionally to loopback addresses in a development bundle (for
   `adb reverse` over USB). A wrong `.env.local` therefore cannot leak a token
   over Wi-Fi. The API address is fixed at bundle time, so switching servers
   needs a Metro restart or a new build.
   [ADR 0002](docs/adr/0002-api-target-and-token-transport.md)
4. **Framework-free core logic with injected dependencies.** The sign-in
   state machine, the organisation controller and the HTTP client import
   neither React nor Expo. They run under Node's test runner with fakes,
   which makes race conditions (sign-out during a token refresh, for
   example) testable deterministically and keeps the suite fast on modest
   hardware. The trade-off is more wiring code and no component tests.
5. **End-to-end tests against the real API and a throwaway database.**
   Mocks can drift from the backend's real behaviour. The E2E suite builds
   and starts the actual .NET API on a new SQLite file per run, exports the
   web app, and drives it in Chromium with a frozen clock; CI checks out the
   backend repository to do the same. It is slower and covers the web build
   only, which is why device checklists remain.

## Testing and CI

| Check | Command | Runs in CI |
|---|---|---|
| Type checking (app, tests, E2E) | `npm run typecheck` | `ci.yml` |
| Unit and integration tests | `npm test` | `ci.yml` |
| Dependency versions against Expo SDK 58 | `npx expo-doctor` | `ci.yml` |
| API target script smoke test | – | `ci.yml` (PowerShell 7) |
| End-to-end tests (web build, real API, SQLite) | `npm run test:e2e` | `e2e.yml` |

Both workflows run on every pull request and on pushes to `main`. What each
layer covers, and what is deliberately not automated, is described in
[docs/testing.md](docs/testing.md).

## Quickstart

Prerequisites: Node.js 24 and npm.

```bash
git clone https://github.com/kris7011/room-booking-mobile.git
cd room-booking-mobile
npm ci
npm run web        # demo mode: in-memory data, no backend needed
```

Against the real API (requires the .NET 10 SDK and the
[meeting-room-booking](https://github.com/kris7011/meeting-room-booking)
repository):

```powershell
# In meeting-room-booking: the web build has no sign-in, so enable the API's demo mode
$env:LegacyApi__AllowAnonymous = "true"
dotnet run --project .\src\MeetingRoomBooking.Api\MeetingRoomBooking.Api.csproj --launch-profile http

# In this repository
Copy-Item .env.example .env.local   # sets EXPO_PUBLIC_API_URL=http://localhost:5003
npm run web
```

Microsoft sign-in requires the Android development build and an Entra app
registration: see [android-development-build.md](docs/android-development-build.md)
and [entra-login.md](docs/entra-login.md). More commands and per-device API
addresses are in [local-development.md](docs/local-development.md).

## Documentation

| Document | Contents |
|---|---|
| [Developer walkthrough](docs/PROJECT_WALKTHROUGH.md) | Architecture, sign-in, API calls, organisations, testing strategy, design decisions |
| [Architecture decision records](docs/adr/README.md) | Sign-in and token storage; API selection and token transport |
| [Local development](docs/local-development.md) | Demo and live mode, API addresses per device, commands, project structure |
| [Microsoft Entra sign-in](docs/entra-login.md) | How sign-in works, configuration, Entra app registration, troubleshooting |
| [Organisations](docs/organisations.md) | Organisation features and how stale data is avoided |
| [Time handling](docs/time-handling.md) | Suggested versus chosen times, passed start times, time zones |
| [Testing and CI](docs/testing.md) | Unit tests, E2E tests and their isolated database, CI workflows |
| [Android development build](docs/android-development-build.md) | Windows toolchain setup, building, deep links |
| [Device testing](docs/device-testing.md) | What was verified on a phone, sign-in over USB (`adb reverse`), manual checklists |
| [Local and hosted API](docs/api-targets.md) | Switching a development build between a local and an HTTPS-hosted API |
| [Backend integration](docs/backend-integration.md) | Running against the API in a browser; integration results from 19 October 2026 |
| [Dependency advisories](docs/security-advisories.md) | The current `npm audit` findings and why they do not reach the app bundle |

The backend is documented in its own repository: [README](https://github.com/kris7011/meeting-room-booking)
and [walkthrough](https://github.com/kris7011/meeting-room-booking/blob/main/docs/PROJECT_WALKTHROUGH.md).

## Known limitations

- **Device verification is incomplete.** Microsoft's login page opened on
  Samsung, but the Hotmail attempt was rejected as a personal account. A
  completed sign-in, signed-in organisation screens and mobile booking remain
  unverified. The development build needs rebuilding before the next full
  device test. See [device-testing.md](docs/device-testing.md).
- **iOS has never been built.**
- **No release builds.** There is no `eas.json`, release package ID, signing
  setup, release redirect URI or store configuration. The API address is
  fixed when the bundle is built; there is no in-app server selection.
- **No browser sign-in.** Web clients use the API's anonymous,
  Development-only demo mode.
- **No component tests and no ESLint configuration.** Components are
  exercised only through the web build in E2E.
- **No offline mode**, and sign-in needs internet access to Microsoft even
  when the API runs locally.
- **`npm audit` reports 5 high-severity findings** in the Expo CLI tooling.
  They are not in the app bundle, and the only automatic fix is an SDK
  downgrade. See [security-advisories.md](docs/security-advisories.md).

## How this project was built

The app was developed with AI assistance (Claude Code). Most commits carry a
`Co-Authored-By: Claude` trailer; a commit without one is not necessarily
written without AI help. Every change goes through the
same checks: type checking, the automated test suites, CI, and manual device
checks where they are recorded. See the
[walkthrough](docs/PROJECT_WALKTHROUGH.md#12-how-this-project-was-built).

## License

MIT, see [LICENSE](LICENSE).

The project started from Expo's `blank-typescript` template, whose MIT
copyright notice (650 Industries, Inc.) is kept in `LICENSE`: `index.ts` and
the images in `assets/` are unchanged from it, and `app.json`, `tsconfig.json`
and `.gitignore` started from it. npm dependencies carry their own licenses.
