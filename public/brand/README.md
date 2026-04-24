# KarbonLens Product UI Kit

This is the KarbonLens terminal — a faithful recreation of the prototype. The `index.html` in this folder boots the full click-thru app so designers can see components in-situ.

## Structure

This kit uses the original source files (`index.html`, `styles.css`, `data.js`, `src/*.jsx`) at the project root as the canonical implementation. Rather than duplicate them, this README catalogs what's there.

## Components (in `../../src/`)

| File | Exports | Notes |
| --- | --- | --- |
| `shared.jsx` | `TopNav`, `Shell`, `Pill`, `ScoreBadge`, `Tag`, `statusToPill`, `useHashRoute`, `navigate` | Topnav, layout shell, tiny UI primitives, router |
| `SatelliteMap.jsx` | `SatelliteMap` | Dark satellite viewer. Reused on landing hero and project dossier |
| `Landing.jsx` | `Landing` | Editorial hero + ticker + pipelines + featured + roles + methodology |
| `Projects.jsx` | `Projects` | Filterable registry table |
| `ProjectDetail.jsx` | `ProjectDetail` | Per-project dossier |
| `Prices.jsx` | `Prices` | IDXCarbon chart + transactions |
| `Regulatory.jsx` | `Regulatory` | Policy timeline |
| `Alerts.jsx` | `Alerts` | Inbox |
| `App.jsx` | hash router | Maps `#/…` to screen components |

## Screens to explore

Open `index.html` and navigate:

- `#/` — landing
- `#/projects`
- `#/projects/katingan-peatland`
- `#/prices`
- `#/regulatory`
- `#/alerts`

## Design tokens

Import `../../colors_and_type.css` OR the full `../../styles.css` from the project root. The full stylesheet is the source of truth.
