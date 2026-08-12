import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnboardingController } from '../../src/reader/app/onboarding';
import type { InterfaceLanguage, ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import {
    allowSyntheticReaderInteractionsForTests,
    dispatchAuthorizedReaderControlClick,
    installTrustedReaderRootBoundary,
} from '../../src/reader/ui/trusted-interaction';

function onboardingHarness(language: InterfaceLanguage = 'en') {
    const settings: ReaderSettings = {
        ...DEFAULT_SETTINGS,
        interfaceLanguage: language,
        onboardingSeen: false,
        learningTargetChosen: false,
    };
    const callbacks = {
        setSettings: vi.fn(),
        showSettings: vi.fn(),
        parseJapanese: vi.fn(),
        lookupText: vi.fn(),
        installOfflineDictionaries: vi.fn(),
        onComplete: vi.fn(),
        onPersistenceFailed: vi.fn(),
    };
    return {
        callbacks,
        controller: new OnboardingController({
            getSettings: () => settings,
            ...callbacks,
        }),
    };
}

describe('offhost onboarding surface ownership', () => {
    afterEach(() => {
        allowSyntheticReaderInteractionsForTests(true);
        document.body.replaceChildren();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('keeps hostile light-DOM mutations away from settings and opens only the privately captured Study URL', async () => {
        vi.stubGlobal('location', new URL('https://attacker.example/article'));
        const openInTab = vi.fn(() => ({}));
        vi.stubGlobal('GM_openInTab', openInTab);
        const { callbacks, controller } = onboardingHarness();

        await expect(controller.showIfNeeded()).resolves.toBe(true);
        const panel = document.querySelector<HTMLElement>('.jpdb-reader-onboarding-trusted-launcher')!;
        const launch = panel.querySelector<HTMLButtonElement>('[data-onboarding-action="open-trusted-setup"]')!;
        expect(panel).not.toBeNull();
        expect(panel.querySelector('form, input, select, textarea')).toBeNull();
        expect(launch.tagName).toBe('BUTTON');
        expect(launch.hasAttribute('href')).toBe(false);
        expect(Object.values(launch.dataset)).not.toContain('https://yomureader.com/study/#settings=api');

        // The host owns this DOM: model it rewriting every obvious destination
        // and injecting attacker-selected settings before the learner clicks.
        launch.setAttribute('href', 'https://attacker.example/phish');
        launch.dataset.launcherUrl = 'https://attacker.example/phish';
        const forgedTarget = document.createElement('input');
        forgedTarget.name = 'targetLanguage';
        forgedTarget.value = 'ja';
        panel.append(forgedTarget);

        allowSyntheticReaderInteractionsForTests(false);
        launch.click();
        expect(openInTab).not.toHaveBeenCalled();

        const boundary = new AbortController();
        installTrustedReaderRootBoundary(document, boundary.signal);
        dispatchAuthorizedReaderControlClick(launch);
        boundary.abort();

        expect(openInTab).toHaveBeenCalledOnce();
        expect(openInTab).toHaveBeenCalledWith(
            'https://yomureader.com/study/#settings=api',
            { active: true, insert: true, setParent: false },
        );
        await controller.waitForCompletion();
        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(callbacks.setSettings).not.toHaveBeenCalled();
        expect(callbacks.showSettings).not.toHaveBeenCalled();
        expect(callbacks.parseJapanese).not.toHaveBeenCalled();
        expect(callbacks.lookupText).not.toHaveBeenCalled();
        expect(callbacks.installOfflineDictionaries).not.toHaveBeenCalled();
        expect(callbacks.onComplete).not.toHaveBeenCalled();
        expect(callbacks.onPersistenceFailed).not.toHaveBeenCalled();
    });

    it.each([
        { language: 'en' as const, eyebrow: 'Finish setup in Study', action: 'Continue setup in Study' },
        { language: 'ja' as const, eyebrow: 'Studyで初期設定を完了', action: 'Studyで初期設定を続ける' },
    ])('renders reviewed $language launcher copy without exposing chooser controls', async ({ language, eyebrow, action }) => {
        vi.stubGlobal('location', new URL('https://example.com/fresh'));
        const { controller } = onboardingHarness(language);

        await controller.showIfNeeded();

        expect(document.querySelector('.jpdb-reader-onboarding-eyebrow')?.textContent).toBe(eyebrow);
        expect(document.querySelector('[data-onboarding-action="open-trusted-setup"]')?.textContent).toBe(action);
        expect(document.querySelector('form, input, select, textarea')).toBeNull();
    });

    it.each([
        'https://yomureader.com/study/',
        'https://hrussellzfac023.github.io/yomu-reader/newtab/',
        'moz-extension://yomu/newtab/index.html',
        'chrome-extension://yomu/newtab/index.html',
        'safari-web-extension://yomu/newtab/index.html',
        'http://127.0.0.1:5174/study/',
    ])('keeps the full chooser on the owned surface %s', async pageUrl => {
        vi.stubGlobal('location', new URL(pageUrl));
        const { controller } = onboardingHarness();

        await controller.showIfNeeded();

        expect(document.querySelector('.jpdb-reader-onboarding-trusted-launcher')).toBeNull();
        expect(document.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')).not.toBeNull();
        expect(document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')).not.toBeNull();
        expect(document.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')).not.toBeNull();
        expect(document.querySelector<HTMLInputElement>('input[name="ocrInteractionMode"]')).not.toBeNull();
    });
});
