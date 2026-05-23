import { escapeHtml, parseHtmlDocument, setInnerHtml } from './dom';
import { canonicalUchisenUrl, cleanText, decodeEntities } from './jpdb-text';
import { createPageMediaUrl, revokePageMediaUrl } from './page-media-url';
import { externalLinkIcon } from './popup-render';
import { DEFAULT_YOMU_PUBLIC_PROXY_URL } from './proxy-fetch';
import { requestBlob as requestReaderBlob, requestText as requestReaderText } from './reader-http';
import { gmStorageGet, gmStorageSet } from './storage';
import { resolveUiLanguage, uiText } from './i18n';
import type { InterfaceLanguage } from './types';

export interface UchisenImage {
    url: string;
    story: string;
}

export interface UchisenComponent {
    name: string;
    symbol: string;
    url: string;
}

export interface UchisenComponentGroup {
    title: string;
    components: UchisenComponent[];
}

export interface UchisenKanjiKeyword {
    kanji: string;
    keyword: string;
    url: string;
}

export interface UchisenData {
    images: UchisenImage[];
    componentGroups: UchisenComponentGroup[];
    kanjiKeyword: UchisenKanjiKeyword | null;
    kanjiId: string;
    canGenerateImages: boolean;
}

export interface UchisenGenerateRequest {
    kanjiId: string;
    mnemonic: string;
    imagePrompt: string;
}

export interface UchisenGenerateResult {
    imageFilename: string;
    imageUrl: string;
    story: string;
}

interface UchisenImageCandidate extends UchisenImage {
    paywall: boolean;
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

const UCHISEN_INDEX_PREFIX = 'yomu-jpdb-uchisen-index:';
const UCHISEN_PAYWALL_STORY_RE = /\bplease\s+subscribe\s+to\s+uchisen\s*pro\b/i;
const UCHISEN_PAYWALL_IMAGE_RE = /(?:^|\/)(?:kanji\/)?enrollment\.(?:png|jpe?g|webp)$/i;

export function parseUchisenData(html: string): UchisenData {
    if (!html.trim()) return emptyUchisenData();
    const doc = parseHtmlDocument(html);
    return {
        images: parseUchisenImagesFromDocument(doc),
        componentGroups: parseUchisenComponentGroupsFromDocument(doc),
        kanjiKeyword: parseUchisenKanjiKeywordFromDocument(doc),
        kanjiId: parseUchisenKanjiIdFromDocument(doc),
        canGenerateImages: parseUchisenAuthenticatedFromDocument(doc),
    };
}

function emptyUchisenData(): UchisenData {
    return { images: [], componentGroups: [], kanjiKeyword: null, kanjiId: '', canGenerateImages: false };
}

export function parseUchisenImages(html: string): UchisenImage[] {
    return parseUchisenData(html).images;
}

export function parseUchisenComponents(html: string): UchisenComponentGroup[] {
    return parseUchisenData(html).componentGroups;
}

export function parseUchisenKanjiKeyword(html: string): UchisenKanjiKeyword | null {
    return parseUchisenData(html).kanjiKeyword;
}

function parseUchisenImagesFromDocument(doc: Document): UchisenImage[] {
    const images: UchisenImageCandidate[] = [];
    const mainImage = mainUchisenImageUrl(doc);
    const mainStory = cleanText(doc.querySelector('#mnemonic_story')?.textContent ?? '');
    if (mainImage) {
        const url = canonicalUchisenUrl(mainImage);
        images.push({
            url,
            story: mainStory || 'No story available',
            paywall: isUchisenPaywallImage(url) || isUchisenPaywallStory(mainStory),
        });
    }

    doc.querySelectorAll<HTMLElement>('.mnemonic_card').forEach(card => {
        const image = uchisenCardImage(card, mainStory);
        if (image) images.push(image);
    });

    return orderedUchisenImages(images);
}

function parseUchisenComponentGroupsFromDocument(doc: Document): UchisenComponentGroup[] {
    const root = doc.querySelector<HTMLElement>('.kanji_info_container .components') ?? doc.querySelector<HTMLElement>('.components');
    if (!root) return [];
    return Array.from(root.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('KP_primes'))
        .map(uchisenComponentGroup)
        .filter((group): group is UchisenComponentGroup => Boolean(group?.components.length))
        .slice(0, 4);
}

function parseUchisenKanjiKeywordFromDocument(doc: Document): UchisenKanjiKeyword | null {
    const candidates = [
        doc.querySelector<HTMLElement>('#kanji_keyword_container > span')?.textContent,
        doc.querySelector<HTMLElement>('#kanji_keyword_container')?.textContent,
        doc.querySelector<HTMLElement>('.kanji_name > span')?.textContent,
        doc.querySelector<HTMLElement>('.mnemonic_studio_right h2.kanji_info')?.textContent,
    ];

    for (const candidate of candidates) {
        const keyword = uchisenKanjiKeyword(candidate ?? '');
        if (keyword) return keyword;
    }
    return null;
}

function parseUchisenKanjiIdFromDocument(doc: Document): string {
    const candidates = [
        doc.querySelector<HTMLInputElement>('input#kanji_id')?.value,
        doc.querySelector<HTMLInputElement>('input#showing_kanji_id')?.value,
        doc.querySelector<HTMLInputElement>('input[name="kanji_id"]')?.value,
    ];
    return cleanText(candidates.find(Boolean) ?? '');
}

function parseUchisenAuthenticatedFromDocument(doc: Document): boolean {
    const userId = cleanText(doc.querySelector<HTMLInputElement>('input#user_id')?.value ?? '');
    if (userId) return true;
    const hasLoginLink = Boolean(doc.querySelector('#lo_links a[href="/login"], #lo_links_dropdown a[href="/login"], form[action="/login"], form[action^="/login?"]'));
    const hasKanjiForm = Boolean(doc.querySelector<HTMLInputElement>('input#kanji_id, input[name="kanji_id"]')?.value);
    return hasKanjiForm && !hasLoginLink;
}

function uchisenKanjiKeyword(value: string): UchisenKanjiKeyword | null {
    const match = /^(.+?)\s*[-\u2013\u2014]\s*(.+)$/u.exec(cleanText(value));
    if (!match) return null;
    const kanji = cleanText(match[1].replace(/[「」]/g, ''));
    const keyword = cleanText(match[2]);
    if (!kanji || !keyword) return null;
    return {
        kanji,
        keyword,
        url: `https://uchisen.com/kanji/${encodeURIComponent(kanji)}`,
    };
}

function uchisenComponentGroup(group: HTMLElement): UchisenComponentGroup | null {
    const components = Array.from(group.querySelectorAll<HTMLElement>('.name_combo'))
        .map(uchisenComponent)
        .filter((component): component is UchisenComponent => Boolean(component?.symbol || component?.name))
        .slice(0, 8);
    if (!components.length) return null;
    return {
        title: uchisenComponentGroupTitle(group),
        components,
    };
}

function uchisenComponentGroupTitle(group: HTMLElement): string {
    if (group.querySelector('.prime_label')) return 'Kanji Primes';
    if (group.querySelector('.compound_label')) return 'Compound Kanji';
    return cleanText(group.querySelector('.prime_label, .compound_label')?.textContent ?? '') || 'Components';
}

function uchisenComponent(item: HTMLElement): UchisenComponent | null {
    const link = item.querySelector<HTMLAnchorElement>('a[href]');
    if (!link) return null;
    const symbol = cleanText(link.querySelector<HTMLElement>('.component_symbol')?.textContent ?? '');
    const name = uchisenComponentName(link, symbol);
    return {
        name,
        symbol,
        url: absoluteUchisenUrl(link.getAttribute('href') ?? ''),
    };
}

function uchisenComponentName(link: HTMLAnchorElement, symbol: string): string {
    const text = cleanText((link.textContent ?? '').replace(/\u00a0/g, ' '));
    const withoutSymbol = symbol ? cleanText(text.replace(symbol, '')) : text;
    return cleanText(withoutSymbol.replace(/[：:].*$/u, '')) || symbol;
}

function absoluteUchisenUrl(value: string): string {
    try {
        return new URL(value, 'https://uchisen.com').href;
    } catch {
        return value;
    }
}

function orderedUchisenImages(images: UchisenImageCandidate[]): UchisenImage[] {
    const seen = new Set<string>();
    const deduped = images.filter(item => {
        const key = uchisenImageDedupeKey(item);
        if (!item.url || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return [
        ...deduped.filter(item => !item.paywall),
        ...deduped.filter(item => item.paywall),
    ].map(({ url, story }) => ({ url, story }));
}

function uchisenImageDedupeKey(item: UchisenImageCandidate): string {
    return item.paywall && isUchisenPaywallImage(item.url) ? 'paywall:enrollment' : `url:${item.url}`;
}

function mainUchisenImageUrl(doc: Document): string {
    const mainLoader = doc.querySelector<HTMLElement>('.kanji_image_loader[data-large]');
    return mainLoader?.getAttribute('data-large')
        || doc.querySelector<HTMLImageElement>('#full_kanji_image')?.getAttribute('src')
        || '';
}

function uchisenCardImage(card: HTMLElement, mainStory: string): UchisenImageCandidate | null {
    const rawUrl = card.querySelector<HTMLInputElement>('input.image_url')?.value.trim() ?? '';
    if (!rawUrl) return null;
    const url = canonicalUchisenUrl(rawUrl);
    const story = uchisenCardStory(card, mainStory);
    return {
        url,
        story,
        paywall: isUchisenPaywallCard(card, url, story),
    };
}

function uchisenCardStory(card: HTMLElement, mainStory: string): string {
    const rawStory = card.querySelector<HTMLInputElement>('input.story')?.value ?? '';
    const story = cleanText(decodeEntities(rawStory).replace(/<[^>]+>/g, ' '));
    return story || mainStory || 'No story available';
}

function isUchisenPaywallCard(card: HTMLElement, url: string, story: string): boolean {
    const thumbnailUrl = card.querySelector<HTMLImageElement>('.mnemonic_card_thumbnail img')?.getAttribute('src') ?? '';
    return isUchisenPaywallImage(url)
        || isUchisenPaywallImage(thumbnailUrl)
        || isUchisenPaywallStory(story);
}

function isUchisenPaywallImage(url: string): boolean {
    try {
        return UCHISEN_PAYWALL_IMAGE_RE.test(new URL(url).pathname);
    } catch {
        return UCHISEN_PAYWALL_IMAGE_RE.test(url.split(/[?#]/)[0]);
    }
}

function isUchisenPaywallStory(story: string): boolean {
    return UCHISEN_PAYWALL_STORY_RE.test(cleanText(story));
}

export async function loadUchisenData(kanji: string, proxyUrl = DEFAULT_YOMU_PUBLIC_PROXY_URL): Promise<UchisenData> {
    const html = await requestUchisenPageText(`https://uchisen.com/kanji/${encodeURIComponent(kanji)}`, 9000, proxyUrl);
    return parseUchisenData(html);
}

export async function loadUchisenImages(kanji: string, proxyUrl = DEFAULT_YOMU_PUBLIC_PROXY_URL): Promise<UchisenImage[]> {
    return (await loadUchisenData(kanji, proxyUrl)).images;
}

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
    let canGenerateImages = Boolean(options.canGenerateImages && currentKanjiId);
    const storedIndex = await gmStorageGet(`${UCHISEN_INDEX_PREFIX}${kanji}`, 0);
    let index = preferredUchisenIndex(storedIndex, currentImages);
    if (!isValidUchisenIndex(index, currentImages)) index = 0;

    const proxyUrl = options.proxyUrl ?? DEFAULT_YOMU_PUBLIC_PROXY_URL;
    let generateOpen = false;
    let generateBusy = false;
    let generateStatus: { tone: 'neutral' | 'error' | 'success'; text: string } | null = null;
    let generateFields = defaultUchisenGenerateFields(kanji, currentKanjiKeyword, currentComponentGroups);
    let currentImageUrl = '';
    const cleanup = () => {
        if (!currentImageUrl) return;
        revokePageMediaUrl(currentImageUrl);
        currentImageUrl = '';
    };
    const render = () => {
        const language = options.interfaceLanguage ?? 'en';
        if (!isValidUchisenIndex(index, currentImages)) index = 0;
        const item = currentImages[index] ?? null;
        const total = currentImages.length;
        const previousLabel = uiText(language, 'previousExample');
        const nextLabel = uiText(language, 'nextExample');
        const story = item?.story && item.story !== 'No story available'
            ? item.story
            : uiText(language, 'noStoryAvailable');
        const detailsClass = options.detailsClass ?? 'jpdb-reader-local-entry jpdb-reader-dictionary-group yomu-jpdb-uchisen-source';
        const summaryClass = options.summaryClass ?? 'jpdb-reader-local-head';
        const bodyClass = options.bodyClass ?? 'jpdb-reader-local-glossary yomu-jpdb-uchisen-body';
        const sourceAttributes = options.sourceAttributes ?? 'open';
        const summaryHtml = options.summaryHtml?.(total ? index + 1 : 0, total) ?? `
                    <span class="yomu-jpdb-uchisen-summary-main">
                        <span>Uchisen</span>
                        <span class="yomu-jpdb-counter">${total ? `${index + 1}/${total}` : '0'}</span>
                    </span>
                `;
        const bodyMeta = options.summaryHtml && total ? `<div class="yomu-jpdb-source-meta">${index + 1}/${total}</div>` : '';
        setInnerHtml(container, `
            <details class="${detailsClass}" ${sourceAttributes}>
                <summary class="${summaryClass}">
                    ${summaryHtml}
                </summary>
                <div class="${bodyClass}">
                    <div class="yomu-jpdb-uchisen-toolbar">
                        ${total ? `<span class="yomu-jpdb-uchisen-summary-controls" role="toolbar" aria-label="${escapeHtml(uiText(language, 'uchisenMnemonicImages'))}">
                            <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="previous" title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}">&lsaquo;</button>
                            <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="next" title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}">&rsaquo;</button>
                        </span>` : '<span></span>'}
                        <span class="yomu-jpdb-uchisen-link-row">
                            <a class="yomu-jpdb-uchisen-summary-link" href="https://uchisen.com/kanji/${encodeURIComponent(kanji)}" target="_blank" rel="noopener">${escapeHtml(uchisenExternalLinkLabel(language))} ${externalLinkIcon()}</a>
                            ${canGenerateImages ? `<button class="yomu-jpdb-uchisen-summary-link yomu-jpdb-uchisen-generate-link" type="button" data-uchisen-action="generate-toggle" aria-expanded="${generateOpen}" title="${escapeHtml(uiText(language, 'generateUchisenImage'))}">${escapeHtml(uiText(language, 'generateUchisenImageToggle'))}</button>` : ''}
                        </span>
                    </div>
                    ${bodyMeta}
                    ${generateOpen ? renderUchisenGeneratePanel(generateFields, generateStatus, generateBusy, language) : ''}
                    ${renderUchisenComponentGroups(currentKanjiKeyword, currentComponentGroups, language)}
                    ${item ? `<div class="yomu-jpdb-image-shell"><img alt="${escapeHtml(formatUchisenTemplate(uiText(language, 'uchisenMnemonicFor'), { kanji }))}" data-uchisen-image></div>
                    <div class="yomu-jpdb-story">${escapeHtml(story)}</div>` : `<div class="jpdb-reader-help">${escapeHtml(uiText(language, 'noUchisenImagesYet'))}</div>`}
                </div>
            </details>
        `);
        const image = container.querySelector<HTMLImageElement>('[data-uchisen-image]');
        if (!image || !item) return;
        const srcUrl = item.url;
        requestBlobUrl(srcUrl, 9000, proxyUrl)
            .then(url => {
                if (!image.isConnected || currentImages[index]?.url !== srcUrl) {
                    revokePageMediaUrl(url);
                    return;
                }
                cleanup();
                currentImageUrl = url;
                image.src = url;
            })
            .catch(() => {
                if (image.isConnected) image.remove();
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
            canGenerateImages = Boolean(fresh.canGenerateImages && currentKanjiId);
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
        if (generateBusy || !canGenerateImages || !currentKanjiId) return;
        syncGenerateFields();
        generateBusy = true;
        generateStatus = { tone: 'neutral', text: uiText(options.interfaceLanguage ?? 'en', 'uchisenGeneratingImage') };
        render();
        try {
            const result = await generateAndPublishUchisenMnemonic(kanji, {
                kanjiId: currentKanjiId,
                mnemonic: generateFields.mnemonic,
                imagePrompt: generateFields.imagePrompt,
            }, proxyUrl, message => {
                generateStatus = { tone: 'neutral', text: message };
                render();
            }, options.interfaceLanguage ?? 'en');
            await refreshAfterGenerate(result);
            generateStatus = { tone: 'success', text: uiText(options.interfaceLanguage ?? 'en', 'uchisenGeneratedImage') };
            generateOpen = false;
        } catch {
            generateStatus = { tone: 'error', text: uiText(options.interfaceLanguage ?? 'en', 'uchisenGenerateFailed') };
        } finally {
            generateBusy = false;
            render();
        }
    };

    container.addEventListener('click', event => {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-uchisen-action]')?.dataset.uchisenAction;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        if (action === 'generate-toggle') {
            generateOpen = !generateOpen;
            generateStatus = canGenerateImages ? null : { tone: 'error', text: uiText(options.interfaceLanguage ?? 'en', 'uchisenLoginRequired') };
            render();
            return;
        }
        if (action === 'generate-submit') {
            void generateAndRefresh();
            return;
        }
        if (action !== 'previous' && action !== 'next') return;
        if (!currentImages.length) return;
        if (action === 'previous') index = (index - 1 + currentImages.length) % currentImages.length;
        if (action === 'next') index = (index + 1) % currentImages.length;
        void gmStorageSet(`${UCHISEN_INDEX_PREFIX}${kanji}`, index);
        render();
    });
    container.addEventListener('input', event => {
        const field = (event.target as HTMLElement).closest<HTMLTextAreaElement>('[data-uchisen-generate-field]');
        if (!field) return;
        syncGenerateFields();
    });
    render();
    return cleanup;
}

export async function generateAndPublishUchisenMnemonic(
    kanji: string,
    request: UchisenGenerateRequest,
    proxyUrl = DEFAULT_YOMU_PUBLIC_PROXY_URL,
    onStatus?: (message: string) => void,
    language: InterfaceLanguage = 'en',
): Promise<UchisenGenerateResult> {
    const kanjiId = request.kanjiId.trim();
    const mnemonic = request.mnemonic.trim();
    const imagePrompt = request.imagePrompt.trim();
    if (!kanjiId || !mnemonic || !imagePrompt) throw new Error('Missing Uchisen generation fields.');

    const referrer = `https://uchisen.com/kanji/${encodeURIComponent(kanji)}`;
    onStatus?.(uiText(language, 'uchisenGeneratingImage'));
    const generationText = await postUchisenForm('https://uchisen.com/generateimage', {
        prompt: escapeUchisenPrompt(imagePrompt),
        kanji_id: kanjiId,
    }, referrer, proxyUrl, 'Uchisen image generation', 120000);
    const generation = parseUchisenGenerationResponse(generationText);

    onStatus?.(uiText(language, 'uchisenPublishingMnemonic'));
    await postUchisenForm('https://uchisen.com/save_mnemonic.php', {
        img_src: generation.imageFilename,
        kanji_id: kanjiId,
        formatted_mnemonic: formatUchisenMnemonicHtml(mnemonic),
        current_image_prompt: imagePrompt,
        redirect: `/kanji/${encodeURIComponent(kanji)}`,
        mnemonic,
        image_prompt: imagePrompt,
        start_blurred: 'no',
    }, referrer, proxyUrl, 'Uchisen mnemonic publish', 120000);

    return {
        imageFilename: generation.imageFilename,
        imageUrl: canonicalUchisenUrl(generation.imageFilename),
        story: plainUchisenMnemonic(mnemonic),
    };
}

function renderUchisenGeneratePanel(
    fields: { mnemonic: string; imagePrompt: string },
    status: { tone: 'neutral' | 'error' | 'success'; text: string } | null,
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
): { mnemonic: string; imagePrompt: string } {
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
        imagePrompt: `1970s Japanese children's storybook illustration of a friendly ${keywordText.toLowerCase()} scene; include distinct props for ${componentPrompt}; pastel colors, vintage textures; clear silhouettes, warm light, no text or signage`,
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

function parseUchisenGenerationResponse(text: string): { imageFilename: string } {
    const json = parseJsonObjectFromText(text) as { success?: unknown; url?: unknown; error_message?: unknown; error?: unknown } | null;
    if (!json || json.success === false) throw new Error(String(json?.error_message ?? json?.error ?? 'Image generation failed.'));
    const imageFilename = typeof json.url === 'string' ? json.url.trim() : '';
    if (!imageFilename) throw new Error('Image generation did not return a filename.');
    return { imageFilename };
}

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

function escapeUchisenPrompt(value: string): string {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    }[character] ?? character));
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

async function requestUchisenPageText(url: string, timeout: number, proxyUrl: string): Promise<string> {
    try {
        return await requestReaderText(url, {
            timeoutMs: timeout,
            failureLabel: 'Uchisen request',
            timeoutLabel: 'Uchisen request timed out.',
            credentials: 'include',
            anonymous: false,
            withCredentials: true,
            allowPublicProxies: false,
            allowConfiguredProxy: false,
            allowDirectCrossOrigin: false,
        });
    } catch {
        return requestText(url, timeout, proxyUrl);
    }
}

function requestText(url: string, timeout: number, proxyUrl: string): Promise<string> {
    return requestReaderText(url, {
        proxyUrl,
        timeoutMs: timeout,
        failureLabel: 'Uchisen request',
        timeoutLabel: 'Uchisen request timed out.',
    });
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
            Accept: '*/*',
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
        if (/error|failed|not logged|login required/i.test(text) && !/success/i.test(text)) {
            throw new Error(`${failureLabel} failed.`);
        }
        return text;
    });
}

function encodedForm(fields: Record<string, string>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) params.set(key, value);
    return params.toString();
}

function requestBlobUrl(url: string, timeout: number, proxyUrl: string): Promise<string> {
    return requestBlob(url, timeout, proxyUrl).then(blob => createPageMediaUrl(blob));
}

function requestBlob(url: string, timeout: number, proxyUrl: string): Promise<Blob> {
    return requestReaderBlob(url, {
        proxyUrl,
        timeoutMs: timeout,
        failureLabel: 'Uchisen image request',
        timeoutLabel: 'Uchisen image request timed out.',
    });
}
