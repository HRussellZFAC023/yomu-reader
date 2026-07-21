import {
    STORY_OPENING_ARC_ID,
    loadStoryRuntime,
    STORY_REVIEW_CALENDAR_SECTION,
    type StoryArcScene,
    type StoryPlayableArc,
    type StoryRuntime,
} from '../../src/academy/content/story-runtime';
import { serializeStoryCursor, type StoryCursor } from '../../src/academy/content/story-runner';
import { renderStoryScreen } from '../../src/academy/ui/story-screen';

function render(sectionId?: string, overrides: Partial<Parameters<typeof renderStoryScreen>[0]> = {}) {
    const actions = {
        onOpenEpisode: vi.fn(),
        onOpenReviewCalendar: vi.fn(),
        onBack: vi.fn(),
        onReturnToEpisodes: vi.fn(),
        ...overrides,
    };
    return {
        screen: renderStoryScreen({ language: 'en', story: loadStoryRuntime(), sectionId, ...actions }),
        actions,
    };
}

function cursor(sceneId: string, nodeId: string, choices: Readonly<Record<string, string>> = {}): string {
    return serializeStoryCursor({
        version: 1,
        arcId: STORY_OPENING_ARC_ID,
        sceneId,
        nodeId,
        choices,
    } satisfies StoryCursor);
}

function episodeCursor(
    episodeId: string,
    sceneId: string,
    nodeId: string,
    choices: Readonly<Record<string, string>> = {},
): string {
    const arc = loadStoryRuntime().playableArc(episodeId);
    if (!arc) throw new Error(`Missing story arc ${episodeId}.`);
    return serializeStoryCursor({ version: 1, arcId: arc.id, sceneId, nodeId, choices });
}

describe('Academy Story screen', () => {
    it('opens the complete episode list and distinguishes the authored first arc', () => {
        const { screen, actions } = render();
        expect(screen.querySelectorAll('[data-episode-id]')).toHaveLength(48);
        expect(screen.querySelector<HTMLElement>('[data-episode-id="s1e01-the-blank-atlas"]')?.dataset.storyFormat).toBe('authored-arc');
        screen.querySelector<HTMLButtonElement>('[data-episode-id="s1e01-the-blank-atlas"]')?.click();
        expect(actions.onOpenEpisode).toHaveBeenCalledWith('s1e01-the-blank-atlas');
        expect(screen.querySelector('[data-replay-stream="true"]')).not.toBeNull();
    });

    it('renders one VN beat at a time, including readable Japanese and a gated choice', () => {
        const { screen } = render('s1e01-the-blank-atlas');
        const arc = screen.querySelector<HTMLElement>('[data-story-arc-id="arc:open-doors:first-route"]')!;

        expect(arc.dataset.storyMode).toBe('chronological-replay');
        expect(arc.dataset.storyScene).toBe('scene:opening-arrival:gate');
        expect(arc.dataset.storyMoment).toBe('stage');
        expect(screen.querySelector('.academy-vn-stage')).not.toBeNull();
        advance(screen, 2);
        expect(arc.dataset.storyMoment).toBe('choice');
        expect(screen.querySelector('[data-story-option-id="option:opening-arrival:check-door"]')?.textContent)
            .toContain('日本語のクラスですか。');
    });

    it('uses the shared VN Back control and keeps one readings control for the opening arc', () => {
        const onBack = vi.fn();
        const { screen } = render('s1e01-the-blank-atlas', { onBack });

        expect(screen.querySelectorAll('.academy-vn-reading-toggle')).toHaveLength(1);
        expect(screen.querySelector('.academy-story-back')).toBeNull();
        screen.querySelector<HTMLButtonElement>('.academy-vn-back')?.click();
        expect(onBack).toHaveBeenCalledOnce();
    });

    it('uses the saved player name and selected cutout for learner dialogue', () => {
        const learnerStory = storyWithLearnerLine();
        const { screen } = render('s1e01-the-blank-atlas', {
            story: learnerStory,
            learner: { displayName: 'Mina', portraitId: 'quality-4' },
        });

        expect(screen.querySelector<HTMLElement>('[data-character="rie"]')?.dataset.performancePresence).toBe('active');
        advance(screen);

        const learner = screen.querySelector<HTMLElement>('[data-character="learner"]')!;
        const rie = screen.querySelector<HTMLElement>('[data-character="rie"]')!;
        expect(screen.querySelector('.academy-vn-speaker')?.textContent).toBe('Mina');
        expect(learner.dataset.position).toBe('right');
        expect(learner.dataset.displayName).toBe('Mina');
        expect(learner.querySelector('img')?.getAttribute('src')).toContain('quality-4');
        expect(learner.dataset.performancePresence).toBe('active');
        expect(learner.dataset.performanceColor).toBe('full');
        expect(rie.dataset.performancePresence).toBe('inactive');
        expect(rie.dataset.performanceColor).toBe('desaturated');
    });

    it('keeps the saved player cutout beside authored dialogue from another speaker', () => {
        const { screen } = render(cursor(
            'scene:opening-arrival:open-chair',
            'line:opening-arrival:rie-evening',
        ), {
            learner: { displayName: 'Mina', portraitId: 'quality-5' },
        });

        const learner = screen.querySelector<HTMLElement>('[data-character="learner"]')!;
        const rie = screen.querySelector<HTMLElement>('[data-character="rie"]')!;
        expect(screen.querySelector('.academy-vn-speaker')?.textContent).toBe('Rie-sensei');
        expect(learner.dataset.position).toBe('right');
        expect(learner.dataset.displayName).toBe('Mina');
        expect(learner.querySelector('img')?.getAttribute('src')).toContain('quality-5');
        expect(learner.dataset.performancePresence).toBe('inactive');
        expect(learner.dataset.performanceColor).toBe('desaturated');
        expect(rie.dataset.performancePresence).toBe('active');
        expect(rie.dataset.performanceColor).toBe('full');
    });

    it('selects only approved Rie performance cutouts for authored VN intents', () => {
        const beats = [
            ['scene:blank-atlas:sound-script-map', 'line:blank-atlas:rie-listen-first', 'determined', 'rie__determined-glasses__left-three-quarter'],
            ['scene:blank-atlas:classroom-survival', 'line:blank-atlas:rie-too-fast', 'sad-vulnerable', 'rie__sad-vulnerable-glasses__left-three-quarter'],
            ['scene:blank-atlas:close', 'line:blank-atlas:rie-recap', 'comedic', 'rie__comedic-glasses__right-three-quarter'],
        ] as const;

        for (const [sceneId, lineId, expression, assetStem] of beats) {
            const { screen } = render(cursor(sceneId, lineId));
            const picture = screen.querySelector<HTMLPictureElement>('[data-character="rie"] picture')!;
            expect(picture.dataset.expression).toBe(expression);
            expect(picture.querySelector('img')?.src).toContain(assetStem);
        }
    });

    it('hands an exact activity and resumable cursor to the Lesson 0 route', () => {
        const onOpenActivity = vi.fn();
        const { screen } = render(cursor(
            'scene:blank-atlas:arrival-greetings',
            'activity-node:blank-atlas:greet-rie',
        ), { onOpenActivity });
        const handoff = screen.querySelector<HTMLElement>('[data-activity-id="activity:lesson-zero-greet-rie"]')!;

        expect(handoff.dataset.lessonId).toBe('lesson:foundation-00');
        handoff.querySelector<HTMLButtonElement>('.academy-story-open-activity')?.click();
        expect(onOpenActivity).toHaveBeenCalledWith(
            'lesson:foundation-00',
            'activity:lesson-zero-greet-rie',
            expect.objectContaining({ sceneId: 'scene:blank-atlas:arrival-greetings' }),
        );
    });

    it('keeps the selected mission consequential and opens its exact activity', () => {
        const { screen } = render(cursor(
            'scene:blank-atlas:useful-vocabulary',
            'choice:blank-atlas:mission',
        ));

        screen.querySelector<HTMLButtonElement>('[data-story-option-id="option:blank-atlas:mission-text"]')?.click();
        expect(screen.querySelector('[data-story-scene="scene:blank-atlas:mission-text"]')).not.toBeNull();
        advanceTo(screen, '[data-activity-id="activity:lesson-zero-text-input"]');
        expect(screen.querySelector('[data-activity-id="activity:lesson-zero-text-input"]')).not.toBeNull();
    });

    it('keeps the Text encounter in the library across its activity handoff', () => {
        const { screen } = render(cursor(
            'scene:blank-atlas:mission-text',
            'line:blank-atlas:sophie-two-gaps',
        ));
        const arc = screen.querySelector<HTMLElement>('[data-story-arc-id="arc:open-doors:first-route"]')!;
        const stage = screen.querySelector<HTMLElement>('.academy-story-vn-stage')!;

        expect(arc.dataset.currentPlace).toBe('library');
        expect(stage.dataset.currentPlace).toBe('library');
        expect(stage.dataset.locationId).toBe('location:library');
        advanceTo(screen, '[data-activity-id="activity:lesson-zero-text-input"]');
        expect(arc.dataset.currentPlace).toBe('library');
    });

    it('unlocks exactly Sophie and Ruparna when the Text encounter resolves', async () => {
        const onSceneEncounter = vi.fn(async () => undefined);
        const { screen } = render(cursor(
            'scene:blank-atlas:mission-text',
            'line:blank-atlas:sophie-two-gaps',
        ), {
            openingArcMode: 'canonical',
            onSceneEncounter,
            activityOutcomes: passedActivityOutcomes('s1e01-the-blank-atlas'),
        });

        advance(screen);
        screen.querySelector<HTMLButtonElement>('.academy-story-activity-continue')?.click();
        advance(screen);
        await vi.waitFor(() => expect(onSceneEncounter).toHaveBeenCalledWith(
            'scene:blank-atlas:mission-text', ['sophie', 'ruparna'],
        ));
        expect(onSceneEncounter).toHaveBeenCalledTimes(1);
    });

    it('records only actual canonical scene attendees and never writes them from replay', async () => {
        const onSceneEncounter = vi.fn(async () => undefined);
        const { screen } = render(cursor('scene:blank-atlas:close', 'line:blank-atlas:rie-recap'), {
            openingArcMode: 'canonical',
            onSceneEncounter,
            onCompleteEpisode: vi.fn(async () => undefined),
            activityOutcomes: passedActivityOutcomes('s1e01-the-blank-atlas'),
        });

        advance(screen);
        screen.querySelector<HTMLButtonElement>('.academy-story-activity-continue')?.click();
        advance(screen);
        await vi.waitFor(() => expect(onSceneEncounter).toHaveBeenCalledWith(
            'scene:blank-atlas:close', ['rie'],
        ));

        const replay = render(cursor('scene:blank-atlas:close', 'line:blank-atlas:rie-recap'), {
            onSceneEncounter,
        });
        advance(replay.screen);
        replay.screen.querySelector<HTMLButtonElement>('.academy-story-activity-continue')?.click();
        advance(replay.screen);
        expect(onSceneEncounter).toHaveBeenCalledTimes(1);
    });

    it('opens later authored episodes through the same playable VN surface', () => {
        const { screen } = render('s1e12-the-vanishing-course');
        expect(screen.querySelector('[data-story-arc-id="arc:s1e12-the-vanishing-course"]')).not.toBeNull();
        expect(screen.textContent).not.toContain('full authored scene pending');
        expect(screen.querySelector('.academy-vn-stage')).not.toBeNull();
    });

    it('continues from Season 2 into the fully authored N3 season', async () => {
        const finale = render('s1e24-lanterns-return', {
            activityOutcomes: passedActivityOutcomes('s1e24-lanterns-return'),
        });
        await finishAuthoredArc(finale.screen);
        finale.screen.querySelector<HTMLButtonElement>('.academy-story-next')!.click();
        expect(finale.actions.onOpenReviewCalendar).not.toHaveBeenCalled();
        expect(finale.actions.onOpenEpisode).toHaveBeenCalledWith('s3e01-after-the-applause');
        const { screen } = render(STORY_REVIEW_CALENDAR_SECTION);
        expect(screen.querySelectorAll('[data-review-template-id]')).toHaveLength(7);
    });

    it('plays the first N3 chapter and keeps its not-yet-grounded practice honest', () => {
        const { screen } = render('s3e01-after-the-applause', { selectedBand: 'n3' });

        expect(screen.querySelector('[data-story-arc-id="arc:s3e01-after-the-applause"]')).not.toBeNull();
        advanceTo(screen, '[data-activity-id="activity:s3e01-after-the-applause-three-readings"]');
        const activity = screen.querySelector<HTMLElement>('[data-activity-id="activity:s3e01-after-the-applause-three-readings"]')!;
        expect(activity.dataset.lessonId).toBe('lesson:pending:s3e01-after-the-applause');
        expect(activity.dataset.activityRegistered).toBe('false');
        expect(activity.querySelector('.academy-story-open-activity')).toBeNull();
        expect(activity.textContent).toContain('Practice is being prepared.');
        expect(activity.querySelector('.academy-story-activity-story-only')).toBeNull();
        expect(activity.querySelector('.academy-story-activity-continue')).toBeNull();
    });

    it('renders and records every recovered Season 4 transfer through the story UI', async () => {
        const cases = [
            ['s4e04-three-true-versions', 'activity:s4e04-three-true-versions-synthesis', 'three-vantages'],
            ['s4e05-left-unsaid', 'activity:s4e05-left-unsaid-trim-the-line', 'stop-at-blank'],
            ['s4e06-open-question', 'activity:s4e06-open-question-reframe-premise', 'reframe-question'],
            ['s4e08-last-revision', 'activity:s4e08-last-revision-vivid-without-restoring', 'vivid-bounded'],
        ] as const;

        for (const [episodeId, activityId, correctOptionId] of cases) {
            const onCompleteStoryPractice = vi.fn(async () => undefined);
            const { screen } = render(episodeId, { selectedBand: 'n1', onCompleteStoryPractice });
            advanceTo(screen, `[data-activity-id="${activityId}"]`);
            const activity = screen.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`)!;

            expect(activity.dataset.activityRegistered, episodeId).toBe('true');
            expect(activity.querySelector('.academy-story-activity-story-only'), episodeId).toBeNull();
            const correct = activity.querySelector<HTMLButtonElement>(`[data-story-practice-option="${correctOptionId}"]`)!;
            const incorrect = [...activity.querySelectorAll<HTMLButtonElement>('[data-story-practice-option]')]
                .find(option => option !== correct)!;
            incorrect.click();
            await vi.waitFor(() => expect(onCompleteStoryPractice).toHaveBeenCalledWith(activityId, 'lapse'));
            await vi.waitFor(() => expect(correct.disabled).toBe(false));
            correct.click();
            await vi.waitFor(() => expect(onCompleteStoryPractice).toHaveBeenCalledWith(activityId, 'pass'));
        }
    });

    it('requires the learner to assemble the S4E02 evidence map before recording writing production', async () => {
        const activityId = 'activity:s4e02-map-of-claims-evidence-map';
        const onCompleteStoryPractice = vi.fn(async () => undefined);
        const { screen } = render('s4e02-map-of-claims', { selectedBand: 'n1', onCompleteStoryPractice });
        advanceTo(screen, `[data-activity-id="${activityId}"]`);
        const activity = screen.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`)!;

        expect(activity.querySelector('[data-story-practice-option]')).toBeNull();
        expect(activity.querySelectorAll('[data-evidence-row]')).toHaveLength(3);
        activity.querySelector<HTMLButtonElement>('.academy-story-practice-submit')!.click();
        await vi.waitFor(() => expect(onCompleteStoryPractice).toHaveBeenCalledWith(activityId, 'lapse'));
        await vi.waitFor(() => expect(activity.querySelector<HTMLButtonElement>('.academy-story-practice-submit')!.disabled).toBe(false));

        const answers = {
            'route-added': ['letter', 'stated', 'according-letter'],
            'older-ink': ['paper', 'observed', 'paper-shows'],
            'first-contributor': ['none', 'unknown', 'still-unknown'],
        } as const;
        for (const [rowId, values] of Object.entries(answers)) {
            const row = activity.querySelector<HTMLElement>(`[data-evidence-row="${rowId}"]`)!;
            [...row.querySelectorAll<HTMLSelectElement>('select')].forEach((select, index) => {
                select.value = values[index]!;
            });
        }
        activity.querySelector<HTMLButtonElement>('.academy-story-practice-submit')!.click();
        await vi.waitFor(() => expect(onCompleteStoryPractice).toHaveBeenLastCalledWith(activityId, 'pass'));
    });

    it('requires authored Japanese updates for S4E07 instead of inferring output from recognition', async () => {
        const activityId = 'activity:s4e07-journey-not-everyone-takes-non-comparative-futures';
        const onCompleteStoryPractice = vi.fn(async () => undefined);
        const { screen } = render('s4e07-journey-not-everyone-takes', { selectedBand: 'n1', onCompleteStoryPractice });
        advanceTo(screen, `[data-activity-id="${activityId}"]`);
        const activity = screen.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`)!;

        expect(activity.querySelector('[data-story-practice-option]')).toBeNull();
        expect(activity.querySelectorAll('[data-story-written-field]')).toHaveLength(3);
        const values = {
            alex: '来月から日本で働く。',
            aakash: 'いつか撮り旅に行くかもしれない。',
            mira: 'ここに残って、来週火曜からまた始める。',
        };
        for (const [fieldId, value] of Object.entries(values)) {
            activity.querySelector<HTMLTextAreaElement>(`[data-story-written-field="${fieldId}"]`)!.value = value;
        }
        activity.querySelector<HTMLButtonElement>('.academy-story-practice-submit')!.click();
        await vi.waitFor(() => expect(onCompleteStoryPractice).toHaveBeenCalledWith(activityId, 'pass'));
    });

    it('reloads on Mira\'s supported line and carries her into canonical attendee evidence', async () => {
        const episodeId = 's4e07-journey-not-everyone-takes';
        const activityId = 'activity:s4e07-journey-not-everyone-takes-non-comparative-futures';
        const onArcSceneEncounter = vi.fn(async () => undefined);
        const onCompleteStoryPractice = vi.fn(async () => undefined);
        const { screen } = render(episodeCursor(
            episodeId,
            'scene:journey:non-comparative-futures',
            'message:journey:mira-returns',
        ), {
            selectedBand: 'n1',
            arcModeForEpisode: () => 'canonical',
            activityOutcomes: { [activityId]: 'pass' },
            onArcSceneEncounter,
            onCompleteStoryPractice,
        });
        const arc = screen.querySelector<HTMLElement>('[data-story-arc-id]')!;

        expect(arc.dataset.storyArcId).toBe(`arc:${episodeId}`);
        expect(arc.dataset.storyScene).toBe('scene:journey:non-comparative-futures');
        expect(arc.dataset.storyMoment).toBe('line');
        expect(screen.textContent).toContain('同じチャットなのに、予定表はばらばらだね');

        advance(screen);
        expect(screen.textContent).toContain('二十分だけ復習をまた始める');
        advance(screen);
        expect(screen.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`)?.dataset.activityGate).toBe('passed');
        expect(screen.querySelector('[data-story-practice-option]')).toBeNull();
        screen.querySelector<HTMLButtonElement>('.academy-story-activity-continue')!.click();
        advance(screen, 3);

        await vi.waitFor(() => expect(onArcSceneEncounter).toHaveBeenCalledWith(
            episodeId,
            'scene:journey:non-comparative-futures',
            expect.arrayContaining(['aakash', 'mira', 'alex']),
        ));
        expect(onCompleteStoryPractice).not.toHaveBeenCalled();
    });

    it('continues a replay from existing passed evidence without forcing another inline attempt', () => {
        const episodeId = 's4e04-three-true-versions';
        const activityId = 'activity:s4e04-three-true-versions-synthesis';
        const onCompleteStoryPractice = vi.fn(async () => undefined);
        const { screen } = render(episodeCursor(
            episodeId,
            'scene:three-versions:one-synthesis',
            'activity-node:three-versions:synthesize',
        ), {
            arcModeForEpisode: () => 'chronological-replay',
            activityOutcomes: { [activityId]: 'pass' },
            onCompleteStoryPractice,
        });
        const activity = screen.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`)!;

        expect(activity.dataset.activityGate).toBe('passed');
        expect(activity.querySelector('[data-story-practice-option]')).toBeNull();
        activity.querySelector<HTMLButtonElement>('.academy-story-activity-continue')!.click();
        expect(screen.querySelector(`[data-activity-id="${activityId}"]`)).toBeNull();
        expect(onCompleteStoryPractice).not.toHaveBeenCalled();
    });

    it('continues a placement-equivalent replay without creating practice evidence', () => {
        const episodeId = 's4e05-left-unsaid';
        const activityId = 'activity:s4e05-left-unsaid-trim-the-line';
        const onCompleteStoryPractice = vi.fn(async () => undefined);
        const { screen } = render(episodeCursor(
            episodeId,
            'scene:left-unsaid:the-line-that-says-too-much',
            'activity-node:left-unsaid:trim-the-line',
        ), {
            arcModeForEpisode: () => 'chronological-replay',
            onCompleteStoryPractice,
        });
        const activity = screen.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`)!;

        expect(activity.dataset.activityGate).toBe('placement-equivalent');
        expect(activity.querySelector('[data-story-practice-option]')).toBeNull();
        activity.querySelector<HTMLButtonElement>('.academy-story-activity-continue')!.click();
        expect(screen.querySelector(`[data-activity-id="${activityId}"]`)).toBeNull();
        expect(onCompleteStoryPractice).not.toHaveBeenCalled();
    });

    it('renders the verified Season 3-4 event art instead of leaving generated files orphaned', () => {
        const cases = [
            ['s3e10-empty-microphone', 'event__empty-microphone-rehearsal__v001.png'],
            ['s4e08-last-revision', 'event__withheld-panel-handoff__v001.png'],
            ['s4e11-atlas-closes', 'event__atlas-finale-next-page__v001.png'],
        ] as const;

        for (const [episodeId, filename] of cases) {
            const { screen } = render(episodeId);
            const image = screen.querySelector<HTMLImageElement>('.academy-vn-plate img');
            expect(image?.getAttribute('src'), episodeId).toContain(`/academy/art/events/${filename}`);
        }
    });

    it('returns to the episode list only after the authored graduation chapter', async () => {
        const { screen, actions } = render('s4e12-next-page', {
            activityOutcomes: passedActivityOutcomes('s4e12-next-page'),
        });
        await finishAuthoredArc(screen);
        screen.querySelector<HTMLButtonElement>('.academy-story-next')!.click();

        expect(actions.onReturnToEpisodes).toHaveBeenCalledOnce();
        expect(actions.onOpenReviewCalendar).not.toHaveBeenCalled();
    });
});

function advance(screen: HTMLElement, count = 1): void {
    for (let index = 0; index < count; index += 1) {
        const button = screen.querySelector<HTMLButtonElement>('.academy-vn-primary-action');
        if (!button) throw new Error('Expected a VN advance action.');
        button.click();
    }
}

function advanceTo(screen: HTMLElement, selector: string): void {
    for (let index = 0; index < 40; index += 1) {
        if (screen.querySelector(selector)) return;
        const choice = screen.querySelector<HTMLButtonElement>('[data-story-option-id]');
        if (choice) choice.click();
        else advance(screen);
    }
    throw new Error(`Story did not reach ${selector}.`);
}

async function finishAuthoredArc(screen: HTMLElement): Promise<void> {
    for (let guard = 0; guard < 300; guard += 1) {
        if (screen.querySelector('.academy-story-next')) return;
        const choice = screen.querySelector<HTMLButtonElement>('[data-story-option-id]');
        const completePractice = screen.querySelector<HTMLButtonElement>('.academy-story-activity-continue');
        const next = screen.querySelector<HTMLButtonElement>('.academy-vn-primary-action');
        const action = choice ?? completePractice ?? next;
        if (!action) throw new Error(`Story stalled at ${screen.dataset.storyMoment ?? 'unknown moment'}.`);
        action.click();
        await Promise.resolve();
    }
    throw new Error('Story did not reach its completion action.');
}

function passedActivityOutcomes(episodeId: string): Readonly<Record<string, 'pass'>> {
    const arc = loadStoryRuntime().playableArc(episodeId);
    if (!arc) throw new Error(`Missing story arc ${episodeId}.`);
    return Object.fromEntries(arc.curriculum.activities.map(activity => [activity.exerciseId, 'pass' as const]));
}

function storyWithLearnerLine(): StoryRuntime {
    const story = loadStoryRuntime();
    const baseArc = story.openingArc;
    const baseScene = baseArc.scenes[0]!;
    const learnerScene = {
        ...baseScene,
        nodes: [
            {
                kind: 'line' as const,
                id: 'line:test:rie',
                speakerId: 'rie',
                variants: {
                    foundation: { japanese: 'こちらへどうぞ。', reading: 'こちらへどうぞ。', english: 'This way, please.' },
                },
            },
            {
                kind: 'line' as const,
                id: 'line:test:learner',
                speakerId: 'learner',
                variants: {
                    foundation: { japanese: 'ありがとうございます。', reading: 'ありがとうございます。', english: 'Thank you.' },
                },
            },
        ],
        exit: { checkpoint: true as const, next: null },
    } satisfies StoryArcScene;
    const arc: StoryPlayableArc = {
        ...baseArc,
        scenes: [learnerScene],
        firstSceneId: learnerScene.id,
        lastSceneId: learnerScene.id,
        scene: sceneId => sceneId === learnerScene.id ? learnerScene : undefined,
        nextScene: () => undefined,
    };
    return {
        ...story,
        openingArc: arc as StoryRuntime['openingArc'],
        playableArc: episodeId => episodeId === arc.episodeId ? arc : story.playableArc(episodeId),
    };
}
