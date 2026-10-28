import { afterEach, describe, expect, it, vi } from 'vitest';
import { openSettingsFromTrustedInteraction } from '../../src/reader/settings/sensitive-settings-surface';
import { ReaderApp } from '../../src/reader/app/main';
import { allowSyntheticReaderInteractionsForTests } from '../../src/reader/ui/trusted-interaction';

afterEach(() => {
    allowSyntheticReaderInteractionsForTests(false);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
});

describe('direct Settings handoff', () => {
    it('keeps an injected native Settings surface authoritative for a trusted shortcut', async () => {
        vi.stubGlobal('location', new URL('file:///yomu/overlay.html'));
        allowSyntheticReaderInteractionsForTests(true);
        const nativeOpen = vi.fn(async () => {});
        const openTab = vi.fn();
        vi.stubGlobal('GM_openInTab', openTab);
        const app = new ReaderApp(undefined, false) as unknown as {
            settingsSurface: { open: typeof nativeOpen };
            showSettings(panel: string | undefined, event: Event): void;
        };
        app.settingsSurface = { open: nativeOpen };
        app.showSettings(undefined, new KeyboardEvent('keydown'));
        await vi.waitFor(() => expect(nativeOpen).toHaveBeenCalledWith(undefined));
        expect(openTab).not.toHaveBeenCalled();
    });
    it('opens synchronously from the original authorized gesture without mounting a dialog', () => {
        vi.stubGlobal('location', new URL('https://example.com/article'));
        const open = vi.fn();
        vi.stubGlobal('GM_openInTab', open);
        allowSyntheticReaderInteractionsForTests(true);
        expect(openSettingsFromTrustedInteraction(new MouseEvent('click'), 'en', vi.fn(), 'appearance')).toBe(true);
        expect(open).toHaveBeenCalledWith('https://yomureader.com/study/#settings=appearance', expect.any(Object));
        expect(document.querySelector('[data-sensitive-settings-launcher]')).toBeNull();
    });
    it('does not turn a host-authored event or an eventless request into permission to open a tab', () => {
        vi.stubGlobal('location', new URL('https://example.com/article'));
        const open = vi.fn();
        vi.stubGlobal('GM_openInTab', open);
        allowSyntheticReaderInteractionsForTests(false);
        expect(openSettingsFromTrustedInteraction(new MouseEvent('click'), 'en', vi.fn())).toBe(false);
        expect(openSettingsFromTrustedInteraction(undefined, 'en', vi.fn())).toBe(false);
        expect(open).not.toHaveBeenCalled();
    });
    it('leaves the owned Study settings surface in place', () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        allowSyntheticReaderInteractionsForTests(true);
        const open = vi.fn();
        vi.stubGlobal('GM_openInTab', open);
        expect(openSettingsFromTrustedInteraction(new KeyboardEvent('keydown'), 'en', vi.fn())).toBe(false);
        expect(open).not.toHaveBeenCalled();
    });
    it('uses conditional help when noopener returns no window reference', async () => {
        vi.stubGlobal('location', new URL('https://example.com/article'));
        vi.stubGlobal('GM_openInTab', undefined);
        vi.stubGlobal('GM', undefined);
        vi.spyOn(window, 'open').mockReturnValue(null);
        allowSyntheticReaderInteractionsForTests(true);
        const toast = vi.fn();
        openSettingsFromTrustedInteraction(new MouseEvent('click'), 'en', toast);
        await Promise.resolve();
        expect(toast).toHaveBeenCalledWith('If Settings did not open, allow pop-ups and try again.');
    });
    it.each([true, false])('opens the owned Firefox settings tab directly and checks its response (%s)', async ok => {
        vi.stubGlobal('location', new URL('https://example.com/article'));
        const sendMessage = vi.fn(async () => ok ? { ok: true, tabId: 73 } : { ok: false });
        vi.stubGlobal('browser', { runtime: {
            id: 'yomu@yomureader.com',
            getURL: (path: string) => new URL(path, 'moz-extension://yomu/').href,
            sendMessage,
        } });
        allowSyntheticReaderInteractionsForTests(true);
        const toast = vi.fn();
        expect(openSettingsFromTrustedInteraction(new MouseEvent('click'), 'en', toast, 'appearance')).toBe(true);
        expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'yomu.openPackagedStudySettings', panel: 'appearance' }));
        await vi.waitFor(() => {
            if (ok) expect(toast).not.toHaveBeenCalled();
            else expect(toast).toHaveBeenCalledWith('Settings could not be opened.');
        });
    });
});
