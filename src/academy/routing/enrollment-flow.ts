import { isAnonymousAcademyCode, type AccessGateway } from '../access/gateway';
import type { AcademySyncStatus } from '../account/sync-client';
import { createDonationClaimService, type DonationClaimService } from '../access/donation-claim';
import { createN3AdvancedEntryPlan } from '../content/advanced-entry';
import type { JlptBand, LearnerProfileSnapshot, StartingRoute } from '../domain/learner-record';
import type { LearnerEvidence } from '../evidence/learner-evidence';
import type { PronunciationService } from '../integration/yomu-bridge';
import type { OrientationMockResult, PlacementMockDraft } from '../placement/orientation';
import type { AcademyRoute } from '../persistence/indexeddb';
import { renderAccessScreen } from '../ui/access-screen';
import { renderAdvancedArrivalBridge } from '../ui/advanced-arrival-bridge';
import { renderRieUnlockScreen } from '../ui/character-scenes';
import { renderArrivalBridge } from '../ui/lesson-screen';
import { renderPlacementMockScreen, renderPlacementResultScreen } from '../ui/placement-screen';
import { renderProfileScreen } from '../ui/profile-screen';
import { renderManualBandScreen, renderStartScreen } from '../ui/start-screen';
import type { AcademyRouteContext, AcademyRouteFlow } from './types';

export interface EnrollmentFlowOptions {
    readonly access: AccessGateway;
    readonly evidence: LearnerEvidence;
    readonly pronunciation: PronunciationService;
    readonly audio?: { beginExternalLesson(duck?: number): () => void };
    readonly donationClaim?: DonationClaimService;
    /** Paid access must settle its account gate before Academy onboarding. */
    readonly account?: Pick<AcademyAccountGate, 'connect'>;
}

interface AcademyAccountGate {
    connect(): Promise<AcademySyncStatus>;
}

export function createEnrollmentFlow(options: EnrollmentFlowOptions): AcademyRouteFlow {
    return new EnrollmentFlow(options);
}

class EnrollmentFlow implements AcademyRouteFlow {
    private readonly donationClaim: DonationClaimService;
    private placementDraft: PlacementMockDraft | null = null;
    private releaseExternalListening: (() => void) | null = null;

    constructor(private readonly options: EnrollmentFlowOptions) {
        this.donationClaim = options.donationClaim ?? createDonationClaimService();
    }

    async render(route: AcademyRoute, context: AcademyRouteContext): Promise<boolean> {
        switch (route) {
            case 'access':
                context.shell.replace(renderAccessScreen({
                    language: context.language,
                    onSubmit: code => this.openSession(code, context),
                    claim: this.donationClaim,
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
                context.shell.replace(renderRieUnlockScreen(context.language, () => void context.go('start')));
                return true;
            case 'start':
                context.shell.replace(renderStartScreen(context.language, choice => void this.chooseStart(choice, context)));
                return true;
            case 'manual-band':
                context.shell.replace(renderManualBandScreen(
                    context.language,
                    band => void this.chooseBand(band, context),
                    () => void context.back(),
                ));
                return true;
            case 'placement-mock':
                context.shell.replace(renderPlacementMockScreen({
                    language: context.language,
                    pronunciation: this.options.pronunciation,
                    onListeningStart: () => this.beginExternalListening(),
                    onListeningStop: () => this.endExternalListening(),
                    draft: this.placementDraft ?? undefined,
                    onResult: (result, draft) => void this.savePlacement(result, draft, context),
                    onBack: () => {
                        this.placementDraft = null;
                        void context.back();
                    },
                }));
                return true;
            case 'placement-result':
                this.renderPlacementResult(context);
                return true;
            case 'arrival-bridge':
                if (requiredBand(context) === 'n3') {
                    const plan = createN3AdvancedEntryPlan({
                        events: await this.options.evidence.history(),
                        placementAccepted: context.projection.curriculumEntry?.route === 'placement-mock'
                            && context.projection.curriculumEntry.recommendationAccepted === true,
                        now: Date.now(),
                    });
                    context.shell.replace(renderAdvancedArrivalBridge({
                        language: context.language,
                        plan,
                        onEvaluation: evaluation => this.options.evidence.recordActivity(
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
                        ),
                        onListeningStart: () => this.beginExternalListening(),
                        onListeningStop: () => this.endExternalListening(),
                        onContinue: () => void context.go('campus'),
                    }));
                    return true;
                }
                context.shell.replace(renderArrivalBridge(
                    context.language,
                    requiredBand(context),
                    () => void context.go('campus'),
                ));
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

    private async openSession(code: string, context: AcademyRouteContext): Promise<void> {
        const session = await this.options.access.exchange(code);
        if (isAnonymousAcademyCode(code)) {
            await context.go(academyEntryRoute(context), { session });
            return;
        }

        // The paid session cookie is already established by the exchange. The
        // account route is persisted before its Google recovery controls run.
        await this.options.account?.connect();
        await context.go('profile-sync', { session });
    }

    private async saveProfile(profile: LearnerProfileSnapshot, context: AcademyRouteContext): Promise<void> {
        const { firstIntroduction } = await this.options.evidence.saveProfile(profile);
        await context.go(firstIntroduction ? 'rie-unlock' : 'start');
    }

    private async chooseStart(route: StartingRoute, context: AcademyRouteContext): Promise<void> {
        if (route === 'manual-band') return context.go('manual-band', { placementOverride: false });
        if (route === 'placement-mock') return context.go('placement-mock', { placementOverride: false });
        await this.options.evidence.chooseCurriculumEntry({ route: 'lesson-zero' });
        await context.go('campus', {
            selectedBand: undefined,
            lessonId: 'lesson:foundation-00',
            sectionId: undefined,
            activityId: undefined,
        });
    }

    private async chooseBand(band: JlptBand, context: AcademyRouteContext): Promise<void> {
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
            lessonId: undefined,
            sectionId: storySection,
            activityId: undefined,
        });
    }

    private async savePlacement(
        result: OrientationMockResult,
        draft: PlacementMockDraft,
        context: AcademyRouteContext,
    ): Promise<void> {
        this.placementDraft = draft;
        await this.options.evidence.savePlacement(result);
        await context.go('placement-result', { selectedBand: result.recommendedBand });
    }

    private renderPlacementResult(context: AcademyRouteContext): void {
        const placement = context.projection.latestPlacement;
        if (!placement) {
            void context.go('placement-mock');
            return;
        }
        const result: OrientationMockResult = {
            assessmentId: placement.assessmentId === 'academy-orientation-mock:v2'
                ? 'academy-orientation-mock:v2'
                : 'academy-orientation-mock:v1',
            targetBand: placement.targetBand,
            itemIds: placement.itemIds,
            scores: placement.scores,
            recommendedBand: placement.recommendedBand,
            recommendedStart: placement.recommendedStart ?? placement.recommendedBand,
            calibration: 'vertical-slice',
        };
        context.shell.replace(renderPlacementResultScreen({
            language: context.language,
            result,
            onAccept: () => void this.acceptPlacement(result, context),
            onChoose: () => void context.go('manual-band', { placementOverride: true }),
            onReview: () => void context.back(),
        }));
    }

    private async acceptPlacement(result: OrientationMockResult, context: AcademyRouteContext): Promise<void> {
        this.placementDraft = null;
        const storySection = placementStorySection(context);
        if (result.recommendedStart === 'lesson-zero') {
            await this.options.evidence.chooseCurriculumEntry({
                route: 'lesson-zero',
            });
            await context.go('campus', {
                selectedBand: undefined,
                placementOverride: false,
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
            lessonId: undefined,
            sectionId: storySection,
            activityId: undefined,
        });
    }

}

function academyEntryRoute(context: AcademyRouteContext): 'profile' | 'start' {
    return context.projection.profile ? 'start' : 'profile';
}

function requiredBand(context: AcademyRouteContext): JlptBand {
    const band = context.checkpoint.selectedBand;
    if (!band) throw new Error('Arrival bridge requires a selected JLPT band.');
    return band;
}

function placementStorySection(context: AcademyRouteContext): string | undefined {
    for (let index = context.checkpoint.routeHistory.length - 1; index >= 0; index -= 1) {
        const frame = context.checkpoint.routeHistory[index]!;
        if (frame.route === 'story') return frame.sectionId;
    }
    return undefined;
}
