import { useCallback, useEffect, useState } from 'react';

import { canAdminister } from '../organizations/permissions';
import { useSession } from '../organizations/SessionProvider';
import { HomeScreen } from './HomeScreen';
import { OrganizationAdminScreen } from './OrganizationAdminScreen';

/**
 * The app's two pages: booking, and administration of the active
 * organisation. The administration page is only shown while the active
 * organisation lets the user administer it, so signing out, switching or
 * losing the role returns to booking by itself.
 */
export function AppScreens() {
  const { organizations } = useSession();
  // The organisation the administration page was opened for.
  const [adminFor, setAdminFor] = useState<string | null>(null);
  const active = organizations.status === 'ready' ? organizations.active : null;
  const closeAdmin = useCallback(() => setAdminFor(null), []);
  const showAdmin = active !== null && adminFor === active.publicId && canAdminister(active.role);

  // Closed for good once it cannot be shown, so it never reappears by itself
  // (e.g. when the role comes back later).
  useEffect(() => {
    if (adminFor !== null && !showAdmin) setAdminFor(null);
  }, [adminFor, showAdmin]);

  if (showAdmin) {
    return <OrganizationAdminScreen key={active.publicId} organization={active} onBack={closeAdmin} />;
  }

  return <HomeScreen onOpenAdmin={() => setAdminFor(active?.publicId ?? null)} />;
}
