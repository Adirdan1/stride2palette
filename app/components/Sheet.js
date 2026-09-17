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

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

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
