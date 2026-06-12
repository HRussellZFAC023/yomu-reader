import { renderCardHighlightedTextHtml } from '../cards/highlight';
import { renderTokensToHtml, setInnerHtml } from '../dom/index';
import { el, type DomAttrs } from '../dom/builder';
import { exampleSentenceLookupTokens } from '../lookup/example-sentence-tokens';
import type { ImmersionKitClient, ImmersionKitExample } from '../immersion/kit';
import { localizedImmersionProviderLabel } from '../immersion/labels';
import { uiText } from '../app/i18n';
import { effectiveFuriganaMode } from '../settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../app/types';

export function renderNewTabImmersionSentence(card: JPDBCard, example: ImmersionKitExample, settings: ReaderSettings, tokens?: JPDBToken[]): HTMLElement {
    const sentence = document.createElement('div');
    sentence.className = 'jpdb-reader-example-sentence jpdb-reader-parseable';
    sentence.lang = 'ja';
    sentence.dataset.immersionSentenceRender = '';
    sentence.dataset.newtabSentenceText = example.sentence;
    setInnerHtml(sentence, renderNewTabSentenceHtml(example.sentence, card, settings, tokens));
    return sentence;
}

export function renderNewTabFrontSentence(card: JPDBCard, sentence: string, settings: ReaderSettings, tokens?: JPDBToken[]): HTMLElement {
    const sentenceWrap = el('span', {
        class: 'jpdb-reader-newtab-sentence jpdb-reader-parseable',
        lang: 'ja',
        dataset: { newtabSentenceRender: true, newtabSentenceText: sentence },
    });
    setInnerHtml(sentenceWrap, renderNewTabSentenceHtml(sentence, card, settings, tokens));
    return sentenceWrap;
}

export function renderNewTabSentenceHtml(sentence: string, card: JPDBCard, settings: ReaderSettings, tokens?: JPDBToken[]): string {
    return tokens && tokens.length
        ? renderTokensToHtml(sentence, exampleSentenceLookupTokens(tokens, card), newTabStudySentenceSettings(settings))
        : renderCardHighlightedTextHtml(sentence, card);
}

// UT-22: study sentences are an SRS surface — words the user already knows
// (known / mature / never-forget …) must not carry furigana even when the
// global furigana mode is "all", or the page keeps feeding answers for
// graded-out vocabulary. Stricter explicit modes (off / difficult-kanji /
// known-status) pass through unchanged.
function newTabStudySentenceSettings(settings: ReaderSettings): ReaderSettings {
    if (effectiveFuriganaMode(settings) !== 'all') return settings;
    return { ...settings, furiganaMode: 'known-status' };
}

export function renderNewTabImmersionTranslation(example: ImmersionKitExample, settings: ReaderSettings): HTMLElement | null {
    if (!shouldRenderNewTabImmersionTranslation(example, settings)) return null;
    return el('div', newTabImmersionTranslationAttributes(settings), example.translation);
}

export function setNewTabImmersionTranslationBlurred(element: HTMLElement, blurred: boolean, language: ReaderSettings['interfaceLanguage']): void {
    if (blurred) {
        element.dataset.yomuImmersionTranslationBlurred = 'true';
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-label', uiText(language, 'revealTranslation'));
        return;
    }
    delete element.dataset.yomuImmersionTranslationBlurred;
    element.removeAttribute('tabindex');
    element.removeAttribute('role');
    element.removeAttribute('aria-label');
}

export function newTabImmersionImageUrl(
    example: ImmersionKitExample,
    settings: ReaderSettings,
    client: ImmersionKitClient,
): string {
    const urls = settings.immersionKitShowImages ? client.mediaUrls(example, 'image') : [];
    return urls[0] ?? '';
}

export function newTabImmersionAudioUrls(example: ImmersionKitExample, client: ImmersionKitClient): string[] {
    return client.mediaUrls(example, 'sound');
}

export function newTabImmersionProviderLabel(example: ImmersionKitExample, language: ReaderSettings['interfaceLanguage']): string {
    return localizedImmersionProviderLabel(example, language);
}

export function renderNewTabImmersionImage(imageUrl: string, overlay: HTMLElement | null = null): HTMLElement | null {
    if (!imageUrl) return null;
    return el('div', { class: 'jpdb-reader-example-media' },
        el('img', { class: 'jpdb-reader-example-image', src: imageUrl, alt: '', loading: 'eager', decoding: 'async', referrerPolicy: 'no-referrer', dataset: { yomuImmersionImageSrc: imageUrl } }),
        overlay,
    );
}

export function syncNewTabImmersionFrameSubtitleSize(root: HTMLElement): void {
    const media = root.querySelector<HTMLElement>('.jpdb-reader-example-card.has-image .jpdb-reader-example-media');
    if (!media) return;
    const rect = media.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scale = Math.sqrt(Math.min(rect.width / 1280, rect.height / 720));
    const size = Math.max(13, Math.min(18, Math.round(22 * Math.max(0.55, scale))));
    media.style.setProperty('--subtitle-font-size', `${size}px`);
}

export async function decodeNewTabImmersionImage(src: string): Promise<void> {
    if (!src || typeof Image === 'undefined') return;
    const image = new Image();
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.src = src;
    if (typeof image.decode === 'function') await image.decode().catch(() => undefined);
}

function shouldRenderNewTabImmersionTranslation(example: ImmersionKitExample, settings: ReaderSettings): boolean {
    return settings.immersionKitShowTranslation && Boolean(example.translation);
}

function newTabImmersionTranslationAttributes(settings: ReaderSettings): DomAttrs {
    return {
        class: 'jpdb-reader-example-translation',
        dataset: newTabImmersionTranslationDataset(settings),
        ...newTabImmersionTranslationRevealAttributes(settings),
    };
}

function newTabImmersionTranslationRevealAttributes(settings: ReaderSettings): DomAttrs {
    return settings.immersionKitRevealTranslationOnClick
        ? { role: 'button', tabindex: '0', 'aria-label': uiText(settings.interfaceLanguage, 'revealTranslation') }
        : {};
}

function newTabImmersionTranslationDataset(settings: ReaderSettings): Record<string, boolean> | undefined {
    return settings.immersionKitRevealTranslationOnClick ? { yomuImmersionTranslationBlurred: true } : undefined;
}
