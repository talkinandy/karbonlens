/**
 * lib/email/digest-template.tsx — T17 weekly-digest email template.
 *
 * v0.1 decision (per the Live-context brief): emit plain HTML + plain text
 * as strings rather than pulling in `react-email`. The reasons:
 *   1. The email content is static in shape and small (< 100 lines of HTML),
 *   2. Avoiding `@react-email/components` keeps the dependency tree lean and
 *      side-steps the React 19 compat issues that the package has had,
 *   3. Keeps preview generation (`scripts/digest-preview.ts`) a trivial
 *      Node script with no JSX renderer in the chain.
 *
 * The `.tsx` extension is retained per the deliverables list in the brief;
 * the file exports pure functions, no JSX — so the tsx compile path stays
 * neutral and there is no behavioural difference vs a `.ts` file. If a
 * future rev wants to migrate to React Email, swap this file's internals —
 * the `renderDigestEmail` signature can stay identical.
 *
 * Palette (see `docs/design/brief.md` via the Phase-3 handoff): dark green
 * `#1a3c2e`, off-white `#f5f4f0`, accent `#2d6a4f`.
 */

import type {
  DigestBundle,
  DigestNotificationItem,
  DigestProjectGroup,
} from '@/lib/queries/digest';

export type DigestTemplateProps = {
  bundle: DigestBundle;
  /** Public app URL for deep links, e.g. https://karbonlens.netlify.app */
  appUrl: string;
};

export type RenderedDigestEmail = {
  subject: string;
  html: string;
  text: string;
};

const COLOR_BG = '#f5f4f0';
const COLOR_CARD = '#ffffff';
const COLOR_TEXT = '#1a3c2e';
const COLOR_MUTED = '#5c6a65';
const COLOR_ACCENT = '#2d6a4f';
const COLOR_BORDER = '#e6e4dd';

function formatDate(iso: string): string {
  // Cheap UTC date formatter — "20 Apr 2026". Intentionally not locale-aware
  // so the output is stable in the test script regardless of host locale.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

function typeLabel(type: string): string {
  const m: Record<string, string> = {
    reversal: 'Deforestation',
    regulatory: 'Regulatory',
    price: 'Price',
    news: 'News',
    retirement: 'Retirement',
    issuance: 'Issuance',
  };
  return m[type] ?? type;
}

function typeColor(type: string): string {
  const m: Record<string, string> = {
    reversal: '#c03c3c',
    regulatory: '#2a6aa8',
    price: '#6a4ab0',
    news: '#6a6a6a',
    retirement: '#2d6a4f',
    issuance: '#b8791a',
  };
  return m[type] ?? '#5c6a65';
}

/** Render a single notification row as HTML. */
function renderItemHtml(
  item: DigestNotificationItem,
  appUrl: string,
): string {
  const href = item.url
    ? `${appUrl}${item.url.startsWith('/') ? item.url : '/' + item.url}`
    : `${appUrl}/alerts`;
  const typeBg = typeColor(item.type);
  const description = item.description
    ? `<div style="color:${COLOR_MUTED};font-size:13px;line-height:1.45;margin-top:4px;">${escapeHtml(truncate(item.description, 120))}</div>`
    : '';
  const projectLine = item.project_name
    ? `<div style="color:${COLOR_MUTED};font-size:12px;margin-top:4px;">${escapeHtml(item.project_name)}</div>`
    : '';
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid ${COLOR_BORDER};">
        <div>
          <span style="display:inline-block;padding:2px 8px;border-radius:3px;background:${typeBg};color:#fff;font-size:11px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;">${escapeHtml(typeLabel(item.type))}</span>
          <span style="color:${COLOR_MUTED};font-size:12px;margin-left:8px;">${escapeHtml(formatDate(item.created_at))}</span>
        </div>
        <a href="${escapeHtml(href)}" style="display:block;color:${COLOR_TEXT};font-size:15px;font-weight:600;line-height:1.4;margin-top:6px;text-decoration:none;">${escapeHtml(item.title)}</a>
        ${description}
        ${projectLine}
      </td>
    </tr>`;
}

/** Render a per-project group header. v0.1 keeps the groups visible in HTML
 * but the plain-text output flattens. */
function renderGroupsHtml(
  groups: DigestProjectGroup[],
  appUrl: string,
): string {
  // Show up to top 5 groups by count, with each group's top 2 items. The
  // flat top-10 list is rendered separately below this block; this gives a
  // quick "impacted projects" scan.
  const top = groups.slice(0, 5);
  if (top.length === 0) return '';
  const rows = top
    .map((g) => {
      const label = g.project_slug
        ? `<a href="${escapeHtml(`${appUrl}/projects/${g.project_slug}`)}" style="color:${COLOR_ACCENT};text-decoration:none;font-weight:600;">${escapeHtml(g.project_name)}</a>`
        : `<span style="color:${COLOR_TEXT};font-weight:600;">${escapeHtml(g.project_name)}</span>`;
      return `<tr><td style="padding:6px 0;color:${COLOR_MUTED};font-size:13px;">${label} <span style="color:${COLOR_MUTED};">— ${g.count} alert${g.count === 1 ? '' : 's'}</span></td></tr>`;
    })
    .join('');
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0 8px;">
      <tr><td style="color:${COLOR_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:0.06em;padding-bottom:4px;">Impacted projects</td></tr>
      ${rows}
    </table>`;
}

export function renderDigestEmail(
  props: DigestTemplateProps,
): RenderedDigestEmail {
  const { bundle, appUrl } = props;
  const { user, totalCount, projectCount, byType, items, groups, windowStart, windowEnd } = bundle;

  const greetingName = user.name?.split(' ')[0] || 'there';
  const subject = `Your KarbonLens digest — ${totalCount} alert${totalCount === 1 ? '' : 's'} this week`;

  // Summary line: "This week: N new alerts across M projects" (plus
  // regulatory/price/news counts if present).
  const summaryParts: string[] = [];
  summaryParts.push(`${totalCount} new alert${totalCount === 1 ? '' : 's'}`);
  if (projectCount > 0) {
    summaryParts.push(`across ${projectCount} project${projectCount === 1 ? '' : 's'}`);
  }
  const regulatoryCount = byType.regulatory ?? 0;
  if (regulatoryCount > 0) {
    summaryParts.push(`${regulatoryCount} regulatory update${regulatoryCount === 1 ? '' : 's'}`);
  }
  const summary = `This week: ${summaryParts.join(', ')}.`;

  const moreLine = totalCount > items.length
    ? `<tr><td style="padding:12px 0;color:${COLOR_MUTED};font-size:13px;"><a href="${escapeHtml(`${appUrl}/alerts`)}" style="color:${COLOR_ACCENT};text-decoration:none;">+${totalCount - items.length} more — view all in app →</a></td></tr>`
    : '';

  const itemRowsHtml = items.map((it) => renderItemHtml(it, appUrl)).join('');
  const groupsHtml = renderGroupsHtml(groups, appUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLOR_TEXT};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR_BG};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:${COLOR_CARD};border:1px solid ${COLOR_BORDER};border-radius:6px;">
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid ${COLOR_BORDER};">
              <div style="font-size:18px;font-weight:700;color:${COLOR_TEXT};letter-spacing:-0.01em;">KarbonLens weekly digest</div>
              <div style="font-size:12px;color:${COLOR_MUTED};margin-top:2px;">${escapeHtml(formatDate(windowStart))} – ${escapeHtml(formatDate(windowEnd))}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 8px;">
              <p style="margin:0 0 10px;font-size:15px;line-height:1.5;">Hi ${escapeHtml(greetingName)},</p>
              <p style="margin:0 0 4px;font-size:15px;line-height:1.5;">${escapeHtml(summary)}</p>
              ${groupsHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:4px 24px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${itemRowsHtml}
                ${moreLine}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 24px;">
              <a href="${escapeHtml(`${appUrl}/alerts`)}" style="display:inline-block;padding:10px 16px;background:${COLOR_ACCENT};color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">View all in app →</a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid ${COLOR_BORDER};color:${COLOR_MUTED};font-size:12px;line-height:1.5;">
              You're receiving this because email digests are enabled for ${escapeHtml(user.email)}. Manage preferences in your <a href="${escapeHtml(`${appUrl}/alerts`)}" style="color:${COLOR_ACCENT};">account</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain-text fallback. Keep line-length reasonable and mirror the HTML
  // sections so the email has parity in a text-only client.
  const textLines: string[] = [];
  textLines.push(`KarbonLens weekly digest — ${formatDate(windowStart)} to ${formatDate(windowEnd)}`);
  textLines.push('');
  textLines.push(`Hi ${greetingName},`);
  textLines.push('');
  textLines.push(summary);
  textLines.push('');
  if (groups.length > 0) {
    textLines.push('Impacted projects:');
    for (const g of groups.slice(0, 5)) {
      textLines.push(`  - ${g.project_name} — ${g.count} alert${g.count === 1 ? '' : 's'}`);
    }
    textLines.push('');
  }
  textLines.push('Latest alerts:');
  for (const it of items) {
    textLines.push(`  [${typeLabel(it.type).toUpperCase()}] ${it.title}`);
    if (it.description) {
      textLines.push(`    ${truncate(it.description, 120)}`);
    }
    if (it.project_name) {
      textLines.push(`    Project: ${it.project_name}`);
    }
    textLines.push(`    ${formatDate(it.created_at)}`);
    textLines.push('');
  }
  if (totalCount > items.length) {
    textLines.push(`+${totalCount - items.length} more — view all at ${appUrl}/alerts`);
    textLines.push('');
  }
  textLines.push(`View all in app: ${appUrl}/alerts`);
  textLines.push('');
  textLines.push(`You're receiving this because email digests are enabled for ${user.email}.`);
  const text = textLines.join('\n');

  return { subject, html, text };
}
