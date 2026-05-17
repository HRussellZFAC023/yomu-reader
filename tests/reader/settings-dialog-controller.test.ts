import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsDialogController } from '../../src/reader/settings-dialog-controller';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';
import type { ImportSummary } from '../../src/reader/yomitan';

type SettingsDialogControllerConstructor = new (dependencies: Record<string, unknown>) => SettingsDialogController;

function createSettingsDialog(overrides: Record<string, unknown> = {}): {
    dependencies: Record<string, any>;
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
        anki: {},
        audio: { play: vi.fn(), stop: vi.fn() },
        subtitles: { refresh: vi.fn() },
        ocr: { refresh: vi.fn() },
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

    controller.open();

    return {
        dependencies,
        dismiss,
        form: document.querySelector<HTMLFormElement>('.jpdb-reader-settings')!,
    };
}

function recommendedButton(form: HTMLFormElement, id: string): HTMLButtonElement {
    return form.querySelector<HTMLButtonElement>(`[data-action="download-recommended-dictionary"][data-dictionary-id="${id}"]`)!;
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
        const { dismiss, form } = createSettingsDialog();
        const input = form.querySelector<HTMLInputElement>('input[name="apiKey"]')!;
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

        input.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(dismiss).toHaveBeenCalledOnce();
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
        expect(recommendedButton(form, 'jmdict').dataset.importState).toBe('queued');
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
        expect(form.querySelector<HTMLElement>('[data-settings-save-status]')?.textContent).toContain('2 dictionary installs');

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(dependencies.toast).toHaveBeenCalledWith('Dictionary import is still running. Save will be available when it finishes.');
        expect(dismiss).not.toHaveBeenCalled();

        firstImport.resolve(importSummary('Jitendex'));
        await waitForCondition(() => importFromUrl.mock.calls.length === 2);

        expect(recommendedButton(form, 'jmdict').dataset.importState).toBe('installing');
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);

        secondImport.resolve(importSummary('JMdict'));
        await waitForCondition(() => form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled === false);

        expect(form.querySelector<HTMLElement>('[data-settings-save-status]')?.hidden).toBe(true);
    });
});
