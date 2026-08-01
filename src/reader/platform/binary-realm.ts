/**
 * Copy binary values returned by Firefox Web APIs into the userscript realm.
 *
 * Firefox 153 and older can expose BufferSource values from MV2 `userScripts`
 * sandboxes through Xray wrappers (Bugzilla 2054083). Reading those wrappers in
 * JavaScript -- even `byteLength` or `Uint8Array#set` -- throws. Web APIs can
 * introduce a fresh wrapper at every async boundary, so callers normalize each
 * returned ArrayBuffer/view instead of assuming an earlier Blob copy was enough.
 */

function firefoxXrayWaiver<T>(value: T): T {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return value;
    try {
        const wrapped = (value as { wrappedJSObject?: unknown }).wrappedJSObject;
        return wrapped !== undefined && wrapped !== null ? wrapped as T : value;
    } catch {
        return value;
    }
}

export function localBytesFromArrayBuffer(value: ArrayBuffer): Uint8Array<ArrayBuffer> {
    return localBytesFromBufferSource(value);
}

export function localBytesFromView(value: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
    return localBytesFromBufferSource(value);
}

export function localBytesFromBufferSource(
    value: ArrayBuffer | Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> {
    if (firefoxXrayWaiver(value) === value) {
        const local = safelyOwnBufferSource(value);
        if (local) return local;
    }
    return cloneForeignBufferSource(value);
}

export async function localBytesFromBlob(value: Blob): Promise<Uint8Array<ArrayBuffer>> {
    if (typeof value.arrayBuffer === 'function') {
        return localBytesFromArrayBuffer(await value.arrayBuffer());
    }
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('Could not read binary data.'));
        reader.readAsArrayBuffer(value);
    });
    return localBytesFromArrayBuffer(buffer);
}

function safelyOwnBufferSource(value: ArrayBuffer | Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> | undefined {
    try {
        if (ArrayBuffer.isView(value)) {
            const view = value as Uint8Array<ArrayBufferLike>;
            const backing = view.buffer;
            const length = view.byteLength;
            if (view instanceof Uint8Array && backing instanceof ArrayBuffer) return view as Uint8Array<ArrayBuffer>;
            const bytes = new Uint8Array(length);
            bytes.set(view);
            return bytes;
        }
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        // A normal foreign-realm ArrayBuffer is safe to copy; an affected
        // Firefox Xray throws from the constructor or the subsequent indexed
        // read and falls through to the engine's structured clone below.
        const source = new Uint8Array(value);
        const bytes = new Uint8Array(source.byteLength);
        bytes.set(source);
        return bytes;
    } catch {
        return undefined;
    }
}

function cloneForeignBufferSource(value: ArrayBuffer | Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
    const clone = globalThis.structuredClone;
    if (typeof clone === 'function') {
        const waived = firefoxXrayWaiver(value);
        for (const candidate of waived === value ? [value] : [value, waived]) {
            try {
                const copied = clone(candidate);
                if (isArrayBufferValue(copied) || ArrayBuffer.isView(copied)) {
                    const bytes = copyClonedBufferSource(copied as ArrayBuffer | Uint8Array<ArrayBufferLike>);
                    if (bytes) return bytes;
                }
            } catch {
                // Firefox's direct Xray clone and the explicitly waived source
                // differ across manager versions; try the other source below.
            }
        }
    }
    // Keeping the waived object would leave executable/page-modifiable state in
    // the import path, while Uint8Array.from/set would hit the same indexed Xray
    // reads. Fail closed and preserve the original diagnostic for support logs.
    throw new Error('This browser could not copy a cross-realm dictionary BufferSource. Update Firefox or import the ZIP with the extension.');
}

function isArrayBufferValue(value: unknown): value is ArrayBuffer {
    try {
        return value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object ArrayBuffer]';
    } catch {
        return false;
    }
}

function copyClonedBufferSource(
    value: ArrayBuffer | Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> | undefined {
    try {
        const source = ArrayBuffer.isView(value) ? value : new Uint8Array(value);
        const bytes = new Uint8Array(source.byteLength);
        bytes.set(source as Uint8Array<ArrayBufferLike>);
        return bytes;
    } catch {
        return undefined;
    }
}
