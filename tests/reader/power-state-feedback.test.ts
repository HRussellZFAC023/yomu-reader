// The reading-state control names the state it is in (よむ on · furigana shown /
// hidden, よむ off) on the puck and in the toolbar, so pressing it there needs no
// toast that restates it in other words. The userscript manager's menu command
// has no label of its own, so it alone confirms the new state, in the same words.
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
    const pressPower = () => new Promise<ExtensionPopupActionList>(resolve => {
        for (const listener of listeners) listener({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'run', id: 'power' }, { id: 'yomu-extension-id' }, resolve as (response: unknown) => void);
    });
    return {
        app,
        commands,
        pressPower,
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

describe('feedback for the reading-state control', () => {
    it.each(['en', 'ja'] as const)('shows no toast when the %s puck or toolbar steps through the three states', async language => {
        const reader = startReader(language);
        try {
            await reader.init();
            const seen: string[] = [];
            for (let step = 0; step < 3; step++) {
                const list = await reader.pressPower();
                seen.push(list.actions.find(action => action.id === 'power')!.label);
            }
            expect(seen).toHaveLength(3);
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
});
