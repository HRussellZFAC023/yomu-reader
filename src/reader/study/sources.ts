import { STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID } from '../constants';
import { pruneOldestCacheEntries } from '../core/cache-utils';
import { escapeHtml, renderTokensToHtml, setInnerHtml } from '../dom';
import { uiText } from '../i18n';
import { Logger } from '../logger';
import { definitionSourceStateKey } from '../definition-source-render';
import { renderStudyMeaningBlock, renderStudySentenceBlock } from './section-render';
import {
    detectGrammarHints as detectLocalGrammarHints,
    preloadGrammarResources,
    preloadJapaneseSentenceTranslation,
    renderGrammarHints,
    translateJapaneseSentence,
    type GrammarHint,
} from './tools';
import type { JPDBToken, ReaderSettings } from '../types';

const log = Logger.scope('StudySources');
const STUDY_GRAMMAR_CACHE_LIMIT = 160;
const STUDY_TRANSLATION_CACHE_LIMIT = 80;

interface StudyTranslationResult {
    tokens: JPDBToken[];
    translated: string;
}

interface StudyParseOptions {
    jpdbTimeoutMs?: number;
    allowJpdbTimeoutFallback?: boolean;
}

export interface StudySourceControllerDependencies {
    getSettings: () => ReaderSettings;
    dictionarySourceAttributes: (sourceStateKey: string) => string;
    parseJapanese: (paragraphs: string[], options?: StudyParseOptions) => Promise<JPDBToken[][]>;
    parsePopoverJapanese: (popover: HTMLElement) => Promise<void> | void;
    enrichPitchWords: (tokens: JPDBToken[]) => Promise<void> | void;
    enrichAnkiWords: (tokens: JPDBToken[], roots?: ParentNode[]) => Promise<void> | void;
    isCurrentPopoverRoot: (root: HTMLElement) => boolean;
}

export class StudySourceController {
    private grammarHintCache = new Map<string, Promise<GrammarHint[]>>();
    private translationContentCache = new Map<string, Promise<StudyTranslationResult>>();

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
        this.preloadStudySources(sentence);
        this.installTranslationLoader(popover, sentence);
        this.installGrammarLoader(popover, sentence);
    }

    async detectGrammarHints(sentence: string): Promise<GrammarHint[]> {
        return detectLocalGrammarHints(sentence);
    }

    private preloadStudySources(sentence?: string): void {
        if (!sentence) return;
        const settings = this.settings();
        if (settings.studyGrammarEnabled) {
            void this.cachedGrammarHints(sentence);
            preloadGrammarResources(sentence, settings.interfaceLanguage);
        }
        if (settings.studyTranslationEnabled) {
            preloadJapaneseSentenceTranslation(sentence, settings.interfaceLanguage);
            void this.cachedTranslationContent(sentence);
        }
    }

    private renderTranslationPanel(sentence: string): string {
        const settings = this.settings();
        const language = settings.interfaceLanguage;
        return `
            <div class="jpdb-reader-study-panel jpdb-reader-study-translation-panel">
                ${renderStudySentenceBlock(sentence, language, { audioEnabled: settings.audioEnabled })}
                ${renderStudyMeaningBlock(uiText(language, 'openSectionToTranslate'), language, 'data-study-translation-result')}
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
            const hints = await this.cachedGrammarHints(sentence);
            if (!this.canRenderGrammar(popover, container)) return;
            if (!hints.length) {
                container.remove();
                return;
            }
            const settings = this.settings();
            setInnerHtml(panel, await renderGrammarHints(hints, sentence, undefined, settings.interfaceLanguage, { audioEnabled: settings.audioEnabled }));
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
            const translation = await this.cachedTranslationContent(sentence);
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
            this.dependencies.parseJapanese([sentence], { jpdbTimeoutMs: 1_200, allowJpdbTimeoutFallback: true }).then(([parsed]) => parsed ?? []),
            translateJapaneseSentence(sentence, this.settings().interfaceLanguage),
        ]);
        return { tokens, translated };
    }

    private cachedGrammarHints(sentence: string): Promise<GrammarHint[]> {
        const key = this.studyCacheKey(sentence);
        const cached = this.grammarHintCache.get(key);
        if (cached) return cached;
        const promise = Promise.resolve(detectLocalGrammarHints(sentence));
        this.grammarHintCache.set(key, promise);
        pruneOldestCacheEntries(this.grammarHintCache, STUDY_GRAMMAR_CACHE_LIMIT);
        return promise;
    }

    private cachedTranslationContent(sentence: string): Promise<StudyTranslationResult> {
        const key = this.studyCacheKey(sentence);
        const cached = this.translationContentCache.get(key);
        if (cached) return cached;
        const promise = this.loadTranslationContent(sentence).catch(error => {
            if (this.translationContentCache.get(key) === promise) this.translationContentCache.delete(key);
            throw error;
        });
        this.translationContentCache.set(key, promise);
        pruneOldestCacheEntries(this.translationContentCache, STUDY_TRANSLATION_CACHE_LIMIT);
        return promise;
    }

    private studyCacheKey(sentence: string): string {
        return `${this.settings().interfaceLanguage}\u0001${sentence.trim()}`;
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
        void this.dependencies.enrichPitchWords(translation.tokens);
        void this.dependencies.enrichAnkiWords(translation.tokens, [container]);
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
