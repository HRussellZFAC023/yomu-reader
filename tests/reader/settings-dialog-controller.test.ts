import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAudioPreviewCard } from '../../src/reader/card-utils';
import { SettingsDialogController } from '../../src/reader/settings-dialog-controller';
import { SETTINGS_CHANGE_EVENT } from '../../src/reader/constants';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';
import type { ImportSummary } from '../../src/reader/yomitan';

type SettingsDialogControllerConstructor = new (dependencies: Record<string, unknown>) => SettingsDialogController;
type RefreshableSettingsDialogController = {
    refreshDeckControls: (form: HTMLFormElement) => Promise<void>;
    refreshDictionaryStatus: (form: HTMLFormElement) => Promise<void>;
};

function createSettingsDialog(overrides: Record<string, unknown> = {}): {
    dependencies: Record<string, any>;
    controller: SettingsDialogController;
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

async function waitForCondition(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt++) {
        await flushPromises();
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
    });

    it('closes when Escape is pressed from a settings text field', () => {
        const opener = document.createElement('button');
        document.body.append(opener);
        opener.focus();
        const { dismiss, form } = createSettingsDialog();
        const input = form.querySelector<HTMLInputElement>('input[name="apiKey"]')!;
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

        expect(opener.getAttribute('aria-hidden')).toBe('true');
        expect((opener as HTMLElement & { inert?: boolean }).inert).toBe(true);

        input.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(dismiss).toHaveBeenCalledOnce();
        expect(opener.hasAttribute('aria-hidden')).toBe(false);
        expect((opener as HTMLElement & { inert?: boolean }).inert).not.toBe(true);
        expect(document.activeElement).toBe(opener);
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

        expect(parseSettingsJapanese).toHaveBeenCalledWith(form);

        parseSettingsJapanese.mockClear();
        language.value = 'ja';
        language.dispatchEvent(new Event('change', { bubbles: true }));

        expect(parseSettingsJapanese).toHaveBeenCalledWith(form);

        parseSettingsJapanese.mockClear();
        form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][data-panel="dictionaries"]')?.click();
        await flushPromises();

        expect(parseSettingsJapanese).toHaveBeenCalledWith(form);
    });

    it('publishes and consumes shared theme changes', () => {
        const events: Array<CustomEvent<{ preview?: boolean; settings?: { theme?: unknown } }>> = [];
        const controller = new AbortController();
        window.addEventListener(SETTINGS_CHANGE_EVENT, event => {
            events.push(event as CustomEvent<{ preview?: boolean; settings?: { theme?: unknown } }>);
        }, { signal: controller.signal });
        const { dependencies, form } = createSettingsDialog();
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

    it('does not dismiss or toast from a stale save after settings is reopened', async () => {
        const refresh = deferred<void>();
        const refreshDictionaryStyles = vi.fn(() => refresh.promise);
        const { controller, dependencies, dismiss, form } = createSettingsDialog({
            dictionaries: {
                summary: vi.fn(() => new Promise(() => undefined)),
            },
            refreshDictionaryStyles,
        });

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => refreshDictionaryStyles.mock.calls.length === 1);
        form.remove();
        controller.open();

        refresh.resolve();
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

    it('tests Anki with a read-only connection check', async () => {
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

        form.querySelector<HTMLButtonElement>('[data-action="test-anki"]')?.click();
        await waitForCondition(() => form.querySelector<HTMLElement>('[data-anki-status]')?.textContent === 'Connected. AnkiConnect is reachable.');

        expect(isConnected).toHaveBeenCalledOnce();
        expect(ensureDeckAndModel).not.toHaveBeenCalled();
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.dataset.statusTone).toBe('success');
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
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: true };
        const isConnected = vi.fn().mockResolvedValue(true);
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: { isConnected },
        });

        await waitForCondition(() => form.querySelector<HTMLElement>('[data-anki-status]')?.textContent?.includes('Connected. AnkiConnect is reachable.') ?? false);

        expect(isConnected).toHaveBeenCalledOnce();
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
        await waitForCondition(() => form.querySelector<HTMLElement>('[data-anki-status]')?.dataset.statusTone === 'error');

        expect(isConnected).toHaveBeenCalledTimes(2);
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.textContent).toContain('AnkiConnect is not connected yet');
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.textContent).toContain('Open Anki');
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.textContent).toContain('check again');
    });

    it('updates the JPDB status light when the API key field changes', () => {
        const { form } = createSettingsDialog();
        const status = form.querySelector<HTMLElement>('[data-jpdb-status]')!;
        const apiKey = form.querySelector<HTMLInputElement>('input[name="apiKey"]')!;
        const enableReviews = form.querySelector<HTMLInputElement>('input[name="enableReviews"]')!;
        const jpdbMiningEnabled = form.querySelector<HTMLInputElement>('input[name="jpdbMiningEnabled"]')!;

        expect(status.dataset.statusTone).toBe('pending');

        apiKey.value = 'jpdb-key';
        apiKey.dispatchEvent(new Event('input', { bubbles: true }));

        expect(status.dataset.statusTone).toBe('success');
        expect(status.textContent).toContain('JPDB API key available');
        expect(status.textContent).toContain('Review buttons: enabled');
        expect(status.textContent).toContain('Deck changes: enabled');

        enableReviews.checked = false;
        enableReviews.dispatchEvent(new Event('change', { bubbles: true }));
        expect(status.textContent).toContain('Review buttons: disabled');

        jpdbMiningEnabled.checked = false;
        jpdbMiningEnabled.dispatchEvent(new Event('change', { bubbles: true }));
        expect(status.dataset.statusTone).toBe('pending');
        expect(status.textContent).toContain('Deck changes: disabled');

        apiKey.value = '';
        apiKey.dispatchEvent(new Event('input', { bubbles: true }));

        expect(status.dataset.statusTone).toBe('pending');
        expect(status.textContent).toContain('JPDB API key missing');
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
        await waitForCondition(() => form.querySelector<HTMLElement>('[data-anki-status]')?.textContent?.includes('Deck "よむ" and note type "よむ Japanese" are ready.') ?? false);

        expect(isConnected).toHaveBeenCalledOnce();
        expect(ensureDeckAndModel).toHaveBeenCalledOnce();
    });

    it('applies the best scanned Anki deck and note type to the settings form', async () => {
        const isConnected = vi.fn().mockResolvedValue(true);
        const scanLibrary = vi.fn().mockResolvedValue({
            deckNames: ['Anime Mining'],
            models: [{
                modelName: 'Imported Japanese',
                fields: ['Vocabulary-Kanji', 'Vocabulary-Kana', 'Glossary'],
                score: 9,
                suggestions: [
                    { role: 'expression', fieldName: 'Vocabulary-Kanji', confidence: 'high' },
                    { role: 'reading', fieldName: 'Vocabulary-Kana', confidence: 'high' },
                    { role: 'meaning', fieldName: 'Glossary', confidence: 'medium' },
                ],
            }],
            suggestedModel: {
                modelName: 'Imported Japanese',
                fields: ['Vocabulary-Kanji', 'Vocabulary-Kana', 'Glossary'],
                score: 9,
                suggestions: [
                    { role: 'expression', fieldName: 'Vocabulary-Kanji', confidence: 'high' },
                    { role: 'reading', fieldName: 'Vocabulary-Kana', confidence: 'high' },
                    { role: 'meaning', fieldName: 'Glossary', confidence: 'medium' },
                ],
            },
        });
        const { form } = createSettingsDialog({
            anki: {
                isConnected,
                scanLibrary,
            },
        });

        form.querySelector<HTMLButtonElement>('[data-action="scan-anki"]')?.click();
        await waitForCondition(() => form.querySelector<HTMLSelectElement>('select[name="ankiModel"]')?.value === 'Imported Japanese');

        expect(form.querySelector<HTMLSelectElement>('select[name="ankiDeck"]')?.value).toBe('Anime Mining');
        expect(form.querySelector<HTMLSelectElement>('select[name="ankiModel"]')?.value).toBe('Imported Japanese');
        expect(Array.from(form.querySelectorAll<HTMLOptionElement>('[data-anki-deck-options] option')).map(option => option.value)).toEqual(['Anime Mining']);
        expect(Array.from(form.querySelectorAll<HTMLOptionElement>('[data-anki-model-options] option')).map(option => option.value)).toEqual(['Imported Japanese']);
        expect(form.querySelector<HTMLSelectElement>('select[data-anki-field-role="expression"]')?.value).toBe('Vocabulary-Kanji');
        expect(form.querySelector<HTMLSelectElement>('select[data-anki-field-role="reading"]')?.value).toBe('Vocabulary-Kana');
        expect(form.querySelector<HTMLSelectElement>('select[data-anki-field-role="meaning"]')?.value).toBe('Glossary');
        expect(Array.from(form.querySelectorAll<HTMLElement>('[data-confidence]')).map(chip => `${chip.dataset.confidence}:${chip.textContent}`)).toEqual([
            'high:High',
            'high:High',
            'medium:Medium',
        ]);
        expect(JSON.parse(form.querySelector<HTMLInputElement>('[data-anki-scan-confidence]')?.value ?? '{}')).toEqual({
            'Imported Japanese': {
                expression: 'high',
                reading: 'high',
                meaning: 'medium',
            },
        });
        expect(form.querySelector('[data-newtab-anki-decks]')).toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[name="newTabAnkiDisabledDecks"]')?.value).toBe('');
        expect(JSON.parse(form.querySelector<HTMLInputElement>('input[name="ankiFieldMappings"]')?.value ?? '{}')).toEqual({
            'Imported Japanese': {
                expression: 'Vocabulary-Kanji',
                reading: 'Vocabulary-Kana',
                meaning: 'Glossary',
            },
        });
        const meaning = form.querySelector<HTMLSelectElement>('select[data-anki-field-role="meaning"]')!;
        meaning.value = 'Vocabulary-Kana';
        meaning.dispatchEvent(new Event('change', { bubbles: true }));
        expect(JSON.parse(form.querySelector<HTMLInputElement>('input[name="ankiFieldMappings"]')?.value ?? '{}')).toEqual({
            'Imported Japanese': {
                expression: 'Vocabulary-Kanji',
                reading: 'Vocabulary-Kana',
                meaning: 'Vocabulary-Kana',
            },
        });
        expect(form.querySelector<HTMLElement>('[data-anki-status]')?.textContent).toContain('expression: Vocabulary-Kanji');
    });

    it('preserves disabled Anki deck preferences while scanning Anki library metadata', async () => {
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
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

        form.querySelector<HTMLButtonElement>('[data-action="scan-anki"]')?.click();
        await waitForCondition(() => form.querySelector<HTMLElement>('[data-anki-status]')?.textContent?.includes('Found 2 decks') === true);

        expect(scanLibrary).toHaveBeenCalled();
        expect(form.querySelector('[data-newtab-anki-decks]')).toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[name="newTabAnkiDisabledDecks"]')?.value).toBe('Missing Deck, Archive');
    });

    it('scans Anki through AnkiConnect on mobile handoff devices when a bridge is reachable', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            configurable: true,
        });
        const isConnected = vi.fn().mockResolvedValue(true);
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false };
        const scanLibrary = vi.fn().mockResolvedValue({
            deckNames: ['Android Bridge'],
            models: [{
                modelName: 'Bridge Japanese',
                fields: ['Expression', 'Reading', 'Meaning'],
                score: 9,
                suggestions: [
                    { role: 'expression', fieldName: 'Expression', confidence: 'high' },
                    { role: 'reading', fieldName: 'Reading', confidence: 'high' },
                    { role: 'meaning', fieldName: 'Meaning', confidence: 'high' },
                ],
            }],
            suggestedModel: {
                modelName: 'Bridge Japanese',
                fields: ['Expression', 'Reading', 'Meaning'],
                score: 9,
                suggestions: [
                    { role: 'expression', fieldName: 'Expression', confidence: 'high' },
                    { role: 'reading', fieldName: 'Reading', confidence: 'high' },
                    { role: 'meaning', fieldName: 'Meaning', confidence: 'high' },
                ],
            },
        });
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: {
                isConnected,
                scanLibrary,
            },
        });

        try {
            form.querySelector<HTMLButtonElement>('[data-action="scan-anki"]')?.click();
            await waitForCondition(() => form.querySelector<HTMLSelectElement>('select[name="ankiModel"]')?.value === 'Bridge Japanese');

            expect(isConnected).toHaveBeenCalledOnce();
            expect(scanLibrary).toHaveBeenCalledOnce();
            expect(form.querySelector<HTMLSelectElement>('select[name="ankiDeck"]')?.value).toBe('Android Bridge');
            expect(form.querySelector<HTMLElement>('[data-anki-status]')?.textContent).toContain('Bridge Japanese');
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
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false };
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            anki: {
                isConnected,
                scanLibrary,
            },
        });

        try {
            form.querySelector<HTMLButtonElement>('[data-action="scan-anki"]')?.click();
            let fallbackText = '';
            await waitForCondition(() => {
                const text = form.querySelector<HTMLElement>('[data-anki-status]')?.textContent ?? '';
                if (!text.includes('AnkiConnect is not reachable')) return false;
                fallbackText = text;
                return true;
            });

            expect(isConnected).toHaveBeenCalledOnce();
            expect(scanLibrary).not.toHaveBeenCalled();
            expect(fallbackText).toContain('new notes only');
            expect(fallbackText).toContain('Android bridge');
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
        expect(form.querySelector<HTMLElement>('[data-settings-save-status]')?.textContent).toContain('2 dictionary installs');

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(dependencies.toast).toHaveBeenCalledWith('Dictionary import is still running. Save will be available when it finishes.');
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
        expect(status).toContain('download the ZIP manually');
        expect(dependencies.toast).toHaveBeenCalledWith(status);
        expect(recommendedButton(form, 'jitendex').disabled).toBe(false);
    });
});
