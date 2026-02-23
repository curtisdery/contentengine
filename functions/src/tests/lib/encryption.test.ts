import { describe, it, expect } from "vitest";
import "../helpers/setup.js";
import { encryptToken, decryptToken } from "../../lib/encryption.js";

describe("encryptToken", () => {
  it("returns a string in 'iv:ciphertext:tag' format (3 parts separated by colons)", () => {
    const result = encryptToken("hello world");
    const parts = result.split(":");
    expect(parts).toHaveLength(3);

    // Each part should be a valid hex string (non-empty)
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
      expect(/^[0-9a-f]+$/.test(part)).toBe(true);
    }
  });

  it("produces a 12-byte (24 hex char) IV", () => {
    const result = encryptToken("test");
    const iv = result.split(":")[0];
    // 12 bytes = 24 hex characters
    expect(iv).toHaveLength(24);
  });

  it("produces a 16-byte (32 hex char) auth tag", () => {
    const result = encryptToken("test");
    const tag = result.split(":")[2];
    // 16 bytes = 32 hex characters
    expect(tag).toHaveLength(32);
  });

  it("produces different ciphertexts for different plaintexts", () => {
    const a = encryptToken("secret-A");
    const b = encryptToken("secret-B");
    expect(a).not.toBe(b);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encryptToken("same text");
    const b = encryptToken("same text");
    // Because each call uses a random IV, the results should differ
    expect(a).not.toBe(b);
  });
});

describe("decryptToken", () => {
  it("round-trips: decryptToken(encryptToken(text)) returns original text", () => {
    const plaintext = "my-oauth-access-token-12345";
    const encrypted = encryptToken(plaintext);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("throws on invalid format (not 3 colon-separated parts)", () => {
    expect(() => decryptToken("onlyonepart")).toThrow("Invalid encrypted token format");
    expect(() => decryptToken("two:parts")).toThrow("Invalid encrypted token format");
    expect(() => decryptToken("a:b:c:d")).toThrow("Invalid encrypted token format");
  });

  it("round-trips with special characters", () => {
    const special = "token/with+special=chars&more!@#$%^*()\nand\tnewlines \u00e9\u00e0\u00fc";
    const encrypted = encryptToken(special);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(special);
  });

  it("round-trips with empty string", () => {
    const encrypted = encryptToken("");
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe("");
  });

  it("round-trips with long tokens", () => {
    const longToken = "x".repeat(5000);
    const encrypted = encryptToken(longToken);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(longToken);
  });
});
