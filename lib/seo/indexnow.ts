/**
 * lib/seo/indexnow.ts — IndexNow client (T32).
 *
 * IndexNow is a shared push-notification protocol consumed by Bing,
 * Yandex, Naver, Seznam, and Yep. One POST tells all of them that a set
 * of URLs has changed; they then schedule a recrawl. Google does NOT
 * participate — Googlebot continues to be driven by sitemap.xml + HTTP
 * pings.
 *
 * Spec: https://www.indexnow.org/documentation
 *
 * Endpoint choice: api.indexnow.org is the vendor-neutral aggregator.
 * Picking bing.com/indexnow vs yandex.com/indexnow only changes WHICH
 * engine ingests first — they all share the submission via the protocol.
 *
 * Key file: served at https://karbonlens.com/indexnow/{KEY}.txt by
 * `app/indexnow/[key]/route.ts`. The `.txt` suffix is part of the URL
 * path and is required by the spec for verification. Static routes
 * (`app/llms.txt/route.ts`, `app/llms-full.txt/route.ts`) take precedence
 * over any dynamic segment — but to be extra-safe and avoid relying on
 * Next.js's handling of `.txt` literals inside `[param]` folder names,
 * the verification file lives under `/indexnow/` instead of at the
 * apex. `keyLocation` below reflects that.
 *
 * Failure mode: missing INDEXNOW_KEY → log once and return a non-throwing
 * sentinel. The nightly cron must remain idempotent before the key is
 * configured (T32 runbook ships INDEXNOW_KEY in a follow-up commit).
 *
 * Fire-and-forget: 10s timeout, no retries. If Bing is down we lose one
 * ping; the next nightly run re-submits the same URLs. URLs are
 * idempotent at the IndexNow side, so re-pinging is safe.
 */

const HOST = 'karbonlens.com';
const ENDPOINT = 'https://api.indexnow.org/IndexNow';
const MAX_URLS_PER_REQUEST = 10_000; // per IndexNow v1 spec
const TIMEOUT_MS = 10_000;

let warnedMissingKey = false;

export type IndexNowResult = { ok: boolean; status: number; count: number };

function keyLocation(key: string): string {
  return `https://${HOST}/indexnow/${key}.txt`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function postBatch(
  key: string,
  urlList: string[],
): Promise<{ ok: boolean; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        host: HOST,
        key,
        keyLocation: keyLocation(key),
        urlList,
      }),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch {
    // Network error or abort — treated as a non-fatal miss. Caller logs
    // via the returned `ok: false` sentinel.
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function pingIndexNow(urls: string[]): Promise<IndexNowResult> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    if (!warnedMissingKey) {
      // One-shot stderr warning; subsequent calls are silent. Keeps the
      // nightly cron log readable when the env var is intentionally unset
      // (e.g. preview environments).
      console.warn(
        '[indexnow] INDEXNOW_KEY is unset — skipping ping. Configure the env var to enable.',
      );
      warnedMissingKey = true;
    }
    return { ok: false, status: 0, count: 0 };
  }

  if (urls.length === 0) {
    return { ok: true, status: 200, count: 0 };
  }

  const batches = chunk(urls, MAX_URLS_PER_REQUEST);
  let allOk = true;
  let lastStatus = 0;
  for (const batch of batches) {
    const result = await postBatch(key, batch);
    lastStatus = result.status;
    if (!result.ok) allOk = false;
  }
  return { ok: allOk, status: lastStatus, count: urls.length };
}

/**
 * Returns the IndexNow key verification file response. The body must be
 * exactly the key — no trailing newline, no whitespace. Mounted by the
 * route at `app/indexnow/[key]/route.ts`.
 *
 * If the env var is unset we 404 — there's no key to verify against.
 * This matches the behaviour of `pingIndexNow`'s missing-key path:
 * everything is a no-op until the operator provisions the key.
 */
export async function indexNowKeyFileResponse(): Promise<Response> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    return new Response('Not Found', { status: 404 });
  }
  return new Response(key, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
