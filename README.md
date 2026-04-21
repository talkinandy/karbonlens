# KarbonLens

> Indonesia's carbon market, in one terminal.
> *Pasar karbon Indonesia dalam satu layar.*

A carbon-market intelligence terminal reconciling SRN-PPI, IDXCarbon, Verra, Gold Standard, Sentinel (RADD / VIIRS / NDVI), and JDIH into a single workspace for developers, corporates, banks, and regulators.

## Quickstart (v0.1 — Next.js app)

Prerequisites: Node.js 20+ (tested on 22.x), npm 10+.

```sh
# 1. Install dependencies
npm install

# 2. Copy env template and fill in real values
cp .env.example .env.local
# edit .env.local — DATABASE_URL and NEXTAUTH_SECRET are required; the rest
# can stay as CHANGE_ME until T04/T05 wire them in.

# 3. Start the dev server (Turbopack)
npm run dev
# open http://localhost:3000

# 4. Production build (typecheck + compile)
npm run build
npm run start
```

### Routes (T03 scaffold, mock data)

| Route                                  | Source                                    |
| -------------------------------------- | ----------------------------------------- |
| `/`                                    | `app/(public)/page.tsx` — landing         |
| `/projects`                            | `app/(app)/projects/page.tsx`             |
| `/projects/katingan-peatland`          | `app/(app)/projects/[slug]/page.tsx`      |
| `/prices`                              | `app/(app)/prices/page.tsx`               |
| `/regulatory`                          | `app/(app)/regulatory/page.tsx`           |
| `/alerts`                              | `app/(app)/alerts/page.tsx`               |

All pages currently read from `lib/mock-data.ts`. T11+ swaps the imports for Drizzle queries.

## Legacy static prototype

The original static HTML/JSX prototype lives under `legacy/prototype/` for design reference. It is not wired into the Next.js app. To view it:

```sh
cd legacy/prototype
python -m http.server 8000
# open http://localhost:8000
```

## Screens

| URL                            | Screen |
| ------------------------------ | ------ |
| `/`                            | Landing — editorial hero, live satellite monitor (T13), featured projects |
| `/projects`                    | Registry table — Indonesian carbon projects with filters |
| `/projects/:slug`              | Dossier — satellite MRV, score breakdown, VCU timeline, news & signals |
| `/prices`                      | IDXCarbon snapshot — multi-series price chart, transactions table |
| `/regulatory`                  | Policy timeline — Permenhut 6/2026, Perpres 110/2025, POJK, Kepmen |
| `/alerts`                      | Inbox — reversal, price, regulatory, news, retirement, issuance |

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

## Repository layout

```
app/                     Next.js 15 App Router
  (public)/              public routes (landing)
  (app)/                 authenticated routes (T05 adds middleware)
  api/                   API routes (T04+)
  globals.css            Tailwind v4 + design tokens from legacy/prototype
  layout.tsx             root layout (html, body, fonts)
components/              shared React components
  site-nav.tsx
  ui/                    design-system primitives (T11+)
  map/                   MapLibre wrappers (T13)
lib/
  mock-data.ts           seeded UI data; deleted in T11+
scrapers/                Python scrapers (T06+)
legacy/prototype/        original static HTML/CSS/JSX prototype
docs/                    PRD, architecture, story specs
```

## Bilingual

Indonesian regulatory and place-name terms are kept verbatim — never translated:
Permenhut, Perpres, POJK, Kepmen, Padiatapa, Nesting, Mitra Pendamping, PBPH, Hutan Adat, Hutan Hak, SRN-PPI, SRUK, SPE-GRK, IDXCarbon, BPDLH.

## License

Prototype — internal use.
