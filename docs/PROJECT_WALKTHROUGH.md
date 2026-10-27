# Room Booking Mobile – Developer Walkthrough

This document explains the mobile client from a developer's perspective: how
it is structured, how sign-in and API calls work, why it is built this way,
and where its limits are. It describes the code as it is, and links to the
source.

The API, database, authorization model and backup tooling are explained in
the backend walkthrough:
[meeting-room-booking/docs/PROJECT_WALKTHROUGH.md](https://github.com/kris7011/meeting-room-booking/blob/main/docs/PROJECT_WALKTHROUGH.md).

**Status labels used throughout**

| Label | Meaning |
| --- | --- |
| **[Tested]** | Implemented and covered by automated tests that run in CI. |
| **[Manual]** | Implemented; verified only by hand on a device, or not verified at all. |
| **[In review]** | Implemented on an open pull request, not yet on `main`. |
| **[Not implemented]** | Proposed or future work. Nothing in the code does this yet. |

Last reviewed: 2026-10-26 (phase 5A, issue #18): device results from the
Samsung on 26 October, separated into owner reports and independently logged
checks in [device-testing.md](device-testing.md#current-status).

**Related documents:** [local development](local-development.md) ·
[Microsoft Entra sign-in](entra-login.md) · [organisations](organisations.md) ·
[time handling](time-handling.md) · [testing and CI](testing.md) ·
[Android development build](android-development-build.md) ·
[device testing](device-testing.md) · [local/hosted API](api-targets.md) ·
[dependency advisories](security-advisories.md) · [ADRs](adr/README.md)

---

## 1. What the app does

A member of an organisation opens the app, signs in with a Microsoft account,
picks the number of participants, a day and a time, sees the free rooms with
the smallest fitting room first, and books one. Owners and Admins can also
manage rooms, members and invitations. The user interface is in Danish; code
and documentation are in English.

The app has three operating modes:

| Mode | When | Data |
| --- | --- | --- |
| Demo | `EXPO_PUBLIC_API_URL` not set | In-memory fake API (`src/api/demo-api.ts`), clearly labelled |
| Live, signed out | API URL set, nobody signed in (always on web) | Original `/api/rooms` and `/api/bookings` only when the backend's Development-only anonymous demo mode is enabled; otherwise the API requires sign-in |
| Live, signed in | Android/iOS development build, signed in and registered | `/api/organizations/{id}/…` of the active organisation |

## 2. Structure

```text
App.tsx                    Providers only: SafeArea → AuthProvider → SessionProvider → AppScreens
src/
  config/                  env.ts (EXPO_PUBLIC_API_URL), build.ts (__DEV__)
  auth/                    Microsoft sign-in: AuthController, token client, ID token, SecureStore session
  api/                     http-client.ts (fetch, tokens, errors), live/demo/organisation API clients
  organizations/           OrganizationController, SessionProvider, permissions, invitation links
  screens/                 AppScreens (booking ↔ administration), HomeScreen, OrganizationAdminScreen
  components/              Presentational components; admin/ and organizations/ sub-folders
  models/                  TypeScript types mirroring the API contracts
  hooks/, utils/           Clock, date/time, search window, room fit
tests/                     Node test runner (node:test), mirrors src/
e2e/                       Playwright tests of the web build against the real .NET API
scripts/Set-ApiTarget.ps1  Switch the development build between local and hosted API [Manual]
```

Navigation is plain React state (`AppScreens` switches between two screens),
not Expo Router: the app has two pages and no deep navigation hierarchy.

**Logic without React.** The parts that carry the risk (`AuthController`,
`OrganizationController`, `http-client.ts`, `session-storage.ts`) import
neither React nor Expo. Their dependencies (storage, token endpoint, API) are
passed in, so the Node test runner exercises them with fakes. React
components are thin wrappers (`AuthProvider`, `SessionProvider`).

## 3. Technologies

| Technology | Responsibility |
| --- | --- |
| Expo SDK 58, React Native, React, TypeScript (strict) | The app, Android/iOS/web from one code base |
| expo-auth-session, expo-web-browser, expo-crypto | Authorization code flow with PKCE in the system browser |
| expo-secure-store | Refresh token storage (Android Keystore / iOS Keychain) |
| expo-dev-client | The Android development build used on the physical device |
| react-native-web | The browser build, used by the E2E tests |
| `node:test` | Unit and integration tests of the logic (`npm test`) |
| ESLint 9 + `eslint-config-expo` 58 | Static checks (`npm run lint`, flat config in `eslint.config.js`) |
| Playwright | End-to-end tests of the web build against the real API |
| GitHub Actions | Typecheck, lint, tests, Expo Doctor, E2E |

## 4. Sign-in

Code: [`auth-controller.ts`](../src/auth/auth-controller.ts),
[`auth-runtime.native.ts`](../src/auth/auth-runtime.native.ts),
[`token-client.ts`](../src/auth/token-client.ts),
[`id-token.ts`](../src/auth/id-token.ts),
[`session-storage.ts`](../src/auth/session-storage.ts),
[`secure-store.native.ts`](../src/auth/secure-store.native.ts).

```mermaid
sequenceDiagram
    participant U as User
    participant A as App (AuthController)
    participant B as System browser
    participant E as Microsoft Entra ID
    participant API as Room Booking API

    U->>A: "Log ind med Microsoft"
    A->>B: /authorize (PKCE S256 challenge, state)
    B->>E: user signs in and consents
    E-->>A: roombookingdev://auth?code&state
    A->>A: state must match
    A->>E: /token (code + code_verifier, no secret)
    E-->>A: access, refresh and ID token
    A->>A: refresh token → SecureStore, access token → memory
    A->>API: GET /api/me (Bearer)
    API-->>A: user, or null
    A->>API: POST /api/me/registration (only if null)
```

- **Public client with PKCE.** A mobile app cannot keep a secret, so there is
  none. PKCE binds the authorization code to this app instance: an
  intercepted code is useless without the code verifier. **[Tested]** with a
  fake token endpoint. **[Manual]** against real Entra: a personal-account
  sign-in completed in the Android development build on 26 October 2026; work
  or school accounts not tried (see
  [section 7](#still-requires-the-physical-android-device)).
- **Where tokens live.** Only the refresh token is persisted, in SecureStore
  (`WHEN_UNLOCKED_THIS_DEVICE_ONLY` on iOS), split into chunks of at most
  1,800 characters because some platforms reject large values. The access
  token stays in memory. **[Tested]** with an in-memory store.
- **The ID token is for display only.** `id-token.ts` checks audience,
  issuer, expiry and `oid`, but not the signature (OpenID Connect allows this
  when the token comes directly from the token endpoint over TLS). Nothing in
  the app grants access based on it; the API decides who the user is.
- **Renewal.** `getAccessGrant()` returns the access token if it is valid for
  at least 2 more minutes (`ACCESS_TOKEN_RENEWAL_MARGIN_MS`), otherwise it
  refreshes. Parallel requests share one refresh (`refreshInFlight`).
- **No request changes identity.** Every sign-in and sign-out increments a
  `generation` counter. A grant remembers its generation (`isCurrent()`), and
  `http-client.ts` checks it right before `fetch`. A request that started as
  user A is never sent as user B or anonymously after a sign-out. **[Tested]**
- **Availability.** Sign-in is off on web and in Expo Go, because the
  redirect `roombookingdev://auth` only reaches the development build
  (`auth-availability.ts`).

## 5. Calling the API

Code: [`http-client.ts`](../src/api/http-client.ts).

- `requestJson` builds the URL from `EXPO_PUBLIC_API_URL`, attaches the token
  when allowed, applies a 10-second timeout and turns every failure into one
  `ApiError` type (`network`, `timeout`, `http`, `invalid-response`,
  `not-configured`, `auth`), so screens need a single error branch.
- On `401` it renews the token once and retries once, still bound to the
  original session.
- Problem Details from the API are parsed, and `error-messages.ts` maps them
  to Danish messages using the API's stable `code` values.

### Where a token may be sent [Tested]

`canSendBearerToken(url, { development })` is the security boundary for
transport:

| Bundle | Token sent to |
| --- | --- |
| Release | `https://` only |
| Development (`__DEV__`) | `https://`, plus `http://` to `localhost`, `127.0.0.0/8`, `::1` and `10.0.2.2` (Android emulator) |

Anything else, including `http://192.168.x.x` on Wi-Fi, gets **no token**: the
request is sent anonymously and the token is not even renewed for it. The rule
is in the app, so it holds whatever `.env.local` contains. On a physical
phone, `adb reverse tcp:5003 tcp:5003` makes the phone's `localhost:5003` the
PC's `localhost:5003` over USB, so the token never crosses a network.

### Choosing the API [Tested]

The whole decision is made in [`src/config/env.ts`](../src/config/env.ts), from
one value:

1. Metro reads `.env.local` when it starts and **inlines**
   `process.env.EXPO_PUBLIC_API_URL` into the JavaScript bundle as a string
   literal. Only that static dot notation is replaced, which is why `env.ts`
   reads it exactly that way and nowhere else.
2. `env.ts` trims it and strips trailing slashes → `apiBaseUrl`. Empty or
   unset → `apiBaseUrl = null` → `isDemoMode = true`, and the app uses the
   in-memory demo API (`ApiModeBanner` labels it).
3. `buildUrl` in `http-client.ts` prefixes every path with `apiBaseUrl`.
   `canSendBearerToken` (above) then decides per request whether the token may
   go along: HTTPS always, plain HTTP only to loopback in a development bundle.

`scripts/Set-ApiTarget.ps1` changes only the `EXPO_PUBLIC_API_URL` line in
`.env.local` and leaves the Entra settings alone: `-Mode Local` →
`http://localhost:5003`, `-Mode Hosted -HostedUrl https://…` (HTTP,
credentials, query strings and fragments are rejected; duplicates of the key
are refused without writing). Because the value is inlined, **Metro must be
restarted with `--clear`** afterwards, and an installed release build can never
switch servers; see [ADR 0002](adr/0002-api-target-and-token-transport.md).

The two layers are deliberately separate: the script is a convenience that can
be bypassed by editing `.env.local` by hand; `canSendBearerToken` is the
security rule and holds whatever the file says.

## 6. Organisations and authorization in the app

Code: [`organization-controller.ts`](../src/organizations/organization-controller.ts),
[`SessionProvider.tsx`](../src/organizations/SessionProvider.tsx),
[`permissions.ts`](../src/organizations/permissions.ts),
[`HomeScreen.tsx`](../src/screens/HomeScreen.tsx).

- `OrganizationController` loads the user's organisations, restores the last
  choice per user from SecureStore, and drops responses that arrive after a
  newer one or after the user signed out. **[Tested]**
- `HomeScreen` renders `BookingArea` with `key={active.publicId}`. Changing
  the key makes React discard the component and its state, so switching
  organisations always starts with an empty search, form and list.
- Every request names its organisation in the URL, so a late response can
  only ever describe the organisation it was asked for.
- What the UI shows or hides (`canAdminister`, `canModify` from the API) is a
  **convenience only**. The API enforces every rule itself.
- **The only Owner** (`memberActions`, `isSoleOwner` in `permissions.ts`): in a
  loaded member list, the Owner who is the only one is offered neither role
  chips for themselves nor *Forlad organisationen*, but a Danish explanation
  (`describeSoleOwner`) of how to make someone else Owner first. With several
  Owners both stay available. Nothing is offered while the list is loading or
  failed. `MembersSection` drops a list response for an organisation the user
  has switched away from, and reloads the list after a refused change, since
  the list may be out of date (another device); the API's `409 last_owner`
  stays the final word. **[Tested]** rules (`organization-rules.test.ts`);
  the screen itself is not covered by an automated test.
- Invitation links: `roombookingdev://invitation?token=…` pre-fills the
  accept form (`invitation-link.ts`). **[Tested]** parsing; not yet opened on a device.

## 7. Testing strategy

| Layer | What | Status |
| --- | --- | --- |
| Unit/integration (`npm test`) | Auth controller, token client, ID token, session storage, HTTP client (auth, transport, errors), API clients against a mocked `fetch` that copies the backend contract, organisation controller and rules, date/time and search logic, plus Git ignore-behaviour tests | 349 tests passed on 2026-10-24 (PR #12) |
| Type checking (`npm run typecheck`) | App, tests and E2E code under strict TypeScript | Passed on 2026-10-24 |
| Lint (`npm run lint`) | ESLint with Expo's SDK 58 config over app, tests and E2E code; `--max-warnings 0`, so a warning fails CI | Passed on 2026-10-26 (Phase 5B); a deliberate unused variable made it exit 1 |
| E2E (`npm run test:e2e`) | Web build in Chromium against the real .NET API on a temporary SQLite database: rooms, search, booking, overlap (409), API errors, time handling, sign-in-required message | 31 tests passed on 2026-10-24 in CI; the relevant backend changes from PR #13 are now on backend `main` (`E2E_BACKEND_DIR`) |
| Expo Doctor | Dependency versions match the SDK version list Expo publishes | 20/20 on 2026-10-24 after `e104927` (matching Expo dependencies are on `main` through merged PR #11) |
| API target script | `Set-ApiTarget.ps1`: hosted/local switch, Entra lines preserved, unsafe URLs and duplicate keys rejected | [Tested] in CI on Linux `pwsh`; [Manual] on Windows PowerShell 5.1, 2026-10-24 (isolated copy, 13 checks) |
| Device (Samsung SM-A057G) | Development build, redirect, `adb reverse`; the [sign-in checklist](device-testing.md#sign-in-checklist) | [Manual], partly done. Development build, redirect and deep link (PR #6), `adb reverse` (PR #7). The 23 October personal-account rejection is diagnosed in issue #16 ([details](device-testing.md#personal-account-rejection-23-october-2026)). On 26 October, in the rebuilt development build: `/common/` authority and redirect handler configured, registration shown and personal-account session restored after restarts (logged); sign-out and a new interactive sign-in, and a signed-in booking kept after a restart (owner reports); Owner administration with writes on an isolated database copy (logged, [checklist](device-testing.md#organisation-administration-checklist-26-october-2026)). Not run: work or school account, a new user's first sign-in, Admin/Member views, the sole-Owner member list of PR #22, cancelled and offline sign-in, token renewal, invitation links, time handling; the owner's procedure for the ones a single account allows is in [device-testing.md](device-testing.md#phase-5c-manual-checks-for-the-owner). See [device-testing.md](device-testing.md#current-status). |

**Not covered by automated tests:** React Native components on Android/iOS
(there are no component tests; components are exercised only through the web
build in E2E), the real Microsoft sign-in, SecureStore on a device, and
signed-in organisation flows end to end (E2E runs the web build without
sign-in).

### Still requires the physical Android device

These cannot be verified on Windows, by CI or in the web build. Done on
26 October 2026 (see [device-testing.md](device-testing.md#current-status)):
the rebuilt development build; personal-account sign-in and the redirect
back to `roombookingdev://auth`; the session restored across restarts and a
new sign-in after sign-out; signed-in requests to the local API over
`adb reverse`; organisation switching and the Owner's screens. Still open:

1. A work or school account, and the first sign-in (registration) of a new
   account.
2. SecureStore contents after sign-out, silent token renewal after an hour,
   offline start, revoked sessions.
3. A **restored** database behind `Set-ApiTarget.ps1 -Mode Local`: the
   organisations, rooms, bookings and roles look as they did before.
4. Token transport on the device: a plain-HTTP Wi-Fi address gets no token.
5. Invitation deep link `roombookingdev://invitation?token=…`.
6. Admin and Member screens and accepting an invitation, which need a second
   account (the API side is covered by its integration tests).

## 8. Local development

- `npm ci`, then `npm run web` (browser, demo or live) or
  `npx expo start --dev-client` (Android development build).
- `.env.local` holds `EXPO_PUBLIC_API_URL` and the Entra identifiers. They are
  identifiers, not secrets, and are visible in the bundle.
- For the local API on a physical phone: start the API with the backend's
  `scripts/Start-Local.ps1`, then `Set-ApiTarget.ps1 -Mode Local` and
  `adb reverse tcp:5003 tcp:5003` (and `tcp:8081` for Metro). See
  [api-targets.md](api-targets.md).

## 9. Builds and deployment

- **Development build:** `npx expo run:android` produces
  `io.github.kris7011.roombooking.dev`. **[Manual]**, built and installed on a
  Samsung SM-A057G (PR #6), and rebuilt after `e104927` on 26 October 2026.
- **Release/production builds: [Not implemented].** There is no `eas.json`,
  no release package ID, no release redirect URI registration, and no store
  configuration. A release build would send tokens over HTTPS only, so it
  cannot use a local HTTP API.

## 10. Design decisions

| Decision | Why | Cost | Record |
| --- | --- | --- | --- |
| Native sign-in as a public client with PKCE; refresh token in SecureStore, access token in memory | Standard for native apps (RFC 8252); no secret to leak | Device-only flow, needs a development build | [ADR 0001](adr/0001-native-sign-in-and-token-storage.md) |
| Token transport rule in the app; API chosen at bundle time | Security does not depend on configuration discipline | Switching servers needs a Metro restart or a new build | [ADR 0002](adr/0002-api-target-and-token-transport.md) |
| Logic in framework-free modules with injected dependencies | Fast, deterministic tests without a device | More wiring code | – |
| React `key` per organisation | Impossible to show the previous organisation's state | Re-mounts the booking area on every switch | – |
| Plain state instead of Expo Router | Two screens do not need a router | Would need migration if navigation grows | – |

## 11. Known limitations

- **No release build pipeline** and no in-app server selection.
- **Expo Doctor depends on Expo's live version list.** It compares the
  lockfile with the SDK 58 versions Expo publishes at run time, so a new Expo
  patch release can fail CI without any change here (it did on 2026-10-24;
  fixed by `e104927`, which bumped only the two reported packages, and on
  `main` by the now-merged PR #11). This is
  intended: it is the signal to update. The installed development build is
  older than that bump until it is rebuilt.
- **No component tests.** The logic behind components is tested in `npm test`;
  rendering is checked by the web E2E tests only.
- **Lint baseline.** `react-hooks/set-state-in-effect` is switched off for the
  ten existing files (components and one hook) that set state synchronously in an effect
  (listed in `eslint.config.js`); all other and all new files are checked.
  Refactoring those components is a follow-up.
- **The lint check cannot be made "required" on GitHub.** Branch protection
  needs GitHub Pro for a private repository, so a failing check shows red but
  does not technically prevent a merge.
- **`npm audit` reports 5 high-severity findings** from 2 advisories
  (`node-forge` and `zod` under `@expo/cli`). They are in the Expo CLI
  tooling, not the app bundle, and were present before PR #9;
  `npm audit fix --force` would downgrade the SDK. See
  [security-advisories.md](security-advisories.md).
- **No browser sign-in.** Neither this app's web build nor the Angular web
  client in the backend repository signs users in; both use the API's
  anonymous demo mode.
- **iOS has never been built or tested.**
- **Signed-in flows are not tested end to end**; they rely on unit tests with
  fakes and manual device checks.
- **Sign-in needs the internet** (Microsoft Entra), also when the API runs
  locally.
- **No offline mode**: bookings are not cached or queued.

## 12. How this project was built

This project was developed with AI assistance (Claude Code). Some commits
carry a `Co-Authored-By: Claude` trailer, but commit trailers alone do not
measure the full extent of AI involvement.

Every change is verified the same way regardless of who wrote it: type
checking, the automated test suites and CI must pass, and behaviour on a
physical device is checked by hand. The status labels in this document record
which of those checks applies to each part.
