import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    createStoryVoicePlayback,
    parseStoryVoicePlaybackCatalog,
    type StoryVoiceMedia,
} from '../../src/academy/audio/voice-lines';
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
        ), { openingArcMode: 'canonical', onSceneEncounter });

        advance(screen);
        screen.querySelector<HTMLButtonElement>('.academy-story-activity-story-only')?.click();
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

    it('opens later authored episodes through the same playable VN surface', () => {
        const { screen } = render('s1e12-the-vanishing-course');
        expect(screen.querySelector('[data-story-arc-id="arc:s1e12-the-vanishing-course"]')).not.toBeNull();
        expect(screen.textContent).not.toContain('full authored scene pending');
        expect(screen.querySelector('.academy-vn-stage')).not.toBeNull();
    });

    it('reaches a shipped exact pilot through the real StoryScreen and replays it', async () => {
        const catalog = parseStoryVoicePlaybackCatalog(JSON.parse(readFileSync(resolve(
            import.meta.dirname,
            '../../public/academy/audio/story-voice-playback.json',
        ), 'utf8')));
        const pilot = catalog.entries.find(entry => entry.lineId === 'line:margin-map:henry-presents')!;
        const media: StoryScreenVoiceMedia[] = [];
        const releases: ReturnType<typeof vi.fn>[] = [];
        const director = {
            state: 'ready' as const,
            settings: {
                muted: false,
                volumes: { music: 0.7, ambience: 0.6, lesson: 0.65, sfx: 0.8 },
            },
            beginExternalLesson: vi.fn(() => {
                const release = vi.fn();
                releases.push(release);
                return release;
            }),
            onEvent: vi.fn(() => () => undefined),
        };
        const createVoicePlayback = vi.fn(() => createStoryVoicePlayback({
            director,
            catalog,
            createMedia: url => {
                const element = new StoryScreenVoiceMedia(url);
                media.push(element);
                return element;
            },
        }));
        const { screen } = render('s1e02-margin-map', { selectedBand: 'n5', createVoicePlayback });
        const stage = screen.querySelector<HTMLElement>('.academy-story-vn-stage')!;

        expect(createVoicePlayback).toHaveBeenCalledOnce();
        expect(stage.dataset.voiceAvailable).toBe('false');
        stage.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        advance(screen);
        await vi.waitFor(() => expect(media).toHaveLength(1));

        expect(stage.querySelector<HTMLElement>('.academy-vn-dialogue')?.dataset.line).toBe(pilot.lineId);
        expect(media[0]?.url).toBe(pilot.url);
        expect(media[0]?.play).toHaveBeenCalledOnce();
        expect(stage.dataset.voiceAvailable).toBe('true');
        expect(stage.dataset.voiceStatus).toBe('playing');

        media[0]?.emit('ended');
        expect(releases[0]).toHaveBeenCalledOnce();
        stage.querySelector<HTMLButtonElement>('.academy-vn-voice-replay')?.click();
        await vi.waitFor(() => expect(media).toHaveLength(2));
        expect(media[1]?.url).toBe(pilot.url);
        expect(media[1]?.play).toHaveBeenCalledOnce();

        screen.querySelector<HTMLElement>('.academy-story-authored-arc')
            ?.dispatchEvent(new Event('academy:dispose'));
        expect(media[1]?.pause).toHaveBeenCalledOnce();
        expect(releases[1]).toHaveBeenCalledOnce();
    });

    it('continues from Season 2 into the fully authored N3 season', async () => {
        const finale = render('s1e24-lanterns-return');
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
        expect(activity.querySelector('.academy-story-activity-story-only')).not.toBeNull();
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
        const { screen, actions } = render('s4e12-next-page');
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
        const pending = screen.querySelector<HTMLButtonElement>('.academy-story-activity-story-only');
        const completePractice = screen.querySelector<HTMLButtonElement>('.academy-story-activity-continue');
        const next = screen.querySelector<HTMLButtonElement>('.academy-vn-primary-action');
        const action = choice ?? pending ?? completePractice ?? next;
        if (!action) throw new Error(`Story stalled at ${screen.dataset.storyMoment ?? 'unknown moment'}.`);
        action.click();
        await Promise.resolve();
    }
    throw new Error('Story did not reach its completion action.');
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

class StoryScreenVoiceMedia implements StoryVoiceMedia {
    preload = '';
    volume = 1;
    currentTime = 0;
    readonly play = vi.fn(async () => undefined);
    readonly pause = vi.fn();
    private readonly listeners = new Map<'ended' | 'error', Set<EventListener>>();

    constructor(readonly url: string) {}

    addEventListener(type: 'ended' | 'error', listener: EventListener): void {
        const listeners = this.listeners.get(type) ?? new Set<EventListener>();
        listeners.add(listener);
        this.listeners.set(type, listeners);
    }

    removeEventListener(type: 'ended' | 'error', listener: EventListener): void {
        this.listeners.get(type)?.delete(listener);
    }

    emit(type: 'ended' | 'error'): void {
        const event = new Event(type);
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
}
