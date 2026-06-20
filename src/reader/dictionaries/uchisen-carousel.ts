import { escapeHtml, setInnerHtml } from '../dom';
import { canonicalUchisenUrl, cleanText } from '../jpdb/jpdb-text';
import { createPageMediaUrl, revokePageMediaUrl } from '../app/page-media-url';
import { externalLinkIcon } from '../ui/icons';
import { requestBlob as requestReaderBlob, requestText as requestReaderText } from '../network/http';
import { gmStorageGet, gmStorageSet } from '../app/storage';
import { resolveUiLanguage, uiText } from '../app/i18n';
import imagePromptReplacementDefs from './uchisen-image-prompt-replacements.json';
import { isUchisenPaywallImage, isUchisenPaywallStory, orderedUchisenImages } from './uchisen-images';
import type { InterfaceLanguage } from '../app/types';
import type { UchisenComponent, UchisenComponentGroup, UchisenData, UchisenImage, UchisenKanjiKeyword } from './uchisen';

interface UchisenGenerateRequest {
    kanjiId: string;
    mnemonic: string;
    imagePrompt: string;
}

interface UchisenGenerateFields {
    mnemonic: string;
    imagePrompt: string;
}

interface UchisenGenerateResult {
    imageFilename: string;
    imageUrl: string;
    story: string;
}

type UchisenGenerateStatus = { tone: 'neutral' | 'error' | 'success'; text: string } | null;

interface UchisenGenerationPayload {
    success?: unknown;
    url?: unknown;
    full_url?: unknown;
    image_url?: unknown;
    imageUrl?: unknown;
    filename?: unknown;
    file?: unknown;
    img_src?: unknown;
    error_message?: unknown;
    error?: unknown;
}

interface UchisenCarouselOptions {
    sourceAttributes?: string;
    detailsClass?: string;
    summaryClass?: string;
    bodyClass?: string;
    proxyUrl?: string;
    summaryHtml?: (index: number, total: number) => string;
    componentGroups?: UchisenComponentGroup[];
    kanjiKeyword?: UchisenKanjiKeyword | null;
    kanjiId?: string | null;
    canGenerateImages?: boolean;
    refreshData?: () => Promise<UchisenData>;
    interfaceLanguage?: InterfaceLanguage;
}

interface UchisenCarouselRenderModel {
    kanji: string;
    item: UchisenImage | null;
    index: number;
    total: number;
    language: InterfaceLanguage;
    canGenerateImages: boolean;
    generateOpen: boolean;
    generateBusy: boolean;
    generateStatus: UchisenGenerateStatus;
    generateFields: UchisenGenerateFields;
    componentGroups: UchisenComponentGroup[];
    kanjiKeyword: UchisenKanjiKeyword | null;
    sourceAttributes: string;
    detailsClass: string;
    summaryClass: string;
    bodyClass: string;
    summaryHtml: string;
    bodyMeta: string;
}

interface UchisenCarouselRenderInputs {
    options: UchisenCarouselOptions;
    canGenerateImages: boolean;
    generateOpen: boolean;
    generateBusy: boolean;
    generateStatus: UchisenGenerateStatus;
    generateFields: UchisenGenerateFields;
    currentComponentGroups: UchisenComponentGroup[];
    currentKanjiKeyword: UchisenKanjiKeyword | null;
}

const UCHISEN_INDEX_PREFIX = 'yomu-jpdb-uchisen-index:';

export async function installUchisenCarousel(
    container: HTMLElement,
    kanji: string,
    images: UchisenImage[],
    options: UchisenCarouselOptions = {},
): Promise<() => void> {
    let currentImages = images.slice();
    let currentComponentGroups = options.componentGroups ?? [];
    let currentKanjiKeyword = options.kanjiKeyword ?? null;
    let currentKanjiId = options.kanjiId ?? '';
    let canGenerateImages = Boolean(currentKanjiId && options.canGenerateImages);
    const storedIndex = await gmStorageGet(`${UCHISEN_INDEX_PREFIX}${kanji}`, 0);
    let index = preferredUchisenIndex(storedIndex, currentImages);
    if (!isValidUchisenIndex(index, currentImages)) index = 0;

    const proxyUrl = options.proxyUrl ?? '';
    const language = options.interfaceLanguage ?? 'en';
    let generateOpen = false;
    let generateBusy = false;
    let generateStatus: UchisenGenerateStatus = null;
    let generateFields = defaultUchisenGenerateFields(kanji, currentKanjiKeyword, currentComponentGroups);
    let currentImageUrl = '';
    const cleanup = () => {
        if (!currentImageUrl) return;
        revokePageMediaUrl(currentImageUrl);
        currentImageUrl = '';
    };
    const render = () => {
        index = validUchisenRenderIndex(index, currentImages);
        const model = uchisenCarouselRenderModel(kanji, index, currentImages, {
            options,
            canGenerateImages,
            generateOpen,
            generateBusy,
            generateStatus,
            generateFields,
            currentComponentGroups,
            currentKanjiKeyword,
        });
        setInnerHtml(container, renderUchisenCarouselHtml(model));
        attachRenderedUchisenImage(container, model.item, index, currentImages, proxyUrl, cleanup, url => {
            currentImageUrl = url;
        });
    };

    const syncGenerateFields = () => {
        generateFields = {
            mnemonic: container.querySelector<HTMLTextAreaElement>('[data-uchisen-generate-field="mnemonic"]')?.value ?? generateFields.mnemonic,
            imagePrompt: container.querySelector<HTMLTextAreaElement>('[data-uchisen-generate-field="imagePrompt"]')?.value ?? generateFields.imagePrompt,
        };
    };

    const refreshAfterGenerate = async (result: UchisenGenerateResult): Promise<void> => {
        const fresh = await options.refreshData?.().catch(() => null);
        if (fresh) {
            currentImages = fresh.images;
            currentComponentGroups = fresh.componentGroups;
            currentKanjiKeyword = fresh.kanjiKeyword;
            currentKanjiId = fresh.kanjiId || currentKanjiId;
            canGenerateImages = Boolean(currentKanjiId && fresh.canGenerateImages);
        } else {
            currentImages = orderedUchisenImages([
                ...currentImages.map(item => ({ ...item, paywall: isUchisenPaywallItem(item) })),
                { url: result.imageUrl, story: result.story, paywall: false },
            ]);
        }
        const generatedIndex = findUchisenImageIndex(currentImages, result.imageUrl);
        index = generatedIndex >= 0 ? generatedIndex : Math.max(0, currentImages.length - 1);
        void gmStorageSet(`${UCHISEN_INDEX_PREFIX}${kanji}`, index);
    };

    const generateAndRefresh = async (): Promise<void> => {
        if (!canStartUchisenGeneration(generateBusy, canGenerateImages, currentKanjiId)) return;
        syncGenerateFields();
        generateBusy = true;
        generateStatus = uchisenGenerateStatus('neutral', uiText(language, 'uchisenGeneratingImage'));
        render();
        try {
            const result = await generateAndPublishUchisenMnemonic(kanji, {
                kanjiId: currentKanjiId,
                mnemonic: generateFields.mnemonic,
                imagePrompt: generateFields.imagePrompt,
            }, proxyUrl, message => {
                generateStatus = uchisenGenerateStatus('neutral', message);
                render();
            }, language);
            await refreshAfterGenerate(result);
            generateStatus = uchisenGenerateStatus('success', uiText(language, 'uchisenGeneratedImage'));
            generateOpen = false;
        } catch (error) {
            generateStatus = uchisenGenerateErrorStatus(error, language);
        } finally {
            generateBusy = false;
            render();
        }
    };

    const toggleGeneratePanel = () => {
        generateOpen = !generateOpen;
        generateStatus = uchisenGenerateToggleStatus(canGenerateImages, language);
        render();
    };

    const updateCarouselIndex = (nextIndex: number) => {
        index = nextIndex;
        void gmStorageSet(`${UCHISEN_INDEX_PREFIX}${kanji}`, index);
        render();
    };

    const handleAction = (action: string): void => {
        if (action === 'generate-toggle') {
            toggleGeneratePanel();
            return;
        }
        if (action === 'generate-submit') {
            void generateAndRefresh();
            return;
        }
        const nextIndex = nextUchisenCarouselIndex(action, index, currentImages.length);
        if (nextIndex !== null) updateCarouselIndex(nextIndex);
    };

    container.addEventListener('click', event => {
        const action = uchisenActionFromClick(event);
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        handleAction(action);
    });
    container.addEventListener('input', event => {
        const field = (event.target as HTMLElement).closest<HTMLTextAreaElement>('[data-uchisen-generate-field]');
        if (!field) return;
        syncGenerateFields();
    });
    render();
    return cleanup;
}

function validUchisenRenderIndex(index: number, images: UchisenImage[]): number {
    return isValidUchisenIndex(index, images) ? index : 0;
}

function canStartUchisenGeneration(generateBusy: boolean, canGenerateImages: boolean, kanjiId: string): boolean {
    return !generateBusy && canGenerateImages && Boolean(kanjiId);
}

function uchisenGenerateStatus(tone: NonNullable<UchisenGenerateStatus>['tone'], text: string): UchisenGenerateStatus {
    return { tone, text };
}

function uchisenGenerateErrorStatus(error: unknown, language: InterfaceLanguage): UchisenGenerateStatus {
    return uchisenGenerateStatus('error', uchisenGenerateErrorMessage(error, language));
}

function uchisenGenerateErrorMessage(error: unknown, language: InterfaceLanguage): string {
    if (error instanceof Error) {
        const message = error.message.trim();
        if (message) return message;
    }
    return uiText(language, 'uchisenGenerateFailed');
}

function uchisenGenerateToggleStatus(canGenerateImages: boolean, language: InterfaceLanguage): UchisenGenerateStatus {
    return canGenerateImages
        ? null
        : uchisenGenerateStatus('error', uiText(language, 'uchisenLoginRequired'));
}

function uchisenActionFromClick(event: MouseEvent): string {
    return (event.target as HTMLElement).closest<HTMLButtonElement>('[data-uchisen-action]')?.dataset.uchisenAction ?? '';
}

function nextUchisenCarouselIndex(action: string, currentIndex: number, total: number): number | null {
    if (!total) return null;
    if (action === 'previous') return (currentIndex - 1 + total) % total;
    if (action === 'next') return (currentIndex + 1) % total;
    return null;
}

function uchisenCarouselRenderModel(
    kanji: string,
    index: number,
    images: UchisenImage[],
    inputs: UchisenCarouselRenderInputs,
): UchisenCarouselRenderModel {
    const total = images.length;
    const language = inputs.options.interfaceLanguage ?? 'en';
    return {
        kanji,
        item: images[index] ?? null,
        index,
        total,
        language,
        canGenerateImages: inputs.canGenerateImages,
        generateOpen: inputs.generateOpen,
        generateBusy: inputs.generateBusy,
        generateStatus: inputs.generateStatus,
        generateFields: inputs.generateFields,
        componentGroups: inputs.currentComponentGroups,
        kanjiKeyword: inputs.currentKanjiKeyword,
        sourceAttributes: inputs.options.sourceAttributes ?? 'open',
        detailsClass: inputs.options.detailsClass ?? 'jpdb-reader-local-entry jpdb-reader-dictionary-group yomu-jpdb-uchisen-source',
        summaryClass: inputs.options.summaryClass ?? 'jpdb-reader-local-head',
        bodyClass: inputs.options.bodyClass ?? 'jpdb-reader-local-glossary yomu-jpdb-uchisen-body',
        summaryHtml: uchisenSummaryHtml(inputs.options, index, total),
        bodyMeta: uchisenBodyMetaHtml(inputs.options, index, total),
    };
}

function uchisenSummaryHtml(options: UchisenCarouselOptions, index: number, total: number): string {
    return options.summaryHtml?.(total ? index + 1 : 0, total) ?? `
        <span class="yomu-jpdb-uchisen-summary-main">
            <span>Uchisen</span>
            <span class="yomu-jpdb-counter">${total ? `${index + 1}/${total}` : '0'}</span>
        </span>
    `;
}

function uchisenBodyMetaHtml(options: UchisenCarouselOptions, index: number, total: number): string {
    return options.summaryHtml && total
        ? `<span class="yomu-jpdb-source-meta">${index + 1}/${total}</span>`
        : '';
}

function renderUchisenCarouselHtml(model: UchisenCarouselRenderModel): string {
    return `
        <details class="${model.detailsClass}" ${model.sourceAttributes}>
            <summary class="${model.summaryClass}">
                ${model.summaryHtml}
            </summary>
            <div class="${model.bodyClass}">
                ${renderUchisenToolbar(model)}
                ${model.generateOpen ? renderUchisenGeneratePanel(model.generateFields, model.generateStatus, model.generateBusy, model.language) : ''}
                ${renderUchisenComponentGroups(model.kanjiKeyword, model.componentGroups, model.language)}
                ${renderUchisenImageOrEmpty(model)}
            </div>
        </details>
    `;
}

function renderUchisenToolbar(model: UchisenCarouselRenderModel): string {
    return `
        <div class="yomu-jpdb-uchisen-toolbar">
            ${model.bodyMeta}
            ${renderUchisenLinkRow(model)}
            ${renderUchisenNavigationControls(model)}
        </div>
    `;
}

function renderUchisenLinkRow(model: UchisenCarouselRenderModel): string {
    return `
        <span class="yomu-jpdb-uchisen-link-row">
            <a class="yomu-jpdb-uchisen-summary-link" href="https://uchisen.com/kanji/${encodeURIComponent(model.kanji)}" target="_blank" rel="noopener">${escapeHtml(uchisenExternalLinkLabel(model.language))} ${externalLinkIcon()}</a>
            ${model.canGenerateImages ? renderUchisenGenerateToggle(model) : ''}
        </span>
    `;
}

function renderUchisenGenerateToggle(model: UchisenCarouselRenderModel): string {
    return `<button class="yomu-jpdb-uchisen-summary-link yomu-jpdb-uchisen-generate-link" type="button" data-uchisen-action="generate-toggle" aria-expanded="${model.generateOpen}" title="${escapeHtml(uiText(model.language, 'generateUchisenImage'))}">${escapeHtml(uiText(model.language, 'generateUchisenImageToggle'))}</button>`;
}

function renderUchisenNavigationControls(model: UchisenCarouselRenderModel): string {
    if (!model.total) return '';
    const previousLabel = uiText(model.language, 'previousExample');
    const nextLabel = uiText(model.language, 'nextExample');
    return `<span class="yomu-jpdb-uchisen-summary-controls" role="toolbar" aria-label="${escapeHtml(uiText(model.language, 'uchisenMnemonicImages'))}">
        <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="previous" title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}">&lsaquo;</button>
        <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="next" title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}">&rsaquo;</button>
    </span>`;
}

function renderUchisenImageOrEmpty(model: UchisenCarouselRenderModel): string {
    if (!model.item) return `<div class="jpdb-reader-help">${escapeHtml(uiText(model.language, 'noUchisenImagesYet'))}</div>`;
    const story = model.item.story && model.item.story !== 'No story available'
        ? model.item.story
        : uiText(model.language, 'noStoryAvailable');
    const alt = formatUchisenTemplate(uiText(model.language, 'uchisenMnemonicFor'), { kanji: model.kanji });
    return `<div class="yomu-jpdb-image-shell"><img alt="${escapeHtml(alt)}" data-uchisen-image src="${escapeHtml(model.item.url)}" loading="eager" decoding="async" referrerpolicy="no-referrer"></div>
        <div class="yomu-jpdb-story">${escapeHtml(story)}</div>`;
}

function attachRenderedUchisenImage(
    container: HTMLElement,
    item: UchisenImage | null,
    index: number,
    currentImages: UchisenImage[],
    proxyUrl: string,
    cleanup: () => void,
    setCurrentImageUrl: (url: string) => void,
): void {
    const image = container.querySelector<HTMLImageElement>('[data-uchisen-image]');
    if (!image || !item) return;
    const srcUrl = item.url;
    let blobSettled = false;
    let directFailed = false;
    const removeBrokenDirectImage = () => {
        directFailed = true;
        if (blobSettled && image.isConnected) image.remove();
    };
    image.addEventListener('error', removeBrokenDirectImage);
    requestBlobUrl(srcUrl, 9000, proxyUrl)
        .then(url => {
            if (!image.isConnected || currentImages[index]?.url !== srcUrl) {
                revokePageMediaUrl(url);
                return;
            }
            blobSettled = true;
            image.removeEventListener('error', removeBrokenDirectImage);
            cleanup();
            setCurrentImageUrl(url);
            image.addEventListener('error', () => {
                if (image.isConnected) image.remove();
            }, { once: true });
            image.src = url;
        })
        .catch(() => {
            if (!image.isConnected || currentImages[index]?.url !== srcUrl) return;
            blobSettled = true;
            if (directFailed) image.remove();
            else if (image.getAttribute('src') !== srcUrl) image.src = srcUrl;
        });
}

async function generateAndPublishUchisenMnemonic(
    kanji: string,
    request: UchisenGenerateRequest,
    proxyUrl = '',
    onStatus?: (message: string) => void,
    language: InterfaceLanguage = 'en',
): Promise<UchisenGenerateResult> {
    const kanjiId = request.kanjiId.trim();
    const mnemonic = request.mnemonic.trim();
    const imagePrompt = request.imagePrompt.trim();
    const storyBackedPrompt = storyBackedUchisenImagePrompt(mnemonic, imagePrompt);
    const safeImagePrompt = safeUchisenImagePrompt(storyBackedPrompt);
    if (!kanjiId || !mnemonic || !imagePrompt) throw new Error('Missing Uchisen generation fields.');

    const referrer = `https://uchisen.com/kanji/${encodeURIComponent(kanji)}`;
    onStatus?.(uiText(language, 'uchisenGeneratingImage'));
    const { generation, imagePrompt: publishedImagePrompt } = await generateUchisenImageWithRetry(
        kanjiId,
        imagePrompt,
        storyBackedPrompt,
        safeImagePrompt,
        referrer,
        proxyUrl,
    );

    onStatus?.(uiText(language, 'uchisenPublishingMnemonic'));
    await postUchisenForm('https://uchisen.com/save_mnemonic.php', {
        img_src: generation.imageFilename,
        kanji_id: kanjiId,
        formatted_mnemonic: formatUchisenMnemonicHtml(mnemonic),
        current_image_prompt: publishedImagePrompt,
        redirect: `/kanji/${encodeURIComponent(kanji)}`,
        mnemonic,
        image_prompt: publishedImagePrompt,
        start_blurred: 'no',
    }, referrer, proxyUrl, 'Uchisen mnemonic publish', 120000);

    return {
        imageFilename: generation.imageFilename,
        imageUrl: generation.imageUrl,
        story: plainUchisenMnemonic(mnemonic),
    };
}

async function generateUchisenImageWithRetry(
    kanjiId: string,
    imagePrompt: string,
    storyBackedPrompt: string,
    safeImagePrompt: string,
    referrer: string,
    proxyUrl: string,
): Promise<{ generation: { imageFilename: string; imageUrl: string }; imagePrompt: string }> {
    const attempts = uniqueUchisenPrompts([imagePrompt, storyBackedPrompt, safeImagePrompt]);
    let lastError: unknown;
    for (const prompt of attempts) {
        try {
            const generationText = await postUchisenForm('https://uchisen.com/generateimage', {
                prompt: uchisenPromptFieldValue(prompt),
                kanji_id: kanjiId,
            }, referrer, proxyUrl, 'Uchisen image generation', 120000);
            return { generation: parseUchisenGenerationResponse(generationText), imagePrompt: prompt };
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error('Uchisen image generation failed.');
}

function storyBackedUchisenImagePrompt(mnemonic: string, imagePrompt: string): string {
    const story = plainUchisenMnemonic(mnemonic).replace(/\s+/g, ' ').trim();
    if (!story) return imagePrompt;
    return fitUchisenImagePrompt(`${imagePrompt}; scene follows this mnemonic story: ${story}`);
}

function uniqueUchisenPrompts(prompts: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const prompt of prompts) {
        const trimmed = prompt.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        unique.push(trimmed);
    }
    return unique;
}

function fitUchisenImagePrompt(prompt: string): string {
    const maxLength = 400;
    if (prompt.length <= maxLength) return prompt;
    const noTextSuffix = /;\s*no text or signage$/i.test(prompt) ? '; no text or signage' : '';
    const targetLength = noTextSuffix ? maxLength - noTextSuffix.length : maxLength;
    return `${prompt.slice(0, targetLength).replace(/[;,\s]+$/, '')}${noTextSuffix}`;
}

function renderUchisenGeneratePanel(
    fields: UchisenGenerateFields,
    status: UchisenGenerateStatus,
    busy: boolean,
    language: InterfaceLanguage,
): string {
    const statusHtml = status
        ? `<div class="yomu-jpdb-uchisen-generate-status" data-tone="${escapeHtml(status.tone)}">${escapeHtml(status.text)}</div>`
        : `<div class="jpdb-reader-help">${escapeHtml(uiText(language, 'uchisenGenerateHint'))}</div>`;
    return `
        <div class="yomu-jpdb-uchisen-generator">
            <label class="yomu-jpdb-uchisen-field">
                <span>${escapeHtml(uiText(language, 'uchisenMnemonicStory'))}</span>
                <textarea rows="3" data-uchisen-generate-field="mnemonic" ${busy ? 'disabled' : ''}>${escapeHtml(fields.mnemonic)}</textarea>
            </label>
            <label class="yomu-jpdb-uchisen-field">
                <span>${escapeHtml(uiText(language, 'uchisenImagePrompt'))}</span>
                <textarea rows="4" data-uchisen-generate-field="imagePrompt" ${busy ? 'disabled' : ''}>${escapeHtml(fields.imagePrompt)}</textarea>
            </label>
            <div class="yomu-jpdb-uchisen-generator-footer">
                ${statusHtml}
                <button class="jpdb-reader-btn" type="button" data-uchisen-action="generate-submit" ${busy ? 'disabled' : ''}>${escapeHtml(uiText(language, 'generateUchisenImage'))}</button>
            </div>
        </div>
    `;
}

function defaultUchisenGenerateFields(
    kanji: string,
    keyword: UchisenKanjiKeyword | null,
    groups: UchisenComponentGroup[],
): UchisenGenerateFields {
    const keywordText = keyword?.keyword || kanji;
    const components = uniqueUchisenComponents(groups);
    const componentStory = components.length
        ? components.map(component => `#${component.name}#`).join(' and ')
        : '#component#';
    const componentPrompt = components.length
        ? components.map(component => `${component.name}${component.symbol ? ` (${component.symbol})` : ''}`).join(', ')
        : 'simple component props';
    return {
        mnemonic: `##${keywordText}## A warm, clear scene brings ${componentStory} together so ${keywordText.toLowerCase()} feels easy to picture.`,
        imagePrompt: safeUchisenImagePrompt(`Japanese children's storybook illustration of a friendly ${keywordText.toLowerCase()} scene; include distinct props for ${componentPrompt}; pastel colors, vintage textures; warm light; clear silhouettes; no text or signage`),
    };
}

function uniqueUchisenComponents(groups: UchisenComponentGroup[]): UchisenComponent[] {
    const seen = new Set<string>();
    const components: UchisenComponent[] = [];
    for (const group of groups) {
        for (const component of group.components) {
            const key = component.name || component.symbol;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            components.push(component);
        }
    }
    return components;
}

function findUchisenImageIndex(images: UchisenImage[], imageUrl: string): number {
    const canonical = canonicalUchisenUrl(imageUrl);
    return images.findIndex(item => canonicalUchisenUrl(item.url) === canonical);
}

function parseUchisenGenerationResponse(text: string): { imageFilename: string; imageUrl: string } {
    const json = parseJsonObjectFromText(text) as UchisenGenerationPayload | null;
    if (!json || isUchisenGenerationFailure(json)) {
        throw new Error(uchisenGenerationErrorMessage(json, text));
    }
    const rawFilename = firstString(json.url, json.filename, json.file, json.img_src, json.image_url, json.imageUrl);
    const rawFullUrl = firstString(json.full_url, json.image_url, json.imageUrl);
    const imageFilename = normalizeUchisenImageFilename(rawFilename);
    if (!imageFilename) throw new Error(`Image generation did not return a filename: ${snippet(text)}`);
    return {
        imageFilename,
        imageUrl: rawFullUrl ? canonicalUchisenUrl(rawFullUrl) : canonicalUchisenUrl(imageFilename),
    };
}

function uchisenPromptFieldValue(value: string): string {
    return escapeHtml(value).replace(/'/g, '&#039;');
}

function safeUchisenImagePrompt(value: string): string {
    let prompt = value;
    for (const [pattern, replacement] of UCHISEN_IMAGE_PROMPT_REPLACEMENTS) {
        prompt = prompt.replace(pattern, replacement);
    }
    prompt = prompt
        .replace(/no text,\s*letters,\s*numbers,\s*logos,\s*or signage/gi, 'no text or signage')
        .replace(/no text,\s*letters,\s*numbers,\s*logos,\s*labels,\s*or signage/gi, 'no text or signage')
        .replace(/\s+/g, ' ')
        .trim();
    if (!/no text|without text/i.test(prompt)) prompt = `${prompt}; no text or signage`;
    return prompt;
}

const UCHISEN_IMAGE_PROMPT_REPLACEMENTS: Array<[RegExp, string]> = imagePromptReplacementDefs
    .map(([pattern, replacement]) => [new RegExp(pattern, 'gi'), replacement]);

function parseJsonObjectFromText(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        const match = /\{[\s\S]*\}/.exec(text);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }
}

function isUchisenGenerationFailure(json: UchisenGenerationPayload): boolean {
    if (json.success === false || json.success === 0 || json.success === '0') return true;
    if (typeof json.error_message === 'string' && json.error_message.trim()) return true;
    if (typeof json.error === 'string' && json.error.trim()) return true;
    return false;
}

function uchisenGenerationErrorMessage(json: UchisenGenerationPayload | null, text: string): string {
    const message = firstString(json?.error_message, json?.error);
    if (/must be logged|not logged|login required/i.test(message)) return message;
    if (message) return `Uchisen image backend rejected generation: ${message}`;
    return `Uchisen image backend rejected generation: ${snippet(text)}`;
}

function firstString(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

// Intentionally duplicated in scripts/uchisen-bulk-publish.mjs
// (normalizeImageFilename) — see the note there. Keep in sync.
function normalizeUchisenImageFilename(value: string): string {
    if (!value) return '';
    try {
        const url = new URL(value);
        return url.pathname.split('/').filter(Boolean).pop() ?? value;
    } catch {
        return value.split('/').filter(Boolean).pop() ?? value;
    }
}

function snippet(text: string): string {
    return String(text).replace(/\s+/g, ' ').trim().slice(0, 500);
}

function formatUchisenMnemonicHtml(value: string): string {
    return String(value)
        .replace(/[<>]/g, '')
        .replace(/#nl#/g, '<br>')
        .replace(/##([^#]+)##/g, '<b>$1</b>')
        .replace(/#([^#]+)#/g, '<i>$1</i>');
}

function plainUchisenMnemonic(value: string): string {
    return cleanText(String(value)
        .replace(/#nl#/g, ' ')
        .replace(/##([^#]+)##/g, '$1')
        .replace(/#([^#]+)#/g, '$1'));
}

function renderUchisenComponentGroups(
    kanjiKeyword: UchisenKanjiKeyword | null | undefined,
    groups: UchisenComponentGroup[],
    language: InterfaceLanguage,
): string {
    const keywordGroup = uchisenKanjiKeywordGroup(kanjiKeyword);
    const visibleGroups = [
        ...(keywordGroup ? [keywordGroup] : []),
        ...groups.filter(group => group.components.length),
    ];
    if (!visibleGroups.length) return '';
    return `<div class="yomu-jpdb-component-breakdown" aria-label="${escapeHtml(uiText(language, 'readingsComponents'))}">
        ${visibleGroups.map(group => `<div class="yomu-jpdb-component-group">
            <span class="yomu-jpdb-component-group-label">${escapeHtml(localizedUchisenComponentGroupTitle(group.title, language))}</span>
            <div class="yomu-jpdb-component-list">
                ${group.components.map(component => renderUchisenComponentChip(component)).join('')}
            </div>
        </div>`).join('')}
    </div>`;
}

function uchisenKanjiKeywordGroup(keyword: UchisenKanjiKeyword | null | undefined): UchisenComponentGroup | null {
    if (!keyword || (!keyword.kanji && !keyword.keyword)) return null;
    return {
        title: 'Kanji Keyword',
        components: [{
            name: keyword.keyword,
            symbol: keyword.kanji,
            url: keyword.url,
        }],
    };
}

function localizedUchisenComponentGroupTitle(title: string, language: InterfaceLanguage): string {
    if (resolveUiLanguage(language) !== 'ja') return title;
    if (title === 'Kanji Keyword') return '漢字キーワード';
    if (title === 'Kanji Primes') return '漢字パーツ';
    if (title === 'Compound Kanji') return '複合漢字';
    if (title === 'Components') return '部品';
    return title;
}

function uchisenExternalLinkLabel(language: InterfaceLanguage): string {
    return resolveUiLanguage(language) === 'ja' ? 'Uchisenで見る' : 'View on Uchisen';
}

function formatUchisenTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_match: string, key: string) => values[key] ?? '');
}

function renderUchisenComponentChip(component: UchisenComponent): string {
    const label = [component.name, component.symbol].filter(Boolean).join(': ');
    const content = `
        ${component.symbol ? `<strong>${escapeHtml(component.symbol)}</strong>` : ''}
        ${component.name ? `<span>${escapeHtml(component.name)}</span>` : ''}
    `;
    return component.url
        ? `<a class="yomu-jpdb-component-chip" href="${escapeHtml(component.url)}" target="_blank" rel="noopener" title="${escapeHtml(label)}">${content}</a>`
        : `<span class="yomu-jpdb-component-chip" title="${escapeHtml(label)}">${content}</span>`;
}

function preferredUchisenIndex(storedIndex: number, images: UchisenImage[]): number {
    if (isValidUchisenIndex(storedIndex, images)) return storedIndex;
    const firstNonPaywall = images.findIndex(item => !isUchisenPaywallItem(item));
    return firstNonPaywall >= 0 ? firstNonPaywall : storedIndex;
}

function isValidUchisenIndex(index: number, images: UchisenImage[]): boolean {
    return Number.isInteger(index) && index >= 0 && index < images.length;
}

function isUchisenPaywallItem(item: UchisenImage | undefined): boolean {
    return Boolean(item && (isUchisenPaywallImage(item.url) || isUchisenPaywallStory(item.story)));
}

function postUchisenForm(
    url: string,
    fields: Record<string, string>,
    referrer: string,
    proxyUrl: string,
    failureLabel: string,
    timeout: number,
): Promise<string> {
    return requestReaderText(url, {
        method: 'POST',
        data: encodedForm(fields),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Accept: 'text/html, */*; q=0.01',
            Origin: 'https://uchisen.com',
            Referer: referrer,
        },
        proxyUrl,
        timeoutMs: timeout,
        failureLabel,
        timeoutLabel: `${failureLabel} timed out.`,
        credentials: 'include',
        anonymous: false,
        withCredentials: true,
        allowPublicProxies: false,
        allowConfiguredProxy: false,
        allowDirectCrossOrigin: true,
    }).then(text => {
        const json = parseJsonObjectFromText(text) as { error_message?: unknown; error?: unknown } | null;
        const message = firstString(json?.error_message, json?.error);
        if (message && !/generateimage$/i.test(url)) throw new Error(message);
        if (isUchisenAuthFailure(text)) {
            throw new Error(`${failureLabel} failed because Uchisen did not accept the current login.`);
        }
        return text;
    });
}

function isUchisenAuthFailure(text: string): boolean {
    return /not logged|login required|account is needed/i.test(text) && !/success/i.test(text);
}

function encodedForm(fields: Record<string, string>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) params.set(key, value);
    return params.toString();
}

function requestBlobUrl(url: string, timeout: number, proxyUrl: string): Promise<string> {
    return requestBlob(url, timeout, proxyUrl).then(blob => createPageMediaUrl(blob, url));
}

function requestBlob(url: string, timeout: number, proxyUrl: string): Promise<Blob> {
    return requestReaderBlob(url, {
        proxyUrl,
        timeoutMs: timeout,
        failureLabel: 'Uchisen image request',
        timeoutLabel: 'Uchisen image request timed out.',
    });
}
