'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const THRESHOLD = 72;   // how far you have to pull before it will fire
const MAX_PULL = 110;   // where the rubber band stops giving

/**
 * Pull down at the top of the page to refetch. Adapted from Stride, which is
 * the collection's implementation of this.
 *
 * `router.refresh()` re-runs the server components, which is exactly the right
 * primitive here: the board is force-dynamic, so a refresh re-reads the
 * database and re-derives every band, total and countdown from scratch. Nothing
 * is cached client-side that could go stale behind it — which also means this
 * is how a second person's edits arrive on your screen.
 *
 * The pull is resisted — it moves at a diminishing fraction of your finger — so
 * it feels like it is attached to something rather than tracking one-to-one.
 */
export default function PullToRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const [pull, setPull] = useState(0);
  const [armed, setArmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Held in a ref as well, because the touch handlers are bound once and would
  // otherwise close over the first render's state forever.
  const start = useRef(null);
  const distance = useRef(0);

  useEffect(() => {
    if (pathname === '/unlock') return undefined;

    const onStart = (event) => {
      if (window.scrollY > 0 || event.touches.length !== 1) {
        start.current = null;
        return;
      }
      start.current = event.touches[0].clientY;
      distance.current = 0;
    };

    const onMove = (event) => {
      if (start.current === null) return;

      const delta = event.touches[0].clientY - start.current;

      // An upward drag, or any scroll, hands control straight back to the page.
      if (delta <= 0 || window.scrollY > 0) {
        start.current = null;
        distance.current = 0;
        setPull(0);
        setArmed(false);
        return;
      }

      // Square-root resistance: generous at first, then increasingly firm.
      const resisted = Math.min(MAX_PULL, Math.sqrt(delta) * 7);
      distance.current = resisted;
      setPull(resisted);
      setArmed(resisted >= THRESHOLD);

      // Only now suppress the native rubber-band, once we know the gesture is
      // ours. Doing it any earlier would break ordinary scrolling.
      if (event.cancelable) event.preventDefault();
    };

    const onEnd = () => {
      if (start.current === null) return;

      if (distance.current >= THRESHOLD) {
        // Hold the indicator at the threshold while the server works.
        setPull(THRESHOLD);
        startTransition(() => router.refresh());
      } else {
        setPull(0);
      }

      setArmed(false);
      start.current = null;
      distance.current = 0;
    };

    // passive: false is required for preventDefault to be honoured on touchmove.
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [router, pathname]);

  // Let go once the refresh lands.
  useEffect(() => {
    if (!isPending) setPull(0);
  }, [isPending]);

  if (pathname === '/unlock') return null;

  const visible = pull > 0 || isPending;

  return (
    <div
      className={`ptr${isPending ? ' ptr--working' : ''}${armed ? ' ptr--armed' : ''}`}
      style={{
        transform: `translateY(${visible ? pull : 0}px)`,
        opacity: visible ? Math.min(1, pull / 40) : 0,
        // Follow the finger exactly while dragging; ease only on release.
        transition: pull > 0 && !isPending ? 'none' : 'transform 260ms cubic-bezier(0.22,0.61,0.36,1), opacity 200ms linear',
      }}
      aria-hidden={!visible}
    >
      <span className="ptr__mark" />
      <span className="ptr__label" role="status">
        {isPending ? 'Refreshing' : armed ? 'Release' : 'Pull'}
      </span>
    </div>
  );
}
