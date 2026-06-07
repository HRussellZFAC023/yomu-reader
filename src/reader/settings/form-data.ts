import type { ReaderColorSource } from '../app/types';

export interface SettingsFormReader {
    get: (key: string) => string;
    has: (key: string) => boolean;
    number: (key: string, fallback: number) => number;
    clamped: (key: string, min: number, max: number, fallback: number) => number;
    colorSource: (key: string, fallback: ReaderColorSource) => ReaderColorSource;
}

export function createSettingsFormReader(
    data: FormData,
    colorSource: SettingsFormReader['colorSource'],
): SettingsFormReader {
    const get = (key: string) => String(data.get(key) ?? '');
    const number = (key: string, fallback: number) => readNumber(get(key), fallback);
    return {
        get,
        has: key => data.has(key),
        number,
        clamped: (key, min, max, fallback) => Math.max(min, Math.min(max, number(key, fallback))),
        colorSource,
    };
}

function readNumber(value: string, fallback: number): number {
    if (!value.trim()) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
