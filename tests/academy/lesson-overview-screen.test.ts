import fs from 'node:fs';
import path from 'node:path';
import { validateLessonZeroGrounding } from '../../src/academy/content/lesson-zero-grounding';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { createLessonOverviewModel, type LessonOverviewModel } from '../../src/academy/domain/lesson-overview';
import { renderLessonOverviewScreen } from '../../src/academy/ui/lesson-overview-screen';

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
    it('keeps goals, all sections, ready materials, people and places on one continuous page', () => {
        const screen = renderLessonOverviewScreen({
            language: 'en',
            model: overview(new Set(['activity:lesson-zero-reconstruct-repair'])),
            onBack: vi.fn(),
            onOpenActivity: vi.fn(),
        });

        expect(screen.dataset.academyScreen).toBe('lesson-overview');
        expect(screen.querySelectorAll('.academy-lesson-overview-paper')).toHaveLength(1);
        expect(screen.querySelectorAll('.academy-lesson-overview-section')).toHaveLength(9);
        expect(screen.querySelectorAll('.academy-lesson-overview-goal')).toHaveLength(5);
        expect(screen.textContent).toContain('Classroom language handout');
        expect(screen.textContent).toContain('Name card');
        expect(screen.textContent).not.toContain('Class introductions');
        expect(screen.textContent).toContain('Rie-sensei · Xingyu · Mika · Sophie · Ruparna · Aakash · Sam');
        expect(screen.textContent).toContain('教室 · LL教室 · 図書館 · 教室前');
        expect(screen.textContent).not.toContain('blocker:');
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
