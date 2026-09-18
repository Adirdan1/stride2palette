'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from './Nav.js';
import PullToRefresh from './PullToRefresh.js';
import SettingsSheet from './SettingsSheet.js';
import useLive from './useLive.js';

/**
 * Settings live in a sheet owned by this shell, but things inside a page need to
 * open it — the overview's missing-opening-day alert is useless if it only says
 * the date is missing and leaves you to find where to set it. A context is the
 * smallest way to hand that down without every page forwarding a prop it does
 * not otherwise care about.
 */
const SettingsContext = createContext(null);

/** Opens the settings sheet, optionally focusing one field. Null outside a Screen. */
export function useSettingsSheet() {
  return useContext(SettingsContext);
}

/**
 * The frame every page sits in: pull-to-refresh at the top, navigation at the
 * bottom, and a poll keeping both in step with whatever everybody else is
 * doing.
 */
export default function Screen({ me, domains, openByDomain, settings, users, action, children }) {
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  const [focusField, setFocusField] = useState(null);
  useLive(5);

  const openSettings = useCallback((field = null) => {
    setFocusField(field);
    setShowSettings(true);
  }, []);
  const settingsApi = useMemo(() => ({ open: openSettings }), [openSettings]);

  return (
    <main className="shell">
      <PullToRefresh />

      <header className="topbar">
        {/* Always the app's name. The page names itself once, in its own
            heading — showing the section here too meant "Finance" twice on a
            screen with room for neither. */}
        <span className="brand">
          Palette<span className="brand__mark">.</span>
        </span>

        <div className="topbar__actions">
          {/* A page's primary action lives here rather than floating over the
              list. A bottom-corner button covers whatever it floats over, and
              with right-aligned Hebrew that is the start of every line it
              passes — not the trailing whitespace it covers in English. */}
          {action && (
            <button
              type="button"
              className="topbar__action"
              onClick={action.onClick}
              aria-label={action.label}
            >
              <span aria-hidden="true">+</span>
            </button>
          )}
          <button
            type="button"
            className="whoami"
            onClick={() => openSettings()}
            aria-label="Settings and staff"
          >
            {me?.displayName ?? 'Settings'}
          </button>
        </div>
      </header>

      <SettingsContext.Provider value={settingsApi}>{children}</SettingsContext.Provider>

      <Nav domains={domains} openByDomain={openByDomain} />

      {showSettings && settings && (
        <SettingsSheet
          settings={settings}
          users={users ?? []}
          focus={focusField}
          onClose={() => setShowSettings(false)}
          onChanged={() => router.refresh()}
        />
      )}
    </main>
  );
}
