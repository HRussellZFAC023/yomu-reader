import fs from 'node:fs';
import path from 'node:path';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import { createLessonStoryRuntime, lessonStoryEncounter } from '../../src/academy/content/lesson-story-runtime';
import { STORY_REPLAY_SCENES } from '../../src/academy/content/story-replay-catalog';

const PLAN_PATH = path.resolve('public/academy/content/curriculum/class-week-cast.v1.json');
const PACKAGE_IDS = [
    'lesson:foundation-00',
    ...Array.from({ length: 22 }, (_, index) => `l1-l${String(index + 1).padStart(2, '0')}`),
];

const LESSON_27_31 = [
    ['l2-l02', 'l2plus-l01', 'alex', 'jodi', 'station'],
    ['l2-l03', 'l2plus-l02', 'jodi', 'alex', 'home'],
    ['l2-l04', 'l2plus-l03', 'tom', 'francis', 'classroom'],
    ['l2-l05', 'l2plus-l04', 'alex', 'tom', 'station'],
    ['l2-l06', 'l2plus-l05', 'shin', 'sophie', 'library'],
] as const;

describe('Lesson 0-35 story continuity', () => {
    it('covers every lesson in order with grounded rosters, locations, and one-step handoffs', () => {
        const plan = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8')));
        const runtime = createLessonStoryRuntime(plan);

        expect(runtime.entries.slice(0, PACKAGE_IDS.length).map(entry => entry.packageId)).toEqual(PACKAGE_IDS);
        expect(runtime.entries[0]).toMatchObject({
            classWeekId: 'orientation',
            hostId: 'xingyu',
            supportingIds: ['mika', 'sophie', 'ruparna', 'aakash', 'sam'],
        });
        for (const entry of runtime.entries.slice(1)) {
            const week = plan.weeks.find(candidate => candidate.weekId === entry.classWeekId)!;
            expect([entry.hostId, ...entry.supportingIds]).toEqual([
                week.primary?.id,
                ...week.supporting.map(member => member.id),
            ]);
            expect(entry.location.id).not.toBe('');
            expect(entry.handoff.en).not.toBe('');
            expect(entry.handoff.ja).not.toBe('');
            expect(entry.nPlusOne.carries).not.toBe(entry.nPlusOne.introduces);
        }
        expect(runtime.entries.every(entry => entry.presentation === 'name-only')).toBe(true);
    });

    it('keeps its local callbacks bounded and makes the consent-aware final transition explicit', () => {
        const plan = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8')));
        const runtime = createLessonStoryRuntime(plan);

        expect(runtime.entries.filter(entry => entry.threadId === 'callback:blank-atlas-route').map(entry => entry.callback.state))
            .toEqual(['seed', 'echo', 'echo', 'echo', 'transform', 'echo', 'payoff']);
        expect(runtime.entries.filter(entry => entry.threadId === 'callback:shared-plan').map(entry => entry.callback.state))
            .toEqual(['seed', 'echo', 'transform', 'payoff']);
        expect(runtime.entries.filter(entry => entry.threadId === 'callback:l1plus-open-list').map(entry => entry.callback.state))
            .toEqual(['seed', 'echo', 'payoff']);
        expect(runtime.continuity('l1-l19')?.plotBoundary).toEqual({
            canonicalWrites: false,
            completesThread: true,
            replay: 'separate-optional',
        });
        expect(runtime.continuity('l1-l20')).toMatchObject({
            threadId: 'callback:l1plus-frequency-lens',
            callback: { state: 'seed' },
            plotBoundary: { completesThread: false },
        });
        expect(runtime.continuity('l1-l15')?.setup.en).toMatch(/yes, no, or later/i);
        expect(runtime.continuity('l1-l20')?.handoff.en).toMatch(/not on an off-screen gathering/i);
        expect(runtime.entries.filter(entry => entry.threadId === 'callback:l2-plain-style-matrix').map(entry => entry.callback.state))
            .toEqual(['seed', 'payoff']);
    });

    it('gives Lessons 27-31 fitting world origins, coherent cast dialogue, and package-addressable Journal state', () => {
        const plan = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8')));
        const runtime = createLessonStoryRuntime(plan);
        const entries = LESSON_27_31.map(([packageId]) => runtime.continuity(packageId)!);

        expect(entries.map(entry => [
            entry.packageId,
            entry.classWeekId,
            entry.hostId,
            entry.supportingIds[0],
            entry.world?.originPlaceId,
        ])).toEqual(LESSON_27_31);
        entries.forEach((entry, index) => {
            expect(entry.world?.completionReturn).toBe('originating-route-frame');
            expect(entry.dialogue?.map(turn => turn.purpose)).toEqual(['need', 'model', 'transfer']);
            expect(new Set(entry.dialogue?.map(turn => turn.speakerId))).toEqual(new Set([
                entry.hostId,
                ...entry.supportingIds,
            ]));
            expect(entry.dialogue?.every(turn => turn.line.en && turn.line.ja)).toBe(true);
            expect(entry.journal).toEqual({
                encounterId: `class-week:${entry.packageId}`,
                sceneId: `scene:class-week:${entry.classWeekId}`,
                replayLessonId: entry.packageId,
                stateWrite: 'met-characters-and-journal',
            });
            expect(lessonStoryEncounter(entry)).toEqual({
                encounterId: `class-week:${entry.packageId}`,
                sceneId: `scene:class-week:${entry.classWeekId}`,
                attendeeIds: [entry.hostId, ...entry.supportingIds],
            });
            expect(entry.plotBoundary).toMatchObject({ canonicalWrites: false, replay: 'separate-optional' });
            if (index > 0) expect(entry.nPlusOne.carries).toBe(entries[index - 1]?.nPlusOne.introduces);
        });
    });

    it('does not promote the local layer into the canonical or replay catalogs', () => {
        const packageIds = new Set([
            'l1-l17', 'l1-l18', 'l1-l19', 'l1-l20',
            ...LESSON_27_31.map(([packageId]) => packageId),
            'l2-l07', 'l2-l08', 'l2-l09', 'l2-l10',
        ]);
        expect(STORY_REPLAY_SCENES.some(scene => scene.lessonId && packageIds.has(scene.lessonId))).toBe(false);
    });
});
