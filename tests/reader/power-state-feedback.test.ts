// The reading-state and audio controls name the state they are in (よむ on ·
// furigana shown / hidden, よむ off; Auto-play audio on / off) on the puck and in
// the toolbar, so pressing them there needs no toast that restates it. The
// userscript manager's menu commands have no label of their own, so they alone
// confirm the new state, in the same words.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '../../src/reader/app/main';
import { APP_NAME } from '../../src/reader/app/constants';
import { EXTENSION_POPUP_ACTIONS_CHANNEL, type ExtensionPopupActionList } from '../../src/reader/app/extension-popup-actions';

type Listener = (message: unknown, sender: { id?: string }, sendResponse: (response: unknown) => void) => boolean | undefined;

function startReader(language: 'en' | 'ja') {
    vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);
    const listeners = new Set<Listener>();
    vi.stubGlobal('chrome', {
        runtime: {
            id: 'yomu-extension-id',
            onMessage: { addListener: (listener: Listener) => listeners.add(listener), removeListener: (listener: Listener) => listeners.delete(listener) },
        },
    });
    const commands = new Map<string, () => unknown>();
    vi.stubGlobal('GM_registerMenuCommand', (name: string, fn: () => unknown) => { commands.set(name, fn); });
    const app = new ReaderApp();
    const internals = app as unknown as { installStyles(): void; settings: { interfaceLanguage: 'en' | 'ja' }; installFab(): void };
    internals.installStyles = vi.fn();
    const press = (id: string) => new Promise<ExtensionPopupActionList>(resolve => {
        for (const listener of listeners) listener({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'run', id }, { id: 'yomu-extension-id' }, resolve as (response: unknown) => void);
    });
    return {
        app,
        commands,
        press,
        async init() {
            await app.init();
            internals.settings.interfaceLanguage = language;
            internals.installFab();
        },
    };
}

const toasts = () => [...document.querySelectorAll('.jpdb-reader-toast')].map(toast => toast.textContent);

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

describe('feedback for the reading-state and audio controls', () => {
    it.each(['en', 'ja'] as const)('shows no toast when the %s puck or toolbar steps through the three states', async language => {
        const reader = startReader(language);
        try {
            await reader.init();
            const seen: string[] = [];
            for (let step = 0; step < 3; step++) {
                const list = await reader.press('power');
                seen.push(list.actions.find(action => action.id === 'power')!.label);
            }
            expect(seen).toHaveLength(3);
            expect(toasts()).toEqual([]);
        } finally {
            reader.app.destroy();
        }
    });

    it.each([
        ['en', ['Auto-play audio off', 'Auto-play audio on']],
        ['ja', ['音声の自動再生 オフ', '音声の自動再生 オン']],
    ] as const)('shows no toast when the %s puck or toolbar turns auto-play audio off and on', async (language, states) => {
        const reader = startReader(language);
        try {
            await reader.init();
            const audioLabel = (list: ExtensionPopupActionList) => list.actions.find(action => action.id === 'audio')!.label;
            expect(audioLabel(await reader.press('audio'))).toBe(states[0]);
            expect(audioLabel(await reader.press('audio'))).toBe(states[1]);
            expect(toasts()).toEqual([]);
        } finally {
            reader.app.destroy();
        }
    });

    it.each([
        ['en', ['よむ off', 'よむ on · furigana shown']],
        ['ja', ['よむ オフ', 'よむ オン・ふりがな表示']],
    ] as const)('names the new state from the %s userscript menu command', async (language, states) => {
        const reader = startReader(language);
        try {
            await reader.init();
            const command = reader.commands.get(`${APP_NAME} annotations`)!;
            await command();
            expect(toasts().at(-1)).toBe(states[0]);
            await command();
            expect(toasts().at(-1)).toBe(states[1]);
        } finally {
            reader.app.destroy();
        }
    });

    it.each([
        ['en', ['Auto-play audio off', 'Auto-play audio on']],
        ['ja', ['音声の自動再生 オフ', '音声の自動再生 オン']],
    ] as const)('names the new audio state from the %s userscript menu command', async (language, states) => {
        const reader = startReader(language);
        try {
            await reader.init();
            const command = reader.commands.get(`${APP_NAME} audio`)!;
            await command();
            expect(toasts().at(-1)).toBe(states[0]);
            await command();
            expect(toasts().at(-1)).toBe(states[1]);
        } finally {
            reader.app.destroy();
        }
    });
});
