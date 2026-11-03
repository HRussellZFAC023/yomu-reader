import { afterEach, expect, it, vi } from 'vitest';
import { USERSCRIPT_SETTINGS_CHANGED_EVENT } from '../../src/reader/app/constants';
import { getUserscriptGmStorage, installUserscriptGmStorageBridgeWhenReady,
    uninstallUserscriptGmStorageBridge } from '../../src/reader/userscript/storage-bridge';
import { HOSTED_STUDY_LOCATION, installGmStorageFixture } from './helpers/settings-persistence-fixture';

afterEach(() => {
    uninstallUserscriptGmStorageBridge();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it.each(['timer', 'DOMContentLoaded'])('installs late GM APIs on %s and retains one settings subscription', async trigger => {
    vi.useFakeTimers();
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    vi.stubGlobal('GM', undefined);
    for (const api of ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues']) vi.stubGlobal(api, undefined);
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    let notify = (): void => undefined;
    const cleanup = vi.fn();
    const subscribe = vi.fn((callback: () => void) => { notify = callback; return cleanup; });
    const receive = vi.fn();
    window.addEventListener(USERSCRIPT_SETTINGS_CHANGED_EVENT, receive);
    try {
        installUserscriptGmStorageBridgeWhenReady(subscribe);
        await vi.advanceTimersByTimeAsync(0);
        expect(getUserscriptGmStorage()).toBeUndefined();
        installGmStorageFixture(new Map([['yomu:enable-logs', true]]));
        if (trigger === 'timer') await vi.advanceTimersByTimeAsync(250);
        else document.dispatchEvent(new Event('DOMContentLoaded'));
        const storage = getUserscriptGmStorage()!;
        await expect(storage.getValue('yomu:enable-logs', false)).resolves.toBe(true);
        notify();
        expect(receive).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(250);
        expect(subscribe).toHaveBeenCalledOnce();
        uninstallUserscriptGmStorageBridge();
        expect(cleanup).toHaveBeenCalledOnce();
        notify();
        expect(receive).toHaveBeenCalledOnce();
    } finally {
        window.removeEventListener(USERSCRIPT_SETTINGS_CHANGED_EVENT, receive);
    }
});
