import { config } from "../config.js";

// ─────────────────────────────────────────────────────────────
// Non-trade actions: webhook, telegram, email.
// ─────────────────────────────────────────────────────────────

export async function sendWebhook(url: string, payload: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Webhook failed: ${res.status}`);
}

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  if (!config.telegram.botToken) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const res = await fetch(
    `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  );
  if (!res.ok) throw new Error(`Telegram failed: ${res.status}`);
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  // TODO: wire an SMTP transport (nodemailer) using config.smtpUrl.
  console.log(`[email:stub] to=${to} subject="${subject}" body="${body}"`);
}
