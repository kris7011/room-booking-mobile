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
  });

  test('shows capacity and that the room fits the group, not leftover seats', async ({ app, page }) => {
    await app.search();

    for (const room of [ROOMS.focus, ROOMS.collaboration, ROOMS.board]) {
      await expect(app.resultCard(room)).toContainText(`Plads til ${room.capacity} personer`);
      await expect(app.resultCard(room)).toContainText(
        `Passer til ${DEFAULT_PARTICIPANTS} deltagere · hele lokalet reserveres`,
      );
    }
    await expect(page.getByText(/ledige pladser ekstra|Perfekt størrelse/)).toHaveCount(0);
  });

  test('scrolls a day that is half hidden at the edge fully into view when chosen', async ({ app, page }) => {
    const strip = await app.dayStripBounds();
    // The first day chip that sticks out past the right edge of the strip.
    let partlyHidden: { index: number; left: number; centerY: number } | undefined;
    for (let index = 0; index < 14 && !partlyHidden; index++) {
      const box = await app.dayChip(index).boundingBox();
      if (box && box.x < strip.right && box.x + box.width > strip.right) {
        partlyHidden = { index, left: box.x, centerY: box.y + box.height / 2 };
      }
    }
    expect(partlyHidden, 'expected a day chip cut off by the right edge of the strip').toBeDefined();
    const { index, left, centerY } = partlyHidden!;

    // A real mouse click on the visible part. locator.click() would scroll
    // the chip into view by itself and hide the behaviour under test.
    await page.mouse.click((left + strip.right) / 2, centerY);

    await expect(app.dayChip(index)).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(async () => {
        const box = await app.dayChip(index).boundingBox();
        return !!box && box.x >= strip.left && box.x + box.width <= strip.right;
      })
      .toBe(true);

    // The search uses the chosen day: 4 March + index, 08:00 local (UTC+1).
    const response = await app.search();
    const day = String(4 + index).padStart(2, '0');
    expect(new URL(response.url()).searchParams.get('startUtc')).toBe(`2030-03-${day}T07:00:00.000Z`);
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
