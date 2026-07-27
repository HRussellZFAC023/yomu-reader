import fs from 'node:fs';
import path from 'node:path';
import { validateClassWeekCastPlan } from '../../src/academy/content/class-week-cast-plan';
import { projectDailyLearningRoute } from '../../src/academy/domain/daily-learning-loop';
import { renderClassPathScreen } from '../../src/academy/ui/class-path-screen';

function plan() {
    return validateClassWeekCastPlan(JSON.parse(
        fs.readFileSync(path.resolve('public/academy/content/curriculum/class-week-cast.v1.json'), 'utf8'),
    ));
}

afterEach(() => document.body.replaceChildren());

describe('Class path', () => {
    it('shows the whole course as one continuous chronological path with quiet level metadata', () => {
        const screen = renderClassPathScreen({
            language: 'en',
            plan: plan(),
            currentOrder: 2,
            playableWeekIds: new Set(['orientation', 'l1-l01']),
            completedWeekIds: new Set(),
            onBack: vi.fn(),
            onOpenWeek: vi.fn(),
        });

        expect(screen.querySelector('.academy-panel')).toBeNull();
        expect(screen.querySelector('.academy-class-path-paper')).toBeNull();
        expect(screen.querySelector('details')).toBeNull();
        expect(screen.querySelectorAll('.academy-class-week-spine')).toHaveLength(1);
        expect([...screen.querySelectorAll('.academy-class-week-level')].map(node => node.textContent?.replace(' · ', ''))).toEqual([
            'Foundation', 'N5', 'N4', 'N3', 'N2 → N1',
        ]);
        expect(screen.querySelectorAll('.academy-class-week-node')).toHaveLength(74);
        expect(screen.querySelector('.academy-class-week-node:first-child')?.getAttribute('data-week-id')).toBe('orientation');
        expect(screen.querySelector('.academy-class-week-node:last-child')?.getAttribute('data-week-id')).toBe('l3plus-kanji-7');
        expect(screen.querySelector('[data-week-id="orientation"] .academy-class-week-sequence')?.textContent).toBe('Lesson 0');
        expect(screen.querySelector('[data-week-id="orientation"] .academy-class-week-prerequisite')?.textContent)
            .toBe('No prerequisites');
        expect(screen.querySelector('[data-week-id="l1-kickoff"] .academy-class-week-prerequisite')?.textContent)
            .toBe('Requires Lesson 0');
        expect(screen.querySelector('[data-week-id="l1-l01"] .academy-class-week-prerequisite')?.textContent)
            .toBe('Requires Lesson 0');
        expect(screen.querySelector('.academy-class-week-number')).toBeNull();
        expect(screen.querySelector('.academy-class-week-kind')).toBeNull();
        expect(screen.querySelector('[data-week-id="l1-l01"]')?.getAttribute('aria-current')).toBe('step');
        expect(screen.querySelectorAll('button.academy-class-week-entry')).toHaveLength(2);
        expect(screen.querySelector<HTMLElement>('[data-week-id="l3plus-kanji-7"]')?.dataset.weekRuntime).toBe('not-bound');
    });

    it('opens only a genuinely bound Week and never sends a planning row to a generic start route', () => {
        const open = vi.fn();
        const screen = renderClassPathScreen({
            language: 'en',
            plan: plan(),
            currentOrder: 0,
            playableWeekIds: new Set(['orientation']),
            onBack: vi.fn(),
            onOpenWeek: open,
        });
        screen.querySelector<HTMLButtonElement>('[data-week-id="orientation"] button')?.click();
        expect(open).toHaveBeenCalledOnce();
        expect(open).toHaveBeenCalledWith('orientation');
        expect(screen.querySelector('[data-week-id="l1-kickoff"] button')).toBeNull();
        expect(screen.querySelector('[data-week-id="l1-kickoff"] [aria-disabled="true"]')).not.toBeNull();
    });

    it('mounts one daily thread with the learner reason and delegates its primary action', () => {
        const openDaily = vi.fn();
        const route = projectDailyLearningRoute({
            events: [],
            evidence: [],
            candidates: [{
                kind: 'lesson',
                id: 'authored-week:l1-l01',
                sequence: 1,
                completionActivityId: 'complete:authored-week:l1-l01',
                completionEncounterIds: ['class-week:l1-l01'],
                label: 'First class',
                conceptIds: ['concept:first-class'],
                grounding: { sourceId: 'moodle:first-class' },
                modeId: 'normal-challenge',
                skill: 'grammar',
                format: 'mixed',
                incentive: { kind: 'journal-memory', id: 'memory:first-class' },
            }],
            now: 0,
            dayBoundary: { timeZone: 'Europe/London', dayBoundaryHour: 4 },
        });
        const screen = renderClassPathScreen({
            language: 'en',
            plan: plan(),
            currentOrder: 1,
            playableWeekIds: new Set(['l1-l01']),
            dailyRoute: route,
            learningReason: 'Read with friends',
            onBack: vi.fn(),
            onOpenWeek: vi.fn(),
            onOpenDailyAction: openDaily,
        });

        expect(screen.querySelector('[data-daily-route="true"]')?.textContent)
            .toContain('Your reason: Read with friends');
        screen.querySelector<HTMLButtonElement>('[data-daily-action-id="authored-week:l1-l01"]')?.click();
        expect(openDaily).toHaveBeenCalledWith(route.primaryAction);
    });

    it('shows people and events for the full path and keeps concise Japanese section labels', () => {
        const screen = renderClassPathScreen({
            language: 'ja',
            plan: plan(),
            currentOrder: 0,
            playableWeekIds: new Set(['orientation']),
            onBack: vi.fn(),
            onOpenWeek: vi.fn(),
        });
        expect(screen.querySelector('h1')?.textContent).toBe('クラス');
        expect(screen.querySelector('#academy-class-path-weeks h2')?.textContent).toBe('道のり');
        expect(screen.querySelector('#academy-class-path-people h2')?.textContent).toBe('みんな');
        expect(screen.querySelector('#academy-class-path-events h2')?.textContent).toBe('イベント');
        expect(screen.querySelector('#academy-class-path-events')?.textContent).toContain('旅');
        expect(screen.querySelector('#academy-class-path-events')?.textContent).toContain('ひらいた扉');
        expect(screen.querySelector('#academy-class-path-events')?.textContent).not.toContain('最初の学期');
        expect(screen.querySelector<HTMLElement>('#academy-class-path-events')?.hidden).toBe(true);
        screen.querySelector<HTMLButtonElement>('[data-class-section="events"]')?.click();
        expect(screen.querySelector<HTMLElement>('#academy-class-path-events')?.hidden).toBe(false);
        expect(screen.querySelector<HTMLElement>('#academy-class-path-weeks')?.hidden).toBe(true);
        expect([...screen.querySelectorAll('.academy-class-event-title')]
            .every(title => title.classList.contains('academy-primary-purpose'))).toBe(true);
    });

    it('keeps Peter and Shaun in the class-photo people and story records', () => {
        const screen = renderClassPathScreen({
            language: 'en',
            plan: plan(),
            currentOrder: 2,
            playableWeekIds: new Set(['orientation']),
            onBack: vi.fn(),
            onOpenWeek: vi.fn(),
        });

        expect(screen.querySelector('#academy-class-path-people [data-cast-id="peter"]')?.textContent).toContain('Peter');
        expect(screen.querySelector('#academy-class-path-people [data-cast-id="shaun"]')?.textContent).toContain('Shaun');
        const event = screen.querySelector('[data-event-id="event:first-term-photo"]');
        expect(event?.textContent).toContain('The class photograph');
        expect(event?.textContent).not.toContain('First term');
        expect(event?.textContent).toContain('Peter · Shaun');
    });

    it('revisits completed stops, recommends the current stop, and does not open a grounded future stop', () => {
        const open = vi.fn();
        const screen = renderClassPathScreen({
            language: 'en',
            plan: plan(),
            currentOrder: 3,
            playableWeekIds: new Set(['orientation', 'l1-l01', 'l1-l02', 'l1-l03']),
            completedWeekIds: new Set(['l1-l01']),
            onBack: vi.fn(),
            onOpenWeek: open,
        });

        const complete = screen.querySelector<HTMLElement>('[data-week-id="l1-l01"]')!;
        expect(complete.dataset.weekStatus).toBe('complete');
        expect(complete.querySelector('.academy-class-week-status')?.textContent).toBe('Completed');
        expect(complete.querySelector('.academy-class-week-action')?.textContent).toBe('Revisit');
        complete.querySelector<HTMLButtonElement>('button')?.click();
        expect(open).toHaveBeenCalledWith('l1-l01');

        const current = screen.querySelector<HTMLElement>('[data-week-id="l1-l02"]')!;
        expect(current.dataset.weekStatus).toBe('current');
        expect(current.getAttribute('aria-current')).toBe('step');
        expect(current.querySelector('.academy-class-week-status')?.textContent).toBe('Recommended');
        expect(current.querySelector('.academy-class-week-action')?.textContent).toBe('Continue');

        const earlier = screen.querySelector<HTMLElement>('[data-week-id="orientation"]')!;
        expect(earlier.dataset.weekStatus).toBe('available');
        expect(earlier.querySelector('.academy-class-week-status')?.textContent).toBe('Earlier lesson');
        expect(earlier.querySelector('.academy-class-week-action')?.textContent).toBe('Revisit');
        earlier.querySelector<HTMLButtonElement>('button')?.click();
        expect(open).toHaveBeenCalledWith('orientation');

        const future = screen.querySelector<HTMLElement>('[data-week-id="l1-l03"]')!;
        expect(future.dataset.weekRuntime).toBe('playable');
        expect(future.dataset.weekStatus).toBe('locked');
        expect(future.querySelector('button')).toBeNull();
        expect(future.querySelector('[aria-disabled="true"]')).not.toBeNull();
        expect(future.querySelector('.academy-class-week-status')?.textContent).toBe('Future stop');
    });

    it('distinguishes open stops that share a source title', () => {
        const screen = renderClassPathScreen({
            language: 'en',
            plan: plan(),
            currentOrder: 11,
            playableWeekIds: new Set(['l1-l06', 'l1-l07', 'l1-l08', 'l1-l09']),
            completedWeekIds: new Set(['l1-l06', 'l1-l07', 'l1-l08', 'l1-l09']),
            onBack: vi.fn(),
            onOpenWeek: vi.fn(),
        });
        const labels = [...screen.querySelectorAll<HTMLButtonElement>('button.academy-class-week-entry')]
            .map(button => button.getAttribute('aria-label'));

        expect(labels).toEqual([
            'Revisit: Week 07 · This one, please',
            'Revisit: Week 08 · This one, please',
            'Revisit: Week 09 · What time do we start?',
            'Revisit: Week 10 · What time do we start?',
        ]);
        expect(new Set(labels).size).toBe(labels.length);
    });

    it('uses the complete review gallery in People without promoting candidates into lesson scenes', () => {
        const screen = renderClassPathScreen({
            language: 'en',
            plan: plan(),
            currentOrder: 2,
            playableWeekIds: new Set(['l1-l01']),
            initialSection: 'people',
            reviewAllCast: true,
            onBack: vi.fn(),
            onOpenWeek: vi.fn(),
        });

        expect(screen.querySelector('.academy-class-register-mark')).toBeNull();
        expect(screen.querySelector<HTMLElement>('#academy-class-path-people')?.hidden).toBe(false);
        expect(screen.querySelector<HTMLElement>('#academy-class-path-weeks')?.hidden).toBe(true);
        expect(screen.querySelectorAll('.academy-class-person-card')).toHaveLength(30);
        expect(screen.querySelector('[data-cast-id="rie"] picture.academy-sprite img')?.getAttribute('src')).toContain('/characters/rie/');
        expect(screen.querySelector('[data-cast-id="sophie"] picture.academy-sprite img')).not.toBeNull();
        const peter = screen.querySelector<HTMLElement>('[data-cast-id="peter"]')!;
        expect(peter.dataset.portraitState).toBe('available');
        expect(peter.dataset.portraitPresentation).toBe('journal-review-preview');
        expect(peter.querySelector('img')).not.toBeNull();
        const fallback = screen.querySelector<HTMLElement>('[data-cast-id="henry"]')!;
        expect(fallback.dataset.portraitState).toBe('available');
        expect(fallback.querySelector('img')).not.toBeNull();
        expect(fallback.querySelector('.academy-class-person-name')?.textContent).toBe('Henry-san');
        expect(fallback.querySelector('.academy-class-person-caption')?.children).toHaveLength(2);

        const lessonZeroHost = screen.querySelector('[data-week-id="orientation"] [data-week-cast-id="rie"]');
        expect(lessonZeroHost?.querySelector('picture.academy-sprite img')?.getAttribute('src')).toContain('/characters/rie/');
        const peterAppearance = screen.querySelector('[data-week-id="l1-l04"] [data-week-cast-id="peter"]');
        expect(peterAppearance?.classList.contains('is-name-only')).toBe(true);
        const xingyuAppearance = screen.querySelector('[data-week-id="l1-l03"] [data-week-cast-id="xingyu"]');
        expect(xingyuAppearance?.classList.contains('is-name-only')).toBe(false);
        expect(xingyuAppearance?.querySelector('picture.academy-sprite img')?.getAttribute('src'))
            .toContain('/characters/xingyu/xingyu__neutral-short-hair-round-glasses__front-near-front__fullbody__v002.png');
        expect(xingyuAppearance?.textContent).toBe('Xingyu');
    });

    it('combines directory unlock state with the authoritative cast likeness gate', () => {
        const screen = renderClassPathScreen({
            language: 'en',
            plan: plan(),
            currentOrder: 0,
            playableWeekIds: new Set(['orientation']),
            characters: [{
                characterId: 'rie',
                name: 'Rie',
                category: 'teacher',
                unlocked: false,
                chapters: [],
                revisitPaths: [],
            }, {
                characterId: 'sophie',
                name: 'Sophie',
                category: 'classmate',
                unlocked: true,
                chapters: [1],
                revisitPaths: [],
            }],
            onBack: vi.fn(),
            onOpenWeek: vi.fn(),
        });

        const rie = screen.querySelector<HTMLElement>('[data-cast-id="rie"]')!;
        expect(rie.dataset.unlocked).toBe('false');
        expect(rie.dataset.portraitState).toBe('locked');
        expect(rie.querySelector('img')).toBeNull();
        const sophie = screen.querySelector<HTMLElement>('[data-cast-id="sophie"]')!;
        expect(sophie.dataset.unlocked).toBe('true');
        expect(sophie.dataset.portraitState).toBe('available');
        expect(sophie.querySelector('img')).not.toBeNull();
    });

    it('delegates Back to route history instead of choosing a replacement destination', () => {
        const back = vi.fn();
        const screen = renderClassPathScreen({
            language: 'en',
            plan: plan(),
            currentOrder: 2,
            playableWeekIds: new Set(['l1-l01']),
            onBack: back,
            onOpenWeek: vi.fn(),
        });

        screen.querySelector<HTMLButtonElement>('.academy-class-path-back')?.click();
        expect(back).toHaveBeenCalledOnce();
    });

    it('defines desktop and narrow-phone layout without clipping portrait overhangs', () => {
        const css = fs.readFileSync(path.resolve('src/academy/styles/class-path.css'), 'utf8');
        const purposeCss = fs.readFileSync(path.resolve('src/academy/styles/primary-purpose.css'), 'utf8');
        expect(css).toMatch(/\.academy-class-week-spine\s*\{/);
        expect(css).not.toContain('.academy-class-week-number');
        expect(css).not.toContain('.academy-class-week-kind');
        expect(css).not.toMatch(/grid-auto-flow:\s*column/);
        expect(css).not.toMatch(/overflow-x:\s*auto[^}]*scroll-snap-type/s);
        expect(css).not.toContain('.academy-class-path-paper');
        expect(css).toMatch(/\.academy-class-register\s*\{[^}]*overflow:\s*visible/s);
        expect(css).toMatch(/\.academy-class-person-card\s*\{[^}]*overflow:\s*visible/s);
        expect(css).toMatch(/\.academy-class-person-portrait\s*\{[^}]*top:\s*-54px/s);
        expect(css).toMatch(/\.academy-class-person-portrait img\s*\{[^}]*object-fit:\s*contain/s);
        expect(css).toMatch(/\.academy-class-person-caption\s*\{[^}]*background:/s);
        expect(css).toMatch(/\.academy-class-week-cast\s*\{/);
        expect(css).toMatch(/\.academy-class-week-sprite img\s*\{[^}]*object-fit:\s*contain/s);
        expect(css).toMatch(/@media \(min-width: 980px\)/);
        expect(css).toMatch(/@media \(max-width: 700px\)/);
        expect(css).toMatch(/@media \(max-width: 520px\)[\s\S]*\.academy-class-register\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*row-gap:\s*58px/s);
        expect(css).not.toMatch(/\.academy-class-person-(?:card|portrait|caption)[^{]*\{[^}]*overflow:\s*hidden/s);
        expect(purposeCss).toMatch(/academy-class-event \.academy-primary-purpose[\s\S]*text-overflow:\s*clip[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/s);
        expect(purposeCss).toMatch(/\.academy-class-event-season\s*\{[^}]*color:\s*#315d45/s);
        expect(purposeCss).toMatch(/\.academy-class-event-copy,[\s\S]*\.academy-class-event-status[\s\S]*overflow:\s*visible/s);
    });
});
