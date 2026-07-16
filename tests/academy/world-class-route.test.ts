import fs from 'node:fs';
import path from 'node:path';
import { projectLearnerRecord } from '../../src/academy/domain/learner-record';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import type { AcademyShell } from '../../src/academy/ui/shell';

const PLAN_PATH = path.resolve('public/academy/content/curriculum/class-week-cast.v1.json');
const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

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
            const filepath = url.endsWith('/content/curriculum/class-week-cast.v1.json')
                ? PLAN_PATH
                : url.endsWith('/content/lessons/lesson-zero.v1.json')
                    ? LESSON_PATH
                    : null;
            if (!filepath) return new Response(null, { status: 404 });
            return new Response(fs.readFileSync(filepath), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }));
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('shows all 73 Weeks but does not open review-blocked Lesson 0 or planning-only Weeks', async () => {
        const appShell = shell();
        const go = vi.fn(async () => undefined);
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
            back: vi.fn(async () => undefined),
        });

        expect(appShell.current?.querySelectorAll('.academy-class-week-node')).toHaveLength(73);
        expect(appShell.current?.querySelectorAll('button.academy-class-week-entry')).toHaveLength(0);
        expect(appShell.current?.querySelector('[data-week-id="orientation"] [aria-disabled="true"]')).not.toBeNull();
        expect(go).not.toHaveBeenCalled();
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('opens the Class spine at the learner’s chosen band without promoting a Week', async () => {
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

        expect(appShell.current?.querySelector<HTMLDetailsElement>('[data-path-group="level-3-2"]')?.open).toBe(true);
        expect(appShell.current?.querySelector('[data-week-id="l3-2-kickoff"]')?.getAttribute('aria-current')).toBe('step');
        expect(appShell.current?.querySelectorAll('button.academy-class-week-entry')).toHaveLength(0);
    });
});
