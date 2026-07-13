import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectScanTargets } from '../../src/reader/app/site-parsers';

// Silent auto-scans skip hosts whose non-destructive mirror already renders
// the same text — without this, every scroll settle re-sent every annotated
// YouTube feed title to parse (the dominant scroll cost).
describe('mirrored host scan skip', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    function stubYouTube(): void {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/',
        });
    }

    function feedWithTitle(): HTMLElement {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 24,
            width: 320, height: 24, toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <ytd-rich-grid-renderer>
                <ytd-rich-item-renderer><div id="title-host">日本語のタイトルです</div></ytd-rich-item-renderer>
            </ytd-rich-grid-renderer>
        `;
        return document.getElementById('title-host') as HTMLElement;
    }

    function collectedTexts(options?: { skipMirroredHosts?: boolean }): string[] {
        return collectScanTargets(40, 'https://www.youtube.com/', options).map(target => target.text.trim());
    }

    it('collects an unmirrored host, then skips it once its mirror renders the same text', () => {
        stubYouTube();
        const host = feedWithTitle();
        expect(collectedTexts({ skipMirroredHosts: true })).toContain('日本語のタイトルです');

        const mirror = document.createElement('span');
        mirror.className = 'jpdb-reader-text-mirror';
        mirror.dataset.jpdbReaderTextMirror = 'true';
        mirror.dataset.sourceText = '日本語のタイトルです';
        mirror.innerHTML = '<span class="jpdb-reader-word">日本語</span>のタイトルです';
        host.append(mirror);

        expect(collectedTexts({ skipMirroredHosts: true })).not.toContain('日本語のタイトルです');
        // Explicit (non-silent) scans still re-collect mirrored hosts.
        expect(collectedTexts()).toContain('日本語のタイトルです');
    });

    it('keeps collecting when the mirror was rendered for different text', () => {
        stubYouTube();
        const host = feedWithTitle();
        const mirror = document.createElement('span');
        mirror.className = 'jpdb-reader-text-mirror';
        mirror.dataset.jpdbReaderTextMirror = 'true';
        mirror.dataset.sourceText = '古いタイトル';
        host.append(mirror);

        expect(collectedTexts({ skipMirroredHosts: true })).toContain('日本語のタイトルです');
    });

    it('keeps collecting when a framework replaced the mirror annotation children', () => {
        stubYouTube();
        const host = feedWithTitle();
        const mirror = document.createElement('span');
        mirror.className = 'jpdb-reader-text-mirror';
        mirror.dataset.jpdbReaderTextMirror = 'true';
        mirror.dataset.sourceText = '日本語のタイトルです';
        mirror.textContent = '日本語のタイトルです';
        host.append(mirror);

        expect(collectedTexts({ skipMirroredHosts: true })).toContain('日本語のタイトルです');
    });
});
