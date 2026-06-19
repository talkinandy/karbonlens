'use client';

/**
 * components/mobile-nav.tsx — hamburger menu for small screens.
 *
 * The inline nav links are hidden <=768px (see globals.css); this provides the
 * replacement so phone users can actually reach every section. Pure client
 * component (toggle state); the link list is passed from the server SiteNav.
 */

import { useState } from 'react';
import Link from 'next/link';

type NavItem = { href: string; label: string };

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="kl-mobile-nav">
      <button
        type="button"
        className="kl-nav-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="kl-mobile-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{open ? '✕' : '☰'}</span>
      </button>
      {open && (
        <>
          <div className="kl-mobile-menu-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div id="kl-mobile-menu" className="kl-mobile-menu" role="menu">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                role="menuitem"
                className="kl-mobile-menu-link"
                onClick={() => setOpen(false)}
              >
                {it.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
