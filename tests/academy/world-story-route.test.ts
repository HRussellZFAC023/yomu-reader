import { projectLearnerRecord } from '../../src/academy/domain/learner-record';
import { serializeStoryCursor } from '../../src/academy/content/story-runner';
import { STORY_OPENING_ARC_ID } from '../../src/academy/content/story-runtime';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import type { AcademyShell } from '../../src/academy/ui/shell';

describe('World Story route', () => {
    it('keeps episode navigation in Story and sends both Story exits through Back history', async () => {
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const go = vi.fn(async () => undefined);
        const back = vi.fn(async () => undefined);
        const recordEncounter = vi.fn(async () => undefined);
        const flow = createWorldFlow({
            evidence: { recordEncounter } as never,
            pronunciation: {} as never,
            audio: {} as never,
        });

        await flow.render('story', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'story',
                routeHistory: [{ route: 'story' }],
                presentationMode: 'story',
                sectionId: serializeStoryCursor({
                    version: 1,
                    arcId: STORY_OPENING_ARC_ID,
                    sceneId: 'scene:blank-atlas:close',
                    nodeId: 'node:blank-atlas:one-light-room',
                    choices: {},
                    storyOnlyActivityIds: [],
                }),
                updatedAt: 1,
            },
            projection: projectLearnerRecord([]),
            shell,
            go,
            back,
        });

        current?.querySelector<HTMLButtonElement>('.academy-vn-back')?.click();
        expect(back).toHaveBeenCalledOnce();
        finishScene(current!);
        current?.querySelector<HTMLButtonElement>('.academy-story-next')?.click();
        // Episode 2 is outlined in canon but has no playable scene package yet.
        // Completion must return to the episode list instead of opening a false-ready route.
        expect(go).toHaveBeenCalledWith('story', { sectionId: undefined });
        expect(recordEncounter).not.toHaveBeenCalled();
        current?.querySelector<HTMLButtonElement>('.academy-story-list-return')?.click();
        expect(go).toHaveBeenCalledWith('story', { sectionId: undefined });

        await flow.render('story', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'story',
                routeHistory: [{ route: 'campus' }],
                presentationMode: 'story',
                updatedAt: 2,
            },
            projection: projectLearnerRecord([]),
            shell,
            go,
            back,
        });
        current?.querySelector<HTMLButtonElement>('.academy-story-return')?.click();
        expect(back).toHaveBeenCalledTimes(2);
    });
});

function finishScene(screen: HTMLElement): void {
    for (let index = 0; index < 48; index += 1) {
        const next = screen.querySelector<HTMLButtonElement>('.academy-story-next');
        if (next) return;
        const advance = screen.querySelector<HTMLButtonElement>(
            '.academy-vn-primary-action, .academy-story-activity-continue, .academy-story-activity-story-only',
        );
        if (!advance) throw new Error('Expected a playable story advance action.');
        advance.click();
    }
    throw new Error('Story scene did not reach its checkpoint.');
}
