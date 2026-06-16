/**
 * lib/seo/gsc-client.ts — Google Search Console API client (SEO dashboard).
 *
 * Dependency-free service-account auth: signs a JWT with Node's built-in
 * crypto (RS256), exchanges it for an OAuth access token, and calls the
 * Search Console v3 REST API. No googleapis / google-auth-library — a
 * self-hosted app should not pull a heavy transitive dependency tree for
 * what is ~40 lines of standard JWT-bearer flow.
 *
 * Credentials arrive as a base64-encoded service-account JSON in
 * `GSC_SERVICE_ACCOUNT_JSON_BASE64`. The service account must be added as
 * a user (Full or Restricted) on the GSC property identified by
 * `GSC_SITE_URL` — including the trailing slash for URL-prefix properties.
 */

import { createSign } from 'node:crypto';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

type ServiceAccountCreds = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function parseServiceAccount(b64: string): ServiceAccountCreds {
  const json = Buffer.from(b64, 'base64').toString('utf8');
  const creds = JSON.parse(json) as ServiceAccountCreds;
  if (!creds.client_email || !creds.private_key) {
    throw new Error('Service-account JSON missing client_email or private_key');
  }
  return creds;
}

/**
 * Sign a JWT-bearer assertion and exchange it for an OAuth access token.
 * Tokens are valid for ~1h; callers run once per cron invocation so we do
 * not cache.
 */
export async function getGscAccessToken(creds: ServiceAccountCreds): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: creds.client_email,
      scope: SCOPE,
      aud: creds.token_uri ?? TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(creds.private_key, 'base64url');
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(creds.token_uri ?? TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GSC token exchange failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('GSC token exchange returned no access_token');
  }
  return data.access_token;
}

export type SearchAnalyticsRow = {
  keys: string[]; // ordered to match the requested dimensions
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/**
 * POST searchAnalytics/query. `siteUrl` is the raw property URL (with
 * trailing slash for URL-prefix); it is URL-encoded into the path here.
 */
export async function gscSearchAnalytics(
  token: string,
  siteUrl: string,
  body: {
    startDate: string;
    endDate: string;
    dimensions: string[];
    rowLimit?: number;
    startRow?: number;
  },
): Promise<SearchAnalyticsRow[]> {
  const url = `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rowLimit: 1000, ...body }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GSC searchAnalytics failed: HTTP ${res.status} — ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as { rows?: SearchAnalyticsRow[] };
  return data.rows ?? [];
}

export type SitemapContent = { type: string; submitted: string; indexed: string };
export type SitemapEntry = {
  path: string;
  lastSubmitted?: string;
  isPending?: boolean;
  warnings?: string;
  errors?: string;
  contents?: SitemapContent[];
};

/** GET sitemaps — used for the "submitted URL count" side of the indexation tile. */
export async function gscListSitemaps(token: string, siteUrl: string): Promise<SitemapEntry[]> {
  const url = `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GSC sitemaps list failed: HTTP ${res.status} — ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as { sitemap?: SitemapEntry[] };
  return data.sitemap ?? [];
}
