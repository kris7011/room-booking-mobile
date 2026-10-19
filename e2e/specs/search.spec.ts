import { expect, test } from '../support/fixtures';
import { DEFAULT_PARTICIPANTS, DEFAULT_SLOT, ROOMS, at } from '../support/test-data';

test.describe('Searching for free rooms', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
  });

  test('sends the chosen local time as UTC and lists the smallest fitting room first', async ({ app, page }) => {
    const response = await app.search();

    expect(response.status()).toBe(200);
    expect(Object.fromEntries(new URL(response.url()).searchParams)).toEqual({
      startUtc: DEFAULT_SLOT.startUtc,
      endUtc: DEFAULT_SLOT.endUtc,
      minCapacity: String(DEFAULT_PARTICIPANTS),
    });
    await expect(page.getByText('3 ledige lokaler', { exact: true })).toBeVisible();
    await expect(page.getByText(`${DEFAULT_SLOT.label} · mindste passende lokale først`)).toBeVisible();
    await expect(app.resultCards).toHaveText([/Focus Room/, /Collaboration Room/, /Board Room/]);
    await expect(app.resultCard(ROOMS.focus)).toContainText('Perfekt størrelse');
  });

  test('only lists rooms with room for the chosen number of participants', async ({ app }) => {
    await app.chooseParticipants(8);
    const response = await app.search();

    expect(new URL(response.url()).searchParams.get('minCapacity')).toBe('8');
    await expect(app.resultCards).toHaveText([/Collaboration Room/, /Board Room/]);

    await app.chooseParticipants(12);
    await app.search();
    await expect(app.resultCards).toHaveText([/Board Room/]);
  });

  test('hides rooms booked during the period but not rooms booked right after it', async ({ app, api }) => {
    // Overlaps the search window 08:00–09:00 by half an hour.
    await api.createBooking({
      roomId: ROOMS.collaboration.id,
      title: 'Overlapper',
      bookedBy: 'E2E',
      startUtc: at('08:30'),
      endUtc: at('09:30'),
    });
    // Starts exactly when the search window ends, so it does not overlap.
    await api.createBooking({
      roomId: ROOMS.focus.id,
      title: 'Lige efter',
      bookedBy: 'E2E',
      startUtc: at('09:00'),
      endUtc: at('10:00'),
    });

    await app.search();

    await expect(app.resultCards).toHaveText([/Focus Room/, /Board Room/]);
  });

  test('says so when no room with enough space is free', async ({ app, api, page }) => {
    await api.createBooking({
      roomId: ROOMS.board.id,
      title: 'Bestyrelsesmøde',
      bookedBy: 'E2E',
      startUtc: DEFAULT_SLOT.startUtc,
      endUtc: DEFAULT_SLOT.endUtc,
    });

    await app.chooseParticipants(12);
    const response = await app.search();

    expect(await response.json()).toEqual([]);
    await expect(page.getByText('Ingen ledige lokaler', { exact: true })).toBeVisible();
    await expect(
      page.getByText(`Intet lokale med plads til 12 er ledigt ${DEFAULT_SLOT.label}.`, { exact: false }),
    ).toBeVisible();
    await expect(app.resultCards).toHaveCount(0);
  });
});
