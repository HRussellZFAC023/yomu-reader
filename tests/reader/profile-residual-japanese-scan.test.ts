import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectScanTargets } from '../../src/reader/app/site-parsers';
import { collectFragmentTextTargetsIn } from '../../src/reader/dom/index';

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

    it('collects volatile subscriber rows as passive non-destructive targets instead of dropping them', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-watch-metadata>
                <div id="owner"><yt-formatted-string id="owner-sub-count">チャンネル登録者数 54.5万人</yt-formatted-string></div>
            </ytd-watch-metadata>
        `;
        const targets = collectScanTargets(60, 'https://m.youtube.com/watch?v=abc');
        const subCount = targets.find(target => target.text.includes('登録者数'));
        expect(subCount).toBeDefined();
        expect(subCount?.passiveInteraction).toBe(true);
        expect(subCount?.nonDestructive).toBe(true);
        // Collected by the profile pass itself, not the residual tail — the
        // residual pass starves behind big grids exactly where these rows live.
        expect((subCount as { parserId?: string } | undefined)?.parserId).not.toBe('residual-visible-japanese-parser');
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

    it('reserves coverage for visible text outside a dense site profile', () => {
        stubYouTube();
        const rooted = Array.from({ length: 190 }, (_, index) => `
            <ytd-comment-view-model><span id="content-text">日本語コメント${index}</span></ytd-comment-view-model>
        `).join('');
        document.body.innerHTML = `${rooted}<div class="unrooted-sort-menu" role="menu"><button role="menuitem">賛成票率順</button><button role="menuitem">新しい順</button></div>`;

        const targets = collectScanTargets(200, 'https://m.youtube.com/watch?v=abc');

        expect(targets.some(target => target.text.includes('賛成票率順'))).toBe(true);
        expect(targets.some(target => target.text.includes('新しい順'))).toBe(true);
    });

    it('collects short centered headings in non-destructive app panels without a site-specific parser', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-app>
                <ytd-engagement-panel-section-list-renderer>
                    <h2 style="text-align:center">この動画について質問する</h2>
                </ytd-engagement-panel-section-list-renderer>
            </ytd-app>
        `;

        const target = collectScanTargets(40, 'https://m.youtube.com/watch?v=abc')
            .find(candidate => candidate.text === 'この動画について質問する');

        expect(target).toBeDefined();
        expect(target).toMatchObject({ passiveInteraction: true, nonDestructive: true });
        expect((target as { parserId?: string } | undefined)?.parserId).toBe('residual-visible-japanese-parser');
    });

    it('reserves visible Reddit menu and timestamp chrome when a long prose feed fills the pass', () => {
        vi.stubGlobal('location', {
            href: 'https://www.reddit.com/r/singularity/',
            origin: 'https://www.reddit.com',
            hostname: 'www.reddit.com',
            pathname: '/r/singularity/',
        });
        const prose = Array.from({ length: 220 }, (_, index) => `<p class="comment-body">日本語の長いコメント本文${index}です。</p>`).join('');
        document.body.innerHTML = `<shreddit-app>${prose}<div role="menu"><button role="menuitem">注目順</button><button role="menuitem">賛成票数順</button></div><faceplate-timeago><time datetime="2026-07-12T12:00:00Z">2時間前</time></faceplate-timeago></shreddit-app>`;

        const targets = collectScanTargets(200, 'https://www.reddit.com/r/singularity/');

        expect(targets.some(target => target.text.includes('注目順'))).toBe(true);
        expect(targets.some(target => target.text.includes('賛成票数順'))).toBe(true);
        const timestamp = targets.find(target => target.text.includes('2時間前'));
        expect(timestamp).toBeDefined();
        expect(timestamp?.passiveInteraction).toBe(true);
    });

    it('walks visible descendants of zero-box web-component wrappers', () => {
        document.body.innerHTML = `
            <main>
                <community-highlight-carousel style="display: block">
                    <h3><span>コミュニティのハイライト</span></h3>
                </community-highlight-carousel>
            </main>
        `;
        const component = document.querySelector<HTMLElement>('community-highlight-carousel')!;
        component.getBoundingClientRect = () => ({
            top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}),
        } as DOMRect);

        const targets = collectFragmentTextTargetsIn(document.body, 20, true, '', {
            allowUiText: true,
            includeUiChrome: true,
            minLength: 1,
        });

        expect(targets.some(target => target.text.includes('コミュニティのハイライト'))).toBe(true);
    });

    it('does not revive horizontally virtualized descendants of zero-box wrappers', () => {
        document.body.innerHTML = `
            <main>
                <virtual-feed style="display: block">
                    <article>古いページの項目</article>
                </virtual-feed>
            </main>
        `;
        const feed = document.querySelector<HTMLElement>('virtual-feed')!;
        feed.getBoundingClientRect = () => ({
            top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}),
        } as DOMRect);
        const article = document.querySelector<HTMLElement>('article')!;
        article.getBoundingClientRect = () => ({
            top: 10, left: -20_000, right: -19_800, bottom: 40, width: 200, height: 30, x: -20_000, y: 10, toJSON: () => ({}),
        } as DOMRect);

        const targets = collectScanTargets(20, 'https://example.com/feed');

        expect(targets.some(target => target.text.includes('古いページの項目'))).toBe(false);
    });

    it('does not walk descendants of ordinary offscreen feed cards', () => {
        document.body.innerHTML = `
            <main>
                <article class="old-card"><span>古い日本語カード</span></article>
            </main>
        `;
        const card = document.querySelector<HTMLElement>('.old-card')!;
        card.getBoundingClientRect = () => ({
            top: 20_000, left: 10, right: 210, bottom: 20_030, width: 200, height: 30, x: 10, y: 20_000, toJSON: () => ({}),
        } as DOMRect);
        const child = card.querySelector<HTMLElement>('span')!;
        const childRect = vi.spyOn(child, 'getBoundingClientRect');

        const targets = collectFragmentTextTargetsIn(document.body, 20, true, '', {
            allowUiText: true,
            includeUiChrome: true,
            minLength: 1,
        });

        expect(targets.some(target => target.text.includes('古い日本語カード'))).toBe(false);
        expect(childRect).not.toHaveBeenCalled();
    });

    it('keeps uncovered inline siblings when a profile already owns part of their row', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-watch-metadata>
                <div class="slim-video-information-subtitle-container">
                    <span class="ytAttributedStringHost">公開情報</span>
                    <span>33万回視聴</span>
                    <span>1年前</span>
                </div>
            </ytd-watch-metadata>
        `;

        const targets = collectScanTargets(60, 'https://m.youtube.com/watch?v=abc');

        expect(targets.some(target => target.text.includes('公開情報'))).toBe(true);
        expect(targets.some(target => target.text.includes('33万回視聴'))).toBe(true);
        expect(targets.some(target => target.text.includes('1年前'))).toBe(true);
    });
});
