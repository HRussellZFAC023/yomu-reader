import fs from 'node:fs';
import path from 'node:path';
import { adaptAuthoredWeek, AUTHORED_WEEK_HASHES } from '../../src/academy/content/authored-week-adapter';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import {
    adaptLessonStoryEntry,
    createLessonStoryRuntime,
} from '../../src/academy/content/lesson-story-runtime';
import { sha256File } from './helpers/hash-memo';

const LESSON_PATH = path.resolve('public/academy/content/lessons/002-l1-l01.json');
const PLAN_PATH = path.resolve('public/academy/content/curriculum/class-week-cast.v1.json');

describe('l1-l01 narrative, listening, and adaptive entry', () => {
    it('uses only its two exact packaged Soya recordings', () => {
        const bytes = fs.readFileSync(LESSON_PATH);
        const sha256 = sha256File(LESSON_PATH);
        const week = adaptAuthoredWeek(JSON.parse(bytes.toString('utf8')), { path: LESSON_PATH, sha256 });
        const listening = week.activities.filter(activity => activity.sourceQuestionId.includes('/ex-soya-n5_mock1_l_'));

        expect(sha256).toBe(AUTHORED_WEEK_HASHES['l1-l01']);
        expect(week.media).toEqual([]);
        expect(listening).toMatchObject([
            {
                sourceQuestionId: 'l1-l01/ex-soya-n5_mock1_l_19',
                listening: {
                    sourceLocator: 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_19.mp3',
                    url: '/academy/content/listening/media/academy-listening-75194e1fda2886b7.mp3',
                    transcriptReveal: 'after-attempt',
                },
            },
            {
                sourceQuestionId: 'l1-l01/ex-soya-n5_mock1_l_24',
                listening: {
                    sourceLocator: 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_24.mp3',
                    url: '/academy/content/listening/media/academy-listening-52ba9cd972e544ef.mp3',
                    transcriptReveal: 'after-attempt',
                },
            },
        ]);
        expect(listening.every(activity => (
            activity.kind === 'choice' && activity.listening?.transcript.length === 4
        ))).toBe(true);

        expect(digest('public/academy/content/listening/media/academy-listening-75194e1fda2886b7.mp3'))
            .toBe('75194e1fda2886b794a28669948455eb8ab4e45acba4a246221bde5e681cbe15');
        expect(digest('public/academy/content/listening/media/academy-listening-52ba9cd972e544ef.mp3'))
            .toBe('52ba9cd972e544efb6017cbe220dfa04989565c3f1730e4e42fe81193b107455');
    });

    it('adapts from the immediate Lesson 0 handoff without changing plot state', () => {
        const plan = validateClassWeekCastPlan(JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8')));
        const runtime = createLessonStoryRuntime(plan);
        const previous = runtime.continuity('lesson:foundation-00')!;
        const entry = runtime.continuity('l1-l01')!;

        expect(entry.nPlusOne).toMatchObject({
            carries: previous.nPlusOne.introduces,
            introduces: 'answer one name prompt',
            prerequisite: {
                packageId: 'lesson:foundation-00',
                activityId: 'activity:lesson-zero-greet-rie',
            },
        });
        expect(entry).toMatchObject({
            threadId: 'callback:blank-atlas-route',
            callback: { state: 'echo' },
            plotBoundary: { canonicalWrites: false, completesThread: false, replay: 'separate-optional' },
        });

        const guided = adaptLessonStoryEntry(entry, {});
        expect(guided).toMatchObject({
            mode: 'guided-prerequisite',
            setup: entry.nPlusOne.prerequisite?.fallbackSetup,
            callback: entry.callback.fallback,
        });
        const ready = adaptLessonStoryEntry(entry, {
            'activity:lesson-zero-greet-rie': {
                lastOutcome: 'pass',
                attemptCount: 1,
                lapseCount: 0,
            },
        });
        expect(ready).toEqual({
            mode: 'n-plus-one',
            setup: entry.setup,
            callback: entry.callback.meaningNow,
        });
        expect(adaptLessonStoryEntry(entry, {
            'activity:lesson-zero-greet-rie': {
                lastOutcome: 'lapse',
                attemptCount: 2,
                lapseCount: 1,
            },
        }).mode).toBe('n-plus-one');
        expect(adaptLessonStoryEntry(entry, {
            'activity:lesson-zero-greet-rie': {
                lastOutcome: 'lapse',
                attemptCount: 2,
                lapseCount: 2,
            },
        }).mode).toBe('guided-prerequisite');
        expect(entry.plotBoundary.canonicalWrites).toBe(false);
    });
});

function digest(file: string): string {
    return sha256File(file);
}
