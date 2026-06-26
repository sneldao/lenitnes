import { config } from '../config.js';
import { logger } from '../logger.js';

// ─────────────────────────────────────────────────────────────
// Non-trade actions: webhook, telegram, email.
// ─────────────────────────────────────────────────────────────

/** Result from a webhook delivery attempt. */
export interface WebhookDeliveryResult {
  statusCode: number | null;
  durationMs: number;
  error: string | null;
}

export async function sendWebhook(url: string, payload: unknown): Promise<WebhookDeliveryResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const durationMs = Date.now() - start;
    if (!res.ok) {
      return { statusCode: res.status, durationMs, error: `Webhook failed: ${res.status}` };
    }
    return { statusCode: res.status, durationMs, error: null };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      statusCode: null,
      durationMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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

/**
 * Format any agent verdict for Telegram. Every scored signal is broadcast
 * — high-conviction gets the full trade broadcast, low-conviction gets a
 * concise "agent is thinking" message. This keeps the channel alive even
 * when no trade is warranted.
 */
export function formatSubThresholdMessage(input: {
  summary: string;
  monitorUrl: string;
  agentScore: {
    conviction: number;
    thesis: string;
    recommended_action: 'long' | 'short' | 'none';
    confidence_band: 'low' | 'mid' | 'high';
  };
}): string {
  const c = input.agentScore.conviction;
  const actionLabel = input.agentScore.recommended_action.toUpperCase();
  const bandLabel = input.agentScore.confidence_band.toUpperCase();

  const walletLine = `💼 Treasury: https://testnet.bscscan.com/address/${BSC_TREASURY_WALLET}`;

  if (c <= 30) {
    return (
      `👀 LENITNES watch — noise (${c}/100)\n` +
      `📡 ${input.monitorUrl}\n` +
      `💭 ${input.agentScore.thesis}\n` +
      `📝 ${input.summary.slice(0, 200)}\n` +
      `${walletLine}`
    );
  }

  if (c <= 50) {
    return (
      `👀 LENITNES watch — mild (${c}/100, ${bandLabel}) → ${actionLabel}\n` +
      `💭 ${input.agentScore.thesis}\n` +
      `📡 ${input.monitorUrl}\n` +
      `📝 ${input.summary.slice(0, 200)}\n` +
      `${walletLine}`
    );
  }

  return (
    `👀 LENITNES watch — interesting (${c}/100, ${bandLabel}) → ${actionLabel}\n` +
    `💭 ${input.agentScore.thesis}\n` +
    `📡 ${input.monitorUrl}\n` +
    `📝 ${input.summary.slice(0, 200)}\n` +
    `${walletLine}\n` +
    `Threshold: 70 — no trade. Full archive: https://lenitnes.persidian.com/signals`
  );
}

/**
 * Broadcast a sub-threshold signal to Telegram. Best-effort.
 * Returns the message text or null if skipped.
 */
export async function broadcastSubThreshold(input: {
  summary: string;
  monitorUrl: string;
  agentScore: {
    conviction: number;
    thesis: string;
    recommended_action: 'long' | 'short' | 'none';
    confidence_band: 'low' | 'mid' | 'high';
  };
}): Promise<string | null> {
  if (!config.telegram.botToken || !config.telegram.publicChannelId) return null;
  const message = formatSubThresholdMessage(input);
  try {
    await sendTelegram(config.telegram.publicChannelId, message);
    logger.info(
      { conviction: input.agentScore.conviction },
      'sub-threshold signal broadcast to telegram',
    );
    return message;
  } catch (err) {
    logger.error({ err }, 'sub-threshold telegram broadcast failed');
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Day 6: broadcast the agent's verdict to the public Telegram
// channel. Single channel (publicChannelId); paid/private channels
// are a future config addition. Only above-threshold signals post.
// ─────────────────────────────────────────────────────────────

/** Explorer URL for a chain tx hash, or null if paper / unsupported. */
function explorerUrlFor(chain: string, txHash: string): string | null {
  // Paper trades have a 0xpap prefix — never on a real chain.
  if (txHash.startsWith('0xpap')) return null;
  switch (chain) {
    case 'hedera':
      return `https://hashscan.io/testnet/transaction/${encodeURIComponent(txHash)}`;
    case 'arbitrum':
      return `https://sepolia.arbiscan.io/tx/${txHash}`;
    case 'robinhood':
      return `https://explorer.testnet.chain.robinhood.com/tx/${txHash}`;
    case 'bsc':
    case 'bnb':
      return `https://testnet.bscscan.com/tx/${txHash}`;
    default:
      return null;
  }
}

/** BSC testnet treasury wallet (public, verifiable on BSC Scan). */
const BSC_TREASURY_WALLET = '0x4dA649DeB07159E791C423bb139e6213e745D138';
const BSC_TWAK_WALLET = '0xa5Fa663FB2C989635236F416edCE3308E16a402E';

function walletUrl(address: string): string {
  return `https://testnet.bscscan.com/address/${address}`;
}

export interface BroadcastSignalInput {
  signalId: string;
  summary: string;
  monitorUrl: string;
  detectedAt: string;
  agentScore: {
    conviction: number;
    thesis: string;
    recommended_action: 'long' | 'short' | 'none';
    confidence_band: 'low' | 'mid' | 'high';
  };
  tradeReceipt: {
    chain: string;
    txHash: string;
    pair: string;
    mode: 'paper' | 'live';
  } | null;
  proofs: {
    ipfsCid?: string | null;
    hederaTxId?: string | null;
    arbitrumTxHash?: string | null;
  };
  outcomeWindows: { t1h: string; t1d: string; t7d: string };
}

/**
 * Format the public broadcast. Plain text (Telegram auto-links URLs).
 * Sections, in order:
 *   - header + thesis
 *   - conviction + action
 *   - trade (pair, chain, tx, mode)
 *   - proofs (Hedera HCS, IPFS, Arbitrum)
 *   - outcome windows (T+1h, T+1d, T+7d)
 */
export function formatSignalBroadcastMessage(input: BroadcastSignalInput): string {
  const lines: string[] = [];
  const assetLabel = input.tradeReceipt?.pair ?? 'WATCHLIST';
  lines.push(`🚨 LENITNES signal — ${assetLabel}`);
  lines.push('');

  // Proof anchor — lead with the immutable timestamp
  if (input.proofs.hederaTxId) {
    lines.push(
      `🔗 Hedera HCS: ${input.proofs.hederaTxId} → https://hashscan.io/testnet/transaction/${encodeURIComponent(input.proofs.hederaTxId)}`,
    );
  } else {
    lines.push(`⏳ Hedera HCS: pending`);
  }
  if (input.proofs.ipfsCid) {
    lines.push(
      `📦 IPFS: ${input.proofs.ipfsCid} → https://grove.lens.xyz/ipfs/${input.proofs.ipfsCid}`,
    );
  } else {
    lines.push(`⏳ IPFS: pending`);
  }
  if (input.proofs.arbitrumTxHash) {
    const url = explorerUrlFor('arbitrum', input.proofs.arbitrumTxHash);
    if (url) {
      lines.push(`📋 Arbitrum: ${input.proofs.arbitrumTxHash} → ${url}`);
    }
  }
  lines.push('');

  // Conviction + action
  const actionLabel = input.agentScore.recommended_action.toUpperCase();
  lines.push(
    `🎯 Conviction ${input.agentScore.conviction}/100 (${input.agentScore.confidence_band}) → ${actionLabel}`,
  );
  lines.push(`💭 ${input.agentScore.thesis}`);
  lines.push('');

  // Trade
  if (input.tradeReceipt) {
    const t = input.tradeReceipt;
    lines.push(`🔗 Trade`);
    lines.push(`  Pair: ${t.pair}`);
    lines.push(`  Chain: ${t.chain}`);
    const url = explorerUrlFor(t.chain, t.txHash);
    if (url) {
      lines.push(`  Tx: ${t.txHash} → ${url}`);
    } else {
      lines.push(`  Tx: ${t.txHash} (paper)`);
    }
    lines.push(`  Mode: ${t.mode}`);
    lines.push('');
  }

  // Outcome windows
  lines.push(`📊 Performance`);
  lines.push(
    `  T+1h: ${input.outcomeWindows.t1h} · T+1d: ${input.outcomeWindows.t1d} · T+7d: ${input.outcomeWindows.t7d}`,
  );
  lines.push('');

  // Wallets (public, verifiable on BSC Scan)
  lines.push(`💼 Wallets`);
  lines.push(`  Treasury: ${BSC_TREASURY_WALLET} → ${walletUrl(BSC_TREASURY_WALLET)}`);
  lines.push(`  Agent: ${BSC_TWAK_WALLET} → ${walletUrl(BSC_TWAK_WALLET)}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Build the outcome window timestamps for a signal. T+1h, T+1d, T+7d
 * from the signal's detected_at. The cron job (Day 5/7) records the
 * actual price at each window.
 */
export function buildOutcomeWindows(detectedAt: string): { t1h: string; t1d: string; t7d: string } {
  const base = new Date(detectedAt);
  if (Number.isNaN(base.getTime())) {
    const now = new Date();
    return {
      t1h: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      t1d: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      t7d: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  return {
    t1h: new Date(base.getTime() + 60 * 60 * 1000).toISOString(),
    t1d: new Date(base.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    t7d: new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Broadcast an above-threshold signal to the public Telegram channel.
 * Best-effort: logs failures but does not throw. Returns the message
 * body that was sent (or null if Telegram isn't configured).
 *
 * Sub-threshold / no-detectors signals are NOT broadcast — the
 * public surface is reserved for verified trades. The reasoning
 * archive (agent_scores) is the surface for sub-threshold reasoning.
 */
export async function broadcastSignal(input: BroadcastSignalInput): Promise<string | null> {
  if (!config.telegram.botToken || !config.telegram.publicChannelId) {
    logger.warn(
      { signalId: input.signalId },
      'telegram not configured — broadcast skipped (no bot token or public channel id)',
    );
    return null;
  }

  const message = formatSignalBroadcastMessage(input);
  try {
    await sendTelegram(config.telegram.publicChannelId, message);
    logger.info(
      { signalId: input.signalId, channelId: config.telegram.publicChannelId },
      'signal broadcast to telegram',
    );
    return message;
  } catch (err) {
    logger.error(
      { err, signalId: input.signalId },
      'telegram broadcast failed — signal still public, retry on next signal',
    );
    return null;
  }
}
