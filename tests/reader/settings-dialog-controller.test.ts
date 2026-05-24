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

    it('requests Japanese settings parsing after opening and language changes', () => {
        const parseSettingsJapanese = vi.fn();
        const { form } = createSettingsDialog({ parseSettingsJapanese });
        const language = form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')!;

        expect(parseSettingsJapanese).toHaveBeenCalledWith(form);

        parseSettingsJapanese.mockClear();
        language.value = 'ja';
        language.dispatchEvent(new Event('change', { bubbles: true }));

        expect(parseSettingsJapanese).toHaveBeenCalledWith(form);
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
