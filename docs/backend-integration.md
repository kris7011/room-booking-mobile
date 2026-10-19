# Running against the real backend

How to run this app in a browser against the [meeting-room-booking](https://github.com/kris7011/meeting-room-booking) ASP.NET Core API, and the results of the integration test run on 19 October 2026.

## How the pieces talk to each other

```
Browser (http://localhost:8081)                ASP.NET Core API (http://localhost:5003)
  React Native Web app                           Minimal API endpoints
    live-api.ts ──fetch, JSON──────────────────▶   /api/rooms, /api/rooms/available, /api/bookings
    http-client.ts ◀── JSON or Problem Details ─   BookingService ── EF Core ──▶ SQLite file
```

- `src/api/http-client.ts` sends plain HTTP requests with `fetch`, JSON bodies and `Accept: application/json`. It turns non-2xx responses into an `ApiError` that carries the RFC 7807 Problem Details body.
- The TypeScript types in `src/models/` mirror the API's DTOs (`MeetingRoomResponse`, `SaveBookingRequest`, `BookingResponse`). ASP.NET Core serializes them in camelCase.
- In a browser, the page (port 8081) and the API (port 5003) are different origins. The API therefore has to allow `http://localhost:8081` through CORS. It does this only in its Development environment. Native apps on iOS and Android do not use CORS.

## Start the backend

Prerequisite: .NET SDK 10.

```powershell
git clone git@github.com:kris7011/meeting-room-booking.git
cd meeting-room-booking
dotnet run --project .\src\MeetingRoomBooking.Api\MeetingRoomBooking.Api.csproj --launch-profile http
```

The `http` profile listens on `http://localhost:5003` and uses the Development environment, which enables CORS for `http://localhost:8081`. On first start, EF Core creates the SQLite file `meeting-room-booking.db` in the directory you run the command from, applies the migrations and seeds three rooms.

Check that it runs:

```powershell
curl http://localhost:5003/health
curl http://localhost:5003/api/rooms
```

## Start the app in a browser

```powershell
cd room-booking-mobile
npm ci
Copy-Item .env.example .env.local    # contains EXPO_PUBLIC_API_URL=http://localhost:5003
npm run web
```

`.env.local` is gitignored. Expo prints `env: export EXPO_PUBLIC_API_URL` when it has read the file. The app shows a banner with `API: http://localhost:5003` instead of the yellow DEMODATA banner. If you change `.env.local`, restart `npm run web`.

## Test results (19 October 2026)

Windows 11, .NET SDK 10.0.402, Node 24.15, Expo SDK 58, headless Chrome. The backend ran with `dotnet run --launch-profile http` on a fresh SQLite database.

### Backend test suite

`dotnet test` in meeting-room-booking: **26 passed, 0 failed** (23 existing tests plus 3 new CORS tests).

### HTTP integration against the running API

22 checks, run with Node `fetch` and an `Origin: http://localhost:8081` header. All passed, both before and after a backend restart.

| Request | Expected | Result |
|---|---|---|
| `GET /health` | 200 `Healthy` | Pass |
| `GET /api/rooms` | 200, the 3 seeded rooms, CORS header for 8081 | Pass |
| `GET /api/rooms/available?…&minCapacity=5` | 200, rooms with capacity 8 and 12, smallest first | Pass |
| `GET /api/rooms/available` with end before start | 400, `timeRange` error | Pass |
| `GET /api/rooms/available?…&minCapacity=0` | 400, `minCapacity` error | Pass |
| `POST /api/bookings` | 201, `id`, `roomName`, trimmed title, CORS header | Pass |
| Booked room in `GET /api/rooms/available` | No longer listed for that period | Pass |
| `POST` overlapping, or containing, an existing booking | 409, `code: booking_overlap`, CORS header | Pass |
| `POST` starting exactly when another booking ends | 201 | Pass |
| `POST` with blank title and blank booked-by | 400 with `title` and `bookedBy` field errors | Pass |
| `POST` with end before start | 400 with `endUtc` error | Pass |
| `POST` with a 201-character title | 400 with `title` error | Pass |
| `POST` for room 999 | 404, `code: meeting_room_not_found` | Pass |
| `GET /api/bookings/{id}` | 200 with the created booking | Pass |

CORS on the running API:

| Request | Result |
|---|---|
| Preflight `OPTIONS /api/bookings` from `http://localhost:8081` | 204, `Access-Control-Allow-Origin: http://localhost:8081`, methods `GET,POST,PUT,DELETE`, headers `Accept,Content-Type` |
| Preflight from `http://evil.example` | 204 without any `Access-Control-*` headers, so the browser blocks it |

### Persistence across restarts

The backend was stopped and started twice. After each restart EF Core logged "No migrations were applied. The database is already up to date", and `GET /api/bookings` still returned every booking created before it, including the one booked through the browser UI. A new booking overlapping a pre-restart booking was still rejected with 409.

### The app in a browser

Headless Chrome at a 390 × 844 phone viewport, driven over the Chrome DevTools Protocol with real mouse and keyboard input. 19 checks, all passed:

- The app loads in live mode. The banner shows `API: http://localhost:5003` and there is no DEMODATA banner.
- The room overview comes from `GET /api/rooms` (200).
- Searching for 4 people sends `GET /api/rooms/available` with UTC times (12:30–13:30 Danish summer time became `10:30Z–11:30Z`) and lists Focus Room, Collaboration Room and Board Room, smallest first.
- Submitting the booking form empty shows "Skriv en titel på mødet." and "Skriv hvem der booker." and sends no request.
- Filling in the form and confirming sends a preflight `OPTIONS /api/bookings` (204) and then `POST /api/bookings` (201). The app shows "Booking oprettet … Booking nr. 5", the booking can be read back from the API, and Focus Room disappears from the refreshed results.
- Overlap: with the booking form for Collaboration Room open, the same room and period were booked directly through the API. Confirming in the app then got 409, and the app showed "Lokalet er allerede booket i det valgte tidsrum. Søg igen for at se ledige lokaler."
- No CORS errors in the browser console. The only console error is Chrome's own log line for the 409 response.
- With the backend stopped, reloading the app shows "Kunne ikke hente mødelokaler" with the message that the API at `http://localhost:5003` could not be reached.

### Not tested

- **Server-side validation messages in the UI.** The booking form validates title and booked-by before sending, and limits their length, so the UI cannot produce a 400 from `POST /api/bookings`. The API's 400 responses were tested over HTTP, and the app's handling of them (`Ugyldige oplysninger: …`) is covered by the unit tests in `tests/api/error-messages.test.ts`.
- **Android and iOS** against the real backend. Only web was tested.
- **Production configuration.** Not deployed. The automated backend test `Production_SendsNoCorsHeaders` checks that the Production environment sends no CORS headers.
- The browser and HTTP checks were run once by hand from scripts outside the repository. They are not part of `npm test` or CI.
