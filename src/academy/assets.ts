export type AcademyRuntimeAssetKind = 'background' | 'character-sprite' | 'event-art' | 'item-art' | 'protagonist-portrait';
export type AcademyRuntimeAssetStatus = 'approved' | 'review-preview';

export interface AcademyResponsivePresentation {
    readonly mobile: {
        readonly strategy: 'art-directed-crop';
        readonly sourceVariant: 'wide';
        readonly objectPosition: string;
        readonly purpose: string;
    };
}

export interface AcademyRuntimeAssetRecord {
    readonly kind: AcademyRuntimeAssetKind;
    readonly status: AcademyRuntimeAssetStatus;
    readonly runtimeHomes: readonly [string, ...string[]];
    readonly provenance: 'current-production' | 'recovered-academy-tree';
    readonly files: Readonly<Record<string, `/academy/art/${string}`>>;
    readonly responsivePresentation?: AcademyResponsivePresentation;
}

function runtimeAsset<const T extends AcademyRuntimeAssetRecord>(record: T): T {
    return record;
}

/**
 * The sole runtime registry for Academy art. Recovery inventory is deliberately
 * separate: an archived file is not runtime-authorized until it appears here.
 */
export const ACADEMY_RUNTIME_ASSET_REGISTRY = {
    'character.rie.neutral': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['onboarding:profile', 'unlock:rie', 'journal:rie', 'scene:arrival-bridge', 'class:people', 'class:week-cast', 'lesson-overview:roster', 'world:person', 'lesson:l1-l01:host'], provenance: 'current-production', files: { default: '/academy/art/characters/rie/rie__neutral__halfbody__v001.png' } }),
    'character.rie.happy': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['lesson-feedback:correct-retry', 'dialogue:rie-positive', 'journal:rie-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/rie/rie__happy__halfbody__v001.png' } }),
    'character.rie.encouraging': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['lesson-feedback:attempt', 'dialogue:rie-listening', 'journal:rie-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/rie/rie__encouraging__halfbody__v001.png' } }),
    'character.rie.repair': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['lesson-feedback:repair', 'dialogue:rie-precise-hint', 'journal:rie-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/rie/rie__repair__halfbody__v001.png' } }),
    'character.rie.determined-left': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['dialogue:rie-decisive-guidance', 'journal:rie-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/rie/rie__determined__left-three-quarter__halfbody__v001.png' } }),
    'character.rie.sad-vulnerable-front': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['dialogue:rie-vulnerable-reflection', 'journal:rie-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/rie/rie__sad-vulnerable__front-near-front__halfbody__v001.png' } }),
    'character.rie.comedic-right': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['dialogue:rie-light-recovery', 'journal:rie-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/rie/rie__comedic__right-three-quarter__halfbody__v001.png' } }),
    'character.rie.neutral-glasses': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['onboarding:profile', 'unlock:rie', 'journal:rie', 'scene:arrival-bridge', 'class:people', 'class:week-cast', 'lesson-overview:roster', 'world:person', 'lesson:l1-l01:host'], provenance: 'current-production', files: { default: '/academy/art/characters/rie/rie__neutral-glasses__front-near-front__halfbody__v001.png' } }),
    'character.rie.determined-glasses-left': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['dialogue:rie-decisive-guidance', 'journal:rie-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/rie/rie__determined-glasses__left-three-quarter__halfbody__v001.png' } }),
    'character.rie.encouraging-glasses-right': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['lesson-feedback:attempt', 'dialogue:rie-listening', 'journal:rie-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/rie/rie__encouraging-glasses__right-three-quarter__halfbody__v001.png' } }),
    'character.aakash.neutral': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['journal:aakash'], provenance: 'current-production', files: { default: '/academy/art/characters/aakash/aakash__neutral__halfbody__v001.png' } }),
    'character.felix.neutral': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['journal:felix-after-meeting', 'journal:felix-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/felix/felix__neutral__halfbody__v001.png' } }),
    'character.felix.happy-left': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['journal:felix-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/felix/felix__happy__left-three-quarter__halfbody__v001.png' } }),
    'character.felix.surprised-right': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['journal:felix-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/felix/felix__surprised__right-three-quarter__halfbody__v001.png' } }),
    'character.peter.neutral': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['journal:peter', 'journal:peter-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/peter/peter__neutral__halfbody__v002.png' } }),
    'character.peter.thoughtful-left': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['journal:peter-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/peter/peter__thoughtful__left-three-quarter__halfbody__v001.png' } }),
    'character.peter.encouraging-right': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['journal:peter-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/peter/peter__encouraging__right-three-quarter__halfbody__v001.png' } }),
    'character.shaun.neutral': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['journal:shaun'], provenance: 'current-production', files: { default: '/academy/art/characters/shaun/shaun__neutral__halfbody__v001.png' } }),
    'character.sophie.neutral-right': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['world:bookshop:sophie', 'journal:sophie', 'class:people', 'class:week-cast', 'lesson-overview:roster', 'world:person'], provenance: 'current-production', files: { default: '/academy/art/characters/sophie/sophie__bookshop-neutral__halfbody__v003.png' } }),
    'character.sophie.encouraging-front': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['dialogue:sophie-support', 'journal:sophie-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/sophie/sophie__encouraging-listening__front-near-front__halfbody__v003.png' } }),
    'character.sophie.determined-left': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['dialogue:sophie-research', 'journal:sophie-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/sophie/sophie__determined__left-three-quarter__halfbody__v003.png' } }),
    'character.tom2.neutral-right': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['journal:tom2', 'journal:tom2-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/tom2/tom2__neutral__right-three-quarter__halfbody__v001.png' } }),
    'character.tom2.encouraging-front': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['journal:tom2-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/tom2/tom2__encouraging-listening__front-near-front__halfbody__v001.png' } }),
    'character.tom2.surprised-left': runtimeAsset({ kind: 'character-sprite', status: 'review-preview', runtimeHomes: ['journal:tom2-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/tom2/tom2__surprised-shocked__left-three-quarter__halfbody__v001.png' } }),
    'character.steve.neutral-front': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['journal:steve', 'scene:steve-introduction'], provenance: 'current-production', files: { default: '/academy/art/characters/steve/steve__neutral__front-near-front__halfbody__v001.png' } }),
    'character.steve.happy-right': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['journal:steve-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/steve/steve__happy__right-three-quarter__halfbody__v001.png' } }),
    'character.steve.determined-left': runtimeAsset({ kind: 'character-sprite', status: 'approved', runtimeHomes: ['journal:steve-expression-gallery'], provenance: 'current-production', files: { default: '/academy/art/characters/steve/steve__determined__left-three-quarter__halfbody__v001.png' } }),
    'portrait.quality-2': runtimeAsset({ kind: 'protagonist-portrait', status: 'approved', runtimeHomes: ['onboarding:portrait-choice-2', 'journal:player'], provenance: 'current-production', files: { default: '/academy/art/protagonists/quality-2__picker__v001.png' } }),
    'portrait.quality-3': runtimeAsset({ kind: 'protagonist-portrait', status: 'approved', runtimeHomes: ['onboarding:portrait-choice-3', 'journal:player'], provenance: 'current-production', files: { default: '/academy/art/protagonists/quality-3__picker__v001.png' } }),
    'portrait.quality-4': runtimeAsset({ kind: 'protagonist-portrait', status: 'approved', runtimeHomes: ['onboarding:portrait-choice-4', 'journal:player'], provenance: 'current-production', files: { default: '/academy/art/protagonists/quality-4__picker__v001.png' } }),
    'portrait.quality-5': runtimeAsset({ kind: 'protagonist-portrait', status: 'approved', runtimeHomes: ['onboarding:portrait-choice-5', 'journal:player'], provenance: 'current-production', files: { default: '/academy/art/protagonists/quality-5__picker__v001.png' } }),
    'location.home': runtimeAsset({
        kind: 'background',
        status: 'approved',
        runtimeHomes: ['location:home', 'lesson:l2-l03'],
        provenance: 'recovered-academy-tree',
        files: { wide: '/academy/art/locations/wide/home-morning-desk__routine--wide.jpg', mobile: '/academy/art/locations/wide/home-morning-desk__routine--wide.jpg' },
        responsivePresentation: {
            mobile: {
                strategy: 'art-directed-crop',
                sourceVariant: 'wide',
                objectPosition: '62% center',
                purpose: 'Keep the clock, notebook, phone, and morning drink legible for Lesson 28 routine recall.',
            },
        },
    }),
    'location.campus-ensemble': runtimeAsset({
        kind: 'background',
        status: 'approved',
        runtimeHomes: ['access:campus-ensemble'],
        provenance: 'recovered-academy-tree',
        files: { wide: '/academy/art/locations/wide/campus-home__ensemble-spring--wide.webp', mobile: '/academy/art/locations/wide/campus-home__ensemble-spring--wide.webp' },
        responsivePresentation: {
            mobile: {
                strategy: 'art-directed-crop',
                sourceVariant: 'wide',
                objectPosition: '72% center',
                purpose: 'Keep the five classmates in frame so the class is the first-viewport signal on the access gate.',
            },
        },
    }),
    'location.entrance': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['access:entrance', 'campus:evening'], provenance: 'current-production', files: { wide: '/academy/art/locations/wide/campus-entrance__blue-hour-arrival--wide.webp', mobile: '/academy/art/locations/mobile/campus-entrance__blue-hour-arrival--mobile.webp' } }),
    'location.street': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['location:street', 'activity:rainy-directions'], provenance: 'recovered-academy-tree', files: { wide: '/academy/art/locations/wide/bloomsbury-street__day-route--wide.webp', mobile: '/academy/art/locations/mobile/bloomsbury-street__day-route--mobile.webp' } }),
    'location.station': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['location:station', 'activity:station-announcements', 'lesson:l2-l02', 'lesson:l2-l05', 'lesson:l2-l10', 'lesson:l2-l11'], provenance: 'recovered-academy-tree', files: { wide: '/academy/art/locations/wide/railway-station__day-commute--wide.webp', mobile: '/academy/art/locations/mobile/railway-station__day-commute--mobile.webp' } }),
    'location.station-platform': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['location:station-platform', 'activity:station-platform-transfer'], provenance: 'recovered-academy-tree', files: { wide: '/academy/art/locations/wide/tube-platform__blue-hour-rain--wide.webp', mobile: '/academy/art/locations/mobile/tube-platform__blue-hour-rain--mobile.webp' } }),
    'location.ramen': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['location:ramen', 'activity:ramen-ordering', 'lesson:l2-l07'], provenance: 'recovered-academy-tree', files: { wide: '/academy/art/locations/wide/ramen__evening-steam--wide.webp', mobile: '/academy/art/locations/mobile/ramen__evening-steam--mobile.webp' } }),
    'location.park': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['location:park', 'activity:park-weather-sketchbook', 'lesson:l2-l08'], provenance: 'recovered-academy-tree', files: { wide: '/academy/art/locations/wide/park__day-overcast--wide.webp', mobile: '/academy/art/locations/mobile/park__day-overcast--mobile.webp' } }),
    'location.konbini': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['location:konbini', 'activity:counter-shopping'], provenance: 'current-production', files: { wide: '/academy/art/locations/wide/konbini__rain-evening-checkout--wide.webp', mobile: '/academy/art/locations/mobile/konbini__rain-evening-checkout--mobile.webp' } }),
    'location.japan-centre': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['location:japan-centre', 'activity:gift-counter'], provenance: 'current-production', files: { wide: '/academy/art/locations/wide/japan-centre__rain-evening-gifts--wide.png', mobile: '/academy/art/locations/mobile/japan-centre__rain-evening-gifts--mobile.png' } }),
    'location.classroom': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['onboarding:profile', 'lesson-zero', 'placement', 'journal', 'lesson:l1-l01', 'lesson:l2-l04', 'lesson:l2-l15', 'lesson:l2-l16'], provenance: 'current-production', files: { wide: '/academy/art/locations/wide/classroom__evening-lamplit--wide.webp', mobile: '/academy/art/locations/mobile/classroom__evening-lamplit--mobile.webp' } }),
    'location.library': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['location:library', 'review:due-queue', 'lesson:l2-l06'], provenance: 'current-production', files: { wide: '/academy/art/locations/wide/library__rain-evening--wide.webp', mobile: '/academy/art/locations/mobile/library__rain-evening--mobile.webp' } }),
    'location.bookshop': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['location:bookshop', 'activity:bookshop-catalogue'], provenance: 'current-production', files: { wide: '/academy/art/locations/wide/bookshop__rain-evening-shelves--wide.webp', mobile: '/academy/art/locations/mobile/bookshop__rain-evening-shelves--mobile.webp' } }),
    'location.cafe': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['location:cafe', 'lesson:l2-l13'], provenance: 'current-production', files: { wide: '/academy/art/locations/wide/cafe__night-rain--wide.webp', mobile: '/academy/art/locations/mobile/cafe__night-rain--mobile.webp' } }),
    'location.language-lab': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['location:language-lab', 'activity:listening-shadowing', 'lesson:l2-l09', 'lesson:l2-l14'], provenance: 'current-production', files: { wide: '/academy/art/locations/wide/language-lab__evening-listening--wide.webp', mobile: '/academy/art/locations/mobile/language-lab__evening-listening--mobile.webp' } }),
    'location.writing-studio': runtimeAsset({ kind: 'background', status: 'approved', runtimeHomes: ['location:writing-studio', 'activity:kanji-doodle', 'lesson:l2-l12'], provenance: 'current-production', files: { wide: '/academy/art/locations/wide/writing-studio__rain-night--wide.webp', mobile: '/academy/art/locations/mobile/writing-studio__rain-night--mobile.webp' } }),
    'event.rainy-directions': runtimeAsset({ kind: 'event-art', status: 'approved', runtimeHomes: ['scene:aakash-rainy-directions', 'unlock:aakash', 'memory:aakash-rainy-directions'], provenance: 'current-production', files: { default: '/academy/art/events/rainy-directions__rie-aakash__v001.png' } }),
    'item.station-ticket': runtimeAsset({ kind: 'item-art', status: 'approved', runtimeHomes: ['reward:station:platform-ticket'], provenance: 'recovered-academy-tree', files: { default: '/academy/art/items/station-ticket-memory__v001.jpg' } }),
    'item.konbini-shopping-list': runtimeAsset({ kind: 'item-art', status: 'approved', runtimeHomes: ['reward:konbini:shopping-receipt'], provenance: 'recovered-academy-tree', files: { default: '/academy/art/items/konbini-shopping-list__v001.jpg' } }),
    'item.ramen-quantity-board': runtimeAsset({ kind: 'item-art', status: 'approved', runtimeHomes: ['reward:ramen:order-ticket'], provenance: 'recovered-academy-tree', files: { default: '/academy/art/items/ramen-quantity-board__v001.jpg' } }),
    'item.classroom-belongings': runtimeAsset({ kind: 'item-art', status: 'approved', runtimeHomes: ['reward:classroom:board-note', 'lesson:l1-l01:classroom-language-prop'], provenance: 'recovered-academy-tree', files: { default: '/academy/art/items/classroom-belongings__v001.jpg' } }),
    'item.library-photo-album': runtimeAsset({ kind: 'item-art', status: 'approved', runtimeHomes: ['reward:library:review-bookmark'], provenance: 'recovered-academy-tree', files: { default: '/academy/art/items/library-photo-album__v001.jpg' } }),
    'item.street-direction-map': runtimeAsset({ kind: 'item-art', status: 'approved', runtimeHomes: ['reward:street:directions-map'], provenance: 'recovered-academy-tree', files: { default: '/academy/art/items/street-direction-map__v001.jpg' } }),
    'item.japan-centre-omiyage-tag': runtimeAsset({ kind: 'item-art', status: 'approved', runtimeHomes: ['reward:japan-centre:omiyage-tag'], provenance: 'current-production', files: { default: '/academy/art/items/japan-centre-omiyage-tag__v001.png' } }),
    'item.cafe-order-scene': runtimeAsset({ kind: 'item-art', status: 'approved', runtimeHomes: ['reward:cafe:inspectable-order-scene'], provenance: 'recovered-academy-tree', files: { default: '/academy/art/items/cafe-order-scene__v001.jpg' } }),
} as const satisfies Readonly<Record<string, AcademyRuntimeAssetRecord>>;

export type AcademyRuntimeAssetId = keyof typeof ACADEMY_RUNTIME_ASSET_REGISTRY;

export interface AcademyLessonAssetBinding {
    readonly sceneAssetId: AcademyRuntimeAssetId;
    readonly sourceSceneReference: string;
    readonly approvedCastAssetIds: Readonly<Record<string, AcademyRuntimeAssetId>>;
    readonly reviewOnlyCastCandidates: Readonly<Record<string, AcademyRuntimeAssetId>>;
    readonly itemAssetIds: readonly AcademyRuntimeAssetId[];
    readonly sourceMedia: readonly {
        readonly purpose: 'source-homework-worksheet';
        readonly path: `/academy/content/lessons/${string}`;
        readonly sha256: string;
    }[];
}

/**
 * Lesson-local art bindings record only assets that cleared their runtime gate.
 * A cast name is not permission to substitute an unapproved or placeholder face.
 */
export const ACADEMY_LESSON_ASSET_BINDINGS = {
    'l1-l01': {
        sceneAssetId: 'location.classroom',
        sourceSceneReference: 'academy/art/scenes/classroom-first-evening-wide.webp',
        approvedCastAssetIds: { rie: 'character.rie.neutral' },
        reviewOnlyCastCandidates: { aakash: 'character.aakash.neutral' },
        itemAssetIds: ['item.classroom-belongings'],
        sourceMedia: [{
            purpose: 'source-homework-worksheet',
            path: '/academy/content/lessons/l1-l01/moodle-hw-chapter-1-1-greeting-page-1.png',
            sha256: '26fc7617addb2af8f85678b0e5dacf30518eeadfb030dbbb3d27dd2f54948100',
        }],
    },
} as const satisfies Readonly<Record<string, AcademyLessonAssetBinding>>;

export type AcademyItemAssetId = {
    [K in AcademyRuntimeAssetId]: typeof ACADEMY_RUNTIME_ASSET_REGISTRY[K]['kind'] extends 'item-art' ? K : never;
}[AcademyRuntimeAssetId];

type PurposefulAssetKind = 'background' | 'event-art' | 'item-art';

export type AcademyPurposefulAssetId = {
    [K in AcademyRuntimeAssetId]: typeof ACADEMY_RUNTIME_ASSET_REGISTRY[K]['kind'] extends PurposefulAssetKind ? K : never;
}[AcademyRuntimeAssetId];

type PurposefulAssetCoverage<K extends AcademyPurposefulAssetId> = {
    readonly purpose: typeof ACADEMY_RUNTIME_ASSET_REGISTRY[K]['kind'] extends 'background'
        ? 'world-scene'
        : typeof ACADEMY_RUNTIME_ASSET_REGISTRY[K]['kind'] extends 'event-art'
            ? 'story-event'
            : 'inspectable-item';
    readonly primaryUse: typeof ACADEMY_RUNTIME_ASSET_REGISTRY[K]['runtimeHomes'][number];
};

type PurposefulAssetCoverageLedger = {
    readonly [K in AcademyPurposefulAssetId]: PurposefulAssetCoverage<K>;
};

interface AcademyItemPresentationCoverageEntry {
    readonly presentation: 'world-reward-prop' | 'inspectable-source-prop';
    readonly primaryUse: string;
}

/** Exhaustive typed purpose coverage for non-character art with a runtime job. */
export const ACADEMY_PURPOSEFUL_ASSET_COVERAGE = {
    'location.home': { purpose: 'world-scene', primaryUse: 'location:home' },
    'location.campus-ensemble': { purpose: 'world-scene', primaryUse: 'access:campus-ensemble' },
    'location.entrance': { purpose: 'world-scene', primaryUse: 'access:entrance' },
    'location.street': { purpose: 'world-scene', primaryUse: 'activity:rainy-directions' },
    'location.station': { purpose: 'world-scene', primaryUse: 'activity:station-announcements' },
    'location.station-platform': { purpose: 'world-scene', primaryUse: 'activity:station-platform-transfer' },
    'location.ramen': { purpose: 'world-scene', primaryUse: 'activity:ramen-ordering' },
    'location.park': { purpose: 'world-scene', primaryUse: 'activity:park-weather-sketchbook' },
    'location.konbini': { purpose: 'world-scene', primaryUse: 'activity:counter-shopping' },
    'location.japan-centre': { purpose: 'world-scene', primaryUse: 'activity:gift-counter' },
    'location.classroom': { purpose: 'world-scene', primaryUse: 'lesson-zero' },
    'location.library': { purpose: 'world-scene', primaryUse: 'review:due-queue' },
    'location.bookshop': { purpose: 'world-scene', primaryUse: 'activity:bookshop-catalogue' },
    'location.cafe': { purpose: 'world-scene', primaryUse: 'location:cafe' },
    'location.language-lab': { purpose: 'world-scene', primaryUse: 'activity:listening-shadowing' },
    'location.writing-studio': { purpose: 'world-scene', primaryUse: 'activity:kanji-doodle' },
    'event.rainy-directions': { purpose: 'story-event', primaryUse: 'scene:aakash-rainy-directions' },
    'item.station-ticket': { purpose: 'inspectable-item', primaryUse: 'reward:station:platform-ticket' },
    'item.konbini-shopping-list': { purpose: 'inspectable-item', primaryUse: 'reward:konbini:shopping-receipt' },
    'item.ramen-quantity-board': { purpose: 'inspectable-item', primaryUse: 'reward:ramen:order-ticket' },
    'item.classroom-belongings': { purpose: 'inspectable-item', primaryUse: 'reward:classroom:board-note' },
    'item.library-photo-album': { purpose: 'inspectable-item', primaryUse: 'reward:library:review-bookmark' },
    'item.street-direction-map': { purpose: 'inspectable-item', primaryUse: 'reward:street:directions-map' },
    'item.japan-centre-omiyage-tag': { purpose: 'inspectable-item', primaryUse: 'reward:japan-centre:omiyage-tag' },
    'item.cafe-order-scene': { purpose: 'inspectable-item', primaryUse: 'reward:cafe:inspectable-order-scene' },
} as const satisfies PurposefulAssetCoverageLedger;

/**
 * Item art stays attached to a specific earned-world presentation. This keeps
 * a recovered image from becoming generic decoration elsewhere.
 */
export const ACADEMY_ITEM_PRESENTATION_COVERAGE = {
    'item.station-ticket': { presentation: 'world-reward-prop', primaryUse: 'reward:station:platform-ticket' },
    'item.konbini-shopping-list': { presentation: 'world-reward-prop', primaryUse: 'reward:konbini:shopping-receipt' },
    'item.ramen-quantity-board': { presentation: 'world-reward-prop', primaryUse: 'reward:ramen:order-ticket' },
    'item.classroom-belongings': { presentation: 'world-reward-prop', primaryUse: 'reward:classroom:board-note' },
    'item.library-photo-album': { presentation: 'world-reward-prop', primaryUse: 'reward:library:review-bookmark' },
    'item.street-direction-map': { presentation: 'world-reward-prop', primaryUse: 'reward:street:directions-map' },
    'item.japan-centre-omiyage-tag': { presentation: 'world-reward-prop', primaryUse: 'reward:japan-centre:omiyage-tag' },
    'item.cafe-order-scene': { presentation: 'inspectable-source-prop', primaryUse: 'reward:cafe:inspectable-order-scene' },
} as const satisfies Readonly<Record<AcademyItemAssetId, AcademyItemPresentationCoverageEntry>>;

function assetFile(id: AcademyRuntimeAssetId, variant: string): `/academy/art/${string}` {
    const files = ACADEMY_RUNTIME_ASSET_REGISTRY[id].files as Readonly<Record<string, `/academy/art/${string}`>>;
    const file = files[variant];
    if (!file) throw new TypeError(`Academy runtime asset ${id} has no ${variant} file.`);
    return file;
}

export const ACADEMY_APPROVED_CHARACTER_SPRITES = {
    rie: assetFile('character.rie.neutral-glasses', 'default'),
    rieDetermined: assetFile('character.rie.determined-glasses-left', 'default'),
    rieEncouraging: assetFile('character.rie.encouraging-glasses-right', 'default'),
    rieSadVulnerable: assetFile('character.rie.sad-vulnerable-front', 'default'),
    rieComedic: assetFile('character.rie.comedic-right', 'default'),
    sophie: assetFile('character.sophie.neutral-right', 'default'),
    sophieEncouraging: assetFile('character.sophie.encouraging-front', 'default'),
    sophieDetermined: assetFile('character.sophie.determined-left', 'default'),
    steve: assetFile('character.steve.neutral-front', 'default'),
    steveHappy: assetFile('character.steve.happy-right', 'default'),
    steveDetermined: assetFile('character.steve.determined-left', 'default'),
} as const;

/**
 * Cutouts with likeness clearance for learner-facing runtime surfaces. Keep
 * review candidates separate so an attractive card cannot accidentally become
 * a story or lesson likeness approval.
 */
export const ACADEMY_APPROVED_CAST_SPRITES = {
    rie: ACADEMY_APPROVED_CHARACTER_SPRITES.rie,
    sophie: ACADEMY_APPROVED_CHARACTER_SPRITES.sophie,
    steve: ACADEMY_APPROVED_CHARACTER_SPRITES.steve,
} as const;

/** Approved expression and angle coverage that may follow a cast member into VN scenes. */
export const ACADEMY_APPROVED_CAST_PERFORMANCES = {
    rie: {
        neutral: ACADEMY_APPROVED_CHARACTER_SPRITES.rie,
        encouraging: ACADEMY_APPROVED_CHARACTER_SPRITES.rieEncouraging,
        determined: ACADEMY_APPROVED_CHARACTER_SPRITES.rieDetermined,
        'sad-vulnerable': ACADEMY_APPROVED_CHARACTER_SPRITES.rieSadVulnerable,
        comedic: ACADEMY_APPROVED_CHARACTER_SPRITES.rieComedic,
    },
    sophie: {
        neutral: ACADEMY_APPROVED_CHARACTER_SPRITES.sophie,
        encouraging: ACADEMY_APPROVED_CHARACTER_SPRITES.sophieEncouraging,
        determined: ACADEMY_APPROVED_CHARACTER_SPRITES.sophieDetermined,
    },
    steve: {
        neutral: ACADEMY_APPROVED_CHARACTER_SPRITES.steve,
        happy: ACADEMY_APPROVED_CHARACTER_SPRITES.steveHappy,
        determined: ACADEMY_APPROVED_CHARACTER_SPRITES.steveDetermined,
    },
} as const;

/** Reference-backed cutouts that may appear only in the learner's journal. */
export const ACADEMY_JOURNAL_REVIEW_CAST_SPRITES = {
    rie: ACADEMY_APPROVED_CHARACTER_SPRITES.rie,
    aakash: assetFile('character.aakash.neutral', 'default'),
    felix: assetFile('character.felix.neutral', 'default'),
    peter: assetFile('character.peter.neutral', 'default'),
    shaun: assetFile('character.shaun.neutral', 'default'),
    sophie: ACADEMY_APPROVED_CHARACTER_SPRITES.sophie,
    tom2: assetFile('character.tom2.neutral-right', 'default'),
    steve: ACADEMY_APPROVED_CHARACTER_SPRITES.steve,
} as const;

export type AcademyCastSpritePresentation = 'approved-runtime' | 'journal-review-preview';

type AcademyCastSpriteAssetId = {
    [K in AcademyRuntimeAssetId]: typeof ACADEMY_RUNTIME_ASSET_REGISTRY[K]['kind'] extends 'character-sprite' ? K : never;
}[AcademyRuntimeAssetId];

interface AcademyCastSpriteCoverageEntry {
    readonly castId: string;
    readonly presentation: AcademyCastSpritePresentation;
    readonly primaryUse: string;
}

/**
 * Every registered cutout has one explicit presentation policy and a concrete
 * home. This is the audit surface for card, journal, and worker precache use.
 */
export const ACADEMY_CAST_SPRITE_COVERAGE = {
    'character.rie.neutral': { castId: 'rie', presentation: 'approved-runtime', primaryUse: 'class:people' },
    'character.rie.happy': { castId: 'rie', presentation: 'journal-review-preview', primaryUse: 'journal:rie-expression-gallery' },
    'character.rie.encouraging': { castId: 'rie', presentation: 'journal-review-preview', primaryUse: 'journal:rie-expression-gallery' },
    'character.rie.repair': { castId: 'rie', presentation: 'journal-review-preview', primaryUse: 'journal:rie-expression-gallery' },
    'character.rie.determined-left': { castId: 'rie', presentation: 'approved-runtime', primaryUse: 'journal:rie-expression-gallery' },
    'character.rie.sad-vulnerable-front': { castId: 'rie', presentation: 'approved-runtime', primaryUse: 'journal:rie-expression-gallery' },
    'character.rie.comedic-right': { castId: 'rie', presentation: 'approved-runtime', primaryUse: 'journal:rie-expression-gallery' },
    'character.rie.neutral-glasses': { castId: 'rie', presentation: 'approved-runtime', primaryUse: 'class:people' },
    'character.rie.determined-glasses-left': { castId: 'rie', presentation: 'approved-runtime', primaryUse: 'journal:rie-expression-gallery' },
    'character.rie.encouraging-glasses-right': { castId: 'rie', presentation: 'approved-runtime', primaryUse: 'journal:rie-expression-gallery' },
    'character.aakash.neutral': { castId: 'aakash', presentation: 'journal-review-preview', primaryUse: 'journal:aakash' },
    'character.felix.neutral': { castId: 'felix', presentation: 'journal-review-preview', primaryUse: 'journal:felix-after-meeting' },
    'character.felix.happy-left': { castId: 'felix', presentation: 'journal-review-preview', primaryUse: 'journal:felix-expression-gallery' },
    'character.felix.surprised-right': { castId: 'felix', presentation: 'journal-review-preview', primaryUse: 'journal:felix-expression-gallery' },
    'character.peter.neutral': { castId: 'peter', presentation: 'journal-review-preview', primaryUse: 'journal:peter' },
    'character.peter.thoughtful-left': { castId: 'peter', presentation: 'journal-review-preview', primaryUse: 'journal:peter-expression-gallery' },
    'character.peter.encouraging-right': { castId: 'peter', presentation: 'journal-review-preview', primaryUse: 'journal:peter-expression-gallery' },
    'character.shaun.neutral': { castId: 'shaun', presentation: 'journal-review-preview', primaryUse: 'journal:shaun' },
    'character.sophie.neutral-right': { castId: 'sophie', presentation: 'approved-runtime', primaryUse: 'world:bookshop:sophie' },
    'character.sophie.encouraging-front': { castId: 'sophie', presentation: 'approved-runtime', primaryUse: 'journal:sophie-expression-gallery' },
    'character.sophie.determined-left': { castId: 'sophie', presentation: 'approved-runtime', primaryUse: 'journal:sophie-expression-gallery' },
    'character.tom2.neutral-right': { castId: 'tom2', presentation: 'journal-review-preview', primaryUse: 'journal:tom2' },
    'character.tom2.encouraging-front': { castId: 'tom2', presentation: 'journal-review-preview', primaryUse: 'journal:tom2-expression-gallery' },
    'character.tom2.surprised-left': { castId: 'tom2', presentation: 'journal-review-preview', primaryUse: 'journal:tom2-expression-gallery' },
    'character.steve.neutral-front': { castId: 'steve', presentation: 'approved-runtime', primaryUse: 'journal:steve' },
    'character.steve.happy-right': { castId: 'steve', presentation: 'approved-runtime', primaryUse: 'journal:steve-expression-gallery' },
    'character.steve.determined-left': { castId: 'steve', presentation: 'approved-runtime', primaryUse: 'journal:steve-expression-gallery' },
} as const satisfies Readonly<Record<AcademyCastSpriteAssetId, AcademyCastSpriteCoverageEntry>>;

export const ACADEMY_ASSETS = {
    rie: ACADEMY_APPROVED_CHARACTER_SPRITES.rie,
    characters: {
        approved: ACADEMY_APPROVED_CAST_SPRITES,
        approvedPerformances: ACADEMY_APPROVED_CAST_PERFORMANCES,
        journalReview: ACADEMY_JOURNAL_REVIEW_CAST_SPRITES,
    },
    characterSpriteGalleries: {
        rie: {
            'neutral:front-near-front': ACADEMY_APPROVED_CAST_PERFORMANCES.rie.neutral,
            'determined:left-three-quarter': ACADEMY_APPROVED_CAST_PERFORMANCES.rie.determined,
            'encouraging-listening:right-three-quarter': ACADEMY_APPROVED_CAST_PERFORMANCES.rie.encouraging,
        },
        peter: {
            'left-three-quarter': assetFile('character.peter.thoughtful-left', 'default'),
            'front-near-front': assetFile('character.peter.neutral', 'default'),
            'right-three-quarter': assetFile('character.peter.encouraging-right', 'default'),
        },
        felix: {
            'left-three-quarter': assetFile('character.felix.happy-left', 'default'),
            'front-near-front': assetFile('character.felix.neutral', 'default'),
            'right-three-quarter': assetFile('character.felix.surprised-right', 'default'),
        },
        sophie: {
            'left-three-quarter': ACADEMY_APPROVED_CAST_PERFORMANCES.sophie.determined,
            'front-near-front': ACADEMY_APPROVED_CAST_PERFORMANCES.sophie.encouraging,
            'right-three-quarter': ACADEMY_APPROVED_CAST_PERFORMANCES.sophie.neutral,
        },
        tom2: {
            'surprised-shocked:left-three-quarter': assetFile('character.tom2.surprised-left', 'default'),
            'encouraging-listening:front-near-front': assetFile('character.tom2.encouraging-front', 'default'),
            'neutral:right-three-quarter': assetFile('character.tom2.neutral-right', 'default'),
        },
        steve: {
            'determined:left-three-quarter': ACADEMY_APPROVED_CAST_PERFORMANCES.steve.determined,
            'neutral:front-near-front': ACADEMY_APPROVED_CAST_PERFORMANCES.steve.neutral,
            'happy:right-three-quarter': ACADEMY_APPROVED_CAST_PERFORMANCES.steve.happy,
        },
    },
    portraits: {
        'quality-2': assetFile('portrait.quality-2', 'default'),
        'quality-3': assetFile('portrait.quality-3', 'default'),
        'quality-4': assetFile('portrait.quality-4', 'default'),
        'quality-5': assetFile('portrait.quality-5', 'default'),
    },
    locations: {
        home: assetFileSet('location.home'),
        campusEnsemble: assetFileSet('location.campus-ensemble'),
        entrance: assetFileSet('location.entrance'),
        street: assetFileSet('location.street'),
        station: assetFileSet('location.station'),
        stationPlatform: assetFileSet('location.station-platform'),
        ramen: assetFileSet('location.ramen'),
        park: assetFileSet('location.park'),
        konbini: assetFileSet('location.konbini'),
        japanCentre: assetFileSet('location.japan-centre'),
        classroom: assetFileSet('location.classroom'),
        library: assetFileSet('location.library'),
        bookshop: assetFileSet('location.bookshop'),
        cafe: assetFileSet('location.cafe'),
        languageLab: assetFileSet('location.language-lab'),
        writingStudio: assetFileSet('location.writing-studio'),
        rainyDirections: {
            wide: assetFile('event.rainy-directions', 'default'),
            mobile: assetFile('event.rainy-directions', 'default'),
        },
    },
    items: {
        stationTicket: assetFile('item.station-ticket', 'default'),
        konbiniShoppingList: assetFile('item.konbini-shopping-list', 'default'),
        ramenQuantityBoard: assetFile('item.ramen-quantity-board', 'default'),
        classroomBelongings: assetFile('item.classroom-belongings', 'default'),
        libraryPhotoAlbum: assetFile('item.library-photo-album', 'default'),
        streetDirectionMap: assetFile('item.street-direction-map', 'default'),
        japanCentreOmiyageTag: assetFile('item.japan-centre-omiyage-tag', 'default'),
        cafeOrderScene: assetFile('item.cafe-order-scene', 'default'),
    },
} as const;

function assetFileSet(id: Extract<AcademyRuntimeAssetId, `location.${string}`>): Readonly<{ wide: string; mobile: string }> {
    return { wide: assetFile(id, 'wide'), mobile: assetFile(id, 'mobile') };
}

export type ProtagonistPortraitId = keyof typeof ACADEMY_ASSETS.portraits;
export type AcademyPlateId = keyof typeof ACADEMY_ASSETS.locations;
export type AcademyItemAsset = typeof ACADEMY_ASSETS.items[keyof typeof ACADEMY_ASSETS.items];

export const ACADEMY_PLATE_RESPONSIVE_PRESENTATION: Readonly<Partial<Record<AcademyPlateId, AcademyResponsivePresentation>>> = {
    home: ACADEMY_RUNTIME_ASSET_REGISTRY['location.home'].responsivePresentation,
    campusEnsemble: ACADEMY_RUNTIME_ASSET_REGISTRY['location.campus-ensemble'].responsivePresentation,
};
