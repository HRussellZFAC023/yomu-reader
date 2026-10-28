import { afterEach, describe, expect, it, vi } from 'vitest';

describe('DOM HTML helpers', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('sanitizes dynamic markup before inserting DOM nodes', async () => {
        const { setInnerHtml } = await import('../../src/reader/dom/html');
        const element = document.createElement('div');
        setInnerHtml(
            element,
            [
                '<span data-card="word">ok</span>',
                '<img src="x" onerror="alert(1)">',
                '<a href="javascript:alert(1)" target="_blank">bad link</a>',
                '<div style="color: red; background-image: url(javascript:alert(1))">styled</div>',
                '<unsafe-card><em>kept text</em></unsafe-card><button is="unsafe-button">button</button>',
                '<script>alert(1)</script><iframe srcdoc="<script>alert(1)</script>"></iframe>',
            ].join(''),
        );

        expect(element.querySelector('span')?.dataset.card).toBe('word');
        expect(element.querySelector('img')?.hasAttribute('onerror')).toBe(false);
        expect(element.querySelector('a')?.hasAttribute('href')).toBe(false);
        expect(element.querySelector('a')?.getAttribute('rel')).toContain('noopener');
        expect(element.querySelector('div')?.style.color).toBe('red');
        expect(element.querySelector('div')?.style.backgroundImage).toBe('');
        expect(element.querySelector('unsafe-card')).toBeNull();
        expect(element.querySelector('em')?.textContent).toBe('kept text');
        expect(element.querySelector('button')?.hasAttribute('is')).toBe(false);
        expect(element.querySelector('script')).toBeNull();
        expect(element.querySelector('iframe')).toBeNull();
    });

    it('uses page-compartment TrustedHTML for HTML, XML, and SVG parsing', async () => {
        const trustedValues = new WeakSet<object>();
        const clonedOptions = {
            createHTML: vi.fn((html: string) => {
                const trusted = { source: html, toString: () => html };
                trustedValues.add(trusted);
                return trusted;
            }),
        };
        const cloneInto = vi.fn(() => clonedOptions);
        const createPolicy = vi.fn((_name: string, options: typeof clonedOptions) => ({
            createHTML: options.createHTML,
        }));
        const parseFromString = vi.fn((value: unknown, mimeType: DOMParserSupportedType) => {
            if (typeof value === 'string' || !value || !trustedValues.has(value as object)) {
                throw new TypeError('TrustedHTML required');
            }
            return mimeType === 'text/html'
                ? document.implementation.createHTMLDocument('trusted')
                : document.implementation.createDocument(null, mimeType === 'image/svg+xml' ? 'svg' : 'root');
        });
        vi.stubGlobal('cloneInto', cloneInto);
        vi.stubGlobal('trustedTypes', { createPolicy });
        vi.stubGlobal(
            'DOMParser',
            class {
                parseFromString = parseFromString;
            },
        );

        const { parseHtmlDocument, parseXmlDocument } = await import('../../src/reader/dom/html');
        expect(parseHtmlDocument('<p>HTML</p>').title).toBe('trusted');
        expect(parseXmlDocument('<root/>').documentElement.localName).toBe('root');
        expect(parseXmlDocument('<svg/>', 'image/svg+xml').documentElement.localName).toBe('svg');

        expect(cloneInto).toHaveBeenCalledWith(
            expect.objectContaining({
                createHTML: expect.any(Function),
            }),
            window,
            { cloneFunctions: true, wrapReflectors: true },
        );
        expect(createPolicy).toHaveBeenCalledWith('yomu-reader', clonedOptions);
        expect(parseFromString).toHaveBeenCalledTimes(3);
    });

    it('parses contextual HTML without assigning to innerHTML', async () => {
        const { setInnerHtml } = await import('../../src/reader/dom/html');
        const select = document.createElement('select');
        const template = document.createElement('template');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        setInnerHtml(select, '<option value="one">One</option>');
        setInnerHtml(template, '<strong>Study</strong>');
        setInnerHtml(svg, '<path d="M0 0h1v1z"></path>');

        expect(select.options[0]?.value).toBe('one');
        expect(template.content.firstElementChild?.localName).toBe('strong');
        expect(svg.firstElementChild?.namespaceURI).toBe('http://www.w3.org/2000/svg');
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
