import { escapeHtml, parseHtmlDocument, setInnerHtml } from './dom';
import { canonicalUchisenUrl, cleanText, decodeEntities } from './jpdb-text';
import { createPageMediaUrl, revokePageMediaUrl } from './page-media-url';
import { externalLinkIcon } from './popup-render';
import { DEFAULT_YOMU_PUBLIC_PROXY_URL } from './proxy-fetch';
import { requestBlob as requestReaderBlob, requestText as requestReaderText } from './reader-http';
import { gmStorageGet, gmStorageSet } from './storage';

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
}

const UCHISEN_INDEX_PREFIX = 'yomu-jpdb-uchisen-index:';
const UCHISEN_PAYWALL_STORY_RE = /\bplease\s+subscribe\s+to\s+uchisen\s*pro\b/i;
const UCHISEN_PAYWALL_IMAGE_RE = /(?:^|\/)(?:kanji\/)?enrollment\.(?:png|jpe?g|webp)$/i;

export function parseUchisenData(html: string): UchisenData {
    if (!html.trim()) return { images: [], componentGroups: [], kanjiKeyword: null };
    const doc = parseHtmlDocument(html);
    return {
        images: parseUchisenImagesFromDocument(doc),
        componentGroups: parseUchisenComponentGroupsFromDocument(doc),
        kanjiKeyword: parseUchisenKanjiKeywordFromDocument(doc),
    };
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
    const html = await requestText(`https://uchisen.com/kanji/${encodeURIComponent(kanji)}`, 9000, proxyUrl);
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
    const storedIndex = await gmStorageGet(`${UCHISEN_INDEX_PREFIX}${kanji}`, 0);
    let index = preferredUchisenIndex(storedIndex, images);
    if (!isValidUchisenIndex(index, images)) index = 0;

    const proxyUrl = options.proxyUrl ?? DEFAULT_YOMU_PUBLIC_PROXY_URL;
    let currentImageUrl = '';
    const cleanup = () => {
        if (!currentImageUrl) return;
        revokePageMediaUrl(currentImageUrl);
        currentImageUrl = '';
    };
    const render = () => {
        const item = images[index];
        const detailsClass = options.detailsClass ?? 'jpdb-reader-local-entry jpdb-reader-dictionary-group yomu-jpdb-uchisen-source';
        const summaryClass = options.summaryClass ?? 'jpdb-reader-local-head';
        const bodyClass = options.bodyClass ?? 'jpdb-reader-local-glossary yomu-jpdb-uchisen-body';
        const sourceAttributes = options.sourceAttributes ?? 'open';
        const summaryHtml = options.summaryHtml?.(index + 1, images.length) ?? `
                    <span class="yomu-jpdb-uchisen-summary-main">
                        <span>Uchisen</span>
                        <span class="yomu-jpdb-counter">${index + 1}/${images.length}</span>
                    </span>
                `;
        const bodyMeta = options.summaryHtml ? `<div class="yomu-jpdb-source-meta">${index + 1}/${images.length}</div>` : '';
        setInnerHtml(container, `
            <details class="${detailsClass}" ${sourceAttributes}>
                <summary class="${summaryClass}">
                    ${summaryHtml}
                </summary>
                <div class="${bodyClass}">
                    <span class="yomu-jpdb-uchisen-summary-controls" role="toolbar" aria-label="Uchisen mnemonic images">
                        <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="previous" title="Previous">&lsaquo;</button>
                        <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="next" title="Next">&rsaquo;</button>
                    </span>
                    <a class="yomu-jpdb-uchisen-summary-link" href="https://uchisen.com/kanji/${encodeURIComponent(kanji)}" target="_blank" rel="noopener">View on Uchisen ${externalLinkIcon()}</a>
                    ${bodyMeta}
                    ${renderUchisenComponentGroups(options.kanjiKeyword, options.componentGroups ?? [])}
                    <div class="yomu-jpdb-image-shell"><img alt="Uchisen mnemonic for ${escapeHtml(kanji)}" data-uchisen-image></div>
                    <div class="yomu-jpdb-story">${escapeHtml(item.story || 'No story available')}</div>
                </div>
            </details>
        `);
        const image = container.querySelector<HTMLImageElement>('[data-uchisen-image]');
        if (!image) return;
        const srcUrl = item.url;
        requestBlobUrl(srcUrl, 9000, proxyUrl)
            .then(url => {
                if (!image.isConnected || images[index]?.url !== srcUrl) {
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

    container.addEventListener('click', event => {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-uchisen-action]')?.dataset.uchisenAction;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        if (action !== 'previous' && action !== 'next') return;
        if (action === 'previous') index = (index - 1 + images.length) % images.length;
        if (action === 'next') index = (index + 1) % images.length;
        void gmStorageSet(`${UCHISEN_INDEX_PREFIX}${kanji}`, index);
        render();
    });
    render();
    return cleanup;
}

function renderUchisenComponentGroups(
    kanjiKeyword: UchisenKanjiKeyword | null | undefined,
    groups: UchisenComponentGroup[],
): string {
    const keywordGroup = uchisenKanjiKeywordGroup(kanjiKeyword);
    const visibleGroups = [
        ...(keywordGroup ? [keywordGroup] : []),
        ...groups.filter(group => group.components.length),
    ];
    if (!visibleGroups.length) return '';
    return `<div class="yomu-jpdb-component-breakdown" aria-label="Uchisen component breakdown">
        ${visibleGroups.map(group => `<div class="yomu-jpdb-component-group">
            <span class="yomu-jpdb-component-group-label">${escapeHtml(group.title)}</span>
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

function requestText(url: string, timeout: number, proxyUrl: string): Promise<string> {
    return requestReaderText(url, {
        proxyUrl,
        timeoutMs: timeout,
        failureLabel: 'Uchisen request',
        timeoutLabel: 'Uchisen request timed out.',
    });
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
