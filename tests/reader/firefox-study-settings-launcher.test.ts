import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import { openOwnedFirefoxStudySettings } from '../../src/reader/settings/sensitive-settings-surface';

const OWNED_STUDY_URL = 'moz-extension://yomu/newtab/index.html#settings=appearance';

function installFirefoxRuntime(sendMessage: Mock): void {
    vi.stubGlobal('browser', {
        runtime: {
            id: 'yomu@yomureader.com',
            getURL: (path: string) => new URL(path, 'moz-extension://yomu/').href,
            sendMessage,
        },
    });
}

describe('Firefox packaged Study settings launcher', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('routes an ordinary extension content page to packaged Appearance through the compiler background', async () => {
        vi.stubGlobal('location', new URL('https://example.com/article'));
        const sendMessage = vi.fn(async () => ({ ok: true, tabId: 39 }));
        installFirefoxRuntime(sendMessage);

        await expect(openOwnedFirefoxStudySettings(OWNED_STUDY_URL)).resolves.toBe(true);
        expect(sendMessage).toHaveBeenCalledOnce();
        expect(sendMessage).toHaveBeenCalledWith({
            type: 'yomu.openPackagedStudySettings',
            protocol: 'yomu-packaged-study-settings-launcher:v1',
            panel: 'appearance',
        });
    });

    it.each([
        'moz-extension://another-extension/newtab/index.html#settings=appearance',
        'moz-extension://yomu/options.html#settings=appearance',
        'moz-extension://yomu/newtab/index.html?redirect=https://attacker.example/#settings=appearance',
        'moz-extension://yomu/newtab/index.html#settings=not-a-panel',
        'https://yomureader.com/study/#settings=appearance',
    ])('rejects a destination outside the exact runtime-owned Study route: %s', async url => {
        const sendMessage = vi.fn(async () => ({ ok: true, tabId: 39 }));
        installFirefoxRuntime(sendMessage);

        await expect(openOwnedFirefoxStudySettings(url)).resolves.toBe(false);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it.each([
        { response: () => undefined, label: 'a non-promise runtime result' },
        { response: () => Promise.resolve({}), label: 'a response without an explicit success result' },
        { response: () => Promise.resolve({ ok: true, tabId: '39' }), label: 'a non-numeric tab id' },
        { response: () => Promise.resolve({ ok: false, error: 'tab creation denied' }), label: 'a background error response' },
        { response: () => Promise.reject(new Error('tab creation denied')), label: 'a rejected background request' },
    ])('does not report success for $label', async ({ response }) => {
        const windowOpen = vi.spyOn(window, 'open');
        installFirefoxRuntime(vi.fn(response));

        await expect(openOwnedFirefoxStudySettings(OWNED_STUDY_URL)).resolves.toBe(false);
        expect(windowOpen).not.toHaveBeenCalled();
    });

    it('fails closed when the Firefox extension runtime transport is unavailable', async () => {
        const windowOpen = vi.spyOn(window, 'open');

        await expect(openOwnedFirefoxStudySettings(OWNED_STUDY_URL)).resolves.toBe(false);
        expect(windowOpen).not.toHaveBeenCalled();
    });
});
