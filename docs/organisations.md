# Organisations

Rooms and bookings belong to an organisation. A signed-in, registered user
chooses the active organisation, and every booking request is scoped to it.
This needs the organisation endpoints of the
[meeting-room-booking](https://github.com/kris7011/meeting-room-booking) API
(on its `main` branch) and Microsoft sign-in, so it is only available in the
Android/iOS app (see [entra-login.md](entra-login.md)). The user interface
below is in Danish.

**Status:** implemented and unit-tested (`tests/organizations/`,
`tests/api/organizations-api.test.ts`); the web E2E tests run without sign-in.
On 26 October 2026 the Owner's screens were checked on a Samsung with a
signed-in personal account: switching organisations, rooms, invitations,
renaming, and the last-Owner refusal (see the
[checklist](device-testing.md#organisation-administration-checklist-26-october-2026)).
The Admin and Member views and accepting an invitation were not tried on a
device (one account only). Every role rule is enforced by the API and covered
by its integration tests: see its
[role and permission matrix](https://github.com/kris7011/meeting-room-booking/blob/main/docs/role-permission-matrix.md).

## What the user sees

- **Aktiv organisation**: name, "(standardorganisation)" for the legacy organisation, and the user's role (*Ejer*, *Administrator*, *Medlem*). With several organisations, chips switch between them. The choice is remembered per user in SecureStore and restored on the next start.
- **No organisation yet**: onboarding with *Opret organisation* and *Har en invitation*.
- **Opret organisation**: a name and the button. The new organisation becomes active, with the user as Owner. A random `Idempotency-Key` is made per name, so tapping again after a timeout repeats the same request and never creates two organisations.
- **Accepter invitation**: paste the code, the link, or the whole message containing it. Clear messages for an expired or revoked invitation, the wrong account (`invitation_email_mismatch`), a missing verified e-mail and missing rights.
- **Booking**: search, the booking form and *Kommende bookinger* use `/api/organizations/{id}/…` of the active organisation only. Members see *Slet* only on their own bookings (`canModify`); the API checks every change again.
- **Administrer organisation** (Owners and Admins only): details and counts, renaming (Owners; never the legacy organisation), rooms (create, edit, archive, restore), invitations (invite by e-mail, share the code and link, see and revoke open ones), members (Owners change roles and remove members; anyone can leave). Android's back button returns to booking.

What the app shows is only a convenience: the API enforces every rule itself (see the API's README, [Organisation access control](https://github.com/kris7011/meeting-room-booking#organisation-access-control)).

## Switching without stale data

- The booking area is keyed by the active organisation, so a switch starts with an empty search, form and list.
- Every request names the organisation in its path, so a late response can only ever describe the organisation it was asked for.
- `OrganizationController` (`src/organizations/organization-controller.ts`, no React) drops a list that arrives after a newer one, or for a user who has since signed out.
- Signing out clears the organisations; the next user never sees the previous user's list or choice.

## Invitation links

`roombookingdev://invitation?token=…` opens the app with the code filled in (React Native's `Linking`, with the scheme the development build already registers, so no new build is needed). The code is shown once after inviting and can be shared with Android's share sheet; it is never logged. Accepting still requires signing in with the invited e-mail address, whose verification Microsoft vouches for. How to test the link on a phone is in [device-testing.md](device-testing.md#invitation-links).

## Without sign-in

On web (no Microsoft sign-in) and when signed out, the app uses the original `/api/rooms` and `/api/bookings` without a token. The API answers `401` there unless it runs in its anonymous demo mode (`LegacyApi:AllowAnonymous`, accepted only in the `Development` and `Testing` environments); the app then says that sign-in is required. The E2E tests start the API in that demo mode.
