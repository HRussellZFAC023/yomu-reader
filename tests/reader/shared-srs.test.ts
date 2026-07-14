import { describe, expect, it } from 'vitest';
import { NEW_TAB_PAGE_URL } from '../../src/reader/app/constants';
import { resolveNewTabBrandAssets } from '../../src/reader/newtab';
import { isYomuNewTabUrl } from '../../src/reader/newtab/url';
import {
    academyStudyAccessMessage,
    canonicalStudyCardKey,
    countdownRemaining,
    createStudyCountdown,
    safeStudyReturnUrl,
} from '../../src/reader/srs/shared';

describe('shared Study / Academy contract', () => {
    it('keeps local Study available when Academy sync is unavailable', () => {
        expect(academyStudyAccessMessage({ accountId: null, enrolled: true, entitlement: 'academy', expiresAt: null, refreshedAt: 1 }))
            .toContain('Study still works');
        expect(academyStudyAccessMessage({ accountId: 'account', enrolled: true, entitlement: 'academy', expiresAt: null, refreshedAt: 1 }))
            .toBeNull();
    });

    it('uses one normalized collection key without serializing it into the return URL', () => {
        expect(canonicalStudyCardKey(' Ａ読む ', ' よむ ')).toBe('A読む\u0000よむ');
        const url = safeStudyReturnUrl('https://yomureader.com', canonicalStudyCardKey('読む', 'よむ'), 'lesson-0');
        expect(url).toBe('https://yomureader.com/study/?return=academy&context=lesson-0');
        expect(decodeURIComponent(url)).not.toMatch(/読む|よむ|answer|card=/u);
        expect(() => canonicalStudyCardKey('   ')).toThrow();
    });

    it('models the Academy activity as a bounded 15-minute countdown', () => {
        const session = createStudyCountdown(10_000);
        expect(session.durationSeconds).toBe(900);
        expect(countdownRemaining(session, 70_000)).toBe(840);
        expect(countdownRemaining(session, 1_000_000)).toBe(0);
        expect(() => createStudyCountdown(10_000, 59)).toThrow();
    });

    it('boots on canonical Study URLs while keeping new-tab compatibility', () => {
        expect(NEW_TAB_PAGE_URL).toBe('https://yomureader.com/study/');
        expect(isYomuNewTabUrl('https://yomureader.com/study/')).toBe(true);
        expect(isYomuNewTabUrl('http://localhost:5174/study/index.html')).toBe(true);
        expect(isYomuNewTabUrl('https://yomureader.com/newtab/')).toBe(true);
        expect(resolveNewTabBrandAssets('https://hrussellzfac023.github.io/yomu-reader/study/')).toEqual({
            homeHref: '/yomu-reader/',
            iconSrc: '/yomu-reader/yomu-icon.svg',
        });
    });
});
