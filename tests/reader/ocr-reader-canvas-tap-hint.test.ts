import { afterEach, describe, expect, it, vi } from 'vitest';

import { managedLocalStorage } from '../../src/reader/app/storage';
import { READER_CANVAS_TAP_HINT_SEEN_KEY, ReaderCanvasTapHint } from '../../src/reader/ocr/reader-canvas-tap-hint';
import { testEnSettings } from './helpers/settings-fixture';

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

function readerCanvas(rect = new DOMRect(24, 20, 420, 560)): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => rect;
    document.body.append(canvas);
    return canvas;
}

function visibleHint(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.jpdb-ocr-canvas-tap-hint:not([hidden])');
}

function hostButtonWhere(covers: (x: number, y: number) => boolean, canvas: HTMLCanvasElement): HTMLButtonElement {
    const control = document.createElement('button');
    document.body.append(control);
    vi.spyOn(document, 'elementFromPoint').mockImplementation((x, y) => (covers(x, y) ? control : canvas));
    return control;
}

describe('reader canvas tap hint', () => {
    it('appears once per site and is remembered in that site\'s Yomu storage', () => {
        const canvas = readerCanvas();
        const hint = new ReaderCanvasTapHint();

        hint.update(canvas, testEnSettings());

        expect(visibleHint()?.textContent).toContain('Tap the page to read it');
        expect(visibleHint()?.getAttribute('role')).toBe('status');
        expect(managedLocalStorage.getItem(READER_CANVAS_TAP_HINT_SEEN_KEY)).toBe('1');

        // Later gate runs on this page keep pointing it at the canvas.
        hint.update(undefined, testEnSettings());
        expect(visibleHint()).toBeNull();
        hint.update(canvas, testEnSettings());
        expect(visibleHint()).not.toBeNull();

        // A reload on the same site never shows it again.
        hint.remove();
        const reloaded = new ReaderCanvasTapHint();
        reloaded.update(canvas, testEnSettings());
        expect(document.querySelector('.jpdb-ocr-canvas-tap-hint')).toBeNull();
    });

    it('stays away after the learner dismisses it', () => {
        const canvas = readerCanvas();
        const hint = new ReaderCanvasTapHint();
        hint.update(canvas, testEnSettings());

        visibleHint()!.querySelector<HTMLButtonElement>('.jpdb-ocr-canvas-tap-hint-dismiss')!.click();
        hint.update(canvas, testEnSettings());

        expect(document.querySelector('.jpdb-ocr-canvas-tap-hint')).toBeNull();
    });

    it('moves off the host page\'s controls, and waits rather than cover them', () => {
        const canvas = readerCanvas();
        // A reader toolbar across the top of the page: the status-pill corner and
        // the top centre are taken, the middle of the page is clear.
        hostButtonWhere((_x, y) => y < 100, canvas);
        const hint = new ReaderCanvasTapHint();

        hint.update(canvas, testEnSettings());

        expect(visibleHint()).not.toBeNull();
        expect(visibleHint()!.style.top).toBe(`${20 + (560 - 34) / 2}px`);

        hint.remove();
        localStorage.removeItem(READER_CANVAS_TAP_HINT_SEEN_KEY);
        vi.restoreAllMocks();
        hostButtonWhere(() => true, canvas);
        const crowded = new ReaderCanvasTapHint();

        crowded.update(canvas, testEnSettings());

        expect(visibleHint()).toBeNull();
        expect(managedLocalStorage.getItem(READER_CANVAS_TAP_HINT_SEEN_KEY)).toBeNull();
    });

    it('keeps its dismiss button\'s touch target off a host control just below the pill', () => {
        const canvas = readerCanvas();
        // A slim control 4-14px under where the pill would sit (y 32-66): not under the
        // pill itself, but inside the finger-sized target around its dismiss button.
        hostButtonWhere((_x, y) => y >= 70 && y < 80, canvas);
        const hint = new ReaderCanvasTapHint();

        hint.update(canvas, testEnSettings());

        expect(visibleHint()!.style.top).toBe(`${20 + (560 - 34) / 2}px`);
    });

    it('speaks Japanese in Japanese mode', () => {
        const canvas = readerCanvas();
        new ReaderCanvasTapHint().update(canvas, { ...testEnSettings(), interfaceLanguage: 'ja' });

        const hint = visibleHint()!;
        expect(hint.textContent).toContain('ページをタップすると読めます');
        expect(hint.querySelector('button')?.getAttribute('aria-label')).toBe('ヒントを閉じる');
        expect(hint.textContent).not.toContain('未翻訳');
    });
});
