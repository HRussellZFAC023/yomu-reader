import type { JPDBCard, JPDBPitchComponent } from '../app/types';
import { getPitchClass } from '../jpdb/jpdb-parser';

const PITCH_CLASSES = new Set(['heiban', 'atamadaka', 'nakadaka', 'odaka']);

export interface ResolvedPitchComponent extends JPDBPitchComponent {
    pitchClass: string;
}

export function resolvedPitchComponents(card: Pick<JPDBCard, 'spelling' | 'reading' | 'pitchAccent' | 'pitchComponents'>): ResolvedPitchComponent[] {
    if (getPitchClass(card.pitchAccent, card.reading || card.spelling)) return [];
    const components = card.pitchComponents ?? [];
    if (components.length < 2) return [];
    if (compact(components.map(component => component.spelling).join('')) !== compact(card.spelling)) return [];
    if (card.reading && compact(components.map(component => component.reading).join('')) !== compact(card.reading)) return [];
    const resolved = components.map(component => ({
        ...component,
        pitchClass: getPitchClass(component.pitchAccent, component.reading || component.spelling),
    }));
    return resolved.every(component => PITCH_CLASSES.has(component.pitchClass)) ? resolved : [];
}

export function hasResolvedPitchComponents(card: Pick<JPDBCard, 'spelling' | 'reading' | 'pitchAccent' | 'pitchComponents'>): boolean {
    return resolvedPitchComponents(card).length > 0;
}

export function pitchComponentUnderlineGradient(card: Pick<JPDBCard, 'spelling' | 'reading' | 'pitchAccent' | 'pitchComponents'>): string {
    const components = resolvedPitchComponents(card);
    if (!components.length) return '';
    const lengths = components.map(component => Array.from(component.spelling).length);
    const total = lengths.reduce((sum, length) => sum + length, 0);
    if (!total) return '';
    let offset = 0;
    const stops: string[] = [];
    components.forEach((component, index) => {
        const start = offset / total * 100;
        offset += lengths[index] ?? 0;
        const end = offset / total * 100;
        const color = `var(--jpdb-reader-pitch-${component.pitchClass})`;
        stops.push(`${color} ${formatPercent(start)}`, `${color} ${formatPercent(end)}`);
    });
    return `linear-gradient(to right, ${stops.join(', ')})`;
}

function compact(value: string): string {
    return value.replace(/\s+/g, '').trim();
}

function formatPercent(value: number): string {
    return `${Number(value.toFixed(3))}%`;
}
