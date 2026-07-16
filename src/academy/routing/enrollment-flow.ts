import type { AccessGateway } from '../access/gateway';
import { createDonationClaimService, type DonationClaimService } from '../access/donation-claim';
import type { JlptBand, LearnerProfileSnapshot, StartingRoute } from '../domain/learner-record';
import type { LearnerEvidence } from '../evidence/learner-evidence';
import type { PronunciationService } from '../integration/yomu-bridge';
import type { OrientationMockResult } from '../placement/orientation';
import type { AcademyRoute } from '../persistence/indexeddb';
import { renderAccessScreen } from '../ui/access-screen';
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
    readonly donationClaim?: DonationClaimService;
}

export function createEnrollmentFlow(options: EnrollmentFlowOptions): AcademyRouteFlow {
    return new EnrollmentFlow(options);
}

class EnrollmentFlow implements AcademyRouteFlow {
    private readonly donationClaim: DonationClaimService;

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
                    onResult: result => void this.savePlacement(result, context),
                    onBack: () => void context.back(),
                }));
                return true;
            case 'placement-result':
                this.renderPlacementResult(context);
                return true;
            case 'arrival-bridge':
                context.shell.replace(renderArrivalBridge(
                    context.language,
                    requiredBand(context),
                    () => void context.go('class'),
                ));
                return true;
            default:
                return false;
        }
    }

    private async openSession(code: string, context: AcademyRouteContext): Promise<void> {
        const session = await this.options.access.exchange(code);
        await context.go(context.projection.profile ? 'start' : 'profile', { session });
    }

    private async saveProfile(profile: LearnerProfileSnapshot, context: AcademyRouteContext): Promise<void> {
        const { firstIntroduction } = await this.options.evidence.saveProfile(profile);
        await context.go(firstIntroduction ? 'rie-unlock' : 'start');
    }

    private async chooseStart(route: StartingRoute, context: AcademyRouteContext): Promise<void> {
        if (route === 'manual-band') return context.go('manual-band', { placementOverride: false });
        if (route === 'placement-mock') return context.go('placement-mock', { placementOverride: false });
        await this.options.evidence.chooseCurriculumEntry({ route: 'lesson-zero' });
        await context.go('lesson-overview', {
            selectedBand: undefined,
            lessonId: 'lesson:foundation-00',
            sectionId: undefined,
            activityId: undefined,
        });
    }

    private async chooseBand(band: JlptBand, context: AcademyRouteContext): Promise<void> {
        const fromPlacement = context.checkpoint.placementOverride === true;
        await this.options.evidence.chooseCurriculumEntry({
            route: fromPlacement ? 'placement-mock' : 'manual-band',
            band,
            ...(fromPlacement ? { recommendationAccepted: false } : {}),
        });
        await context.go('arrival-bridge', { selectedBand: band, placementOverride: false });
    }

    private async savePlacement(result: OrientationMockResult, context: AcademyRouteContext): Promise<void> {
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
            assessmentId: 'academy-orientation-mock:v1',
            targetBand: placement.targetBand,
            itemIds: placement.itemIds,
            scores: placement.scores,
            recommendedBand: placement.recommendedBand,
            calibration: 'vertical-slice',
        };
        context.shell.replace(renderPlacementResultScreen({
            language: context.language,
            result,
            onAccept: () => void this.acceptPlacement(result, context),
            onChoose: () => void context.go('manual-band', { placementOverride: true }),
        }));
    }

    private async acceptPlacement(result: OrientationMockResult, context: AcademyRouteContext): Promise<void> {
        await this.options.evidence.chooseCurriculumEntry({
            route: 'placement-mock',
            band: result.recommendedBand,
            recommendationAccepted: true,
        });
        await context.go('arrival-bridge', { selectedBand: result.recommendedBand, placementOverride: false });
    }

}

function requiredBand(context: AcademyRouteContext): JlptBand {
    const band = context.checkpoint.selectedBand;
    if (!band) throw new Error('Arrival bridge requires a selected JLPT band.');
    return band;
}
