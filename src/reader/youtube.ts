import { APP_NAME } from './constants';
import { HAS_JAPANESE } from './dom';
import type { ReaderSettings } from './types';

const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$/i;
const VIDEO_CARD_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytm-rich-item-renderer',
    'ytm-compact-video-renderer',
    'ytm-video-card-renderer',
].join(',');

const TITLE_SELECTOR = [
    '#video-title',
    'a#video-title',
    'yt-formatted-string#video-title',
    'h3 a',
    'h3',
    '.yt-lockup-metadata-view-model-wiz__title',
    '.media-item-headline',
    'a[href*="/watch"]',
    'a[href*="/shorts"]',
].join(',');

const JAPANESE_CHAR_RE = /[\u3040-\u30ff\u3400-\u9fff]/g;
const KANA_RE = /[\u3040-\u30ff]/g;
const LATIN_WORD_RE = /[a-z]{3,}/gi;

export function isYouTubeHost(hostname = location.hostname): boolean {
    return YOUTUBE_HOST_RE.test(hostname);
}

export function isProbablyJapaneseYouTubeText(text: string): boolean {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (!HAS_JAPANESE.test(compact)) return false;

    const japaneseChars = compact.match(JAPANESE_CHAR_RE)?.length ?? 0;
    const kanaChars = compact.match(KANA_RE)?.length ?? 0;
    const latinWords = compact.match(LATIN_WORD_RE)?.length ?? 0;

    if (kanaChars >= 2) return true;
    if (japaneseChars >= 4) return true;
    return japaneseChars >= 2 && latinWords <= 2;
}

export function collectYouTubeVideoCards(root: ParentNode = document): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(VIDEO_CARD_SELECTOR))
        .filter(card => !card.closest('[data-jpdb-reader-root]'));
}

export function readYouTubeCardText(card: HTMLElement): string {
    const title = card.querySelector<HTMLElement>(TITLE_SELECTOR);
    const titleText = [
        title?.getAttribute('title'),
        title?.getAttribute('aria-label'),
        title?.textContent,
    ].find(value => value?.trim()) ?? '';
    return titleText.trim() || card.textContent?.trim() || '';
}

export class YoutubeImmersionFilter {
    private observer?: MutationObserver;
    private timer?: number;
    private bar?: HTMLElement;
    private revealed = false;

    constructor(private readonly options: { getSettings: () => ReaderSettings }) {}

    init(): void {
        if (!isYouTubeHost()) return;
        this.observer?.disconnect();
        this.observer = new MutationObserver(mutations => {
            if (mutations.some(mutationInsideReaderRoot)) return;
            this.schedule(350);
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('yt-navigate-finish', () => this.schedule(120));
        window.addEventListener('popstate', () => this.schedule(120));
        this.schedule(300);
    }

    refresh(): void {
        if (!isYouTubeHost()) return;
        if (!this.options.getSettings().youtubeImmersionEnabled) {
            this.clear();
            return;
        }
        this.schedule(80);
    }

    private schedule(delay: number): void {
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.scan(), delay);
    }

    private scan(): void {
        const settings = this.options.getSettings();
        if (!settings.youtubeImmersionEnabled) {
            this.clear();
            return;
        }

        let filteredCount = 0;
        let shownCount = 0;
        for (const card of collectYouTubeVideoCards()) {
            const text = readYouTubeCardText(card);
            if (!text) continue;

            const isJapanese = isProbablyJapaneseYouTubeText(text);
            if (!isJapanese) filteredCount += 1;
            if (isJapanese || this.revealed) {
                this.showCard(card);
                shownCount += 1;
            } else {
                this.hideCard(card);
            }
        }

        if (settings.youtubeShowFilterNotice) this.renderNotice(filteredCount, shownCount);
        else this.bar?.remove();
    }

    private hideCard(card: HTMLElement): void {
        card.classList.add('jpdb-youtube-filtered');
        card.dataset.yomuYoutubeFiltered = 'true';
    }

    private showCard(card: HTMLElement): void {
        card.classList.remove('jpdb-youtube-filtered');
        delete card.dataset.yomuYoutubeFiltered;
    }

    private renderNotice(filteredCount: number, shownCount: number): void {
        if (!filteredCount) {
            this.bar?.remove();
            this.bar = undefined;
            return;
        }

        if (!this.bar) {
            this.bar = document.createElement('div');
            this.bar.className = 'jpdb-youtube-filter-bar';
            this.bar.dataset.jpdbReaderRoot = 'true';
            const label = document.createElement('span');
            label.dataset.role = 'summary';
            const button = document.createElement('button');
            button.type = 'button';
            button.addEventListener('click', () => {
                this.revealed = !this.revealed;
                this.schedule(0);
            });
            this.bar.append(label, button);
            document.body.append(this.bar);
        }

        const summary = this.bar.querySelector<HTMLElement>('[data-role="summary"]');
        const button = this.bar.querySelector<HTMLButtonElement>('button');
        if (summary) {
            summary.textContent = this.revealed
                ? `${APP_NAME} is showing ${filteredCount} hidden YouTube item${filteredCount === 1 ? '' : 's'}`
                : `${APP_NAME} hid ${filteredCount} non-Japanese-looking YouTube item${filteredCount === 1 ? '' : 's'}`;
            summary.title = shownCount ? `${shownCount} Japanese-looking items stayed visible.` : '';
        }
        if (button) button.textContent = this.revealed ? 'Filter again' : 'Reveal';
    }

    private clear(): void {
        window.clearTimeout(this.timer);
        this.revealed = false;
        collectYouTubeVideoCards().forEach(card => this.showCard(card));
        document.querySelectorAll<HTMLElement>('[data-yomu-youtube-filtered="true"]').forEach(card => this.showCard(card));
        this.bar?.remove();
        this.bar = undefined;
    }
}

function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    const nodes = [mutation.target, ...Array.from(mutation.addedNodes)];
    return nodes.every(node => {
        const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
    });
}
