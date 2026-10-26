# Testing on a physical Android device

What has and has not been verified on a real phone, and the manual
checklists for the parts that only a device can show: Microsoft sign-in,
SecureStore, deep links, the keyboard and time handling with a real clock.

Building and installing the development build is described in
[android-development-build.md](android-development-build.md).

## Current status

The successful checks of 26 October 2026 ran on one **Samsung SM-A057G**
(Android) with the **development build**
(`io.github.kris7011.roombooking.dev`, not Expo Go), signed in with the
owner's **personal Microsoft account**, against the local API over USB
(`adb reverse`, see [below](#sign-in-against-a-local-api-over-usb)). Only one
Microsoft account was available. The earlier, unsuccessful sign-in attempts
of 23 October ran in **Expo Go**; their timeline is kept separately under
[Personal-account rejection](#personal-account-rejection-23-october-2026).

Each result says where it comes from:

- **Owner report**: the owner did the step by hand and reported the outcome
  (issue #16, 26 October 2026). Nothing independent was recorded for that
  step.
- **Logged**: an independent technical observation recorded over `adb`
  (`logcat`, screen captures, the API's log or database). It covers only
  what the record shows, not a manual step done outside it. The captures show
  personal data and were not kept.
- **PR #n**: recorded in that pull request's description.

| Check | Result | Evidence |
|---|---|---|
| Development build built (`expo run:android`), installed and started | Passed, 22 October; rebuilt after `e104927` and installed again, 26 October | PR #6; logged |
| Metro logs `[auth] Redirect URI: roombookingdev://auth`; `adb` delivers that link to `.MainActivity` | Passed | PR #6 |
| Sign-in configuration in the running development build: package `io.github.kris7011.roombooking.dev`, authority `/common/`, `roombookingdev://auth` registered as the redirect handler | **Passed**, 26 October | logged (`logcat`) |
| A new interactive Microsoft sign-in with the personal account on `/common/`: the browser returns to the development build via `roombookingdev://auth` | **Passed**, 26 October | owner report. No `logcat` of this sign-in was captured |
| The app shows the personal account and *Registreret i Room Booking som …* (restored authenticated state) | **Passed**, 26 October | logged |
| Session restored after the app is closed completely (`am force-stop`, and reopened from the launcher), same user, no new browser sign-in | **Passed**, 26 October | logged (several cold starts); owner report |
| **Log ud**, then a new interactive sign-in with the same account | **Passed**, 26 October | owner report |
| Existing memberships (Legacy and Test ApS, role *Ejer*) shown after sign-in | **Passed**, 26 October | owner report; logged |
| Signed-in booking in Test ApS: search, book, see it in *Kommende bookinger*, still there after restarting the app | **Passed**, 26 October | owner report. The booking was on screen during the checks below (logged, read only) |
| [Organisation administration as Owner](#organisation-administration-checklist-26-october-2026) | **Passed**, 26 October; Admin, Member and invitee views not run | logged |
| Signed-in requests to a `127.0.0.1`-only API through `adb reverse tcp:5003 tcp:5003` | **Passed**, 26 October | logged (API log) |
| Work or school account sign-in | **Not run**: no such account available | – |
| First sign-in of a new, unregistered account | **Not run**: needs a second account | – |
| Remaining [sign-in checklist](#sign-in-checklist) steps 2, 3, 6, 7, 8, 10, 11, 12 (consent, cancel, silent renewal after an hour, offline start, revoked session, SecureStore contents, logs free of tokens, Expo Go message) | **Not run** | – |
| [Invitation link](#invitation-links) opened on the device | **Not run** | – |
| [Time-handling checklist](#time-handling-checklist) | **Not run** | PR #4, PR #5 |
| Hosted HTTPS API with sign-in ([api-targets.md](api-targets.md)) | **Not run** | PR #9 |

iOS has never been built, on a simulator or a device. No release build exists.

The automated tests do not replace these checks: the unit tests use fakes for
the browser, Entra and SecureStore, and the web E2E tests run without
sign-in. They do not prove native sign-in. Who may do what is enforced by
the API and proven by its integration tests, including the roles that could
not be tried on the phone (see the API's
[role and permission matrix](https://github.com/kris7011/meeting-room-booking/blob/main/docs/role-permission-matrix.md)).

## Organisation administration checklist, 26 October 2026

The existing Owner experience, with the one available account (issue #18).
Steps 1–5 only read data and ran against the real development database.
Every step that writes ran against an **isolated copy**, so no real
organisation, room, member or invitation was changed:

1. A verified snapshot of the development database (the backend's
   `RoomBooking.DatabaseTool backup`, consistent while the API runs) was
   copied to a temporary folder.
2. A second API (`scripts/Start-Local.ps1 -Port 5013`) served the copy.
3. `adb reverse tcp:5003 tcp:5013` sent the phone's `localhost:5003` to it.
   The app was force-stopped and started again, so no open connection to the
   real API remained, and the second API's log showed the app's requests
   before anything was written. (The app's *API:* line still shows
   `http://localhost:5003`, the address built into the bundle.)
4. Afterwards `adb reverse tcp:5003 tcp:5003` restored the real API, the
   second API was stopped, and a new snapshot of the real database had the
   same per-table row counts and content hashes as before the test. The
   copies and screen captures were deleted.

| # | Step | Database | Result |
|---|---|---|---|
| 1 | *Aktiv organisation* shows Test ApS with *Ejer*, chips for Legacy and Test ApS | real, read only | Passed |
| 2 | Switch to Legacy: Legacy's three rooms, *(standardorganisation)*, and the Test ApS booking is no longer listed | real, read only | Passed |
| 3 | Switch back: Test ApS's rooms and booking return | real, read only | Passed |
| 4 | *Administrer organisation* in Test ApS: details and counts, *Omdøb organisation*, rooms with *Rediger*/*Arkivér*, invitation roles *Medlem*/*Administrator* only (never Owner), open invitations, members with role labels; no e-mail address or ID in the member list | real, read only | Passed |
| 5 | Android's back button returns to booking | real, read only | Passed |
| 6 | Cold start against the copy: session restored, Test ApS still active | copy | Passed |
| 7 | Create a test room | copy | Passed; count 2 → 3 |
| 8 | Edit its capacity | copy | Passed |
| 9 | Archive it (with confirmation) | copy | Passed; listed as *Arkiveret*, count 3 → 2 |
| 10 | Restore it | copy | Passed |
| 11 | Invite a synthetic `@example.com` address as Member | copy | Passed; the code is shown once, with its expiry (7 days); the open invitation lists address, role and inviter, not the code |
| 12 | Revoke that invitation (with confirmation) | copy | Passed; *Ingen åbne invitationer* |
| 13 | Demote the sole Owner to Member | copy | Passed: refused by the API (`last_owner`), message *Organisationen skal have mindst én ejer…*, role unchanged |
| 14 | *Forlad organisationen* as the sole Owner | copy | Passed: refused, membership unchanged in the database |
| 15 | Rename Test ApS | copy | Passed; the booking page shows the new name at once |
| 16 | Legacy's administration page offers no rename | copy, read only | Passed |
| 17 | *Del invitation* (Android share sheet) | – | Not run: it would hand the code to another app |
| 18 | Admin view, Member view, accepting an invitation as a new user | – | **Not run**: needs a second account. Covered by the API's integration tests |
| 19 | Changing another member's role, removing another member | – | **Not run**: Test ApS has no other member. Covered by the API's integration tests |

The database of the copy confirmed steps 7–15: the audit log recorded the
room creation, update, archive and restore, and the invitation's creation and
revocation, and no membership change.

**Finding:** the member list offers the sole Owner role chips and
*Forlad organisationen*, although the API refuses both. The refusal and its
message are correct; hiding the actions for a sole Owner would be a
usability improvement, not a security fix.

**Tooling note:** `uiautomator dump` was killed on this phone (low memory);
`adb exec-out screencap -p` worked.

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

**Resolved on 26 October:** in the rebuilt development build, `/common/`
and the redirect handler were configured and a restored personal-account
session reached the API (logged), and the owner signed out and signed in
again interactively (owner report); see
[Current status](#current-status). If the message appears again, write down
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
