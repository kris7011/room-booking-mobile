# Testing and continuous integration

The app has three layers of automated checks, all of which run in GitHub
Actions:

| Layer | Command | What it proves |
|---|---|---|
| Type checking | `npm run typecheck` | App, unit tests and E2E code compile under strict TypeScript |
| Unit and integration tests | `npm test` | The logic (sign-in, tokens, HTTP client, API clients, organisations, time handling) against fakes and a mocked `fetch` |
| End-to-end tests | `npm run test:e2e` | The web build in a real browser against the real .NET API and a fresh SQLite database |

What is **not** automated: React Native components on Android and iOS, the
real Microsoft sign-in, SecureStore on a device, and signed-in organisation
flows end to end. Those are manual checks, listed with their current status
in [device-testing.md](device-testing.md). A passing web or mocked test is
never counted as proof of native sign-in. Role permissions are enforced by
the API and tested there, independently of what this app shows.

## Unit and integration tests (`npm test`)

`npm test` compiles `tests/` and the platform-independent code in `src/` (`.ts` files without React Native imports) to JavaScript in `.test-build/`. It then runs the compiled files with Node's built-in test runner. No Jest, Babel or React Native runtime is needed, which keeps the tests fast and light on memory. `npm test` runs one test file at a time for the same reason.

`scripts/run-tests.js` fails the run if the number of compiled test files does not match `tests/**/*.test.ts`. Without this check, a config mistake could make Node run zero tests and still report success.

Covered:

- **Dates and time zones:** local-time helpers, Danish labels, local time to UTC conversion in summer and winter time, both daylight-saving-time changes, other time zones, and default search window edge cases. Tests run in `Europe/Copenhagen` regardless of the machine's zone.
- **Time that moves on** (`search-window.test.ts`, `clock.test.ts`): the default before, on and after a half hour; the default following the clock; chosen times that are kept and reported once passed, with the next possible time; midnight and "I dag"/"I morgen"; the last bookable slot of the day; summer and winter time, including a zone where midnight does not exist. The clock is driven with Node's mocked timers and a fake background/foreground signal.
- **Room search (demo):** capacity filter, ordering, busy blocks and empty results.
- **Overlap rules:** partial, containing and inner overlaps are busy. Back-to-back bookings are allowed, matching the API's `start < otherEnd && end > otherStart`.
- **Demo bookings:** response shape, trimming, ids, availability updates, 409 for overlaps, 404 for unknown rooms, and 400 on `startUtc` for a start that is not in the future (checked before the room, like the API).
- **Live API client:** exact URLs, query encoding, headers, JSON body, 201/400/404/409/500, non-JSON bodies, network failures and the 10-second timeout. `fetch` is replaced with a mock (`mock.method`) and timers are faked, so no real requests are made.
- **Error messages and environment handling**, including recognising the API's 400 on `startUtc` as "the meeting has started".
- **Redirect URI** (`auth-config.test.ts`): the URI is exactly `roombookingdev://auth`; `makeRedirectUri` gets `scheme`, `path` and `native`, and returns `native` in a development or release build; web gets no URI and never calls `makeRedirectUri`; the development log line flags an Expo Go `exp://` URL. `makeRedirectUri` is replaced by a stand-in that follows expo-auth-session 58's rule, because the real one needs React Native.
- **App config** (`app-config.test.ts`): `scheme`, Android package and config plugins in `app.json`, SDK 58 versions of the auth modules, and the Expo Go scripts. It also runs `expo config --type introspect`, which applies all config plugins like `expo prebuild` without writing `android/`, and checks that `MainActivity` has a `VIEW`/`BROWSABLE` intent filter for `roombookingdev` (and for the dev client's `exp+room-booking-mobile`), that SecureStore data is excluded from Android Auto Backup, and that the main manifest does not enable cleartext HTTP, so release builds keep Android's default.
- **Entra settings** (`entra-config.test.ts`): endpoints and scopes for `common` (the default), `organizations`, a tenant ID or a domain; missing values, a client ID that is not a GUID, a bare scope, the app's own scope, `consumers` and tenant values that would change the URL are refused; the consumer tenant ID marks a personal account. `.env.local` is gitignored and no source file contains a client secret.
- **ID token** (`id-token.test.ts`): base64url and UTF-8 (æøå), malformed tokens, audience, issuer for the token's own tenant, v1.0 issuer, required tenant, expiry with clock skew, missing `oid`; a personal account with the consumer tenant's issuer, and rejected with another tenant's issuer, the `consumers` alias, a v1.0 issuer or a required work tenant.
- **Token endpoint** (`token-client.test.ts`): the exact form for the code exchange (with `code_verifier`, without `client_secret`) and the refresh; AADSTS50011, AADSTS7000218, expired and revoked refresh tokens, MFA required, network failure, timeout, 503; missing access token, wrong token type, missing lifetime, API scope not granted.
- **Session storage** (`session-storage.test.ts`): round trip, chunks below 2 KB, no leftover chunks, damaged or unknown data is deleted, unreadable and unwritable keystore.
- **Sign-in flow** (`auth-controller.test.ts`): restore at start (valid, expired, offline, unreadable), sign-in, cancel, redirect errors, state mismatch, ID token for another app, double tap, no refresh token, keystore failures; renewal 2 minutes before expiry, forced renewal, one shared refresh for parallel calls, rotation; expired session signs out and deletes, offline keeps the session; sign-out deletes everything, also while a refresh or sign-in is still running. **Races** with deterministic ordering (SecureStore operations are held half-way, no timers): sign-out while the rotated refresh token is being saved hands out no token, to one or several waiting callers; sign-out during that save aborts the waiting requests; sign-out and sign-in as someone else during that save aborts them too, and only new requests get the new token; a renewal failing after sign-out aborts the request; a grant handed out before sign-out reports that its session ended; the session's own expiry is still reported as expired; a late delete failure does not overwrite a newer sign-in; sign-out while the session is read at start restores nothing. Every test checks that no token reaches the console, the state or the storage (except the refresh token).
- **Tokens in API calls** (`http-client-auth.test.ts`): `Authorization` only when signed in, one retry after a forced refresh on 401, an expired session becomes a Danish `ApiError` without a request, `GET /api/me` and how its failures are shown; through the real `AuthController`, a booking waiting for its renewal is not sent when the user signs out, nor when another user signs in meanwhile (no `POST` leaves the app), including a personal account with the same e-mail address as the work account before it (only `tid`/`oid` identify a user); a renewal failing after sign-out aborts it; a grant that is no longer current right before `fetch` is not sent; a 401 whose forced renewal overlaps a sign-out, or sign-out + sign-in as another user, is not sent again; a 401 followed by sign-out (and sign-in as another user) before the retry is aborted with *session-changed*, without renewing the other user's token and without a second request; with an unchanged session a 401 still renews once and the retry carries the renewed token; an ordinary anonymous booking after sign-out still goes out without a token. Transport rules: HTTPS only in a release bundle, local HTTP in a development bundle, never HTTP across a network.
- **Registration and organisation access** (`current-user.test.ts`): `POST /api/me/registration` without a body and with the bearer token; first sign-in verifies and then registers once; a returning user costs one GET and no registration; a user registered meanwhile gets the existing user; a disabled account and a 401 are rejected (the 401 without registering); an API without the endpoint (404/405), a failed registration that keeps the verified identity, and an API without Entra settings; the onboarding text without an organisation and the list of organisations with Danish role names.
- **Token transport against `http://localhost`** (`http-client-transport.test.ts`, the `adb reverse` setup): a development bundle sends the token; a release bundle, or one whose `__DEV__` is unknown, sends none and does not even ask for it, and the request still works.
- **Sign-in availability** (`auth-availability.test.ts`): web, Expo Go (by its `exp://` redirect URI, and by `isRunningInExpoGo()` even when the redirect URI looks like the development build's), missing and invalid settings; the development log line names the authorize endpoint and which accounts it accepts, never the client ID.
- **Authorization request** (`authorize-request.test.ts`): `/common` endpoint by default, client ID, redirect URI, scopes, PKCE always on, no `domain_hint`/`login_hint`; `organizations` changes the endpoint.
- **Organisations** (`tests/organizations/`, `organizations-api.test.ts`): organisation choice and switching, late responses dropped, permissions per role, what the member list offers the only Owner, several Owners, Admins and Members (and nothing before it has loaded), invitation links, the room form and organisation endpoints.

Not covered yet: React components in isolation (this would need `jest-expo` and React Native Testing Library). The end-to-end tests cover them in the browser.

## End-to-end tests (`npm run test:e2e`)

`npm run test:e2e` tests the web app the way a user uses it: in a real browser, against the real .NET 10 API, with bookings saved in SQLite. You do not start anything yourself. The web build has no Microsoft sign-in, so the E2E tests cover the anonymous booking flow, not the signed-in organisation flows.

### Prerequisites

- The API repository, [meeting-room-booking](https://github.com/kris7011/meeting-room-booking), checked out next to this one, as `../meeting-room-booking`. If it is somewhere else, set `E2E_BACKEND_DIR` to its folder. CI tests against the API's `main` branch.
- The .NET 10 SDK.
- Google Chrome. The tests reuse the installed Chrome, so Playwright downloads no browser. Without Chrome, run `npx playwright install chromium` once and set `E2E_BROWSER_CHANNEL=bundled`.

```bash
npm run test:e2e                         # all tests
npm run test:e2e -- e2e/specs/booking.spec.ts   # one file
npm run test:e2e -- -g "409"             # tests whose name matches
npm run test:e2e -- --headed             # watch it in a visible browser window
npm run test:e2e:report                  # HTML report of the last run
```

### What happens during a run

1. Playwright builds the API into `e2e/.output/api-build`, starts it with `dotnet run` on **http://localhost:5103** and waits for `/health`.
2. `e2e/scripts/serve-web.mjs` runs `expo export --platform web` with `EXPO_PUBLIC_API_URL=http://localhost:5103` and serves the result on **http://localhost:8181**. Metro uses `metro.config.js`, so `maxWorkers = 1` applies.
3. The tests run one at a time in one browser window, 390 × 844 pixels.
4. Playwright stops both servers. This happens even when tests fail.

A run takes about 40 seconds on a warm machine. Most of that is building the API and exporting the web bundle.

### The isolated test database

The tests never use the development database (`meeting-room-booking.db` in the API folder):

- **A new database per run.** Each run gets its own file in the system temp folder (`%TEMP%` on Windows, usually `/tmp` on Linux), named after its start time and a random part, for example `room-booking-e2e-2026-10-19T11-30-00-000Z-1a2b3c4d.db`. The file is passed to the API as `ConnectionStrings__BookingDatabase`. The API creates it, migrates it and seeds the three rooms on start. Next to it are its `-wal` and `-shm` files. It is outside both repositories, so it can never be committed. The run prints its path before the first test.
- **Separate ports.** The API runs on 5103 and the web app on 8181, so a development API on 5003 or Expo on 8081 can keep running. `reuseExistingServer` is off: if 5103 or 8181 is already in use, the run stops instead of testing against a server it did not start.
- **Checked before the first test.** `global-setup.ts` stops the run unless the database file exists and contains no bookings.
- **No `.env.local`.** The export sets `EXPO_NO_DOTENV=1`, so your `.env.local` is never read. `serve-web.mjs` also refuses to serve a bundle that does not contain the E2E API address.
- **Clean between tests.** Before each test, all bookings are deleted through the API. Tests therefore do not depend on each other or on their order.

The API runs in the `Development` environment, because that is where it enables CORS and accepts its anonymous demo mode. The allowed origin is replaced through `Cors__AllowedOrigins__0=http://localhost:8181`. No change to the API is needed.

### Cleaning up test databases

The tests never delete a database file, neither their own nor another run's. `npx playwright test -c e2e --list` creates and deletes nothing. It also leaves the last HTML report and `e2e/.output/test-results/` in place. A real run replaces both, as Playwright always does.

Automatic cleanup at the end of a run is not safe:

- Playwright stops the API only after every teardown hook has run. While a hook runs, the API still has the file open. On Windows the file cannot be deleted then. On Linux it can be, but under a running process.
- A run that is stopped with Ctrl+C or killed runs no teardown at all.
- Another run may still be using its own file.

The files are therefore kept. This also helps when you want to look at the data after a failed run. Each file is small, typically under 1 MB with its `-wal` and `-shm` files. To remove them:

1. Make sure no E2E run is active. Nothing may listen on the E2E ports. The commands below print nothing when that is the case:

   ```powershell
   # Windows (PowerShell)
   Get-NetTCPConnection -LocalPort 5103,5104,8181 -State Listen -ErrorAction SilentlyContinue
   ```

   ```bash
   # Linux / macOS
   lsof -nP -iTCP:5103 -iTCP:5104 -iTCP:8181 -sTCP:LISTEN
   ```

2. Delete only the E2E files. Do not delete other files in the temp folder, and never `meeting-room-booking.db` in the API folder, which is the development database.

   ```powershell
   Remove-Item "$env:TEMP\room-booking-e2e-*"
   ```

   ```bash
   rm -f "${TMPDIR:-/tmp}"/room-booking-e2e-*
   ```

On Windows, `Remove-Item` refuses to delete a file that a running API still has open, which is an extra safeguard. On GitHub Actions nothing needs to be cleaned up, because each job runs on a new machine.

### Fixed time and test data

The browser's clock is frozen at **Monday 4 March 2030, 07:40**, and its time zone is set to `Europe/Copenhagen`. The day picker, the default search window (08:00–09:00, sent as `07:00Z`–`08:00Z`) and all expected texts are therefore the same on every machine and every day. Timers still run normally. The seeded rooms (Focus 4, Collaboration 8, Board 12) and all times are in `e2e/support/test-data.ts`.

`clock.spec.ts` uses a running clock instead (`test.use({ clockMode: 'running' })`): it starts at the same time and the test jumps it forward with `page.clock.fastForward()`, which also fires the app's timers. Going to the background is simulated through the Page Visibility API, which React Native Web's `AppState` listens to.

The tests wait for real states: an API response (`waitForResponse`), a visible text, or a health check (`expect.poll`). They never wait a fixed time.

### What is tested

| File | Scenarios |
|---|---|
| `rooms.spec.ts` | Rooms come from the API in live mode. With the API unreachable, the connection error appears, and **Prøv igen** recovers. |
| `clock.spec.ts` | The default time moves on when it passes, without interaction. Coming back from the background (`AppState`) catches up although no timer ran. A chosen time is never changed; once passed, the warning appears, search is blocked and **Brug næste tidspunkt** picks the next one. Text typed into an open booking form survives. At midnight (the night summer time starts) "I morgen" becomes "I dag" and the search is sent with the summer-time offset. |
| `search.spec.ts` | Local time is sent as UTC. The smallest fitting room is listed first. Capacity filter. Booked rooms are hidden, but back-to-back bookings are not. "Ingen ledige lokaler". |
| `booking.spec.ts` | Form validation sends nothing. A booking is created (201 with CORS header), shown, stored and hidden from the results, also after a reload. The booking is still there for a new API process on the same file. A double booking gets 409 and the conflict message. |
| `past-bookings.spec.ts` | The start of an open booking form passes while the user types: warning, *Bekræft booking* disabled, text kept; **Søg igen** searches from the next half hour and reopens the same room with the text, and the booking goes through. The time is checked again right before sending (no request when a late timer has not noticed yet). With the phone's clock years behind, the API's 400 on `startUtc` shows the same warning (with a hint about the clock) instead of an error. |
| `account.spec.ts` | On web the account panel says sign-in is only in the mobile app and shows no sign-in or sign-out button. Search and booking work without sign-in, no request carries an `Authorization` header, and `/api/me` is never called. |
| `api-errors.spec.ts` | 400 on `startUtc` when a new booking does not start after the server's time, or an existing one is moved into the past (which leaves it unchanged). 400 for an invalid period, capacity, empty fields and a too-long title. 409 for overlaps, 201 for back-to-back bookings. 404 for an unknown room or booking. The app's messages for 400 and 404 responses, and the sign-in message when the API refuses anonymous access (401). |

Two scenarios cannot be produced by a real user, so the tests steer them:

- **API unreachable.** The test makes the browser fail every request to the API with `ERR_CONNECTION_REFUSED` (`page.route(...).abort('connectionrefused')`). That is the same error the app gets when the API is down. The real API is not stopped, because other tests in the run need it.
- **400 and 404 shown in the app.** The form validates its input and only offers existing rooms. The test therefore changes the outgoing POST on its way to the API, the way an outdated app version or a just-deleted room would. The API's response is real.

"Persistence across a restart" starts a second API process (port 5104) on the same database file and reads the booking from it. A new process has nothing in memory, so it can only find the booking in SQLite.

### Troubleshooting

| Problem | Fix |
|---|---|
| `The meeting-room-booking API was not found at …` | Clone the API next to this repository, or set `E2E_BACKEND_DIR`. |
| `http://localhost:5103/health is already used` (or 8181) | Something is running on that port, often an earlier run that was killed. Stop it. On Windows: `Get-NetTCPConnection -LocalPort 5103` shows the process ID. |
| `Chromium distribution 'chrome' is not found` | Install Google Chrome, or run `npx playwright install chromium` and set `E2E_BROWSER_CHANNEL=bundled`. |
| `Timed out waiting … from config.webServer` | The first build of the API or the web export took too long, often on the first run after `npm ci`. Run again, or run `dotnet build` in the API folder first. |
| `Process from config.webServer was not able to start. Exit code: 1` with `[API] System.OutOfMemoryException` (or `csc.exe` crashing) | Windows has run out of commit memory (RAM + page file), not a problem in the tests. Check *free commit* with `(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory`; the System event log names the largest consumers. Close large applications or enlarge the page file, then run again. |
| `MSB3027`/`MSB3021`: could not copy `apphost.exe` to `bin\Debug\…\MeetingRoomBooking.Api.exe` | An older version built the E2E API into the API's own `bin/`, which a running development API (`dotnet run`) locks. The E2E run now builds into `e2e/.output/api-build` instead; pull the latest version. |
| `does not contain http://localhost:5103. Refusing to serve it.` | The exported bundle points to another API. Delete `e2e/.output` and run again. |
| A test fails | `npm run test:e2e:report` shows the step, a screenshot and a trace (network, DOM, console) for each failed test. The raw files are in `e2e/.output/test-results/`. |

All output (exported web app, report, traces) is written to `e2e/.output/`, which is gitignored.

## Continuous integration

`.github/workflows/ci.yml` (**CI / Typecheck, tests and Expo Doctor**) runs on every pull request, on pushes to `main`, and manually from the Actions tab. On Ubuntu with Node 24 it runs:

1. `npm ci`: a clean install exactly as recorded in `package-lock.json`
2. A smoke test of `scripts/Set-ApiTarget.ps1` in PowerShell 7 (`pwsh`): switching to a hosted HTTPS URL and back to local keeps the Entra lines, and a plain-HTTP hosted URL is rejected
3. `npm run typecheck`
4. `npm test`
5. `npx expo-doctor`

If any step fails, the run fails and the pull request shows a red check.

`.github/workflows/e2e.yml` (**E2E / Playwright against .NET API and SQLite**) runs the end-to-end tests as a separate check on every pull request, on pushes to `main`, and manually from the Actions tab. When started manually, you can choose which branch of the API to test against. It does the following:

1. Checks out this repository and the public `kris7011/meeting-room-booking` side by side.
2. Installs .NET 10 (from the API's `global.json`) and Node 24.
3. Builds the API.
4. Installs Playwright's Chromium with its system libraries. The browser is cached per Playwright version.
5. Runs `npm run test:e2e`.

The HTML report and the traces of failed tests are uploaded as the `e2e-report` artifact.

`npx expo-doctor` compares the lockfile with the SDK 58 versions Expo publishes at run time, so a new Expo patch release can make CI fail without any change in this repository. That is intended: it is the signal to update.
