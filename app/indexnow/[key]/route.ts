/**
 * GET /indexnow/{KEY}.txt — IndexNow ownership verification (T32).
 *
 * The IndexNow protocol requires a key verification file at a stable URL
 * whose body is the key itself. The file location is sent as
 * `keyLocation` in every IndexNow POST (see `lib/seo/indexnow.ts`).
 *
 * Routing choice: this lives under `/indexnow/` rather than at the apex
 * (`/{KEY}.txt`) for two reasons:
 *   1. Avoids any collision with the static `/llms.txt` and
 *      `/llms-full.txt` routes. Next.js does prioritise static segments
 *      over dynamic ones, but the `.txt` literal-suffix-on-a-param
 *      pattern (`app/[key].txt/route.ts`) is poorly documented in
 *      Next.js 16 and risked surprising future contributors.
 *   2. Keeps the apex namespace clean — only well-known files
 *      (sitemap.xml, robots.txt, llms.txt, favicon.ico) live there.
 *
 * The `[key]` segment captures the full filename including the `.txt`
 * suffix — e.g. for `/indexnow/abcd1234.txt`, params.key === 'abcd1234.txt'.
 * We compare against `${INDEXNOW_KEY}.txt` so the suffix is required.
 *
 * If the env var is unset, every request 404s. That's intentional —
 * before the key is provisioned, there's no valid file to serve.
 */

import { indexNowKeyFileResponse } from '@/lib/seo/indexnow';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await params;
  const expected = process.env.INDEXNOW_KEY;
  if (!expected || key !== `${expected}.txt`) {
    return new Response('Not Found', { status: 404 });
  }
  return indexNowKeyFileResponse();
}
