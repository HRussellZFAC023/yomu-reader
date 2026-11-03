import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountSelectedTextLookup } from '../../src/gaming/renderer/selected-text';
import { normalizeReaderSettings } from '../../src/reader/settings';
import { chromeMessageSource, chromeMessageSourceForLocale } from '../../src/reader/app/i18n';
import type { YomuGamingBridge, YomuGamingSelectedText } from '../../src/gaming/ipc';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

function fixture(result: YomuGamingSelectedText, language: 'en' | 'ja' = 'en') {
    const root = document.createElement('div');
    document.body.append(root);
    const screenshot = vi.fn(async () => { throw new Error('Selected text must never capture'); });
    const ocr = vi.fn(async () => ({ ok: false, status: 0, body: null }));
    const bridge = {
        getSelectedText: vi.fn(async () => result), closeTextLookup: vi.fn(async () => undefined), retryTextLookup: vi.fn(async () => undefined),
        getFrozenCapture: screenshot, recaptureFrozenFrame: screenshot, requestOcr: ocr,
    } satisfies Pick<YomuGamingBridge, 'getSelectedText' | 'closeTextLookup' | 'retryTextLookup' | 'getFrozenCapture' | 'recaptureFrozenFrame' | 'requestOcr'>;
    const reader = { boot: vi.fn(async (_settings: ReturnType<typeof normalizeReaderSettings>) => true), lookup: vi.fn(async (_text: string, _anchor: HTMLElement) => undefined), openSettings: vi.fn(async () => undefined) };
    const settings = normalizeReaderSettings({ ocrEnabled: false, ocrProvider: 'off', interfaceLanguage: language });
    return { root, bridge, reader, settings, screenshot, ocr };
}

describe('selected-text lookup surface', () => {
    it('passes the exact selected content to real reader ingress while OCR is disabled', async () => {
        const exact = '  冒険\r\nを始めよう。 <script>\t';
        const f = fixture({ kind: 'text', text: exact });
        await mountSelectedTextLookup(f.root, f.bridge, f.settings, f.reader);
        const source = f.root.querySelector('[data-selected-text-source]');
        expect(source?.textContent).toBe(exact);
        expect(source?.querySelector('script')).toBeNull();
        expect(f.reader.lookup).toHaveBeenCalledWith(exact, source);
        expect(f.reader.boot.mock.calls[0]?.[0]).toMatchObject({ ocrEnabled: false, ocrProvider: 'off' });
        expect(f.screenshot).not.toHaveBeenCalled();
        expect(f.ocr).not.toHaveBeenCalled();
    });

    it('rejects a Latin-only selection without starting a parser or OCR request', async () => {
        const f = fixture({ kind: 'text', text: 'adventure 123' });
        await mountSelectedTextLookup(f.root, f.bridge, f.settings, f.reader);
        expect(f.root.querySelector('[data-selected-status]')?.textContent).toBe('Select Japanese text to look it up.');
        expect(f.reader.boot).not.toHaveBeenCalled();
        expect(f.reader.lookup).not.toHaveBeenCalled();
        expect(f.ocr).not.toHaveBeenCalled();
    });

    it('retains all content and whitespace in a mixed Japanese passage', async () => {
        const text = 'Chapter 1: 冒険\r\nPDF の日本語を読む。  2026\t';
        const f = fixture({ kind: 'text', text });
        await mountSelectedTextLookup(f.root, f.bridge, f.settings, f.reader);
        expect(f.root.querySelector('[data-selected-text-source]')?.textContent).toBe(text);
        expect(f.reader.lookup).toHaveBeenCalledWith(text, expect.any(HTMLElement));
    });

    it('lets a keyboard reader reopen the exact phrase or a selected part of it', async () => {
        const f = fixture({ kind: 'text', text: '冒険を始めよう。' });
        await mountSelectedTextLookup(f.root, f.bridge, f.settings, f.reader);
        const source = f.root.querySelector<HTMLElement>('[data-selected-text-source]');
        if (!source?.firstChild) throw new Error('Missing selected source');
        const range = document.createRange();
        range.setStart(source.firstChild, 0); range.setEnd(source.firstChild, 2);
        const selection = window.getSelection();
        selection?.removeAllRanges(); selection?.addRange(range);
        source.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await vi.waitFor(() => expect(f.reader.lookup).toHaveBeenLastCalledWith('冒険', source));
        selection?.removeAllRanges();
        f.root.querySelector<HTMLButtonElement>('[data-selected-lookup]')?.click();
        await vi.waitFor(() => expect(f.reader.lookup).toHaveBeenLastCalledWith('冒険を始めよう。', source));
    });

    it.each(['empty', 'unsupported', 'permission', 'unavailable', 'too-long', 'expired'] as const)('explains %s locally and waits for an explicit paste action', async kind => {
        const f = fixture({ kind }, 'ja');
        await mountSelectedTextLookup(f.root, f.bridge, f.settings, f.reader);
        expect(f.root.querySelector('[data-selected-status]')?.textContent).not.toMatch(/未翻訳|^$/);
        expect(f.root.querySelector('details')?.open).toBe(true);
        expect(f.reader.boot).not.toHaveBeenCalled();
        expect(f.reader.lookup).not.toHaveBeenCalled();
        expect(f.ocr).not.toHaveBeenCalled();
        expect(f.screenshot).not.toHaveBeenCalled();
        const input = f.root.querySelector<HTMLTextAreaElement>('textarea');
        if (!input) throw new Error('Missing paste field');
        expect(document.activeElement).toBe(input);
        input.value = '冒険';
        f.root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
        await vi.waitFor(() => expect(f.reader.lookup).toHaveBeenCalledWith('冒険', expect.any(HTMLElement)));
        f.root.querySelector<HTMLButtonElement>('[data-selected-retry]')?.click();
        expect(f.bridge.retryTextLookup).toHaveBeenCalledOnce();
    });

    it('drops pending work when its native window document is dismissed', async () => {
        const f = fixture({ kind: 'text', text: '秘密' });
        let ready: (value: boolean) => void = () => undefined;
        f.reader.boot.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
        const mounted = mountSelectedTextLookup(f.root, f.bridge, f.settings, f.reader);
        await vi.waitFor(() => expect(f.reader.boot).toHaveBeenCalledOnce());
        window.dispatchEvent(new Event('pagehide'));
        ready(true);
        await mounted;
        expect(f.reader.lookup).not.toHaveBeenCalled();
        expect(f.root.textContent).toBe('');
    });

    it('ships Japanese copy for every new desktop message', () => {
        const english = chromeMessageSource();
        const japanese = chromeMessageSourceForLocale('ja');
        for (const key of Object.keys(english).filter(key => key.startsWith('desktopSelectedText'))) {
            expect(japanese[key], key).toBeTruthy();
            expect(japanese[key], key).not.toBe(english[key]);
        }
    });
});
