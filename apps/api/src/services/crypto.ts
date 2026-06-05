import crypto from "node:crypto";
import { config } from "../config.js";

// AES-256-GCM encryption for at-rest secrets (Kraken API keys).
// For production, prefer a managed secrets store (Doppler / Infisical).

const ALGO = "aes-256-gcm";

function key(): Buffer {
  // Derive a stable 32-byte key from the configured secret.
  return crypto.createHash("sha256").update(config.encryptionKey).digest();
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
