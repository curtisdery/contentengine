/**
 * AES-256-GCM token encryption/decryption using Node.js crypto.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { TOKEN_ENCRYPTION_KEY } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const keyHex = TOKEN_ENCRYPTION_KEY.value();
  if (!keyHex) throw new Error("TOKEN_ENCRYPTION_KEY not configured");
  // Support both hex (64 chars) and base64 keys
  if (keyHex.length === 64) return Buffer.from(keyHex, "hex");
  return Buffer.from(keyHex, "base64").subarray(0, 32);
}

/** Encrypt a plaintext string. Returns "iv:ciphertext:tag" in hex. */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

/** Decrypt a token string in "iv:ciphertext:tag" hex format. */
export function decryptToken(encryptedStr: string): string {
  const key = getKey();
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format");

  const iv = Buffer.from(parts[0], "hex");
  const encrypted = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
