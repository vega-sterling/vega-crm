// ============================================================================
// otplib v13 Compatibility Wrapper
// ============================================================================
// otplib v13 removed the `authenticator` export and made everything async
// with plugin-based architecture. This wrapper provides the same sync API
// that the old v12 `authenticator` export had, using Node.js built-in crypto.
// ============================================================================

import { createHmac, randomBytes as nodeRandomBytes } from "crypto";

// Base32 encoding/decoding (RFC 4648)
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Buffer | Uint8Array): string {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  let result = "";
  let bits = 0;
  let value = 0;
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      result += BASE32_CHARS[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    result += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
  }
  return result;
}

function base32Decode(str: string): Buffer {
  const cleanStr = str.replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (let i = 0; i < cleanStr.length; i++) {
    const idx = BASE32_CHARS.indexOf(cleanStr[i].toUpperCase());
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

// TOTP implementation (RFC 6238) using SHA-1, 30-second period, 6 digits
const PERIOD = 30;
const DIGITS = 6;
const EPOCH = 0;

function generateTOTP(secret: string, time: number = Date.now()): string {
  const counter = Math.floor((time / 1000 - EPOCH) / PERIOD);
  const secretBytes = base32Decode(secret);
  
  // Convert counter to 8-byte buffer (big-endian)
  const counterBuf = Buffer.alloc(8);
  // Handle counter as two 32-bit writes for safety
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  counterBuf.writeUInt32BE(high, 0);
  counterBuf.writeUInt32BE(low, 4);
  
  // HMAC-SHA1
  const hmac = createHmac("sha1", secretBytes);
  hmac.update(counterBuf);
  const digest = hmac.digest();
  
  // Dynamic truncation
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  
  const token = binary % Math.pow(10, DIGITS);
  return token.toString().padStart(DIGITS, "0");
}

// Window for verification (allows codes from adjacent time steps)
const WINDOW = 1;

/**
 * Compatibility wrapper matching otplib v12 `authenticator` API.
 */
export const authenticator = {
  /**
   * Generate a new base32-encoded TOTP secret (20 random bytes).
   */
  generateSecret(): string {
    const bytes = nodeRandomBytes(20);
    return base32Encode(bytes);
  },

  /**
   * Verify a TOTP token against a secret.
   * Checks current time step plus/minus the window.
   */
  verify({ token, secret }: { token: string; secret: string }): boolean {
    return this.check(token, secret);
  },

  /**
   * Check a TOTP code against a secret (same as verify, different arg order).
   */
  check(token: string, secret: string): boolean {
    if (!token || !secret) return false;
    const now = Date.now();
    for (let offset = -WINDOW; offset <= WINDOW; offset++) {
      const expectedToken = generateTOTP(secret, now + offset * PERIOD * 1000);
      if (token === expectedToken) return true;
    }
    return false;
  },

  /**
   * Generate an otpauth:// URI for QR code provisioning.
   */
  keyuri(email: string, issuer: string, secret: string): string {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedEmail = encodeURIComponent(email);
    const encodedSecret = encodeURIComponent(secret);
    return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${encodedSecret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
  },
};
