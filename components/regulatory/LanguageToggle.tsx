'use client';

/**
 * LanguageToggle — segmented EN | ID control for the T15 regulatory timeline.
 *
 * Spec contract (T15 §3.2):
 *   - Reflected in URL as `?lang=id` (absence = EN default).
 *   - role="tablist" on the container; role="tab" + aria-selected on each button.
 *   - Updates the URL via `useRouter().push()` while preserving all other
 *     searchParams (importance[], ministry[], tag[], etc.).
 *
 * Reads the current value via `useSearchParams().get('lang')`. When the user
 * clicks a tab we rebuild the query string with the new lang value (or delete
 * it for EN) and navigate via router.push(scroll:false) so tag/importance
 * filter state isn't lost.
 */

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

const LANGS = [
  { key: 'en', label: 'EN' },
  { key: 'id', label: 'ID' },
] as const;

type LangKey = (typeof LANGS)[number]['key'];

export function LanguageToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current: LangKey = searchParams.get('lang') === 'id' ? 'id' : 'en';

  const handleSelect = useCallback(
    (next: LangKey) => {
      if (next === current) return;
      // Build a fresh URLSearchParams from the current query; preserve every
      // other key (notably the repeated multi-select params: ?tag=a&tag=b).
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'en') {
        params.delete('lang');
      } else {
        params.set('lang', next);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [current, pathname, router, searchParams],
  );

  return (
    <div
      role="tablist"
      aria-label="Summary language"
      style={{
        display: 'inline-flex',
        border: '0.5px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--surface)',
      }}
    >
      {LANGS.map((l) => {
        const selected = l.key === current;
        return (
          <button
            key={l.key}
            role="tab"
            aria-selected={selected}
            type="button"
            onClick={() => handleSelect(l.key)}
            style={{
              border: 'none',
              padding: '4px 10px',
              fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              cursor: 'pointer',
              background: selected ? 'var(--surface-2)' : 'transparent',
              color: selected ? 'var(--text)' : 'var(--text-2)',
            }}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
