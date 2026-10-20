// RFC 7807 Problem Details, as produced by the API's Results.Problem and
// Results.ValidationProblem. `errors` is only present on validation problems
// (400), e.g. errors.startUtc when the start is not after the server's
// current time, and `code` is the API's own extension, e.g. "booking_overlap"
// (409) or "meeting_room_not_found" (404).
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
}
