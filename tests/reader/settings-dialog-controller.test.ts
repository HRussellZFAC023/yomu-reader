import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAudioPreviewCard } from '../../src/reader/cards/utils';
import { SETTINGS_CHANGE_EVENT } from '../../src/reader/app/constants';
import { testEnSettings } from './helpers/settings-fixture';
import type { SettingsDialogController as SettingsDialogControllerInstance } from '../../src/reader/settings/dialog-controller';

// These tests assert English UI copy; pin the interface language since the
// shipped default is now 'ja'.
const DEFAULT_SETTINGS = testEnSettings();
import type { AnkiFieldSuggestion, AnkiLibraryScanResult } from '../../src/reader/anki/types';
import type { ReaderSettings } from '../../src/reader/app/types';
import type { ImportSummary } from '../../src/reader/dictionaries/yomitan';

vi.mock('../../src/reader/anki/transport', async importOriginal => {
    const actual = await importOriginal<typeof import('../../src/reader/anki/transport')>();
    return {
        ...actual,
        diagnoseAnkiConnectFailure: vi.fn(async () => 'unreachable' as const),
    };
});

vi.mock('../../src/reader/settings/form', async importOriginal => {
    const actual = await importOriginal<typeof import('../../src/reader/settings/form')>();
    return {
        ...actual,
        // Controller tests exercise settings dialog behavior; full localization and
        // parsed-settings ruby coverage lives in settings-form/nested-text tests.
        localizeSettingsForm: vi.fn((form: HTMLFormElement, language: ReaderSettings['interfaceLanguage']) => {
            form.lang = language === 'ja' ? 'ja' : 'en';
        }),
    };
});

// tests/reader/setup imports build companions, which pulls in the controller
// before this file's mocks. Reload it here so the form seams above are active.
vi.resetModules();
const { SettingsDialogController } = await import('../../src/reader/settings/dialog-controller');

type SettingsDialogControllerConstructor = new (dependencies: Record<string, unknown>) => SettingsDialogControllerInstance;
type RefreshableSettingsDialogController = {
    refreshDeckControls: (form: HTMLFormElement) => Promise<void>;
    refreshDictionaryStatus: (form: HTMLFormElement) => Promise<void>;
};

function createSettingsDialog(overrides: Record<string, unknown> = {}): {
    dependencies: Record<string, any>;
    controller: SettingsDialogControllerInstance;
    dismiss: ReturnType<typeof vi.fn>;
    form: HTMLFormElement;
} {
    let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '' };
    const dismiss = vi.fn();
    const dependencies = {
        getSettings: () => settings,
        setSettings: (next: ReaderSettings) => { settings = next; },
        jpdb: {
            clear: vi.fn(),
            listDecks: vi.fn().mockResolvedValue([]),
        },
        dictionaries: {
            summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
        },
        anki: {
            isConnected: vi.fn().mockResolvedValue(false),
        },
        audio: { play: vi.fn(), stop: vi.fn() },
        subtitles: { refresh: vi.fn() },
        ocr: { refresh: vi.fn() },
        youtube: { refresh: vi.fn() },
        createBackdrop: () => document.createElement('div'),
        mountDialog: (backdrop: HTMLElement, form: HTMLFormElement) => document.body.append(backdrop, form),
        dismiss,
        toast: vi.fn(),
        applyTheme: vi.fn(),
        applyAccentColor: vi.fn(),
        applyWordColors: vi.fn(),
        installFab: vi.fn(),
        refreshDictionaryStyles: vi.fn().mockResolvedValue(undefined),
        scheduleDictionaryRescan: vi.fn(),
        refreshNewTabIfCurrent: vi.fn(),
        clearDictionarySourceOpenOverrides: vi.fn(),
        resetAllData: vi.fn(),
        beginSettingsPreview: vi.fn(),
        clearSettingsPreview: vi.fn(),
        ...overrides,
    };
    const controller = new (SettingsDialogController as unknown as SettingsDialogControllerConstructor)(dependencies);
    const refreshable = controller as unknown as RefreshableSettingsDialogController;
    const refreshDictionaryStatus = refreshable.refreshDictionaryStatus.bind(controller);
    refreshable.refreshDeckControls = vi.fn().mockResolvedValue(undefined);
    if (typeof (dependencies.dictionaries as Record<string, unknown>).importFromUrl === 'function') {
        let refreshCalls = 0;
        refreshable.refreshDictionaryStatus = vi.fn((form: HTMLFormElement) => {
            refreshCalls++;
            return refreshCalls === 1 ? Promise.resolve() : refreshDictionaryStatus(form);
        });
    } else {
        refreshable.refreshDictionaryStatus = vi.fn().mockResolvedValue(undefined);
    }

    controller.open();

    return {
        controller,
        dependencies,
        dismiss,
        form: document.querySelector<HTMLFormElement>('.jpdb-reader-settings')!,
    };
}

function recommendedButton(form: HTMLFormElement, id: string): HTMLButtonElement {
    return form.querySelector<HTMLButtonElement>(`[data-action="download-recommended-dictionary"][data-dictionary-id="${id}"]`)!;
}

function recommendedStatus(form: HTMLFormElement, id: string): HTMLElement {
    return recommendedButton(form, id)
        .closest<HTMLElement>('.jpdb-reader-recommended-item')!
        .querySelector<HTMLElement>('[data-recommended-dictionary-status]')!;
}

function newTabAnkiDeckToggle(form: HTMLFormElement, deck: string): HTMLInputElement {
    const toggle = Array.from(form.querySelectorAll<HTMLInputElement>('[data-newtab-anki-deck-toggle]'))
        .find(input => input.dataset.newtabAnkiDeck === deck);
    if (!toggle) throw new Error(`Missing Anki new-tab deck toggle for ${deck}`);
    return toggle;
}

type AnkiSuggestionTuple = [
    role: AnkiFieldSuggestion['role'],
    fieldName: string,
    confidence: AnkiFieldSuggestion['confidence'],
];

function singleModelAnkiScan(
    deckName: string,
    modelName: string,
    fields: string[],
    suggestions: AnkiSuggestionTuple[],
): AnkiLibraryScanResult {
    const model = {
        modelName,
        fields,
        score: 9,
        suggestions: suggestions.map(([role, fieldName, confidence]) => ({ role, fieldName, confidence })),
    };
    return {
        deckNames: [deckName],
        models: [model],
        suggestedModel: model,
    };
}

function settingsElement<T extends Element>(form: HTMLFormElement, selector: string): T {
    const element = form.querySelector<T>(selector);
    if (!element) throw new Error(`Missing settings element: ${selector}`);
    return element;
}

function settingsSelectValue(form: HTMLFormElement, selector: string): string {
    return settingsElement<HTMLSelectElement>(form, selector).value;
}

function settingsInputValue(form: HTMLFormElement, selector: string): string {
    return settingsElement<HTMLInputElement>(form, selector).value;
}

function settingsOptionValues(form: HTMLFormElement, selector: string): string[] {
    return Array.from(form.querySelectorAll<HTMLOptionElement>(selector), option => option.value);
}

function ankiFieldRoleValue(form: HTMLFormElement, role: AnkiFieldSuggestion['role']): string {
    return settingsSelectValue(form, `select[data-anki-field-role="${role}"]`);
}

function ankiConfidenceValues(form: HTMLFormElement): string[] {
    return Array.from(
        form.querySelectorAll<HTMLElement>('[data-confidence]'),
        chip => `${chip.dataset.confidence}:${chip.textContent}`,
    );
}

function settingsJsonInputValue<T>(form: HTMLFormElement, selector: string): T {
    return JSON.parse(settingsInputValue(form, selector)) as T;
}

function ankiStatusText(form: HTMLFormElement): string {
    return settingsElement<HTMLElement>(form, '[data-anki-status]').textContent ?? '';
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function flushPromises(): Promise<void> {
    return Promise.resolve();
}

function settlePreviewFrame(): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, 20));
}

function testRect(top: number, bottom: number, width = 320): DOMRect {
    return {
        x: 0,
        y: top,
        width,
        height: bottom - top,
        top,
        right: width,
        bottom,
        left: 0,
        toJSON: () => ({}),
    } as DOMRect;
}

function scaledTestRect(top: number, bottom: number, scale: number, width = 320): DOMRect {
    return testRect(top * scale, bottom * scale, width * scale);
}

function mockScaledRedditBrowser(): () => void {
    const innerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const innerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    const outerWidth = Object.getOwnPropertyDescriptor(window, 'outerWidth');
    const userAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    const platform = Object.getOwnPropertyDescriptor(navigator, 'platform');
    vi.stubGlobal('location', {
        href: 'https://www.reddit.com/r/LearnJapanese/',
        hostname: 'www.reddit.com',
        origin: 'https://www.reddit.com',
    });
    Object.defineProperties(window, {
        innerWidth: { configurable: true, value: 475 },
        innerHeight: { configurable: true, value: 612.5 },
        outerWidth: { configurable: true, value: 760 },
    });
    Object.defineProperties(navigator, {
        userAgent: {
            configurable: true,
            value: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
        },
        platform: { configurable: true, value: 'iPad' },
    });
    return () => {
        restoreProperty(window, 'innerWidth', innerWidth);
        restoreProperty(window, 'innerHeight', innerHeight);
        restoreProperty(window, 'outerWidth', outerWidth);
        restoreProperty(navigator, 'userAgent', userAgent);
        restoreProperty(navigator, 'platform', platform);
    };
}

function restoreProperty(target: object, property: string, descriptor: PropertyDescriptor | undefined): void {
    if (descriptor) Object.defineProperty(target, property, descriptor);
    else delete (target as Record<string, unknown>)[property];
}

function mockCompensatedRedditRoot(root: HTMLElement, rectScale: number): void {
    root.dataset.jpdbReaderScaleAdapter = 'reddit-apple-touch-page-scale';
    root.dataset.jpdbReaderScaleCompensation = '0.625';
    Object.defineProperties(root, {
        offsetWidth: { configurable: true, value: 400 },
        offsetHeight: { configurable: true, value: 600 },
    });
    root.getBoundingClientRect = () => new DOMRect(0, 0, 400 * rectScale, 600 * rectScale);
}

function ankiStatus(form: HTMLFormElement): HTMLElement {
    return form.querySelector<HTMLElement>('[data-anki-status]')!;
}

function ankiStatusMainText(form: HTMLFormElement): string {
    return form.querySelector<HTMLElement>('[data-anki-status] .jpdb-reader-status-main')!.textContent ?? '';
}

function ankiStatusLinkText(form: HTMLFormElement, hrefSelector: string): string {
    return form.querySelector<HTMLAnchorElement>(`[data-anki-status] ${hrefSelector}`)!.textContent ?? '';
}

async function waitForAnkiStatusText(form: HTMLFormElement, text: string): Promise<void> {
    await waitForCondition(() => ankiStatusText(form).includes(text));
}

function expectAnkiConnectSetupStatus(form: HTMLFormElement): void {
    const text = ankiStatusText(form);
    expect(ankiStatus(form).dataset.statusTone).toBe('pending');
    expect(ankiStatusMainText(form)).toContain('Needs setup: AnkiConnect not reached');
    expect(text).toContain('Open desktop Anki');
    expect(ankiStatusLinkText(form, 'a[href="https://ankiweb.net/shared/info/2055492159"]')).toContain('Install/enable AnkiConnect');
    expect(ankiStatusLinkText(form, 'a[href$="getting-started#use-desktop-anki-from-a-phone-ipad-or-android"]')).toContain('Mobile setup docs');
    expect(text).toContain('Use the LAN/Tailscale URL on mobile');
    expect(text).not.toContain('enable handoff');
    expect(text).not.toContain('install or enable AnkiConnect, then check again');
    expect(text).not.toContain('webCorsOriginList');
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt++) {
        if (predicate()) return;
        await flushPromises();
        if (predicate()) return;
        await new Promise(resolve => window.setTimeout(resolve, 0));
        if (predicate()) return;
    }
    throw new Error('Condition was not met.');
}

function importSummary(dictionary: string): ImportSummary {
    return {
        dictionaries: [dictionary],
        dictionaryTypes: { [dictionary]: 'terms' },
        entries: 1,
        terms: 1,
        kanji: 0,
        termMeta: 0,
        kanjiMeta: 0,
    };
}

describe('settings dialog keyboard dismissal', () => {
    afterEach(() => {
        document.body.replaceChildren();
        localStorage.clear();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('closes when Escape is pressed from a settings text field', () => {
        const opener = document.createElement('button');
        document.body.append(opener);
        opener.focus();
        const { dismiss, form } = createSettingsDialog();
        const input = form.querySelector<HTMLInputElement>('input[name="apiCredentialJpdb"]')!;
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

        expect(opener.getAttribute('aria-hidden')).toBe('true');
        expect((opener as HTMLElement & { inert?: boolean }).inert).not.toBe(true);

        input.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(dismiss).toHaveBeenCalledOnce();
        expect(opener.hasAttribute('aria-hidden')).toBe(false);
        expect((opener as HTMLElement & { inert?: boolean }).inert).not.toBe(true);
        expect(document.activeElement).toBe(opener);
    });

    it('does not keep refreshing parsed settings text after cancel closes the dialog', async () => {
        const parseSettingsJapanese = vi.fn();
        const { controller, dismiss, form } = createSettingsDialog({ parseSettingsJapanese });

        await waitForCondition(() => parseSettingsJapanese.mock.calls.some(([target]) => target === form));
        parseSettingsJapanese.mockClear();

        form.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.click();
        controller.refreshLanguage('ja');

        expect(dismiss).toHaveBeenCalledOnce();
        expect(parseSettingsJapanese).not.toHaveBeenCalled();
    });

    it('releases the hidden page when torn down outside the controller (backdrop, factory reset, close-popup shortcut)', () => {
        // Regression: these paths run through ReaderApp.dismiss(), not the
        // controller's own close, so the page stayed aria-hidden until the user
        // reloaded.
        const page = document.createElement('main');
        document.body.append(page);
        const { controller } = createSettingsDialog();

        expect(page.getAttribute('aria-hidden')).toBe('true');
        expect((page as HTMLElement & { inert?: boolean }).inert).not.toBe(true);

        controller.releaseModalBackground();

        expect(page.hasAttribute('aria-hidden')).toBe(false);
        expect((page as HTMLElement & { inert?: boolean }).inert).not.toBe(true);
    });

    it('keeps releasing the modal background idempotent', () => {
        const page = document.createElement('main');
        document.body.append(page);
        const { controller } = createSettingsDialog();

        controller.releaseModalBackground();
        expect(() => controller.releaseModalBackground()).not.toThrow();
        expect(page.hasAttribute('aria-hidden')).toBe(false);
        expect((page as HTMLElement & { inert?: boolean }).inert).not.toBe(true);
    });

    it('wraps Tab focus within the settings dialog', () => {
        const { form } = createSettingsDialog();
        const first = form.querySelector<HTMLElement>('.jpdb-reader-settings-drag-handle')!;
        const last = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

        last.focus();
        const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        last.dispatchEvent(forward);

        expect(forward.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(first);

        const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
        first.dispatchEvent(backward);

        expect(backward.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(last);
    });

    it('scrolls focused settings controls above the mobile keyboard and footer', () => {
        const rafDescriptor = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
        const viewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
        const viewport = new EventTarget() as VisualViewport;
        Object.defineProperties(viewport, {
            height: { configurable: true, value: 460 },
            width: { configurable: true, value: 390 },
            offsetLeft: { configurable: true, value: 0 },
            offsetTop: { configurable: true, value: 0 },
            pageLeft: { configurable: true, value: 0 },
            pageTop: { configurable: true, value: 0 },
            scale: { configurable: true, value: 1 },
        });
        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            value: (callback: FrameRequestCallback) => {
                callback(0);
                return 1;
            },
        });
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });

        try {
            const { form } = createSettingsDialog();
            const scroll = form.querySelector<HTMLElement>('.jpdb-reader-settings-scroll')!;
            const footer = form.querySelector<HTMLElement>('.footer')!;
            const input = form.querySelector<HTMLInputElement>('input[name="apiCredentialJpdb"]')!;

            vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue(testRect(118, 374));
            vi.spyOn(footer, 'getBoundingClientRect').mockReturnValue(testRect(390, 454));
            vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(testRect(360, 414));

            input.focus();
            scroll.scrollTop = 0;
            input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

            expect(scroll.scrollTop).toBe(56);
        } finally {
            if (rafDescriptor) Object.defineProperty(window, 'requestAnimationFrame', rafDescriptor);
            else delete (window as unknown as Record<string, unknown>).requestAnimationFrame;
            if (viewportDescriptor) Object.defineProperty(window, 'visualViewport', viewportDescriptor);
            else delete (window as unknown as Record<string, unknown>).visualViewport;
        }
    });

    it.each([
        ['overlay-space BCRs', 1],
        ['inverse-zoomed layout-space BCRs', 0.625],
    ])('scrolls Reddit settings controls consistently with WebKit %s', (_mode, rectScale) => {
        const restoreBrowser = mockScaledRedditBrowser();
        const rafDescriptor = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
        const viewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
        const viewport = new EventTarget() as VisualViewport;
        Object.defineProperties(viewport, {
            height: { configurable: true, value: 287.5 },
            width: { configurable: true, value: 243.75 },
            offsetLeft: { configurable: true, value: 0 },
            offsetTop: { configurable: true, value: 0 },
            pageLeft: { configurable: true, value: 0 },
            pageTop: { configurable: true, value: 0 },
            scale: { configurable: true, value: 1 },
        });
        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            value: (callback: FrameRequestCallback) => {
                callback(0);
                return 1;
            },
        });
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });

        try {
            const { form } = createSettingsDialog();
            const scroll = form.querySelector<HTMLElement>('.jpdb-reader-settings-scroll')!;
            const footer = form.querySelector<HTMLElement>('.footer')!;
            const input = form.querySelector<HTMLInputElement>('input[name="apiCredentialJpdb"]')!;
            mockCompensatedRedditRoot(form, rectScale);

            vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue(scaledTestRect(118, 374, rectScale));
            vi.spyOn(footer, 'getBoundingClientRect').mockReturnValue(scaledTestRect(390, 454, rectScale));
            vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(scaledTestRect(360, 414, rectScale));

            input.focus();
            scroll.scrollTop = 0;
            input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

            expect(scroll.scrollTop).toBe(56);
        } finally {
            restoreBrowser();
            if (rafDescriptor) Object.defineProperty(window, 'requestAnimationFrame', rafDescriptor);
            else delete (window as unknown as Record<string, unknown>).requestAnimationFrame;
            if (viewportDescriptor) Object.defineProperty(window, 'visualViewport', viewportDescriptor);
            else delete (window as unknown as Record<string, unknown>).visualViewport;
        }
    });

    it('lets shortcut fields record Escape without closing the dialog', () => {
        const { dismiss, form } = createSettingsDialog();
        const shortcut = form.querySelector<HTMLInputElement>('input[name="shortcuts.closePopup"]')!;
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

        shortcut.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(shortcut.value).toBe('Escape');
        expect(dismiss).not.toHaveBeenCalled();
    });

    it('requests Japanese settings parsing after opening, language changes, and tab changes', async () => {
        const parseSettingsJapanese = vi.fn();
        const { form } = createSettingsDialog({
            parseSettingsJapanese,
            dictionaries: { summary: vi.fn(() => new Promise(() => undefined)) },
        });
        const language = form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')!;

        await waitForCondition(() => parseSettingsJapanese.mock.calls.some(([target]) => target === form));

        parseSettingsJapanese.mockClear();
        language.value = 'ja';
        language.dispatchEvent(new Event('change', { bubbles: true }));

        await waitForCondition(() => parseSettingsJapanese.mock.calls.some(([target]) => target === form));

        parseSettingsJapanese.mockClear();
        form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="dictionaries"]')?.click();

        await waitForCondition(() => parseSettingsJapanese.mock.calls.some(([target]) => target === form));
    });

    it('activates a settings tab before starting its deferred Japanese annotation pass', async () => {
        const frames = new Map<number, FrameRequestCallback>();
        let nextFrame = 0;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            const id = ++nextFrame;
            frames.set(id, callback);
            return id;
        });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
            frames.delete(id);
        });
        const parseSettingsJapanese = vi.fn();
        const { form } = createSettingsDialog({
            parseSettingsJapanese,
            dictionaries: { summary: vi.fn(() => new Promise(() => undefined)) },
        });
        const helpTab = form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="help"]')!;

        helpTab.click();

        expect(helpTab.getAttribute('aria-selected')).toBe('true');
        expect(form.querySelector<HTMLElement>('[data-settings-panel="help"]')?.hidden).toBe(false);
        expect(parseSettingsJapanese).not.toHaveBeenCalled();

        const pending = Array.from(frames.values());
        expect(pending).toHaveLength(1);
        pending[0]?.(performance.now());

        expect(parseSettingsJapanese).not.toHaveBeenCalled();
        // Dynamic status writes (the help panel's version check) coalesce the
        // deferred pass by cancelling and re-scheduling it on a fresh frame —
        // keep pumping mocked frames until the parse actually lands.
        await waitForCondition(() => {
            for (const [id, frame] of Array.from(frames)) {
                frames.delete(id);
                frame(performance.now());
            }
            return parseSettingsJapanese.mock.calls.some(([target]) => target === form);
        });
    });

    it('lets passive parsed settings tab words activate the tab instead of opening lookup', () => {
        const lookupText = vi.fn();
        const { form } = createSettingsDialog({ lookupText });
        const helpTab = form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="help"]')!;
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-reader-passive-word';
        word.dataset.jpdbReaderPassive = 'true';
        word.textContent = helpTab.textContent || 'Help';
        helpTab.replaceChildren(word);

        word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(helpTab.getAttribute('aria-selected')).toBe('true');
        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="appearance"]')?.getAttribute('aria-selected')).toBe('false');
        expect(lookupText).not.toHaveBeenCalled();

        const preview = document.createElement('span');
        preview.className = 'jpdb-reader-word jpdb-reader-passive-word';
        preview.dataset.jpdbReaderPassive = 'true';
        preview.dataset.settingsPreviewLookup = '読む';
        preview.textContent = '読む';
        form.append(preview);
        preview.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(lookupText).toHaveBeenCalledWith('読む', '読む', preview);
    });

    it('opens lookup for passive parsed settings copy without falling through to selection lookup', () => {
        const lookupText = vi.fn();
        const { form } = createSettingsDialog({ lookupText });
        const help = document.createElement('div');
        help.className = 'jpdb-reader-help';
        help.innerHTML = '<span class="jpdb-reader-word jpdb-reader-passive-word" data-jpdb-reader-passive="true" data-expression="開ける" data-sentence="リーダーツールをここから開けます。">開けます</span>';
        form.append(help);
        const word = help.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(word);
        selection?.removeAllRanges();
        selection?.addRange(range);

        word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(lookupText).toHaveBeenCalledWith('開ける', 'リーダーツールをここから開けます。', word);
        expect(window.getSelection()?.toString()).toBe('開けます');
    });

    it('publishes and consumes shared theme changes', () => {
        const events: Array<CustomEvent<{ preview?: boolean; settings?: { theme?: unknown } }>> = [];
        const controller = new AbortController();
        window.addEventListener(SETTINGS_CHANGE_EVENT, event => {
            events.push(event as CustomEvent<{ preview?: boolean; settings?: { theme?: unknown } }>);
        }, { signal: controller.signal });
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, theme: 'dark' };
        const { dependencies, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
        });
        const button = form.querySelector<HTMLButtonElement>('[data-theme-switch]')!;
        const input = form.querySelector<HTMLInputElement>('[data-theme-value]')!;

        try {
            button.click();

            expect(input.value).toBe('light');
            expect(button.getAttribute('aria-checked')).toBe('false');
            expect(events.at(-1)?.detail.settings?.theme).toBe('light');
            expect(events.at(-1)?.detail.preview).toBe(true);

            window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { settings: { theme: 'dark' } } }));

            expect(input.value).toBe('dark');
            expect(button.getAttribute('aria-checked')).toBe('true');
            expect(dependencies.getSettings().theme).toBe('dark');
            expect(dependencies.applyTheme).toHaveBeenCalled();
        } finally {
            controller.abort();
        }
    });

    it('coalesces accent picker previews and publishes only committed color changes', async () => {
        const events: Array<CustomEvent<{ preview?: boolean; settings?: { accentColor?: unknown } }>> = [];
        const controller = new AbortController();
        window.addEventListener(SETTINGS_CHANGE_EVENT, event => {
            events.push(event as CustomEvent<{ preview?: boolean; settings?: { accentColor?: unknown } }>);
        }, { signal: controller.signal });
        const { dependencies, form } = createSettingsDialog();
        const input = form.querySelector<HTMLInputElement>('input[name="accentColor"]')!;

        try {
            input.value = '#123456';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.value = '#654321';
            input.dispatchEvent(new Event('input', { bubbles: true }));

            expect(dependencies.applyAccentColor).not.toHaveBeenCalled();
            expect(events).toHaveLength(0);

            await settlePreviewFrame();

            expect(dependencies.applyAccentColor).toHaveBeenCalledTimes(1);
            expect(dependencies.applyAccentColor).toHaveBeenCalledWith('#654321');
            expect(events).toHaveLength(0);

            input.dispatchEvent(new Event('change', { bubbles: true }));

            expect(dependencies.applyAccentColor).toHaveBeenCalledTimes(2);
            expect(events.at(-1)?.detail.settings?.accentColor).toBe('#654321');
            expect(events.at(-1)?.detail.preview).toBe(true);
        } finally {
            controller.abort();
        }
    });

    it('maps quick setup presets onto complete reader and subtitle color controls', () => {
        const { dependencies, form } = createSettingsDialog();
        const preset = form.querySelector<HTMLSelectElement>('select[name="appearancePreset"]')!;
        const selectValue = (name: string): string => form.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!.value;
        const choosePreset = (value: string): void => {
            preset.value = value;
            preset.dispatchEvent(new Event('change', { bubbles: true }));
        };

        choosePreset('new-only');

        expect(selectValue('wordColorStates')).toBe('new-only');
        expect(selectValue('furiganaMode')).toBe('difficult-kanji');
        expect(selectValue('wordHighlightColorSource')).toBe('jpdb');
        expect(selectValue('wordUnderlineColorSource')).toBe('pitch');
        expect(selectValue('wordTextColorSource')).toBe('anki');
        expect(selectValue('subtitleHighlightColorSource')).toBe('jpdb');
        expect(selectValue('subtitleUnderlineColorSource')).toBe('pitch');
        expect(selectValue('subtitleTextColorSource')).toBe('anki');

        choosePreset('underline-new');

        expect(selectValue('wordColorStates')).toBe('new-only');
        expect(selectValue('furiganaMode')).toBe('hover');
        expect(selectValue('wordHighlightColorSource')).toBe('off');
        expect(selectValue('wordUnderlineColorSource')).toBe('jpdb');
        expect(selectValue('wordTextColorSource')).toBe('off');
        expect(selectValue('subtitleHighlightColorSource')).toBe('off');
        expect(selectValue('subtitleUnderlineColorSource')).toBe('jpdb');
        expect(selectValue('subtitleTextColorSource')).toBe('off');

        choosePreset('no-colors');

        expect(selectValue('wordColorStates')).toBe('all');
        expect(selectValue('furiganaMode')).toBe('off');
        expect(selectValue('wordHighlightColorSource')).toBe('off');
        expect(selectValue('wordUnderlineColorSource')).toBe('off');
        expect(selectValue('wordTextColorSource')).toBe('off');
        expect(selectValue('subtitleHighlightColorSource')).toBe('off');
        expect(selectValue('subtitleUnderlineColorSource')).toBe('off');
        expect(selectValue('subtitleTextColorSource')).toBe('off');
        expect(dependencies.applyTheme).toHaveBeenCalled();
    });

    it('refreshes the Anki template preview when front content toggles change', () => {
        const { form } = createSettingsDialog();
        const preview = form.querySelector<HTMLElement>('[data-anki-template-preview]')!;
        const reading = form.querySelector<HTMLInputElement>('input[name="ankiFrontReading"]')!;
        const sentence = form.querySelector<HTMLInputElement>('input[name="ankiFrontSentence"]')!;
        const image = form.querySelector<HTMLInputElement>('input[name="ankiFrontImage"]')!;

        expect(preview.querySelectorAll('.jpdb-reader-template-reading')).toHaveLength(2);
        expect(preview.textContent).toContain('今日は本を読む。');
        expect(preview.textContent).toContain('Image appears on the front');

        reading.checked = false;
        reading.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preview.querySelectorAll('.jpdb-reader-template-reading')).toHaveLength(1);

        sentence.checked = false;
        sentence.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preview.textContent).not.toContain('今日は本を読む。');

        image.checked = false;
        image.dispatchEvent(new Event('change', { bubbles: true }));
        expect(preview.textContent).not.toContain('Image appears on the front');
    });

    it('keeps Anki tag chips and hidden form value in sync', () => {
        const { form } = createSettingsDialog();
        const hidden = form.querySelector<HTMLInputElement>('input[name="ankiTags"]')!;
        const input = form.querySelector<HTMLInputElement>('[data-anki-tag-input]')!;
        const add = form.querySelector<HTMLButtonElement>('[data-action="anki-tag-add"]')!;

        expect(hidden.value).toBe('yomu');

        input.value = 'core, yomu immersion';
        add.click();

        expect(hidden.value).toBe('yomu core immersion');
        expect(Array.from(form.querySelectorAll<HTMLElement>('[data-anki-tag-chips] .jpdb-reader-tag-chip'))
            .map(chip => chip.dataset.tag)).toEqual(['yomu', 'core', 'immersion']);

        form.querySelector<HTMLButtonElement>('[data-action="anki-tag-remove"][data-tag="core"]')?.click();

        expect(hidden.value).toBe('yomu immersion');
        expect(Array.from(form.querySelectorAll<HTMLElement>('[data-anki-tag-chips] .jpdb-reader-tag-chip'))
            .map(chip => chip.dataset.tag)).toEqual(['yomu', 'immersion']);
    });

    it('dismisses and toasts without waiting for dictionary styles to refresh', async () => {
        const refresh = deferred<void>();
        const refreshDictionaryStyles = vi.fn(() => refresh.promise);
        const { dependencies, dismiss, form } = createSettingsDialog({
            dictionaries: {
                summary: vi.fn(() => new Promise(() => undefined)),
            },
            refreshDictionaryStyles,
        });

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => dismiss.mock.calls.length === 1);

        expect(refreshDictionaryStyles).toHaveBeenCalled();
        expect(dependencies.toast).toHaveBeenCalledWith('Settings saved.');

        refresh.resolve();
    });

    it('keeps changed account details unsaved when Firefox consent is denied', async () => {
        const request = vi.fn().mockResolvedValue(false);
        const setValue = vi.fn();
        vi.stubGlobal('browser', { runtime: { id: 'yomu@yomureader.com' }, permissions: { request } });
        vi.stubGlobal('GM_setValue', setValue);
        const { dependencies, dismiss, form } = createSettingsDialog();
        form.querySelector<HTMLInputElement>('input[name="apiCredentialJpdb"]')!.value = 'jpdb-private-key';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => dependencies.toast.mock.calls.length > 0);

        expect(request).toHaveBeenCalledWith({ data_collection: ['authenticationInfo'] });
        expect(setValue).not.toHaveBeenCalled();
        expect(dismiss).not.toHaveBeenCalled();
        expect(dependencies.toast).toHaveBeenCalledWith(
            'Those account details were not saved because Firefox permission was not granted.',
        );
    });

    it('fails closed for account details and settings imports in a Firefox content script', async () => {
        vi.stubGlobal('browser', { runtime: { id: 'yomu@yomureader.com' } });
        const setValue = vi.fn();
        vi.stubGlobal('GM_setValue', setValue);
        const { dependencies, dismiss, form } = createSettingsDialog();
        form.querySelector<HTMLInputElement>('input[name="apiCredentialJpdb"]')!.value = 'jpdb-private-key';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => dependencies.toast.mock.calls.length > 0);

        expect(setValue).not.toHaveBeenCalled();
        expect(dismiss).not.toHaveBeenCalled();
        expect(dependencies.toast).toHaveBeenCalledWith(
            'Firefox can only ask for that permission on a Yomu page. Open Study, then add the account details in Settings.',
        );

        dependencies.toast.mockClear();
        const settingsFile = form.querySelector<HTMLInputElement>('input[data-file="settings"]')!;
        const openFilePicker = vi.spyOn(settingsFile, 'click');
        form.querySelector<HTMLButtonElement>('[data-action="import-yomitan-settings"]')!.click();
        await waitForCondition(() => dependencies.toast.mock.calls.length > 0);
        expect(dependencies.toast).toHaveBeenCalledWith(
            'Firefox can only ask for that permission on a Yomu page. Open Study, then add the account details in Settings.',
        );
        expect(openFilePicker).not.toHaveBeenCalled();
    });

    it('does not dismiss or toast from a stale save after settings is reopened', async () => {
        const storage = deferred<void>();
        const setValue = vi.fn(() => storage.promise);
        vi.stubGlobal('GM_setValue', setValue);
        const { controller, dependencies, dismiss, form } = createSettingsDialog();

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => setValue.mock.calls.length === 1);
        form.remove();
        controller.open();

        storage.resolve();
        await flushPromises();
        await flushPromises();

        expect(dismiss).not.toHaveBeenCalled();
        expect(dependencies.toast).not.toHaveBeenCalledWith('Settings saved.');
    });

    it('previews JPDB text-to-speech with the standard よむ sample card', async () => {
        const play = vi.fn();
        const playJpdbAudio = vi.fn().mockResolvedValue(true);
        const { form } = createSettingsDialog({
            audio: { play, playJpdbAudio, stop: vi.fn() },
        });
        const jpdbRow = Array.from(form.querySelectorAll<HTMLElement>('[data-audio-source-row]'))
            .find(row => row.querySelector<HTMLSelectElement>('select[name$=".type"]')?.value === 'jpdb-tts');
        const preview = jpdbRow?.querySelector<HTMLButtonElement>('[data-action="preview-audio"]');

        preview?.click();
        await waitForCondition(() => play.mock.calls.length === 1);

        expect(play).toHaveBeenCalledWith(createAudioPreviewCard(), { userGesture: true });
        expect(playJpdbAudio).not.toHaveBeenCalled();
    });

    it('tests Anki with a read-only connection check without warming disabled status', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false };
        const isConnected = vi.fn().mockResolvedValue(true);
        const ensureDeckAndModel = vi.fn().mockResolvedValue(undefined);
        const warmStatusIndex = vi.fn().mockResolvedValue(null);
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: {
                isConnected,
                ensureDeckAndModel,
                warmStatusIndex,
            },
        });

        form.querySelector<HTMLButtonElement>('[data-action="test-anki"]')?.click();
        await waitForCondition(() => form.querySelector<HTMLElement>('[data-anki-status]')?.textContent?.includes('Connected. AnkiConnect is reachable.') ?? false);
        await waitForCondition(() => form.querySelector<HTMLElement>('[data-anki-status]')?.dataset.statusTone === 'success');

        expect(isConnected).toHaveBeenCalledOnce();
        expect(ensureDeckAndModel).not.toHaveBeenCalled();
        expect(warmStatusIndex).not.toHaveBeenCalled();
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.dataset.statusTone).toBe('success');
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.textContent).toContain('Connected. AnkiConnect is reachable.');
    });

    it('shows disabled Anki status without probing when Anki mining is off', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false };
        const isConnected = vi.fn().mockResolvedValue(true);
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: { isConnected },
        });

        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.textContent).toContain('Anki mining disabled');
        await flushPromises();
        expect(isConnected).not.toHaveBeenCalled();
    });

    it('checks AnkiConnect automatically when Anki mining is enabled on open', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true, ankiMobileHandoff: true };
        const isConnected = vi.fn().mockResolvedValue(true);
        const warmStatusIndex = vi.fn().mockResolvedValue(null);
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: { isConnected, warmStatusIndex },
        });

        await waitForCondition(() => form.querySelector<HTMLElement>('[data-anki-status]')?.textContent?.includes('Connected. AnkiConnect is reachable.') ?? false);
        await waitForCondition(() => warmStatusIndex.mock.calls.length === 1);

        expect(isConnected).toHaveBeenCalledOnce();
        expect(warmStatusIndex).toHaveBeenCalledOnce();
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.dataset.statusTone).toBe('success');
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.textContent).toContain('Ready:');
    });

    it('refreshes the Anki status probe when enabled state or URL changes', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false };
        const isConnected = vi.fn()
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: { isConnected },
        });
        const enabled = form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]')!;
        const url = form.querySelector<HTMLInputElement>('input[name="ankiConnectUrl"]')!;

        enabled.checked = true;
        enabled.dispatchEvent(new Event('change', { bubbles: true }));
        await waitForCondition(() => form.querySelector<HTMLElement>('[data-anki-status]')?.dataset.statusTone === 'success');

        url.value = 'http://127.0.0.1:9999';
        url.dispatchEvent(new Event('change', { bubbles: true }));
        await waitForAnkiStatusText(form, 'AnkiConnect not reached');

        expect(isConnected).toHaveBeenCalledTimes(2);
        expectAnkiConnectSetupStatus(form);
    });

    it('keeps a failed manual AnkiConnect check in the setup tone instead of showing a hard error', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true, ankiMobileHandoff: true };
        const isConnected = vi.fn().mockResolvedValue(false);
        const toast = vi.fn();
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: { isConnected },
            toast,
        });

        form.querySelector<HTMLButtonElement>('[data-action="test-anki"]')?.click();
        await waitForAnkiStatusText(form, 'AnkiConnect not reached');

        expectAnkiConnectSetupStatus(form);
        expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('AnkiConnect not reached'));
    });

    it('keeps a thrown AnkiConnect probe in the setup tone instead of showing a hard error', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true };
        const isConnected = vi.fn().mockRejectedValue(new Error('AnkiConnect request failed.'));
        const toast = vi.fn();
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: { isConnected },
            toast,
        });

        form.querySelector<HTMLButtonElement>('[data-action="test-anki"]')?.click();
        await waitForAnkiStatusText(form, 'AnkiConnect not reached');

        expectAnkiConnectSetupStatus(form);
        expect(ankiStatusText(form)).not.toContain('request failed');
        expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('AnkiConnect request failed'));
    });

    it('updates the JPDB status light when the API key field changes', () => {
        const { form } = createSettingsDialog();
        const status = form.querySelector<HTMLElement>('[data-jpdb-status]')!;
        const apiKey = form.querySelector<HTMLInputElement>('input[name="apiCredentialJpdb"]')!;
        const enableReviews = form.querySelector<HTMLInputElement>('input[name="enableReviews"]')!;
        const jpdbMiningEnabled = form.querySelector<HTMLInputElement>('input[name="jpdbMiningEnabled"]')!;

        expect(status.dataset.statusTone).toBe('pending');

        apiKey.value = 'jpdb-key';
        apiKey.dispatchEvent(new Event('input', { bubbles: true }));

        expect(status.dataset.statusTone).toBe('success');
        expect(status.textContent).toContain('JPDB key set');
        expect(status.textContent).not.toContain('Reviews:');
        expect(status.textContent).not.toContain('Deck changes:');

        enableReviews.checked = false;
        enableReviews.dispatchEvent(new Event('change', { bubbles: true }));
        expect(status.textContent).toContain('JPDB key set');
        expect(status.textContent).not.toContain('Reviews:');

        jpdbMiningEnabled.checked = false;
        jpdbMiningEnabled.dispatchEvent(new Event('change', { bubbles: true }));
        expect(status.dataset.statusTone).toBe('success');
        expect(status.textContent).toContain('JPDB key set');
        expect(status.textContent).not.toContain('Deck changes:');

        apiKey.value = '';
        apiKey.dispatchEvent(new Event('input', { bubbles: true }));

        expect(status.dataset.statusTone).toBe('pending');
        expect(status.textContent).toContain('No Jiten or JPDB key');
    });

    it('upgrades the JPDB status to a live connected/rejected answer via ping', async () => {
        const ping = vi.fn().mockResolvedValue(true);
        const { form } = createSettingsDialog({
            jpdb: { clear: vi.fn(), listDecks: vi.fn().mockResolvedValue([]), ping },
        });
        const status = form.querySelector<HTMLElement>('[data-jpdb-status]')!;
        const apiKey = form.querySelector<HTMLInputElement>('input[name="apiCredentialJpdb"]')!;

        apiKey.value = 'jpdb-key';
        apiKey.dispatchEvent(new Event('change', { bubbles: true }));
        await vi.waitFor(() => expect(status.textContent).toContain('Connected to JPDB'));
        expect(status.dataset.statusTone).toBe('success');
        expect(ping).toHaveBeenCalled();

        ping.mockResolvedValue(false);
        apiKey.dispatchEvent(new Event('change', { bubbles: true }));
        await vi.waitFor(() => expect(status.textContent).toContain('did not accept the key'));
        expect(status.dataset.statusTone).toBe('error');
    });

    it('updates the API status light when the API key field changes to a Jiten key', () => {
        const { form } = createSettingsDialog();
        const status = form.querySelector<HTMLElement>('[data-jpdb-status]')!;
        const apiCredential = form.querySelector<HTMLInputElement>('input[name="apiCredentialJpdb"]')!;

        expect(status.dataset.statusTone).toBe('pending');
        expect(apiCredential.value).toBe('');
        expect(form.querySelector<HTMLInputElement>('input[name="apiKey"]')).toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[name="jitenApiKey"]')).toBeNull();
        expect(form.querySelector<HTMLElement>('[data-jiten-status]')).toBeNull();

        apiCredential.value = 'ak_jiten-key';
        apiCredential.dispatchEvent(new Event('input', { bubbles: true }));

        expect(status.dataset.statusTone).toBe('success');
        expect(status.textContent).toContain('Jiten key set');
        expect(status.textContent).not.toContain('JPDB-backed cards need a JPDB key');
    });

    it('does not render a separate Jiten connection test action', () => {
        const { form } = createSettingsDialog();

        expect(form.querySelector<HTMLButtonElement>('[data-action="check-jiten-api"]')).toBeNull();
        expect(form.querySelector<HTMLElement>('[data-jiten-status]')).toBeNull();
    });

    it('prepares the Yomu Anki deck and note type only from the explicit prepare action', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false };
        const isConnected = vi.fn().mockResolvedValue(true);
        const ensureDeckAndModel = vi.fn().mockResolvedValue(undefined);
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: {
                isConnected,
                ensureDeckAndModel,
            },
        });

        const prepare = form.querySelector<HTMLButtonElement>('[data-action="prepare-anki"]');
        expect(prepare).not.toBeNull();

        prepare?.click();
        await waitForCondition(() => ensureDeckAndModel.mock.calls.length === 1);
        await waitForCondition(() => form.querySelector<HTMLElement>('[data-anki-status]')?.textContent?.includes('Connected. "よむ" / "よむ Japanese" ready.') ?? false);

        expect(isConnected).toHaveBeenCalledOnce();
        expect(ensureDeckAndModel).toHaveBeenCalledOnce();
    });

    it('scans the Anki library after an explicit Check succeeds', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false };
        const isConnected = vi.fn().mockResolvedValue(true);
        const scanLibrary = vi.fn().mockResolvedValue(singleModelAnkiScan(
            'Checked Mining',
            'Checked Japanese',
            ['Expression', 'Reading', 'Meaning'],
            [
                ['expression', 'Expression', 'high'],
                ['reading', 'Reading', 'high'],
                ['meaning', 'Meaning', 'high'],
            ],
        ));
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: {
                isConnected,
                scanLibrary,
            },
        });
        const enabled = form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]')!;
        enabled.checked = true;
        enabled.dispatchEvent(new Event('change', { bubbles: true }));

        form.querySelector<HTMLButtonElement>('[data-action="test-anki"]')?.click();
        await waitForCondition(() => scanLibrary.mock.calls.length === 1);
        await waitForCondition(() => settingsSelectValue(form, 'select[name="ankiModel"]') === 'Checked Japanese');

        expect(isConnected).toHaveBeenCalled();
        expect(settingsSelectValue(form, 'select[name="ankiDeck"]')).toBe('Checked Mining');
        expect(ankiStatusText(form)).toContain('Checked Japanese');
    });

    it('applies the best scanned Anki deck and note type to the settings form', async () => {
        const isConnected = vi.fn().mockResolvedValue(true);
        const scanLibrary = vi.fn().mockResolvedValue(singleModelAnkiScan(
            'Anime Mining',
            'Imported Japanese',
            ['Vocabulary-Kanji', 'Vocabulary-Kana', 'Glossary'],
            [
                ['expression', 'Vocabulary-Kanji', 'high'],
                ['reading', 'Vocabulary-Kana', 'high'],
                ['meaning', 'Glossary', 'medium'],
            ],
        ));
        const { form } = createSettingsDialog({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true }),
            anki: {
                isConnected,
                scanLibrary,
            },
        });

        await waitForCondition(() => settingsSelectValue(form, 'select[name="ankiModel"]') === 'Imported Japanese');

        expect(settingsSelectValue(form, 'select[name="ankiDeck"]')).toBe('Anime Mining');
        expect(settingsSelectValue(form, 'select[name="ankiModel"]')).toBe('Imported Japanese');
        expect(settingsOptionValues(form, '[data-anki-deck-options] option')).toEqual(['Anime Mining', 'Default']);
        expect(settingsOptionValues(form, '[data-anki-model-options] option')).toEqual(['Imported Japanese']);
        expect(ankiFieldRoleValue(form, 'expression')).toBe('Vocabulary-Kanji');
        expect(ankiFieldRoleValue(form, 'reading')).toBe('Vocabulary-Kana');
        expect(ankiFieldRoleValue(form, 'meaning')).toBe('Glossary');
        expect(ankiConfidenceValues(form)).toEqual([
            'high:High',
            'high:High',
            'medium:Medium',
        ]);
        expect(settingsJsonInputValue(form, '[data-anki-scan-confidence]')).toEqual({
            'Imported Japanese': {
                expression: 'high',
                reading: 'high',
                meaning: 'medium',
            },
        });
        expect(settingsElement<HTMLElement>(form, '[data-newtab-anki-decks]').hidden).toBe(false);
        expect(newTabAnkiDeckToggle(form, 'Anime Mining').checked).toBe(true);
        expect(settingsInputValue(form, 'input[name="newTabAnkiDisabledDecks"]')).toBe('');
        expect(settingsJsonInputValue(form, 'input[name="ankiFieldMappings"]')).toEqual({
            'Imported Japanese': {
                expression: 'Vocabulary-Kanji',
                reading: 'Vocabulary-Kana',
                meaning: 'Glossary',
            },
        });
        const meaning = settingsElement<HTMLSelectElement>(form, 'select[data-anki-field-role="meaning"]');
        meaning.value = 'Vocabulary-Kana';
        meaning.dispatchEvent(new Event('change', { bubbles: true }));
        expect(settingsJsonInputValue(form, 'input[name="ankiFieldMappings"]')).toEqual({
            'Imported Japanese': {
                expression: 'Vocabulary-Kanji',
                reading: 'Vocabulary-Kana',
                meaning: 'Vocabulary-Kana',
            },
        });
        expect(ankiStatusText(form)).toContain('expression: Vocabulary-Kanji');
    });

    it('preserves live custom Anki field mappings while replacing stale scanned roles', async () => {
        const isConnected = vi.fn().mockResolvedValue(true);
        const scanLibrary = vi.fn().mockResolvedValue(singleModelAnkiScan(
            'Custom Mining',
            'Custom Japanese',
            ['Term', 'Kana', 'Glossary', 'Example Sentence'],
            [
                ['expression', 'Term', 'high'],
                ['reading', 'Kana', 'high'],
                ['meaning', 'Glossary', 'high'],
                ['sentence', 'Example Sentence', 'high'],
            ],
        ));
        const { form } = createSettingsDialog({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                ankiEnabled: true,
                ankiModel: 'Custom Japanese',
                ankiFieldMappings: {
                    'Custom Japanese': {
                        expression: 'Term',
                        reading: 'Legacy Reading',
                        meaning: 'Glossary',
                        sentence: 'Example Sentence',
                    },
                },
            }),
            anki: {
                isConnected,
                scanLibrary,
            },
        });

        await waitForCondition(() => {
            const mappings = settingsJsonInputValue(form, 'input[name="ankiFieldMappings"]') as Record<string, Partial<Record<string, string>>>;
            return mappings['Custom Japanese']?.reading === 'Kana';
        });

        expect(settingsJsonInputValue(form, 'input[name="ankiFieldMappings"]')).toEqual({
            'Custom Japanese': {
                expression: 'Term',
                reading: 'Kana',
                meaning: 'Glossary',
                sentence: 'Example Sentence',
            },
        });
        expect(ankiFieldRoleValue(form, 'reading')).toBe('Kana');
        expect(settingsElement<HTMLElement>(form, '[data-anki-status]').dataset.ankiAdapterState).toBe('stale');
        expect(ankiStatusText(form)).toContain('Needs review');
        expect(ankiStatusText(form)).toContain('reading: Legacy Reading');
        expect(ankiStatusText(form)).toContain('saved field missing');
        expect(ankiFieldRoleValue(form, 'meaning')).toBe('Glossary');
    });

    it('keeps unavailable automatic Anki scan failures quiet after a successful connection', async () => {
        const isConnected = vi.fn().mockResolvedValue(true);
        const scanLibrary = vi.fn().mockRejectedValue(new Error('AnkiConnect needs the userscript request bridge on content pages.'));
        const toast = vi.fn();
        const { form } = createSettingsDialog({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true }),
            anki: {
                isConnected,
                scanLibrary,
            },
            toast,
        });

        await waitForCondition(() =>
            scanLibrary.mock.calls.length > 0
            && (form.querySelector<HTMLElement>('[data-anki-status]')?.textContent?.includes('Connected. AnkiConnect is reachable') ?? false));

        const status = form.querySelector<HTMLElement>('[data-anki-status]');
        expect(status?.dataset.statusTone).toBe('success');
        expect(status?.textContent).toContain('Connected');
        expect(status?.textContent).not.toContain('request bridge');
        expect(toast).not.toHaveBeenCalled();
    });

    it('preserves disabled Anki deck preferences while scanning Anki library metadata', async () => {
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: true,
            newTabAnkiDisabledDecks: ['Missing Deck', 'Archive'],
        };
        const isConnected = vi.fn().mockResolvedValue(true);
        const scanLibrary = vi.fn().mockResolvedValue({
            deckNames: ['Archive', 'Mining'],
            models: [],
            suggestedModel: null,
        });
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: {
                isConnected,
                scanLibrary,
            },
        });

        await waitForCondition(() => form.querySelector<HTMLElement>('[data-anki-status]')?.textContent?.includes('Found 2 decks') === true);

        expect(scanLibrary).toHaveBeenCalled();
        expect(form.querySelector<HTMLElement>('[data-newtab-anki-decks]')?.hidden).toBe(false);
        expect(newTabAnkiDeckToggle(form, 'Missing Deck').checked).toBe(false);
        expect(newTabAnkiDeckToggle(form, 'Archive').checked).toBe(false);
        expect(newTabAnkiDeckToggle(form, 'Mining').checked).toBe(true);
        expect(form.querySelector<HTMLInputElement>('input[name="newTabAnkiDisabledDecks"]')?.value).toBe('Missing Deck, Archive');

        newTabAnkiDeckToggle(form, 'Mining').checked = false;
        newTabAnkiDeckToggle(form, 'Mining').dispatchEvent(new Event('change', { bubbles: true }));
        expect(form.querySelector<HTMLInputElement>('input[name="newTabAnkiDisabledDecks"]')?.value).toBe('Missing Deck, Archive, Mining');

        newTabAnkiDeckToggle(form, 'Archive').checked = true;
        newTabAnkiDeckToggle(form, 'Archive').dispatchEvent(new Event('change', { bubbles: true }));
        expect(form.querySelector<HTMLInputElement>('input[name="newTabAnkiDisabledDecks"]')?.value).toBe('Missing Deck, Mining');
    });

    it('skips queued automatic Anki scan and status warmup if Anki is disabled before the queue runs', async () => {
        vi.useFakeTimers();
        try {
            let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true };
            const isConnected = vi.fn().mockResolvedValue(true);
            const scanLibrary = vi.fn().mockResolvedValue({
                deckNames: ['Mining'],
                models: [],
                suggestedModel: null,
            });
            const warmStatusIndex = vi.fn().mockResolvedValue(null);
            const { form } = createSettingsDialog({
                getSettings: () => settings,
                setSettings: (next: ReaderSettings) => { settings = next; },
                anki: {
                    isConnected,
                    scanLibrary,
                    warmStatusIndex,
                },
            });

            await flushPromises();
            await flushPromises();
            expect(isConnected).toHaveBeenCalledOnce();

            form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]')!.checked = false;
            await vi.runOnlyPendingTimersAsync();
            await flushPromises();

            expect(scanLibrary).not.toHaveBeenCalled();
            expect(warmStatusIndex).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('scans Anki through AnkiConnect on mobile handoff devices when a bridge is reachable', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            configurable: true,
        });
        const isConnected = vi.fn().mockResolvedValue(true);
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true };
        const scanLibrary = vi.fn().mockResolvedValue(singleModelAnkiScan(
            'Android Bridge',
            'Bridge Japanese',
            ['Expression', 'Reading', 'Meaning'],
            [
                ['expression', 'Expression', 'high'],
                ['reading', 'Reading', 'high'],
                ['meaning', 'Meaning', 'high'],
            ],
        ));
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: {
                isConnected,
                scanLibrary,
            },
        });

        try {
            await waitForCondition(() => settingsSelectValue(form, 'select[name="ankiModel"]') === 'Bridge Japanese');

            expect(isConnected).toHaveBeenCalledOnce();
            expect(scanLibrary).toHaveBeenCalledOnce();
            expect(settingsSelectValue(form, 'select[name="ankiDeck"]')).toBe('Android Bridge');
            expect(ankiStatusText(form)).toContain('Bridge Japanese');
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
        }
    });

    it('explains mobile handoff fallback when AnkiConnect is unreachable on mobile', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            configurable: true,
        });
        const isConnected = vi.fn().mockResolvedValue(false);
        const scanLibrary = vi.fn().mockResolvedValue({ deckNames: [], models: [], suggestedModel: null });
        const warmStatusIndex = vi.fn().mockResolvedValue(null);
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true, ankiMobileHandoff: true };
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: {
                isConnected,
                scanLibrary,
                warmStatusIndex,
            },
        });

        try {
            let fallbackText = '';
            await waitForCondition(() => {
                const text = form.querySelector<HTMLElement>('[data-anki-status]')?.textContent ?? '';
                if (!text.includes('Anki offline')) return false;
                fallbackText = text;
                return true;
            });

            expect(isConnected).toHaveBeenCalledOnce();
            expect(scanLibrary).not.toHaveBeenCalled();
            expect(warmStatusIndex).not.toHaveBeenCalled();
            expect(fallbackText).toContain('create notes');
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
        }
    });
});

describe('settings dialog dictionary imports', () => {
    afterEach(() => {
        document.body.replaceChildren();
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('queues recommended dictionary installs and blocks Save until the queue finishes', async () => {
        const firstImport = deferred<ImportSummary>();
        const secondImport = deferred<ImportSummary>();
        const importFromUrl = vi.fn()
            .mockImplementationOnce((_url: string, _filename: string, onProgress?: (message: string) => void) => {
                onProgress?.('Reading dictionary ZIP...');
                return firstImport.promise;
            })
            .mockImplementationOnce((_url: string, _filename: string, onProgress?: (message: string) => void) => {
                onProgress?.('Reading dictionary ZIP...');
                return secondImport.promise;
            });
        const { dependencies, dismiss, form } = createSettingsDialog({
            dictionaries: {
                summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
                importFromUrl,
            },
        });

        recommendedButton(form, 'jitendex').click();
        recommendedButton(form, 'jmdict').click();

        await waitForCondition(() => importFromUrl.mock.calls.length === 1);

        expect(recommendedButton(form, 'jitendex').dataset.importState).toBe('installing');
        expect(recommendedStatus(form, 'jitendex').textContent).toContain('Reading dictionary ZIP');
        expect(recommendedButton(form, 'jmdict').dataset.importState).toBe('queued');
        expect(recommendedStatus(form, 'jmdict').textContent).toContain('queued');
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.dataset.saveBlocked).toBe('dictionary-import');
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toBe('Save after install');
        expect(form.querySelector<HTMLElement>('[data-settings-save-status]')?.textContent).toContain('2 installs running');

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(dependencies.toast).toHaveBeenCalledWith('Import running. Save unlocks when done.');
        expect(dismiss).not.toHaveBeenCalled();

        firstImport.resolve(importSummary('Jitendex'));
        await waitForCondition(() => importFromUrl.mock.calls.length === 2);

        expect(recommendedButton(form, 'jmdict').dataset.importState).toBe('installing');
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.dataset.saveBlocked).toBe('dictionary-import');

        secondImport.resolve(importSummary('JMdict'));
        await waitForCondition(() => form.querySelector<HTMLButtonElement>('button[type="submit"]')?.dataset.saveBlocked == null);

        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
        expect(form.querySelector<HTMLElement>('[data-settings-save-status]')?.hidden).toBe(true);
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toBe('Save');
    }, 30_000);

    it('shows a toast when a recommended dictionary install fails', async () => {
        const importFromUrl = vi.fn().mockRejectedValue(new Error('Could not remove old dictionary entries.'));
        const { dependencies, form } = createSettingsDialog({
            dictionaries: {
                summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
                importFromUrl,
            },
        });

        recommendedButton(form, 'jitendex').click();
        await waitForCondition(() => (dependencies.toast as ReturnType<typeof vi.fn>).mock.calls.length > 0);

        expect(form.querySelector<HTMLElement>('[data-import-status]')?.textContent).toBe('Could not remove old dictionary entries.');
        expect(dependencies.toast).toHaveBeenCalledWith('Could not remove old dictionary entries.');
        expect(recommendedButton(form, 'jitendex').disabled).toBe(false);
    });

    it('shows a toast with the manual download hint when automatic dictionary download is blocked', async () => {
        const importFromUrl = vi.fn().mockRejectedValue(new Error('Dictionary download is blocked in this browser.'));
        const { dependencies, form } = createSettingsDialog({
            dictionaries: {
                summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
                importFromUrl,
            },
        });

        recommendedButton(form, 'jitendex').click();
        await waitForCondition(() => (dependencies.toast as ReturnType<typeof vi.fn>).mock.calls.length > 0);

        const status = form.querySelector<HTMLElement>('[data-import-status]')?.textContent ?? '';
        expect(status).toContain('Dictionary download is blocked in this browser.');
        expect(status).toContain('import the ZIP');
        expect(dependencies.toast).toHaveBeenCalledWith(status);
        expect(recommendedButton(form, 'jitendex').disabled).toBe(false);
    });
});
