'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Bottom navigation, because these are phone apps held in one hand and every
 * page has to be reachable with a thumb.
 *
 * Each domain carries its count of open work, so the nav answers "where is the
 * pressure" without anybody opening anything.
 *
 * Eight destinations do not fit across a phone, so it scrolls — and scrolling
 * has to be *visible* or it may as well not exist. The first version simply cut
 * Marketing and Brand off the right-hand edge with no hint they were there, and
 * they were reported missing. Two things fix that: a mask fading both edges, so
 * the row visibly continues past them, and scrolling the current page into view
 * on arrival, so deep sections are never stranded off-screen.
 */
export default function Nav({ domains, openByDomain }) {
  const pathname = usePathname();
  const bar = useRef(null);

  useEffect(() => {
    const current = bar.current?.querySelector('[aria-current="page"]');
    // `nearest` keeps the bar still when the link is already visible, rather
    // than yanking it to centre on every navigation.
    current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  const links = [
    { href: '/', label: 'Overview', count: null },
    { href: '/people', label: 'People', count: null },
    ...domains.map((domain) => ({
      href: `/d/${domain.key}`,
      label: domain.label,
      count: openByDomain[domain.key] ?? 0,
    })),
  ];

  return (
    <nav className="nav" aria-label="Sections" ref={bar}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="nav__link"
          aria-current={pathname === link.href ? 'page' : undefined}
        >
          <span>{link.label}</span>
          {link.count !== null && <span className="nav__count">{link.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
