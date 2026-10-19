import { existsSync } from 'node:fs';

import { API_URL, DATABASE_PATH } from './support/environment';

// Runs once, after Playwright has started the API and the web server and
// before the first test. A last check that the tests are about to use the
// run's own, new database and nothing else: the file name is generated for
// this run, so only the API started for this run can have created it.
export default async function globalSetup(): Promise<void> {
  if (!existsSync(DATABASE_PATH)) {
    throw new Error(
      `The API on ${API_URL} has not created the E2E database at ${DATABASE_PATH}. ` +
        'It may be using another database, so the tests will not run.',
    );
  }

  const response = await fetch(`${API_URL}/api/bookings`);
  const bookings = (await response.json()) as unknown[];
  if (!response.ok || bookings.length > 0) {
    throw new Error(
      `Expected an empty, freshly migrated E2E database behind ${API_URL}, ` +
        `but GET /api/bookings returned ${response.status} with ${bookings.length} booking(s). The tests will not run.`,
    );
  }

  // The file is kept after the run, for debugging and manual cleanup.
  console.log(`E2E database for this run: ${DATABASE_PATH}`);
}
