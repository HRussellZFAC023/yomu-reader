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

    it('defers head appends when the userscript starts before document nodes exist', async () => {
        const { appendToDocumentHead } = await import('../../src/reader/dom/html');
        const headSpy = vi.spyOn(document, 'head', 'get').mockReturnValue(null as unknown as HTMLHeadElement);
        const documentElementSpy = vi.spyOn(document, 'documentElement', 'get').mockReturnValue(null as unknown as HTMLElement);
        const bodySpy = vi.spyOn(document, 'body', 'get').mockReturnValue(null as unknown as HTMLElement);
        const marker = document.createElement('meta');

        appendToDocumentHead(marker);

        expect(marker.isConnected).toBe(false);
        headSpy.mockRestore();
        documentElementSpy.mockRestore();
        bodySpy.mockRestore();

        document.dispatchEvent(new Event('DOMContentLoaded'));

        expect(marker.parentElement).toBe(document.head);
    });
});
