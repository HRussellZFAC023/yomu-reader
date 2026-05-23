import { applyTokensToScanTarget, collectTextTargetsIn, type ScanTextTarget } from './dom';
import { uiText } from './i18n';
import { Logger } from './logger';
import { collectScanTargets } from './site-parsers';
import type { JPDBToken, ReaderSettings } from './types';

const log = Logger.scope('VisiblePageScanner');
const VISIBLE_SCAN_PARSE_BATCH_SIZE = 80;
const VISIBLE_SCAN_APPLY_BATCH_SIZE = 16;
const VISIBLE_SCAN_PARSE_TIMEOUT_MS = 1_200;

interface VisibleScanParseOptions {
    jpdbTimeoutMs?: number;
    includeLocalPitch?: boolean;
}

export interface VisiblePageScannerDependencies {
    getSettings: () => ReaderSettings;
    parseJapanese: (paragraphs: string[], options?: VisibleScanParseOptions) => Promise<JPDBToken[][]>;
    pauseMutationObserver: <T>(callback: () => T) => T;
    preloadParsedTokens: (tokens: JPDBToken[]) => void;
    preloadImmersionTokens: (tokens: JPDBToken[]) => void;
    enrichPitchWords: (tokens: JPDBToken[]) => Promise<void> | void;
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
            const parsed = await this.dependencies.parseJapanese(targets.map(target => target.text), scanParseOptions());
            await this.applyTokens(targets, parsed);
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

        await this.parseAndApplyTargets(targets);
    }

    private async parseAndApplyTargets(targets: ScanTextTarget[]): Promise<void> {
        for (let index = 0; index < targets.length; index += VISIBLE_SCAN_PARSE_BATCH_SIZE) {
            const batch = targets.slice(index, index + VISIBLE_SCAN_PARSE_BATCH_SIZE);
            const parsed = await this.dependencies.parseJapanese(batch.map(target => target.text), scanParseOptions());
            await this.applyTokens(batch, parsed);
            this.preloadParsed(parsed);
            if (index + VISIBLE_SCAN_PARSE_BATCH_SIZE < targets.length) await waitForVisibleScanTurn();
        }
    }

    private async applyTokens(targets: ScanTextTarget[], parsed: JPDBToken[][]): Promise<void> {
        for (let index = 0; index < targets.length; index += VISIBLE_SCAN_APPLY_BATCH_SIZE) {
            const start = index;
            const batch = targets.slice(start, start + VISIBLE_SCAN_APPLY_BATCH_SIZE);
            this.dependencies.pauseMutationObserver(() => {
                batch.forEach((target, offset) => applyTokensToScanTarget(target, parsed[start + offset] ?? [], this.dependencies.getSettings()));
            });
            if (index + VISIBLE_SCAN_APPLY_BATCH_SIZE < targets.length) await waitForVisibleScanTurn();
        }
    }

    private preloadParsed(parsed: JPDBToken[][]): void {
        const tokens = parsed.flat();
        this.dependencies.preloadParsedTokens(tokens);
        this.dependencies.preloadImmersionTokens(tokens);
        void this.dependencies.enrichPitchWords(tokens);
        void this.dependencies.enrichAnkiWords(tokens);
    }

    private handleEmptyVisiblePageScan(silent: boolean): void {
        if (!silent) this.dependencies.toast(uiText(this.dependencies.getSettings().interfaceLanguage, 'noUnscannedJapaneseText'));
    }

    private handleVisiblePageScanError(error: unknown, silent: boolean): void {
        log.warn('Visible page scan failed', error);
        if (!silent) this.dependencies.toast(error instanceof Error ? error.message : uiText(this.dependencies.getSettings().interfaceLanguage, 'jpdbScanFailed'));
    }

    private finishScan(): void {
        this.scanInFlight = false;
    }
}

function waitForVisibleScanTurn(): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, 0));
}

function scanParseOptions(): VisibleScanParseOptions {
    return {
        jpdbTimeoutMs: VISIBLE_SCAN_PARSE_TIMEOUT_MS,
        includeLocalPitch: false,
    };
}
