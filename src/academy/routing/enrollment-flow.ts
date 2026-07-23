import type { AccessGateway } from '../access/gateway';
import type { AcademySyncStatus } from '../account/sync-client';
import { createN3AdvancedEntryPlan } from '../content/advanced-entry';
import { serializeStoryCursor } from '../content/story-runner';
import { loadOpeningArrivalArc } from '../content/story-runtime';
import type { JlptBand, LearnerProfileSnapshot, StartingRoute } from '../domain/learner-record';
import type { PlacementMockProgress } from '../domain/placement-session';
import type { LearnerEvidence } from '../evidence/learner-evidence';
import type { PronunciationService } from '../integration/yomu-bridge';
import { scoreOrientationMock, type OrientationMockResult } from '../placement/orientation';
import type { SfxCue } from '../audio/types';
import { createStoryVoicePlayback, type StoryVoiceAudioDirector } from '../audio/voice-lines';
import type { AcademyRoute } from '../persistence/indexeddb';
import { renderAccessScreen } from '../ui/access-screen';
import { renderAdvancedArrivalBridge } from '../ui/advanced-arrival-bridge';
import { renderRieUnlockScreen } from '../ui/character-scenes';
import { renderPlacementMockScreen, renderPlacementResultScreen } from '../ui/placement-screen';
import { renderProfileScreen } from '../ui/profile-screen';
import { renderManualBandScreen, renderStartScreen } from '../ui/start-screen';
import { renderStoryArcScreen } from '../ui/story-screen';
import type { AcademyRouteContext, AcademyRouteFlow } from './types';

export interface EnrollmentFlowOptions {
    readonly access: AccessGateway;
    readonly evidence: LearnerEvidence;
    readonly pronunciation: PronunciationService;
    readonly audio?: StoryVoiceAudioDirector & { playSfx?(cue: SfxCue): void };
    /** Paid access must settle its account gate before Academy onboarding. */
    readonly account?: Pick<AcademyAccountGate, 'connect'>;
    /** Development-only seam; production entrypoints never enable it. */
    readonly skipAccountGate?: boolean;
}

interface AcademyAccountGate {
    connect(): Promise<AcademySyncStatus>;
}

export function createEnrollmentFlow(options: EnrollmentFlowOptions): AcademyRouteFlow {
    return new EnrollmentFlow(options);
}

class EnrollmentFlow implements AcademyRouteFlow {
    private releaseExternalListening: (() => void) | null = null;

    constructor(private readonly options: EnrollmentFlowOptions) {}

    async render(route: AcademyRoute, context: AcademyRouteContext): Promise<boolean> {
        switch (route) {
            case 'access':
                context.shell.replace(renderAccessScreen({
                    language: context.language,
                    onSubmit: (code, signal) => this.openSession(code, signal, context),
                }));
                return true;
            case 'profile':
                context.shell.replace(renderProfileScreen({
                    language: context.language,
                    profile: context.projection.profile,
                    onSubmit: profile => this.saveProfile(profile, context),
                    onBack: context.checkpoint.routeHistory.length > 0
                        ? () => void context.back()
                        : undefined,
                }));
                return true;
            case 'rie-unlock':
                {
                    const voice = this.createVoicePlayback();
                context.shell.replace(renderRieUnlockScreen({
                    language: context.language,
                    ...(voice ? { voice } : {}),
                    onComplete: () => this.completeRieIntroduction(context),
                }));
                return true;
                }
            case 'start':
                context.shell.replace(renderStartScreen(
                    context.language,
                    choice => this.chooseStart(choice, context),
                    () => this.options.audio?.playSfx?.('menu.move'),
                ));
                return true;
            case 'manual-band':
                context.shell.replace(renderManualBandScreen(
                    context.language,
                    band => this.chooseBand(band, context),
                    () => {
                        this.options.audio?.playSfx?.('menu.cancel');
                        return context.back();
                    },
                    () => this.options.audio?.playSfx?.('menu.move'),
                ));
                return true;
            case 'placement-mock':
                context.shell.replace(renderPlacementMockScreen({
                    language: context.language,
                    pronunciation: this.options.pronunciation,
                    onListeningStart: () => this.beginExternalListening(),
                    onListeningStop: () => this.endExternalListening(),
                    progress: context.checkpoint.placementProgress,
                    onProgress: progress => this.savePlacementProgress(progress, context),
                    onMove: () => this.options.audio?.playSfx?.('menu.move'),
                    onConfirm: () => this.options.audio?.playSfx?.('menu.confirm'),
                    onCancel: () => this.options.audio?.playSfx?.('menu.cancel'),
                    onResult: result => context.go('placement-result', { selectedBand: result.recommendedBand }),
                    onBack: async () => {
                        await context.save?.({ placementProgress: undefined });
                        await context.back();
                    },
                }));
                return true;
            case 'placement-result':
                this.renderPlacementResult(context);
                return true;
            case 'arrival-bridge':
                if (context.checkpoint.selectedBand === 'n3') {
                    const plan = createN3AdvancedEntryPlan({
                        events: await this.options.evidence.history(),
                        placementAccepted: context.projection.curriculumEntry?.route === 'placement-mock'
                            && context.projection.curriculumEntry.recommendationAccepted === true,
                        now: Date.now(),
                    });
                    const completed = context.projection.activities[plan.activity.id]?.lastOutcome === 'pass';
                    if (completed) {
                        this.renderArrivalStory(context);
                        return true;
                    }
                    context.shell.replace(renderAdvancedArrivalBridge({
                        language: context.language,
                        plan,
                        onEvaluation: evaluation => {
                            this.options.audio?.playSfx?.(
                                evaluation.result.outcome === 'pass' ? 'feedback.correct' : 'feedback.repair',
                            );
                            return this.options.evidence.recordActivity(
                            evaluation,
                            plan.lessonId,
                            undefined,
                            {
                                modeId: `advanced-entry:n3:${plan.mode}`,
                                skill: 'listening',
                                action: 'listen',
                                sourceId: plan.sourceId,
                                independent: plan.independent,
                            },
                            );
                        },
                        onListeningStart: () => this.beginExternalListening(),
                        onListeningStop: () => this.endExternalListening(),
                        onContinue: () => {
                            void context.save?.({ sectionId: undefined });
                            this.renderArrivalStory(context);
                        },
                        onBack: () => {
                            this.options.audio?.playSfx?.('menu.cancel');
                            void context.back();
                        },
                    }));
                    return true;
                }
                this.renderArrivalStory(context);
                return true;
            default:
                return false;
        }
    }

    private beginExternalListening(): void {
        this.endExternalListening();
        try {
            this.releaseExternalListening = this.options.audio?.beginExternalLesson(0.25) ?? null;
        } catch {
            // The native control remains usable if the shared director is still locked.
            this.releaseExternalListening = null;
        }
    }

    private endExternalListening(): void {
        this.releaseExternalListening?.();
        this.releaseExternalListening = null;
    }

    private async openSession(
        code: string,
        signal: AbortSignal,
        context: AcademyRouteContext,
    ): Promise<void> {
        const session = await this.options.access.exchange(code, signal);
        if (signal.aborted) return;

        if (this.options.skipAccountGate) {
            await context.go('profile', { session });
            return;
        }

        // Every invite requires a signed-in account before Academy resources
        // unlock. The session cookie is already established by the exchange;
        // the account route is persisted before its Google recovery controls
        // run.
        await this.options.account?.connect();
        if (signal.aborted) return;
        await context.go('profile-sync', { session });
    }

    private async saveProfile(profile: LearnerProfileSnapshot, context: AcademyRouteContext): Promise<void> {
        const { firstIntroduction } = await this.options.evidence.saveProfile(profile);
        await context.go(firstIntroduction ? 'rie-unlock' : 'start');
    }

    private async completeRieIntroduction(context: AcademyRouteContext): Promise<void> {
        await this.options.evidence.completeRieIntroduction();
        await context.go('start');
    }

    private async chooseStart(route: StartingRoute, context: AcademyRouteContext): Promise<void> {
        this.options.audio?.playSfx?.('menu.confirm');
        if (route === 'manual-band') return context.go('manual-band', { placementOverride: false });
        if (route === 'placement-mock') return context.go('placement-mock', { placementOverride: false });
        await this.options.evidence.chooseCurriculumEntry({ route: 'lesson-zero' });
        await context.go('arrival-bridge', {
            selectedBand: undefined,
            lessonId: 'lesson:foundation-00',
            sectionId: undefined,
            activityId: undefined,
        });
    }

    private async chooseBand(band: JlptBand, context: AcademyRouteContext): Promise<void> {
        this.options.audio?.playSfx?.('menu.confirm');
        const fromPlacement = context.checkpoint.placementOverride === true;
        const storySection = placementStorySection(context);
        await this.options.evidence.chooseCurriculumEntry({
            route: fromPlacement ? 'placement-mock' : 'manual-band',
            band,
            ...(fromPlacement ? { recommendationAccepted: false } : {}),
        });
        await context.go('arrival-bridge', {
            selectedBand: band,
            placementOverride: false,
            ...(fromPlacement ? { placementProgress: undefined } : {}),
            lessonId: undefined,
            sectionId: storySection,
            activityId: undefined,
        });
    }

    private async savePlacementProgress(
        progress: PlacementMockProgress,
        context: AcademyRouteContext,
    ): Promise<void> {
        if (!context.save) throw new Error('Placement requires durable route-state persistence.');
        await context.save({ placementProgress: progress });
    }

    private renderPlacementResult(context: AcademyRouteContext): void {
        const pending = context.checkpoint.placementProgress?.submitted
            ? context.checkpoint.placementProgress
            : undefined;
        const placement = context.projection.latestPlacement;
        if (!pending && !placement) {
            void context.go('placement-mock');
            return;
        }
        const result: OrientationMockResult = pending
            ? scoreOrientationMock(
                pending.draft.targetBand,
                pending.draft.responses,
                {
                    speaking: pending.draft.production.speaking.confidence,
                    writing: pending.draft.production.writing.confidence,
                },
                pending.draft.listeningModes,
            )
            : {
                assessmentId: placement!.assessmentId === 'academy-orientation-mock:v2'
                    ? 'academy-orientation-mock:v2'
                    : 'academy-orientation-mock:v1',
                targetBand: placement!.targetBand,
                itemIds: placement!.itemIds,
                scores: placement!.scores,
                recommendedBand: placement!.recommendedBand,
                recommendedStart: placement!.recommendedStart ?? placement!.recommendedBand,
                calibration: 'vertical-slice',
            };
        context.shell.replace(renderPlacementResultScreen({
            language: context.language,
            result,
            draft: pending?.draft,
            onAccept: () => this.acceptPlacement(result, context, Boolean(pending)),
            onChoose: () => {
                this.options.audio?.playSfx?.('menu.confirm');
                return context.go('manual-band', { placementOverride: true });
            },
            onReview: () => {
                this.options.audio?.playSfx?.('menu.cancel');
                return context.back();
            },
        }));
    }

    private async acceptPlacement(
        result: OrientationMockResult,
        context: AcademyRouteContext,
        needsCanonicalSave: boolean,
    ): Promise<void> {
        this.options.audio?.playSfx?.('menu.confirm');
        if (needsCanonicalSave) await this.options.evidence.savePlacement(result);
        const storySection = placementStorySection(context);
        if (result.recommendedStart === 'lesson-zero') {
            await this.options.evidence.chooseCurriculumEntry({
                route: 'lesson-zero',
            });
            await context.go('arrival-bridge', {
                selectedBand: undefined,
                placementOverride: false,
                ...(needsCanonicalSave ? { placementProgress: undefined } : {}),
                lessonId: 'lesson:foundation-00',
                sectionId: storySection,
                activityId: undefined,
            });
            return;
        }
        await this.options.evidence.chooseCurriculumEntry({
            route: 'placement-mock',
            band: result.recommendedStart,
            recommendationAccepted: true,
        });
        await context.go('arrival-bridge', {
            selectedBand: result.recommendedStart,
            placementOverride: false,
            ...(needsCanonicalSave ? { placementProgress: undefined } : {}),
            lessonId: undefined,
            sectionId: storySection,
            activityId: undefined,
        });
    }

    private renderArrivalStory(context: AcademyRouteContext): void {
        const arc = loadOpeningArrivalArc();
        const audio = this.options.audio;
        const voice = this.createVoicePlayback();
        const finish = async (completionEligible: boolean): Promise<void> => {
            if (!completionEligible) return;
            await this.options.evidence.recordEncounter({
                encounterId: `story:${arc.episodeId}:complete`,
                sceneId: arc.lastSceneId,
                attendeeIds: ['rie'],
            });
            await context.go('campus', {
                sectionId: undefined,
                activityId: undefined,
                lessonId: context.projection.curriculumEntry?.route === 'lesson-zero'
                    ? 'lesson:foundation-00'
                    : undefined,
            });
        };
        context.shell.replace(renderStoryArcScreen({
            language: context.language,
            arc,
            mode: 'canonical',
            ...(context.projection.profile ? { learner: context.projection.profile } : {}),
            sectionId: context.checkpoint.sectionId,
            selectedBand: context.checkpoint.selectedBand,
            ...(audio?.playSfx ? { audio: { playSfx: cue => audio.playSfx?.(cue) } } : {}),
            ...(voice ? { createVoicePlayback: () => voice } : {}),
            onCheckpoint: cursor => context.save?.({
                sectionId: serializeStoryCursor(cursor),
            }),
            onArcSceneEncounter: (_episodeId, sceneId, attendeeIds) => {
                if (!attendeeIds.length) return;
                return this.options.evidence.recordEncounter({
                    encounterId: `story:${arc.episodeId}:scene:${sceneId}`,
                    sceneId,
                    attendeeIds,
                });
            },
            onBack: () => {
                audio?.playSfx?.('menu.cancel');
                void context.back();
            },
            finishLabel: context.language === 'ja' ? '中庭へ' : 'Step into the courtyard',
            completionLine: {
                japanese: '中庭へ',
                english: 'The courtyard is just through the door.',
            },
            onFinish: finish,
        }));
    }

    private createVoicePlayback(): ReturnType<typeof createStoryVoicePlayback> | undefined {
        const audio = this.options.audio;
        if (!audio || typeof audio.onEvent !== 'function') return undefined;
        return createStoryVoicePlayback({ director: audio });
    }

}

function placementStorySection(context: AcademyRouteContext): string | undefined {
    for (let index = context.checkpoint.routeHistory.length - 1; index >= 0; index -= 1) {
        const frame = context.checkpoint.routeHistory[index]!;
        if (frame.route === 'story') return frame.sectionId;
    }
    return undefined;
}
