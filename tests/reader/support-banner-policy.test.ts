import { beforeEach, describe, expect, it } from 'vitest';
import {
    SUPPORT_BANNER_DISMISS_MS,
    SUPPORT_BANNER_FIRST_QUIET_VISITS,
    SUPPORT_BANNER_IMPRESSION_COOLDOWN_MS,
    SUPPORT_BANNER_VISIT_INTERVAL,
    rememberSupportBannerDismissal,
    resetSupportBannerPolicyMemoryForTests,
    shouldShowSupportBannerImpression,
} from '../../src/reader/app/support-banner-policy';

const STORAGE_KEY = 'yomu-test-support-banner';
const VERSION = 'support-v1';
const START = 1_800_000_000_000;

function nextVisit(now = START): boolean {
    resetSupportBannerPolicyMemoryForTests();
    return shouldShowSupportBannerImpression({
        storageKey: STORAGE_KEY,
        version: VERSION,
        now,
    });
}

describe('support banner policy', () => {
    beforeEach(() => {
        localStorage.clear();
        resetSupportBannerPolicyMemoryForTests();
    });

    it('keeps the first eligible visits quiet before showing a banner', () => {
        for (let index = 0; index < SUPPORT_BANNER_FIRST_QUIET_VISITS; index += 1) {
            expect(nextVisit()).toBe(false);
        }

        expect(nextVisit()).toBe(true);
    });

    it('reuses a page-load decision and then waits for visit and time cadence', () => {
        for (let index = 0; index < SUPPORT_BANNER_FIRST_QUIET_VISITS; index += 1) nextVisit();

        resetSupportBannerPolicyMemoryForTests();
        expect(shouldShowSupportBannerImpression({ storageKey: STORAGE_KEY, version: VERSION, now: START })).toBe(true);
        expect(shouldShowSupportBannerImpression({ storageKey: STORAGE_KEY, version: VERSION, now: START })).toBe(true);

        for (let index = 1; index < SUPPORT_BANNER_VISIT_INTERVAL; index += 1) {
            expect(nextVisit(START + SUPPORT_BANNER_IMPRESSION_COOLDOWN_MS + 1)).toBe(false);
        }

        expect(nextVisit(START + SUPPORT_BANNER_IMPRESSION_COOLDOWN_MS - 1)).toBe(false);
        expect(nextVisit(START + SUPPORT_BANNER_IMPRESSION_COOLDOWN_MS + 1)).toBe(true);
    });

    it('keeps a dismissed banner hidden for a longer cooling-off period', () => {
        for (let index = 0; index < SUPPORT_BANNER_FIRST_QUIET_VISITS; index += 1) nextVisit();
        expect(nextVisit(START)).toBe(true);

        rememberSupportBannerDismissal({
            storageKey: STORAGE_KEY,
            version: VERSION,
            now: START,
        });

        for (let index = 1; index < SUPPORT_BANNER_VISIT_INTERVAL; index += 1) {
            expect(nextVisit(START + SUPPORT_BANNER_DISMISS_MS + 1)).toBe(false);
        }

        expect(nextVisit(START + SUPPORT_BANNER_DISMISS_MS - 1)).toBe(false);
        expect(nextVisit(START + SUPPORT_BANNER_DISMISS_MS + 1)).toBe(true);
    });

    it('does not show when storage is unavailable because cadence cannot be persisted', () => {
        expect(shouldShowSupportBannerImpression({
            storage: null,
            storageKey: STORAGE_KEY,
            version: VERSION,
            now: START,
        })).toBe(false);
    });
});
