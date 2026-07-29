type NodeBufferConstructor = {
    from(value: Uint8Array): Uint8Array;
};

/**
 * Copy bytes into the realm that owns WebCrypto. Browsers use the ordinary
 * ArrayBuffer path; Node accepts its own Buffer when tests supply bytes from a
 * jsdom realm.
 */
export function webCryptoBuffer(value: ArrayBuffer | ArrayBufferView): BufferSource {
    const bytes = ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : new Uint8Array(value);
    const nodeBuffer = (globalThis as typeof globalThis & { Buffer?: NodeBufferConstructor }).Buffer;
    if (nodeBuffer) return nodeBuffer.from(bytes) as Uint8Array<ArrayBuffer>;
    return bytes.slice().buffer as ArrayBuffer;
}

export async function sha256Hex(value: ArrayBuffer | ArrayBufferView): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', webCryptoBuffer(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
