import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectScanTargets } from '../../src/reader/app/site-parsers';

// Profile roots are curated, not exhaustive: visible Japanese outside every
// root (e.g. a mobile watch-metadata row the selectors never named) must still
// be collected by the residual pass as a passive, non-destructive target so no
// site leaves text bare.
describe('profile-site residual visible Japanese scan', () => {
    let restoreRect: (() => void) | undefined;

    beforeEach(() => {
        const original = HTMLElement.prototype.getBoundingClientRect;
        HTMLElement.prototype.getBoundingClientRect = function () {
            return { top: 10, left: 10, right: 210, bottom: 40, width: 200, height: 30, x: 10, y: 10, toJSON: () => ({}) } as DOMRect;
        };
        restoreRect = () => { HTMLElement.prototype.getBoundingClientRect = original; };
    });

    afterEach(() => {
        restoreRect?.();
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    function stubYouTube(): void {
        vi.stubGlobal('location', {
            href: 'https://m.youtube.com/watch?v=abc',
            origin: 'https://m.youtube.com',
            hostname: 'm.youtube.com',
            pathname: '/watch',
        });
    }

    it('collects unrooted Japanese text on a profile site as a passive non-destructive target', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-watch-metadata><h1>動画のタイトル</h1></ytd-watch-metadata>
            <div class="totally-unrooted-metadata-row">32万回視聴・4日前 もっと見る</div>
        `;
        const targets = collectScanTargets(60, 'https://m.youtube.com/watch?v=abc');
        const residual = targets.find(target => target.text.includes('32万回視聴'));
        expect(residual).toBeDefined();
        expect(residual?.passiveInteraction).toBe(true);
        expect(residual?.nonDestructive).toBe(true);
    });

    it('still collects the rooted metadata first', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytm-slim-video-metadata-section-renderer>
                <h2>タイトル行</h2>
                <span class="view-count-line">32万回視聴・4日前</span>
            </ytm-slim-video-metadata-section-renderer>
        `;
        const texts = collectScanTargets(60, 'https://m.youtube.com/watch?v=abc').map(target => target.text.trim());
        expect(texts.join(' ')).toContain('32万回視聴');
        expect(texts.join(' ')).toContain('タイトル行');
    });
});
