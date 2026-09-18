'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keep the page in step with what other people are doing.
 *
 * Polling rather than websockets, deliberately. Realtime would mean the browser
 * talking to Supabase directly with a publishable key, which means writing RLS
 * policies — and every table in this collection has RLS on with zero policies,
 * which is its most consistently followed rule. A five-second poll on a board of
 * tens of rows buys the same thing for none of that.
 *
 * It stops while the tab is hidden. A phone in a pocket refreshing all afternoon
 * is somebody's battery and somebody's database quota.
 */
export default function useLive(seconds = 5) {
  const router = useRouter();

  useEffect(() => {
    let timer = null;

    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };

    const start = () => {
      stop();
      timer = setInterval(tick, seconds * 1000);
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Catch up immediately rather than waiting out the interval — coming
        // back to a stale board is exactly when it matters most.
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, seconds]);
}
