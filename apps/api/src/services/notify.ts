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

/** Simple HTML-escape a string for safe interpolation into HTML templates. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build a rich HTML email for a detected signal. */
export function formatSignalEmail(opts: {
  summary: string;
  monitorUrl: string;
  proofUrl?: string | null;
  chainCompletion?: { hedera: boolean; ipfs: boolean; arbitrum: boolean };
}): { subject: string; body: string } {
  const hederaStatus = opts.chainCompletion?.hedera ? '✅' : '⏳';
  const ipfsStatus = opts.chainCompletion?.ipfs ? '✅' : '⏳';
  const arbStatus = opts.chainCompletion?.arbitrum ? '✅' : '⏳';
  const escapedSummary = escapeHtml(opts.summary);
  const escapedUrl = escapeHtml(opts.monitorUrl);
  const proofLink = opts.proofUrl
    ? `<div style="text-align:center"><a href="${escapeHtml(opts.proofUrl)}" class="btn">View Proof</a></div>`
    : '';
  const escapedOrigin = escapeHtml(config.webOrigin);

  const body = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #0a0f1a 0%, #1a2332 100%); padding: 24px; text-align: center; }
    .header h1 { color: #06b6d4; margin: 0; font-size: 20px; font-weight: 700; }
    .header p { color: #94a3b8; margin: 4px 0 0; font-size: 13px; }
    .content { padding: 24px; }
    .summary { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; font-size: 14px; color: #1e293b; line-height: 1.6; }
    .chain-grid { display: flex; gap: 8px; margin-bottom: 20px; }
    .chain-item { flex: 1; text-align: center; padding: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; color: #64748b; }
    .chain-item .status { font-size: 18px; display: block; margin-bottom: 4px; }
    .footer { padding: 16px 24px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; }
    .footer a { color: #06b6d4; text-decoration: none; }
    .btn { display: inline-block; padding: 10px 24px; background: #06b6d4; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔔 Signal Detected</h1>
      <p>${escapedUrl}</p>
    </div>
    <div class="content">
      <div class="summary">${escapedSummary}</div>
      <div class="chain-grid">
        <div class="chain-item"><span class="status">${hederaStatus}</span>Hedera HCS</div>
        <div class="chain-item"><span class="status">${ipfsStatus}</span>IPFS</div>
        <div class="chain-item"><span class="status">${arbStatus}</span>Arbitrum</div>
      </div>
      ${proofLink}
    </div>
    <div class="footer">
      <p>Sent by <a href="${escapedOrigin}">LENITNES</a> — Proof-chained web monitoring</p>
    </div>
  </div>
</body>
</html>`;

  // Truncate summary to 70 chars for subject (leaves room for prefix)
  const truncated = opts.summary.length > 70 ? opts.summary.slice(0, 70) + '…' : opts.summary;
  return {
    subject: `🔔 LENITNES Signal — ${truncated}`,
    body,
  };
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
