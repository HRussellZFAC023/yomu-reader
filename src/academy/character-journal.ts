import { ACADEMY_CAST, type CastMember } from './cast';

export const CHARACTER_JOURNAL_STORAGE_KEY = 'yomu:academy:character-journal:v1';

export interface JournalLine {
    speakerId: string;
    japanese: string;
    meaning?: string;
    expression?: string;
}

export interface JournalScene {
    id: string;
    lessonId: string;
    title: string;
    location: string;
    lines: readonly JournalLine[];
}

export interface CharacterJournalEntry {
    characterId: string;
    unlockedAt: number;
    firstSceneId: string;
    sceneIds: string[];
    bond: number;
}

export interface CharacterJournalSnapshot {
    version: 1;
    entries: CharacterJournalEntry[];
    scenes: JournalScene[];
}

export interface CharacterUnlock {
    character: CastMember;
    entry: CharacterJournalEntry;
}

export interface CharacterJournal {
    snapshot(): CharacterJournalSnapshot;
    unlocked(): readonly CastMember[];
    entry(characterId: string): CharacterJournalEntry | undefined;
    replay(sceneId: string): JournalScene | undefined;
    recordScene(scene: JournalScene): readonly CharacterUnlock[];
    addBond(characterId: string, amount?: number): CharacterJournalEntry | undefined;
}

export interface CharacterJournalOptions {
    storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
    now?: () => number;
}

const CAST_BY_ID = new Map(ACADEMY_CAST.map(character => [character.id, character]));
const CAST_ID_BY_NAME = new Map(ACADEMY_CAST.flatMap(character => {
    const names = [character.id, character.name, character.kana];
    if (character.id === 'rie') names.push('Rie-sensei', 'Rie sensei', 'りえ先生');
    if (character.id === 'shin') names.push('Xin');
    return names.map(name => [normalizeSpeaker(name), character.id] as const);
}));

export function createCharacterJournal(options: CharacterJournalOptions = {}): CharacterJournal {
    const storage = options.storage === undefined ? availableStorage() : options.storage;
    const now = options.now ?? (() => Date.now());
    let state = readSnapshot(storage);

    const persist = (): void => {
        try { storage?.setItem(CHARACTER_JOURNAL_STORAGE_KEY, JSON.stringify(state)); } catch { /* best effort */ }
    };

    const recordScene = (scene: JournalScene): readonly CharacterUnlock[] => {
        const normalized = normalizeScene(scene);
        if (!normalized) return [];
        const existingSceneIndex = state.scenes.findIndex(candidate => candidate.id === normalized.id);
        if (existingSceneIndex >= 0) state.scenes[existingSceneIndex] = normalized;
        else state.scenes.push(normalized);

        const unlocks: CharacterUnlock[] = [];
        for (const characterId of unique(normalized.lines.map(line => line.speakerId))) {
            const character = CAST_BY_ID.get(characterId);
            if (!character) continue;
            const existing = state.entries.find(entry => entry.characterId === characterId);
            if (existing) {
                if (!existing.sceneIds.includes(normalized.id)) existing.sceneIds.push(normalized.id);
                continue;
            }
            const entry: CharacterJournalEntry = {
                characterId,
                unlockedAt: safeTime(now()),
                firstSceneId: normalized.id,
                sceneIds: [normalized.id],
                bond: character.kind === 'sensei' ? 1 : 0,
            };
            state.entries.push(entry);
            unlocks.push({ character, entry: clone(entry) });
        }
        sortState(state);
        persist();
        return unlocks;
    };

    return {
        snapshot: () => clone(state),
        unlocked: () => state.entries.flatMap(entry => CAST_BY_ID.get(entry.characterId) ?? []),
        entry: characterId => cloneOptional(state.entries.find(entry => entry.characterId === characterId)),
        replay: sceneId => cloneOptional(state.scenes.find(scene => scene.id === sceneId)),
        recordScene,
        addBond: (characterId, amount = 1) => {
            const entry = state.entries.find(candidate => candidate.characterId === characterId);
            if (!entry || !Number.isFinite(amount)) return undefined;
            entry.bond = Math.max(0, Math.min(5, entry.bond + Math.trunc(amount)));
            persist();
            return clone(entry);
        },
    };
}

export function speakerId(value: string): string | undefined {
    return CAST_ID_BY_NAME.get(normalizeSpeaker(value));
}

export function sceneForJournal(input: {
    id: string;
    lessonId: string;
    title: string;
    location: string;
    lines: readonly { speaker: string; japanese: string; meaning?: string; expression?: string }[];
}): JournalScene {
    return {
        id: input.id,
        lessonId: input.lessonId,
        title: input.title,
        location: input.location,
        lines: input.lines.flatMap(line => {
            const id = speakerId(line.speaker);
            if (!id || !line.japanese.trim()) return [];
            return [{
                speakerId: id,
                japanese: line.japanese.trim(),
                ...(line.meaning?.trim() ? { meaning: line.meaning.trim() } : {}),
                ...(line.expression?.trim() ? { expression: line.expression.trim() } : {}),
            }];
        }),
    };
}

function normalizeScene(scene: JournalScene): JournalScene | null {
    const id = scene.id.trim();
    const lessonId = scene.lessonId.trim();
    const title = scene.title.trim();
    if (!id || !lessonId || !title) return null;
    const lines = scene.lines.flatMap(line => {
        const speaker = CAST_BY_ID.has(line.speakerId) ? line.speakerId : speakerId(line.speakerId);
        const japanese = line.japanese.trim();
        if (!speaker || !japanese) return [];
        return [{
            speakerId: speaker,
            japanese,
            ...(line.meaning?.trim() ? { meaning: line.meaning.trim() } : {}),
            ...(line.expression?.trim() ? { expression: line.expression.trim() } : {}),
        }];
    });
    return { id, lessonId, title, location: scene.location.trim(), lines };
}

function readSnapshot(storage: CharacterJournalOptions['storage']): CharacterJournalSnapshot {
    try {
        const raw = storage?.getItem(CHARACTER_JOURNAL_STORAGE_KEY);
        if (!raw) return emptySnapshot();
        const parsed = JSON.parse(raw) as Partial<CharacterJournalSnapshot>;
        if (parsed.version !== 1 || !Array.isArray(parsed.entries) || !Array.isArray(parsed.scenes)) return emptySnapshot();
        const snapshot: CharacterJournalSnapshot = {
            version: 1,
            entries: parsed.entries.flatMap(normalizeEntry),
            scenes: parsed.scenes.flatMap(scene => normalizeScene(scene) ?? []),
        };
        sortState(snapshot);
        return snapshot;
    } catch {
        return emptySnapshot();
    }
}

function normalizeEntry(value: CharacterJournalEntry): CharacterJournalEntry[] {
    if (!value || !CAST_BY_ID.has(value.characterId) || !value.firstSceneId?.trim()) return [];
    return [{
        characterId: value.characterId,
        unlockedAt: safeTime(value.unlockedAt),
        firstSceneId: value.firstSceneId.trim(),
        sceneIds: unique(Array.isArray(value.sceneIds) ? value.sceneIds.map(String).filter(Boolean) : [value.firstSceneId]),
        bond: Math.max(0, Math.min(5, Number.isFinite(value.bond) ? Math.trunc(value.bond) : 0)),
    }];
}

function sortState(state: CharacterJournalSnapshot): void {
    state.entries.sort((left, right) => left.unlockedAt - right.unlockedAt || left.characterId.localeCompare(right.characterId));
    state.scenes.sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeSpeaker(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s._-]+/g, '').replace(/さん|先生/g, '');
}

function availableStorage(): Storage | null {
    try { return globalThis.localStorage ?? null; } catch { return null; }
}

function emptySnapshot(): CharacterJournalSnapshot {
    return { version: 1, entries: [], scenes: [] };
}

function safeTime(value: number): number {
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function cloneOptional<T>(value: T | undefined): T | undefined {
    return value === undefined ? undefined : clone(value);
}
