import { isApiCall } from '../support/api';
import { API_URL } from '../support/environment';
import { expect, test } from '../support/fixtures';
import { ROOMS, ROOMS_BY_NAME } from '../support/test-data';

test.describe('Room overview', () => {
  test('shows the rooms from the API in live mode', async ({ app, page }) => {
    const response = await app.open();

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(ROOMS_BY_NAME);
    await expect(app.apiBanner).toBeVisible();
    await expect(app.demoBanner).toHaveCount(0);
    for (const room of ROOMS_BY_NAME) {
      await expect(app.overviewRoom(room)).toBeVisible();
      await expect(page.getByText(`Plads til ${room.capacity} personer`, { exact: true })).toBeVisible();
    }
  });

  test('shows a connection error when the API cannot be reached, and recovers on retry', async ({ app, page }) => {
    // Every request to the API now fails inside the browser with
    // net::ERR_CONNECTION_REFUSED, which is what the app gets when nothing
    // listens on the API's port.
    await page.route(`${API_URL}/**`, (route) => route.abort('connectionrefused'));
    await page.goto('/');

    await expect(app.alert).toContainText('Kunne ikke hente mødelokaler');
    await expect(app.alert).toContainText(`Kunne ikke få forbindelse til API'et (${API_URL}).`);
    // Only the web build mentions CORS: Metro inlines process.env.EXPO_OS as 'web' here.
    await expect(app.alert).toContainText("og at API'et tillader CORS fra denne side.");
    await expect(app.overviewRoom(ROOMS.focus)).toHaveCount(0);

    // The API is reachable again: "Prøv igen" loads the rooms.
    await page.unroute(`${API_URL}/**`);
    const rooms = page.waitForResponse(isApiCall('GET', '/api/rooms'));
    await page.getByRole('button', { name: 'Prøv igen' }).click();

    expect((await rooms).status()).toBe(200);
    await expect(app.alert).toHaveCount(0);
    await expect(app.overviewRoom(ROOMS.focus)).toBeVisible();
  });
});
