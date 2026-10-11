import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YouTubeContinuationGuard } from '../../src/reader/subtitles/youtube-continuation';
import { classifyYouTubeFilterCandidates, type YouTubeFilterDecision } from '../../src/reader/subtitles/youtube-filter-scan';
import { allowSyntheticReaderInteractionsForTests } from '../../src/reader/ui/trusted-interaction';

let intersection: IntersectionObserverCallback;
let guard: YouTubeContinuationGuard;

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', class {
        constructor(callback: IntersectionObserverCallback) { intersection = callback; }
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
    });
    document.body.innerHTML = '<ytd-watch-flexy><div id="secondary"><ytd-watch-next-secondary-results-renderer><div id="contents"></div></ytd-watch-next-secondary-results-renderer></div></ytd-watch-flexy>';
    guard = new YouTubeContinuationGuard();
});

afterEach(() => {
    guard.clear();
    allowSyntheticReaderInteractionsForTests(false);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

function page(title = 'English tech video'): HTMLElement {
    const list = document.querySelector('#contents')!;
    list.querySelector('ytd-continuation-item-renderer')?.remove();
    const card = document.createElement('ytd-compact-video-renderer');
    card.textContent = title;
    list.append(card);
    const marker = document.createElement('ytd-continuation-item-renderer');
    marker.innerHTML = '<tp-yt-paper-spinner active></tp-yt-paper-spinner>';
    list.append(marker);
    return marker;
}

function decisions(): YouTubeFilterDecision[] {
    return classifyYouTubeFilterCandidates([...document.querySelectorAll<HTMLElement>('ytd-compact-video-renderer')].map(card => ({
        card, title: card.textContent!, filterText: card.textContent!, videoId: '', alwaysHidden: false,
    })), { revealed: false }).decisions;
}

function sync(revealed = false, route = '/watch?v=first', language: 'en' | 'ja' = 'en'): void {
    guard.sync(decisions(), revealed, language, route);
}

function intersect(marker: HTMLElement, visible = true): void {
    const rect = new DOMRect(0, 200, 360, 40);
    intersection([{
        target: marker, isIntersecting: visible, boundingClientRect: rect,
        intersectionRatio: visible ? 1 : 0, intersectionRect: visible ? rect : new DOMRect(),
        rootBounds: new DOMRect(0, 0, 1024, 768), time: performance.now(),
    }], {} as IntersectionObserver);
}

describe('filtered YouTube continuations', () => {
    it('bounds native replacement batches and parks new sentinels before the next scan', () => {
        page(); sync();
        page(); sync();
        const marker = page(); sync();
        expect(marker.classList.contains('jpdb-youtube-continuation-paused')).toBe(true);
        expect(document.querySelectorAll('.jpdb-youtube-load-more')).toHaveLength(1);
        const replacement = page();
        guard.holdAddedMarkers();
        expect(replacement.classList.contains('jpdb-youtube-continuation-paused')).toBe(true);
        sync();
        expect(document.querySelectorAll('.jpdb-youtube-load-more')).toHaveLength(1);
    });

    it('settles a visible loader that never finishes without hiding its videos', async () => {
        const marker = page(); sync(false, '/watch?v=first', 'ja');
        intersect(marker);
        await vi.advanceTimersByTimeAsync(8000);
        expect(document.querySelector('.jpdb-youtube-load-more')?.textContent).toBe('もっと読み込む');
        expect(marker.classList.contains('jpdb-youtube-continuation-paused')).toBe(true);
        expect(document.querySelector('ytd-compact-video-renderer')?.textContent).toBe('English tech video');
    });

    it('does not time out an offscreen loader', async () => {
        const marker = page(); sync();
        intersect(marker, false);
        await vi.advanceTimersByTimeAsync(20000);
        expect(marker.classList.contains('jpdb-youtube-continuation-paused')).toBe(false);
    });

    it('resumes native loading only for a user gesture and retains filtering', async () => {
        allowSyntheticReaderInteractionsForTests(false);
        const marker = page(); sync(); intersect(marker);
        await vi.advanceTimersByTimeAsync(8000);
        const button = document.querySelector<HTMLButtonElement>('.jpdb-youtube-load-more')!;
        button.click();
        expect(marker.classList.contains('jpdb-youtube-continuation-paused')).toBe(true);
        allowSyntheticReaderInteractionsForTests(true);
        button.click();
        expect(marker.classList.contains('jpdb-youtube-continuation-paused')).toBe(false);
        expect(document.querySelector('.jpdb-youtube-load-more')).toBeNull();
        expect(decisions()[0]?.kind).toBe('hide');
    });

    it('collapses served markers between videos, and restores one moved to the end', () => {
        const oldMarker = page();
        const nextCard = document.createElement('ytd-compact-video-renderer');
        nextCard.textContent = '日本語の会話';
        oldMarker.after(nextCard);
        sync();
        expect(oldMarker.classList.contains('jpdb-youtube-continuation-stale')).toBe(true);
        nextCard.after(oldMarker);
        sync();
        expect(oldMarker.classList.contains('jpdb-youtube-continuation-stale')).toBe(false);
    });

    it('keeps comments, inactive pages and unfiltered lists under native control', async () => {
        const marker = page('日本語の会話'); sync();
        expect(document.querySelector('.jpdb-youtube-load-more')).toBeNull();
        const comments = document.createElement('ytd-comments');
        comments.innerHTML = '<ytd-continuation-item-renderer></ytd-continuation-item-renderer>';
        document.querySelector('#contents')!.append(comments);
        sync();
        await vi.advanceTimersByTimeAsync(20000);
        expect(marker.classList.contains('jpdb-youtube-continuation-paused')).toBe(false);
        expect(comments.querySelector('ytd-continuation-item-renderer')?.className).toBe('');
    });

    it('never claims loaders in a hidden SPA branch inside an active video list', async () => {
        page(); sync();
        const branch = document.createElement('div');
        branch.hidden = true;
        branch.innerHTML = '<ytd-continuation-item-renderer id="inactive"></ytd-continuation-item-renderer>';
        document.querySelector('#contents')!.append(branch);
        guard.holdAddedMarkers(); sync();
        await vi.advanceTimersByTimeAsync(20000);
        expect(branch.querySelector('#inactive')?.className).toBe('');
        expect(document.querySelector('.jpdb-youtube-load-more')).toBeNull();
    });

    it('clears every owned class, button and timer on reveal, navigation and shutdown', async () => {
        for (const action of [() => sync(true), () => sync(false, '/watch?v=second'), () => guard.clear()]) {
            const marker = page(); sync(); intersect(marker);
            await vi.advanceTimersByTimeAsync(8000);
            action();
            expect(marker.classList.contains('jpdb-youtube-continuation-paused')).toBe(false);
            expect(document.querySelector('.jpdb-youtube-load-more')).toBeNull();
            await vi.advanceTimersByTimeAsync(20000);
            expect(document.querySelector('.jpdb-youtube-load-more')).toBeNull();
            guard.clear();
        }
    });
});
