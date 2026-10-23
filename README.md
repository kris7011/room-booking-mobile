# Room Booking Mobile

A React Native (Expo) client for the [meeting-room-booking](https://github.com/kris7011/meeting-room-booking) API. Find a free meeting room for a given number of people, day and time, and book it from a phone or a browser.

The app runs without a backend on clearly labelled demo data, and switches to the real API when `EXPO_PUBLIC_API_URL` is set. On Android and iOS, users can optionally sign in with Microsoft Entra ID; the API, not the app, decides who they are.

## Features

- Overview of all meeting rooms with name and capacity.
- Participant picker, day picker (next 14 days) and start/end time in 30-minute steps.
- The suggested time keeps up with the clock while the app is left open, also after the app has been in the background and past midnight. A time the user picked is never changed; when it has passed, the app says so and offers the next possible time. See [Time handling](#time-handling).
- Search for free rooms, with the smallest fitting room listed first.
- Loading, error, "no free rooms" and success states.
- Booking form with client-side validation that matches the API's rules. A meeting whose start passes while the form is open cannot be confirmed; the form offers to search again from the next possible time and keeps what was typed.
- Readable messages for API errors such as overlapping bookings (409) and validation errors (400).
- Optional Microsoft Entra ID login on Android and iOS: authorization code flow with PKCE, refresh token in SecureStore, silent renewal, logout, and the identity confirmed by the API. See [Microsoft Entra login](#microsoft-entra-login).
- One code base for Android, iOS and web. Only web has been tested so far, see [Platform status](#platform-status).

## Platform status

| Platform | Status |
|---|---|
| **Web** | **Tested.** Bundling works. Rendered in headless Chrome at 600 px and at a 375 px phone viewport. The whole flow was clicked through in demo mode: search, "no free rooms", results, form validation, booking, refreshed availability. Tested in live mode against the real .NET API: room overview, search, booking saved in SQLite, overlap (409) message, and the connection error with the backend switched off. See [docs/backend-integration.md](docs/backend-integration.md). |
| **Android** | The development build runs on a physical Samsung phone, and `roombookingdev://auth` opens the app. **Microsoft login has not been tested on a device yet**, see [Needs a real login test on a physical phone](#needs-a-real-login-test-on-a-physical-phone). |
| **iOS** | **Not tested yet**, on neither a simulator nor a physical device. |

The booking flow only uses React Native core components and `react-native-safe-area-context`, both of which are included in Expo Go, so the demo still runs in Expo Go (`npm run start:go`). Microsoft login needs the Android **development build** instead, see [Android development build](#android-development-build). Native layout, the keyboard and safe areas still need to be checked on a device.

The API client is tested automatically against a mocked `fetch` that copies the backend's contract (see [Tests](#tests)). The web app is also tested end to end against the real .NET API in Chromium, locally and in CI (see [End-to-end tests](#end-to-end-tests)).

## Tech stack

- Expo SDK 58, React Native 0.88, React 19.3
- TypeScript 6 (strict)
- react-native-web for the browser build
- react-native-safe-area-context for notches and status bars
- expo-auth-session (browser login with PKCE), expo-web-browser, expo-crypto and expo-secure-store for Microsoft login; expo-dev-client for the development build
- Node's built-in test runner (`node:test`) for the automated tests
- Playwright for the end-to-end tests in a browser
- GitHub Actions for CI

## Getting started

Prerequisites: Node.js 24 and npm. To run on a phone, install **Expo Go**. To run on an emulator, install Android Studio or Xcode. The Android development build needs more, see [Android development build](#android-development-build).

```bash
git clone git@github.com:kris7011/room-booking-mobile.git
cd room-booking-mobile
npm ci
npm run web        # or: npm run start:go, then scan the QR code with Expo Go
```

Without further setup the app starts in **demo mode**.

Because `expo-dev-client` is installed, plain `npm start` now targets the development build. For Expo Go, use `npm run start:go` (or `npm run android:go`), or press `s` in the Expo terminal to switch.

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

3. Restart the dev server (`npm start`, or `npm run start:go` for Expo Go), then reload the app (press `r`).

`localhost` always means the device the app runs on, which is why the address differs per device. Never commit a personal IP address. `.env.local` exists for that.

**Physical phone:** the API must listen on all network interfaces (`dotnet run --urls http://0.0.0.0:5003`). The phone must be on the same Wi-Fi, and Windows Firewall must allow inbound TCP 5003.

**Web:** the page is served from `http://localhost:8081` and the API from port 5003, so the browser only lets the app read API responses if the API allows that origin through CORS. The API does this in its Development environment, which the `http` launch profile uses. If you run Expo on another port, add it to `Cors:AllowedOrigins` in the API's `appsettings.Development.json`. Native apps are not affected by CORS.

`EXPO_PUBLIC_*` values are embedded in the app bundle. Never put secrets in them.

## Microsoft Entra login

On Android and iOS, the app can sign in with a personal Microsoft account (Outlook.com, Hotmail, Live.com) or a work or school account. Login is **optional**: searching and booking work exactly as before without it, in demo mode and against the API. On web there is no login (the Angular app owns it in the browser), and in **Expo Go it is switched off** (detected with `isRunningInExpoGo()` from `expo`): Microsoft redirects to `roombookingdev://auth`, which only the development build can receive, so a login started in Expo Go could never finish.

### How it works

```
Phone                                   Microsoft Entra ID                  meeting-room-booking API
  "Log ind med Microsoft"
  AuthRequest (PKCE S256, state) ──────▶ /authorize (Custom Tab / ASWebAuthenticationSession)
  roombookingdev://auth?code&state ◀──── user signs in, consents
  state checked, code + code_verifier ─▶ /token
  access, refresh and ID token ◀────────
  GET /api/me, Bearer access token ─────────────────────────────────────▶ validates signature, issuer,
                                        ◀──────────────────────────────────  audience, scope; looks up user
  only if user is null:
  POST /api/me/registration ────────────────────────────────────────────▶ creates User + UserIdentity
  "Registreret i Room Booking som …" ◀───────────────────────────────────  (iss + oid), idempotent
```

- **Authorization code flow with PKCE**, as a public client: the app has **no client secret**. `AuthRequest` from `expo-auth-session` creates the code verifier and S256 challenge and a random `state`, and rejects a redirect whose `state` does not match. The code is redeemed by `src/auth/token-client.ts` (plain `fetch` with a 15-second timeout), which sends `code_verifier` and never a secret.
- **Scopes:** `openid profile offline_access` plus the API scope (`EXPO_PUBLIC_ENTRA_API_SCOPE`). `offline_access` gives the refresh token. The response must contain the API scope, otherwise the login fails with a consent message.
- **Accounts:** the default authority `common` signs in both **personal Microsoft accounts** (Outlook.com, Hotmail, Live.com) and **work or school accounts** of any tenant. Microsoft asks which kind when an address exists as both. A personal account belongs to Microsoft's consumer tenant `9188040d-6c67-4c5b-b112-36a304b66dad` and is checked like any other tenant; the panel says *Logget ind med en personlig Microsoft-konto* or *…arbejds- eller skolekonto*.
- **Who is shown:** the name comes from the ID token, after checking its audience (this app), issuer (`https://login.microsoftonline.com/{tid}/v2.0` for its own tenant), expiry and `oid`. That is for display only. **The app never decides who the user is**: in live mode it asks the API (`GET /api/me`), which validates the access token itself, and the panel says *Registreret i Room Booking som …* only after that (see the next point). In demo mode it says the identity is not confirmed by an API.
- **Registration in Room Booking:** after login the app asks `GET /api/me` (read-only). If the API has no user for the identity yet (`user: null`), the app calls `POST /api/me/registration` once, and the panel says *Du er nu registreret i Room Booking som …*; on every later login *Registreret i Room Booking som …*, after one GET and without writing anything. The API keys the user by the token's validated issuer and `oid`, never by e-mail, and registering again or twice at the same time returns the same user. The app sends no body: it never tells the API who the user is. The panel also shows the user's **Bruger-ID** (the API's public ID) and the organisations the user belongs to with their role (*Ejer*, *Administrator*, *Medlem*). A new user belongs to **no organisation**, and the panel says so: access comes through an invitation from an Owner or Admin, and the first Owner of the standard (legacy) organisation is named by whoever runs the API, from that Bruger-ID (see the API's README, *Registration and organisation access*). A disabled account gets *Din Room Booking-konto er deaktiveret…*; a failed registration can be retried with *Prøv igen*; an API without the registration endpoint is reported as such. Searching and booking work as before in every case.
- **Storage:** only the **refresh token** and the display data are stored, in **Expo SecureStore** (Android Keystore / iOS Keychain with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, excluded from Android Auto Backup). Long values are split into chunks, because some platforms reject SecureStore values over about 2 KB. The **access token is kept in memory only**. Nothing is written to `AsyncStorage`, logs or Git.
- **Expiry and refresh:** before every API request, `getAccessGrant()` returns the token if it is valid for more than 2 more minutes, otherwise it refreshes it. Parallel requests share one refresh. Entra's rotated refresh token replaces the stored one. After an app restart the stored session is checked with Microsoft right away.
  - refresh token expired or revoked (`invalid_grant`, `interaction_required`, for example after a password change or a Conditional Access policy) → signed out, session deleted, *Din Microsoft-session er udløbet. Log ind igen.*
  - offline or Microsoft unavailable → still signed in with a warning; the next request tries again
  - `401` from the API → one forced refresh and one retry, then a message
- **Logout** forgets the tokens and deletes everything in SecureStore. A refresh or a login that finishes after logout is ignored and cannot bring the session back, and a token renewed while the logout happened (for example while SecureStore was still saving the rotated refresh token) is never handed to a request. **A request never changes identity:** its token is bound to the session that was current when the request started. If the user signs out, or out and in as someone else, while the request waits for a renewed token, the request is **aborted and not sent**, neither anonymously nor as the new user (*Handlingen blev ikke udført, fordi du loggede ud eller skiftede konto…*). The HTTP client checks this again synchronously right before `fetch`. The automatic retry after a 401 belongs to the same session as the first attempt: the original grant is checked before the forced renewal and again after it, so a retry is never sent as a user who signed in after the first attempt (it is aborted with *session-changed*). A request that starts while nobody is signed in is anonymous exactly as before, so anonymous booking is unchanged. A failed delete is reported only while still signed out, never over a newer login. A request that had already been sent when the user logged out cannot be called back, but it is not retried with a renewed token after a 401. The Microsoft session in the browser stays; the next login shows the account picker (`prompt=select_account`), so another account can be chosen.
- **API calls:** `src/api/http-client.ts` gets the token from the one `AccessTokenProvider` (the `AuthController`) and adds `Authorization: Bearer …`. Nobody signed in → no header, as before.
- **Transport:** a release build sends tokens **over HTTPS only**. A development bundle (`__DEV__`) also sends them over HTTP to the device itself (`localhost`, `127.0.0.0/8`, `::1`) and to `10.0.2.2` (the emulator's alias for the PC), because that traffic never crosses a network; see [Testing login against the API on a physical phone](#testing-login-against-the-api-on-a-physical-phone). Plain HTTP to any other address, a private Wi-Fi address included, never gets a token: the request is sent without it and the token is not even renewed for it.
- **Errors** (`src/auth/auth-errors.ts`): cancelled, access denied, consent missing, configuration errors (for example `AADSTS50011` redirect URI mismatch or `AADSTS7000218` when the redirect is registered as *Web*), state mismatch, expired session, network, timeout and storage errors each get a Danish message with the AADSTS code, never a token.

### Configuration

Set in `.env.local` (gitignored; restart Metro after changing it):

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_ENTRA_CLIENT_ID` | Application (client) ID of the **mobile app's** registration |
| `EXPO_PUBLIC_ENTRA_API_SCOPE` | Full scope of the **API's** registration, `api://<API client ID>/access_as_user` |
| `EXPO_PUBLIC_ENTRA_TENANT` | `common` (personal Microsoft accounts and any work or school tenant, the default), `organizations` (work or school accounts only), or one tenant ID or domain |

These are identifiers, not secrets, and end up in the app bundle. Without them the app runs without login. Invalid values (a client ID that is not a GUID, a bare scope name, a scope of the app's own registration, `consumers`, which would shut out work and school accounts) switch login off and the panel says why.

The API must have the token validation from [meeting-room-booking#9](https://github.com/kris7011/meeting-room-booking/pull/9) and `Entra__ApiClientId` set. Without it, the panel says *API'et understøtter endnu ikke login* (404) or *API'et er ikke sat op til Microsoft-login* (503). Booking still works.

### Testing login against the API on a physical phone

A bearer token is never sent over plain HTTP across a network, so the usual phone setup (`http://<PC's LAN IP>:5003` over Wi-Fi) works for searching and booking, but without the token. The panel then says the token is not sent. Use the USB cable instead, so the API stays on the PC's `localhost` and the token never travels over Wi-Fi:

```powershell
# 1. API on the PC with the Entra settings (meeting-room-booking, PR #9)
$env:Entra__ApiClientId = "<Application (client) ID of the API registration>"
dotnet run --project .\src\MeetingRoomBooking.Api\MeetingRoomBooking.Api.csproj --launch-profile http

# 2. Phone on USB with USB debugging on: the phone's localhost:5003 becomes the PC's localhost:5003
adb reverse tcp:5003 tcp:5003
adb reverse --list          # shows: UsbFfs tcp:5003 tcp:5003 (or similar)

# 3. .env.local in this repository
#    EXPO_PUBLIC_API_URL=http://localhost:5003
npm run android:dev-build   # or, with the build installed: npx expo start --dev-client
```

- Neither the PC's firewall nor `0.0.0.0` is needed: the API only listens on the PC's `localhost`.
- `adb reverse` is lost when the cable is unplugged or the phone restarts; run it again.
- Only a **development bundle** sends a token to `http://localhost` (or `http://10.0.2.2` in the emulator). A **release build sends tokens over HTTPS only**, and its Android manifest does not allow cleartext HTTP at all. To test a release build against the API, put the API behind HTTPS with a certificate the phone trusts.

### Manual steps in the Microsoft Entra admin center

**Mobile app registration** (the one in `EXPO_PUBLIC_ENTRA_CLIENT_ID`):

1. **Authentication → Add a platform → Mobile and desktop applications**, custom redirect URI `roombookingdev://auth`. **Not** *Web* (that requires a client secret, `AADSTS7000218`) and not *Single-page application*.
2. **Authentication → Advanced settings → Allow public client flows**: can stay *No* for this flow. Create no client secret or certificate.
3. **API permissions → Add a permission → My APIs → Room Booking API → Delegated → `access_as_user`**. `openid`, `profile` and `offline_access` need no extra permission. Grant admin consent if users of the tenant may not consent themselves.
4. Supported account types: *Accounts in any organizational directory and personal Microsoft accounts* (`"signInAudience": "AzureADandPersonalMicrosoftAccount"`) for `common`; *Accounts in any organizational directory* is enough for `organizations`. For work or school users from other tenants, an administrator there must consent to the app; personal accounts consent for themselves. With an app registration that does not allow personal accounts, a Hotmail or Outlook.com login fails with *Microsoft-login er ikke sat korrekt op (unauthorized_client)*.

**API registration**: see the README of the API (*Sign-in with Microsoft Entra ID*): the same supported account types, scope `access_as_user` under *Expose an API*, and `requestedAccessTokenVersion: 2` in the manifest (required for personal accounts). The API accepts personal accounts while `Entra:AllowPersonalAccounts` is `true`, the default.

For a release build, a second registration (or a second redirect URI) with the release app's scheme is needed; this setup is for the development build `io.github.kris7011.roombooking.dev`.

### Needs a real login test on a physical phone

**⚠️ Manual.** The automated tests cover the logic with fakes for the browser, Entra's token endpoint and SecureStore. These parts can only be checked on a device, with the development build (`npm run android:dev-build`) and a real Microsoft account:

| # | Test | Expected |
|---|---|---|
| 1 | Tap **Log ind med Microsoft**, sign in with a work or school account | Custom Tab opens Microsoft's login, returns to the app via `roombookingdev://auth`; the panel shows *…arbejds- eller skolekonto*, name and e-mail |
| 1b | **Log ud**, then sign in with a personal account (Outlook.com, Hotmail or Live.com) | The panel shows *Logget ind med en personlig Microsoft-konto*, name and e-mail; in live mode *Registreret i Room Booking som …* |
| 2 | First login in a tenant | The consent screen lists Room Booking API; after consent the login completes. With consent refused: *Microsoft afviste login…* |
| 3 | Close the Custom Tab without signing in | *Login blev annulleret.*, no error |
| 4 | Live mode with the API from PR #9 over `adb reverse` (see [above](#testing-login-against-the-api-on-a-physical-phone)) | First login: *Du er nu registreret i Room Booking som …*, *Du er ikke medlem af en organisation endnu* and a Bruger-ID; the API log shows `Registered user {id}` and no 401 |
| 4a | Close the app completely, start it again (or **Log ud** and log in with the same account) | *Registreret i Room Booking som …* with the **same** Bruger-ID; the API log shows no new `Registered user` line |
| 4c | Set `Organizations__InitialLegacyOwnerUserId` to the Bruger-ID, restart the API, then tap *Prøv igen* or restart the app | *Din organisation*: *Legacy (standardorganisation) · Ejer*; the API log says the user is now the first Owner |
| 4b | The same API over Wi-Fi (`http://<LAN IP>:5003`) | Search and booking work; the panel says the token is not sent over an insecure connection; the API log shows no `Authorization` header |
| 5 | Close the app completely and start it again | Still signed in, without a new browser login |
| 6 | Leave the app for more than an hour (or until the access token expires), then search | The search works; the token was renewed silently |
| 7 | Flight mode, restart the app | Signed in with the warning *Kunne ikke få forbindelse til Microsoft…*; with the network back, the next search works |
| 8 | Revoke the sessions (Entra admin center → user → *Revoke sessions*, or change the password), then restart the app | Signed out with *Din Microsoft-session er udløbet* |
| 9 | **Log ud**, then **Log ind med Microsoft** | Signed out at once; the next login shows the account picker |
| 10 | `adb shell run-as io.github.kris7011.roombooking.dev cat shared_prefs/SecureStore.xml` while signed in, and again after logout | Signed in: `…roombooking.auth.v1.*` entries whose values are ciphertext, no readable token. After logout: no such entries |
| 11 | Metro and `adb logcat` during 1–9 | No token, code or code verifier appears in the logs |
| 12 | Expo Go (`npm run android:go`, or Expo Go's list of recent projects) | The panel says *Microsoft-login virker ikke i Expo Go … Åbn appen "Room Booking"*; demo booking works |

iOS has not been built or tested at all.

### Troubleshooting Microsoft login

First check **which app** runs and **which login page** it opens. On the phone, the app's icon is **Room Booking** (`io.github.kris7011.roombooking.dev`), not Expo Go. In development, Metro and `adb logcat` show one line when the app starts:

```
[auth] Microsoft login: https://login.microsoftonline.com/common/oauth2/v2.0/authorize (personal Microsoft accounts and work or school accounts)
```

```powershell
adb logcat -s ReactNativeJS:V | Select-String '\[auth\]'
```

| Symptom | Cause | Fix |
|---|---|---|
| *Du kan ikke logge på her med en privat konto. Brug din arbejds- eller skolekonto i stedet.* after typing a Hotmail or Outlook.com address | The login page is `…/organizations/…` (or one tenant): Microsoft offers work and school accounts only there. With `…/common/…` and the app registrations below, a personal address goes on to `login.live.com`. | Check the `[auth] Microsoft login:` line. If it does not say `/common/`: set `EXPO_PUBLIC_ENTRA_TENANT=common` (or remove it) in `.env.local`, stop Metro and start it again with `npx expo start --dev-client --clear` (`EXPO_PUBLIC_` values are read when Metro starts), then open **Room Booking**, not Expo Go. |
| The panel says *Microsoft-login virker ikke i Expo Go* | The project was opened in Expo Go | Open the **Room Booking** app; with Metro running it loads the same code |
| Login page shows `unauthorized_client: The client does not exist or is not enabled for consumers` | The mobile registration does not allow personal accounts | *Supported account types* → personal accounts too (`signInAudience: AzureADandPersonalMicrosoftAccount`), see [Manual steps](#manual-steps-in-the-microsoft-entra-admin-center) |
| *Microsoft-login er ikke sat korrekt op (AADSTS50011)* | Redirect URI `roombookingdev://auth` not registered as *Mobile and desktop applications* | Register it, see [Manual steps](#manual-steps-in-the-microsoft-entra-admin-center) |
| *…du kunne ikke oprettes som bruger i Room Booking* | The API answered `GET /api/me` but not `POST /api/me/registration` | Check the API log; *Prøv igen* repeats the check (registration is idempotent, so retrying never creates a second user) |
| *API'et understøtter endnu ikke registrering af brugere* | The API is older than the registration endpoint | Run the API from PR #9 at its latest commit |
| Signed in, but no *Registreret i Room Booking som …* | The API is not reachable with a token, or validates differently | `adb reverse tcp:5003 tcp:5003` (lost when adb restarts or the cable is unplugged), the API from PR #9 running with `Entra__ApiClientId`; `GET http://localhost:5003/api/me` without a token must answer `401` with `WWW-Authenticate: Bearer` (503 means `Entra:ApiClientId` is missing) |
| The app shows the launcher or *Cannot connect to Expo CLI* | The phone does not reach Metro | Start Metro, and over USB run `adb reverse tcp:8081 tcp:8081` too |

The app never sends `domain_hint` or `login_hint`: on `/common`, Microsoft decides from the e-mail address whether it is a personal or a work or school account, and a hint would shut out the other kind.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Start the Expo dev server for the development build (and web) |
| `npm run start:go` | Start the Expo dev server for Expo Go |
| `npm run web` / `android` / `ios` | Start and open a specific platform (`android`/`ios` in the development build) |
| `npm run android:go` | Start and open the app in Expo Go on a connected Android device or emulator |
| `npm run android:dev-build` | Build the Android development build locally, install it and start Metro (`expo run:android`) |
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
    http-client.ts       fetch wrapper: base URL, query string, 10 s timeout, ApiError, bearer token
    current-user.ts      GET /api/me, POST /api/me/registration: verify, register once, organisation access
    error-messages.ts    Maps errors to user-facing (Danish) messages
  auth/
    auth-config.ts       Scheme, redirect URI and makeRedirectUri options
    entra-config.ts      Reads and validates the EXPO_PUBLIC_ENTRA_* settings; endpoints and scopes
    auth-controller.ts   Login state machine, the only holder of tokens: sign-in, refresh, expiry, logout
    token-client.ts      Entra token endpoint: code + PKCE verifier, refresh (no client secret)
    id-token.ts          Reads the ID token for display (audience, issuer, tenant, expiry checked)
    session-storage.ts   Refresh token and display data in SecureStore, in chunks
    auth-errors.ts       AuthFlowError, AADSTS codes and Danish messages
    auth-availability.ts Whether login is offered: web, Expo Go, settings; the development log line
    authorize-request.ts The authorization request (endpoint, scopes, PKCE, no account hints)
    auth-runtime.native.ts  Android/iOS: wires AuthRequest, token client and SecureStore together
    auth-runtime.ts      Web: login unavailable
    secure-store.native.ts  SecureStore adapter (WHEN_UNLOCKED_THIS_DEVICE_ONLY)
    AuthProvider.tsx     React context and useAuth()
    redirect-uri.native.ts  Calls makeRedirectUri on Android/iOS; logs the URI in development
    redirect-uri.ts      Web: no redirect URI (Angular owns web login)
  components/            Reusable UI: RoomCard, SearchForm, BookingForm, AccountPanel, pickers, …
  config/env.ts          Reads EXPO_PUBLIC_API_URL, decides demo or live mode
  hooks/useClock.tsx     Current time, renewed per half hour, at midnight and on AppState "active"
  hooks/useServerIdentity.tsx  Asks GET /api/me who the signed-in user is; registers them the first time
  models/                TypeScript types mirroring the API contracts
  screens/HomeScreen.tsx The screen: owns state and calls the API
  theme/theme.ts         Colors, spacing and typography tokens
  utils/date-time.ts     Local-time helpers and local-to-UTC conversion
  utils/search-window.ts Default vs. chosen time, "passed" check and next possible time
  utils/clock.ts         When the shown time may be stale (timers + resume), testable in Node
tests/
  api/                   Demo API, live API client, error messages
  auth/                  Redirect URI, Entra settings, login, tokens, session storage, errors
  config/                Environment handling, app.json and the generated Android manifest
  utils/                 Dates, time zones and daylight saving time
  support/               Test setup: demo/live mode, a fixed time zone, fake Entra tokens and SecureStore
e2e/                     End-to-end tests (Playwright), see "End-to-end tests"
  playwright.config.ts   Starts the API and the web app, one browser, one test at a time
  global-setup.ts        Refuses to run unless the API uses a new, empty E2E database
  specs/                 rooms, search, booking, api-errors, clock, past-bookings, account
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
- **Time that moves on** (`search-window.test.ts`, `clock.test.ts`): the default before, on and after a half hour; the default following the clock; chosen times that are kept and reported once passed, with the next possible time; midnight and "I dag"/"I morgen"; the last bookable slot of the day; summer and winter time, including a zone where midnight does not exist. The clock is driven with Node's mocked timers and a fake background/foreground signal.
- **Room search (demo):** capacity filter, ordering, busy blocks and empty results.
- **Overlap rules:** partial, containing and inner overlaps are busy. Back-to-back bookings are allowed, matching the API's `start < otherEnd && end > otherStart`.
- **Demo bookings:** response shape, trimming, ids, availability updates, 409 for overlaps, 404 for unknown rooms, and 400 on `startUtc` for a start that is not in the future (checked before the room, like the API).
- **Live API client:** exact URLs, query encoding, headers, JSON body, 201/400/404/409/500, non-JSON bodies, network failures and the 10-second timeout. `fetch` is replaced with a mock (`mock.method`) and timers are faked, so no real requests are made.
- **Error messages and environment handling**, including recognising the API's 400 on `startUtc` as "the meeting has started".
- **Redirect URI** (`auth-config.test.ts`): the URI is exactly `roombookingdev://auth`; `makeRedirectUri` gets `scheme`, `path` and `native`, and returns `native` in a development or release build; web gets no URI and never calls `makeRedirectUri`; the development log line flags an Expo Go `exp://` URL. `makeRedirectUri` is replaced by a stand-in that follows expo-auth-session 58's rule, because the real one needs React Native.
- **App config** (`app-config.test.ts`): `scheme`, Android package and config plugins in `app.json`, SDK 58 versions of the auth modules, and the Expo Go scripts. It also runs `expo config --type introspect`, which applies all config plugins like `expo prebuild` without writing `android/`, and checks that `MainActivity` has a `VIEW`/`BROWSABLE` intent filter for `roombookingdev` (and for the dev client's `exp+room-booking-mobile`), and that SecureStore data is excluded from Android Auto Backup.

- **Entra settings** (`entra-config.test.ts`): endpoints and scopes for `common` (the default), `organizations`, a tenant ID or a domain; missing values, a client ID that is not a GUID, a bare scope, the app's own scope, `consumers` and tenant values that would change the URL are refused; the consumer tenant ID marks a personal account. `.env.local` is gitignored and no source file contains a client secret.
- **ID token** (`id-token.test.ts`): base64url and UTF-8 (æøå), malformed tokens, audience, issuer for the token's own tenant, v1.0 issuer, required tenant, expiry with clock skew, missing `oid`; a personal account with the consumer tenant's issuer, and rejected with another tenant's issuer, the `consumers` alias, a v1.0 issuer or a required work tenant.
- **Token endpoint** (`token-client.test.ts`): the exact form for the code exchange (with `code_verifier`, without `client_secret`) and the refresh; AADSTS50011, AADSTS7000218, expired and revoked refresh tokens, MFA required, network failure, timeout, 503; missing access token, wrong token type, missing lifetime, API scope not granted.
- **Session storage** (`session-storage.test.ts`): round trip, chunks below 2 KB, no leftover chunks, damaged or unknown data is deleted, unreadable and unwritable keystore.
- **Login flow** (`auth-controller.test.ts`): restore at start (valid, expired, offline, unreadable), sign-in, cancel, redirect errors, state mismatch, ID token for another app, double tap, no refresh token, keystore failures; renewal 2 minutes before expiry, forced renewal, one shared refresh for parallel calls, rotation; expired session signs out and deletes, offline keeps the session; logout deletes everything, also while a refresh or login is still running. **Races** with deterministic ordering (SecureStore operations are held half-way, no timers): logout while the rotated refresh token is being saved hands out no token, to one or several waiting callers; logout during that save aborts the waiting requests; logout and login as someone else during that save aborts them too, and only new requests get the new token; a renewal failing after logout aborts the request; a grant handed out before logout reports that its session ended; the session's own expiry is still reported as expired; a late delete failure does not overwrite a newer login; logout while the session is read at start restores nothing. Every test checks that no token reaches the console, the state or the storage (except the refresh token).
- **Tokens in API calls** (`http-client-auth.test.ts`): `Authorization` only when signed in, one retry after a forced refresh on 401, an expired session becomes a Danish `ApiError` without a request, `GET /api/me` and how its failures are shown; through the real `AuthController`, a booking waiting for its renewal is not sent when the user logs out, nor when another user signs in meanwhile (no `POST` leaves the app), including a personal account with the same e-mail address as the work account before it (only `tid`/`oid` identify a user); a renewal failing after logout aborts it; a grant that is no longer current right before `fetch` is not sent; a 401 whose forced renewal overlaps a logout, or logout + login as another user, is not sent again; a 401 followed by logout (and login as another user) before the retry is aborted with *session-changed*, without renewing the other user's token and without a second request; with an unchanged session a 401 still renews once and the retry carries the renewed token; an ordinary anonymous booking after logout still goes out without a token. Transport rules: HTTPS only in a release bundle, local HTTP in a development bundle, never HTTP across a network.
- **Registration and organisation access** (`current-user.test.ts`): `POST /api/me/registration` without a body and with the bearer token; first login verifies and then registers once; a returning user costs one GET and no registration; a user registered meanwhile gets the existing user; a disabled account and a 401 are rejected (the 401 without registering); an API without the endpoint (404/405), a failed registration that keeps the verified identity, and an API without Entra settings; the onboarding text without an organisation and the list of organisations with Danish role names.
- **Token transport against `http://localhost`** (`http-client-transport.test.ts`, the `adb reverse` setup): a development bundle sends the token; a release bundle, or one whose `__DEV__` is unknown, sends none and does not even ask for it, and the request still works.
- **Android manifest** (`app-config.test.ts`): the main manifest does not enable cleartext HTTP, so release builds keep Android's default.
- **Login availability** (`auth-availability.test.ts`): web, Expo Go (by its `exp://` redirect URI, and by `isRunningInExpoGo()` even when the redirect URI looks like the development build's), missing and invalid settings; the development log line names the authorize endpoint and which accounts it accepts, never the client ID.
- **Authorization request** (`authorize-request.test.ts`): `/common` endpoint by default, client ID, redirect URI, scopes, PKCE always on, no `domain_hint`/`login_hint`; `organizations` changes the endpoint.

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
| `account.spec.ts` | On web the account panel says login is only in the mobile app and shows no login or logout button. Search and booking work without login, no request carries an `Authorization` header, and `/api/me` is never called. |
| `api-errors.spec.ts` | 400 on `startUtc` when a new booking does not start after the server's time, or an existing one is moved into the past (which leaves it unchanged). 400 for an invalid period, capacity, empty fields and a too-long title. 409 for overlaps, 201 for back-to-back bookings. 404 for an unknown room or booking. The app's messages for 400 and 404 responses. |

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
| `Process from config.webServer was not able to start. Exit code: 1` with `[API] System.OutOfMemoryException` (or `csc.exe` crashing) | Windows has run out of commit memory (RAM + page file), not a problem in the tests. Check *free commit* with `(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory`; the System event log names the largest consumers ("Windows har diagnosticeret manglende hukommelse"). Close large applications or enlarge the page file, then run again. |
| `MSB3027`/`MSB3021`: could not copy `apphost.exe` to `bin\Debug\…\MeetingRoomBooking.Api.exe` | An older version built the E2E API into the API's own `bin/`, which a running development API (`dotnet run`) locks. The E2E run now builds into `e2e/.output/api-build` instead; pull the latest version. |
| `does not contain http://localhost:5103. Refusing to serve it.` | The exported bundle points to another API. Delete `e2e/.output` and run again. |
| A test fails | `npm run test:e2e:report` shows the step, a screenshot and a trace (network, DOM, console) for each failed test. The raw files are in `e2e/.output/test-results/`. |

All output (exported web app, report, traces) is written to `e2e/.output/`, which is gitignored.

## Android development build

Microsoft (Entra ID) login on Android needs a fixed redirect URI that the app itself owns. Expo Go cannot provide one (its URLs are `exp://<host>:8081/--/…` and change with the network), so login runs in a **development build**: the app built locally with `expo-dev-client`. This section sets that build up. The login itself is described in [Microsoft Entra login](#microsoft-entra-login).

| Setting | Value | Defined in |
|---|---|---|
| URL scheme | `roombookingdev` | `app.json` → `expo.scheme` |
| Android package | `io.github.kris7011.roombooking.dev` | `app.json` → `expo.android.package` |
| Redirect URI | `roombookingdev://auth` | `src/auth/auth-config.ts` |
| Dev client scheme | `exp+room-booking-mobile` | Added by `expo-dev-client` (opens a dev server URL) |

`makeRedirectUri` is called with `{ scheme: 'roombookingdev', path: 'auth', native: 'roombookingdev://auth' }`. In a development or release build on Android, expo-auth-session 58 returns `native` unchanged, so the result is exactly `roombookingdev://auth`. In Expo Go it returns an `exp://` URL instead, and on web the app asks for no redirect URI at all: the Angular app has its own Microsoft login, and the Expo web build has none. `src/auth/redirect-uri.ts` keeps `expo-auth-session` out of the web bundle.

For the later Entra setup:

- Register `roombookingdev://auth` on the mobile app registration, platform *Mobile and desktop applications*. It is a public client: no client secret, the login will use PKCE.
- The API permission (scope) is **`access_as_user`**, requested as `<API Application ID URI>/access_as_user`.
- `knownClientApplications` on the API registration is left unchanged. Whether it is needed is decided during the consent tests.

### Preparing Windows (PowerShell)

Expo SDK 58 builds Android with Gradle 9.4.1, **JDK 17**, `compileSdk` 37, `targetSdk` 36, Build-Tools 37.0.0, NDK 27.1.12297006 and CMake **3.31.6**. On Windows, keep the project in a short path (for example `C:\rb`) to avoid native Ninja path-length errors. Android SDK Platform 36 is installed for the emulator image and `targetSdk`; Platform 37 is needed to compile. Run the steps in a new PowerShell window (no administrator rights needed unless `winget` asks).

1. **JDK 17** (Microsoft Build of OpenJDK) and `JAVA_HOME`:

   ```powershell
   winget install --id Microsoft.OpenJDK.17 --exact --accept-source-agreements --accept-package-agreements
   $jdk = Get-ChildItem "C:\Program Files\Microsoft" -Directory -Filter "jdk-17*" | Sort-Object Name -Descending | Select-Object -First 1
   [Environment]::SetEnvironmentVariable("JAVA_HOME", $jdk.FullName, "User")
   ```

2. **Android Studio**:

   ```powershell
   winget install --id Google.AndroidStudio --exact --accept-source-agreements --accept-package-agreements
   ```

   Open Android Studio once and finish the setup wizard (*Standard*). It installs the SDK in `%LOCALAPPDATA%\Android\Sdk`. Then *More Actions → SDK Manager → SDK Tools*, tick **Android SDK Command-line Tools (latest)** and click *Apply*.

3. **`ANDROID_HOME` and `Path`**, for your user:

   ```powershell
   $sdk = "$env:LOCALAPPDATA\Android\Sdk"
   [Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdk, "User")
   $parts = @(([Environment]::GetEnvironmentVariable("Path", "User") -split ";") | Where-Object { $_ })
   foreach ($dir in "$sdk\platform-tools", "$sdk\emulator", "$sdk\cmdline-tools\latest\bin") {
     if ($parts -notcontains $dir) { $parts += $dir }
   }
   [Environment]::SetEnvironmentVariable("Path", ($parts -join ";"), "User")

   # Use the new values in this window too (new windows get them automatically)
   $env:JAVA_HOME = [Environment]::GetEnvironmentVariable("JAVA_HOME", "User")
   $env:ANDROID_HOME = $sdk
   $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
   ```

4. **SDK packages**: Platform 36 and 37.0, ADB (`platform-tools`), Build-Tools, NDK, CMake and an emulator image. CMake 3.31.6 is required by `expo-build-properties` to work around Windows Ninja path-length failures:

   ```powershell
   sdkmanager --licenses   # answer y to each license
   sdkmanager --channel=3 "platform-tools" "platforms;android-36" "platforms;android-37.0" "build-tools;37.0.0" "ndk;27.1.12297006" "cmake;3.31.6" "emulator" "system-images;android-36;google_apis;x86_64"
   ```

5. **Emulator** (or connect a phone with USB debugging on instead). On Windows 11 Home, the emulator needs the *Windows Hypervisor Platform* feature (*Turn Windows features on or off*).

   ```powershell
   avdmanager create avd --name RoomBooking_API36 --package "system-images;android-36;google_apis;x86_64" --device "pixel_7"
   Start-Process emulator -ArgumentList "-avd", "RoomBooking_API36"
   ```

   `avdmanager list device` shows other device profiles.

6. **Check**:

   ```powershell
   java -version            # openjdk version "17.…"
   $env:JAVA_HOME           # C:\Program Files\Microsoft\jdk-17.…
   adb version              # Android Debug Bridge …
   adb devices              # emulator-5554   device
   sdkmanager --list_installed
   ```

### Building and running the development build

```powershell
git clone https://github.com/kris7011/room-booking-mobile.git C:\rb
cd C:\rb
npm ci
npm run android:dev-build    # npx expo run:android
```

`expo run:android` generates `android/` from `app.json` (Continuous Native Generation; the folder is gitignored, never edit it by hand), builds the debug APK with Gradle, installs it on the running emulator or phone and starts Metro. The first build downloads Gradle and its dependencies and can take 10–20 minutes. Gradle uses up to 2 GB of heap; on a low-memory machine, close other large applications first. With several devices attached, add `-- --device`.

The Metro terminal then shows:

```
[auth] Redirect URI: roombookingdev://auth
[auth] Microsoft login: https://login.microsoftonline.com/common/oauth2/v2.0/authorize (personal Microsoft accounts and work or school accounts)
```

These lines are written at start (and on every reload, `r`) in development only; they contain no client ID, code or token, and nothing else about login is logged. In Expo Go the second line reads `[auth] Microsoft login unavailable: expo-go (…)`.

Later, as long as the native configuration has not changed, start Metro only and open the installed app: `npm start`, then press `a`. Run `npm run android:dev-build` again after changing `app.json`, a config plugin or a package with native code.

Live mode works as in Expo Go: `EXPO_PUBLIC_API_URL=http://10.0.2.2:5003` in `.env.local` for the emulator. The debug build allows plain HTTP; a release build would need HTTPS.

### Testing deep links

With the development build installed and the app loaded from Metro (otherwise the dev launcher catches the link first):

```powershell
# Is roombookingdev:// registered for the app?
adb shell pm query-activities --components -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "roombookingdev://auth"
# Expected: io.github.kris7011.roombooking.dev/.MainActivity

# Open the redirect URI the way a browser would
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "roombookingdev://auth" io.github.kris7011.roombooking.dev
# Expected: Status: ok, Activity: io.github.kris7011.roombooking.dev/.MainActivity, and the app comes to the front

# The same without the package name, as Android resolves it for a browser
npx uri-scheme open "roombookingdev://auth" --android
```

The app has no handler for `/auth` yet, so the link only brings it to the front; the booking screen stays as it was. The later login PR lets expo-auth-session pick the response up from this redirect.

### Expo Go demo, separately

Expo Go still runs the app unchanged, in demo mode without any backend:

```powershell
$env:EXPO_NO_DOTENV = "1"     # ignore .env.local, so the app uses demo data
npm run android:go            # or: npm run start:go and scan the QR code
Remove-Item Env:EXPO_NO_DOTENV
```

Run either the development build's Metro or Expo Go's, not both: both use port 8081.

## Time handling

The search form has two modes:

- **Following the clock** (until the user picks a day or a time): the shown window is not stored but derived from the current time on every render: the next half hour, one hour long, or 09:00 tomorrow when no full hour is left before 22:00. It can therefore never go stale.
- **Chosen by the user**: from the first change of day or time, the choice is kept exactly. Changing the number of participants does not count. When the chosen start has passed, the form shows *Tidspunktet er passeret*, blocks the search and offers **Brug næste tidspunkt: …** with the same duration.

`useClock` (`src/hooks/useClock.tsx`, logic in `src/utils/clock.ts`) renews "now" when a new half-hour slot or a new day starts, checks at least once a minute (which also catches a changed device clock or time zone), and checks again when `AppState` reports `active`. The screen only re-renders when the slot, the day or the UTC offset has changed. No native module is involved.

Search results and an open booking form keep describing the search that was made. Once that start has passed, the form shows *Mødets starttidspunkt er passeret*, disables *Bekræft booking* and offers **Søg igen: …**, which searches from the next possible time with the same duration and reopens the same room if it is still free. Title and name live in `HomeScreen`, not in the form, so they survive the new search; they are cleared after a successful booking. Right before sending, the form checks the time again, because the clock only ticks at slot boundaries and a timer can be late.

The API rejects a booking whose start is not after the server's current time with a `400` validation problem on `startUtc` (also for moving an existing booking). The app shows that as the same warning, with a hint that the phone's clock may be wrong if the phone still thinks the start lies ahead, and suggests a time after the rejected one. The demo API applies the same rule.

### Manual testing on a physical Android device

Install the development build (`npm run android:dev-build`) or run in Expo Go (`npm run android:go`). Turn off battery optimisation for the app only if a step behaves differently with it on, and note it.

1. **Default after opening.** Open the app at, say, 09:40. The time is 10:00–11:00 and "I dag" is selected.
2. **Left open.** Keep the screen on (Developer options → *Stay awake*). At 10:00 the time changes to 10:30–11:30 without touching the screen.
3. **Background.** Open the app at 09:40, press Home, wait until after 10:00 (or set the clock forward in Settings → System → Date & time, with automatic time off), return via the recent-apps list. The time is updated at once.
4. **Locked screen.** As 3, but lock the device instead of pressing Home.
5. **Chosen time.** Press **+** at Start, wait until that start has passed. The time is unchanged, the yellow warning appears, *Søg efter ledige lokaler* is disabled, and **Brug næste tidspunkt** sets the next half hour with the same duration. TalkBack reads the warning when it appears.
6. **Chosen day.** Pick a day further ahead and leave the app open across a slot change. The day stays selected.
7. **Booking form.** Search, open a room, type a title and a name, open the keyboard. Wait for a slot change, also with the app briefly in the background. The text, the keyboard behaviour (field above the keyboard) and the booked time are unchanged.
8. **Start passes while typing.** Search for the next half hour, open a room and start typing with the keyboard open. When the start passes: the yellow warning appears (TalkBack reads it), *Bekræft booking* is disabled, the keyboard and the text stay. Tap **Søg igen: …**: the same room opens for the new time with the text, and the booking can be confirmed.
9. **Phone clock behind.** Set the phone's clock (automatic time off) a few minutes behind the PC running the API, so the phone still thinks a start lies ahead that the server considers passed. Confirming shows the warning with *telefonens ur går muligvis forkert*, not an error.
10. **Midnight.** At about 23:55 open the app (default "I morgen" 09:00). After 00:00, the same chip reads "I dag" and the strip starts on the new day. Repeat with the app in the background over midnight.
11. **Last slot.** Before 21:00 the default is 21:00–22:00; from 21:00 it is tomorrow 09:00–10:00.
12. **Summer/winter time.** Set the date to the evening before the last Sunday of March or October (automatic time off, time zone Copenhagen), leave the app open over 02:00–03:00, then search for 09:00 the next day. In the request (or the booking shown) 09:00 is 07:00Z in summer time and 08:00Z in winter time.
13. **Time zone change.** Change the time zone in Settings while the app is open. Expected: within a minute (or on return to the app) the labels and default follow the new zone. If they only follow after restarting the app, note it: the JavaScript engine may keep the zone it started with.

Reset the device's date and time to automatic afterwards.

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
