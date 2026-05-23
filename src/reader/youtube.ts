import { APP_NAME } from './constants';
import { HAS_JAPANESE } from './dom';
import { uiText } from './i18n';
import type { ReaderSettings } from './types';

const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$/i;
const VIDEO_CARD_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-rich-grid-media',
    'ytd-rich-shelf-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-compact-radio-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-reel-video-renderer',
    'ytd-playlist-renderer',
    'ytd-radio-renderer',
    'ytd-shelf-renderer',
    'yt-lockup-view-model',
    'ytm-rich-item-renderer',
    'ytm-compact-video-renderer',
    'ytm-video-card-renderer',
    'ytm-shorts-lockup-view-model',
].join(',');

const VIDEO_CARD_CLOSEST_SELECTOR = VIDEO_CARD_SELECTOR;

const TITLE_SELECTORS = [
    '#video-title',
    'a#video-title',
    'yt-formatted-string#video-title',
    'h3 a',
    'h3',
    '.yt-lockup-metadata-view-model-wiz__title',
    '.ytLockupMetadataViewModelTitle',
    '.ytLockupMetadataViewModelHeadingReset',
    '.media-item-headline',
    'a[href*="/watch"]',
    'a[href*="/shorts"]',
];

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
    const cards = new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>(VIDEO_CARD_SELECTOR).forEach(card => {
        if (!card.closest('[data-jpdb-reader-root]')) cards.add(card);
    });
    root.querySelectorAll<HTMLAnchorElement>('a[href*="/watch?v="], a[href^="/shorts/"], a[href*="youtube.com/shorts/"]').forEach(link => {
        const card = link.closest<HTMLElement>(VIDEO_CARD_CLOSEST_SELECTOR) ?? link.parentElement;
        if (card && !card.closest('[data-jpdb-reader-root]')) cards.add(card);
    });
    return [...cards].filter(card => card.isConnected);
}

export function readYouTubeCardText(card: HTMLElement): string {
    const title = TITLE_SELECTORS
        .map(selector => card.querySelector<HTMLElement>(selector))
        .find(Boolean);
    const titleText = [
        title?.getAttribute('title'),
        title?.getAttribute('aria-label'),
        title?.textContent,
    ].find(value => value?.trim()) ?? '';
    return titleText.trim() || card.textContent?.trim() || '';
}

export class YoutubeImmersionFilter {
    private observer?: MutationObserver;
    private events?: AbortController;
    private timer?: number;
    private bar?: HTMLElement;
    private revealed = false;

    constructor(private readonly options: {
        getSettings: () => ReaderSettings;
        setEnabled?: (enabled: boolean) => void;
        isActivePage?: () => boolean;
    }) {}

    init(): void {
        this.destroy();
        if (!this.isActivePage() || !document.body) return;
        if (!this.options.getSettings().youtubeImmersionEnabled) return;

        this.startWatching();
        this.schedule(300);
    }

    private startWatching(): void {
        if (this.observer || !document.body) return;
        this.events = new AbortController();
        this.observer = new MutationObserver(mutations => {
            if (mutations.every(mutationInsideReaderRoot)) return;
            this.schedule(350);
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('yt-navigate-finish', () => this.schedule(120), { signal: this.events.signal });
        window.addEventListener('popstate', () => this.schedule(120), { signal: this.events.signal });
    }

    refresh(): void {
        if (!this.isActivePage()) {
            this.destroy();
            return;
        }
        if (!this.options.getSettings().youtubeImmersionEnabled) {
            this.stopWatching();
            this.clear();
            return;
        }
        this.startWatching();
        this.schedule(0);
    }

    destroy(): void {
        this.stopWatching();
        this.clear();
    }

    private stopWatching(): void {
        this.events?.abort();
        this.events = undefined;
        this.observer?.disconnect();
        this.observer = undefined;
    }

    private isActivePage(): boolean {
        return this.options.isActivePage?.() ?? isYouTubeHost();
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

        if (settings.youtubeShowFilterNotice) {
            this.renderNotice(filteredCount, shownCount, settings);
        } else {
            this.bar?.remove();
            this.bar = undefined;
        }
    }

    private hideCard(card: HTMLElement): void {
        card.classList.add('jpdb-youtube-filtered');
        card.dataset.yomuYoutubeFiltered = 'true';
    }

    private showCard(card: HTMLElement): void {
        card.classList.remove('jpdb-youtube-filtered');
        delete card.dataset.yomuYoutubeFiltered;
    }

    private renderNotice(filteredCount: number, shownCount: number, settings: ReaderSettings): void {
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
            const actions = document.createElement('div');
            actions.className = 'jpdb-youtube-filter-actions';
            const showAnyway = document.createElement('button');
            showAnyway.type = 'button';
            showAnyway.dataset.action = 'show-anyway';
            const turnOff = document.createElement('button');
            turnOff.type = 'button';
            turnOff.dataset.action = 'turn-off';
            actions.append(showAnyway, turnOff);
            this.bar.addEventListener('click', event => {
                const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
                if (action === 'show-anyway') {
                    this.revealed = !this.revealed;
                    this.schedule(0);
                }
                if (action === 'turn-off') {
                    this.options.setEnabled?.(false);
                    if (!this.options.setEnabled) this.clear();
                }
            });
            this.bar.append(label, actions);
            document.body.append(this.bar);
        }

        const summary = this.bar.querySelector<HTMLElement>('[data-role="summary"]');
        const showAnyway = this.bar.querySelector<HTMLButtonElement>('[data-action="show-anyway"]');
        const turnOff = this.bar.querySelector<HTMLButtonElement>('[data-action="turn-off"]');
        if (summary) {
            const plural = filteredCount === 1 ? '' : 's';
            summary.textContent = this.revealed
                ? formatYoutubeText(uiText(settings.interfaceLanguage, 'youtubeFilterShowing'), { appName: APP_NAME, count: String(filteredCount), plural })
                : formatYoutubeText(uiText(settings.interfaceLanguage, 'youtubeFilterHid'), { appName: APP_NAME, count: String(filteredCount), plural });
            summary.title = shownCount
                ? formatYoutubeText(uiText(settings.interfaceLanguage, 'youtubeFilterVisible'), { count: String(shownCount) })
                : '';
        }
        if (showAnyway) showAnyway.textContent = this.revealed ? uiText(settings.interfaceLanguage, 'youtubeFilterAgain') : uiText(settings.interfaceLanguage, 'youtubeShowAnyway');
        if (turnOff) turnOff.textContent = uiText(settings.interfaceLanguage, 'youtubeTurnOff');
    }

    private clear(): void {
        window.clearTimeout(this.timer);
        this.timer = undefined;
        this.revealed = false;
        document.querySelectorAll<HTMLElement>('[data-yomu-youtube-filtered="true"], .jpdb-youtube-filtered').forEach(card => this.showCard(card));
        this.bar?.remove();
        this.bar = undefined;
    }
}

function formatYoutubeText(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_match: string, key: string) => values[key] ?? '');
}

function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    const nodes = [mutation.target, ...Array.from(mutation.addedNodes)];
    return nodes.every(node => {
        const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
    });
}
