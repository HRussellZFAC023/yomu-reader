import fs from 'node:fs';
import path from 'node:path';
import { projectLearnerRecord } from '../../src/academy/domain/learner-record';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import type { AcademyShell } from '../../src/academy/ui/shell';

const PLAN_PATH = path.resolve('public/academy/content/curriculum/class-week-cast.v1.json');
const LESSON_ROOT = path.resolve('public/academy/content/lessons');

function shell(): AcademyShell & { current?: HTMLElement } {
    const value = {
        screen: document.createElement('main'),
        current: undefined as HTMLElement | undefined,
        replace(view: HTMLElement) { value.current = view; },
        setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
        setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
    };
    return value;
}

describe('World Class route', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async input => {
            const url = String(input);
            const lessonMatch = url.match(/\/content\/lessons\/([^/]+\.json)$/u);
            const filepath = url.endsWith('/content/curriculum/class-week-cast.v1.json')
                ? PLAN_PATH
                : lessonMatch ? path.join(LESSON_ROOT, lessonMatch[1]) : null;
            if (!filepath) return new Response(null, { status: 404 });
            return new Response(fs.readFileSync(filepath), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }));
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('resumes the pending lesson overview from Classroom without losing it', async () => {
        const appShell = shell();
        const go = vi.fn(async () => undefined);
        const flow = createWorldFlow({
            evidence: {} as never,
            pronunciation: {} as never,
            audio: { settings: { muted: true, volumes: { music: 1, ambience: 1, lesson: 1, sfx: 1 } } } as never,
        });

        await flow.render('classroom', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'classroom',
                routeHistory: [{ route: 'campus' }],
                presentationMode: 'story',
                lessonId: 'lesson:foundation-00',
                sectionId: 'stale-section',
                activityId: 'stale-activity',
                seenIntroductions: ['place:classroom'],
                updatedAt: 1,
            },
            projection: projectLearnerRecord([]),
            shell: appShell,
            go,
            back: vi.fn(async () => undefined),
        });

        appShell.current?.querySelector<HTMLButtonElement>('[data-activity-route="class"]')?.click();
        expect(go).toHaveBeenCalledWith('lesson-overview');
    });

    it('shows all 73 Weeks while opening the recovered authored Weeks', async () => {
        const appShell = shell();
        const go = vi.fn(async () => undefined);
        const back = vi.fn(async () => undefined);
        const flow = createWorldFlow({ evidence: {} as never, pronunciation: {} as never, audio: {} as never });
        await flow.render('class', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'class',
                routeHistory: [],
                presentationMode: 'course',
                updatedAt: 1,
            },
            projection: projectLearnerRecord([]),
            shell: appShell,
            go,
            back,
        });

        expect(appShell.current?.querySelectorAll('.academy-class-week-node')).toHaveLength(73);
        expect(appShell.current?.querySelectorAll('button.academy-class-week-entry')).toHaveLength(1);
        expect(appShell.current?.querySelector('[data-week-id="orientation"] [aria-disabled="true"]')).not.toBeNull();
        appShell.current?.querySelector<HTMLButtonElement>('[data-week-id="l1-l01"] button')?.click();
        expect(go).toHaveBeenCalledWith('classroom', {
            lessonId: 'authored-week:l1-l01',
            sectionId: undefined,
            activityId: undefined,
        });
        appShell.current?.querySelector<HTMLButtonElement>('.academy-class-path-back')?.click();
        expect(back).toHaveBeenCalledOnce();
        expect(fetch).toHaveBeenCalledTimes(61);
    });

    it('enters Week 1 through its located classroom cast, action, and real exits', async () => {
        const appShell = shell();
        const go = vi.fn(async () => undefined);
        const back = vi.fn(async () => undefined);
        const flow = createWorldFlow({
            evidence: {} as never,
            pronunciation: {} as never,
            audio: { settings: { muted: true, volumes: { music: 1, ambience: 1, lesson: 1, sfx: 1 } } } as never,
        });

        await flow.render('classroom', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'classroom',
                routeHistory: [{ route: 'class' }],
                presentationMode: 'course',
                lessonId: 'authored-week:l1-l01',
                seenIntroductions: ['place:classroom'],
                updatedAt: 1,
            },
            projection: projectLearnerRecord([]),
            shell: appShell,
            go,
            back,
        });

        const screen = appShell.current!;
        expect(screen.dataset.currentPlace).toBe('classroom');
        expect(screen.dataset.worldLessonId).toBe('authored-week:l1-l01');
        expect(screen.dataset.introductionId).toBe('week:l1-l01:classroom');
        expect(screen.dataset.firstVisit).toBe('true');
        expect(screen.querySelector('[data-world-activity="authored-week:l1-l01"]')?.textContent)
            .toContain('Week 1 · Nice to meet you');
        expect([...screen.querySelectorAll<HTMLElement>('[data-world-character]')]
            .map(character => character.dataset.worldCharacter)).toEqual(['rie', 'stasi', 'mika']);
        expect(screen.querySelector('[data-world-character="stasi"]')?.getAttribute('data-presence'))
            .toBe('setting-out-name-cards');
        expect(screen.querySelector('[data-world-character="mika"]')?.getAttribute('data-presence'))
            .toBe('waiting-for-name-answer');
        expect([...screen.querySelectorAll<HTMLElement>('[data-location]')]
            .map(exit => exit.dataset.location)).toEqual(['courtyard', 'library', 'cafeteria', 'cafe']);

        screen.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')?.click();
        screen.querySelector<HTMLButtonElement>('[data-activity-route="class"]')?.click();
        expect(go).toHaveBeenCalledWith('lesson-overview');
        screen.querySelector<HTMLButtonElement>('.academy-world-back')?.click();
        expect(back).toHaveBeenCalledOnce();
    });

    it('opens the Class spine at the learner’s chosen band without losing earlier playable Weeks', async () => {
        const appShell = shell();
        const flow = createWorldFlow({ evidence: {} as never, pronunciation: {} as never, audio: {} as never });
        await flow.render('class', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'class',
                routeHistory: [],
                presentationMode: 'course',
                selectedBand: 'n3',
                updatedAt: 1,
            },
            projection: projectLearnerRecord([{
                schemaVersion: 1,
                eventId: 'entry:n3',
                at: 1,
                kind: 'curriculum-entry-chosen',
                route: 'manual-band',
                band: 'n3',
            }]),
            shell: appShell,
            go: vi.fn(async () => undefined),
            back: vi.fn(async () => undefined),
        });

        expect(appShell.current?.querySelector('[data-week-id="l3-2-kickoff"]')?.getAttribute('data-path-group')).toBe('level-3-2');
        expect(appShell.current?.querySelector('[data-week-id="l3-2-l01"]')?.getAttribute('aria-current')).toBe('step');
        expect(appShell.current?.querySelector('[data-week-id="l3-2-kickoff"]')?.getAttribute('aria-current')).toBeNull();
        expect(appShell.current?.querySelector('[data-week-id="l1-l01"] button')).not.toBeNull();
        expect(appShell.current?.querySelector('[data-week-id="l3-2-l02"] button')).toBeNull();
        expect(appShell.current?.querySelector('[data-week-id="l3-2-l02"]')?.getAttribute('data-week-status')).toBe('locked');
    });
});
