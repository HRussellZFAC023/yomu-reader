import { gmStorageGetSync, gmStorageSetSync } from '../app/storage';
import { JAPANESE_GRAMMAR } from '../languages/japanese-grammar';
import { languageSubtag } from '../languages/locale';
import type { LearningTargetModule } from '../languages/types';
import { JAPANESE_LEARNING_TARGET } from '../languages/japanese';

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

/** Japanese compatibility Interface used by Academy and older Reader builds. */
export function readGrammarKnowledge(): GrammarKnowledgeSnapshot {
    return readTargetGrammarKnowledge(JAPANESE_LEARNING_TARGET);
}

/** Japanese compatibility Interface used by Academy and older Reader builds. */
export function readGrammarPreferences(): GrammarPreferences {
    return readTargetGrammarPreferences(JAPANESE_LEARNING_TARGET);
}

/** Japanese compatibility Interface used by Academy and older Reader builds. */
export function setGrammarRuleKnowledge(
    ruleId: string,
    knowledge: SharedGrammarKnowledge,
    change: GrammarKnowledgeChange = {},
): GrammarKnowledgeSnapshot {
    return setTargetGrammarRuleKnowledge(JAPANESE_LEARNING_TARGET, ruleId, knowledge, change);
}

/** Japanese compatibility Interface used by Academy and older Reader builds. */
export function setGrammarRuleKnown(ruleId: string, known: boolean): GrammarPreferences {
    return setTargetGrammarRuleKnown(JAPANESE_LEARNING_TARGET, ruleId, known);
}

/** Japanese compatibility Interface used by Academy and older Reader builds. */
export function setKnownGrammarVisible(showKnown: boolean): GrammarPreferences {
    return setTargetKnownGrammarVisible(JAPANESE_LEARNING_TARGET, showKnown);
}

export function readTargetGrammarKnowledge(target: LearningTargetModule): GrammarKnowledgeSnapshot {
    return normalizeGrammarKnowledge(
        gmStorageGetSync<unknown>(grammarPreferencesKey(target), null),
        target,
    );
}

export function readTargetGrammarPreferences(target: LearningTargetModule): GrammarPreferences {
    return preferencesFromSnapshot(readTargetGrammarKnowledge(target));
}

export function setTargetGrammarRuleKnowledge(
    target: LearningTargetModule,
    ruleId: string,
    knowledge: SharedGrammarKnowledge,
    change: GrammarKnowledgeChange = {},
): GrammarKnowledgeSnapshot {
    if (!targetHasGrammarRule(target, ruleId)) {
        throw new TypeError(`Unknown ${target.language} grammar rule: ${ruleId}`);
    }
    const snapshot = readTargetGrammarKnowledge(target);
    const previous = snapshot.entries[ruleId];
    if (previous?.knowledge === knowledge && change.at === undefined && change.changeId === undefined) return snapshot;
    const at = validTimestamp(change.at) ? change.at : Date.now();
    const changeId = change.changeId?.trim() || createGrammarChangeId();
    if (previous?.knowledge === knowledge && previous.at === at && previous.changeId === changeId) return snapshot;
    const entry: GrammarKnowledgeEntry = { knowledge, at, changeId };
    const next = { ...snapshot, entries: { ...snapshot.entries, [ruleId]: entry } };
    writeTargetGrammarKnowledge(target, next);
    return next;
}

export function setTargetGrammarRuleKnown(
    target: LearningTargetModule,
    ruleId: string,
    known: boolean,
): GrammarPreferences {
    return preferencesFromSnapshot(setTargetGrammarRuleKnowledge(
        target,
        ruleId,
        known ? 'known' : 'unknown',
    ));
}

export function setTargetKnownGrammarVisible(
    target: LearningTargetModule,
    showKnown: boolean,
): GrammarPreferences {
    const snapshot = readTargetGrammarKnowledge(target);
    const next = { ...snapshot, showKnown };
    writeTargetGrammarKnowledge(target, next);
    return preferencesFromSnapshot(next);
}

function grammarPreferencesKey(target: LearningTargetModule): string {
    // Japanese keeps the byte-for-byte v1 key so Academy reconciliation and a
    // downgrade both see the same facts. Every other target gets its own store.
    if (target.grammar === JAPANESE_GRAMMAR) return GRAMMAR_PREFERENCES_KEY;
    const targetId = languageSubtag(target.language) ?? encodeURIComponent(target.id);
    return `${GRAMMAR_PREFERENCES_KEY}:${targetId}`;
}

function normalizeGrammarKnowledge(
    value: unknown,
    target: LearningTargetModule,
): GrammarKnowledgeSnapshot {
    const record = objectRecord(value);
    const entries = record?.version === 2
        ? normalizeEntries(record.entries, target)
        : migrateLegacyKnownRules(record?.knownRuleIds, target);
    return {
        entries,
        showKnown: record?.showKnown === true,
    };
}

function normalizeEntries(
    value: unknown,
    target: LearningTargetModule,
): Readonly<Record<string, GrammarKnowledgeEntry>> {
    const entries = objectRecord(value);
    if (!entries) return {};
    const normalized: Record<string, GrammarKnowledgeEntry> = {};
    for (const [ruleId, candidate] of Object.entries(entries)) {
        const entry = objectRecord(candidate);
        if (!targetHasGrammarRule(target, ruleId)
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

function migrateLegacyKnownRules(
    value: unknown,
    target: LearningTargetModule,
): Readonly<Record<string, GrammarKnowledgeEntry>> {
    if (!Array.isArray(value)) return {};
    return Object.fromEntries(value
        .filter((ruleId): ruleId is string => (
            typeof ruleId === 'string' && targetHasGrammarRule(target, ruleId)
        ))
        .map(ruleId => [ruleId, {
            knowledge: 'known' as const,
            at: 0,
            changeId: `grammar-known:legacy:${ruleId}`,
        }]));
}

function writeTargetGrammarKnowledge(
    target: LearningTargetModule,
    snapshot: GrammarKnowledgeSnapshot,
): void {
    const knownRuleIds = Object.entries(snapshot.entries)
        .filter(([, entry]) => entry.knowledge === 'known' || entry.knowledge === 'mastered')
        .map(([ruleId]) => ruleId)
        .sort();
    gmStorageSetSync(grammarPreferencesKey(target), {
        version: 2,
        entries: snapshot.entries,
        // Older target-aware builds can still read the authoritative map's
        // boolean projection. For Japanese this is also the old Reader format.
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

function targetHasGrammarRule(target: LearningTargetModule, ruleId: string): boolean {
    return target.grammar.rules.some(rule => rule.ruleId === ruleId);
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
