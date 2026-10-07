// The extension toolbar popup's "On this page" section (owner decision 4,
// 2026-10-07): the page answers with the puck's actions and their state, and
// the popup renders and runs them, with nothing kept in the background.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ReaderApp } from '../../src/reader/app/main';
import {
    EXTENSION_POPUP_ACTIONS_CHANNEL,
    installExtensionPopupActions,
    type ExtensionPopupActionList,
} from '../../src/reader/app/extension-popup-actions';
import type { RadialAction } from '../../src/reader/ui/radial-menu';
import { menuIcon } from '../../src/reader/ui/menu-icons';
import MENU_ICON_SHAPES from '../../src/reader/ui/menu-icons.json';
// @ts-expect-error The packaging hardener is a Node ESM script exercised directly by the build.
import { hardenExtensionPopupSource } from '../../scripts/lib/extension-runtime-hardening.mjs';

type Listener = (message: unknown, sender: { id?: string; tab?: unknown }, sendResponse: (response: unknown) => void) => boolean | undefined;

const EXTENSION_ID = 'yomu-extension-id';

function fakeRuntime() {
    vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);
    const listeners = new Set<Listener>();
    const runtime = {
        id: EXTENSION_ID,
        onMessage: { addListener: (listener: Listener) => listeners.add(listener), removeListener: (listener: Listener) => listeners.delete(listener) },
    };
    vi.stubGlobal('chrome', { runtime });
    // Delivers one message the way the browser does and resolves with the reply.
    const send = (message: unknown, sender: { id?: string; tab?: unknown } = { id: EXTENSION_ID }) => new Promise<unknown>(resolve => {
        let answered = false;
        for (const listener of listeners) answered = listener(message, sender, resolve) === true || answered;
        if (!answered) resolve('unanswered');
    });
    return { listeners, send };
}

function puck() {
    const state = { paused: false, audio: true, youtube: false };
    const actions = (): RadialAction[] => [
        { id: 'power', label: state.paused ? 'Resume annotations' : 'Pause annotations', icon: 'fallback', tone: state.paused ? 'off' : 'on', run: async () => { await Promise.resolve(); state.paused = !state.paused; } },
        { id: 'audio', label: state.audio ? 'Mute audio' : 'Unmute audio', icon: 'fallback', tone: state.audio ? 'on' : 'off', run: () => { state.audio = !state.audio; } },
        { id: 'settings', label: 'Settings', icon: 'fallback', run: vi.fn() },
        { id: 'study', label: 'Study Japanese', icon: 'fallback', run: vi.fn() },
        { id: 'youtube', label: 'Filter YouTube to Japanese', icon: 'fallback', tone: state.youtube ? 'on' : 'off', run: () => { state.youtube = !state.youtube; } },
    ];
    return { state, source: { language: () => 'en' as const, actions } };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

describe('the page side of the extension popup', () => {
    it('does not install in a userscript manager realm or an anonymous runtime', () => {
        const { listeners } = fakeRuntime();
        vi.stubGlobal('__YOMU_EXTENSION_BUILD__', false);
        installExtensionPopupActions(puck().source, new AbortController().signal);
        expect(listeners.size).toBe(0);

        vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);
        const addListener = vi.fn();
        vi.stubGlobal('chrome', { runtime: { onMessage: { addListener, removeListener: vi.fn() } } });
        installExtensionPopupActions(puck().source, new AbortController().signal);
        expect(addListener).not.toHaveBeenCalled();
    });

    it('registers during real Reader startup even when the floating button is hidden', async () => {
        const { send, listeners } = fakeRuntime();
        const app = new ReaderApp();
        const internals = app as unknown as {
            installStyles(): void;
            settings: { showFloatingButton: boolean; interfaceLanguage: 'en' };
            installFab(): void;
        };
        // jsdom does not render stylesheet layers; this assertion exercises startup messaging.
        internals.installStyles = vi.fn();
        try {
            await app.init();
            internals.settings.showFloatingButton = false;
            internals.settings.interfaceLanguage = 'en';
            internals.installFab();
            expect(document.querySelector('.jpdb-reader-fab')).toBeNull();
            const list = await send({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'list' }) as ExtensionPopupActionList;
            expect(list.actions.map(action => action.id)).toEqual(expect.arrayContaining(['power', 'audio', 'ocr']));
        } finally {
            app.destroy();
        }
        expect(listeners.size).toBe(0);
    });

    it('lists the puck actions the popup cannot run itself, with their state', async () => {
        const { send } = fakeRuntime();
        const controller = new AbortController();
        installExtensionPopupActions(puck().source, controller.signal);

        const list = await send({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'list' }) as ExtensionPopupActionList;

        expect(list.language).toBe('en');
        expect(list.heading).toBe('On this page');
        expect(list.settingsLabel).toBe('Settings');
        expect(list.actions).toEqual([
            { id: 'power', label: 'Pause annotations', icon: 'fallback', tone: 'on', pressed: undefined },
            { id: 'audio', label: 'Mute audio', icon: 'fallback', tone: 'on', pressed: undefined },
            { id: 'youtube', label: 'Filter YouTube to Japanese', icon: 'fallback', tone: 'off', pressed: false },
        ]);
        controller.abort();
    });

    it('runs an action, waits for it, and answers with the new state', async () => {
        const { send } = fakeRuntime();
        const { state, source } = puck();
        installExtensionPopupActions(source, new AbortController().signal);

        const list = await send({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'run', id: 'power' }) as ExtensionPopupActionList;

        expect(state.paused).toBe(true);
        expect(list.actions[0]).toEqual({ id: 'power', label: 'Resume annotations', icon: 'fallback', tone: 'off', pressed: undefined });
    });

    it('answers in the learner\'s interface language', async () => {
        const { send } = fakeRuntime();
        installExtensionPopupActions({ ...puck().source, language: () => 'ja' }, new AbortController().signal);
        const list = await send({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'list' }) as ExtensionPopupActionList;
        expect([list.language, list.heading, list.studyLabel, list.settingsLabel]).toEqual(['ja', 'このページ', '学習', '設定']);
    });

    it.each([
        ['en', 'Study', 'Settings', 'Request Japanese sites', ['Yomu on · furigana shown', 'Yomu on · furigana hidden', 'Yomu off']],
        ['ja', '学習', '設定', '日本語版サイトをリクエスト', ['よむ オン・ふりがな表示', 'よむ オン・ふりがな非表示', 'よむ オフ']],
    ] as const)('names the real puck\'s three reading states in %s and steps through them', async (language, study, settings, sites, powerStates) => {
        const { send } = fakeRuntime();
        const app = new ReaderApp();
        const internals = app as unknown as {
            installStyles(): void;
            settings: { interfaceLanguage: 'en' | 'ja' };
            installFab(): void;
        };
        internals.installStyles = vi.fn();
        try {
            await app.init();
            internals.settings.interfaceLanguage = language;
            internals.installFab();
            let list = await send({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'list' }) as ExtensionPopupActionList;
            expect([list.language, list.studyLabel, list.settingsLabel]).toEqual([language, study, settings]);
            expect(list.actions.find(action => action.id === 'japanese-site')?.label).toBe(sites);
            const seen: string[] = [];
            const seenIcons: string[] = [];
            for (let step = 0; step <= powerStates.length; step++) {
                seen.push(list.actions.find(action => action.id === 'power')!.label);
                seenIcons.push(list.actions.find(action => action.id === 'power')!.icon);
                list = await send({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'run', id: 'power' }) as ExtensionPopupActionList;
            }
            expect(seen).toEqual([...powerStates, powerStates[0]]);
            expect(seenIcons).toEqual(['power', 'furigana-hidden', 'power', 'power']);
            const fab = document.querySelector('.jpdb-reader-fab');
            expect(fab?.getAttribute('aria-label')).toBe(list.actions.find(action => action.id === 'power')!.label);
        } finally {
            app.destroy();
        }
    });

    it('answers only this extension\'s own pages, and stops when the reader is torn down', async () => {
        const { send, listeners } = fakeRuntime();
        const { state, source } = puck();
        const controller = new AbortController();
        installExtensionPopupActions(source, controller.signal);

        // Another tab's content script, another extension, or another channel.
        expect(await send({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'run', id: 'power' }, { id: EXTENSION_ID, tab: { id: 3 } })).toBe('unanswered');
        expect(await send({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'run', id: 'power' }, { id: 'someone-else' })).toBe('unanswered');
        expect(await send({ channel: 'userscript-compiler', type: 'run', id: 'power' })).toBe('unanswered');
        expect(state.paused).toBe(false);

        controller.abort();
        expect(listeners.size).toBe(0);
    });
});

describe('the toolbar popup', () => {
    // Copied from the actual compiler output before hardening on 2026-10-07.
    // The legacy listeners and complete HTML must be present in this regression.
    // HTML is inert fixture text; its relative asset URLs belong to compiler output,
    // not this fixture directory.
    const compilerPopup = readFileSync('tests/fixtures/extension/compiler-popup.js', 'utf8');
    const compilerHtml = readFileSync('tests/fixtures/extension/compiler-popup.html.txt', 'utf8');

    function mountPopup(answer: (message: { type: string; id: string }, tabId: number, options: unknown) => unknown) {
        document.body.innerHTML = compilerHtml;
        const opened: string[] = [];
        const sendMessage = vi.fn(async (tabId: number, message: { type: string; id: string }, options: unknown) => answer(message, tabId, options));
        const legacySend = vi.fn();
        const executeScript = vi.fn();
        vi.stubGlobal('chrome', {
            runtime: { getURL: (path: string) => `chrome-extension://${EXTENSION_ID}/${path}`, sendMessage: legacySend },
            tabs: { sendMessage, query: async () => [{ id: 7 }], create: async ({ url }: { url: string }) => { opened.push(url); } },
            scripting: { executeScript },
        });
        vi.spyOn(window, 'close').mockImplementation(() => undefined);
        const source = hardenExtensionPopupSource(compilerPopup, { target: 'chrome' }) as string;
        // Firefox's store gate rejects executable HTML assignments, even for static icons.
        expect(source).not.toMatch(/\b(?:innerHTML|outerHTML)\s*=/u);
        new Function(source)();
        return { opened, sendMessage, legacySend, executeScript };
    }

    const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('[data-yomu-action]')];
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    it('replaces all compiler menus with one native-button group and opens packaged destinations', async () => {
        const { opened, sendMessage, legacySend, executeScript } = mountPopup(() => ({
            heading: 'On this page',
            studyLabel: 'Study',
            settingsLabel: 'Settings',
            actions: [{ id: 'power', label: 'Pause annotations', tone: 'on' }, { id: 'youtube', label: 'Filter YouTube to Japanese', tone: 'off', pressed: false }],
        }));
        await settle();

        expect(sendMessage).toHaveBeenCalledWith(7, { channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'list', id: '' }, { frameId: 0 });
        expect(document.querySelectorAll('[role="group"]')).toHaveLength(1);
        expect(document.querySelectorAll('header,h1,[data-primary-actions],[data-script-menu-section],[role="menu"]')).toHaveLength(0);
        expect(buttons().map(button => [button.textContent, button.getAttribute('aria-pressed')])).toEqual([
            ['Pause annotations', null],
            ['Filter YouTube to Japanese', 'false'],
            ['Study', null],
            ['Settings', null],
        ]);
        buttons()[2]!.click();
        await settle();
        buttons()[3]!.click();
        await settle();
        expect(opened).toEqual([
            `chrome-extension://${EXTENSION_ID}/newtab/index.html`,
            `chrome-extension://${EXTENSION_ID}/newtab/index.html#settings=appearance`,
        ]);
        expect(legacySend).not.toHaveBeenCalled();
        expect(executeScript).not.toHaveBeenCalled();
    });

    it('runs an action in the page and redraws its new state', async () => {
        let paused = false;
        const { sendMessage } = mountPopup(message => {
            if (message.type === 'run' && message.id === 'power') paused = true;
            return { heading: 'On this page', settingsLabel: 'Settings', actions: [{ id: 'power', label: paused ? 'Resume annotations' : 'Pause annotations', tone: paused ? 'off' : 'on' }] };
        });
        await settle();

        buttons()[0]!.click();
        await settle();
        await settle();

        expect(sendMessage).toHaveBeenLastCalledWith(7, { channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'run', id: 'power' }, { frameId: 0 });
        expect(buttons()[0]!.textContent).toBe('Resume annotations');
    });

    it.each([
        ['en', 'Mute auto-play audio', 'Mute auto-play', 'Request Japanese sites', 'Request Japanese sites', 'Study', 'Settings'],
        ['ja', '音声の自動再生をミュート', '自動再生をミュート', '日本語版サイトをリクエスト', '日本語版サイトをリクエスト', '学習', '設定'],
    ])('keeps compact %s rows accessible with aligned decorative icons', async (_locale, audio, shortAudio, sites, shortSites, study, settings) => {
        mountPopup(() => ({
            language: _locale, studyLabel: study, settingsLabel: settings,
            actions: [
                { id: 'audio', label: audio, tone: 'on' },
                { id: 'japanese-site', label: sites, tone: 'off', pressed: false },
                { id: 'ocr', label: 'OCR: Auto', tone: 'on' },
            ],
        }));
        await settle();

        expect(document.documentElement.lang).toBe(_locale);
        expect(buttons().map(button => button.textContent)).toEqual([shortAudio, shortSites, 'OCR: Auto', study, settings]);
        expect(buttons()[0]!.getAttribute('aria-label')).toBe(audio);
        expect(buttons()[1]!.getAttribute('aria-label')).toBe(sites);
        expect(buttons()[1]!.getAttribute('aria-pressed')).toBe('false');
        for (const button of buttons()) {
            expect(button.querySelector('svg[aria-hidden="true"][focusable="false"]')).not.toBeNull();
            expect(button.querySelector('button,a,input,select')).toBeNull();
        }
        const separator = document.querySelector('main hr')!;
        expect(document.querySelectorAll('main hr')).toHaveLength(1);
        expect((separator.nextElementSibling as HTMLElement).dataset.yomuAction).toBe('study');
        expect(document.querySelector('header,h1')).toBeNull();
    });

    it('draws the state icon the page names with the puck\'s shapes', async () => {
        mountPopup(() => ({ actions: [{ id: 'power', label: 'Yomu on · furigana hidden', icon: 'furigana-hidden', tone: 'partial' }] }));
        await settle();
        const drawn = [...buttons()[0]!.querySelectorAll('svg > *')].map(shape => shape.getAttribute('d'));
        expect(drawn).toEqual(MENU_ICON_SHAPES['furigana-hidden'].map(([, attributes]) => (attributes as { d?: string }).d));
        const puckIcon = [...menuIcon('furigana-hidden').children].map(shape => shape.getAttribute('d'));
        expect(drawn).toEqual(puckIcon);
    });

    it('settles on the state the page lands in after a toggle echoes back', async () => {
        let landed = 'Yomu off';
        mountPopup(message => {
            // The run answers before the saved resume echoes back; a later list shows where it landed.
            if (message.type === 'run') {
                setTimeout(() => { landed = 'Yomu on · furigana shown'; }, 50);
                return { actions: [{ id: 'power', label: 'Yomu off', tone: 'off' }] };
            }
            return { actions: [{ id: 'power', label: landed, tone: landed === 'Yomu off' ? 'off' : 'on' }] };
        });
        await settle();
        buttons()[0]!.click();
        await settle();
        await settle();
        expect(buttons()[0]!.textContent).toBe('Yomu off');
        await new Promise(resolve => setTimeout(resolve, 1000));
        expect(buttons()[0]!.textContent).toBe('Yomu on · furigana shown');
        expect(document.activeElement).toBe(buttons()[0]);
    });

    it('preserves all three power actions and restores focus after an icon click', async () => {
        const states = [
            { label: 'Yomu on · furigana shown', tone: 'on' },
            { label: 'Yomu on · furigana hidden', tone: 'partial' },
            { label: 'Yomu off', tone: 'off' },
        ];
        let index = 0;
        const { sendMessage } = mountPopup(message => {
            if (message.type === 'run') index = (index + 1) % states.length;
            return { actions: [{ id: 'power', ...states[index] }] };
        });
        await settle();
        for (let step = 0; step < states.length; step++) {
            expect(buttons()[0]!.textContent).toBe(states[step]!.label);
            expect(buttons()[0]!.getAttribute('aria-label')).toBe(states[step]!.label);
            expect(buttons()[0]!.querySelector('svg')!.dataset.tone).toBe(states[step]!.tone);
            buttons()[0]!.querySelector('path')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await settle();
            expect(document.activeElement).toBe(buttons()[0]);
        }
        expect(sendMessage).toHaveBeenLastCalledWith(7, { channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'run', id: 'power' }, { frameId: 0 });
    });

    it('keeps unknown translated labels and OCR mode wording intact', async () => {
        mountPopup(() => ({ actions: [
            { id: 'audio', label: 'Custom audio wording', tone: 'off' },
            { id: 'ocr', label: 'OCR: タップ/ホバー', tone: 'partial' },
        ] }));
        await settle();
        expect(buttons().slice(0, 2).map(button => button.textContent)).toEqual(['Custom audio wording', 'OCR: タップ/ホバー']);
    });

    it('offers packaged Study and Settings on a tab without Yomu', async () => {
        mountPopup(() => { throw new Error('Could not establish connection. Receiving end does not exist.'); });
        await settle();
        expect(buttons().map(button => button.textContent)).toEqual(['Study', 'Settings']);
        expect(document.querySelector('main hr')).toBeNull();
    });

    it('removes stale page actions if the active page no longer answers', async () => {
        mountPopup(message => {
            if (message.type === 'run') throw new Error('Tab closed');
            return { actions: [{ id: 'power', label: 'Pause annotations', tone: 'on' }] };
        });
        await settle();
        buttons()[0]!.click();
        await settle();
        expect(buttons().map(button => button.textContent)).toEqual(['Study', 'Settings']);
        expect(document.querySelector('main hr')).toBeNull();
    });
});
