# Local development

How to run the app on your own machine, in demo mode or against the real
API, the available commands, and where the code lives. A shorter
introduction is in the [README](../README.md#quickstart); the architecture is
explained in [PROJECT_WALKTHROUGH.md](PROJECT_WALKTHROUGH.md).

## Prerequisites

- Node.js 24 and npm.
- For the real API: the [meeting-room-booking](https://github.com/kris7011/meeting-room-booking) repository and the .NET 10 SDK.
- For Microsoft sign-in on Android: the Android development build, see [android-development-build.md](android-development-build.md).
- For the demo on a phone without sign-in: Expo Go.

```bash
git clone https://github.com/kris7011/room-booking-mobile.git
cd room-booking-mobile
npm ci
npm run web        # or: npm run start:go, then scan the QR code with Expo Go
```

Without further setup the app starts in **demo mode**.

Because `expo-dev-client` is installed, plain `npm start` targets the development build. For Expo Go, use `npm run start:go` (or `npm run android:go`), or press `s` in the Expo terminal to switch.

## Demo API versus live API

| | Demo mode | Live mode |
|---|---|---|
| Enabled when | `EXPO_PUBLIC_API_URL` is unset or empty | `EXPO_PUBLIC_API_URL` is set |
| Data source | `src/api/demo-api.ts`, in memory | The .NET API over HTTP |
| Rooms | The three rooms the API seeds | Whatever the API returns |
| Bookings | Kept until the app reloads, never sent anywhere | Saved in the API's SQLite database |
| Banner | Yellow **DEMODATA** banner | Shows the API address |

Demo mode simulates the API: the same rooms, the same overlap rule, 409 for overlapping bookings, about 500 ms latency, and fixed busy blocks every day (Board Room 09:00–11:00, Collaboration Room 13:00–14:00).

## Connecting to the real API

1. Start the backend from the `meeting-room-booking` repository. Its `http` profile listens on `http://localhost:5003`. Without sign-in (always on web), the API must run in its anonymous demo mode (`LegacyApi__AllowAnonymous=true`). Step-by-step instructions for both projects are in [backend-integration.md](backend-integration.md).
2. Copy [`.env.example`](../.env.example) to `.env.local` (gitignored) and set the address for the device you use:

   | App runs on | `EXPO_PUBLIC_API_URL` |
   |---|---|
   | Web browser on the same PC | `http://localhost:5003` |
   | iOS Simulator | `http://localhost:5003` |
   | Android Emulator | `http://10.0.2.2:5003` (the emulator's alias for your PC) |
   | Physical phone over USB (development build, sign-in possible) | `http://localhost:5003` plus `adb reverse tcp:5003 tcp:5003`, see [device-testing.md](device-testing.md#sign-in-against-a-local-api-over-usb) |
   | Physical phone over Wi-Fi (no sign-in token is ever sent) | `http://<your PC's LAN IP>:5003` |

3. Restart the dev server (`npm start`, or `npm run start:go` for Expo Go), then reload the app (press `r`).

`localhost` always means the device the app runs on, which is why the address differs per device. Never commit a personal IP address; `.env.local` exists for that. For a development build on a phone, [`scripts/Set-ApiTarget.ps1`](api-targets.md) switches `.env.local` between the local API and an HTTPS-hosted API.

**Physical phone over Wi-Fi:** the API must listen on all network interfaces (`dotnet run --urls http://0.0.0.0:5003`). The phone must be on the same Wi-Fi, and Windows Firewall must allow inbound TCP 5003. Searching and booking work, but the app never sends a sign-in token over plain HTTP across a network.

**Web:** the page is served from `http://localhost:8081` and the API from port 5003, so the browser only lets the app read API responses if the API allows that origin through CORS. The API does this in its Development environment, which the `http` launch profile uses. If you run Expo on another port, add it to `Cors:AllowedOrigins` in the API's `appsettings.Development.json`. Native apps are not affected by CORS. The web build has no sign-in, so against the current API it needs the API's anonymous demo mode (see [organisations.md](organisations.md#without-sign-in)).

`EXPO_PUBLIC_*` values are embedded in the app bundle. Never put secrets in them.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Start the Expo dev server for the development build (and web) |
| `npm run start:go` | Start the Expo dev server for Expo Go |
| `npm run web` / `android` / `ios` | Start the dev server and open a specific platform (`android`/`ios` open the installed development build) |
| `npm run android:go` | Start and open the app in Expo Go on a connected Android device or emulator |
| `npm run android:dev-build` | Build the Android development build locally, install it and start Metro (`expo run:android`) |
| `npm run typecheck` | Type-check the app (`tsconfig.json`), the tests (`tsconfig.test.json`) and the E2E tests (`e2e/tsconfig.json`) |
| `npm run lint` | ESLint over app, tests and E2E code (`eslint.config.js`); fails on any error or warning |
| `npm test` | Compile and run the unit and integration tests |
| `npm run test:e2e` | Start the API and the web app, run the end-to-end tests, stop both again |
| `npm run test:e2e:report` | Open the HTML report of the last E2E run |
| `npx expo-doctor` | Check dependency versions and project config against Expo SDK 58 |
| `npx expo install <package>` | Add a dependency in the version that matches the SDK (use instead of `npm install`) |

There is no ESLint configuration yet, so there is no lint command.

### Low-memory machines

`metro.config.js` sets `maxWorkers = 1`, so Metro bundles in a single process instead of one worker per CPU core. This is slower but uses much less memory. Override it per run with `npx expo start --max-workers 4`. `npm test` also runs one test file at a time for the same reason, and `npm run test:e2e` uses one browser and runs one test at a time.

## Project structure

```
App.tsx                  App-wide providers only
index.ts                 Registers App as the root component
metro.config.js          Metro bundler config (maxWorkers = 1)
src/
  api/
    room-booking-api.ts  RoomBookingApi interface; picks live or demo
    live-api.ts          Calls the .NET API
    demo-api.ts          In-memory demo implementation
    http-client.ts       fetch wrapper: base URL, query string, 10 s timeout, ApiError, bearer token, transport rule
    current-user.ts      GET /api/me, POST /api/me/registration: verify, register once, organisation access
    organizations-api.ts Organisation, room, member and invitation endpoints; booking per organisation
    error-messages.ts    Maps errors to user-facing (Danish) messages
  auth/
    auth-config.ts       Scheme, redirect URI and makeRedirectUri options
    entra-config.ts      Reads and validates the EXPO_PUBLIC_ENTRA_* settings; endpoints and scopes
    auth-controller.ts   Sign-in state machine, the only holder of tokens: sign-in, refresh, expiry, sign-out
    token-client.ts      Entra token endpoint: code + PKCE verifier, refresh (no client secret)
    id-token.ts          Reads the ID token for display (audience, issuer, tenant, expiry checked)
    session-storage.ts   Refresh token and display data in SecureStore, in chunks
    auth-errors.ts       AuthFlowError, AADSTS codes and Danish messages
    auth-availability.ts Whether sign-in is offered: web, Expo Go, settings; the development log line
    authorize-request.ts The authorization request (endpoint, scopes, PKCE, no account hints)
    auth-runtime.native.ts  Android/iOS: wires AuthRequest, token client and SecureStore together
    auth-runtime.ts      Web: sign-in unavailable
    secure-store.native.ts  SecureStore adapter (WHEN_UNLOCKED_THIS_DEVICE_ONLY)
    AuthProvider.tsx     React context and useAuth()
    redirect-uri.native.ts  Calls makeRedirectUri on Android/iOS; logs the URI in development
    redirect-uri.ts      Web: no redirect URI (the web build has no sign-in)
  components/            Reusable UI: RoomCard, SearchForm, BookingForm, BookingArea, UpcomingBookings, AccountPanel, pickers, …
    organizations/       OrganizationPanel (switcher, onboarding), create organisation, accept invitation
    admin/               Administration sections: details, rooms, invitations, members
  config/env.ts          Reads EXPO_PUBLIC_API_URL, decides demo or live mode
  config/build.ts        Whether this is a development bundle (__DEV__)
  hooks/useClock.tsx     Current time, renewed per half hour, at midnight and on AppState "active"
  hooks/useServerIdentity.tsx  Asks GET /api/me who the signed-in user is; registers them the first time
  models/                TypeScript types mirroring the API contracts
  organizations/         OrganizationController (no React), permissions, invitation links, room form rules,
                         Danish messages, selection store, SessionProvider (identity, organisations, invitation links)
  screens/               AppScreens (booking or administration), HomeScreen, OrganizationAdminScreen
  theme/theme.ts         Colors, spacing and typography tokens
  utils/date-time.ts     Local-time helpers and local-to-UTC conversion
  utils/search-window.ts Default vs. chosen time, "passed" check and next possible time
  utils/clock.ts         When the shown time may be stale (timers + resume), testable in Node
  utils/room-fit.ts      Danish texts describing how a room fits the search (participants, capacity)
tests/
  api/                   Demo API, live API client, HTTP client (auth, transport), organisation endpoints, error messages
  organizations/         Organisation choice and switching, permissions, invitation links, room form, messages
  auth/                  Redirect URI, Entra settings, sign-in, tokens, session storage, errors
  config/                Environment handling, app.json and the generated Android manifest
  utils/                 Dates, time zones, daylight saving time, clock, room fit
  support/               Test setup: demo/live mode, a fixed time zone, fake Entra tokens and SecureStore
e2e/                     End-to-end tests (Playwright), see testing.md
  playwright.config.ts   Starts the API and the web app, one browser, one test at a time
  global-setup.ts        Refuses to run unless the API uses a new, empty E2E database
  specs/                 rooms, search, booking, api-errors, clock, past-bookings, account
  support/               Ports and paths, page object, API helpers, fixtures, fixed test data
  scripts/serve-web.mjs  Exports the web app for the E2E API and serves it
scripts/
  run-tests.js           Compiles and runs the tests (used by npm test)
  Set-ApiTarget.ps1      Switches .env.local between the local and an HTTPS-hosted API
docs/                    Developer documentation and architecture decision records
tsconfig.test.json       Compiles src/**/*.ts and tests/ to .test-build/
.github/workflows/
  ci.yml                 Fast checks: API target script smoke test, typecheck, lint, tests, Expo Doctor
  e2e.yml                End-to-end tests against the real API
```
