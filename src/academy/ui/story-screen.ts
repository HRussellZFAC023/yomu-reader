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
import {
    gradeStoryPractice,
    storyPracticeMistakeIds,
    storyPractice,
    type StoryEvidenceMapPractice,
    type StoryPractice,
    type StoryPracticeResponse,
    type StoryWrittenResponsePractice,
} from '../content/n3-story-practice';
import { STORY_REVIEW_CALENDAR_SECTION } from '../content/story-runtime';
import { ACADEMY_ASSETS } from '../assets';
import { resolveDirectorSfxCue, type AcademySemanticSfxCue } from '../audio/sfx-catalog';
import type { StoryVoicePlayback } from '../audio/voice-lines';
import { canRenderAcademyCastPortrait, displayAcademyCastName } from '../domain/cast-registry';
import { backButton, element } from './dom';
import {
    createAcademyVnStage,
    type AcademyVnCastMember,
    type AcademyVnSlotContent,
    type AcademyVnStageOptions,
} from './vn-stage';
import { renderReplayStreamPanel } from './replay-stream-panel';
import { blankAtlasSceneProp } from './blank-atlas-scene-props';

interface StoryPlaybackOptions {
    readonly language: AcademyLanguage;
    /** The saved player identity used when an authored line belongs to the learner. */
    readonly learner?: Pick<LearnerProfileSnapshot, 'displayName' | 'portraitId'>;
    readonly sectionId?: string;
    readonly onOpenActivity?: (lessonId: string, activityId: string, cursor?: StoryCursor) => void;
    readonly onCheckpoint?: (cursor: StoryCursor) => void | Promise<void>;
    readonly onSceneEncounter?: (sceneId: string, attendeeIds: readonly string[]) => void | Promise<void>;
    readonly onArcSceneEncounter?: (episodeId: string, sceneId: string, attendeeIds: readonly string[]) => void | Promise<void>;
    readonly onSceneChange?: (scene: StoryArcScene, previousScene?: StoryArcScene) => void;
    readonly onCompleteStoryPractice?: (
        activityId: string,
        response: StoryPracticeResponse,
    ) => StoryActivityOutcome | Promise<StoryActivityOutcome>;
    readonly activityOutcomes?: Readonly<Record<string, StoryActivityOutcome>>;
    readonly selectedBand?: string;
    readonly audio?: AcademyVnStageOptions['audio'];
    readonly createVoicePlayback?: () => StoryVoicePlayback;
    readonly onBack: () => void;
}

export interface StoryScreenOptions extends StoryPlaybackOptions {
    readonly story: StoryRuntime;
    readonly onOpenEpisode: (episodeId: string) => void;
    readonly onCompleteEpisode?: (episodeId: string) => void | Promise<void>;
    readonly openingArcMode?: StoryOpeningArcMode;
    readonly arcModeForEpisode?: (episodeId: string, cursor?: StoryCursor) => StoryOpeningArcMode;
    readonly onOpenReviewCalendar: () => void;
    readonly onReturnToEpisodes: () => void;
    readonly replayEvents?: readonly LearnerEvent[];
    readonly onOpenReplayChapter?: (chapterId: string, band: ReplayLanguageBand) => void;
    readonly onOpenReplayLesson?: (lessonId: string) => void;
}

export interface StoryArcScreenOptions extends StoryPlaybackOptions {
    readonly arc: StoryPlayableArc;
    readonly mode?: StoryOpeningArcMode;
    readonly finishLabel: string;
    readonly completionLine: Readonly<{
        japanese: string;
        english: string;
        speakerId?: string;
        speakerName?: string;
    }>;
    readonly onFinish: (completionEligible: boolean) => void | Promise<void>;
}

interface PlayableArcRenderOptions extends StoryPlaybackOptions {
    readonly mode: StoryOpeningArcMode;
    readonly finishLabel: string;
    readonly completionLine?: StoryArcScreenOptions['completionLine'];
    readonly onFinish: StoryArcScreenOptions['onFinish'];
    readonly onReturnToEpisodes?: () => void;
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
    const episode = options.story.episode(cursor ? episodeIdForCursor(options.story, cursor) : options.sectionId);
    const content = episode ? renderEpisode(options, episode) : renderEpisodeList(options);
    screen.append(content);
    screen.addEventListener('academy:dispose', () => {
        content.dispatchEvent(new CustomEvent('academy:dispose'));
    }, { once: true });
    return screen;
}

/** Render one bounded authored package without exposing the episode catalog around it. */
export function renderStoryArcScreen(options: StoryArcScreenOptions): HTMLElement {
    const screen = element('section', 'academy-story-screen academy-story-package-screen');
    screen.dataset.academyScreen = 'story-package';
    screen.dataset.storySection = options.sectionId ?? options.arc.episodeId;
    const content = renderPlayableArc({
        ...options,
        mode: options.mode ?? 'canonical',
    }, options.arc);
    screen.append(content);
    screen.addEventListener('academy:dispose', () => {
        content.dispatchEvent(new CustomEvent('academy:dispose'));
    }, { once: true });
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
    const cursor = parseStoryCursor(options.sectionId);
    // Old saves could address the arrival and Chapter 1 through one combined arc.
    // Keep the one-time arrival resumable, but a direct Chapter 1 entry must not
    // replay it after onboarding has already completed.
    const legacyArrival = episode.id === options.story.openingArc.episodeId
        && cursor?.arcId === options.story.openingArc.id
        && cursor.sceneId.startsWith('scene:opening-arrival:');
    const arc = legacyArrival ? options.story.openingArc : options.story.playableArc(episode.id);
    if (arc) {
        const compatibleCursor = !legacyArrival
            && cursor?.arcId === options.story.openingArc.id
            && arc.scene(cursor.sceneId)
            ? { ...cursor, arcId: arc.id }
            : cursor;
        const mode = options.arcModeForEpisode?.(episode.id, cursor) ?? (episode.id === options.story.openingArc.episodeId
            ? options.openingArcMode ?? 'chronological-replay'
            : 'canonical');
        const nextEpisode = options.story.episodes[episode.ordinal];
        const nextPlayable = nextEpisode && options.story.playableArc(nextEpisode.id) ? nextEpisode : undefined;
        const finishLabel = nextPlayable
            ? options.language === 'ja' ? `エピソード${nextPlayable.ordinal}へ` : `Continue to Episode ${nextPlayable.ordinal}`
            : options.language === 'ja' ? 'エピソード一覧へ' : 'Episode list';
        return renderPlayableArc({
            ...options,
            ...(compatibleCursor ? { sectionId: serializeStoryCursor(compatibleCursor) } : {}),
            mode,
            finishLabel,
            onReturnToEpisodes: options.onReturnToEpisodes,
            onFinish: completionEligible => {
                const continueTo = () => nextPlayable
                    ? options.onOpenEpisode(nextPlayable.id)
                    : options.onReturnToEpisodes();
                if (mode !== 'canonical' || !completionEligible) {
                    continueTo();
                    return;
                }
                completeEpisode(options, episode.id, continueTo);
            },
        }, arc);
    }
    return renderEpisodeOutline(options, episode);
}

function renderPlayableArc(
    options: PlayableArcRenderOptions,
    arc: StoryPlayableArc,
): HTMLElement {
    const main = element('article', 'academy-story-authored-arc academy-story-vn-shell');
    const savedCursor = parseStoryCursor(options.sectionId);
    const mode = options.mode;
    main.dataset.storyArcId = arc.id;
    main.dataset.replayWrites = String(arc.replay.canonicalWrites);
    main.dataset.storyMode = mode;

    const runner = createStoryRunner({
        arc,
        band: resolveStoryBand(options.selectedBand),
        activityOutcomes: options.activityOutcomes,
        placementEquivalent: mode === 'chronological-replay',
        cursor: savedCursor,
    });
    const stage = createAcademyVnStage({
        label: arc.title,
        uiLanguage: options.language,
        audio: options.audio,
        voice: options.createVoicePlayback?.(),
        onBack: options.onBack,
    });
    stage.element.classList.add('academy-story-vn-stage');
    stage.element.dataset.storyEpisode = arc.episodeId;
    stage.element.dataset.storyReplay = String(mode === 'chronological-replay');

    const navigation = element('nav', 'academy-story-vn-navigation');
    navigation.setAttribute('aria-label', options.language === 'ja' ? '物語のナビゲーション' : 'Story navigation');
    const progress = element('p', 'academy-story-vn-progress');
    navigation.append(progress);
    if (options.onReturnToEpisodes) {
        navigation.append(actionButton(
            options.language === 'ja' ? 'エピソード' : 'Episodes',
            'academy-story-list-return',
            options.onReturnToEpisodes,
        ));
    }

    let renderedSceneId = '';
    let disposed = false;
    const persist = (): void => { void options.onCheckpoint?.(runner.cursor); };
    const encounter = (scene: StoryArcScene): void => {
        if (mode !== 'canonical') return;
        const attendees = storySceneAttendeeIds(scene, runner.cursor.choices);
        if (!attendees.length) return;
        if (options.onArcSceneEncounter) void options.onArcSceneEncounter(arc.episodeId, scene.id, attendees);
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
        const previousScene = renderedSceneId ? arc.scene(renderedSceneId) : undefined;
        const sceneChanged = renderedSceneId !== moment.scene.id;
        const sceneEntrySfx: AcademySemanticSfxCue | undefined = sceneChanged
            && previousScene
            && previousScene.locationId !== moment.scene.locationId
            ? 'travel.transition'
            : undefined;
        main.dataset.storyScene = moment.scene.id;
        main.dataset.storyMoment = moment.kind;
        main.dataset.currentPlace = currentPlace;
        stage.element.dataset.currentPlace = currentPlace;
        stage.element.dataset.locationId = moment.scene.locationId;
        progress.textContent = storyProgressLabel(options.language, arc, moment.scene);
        if (sceneChanged) {
            renderedSceneId = moment.scene.id;
            options.onSceneChange?.(moment.scene, previousScene);
            stage.setDirection(directionForScene(moment.scene));
        }
        stage.setCast(playableStoryCast(options.language, moment, runner.cursor.choices, options.learner));
        stage.setObject(blankAtlasSceneProp({
            language: options.language,
            moment,
            cursor: runner.cursor,
            ...(options.learner ? { learner: options.learner } : {}),
            onSfx: cue => playStorySfx(options.audio, cue),
        }));

        switch (moment.kind) {
            case 'line':
                stage.setLine({
                    id: moment.node.id,
                    speakerId: moment.node.speakerId,
                    speakerName: storySpeakerName(moment.node.speakerId, options.language, options.learner),
                    japanese: moment.line.japanese,
                    language: 'ja',
                    reading: storyReadingControl(options.language),
                    translation: moment.line.english,
                    translationEarned: true,
                    translationVisible: options.language === 'en'
                        && resolveStoryBand(options.selectedBand) === 'foundation',
                    ...(moment.node.speakerId && moment.node.speakerId !== 'learner'
                        ? { voice: { band: moment.line.band } }
                        : {}),
                    ...(sceneEntrySfx ? { sfx: [sceneEntrySfx] } : {}),
                });
                stage.setAction(storyNextAction(options.language, () => transition(() => runner.advance())));
                return;
            case 'stage':
            case 'narration':
                stage.setLine({
                    id: moment.node.id,
                    japanese: moment.node.description ?? moment.node.text?.[options.language] ?? '',
                    language: options.language,
                    reading: { ...storyReadingControl(options.language), available: false },
                    ...(sceneEntrySfx ? { sfx: [sceneEntrySfx] } : {}),
                });
                stage.setAction(storyNextAction(options.language, () => transition(() => runner.advance())));
                return;
            case 'choice':
                stage.setLine({
                    id: moment.node.id,
                    japanese: moment.node.question ?? (options.language === 'ja' ? 'どうしますか。' : 'What will you do?'),
                    language: options.language,
                    reading: { ...storyReadingControl(options.language), available: false },
                    ...(sceneEntrySfx ? { sfx: [sceneEntrySfx] } : {}),
                });
                stage.setAction(playableChoiceAction(options, moment, optionId => transition(() => runner.choose(optionId))));
                return;
            case 'activity': {
                stage.setLine({
                    id: moment.node.id,
                    japanese: moment.node.resumeContext ?? (options.language === 'ja'
                        ? 'やってみてから、ここに戻りましょう。'
                        : 'Try this, then come back.'),
                    language: options.language,
                    reading: { ...storyReadingControl(options.language), available: false },
                    ...(sceneEntrySfx ? { sfx: [sceneEntrySfx] } : {}),
                });
                const practice = storyPractice(moment.binding.exerciseId);
                const inlinePractice = Boolean(practice && options.onCompleteStoryPractice);
                const gateSatisfied = moment.gate === 'passed' || moment.gate === 'placement-equivalent';
                if (practice && inlinePractice && !gateSatisfied) {
                    stage.setAction(playableStoryPracticeAction(options, practice, moment.gate, async response => {
                        const outcome = await options.onCompleteStoryPractice?.(practice.activityId, response);
                        if (!outcome) throw new Error(`Story practice ${practice.activityId} did not return an outcome.`);
                        runner.updateActivityOutcomes({ [practice.activityId]: outcome });
                        if (outcome === 'pass') transition(() => runner.advance());
                        return outcome;
                    }));
                    return;
                }
                stage.setAction(playableActivityAction(options, arc, moment, runner.cursor, {
                    ...(!inlinePractice && options.onOpenActivity ? { open() {
                        persist();
                        options.onOpenActivity?.(moment.binding.lessonId, moment.binding.exerciseId, runner.cursor);
                    } } : {}),
                    continue() { transition(() => runner.advance()); },
                }));
                return;
            }
            case 'complete':
                {
                    const completion = options.completionLine;
                stage.setLine({
                    id: 'story:opening-complete',
                    ...(completion?.speakerId ? { speakerId: completion.speakerId } : {}),
                    ...(completion?.speakerName ? { speakerName: completion.speakerName } : {}),
                    japanese: completion?.japanese ?? 'この章はここまでです。',
                    language: 'ja',
                    reading: storyReadingControl(options.language),
                    translation: completion?.english ?? 'This chapter is complete.',
                    translationEarned: true,
                    translationVisible: options.language === 'en',
                    ...(sceneEntrySfx ? { sfx: [sceneEntrySfx] } : {}),
                });
                stage.setAction(playableCompleteAction(options, moment.completionEligible));
                return;
                }
            default:
                return unsupportedStoryMoment(moment);
        }
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
    options: StoryPlaybackOptions,
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
        button.addEventListener('focus', () => playStorySfx(options.audio, 'vn.choice.move'));
        button.addEventListener('pointerenter', () => playStorySfx(options.audio, 'vn.choice.move'));
        button.addEventListener('click', () => {
            playStorySfx(options.audio, 'vn.choice.confirm');
            onChoose(option.id);
        }, { once: true });
        fieldset.append(button);
    });
    return { element: fieldset };
}

function playableActivityAction(
    options: StoryPlaybackOptions,
    arc: StoryPlayableArc,
    moment: Extract<StoryMoment, { kind: 'activity' }>,
    cursor: StoryCursor,
    actions: Readonly<{ open?: () => void; continue: () => void }>,
): AcademyVnSlotContent {
    const root = element('section', 'academy-story-vn-activity');
    root.dataset.activityId = moment.binding.exerciseId;
    root.dataset.lessonId = moment.binding.lessonId;
    root.dataset.activityRegistered = String(moment.binding.registered);
    if (arc.curriculum.contentSha256) root.dataset.sourceSha256 = arc.curriculum.contentSha256;
    root.dataset.activityGate = moment.gate;
    root.append(
        textElement('strong', 'academy-story-activity-kind', storyActivityLabel(
            options.language,
            moment.binding.componentType,
        )),
        textElement('p', 'academy-story-activity-state', moment.binding.registered
            ? activityGateLabel(options.language, moment.gate)
            : options.language === 'ja' ? '練習は準備中です。' : 'Practice is being prepared.'),
    );
    const controls = element('div', 'academy-story-vn-activity-actions');
    if (moment.binding.registered && actions.open) {
        const open = actionButton(options.language === 'ja' ? 'やってみる' : 'Try this step', 'academy-story-open-activity', actions.open);
        open.dataset.storyCursor = serializeStoryCursor(cursor);
        controls.append(open);
    }
    if (moment.gate === 'passed' || moment.gate === 'placement-equivalent') {
        controls.append(actionButton(options.language === 'ja' ? '教室に戻る' : 'Back to the room', 'academy-story-activity-continue', actions.continue));
    }
    root.append(controls);
    return { element: root };
}

function playableStoryPracticeAction(
    options: StoryPlaybackOptions,
    practice: StoryPractice,
    gate: Extract<StoryMoment, { kind: 'activity' }>['gate'],
    onComplete: (response: StoryPracticeResponse) => Promise<StoryActivityOutcome>,
): AcademyVnSlotContent {
    const root = element('section', 'academy-story-vn-activity academy-story-practice');
    root.dataset.activityId = practice.activityId;
    root.dataset.activityRegistered = 'true';
    root.dataset.activityGate = gate;
    const prompt = textElement('p', 'academy-story-practice-prompt', practice.prompt[options.language]);
    prompt.lang = options.language === 'ja' ? 'ja' : 'en';
    const status = element('p', 'academy-story-activity-state');
    status.setAttribute('role', 'status');
    const interaction = practiceInteraction(options, practice, response => {
        const controls = interaction.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>(
            'input, select, textarea, button',
        );
        controls.forEach(control => { control.disabled = true; });
        void onComplete(response).then(outcome => {
            const expectedOutcome = gradeStoryPractice(practice, response);
            if (outcome !== expectedOutcome) {
                throw new Error(`Story practice ${practice.activityId} returned ${outcome} for a ${expectedOutcome} response.`);
            }
            markPracticeMistakes(interaction, storyPracticeMistakeIds(practice, response));
            playStorySfx(options.audio, outcome === 'pass' ? 'worksheet.success' : 'worksheet.repair');
            status.textContent = outcome === 'pass'
                ? options.language === 'ja' ? '記録しました。場面に戻ります。' : 'Recorded. Returning to the scene.'
                : practice.repair[options.language];
            if (outcome === 'lapse') {
                controls.forEach(control => { control.disabled = false; });
                interaction.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
            }
        }).catch(() => {
            status.textContent = options.language === 'ja' ? '記録できませんでした。もう一度試してください。' : 'Could not save this attempt. Try again.';
            controls.forEach(control => { control.disabled = false; });
        });
    });
    root.append(prompt, interaction, status);
    return { element: root };
}

function markPracticeMistakes(interaction: HTMLElement, mistakeIds: readonly string[]): void {
    interaction.querySelectorAll<HTMLElement>('[aria-invalid]').forEach(control => control.removeAttribute('aria-invalid'));
    mistakeIds.forEach(id => {
        const [rowId, columnId] = id.split(':');
        const control = columnId
            ? interaction.querySelector<HTMLElement>(`[data-evidence-row="${rowId}"] [data-evidence-column="${columnId}"]`)
            : interaction.querySelector<HTMLElement>(`[data-story-written-field="${id}"]`);
        control?.setAttribute('aria-invalid', 'true');
    });
}

function practiceInteraction(
    options: StoryPlaybackOptions,
    practice: StoryPractice,
    submit: (response: StoryPracticeResponse) => void,
): HTMLElement {
    switch (practice.interaction) {
        case 'choice': {
            const choices = element('div', 'academy-story-vn-activity-actions');
            practice.options.forEach(option => {
                const button = actionButton(option.label[options.language], 'academy-story-practice-option', () => {
                    submit({ interaction: 'choice', optionId: option.id });
                });
                button.dataset.storyPracticeOption = option.id;
                choices.append(button);
            });
            return choices;
        }
        case 'evidence-map':
            return evidenceMapInteraction(options, practice, submit);
        case 'written-response':
            return writtenResponseInteraction(options, practice, submit);
        default:
            return unsupportedStoryPractice(practice);
    }
}

function evidenceMapInteraction(
    options: StoryPlaybackOptions,
    practice: StoryEvidenceMapPractice,
    submit: (response: StoryPracticeResponse) => void,
): HTMLElement {
    const fieldset = element('fieldset', 'academy-story-evidence-map');
    fieldset.dataset.storyPracticeInteraction = 'evidence-map';
    fieldset.append(textElement('legend', 'academy-visually-hidden', practice.prompt[options.language]));
    practice.rows.forEach(row => {
        const entry = element('div', 'academy-story-evidence-row');
        entry.dataset.evidenceRow = row.id;
        const claim = textElement('p', 'academy-story-evidence-claim', row.claim[options.language]);
        claim.lang = options.language === 'ja' ? 'ja' : 'en';
        entry.append(claim);
        practice.columns.forEach(column => {
            const label = element('label', 'academy-story-evidence-field');
            label.append(textElement('span', 'academy-story-evidence-label', column.label[options.language]));
            const select = document.createElement('select');
            select.dataset.evidenceColumn = column.id;
            select.setAttribute('aria-label', `${row.claim[options.language]}: ${column.label[options.language]}`);
            select.append(new Option(options.language === 'ja' ? '選択' : 'Select', ''));
            column.options.forEach(option => select.append(new Option(option.label[options.language], option.id)));
            label.append(select);
            entry.append(label);
        });
        fieldset.append(entry);
    });
    const check = actionButton(options.language === 'ja' ? '地図を確認' : 'Check map', 'academy-story-practice-submit', () => {
        const rows = Object.fromEntries(practice.rows.map(row => {
            const entry = fieldset.querySelector<HTMLElement>(`[data-evidence-row="${row.id}"]`)!;
            return [row.id, Object.fromEntries(practice.columns.map(column => [
                column.id,
                entry.querySelector<HTMLSelectElement>(`[data-evidence-column="${column.id}"]`)!.value,
            ])) as Record<'source' | 'confidence' | 'hedge', string>];
        }));
        submit({ interaction: 'evidence-map', rows });
    });
    fieldset.append(check);
    return fieldset;
}

function writtenResponseInteraction(
    options: StoryPlaybackOptions,
    practice: StoryWrittenResponsePractice,
    submit: (response: StoryPracticeResponse) => void,
): HTMLElement {
    const fieldset = element('fieldset', 'academy-story-written-response');
    fieldset.dataset.storyPracticeInteraction = 'written-response';
    fieldset.append(textElement('legend', 'academy-visually-hidden', practice.prompt[options.language]));
    practice.fields.forEach(field => {
        const label = element('label', 'academy-story-written-field');
        label.append(textElement('span', 'academy-story-written-label', field.label[options.language]));
        const input = document.createElement('textarea');
        input.rows = 2;
        input.lang = 'ja';
        input.spellcheck = false;
        input.placeholder = field.placeholder;
        input.dataset.storyWrittenField = field.id;
        label.append(input);
        fieldset.append(label);
    });
    const check = actionButton(options.language === 'ja' ? '予定を確認' : 'Check updates', 'academy-story-practice-submit', () => {
        const fields = Object.fromEntries(practice.fields.map(field => [
            field.id,
            fieldset.querySelector<HTMLTextAreaElement>(`[data-story-written-field="${field.id}"]`)!.value,
        ]));
        submit({ interaction: 'written-response', fields });
    });
    fieldset.append(check);
    return fieldset;
}

function unsupportedStoryPractice(practice: never): never {
    throw new Error(`Unsupported story practice interaction ${String((practice as StoryPractice).interaction)}.`);
}

function episodeIdForCursor(story: StoryRuntime, cursor: StoryCursor): string | undefined {
    if (cursor.arcId === story.openingArc.id) return story.openingArc.episodeId;
    return story.episodes.find(episode => story.playableArc(episode.id)?.id === cursor.arcId)?.id;
}

function unsupportedStoryMoment(moment: never): never {
    const unsafe = moment as unknown as { readonly kind?: unknown };
    throw new Error(`Story renderer received unsupported moment ${String(unsafe.kind)}.`);
}

function playableCompleteAction(
    options: PlayableArcRenderOptions,
    completionEligible: boolean,
): AcademyVnSlotContent {
    const root = element('div', 'academy-story-vn-complete');
    if (!completionEligible) {
        root.append(textElement('p', 'academy-story-vn-noncredit', options.language === 'ja'
            ? '物語は最後まで読みました。未完了の練習に単位は付きません。'
            : 'You reached the end of the story. Deferred practices remain uncredited.'));
    }
    let pending = false;
    let button: HTMLButtonElement;
    button = actionButton(options.finishLabel, 'academy-story-next', () => {
        if (pending) return;
        pending = true;
        button.disabled = true;
        playStorySfx(options.audio, 'ceremony.chapter.complete');
        Promise.resolve(options.onFinish(completionEligible)).catch(() => {
            pending = false;
            button.disabled = false;
        });
    });
    root.append(button);
    return { element: root };
}

function playStorySfx(
    audio: AcademyVnStageOptions['audio'] | undefined,
    semanticCue: AcademySemanticSfxCue,
): void {
    const cue = resolveDirectorSfxCue(semanticCue);
    if (cue) audio?.playSfx(cue);
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
    learner: StoryPlaybackOptions['learner'],
): readonly AcademyVnCastMember[] {
    if (moment.kind === 'complete') return [];
    const hasRie = storySceneAttendeeIds(moment.scene, choices).includes('rie');
    const cast: AcademyVnCastMember[] = [];
    const speakerId = moment.kind === 'line' ? moment.node.speakerId : undefined;
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
    const speakingClassmate = approvedStorySpeakerCastMember(language, speakerId, hasRie ? 'center' : 'left');
    if (speakingClassmate) cast.push(speakingClassmate);
    if (moment.kind === 'line') {
        cast.push(learnerStoryCastMember(language, learner));
    }
    return cast;
}

function approvedStorySpeakerCastMember(
    language: AcademyLanguage,
    speakerId: string | undefined,
    position: AcademyVnCastMember['position'],
): AcademyVnCastMember | undefined {
    if (!speakerId || speakerId === 'rie' || speakerId === 'learner') return undefined;
    if (!canRenderAcademyCastPortrait(speakerId, 'story-runtime')) return undefined;
    const approved = ACADEMY_ASSETS.characters.approved as Readonly<Record<string, string | undefined>>;
    const still = approved[speakerId];
    if (!still) return undefined;
    const displayName = displayAcademyCastName(speakerId, language);
    return {
        characterId: speakerId,
        displayName,
        alt: language === 'ja' ? `${displayName}が話しています` : `${displayName} speaking`,
        position,
        expression: 'neutral',
        expressions: { neutral: { still } },
    };
}

function storySpeakerName(
    speakerId: string | undefined,
    language: AcademyLanguage,
    learner: StoryPlaybackOptions['learner'],
): string | undefined {
    if (!speakerId) return undefined;
    return speakerId === 'learner'
        ? learnerDisplayName(language, learner)
        : displayAcademyCastName(speakerId, language);
}

function learnerStoryCastMember(
    language: AcademyLanguage,
    learner: StoryPlaybackOptions['learner'],
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

function learnerDisplayName(language: AcademyLanguage, learner: StoryPlaybackOptions['learner']): string {
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
        passed: { en: 'Done. The room is ready.', ja: 'できました。教室に戻れます。' },
        'placement-equivalent': { en: 'You can continue. This step stays open for practice.', ja: '続けられます。この練習はいつでもできます。' },
        lapse: { en: 'Nearly there. Try this step once more.', ja: 'もう少しです。もう一度やってみましょう。' },
        missing: { en: 'Try this step to move the scene forward.', ja: 'このステップをやって、場面を進めましょう。' },
    } as const;
    return labels[gate][language];
}

function storyActivityLabel(language: AcademyLanguage, componentType: string): string {
    const labels: Readonly<Record<string, Readonly<{ en: string; ja: string }>>> = {
        speaking: { en: 'Say it aloud', ja: '声に出す' },
        listening: { en: 'Listen and choose', ja: '聞いて選ぶ' },
        writing: { en: 'Write it', ja: '書いてみる' },
        reading: { en: 'Read and choose', ja: '読んで選ぶ' },
        grammar: { en: 'Build the line', ja: '文を作る' },
        vocabulary: { en: 'Match the words', ja: '言葉を合わせる' },
        transfer: { en: 'Use it on your own', ja: '自分で使う' },
        recognition: { en: 'Notice the pattern', ja: '形を見つける' },
        'authentic-input': { en: 'Use it in class', ja: '教室で使う' },
    };
    return labels[componentType]?.[language] ?? (language === 'ja' ? 'やってみる' : 'Try this step');
}

function directionForScene(scene: StoryArcScene) {
    const eventArt = STORY_EVENT_ART_BY_SCENE[scene.id];
    const plate = eventArt ?? (scene.locationId.includes('entrance')
        ? ACADEMY_ASSETS.locations.entrance
        : scene.locationId.includes('language-lab')
            ? ACADEMY_ASSETS.locations.languageLab
            : scene.locationId.includes('library')
                ? ACADEMY_ASSETS.locations.library
                : ACADEMY_ASSETS.locations.classroom);
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

const STORY_EVENT_ART_BY_SCENE: Readonly<Record<string, Readonly<{ wide: string; mobile: string }>>> = {
    'scene:empty-microphone:host-drops-out': eventPlate(ACADEMY_ASSETS.events.emptyMicrophoneRehearsal),
    'scene:empty-microphone:the-role-on-the-sheet': eventPlate(ACADEMY_ASSETS.events.emptyMicrophoneRehearsal),
    'scene:last-revision:what-stays-out-of-frame': eventPlate(ACADEMY_ASSETS.events.withheldPanelHandoff),
    'scene:last-revision:vivid-but-restores-nothing': eventPlate(ACADEMY_ASSETS.events.withheldPanelHandoff),
    'scene:atlas-closes:what-the-template-was': eventPlate(ACADEMY_ASSETS.events.atlasFinaleNextPage),
    'scene:atlas-closes:only-this-far': eventPlate(ACADEMY_ASSETS.events.atlasFinaleNextPage),
    'scene:next-page:the-terms-of-the-page': eventPlate(ACADEMY_ASSETS.events.atlasFinaleNextPage),
    'scene:next-page:the-one-thing-left': eventPlate(ACADEMY_ASSETS.events.atlasFinaleNextPage),
};

function eventPlate(source: string): Readonly<{ wide: string; mobile: string }> {
    return Object.freeze({ wide: source, mobile: source });
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
