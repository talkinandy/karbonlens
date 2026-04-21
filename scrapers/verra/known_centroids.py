"""Hand-curated centroids for flagship Indonesian VCS projects.

These are v0.1 proxies sourced from public project design documents and the
Verra registry itself (detail-page `location` block, when present). They will be
superseded by digitized polygons in v0.2.

Accuracy: +/- 5-20 km; adequate as a centroid proxy for v0.1 alert buffering
(10 km radius, see architecture.md section 5.1). Replace in v0.2 when we
digitize polygons from project PDDs.

NOTE (OQ-1, now resolved): Andy reviews and corrects this list at code-audit
stage. Coordinates below are best-effort from public sources; the Verra detail
API also exposes a `location` field on many projects that supersedes this dict
at scrape time (see `fetch.py::_resolve_centroid`).
"""

from __future__ import annotations

# (latitude, longitude) in WGS84. Sources cited per entry.
KNOWN_CENTROIDS: dict[str, tuple[float, float]] = {
    # 1. Katingan Mentaya (Central Kalimantan) — the flagship Indonesian REDD+
    #    peatland project. Verra `/resourceSummary/1477` returns location
    #    (-2.382579, 113.267275); matches published PDD figure-1 map.
    "VCS1477": (-2.382579, 113.267275),
    # 2. Rimba Raya Biodiversity Reserve (Seruyan, Central Kalimantan). Public
    #    project page on InfiniteEARTH: ~ -3.05, 112.30. See
    #    https://infinite-earth.com/rimba-raya/.
    "VCS612": (-3.050000, 112.300000),
    # 3. Merang REDD+ Pilot (South Sumatra). PDD project boundary centroid on
    #    Sembilang-Dangku peatland; approx -2.25, 104.25.
    "VCS1350": (-2.250000, 104.250000),
    # 4. Sumatera Merang Peatland Project (South Sumatra). PDD boundary is
    #    adjacent to VCS1350 but centred further south; approx -2.75, 104.55.
    "VCS944": (-2.750000, 104.550000),
    # 5. Cendrawasih / Aru Islands REDD+ (Maluku). PDD boundary centres near
    #    the central Aru group; approx -6.10, 134.60.
    "VCS2562": (-6.100000, 134.600000),
    # 6. Rimba Makmur Utama — companion extension to Katingan in C. Kalimantan.
    #    Centroid placed between Katingan and Sampit; approx -2.55, 113.00.
    "VCS1764": (-2.550000, 113.000000),
    # 7. Jantho REDD+ (Aceh). PDD boundary in Aceh Besar; approx 5.35, 95.60.
    #    (Replaces the duplicate VCS1764 row that was in the pre-audit spec.)
    "VCS2642": (5.350000, 95.600000),
    # 8. Gunung Palung REDD+ buffer (West Kalimantan). PDD centroid near Sukadana;
    #    approx -1.30, 110.20.
    "VCS985": (-1.300000, 110.200000),
    # 9. Ketapang REDD+ (West Kalimantan). Public map puts the boundary around
    #    Ketapang regency; approx -1.85, 110.00.
    "VCS1748": (-1.850000, 110.000000),
    # 10. Infinite Benefits Sustainable Palm (Riau). Public press indicates the
    #     project covers plantations in Riau province; approx 0.30, 102.20.
    "VCS1659": (0.300000, 102.200000),
}


# Province-level fallback centroids (used when no project-specific entry and
# no `location` field on the Verra detail response). Based on provincial
# capitals / geographic centres of the province as a rough proxy.
PROVINCE_CENTROIDS: dict[str, tuple[float, float]] = {
    "Central Kalimantan": (-1.6813, 113.3823),
    "East Kalimantan": (0.5387, 116.4194),
    "West Kalimantan": (0.0256, 109.3426),
    "South Kalimantan": (-3.3194, 114.5908),
    "North Kalimantan": (3.0731, 116.0413),
    "South Sumatra": (-3.3194, 104.9144),
    "North Sumatra": (2.1154, 99.5451),
    "West Sumatra": (-0.7399, 100.8000),
    "Riau": (0.5333, 101.4500),
    "Riau Islands": (0.9167, 104.4503),
    "Jambi": (-1.6101, 103.6131),
    "Bengkulu": (-3.5778, 102.3464),
    "Lampung": (-4.5586, 105.4068),
    "Aceh": (5.5483, 95.3238),
    "Papua": (-4.2699, 138.0804),
    "West Papua": (-1.3361, 132.1747),
    "Maluku": (-3.2385, 130.1453),
    "North Maluku": (0.8917, 127.7404),
    "Sulawesi": (-1.4300, 121.4456),
    "Central Sulawesi": (-1.4300, 121.4456),
    "South Sulawesi": (-3.6688, 119.9741),
    "Southeast Sulawesi": (-4.1449, 122.1746),
    "North Sulawesi": (0.6246, 123.9750),
    "West Sulawesi": (-2.8441, 119.2321),
    "Gorontalo": (0.6999, 122.4467),
    "East Java": (-7.5361, 112.2384),
    "Central Java": (-7.1500, 110.1403),
    "West Java": (-6.8896, 107.6405),
    "Banten": (-6.4058, 106.0640),
    "Yogyakarta": (-7.8754, 110.4262),
    "Bali": (-8.3405, 115.0920),
    "West Nusa Tenggara": (-8.6529, 117.3616),
    "East Nusa Tenggara": (-8.6574, 121.0794),
    "Jakarta": (-6.2088, 106.8456),
}
