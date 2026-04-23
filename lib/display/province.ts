/**
 * province.ts — canonical-name lookup for Indonesian provinces.
 *
 * Raw `projects.province` strings come in from Verra, SRN-PPI, and Gold
 * Standard with inconsistent casing ("NORTH KALIMANTAN"), redundant
 * suffixes ("… Province"/"… provinces"), Indonesian/English dupes
 * ("Sumatera Utara" vs "North Sumatra", "Kalimantan Tengah" vs "Central
 * Kalimantan"), and outright garbage ("na", "Entire territory of
 * Indonesia", project codes). This module is the v0.1 cleanup layer:
 *
 *  - `toCanonicalProvince(raw)` maps a DB string to its canonical label,
 *    or `null` when the raw value should be hidden from the filter.
 *  - `expandCanonicalToRaw(canonical)` does the inverse so the WHERE
 *    clause can match every raw variant that canonicalises to the
 *    user-selected label.
 *
 * v0.2 will push this into a `projects.province_canonical` column so
 * the DB joins can participate in the normalisation directly — until
 * then, the JS round-trip here is the single source of truth.
 */

// Map of raw DB value → canonical display name (or `null` to drop from
// the filter UI entirely because the raw value isn't a province).
const CANONICAL_BY_RAW: Record<string, string | null> = {
  // Garbage / not-a-province — dropped from filter UI.
  'na': null,
  'Entire territory of Indonesia': null,
  'PAI1: East Kota Waringin': null,

  // Aceh cluster (kept as a multi-province label because the underlying
  // projects genuinely span both; deduping with the longer suffix form).
  'Aceh and North Sumatra': 'Aceh & North Sumatra',
  'Aceh and North Sumatra provinces': 'Aceh & North Sumatra',

  // Simple canonicals (match raw == canonical).
  'Banten': 'Banten',
  'Bengkulu': 'Bengkulu',
  'Papua': 'Papua',

  // Kalimantan cluster — Indonesian `Barat`/`Tengah`/`Utara` = English
  // `West`/`Central`/`North`; registries mix both conventions.
  'Central Kalimantan': 'Central Kalimantan',
  'Central Kalimantan Tengah': 'Central Kalimantan',
  'Kalimantan Tengah': 'Central Kalimantan',
  'East Kalimantan Province': 'East Kalimantan',
  'Kalimantan Barat': 'West Kalimantan',
  'West Kalimantan': 'West Kalimantan',
  'West Kalimantan province': 'West Kalimantan',
  'North Kalimantan': 'North Kalimantan',
  'NORTH KALIMANTAN': 'North Kalimantan',

  // Maluku cluster.
  'Maluku': 'Maluku',
  'Maluku Province': 'Maluku',
  'North Maluku': 'North Maluku',

  // Riau — two raw values name districts inside Riau; we lift them up.
  'Riau Province': 'Riau',
  'Siak District, Riau Province': 'Riau',
  'Ujung Batu district. Rokan Hulu Region, Prov. Riau': 'Riau',

  // Sulawesi cluster.
  'Gorontalo Province': 'Gorontalo',
  'North Sulawesi': 'North Sulawesi',
  'North Sulawesi Province': 'North Sulawesi',
  'South Sulawesi': 'South Sulawesi',

  // Sumatra cluster — Indonesian `Sumatera Utara`/`Selatan` = English
  // `North`/`South Sumatra`. Also rolls "Kabupaten Batubara, Sumetera
  // Utara" (a regency IN North Sumatra, misspelled).
  'North Sumatra': 'North Sumatra',
  'North Sumatra Province': 'North Sumatra',
  'Sumatera Utara': 'North Sumatra',
  'Kabupaten Batubara, Sumetera Utara': 'North Sumatra',
  'South Sumatera province': 'South Sumatra',
  'South Sumatera Province': 'South Sumatra',
  'South Sumatra': 'South Sumatra',
  'South Sumatra Province': 'South Sumatra',

  // West Java.
  'West Java': 'West Java',
  'West Java Province': 'West Java',
};

/**
 * Maps a raw DB province string to its canonical display name.
 *
 * Returns `null` when the value is garbage that should be hidden from
 * the filter UI (the underlying rows still exist and still show up
 * under no-province filtering, they just don't clutter the chip list).
 *
 * For raw values we haven't explicitly mapped, falls through to a
 * cautious title-case pass so newly-ingested province strings still
 * appear in the UI — if the shape is unfamiliar, a v0.2 migration can
 * add it to the table without code changes to the call sites.
 */
export function toCanonicalProvince(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (Object.prototype.hasOwnProperty.call(CANONICAL_BY_RAW, trimmed)) {
    return CANONICAL_BY_RAW[trimmed];
  }

  // Case-insensitive fallback match — catches newly-ingested case variants.
  const lower = trimmed.toLowerCase();
  for (const key of Object.keys(CANONICAL_BY_RAW)) {
    if (key.toLowerCase() === lower) return CANONICAL_BY_RAW[key];
  }

  // Unknown province string — conservative title-case pass so it's still
  // at least legible in the chip list.
  return titleCase(trimmed);
}

/**
 * Given a canonical province label, return every raw DB string that
 * canonicalises to it. Used by the filter WHERE clause: user clicks the
 * "North Sumatra" chip, server runs `WHERE province IN (<every raw
 * variant>)` so rows stored as "Sumatera Utara" also match.
 *
 * For labels we produced via the title-case fallback (not in the table),
 * returns `[label]` so the match still catches the original ingest.
 */
export function expandCanonicalToRaw(canonical: string): string[] {
  const out: string[] = [];
  for (const [raw, canon] of Object.entries(CANONICAL_BY_RAW)) {
    if (canon === canonical) out.push(raw);
  }
  if (out.length > 0) return out;
  // Fallback: title-case produced the canonical, so try matching the
  // input verbatim (most likely equal to itself).
  return [canonical];
}

/** v0.1 title-case — ASCII only, good enough for Indonesian place names. */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((seg) =>
      /\s/.test(seg) ? seg : seg.charAt(0).toUpperCase() + seg.slice(1),
    )
    .join('');
}
