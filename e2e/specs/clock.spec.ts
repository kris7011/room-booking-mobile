import { expect, test } from '../support/fixtures';
import { DEFAULT_SLOT, ROOMS, at } from '../support/test-data';

// The app is left open while time passes. The browser clock starts at
// startTime (default FIXED_NOW: Monday 4 March 2030, 07:40) and runs; the
// tests jump it forward with page.clock.fastForward(), which also fires the
// timers the app has set, as if the time had really passed.
test.describe('Keeping the time current while the app is open', () => {
  test.use({ clockMode: 'running' });

  test('moves the default time on when it has passed', async ({ app, page }) => {
    await app.open();
    await app.expectTimeRange('08:00', '09:00');
    // Choosing the number of participants is not a choice of time.
    await app.chooseParticipants(8);

    await page.clock.fastForward('20:00'); // 08:00
    await app.expectTimeRange('08:30', '09:30');
    await expect(app.passedWarning).toHaveCount(0);

    const response = await app.search();
    const params = new URL(response.url()).searchParams;
    expect(params.get('startUtc')).toBe(at('08:30'));
    expect(params.get('endUtc')).toBe(at('09:30'));
    expect(params.get('minCapacity')).toBe('8');
  });

  test('catches up when the app returns from the background', async ({ app, page }) => {
    await app.open();
    await app.expectTimeRange('08:00', '09:00');

    // In the background no timers run: pause the clock, then let time pass.
    await page.clock.pauseAt(new Date('2030-03-04T07:45:00+01:00'));
    await app.setVisibility('hidden');
    await page.clock.setSystemTime(new Date('2030-03-04T10:05:00+01:00'));
    await expect(app.startTime).toHaveText('08:00');

    // Only the return to the foreground (AppState "active") updates it.
    await app.setVisibility('visible');
    await app.expectTimeRange('10:30', '11:30');

    await page.clock.resume();
    const response = await app.search();
    expect(new URL(response.url()).searchParams.get('startUtc')).toBe(at('10:30'));
  });

  test('never changes a chosen time, but warns when it has passed and offers the next one', async ({ app, page }) => {
    await app.open();
    await app.moveStart('later');
    await app.moveStart('later');
    await app.expectTimeRange('09:00', '10:00');

    await page.clock.fastForward('20:00'); // 08:00: the default would now be 08:30
    await app.expectTimeRange('09:00', '10:00');
    await expect(app.passedWarning).toHaveCount(0);

    await page.clock.fastForward('01:00:00'); // 09:00, with no interaction
    await expect(app.passedWarning).toContainText('Starttidspunktet 09:00 i dag er passeret.');
    await app.expectTimeRange('09:00', '10:00');
    await expect(app.searchButton).toBeDisabled();

    await page.getByRole('button', { name: 'Brug næste tidspunkt: I dag 09:30–10:30', exact: true }).click();
    await app.expectTimeRange('09:30', '10:30');
    await expect(app.passedWarning).toHaveCount(0);

    const response = await app.search();
    expect(new URL(response.url()).searchParams.get('startUtc')).toBe(at('09:30'));
  });

  test('keeps what was typed in an open booking form when the time moves on', async ({ app, page }) => {
    await app.open();
    await app.search();
    await app.openBookingForm(ROOMS.focus);
    await app.fillBookingForm('Sprint planning', 'E2E');

    await page.clock.fastForward('20:00'); // 08:00
    await app.expectTimeRange('08:30', '09:30');
    await app.setVisibility('hidden');
    await page.clock.fastForward('05:00');
    await app.setVisibility('visible');

    // The form still belongs to the search that was made, with the text intact.
    await expect(page.getByText(`Book ${ROOMS.focus.name}`, { exact: true })).toBeVisible();
    await expect(page.getByText(DEFAULT_SLOT.label, { exact: true })).toBeVisible();
    await expect(app.titleInput).toHaveValue('Sprint planning');
    await expect(app.bookedByInput).toHaveValue('E2E');
  });

  test.describe('at midnight', () => {
    // Saturday 30 March 2030, 21:40. Summer time starts at 02:00 that night.
    test.use({ startTime: new Date('2030-03-30T21:40:00+01:00') });

    test('"I morgen" becomes "I dag" and the default day stays the same', async ({ app, page }) => {
      await app.open();
      // Too late for a full hour today, so the default is tomorrow 09:00.
      await expect(app.dayChipWithCaption('30. mar')).toContainText('I dag');
      await expect(app.dayChipWithCaption('31. mar')).toContainText('I morgen');
      await expect(app.dayChipWithCaption('31. mar')).toHaveAttribute('aria-selected', 'true');
      await app.expectTimeRange('09:00', '10:00');

      await page.clock.fastForward('02:30:00'); // 00:10 on Sunday 31 March
      await expect(app.dayChipWithCaption('31. mar')).toContainText('I dag');
      await expect(app.dayChipWithCaption('1. apr')).toContainText('I morgen');
      await expect(app.dayChipWithCaption('30. mar')).toHaveCount(0);
      await expect(app.dayChipWithCaption('31. mar')).toHaveAttribute('aria-selected', 'true');
      await app.expectTimeRange('09:00', '10:00');

      // Summer time from 02:00: 09:00–10:00 in Copenhagen is 07:00–08:00 UTC.
      const response = await app.search();
      const params = new URL(response.url()).searchParams;
      expect(params.get('startUtc')).toBe('2030-03-31T07:00:00.000Z');
      expect(params.get('endUtc')).toBe('2030-03-31T08:00:00.000Z');
    });
  });
});
