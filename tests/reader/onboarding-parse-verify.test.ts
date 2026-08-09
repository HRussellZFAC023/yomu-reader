import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingController } from '../../src/reader/app/onboarding';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { nestedTextParsePlan } from '../../src/reader/lookup/nested-text-parse';
import type { ReaderSettings } from '../../src/reader/app/types';

describe('OnboardingController furigana parse wiring', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('opts the welcome panel into the nested furigana + pitch parse', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, onboardingSeen: false, interfaceLanguage: 'ja' };
        const parseJapanese = vi.fn();
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings: next => { settings = next; },
            showSettings: vi.fn(),
            parseJapanese,
            lookupText: vi.fn(),
        });

        await controller.showIfNeeded();

        const panel = document.querySelector<HTMLElement>('.jpdb-reader-onboarding');
        expect(panel).toBeTruthy();
        expect(panel!.classList.contains('jpdb-reader-parseable')).toBe(true);
        expect(parseJapanese).toHaveBeenCalledWith(panel);

        // The same nested-parse collection used for popovers/settings chrome
        // must reach the welcome panel's Japanese (it is otherwise excluded as a
        // reader root) so it gets furigana + pitch like the rest of the reader.
        const collected = nestedTextParsePlan(panel!, 120)?.targets.map(target => target.text) ?? [];
        expect(collected.some(text => text.includes('日本語がある場所'))).toBe(true);
        expect(collected.some(text => text.includes('タップ可能にします'))).toBe(true);
        expect(collected.some(text => text.includes('学習ページで単語と文字'))).toBe(true);
    });

    it('opens lookup for parsed welcome words without stealing action button clicks', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, onboardingSeen: false, interfaceLanguage: 'ja' };
        const lookupText = vi.fn();
        const showSettings = vi.fn();
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings: next => { settings = next; },
            showSettings,
            parseJapanese: vi.fn(),
            lookupText,
        });

        await controller.showIfNeeded();

        const panel = document.querySelector<HTMLElement>('.jpdb-reader-onboarding')!;
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.dataset.expression = '日本語';
        word.dataset.sentence = '日本語を読みます。';
        word.textContent = '日本語';
        panel.querySelector('.jpdb-reader-onboarding-features > li span')?.append(' ', word);
        word.click();

        expect(lookupText).toHaveBeenCalledWith('日本語', '日本語を読みます。', word);

        const buttonWord = document.createElement('span');
        buttonWord.className = 'jpdb-reader-word';
        buttonWord.dataset.expression = '辞書';
        buttonWord.textContent = '辞書';
        const withoutApi = document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')!;
        withoutApi.append(buttonWord);
        buttonWord.click();
        await settleAsyncHandlers();

        expect(lookupText).toHaveBeenCalledTimes(1);
        expect(showSettings).toHaveBeenCalledWith('dictionaries');
        expect(settings.onboardingSeen).toBe(true);
    });
});

function settleAsyncHandlers(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}
