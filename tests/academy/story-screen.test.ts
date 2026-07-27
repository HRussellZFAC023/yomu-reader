import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    createStoryVoicePlayback,
    parseStoryVoicePlaybackCatalog,
    type StoryVoiceMedia,
} from '../../src/academy/audio/voice-lines';
import {
    STORY_OPENING_ARC_ID,
    loadOpeningArrivalArc,
    loadStoryRuntime,
    STORY_REVIEW_CALENDAR_SECTION,
    type StoryArcScene,
    type StoryPlayableArc,
    type StoryRuntime,
} from '../../src/academy/content/story-runtime';
import { serializeStoryCursor, type StoryCursor } from '../../src/academy/content/story-runner';
import {
    gradeStoryPractice,
    storyPractice,
    type StoryPracticeResponse,
} from '../../src/academy/content/n3-story-practice';
import { renderStoryArcScreen, renderStoryScreen } from '../../src/academy/ui/story-screen';

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
    const arcId = sceneId.startsWith('scene:blank-atlas:')
        ? loadStoryRuntime().playableArc('s1e01-the-blank-atlas')!.id
        : STORY_OPENING_ARC_ID;
    return serializeStoryCursor({
        version: 1,
        arcId,
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

function storyPracticeRecorder() {
    return vi.fn(async (activityId: string, response: StoryPracticeResponse) => {
        const practice = storyPractice(activityId);
        if (!practice) throw new Error(`Missing story practice ${activityId}.`);
        return gradeStoryPractice(practice, response);
    });
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

    it('enters Chapter 1 after the welcome instead of replaying the arrival', () => {
        const { screen } = render('s1e01-the-blank-atlas');
        const arc = screen.querySelector<HTMLElement>('[data-story-arc-id="arc:s1e01-the-blank-atlas"]')!;

        expect(arc.dataset.storyMode).toBe('chronological-replay');
        expect(arc.dataset.storyScene).toBe('scene:blank-atlas:arrival-greetings');
        expect(arc.dataset.storyMoment).toBe('stage');
        expect(screen.querySelector('.academy-vn-stage')).not.toBeNull();
        expect(screen.textContent).not.toContain('日本語のクラスですか。');
    });

    it('keeps responsive opening art until the authored atlas reveal changes the room', () => {
        const opening = render('s1e01-the-blank-atlas').screen;
        const openingStage = opening.querySelector<HTMLElement>('.academy-vn-stage')!;
        const openingImage = opening.querySelector<HTMLImageElement>('.academy-vn-plate img')!;
        const openingMobile = opening.querySelector<HTMLSourceElement>('.academy-vn-plate source')!;

        expect(openingStage.dataset.storyArt).toBe('event.story.blank-atlas-arrival.covered-atlas');
        expect(openingImage.getAttribute('src')).toContain(
            'blank-atlas-arrival__covered-atlas-open-chair__wide__v001.webp',
        );
        expect(openingMobile.getAttribute('srcset')).toContain(
            'blank-atlas-arrival__covered-atlas-open-chair__mobile__v001.webp',
        );
        advance(opening);
        expect(openingStage.dataset.storyArt).toBe('event.story.blank-atlas-arrival.covered-atlas');

        const revealed = render(cursor(
            'scene:blank-atlas:arrival-greetings',
            'node:blank-atlas:first-uncover',
        )).screen;
        const revealedStage = revealed.querySelector<HTMLElement>('.academy-vn-stage')!;
        expect(revealedStage.dataset.storyArt).toBe('event.story.blank-atlas-arrival.atlas-uncovered');
        expect(revealed.querySelector<HTMLImageElement>('.academy-vn-plate img')?.getAttribute('src')).toContain(
            'blank-atlas-arrival__atlas-uncovered-unlit__wide__v001.webp',
        );
        expect(revealed.querySelector<HTMLSourceElement>('.academy-vn-plate source')?.getAttribute('srcset')).toContain(
            'blank-atlas-arrival__atlas-uncovered-unlit__mobile__v001.webp',
        );
    });

    it('changes the Text mission plate from two gaps to one focused repair', () => {
        const opening = render(cursor(
            'scene:blank-atlas:mission-text',
            'node:blank-atlas:text-note',
        )).screen;
        expect(opening.querySelector<HTMLElement>('.academy-vn-stage')?.dataset.storyArt)
            .toBe('event.story.blank-atlas-mission-text.two-gaps');
        expect(opening.querySelector<HTMLImageElement>('.academy-vn-plate img')?.src)
            .toContain('blank-atlas-mission-text__two-gaps__wide__v001.webp');
        expect(opening.querySelector<HTMLSourceElement>('.academy-vn-plate source')?.srcset)
            .toContain('blank-atlas-mission-text__two-gaps__mobile__v001.webp');

        const repair = render(cursor(
            'scene:blank-atlas:mission-text',
            'node:blank-atlas:text-input-repair',
        )).screen;
        expect(repair.querySelector<HTMLElement>('.academy-vn-stage')?.dataset.storyArt)
            .toBe('event.story.blank-atlas-mission-text.one-gap-repair');
        expect(repair.querySelector<HTMLImageElement>('.academy-vn-plate img')?.src)
            .toContain('blank-atlas-mission-text__one-gap-repair__wide__v001.webp');
        expect(repair.querySelector<HTMLSourceElement>('.academy-vn-plate source')?.srcset)
            .toContain('blank-atlas-mission-text__one-gap-repair__mobile__v001.webp');
    });

    it('opens the speaking route at the corridor threshold and keeps its repair in the same room', () => {
        const opening = render(cursor(
            'scene:blank-atlas:mission-speaking',
            'node:blank-atlas:speaking-door',
        )).screen;
        expect(opening.querySelector<HTMLElement>('.academy-vn-stage')?.dataset.storyArt)
            .toBe('event.story.blank-atlas-mission-speaking.door-waiting');
        expect(opening.querySelector<HTMLImageElement>('.academy-vn-plate img')?.src)
            .toContain('blank-atlas-mission-speaking__door-waiting__wide__v001.webp');
        expect(opening.querySelector<HTMLSourceElement>('.academy-vn-plate source')?.srcset)
            .toContain('blank-atlas-mission-speaking__door-waiting__mobile__v001.webp');

        const repair = render(cursor(
            'scene:blank-atlas:mission-speaking',
            'node:blank-atlas:speaking-input-repair',
        )).screen;
        expect(repair.querySelector<HTMLElement>('.academy-vn-stage')?.dataset.storyArt)
            .toBe('event.story.blank-atlas-mission-speaking.door-open-repair');
        expect(repair.querySelector<HTMLImageElement>('.academy-vn-plate img')?.src)
            .toContain('blank-atlas-mission-speaking__door-open-repair__wide__v001.webp');
        expect(repair.querySelector<HTMLSourceElement>('.academy-vn-plate source')?.srcset)
            .toContain('blank-atlas-mission-speaking__door-open-repair__mobile__v001.webp');
        expect(repair.querySelector<HTMLElement>('.academy-vn-speaker')?.textContent).toBe('Aakash-san');
        expect(repair.querySelector<HTMLElement>('.academy-vn-japanese')
            ?.getAttribute('data-yomu-academy-reading-source'))
            .toBe('お名前は何ですか。');
        expect(repair.querySelector<HTMLElement>('.academy-vn-japanese')?.lang).toBe('ja');
        expect(repair.querySelector<HTMLElement>('[data-character="aakash"]')).not.toBeNull();
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

    it('shows an approved classmate when their authored line is speaking', () => {
        const { screen } = render(cursor(
            'scene:blank-atlas:mission-sound',
            'line:blank-atlas:mika-sound-result',
        ), {
            learner: { displayName: 'Mina', portraitId: 'quality-5' },
        });

        const mika = screen.querySelector<HTMLElement>('[data-character="mika"]')!;
        const learner = screen.querySelector<HTMLElement>('[data-character="learner"]')!;
        expect(screen.querySelector('.academy-vn-speaker')?.textContent).toBe('Mika-san');
        expect(screen.querySelector('.academy-vn-stage')?.getAttribute('data-cast-size')).toBe('2');
        expect(mika.dataset.position).toBe('left');
        expect(mika.dataset.performancePresence).toBe('active');
        expect(mika.dataset.performanceColor).toBe('full');
        expect(mika.querySelector('img')?.getAttribute('src')).toContain(
            'mika__encouraging-listening-headphones__right-three-quarter__fullbody__v002.png',
        );
        expect(learner.dataset.position).toBe('right');
        expect(learner.dataset.performancePresence).toBe('inactive');
    });

    it('uses the canonical listening performance when Xingyu teaches the sound strategy', () => {
        const { screen } = render(cursor(
            'scene:blank-atlas:mission-sound',
            'line:blank-atlas:xingyu-sound-first',
        ));

        const xingyu = screen.querySelector<HTMLElement>('[data-character="xingyu"]')!;
        const picture = xingyu.querySelector<HTMLPictureElement>('picture')!;
        expect(picture.dataset.expression).toBe('encouraging');
        expect(picture.querySelector('img')?.getAttribute('src')).toContain(
            'xingyu__encouraging-listening-short-hair-round-glasses__right-three-quarter__fullbody__v002.png',
        );
    });

    it('uses Ruparna’s note-route performance when the Text mission resolves', () => {
        const { screen } = render(cursor(
            'scene:blank-atlas:mission-text',
            'line:blank-atlas:ruparna-note-route',
        ));

        const ruparna = screen.querySelector<HTMLElement>('[data-character="ruparna"]')!;
        const picture = ruparna.querySelector<HTMLPictureElement>('picture')!;
        expect(screen.querySelector('.academy-vn-speaker')?.textContent).toBe('Ruparna-san');
        expect(picture.dataset.expression).toBe('encouraging');
        expect(picture.querySelector('img')?.getAttribute('src')).toContain(
            'ruparna__note-route__right-three-quarter__halfbody__v002.png',
        );
    });

    it('uses Sam’s identity-locked listening performance for the recording choice', () => {
        const { screen } = render(cursor(
            'scene:blank-atlas:mission-speaking',
            'line:blank-atlas:sam-recording-boundary',
        ));

        const sam = screen.querySelector<HTMLElement>('[data-character="sam"]')!;
        const picture = sam.querySelector<HTMLPictureElement>('picture')!;
        expect(screen.querySelector('.academy-vn-speaker')?.textContent).toBe('Sam-san');
        expect(picture.dataset.expression).toBe('encouraging');
        expect(picture.querySelector('img')?.getAttribute('src')).toContain(
            'sam__standardized-encouraging-listening__front-near-front__halfbody__v001.png',
        );
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
        expect(screen.textContent).not.toContain('activity:lesson-zero-greet-rie');
        handoff.querySelector<HTMLButtonElement>('.academy-story-open-activity')?.click();
        expect(onOpenActivity).toHaveBeenCalledWith(
            'lesson:foundation-00',
            'activity:lesson-zero-greet-rie',
            expect.objectContaining({ sceneId: 'scene:blank-atlas:arrival-greetings' }),
        );
    });

    it('shows earned English support immediately for foundation dialogue', () => {
        const { screen } = render(cursor(
            'scene:blank-atlas:arrival-greetings',
            'line:blank-atlas:rie-konbanwa',
        ), { selectedBand: 'foundation' });

        const translation = screen.querySelector<HTMLElement>('.academy-vn-translation');
        expect(translation?.textContent).toBe("Good evening. Nice to meet you. I'm Rie.");
        expect(translation?.hidden).toBe(false);
        expect(screen.querySelector<HTMLElement>('.academy-vn-stage')?.dataset.translationSupport).toBe('shown');
    });

    it('mounts a distinct living prop for every Chapter 1 scene', () => {
        const scenes = [
            ['scene:blank-atlas:arrival-greetings', 'node:blank-atlas:covered-table', 'U001'],
            ['scene:blank-atlas:sound-script-map', 'node:blank-atlas:vowel-slots', 'U002'],
            ['scene:blank-atlas:classroom-survival', 'node:blank-atlas:handout-arrives', 'U003'],
            ['scene:blank-atlas:sentence-frames', 'node:blank-atlas:false-label', 'U004'],
            ['scene:blank-atlas:useful-vocabulary', 'node:blank-atlas:name-line', 'U005'],
            ['scene:blank-atlas:mission-sound', 'node:blank-atlas:sound-nameplates', 'U006'],
            ['scene:blank-atlas:mission-text', 'node:blank-atlas:text-note', 'U007'],
            ['scene:blank-atlas:mission-speaking', 'node:blank-atlas:speaking-door', 'U008'],
            ['scene:blank-atlas:reading-writing', 'node:blank-atlas:cards-return', 'U009'],
            ['scene:blank-atlas:transfer', 'node:blank-atlas:source-clears', 'U010'],
            ['scene:blank-atlas:close', 'node:blank-atlas:one-light-room', 'U011'],
        ] as const;

        for (const [sceneId, nodeId, signature] of scenes) {
            const { screen } = render(cursor(sceneId, nodeId));
            const prop = screen.querySelector<HTMLElement>('.academy-blank-atlas-prop');
            expect(prop?.dataset.sceneId, sceneId).toBe(sceneId);
            expect(prop?.dataset.sceneSignature, sceneId).toBe(signature);
        }
    });

    it('makes the note, door, and class card real one-time interactions', () => {
        const playSfx = vi.fn();
        const audio = { playSfx };
        const noteScreen = render(cursor('scene:blank-atlas:mission-text', 'node:blank-atlas:text-note'), { audio }).screen;
        const note = noteScreen.querySelector<HTMLElement>('.academy-text-mission-prop')!;
        note.querySelector<HTMLButtonElement>('.academy-note-inspect')?.click();
        expect(note.dataset.inspected).toBe('true');
        expect(note.textContent).toContain('Got it');
        expect(note.querySelector<HTMLButtonElement>('.academy-note-inspect')?.disabled).toBe(true);
        expect(note.querySelectorAll('.academy-note-context')).toHaveLength(4);

        const doorScreen = render(cursor('scene:blank-atlas:mission-speaking', 'node:blank-atlas:speaking-door'), { audio }).screen;
        const door = doorScreen.querySelector<HTMLElement>('.academy-speaking-door-prop')!;
        door.querySelector<HTMLButtonElement>('.academy-door-knocker')?.click();
        expect(door.dataset.open).toBe('true');
        expect(door.querySelector<HTMLElement>('.academy-door-nameplates')?.hidden).toBe(false);
        expect(door.textContent).toContain('Aakash');
        expect(door.textContent).toContain('Come in');
        expect(door.querySelector('.academy-door-knocker')).toBeNull();

        const samScreen = render(cursor(
            'scene:blank-atlas:mission-speaking',
            'line:blank-atlas:sam-recording-boundary',
        )).screen;
        expect(samScreen.querySelector('.academy-speaking-door-prop')).toBeNull();

        const faceDownScreen = render(cursor('scene:blank-atlas:reading-writing', 'node:blank-atlas:cards-return')).screen;
        expect(faceDownScreen.querySelector('.academy-card-flip')).toBeNull();

        const cardScreen = render(cursor('scene:blank-atlas:reading-writing', 'node:blank-atlas:card-turns-over'), {
            learner: { displayName: 'Mina', portraitId: 'quality-4' },
            audio,
        }).screen;
        const card = cardScreen.querySelector<HTMLElement>('.academy-public-card-prop')!;
        card.querySelector<HTMLButtonElement>('.academy-card-flip')?.click();
        expect(card.dataset.face).toBe('public');
        expect(card.textContent).toContain('Mina です。');
        expect(card.querySelector('.academy-card-flip')).toBeNull();
        expect(playSfx).toHaveBeenCalledTimes(3);
        expect(playSfx).toHaveBeenNthCalledWith(1, 'menu.confirm');
        expect(playSfx).toHaveBeenNthCalledWith(2, 'menu.confirm');
        expect(playSfx).toHaveBeenNthCalledWith(3, 'menu.confirm');
    });

    it('keeps the learner name card unfinished until they place です', () => {
        const learner = { displayName: 'Henry', portraitId: 'quality-4' as const };
        const opening = render(
            cursor('scene:blank-atlas:useful-vocabulary', 'node:blank-atlas:name-line'),
            { learner },
        ).screen.querySelector<HTMLElement>('.academy-name-card-prop')!;
        expect(opening.dataset.endingPlaced).toBe('false');
        expect(opening.querySelector('.academy-name-card-name')?.textContent).toBe('ヘンリー');
        expect(opening.querySelector('.academy-name-card-usual')?.textContent).toBe('Henry');
        expect(opening.querySelector('.academy-name-card-desu')?.textContent).toBe('');

        const repair = render(
            cursor('scene:blank-atlas:useful-vocabulary', 'node:blank-atlas:name-card-repair'),
            { learner },
        ).screen.querySelector<HTMLElement>('.academy-name-card-prop')!;
        expect(repair.dataset.endingPlaced).toBe('true');
        expect(repair.querySelector('.academy-name-card-desu')?.textContent).toBe('です。');
    });

    it('keeps the selected mission consequential and opens its exact activity', () => {
        const playSfx = vi.fn();
        const { screen } = render(cursor(
            'scene:blank-atlas:useful-vocabulary',
            'choice:blank-atlas:mission',
        ), { audio: { playSfx } });

        screen.querySelector<HTMLButtonElement>('[data-story-option-id="option:blank-atlas:mission-text"]')?.click();
        expect(playSfx).toHaveBeenCalledWith('menu.confirm');
        expect(screen.querySelector('[data-story-scene="scene:blank-atlas:mission-text"]')).not.toBeNull();
        advanceTo(screen, '[data-activity-id="activity:lesson-zero-text-input"]');
        expect(screen.querySelector('[data-activity-id="activity:lesson-zero-text-input"]')).not.toBeNull();
    });

    it('keeps the Text encounter in the library across its activity handoff', () => {
        const { screen } = render(cursor(
            'scene:blank-atlas:mission-text',
            'line:blank-atlas:sophie-two-gaps',
        ));
        const arc = screen.querySelector<HTMLElement>('[data-story-arc-id="arc:s1e01-the-blank-atlas"]')!;
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
            const onCompleteStoryPractice = storyPracticeRecorder();
            const playSfx = vi.fn();
            const { screen } = render(episodeId, {
                selectedBand: 'n1',
                onCompleteStoryPractice,
                audio: { playSfx },
            });
            advanceTo(screen, `[data-activity-id="${activityId}"]`);
            const activity = screen.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`)!;

            expect(activity.dataset.activityRegistered, episodeId).toBe('true');
            expect(activity.querySelector('.academy-story-activity-story-only'), episodeId).toBeNull();
            const correct = activity.querySelector<HTMLButtonElement>(`[data-story-practice-option="${correctOptionId}"]`)!;
            const incorrect = [...activity.querySelectorAll<HTMLButtonElement>('[data-story-practice-option]')]
                .find(option => option !== correct)!;
            incorrect.click();
            await vi.waitFor(() => expect(onCompleteStoryPractice).toHaveBeenCalledTimes(1));
            await vi.waitFor(() => expect(playSfx).toHaveBeenCalledWith('feedback.repair'));
            expect(onCompleteStoryPractice).toHaveBeenLastCalledWith(activityId, {
                interaction: 'choice',
                optionId: incorrect.dataset.storyPracticeOption,
            });
            await vi.waitFor(() => expect(correct.disabled).toBe(false));
            correct.click();
            await vi.waitFor(() => expect(onCompleteStoryPractice).toHaveBeenCalledTimes(2));
            await vi.waitFor(() => expect(playSfx).toHaveBeenCalledWith('feedback.correct'));
            expect(onCompleteStoryPractice).toHaveBeenLastCalledWith(activityId, {
                interaction: 'choice',
                optionId: correct.dataset.storyPracticeOption,
            });
        }
    });

    it('requires the learner to assemble the S4E02 evidence map before recording writing production', async () => {
        const activityId = 'activity:s4e02-map-of-claims-evidence-map';
        const onCompleteStoryPractice = storyPracticeRecorder();
        const { screen } = render('s4e02-map-of-claims', { selectedBand: 'n1', onCompleteStoryPractice });
        document.body.replaceChildren(screen);
        advanceTo(screen, `[data-activity-id="${activityId}"]`);
        const activity = screen.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`)!;

        expect(activity.querySelector('[data-story-practice-option]')).toBeNull();
        expect(activity.querySelectorAll('[data-evidence-row]')).toHaveLength(3);
        activity.querySelector<HTMLButtonElement>('.academy-story-practice-submit')!.click();
        await vi.waitFor(() => expect(onCompleteStoryPractice).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(activity.querySelector<HTMLButtonElement>('.academy-story-practice-submit')!.disabled).toBe(false));
        expect(activity.querySelectorAll('[aria-invalid="true"]')).toHaveLength(9);

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
        await vi.waitFor(() => expect(onCompleteStoryPractice).toHaveBeenCalledTimes(2));
        expect(onCompleteStoryPractice).toHaveBeenLastCalledWith(activityId, {
            interaction: 'evidence-map',
            rows: {
                'route-added': { source: 'letter', confidence: 'stated', hedge: 'according-letter' },
                'older-ink': { source: 'paper', confidence: 'observed', hedge: 'paper-shows' },
                'first-contributor': { source: 'none', confidence: 'unknown', hedge: 'still-unknown' },
            },
        });
    });

    it('requires authored Japanese updates for S4E07 instead of inferring output from recognition', async () => {
        const activityId = 'activity:s4e07-journey-not-everyone-takes-non-comparative-futures';
        const onCompleteStoryPractice = storyPracticeRecorder();
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
        await vi.waitFor(() => expect(onCompleteStoryPractice).toHaveBeenCalledTimes(1));
        expect(onCompleteStoryPractice).toHaveBeenLastCalledWith(activityId, {
            interaction: 'written-response',
            fields: values,
        });
    });

    it('continues a replay from existing passed evidence without forcing another inline attempt', () => {
        const episodeId = 's4e04-three-true-versions';
        const activityId = 'activity:s4e04-three-true-versions-synthesis';
        const onCompleteStoryPractice = storyPracticeRecorder();
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
        const onCompleteStoryPractice = storyPracticeRecorder();
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
        const playSfx = vi.fn();
        const { screen, actions } = render('s4e12-next-page', {
            activityOutcomes: passedActivityOutcomes('s4e12-next-page'),
            audio: { playSfx },
        });
        await finishAuthoredArc(screen);
        screen.querySelector<HTMLButtonElement>('.academy-story-next')!.click();

        expect(playSfx).toHaveBeenCalledWith('chapter.complete');
        expect(actions.onReturnToEpisodes).toHaveBeenCalledOnce();
        expect(actions.onOpenReviewCalendar).not.toHaveBeenCalled();
    });

    it('clears inactive portraits after the bounded arrival reaches its completion status', async () => {
        const screen = renderStoryArcScreen({
            language: 'en',
            arc: loadOpeningArrivalArc(),
            mode: 'canonical',
            finishLabel: 'Step into the courtyard',
            completionLine: {
                japanese: '教室で会いましょう。',
                english: 'See you in class.',
                speakerId: 'rie',
                speakerName: 'Rie-sensei',
            },
            onBack: vi.fn(),
            onFinish: vi.fn(),
        });

        await finishAuthoredArc(screen);

        expect(screen.querySelector('[data-story-moment="complete"]')).not.toBeNull();
        expect(screen.querySelectorAll('.academy-vn-sprite-slot')).toHaveLength(0);
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
