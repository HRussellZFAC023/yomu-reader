import type { InterfaceLanguage } from '../app/types';
import { uiText } from '../app/i18n';
import { escapeHtml } from '../dom';
import { speakerIcon } from '../ui/icons';
import { privateCommandAttributes, type CardCommandAction, type CardCommandCapability } from '../dom/private-command-capabilities';

export type ProviderCollection<T> =
    | { availability: 'loaded'; items: T[] }
    | { availability: 'empty'; items: [] }
    | { availability: 'unavailable'; items: []; reason: 'auth' | 'network' | 'schema' };

export interface ProviderExampleAudioView {
    action: string;
    label: string;
    attributes: Record<string, string>;
    className?: string;
}

export interface ProviderExampleView {
    id: string;
    sentence: string;
    sentenceHtml: string;
    translation: string;
    audio?: ProviderExampleAudioView;
    itemClassName?: string;
    rowClassName?: string;
    textClassName?: string;
    sentenceClassName?: string;
}

type SourceAttributes = (sourceStateKey: string, initiallyExpanded?: boolean) => string;

export interface ProviderExampleBehaviorOptions {
    /**
     * INTERFACE: what "Reveal translation" and the section header say. This is
     * chrome, and it is not where the sentence gets translated to.
     */
    interfaceLanguage: InterfaceLanguage;
    /**
     * OUTPUT: what the example sentence is translated into.
     *
     * These were one field until U105, so a Korean speaker running Yomu in
     * English was handed English example translations and could not ask for
     * Korean ones without also translating every button into Korean.
     */
    outputLanguage: string;
    blurTranslations: boolean;
    translate: (sentence: string, outputLanguage: string) => Promise<string>;
    isCurrentRoot?: (root: HTMLElement) => boolean;
}

export function renderProviderExamples(
    provider: 'bunpro' | 'jiten' | 'jpdb',
    sourceId: string,
    collection: ProviderCollection<ProviderExampleView>,
    sourceAttributes: SourceAttributes,
    /** INTERFACE: labels only. Example text and translations carry their own languages. */
    language: InterfaceLanguage,
): string {
    const availability = collection.availability;
    // U46 reverses the hiding that used to live here.
    //
    // The old rule was that a section with nothing to show does not earn a
    // header, so an empty or failed collection rendered the empty string. With
    // one Japanese source that was tidy. Across 33 targets it makes "this source
    // has no sentences in your language", "no sentences for this word", "the
    // media is not licensed" and "the request failed" render identically — as
    // nothing — and the learner cannot tell any of them from a broken build.
    //
    // Each state now stays in the DOM with its own `data-examples-availability`
    // and a reason in the INTERFACE language. Only a genuinely absent collection
    // renders nothing.
    const items = availability === 'loaded' ? collection.items : [];
    return `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-examples-group" data-example-provider="${provider}" data-examples-availability="${availability}" ${sourceAttributes(definitionSourceStateKey(`${sourceId}:examples`), items.length > 0)}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, 'exampleSentences'))}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count">${escapeHtml(providerExampleStatus(collection, language))}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                ${items.length
                    ? `<ul class="jpdb-reader-jpdb-examples">${items.map(example => renderProviderExample(example, language)).join('')}</ul>`
                    : renderProviderExampleAvailabilityReason(collection, language)}
            </div>
        </details>
    `;
}

function providerExampleStatus(collection: ProviderCollection<ProviderExampleView>, language: InterfaceLanguage): string {
    if (collection.availability === 'loaded' && collection.items.length) return String(collection.items.length);
    // Never "0". A zero beside a source name reads as a defect; "None yet"
    // reads as an answer.
    return uiText(language, collection.availability === 'unavailable' ? 'exampleSourceFailedShort' : 'exampleSourceEmptyShort');
}

function renderProviderExampleAvailabilityReason(
    collection: ProviderCollection<ProviderExampleView>,
    language: InterfaceLanguage,
): string {
    const reason = collection.availability === 'unavailable' ? collection.reason : 'no-results';
    const failed = collection.availability === 'unavailable';
    return `<p class="jpdb-reader-help" data-example-reason="${escapeHtml(reason)}">${escapeHtml(uiText(language, failed ? 'exampleSourceFailed' : 'exampleSourceEmpty'))}</p>`;
}

function definitionSourceStateKey(sourceId: string): string {
    return `definition-source:${sourceId}`;
}

function renderProviderExample(example: ProviderExampleView, language: InterfaceLanguage): string {
    const hasAudio = Boolean(example.audio);
    const translation = example.translation.trim();
    const translationPending = !translation;
    return `
        <li class="${classes('jpdb-reader-jpdb-example', example.itemClassName)}" data-provider-example-id="${escapeHtml(example.id)}">
            <div class="${classes('jpdb-reader-jpdb-example-row', example.rowClassName, hasAudio ? 'has-audio' : '')}">
                ${example.audio ? renderProviderExampleAudio(example.audio) : ''}
                <div class="${classes('jpdb-reader-jpdb-example-text', example.textClassName)}">
                    <div class="${classes('jpdb-reader-example-sentence jpdb-reader-parseable', example.sentenceClassName)}" data-provider-example-sentence data-yomu-furigana-mode="all">${example.sentenceHtml}</div>
                    <div class="jpdb-reader-example-translation" data-provider-example-translation data-provider-translation-blurred="true"${translationPending ? ` data-provider-translation-pending="true" data-provider-translation-sentence="${escapeHtml(example.sentence)}" hidden` : ''} role="button" tabindex="0" aria-label="${escapeHtml(uiText(language, 'revealTranslation'))}">${escapeHtml(translation)}</div>
                </div>
            </div>
        </li>
    `;
}

export function installProviderExampleBehaviors(root: HTMLElement, options: ProviderExampleBehaviorOptions): void {
    installProviderTranslationReveal(root);
    const translations = Array.from(root.querySelectorAll<HTMLElement>('[data-provider-example-translation]'));
    if (!options.blurTranslations) translations.forEach(revealProviderTranslation);
    translations.filter(translation => translation.dataset.providerTranslationPending === 'true')
        .forEach(translation => hydrateProviderTranslation(root, translation, options));
}

/**
 * Click/Enter/Space reveal for a blurred translation. Exported because the U46
 * example-source rows use the same `[data-provider-example-translation]`
 * contract, and a second copy of this handler would be one more place for the
 * keyboard path to rot.
 */
export function installProviderTranslationReveal(root: HTMLElement): void {
    if (root.dataset.providerExampleBehaviorsInstalled === 'true') return;
    root.dataset.providerExampleBehaviorsInstalled = 'true';
    root.addEventListener('click', event => {
        const translation = (event.target as Element | null)?.closest<HTMLElement>('[data-provider-example-translation]');
        if (translation && root.contains(translation)) revealProviderTranslation(translation);
    });
    root.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const translation = (event.target as Element | null)?.closest<HTMLElement>('[data-provider-example-translation]');
        if (!translation || !root.contains(translation)) return;
        event.preventDefault();
        revealProviderTranslation(translation);
    });
}

function hydrateProviderTranslation(root: HTMLElement, translation: HTMLElement, options: ProviderExampleBehaviorOptions): void {
    if (translation.dataset.providerTranslationLoading === 'true') return;
    const sentence = translation.dataset.providerTranslationSentence?.trim() ?? '';
    if (!sentence) return;
    translation.dataset.providerTranslationLoading = 'true';
    void options.translate(sentence, options.outputLanguage).then(translated => {
        if (!translated.trim() || !translation.isConnected || !isCurrentProviderRoot(root, options)) return;
        translation.textContent = translated.trim();
        // The translation is in the OUTPUT language while the sentence around it
        // is in the TARGET language, so it has to say so or a screen reader and
        // a bidi run both get it wrong.
        translation.lang = options.outputLanguage;
        translation.hidden = false;
        delete translation.dataset.providerTranslationPending;
        delete translation.dataset.providerTranslationSentence;
    }).catch(() => undefined).finally(() => {
        delete translation.dataset.providerTranslationLoading;
    });
}

function isCurrentProviderRoot(root: HTMLElement, options: ProviderExampleBehaviorOptions): boolean {
    return options.isCurrentRoot ? options.isCurrentRoot(root) : root.isConnected;
}

function revealProviderTranslation(translation: HTMLElement): void {
    delete translation.dataset.providerTranslationBlurred;
    translation.removeAttribute('role');
    translation.removeAttribute('tabindex');
    translation.removeAttribute('aria-label');
}

function renderProviderExampleAudio(audio: ProviderExampleAudioView): string {
    const attributes = Object.entries(audio.attributes)
        .filter(([name]) => /^data-[a-z0-9-]+$/u.test(name))
        .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
        .join('');
    const command = providerExampleAudioCommand(audio);
    const capability = command ? privateCommandAttributes(command) : '';
    return `<button class="${classes('jpdb-reader-icon-mini jpdb-reader-jpdb-example-audio', audio.className)}" type="button" data-action="${escapeHtml(audio.action)}"${attributes}${capability} title="${escapeHtml(audio.label)}" aria-label="${escapeHtml(audio.label)}">${speakerIcon()}</button>`;
}

function providerExampleAudioCommand(audio: ProviderExampleAudioView): CardCommandCapability | null {
    if (!isProviderExampleCardAction(audio.action)) return null;
    const attributes = audio.attributes;
    return {
        kind: 'card-action',
        action: audio.action,
        sentence: attributes['data-study-sentence'] || attributes['data-jpdb-example-sentence'],
        audioUrl: attributes['data-audio-url'],
        audioIds: attributes['data-jpdb-audio'],
        audioUrls: parsedStringArray(attributes['data-jiten-audio-urls']),
        jitenSentenceId: finiteInteger(attributes['data-jiten-sentence-id'], 1),
        jitenWordId: finiteInteger(attributes['data-jiten-word-id'], 1),
        jitenReadingIndex: finiteInteger(attributes['data-jiten-reading-index'], 0),
    };
}

function isProviderExampleCardAction(value: string): value is CardCommandAction {
    return value === 'jpdb-example-audio' || value === 'jiten-audio' || value === 'bunpro-audio' || value === 'wanikani-audio';
}

function parsedStringArray(value: string | undefined): string[] | undefined {
    if (!value) return undefined;
    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : undefined;
    } catch {
        return undefined;
    }
}

function finiteInteger(value: string | undefined, minimum: number): number | undefined {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= minimum ? parsed : undefined;
}

function classes(...values: Array<string | undefined>): string {
    return values.map(value => value?.trim() ?? '').filter(Boolean).join(' ');
}
