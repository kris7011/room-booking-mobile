# ADR 0004: Synchronise organisation access at lifecycle moments, not by polling

- **Status:** Accepted. On `main` through PR #27.
- **Code:** `src/organizations/organization-controller.ts` (`sync`, `load`,
  `OrganizationNotice`), `src/organizations/SessionProvider.tsx`,
  `src/api/http-client.ts` (`setAccessChangedListener`, `ACCESS_CHANGED_CODES`),
  `src/components/organizations/OrganizationPanel.tsx`,
  `src/organizations/organization-messages.ts` (`describeOrganizationNotice`)

## Context

The organisation list (memberships and roles) was loaded at sign-in and
after the user's own changes. A removal, demotion or disabled account on
another device left the app showing stale organisations, roles and
administration screens until a restart. The API already refuses every such
request (backend ADR 0001/0004), so the gap was the app's view, not security.
An audit of `OrganizationController` on `main` (`7db55b7`) also found three
defects, each reproduced with a failing test before the fix:

1. A switch made while a refresh was on its way was undone when it arrived
   (`previous` was read before the request).
2. An organisation created or joined while a refresh was on its way was
   dropped by it.
3. `403 user_disabled` on a refresh kept the cached list usable.

## Decision

- `OrganizationController.sync(reason)` refreshes the list at four moments:
  **foreground** (`AppState` → `active`), **switch** (`select`),
  **access-changed** (any API answer with `organization_not_found`,
  `organization_permission_denied`, `user_disabled`, `user_not_registered`,
  reported by `http-client` through one registered listener), and **manual**
  ("Prøv igen"). No timer.
- A sync **joins** a refresh that is running (one request); a foreground sync
  is skipped while the list is younger than 30 s and not marked out of date.
- Results are applied only for the latest generation; local changes
  (`added`, `removed`) start a new generation; the active organisation is
  read **after** the answer.
- Lost active organisation → another becomes active (or onboarding), with a
  Danish notice. Changed role → the role follows the API, with a notice;
  `AppScreens` keys the administration page by role and `BookingArea` keys
  the upcoming bookings by role, so role-dependent data is fetched again
  while the search and the draft stay.
- `user_disabled` / `user_not_registered` on the list → `error` state: no
  organisation stays usable. Offline or `5xx` → keep the list, show "Kunne
  ikke opdatere dine organisationer … Serveren afgør stadig, hvad du må." with
  "Prøv igen".

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Periodic polling (e.g. every minute) | Battery and data for a change that is rare; the API refuses stale access anyway, and its answers already trigger a sync. |
| Push (SignalR, FCM) | Server infrastructure and a native dependency for a portfolio-sized app; breaks the "runs locally" goal without extra services. |
| Refresh in each screen's catch block | Many call sites, easy to miss one; the listener catches every request in one place. |
| Re-key `BookingArea` by role | Would also throw away the search and the draft on a role change. |

## Consequences

- Positive: stale permissions are corrected at the moments the user looks or
  acts, with at most one list request per trigger.
- Positive: three ordering defects fixed and pinned by tests.
- Negative: a change on another device is not seen while the app stays in the
  foreground and idle; the first refused request (or "Prøv igen") corrects it.
- Negative: `http-client` holds one module-level listener (like the token
  provider); only `SessionProvider` sets it.
- Network return is not detected directly (no NetInfo dependency): the next
  foreground, switch, refused request or "Prøv igen" retries.
