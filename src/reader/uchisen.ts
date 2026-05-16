import { escapeHtml, setInnerHtml } from './dom';
import { canonicalUchisenUrl, cleanText, decodeEntities } from './jpdb-text';
import { createPageMediaUrl, revokePageMediaUrl } from './page-media-url';
import { DEFAULT_YOMU_PUBLIC_PROXY_URL } from './proxy-fetch';
import { requestBlob as requestReaderBlob, requestText as requestReaderText } from './reader-http';
import { gmStorageDelete, gmStorageGet, gmStorageSet } from './storage';

export interface UchisenImage {
    url: string;
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
}

const UCHISEN_STAR_PREFIX = 'yomu-jpdb-uchisen-star:';
const UCHISEN_INDEX_PREFIX = 'yomu-jpdb-uchisen-index:';
const UCHISEN_PAYWALL_STORY_RE = /\bplease\s+subscribe\s+to\s+uchisen\s*pro\b/i;
const UCHISEN_PAYWALL_IMAGE_RE = /(?:^|\/)(?:kanji\/)?enrollment\.(?:png|jpe?g|webp)$/i;

export function parseUchisenImages(html: string): UchisenImage[] {
    if (!html.trim()) return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
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

export async function loadUchisenImages(kanji: string, proxyUrl = DEFAULT_YOMU_PUBLIC_PROXY_URL): Promise<UchisenImage[]> {
    const html = await requestText(`https://uchisen.com/kanji/${encodeURIComponent(kanji)}`, 9000, proxyUrl);
    return parseUchisenImages(html);
}

export async function installUchisenCarousel(
    container: HTMLElement,
    kanji: string,
    images: UchisenImage[],
    options: UchisenCarouselOptions = {},
): Promise<() => void> {
    const storedIndex = await gmStorageGet(`${UCHISEN_INDEX_PREFIX}${kanji}`, 0);
    const starred = await gmStorageGet<string | null>(`${UCHISEN_STAR_PREFIX}${kanji}`, null);
    let index = preferredUchisenIndex(storedIndex, starred, images);
    if (!isValidUchisenIndex(index, images)) index = 0;

    const proxyUrl = options.proxyUrl ?? DEFAULT_YOMU_PUBLIC_PROXY_URL;
    let currentStarred = starred;
    let currentImageUrl = '';
    const cleanup = () => {
        if (!currentImageUrl) return;
        revokePageMediaUrl(currentImageUrl);
        currentImageUrl = '';
    };
    const render = () => {
        const item = images[index];
        const isStarred = currentStarred === item.url;
        const detailsClass = options.detailsClass ?? 'jpdb-reader-local-entry jpdb-reader-dictionary-group yomu-jpdb-uchisen-source';
        const summaryClass = options.summaryClass ?? 'jpdb-reader-local-head';
        const bodyClass = options.bodyClass ?? 'jpdb-reader-local-glossary yomu-jpdb-uchisen-body';
        const sourceAttributes = options.sourceAttributes ?? 'open';
        const summaryHtml = options.summaryHtml?.(index + 1, images.length) ?? `
                    <span>Uchisen</span>
                    <span class="yomu-jpdb-counter">${index + 1}/${images.length}</span>
                `;
        const bodyMeta = options.summaryHtml ? `<div class="yomu-jpdb-source-meta">${index + 1}/${images.length}</div>` : '';
        setInnerHtml(container, `
            <details class="${detailsClass}" ${sourceAttributes}>
                <summary class="${summaryClass}">${summaryHtml}</summary>
                <div class="${bodyClass}">
                    ${bodyMeta}
                    <div class="yomu-jpdb-toolbar" role="toolbar" aria-label="Uchisen mnemonic images">
                        <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="previous" title="Previous">&lsaquo;</button>
                        <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="next" title="Next">&rsaquo;</button>
                        <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="star" title="Favorite">${isStarred ? '&#9733;' : '&#9734;'}</button>
                        <a href="https://uchisen.com/kanji/${encodeURIComponent(kanji)}" target="_blank" rel="noopener">Open</a>
                    </div>
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
        if (action === 'previous') index = (index - 1 + images.length) % images.length;
        if (action === 'next') index = (index + 1) % images.length;
        if (action === 'star') {
            const key = `${UCHISEN_STAR_PREFIX}${kanji}`;
            if (currentStarred === images[index].url) {
                currentStarred = null;
                void gmStorageDelete(key);
            } else {
                currentStarred = images[index].url;
                void gmStorageSet(key, currentStarred);
            }
        } else {
            void gmStorageSet(`${UCHISEN_INDEX_PREFIX}${kanji}`, index);
        }
        render();
    });
    render();
    return cleanup;
}

function preferredUchisenIndex(storedIndex: number, starred: string | null, images: UchisenImage[]): number {
    const starredIndex = starred ? images.findIndex(item => item.url === starred) : -1;
    if (starredIndex >= 0) return starredIndex;
    if (isValidUchisenIndex(storedIndex, images) && !isUchisenPaywallItem(images[storedIndex])) return storedIndex;
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
