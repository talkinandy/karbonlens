/**
 * POST /api/telegram/webhook — Telegram approval callbacks.
 *
 * Handles inline Approve/Reject button presses on review-queue notifications.
 * Security (defence in depth):
 *   1. X-Telegram-Bot-Api-Secret-Token header must equal TELEGRAM_WEBHOOK_SECRET
 *      (set via setWebhook secret_token) — only Telegram knows it.
 *   2. callback_query.from.id must be in TELEGRAM_ALLOWED_IDS.
 * On a valid press it runs the shared approve/reject core and edits the message
 * to show the outcome (which also removes the buttons).
 */

import { NextResponse } from 'next/server';
import { approveJob, rejectJob } from '@/lib/seo/autopilot/review';
import { tgAnswerCallback, tgEditMessageText, tgSendMessage, escapeHtml } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAllowed(userId: unknown): boolean {
  const ids = (process.env.TELEGRAM_ALLOWED_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return ids.includes(String(userId));
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: Record<string, unknown>;
  try {
    update = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const cq = update.callback_query as
    | { id: string; data?: string; from?: { id?: number }; message?: { message_id: number; chat?: { id: number }; text?: string } }
    | undefined;

  if (cq) {
    if (!isAllowed(cq.from?.id)) {
      await tgAnswerCallback(cq.id, 'Not authorized.');
      return NextResponse.json({ ok: true });
    }
    const m = /^([ar]):(\d+)$/.exec(String(cq.data ?? ''));
    if (!m) {
      await tgAnswerCallback(cq.id, 'Unknown action.');
      return NextResponse.json({ ok: true });
    }
    const id = Number(m[2]);
    const res = m[1] === 'a' ? await approveJob(id) : await rejectJob(id);
    await tgAnswerCallback(cq.id, res.detail.slice(0, 190));

    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;
    if (chatId && messageId) {
      const tag = res.ok ? (m[1] === 'a' ? '✅ Approved' : '🚫 Rejected') : `⚠️ ${res.status}`;
      const orig = cq.message?.text ?? '';
      const by = cq.from?.id ? ` by ${cq.from.id}` : '';
      await tgEditMessageText(chatId, messageId, `${escapeHtml(orig)}\n\n— <b>${tag}</b>${by}: ${escapeHtml(res.detail)}`);
    }
    return NextResponse.json({ ok: true });
  }

  // /start → reply with ids (handy for setup/debugging).
  const msg = update.message as { text?: string; chat?: { id: number }; from?: { id?: number } } | undefined;
  if (msg?.text && /^\/start\b/.test(msg.text) && msg.chat?.id) {
    await tgSendMessage(
      msg.chat.id,
      `KarbonLens approvals bot is connected.\nYour chat id: <code>${msg.chat.id}</code>\nYour user id: <code>${msg.from?.id}</code>`,
    );
  }
  return NextResponse.json({ ok: true });
}
