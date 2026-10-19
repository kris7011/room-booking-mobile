import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Everything the E2E run needs to know about where things live. Playwright
// loads this module in the runner and again in each worker, so values that
// must be identical everywhere (the run directory) are passed on through
// process.env, which workers inherit.

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

const RUNS_ROOT = join(tmpdir(), 'room-booking-e2e');

/**
 * A fresh directory per test run that holds the run's SQLite database. It is
 * outside both repositories, so test data can never end up in Git.
 */
export const RUN_DIR = (process.env.E2E_RUN_DIR ??= join(RUNS_ROOT, `run-${Date.now()}-${process.pid}`));
export const DATABASE_PATH = join(RUN_DIR, 'meeting-room-booking-e2e.db');

/** Where the exported web app, the HTML report and failure traces go (gitignored). */
export const OUTPUT_DIR = join(MOBILE_DIR, 'e2e', '.output');

/**
 * Creates this run's directory and removes those of earlier runs. They cannot
 * be removed at the end of a run: the API still holds the database file open
 * until Playwright stops it, after all teardown hooks have run.
 */
export function prepareRunDirectory(): void {
  if (existsSync(RUNS_ROOT)) {
    for (const entry of readdirSync(RUNS_ROOT)) {
      const path = join(RUNS_ROOT, entry);
      if (path !== RUN_DIR) rmSync(path, { recursive: true, force: true, maxRetries: 3 });
    }
  }
  mkdirSync(RUN_DIR, { recursive: true });
}

/**
 * Environment for an API process that uses the run's own database. The
 * Development environment is needed because the API only enables CORS there;
 * the allowed origin is replaced with the E2E web server's.
 */
export function backendEnvironment(port: number): Record<string, string> {
  return {
    ASPNETCORE_ENVIRONMENT: 'Development',
    ASPNETCORE_URLS: `http://localhost:${port}`,
    ConnectionStrings__BookingDatabase: `Data Source=${DATABASE_PATH}`,
    Cors__AllowedOrigins__0: WEB_URL,
    Logging__LogLevel__Default: 'Warning',
    DOTNET_NOLOGO: '1',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
  };
}

/** `dotnet run` arguments for the API; --no-launch-profile so launchSettings.json cannot change port or database. */
export function backendArguments({ build }: { build: boolean }): string[] {
  return ['run', '--project', BACKEND_PROJECT, '--no-launch-profile', ...(build ? [] : ['--no-build'])];
}
