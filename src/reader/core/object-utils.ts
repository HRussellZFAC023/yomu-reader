// Strict record guard: a non-null object that is NOT an array. Use when array
// inputs must be rejected (e.g. treating the value as a keyed map).
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Loose object guard: any non-null object, arrays included. Preserves the
// historical behaviour of call sites that only distinguished object-vs-primitive.
export function isNonNullObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
