import { currentFullscreenElement } from '../core/fullscreen';
import { isYouTubePage } from './subtitle-youtube';
import { subtitleVideoLayoutTarget } from './subtitle-video-inset';

// The set of hosts that YouTube (desktop + mobile) promotes for its inline/CSS
// "fake" fullscreen, plus Yomu's own inline-fullscreen marker. Shared with the
// controller's mutation observer, which watches these same shells for swaps.
const YOUTUBE_FULLSCREEN_HOST_SELECTOR = [
    '[data-yomu-inline-fullscreen="true"]',
    '.html5-video-player.ytp-fullscreen',
    '.html5-video-player.fullscreen',
    '#movie_player.ytp-fullscreen',
    '#movie_player.fullscreen',
    'ytd-watch-flexy[fullscreen] #movie_player',
    'ytd-watch-flexy[fullscreen] ytd-player',
    'ytm-player[fullscreen]',
    'ytm-player.fullscreen',
    'ytm-player.ytp-fullscreen',
].join(',');

// Bounds how long a cached "not fullscreen" verdict is trusted without any
// invalidating signal (belt-and-braces for a missed mutation/fullscreen event).
const FULLSCREEN_HOST_NULL_CACHE_TTL_MS = 3000;

function elementContainsVideo(element: HTMLElement | null | undefined, video: HTMLVideoElement | undefined): element is HTMLElement {
    return Boolean(element && video && (element === video || element.contains(video)));
}

function youtubeFullscreenHostForVideo(video: HTMLVideoElement | undefined): HTMLElement | null {
    if (!isYouTubePage()) return null;
    const scopedHost = video?.closest<HTMLElement>(YOUTUBE_FULLSCREEN_HOST_SELECTOR);
    if (scopedHost) return scopedHost;

    return Array.from(document.querySelectorAll<HTMLElement>(YOUTUBE_FULLSCREEN_HOST_SELECTOR))
        .find(element => elementContainsVideo(element, video)
            || isYouTubeMobileFullscreenHost(element)
            || isVisibleYouTubeFullscreenHost(element)) ?? null;
}

export function isMobileYouTubePage(): boolean {
    return /^m\.youtube\.com$/i.test(location.hostname);
}

// A fullscreen-host shell can be inserted/removed ALREADY MARKED (e.g.
// m.youtube swapping in a <ytm-player fullscreen> that never contains the
// video), which is a childList-only mutation: no attribute change fires and
// video discovery ignores a videoless shell, so the host cache would stay
// stale without this candidate check on the mutation roots.
export function mutationSwapsFullscreenHostCandidate(mutation: MutationRecord): boolean {
    for (const nodes of [mutation.addedNodes, mutation.removedNodes]) {
        for (const node of nodes) {
            if (node instanceof HTMLElement && node.matches(YOUTUBE_FULLSCREEN_HOST_SELECTOR)) return true;
        }
    }
    return false;
}

function isYouTubeMobileFullscreenHost(element: HTMLElement | null | undefined): element is HTMLElement {
    return Boolean(element
        && isMobileYouTubePage()
        && element.matches('ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen'));
}

function isVisibleYouTubeFullscreenHost(element: HTMLElement | null | undefined): element is HTMLElement {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    return rect.width >= viewportWidth / 2
        && rect.height >= viewportHeight / 2
        && rect.left <= viewportWidth / 4
        && rect.top <= viewportHeight / 4
        && Boolean(element.querySelector('video'));
}

// Everything the fullscreen-host collaborator reads back off the controller,
// made explicit: the bound video (host detection is video-relative) and the
// reader root + transcript panel whose top-layer ancestry it owns.
export interface SubtitleFullscreenHostDeps {
    getVideo(): HTMLVideoElement | undefined;
    getRoot(): HTMLElement | undefined;
    getTranscriptPanel(): HTMLElement | undefined;
}

// Fullscreen host resolution extracted from the controller. CSS/inline hosts
// are geometry signals only; they are not browser top-layer boundaries. DOM
// reparenting is reserved for a real element-fullscreen ancestor, because
// moving controls into YouTube's simulated player subtree makes YouTube treat
// Yomu focus as native-player focus and prevents its chrome from auto-hiding.
export class SubtitleFullscreenHost {
    // Event-driven cache for the inline/CSS fullscreen host queries; undefined
    // means dirty (recompute on next read). See queriedFullscreenHost.
    hostQuery?: { host: HTMLElement | null; at: number };

    constructor(private readonly deps: SubtitleFullscreenHostDeps) {}

    private get video(): HTMLVideoElement | undefined {
        return this.deps.getVideo();
    }

    subtitleFullscreenHost(fullscreenElement: Element | null = currentFullscreenElement()): HTMLElement | null {
        if (this.shouldHostSubtitleRootInFullscreenElement(fullscreenElement)) return fullscreenElement;
        const queriedHost = this.queriedFullscreenHost();
        if (queriedHost) return queriedHost;
        if (fullscreenElement instanceof HTMLVideoElement && fullscreenElement === this.video) {
            const target = subtitleVideoLayoutTarget(this.video);
            return target && target !== this.video ? target : null;
        }
        return null;
    }

    // The inline/CSS fullscreen host is read on every geometry sample (120ms
    // frame sampler + 500ms tick via videoLayoutRect), and computing it walks
    // document.querySelectorAll over the 10-selector fullscreen-host list —
    // ~1.4% of a core on a YouTube watch page while NOT fullscreen (profiled).
    // Fullscreen state only changes on discrete signals, so keep the result as
    // event-driven cached state: invalidated on fullscreenchange events, the
    // fullscreen-affecting attribute mutations the body observer already
    // filters for (ytp-fullscreen classes, [fullscreen], the inline-fullscreen
    // marker), SPA navigation, and video rebinds. A cached non-null host is
    // revalidated per read with a cheap matches() so a missed signal degrades
    // to a recompute, never to a stale host.
    queriedFullscreenHost(): HTMLElement | null {
        const cached = this.hostQuery;
        if (cached) {
            // A cached null is only trusted within its TTL: candidate-aware
            // childList invalidation covers marked-shell swaps, and the TTL is
            // the belt-and-braces bound for any signal this misses.
            if (cached.host === null && performance.now() - cached.at < FULLSCREEN_HOST_NULL_CACHE_TTL_MS) return null;
            if (cached.host && this.isStillLiveFullscreenHost(cached.host)) return cached.host;
        }
        const host = this.inlineFullscreenHostForVideo() ?? youtubeFullscreenHostForVideo(this.video);
        this.hostQuery = { host, at: performance.now() };
        return host;
    }

    // Revalidate the SEMANTIC selection condition a fresh query would apply
    // (video containment, the m.youtube shell predicate, or the visibility
    // fallback) — mere selector membership could retain a hidden
    // wrong-but-matching host after a style-only visibility handoff.
    private isStillLiveFullscreenHost(host: HTMLElement): boolean {
        if (!host.isConnected || !host.matches(YOUTUBE_FULLSCREEN_HOST_SELECTOR)) return false;
        return elementContainsVideo(host, this.video)
            || isYouTubeMobileFullscreenHost(host)
            || isVisibleYouTubeFullscreenHost(host);
    }

    invalidateHostCache(): void {
        this.hostQuery = undefined;
    }

    shouldHostSubtitleRootInFullscreenElement(fullscreenElement: Element | null): fullscreenElement is HTMLElement {
        return Boolean(fullscreenElement instanceof HTMLElement
            && !(fullscreenElement instanceof HTMLVideoElement)
            && this.video
            && fullscreenElement.contains(this.video));
    }

    private inlineFullscreenHostForVideo(): HTMLElement | null {
        const host = this.video?.closest<HTMLElement>('[data-yomu-inline-fullscreen="true"]')
            ?? document.querySelector<HTMLElement>('[data-yomu-inline-fullscreen="true"]');
        return host && (!this.video || host.contains(this.video) || isYouTubeMobileFullscreenHost(host))
            ? host
            : null;
    }

    syncSubtitleRootParent(fullscreenElement: Element | null = currentFullscreenElement()): void {
        const root = this.deps.getRoot();
        if (!root) return;
        // When the entire document is the fullscreen element (YouTube's desktop
        // fullscreen promotes <html> to the top layer) reader roots already
        // render inside it through <body>; appending a <div> directly under
        // <html> is unnecessary and a non-standard place for it, so keep it in
        // <body>.
        const parent = this.fullscreenReaderRootParent(fullscreenElement);
        if (root.parentElement !== parent) parent.appendChild(root);
        const transcriptPanel = this.deps.getTranscriptPanel();
        if (transcriptPanel && transcriptPanel.parentElement !== parent) parent.appendChild(transcriptPanel);
    }

    private fullscreenReaderRootParent(fullscreenElement: Element | null): HTMLElement {
        return !this.shouldHostSubtitleRootInFullscreenElement(fullscreenElement)
            || fullscreenElement === document.documentElement
            ? (document.body ?? document.documentElement)
            : fullscreenElement;
    }
}
