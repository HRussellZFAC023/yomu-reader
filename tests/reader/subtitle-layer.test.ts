import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubtitleLayer } from '../../src/reader/subtitles/subtitle-layer';

const layer = new SubtitleLayer();
afterEach(() => { layer.release(); document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('caption stacking ownership', () => {
    it('confines captions to the player below external dialogs, and derives the chrome tier', () => {
        vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=test'));
        document.body.innerHTML = '<div id="movie_player" style="position:relative"><video></video><div class="ytp-chrome-bottom" style="z-index:60"></div><div class="ytp-settings-menu" style="z-index:71"></div></div><div role="dialog"></div>';
        const player = document.querySelector<HTMLElement>('#movie_player')!;
        const video = document.querySelector('video')!;
        const root = document.createElement('div');
        layer.sync(root, video, document.body);
        expect(root.parentElement).toBe(player);
        expect(player.classList.contains('jpdb-subtitle-layer-host')).toBe(true);
        expect(root.style.getPropertyValue('--subtitle-layer')).toBe('61');
        expect(root.nextElementSibling?.className).toBe('ytp-settings-menu');
        root.innerHTML = '<div class="jpdb-subtitle-primary-row"><button>Move</button></div>';
        const row = root.firstElementChild!;
        vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 50, 500, 300));
        const rowRect = vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(30, 340, 280, 70));
        const button = root.querySelector('button')!;
        button.focus();
        expect(layer.sync(root, video, document.body)).toBe(true);
        expect(root.parentElement).toBe(document.body);
        expect(document.activeElement).toBe(button);
        expect(player.classList.contains('jpdb-subtitle-layer-host')).toBe(false);
        rowRect.mockReturnValue(new DOMRect());
        expect(layer.sync(root, video, document.body)).toBe(false);
        expect(root.parentElement).toBe(document.body);
        rowRect.mockReturnValue(new DOMRect(30, 180, 280, 70));
        button.blur();
        layer.sync(root, video, document.body);
        expect(root.parentElement).toBe(player);
    });

    it('adopts native stacking and positioning when the site stylesheet arrives after mounting', () => {
        vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=test'));
        document.body.innerHTML = '<div id="movie_player" style="position:static"><video></video><div class="ytp-chrome-bottom"></div></div>';
        const player = document.querySelector<HTMLElement>('#movie_player')!;
        const root = document.createElement('div');
        const video = document.querySelector('video')!;
        layer.sync(root, video, document.body);
        expect(root.classList.contains('jpdb-subtitle-layer-local')).toBe(false);
        expect(root.style.getPropertyValue('--subtitle-layer')).toBe('1');
        player.style.position = 'relative';
        (player.querySelector('.ytp-chrome-bottom') as HTMLElement).style.zIndex = '59';
        expect(layer.sync(root, video, document.body)).toBe(true);
        expect(root.classList.contains('jpdb-subtitle-layer-local')).toBe(true);
        expect(root.style.getPropertyValue('--subtitle-layer')).toBe('60');
        expect(layer.sync(root, video, document.body)).toBe(false);
    });

    it('uses the generic video frame and releases it on a video swap', () => {
        document.body.innerHTML = '<section><video></video></section><section><video></video></section>';
        const videos = document.querySelectorAll('video');
        const root = document.createElement('div');
        layer.sync(root, videos[0], document.body);
        layer.sync(root, videos[1], document.body);
        expect(root.parentElement).toBe(videos[1].parentElement);
        expect(videos[0].parentElement?.className).toBe('');
        layer.release();
        expect(videos[1].parentElement?.className).toBe('');
    });
    it('converts viewport geometry into a scaled player without zero-size divisions', () => {
        document.body.innerHTML = '<section style="position:relative"><video></video></section>';
        const player = document.querySelector('section')!;
        const root = document.createElement('div');
        layer.sync(root, document.querySelector('video')!, document.body);
        expect(layer.layout(new DOMRect(10, 20, 500, 300)).width).toBe(500);
        Object.defineProperties(player, { offsetWidth:{value:500}, offsetHeight:{value:300} });
        vi.spyOn(player, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 40, 1000, 600));
        const rect = layer.layout(new DOMRect(40, 80, 800, 400));
        expect([rect.left, rect.top, rect.width, rect.height]).toEqual([10, 20, 400, 200]);
    });

});
