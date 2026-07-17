import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { LearnerEvent, LearnerProfileSnapshot } from '../domain/learner-record';
import type { ReplayLanguageBand } from '../domain/story-replay-projection';
import {
    createStoryRunner,
    parseStoryCursor,
    resolveStoryBand,
    serializeStoryCursor,
    storySceneAttendeeIds,
    type StoryActivityOutcome,
    type StoryCursor,
    type StoryMoment,
} from '../content/story-runner';
import type {
    StoryArcScene,
    StoryEpisode,
    StoryOpeningArcMode,
    StoryPlayableArc,
    StoryRuntime,
} from '../content/story-runtime';
import { n3StoryPractice } from '../content/n3-story-practice';
import { STORY_REVIEW_CALENDAR_SECTION } from '../content/story-runtime';
import { ACADEMY_ASSETS } from '../assets';
import { canRenderAcademyCastPortrait, displayAcademyCastName } from '../domain/cast-registry';
import { backButton, element } from './dom';
import {
    createAcademyVnStage,
    type AcademyVnCastMember,
    type AcademyVnSlotContent,
    type AcademyVnStageOptions,
} from './vn-stage';
import { renderReplayStreamPanel } from './replay-stream-panel';

export interface StoryScreenOptions {
    readonly language: AcademyLanguage;
    readonly story: StoryRuntime;
    /** The saved player identity used when an authored line belongs to the learner. */
    readonly learner?: Pick<LearnerProfileSnapshot, 'displayName' | 'portraitId'>;
    readonly sectionId?: string;
    readonly onOpenEpisode: (episodeId: string) => void;
    readonly onCompleteEpisode?: (episodeId: string) => void | Promise<void>;
    readonly openingArcMode?: StoryOpeningArcMode;
    readonly arcModeForEpisode?: (episodeId: string) => StoryOpeningArcMode;
    readonly onOpenActivity?: (lessonId: string, activityId: string, cursor?: StoryCursor) => void;
    readonly onCheckpoint?: (cursor: StoryCursor) => void | Promise<void>;
    readonly onSceneEncounter?: (sceneId: string, attendeeIds: readonly string[]) => void | Promise<void>;
    readonly onArcSceneEncounter?: (episodeId: string, sceneId: string, attendeeIds: readonly string[]) => void | Promise<void>;
    readonly onCompleteStoryPractice?: (activityId: string, outcome: StoryActivityOutcome) => void | Promise<void>;
    readonly activityOutcomes?: Readonly<Record<string, StoryActivityOutcome>>;
    readonly selectedBand?: string;
    readonly audio?: AcademyVnStageOptions['audio'];
    readonly onOpenReviewCalendar: () => void;
    readonly onBack: () => void;
    readonly onReturnToEpisodes: () => void;
    readonly replayEvents?: readonly LearnerEvent[];
    readonly onOpenReplayChapter?: (chapterId: string, band: ReplayLanguageBand) => void;
    readonly onOpenReplayLesson?: (lessonId: string) => void;
}

export function renderStoryScreen(options: StoryScreenOptions): HTMLElement {
    const screen = element('section', 'academy-story-screen');
    screen.dataset.academyScreen = 'story';
    screen.dataset.academyRoute = 'story';
    screen.dataset.storySection = options.sectionId ?? 'episodes';

    if (options.sectionId === STORY_REVIEW_CALENDAR_SECTION) {
        screen.append(renderReviewCalendar(options));
        return screen;
    }
    const cursor = parseStoryCursor(options.sectionId);
    const episode = options.story.episode(cursor ? options.story.openingArc.episodeId : options.sectionId);
    screen.append(episode ? renderEpisode(options, episode) : renderEpisodeList(options));
    return screen;
}

function renderEpisodeList(options: StoryScreenOptions): HTMLElement {
    const story = options.story;
    const main = element('div', 'academy-story-content');
    const header = element('header', 'academy-story-header');
    header.append(
        textElement('p', 'academy-story-kicker', `${story.scope.sequenceStart} to ${story.scope.sequenceEnd}`),
        textElement('h1', 'academy-story-title', story.title),
        textElement('p', 'academy-story-disclaimer', story.disclaimer.message),
        textElement('p', 'academy-story-boundary', story.scope.finiteStoryRule),
    );
    const episodes = element('ol', 'academy-story-episode-list');
    for (const episode of story.episodes) {
        const item = element('li', 'academy-story-episode-item');
        const button = element('button', 'academy-story-episode-button');
        button.type = 'button';
        button.dataset.episodeId = episode.id;
        button.addEventListener('click', () => options.onOpenEpisode(episode.id));
        button.append(
            textElement('span', 'academy-story-episode-number', `Episode ${episode.ordinal}`),
            textElement('strong', 'academy-story-episode-title', episode.title),
            textElement('span', 'academy-story-episode-stage', episode.curriculum.milestone),
        );
        if (episode.id === story.openingArc.episodeId) {
            button.dataset.storyFormat = 'authored-arc';
            button.append(textElement('span', 'academy-story-episode-format', 'Playable first arc'));
        }
        item.append(button);
        episodes.append(item);
    }
    main.append(
        header,
        episodes,
        renderReplayStreamPanel({
            language: options.language,
            events: options.replayEvents ?? [],
            onOpenChapter: options.onOpenReplayChapter ?? (chapterId => options.onOpenEpisode(chapterId)),
            ...(options.onOpenReplayLesson ? { onOpenLesson: options.onOpenReplayLesson } : {}),
        }),
        navigationBack(options.language, 'academy-story-return', options.onBack),
    );
    return main;
}

function renderEpisode(options: StoryScreenOptions, episode: StoryEpisode): HTMLElement {
    const arc = options.story.playableArc(episode.id);
    if (arc) return renderPlayableArc(options, episode, arc);
    return renderEpisodeOutline(options, episode);
}

function renderPlayableArc(
    options: StoryScreenOptions,
    episode: StoryEpisode,
    arc: StoryPlayableArc,
): HTMLElement {
    const main = element('article', 'academy-story-authored-arc academy-story-vn-shell');
    const mode = options.arcModeForEpisode?.(episode.id) ?? (episode.id === options.story.openingArc.episodeId
        ? options.openingArcMode ?? 'chronological-replay'
        : 'canonical');
    main.dataset.storyArcId = arc.id;
    main.dataset.replayWrites = String(arc.replay.canonicalWrites);
    main.dataset.storyMode = mode;

    const runner = createStoryRunner({
        arc,
        band: resolveStoryBand(options.selectedBand),
        activityOutcomes: options.activityOutcomes,
        placementEquivalent: mode === 'chronological-replay',
        cursor: parseStoryCursor(options.sectionId),
    });
    const stage = createAcademyVnStage({
        label: arc.title,
        uiLanguage: options.language,
        audio: options.audio,
        onBack: options.onBack,
    });
    stage.element.classList.add('academy-story-vn-stage');
    stage.element.dataset.storyEpisode = episode.id;
    stage.element.dataset.storyReplay = String(mode === 'chronological-replay');

    const navigation = element('nav', 'academy-story-vn-navigation');
    navigation.setAttribute('aria-label', options.language === 'ja' ? '物語のナビゲーション' : 'Story navigation');
    const progress = element('p', 'academy-story-vn-progress');
    const list = actionButton(options.language === 'ja' ? 'エピソード' : 'Episodes', 'academy-story-list-return', options.onReturnToEpisodes);
    navigation.append(progress, list);

    let renderedSceneId = '';
    let disposed = false;
    const persist = (): void => { void options.onCheckpoint?.(runner.cursor); };
    const encounter = (scene: StoryArcScene): void => {
        if (mode !== 'canonical') return;
        const attendees = storySceneAttendeeIds(scene, runner.cursor.choices);
        if (!attendees.length) return;
        if (options.onArcSceneEncounter) void options.onArcSceneEncounter(episode.id, scene.id, attendees);
        else void options.onSceneEncounter?.(scene.id, attendees);
    };
    const transition = (action: () => StoryMoment): void => {
        const previousScene = runner.moment.scene;
        const next = action();
        if (next.scene.id !== previousScene.id || next.kind === 'complete') encounter(previousScene);
        persist();
        renderMoment(next);
    };
    const renderMoment = (moment: StoryMoment): void => {
        if (disposed) return;
        const currentPlace = storyCurrentPlace(moment.scene);
        main.dataset.storyScene = moment.scene.id;
        main.dataset.storyMoment = moment.kind;
        main.dataset.currentPlace = currentPlace;
        stage.element.dataset.currentPlace = currentPlace;
        stage.element.dataset.locationId = moment.scene.locationId;
        progress.textContent = storyProgressLabel(options.language, arc, moment.scene);
        if (renderedSceneId !== moment.scene.id) {
            renderedSceneId = moment.scene.id;
            stage.setDirection(directionForScene(moment.scene));
        }
        stage.setCast(playableStoryCast(options.language, moment, runner.cursor.choices, options.learner));

        if (moment.kind === 'line') {
            stage.setLine({
                id: moment.node.id,
                speakerId: moment.node.speakerId,
                speakerName: storySpeakerName(moment.node.speakerId, options.language, options.learner),
                japanese: moment.line.japanese,
                language: 'ja',
                reading: storyReadingControl(options.language),
                translation: moment.line.english,
                translationEarned: true,
            });
            stage.setAction(storyNextAction(options.language, () => transition(() => runner.advance())));
            return;
        }
        if (moment.kind === 'stage' || moment.kind === 'narration') {
            stage.setLine({
                id: moment.node.id,
                japanese: moment.node.description ?? moment.node.text?.[options.language] ?? '',
                language: options.language,
                reading: { ...storyReadingControl(options.language), available: false },
            });
            stage.setAction(storyNextAction(options.language, () => transition(() => runner.advance())));
            return;
        }
        if (moment.kind === 'choice') {
            stage.setLine({
                id: moment.node.id,
                japanese: moment.node.question ?? (options.language === 'ja' ? 'どうしますか。' : 'What will you do?'),
                language: options.language,
                reading: { ...storyReadingControl(options.language), available: false },
            });
            stage.setAction(playableChoiceAction(moment, optionId => transition(() => runner.choose(optionId))));
            return;
        }
        if (moment.kind === 'activity') {
            stage.setLine({
                id: moment.node.id,
                japanese: moment.node.resumeContext ?? (options.language === 'ja'
                    ? '登録された練習に進みます。'
                    : 'Open the registered practice, then return here.'),
                language: options.language,
                reading: { ...storyReadingControl(options.language), available: false },
            });
            const practice = n3StoryPractice(moment.binding.exerciseId);
            if (practice && options.onCompleteStoryPractice) {
                stage.setAction(playableN3PracticeAction(options, practice, async outcome => {
                    await options.onCompleteStoryPractice?.(practice.activityId, outcome);
                    runner.updateActivityOutcomes({ [practice.activityId]: outcome });
                    if (outcome === 'pass') transition(() => runner.advance());
                    else renderMoment(runner.moment);
                }));
                return;
            }
            stage.setAction(playableActivityAction(options, arc, moment, runner.cursor, {
                open() {
                    persist();
                    options.onOpenActivity?.(moment.binding.lessonId, moment.binding.exerciseId, runner.cursor);
                },
                continue() { transition(() => runner.advance()); },
                storyOnly() { transition(() => runner.continueStoryOnly()); },
            }));
            return;
        }
        if (moment.kind !== 'complete') return;
        stage.setLine({
            id: 'story:opening-complete',
            speakerId: 'rie',
            speakerName: displayAcademyCastName('rie', options.language),
            japanese: options.language === 'ja' ? '最初の道ができました。' : 'The first route is restored.',
            language: options.language,
            reading: { ...storyReadingControl(options.language), available: options.language === 'ja' },
            translation: options.language === 'ja' ? 'The first route is restored.' : undefined,
            translationEarned: options.language === 'ja',
        });
        stage.setAction(playableCompleteAction(options, episode, moment.completionEligible, mode));
    };

    main.append(stage.element, navigation);
    main.addEventListener('academy:dispose', () => {
        disposed = true;
        stage.dispose();
    }, { once: true });
    renderMoment(runner.moment);
    return main;
}

function playableChoiceAction(
    moment: Extract<StoryMoment, { kind: 'choice' }>,
    onChoose: (optionId: string) => void,
): AcademyVnSlotContent {
    const fieldset = element('fieldset', 'academy-story-vn-choices');
    fieldset.dataset.storyChoiceId = moment.node.id;
    fieldset.append(textElement('legend', 'academy-visually-hidden', moment.node.question ?? 'Story choice'));
    moment.options.forEach(option => {
        const button = element('button', 'academy-story-vn-choice');
        button.type = 'button';
        button.dataset.storyOptionId = option.id;
        button.append(
            languageElement('span', 'academy-story-choice-japanese', option.japanese, 'ja'),
            textElement('span', 'academy-story-choice-action', option.action),
        );
        button.addEventListener('click', () => onChoose(option.id), { once: true });
        fieldset.append(button);
    });
    return { element: fieldset };
}

function playableActivityAction(
    options: StoryScreenOptions,
    arc: StoryPlayableArc,
    moment: Extract<StoryMoment, { kind: 'activity' }>,
    cursor: StoryCursor,
    actions: Readonly<{ open: () => void; continue: () => void; storyOnly: () => void }>,
): AcademyVnSlotContent {
    const root = element('section', 'academy-story-vn-activity');
    root.dataset.activityId = moment.binding.exerciseId;
    root.dataset.lessonId = moment.binding.lessonId;
    if (arc.curriculum.contentSha256) root.dataset.sourceSha256 = arc.curriculum.contentSha256;
    root.dataset.activityGate = moment.gate;
    root.append(
        textElement('strong', 'academy-story-activity-kind', `${capitalize(moment.binding.componentType)} · Lesson 0`),
        textElement('span', 'academy-story-activity-id', moment.binding.exerciseId),
        textElement('p', 'academy-story-activity-state', activityGateLabel(options.language, moment.gate)),
    );
    const controls = element('div', 'academy-story-vn-activity-actions');
    if (options.onOpenActivity) {
        const open = actionButton(options.language === 'ja' ? '練習を開く' : 'Open practice', 'academy-story-open-activity', actions.open);
        open.dataset.storyCursor = serializeStoryCursor(cursor);
        controls.append(open);
    }
    if (moment.gate === 'passed' || moment.gate === 'placement-equivalent' || moment.gate === 'story-only') {
        controls.append(actionButton(options.language === 'ja' ? '物語を続ける' : 'Continue story', 'academy-story-activity-continue', actions.continue));
    } else {
        controls.append(actionButton(
            options.language === 'ja' ? '単位を付けずに続ける' : 'Continue without practice credit',
            'academy-story-activity-story-only',
            actions.storyOnly,
        ));
    }
    root.append(controls);
    return { element: root };
}

function playableN3PracticeAction(
    options: StoryScreenOptions,
    practice: NonNullable<ReturnType<typeof n3StoryPractice>>,
    onComplete: (outcome: StoryActivityOutcome) => Promise<void>,
): AcademyVnSlotContent {
    const root = element('section', 'academy-story-vn-activity academy-story-n3-practice');
    root.dataset.activityId = practice.activityId;
    const prompt = textElement('p', 'academy-story-n3-prompt', practice.prompt[options.language]);
    prompt.lang = options.language === 'ja' ? 'ja' : 'en';
    const choices = element('div', 'academy-story-vn-activity-actions');
    const status = element('p', 'academy-story-activity-state');
    status.setAttribute('role', 'status');
    practice.options.forEach(option => {
        const button = actionButton(option.label[options.language], 'academy-story-n3-option', () => {
            choices.querySelectorAll<HTMLButtonElement>('button').forEach(control => { control.disabled = true; });
            const outcome: StoryActivityOutcome = option.id === practice.correctOptionId ? 'pass' : 'lapse';
            status.textContent = outcome === 'pass'
                ? options.language === 'ja' ? '記録しました。場面に戻ります。' : 'Recorded. Returning to the scene.'
                : practice.repair[options.language];
            void onComplete(outcome).catch(() => {
                status.textContent = options.language === 'ja' ? '記録できませんでした。もう一度試してください。' : 'Could not save this attempt. Try again.';
                choices.querySelectorAll<HTMLButtonElement>('button').forEach(control => { control.disabled = false; });
            });
        });
        button.dataset.storyPracticeOption = option.id;
        choices.append(button);
    });
    root.append(prompt, choices, status);
    return { element: root };
}

function playableCompleteAction(
    options: StoryScreenOptions,
    episode: StoryEpisode,
    completionEligible: boolean,
    mode: StoryOpeningArcMode,
): AcademyVnSlotContent {
    const root = element('div', 'academy-story-vn-complete');
    if (!completionEligible) {
        root.append(textElement('p', 'academy-story-vn-noncredit', options.language === 'ja'
            ? '物語は最後まで読みました。未完了の練習に単位は付きません。'
            : 'You reached the end of the story. Deferred practices remain uncredited.'));
    }
    const nextEpisode = options.story.episodes[episode.ordinal];
    const nextPlayable = nextEpisode && options.story.playableArc(nextEpisode.id) ? nextEpisode : undefined;
    const label = nextPlayable
        ? options.language === 'ja' ? `エピソード${nextPlayable.ordinal}へ` : `Continue to Episode ${nextPlayable.ordinal}`
        : options.language === 'ja' ? 'エピソード一覧へ' : 'Episode list';
    root.append(actionButton(label, 'academy-story-next', () => {
        const continueTo = () => nextPlayable ? options.onOpenEpisode(nextPlayable.id) : options.onReturnToEpisodes();
        if (mode !== 'canonical' || !completionEligible) {
            continueTo();
            return;
        }
        completeEpisode(options, episode.id, continueTo);
    }));
    return { element: root };
}

function storyNextAction(language: AcademyLanguage, onNext: () => void): AcademyVnSlotContent {
    return { element: actionButton(
        language === 'ja' ? '次へ' : 'Continue',
        'academy-vn-primary-action academy-story-node-next',
        onNext,
    ) };
}

function playableStoryCast(
    language: AcademyLanguage,
    moment: StoryMoment,
    choices: Readonly<Record<string, string>>,
    learner: StoryScreenOptions['learner'],
): readonly AcademyVnCastMember[] {
    const hasRie = storySceneAttendeeIds(moment.scene, choices).includes('rie');
    const cast: AcademyVnCastMember[] = [];
    const expression = moment.kind === 'line' && moment.node.speakerId === 'rie'
        ? playableStoryExpression(moment)
        : 'neutral';
    if (hasRie && canRenderAcademyCastPortrait('rie', 'story-runtime')) {
        const performances = ACADEMY_ASSETS.characters.approvedPerformances.rie;
        cast.push({
            characterId: 'rie',
            displayName: displayAcademyCastName('rie', language),
            alt: displayAcademyCastName('rie', language),
            position: 'left',
            expression,
            expressions: {
                neutral: { still: performances.neutral },
                determined: { still: performances.determined },
                'sad-vulnerable': { still: performances['sad-vulnerable'] },
                comedic: { still: performances.comedic },
            },
        });
    }
    if (moment.kind === 'line') {
        cast.push(learnerStoryCastMember(language, learner));
    }
    return cast;
}

function storySpeakerName(
    speakerId: string | undefined,
    language: AcademyLanguage,
    learner: StoryScreenOptions['learner'],
): string | undefined {
    if (!speakerId) return undefined;
    return speakerId === 'learner'
        ? learnerDisplayName(language, learner)
        : displayAcademyCastName(speakerId, language);
}

function learnerStoryCastMember(
    language: AcademyLanguage,
    learner: StoryScreenOptions['learner'],
): AcademyVnCastMember {
    const portraits = ACADEMY_ASSETS.portraits as Readonly<Record<string, string>>;
    const still = learner?.portraitId ? portraits[learner.portraitId] : undefined;
    const source = { still: still ?? ACADEMY_ASSETS.portraits['quality-2'] };
    const displayName = learnerDisplayName(language, learner);
    return {
        characterId: 'learner',
        displayName,
        alt: language === 'ja' ? `${displayName}の物語スプライト` : `${displayName}'s story sprite`,
        position: 'right',
        expression: 'neutral',
        expressions: { neutral: source, encouraging: source, happy: source, repair: source },
    };
}

function learnerDisplayName(language: AcademyLanguage, learner: StoryScreenOptions['learner']): string {
    return learner?.displayName.trim() || (language === 'ja' ? '学習者' : 'Learner');
}

function playableStoryExpression(moment: Extract<StoryMoment, { kind: 'line' }>): AcademyVnCastMember['expression'] {
    const text = `${moment.node.id} ${moment.node.intent ?? ''}`.toLowerCase();
    if (text.includes('thank') || text.includes('recognise') || text.includes('recap') || text.includes('close')) return 'comedic';
    if (text.includes('repair') || text.includes('repeat') || text.includes('repetition') || text.includes('too quickly')) {
        return 'sad-vulnerable';
    }
    if (text.includes('invite') || text.includes('encourag') || text.includes('listen')) return 'determined';
    return 'neutral';
}

function storyProgressLabel(language: AcademyLanguage, arc: StoryPlayableArc, scene: StoryArcScene): string {
    const index = arc.scenes.findIndex(candidate => candidate.id === scene.id) + 1;
    return language === 'ja' ? `${index} / ${arc.scenes.length}` : `Scene ${index} of ${arc.scenes.length}`;
}

function storyReadingControl(language: AcademyLanguage) {
    return language === 'ja'
        ? { showLabel: '読み方を表示', hideLabel: '読み方を隠す' }
        : { showLabel: 'Show readings', hideLabel: 'Hide readings' };
}

function activityGateLabel(
    language: AcademyLanguage,
    gate: Extract<StoryMoment, { kind: 'activity' }>['gate'],
): string {
    const labels = {
        passed: { en: 'Exact activity evidence found.', ja: 'この練習の学習記録があります。' },
        'placement-equivalent': { en: 'Placement preserves the story here; the activity remains uncredited.', ja: 'プレイスメントで物語を続けられます。練習の単位は付きません。' },
        lapse: { en: 'This exact activity needs another attempt.', ja: 'この練習をもう一度試してください。' },
        missing: { en: 'No evidence yet for this exact activity.', ja: 'この練習の学習記録はまだありません。' },
        'story-only': { en: 'Story-only continuation; no practice credit was written.', ja: '物語だけ続けています。練習の単位は付きません。' },
    } as const;
    return labels[gate][language];
}

function directionForScene(scene: StoryArcScene) {
    const plate = scene.locationId.includes('entrance')
        ? ACADEMY_ASSETS.locations.entrance
        : scene.locationId.includes('language-lab')
            ? ACADEMY_ASSETS.locations.languageLab
            : scene.locationId.includes('library')
                ? ACADEMY_ASSETS.locations.library
                : ACADEMY_ASSETS.locations.classroom;
    return {
        plate: {
            id: scene.locationId,
            wide: plate.wide,
            mobile: plate.mobile,
            label: scene.goal,
        },
        transition: 'dissolve' as const,
    };
}

/** Keep authored story beats inside the same spatial vocabulary as the world screen. */
function storyCurrentPlace(scene: StoryArcScene): 'courtyard' | 'classroom' | 'lab' | 'library' {
    if (scene.locationId.includes('language-lab')) return 'lab';
    if (scene.locationId.includes('library')) return 'library';
    if (scene.locationId.includes('campus-entrance')) return 'courtyard';
    return 'classroom';
}

function renderEpisodeOutline(options: StoryScreenOptions, episode: StoryEpisode): HTMLElement {
    const story = options.story;
    const main = element('article', 'academy-story-content academy-story-episode academy-story-outline');
    main.dataset.storyFormat = 'outline';
    const header = element('header', 'academy-story-header');
    header.append(
        textElement('p', 'academy-story-kicker', `Episode ${episode.ordinal} of ${story.scope.canonicalEpisodeCount} · ${episode.curriculum.stage}`),
        textElement('h1', 'academy-story-title', episode.title),
        textElement('p', 'academy-story-location', episode.location.label),
        textElement('p', 'academy-story-boundary', 'Story outline · full authored scene pending'),
    );
    const prose = element('div', 'academy-story-prose');
    prose.append(
        metadataSection('Story beat', episode.storyBeat),
        metadataSection('Emotional turn', episode.emotionalTurn),
    );
    if (episode.comedyBeat) prose.append(metadataSection('Comedy beat', episode.comedyBeat));

    const metadata = element('div', 'academy-story-metadata');
    metadata.append(
        listSection('Cast', story.castMembers(episode.cast).map(member => member.name), 'academy-story-cast'),
        listSection('Unlocks', story.castMembers(episode.unlocks).map(member => member.name)),
        listSection('Curriculum hooks', episode.curriculumHooks),
        listSection('Replay variants', episode.replayVariants.map(variant => `${variant.label}: ${variant.changes}`)),
        detailSection('Minigame', [
            ['ID', episode.minigame.id],
            ['Mechanic', episode.minigame.mechanic],
            ['Prompt', episode.minigame.prompt],
            ['Success', episode.minigame.success],
        ]),
        detailSection('Event art brief · not rendered', [
            ['Asset ID', episode.eventArt.id],
            ['Brief', episode.eventArt.brief],
            ['Safety', episode.eventArt.safety],
        ], 'academy-story-art-brief'),
    );

    const actions = element('nav', 'academy-story-actions');
    actions.setAttribute('aria-label', 'Episode navigation');
    actions.append(navigationBack(options.language, 'academy-story-back', options.onBack));
    const next = story.episodes[episode.ordinal];
    if (next) actions.append(actionButton('Next episode', 'academy-story-next', () => {
        completeEpisode(options, episode.id, () => options.onOpenEpisode(next.id));
    }));
    else if (episode.id === story.reviewCalendar.startsAfterEpisodeId) actions.append(actionButton('Open review calendar', 'academy-story-review-open', () => {
        completeEpisode(options, episode.id, options.onOpenReviewCalendar);
    }));
    else actions.append(textElement('p', 'academy-story-boundary', 'The next canonical chapter is not authored in this build. The postgame calendar remains closed until graduation.'));
    actions.append(actionButton('Episode list', 'academy-story-list-return', options.onReturnToEpisodes));
    main.append(header, prose, metadata, actions);
    return main;
}

function completeEpisode(
    options: StoryScreenOptions,
    episodeId: string,
    continueTo: () => void,
): void {
    try {
        const completion = options.onCompleteEpisode?.(episodeId);
        if (completion) {
            void completion.then(continueTo, () => undefined);
            return;
        }
        continueTo();
    } catch {
        // The route remains in the completed episode if local evidence cannot be saved.
    }
}

function renderReviewCalendar(options: StoryScreenOptions): HTMLElement {
    const calendar = options.story.reviewCalendar;
    const main = element('div', 'academy-story-content academy-story-calendar');
    const header = element('header', 'academy-story-header');
    header.append(
        textElement('p', 'academy-story-kicker', `After Episode ${options.story.scope.canonicalEpisodeCount}`),
        textElement('h1', 'academy-story-title', 'Lantern Atlas review calendar'),
        textElement('p', 'academy-story-disclaimer', calendar.purpose),
        textElement('p', 'academy-story-boundary', `${calendar.cycle.lengthDays}-day cycle · ${calendar.cycle.repeat}. ${calendar.dayTemplateRule}`),
    );
    const templates = element('ol', 'academy-story-template-list');
    for (const template of calendar.dayTemplates) {
        const item = element('li', 'academy-story-template');
        item.dataset.reviewTemplateId = template.id;
        item.append(
            textElement('span', 'academy-story-template-day', `Day ${template.dayOfCycle}`),
            textElement('h2', 'academy-story-template-mode', template.mode),
            textElement('p', '', template.episodeSelection),
            textElement('p', 'academy-story-template-remix', template.mechanicRemix),
        );
        templates.append(item);
    }
    main.append(
        header,
        templates,
        listSection('Continuity rules', calendar.continuityRules),
        renderReplayStreamPanel({
            language: options.language,
            events: options.replayEvents ?? [],
            onOpenChapter: options.onOpenReplayChapter ?? (chapterId => options.onOpenEpisode(chapterId)),
        }),
        navigationBack(options.language, 'academy-story-back', options.onBack),
    );
    return main;
}

function metadataSection(title: string, body: string): HTMLElement {
    const section = element('section', 'academy-story-beat');
    section.append(textElement('h2', '', title), textElement('p', '', body));
    return section;
}

function listSection(title: string, values: readonly string[], className = ''): HTMLElement {
    const section = element('section', `academy-story-meta-section ${className}`.trim());
    section.append(textElement('h2', '', title));
    const list = element('ul', 'academy-story-chip-list');
    values.forEach(value => list.append(textElement('li', '', value)));
    section.append(list);
    return section;
}

function detailSection(title: string, rows: readonly (readonly [string, string])[], className = ''): HTMLElement {
    const section = element('section', `academy-story-meta-section ${className}`.trim());
    section.append(textElement('h2', '', title));
    const details = element('dl', 'academy-story-details');
    rows.forEach(([term, description]) => details.append(textElement('dt', '', term), textElement('dd', '', description)));
    section.append(details);
    return section;
}

function actionButton(label: string, className: string, action: () => void): HTMLButtonElement {
    const button = element('button', `academy-button ${className}`);
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', action);
    return button;
}

function navigationBack(language: AcademyLanguage, className: string, action: () => void): HTMLButtonElement {
    const button = backButton(language);
    button.classList.add(className);
    button.addEventListener('click', action);
    return button;
}

function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    node.textContent = text;
    return node;
}

function languageElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text: string | undefined,
    language: 'en' | 'ja',
): HTMLElementTagNameMap[K] {
    const node = textElement(tag, className, text ?? '');
    node.lang = language;
    return node;
}

function capitalize(value: string): string {
    return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}
