# Testing on a physical Android device

What has and has not been verified on a real phone, and the manual
checklists for the parts that only a device can show: Microsoft sign-in,
SecureStore, deep links, the keyboard and time handling with a real clock.

Building and installing the development build is described in
[android-development-build.md](android-development-build.md).

## Current status

Device checks have been reported on a **Samsung SM-A057G**, including
development-build and Expo Go investigations. The PR descriptions provide
the recorded technical checks. The Hotmail rejection is analysed in
[Personal-account rejection, 23 October 2026](#personal-account-rejection-23-october-2026).

| Check | Result | Recorded in |
|---|---|---|
| Development build built (`expo run:android`), installed and started | Done, 22 October 2026 | PR #6 |
| Metro logs `[auth] Redirect URI: roombookingdev://auth` | Done | PR #6 |
| `adb` delivers `roombookingdev://auth` to `.MainActivity` | Done | PR #6 |
| `adb reverse tcp:5003 tcp:5003` reaches a `127.0.0.1`-only server on the PC | Done (tunnel only, without sign-in) | PR #7 |
| [Sign-in checklist](#sign-in-checklist) | **Not verified.** Two Hotmail attempts on 23 October were rejected by Microsoft; both ran in Expo Go while the API registration did not allow personal accounts (see [below](#personal-account-rejection-23-october-2026)). A personal-account registration reached the local API later that day, but no device log of it exists. No checklist step has a recorded device result. | PR #7; issue #16 |
| [Time-handling checklist](#time-handling-checklist) | **Not done** | PR #4, PR #5 |
| Search and booking on the device, in demo or live mode | **No result recorded** | – |
| Booking, organisation and administration screens with a signed-in user against the real API | **Not done** | PR #8 |
| Local/hosted API switch with sign-in ([api-targets.md](api-targets.md)) | **Not done** | PR #9 |

The previously installed development build predates the native Expo-module
updates in `e104927`. **Rebuild the development client** (`npm run android:dev-build`)
before the next verified end-to-end device test. Check that the phone opens the
Room Booking development build rather than Expo Go.

iOS has never been built, on a simulator or a device.

### Personal-account rejection, 23 October 2026

On the Samsung, Microsoft's sign-in page refused a Hotmail address with
*Du kan ikke logge på her med en privat konto. Brug din arbejds- eller
skolekonto i stedet.* Diagnosed on 25 October 2026 (issue #16) from the
evidence below; times are UTC.

| Time | Evidence | Source |
|---|---|---|
| 21 Oct 08:38 | API registration changed to work or school accounts only (`AzureADMultipleOrgs`) | Entra audit log |
| 22 Oct 12:40 | Mobile registration changed to `AzureADandPersonalMicrosoftAccount` | Entra audit log |
| 22 Oct 12:45 | Last change to `.env.local` in both local checkouts with Entra settings; both set `EXPO_PUBLIC_ENTRA_TENANT=common`. The code at the time (`be06021`) also defaulted to `common` | file timestamps, Git |
| 23 Oct 06:59 and 07:02 | Two sign-ins opened `login.microsoftonline.com` from **Expo Go** (`host.exp.exponent`), not the development build | phone `logcat` |
| 23 Oct 07:58 | API registration changed to `AzureADandPersonalMicrosoftAccount` | Entra audit log |
| 23 Oct 10:29 | The local development database recorded one new identity with the personal-account issuer (tenant `9188040d-…`) | `UserIdentities.CreatedUtc` |

**Cause:** during both attempts the **API registration** allowed work or
school accounts only. The app requests the API's scope at sign-in, and
Microsoft's `/common/` page then refuses personal accounts, even though the
mobile registration and the authority allowed them. A read-only request to
the `/authorize` endpoint confirmed the mechanism on 25 October: with this
app's client ID on `/common/`, the page Microsoft serves allows personal and
work accounts, but with the same client ID and a scope of a work-or-school-only
Microsoft API, it allows work accounts only and shows the message above, exactly as
the `/organizations/` page does. (This reads `iAllowedIdentities` and
`fUseConsumerEmailError` from the page's `$Config`, which is not a documented
interface.)

**Contributing:** both attempts ran in Expo Go, where a sign-in can never
finish, because Microsoft redirects to `roombookingdev://auth`. Since
`b322f98` the app refuses sign-in in Expo Go.

**Not the cause:** the authority (`/common/`), the mobile registration (it
allowed personal accounts from 22 Oct 12:40), the redirect URI (registered
as *Mobile and desktop applications*), and the app's code.

**State on 25 October:** both registrations are
`AzureADandPersonalMicrosoftAccount` with access token version 2. The API
exposes `access_as_user`, which the mobile registration requests. The mobile
registration has `roombookingdev://auth` as its only redirect URI and no
client secret. Microsoft's `/consumers/` endpoint hands the request on to
`login.live.com` without an error.

**Still unverified:** the 10:29 identity shows that a personal-account access
token was validated by the API, and the owner reported a successful Hotmail
sign-in on the Samsung shortly afterwards. No `logcat` or screenshot of that
run exists, so it does not count as a checklist result. No record of a Hotmail
attempt after 23 Oct 07:02 was found. If the message appears again, write down
the date and time, whether the app was **Room Booking** or Expo Go, and the
`[auth] Microsoft login:` line, then run the
[preflight](entra-login.md#preflight-check-both-registrations).

## Sign-in against a local API over USB

A bearer token is never sent over plain HTTP across a network, so the usual
phone setup (`http://<PC's LAN IP>:5003` over Wi-Fi) works for searching and
booking, but without the token. The panel then says the token is not sent.
Use the USB cable instead, so the API stays on the PC's `localhost` and the
token never travels over Wi-Fi:

```powershell
# 1. In the meeting-room-booking repository: the API with the Entra settings
$env:Entra__ApiClientId = "<Application (client) ID of the API registration>"
dotnet run --project .\src\MeetingRoomBooking.Api\MeetingRoomBooking.Api.csproj --launch-profile http

# 2. Phone on USB with USB debugging on: the phone's localhost:5003 becomes the PC's localhost:5003
adb reverse tcp:5003 tcp:5003
adb reverse --list          # shows: UsbFfs tcp:5003 tcp:5003 (or similar)

# 3. In this repository: .env.local contains
#    EXPO_PUBLIC_API_URL=http://localhost:5003
npm run android:dev-build   # or, with the build installed: npx expo start --dev-client
```

- Neither the PC's firewall nor `0.0.0.0` is needed: the API only listens on the PC's `localhost`.
- `adb reverse` is lost when the cable is unplugged or the phone restarts; run it again.
- Only a **development bundle** sends a token to `http://localhost` (or `http://10.0.2.2` in the emulator). A **release build sends tokens over HTTPS only**, and its Android manifest does not allow cleartext HTTP at all. To test a release build against the API, put the API behind HTTPS with a certificate the phone trusts.
- [api-targets.md](api-targets.md) describes `scripts/Set-ApiTarget.ps1`, which switches `.env.local` between this local address and an HTTPS-hosted API.

## Sign-in checklist

The automated tests cover the sign-in logic with fakes for the browser,
Entra's token endpoint and SecureStore. Full authentication and token storage
still require a verified run in the development build with a real Microsoft
account. Before testing, run the
[preflight](entra-login.md#preflight-check-both-registrations) for **both** app
registrations and check that the `[auth] Microsoft login:` line says `/common/`.
Test a personal account and a work or school account separately. The sign-in design is described in
[entra-login.md](entra-login.md).

| # | Test | Expected |
|---|---|---|
| 1 | Tap **Log ind med Microsoft**, sign in with a work or school account | Custom Tab opens Microsoft's sign-in, returns to the app via `roombookingdev://auth`; the panel shows *…arbejds- eller skolekonto*, name and e-mail |
| 1b | **Log ud**, then sign in with a personal account (Outlook.com, Hotmail or Live.com) | The panel shows *Logget ind med en personlig Microsoft-konto*, name and e-mail; in live mode *Registreret i Room Booking som …* |
| 2 | First sign-in in a tenant | The consent screen lists Room Booking API; after consent the sign-in completes. With consent refused: *Microsoft afviste login…* |
| 3 | Close the Custom Tab without signing in | *Login blev annulleret.*, no error |
| 4 | Live mode with the API over `adb reverse` (see [above](#sign-in-against-a-local-api-over-usb)) | First sign-in: *Du er nu registreret i Room Booking som …*, *Du er ikke medlem af en organisation endnu* and a Bruger-ID; the API log shows `Registered user {id}` and no 401 |
| 4a | Close the app completely, start it again (or **Log ud** and sign in with the same account) | *Registreret i Room Booking som …* with the **same** Bruger-ID; the API log shows no new `Registered user` line |
| 4b | The same API over Wi-Fi (`http://<LAN IP>:5003`) | Search and booking work; the panel says the token is not sent over an insecure connection; the API log shows no `Authorization` header |
| 4c | Set `Organizations__InitialLegacyOwnerUserId` to the Bruger-ID, restart the API, then close the app completely and open it again | *Din organisation*: *Legacy (standardorganisation) · Ejer*; the API log says the user is now the first Owner |
| 5 | Close the app completely and start it again | Still signed in, without a new browser sign-in |
| 6 | Leave the app for more than an hour (or until the access token expires), then search | The search works; the token was renewed silently |
| 7 | Flight mode, restart the app | Signed in with the warning *Kunne ikke få forbindelse til Microsoft…*; with the network back, the next search works |
| 8 | Revoke the sessions (Entra admin center → user → *Revoke sessions*, or change the password), then restart the app | Signed out with *Din Microsoft-session er udløbet* |
| 9 | **Log ud**, then **Log ind med Microsoft** | Signed out at once; the next sign-in shows the account picker |
| 10 | `adb shell run-as io.github.kris7011.roombooking.dev cat shared_prefs/SecureStore.xml` while signed in, and again after sign-out | Signed in: `…roombooking.auth.v1.*` entries whose values are ciphertext, no readable token. After sign-out: no such entries |
| 11 | Metro and `adb logcat` during 1–9 | No token, code or code verifier appears in the logs |
| 12 | Expo Go (`npm run android:go`, or Expo Go's list of recent projects) | The panel says *Microsoft-login virker ikke i Expo Go … Åbn appen "Room Booking"*; demo booking works |

## Invitation links

`roombookingdev://invitation?token=…` should open the app with the invitation
code filled in (see [organisations.md](organisations.md#invitation-links)).
Parsing is unit-tested; opening the link on a device has not been done. With
the development build running:

```powershell
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "roombookingdev://invitation?token=<code>" io.github.kris7011.roombooking.dev
```

## Time-handling checklist

How the app keeps the suggested time current is described in
[time-handling.md](time-handling.md). Install the development build
(`npm run android:dev-build`) or run in Expo Go (`npm run android:go`). Turn
off battery optimisation for the app only if a step behaves differently with
it on, and note it.

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
