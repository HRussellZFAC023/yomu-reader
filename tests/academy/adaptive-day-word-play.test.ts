import { recommendActivities } from '../../src/academy/domain/adaptive-recommendations';
import { closeAcademyDay, completeDayActivity, type AcademyDayPlan } from '../../src/academy/domain/day-plan';
import { createLearnerRecord } from '../../src/academy/domain/learner-record';
import { playShiritoriTurn } from '../../src/academy/domain/word-play';

describe('adaptive recommendations and optional day closure', () => {
    it('uses opening audio as a prior, then lets later weak-skill evidence outweigh it', async () => {
        const candidates = [
            { id: 'listen', modeId: 'listening' as const, skill: 'listening' as const, format: 'video' as const, due: false, mainLesson: false },
            { id: 'read', modeId: 'normal-challenge' as const, skill: 'reading' as const, format: 'reading' as const, due: false, mainLesson: false },
        ];
        expect(recommendActivities(candidates, [], 'audio')[0]?.id).toBe('listen');
        const record = createLearnerRecord();
        await record.recordMany(Array.from({ length: 4 }, (_, index) => ({
            kind: 'learning-evidence-recorded' as const,
            eventId: `read-lapse:${index}`,
            activityId: `read:${index}`,
            modeId: 'normal-challenge',
            skill: 'reading' as const,
            action: 'read' as const,
            outcome: 'lapse' as const,
            conceptIds: ['reading:weak'],
            independent: true,
        })));
        expect(recommendActivities(candidates, await record.history(), 'audio')[0]?.id).toBe('read');
    });

    it('lets the learner close after the main lesson and unlocks extras only when completed', () => {
        const plan: AcademyDayPlan = {
            id: 'day:1',
            mainLessonId: 'lesson',
            optionalActivityIds: ['listen', 'write'],
            specialEvents: [{ assetId: 'scene:rainy-radio', requiresActivityIds: ['listen'] }],
        };
        let state = { completedActivityIds: [] as readonly string[], mainLessonCompleted: false };
        expect(() => closeAcademyDay(plan, state, 1)).toThrow('main lesson');
        state = completeDayActivity(plan, state, 'lesson');
        const mainOnly = closeAcademyDay(plan, state, 1_000);
        expect(mainOnly.events).toHaveLength(1);
        expect(mainOnly.optionalActivityIds).toEqual(['listen', 'write']);
        state = completeDayActivity(plan, state, 'listen');
        const withOptional = closeAcademyDay(plan, state, 2_000);
        expect(withOptional.events[0]).not.toMatchObject({ eventId: mainOnly.events[0]?.eventId });
        expect(withOptional.events).toContainEqual(expect.objectContaining({
            kind: 'asset-unlocked', assetId: 'scene:rainy-radio',
        }));
    });
});

describe('shiritori engine', () => {
    it('teaches the chain rule through precise rejection and valid production evidence', () => {
        const state = { usedReadings: ['すし'], requiredKana: ['し'] };
        expect(playShiritoriTurn(state, { expression: '新聞', reading: 'しんぶん', noun: true, conceptIds: ['word:newspaper'] }, 1)).toMatchObject({
            accepted: false, reason: 'ends-with-n',
        });
        const accepted = playShiritoriTurn(state, { expression: '鹿', reading: 'シカ', noun: true, conceptIds: ['word:deer'] }, 2);
        expect(accepted).toMatchObject({
            accepted: true,
            state: { requiredKana: ['か'] },
            evidence: { action: 'produce', outcome: 'pass', modeId: 'shiritori' },
        });
        const smallKana = playShiritoriTurn({ usedReadings: [], requiredKana: [] }, {
            expression: 'ソファ', reading: 'ソファ', noun: true, conceptIds: ['word:sofa'],
        }, 3);
        expect(smallKana).toMatchObject({ accepted: true, state: { requiredKana: ['あ', 'ふ'] } });
        const lax = playShiritoriTurn({
            usedReadings: [],
            requiredKana: [],
            rules: { laxDakuten: true, laxLongVowels: true, smallLetters: true },
        }, { expression: '財布', reading: 'さいふ', noun: true, conceptIds: ['word:wallet'] }, 4);
        expect(lax).toMatchObject({ accepted: true });
        if (lax.accepted) expect(lax.state.requiredKana).toEqual(['ふ', 'ぶ', 'ぷ']);
    });
});
