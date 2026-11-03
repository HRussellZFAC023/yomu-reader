import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSelectedText, selectedTextResult, SelectedTextSession } from '../../src/gaming/selected-text';
import { DEFAULT_TEXT_LOOKUP_SETTINGS, parseTextLookupShortcutSettings, sameNativeShortcut } from '../../src/gaming/selected-text-shortcut';

afterEach(() => { vi.useRealTimers(); });

describe('native selected text boundary (platform command fixtures)', () => {
    const exact = '  冒険\r\nを始めよう。\t';

    it('reads only native Windows selection ranges and preserves exact whitespace', async () => {
        const run = vi.fn(async (_command: { file: string; args: string[] }) => JSON.stringify({ kind: 'text', text: exact }));
        const primary = vi.fn(() => { throw new Error('No clipboard reads on Windows'); });
        await expect(readSelectedText({ platform: 'win32', displayServer: 'unknown', run, readPrimarySelection: primary }))
            .resolves.toEqual({ kind: 'text', text: exact });
        const command = run.mock.calls[0]?.[0];
        expect(command?.file).toBe('powershell.exe');
        const script = Buffer.from(command?.args.at(-1) ?? '', 'base64').toString('utf16le');
        expect(script).toContain('.GetSelection()');
        expect(script).toContain('.Current.IsPassword');
        expect(script).not.toMatch(/Get-Clipboard|Set-Clipboard|SendKeys|ValuePattern|DocumentRange/);
        expect(primary).not.toHaveBeenCalled();
    });

    it('distinguishes an empty caret range, denied access, and a control without selection support', async () => {
        for (const [output, kind] of [
            ['{"kind":"text","text":""}', 'empty'], ['{"kind":"permission"}', 'permission'],
            ['{"kind":"unavailable"}', 'unavailable'], ['{"text":"entire private document"}', 'unavailable'],
            ['malformed', 'unavailable'],
        ]) {
            await expect(readSelectedText({ platform: 'win32', displayServer: '', run: async () => output, readPrimarySelection: () => 'stale' }))
                .resolves.toEqual({ kind });
        }
    });

    it('uses macOS AXSelectedText without treating the ordinary clipboard as a fallback', async () => {
        const run = vi.fn(async (_command: { file: string; args: string[] }) => `${exact}\n`);
        const primary = vi.fn(() => 'stale clipboard');
        await expect(readSelectedText({ platform: 'darwin', displayServer: '', run, readPrimarySelection: primary }))
            .resolves.toEqual({ kind: 'text', text: exact });
        expect(run.mock.calls[0]?.[0]).toMatchObject({ file: '/usr/bin/osascript' });
        expect(primary).not.toHaveBeenCalled();
        expect(run.mock.calls[0]?.[0].args.join(' ')).toContain('"AXSecureTextField"');
        expect(run.mock.calls[0]?.[0].args.join(' ').indexOf('"AXSecureTextField"'))
            .toBeLessThan(run.mock.calls[0]?.[0].args.join(' ').indexOf('"AXSelectedText"') ?? -1);
    });

    it('reads X11 PRIMARY only on an explicit capture and refuses Wayland', async () => {
        const primary = vi.fn(() => exact);
        const run = vi.fn(async () => '');
        expect(primary).not.toHaveBeenCalled();
        await expect(readSelectedText({ platform: 'linux', displayServer: 'x11', run, readPrimarySelection: primary }))
            .resolves.toEqual({ kind: 'text', text: exact });
        await expect(readSelectedText({ platform: 'linux', displayServer: 'wayland', run, readPrimarySelection: primary }))
            .resolves.toEqual({ kind: 'unsupported' });
        expect(primary).toHaveBeenCalledOnce();
        expect(run).not.toHaveBeenCalled();
    });

    it('rejects long or empty selections instead of silently truncating or looking up stale data', () => {
        expect(selectedTextResult(' \r\n')).toEqual({ kind: 'empty' });
        expect(selectedTextResult('字'.repeat(20_001))).toEqual({ kind: 'too-long' });
    });
});

describe('ephemeral selected-text sessions', () => {
    it('releases a selection only once to its exact session', async () => {
        const session = new SelectedTextSession();
        const id = await session.capture(async () => ({ kind: 'text', text: '冒険' }));
        expect(session.take('wrong-session')).toEqual({ kind: 'expired' });
        expect(session.take(id)).toEqual({ kind: 'text', text: '冒険' });
        expect(session.take(id)).toEqual({ kind: 'expired' });
    });

    it('drops a late result after cancellation or a newer invocation', async () => {
        const session = new SelectedTextSession();
        let finish: (value: { kind: 'text'; text: string }) => void = () => undefined;
        const first = session.capture(() => new Promise(resolve => { finish = resolve; }));
        const latest = await session.capture(async () => ({ kind: 'text', text: '新しい選択' }));
        finish({ kind: 'text', text: '古い秘密' });
        expect(await first).toBeNull();
        expect(session.take(latest)).toEqual({ kind: 'text', text: '新しい選択' });
        const cancelled = await session.capture(async () => ({ kind: 'text', text: '秘密' }));
        session.cancel();
        expect(session.take(cancelled)).toEqual({ kind: 'expired' });
    });

    it('forgets an unconsumed result after 15 seconds', async () => {
        vi.useFakeTimers();
        const session = new SelectedTextSession();
        const id = await session.capture(async () => ({ kind: 'text', text: '秘密' }));
        vi.advanceTimersByTime(15_001);
        expect(session.take(id)).toEqual({ kind: 'expired' });
    });
});

describe('selected-text shortcut migration', () => {
    it('keeps the OCR default distinct and normalizes aliases when checking conflicts', () => {
        expect(DEFAULT_TEXT_LOOKUP_SETTINGS.shortcut).toBe('CommandOrControl+Shift+L');
        expect(DEFAULT_TEXT_LOOKUP_SETTINGS.enabled).toBe(false);
        expect(sameNativeShortcut('Control+Shift+Y', 'CommandOrControl+Shift+Y', 'win32')).toBe(true);
        expect(sameNativeShortcut('Command+Shift+Y', 'CommandOrControl+Shift+Y', 'darwin')).toBe(true);
        expect(sameNativeShortcut('Control+Shift+L', 'CommandOrControl+Shift+Y', 'win32')).toBe(false);
    });

    it('retains an explicit disabled setting and safely rejects absent or malformed fields', () => {
        expect(parseTextLookupShortcutSettings({ enabled: false, shortcut: 'Ctrl+Alt+L', language: 'ja' }, 'win32'))
            .toEqual({ enabled: false, shortcut: 'Control+Alt+L', language: 'ja' });
        expect(parseTextLookupShortcutSettings({}, 'win32')).toBeNull();
        expect(parseTextLookupShortcutSettings({ enabled: 'yes', shortcut: 'Ctrl+L' }, 'win32')).toBeNull();
        expect(parseTextLookupShortcutSettings({ enabled: true, shortcut: 'Command+L' }, 'win32')).toBeNull();
        expect(parseTextLookupShortcutSettings({ enabled: true, shortcut: 'Ctrl+Bogus' }, 'win32')).toBeNull();
        expect(parseTextLookupShortcutSettings({ enabled: true, shortcut: 'Ctrl+A+B' }, 'win32')).toBeNull();
        expect(sameNativeShortcut('Command+L', 'Super+L', 'darwin')).toBe(true);
        expect(sameNativeShortcut('Control+CommandOrControl+Shift+Y', 'Control+Shift+Y', 'win32')).toBe(true);
    });
});
