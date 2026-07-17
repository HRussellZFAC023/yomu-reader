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
        storyOnlyActivityIds: [],
    } satisfies StoryCursor);
}

describe('Academy Story screen', () => {
    it('opens the complete episode list and distinguishes the authored first arc', () => {
        const { screen, actions } = render();
        expect(screen.querySelectorAll('[data-episode-id]')).toHaveLength(30);
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
            ['scene:blank-atlas:classroom-survival', 'line:blank-atlas:rie-too-fast', 'sad-vulnerable', 'rie__sad-vulnerable__front-near-front'],
            ['scene:blank-atlas:close', 'line:blank-atlas:rie-recap', 'comedic', 'rie__comedic__right-three-quarter'],
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

    it('records only actual canonical scene attendees and never writes them from replay', async () => {
        const onSceneEncounter = vi.fn(async () => undefined);
        const { screen } = render(cursor('scene:blank-atlas:close', 'line:blank-atlas:rie-recap'), {
            openingArcMode: 'canonical',
            onSceneEncounter,
            onCompleteEpisode: vi.fn(async () => undefined),
        });

        advance(screen);
        screen.querySelector<HTMLButtonElement>('.academy-story-activity-story-only')?.click();
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

    it('keeps later unscripted episodes honest and records only explicit continuation', async () => {
        const completed = vi.fn(async () => undefined);
        const { screen, actions } = render('s1e12-the-vanishing-course', { onCompleteEpisode: completed });
        expect(screen.textContent).toContain('Story outline · full authored scene pending');
        expect(screen.querySelector('img')).toBeNull();
        screen.querySelector<HTMLButtonElement>('.academy-story-next')?.click();
        await vi.waitFor(() => expect(completed).toHaveBeenCalledWith('s1e12-the-vanishing-course'));
        await vi.waitFor(() => expect(actions.onOpenEpisode).toHaveBeenCalledWith('s1e13-dinner-by-if'));
    });

    it('continues from the legacy exhibition into N3 and keeps postgame closed after the authored batch', () => {
        const finale = render('s1e24-lanterns-return');
        finale.screen.querySelector<HTMLButtonElement>('.academy-story-next')?.click();
        expect(finale.actions.onOpenReviewCalendar).not.toHaveBeenCalled();
        expect(finale.actions.onOpenEpisode).toHaveBeenCalledWith('s3e01-after-the-applause');
        const batchEnd = render('s3e03-helpful-rewrite');
        expect(batchEnd.screen.querySelector('.academy-story-review-open')).toBeNull();
        const { screen } = render(STORY_REVIEW_CALENDAR_SECTION);
        expect(screen.querySelectorAll('[data-review-template-id]')).toHaveLength(7);
    });

    it('plays the first N3 chapter in the VN and records only its mapped deterministic practice', async () => {
        const onCompleteStoryPractice = vi.fn(async () => undefined);
        const { screen } = render('s3e01-after-the-applause', {
            selectedBand: 'n3',
            onCompleteStoryPractice,
        });

        expect(screen.querySelector('[data-story-arc-id="arc:s3e01-after-the-applause"]')).not.toBeNull();
        advance(screen, 3);
        const activity = screen.querySelector<HTMLElement>('[data-activity-id="activity:story-n3:after-applause-tone"]')!;
        activity.querySelector<HTMLButtonElement>('[data-story-practice-option="decision-open"]')?.click();
        await vi.waitFor(() => expect(onCompleteStoryPractice).toHaveBeenCalledWith(
            'activity:story-n3:after-applause-tone', 'pass',
        ));
        await vi.waitFor(() => expect(screen.querySelector('.academy-vn-primary-action')).not.toBeNull());
        advance(screen);
        expect(screen.querySelector('[data-story-option-id="option:after-applause:confirm-scope"]')).not.toBeNull();
    });

    it('returns to the episode list after the authored N3 batch instead of inventing a next VN chapter', async () => {
        const onCompleteStoryPractice = vi.fn(async () => undefined);
        const { screen, actions } = render('s3e06-two-schedules', { onCompleteStoryPractice });

        advance(screen, 3);
        screen.querySelector<HTMLButtonElement>('[data-story-practice-option="mark-pending"]')?.click();
        await vi.waitFor(() => expect(onCompleteStoryPractice).toHaveBeenCalledWith(
            'activity:story-n3:conditional-schedule', 'pass',
        ));
        await vi.waitFor(() => expect(screen.querySelector('.academy-vn-primary-action')).not.toBeNull());
        advance(screen);
        screen.querySelector<HTMLButtonElement>('[data-story-option-id="option:schedules:mark-pending"]')?.click();
        advance(screen);
        screen.querySelector<HTMLButtonElement>('.academy-story-next')?.click();

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
    for (let index = 0; index < 12; index += 1) {
        if (screen.querySelector(selector)) return;
        advance(screen);
    }
    throw new Error(`Story did not reach ${selector}.`);
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
