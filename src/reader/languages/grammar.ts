import type {
    LearningTargetGrammar,
    LearningTargetGrammarConfidence,
    LearningTargetGrammarLevelScale,
    LearningTargetGrammarMatch,
    LearningTargetGrammarRule,
} from './types';

export interface LearningTargetGrammarRuleSpec extends LearningTargetGrammarRule {
    readonly patternSource: string;
    readonly priority: number;
    readonly confidence: LearningTargetGrammarConfidence;
    /** Hosted explanatory copy is opt-in; most target rules have local metadata only. */
    readonly ruleCopyId?: string;
}

export interface LearningTargetGrammarMatchContext {
    readonly rawMatch: string;
    readonly before: string;
    readonly following: string;
}

export interface RankedLearningTargetGrammarMatch extends LearningTargetGrammarMatch {
    readonly priority: number;
}

export interface LearningTargetGrammarSpec {
    readonly levelScale?: LearningTargetGrammarLevelScale;
    readonly rules?: readonly LearningTargetGrammarRuleSpec[];
    readonly referenceUrl?: string;
    readonly normalizeSentence?: (sentence: string) => string;
    readonly expandPatternSource?: (source: string) => string;
    readonly shouldSkipMatch?: (
        rule: LearningTargetGrammarRuleSpec,
        context: LearningTargetGrammarMatchContext,
    ) => boolean;
    readonly learnerFacingMatch?: (rule: LearningTargetGrammarRuleSpec, rawMatch: string) => string;
    readonly ruleCopyIdFor?: (rule: LearningTargetGrammarRuleSpec) => string | null;
    /** Target-specific exception to the generic overlap rules. */
    readonly keepOverlappingMatches?: (
        existing: RankedLearningTargetGrammarMatch,
        next: RankedLearningTargetGrammarMatch,
    ) => boolean;
}

interface CompiledGrammarRule {
    readonly spec: LearningTargetGrammarRuleSpec;
    readonly pattern: RegExp;
}

const MAX_GRAMMAR_HINTS = 12;
const MAX_OCCURRENCES_PER_RULE = 2;
const GRAMMAR_CACHE_LIMIT = 240;

/**
 * Builds a deep, in-process grammar Module. Callers get metadata plus one
 * detector; regex compilation, ranking, false-positive guards, overlap rules,
 * normalization, and caching remain inside the Implementation.
 */
export function createLearningTargetGrammar(spec: LearningTargetGrammarSpec = {}): LearningTargetGrammar {
    const ruleSpecs = [...(spec.rules ?? [])];
    const levelScale = normalizedLevelScale(spec.levelScale, ruleSpecs);
    const compiled = compileGrammarRules(ruleSpecs, levelScale, spec.expandPatternSource);
    const rules = Object.freeze(compiled.map(({ spec: rule }) => Object.freeze({
        ruleId: rule.ruleId,
        level: rule.level,
        name: rule.name,
        url: rule.url,
    })));
    const normalizeSentence = spec.normalizeSentence ?? defaultNormalizeGrammarSentence;
    const cache = new Map<string, readonly LearningTargetGrammarMatch[]>();
    const copyIds = new Map(ruleSpecs.flatMap(rule => {
        const copyId = spec.ruleCopyIdFor?.(rule) ?? rule.ruleCopyId;
        return copyId ? [[rule.ruleId, copyId] as const] : [];
    }));

    return Object.freeze({
        levelScale,
        rules,
        referenceUrl: spec.referenceUrl?.trim() ?? '',
        detect(sentence: string): readonly LearningTargetGrammarMatch[] {
            const normalized = normalizeSentence(sentence);
            if (!normalized) return [];
            const cached = cache.get(normalized);
            if (cached) return cached;

            const selected = selectGrammarMatches(compiled, normalized, spec);
            const matches = Object.freeze(selected
                .sort(compareGrammarMatches)
                .map(({ priority: _priority, ...match }) => Object.freeze(match)));
            cache.set(normalized, matches);
            if (cache.size > GRAMMAR_CACHE_LIMIT) {
                const oldest = cache.keys().next().value;
                if (typeof oldest === 'string') cache.delete(oldest);
            }
            return matches;
        },
        ruleCopyId(ruleId: string): string | null {
            return copyIds.get(ruleId) ?? null;
        },
    });
}

function normalizedLevelScale(
    value: LearningTargetGrammarLevelScale | undefined,
    rules: readonly LearningTargetGrammarRuleSpec[],
): LearningTargetGrammarLevelScale | null {
    if (!value) {
        if (rules.length) throw new TypeError('Grammar rules require a target-owned level scale.');
        return null;
    }
    const id = value.id.trim();
    const levels = value.levels.map(level => level.trim()).filter(Boolean);
    if (!id || !levels.length || new Set(levels).size !== levels.length) {
        throw new TypeError('Grammar level scales require a stable id and unique level names.');
    }
    return Object.freeze({ id, levels: Object.freeze(levels) });
}

function compileGrammarRules(
    rules: readonly LearningTargetGrammarRuleSpec[],
    levelScale: LearningTargetGrammarLevelScale | null,
    expandPatternSource: LearningTargetGrammarSpec['expandPatternSource'],
): readonly CompiledGrammarRule[] {
    const ids = new Set<string>();
    const levels = new Set(levelScale?.levels ?? []);
    return Object.freeze(rules.map(rule => {
        if (!rule.ruleId.trim() || !rule.name.trim() || !rule.patternSource || !Number.isFinite(rule.priority)) {
            throw new TypeError(`Invalid grammar rule: ${rule.ruleId || '(missing id)'}`);
        }
        if (ids.has(rule.ruleId)) throw new TypeError(`Duplicate grammar rule id: ${rule.ruleId}`);
        if (!levels.has(rule.level)) {
            throw new TypeError(`Grammar rule ${rule.ruleId} uses ${rule.level}, outside the ${levelScale?.id ?? 'missing'} scale.`);
        }
        ids.add(rule.ruleId);
        const source = expandPatternSource?.(rule.patternSource) ?? rule.patternSource;
        return Object.freeze({ spec: rule, pattern: new RegExp(source, 'gu') });
    }));
}

function defaultNormalizeGrammarSentence(sentence: string): string {
    return sentence.normalize('NFKC');
}

function selectGrammarMatches(
    rules: readonly CompiledGrammarRule[],
    sentence: string,
    spec: LearningTargetGrammarSpec,
): RankedLearningTargetGrammarMatch[] {
    const seenMatches = new Set<string>();
    const seenRuleCounts = new Map<string, number>();
    const selected: RankedLearningTargetGrammarMatch[] = [];
    const ranked = rules
        .flatMap(rule => grammarMatches(rule, sentence, spec))
        .sort(compareRankedGrammarMatches);

    for (const item of ranked) {
        const key = `${item.ruleId}:${item.match}:${item.index}`;
        if (seenMatches.has(key)) continue;
        const count = seenRuleCounts.get(item.ruleId) ?? 0;
        if (count >= MAX_OCCURRENCES_PER_RULE) continue;
        if (selected.some(existing => shouldSuppressOverlappingMatch(existing, item, spec))) continue;
        seenMatches.add(key);
        seenRuleCounts.set(item.ruleId, count + 1);
        selected.push(item);
        if (selected.length >= MAX_GRAMMAR_HINTS) break;
    }
    return selected;
}

function grammarMatches(
    rule: CompiledGrammarRule,
    sentence: string,
    detector: LearningTargetGrammarSpec,
): RankedLearningTargetGrammarMatch[] {
    return Array.from(sentence.matchAll(rule.pattern))
        .filter(match => !detector.shouldSkipMatch?.(rule.spec, grammarMatchContext(sentence, match)))
        .map(match => rankedGrammarMatch(rule.spec, match, detector.learnerFacingMatch))
        .filter((match): match is RankedLearningTargetGrammarMatch => Boolean(match));
}

function rankedGrammarMatch(
    rule: LearningTargetGrammarRuleSpec,
    match: RegExpMatchArray,
    learnerFacingMatch: LearningTargetGrammarSpec['learnerFacingMatch'],
): RankedLearningTargetGrammarMatch | null {
    const rawMatch = match[0];
    const learnerMatch = learnerFacingMatch?.(rule, rawMatch) ?? rawMatch;
    if (!learnerMatch) return null;
    const learnerOffset = rawMatch.lastIndexOf(learnerMatch);
    const indexOffset = learnerOffset > 0 ? learnerOffset : 0;
    return {
        ruleId: rule.ruleId,
        name: rule.name,
        level: rule.level,
        match: learnerMatch,
        confidence: rule.confidence,
        index: (match.index ?? 0) + indexOffset,
        url: rule.url,
        priority: rule.priority,
    };
}

function grammarMatchContext(sentence: string, match: RegExpMatchArray): LearningTargetGrammarMatchContext {
    const rawMatch = match[0];
    const start = match.index ?? 0;
    const end = start + rawMatch.length;
    return {
        rawMatch,
        before: sentence.slice(Math.max(0, start - 4), start),
        following: sentence.slice(end, end + 6),
    };
}

function compareRankedGrammarMatches(
    a: RankedLearningTargetGrammarMatch,
    b: RankedLearningTargetGrammarMatch,
): number {
    return a.priority - b.priority
        || a.index - b.index
        || b.match.length - a.match.length
        || a.name.localeCompare(b.name);
}

function compareGrammarMatches(a: LearningTargetGrammarMatch, b: LearningTargetGrammarMatch): number {
    return a.index - b.index || a.name.localeCompare(b.name);
}

function shouldSuppressOverlappingMatch(
    existing: RankedLearningTargetGrammarMatch,
    next: RankedLearningTargetGrammarMatch,
    spec: LearningTargetGrammarSpec,
): boolean {
    if (!grammarMatchRangesOverlap(existing, next)) return false;
    if (existing.match === next.match && existing.index === next.index) return true;
    if (spec.keepOverlappingMatches?.(existing, next)) return false;
    if (existing.priority < 40 && next.priority < 40) return false;
    return (next.priority >= 40 && existing.priority < next.priority)
        || (
            grammarMatchContains(existing, next)
            && existing.priority <= next.priority
            && existing.match.length > next.match.length
        );
}

function grammarMatchRangesOverlap(a: LearningTargetGrammarMatch, b: LearningTargetGrammarMatch): boolean {
    const aEnd = a.index + a.match.length;
    const bEnd = b.index + b.match.length;
    return a.index < bEnd && b.index < aEnd;
}

function grammarMatchContains(outer: LearningTargetGrammarMatch, inner: LearningTargetGrammarMatch): boolean {
    return inner.index >= outer.index
        && inner.index + inner.match.length <= outer.index + outer.match.length;
}

export const EMPTY_LEARNING_TARGET_GRAMMAR = createLearningTargetGrammar();
