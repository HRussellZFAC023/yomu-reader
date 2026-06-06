import { appendToDocumentHead } from '../dom';

const DICTIONARY_STYLE_ID = 'jpdb-reader-yomitan-dictionary-styles';

interface DictionaryStyleControllerOptions {
    loadCss: () => Promise<string>;
    onUnavailable?: (error: unknown) => void;
    onCleared?: () => void;
    onRefreshed?: (bytes: number) => void;
}

export class DictionaryStyleController {
    private styleElement?: HTMLStyleElement;

    constructor(private readonly options: DictionaryStyleControllerOptions) {}

    async refresh(): Promise<void> {
        this.apply(await this.loadCss());
    }

    remove(): void {
        this.styleElement?.remove();
        this.styleElement = undefined;
    }

    private async loadCss(): Promise<string> {
        try {
            return await this.options.loadCss();
        } catch (error) {
            this.options.onUnavailable?.(error);
            return '';
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
