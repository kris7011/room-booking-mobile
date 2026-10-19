import { expect, type Locator, type Page, type Request, type Response } from '@playwright/test';

import { API_URL } from './environment';
import { isApiCall } from './api';
import type { MeetingRoom } from '../../src/models/room';

// Page object for the app's single screen. Tests describe what a user does
// ("search", "book"); the selectors live here. Elements are found through
// their accessible role and name, which React Native Web derives from
// accessibilityRole and accessibilityLabel.
export class HomePage {
  readonly apiBanner: Locator;
  readonly demoBanner: Locator;
  readonly searchButton: Locator;
  readonly resultCards: Locator;
  readonly titleInput: Locator;
  readonly bookedByInput: Locator;
  readonly confirmButton: Locator;
  readonly successMessage: Locator;
  readonly alert: Locator;

  constructor(readonly page: Page) {
    this.apiBanner = page.getByText(`API: ${API_URL}`, { exact: true });
    this.demoBanner = page.getByText('DEMODATA', { exact: true });
    this.searchButton = page.getByRole('button', { name: 'Søg efter ledige lokaler' });
    this.resultCards = page.getByRole('button', { name: /, plads til \d+$/ });
    this.titleInput = page.getByLabel('Mødets titel');
    this.bookedByInput = page.getByLabel('Booket af');
    this.confirmButton = page.getByRole('button', { name: 'Bekræft booking' });
    this.successMessage = page.getByText('Booking oprettet', { exact: true }).locator('..');
    this.alert = page.getByRole('alert');
  }

  /** Opens the app and waits until it has asked the API for the room list. */
  async open(): Promise<Response> {
    const rooms = this.page.waitForResponse(isApiCall('GET', '/api/rooms'));
    await this.page.goto('/');
    return rooms;
  }

  /** A room as shown in the overview before any search (display only). */
  overviewRoom(room: MeetingRoom): Locator {
    return this.page.getByText(room.name, { exact: true });
  }

  /** A selectable room card in the search results. */
  resultCard(room: MeetingRoom): Locator {
    return this.page.getByRole('button', { name: `${room.name}, plads til ${room.capacity}`, exact: true });
  }

  async chooseParticipants(count: number): Promise<void> {
    await this.page.getByRole('button', { name: `${count} deltagere`, exact: true }).click();
  }

  /** Clicks search and returns the API response the results are built from. */
  async search(): Promise<Response> {
    const available = this.page.waitForResponse(isApiCall('GET', '/api/rooms/available'));
    await this.searchButton.click();
    return available;
  }

  async openBookingForm(room: MeetingRoom): Promise<void> {
    await this.resultCard(room).click();
    await expect(this.page.getByText(`Book ${room.name}`, { exact: true })).toBeVisible();
  }

  async fillBookingForm(title: string, bookedBy: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.bookedByInput.fill(bookedBy);
  }

  /** Clicks confirm and returns the POST /api/bookings response. */
  async confirmBooking(): Promise<Response> {
    const created = this.page.waitForResponse(isApiCall('POST', '/api/bookings'));
    await this.confirmButton.click();
    return created;
  }

  /** Records every request the page sends to /api/bookings from now on. */
  recordBookingRequests(): Request[] {
    const requests: Request[] = [];
    this.page.on('request', (request) => {
      if (request.url() === `${API_URL}/api/bookings`) requests.push(request);
    });
    return requests;
  }
}
