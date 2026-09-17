'use client';

import { useEffect, useRef } from 'react';

/**
 * The bottom sheet everything that is not the board happens in.
 *
 * Keeping settings, staff and item editing in here is what keeps this a
 * one-screen app — the alternative is three more routes and a navigation bar to
 * reach them, for a tool that is fundamentally one list.
 *
 * Escape closes it, focus moves in on open and the scrim is a real button so it
 * is reachable without a pointer.
 */
export default function Sheet({ title, onClose, children }) {
  const panel = useRef(null);

  /**
   * `onClose` is an inline arrow in every caller, so it is a different function
   * on every render. Depending on it made this effect tear down and re-run on
   * each keystroke, and the `focus()` below then pulled focus out of whatever
   * field was being typed in — which on a phone closes the keyboard after every
   * single letter.
   *
   * So the effect runs once, and the handler reads the latest `onClose` through
   * a ref instead of being rebound.
   */
  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') latestClose.current();
    };
    document.addEventListener('keydown', onKey);

    // Only take focus if it is not already inside the sheet. The first field of
    // a form autofocuses itself, and stealing that back would pop the keyboard
    // open and shut again.
    if (!panel.current?.contains(document.activeElement)) {
      panel.current?.focus({ preventScroll: true });
    }

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <>
      <button type="button" className="sheet__scrim" onClick={onClose} aria-label="Close" />
      <section
        className="sheet"
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet__grip" aria-hidden="true" />
        <header className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Close</button>
        </header>
        {children}
      </section>
    </>
  );
}
