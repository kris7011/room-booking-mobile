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
| Development build built (`expo run:android`), installed and started | Passed, 22 October; rebuilt after `e104927` and installed again, 26 October; **rebuilt from `main` `ccc8204`** (SDK 58 patches of PR #29) and installed as an update with the app's data kept, 28 October ([details](#rebuild-28-october-2026)) | PR #6; logged |
| Metro logs `[auth] Redirect URI: roombookingdev://auth`; `adb` delivers that link to `.MainActivity` | Passed | PR #6 |
| Sign-in configuration in the running development build: package `io.github.kris7011.roombooking.dev`, authority `/common/`, `roombookingdev://auth` registered as the redirect handler | **Passed**, 26 October | logged (`logcat`) |
| A new interactive Microsoft sign-in with the personal account on `/common/`: the browser returns to the development build via `roombookingdev://auth` | **Passed**, 26 October | owner report. No `logcat` of this sign-in was captured |
| The app shows the personal account and *Registreret i Room Booking som …* (restored authenticated state) | **Passed**, 26 October | logged |
| Session restored after the app is closed completely (`am force-stop`, and reopened from the launcher), same user, no new browser sign-in | **Passed**, 26 October; again on the rebuilt build, 28 October, both with the session from before the rebuild and with a fresh one | logged (several cold starts); owner report |
| **Log ud**, then a new interactive sign-in with the same account | **Passed**, 26 October; on the rebuilt build, 28 October (sign-in step 9) | 26 October: owner report. 28 October: logged, plus owner report of the account picker ([details](#sign-in-on-the-rebuilt-build-28-october)) |
| Existing memberships (Legacy and Test ApS, role *Ejer*) shown after sign-in | **Passed**, 26 October | owner report; logged |
| Signed-in booking in Test ApS: search, book, see it in *Kommende bookinger*, still there after restarting the app | **Passed**, 26 October | owner report. The booking was on screen during the checks below (logged, read only) |
| [Organisation administration as Owner](#organisation-administration-checklist-26-october-2026) | **Passed**, 26 October; Admin, Member and invitee views not run | logged |
| [Sole-Owner member list](#phase-5c-sole-owner-member-list) (PR #22, issue #20): no role chips or *Forlad organisationen* for the only Owner, and the explanation instead | **Passed**, 27 October (S1, S3, S5, S6); S2 not observable; S4 (TalkBack) not run | logged |
| [Phase 5D checks](#phase-5d-manual-checks-for-the-owner) D1–D8: booking retry after a lost connection, organisation access refresh, revoked and disabled access | **Passed**, 27 October, on an isolated database copy | logged |
| [Phase 5F checks](#phase-5f-manual-checks-for-the-owner) F1–F4: no request while restoring, disabled account shown as such, no CORS hint on Android, offline message once | **Passed**, 28 October, on the rebuilt build and an isolated database copy ([results](#phase-5f-f1f4)) | logged |
| [Day strip](#day-strip-smoke-test-pr-36-28-october-2026) (PR #36, issue #34): initial day visible, a partly hidden day revealed when tapped (both edges), no jump back to an older selection, search uses the chosen day | **Passed**, 28 October, JavaScript from `1c99a25` on the rebuilt build, isolated database copy (read only). A smoke test, not proof that the web race exists on Android | logged |
| Signed-in requests to a `127.0.0.1`-only API through `adb reverse tcp:5003 tcp:5003` | **Passed**, 26 October | logged (API log) |
| Work or school account sign-in | **Not run**: no such account available | – |
| First sign-in of a new, unregistered account | **Not run**: needs a second account | – |
| [Sign-in checklist](#sign-in-checklist) steps 10 and 11 (SecureStore contents, logs free of tokens) | **Passed**, 28 October, on the rebuilt build; step 11 covers steps 5, 7 and 9 only, in the `logcat` tags that were recorded ([details](#sign-in-on-the-rebuilt-build-28-october)) | logged |
| Remaining [sign-in checklist](#sign-in-checklist) steps 2, 3, 8, 12 (consent, cancel, revoked session, Expo Go message) | **Not run**; steps 6 and 7 passed on 27 October ([details](#phase-5c-sign-in-steps-still-open)), step 7 again on 28 October as F4 | – |
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
usability improvement, not a security fix. Addressed in Phase 5B (issue #20):
the list now offers the sole Owner neither and explains how to hand over
ownership; not yet re-checked on the device.

**Tooling note:** `uiautomator dump` was killed on this phone (low memory);
`adb exec-out screencap -p` worked.

## Phase 5C: manual checks for the owner

Written in Phase 5C (27 October 2026) for the checks that only the owner can
do on the Samsung. Every result below is **Not run** until it has been done
and recorded with its evidence label (*Owner report* or *Logged*, see
[Current status](#current-status)). Nothing here needs a second Microsoft
account or writes to the real development database.

### Before you start

1. **JavaScript from `main`.** The member-list change (PR #22) is JavaScript
   only. Since the development build installed on 26 October (from
   `7bf2153`), `package.json` only gained the dev-only ESLint packages
   (PR #21) and `app.json` is unchanged, so that build can load the current
   JavaScript without rebuilding. Start Metro from a checkout at `main`
   (`8282923` or later) that has your `.env.local`. If Metro is already
   running from an older checkout, stop it yourself and start it again from
   the updated one.
2. **API and USB** as in
   [Sign-in against a local API over USB](#sign-in-against-a-local-api-over-usb)
   (`adb reverse tcp:5003 tcp:5003`). If the development client cannot reach
   Metro over Wi-Fi (Windows Firewall), also run `adb reverse tcp:8081 tcp:8081`
   and open
   `exp+room-booking-mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`.
3. **Fresh JavaScript.** Force-stop the app and open it again, so it loads the
   new bundle and not a cached one.
4. Keep screenshots and logs to yourself: they show your name and e-mail.

### Phase 5C: sole-Owner member list

Read only: viewing the member list changes nothing. Expected texts are those
of `describeSoleOwner` in
[`organization-messages.ts`](../src/organizations/organization-messages.ts).

| # | Step | Expected | Result |
|---|---|---|---|
| S1 | Signed in, *Aktiv organisation* Test ApS, tap *Administrer organisation* | The administration page opens; *Medlemmer* lists you with *(dig)* and the role *Ejer* | **Passed**, 27 October. Logged |
| S2 | Look at your own row while the list is loading (often too fast to see; then record *not observable*) | No role chips and no *Forlad organisationen* while *Henter medlemmer…* shows | **Not observable**, 27 October: the list had loaded in the first capture after the tap |
| S3 | Your own row after loading (you are the only member and the only Owner) | No role chips, no *Forlad organisationen*; the text *Du er den eneste ejer og det eneste medlem. Inviter en anden og gør vedkommende til ejer, før du kan ændre din egen rolle eller forlade organisationen.* | **Passed**, 27 October: the view hierarchy ends with that text, no chip or button after it. Logged |
| S4 | TalkBack on, move to that text | TalkBack reads the explanation | Not run: needs the owner to listen |
| S5 | Back to booking, switch to Legacy, open *Administrer organisation* | If you are Legacy's only Owner and it has other members: no chips and no *Forlad organisationen* on your row, the text *Du er den eneste ejer, så du kan ikke ændre din egen rolle…*, and the chips and *Fjern fra organisationen* still offered on the other members' rows (do not tap them). If you are the only member: as S3 | **Passed**, 27 October: you are Legacy's only member, so as S3. Logged |
| S6 | Android back button, switch back to Test ApS | The booking page shows Test ApS's rooms and bookings, no Legacy data | **Passed**, 27 October: *Mødelokaler i Test ApS* with Testlokale 1 and 2, no Legacy room. Logged |

**Cannot be checked with one account:** a second Owner (each Owner then gets
chips and *Forlad organisationen* on their own row), and the Admin and Member
views of the list. These are covered by the unit tests in
`tests/organizations/organization-rules.test.ts`; the API still refuses
`last_owner` (backend `MemberManagementTests`).

### Phase 5C: sign-in steps still open

The remaining [sign-in checklist](#sign-in-checklist) steps that work with
the one personal account, in a suggested order. They change nothing in the
database.

| Step | What it shows | Result |
|---|---|---|
| 3 | Cancelled login: *Login blev annulleret.*, no error, still signed out | Not run |
| 9 | Logout, then sign-in again: signed out at once, the account picker appears | **Passed**, 28 October, on the rebuilt build: logged sign-out and sign-in; the account picker by owner report ([details](#sign-in-on-the-rebuilt-build-28-october)). Earlier: owner report, 26 October, no log |
| 7 | Offline start: flight mode, restart, signed in with *Kunne ikke få forbindelse til Microsoft…*; with the network back, a search works | **Passed**, 27 October: offline the text and *Prøv igen*; with the network back, *Prøv igen*, then `/api/me`, `/api/organizations` and a search answered `200`. Logged. (The account panel shows the text twice.) |
| 6 | Silent renewal after more than an hour in the background: a search works without a browser login | **Passed, indirectly**, 27 October: a cold start more than a day after the last use (26 October) reached the API (`/api/me` `200`) without a browser login, so the token was renewed silently. Logged; the renewal itself was not logged |
| 10 | SecureStore holds ciphertext only, and nothing after logout | **Passed**, 28 October. Logged ([details](#sign-in-on-the-rebuilt-build-28-october)) |
| 11 | No token, code or code verifier in Metro or `adb logcat` during the steps above | **Passed** for steps 5, 7 and 9 on 28 October, in the recorded `logcat` tags. Logged. Step 3 not run, so not covered |
| 8 | Revoked session (*Sign out everywhere* on account.microsoft.com, or a password change), then restart: *Din Microsoft-session er udløbet* | Not run; this signs the account out on every device |

Steps 1, 2 and the first sign-in of a new account need a work or school
account or a second account, and stay **Not run**.

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

## Phase 5D: manual checks for the owner

Written in Phase 5D (27 October 2026) for safe booking retries (mobile
PR #26, backend PR #18) and organisation access synchronisation (this PR).
The Phase 5C checks S1–S6 [above](#phase-5c-manual-checks-for-the-owner)
are separate. Each result below carries its evidence label (*Owner report* or
*Logged*); the [Phase 5E run](#phase-5e-run-27-october-2026) recorded D1–D8.
Nothing here needs a second Microsoft account.

**Automated already** (no device needed): the backend idempotency rules
(`BookingIdempotencyTests`, 28 cases, incl. an answer lost after `COMMIT` and
an API restart), the app's retry rules and synchronisation rules (`npm test`),
and in the web build a booking whose answer is dropped after the real API
saved it (`e2e/specs/booking-retry.spec.ts`). **Only the device can show**
the Android network stack, `AppState` on Android, and how the texts look.

### Before you start

1. **Merged code.** Backend `main` with PR #18, mobile `main` with PRs #26 and
   this one. JavaScript only: no development-build rebuild is needed
   (`expo-crypto` is already in the build; no native change).
2. **An isolated database copy, never the real file.** PR #18 adds a
   migration, and D4–D7 change rows by hand. Make a verified copy with the
   backend's DatabaseTool (backup, then restore to a **new** file; see the
   backend's `docs/local-portability.md`), start the API on it with
   `scripts/Start-Local.ps1 -DatabaseFile <copy> -Port 5013`, and point the
   phone at it with `adb reverse tcp:5003 tcp:5013`. Afterwards set
   `adb reverse tcp:5003 tcp:5003` again and stop only the 5013 API.
3. Force-stop and reopen the app so it loads the new bundle.
4. Keep screenshots and logs to yourself.

### Cutting the connection to the API

**Flight mode does not cut it.** The phone reaches the local API through
`adb reverse` over the USB cable, and flight mode leaves USB alone: on
27 October 2026 a search in flight mode still reached the 5013 API (*Logged*).
Flight mode only cuts the API when the app talks to it over Wi-Fi or mobile
data, for example a hosted API. Over USB, cut the API route itself:

```powershell
adb reverse --remove tcp:5003     # the phone's localhost:5003 now refuses connections
# wait until no connection to the API is left open (Kestrel closes idle
# keep-alive connections after 130 s; until then the app reuses them):
Get-NetTCPConnection -LocalPort 5013 -State Established -ErrorAction SilentlyContinue
# ...test the failure...
adb reverse tcp:5003 tcp:5013     # the route is back
```

Removing the rule does not close a connection that is already open, so
without the wait the next request can still succeed.

### Phase 5D: booking retries (PR #26)

| # | Step | Expected | Result |
|---|---|---|---|
| D1 | Search, open a room, type a title. [Cut the API connection](#cutting-the-connection-to-the-api), tap *Bekræft booking* | The warning *Vi ved ikke, om bookingen blev oprettet* with *Prøv igen*; title and name still filled in; **not** *Bookingen blev ikke oprettet* | **Passed**, 27 October; no request reached the API. Logged |
| D2 | Restore the API connection, tap *Prøv igen* | *Booking oprettet*; *Kommende bookinger* lists it **once** | **Passed**, 27 October: one `POST` → `201`, one booking and one `BookingCreationRequests` row in the copy. Logged |
| D3 | Repeat D1, then close the form (*Annuller*), restore the connection and search again | The warning stays above the results with the booking's title and time; *Prøv igen* there gives *Booking oprettet* once | **Passed**, 27 October: the warning named the title and *Ons 28. okt, 15:00–16:00*; one `POST` → `201`, one booking. Logged |

An answer lost *after* the server saved the booking cannot be produced on
purpose with the phone; it is covered by the backend and web E2E tests.

### Phase 5D: organisation access (this PR)

Run these SQL statements **only against the copy** (any SQLite tool, e.g.
Python's `sqlite3`), while the 5013 API runs. `Test ApS` is your
organisation in the copy; replace the name if yours differs.

```sql
-- P1: a placeholder second Owner (no Microsoft account behind it)
INSERT INTO "Users" ("PublicId", "DisplayName", "CreatedUtc")
VALUES ('5D5D5D5D-0000-4000-8000-000000000001', 'Placeholder Owner', 638000000000000000);
INSERT INTO "Memberships" ("OrganizationId", "UserId", "Role", "CreatedUtc")
SELECT o."Id", u."Id", 'Owner', 638000000000000000
FROM "Organizations" o, "Users" u
WHERE o."Name" = 'Test ApS' AND u."PublicId" = '5D5D5D5D-0000-4000-8000-000000000001';

-- P2: make yourself a Member of Test ApS (allowed: another Owner exists)
UPDATE "Memberships" SET "Role" = 'Member'
WHERE "OrganizationId" = (SELECT "Id" FROM "Organizations" WHERE "Name" = 'Test ApS')
  AND "UserId" <> (SELECT "Id" FROM "Users" WHERE "PublicId" = '5D5D5D5D-0000-4000-8000-000000000001');

-- P3: remove yourself from Test ApS
DELETE FROM "Memberships"
WHERE "OrganizationId" = (SELECT "Id" FROM "Organizations" WHERE "Name" = 'Test ApS')
  AND "UserId" <> (SELECT "Id" FROM "Users" WHERE "PublicId" = '5D5D5D5D-0000-4000-8000-000000000001');
```

| # | Step | Expected | Result |
|---|---|---|---|
| D4 | Test ApS active, *Administrer organisation* open. Run P1 and P2. Press Home, wait at least 30 s, return to the app | The administration page closes; *Din rolle i Test ApS er ændret* / *Du er nu medlem…*; the role badge says *Medlem*; *Administrer organisation* is no longer offered | **Passed**, 27 October. Logged |
| D5 | Run P3. Tap *Søg efter ledige lokaler* (no waiting) | The API refuses the search (`404 organization_not_found`, visible in the 5013 API log); the app switches to your other organisation (or onboarding) with *Du har ikke længere adgang til Test ApS* (the search error may flash briefly); no Test ApS rooms or bookings stay on screen | **Passed**, 27 October: search `404`, then *Du har ikke længere adgang til Test ApS … Appen viser nu Legacy.* and Legacy's rooms. Logged |
| D6 | [Cut the API connection](#cutting-the-connection-to-the-api), Home, wait at least 30 s, return | *Kunne ikke opdatere dine organisationer … Serveren afgør stadig, hvad du må.* with *Prøv igen*; the list stays | **Passed**, 27 October. Logged |
| D7 | Restore the API connection, tap *Prøv igen* | The warning disappears; the list is current | **Passed**, 27 October: one `GET /api/organizations` → `200`. Logged |
| D8 | Optional, on the copy: `UPDATE "Users" SET "DisabledUtc" = 638100000000000000 WHERE "PublicId" <> '5D5D5D5D-0000-4000-8000-000000000001';` then return to the app after 30 s | *Kunne ikke hente dine organisationer* with the disabled-account text; no organisation usable. Undo with `… SET "DisabledUtc" = NULL …` and *Prøv igen* | **Passed**, 27 October: `403`, *Din Room Booking-konto er deaktiveret.*, no organisation or booking area; after the undo, *Prøv igen* → `200`. Logged |

The 5013 API log shows one `GET /api/organizations` per return to the
foreground after 30 s, and none within 30 s (*Logged* evidence). Confirmed
on 27 October: a return after 10 s sent no request.

### Phase 5E run, 27 October 2026

S1–S6 and D1–D8 above ran on the Samsung SM-A057G, development build of
26 October, JavaScript from mobile `main` (`9660987`) served by Metro over
`adb reverse tcp:8081`. No rebuild was needed: since the build's commit
(`7bf2153`) only dev-only ESLint packages were added, none with native code.
The steps were driven over `adb` (taps, `uiautomator dump`, screen captures)
with the owner's existing session; nobody signed in during the run.

- **Database.** A verified `RoomBooking.DatabaseTool` backup of the real
  development database, restored to a new file. The API from backend `main`
  (`91349f0`) served that copy on port 5013; on start it took its own
  pre-migration backup and applied only `AddBookingCreationRequests` (PR #18)
  to the copy. Every SQL statement ran through a script that refused any file
  without that migration. The real database was never opened for writing:
  its SHA-256 and per-table fingerprint were the same before and after.
- **Isolation.** `adb reverse tcp:5003 tcp:5013`; the copy's API log showed
  the app's requests (`/api/me`, `/api/organizations`, rooms, bookings) before
  anything was written.
- **Observations, not defects of the tested features** (each fixed in
  Phase 5F, merged 28 October, and checked on the rebuilt development build
  the same day; see [below](#phase-5f-f1f4)):
  - While the session is restored at a cold start, the app sends one
    anonymous `GET /api/rooms` (answered `401`) before it knows it is signed
    in: `HomeScreen` renders the token-less `BookingArea` for every state
    other than `signed-in`. Nothing was seen on screen.
  - On Android, the *Kunne ikke opdatere dine organisationer* text includes
    the web-only hint *og – på web – at API'et tillader CORS fra denne side*.
  - With the account disabled (D8), the account panel still shows
    *✓ Registreret i Room Booking*; only the organisation panel reports the
    disabled account.
  - After the offline start (sign-in step 7), the account panel shows
    *Kunne ikke få forbindelse til Microsoft…* twice.

## Phase 5F: manual checks for the owner

Phase 5F fixes the four observations above in three pull requests, all
merged into `main` on 28 October 2026, each with regression tests that fail
on the previous behaviour:

| Pull request | Fix |
|---|---|
| #30 `fix/phase5f-session-restore-requests` | No booking area, and so no request, while the session is restored; none either when `/api/me` refused the user or failed (`chooseBookingArea`) |
| #31 `fix/phase5f-disabled-account-status` | An answer with `user_disabled` or `user_not_registered` makes the app ask `/api/me` again (`shouldRecheckIdentity`) |
| #32 `fix/phase5f-error-message-platform-and-duplicates` | The CORS hint only in the web build (`process.env.EXPO_OS`); the session warning hidden when the identity line already shows it (`sessionWarningToShow`) |

The three fixes are JavaScript only, but `main` also contains the SDK 58
patch update (#29, merged 28 October: `expo` 58.0.20, `expo-auth-session`
58.0.15, `expo-dev-client` 58.0.16, `expo-web-browser` 58.0.7), which
changes native modules. The development build installed on 26 October was
made with the older patches, so **rebuild it from `main` before F1–F4**.
That rebuild was made and installed on 28 October
([details](#rebuild-28-october-2026)), and F1–F4 passed on it
([results](#phase-5f-f1f4)).

### Rebuilding the development build

Prerequisites: the Android toolchain from
[android-development-build.md](android-development-build.md) (JDK 17,
Android SDK with platform-tools, `JAVA_HOME` and `ANDROID_HOME`), the phone on
USB with USB debugging on, and `.env.local` with
`EXPO_PUBLIC_API_URL=http://localhost:5003` and the two `EXPO_PUBLIC_ENTRA_*`
values (copy `.env.local`; it is not in Git). Build in a new, clean
worktree of `main` rather than a checkout with uncommitted work, and use a
short path such as `C:\rbf` (the 28 October build did both):

```powershell
git fetch origin
git worktree add --detach C:\rbf origin/main; cd C:\rbf
npm ci
npx expo-doctor              # expect 20/20
adb devices                  # the Samsung is listed as "device"
adb reverse tcp:8081 tcp:8081
npm run android:dev-build    # npx expo run:android: regenerates android/, builds, installs, starts Metro
```

After the install, check that Metro logs
`[auth] Redirect URI: roombookingdev://auth` and that a stored session is
restored (sign-in step 5); if the session is gone, sign in again. Sign-in
step 9 (**Log ud**, then **Log ind med Microsoft**) passed on the build
rebuilt on 28 October ([details](#sign-in-on-the-rebuilt-build-28-october)).
Repeat it, with `logcat` running, whenever a later rebuild changes the native
sign-in modules (`expo-auth-session`, `expo-web-browser`, `expo-secure-store`
or `expo-crypto`) or the redirect configuration (`scheme`, the Entra
redirect URI): the 28 October result covers only the build it was run on.

`expo run:android` (like `expo prebuild`) also rewrites two scripts in
`package.json`: `android` and `ios` become `expo run:android` and
`expo run:ios`. That edit is a side effect of the build, not a change to
commit. Build in a separate, disposable worktree so it cannot mix with
uncommitted work. There, check `git status` and `git diff package.json`
first: if the only change is the two rewritten scripts,
`git checkout -- package.json` reverts them. Do not run it in a checkout that had its own
uncommitted `package.json` changes before the build, because it would discard
them too; leave such a checkout as it is.

### Rebuild, 28 October 2026

| Item | Value |
|---|---|
| Source | `main` at `ccc8204` (all Phase 5F merges), in a new detached worktree under a short path; `.env.local` copied from the previous build's checkout (`EXPO_PUBLIC_API_URL=http://localhost:5003`, tenant `common`) |
| Dependencies (`npm ci`, resolved) | `expo` 58.0.20, `expo-auth-session` 58.0.15, `expo-dev-client` 58.0.16, `expo-web-browser` 58.0.7, `expo-secure-store` 58.0.2, `expo-crypto` 58.0.7, `expo-build-properties` 58.0.11, `react-native` 0.88.0, `react` 19.3.0. Expo Doctor 20/20 |
| Toolchain | Node 24.15.0, JDK 17.0.12, Gradle 9.4.1 (wrapper), `compileSdk` 37, `targetSdk` 36 |
| Build | `npx expo prebuild --platform android`, then `gradlew app:assembleDebug`: **BUILD SUCCESSFUL** in 14 min 31 s. All four ABIs (`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`), so the APK is 180,671,194 bytes; the 26 October APK was 70,493,477 bytes |
| Signing | Android debug certificate, SHA-256 `fac61745…033b9c`, the same as the installed 26 October build (checked with `apksigner` before installing) |
| Install | `adb install -r` (an update, no uninstall): **Success**. First-install time still 23 October, so the app's data stayed; `SecureStore.xml` byte-identical before and after. The APK on the phone afterwards has the build's SHA-256 (`7d6361fa…`) |
| After the install | Metro (`npx expo start --dev-client`) logged `[auth] Redirect URI: roombookingdev://auth` and the `/common/` authority line; the stored session was restored without a browser sign-in (F1) |

Building and installing were split, instead of the single
`npm run android:dev-build`, so that the signing certificate could be
compared before anything was installed. Android installs an update only when
the new APK is signed by a compatible signer, so with a different
certificate `adb install -r` fails. If that happens, build and sign again
with the original key (here, the debug keystore the installed build was made
with) when it is available. If it is not, stop and report the blocker: an
uninstall would delete the app's data and SecureStore, so it is not a step to
take as part of a verification. (Expo CLI also installs with
`adb install -r -d` and does not uninstall a development build by itself.)

### Phase 5F: F1–F4

F2 changes the database: use an isolated copy as in
[Phase 5D](#before-you-start-1), never the real development database. Turn
on the API's request log with
`${env:Logging__LogLevel__Microsoft.AspNetCore.Hosting.Diagnostics}='Information'`
before starting it.

| Step | What to do | Expected | Result |
|---|---|---|---|
| F1 | With a stored session: `adb shell am force-stop io.github.kris7011.roombooking.dev`, then start the app | The API log shows `/api/me` (`200`), then `/api/organizations` and the active organisation's rooms; **no** `GET /api/rooms` answered `401` | **Passed**, 28 October, on two cold starts: `/api/me` `200`, `/api/organizations`, the active organisation's rooms and bookings; no `401`; *✓ Registreret* without a browser sign-in. Logged |
| F2 | On the copy, D8's `UPDATE … "DisabledUtc" = 638100000000000000 …`, then return to the app after 30 s (or search) | The account panel shows *Din Room Booking-konto er deaktiveret. Kontakt en administrator, hvis det er en fejl.* with *Prøv igen*, and no *✓ Registreret*; no organisation panel and no booking area. The API log shows **one** extra `GET /api/me` answered `403`, not repeated. Undo (`… SET "DisabledUtc" = NULL …`), *Prøv igen* in the account panel: *✓ Registreret*, the organisations and the booking area return | **Passed**, 28 October. Returning after 35 s: one `GET /api/organizations` → `403`, then one `GET /api/me` → `403`; nothing more in the next 95 s in the foreground. The account panel showed the expected text with *Prøv igen*, no *✓ Registreret*, no organisation panel and no booking area. After the undo, *Prøv igen*: `/api/me` `200`, organisations, rooms and bookings, *✓ Registreret*. Logged |
| F3 | Cut the API connection as in [Cutting the connection](#cutting-the-connection-to-the-api), then *Prøv igen* on the room overview | The message ends *Tjek at backend kører, og at adressen passer til din enhed.* with no mention of CORS | **Passed**, 28 October, after 85 s until no connection was left open. The full text *Kunne ikke få forbindelse til API'et (http://localhost:5003). Tjek at backend kører, og at adressen passer til din enhed.*, with no "CORS" anywhere on screen, in the room overview (*Kunne ikke hente mødelokaler*, also after its *Prøv igen*), the search result, upcoming bookings, and *Kunne ikke opdatere dine organisationer* (the text that had the hint in Phase 5E). No request reached the API. With the route back, the overview's *Prøv igen*: one `GET …/rooms` → `200`, rooms shown. Logged |
| F4 | Sign-in step 7 again: flight mode, force-stop, start the app | *Kunne ikke få forbindelse til Microsoft…* appears **once**, on the line with *Prøv igen*; no booking area. With the network back, *Prøv igen*: *✓ Registreret*, organisations and rooms | **Passed**, 28 October: *Kunne ikke få forbindelse til Microsoft. Tjek internetforbindelsen og prøv igen.* once, beside *Prøv igen*; no booking area and no request to the API. Flight mode off, *Prøv igen*: `/api/me` `200`, organisations, rooms and bookings, *✓ Registreret*, and the message gone. Logged |

The room overview shows its own *Prøv igen* only after it failed to load,
and only until the first search (then the search result takes its place).
For F3 the overview was made to load again by switching to the other
organisation with the API cut (the booking area is keyed by organisation);
the active organisation was switched back afterwards.

### Phase 5F run, 28 October 2026

- **Build.** The [rebuilt development build](#rebuild-28-october-2026), with
  JavaScript from `main` `ccc8204` served by Metro over `adb reverse tcp:8081`.
- **Database.** A new verified `Backup-Local.ps1` backup of the real
  development database (its SHA-256 equals the Phase 5E backup's, so the data
  had not changed), restored with `Restore-Local.ps1` to a new file. The API
  from backend `main` (`91349f0`) served the copy on port 5013 with the
  request log on; at start it took its own backup and applied only
  `AddBookingCreationRequests` to the copy. The two F2 statements ran through
  a script that refuses any file without that migration. The real database
  had the same SHA-256 and per-table fingerprint before and after.
- **Driving.** Taps, `uiautomator dump` and `adb shell cmd connectivity
  airplane-mode` (F4) over `adb`, with the owner's existing session. The
  owner did the interactive sign-in (below).
- **Afterwards.** `adb reverse tcp:5003 tcp:5003` again, flight mode off,
  Legacy active as before, the copy's account enabled again, the 5013 API and
  Metro stopped.

### Sign-in on the rebuilt build, 28 October

| Check | Result | Evidence |
|---|---|---|
| Step 9: **Log ud**, then **Log ind med Microsoft** (owner, 12:09–12:10) | **Passed.** Samsung Internet opened for the sign-in and returned to the app; the app's SecureStore was rewritten, then `/api/me` `200`, organisations, rooms and bookings; *✓ Registreret*. No `Registered user` line, so the account kept its ID. The owner reports that Microsoft showed the account picker | logged; owner report (picker) |
| A first owner report of step 9, a few minutes earlier | Not counted: the recording showed no request and no browser activity in that window, so the owner repeated the step | – |
| Step 10: SecureStore | **Passed.** Signed in: `roombooking.auth.v1.meta` and `…refresh.0`, ciphertext with no readable token (names and lengths were inspected, values were never printed). After **Log ud** (tapped over `adb`): no `roombooking.auth.v1.*` entry; only the active-organisation preference stayed. The owner then signed in again: new auth entries, *✓ Registreret* | logged |
| Step 5 with the fresh session: force-stop, open from the launcher | **Passed**: no browser, `/api/me` `200`, no `401` | logged |
| Step 11: logs free of tokens | **Passed** for steps 5, 7 (F4) and 9: no JWT, `code=`, `code_verifier`, `access_token` or `refresh_token` in Metro's output or in `logcat` (tags `ReactNativeJS`, `ReactNative`, `AndroidRuntime`, `ActivityManager`; other tags were not recorded) | logged |

**Observation, by design:** right after **Log ud**, the app sends one
anonymous `GET /api/rooms`, answered `401` by the local API (which runs with
`LegacyApi__AllowAnonymous=false`), and the signed-out room overview shows
*Kunne ikke hente mødelokaler – API'et kræver login, eller din session er
udløbet. Log ind med Microsoft og prøv igen.* `chooseBookingArea` chooses the
original endpoints whenever there is no session, and its comment says a real
API answers them with `401` unless it runs in demo mode. This is not the
F1 restore case. Not requesting rooms at all while signed out against an
API that requires sign-in would be a possible follow-up.

After #31 (`fix/phase5f-disabled-account-status`), D8's expected result changes:
the account panel, not the organisation panel, reports the disabled account,
and the organisation panel is hidden.

Automated evidence (28 October, local, on a merge of the three branches with
`main`): 458 unit tests passed, type check and ESLint clean, Playwright E2E
37 passed against backend `main` (`91349f0`). An exported Android bundle
contains only the native network message; the web bundle keeps the CORS hint.
After the merges, the same results on `main` with #29 included, plus Expo
Doctor 20/20 ([release-readiness.md](release-readiness.md#6-phase-5f-merge-and-verification)).
None of this is a device result.

## Day-strip smoke test (PR #36), 28 October 2026

PR #36 changes how `DaySelector` reveals the chosen day (issue #34). The race
it fixes was shown on the web build only; this run checks that the shared
component still behaves on Android. It is a smoke test, not proof that the
race exists or is absent on native platforms.

- **Build.** The installed development build from `ccc8204` (the
  [rebuild of 28 October](#rebuild-28-october-2026)), not rebuilt: between
  `ccc8204` and `1c99a25`, `package.json`, `package-lock.json` and `app.json`
  are unchanged, only `DaySelector.tsx`, E2E code and documentation differ, and
  the installed dependency trees of the build checkout and the PR checkout were
  identical (735 packages). Metro served the JavaScript of `1c99a25` over
  `adb reverse tcp:8081`. Later commits on the branch change documentation
  only.
- **Database.** A new copy of the Phase 5F test copy, served by backend
  `main` (`91349f0`) on port 5013 through `adb reverse tcp:5003 tcp:5013`. The
  run only read data: the copy's per-table fingerprint was the same before and
  after, and the real development database's SHA-256 was unchanged.
- **Driving.** Taps and swipes over `adb`, with the owner's existing session
  (Legacy, 4 participants, 13:30–14:30). Chip positions and the selected state
  come from `uiautomator dump`; the strip spans x = 90–990 on the 1080 px
  screen.

| Check | Result |
|---|---|
| Initial day visible | *I dag, 28. okt* selected, at x = 90–267 |
| Tap the visible 57 px of *Søn, 1. nov*, cut off at the right edge | Selected and scrolled fully into view (792–956) |
| Tap the visible 55 px of *Man, 2. nov*, cut off at the left edge | Selected and scrolled fully into view (124–288) |
| Selections changed several times (*Søn 1.*, *Ons 4.*, *Man 2.*, *Fre 6. nov*); the strip swiped forward, back to the start and far forward between them | After each swipe, the strip stayed where it was left, also 3 s later; it never scrolled back to an earlier or the current selection on its own. A fully visible day (*Ons 4. nov*) was selected without scrolling |
| Search with *Fre, 6. nov* selected | `GET …/rooms/available?startUtc=2026-11-06T12:30:00.000Z&endUtc=2026-11-06T13:30:00.000Z&minCapacity=4` (13:30–14:30 Danish winter time); the results header showed *Fre 6. nov, 13:30–14:30* with 3 free rooms |

Afterwards: `adb reverse tcp:5003 tcp:5003` again, the 8081 forward removed,
the app force-stopped (its data and session kept), the 5013 API and Metro
stopped.

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
