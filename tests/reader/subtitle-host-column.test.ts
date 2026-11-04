import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSubtitleVideoInsetAdapter } from '../../src/reader/subtitles/subtitle-video-inset';
import { attachVideo, createInstalledSubtitleController, openSingleCueTranscript, withViewport } from './subtitles-controller/fixtures';

const adapters: ReturnType<typeof createSubtitleVideoInsetAdapter>[] = [];

function inlineStyles(element: HTMLElement) {
    return Array.from(element.style).sort().map(property => [property,
        element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]);
}

afterEach(() => {
    for (const adapter of adapters.splice(0)) adapter.clear(document.querySelector('video') ?? undefined);
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

function hostColumnFixture() {
    const host = document.createElement('main');
    const frame = document.createElement('media-player');
    const video = document.createElement('video');
    const sidebar = document.createElement('aside');
    video.controls = true;
    frame.style.setProperty('width', '100%', 'important');
    frame.style.setProperty('max-width', '100%', 'important');
    frame.style.setProperty('height', 'auto', 'important');
    frame.style.setProperty('--host-player-setting', 'keep');
    video.style.setProperty('object-fit', 'cover', 'important');
    sidebar.style.cssText = 'position:fixed; right:0; width:400px; z-index:10';
    frame.append(video);
    host.append(frame, sidebar);
    document.body.append(host);
    let nativeRect = new DOMRect(8, 148, 1160, 652);
    const frameRect = () => new DOMRect(
        nativeRect.left + (Number.parseFloat(frame.style.marginLeft) || 0),
        nativeRect.top,
        frame.style.width.endsWith('px') ? Number.parseFloat(frame.style.width) : nativeRect.width,
        nativeRect.height,
    );
    vi.spyOn(frame, 'getBoundingClientRect').mockImplementation(frameRect);
    vi.spyOn(video, 'getBoundingClientRect').mockImplementation(frameRect);
    const adapter = createSubtitleVideoInsetAdapter();
    adapters.push(adapter);
    const apply = (side: 'left' | 'right', panelSize = 440, playerSize = 1100) => adapter.apply({
        video, side, panelSize, playerSize, margin: 10, videoRect: nativeRect, resizeEventMode: 'none',
    });
    return { frame, video, sidebar, adapter, apply, frameRect, resize: (rect: DOMRect) => { nativeRect = rect; } };
}

describe('generic subtitle docking within a host video column (mechanism fixture)', () => {
    it.each([
        { width: 900, placement: 'left' },
        { width: 700, placement: 'bottom' },
    ])('keeps the player minimum or uses a bottom drawer in a $width px native column', ({ width, placement }) => {
        withViewport(1600, 900, () => {
            const fixture = hostColumnFixture();
            fixture.resize(new DOMRect(8, 148, width, 506));
            const { controller } = createInstalledSubtitleController({
                subtitleTranscriptVisible: false, subtitleTranscriptPlacement: 'left',
            });
            try {
                attachVideo(controller, { video: fixture.video });
                openSingleCueTranscript(controller);
                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list');
                expect(panel?.dataset.transcriptPlacement).toBe(placement);
                expect(fixture.frameRect().right).toBeLessThanOrEqual(width + 8);
                expect(fixture.frameRect().width).toBeGreaterThanOrEqual(400);
            } finally {
                controller.destroy();
            }
        });
    });

    it('subtracts the left shift from the native column instead of extending under a host sidebar', () => {
        const fixture = hostColumnFixture();
        const hostStyle = fixture.sidebar.style.cssText;
        fixture.apply('left');
        expect(fixture.frameRect().left).toBe(460);
        expect(fixture.frameRect().right).toBe(1168);
        expect(fixture.frame.style.width).toBe('708px');
        expect(fixture.sidebar.style.cssText).toBe(hostStyle);

        fixture.apply('left', 540, 1000);
        expect(fixture.frameRect().left).toBe(560);
        expect(fixture.frameRect().right).toBe(1168);
        fixture.apply('right');
        expect(fixture.frameRect().left).toBe(8);
        expect(fixture.frameRect().right).toBeLessThanOrEqual(1168);
        expect(fixture.sidebar.style.cssText).toBe(hostStyle);
    });

    it('measures the host layout with its original inline values and priorities, then restores the active inset', () => {
        const fixture = hostColumnFixture();
        fixture.apply('left');
        const activeStyle = inlineStyles(fixture.frame);
        expect(() => fixture.adapter.measureWithoutInset(fixture.video, () => {
            expect(fixture.frame.style.width).toBe('100%');
            expect(fixture.frame.style.getPropertyPriority('width')).toBe('important');
            expect(fixture.video.style.objectFit).toBe('cover');
            expect(fixture.video.style.getPropertyPriority('object-fit')).toBe('important');
            throw new Error('measurement failed');
        })).toThrow('measurement failed');
        expect(inlineStyles(fixture.frame)).toEqual(activeStyle);
    });

    it('recomputes the column after a host resize even when the requested inset size is unchanged', () => {
        const fixture = hostColumnFixture();
        fixture.apply('left');
        fixture.resize(new DOMRect(8, 148, 900, 652));
        fixture.adapter.measureWithoutInset(fixture.video, fixture.frameRect);
        fixture.apply('left');
        expect(fixture.frameRect().right).toBe(908);
        expect(fixture.frame.style.width).toBe('448px');
        expect(fixture.frame.style.height).toBe('652px');
    });

    it('does not emit style mutations when an unchanged inset is reapplied', async () => {
        const fixture = hostColumnFixture();
        fixture.apply('left');
        const mutations = vi.fn();
        const observer = new MutationObserver(mutations);
        observer.observe(fixture.frame, { attributes: true, subtree: true, attributeFilter: ['style'] });
        try {
            for (let index = 0; index < 4; index += 1) expect(fixture.apply('left')).toBe(false);
            await Promise.resolve();
            expect(mutations).not.toHaveBeenCalled();
        } finally {
            observer.disconnect();
        }
    });

    it('restores host inline values and priorities when closing and reopening', () => {
        const fixture = hostColumnFixture();
        const frameStyle = fixture.frame.style.cssText;
        const videoStyle = fixture.video.style.cssText;
        for (const side of ['left', 'right'] as const) {
            fixture.apply(side);
            fixture.adapter.clear(fixture.video);
            expect(fixture.frame.style.cssText).toBe(frameStyle);
            expect(fixture.video.style.cssText).toBe(videoStyle);
        }
    });
});
