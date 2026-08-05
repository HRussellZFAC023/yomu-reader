import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';
import { testEnSettings } from './helpers/settings-fixture';

const DEFAULT_SETTINGS = testEnSettings();

type Deps = ConstructorParameters<typeof VisiblePageScanner>[0];

function createScanner(): VisiblePageScanner {
    return new VisiblePageScanner({
        getSettings: () => DEFAULT_SETTINGS,
        parseJapanese: vi.fn(async () => []),
        pauseMutationObserver: callback => callback(),
        preloadParsedTokens: vi.fn(),
        enrichPitchWords: vi.fn(),
        enrichAnkiWords: vi.fn(),
        toast: vi.fn(),
    } as Deps);
}

function rect(top: number, height: number, width = 40): DOMRect {
    return {
        x: 0, y: top, top, height, width, left: 0, right: width, bottom: top + height,
        toJSON: () => ({}),
    } as DOMRect;
}

// A scan-word whose fragments sit on two lines — the shape only a re-wrap
// produces after the initial scan already stamped the page.
function wrappedWord(): HTMLElement {
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word jpdb-reader-scan-word';
    word.textContent = 'コンテキスト';
    Object.defineProperty(word, 'getClientRects', { configurable: true, value: () => [rect(0, 20), rect(22, 20)] });
    return word;
}

let scanner: VisiblePageScanner | undefined;

beforeEach(() => {
    window.history.pushState({}, '', '/reading/');
});

afterEach(() => {
    scanner?.destroy();
    scanner = undefined;
    document.body.innerHTML = '';
});

describe('VisiblePageScanner settle triggers', () => {
    it('re-stamps a word that re-wraps after the scan settled, on a resize settle signal', async () => {
        scanner = createScanner();
        // The scan installs the settle triggers in its finally (no targets on a
        // bare page, but the sweep scheduling still arms the listeners).
        await scanner.scanVisiblePage({ silent: true });

        // The re-wrap happens now — well after the post-scan sweep would have run.
        const word = wrappedWord();
        document.body.append(word);
        expect(word.hasAttribute('data-yomu-wrapped')).toBe(false);

        window.dispatchEvent(new Event('resize'));
        await vi.waitFor(() => expect(word.getAttribute('data-yomu-wrapped')).toBe('true'), { timeout: 2000 });
    });

    it('stops re-stamping after destroy tears the listeners down', async () => {
        scanner = createScanner();
        await scanner.scanVisiblePage({ silent: true });
        scanner.destroy();

        const word = wrappedWord();
        document.body.append(word);
        window.dispatchEvent(new Event('resize'));
        // Give the debounce window a chance to fire; the listener is gone, so the
        // word must remain unstamped.
        await new Promise(resolve => setTimeout(resolve, 350));
        expect(word.hasAttribute('data-yomu-wrapped')).toBe(false);
    });

    it('does not throw when late-annotation refresh timer fires after destroy or when Node global is torn down', async () => {
        scanner = createScanner();
        const root = document.createElement('div');
        document.body.append(root);

        scanner.scheduleLateAnnotationRefresh([root]);
        scanner.destroy();

        // Simulate JSDOM realm teardown where the bare Node global is removed before timeout fires
        const originalNode = (globalThis as Record<string, unknown>).Node;
        delete (globalThis as Record<string, unknown>).Node;

        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            // Should complete cleanly without throwing ReferenceError: Node is not defined
        } finally {
            if (originalNode !== undefined) {
                (globalThis as Record<string, unknown>).Node = originalNode;
            }
            root.remove();
        }
    });
});

