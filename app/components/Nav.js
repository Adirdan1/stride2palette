'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Bottom navigation, in two rows.
 *
 * Nine destinations do not fit across a phone in one row. The first attempt
 * scrolled and simply hid the last two, which were promptly reported missing —
 * a control nobody can see is not a control. So nothing scrolls and nothing
 * hides: the three whole-venue pages sit on the top row, the six areas on the
 * bottom. The split is meaningful rather than arithmetic, which also makes the
 * bar quicker to read than nine equal cells would be.
 *
 * It costs about 44px of height, on pages that scroll anyway. That is the
 * cheapest thing on the screen.
 */
export default function Nav({ domains, openByDomain }) {
  const pathname = usePathname();

  const main = [
    { href: '/', label: 'Overview' },
    { href: '/people', label: 'People' },
    { href: '/fund', label: 'Fund' },
  ];

  const areas = domains.map((domain) => ({
    href: `/d/${domain.key}`,
    label: domain.label,
    count: openByDomain[domain.key] ?? 0,
  }));

  const link = (item) => (
    <Link
      key={item.href}
      href={item.href}
      className="nav__link"
      aria-current={pathname === item.href ? 'page' : undefined}
    >
      <span className="nav__label">{item.label}</span>
      {item.count !== undefined && <span className="nav__count">{item.count}</span>}
    </Link>
  );

  return (
    <nav className="nav" aria-label="Sections">
      <div className="nav__row nav__row--main">{main.map(link)}</div>
      <div className="nav__row nav__row--areas">{areas.map(link)}</div>
    </nav>
  );
}
