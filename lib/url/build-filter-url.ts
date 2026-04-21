/**
 * lib/url/build-filter-url.ts — shared URL builder for the projects explorer.
 *
 * Every <Link> href rendered by FilterChips, SortControl, and the pagination
 * row is constructed via this helper so the canonical repeated-key form is
 * used consistently AND so the current `tab` value is always preserved (see
 * T11 §3.3 tab preservation rule — required for T13 compatibility).
 */

export type FilterUrlMutation = {
  /** Toggle a value in a multi-value param — add if absent, remove if present. */
  toggle?: { key: string; value: string };
  /** Set a single-value param. Pass `null` to clear. */
  set?: Record<string, string | null>;
  /** Remove all keys listed here. */
  remove?: string[];
};

/**
 * Build a relative URL string of the form `pathname?key=v1&key=v2`.
 *
 * `searchParams` is the already-parsed map as received by the Next.js page
 * component; array entries are rendered as repeated-key form (not comma-join).
 */
export function buildFilterUrl(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>,
  mutation: FilterUrlMutation = {},
): string {
  // Normalise the incoming params into a Record<string, string[]> we can edit.
  const map = new Map<string, string[]>();

  for (const [k, v] of Object.entries(searchParams)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      map.set(
        k,
        v.filter((x) => typeof x === 'string' && x.length > 0),
      );
    } else if (typeof v === 'string' && v.length > 0) {
      map.set(k, [v]);
    }
  }

  // Apply mutations.
  if (mutation.toggle) {
    const { key, value } = mutation.toggle;
    const existing = map.get(key) ?? [];
    const next = existing.includes(value)
      ? existing.filter((x) => x !== value)
      : [...existing, value];
    if (next.length === 0) {
      map.delete(key);
    } else {
      map.set(key, next);
    }
    // Toggling a filter resets pagination.
    map.delete('page');
  }

  if (mutation.set) {
    for (const [k, v] of Object.entries(mutation.set)) {
      if (v === null) {
        map.delete(k);
      } else {
        map.set(k, [v]);
      }
    }
  }

  if (mutation.remove) {
    for (const k of mutation.remove) {
      map.delete(k);
    }
  }

  // Serialize in a stable order so tests are deterministic.
  const parts: string[] = [];
  const keys = [...map.keys()].sort();
  for (const k of keys) {
    for (const v of map.get(k) ?? []) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  }
  return parts.length === 0 ? pathname : `${pathname}?${parts.join('&')}`;
}

/**
 * Serialize searchParams into a URLSearchParams-like query string, used by
 * SortControl and pagination to mirror the current state before applying one
 * targeted change.
 */
export function flattenSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(searchParams)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === 'string' && x.length > 0) out.push([k, x]);
      }
    } else if (typeof v === 'string' && v.length > 0) {
      out.push([k, v]);
    }
  }
  return out;
}
