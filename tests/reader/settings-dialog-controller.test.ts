import '../../src/reader/companions/register-build-companions';
import { DEFAULT_SETTINGS, createSettingsDialog, deferred, flushPromises, getSettingsDialogTestState, importSummary, recommendedDictionariesForLearnerLanguage, resetSettingsDialogTestEnvironment, resetSettingsDialogTestState, settingsElement, waitForCondition, type CallTracker } from './helpers/settings-dialog-controller-fixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userFacingError } from '../../src/reader/app/user-facing-errors';


import { publishSettingsChange, subscribeToSettingsChanges, type SettingsChangeDetail } from '../../src/reader/settings/settings-change-bus';

import { listDictionaryArchives, persistDictionaryArchive } from '../../src/reader/dictionaries/archive-cache';
import {
    loadSettings,
    PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
    SETTINGS_STORAGE_KEY,
    normalizeReaderSettings,
    saveSettings as persistReaderSettings,
} from '../../src/reader/settings';
import { readSettingsPersistenceViewStrict } from '../../src/reader/settings/settings-persistence-transaction';
import type { SettingsIntentRecord } from '../../src/reader/settings/intent-ledger';
import { allowSyntheticReaderInteractionsForTests } from '../../src/reader/ui/trusted-interaction';
import type { AnkiFieldSuggestion, AnkiLibraryScanResult } from '../../src/reader/anki/types';
import type { ReaderSettings } from '../../src/reader/app/types';
import type { ImportSummary } from '../../src/reader/dictionaries/yomitan';


const settingsDialogTestState = getSettingsDialogTestState();

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

async function submitSettingsAndWait(
    form: HTMLFormElement,
    dismiss: CallTracker,
    persisted?: CallTracker,
): Promise<void> {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForCondition(() => settingsSavedShown(form)
        && (persisted === undefined || persisted.mock.calls.length === 1));
    expect(dismiss.mock.calls).toHaveLength(0);
}

function settingsSavedShown(form: HTMLFormElement): boolean {
    const status = form.querySelector<HTMLElement>('[data-settings-save-status]');
    return status?.hidden === false && ['Settings saved.', '設定を保存しました。'].includes(status.textContent ?? '');
}

async function clickTrustedSettingsSaveAndWait(
    form: HTMLFormElement,
    ...signals: CallTracker[]
): Promise<void> {
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await waitForCondition(() => settingsSavedShown(form) && signals.every(signal => signal.mock.calls.length === 1));
}

function expectExplicitSettingSaved<K extends keyof ReaderSettings>(
    saveSettings: CallTracker,
    key: K,
    value: ReaderSettings[K],
): void {
    expect(saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ [key]: value }),
        expect.objectContaining({ explicitUserChoiceKeys: expect.arrayContaining([key]) }),
    );
}

function expectExplicitIntentAdvanced(
    before: SettingsIntentRecord | undefined,
    after: SettingsIntentRecord | undefined,
    beforeValue: unknown,
    afterValue: unknown,
): void {
    expect(before).toEqual(expect.objectContaining({ value: beforeValue }));
    expect(after).toEqual(expect.objectContaining({ value: afterValue }));
    expect(after!.seq).toBeGreaterThan(before!.seq);
}

function previewInterfaceLanguage(
    form: HTMLFormElement,
    language: ReaderSettings['interfaceLanguage'] = 'ja',
): void {
    const select = form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')!;
    select.value = language;
    select.dispatchEvent(new Event('change', { bubbles: true }));
}

type InterfaceLanguagePreviewDialog = ReturnType<typeof createSettingsDialog> & {
    currentSettings: () => ReaderSettings;
    installedLanguages: ReaderSettings['interfaceLanguage'][];
};

function createInterfaceLanguagePreviewDialog(): InterfaceLanguagePreviewDialog {
    let current: ReaderSettings = { ...DEFAULT_SETTINGS, interfaceLanguage: 'en' };
    const installedLanguages: ReaderSettings['interfaceLanguage'][] = [];
    return {
        ...createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
            installFab: vi.fn(() => { installedLanguages.push(current.interfaceLanguage); }),
        }),
        currentSettings: () => current,
        installedLanguages,
    };
}

function expectInterfaceLanguagePreview(
    dialog: InterfaceLanguagePreviewDialog,
    language: ReaderSettings['interfaceLanguage'],
): void {
    expect(dialog.currentSettings().interfaceLanguage).toBe('en');
    expect(dialog.installedLanguages.at(-1)).toBe(language);
}


describe('settings dialog static template', () => {
    afterEach(() => resetSettingsDialogTestEnvironment());
    it('keeps imported labels inert and consumes private control tokens before mounting', () => {
        const label = '"><img id=x onerror=1>';
        const configured = {
            ...DEFAULT_SETTINGS,
            dictionaryLookupLinks: [...DEFAULT_SETTINGS.dictionaryLookupLinks, {
                id: 'escaped-label', label, urlTemplate: 'https://example.test/{term}',
                enabled: true, priority: 100,
            }],
        };
        const { form } = createSettingsDialog({ getSettings: () => configured });
        const labels = [...form.querySelectorAll<HTMLInputElement>('input[name^="dictionaryLookupLinks."][name$=".label"]')];
        expect(labels.some(input => input.value === label)).toBe(true);
        expect(form.querySelector('#x, script, [onerror], [onload]')).toBeNull();
        expect(form.querySelector('[data-yomu-private-token]')).toBeNull();
    });
});

describe('settings dialog sensitive-surface boundary', () => {
    afterEach(() => {
        resetSettingsDialogTestEnvironment();
    });

    it.each([
        { launcherUrl: 'https://yomureader.com/study/#settings=api', extension: false },
        { launcherUrl: 'moz-extension://yomu/newtab/index.html#settings=api', extension: true },
    ])('keeps the offhost page outside authoritative settings and opens only captured $launcherUrl', ({
        launcherUrl,
        extension,
    }) => {
        const setSettings = vi.fn();
        const listDecks = vi.fn();
        const ping = vi.fn();
        const isConnected = vi.fn();
        const summary = vi.fn();
        const setValue = vi.fn();
        const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as Window);
        const runtimeSendMessage = vi.fn(async () => ({ ok: true, tabId: 73 }));
        if (extension) {
            vi.stubGlobal('browser', {
                runtime: {
                    id: 'yomu@yomureader.com',
                    getURL: (path: string) => new URL(path, 'moz-extension://yomu/').href,
                    sendMessage: runtimeSendMessage,
                },
            });
        }
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

        const expectedUrl = new URL(launcherUrl);
        expectedUrl.hash = '#settings=backup';
        if (extension) {
            expect(open).not.toHaveBeenCalled();
            expect(runtimeSendMessage).toHaveBeenCalledOnce();
            expect(runtimeSendMessage).toHaveBeenCalledWith({
                type: 'yomu.openPackagedStudySettings',
                protocol: 'yomu-packaged-study-settings-launcher:v1',
                panel: 'backup',
            });
        } else {
            expect(open).toHaveBeenCalledOnce();
            expect(open).toHaveBeenCalledWith(expectedUrl.href, '_blank', 'noopener');
            expect(runtimeSendMessage).not.toHaveBeenCalled();
        }
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
        resetSettingsDialogTestEnvironment();
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

    it('routes a trusted save through the owning runtime persistence boundary', async () => {
        const memoryOnlySave = vi.fn().mockResolvedValue(undefined);
        const persisted = vi.fn();
        const { dismiss, form } = createSettingsDialog({
            saveSettings: memoryOnlySave,
            onSettingsPersisted: persisted,
        });
        localStorage.removeItem(SETTINGS_STORAGE_KEY);

        await submitSettingsAndWait(form, dismiss, persisted);

        expect(memoryOnlySave).toHaveBeenCalledOnce();
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
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

        await submitSettingsAndWait(form, dismiss, onSettingsPersisted);
        expect(current.dictionaryLookupLinks.map(link => link.id)).toEqual(liveReorder);
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

    it('commits a live theme preview as explicit intent instead of replaying the old light choice', async () => {
        vi.stubGlobal('location', new URL('http://127.0.0.1:5174/study/'));
        await persistReaderSettings(
            { ...DEFAULT_SETTINGS, theme: 'light' },
            { explicitUserChoiceKeys: ['theme'] },
        );
        const beforeIntent = (await readSettingsPersistenceViewStrict()).intentLedger.records.theme;
        let current = await loadSettings();
        expect(current.theme).toBe('light');
        const saveSettings = vi.fn(persistReaderSettings);
        const applyTheme = vi.fn((preview: ReaderSettings = current) => {
            // Production's runtime settings-change handler mutates the host's
            // current object in place while applying a preview.
            current.theme = preview.theme;
        });
        const persisted = vi.fn();
        const { dependencies, dismiss, form } = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
            saveSettings,
            onSettingsPersisted: persisted,
            applyTheme,
        });

        form.querySelector<HTMLButtonElement>('[data-theme-switch]')!.click();

        expect(settingsInputValue(form, '[data-theme-value]')).toBe('dark');
        expect(dependencies.applyTheme).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
        expect(current.theme).toBe('dark');
        expect((await loadSettings()).theme).toBe('light');

        await clickTrustedSettingsSaveAndWait(form, persisted);
        expect(dismiss).not.toHaveBeenCalled();

        expectExplicitSettingSaved(saveSettings, 'theme', 'dark');
        expect(current.theme).toBe('dark');
        expect((await loadSettings()).theme).toBe('dark');
        const afterIntent = (await readSettingsPersistenceViewStrict()).intentLedger.records.theme;
        expectExplicitIntentAdvanced(beforeIntent, afterIntent, 'light', 'dark');
    });

    it('commits a live interface-language preview as explicit intent without mutating its baseline', async () => {
        vi.stubGlobal('location', new URL('http://127.0.0.1:5174/study/'));
        await persistReaderSettings(
            { ...DEFAULT_SETTINGS, interfaceLanguage: 'en' },
            { explicitUserChoiceKeys: ['interfaceLanguage'] },
        );
        const beforeIntent = (await readSettingsPersistenceViewStrict()).intentLedger.records.interfaceLanguage;
        let current = await loadSettings();
        expect(current.interfaceLanguage).toBe('en');
        const installedLanguages: ReaderSettings['interfaceLanguage'][] = [];
        const saveSettings = vi.fn(persistReaderSettings);
        const persisted = vi.fn();
        const { dismiss, form } = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
            saveSettings,
            onSettingsPersisted: persisted,
            installFab: vi.fn(() => { installedLanguages.push(current.interfaceLanguage); }),
        });
        previewInterfaceLanguage(form);

        expect(form.lang).toBe('ja');
        expect(installedLanguages).toContain('ja');
        expect(current.interfaceLanguage).toBe('en');

        await clickTrustedSettingsSaveAndWait(form, persisted);
        expect(dismiss).not.toHaveBeenCalled();

        expectExplicitSettingSaved(saveSettings, 'interfaceLanguage', 'ja');
        expect(current.interfaceLanguage).toBe('ja');
        expect((await loadSettings()).interfaceLanguage).toBe('ja');
        const afterIntent = (await readSettingsPersistenceViewStrict()).intentLedger.records.interfaceLanguage;
        expectExplicitIntentAdvanced(beforeIntent, afterIntent, 'en', 'ja');
    });

    it('restores the durable interface language after a live preview is cancelled', () => {
        const dialog = createInterfaceLanguagePreviewDialog();

        previewInterfaceLanguage(dialog.form);
        expectInterfaceLanguagePreview(dialog, 'ja');

        dialog.form.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.click();

        expectInterfaceLanguagePreview(dialog, 'en');
    });

    it('uses a remotely adopted durable theme as the next Save baseline', async () => {
        let current: ReaderSettings = { ...DEFAULT_SETTINGS, theme: 'light' };
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const persisted = vi.fn();
        const { dismiss, form } = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
            saveSettings,
            onSettingsPersisted: persisted,
        });

        publishSettingsChange({ settings: { ...current, theme: 'dark' }, remote: true });
        expect(current.theme).toBe('dark');
        expect(form.querySelector<HTMLInputElement>('[data-theme-value]')?.value).toBe('dark');

        form.querySelector<HTMLButtonElement>('[data-theme-switch]')!.click();
        expect(current.theme).toBe('dark');
        expect(form.querySelector<HTMLInputElement>('[data-theme-value]')?.value).toBe('light');

        await clickTrustedSettingsSaveAndWait(form, persisted);
        expect(dismiss).not.toHaveBeenCalled();

        expectExplicitSettingSaved(saveSettings, 'theme', 'light');
    });

    it('refreshes the host preview-restore baseline after a remote durable adoption', () => {
        let current: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            theme: 'light',
            accentColor: '#102030',
            interfaceLanguage: 'en',
        };
        let restoreBaseline = {
            theme: current.theme,
            accentColor: current.accentColor,
            interfaceLanguage: current.interfaceLanguage,
        };
        const beginSettingsPreview = vi.fn((
            accentColor: string,
            interfaceLanguage: ReaderSettings['interfaceLanguage'],
            theme: ReaderSettings['theme'],
        ) => {
            restoreBaseline = { accentColor, interfaceLanguage, theme };
        });
        const dismiss = vi.fn(() => {
            current = { ...current, ...restoreBaseline };
        });
        const { form } = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
            beginSettingsPreview,
            dismiss,
        });

        publishSettingsChange({
            remote: true,
            settings: {
                ...current,
                theme: 'dark',
                accentColor: '#abcdef',
                interfaceLanguage: 'ja',
            },
        });

        expect(beginSettingsPreview).toHaveBeenLastCalledWith('#abcdef', 'ja', 'dark');
        form.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.click();

        expect(current).toMatchObject({
            theme: 'dark',
            accentColor: '#abcdef',
            interfaceLanguage: 'ja',
        });
    });

    it('restores a previewed interface language after external dialog teardown', () => {
        const dialog = createInterfaceLanguagePreviewDialog();

        previewInterfaceLanguage(dialog.form);
        expectInterfaceLanguagePreview(dialog, 'ja');

        dialog.form.remove();
        dialog.controller.releaseModalBackground();

        expectInterfaceLanguagePreview(dialog, 'en');
    });

    it('owns a replacement form after production-order teardown during mount', async () => {
        let releasePreviousForm: () => void = () => undefined;
        let current: ReaderSettings = { ...DEFAULT_SETTINGS, interfaceLanguage: 'en', theme: 'light' };
        const installedLanguages: ReaderSettings['interfaceLanguage'][] = [];
        const hostDismiss = vi.fn();
        const persisted = vi.fn();
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const mountDialog = (backdrop: HTMLElement, surface: HTMLElement): void => {
            const previous = document.querySelector<HTMLFormElement>('.jpdb-reader-settings');
            if (previous) {
                hostDismiss();
                previous.remove();
                releasePreviousForm();
            }
            document.body.append(backdrop, surface);
        };
        const dialog = createSettingsDialog({
            getSettings: () => current,
            setSettings: (settings: ReaderSettings) => { current = settings; },
            saveSettings,
            applyTheme: vi.fn((preview: ReaderSettings = current) => { current.theme = preview.theme; }),
            installFab: vi.fn(() => { installedLanguages.push(current.interfaceLanguage); }),
            mountDialog,
            onSettingsPersisted: persisted,
        });
        releasePreviousForm = () => dialog.controller.releaseModalBackground();
        previewInterfaceLanguage(dialog.form);
        expect(installedLanguages.at(-1)).toBe('ja');
        expect(current.interfaceLanguage).toBe('en');
        dialog.form.querySelector<HTMLButtonElement>('[data-theme-switch]')!.click();
        expect(current.theme).toBe('dark');

        dialog.controller.open();
        expect(installedLanguages.at(-1)).toBe('en');
        expect(current.theme).toBe('light');
        const replacement = Array.from(document.querySelectorAll<HTMLFormElement>('.jpdb-reader-settings')).at(-1)!;
        expect(settingsInputValue(replacement, '[data-theme-value]')).toBe('light');
        replacement.querySelector<HTMLButtonElement>('[data-theme-switch]')!.click();
        expect(current.theme).toBe('dark');
        await clickTrustedSettingsSaveAndWait(replacement, persisted);

        expectExplicitSettingSaved(saveSettings, 'theme', 'dark');
        expect(hostDismiss).toHaveBeenCalledOnce();
        expect(dialog.dismiss).not.toHaveBeenCalled();
        expect(settingsSavedShown(replacement)).toBe(true);
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

    it('confirms the save without waiting for dictionary styles to refresh', async () => {
        const refresh = deferred<void>();
        const refreshDictionaryStyles = vi.fn(() => refresh.promise);
        const { dependencies, dismiss, form } = createSettingsDialog({
            dictionaries: {
                summary: vi.fn(() => new Promise(() => undefined)),
            },
            refreshDictionaryStyles,
        });

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => settingsSavedShown(form));

        expect(refreshDictionaryStyles).toHaveBeenCalled();
        expect(dismiss).not.toHaveBeenCalled();
        expect(dependencies.toast).not.toHaveBeenCalledWith('Settings saved.');

        refresh.resolve();
    });


    // Request Japanese sites is toggled from the puck and toolbar; a Settings
    // save that no longer renders it must keep the saved choice.
    it('keeps a saved Request Japanese sites choice through a Settings save', async () => {
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
        expect(form.querySelector('[name="preferJapaneseSiteLanguage"]')).toBeNull();

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => settingsSavedShown(form));
        expect(dismiss).not.toHaveBeenCalled();

        // Unchanged, so its storage mirror is not rewritten either.
        expect(localStorage.getItem(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)).toBeNull();
        expect(onSettingsPersisted).toHaveBeenCalledWith(expect.objectContaining({
            preferJapaneseSiteLanguage: true,
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
        const importButton = form.querySelector<HTMLButtonElement>('[data-action="import-reader-settings"]')!;
        await waitForCondition(() => !importButton.disabled);
        const openFilePicker = vi.spyOn(settingsFile, 'click');
        importButton.click();
        await waitForCondition(() => dependencies.toast.mock.calls.length > 0);
        expect(dependencies.toast).toHaveBeenCalledWith(
            'Firefox can only ask for that permission on a Yomu page. Open Study, then add the account details in Settings.',
        );
        expect(openFilePicker).not.toHaveBeenCalled();
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
        expect(settingsSavedShown(form)).toBe(false);
        expect(settingsSavedShown(document.querySelector<HTMLFormElement>('.jpdb-reader-settings')!)).toBe(false);
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
});

describe('settings dialog dictionary imports', () => {
    afterEach(() => {
        resetSettingsDialogTestState();
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
        const enabled = jitenSource.querySelector<HTMLInputElement>('input[name="jitenDefinitions.enabled"]')!;
        enabled.checked = false;
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

        expect(dialog.form.querySelector<HTMLInputElement>('input[name="jitenDefinitions.enabled"]')?.checked)
            .toBe(false);
        expect(sourceOrder(dialog.form)).toEqual(liveSourceOrder);
        expect(lookupOrder(dialog.form).indexOf(bccwjId)).toBeLessThan(lookupOrder(dialog.form).indexOf(jitenId));
        expect(dialog.form.querySelector<HTMLElement>('[data-dictionary-status]')?.textContent).toBe('');
        expect(dialog.dependencies.refreshDictionaryStyles).toHaveBeenCalled();

        dialog.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => settingsSavedShown(dialog.form));
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

    it('queues recommended dictionary installs and keeps Save available while they run', async () => {
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
        const saved: ReaderSettings[] = [];
        const saveSettings = vi.fn(async (next: ReaderSettings) => { saved.push(next); });
        const { dismiss, form } = createSettingsDialog({
            saveSettings,
            dictionaries: {
                summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
                importFromUrl,
            },
        });

        const save = () => form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        const saveStatus = () => form.querySelector<HTMLElement>('[data-settings-save-status]')!;
        const submit = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        recommendedButton(form, 'jitendex').click();
        recommendedButton(form, 'wty-ja-ja').click();

        await waitForCondition(() => importFromUrl.mock.calls.length === 1);
        // Jitendex installs from the mirror, so its digest travels with it.
        expect(importFromUrl.mock.calls[0]![3]).toEqual({ integrity: { sha256: expect.any(String), bytes: expect.any(Number) } });

        expect(recommendedButton(form, 'jitendex').dataset.importState).toBe('installing');
        expect(recommendedStatus(form, 'jitendex').textContent).toContain('Reading dictionary ZIP');
        expect(recommendedButton(form, 'wty-ja-ja').dataset.importState).toBe('queued');
        expect(recommendedStatus(form, 'wty-ja-ja').textContent).toContain('queued');
        // YQ-11: an install no longer holds Save; the queue is reported beside it.
        expect(save().disabled).toBe(false);
        expect(save().dataset.saveBlocked).toBeUndefined();
        expect(save().textContent).toBe('Save');
        expect(saveStatus().textContent).toContain('2 installs running');

        const audio = form.querySelector<HTMLInputElement>('input[name="audioEnabled"]')!;
        audio.checked = !audio.checked;
        submit();
        await waitForCondition(() => saved.length === 1);
        expect(saved[0]!.audioEnabled).toBe(audio.checked);
        expect(dismiss).not.toHaveBeenCalled();

        // The install's own write lands after that Save and keeps its change.
        firstImport.resolve(importSummary('Jitendex'));
        await waitForCondition(() => saved.length === 2);
        expect(saved[1]!.dictionaryPreferences.map(preference => preference.name)).toContain('Jitendex');
        expect(saved[1]!.audioEnabled).toBe(audio.checked);

        // A Save before the form shows Jitendex's row keeps Jitendex.
        await waitForCondition(() => importFromUrl.mock.calls.length === 2);
        await waitForCondition(() => !save().disabled);
        submit();
        await waitForCondition(() => saved.length === 3);
        expect(saved[2]!.dictionaryPreferences.map(preference => preference.name)).toContain('Jitendex');

        secondImport.resolve(importSummary('WTY JA-JA'));
        await waitForCondition(() => saved.length === 4 && !saveStatus().textContent?.includes('running'));

        expect(saved[3]!.dictionaryPreferences.map(preference => preference.name)).toEqual(expect.arrayContaining(['Jitendex', 'WTY JA-JA']));
        expect(save().disabled).toBe(false);
        expect(save().textContent).toBe('Save');
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
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
        expect(form.querySelector<HTMLElement>('[data-settings-save-status]')?.textContent).toContain('2 installs running');

        firstImport.resolve(importSummary('First dictionary'));
        await waitForCondition(() => importFile.mock.calls.length === 2);
        expect(importFile.mock.calls[1]?.[0]).toBe(files[1]);
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);

        secondImport.resolve(importSummary('Second dictionary'));
        await waitForCondition(() => form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-backup [data-import-status]')?.textContent === 'Imported 2 from 2 sources.');

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
        const recommendation = recommendedDictionariesForLearnerLanguage('en')[0]!;
        const profile = {
            ...DEFAULT_SETTINGS.languageProfiles[0]!,
            outputLanguage: 'en',
            dictionaries: {
                installed: ['Existing Japanese dictionary'],
                enabled: ['Existing Japanese dictionary'],
                order: ['Existing Japanese dictionary'],
            },
        };
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            activeLanguageProfileId: profile.id,
            languageProfiles: [profile],
            dictionaryPreferences: [{
                name: 'Existing Japanese dictionary',
                alias: 'Existing Japanese dictionary',
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
            installed: ['Existing Japanese dictionary', importedTitle],
            enabled: ['Existing Japanese dictionary', importedTitle],
            order: ['Existing Japanese dictionary', importedTitle],
        });
        expect(normalizeReaderSettings(settings).dictionaryPreferences
            .find(preference => preference.name === importedTitle)?.enabled).toBe(true);
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
});

describe('Settings Save keeps the dialog open', () => {
    // Discord (Leia, 2026-10-01): tweaking settings is save, look, tweak again, so
    // Save must not close the dialog. Cancel, Escape and the backdrop still close.
    function saveStatus(form: HTMLFormElement): HTMLElement {
        return settingsElement<HTMLElement>(form, '[data-settings-save-status]');
    }

    function shortcutField(form: HTMLFormElement, name: string): HTMLInputElement {
        return settingsElement<HTMLInputElement>(form, `[data-shortcut-input][name="${name}"]`);
    }

    async function submitAndSettle(form: HTMLFormElement, saveSettings: { mock: { calls: unknown[][] } }, calls: number): Promise<void> {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => saveSettings.mock.calls.length === calls
            && !settingsElement<HTMLButtonElement>(form, 'button[type="submit"]').disabled);
    }


    afterEach(() => { resetSettingsDialogTestEnvironment(); });

    it('makes the saved settings the baseline for the next Save and for Cancel', async () => {
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { dependencies, dismiss, form } = createSettingsDialog({ saveSettings });
        const accent = settingsElement<HTMLInputElement>(form, 'input[name="accentColor"]');
        accent.value = '#123456';
        await submitAndSettle(form, saveSettings, 1);
        expect(dependencies.beginSettingsPreview).toHaveBeenLastCalledWith('#123456', expect.anything(), expect.anything());

        const furigana = settingsElement<HTMLInputElement>(form, 'input[name="stickyBottomSheet"]');
        furigana.checked = !furigana.checked;
        await submitAndSettle(form, saveSettings, 2);
        const secondIntent = saveSettings.mock.calls[1]![1] as { explicitUserChoiceKeys: string[] };
        expect(secondIntent.explicitUserChoiceKeys).toContain('stickyBottomSheet');
        expect(secondIntent.explicitUserChoiceKeys).not.toContain('accentColor');

        settingsElement<HTMLButtonElement>(form, '[data-action="cancel"]').click();
        expect(dismiss).toHaveBeenCalledOnce();
    });

    it('leaves no interface-language preview for Cancel to undo once it is saved', async () => {
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { dependencies, dismiss, form } = createSettingsDialog({ saveSettings });
        const language = settingsElement<HTMLSelectElement>(form, 'select[name="interfaceLanguage"]');
        language.value = 'ja';
        language.dispatchEvent(new Event('change', { bubbles: true }));
        await submitAndSettle(form, saveSettings, 1);
        const reinstalls = dependencies.installFab.mock.calls.length;

        settingsElement<HTMLButtonElement>(form, '[data-action="cancel"]').click();

        expect(dismiss).toHaveBeenCalledOnce();
        expect(dependencies.installFab).toHaveBeenCalledTimes(reinstalls);
    });

    it.each([
        ['a checkbox', (form: HTMLFormElement) => {
            const sticky = settingsElement<HTMLInputElement>(form, 'input[name="stickyBottomSheet"]');
            sticky.checked = !sticky.checked;
            sticky.dispatchEvent(new Event('change', { bubbles: true }));
        }],
        ['a recorded shortcut', (form: HTMLFormElement) => {
            shortcutField(form, 'shortcuts.scanPage')
                .dispatchEvent(new KeyboardEvent('keydown', { key: 'K', altKey: true, bubbles: true, cancelable: true }));
        }],
    ])('does not confirm a save %s changed under while it ran', async (_label, edit) => {
        let finishSave!: () => void;
        const saveSettings = vi.fn()
            .mockImplementationOnce(() => new Promise<void>(resolve => { finishSave = resolve; }))
            .mockResolvedValue(undefined);
        const { form } = createSettingsDialog({ saveSettings });
        const save = settingsElement<HTMLButtonElement>(form, 'button[type="submit"]');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => saveSettings.mock.calls.length === 1);

        edit(form);
        finishSave();
        await waitForCondition(() => !save.disabled);

        expect(saveStatus(form).hidden).toBe(true);

        await submitAndSettle(form, saveSettings, 2);
        expect(saveStatus(form).textContent).toBe('Settings saved.');
    });

    it('drops an earlier confirmation when a later Save fails', async () => {
        const saveSettings = vi.fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('disk full'));
        const { form } = createSettingsDialog({ saveSettings });
        await submitAndSettle(form, saveSettings, 1);
        expect(saveStatus(form).textContent).toBe('Settings saved.');

        await submitAndSettle(form, saveSettings, 2);

        expect(saveStatus(form).hidden).toBe(true);
        expect(saveStatus(form).textContent).toBe('');
    });

    it('keeps the dialog open without a confirmation when the save fails', async () => {
        const saveSettings = vi.fn().mockRejectedValue(new Error('disk full'));
        const { dependencies, dismiss, form } = createSettingsDialog({ saveSettings });

        await submitAndSettle(form, saveSettings, 1);

        expect(dismiss).not.toHaveBeenCalled();
        expect(saveStatus(form).hidden).toBe(true);
        expect(dependencies.toast).toHaveBeenCalledWith(expect.stringContaining('Settings save failed'));
    });
});
