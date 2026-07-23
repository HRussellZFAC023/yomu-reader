import { createMemoryLearnerEventRepository, projectLearnerRecord } from '../../src/academy/domain/learner-record';
import { serializeStoryCursor } from '../../src/academy/content/story-runner';
import { loadStoryRuntime, STORY_OPENING_ARC_ID } from '../../src/academy/content/story-runtime';
import { storyPractice } from '../../src/academy/content/n3-story-practice';
import { storyReplayReviewSeed } from '../../src/academy/content/story-replay-catalog';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';
import type { AcademyCheckpoint } from '../../src/academy/persistence/indexeddb';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import type { AcademyShell } from '../../src/academy/ui/shell';

describe('World Story route', () => {
    it('keeps a new Lesson Zero learner in the canonical opening arc', async () => {
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const projection = projectLearnerRecord([{
            schemaVersion: 1,
            eventId: 'entry:lesson-zero',
            at: 1,
            kind: 'curriculum-entry-chosen',
            route: 'lesson-zero',
        }]);
        const sectionId = serializeStoryCursor({
            version: 1,
            arcId: STORY_OPENING_ARC_ID,
            sceneId: 'scene:blank-atlas:mission-sound',
            nodeId: 'activity-node:blank-atlas:sound-input',
            choices: { 'choice:blank-atlas:mission': 'option:blank-atlas:mission-sound' },
        });
        const flow = createWorldFlow({
            evidence: { history: async () => [] } as never,
            pronunciation: {} as never,
            audio: {} as never,
        });

        await flow.render('story', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'story',
                routeHistory: [{ route: 'campus' }],
                presentationMode: 'story',
                sectionId,
                updatedAt: 2,
            },
            projection,
            shell,
            go: vi.fn(async () => undefined),
            back: vi.fn(async () => undefined),
        });

        const arc = current!.querySelector<HTMLElement>('[data-story-arc-id]')!;
        const activity = current!.querySelector<HTMLElement>(
            '[data-activity-id="activity:lesson-zero-sound-input"]',
        )!;
        expect(arc.dataset.storyMode).toBe('canonical');
        expect(activity.dataset.activityGate).toBe('missing');
        expect(activity.querySelector('.academy-story-open-activity')).not.toBeNull();
        expect(activity.querySelector('.academy-story-activity-continue')).toBeNull();
    });

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
            audio: {
                state: 'ready',
                settings: { muted: true, volumes: { music: 1, ambience: 1, lesson: 1, sfx: 1 } },
                onEvent: () => () => undefined,
            } as never,
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
        finishEpisode(current!);
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

    it('commits the S4E02 evidence map through WorldFlow and reloads its persisted result without duplication', async () => {
        const activityId = 'activity:s4e02-map-of-claims-evidence-map';
        const harness = await createStoryRouteHarness();
        await harness.evidence.recordEncounter({
            encounterId: 'story:s4e01-return-address',
            sceneId: 'scene:return-address:bounded-reply',
            attendeeIds: ['peter'],
        });
        const arc = loadStoryRuntime().playableArc('s4e02-map-of-claims')!;
        const binding = arc.curriculum.activities.find(candidate => candidate.exerciseId === activityId)!;
        const activityCursor = serializeStoryCursor({
            version: 1,
            arcId: arc.id,
            sceneId: binding.sceneId,
            nodeId: binding.nodeId,
            choices: {},
        });
        harness.setSectionId(activityCursor);
        await harness.render();
        expect(harness.current.querySelector<HTMLElement>('[data-story-arc-id]')?.dataset.storyMode).toBe('canonical');
        let activity = harness.current.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`)!;
        activity.querySelector<HTMLButtonElement>('.academy-story-practice-submit')!.click();
        await vi.waitFor(async () => expect(storyPracticeOutcomes(await harness.evidence.history(), activityId)).toEqual(['lapse']));
        await vi.waitFor(() => expect(activity.querySelector<HTMLButtonElement>('.academy-story-practice-submit')!.disabled).toBe(false));

        const answers = {
            'route-added': ['letter', 'stated', 'according-letter'],
            'older-ink': ['paper', 'observed', 'paper-shows'],
            'first-contributor': ['none', 'unknown', 'still-unknown'],
        } as const;
        for (const [rowId, values] of Object.entries(answers)) {
            const selects = activity.querySelectorAll<HTMLSelectElement>(`[data-evidence-row="${rowId}"] select`);
            values.forEach((value, index) => { selects[index]!.value = value; });
        }
        activity.querySelector<HTMLButtonElement>('.academy-story-practice-submit')!.click();
        await vi.waitFor(async () => expect(storyPracticeOutcomes(await harness.evidence.history(), activityId)).toEqual(['lapse', 'pass']));
        expect(harness.current.querySelector(`[data-activity-id="${activityId}"]`)).toBeNull();

        const persisted = await harness.evidence.history();
        expect(persisted).toContainEqual(expect.objectContaining({
            kind: 'learning-evidence-recorded',
            activityId,
            modeId: 'authored-story-practice',
            skill: 'writing',
            action: 'produce',
            outcome: 'pass',
        }));
        expect(persisted.filter(event => event.kind === 'review-scheduled'
            && event.provenance.activity === activityId)).toEqual([
            expect.objectContaining({ provenance: expect.objectContaining({ response: 'evidence-map' }) }),
        ]);

        harness.setSectionId(activityCursor);
        await harness.render();
        activity = harness.current.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`)!;
        expect(activity.dataset.activityGate).toBe('passed');
        expect(activity.querySelector('[data-story-practice-interaction]')).toBeNull();
        expect(await harness.evidence.history()).toEqual(persisted);
    });

    it('records Mira once across a fresh S4E07 run, mid-line reload, post-event reload, and replay', async () => {
        const episodeId = 's4e07-journey-not-everyone-takes';
        const activityId = 'activity:s4e07-journey-not-everyone-takes-non-comparative-futures';
        const miraEncounterId = `story:${episodeId}:scene:scene:journey:non-comparative-futures`;
        const harness = await createStoryRouteHarness();
        await harness.evidence.recordEncounter({
            encounterId: 'story:s4e06-open-question',
            sceneId: 'scene:open-question:rehearsal',
            attendeeIds: ['alex'],
        });
        harness.setSectionId(episodeId);

        await harness.render();
        expect(harness.current.querySelector<HTMLElement>('[data-story-arc-id]')?.dataset.storyMode).toBe('canonical');
        advanceTo(harness.current, '[data-line="message:journey:mira-returns"]');
        await vi.waitFor(() => expect(harness.sectionId).toContain('story-run:v1:'));
        expect(storyPracticeOutcomes(await harness.evidence.history(), activityId)).toEqual([]);
        expect((await harness.evidence.history()).some(event => event.kind === 'characters-encountered'
            && event.encounterId === miraEncounterId)).toBe(false);

        await harness.render();
        expect(harness.current.querySelector<HTMLElement>('[data-story-arc-id]')?.dataset.storyMode).toBe('canonical');
        expect(harness.current.querySelector('[data-line="message:journey:mira-returns"]')).not.toBeNull();
        advanceTo(harness.current, `[data-activity-id="${activityId}"]`);
        expect(storyPracticeOutcomes(await harness.evidence.history(), activityId)).toEqual([]);

        const activity = harness.current.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`)!;
        const updates = {
            alex: '来月から日本で働く。',
            aakash: 'いつか撮り旅に行くかもしれない。',
            mira: 'ここに残って、来週火曜からまた始める。',
        };
        Object.entries(updates).forEach(([fieldId, value]) => {
            activity.querySelector<HTMLTextAreaElement>(`[data-story-written-field="${fieldId}"]`)!.value = value;
        });
        activity.querySelector<HTMLButtonElement>('.academy-story-practice-submit')!.click();
        await vi.waitFor(async () => expect(storyPracticeOutcomes(await harness.evidence.history(), activityId)).toEqual(['pass']));
        finishEpisode(harness.current);

        await vi.waitFor(async () => {
            const recorded = (await harness.evidence.history()).filter(event => event.kind === 'characters-encountered'
                && event.encounterId === miraEncounterId);
            expect(recorded).toEqual([
                expect.objectContaining({ attendeeIds: expect.arrayContaining(['alex', 'aakash', 'mira']) }),
            ]);
        });
        const afterIntroduction = await harness.evidence.history();
        expect(afterIntroduction.filter(event => event.kind === 'scene-completed'
            && event.sceneId === 'scene:journey:non-comparative-futures')).toHaveLength(1);
        expect(storyPracticeOutcomes(afterIntroduction, activityId)).toEqual(['pass']);
        expect(afterIntroduction.some(event => event.kind === 'characters-encountered'
            && event.encounterId === `story:${episodeId}`)).toBe(false);

        await harness.render();
        expect(harness.current.querySelector<HTMLElement>('[data-story-arc-id]')?.dataset.storyMode).toBe('canonical');
        finishEpisode(harness.current);
        expect(await harness.evidence.history()).toEqual(afterIntroduction);

        harness.current.querySelector<HTMLButtonElement>('.academy-story-next')!.click();
        await vi.waitFor(async () => expect((await harness.evidence.history()).some(event =>
            event.kind === 'characters-encountered' && event.encounterId === `story:${episodeId}`)).toBe(true));
        const beforeReplay = await harness.evidence.history();
        harness.setSectionId(episodeId);
        await harness.render();
        expect(harness.current.querySelector<HTMLElement>('[data-story-arc-id]')?.dataset.storyMode).toBe('chronological-replay');
        finishEpisode(harness.current);
        expect(await harness.evidence.history()).toEqual(beforeReplay);
    });
});

function finishEpisode(screen: HTMLElement): void {
    for (let index = 0; index < 96; index += 1) {
        const next = screen.querySelector<HTMLButtonElement>('.academy-story-next');
        if (next) return;
        const advance = screen.querySelector<HTMLButtonElement>('[data-story-option-id]')
            ?? screen.querySelector<HTMLButtonElement>(
            '.academy-vn-primary-action, .academy-story-activity-continue',
        );
        if (!advance) throw new Error('Expected a playable story advance action.');
        advance.click();
    }
    throw new Error('Story scene did not reach its checkpoint.');
}

function advanceTo(screen: HTMLElement, selector: string): void {
    for (let index = 0; index < 96; index += 1) {
        if (screen.querySelector(selector)) return;
        const advance = screen.querySelector<HTMLButtonElement>('[data-story-option-id]')
            ?? screen.querySelector<HTMLButtonElement>('.academy-vn-primary-action, .academy-story-activity-continue');
        if (!advance) throw new Error(`Story stalled before ${selector}.`);
        advance.click();
    }
    throw new Error(`Story did not reach ${selector}.`);
}

function storyPracticeOutcomes(
    events: readonly import('../../src/academy/domain/learner-record').LearnerEvent[],
    activityId: string,
): readonly ('pass' | 'lapse')[] {
    return events.flatMap(event => event.kind === 'learning-evidence-recorded' && event.activityId === activityId
        ? [event.outcome]
        : []);
}

async function createStoryRouteHarness() {
    const repository = createMemoryLearnerEventRepository();
    const evidence = createLearnerEvidence(repository, {
        async ingest() {},
        async due() { return []; },
        async rate() {},
    });
    await evidence.initialize();
    let current: HTMLElement | undefined;
    let checkpoint: AcademyCheckpoint = {
        schemaVersion: 2,
        route: 'story',
        routeHistory: [{ route: 'campus' }],
        presentationMode: 'story',
        selectedBand: 'n1',
        updatedAt: 1,
    };
    const shell = {
        screen: document.createElement('main'),
        replace(view: HTMLElement) { current = view; },
        setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
        setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
    } satisfies AcademyShell;
    const flow = createWorldFlow({ evidence, pronunciation: {} as never, audio: {} as never });
    const save = vi.fn(async (update: Partial<AcademyCheckpoint>) => {
        checkpoint = { ...checkpoint, ...update, updatedAt: checkpoint.updatedAt + 1 };
    });
    const go = vi.fn(async (_route: string, update: Partial<AcademyCheckpoint> = {}) => {
        checkpoint = { ...checkpoint, ...update, updatedAt: checkpoint.updatedAt + 1 };
    });

    return {
        evidence,
        get current() {
            if (!current) throw new Error('Story route has not rendered.');
            return current;
        },
        get sectionId() { return checkpoint.sectionId; },
        setSectionId(sectionId: string) {
            checkpoint = { ...checkpoint, sectionId, updatedAt: checkpoint.updatedAt + 1 };
        },
        async render() {
            await flow.render('story', {
                language: 'en',
                checkpoint,
                projection: evidence.projection,
                shell,
                go: go as never,
                back: vi.fn(async () => undefined),
                save: save as never,
            });
        },
    };
}
