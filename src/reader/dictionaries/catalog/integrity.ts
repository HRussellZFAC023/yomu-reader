const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CONTENT_ADDRESSED_KEY_PATTERN = /^objects\/sha256\/([a-f0-9]{64})\.zip$/;

export function isSha256Hex(value: string): boolean {
    return SHA256_PATTERN.test(value);
}

export function dictionaryObjectKey(sha256: string): string {
    if (!isSha256Hex(sha256)) throw new Error('Dictionary SHA-256 must be 64 lowercase hexadecimal characters.');
    return `objects/sha256/${sha256}.zip`;
}

export function sha256FromDictionaryObjectKey(key: string): string | null {
    return CONTENT_ADDRESSED_KEY_PATTERN.exec(key)?.[1] ?? null;
}

export function dictionaryObjectKeyMatchesHash(key: string, sha256: string): boolean {
    return sha256FromDictionaryObjectKey(key) === sha256;
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | Blob): Promise<string> {
    const source = data instanceof Blob
        ? new Uint8Array(await blobArrayBuffer(data))
        : data instanceof Uint8Array
            ? data
            : new Uint8Array(data);
    // Copy into an ArrayBuffer-backed view. Uint8Array inputs can legally use a
    // SharedArrayBuffer, which Web Crypto's BufferSource type rejects.
    const bytes = new Uint8Array(source.byteLength);
    bytes.set(source);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function blobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('Could not read dictionary download.'));
        reader.readAsArrayBuffer(blob);
    });
}

export async function verifyDictionaryObject(data: ArrayBuffer | Uint8Array | Blob, expectedSha256: string): Promise<boolean> {
    if (!isSha256Hex(expectedSha256)) return false;
    return await sha256Hex(data) === expectedSha256;
}

export async function assertDictionaryObjectIntegrity(
    data: ArrayBuffer | Uint8Array | Blob,
    expected: { sha256: string; bytes: number },
): Promise<void> {
    const actualBytes = data instanceof Blob
        ? data.size
        : data instanceof Uint8Array
            ? data.byteLength
            : data.byteLength;
    if (!Number.isSafeInteger(expected.bytes) || expected.bytes <= 0) {
        throw new Error('Dictionary catalogue contains an invalid byte length.');
    }
    if (actualBytes !== expected.bytes) {
        throw new Error(`Dictionary download size mismatch (expected ${expected.bytes} bytes, received ${actualBytes}).`);
    }
    if (!await verifyDictionaryObject(data, expected.sha256)) {
        throw new Error('Dictionary download SHA-256 mismatch.');
    }
}
