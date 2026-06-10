import { applyTokensToScanTarget, collectTextTargetsIn, isCurrentScanTarget, type ScanTextTarget } from '../dom/index';
import { formatUiText, uiText } from './i18n';
import { Logger } from './logger';
import { collectScanTargets } from './site-parsers';
import { shouldLookupAnkiStatus } from '../settings/index';
import type { JPDBToken, ReaderSettings } from './types';

const log = Logger.scope('VisiblePageScanner');
const VISIBLE_SCAN_PARSE_BATCH_SIZE = 80;
// Large enough that the first apply paints everything just parsed in one go —
// small chunks made ruby/colors arrive in visible waves.
const VISIBLE_SCAN_APPLY_BATCH_SIZE = 48;
const VISIBLE_SCAN_PARSE_TIMEOUT_MS = 450;
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
    prepareSubtitleTokensBeforeRender?: (tokens: JPDBToken[]) => Promise<void> | void;
    refreshWordContrast?: (root: ParentNode) => void;
    toast: (message: string) => void;
}

export class VisiblePageScanner {
    private scanInFlight = false;
    private scanPending = false;
    private scanPendingSilent = true;
    private destroyed = false;

    constructor(private readonly dependencies: VisiblePageScannerDependencies) {}

    destroy(): void {
        this.destroyed = true;
        this.scanPending = false;
    }

    async scanVisiblePage(options: { silent?: boolean } = {}): Promise<void> {
        const silent = Boolean(options.silent);
        if (!this.beginScan(silent)) return;
        const done = log.time('scanVisiblePage', { silent });
        try {
            await this.runVisiblePageScan(silent);
        } catch (error) {
            this.handleVisiblePageScanError(error, silent);
        } finally {
            this.finishScan();
            done();
        }
    }

    async scanAsbPlayerSubtitles(): Promise<void> {
        if (this.destroyed) return;
        const roots = Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-offscreen, .asbplayer-subtitles-container-bottom'));
        if (!roots.length) return;

        const targets = roots.flatMap(root => collectTextTargetsIn(root, 12, false)).slice(0, 12);
        if (!targets.length) return;

        try {
            const parsed = await this.dependencies.parseJapanese(targets.map(target => target.text), scanParseOptions(this.dependencies.getSettings()));
            if (this.destroyed) return;
            const tokens = parsed.flat();
            if (this.dependencies.prepareSubtitleTokensBeforeRender) {
                this.dependencies.preloadParsedTokens(tokens);
                await this.dependencies.prepareSubtitleTokensBeforeRender(tokens);
                if (this.destroyed) return;
            }
            const changedRoots = await this.applyTokens(targets, parsed);
            if (this.dependencies.prepareSubtitleTokensBeforeRender) {
                if (this.shouldEnrichAnkiWords()) await this.dependencies.enrichAnkiWords(tokens, changedRoots);
            } else {
                this.preloadParsed(parsed, changedRoots);
            }
        } catch {
            // External subtitle overlays update frequently; the regular popup path still reports API errors.
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

    private async runVisiblePageScan(silent: boolean): Promise<void> {
        if (this.destroyed) return;
        const targets = collectScanTargets();
        if (!targets.length) {
            this.handleEmptyVisiblePageScan(silent);
            return;
        }

        await this.parseAndApplyTargets(targets);
        this.reportVisiblePageCoverage(silent);
    }

    private async parseAndApplyTargets(targets: ScanTextTarget[]): Promise<void> {
        for (let index = 0; index < targets.length; index += VISIBLE_SCAN_PARSE_BATCH_SIZE) {
            if (this.destroyed) return;
            const batch = targets.slice(index, index + VISIBLE_SCAN_PARSE_BATCH_SIZE);
            const parsed = await this.dependencies.parseJapanese(batch.map(target => target.text), scanParseOptions(this.dependencies.getSettings(), batch));
            if (this.destroyed) return;
            const changedRoots = await this.applyTokens(batch, parsed);
            this.preloadParsed(parsed, changedRoots);
            if (index + VISIBLE_SCAN_PARSE_BATCH_SIZE < targets.length) await waitForVisibleScanTurn();
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

    private preloadParsed(parsed: JPDBToken[][], changedRoots: ParentNode[] = []): void {
        if (this.destroyed) return;
        const tokens = parsed.flat();
        this.dependencies.preloadParsedTokens(tokens);
        void this.dependencies.enrichPitchWords(tokens);
        if (this.shouldEnrichAnkiWords()) void this.dependencies.enrichAnkiWords(tokens, changedRoots);
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
