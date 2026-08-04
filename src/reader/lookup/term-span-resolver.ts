import type {
    LanguageLookupCandidate,
    LearningTargetModule,
} from '../languages/types';

/** The target-owned morphology needed to turn a source surface into lookup candidates. */
export type TermSpanLookupTarget = Pick<
    LearningTargetModule,
    'lookupCandidates' | 'compareLookupCandidates'
>;

/** A bounded UTF-16 source range. `end` defaults to the end of `text`. */
export interface TermSpanSource {
    readonly text: string;
    readonly start: number;
    readonly end?: number;
}

/**
 * One dictionary query. The source span deliberately is not exposed here:
 * an Adapter may confirm the lexical analysis, but it cannot redefine which
 * page characters produced that analysis.
 */
export interface TermSpanLookupCandidate {
    readonly surface: string;
    readonly lookupCandidate: LanguageLookupCandidate;
}

/**
 * Dictionary Adapter seam. Returning an entry under the exact request object
 * confirms that candidate; absent requests are misses. The resolver reads the
 * map in its own deterministic priority order, never in Adapter insertion
 * order.
 */
export interface TermSpanCandidateLookup<TMatch> {
    lookup(
        candidates: readonly TermSpanLookupCandidate[],
    ): Promise<ReadonlyMap<TermSpanLookupCandidate, TMatch>>;
}

/** The only range in which fallback is allowed to paint at this source offset. */
export interface TermSpanFallbackRequest {
    readonly text: string;
    readonly start: number;
    readonly end: number;
}

/**
 * A fallback span starts at the requested offset and must end inside the
 * requested gap. Invalid or overlapping responses are discarded.
 */
export interface TermSpanFallbackMatch<TFallback> {
    readonly start: number;
    readonly end: number;
    readonly value: TFallback;
}

export interface TermSpanFallbackProvider<TFallback> {
    spanAt(
        request: TermSpanFallbackRequest,
    ): TermSpanFallbackMatch<TFallback> | null | Promise<TermSpanFallbackMatch<TFallback> | null>;
}

export interface ConfirmedTermSpan<TMatch> {
    readonly kind: 'confirmed';
    readonly start: number;
    readonly end: number;
    readonly surface: string;
    readonly lookupCandidate: LanguageLookupCandidate;
    readonly match: TMatch;
}

export interface FallbackTermSpan<TFallback> {
    readonly kind: 'fallback';
    readonly start: number;
    readonly end: number;
    readonly surface: string;
    readonly fallback: TFallback;
}

export type ResolvedTermSpan<TMatch, TFallback = never> =
    | ConfirmedTermSpan<TMatch>
    | FallbackTermSpan<TFallback>;

/** A planned span offered to the pre-confirmation oracle. */
export interface TermSpanPreconfirmCandidate {
    readonly start: number;
    readonly end: number;
    readonly surface: string;
    readonly lookupCandidate: LanguageLookupCandidate;
}

/** Neighborhood the admit filter may consult when judging a confirmed span. */
export interface TermSpanAdmitContext {
    hasConfirmedSpanAt(offset: number): boolean;
}

export interface TermSpanResolverOptions<TMatch, TFallback = never> {
    readonly target: TermSpanLookupTarget;
    readonly lookup: TermSpanCandidateLookup<TMatch>;
    readonly fallback?: TermSpanFallbackProvider<TFallback>;
    /**
     * Synchronous confirmation for spans something already analyzed — e.g. a
     * provider's parse of this exact paragraph whose token aligns with the
     * planned span. Like the async lookup it can only answer yes or no for a
     * span the resolver proposed; it cannot introduce spans of its own.
     * Confirmed candidates skip the batched lookup.
     */
    readonly preconfirm?: (candidate: TermSpanPreconfirmCandidate) => TMatch | null | undefined;
    /**
     * Planning filter: a span rejected here is never offered to preconfirm or
     * to the lookup at all. This is where a source-language policy bounds the
     * query fan-out — e.g. a span crossing a standalone particle can never be
     * one word, so asking the dictionary about it is pure waste.
     */
    readonly plan?: (candidate: TermSpanPreconfirmCandidate) => boolean;
    /**
     * Final say over a confirmed span before it is accepted. The lookup can
     * only judge a candidate in isolation; this filter sees it with the match
     * attached and may veto shapes the caller distrusts (a source-language
     * policy, not a lookup concern). A vetoed span loses to the next shorter
     * candidate at the same start, exactly as if it had not been confirmed.
     * The context reports whether some confirmed span begins at an offset, so
     * a policy can distinguish "this word ends where the next one starts"
     * from "this word strands the rest of its segment".
     */
    readonly admit?: (
        candidate: TermSpanPreconfirmCandidate,
        match: TMatch,
        context: TermSpanAdmitContext,
    ) => boolean;
    /** Maximum original-source UTF-16 length considered from one start. */
    readonly maximumSourceLength?: number;
}

interface SourceRange {
    readonly text: string;
    readonly start: number;
    readonly end: number;
}

interface PlannedCandidate {
    readonly start: number;
    readonly end: number;
    readonly request: TermSpanLookupCandidate;
}

/**
 * The single authority for lexical spans.
 *
 * Source prefixes are enumerated longest-first on Unicode code-point
 * boundaries. The learning target owns morphology and ranking; the injected
 * lookup only confirms candidates. Consequently a deinflected lemma or a
 * provider's own offset metadata can never rewrite the original source span.
 */
export class TermSpanResolver<TMatch, TFallback = never> {
    readonly #target: TermSpanLookupTarget;
    readonly #lookup: TermSpanCandidateLookup<TMatch>;
    readonly #fallback?: TermSpanFallbackProvider<TFallback>;
    readonly #preconfirm?: (candidate: TermSpanPreconfirmCandidate) => TMatch | null | undefined;
    readonly #plan?: (candidate: TermSpanPreconfirmCandidate) => boolean;
    readonly #admit?: (candidate: TermSpanPreconfirmCandidate, match: TMatch, context: TermSpanAdmitContext) => boolean;
    readonly #maximumSourceLength: number;

    constructor(options: TermSpanResolverOptions<TMatch, TFallback>) {
        this.#target = options.target;
        this.#lookup = options.lookup;
        this.#fallback = options.fallback;
        this.#preconfirm = options.preconfirm;
        this.#plan = options.plan;
        this.#admit = options.admit;
        this.#maximumSourceLength = Math.max(1, Math.floor(options.maximumSourceLength ?? 18));
    }

    /** Resolve the longest provider-confirmed term beginning at `source.start`. */
    async resolveAt(source: TermSpanSource): Promise<ConfirmedTermSpan<TMatch> | null> {
        const range = sourceRange(source);
        if (range.start === range.end) return null;

        const planned = this.#candidatesAt(range, range.start);
        if (!planned.length) return null;

        const confirmations = await this.#confirm(planned);
        return firstConfirmedSpan(
            range.text,
            planned,
            confirmations,
            this.#admit,
            singleStartAdmitContext(planned, confirmations),
        );
    }

    /**
     * Resolve all confirmed terms in reading order, advancing by each winning
     * span. Fallback is considered only after confirmed spans are fixed and is
     * bounded to the uncovered gaps between them.
     */
    async resolveAll(source: TermSpanSource): Promise<ResolvedTermSpan<TMatch, TFallback>[]> {
        const range = sourceRange(source);
        if (range.start === range.end) return [];

        const plannedByStart = new Map<number, PlannedCandidate[]>();
        const allPlanned: PlannedCandidate[] = [];
        for (const start of codePointStarts(range.text, range.start, range.end)) {
            const planned = this.#candidatesAt(range, start);
            plannedByStart.set(start, planned);
            allPlanned.push(...planned);
        }

        const confirmations = await this.#confirm(allPlanned);
        const confirmed = this.#confirmedSpans(range, plannedByStart, confirmations);
        if (!this.#fallback) return confirmed;

        return this.#withFallbackSpans(range, confirmed, this.#fallback);
    }

    async #confirm(planned: readonly PlannedCandidate[]): Promise<ReadonlyMap<TermSpanLookupCandidate, TMatch>> {
        const preconfirmed = new Map<TermSpanLookupCandidate, TMatch>();
        const pending: PlannedCandidate[] = [];
        for (const item of planned) {
            const match = this.#preconfirm?.({
                start: item.start,
                end: item.end,
                surface: item.request.surface,
                lookupCandidate: item.request.lookupCandidate,
            });
            if (match === null || match === undefined) {
                pending.push(item);
                continue;
            }
            preconfirmed.set(item.request, match);
        }
        if (!pending.length) return preconfirmed;
        const looked = await this.#lookup.lookup(pending.map(item => item.request));
        if (!preconfirmed.size) return looked;
        for (const [request, match] of looked) preconfirmed.set(request, match);
        return preconfirmed;
    }

    #candidatesAt(range: SourceRange, start: number): PlannedCandidate[] {
        const planned: PlannedCandidate[] = [];
        const maximumEnd = Math.min(range.end, start + this.#maximumSourceLength);
        for (const end of codePointEndsLongestFirst(range.text, start, maximumEnd)) {
            const surface = range.text.slice(start, end);
            if (this.#plan && !this.#plan({
                start,
                end,
                surface,
                // The identity candidate stands in for the span at planning
                // time; per-deinflection planning would re-ask the same
                // span-shape question with the same answer.
                lookupCandidate: { term: surface, rules: [], reasons: [], depth: 0 },
            })) {
                continue;
            }
            const lookupCandidates = [...this.#target.lookupCandidates(surface)]
                .map((lookupCandidate, order) => ({ lookupCandidate, order }))
                .sort((a, b) => this.#target.compareLookupCandidates(
                    a.lookupCandidate,
                    b.lookupCandidate,
                ) || a.order - b.order);
            for (const { lookupCandidate } of lookupCandidates) {
                planned.push({
                    start,
                    end,
                    request: { surface, lookupCandidate },
                });
            }
        }
        return planned;
    }

    #confirmedSpans(
        range: SourceRange,
        plannedByStart: ReadonlyMap<number, readonly PlannedCandidate[]>,
        confirmations: ReadonlyMap<TermSpanLookupCandidate, TMatch>,
    ): ConfirmedTermSpan<TMatch>[] {
        const confirmed: ConfirmedTermSpan<TMatch>[] = [];
        const admitContext: TermSpanAdmitContext = {
            hasConfirmedSpanAt: offset => (plannedByStart.get(offset) ?? [])
                .some(item => confirmations.has(item.request)),
        };
        let cursor = range.start;
        while (cursor < range.end) {
            const winner = firstConfirmedSpan(
                range.text,
                plannedByStart.get(cursor) ?? [],
                confirmations,
                this.#admit,
                admitContext,
            );
            if (winner) {
                confirmed.push(winner);
                cursor = winner.end;
                continue;
            }
            cursor = nextCodePointOffset(range.text, cursor);
        }
        return confirmed;
    }

    async #withFallbackSpans(
        range: SourceRange,
        confirmed: readonly ConfirmedTermSpan<TMatch>[],
        fallback: TermSpanFallbackProvider<TFallback>,
    ): Promise<ResolvedTermSpan<TMatch, TFallback>[]> {
        const resolved: ResolvedTermSpan<TMatch, TFallback>[] = [];
        let gapStart = range.start;
        for (const span of confirmed) {
            resolved.push(...await fallbackSpansInGap(range.text, gapStart, span.start, fallback));
            resolved.push(span);
            gapStart = span.end;
        }
        resolved.push(...await fallbackSpansInGap(range.text, gapStart, range.end, fallback));
        return resolved;
    }
}

function singleStartAdmitContext<TMatch>(
    planned: readonly PlannedCandidate[],
    confirmations: ReadonlyMap<TermSpanLookupCandidate, TMatch>,
): TermSpanAdmitContext {
    return {
        hasConfirmedSpanAt: offset => planned
            .some(item => item.start === offset && confirmations.has(item.request)),
    };
}

function firstConfirmedSpan<TMatch>(
    text: string,
    planned: readonly PlannedCandidate[],
    confirmations: ReadonlyMap<TermSpanLookupCandidate, TMatch>,
    admit?: (candidate: TermSpanPreconfirmCandidate, match: TMatch, context: TermSpanAdmitContext) => boolean,
    admitContext: TermSpanAdmitContext = { hasConfirmedSpanAt: () => false },
): ConfirmedTermSpan<TMatch> | null {
    for (const item of planned) {
        if (!confirmations.has(item.request)) continue;
        // Map.get is present after Map.has; TMatch itself remains opaque and
        // may legitimately contain fields named start/end, which are never
        // consulted when constructing the authoritative source span.
        const match = confirmations.get(item.request) as TMatch;
        const surface = text.slice(item.start, item.end);
        if (admit && !admit({
            start: item.start,
            end: item.end,
            surface,
            lookupCandidate: item.request.lookupCandidate,
        }, match, admitContext)) continue;
        return {
            kind: 'confirmed',
            start: item.start,
            end: item.end,
            surface,
            lookupCandidate: item.request.lookupCandidate,
            match,
        };
    }
    return null;
}

async function fallbackSpansInGap<TFallback>(
    text: string,
    start: number,
    end: number,
    fallback: TermSpanFallbackProvider<TFallback>,
): Promise<FallbackTermSpan<TFallback>[]> {
    const spans: FallbackTermSpan<TFallback>[] = [];
    let cursor = start;
    while (cursor < end) {
        const candidate = await fallback.spanAt({ text, start: cursor, end });
        if (isValidFallbackSpan(text, cursor, end, candidate)) {
            spans.push({
                kind: 'fallback',
                start: candidate.start,
                end: candidate.end,
                surface: text.slice(candidate.start, candidate.end),
                fallback: candidate.value,
            });
            cursor = candidate.end;
            continue;
        }
        cursor = nextCodePointOffset(text, cursor);
    }
    return spans;
}

function isValidFallbackSpan<TFallback>(
    text: string,
    expectedStart: number,
    maximumEnd: number,
    candidate: TermSpanFallbackMatch<TFallback> | null,
): candidate is TermSpanFallbackMatch<TFallback> {
    return candidate !== null
        && Number.isInteger(candidate.start)
        && Number.isInteger(candidate.end)
        && candidate.start === expectedStart
        && candidate.end > candidate.start
        && candidate.end <= maximumEnd
        && isCodePointBoundary(text, candidate.start)
        && isCodePointBoundary(text, candidate.end);
}

function sourceRange(source: TermSpanSource): SourceRange {
    const end = source.end ?? source.text.length;
    if (!Number.isInteger(source.start)
        || !Number.isInteger(end)
        || source.start < 0
        || end < source.start
        || end > source.text.length
        || !isCodePointBoundary(source.text, source.start)
        || !isCodePointBoundary(source.text, end)) {
        throw new RangeError('Term span source must use valid UTF-16 code-point boundaries.');
    }
    return { text: source.text, start: source.start, end };
}

function codePointStarts(text: string, start: number, end: number): number[] {
    const starts: number[] = [];
    let cursor = start;
    while (cursor < end) {
        starts.push(cursor);
        cursor = nextCodePointOffset(text, cursor);
    }
    return starts;
}

function codePointEndsLongestFirst(text: string, start: number, end: number): number[] {
    const ends: number[] = [];
    let cursor = start;
    while (cursor < end) {
        const next = nextCodePointOffset(text, cursor);
        if (next > end) break;
        cursor = next;
        ends.push(cursor);
    }
    return ends.reverse();
}

function nextCodePointOffset(text: string, offset: number): number {
    const codePoint = text.codePointAt(offset);
    return offset + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
}

function isCodePointBoundary(text: string, offset: number): boolean {
    if (offset <= 0 || offset >= text.length) return true;
    const before = text.charCodeAt(offset - 1);
    const after = text.charCodeAt(offset);
    return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}
