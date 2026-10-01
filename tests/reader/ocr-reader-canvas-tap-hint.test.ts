import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReaderCanvasTapHint } from '../../src/reader/ocr/reader-canvas-tap-hint';
import { testEnSettings } from './helpers/settings-fixture';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

// The reader's own GM storage: the userscript manager's (or the extension's)
// store, which the page cannot read.
let gmValues: Map<string, unknown>;

beforeEach(() => {
    gmValues = installGmStorageFixture().values;
});

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

// Whether this site has had the hint comes from private storage, which answers asynchronously.
const storageSettled = () => new Promise(resolve => setTimeout(resolve, 0));

function readerCanvas(rect = new DOMRect(24, 20, 420, 560)): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => rect;
    document.body.append(canvas);
    return canvas;
}

function visibleHint(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.jpdb-ocr-canvas-tap-hint:not([hidden])');
}

function hintRecords(): string[] {
    return [...gmValues.keys()].map(decodeURIComponent).filter(key => key.includes('ocr-canvas-tap-hint-seen'));
}

function forgetHintRecords(): void {
    for (const key of [...gmValues.keys()]) {
        if (decodeURIComponent(key).includes('ocr-canvas-tap-hint-seen')) gmValues.delete(key);
    }
}

function stubOrigin(hostname: string): void {
    vi.stubGlobal('location', { hostname, href: `https://${hostname}/reader`, origin: `https://${hostname}`, protocol: 'https:' });
}

function hostButtonWhere(covers: (x: number, y: number) => boolean, canvas: HTMLCanvasElement): HTMLButtonElement {
    const control = document.createElement('button');
    document.body.append(control);
    vi.spyOn(document, 'elementFromPoint').mockImplementation((x, y) => (covers(x, y) ? control : canvas));
    return control;
}

describe('reader canvas tap hint', () => {
    it('appears once per site, remembered in Yomu\'s private storage and never in the page\'s', async () => {
        stubOrigin('manga-reader.example');
        const canvas = readerCanvas();
        const hint = new ReaderCanvasTapHint();

        hint.update(canvas, testEnSettings());
        await storageSettled();

        expect(visibleHint()?.textContent).toContain('Tap or click the page to read it');
        expect(visibleHint()?.getAttribute('role')).toBe('status');
        await storageSettled();
        // Page storage would tell the site, on every later visit, that this
        // visitor runs Yomu with a cloud OCR provider.
        expect([...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter(key => key.includes('tap-hint'))).toEqual([]);
        expect(hintRecords()).toHaveLength(1);
        expect(hintRecords()[0]).not.toContain('manga-reader');

        // Later gate runs on this page keep pointing it at the canvas.
        hint.update(undefined, testEnSettings());
        expect(visibleHint()).toBeNull();
        hint.update(canvas, testEnSettings());
        expect(visibleHint()).not.toBeNull();

        // A reload on the same site never shows it again, even with the page's storage wiped.
        hint.remove();
        localStorage.clear();
        sessionStorage.clear();
        const reloaded = new ReaderCanvasTapHint();
        reloaded.update(canvas, testEnSettings());
        await storageSettled();
        expect(document.querySelector('.jpdb-ocr-canvas-tap-hint')).toBeNull();

        // Another site has its own record.
        stubOrigin('another-reader.example');
        new ReaderCanvasTapHint().update(canvas, testEnSettings());
        await storageSettled();
        expect(visibleHint()).not.toBeNull();
    });

    it('stays away after the learner dismisses it', async () => {
        const canvas = readerCanvas();
        const hint = new ReaderCanvasTapHint();
        hint.update(canvas, testEnSettings());
        await storageSettled();

        visibleHint()!.querySelector<HTMLButtonElement>('.jpdb-ocr-canvas-tap-hint-dismiss')!.click();
        hint.update(canvas, testEnSettings());

        expect(document.querySelector('.jpdb-ocr-canvas-tap-hint')).toBeNull();
    });

    it('shows nothing when the reader goes away before private storage answers', async () => {
        const hint = new ReaderCanvasTapHint();
        hint.update(readerCanvas(), testEnSettings());
        hint.remove();
        await storageSettled();

        expect(document.querySelector('.jpdb-ocr-canvas-tap-hint')).toBeNull();
    });

    it('moves off the host page\'s controls, and waits rather than cover them', async () => {
        const canvas = readerCanvas();
        // A reader toolbar across the top of the page: the status-pill corner and
        // the top centre are taken, the middle of the page is clear.
        hostButtonWhere((_x, y) => y < 100, canvas);
        const hint = new ReaderCanvasTapHint();

        hint.update(canvas, testEnSettings());
        await storageSettled();

        expect(visibleHint()).not.toBeNull();
        expect(visibleHint()!.style.top).toBe(`${20 + (560 - 34) / 2}px`);

        hint.remove();
        await storageSettled();
        forgetHintRecords();
        vi.restoreAllMocks();
        hostButtonWhere(() => true, canvas);
        const crowded = new ReaderCanvasTapHint();

        crowded.update(canvas, testEnSettings());
        await storageSettled();

        expect(visibleHint()).toBeNull();
        expect(hintRecords()).toEqual([]);
    });

    it('keeps its dismiss button\'s touch target off a host control just below the pill', async () => {
        const canvas = readerCanvas();
        // A slim control 4-14px under where the pill would sit (y 32-66): not under the
        // pill itself, but inside the finger-sized target around its dismiss button.
        hostButtonWhere((_x, y) => y >= 70 && y < 80, canvas);
        const hint = new ReaderCanvasTapHint();

        hint.update(canvas, testEnSettings());
        await storageSettled();

        expect(visibleHint()!.style.top).toBe(`${20 + (560 - 34) / 2}px`);
    });

    it('speaks Japanese in Japanese mode', async () => {
        const canvas = readerCanvas();
        new ReaderCanvasTapHint().update(canvas, { ...testEnSettings(), interfaceLanguage: 'ja' });
        await storageSettled();

        const hint = visibleHint()!;
        expect(hint.textContent).toContain('ページをタップまたはクリックすると読めます');
        expect(hint.querySelector('button')?.getAttribute('aria-label')).toBe('ヒントを閉じる');
        expect(hint.textContent).not.toContain('未翻訳');
    });
});
