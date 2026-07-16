import type { AudioDirector } from '../audio/director';
import { loadClassWeekCastPlan } from '../content/class-week-cast-plan-loader';
import { loadClassWeekDeliveryCatalog } from '../content/class-week-delivery-catalog';
import type { JlptBand } from '../domain/learner-record';
import type { LearnerEvidence } from '../evidence/learner-evidence';
import {
    createCanonicalAcademyStudyModule,
    mountAcademyStudyModule,
    type AcademyStudyModule,
} from '../integration/study-module';
import type { PronunciationService } from '../integration/yomu-bridge';
import type { AcademyRoute } from '../persistence/indexeddb';
import { renderAakashMemory } from '../ui/character-scenes';
import { renderClassPathScreen } from '../ui/class-path-screen';
import { renderDayEndScene } from '../ui/day-end-scene';
import { renderOpeningMemory } from '../ui/lesson-screen';
import { renderLoadingScreen } from '../ui/loading-screen';
import {
    renderCampusScreen,
    renderJournalScreen,
    renderLocationScreen,
    type CampusLocation,
} from '../ui/world-screen';
import type { AcademyRouteContext, AcademyRouteFlow } from './types';

export interface WorldFlowOptions {
    readonly evidence: LearnerEvidence;
    readonly pronunciation: PronunciationService;
    readonly audio: AudioDirector;
    readonly study?: AcademyStudyModule;
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
                    new Set(['lab']),
                ));
                return true;
            case 'class':
                await this.renderClassPath(context);
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
                ? context.go('class', { selectedBand: context.projection.curriculumEntry.band })
                : context.go('lesson-overview', { lessonId: 'lesson:foundation-00' });
        }
        if (location === 'lab') return;
        await this.options.audio.setTheme('cafe.social');
        context.shell.setNavigation(true, 'campus');
        context.shell.replace(renderLocationScreen(context.language, location, () => void context.go('campus')));
    }

    private async renderClassPath(context: AcademyRouteContext): Promise<void> {
        context.shell.replace(renderLoadingScreen(context.language, navigator.onLine));
        const plan = await loadClassWeekCastPlan();
        const delivery = await loadClassWeekDeliveryCatalog(plan);
        const currentOrder = classOrderForBand(context.projection.curriculumEntry?.band);
        context.shell.replace(renderClassPathScreen({
            language: context.language,
            plan,
            currentOrder,
            playableWeekIds: new Set(delivery.weeks
                .filter(week => week.state === 'grounded-playable')
                .map(week => week.weekId)),
            onOpenWeek: weekId => {
                const lesson = delivery.weeks.find(entry => entry.weekId === weekId);
                if (!lesson || lesson.state !== 'grounded-playable') return;
                void context.go('lesson-overview', { lessonId: lesson.lessonId });
            },
        }));
    }

    private async renderReview(context: AcademyRouteContext): Promise<void> {
        context.shell.replace(renderLoadingScreen(context.language, navigator.onLine));
        const screen = document.createElement('section');
        screen.className = 'academy-study-screen';
        screen.dataset.academyScreen = 'study';
        screen.dataset.academyRoute = 'review';
        context.shell.replace(screen);
        let lifecycle: { dispose(): void } | undefined;
        let disposed = false;
        screen.addEventListener('academy:dispose', () => {
            disposed = true;
            lifecycle?.dispose();
        }, { once: true });
        const mounted = await mountAcademyStudyModule(
            screen,
            this.options.study ?? createCanonicalAcademyStudyModule(),
            {
                language: context.language,
                onExit: () => void context.back(),
            },
        );
        if (disposed) mounted.dispose();
        else lifecycle = mounted;
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
        context.shell.setNavigation(true, 'journal');
        context.shell.replace(renderOpeningMemory(context.language, () => void context.go('journal')));
    }

    private replayAakash(context: AcademyRouteContext): void {
        context.shell.setNavigation(true, 'journal');
        context.shell.replace(renderAakashMemory(context.language, () => void context.go('journal')));
    }

}

function classOrderForBand(band: JlptBand | undefined): number {
    return band === 'n5' ? 19
        : band === 'n4' ? 36
            : band === 'n3' ? 48
                : band === 'n2' || band === 'n1' ? 62
                    : 0;
}

function legacyRelationshipChapters(bond: number | undefined): readonly number[] {
    return bond && bond > 0 ? [1] : [];
}
