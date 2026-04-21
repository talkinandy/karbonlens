/**
 * components/projects/FilterChips.tsx — T11 server component.
 *
 * Renders three chip groups (Province, Type, Status) as <Link> elements.
 * Clicking a chip toggles its value in the URL via `buildFilterUrl`, which
 * preserves the current `tab`, `sort`, etc. See T11 §3.4.
 */

import Link from 'next/link';
import { buildFilterUrl } from '@/lib/url/build-filter-url';
import { displayStatus } from '@/lib/display/status';

type Options = {
  province: string[];
  type: string[];
  status: string[];
};

type Active = {
  province: string[];
  type: string[];
  status: string[];
};

export type FilterChipsProps = {
  options: Options;
  active: Active;
  searchParams: Record<string, string | string[] | undefined>;
  pathname?: string;
};

export function FilterChips({
  options,
  active,
  searchParams,
  pathname = '/projects',
}: FilterChipsProps) {
  const hasActive =
    active.province.length > 0 ||
    active.type.length > 0 ||
    active.status.length > 0;

  const tabValue =
    typeof searchParams.tab === 'string' ? searchParams.tab : undefined;
  const clearHref = buildFilterUrl(
    pathname,
    {},
    tabValue ? { set: { tab: tabValue } } : {},
  );

  return (
    <div
      className="kl-card"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <FilterGroup
        label="Province"
        paramKey="province"
        options={options.province}
        active={active.province}
        searchParams={searchParams}
        pathname={pathname}
      />
      <FilterGroup
        label="Type"
        paramKey="type"
        options={options.type}
        active={active.type}
        searchParams={searchParams}
        pathname={pathname}
      />
      <FilterGroup
        label="Status"
        paramKey="status"
        options={options.status}
        active={active.status}
        searchParams={searchParams}
        pathname={pathname}
        decorateLabel={(raw) => displayStatus(raw).label}
      />

      {hasActive && (
        <div style={{ paddingTop: 4 }}>
          <Link href={clearHref} className="kl-btn kl-btn--secondary">
            Clear filters
          </Link>
        </div>
      )}
    </div>
  );
}

type FilterGroupProps = {
  label: string;
  paramKey: string;
  options: string[];
  active: string[];
  searchParams: Record<string, string | string[] | undefined>;
  pathname: string;
  decorateLabel?: (raw: string) => string;
};

function FilterGroup({
  label,
  paramKey,
  options,
  active,
  searchParams,
  pathname,
  decorateLabel,
}: FilterGroupProps) {
  if (options.length === 0) return null;

  return (
    <div className="kl-filter-group">
      <span className="kl-filter-group-label">{label}</span>
      <div className="kl-filter-chip-row">
        {options.map((value) => {
          const isActive = active.includes(value);
          const href = buildFilterUrl(pathname, searchParams, {
            toggle: { key: paramKey, value },
          });
          const display = decorateLabel ? decorateLabel(value) : value;
          return (
            <Link
              key={value}
              href={href}
              className={`kl-filter-chip${isActive ? ' is-active' : ''}`}
              aria-pressed={isActive}
            >
              {display}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
