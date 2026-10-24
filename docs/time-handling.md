# Time handling

How the search form keeps its suggested time current while the app stays
open, and how a booking whose start has passed is prevented. The behaviour is
covered by unit tests (`tests/utils/search-window.test.ts`,
`tests/utils/clock.test.ts`) and by the E2E tests `clock.spec.ts` and
`past-bookings.spec.ts` in the web build (see [testing.md](testing.md)). The
manual checklist for a physical phone is in
[device-testing.md](device-testing.md#time-handling-checklist); it has not
been run yet.

## Suggested time versus chosen time

The search form has two modes:

- **Following the clock** (until the user picks a day or a time): the shown window is not stored but derived from the current time on every render: the next half hour, one hour long, or 09:00 tomorrow when no full hour is left before 22:00. It can therefore never go stale.
- **Chosen by the user**: from the first change of day or time, the choice is kept exactly. Changing the number of participants does not count. When the chosen start has passed, the form shows *Tidspunktet er passeret*, blocks the search and offers **Brug næste tidspunkt: …** with the same duration.

`useClock` (`src/hooks/useClock.tsx`, logic in `src/utils/clock.ts`) renews "now" when a new half-hour slot or a new day starts, checks at least once a minute (which also catches a changed device clock or time zone), and checks again when `AppState` reports `active`. The screen only re-renders when the slot, the day or the UTC offset has changed. No native module is involved. On Android, timers do not run in the background; the update happens on return through `AppState`.

## A start that passes while the form is open

Search results and an open booking form keep describing the search that was made. Once that start has passed, the form shows *Mødets starttidspunkt er passeret*, disables *Bekræft booking* and offers **Søg igen: …**, which searches from the next possible time with the same duration and reopens the same room if it is still free. Title and name live in `HomeScreen`, not in the form, so they survive the new search; they are cleared after a successful booking. Right before sending, the form checks the time again, because the clock only ticks at slot boundaries and a timer can be late.

The API rejects a booking whose start is not after the server's current time with a `400` validation problem on `startUtc` (also for moving an existing booking). The app shows that as the same warning, with a hint that the phone's clock may be wrong if the phone still thinks the start lies ahead, and suggests a time after the rejected one. The demo API applies the same rule.

## Time zones

Times are chosen in the device's local time and sent to the API as UTC
(`src/utils/date-time.ts`). The unit tests run in `Europe/Copenhagen`
regardless of the machine's zone and cover both daylight-saving-time changes
and a zone where midnight does not exist.
