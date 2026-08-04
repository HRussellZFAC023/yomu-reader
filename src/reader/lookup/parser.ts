import { JpdbClient } from '../jpdb/jpdb';
import { ConcurrencyGate, mapLimited } from '../core/async-utils';
import {
    JAPANESE_SCRIPT_GROUP_RE,
    bareFallbackCardFromText,
    normalizeFallbackTerm,
} from './japanese-segments';
import { segmentTargetLanguageText } from './target-text';
import {
    TermSpanResolver,
    type ConfirmedTermSpan,
    type FallbackTermSpan,
    type TermSpanAdmitContext,
    type TermSpanCandidateLookup,
    type TermSpanLookupCandidate,
    type TermSpanPreconfirmCandidate,
} from './term-span-resolver';
import { activeLearningTarget, activeLearningTargetGeneration } from '../languages';
import type { LearningTargetModule } from '../languages/types';
import { splitReadingAcrossKanji } from './kanji-ruby-split';
import { getPitchClass } from '../jpdb/jpdb-parser';
import { inferredInflectedSurfaceRubies, nonOverlappingTokens } from '../dom';
import { Logger } from '../app/logger';
import { localPitchResolutionFromMetaLookup, type LocalPitchResolution } from './pitch-meta';
import { stablePositiveHashId } from '../core/stable-hash';
import { hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import type { JitenApiClient } from '../dictionaries/jiten';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../app/types';
import { glossaryToText, type YomitanDictionaryStore, type YomitanMetaEntry, type YomitanTermEntry, type YomitanTermMatch } from '../dictionaries/yomitan';
import { hydrateYomuLocalSrsCardStates } from '../srs/local-yomu-state';
import type { YomuSrsAdapter } from '../srs/types';
import {
    HALFWIDTH_KATAKANA,
    ITERATION_MARK,
    KANA,
    KANJI_PATTERN,
    KATAKANA_MIDDLE_DOT,
    PROLONGED_SOUND_MARK,
    READING_KANA_ONLY_RE as LOCAL_RUBY_SPLIT_READING_RE,
} from './japanese-script';

export { fallbackJapaneseSegments, fallbackLookupTermsForText, fallbackDictionaryLookupTermsForText, fallbackLookupTermsForCard } from './japanese-segments';

const LOCAL_MATCH_LIMIT = 40;
// Cap concurrent IndexedDB-backed enrichment (pitch meta + per-kanji readings)
// ACROSS all in-flight cue parses. Keyless YouTube warmup parses several cues
// at once, each fanning out over up to LOCAL_MATCH_LIMIT matches; without a
// shared gate that was thousands of concurrent IndexedDB requests at cold
// start, starving the main thread so cues rendered late / half-enriched.
const LOCAL_ENRICHMENT_CONCURRENCY = 12;
const LOCAL_PARSE_CACHE_LIMIT = 600;
const LOCAL_PITCH_CACHE_LIMIT = 800;
const JPDB_PARSE_FALLBACK_TIMEOUT_MS = 6_000;
// Hard ceiling for a SINGLE paragraph's local (IndexedDB-backed) parse. The
// remote JPDB/Jiten calls are already time-bounded, but the local path — term
// lookup plus pitch/ruby enrichment — was not. On iPad WebKit an IndexedDB
// request can silently never fire onsuccess/onerror, which would leave the
// parse promise pending forever and strand every caller (study translation,
// hover lookups, body decoration) on a loading placeholder. This bounds it so
// a stalled request degrades to the synchronous segmented parse instead of
// hanging. Sized well above any legitimate single-paragraph parse so it only
// ever fires on a genuine stall, never on a merely slow device.
const LOCAL_PARSE_TIMEOUT_MS = 8_000;
const YOUTUBE_VIEW_METRIC_RE = /回視聴/gu;
// Jiten's /parse endpoint is for batched LINES; a tiny per-word or per-refresh
// parse would spam jiten.moe (and short text parses worse remotely). Route
// batches shorter than this many Japanese characters to the local parser
// instead — only when local term dictionaries exist, so Jiten-only users are
// unaffected.
const JITEN_MIN_BATCH_CHARS = 24;
const JAPANESE_CHAR_COUNT_RE = new RegExp(
    `(?:[${KANA}${ITERATION_MARK}${HALFWIDTH_KATAKANA}]|${KANJI_PATTERN})`,
    'gu',
);
function japaneseBatchCharCount(paragraphs: string[]): number {
    return paragraphs.reduce((total, text) => total + (text.match(JAPANESE_CHAR_COUNT_RE)?.length ?? 0), 0);
}
const LOCAL_RUBY_SPLIT_BASE_RE = new RegExp(
    `^(?:[${KANA}${ITERATION_MARK}${PROLONGED_SOUND_MARK}${KATAKANA_MIDDLE_DOT}]|${KANJI_PATTERN})+$`,
    'u',
);
const LOCAL_RUBY_SPLIT_KANJI_RE = new RegExp(`(?:${KANJI_PATTERN}|[${ITERATION_MARK}])`, 'u');
const LOCAL_RUBY_SPLIT_KANJI_CHAR_RE = new RegExp(`^(?:${KANJI_PATTERN}|[${ITERATION_MARK}])$`, 'u');
const log = Logger.scope('ReaderParser');

export interface ReaderParserParseOptions {
    apiTimeoutMs?: number;
    allowApiTimeoutFallback?: boolean;
    jpdbTimeoutMs?: number;
    allowJpdbTimeoutFallback?: boolean;
    includeLocalPitch?: boolean;
    skipApi?: boolean;
    skipJpdb?: boolean;
    requireApi?: boolean;
    requireJpdb?: boolean;
    allowSegmentedFallback?: boolean;
    publicJitenDetailLimit?: number;
}

export interface ReaderParserDependencies {
    getSettings: () => ReaderSettings;
    jpdb: JpdbClient;
    jiten?: JitenApiClient;
    jitenPublicVocabulary?: {
        parse: (paragraphs: readonly string[], options?: { detailLimit?: number }) => Promise<JPDBToken[][]>;
        lookupMany?: (terms: readonly string[], options?: { detailLimit?: number }) => Promise<Map<string, JPDBCard>>;
    };
    dictionaries: YomitanDictionaryStore;
    yomuLocalSrs?: Pick<YomuSrsAdapter, 'lookupCards'>;
}

function apiFirstParseOptions(options: ReaderParserParseOptions = {}): ReaderParserParseOptions {
    const requireApi = options.requireApi ?? options.requireJpdb ?? true;
    return { includeLocalPitch: false, ...options, requireApi };
}

export function jpdbFirstParseOptions(options: ReaderParserParseOptions = {}): ReaderParserParseOptions {
    const requireApi = options.requireApi ?? options.requireJpdb ?? true;
    const requireJpdb = options.requireJpdb ?? requireApi;
    return apiFirstParseOptions({ ...options, requireApi, requireJpdb });
}

export class ReaderParser {
    private localCardCache = new Map<string, JPDBCard>();
    // getCachedCard is intentionally keyed by the legacy DOM identity
    // (vid, sid). Evidence reuse needs a stricter identity: unrelated
    // providers and learning languages may legally mint the same numeric
    // pair, and must never donate reading/pitch/state to each other.
    private localCardEvidenceCache = new Map<string, JPDBCard>();
    private localParseCache = new Map<string, Promise<JPDBToken[]>>();
    private localPitchCache = new Map<string, Promise<LocalPitchResolution>>();
    private localTermDictionaryAvailability?: Promise<boolean | undefined>;
    private readonly enrichmentGate = new ConcurrencyGate(LOCAL_ENRICHMENT_CONCURRENCY);
    private kanjiReadingCache = new Map<string, Promise<string[]>>();

    constructor(private dependencies: ReaderParserDependencies) {}

    async parse(paragraphs: string[], options: ReaderParserParseOptions = {}): Promise<JPDBToken[][]> {
        const { getSettings } = this.dependencies;
        const settings = getSettings();
        const target = activeLearningTarget();
        const targetGeneration = activeLearningTargetGeneration();
        const done = log.time('parse', {
            paragraphs: paragraphs.length,
            hasApiKey: hasJpdbApiCredential(settings),
            hasJitenApiKey: hasJitenApiCredential(settings),
            localFallback: settings.localDictionariesEnabled,
        });
        try {
            const parsed = await this.parseWithPreferredSource(paragraphs, options, settings, target);
            if (!isCurrentLearningTarget(target, targetGeneration)) return emptyParseResult(paragraphs);
            const authoritative = await this.withAuthoritativeTermSpans(paragraphs, parsed, options, target);
            if (!isCurrentLearningTarget(target, targetGeneration)) return emptyParseResult(paragraphs);
            // Public/detail enrichment and page scanning can overlap. Once a
            // card has acquired a real reading or pitch pattern, a later
            // sparse parse of the same provider id must not replace that
            // stronger evidence while a recycled surface is repainted. The
            // click path resolves the same canonical id, so letting an empty
            // parse record win here produced the visible "pitch disappears,
            // but returns when pressed" split.
            const evidenceReconciled = this.withCachedCardEvidence(paragraphs, authoritative);
            const rubyAligned = await this.reconcileLocalParse(paragraphs, evidenceReconciled, options, target);
            if (!isCurrentLearningTarget(target, targetGeneration)) return emptyParseResult(paragraphs);
            const normalized = this.withNormalizedMetricParseResult(paragraphs, rubyAligned);
            if (!settings.yomuLocalSrsEnabled || !this.dependencies.yomuLocalSrs) return normalized;
            try {
                // The last IndexedDB read in the pipeline (SRS lookupCards); it
                // must be bounded too, or a stalled request would re-hang parse()
                // one line below the fix. A stall/failure keeps provider states.
                const hydrated = await withTimeout(
                    hydrateYomuLocalSrsCardStates(normalized, this.dependencies.yomuLocalSrs),
                    LOCAL_PARSE_TIMEOUT_MS,
                    () => new Error('Academy SRS state hydration timed out.'),
                );
                return isCurrentLearningTarget(target, targetGeneration) ? hydrated : emptyParseResult(paragraphs);
            } catch (error) {
                log.warn('Academy SRS state hydration failed; keeping provider states', error);
                return isCurrentLearningTarget(target, targetGeneration)
                    ? normalized
                    : emptyParseResult(paragraphs);
            }
        } finally {
            done();
        }
    }

    /**
     * Resolve the authoritative token underneath one source offset through the
     * exact same span pipeline used for passive annotation.
     */
    async lookupTokenAt(
        text: string,
        offset: number,
        range: { start: number; end: number } = { start: 0, end: text.length },
        options: ReaderParserParseOptions = {},
    ): Promise<JPDBToken | undefined> {
        const [tokens] = await this.parse([text], { ...options, allowSegmentedFallback: true });
        return pickAuthoritativeTokenAt(tokens ?? [], text, offset, range);
    }

    private async withAuthoritativeTermSpans(
        paragraphs: string[],
        parsed: JPDBToken[][],
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<JPDBToken[][]> {
        const sources = await this.authoritativeSpanSources(paragraphs, options, target);
        const lookup = new BatchedParserSpanLookup(requests => (
            this.authoritativeSpanConfirmations(requests, sources, options, target)
        ));
        const resolved = await Promise.all(paragraphs.map((text, index) => (
            this.authoritativeTermSpans(text, parsed[index] ?? [], options, target, lookup)
        )));
        return resolved.every((tokens, index) => tokens === parsed[index]) ? parsed : resolved;
    }

    private async authoritativeTermSpans(
        text: string,
        decorations: JPDBToken[],
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
        lookup: TermSpanCandidateLookup<ParserSpanMatch>,
    ): Promise<JPDBToken[]> {
        const fallbackSegments = target.segment(text);
        const fallback = options.allowSegmentedFallback === true ? {
            spanAt: (request: { text: string; start: number; end: number }) => {
                const segment = fallbackSegments.find(item => item.start <= request.start && request.start < item.end);
                if (!segment) return null;
                const end = Math.min(segment.end, request.end);
                if (end <= request.start) return null;
                const surface = text.slice(request.start, end);
                if (!target.isLookupableText(surface)) return null;
                return {
                    start: request.start,
                    end,
                    value: this.fallbackCardFromText(surface, target),
                };
            },
        } : undefined;
        const resolver = new TermSpanResolver<ParserSpanMatch, JPDBCard>({
            target,
            maximumSourceLength: 18,
            lookup,
            fallback,
            preconfirm: decorationAlignedSpanConfirmation(text, decorations, target),
            // A span containing a standalone case particle can never be one
            // word — never plan it, so the dictionary is not even asked. The
            // same tell later vetoes glued confirmations that got in another
            // way (a provider echoing a whole clause back as one token).
            plan: candidate => !segmentsContainInternalParticle(text, fallbackSegments, candidate.start, candidate.end),
            admit: rejectUntrustworthySpanShapes(text, fallbackSegments, target),
        });
        const spans = (await Promise.all(target.pointerWordSegments(text).map(run => (
            resolver.resolveAll({ text, start: run.start, end: run.end })
        )))).flat().sort((first, second) => first.start - second.start || second.end - first.end);
        const tokens = spans.map(span => authoritativeTokenFromSpan(text, span, decorations));
        return tokens.length === decorations.length && tokens.every((token, index) => token === decorations[index])
            ? decorations
            : tokens;
    }

    /**
     * Confirm candidates through exact term lookups. Paragraph parser tokens
     * are intentionally absent from this method: they may decorate a winning
     * card later, but their offsets and lexical choices cannot establish a
     * source span.
     */
    private async authoritativeSpanConfirmations(
        requests: readonly TermSpanLookupCandidate[],
        sources: readonly ParserSpanLookupSource[],
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<ReadonlyMap<TermSpanLookupCandidate, ParserSpanMatch>> {
        const confirmed = new Map<TermSpanLookupCandidate, ParserSpanMatch>();
        for (const source of sources) {
            const pending = requests.filter(request => !confirmed.has(request));
            if (!pending.length) break;
            if (source === 'local' && await this.confirmLocalParserSpanRequests(pending, target, confirmed)) continue;
            const terms = authoritativeLookupTerms(pending, target);
            if (!terms.length) continue;
            const cards = await this.authoritativeCardsForSource(source, terms, options, target);
            confirmParserSpanRequests(pending, cards, target, confirmed);
        }
        return confirmed;
    }

    private async confirmLocalParserSpanRequests(
        requests: readonly TermSpanLookupCandidate[],
        target: LearningTargetModule,
        confirmed: Map<TermSpanLookupCandidate, ParserSpanMatch>,
    ): Promise<boolean> {
        const store = this.dependencies.dictionaries as YomitanDictionaryStore & {
            lookupExactTermCandidates?: YomitanDictionaryStore['lookupExactTermCandidates'];
        };
        // Without the batched exact-candidate transaction, a store that still
        // has the indexed single-term lookup answers per unique term below.
        // A store with only the full findTermMatches sweep (an injected or
        // legacy companion realm) already contributed everything it knows
        // through the decoration sweep, and those aligned decorations confirm
        // spans via preconfirm — re-running the sweep once per candidate term
        // would re-ask the same store dozens of times per sentence.
        if (typeof store.lookupExactTermCandidates !== 'function') {
            return typeof (store as { lookup?: unknown }).lookup !== 'function';
        }
        try {
            const matches = await store.lookupExactTermCandidates(
                requests,
                this.dependencies.getSettings().dictionaryPreferences,
                target,
            );
            for (const match of matches) {
                const card = this.localCardFromEntry(match.entry, target);
                const term = target.normalizeText(match.request.lookupCandidate.term);
                if (cardMatchesLookupTerm(card, term, target)
                    && parserSpanRulesMatch(card, match.request, target)) {
                    confirmed.set(match.request, { card });
                }
            }
            return true;
        } catch (error) {
            log.warn('Exact local term span lookup failed', { requests: requests.length }, error);
            return true;
        }
    }

    private async authoritativeSpanSources(
        paragraphs: readonly string[],
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<ParserSpanLookupSource[]> {
        const settings = this.dependencies.getSettings();
        // Authority lookups are allowed to probe an injected/legacy store
        // which cannot report catalogue availability; an empty exact lookup is
        // a safe miss. Only replacing a whole remote parse up front requires a
        // positive availability report.
        const hasLocal = await this.hasLocalTermDictionaries();
        const local = hasLocal ? ['local' as const] : [];
        if (target.language !== 'ja' || shouldSkipApiParser(options)) return local;
        if (settings.parserProvider === 'local' && hasLocal) return local;
        if (this.shouldRouteShortBatchToLocal([...paragraphs], options, settings) && hasLocal) return local;

        const jpdb = hasJpdbApiCredential(settings) ? ['jpdb' as const] : [];
        const jiten = shouldUseJitenParser(settings, options, this.dependencies.jiten) ? ['jiten' as const] : [];
        const publicJiten = options.allowSegmentedFallback === true
            && this.dependencies.jitenPublicVocabulary
            && (typeof navigator === 'undefined' || navigator.onLine !== false)
            ? ['public-jiten' as const]
            : [];
        if (options.requireJpdb === true) return [...jpdb, ...local, ...publicJiten];
        if (settings.parserProvider === 'jiten') return [...jiten, ...local, ...publicJiten];
        if (settings.parserProvider === 'jpdb') return [...jpdb, ...local, ...publicJiten];
        return shouldPreferJitenParser(settings, options, this.dependencies.jiten)
            ? [...jiten, ...jpdb, ...local, ...publicJiten]
            : [...jpdb, ...jiten, ...local, ...publicJiten];
    }

    private async authoritativeCardsForSource(
        source: ParserSpanLookupSource,
        terms: readonly string[],
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<Map<string, JPDBCard[]>> {
        try {
            if (source === 'local') return await this.localAuthoritativeCards(terms, target);
            if (source === 'public-jiten') return await this.publicJitenAuthoritativeCards(terms, options, target);
            const parsed = source === 'jpdb'
                ? await this.parseWithJpdb([...terms], options)
                : await this.parseWithJiten([...terms], options);
            return authoritativeCardsFromParsedTerms(terms, parsed, target);
        } catch (error) {
            log.warn('Exact term span lookup failed', { source, terms: terms.length }, error);
            return new Map();
        }
    }

    // Reached only for stores that expose the indexed single-term lookup but
    // not the batched exact-candidate transaction; the batched path and the
    // decoration-only degradation are decided in confirmLocalParserSpanRequests.
    private async localAuthoritativeCards(
        terms: readonly string[],
        target: LearningTargetModule,
    ): Promise<Map<string, JPDBCard[]>> {
        const settings = this.dependencies.getSettings();
        const store = this.dependencies.dictionaries as YomitanDictionaryStore & {
            lookup?: YomitanDictionaryStore['lookup'];
        };
        if (typeof store.lookup !== 'function') return new Map();
        const rows = await mapLimited(terms, LOCAL_ENRICHMENT_CONCURRENCY, async term => {
            const entries = await store.lookup!(term, term, LOCAL_MATCH_LIMIT, settings.dictionaryPreferences);
            return [term, entries] as const;
        });
        const cards = new Map<string, JPDBCard[]>();
        for (const [term, entries] of rows) {
            const key = target.normalizeText(term);
            cards.set(key, entries
                .filter(entry => [entry.expression, entry.reading]
                    .some(value => target.normalizeText(value) === key))
                .map(entry => this.localCardFromEntry(entry, target)));
        }
        return cards;
    }

    private async publicJitenAuthoritativeCards(
        terms: readonly string[],
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<Map<string, JPDBCard[]>> {
        const client = this.dependencies.jitenPublicVocabulary;
        if (!client) return new Map();
        if (typeof client.lookupMany === 'function') {
            const found = await client.lookupMany(terms, {
                detailLimit: Math.max(options.publicJitenDetailLimit ?? 0, terms.length),
            });
            const cards = new Map<string, JPDBCard[]>();
            found.forEach((card, term) => cards.set(target.normalizeText(term), [card]));
            return cards;
        }
        const parsed = await client.parse(terms, {
            detailLimit: Math.max(options.publicJitenDetailLimit ?? 0, terms.length),
        });
        return authoritativeCardsFromParsedTerms(terms, parsed, target);
    }

    // The boundary + kanji-ruby reconciliation both read IndexedDB. Like the
    // leaf local parse, an iPad-WebKit stall in either would hang parse()
    // forever. These steps only REFINE an already-valid parse, so a stall (or
    // any failure) degrades to the un-reconciled tokens rather than blocking.
    private async reconcileLocalParse(
        paragraphs: string[],
        parsed: JPDBToken[][],
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<JPDBToken[][]> {
        try {
            return await withTimeout(
                this.reconcileLocalParseResolved(paragraphs, parsed, options, target),
                LOCAL_PARSE_TIMEOUT_MS,
                () => new Error('Local parse reconciliation timed out.'),
            );
        } catch (error) {
            log.warn('Local parse reconciliation timed out or failed; keeping unreconciled parse', error);
            return parsed;
        }
    }

    private async reconcileLocalParseResolved(
        paragraphs: string[],
        parsed: JPDBToken[][],
        _options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<JPDBToken[][]> {
        // Lexical boundaries are already final: parser/provider output can only
        // decorate the spans emitted by TermSpanResolver. Ruby alignment is a
        // downstream visual refinement and is therefore safe to retain here.
        return this.withLocallySplitKanjiRubies(paragraphs, parsed, target);
    }

    private async parseWithPreferredSource(
        paragraphs: string[],
        options: ReaderParserParseOptions,
        settings: ReaderSettings,
        target: LearningTargetModule,
    ): Promise<JPDBToken[][]> {
        // JPDB and Jiten parse Japanese. Other learning targets must keep their
        // text inside the target-aware local/segmented path, even when a caller
        // passes requireApi/requireJpdb or no local dictionary is installed.
        if (target.language !== 'ja') {
            return Promise.all(paragraphs.map(text => this.parseLocalOrSegmentedText(text, options, target)));
        }
        // Local-first never touches Jiten/JPDB, even for requireApi/requireJpdb
        // flows ("propagate remote errors", not a data dependency).
        if (settings.parserProvider === 'local' && await this.hasLocalTermDictionaries(true)) {
            return Promise.all(paragraphs.map(text => this.parseLocalOrSegmentedText(text, options, target)));
        }
        // Length-gate the Jiten paths: short batches (a single word, a refresh)
        // go local to avoid spamming jiten.moe, whose /parse endpoint is for
        // batched lines. Only when local term dictionaries exist.
        if (this.shouldRouteShortBatchToLocal(paragraphs, options, settings) && await this.hasLocalTermDictionaries(true)) {
            return Promise.all(paragraphs.map(text => this.parseLocalOrSegmentedText(text, options, target)));
        }
        // An explicit Jiten/JPDB pick never silently swaps to the other API;
        // when the pinned provider fails it drops to local/segmented fallback.
        // requireJpdb flows (JPDB grading needs JPDB token identity) still go
        // JPDB-first below even with Jiten pinned.
        if (settings.parserProvider === 'jiten' && options.requireJpdb !== true) {
            const jitenResult = await this.tryParseWithJiten(paragraphs, options, settings, target);
            if (jitenResult) return jitenResult;
            return this.parseWithFallbackSource(paragraphs, options, target);
        }
        if (settings.parserProvider === 'jpdb') {
            const jpdbResult = await this.tryParseWithJpdb(paragraphs, options, settings, target);
            if (jpdbResult) return jpdbResult;
            return this.parseWithFallbackSource(paragraphs, options, target);
        }
        if (shouldPreferJitenParser(settings, options, this.dependencies.jiten)) {
            const jitenResult = await this.tryParseWithJiten(paragraphs, options, settings, target);
            if (jitenResult) return jitenResult;
            const jpdbResult = await this.tryParseWithJpdb(paragraphs, options, settings, target);
            if (jpdbResult) return jpdbResult;
            return this.parseWithFallbackSource(paragraphs, options, target);
        }
        const jpdbResult = await this.tryParseWithJpdb(paragraphs, options, settings, target);
        if (jpdbResult) return jpdbResult;
        const jitenResult = await this.tryParseWithJiten(paragraphs, options, settings, target);
        if (jitenResult) return jitenResult;
        return this.parseWithFallbackSource(paragraphs, options, target);
    }

    // True when an EXPLICIT Jiten pick would fire a remote request for a batch too
    // short to justify it. Only explicit 'jiten' is gated: the auto path keeps its
    // API-first contract, jpdb has its own batching + grading identity, and
    // requireJpdb flows still need JPDB. Jiten-only users (no local dicts) are
    // unaffected because the caller also requires hasLocalTermDictionaries.
    private shouldRouteShortBatchToLocal(paragraphs: string[], options: ReaderParserParseOptions, settings: ReaderSettings): boolean {
        if (settings.parserProvider !== 'jiten' || options.requireJpdb === true) return false;
        return japaneseBatchCharCount(paragraphs) < JITEN_MIN_BATCH_CHARS;
    }

    private async tryParseWithJpdb(
        paragraphs: string[],
        options: ReaderParserParseOptions,
        settings: ReaderSettings,
        target: LearningTargetModule,
    ): Promise<JPDBToken[][] | null> {
        if (!hasJpdbApiCredential(settings) || shouldSkipApiParser(options)) return null;
        try {
            const result = await this.parseWithJpdb(paragraphs, options);
            return this.withSegmentedFallbackGaps(paragraphs, result, options, target);
        } catch (error) {
            this.handleRemoteParseError('JPDB', error, options);
            return null;
        }
    }

    private async parseWithJpdb(paragraphs: string[], options: ReaderParserParseOptions): Promise<JPDBToken[][]> {
        const parsePromise = this.dependencies.jpdb.parse(paragraphs);
        const timeoutMs = remoteParseFallbackTimeoutMs(options);
        return timeoutMs > 0
            ? withTimeout(parsePromise, timeoutMs, () => new Error('JPDB parse timed out.'))
            : parsePromise;
    }

    private async tryParseWithJiten(
        paragraphs: string[],
        options: ReaderParserParseOptions,
        settings: ReaderSettings,
        target: LearningTargetModule,
    ): Promise<JPDBToken[][] | null> {
        if (!shouldUseJitenParser(settings, options, this.dependencies.jiten)) return null;
        try {
            const result = await this.parseWithJiten(paragraphs, options);
            return this.withSegmentedFallbackGaps(paragraphs, result, options, target);
        } catch (error) {
            this.handleRemoteParseError('Jiten', error, options);
            return null;
        }
    }

    private async parseWithJiten(paragraphs: string[], options: ReaderParserParseOptions): Promise<JPDBToken[][]> {
        const parsePromise = this.dependencies.jiten!.parse(paragraphs);
        const timeoutMs = remoteParseFallbackTimeoutMs(options);
        return timeoutMs > 0
            ? withTimeout(parsePromise, timeoutMs, () => new Error('Jiten parse timed out.'))
            : parsePromise;
    }

    private handleRemoteParseError(source: 'JPDB' | 'Jiten', error: unknown, options: ReaderParserParseOptions): void {
        const canFallback = this.canUseParseFallback(options);
        log.warn(remoteParseErrorMessage(source, options, canFallback), error);
        if (shouldRethrowRemoteParseError(options, canFallback)) throw error;
    }

    private async parseWithFallbackSource(
        paragraphs: string[],
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<JPDBToken[][]> {
        if (!await this.hasLocalTermDictionaries()) {
            const publicJitenResult = await this.tryParseWithPublicJiten(paragraphs, options, target);
            if (publicJitenResult) return publicJitenResult;
        }
        return Promise.all(paragraphs.map(text => this.parseLocalOrSegmentedText(text, options, target)));
    }

    private async tryParseWithPublicJiten(
        paragraphs: string[],
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<JPDBToken[][] | null> {
        if (options.allowSegmentedFallback !== true || shouldSkipApiParser(options)) return null;
        // Offline the public round-trip is doomed and would only delay the
        // segmented first paint until the request timeout fires.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
        const parser = this.dependencies.jitenPublicVocabulary;
        if (typeof parser?.parse !== 'function') return null;
        try {
            const parsed = options.publicJitenDetailLimit === undefined
                ? await parser.parse(paragraphs)
                : await parser.parse(paragraphs, { detailLimit: options.publicJitenDetailLimit });
            if (!parsed.some(tokens => tokens.length)) return null;
            return this.withSegmentedFallbackGaps(paragraphs, parsed, options, target);
        } catch (error) {
            log.warn('Jiten public parse failed; using local or segmented fallback', error);
            return null;
        }
    }

    canParse(): boolean {
        return true;
    }

    isJpdbBackedCard(card: JPDBCard): boolean {
        return (!card.source || card.source === 'jpdb') && card.vid > 0;
    }

    getCachedCard(vid: number, sid: number): JPDBCard | undefined {
        return this.dependencies.jpdb.getCard(vid, sid) ?? this.localCardCache.get(cardCacheKey(vid, sid));
    }

    cacheCards(cards: JPDBCard[]): void {
        cards.forEach(card => { this.rememberLocalCardEvidence(card); });
    }

    private withCachedCardEvidence(paragraphs: string[], parsed: JPDBToken[][]): JPDBToken[][] {
        let reconciled = parsed;
        parsed.forEach((tokens, paragraphIndex) => {
            let nextTokens = tokens;
            tokens.forEach((token, tokenIndex) => {
                const surface = paragraphs[paragraphIndex]?.slice(token.start, token.end) ?? '';
                const card = this.rememberLocalCardEvidence(token.card, surface);
                if (card === token.card) return;
                if (nextTokens === tokens) nextTokens = [...tokens];
                nextTokens[tokenIndex] = {
                    ...token,
                    card,
                    pitchClass: getPitchClass(card.pitchAccent, card.reading || card.spelling) || token.pitchClass,
                };
            });
            if (nextTokens === tokens) return;
            if (reconciled === parsed) reconciled = [...parsed];
            reconciled[paragraphIndex] = nextTokens;
        });
        return reconciled;
    }

    private rememberLocalCardEvidence(card: JPDBCard, surface?: string): JPDBCard {
        if (!cardUsesReaderLocalCache(card)) return card;
        const evidenceKey = cardEvidenceCacheKey(card);
        const cached = this.localCardEvidenceCache.get(evidenceKey);
        const remembered = cached ? cardWithPreservedCachedEvidence(card, cached, surface) : card;
        this.localCardEvidenceCache.set(evidenceKey, remembered);
        // Preserve the public getCachedCard(vid, sid) contract. On a genuine
        // numeric collision this remains latest-writer-wins, as before, while
        // the provider/language-scoped evidence records remain isolated.
        this.localCardCache.set(cardCacheKey(card.vid, card.sid), remembered);
        return remembered;
    }

    clearLocalCache(): void {
        this.localCardCache.clear();
        this.localCardEvidenceCache.clear();
        this.localParseCache.clear();
        this.localPitchCache.clear();
        this.localTermDictionaryAvailability = undefined;
    }

    localCardFromEntry(entry: YomitanTermEntry, target = activeLearningTarget()): JPDBCard {
        const id = -stablePositiveHashId(`${target.language}\n${entry.dictionary}\n${entry.expression}\n${entry.reading}`);
        const partOfSpeech = (entry.rules ?? '').split(/\s+/).filter(Boolean);
        const card: JPDBCard = {
            vid: id,
            sid: id,
            rid: 0,
            spelling: entry.expression,
            reading: entry.reading || entry.expression,
            language: target.language,
            frequencyRank: entry.jpdbFrequency ?? null,
            partOfSpeech,
            meanings: [{
                glosses: entry.glossary.map(glossaryToText).filter(Boolean).slice(0, 8),
                partOfSpeech,
            }],
            cardState: ['not-in-deck'],
            // Local dictionary carries no SRS state: not-in-deck is a default,
            // not an authenticated verdict, so tag it provisional.
            provisionalState: true,
            pitchAccent: [],
            wordWithReading: null,
            source: 'local',
        };
        return this.rememberLocalCardEvidence(card);
    }

    fallbackCardFromText(text: string, target = activeLearningTarget()): JPDBCard {
        const card = bareFallbackCardFromText(text, target.language);
        return this.rememberLocalCardEvidence(card);
    }

    private canUseLocalDictionaryFallback(): boolean {
        return this.dependencies.getSettings().localDictionariesEnabled;
    }

    private canUseParseFallback(options: ReaderParserParseOptions): boolean {
        return this.canUseLocalDictionaryFallback() || options.allowSegmentedFallback === true;
    }

    private async parseLocalOrSegmentedText(
        text: string,
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<JPDBToken[]> {
        const settings = this.dependencies.getSettings();
        const key = localParseCacheKey(text, options, settings, target);
        const cached = this.localParseCache.get(key);
        if (cached) {
            this.localParseCache.delete(key);
            this.localParseCache.set(key, cached);
            return cached;
        }
        const promise = this.parseLocalOrSegmentedTextUncached(text, options, target).catch(error => {
            if (this.localParseCache.get(key) === promise) this.localParseCache.delete(key);
            throw error;
        });
        this.rememberLocalParseCacheEntry(key, promise);
        return promise;
    }

    private async parseLocalOrSegmentedTextUncached(
        text: string,
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<JPDBToken[]> {
        try {
            return await withTimeout(
                this.resolveLocalOrSegmentedText(text, options, target),
                LOCAL_PARSE_TIMEOUT_MS,
                () => new Error('Local parse timed out.'),
            );
        } catch (error) {
            // A never-settling IndexedDB request (an iPad WebKit failure mode)
            // would otherwise hang this promise forever. Degrade to the
            // in-memory segmented parse so the caller always gets a result.
            // Residual (accepted): the orphaned resolveLocalOrSegmentedText keeps
            // running and its enrichmentGate slot leaks; after enough stalls the
            // gate stays full and later parses degrade to segmented too — still
            // bounded (never a hard hang), so enrichment quality drops rather
            // than the tab freezing. Bounding the gated reads is a follow-up.
            log.warn('Local parse timed out; using segmented fallback', { length: text.length }, error);
            return this.localParseTimeoutFallback(text, options, target);
        }
    }

    private async resolveLocalOrSegmentedText(
        text: string,
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<JPDBToken[]> {
        if (this.canUseLocalDictionaryFallback()) {
            const tokens = await this.parseLocalDictionaryText(text, options, target);
            if (tokens.length) {
                return options.allowSegmentedFallback === true
                    ? this.fillSegmentedFallbackGaps(text, tokens, target)
                    : tokens;
            }
        }
        return options.allowSegmentedFallback === true ? this.parseSegmentedText(text, target) : [];
    }

    // The timeout path RESOLVES to this fallback (rather than rejecting), so
    // parseLocalOrSegmentedText caches it. That is deliberate: a WebKit IDB
    // stall rarely recovers within a page session, and caching the segmented
    // result avoids re-hitting the dead request on every later lookup. The cost
    // is that a genuinely transient stall keeps that one sentence ruby-less
    // until LRU eviction — an accepted trade for not re-freezing.
    private localParseTimeoutFallback(
        text: string,
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): JPDBToken[] {
        return options.allowSegmentedFallback === true ? this.parseSegmentedText(text, target) : [];
    }

    private rememberLocalParseCacheEntry(key: string, promise: Promise<JPDBToken[]>): void {
        this.localParseCache.set(key, promise);
        while (this.localParseCache.size > LOCAL_PARSE_CACHE_LIMIT) {
            const oldest = this.localParseCache.keys().next().value;
            if (typeof oldest !== 'string') break;
            this.localParseCache.delete(oldest);
        }
    }

    private async parseLocalDictionaryText(
        text: string,
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<JPDBToken[]> {
        const { dictionaries, getSettings } = this.dependencies;
        if (!await this.hasLocalTermDictionaries()) return [];
        const settings = getSettings();
        const matches = await dictionaries.findTermMatches(text, LOCAL_MATCH_LIMIT, settings.dictionaryPreferences, target).catch(error => {
            log.warn('Local dictionary parse failed', { length: text.length }, error);
            return [];
        });
        // The card (identity/state) is synchronous; only the pitch + ruby
        // enrichment hits IndexedDB. Gate that enrichment through a shared
        // concurrency limiter so parsing many cues at once (keyless warmup)
        // cannot flood IndexedDB and stall the main thread.
        return mapLimited(matches, LOCAL_ENRICHMENT_CONCURRENCY, match => this.localTokenFromMatch(text, match, options, target));
    }

    private async localTokenFromMatch(
        text: string,
        match: YomitanTermMatch,
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<JPDBToken> {
        const card = this.localCardFromEntry(match.entry, target);
        const reading = card.reading && card.reading !== match.surface ? card.reading : '';
        const pitch = await this.enrichmentGate.run(() => this.localPitchPattern(card, options));
        if (pitch && !card.pitchAccent.length) card.pitchAccent = [pitch];
        const rubies = reading
            ? match.deinflected
                ? inferredInflectedSurfaceRubies(match.surface, card.spelling, reading).map(ruby => ({
                    ...ruby,
                    start: match.start + ruby.start,
                    end: match.start + ruby.end,
                }))
                : await this.enrichmentGate.run(() => this.localRubySegments(match.surface, reading, match.start, match.end))
            : [];
        return {
            card,
            start: match.start,
            end: match.end,
            length: match.end - match.start,
            rubies,
            pitchClass: pitch ? getPitchClass([pitch], card.reading) : '',
            sentence: text,
        };
    }

    // A store that cannot report availability still gets a chance in the
    // fallback path (it tolerates empty lookups), but local-first replaces
    // remote parsing outright, so `confirmed` demands a positive report.
    private async hasLocalTermDictionaries(confirmed = false): Promise<boolean> {
        if (!this.canUseLocalDictionaryFallback()) return false;
        return await this.reportedTermDictionaryAvailability() ?? !confirmed;
    }

    private reportedTermDictionaryAvailability(): Promise<boolean | undefined> {
        const store = this.dependencies.dictionaries as YomitanDictionaryStore & {
            hasTermDictionaries?: () => Promise<boolean>;
        };
        if (typeof store.hasTermDictionaries !== 'function') return Promise.resolve(undefined);
        this.localTermDictionaryAvailability ??= store.hasTermDictionaries().catch(error => {
            this.localTermDictionaryAvailability = undefined;
            log.warn('Local term dictionary availability check failed', { error });
            return undefined;
        });
        return this.localTermDictionaryAvailability;
    }

    private parseSegmentedText(text: string, target: LearningTargetModule): JPDBToken[] {
        return target.segment(text).map(segment => {
            const card = this.fallbackCardFromText(segment.text, target);
            return {
                card,
                start: segment.start,
                end: segment.end,
                length: segment.end - segment.start,
                rubies: [],
                pitchClass: '',
                sentence: text,
            };
        });
    }

    private async withSegmentedFallbackGaps(
        paragraphs: string[],
        parsed: JPDBToken[][],
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<JPDBToken[][]> {
        // Parsing is a one-result-per-input contract. Provider adapters are
        // allowed to fail partially, but their response cardinality must never
        // leak into callers: a short response used to leave the tail DOM
        // targets permanently bare, while extra rows shifted later work.
        const hasExactCardinality = parsed.length === paragraphs.length
            && paragraphs.every((_, index) => Array.isArray(parsed[index]));
        if (options.allowSegmentedFallback !== true && hasExactCardinality) return parsed;
        return Promise.all(paragraphs.map(async (text, index) => {
            const tokens = parsed[index] ?? [];
            if (options.allowSegmentedFallback !== true) return tokens;
            const withLocal = await this.fillGapsWithLocalDictionaryTokens(text, tokens, options, target);
            return this.fillSegmentedFallbackGaps(text, withLocal, target);
        }));
    }

    // Remote coverage gaps were previously filled ONLY by the bare segmenter,
    // whose fallback cards carry no reading/ruby/pitch — so an inflected verb
    // the provider skipped (使って, 行います) rendered with no decoration at
    // all while its neighbours annotated. When local term dictionaries are
    // available, fill the uncovered ranges with deinflected, enriched local
    // tokens first; the bare segmenter only covers what the dictionary also
    // misses.
    private async fillGapsWithLocalDictionaryTokens(
        text: string,
        tokens: JPDBToken[],
        options: ReaderParserParseOptions,
        target: LearningTargetModule,
    ): Promise<JPDBToken[]> {
        if (!this.canUseLocalDictionaryFallback()) return tokens;
        if (!await this.hasLocalTermDictionaries()) return tokens;
        const localTokens = await this.parseLocalDictionaryText(text, options, target).catch(() => [] as JPDBToken[]);
        // Only fill ranges no provider token touches; segmented fallback is
        // allowed to cover the remaining gaps but never replace either source.
        const additions = localTokens.filter(local =>
            !tokens.some(token => rangesOverlap(local.start, local.end, token.start, token.end)));
        return additions.length ? [...tokens, ...additions].sort(compareTokensByOffset) : tokens;
    }

    private fillSegmentedFallbackGaps(text: string, tokens: JPDBToken[], target: LearningTargetModule): JPDBToken[] {
        // Gap coverage must use the same spans the DOM renderer can actually
        // consume. A malformed or overlapping provider token used to mark its
        // Japanese range as covered here, then get discarded at render time,
        // leaving the rejected range as an unannotated raw-text hole.
        tokens = nonOverlappingTokens([...tokens].sort((first, second) => first.start - second.start
            || (second.end - second.start) - (first.end - first.start)), text);
        const fallbackTokens = this.parseSegmentedText(text, target);
        const extras = this.segmentedFallbackGapTokens(text, fallbackTokens, tokens, target);
        return extras.length ? [...tokens, ...extras].sort(compareTokensByOffset) : tokens;
    }

    /**
     * Segmentation is gap coverage, never lexical evidence. A fallback span may
     * carry wider lookup terms for a later dictionary request, but it must not
     * replace or resize a span which a provider or local dictionary confirmed.
     *
     * ICU boundaries can cross a confirmed token. Subtract those ranges and
     * mint fallback cards only for the uncovered source slices, preserving the
     * confirmed token verbatim. This makes dictionary evidence monotonic and
     * prevents a broad segmented token from repainting a narrower real word.
     */
    private segmentedFallbackGapTokens(
        text: string,
        fallbackTokens: JPDBToken[],
        confirmedTokens: JPDBToken[],
        target: LearningTargetModule,
    ): JPDBToken[] {
        const extras: JPDBToken[] = [];
        for (const fallback of fallbackTokens) {
            const blockers = confirmedTokens
                .filter(token => rangesOverlap(fallback.start, fallback.end, token.start, token.end))
                .sort(compareTokensByOffset);
            let start = fallback.start;
            for (const blocker of blockers) {
                this.pushSegmentedFallbackGap(extras, text, start, Math.min(blocker.start, fallback.end), target);
                start = Math.max(start, blocker.end);
                if (start >= fallback.end) break;
            }
            this.pushSegmentedFallbackGap(extras, text, start, fallback.end, target);
        }
        return extras;
    }

    private pushSegmentedFallbackGap(
        tokens: JPDBToken[],
        text: string,
        start: number,
        end: number,
        target: LearningTargetModule,
    ): void {
        if (end <= start) return;
        const surface = text.slice(start, end);
        if (!target.isLookupableText(surface)) return;
        const card = this.fallbackCardFromText(surface, target);
        tokens.push({
            card,
            start,
            end,
            length: end - start,
            rubies: [],
            pitchClass: '',
            sentence: text,
        });
    }

    // All-kanji compounds get their reading split per kanji when the user's
    // kanji dictionaries allow an exact, unambiguous alignment (琉球藍 →
    // 琉=りゅう 球=きゅう 藍=あい); otherwise the whole-word ruby stays.
    private async localRubySegments(surface: string, reading: string, start: number, end: number): Promise<JPDBToken['rubies']> {
        const whole = [{ text: reading, start, end, length: end - start }];
        const characters = [...new Set(Array.from(surface).filter(character => LOCAL_RUBY_SPLIT_KANJI_CHAR_RE.test(character)))];
        if (characters.length < 2) return whole;
        const readings = new Map<string, string[]>();
        await Promise.all(characters.map(async character => {
            readings.set(character, await this.cachedKanjiReadings(character));
        }));
        const segments = splitReadingAcrossKanji(surface, reading, kanji => readings.get(kanji) ?? []);
        if (!segments) return whole;
        return segments.map(segment => ({
            text: segment.text,
            start: start + segment.start,
            end: start + segment.end,
            length: segment.end - segment.start,
        }));
    }

    private cachedKanjiReadings(character: string): Promise<string[]> {
        const cached = this.kanjiReadingCache.get(character);
        if (cached) return cached;
        const settings = this.dependencies.getSettings();
        const lookupKanji = this.dependencies.dictionaries.lookupKanji as ((text: string, limit: number, preferences?: ReaderSettings['dictionaryPreferences']) => Promise<Array<{ onyomi: string[]; kunyomi: string[] }>>) | undefined;
        const promise = typeof lookupKanji === 'function' && settings.localDictionariesEnabled
            ? lookupKanji.call(this.dependencies.dictionaries, character, 3, settings.dictionaryPreferences)
                .then(entries => entries.flatMap(entry => [...entry.onyomi, ...entry.kunyomi]))
                .catch(() => [])
            : Promise.resolve([]);
        this.kanjiReadingCache.set(character, promise);
        if (this.kanjiReadingCache.size > 400) {
            const oldest = this.kanjiReadingCache.keys().next().value;
            if (oldest) this.kanjiReadingCache.delete(oldest);
        }
        return promise;
    }

    private async withLocallySplitKanjiRubies(
        paragraphs: string[],
        parsed: JPDBToken[][],
        target: LearningTargetModule,
    ): Promise<JPDBToken[][]> {
        if (activeLearningTarget() !== target) return parsed;
        if (!this.canUseLocalKanjiRubySplits()) return parsed;
        let nextParsed = parsed;
        await Promise.all(parsed.map(async (tokens, paragraphIndex) => {
            let nextTokens = tokens;
            await Promise.all(tokens.map(async (token, tokenIndex) => {
                const surface = paragraphs[paragraphIndex]?.slice(token.start, token.end) ?? '';
                const split = await this.locallySplitTokenRubies(surface, token);
                if (!split || rubiesEqual(split, token.rubies)) return;
                if (nextTokens === tokens) nextTokens = [...tokens];
                nextTokens[tokenIndex] = { ...token, rubies: split };
                this.syncCardWordWithReadingFromTokenRuby(nextTokens[tokenIndex], surface);
            }));
            if (nextTokens === tokens) return;
            if (nextParsed === parsed) nextParsed = [...parsed];
            nextParsed[paragraphIndex] = nextTokens;
        }));
        return nextParsed;
    }

    private canUseLocalKanjiRubySplits(): boolean {
        const settings = this.dependencies.getSettings();
        return settings.localDictionariesEnabled
            && typeof this.dependencies.dictionaries.lookupKanji === 'function';
    }

    private async locallySplitTokenRubies(surface: string, token: JPDBToken): Promise<JPDBToken['rubies'] | null> {
        if (!surface) return null;
        if (token.rubies.length) {
            return await this.locallySplitExistingRubies(surface, token);
        }
        const reading = token.card.reading.trim();
        if (!shouldTryLocalKanjiRubySplit(surface, reading)) return null;
        const whole = [{ text: reading, start: token.start, end: token.end, length: token.end - token.start }];
        const split = await this.enrichmentGate.run(() => this.localRubySegments(surface, reading, token.start, token.end));
        return rubiesEqual(split, whole) ? null : split;
    }

    private async locallySplitExistingRubies(surface: string, token: JPDBToken): Promise<JPDBToken['rubies'] | null> {
        let changed = false;
        const split: JPDBToken['rubies'] = [];
        for (const ruby of token.rubies) {
            const start = ruby.start - token.start;
            const end = ruby.end - token.start;
            const base = surface.slice(start, end);
            if (!shouldTryLocalKanjiRubySplit(base, ruby.text)) {
                split.push(ruby);
                continue;
            }
            const next = await this.enrichmentGate.run(() => this.localRubySegments(base, ruby.text, ruby.start, ruby.end));
            changed ||= !rubiesEqual(next, [ruby]);
            split.push(...next);
        }
        return changed ? split : null;
    }

    private syncCardWordWithReadingFromTokenRuby(token: JPDBToken, surface: string): void {
        if (!token.rubies.length || token.card.spelling !== surface) return;
        let word = token.card.spelling;
        for (let index = token.rubies.length - 1; index >= 0; index -= 1) {
            const { text, end } = token.rubies[index];
            const insertionOffset = end - token.start;
            word = `${word.slice(0, insertionOffset)}[${text}]${word.slice(insertionOffset)}`;
        }
        token.card.wordWithReading = word;
    }

    private async localPitchPattern(card: JPDBCard, options: ReaderParserParseOptions): Promise<string> {
        const settings = this.dependencies.getSettings();
        if (options.includeLocalPitch === false) return '';
        if (!settings.showPitchAccent || !settings.localDictionariesEnabled) return '';
        const lookupTermMeta = this.dependencies.dictionaries.lookupTermMeta as ((expression: string, limit: number, preferences?: ReaderSettings['dictionaryPreferences']) => Promise<YomitanMetaEntry[]>) | undefined;
        if (typeof lookupTermMeta !== 'function') return '';
        const key = localPitchCacheKey(card, settings);
        const cached = this.localPitchCache.get(key);
        if (cached) return firstLocalPitchPattern(await cached);
        const promise: Promise<LocalPitchResolution> = localPitchResolutionFromMetaLookup(
            card.spelling,
            card.reading,
            expression => lookupTermMeta.call(this.dependencies.dictionaries, expression, 12, settings.dictionaryPreferences),
        ).catch(error => {
            log.warn('Local pitch parse failed', { term: card.spelling }, error);
            return { patterns: [] };
        });
        this.rememberLocalPitchCacheEntry(key, promise);
        return firstLocalPitchPattern(await promise);
    }

    private withNormalizedMetricTokens(text: string, tokens: JPDBToken[]): JPDBToken[] {
        if (!text.includes('回視聴')) return tokens;
        const replacements: JPDBToken[] = [];
        const replacementRanges: Array<{ start: number; end: number }> = [];
        for (const match of text.matchAll(YOUTUBE_VIEW_METRIC_RE)) {
            const start = match.index ?? -1;
            if (start < 0) continue;
            const end = start + match[0].length;
            const overlapping = tokens.filter(token => rangesOverlap(start, end, token.start, token.end));
            const alreadyCovered = overlapping.some(token => token.start >= start + 1 && token.end <= end && token.card.spelling === '視聴');
            const hasBrokenMetricToken = overlapping.some(token => text.slice(token.start, token.end) === '回視');
            if (alreadyCovered && !hasBrokenMetricToken) continue;
            if (!hasBrokenMetricToken && overlapping.length > 0) continue;
            replacementRanges.push({ start, end });
            replacements.push(
                this.metricToken(text, '回', 'かい', start, start + 1),
                this.metricToken(text, '視聴', 'しちょう', start + 1, end),
            );
        }
        if (!replacements.length) return tokens;
        return [
            ...tokens.filter(token => !replacementRanges.some(range => rangesOverlap(range.start, range.end, token.start, token.end))),
            ...replacements,
        ].sort(compareTokensByOffset);
    }

    private withNormalizedMetricParseResult(paragraphs: string[], parsed: JPDBToken[][]): JPDBToken[][] {
        let normalized = parsed;
        for (const [index, tokens] of parsed.entries()) {
            const nextTokens = this.withNormalizedMetricTokens(paragraphs[index] ?? '', tokens);
            if (nextTokens === tokens) continue;
            if (normalized === parsed) normalized = [...parsed];
            normalized[index] = nextTokens;
        }
        return normalized;
    }

    private metricToken(sentence: string, surface: string, reading: string, start: number, end: number): JPDBToken {
        const card = this.fallbackCardFromText(surface);
        card.reading = reading;
        return {
            card,
            start,
            end,
            length: end - start,
            rubies: [{ text: reading, start, end, length: end - start }],
            pitchClass: '',
            sentence,
        };
    }

    private rememberLocalPitchCacheEntry(key: string, promise: Promise<LocalPitchResolution>): void {
        this.localPitchCache.set(key, promise);
        while (this.localPitchCache.size > LOCAL_PITCH_CACHE_LIMIT) {
            const oldest = this.localPitchCache.keys().next().value;
            if (typeof oldest !== 'string') break;
            this.localPitchCache.delete(oldest);
        }
    }
}

type ParserSpanLookupSource = 'jpdb' | 'jiten' | 'local' | 'public-jiten';

interface ParserSpanMatch {
    card: JPDBCard;
}

interface PendingParserSpanLookup {
    requests: readonly TermSpanLookupCandidate[];
    resolve(matches: ReadonlyMap<TermSpanLookupCandidate, ParserSpanMatch>): void;
    reject(error: unknown): void;
}

/** Coalesce every paragraph/run in one parse turn into one provider batch. */
class BatchedParserSpanLookup implements TermSpanCandidateLookup<ParserSpanMatch> {
    private pending: PendingParserSpanLookup[] = [];
    private flushScheduled = false;

    constructor(
        private readonly load: (
            requests: readonly TermSpanLookupCandidate[],
        ) => Promise<ReadonlyMap<TermSpanLookupCandidate, ParserSpanMatch>>,
    ) {}

    lookup(requests: readonly TermSpanLookupCandidate[]): Promise<ReadonlyMap<TermSpanLookupCandidate, ParserSpanMatch>> {
        return new Promise((resolve, reject) => {
            this.pending.push({ requests, resolve, reject });
            if (this.flushScheduled) return;
            this.flushScheduled = true;
            queueMicrotask(() => { void this.flush(); });
        });
    }

    private async flush(): Promise<void> {
        this.flushScheduled = false;
        const pending = this.pending;
        this.pending = [];
        try {
            const matches = await this.load(pending.flatMap(item => [...item.requests]));
            for (const item of pending) {
                const result = new Map<TermSpanLookupCandidate, ParserSpanMatch>();
                for (const request of item.requests) {
                    const match = matches.get(request);
                    if (match) result.set(request, match);
                }
                item.resolve(result);
            }
        } catch (error) {
            pending.forEach(item => item.reject(error));
        }
    }
}

function authoritativeLookupTerms(
    requests: readonly TermSpanLookupCandidate[],
    target: LearningTargetModule,
): string[] {
    const terms = new Map<string, string>();
    for (const request of requests) {
        const term = request.lookupCandidate.term.trim();
        const key = target.normalizeText(term);
        if (key && !terms.has(key)) terms.set(key, term);
    }
    return [...terms.values()];
}

function confirmParserSpanRequests(
    requests: readonly TermSpanLookupCandidate[],
    cardsByTerm: ReadonlyMap<string, readonly JPDBCard[]>,
    target: LearningTargetModule,
    confirmed: Map<TermSpanLookupCandidate, ParserSpanMatch>,
): void {
    for (const request of requests) {
        if (confirmed.has(request)) continue;
        if (!target.isLookupableText(request.surface)) continue;
        const term = target.normalizeText(request.lookupCandidate.term);
        if (!term) continue;
        const card = cardsByTerm.get(term)?.find(candidate => (
            cardMatchesLookupTerm(candidate, term, target)
            && parserSpanRulesMatch(candidate, request, target)
        ));
        if (card) confirmed.set(request, { card });
    }
}

/**
 * A provider's parse of THIS paragraph is itself a confirmation source: a
 * planned span whose exact range carries a provider token, and whose lookup
 * term the token's card answers, is confirmed without another lookup. The
 * span still originates from the resolver's own enumeration — an aligned
 * decoration only says yes to it — so provider offsets keep having no power
 * to paint outside their exact analysed range, while two provider words can
 * no longer be swallowed by a broader unconfirmed guess.
 *
 * A token that stops inside a kana run stays unconfirmed: that shape is an
 * inflection cut mid-word (やや|さし for ややさしい), and real lookups plus
 * segmented fallback recover the whole word. Local-matcher decorations pass
 * through here too — their stem cuts are policed by the admit filter, and a
 * legacy store without the batched exact-candidate API has no other way to
 * speak for local dictionaries than the sweep that produced them.
 */
function decorationAlignedSpanConfirmation(
    text: string,
    decorations: readonly JPDBToken[],
    target: LearningTargetModule,
): (candidate: TermSpanPreconfirmCandidate) => ParserSpanMatch | null {
    const bySpan = new Map<string, JPDBToken>();
    for (const token of decorations) {
        if (token.card.source === 'fallback') continue;
        bySpan.set(`${token.start}:${token.end}`, token);
    }
    if (!bySpan.size) return () => null;
    return candidate => {
        const token = bySpan.get(`${candidate.start}:${candidate.end}`);
        if (!token) return null;
        if (endsInsideKanaRun(text, candidate.end)) return null;
        const term = target.normalizeText(candidate.lookupCandidate.term);
        return cardMatchesLookupTerm(token.card, term, target) ? { card: token.card } : null;
    };
}

/**
 * Veto two confirmed shapes the old repair passes existed for.
 *
 * Phrase glue: a span that is its own lookup term (no deinflection reached a
 * dictionary form), carries no pitch evidence, has a case particle standing
 * as a whole segment INSIDE it, and is vouched for only by a provider's
 * parse of itself is a clause glued into one "word" (頭|が|おかしい). The
 * internal particle is the tell: a compound noun the segmenter over-splits
 * (本人|確認) contains none, so it keeps its provider identity. A dictionary
 * entry is exempt — a name like 紫音 is a pitchless multi-segment identity,
 * and the entry's existence is the proof the span is a real lexeme.
 *
 * Stem cuts, from any source: a dictionary happily confirms 読み inside
 * 読み取る and a provider happily confirms the surname 訪 inside 訪れた —
 * but a match that stops strictly inside its covering segment, with a
 * continuation that is neither a grammatical boundary nor itself a
 * confirmed word, has cut a compound or an inflection. When the
 * continuation IS a confirmed word (優しい followed by confirmed 言葉
 * inside one glued segment, 追加 followed by confirmed できる), the cut is
 * two adjacent words, not a stranded stem, and both stand.
 *
 * Vetoed spans lose to the next shorter candidate or to segmented fallback.
 */
function rejectUntrustworthySpanShapes(
    text: string,
    segments: readonly { start: number; end: number }[],
    target: LearningTargetModule,
): (candidate: TermSpanPreconfirmCandidate, match: ParserSpanMatch, context: TermSpanAdmitContext) => boolean {
    return (candidate, match, context) => {
        const term = target.normalizeText(candidate.lookupCandidate.term);
        const identity = term === target.normalizeText(candidate.surface);
        if (identity
            && match.card.source !== 'local'
            && !match.card.pitchAccent?.length
            && (segmentsContainInternalParticle(text, segments, candidate.start, candidate.end)
                // A kana→kanji transition inside the span is the other glue
                // tell: inflection endings close a word (優しい|言葉), so no
                // single lexeme resumes kanji after kana mid-span, while
                // single-script compounds (本人確認, パスキー) never trip this.
                || hasInternalKanaToKanjiTransition(text, candidate.start, candidate.end))) {
            return false;
        }
        if (endsStrictlyInsideSegment(segments, candidate.end)
            && !context.hasConfirmedSpanAt(candidate.end)
            && !KANA_CASE_PARTICLE_CONTINUATIONS.some(particle => text.startsWith(particle, candidate.end))) {
            return false;
        }
        return true;
    };
}

function endsStrictlyInsideSegment(
    segments: readonly { start: number; end: number }[],
    end: number,
): boolean {
    return segments.some(segment => segment.start < end && end < segment.end);
}

function segmentsContainInternalParticle(
    text: string,
    segments: readonly { start: number; end: number }[],
    start: number,
    end: number,
): boolean {
    return segments.some(segment => segment.start >= start
        && segment.end <= end
        && !(segment.start === start && segment.end === end)
        && SPAN_BOUNDARY_PARTICLES.includes(text.slice(segment.start, segment.end)));
}

const KANA_RUN_CHARACTER_RE = new RegExp(`^[${KANA}${PROLONGED_SOUND_MARK}]$`, 'u');
const KANJI_CHARACTER_RE = new RegExp(`^(?:${KANJI_PATTERN}|[${ITERATION_MARK}])$`, 'u');

function hasInternalKanaToKanjiTransition(text: string, start: number, end: number): boolean {
    for (let index = start + 1; index < end; index++) {
        if (KANA_RUN_CHARACTER_RE.test(text[index - 1]) && KANJI_CHARACTER_RE.test(text[index])) return true;
    }
    return false;
}

// Kana that legitimately OPENS a new grammatical unit after a word. A span
// cut is only a mid-word cut when the continuation is none of these:
// 聞き取れませんでした|か is a real boundary, やや|さし is not. Case and
// binding particles bind whatever follows, so they stand on their own;
// sentence-final particles only close a clause, so they are boundaries only
// when nothing kana follows them (かな in the middle of a kana run is far
// more often word-internal さ/か than two stacked particles). Longest
// entries first so から wins over か at the same position.
const KANA_CASE_PARTICLE_CONTINUATIONS = [
    'から', 'まで', 'より', 'だけ', 'しか', 'など',
    'は', 'が', 'を', 'に', 'へ', 'と', 'で', 'の', 'や',
];
const KANA_FINAL_PARTICLE_CONTINUATIONS = ['かしら', 'かな', 'っけ', 'ね', 'な', 'か', 'よ', 'わ', 'ぞ', 'ぜ', 'さ'];
// The grammar-boundary set for span shapes: the case particles plus な, whose
// standalone segment marks an adjectival boundary (好き|な|もの). Membership
// is judged on segments the target's own segmentation isolated, so a word
// merely containing の or な as characters is never affected.
const SPAN_BOUNDARY_PARTICLES = [...KANA_CASE_PARTICLE_CONTINUATIONS, 'な'];

let standaloneGrammarParticleSet: Set<string> | undefined;

function standaloneGrammarParticles(): Set<string> {
    standaloneGrammarParticleSet ??= new Set([
        ...SPAN_BOUNDARY_PARTICLES,
        ...KANA_FINAL_PARTICLE_CONTINUATIONS,
    ]);
    return standaloneGrammarParticleSet;
}

/**
 * The authoritative token under one source offset, from an already-parsed
 * token list. Kept pure so the app can feed it its own cached parse: the
 * pointer pipeline and the rendered-word upgrade both pick through here,
 * which is what keeps hover, click, and tap answers identical.
 *
 * Annotation needs a token over every character, so segmented fallback covers
 * standalone particles too. A pointer asking "what word is this?" over a bare
 * は or を deserves silence, not an empty card — unless a dictionary actually
 * confirmed something there.
 */
export function pickAuthoritativeTokenAt(
    tokens: readonly JPDBToken[],
    text: string,
    offset: number,
    range: { start: number; end: number } = { start: 0, end: text.length },
): JPDBToken | undefined {
    const start = Math.max(0, Math.min(range.start, text.length));
    const end = Math.max(start, Math.min(range.end, text.length));
    if (offset < start || offset >= end) return undefined;
    const token = tokens.find(item => item.start >= start
        && item.end <= end
        && item.start <= offset
        && offset < item.end);
    if (!token) return undefined;
    if (token.card.source !== 'fallback') return token;
    const surface = text.slice(token.start, token.end);
    if (standaloneGrammarParticles().has(surface)) return undefined;
    // A lone kanji the parse could not attach to any word is a character, not
    // a word: the kanji-card surfaces own that tap, and a reading-less
    // one-character "word" card would only shadow them.
    if (surface.length === 1 && KANJI_CHARACTER_RE.test(surface)) return undefined;
    return token;
}

function endsInsideKanaRun(text: string, end: number): boolean {
    if (end <= 0 || end >= text.length) return false;
    if (!KANA_RUN_CHARACTER_RE.test(text[end - 1]) || !KANA_RUN_CHARACTER_RE.test(text[end])) return false;
    if (KANA_CASE_PARTICLE_CONTINUATIONS.some(particle => text.startsWith(particle, end))) return false;
    let cursor = end;
    let consumedFinal = true;
    while (consumedFinal && cursor < text.length) {
        consumedFinal = false;
        for (const particle of KANA_FINAL_PARTICLE_CONTINUATIONS) {
            if (!text.startsWith(particle, cursor)) continue;
            cursor += particle.length;
            consumedFinal = true;
            break;
        }
    }
    if (cursor > end && (cursor >= text.length || !KANA_RUN_CHARACTER_RE.test(text[cursor]))) return false;
    return true;
}

function authoritativeCardsFromParsedTerms(
    terms: readonly string[],
    parsed: readonly JPDBToken[][],
    target: LearningTargetModule,
): Map<string, JPDBCard[]> {
    const result = new Map<string, JPDBCard[]>();
    terms.forEach((term, index) => {
        const key = target.normalizeText(term);
        const cards = (parsed[index] ?? [])
            .map(token => token.card)
            .filter(card => card.source !== 'fallback' && cardMatchesLookupTerm(card, key, target));
        if (cards.length) result.set(key, cards);
    });
    return result;
}

function cardMatchesLookupTerm(
    card: JPDBCard,
    term: string,
    target: LearningTargetModule,
): boolean {
    return [card.spelling, card.reading].some(value => target.normalizeText(value) === term);
}

function parserSpanRulesMatch(
    card: JPDBCard,
    request: TermSpanLookupCandidate,
    target: LearningTargetModule,
): boolean {
    if (!request.lookupCandidate.rules.length) return true;
    const rules = [
        ...card.partOfSpeech,
        ...card.meanings.flatMap(meaning => meaning.partOfSpeech),
    ].filter(Boolean).join(' ');
    return target.matchesLookupCandidateRules(rules, request.lookupCandidate.rules);
}

function authoritativeTokenFromSpan(
    text: string,
    span: ConfirmedTermSpan<ParserSpanMatch> | FallbackTermSpan<JPDBCard>,
    decorations: readonly JPDBToken[],
): JPDBToken {
    if (span.kind === 'fallback') {
        return {
            card: span.fallback,
            start: span.start,
            end: span.end,
            length: span.end - span.start,
            rubies: [],
            pitchClass: '',
            sentence: text,
        };
    }
    const card = span.match.card;
    const decoration = decorations.find(token => cardsShareEvidenceIdentity(token.card, card));
    if (decoration?.card === card
        && decoration.start === span.start
        && decoration.end === span.end
        && decoration.length === span.end - span.start
        && (decoration.sentence ?? text) === text
        && text.slice(decoration.start, decoration.end) === span.surface) {
        return decoration;
    }
    const rubies = decoration
        ? authoritativeDecorationRubies(text, span, decoration)
        : [];
    return {
        ...(decoration ?? {}),
        card,
        start: span.start,
        end: span.end,
        length: span.end - span.start,
        rubies: rubies.length ? rubies : authoritativeCardRubies(span, card),
        pitchClass: getPitchClass(card.pitchAccent, card.reading || card.spelling),
        sentence: text,
    };
}

function authoritativeDecorationRubies(
    text: string,
    span: ConfirmedTermSpan<ParserSpanMatch>,
    decoration: JPDBToken,
): JPDBToken['rubies'] {
    const decorationSurface = text.slice(decoration.start, decoration.end);
    if (decorationSurface !== span.surface) return [];
    return decoration.rubies.flatMap(ruby => {
        const relativeStart = ruby.start - decoration.start;
        const relativeEnd = ruby.end - decoration.start;
        if (relativeStart < 0 || relativeEnd <= relativeStart || relativeEnd > span.end - span.start) return [];
        const start = span.start + relativeStart;
        const end = span.start + relativeEnd;
        return [{ ...ruby, start, end, length: end - start }];
    });
}

function authoritativeCardRubies(
    span: ConfirmedTermSpan<ParserSpanMatch>,
    card: JPDBCard,
): JPDBToken['rubies'] {
    const reading = card.reading.trim();
    if (!reading || reading === span.surface) return [];
    return inferredInflectedSurfaceRubies(span.surface, card.spelling, reading).map(ruby => ({
        ...ruby,
        start: span.start + ruby.start,
        end: span.start + ruby.end,
    }));
}

function firstLocalPitchPattern(resolution: LocalPitchResolution): string {
    return resolution.patterns[0] ?? '';
}

function remoteParseFallbackTimeoutMs(options: ReaderParserParseOptions): number {
    return (options.allowApiTimeoutFallback ?? options.allowJpdbTimeoutFallback)
        ? options.apiTimeoutMs ?? options.jpdbTimeoutMs ?? JPDB_PARSE_FALLBACK_TIMEOUT_MS
        : 0;
}

function shouldTryLocalKanjiRubySplit(base: string, reading: string): boolean {
    return Array.from(base).length >= 2
        && LOCAL_RUBY_SPLIT_BASE_RE.test(base)
        && LOCAL_RUBY_SPLIT_KANJI_RE.test(base)
        && LOCAL_RUBY_SPLIT_READING_RE.test(reading.trim());
}

function rubiesEqual(first: JPDBToken['rubies'], second: JPDBToken['rubies']): boolean {
    return first.length === second.length
        && first.every((ruby, index) => {
            const other = second[index];
            return Boolean(other)
                && ruby.text === other.text
                && ruby.start === other.start
                && ruby.end === other.end
                && ruby.length === other.length;
        });
}

function shouldUseJitenParser(settings: ReaderSettings, options: ReaderParserParseOptions, jiten: JitenApiClient | undefined): boolean {
    return Boolean(hasJitenApiCredential(settings) && jiten && !shouldSkipApiParser(options));
}

function shouldPreferJitenParser(settings: ReaderSettings, options: ReaderParserParseOptions, jiten: JitenApiClient | undefined): boolean {
    return shouldUseJitenParser(settings, options, jiten) && options.requireJpdb !== true;
}

function shouldSkipApiParser(options: ReaderParserParseOptions): boolean {
    return Boolean(options.skipApi ?? options.skipJpdb);
}

function remoteParseErrorMessage(source: 'JPDB' | 'Jiten', options: ReaderParserParseOptions, canFallback: boolean): string {
    if (shouldRequireRemoteParse(options)) return `${source}-first parse failed without local fallback`;
    return canFallback
        ? `${source} parse failed; using local or segmented fallback`
        : `${source} parse failed without fallback`;
}

function shouldRethrowRemoteParseError(options: ReaderParserParseOptions, canFallback: boolean): boolean {
    return shouldRequireRemoteParse(options) || !canFallback;
}

function shouldRequireRemoteParse(options: ReaderParserParseOptions): boolean {
    return options.requireApi === true || options.requireJpdb === true;
}

function localPitchCacheKey(card: JPDBCard, settings: ReaderSettings): string {
    return JSON.stringify({
        spelling: card.spelling,
        reading: card.reading,
        dictionaries: settings.dictionaryPreferences.map(preference => ({
            name: preference.name,
            enabled: preference.enabled,
            priority: preference.priority,
        })),
    });
}

function localParseCacheKey(
    text: string,
    options: ReaderParserParseOptions,
    settings: ReaderSettings,
    target: LearningTargetModule,
): string {
    const localDictionariesEnabled = settings.localDictionariesEnabled;
    return JSON.stringify({
        text,
        target: target.id,
        language: target.language,
        localDictionariesEnabled,
        allowSegmentedFallback: options.allowSegmentedFallback === true,
        includeLocalPitch: localDictionariesEnabled && settings.showPitchAccent && options.includeLocalPitch !== false,
        dictionaries: localDictionariesEnabled ? settings.dictionaryPreferences.map(preference => ({
            name: preference.name,
            enabled: preference.enabled,
            priority: preference.priority,
        })) : [],
    });
}

export function fallbackLookupTermAtOffset(text: string, offset: number): string {
    const range = fallbackLookupRangeAtOffset(text, offset);
    if (range) return normalizeFallbackTerm(text.slice(range.start, range.end));
    return normalizeFallbackTerm(text);
}

export function fallbackLookupRangeAtOffset(text: string, offset: number): { start: number; end: number } | undefined {
    const clampedOffset = Math.max(0, Math.min(offset, Math.max(0, text.length - 1)));
    const segment = segmentTargetLanguageText(text).find(item => offsetInsideFallbackMatch(item.start, item.end, clampedOffset));
    if (segment) return { start: segment.start, end: segment.end };
    for (const match of text.matchAll(JAPANESE_SCRIPT_GROUP_RE)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (offsetInsideFallbackMatch(start, end, clampedOffset)) {
            return { start, end };
        }
    }
    return undefined;
}

function offsetInsideFallbackMatch(start: number, end: number, offset: number): boolean {
    return start <= offset && offset < end;
}

function rangesOverlap(start: number, end: number, otherStart: number, otherEnd: number): boolean {
    return start < otherEnd && otherStart < end;
}

function compareTokensByOffset(a: JPDBToken, b: JPDBToken): number {
    return a.start - b.start || b.length - a.length;
}

function cardUsesReaderLocalCache(card: JPDBCard): boolean {
    return Boolean((card.source && card.source !== 'jpdb') || card.vid <= 0 || card.sid <= 0);
}

export function cardWithPreservedCachedEvidence(incoming: JPDBCard, cached: JPDBCard, surface?: string): JPDBCard {
    if (!cardsShareEvidenceIdentity(incoming, cached)) return incoming;
    const evidence = preservedCachedLexicalEvidence(incoming, cached, surface);
    const preserveCachedState = evidence.preserve
        && incoming.provisionalState === true
        && cached.provisionalState !== true;
    if (!evidence.stronger && !preserveCachedState) return incoming;
    const preserveCachedSpelling = evidence.suppliesReading
        || (evidence.stronger && incoming.spelling.trim() !== cached.spelling.trim());

    return {
        ...incoming,
        // A compatible detail record's canonical spelling belongs with its
        // reading. The painted DOM surface remains the paragraph slice at the
        // token's start/end; an unrelated same-id surface never reaches here.
        spelling: preserveCachedSpelling ? cached.spelling : incoming.spelling,
        reading: evidence.suppliesReading ? cached.reading : incoming.reading,
        pitchAccent: evidence.pitchAccent,
        pitchComponents: evidence.pitchComponents,
        wordWithReading: evidence.wordWithReading,
        meanings: incoming.meanings.length || !evidence.preserve ? incoming.meanings : cached.meanings,
        partOfSpeech: incoming.partOfSpeech.length || !evidence.preserve
            ? incoming.partOfSpeech
            : cached.partOfSpeech,
        frequencyRank: evidence.preserve
            ? incoming.frequencyRank ?? cached.frequencyRank
            : incoming.frequencyRank,
        ...(preserveCachedState ? {
            cardState: cached.cardState,
            provisionalState: cached.provisionalState,
            reviewSource: cached.reviewSource,
            dueAt: cached.dueAt,
            lastReviewAt: cached.lastReviewAt,
            deckNames: cached.deckNames,
            sourceDeckName: cached.sourceDeckName,
        } : {}),
    };
}

function preservedCachedLexicalEvidence(incoming: JPDBCard, cached: JPDBCard, surface?: string) {
    const incomingReading = incoming.reading.trim();
    const cachedReading = cached.reading.trim();
    const readingsAreCompatible = !incomingReading || !cachedReading || incomingReading === cachedReading;
    const surfaceAcceptsCachedLexicalEvidence = cachedEvidenceMatchesSurface(incoming, cached, surface);
    const suppliesReading = !incomingReading && Boolean(cachedReading) && surfaceAcceptsCachedLexicalEvidence;
    const preserve = readingsAreCompatible && surfaceAcceptsCachedLexicalEvidence;
    const pitchAccent = preserve
        ? [...incoming.pitchAccent, ...cached.pitchAccent.filter(pattern => !incoming.pitchAccent.includes(pattern))]
        : incoming.pitchAccent;
    const pitchComponents = preserve
        ? (incoming.pitchComponents?.length ? incoming.pitchComponents : cached.pitchComponents)
        : incoming.pitchComponents;
    const wordWithReading = preserve
        ? incoming.wordWithReading || cached.wordWithReading
        : incoming.wordWithReading;
    const stronger = preserve && (
        suppliesReading
        || pitchAccent.length !== incoming.pitchAccent.length
        || Boolean(pitchComponents?.length && !incoming.pitchComponents?.length)
        || Boolean(wordWithReading && !incoming.wordWithReading)
        || (!incoming.meanings.length && cached.meanings.length > 0)
        || (!incoming.partOfSpeech.length && cached.partOfSpeech.length > 0)
        || (incoming.frequencyRank === null && cached.frequencyRank !== null)
    );
    return { preserve, suppliesReading, pitchAccent, pitchComponents, wordWithReading, stronger };
}

function cardsShareEvidenceIdentity(first: JPDBCard, second: JPDBCard): boolean {
    return normalizedCardSource(first) === normalizedCardSource(second)
        && normalizedCardLanguage(first) === normalizedCardLanguage(second)
        && first.vid === second.vid
        && first.sid === second.sid;
}

function cachedEvidenceMatchesSurface(incoming: JPDBCard, cached: JPDBCard, surface?: string): boolean {
    const visibleSurface = surface?.trim() ?? '';
    const cachedSpelling = cached.spelling.trim();
    if (!visibleSurface) return incoming.spelling.trim() === cachedSpelling;
    if (visibleSurface === cachedSpelling) return true;
    if (!cached.reading.trim()) return false;
    // This is the same conservative alignment used by ruby rendering. It
    // accepts real kana inflections (話す -> 話した, 接続 -> 接続して), while
    // rejecting a same-id spelling collision such as 接続先.
    return inferredInflectedSurfaceRubies(visibleSurface, cachedSpelling, cached.reading).length > 0;
}

function normalizedCardSource(card: JPDBCard): NonNullable<JPDBCard['source']> {
    return card.source ?? 'jpdb';
}

function normalizedCardLanguage(card: JPDBCard): NonNullable<JPDBCard['language']> {
    return card.language ?? 'ja';
}

function cardEvidenceCacheKey(card: JPDBCard): string {
    return `${normalizedCardSource(card)}:${normalizedCardLanguage(card)}:${card.vid}:${card.sid}`;
}

function cardCacheKey(vid: number, sid: number): string {
    return `${vid}:${sid}`;
}

function isCurrentLearningTarget(target: LearningTargetModule, generation: number): boolean {
    return activeLearningTarget() === target
        && activeLearningTargetGeneration() === generation;
}

function emptyParseResult(paragraphs: readonly string[]): JPDBToken[][] {
    return paragraphs.map(() => []);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorFactory: () => Error): Promise<T> {
    let timeoutId = 0;
    const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(errorFactory()), timeoutMs);
    });
    return Promise.race([
        promise,
        timeout,
    ]).finally(() => window.clearTimeout(timeoutId));
}
