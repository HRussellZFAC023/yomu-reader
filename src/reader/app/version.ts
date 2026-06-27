export const CURRENT_YOMU_VERSION = typeof __YOMU_VERSION__ === 'string' && __YOMU_VERSION__.trim()
    ? __YOMU_VERSION__.trim()
    : 'dev';

export function latestYomuVersionFromVersionJson(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as { buildId?: unknown; appHash?: unknown };
    if (typeof record.buildId !== 'string') return null;
    return yomuVersionFromBuildId(record.buildId, typeof record.appHash === 'string' ? record.appHash : undefined);
}

export function yomuVersionFromBuildId(buildId: string, appHash?: string): string | null {
    const value = buildId.trim();
    const hash = appHash?.trim();
    if (hash && value.endsWith(`-${hash}`)) return normalizedVersion(value.slice(0, -hash.length - 1));
    const match = value.match(/^(.+)-[a-f0-9]{12}$/i);
    return normalizedVersion(match?.[1] ?? value);
}

export function compareYomuVersions(current: string, latest: string): -1 | 0 | 1 | null {
    const currentParts = semanticVersionParts(current);
    const latestParts = semanticVersionParts(latest);
    if (!currentParts || !latestParts) return null;
    for (let index = 0; index < currentParts.length; index++) {
        if (currentParts[index] < latestParts[index]) return -1;
        if (currentParts[index] > latestParts[index]) return 1;
    }
    return 0;
}

function normalizedVersion(value: string | undefined): string | null {
    const version = value?.trim() ?? '';
    return semanticVersionParts(version) ? version : null;
}

function semanticVersionParts(value: string): [number, number, number] | null {
    const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}
