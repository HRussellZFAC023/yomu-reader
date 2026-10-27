import fs from 'node:fs';
import path from 'node:path';
import { validateLessonZeroGrounding } from '../../src/academy/content/lesson-zero-grounding';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { createLessonOverviewModel, type LessonOverviewModel } from '../../src/academy/domain/lesson-overview';
import { renderLessonOverviewScreen } from '../../src/academy/ui/lesson-overview-screen';

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
        expect(model.presentation.goals).toHaveLength(6);
        expect(model.presentation.materials.filter(material => material.state === 'ready')).toHaveLength(4);
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

describe('lesson-overview-screen behavior', () => {
    function overview(boundActivityIds = new Set<string>()): LessonOverviewModel {
        const value = JSON.parse(fs.readFileSync(path.resolve('public/academy/content/lessons/lesson-zero.v1.json'), 'utf8'));
        const data = validateLessonZeroPackage(value);
        return createLessonOverviewModel(data.lesson, validateLessonZeroGrounding(value), {
            boundActivityIds,
            attemptedActivityIds: new Set(),
            completedActivityIds: new Set(),
            needsReviewActivityIds: new Set(),
        });
    }
    
    describe('lesson overview screen', () => {
    
        it('uses only approved likeness art for the complete lesson roster', () => {
            const screen = renderLessonOverviewScreen({
                language: 'en',
                model: overview(),
                onBack: vi.fn(),
                onOpenActivity: vi.fn(),
            });
    
            expect(screen.querySelector('[data-cast-id="rie"] img')?.getAttribute('src'))
                .toBe('/academy/art/characters/rie/rie__neutral-glasses__front-near-front__halfbody__v001.webp');
            expect(screen.querySelector('[data-cast-id="rie"] picture.academy-sprite')).not.toBeNull();
            expect(screen.querySelector('[data-cast-id="rie"]')?.getAttribute('data-portrait-status')).toBe('approved');
            expect(screen.querySelectorAll('[data-portrait-status="unavailable"]')).toHaveLength(0);
            expect(screen.querySelector<HTMLImageElement>('[data-cast-id="xingyu"] img')?.src)
                .toContain('/academy/art/characters/xingyu/xingyu__neutral-short-hair-round-glasses__front-near-front__fullbody__v002.webp');
            expect(screen.querySelector<HTMLImageElement>('[data-cast-id="mika"] img')?.src)
                .toContain('/academy/art/characters/mika/mika__neutral-headphones__front-near-front__fullbody__v002.webp');
            expect(screen.querySelector('[data-cast-id="sophie"] img')).not.toBeNull();
            expect(screen.querySelector('[data-cast-id="aakash"]')?.getAttribute('data-portrait-status')).toBe('approved');
            expect(screen.querySelector<HTMLImageElement>('[data-cast-id="aakash"] img')?.src)
                .toContain('/academy/art/characters/aakash/aakash__neutral-route-map-burgundy-hoodie__front-near-front__fullbody__v010.webp');
        });
    
        it('does not expose activity actions while academic grounding remains blocked', () => {
            const screen = renderLessonOverviewScreen({
                language: 'en',
                model: overview(new Set(['activity:lesson-zero-reconstruct-repair'])),
                onBack: vi.fn(),
                onOpenActivity: vi.fn(),
            });
    
            expect(screen.dataset.releaseStatus).toBe('review-blocked');
            expect(screen.querySelector('.academy-lesson-overview-section-action')).toBeNull();
        });
    
        it('opens the selected authored activity once the complete lesson is playable', () => {
            const open = vi.fn();
            const blocked = overview(new Set(['activity:lesson-zero-reconstruct-repair']));
            const model = { ...blocked, releaseStatus: 'playable' as const, blockerIds: [] };
            const screen = renderLessonOverviewScreen({
                language: 'ja',
                model,
                onBack: vi.fn(),
                onOpenActivity: open,
            });
            const action = screen.querySelector<HTMLButtonElement>('.academy-lesson-overview-section-action');
    
            expect(action?.textContent).toBe('始める');
            expect(action?.dataset.actionPriority).toBe('primary');
            expect(screen.querySelectorAll('[data-action-priority="primary"]')).toHaveLength(1);
            action?.click();
            expect(open).toHaveBeenCalledWith('activity:lesson-zero-reconstruct-repair');
        });
    
        it('returns to Class without changing lesson evidence', () => {
            const back = vi.fn();
            const screen = renderLessonOverviewScreen({
                language: 'en',
                model: overview(),
                onBack: back,
                onOpenActivity: vi.fn(),
            });
            screen.querySelector<HTMLButtonElement>('.academy-lesson-overview-back')?.click();
            expect(back).toHaveBeenCalledOnce();
        });
    });
});
