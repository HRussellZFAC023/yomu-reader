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

export interface TermSpanResolverOptions<TMatch, TFallback = never> {
    readonly target: TermSpanLookupTarget;
    readonly lookup: TermSpanCandidateLookup<TMatch>;
    readonly fallback?: TermSpanFallbackProvider<TFallback>;
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
    readonly #maximumSourceLength: number;

    constructor(options: TermSpanResolverOptions<TMatch, TFallback>) {
        this.#target = options.target;
        this.#lookup = options.lookup;
        this.#fallback = options.fallback;
        this.#maximumSourceLength = Math.max(1, Math.floor(options.maximumSourceLength ?? 18));
    }

    /** Resolve the longest provider-confirmed term beginning at `source.start`. */
    async resolveAt(source: TermSpanSource): Promise<ConfirmedTermSpan<TMatch> | null> {
        const range = sourceRange(source);
        if (range.start === range.end) return null;

        const planned = this.#candidatesAt(range, range.start);
        if (!planned.length) return null;

        const confirmations = await this.#lookup.lookup(planned.map(item => item.request));
        return firstConfirmedSpan(range.text, planned, confirmations);
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

        const confirmations: ReadonlyMap<TermSpanLookupCandidate, TMatch> = allPlanned.length
            ? await this.#lookup.lookup(allPlanned.map(item => item.request))
            : new Map<TermSpanLookupCandidate, TMatch>();
        const confirmed = this.#confirmedSpans(range, plannedByStart, confirmations);
        if (!this.#fallback) return confirmed;

        return this.#withFallbackSpans(range, confirmed, this.#fallback);
    }

    #candidatesAt(range: SourceRange, start: number): PlannedCandidate[] {
        const planned: PlannedCandidate[] = [];
        const maximumEnd = Math.min(range.end, start + this.#maximumSourceLength);
        for (const end of codePointEndsLongestFirst(range.text, start, maximumEnd)) {
            const surface = range.text.slice(start, end);
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
        let cursor = range.start;
        while (cursor < range.end) {
            const winner = firstConfirmedSpan(
                range.text,
                plannedByStart.get(cursor) ?? [],
                confirmations,
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

function firstConfirmedSpan<TMatch>(
    text: string,
    planned: readonly PlannedCandidate[],
    confirmations: ReadonlyMap<TermSpanLookupCandidate, TMatch>,
): ConfirmedTermSpan<TMatch> | null {
    for (const item of planned) {
        if (!confirmations.has(item.request)) continue;
        return {
            kind: 'confirmed',
            start: item.start,
            end: item.end,
            surface: text.slice(item.start, item.end),
            lookupCandidate: item.request.lookupCandidate,
            // Map.get is present after Map.has; TMatch itself remains opaque and
            // may legitimately contain fields named start/end, which are never
            // consulted when constructing the authoritative source span.
            match: confirmations.get(item.request) as TMatch,
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
