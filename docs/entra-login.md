# Microsoft Entra ID sign-in

How the app signs users in with Microsoft Entra ID, how to configure it, the
manual steps in the Entra admin center, and how to troubleshoot it. The
design decision is recorded in
[ADR 0001](adr/0001-native-sign-in-and-token-storage.md); device test steps
are in [device-testing.md](device-testing.md).

**Status:** implemented and covered by automated tests with fakes for the
browser, Entra's token endpoint and SecureStore. On 26 October 2026 a
sign-in with a **personal** Microsoft account completed in the Android
development build on a Samsung, and the session survived restarts; a work or
school account has not been tried (see
[device-testing.md](device-testing.md#current-status)). iOS has never been
built.

## Where sign-in is available

On Android and iOS, the app can sign in with a personal Microsoft account
(Outlook.com, Hotmail, Live.com) or a work or school account. Sign-in is
**optional**: searching and booking work without it, in demo mode and against
the API's original endpoints.

- **Web:** no sign-in. Browser sign-in is not implemented, neither in this
  app's Expo web build nor in the Angular web client in the
  [meeting-room-booking](https://github.com/kris7011/meeting-room-booking)
  repository. Both call the API's original endpoints without a token.
- **Expo Go:** switched off (detected with `isRunningInExpoGo()` from `expo`).
  Microsoft redirects to `roombookingdev://auth`, which only the development
  build can receive, so a sign-in started in Expo Go could never finish.
- **Android development build:** the supported way to sign in, see
  [android-development-build.md](android-development-build.md).

## How it works

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
- **Scopes:** `openid profile offline_access` plus the API scope (`EXPO_PUBLIC_ENTRA_API_SCOPE`). `offline_access` gives the refresh token. The response must contain the API scope, otherwise the sign-in fails with a consent message.
- **Accounts:** the default authority `common` signs in both **personal Microsoft accounts** (Outlook.com, Hotmail, Live.com) and **work or school accounts** of any tenant. Microsoft asks which kind when an address exists as both. A personal account belongs to Microsoft's consumer tenant `9188040d-6c67-4c5b-b112-36a304b66dad` and is checked like any other tenant; the panel says *Logget ind med en personlig Microsoft-konto* or *…arbejds- eller skolekonto*.
- **Who is shown:** the name comes from the ID token, after checking its audience (this app), issuer (`https://login.microsoftonline.com/{tid}/v2.0` for its own tenant), expiry and `oid`. That is for display only. **The app never decides who the user is**: in live mode it asks the API (`GET /api/me`), which validates the access token itself, and the panel says *Registreret i Room Booking som …* only after that (see the next point). In demo mode it says the identity is not confirmed by an API.
- **Registration in Room Booking:** after sign-in the app asks `GET /api/me` (read-only). If the API has no user for the identity yet (`user: null`), the app calls `POST /api/me/registration` once, and the panel says *Du er nu registreret i Room Booking som …*; on every later sign-in *Registreret i Room Booking som …*, after one GET and without writing anything. The API keys the user by the token's validated issuer and `oid`, never by e-mail, and registering again or twice at the same time returns the same user. The app sends no body: it never tells the API who the user is. The panel also shows the user's **Bruger-ID** (the API's public ID) and the organisations the user belongs to with their role (*Ejer*, *Administrator*, *Medlem*). A new user belongs to **no organisation**, and the panel says so: access comes through an invitation from an Owner or Admin, and the first Owner of the standard (legacy) organisation is named by whoever runs the API, from that Bruger-ID (see the API reference, [Registration and organisation access](https://github.com/kris7011/meeting-room-booking/blob/main/docs/api-reference.md#registration-and-organisation-access)). A disabled account gets *Din Room Booking-konto er deaktiveret…*; a failed registration can be retried with *Prøv igen*; an API without the registration endpoint is reported as such. Searching and booking work as before in every case.
- **Storage:** only the **refresh token** and the display data are stored, in **Expo SecureStore** (Android Keystore / iOS Keychain with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, excluded from Android Auto Backup). Long values are split into chunks, because some platforms reject SecureStore values over about 2 KB. The **access token is kept in memory only**. Nothing is written to `AsyncStorage`, logs or Git.
- **Expiry and refresh:** before every API request, `getAccessGrant()` returns the token if it is valid for more than 2 more minutes, otherwise it refreshes it. Parallel requests share one refresh. Entra's rotated refresh token replaces the stored one. After an app restart the stored session is checked with Microsoft right away.
  - refresh token expired or revoked (`invalid_grant`, `interaction_required`, for example after a password change or a Conditional Access policy) → signed out, session deleted, *Din Microsoft-session er udløbet. Log ind igen.*
  - offline or Microsoft unavailable → still signed in with a warning; the next request tries again
  - `401` from the API → one forced refresh and one retry, then a message
- **Sign-out** forgets the tokens and deletes everything in SecureStore. A refresh or a sign-in that finishes after sign-out is ignored and cannot bring the session back, and a token renewed while the sign-out happened (for example while SecureStore was still saving the rotated refresh token) is never handed to a request. **A request never changes identity:** its token is bound to the session that was current when the request started. If the user signs out, or out and in as someone else, while the request waits for a renewed token, the request is **aborted and not sent**, neither anonymously nor as the new user (*Handlingen blev ikke udført, fordi du loggede ud eller skiftede konto…*). The HTTP client checks this again synchronously right before `fetch`. The automatic retry after a 401 belongs to the same session as the first attempt: the original grant is checked before the forced renewal and again after it, so a retry is never sent as a user who signed in after the first attempt (it is aborted with *session-changed*). A request that starts while nobody is signed in is anonymous exactly as before, so anonymous booking is unchanged. A failed delete is reported only while still signed out, never over a newer sign-in. A request that had already been sent when the user signed out cannot be called back, but it is not retried with a renewed token after a 401. The Microsoft session in the browser stays; the next sign-in shows the account picker (`prompt=select_account`), so another account can be chosen.
- **API calls:** `src/api/http-client.ts` gets the token from the one `AccessTokenProvider` (the `AuthController`) and adds `Authorization: Bearer …`. Nobody signed in → no header.
- **Transport:** a release build sends tokens **over HTTPS only**. A development bundle (`__DEV__`) also sends them over HTTP to the device itself (`localhost`, `127.0.0.0/8`, `::1`) and to `10.0.2.2` (the emulator's alias for the PC), because that traffic never crosses a network; see [device-testing.md](device-testing.md#sign-in-against-a-local-api-over-usb). Plain HTTP to any other address, a private Wi-Fi address included, never gets a token: the request is sent without it and the token is not even renewed for it. See [ADR 0002](adr/0002-api-target-and-token-transport.md).
- **Errors** (`src/auth/auth-errors.ts`): cancelled, access denied, consent missing, configuration errors (for example `AADSTS50011` redirect URI mismatch or `AADSTS7000218` when the redirect is registered as *Web*), state mismatch, expired session, network, timeout and storage errors each get a Danish message with the AADSTS code, never a token.

## Configuration

Set in `.env.local` (gitignored; restart Metro after changing it). Start from
[`.env.example`](../.env.example):

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_ENTRA_CLIENT_ID` | Application (client) ID of the **mobile app's** registration |
| `EXPO_PUBLIC_ENTRA_API_SCOPE` | Full scope of the **API's** registration, `api://<API client ID>/access_as_user` |
| `EXPO_PUBLIC_ENTRA_TENANT` | `common` (personal Microsoft accounts and any work or school tenant, the default; personal accounts also need both registrations to allow them, see [Manual steps](#manual-steps-in-the-microsoft-entra-admin-center)), `organizations` (work or school accounts only), or one tenant ID or domain |

These are identifiers, not secrets, and end up in the app bundle. Without them the app runs without sign-in. Invalid values (a client ID that is not a GUID, a bare scope name, a scope of the app's own registration, `consumers`, which would shut out work and school accounts) switch sign-in off and the panel says why.

The API must run with its Entra token validation configured (`Entra__ApiClientId`; on the API's `main` branch since [meeting-room-booking#9](https://github.com/kris7011/meeting-room-booking/pull/9)). Against an older API the panel says *API'et understøtter endnu ikke login* (404); against an API without that setting, *API'et er ikke sat op til Microsoft-login* (503). Booking still works in both cases.

## Manual steps in the Microsoft Entra admin center

**Mobile app registration** (the one in `EXPO_PUBLIC_ENTRA_CLIENT_ID`):

1. **Authentication → Add a platform → Mobile and desktop applications**, custom redirect URI `roombookingdev://auth`. **Not** *Web* (that requires a client secret, `AADSTS7000218`) and not *Single-page application*.
2. **Authentication → Advanced settings → Allow public client flows**: can stay *No* for this flow. Create no client secret or certificate.
3. **API permissions → Add a permission → My APIs → Room Booking API → Delegated → `access_as_user`**, requested as `<API Application ID URI>/access_as_user`. `openid`, `profile` and `offline_access` need no extra permission. Grant admin consent if users of the tenant may not consent themselves.
4. Supported account types: *Accounts in any organizational directory and personal Microsoft accounts* (`"signInAudience": "AzureADandPersonalMicrosoftAccount"`) for `common`; *Accounts in any organizational directory* is enough for `organizations`. For work or school users from other tenants, an administrator there must consent to the app; personal accounts consent for themselves.

**API registration**: see the API's [Entra setup](https://github.com/kris7011/meeting-room-booking/blob/main/docs/entra-setup.md): the same supported account types, scope `access_as_user` under *Expose an API*, and `requestedAccessTokenVersion: 2` in the manifest (required for personal accounts). The API accepts personal accounts while `Entra:AllowPersonalAccounts` is `true`, the default. `knownClientApplications` on the API registration is left unchanged; whether it is needed has not been settled, because the first-consent test on a device has not been run yet.

**Both registrations must allow personal accounts.** The app requests the API's scope at sign-in, and Microsoft's `/common/` page accepts a personal account only if the mobile registration **and** the registration of every requested API allow personal accounts. If either one does not, the page refuses a Hotmail or Outlook.com address itself, with the same message as the `/organizations/` page (*Du kan ikke logge på her med en privat konto…*). The app gets no error back, because Microsoft never redirects.

### Preflight: check both registrations

Read-only, with the Azure CLI signed in to the tenant that owns the registrations (`az login`). The two IDs are the GUIDs in `.env.local`. They are different: the mobile app's client ID is in `EXPO_PUBLIC_ENTRA_CLIENT_ID`, and the API's is inside `EXPO_PUBLIC_ENTRA_API_SCOPE`.

```powershell
# Mobile app registration
az ad app show --id <mobile client ID> --query "{signInAudience:signInAudience, mobileRedirectUris:publicClient.redirectUris, webRedirectUris:web.redirectUris, accessTokenVersion:api.requestedAccessTokenVersion, secrets:length(passwordCredentials), permissions:requiredResourceAccess[].resourceAppId}"

# API registration (the GUID from api://<API client ID>/access_as_user)
az ad app show --id <API client ID> --query "{signInAudience:signInAudience, identifierUris:identifierUris, accessTokenVersion:api.requestedAccessTokenVersion, scopes:api.oauth2PermissionScopes[].{value:value, enabled:isEnabled}}"
```

| Registration | Field | Expected |
|---|---|---|
| Mobile | `signInAudience` | `AzureADandPersonalMicrosoftAccount` |
| Mobile | `mobileRedirectUris` | contains `roombookingdev://auth`; `webRedirectUris` does not |
| Mobile | `secrets` | `0`: the app is a public client |
| Mobile | `permissions` | contains the API's client ID (delegated `access_as_user`) |
| API | `signInAudience` | `AzureADandPersonalMicrosoftAccount` |
| API | `identifierUris` | `api://<API client ID>`, the same prefix as `EXPO_PUBLIC_ENTRA_API_SCOPE` |
| API | `accessTokenVersion` | `2` |
| API | `scopes` | `access_as_user`, enabled |

To find out **when** a registration's supported account types changed (for example to match a failed attempt against the configuration at that time), read the directory audit log (kept for 7 days without an Entra ID P1/P2 licence):

```powershell
az rest --method get --url "https://graph.microsoft.com/v1.0/auditLogs/directoryAudits?`$filter=category eq 'ApplicationManagement'" --query "value[?activityDisplayName=='Update application'].{when:activityDateTime, app:targetResources[0].displayName, changes:targetResources[0].modifiedProperties[?displayName=='SignInAudience']}"
```

Change registrations only in the Entra admin center or with the owner's approval; the commands above read nothing but configuration.

This setup is for the development build `io.github.kris7011.roombooking.dev`. A release build would need a second registration (or a second redirect URI) with the release app's scheme; release builds are not implemented.

## Troubleshooting

First check **which app** runs and **which sign-in page** it opens. On the phone, the app's icon is **Room Booking** (`io.github.kris7011.roombooking.dev`), not Expo Go. In development, Metro and `adb logcat` show one line when the app starts:

```
[auth] Microsoft login: https://login.microsoftonline.com/common/oauth2/v2.0/authorize (work or school accounts, and personal Microsoft accounts if the mobile and the API registration both allow them)
```

```powershell
adb logcat -s ReactNativeJS:V | Select-String '\[auth\]'
```

The line shows the authority only. Whether `/common/` accepts personal accounts also depends on both app registrations, which the app cannot see: check them with the [preflight](#preflight-check-both-registrations).

| Symptom | Cause | Fix |
|---|---|---|
| *Du kan ikke logge på her med en privat konto. Brug din arbejds- eller skolekonto i stedet.* after typing a Hotmail or Outlook.com address | Microsoft's page allows work and school accounts only. Any **one** of these causes it: **(1)** the API registration does not allow personal accounts; **(2)** the mobile registration does not allow personal accounts; **(3)** the sign-in page is `…/organizations/…` or one tenant instead of `…/common/…`. On the page itself the three look the same. | Run the [preflight](#preflight-check-both-registrations): both `signInAudience` must be `AzureADandPersonalMicrosoftAccount`, and the API's `accessTokenVersion` must be `2`. Then check the `[auth] Microsoft login:` line. If it does not say `/common/`, set `EXPO_PUBLIC_ENTRA_TENANT=common` (or remove it) in `.env.local`. Stop Metro and start it again with `npx expo start --dev-client --clear`, because `EXPO_PUBLIC_` values are read when Metro starts. Then open **Room Booking**, not Expo Go. |
| The panel says *Microsoft-login virker ikke i Expo Go* | The project was opened in Expo Go | Open the **Room Booking** app; with Metro running it loads the same code |
| *Microsoft-login er ikke sat korrekt op (AADSTS50011)* | Redirect URI `roombookingdev://auth` not registered as *Mobile and desktop applications* | Register it, see [Manual steps](#manual-steps-in-the-microsoft-entra-admin-center) |
| *…du kunne ikke oprettes som bruger i Room Booking* | The API answered `GET /api/me` but not `POST /api/me/registration` | Check the API log; *Prøv igen* repeats the check (registration is idempotent, so retrying never creates a second user) |
| *API'et understøtter endnu ikke registrering af brugere* | The API is older than the registration endpoint | Run the API from its current `main` branch |
| Signed in, but no *Registreret i Room Booking som …* | The API is not reachable with a token, or validates differently | `adb reverse tcp:5003 tcp:5003` (lost when adb restarts or the cable is unplugged), the API running with `Entra__ApiClientId`; `GET http://localhost:5003/api/me` without a token must answer `401` with `WWW-Authenticate: Bearer` (503 means `Entra:ApiClientId` is missing) |
| The app shows the launcher or *Cannot connect to Expo CLI* | The phone does not reach Metro | Start Metro, and over USB run `adb reverse tcp:8081 tcp:8081` too |

The app never sends `domain_hint` or `login_hint`: on `/common`, Microsoft decides from the e-mail address whether it is a personal or a work or school account, and a hint would shut out the other kind.
