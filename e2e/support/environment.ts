import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Everything the E2E run needs to know about where things live. Playwright
// loads this module in the runner and again in each worker, so values that
// must be identical everywhere (the database path) are passed on through
// process.env, which workers inherit.
//
// Loading this module has no side effects on disk: `playwright test --list`
// creates and deletes nothing.

/** Root of this repository. */
export const MOBILE_DIR = resolve(__dirname, '..', '..');

/**
 * Checkout of github.com/kris7011/meeting-room-booking. Defaults to a sibling
 * folder of this repository, which is also how CI checks it out.
 */
export const BACKEND_DIR = resolve(process.env.E2E_BACKEND_DIR ?? join(MOBILE_DIR, '..', 'meeting-room-booking'));
export const BACKEND_PROJECT = join(BACKEND_DIR, 'src', 'MeetingRoomBooking.Api', 'MeetingRoomBooking.Api.csproj');

// Ports differ from the development setup (API 5003, Expo 8081), so a running
// development backend is never reused and its database is never touched.
export const API_PORT = 5103;
/** A second API process, started by the persistence test. */
export const SECOND_API_PORT = 5104;
export const WEB_PORT = 8181;

export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/** All E2E databases start with this, so they are easy to find and remove by hand. */
export const DATABASE_PREFIX = 'room-booking-e2e-';

/**
 * A new SQLite database file for every test run, named after the start time
 * plus a random part, e.g. room-booking-e2e-2026-10-19T11-30-00-000Z-1a2b3c4d.db.
 * It lies in the system temp folder, which always exists, outside both
 * repositories, so test data can never end up in Git. The API creates the
 * file and its -wal/-shm companions when it starts.
 *
 * The tests never delete it, nor any other run's database. Playwright stops
 * the API only after every teardown hook has run, so a test hook cannot know
 * when the file is closed; another run may also still be using its own file.
 * docs/testing.md ("Cleaning up test databases") describes safe manual cleanup.
 */
export const DATABASE_PATH = (process.env.E2E_DATABASE_PATH ??= join(
  tmpdir(),
  `${DATABASE_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.db`,
));

/** Where the exported web app, the HTML report and failure traces go (gitignored). */
export const OUTPUT_DIR = join(MOBILE_DIR, 'e2e', '.output');

/**
 * Environment for an API process that uses the run's own database. The
 * Development environment is needed because the API only enables CORS there;
 * the allowed origin is replaced with the E2E web server's.
 *
 * The web app has no Microsoft login, so it uses the original /api/rooms and
 * /api/bookings without a token. Since phase 3 the API only allows that in
 * its anonymous demo mode (LegacyApi:AllowAnonymous, accepted in Development
 * only); an older API ignores the setting. The run's own database holds no
 * real organisation data.
 */
export function backendEnvironment(port: number): Record<string, string> {
  return {
    ASPNETCORE_ENVIRONMENT: 'Development',
    ASPNETCORE_URLS: `http://localhost:${port}`,
    ConnectionStrings__BookingDatabase: `Data Source=${DATABASE_PATH}`,
    LegacyApi__AllowAnonymous: 'true',
    Cors__AllowedOrigins__0: WEB_URL,
    Logging__LogLevel__Default: 'Warning',
    DOTNET_NOLOGO: '1',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
  };
}

/**
 * Where the E2E run builds the API: its own folder instead of the API's bin/
 * and obj/. A development API started from the same checkout (`dotnet run`)
 * keeps MeetingRoomBooking.Api.exe locked, so building into bin/ would fail
 * as soon as the API's source changes, and would replace its files.
 */
export const BACKEND_BUILD_DIR = join(OUTPUT_DIR, 'api-build');

/** `dotnet run` arguments for the API; --no-launch-profile so launchSettings.json cannot change port or database. */
export function backendArguments({ build }: { build: boolean }): string[] {
  return [
    'run',
    '--project',
    BACKEND_PROJECT,
    '--artifacts-path',
    BACKEND_BUILD_DIR,
    '--no-launch-profile',
    ...(build ? [] : ['--no-build']),
  ];
}
