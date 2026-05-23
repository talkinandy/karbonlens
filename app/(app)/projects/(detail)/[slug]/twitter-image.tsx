// T26 — Twitter card reuses the opengraph-image renderer. Twitter/X reads
// `twitter:image` when present and falls back to `og:image` otherwise; this
// re-export guarantees parity without duplicating the 200+ line Satori JSX.
//
// Next.js 16 disallows re-exporting route-segment config fields (`revalidate`,
// `runtime`, etc.); they must be declared locally in each route file.
export { default, size, contentType, alt } from './opengraph-image';

export const revalidate = 3600;
