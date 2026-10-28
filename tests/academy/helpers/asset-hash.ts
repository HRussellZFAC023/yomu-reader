import { createHash } from 'node:crypto';

// Callers own filesystem reads; this helper hashes only the supplied bytes.
export function sha256Bytes(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}
