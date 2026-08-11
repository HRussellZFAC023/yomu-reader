// The Yomu Gaming window opens on ONE surface that answers two questions: what this app
// is, and what to press. Regression guard for the first run that said the same thing
// twice in two styles, offered six buttons for three actions, and used the reader's Media
// settings tab (audio sources, text-to-speech, proxy URL) as its landing surface.
//
// It also guards the follow-on failure: the hero naming a key the system never handed
// over, and a green "saved" for a shortcut that never took. Both facts come from
// `hotkeyRegistered` now, so these tests drive a bridge whose registration they control.
//
// The gaming renderer boots itself on import and pulls in the whole reader, so the shell
// is booted once for the file and each test leaves it back on Home.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { YomuGamingBridge, YomuGamingEnvironment } from '../../src/gaming/ipc';
import { activeLearningTarget } from '../../src/reader/languages/target-runtime';

const SNAPSHOT_KEY = 'yomu-gaming-settings-snapshot-v1';
const SETTINGS_KEY = 'yomu-gaming-reader-settings-v1';

let appRoot: HTMLElement;
let currentEnvironment: YomuGamingEnvironment = registeredEnvironment('CommandOrControl+Shift+Y');
let installOverlayEscapeHandler: typeof import('../../src/gaming/renderer/app').installOverlayEscapeHandler;
let gamingTargetChoiceError: typeof import('../../src/gaming/renderer/app').gamingTargetChoiceError;
// When set, the next shortcut save answers with this environment instead of registering.
let nextSaveEnvironment: YomuGamingEnvironment | null = null;

function registeredEnvironment(hotkey: string): YomuGamingEnvironment {
    return {
        platform: 'win32',
        displayServer: 'windows',
        desktop: 'windows',
        isSteamDeckSession: false,
        isPackaged: true,
        displayCount: 1,
        hotkey,
        hotkeyRegistered: true,
        trayActive: true,
        screenAccess: 'granted',
    };
}

function testBridge(): YomuGamingBridge {
    return {
        getEnvironment: async () => currentEnvironment,
        getFrozenCapture: async () => {
            throw new Error('capture unavailable in tests');
        },
        recaptureFrozenFrame: async () => {
            throw new Error('capture unavailable in tests');
        },
        openScreenSettings: async () => undefined,
        requestOcr: async () => ({ ok: false, status: 0, body: null, error: 'ocr unavailable in tests' }),
        showOverlay: async () => undefined,
        hideOverlay: async () => undefined,
        showApp: async () => undefined,
        hideApp: async () => undefined,
        openExternal: async () => undefined,
        updateCaptureShortcut: async (shortcut: string) => {
            currentEnvironment = nextSaveEnvironment ?? registeredEnvironment(shortcut);
            nextSaveEnvironment = null;
            return currentEnvironment;
        },
        syncSettingsSnapshot: async (settings: unknown) => {
            const syncedAt = new Date().toISOString();
            localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ version: 1, syncedAt, settings }));
            return { syncedAt, storagePath: 'test' };
        },
        restoreSettingsSnapshot: async () => {
            const raw = localStorage.getItem(SNAPSHOT_KEY);
            return raw ? JSON.parse(raw) as { version: 1; syncedAt: string; settings: unknown } : null;
        },
        setLearningTargetChosen: async () => undefined,
        onTargetChoiceRequired: () => () => undefined,
    };
}

beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.yomuGaming = testBridge();
    ({ installOverlayEscapeHandler, gamingTargetChoiceError } = await import('../../src/gaming/renderer/app'));
    await vi.waitFor(() => {
        expect(document.querySelector('[data-gaming-home] h1')).not.toBeNull();
        expect(document.querySelector('[data-gaming-home][data-target-choice-required="true"]')).not.toBeNull();
    });
    appRoot = document.querySelector<HTMLElement>('#app')!;
}, 120_000);

afterEach(() => {
    const back = appRoot.querySelector<HTMLButtonElement>('[data-action="close-settings"]');
    if (shellView() === 'settings' && back) back.click();
    // Every test in this file shares ONE app instance and one localStorage,
    // because the renderer is imported once in beforeAll. The snapshot a backup
    // test writes therefore survives into the next test, which is enough to
    // change what a later restore observes. "keeps the settings tab you were on"
    // fails intermittently inside the sharded CI suite while passing alone and
    // as a whole file, so shared state is the shape to remove — this closes the
    // intra-file half of it. Tracked as A40; do not read a green run here as
    // proof the sharded failure is gone.
    localStorage.removeItem(SNAPSHOT_KEY);
});

function shellView(): string {
    return appRoot.querySelector<HTMLElement>('.yomu-gaming-shell')?.dataset.shellView ?? '';
}

function home(): HTMLElement {
    return appRoot.querySelector<HTMLElement>('[data-gaming-home]')!;
}

function settingsForm(): HTMLFormElement {
    return appRoot.querySelector<HTMLFormElement>('[data-yomu-gaming-settings]')!;
}

function shortcutLine(): HTMLElement {
    return home().querySelector<HTMLElement>('[data-gaming-shortcut-line]')!;
}

function homeStatus(): HTMLElement {
    return home().querySelector<HTMLElement>('[data-gaming-shell-status]')!;
}

function activePanel(): string {
    return appRoot.querySelector<HTMLElement>('[data-action="settings-panel"][aria-selected="true"]')?.dataset.panel ?? '';
}

function click(scope: HTMLElement, selector: string): void {
    scope.querySelector<HTMLButtonElement>(selector)!.click();
}

function text(scope: HTMLElement, selector: string): string {
    return scope.querySelector<HTMLElement>(selector)!.textContent ?? '';
}

// The real path a user takes: open Settings, put a shortcut in the capture field, wait
// for the app to finish answering.
async function saveShortcut(value: string): Promise<void> {
    if (shellView() !== 'settings') click(home(), '[data-action="open-settings"]');
    const input = settingsForm().querySelector<HTMLInputElement>('[data-native-capture-shortcut] [data-capture-shortcut-input]')!;
    input.value = value;
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
        expect(input.disabled).toBe(false);
        expect(homeStatus().textContent ?? '').not.toContain('Saving');
    });
}

describe('Yomu Gaming first run', () => {
    it('fails capture setup closed while the compatibility profile is still unchosen', () => {
        expect(gamingTargetChoiceError({ learningTargetChosen: false, interfaceLanguage: 'en' }))
            .toBe('Choose the language you want to read before capturing your screen.');
        expect(gamingTargetChoiceError({ learningTargetChosen: false, interfaceLanguage: 'ja' }))
            .toBe('画面をキャプチャする前に、読みたい言語を選んでください。');
    });

    it('renders no ambient target or capture promise and routes the choice to Appearance', () => {
        expect(shellView()).toBe('home');
        expect(home().querySelector('h1')?.textContent).toBe('Choose the language you want to read');
        expect(home().textContent).not.toContain('Japanese');
        expect(home().querySelector('[data-action="instant-capture"]')).toBeNull();
        expect(home().querySelector('[data-action="area-capture"]')).toBeNull();
        expect(home().querySelector('[data-hotkey]')).toBeNull();
        expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();

        click(home(), '[data-action="choose-target"]');
        expect(shellView()).toBe('settings');
        expect(activePanel()).toBe('appearance');
        const target = settingsForm().querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
        expect(target.value).toBe('');
        expect(target.required).toBe(true);
        expect(target.querySelector('[data-gaming-target-placeholder]')?.textContent).toBe('Choose a language');
    });

    it('renders the target-required surface in the chosen interface language', () => {
        click(home(), '[data-action="choose-target"]');
        const language = settingsForm().querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')!;
        language.value = 'ja';
        language.dispatchEvent(new Event('change', { bubbles: true }));

        expect(home().lang).toBe('ja');
        expect(text(home(), 'h1')).toBe('読みたい言語を選んでください');
        expect(text(home(), '[data-gaming-target-body]'))
            .toBe('言語を選ぶと、画面上の対応言語を読み取れるようになります。');
        expect(text(home(), '[data-action="choose-target"]')).toBe('言語を選ぶ');
        expect(text(home(), '[data-action="open-settings"]')).toBe('設定');
        expect(text(settingsForm(), '[data-gaming-target-placeholder]')).toBe('言語を選ぶ');
        expect(`${home().textContent}${settingsForm().textContent}`).not.toContain('未翻訳');

        language.value = 'en';
        language.dispatchEvent(new Event('change', { bubbles: true }));
        expect(home().lang).toBe('en');
        expect(text(home(), 'h1')).toBe('Choose the language you want to read');
    });

    it('keeps unrelated saves unchosen, then adopts an actual target selection immediately', async () => {
        click(home(), '[data-action="choose-target"]');
        const oldForm = settingsForm();
        const target = oldForm.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
        // An unrelated settings write must preserve the unchosen state. The
        // compatibility Japanese profile is not consent to use Japanese.
        click(settingsForm(), '[data-theme-switch]');
        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({ learningTargetChosen: false });
        expect(settingsForm().querySelector<HTMLSelectElement>('select[name="targetLanguage"]')?.value).toBe('');

        target.value = 'es';
        const delayedPersist = vi.spyOn(window, 'setTimeout');
        target.dispatchEvent(new Event('input', { bubbles: true }));
        const delayedPersistCount = delayedPersist.mock.calls.length;
        delayedPersist.mockRestore();
        expect(delayedPersistCount).toBe(0);
        target.dispatchEvent(new Event('change', { bubbles: true }));
        await vi.waitFor(() => {
            expect(shellView()).toBe('home');
            expect(home().querySelector('h1')?.textContent).toBe('Read Spanish anywhere on your screen');
        });
        expect(oldForm.isConnected).toBe(false);
        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({ learningTargetChosen: true });
        expect(activeLearningTarget().language).toBe('es');

        // Leave the shared renderer in the Japanese state exercised by the
        // existing Gaming fixture and the rest of this contract file.
        click(home(), '[data-action="open-settings"]');
        click(settingsForm(), '[data-action="settings-panel"][data-panel="appearance"]');
        const chosenTarget = settingsForm().querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
        chosenTarget.value = 'ja';
        chosenTarget.dispatchEvent(new Event('change', { bubbles: true }));
        await vi.waitFor(() => expect(activeLearningTarget().language).toBe('ja'));
        click(settingsForm(), '[data-action="close-settings"]');
    });

    it('lands on one hero with one primary action and the shortcut shown once', () => {
        expect(shellView()).toBe('home');
        expect(home().hidden).toBe(false);
        expect(settingsForm().hidden).toBe(true);

        const headings = appRoot.querySelectorAll('h1');
        expect(headings).toHaveLength(1);
        expect(headings[0]?.textContent).toBe('Read Japanese anywhere on your screen');

        const actions = Array.from(home().querySelectorAll<HTMLButtonElement>('button[data-action]'));
        expect(actions.map(button => button.dataset.action)).toEqual(['instant-capture', 'area-capture', 'open-settings']);
        expect(actions.filter(button => button.classList.contains('add'))).toHaveLength(1);
        expect(appRoot.querySelectorAll('[data-hotkey]')).toHaveLength(1);
        expect(shortcutLine().querySelector('[data-hotkey]')?.textContent).toBe('Ctrl+Shift+Y');
    });

    it('says what it does without leaking mechanism or narrowing to games', () => {
        const copy = home().textContent ?? '';
        expect(copy).toContain('Read Japanese anywhere on your screen');
        expect(copy).toContain('Read my screen');
        expect(copy).not.toMatch(/OCR|Google Lens|proxy/i);
        expect(copy).not.toMatch(/game text|in games/i);
    });

    it('adds nothing to the hero while the shortcut works', () => {
        expect(shortcutLine().dataset.shortcutReady).toBe('true');
        expect(shortcutLine().textContent).toContain('any time, in any app');
        expect(homeStatus().hidden).toBe(true);
        expect(homeStatus().textContent).toBe('');
    });

    it('opens settings on the capture shortcut, never on the media tab', () => {
        click(home(), '[data-action="open-settings"]');

        expect(shellView()).toBe('settings');
        expect(home().hidden).toBe(true);
        expect(settingsForm().hidden).toBe(false);
        expect(activePanel()).not.toBe('media');
        expect(activePanel()).toBe('shortcuts');
        expect(settingsForm().querySelector('[data-native-capture-shortcut]')).not.toBeNull();
    });

    it('returns home from settings', () => {
        click(home(), '[data-action="open-settings"]');
        click(settingsForm(), '[data-action="close-settings"]');

        expect(shellView()).toBe('home');
        expect(home().hidden).toBe(false);
        expect(settingsForm().hidden).toBe(true);
    });

    it('uses one Escape for the reader popover and the next for the overlay', () => {
        const hideOverlay = vi.fn(async () => undefined);
        const dispose = installOverlayEscapeHandler(hideOverlay);
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const dismissReaderPopover = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') popover.remove();
        };
        document.addEventListener('keydown', dismissReaderPopover);

        try {
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(popover.isConnected).toBe(false);
            expect(hideOverlay).not.toHaveBeenCalled();

            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(hideOverlay).toHaveBeenCalledTimes(1);
        } finally {
            document.removeEventListener('keydown', dismissReaderPopover);
            popover.remove();
            dispose();
        }
    });

    it('keeps the settings tab you were on when a snapshot restore re-renders', async () => {
        click(home(), '[data-action="open-settings"]');
        click(settingsForm(), '[data-action="settings-panel"][data-panel="backup"]');
        expect(activePanel()).toBe('backup');

        click(settingsForm(), '[data-action="sync-cloud-settings"]');
        await vi.waitFor(() => {
            expect(localStorage.getItem(SNAPSHOT_KEY)).not.toBeNull();
        });
        click(settingsForm(), '[data-action="restore-cloud-settings"]');
        await vi.waitFor(() => {
            expect(appRoot.querySelector('[data-gaming-shell-status]')?.textContent).toContain('Settings snapshot restored');
        });

        expect(shellView()).toBe('settings');
        expect(activePanel()).toBe('backup');
    });

    it('reports a new shortcut once the keyboard has it', async () => {
        await saveShortcut('Ctrl+Shift+K');

        expect(homeStatus().textContent).toBe('Capture shortcut saved: Ctrl+Shift+K.');
        expect(homeStatus().dataset.statusTone).toBe('success');
        expect(shortcutLine().querySelector('[data-hotkey]')?.textContent).toBe('Ctrl+Shift+K');
    });

    it('offers the next step instead of a key the system kept', async () => {
        nextSaveEnvironment = {
            ...registeredEnvironment('CommandOrControl+Shift+Y'),
            hotkeyRegistered: false,
            hotkeyError: 'Ctrl+Shift+P is taken here. Try another key.',
        };
        await saveShortcut('Ctrl+Shift+P');

        // No green light for a shortcut the system never handed over.
        expect(homeStatus().dataset.statusTone).toBe('warning');
        expect(homeStatus().textContent).toBe('Ctrl+Shift+P is taken here. Try another key.');
        expect(homeStatus().textContent).not.toContain('saved');

        click(settingsForm(), '[data-action="close-settings"]');
        // The hero stops naming a key nobody can press, and says where to fix it.
        expect(shortcutLine().querySelector('[data-hotkey]')).toBeNull();
        expect(shortcutLine().dataset.shortcutReady).toBe('false');
        expect(shortcutLine().textContent).toBe('Pick a shortcut in Settings to read from any app.');
        expect(home().textContent).not.toContain('any time, in any app');
    });

    it('still declines to claim success when a save comes back quiet', async () => {
        nextSaveEnvironment = {
            ...registeredEnvironment('Control+Shift+J'),
            hotkeyRegistered: false,
        };
        await saveShortcut('Ctrl+Shift+J');

        expect(homeStatus().dataset.statusTone).toBe('warning');
        expect(homeStatus().textContent).toBe('Try another key to use the keyboard.');

        click(settingsForm(), '[data-action="close-settings"]');
        expect(shortcutLine().querySelector('[data-hotkey]')).toBeNull();
        expect(shortcutLine().textContent).toBe('Pick a shortcut in Settings to read from any app.');
    });

    it('puts the key back on the hero as soon as one registers', async () => {
        await saveShortcut('Ctrl+Shift+Y');
        click(settingsForm(), '[data-action="close-settings"]');

        expect(shortcutLine().dataset.shortcutReady).toBe('true');
        expect(shortcutLine().querySelector('[data-hotkey]')?.textContent).toBe('Ctrl+Shift+Y');
        expect(shortcutLine().textContent).toContain('any time, in any app');
    });
});
