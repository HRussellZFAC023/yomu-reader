import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    isCurrentScanTarget,
    makeRoomForRubyInCroppedRows,
    type FragmentTextTarget,
    type ScanTextTarget,
    type TextFragment,
    type TextTarget,
} from '../dom/index';
import { formatUiText, uiText } from './i18n';
import { Logger } from './logger';
import { collectScanTargets } from './site-parsers';
import { shouldLookupAnkiStatus } from '../settings/index';
import type { JPDBToken, ReaderSettings } from './types';

const log = Logger.scope('VisiblePageScanner');
const VISIBLE_SCAN_PARSE_BATCH_SIZE = 80;
// Byte cap per parse batch (P1 abortable scheduler): a handful of huge
// paragraphs would otherwise ride in one batch and stall the apply turn.
const VISIBLE_SCAN_PARSE_CHAR_BUDGET = 6_000;
const VISIBLE_SCAN_MOBILE_PARSE_CHAR_BUDGET = 3_200;
const VISIBLE_SCAN_MOBILE_FALLBACK_PARSE_CHAR_BUDGET = 2_000;
const VISIBLE_SCAN_TARGET_COLLECTION_LIMIT = 120;
const VISIBLE_SCAN_MOBILE_TARGET_COLLECTION_LIMIT = 120;
const VISIBLE_SCAN_MOBILE_FALLBACK_TARGET_COLLECTION_LIMIT = 60;
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
const YOUTUBE_VISIBLE_SCAN_PARSE_PREFETCH = 2;
const ASB_SCAN_BATCH_LIMIT = 12;
const ASB_SCAN_DRAIN_DELAY_MS = 80;
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
    private asbScanInFlight = false;
    private asbDrainTimer?: number;
    private clampSweepTimer: number | undefined;

    constructor(private readonly dependencies: VisiblePageScannerDependencies) {}

    destroy(): void {
        this.destroyed = true;
        this.scanPending = false;
        window.clearTimeout(this.asbDrainTimer);
        this.asbDrainTimer = undefined;
        window.clearTimeout(this.clampSweepTimer);
        this.clampSweepTimer = undefined;
    }

    interruptVisiblePageScan(): void {
        this.scanGeneration++;
        this.scanPending = false;
        this.scanPendingSilent = true;
    }

    async scanVisiblePage(options: { silent?: boolean } = {}): Promise<void> {
        const silent = Boolean(options.silent);
        this.scanGeneration++;
        if (!this.beginScan(silent)) return;
        const generation = this.scanGeneration;
        const done = log.time('scanVisiblePage', { silent });
        try {
            await this.runVisiblePageScan(silent, generation);
        } catch (error) {
            this.handleVisiblePageScanError(error, silent);
        } finally {
            this.finishScan();
            this.scheduleClampedRubySweep();
            done();
        }
    }

    // UT-70: hosts that hydrate progressively (YouTube custom elements,
    // notably on iPad Safari) apply line-clamp/ellipsis styles AFTER a scan
    // annotated their text — the grown ruby line then gets cropped and the
    // base text disappears. Sweep right after the scan and once more after
    // hydration settles; rescans re-arm it, so late clamps are always caught.
    private scheduleClampedRubySweep(): void {
        if (this.destroyed || typeof document === 'undefined') return;
        const sweep = (): void => {
            if (this.destroyed || typeof document === 'undefined') return;
            const adjusted = makeRoomForRubyInCroppedRows(document);
            if (adjusted) log.info('Made room for ruby in cropped rows', { adjusted });
        };
        sweep();
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
        const settings = this.dependencies.getSettings();
        const targetCollectionLimit = visibleScanTargetCollectionLimit(settings);
        const targets = chunkLongScanTargets(collectScanTargets(targetCollectionLimit), settings);
        if (!targets.length) {
            this.handleEmptyVisiblePageScan(silent);
            return;
        }

        const parsedAnyTokens = await this.parseAndApplyTargets(targets, generation, settings);
        if (this.isStaleScan(generation)) return;
        if (parsedAnyTokens && targets.length >= targetCollectionLimit && canContinueVisibleScan(targets)) {
            this.queueContinuationScan(silent);
            return;
        }
        this.reportVisiblePageCoverage(silent);
    }

    private isStaleScan(generation: number): boolean {
        return this.destroyed || generation !== this.scanGeneration;
    }

    private async parseAndApplyTargets(targets: ScanTextTarget[], generation: number, scanStartSettings: ReaderSettings): Promise<boolean> {
        if (visibleScanParsePrefetchConcurrency() > 1) {
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
            const tokens = parsed.flat();
            const pitchStartedBeforeApply = shouldStartPitchEnrichmentBeforeApply(tokens);
            if (pitchStartedBeforeApply) await this.dependencies.enrichPitchWords(tokens);
            // Kick the status-color lookup off before touching the DOM so the
            // IndexedDB roundtrip overlaps the apply work.
            const applyAnkiColors = this.shouldEnrichAnkiWords()
                ? this.dependencies.beginAnkiWordEnrichment?.(tokens)
                : undefined;
            const changedRoots = await this.applyTokens(batch, parsed, scanStartSettings, generation);
            applyAnkiColors?.(changedRoots);
            this.preloadParsed(parsed, changedRoots, {
                skipAnki: Boolean(applyAnkiColors),
                skipPitch: pitchStartedBeforeApply,
            });
            if (cursor < targets.length) await waitForVisibleScanTurn();
        }
        return parsedAnyTokens;
    }

    private async parseAndApplyTargetsWithPrefetch(targets: ScanTextTarget[], generation: number, scanStartSettings: ReaderSettings): Promise<boolean> {
        let cursor = 0;
        let parsedAnyTokens = false;
        const pending: VisibleScanParseWork[] = [];
        const parseCharBudget = visibleScanParseCharBudget(scanStartSettings);
        const concurrency = visibleScanParsePrefetchConcurrency();
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
        const tokens = parsed.flat();
        const pitchStartedBeforeApply = shouldStartPitchEnrichmentBeforeApply(tokens);
        if (pitchStartedBeforeApply) void this.dependencies.enrichPitchWords(tokens);
        const applyAnkiColors = this.shouldEnrichAnkiWords()
            ? this.dependencies.beginAnkiWordEnrichment?.(tokens)
            : undefined;
        const changedRoots = await this.applyTokens(batch, parsed, scanStartSettings, generation);
        applyAnkiColors?.(changedRoots);
        this.preloadParsed(parsed, changedRoots, {
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
            this.dependencies.pauseMutationObserver(() => {
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
                    makeRoomForRubyInCroppedRows(root);
                });
            });
            if (index + applyBatchSize < targets.length) await waitForVisibleScanTurn();
        }
        // One contrast pass per unique root after all chunks — running it per
        // chunk forced repeated style recalcs on the same containers.
        allChangedRoots.forEach(root => this.dependencies.refreshWordContrast?.(root));
        return [...allChangedRoots];
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
        return !this.destroyed && shouldLookupAnkiStatus(this.dependencies.getSettings());
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
        this.scanPending = true;
        this.scanPendingSilent = this.scanPendingSilent && silent;
    }
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

function visibleScanParsePrefetchConcurrency(): number {
    return isYouTubeVisibleScanHost() ? YOUTUBE_VISIBLE_SCAN_PARSE_PREFETCH : 1;
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
