import { config } from '../config.js';
import { logger } from '../logger.js';

// ─────────────────────────────────────────────────────────────
// Non-trade actions: webhook, telegram, email.
// ─────────────────────────────────────────────────────────────

export async function sendWebhook(url: string, payload: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Webhook failed: ${res.status}`);
}

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  if (!config.telegram.botToken) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) throw new Error(`Telegram failed: ${res.status}`);
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  if (!config.smtpUrl) {
    logger.warn({ to, subject }, 'email not sent: SMTP_URL not configured');
    return;
  }
  const res = await fetch(config.smtpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, body }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Email API failed: ${res.status}`);
}

/** Build a consistent, actionable Telegram / alert message for a detected signal. */
export function formatSignalMessage(opts: {
  summary: string;
  monitorUrl: string;
  pair?: string | null;
  proofUrl?: string | null;
}): string {
  const lines = [`🔔 Signal detected`, '', opts.summary, '', `Source: ${opts.monitorUrl}`];
  if (opts.pair) {
    lines.push(`Trade pair: ${opts.pair}`);
  }
  if (opts.proofUrl) {
    lines.push(`Proof: ${opts.proofUrl}`);
  }
  return lines.join('\n');
}
