# Linking a second way to sign in

A signed-in, registered user can add another login to their Room Booking
user: a second Microsoft account (for example a work account next to a
personal one) or an e-mail one-time code ([external-id-login.md](external-id-login.md)).
Afterwards both logins reach the same user, organisations and bookings.
Nothing is ever linked automatically, and never because two logins share an
e-mail address. The API's rules and the decision are in the backend's
[API reference](https://github.com/kris7011/meeting-room-booking/blob/main/docs/api-reference.md#linking-a-second-sign-in-identity)
and ADR 0009.

**Status.** Implemented, covered by unit tests with fakes, and **run with
real sign-ins** on 29 October 2026: the owner's Microsoft account and an
External ID e-mail login ([results](#results-29-october-2026)).

## How it works

Code: [`identity-link-flow.ts`](../src/auth/identity-link-flow.ts),
[`identity-links-api.ts`](../src/api/identity-links-api.ts),
`AuthController.proveIdentity` in [`auth-controller.ts`](../src/auth/auth-controller.ts),
[`IdentityLinkSection.tsx`](../src/components/IdentityLinkSection.tsx).

1. **Start.** *Tilknyt en Microsoft-konto* or *Tilknyt login med e-mail-kode*
   under *Flere måder at logge ind* asks the API for a one-time code, with
   the session's token.
2. **Prove the new login.** `proveIdentity` opens that provider's sign-in
   page in the browser. The session is not touched: nothing is stored, and
   the state stays *signed in*. The new login's tokens stay in memory; only
   its access token is used, for the next step, and then dropped.
3. **Claim.** The code goes to the API with the **new login's** access token
   (`requestJson`'s `grant` option: never renewed, never retried, never sent
   where a token may not go). The API checks that this login is not a user
   of its own and links nothing yet.
4. **Confirm.** The app shows which login joins which account. *Tilknyt*
   confirms with the session's token; only now does the API link it.
   *Annuller* withdraws the request.

If the browser page is closed, or any step fails, the request is withdrawn
and the panel says why, in Danish (for example that a login which is
already a Room Booking user is never merged). A sign-out while the page is
open voids the proof.

## Device checklist

Development build, local API with the linking change, isolated database copy.

| # | Step | Expected |
| --- | --- | --- |
| L1 | Signed in and registered: the account panel | *Flere måder at logge ind* with *Tilknyt en Microsoft-konto* (and *Tilknyt login med e-mail-kode* when e-mail sign-in is configured) |
| L2 | *Tilknyt login med e-mail-kode*, sign in with an address that has never signed in to Room Booking | The confirmation *Vil du tilknytte … til Room Booking-kontoen …?* |
| L3 | *Tilknyt* | *✓ Tilknyttet* with both logins listed; API log: `POST …/claim` 200, `POST …/confirm` 200 |
| L4 | *Log ud*, then *Log ind med e-mail-kode* with that address | The same user, organisations and bookings as before (no new registration) |
| L5 | Start again and pick a login that is already its own Room Booking user | *Det login er allerede en selvstændig Room Booking-konto …*; nothing linked |
| L6 | Start again and close the browser page | *Login blev afbrudt. Intet blev tilknyttet.* |
| L7 | Start again, then *Annuller* at the confirmation | *Intet blev tilknyttet.* |

### Results, 29 October 2026

Samsung development build (see the [e-mail results](external-id-login.md#results-29-october-2026)),
API on isolated database copies restored from one verified backup: L5 on the
copy where the e-mail login was already its own user, L1–L4 and L6 on a
second copy where it was not.

| # | Result | Evidence |
| --- | --- | --- |
| L1 | **Pass** | on screen |
| L2 | **Pass**: proof with a code sent to the address, then *Vil du tilknytte … (e-mail-kode) til Room Booking-kontoen Kris Riisgaard Larsen?*. Before *Tilknyt*: the request claimed, not completed, no new identity | on screen; logged (database) |
| L3 | **Pass**: *✓ Tilknyttet* with *Microsoft-konto (personlig)* and *E-mail-kode*; both identities on the one user, no new user | on screen; logged (database) |
| L4 | **Pass**: e-mail sign-in shows the Microsoft user's ID, *Ejer* of Test ApS and Legacy; memberships unchanged | on screen; logged (database) |
| L5 | **Pass**: the e-mail user tried to link the Microsoft account, which is its own user: *Det login er allerede en selvstændig Room Booking-konto …*; the request cancelled, identities and memberships unchanged | on screen; logged (database) |
| L6 | **Pass**: *Login blev afbrudt. Intet blev tilknyttet.*; the request cancelled | on screen; logged (database) |
| L7 | **Not run**: needs a third login that no user has, and none was available. The cancel path is covered by unit tests here and the API's integration tests | – |

The first L2 attempt failed on Microsoft's page (*Koden fungerede ikke*,
most likely an older code); it was closed, which cancelled that request,
and repeated.

There is no unlinking in the app or the API yet.
