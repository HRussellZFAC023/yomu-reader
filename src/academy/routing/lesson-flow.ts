import { ACADEMY_ASSETS, type AcademyPlateId } from '../assets';
import { AAKASH_RAINY_DIRECTIONS_SCENE_ID, createAakashDirectionsActivity } from '../content/aakash-meet';
import {
    getAuthoredWeekRegistration,
    getCompleteLessonRegistration,
    loadAuthoredWeekPackage,
} from '../content/lesson-content-registry';
import {
    loadSenseiVocabularyPrerequisite,
} from '../content/lesson-vocabulary-prerequisite';
import { libraryVocabularyReviewSeeds } from '../content/library-vocabulary-sheet';
import { loadReachableLessonActivityChapter } from '../content/lesson-activity-catalog';
import { loadClassWeekCastPlan } from '../content/class-week-cast-plan-loader';
import {
    adaptLessonStoryEntry,
    createLessonStoryRuntime,
    lessonStoryEncounter,
    lessonStoryPresentation,
} from '../content/lesson-story-runtime';
import { loadLessonZeroContent } from '../content/lesson-zero';
import {
    createLessonZeroGreetingDefinition,
    LESSON_ZERO_GREETING_ACTIVITY_ID,
} from '../content/lesson-zero-greeting';
import {
    createLessonZeroNameCardDefinition,
    LESSON_ZERO_NAME_CARD_ACTIVITY_ID,
} from '../content/lesson-zero-name-card';
import {
    createLessonZeroMissionDefinition,
    isLessonZeroMissionActivity,
    LESSON_ZERO_MISSION_ACTIVITY_IDS,
    type LessonZeroMissionActivityId,
    type LessonZeroMissionResponse,
} from '../content/lesson-zero-mission-activity';
import {
    createLessonZeroSentenceFrameDefinition,
    LESSON_ZERO_SENTENCE_FRAMES_ACTIVITY_ID,
} from '../content/lesson-zero-sentence-frames';
import {
    createLessonZeroSoundDefinition,
    LESSON_ZERO_SOUND_ACTIVITY_ID,
} from '../content/lesson-zero-sound';
import {
    createLessonZeroVowelBingo,
    createLessonZeroVowelSoundMap,
    LESSON_ZERO_VOWEL_SOUND_MAP_ID,
} from '../content/lesson-zero-vowel-sound-map';
import {
    createLessonZeroVowelWritingDefinition,
    lessonZeroVowelWritingCompletionEvaluation,
    LESSON_ZERO_VOWEL_WRITING_ID,
} from '../content/lesson-zero-vowel-writing';
import { loadLessonZeroClassroomExpressions } from '../content/lesson-zero-classroom-expressions';
import {
    classroomActivityCompletionEvaluation,
    classroomProbeRecording,
    classroomStateForActivity,
    isLessonZeroConstructedClassroomActivity,
    LESSON_ZERO_CONSTRUCTED_CLASSROOM_ACTIVITY_IDS,
    newlyCompletedClassroomActivityIds,
    supportEvents,
} from '../content/lesson-zero-classroom-runtime';
import {
    createLessonZeroFollowInstructionDefinition,
    LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID,
    lessonZeroFollowInstructionCompletionEvaluation,
} from '../content/lesson-zero-follow-instructions';
import {
    createLessonZeroRepeatRequestDefinition,
    LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID,
    lessonZeroRepeatRequestCompletionEvaluation,
} from '../content/lesson-zero-repeat-request';
import {
    createLessonZeroDeskLanguageDefinition,
    LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID,
    lessonZeroDeskLanguageCompletionEvaluation,
} from '../content/lesson-zero-desk-language';
import {
    advancedPackageIdFromLessonId,
    resolveAdvancedCurriculumEntry,
    type AdvancedCurriculumEntry,
} from '../content/advanced-curriculum';
import { loadVerticalSliceContent, openingForkActivityId } from '../content/vertical-slice';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import {
    startClassroomExpressionSession,
    transitionClassroomExpressionSession,
} from '../domain/classroom-expression-session';
import {
    startClassroomInstructionSession,
    transitionClassroomInstructionSession,
} from '../domain/classroom-instruction-session';
import {
    startLessonZeroRepeatRequestSession,
    transitionLessonZeroRepeatRequestSession,
} from '../domain/lesson-zero-repeat-request-session';
import {
    startLessonZeroDeskLanguageSession,
    transitionLessonZeroDeskLanguageSession,
} from '../domain/lesson-zero-desk-language-session';
import {
    startLessonZeroGreetingSession,
    transitionLessonZeroGreetingSession,
} from '../domain/lesson-zero-greeting-session';
import {
    startLessonZeroNameCardSession,
    transitionLessonZeroNameCardSession,
} from '../domain/lesson-zero-name-card-session';
import {
    startLessonZeroSentenceFrameSession,
    transitionLessonZeroSentenceFrameSession,
} from '../domain/lesson-zero-sentence-frame-session';
import {
    startLessonZeroSoundSession,
    transitionLessonZeroSoundSession,
} from '../domain/lesson-zero-sound-session';
import {
    startLessonZeroVowelSession,
    transitionLessonZeroVowelSession,
} from '../domain/lesson-zero-vowel-session';
import {
    lessonZeroVowelWritingAveragePassScore,
    startLessonZeroVowelWritingSession,
    transitionLessonZeroVowelWritingSession,
} from '../domain/lesson-zero-vowel-writing-session';
import {
    authoredWeekProgressAfterActivity,
    authoredWeekProgressFits,
    clearAuthoredWeekProgress,
    setAuthoredWeekProgress,
} from '../domain/authored-week-progress';
import type { SfxCue } from '../audio/types';
import { createLessonOverviewModel, type LessonOverviewState } from '../domain/lesson-overview';
import type { LearnerProjection } from '../domain/learner-record';
import type { LearnerEvidence } from '../evidence/learner-evidence';
import type { KanjiWritingService, PronunciationService } from '../integration/yomu-bridge';
import type { AcademyRoute } from '../persistence/indexeddb';
import { renderAakashMeetScreen } from '../ui/character-scenes';
import { renderLessonOverviewScreen } from '../ui/lesson-overview-screen';
import { renderKanjiDeskScreen, renderLessonFork, renderSourceActivityScreen } from '../ui/lesson-screen';
import { createLessonZeroProof } from '../ui/lesson-zero-proof';
import { createAuthoredWeekScreen } from '../ui/authored-week-screen';
import { renderLessonVocabularyPrerequisiteScreen } from '../ui/lesson-vocabulary-prerequisite';
import { createReachableLessonActivityExtension } from '../ui/lesson-activity-chapter';
import { renderLoadingScreen } from '../ui/loading-screen';
import { createAdvancedLessonScreen } from '../ui/advanced-lesson-screen';
import { createClassroomExpressionSessionScreen } from '../ui/classroom-expression-session-screen';
import { createClassroomInstructionScreen } from '../ui/classroom-instruction-screen';
import { createLessonZeroRepeatRequestScreen } from '../ui/lesson-zero-repeat-request-screen';
import { createLessonZeroDeskLanguageScreen } from '../ui/lesson-zero-desk-language-screen';
import { createLessonZeroGreetingScreen } from '../ui/lesson-zero-greeting-screen';
import { createLessonZeroNameCardScreen } from '../ui/lesson-zero-name-card-screen';
import { createLessonZeroMissionScreen } from '../ui/lesson-zero-mission-screen';
import { createLessonZeroSentenceFrameScreen } from '../ui/lesson-zero-sentence-frame-screen';
import { createLessonZeroSoundScreen } from '../ui/lesson-zero-sound-screen';
import { createLessonZeroVowelScreen } from '../ui/lesson-zero-vowel-screen';
import { createLessonZeroVowelWritingScreen } from '../ui/lesson-zero-vowel-writing-screen';
import { createAcademyActivityRuntime } from '../minigames';
import { parseStoryCursor } from '../content/story-runner';
import { displayAcademyCastName } from '../domain/cast-registry';
import type { AcademyRouteContext, AcademyRouteFlow } from './types';
import { lessonCompletionReturn } from './lesson-return';

const LESSON_ZERO_ID = 'lesson:foundation-00';

export interface LessonFlowOptions {
    readonly evidence: LearnerEvidence;
    readonly pronunciation: PronunciationService;
    readonly kanjiWriting: KanjiWritingService;
    readonly audio?: { beginExternalLesson(duck?: number): () => void; playSfx?(cue: SfxCue): void };
}

export function createLessonFlow(options?: LessonFlowOptions): AcademyRouteFlow {
    return new LessonFlow(options);
}

class LessonFlow implements AcademyRouteFlow {
    constructor(private readonly configuredOptions?: LessonFlowOptions) {}

    private get options(): LessonFlowOptions {
        if (!this.configuredOptions) throw new Error('Lesson activity routes require configured learning services.');
        return this.configuredOptions;
    }

    /** Every graded activity across the lesson flow gets a correct/repair cue through this one seam. */
    private playFeedbackSfx(outcome: 'pass' | 'lapse'): void {
        this.options.audio?.playSfx?.(outcome === 'pass' ? 'feedback.correct' : 'feedback.repair');
    }

    async render(route: AcademyRoute, context: AcademyRouteContext): Promise<boolean> {
        switch (route) {
            case 'lesson-overview':
                await this.renderOverview(context);
                return true;
            case 'lesson-fork':
                context.shell.replace(renderLessonFork(
                    context.language,
                    context.checkpoint.selectedFork,
                    fork => void context.go('source-activity', {
                        lessonId: LESSON_ZERO_ID,
                        activityId: openingForkActivityId(fork),
                        selectedFork: fork,
                    }),
                ));
                return true;
            case 'source-activity':
                await this.renderSourceActivity(context);
                return true;
            case 'aakash-meet':
                this.renderAakashMeet(context);
                return true;
            case 'writing-practice':
                await this.renderWritingPractice(context);
                return true;
            default:
                return false;
        }
    }

    private async renderOverview(context: AcademyRouteContext): Promise<void> {
        const lessonId = context.checkpoint.lessonId ?? LESSON_ZERO_ID;
        if (lessonId.startsWith('authored-week:')) {
            await this.renderAuthoredWeek(lessonId.slice('authored-week:'.length), context);
            return;
        }
        if (lessonId !== LESSON_ZERO_ID) {
            if (context.checkpoint.routeHistory.length) await context.back();
            else await context.go('class', { lessonId: undefined, sectionId: undefined, activityId: undefined });
            return;
        }
        context.shell.replace(renderLoadingScreen(context.language, navigator.onLine));
        const content = await loadLessonZeroContent();
        const registration = getCompleteLessonRegistration(lessonId);
        const model = createLessonOverviewModel(
            content.lesson,
            content.grounding,
            overviewState(content.lesson.activities.map(activity => activity.id), context.projection),
            { releaseChannel: registration.releaseChannel },
        );
        context.shell.replace(renderLessonOverviewScreen({
            language: context.language,
            model,
            onBack: () => void context.back(),
            onOpenActivity: activityId => void context.go('source-activity', {
                lessonId,
                activityId,
                selectedFork: activityId === 'activity:lesson-zero-reconstruct-repair'
                    ? 'text'
                    : context.checkpoint.selectedFork,
            }),
        }));
    }

    private async renderAuthoredWeek(packageId: string, context: AcademyRouteContext): Promise<void> {
        context.shell.replace(renderLoadingScreen(context.language, navigator.onLine));
        const registration = getAuthoredWeekRegistration(packageId);
        const plan = await loadClassWeekCastPlan();
        const continuity = createLessonStoryRuntime(plan).continuity(packageId);
        const storyEntry = continuity ? adaptLessonStoryEntry(continuity, context.projection.activities) : undefined;
        const presentation = continuity ? lessonStoryPresentation(continuity) : undefined;
        const classWeek = plan.weeks.find(week => week.weekId === registration.classWeekId);
        if (!classWeek || classWeek.status !== 'source-backed' || !classWeek.primary) {
            throw new Error(`Class Week ${registration.classWeekId} has no grounded attendee roster.`);
        }
        const primary = classWeek.primary;
        const { week } = await loadAuthoredWeekPackage(packageId);
        const authoredLessonId = `authored-week:${registration.packageId}` as const;
        const prerequisite = await loadSenseiVocabularyPrerequisite(authoredLessonId);
        const chapter = await loadReachableLessonActivityChapter(packageId, this.options.kanjiWriting);
        const extension = chapter ? createReachableLessonActivityExtension({
            language: context.language,
            chapter,
            ...(presentation ? { presentation: { location: presentation.location } } : {}),
            runtime: createAcademyActivityRuntime(),
            pronunciation: this.options.pronunciation,
            onEvaluation: (_activity, evaluation) => {
                this.playFeedbackSfx(evaluation.result.outcome);
                return this.options.evidence.recordActivity(
                    evaluation,
                    `authored-week:${packageId}`,
                );
            },
        }) : undefined;
        const progressScope = {
            exposureIds: week.preAssessment.map(exposure => exposure.id),
            activityIds: week.activities.map(activity => activity.id),
            supportActivityIds: week.activities
                .filter(activity => activity.kind !== 'academy-source-vocabulary-sheet')
                .map(activity => activity.id),
            hasExtension: Boolean(extension),
        };
        const savedProgress = context.checkpoint.authoredWeekProgress?.[packageId];
        let initialProgress = savedProgress
            && savedProgress.sourceSha256 === week.provenance.source.sha256
            && authoredWeekProgressFits(savedProgress.position, progressScope)
            ? savedProgress.position
            : undefined;
        if (initialProgress
            && savedProgress?.savedAt !== undefined
            && (initialProgress.phase === 'support' || initialProgress.phase === 'question')) {
            const activityProgress = context.projection.activities[initialProgress.activityId];
            if (activityProgress?.lastOutcome === 'pass'
                && activityProgress.lastAttemptAt > savedProgress.savedAt) {
                initialProgress = authoredWeekProgressAfterActivity(initialProgress.activityId, progressScope);
            }
        }
        const initialLapsedActivityIds = week.activities
            .filter(activity => (context.projection.activities[activity.id]?.lapseCount ?? 0) > 0)
            .map(activity => activity.id);
        const initialRepairedActivityIds = week.activities
            .filter(activity => {
                const progress = context.projection.activities[activity.id];
                return Boolean(progress && progress.lapseCount > 0 && progress.lastOutcome === 'pass');
            })
            .map(activity => activity.id);
        const showActivities = () => {
            let releaseListeningDuck: (() => void) | undefined;
            const screen = createAuthoredWeekScreen({
            language: context.language,
            week,
            ...(initialProgress ? { initialProgress } : {}),
            initialLapsedActivityIds,
            initialRepairedActivityIds,
            onPositionChange: progress => context.save?.({
                authoredWeekProgress: setAuthoredWeekProgress(
                    context.checkpoint.authoredWeekProgress,
                    packageId,
                    week.provenance.source.sha256,
                    progress,
                ),
            }),
            ...(continuity?.callback ? {
                storyContext: {
                    hostId: continuity.hostId,
                    hostName: displayAcademyCastName(continuity.hostId, context.language),
                    ...(presentation ? {
                        originPlaceId: presentation.originPlaceId,
                        plate: presentation.plate,
                        location: presentation.location,
                    } : {}),
                    setup: storyEntry?.setup ?? continuity.setup,
                    callback: storyEntry?.callback ?? continuity.callback.meaningNow,
                    ...(continuity.world ? { handoff: continuity.handoff } : {}),
                    ...(continuity.dialogue ? {
                        dialogue: continuity.dialogue.map(turn => ({
                            ...turn,
                            speakerName: displayAcademyCastName(turn.speakerId, context.language),
                        })),
                    } : {}),
                },
            } : {}),
            ...(extension ? { extension } : {}),
            onListeningStart: () => {
                releaseListeningDuck?.();
                try {
                    releaseListeningDuck = this.options.audio?.beginExternalLesson(0.25);
                } catch {
                    releaseListeningDuck = undefined;
                }
            },
            onListeningStop: () => {
                releaseListeningDuck?.();
                releaseListeningDuck = undefined;
            },
            onEvaluation: (activity, evaluation, attemptContext) => {
                this.playFeedbackSfx(evaluation.result.outcome);
                return this.options.evidence.recordActivity({
                result: evaluation.result,
                attempt: {
                    kind: 'attempt-recorded',
                    activityId: activity.id,
                    sourceQuestionId: activity.sourceQuestionId,
                    conceptIds: activity.conceptIds,
                    responseKind: activity.responseKind,
                    outcome: evaluation.result.outcome,
                    score: evaluation.result.score,
                    errorTags: evaluation.result.errorTags,
                },
                reviewSeeds: evaluation.reviewSeeds,
            }, `authored-week:${packageId}`, attemptContext.repaired
                && packageId === 'l1-l01'
                && activity.id === 'authored:l1-l01/ex-input-job'
                ? {
                    id: 'l1-l01-first-name-card-repair',
                    sceneId: 'scene:l1-l01-first-name-card-repair',
                    journalLine: {
                        lineId: 'journal:l1-l01:first-name-card-repair',
                        characterId: 'stasi',
                        text: {
                            ja: 'スタシさんが待ってくれて、アーカッシュさんの名刺をもう一度読んだ。今度は「エンジニアです」を見つけた。',
                            en: "Stasi waited while I read Aakash's name card again. This time I found the line that says エンジニアです.",
                        },
                        sourceQuestionId: activity.sourceQuestionId,
                    },
                }
                : undefined);
            },
            onComplete: async () => {
                await this.options.evidence.recordEncounter(continuity
                    ? lessonStoryEncounter(continuity)
                    : {
                        encounterId: `class-week:${classWeek.weekId}`,
                        sceneId: `scene:class-week:${classWeek.weekId}`,
                        attendeeIds: [primary.id, ...classWeek.supporting.map(member => member.id)],
                    });
                await context.save?.({
                    authoredWeekProgress: clearAuthoredWeekProgress(
                        context.checkpoint.authoredWeekProgress,
                        packageId,
                    ),
                });
                const destination = lessonCompletionReturn(context.checkpoint);
                if (context.returnTo) {
                    await context.returnTo(destination);
                    return;
                }
                const { route, ...returnContext } = destination;
                await context.go(route, {
                    selectedBand: returnContext.selectedBand,
                    selectedFork: returnContext.selectedFork,
                    placementOverride: returnContext.placementOverride,
                    lessonId: returnContext.lessonId,
                    sectionId: returnContext.sectionId,
                    activityId: returnContext.activityId,
                    worldPlace: returnContext.worldPlace,
                });
            },
            onBack: () => context.back(),
            });
            screen.element.dataset.academyRoute = 'lesson-overview';
            screen.element.dataset.authoredWeekResumed = String(Boolean(initialProgress));
            screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
            context.shell.replace(screen.element);
        };
        if (initialProgress) {
            showActivities();
            return;
        }
        context.shell.replace(renderLessonVocabularyPrerequisiteScreen({
            language: context.language,
            prerequisite,
            onContinue: async () => {
                await this.options.evidence.seedVocabularyPrerequisite(
                    authoredLessonId,
                    libraryVocabularyReviewSeeds(prerequisite.sheet),
                );
                showActivities();
            },
        }));
    }

    private async renderSourceActivity(context: AcademyRouteContext): Promise<void> {
        context.shell.replace(renderLoadingScreen(context.language, navigator.onLine));
        const advancedPackageId = advancedPackageIdFromLessonId(context.checkpoint.lessonId);
        if (advancedPackageId) {
            const entry = resolveAdvancedCurriculumEntry(advancedPackageId);
            if (context.checkpoint.activityId !== entry.activity.id) {
                await context.go('source-activity', {
                    lessonId: entry.lessonId,
                    activityId: entry.activity.id,
                });
                return;
            }
            this.renderAdvancedPackage(advancedPackageId, context);
            return;
        }
        if (context.checkpoint.activityId === LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID) {
            await this.renderLessonZeroRepeatRequest(context);
            return;
        }
        if (context.checkpoint.activityId === LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID) {
            await this.renderLessonZeroDeskLanguage(context);
            return;
        }
        if (isLessonZeroConstructedClassroomActivity(context.checkpoint.activityId)) {
            await this.renderClassroomExpressionSession(context.checkpoint.activityId, context);
            return;
        }
        if (context.checkpoint.activityId === LESSON_ZERO_GREETING_ACTIVITY_ID) {
            await this.renderLessonZeroGreeting(context);
            return;
        }
        if (context.checkpoint.activityId === LESSON_ZERO_NAME_CARD_ACTIVITY_ID) {
            await this.renderLessonZeroNameCard(context);
            return;
        }
        if (context.checkpoint.activityId === LESSON_ZERO_SENTENCE_FRAMES_ACTIVITY_ID) {
            await this.renderLessonZeroSentenceFrames(context);
            return;
        }
        if (context.checkpoint.activityId === LESSON_ZERO_SOUND_ACTIVITY_ID) {
            await this.renderLessonZeroSound(context);
            return;
        }
        if (context.checkpoint.activityId === LESSON_ZERO_VOWEL_SOUND_MAP_ID) {
            await this.renderLessonZeroVowelSession(context);
            return;
        }
        if (context.checkpoint.activityId === LESSON_ZERO_VOWEL_WRITING_ID) {
            await this.renderLessonZeroVowelWritingSession(context);
            return;
        }
        if (context.checkpoint.activityId === LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID) {
            await this.renderClassroomInstructionSession(context);
            return;
        }
        if (isLessonZeroMissionActivity(context.checkpoint.activityId)) {
            await this.renderLessonZeroMission(context.checkpoint.activityId, context);
            return;
        }
        const fork = context.checkpoint.selectedFork ?? 'text';
        const returning = context.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID);
        if (fork === 'text') {
            const proof = await createLessonZeroProof({
                language: context.language,
                content: await loadLessonZeroContent(),
                pronunciation: this.options.pronunciation,
                rieExpressions: {
                    neutral: { still: ACADEMY_ASSETS.rie },
                    encouraging: { still: ACADEMY_ASSETS.rie },
                    happy: { still: ACADEMY_ASSETS.rie },
                    repair: { still: ACADEMY_ASSETS.rie },
                },
                ...(context.projection.profile ? { learner: context.projection.profile } : {}),
                onEvaluation: evaluation => this.recordActivity(evaluation, 'lesson-zero-text-proof'),
                onSupportUse: support => this.options.evidence.recordSupportUse(
                    support.activityId,
                    support.supportKind,
                    support.choiceId,
                ),
                onBack: () => void context.back(),
                onComplete: () => void this.completeSourceActivity(context, returning),
            });
            proof.element.dataset.academyScreen = 'lesson-zero-text-proof';
            proof.element.dataset.academyRoute = 'source-activity';
            proof.element.addEventListener('academy:dispose', () => proof.dispose(), { once: true });
            context.shell.replace(proof.element);
            return;
        }
        const content = await loadVerticalSliceContent();
        context.shell.replace(renderSourceActivityScreen(
            context.language,
            content,
            fork,
            this.options.pronunciation,
            evaluation => this.recordActivity(evaluation, `lesson-zero-first-repair:${fork}`),
            () => void this.completeSourceActivity(context, returning),
            returning,
            support => this.options.evidence.recordSupportUse(support.activityId, support.supportKind, support.choiceId),
        ));
    }

    private async renderLessonZeroMission(
        activityId: LessonZeroMissionActivityId,
        context: AcademyRouteContext,
    ): Promise<void> {
        const content = await loadLessonZeroContent();
        const definition = createLessonZeroMissionDefinition(
            content,
            activityId,
            context.projection.profile?.displayName ?? '',
        );
        const returning = context.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID);
        const screen = createLessonZeroMissionScreen({
            language: context.language,
            definition,
            pronunciation: this.options.pronunciation,
            onEvaluation: async (evaluation, response) => {
                this.playFeedbackSfx(evaluation.result.outcome);
                await this.options.evidence.recordActivity(evaluation, LESSON_ZERO_ID);
                if (
                    evaluation.result.outcome === 'pass'
                    && activityId === 'activity:lesson-zero-write-name-card'
                    && response.kind === 'written'
                ) {
                    await this.saveLessonZeroClassName(response, context);
                }
            },
            onBack: () => context.back(),
            onComplete: () => this.completeSourceActivity(context, returning),
        });
        screen.element.dataset.academyRoute = 'source-activity';
        screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
        context.shell.replace(screen.element);
    }

    private async saveLessonZeroClassName(
        response: Extract<LessonZeroMissionResponse, { kind: 'written' }>,
        context: AcademyRouteContext,
    ): Promise<void> {
        const displayName = response.text
            .normalize('NFKC')
            .split('です')[0]
            ?.replace(/[。.!！?？]/gu, '')
            .trim();
        if (!displayName) return;
        const current = context.projection.profile;
        await this.options.evidence.saveProfile({
            displayName,
            learningReason: current?.learningReason ?? '',
            portraitId: current?.portraitId ?? 'quality-2',
        });
    }

    private async renderClassroomExpressionSession(
        activityId: typeof LESSON_ZERO_CONSTRUCTED_CLASSROOM_ACTIVITY_IDS[number],
        context: AcademyRouteContext,
    ): Promise<void> {
        const [definition, content] = await Promise.all([
            loadLessonZeroClassroomExpressions(),
            loadLessonZeroContent(),
        ]);
        let state;
        try {
            state = startClassroomExpressionSession(definition, context.checkpoint.classroomExpressionProgress);
        } catch {
            state = startClassroomExpressionSession(definition);
        }
        if (state.status === 'paused') {
            state = transitionClassroomExpressionSession(definition, state, { kind: 'resume' }, Date.now()).state;
        }
        state = classroomStateForActivity(definition, state, activityId);
        if (JSON.stringify(state) !== JSON.stringify(context.checkpoint.classroomExpressionProgress)) {
            await context.save?.({ classroomExpressionProgress: state });
        }

        const activityById = new Map(content.lesson.activities.map(activity => [activity.id, activity]));
        const screen = createClassroomExpressionSessionScreen({
            language: context.language,
            activityId,
            definition,
            initialState: state,
            pronunciation: this.options.pronunciation,
            onTransition: async (before, transition) => {
                const recording = classroomProbeRecording(definition, transition);
                if (recording) {
                    this.playFeedbackSfx(recording.evaluation.result.outcome);
                    await this.options.evidence.recordActivity(
                        recording.evaluation,
                        LESSON_ZERO_ID,
                        undefined,
                        recording.adaptive,
                    );
                }
                for (const support of supportEvents(transition)) {
                    await this.options.evidence.recordSupportUse(
                        support.activityId,
                        support.supportKind,
                        support.choiceId,
                        { eventId: support.eventId, at: support.at },
                    );
                }
                for (const completedId of newlyCompletedClassroomActivityIds(definition, before, transition.state)) {
                    const completed = activityById.get(completedId);
                    if (!completed) throw new TypeError(`Lesson Zero is missing ${completedId}.`);
                    await this.options.evidence.recordActivity(
                        classroomActivityCompletionEvaluation(completed, Date.now()),
                        LESSON_ZERO_ID,
                    );
                }
                await context.save?.({ classroomExpressionProgress: transition.state });
            },
            onRestart: restart => context.save?.({ classroomExpressionProgress: restart }),
            onBack: () => context.back(),
        });
        screen.element.dataset.academyRoute = 'source-activity';
        screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
        context.shell.replace(screen.element);
    }

    private async renderLessonZeroRepeatRequest(context: AcademyRouteContext): Promise<void> {
        const [classroom, content] = await Promise.all([
            loadLessonZeroClassroomExpressions(),
            loadLessonZeroContent(),
        ]);
        const activity = content.lesson.activities.find(candidate =>
            candidate.id === LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID);
        if (!activity) throw new TypeError('Lesson Zero is missing its repeat-request activity.');
        const definition = createLessonZeroRepeatRequestDefinition(classroom, activity);
        let state;
        try {
            state = startLessonZeroRepeatRequestSession(
                definition,
                context.checkpoint.lessonZeroRepeatRequestProgress,
            );
        } catch {
            state = startLessonZeroRepeatRequestSession(definition);
        }
        if (state.status === 'paused') {
            state = transitionLessonZeroRepeatRequestSession(
                definition,
                state,
                { kind: 'resume' },
                Date.now(),
            ).state;
        }
        if (JSON.stringify(state) !== JSON.stringify(context.checkpoint.lessonZeroRepeatRequestProgress)) {
            await context.save?.({ lessonZeroRepeatRequestProgress: state });
        }
        const returning = context.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID);
        const screen = createLessonZeroRepeatRequestScreen({
            language: context.language,
            definition,
            initialState: state,
            pronunciation: this.options.pronunciation,
            onTransition: async (before, transition) => {
                if (transition.evaluation) {
                    this.playFeedbackSfx(transition.evaluation.result.outcome);
                    await this.options.evidence.recordActivity(
                        transition.evaluation,
                        LESSON_ZERO_ID,
                        undefined,
                        transition.adaptive,
                    );
                }
                for (const support of transition.supportEvents) {
                    await this.options.evidence.recordSupportUse(
                        support.activityId,
                        support.supportKind,
                        support.choiceId,
                        { eventId: support.eventId, at: support.at },
                    );
                }
                if (before.status !== 'complete' && transition.state.status === 'complete') {
                    await this.options.evidence.recordActivity(
                        lessonZeroRepeatRequestCompletionEvaluation(activity, definition, Date.now()),
                        LESSON_ZERO_ID,
                        {
                            id: 'lesson-zero-repeat-request-transfer',
                            sceneId: 'scene:lesson-zero-repeat-request-transfer',
                            journalLine: {
                                lineId: 'journal:lesson-zero:repeat-request',
                                characterId: 'rie',
                                text: {
                                    ja: 'りえ先生に「もう一度お願いします」と頼み、カフェでも同じ一言を使った。',
                                    en: 'I asked Rie to say it again, then used the same request at the cafe.',
                                },
                                sourceQuestionId: definition.sourceQuestionId,
                            },
                        },
                    );
                }
                await context.save?.({ lessonZeroRepeatRequestProgress: transition.state });
            },
            onRestart: restart => context.save?.({ lessonZeroRepeatRequestProgress: restart }),
            onBack: () => context.back(),
            onComplete: () => this.completeSourceActivity(context, returning),
        });
        screen.element.dataset.academyRoute = 'source-activity';
        screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
        context.shell.replace(screen.element);
    }

    private async renderLessonZeroDeskLanguage(context: AcademyRouteContext): Promise<void> {
        const [classroom, content] = await Promise.all([
            loadLessonZeroClassroomExpressions(),
            loadLessonZeroContent(),
        ]);
        const activity = content.lesson.activities.find(candidate =>
            candidate.id === LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID);
        if (!activity) throw new TypeError('Lesson Zero is missing its desk-language activity.');
        const definition = createLessonZeroDeskLanguageDefinition(classroom, activity);
        let state;
        try {
            state = startLessonZeroDeskLanguageSession(
                definition,
                context.checkpoint.lessonZeroDeskLanguageProgress,
            );
        } catch {
            state = startLessonZeroDeskLanguageSession(definition);
        }
        if (state.status === 'paused') {
            state = transitionLessonZeroDeskLanguageSession(
                definition,
                state,
                { kind: 'resume' },
                Date.now(),
            ).state;
        }
        if (JSON.stringify(state) !== JSON.stringify(context.checkpoint.lessonZeroDeskLanguageProgress)) {
            await context.save?.({ lessonZeroDeskLanguageProgress: state });
        }
        const returning = context.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID);
        const screen = createLessonZeroDeskLanguageScreen({
            language: context.language,
            definition,
            initialState: state,
            pronunciation: this.options.pronunciation,
            onTransition: async (before, transition) => {
                if (transition.evaluation) {
                    this.playFeedbackSfx(transition.evaluation.result.outcome);
                    await this.options.evidence.recordActivity(
                        transition.evaluation,
                        LESSON_ZERO_ID,
                        undefined,
                        transition.adaptive,
                    );
                }
                for (const support of transition.supportEvents) {
                    await this.options.evidence.recordSupportUse(
                        support.activityId,
                        support.supportKind,
                        support.choiceId,
                        { eventId: support.eventId, at: support.at },
                    );
                }
                if (before.status !== 'complete' && transition.state.status === 'complete') {
                    await this.options.evidence.recordActivity(
                        lessonZeroDeskLanguageCompletionEvaluation(activity, definition, Date.now()),
                        LESSON_ZERO_ID,
                        {
                            id: 'lesson-zero-desk-language-transfer',
                            sceneId: 'scene:lesson-zero-desk-language-transfer',
                            journalLine: {
                                lineId: 'journal:lesson-zero:desk-language',
                                characterId: 'rie',
                                text: {
                                    ja: '「しゅくだい」で持ち帰る課題を、「れい」で答え方の見本を選んだ。',
                                    en: 'I matched shukudai with work for later and rei with a model to follow.',
                                },
                            },
                        },
                    );
                }
                await context.save?.({ lessonZeroDeskLanguageProgress: transition.state });
            },
            onRestart: restart => context.save?.({ lessonZeroDeskLanguageProgress: restart }),
            onBack: () => context.back(),
            onComplete: () => this.completeSourceActivity(context, returning),
        });
        screen.element.dataset.academyRoute = 'source-activity';
        screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
        context.shell.replace(screen.element);
    }

    private async renderLessonZeroGreeting(context: AcademyRouteContext): Promise<void> {
        const content = await loadLessonZeroContent();
        const activity = content.lesson.activities.find(candidate => candidate.id === LESSON_ZERO_GREETING_ACTIVITY_ID);
        if (!activity) throw new TypeError('Lesson Zero is missing its first greeting activity.');
        const learnerName = context.projection.profile?.displayName;
        if (!learnerName) throw new TypeError('The first greeting requires the learner profile created during arrival.');
        const definition = createLessonZeroGreetingDefinition(activity, learnerName);
        let state;
        try {
            state = startLessonZeroGreetingSession(definition, context.checkpoint.lessonZeroGreetingProgress);
        } catch {
            state = startLessonZeroGreetingSession(definition);
        }
        if (state.status === 'paused') {
            state = transitionLessonZeroGreetingSession(
                definition,
                state,
                { kind: 'resume' },
                Date.now(),
            ).state;
        }
        if (JSON.stringify(state) !== JSON.stringify(context.checkpoint.lessonZeroGreetingProgress)) {
            await context.save?.({ lessonZeroGreetingProgress: state });
        }
        const returning = context.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID);
        const screen = createLessonZeroGreetingScreen({
            language: context.language,
            definition,
            initialState: state,
            pronunciation: this.options.pronunciation,
            onTransition: async (_before, transition) => {
                if (transition.evaluation) {
                    this.playFeedbackSfx(transition.evaluation.result.outcome);
                    await this.options.evidence.recordActivity(
                        transition.evaluation,
                        LESSON_ZERO_ID,
                        {
                            id: 'lesson-zero-first-greeting',
                            sceneId: 'scene:lesson-zero-first-greeting',
                            journalLine: {
                                lineId: 'journal:lesson-zero:first-greeting',
                                characterId: 'rie',
                                text: {
                                    ja: 'りえ先生に、初めて日本語で名前を伝えた。',
                                    en: 'I gave Rie-sensei my name in Japanese for the first time.',
                                },
                            },
                        },
                        transition.adaptive,
                    );
                }
                for (const support of transition.supportEvents) {
                    await this.options.evidence.recordSupportUse(
                        support.activityId,
                        support.supportKind,
                        support.choiceId,
                        { eventId: support.eventId, at: support.at },
                    );
                }
                await context.save?.({ lessonZeroGreetingProgress: transition.state });
            },
            onRestart: restart => context.save?.({ lessonZeroGreetingProgress: restart }),
            onBack: () => context.back(),
            onComplete: () => this.completeSourceActivity(context, returning),
        });
        screen.element.dataset.academyRoute = 'source-activity';
        screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
        context.shell.replace(screen.element);
    }

    private async renderLessonZeroSound(context: AcademyRouteContext): Promise<void> {
        const content = await loadLessonZeroContent();
        const definition = createLessonZeroSoundDefinition(content);
        let state;
        try {
            state = startLessonZeroSoundSession(definition, context.checkpoint.lessonZeroSoundProgress);
        } catch {
            state = startLessonZeroSoundSession(definition);
        }
        if (state.status === 'paused') {
            state = transitionLessonZeroSoundSession(definition, state, { kind: 'resume' }, Date.now()).state;
        }
        if (JSON.stringify(state) !== JSON.stringify(context.checkpoint.lessonZeroSoundProgress)) {
            await context.save?.({ lessonZeroSoundProgress: state });
        }
        const returning = context.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID);
        const screen = createLessonZeroSoundScreen({
            language: context.language,
            definition,
            initialState: state,
            onTransition: async (_before, transition) => {
                if (transition.evaluation) {
                    this.playFeedbackSfx(transition.evaluation.result.outcome);
                    await this.options.evidence.recordActivity(
                        transition.evaluation,
                        LESSON_ZERO_ID,
                        transition.evaluation.result.outcome === 'pass' ? {
                            id: 'lesson-zero-first-voices',
                            sceneId: 'scene:lesson-zero-first-voices',
                            journalLine: {
                                lineId: 'journal:lesson-zero:first-voices',
                                characterId: 'xingyu',
                                text: {
                                    ja: 'シンユさんとミカさんの声から、「です」の前にある名前を聞き取った。',
                                    en: "I found Xingyu and Mika's names by listening just before です.",
                                },
                            },
                        } : undefined,
                        transition.adaptive,
                    );
                }
                for (const support of transition.supportEvents) {
                    await this.options.evidence.recordSupportUse(
                        support.activityId,
                        support.supportKind,
                        support.choiceId,
                        { eventId: support.eventId, at: support.at },
                    );
                }
                await context.save?.({ lessonZeroSoundProgress: transition.state });
            },
            onRestart: restart => context.save?.({ lessonZeroSoundProgress: restart }),
            onBack: () => context.back(),
            onComplete: () => this.completeSourceActivity(context, returning),
        });
        screen.element.dataset.academyRoute = 'source-activity';
        screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
        context.shell.replace(screen.element);
    }

    private async renderLessonZeroSentenceFrames(context: AcademyRouteContext): Promise<void> {
        const content = await loadLessonZeroContent();
        const activity = content.lesson.activities.find(candidate =>
            candidate.id === LESSON_ZERO_SENTENCE_FRAMES_ACTIVITY_ID);
        if (!activity) throw new TypeError('Lesson Zero is missing its first-sentence activity.');
        const definition = createLessonZeroSentenceFrameDefinition(activity);
        let state;
        try {
            state = startLessonZeroSentenceFrameSession(
                definition,
                context.checkpoint.lessonZeroSentenceFrameProgress,
            );
        } catch {
            state = startLessonZeroSentenceFrameSession(definition);
        }
        if (state.status === 'paused') {
            state = transitionLessonZeroSentenceFrameSession(
                definition,
                state,
                { kind: 'resume' },
                Date.now(),
            ).state;
        }
        if (JSON.stringify(state) !== JSON.stringify(context.checkpoint.lessonZeroSentenceFrameProgress)) {
            await context.save?.({ lessonZeroSentenceFrameProgress: state });
        }
        const returning = context.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID);
        const screen = createLessonZeroSentenceFrameScreen({
            language: context.language,
            definition,
            initialState: state,
            pronunciation: this.options.pronunciation,
            onTransition: async (_before, transition) => {
                if (transition.evaluation) {
                    this.playFeedbackSfx(transition.evaluation.result.outcome);
                    await this.options.evidence.recordActivity(
                        transition.evaluation,
                        LESSON_ZERO_ID,
                        undefined,
                        transition.adaptive,
                    );
                }
                for (const support of transition.supportEvents) {
                    await this.options.evidence.recordSupportUse(
                        support.activityId,
                        support.supportKind,
                        support.choiceId,
                        { eventId: support.eventId, at: support.at },
                    );
                }
                if (transition.completionEvaluation) {
                    await this.options.evidence.recordActivity(
                        transition.completionEvaluation,
                        LESSON_ZERO_ID,
                        {
                            id: 'lesson-zero-first-sentences',
                            sceneId: 'scene:lesson-zero-first-sentences',
                            journalLine: {
                                lineId: 'journal:lesson-zero:first-sentences',
                                characterId: 'rie',
                                text: {
                                    ja: 'りえ先生とソフィーさんに、最初の五つの文を使った。教室から日本語で返事が来た。',
                                    en: 'I used my first five sentence shapes with Rie-sensei and Sophie. The room answered me in Japanese.',
                                },
                            },
                        },
                    );
                }
                await context.save?.({ lessonZeroSentenceFrameProgress: transition.state });
            },
            onRestart: restart => context.save?.({ lessonZeroSentenceFrameProgress: restart }),
            onBack: () => context.back(),
            onComplete: () => this.completeSourceActivity(context, returning),
        });
        screen.element.dataset.academyRoute = 'source-activity';
        screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
        context.shell.replace(screen.element);
    }

    private async renderLessonZeroNameCard(context: AcademyRouteContext): Promise<void> {
        const content = await loadLessonZeroContent();
        const activity = content.lesson.activities.find(candidate =>
            candidate.id === LESSON_ZERO_NAME_CARD_ACTIVITY_ID);
        if (!activity) throw new TypeError('Lesson Zero is missing its name-card activity.');
        const learnerName = context.projection.profile?.displayName;
        if (!learnerName) throw new TypeError('The name card requires the learner profile created during arrival.');
        const definition = createLessonZeroNameCardDefinition(activity, learnerName);
        let state;
        try {
            state = startLessonZeroNameCardSession(definition, context.checkpoint.lessonZeroNameCardProgress);
        } catch {
            state = startLessonZeroNameCardSession(definition);
        }
        if (state.status === 'paused') {
            state = transitionLessonZeroNameCardSession(
                definition,
                state,
                { kind: 'resume' },
                Date.now(),
            ).state;
        }
        if (JSON.stringify(state) !== JSON.stringify(context.checkpoint.lessonZeroNameCardProgress)) {
            await context.save?.({ lessonZeroNameCardProgress: state });
        }
        const returning = context.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID);
        const screen = createLessonZeroNameCardScreen({
            language: context.language,
            definition,
            initialState: state,
            pronunciation: this.options.pronunciation,
            onTransition: async (_before, transition) => {
                if (transition.evaluation) {
                    this.playFeedbackSfx(transition.evaluation.result.outcome);
                    await this.options.evidence.recordActivity(
                        transition.evaluation,
                        LESSON_ZERO_ID,
                        transition.evaluation.result.outcome === 'pass'
                            ? {
                                id: 'lesson-zero-first-name-card',
                                sceneId: 'scene:lesson-zero-first-name-card',
                                journalLine: {
                                    lineId: 'journal:lesson-zero:first-name-card',
                                    characterId: 'rie',
                                    text: {
                                        ja: 'りえ先生と、名前の後ろに「です」を置いて名札を作った。',
                                        en: 'I put です after my name and made a desk card with Rie-sensei.',
                                    },
                                },
                            }
                            : undefined,
                        transition.adaptive,
                    );
                }
                for (const support of transition.supportEvents) {
                    await this.options.evidence.recordSupportUse(
                        support.activityId,
                        support.supportKind,
                        support.choiceId,
                        { eventId: support.eventId, at: support.at },
                    );
                }
                await context.save?.({ lessonZeroNameCardProgress: transition.state });
            },
            onRestart: restart => context.save?.({ lessonZeroNameCardProgress: restart }),
            onBack: () => context.back(),
            onComplete: () => this.completeSourceActivity(context, returning),
        });
        screen.element.dataset.academyRoute = 'source-activity';
        screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
        context.shell.replace(screen.element);
    }

    private async renderClassroomInstructionSession(context: AcademyRouteContext): Promise<void> {
        const [classroom, content] = await Promise.all([
            loadLessonZeroClassroomExpressions(),
            loadLessonZeroContent(),
        ]);
        const activity = content.lesson.activities.find(candidate =>
            candidate.id === LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID);
        if (!activity) throw new TypeError('Lesson Zero is missing its follow-instructions activity.');
        const definition = createLessonZeroFollowInstructionDefinition(classroom, activity);
        let state;
        try {
            state = startClassroomInstructionSession(
                definition,
                context.checkpoint.classroomInstructionProgress,
            );
        } catch {
            state = startClassroomInstructionSession(definition);
        }
        if (state.status === 'paused') {
            state = transitionClassroomInstructionSession(
                definition,
                state,
                { kind: 'resume' },
                Date.now(),
            ).state;
        }
        if (JSON.stringify(state) !== JSON.stringify(context.checkpoint.classroomInstructionProgress)) {
            await context.save?.({ classroomInstructionProgress: state });
        }

        const screen = createClassroomInstructionScreen({
            language: context.language,
            definition,
            initialState: state,
            pronunciation: this.options.pronunciation,
            onTransition: async (before, transition) => {
                if (transition.evaluation) {
                    this.playFeedbackSfx(transition.evaluation.result.outcome);
                    await this.options.evidence.recordActivity(
                        transition.evaluation,
                        LESSON_ZERO_ID,
                        undefined,
                        transition.adaptive,
                    );
                }
                for (const support of transition.supportEvents) {
                    await this.options.evidence.recordSupportUse(
                        support.activityId,
                        support.supportKind,
                        support.choiceId,
                        { eventId: support.eventId, at: support.at },
                    );
                }
                if (before.status !== 'complete' && transition.state.status === 'complete') {
                    await this.options.evidence.recordActivity(
                        lessonZeroFollowInstructionCompletionEvaluation(activity, Date.now()),
                        LESSON_ZERO_ID,
                    );
                }
                await context.save?.({ classroomInstructionProgress: transition.state });
            },
            onRestart: restart => context.save?.({ classroomInstructionProgress: restart }),
            onBack: () => context.back(),
        });
        screen.element.dataset.academyRoute = 'source-activity';
        screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
        context.shell.replace(screen.element);
    }

    private async renderLessonZeroVowelSession(context: AcademyRouteContext): Promise<void> {
        const model = createLessonZeroVowelSoundMap();
        const bingoModel = createLessonZeroVowelBingo();
        const runtime = createAcademyActivityRuntime();
        let state;
        try {
            state = startLessonZeroVowelSession(model, context.checkpoint.lessonZeroVowelProgress);
        } catch {
            state = startLessonZeroVowelSession(model);
        }
        if (state.status === 'paused') {
            state = transitionLessonZeroVowelSession(model, state, { kind: 'resume' }, Date.now()).state;
        }
        if (JSON.stringify(state) !== JSON.stringify(context.checkpoint.lessonZeroVowelProgress)) {
            await context.save?.({ lessonZeroVowelProgress: state });
        }
        const returning = context.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID);
        const screen = createLessonZeroVowelScreen({
            language: context.language,
            model,
            bingoModel,
            initialState: state,
            pronunciation: this.options.pronunciation,
            xingyuSprite: ACADEMY_ASSETS.xingyuListening,
            evaluate: (variant, response) => runtime.evaluate(variant === 'bingo' ? bingoModel : model, response),
            onTransition: async (before, transition) => {
                if (transition.evaluation) {
                    this.playFeedbackSfx(transition.evaluation.result.outcome);
                    const evaluation = transition.state.variant === 'bingo'
                        ? {
                            ...transition.evaluation,
                            attempt: {
                                ...transition.evaluation.attempt,
                                activityId: LESSON_ZERO_VOWEL_SOUND_MAP_ID,
                            },
                        }
                        : transition.evaluation;
                    await this.options.evidence.recordActivity(
                        evaluation,
                        LESSON_ZERO_ID,
                        before.variant === 'lesson' ? {
                            id: 'lesson-zero-five-vowels',
                            sceneId: 'scene:lesson-zero-five-vowels',
                            journalLine: {
                                lineId: 'journal:lesson-zero:five-vowels',
                                characterId: 'xingyu',
                                text: {
                                    ja: 'シンユが五つの母音を違う順番で流した。それでも、一つずつ見つけられた。',
                                    en: 'Xingyu played the five vowel sounds in a new order. I could still find each one.',
                                },
                                ...(evaluation.attempt.sourceQuestionId
                                    ? { sourceQuestionId: evaluation.attempt.sourceQuestionId }
                                    : {}),
                            },
                        } : undefined,
                        transition.adaptive,
                    );
                }
                await context.save?.({ lessonZeroVowelProgress: transition.state });
            },
            onRestart: restart => context.save?.({ lessonZeroVowelProgress: restart }),
            onBack: () => context.back(),
            onComplete: () => this.completeSourceActivity(context, returning),
        });
        screen.element.dataset.academyRoute = 'source-activity';
        screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
        context.shell.replace(screen.element);
    }

    private async renderLessonZeroVowelWritingSession(context: AcademyRouteContext): Promise<void> {
        const definition = createLessonZeroVowelWritingDefinition();
        let state;
        try {
            state = startLessonZeroVowelWritingSession(
                definition,
                context.checkpoint.lessonZeroVowelWritingProgress,
            );
        } catch {
            state = startLessonZeroVowelWritingSession(definition);
        }
        if (state.status === 'paused') {
            state = transitionLessonZeroVowelWritingSession(
                definition,
                state,
                { kind: 'resume' },
                Date.now(),
            ).state;
        }
        if (JSON.stringify(state) !== JSON.stringify(context.checkpoint.lessonZeroVowelWritingProgress)) {
            await context.save?.({ lessonZeroVowelWritingProgress: state });
        }
        const returning = context.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID);
        const screen = createLessonZeroVowelWritingScreen({
            language: context.language,
            definition,
            initialState: state,
            pronunciation: this.options.pronunciation,
            rieSprite: ACADEMY_ASSETS.characters.approvedPerformances.rie.encouraging,
            onTransition: async (before, transition) => {
                if (transition.evaluation) {
                    this.playFeedbackSfx(transition.evaluation.result.outcome);
                    await this.options.evidence.recordActivity(
                        transition.evaluation,
                        LESSON_ZERO_ID,
                        undefined,
                        transition.adaptive,
                    );
                }
                if (before.status !== 'complete' && transition.state.status === 'complete') {
                    const completion = lessonZeroVowelWritingCompletionEvaluation(
                        definition,
                        lessonZeroVowelWritingAveragePassScore(transition.state),
                    );
                    await this.options.evidence.recordActivity(
                        completion,
                        LESSON_ZERO_ID,
                        {
                            id: 'lesson-zero-five-vowel-marks',
                            sceneId: 'scene:lesson-zero-five-vowel-marks',
                            journalLine: {
                                lineId: 'journal:lesson-zero:five-vowel-marks',
                                characterId: 'rie',
                                text: {
                                    ja: 'りえ先生と、あ・い・う・え・おを初めて書いた。五つの音が、五つの形になった。',
                                    en: 'I wrote あ・い・う・え・お with Rie-sensei for the first time. Five sounds became five shapes.',
                                },
                                sourceQuestionId: definition.sourceQuestionId,
                            },
                        },
                    );
                }
                await context.save?.({ lessonZeroVowelWritingProgress: transition.state });
            },
            onRestart: restart => context.save?.({ lessonZeroVowelWritingProgress: restart }),
            onBack: () => context.back(),
            onComplete: () => this.completeSourceActivity(context, returning),
        });
        screen.element.dataset.academyRoute = 'source-activity';
        screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
        context.shell.replace(screen.element);
    }

    private renderAdvancedPackage(packageId: string, context: AcademyRouteContext): void {
        const entry = resolveAdvancedCurriculumEntry(packageId);
        const screen = createAdvancedLessonScreen({
            language: context.language,
            entry,
            plate: advancedPlate(entry),
            runtime: createAcademyActivityRuntime(),
            pronunciation: this.options.pronunciation,
            onEvaluation: (activity, evaluation) => {
                this.playFeedbackSfx(evaluation.result.outcome);
                return this.options.evidence.recordActivity({
                    ...evaluation,
                    attempt: {
                        ...evaluation.attempt,
                        activityId: activity.id,
                    },
                }, `advanced:${entry.id}`);
            },
            onBack: () => void context.back(),
            onComplete: () => void context.go('class', {
                selectedBand: entry.band,
                lessonId: undefined,
                sectionId: undefined,
                activityId: undefined,
            }),
        });
        screen.element.dataset.academyRoute = 'source-activity';
        screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
        context.shell.replace(screen.element);
    }

    private renderAakashMeet(context: AcademyRouteContext): void {
        context.shell.replace(renderAakashMeetScreen({
            language: context.language,
            activity: createAakashDirectionsActivity(),
            completed: context.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID),
            onEvaluation: evaluation => {
                this.playFeedbackSfx(evaluation.result.outcome);
                return this.options.evidence.recordActivity(evaluation, LESSON_ZERO_ID, {
                    id: 'aakash-rainy-directions',
                    sceneId: AAKASH_RAINY_DIRECTIONS_SCENE_ID,
                    unlock: { assetId: 'character:aakash', characterId: 'aakash', bondDelta: 1 },
                });
            },
            onSupportUse: support => this.options.evidence.recordSupportUse(
                support.activityId,
                support.supportKind,
                support.choiceId,
            ),
            onContinue: () => void context.go('campus'),
        }));
    }

    private completeSourceActivity(context: AcademyRouteContext, returning: boolean): void {
        if (parseStoryCursor(context.checkpoint.sectionId)) {
            void context.go('story', {
                sectionId: context.checkpoint.sectionId,
                lessonId: undefined,
                activityId: undefined,
            });
            return;
        }
        void context.go(returning ? 'campus' : 'aakash-meet', {
            lessonId: undefined,
            sectionId: undefined,
            activityId: undefined,
        });
    }

    private async renderWritingPractice(context: AcademyRouteContext): Promise<void> {
        context.shell.replace(renderLoadingScreen(context.language, navigator.onLine));
        const trace = await this.options.kanjiWriting.lookup('一');
        if (!trace) throw new Error('The pinned KanjiVG writing trace is unavailable.');
        context.shell.replace(renderKanjiDeskScreen(
            context.language,
            trace,
            evaluation => {
                this.playFeedbackSfx(evaluation.result.outcome);
                return this.options.evidence.recordActivity(evaluation, LESSON_ZERO_ID, {
                    id: 'lesson-zero-writing-desk',
                    sceneId: 'scene:lesson-zero-writing-desk',
                    requiredErrorTag: 'kanji-writing-complete',
                });
            },
            () => void context.go('campus'),
        ));
    }

    private recordActivity(evaluation: ActivityEvaluation, milestoneId: string): Promise<void> {
        this.playFeedbackSfx(evaluation.result.outcome);
        const firstTask = evaluation.attempt.activityId === 'activity:lesson-zero-reconstruct-repair';
        return this.options.evidence.recordActivity(evaluation, LESSON_ZERO_ID, {
            id: milestoneId,
            sceneId: 'scene:lesson-zero-first-repair',
            ...(firstTask ? {
                journalLine: {
                    lineId: 'journal:lesson-zero:first-classroom-repair',
                    characterId: 'rie',
                    text: {
                        ja: '「もう一度お願いします」と言って、授業を続けられた。',
                        en: 'I asked Rie-sensei to repeat it, and class kept moving.',
                    },
                    ...(evaluation.attempt.sourceQuestionId
                        ? { sourceQuestionId: evaluation.attempt.sourceQuestionId }
                        : {}),
                },
            } : {}),
        });
    }
}

function advancedPlate(entry: AdvancedCurriculumEntry): AcademyPlateId {
    if (/sound|listening/u.test(entry.activity.kind)) return 'languageLab';
    if (/home|apartment|moving|coupon/u.test(entry.id)) return 'home';
    if (/pet/u.test(entry.id)) return 'cafe';
    if (/grammar|contrast/u.test(entry.id)) return 'classroom';
    return 'library';
}

function overviewState(
    authoredActivityIds: readonly string[],
    projection: LearnerProjection,
): LessonOverviewState {
    const authored = new Set(authoredActivityIds);
    const attemptedActivityIds = new Set<string>();
    const completedActivityIds = new Set<string>();
    const needsReviewActivityIds = new Set<string>();
    for (const activity of Object.values(projection.activities)) {
        if (!authored.has(activity.activityId)) continue;
        attemptedActivityIds.add(activity.activityId);
        if (activity.lastOutcome === 'pass') completedActivityIds.add(activity.activityId);
        else needsReviewActivityIds.add(activity.activityId);
    }
    return {
        boundActivityIds: new Set([
            LESSON_ZERO_GREETING_ACTIVITY_ID,
            LESSON_ZERO_VOWEL_SOUND_MAP_ID,
            LESSON_ZERO_VOWEL_WRITING_ID,
            LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID,
            LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID,
            ...LESSON_ZERO_CONSTRUCTED_CLASSROOM_ACTIVITY_IDS,
            LESSON_ZERO_SENTENCE_FRAMES_ACTIVITY_ID,
            LESSON_ZERO_NAME_CARD_ACTIVITY_ID,
            LESSON_ZERO_SOUND_ACTIVITY_ID,
            ...LESSON_ZERO_MISSION_ACTIVITY_IDS,
        ]),
        attemptedActivityIds,
        completedActivityIds,
        needsReviewActivityIds,
    };
}
