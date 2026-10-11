import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { isDirectTrustedReaderInteraction } from '../ui/trusted-interaction';
import type { YouTubeFilterDecision } from './youtube-filter-scan';

export const YOUTUBE_CONTINUATION_MARKER_SELECTOR = 'ytd-continuation-item-renderer,ytm-continuation-item-renderer';
const MARKER_SELECTOR = YOUTUBE_CONTINUATION_MARKER_SELECTOR;
const VIDEO_LIST_SELECTOR = 'ytd-rich-grid-renderer,ytd-watch-next-secondary-results-renderer,ytd-watch-flexy #secondary,ytm-item-section-renderer';
const NON_VIDEO_LIST_SELECTOR = 'ytd-comments,ytm-comments,ytd-live-chat-frame,yt-live-chat-item-list-renderer';
const PAUSED_CLASS = 'jpdb-youtube-continuation-paused';
const STALE_CLASS = 'jpdb-youtube-continuation-stale';
const AUTOMATIC_PAGE_LIMIT = 2;
const LOADER_DEADLINE_MS = 8000;

interface ContinuationList {
    root: HTMLElement;
    marker: HTMLElement;
    pages: number;
    paused: boolean;
    language: InterfaceLanguage;
    button?: HTMLButtonElement;
    timeout?: number;
}

/** Filtering can keep YouTube's native sentinel in view indefinitely. Keep
 * its normal first batches, then require a real gesture to continue. Native
 * YouTube still owns the requests and response DOM. */
export class YouTubeContinuationGuard {
    private readonly lists = new Map<HTMLElement, ContinuationList>();
    private readonly stale = new Set<HTMLElement>();
    private observer?: IntersectionObserver;
    private route = '';

    sync(decisions: YouTubeFilterDecision[], revealed: boolean, language: InterfaceLanguage, route: string): void {
        if (route !== this.route || revealed) this.clear();
        this.route = route;
        if (revealed) return;
        const live = new Set<HTMLElement>();
        const terminals = new Map<HTMLElement, HTMLElement>();
        const cardsByRoot = new Map<HTMLElement, YouTubeFilterDecision[]>();
        const stale = new Set<HTMLElement>();
        for (const marker of document.querySelectorAll<HTMLElement>(MARKER_SELECTOR)) {
            const root = continuationVideoList(marker);
            if (!root) continue;
            let cards = cardsByRoot.get(root);
            if (!cards) {
                cards = decisions.filter(decision => root.contains(decision.candidate.card));
                cardsByRoot.set(root, cards);
            }
            if (!cards.some(decision => decision.kind === 'hide')) continue;
            if (markerHasFollowingCard(marker, cards)) {
                stale.add(marker);
                continue;
            }
            live.add(root);
            terminals.set(root, marker);
        }
        for (const [root, marker] of terminals) this.syncList(root, marker, language);
        for (const [root, list] of this.lists) {
            if (!live.has(root)) this.releaseList(list);
        }
        for (const marker of this.stale) {
            if (!stale.has(marker)) marker.classList.remove(STALE_CLASS);
        }
        for (const marker of stale) marker.classList.add(STALE_CLASS);
        this.stale.clear();
        for (const marker of stale) this.stale.add(marker);
    }

    /** Runs in the mutation microtask, before native IntersectionObserver can
     * request another page from a newly appended sentinel. */
    holdAddedMarkers(): void {
        for (const list of this.lists.values()) {
            const markers = [...list.root.querySelectorAll<HTMLElement>(MARKER_SELECTOR)]
                .filter(marker => continuationVideoList(marker) === list.root);
            const terminal = markers.at(-1);
            // Count replacements before the debounced card scan. A fast native
            // response can otherwise mount several sentinels within one scan.
            if (terminal && terminal !== list.marker) this.syncList(list.root, terminal, list.language);
            if (list.paused) markers.forEach(marker => marker.classList.add(PAUSED_CLASS));
        }
    }

    clear(): void {
        for (const list of this.lists.values()) this.releaseList(list);
        this.observer?.disconnect();
        this.observer = undefined;
        for (const marker of this.stale) marker.classList.remove(STALE_CLASS);
        this.stale.clear();
        this.route = '';
    }

    private syncList(root: HTMLElement, marker: HTMLElement, language: InterfaceLanguage): void {
        let list = this.lists.get(root);
        if (!list) {
            list = { root, marker, pages: 0, paused: false, language };
            this.lists.set(root, list);
            this.observe(marker);
        } else if (list.marker !== marker) {
            this.observer?.unobserve(list.marker);
            list.marker.classList.remove(PAUSED_CLASS);
            window.clearTimeout(list.timeout);
            list.timeout = undefined;
            list.marker = marker;
            list.pages += 1;
            this.observe(marker);
        }
        list.language = language;
        if (list.pages >= AUTOMATIC_PAGE_LIMIT || list.paused) this.pause(list);
        if (list.button) list.button.textContent = uiText(language, 'youtubeLoadMore');
    }

    private observe(marker: HTMLElement): void {
        if (typeof IntersectionObserver === 'undefined') return;
        this.observer ??= new IntersectionObserver(entries => {
            for (const entry of entries) {
                const list = [...this.lists.values()].find(candidate => candidate.marker === entry.target);
                if (!list || list.paused) continue;
                window.clearTimeout(list.timeout);
                list.timeout = undefined;
                if (!entry.isIntersecting || entry.boundingClientRect.width <= 0 || entry.boundingClientRect.height <= 0) continue;
                list.timeout = window.setTimeout(() => this.pause(list), LOADER_DEADLINE_MS);
            }
        });
        this.observer.observe(marker);
    }

    private pause(list: ContinuationList): void {
        if (!list.marker.isConnected) return;
        window.clearTimeout(list.timeout);
        list.timeout = undefined;
        list.paused = true;
        list.marker.classList.add(PAUSED_CLASS);
        if (!list.button) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'jpdb-youtube-load-more';
            button.setAttribute('data-jpdb-reader-root', 'youtube-continuation');
            button.textContent = uiText(list.language, 'youtubeLoadMore');
            button.addEventListener('click', event => {
                if (!isDirectTrustedReaderInteraction(event)) return;
                if (this.lists.get(list.root) !== list) return;
                list.pages = 0;
                list.paused = false;
                list.root.querySelectorAll<HTMLElement>(`.${PAUSED_CLASS}`).forEach(marker => marker.classList.remove(PAUSED_CLASS));
                list.button?.remove();
                list.button = undefined;
                this.observer?.unobserve(list.marker);
                this.observe(list.marker);
            });
            list.button = button;
        }
        if (list.marker.parentElement && list.button.nextElementSibling !== list.marker) {
            list.marker.before(list.button);
        }
    }

    private releaseList(list: ContinuationList): void {
        window.clearTimeout(list.timeout);
        this.observer?.unobserve(list.marker);
        list.marker.classList.remove(PAUSED_CLASS);
        list.button?.remove();
        list.root.querySelectorAll<HTMLElement>(`.${PAUSED_CLASS}`).forEach(marker => marker.classList.remove(PAUSED_CLASS));
        this.lists.delete(list.root);
    }
}

function continuationVideoList(marker: HTMLElement): HTMLElement | null {
    if (marker.closest(NON_VIDEO_LIST_SELECTOR)) return null;
    const root = marker.closest<HTMLElement>(VIDEO_LIST_SELECTOR);
    return marker.closest('[hidden]') ? null : root;
}

function markerHasFollowingCard(marker: HTMLElement, decisions: YouTubeFilterDecision[]): boolean {
    const parent = marker.parentElement;
    return decisions.some(({ candidate }) => parent?.contains(candidate.card)
        && Boolean(marker.compareDocumentPosition(candidate.card) & Node.DOCUMENT_POSITION_FOLLOWING));
}
