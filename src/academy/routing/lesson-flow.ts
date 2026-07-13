import { loadLessonZeroContent } from '../content/lesson-zero';
import { createLessonOverviewModel, type LessonOverviewState } from '../domain/lesson-overview';
import type { LearnerProjection } from '../domain/learner-record';
import type { AcademyRoute } from '../persistence/indexeddb';
import { renderLessonOverviewScreen } from '../ui/lesson-overview-screen';
import { renderLoadingScreen } from '../ui/loading-screen';
import type { AcademyRouteContext, AcademyRouteFlow } from './types';

const LESSON_ZERO_ID = 'lesson:foundation-00';

export function createLessonFlow(): AcademyRouteFlow {
    return new LessonFlow();
}

class LessonFlow implements AcademyRouteFlow {
    async render(route: AcademyRoute, context: AcademyRouteContext): Promise<boolean> {
        if (route !== 'lesson-overview') return false;
        await this.renderOverview(context);
        return true;
    }

    private async renderOverview(context: AcademyRouteContext): Promise<void> {
        const lessonId = context.checkpoint.lessonId ?? LESSON_ZERO_ID;
        if (lessonId !== LESSON_ZERO_ID) {
            if (context.checkpoint.routeHistory.length) await context.back();
            else await context.go('class', { lessonId: undefined, sectionId: undefined, activityId: undefined });
            return;
        }
        context.shell.replace(renderLoadingScreen(context.language, navigator.onLine));
        const content = await loadLessonZeroContent();
        const model = createLessonOverviewModel(
            content.lesson,
            content.grounding,
            overviewState(content.lesson.activities.map(activity => activity.id), context.projection),
        );
        context.shell.replace(renderLessonOverviewScreen({
            language: context.language,
            model,
            onBack: () => void context.back(),
            // No action is rendered while the grounded lesson remains blocked.
            onOpenActivity: activityId => void context.go('source-activity', {
                lessonId: LESSON_ZERO_ID,
                activityId,
                selectedFork: activityId === 'activity:lesson-zero-reconstruct-repair'
                    ? 'text'
                    : context.checkpoint.selectedFork,
            }),
        }));
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
        // Runtime bindings remain explicit. The accepted Stage 1 repair is the
        // sole current binding; it cannot make the complete lesson playable.
        boundActivityIds: new Set(['activity:lesson-zero-reconstruct-repair']),
        attemptedActivityIds,
        completedActivityIds,
        needsReviewActivityIds,
    };
}
