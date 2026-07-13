/** Web Crypto helpers shared by invite, session, claim, and webhook code. */

const encoder = new TextEncoder();

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
    return toHex(new Uint8Array(signature));
}

/**
 * Compare two attacker-influenced strings without leaking length or prefix
 * timing: HMAC both sides with an ephemeral random key first, then compare
 * the fixed-length digests.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
    const key = toHex(randomBytes(32));
    const [digestA, digestB] = await Promise.all([hmacSha256Hex(key, a), hmacSha256Hex(key, b)]);
    let diff = 0;
    for (let i = 0; i < digestA.length; i += 1) diff |= digestA.charCodeAt(i) ^ digestB.charCodeAt(i);
    return diff === 0;
}

export function randomToken(bytes = 32): string {
    return toBase64Url(randomBytes(bytes));
}

export async function sha256Base64Url(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
    return toBase64Url(new Uint8Array(digest));
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new TypeError('Invalid base64url value.');
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

/**
 * Deterministically derive a human-typable invite code from a purchase id.
 * Nothing plaintext is stored: the code is re-derived on claim and only its
 * HMAC lives in D1. Crockford-style alphabet avoids ambiguous characters and
 * satisfies the client's /^[A-Z0-9-]{4,64}$/ code shape.
 */
export async function derivePaidInviteCode(hmacKey: string, purchaseId: string): Promise<string> {
    const digest = await hmacSha256Hex(hmacKey, `paid-invite:${purchaseId}`);
    const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 16; i += 1) {
        code += alphabet[parseInt(digest.slice(i * 2, i * 2 + 2), 16) % alphabet.length];
        if (i % 4 === 3 && i < 15) code += '-';
    }
    return code;
}

export function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

export function toHex(bytes: Uint8Array): string {
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
