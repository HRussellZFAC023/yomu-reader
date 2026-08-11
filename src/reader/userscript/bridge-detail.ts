export type UserscriptHttpRequestOptions = Parameters<UserscriptHttpRequest>[0];
export type BridgeRequestDetail = { id: string; options: UserscriptHttpRequestOptions };
export type BridgeResponseDetail = { id: string; kind: 'load' | 'error' | 'timeout'; response?: UserscriptHttpResponse; message?: string };

export function bridgeEventId(event: Event): string | undefined {
    return safeReadString(normalizedBridgeEventDetail(event), 'id');
}

export function bridgeRequestDetail(event: Event): BridgeRequestDetail | undefined {
    const detail = normalizedBridgeEventDetail(event);
    const id = bridgeEventId(event);
    const options = safeReadProperty(detail, 'options') as UserscriptHttpRequestOptions | undefined;
    return id && options ? { id, options } : undefined;
}

export function bridgeResponseEventDetail(event: Event): BridgeResponseDetail | undefined {
    const detail = normalizedBridgeEventDetail(event);
    const id = safeReadString(detail, 'id');
    const kind = safeReadString(detail, 'kind');
    if (!id || (kind !== 'load' && kind !== 'error' && kind !== 'timeout')) return undefined;
    return {
        id,
        kind,
        response: safeReadProperty(detail, 'response') as UserscriptHttpResponse | undefined,
        message: safeReadString(detail, 'message'),
    };
}

export function bridgeResponseDetail(
    id: string,
    kind: BridgeResponseDetail['kind'],
    response?: UserscriptHttpResponse,
    message?: string,
): BridgeResponseDetail {
    return {
        id,
        kind,
        response: response ? bridgeResponse(response) : undefined,
        message,
    };
}

export function bridgeRequestOptions(options: UserscriptHttpRequestOptions): UserscriptHttpRequestOptions {
    return {
        ...options,
        headers: options.headers ? { ...options.headers } : undefined,
        data: bridgeRequestBody(options.data),
    };
}

export function bridgeEventDetail<T>(detail: T | undefined): T | string | undefined {
    if (detail === undefined) return undefined;
    const json = bridgeEventJsonDetail(detail);
    return json ?? detail;
}

function bridgeResponse(response: UserscriptHttpResponse): UserscriptHttpResponse {
    return {
        status: safeReadNumber(response, 'status') ?? 0,
        response: bridgeBody(safeReadProperty(response, 'response')),
        responseText: safeReadString(response, 'responseText'),
        finalUrl: safeReadString(response, 'finalUrl'),
    };
}

function bridgeBody(value: unknown): unknown {
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (ArrayBuffer.isView(value)) {
        const bytes = value as ArrayBufferView;
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    if (value instanceof Blob) return value.slice(0, value.size, value.type);
    return value;
}

function bridgeRequestBody(value: UserscriptHttpRequestOptions['data']): UserscriptHttpRequestOptions['data'] {
    return bridgeBody(value) as UserscriptHttpRequestOptions['data'];
}

function bridgeEventJsonDetail(detail: unknown): string | undefined {
    let unsupported = false;
    try {
        const json = JSON.stringify(detail, (_key, value) => {
            if (isUnsupportedBridgeJsonValue(value)) {
                unsupported = true;
                return undefined;
            }
            return value;
        });
        return unsupported || typeof json !== 'string' ? undefined : json;
    } catch {
        return undefined;
    }
}

export function normalizedBridgeEventDetail(event: Event): unknown {
    const detail = safeEventDetail(event);
    if (typeof detail !== 'string') return detail;
    try {
        return JSON.parse(detail) as unknown;
    } catch {
        return detail;
    }
}

function isUnsupportedBridgeJsonValue(value: unknown): boolean {
    return isUnsupportedPrimitiveBridgeJsonValue(value)
        || isArrayBufferBridgeJsonValue(value)
        || isBlobBridgeJsonValue(value)
        || isFormDataBridgeJsonValue(value);
}

function isUnsupportedPrimitiveBridgeJsonValue(value: unknown): boolean {
    return typeof value === 'function' || typeof value === 'symbol';
}

function isArrayBufferBridgeJsonValue(value: unknown): boolean {
    if (typeof ArrayBuffer === 'undefined') return false;
    return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function isBlobBridgeJsonValue(value: unknown): boolean {
    return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isFormDataBridgeJsonValue(value: unknown): boolean {
    return typeof FormData !== 'undefined' && value instanceof FormData;
}

function safeEventDetail(event: Event): unknown {
    try {
        return (event as CustomEvent).detail;
    } catch {
        return undefined;
    }
}

function safeReadProperty(source: unknown, key: string): unknown {
    if (!source || (typeof source !== 'object' && typeof source !== 'function')) return undefined;
    try {
        return (source as Record<string, unknown>)[key];
    } catch {
        return undefined;
    }
}

function safeReadString(source: unknown, key: string): string | undefined {
    const value = safeReadProperty(source, key);
    return typeof value === 'string' ? value : undefined;
}

function safeReadNumber(source: unknown, key: string): number | undefined {
    const value = safeReadProperty(source, key);
    return typeof value === 'number' ? value : undefined;
}
