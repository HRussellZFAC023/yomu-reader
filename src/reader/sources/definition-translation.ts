import { uiText } from '../app/i18n';
import type { ReaderSettings } from '../app/types';
import { activeLanguageProfile } from '../languages/profiles';
import { slice1LanguageIdForTag } from '../languages/roster';
import { resolveLearnerLanguage } from '../locales';
import { translateText } from '../translation/google';
import { translationOutputLanguage } from '../translation/languages';
import { subscribeToSettingsChanges } from '../settings/settings-change-bus';
import { readDefinitionTranslation } from './definition-translation-markup';
import { isDirectTrustedReaderInteraction } from '../ui/trusted-interaction';

const SELECTOR = '[data-definition-translation-text]';
const TEXT_LIMIT = 1800;
const FAILURE_RETRY_DELAY_MS = 30_000;

interface TranslationState {
    key: string;
    controller: AbortController;
    display: { kind: 'original' }
        | { kind: 'failed'; retryAt: number; notice: HTMLElement }
        | { kind: 'translated'; translation: HTMLElement; original: HTMLDetailsElement };
}
const states = new WeakMap<HTMLElement, TranslationState>();

export interface DefinitionTranslationOptions {
    getSettings?: () => ReaderSettings;
    isCurrentRoot?: () => boolean;
    signal?: AbortSignal;
}

/** Only explicitly marked dictionary text is eligible; generated output is never scanned. */
export function installDefinitionTranslationBehaviors(
    root: ParentNode,
    settings: ReaderSettings,
    options: DefinitionTranslationOptions = {},
): Promise<void> {
    return installDefinitionTranslations(root, settings, options, Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)));
}

async function installDefinitionTranslations(root: ParentNode, settings: ReaderSettings, options: DefinitionTranslationOptions, elements: HTMLElement[]): Promise<void> {
    const currentSettings = options.getSettings ?? (() => settings);
    const key = profileKey(settings);
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    const enabled = new Set(profile?.definitionTranslationProviderIds ?? []);
    const outputLanguage = translationOutputLanguage(settings);
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
            showDefinitionFailure({ element, state, language: settings.interfaceLanguage, isCurrent,
                retry: () => installDefinitionTranslations(root, currentSettings(), options, [element]) });
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

function showDefinitionFailure(context: {
    element: HTMLElement;
    state: TranslationState;
    language: ReaderSettings['interfaceLanguage'];
    isCurrent: () => boolean;
    retry: () => Promise<void>;
}): void {
    const { element, state, language, isCurrent, retry } = context;
    if (states.get(element) !== state) return;
    element.dataset.definitionTranslationState = 'error';
    if (state.controller.signal.aborted || !isCurrent()) return;
    const notice = renderDefinitionFailure(element, language, () => {
        if (states.get(element) !== state || !isCurrent()) return;
        restoreOriginal(element, state);
        void retry();
    });
    state.display = { kind: 'failed', retryAt: Date.now() + FAILURE_RETRY_DELAY_MS, notice };
}

function prepareDefinitionTranslation(element: HTMLElement, selection: { enabled: ReadonlySet<string>; outputLanguage: string; key: string }): ReturnType<typeof readDefinitionTranslation> {
    const previous = states.get(element);
    const source = readDefinitionTranslation(element);
    if (!source?.isCurrent()) {
        if (previous) restoreOriginal(element, previous);
        return;
    }
    if (previous?.key === selection.key && !readyToRetry(previous)) return;
    if (previous) restoreOriginal(element, previous);
    if (!selection.enabled.has(source.sourceId) || sameLanguage(source.sourceLanguage, selection.outputLanguage)) return;
    return source;
}

function readyToRetry(state: TranslationState): boolean {
    return state.display.kind === 'failed' && Date.now() >= state.display.retryAt;
}

function profileKey(settings: ReaderSettings): string {
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    return JSON.stringify([profile?.id, translationOutputLanguage(settings), settings.interfaceLanguage, profile?.definitionTranslationProviderIds]);
}

function restoreOriginal(element: HTMLElement, state: TranslationState): void {
    state.controller.abort();
    if (state.display.kind === 'failed') state.display.notice.remove();
    if (state.display.kind === 'translated') {
        state.display.translation.remove();
        if (state.display.original.parentNode) state.display.original.replaceWith(element);
    }
    states.delete(element);
    delete element.dataset.definitionTranslationState;
}

function renderDefinitionFailure(element: HTMLElement, language: ReaderSettings['interfaceLanguage'], retry: () => void): HTMLElement {
    const document = element.ownerDocument;
    const notice = document.createElement('div');
    notice.className = 'jpdb-reader-definition-failure';
    notice.setAttribute('role', 'status');
    const message = document.createElement('span');
    message.textContent = uiText(language, 'translationUnavailable');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jpdb-reader-action-pill';
    button.dataset.definitionTranslationRetry = '';
    button.textContent = uiText(language, 'exampleSourceRetry');
    button.addEventListener('click', event => {
        if (!isDirectTrustedReaderInteraction(event)) return;
        event.preventDefault();
        event.stopPropagation();
        retry();
    });
    notice.append(message, button);
    element.after(notice);
    return notice;
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
