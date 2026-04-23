/**
 * components/projects/FilterChips.tsx — T11 server component.
 *
 * Each filter group collapses into a native `<details>` element: the
 * summary shows the active selections inline so users can scan active
 * filters at a glance without the 40-chip sprawl eating half the
 * viewport. Clicking the summary expands the full option list.
 *
 * Open by default when at least one filter in that group is active, so
 * returning users see their current selection without an extra click.
 * Closed by default otherwise, which keeps the filter card compact
 * regardless of viewport (no JS, no media queries).
 *
 * Status continues to show 4 chips expanded by default — it's small
 * enough that collapsing would be pointless churn.
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
      className="kl-card kl-filters-card"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <FilterGroup
        label="Province"
        paramKey="province"
        options={options.province}
        active={active.province}
        searchParams={searchParams}
        pathname={pathname}
        collapsible
      />
      <FilterGroup
        label="Type"
        paramKey="type"
        options={options.type}
        active={active.type}
        searchParams={searchParams}
        pathname={pathname}
        collapsible
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
        <div style={{ paddingTop: 2 }}>
          <Link href={clearHref} className="kl-btn kl-btn--secondary">
            Clear all filters
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
  collapsible?: boolean;
};

function FilterGroup({
  label,
  paramKey,
  options,
  active,
  searchParams,
  pathname,
  decorateLabel,
  collapsible = false,
}: FilterGroupProps) {
  if (options.length === 0) return null;

  const activeDisplay =
    active.length === 0
      ? null
      : active
          .map((v) => (decorateLabel ? decorateLabel(v) : v))
          .join(', ');

  // Non-collapsible: render flat chip row (Status group).
  if (!collapsible) {
    return (
      <div className="kl-filter-group">
        <span className="kl-filter-group-label">{label}</span>
        <div className="kl-filter-chip-row">
          {options.map((value) => (
            <FilterChip
              key={value}
              value={value}
              active={active.includes(value)}
              paramKey={paramKey}
              searchParams={searchParams}
              pathname={pathname}
              decorateLabel={decorateLabel}
            />
          ))}
        </div>
      </div>
    );
  }

  // Collapsible: native <details>. Open when any filter in this group
  // is active so users see their selection without an extra click.
  return (
    <details
      className="kl-filter-details"
      open={active.length > 0}
    >
      <summary className="kl-filter-summary">
        <span className="kl-filter-summary-label">
          {label}
          {active.length > 0 ? (
            <span className="kl-filter-summary-count">
              · {active.length} selected
            </span>
          ) : (
            <span className="kl-filter-summary-count">
              · {options.length} options
            </span>
          )}
        </span>
        {activeDisplay ? (
          <span className="kl-filter-summary-active" title={activeDisplay}>
            {activeDisplay}
          </span>
        ) : null}
      </summary>
      <div className="kl-filter-chip-row">
        {options.map((value) => (
          <FilterChip
            key={value}
            value={value}
            active={active.includes(value)}
            paramKey={paramKey}
            searchParams={searchParams}
            pathname={pathname}
            decorateLabel={decorateLabel}
          />
        ))}
      </div>
    </details>
  );
}

function FilterChip({
  value,
  active,
  paramKey,
  searchParams,
  pathname,
  decorateLabel,
}: {
  value: string;
  active: boolean;
  paramKey: string;
  searchParams: Record<string, string | string[] | undefined>;
  pathname: string;
  decorateLabel?: (raw: string) => string;
}) {
  const href = buildFilterUrl(pathname, searchParams, {
    toggle: { key: paramKey, value },
  });
  const display = decorateLabel ? decorateLabel(value) : value;
  return (
    <Link
      href={href}
      className={`kl-filter-chip${active ? ' is-active' : ''}`}
      aria-pressed={active}
    >
      {display}
    </Link>
  );
}
