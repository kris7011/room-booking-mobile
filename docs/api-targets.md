# Phase 4A: Switch between local and hosted APIs during development

Room Booking should remain usable locally if paid API hosting is
cancelled. The backend backup and restore procedure is documented in
[meeting-room-booking/docs/local-portability.md](https://github.com/kris7011/meeting-room-booking/blob/main/docs/local-portability.md).

**This script is intended for Expo development builds and Metro.**
The released Android APK cannot yet change its API server inside the
app. `EXPO_PUBLIC_API_URL` is embedded at bundle time, so a released
app must be rebuilt with a different URL until secure runtime server
selection is implemented.

## Switch to the local .NET API

First start the backend using `scripts/Start-Local.ps1` in the backend
repository and confirm `http://localhost:5003/health` is reachable.

From the mobile repository:

```powershell
cd C:\Users\krisr\source\repos\room-booking-mobile-entra
.\scripts\Set-ApiTarget.ps1 -Mode Local

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb reverse tcp:5003 tcp:5003
& $adb reverse tcp:8081 tcp:8081
npx expo start --dev-client --clear --port 8081
```

This requires the physical Samsung device to be connected over USB.
Bearer tokens travel over local development HTTP through localhost/ADB,
not unencrypted HTTP over Wi-Fi. Microsoft sign-in still requires
internet access.

The app itself enforces this, whatever `.env.local` contains
(`canSendBearerToken` in `src/api/http-client.ts`): a release bundle
sends the access token only over HTTPS, and a development bundle
additionally only to `localhost`, `127.0.0.0/8`, `::1` and the
emulator's `10.0.2.2`. Requests to any other plain-HTTP address are sent
without the token, so signed-in features do not work there.

## Switch to an HTTPS-hosted API

Once the API is deployed with a trusted HTTPS certificate:

```powershell
.\scripts\Set-ApiTarget.ps1 -Mode Hosted -HostedUrl "https://api.example.com"
npx expo start --dev-client --clear --port 8081
```

Replace the example URL with the real hosted API endpoint. The script
rejects HTTP addresses and URLs containing credentials, queries, or
fragments.

The script changes only `EXPO_PUBLIC_API_URL` in `.env.local`.
Existing Entra client IDs, scopes, and other settings are preserved.
It does not migrate a database or synchronize any data.

## Before cancelling hosting

1. Stop all writes to the hosted API.
2. Export a **verified SQLite backup** and keep a copy outside the
   hosting provider's account. No automatic synchronization is available.
3. Restore that backup into a **new database file** on the local PC
   with the backend restore script.
4. Start the API with the restored database and verify the meeting
   rooms, bookings, and membership roles.
5. Switch the development app to `-Mode Local` and test on Samsung.
6. Cancel hosting only after the local recovery test has passed.

**Important:** If future hosting uses PostgreSQL rather than SQLite,
a separate export/import procedure is needed. The SQLite backup tool
cannot directly import a PostgreSQL dump.

**Scope:** This is a development environment switch, not a feature
allowing an already-distributed Android release to switch API servers
without updating the app.
