import fs from 'node:fs';
import path from 'node:path';
import { validateLessonZeroGrounding } from '../../src/academy/content/lesson-zero-grounding';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { createLessonOverviewModel } from '../../src/academy/domain/lesson-overview';

function lessonZero() {
    const value = JSON.parse(fs.readFileSync(path.resolve('public/academy/content/lessons/lesson-zero.v1.json'), 'utf8'));
    return { package: validateLessonZeroPackage(value), grounding: validateLessonZeroGrounding(value) };
}

const empty = () => new Set<string>();

describe('lesson overview model', () => {
    it('keeps all nine Lesson 0 sections together while exposing only real runtime bindings', () => {
        const { package: data, grounding } = lessonZero();
        const bound = new Set(['activity:lesson-zero-reconstruct-repair']);
        const model = createLessonOverviewModel(data.lesson, grounding, {
            boundActivityIds: bound,
            attemptedActivityIds: empty(),
            completedActivityIds: empty(),
            needsReviewActivityIds: empty(),
        });

        expect(model.sections).toHaveLength(9);
        expect(model.presentation).toMatchObject({
            title: { en: 'Lesson 0', ja: 'レッスン0' },
            peopleIds: ['rie', 'xingyu', 'mika', 'sophie', 'ruparna', 'aakash', 'sam'],
        });
        expect(model.presentation.goals).toHaveLength(5);
        expect(model.presentation.materials.filter(material => material.state === 'ready')).toHaveLength(3);
        expect(model.releaseStatus).toBe('review-blocked');
        expect(model.blockerIds).toContain('blocker:lesson-runtime-bindings');
        expect(model.sections.find(section => section.id === 'classroom-survival')).toMatchObject({
            runtimeStatus: 'partial',
            nextActivityId: 'activity:lesson-zero-reconstruct-repair',
        });
        expect(model.sections.find(section => section.id === 'sound-script-map')?.runtimeStatus).toBe('not-bound');
        expect(model.resumeActivityId).toBe('activity:lesson-zero-reconstruct-repair');
    });

    it('derives section progress from attempts, repairs and complete evidence', () => {
        const { package: data, grounding } = lessonZero();
        const first = 'activity:lesson-zero-greet-rie';
        const repair = 'activity:lesson-zero-reconstruct-repair';
        const model = createLessonOverviewModel(data.lesson, grounding, {
            boundActivityIds: new Set([first, repair]),
            attemptedActivityIds: new Set([first, repair]),
            completedActivityIds: new Set([first]),
            needsReviewActivityIds: new Set([repair]),
        });

        expect(model.sections[0]?.learningStatus).toBe('complete');
        expect(model.sections.find(section => section.id === 'classroom-survival')?.learningStatus).toBe('needs-review');
        expect(model.progress).toEqual({ completedSections: 1, totalSections: 9 });
        expect(model.currentSectionId).toBe('classroom-survival');
    });

    it('rejects state or grounding that does not cover the authored lesson exactly', () => {
        const { package: data, grounding } = lessonZero();
        expect(() => createLessonOverviewModel(data.lesson, grounding, {
            boundActivityIds: new Set(['activity:not-authored']),
            attemptedActivityIds: empty(),
            completedActivityIds: empty(),
            needsReviewActivityIds: empty(),
        })).toThrow(/unknown activity/i);
        expect(() => createLessonOverviewModel({ ...data.lesson, id: 'lesson:other' }, grounding, {
            boundActivityIds: empty(),
            attemptedActivityIds: empty(),
            completedActivityIds: empty(),
            needsReviewActivityIds: empty(),
        })).toThrow(/another lesson/i);
    });

    it('refuses completion without attempt evidence', () => {
        const { package: data, grounding } = lessonZero();
        const activityId = 'activity:lesson-zero-greet-rie';
        expect(() => createLessonOverviewModel(data.lesson, grounding, {
            boundActivityIds: new Set([activityId]),
            attemptedActivityIds: empty(),
            completedActivityIds: new Set([activityId]),
            needsReviewActivityIds: empty(),
        })).toThrow(/no attempt evidence/i);
    });
});
