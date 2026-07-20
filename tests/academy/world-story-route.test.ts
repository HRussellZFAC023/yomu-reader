import { createMemoryLearnerEventRepository, projectLearnerRecord } from '../../src/academy/domain/learner-record';
import { serializeStoryCursor } from '../../src/academy/content/story-runner';
import { loadStoryRuntime, STORY_OPENING_ARC_ID } from '../../src/academy/content/story-runtime';
import { storyPractice } from '../../src/academy/content/n3-story-practice';
import { storyReplayReviewSeed } from '../../src/academy/content/story-replay-catalog';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';
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
        // The generic story loader now owns Episode 2, so completing the
        // opening arc must continue into its authored package.
        expect(go).toHaveBeenCalledWith('story', { sectionId: 's1e02-margin-map' });
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

    it('keeps a persisted pass authoritative when a later replay lapse exists', async () => {
        const activityId = 'activity:s4e04-three-true-versions-synthesis';
        const practice = storyPractice(activityId)!;
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, {
            async ingest() {},
            async due() { return []; },
            async rate() {},
        });
        await evidence.initialize();
        const practiceEvidence = { ...practice, reviewSeed: storyReplayReviewSeed(practice) };
        await evidence.recordAuthoredStoryPractice(practiceEvidence, 'pass');
        await evidence.recordAuthoredStoryPractice(practiceEvidence, 'lapse');

        const story = loadStoryRuntime();
        const arc = story.playableArc(practice.chapterId)!;
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const flow = createWorldFlow({
            evidence,
            pronunciation: {} as never,
            audio: {} as never,
        });
        const historyBeforeContinue = await evidence.history();

        await flow.render('story', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'story',
                routeHistory: [{ route: 'campus' }],
                presentationMode: 'story',
                sectionId: serializeStoryCursor({
                    version: 1,
                    arcId: arc.id,
                    sceneId: 'scene:three-versions:one-synthesis',
                    nodeId: 'activity-node:three-versions:synthesize',
                    choices: {},
                }),
                updatedAt: 3,
            },
            projection: evidence.projection,
            shell,
            go: vi.fn(async () => undefined),
            back: vi.fn(async () => undefined),
        });

        const activity = current!.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`)!;
        expect(current!.querySelector<HTMLElement>('[data-story-arc-id]')?.dataset.storyArcId).toBe(arc.id);
        expect(activity.dataset.activityGate).toBe('passed');
        expect(activity.querySelector('[data-story-practice-option]')).toBeNull();
        activity.querySelector<HTMLButtonElement>('.academy-story-activity-continue')!.click();
        expect(current!.querySelector(`[data-activity-id="${activityId}"]`)).toBeNull();
        expect(await evidence.history()).toEqual(historyBeforeContinue);

        const outcomes = historyBeforeContinue.flatMap(event =>
            event.kind === 'learning-evidence-recorded' && event.activityId === activityId ? [event.outcome] : []);
        expect(outcomes).toEqual(['pass', 'lapse']);
    });
});

function finishScene(screen: HTMLElement): void {
    for (let index = 0; index < 48; index += 1) {
        const next = screen.querySelector<HTMLButtonElement>('.academy-story-next');
        if (next) return;
        const advance = screen.querySelector<HTMLButtonElement>(
            '.academy-vn-primary-action, .academy-story-activity-continue',
        );
        if (!advance) throw new Error('Expected a playable story advance action.');
        advance.click();
    }
    throw new Error('Story scene did not reach its checkpoint.');
}
