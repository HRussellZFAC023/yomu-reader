import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { popoverMaxHeightAtTop } from '../../src/reader/runtime/popover-body-stabilizer';

import {
    applyRedditOverlayScale,
    hasRedditOverlayScale,
    isInsideCompensatedRedditOverlay,
    isRedditHostname,
    rememberRedditSourceRect,
    redditLayoutPointToOverlay,
    redditLayoutRectToOverlay,
    redditOverlayViewport,
    redditOverlayViewportBottomInset,
    redditOverlayViewportBounds,
    redditPageScale,
    redditSourceRectToOverlay,
    type RedditOverlayEnvironment,
} from '../../src/reader/ui/reddit-overlay-scale';

const scaledReddit: RedditOverlayEnvironment = {
    hostname: 'www.reddit.com',
    appleTouch: true,
    innerWidth: 475,
    innerHeight: 612.5,
    outerWidth: 760,
};

describe('Reddit overlay scale isolation', () => {
    it('recognizes Reddit hosts without matching lookalikes', () => {
        expect(isRedditHostname('reddit.com')).toBe(true);
        expect(isRedditHostname('www.reddit.com')).toBe(true);
        expect(isRedditHostname('old.reddit.com.')).toBe(true);
        expect(isRedditHostname('reddit.com.example.test')).toBe(false);
    });

    it('derives Safari page scale from browser and layout widths', () => {
        expect(redditPageScale(scaledReddit)).toBeCloseTo(1.6);
        expect(redditPageScale({ ...scaledReddit, innerWidth: 730 })).toBe(1);
        expect(redditPageScale({ ...scaledReddit, innerWidth: 760 })).toBe(1);
    });

    it('rejects invalid metrics and caps implausibly large compensation', () => {
        expect(redditPageScale({ ...scaledReddit, innerWidth: 0 })).toBe(1);
        expect(redditPageScale({ ...scaledReddit, outerWidth: Number.NaN })).toBe(1);
        expect(redditPageScale({ ...scaledReddit, innerWidth: 100 })).toBe(3);
    });

    it('requires both Reddit and Apple touch browsing', () => {
        expect(redditPageScale({ ...scaledReddit, hostname: 'youtube.com' })).toBe(1);
        expect(redditPageScale({ ...scaledReddit, appleTouch: false })).toBe(1);
    });

    it('returns the screen-space viewport used by inverse-scaled controls', () => {
        expect(redditOverlayViewport(scaledReddit)).toEqual({
            width: 760,
            height: 980,
            pageScale: 1.6,
        });
        expect(redditOverlayViewport({ ...scaledReddit, outerWidth: 475 })).toEqual({
            width: 475,
            height: 612.5,
            pageScale: 1,
        });
    });

    it('uses the visible overlay bottom for locked popovers under the keyboard', () => {
        expect(popoverMaxHeightAtTop(
            { ...DEFAULT_SETTINGS, popoverHeightMode: 'available' },
            640,
            832,
        )).toBe(184);
    });

    it('scales visual viewport offsets and keyboard-constrained height into overlay space', () => {
        const visualViewport = {
            width: 475,
            height: 400,
            offsetLeft: 0,
            offsetTop: 120,
        };
        expect(redditOverlayViewportBounds(scaledReddit, visualViewport)).toEqual({
            left: 0,
            top: 192,
            right: 760,
            bottom: 832,
            width: 760,
            height: 640,
            pageScale: 1.6,
        });
        expect(redditOverlayViewportBottomInset(scaledReddit, visualViewport)).toBe(148);
    });

    it('converts layout pointer coordinates into compensated control space', () => {
        expect(redditLayoutPointToOverlay({ x: 237.5, y: 306.25 }, 1.6)).toEqual({
            x: 380,
            y: 490,
        });
        expect(redditLayoutPointToOverlay({ x: 237.5, y: 306.25 }, 1)).toEqual({
            x: 237.5,
            y: 306.25,
        });
    });

    it('normalizes host layout rects before overlay overlap calculations', () => {
        const scaled = redditLayoutRectToOverlay(new DOMRect(300, 400, 160, 120), 1.6);
        expect({
            left: scaled.left,
            top: scaled.top,
            right: scaled.right,
            bottom: scaled.bottom,
            width: scaled.width,
            height: scaled.height,
        }).toEqual({
            left: 480,
            top: 640,
            right: 736,
            bottom: 832,
            width: 256,
            height: 192,
        });

        const normal = redditLayoutRectToOverlay(new DOMRect(300, 400, 160, 120), 1);
        expect(normal.toJSON()).toMatchObject({ x: 300, y: 400, width: 160, height: 120 });
    });

    it('normalizes host anchor rects into overlay coordinates', () => {
        const hostAnchor = document.createElement('span');
        document.body.append(hostAnchor);
        const hostRect = redditSourceRectToOverlay(new DOMRect(200, 100, 40, 20), hostAnchor, 1.6);
        expect(hostRect.toJSON()).toMatchObject({ x: 320, y: 160, width: 64, height: 32 });

        hostAnchor.remove();
    });

    it('preserves compensated rects from WebKit versions that report overlay coordinates', () => {
        const { surface, nestedAnchor } = compensatedSurface(
            new DOMRect(100, 80, 520, 400),
            { width: 520, height: 400 },
        );
        expect(isInsideCompensatedRedditOverlay(nestedAnchor)).toBe(true);

        const nestedRect = redditSourceRectToOverlay(new DOMRect(320, 160, 64, 32), nestedAnchor, 1.6);
        expect(nestedRect.toJSON()).toMatchObject({ x: 320, y: 160, width: 64, height: 32 });
        surface.remove();
    });

    it('scales compensated rects from WebKit versions that report zoomed layout coordinates', () => {
        const { surface, nestedAnchor } = compensatedSurface(
            new DOMRect(100, 80, 325, 250),
            { width: 520, height: 400 },
        );
        expect(isInsideCompensatedRedditOverlay(nestedAnchor)).toBe(true);

        const nestedRect = redditSourceRectToOverlay(new DOMRect(200, 100, 40, 20), nestedAnchor, 1.6);
        expect(nestedRect.toJSON()).toMatchObject({ x: 320, y: 160, width: 64, height: 32 });
        surface.remove();
    });

    it('preserves zoomed-layout fallback rect provenance after its anchor detaches', () => {
        const { surface, nestedAnchor } = compensatedSurface(
            new DOMRect(100, 80, 325, 250),
            { width: 520, height: 400 },
        );
        const fallback = rememberRedditSourceRect(new DOMRect(256.25, 131.25, 31.25, 13.75), nestedAnchor, 1.6);
        surface.remove();
        const normalized = redditSourceRectToOverlay(fallback, undefined, 1.6);
        expect(normalized.toJSON()).toMatchObject({ x: 410, y: 210, width: 50, height: 22 });
    });

    it('scales an unmarked host fallback when its source is unavailable', () => {
        const normalized = redditSourceRectToOverlay(new DOMRect(120, 80, 30, 16), undefined, 1.6);
        expect(normalized.toJSON()).toMatchObject({ x: 192, y: 128, width: 48, height: 25.6 });
    });

    it('applies and stamps the inverse page scale with inline priority', () => {
        const { element, style } = overlayElement();
        applyRedditOverlayScale(element, scaledReddit);

        expect(style.setProperty).toHaveBeenCalledWith('zoom', '0.625', 'important');
        expect(style.removeProperty).not.toHaveBeenCalled();
        expect(element.dataset.jpdbReaderScaleAdapter).toBe('reddit-apple-touch-page-scale');
        expect(element.dataset.jpdbReaderPageScale).toBe('1.6');
        expect(element.dataset.jpdbReaderScaleCompensation).toBe('0.625');
    });

    it('removes compensation when a previously scaled viewport returns to normal', () => {
        const { element, style } = overlayElement();
        applyRedditOverlayScale(element, scaledReddit);
        applyRedditOverlayScale(element, { ...scaledReddit, outerWidth: 475 });

        expect(style.removeProperty).toHaveBeenCalledWith('zoom');
        expect(element.dataset.jpdbReaderScaleAdapter).toBeUndefined();
        expect(element.dataset.jpdbReaderPageScale).toBeUndefined();
        expect(element.dataset.jpdbReaderScaleCompensation).toBeUndefined();
    });

    it('identifies only surfaces owned by the Reddit scale adapter', () => {
        const surface = document.createElement('div');
        expect(hasRedditOverlayScale(surface)).toBe(false);
        surface.dataset.jpdbReaderScaleAdapter = 'reddit-apple-touch-page-scale';
        expect(hasRedditOverlayScale(surface)).toBe(true);
        surface.dataset.jpdbReaderScaleAdapter = 'some-other-adapter';
        expect(hasRedditOverlayScale(surface)).toBe(false);
    });

    it('does not alter styles it does not own on other sites', () => {
        const { element, style } = overlayElement();
        applyRedditOverlayScale(element, { ...scaledReddit, hostname: 'youtube.com' });

        expect(style.setProperty).not.toHaveBeenCalled();
        expect(style.removeProperty).not.toHaveBeenCalled();
        expect(element.dataset.jpdbReaderScaleAdapter).toBeUndefined();
    });
});

function overlayElement(): {
    element: HTMLElement;
    style: { setProperty: ReturnType<typeof vi.fn>; removeProperty: ReturnType<typeof vi.fn> };
} {
    const style = { setProperty: vi.fn(), removeProperty: vi.fn() };
    const element = { style, dataset: {} } as unknown as HTMLElement;
    return { element, style };
}

function compensatedSurface(
    rect: DOMRect,
    offsetSize: { width: number; height: number },
): { surface: HTMLElement; nestedAnchor: HTMLElement } {
    const surface = document.createElement('section');
    surface.dataset.jpdbReaderScaleAdapter = 'reddit-apple-touch-page-scale';
    surface.dataset.jpdbReaderScaleCompensation = '0.625';
    Object.defineProperties(surface, {
        offsetWidth: { configurable: true, value: offsetSize.width },
        offsetHeight: { configurable: true, value: offsetSize.height },
    });
    surface.getBoundingClientRect = () => rect;
    const nestedAnchor = document.createElement('button');
    surface.append(nestedAnchor);
    document.body.append(surface);
    return { surface, nestedAnchor };
}
