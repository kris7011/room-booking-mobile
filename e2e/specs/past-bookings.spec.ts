import { isApiCall } from '../support/api';
import { expect, test } from '../support/fixtures';
import { DEFAULT_SLOT, ROOMS, at } from '../support/test-data';

// A booking form stays open while the meeting's start passes. The browser
// clock starts at FIXED_NOW (07:40) and the default search is 08:00–09:00.
test.describe('A booking form whose start passes', () => {
  test.use({ clockMode: 'running' });

  test('notices it while the user types, blocks confirming and searches again without losing the text', async ({
    app,
    page,
  }) => {
    const bookingRequests = app.recordBookingRequests();
    await app.open();
    await app.search();
    await app.openBookingForm(ROOMS.focus);
    await app.titleInput.fill('Sprint planning');

    await page.clock.fastForward('20:00'); // 08:00: the meeting starts
    await expect(app.bookingStartedWarning).toContainText('Starttidspunktet 08:00 i dag er passeret.');
    await expect(app.bookingStartedWarning).toContainText('titel og navn bliver bevaret');
    await expect(app.confirmButton).toBeDisabled();

    // The user can keep typing; nothing is cleared.
    await app.bookedByInput.fill('E2E');
    await expect(app.titleInput).toHaveValue('Sprint planning');

    const search = page.waitForResponse(isApiCall('GET', '/api/rooms/available'));
    await page.getByRole('button', { name: 'Søg igen: I dag 08:30–09:30', exact: true }).click();
    expect(new URL((await search).url()).searchParams.get('startUtc')).toBe(at('08:30'));

    // The same room opens again for the new time, with the text intact.
    await expect(page.getByText(`Book ${ROOMS.focus.name}`, { exact: true })).toBeVisible();
    await expect(page.getByText('Man 4. mar, 08:30–09:30', { exact: true })).toBeVisible();
    await expect(app.titleInput).toHaveValue('Sprint planning');
    await expect(app.bookedByInput).toHaveValue('E2E');
    await expect(app.bookingStartedWarning).toHaveCount(0);
    await app.expectTimeRange('08:30', '09:30');
    expect(bookingRequests).toHaveLength(0);

    const created = await app.confirmBooking();
    expect(created.status()).toBe(201);
    expect(created.request().postDataJSON()).toEqual({
      roomId: ROOMS.focus.id,
      title: 'Sprint planning',
      bookedBy: 'E2E',
      startUtc: at('08:30'),
      endUtc: at('09:30'),
    });
    await expect(app.successMessage).toBeVisible();
    // A booking that went through clears the draft.
    await app.openBookingForm(ROOMS.collaboration);
    await expect(app.titleInput).toHaveValue('');
  });

  test('checks the time again right before sending, even if the app has not noticed yet', async ({ app, page }) => {
    const bookingRequests = app.recordBookingRequests();
    await app.open();
    await app.search();
    await app.openBookingForm(ROOMS.focus);
    await app.fillBookingForm('Sprint planning', 'E2E');

    // As if the app's timer were late: the time passes 08:00, no timer runs.
    await page.clock.pauseAt(new Date('2030-03-04T07:50:00+01:00'));
    await page.clock.setSystemTime(new Date('2030-03-04T08:00:30+01:00'));
    await expect(app.bookingStartedWarning).toHaveCount(0);
    await expect(app.confirmButton).toBeEnabled();

    await app.confirmButton.click();

    await expect(app.bookingStartedWarning).toContainText('Starttidspunktet 08:00 i dag er passeret.');
    await expect(app.confirmButton).toBeDisabled();
    await expect(app.titleInput).toHaveValue('Sprint planning');
    expect(bookingRequests).toHaveLength(0);
  });
});

test.describe('When the server says the start has passed', () => {
  // The phone's clock is years behind the server's (frozen at Monday
  // 2 March 2020, 07:40). The app thinks 08:00 lies ahead; the API, on this
  // machine's real clock, does not.
  test.use({ startTime: new Date('2020-03-02T07:40:00+01:00') });

  test('shows the same notice instead of a generic error and keeps the text', async ({ app, page }) => {
    await app.open();
    await app.search();
    await app.openBookingForm(ROOMS.focus);
    await app.fillBookingForm('Sprint planning', 'E2E');

    const response = await app.confirmBooking();
    expect(response.status()).toBe(400);
    expect((await response.json()).errors).toEqual({
      startUtc: ['The start time must be later than the current time.'],
    });

    await expect(app.bookingStartedWarning).toContainText('telefonens ur går muligvis forkert');
    await expect(app.confirmButton).toBeDisabled();
    await expect(app.alert).toHaveCount(0);
    await expect(app.titleInput).toHaveValue('Sprint planning');
    await expect(app.bookedByInput).toHaveValue('E2E');
    // Offers a later time than the rejected one, never the same again.
    await expect(page.getByRole('button', { name: 'Søg igen: I dag 08:30–09:30', exact: true })).toBeVisible();
  });
});

test('the booking form is unchanged while its start lies ahead', async ({ app }) => {
  await app.open();
  await app.search();
  await app.openBookingForm(ROOMS.focus);
  await expect(app.bookingStartedWarning).toHaveCount(0);
  await expect(app.confirmButton).toBeEnabled();
  await expect(app.page.getByText(DEFAULT_SLOT.label, { exact: true })).toBeVisible();
});
