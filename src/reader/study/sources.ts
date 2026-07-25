import { STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID } from '../app/constants';
import { pruneOldestCacheEntries } from '../core/cache-utils';
import { escapeHtml, renderTokensToHtml, setInnerHtml } from '../dom';
import { uiText } from '../app/i18n';
import { Logger } from '../app/logger';
import { definitionSourceStateKey } from '../sources/definition-render';
import { definitionSourceLabel } from '../sources/sections';
import { renderStudyMeaningBlock, renderStudySentenceBlock } from './section-render';
import {
    detectGrammarHints as detectLocalGrammarHints,
    preloadGrammarResources,
    preloadJapaneseSentenceTranslation,
    renderGrammarHints,
    translateJapaneseSentence,
    type GrammarHint,
} from './tools';
import type { JPDBToken, ReaderSettings } from '../app/types';
import { resolvedLearnerLanguage } from '../languages';

const log = Logger.scope('StudySources');
const STUDY_GRAMMAR_CACHE_LIMIT = 160;
const STUDY_TRANSLATION_CACHE_LIMIT = 80;

interface StudyTranslationResult {
    // A promise, not a value: the MEANING must resolve on the translation
    // alone. Parsing only enriches the original line with ruby, and it can
    // stall (iPad WebKit IndexedDB), so it is applied opportunistically and
    // never gates the translation.
    tokens: Promise<JPDBToken[]>;
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
        const title = definitionSourceLabel(settings, STUDY_TRANSLATION_SOURCE_ID, uiText(settings.interfaceLanguage, 'translation'));
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-study-source" data-study-translation ${this.sourceAttributes(STUDY_TRANSLATION_SOURCE_ID)}>
                <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
                ${this.renderTranslationPanel(sentence)}
            </details>
        `;
    }

    renderGrammarSource(sentence?: string): string {
        const settings = this.settings();
        if (!sentence || !settings.studyGrammarEnabled) return '';
        const title = definitionSourceLabel(settings, STUDY_GRAMMAR_SOURCE_ID, uiText(settings.interfaceLanguage, 'grammar'));
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-study-source" data-study-grammar ${this.sourceAttributes(STUDY_GRAMMAR_SOURCE_ID)}>
                <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
                ${this.renderGrammarPanel()}
            </details>
        `;
    }

    installLoaders(popover: HTMLElement, sentence?: string): void {
        this.preloadStudySources(popover, sentence);
        this.installTranslationLoader(popover, sentence);
        this.installGrammarLoader(popover, sentence);
    }

    async detectGrammarHints(sentence: string): Promise<GrammarHint[]> {
        return detectLocalGrammarHints(sentence);
    }

    private preloadStudySources(popover: HTMLElement, sentence?: string): void {
        if (!sentence) return;
        const settings = this.settings();
        const grammar = popover.querySelector<HTMLElement>('[data-study-grammar]');
        if (settings.studyGrammarEnabled && grammar) {
            // The open-gated lazy loader only removes an empty grammar section
            // once the user expands it; resolve the (cached, local) hints
            // eagerly so a no-hint section never shows its header at all.
            void this.cachedGrammarHints(sentence).then(hints => {
                if (!hints.length && grammar.isConnected && this.dependencies.isCurrentPopoverRoot(popover)) grammar.remove();
            }).catch(() => undefined);
            preloadGrammarResources(sentence, settings.interfaceLanguage);
        }
        const translation = popover.querySelector<HTMLElement>('[data-study-translation]');
        if (settings.studyTranslationEnabled && translation) {
            preloadJapaneseSentenceTranslation(sentence, resolvedLearnerLanguage(settings));
            // Same async-empty rule as grammar: an untranslatable sentence
            // hides the whole section instead of leaving a header shell.
            void this.cachedTranslationContent(sentence).then(result => {
                if (!result.translated && translation.isConnected && this.dependencies.isCurrentPopoverRoot(popover)) translation.hidden = true;
            }).catch(() => undefined);
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
        this.installLazyStudyLoader(popover, sentence, '[data-study-grammar]', container => this.loadGrammar(popover, sentence!, container));
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
        this.installLazyStudyLoader(popover, sentence, '[data-study-translation]', container => {
            const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
            if (result) result.textContent = uiText(this.settings().interfaceLanguage, 'translating');
            return this.loadTranslation(popover, sentence, container);
        });
    }

    private installLazyStudyLoader(
        popover: HTMLElement,
        sentence: string | undefined,
        selector: string,
        loadContainer: (container: HTMLDetailsElement) => Promise<void>,
    ): void {
        const containers = Array.from(popover.querySelectorAll<HTMLDetailsElement>(selector));
        if (!containers.length || !sentence) return;
        for (const container of containers) {
            const load = () => {
                if (!isStudyDetailsOpen(container) || container.dataset.loaded === 'true' || container.dataset.loading === 'true') return;
                container.dataset.loading = 'true';
                void loadContainer(container).finally(() => {
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
        // Resolve on the (always-bounded) translation alone. The old
        // Promise.all also awaited parseJapanese; when that stalled — an iPad
        // WebKit IndexedDB failure mode — the MEANING was stranded on
        // "Translating..." forever and the empty-translation hide never ran.
        // Parse now runs only when there is a translation to enrich, and its
        // tokens are handed back as a promise applied without blocking.
        const translated = await translateJapaneseSentence(sentence, resolvedLearnerLanguage(this.settings()));
        const tokens = translated ? this.parseTranslationTokens(sentence) : Promise.resolve<JPDBToken[]>([]);
        return { tokens, translated };
    }

    private parseTranslationTokens(sentence: string): Promise<JPDBToken[]> {
        return this.dependencies
            .parseJapanese([sentence], { jpdbTimeoutMs: 1_200, allowJpdbTimeoutFallback: true })
            .then(([parsed]) => parsed ?? [])
            .catch(() => []);
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
        return `${this.settings().interfaceLanguage}\u0001${resolvedLearnerLanguage(this.settings())}\u0001${sentence.trim()}`;
    }

    private applyTranslation(
        popover: HTMLElement,
        sentence: string,
        container: HTMLElement,
        translation: StudyTranslationResult,
    ): void {
        if (!translation.translated) {
            // Not a translatable Japanese sentence (OCR/page noise) — showing
            // the raw text plus an empty result reads as a broken translation.
            container.hidden = true;
            return;
        }
        const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
        if (result) result.textContent = translation.translated;
        // Upgrade the original line to ruby and annotate the popover once tokens
        // land; never block the MEANING on it, so a stalled parse can't strand
        // the card. Parse is bounded upstream, so tokens always resolves — this
        // runs the same work the old synchronous path did, just deferred.
        void translation.tokens.then(tokens => {
            if (!this.canApplyTranslation(popover, container)) return;
            const original = container.querySelector<HTMLElement>('[data-study-original-render]');
            if (original) setInnerHtml(original, renderTokensToHtml(sentence, tokens, this.settings()));
            void this.dependencies.parsePopoverJapanese(popover);
            void this.dependencies.enrichPitchWords(tokens);
            void this.dependencies.enrichAnkiWords(tokens, [container]);
        }).catch(() => undefined);
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
