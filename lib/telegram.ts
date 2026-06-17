/**
 * lib/telegram.ts — thin Telegram Bot API helpers for review-queue approvals.
 *
 * Sends a contextual approval message (with inline Approve/Reject buttons) when
 * a job is parked for review; the webhook (app/api/telegram/webhook) handles the
 * button presses. All calls fail soft — a Telegram outage must never break a
 * publish or an approval.
 */

import 'server-only';

function token(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

export function isTelegramConfigured(): boolean {
  return typeof token() === 'string' && token()!.length > 0;
}

async function tg(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isTelegramConfigured()) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    return (await res.json()) as { ok: boolean; result?: unknown; error?: string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

export function tgSendMessage(chatId: string | number, text: string, replyMarkup?: InlineKeyboard) {
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function tgAnswerCallback(callbackQueryId: string, text?: string) {
  return tg('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
}

/** Edit a message's text and drop its inline keyboard (omitting reply_markup). */
export function tgEditMessageText(chatId: string | number, messageId: number, text: string) {
  return tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

const TYPE_LABEL: Record<string, string> = {
  editorial: 'Editorial',
  news_brief: 'Carbon News Brief',
  regulatory: 'Regulatory',
};

/** Strip the heaviest Markdown so an excerpt reads cleanly in a Telegram message. */
function mdToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')          // code fences
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')     // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links -> visible text
    .replace(/^#{1,6}\s*/gm, '')              // headings
    .replace(/\*\*/g, '')                     // bold markers
    .replace(/`/g, '')                        // inline code ticks
    .replace(/\n{3,}/g, '\n\n')               // collapse blank runs
    .trim();
}

/** Notify the configured admin chat that a job needs review, with action buttons.
 *  The content is shown INLINE — the post isn't published yet, so a link 404s. */
export async function notifyReviewQueued(job: {
  id: number;
  jobType: string;
  title: string;
  summary: string;
  body?: string | null;
}): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!isTelegramConfigured() || !chatId) return;
  const label = TYPE_LABEL[job.jobType] ?? job.jobType;
  const header = `📝 <b>Review needed — ${escapeHtml(label)}</b>\n\n<b>${escapeHtml(job.title)}</b>`;
  const footer = `\n\n<i>Job #${job.id} · approve to publish</i>`;

  // Editorial/report/brief carry bodyMd; for regulatory the summary IS the content.
  const hasBody = !!(job.body && job.body.trim());
  const lead = hasBody && job.summary ? `\n\n<i>${escapeHtml(job.summary.slice(0, 280))}</i>` : '';
  const content = hasBody ? mdToText(job.body as string) : (job.summary ?? '');

  // Telegram caps messages at 4096 chars — keep headroom and truncate cleanly.
  const budget = 3800 - header.length - lead.length - footer.length;
  let snippet = content;
  if (snippet.length > budget) {
    snippet = snippet.slice(0, Math.max(0, budget - 60)).trimEnd() + '\n\n… (truncated — full text on /admin/seo)';
  }

  const text = `${header}${lead}\n\n${escapeHtml(snippet)}${footer}`;
  const keyboard: InlineKeyboard = {
    inline_keyboard: [[
      { text: '✅ Approve & publish', callback_data: `a:${job.id}` },
      { text: '❌ Reject', callback_data: `r:${job.id}` },
    ]],
  };
  await tgSendMessage(chatId, text, keyboard);
}
