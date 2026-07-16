import { ACADEMY_ASSETS } from '../assets';
import { AAKASH_RAINY_DIRECTIONS_SCENE_ID, createAakashDirectionsActivity } from '../content/aakash-meet';
import { getAuthoredWeekRegistration, getCompleteLessonRegistration } from '../content/lesson-content-registry';
import {
    loadSenseiVocabularyPrerequisite,
} from '../content/lesson-vocabulary-prerequisite';
import { libraryVocabularyReviewSeeds } from '../content/library-vocabulary-sheet';
import { loadReachableLessonActivityChapter } from '../content/lesson-activity-catalog';
import { loadClassWeekCastPlan } from '../content/class-week-cast-plan-loader';
import { createLessonStoryRuntime, lessonStoryEncounter, lessonStoryPresentation } from '../content/lesson-story-runtime';
import { loadLessonZeroContent } from '../content/lesson-zero';
import { loadVerticalSliceContent, openingForkActivityId } from '../content/vertical-slice';
import type { ActivityEvaluation } from '../domain/activity-runtime';
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
    readonly audio?: { beginExternalLesson(duck?: number): () => void };
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
        const presentation = continuity ? lessonStoryPresentation(continuity) : undefined;
        const classWeek = plan.weeks.find(week => week.weekId === registration.classWeekId);
        if (!classWeek || classWeek.status !== 'source-backed' || !classWeek.primary) {
            throw new Error(`Class Week ${registration.classWeekId} has no grounded attendee roster.`);
        }
        const primary = classWeek.primary;
        const response = await fetch(`/academy/content/lessons/${registration.filename}`);
        if (!response.ok) throw new Error(`Unable to load class Week ${packageId}.`);
        const week = registration.validate(await response.json());
        const authoredLessonId = `authored-week:${registration.packageId}` as const;
        const prerequisite = await loadSenseiVocabularyPrerequisite(authoredLessonId);
        const chapter = await loadReachableLessonActivityChapter(packageId, this.options.kanjiWriting);
        const extension = chapter ? createReachableLessonActivityExtension({
            language: context.language,
            chapter,
            ...(presentation ? { presentation: { location: presentation.location } } : {}),
            runtime: createAcademyActivityRuntime(),
            pronunciation: this.options.pronunciation,
            onEvaluation: (_activity, evaluation) => this.options.evidence.recordActivity(
                evaluation,
                `authored-week:${packageId}`,
            ),
        }) : undefined;
        const showActivities = () => {
            let releaseListeningDuck: (() => void) | undefined;
            const screen = createAuthoredWeekScreen({
            language: context.language,
            week,
            ...(continuity?.callback ? {
                storyContext: {
                    hostId: continuity.hostId,
                    hostName: displayAcademyCastName(continuity.hostId, context.language),
                    ...(presentation ? {
                        originPlaceId: presentation.originPlaceId,
                        plate: presentation.plate,
                        location: presentation.location,
                    } : {}),
                    setup: continuity.setup,
                    callback: continuity.callback.meaningNow,
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
            onEvaluation: (activity, evaluation) => this.options.evidence.recordActivity({
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
            }, `authored-week:${packageId}`),
            onComplete: async () => {
                await this.options.evidence.recordEncounter(continuity
                    ? lessonStoryEncounter(continuity)
                    : {
                        encounterId: `class-week:${classWeek.weekId}`,
                        sceneId: `scene:class-week:${classWeek.weekId}`,
                        attendeeIds: [primary.id, ...classWeek.supporting.map(member => member.id)],
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
            screen.element.addEventListener('academy:dispose', () => screen.dispose(), { once: true });
            context.shell.replace(screen.element);
        };
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

    private renderAakashMeet(context: AcademyRouteContext): void {
        context.shell.replace(renderAakashMeetScreen({
            language: context.language,
            activity: createAakashDirectionsActivity(),
            completed: context.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID),
            onEvaluation: evaluation => this.options.evidence.recordActivity(evaluation, LESSON_ZERO_ID, {
                id: 'aakash-rainy-directions',
                sceneId: AAKASH_RAINY_DIRECTIONS_SCENE_ID,
                unlock: { assetId: 'character:aakash', characterId: 'aakash', bondDelta: 1 },
            }),
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
            evaluation => this.options.evidence.recordActivity(evaluation, LESSON_ZERO_ID, {
                id: 'lesson-zero-writing-desk',
                sceneId: 'scene:lesson-zero-writing-desk',
                requiredErrorTag: 'kanji-writing-complete',
            }),
            () => void context.go('campus'),
        ));
    }

    private recordActivity(evaluation: ActivityEvaluation, milestoneId: string): Promise<void> {
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
        boundActivityIds: new Set(['activity:lesson-zero-reconstruct-repair']),
        attemptedActivityIds,
        completedActivityIds,
        needsReviewActivityIds,
    };
}
