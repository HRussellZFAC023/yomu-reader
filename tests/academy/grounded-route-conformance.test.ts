import fs from 'node:fs';
import path from 'node:path';
import type { ActivityEvaluation } from '../../src/academy/domain/activity-runtime';
import {
    createMemoryLearnerEventRepository,
    projectLearnerRecord,
    type LearnerEvent,
} from '../../src/academy/domain/learner-record';
import { validateLessonZeroGrounding } from '../../src/academy/content/lesson-zero-grounding';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';
import type { ReviewQueueService } from '../../src/academy/integration/yomu-bridge';
import { staticGroundedLessonResolver } from './fixtures/grounded-lesson';
import type { AcademyCheckpoint, AcademyCheckpointUpdate } from '../../src/academy/persistence/indexeddb';
import {
    normalizeResumeCheckpoint,
    UNGROUNDED_ACTIVITY_ROUTES,
} from '../../src/academy/routing/contract';
import { createEnrollmentFlow } from '../../src/academy/routing/enrollment-flow';
import type { AcademyRouteContext } from '../../src/academy/routing/types';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import type { AcademyShell } from '../../src/academy/ui/shell';

const LESSON_ZERO_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');
const FORBIDDEN_UNGROUNDED_ROUTES = UNGROUNDED_ACTIVITY_ROUTES;
const SESSION = {
    sessionId: 'session',
    expiresAt: 2_000,
    offlineResumeUntil: 3_000,
    source: 'local-qa' as const,
};
const PROFILE_EVENT: LearnerEvent = {
    schemaVersion: 1,
    eventId: 'profile',
    at: 1,
    kind: 'profile-changed',
    profile: { displayName: 'Mina', learningReason: 'Read', portraitId: 'quality-3' },
};

function checkpoint(
    route: AcademyCheckpoint['route'],
    update: Partial<AcademyCheckpoint> = {},
): AcademyCheckpoint {
    return {
        schemaVersion: 2,
        route,
        routeHistory: [],
        presentationMode: 'story',
        session: SESSION,
        updatedAt: 100,
        ...update,
    };
}

function shell(): AcademyShell & { current?: HTMLElement } {
    const value = {
        screen: document.createElement('main'),
        current: undefined as HTMLElement | undefined,
        replace(view: HTMLElement) { value.current = view; },
        setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
        setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
    };
    return value;
}

function context(route: AcademyCheckpoint['route'], update: Partial<AcademyCheckpoint> = {}) {
    const appShell = shell();
    const go = vi.fn(async (
        _route: AcademyCheckpoint['route'],
        _update?: AcademyCheckpointUpdate,
    ) => undefined);
    const back = vi.fn(async () => undefined);
    const value: AcademyRouteContext = {
        language: 'en',
        checkpoint: checkpoint(route, update),
        projection: projectLearnerRecord([PROFILE_EVENT]),
        shell: appShell,
        go,
        back,
    };
    return { value, shell: appShell, go, back };
}

describe('Academy grounded-route conformance', () => {
    it('removes ungrounded current routes and Back-history frames while retaining safe destinations', () => {
        const projection = projectLearnerRecord([PROFILE_EVENT]);
        for (const route of FORBIDDEN_UNGROUNDED_ROUTES) {
            const normalized = normalizeResumeCheckpoint(
                checkpoint(route, { selectedBand: 'n3' }),
                projection,
                1_000,
                true,
            );
            expect(FORBIDDEN_UNGROUNDED_ROUTES.has(normalized.route), route).toBe(false);
        }

        const normalized = normalizeResumeCheckpoint(checkpoint('review', {
            routeHistory: [
                { route: 'class' },
                ...[...FORBIDDEN_UNGROUNDED_ROUTES].map(route => ({ route })),
                { route: 'journal' },
            ],
        }), projection, 1_000, true);

        expect(normalized.route).toBe('review');
        expect(normalized.routeHistory.map(frame => frame.route)).toEqual(['class', 'journal']);
    });

    it('ends a midstream arrival bridge at Class, never at a standalone graded bridge activity', async () => {
        const route = context('arrival-bridge', { selectedBand: 'n3' });
        const flow = createEnrollmentFlow({
            access: {} as never,
            evidence: {} as never,
            pronunciation: {} as never,
        });

        await expect(flow.render('arrival-bridge', route.value)).resolves.toBe(true);
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-button-primary')?.click();

        expect(route.go).toHaveBeenCalled();
        expect(route.go.mock.calls.at(-1)?.[0]).toBe('class');
    });

    it('keeps the ungrounded Language Lab unavailable even when Sound was selected', async () => {
        const route = context('campus', { selectedFork: 'sound' });
        const flow = createWorldFlow({
            evidence: {} as never,
            pronunciation: {} as never,
            audio: {} as never,
        });

        await expect(flow.render('campus', route.value)).resolves.toBe(true);

        const lab = route.shell.current?.querySelector<HTMLButtonElement>('[data-location="lab"]');
        expect(lab).toBeInstanceOf(HTMLButtonElement);
        expect(lab?.disabled).toBe(true);
        expect(route.go).not.toHaveBeenCalled();
    });

    it('rejects a real review-blocked lesson before writing attempts or canonical reviews', async () => {
        const lesson = validateLessonZeroGrounding(JSON.parse(fs.readFileSync(LESSON_ZERO_PATH, 'utf8')));
        expect(lesson.status).toBe('review-blocked');
        const activity = lesson.activities.find(candidate => candidate.id === 'activity:lesson-zero-reconstruct-repair');
        if (!activity || activity.proofs.curriculum.state !== 'ready') throw new Error('Lesson 0 repair grounding is missing.');
        const sourceQuestionId = activity.proofs.input.state === 'ready'
            && activity.proofs.input.evidence.kind === 'source'
            ? activity.proofs.input.evidence.sourceQuestionIds[0]
            : undefined;
        const evaluation: ActivityEvaluation = {
            result: {
                outcome: 'pass',
                score: 1,
                errorTags: [],
                feedback: { explanation: { en: 'Passed.', ja: 'できました。' } },
            },
            attempt: {
                kind: 'attempt-recorded',
                activityId: activity.id,
                ...(sourceQuestionId ? { sourceQuestionId } : {}),
                conceptIds: [...activity.proofs.curriculum.evidence.conceptIds],
                responseKind: 'constructed-japanese',
                outcome: 'pass',
                score: 1,
                errorTags: [],
            },
            reviewSeeds: [],
        };
        const repository = createMemoryLearnerEventRepository();
        const ingest = vi.fn(async (_seeds: Parameters<ReviewQueueService['ingest']>[0]) => undefined);
        const evidence = createLearnerEvidence(repository, {
            ingest,
            async due() { return []; },
            async rate() {},
        }, staticGroundedLessonResolver(lesson));
        await evidence.initialize();

        await expect(evidence.recordActivity(evaluation, lesson.lessonId)).rejects.toThrow();

        expect(ingest).not.toHaveBeenCalled();
        expect(await repository.readAll()).toEqual([]);
    });
});
