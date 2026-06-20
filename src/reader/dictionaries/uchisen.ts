import { parseHtmlDocument } from '../dom';
import { canonicalUchisenUrl, cleanText, decodeEntities } from '../jpdb/jpdb-text';
import { DEFAULT_YOMU_PUBLIC_PROXY_URL } from '../network/proxy-fetch';
import { requestText as requestReaderText } from '../network/http';
import { isUchisenPaywallImage, isUchisenPaywallStory, orderedUchisenImages } from './uchisen-images';
import type { UchisenImageCandidate } from './uchisen-images';

export { installUchisenCarousel } from './uchisen-carousel';

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

export function parseUchisenData(html: string): UchisenData {
    if (!html.trim()) return emptyUchisenData();
    const doc = parseHtmlDocument(html);
    const kanjiId = parseUchisenKanjiIdFromDocument(doc);
    return {
        images: parseUchisenImagesFromDocument(doc),
        componentGroups: parseUchisenComponentGroupsFromDocument(doc),
        kanjiKeyword: parseUchisenKanjiKeywordFromDocument(doc),
        kanjiId,
        canGenerateImages: Boolean(kanjiId && parseUchisenCanGenerateFromDocument(doc)),
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

function parseUchisenCanGenerateFromDocument(doc: Document): boolean {
    const userId = cleanText(doc.querySelector<HTMLInputElement>('input#user_id')?.value ?? '');
    const hasAccountNav = Boolean(doc.querySelector('a[href^="/account/"], a[href="/logout"]'));
    const hasStudioGenerateButton = Boolean(doc.querySelector('.generate_image_button, button[data-uchisen-action="generate-submit"]'));
    const hasLoginPrompt = Boolean(doc.querySelector('#lo_links a[href*="login"], a[href*="/login"]'));
    const explicitlyUnavailable = Boolean(doc.querySelector('[data-uchisen-generate-unavailable], .generate_image_button[disabled]'));
    return !explicitlyUnavailable && (hasStudioGenerateButton || Boolean(userId) || hasAccountNav || hasLoginPrompt);
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

export async function loadUchisenData(kanji: string, proxyUrl = DEFAULT_YOMU_PUBLIC_PROXY_URL): Promise<UchisenData> {
    const html = await requestUchisenPageText(`https://uchisen.com/kanji/${encodeURIComponent(kanji)}`, 9000, proxyUrl);
    return parseUchisenData(html);
}

export async function loadUchisenImages(kanji: string, proxyUrl = DEFAULT_YOMU_PUBLIC_PROXY_URL): Promise<UchisenImage[]> {
    return (await loadUchisenData(kanji, proxyUrl)).images;
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
