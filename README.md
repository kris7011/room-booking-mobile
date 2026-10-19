# Room Booking Mobile

A React Native (Expo) client for the [meeting-room-booking](https://github.com/kris7011/meeting-room-booking) API. Find a free meeting room for a given number of people, day and time, and book it from a phone or a browser.

The app runs without a backend on clearly labelled demo data, and switches to the real API when `EXPO_PUBLIC_API_URL` is set.

## Features

- Overview of all meeting rooms with name and capacity.
- Participant picker, day picker (next 14 days) and start/end time in 30-minute steps.
- Search for free rooms, with the smallest fitting room listed first.
- Loading, error, "no free rooms" and success states.
- Booking form with client-side validation that matches the API's rules.
- Readable messages for API errors such as overlapping bookings (409) and validation errors (400).
- One code base for Android, iOS and web. Only web has been tested so far, see [Platform status](#platform-status).

## Platform status

| Platform | Status |
|---|---|
| **Web** | **Tested.** Bundling works. Rendered in headless Chrome at 600 px and at a 375 px phone viewport. The whole flow was clicked through in demo mode: search, "no free rooms", results, form validation, booking, refreshed availability. Tested in live mode against the real .NET API: room overview, search, booking saved in SQLite, overlap (409) message, and the connection error with the backend switched off. See [docs/backend-integration.md](docs/backend-integration.md). |
| **Android** | **Not tested yet**, on neither an emulator nor a physical device. |
| **iOS** | **Not tested yet**, on neither a simulator nor a physical device. |

The app only uses React Native core components and `react-native-safe-area-context`, both of which are included in Expo Go. No development build is needed. Native layout, the keyboard and safe areas still need to be checked on a device.

The API client is tested automatically against a mocked `fetch` that copies the backend's contract (see [Tests](#tests)). The web app is also tested end to end against the real .NET API in Chromium, locally and in CI (see [End-to-end tests](#end-to-end-tests)).

## Tech stack

- Expo SDK 58, React Native 0.88, React 19.3
- TypeScript 6 (strict)
- react-native-web for the browser build
- react-native-safe-area-context for notches and status bars
- Node's built-in test runner (`node:test`) for the automated tests
- Playwright for the end-to-end tests in a browser
- GitHub Actions for CI

## Getting started

Prerequisites: Node.js 24 and npm. To run on a phone, install **Expo Go**. To run on an emulator, install Android Studio or Xcode.

```bash
git clone git@github.com:kris7011/room-booking-mobile.git
cd room-booking-mobile
npm ci
npm run web        # or: npm start, then scan the QR code with Expo Go
```

Without further setup the app starts in **demo mode**.

## Demo API vs live API

| | Demo mode | Live mode |
|---|---|---|
| Enabled when | `EXPO_PUBLIC_API_URL` is unset or empty | `EXPO_PUBLIC_API_URL` is set |
| Data source | `src/api/demo-api.ts`, in memory | The .NET API over HTTP |
| Rooms | The three rooms the API seeds | Whatever the API returns |
| Bookings | Kept until the app reloads, never sent anywhere | Saved in the API's database |
| Banner | Yellow **DEMODATA** banner | Shows the API address |

Demo mode simulates the API: the same rooms, the same overlap rule, 409 for overlapping bookings, about 500 ms latency, and fixed busy blocks every day (Board Room 09:00–11:00, Collaboration Room 13:00–14:00).

### Connecting to the real API

1. Start the backend from the `meeting-room-booking` repository. Its `http` profile listens on `http://localhost:5003`. Step-by-step instructions for both projects are in [docs/backend-integration.md](docs/backend-integration.md).
2. Copy `.env.example` to `.env.local` (gitignored) and set the address for the device you use:

   | App runs on | `EXPO_PUBLIC_API_URL` |
   |---|---|
   | iOS Simulator | `http://localhost:5003` |
   | Android Emulator | `http://10.0.2.2:5003` (the emulator's alias for your PC) |
   | Physical phone with Expo Go | `http://<your PC's LAN IP>:5003` |
   | Web browser on the same PC | `http://localhost:5003` |

3. Restart `npm start`, then reload the app (press `r`).

`localhost` always means the device the app runs on, which is why the address differs per device. Never commit a personal IP address. `.env.local` exists for that.

**Physical phone:** the API must listen on all network interfaces (`dotnet run --urls http://0.0.0.0:5003`). The phone must be on the same Wi-Fi, and Windows Firewall must allow inbound TCP 5003.

**Web:** the page is served from `http://localhost:8081` and the API from port 5003, so the browser only lets the app read API responses if the API allows that origin through CORS. The API does this in its Development environment, which the `http` launch profile uses. If you run Expo on another port, add it to `Cors:AllowedOrigins` in the API's `appsettings.Development.json`. Native apps are not affected by CORS.

`EXPO_PUBLIC_*` values are embedded in the app bundle. Never put secrets in them.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Start the Expo dev server (Expo Go, emulators, web) |
| `npm run web` / `android` / `ios` | Start and open a specific platform |
| `npm run typecheck` | Type-check the app (`tsconfig.json`), the tests (`tsconfig.test.json`) and the E2E tests (`e2e/tsconfig.json`) |
| `npm test` | Compile and run the automated tests |
| `npm run test:e2e` | Start the API and the web app, run the end-to-end tests, stop both again |
| `npm run test:e2e:report` | Open the HTML report of the last E2E run |
| `npx expo-doctor` | Check dependency versions and project config against Expo SDK 58 |
| `npx expo install <package>` | Add a dependency in the version that matches the SDK (use instead of `npm install`) |

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
    http-client.ts       fetch wrapper: base URL, query string, 10 s timeout, ApiError
    error-messages.ts    Maps errors to user-facing (Danish) messages
  components/            Reusable UI: RoomCard, SearchForm, BookingForm, pickers, …
  config/env.ts          Reads EXPO_PUBLIC_API_URL, decides demo or live mode
  models/                TypeScript types mirroring the API contracts
  screens/HomeScreen.tsx The screen: owns state and calls the API
  theme/theme.ts         Colors, spacing and typography tokens
  utils/date-time.ts     Local-time helpers and local-to-UTC conversion
tests/
  api/                   Demo API, live API client, error messages
  config/                Environment handling
  utils/                 Dates, time zones and daylight saving time
  support/               Test setup: demo/live mode and a fixed time zone
e2e/                     End-to-end tests (Playwright), see "End-to-end tests"
  playwright.config.ts   Starts the API and the web app, one browser, one test at a time
  global-setup.ts        Refuses to run unless the API uses a new, empty E2E database
  specs/                 rooms, search, booking, api-errors
  support/               Ports and paths, page object, API helpers, fixtures, fixed test data
  scripts/serve-web.mjs  Exports the web app for the E2E API and serves it
scripts/run-tests.js     Compiles and runs the tests (used by npm test)
docs/                    How to run against the real backend, and test results
tsconfig.test.json       Compiles src/**/*.ts and tests/ to .test-build/
.github/workflows/
  ci.yml                 Fast checks: typecheck, tests, Expo Doctor
  e2e.yml                End-to-end tests against the real API
```

## Tests

`npm test` compiles `tests/` and the platform-independent code in `src/` (`.ts` files without React Native imports) to JavaScript in `.test-build/`. It then runs the compiled files with Node's built-in test runner. No Jest, Babel or React Native runtime is needed, which keeps the tests fast and light on memory.

Covered:

- **Dates and time zones:** local-time helpers, Danish labels, local time to UTC conversion in summer and winter time, both daylight-saving-time changes, other time zones, and default search window edge cases. Tests run in `Europe/Copenhagen` regardless of the machine's zone.
- **Room search (demo):** capacity filter, ordering, busy blocks and empty results.
- **Overlap rules:** partial, containing and inner overlaps are busy. Back-to-back bookings are allowed, matching the API's `start < otherEnd && end > otherStart`.
- **Demo bookings:** response shape, trimming, ids, availability updates, 409 for overlaps, and 404 for unknown rooms.
- **Live API client:** exact URLs, query encoding, headers, JSON body, 201/400/404/409/500, non-JSON bodies, network failures and the 10-second timeout. `fetch` is replaced with a mock (`mock.method`) and timers are faked, so no real requests are made.
- **Error messages and environment handling.**

Not covered yet: React components in isolation (this needs `jest-expo` and React Native Testing Library). The end-to-end tests cover them in the browser.

`scripts/run-tests.js` fails the run if the number of compiled test files does not match `tests/**/*.test.ts`. Without this check, a config mistake could make Node run zero tests and still report success.

## End-to-end tests

`npm run test:e2e` tests the web app the way a user uses it: in a real browser, against the real .NET 10 API, with bookings saved in SQLite. You do not start anything yourself.

### Prerequisites

- The API repository checked out next to this one, as `../meeting-room-booking`. If it is somewhere else, set `E2E_BACKEND_DIR` to its folder.
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

1. Playwright starts the API with `dotnet run` on **http://localhost:5103** and waits for `/health`.
2. `e2e/scripts/serve-web.mjs` runs `expo export --platform web` with `EXPO_PUBLIC_API_URL=http://localhost:5103` and serves the result on **http://localhost:8181**. Metro uses `metro.config.js`, so `maxWorkers = 1` applies.
3. The tests run one at a time in one browser window, 390 × 844 pixels.
4. Playwright stops both servers. This happens even when tests fail.

A run takes about 40 seconds. Most of that is building the API and exporting the web bundle.

### The isolated test database

The tests never use the development database (`meeting-room-booking.db` in the API folder):

- **A new database per run.** Each run gets its own file in the system temp folder (`%TEMP%` on Windows, usually `/tmp` on Linux), named after its start time and a random part, for example `room-booking-e2e-2026-10-19T11-30-00-000Z-1a2b3c4d.db`. The file is passed to the API as `ConnectionStrings__BookingDatabase`. The API creates it, migrates it and seeds the three rooms on start. Next to it are its `-wal` and `-shm` files. It is outside both repositories, so it can never be committed. The run prints its path before the first test.
- **Separate ports.** The API runs on 5103 and the web app on 8181, so a development API on 5003 or Expo on 8081 can keep running. `reuseExistingServer` is off: if 5103 or 8181 is already in use, the run stops instead of testing against a server it did not start.
- **Checked before the first test.** `global-setup.ts` stops the run unless the database file exists and contains no bookings.
- **No `.env.local`.** The export sets `EXPO_NO_DOTENV=1`, so your `.env.local` is never read. `serve-web.mjs` also refuses to serve a bundle that does not contain the E2E API address.
- **Clean between tests.** Before each test, all bookings are deleted through the API. Tests therefore do not depend on each other or on their order.

The API still runs in the `Development` environment, because that is where it enables CORS. The allowed origin is replaced through `Cors__AllowedOrigins__0=http://localhost:8181`. No change to the API is needed.

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

The tests wait for real states: an API response (`waitForResponse`), a visible text, or a health check (`expect.poll`). They never wait a fixed time.

### What is tested

| File | Scenarios |
|---|---|
| `rooms.spec.ts` | Rooms come from the API in live mode. With the API unreachable, the connection error appears, and **Prøv igen** recovers. |
| `search.spec.ts` | Local time is sent as UTC. The smallest fitting room is listed first. Capacity filter. Booked rooms are hidden, but back-to-back bookings are not. "Ingen ledige lokaler". |
| `booking.spec.ts` | Form validation sends nothing. A booking is created (201 with CORS header), shown, stored and hidden from the results, also after a reload. The booking is still there for a new API process on the same file. A double booking gets 409 and the conflict message. |
| `api-errors.spec.ts` | 400 for an invalid period, capacity, empty fields and a too-long title. 409 for overlaps, 201 for back-to-back bookings. 404 for an unknown room or booking. The app's messages for 400 and 404 responses. |

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
| `does not contain http://localhost:5103. Refusing to serve it.` | The exported bundle points to another API. Delete `e2e/.output` and run again. |
| A test fails | `npm run test:e2e:report` shows the step, a screenshot and a trace (network, DOM, console) for each failed test. The raw files are in `e2e/.output/test-results/`. |

All output (exported web app, report, traces) is written to `e2e/.output/`, which is gitignored.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request, on pushes to `main`, and manually from the Actions tab. On Ubuntu with Node 24 it runs:

1. `npm ci`: a clean install exactly as recorded in `package-lock.json`
2. `npm run typecheck`
3. `npm test`
4. `npx expo-doctor`

If any step fails, the run fails and the pull request shows a red check.

`.github/workflows/e2e.yml` runs the end-to-end tests as a separate check, **E2E / Playwright against .NET API and SQLite**, on every pull request and manually from the Actions tab. When started manually, you can choose which branch of the API to test against. It does the following:

1. Checks out this repository and the public `kris7011/meeting-room-booking` side by side.
2. Installs .NET 10 (from the API's `global.json`) and Node 24.
3. Builds the API.
4. Installs Playwright's Chromium with its system libraries. The browser is cached per Playwright version.
5. Runs `npm run test:e2e`.

The HTML report and the traces of failed tests are uploaded as the `e2e-report` artifact.

## License

MIT, see [LICENSE](LICENSE).

The project was created from Expo's `blank-typescript` template (`create-expo-app`). The template ships with an MIT license held by 650 Industries, Inc. (Expo), and its copyright notice is kept in `LICENSE` because parts of the template are still in the repository:

- `index.ts` and all images in `assets/` (app icon, adaptive icon layers, splash icon, favicon) are unchanged from the template.
- `app.json`, `tsconfig.json` and `.gitignore` started from the template and have been modified.

Everything else is original to this project. Dependencies installed through npm are covered by their own licenses, which ship inside each package in `node_modules/`.
