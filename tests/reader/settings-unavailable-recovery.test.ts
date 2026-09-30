// A content-page Reader that cannot read the learner's settings used to leave
// nothing on the page: boot only console.errored, and the userscript menu was
// registered after settings loaded, so it never appeared either. These cases
// drive the real boot + ReaderApp against a failing GM backend and pin the one
// visible, localized way back: a menu command and an error-state puck that
// open the Yomu-owned Study page through the trusted Settings launcher route.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { bootReaderApp, resetReaderBootStateForTests } from '../../src/reader/app/boot';
import { NEW_TAB_PAGE_URL } from '../../src/reader/app/constants';
import { ReaderApp } from '../../src/reader/app/main';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/reader/settings/index';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';
import { openStudySettingsRecovery } from '../../src/reader/ui/fab-settings-recovery';
import { allowSyntheticReaderInteractionsForTests } from '../../src/reader/ui/trusted-interaction';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

const ORDINARY_SITE = 'https://example.com/article';
const RECOVERY_SELECTOR = '[data-yomu-settings-recovery]';
const STUDY_RECOVERY_URL = `${NEW_TAB_PAGE_URL}#settings=backup`;
const EN_LABEL = 'よむ: Could not load settings · Open Study settings';
const JA_LABEL = 'よむ: 設定を読み込めませんでした · Studyの設定を開く';

type MenuCommand = readonly [name: string, run: () => unknown];

function installUserscriptMenu() {
    const commands: MenuCommand[] = [];
    const registerMenuCommand = vi.fn((name: string, run: () => unknown) => { commands.push([name, run]); });
    const openInTab = vi.fn();
    vi.stubGlobal('GM_registerMenuCommand', registerMenuCommand);
    vi.stubGlobal('GM_openInTab', openInTab);
    return { commands, openInTab };
}

function installRejectingGmBackend(): void {
    const unavailable = () => Promise.reject(new Error('GM storage backend rejected the read'));
    vi.stubGlobal('GM_getValue', vi.fn(unavailable));
    vi.stubGlobal('GM_setValue', vi.fn(unavailable));
    vi.stubGlobal('GM_deleteValue', vi.fn(unavailable));
}

function installTornSettingsPair(): void {
    const settings = { ...DEFAULT_SETTINGS, learningTargetChosen: true, onboardingSeen: true };
    const first = serializeSettingsPersistencePair(settings, { revision: 0, records: {} });
    const second = serializeSettingsPersistencePair(settings, { revision: 0, records: {} });
    installGmStorageFixture(new Map<string, unknown>([
        [SETTINGS_STORAGE_KEY, first[SETTINGS_STORAGE_KEY]],
        [SETTINGS_INTENT_LEDGER_STORAGE_KEY, second[SETTINGS_INTENT_LEDGER_STORAGE_KEY]],
    ]));
}

function installCommittedSettings(): void {
    const settings = { ...DEFAULT_SETTINGS, learningTargetChosen: true, onboardingSeen: true };
    installGmStorageFixture(new Map<string, unknown>(Object.entries(
        serializeSettingsPersistencePair(settings, { revision: 0, records: {} }),
    )));
}

function preferJapaneseInterface(): void {
    Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'ja-JP' });
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['ja-JP', 'ja'] });
}

async function recoveryPuck(): Promise<HTMLButtonElement> {
    await vi.waitFor(() => expect(document.querySelector(RECOVERY_SELECTOR)).not.toBeNull());
    return document.querySelector<HTMLButtonElement>(RECOVERY_SELECTOR)!;
}

function recoveryCommand(commands: readonly MenuCommand[], label: string): MenuCommand {
    const command = commands.find(([name]) => name === label);
    expect(command, `menu command ${label}`).toBeDefined();
    return command!;
}

describe('content-page Reader when settings storage is unreadable', () => {
    let consoleError: MockInstance<Parameters<typeof console.error>, void>;

    beforeEach(() => {
        resetReaderBootStateForTests();
        document.head.replaceChildren();
        document.body.replaceChildren();
        vi.stubGlobal('location', new URL(ORDINARY_SITE));
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        // jsdom cannot parse the production stylesheet's @layer rules; styling
        // is outside these startup-failure cases.
        vi.spyOn(ReaderApp.prototype as unknown as { installStyles(): void }, 'installStyles')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        resetReaderBootStateForTests();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        document.head.replaceChildren();
        document.body.replaceChildren();
    });

    it('registers a recovery menu command and shows an error-state puck when the backend rejects', async () => {
        const menu = installUserscriptMenu();
        installRejectingGmBackend();

        bootReaderApp();
        const puck = await recoveryPuck();

        expect(consoleError).toHaveBeenCalled();
        expect(puck.classList.contains('jpdb-reader-fab')).toBe(true);
        expect(puck.dataset.jpdbReaderRoot).toBe('true');
        expect(puck.dataset.yomuSettingsRecovery).toBe('unavailable');
        expect(puck.getAttribute('aria-label')).toBe(EN_LABEL);
        expect(puck.title).toBe(EN_LABEL);
        expect(document.querySelectorAll(RECOVERY_SELECTOR)).toHaveLength(1);
        expect(menu.commands.map(([name]) => name)).toEqual([EN_LABEL]);

        puck.click();
        await vi.waitFor(() => expect(menu.openInTab).toHaveBeenCalledOnce());
        expect(menu.openInTab.mock.calls[0]?.[0]).toBe(STUDY_RECOVERY_URL);

        await recoveryCommand(menu.commands, EN_LABEL)[1]();
        await vi.waitFor(() => expect(menu.openInTab).toHaveBeenCalledTimes(2));
        expect(menu.openInTab.mock.calls[1]?.[0]).toBe(STUDY_RECOVERY_URL);
    });

    it('ignores a synthetic page click on the recovery puck', async () => {
        const menu = installUserscriptMenu();
        installRejectingGmBackend();

        bootReaderApp();
        const puck = await recoveryPuck();
        allowSyntheticReaderInteractionsForTests(false);
        puck.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await Promise.resolve();

        expect(menu.openInTab).not.toHaveBeenCalled();
    });

    it('localizes the recovery puck and menu command in Japanese', async () => {
        preferJapaneseInterface();
        const menu = installUserscriptMenu();
        installRejectingGmBackend();

        bootReaderApp();
        const puck = await recoveryPuck();

        expect(puck.getAttribute('aria-label')).toBe(JA_LABEL);
        expect(puck.title).toBe(JA_LABEL);
        expect(menu.commands.map(([name]) => name)).toEqual([JA_LABEL]);
        expect(`${puck.title}${menu.commands[0]?.[0]}`).not.toContain('未翻訳');
    });

    it('offers the same recovery when the settings pair stays torn after the strict retries', async () => {
        const menu = installUserscriptMenu();
        installTornSettingsPair();

        bootReaderApp();
        const puck = await recoveryPuck();

        expect(puck.getAttribute('aria-label')).toBe(EN_LABEL);
        expect(menu.commands.map(([name]) => name)).toEqual([EN_LABEL]);
        expect(document.querySelector('.jpdb-reader-fab:not([data-yomu-settings-recovery])')).toBeNull();
        expect(consoleError.mock.calls.flat().some(value => value instanceof Error
            && value.name === 'ReaderSettingsUnavailableError')).toBe(true);
    });

    it('reports a blocked Study launch on the puck instead of failing silently', async () => {
        const menu = installUserscriptMenu();
        menu.openInTab.mockImplementation(() => { throw new Error('popup blocked'); });
        vi.spyOn(window, 'open').mockReturnValue(null);
        installRejectingGmBackend();

        bootReaderApp();
        const puck = await recoveryPuck();
        puck.click();

        await vi.waitFor(() => expect(puck.dataset.yomuSettingsRecovery).toBe('open-failed'));
        expect(puck.getAttribute('aria-label')).toBe('よむ: Settings could not be opened.');
    });

    it('leaves a Yomu-owned page to its own recovery guard', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/docs/'));
        const menu = installUserscriptMenu();
        installRejectingGmBackend();

        bootReaderApp();
        await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(document.querySelector(RECOVERY_SELECTOR)).toBeNull();
        expect(menu.commands).toEqual([]);
    });

    it('keeps the ordinary Reader unchanged when settings load', async () => {
        const menu = installUserscriptMenu();
        installCommittedSettings();

        bootReaderApp();
        await vi.waitFor(() => {
            expect(menu.commands.map(([name]) => name)).toContain('よむ settings');
            expect(document.querySelector('.jpdb-reader-fab')).not.toBeNull();
        });

        expect(document.querySelector(RECOVERY_SELECTOR)).toBeNull();
        expect(menu.commands.map(([name]) => name)).not.toContain(EN_LABEL);
        expect(consoleError.mock.calls.filter(([message]) => String(message).startsWith('[Yomu Reader]'))).toEqual([]);
    });
});

describe('Study settings recovery launcher', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('asks the Firefox extension background for packaged Study instead of opening a moz-extension URL', async () => {
        vi.stubGlobal('location', new URL(ORDINARY_SITE));
        const sendMessage = vi.fn(async () => ({ ok: true, tabId: 41 }));
        vi.stubGlobal('browser', {
            runtime: {
                id: 'yomu@yomureader.com',
                getURL: (path: string) => new URL(path, 'moz-extension://yomu/').href,
                sendMessage,
            },
        });
        const windowOpen = vi.spyOn(window, 'open');

        await expect(openStudySettingsRecovery()).resolves.toBe(true);

        expect(sendMessage).toHaveBeenCalledWith({
            type: 'yomu.openPackagedStudySettings',
            protocol: 'yomu-packaged-study-settings-launcher:v1',
            panel: 'backup',
        });
        expect(windowOpen).not.toHaveBeenCalled();
    });
});
