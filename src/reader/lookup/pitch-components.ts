import type { JPDBCard, JPDBPitchComponent } from '../app/types';
import { getPitchClass } from '../jpdb/jpdb-parser';

const PITCH_CLASSES = new Set(['heiban', 'atamadaka', 'nakadaka', 'odaka']);

export interface ResolvedPitchComponent extends JPDBPitchComponent {
    pitchClass: string;
}

// The compound's morphemes tiled against its spelling/reading, each carrying
// its own resolved pitch class or '' when that morpheme's accent is not (yet)
// known. Returns null when the decomposition itself is unusable (a direct
// whole-word accent exists, fewer than two components, or the components do not
// reconstruct the spelling/reading) — those void every component surface. An
// UNRESOLVED-but-well-tiled morpheme is kept, so callers can choose between the
// strict all-resolved view and the tolerant partial-paint view.
function tiledPitchComponents(card: Pick<JPDBCard, 'spelling' | 'reading' | 'pitchAccent' | 'pitchComponents'>): ResolvedPitchComponent[] | null {
    if (getPitchClass(card.pitchAccent, card.reading || card.spelling)) return null;
    const components = card.pitchComponents ?? [];
    if (components.length < 2) return null;
    if (compact(components.map(component => component.spelling).join('')) !== compact(card.spelling)) return null;
    if (card.reading && compact(components.map(component => component.reading).join('')) !== compact(card.reading)) return null;
    return components.map(component => ({
        ...component,
        pitchClass: getPitchClass(component.pitchAccent, component.reading || component.spelling),
    }));
}

// Strict view: only when EVERY morpheme classifies. This is the enrichment
// gate — a card is treated as "already has pitch evidence" (and skipped by the
// public-lookup passes) solely when the decomposition is complete, so a
// partially-resolved compound still gets its missing morphemes filled in.
export function resolvedPitchComponents(card: Pick<JPDBCard, 'spelling' | 'reading' | 'pitchAccent' | 'pitchComponents'>): ResolvedPitchComponent[] {
    const components = tiledPitchComponents(card);
    if (!components) return [];
    return components.every(component => PITCH_CLASSES.has(component.pitchClass)) ? components : [];
}

export function hasResolvedPitchComponents(card: Pick<JPDBCard, 'spelling' | 'reading' | 'pitchAccent' | 'pitchComponents'>): boolean {
    return resolvedPitchComponents(card).length > 0;
}

// Tolerant view: at least one morpheme classifies, so a coloured underline can
// be painted (the rest render neutral). Distinct from hasResolvedPitchComponents
// on purpose — the enrichment passes must keep filling a partially-resolved
// compound (they gate on the strict predicate), but the repaint must apply the
// partial gradient as morphemes arrive rather than wait for a complete set.
export function hasPaintablePitchComponents(card: Pick<JPDBCard, 'spelling' | 'reading' | 'pitchAccent' | 'pitchComponents'>): boolean {
    const components = tiledPitchComponents(card);
    return Boolean(components?.some(component => PITCH_CLASSES.has(component.pitchClass)));
}

export function pitchComponentUnderlineGradient(card: Pick<JPDBCard, 'spelling' | 'reading' | 'pitchAccent' | 'pitchComponents'>): string {
    const components = tiledPitchComponents(card);
    if (!components) return '';
    // Paint the underline as soon as ONE morpheme's accent is known: an
    // unresolved morpheme becomes a neutral segment aligned to its exact
    // substring rather than voiding the whole compound's colouring. Killing the
    // gradient on a single missing (often rare) morpheme is what left compounds
    // like 賛成票率順 completely undecorated even though 賛成 has a known accent.
    if (!components.some(component => PITCH_CLASSES.has(component.pitchClass))) return '';
    const lengths = components.map(component => Array.from(component.spelling).length);
    const total = lengths.reduce((sum, length) => sum + length, 0);
    if (!total) return '';
    let offset = 0;
    const stops: string[] = [];
    components.forEach((component, index) => {
        const start = offset / total * 100;
        offset += lengths[index] ?? 0;
        const end = offset / total * 100;
        const color = PITCH_CLASSES.has(component.pitchClass)
            ? `var(--jpdb-reader-pitch-${component.pitchClass})`
            : 'var(--jpdb-reader-pitch-unknown)';
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
