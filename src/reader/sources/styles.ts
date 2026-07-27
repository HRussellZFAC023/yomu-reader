import { appendToDocumentHead } from '../dom';

const DICTIONARY_STYLE_ID = 'jpdb-reader-yomitan-dictionary-styles';

interface DictionaryStyleControllerOptions {
    loadCss: () => Promise<string>;
    onUnavailable?: (error: unknown) => void;
    onCleared?: () => void;
    onRefreshed?: (bytes: number) => void;
}

type DictionaryStyleLoadResult =
    | { css: string; error?: never }
    | { css: ''; error: unknown };

export class DictionaryStyleController {
    private styleElement?: HTMLStyleElement;
    private refreshGeneration = 0;

    constructor(private readonly options: DictionaryStyleControllerOptions) {}

    async refresh(): Promise<void> {
        const generation = ++this.refreshGeneration;
        const result = await this.loadCss();
        if (generation !== this.refreshGeneration) return;
        if ('error' in result) this.options.onUnavailable?.(result.error);
        this.apply(result.css);
    }

    remove(): void {
        this.refreshGeneration += 1;
        this.styleElement?.remove();
        this.styleElement = undefined;
    }

    private async loadCss(): Promise<DictionaryStyleLoadResult> {
        try {
            return { css: await this.options.loadCss() };
        } catch (error) {
            return { css: '', error };
        }
    }

    private apply(css: string): void {
        const existing = this.styleElement ?? document.getElementById(DICTIONARY_STYLE_ID) as HTMLStyleElement | null;
        if (!css.trim()) {
            existing?.remove();
            this.styleElement = undefined;
            this.options.onCleared?.();
            return;
        }
        const style = existing ?? document.createElement('style');
        style.id = DICTIONARY_STYLE_ID;
        style.textContent = css;
        if (!style.isConnected) appendToDocumentHead(style);
        this.styleElement = style;
        this.options.onRefreshed?.(css.length);
    }
}
