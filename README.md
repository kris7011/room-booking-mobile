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
| **Web** | **Tested.** Bundling works. Rendered in headless Chrome at 600 px and at a 375 px phone viewport. The whole flow was clicked through in demo mode: search, "no free rooms", results, form validation, booking, refreshed availability. In live mode with the backend switched off, the connection error is shown. |
| **Android** | **Not tested yet**, on neither an emulator nor a physical device. |
| **iOS** | **Not tested yet**, on neither a simulator nor a physical device. |

The app only uses React Native core components and `react-native-safe-area-context`, both of which are included in Expo Go. No development build is needed. Native layout, the keyboard and safe areas still need to be checked on a device.

Also not tested: requests to a real running backend. The API client is tested automatically against a mocked `fetch` that copies the backend's contract (see [Tests](#tests)), but has never talked to the actual .NET API.

The web checks were done once by hand and with a one-off headless-Chrome script. CI does not run UI tests.

## Tech stack

- Expo SDK 58, React Native 0.88, React 19.3
- TypeScript 6 (strict)
- react-native-web for the browser build
- react-native-safe-area-context for notches and status bars
- Node's built-in test runner (`node:test`) for the automated tests
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

1. Start the backend from the `meeting-room-booking` repository. Its `http` profile listens on `http://localhost:5003`.
2. Copy `.env.example` to `.env.local` (gitignored) and set the address for the device you use:

   | App runs on | `EXPO_PUBLIC_API_URL` |
   |---|---|
   | iOS Simulator | `http://localhost:5003` |
   | Android Emulator | `http://10.0.2.2:5003` (the emulator's alias for your PC) |
   | Physical phone with Expo Go | `http://<your PC's LAN IP>:5003` |
   | Web browser on the same PC | `http://localhost:5003` (needs CORS, see below) |

3. Restart `npm start`, then reload the app (press `r`).

`localhost` always means the device the app runs on, which is why the address differs per device. Never commit a personal IP address. `.env.local` exists for that.

**Physical phone:** the API must listen on all network interfaces (`dotnet run --urls http://0.0.0.0:5003`). The phone must be on the same Wi-Fi, and Windows Firewall must allow inbound TCP 5003.

**Web:** the API currently has no CORS policy, so the browser blocks requests from `http://localhost:8081`. Native apps are not affected. Allowing that origin in the API's development configuration fixes it.

`EXPO_PUBLIC_*` values are embedded in the app bundle. Never put secrets in them.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Start the Expo dev server (Expo Go, emulators, web) |
| `npm run web` / `android` / `ios` | Start and open a specific platform |
| `npm run typecheck` | Type-check the app (`tsconfig.json`) and the tests (`tsconfig.test.json`) |
| `npm test` | Compile and run the automated tests |
| `npx expo-doctor` | Check dependency versions and project config against Expo SDK 58 |
| `npx expo install <package>` | Add a dependency in the version that matches the SDK (use instead of `npm install`) |

### Low-memory machines

`metro.config.js` sets `maxWorkers = 1`, so Metro bundles in a single process instead of one worker per CPU core. This is slower but uses much less memory. Override it per run with `npx expo start --max-workers 4`. `npm test` also runs one test file at a time for the same reason.

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
scripts/run-tests.js     Compiles and runs the tests (used by npm test)
tsconfig.test.json       Compiles src/**/*.ts and tests/ to .test-build/
.github/workflows/ci.yml GitHub Actions pipeline
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

Not covered yet: React components (this needs `jest-expo` and React Native Testing Library) and end-to-end tests against a running backend.

`scripts/run-tests.js` fails the run if the number of compiled test files does not match `tests/**/*.test.ts`. Without this check, a config mistake could make Node run zero tests and still report success.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request, on pushes to `main`, and manually from the Actions tab. On Ubuntu with Node 24 it runs:

1. `npm ci`: a clean install exactly as recorded in `package-lock.json`
2. `npm run typecheck`
3. `npm test`
4. `npx expo-doctor`

If any step fails, the run fails and the pull request shows a red check.

## License

MIT, see [LICENSE](LICENSE).

The project was created from Expo's `blank-typescript` template (`create-expo-app`). The template ships with an MIT license held by 650 Industries, Inc. (Expo), and its copyright notice is kept in `LICENSE` because parts of the template are still in the repository:

- `index.ts` and all images in `assets/` (app icon, adaptive icon layers, splash icon, favicon) are unchanged from the template.
- `app.json`, `tsconfig.json` and `.gitignore` started from the template and have been modified.

Everything else is original to this project. Dependencies installed through npm are covered by their own licenses, which ship inside each package in `node_modules/`.
