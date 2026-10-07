import type { YomuGamingSelectionRect } from './ipc';

export function pointInLayerRegions(x: number, y: number, regions: readonly YomuGamingSelectionRect[]): boolean {
    return regions.some(rect => x >= rect.left && x < rect.left + rect.width
        && y >= rect.top && y < rect.top + rect.height);
}

export function layerInputRegions(value: unknown): YomuGamingSelectionRect[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 2000).filter((rect): rect is YomuGamingSelectionRect => rect
        && ['left', 'top', 'width', 'height'].every(key => typeof rect[key] === 'number' && Number.isFinite(rect[key]))
        && rect.width > 0 && rect.height > 0);
}
