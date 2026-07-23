import { academyText } from '../../src/reader/app/academy-copy';
import { serializeStoryCursor } from '../../src/academy/content/story-runner';
import { STORY_OPENING_ARC_ID } from '../../src/academy/content/story-runtime';
import {
    projectLearnerRecord,
    type JlptBand,
    type LearnerEvent,
} from '../../src/academy/domain/learner-record';
import type { CurriculumEntryChoice, LearnerEvidence } from '../../src/academy/evidence/learner-evidence';
import type { AcademyCheckpoint, AcademyCheckpointUpdate } from '../../src/academy/persistence/indexeddb';
import { createEnrollmentFlow } from '../../src/academy/routing/enrollment-flow';
import {
    transitionAcademyRoute,
    type AcademyRouteHistoryState,
} from '../../src/academy/routing/route-history';
import type { AcademyRouteContext } from '../../src/academy/routing/types';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import { renderLessonFork } from '../../src/academy/ui/lesson-screen';
import type { AcademyShell } from '../../src/academy/ui/shell';
import { renderCampusScreen } from '../../src/academy/ui/world-screen';

const PROFILE_EVENT: LearnerEvent = {
    schemaVersion: 1,
    eventId: 'profile',
    at: 1,
    kind: 'profile-changed',
    profile: { displayName: 'Mina', learningReason: 'Read novels', portraitId: 'quality-3' },
};

const PLACEMENT_SCORES = {
    'language-knowledge': 0.8,
    reading: 0.8,
    listening: 0.8,
    'speaking-confidence': 0.6,
    'writing-confidence': 0.6,
} as const;

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('Academy opening route progression', () => {
    it('holds class invitations at account linking: no invite enters Academy anonymously', async () => {
        const exchange = vi.fn(async (_code: string, _signal?: AbortSignal) => session());
        const connect = vi.fn(async () => syncStatus('sign-in'));
        const flow = createEnrollmentFlow({
            access: { exchange },
            evidence: {} as never,
            pronunciation: {} as never,
            account: { connect },
        });
        const route = routeContext('access', []);

        await flow.render('access', route.value);
        const input = route.shell.current?.querySelector<HTMLInputElement>('input[name="code"]')!;
        input.value = 'CLASS-TEST-2026';
        input.closest('form')?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));

        await vi.waitFor(() => expect(route.go).toHaveBeenCalledWith('profile-sync', { session: session() }));
        expect(connect).toHaveBeenCalledOnce();
        expect(exchange.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    });

    it('holds paid access at account linking before onboarding and retains the local route state', async () => {
        const exchange = vi.fn(async () => session());
        const connect = vi.fn(async () => syncStatus('sign-in'));
        const flow = createEnrollmentFlow({
            access: { exchange },
            evidence: {} as never,
            pronunciation: {} as never,
            account: { connect },
        });
        const route = routeContext('access', [PROFILE_EVENT]);

        await flow.render('access', route.value);
        const input = route.shell.current?.querySelector<HTMLInputElement>('input[name="code"]')!;
        input.value = 'PAID-CODE';
        input.closest('form')?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));

        await vi.waitFor(() => expect(route.go).toHaveBeenCalledWith('profile-sync', { session: session() }));
        expect(connect).toHaveBeenCalledOnce();
        expect(route.value.projection.profile).toEqual(projectLearnerRecord([PROFILE_EVENT]).profile);
    });

    it('does not navigate when the access route is disposed during account linking', async () => {
        let resolveAccount!: () => void;
        const exchange = vi.fn(async () => session());
        const connect = vi.fn(() => new Promise<ReturnType<typeof syncStatus>>(resolve => {
            resolveAccount = () => resolve(syncStatus('sign-in'));
        }));
        const flow = createEnrollmentFlow({
            access: { exchange },
            evidence: {} as never,
            pronunciation: {} as never,
            account: { connect },
        });
        const route = routeContext('access', []);

        await flow.render('access', route.value);
        const screen = route.shell.current!;
        const input = screen.querySelector<HTMLInputElement>('input[name="code"]')!;
        input.value = 'CLASS-TEST-2026';
        input.closest('form')?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());

        screen.dispatchEvent(new CustomEvent('academy:dispose'));
        resolveAccount();
        await Promise.resolve();

        expect(route.go).not.toHaveBeenCalled();
    });

    it('arrives at the campus entrance before opening Lesson 0', async () => {
        const enrollment = enrollmentHarness();
        const start = routeContext('start');

        await enrollment.flow.render('start', start.value);
        start.shell.current?.querySelector<HTMLButtonElement>('[data-start-route="lesson-zero"]')?.click();

        await vi.waitFor(() => {
            expect(enrollment.chooseCurriculumEntry).toHaveBeenCalledWith({ route: 'lesson-zero' });
            expect(start.go).toHaveBeenCalledWith('campus', {
                selectedBand: undefined,
                lessonId: 'lesson:foundation-00',
                sectionId: undefined,
                activityId: undefined,
            });
        });
        expect(start.go.mock.calls.some(([route]) => route === 'lesson-overview')).toBe(false);

        const campus = routeContext('campus', [PROFILE_EVENT, curriculumEntry('lesson-zero')], {
            routeHistory: [{ route: 'start' }],
            lessonId: 'lesson:foundation-00',
        });
        vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
        await worldFlow().render('campus', campus.value);

        expect(campus.shell.current?.dataset.currentPlace).toBe('courtyard');
        expect(campus.shell.current?.querySelector('.academy-background img')?.getAttribute('src'))
            .toContain('campus-entrance__blue-hour-arrival');
        expect(campus.shell.current?.querySelector('[data-location="classroom"] .academy-world-exit-reason')?.textContent)
            .toBe('Read the board and enter class');

        campus.shell.current?.querySelector<HTMLButtonElement>('[data-location="classroom"]')?.click();
        expect(campus.go).toHaveBeenCalledWith('classroom', { worldVisits: {} });
    });

    it('opens the pending Lesson 0 from the classroom instead of skipping to the class path', async () => {
        const classroom = routeContext('classroom', [PROFILE_EVENT, curriculumEntry('lesson-zero')], {
            lessonId: 'lesson:foundation-00',
            worldVisits: { classroom: 1 },
        });

        await worldFlow().render('classroom', classroom.value);
        classroom.shell.current?.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')?.click();
        classroom.shell.current?.querySelector<HTMLButtonElement>('[data-activity-route="class"]')?.click();

        expect(classroom.go).toHaveBeenCalledWith('lesson-overview');
        expect(classroom.go.mock.calls.some(([route]) => route === 'class')).toBe(false);
    });

    it('opens the class path when the classroom has no pending lesson', async () => {
        const classroom = routeContext('classroom', [PROFILE_EVENT, curriculumEntry('lesson-zero')], {
            worldVisits: { classroom: 1 },
        });

        await worldFlow().render('classroom', classroom.value);
        classroom.shell.current?.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')?.click();
        classroom.shell.current?.querySelector<HTMLButtonElement>('[data-activity-route="class"]')?.click();

        expect(classroom.go).toHaveBeenCalledWith('class', {
            lessonId: undefined,
            sectionId: undefined,
            activityId: undefined,
        });
        expect(classroom.go.mock.calls.some(([route]) => route === 'lesson-overview')).toBe(false);
    });

    it('sends a Lesson 0 placement recommendation to the same campus arrival', async () => {
        const enrollment = enrollmentHarness();
        const result = routeContext('placement-result', [PROFILE_EVENT, placement('lesson-zero')], {
            selectedBand: 'n5',
        });

        await enrollment.flow.render('placement-result', result.value);
        result.shell.current?.querySelector<HTMLButtonElement>('.academy-button-primary')?.click();

        await vi.waitFor(() => {
            expect(enrollment.chooseCurriculumEntry).toHaveBeenCalledWith({ route: 'lesson-zero' });
            expect(result.go).toHaveBeenCalledWith('campus', {
                selectedBand: undefined,
                placementOverride: false,
                lessonId: 'lesson:foundation-00',
                sectionId: undefined,
                activityId: undefined,
            });
        });
    });

    it('bridges a manual mid-course entry through campus and keeps the selected band', async () => {
        const enrollment = enrollmentHarness();
        const manual = routeContext('manual-band');

        await enrollment.flow.render('manual-band', manual.value);
        manual.shell.current?.querySelector<HTMLButtonElement>('[data-band="n3"]')?.click();

        await vi.waitFor(() => {
            expect(enrollment.chooseCurriculumEntry).toHaveBeenCalledWith({
                route: 'manual-band',
                band: 'n3',
            });
            expect(manual.go).toHaveBeenCalledWith('arrival-bridge', {
                selectedBand: 'n3',
                placementOverride: false,
                lessonId: undefined,
                sectionId: undefined,
                activityId: undefined,
            });
        });

        const bridge = routeContext('arrival-bridge', [PROFILE_EVENT, curriculumEntry('manual-band', 'n3')], {
            selectedBand: 'n3',
            routeHistory: [{ route: 'manual-band' }],
        });
        await enrollment.flow.render('arrival-bridge', bridge.value);
        expect(bridge.shell.current?.dataset.entryMode).toBe('guided');
        expect(bridge.shell.current?.querySelector('audio')?.getAttribute('src'))
            .toBe('/academy/content/listening/media/academy-listening-2a287bcef237d1e3.mp3');
        bridge.shell.current?.querySelectorAll<HTMLFieldSetElement>('[data-source-question-id]').forEach((fieldset, index) => {
            const marks = ['cross', 'cross', 'circle', 'circle', 'cross'];
            const input = fieldset.querySelector<HTMLInputElement>(`input[value="${marks[index]}"]`);
            if (input) input.checked = true;
        });
        bridge.shell.current?.querySelector<HTMLFormElement>('form')
            ?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(enrollment.recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({ result: expect.objectContaining({ outcome: 'pass' }) }),
            'authored-week:l2-l07',
            undefined,
            expect.objectContaining({
                modeId: 'advanced-entry:n3:guided',
                skill: 'listening',
                sourceId: expect.stringContaining('minna074-mondai-2'),
                independent: false,
            }),
        ));
        await vi.waitFor(() => expect(
            bridge.shell.current?.querySelector('.academy-source-completion .academy-button-primary'),
        ).not.toBeNull());
        bridge.shell.current?.querySelector<HTMLButtonElement>('.academy-source-completion .academy-button-primary')?.click();
        expect(bridge.go).toHaveBeenCalledWith('campus');

        const campus = routeContext('campus', [PROFILE_EVENT, curriculumEntry('manual-band', 'n3')], {
            selectedBand: 'n3',
            routeHistory: [{ route: 'arrival-bridge', selectedBand: 'n3' }],
        });
        vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
        await worldFlow().render('campus', campus.value);
        campus.shell.current?.querySelector<HTMLButtonElement>('[data-location="classroom"]')?.click();

        expect(campus.go).toHaveBeenCalledWith('classroom', { worldVisits: {} });
        expect(campus.go.mock.calls.some(([route]) => route === 'lesson-overview')).toBe(false);
    });

    it('keeps an advanced placement recommendation on its chosen band', async () => {
        const enrollment = enrollmentHarness();
        const result = routeContext('placement-result', [PROFILE_EVENT, placement('n2')], {
            selectedBand: 'n2',
        });

        await enrollment.flow.render('placement-result', result.value);
        result.shell.current?.querySelector<HTMLButtonElement>('.academy-button-primary')?.click();

        await vi.waitFor(() => {
            expect(enrollment.chooseCurriculumEntry).toHaveBeenCalledWith({
                route: 'placement-mock',
                band: 'n2',
                recommendationAccepted: true,
            });
            expect(result.go).toHaveBeenCalledWith('arrival-bridge', {
                selectedBand: 'n2',
                placementOverride: false,
                lessonId: undefined,
                sectionId: undefined,
                activityId: undefined,
            });
        });
    });

    it('keeps the exact Story cursor when placement changes the curriculum start level', async () => {
        const storySection = serializeStoryCursor({
            version: 1,
            arcId: STORY_OPENING_ARC_ID,
            sceneId: 'scene:blank-atlas:close',
            nodeId: 'node:blank-atlas:one-light-room',
            choices: {},
        });
        const enrollment = enrollmentHarness();
        const result = routeContext('placement-result', [PROFILE_EVENT, placement('n2')], {
            selectedBand: 'n2',
            routeHistory: [
                { route: 'campus' },
                { route: 'story', sectionId: storySection, selectedBand: 'n3' },
                { route: 'start', sectionId: storySection, selectedBand: 'n3' },
                { route: 'placement-mock', sectionId: storySection, selectedBand: 'n3' },
            ],
        });

        await enrollment.flow.render('placement-result', result.value);
        result.shell.current?.querySelector<HTMLButtonElement>('.academy-button-primary')?.click();

        await vi.waitFor(() => expect(result.go).toHaveBeenCalledWith('arrival-bridge', {
            selectedBand: 'n2',
            placementOverride: false,
            lessonId: undefined,
            sectionId: storySection,
            activityId: undefined,
        }));

        const story = routeContext('story', [
            PROFILE_EVENT,
            curriculumEntry('placement-mock', 'n2'),
            {
                schemaVersion: 1,
                eventId: 'story-scene-before-placement',
                at: 3,
                kind: 'characters-encountered',
                encounterId: 'story:s1e01-the-blank-atlas:scene:scene:blank-atlas:welcome',
                sceneId: 'scene:blank-atlas:welcome',
                attendeeIds: ['rie'],
            },
        ], {
            selectedBand: 'n2',
            sectionId: storySection,
            routeHistory: [{ route: 'campus', selectedBand: 'n2', sectionId: storySection }],
        });
        await worldFlow().render('story', story.value);

        expect(story.shell.current?.querySelector<HTMLElement>('.academy-story-authored-arc')?.dataset.storyMode)
            .toBe('chronological-replay');
        expect(story.shell.current?.querySelector<HTMLElement>('.academy-story-authored-arc')?.dataset.storyScene)
            .toBe('scene:blank-atlas:close');
        expect(story.shell.current?.querySelector<HTMLElement>('.academy-vn-stage')?.dataset.storyReplay)
            .toBe('true');
    });

    it('does not resurrect an older scene when the nearest Story frame is the episode list', async () => {
        const result = routeContext('placement-result', [PROFILE_EVENT, placement('n2')], {
            selectedBand: 'n2',
            routeHistory: [
                { route: 'story', sectionId: 'older-story-cursor' },
                { route: 'story' },
                { route: 'placement-mock' },
            ],
        });

        await enrollmentHarness().flow.render('placement-result', result.value);
        result.shell.current?.querySelector<HTMLButtonElement>('.academy-button-primary')?.click();

        await vi.waitFor(() => expect(result.go).toHaveBeenCalledWith('arrival-bridge', expect.objectContaining({
            selectedBand: 'n2',
            sectionId: undefined,
        })));
    });

    it('returns to the completed mock when the learner chooses review', async () => {
        const enrollment = enrollmentHarness();
        const result = routeContext('placement-result', [PROFILE_EVENT, placement('n2')], {
            selectedBand: 'n2',
            routeHistory: [{ route: 'placement-mock' }],
        });

        await enrollment.flow.render('placement-result', result.value);
        result.shell.current?.querySelector<HTMLButtonElement>('.academy-placement-review')?.click();

        expect(result.back).toHaveBeenCalledOnce();
    });

    it('restores the exact campus frame when Back leaves either first lesson', () => {
        const start: AcademyRouteHistoryState = {
            route: 'start',
            routeHistory: [{ route: 'profile' }],
            presentationMode: 'story',
        };
        const campus = transitionAcademyRoute(start, {
            kind: 'push',
            route: 'campus',
            context: { lessonId: 'lesson:foundation-00' },
        });
        const lesson = transitionAcademyRoute(campus, {
            kind: 'push',
            route: 'lesson-overview',
            context: { lessonId: 'lesson:foundation-00' },
        });

        expect(lesson.routeHistory.at(-1)).toEqual({
            route: 'campus',
            lessonId: 'lesson:foundation-00',
        });
        expect(transitionAcademyRoute(lesson, { kind: 'back' })).toEqual(campus);

        const bridge = {
            route: 'arrival-bridge' as const,
            routeHistory: [{ route: 'manual-band' as const }],
            presentationMode: 'story' as const,
            selectedBand: 'n3' as const,
        };
        const advancedCampus = transitionAcademyRoute(bridge, { kind: 'push', route: 'campus' });
        const advancedClass = transitionAcademyRoute(advancedCampus, { kind: 'push', route: 'class' });
        expect(transitionAcademyRoute(advancedClass, { kind: 'back' })).toEqual(advancedCampus);
    });

    it('uses the learner-facing 語学ラボ name in English and Japanese surfaces', () => {
        const englishCampus = renderCampusScreen('en', true, vi.fn());
        const japaneseCampus = renderCampusScreen('ja', true, vi.fn());
        const englishFork = renderLessonFork('en', undefined, vi.fn());
        const japaneseFork = renderLessonFork('ja', undefined, vi.fn());

        expect(academyText('en', 'locationLab')).toBe('語学ラボ');
        expect(academyText('ja', 'locationLab')).toBe('語学ラボ');
        expect(academyText('ja', 'labEyebrow')).toBe('語学ラボ');
        expect(englishCampus.querySelector('[data-location="lab"]')?.textContent).toContain('語学ラボ');
        expect(japaneseCampus.querySelector('[data-location="lab"]')?.textContent).toContain('語学ラボ');
        expect(englishFork.querySelector('[data-fork="sound"]')?.textContent).toContain('語学ラボ');
        expect(japaneseFork.querySelector('[data-fork="sound"]')?.textContent).toContain('語学ラボ');
        expect(`${englishCampus.textContent}${japaneseCampus.textContent}${englishFork.textContent}${japaneseFork.textContent}`)
            .not.toContain('LL教室');
    });
});

function enrollmentHarness() {
    const chooseCurriculumEntry = vi.fn(async (_choice: CurriculumEntryChoice) => undefined);
    const recordActivity = vi.fn(async () => undefined);
    return {
        chooseCurriculumEntry,
        recordActivity,
        flow: createEnrollmentFlow({
            access: {} as never,
            evidence: {
                chooseCurriculumEntry,
                recordActivity,
                history: vi.fn(async () => []),
            } as unknown as LearnerEvidence,
            pronunciation: {} as never,
        }),
    };
}

function worldFlow() {
    return createWorldFlow({
        evidence: {} as never,
        pronunciation: {} as never,
        audio: {} as never,
    });
}

function routeContext(
    route: AcademyCheckpoint['route'],
    events: readonly LearnerEvent[] = [PROFILE_EVENT],
    update: Partial<AcademyCheckpoint> = {},
) {
    const appShell = shell();
    const go = vi.fn(async (
        _route: AcademyCheckpoint['route'],
        _update?: AcademyCheckpointUpdate,
    ) => undefined);
    const back = vi.fn(async () => undefined);
    const value: AcademyRouteContext = {
        language: 'en',
        checkpoint: checkpoint(route, update),
        projection: projectLearnerRecord(events),
        shell: appShell,
        go,
        back,
    };
    return { value, shell: appShell, go, back };
}

function checkpoint(
    route: AcademyCheckpoint['route'],
    update: Partial<AcademyCheckpoint> = {},
): AcademyCheckpoint {
    return {
        schemaVersion: 2,
        route,
        routeHistory: [],
        presentationMode: 'story',
        updatedAt: 1,
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

function curriculumEntry(route: 'lesson-zero'): LearnerEvent;
function curriculumEntry(route: 'manual-band' | 'placement-mock', band: JlptBand): LearnerEvent;
function curriculumEntry(route: 'lesson-zero' | 'manual-band' | 'placement-mock', band?: JlptBand): LearnerEvent {
    return {
        schemaVersion: 1,
        eventId: `curriculum-${route}`,
        at: 2,
        kind: 'curriculum-entry-chosen',
        route,
        ...(band ? { band } : {}),
    } as LearnerEvent;
}

function placement(recommendedStart: JlptBand | 'lesson-zero'): LearnerEvent {
    return {
        schemaVersion: 1,
        eventId: `placement-${recommendedStart}`,
        at: 2,
        kind: 'placement-assessed',
        assessmentId: 'academy-orientation-mock:v2',
        targetBand: recommendedStart === 'lesson-zero' ? 'n5' : recommendedStart,
        itemIds: ['orientation:item'],
        scores: PLACEMENT_SCORES,
        recommendedBand: recommendedStart === 'lesson-zero' ? 'n5' : recommendedStart,
        recommendedStart,
        calibration: 'vertical-slice',
    };
}

function session(accountRequired = true) {
    return {
        sessionId: 'account-session',
        expiresAt: 2_000,
        offlineResumeUntil: 3_000,
        accountRequired,
        source: 'cloudflare' as const,
    };
}

function syncStatus(phase: 'sign-in') {
    return { phase, profile: null, account: null, entitlement: null, pending: 0, lastSyncAt: null, error: null } as const;
}
