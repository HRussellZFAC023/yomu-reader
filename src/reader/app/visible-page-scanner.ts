import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    healTextMirrorPageVisibility,
    isCurrentScanTarget,
    healUngrowableInFlowClampRows,
    makeRoomForRubyInCroppedRows,
    noteConstrainedRowLayoutSettled,
    projectAdditiveTextMirrors,
    refreshWrappedScanWordUnderlines,
    removeStaleControlTextMirrors,
    removeNonDestructiveScanMirrors,
    scanTargetRequiresWholeSourceMirror,
    unwrapReaderWords,
    withMirrorTokenApply,
    type FragmentTextTarget,
    type ScanTextTarget,
    type TextFragment,
    type TextTarget,
} from '../dom/index';
import { formatUiText } from '../app/i18n';
import { normalizeOcrScannerLinesInRoot } from './dom-helpers';
import { refreshRenderedMiningInsights } from '../dom/rendered-word-state';
import { activeTargetLanguageDisplayName } from './target-language-name';
import { userFacingErrorText } from './user-facing-errors';
import { Logger } from './logger';
import { collectScanTargetsInSteps, effectiveSiteScanCollectionLimit } from './site-parsers';
import {
    effectiveFuriganaMode,
    effectiveReaderColorSource,
    effectiveReaderTextColorSource,
    shouldLookupAnkiStatus,
    shouldLookupBunproWordStates,
} from '../settings/index';
import { applyAuthoredVocabularyOverrides } from '../lookup/authored-vocabulary';
import { ParkableObserver } from '../platform/page-activity';
import type { JPDBToken, ReaderSettings } from './types';
import { isYouTubeAppHostname } from './youtube-host';

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
// Coalesce a burst of settle signals (font swaps, resize, reflow) into a single
// document-wide read-then-write pass. Long enough to ride out a run of resize
// callbacks, short enough that a webfont swap heals well within a frame budget.
const VISIBLE_SCAN_SETTLE_REFRESH_DEBOUNCE_MS = 200;
// Detail hydration can finish after the ordinary 1.5s post-scan sweep. Batch
// its changed roots into one targeted pass so late ruby/pitch never waits for
// a future resize or rescan, without reviving document-wide feed churn.
const LATE_ANNOTATION_REFRESH_WINDOW_MS = 50;
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
    skipApi?: boolean;
    publicJitenDetailLimit?: number;
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
    // Priority subtitle enrichment can resolve canonical cards before their
    // offscreen cue nodes are rewritten. Reattach those tokens to the concrete
    // rendered roots so late local-SRS/Anki/Bunpro effects cannot be lost.
    reconcileResolvedWordEffects?: (tokens: JPDBToken[], roots: ParentNode[]) => void;
    // Keep the app's semantic word index complete as each small scan root is
    // painted. Late detail can then target 12 cards without 12 document walks.
    noteRenderedRoots?: (roots: ParentNode[]) => void;
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
    // Only an explicit cancellation invalidates a running generation. Ordinary
    // scan requests coalesce behind the active pass so mutation/hover storms
    // cannot repeatedly discard otherwise valid tail coverage.
    private scanGeneration = 0;
    // Class E: consecutive continuation scans queued because collection hit the
    // budget cap. Silent continuations make progress via the mirror-skip (an
    // already-mirrored head is skipped at the next collection), but a page
    // whose head never mirrors could otherwise re-walk forever — bound it.
    private continuationScans = 0;
    private continuationFailedTargetKeys = new Set<string>();
    private continuationTargetNodeIds = new WeakMap<Node, number>();
    private nextContinuationTargetNodeId = 1;
    private asbScanInFlight = false;
    private asbDrainTimer?: number;
    private clampSweepTimer: number | undefined;
    // Settle-driven geometry heal (D2): a word can re-wrap and a mirror run can
    // drift AFTER the post-scan sweep — iOS font boosting, webfont swap/FOUT,
    // image-load reflow, viewport resize on sites that never auto-rescan. These
    // signals re-run the same read-then-write sweep once, coalesced.
    private settleTriggersInstalled = false;
    private settleRefreshTimer: number | undefined;
    private settleResizeObserver?: ParkableObserver<Element, ResizeObserverOptions>;
    private settleSignalAbort?: AbortController;
    private lastSettleWidth = -1;
    private lateAnnotationStateRoots = new Set<ParentNode>();
    private lateAnnotationGeometryRoots = new Set<ParentNode>();
    private lateAnnotationRefreshTimer: number | undefined;
    constructor(private readonly dependencies: VisiblePageScannerDependencies) {}

    private makeRoomForRuby(root?: ParentNode): number {
        return (this.dependencies.makeRoomForRubyInCroppedRows ?? makeRoomForRubyInCroppedRows)(root);
    }

    private clearPendingGeometryRefreshes(): void {
        window.clearTimeout(this.clampSweepTimer);
        this.clampSweepTimer = undefined;
        window.clearTimeout(this.settleRefreshTimer);
        this.settleRefreshTimer = undefined;
        window.clearTimeout(this.lateAnnotationRefreshTimer);
        this.lateAnnotationRefreshTimer = undefined;
        this.lateAnnotationStateRoots.clear();
        this.lateAnnotationGeometryRoots.clear();
    }

    destroy(): void {
        this.destroyed = true;
        this.scanPending = false;
        window.clearTimeout(this.asbDrainTimer);
        this.asbDrainTimer = undefined;
        this.clearPendingGeometryRefreshes();
        this.settleResizeObserver?.dispose();
        this.settleResizeObserver = undefined;
        this.settleSignalAbort?.abort();
        this.settleSignalAbort = undefined;
        this.clearPageFuriganaMode();
    }

    cancelVisiblePageScan(): void {
        this.scanGeneration++;
        this.scanPending = false;
        this.scanPendingSilent = true;
        this.resetContinuationState();
    }

    // A hidden tab cannot show a healed line, so clear the pending clamp/settle
    // geometry timers and the ASB drain when the page is backgrounded. The
    // event-driven settle signals (resize/font) stay wired — they simply re-arm
    // nothing while hidden (scheduleSettleRefresh bails) — and the next scan
    // after the page returns re-arms the sweep with fresh geometry. The
    // ResizeObserver parks itself on the shared dormancy signal instead, since
    // a swallowed background delivery would otherwise lose its reflow outright.
    pauseGeometrySweeps(): void {
        this.clearPendingGeometryRefreshes();
        window.clearTimeout(this.asbDrainTimer);
        this.asbDrainTimer = undefined;
    }

    // An SPA that replaces <body> leaves the settle observer watching a node
    // that can never reflow again, so width-driven heals go quiet for the rest
    // of the session. Re-point it at the live body and drop the width baseline
    // so the observer's mandatory first delivery only primes: the replacement
    // has not settled, it has merely been measured for the first time.
    repointGeometrySettleTarget(): void {
        const observer = this.settleResizeObserver;
        if (this.destroyed || !observer) return;
        if (typeof document === 'undefined' || !document.body) return;
        observer.disconnect();
        this.lastSettleWidth = -1;
        observer.observe(document.body);
    }

    scheduleLateAnnotationRefresh(
        roots: Iterable<ParentNode>,
        geometryRoots: Iterable<ParentNode> = roots,
    ): void {
        if (this.destroyed || typeof window === 'undefined') return;
        for (const root of roots) {
            if (isConnectedNode(root)) this.lateAnnotationStateRoots.add(root);
        }
        for (const root of geometryRoots) {
            if (isConnectedNode(root)) this.lateAnnotationGeometryRoots.add(root);
        }
        if (!this.lateAnnotationStateRoots.size && !this.lateAnnotationGeometryRoots.size) return;
        // Leading coalescer: a continuous detail queue must not keep pushing
        // reconciliation into the future. The first resolved card guarantees a
        // flush; cards joining during the fixed 50ms window only add roots.
        if (this.lateAnnotationRefreshTimer !== undefined) return;
        this.lateAnnotationRefreshTimer = window.setTimeout(() => {
            this.lateAnnotationRefreshTimer = undefined;
            if (this.destroyed) return;
            this.flushLateAnnotationRefresh();
        }, LATE_ANNOTATION_REFRESH_WINDOW_MS);
    }

    private flushLateAnnotationRefresh(): void {
        if (this.destroyed) {
            this.lateAnnotationStateRoots.clear();
            this.lateAnnotationGeometryRoots.clear();
            return;
        }
        const stateRoots = compactConnectedRoots(this.lateAnnotationStateRoots);
        const geometryRoots = compactConnectedRoots(this.lateAnnotationGeometryRoots);
        this.lateAnnotationStateRoots.clear();
        this.lateAnnotationGeometryRoots.clear();
        if (this.destroyed) return;
        this.dependencies.pauseMutationObserver(() => {
            stateRoots.forEach(root => {
                refreshRenderedMiningInsights(root);
                this.dependencies.refreshWordContrast?.(root);
            });
            if (!geometryRoots.length || (typeof document !== 'undefined' && document.hidden)) return;
            noteConstrainedRowLayoutSettled();
            geometryRoots.forEach(root => this.makeRoomForRuby(root));
            geometryRoots.forEach(root => healUngrowableInFlowClampRows(root));
            geometryRoots.forEach(root => refreshWrappedScanWordUnderlines(root));
            // Furigana replacement already enters the mirror projection's own
            // root/portal batch scheduler. Calling projectAdditiveTextMirrors
            // once per hydrated root here would repeat its document-wide
            // portal pruning for every sibling card in a feed.
        });
    }

    async scanVisiblePage(options: { silent?: boolean } = {}): Promise<void> {
        const silent = Boolean(options.silent);
        const settings = this.dependencies.getSettings();
        // Inline wrappers are not layout-neutral in Firefox/WebKit: even with
        // every decoration transparent, splitting one native CJK text run into
        // token spans changes punctuation and line-break opportunities. When
        // the learner has disabled every visible page-annotation channel, keep
        // the native run intact and let the existing caret/Range pointer lookup
        // serve hover/click dictionaries instead. Cancel first so a parse that
        // started under the previous settings cannot put the wrappers back.
        if (!pageScanHasVisibleAnnotations(settings)) {
            this.cancelVisiblePageScan();
            this.syncPageFuriganaMode();
            removeNonDestructiveScanMirrors(document);
            unwrapReaderWords(document);
            return;
        }
        if (!this.beginScan(silent)) return;
        this.scanGeneration++;
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
        // A scan just annotated the page, so the settle signals now have real
        // geometry to heal; installing here (once) guarantees document.body
        // exists and avoids arming observers before the first annotation.
        this.installSettleTriggers();
        const sweep = (): void => this.runGeometrySettleSweep();
        // Silent auto-scans skip the immediate document-wide pass: apply-time
        // per-root sweeps already covered every changed root, and the delayed
        // sweep below still catches late-hydrating clamps. The synchronous
        // pass burned ~530 style recalcs per 15s of feed scrolling while
        // adjusting nothing.
        if (!silent) sweep();
        window.clearTimeout(this.clampSweepTimer);
        this.clampSweepTimer = window.setTimeout(sweep, VISIBLE_SCAN_CLAMP_SWEEP_DELAY_MS);
    }

    // The shared read-then-write geometry pass: room-for-ruby, in-flow clamp
    // heal (bidirectional recovery included), wrapped-word underline re-stamp,
    // and additive-mirror run re-alignment. Reused by the post-scan sweep and
    // every settle signal so late reflows converge on the same verdict.
    private runGeometrySettleSweep(): void {
        if (this.destroyed || typeof document === 'undefined') return;
        // A settle sweep runs precisely because layout may have moved (font
        // swap, image load, resize, or the immediate post-scan heal). Advance
        // the constrained-row style generation so this sweep — and the next
        // scan — re-measure fresh geometry instead of a stale memo. Between
        // sweeps the memo is reused, which is what spares steady-state scans
        // their per-pass reflow.
        noteConstrainedRowLayoutSettled();
        this.makeRoomForRuby(document);
        healUngrowableInFlowClampRows(document);
        refreshWrappedScanWordUnderlines(document);
        projectAdditiveTextMirrors(document);
    }

    // Wire the layout-settle signals that fire with no scan of their own —
    // idempotent, so a second scan never double-installs. Every listener is
    // torn down on destroy via the shared AbortController / observer handle.
    private installSettleTriggers(): void {
        if (this.settleTriggersInstalled || this.destroyed) return;
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        this.settleTriggersInstalled = true;
        const controller = new AbortController();
        this.settleSignalAbort = controller;
        const schedule = (): void => this.scheduleSettleRefresh();
        // Webfont load/swap (FOUT) re-flows every annotated line after the
        // mirror measured against the fallback face: heal once the document
        // fonts settle and again on every subsequent face load.
        const fonts = document.fonts;
        if (fonts) {
            fonts.ready.then(schedule).catch(() => undefined);
            fonts.addEventListener?.('loadingdone', schedule, { signal: controller.signal });
        }
        // iOS text-size boosting, dynamic-viewport chrome, and rotation resize
        // the visual viewport with no scan; window resize covers desktop.
        window.visualViewport?.addEventListener('resize', schedule, { signal: controller.signal });
        window.addEventListener('resize', schedule, { signal: controller.signal });
        // One coalesced ResizeObserver on the body catches eventless reflows —
        // a webfont swap or image load that changes the content-box WIDTH and
        // re-wraps words / displaces mirror runs. Gate strictly on width: a feed
        // grows the body's HEIGHT on every scroll without re-wrapping a single
        // existing line, and reacting to that would revive the document-wide
        // recalc storm the silent-scan path was built to avoid. The width-gated
        // sweep is idempotent, so its own reflows never re-trigger it.
        if (typeof ResizeObserver === 'function' && document.body) {
            const raw = new ResizeObserver(entries => {
                const width = entries[entries.length - 1]?.contentRect.width ?? -1;
                // The observer's mandatory initial callback just reports the
                // current size — nothing settled, so prime the baseline without
                // burning a document-wide sweep during boot (it cost a visible
                // boot frame on the WebKit frame-lane smoke).
                const priming = this.lastSettleWidth < 0;
                if (Math.abs(width - this.lastSettleWidth) < 0.5) return;
                this.lastSettleWidth = width;
                if (!priming) schedule();
            });
            // Park it while the tab is hidden: a background reflow heals
            // nothing visible, and letting the callback keep landing meant the
            // width baseline moved with no sweep to match it — the reflow was
            // swallowed rather than deferred. Re-observing on wake replays the
            // current size, so the whole hidden-time drift is healed once, and
            // only when the width actually moved.
            const observer = new ParkableObserver<Element, ResizeObserverOptions>(raw, { signal: controller.signal });
            observer.observe(document.body);
            this.settleResizeObserver = observer;
        }
    }

    private scheduleSettleRefresh(): void {
        if (this.destroyed || typeof window === 'undefined') return;
        // A settle signal that fires while the tab is hidden (a background
        // ResizeObserver tick, a late font load) heals nothing visible; let the
        // post-return scan re-arm the sweep instead of waking a hidden page.
        if (typeof document !== 'undefined' && document.hidden) return;
        window.clearTimeout(this.settleRefreshTimer);
        this.settleRefreshTimer = window.setTimeout(() => this.runGeometrySettleSweep(), VISIBLE_SCAN_SETTLE_REFRESH_DEBOUNCE_MS);
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
            this.dependencies.reconcileResolvedWordEffects?.(tokens, changedRoots);
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
        const targetCollectionLimit = !isNarrowVisibleScanViewport()
            ? VISIBLE_SCAN_TARGET_COLLECTION_LIMIT
            : isYouTubeVisibleScanHost() || hasJpdbParseApiKey(settings)
                ? VISIBLE_SCAN_MOBILE_TARGET_COLLECTION_LIMIT
                : VISIBLE_SCAN_MOBILE_FALLBACK_TARGET_COLLECTION_LIMIT;
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
        // Destructive chunks from one source must paint tail-to-head. Painting
        // a head chunk splits/replaces the source Text node, making later
        // offsets fail the current-target guard when a long paragraph crosses
        // parse batches (especially the smaller keyless-mobile budget). A tail
        // replacement leaves the original node as the connected prefix, so
        // every earlier chunk remains valid. Shadow/non-destructive targets are
        // singletons and therefore keep their normal order.
        const chunkGroups = collected.map(source => ({
            source,
            chunks: chunkLongScanTarget(source, settings).reverse(),
        }));
        const targets = chunkGroups.flatMap(group => group.chunks);
        if (!targets.length) {
            this.resetContinuationState();
            this.handleEmptyVisiblePageScan(silent);
            return;
        }

        const unparsedTargets = await this.parseAndApplyTargets(targets, generation, settings);
        if (this.isStaleScan(generation)) return;
        const effectiveCollectionLimit = effectiveSiteScanCollectionLimit(targetCollectionLimit, window.location.href);
        // Failed-source keys expand the next collection before exact filtering,
        // so a pass below the original cap has exhausted the eligible tail.
        // Persisting `hadFailedHead` here queued one redundant whole-page walk
        // after that successful uncapped continuation.
        if (collected.length >= effectiveCollectionLimit
            && this.canQueueContinuationScan(targets, silent)) {
            const unparsed = new Set(unparsedTargets);
            chunkGroups
                .filter(group => group.chunks.length > 0 && group.chunks.every(chunk => unparsed.has(chunk)))
                .forEach(group => this.continuationFailedTargetKeys.add(this.continuationTargetKey(group.source)));
            this.queueContinuationScan(silent);
            return;
        }
        this.resetContinuationState();
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
        return this.continuationScans < MAX_CONSECUTIVE_CONTINUATION_SCANS
            && (silent || targets.some(target => !target.singlePassScan));
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
        const skipMirroredHosts = silent || this.continuationScans > 0;
        const steps = collectScanTargetsInSteps(limit, window.location.href, {
            // A manual first pass must refresh already-rendered words, but any
            // budget continuation has to advance past the mirrors that pass
            // just painted or it recollects the same capped head forever.
            skipMirroredHosts,
            mirroredHeadTargetCount: skipMirroredHosts ? Math.max(1, this.continuationScans) * limit : 0,
            skipTargetCount: this.continuationFailedTargetKeys.size,
            skipTarget: target => this.continuationFailedTargetKeys.has(this.continuationTargetKey(target)),
        });
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

    private async parseAndApplyTargets(
        targets: ScanTextTarget[],
        generation: number,
        scanStartSettings: ReaderSettings,
        allowTransientReparse = true,
    ): Promise<ScanTextTarget[]> {
        let cursor = 0;
        const unparsedTargets: ScanTextTarget[] = [];
        // A target whose batch parse threw twice never actually resolved to "no
        // Japanese" — bench it and the whole source goes bare for the page. Keep
        // these apart from settled empties so the tail below can retry them once.
        const transientTargets: ScanTextTarget[] = [];
        const pending: VisibleScanParseWork[] = [];
        const parseCharBudget = !isNarrowVisibleScanViewport()
            ? VISIBLE_SCAN_PARSE_CHAR_BUDGET
            : hasJpdbParseApiKey(scanStartSettings)
                ? VISIBLE_SCAN_MOBILE_PARSE_CHAR_BUDGET
                : VISIBLE_SCAN_MOBILE_FALLBACK_PARSE_CHAR_BUDGET;
        const concurrency = hasRemoteParseApiKey(scanStartSettings)
            ? isYouTubeVisibleScanHost() ? YOUTUBE_VISIBLE_SCAN_PARSE_PREFETCH : VISIBLE_SCAN_REMOTE_PARSE_PREFETCH
            : 1;
        const schedule = (): void => {
            while (!this.isStaleScan(generation) && pending.length < concurrency && cursor < targets.length) {
                const next = nextVisibleScanParseBatch(targets, cursor, parseCharBudget);
                cursor = next.cursor;
                if (!next.batch.length) continue;
                const work: VisibleScanParseWork = {
                    batch: next.batch,
                    transient: false,
                    // The callback only fires after this parse settles, long
                    // after the initializer completes, so referencing `work`
                    // here is safe (no TDZ hit) and avoids a placeholder promise.
                    result: this.parseVisibleScanBatch(next.batch, generation, () => { work.transient = true; }),
                };
                pending.push(work);
            }
        };

        schedule();
        while (pending.length) {
            if (this.isStaleScan(generation)) return unparsedTargets;
            const work = pending.shift()!;
            const parsed = await work.result;
            parsed.forEach((tokens, index) => {
                if (tokens.length || !work.batch[index]) return;
                (work.transient ? transientTargets : unparsedTargets).push(work.batch[index]);
            });
            if (this.isStaleScan(generation)) return unparsedTargets;
            await this.applyParsedBatch(work.batch, parsed, scanStartSettings, generation);
            schedule();
            if (pending.length || cursor < targets.length) await waitForVisibleScanTurn();
        }
        if (allowTransientReparse && transientTargets.length && !this.isStaleScan(generation)) {
            // Exactly one bounded reparse of only the thrown-twice targets. The
            // recursion disables further reparses, so a source that keeps
            // throwing settles into unparsedTargets (and is benched) rather than
            // looping. A source that recovers here paints on this same scan.
            const stillUnparsed = await this.parseAndApplyTargets(transientTargets, generation, scanStartSettings, false);
            return unparsedTargets.concat(stillUnparsed);
        }
        // Without a reparse, transient failures fall back to bench semantics so a
        // persistently broken source cannot re-queue the page forever.
        return unparsedTargets.concat(transientTargets);
    }

    private async parseVisibleScanBatch(
        batch: ScanTextTarget[],
        generation: number,
        onTransientFailure?: () => void,
    ): Promise<JPDBToken[][]> {
        const paragraphs = batch.map(target => target.text);
        const options = scanParseOptions(this.dependencies.getSettings());
        try {
            return await this.dependencies.parseJapanese(paragraphs, options);
        } catch (error) {
            if (this.isStaleScan(generation)) return paragraphs.map(() => []);
            // A single provider/adapter failure must not abandon every later
            // target in the page scan. Retry this batch once through the local
            // + segmented path; the retry is explicitly API-free, so it is
            // bounded and cannot create a request loop.
            log.warn('Visible page parse batch failed; retrying locally', error);
            try {
                return await this.dependencies.parseJapanese(paragraphs, { ...options, skipApi: true });
            } catch (fallbackError) {
                log.warn('Visible page local parse recovery failed; continuing with later batches', fallbackError);
                // Empty tokens here mean "parse threw", not "settled no Japanese":
                // flag the batch so the caller reparses it once instead of benching.
                onTransientFailure?.();
                return paragraphs.map(() => []);
            }
        }
    }

    private async applyParsedBatch(batch: ScanTextTarget[], parsed: JPDBToken[][], scanStartSettings: ReaderSettings, generation: number): Promise<void> {
        const resolved = batch.map((target, index) => applyAuthoredVocabularyOverrides(target, parsed[index] ?? []));
        const tokens = resolved.flat();
        const applyAnkiColors = this.shouldEnrichAnkiWords()
            ? this.dependencies.beginAnkiWordEnrichment?.(tokens)
            : undefined;
        const changedRoots = await this.applyTokens(batch, resolved, scanStartSettings, generation);
        applyAnkiColors?.(changedRoots);
        this.preloadParsed(resolved, changedRoots, {
            skipAnki: Boolean(applyAnkiColors),
        });
    }

    private async applyTokens(targets: ScanTextTarget[], parsed: JPDBToken[][], scanStartSettings: ReaderSettings, generation?: number): Promise<ParentNode[]> {
        const allChangedRoots = new Set<ParentNode>();
        const applyBatchSize = !isNarrowVisibleScanViewport()
            ? VISIBLE_SCAN_APPLY_BATCH_SIZE
            : hasJpdbParseApiKey(scanStartSettings)
                ? VISIBLE_SCAN_MOBILE_APPLY_BATCH_SIZE
                : VISIBLE_SCAN_MOBILE_FALLBACK_APPLY_BATCH_SIZE;
        for (let index = 0; index < targets.length; index += applyBatchSize) {
            if (this.shouldStopApplyingTokens(generation)) return [...allChangedRoots];
            const start = index;
            const batch = targets.slice(start, start + applyBatchSize);
            const changedRoots = new Set<ParentNode>();
            this.dependencies.pauseMutationObserver(() => withMirrorTokenApply(() => {
                // pauseMutationObserver only pauses the app-level auto-scan
                // observer; the PER-HOST text-mirror observers stay live and
                // would fire on our own teardown/rebuild mutations, dispatching
                // a stale event that schedules yet another scan (the OOM
                // feedback loop). withMirrorTokenApply suppresses that dispatch
                // for the duration of our own apply — real external re-renders
                // (outside this block) still trigger legitimate rescans.
                if (this.shouldStopApplyingTokens(generation)) return;
                batch.forEach((target, offset) => {
                    if (this.shouldStopApplyingTokens(generation)) return;
                    if (!isCurrentScanTarget(target)) return;
                    applyTokensToScanTarget(target, parsed[start + offset] ?? [], this.dependencies.getSettings());
                    changedRoots.add(target.parent);
                });
                changedRoots.forEach(root => {
                    normalizeOcrScannerLinesInRoot(root, this.dependencies.getSettings());
                    allChangedRoots.add(root);
                    this.dependencies.refreshWordContrast?.(root);
                });
            }));
            if (changedRoots.size) this.dependencies.noteRenderedRoots?.([...changedRoots]);
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
        // The in-flow clamp heal and wrapped-word underline stamping share the
        // same write profile (attribute-only; observers ignore it) and must
        // follow the room growth above — growing a row can rewrap its words.
        // Heal runs first: flipping an ungrowable row to rest-hidden removes
        // its rt from layout, which changes what wraps.
        for (const root of roots) {
            if (this.destroyed) return;
            healUngrowableInFlowClampRows(root);
        }
        for (const root of roots) {
            if (this.destroyed) return;
            refreshWrappedScanWordUnderlines(root);
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
        if (silent) return;
        // The scan looks for the ACTIVE target's language, so the toast names it
        // rather than saying "Japanese" to someone studying Russian (b20).
        const interfaceLanguage = this.dependencies.getSettings().interfaceLanguage;
        this.dependencies.toast(formatUiText(interfaceLanguage, 'noUnscannedJapaneseText', {
            language: activeTargetLanguageDisplayName(interfaceLanguage),
        }));
    }

    private handleVisiblePageScanError(error: unknown, silent: boolean): void {
        log.warn('Visible page scan failed', error);
        if (!silent) {
            const language = this.dependencies.getSettings().interfaceLanguage;
            this.dependencies.toast(userFacingErrorText(language, 'jpdbScanFailed', error));
        }
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
        const scheduledFromGeneration = this.scanGeneration;
        void waitForVisibleScanTurn().then(() => {
            if (this.isStaleScan(scheduledFromGeneration)) return;
            return this.scanVisiblePage({ silent });
        });
    }

    private queueContinuationScan(silent: boolean): void {
        if (this.destroyed) return;
        this.continuationScans += 1;
        this.scanPending = true;
        this.scanPendingSilent = this.scanPendingSilent && silent;
    }

    private resetContinuationState(): void {
        this.continuationScans = 0;
        this.continuationFailedTargetKeys.clear();
        this.continuationTargetNodeIds = new WeakMap<Node, number>();
        this.nextContinuationTargetNodeId = 1;
    }

    private continuationTargetKey(target: ScanTextTarget): string {
        if (!isFragmentTextTarget(target)) {
            return `node:${this.continuationNodeId(target.node)}\u0000${target.text}`;
        }
        const source = target.fragments.length
            ? target.fragments
                .map(fragment => `${this.continuationNodeId(fragment.node)}:${fragment.start}:${fragment.end}`)
                .join(',')
            : `parent:${this.continuationNodeId(target.parent)}`;
        return `${source}\u0000${target.text}\u0000${target.parserId ?? ''}`;
    }

    private continuationNodeId(node: Node): number {
        const existing = this.continuationTargetNodeIds.get(node);
        if (existing !== undefined) return existing;
        const id = this.nextContinuationTargetNodeId;
        this.nextContinuationTargetNodeId += 1;
        this.continuationTargetNodeIds.set(node, id);
        return id;
    }

    private syncPageFuriganaMode(): void {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        if (!root) return;
        const settings = this.dependencies.getSettings();
        this.syncClampedRowReadingsMode(settings, root);
        if (settings.showFurigana && settings.furiganaMode === 'all') {
            if (root.getAttribute(FORCE_FURIGANA_MODE_ATTRIBUTE) !== 'all') {
                root.setAttribute(FORCE_FURIGANA_MODE_ATTRIBUTE, 'all');
            }
            return;
        }
        this.clearPageFuriganaMode();
    }

    // Owner amendment 2026-07-11: content clip rows show readings at rest by
    // default; the hover-only preference re-hides them via this root stamp
    // (the CSS keys on it, so flipping the setting needs no re-render).
    private syncClampedRowReadingsMode(settings: ReaderSettings, root: HTMLElement): void {
        if (settings.clampedRowReadings === 'hover') {
            if (root.getAttribute(CLAMPED_ROW_READINGS_ATTRIBUTE) !== 'hover') {
                root.setAttribute(CLAMPED_ROW_READINGS_ATTRIBUTE, 'hover');
            }
            return;
        }
        if (root.hasAttribute(CLAMPED_ROW_READINGS_ATTRIBUTE)) {
            root.removeAttribute(CLAMPED_ROW_READINGS_ATTRIBUTE);
        }
    }

    private clearPageFuriganaMode(): void {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        if (!root) return;
        if (root.getAttribute(FORCE_FURIGANA_MODE_ATTRIBUTE) === 'all') {
            root.removeAttribute(FORCE_FURIGANA_MODE_ATTRIBUTE);
        }
    }
}

export function pageScanHasVisibleAnnotations(settings: ReaderSettings): boolean {
    if (effectiveFuriganaMode(settings) !== 'off') return true;
    return effectiveReaderColorSource(settings, settings.wordHighlightColorSource, 'jpdb') !== 'off'
        || effectiveReaderColorSource(settings, settings.wordUnderlineColorSource, 'pitch') !== 'off'
        || effectiveReaderTextColorSource(settings, settings.wordTextColorSource, 'anki') !== 'off';
}

function waitForVisibleScanTurn(): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, 0));
}

function isNarrowVisibleScanViewport(): boolean {
    return typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth <= VISIBLE_SCAN_MOBILE_VIEWPORT_WIDTH;
}

function isYouTubeVisibleScanHost(hostname = location.hostname): boolean {
    return isYouTubeAppHostname(hostname);
}

function hasJpdbParseApiKey(settings: ReaderSettings): boolean {
    return Boolean(settings.apiKey.trim());
}

function hasRemoteParseApiKey(settings: ReaderSettings): boolean {
    return Boolean(settings.apiKey.trim() || settings.jitenApiKey.trim());
}

function scanParseOptions(settings: ReaderSettings): VisibleScanParseOptions {
    return {
        jpdbTimeoutMs: hasRemoteParseApiKey(settings) ? VISIBLE_SCAN_REMOTE_PARSE_TIMEOUT_MS : VISIBLE_SCAN_PARSE_TIMEOUT_MS,
        allowJpdbTimeoutFallback: true,
        includeLocalPitch: false,
        allowSegmentedFallback: true,
        // Public /parse returns stable exact ids without detail calls. Paint
        // those sparse spans first, then let ReaderApp's bounded reading lane
        // repaint them asynchronously; up to twelve /info round-trips must not
        // sit on the visible scan's first-DOM-apply path.
        publicJitenDetailLimit: 0,
    };
}

function chunkLongScanTarget(target: ScanTextTarget, settings: ReaderSettings): ScanTextTarget[] {
    if (target.nonDestructive) return [target];
    const chunkSize = !isNarrowVisibleScanViewport()
        ? VISIBLE_SCAN_TARGET_TEXT_CHUNK_SIZE
        : hasJpdbParseApiKey(settings)
            ? VISIBLE_SCAN_MOBILE_TARGET_TEXT_CHUNK_SIZE
            : VISIBLE_SCAN_MOBILE_FALLBACK_TARGET_TEXT_CHUNK_SIZE;
    if (target.text.length <= chunkSize) return [target];
    if (scanTargetRequiresWholeSourceMirror(target)) return [target];
    const fragmentTarget = isFragmentTextTarget(target);
    const sourceStart = fragmentTarget ? 0 : target.node.data.indexOf(target.text);
    if (sourceStart < 0) return [target];
    const chunks: FragmentTextTarget[] = [];
    for (let start = 0; start < target.text.length;) {
        const end = nextChunkEnd(target.text, start, chunkSize);
        const chunk = fragmentTarget
            ? fragmentTargetChunk(target, start, end)
            : textTargetChunk(target, sourceStart + start, sourceStart + end);
        // These are slices of ONE deliberate paint, not repeated attempts by a
        // framework-hostile render loop. Counting slices independently trips
        // the four-repaint fallback mid-paragraph and hides the remaining host.
        if (chunk) chunks.push({ ...chunk, suppressRepaintLoopMirror: true });
        start = end;
    }
    return chunks;
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

interface VisibleScanParseWork {
    batch: ScanTextTarget[];
    result: Promise<JPDBToken[][]>;
    // Set when parseVisibleScanBatch exhausted its local retry (parse threw
    // twice): the empty tokens are a transient failure, not a settled "no
    // Japanese here", so these targets get one bounded reparse instead of being
    // benched for the rest of the page.
    transient: boolean;
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

function isConnectedNode(root: unknown): root is ParentNode & Node {
    if (typeof Node !== 'undefined' && root instanceof Node) {
        return Boolean(root.isConnected);
    }
    return Boolean(root && typeof root === 'object' && 'isConnected' in root && (root as Node).isConnected);
}

function compactConnectedRoots(roots: Iterable<ParentNode>): ParentNode[] {
    const connected = [...new Set(roots)].filter(isConnectedNode);
    // If a feed/card ancestor and one of its sentence descendants both joined
    // the window, scanning the ancestor already covers the child. Keeping only
    // the broadest connected roots avoids duplicate semantic and layout passes.
    return connected.filter(root => !connected.some(other => other !== root && other.contains(root)));
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
