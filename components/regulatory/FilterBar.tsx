'use client';

/**
 * FilterBar — client-side filter control for the T15 regulatory timeline.
 *
 * Shape (T15 §3.2):
 *   - Importance multi-select:   critical | high | medium | low (schema-enforced; safe to hardcode).
 *   - Ministry multi-select:     values come from props (dynamic via `getDistinctMinistries()`).
 *   - Tag multi-select:          values come from props (dynamic via `getDistinctTags()`).
 *   - Language toggle:           rendered inline (EN | ID, ARIA tablist, see LanguageToggle).
 *   - Inline "× Clear all":      shown only when any filter is active.
 *
 * URL serialisation is LOCKED to repeated query params (T15 §3.2):
 *   ?importance=critical&importance=high&ministry=Kemenhut&tag=forestry&tag=peatland&lang=id
 *
 * Read pattern (both places):
 *   - Server `searchParams` prop: already URL-decoded; use directly.
 *   - Client `useSearchParams().getAll(key)`: already URL-decoded; use directly.
 * NEVER call decodeURIComponent on values from searchParams — that corrupts
 * any literal '%' characters (T15 §7.4 double-decode bug).
 *
 * Write pattern:
 *   - encodeURIComponent each value exactly once and append as a repeated key.
 */

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { LanguageToggle } from './LanguageToggle';

// Importance is schema-enforced (T10's `DO $$ ASSERT $$` + T15 §3.2), so
// hardcoding these four is explicitly permitted by the spec.
const IMPORTANCE_OPTIONS = ['critical', 'high', 'medium', 'low'] as const;

type Props = {
  ministries: string[];
  tags: string[];
};

export function FilterBar({ ministries, tags }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedImportance = useMemo(
    () => searchParams.getAll('importance'),
    [searchParams],
  );
  const selectedMinistry = useMemo(
    () => searchParams.getAll('ministry'),
    [searchParams],
  );
  const selectedTag = useMemo(
    () => searchParams.getAll('tag'),
    [searchParams],
  );
  const currentLang = searchParams.get('lang');

  const anyFilterActive =
    selectedImportance.length > 0 ||
    selectedMinistry.length > 0 ||
    selectedTag.length > 0 ||
    (currentLang !== null && currentLang !== 'en');

  /**
   * Toggle a single value for a given multi-select dimension. Re-builds the
   * query string preserving all other keys (including the other dimensions
   * and `lang`). Values are stored one-per-param (no comma-joining).
   */
  const toggleValue = useCallback(
    (key: 'importance' | 'ministry' | 'tag', value: string) => {
      const params = new URLSearchParams();
      // Copy every other key verbatim; we'll rewrite the targeted `key` below.
      searchParams.forEach((v, k) => {
        if (k !== key) params.append(k, v);
      });

      const existing = searchParams.getAll(key);
      const isSelected = existing.includes(value);
      const next = isSelected
        ? existing.filter((v) => v !== value)
        : [...existing, value];
      // Re-append in deterministic alpha order so shared links are stable.
      for (const v of [...next].sort()) {
        params.append(key, v);
      }

      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const clearAll = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [pathname, router]);

  return (
    <section
      aria-label="Filters"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        marginBottom: 24,
        padding: 16,
        background: 'var(--surface)',
        border: '0.5px solid var(--border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <p className="kl-section-label" style={{ margin: 0 }}>
            Filters
          </p>
          {anyFilterActive ? (
            <button
              type="button"
              onClick={clearAll}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--text-2)',
                fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                textDecoration: 'underline',
              }}
            >
              × Clear all
            </button>
          ) : null}
        </div>
        <LanguageToggle />
      </div>

      <FilterGroup
        label="Importance"
        options={IMPORTANCE_OPTIONS as unknown as string[]}
        selected={selectedImportance}
        onToggle={(v) => toggleValue('importance', v)}
      />

      <FilterGroup
        label="Ministry"
        options={ministries}
        selected={selectedMinistry}
        onToggle={(v) => toggleValue('ministry', v)}
      />

      <FilterGroup
        label="Tags"
        options={tags}
        selected={selectedTag}
        onToggle={(v) => toggleValue('tag', v)}
      />
    </section>
  );
}

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="kl-section-label" style={{ marginBottom: 6 }}>
        {label}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((opt) => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(opt)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
                fontSize: 11,
                fontWeight: 500,
                padding: '3px 9px',
                borderRadius: 999,
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                cursor: 'pointer',
                background: isSelected ? 'var(--info-bg)' : 'var(--surface-2)',
                color: isSelected ? 'var(--info-fg)' : 'var(--text-2)',
                border: isSelected
                  ? '0.5px solid var(--info-fg)'
                  : '0.5px solid var(--border)',
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
