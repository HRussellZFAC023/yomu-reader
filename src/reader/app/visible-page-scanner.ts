import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    healTextMirrorPageVisibility,
    isCurrentScanTarget,
    makeRoomForRubyInCroppedRows,
    removeStaleControlTextMirrors,
    withMirrorTokenApply,
    type FragmentTextTarget,
    type ScanTextTarget,
    type TextFragment,
    type TextTarget,
} from '../dom/index';
import { formatUiText, uiText } from '../app/i18n';
import { Logger } from './logger';
import { collectScanTargetsInSteps, effectiveSiteScanCollectionLimit } from './site-parsers';
import { shouldLookupAnkiStatus, shouldLookupBunproWordStates } from '../settings/index';
import { applyAuthoredVocabularyOverrides } from '../lookup/authored-vocabulary';
import type { JPDBToken, ReaderSettings } from './types';

const log = Logger.scope('VisiblePageScanner');
const VISIBLE_SCAN_PARSE_BATCH_SIZE = 80;
// Byte cap per parse batch (P1 abortable scheduler): a handful of huge
// paragraphs would otherwise ride in one batch and stall the apply turn.
const VISIBLE_SCAN_PARSE_CHAR_BUDGET = 6_000;
const VISIBLE_SCAN_MOBILE_PARSE_CHAR_BUDGET = 3_200;
const VISIBLE_SCAN_MOBILE_FALLBACK_PARSE_CHAR_BUDGET = 2_000;
// 120 starved dense mobile feeds: the residual pass (added 1.6.69) shares
// this cap with profile roots, so later view-count rows stayed bare until
// the next scroll settle — and inner-scroller panels never settled.
const VISIBLE_SCAN_TARGET_COLLECTION_LIMIT = 200;
const VISIBLE_SCAN_MOBILE_TARGET_COLLECTION_LIMIT = 200;
const VISIBLE_SCAN_MOBILE_FALLBACK_TARGET_COLLECTION_LIMIT = 100;
const VISIBLE_SCAN_TARGET_TEXT_CHUNK_SIZE = 1_800;
const VISIBLE_SCAN_MOBILE_TARGET_TEXT_CHUNK_SIZE = 900;
const VISIBLE_SCAN_MOBILE_FALLBACK_TARGET_TEXT_CHUNK_SIZE = 700;
const VISIBLE_SCAN_TARGET_TEXT_CHUNK_MIN_TAIL = 280;
// Large enough that the first apply paints everything just parsed in one go —
// small chunks made ruby/colors arrive in visible waves.
const VISIBLE_SCAN_APPLY_BATCH_SIZE = 48;
const VISIBLE_SCAN_MOBILE_APPLY_BATCH_SIZE = 24;
const VISIBLE_SCAN_MOBILE_FALLBACK_APPLY_BATCH_SIZE = 12;
const VISIBLE_SCAN_MOBILE_VIEWPORT_WIDTH = 700;
const VISIBLE_SCAN_PARSE_TIMEOUT_MS = 450;
const VISIBLE_SCAN_REMOTE_PARSE_TIMEOUT_MS = 1_200;
const VISIBLE_SCAN_CLAMP_SWEEP_DELAY_MS = 1500;
const VISIBLE_SCAN_REMOTE_PARSE_PREFETCH = 2;
const YOUTUBE_VISIBLE_SCAN_PARSE_PREFETCH = 2;
const ASB_SCAN_BATCH_LIMIT = 12;
const ASB_SCAN_DRAIN_DELAY_MS = 80;
// Bound on consecutive budget-capped continuation rounds (6 × 200 targets
// reaches deep pages while keeping a pathological page finite).
const MAX_CONSECUTIVE_CONTINUATION_SCANS = 6;
// Frame budget for cooperative target collection (perf item 4).
const VISIBLE_SCAN_COLLECTION_FRAME_BUDGET_MS = 12;
// 24 chunked slices (~290ms of budgeted work) cover the heat profile's worst
// monolithic pass; anything beyond finishes synchronously so a loaded event
// loop can never starve collection (each setTimeout(0) turn is unbounded).
const MAX_VISIBLE_SCAN_COLLECTION_YIELDS = 24;
const FORCE_FURIGANA_MODE_ATTRIBUTE = 'data-yomu-furigana-mode';
const CLAMPED_ROW_READINGS_ATTRIBUTE = 'data-yomu-clamped-readings';
interface VisibleScanParseOptions {
    jpdbTimeoutMs?: number;
    allowJpdbTimeoutFallback?: boolean;
    includeLocalPitch?: boolean;
    allowSegmentedFallback?: boolean;
}

interface VisiblePageCoverageSummary {
    total: number;
    known: number;
    unknown: number;
    iPlusOne: number;
}

interface VisiblePageCoverageAccumulator {
    cards: Set<string>;
    iPlusOne: Set<string>;
    known: number;
    unknown: number;
}

export interface VisiblePageScannerDependencies {
    getSettings: () => ReaderSettings;
    parseJapanese: (paragraphs: string[], options?: VisibleScanParseOptions) => Promise<JPDBToken[][]>;
    pauseMutationObserver: <T>(callback: () => T) => T;
    preloadParsedTokens: (tokens: JPDBToken[]) => void;
    enrichPitchWords: (tokens: JPDBToken[]) => Promise<void> | void;
    enrichAnkiWords: (tokens: JPDBToken[], roots?: ParentNode[]) => Promise<void> | void;
    // Starts the Anki status lookup immediately (overlapping the DOM apply)
    // and returns a callback that applies the colors once roots are known —
    // this removes most of the gray→color pop-in after a scan.
    beginAnkiWordEnrichment?: (tokens: JPDBToken[]) => (roots: ParentNode[]) => void;
    // ASB pre-renders subtitle cues offscreen, then moves the same DOM node
    // onscreen. For that path, wait for cached Anki status before rewriting the
    // cue so the first rendered state already has ruby and colors together.
    prepareAnkiWordEnrichmentBeforeRender?: (tokens: JPDBToken[]) => Promise<(roots: ParentNode[]) => void> | ((roots: ParentNode[]) => void);
    prepareSubtitleTokensBeforeRender?: (tokens: JPDBToken[]) => Promise<void> | void;
    refreshWordContrast?: (root: ParentNode) => void;
    // Injectable so tests spy on the ruby-room sweep via a dep instead of
    // mocking dom/index — fork reuse defeats a per-file vi.mock once an earlier
    // reader test has evaluated this module against the real import. Defaults to it.
    makeRoomForRubyInCroppedRows?: (root?: ParentNode) => number;
    toast: (message: string) => void;
}

export class VisiblePageScanner {
    private scanInFlight = false;
    private scanPending = false;
    private scanPendingSilent = true;
    private destroyed = false;
    // P1 abortable scheduler: every scan request bumps the generation; an
    // in-flight scan checks it between batches and stops early, so fast
    // scrolls/navigations never keep parsing stale regions while the fresh
    // request waits.
    private scanGeneration = 0;
    // Class E: consecutive continuation scans queued because collection hit the
    // budget cap. Silent continuations make progress via the mirror-skip (an
    // already-mirrored head is skipped at the next collection), but a page
    // whose head never mirrors could otherwise re-walk forever — bound it.
    private continuationScans = 0;
    private asbScanInFlight = false;
    private asbDrainTimer?: number;
    private clampSweepTimer: number | undefined;
    constructor(private readonly dependencies: VisiblePageScannerDependencies) {}

    private makeRoomForRuby(root?: ParentNode): number {
        return (this.dependencies.makeRoomForRubyInCroppedRows ?? makeRoomForRubyInCroppedRows)(root);
    }

    destroy(): void {
        this.destroyed = true;
        this.scanPending = false;
        window.clearTimeout(this.asbDrainTimer);
        this.asbDrainTimer = undefined;
        window.clearTimeout(this.clampSweepTimer);
        this.clampSweepTimer = undefined;
        this.clearPageFuriganaMode();
    }

    interruptVisiblePageScan(): void {
        this.scanGeneration++;
        this.scanPending = false;
        this.scanPendingSilent = true;
        this.continuationScans = 0;
    }

    async scanVisiblePage(options: { silent?: boolean } = {}): Promise<void> {
        const silent = Boolean(options.silent);
        this.scanGeneration++;
        if (!this.beginScan(silent)) return;
        const generation = this.scanGeneration;
        const done = log.time('scanVisiblePage', { silent });
        try {
            this.syncPageFuriganaMode();
            await this.runVisiblePageScan(silent, generation);
        } catch (error) {
            this.handleVisiblePageScanError(error, silent);
        } finally {
            this.finishScan();
            // Empty/fully-skipped scans apply no tokens, so the guarded-apply
            // sweep never runs — heal stuck-hidden mirrors here so an SPA page
            // swap cannot leave concealed hosts blank (2026-07-11 regression).
            healTextMirrorPageVisibility();
            this.scheduleClampedRubySweep(silent);
            done();
        }
    }

    // UT-70: hosts that hydrate progressively (YouTube custom elements,
    // notably on iPad Safari) apply line-clamp/ellipsis styles AFTER a scan
    // annotated their text — the grown ruby line then gets cropped and the
    // base text disappears. Sweep right after the scan and once more after
    // hydration settles; rescans re-arm it, so late clamps are always caught.
    private scheduleClampedRubySweep(silent = false): void {
        if (this.destroyed || typeof document === 'undefined') return;
        const sweep = (): void => {
            if (this.destroyed || typeof document === 'undefined') return;
            const adjusted = this.makeRoomForRuby(document);
            if (adjusted) log.info('Made room for ruby in cropped rows', { adjusted });
        };
        // Silent auto-scans skip the immediate document-wide pass: apply-time
        // per-root sweeps already covered every changed root, and the delayed
        // sweep below still catches late-hydrating clamps. The synchronous
        // pass burned ~530 style recalcs per 15s of feed scrolling while
        // adjusting nothing.
        if (!silent) sweep();
        window.clearTimeout(this.clampSweepTimer);
        this.clampSweepTimer = window.setTimeout(sweep, VISIBLE_SCAN_CLAMP_SWEEP_DELAY_MS);
    }

    // asbplayer pre-renders the WHOLE track's cue HTML into its offscreen
    // cache container and moves the same DOM node onscreen when the cue is
    // current — so draining the offscreen cache in paced batches colorizes
    // every cue BEFORE it is shown, instead of visibly recoloring the line
    // ~120ms after it appears.
    async scanAsbPlayerSubtitles(): Promise<void> {
        if (this.destroyed || this.asbScanInFlight) return;
        this.asbScanInFlight = true;
        try {
            const batchWasFull = await this.scanAsbPlayerSubtitleBatch();
            if (batchWasFull) this.scheduleAsbPlayerDrain();
        } finally {
            this.asbScanInFlight = false;
        }
    }

    private scheduleAsbPlayerDrain(): void {
        if (this.destroyed) return;
        window.clearTimeout(this.asbDrainTimer);
        this.asbDrainTimer = window.setTimeout(() => {
            this.asbDrainTimer = undefined;
            void this.scanAsbPlayerSubtitles();
        }, ASB_SCAN_DRAIN_DELAY_MS);
    }

    private async scanAsbPlayerSubtitleBatch(): Promise<boolean> {
        const roots = Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-offscreen, .asbplayer-subtitles-container-bottom'));
        if (!roots.length) return false;

        // The VISIBLE container goes first so the currently shown cue is never
        // starved by a long unprocessed offscreen backlog.
        roots.sort((a, b) => Number(a.classList.contains('asbplayer-offscreen')) - Number(b.classList.contains('asbplayer-offscreen')));
        const targets = roots.flatMap(root => collectTextTargetsIn(root, ASB_SCAN_BATCH_LIMIT, false)).slice(0, ASB_SCAN_BATCH_LIMIT);
        if (!targets.length) return false;

        try {
            const parsed = await this.dependencies.parseJapanese(targets.map(target => target.text), scanParseOptions(this.dependencies.getSettings()));
            if (this.destroyed) return false;
            const tokens = parsed.flat();
            if (this.dependencies.prepareSubtitleTokensBeforeRender) {
                this.dependencies.preloadParsedTokens(tokens);
                await this.dependencies.prepareSubtitleTokensBeforeRender(tokens);
                if (this.destroyed) return false;
            }
            // ASB moves pre-rendered cue nodes from its offscreen cache into
            // view. Have cached status coloring ready before rewriting nodes
            // so ruby and colors land in the same paint.
            const applyAnkiColors = this.shouldEnrichAnkiWords()
                ? await this.prepareAnkiColorsBeforeSubtitleRender(tokens)
                : undefined;
            if (this.destroyed) return false;
            const changedRoots = await this.applyTokens(targets, parsed, this.dependencies.getSettings());
            applyAnkiColors?.(changedRoots);
            if (this.dependencies.prepareSubtitleTokensBeforeRender) {
                if (!applyAnkiColors && this.shouldEnrichAnkiWords()) await this.dependencies.enrichAnkiWords(tokens, changedRoots);
            } else {
                this.preloadParsed(parsed, changedRoots, { skipAnki: Boolean(applyAnkiColors) });
            }
            // A full batch means the offscreen cache likely has more
            // unprocessed cues; the caller keeps draining.
            return targets.length === ASB_SCAN_BATCH_LIMIT;
        } catch {
            // External subtitle overlays update frequently; the regular popup path still reports API errors.
            return false;
        }
    }

    private async prepareAnkiColorsBeforeSubtitleRender(tokens: JPDBToken[]): Promise<((roots: ParentNode[]) => void) | undefined> {
        if (this.dependencies.prepareAnkiWordEnrichmentBeforeRender) {
            return await this.dependencies.prepareAnkiWordEnrichmentBeforeRender(tokens);
        }
        return this.dependencies.beginAnkiWordEnrichment?.(tokens);
    }

    private beginScan(silent: boolean): boolean {
        if (this.destroyed) return false;
        if (this.scanInFlight) {
            this.scanPending = true;
            this.scanPendingSilent = this.scanPendingSilent && silent;
            return false;
        }
        this.scanInFlight = true;
        return true;
    }

    private async runVisiblePageScan(silent: boolean, generation: number): Promise<void> {
        if (this.isStaleScan(generation)) return;
        removeStaleControlTextMirrors(document);
        const settings = this.dependencies.getSettings();
        const targetCollectionLimit = visibleScanTargetCollectionLimit(settings);
        // Cooperative collection (perf item 4): the walk is identical to the
        // sync collectScanTargets, chunked at frame deadlines so a dense page
        // never spends ~300ms of one task collecting. A fast collection
        // completes fully synchronously (no await — the P1 abort choreography
        // depends on the first parse starting in the same task); targets
        // collected before a mid-collection mutation are re-validated at parse
        // and apply time (isCurrentScanTarget), like the existing async batches.
        const collection = this.collectScanTargetsWithFrameBudget(targetCollectionLimit, generation, silent);
        const collected = Array.isArray(collection) ? collection : await collection;
        if (!collected || this.isStaleScan(generation)) return;
        const targets = chunkLongScanTargets(collected, settings);
        if (!targets.length) {
            this.handleEmptyVisiblePageScan(silent);
            return;
        }

        const parsedAnyTokens = await this.parseAndApplyTargets(targets, generation, settings);
        if (this.isStaleScan(generation)) return;
        const effectiveCollectionLimit = effectiveSiteScanCollectionLimit(targetCollectionLimit, window.location.href);
        if (parsedAnyTokens && targets.length >= effectiveCollectionLimit && this.canQueueContinuationScan(targets, silent)) {
            this.queueContinuationScan(silent);
            return;
        }
        this.continuationScans = 0;
        this.reportVisiblePageCoverage(silent);
    }

    // singlePassScan stops infinite re-WALKS of a profile's roots — it was
    // never meant to cancel tail coverage when collection hit the budget cap
    // (the class-E starvation: comment roots consumed all 200 targets and the
    // menus/grid tail was simply dropped). A capped collection continues:
    // when any target re-walks (non-single-pass), and for silent scans (whose
    // collection skips already-mirrored hosts, so each continuation reaches
    // deeper), always under a bounded number of rounds.
    private canQueueContinuationScan(targets: ScanTextTarget[], silent: boolean): boolean {
        if (canContinueVisibleScan(targets)) return this.continuationScans < MAX_CONSECUTIVE_CONTINUATION_SCANS;
        return silent && this.continuationScans < MAX_CONSECUTIVE_CONTINUATION_SCANS;
    }

    private isStaleScan(generation: number): boolean {
        return this.destroyed || generation !== this.scanGeneration;
    }

    // Drives the collection generator: fully synchronous while it fits the
    // frame budget (returns the array directly, no promise), yielding the main
    // thread between chunks only once the budget is spent. Returns undefined
    // when the scan went stale across a yield.
    private collectScanTargetsWithFrameBudget(
        limit: number,
        generation: number,
        silent: boolean,
    ): ScanTextTarget[] | Promise<ScanTextTarget[] | undefined> {
        const steps = collectScanTargetsInSteps(limit, window.location.href, { skipMirroredHosts: silent });
        let sliceStartedAt = Date.now();
        for (;;) {
            const next = steps.next();
            if (next.done) return next.value;
            if (Date.now() - sliceStartedAt >= VISIBLE_SCAN_COLLECTION_FRAME_BUDGET_MS) {
                return (async () => {
                    // Yields are CAPPED: on a busy machine each setTimeout(0)
                    // turn can take arbitrarily long (CI fork oversubscription
                    // starved a 170-tile collection past its test timeout), so
                    // after the cap the tail finishes synchronously — chunking
                    // bounds long tasks, it must never starve the scan itself.
                    for (let yields = 0; yields < MAX_VISIBLE_SCAN_COLLECTION_YIELDS; yields += 1) {
                        await waitForVisibleScanTurn();
                        if (this.isStaleScan(generation)) return undefined;
                        sliceStartedAt = Date.now();
                        for (;;) {
                            const chunk = steps.next();
                            if (chunk.done) return chunk.value;
                            if (Date.now() - sliceStartedAt >= VISIBLE_SCAN_COLLECTION_FRAME_BUDGET_MS) break;
                        }
                    }
                    for (;;) {
                        const chunk = steps.next();
                        if (chunk.done) return chunk.value;
                    }
                })();
            }
        }
    }

    private async parseAndApplyTargets(targets: ScanTextTarget[], generation: number, scanStartSettings: ReaderSettings): Promise<boolean> {
        if (visibleScanParsePrefetchConcurrency(scanStartSettings) > 1) {
            return this.parseAndApplyTargetsWithPrefetch(targets, generation, scanStartSettings);
        }
        return this.parseAndApplyTargetsSequentially(targets, generation, scanStartSettings);
    }

    private async parseAndApplyTargetsSequentially(targets: ScanTextTarget[], generation: number, scanStartSettings: ReaderSettings): Promise<boolean> {
        let cursor = 0;
        let parsedAnyTokens = false;
        const parseCharBudget = visibleScanParseCharBudget(scanStartSettings);
        while (cursor < targets.length) {
            if (this.isStaleScan(generation)) return parsedAnyTokens;
            const next = nextVisibleScanParseBatch(targets, cursor, parseCharBudget);
            cursor = next.cursor;
            if (!next.batch.length) continue;
            const batch = next.batch;
            const parsed = await this.dependencies.parseJapanese(batch.map(target => target.text), scanParseOptions(this.dependencies.getSettings(), batch));
            if (parsed.some(tokens => tokens.length > 0)) parsedAnyTokens = true;
            if (this.isStaleScan(generation)) return parsedAnyTokens;
            // Keep semantic overrides, pitch/status enrichment, DOM apply, and
            // preload identical to the prefetch path. This used to be duplicated
            // here, which meant ordinary sequential scans skipped authored
            // homograph evidence while large/prefetched scans respected it.
            await this.applyParsedBatch(batch, parsed, scanStartSettings, generation);
            if (cursor < targets.length) await waitForVisibleScanTurn();
        }
        return parsedAnyTokens;
    }

    private async parseAndApplyTargetsWithPrefetch(targets: ScanTextTarget[], generation: number, scanStartSettings: ReaderSettings): Promise<boolean> {
        let cursor = 0;
        let parsedAnyTokens = false;
        const pending: VisibleScanParseWork[] = [];
        const parseCharBudget = visibleScanParseCharBudget(scanStartSettings);
        const concurrency = visibleScanParsePrefetchConcurrency(scanStartSettings);
        const schedule = (): void => {
            while (!this.isStaleScan(generation) && pending.length < concurrency && cursor < targets.length) {
                const next = nextVisibleScanParseBatch(targets, cursor, parseCharBudget);
                cursor = next.cursor;
                if (!next.batch.length) continue;
                pending.push({
                    batch: next.batch,
                    result: this.dependencies.parseJapanese(
                        next.batch.map(target => target.text),
                        scanParseOptions(this.dependencies.getSettings(), next.batch),
                    ).then(
                        parsed => ({ parsed }),
                        error => ({ error }),
                    ),
                });
            }
        };

        schedule();
        while (pending.length) {
            if (this.isStaleScan(generation)) return parsedAnyTokens;
            const work = pending.shift()!;
            const result = await work.result;
            if ('error' in result) throw result.error;
            const parsed = result.parsed;
            if (parsed.some(tokens => tokens.length > 0)) parsedAnyTokens = true;
            if (this.isStaleScan(generation)) return parsedAnyTokens;
            await this.applyParsedBatch(work.batch, parsed, scanStartSettings, generation);
            schedule();
            if (pending.length || cursor < targets.length) await waitForVisibleScanTurn();
        }
        return parsedAnyTokens;
    }

    private async applyParsedBatch(batch: ScanTextTarget[], parsed: JPDBToken[][], scanStartSettings: ReaderSettings, generation: number): Promise<void> {
        const resolved = applyAuthoredVocabularyToBatch(batch, parsed);
        const tokens = resolved.flat();
        const pitchStartedBeforeApply = shouldStartPitchEnrichmentBeforeApply(tokens);
        if (pitchStartedBeforeApply) await this.dependencies.enrichPitchWords(tokens);
        const applyAnkiColors = this.shouldEnrichAnkiWords()
            ? this.dependencies.beginAnkiWordEnrichment?.(tokens)
            : undefined;
        const changedRoots = await this.applyTokens(batch, resolved, scanStartSettings, generation);
        applyAnkiColors?.(changedRoots);
        this.preloadParsed(resolved, changedRoots, {
            skipAnki: Boolean(applyAnkiColors),
            skipPitch: pitchStartedBeforeApply,
        });
    }

    private async applyTokens(targets: ScanTextTarget[], parsed: JPDBToken[][], scanStartSettings: ReaderSettings, generation?: number): Promise<ParentNode[]> {
        const allChangedRoots = new Set<ParentNode>();
        const applyBatchSize = visibleScanApplyBatchSize(scanStartSettings);
        for (let index = 0; index < targets.length; index += applyBatchSize) {
            if (this.shouldStopApplyingTokens(generation)) return [...allChangedRoots];
            const start = index;
            const batch = targets.slice(start, start + applyBatchSize);
            this.dependencies.pauseMutationObserver(() => withMirrorTokenApply(() => {
                // pauseMutationObserver only pauses the app-level auto-scan
                // observer; the PER-HOST text-mirror observers stay live and
                // would fire on our own teardown/rebuild mutations, dispatching
                // a stale event that schedules yet another scan (the OOM
                // feedback loop). withMirrorTokenApply suppresses that dispatch
                // for the duration of our own apply — real external re-renders
                // (outside this block) still trigger legitimate rescans.
                if (this.shouldStopApplyingTokens(generation)) return;
                const changedRoots = new Set<ParentNode>();
                const applyPlans = scanApplyPlans(batch, parsed, start);
                applyPlans.forEach(({ target, tokens }) => {
                    if (this.shouldStopApplyingTokens(generation)) return;
                    if (!isCurrentScanTarget(target)) return;
                    applyTokensToScanTarget(target, tokens, this.dependencies.getSettings());
                    changedRoots.add(target.parent);
                });
                changedRoots.forEach(root => {
                    allChangedRoots.add(root);
                    this.dependencies.refreshWordContrast?.(root);
                });
            }));
            if (index + applyBatchSize < targets.length) await waitForVisibleScanTurn();
        }
        // Reserve ruby room for this parse batch's newly-changed rows once the
        // batch has applied — so early rows never flash cropped during a long
        // scan. Each parse batch reserves room for ITS OWN changed roots: a
        // root that recurs across batches genuinely gains new annotated rows
        // per batch (the mirror host and shared containers collect many text
        // nodes split across batch boundaries), and those later rows must get
        // room too — deduping per root across the scan left them cropped until
        // the delayed document sweep. The repeated call is read-heavy but
        // write-cheap: makeRoomForRubyInBox is guarded by previousRubyRoomHeight
        // so an already-grown box is never re-grown, only re-measured.
        this.reserveRubyRoomForNewRoots(allChangedRoots);
        return [...allChangedRoots];
    }

    private reserveRubyRoomForNewRoots(roots: Iterable<ParentNode>): void {
        // The sweep only mutates each box's inline style + data-* attributes.
        // Neither observer wakes on that: the app auto-scan observer's
        // attributeFilter excludes style/data-*, and the per-host mirror
        // observer ignores attribute-only mutations in its callback — so no
        // pauseMutationObserver/withMirrorTokenApply guard is needed here.
        for (const root of roots) {
            if (this.destroyed) return;
            this.makeRoomForRuby(root);
        }
    }

    private shouldStopApplyingTokens(generation: number | undefined): boolean {
        return this.destroyed || (generation !== undefined && this.isStaleScan(generation));
    }

    private preloadParsed(parsed: JPDBToken[][], changedRoots: ParentNode[] = [], options: { skipAnki?: boolean; skipPitch?: boolean } = {}): void {
        if (this.destroyed) return;
        const tokens = parsed.flat();
        this.dependencies.preloadParsedTokens(tokens);
        if (!options.skipPitch) void this.dependencies.enrichPitchWords(tokens);
        if (!options.skipAnki && this.shouldEnrichAnkiWords()) void this.dependencies.enrichAnkiWords(tokens, changedRoots);
    }

    private shouldEnrichAnkiWords(): boolean {
        // Bunpro-only setups colour words through the same enrichment callbacks
        // (beginAnkiWordEnrichment routes to the Bunpro word-state pass when
        // Anki is off) — gating on Anki alone left Bunpro users with no
        // word-state colouring from visible scans at all.
        const settings = this.dependencies.getSettings();
        return !this.destroyed && (shouldLookupAnkiStatus(settings) || shouldLookupBunproWordStates(settings));
    }

    private handleEmptyVisiblePageScan(silent: boolean): void {
        if (!silent) this.dependencies.toast(uiText(this.dependencies.getSettings().interfaceLanguage, 'noUnscannedJapaneseText'));
    }

    private handleVisiblePageScanError(error: unknown, silent: boolean): void {
        log.warn('Visible page scan failed', error);
        if (!silent) this.dependencies.toast(error instanceof Error ? error.message : uiText(this.dependencies.getSettings().interfaceLanguage, 'jpdbScanFailed'));
    }

    private reportVisiblePageCoverage(silent: boolean): void {
        if (silent) return;
        const summary = visiblePageCoverageSummary();
        if (!summary.total) return;
        const percent = Math.round((summary.known / summary.total) * 100);
        this.dependencies.toast(formatUiText(this.dependencies.getSettings().interfaceLanguage, 'pageCoverageSummary', {
            percent,
            known: summary.known,
            total: summary.total,
            unknown: summary.unknown,
            iPlusOne: summary.iPlusOne,
        }));
    }

    private finishScan(): void {
        this.scanInFlight = false;
        if (this.destroyed) {
            this.scanPending = false;
            this.scanPendingSilent = true;
            return;
        }
        if (!this.scanPending) return;
        const silent = this.scanPendingSilent;
        this.scanPending = false;
        this.scanPendingSilent = true;
        void waitForVisibleScanTurn().then(() => this.scanVisiblePage({ silent }));
    }

    private queueContinuationScan(silent: boolean): void {
        if (this.destroyed) return;
        this.continuationScans += 1;
        this.scanPending = true;
        this.scanPendingSilent = this.scanPendingSilent && silent;
    }

    private syncPageFuriganaMode(): void {
        if (typeof document === 'undefined') return;
        const settings = this.dependencies.getSettings();
        this.syncClampedRowReadingsMode(settings);
        if (settings.showFurigana && settings.furiganaMode === 'all') {
            document.documentElement.setAttribute(FORCE_FURIGANA_MODE_ATTRIBUTE, 'all');
            return;
        }
        this.clearPageFuriganaMode();
    }

    // Owner amendment 2026-07-11: content clip rows show readings at rest by
    // default; the hover-only preference re-hides them via this root stamp
    // (the CSS keys on it, so flipping the setting needs no re-render).
    private syncClampedRowReadingsMode(settings: ReaderSettings): void {
        if (settings.clampedRowReadings === 'hover') {
            document.documentElement.setAttribute(CLAMPED_ROW_READINGS_ATTRIBUTE, 'hover');
            return;
        }
        document.documentElement.removeAttribute(CLAMPED_ROW_READINGS_ATTRIBUTE);
    }

    private clearPageFuriganaMode(): void {
        if (typeof document === 'undefined') return;
        if (document.documentElement.getAttribute(FORCE_FURIGANA_MODE_ATTRIBUTE) === 'all') {
            document.documentElement.removeAttribute(FORCE_FURIGANA_MODE_ATTRIBUTE);
        }
    }
}

function applyAuthoredVocabularyToBatch(targets: ScanTextTarget[], parsed: JPDBToken[][]): JPDBToken[][] {
    return targets.map((target, index) => applyAuthoredVocabularyOverrides(target, parsed[index] ?? []));
}

function waitForVisibleScanTurn(): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, 0));
}

function visibleScanParseCharBudget(settings: ReaderSettings): number {
    if (!isNarrowVisibleScanViewport()) return VISIBLE_SCAN_PARSE_CHAR_BUDGET;
    return hasJpdbParseApiKey(settings) ? VISIBLE_SCAN_MOBILE_PARSE_CHAR_BUDGET : VISIBLE_SCAN_MOBILE_FALLBACK_PARSE_CHAR_BUDGET;
}

function visibleScanTargetCollectionLimit(settings: ReaderSettings): number {
    if (!isNarrowVisibleScanViewport()) return VISIBLE_SCAN_TARGET_COLLECTION_LIMIT;
    if (isYouTubeVisibleScanHost()) return VISIBLE_SCAN_MOBILE_TARGET_COLLECTION_LIMIT;
    return hasJpdbParseApiKey(settings) ? VISIBLE_SCAN_MOBILE_TARGET_COLLECTION_LIMIT : VISIBLE_SCAN_MOBILE_FALLBACK_TARGET_COLLECTION_LIMIT;
}

function visibleScanTargetTextChunkSize(settings: ReaderSettings): number {
    if (!isNarrowVisibleScanViewport()) return VISIBLE_SCAN_TARGET_TEXT_CHUNK_SIZE;
    return hasJpdbParseApiKey(settings) ? VISIBLE_SCAN_MOBILE_TARGET_TEXT_CHUNK_SIZE : VISIBLE_SCAN_MOBILE_FALLBACK_TARGET_TEXT_CHUNK_SIZE;
}

function visibleScanApplyBatchSize(settings: ReaderSettings): number {
    if (!isNarrowVisibleScanViewport()) return VISIBLE_SCAN_APPLY_BATCH_SIZE;
    return hasJpdbParseApiKey(settings) ? VISIBLE_SCAN_MOBILE_APPLY_BATCH_SIZE : VISIBLE_SCAN_MOBILE_FALLBACK_APPLY_BATCH_SIZE;
}

function visibleScanParsePrefetchConcurrency(settings: ReaderSettings): number {
    if (isYouTubeVisibleScanHost()) return hasRemoteParseApiKey(settings) ? YOUTUBE_VISIBLE_SCAN_PARSE_PREFETCH : 1;
    return hasRemoteParseApiKey(settings) ? VISIBLE_SCAN_REMOTE_PARSE_PREFETCH : 1;
}

function isNarrowVisibleScanViewport(): boolean {
    return typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth <= VISIBLE_SCAN_MOBILE_VIEWPORT_WIDTH;
}

function isYouTubeVisibleScanHost(hostname = location.hostname): boolean {
    return hostname === 'youtu.be' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
}

function hasJpdbParseApiKey(settings: ReaderSettings): boolean {
    return Boolean(settings.apiKey.trim());
}

function hasRemoteParseApiKey(settings: ReaderSettings): boolean {
    return Boolean(settings.apiKey.trim() || settings.jitenApiKey.trim());
}

function shouldStartPitchEnrichmentBeforeApply(tokens: JPDBToken[]): boolean {
    return tokens.some(token => token.card.source === 'fallback'
        && token.card.spelling.trim()
        && !token.rubies.length);
}

function scanParseOptions(settings: ReaderSettings, _targets: ScanTextTarget[] = []): VisibleScanParseOptions {
    return {
        jpdbTimeoutMs: hasRemoteParseApiKey(settings) ? VISIBLE_SCAN_REMOTE_PARSE_TIMEOUT_MS : VISIBLE_SCAN_PARSE_TIMEOUT_MS,
        allowJpdbTimeoutFallback: true,
        includeLocalPitch: false,
        allowSegmentedFallback: true,
    };
}

function canContinueVisibleScan(targets: ScanTextTarget[]): boolean {
    return targets.some(target => !target.singlePassScan);
}

function chunkLongScanTargets(targets: ScanTextTarget[], settings: ReaderSettings): ScanTextTarget[] {
    return targets.flatMap(target => chunkLongScanTarget(target, settings));
}

function chunkLongScanTarget(target: ScanTextTarget, settings: ReaderSettings): ScanTextTarget[] {
    if (target.nonDestructive) return [target];
    const chunkSize = visibleScanTargetTextChunkSize(settings);
    if (target.text.length <= chunkSize) return [target];
    return isFragmentTextTarget(target)
        ? chunkLongFragmentTarget(target, chunkSize)
        : chunkLongTextTarget(target, chunkSize);
}

function chunkLongTextTarget(target: TextTarget, chunkSize: number): ScanTextTarget[] {
    const range = textTargetTrimmedSourceRange(target);
    if (!range) return [target];
    return chunkTextRanges(target.text, chunkSize)
        .map(([start, end]) => textTargetChunk(target, range.start + start, range.start + end))
        .filter((chunk): chunk is FragmentTextTarget => Boolean(chunk));
}

function textTargetChunk(target: TextTarget, start: number, end: number): FragmentTextTarget | null {
    if (end <= start) return null;
    const text = target.node.data.slice(start, end);
    if (!text) return null;
    return {
        text,
        parent: target.parent,
        fragments: [{
            node: target.node,
            start,
            end,
            hasNativeRuby: Boolean(target.hasNativeRuby),
            layoutSensitive: target.layoutSensitive,
            passiveInteraction: target.passiveInteraction,
        }],
        layoutSensitive: target.layoutSensitive,
        passiveInteraction: target.passiveInteraction,
        singlePassScan: target.singlePassScan,
        forceInlineRender: target.forceInlineRender,
    };
}

function textTargetTrimmedSourceRange(target: TextTarget): { start: number; end: number } | null {
    const start = target.node.data.indexOf(target.text);
    return start < 0 ? null : { start, end: start + target.text.length };
}

function chunkLongFragmentTarget(target: FragmentTextTarget, chunkSize: number): ScanTextTarget[] {
    return chunkTextRanges(target.text, chunkSize)
        .map(([start, end]) => fragmentTargetChunk(target, start, end))
        .filter((chunk): chunk is FragmentTextTarget => Boolean(chunk));
}

function fragmentTargetChunk(target: FragmentTextTarget, start: number, end: number): FragmentTextTarget | null {
    const fragments = fragmentRange(target.fragments, start, end);
    if (!fragments.length) return null;
    return {
        ...target,
        text: target.text.slice(start, end),
        fragments,
    };
}

function fragmentRange(fragments: TextFragment[], start: number, end: number): TextFragment[] {
    const result: TextFragment[] = [];
    let cursor = 0;
    for (const fragment of fragments) {
        const length = fragment.end - fragment.start;
        const fragmentStart = cursor;
        const fragmentEnd = cursor + length;
        const overlapStart = Math.max(start, fragmentStart);
        const overlapEnd = Math.min(end, fragmentEnd);
        if (overlapEnd > overlapStart) {
            result.push({
                ...fragment,
                start: fragment.start + overlapStart - fragmentStart,
                end: fragment.start + overlapEnd - fragmentStart,
            });
        }
        cursor = fragmentEnd;
        if (cursor >= end) break;
    }
    return result;
}

function chunkTextRanges(text: string, chunkSize: number): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    let start = 0;
    while (start < text.length) {
        const end = nextChunkEnd(text, start, chunkSize);
        ranges.push([start, end]);
        start = end;
    }
    return ranges;
}

function nextChunkEnd(text: string, start: number, chunkSize: number): number {
    const hardEnd = Math.min(text.length, start + chunkSize);
    if (hardEnd >= text.length) return text.length;
    if (text.length - hardEnd < VISIBLE_SCAN_TARGET_TEXT_CHUNK_MIN_TAIL) return text.length;
    return chunkBoundaryBefore(text, start, hardEnd, chunkSize) ?? hardEnd;
}

function chunkBoundaryBefore(text: string, start: number, hardEnd: number, chunkSize: number): number | null {
    const softStart = Math.max(start + Math.floor(chunkSize * 0.6), start + 1);
    for (let index = hardEnd; index > softStart; index -= 1) {
        if (/[。！？!?]/u.test(text[index - 1] ?? '')) return index;
    }
    for (let index = hardEnd; index > softStart; index -= 1) {
        if (/[、，,\n\r\s]/u.test(text[index - 1] ?? '')) return index;
    }
    return null;
}

interface ScanApplyPlan {
    target: ScanTextTarget;
    tokens: JPDBToken[];
}

interface VisibleScanParseWork {
    batch: ScanTextTarget[];
    result: Promise<{ parsed: JPDBToken[][] } | { error: unknown }>;
}

function scanApplyPlans(batch: ScanTextTarget[], parsed: JPDBToken[][], start: number): ScanApplyPlan[] {
    return batch
        .map((target, offset) => ({ target, tokens: parsed[start + offset] ?? [] }))
        .sort((a, b) => compareScanTargetsForApply(a.target, b.target));
}

function compareScanTargetsForApply(a: ScanTextTarget, b: ScanTextTarget): number {
    const nodeA = scanTargetApplyNode(a);
    const nodeB = scanTargetApplyNode(b);
    if (!nodeA || !nodeB) return 0;
    if (nodeA === nodeB) {
        return scanTargetEndOffset(b) - scanTargetEndOffset(a)
            || scanTargetStartOffset(b) - scanTargetStartOffset(a);
    }
    const position = nodeA.compareDocumentPosition(nodeB);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return -1;
    return 0;
}

function scanTargetApplyNode(target: ScanTextTarget): Text | null {
    if (!isFragmentTextTarget(target)) return target.node;
    return target.fragments[target.fragments.length - 1]?.node ?? null;
}

function scanTargetStartOffset(target: ScanTextTarget): number {
    return isFragmentTextTarget(target) ? target.fragments[0]?.start ?? 0 : 0;
}

function scanTargetEndOffset(target: ScanTextTarget): number {
    return isFragmentTextTarget(target)
        ? target.fragments[target.fragments.length - 1]?.end ?? 0
        : target.node.data.length;
}

function isFragmentTextTarget(target: ScanTextTarget): target is FragmentTextTarget {
    return 'fragments' in target;
}

function visiblePageCoverageSummary(): VisiblePageCoverageSummary {
    const summary: VisiblePageCoverageAccumulator = {
        cards: new Set<string>(),
        iPlusOne: new Set<string>(),
        known: 0,
        unknown: 0,
    };
    for (const word of document.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-card-id][data-reading-index]')) {
        addVisiblePageCoverageWord(summary, word);
    }
    return {
        total: summary.cards.size,
        known: summary.known,
        unknown: summary.unknown,
        iPlusOne: summary.iPlusOne.size,
    };
}

function addVisiblePageCoverageWord(summary: VisiblePageCoverageAccumulator, word: HTMLElement): void {
    if (word.closest('[data-jpdb-reader-root]')) return;
    const key = visiblePageCoverageCardKey(word);
    countVisiblePageCoverageCard(summary, word, key);
    countVisiblePageCoverageMiningInsight(summary, word, key);
}

function visiblePageCoverageCardKey(word: HTMLElement): string {
    const cardId = word.dataset.cardId || word.dataset.vid || '';
    if (!cardId) return '';
    return `${word.dataset.cardSource || 'jpdb'}:${cardId}/${word.dataset.readingIndex || word.dataset.sid || ''}`;
}

function countVisiblePageCoverageCard(summary: VisiblePageCoverageAccumulator, word: HTMLElement, key: string): void {
    if (!key || summary.cards.has(key)) return;
    summary.cards.add(key);
    if (word.matches('.jpdb-known,.jpdb-never-forget,.jpdb-redundant')) summary.known += 1;
    if (word.matches('.jpdb-new,.jpdb-not-in-deck,.jpdb-in-deck')) summary.unknown += 1;
}

function countVisiblePageCoverageMiningInsight(summary: VisiblePageCoverageAccumulator, word: HTMLElement, key: string): void {
    if (word.dataset.miningInsight !== 'i-plus-one') return;
    summary.iPlusOne.add([word.dataset.sentence, visiblePageCoverageInsightSurface(word, key)].join('\u0000'));
}

function visiblePageCoverageInsightSurface(word: HTMLElement, key: string): string {
    return key || word.dataset.expression || word.textContent || '';
}

// Builds the next parse batch: caps by item count AND text volume, and drops
// targets whose node left the DOM or whose text changed since collection —
// parse-time staleness filtering, not just apply-time (P1 abortable
// scheduler: fast scrolls stop paying for regions that no longer exist).
function nextVisibleScanParseBatch(
    targets: ScanTextTarget[],
    startCursor: number,
    charBudget = VISIBLE_SCAN_PARSE_CHAR_BUDGET,
): { batch: ScanTextTarget[]; cursor: number } {
    const batch: ScanTextTarget[] = [];
    let cursor = startCursor;
    let budget = 0;
    while (cursor < targets.length && batch.length < VISIBLE_SCAN_PARSE_BATCH_SIZE) {
        const target = targets[cursor];
        if (!target || !isCurrentScanTarget(target)) {
            cursor += 1;
            continue;
        }
        const length = target.text.length;
        if (batch.length && budget + length > charBudget) break;
        batch.push(target);
        budget += length;
        cursor += 1;
    }
    return { batch, cursor };
}
