import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestHttp } from '../../src/reader/network/http-request';
import { createWindowCustomEvent } from '../../src/reader/platform/window-events';
import { registerYomuCompanion } from '../../src/reader/companions/registry';

// Firefox regression (newtab study page): the userscript HTTP bridge can be
// marked installed yet dead — the content world trips an XrayWrapper error
// ("Not allowed to define cross-origin object as property") and never answers,
// so every hosted-page request "timed out" locally, pitch never loaded, and the
// fetch fallback was refused (timeouts were treated as final). These tests pin
// the recovery paths.
describe('event-bridge failure fetch fallback', () => {
    afterEach(() => {
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('retries a dead-bridge timeout through the hosted proxy fetch path', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/newtab/index.html'));
        document.documentElement.dataset.yomuUserscriptHttpBridge = 'true';
        const fetchMock = vi.fn().mockResolvedValue(new Response('<html>pitch</html>', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await requestHttp('https://jpdb.io/search?q=%E6%99%82%E9%96%93', {
            responseType: 'text',
            timeoutMs: 25,
        });

        expect(result).toBe('<html>pitch</html>');
        const attemptedUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
        expect(attemptedUrl).toContain('edge.yomureader.com');
        expect(attemptedUrl).toContain(encodeURIComponent('https://jpdb.io/search?q='));
    });

    it('does not fetch-retry when the bridge delivered a real HTTP status failure', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/newtab/index.html'));
        document.documentElement.dataset.yomuUserscriptHttpBridge = 'true';
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        window.addEventListener('yomu-userscript-http-request', event => {
            const raw = (event as CustomEvent).detail;
            const detail = typeof raw === 'string' ? JSON.parse(raw) : raw;
            window.dispatchEvent(new CustomEvent('yomu-userscript-http-response', {
                detail: JSON.stringify({ id: detail.id, kind: 'load', response: { status: 404, responseText: 'nope' } }),
            }));
        }, { once: true });

        await expect(requestHttp('https://jpdb.io/search?q=x', { responseType: 'text', timeoutMs: 200 }))
            .rejects.toThrow('(404)');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('Xray-safe cross-compartment payloads', () => {
    afterEach(() => {
        delete (globalThis as { cloneInto?: unknown }).cloneInto;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('falls back to a JSON string detail when cloneInto refuses the object', () => {
        (globalThis as { cloneInto?: unknown }).cloneInto = () => {
            throw new Error('Not allowed to define cross-origin object as property on [Object] XrayWrapper');
        };
        const event = createWindowCustomEvent('yomu-test', { id: 'a', kind: 'load' });
        expect(event.detail).toBe(JSON.stringify({ id: 'a', kind: 'load' }));
    });

    it('skips publishing companions to a cross-compartment window when the clone is refused', () => {
        const fakeWindow = Object.create(window) as typeof window & { __yomuCompanions?: unknown };
        vi.stubGlobal('window', fakeWindow);
        (globalThis as { cloneInto?: unknown }).cloneInto = () => {
            throw new Error('Not allowed to define cross-origin object as property on [Object] XrayWrapper');
        };

        expect(() => registerYomuCompanion('ocr', { ImageOcrController: class {} as never })).not.toThrow();
        expect(Object.prototype.hasOwnProperty.call(fakeWindow, '__yomuCompanions')).toBe(false);
    });

    it('publishes the cloned registry to a cross-compartment window', () => {
        const fakeWindow = Object.create(window) as typeof window & { __yomuCompanions?: unknown };
        vi.stubGlobal('window', fakeWindow);
        const cloned = { marker: true };
        (globalThis as { cloneInto?: unknown }).cloneInto = vi.fn().mockReturnValue(cloned);

        registerYomuCompanion('ocr', { ImageOcrController: class {} as never });
        expect(fakeWindow.__yomuCompanions).toBe(cloned);
    });
});
