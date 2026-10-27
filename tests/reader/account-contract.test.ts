import { describe, expect, it } from 'vitest';
import {
    classIdentity,
    parseAcademyAccountView,
    parseAcademyClassBoardView,
    parseAcademyEntitlementView,
    parseAcademyPairingClaim,
    parseAcademyPairingTicket,
    parseAcademyProfileView,
    parseAcademySyncPage,
} from '../../src/reader/srs/account-contract';
import { afterEach, vi } from "vitest";
import { installOwnedStudyLauncher, isTrustedAccountDataSurface } from "../../src/reader/app/account-data-surface";
import { allowSyntheticReaderInteractionsForTests } from "../../src/reader/ui/trusted-interaction";

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

function encodedBytes(length: number, value: number): string {
    return btoa(String.fromCharCode(...new Uint8Array(length).fill(value)))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
}

describe('Reader account and Class Board client contract', () => {
    it('uses only the learner-chosen identity', () => {
        expect(classIdentity(' Aakash  ', '419213')).toEqual({
            displayName: 'Aakash',
            discriminator: '419213',
            label: 'Aakash#419213',
        });
        expect(() => classIdentity('Aakash#Google', '419213')).toThrow();
    });

    it('drops Google profile fields from the account response projection', () => {
        const account = parseAcademyAccountView({
            accountId: ACCOUNT_ID,
            displayName: 'Aakash',
            displayTag: 'Aakash#419213',
            nameChosen: true,
            avatarKey: 'quality-2',
            boardVisible: true,
            shareAvatar: false,
            academyAccess: true,
            classes: [{ classId: 'ucl-2026', name: 'UCL Japanese 2026', role: 'learner', boardHidden: false }],
            email: 'private@example.invalid',
            googleName: 'Private Google Name',
            googlePhoto: 'https://example.invalid/private',
        });
        expect(account.identity.label).toBe('Aakash#419213');
        expect(JSON.stringify(account)).not.toMatch(/email|google|private/iu);
    });

    it('projects only aggregate Class Board data', () => {
        const board = parseAcademyClassBoardView({
            classId: 'ucl-2026',
            members: [{
                accountId: ACCOUNT_ID,
                displayTag: 'Karen#123456',
                role: 'learner',
                currentStreak: 3,
                longestStreak: 8,
                knownWordCount: 420,
                reviews: { completed: 31, due: 6 },
                lessons: { completed: 8, total: 12 },
                words: ['秘密'],
                answers: ['private'],
                failures: ['private'],
                events: [{ raw: true }],
            }],
        });
        expect(board.members[0]).toMatchObject({ displayTag: 'Karen#123456', knownWordCount: 420 });
        expect(JSON.stringify(board)).not.toMatch(/words|answers|failures|events|秘密|private/iu);
    });

    it('projects only opaque profile, pairing, and encrypted sync fields', () => {
        expect(parseAcademyProfileView({
            profileId: ACCOUNT_ID,
            deviceId: '22222222-2222-4222-8222-222222222222',
            accountId: null,
            keyVersion: 1,
            createdAt: 100,
            inviteCode: 'CLASS-TEST-2026',
        })).toEqual({
            profileId: ACCOUNT_ID,
            deviceId: '22222222-2222-4222-8222-222222222222',
            accountId: null,
            keyVersion: 1,
            createdAt: 100,
        });

        const claim = parseAcademyPairingClaim({
            pairingId: '33333333-3333-4333-8333-333333333333',
            profileId: ACCOUNT_ID,
            deviceId: '22222222-2222-4222-8222-222222222222',
            keyEnvelope: {
                keyVersion: 1,
                salt: encodedBytes(16, 1),
                nonce: encodedBytes(12, 2),
                ciphertext: encodedBytes(48, 3),
            },
            codeHash: 'private',
        });
        expect(JSON.stringify(claim)).not.toContain('codeHash');
        expect(parseAcademyPairingTicket({
            pairingId: '33333333-3333-4333-8333-333333333333',
            code: '0234-5678-ABCD-EFGH-JKMN',
            expiresAt: 200,
        }).code).toBe('0234-5678-ABCD-EFGH-JKMN');

        const page = parseAcademySyncPage({
            events: [{
                cursor: 1,
                id: '44444444-4444-4444-8444-444444444444',
                occurredAt: 100,
                keyVersion: 1,
                nonce: encodedBytes(12, 4),
                ciphertext: encodedBytes(32, 5),
                sourceDeviceId: null,
                receivedAt: 101,
                providerToken: 'plaintext-secret',
            }],
            nextCursor: 1,
            hasMore: false,
        });
        expect(JSON.stringify(page)).not.toMatch(/providerToken|plaintext-secret/u);
        expect(() => parseAcademyPairingClaim({
            pairingId: '33333333-3333-4333-8333-333333333333',
            profileId: ACCOUNT_ID,
            deviceId: '22222222-2222-4222-8222-222222222222',
            keyEnvelope: { keyVersion: 1, salt: 'AQ', nonce: 'Ag', ciphertext: 'Aw' },
        })).toThrow(/byte length/u);
    });

    it('projects the account-bound entitlement without payment identifiers', () => {
        expect(parseAcademyEntitlementView({
            entitlement: 'academy',
            status: 'active',
            redeemedAt: 123,
            checkoutSessionId: 'cs_private',
            claimHash: 'private',
        })).toEqual({ entitlement: 'academy', status: 'active', redeemedAt: 123 });
        expect(parseAcademyEntitlementView({ entitlement: 'none', purchaseId: 'private' }))
            .toEqual({ entitlement: 'none' });
    });
});

describe('account-data surface ownership', () => {
    afterEach(() => {
        allowSyntheticReaderInteractionsForTests(true);
        vi.restoreAllMocks();
    });


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
