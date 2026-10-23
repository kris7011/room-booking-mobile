// Invitation links: roombookingdev://invitation?token=… opens the app with
// the token filled in. The token is a secret: it is only ever put in the
// link and the accept request, never in a log.
import { AUTH_SCHEME } from '../auth/auth-config';

export const INVITATION_LINK_HOST = 'invitation';

/** Generated tokens are 43 URL-safe Base64 characters; the API accepts up to 128. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/** The link to send to the invited person. */
export function invitationLink(token: string): string {
  return `${AUTH_SCHEME}://${INVITATION_LINK_HOST}?token=${encodeURIComponent(token)}`;
}

/**
 * The token from what the user pasted: the token itself, or an invitation
 * link (also when e-mail or chat apps add text around it). Null if neither.
 */
export function parseInvitationInput(input: string): string | null {
  const text = input.trim();
  if (TOKEN_PATTERN.test(text)) return text;

  const match = /[?&]token=([^&#\s]+)/.exec(text);
  if (!match) return null;

  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return TOKEN_PATTERN.test(token) ? token : null;
}

/** The token of an incoming deep link, only for this app's invitation links. */
export function invitationTokenFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${AUTH_SCHEME}:`) return null;
  // roombookingdev://invitation?token=… : the host is "invitation".
  const target = (parsed.hostname || parsed.pathname.replace(/^\/+/, '')).toLowerCase();
  if (target !== INVITATION_LINK_HOST) return null;
  const token = parsed.searchParams.get('token');
  return token && TOKEN_PATTERN.test(token) ? token : null;
}
