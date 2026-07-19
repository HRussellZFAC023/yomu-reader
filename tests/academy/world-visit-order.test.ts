import { projectLearnerRecord } from '../../src/academy/domain/learner-record';
import type { AcademyCheckpoint } from '../../src/academy/persistence/indexeddb';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import type { AcademyShell } from '../../src/academy/ui/shell';

afterEach(() => document.body.replaceChildren());

describe('World visit ordering', () => {
    it('keeps every first arrival on visit zero and advances only after its introduction', async () => {
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const flow = createWorldFlow({
            evidence: {} as never,
            pronunciation: {} as never,
            audio: {} as never,
        });
        const baseCheckpoint = {
            schemaVersion: 2,
            route: 'campus',
            routeHistory: [],
            presentationMode: 'course',
            updatedAt: 1,
        } satisfies AcademyCheckpoint;
        const go = vi.fn(async () => undefined);
        const context = {
            language: 'en' as const,
            checkpoint: baseCheckpoint,
            projection: projectLearnerRecord([]),
            shell,
            go,
            back: vi.fn(async () => undefined),
        };

        await flow.render('campus', context);
        current?.querySelector<HTMLButtonElement>('[data-location="classroom"]')?.click();
        expect(go).toHaveBeenLastCalledWith('classroom', { worldVisits: {} });

        go.mockClear();
        await flow.render('campus', {
            ...context,
            checkpoint: {
                ...baseCheckpoint,
                seenIntroductions: ['place:classroom'],
            },
        });
        current?.querySelector<HTMLButtonElement>('[data-location="classroom"]')?.click();
        expect(go).toHaveBeenLastCalledWith('classroom', { worldVisits: { classroom: 1 } });
    });
});
