import { describe, expect, it } from 'vitest';
import {
    isTrustedSensitiveSettingsSurface,
    sensitiveSettingsLauncherForPanel,
    sensitiveSettingsSurfaceAccess,
} from '../../src/reader/settings/sensitive-settings-surface';
import { settingsPanelFromHash } from '../../src/reader/newtab/url';

describe('sensitive settings surface ownership', () => {
    it.each([
        'https://yomureader.com/study/',
        'https://yomureader.com/newtab/#settings=api',
        'https://hrussellzfac023.github.io/yomu-reader/study/',
        'moz-extension://yomu/newtab/index.html#settings=api',
        'chrome-extension://yomu/newtab/index.html#settings=api',
        'safari-web-extension://yomu/newtab/index.html#settings=api',
        'http://127.0.0.1:5174/study/',
    ])('trusts the owned Study surface %s', (url) => {
        expect(isTrustedSensitiveSettingsSurface(url)).toBe(true);
    });

    it.each([
        'https://www.youtube.com/watch?v=hostile',
        'https://yomureader.com/',
        'https://yomureader.com/video-player/',
        'https://hrussellzfac023.github.io/not-yomu/study/',
        'https://evil.example/study/',
        'http://localhost:3000/study/',
        'http://yomureader.localhost:5174/study/',
        'moz-extension://yomu/options.html',
    ])('rejects the non-owned or non-Study surface %s', (url) => {
        expect(isTrustedSensitiveSettingsSurface(url)).toBe(false);
    });

    it('uses only a validated extension Study URL as the offhost launcher', () => {
        expect(sensitiveSettingsSurfaceAccess(
            'https://www.youtube.com/watch?v=hostile',
            'moz-extension://yomu/newtab/index.html#settings=api',
        )).toEqual({
            trusted: false,
            launcherUrl: 'moz-extension://yomu/newtab/index.html#settings=api',
        });
        expect(sensitiveSettingsSurfaceAccess(
            'https://www.youtube.com/watch?v=hostile',
            'https://attacker.example/phish',
        )).toEqual({
            trusted: false,
            launcherUrl: 'https://yomureader.com/study/#settings=api',
        });
    });

    it('carries an allowed requested panel to the owned Study route', () => {
        expect(sensitiveSettingsLauncherForPanel(
            'https://yomureader.com/study/#settings=api',
            'backup',
        )).toBe('https://yomureader.com/study/#settings=backup');
        expect(sensitiveSettingsLauncherForPanel(
            'moz-extension://yomu/newtab/index.html#settings=api',
            'not-a-panel',
        )).toBe('moz-extension://yomu/newtab/index.html#settings=appearance');
        expect(settingsPanelFromHash('#settings=backup')).toBe('backup');
        expect(settingsPanelFromHash('#settings=not-a-panel')).toBeNull();
    });
});
