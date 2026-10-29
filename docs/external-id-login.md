# E-mail sign-in with a one-time code (Microsoft Entra External ID)

The app can offer a second way to sign in next to Microsoft accounts: an
e-mail address and a one-time code that Microsoft sends to it, through an
**external tenant** of Microsoft Entra External ID. The first sign-in with
an address also signs the person up. Room Booking stores no password and
sends no e-mail itself. The decision is in
[ADR 0005](adr/0005-email-sign-in-through-external-id.md); the API side and
the owner's tenant set-up are in the backend's
[external-id-setup.md](https://github.com/kris7011/meeting-room-booking/blob/main/docs/external-id-setup.md).

**Status.** Implemented and covered by unit tests with fake tokens. **Not
run against Microsoft**: the external tenant does not exist yet, so the
[device checklist](#device-checklist) below is open.

## How it works

Code: [`external-id-config.ts`](../src/auth/external-id-config.ts),
[`authorize-request.ts`](../src/auth/authorize-request.ts),
[`id-token.ts`](../src/auth/id-token.ts) (`readExternalIdTokenUser`),
[`auth-controller.ts`](../src/auth/auth-controller.ts),
[`auth-runtime.native.ts`](../src/auth/auth-runtime.native.ts),
[`AccountPanel.tsx`](../src/components/AccountPanel.tsx).

- **Same flow as Microsoft sign-in, another authority.** Authorization code
  with PKCE in the system browser, redirect `roombookingdev://auth`, no
  secret. The endpoints are the external tenant's:
  `https://{subdomain}.ciamlogin.com/{tenant ID}/oauth2/v2.0/authorize` and
  `…/token`. Scopes: `openid profile offline_access` and the API scope of
  the API's registration **in the external tenant**.
- **A fresh code every time.** The request sends `prompt=login`, so after
  *Log ud* the page asks for the address again and sends a new code instead
  of reusing the browser's last e-mail session. Microsoft sign-in keeps
  `prompt=select_account`.
- **One session, with its provider.** `AuthUser.provider` is `entra` or
  `external-id`. It is stored with the refresh token, and the session is
  renewed by the same provider's token endpoint. A session stored before
  this change has no provider and is a Microsoft session, so existing
  sign-ins keep working. A renewal whose ID token names another user ends
  the session.
- **ID token for display only.** `readExternalIdTokenUser` checks the
  audience (the app's External ID client ID), `tid` (the external tenant),
  the exact issuer `https://{tenant ID}.ciamlogin.com/{tenant ID}/v2.0` and
  the lifetime. The API validates the access token itself and decides who
  the user is (`GET /api/me` answers `provider: "ExternalId"`).
- **Optional and isolated.** E-mail sign-in is offered only when all four
  settings below are valid, and only next to Microsoft sign-in. A missing
  or broken External ID setting never switches Microsoft sign-in off; the
  development log says why it is not offered. A stored e-mail session in a
  build without these settings is signed out and deleted, never sent to
  Microsoft's endpoint.
- **Invitations.** The API never trusts the `email` claim of an External ID
  token. When an e-mail user accepts an invitation, the API looks up the
  address of their e-mail account in Microsoft Graph on their behalf
  (backend [external-id-setup.md](https://github.com/kris7011/meeting-room-booking/blob/main/docs/external-id-setup.md#e-mail-addresses)).
  Without the API's client secret, or if that lookup fails, accepting
  answers *verified_email_required* ("Dit login giver ikke en bekræftet
  e-mailadresse …"). The app sends nothing extra: the API decides.

## Configuration

In `.env.local` (gitignored), next to the Entra ID values; see
[.env.example](../.env.example):

```text
EXPO_PUBLIC_EXTERNAL_ID_CLIENT_ID=<mobile app's client ID in the external tenant>
EXPO_PUBLIC_EXTERNAL_ID_TENANT_ID=<external tenant ID>
EXPO_PUBLIC_EXTERNAL_ID_TENANT_SUBDOMAIN=<e.g. roombookingdev>
EXPO_PUBLIC_EXTERNAL_ID_API_SCOPE=api://<API's client ID in the external tenant>/access_as_user
```

These are identifiers, not secrets. After changing them, restart Metro
(`npx expo start --dev-client --clear`): `EXPO_PUBLIC_` values are inlined
at bundle time. No native rebuild is needed for them; the development build
must be current with `main` for other reasons (see
[device-testing.md](device-testing.md#rebuilding-the-development-build)).

## Device checklist

Run on the Samsung development build against the local API started with the
`ExternalId__*` settings (backend `external-id-setup.md`), on an isolated
database copy. Record each result as logged or owner report.

| # | Step | Expected |
| --- | --- | --- |
| X1 | Metro log at start | `[auth] E-mail one-time-code login: https://<subdomain>.ciamlogin.com/<tenant ID>/oauth2/v2.0/authorize` |
| X2 | Signed out: the account panel | *Log ind med Microsoft* and *Log ind med e-mail-kode* |
| X3 | *Log ind med e-mail-kode*, enter an address, enter the code from the e-mail (first time: sign-up with display name) | Back in the app: *Logget ind med e-mail-kode*, the name, and *Registreret i Room Booking som …*; the API log shows `GET /api/me` 200 and `POST /api/me/registration` 201 |
| X4 | Close the app completely and open it again | Still signed in with the e-mail session, no browser |
| X5 | *Log ud*, then *Log ind med Microsoft* | The Microsoft account picker; the existing Microsoft user and organisations as before |
| X6 | *Log ud*, then *Log ind med e-mail-kode* again | The page asks for the address and sends a new code; afterwards the same Room Booking user as in X3, not a new one |
| X7 | Create an organisation as the e-mail user | Created, the e-mail user is its Owner |
| X8 | Cancel the e-mail page (back button) | *Ikke logget ind* with the cancel notice; nothing stored |
