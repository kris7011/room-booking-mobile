// .tsx like the rest of the React Native code, which keeps it out of the Node
// test build (see tsconfig.test.json). The logic lives in utils/clock.ts.
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { watchClock } from '../utils/clock';

/**
 * The current time, renewed when a new half-hour slot or a new day starts and
 * when the app returns from the background. In between it stays the same, so
 * the screen only re-renders when something time-dependent can have changed.
 *
 * `refresh` reads the clock right away, e.g. before acting on the time.
 */
export function useClock(): { now: Date; refresh: () => void } {
  const [now, setNow] = useState(() => new Date());
  const [startedAt] = useState(now);

  useEffect(
    () =>
      watchClock({
        since: startedAt,
        onChange: setNow,
        subscribeToResume: (onResume) => {
          const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') onResume();
          });
          // React Native Web returns nothing where the browser has no Page Visibility API.
          return () => subscription?.remove();
        },
      }),
    [startedAt],
  );

  const refresh = useCallback(() => setNow(new Date()), []);
  return { now, refresh };
}
