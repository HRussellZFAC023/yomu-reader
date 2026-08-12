import { afterEach, describe, expect, it, vi } from 'vitest';
import { userFacingError } from '../../src/reader/app/user-facing-errors';

import { createAudioPreviewCard } from '../../src/reader/cards/utils';
import { SETTINGS_CHANGE_EVENT } from '../../src/reader/app/constants';
import { publishSettingsChange, subscribeToSettingsChanges, type SettingsChangeDetail } from '../../src/reader/settings/settings-change-bus';
import {
    catalogBrowseLanguageSectionsForLearnerLanguage,
    recommendedDictionariesForLearnerLanguage,
} from '../../src/reader/dictionaries/recommended';
import { catalogBrowseDictionaries } from '../../src/reader/dictionaries/catalog-browse';
import { listDictionaryArchives, persistDictionaryArchive } from '../../src/reader/dictionaries/archive-cache';
import {
    defaultDictionaryLookupLinks,
    PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
    normalizeReaderSettings,
} from '../../src/reader/settings';
import { testEnSettings } from './helpers/settings-fixture';
import type { SettingsDialogController as SettingsDialogControllerInstance } from '../../src/reader/settings/dialog-controller';
import { allowSyntheticReaderInteractionsForTests } from '../../src/reader/ui/trusted-interaction';

// These tests assert English UI copy; pin the interface language since the
// shipped default is now 'ja'.
const DEFAULT_SETTINGS = testEnSettings();
import type { AnkiFieldSuggestion, AnkiLibraryScanResult } from '../../src/reader/anki/types';
import type { ReaderSettings } from '../../src/reader/app/types';
import type { ImportSummary } from '../../src/reader/dictionaries/yomitan';

const settingsDialogTestState = vi.hoisted(() => ({ useRealLocalization: false }));

vi.mock('../../src/reader/anki/transport', async importOriginal => {
    const actual = await importOriginal<typeof import('../../src/reader/anki/transport')>();
    return {
        ...actual,
        diagnoseAnkiConnectFailure: vi.fn(async () => 'unreachable' as const),
    };
});
vi.mock('../../src/reader/dictionaries/recommended', async importOriginal => {
    const actual = await importOriginal<typeof import('../../src/reader/dictionaries/recommended')>();
    return {
        ...actual,
        // The catalogue browse suites cover the full 1,600-card shelf. Rebuilding
        // that shelf in every controller case retains gigabytes of jsdom nodes,
        // while these tests only exercise the compact recommendation shelf.
        catalogBrowseLanguageSectionsForLearnerLanguage: vi.fn(() => []),
    };
});
vi.mock('../../src/reader/settings/form', async importOriginal => {
    const actual = await importOriginal<typeof import('../../src/reader/settings/form')>();
    return {
        ...actual,
        // Controller tests exercise settings dialog behavior; full localization and
        // parsed-settings ruby coverage lives in settings-form/nested-text tests.
        localizeSettingsForm: vi.fn((form: HTMLFormElement, language: ReaderSettings['interfaceLanguage']) => {
            if (settingsDialogTestState.useRealLocalization) {
                actual.localizeSettingsForm(form, language);
                return;
            }
            form.lang = language === 'ja' ? 'ja' : 'en';
        }),
    };
});

// tests/reader/setup imports build companions, which pulls in the controller
// before this file's mocks. Reload it here so the form seams above are active.
vi.resetModules();
const { SettingsDialogController } = await import('../../src/reader/settings/dialog-controller');
// Same module instance the controller above resolved: opening a dialog probes
// each aggregator audio URL once and memoizes it, so every test must start
// without another test's cached (or still in-flight) probe.
const { getAudioCandidates, resetAudioSubSourceDiscoveryForTests } = await import('../../src/reader/audio/candidates');

type SettingsDialogControllerConstructor = new (dependencies: Record<string, unknown>) => SettingsDialogControllerInstance;
type RefreshableSettingsDialogController = {
    refreshDeckControls: (form: HTMLFormElement) => Promise<void>;
    refreshDictionaryStatus: (form: HTMLFormElement) => Promise<void>;
};

function createSettingsDialog(overrides: Record<string, unknown> = {}, panel?: string): {
    dependencies: Record<string, any>;
    controller: SettingsDialogControllerInstance;
    dismiss: ReturnType<typeof vi.fn>;
    form: HTMLFormElement;
    refreshDictionaryStatus: (form: HTMLFormElement) => Promise<void>;
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
        mountDialog: (backdrop: HTMLElement, surface: HTMLElement) => document.body.append(backdrop, surface),
        sensitiveSettingsSurface: () => ({
            trusted: true,
            launcherUrl: 'https://yomureader.com/study/#settings=api',
        }),
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
        publishedDictionaryLanguages: vi.fn().mockResolvedValue(new Set(['ja'])),
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

    controller.open(panel);

    return {
        controller,
        dependencies,
        dismiss,
        form: document.querySelector<HTMLFormElement>('.jpdb-reader-settings')!,
        refreshDictionaryStatus,
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
    root.dataset.jpdbReaderScaleAdapter = 'apple-touch-page-scale';
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
    expect(ankiStatusLinkText(form, 'a[href$="learn/your-own-setup#use-desktop-anki-from-a-phone-ipad-or-android"]')).toContain('Mobile setup docs');
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

type CallTracker = { mock: { calls: unknown[][] } };

function lookupPillIds(form: HTMLFormElement): string[] {
    return Array.from(
        form.querySelectorAll<HTMLInputElement>('.jpdb-reader-lookup-links input[name$=".id"]'),
        input => input.value,
    );
}

function lookupPillRow(form: HTMLFormElement, id: string): HTMLElement {
    const idInput = Array.from(
        form.querySelectorAll<HTMLInputElement>('.jpdb-reader-lookup-links input[name$=".id"]'),
    ).find(input => input.value === id)!;
    return idInput.closest<HTMLElement>('[data-lookup-link-row]')!;
}

function lookupPillLabelInput(form: HTMLFormElement, id: string): HTMLInputElement {
    return lookupPillRow(form, id)
        .querySelector<HTMLInputElement>('input[name$=".label"]')!;
}

function lookupPillUrlInput(form: HTMLFormElement, id: string): HTMLInputElement {
    return lookupPillRow(form, id).querySelector<HTMLInputElement>('input[name$=".urlTemplate"]')!;
}

function lookupPillEnabledInput(form: HTMLFormElement, id: string): HTMLInputElement {
    return lookupPillRow(form, id).querySelector<HTMLInputElement>('[data-lookup-link-enable-toggle]')!;
}

function definitionTranslationInput(form: HTMLFormElement, id: string): HTMLInputElement {
    return Array.from(
        form.querySelectorAll<HTMLInputElement>('input[name="definitionTranslationProviderIds"]'),
    ).find(input => input.value === id)!;
}

function expectSpanishLookupPills(form: HTMLFormElement): void {
    const ids = lookupPillIds(form);
    expect(ids).toEqual(expect.arrayContaining(['rae', 'spanishdict']));
    expect(ids).not.toEqual(expect.arrayContaining(['jiten', 'jpdb', 'bunpro']));
}

async function submitSettingsAndWait(
    form: HTMLFormElement,
    dismiss: CallTracker,
    persisted?: CallTracker,
): Promise<void> {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForCondition(() => dismiss.mock.calls.length === 1
        && (persisted === undefined || persisted.mock.calls.length === 1));
}

function activeLanguageProfile(settings: ReaderSettings): ReaderSettings['languageProfiles'][number] | undefined {
    return settings.languageProfiles.find(profile => profile.id === settings.activeLanguageProfileId);
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

describe('settings dialog sensitive-surface boundary', () => {
    afterEach(() => {
        settingsDialogTestState.useRealLocalization = false;
        document.body.replaceChildren();
        localStorage.clear();
        resetAudioSubSourceDiscoveryForTests();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it.each([
        'https://yomureader.com/study/#settings=api',
        'moz-extension://yomu/newtab/index.html#settings=api',
    ])('keeps the offhost page outside authoritative settings and opens only captured %s', (launcherUrl) => {
        const setSettings = vi.fn();
        const listDecks = vi.fn();
        const ping = vi.fn();
        const isConnected = vi.fn();
        const summary = vi.fn();
        const setValue = vi.fn();
        const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as Window);
        vi.stubGlobal('GM_setValue', setValue);
        const configured = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-private',
            jitenApiKey: 'ak_jiten-private',
            bunproFrontendApiToken: 'bunpro-private',
            wanikaniApiToken: 'wanikani-private',
            nadeshikoApiKey: 'nadeshiko-private',
            ocrCloudVisionApiKey: 'cloud-private',
        };
        const { dependencies } = createSettingsDialog({
            getSettings: () => configured,
            setSettings,
            sensitiveSettingsSurface: () => ({ trusted: false, launcherUrl }),
            jpdb: { clear: vi.fn(), listDecks, ping },
            anki: { isConnected },
            dictionaries: { summary },
        }, 'backup');
        const surface = document.querySelector<HTMLElement>('[data-sensitive-settings-launcher]')!;
        const launcher = surface.querySelector<HTMLButtonElement>('[data-trusted-settings-launcher]')!;

        expect(surface).not.toBeNull();
        expect(document.querySelector('form')).toBeNull();
        expect(surface.querySelectorAll('input, select, textarea, output')).toHaveLength(0);
        expect(surface.innerHTML).not.toContain('type="file"');
        for (const secret of [
            configured.apiKey,
            configured.jitenApiKey,
            configured.bunproFrontendApiToken,
            configured.wanikaniApiToken,
            configured.nadeshikoApiKey,
            configured.ocrCloudVisionApiKey,
        ]) expect(surface.innerHTML).not.toContain(secret);

        surface.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        surface.dispatchEvent(new Event('input', { bubbles: true }));
        surface.dispatchEvent(new Event('change', { bubbles: true }));
        allowSyntheticReaderInteractionsForTests(false);
        launcher.click();
        expect(open).not.toHaveBeenCalled();

        launcher.setAttribute('formaction', 'https://attacker.example/phish');
        launcher.dataset.target = 'https://attacker.example/phish';
        launcher.textContent = 'Attacker settings';
        allowSyntheticReaderInteractionsForTests(true);
        launcher.click();

        expect(open).toHaveBeenCalledOnce();
        const expectedUrl = new URL(launcherUrl);
        expectedUrl.hash = '#settings=backup';
        expect(open).toHaveBeenCalledWith(expectedUrl.href, '_blank', 'noopener');
        expect(setSettings).not.toHaveBeenCalled();
        expect(setValue).not.toHaveBeenCalled();
        expect(listDecks).not.toHaveBeenCalled();
        expect(ping).not.toHaveBeenCalled();
        expect(isConnected).not.toHaveBeenCalled();
        expect(summary).not.toHaveBeenCalled();
        expect(dependencies.beginSettingsPreview).not.toHaveBeenCalled();
    });

    it('keeps the full account, import, and recovery flow on a trusted Study surface', () => {
        const configured = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-private',
            jitenApiKey: 'ak_jiten-private',
            bunproFrontendApiToken: 'bunpro-private',
            wanikaniApiToken: 'wanikani-private',
            nadeshikoApiKey: 'nadeshiko-private',
            ocrCloudVisionApiKey: 'cloud-private',
        };
        const { form } = createSettingsDialog({
            getSettings: () => configured,
            sensitiveSettingsSurface: () => ({
                trusted: true,
                launcherUrl: 'moz-extension://yomu/newtab/index.html#settings=api',
            }),
        }, 'backup');

        expect(form).toBeInstanceOf(HTMLFormElement);
        expect(form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="backup"]')?.getAttribute('aria-selected')).toBe('true');
        for (const name of [
            'apiCredentialJpdb',
            'apiCredentialJiten',
            'apiCredentialBunpro',
            'apiCredentialWanikani',
            'nadeshikoApiKey',
            'ocrCloudVisionApiKey',
        ]) expect(form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value).toBe('');
        expect(form.querySelector<HTMLInputElement>('[data-academy-pairing-code]')).not.toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[data-file="settings"]')).not.toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[data-file="dictionary"]')).not.toBeNull();
        expect(form.querySelector<HTMLOutputElement>('[data-academy-recovery-code]')).not.toBeNull();
    });
});

describe('settings dialog keyboard dismissal', () => {
    afterEach(() => {
        settingsDialogTestState.useRealLocalization = false;
        document.body.replaceChildren();
        localStorage.clear();
        resetAudioSubSourceDiscoveryForTests();
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

    it('rejects a host-page requestSubmit without a preceding Reader gesture', async () => {
        const onSettingsPersisted = vi.fn();
        const { dismiss, form } = createSettingsDialog({ onSettingsPersisted });
        allowSyntheticReaderInteractionsForTests(false);

        try {
            form.requestSubmit();
            await Promise.resolve();
            await Promise.resolve();

            expect(onSettingsPersisted).not.toHaveBeenCalled();
            expect(dismiss).not.toHaveBeenCalled();
            expect(form.isConnected).toBe(true);
        } finally {
            allowSyntheticReaderInteractionsForTests(true);
        }
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

    it('shows the live-catalogue empty state and restores target-family controls', async () => {
        const publishedDictionaryLanguages = vi.fn().mockResolvedValue(new Set(['ja']));
        const { form } = createSettingsDialog({ publishedDictionaryLanguages });
        const picker = form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;

        await waitForCondition(() =>
            form.querySelector<HTMLElement>('[data-target-dictionary-content]')?.hidden === false);
        expect(form.dataset.language).toBe('ja');
        expect(form.querySelector('select[name="furiganaMode"]')).not.toBeNull();

        picker.value = 'ko';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
        await waitForCondition(() =>
            form.querySelector<HTMLElement>('[data-target-dictionary-state]')?.textContent
                === 'Dictionaries for Korean are not available yet.');

        expect(form.dataset.language).toBe('ko');
        expect(form.querySelector('select[name="furiganaMode"]')).not.toBeNull();
        expect(form.querySelector('[data-language-family="pronunciation"]')).not.toBeNull();
        expect(form.querySelector('[data-language-family="pitch-colouring"]')).toBeNull();
        expect(form.querySelector('[data-language-family="pitch-legend"]')).toBeNull();
        expect(form.querySelector('[data-language-family="provider-pills"]')).toBeNull();
        expect(form.querySelector<HTMLElement>('[data-target-dictionary-content]')?.hidden).toBe(true);

        picker.value = 'ja';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
        await waitForCondition(() =>
            form.querySelector<HTMLElement>('[data-target-dictionary-content]')?.hidden === false);

        expect(form.dataset.language).toBe('ja');
        expect(form.querySelector('select[name="furiganaMode"]')).not.toBeNull();
        expect(form.querySelector('[data-language-family="pitch-colouring"]')).not.toBeNull();
        expect(form.querySelector('[data-language-family="pitch-legend"]')).not.toBeNull();
        expect(form.querySelector('[data-language-family="provider-pills"]')).not.toBeNull();
        expect(publishedDictionaryLanguages).toHaveBeenCalledOnce();
    });

    it('round-trips and saves the Japanese difficulty mode through a temporary Spanish target', async () => {
        settingsDialogTestState.useRealLocalization = true;
        let current: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'difficult-kanji' as const,
        };
        const onSettingsPersisted = vi.fn();
        const { dismiss, form } = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
            onSettingsPersisted,
        });
        const picker = form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
        const mode = form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]')!;

        expect(mode.value).toBe('difficult-kanji');
        picker.value = 'es';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
        expect(mode.value).toBe('all');
        expect(mode.querySelector('option[value="difficult-kanji"]')).toBeNull();

        picker.value = 'ja';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
        expect(mode.value).toBe('difficult-kanji');

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => onSettingsPersisted.mock.calls.length === 1);

        expect(dismiss).toHaveBeenCalledOnce();
        expect(current.furiganaMode).toBe('difficult-kanji');
        expect(onSettingsPersisted).toHaveBeenCalledWith(expect.objectContaining({
            furiganaMode: 'difficult-kanji',
        }));
    });

    it('adopts a durable Spanish profile into the open dialog and saves that adopted target', async () => {
        settingsDialogTestState.useRealLocalization = true;
        let current: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'difficult-kanji',
        };
        const profile = {
            ...current.languageProfiles[0]!,
            id: 'durable-spanish',
            targetLanguage: 'es',
            outputLanguage: 'ko',
            learnerLanguage: 'ko',
            parserProvider: 'jpdb' as const,
            definitionTranslationProviderIds: ['__jiten__'],
        };
        const onSettingsPersisted = vi.fn();
        const observedEvents: Event[] = [];
        const eventListener = (event: Event): void => { observedEvents.push(event); };
        window.addEventListener(SETTINGS_CHANGE_EVENT, eventListener);
        const { dismiss, form } = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
            onSettingsPersisted,
        });
        const parser = form.querySelector<HTMLSelectElement>('select[name="parserProvider"]')!;

        try {
            // Production applies remote settings to ReaderApp before it publishes
            // the event. The dialog must compare against its open-time baseline,
            // not read this already-updated backing object as "previous" state.
            current = {
                ...current,
                parserProvider: profile.parserProvider,
                languageProfiles: [profile],
                activeLanguageProfileId: profile.id,
            };
            publishSettingsChange({ settings: current });

            const target = form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
            const output = form.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')!;
            const mode = form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]')!;
            const youtubeImmersion = form.querySelector<HTMLInputElement>('input[name="youtubeImmersionEnabled"]')!;
            expect(observedEvents).toHaveLength(1);
            expect(current.activeLanguageProfileId).toBe(profile.id);
            expect(target.value).toBe('es');
            expect(output.value).toBe('ko');
            expect(parser.value).toBe('jpdb');
            expect(definitionTranslationInput(form, '__jiten__').checked).toBe(true);
            expect(form.dataset.language).toBe('es');
            expect(mode.value).toBe('all');
            expect(mode.closest('label')?.textContent).toContain('Reading annotations');
            expect(mode.querySelector('option[value="difficult-kanji"]')).toBeNull();
            expect(youtubeImmersion.checked).toBe(false);
            expectSpanishLookupPills(form);

            await submitSettingsAndWait(form, dismiss, onSettingsPersisted);

            const savedProfile = activeLanguageProfile(current);
            expect(savedProfile).toMatchObject({
                targetLanguage: 'es',
                outputLanguage: 'ko',
                learnerLanguage: 'ko',
                parserProvider: 'jpdb',
                definitionTranslationProviderIds: ['__jiten__'],
            });
            expect(current.dictionaryLookupLinks.map(link => link.id)).toEqual(expect.arrayContaining(['rae', 'spanishdict']));
            // One incoming durable event and one event from the explicit Save;
            // synchronizing the adopted profile never publishes another event.
            expect(observedEvents).toHaveLength(2);
        } finally {
            window.removeEventListener(SETTINGS_CHANGE_EVENT, eventListener);
        }
    });

    it('resets a durable English-to-Cantonese target-only change to Cantonese provider order', () => {
        settingsDialogTestState.useRealLocalization = true;
        const englishLinks = defaultDictionaryLookupLinks('local', 'en').map((link, index, links) => ({
            ...link,
            enabled: link.id === 'forvo' ? false : link.enabled,
            priority: links.length - index + 4,
        }));
        const custom = {
            id: 'custom-carry',
            label: 'My dictionary',
            urlTemplate: 'https://example.com/lookup/{query}',
            enabled: true,
            priority: 2,
        };
        const localFrequency = {
            id: 'frequency-local:Corpus',
            label: 'Corpus',
            urlTemplate: '',
            enabled: false,
            action: 'frequency-local' as const,
            priority: 4,
        };
        let current = normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            languageProfiles: DEFAULT_SETTINGS.languageProfiles.map(profile => ({
                ...profile,
                targetLanguage: 'en',
            })),
            dictionaryLookupLinks: [...englishLinks, custom, localFrequency],
        });
        const { form } = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
        });

        publishSettingsChange({
            settings: {
                languageProfiles: current.languageProfiles.map(profile => ({
                    ...profile,
                    targetLanguage: 'yue-Hant',
                })),
            },
        });

        const portableIds = new Set([custom.id, localFrequency.id]);
        const providerIds = lookupPillIds(form).filter(id => !portableIds.has(id));
        expect(providerIds).toEqual(defaultDictionaryLookupLinks('local', 'yue').map(link => link.id));
        expect(form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')?.value).toBe('yue');
        expect(lookupPillUrlInput(form, 'words-hk').value).toBe('https://words.hk/zidin/{query}');
        expect(lookupPillUrlInput(form, 'wiktionary-en').value)
            .toBe('https://en.wiktionary.org/wiki/{query}#Chinese');
        expect(lookupPillUrlInput(form, custom.id).value).toBe(custom.urlTemplate);
        expect(lookupPillEnabledInput(form, localFrequency.id).checked).toBe(false);
        expect(lookupPillEnabledInput(form, 'forvo').checked).toBe(false);
    });

    it('adopts a priority-only reorder of Spanish built-in lookup pills', () => {
        settingsDialogTestState.useRealLocalization = true;
        let current = normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            languageProfiles: DEFAULT_SETTINGS.languageProfiles.map(profile => ({
                ...profile,
                targetLanguage: 'es',
            })),
            dictionaryLookupLinks: defaultDictionaryLookupLinks('local', 'es'),
        });
        const { form } = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
        });
        const raePriority = current.dictionaryLookupLinks.find(link => link.id === 'rae')!.priority;
        const spanishDictPriority = current.dictionaryLookupLinks.find(link => link.id === 'spanishdict')!.priority;
        const reordered = current.dictionaryLookupLinks.map(link => {
            if (link.id === 'rae') return { ...link, priority: spanishDictPriority };
            if (link.id === 'spanishdict') return { ...link, priority: raePriority };
            return link;
        });
        expect(reordered.map(link => link.id)).toEqual(current.dictionaryLookupLinks.map(link => link.id));

        publishSettingsChange({ settings: { dictionaryLookupLinks: reordered } });

        expect(lookupPillIds(form).indexOf('spanishdict')).toBeLessThan(lookupPillIds(form).indexOf('rae'));
        expect(lookupPillUrlInput(form, 'rae').value).toBe('https://dle.rae.es/{query}');
        expect(lookupPillUrlInput(form, 'spanishdict').value)
            .toBe('https://www.spanishdict.com/translate/{query}');
    });

    it('preserves an unsaved lookup reorder across normalized and array-only durable events', async () => {
        settingsDialogTestState.useRealLocalization = true;
        const legacyLookupLinks = DEFAULT_SETTINGS.dictionaryLookupLinks
            .filter(link => link.id !== 'nadeshiko')
            .map(link => link.id === 'jisho'
                ? { ...link, urlTemplate: 'https://legacy.example/search/{query}' }
                : link);
        let current: ReaderSettings = { ...DEFAULT_SETTINGS, dictionaryLookupLinks: legacyLookupLinks };
        const onSettingsPersisted = vi.fn();
        const { dismiss, form } = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
            onSettingsPersisted,
        });
        const target = form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
        const output = form.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')!;

        const beforeReorder = lookupPillIds(form);
        lookupPillRow(form, 'jisho')
            .querySelector<HTMLButtonElement>('[data-action="lookup-link-up"]')!
            .click();
        const liveReorder = lookupPillIds(form);
        expect(liveReorder).not.toEqual(beforeReorder);

        const normalized = normalizeReaderSettings(current);
        expect(normalized.dictionaryLookupLinks.map(link => link.id)).toContain('nadeshiko');
        expect(normalized.dictionaryLookupLinks.find(link => link.id === 'jisho')?.urlTemplate)
            .toBe('https://jisho.org/search/{query}');
        publishSettingsChange({ settings: normalized });
        expect(lookupPillIds(form)).toEqual(liveReorder);

        publishSettingsChange({
            settings: {
                ...normalized,
                dictionaryLookupLinks: [...normalized.dictionaryLookupLinks].reverse(),
            },
        });
        expect(lookupPillIds(form)).toEqual(liveReorder);

        target.value = 'es';
        target.dispatchEvent(new Event('change', { bubbles: true }));
        output.value = 'ko';
        output.dispatchEvent(new Event('change', { bubbles: true }));
        form.querySelector<HTMLButtonElement>('[data-action="lookup-link-add"]')!.click();
        await flushPromises();
        const customLookupId = lookupPillIds(form).find(id => id.startsWith('custom-'))!;
        lookupPillLabelInput(form, customLookupId).value = 'My Spanish dictionary';
        const jitenTranslation = definitionTranslationInput(form, '__jiten__');
        expect(jitenTranslation.disabled).toBe(false);
        jitenTranslation.checked = true;

        const expectUnsavedFacets = (): void => {
            expect(form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')?.value).toBe('es');
            expect(form.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')?.value).toBe('ko');
            expect(lookupPillIds(form)).toContain(customLookupId);
            expect(lookupPillLabelInput(form, customLookupId).value).toBe('My Spanish dictionary');
            expect(definitionTranslationInput(form, '__jiten__').checked).toBe(true);
        };

        publishSettingsChange({ settings: { theme: 'dark' } });
        expectUnsavedFacets();

        publishSettingsChange({
            settings: {
                ...current,
                sheetCloseButtonOnLeft: !current.sheetCloseButtonOnLeft,
                languageProfiles: current.languageProfiles.map(profile => ({
                    ...profile,
                    definitionTranslationProviderIds: [...profile.definitionTranslationProviderIds],
                })),
                dictionaryLookupLinks: current.dictionaryLookupLinks.map(link => ({ ...link })),
            },
        });
        expectUnsavedFacets();

        await submitSettingsAndWait(form, dismiss, onSettingsPersisted);
        const savedProfile = activeLanguageProfile(current);
        expect(savedProfile).toMatchObject({
            targetLanguage: 'es',
            outputLanguage: 'ko',
            learnerLanguage: 'ko',
            definitionTranslationProviderIds: ['__jiten__'],
        });
        expect(current.dictionaryLookupLinks.find(link => link.id === customLookupId)?.label)
            .toBe('My Spanish dictionary');
    });

    it('adopts active-profile and output-only durable changes into their nested controls', async () => {
        settingsDialogTestState.useRealLocalization = true;
        const baseProfile = DEFAULT_SETTINGS.languageProfiles[0]!;
        const alternateProfile = {
            ...baseProfile,
            id: 'alternate-output',
            outputLanguage: 'ko',
            learnerLanguage: 'ko',
            parserProvider: 'jpdb' as const,
            definitionTranslationProviderIds: ['__jiten__'],
        };
        let current: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            languageProfiles: [baseProfile, alternateProfile],
            activeLanguageProfileId: baseProfile.id,
        };
        const onSettingsPersisted = vi.fn();
        const { dismiss, form } = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
            onSettingsPersisted,
        });
        const output = form.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')!;
        const parser = form.querySelector<HTMLSelectElement>('select[name="parserProvider"]')!;
        const jitenTranslation = definitionTranslationInput(form, '__jiten__');

        publishSettingsChange({ settings: { activeLanguageProfileId: alternateProfile.id } });
        expect(current.activeLanguageProfileId).toBe(alternateProfile.id);
        expect(output.value).toBe('ko');
        expect(parser.value).toBe('jpdb');
        expect(jitenTranslation.checked).toBe(true);
        expect(form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')?.value).toBe('ja');

        const frenchOutputProfile = {
            ...alternateProfile,
            outputLanguage: 'fr',
            learnerLanguage: 'fr',
            parserProvider: 'local' as const,
            definitionTranslationProviderIds: [],
        };
        publishSettingsChange({ settings: { languageProfiles: [baseProfile, frenchOutputProfile] } });
        expect(output.value).toBe('fr');
        expect(parser.value).toBe('local');
        expect(jitenTranslation.checked).toBe(false);
        expect(current.languageProfiles.find(profile => profile.id === alternateProfile.id)?.outputLanguage).toBe('fr');

        await submitSettingsAndWait(form, dismiss, onSettingsPersisted);
        const savedProfile = activeLanguageProfile(current);
        expect(savedProfile).toMatchObject({
            id: alternateProfile.id,
            outputLanguage: 'fr',
            parserProvider: 'local',
            definitionTranslationProviderIds: [],
        });
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
        const events: SettingsChangeDetail[] = [];
        const unsubscribe = subscribeToSettingsChanges(event => { events.push(event); });
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
            expect(events.at(-1)?.settings.theme).toBe('light');
            expect(events.at(-1)?.preview).toBe(true);

            publishSettingsChange({ settings: { theme: 'dark' } });

            expect(input.value).toBe('dark');
            expect(button.getAttribute('aria-checked')).toBe('true');
            expect(dependencies.getSettings().theme).toBe('dark');
            expect(dependencies.applyTheme).toHaveBeenCalled();
        } finally {
            unsubscribe();
        }
    });

    it('coalesces accent picker previews and publishes only committed color changes', async () => {
        const events: SettingsChangeDetail[] = [];
        const unsubscribe = subscribeToSettingsChanges(event => { events.push(event); });
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
            expect(events.at(-1)?.settings.accentColor).toBe('#654321');
            expect(events.at(-1)?.preview).toBe(true);
        } finally {
            unsubscribe();
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
        expect(selectValue('furiganaMode')).toBe('all');
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

    it('keeps quick setup on all furigana regardless of available decks', () => {
        for (const settings of [
            { ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', ankiEnabled: false, yomuLocalSrsEnabled: false },
            { ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', ankiEnabled: false, yomuLocalSrsEnabled: true },
            { ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jitenApiKey: '', ankiEnabled: true, yomuLocalSrsEnabled: true },
        ] satisfies ReaderSettings[]) {
            const { form } = createSettingsDialog({ getSettings: () => settings });
            const preset = form.querySelector<HTMLSelectElement>('select[name="appearancePreset"]')!;
            const mode = form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]')!;

            for (const value of ['balanced', 'new-only']) {
                preset.value = value;
                preset.dispatchEvent(new Event('change', { bubbles: true }));
                expect(mode.value).toBe('all');
            }
        }
    });

    it('reveals the difficulty explanation only while that mode is selected', () => {
        const { form } = createSettingsDialog();
        const mode = form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]')!;
        const note = form.querySelector<HTMLElement>('[data-furigana-difficulty-note]')!;

        expect(note.hidden).toBe(true);

        mode.value = 'difficult-kanji';
        mode.dispatchEvent(new Event('change', { bubbles: true }));
        expect(note.hidden).toBe(false);

        mode.value = 'all';
        mode.dispatchEvent(new Event('change', { bubbles: true }));
        expect(note.hidden).toBe(true);
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

    it('persists a Japanese-sites opt-out before reporting the settings saved', async () => {
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            preferJapaneseSiteLanguage: true,
        };
        const onSettingsPersisted = vi.fn();
        const { dismiss, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            onSettingsPersisted,
        });
        const preferJapaneseSites = form.querySelector<HTMLInputElement>(
            'input[name="preferJapaneseSiteLanguage"]',
        )!;
        expect(preferJapaneseSites.checked).toBe(true);
        preferJapaneseSites.checked = false;

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => dismiss.mock.calls.length === 1);

        expect(JSON.parse(
            localStorage.getItem(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY) ?? 'null',
        )).toBe(false);
        expect(onSettingsPersisted).toHaveBeenCalledWith(expect.objectContaining({
            preferJapaneseSiteLanguage: false,
        }));
    });

    it('keeps changed account details unsaved when Firefox consent is denied', async () => {
        const request = vi.fn().mockResolvedValue(false);
        const setValue = vi.fn();
        vi.stubGlobal('browser', { runtime: { id: 'yomu@yomureader.com', getURL: (path: string) => `moz-extension://yomu/${path}` }, permissions: { request } });
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
        vi.stubGlobal('browser', { runtime: { id: 'yomu@yomureader.com', getURL: (path: string) => `moz-extension://yomu/${path}` } });
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

    it.each([
        {
            name: 'denies consent',
            browser: {
                runtime: { id: 'yomu@yomureader.com', getURL: (path: string) => `moz-extension://yomu/${path}` },
                permissions: { request: vi.fn().mockResolvedValue(false) },
            },
            message: 'Those account details were not saved because Firefox permission was not granted.',
        },
        {
            name: 'requires the extension page',
            browser: { runtime: { id: 'yomu@yomureader.com', getURL: (path: string) => `moz-extension://yomu/${path}` } },
            message: 'Firefox can only ask for that permission on a Yomu page. Open Study, then add the account details in Settings.',
        },
    ])('does not claim an Academy device when Firefox $name', async ({ browser, message }) => {
        const request = vi.fn();
        vi.stubGlobal('browser', browser);
        vi.stubGlobal('GM_xmlhttpRequest', request);
        const { dependencies, form } = createSettingsDialog();
        form.querySelector<HTMLInputElement>('[data-academy-pairing-code]')!.value = '0234-5678-ABCD-EFGH-JKMN';

        const connect = form.querySelector<HTMLButtonElement>('[data-action="connect-academy-account"]')!;
        await waitForCondition(() => !connect.disabled);
        connect.click();
        await waitForCondition(() => dependencies.toast.mock.calls.length > 0);

        expect(request).not.toHaveBeenCalled();
        expect(dependencies.toast).toHaveBeenCalledWith(message);
    });

    it('does not dismiss or toast from a stale save after settings is reopened', async () => {
        const storage = deferred<void>();
        const setValue = vi.fn(() => storage.promise);
        vi.stubGlobal('GM_getValue', vi.fn((_key: string, fallback: unknown) => fallback));
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

    it('reaches no audio source on its own when settings opens', async () => {
        const request = vi.fn();
        vi.stubGlobal('GM_xmlhttpRequest', request);
        const { form } = createSettingsDialog();
        await flushPromises();
        await flushPromises();

        expect(request).not.toHaveBeenCalled();
        expect(form.querySelector('[data-action="audio-source-detect"]')).toBeNull();
    });

    it('lists an aggregator URL\'s providers when the media panel is opened', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            type: 'audioSourceList',
            audioSources: [
                { name: 'nhk16 ニホ＼ン [2]', url: 'https://audio.yomureader.com/audio/clips/nihon-1.mp3' },
                { name: 'jpod', url: 'https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kana=%E3%81%AB%E3%81%BB%E3%82%93' },
            ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
        const { form } = createSettingsDialog();
        const hostedRow = Array.from(form.querySelectorAll<HTMLElement>('[data-audio-source-row]'))
            .find(row => row.querySelector<HTMLInputElement>('[data-audio-url-field]')?.value.includes('audio.yomureader.com'));
        // Nothing is known about the URL on a fresh load, which is the state a
        // user actually opens settings in.
        expect(hostedRow?.querySelector('input[name$=".subSources.0.name"]')).toBeNull();

        form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="media"]')?.click();
        await waitForCondition(() => Boolean(hostedRow?.querySelector('input[name$=".subSources.0.name"]')));

        const providers = Array.from(hostedRow?.querySelectorAll<HTMLInputElement>('input[name*=".subSources."][name$=".name"]') ?? [])
            .map(input => input.value);
        expect(providers).toEqual(['nhk16', 'jpod']);
    });

    it('lists an aggregator URL\'s providers once a lookup reveals them, with nothing to press', async () => {
        const play = vi.fn(async () => {
            await getAudioCandidates(
                { type: 'custom-json', url: 'https://audio.yomureader.com/?term={term}&reading={reading}', voice: '', enabled: true },
                { vid: 0, sid: 0, spelling: '日本', reading: 'にほん' } as never,
                1000,
                '',
            );
            return true;
        });
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            type: 'audioSourceList',
            audioSources: [
                { name: 'nhk16 ニホ＼ン [2]', url: 'https://audio.yomureader.com/audio/clips/nihon-1.mp3' },
                { name: 'jpod', url: 'https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kana=%E3%81%AB%E3%81%BB%E3%82%93' },
            ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
        const { form } = createSettingsDialog({ audio: { play, stop: vi.fn() } });
        const hostedRow = Array.from(form.querySelectorAll<HTMLElement>('[data-audio-source-row]'))
            .find(row => row.querySelector<HTMLInputElement>('[data-audio-url-field]')?.value.includes('audio.yomureader.com'));
        expect(hostedRow?.querySelector('input[name$=".subSources.0.name"]')).toBeNull();

        hostedRow?.querySelector<HTMLButtonElement>('[data-action="preview-audio"]')?.click();
        await waitForCondition(() => Boolean(hostedRow?.querySelector('input[name$=".subSources.0.name"]')));

        const providers = Array.from(hostedRow?.querySelectorAll<HTMLInputElement>('input[name*=".subSources."][name$=".name"]') ?? [])
            .map(input => input.value);
        expect(providers).toEqual(['nhk16', 'jpod']);
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

    it('offers to bring an older Yomu note type up to date', async () => {
        const yomuModelUpdatePlan = vi.fn().mockResolvedValue({
            modelName: 'よむ Japanese',
            missingFields: ['Audio', 'Pitch'],
        });
        const { form } = createSettingsDialog({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true }),
            anki: {
                isConnected: vi.fn().mockResolvedValue(true),
                yomuModelUpdatePlan,
            },
        });

        const prompt = settingsElement<HTMLElement>(form, '[data-anki-model-update]');
        await waitForCondition(() => prompt.hidden === false);

        expect(yomuModelUpdatePlan).toHaveBeenCalled();
        expect(prompt.textContent).toContain('New fields are ready for "よむ Japanese": Audio, Pitch.');
        expect(prompt.querySelector<HTMLButtonElement>('[data-action="update-anki-model"]')?.textContent).toBe('Update note type');
    });

    it('keeps the note type offer hidden once every field is present', async () => {
        const yomuModelUpdatePlan = vi.fn().mockResolvedValue(null);
        const scanLibrary = vi.fn().mockResolvedValue(singleModelAnkiScan(
            'よむ',
            'よむ Japanese',
            ['Expression', 'Reading', 'Meaning'],
            [['expression', 'Expression', 'high']],
        ));
        const { form } = createSettingsDialog({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true }),
            anki: {
                isConnected: vi.fn().mockResolvedValue(true),
                scanLibrary,
                yomuModelUpdatePlan,
            },
        });

        await waitForCondition(() => yomuModelUpdatePlan.mock.calls.length === 1);
        await flushPromises();

        expect(settingsElement<HTMLElement>(form, '[data-anki-model-update]').hidden).toBe(true);
    });

    it('adds the missing note type fields only when the offer is accepted, then drops the offer', async () => {
        let missingFields = ['Audio', 'Pitch'];
        const addMissingYomuModelFields = vi.fn(async () => {
            const added = missingFields;
            missingFields = [];
            return added;
        });
        const yomuModelUpdatePlan = vi.fn(async () => (
            missingFields.length ? { modelName: 'よむ Japanese', missingFields } : null
        ));
        const { form } = createSettingsDialog({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true }),
            anki: {
                isConnected: vi.fn().mockResolvedValue(true),
                yomuModelUpdatePlan,
                addMissingYomuModelFields,
            },
        });

        const prompt = settingsElement<HTMLElement>(form, '[data-anki-model-update]');
        await waitForCondition(() => prompt.hidden === false);
        expect(addMissingYomuModelFields).not.toHaveBeenCalled();

        prompt.querySelector<HTMLButtonElement>('[data-action="update-anki-model"]')?.click();
        await waitForCondition(() => addMissingYomuModelFields.mock.calls.length === 1);
        await waitForCondition(() => prompt.hidden);

        // The write is aimed by the offer, so it can only ever reach the note
        // type the user was reading about.
        expect(addMissingYomuModelFields).toHaveBeenCalledWith('よむ Japanese');
        // Re-checked against the widened note type, so the offer is gone for
        // good rather than merely cleared until the next probe.
        expect(yomuModelUpdatePlan.mock.calls.length).toBeGreaterThan(1);
        expect(await yomuModelUpdatePlan()).toBeNull();
        expect(ankiStatusText(form)).toContain('Note type updated. Added Audio, Pitch.');
    });

    // Picking a different note type below the offer used to leave the offer on
    // screen naming the old one, while the accept followed the picker: the
    // prompt said "よむ Japanese" and the fields landed on Basic.
    it('drops the note type offer when the picker moves, and never aims the update at the new note type', async () => {
        let configuredModel = 'よむ Japanese';
        const yomuModelUpdatePlan = vi.fn(async () => (
            configuredModel === 'よむ Japanese' ? { modelName: 'よむ Japanese', missingFields: ['Audio', 'Pitch'] } : null
        ));
        const addMissingYomuModelFields = vi.fn(async () => ['Audio', 'Pitch']);
        const { form } = createSettingsDialog({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true }),
            anki: {
                isConnected: vi.fn().mockResolvedValue(true),
                yomuModelUpdatePlan,
                addMissingYomuModelFields,
            },
        });

        const prompt = settingsElement<HTMLElement>(form, '[data-anki-model-update]');
        await waitForCondition(() => prompt.hidden === false);
        expect(prompt.textContent).toContain('よむ Japanese');

        const modelSelect = settingsElement<HTMLSelectElement>(form, 'select[name="ankiModel"]');
        const basic = document.createElement('option');
        basic.value = 'Basic';
        basic.textContent = 'Basic';
        modelSelect.append(basic);
        configuredModel = 'Basic';
        modelSelect.value = 'Basic';
        modelSelect.dispatchEvent(new Event('change', { bubbles: true }));

        expect(prompt.hidden).toBe(true);
        await waitForCondition(() => yomuModelUpdatePlan.mock.calls.length > 1);
        expect(prompt.hidden).toBe(true);

        prompt.querySelector<HTMLButtonElement>('[data-action="update-anki-model"]')?.click();
        await flushPromises();
        await new Promise(resolve => window.setTimeout(resolve, 0));
        await flushPromises();

        expect(addMissingYomuModelFields).not.toHaveBeenCalled();
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

    it('keeps the saved Anki note type selected when a different live model scores higher', async () => {
        const lapis = singleModelAnkiScan(
            'Mining',
            'Lapis',
            ['Expression', 'Reading', 'Meaning'],
            [
                ['expression', 'Expression', 'high'],
                ['reading', 'Reading', 'high'],
                ['meaning', 'Meaning', 'high'],
            ],
        ).models[0]!;
        const kaishi = {
            ...singleModelAnkiScan(
                'Mining',
                'Kaishi 1.5k',
                ['Word', 'Reading', 'Definition'],
                [
                    ['expression', 'Word', 'high'],
                    ['reading', 'Reading', 'high'],
                    ['meaning', 'Definition', 'high'],
                ],
            ).models[0]!,
            score: lapis.score + 1,
        };
        const scanLibrary = vi.fn().mockResolvedValue({
            deckNames: ['Mining'],
            models: [kaishi, lapis],
            suggestedModel: kaishi,
        });
        const { form } = createSettingsDialog({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                ankiEnabled: true,
                ankiDeck: 'Mining',
                ankiModel: 'Lapis',
            }),
            anki: {
                isConnected: vi.fn().mockResolvedValue(true),
                scanLibrary,
            },
        });

        await waitForCondition(() => scanLibrary.mock.calls.length === 1);
        await waitForCondition(() => settingsOptionValues(form, '[data-anki-model-options] option').length === 2);

        expect(settingsSelectValue(form, 'select[name="ankiModel"]')).toBe('Lapis');
        expect(settingsOptionValues(form, '[data-anki-model-options] option')).toEqual(['Lapis', 'Kaishi 1.5k']);
        expect(ankiFieldRoleValue(form, 'expression')).toBe('Expression');
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

    it('disables imported dictionaries globally and clears only this site after confirmation', async () => {
        const archiveTitle = 'Archive sentinel [2026-08-01]';
        await persistDictionaryArchive({
            title: archiveTitle,
            filename: 'archive-sentinel.zip',
            file: new File(['archive bytes'], 'archive-sentinel.zip', { type: 'application/zip' }),
        });
        const archivesBefore = await listDictionaryArchives();
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: true };
        const summary = vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 });
        const deleteDatabase = vi.fn().mockResolvedValue(undefined);
        const deleteDictionary = vi.fn().mockResolvedValue(undefined);
        const clear = vi.fn().mockResolvedValue(undefined);
        const onSettingsPersisted = vi.fn();
        const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
        const { dependencies, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            onSettingsPersisted,
            dictionaries: { summary, deleteDatabase, deleteDictionary, clear },
        });
        const button = form.querySelector<HTMLButtonElement>('[data-action="clear-local-dictionary-site-storage"]')!;
        const toggle = form.querySelector<HTMLInputElement>('input[name="localDictionariesEnabled"]')!;
        const summaryCallsBefore = summary.mock.calls.length;

        button.click();
        await flushPromises();
        expect(deleteDatabase).not.toHaveBeenCalled();
        expect(settings.localDictionariesEnabled).toBe(true);
        expect(toggle.checked).toBe(true);

        // Changing or saving the checkbox is independent from the explicitly
        // destructive action; the change event itself must never delete data.
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        await flushPromises();
        expect(deleteDatabase).not.toHaveBeenCalled();

        button.click();
        await waitForCondition(() => deleteDatabase.mock.calls.length === 1);

        expect(confirm.mock.calls[1]?.[0]).toContain("delete this site's stored copy");
        expect(confirm.mock.calls[1]?.[0]).toContain('remove it the next time you visit them');
        expect(settings.localDictionariesEnabled).toBe(false);
        expect(onSettingsPersisted).toHaveBeenCalledWith(expect.objectContaining({ localDictionariesEnabled: false }));
        expect(toggle.checked).toBe(false);
        expect(deleteDatabase).toHaveBeenCalledOnce();
        expect(deleteDictionary).not.toHaveBeenCalled();
        expect(clear).not.toHaveBeenCalled();
        expect(summary).toHaveBeenCalledTimes(summaryCallsBefore);
        expect(dependencies.refreshDictionaryStyles).toHaveBeenCalledOnce();
        expect(dependencies.scheduleDictionaryRescan).toHaveBeenCalledOnce();
        expect(dependencies.refreshNewTabIfCurrent).toHaveBeenCalledOnce();
        expect(form.querySelector<HTMLElement>('[data-dictionary-status]')?.textContent).toContain('No dictionaries imported yet.');
        expect(form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-dictionaries [data-import-status]')?.textContent)
            .toContain("This site's copy was deleted; other sites clean up as you visit them.");
        expect(await listDictionaryArchives()).toEqual(archivesBefore);
    });

    it('waits for an in-flight import before disabling and deleting this site copy', async () => {
        const imported = deferred<ImportSummary>();
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: true };
        const importFile = vi.fn(() => imported.promise);
        const deleteDatabase = vi.fn().mockResolvedValue(undefined);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const { dependencies, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            dictionaries: {
                summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 }),
                importFile,
                deleteDatabase,
            },
        });
        const importButton = form.querySelector<HTMLButtonElement>('[data-action="import-yomitan-dictionary"]')!;
        const input = form.querySelector<HTMLInputElement>('input[data-file="dictionary"]')!;
        Object.defineProperty(input, 'files', {
            configurable: true,
            value: [new File(['dictionary'], 'dictionary.zip', { type: 'application/zip' })],
        });

        importButton.click();
        await waitForCondition(() => typeof input.onchange === 'function');
        input.dispatchEvent(new Event('change'));
        await waitForCondition(() => importFile.mock.calls.length === 1);

        const clearButton = form.querySelector<HTMLButtonElement>('[data-action="clear-local-dictionary-site-storage"]')!;
        clearButton.click();
        await flushPromises();

        expect(deleteDatabase).not.toHaveBeenCalled();
        expect(clearButton.disabled).toBe(true);
        expect(importButton.disabled).toBe(true);
        expect(dependencies.toast).not.toHaveBeenCalledWith(expect.stringContaining('other sites clean up'));

        imported.resolve(importSummary('Imported before cleanup'));
        await waitForCondition(() => deleteDatabase.mock.calls.length === 1);

        expect(importFile).toHaveBeenCalledOnce();
        expect(deleteDatabase).toHaveBeenCalledOnce();
        expect(settings.localDictionariesEnabled).toBe(false);
        expect(form.querySelector<HTMLInputElement>('input[name="localDictionariesEnabled"]')?.checked).toBe(false);
        expect(form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-dictionaries [data-import-status]')?.textContent)
            .toContain("This site's copy was deleted; other sites clean up as you visit them.");
    });

    it('uses the origin-local dictionary summary for the installed button state', async () => {
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [
                { name: 'Jitendex.org [2026-06-06]', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms' },
            ],
        };
        const summary = vi.fn().mockResolvedValue({
            dictionaries: [],
            terms: 0,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        });
        const dialog = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            dictionaries: { summary },
        });

        expect(recommendedButton(dialog.form, 'jitendex').textContent?.trim()).toBe('Install');
        await dialog.refreshDictionaryStatus(dialog.form);
        expect(recommendedButton(dialog.form, 'jitendex').textContent?.trim()).toBe('Install');
        expect(dialog.form.querySelector<HTMLElement>('[data-dictionary-status]')?.textContent).toContain('No dictionaries imported yet');

        summary.mockResolvedValue({
            dictionaries: [{
                title: 'Jitendex.org [2026-06-06]',
                alias: 'Jitendex',
                enabled: true,
                priority: 0,
                type: 'terms',
            }],
            terms: 42,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        });
        await dialog.refreshDictionaryStatus(dialog.form);
        expect(recommendedButton(dialog.form, 'jitendex').textContent?.trim()).toBe('Update');
        expect(dialog.form.querySelector<HTMLElement>('[data-dictionary-status]')?.textContent).toContain('terms 42');
    });

    it('routes the catalogue disclosure through a live status refresh and recovers after failure', async () => {
        const dictionary = catalogBrowseDictionaries().find(candidate => candidate.name.includes('大辞林') && candidate.downloadUrl)!;
        const sections = vi.mocked(catalogBrowseLanguageSectionsForLearnerLanguage);
        sections.mockReturnValue([{
            headwordLanguage: 'ja',
            isTargetLanguage: true,
            groups: [{
                category: dictionary.catalogCategory ?? 'terms',
                dictionaries: [dictionary],
            }],
        }]);
        const summary = vi.fn().mockResolvedValue({
            dictionaries: [{
                title: dictionary.name,
                alias: dictionary.name,
                enabled: true,
                priority: 0,
                type: 'terms',
                downloadUrl: dictionary.downloadUrl,
            }],
            terms: 1,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        });

        try {
            const dialog = createSettingsDialog({
                dictionaries: {
                    summary,
                    // Defer the helper's automatic open-time refresh so the
                    // disclosure click owns the first materialization.
                    importFromUrl: vi.fn(),
                },
            });
            const initialSection = dialog.form.querySelector<HTMLElement>('[data-catalog-browse]')!;
            const settingsSearch = dialog.form.querySelector<HTMLInputElement>('[data-settings-search]')!;
            settingsSearch.value = dictionary.name;
            settingsSearch.dispatchEvent(new Event('input', { bubbles: true }));

            expect(initialSection.dataset.catalogBrowseExpanded).toBe('false');
            expect(initialSection.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(0);
            initialSection.querySelector<HTMLButtonElement>('[data-action="toggle-catalog-browse"]')!.click();

            await waitForCondition(() => dialog.form.querySelector('[data-catalog-browse-filter]') !== null);
            let section = dialog.form.querySelector<HTMLElement>('[data-catalog-browse]')!;
            const filter = section.querySelector<HTMLInputElement>('[data-catalog-browse-filter]')!;
            const installed = section.querySelector<HTMLButtonElement>(`[data-dictionary-id="${dictionary.id}"]`)!;
            expect(section.dataset.catalogBrowseExpanded).toBe('true');
            expect(section.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(1);
            expect(filter.value).toBe(dictionary.name);
            expect(document.activeElement).toBe(filter);
            expect(installed.dataset.installed).toBe('true');

            section.querySelector<HTMLButtonElement>('[data-action="toggle-catalog-browse"]')!.click();
            await waitForCondition(() => section.dataset.catalogBrowseExpanded === 'false');
            expect(section.querySelector('[data-catalog-browse-results]')).toBeNull();

            summary.mockRejectedValue(new Error('IndexedDB unavailable'));
            const callsBeforeFailure = summary.mock.calls.length;
            section.querySelector<HTMLButtonElement>('[data-action="toggle-catalog-browse"]')!.click();
            await waitForCondition(() => summary.mock.calls.length > callsBeforeFailure);
            await waitForCondition(() => {
                section = dialog.form.querySelector<HTMLElement>('[data-catalog-browse]')!;
                const toggle = section.querySelector<HTMLButtonElement>('[data-action="toggle-catalog-browse"]');
                return section.dataset.catalogBrowseExpanded === 'false'
                    && toggle?.disabled === false
                    && !toggle.hasAttribute('aria-busy');
            });
        } finally {
            sections.mockReturnValue([]);
        }
    });

    it('keeps a lookup-pill reorder made while the dictionary summary is in flight', async () => {
        const summaryValue = {
            dictionaries: [
                { title: 'Jiten', alias: 'Jiten', enabled: true, priority: 0, type: 'frequency' as const },
                { title: 'BCCWJ', alias: 'BCCWJ', enabled: true, priority: 1, type: 'frequency' as const },
            ],
            terms: 42,
            kanji: 0,
            termMeta: 2,
            kanjiMeta: 0,
        };
        const summaryResult = deferred<typeof summaryValue>();
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [
                { name: 'Jiten', alias: 'Jiten', enabled: true, priority: 0, type: 'frequency' },
                { name: 'BCCWJ', alias: 'BCCWJ', enabled: true, priority: 1, type: 'frequency' },
            ],
            dictionaryLookupLinks: [
                { id: 'frequency-local:Jiten', label: 'Jiten', urlTemplate: '', enabled: true, action: 'frequency-local', priority: 0 },
                { id: 'frequency-local:BCCWJ', label: 'BCCWJ', urlTemplate: '', enabled: true, action: 'frequency-local', priority: 1 },
            ],
        };
        const summary = vi.fn(() => summaryResult.promise);
        const dialog = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            dictionaries: { summary },
        });
        const jitenId = 'frequency-local:Jiten';
        const bccwjId = 'frequency-local:BCCWJ';
        const lookupOrder = (form: HTMLFormElement): string[] => Array.from(
            form.querySelectorAll<HTMLInputElement>('.jpdb-reader-lookup-links input[name$=".id"]'),
            input => input.value,
        );

        const refresh = dialog.refreshDictionaryStatus(dialog.form);
        await waitForCondition(() => summary.mock.calls.length === 1);
        const sourceOrder = (form: HTMLFormElement): string[] => Array.from(
            form.querySelectorAll<HTMLElement>('[data-definition-source-editor] [data-dictionary-source-row]'),
            row => row.dataset.sourceId ?? '',
        );
        const jitenSource = dialog.form.querySelector<HTMLElement>('[data-definition-source-editor] [data-source-id="__jiten__"]')!;
        const alias = jitenSource.querySelector<HTMLInputElement>('input[name="jitenDefinitions.alias"]')!;
        alias.value = 'Jiten live edit';
        const jpdbSource = dialog.form.querySelector<HTMLElement>('[data-definition-source-editor] [data-source-id="__jpdb__"]')!;
        jpdbSource.querySelector<HTMLButtonElement>('[data-action="dictionary-source-down"]')!.click();
        const liveSourceOrder = sourceOrder(dialog.form);
        const initialOrder = lookupOrder(dialog.form);
        const moves = initialOrder.indexOf(bccwjId) - initialOrder.indexOf(jitenId);
        expect(moves).toBeGreaterThan(0);

        for (let index = 0; index < moves; index++) {
            const bccwjRow = dialog.form.querySelector<HTMLInputElement>(`input[name$=".id"][value="${bccwjId}"]`)!
                .closest<HTMLElement>('[data-lookup-link-row]')!;
            bccwjRow.querySelector<HTMLButtonElement>('[data-action="lookup-link-up"]')!.click();
        }
        expect(lookupOrder(dialog.form).indexOf(bccwjId)).toBeLessThan(lookupOrder(dialog.form).indexOf(jitenId));

        summaryResult.resolve(summaryValue);
        await refresh;

        expect(dialog.form.querySelector<HTMLInputElement>('input[name="jitenDefinitions.alias"]')?.value)
            .toBe('Jiten live edit');
        expect(sourceOrder(dialog.form)).toEqual(liveSourceOrder);
        expect(lookupOrder(dialog.form).indexOf(bccwjId)).toBeLessThan(lookupOrder(dialog.form).indexOf(jitenId));
        expect(dialog.form.querySelector<HTMLElement>('[data-dictionary-status]')?.textContent).toContain('terms 42');
        expect(dialog.dependencies.refreshDictionaryStyles).toHaveBeenCalled();

        dialog.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => dialog.dismiss.mock.calls.length === 1);
        expect(settings.dictionaryLookupLinks.map(link => link.id).indexOf(bccwjId))
            .toBeLessThan(settings.dictionaryLookupLinks.map(link => link.id).indexOf(jitenId));

        dialog.form.remove();
        dialog.controller.open();
        const reopenedForm = Array.from(document.querySelectorAll<HTMLFormElement>('.jpdb-reader-settings')).at(-1)!;
        expect(lookupOrder(reopenedForm).indexOf(bccwjId)).toBeLessThan(lookupOrder(reopenedForm).indexOf(jitenId));
    });

    it('does not let an older summary re-add a dictionary while it is being deleted', async () => {
        type SummaryValue = {
            dictionaries: Array<{ title: string; alias: string; enabled: boolean; priority: number; type: 'terms' }>;
            terms: number;
            kanji: number;
            termMeta: number;
            kanjiMeta: number;
        };
        const staleBeforeDelete = deferred<SummaryValue>();
        const staleDuringDelete = deferred<SummaryValue>();
        const deletion = deferred<void>();
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [{
                name: 'Deleted dictionary',
                alias: 'Deleted dictionary',
                enabled: true,
                priority: 0,
                type: 'terms',
            }],
        };
        const deleteDictionary = vi.fn(() => deletion.promise);
        const summary = vi.fn()
            .mockImplementationOnce(() => staleBeforeDelete.promise)
            .mockImplementationOnce(() => staleDuringDelete.promise);
        const dialog = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            dictionaries: {
                summary,
                deleteDictionary,
            },
        });
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        const refreshBeforeDelete = dialog.refreshDictionaryStatus(dialog.form);
        await waitForCondition(() => dialog.form.querySelector('[data-dictionary-name="Deleted dictionary"]') !== null);
        dialog.form.querySelector<HTMLButtonElement>(
            '[data-action="delete-yomitan-dictionary"][data-dictionary-name="Deleted dictionary"]',
        )!.click();
        await waitForCondition(() => deleteDictionary.mock.calls.length === 1);
        const refreshDuringDelete = dialog.refreshDictionaryStatus(dialog.form);
        await waitForCondition(() => summary.mock.calls.length === 2);
        deletion.resolve();
        await waitForCondition(() => !settings.dictionaryPreferences
            .some(preference => preference.name === 'Deleted dictionary'));

        const staleValue: SummaryValue = {
            dictionaries: [{
                title: 'Deleted dictionary',
                alias: 'Deleted dictionary',
                enabled: true,
                priority: 0,
                type: 'terms',
            }],
            terms: 1,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        };
        staleBeforeDelete.resolve(staleValue);
        staleDuringDelete.resolve(staleValue);
        await Promise.all([refreshBeforeDelete, refreshDuringDelete]);

        expect(settings.dictionaryPreferences.map(preference => preference.name))
            .not.toContain('Deleted dictionary');
    });

    it('keeps the active and unsaved learner language through dictionary refreshes', async () => {
        const baseProfile = DEFAULT_SETTINGS.languageProfiles[0]!;
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            languageProfiles: [{ ...baseProfile, outputLanguage: 'ko' }],
            activeLanguageProfileId: baseProfile.id,
        };
        const summary = vi.fn().mockResolvedValue({
            dictionaries: [],
            terms: 0,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        });
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            dictionaries: {
                summary,
                // Presence keeps the helper's first open-time refresh deferred
                // while allowing the language-change refresh to run for real.
                importFromUrl: vi.fn(),
            },
        });

        expect(form.querySelector('[data-catalog-recommendation-seed="ko"]')).not.toBeNull();
        expect(form.querySelector('[data-catalog-recommendation="jmdict-en"]')?.getAttribute('data-translation-mode')).toBe('offer');

        const learnerLanguage = form.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')!;
        learnerLanguage.value = 'de';
        learnerLanguage.dispatchEvent(new Event('change', { bubbles: true }));

        await waitForCondition(() =>
            form.querySelector('[data-catalog-recommendation-seed="de"]') !== null);

        expect(form.querySelector('[data-catalog-recommendation="jmdict-de"]')?.getAttribute('data-translation-mode')).toBe('off');
        expect(form.querySelector('[data-dictionary-id="jitendex"]')).not.toBeNull();
        expect(summary).toHaveBeenCalled();
    });

    it('refreshes recommendations immediately for an unsaved target change', async () => {
        const summary = vi.fn().mockResolvedValue({
            dictionaries: [],
            terms: 0,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        });
        const { form } = createSettingsDialog({
            dictionaries: {
                summary,
                importFromUrl: vi.fn(),
            },
        });

        const targetLanguage = form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
        targetLanguage.value = 'es';
        targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));

        await waitForCondition(() =>
            form.querySelector('[data-catalog-recommendation-target="es"]') !== null);

        expect(form.querySelector('[data-catalog-recommendation="wty-es-en"]')?.getAttribute('data-headword-language'))
            .toBe('es');
        expect(form.querySelector('[data-catalog-recommendation="wty-es-en-ipa"]')?.getAttribute('data-headword-language'))
            .toBe('es');
        expect(form.querySelector('[data-dictionary-id="jitendex"]')).toBeNull();
        expectSpanishLookupPills(form);
        expect(summary).toHaveBeenCalled();
    });

    it('keeps all learner rows when switching target at lookup-pill capacity', async () => {
        const portableLinks = [
            ...Array.from({ length: 15 }, (_, index) => ({
                id: `custom-${index}`,
                label: `Custom ${index}`,
                urlTemplate: `https://example.com/${index}?q={query}`,
                enabled: true,
                priority: DEFAULT_SETTINGS.dictionaryLookupLinks.length + index,
            })),
            {
                id: 'frequency-local:BCCWJ',
                label: 'BCCWJ',
                urlTemplate: '',
                enabled: false,
                action: 'frequency-local' as const,
                priority: DEFAULT_SETTINGS.dictionaryLookupLinks.length + 15,
            },
        ];
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            dictionaryLookupLinks: [...DEFAULT_SETTINGS.dictionaryLookupLinks, ...portableLinks],
        };
        const { dismiss, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            dictionaries: {
                summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
                importFromUrl: vi.fn(),
            },
        });

        const targetLanguage = form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
        targetLanguage.value = 'es';
        targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));
        await waitForCondition(() => form.querySelector('[data-catalog-recommendation-target="es"]') !== null);

        const lookupIds = lookupPillIds(form);
        expect(lookupIds).toEqual(expect.arrayContaining(portableLinks.map(link => link.id)));
        expectSpanishLookupPills(form);

        await submitSettingsAndWait(form, dismiss);
        expect(settings.dictionaryLookupLinks.map(link => link.id))
            .toEqual(expect.arrayContaining(portableLinks.map(link => link.id)));
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
        expect(importFromUrl.mock.calls[0]?.[3]).toBeUndefined();

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

    it('bulk imports every selected dictionary ZIP through the serialized queue', async () => {
        const firstImport = deferred<ImportSummary>();
        const secondImport = deferred<ImportSummary>();
        const importFile = vi.fn()
            .mockImplementationOnce(() => firstImport.promise)
            .mockImplementationOnce(() => secondImport.promise);
        const { dependencies, form } = createSettingsDialog({
            dictionaries: {
                summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
                importFile,
            },
        });
        const input = form.querySelector<HTMLInputElement>('input[data-file="dictionary"]')!;
        const files = [
            new File(['first'], 'first.zip', { type: 'application/zip' }),
            new File(['second'], 'second.zip', { type: 'application/zip' }),
        ];
        Object.defineProperty(input, 'files', { configurable: true, value: files });

        expect(input.multiple).toBe(true);
        form.querySelector<HTMLButtonElement>('[data-action="import-yomitan-dictionary"]')!.click();
        await waitForCondition(() => typeof input.onchange === 'function');
        input.dispatchEvent(new Event('change'));

        await waitForCondition(() => importFile.mock.calls.length === 1);
        expect(importFile.mock.calls[0]?.[0]).toBe(files[0]);
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
        expect(form.querySelector<HTMLElement>('[data-settings-save-status]')?.textContent).toContain('2 installs running');

        firstImport.resolve(importSummary('First dictionary'));
        await waitForCondition(() => importFile.mock.calls.length === 2);
        expect(importFile.mock.calls[1]?.[0]).toBe(files[1]);
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);

        secondImport.resolve(importSummary('Second dictionary'));
        await waitForCondition(() => form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled === false);

        expect(dependencies.refreshDictionaryStyles).toHaveBeenCalledTimes(2);
        expect(dependencies.scheduleDictionaryRescan).toHaveBeenCalledTimes(2);
        expect(dependencies.refreshNewTabIfCurrent).toHaveBeenCalledOnce();
        expect(form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-backup [data-import-status]')?.textContent)
            .toBe('Imported 2 from 2 sources.');
    });

    it('reports one truthful combined result when a bulk import only partly succeeds', async () => {
        const failure = new Error('broken archive');
        const importFile = vi.fn()
            .mockResolvedValueOnce(importSummary('First dictionary'))
            .mockRejectedValueOnce(failure)
            .mockResolvedValueOnce(importSummary('Third dictionary'));
        const { dependencies, form } = createSettingsDialog({
            dictionaries: {
                summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
                importFile,
            },
        });
        const input = form.querySelector<HTMLInputElement>('input[data-file="dictionary"]')!;
        const files = [
            new File(['first'], 'first.zip', { type: 'application/zip' }),
            new File(['broken'], 'broken.zip', { type: 'application/zip' }),
            new File(['third'], 'third.zip', { type: 'application/zip' }),
        ];
        Object.defineProperty(input, 'files', { configurable: true, value: files });

        form.querySelector<HTMLButtonElement>('[data-action="import-yomitan-dictionary"]')!.click();
        await waitForCondition(() => typeof input.onchange === 'function');
        input.dispatchEvent(new Event('change'));
        await waitForCondition(() => importFile.mock.calls.length === 3);
        await waitForCondition(() => form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled === false);

        expect(importFile.mock.calls.map(call => call[0])).toEqual(files);
        expect(dependencies.refreshDictionaryStyles).toHaveBeenCalledTimes(2);
        expect(dependencies.scheduleDictionaryRescan).toHaveBeenCalledTimes(2);
        expect(dependencies.refreshNewTabIfCurrent).toHaveBeenCalledOnce();
        expect(form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-backup [data-import-status]')?.textContent)
            .toBe('Imported 2 from 2 sources. 1 file failed: broken.zip.');
    });

    it('verifies a catalogue download and atomically enables it in the active profile', async () => {
        const recommendation = recommendedDictionariesForLearnerLanguage('ko')[0]!;
        const profile = {
            ...DEFAULT_SETTINGS.languageProfiles[0]!,
            outputLanguage: 'ko',
            dictionaries: {
                installed: ['Existing Korean dictionary'],
                enabled: ['Existing Korean dictionary'],
                order: ['Existing Korean dictionary'],
            },
        };
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            activeLanguageProfileId: profile.id,
            languageProfiles: [profile],
            dictionaryPreferences: [{
                name: 'Existing Korean dictionary',
                alias: 'Existing Korean dictionary',
                enabled: true,
                priority: 0,
                type: 'terms',
            }],
        };
        const importedTitle = 'JMdict [2026-07-23]';
        const importFromUrl = vi.fn().mockResolvedValue(importSummary(importedTitle));
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            dictionaries: {
                summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
                importFromUrl,
            },
        });

        recommendedButton(form, recommendation.id).click();
        await waitForCondition(() =>
            settings.languageProfiles[0]?.dictionaries.enabled.includes(importedTitle) === true);

        expect(importFromUrl).toHaveBeenCalledWith(
            recommendation.downloadUrl,
            expect.any(String),
            expect.any(Function),
            {
                integrity: {
                    sha256: recommendation.sha256,
                    bytes: recommendation.bytes,
                },
            },
        );
        expect(settings.languageProfiles[0]?.dictionaries).toEqual({
            installed: ['Existing Korean dictionary', importedTitle],
            enabled: ['Existing Korean dictionary', importedTitle],
            order: ['Existing Korean dictionary', importedTitle],
        });
        expect(normalizeReaderSettings(settings).dictionaryPreferences
            .find(preference => preference.name === importedTitle)?.enabled).toBe(true);
    });

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

        expect(form.querySelector<HTMLElement>('[data-import-status]')?.textContent).toBe('Dictionary download failed.');
        expect(dependencies.toast).toHaveBeenCalledWith('Dictionary download failed.');
        expect(recommendedButton(form, 'jitendex').disabled).toBe(false);
    });

    it('identifies a missing storage runtime instead of reporting a dictionary download failure', async () => {
        const importFromUrl = vi.fn().mockRejectedValue(userFacingError('storageRuntimeUnavailable'));
        const { dependencies, form } = createSettingsDialog({
            dictionaries: {
                summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
                importFromUrl,
            },
        });

        recommendedButton(form, 'jitendex').click();
        await waitForCondition(() => (dependencies.toast as ReturnType<typeof vi.fn>).mock.calls.length > 0);

        const expected = 'よむ storage is unavailable. Reload the page; if this continues, reinstall よむ.';
        expect(form.querySelector<HTMLElement>('[data-import-status]')?.textContent).toBe(expected);
        expect(dependencies.toast).toHaveBeenCalledWith(expected);
        expect(dependencies.toast).not.toHaveBeenCalledWith('Dictionary download failed.');
    });

    // GitHub #39. This test used to reject with `new Error('Dictionary download is
    // blocked in this browser.')` -- a sentence no production code has ever produced.
    // The matcher it exercised substring-matched exactly that fiction, so the test
    // passed while the real recovery path was unreachable for every user. It now
    // rejects with the error the download layer actually throws.
    it.each([
        ['dictionaryDownloadBlocked', 'Download blocked.'],
        ['dictionaryDownloadNeedsBridge', 'Download needs bridge;'],
    ] as const)('shows a toast with the manual download hint for %s', async (copyKey, expectedMessage) => {
        const importFromUrl = vi.fn().mockRejectedValue(userFacingError(copyKey));
        const { dependencies, form } = createSettingsDialog({
            dictionaries: {
                summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
                importFromUrl,
            },
        });

        recommendedButton(form, 'jitendex').click();
        await waitForCondition(() => (dependencies.toast as ReturnType<typeof vi.fn>).mock.calls.length > 0);

        const status = form.querySelector<HTMLElement>('[data-import-status]')?.textContent ?? '';
        expect(status).toContain(expectedMessage);
        expect(status).toContain('import the ZIP');
        expect(dependencies.toast).toHaveBeenCalledWith(status);
        expect(recommendedButton(form, 'jitendex').disabled).toBe(false);
    });
});
