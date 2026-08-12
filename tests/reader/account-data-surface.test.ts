import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    installOwnedStudyLauncher,
    isTrustedAccountDataSurface,
} from '../../src/reader/app/account-data-surface';
import { allowSyntheticReaderInteractionsForTests } from '../../src/reader/ui/trusted-interaction';

afterEach(() => {
    allowSyntheticReaderInteractionsForTests(true);
    vi.restoreAllMocks();
});

describe('account-data surface ownership', () => {
    it.each([
        'https://yomureader.com/study/',
        'https://yomureader.com/newtab/',
        'https://hrussellzfac023.github.io/yomu-reader/study/',
        'moz-extension://yomu/newtab/index.html',
        'chrome-extension://yomu/newtab/index.html',
        'safari-web-extension://yomu/newtab/index.html',
        'http://127.0.0.1:5174/study/',
    ])('trusts the exact owned Study surface %s', url => {
        expect(isTrustedAccountDataSurface(url)).toBe(true);
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
    ])('rejects the offhost or non-Study surface %s', url => {
        expect(isTrustedAccountDataSurface(url)).toBe(false);
    });

    it('opens only the closure-captured owned URL after a direct trusted interaction', () => {
        const ownerDocument = document.implementation.createHTMLDocument('hostile');
        const launcher = ownerDocument.createElement('button');
        launcher.dataset.yomuOwnedStudyLauncher = 'true';
        ownerDocument.body.append(launcher);
        installOwnedStudyLauncher(ownerDocument);
        const open = vi.spyOn(window, 'open').mockReturnValue(null);

        expect(launcher.hasAttribute('href')).toBe(false);
        expect(Object.values(launcher.dataset)).not.toContain('https://yomureader.com/study/');

        allowSyntheticReaderInteractionsForTests(false);
        launcher.click();
        expect(open).not.toHaveBeenCalled();

        // Hostile DOM mutation cannot retarget the closure-held destination.
        launcher.setAttribute('href', 'https://evil.example/phish');
        launcher.dataset.url = 'https://evil.example/phish';
        allowSyntheticReaderInteractionsForTests(true);
        launcher.click();
        expect(open).toHaveBeenCalledOnce();
        expect(open).toHaveBeenCalledWith('https://yomureader.com/study/', '_blank', 'noopener,noreferrer');
    });
});
