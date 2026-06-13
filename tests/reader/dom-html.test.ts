import { afterEach, describe, expect, it, vi } from 'vitest';

describe('DOM HTML helpers', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('clones Trusted Types policy callbacks into Firefox page scope when available', async () => {
        vi.resetModules();
        const clonedOptions = { createHTML: vi.fn((html: string) => html) };
        const cloneInto = vi.fn(() => clonedOptions);
        const createPolicy = vi.fn((_name: string, options: typeof clonedOptions) => {
            if (options !== clonedOptions) throw new Error('uncloned policy options');
            return { createHTML: options.createHTML };
        });
        vi.stubGlobal('cloneInto', cloneInto);
        vi.stubGlobal('trustedTypes', { createPolicy });

        const { setInnerHtml } = await import('../../src/reader/dom/html');
        const element = document.createElement('div');
        setInnerHtml(element, '<span>ok</span>');

        expect(cloneInto).toHaveBeenCalledWith(expect.objectContaining({
            createHTML: expect.any(Function),
        }), window, { cloneFunctions: true, wrapReflectors: true });
        expect(createPolicy).toHaveBeenCalledWith('yomu-reader', clonedOptions);
        expect(element.innerHTML).toBe('<span>ok</span>');
    });
});
