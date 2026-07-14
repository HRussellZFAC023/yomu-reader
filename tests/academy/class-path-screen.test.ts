import fs from 'node:fs';
import path from 'node:path';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import { renderClassPathScreen } from '../../src/academy/ui/class-path-screen';

function plan() {
    return validateClassWeekCastPlan(JSON.parse(
        fs.readFileSync(path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'), 'utf8'),
    ));
}

afterEach(() => document.body.replaceChildren());

describe('Class path', () => {
    it('shows the whole course as collapsed level chapters and expands only the current level', () => {
        const screen = renderClassPathScreen({
            language: 'en',
            plan: plan(),
            currentOrder: 2,
            playableWeekIds: new Set(['orientation']),
            completedWeekIds: new Set(),
            onOpenWeek: vi.fn(),
        });

        expect(screen.querySelector('.academy-panel')).toBeNull();
        expect(screen.querySelectorAll('.academy-class-path-group')).toHaveLength(5);
        expect(screen.querySelectorAll('.academy-class-path-group[open]')).toHaveLength(1);
        expect([...screen.querySelectorAll('.academy-class-path-group-title')].map(node => node.textContent)).toEqual([
            'Foundation', 'N5', 'N4', 'N3', 'N2 → N1',
        ]);
        expect(screen.querySelector('[data-path-group="level-1"]')?.hasAttribute('open')).toBe(true);
        expect(screen.querySelectorAll('.academy-class-week-node')).toHaveLength(73);
        expect(screen.querySelector('[data-week-id="l1-l01"]')?.getAttribute('aria-current')).toBe('step');
        expect(screen.querySelectorAll('button.academy-class-week-entry')).toHaveLength(1);
        expect(screen.querySelector<HTMLElement>('[data-week-id="l3plus-kanji-7"]')?.dataset.weekRuntime).toBe('not-bound');
    });

    it('opens only a genuinely bound Week and never sends a planning row to a generic start route', () => {
        const open = vi.fn();
        const screen = renderClassPathScreen({
            language: 'en',
            plan: plan(),
            currentOrder: 0,
            playableWeekIds: new Set(['orientation']),
            onOpenWeek: open,
        });
        screen.querySelector<HTMLButtonElement>('[data-week-id="orientation"] button')?.click();
        expect(open).toHaveBeenCalledOnce();
        expect(open).toHaveBeenCalledWith('orientation');
        expect(screen.querySelector('[data-week-id="l1-kickoff"] button')).toBeNull();
        expect(screen.querySelector('[data-week-id="l1-kickoff"] [aria-disabled="true"]')).not.toBeNull();
    });

    it('filters people and events to the expanded level and keeps concise Japanese section labels', () => {
        const screen = renderClassPathScreen({
            language: 'ja',
            plan: plan(),
            currentOrder: 0,
            playableWeekIds: new Set(['orientation']),
            onOpenWeek: vi.fn(),
        });
        const later = screen.querySelector<HTMLDetailsElement>('[data-path-group="level-3-plus"]')!;
        later.open = true;
        later.dispatchEvent(new Event('toggle'));

        expect(screen.querySelector('h1')?.textContent).toBe('クラス');
        expect(screen.querySelector('#academy-class-path-weeks h2')?.textContent).toBe('道のり');
        expect(screen.querySelector('#academy-class-path-people h2')?.textContent).toBe('みんな');
        expect(screen.querySelector('#academy-class-path-events h2')?.textContent).toBe('イベント');
        expect(screen.querySelector<HTMLElement>('#academy-class-path-people')?.dataset.pathGroup).toBe('level-3-plus');
        expect(screen.querySelector('#academy-class-path-events')?.textContent).toContain('旅');
        expect(screen.querySelector('#academy-class-path-events')?.textContent).not.toContain('ひらいた扉');
    });

    it('keeps Peter and Shaun in the first-term people and story records', () => {
        const screen = renderClassPathScreen({
            language: 'en',
            plan: plan(),
            currentOrder: 2,
            playableWeekIds: new Set(['orientation']),
            onOpenWeek: vi.fn(),
        });

        expect(screen.querySelector('#academy-class-path-people [data-cast-id="peter"]')?.textContent).toContain('Peter');
        expect(screen.querySelector('#academy-class-path-people [data-cast-id="shaun"]')?.textContent).toContain('Shaun');
        const event = screen.querySelector('[data-event-id="event:first-term-photo"]');
        expect(event?.textContent).toContain('First term');
        expect(event?.textContent).toContain('Peter · Shaun');
    });

    it('uses a vertical syllabus spine instead of horizontal rails', () => {
        const css = fs.readFileSync(path.resolve('src/academy/styles/class-path.css'), 'utf8');
        expect(css).toMatch(/\.academy-class-week-spine\s*\{/);
        expect(css).not.toMatch(/grid-auto-flow:\s*column/);
        expect(css).not.toMatch(/overflow-x:\s*auto[^}]*scroll-snap-type/s);
        expect(css).toMatch(/@media \(max-width: 700px\)/);
    });
});
