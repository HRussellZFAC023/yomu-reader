const LENS_PLATFORM_WEB = 3;
const LENS_SURFACE_CHROMIUM = 4;
const LENS_AUTO_FILTER = 7;

export function createGoogleLensRequest(imageBytes: Uint8Array, width: number, height: number, locale: string): Uint8Array {
    const [language = 'ja', region = 'US'] = (locale || 'ja-JP').split(/[-_]/);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const requestId = protoMessage(
        protoVarintField(1, BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000))),
        protoVarintField(2, 1),
        protoVarintField(3, 1),
        protoBytesField(4, randomBytes(16)),
    );
    const localeContext = protoMessage(
        protoStringField(1, language || 'ja'),
        protoStringField(2, region || 'US'),
        protoStringField(3, timeZone),
    );
    const clientFilters = protoMessage(protoMessageField(1, protoMessage(protoVarintField(1, LENS_AUTO_FILTER))));
    const clientContext = protoMessage(
        protoVarintField(1, LENS_PLATFORM_WEB),
        protoVarintField(2, LENS_SURFACE_CHROMIUM),
        protoMessageField(4, localeContext),
        protoMessageField(17, clientFilters),
    );
    const requestContext = protoMessage(
        protoMessageField(3, requestId),
        protoMessageField(4, clientContext),
    );
    const imageData = protoMessage(
        protoMessageField(1, protoMessage(protoBytesField(1, imageBytes))),
        protoMessageField(3, protoMessage(protoVarintField(1, width), protoVarintField(2, height))),
    );
    return protoMessage(protoMessageField(1, protoMessage(
        protoMessageField(1, requestContext),
        protoMessageField(3, imageData),
    )));
}

function protoMessage(...parts: Uint8Array[]): Uint8Array {
    return concatBytes(parts);
}

function protoMessageField(field: number, value: Uint8Array): Uint8Array {
    return concatBytes([protoTag(field, 2), encodeVarint(value.length), value]);
}

function protoBytesField(field: number, value: Uint8Array): Uint8Array {
    return protoMessageField(field, value);
}

function protoStringField(field: number, value: string): Uint8Array {
    return protoBytesField(field, new TextEncoder().encode(value));
}

function protoVarintField(field: number, value: number | bigint): Uint8Array {
    return concatBytes([protoTag(field, 0), encodeVarint(value)]);
}

function protoTag(field: number, wire: number): Uint8Array {
    return encodeVarint((field << 3) | wire);
}

function encodeVarint(value: number | bigint): Uint8Array {
    let item = BigInt(value);
    const bytes: number[] = [];
    do {
        let byte = Number(item & 0x7fn);
        item >>= 7n;
        if (item) byte |= 0x80;
        bytes.push(byte);
    } while (item);
    return new Uint8Array(bytes);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}

function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}
