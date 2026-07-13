import { describe, expect, it } from 'vitest';
import {
    classIdentity,
    parseAcademyAccountView,
    parseAcademyClassBoardView,
} from '../../src/reader/srs/account-contract';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

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
});
