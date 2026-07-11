/**
 * Yomu Academy — persistent world state.
 *
 * One versioned local-first store for everything the day loop needs:
 * calendar position on the week spine, day slot, bonds, story flags,
 * seen scenes, and presentation settings. Learning mastery itself lives in
 * the progression engine (progression-engine.ts) — this store only carries
 * world/story consequences of it.
 */

import { AREAS, type AreaDefinition, type DaySlot } from './areas';

export const WORLD_STORAGE_KEY = 'yomu:academy:world:v1';

/** Bond points required to reach each rank (index = rank). */
export const BOND_RANK_THRESHOLDS = [0, 10, 25, 45, 70, 100, 140, 190, 250, 320, 400] as const;
export const MAX_BOND_RANK = BOND_RANK_THRESHOLDS.length - 1;

export interface WorldSettings {
    showFurigana: boolean;
    showTranslations: boolean;
    reducedMotion: boolean;
}

export interface WorldState {
    version: 1;
    /** Index into the 73-week course spine. */
    weekIndex: number;
    slot: DaySlot;
    /** Bond points per character id. */
    bonds: Record<string, number>;
    /** Story/world flags (string|number|boolean). */
    flags: Record<string, string | number | boolean>;
    /** Scene ids already completed (replay allowed, rewards once). */
    seenScenes: string[];
    settings: WorldSettings;
    /** Why the learner is here — onboarding choice, echoes through scenes. */
    motivation?: string;
    createdAt: string;
    updatedAt: string;
}

export function defaultWorldState(): WorldState {
    const now = new Date().toISOString();
    return {
        version: 1,
        weekIndex: 0,
        slot: 'day',
        bonds: {},
        flags: {},
        seenScenes: [],
        settings: {
            showFurigana: true,
            showTranslations: false,
            reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
        },
        createdAt: now,
        updatedAt: now,
    };
}

export function loadWorldState(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): WorldState {
    try {
        const raw = storage.getItem(WORLD_STORAGE_KEY);
        if (!raw) return defaultWorldState();
        const parsed = JSON.parse(raw) as WorldState;
        if (parsed?.version !== 1) return defaultWorldState();
        return { ...defaultWorldState(), ...parsed, settings: { ...defaultWorldState().settings, ...parsed.settings } };
    } catch {
        return defaultWorldState();
    }
}

export function saveWorldState(state: WorldState, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): void {
    state.updatedAt = new Date().toISOString();
    try {
        storage.setItem(WORLD_STORAGE_KEY, JSON.stringify(state));
    } catch {
        /* storage full/denied: state stays in memory for the session */
    }
}

export function bondRank(points: number): number {
    let rank = 0;
    for (let index = 0; index < BOND_RANK_THRESHOLDS.length; index += 1) {
        if (points >= BOND_RANK_THRESHOLDS[index]) rank = index;
    }
    return rank;
}

export function addBondPoints(state: WorldState, character: string, points: number): { rank: number; rankedUp: boolean } {
    const before = bondRank(state.bonds[character] ?? 0);
    state.bonds[character] = Math.max(0, (state.bonds[character] ?? 0) + points);
    const after = bondRank(state.bonds[character]);
    return { rank: after, rankedUp: after > before };
}

export function isAreaUnlocked(state: WorldState, area: AreaDefinition): boolean {
    if (area.unlockFlag && state.flags[area.unlockFlag]) return true;
    return state.weekIndex >= area.unlockWeek;
}

export function unlockedAreas(state: WorldState): AreaDefinition[] {
    return AREAS.filter(area => isAreaUnlocked(state, area));
}

/** Areas that are visible on the map but still locked (with unlock hint). */
export function lockedVisibleAreas(state: WorldState): AreaDefinition[] {
    return AREAS.filter(
        area =>
            !isAreaUnlocked(state, area) &&
            area.arc === 'london' &&
            Number.isFinite(area.unlockWeek) &&
            area.unlockWeek <= state.weekIndex + 4,
    );
}

/** Spending a slot: day → evening → next day (advances the calendar). */
export function advanceSlot(state: WorldState): void {
    if (state.slot === 'day') {
        state.slot = 'evening';
    } else {
        state.slot = 'day';
        state.weekIndex += 1;
    }
}

export function markSceneSeen(state: WorldState, sceneId: string): boolean {
    if (state.seenScenes.includes(sceneId)) return false;
    state.seenScenes.push(sceneId);
    return true;
}
