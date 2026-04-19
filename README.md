# KarbonLens

> Indonesia's carbon market, in one terminal.
> *Pasar karbon Indonesia dalam satu layar.*

Bloomberg Terminal for Indonesian carbon markets — unified intelligence across project registries (Verra, SRN-PPI, Gold Standard), price feeds (IDXCarbon), satellite reversal alerts (GFW/RADD, VIIRS), and regulatory tracking (Permenhut, Perpres, POJK).

## Run it

`KarbonLens.html` is a single self-contained file. Open it in any modern browser:

```sh
open KarbonLens.html          # macOS
xdg-open KarbonLens.html      # Linux
```

No build step, no install. It uses React + ReactDOM + Babel-standalone via CDN.

## Screens

Hash-based routing — bookmarkable, deep-linkable.

| URL            | Screen                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| `#/`           | Landing — hero, live market stats, featured projects, pricing          |
| `#/projects`   | Projects explorer — filterable table of 127 Indonesian carbon projects |
| `#/projects/:id` | Project detail — satellite imagery viewer, score breakdown, VCU chart, news |
| `#/prices`     | Price intelligence — IDXCarbon stats, multi-line price chart, transactions |
| `#/regulatory` | Regulatory timeline — Perpres, Permen, POJK, Kepmen                    |
| `#/alerts`     | Alerts inbox — reversal, price, regulatory, news, retirement, issuance |

## Satellite imagery viewer

Project detail (`#/projects/katingan-peatland`) includes a full-chrome satellite viewer:

- Basemap selector: Sentinel-2 / Planet / Landsat 9
- Toggleable layers: True color, NDVI vegetation, Canopy height, RADD deforestation, VIIRS thermal, project polygon, graticule
- Opacity slider for overlay blending
- Click any RADD alert or VIIRS hotspot for metadata callout (confidence, coords, sensor, FRP)
- Scalebar, EPSG, lat/lon graticule, monospace metadata panel

## Design tokens

Flat, neutral, data-dense. No gradients, no shadows, no emoji in product UI.

- **Base:** `#FAFAF7` warm off-white
- **Text:** `#1A1A1A` (never pure black)
- **Borders:** 0.5px, rgba black at 8% / 14%
- **Semantic:** success teal `#0F6E56`, info blue `#185FA5`, warning amber `#854F0B`, danger red `#A32D2D`
- **Type:** `-apple-system` / Inter, weights 400 and 500 only (never 600/700)
- **Numbers:** tabular-nums everywhere

Full spec: see Design Brief (bundled context).

## Bilingual

Indonesian regulatory and place-name terms are kept verbatim — never translated:
Permenhut, Perpres, POJK, Kepmen, Padiatapa, Nesting, Mitra Pendamping, PBPH, Hutan Adat, Hutan Hak, SRN-PPI, SRUK, SPE-GRK, IDXCarbon, BPDLH.

## Data

All data is mocked inline in the `window.KL_DATA` block — 10 projects, 4 IDXCarbon transactions, 7 regulatory events, 7 alerts. No network calls.

## License

Prototype — internal use.
