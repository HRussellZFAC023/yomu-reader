import { STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID } from './constants';
import { escapeHtml, renderTokensToHtml, setInnerHtml } from './dom';
import { uiText } from './i18n';
import { Logger } from './logger';
import { speakerIcon } from './popup-render';
import { definitionSourceStateKey } from './definition-source-render';
import { detectGrammarHints as detectLocalGrammarHints, renderGrammarHints, translateJapaneseSentence, type GrammarHint } from './study-tools';
import type { JPDBToken, ReaderSettings } from './types';

const log = Logger.scope('StudySources');

interface StudyTranslationResult {
    tokens: JPDBToken[];
    translated: string;
}

export interface StudySourceControllerDependencies {
    getSettings: () => ReaderSettings;
    dictionarySourceAttributes: (sourceStateKey: string) => string;
    parseJapanese: (paragraphs: string[]) => Promise<JPDBToken[][]>;
    parsePopoverJapanese: (popover: HTMLElement) => Promise<void> | void;
    enrichAnkiWords: (tokens: JPDBToken[]) => Promise<void> | void;
    isCurrentPopoverRoot: (root: HTMLElement) => boolean;
}

export class StudySourceController {
    constructor(private readonly dependencies: StudySourceControllerDependencies) {}

    renderTranslationSource(sentence?: string): string {
        const settings = this.settings();
        if (!sentence || !settings.studyTranslationEnabled) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-study-source" data-study-translation ${this.sourceAttributes(STUDY_TRANSLATION_SOURCE_ID)}>
                <summary class="jpdb-reader-local-title">${escapeHtml(uiText(settings.interfaceLanguage, 'translation'))}</summary>
                ${this.renderTranslationPanel(sentence)}
            </details>
        `;
    }

    renderGrammarSource(sentence?: string): string {
        const settings = this.settings();
        if (!sentence || !settings.studyGrammarEnabled) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-study-source" data-study-grammar ${this.sourceAttributes(STUDY_GRAMMAR_SOURCE_ID)}>
                <summary class="jpdb-reader-local-title">${escapeHtml(uiText(settings.interfaceLanguage, 'grammar'))}</summary>
                ${this.renderGrammarPanel()}
            </details>
        `;
    }

    installLoaders(popover: HTMLElement, sentence?: string): void {
        this.installTranslationLoader(popover, sentence);
        this.installGrammarLoader(popover, sentence);
    }

    async detectGrammarHints(sentence: string): Promise<GrammarHint[]> {
        return detectLocalGrammarHints(sentence);
    }

    private renderTranslationPanel(sentence: string): string {
        const language = this.settings().interfaceLanguage;
        const readSentence = uiText(language, 'readSentenceAloud');
        return `
            <div class="jpdb-reader-study-panel jpdb-reader-study-translation-panel">
                <div class="jpdb-reader-study-block jpdb-reader-study-sentence-block">
                    <div class="jpdb-reader-study-label-row">
                        <div class="jpdb-reader-study-label">${escapeHtml(uiText(language, 'japaneseLabel'))}</div>
                        <button class="jpdb-reader-icon-mini" data-action="study-read-sentence" type="button" title="${escapeHtml(readSentence)}" aria-label="${escapeHtml(readSentence)}">${speakerIcon()}</button>
                    </div>
                    <div class="jpdb-reader-study-original jpdb-reader-parseable" data-study-original-render>${escapeHtml(sentence)}</div>
                </div>
                <div class="jpdb-reader-study-block jpdb-reader-study-meaning-block">
                    <div class="jpdb-reader-study-label">${escapeHtml(uiText(language, 'meaning'))}</div>
                    <div class="jpdb-reader-study-translation" data-study-translation-result>${escapeHtml(uiText(language, 'openSectionToTranslate'))}</div>
                </div>
            </div>
        `;
    }

    private renderGrammarPanel(): string {
        const language = this.settings().interfaceLanguage;
        return `
            <div class="jpdb-reader-study-panel" data-study-grammar-panel>
                <div class="jpdb-reader-help">${escapeHtml(uiText(language, 'findingGrammar'))}</div>
            </div>
        `;
    }

    private installGrammarLoader(popover: HTMLElement, sentence?: string): void {
        const containers = Array.from(popover.querySelectorAll<HTMLDetailsElement>('[data-study-grammar]'));
        if (!containers.length || !sentence) return;
        for (const container of containers) {
            const load = () => {
                if (!isStudyDetailsOpen(container) || container.dataset.loaded === 'true' || container.dataset.loading === 'true') return;
                container.dataset.loading = 'true';
                void this.loadGrammar(popover, sentence, container).finally(() => {
                    if (!container.isConnected) return;
                    delete container.dataset.loading;
                    container.dataset.loaded = 'true';
                });
            };
            container.addEventListener('toggle', load);
            container.parentElement?.closest('details')?.addEventListener('toggle', load);
            load();
        }
    }

    private async loadGrammar(popover: HTMLElement, sentence: string, container: HTMLElement): Promise<void> {
        const panel = container.querySelector<HTMLElement>('[data-study-grammar-panel]');
        if (!panel) return;
        try {
            const hints = await this.detectGrammarHints(sentence);
            if (!this.canRenderGrammar(popover, container)) return;
            if (!hints.length) {
                container.remove();
                return;
            }
            setInnerHtml(panel, await renderGrammarHints(hints, sentence, undefined, this.settings().interfaceLanguage));
            delete popover.dataset.jpdbReaderParseKey;
            delete popover.dataset.jpdbReaderParseLoadingKey;
            void this.dependencies.parsePopoverJapanese(popover);
        } catch (error) {
            log.warn('Automatic grammar lookup failed', { sentenceLength: sentence.length }, error);
        }
    }

    private canRenderGrammar(popover: HTMLElement, container: HTMLElement): boolean {
        return this.dependencies.isCurrentPopoverRoot(popover) && container.isConnected;
    }

    private installTranslationLoader(popover: HTMLElement, sentence?: string): void {
        const containers = Array.from(popover.querySelectorAll<HTMLDetailsElement>('[data-study-translation]'));
        if (!containers.length || !sentence) return;
        for (const container of containers) {
            const load = () => {
                if (!isStudyDetailsOpen(container) || container.dataset.loaded === 'true' || container.dataset.loading === 'true') return;
                container.dataset.loading = 'true';
                const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
                if (result) result.textContent = uiText(this.settings().interfaceLanguage, 'translating');
                void this.loadTranslation(popover, sentence, container).finally(() => {
                    if (!container.isConnected) return;
                    delete container.dataset.loading;
                    container.dataset.loaded = 'true';
                });
            };
            container.addEventListener('toggle', load);
            container.parentElement?.closest('details')?.addEventListener('toggle', load);
            load();
        }
    }

    private async loadTranslation(popover: HTMLElement, sentence: string | undefined, container: HTMLElement): Promise<void> {
        if (!sentence) return;
        try {
            const translation = await this.loadTranslationContent(sentence);
            if (!this.canApplyTranslation(popover, container)) return;
            this.applyTranslation(popover, sentence, container, translation);
        } catch (error) {
            this.renderTranslationError(sentence, container, error);
        }
    }

    private canApplyTranslation(popover: HTMLElement, container: HTMLElement): boolean {
        return this.dependencies.isCurrentPopoverRoot(popover) && container.isConnected;
    }

    private async loadTranslationContent(sentence: string): Promise<StudyTranslationResult> {
        const [tokens, translated] = await Promise.all([
            this.dependencies.parseJapanese([sentence]).then(([parsed]) => parsed ?? []),
            translateJapaneseSentence(sentence, this.settings().interfaceLanguage),
        ]);
        return { tokens, translated };
    }

    private applyTranslation(
        popover: HTMLElement,
        sentence: string,
        container: HTMLElement,
        translation: StudyTranslationResult,
    ): void {
        const original = container.querySelector<HTMLElement>('[data-study-original-render]');
        if (original) setInnerHtml(original, renderTokensToHtml(sentence, translation.tokens, this.settings()));
        const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
        if (result) result.textContent = translation.translated;
        void this.dependencies.parsePopoverJapanese(popover);
        void this.dependencies.enrichAnkiWords(translation.tokens);
    }

    private renderTranslationError(sentence: string, container: HTMLElement, error: unknown): void {
        log.warn('Automatic sentence translation failed', { sentenceLength: sentence.length }, error);
        if (!container.isConnected) return;
        const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
        if (result) result.textContent = uiText(this.settings().interfaceLanguage, 'translationUnavailable');
    }

    private sourceAttributes(sourceId: string): string {
        return this.dependencies.dictionarySourceAttributes(definitionSourceStateKey(sourceId));
    }

    private settings(): ReaderSettings {
        return this.dependencies.getSettings();
    }
}

function isStudyDetailsOpen(container: HTMLDetailsElement): boolean {
    if (!container.open) return false;
    let ancestor = container.parentElement?.closest<HTMLDetailsElement>('details');
    while (ancestor) {
        if (!ancestor.open) return false;
        ancestor = ancestor.parentElement?.closest<HTMLDetailsElement>('details');
    }
    return true;
}
