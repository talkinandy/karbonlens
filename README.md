# KarbonLens

> Indonesia's carbon market, in one terminal.
> *Pasar karbon Indonesia dalam satu layar.*

A carbon-market intelligence terminal reconciling SRN-PPI, IDXCarbon, Verra, Gold Standard, Sentinel (RADD / VIIRS / NDVI), and JDIH into a single workspace for developers, corporates, banks, and regulators.

## Run it

`index.html` is the entry. Serve the folder — no build step:

```sh
python -m http.server 8000
# open http://localhost:8000
```

Or open `index.html` directly in a modern browser. Fonts load from Google Fonts; React + Babel-standalone from unpkg.

## Screens

Hash-based routing.

| URL              | Screen |
| ---------------- | ------ |
| `#/`             | Landing — editorial split-hero, live satellite monitor, ticker, pipelines, featured projects, roles, methodology, closer |
| `#/projects`     | Registry table — 214 indexed Indonesian carbon projects with filters |
| `#/projects/:id` | Dossier — satellite MRV, score breakdown, VCU timeline, news & signals |
| `#/prices`       | IDXCarbon snapshot — multi-series price chart, transactions table |
| `#/regulatory`   | Policy timeline — Permenhut 6/2026, Perpres 110/2025, POJK, Kepmen |
| `#/alerts`       | Inbox — reversal, price, regulatory, news, retirement, issuance |

## Design

Restraint-first, editorial. No gradients, no drop-shadows, no emoji in product UI.

**Type**
- `Instrument Serif` — display (hero H1, section H2s, stat values)
- `IBM Plex Sans` — body
- `IBM Plex Mono` — eyebrows, uppercase labels, tabular values, coordinates

**Palette**
- Base: `#FAFAF7` cream · Surface: `#FFFFFF` · Surface-2: `#F1EFE8`
- Text: `#1A1A1A` / `#5F5E5A` / `#888780`
- Brand accent (teal): `#0F6E56`
- Semantic: info `#185FA5`, warning `#854F0B`, danger `#A32D2D`
- Satellite viewer dark: bg `#0F1411`, toolbar `#161B18`, accent `#4FB89C`

**Elevation via 0.5px hairlines** (no shadows). Radii 8/12/16.

## Satellite map

`src/SatelliteMap.jsx` is the visual anchor, reused on landing hero and project detail. Togglable layers — base (True color / NDVI / Sentinel-1), overlays (boundary, graticule, RADD, GFW loss, VIIRS, community). Opacity slider, click any alert for a callout, pulsing RADD dots.

## Files

```
index.html         entry
styles.css         1100 lines — source of truth for all styling
data.js            window.KL_DATA — mock dataset
src/
├─ shared.jsx      router hook, TopNav, helpers, Pill, ScoreBadge, Tag
├─ SatelliteMap.jsx
├─ Landing.jsx
├─ Projects.jsx
├─ ProjectDetail.jsx
├─ Prices.jsx
├─ Regulatory.jsx
├─ Alerts.jsx
└─ App.jsx         hash router
```

## Bilingual

Indonesian regulatory and place-name terms are kept verbatim — never translated:
Permenhut, Perpres, POJK, Kepmen, Padiatapa, Nesting, Mitra Pendamping, PBPH, Hutan Adat, Hutan Hak, SRN-PPI, SRUK, SPE-GRK, IDXCarbon, BPDLH.

## License

Prototype — internal use.
