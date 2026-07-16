import { gmStorageGetSync, gmStorageSetSync } from '../app/storage';
import { isYomuGrammarRuleId } from './grammar-registry';

export type SharedGrammarKnowledge = 'unknown' | 'learning' | 'known' | 'mastered';

export interface GrammarKnowledgeEntry {
    readonly knowledge: SharedGrammarKnowledge;
    readonly at: number;
    readonly changeId: string;
}

export interface GrammarKnowledgeSnapshot {
    readonly entries: Readonly<Record<string, GrammarKnowledgeEntry>>;
    readonly showKnown: boolean;
}

export interface GrammarPreferences {
    readonly knownRuleIds: string[];
    readonly showKnown: boolean;
}

export interface GrammarKnowledgeChange {
    readonly at?: number;
    readonly changeId?: string;
}

export const GRAMMAR_PREFERENCES_KEY = 'yomu.grammarPreferences.v1';
const KNOWLEDGE_VALUES = new Set<SharedGrammarKnowledge>(['unknown', 'learning', 'known', 'mastered']);

export function readGrammarKnowledge(): GrammarKnowledgeSnapshot {
    return normalizeGrammarKnowledge(gmStorageGetSync<unknown>(GRAMMAR_PREFERENCES_KEY, null));
}

export function readGrammarPreferences(): GrammarPreferences {
    const snapshot = readGrammarKnowledge();
    return {
        knownRuleIds: Object.entries(snapshot.entries)
            .filter(([, entry]) => entry.knowledge === 'known' || entry.knowledge === 'mastered')
            .map(([ruleId]) => ruleId)
            .sort(),
        showKnown: snapshot.showKnown,
    };
}

export function setGrammarRuleKnowledge(
    ruleId: string,
    knowledge: SharedGrammarKnowledge,
    change: GrammarKnowledgeChange = {},
): GrammarKnowledgeSnapshot {
    if (!isYomuGrammarRuleId(ruleId)) throw new TypeError(`Unknown Yomu grammar rule: ${ruleId}`);
    const snapshot = readGrammarKnowledge();
    const previous = snapshot.entries[ruleId];
    if (previous?.knowledge === knowledge && change.at === undefined && change.changeId === undefined) return snapshot;
    const at = validTimestamp(change.at) ? change.at : Date.now();
    const changeId = change.changeId?.trim() || createGrammarChangeId();
    if (previous?.knowledge === knowledge && previous.at === at && previous.changeId === changeId) return snapshot;
    const entry: GrammarKnowledgeEntry = {
        knowledge,
        at,
        changeId,
    };
    const next = { ...snapshot, entries: { ...snapshot.entries, [ruleId]: entry } };
    writeGrammarKnowledge(next);
    return next;
}

export function setGrammarRuleKnown(ruleId: string, known: boolean): GrammarPreferences {
    const snapshot = setGrammarRuleKnowledge(ruleId, known ? 'known' : 'unknown');
    return preferencesFromSnapshot(snapshot);
}

export function setKnownGrammarVisible(showKnown: boolean): GrammarPreferences {
    const snapshot = readGrammarKnowledge();
    const next = { ...snapshot, showKnown };
    writeGrammarKnowledge(next);
    return preferencesFromSnapshot(next);
}

function normalizeGrammarKnowledge(value: unknown): GrammarKnowledgeSnapshot {
    const record = objectRecord(value);
    const entries = record?.version === 2
        ? normalizeEntries(record.entries)
        : migrateLegacyKnownRules(record?.knownRuleIds);
    return {
        entries,
        showKnown: record?.showKnown === true,
    };
}

function normalizeEntries(value: unknown): Readonly<Record<string, GrammarKnowledgeEntry>> {
    const entries = objectRecord(value);
    if (!entries) return {};
    const normalized: Record<string, GrammarKnowledgeEntry> = {};
    for (const [ruleId, candidate] of Object.entries(entries)) {
        const entry = objectRecord(candidate);
        if (!isYomuGrammarRuleId(ruleId)
            || !KNOWLEDGE_VALUES.has(entry?.knowledge as SharedGrammarKnowledge)
            || !validTimestamp(entry?.at)
            || typeof entry?.changeId !== 'string'
            || !entry.changeId.trim()) continue;
        normalized[ruleId] = {
            knowledge: entry.knowledge as SharedGrammarKnowledge,
            at: entry.at as number,
            changeId: entry.changeId.trim(),
        };
    }
    return normalized;
}

function migrateLegacyKnownRules(value: unknown): Readonly<Record<string, GrammarKnowledgeEntry>> {
    if (!Array.isArray(value)) return {};
    return Object.fromEntries(value
        .filter((ruleId): ruleId is string => typeof ruleId === 'string' && isYomuGrammarRuleId(ruleId))
        .map(ruleId => [ruleId, {
            knowledge: 'known' as const,
            at: 0,
            changeId: `grammar-known:legacy:${ruleId}`,
        }]));
}

function writeGrammarKnowledge(snapshot: GrammarKnowledgeSnapshot): void {
    const knownRuleIds = Object.entries(snapshot.entries)
        .filter(([, entry]) => entry.knowledge === 'known' || entry.knowledge === 'mastered')
        .map(([ruleId]) => ruleId)
        .sort();
    gmStorageSetSync(GRAMMAR_PREFERENCES_KEY, {
        version: 2,
        entries: snapshot.entries,
        // Older Yomu builds can still read the authoritative map's boolean projection.
        knownRuleIds,
        showKnown: snapshot.showKnown,
    });
}

function preferencesFromSnapshot(snapshot: GrammarKnowledgeSnapshot): GrammarPreferences {
    return {
        knownRuleIds: Object.entries(snapshot.entries)
            .filter(([, entry]) => entry.knowledge === 'known' || entry.knowledge === 'mastered')
            .map(([ruleId]) => ruleId)
            .sort(),
        showKnown: snapshot.showKnown,
    };
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function validTimestamp(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0;
}

function createGrammarChangeId(): string {
    const uuid = globalThis.crypto?.randomUUID?.();
    return uuid ? `grammar-known:${uuid}` : `grammar-known:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
