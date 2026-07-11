/**
 * Yomu Academy — world areas.
 *
 * The map hub is real Bloomsbury geography (WORLD-BIBLE locations) plus the
 * later Japan arc. Each area binds to plates by time-of-day state and lists
 * the activity kinds it can host. Unlock = calendar week OR story flag;
 * learning content itself is never area-locked (syllabus view always works).
 */

export type AreaActivityKind =
    | 'class-lesson'
    | 'review'
    | 'kanji-study'
    | 'reading'
    | 'listening'
    | 'bond-scene'
    | 'minigame';

export type DaySlot = 'day' | 'evening';

export interface AreaDefinition {
    id: string;
    name: string;
    kana: string;
    /** Plate ids by slot; evening falls back to day when absent. */
    plates: Partial<Record<DaySlot, string>> & { day: string };
    /** Map hub position, percentage of the map canvas. */
    map: { x: number; y: number };
    activities: AreaActivityKind[];
    /** Unlocked from this week index (0 = start). */
    unlockWeek: number;
    /** Or unlocked by a story flag, whichever comes first. */
    unlockFlag?: string;
    arc: 'london' | 'japan';
}

export const AREAS: readonly AreaDefinition[] = [
    {
        id: 'classroom',
        name: 'Classroom',
        kana: 'きょうしつ',
        plates: { day: 'classroom__day-overcast', evening: 'classroom__evening-lamplit' },
        map: { x: 46, y: 38 },
        activities: ['class-lesson', 'review', 'bond-scene'],
        unlockWeek: 0,
        arc: 'london',
    },
    {
        id: 'campus',
        name: 'Main Quad',
        kana: 'キャンパス',
        plates: { day: 'campus-entrance__blue-hour-arrival' },
        map: { x: 34, y: 30 },
        activities: ['bond-scene', 'minigame'],
        unlockWeek: 0,
        arc: 'london',
    },
    {
        id: 'library',
        name: 'Library',
        kana: 'としょかん',
        plates: { day: 'library__rain-evening' },
        map: { x: 58, y: 26 },
        activities: ['reading', 'kanji-study', 'review', 'bond-scene'],
        unlockWeek: 0,
        arc: 'london',
    },
    {
        id: 'cafe',
        name: 'Cafe',
        kana: 'カフェ',
        plates: { day: 'cafe__day-open', evening: 'cafe__night-rain' },
        map: { x: 24, y: 52 },
        activities: ['listening', 'bond-scene'],
        unlockWeek: 1,
        arc: 'london',
    },
    {
        id: 'street',
        name: 'Gower Street',
        kana: 'ガワーどおり',
        plates: { day: 'bloomsbury-street__day-route', evening: 'bloomsbury-street__blue-hour-rain' },
        map: { x: 40, y: 62 },
        activities: ['minigame', 'bond-scene'],
        unlockWeek: 2,
        arc: 'london',
    },
    {
        id: 'station',
        name: 'Euston Square',
        kana: 'えき',
        plates: { day: 'railway-station__day-commute', evening: 'tube-platform__blue-hour-rain' },
        map: { x: 58, y: 70 },
        activities: ['minigame', 'listening', 'bond-scene'],
        unlockWeek: 3,
        arc: 'london',
    },
    {
        id: 'konbini',
        name: 'Corner Shop',
        kana: 'コンビニ',
        plates: { day: 'konbini__midnight-rain' },
        map: { x: 72, y: 56 },
        activities: ['minigame', 'bond-scene'],
        unlockWeek: 4,
        arc: 'london',
    },
    {
        id: 'ramen',
        name: 'Ramen Bar',
        kana: 'ラーメンや',
        plates: { day: 'ramen__evening-steam' },
        map: { x: 80, y: 40 },
        activities: ['bond-scene', 'listening'],
        unlockWeek: 5,
        unlockFlag: 'story:ramen-invite',
        arc: 'london',
    },
    {
        id: 'pub',
        name: 'The Pub',
        kana: 'パブ',
        plates: { day: 'pub__evening-arrival' },
        map: { x: 14, y: 70 },
        activities: ['bond-scene', 'listening'],
        unlockWeek: 8,
        unlockFlag: 'story:pub-invite',
        arc: 'london',
    },
    {
        id: 'gym',
        name: 'Gym',
        kana: 'ジム',
        plates: { day: 'gym__evening-cooldown' },
        map: { x: 12, y: 36 },
        activities: ['bond-scene', 'minigame'],
        unlockWeek: 10,
        arc: 'london',
    },
    {
        id: 'park',
        name: 'Gordon Square',
        kana: 'こうえん',
        plates: { day: 'park__day-overcast' },
        map: { x: 68, y: 18 },
        activities: ['reading', 'bond-scene'],
        unlockWeek: 6,
        arc: 'london',
    },
    {
        id: 'restaurant',
        name: 'Restaurant',
        kana: 'レストラン',
        plates: { day: 'restaurant__evening-arrival' },
        map: { x: 88, y: 66 },
        activities: ['bond-scene', 'listening'],
        unlockWeek: 12,
        unlockFlag: 'story:class-meal',
        arc: 'london',
    },
    // Japan arc — unlocked by story progression, not week count.
    {
        id: 'airport',
        name: 'Heathrow',
        kana: 'くうこう',
        plates: { day: 'airport__morning-departure' },
        map: { x: 16, y: 24 },
        activities: ['bond-scene', 'minigame'],
        unlockWeek: Number.POSITIVE_INFINITY,
        unlockFlag: 'story:japan-trip',
        arc: 'japan',
    },
    {
        id: 'tokyo',
        name: 'Tokyo',
        kana: 'とうきょう',
        plates: { day: 'tokyo-street__rain-night' },
        map: { x: 42, y: 40 },
        activities: ['bond-scene', 'listening', 'minigame', 'reading'],
        unlockWeek: Number.POSITIVE_INFINITY,
        unlockFlag: 'story:japan-trip',
        arc: 'japan',
    },
    {
        id: 'kyoto',
        name: 'Kyoto',
        kana: 'きょうと',
        plates: { day: 'kyoto-temple-approach__dawn-mist' },
        map: { x: 66, y: 52 },
        activities: ['bond-scene', 'reading'],
        unlockWeek: Number.POSITIVE_INFINITY,
        unlockFlag: 'story:japan-trip',
        arc: 'japan',
    },
    {
        id: 'shinkansen',
        name: 'Shinkansen',
        kana: 'しんかんせん',
        plates: { day: 'shinkansen__dawn-platform' },
        map: { x: 54, y: 66 },
        activities: ['listening', 'bond-scene'],
        unlockWeek: Number.POSITIVE_INFINITY,
        unlockFlag: 'story:japan-trip',
        arc: 'japan',
    },
    {
        id: 'japan-office',
        name: 'Tokyo Office',
        kana: 'オフィス',
        plates: { day: 'japan-office__evening-close' },
        map: { x: 80, y: 30 },
        activities: ['bond-scene', 'listening'],
        unlockWeek: Number.POSITIVE_INFINITY,
        unlockFlag: 'story:japan-job',
        arc: 'japan',
    },
];

export function areaById(id: string): AreaDefinition | undefined {
    return AREAS.find(area => area.id === id);
}
