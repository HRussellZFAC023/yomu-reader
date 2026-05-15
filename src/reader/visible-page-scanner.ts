import { applyTokensToScanTarget, collectTextTargetsIn, type ScanTextTarget } from './dom';
import { Logger } from './logger';
import { collectScanTargets } from './site-parsers';
import type { JPDBToken, ReaderSettings } from './types';

const log = Logger.scope('VisiblePageScanner');

export interface VisiblePageScannerDependencies {
    getSettings: () => ReaderSettings;
    parseJapanese: (paragraphs: string[]) => Promise<JPDBToken[][]>;
    pauseMutationObserver: <T>(callback: () => T) => T;
    preloadParsedTokens: (tokens: JPDBToken[]) => void;
    preloadImmersionTokens: (tokens: JPDBToken[]) => void;
    enrichAnkiWords: (tokens: JPDBToken[]) => Promise<void> | void;
    toast: (message: string) => void;
}

export class VisiblePageScanner {
    private scanInFlight = false;

    constructor(private readonly dependencies: VisiblePageScannerDependencies) {}

    async scanVisiblePage(options: { silent?: boolean } = {}): Promise<void> {
        const silent = Boolean(options.silent);
        if (!this.beginScan()) return;
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
        const roots = Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-offscreen, .asbplayer-subtitles-container-bottom'));
        if (!roots.length) return;

        const targets = roots.flatMap(root => collectTextTargetsIn(root, 12, false)).slice(0, 12);
        if (!targets.length) return;

        try {
            const parsed = await this.dependencies.parseJapanese(targets.map(target => target.text));
            this.applyTokens(targets, parsed);
            this.preloadParsed(parsed);
        } catch {
            // External subtitle overlays update frequently; the regular popup path still reports API errors.
        }
    }

    private beginScan(): boolean {
        if (this.scanInFlight) return false;
        this.scanInFlight = true;
        return true;
    }

    private async runVisiblePageScan(silent: boolean): Promise<void> {
        const targets = collectScanTargets();
        if (!targets.length) {
            this.handleEmptyVisiblePageScan(silent);
            return;
        }

        const parsed = await this.dependencies.parseJapanese(targets.map(target => target.text));
        this.applyTokens(targets, parsed);
        this.preloadParsed(parsed);
    }

    private applyTokens(targets: ScanTextTarget[], parsed: JPDBToken[][]): void {
        this.dependencies.pauseMutationObserver(() => {
            targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], this.dependencies.getSettings()));
        });
    }

    private preloadParsed(parsed: JPDBToken[][]): void {
        const tokens = parsed.flat();
        this.dependencies.preloadParsedTokens(tokens);
        this.dependencies.preloadImmersionTokens(tokens);
        void this.dependencies.enrichAnkiWords(tokens);
    }

    private handleEmptyVisiblePageScan(silent: boolean): void {
        if (!silent) this.dependencies.toast('No unscanned Japanese text found.');
    }

    private handleVisiblePageScanError(error: unknown, silent: boolean): void {
        log.warn('Visible page scan failed', error);
        if (!silent) this.dependencies.toast(error instanceof Error ? error.message : 'JPDB scan failed.');
    }

    private finishScan(): void {
        this.scanInFlight = false;
    }
}
