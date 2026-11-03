/** Wire IDs may be numbers or decimal integer strings, never coercible nulls/booleans. */
function providerInteger(value: unknown, minimum: number): number {
    const numeric = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
    if (typeof numeric !== 'number' || !Number.isSafeInteger(numeric) || numeric < minimum) throw new Error('Invalid provider word identity');
    return numeric;
}

export function providerWordId(value: unknown): number {
    return providerInteger(value, 1);
}

export function providerReadingIndex(value: unknown): number {
    return providerInteger(value, 0);
}
