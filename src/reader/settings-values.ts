export function hasOwn(value: unknown, key: PropertyKey): boolean {
    return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

export function objectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function trimmedText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

export function finiteNumber(value: unknown, fallback: number): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

export function booleanValue(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}
