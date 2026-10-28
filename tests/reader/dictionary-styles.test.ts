import { afterEach, describe, expect, it, vi } from 'vitest';

import { DictionaryStyleController } from '../../src/reader/sources/styles';

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
