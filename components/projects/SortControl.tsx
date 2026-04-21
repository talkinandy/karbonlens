'use client';

/**
 * components/projects/SortControl.tsx — T11 sort dropdown.
 *
 * Decision from T11 OQ-4: use a client component with `useRouter` rather than
 * a hidden-input form. Keeping filter chips server-rendered and sort as a
 * client leaf component avoids the verbose form-with-hidden-inputs pattern
 * while still preserving every other query param (including `tab`) on change.
 *
 * The component reads the current sort from `currentSort` (prop, set by the
 * server page) and navigates via `router.push` when the user picks a new
 * option. All other `searchParams` entries — including multi-value filters
 * and `tab` — are carried forward via the `searchParams` prop so the page
 * stays consistent across navigation.
 */

import { useRouter } from 'next/navigation';
import type { ProjectsListSort } from '@/lib/queries/projects-list';
import { buildFilterUrl } from '@/lib/url/build-filter-url';

const SORT_OPTIONS: Array<{ value: ProjectsListSort; label: string }> = [
  { value: 'score_desc', label: 'Score (high → low)' },
  { value: 'score_asc', label: 'Score (low → high)' },
  { value: 'hectares_desc', label: 'Largest first' },
  { value: 'name_asc', label: 'Name A–Z' },
];

export type SortControlProps = {
  currentSort: ProjectsListSort;
  searchParams: Record<string, string | string[] | undefined>;
  pathname?: string;
};

export function SortControl({
  currentSort,
  searchParams,
  pathname = '/projects',
}: SortControlProps) {
  const router = useRouter();

  function handleChange(value: string) {
    const next = SORT_OPTIONS.find((o) => o.value === value)?.value;
    if (!next) return;
    const href = buildFilterUrl(pathname, searchParams, {
      set: { sort: next },
    });
    router.push(href);
  }

  return (
    <div className="kl-sort-control">
      <label htmlFor="kl-sort-select">Sort</label>
      <select
        id="kl-sort-select"
        className="kl-select"
        value={currentSort}
        onChange={(e) => handleChange(e.target.value)}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
