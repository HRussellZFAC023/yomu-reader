import { afterEach, expect, it, vi } from 'vitest';
import { USERSCRIPT_SETTINGS_CHANGED_EVENT } from '../../src/reader/app/constants';
import type { GmValueChangeListener } from '../../src/reader/app/gm-storage-adapters';
import { managedStateStorageKey } from '../../src/reader/app/managed-read-path';
import { subscribeToReaderSettingsChanges } from '../../src/reader/app/settings-storage-subscription';
import { DEFAULT_SETTINGS, saveSettings, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { subscribeToHostedSettingsChanges } from '../../src/reader/userscript/hosted-settings-changes';
import { installUserscriptGmStorageBridge, uninstallUserscriptGmStorageBridge } from '../../src/reader/userscript/storage-bridge';
import { HOSTED_STUDY_LOCATION, installGmStorageFixture } from './helpers/settings-persistence-fixture';

afterEach(() => {
    uninstallUserscriptGmStorageBridge();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
});

it.each([false, true])('forwards native changes without values and detaches (post-reset=%s)', async afterReset => {
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    const epoch = { version: 1, generation: 1, resetId: 'live-settings-sync', committedAt: 1 } as const;
    installGmStorageFixture(afterReset ? new Map([['yomu:state-epoch', epoch]]) : undefined);
    const watchedSettingsKey = afterReset ? managedStateStorageKey(SETTINGS_STORAGE_KEY, epoch) : SETTINGS_STORAGE_KEY;
    const native = new Map<number, { key: string; listener: GmValueChangeListener }>();
    let next = 0;
    vi.stubGlobal('GM_addValueChangeListener', (key: string, listener: GmValueChangeListener) => {
        const id = ++next;
        native.set(id, { key, listener });
        return id;
    });
    vi.stubGlobal('GM_removeValueChangeListener', (id: number) => native.delete(id));
    const hints: unknown[] = [];
    const onHint = (event: Event): void => { hints.push(event instanceof CustomEvent ? event.detail : 'not-custom'); };
    window.addEventListener(USERSCRIPT_SETTINGS_CHANGED_EVENT, onHint);
    try {
        installUserscriptGmStorageBridge(subscribeToHostedSettingsChanges);
        await vi.waitFor(() => expect(native.size).toBe(afterReset ? 6 : 3));
        hints.length = 0;
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        for (const item of native.values()) {
            if (item.key === watchedSettingsKey) item.listener(item.key, null, { apiKey: 'private-fixture' }, true);
        }
        await vi.waitFor(() => expect(hints).toEqual([null]));
        uninstallUserscriptGmStorageBridge();
        expect(native.size).toBe(0);
    } finally {
        window.removeEventListener(USERSCRIPT_SETTINGS_CHANGED_EVENT, onHint);
    }
});

it('does not forward a queued callback after its bridge is uninstalled', () => {
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    installGmStorageFixture();
    let notify = (): void => undefined;
    const cleanup = vi.fn();
    const onHint = vi.fn();
    window.addEventListener(USERSCRIPT_SETTINGS_CHANGED_EVENT, onHint);
    try {
        installUserscriptGmStorageBridge(callback => { notify = callback; return cleanup; });
        notify();
        expect(onHint).toHaveBeenCalledOnce();
        uninstallUserscriptGmStorageBridge();
        expect(cleanup).toHaveBeenCalledOnce();
        notify();
        expect(onHint).toHaveBeenCalledOnce();
    } finally {
        window.removeEventListener(USERSCRIPT_SETTINGS_CHANGED_EVENT, onHint);
    }
});

it('coalesces page hints, reads real authority instead of event payloads, and stops on cleanup', async () => {
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    const { getValue } = installGmStorageFixture();
    await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
    const receive = vi.fn();
    const stop = subscribeToReaderSettingsChanges(receive);
    try {
        await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
        getValue.mockClear();
        receive.mockClear();
        for (let index = 0; index < 20; index++) {
            window.dispatchEvent(new CustomEvent(USERSCRIPT_SETTINGS_CHANGED_EVENT, {
                detail: { settings: { theme: 'light', apiKey: 'page-forged' } },
            }));
        }
        await vi.waitFor(() => expect(receive).toHaveBeenCalledTimes(2));
        expect(receive.mock.calls.every(([settings]) => settings.theme === 'dark' && settings.apiKey === '')).toBe(true);
        expect(getValue.mock.calls.filter(([key]) => key === SETTINGS_STORAGE_KEY)).toHaveLength(4);
        stop();
        getValue.mockClear();
        window.dispatchEvent(new CustomEvent(USERSCRIPT_SETTINGS_CHANGED_EVENT));
        await Promise.resolve();
        expect(getValue).not.toHaveBeenCalled();
    } finally {
        stop();
    }
});
