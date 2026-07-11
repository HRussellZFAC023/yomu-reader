/**
 * Yomu Academy VN engine — asset registry.
 *
 * Resolves abstract ids (plate, character+expression) to shipped art with
 * explicit quality tiers, so placeholder art is visibly tracked and can be
 * replaced by better generations without touching scene scripts.
 *
 * Quality tiers:
 *  - production: approved style, real transparency where required
 *  - placeholder: shippable stand-in awaiting regeneration
 */

import type { CharacterId, ExpressionId } from './script';

const ART_ROOT = 'art';

export type AssetQuality = 'production' | 'placeholder';

export interface ResolvedAsset {
    url: string;
    quality: AssetQuality;
}

/** Wide/mobile plate pair; mobile falls back to wide when absent. */
export interface PlateAsset {
    wide: string;
    mobile?: string;
    quality: AssetQuality;
}

/**
 * Plates. Codex-production-v1 set (production tier). Ids are
 * `location__state`; scenes reference these ids, never file paths.
 */
const V1 = `${ART_ROOT}/codex-production-v1/backgrounds`;
const PLATE_IDS = [
    'airport__morning-departure',
    'bloomsbury-street__blue-hour-rain',
    'bloomsbury-street__day-route',
    'cafe__day-open',
    'cafe__night-rain',
    'campus-entrance__blue-hour-arrival',
    'classroom__day-overcast',
    'classroom__evening-lamplit',
    'gym__evening-cooldown',
    'japan-classroom__evening-lamplit',
    'japan-office__evening-close',
    'konbini__midnight-rain',
    'kyoto-temple-approach__dawn-mist',
    'library__rain-evening',
    'office-work__night-close',
    'park__day-overcast',
    'pub__evening-arrival',
    'railway-station__day-commute',
    'rainy-crossing__rain-evening',
    'ramen__evening-steam',
    'restaurant__evening-arrival',
    'shinkansen__dawn-platform',
    'student-room__rain-night',
    'tennis-court__rainy-twilight',
    'tokyo-street__rain-night',
    'tube-platform__blue-hour-rain',
] as const;

export type PlateId = (typeof PLATE_IDS)[number];

const plates = new Map<string, PlateAsset>(
    PLATE_IDS.map(id => [
        id,
        {
            wide: `${V1}/wide/${id}--wide.webp`,
            mobile: `${V1}/mobile/${id}--mobile.webp`,
            quality: 'production' as const,
        },
    ]),
);

export function resolvePlate(id: string): PlateAsset | null {
    return plates.get(id) ?? null;
}

export function listPlates(): readonly string[] {
    return PLATE_IDS;
}

/**
 * Sprites. codex-production-v2 sets are the only real-transparency sprites
 * (production). Characters without a v2 set resolve to their
 * claude-production-v3 bust (placeholder: opaque backing, needs matting) or
 * their portrait (placeholder). Expression falls back along EXPRESSION_NEAR
 * then to whatever the character has.
 */
const V2 = `${ART_ROOT}/codex-production-v2/sprites`;
const V3 = `${ART_ROOT}/claude-production-v3/characters`;
const PORTRAITS = `${ART_ROOT}/characters/portraits`;

const V2_EXPRESSIONS: Record<string, ExpressionId[]> = {
    aakash: ['concerned', 'determined', 'embarrassed', 'listening', 'neutral', 'speaking', 'surprised', 'thinking'],
    alex: ['concerned', 'determined', 'embarrassed', 'laughing', 'listening', 'neutral', 'speaking', 'surprised'],
    christian: ['neutral'],
    francis: ['happy', 'neutral', 'surprised', 'thinking'],
    henry: ['concerned', 'determined', 'embarrassed', 'happy', 'laughing', 'speaking', 'surprised', 'thinking'],
    rie: ['concerned', 'determined', 'embarrassed', 'happy', 'laughing', 'neutral', 'surprised', 'thinking'],
    sam: ['embarrassed', 'happy', 'laughing', 'listening', 'neutral', 'speaking', 'surprised', 'thinking'],
    sophie: ['neutral'],
    tom: ['determined', 'embarrassed', 'happy', 'laughing', 'listening', 'neutral', 'speaking'],
};

/** Bust variants actually on disk (claude-production-v3), per character. */
const V3_BUSTS: Record<string, string[]> = {
    aakash: ['happy', 'thinking'],
    alex: ['happy', 'thinking'],
    christian: ['happy', 'neutral', 'thinking'],
    francis: ['happy', 'thinking'],
    henry: ['happy', 'neutral', 'thinking'],
    jenny: ['happy', 'thinking'],
    jodi: ['neutral', 'thinking'],
    rie: ['happy', 'neutral', 'thinking'],
    sam: ['happy', 'thinking'],
    shin: ['neutral', 'thinking'],
    tom: ['happy', 'neutral', 'thinking'],
};

/** Full canon cast (Pho removed by directive 2026-07-11). */
export const CANON_CAST: readonly CharacterId[] = [
    'rie', 'henry', 'aakash', 'alex', 'tom', 'sam', 'francis', 'shin', 'jodi', 'christian',
    'jenny', 'robert', 'mika', 'sophie', 'xingyu', 'angel', 'stasi', 'ruparna',
    // Textbook guests (Genki / Minna no Nihongo) — art pending generation.
    'miller', 'tawapon',
];

const EXPRESSION_NEAR: Record<ExpressionId, ExpressionId[]> = {
    neutral: ['listening', 'thinking', 'speaking'],
    happy: ['laughing', 'neutral', 'speaking'],
    laughing: ['happy', 'surprised', 'neutral'],
    thinking: ['concerned', 'neutral', 'listening'],
    surprised: ['embarrassed', 'laughing', 'neutral'],
    concerned: ['thinking', 'embarrassed', 'neutral'],
    determined: ['speaking', 'neutral', 'happy'],
    embarrassed: ['concerned', 'surprised', 'neutral'],
    speaking: ['neutral', 'happy', 'determined'],
    listening: ['neutral', 'thinking', 'concerned'],
};

export function resolveSprite(character: CharacterId, expression: ExpressionId = 'neutral'): ResolvedAsset | null {
    const v2 = V2_EXPRESSIONS[character];
    if (v2) {
        const order = [expression, ...(EXPRESSION_NEAR[expression] ?? []), ...v2];
        const found = order.find(candidate => v2.includes(candidate));
        if (found) {
            return { url: `${V2}/${character}/${character}__sprite__${found}__halfbody__v2.png`, quality: 'production' };
        }
    }
    const busts = V3_BUSTS[character];
    if (busts?.length) {
        const order = [expression, ...(EXPRESSION_NEAR[expression] ?? []), 'neutral', ...busts];
        const found = order.find(candidate => busts.includes(candidate)) ?? busts[0];
        return { url: `${V3}/${character}/${character}__bust__${found}.webp`, quality: 'placeholder' };
    }
    return { url: `${PORTRAITS}/${character}.png`, quality: 'placeholder' };
}

/** Characters still lacking production sprites — the codex generation queue. */
export function spriteGenerationQueue(): CharacterId[] {
    return CANON_CAST.filter(character => !V2_EXPRESSIONS[character]);
}
