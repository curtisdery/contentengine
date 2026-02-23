"use strict";
/**
 * AES-256-GCM token encryption/decryption using Node.js crypto.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptToken = encryptToken;
exports.decryptToken = decryptToken;
const crypto_1 = require("crypto");
const env_js_1 = require("../config/env.js");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
function getKey() {
    const keyHex = env_js_1.TOKEN_ENCRYPTION_KEY.value();
    if (!keyHex)
        throw new Error("TOKEN_ENCRYPTION_KEY not configured");
    // Support both hex (64 chars) and base64 keys
    if (keyHex.length === 64)
        return Buffer.from(keyHex, "hex");
    return Buffer.from(keyHex, "base64").subarray(0, 32);
}
/** Encrypt a plaintext string. Returns "iv:ciphertext:tag" in hex. */
function encryptToken(plaintext) {
    const key = getKey();
    const iv = (0, crypto_1.randomBytes)(IV_LENGTH);
    const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}
/** Decrypt a token string in "iv:ciphertext:tag" hex format. */
function decryptToken(encryptedStr) {
    const key = getKey();
    const parts = encryptedStr.split(":");
    if (parts.length !== 3)
        throw new Error("Invalid encrypted token format");
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = Buffer.from(parts[1], "hex");
    const tag = Buffer.from(parts[2], "hex");
    const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
}
//# sourceMappingURL=encryption.js.map