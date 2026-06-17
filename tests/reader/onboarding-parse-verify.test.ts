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
        expect(collected.some(text => text.includes('内蔵の学習ページ'))).toBe(true);
    });
});
