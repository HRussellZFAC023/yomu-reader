import { expect } from 'vitest';

import { beginSettingsResetGuard } from '../../../src/reader/settings';

interface CompletableOnboarding {
    complete(openSettings: boolean | 'dictionaries'): Promise<void>;
}

/**
 * Drives the real target picker through a persistence rejection. The caller
 * owns dismissal and the reset-guard lifetime so it can assert the surrounding
 * Reader or Study startup remains blocked before simulating a reload.
 */
export async function rejectOnboardingTargetPersistence(
    onboarding: CompletableOnboarding,
    targetLanguage = 'es',
): Promise<void> {
    const target = document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
    target.value = targetLanguage;
    target.dispatchEvent(new Event('change', { bubbles: true }));
    beginSettingsResetGuard();
    await expect(onboarding.complete('dictionaries')).rejects.toThrow();
}
