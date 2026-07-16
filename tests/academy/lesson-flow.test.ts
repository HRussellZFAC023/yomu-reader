import fs from 'node:fs';
import path from 'node:path';
import { projectLearnerRecord } from '../../src/academy/domain/learner-record';
import type { AcademyCheckpoint } from '../../src/academy/persistence/indexeddb';
import { createLessonFlow } from '../../src/academy/routing/lesson-flow';
import type { AcademyRouteContext } from '../../src/academy/routing/types';
import type { AcademyShell } from '../../src/academy/ui/shell';

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

function checkpoint(lessonId = 'lesson:foundation-00'): AcademyCheckpoint {
    return {
        schemaVersion: 2,
        route: 'lesson-overview',
        routeHistory: [{ route: 'class' }],
        presentationMode: 'course',
        lessonId,
        updatedAt: 1,
    };
}

function context(lessonId?: string) {
    const appShell = shell();
    const go = vi.fn(async () => undefined);
    const back = vi.fn(async () => undefined);
    const value: AcademyRouteContext = {
        language: 'en',
        checkpoint: checkpoint(lessonId),
        projection: projectLearnerRecord([]),
        shell: appShell,
        go,
        back,
    };
    return { value, shell: appShell, go, back };
}

describe('Academy lesson flow', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(fs.readFileSync(LESSON_PATH), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })));
    });

    afterEach(() => { vi.unstubAllGlobals(); });

    it('renders the complete Lesson 0 overview without exposing blocked activity controls', async () => {
        const route = context();
        await expect(createLessonFlow().render('lesson-overview', route.value)).resolves.toBe(true);

        expect(route.shell.current?.dataset.academyScreen).toBe('lesson-overview');
        expect(route.shell.current?.querySelectorAll('.academy-lesson-overview-section')).toHaveLength(9);
        expect(route.shell.current?.querySelector('.academy-lesson-overview-section-action')).toBeNull();
        expect(route.shell.current?.textContent).not.toContain('blocker:');
    });

    it('uses persisted Back to return to Class', async () => {
        const route = context();
        await createLessonFlow().render('lesson-overview', route.value);
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-lesson-overview-back')?.click();
        expect(route.back).toHaveBeenCalledOnce();
    });

    it('returns an unknown lesson id to Class instead of showing generic content', async () => {
        const route = context('lesson:unknown');
        await createLessonFlow().render('lesson-overview', route.value);
        expect(route.back).toHaveBeenCalledOnce();
        expect(route.go).not.toHaveBeenCalled();
    });

    it('does not claim unrelated routes', async () => {
        const route = context();
        await expect(createLessonFlow().render('review', route.value)).resolves.toBe(false);
    });
});
