import { afterEach, describe, expect, it, vi } from 'vitest';
import { installSelectedTextShortcutControls } from '../../src/gaming/renderer/selected-text-shortcut';
import { DEFAULT_TEXT_LOOKUP_SETTINGS, parseTextLookupShortcutSettings } from '../../src/gaming/selected-text-shortcut';
import type { YomuGamingEnvironment } from '../../src/gaming/ipc';

afterEach(() => { document.body.replaceChildren(); });

function fixture() {
    const form = document.createElement('form');
    form.innerHTML = '<section id="jpdb-reader-settings-panel-shortcuts"></section>';
    document.body.append(form);
    const environment: YomuGamingEnvironment = { platform: 'win32', displayServer: 'unknown', desktop: 'unknown', isSteamDeckSession: false,
        isPackaged: true, displayCount: 1, hotkey: 'Control+Shift+Y', hotkeyRegistered: true, trayActive: true, screenAccess: 'unsupported',
        textLookupShortcut: { ...DEFAULT_TEXT_LOOKUP_SETTINGS, registered: false } };
    const save = vi.fn(async (value: unknown): Promise<YomuGamingEnvironment> => {
        const settings = parseTextLookupShortcutSettings(value, 'win32');
        if (!settings) throw new Error('Invalid fixture request');
        return { ...environment, textLookupShortcut: { ...settings, registered: settings.enabled } };
    });
    const onSave = vi.fn();
    const controls = installSelectedTextShortcutControls(form, { updateTextLookupShortcut: save }, onSave);
    return { form, save, onSave, controls, environment };
}

describe('selected-text shortcut settings controls', () => {
    it('starts disabled without changing the OCR binding or silently claiming another app shortcut', () => {
        const f = fixture();
        f.controls?.update('en', f.environment);
        expect(f.form.querySelector<HTMLInputElement>('[data-text-shortcut-enabled]')?.checked).toBe(false);
        expect(f.form.querySelector<HTMLInputElement>('[data-text-shortcut-input]')?.disabled).toBe(true);
        expect(f.form.textContent).toContain('Shortcut disabled');
        expect(f.save).not.toHaveBeenCalled();
        expect(f.environment.hotkey).toBe('Control+Shift+Y');
    });

    it('enables and changes the shortcut through the normal visible keyboard controls', async () => {
        const f = fixture();
        f.controls?.update('en', f.environment);
        f.form.querySelector<HTMLInputElement>('[data-text-shortcut-enabled]')?.click();
        await vi.waitFor(() => expect(f.form.textContent).toContain('Shortcut ready'));
        const input = f.form.querySelector<HTMLInputElement>('[data-text-shortcut-input]');
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', code: 'KeyK', ctrlKey: true, altKey: true, bubbles: true }));
        await vi.waitFor(() => expect(f.form.querySelector<HTMLInputElement>('[data-text-shortcut-input]')?.value).toBe('Ctrl+Alt+K'));
        expect(f.save).toHaveBeenLastCalledWith({ enabled: true, shortcut: 'Ctrl+Alt+K', language: 'en' });
        expect(f.onSave).toHaveBeenCalledTimes(2);
    });

    it('shows registration failure while retaining the saved shortcut', async () => {
        const f = fixture();
        f.save.mockResolvedValueOnce({ ...f.environment, textLookupShortcut: { ...DEFAULT_TEXT_LOOKUP_SETTINGS, registered: false, error: 'taken' } });
        f.controls?.update('en', f.environment);
        f.form.querySelector<HTMLInputElement>('[data-text-shortcut-enabled]')?.click();
        await vi.waitFor(() => expect(f.form.textContent).toContain('That shortcut is unavailable'));
        expect(f.form.querySelector<HTMLInputElement>('[data-text-shortcut-enabled]')?.checked).toBe(false);
    });

    it('localizes controls and tray language without enabling a disabled shortcut', async () => {
        const f = fixture();
        f.controls?.update('ja', f.environment);
        await vi.waitFor(() => expect(f.save).toHaveBeenCalledWith({ enabled: false, shortcut: DEFAULT_TEXT_LOOKUP_SETTINGS.shortcut, language: 'ja' }));
        expect(f.form.textContent).toContain('選択テキスト');
        expect(f.form.textContent).not.toContain('未翻訳');
    });

    it('retains localized save feedback when IPC persistence fails', async () => {
        const f = fixture();
        f.save.mockRejectedValueOnce(new Error('disk error'));
        f.controls?.update('en', f.environment);
        f.form.querySelector<HTMLInputElement>('[data-text-shortcut-enabled]')?.click();
        await vi.waitFor(() => expect(f.form.textContent).toContain('Settings save failed.'));
    });
});
