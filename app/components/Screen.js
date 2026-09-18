'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from './Nav.js';
import PullToRefresh from './PullToRefresh.js';
import SettingsSheet from './SettingsSheet.js';
import useLive from './useLive.js';

/**
 * The frame every page sits in: pull-to-refresh at the top, navigation at the
 * bottom, and a poll keeping both in step with whatever everybody else is
 * doing.
 */
export default function Screen({ title, me, domains, openByDomain, settings, users, children }) {
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  useLive(5);

  return (
    <main className="shell">
      <PullToRefresh />

      <header className="topbar">
        <span className="brand">
          {title}<span className="brand__mark">.</span>
        </span>
        <button
          type="button"
          className="whoami"
          onClick={() => setShowSettings(true)}
          aria-label="Settings and staff"
        >
          {me?.displayName ?? 'Settings'}
        </button>
      </header>

      {children}

      <Nav domains={domains} openByDomain={openByDomain} />

      {showSettings && settings && (
        <SettingsSheet
          settings={settings}
          users={users ?? []}
          onClose={() => setShowSettings(false)}
          onChanged={() => router.refresh()}
        />
      )}
    </main>
  );
}
