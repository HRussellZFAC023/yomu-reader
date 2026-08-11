/** Opaque, synchronous cache partition for secrets and private endpoints. */
export function sensitiveFingerprint(value: string): string {
    const secret = value.trim();
    if (!secret) return '';
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < secret.length; index += 1) {
        const code = secret.charCodeAt(index);
        first = Math.imul(first ^ code, 0x01000193) >>> 0;
        second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
    }
    return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}:${secret.length}`;
}
