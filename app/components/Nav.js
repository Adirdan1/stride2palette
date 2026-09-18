'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Bottom navigation, because these are phone apps held in one hand and every
 * page has to be reachable with a thumb.
 *
 * Each domain carries its count of open work, so the nav answers "where is the
 * pressure" without anybody opening anything. It scrolls horizontally rather
 * than wrapping — eight destinations will not fit across a phone, and a nav bar
 * that changes height as counts appear is worse than one that scrolls.
 */
export default function Nav({ domains, openByDomain }) {
  const pathname = usePathname();

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
    <nav className="nav" aria-label="Sections">
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
