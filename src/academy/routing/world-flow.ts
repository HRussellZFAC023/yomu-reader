import type { AudioDirector } from '../audio/director';
import type { ReviewRating } from '../domain/learner-record';
import type { LearnerEvidence } from '../evidence/learner-evidence';
import type { PronunciationService } from '../integration/yomu-bridge';
import type { AcademyRoute } from '../persistence/indexeddb';
import { renderAakashMemory } from '../ui/character-scenes';
import { renderDayEndScene } from '../ui/day-end-scene';
import { renderOpeningMemory } from '../ui/lesson-screen';
import { renderLoadingScreen } from '../ui/loading-screen';
import {
    renderCampusScreen,
    renderJournalScreen,
    renderLanguageLabScreen,
    renderLocationScreen,
    renderReviewScreen,
    type CampusLocation,
} from '../ui/world-screen';
import type { AcademyRouteContext, AcademyRouteFlow } from './types';

export interface WorldFlowOptions {
    readonly evidence: LearnerEvidence;
    readonly pronunciation: PronunciationService;
    readonly audio: AudioDirector;
}

export function createWorldFlow(options: WorldFlowOptions): AcademyRouteFlow {
    return new WorldFlow(options);
}

class WorldFlow implements AcademyRouteFlow {
    constructor(private readonly options: WorldFlowOptions) {}

    async render(route: AcademyRoute, context: AcademyRouteContext): Promise<boolean> {
        switch (route) {
            case 'campus':
                context.shell.replace(renderCampusScreen(
                    context.language,
                    Object.keys(context.projection.reviewRatings).length > 0,
                    location => void this.enterLocation(location, context),
                    context.checkpoint.selectedFork,
                ));
                return true;
            case 'lab':
                this.renderLanguageLab(context);
                return true;
            case 'review':
                await this.renderReview(context);
                return true;
            case 'journal':
                await this.renderJournal(context);
                return true;
            case 'day-end':
                context.shell.replace(renderDayEndScene({
                    language: context.language,
                    onReturn: () => void context.go('campus'),
                }));
                return true;
            default:
                return false;
        }
    }

    private async enterLocation(location: CampusLocation, context: AcademyRouteContext): Promise<void> {
        if (location === 'library') return context.go('review');
        if (location === 'classroom') {
            return context.projection.curriculumEntry?.band
                ? context.go('band-entry', { selectedBand: context.projection.curriculumEntry.band })
                : context.go('lesson-fork');
        }
        if (location === 'lab') return context.go('lab');
        await this.options.audio.setTheme('cafe.social');
        context.shell.setNavigation(true, 'campus');
        context.shell.replace(renderLocationScreen(context.language, location, () => void context.go('campus')));
    }

    private renderLanguageLab(context: AcademyRouteContext): void {
        const listening = context.projection.activities['activity:language-lab-repeat-listening'];
        const shadowing = context.projection.activities['activity:language-lab-repeat-shadowing'];
        context.shell.replace(renderLanguageLabScreen(
            context.language,
            this.options.pronunciation,
            {
                transcriptRevealed: Boolean(listening?.attemptCount),
                listeningPassed: context.projection.completedScenes.includes('scene:language-lab-repeat-listening'),
                shadowed: shadowing?.lastOutcome === 'pass',
            },
            evaluation => this.recordLabEvaluation(evaluation, context),
            () => this.recordShadowing(context),
            () => void context.go('campus'),
        ));
    }

    private async recordLabEvaluation(
        evaluation: Parameters<LearnerEvidence['recordActivity']>[0],
        context: AcademyRouteContext,
    ): Promise<void> {
        await this.options.evidence.recordActivity(evaluation, {
            id: 'language-lab-repeat-listening',
            sceneId: 'scene:language-lab-repeat-listening',
        });
        await context.go('lab');
    }

    private async recordShadowing(context: AcademyRouteContext): Promise<void> {
        await this.options.evidence.recordShadowing();
        await context.go('lab');
    }

    private async renderReview(context: AcademyRouteContext): Promise<void> {
        context.shell.replace(renderLoadingScreen(context.language, navigator.onLine));
        const items = await this.options.evidence.dueReviews(10);
        context.shell.replace(renderReviewScreen(
            context.language,
            items,
            (item, rating) => this.rateReview(item.id, rating),
            () => void this.refreshAndGo(context, 'campus'),
        ));
    }

    private rateReview(itemId: string, rating: ReviewRating): Promise<void> {
        return this.options.evidence.rateReview(itemId, rating);
    }

    private async renderJournal(context: AcademyRouteContext): Promise<void> {
        const profile = context.projection.profile;
        if (!profile) {
            await context.go('profile');
            return;
        }
        context.shell.replace(renderJournalScreen(
            context.language,
            profile,
            {
                rieChapters: context.projection.relationshipJournal.rie?.chapters
                    ?? legacyRelationshipChapters(context.projection.bonds.rie),
                aakashChapters: context.projection.relationshipJournal.aakash?.chapters
                    ?? legacyRelationshipChapters(context.projection.bonds.aakash),
                aakashUnlocked: context.projection.unlockedAssets.includes('character:aakash'),
            },
            {
                onReplayRie: () => this.replayOpening(context),
                onReplayAakash: () => this.replayAakash(context),
            },
        ));
    }

    private replayOpening(context: AcademyRouteContext): void {
        context.shell.setNavigation(false);
        context.shell.replace(renderOpeningMemory(context.language, () => void context.go('journal')));
    }

    private replayAakash(context: AcademyRouteContext): void {
        context.shell.setNavigation(false);
        context.shell.replace(renderAakashMemory(context.language, () => void context.go('journal')));
    }

    private async refreshAndGo(context: AcademyRouteContext, route: AcademyRoute): Promise<void> {
        await this.options.evidence.refresh();
        await context.go(route);
    }
}

function legacyRelationshipChapters(bond: number | undefined): readonly number[] {
    return bond && bond > 0 ? [1] : [];
}
