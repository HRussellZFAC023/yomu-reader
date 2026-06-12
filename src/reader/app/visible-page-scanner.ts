import { applyTokensToScanTarget, collectTextTargetsIn, isCurrentScanTarget, stripRubyInClampedRows, type ScanTextTarget } from '../dom/index';
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
// Large enough that the first apply paints everything just parsed in one go —
// small chunks made ruby/colors arrive in visible waves.
const VISIBLE_SCAN_APPLY_BATCH_SIZE = 48;
const VISIBLE_SCAN_PARSE_TIMEOUT_MS = 450;
const VISIBLE_SCAN_CLAMP_SWEEP_DELAY_MS = 1500;
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
            if (this.destroyed) return;
            const stripped = stripRubyInClampedRows(document);
            if (stripped) log.info('Stripped ruby from late-clamped rows', { stripped });
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
            const changedRoots = await this.applyTokens(targets, parsed);
            if (this.dependencies.prepareSubtitleTokensBeforeRender) {
                if (this.shouldEnrichAnkiWords()) await this.dependencies.enrichAnkiWords(tokens, changedRoots);
            } else {
                this.preloadParsed(parsed, changedRoots);
            }
            // A full batch means the offscreen cache likely has more
            // unprocessed cues; the caller keeps draining.
            return targets.length === ASB_SCAN_BATCH_LIMIT;
        } catch {
            // External subtitle overlays update frequently; the regular popup path still reports API errors.
            return false;
        }
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
        const targets = collectScanTargets();
        if (!targets.length) {
            this.handleEmptyVisiblePageScan(silent);
            return;
        }

        await this.parseAndApplyTargets(targets, generation);
        if (this.isStaleScan(generation)) return;
        this.reportVisiblePageCoverage(silent);
    }

    private isStaleScan(generation: number): boolean {
        return this.destroyed || generation !== this.scanGeneration;
    }

    private async parseAndApplyTargets(targets: ScanTextTarget[], generation: number): Promise<void> {
        let cursor = 0;
        while (cursor < targets.length) {
            if (this.isStaleScan(generation)) return;
            const next = nextVisibleScanParseBatch(targets, cursor);
            cursor = next.cursor;
            if (!next.batch.length) continue;
            const batch = next.batch;
            const parsed = await this.dependencies.parseJapanese(batch.map(target => target.text), scanParseOptions(this.dependencies.getSettings(), batch));
            if (this.isStaleScan(generation)) return;
            // Kick the status-color lookup off before touching the DOM so the
            // IndexedDB roundtrip overlaps the apply work.
            const applyAnkiColors = this.shouldEnrichAnkiWords()
                ? this.dependencies.beginAnkiWordEnrichment?.(parsed.flat())
                : undefined;
            const changedRoots = await this.applyTokens(batch, parsed);
            applyAnkiColors?.(changedRoots);
            this.preloadParsed(parsed, changedRoots, { skipAnki: Boolean(applyAnkiColors) });
            if (cursor < targets.length) await waitForVisibleScanTurn();
        }
    }

    private async applyTokens(targets: ScanTextTarget[], parsed: JPDBToken[][]): Promise<ParentNode[]> {
        const allChangedRoots = new Set<ParentNode>();
        for (let index = 0; index < targets.length; index += VISIBLE_SCAN_APPLY_BATCH_SIZE) {
            if (this.destroyed) return [...allChangedRoots];
            const start = index;
            const batch = targets.slice(start, start + VISIBLE_SCAN_APPLY_BATCH_SIZE);
            this.dependencies.pauseMutationObserver(() => {
                if (this.destroyed) return;
                const changedRoots = new Set<ParentNode>();
                batch.forEach((target, offset) => {
                    if (this.destroyed) return;
                    if (!isCurrentScanTarget(target)) return;
                    applyTokensToScanTarget(target, parsed[start + offset] ?? [], this.dependencies.getSettings());
                    changedRoots.add(target.parent);
                });
                changedRoots.forEach(root => allChangedRoots.add(root));
            });
            if (index + VISIBLE_SCAN_APPLY_BATCH_SIZE < targets.length) await waitForVisibleScanTurn();
        }
        // One contrast pass per unique root after all chunks — running it per
        // chunk forced repeated style recalcs on the same containers.
        allChangedRoots.forEach(root => this.dependencies.refreshWordContrast?.(root));
        return [...allChangedRoots];
    }

    private preloadParsed(parsed: JPDBToken[][], changedRoots: ParentNode[] = [], options: { skipAnki?: boolean } = {}): void {
        if (this.destroyed) return;
        const tokens = parsed.flat();
        this.dependencies.preloadParsedTokens(tokens);
        void this.dependencies.enrichPitchWords(tokens);
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
}

function waitForVisibleScanTurn(): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, 0));
}

function scanParseOptions(_settings: ReaderSettings, _targets: ScanTextTarget[] = []): VisibleScanParseOptions {
    return {
        jpdbTimeoutMs: VISIBLE_SCAN_PARSE_TIMEOUT_MS,
        allowJpdbTimeoutFallback: true,
        includeLocalPitch: false,
        allowSegmentedFallback: true,
    };
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
        if (batch.length && budget + length > VISIBLE_SCAN_PARSE_CHAR_BUDGET) break;
        batch.push(target);
        budget += length;
        cursor += 1;
    }
    return { batch, cursor };
}
