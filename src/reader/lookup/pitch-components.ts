import type { JPDBCard, JPDBPitchComponent } from '../app/types';
import { annotatedWordRubies, readingFromSurfaceRubies } from '../cards/reading-display';
import { getPitchClass } from '../jpdb/jpdb-parser';
import { icuWordSegments } from '../languages/icu-segmentation';
import { KANJI_RE } from './japanese-script';

const PITCH_CLASSES = new Set(['heiban', 'atamadaka', 'nakadaka', 'odaka']);
const MAX_INFERRED_PITCH_LOOKUP_COMPONENTS = 3;

export interface ResolvedPitchComponent extends JPDBPitchComponent {
    pitchClass: string;
}

/**
 * Recovers honest component geometry when a provider returns an annotated
 * reading but no `composedOf` rows (notably 申し訳ありません).
 *
 * Intl.Segmenter supplies boundaries only. The provider's bracket reading must
 * align every boundary against the exact card spelling/reading, and every
 * component starts pitchless. Callers may then attach only exact
 * expression-and-reading pitch evidence to an individual component. This
 * never synthesizes or assigns a component contour to the whole expression.
 */
export function inferredAnnotatedPitchComponents(
    card: Pick<JPDBCard, 'spelling' | 'reading' | 'pitchAccent' | 'pitchComponents' | 'wordWithReading'>,
): JPDBPitchComponent[] {
    if (getPitchClass(card.pitchAccent, card.reading || card.spelling) || card.pitchComponents?.length) return [];
    const spelling = compact(card.spelling);
    const reading = compact(card.reading);
    const annotated = compact(card.wordWithReading ?? '');
    if (!spelling || !reading || !annotated.includes('[')) return [];
    if (Array.from(spelling).filter(character => KANJI_RE.test(character)).length < 2) return [];

    const rubies = annotatedWordRubies(spelling, annotated);
    if (!rubies.length || compact(readingFromSurfaceRubies(spelling, rubies)) !== reading) return [];
    const rawSegments = icuWordSegments(spelling, 'ja');
    if (!rawSegments) return [];
    const components: JPDBPitchComponent[] = [];
    for (const segment of rawSegments) {
        const start = segment.start;
        const end = segment.end;
        const readingStart = readingOffsetAtSurfaceBoundary(start, rubies);
        const readingEnd = readingOffsetAtSurfaceBoundary(end, rubies);
        if (readingStart < 0 || readingEnd <= readingStart) return [];
        const component: JPDBPitchComponent = {
            spelling: segment.text,
            reading: reading.slice(readingStart, readingEnd),
            pitchAccent: [],
            wordWithReading: null,
            inferredFromAnnotatedReading: true,
        };
        const previous = components[components.length - 1];
        // ICU can split an inflected kana tail into several shallow segments
        // (`ありま` + `せん`). They carry no pitch evidence of their own, so keep
        // one neutral remainder rather than inviting homophone lookups for each
        // fragment. Kana between two lexical kanji segments remains separate.
        if (previous
            && !containsKanji(previous.spelling)
            && !containsKanji(component.spelling)) {
            previous.spelling += component.spelling;
            previous.reading += component.reading;
        } else {
            components.push(component);
        }
    }
    if (components.length < 2) return [];
    if (components.map(component => component.spelling).join('') !== spelling) return [];
    if (components.map(component => component.reading).join('') !== reading) return [];
    if (components.filter(component => containsKanji(component.spelling)).length > MAX_INFERRED_PITCH_LOOKUP_COMPONENTS) return [];
    return components.some(component => containsKanji(component.spelling)) ? components : [];
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

function containsKanji(value: string): boolean {
    return KANJI_RE.test(value);
}

function readingOffsetAtSurfaceBoundary(offset: number, rubies: ReturnType<typeof annotatedWordRubies>): number {
    let readingOffset = offset;
    for (const ruby of rubies) {
        if (offset > ruby.start && offset < ruby.end) return -1;
        if (ruby.end <= offset) readingOffset += ruby.text.length - ruby.length;
    }
    return readingOffset;
}

function formatPercent(value: number): string {
    return `${Number(value.toFixed(3))}%`;
}
