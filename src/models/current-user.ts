// Mirrors CurrentUserResponse in the .NET API
// (src/MeetingRoomBooking.Api/Features/Users/CurrentUserEndpoints.cs):
// who the API says the caller is, taken from the access token after it has
// validated its signature, issuer, audience and scope.
export interface CurrentUserResponse {
  displayName: string;
  /** preferred_username, usually an e-mail address. Display only, never a key. */
  username: string | null;
  tenantId: string;
  /** The API's own user record, or null when this identity is not linked to one yet. */
  user: { publicId: string; displayName: string } | null;
}
