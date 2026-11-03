import { uiText } from '../app/i18n';
import type { ReaderSettings } from '../app/types';
import { activeLanguageProfile } from '../languages/profiles';
import { slice1LanguageIdForTag } from '../languages/roster';
import { resolveLearnerLanguage } from '../locales';
import { translateText } from '../translation/google';
import { translationOutputLanguage } from '../translation/languages';
import { subscribeToSettingsChanges } from '../settings/settings-change-bus';
import { readDefinitionTranslation } from './definition-translation-markup';

const SELECTOR = '[data-definition-translation-text]';
const TEXT_LIMIT = 1800;

interface TranslationState {
    key: string;
    controller: AbortController;
    display: { kind: 'original' } | { kind: 'translated'; translation: HTMLElement; original: HTMLDetailsElement };
}
const states = new WeakMap<HTMLElement, TranslationState>();

export interface DefinitionTranslationOptions {
    getSettings?: () => ReaderSettings;
    isCurrentRoot?: () => boolean;
    signal?: AbortSignal;
}

/** Only explicitly marked dictionary text is eligible; generated output is never scanned. */
export async function installDefinitionTranslationBehaviors(
    root: ParentNode,
    settings: ReaderSettings,
    options: DefinitionTranslationOptions = {},
): Promise<void> {
    const currentSettings = options.getSettings ?? (() => settings);
    const key = profileKey(settings);
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    const enabled = new Set(profile?.definitionTranslationProviderIds ?? []);
    const outputLanguage = translationOutputLanguage(settings);
    const elements = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR));
    await Promise.all(elements.map(async element => {
        const source = prepareDefinitionTranslation(element, { enabled, outputLanguage, key });
        if (!source) return;
        const { sourceId, sourceLanguage } = source;
        const text = source.payload.trim();
        if (!text) return;
        const state: TranslationState = { key, controller: new AbortController(), display: { kind: 'original' } };
        states.set(element, state);
        element.dataset.definitionTranslationState = 'loading';
        const isCurrent = () => element.isConnected && root.contains(element)
            && source.isCurrent() && profileKey(currentSettings()) === key && (options.isCurrentRoot?.() ?? true);
        const cancelStale = () => { if (!isCurrent()) state.controller.abort(); };
        const observer = new MutationObserver(cancelStale);
        observer.observe(element.ownerDocument, { childList: true, subtree: true });
        const unsubscribe = subscribeToSettingsChanges(() => queueMicrotask(cancelStale));
        const abort = () => state.controller.abort();
        options.signal?.addEventListener('abort', abort, { once: true });
        if (options.signal?.aborted || !isCurrent()) state.controller.abort();
        try {
            const translated: string[] = [];
            for (const chunk of splitTranslationText(text)) {
                translated.push(await translateText(chunk, { sourceLanguage, outputLanguage, signal: state.controller.signal }));
            }
            if (!isCurrent() || state.controller.signal.aborted) return;
            renderTranslatedDefinition(element, state, sourceId, outputLanguage, translated.join('\n\n'), settings);
            element.dataset.definitionTranslationState = 'ready';
        } catch {
            if (states.get(element) === state) element.dataset.definitionTranslationState = 'error';
        } finally {
            observer.disconnect();
            unsubscribe();
            options.signal?.removeEventListener('abort', abort);
            if (state.controller.signal.aborted && states.get(element) === state) {
                states.delete(element);
                delete element.dataset.definitionTranslationState;
            }
        }
    }));
}

function prepareDefinitionTranslation(element: HTMLElement, selection: { enabled: ReadonlySet<string>; outputLanguage: string; key: string }): ReturnType<typeof readDefinitionTranslation> {
    const previous = states.get(element);
    const source = readDefinitionTranslation(element);
    if (!source?.isCurrent()) {
        if (previous) restoreOriginal(element, previous);
        return;
    }
    if (previous?.key === selection.key) return;
    if (previous) restoreOriginal(element, previous);
    if (!selection.enabled.has(source.sourceId) || sameLanguage(source.sourceLanguage, selection.outputLanguage)) return;
    return source;
}

function profileKey(settings: ReaderSettings): string {
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    return JSON.stringify([profile?.id, translationOutputLanguage(settings), settings.interfaceLanguage, profile?.definitionTranslationProviderIds]);
}

function restoreOriginal(element: HTMLElement, state: TranslationState): void {
    state.controller.abort();
    if (state.display.kind === 'translated') {
        state.display.translation.remove();
        if (state.display.original.parentNode) state.display.original.replaceWith(element);
    }
    states.delete(element);
    delete element.dataset.definitionTranslationState;
}

function renderTranslatedDefinition(element: HTMLElement, state: TranslationState, sourceId: string, outputLanguage: string, translated: string, settings: ReaderSettings): void {
    const document = element.ownerDocument;
    const translation = document.createElement('div');
    translation.className = 'jpdb-reader-definition-translation';
    translation.dataset.definitionTranslation = sourceId;
    const provenance = document.createElement('small');
    provenance.className = 'jpdb-reader-definition-translation-credit';
    provenance.textContent = uiText(settings.interfaceLanguage, 'definitionTranslationCredit');
    const text = document.createElement('div');
    text.lang = outputLanguage;
    text.dir = resolveLearnerLanguage(outputLanguage).direction;
    text.style.whiteSpace = 'pre-line';
    text.textContent = translated;
    translation.append(provenance, text);
    const original = document.createElement('details');
    original.className = 'jpdb-reader-definition-original';
    const summary = document.createElement('summary');
    summary.textContent = uiText(settings.interfaceLanguage, 'definitionTranslationOriginal');
    element.before(translation, original);
    original.append(summary, element);
    state.display = { kind: 'translated', translation, original };
}

function sameLanguage(source: string, output: string): boolean {
    if (source === 'auto') return false;
    return (slice1LanguageIdForTag(source) ?? source.split('-')[0]?.toLowerCase())
        === (slice1LanguageIdForTag(output) ?? output.split('-')[0]?.toLowerCase());
}

function splitTranslationText(text: string): string[] {
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > TEXT_LIMIT) {
        const candidate = remaining.slice(0, TEXT_LIMIT);
        const boundary = Math.max(candidate.lastIndexOf('\n'), candidate.lastIndexOf('。'), candidate.lastIndexOf('. '));
        const end = boundary >= TEXT_LIMIT / 2 ? boundary + 1 : TEXT_LIMIT;
        chunks.push(remaining.slice(0, end).trim());
        remaining = remaining.slice(end).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
}
