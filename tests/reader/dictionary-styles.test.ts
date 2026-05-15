import { afterEach, describe, expect, it, vi } from 'vitest';

import { DictionaryStyleController } from '../../src/reader/dictionary-styles';

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
});
