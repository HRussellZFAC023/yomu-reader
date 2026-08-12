import { promiseWithTimeout } from '../core/async-utils';
import { cardKey } from '../cards/utils';
import {
    parsedCardHydrationKey,
    publicJitenBackoffRemainingMs,
} from '../dictionaries/jiten-public-vocabulary';
import { readerWordSurfaceText } from '../dom';
import { fallbackVocabularySpanCacheKey, renderedWordsInRoot } from '../dom/rendered-word-state';
import { renderedWordPrivateValue } from '../dom/rendered-word-private-state';
import { getPitchClass } from '../jpdb/jpdb-parser';
import { jitenWordCardForMassReview } from '../main/rendered-word-lookup';
import { isKanjiCharacter } from '../popup/pitch';
import {
    DEFERRED_PUBLIC_PITCH_BACKOFF_WAIT_MS,
    DEFERRED_PUBLIC_PITCH_ENRICHMENT_IDLE_TIMEOUT_MS,
    DEFERRED_PUBLIC_PITCH_HOVER_PAUSE_MS,
    DEFERRED_PUBLIC_PITCH_PER_URL_CAP,
    PITCH_ENRICHMENT_LIMIT,
} from './main-helpers';
import { cardHasContextPitch, isHydratablePublicJitenCard } from './main-lookup-helpers';
import type { CardLookupTargetSnapshot } from './card-lookup-session';
import { Logger } from './logger';
import type { JPDBCard, JPDBToken } from './types';

interface DeferredPublicJitenReadingWork {
    card: JPDBCard;
    tokens: Set<JPDBToken>;
    attempts: number;
    urgent: boolean;
}

export interface DeferredPublicJitenReadingDrainOptions {
    foreground?: boolean;
    maxBatches?: number;
}

export interface DeferredPublicJitenReadingDependencies {
    isDestroyed: () => boolean;
    shouldEnrich: () => boolean;
    captureTarget: () => CardLookupTargetSnapshot;
    lookupCards: (
        cards: readonly JPDBCard[],
        scope: CardLookupTargetSnapshot,
    ) => Promise<Map<string, JPDBCard>>;
    applyResolvedCard: (
        token: JPDBToken,
        fallback: JPDBCard,
        card: JPDBCard,
        pitchClass: string,
    ) => Promise<void>;
    queueSubtitleRefresh: (sentence: string | undefined) => void;
    cacheCards: (cards: JPDBCard[]) => void;
    scheduleDeferredPitch: (tokens: JPDBToken[]) => void;
    showPitchAccent: () => boolean;
    hasUnresolvedFallback: (key: string) => boolean;
    rememberUnresolvedFallback: (key: string) => void;
    forgetUnresolvedFallback: (key: string) => void;
    shouldPauseBackground: () => boolean;
    waitForIdle: (timeoutMs?: number) => Promise<void>;
    renderedAnnotationRoots: () => Iterable<ParentNode>;
    renderedWordToken: (word: HTMLElement) => JPDBToken | null;
}

export interface PublicFallbackPitchResolutionOptions {
    publicLookupTermLimit?: number;
    jpdbPublicLookup?: boolean;
    urgent?: boolean;
}

export interface PublicFallbackPitchResolutionDependencies {
    captureTarget: () => CardLookupTargetSnapshot;
    hasUnresolvedFallback: (key: string) => boolean;
    lookupFallbackCards: (
        cards: readonly JPDBCard[],
        options: PublicFallbackPitchResolutionOptions,
        scope: CardLookupTargetSnapshot,
    ) => Promise<Map<string, JPDBCard>>;
    lookupJitenCards: (
        cards: readonly JPDBCard[],
        scope: CardLookupTargetSnapshot,
    ) => Promise<Map<string, JPDBCard>>;
    noteFallbackMiss: (key: string, tokens: JPDBToken[]) => void;
    showPitchAccent: () => boolean;
    rememberResolvedFallback: (token: JPDBToken, fallback: JPDBCard, card: JPDBCard) => void;
    applyResolvedCard: (
        token: JPDBToken,
        fallback: JPDBCard,
        card: JPDBCard,
        pitchClass: string,
    ) => void | Promise<void>;
    shouldQueueResolvedPublicPitch: (card: JPDBCard, publicLookup: boolean) => boolean;
    queueSubtitleRefresh: (sentence: string | undefined) => void;
    cacheCards: (cards: JPDBCard[]) => void;
    enrichLocalPitch: (tokens: JPDBToken[]) => Promise<void>;
}

type QueueResult = 'queued' | 'retained' | 'live-capacity' | 'url-budget';
type AttemptResult = 'claimed' | 'attempt-limit' | 'background-budget' | 'url-budget';
type QueueReadiness = 'ready' | 'stop';
type ResolvedBatchDisposition = 'applied' | 'continue' | 'stop';
type WorkEntry = readonly [string, DeferredPublicJitenReadingWork];

const log = Logger.scope('DeferredPublicJitenReadings');
const FOREGROUND_WAIT_MS = 1_200;
const MAX_ATTEMPTS_PER_ID = 2;
// Background prose may use most of the per-URL allowance, while one 12-card
// batch remains reserved for urgent subtitle/OCR work that appears later.
const PER_URL_BUDGET = DEFERRED_PUBLIC_PITCH_PER_URL_CAP;
const BACKGROUND_PER_URL_BUDGET = Math.max(0, PER_URL_BUDGET - PITCH_ENRICHMENT_LIMIT);
// Bound synchronous geometry reads per idle slice on large virtualized feeds.
const VISIBLE_REFILL_INSPECTION_LIMIT = 64;

export class DeferredPublicJitenReadingCoordinator {
    queue: string[] = [];
    work = new Map<string, DeferredPublicJitenReadingWork>();
    requestAttempts = 0;
    backgroundRequestAttempts = 0;
    visibleRefillPending = false;
    generation = 0;

    private drainPromise?: Promise<void>;
    private retryTimer?: number;
    private href = location.href;
    private admittedKeys = new Set<string>();
    private resolvedCards = new Map<string, JPDBCard>();
    private visibleRefillCursor = 0;
    private visibleRefillRemaining = 0;

    constructor(private readonly dependencies: DeferredPublicJitenReadingDependencies) {}

    async hydrate(
        tokens: JPDBToken[],
        scope: CardLookupTargetSnapshot,
        href: string,
        foreground: boolean,
    ): Promise<void> {
        if (!this.dependencies.shouldEnrich()) return;
        this.resetIfNeeded();
        if (!this.targetIsCurrent(scope, href)) return;
        await this.applyCachedReadings(tokens, scope, href);
        const candidates = tokens.filter(token => this.needsHydration(token));
        if (!candidates.length || !this.targetIsCurrent(scope, href)) return;
        this.admitCandidates(candidates, foreground, scope, href);
        if (foreground) this.promoteTokens(candidates);
        if (!foreground) {
            this.scheduleDrain();
            return;
        }
        await this.awaitForegroundDrain(candidates, scope, href);
        if (this.queue.length || this.visibleRefillPending) this.scheduleDrain();
    }

    needsHydration(token: JPDBToken): boolean {
        if (!isHydratablePublicJitenCard(token.card) || token.card.reading.trim()) return false;
        const surface = (token.sentence?.slice(token.start, token.end) || token.card.spelling).trim();
        return Boolean(surface) && [...surface].some(isKanjiCharacter);
    }

    resetIfNeeded(): void {
        if (this.href === location.href) return;
        this.clear({ resetUrlBudget: true });
        this.href = location.href;
    }

    clear(options: { resetUrlBudget?: boolean } = {}): void {
        window.clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
        // Target/settings invalidation drops live references without
        // replenishing the same URL's cumulative network allowance.
        const unfinishedKeys = [...this.work.keys()];
        this.queue = [];
        this.work.clear();
        if (options.resetUrlBudget) {
            this.admittedKeys.clear();
            this.resolvedCards.clear();
            this.requestAttempts = 0;
            this.backgroundRequestAttempts = 0;
        } else {
            unfinishedKeys.forEach(key => this.admittedKeys.delete(key));
        }
        this.stopVisibleRefill();
        this.generation += 1;
    }

    queueToken(token: JPDBToken, urgent = false): QueueResult {
        if (this.dependencies.hasUnresolvedFallback(fallbackResolutionCacheKey(token))) return 'retained';
        const key = parsedCardHydrationKey(token.card);
        const existing = this.work.get(key);
        if (existing) {
            existing.tokens.add(token);
            if (urgent) existing.urgent = true;
            return 'retained';
        }
        // A completed or missed exact id is never admitted twice on one URL.
        if (this.admittedKeys.has(key)) return 'retained';
        const admissionLimit = urgent ? PER_URL_BUDGET : BACKGROUND_PER_URL_BUDGET;
        if (this.admittedKeys.size >= admissionLimit) return 'url-budget';
        if (this.work.size >= DEFERRED_PUBLIC_PITCH_PER_URL_CAP) return 'live-capacity';
        this.admittedKeys.add(key);
        this.work.set(key, { card: token.card, tokens: new Set([token]), attempts: 0, urgent });
        this.queue.push(key);
        return 'queued';
    }

    promoteTokens(tokens: JPDBToken[]): void {
        const promoted: string[] = [];
        const promotedKeys = new Set<string>();
        const queuedKeys = new Set(this.queue);
        for (const token of tokens) {
            const key = parsedCardHydrationKey(token.card);
            const queuedWork = this.work.get(key);
            if (promotedKeys.has(key) || !queuedWork) continue;
            queuedWork.urgent = true;
            // In-flight work already owns the request and its mutable token set.
            if (!queuedKeys.has(key)) continue;
            promotedKeys.add(key);
            promoted.push(key);
        }
        if (!promoted.length) return;
        this.queue = [...promoted, ...this.queue.filter(key => !promotedKeys.has(key))];
    }

    drain(options: DeferredPublicJitenReadingDrainOptions = {}): Promise<void> {
        const previous = this.drainPromise;
        const drain = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(async () => {
            await this.run({ ...options, maxBatches: options.maxBatches ?? 1 });
            if (this.queue.length || this.visibleRefillPending) this.scheduleDrain();
        });
        this.drainPromise = drain;
        void drain.finally(() => {
            if (this.drainPromise === drain) this.drainPromise = undefined;
        }).catch(() => undefined);
        return drain;
    }

    async run(options: DeferredPublicJitenReadingDrainOptions): Promise<void> {
        let completedBatches = 0;
        while (this.shouldContinue(options)) {
            const readiness = options.foreground
                ? this.prepareForegroundQueue()
                : await this.prepareBackgroundQueue();
            if (readiness === 'stop') return;
            const works = this.claimNextBatch();
            if (!works.length) continue;
            completedBatches += 1;
            const disposition = await this.resolveBatch(works, options);
            if (disposition === 'stop') return;
            if (disposition === 'continue') continue;
            this.refillAfterBatch(options);
            if (completedBatches >= (options.maxBatches ?? Number.POSITIVE_INFINITY)) return;
        }
    }

    refillFromVisibleWords(): void {
        let reachedCapacity = false;
        const words = this.sparseRenderedWords();
        if (!words.length) {
            this.stopVisibleRefill();
            return;
        }
        this.normalizeRefillWindow(words.length);
        const inspectionLimit = Math.min(VISIBLE_REFILL_INSPECTION_LIMIT, this.visibleRefillRemaining);
        let inspected = 0;
        let consumed = 0;
        while (inspected < inspectionLimit) {
            const word = words[(this.visibleRefillCursor + consumed) % words.length]!;
            inspected += 1;
            if (!this.isViewportVisible(word)) {
                consumed += 1;
                continue;
            }
            const token = this.dependencies.renderedWordToken(word) ?? this.tokenFromRenderedWord(word);
            if (!token || !this.needsHydration(token)) {
                consumed += 1;
                continue;
            }
            const queued = this.queueToken(token);
            if (queued === 'url-budget') {
                this.stopVisibleRefill();
                return;
            }
            if (queued === 'live-capacity') {
                reachedCapacity = true;
                break;
            }
            consumed += 1;
        }
        this.advanceRefillWindow(words.length, consumed, reachedCapacity);
    }

    shouldQueueResolvedPublicPitch(card: JPDBCard, publicLookup: boolean): boolean {
        return this.dependencies.showPitchAccent() && !cardHasContextPitch(card) && publicLookup;
    }

    private targetIsCurrent(scope: CardLookupTargetSnapshot, href: string): boolean {
        return !this.dependencies.isDestroyed() && location.href === href && scope.isCurrent();
    }

    private async applyCachedReadings(
        tokens: JPDBToken[],
        scope: CardLookupTargetSnapshot,
        href: string,
    ): Promise<void> {
        for (const token of tokens) {
            if (!this.needsHydration(token)) continue;
            const cached = this.resolvedCards.get(parsedCardHydrationKey(token.card));
            if (!cached?.reading.trim()) continue;
            if (!this.targetIsCurrent(scope, href)) return;
            const pitchClass = getPitchClass(cached.pitchAccent, cached.reading || cached.spelling) || 'unknown';
            await this.dependencies.applyResolvedCard(token, token.card, cached, pitchClass);
            if (!this.targetIsCurrent(scope, href)) return;
            this.dependencies.queueSubtitleRefresh(token.sentence);
        }
    }

    private admitCandidates(
        candidates: JPDBToken[],
        foreground: boolean,
        scope: CardLookupTargetSnapshot,
        href: string,
    ): void {
        let urlBudgetExhausted = false;
        for (const token of candidates) {
            if (!this.targetIsCurrent(scope, href)) return;
            const queued = this.queueToken(token, foreground);
            if (queued === 'live-capacity') this.visibleRefillPending = true;
            if (queued === 'url-budget') urlBudgetExhausted = true;
        }
        if (urlBudgetExhausted) this.stopVisibleRefill();
    }

    private async awaitForegroundDrain(
        candidates: JPDBToken[],
        scope: CardLookupTargetSnapshot,
        href: string,
    ): Promise<void> {
        const generation = this.generation;
        const foregroundDrain = this.drain({ foreground: true, maxBatches: 1 });
        const timeoutMessage = 'Foreground public Jiten reading hydration timed out.';
        let timedOut = false;
        await promiseWithTimeout(foregroundDrain, FOREGROUND_WAIT_MS, timeoutMessage).catch(error => {
            timedOut = error instanceof Error && error.message === timeoutMessage;
            if (!timedOut) log.warn('Foreground public Jiten reading hydration failed', error);
        });
        if (!timedOut) return;
        void foregroundDrain.then(() => {
            if (!this.targetIsCurrent(scope, href) || generation !== this.generation) return;
            const pitchTokens = candidates.filter(token => !this.needsHydration(token)
                && this.shouldQueueResolvedPublicPitch(token.card, true));
            if (pitchTokens.length) this.dependencies.scheduleDeferredPitch(pitchTokens);
        }).catch(error => log.warn('Timed-out public Jiten reading continuation failed', error));
    }

    private stopVisibleRefill(): void {
        this.visibleRefillPending = false;
        this.visibleRefillCursor = 0;
        this.visibleRefillRemaining = 0;
    }

    private attemptAvailability(work: DeferredPublicJitenReadingWork): Exclude<AttemptResult, 'claimed'> | null {
        if (work.attempts >= MAX_ATTEMPTS_PER_ID) return 'attempt-limit';
        if (this.requestAttempts >= PER_URL_BUDGET) return 'url-budget';
        if (!work.urgent && this.backgroundRequestAttempts >= BACKGROUND_PER_URL_BUDGET) {
            return 'background-budget';
        }
        return null;
    }

    private claimAttempt(work: DeferredPublicJitenReadingWork): AttemptResult {
        const unavailable = this.attemptAvailability(work);
        if (unavailable) return unavailable;
        work.attempts += 1;
        this.requestAttempts += 1;
        if (!work.urgent) this.backgroundRequestAttempts += 1;
        return 'claimed';
    }

    private scheduleDrain(delayMs = 0): void {
        if (this.dependencies.isDestroyed() || !this.dependencies.shouldEnrich()) return;
        if (this.retryTimer !== undefined) return;
        this.retryTimer = window.setTimeout(() => {
            this.retryTimer = undefined;
            void this.drain().catch(error => log.warn('Deferred public Jiten reading hydration failed', error));
        }, Math.max(0, delayMs));
    }

    private shouldContinue(options: DeferredPublicJitenReadingDrainOptions): boolean {
        return !this.dependencies.isDestroyed()
            && this.dependencies.shouldEnrich()
            && (this.queue.length > 0 || (!options.foreground && this.visibleRefillPending));
    }

    private prepareForegroundQueue(): QueueReadiness {
        this.resetIfNeeded();
        if (!this.queue.length) return 'stop';
        return this.backoffReadiness();
    }

    private async prepareBackgroundQueue(): Promise<QueueReadiness> {
        this.resetIfNeeded();
        let yieldedForRefill = false;
        if (!this.queue.length) {
            await this.dependencies.waitForIdle(DEFERRED_PUBLIC_PITCH_ENRICHMENT_IDLE_TIMEOUT_MS);
            yieldedForRefill = true;
            this.refillFromVisibleWords();
        }
        if (!this.queue.length) return 'stop';
        if (!yieldedForRefill) {
            await this.dependencies.waitForIdle(DEFERRED_PUBLIC_PITCH_ENRICHMENT_IDLE_TIMEOUT_MS);
        }
        if (this.dependencies.shouldPauseBackground()) {
            this.scheduleDrain(DEFERRED_PUBLIC_PITCH_HOVER_PAUSE_MS);
            return 'stop';
        }
        return this.backoffReadiness();
    }

    private backoffReadiness(): QueueReadiness {
        const backoffMs = publicJitenBackoffRemainingMs();
        if (backoffMs <= 0) return 'ready';
        this.scheduleDrain(Math.min(backoffMs, DEFERRED_PUBLIC_PITCH_BACKOFF_WAIT_MS));
        return 'stop';
    }

    private claimNextBatch(): WorkEntry[] {
        const works: WorkEntry[] = [];
        while (works.length < PITCH_ENRICHMENT_LIMIT && this.queue.length) {
            const key = this.queue.shift()!;
            const queuedWork = this.work.get(key);
            if (!queuedWork) continue;
            if (![...queuedWork.tokens].some(token => this.needsHydration(token))) {
                this.work.delete(key);
                continue;
            }
            const attempt = this.claimAttempt(queuedWork);
            if (attempt === 'claimed') {
                works.push([key, queuedWork]);
                continue;
            }
            if (attempt === 'background-budget' || attempt === 'url-budget') this.stopVisibleRefill();
            if (queuedWork.attempts > 0) {
                queuedWork.tokens.forEach(token => {
                    this.dependencies.rememberUnresolvedFallback(fallbackResolutionCacheKey(token));
                });
            }
            this.work.delete(key);
        }
        return works;
    }

    private async resolveBatch(
        works: WorkEntry[],
        options: DeferredPublicJitenReadingDrainOptions,
    ): Promise<ResolvedBatchDisposition> {
        const generation = this.generation;
        const href = location.href;
        const scope = this.dependencies.captureTarget();
        const resolved = await this.dependencies.lookupCards(works.map(([, work]) => work.card), scope);
        if (this.dependencies.isDestroyed()) return 'stop';
        if (generation !== this.generation) return 'continue';
        if (location.href !== href) {
            this.resetIfNeeded();
            return 'continue';
        }
        if (!scope.isCurrent()) {
            this.clear();
            return 'continue';
        }
        await this.applyResolvedBatch(works, resolved, options);
        return 'applied';
    }

    private async applyResolvedBatch(
        works: WorkEntry[],
        resolved: Map<string, JPDBCard>,
        options: DeferredPublicJitenReadingDrainOptions,
    ): Promise<void> {
        const cardsToCache: JPDBCard[] = [];
        const resolvedPitchTokens: JPDBToken[] = [];
        const retryAfterBackoff = publicJitenBackoffRemainingMs() > 0;
        for (const [key, queuedWork] of works) {
            const card = resolved.get(parsedCardHydrationKey(queuedWork.card));
            if (!card?.reading.trim()) {
                this.requeueOrDiscardMissingCard(key, queuedWork, retryAfterBackoff);
                continue;
            }
            const hydratedTokens = await this.applyResolvedCard(key, queuedWork, card);
            cardsToCache.push(card);
            if (!options.foreground && this.shouldQueueResolvedPublicPitch(card, true)) {
                resolvedPitchTokens.push(...hydratedTokens);
            }
        }
        if (cardsToCache.length) this.dependencies.cacheCards(cardsToCache);
        if (resolvedPitchTokens.length) this.dependencies.scheduleDeferredPitch(resolvedPitchTokens);
    }

    private requeueOrDiscardMissingCard(
        key: string,
        queuedWork: DeferredPublicJitenReadingWork,
        retryAfterBackoff: boolean,
    ): void {
        if (retryAfterBackoff && !this.attemptAvailability(queuedWork)) {
            if (queuedWork.urgent) this.queue.unshift(key);
            else this.queue.push(key);
            return;
        }
        queuedWork.tokens.forEach(token => {
            this.dependencies.rememberUnresolvedFallback(fallbackResolutionCacheKey(token));
        });
        this.work.delete(key);
    }

    private async applyResolvedCard(
        key: string,
        queuedWork: DeferredPublicJitenReadingWork,
        card: JPDBCard,
    ): Promise<JPDBToken[]> {
        queuedWork.tokens.forEach(token => {
            this.dependencies.forgetUnresolvedFallback(fallbackResolutionCacheKey(token));
        });
        this.resolvedCards.set(key, card);
        const hydratedTokens: JPDBToken[] = [];
        for (const token of queuedWork.tokens) {
            if (!this.needsHydration(token)) continue;
            const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
            await this.dependencies.applyResolvedCard(token, token.card, card, pitchClass);
            this.dependencies.queueSubtitleRefresh(token.sentence);
            hydratedTokens.push(token);
        }
        this.work.delete(key);
        return hydratedTokens;
    }

    private refillAfterBatch(options: DeferredPublicJitenReadingDrainOptions): void {
        if (!options.foreground && this.visibleRefillPending
            && this.work.size < DEFERRED_PUBLIC_PITCH_PER_URL_CAP) {
            this.refillFromVisibleWords();
        }
    }

    private sparseRenderedWords(): HTMLElement[] {
        const words = Array.from(this.dependencies.renderedAnnotationRoots())
            .flatMap(root => renderedWordsInRoot(root));
        return [...new Set(words)].filter(isSparseRenderedJitenWord);
    }

    private normalizeRefillWindow(wordCount: number): void {
        if (this.visibleRefillCursor >= wordCount) this.visibleRefillCursor = 0;
        if (this.visibleRefillRemaining <= 0 || this.visibleRefillRemaining > wordCount) {
            this.visibleRefillRemaining = wordCount;
        }
    }

    private advanceRefillWindow(wordCount: number, consumed: number, reachedCapacity: boolean): void {
        this.visibleRefillCursor = (this.visibleRefillCursor + consumed) % wordCount;
        this.visibleRefillRemaining = Math.max(0, this.visibleRefillRemaining - consumed);
        const inspectionPassIncomplete = this.visibleRefillRemaining > 0;
        this.visibleRefillPending = reachedCapacity || inspectionPassIncomplete;
        if (!this.visibleRefillPending) this.visibleRefillCursor = 0;
    }

    private isViewportVisible(word: HTMLElement): boolean {
        if (!word.isConnected) return false;
        const rect = word.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    }

    private tokenFromRenderedWord(word: HTMLElement): JPDBToken | null {
        const card = jitenWordCardForMassReview(word);
        if (!Number.isFinite(card.vid) || !Number.isFinite(card.sid)) return null;
        const surface = readerWordSurfaceText(word);
        const recordedStart = Number(word.dataset.tokenStart);
        const recordedEnd = Number(word.dataset.tokenEnd);
        const hasRecordedSpan = Number.isInteger(recordedStart)
            && Number.isInteger(recordedEnd)
            && recordedStart >= 0
            && recordedEnd > recordedStart;
        const start = hasRecordedSpan ? recordedStart : 0;
        const end = hasRecordedSpan ? recordedEnd : surface.length;
        return {
            card,
            start,
            end,
            length: end - start,
            rubies: [],
            pitchClass: word.dataset.pitchClass ?? '',
            sentence: word.dataset.sentence || surface,
        };
    }
}

function isSparseRenderedJitenWord(word: HTMLElement): boolean {
    return [renderedWordPrivateValue(word, 'cardSource') === 'jiten', !word.dataset.reading].every(Boolean);
}

export async function resolvePublicFallbackPitchTokens(
    tokens: JPDBToken[],
    options: PublicFallbackPitchResolutionOptions,
    dependencies: PublicFallbackPitchResolutionDependencies,
): Promise<JPDBToken[]> {
    const scope = dependencies.captureTarget();
    const queuedTokens: JPDBToken[] = [];
    const fallbackGroups = new Map<string, { card: JPDBCard; tokens: JPDBToken[] }>();
    const jitenGroups = new Map<string, { card: JPDBCard; tokens: JPDBToken[] }>();
    for (const token of tokens) {
        if (token.card.source === 'fallback') {
            addPublicFallbackGroup(token, fallbackGroups, options, dependencies);
            continue;
        }
        if (isHydratablePublicJitenCard(token.card)) {
            addPublicFallbackGroup(token, jitenGroups, options, dependencies);
            continue;
        }
        queuedTokens.push(token);
    }
    if (!fallbackGroups.size && !jitenGroups.size) return queuedTokens;
    const resolved = await resolvedFallbackAndJitenCards(fallbackGroups, jitenGroups, options, scope, dependencies);
    if (!scope.isCurrent()) return [];
    const cardsToCache: JPDBCard[] = [];
    const localOnlyTokens: JPDBToken[] = [];
    for (const [key, group] of [...fallbackGroups, ...jitenGroups]) {
        const card = resolved.get(key);
        if (!card || card.source === 'fallback') {
            dependencies.noteFallbackMiss(key, group.tokens);
            if (dependencies.showPitchAccent() && options.jpdbPublicLookup !== false) {
                queuedTokens.push(...group.tokens);
            } else {
                localOnlyTokens.push(...group.tokens);
            }
            continue;
        }
        cardsToCache.push(card);
        applyResolvedFallbackGroup(group, card, queuedTokens, options, dependencies);
    }
    if (cardsToCache.length) dependencies.cacheCards(cardsToCache);
    if (localOnlyTokens.length) await dependencies.enrichLocalPitch(localOnlyTokens);
    return queuedTokens;
}

function addPublicFallbackGroup(
    token: JPDBToken,
    groups: Map<string, { card: JPDBCard; tokens: JPDBToken[] }>,
    options: PublicFallbackPitchResolutionOptions,
    dependencies: PublicFallbackPitchResolutionDependencies,
): void {
    const key = token.card.source === 'fallback'
        ? fallbackVocabularySpanCacheKey(token.card, token)
        : cardKey(token.card);
    if (!options.urgent && dependencies.hasUnresolvedFallback(key)) return;
    const group = groups.get(key) ?? { card: token.card, tokens: [] };
    group.tokens.push(token);
    groups.set(key, group);
}

function fallbackResolutionCacheKey(token: JPDBToken): string {
    return token.card.source === 'fallback'
        ? fallbackVocabularySpanCacheKey(token.card, token)
        : cardKey(token.card);
}

async function resolvedFallbackAndJitenCards(
    fallbackGroups: Map<string, { card: JPDBCard; tokens: JPDBToken[] }>,
    jitenGroups: Map<string, { card: JPDBCard; tokens: JPDBToken[] }>,
    options: PublicFallbackPitchResolutionOptions,
    scope: CardLookupTargetSnapshot,
    dependencies: PublicFallbackPitchResolutionDependencies,
): Promise<Map<string, JPDBCard>> {
    const [fallbackCards, jitenCards] = await Promise.all([
        fallbackGroups.size
            ? dependencies.lookupFallbackCards([...fallbackGroups.values()].map(group => group.card), options, scope)
            : Promise.resolve(new Map<string, JPDBCard>()),
        jitenGroups.size
            ? dependencies.lookupJitenCards([...jitenGroups.values()].map(group => group.card), scope)
            : Promise.resolve(new Map<string, JPDBCard>()),
    ]);
    const resolved = new Map<string, JPDBCard>();
    // Public fallback lookup is keyed by card identity. The caller groups
    // occurrences by source span, so re-key each result to the occurrence that
    // requested it; identical surfaces at different spans must not share paint
    // authority even when they can share the underlying network response.
    for (const [key, group] of fallbackGroups) {
        const card = fallbackCards.get(cardKey(group.card));
        if (card) resolved.set(key, card);
    }
    // hydrateCards keys results by vid:sid rather than cardKey, so re-key each
    // result against its original sparse group before applying it.
    for (const [key, group] of jitenGroups) {
        const card = jitenCards.get(parsedCardHydrationKey(group.card));
        if (card) resolved.set(key, card);
    }
    return resolved;
}

function applyResolvedFallbackGroup(
    group: { card: JPDBCard; tokens: JPDBToken[] },
    card: JPDBCard,
    queuedTokens: JPDBToken[],
    options: PublicFallbackPitchResolutionOptions,
    dependencies: PublicFallbackPitchResolutionDependencies,
): void {
    for (const token of group.tokens) {
        const fallback = token.card;
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
        if (fallback.source === 'fallback') dependencies.rememberResolvedFallback(token, fallback, card);
        void dependencies.applyResolvedCard(token, fallback, card, pitchClass);
        // Reading hydration may resolve without pitch; retain that token in the
        // independent public-pitch lane when the caller permits it.
        if (dependencies.shouldQueueResolvedPublicPitch(card, options.jpdbPublicLookup !== false)) {
            queuedTokens.push(token);
        }
        dependencies.queueSubtitleRefresh(token.sentence);
    }
}
