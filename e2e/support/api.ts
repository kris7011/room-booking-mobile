import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

import type { BookingResponse, SaveBookingRequest } from '../../src/models/booking';
import type { ProblemDetails } from '../../src/models/problem-details';
import { API_URL } from './environment';

// Talks to the E2E API directly, outside the browser: to set up data the way
// another user would, and to check what the API really stored. Reuses the
// app's own contract types, so a contract change breaks the E2E build too.

export class BookingApi {
  constructor(private readonly request: APIRequestContext) {}

  /** Raw POST, for tests that check error responses. */
  postBooking(body: Partial<SaveBookingRequest> | Record<string, unknown>): Promise<APIResponse> {
    return this.request.post('/api/bookings', { data: body });
  }

  /** Creates a booking and fails the test unless the API answers 201. */
  async createBooking(body: SaveBookingRequest): Promise<BookingResponse> {
    const response = await this.postBooking(body);
    expect(response.status(), await response.text()).toBe(201);
    return (await response.json()) as BookingResponse;
  }

  async listBookings(): Promise<BookingResponse[]> {
    const response = await this.request.get('/api/bookings');
    expect(response.status()).toBe(200);
    return (await response.json()) as BookingResponse[];
  }

  /** Raw PUT, for tests that check error responses. */
  putBooking(id: number, body: SaveBookingRequest): Promise<APIResponse> {
    return this.request.put(`/api/bookings/${id}`, { data: body });
  }

  getBooking(id: number): Promise<APIResponse> {
    return this.request.get(`/api/bookings/${id}`);
  }

  getAvailableRooms(query: Record<string, string | number>): Promise<APIResponse> {
    return this.request.get('/api/rooms/available', { params: query });
  }

  /**
   * Empties the run's database between tests, through the public API. Only
   * ever called with a request context bound to the E2E API (see fixtures.ts).
   */
  async deleteAllBookings(): Promise<void> {
    for (const booking of await this.listBookings()) {
      const response = await this.request.delete(`/api/bookings/${booking.id}`);
      expect(response.status()).toBe(204);
    }
  }
}

/** Reads a Problem Details body and checks its status. */
export async function expectProblem(response: APIResponse, status: number): Promise<ProblemDetails> {
  expect(response.status(), await response.text()).toBe(status);
  expect(response.headers()['content-type']).toContain('application/problem+json');
  return (await response.json()) as ProblemDetails;
}

/** True for a browser response from the E2E API with this method and path. */
export function isApiCall(method: string, path: string) {
  return (response: { url(): string; request(): { method(): string } }) =>
    response.request().method() === method && new URL(response.url()).pathname === path && response.url().startsWith(API_URL);
}
