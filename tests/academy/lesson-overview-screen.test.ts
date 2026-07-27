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
    it('keeps the complete class-day roster beside one continuous lesson scene', () => {
        const screen = renderLessonOverviewScreen({
            language: 'en',
            model: overview(new Set(['activity:lesson-zero-reconstruct-repair'])),
            onBack: vi.fn(),
            onOpenActivity: vi.fn(),
        });

        expect(screen.dataset.academyScreen).toBe('lesson-overview');
        expect(screen.querySelectorAll('.academy-lesson-overview-paper')).toHaveLength(1);
        expect(screen.querySelectorAll('.academy-lesson-overview-scene')).toHaveLength(1);
        expect(screen.querySelectorAll('.academy-lesson-overview-section')).toHaveLength(9);
        expect(screen.querySelectorAll('.academy-lesson-overview-goal')).toHaveLength(6);
        expect(screen.textContent).toContain('Classroom language handout');
        expect(screen.textContent).toContain('Name card');
        expect(screen.textContent).toContain('Class introductions');
        expect(screen.querySelector('.academy-lesson-overview-prerequisite')?.textContent)
            .toContain('No prerequisites. Lesson 0 starts from the beginning.');
        expect(screen.querySelector('.academy-lesson-overview-progress')).toBeNull();
        expect(screen.querySelector('.academy-lesson-overview-section-number')).toBeNull();
        expect([...screen.querySelectorAll<HTMLElement>('.academy-lesson-overview-roster-member')]
            .map(node => node.dataset.castId)).toEqual(['rie', 'xingyu', 'mika', 'sophie', 'ruparna', 'aakash', 'sam']);
        expect([...screen.querySelectorAll('.academy-lesson-overview-roster-name')]
            .map(node => node.textContent)).toEqual([
            'Rie-sensei', 'Xingyu', 'Mika', 'Sophie', 'Ruparna', 'Aakash', 'Sam',
        ]);
        expect(screen.textContent).toContain('教室 · 語学ラボ · 図書館 · 教室前');
        expect(screen.textContent).not.toContain('blocker:');
    });

    it('uses only approved likeness art and keeps pending classmates visibly rostered', () => {
        const screen = renderLessonOverviewScreen({
            language: 'en',
            model: overview(),
            onBack: vi.fn(),
            onOpenActivity: vi.fn(),
        });

        expect(screen.querySelector('[data-cast-id="rie"] img')?.getAttribute('src'))
            .toBe('/academy/art/characters/rie/rie__neutral-glasses__front-near-front__halfbody__v001.png');
        expect(screen.querySelector('[data-cast-id="rie"] picture.academy-sprite')).not.toBeNull();
        expect(screen.querySelector('[data-cast-id="rie"]')?.getAttribute('data-portrait-status')).toBe('approved');
        expect(screen.querySelectorAll('[data-portrait-status="unavailable"]')).toHaveLength(2);
        expect(screen.querySelector<HTMLImageElement>('[data-cast-id="xingyu"] img')?.src)
            .toContain('/academy/art/characters/xingyu/xingyu__neutral-short-hair-round-glasses__front-near-front__fullbody__v002.png');
        expect(screen.querySelector<HTMLImageElement>('[data-cast-id="mika"] img')?.src)
            .toContain('/academy/art/characters/mika/mika__encouraging-listening-headphones__right-three-quarter__fullbody__v002.png');
        expect(screen.querySelector('[data-cast-id="sophie"] img')).not.toBeNull();
        expect(screen.querySelector('[data-cast-id="aakash"]')?.getAttribute('data-portrait-status')).toBe('approved');
        expect(screen.querySelector<HTMLImageElement>('[data-cast-id="aakash"] img')?.src)
            .toContain('/academy/art/characters/aakash/aakash__sprite__neutral__front-near-front__v009.png');
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

    it('defines responsive scene choreography with a reduced-motion exit', () => {
        const css = fs.readFileSync(path.resolve('src/academy/styles/activity.css'), 'utf8');
        expect(css).toMatch(/\.academy-lesson-overview-screen \.academy-lesson-overview-roster\s*\{/);
        expect(css).toMatch(/\.academy-lesson-overview-screen \.academy-lesson-overview-paper\s*\{[^}]*background:/s);
        expect(css).toMatch(/\.academy-lesson-overview-screen \.academy-lesson-overview-header,[\s\S]*background:\s*transparent/s);
        expect(css).toMatch(/\.academy-lesson-overview-screen \.academy-lesson-overview-roster-portrait img\s*\{/);
        expect(css).not.toContain('.academy-lesson-overview-section-number');
        expect(css).toMatch(/@media \(max-width: 980px\)/);
        expect(css).toMatch(/@media \(max-width: 620px\)/);
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*academy-lesson-overview/);
    });
});
