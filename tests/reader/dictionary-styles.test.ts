import { afterEach, describe, expect, it, vi } from 'vitest';

import { DictionaryStyleController } from '../../src/reader/sources/styles';
import { DictionarySourceStateController } from "../../src/reader/sources/state";

describe('dictionary style controller', () => {
    afterEach(() => {
        document.head.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('upserts dictionary CSS and removes the style when CSS is empty', async () => {
        let css = '.term { color: red; }';
        const controller = new DictionaryStyleController({ loadCss: () => Promise.resolve(css) });

        await controller.refresh();

        expect(document.getElementById('jpdb-reader-yomitan-dictionary-styles')?.textContent).toBe(css);

        css = '';
        await controller.refresh();

        expect(document.getElementById('jpdb-reader-yomitan-dictionary-styles')).toBeNull();
    });

    it('clears styles when CSS loading fails', async () => {
        const onUnavailable = vi.fn();
        const controller = new DictionaryStyleController({
            loadCss: vi.fn()
                .mockResolvedValueOnce('.term { color: red; }')
                .mockRejectedValueOnce(new Error('boom')),
            onUnavailable,
        });

        await controller.refresh();
        await controller.refresh();

        expect(onUnavailable).toHaveBeenCalledOnce();
        expect(document.getElementById('jpdb-reader-yomitan-dictionary-styles')).toBeNull();
    });

    it('does not restore a pending style after the controller is removed', async () => {
        let resolveCss: ((css: string) => void) | undefined;
        const pendingCss = new Promise<string>(resolve => {
            resolveCss = resolve;
        });
        const onRefreshed = vi.fn();
        const controller = new DictionaryStyleController({
            loadCss: () => pendingCss,
            onRefreshed,
        });

        const refresh = controller.refresh();
        controller.remove();
        resolveCss?.('.term { color: stale; }');
        await refresh;

        expect(document.getElementById('jpdb-reader-yomitan-dictionary-styles')).toBeNull();
        expect(onRefreshed).not.toHaveBeenCalled();
    });

    it('keeps the newest style when overlapping refreshes resolve out of order', async () => {
        const resolvers: Array<(css: string) => void> = [];
        const controller = new DictionaryStyleController({
            loadCss: () => new Promise<string>(resolve => {
                resolvers.push(resolve);
            }),
        });

        const older = controller.refresh();
        const newer = controller.refresh();
        resolvers[1]?.('.term { color: newest; }');
        await newer;
        resolvers[0]?.('.term { color: stale; }');
        await older;

        expect(document.getElementById('jpdb-reader-yomitan-dictionary-styles')?.textContent)
            .toBe('.term { color: newest; }');
    });
});

describe('dictionary source open state', () => {
    const createController = () =>
        new DictionarySourceStateController({
            onStateChange: () => undefined,
        });

    const installTrackedSource = (options: {
        key: string;
        initialOpen: boolean;
        title: string;
        open?: boolean;
    }) => {
        const controller = createController();
        const root = document.createElement('div');
        root.innerHTML = `
            <details data-source-state-key="${options.key}" data-source-initial-open="${options.initialOpen}"${options.open ? ' open' : ''}>
                <summary class="jpdb-reader-local-title">${options.title}</summary>
            </details>
        `;
        const details = root.querySelector<HTMLDetailsElement>('details');
        expect(details).not.toBeNull();
        controller.installTracking(root);
        return details!;
    };


    afterEach(() => {
        document.body.replaceChildren();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('opens an unseen source without a global preference', () => {
        const controller = createController();
        expect(controller.isOpen('definition:unseen')).toBe(true);
        expect(controller.attributes('definition:unseen')).toContain(' open');
    });

    it('persists collapsed source sections across controller instances', () => {
        const details = installTrackedSource({
            key: 'kanji:__kanji_jpdb__',
            initialOpen: true,
            title: 'JPDB kanji',
            open: true,
        });

        details.open = false;
        details.dispatchEvent(new Event('toggle', { bubbles: false }));

        const second = createController();
        expect(second.isOpen('kanji:__kanji_jpdb__', true)).toBe(false);
        expect(second.attributes('kanji:__kanji_jpdb__', true)).not.toContain(' open');
    });

    it('applies remembered open overrides when rendering an initially closed source', () => {
        const details = installTrackedSource({
            key: 'definition:immersion-kit',
            initialOpen: false,
            title: 'Immersion Kit',
        });

        details.open = true;
        details.dispatchEvent(new Event('toggle', { bubbles: false }));

        const second = createController();
        expect(second.attributes('definition:immersion-kit', false)).toContain(' open');
    });
});
