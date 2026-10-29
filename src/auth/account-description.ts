// The account panel's texts about how the user signs in, as plain functions
// so they are tested without React Native.
import { isPersonalAccountTenant } from './entra-config';
import type { AuthProviderId, AuthUser } from './id-token';

/** How the signed-in user signed in, e.g. "Logget ind med en personlig Microsoft-konto". */
export function describeAccount(user: AuthUser): string {
  if (user.provider === 'external-id') return 'Logget ind med e-mail-kode';
  return isPersonalAccountTenant(user.tenantId)
    ? 'Logget ind med en personlig Microsoft-konto'
    : 'Logget ind med en Microsoft arbejds- eller skolekonto';
}

/** The text above the sign-in buttons. */
export function describeSignInChoice(providers: readonly AuthProviderId[], demoMode: boolean): string {
  const withEmail = providers.includes('external-id');
  if (demoMode) {
    return withEmail
      ? 'Du kan bruge demoen uden login. Log ind for at afprøve Microsoft-login eller login med e-mail-kode på telefonen.'
      : 'Du kan bruge demoen uden login. Log ind for at afprøve Microsoft-login på telefonen.';
  }
  // Microsoft's e-mail page treats Hotmail, Outlook and Live addresses as
  // Microsoft accounts and offers them no e-mail sign-up (seen 29 October 2026).
  return withEmail
    ? 'Log ind med Microsoft eller med en engangskode på e-mail for at se og booke i din organisations mødelokaler. ' +
        'Har du en Hotmail-, Outlook- eller Live-adresse, så brug Log ind med Microsoft.'
    : 'Log ind med Microsoft for at se og booke i din organisations mødelokaler.';
}

export const SIGN_IN_LABELS: Readonly<Record<AuthProviderId, string>> = {
  entra: 'Log ind med Microsoft',
  'external-id': 'Log ind med e-mail-kode',
};
