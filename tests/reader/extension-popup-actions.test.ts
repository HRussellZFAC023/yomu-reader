// The extension toolbar popup's "On this page" section (owner decision 4,
// 2026-10-07): the page answers with the puck's actions and their state, and
// the popup renders and runs them, with nothing kept in the background.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    EXTENSION_POPUP_ACTIONS_CHANNEL,
    installExtensionPopupActions,
    type ExtensionPopupActionList,
} from '../../src/reader/app/extension-popup-actions';
import type { RadialAction } from '../../src/reader/ui/radial-menu';
// @ts-expect-error The packaging hardener is a Node ESM script exercised directly by the build.
import { hardenExtensionPopupSource } from '../../scripts/lib/extension-runtime-hardening.mjs';

type Listener = (message: unknown, sender: { id?: string; tab?: unknown }, sendResponse: (response: unknown) => void) => boolean | undefined;

const EXTENSION_ID = 'yomu-extension-id';

function fakeRuntime() {
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
        { id: 'power', label: state.paused ? 'Resume annotations' : 'Pause annotations', icon: '', tone: state.paused ? 'off' : 'on', run: async () => { await Promise.resolve(); state.paused = !state.paused; } },
        { id: 'audio', label: state.audio ? 'Mute audio' : 'Unmute audio', icon: '', tone: state.audio ? 'on' : 'off', run: () => { state.audio = !state.audio; } },
        { id: 'settings', label: 'Settings', icon: '', run: vi.fn() },
        { id: 'study', label: 'Study Japanese', icon: '', run: vi.fn() },
        { id: 'youtube', label: 'Filter YouTube to Japanese', icon: '', tone: state.youtube ? 'on' : 'off', run: () => { state.youtube = !state.youtube; } },
    ];
    return { state, source: { language: () => 'en' as const, actions } };
}

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
});

describe('the page side of the extension popup', () => {
    it('lists the puck actions the popup cannot run itself, with their state', async () => {
        const { send } = fakeRuntime();
        const controller = new AbortController();
        installExtensionPopupActions(puck().source, controller.signal);

        const list = await send({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'list' }) as ExtensionPopupActionList;

        expect(list.heading).toBe('On this page');
        expect(list.settingsLabel).toBe('Settings');
        expect(list.actions).toEqual([
            { id: 'power', label: 'Pause annotations', tone: 'on', pressed: undefined },
            { id: 'audio', label: 'Mute audio', tone: 'on', pressed: undefined },
            { id: 'youtube', label: 'Filter YouTube to Japanese', tone: 'off', pressed: false },
        ]);
        controller.abort();
    });

    it('runs an action, waits for it, and answers with the new state', async () => {
        const { send } = fakeRuntime();
        const { state, source } = puck();
        installExtensionPopupActions(source, new AbortController().signal);

        const list = await send({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'run', id: 'power' }) as ExtensionPopupActionList;

        expect(state.paused).toBe(true);
        expect(list.actions[0]).toEqual({ id: 'power', label: 'Resume annotations', tone: 'off', pressed: undefined });
    });

    it('answers in the learner\'s interface language', async () => {
        const { send } = fakeRuntime();
        installExtensionPopupActions({ ...puck().source, language: () => 'ja' }, new AbortController().signal);
        const list = await send({ channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'list' }) as ExtensionPopupActionList;
        expect([list.heading, list.settingsLabel]).toEqual(['このページ', '設定']);
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
    // The compiler-generated popup's helpers that Yomu's section reuses.
    const compilerPopup = `const api = globalThis.__popupApi;
function callApi(fn, thisArg, ...args) { return Promise.resolve(fn.call(thisArg, ...args)); }
async function activeTab() { return { id: 7 }; }
async function openPath(path) { globalThis.__opened.push(path); }`;

    function mountPopup(answer: (message: { type: string; id: string }, tabId: number, options: unknown) => unknown) {
        document.body.innerHTML = '<main><section class="section"><div class="menu" data-primary-actions><button data-action="open-page">Open Study</button></div></section></main>';
        const opened: string[] = [];
        const sendMessage = vi.fn(async (tabId: number, message: { type: string; id: string }, options: unknown) => answer(message, tabId, options));
        Object.assign(globalThis, { __popupApi: { tabs: { sendMessage } }, __opened: opened });
        const source = hardenExtensionPopupSource(compilerPopup, { target: 'chrome' }) as string;
        new Function(source)();
        return { opened, sendMessage };
    }

    const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('[data-yomu-action]')];
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    afterEach(() => {
        delete (globalThis as Record<string, unknown>).__popupApi;
        delete (globalThis as Record<string, unknown>).__opened;
    });

    it('shows the page\'s actions under its heading, asking only the top frame, and opens Settings as a packaged page', async () => {
        const { opened, sendMessage } = mountPopup(() => ({
            heading: 'On this page',
            settingsLabel: 'Settings',
            actions: [{ id: 'power', label: 'Pause annotations', tone: 'on' }, { id: 'youtube', label: 'Filter YouTube to Japanese', tone: 'off', pressed: false }],
        }));
        await settle();

        expect(sendMessage).toHaveBeenCalledWith(7, { channel: EXTENSION_POPUP_ACTIONS_CHANNEL, type: 'list', id: '' }, { frameId: 0 });
        expect(document.querySelector('#yomu-page-actions-label')?.textContent).toBe('On this page');
        expect(buttons().map(button => [button.textContent, button.getAttribute('aria-pressed')])).toEqual([
            ['Pause annotations', null],
            ['Filter YouTube to Japanese', 'false'],
            ['Settings', null],
        ]);
        // The section follows the compiler's primary actions, which keep Open Study.
        expect(document.querySelector('[data-primary-actions]')?.closest('section')?.nextElementSibling?.contains(buttons()[0]!)).toBe(true);

        buttons()[2]!.click();
        await settle();
        expect(opened).toEqual(['newtab/index.html#settings=appearance']);
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

    it('still offers Settings on a tab without Yomu', async () => {
        mountPopup(() => { throw new Error('Could not establish connection. Receiving end does not exist.'); });
        await settle();
        expect(buttons().map(button => button.textContent)).toEqual(['Settings']);
        expect(document.querySelector<HTMLElement>('#yomu-page-actions-label')?.hidden).toBe(true);
    });
});
