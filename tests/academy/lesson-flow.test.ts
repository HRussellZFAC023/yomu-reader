import fs from 'node:fs';
import path from 'node:path';
import { AAKASH_RAINY_DIRECTIONS_SCENE_ID } from '../../src/academy/content/aakash-meet';
import { serializeStoryCursor } from '../../src/academy/content/story-runner';
import { projectLearnerRecord } from '../../src/academy/domain/learner-record';
import type { AcademyCheckpoint } from '../../src/academy/persistence/indexeddb';
import { createLessonFlow } from '../../src/academy/routing/lesson-flow';
import type { AcademyRouteContext } from '../../src/academy/routing/types';
import type { AcademyShell } from '../../src/academy/ui/shell';
import { sha256File } from './helpers/hash-memo';

const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');
const CLASSROOM_PATH = path.resolve('public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json');

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

function checkpoint(
    lessonId = 'lesson:foundation-00',
    update: Partial<AcademyCheckpoint> = {},
): AcademyCheckpoint {
    return {
        schemaVersion: 2,
        route: 'lesson-overview',
        routeHistory: [{ route: 'class' }],
        presentationMode: 'course',
        lessonId,
        updatedAt: 1,
        ...update,
    };
}

function context(
    lessonId?: string,
    update: Partial<AcademyCheckpoint> = {},
    projection = projectLearnerRecord([]),
) {
    const appShell = shell();
    const go = vi.fn(async () => undefined);
    const back = vi.fn(async () => undefined);
    const save = vi.fn(async () => undefined);
    const value: AcademyRouteContext = {
        language: 'en',
        checkpoint: checkpoint(lessonId, update),
        projection,
        shell: appShell,
        go,
        back,
        save,
    };
    return { value, shell: appShell, go, back, save };
}

async function completeSpeakingFork(route: ReturnType<typeof context>): Promise<void> {
    const flow = createLessonFlow({
        evidence: {
            recordActivity: vi.fn(async () => undefined),
            recordSupportUse: vi.fn(async () => undefined),
        } as never,
        pronunciation: {} as never,
        kanjiWriting: {} as never,
    });
    await flow.render('source-activity', route.value);
    route.shell.current?.querySelector<HTMLButtonElement>('.academy-fork-prelude .academy-button-secondary')?.click();
    route.shell.current?.querySelector<HTMLButtonElement>('[data-choice-id="repeat"]')?.click();
    await vi.waitFor(() => expect(
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-source-completion .academy-button-primary'),
    ).not.toBeNull());
    route.shell.current?.querySelector<HTMLButtonElement>('.academy-source-completion .academy-button-primary')?.click();
}

describe('Academy lesson flow', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async (value: string | URL | Request) => {
            const requestPath = String(value);
            const sourcePath = requestPath.includes('/vertical-slice/')
                ? path.resolve('public/academy/content/vertical-slice', requestPath.split('/').at(-1) ?? '')
                : requestPath.includes('lesson-zero-classroom-expressions')
                    ? CLASSROOM_PATH
                : LESSON_PATH;
            return new Response(fs.readFileSync(sourcePath), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }));
    });

    afterEach(() => { vi.unstubAllGlobals(); });

    it('renders the complete Lesson 0 overview with its trusted-source activity available', async () => {
        const route = context();
        await expect(createLessonFlow().render('lesson-overview', route.value)).resolves.toBe(true);

        expect(route.shell.current?.dataset.academyScreen).toBe('lesson-overview');
        expect(route.shell.current?.querySelectorAll('.academy-lesson-overview-section')).toHaveLength(9);
        expect(route.shell.current?.querySelector('.academy-lesson-overview-section-action')).not.toBeNull();
        expect(route.shell.current?.textContent).not.toContain('blocker:');
    });

    it('uses persisted Back to return to Class', async () => {
        const route = context();
        await createLessonFlow().render('lesson-overview', route.value);
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-lesson-overview-back')?.click();
        expect(route.back).toHaveBeenCalledOnce();
    });

    it('saves and leaves the Lesson 0 classroom workshop through persisted route history', async () => {
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            selectedFork: 'text',
            activityId: 'activity:lesson-zero-reconstruct-repair',
        });
        const flow = createLessonFlow({
            evidence: { recordActivity: vi.fn(), recordSupportUse: vi.fn() } as never,
            pronunciation: {} as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-classroom-expression-back')?.click();

        await vi.waitFor(() => expect(route.back).toHaveBeenCalledOnce());
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            classroomExpressionProgress: expect.objectContaining({ status: 'paused' }),
        }));
    });

    it('routes the exact classroom repair activity through all source-linked session evidence', async () => {
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            activityId: 'activity:lesson-zero-reconstruct-repair',
        });
        const recordActivity = vi.fn(async () => undefined);
        const flow = createLessonFlow({
            evidence: { recordActivity, recordSupportUse: vi.fn() } as never,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);
        expect(route.shell.current?.dataset.academyScreen).toBe('classroom-expression-session');
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            classroomExpressionProgress: expect.objectContaining({
                cursor: expect.objectContaining({ probeId: 'probe:classroom-08-check' }),
            }),
        }));

        const input = route.shell.current?.querySelector<HTMLInputElement>('.academy-classroom-expression-input')!;
        input.value = 'わかりますか';
        route.shell.current?.querySelector<HTMLFormElement>('.academy-classroom-expression-form')
            ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({ activityId: 'probe:classroom-08-check', outcome: 'pass' }),
            }),
            'lesson:foundation-00',
            undefined,
            expect.objectContaining({ modeId: 'lesson-zero-classroom-expressions' }),
        ));
        await vi.waitFor(() => expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            classroomExpressionProgress: expect.objectContaining({
                passedProbeIds: ['probe:classroom-08-check'],
            }),
        })));
    });

    it('clears pending lesson state when first completion continues to Aakash', async () => {
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            selectedFork: 'speaking',
            activityId: 'activity:lesson-zero-first-repair-speaking',
        });

        await completeSpeakingFork(route);

        expect(route.go).toHaveBeenCalledWith('aakash-meet', {
            lessonId: undefined,
            sectionId: undefined,
            activityId: undefined,
        });
    });

    it('clears pending lesson state when a returning learner goes to campus', async () => {
        const projection = projectLearnerRecord([{
            schemaVersion: 1,
            kind: 'scene-completed',
            eventId: 'test:aakash-complete',
            at: 1,
            sceneId: AAKASH_RAINY_DIRECTIONS_SCENE_ID,
        }]);
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            selectedFork: 'speaking',
            activityId: 'activity:lesson-zero-first-repair-speaking',
        }, projection);

        await completeSpeakingFork(route);

        expect(route.go).toHaveBeenCalledWith('campus', {
            lessonId: undefined,
            sectionId: undefined,
            activityId: undefined,
        });
    });

    it('preserves a story cursor while clearing pending lesson state', async () => {
        const sectionId = serializeStoryCursor({
            version: 1,
            arcId: 'opening',
            sceneId: 'scene:opening',
            nodeId: 'activity:lesson-zero',
            choices: {},
        });
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            selectedFork: 'speaking',
            sectionId,
            activityId: 'activity:lesson-zero-first-repair-speaking',
        });

        await completeSpeakingFork(route);

        expect(route.go).toHaveBeenCalledWith('story', {
            sectionId,
            lessonId: undefined,
            activityId: undefined,
        });
    });

    it('returns an unknown lesson id to Class instead of showing generic content', async () => {
        const route = context('lesson:unknown');
        await createLessonFlow().render('lesson-overview', route.value);
        expect(route.back).toHaveBeenCalledOnce();
        expect(route.go).not.toHaveBeenCalled();
    });

    it('mounts a catalogued advanced package through the shared activity runtime', async () => {
        const route = context('advanced:n3-pet-housing-01', {
            route: 'source-activity',
            selectedBand: 'n3',
            activityId: 'activity:n3-pet-housing-immersion',
        });
        const flow = createLessonFlow({
            evidence: {
                recordActivity: vi.fn(async () => undefined),
                recordSupportUse: vi.fn(async () => undefined),
            } as never,
            pronunciation: {} as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);

        expect(route.shell.current?.dataset.academyScreen).toBe('advanced-lesson');
        expect(route.shell.current?.dataset.advancedPackageId).toBe('n3-pet-housing-01');
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-activity-chapter-next')?.click();
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-activity-chapter-next')?.click();
        expect(route.shell.current?.querySelector('[data-activity-id]')).not.toBeNull();
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-advanced-lesson-back')?.click();
        expect(route.back).toHaveBeenCalledOnce();
    });

    it('shows the Sensei sheet and seeds it before mounting an authored lesson activity screen', async () => {
        vi.stubGlobal('fetch', vi.fn(async (value: string | URL | Request) => {
            const requestPath = String(value);
            const sourcePath = requestPath.endsWith('002-l1-l01.json')
                ? path.resolve('public/academy/content/lessons/002-l1-l01.json')
                : requestPath.endsWith('class-week-cast.v1.json')
                    ? path.resolve('public/academy/content/curriculum/class-week-cast.v1.json')
                    : LESSON_PATH;
            return new Response(fs.readFileSync(sourcePath), { status: 200, headers: { 'content-type': 'application/json' } });
        }));
        const route = context('authored-week:l1-l01');
        const seedVocabularyPrerequisite = vi.fn(async () => undefined);
        const flow = createLessonFlow({
            evidence: {
                seedVocabularyPrerequisite,
                recordActivity: vi.fn(async () => undefined),
                recordSupportUse: vi.fn(async () => undefined),
                recordEncounter: vi.fn(async () => undefined),
            } as never,
            pronunciation: {} as never,
            kanjiWriting: {} as never,
        });

        await flow.render('lesson-overview', route.value);
        expect(route.shell.current?.dataset.academyScreen).toBe('lesson-vocabulary-prerequisite');
        expect(route.shell.current?.dataset.sourceStatus).toBe('exact-source');
        expect(seedVocabularyPrerequisite).not.toHaveBeenCalled();

        route.shell.current?.querySelector<HTMLButtonElement>('[data-vocabulary-prerequisite-continue]')?.click();
        await vi.waitFor(() => expect(seedVocabularyPrerequisite).toHaveBeenCalledWith(
            'authored-week:l1-l01',
            expect.arrayContaining([expect.objectContaining({ sourceQuestionId: expect.stringMatching(/^moodle-vocabulary:/u) })]),
        ));
        await vi.waitFor(() => expect(route.shell.current?.dataset.academyScreen).toBe('authored-week'));
        expect(route.shell.current?.textContent).toContain('The first response card is still open.');
        expect(route.shell.current?.textContent).not.toContain('The orientation invitation arrives as two response cards.');
    });

    it('uses the normal l1-l01 story entry after Lesson 0 prerequisite evidence passes', async () => {
        vi.stubGlobal('fetch', vi.fn(async (value: string | URL | Request) => {
            const requestPath = String(value);
            const sourcePath = requestPath.endsWith('002-l1-l01.json')
                ? path.resolve('public/academy/content/lessons/002-l1-l01.json')
                : requestPath.endsWith('class-week-cast.v1.json')
                    ? path.resolve('public/academy/content/curriculum/class-week-cast.v1.json')
                    : LESSON_PATH;
            return new Response(fs.readFileSync(sourcePath), { status: 200, headers: { 'content-type': 'application/json' } });
        }));
        const projection = projectLearnerRecord([{
            schemaVersion: 1,
            eventId: 'test:lesson-zero-greeting-pass',
            at: 1,
            kind: 'attempt-recorded',
            activityId: 'activity:lesson-zero-greet-rie',
            sourceQuestionId: 'lesson-zero/greet-rie',
            conceptIds: ['concept:lesson-zero:greeting-response'],
            responseKind: 'choice',
            outcome: 'pass',
            score: 1,
            errorTags: [],
        }]);
        const route = context('authored-week:l1-l01', {}, projection);
        const flow = createLessonFlow({
            evidence: {
                seedVocabularyPrerequisite: vi.fn(async () => undefined),
                recordActivity: vi.fn(async () => undefined),
                recordSupportUse: vi.fn(async () => undefined),
                recordEncounter: vi.fn(async () => undefined),
            } as never,
            pronunciation: {} as never,
            kanjiWriting: {} as never,
        });

        await flow.render('lesson-overview', route.value);
        route.shell.current?.querySelector<HTMLButtonElement>('[data-vocabulary-prerequisite-continue]')?.click();
        await vi.waitFor(() => expect(route.shell.current?.dataset.academyScreen).toBe('authored-week'));
        expect(route.shell.current?.textContent).toContain('The orientation invitation arrives as two response cards.');
        expect(route.shell.current?.textContent).not.toContain('The first response card is still open.');
    });

    it('resumes a saved l1-l01 lapse at its question without replaying the prerequisite or notes', async () => {
        vi.stubGlobal('fetch', vi.fn(async (value: string | URL | Request) => {
            const requestPath = String(value);
            const sourcePath = requestPath.endsWith('002-l1-l01.json')
                ? path.resolve('public/academy/content/lessons/002-l1-l01.json')
                : requestPath.endsWith('class-week-cast.v1.json')
                    ? path.resolve('public/academy/content/curriculum/class-week-cast.v1.json')
                    : LESSON_PATH;
            return new Response(fs.readFileSync(sourcePath), { status: 200, headers: { 'content-type': 'application/json' } });
        }));
        const saved = {
            authoredWeekProgress: {
                'l1-l01': {
                    sourceSha256: sha256File(path.resolve('public/academy/content/lessons/002-l1-l01.json')),
                    savedAt: 1,
                    position: {
                        phase: 'question' as const,
                        activityId: 'authored:l1-l01/ex-input-job',
                    },
                },
            },
        };
        const projection = projectLearnerRecord([{
            schemaVersion: 1,
            eventId: 'test:l1-l01-lapse',
            at: 1,
            kind: 'attempt-recorded',
            activityId: 'authored:l1-l01/ex-input-job',
            sourceQuestionId: 'l1-l01/ex-input-job',
            conceptIds: ['concept:self-introduction-job'],
            responseKind: 'choice',
            outcome: 'lapse',
            score: 0,
            errorTags: ['concept:self-introduction-job:repair'],
        }]);
        const route = context('authored-week:l1-l01', saved, projection);
        const seedVocabularyPrerequisite = vi.fn(async () => undefined);
        const recordActivity = vi.fn(async (
            _evaluation: unknown,
            _lessonId: string,
            _milestone?: unknown,
        ) => undefined);
        const flow = createLessonFlow({
            evidence: {
                seedVocabularyPrerequisite,
                recordActivity,
                recordSupportUse: vi.fn(async () => undefined),
                recordEncounter: vi.fn(async () => undefined),
            } as never,
            pronunciation: {} as never,
            kanjiWriting: {} as never,
        });

        await flow.render('lesson-overview', route.value);

        expect(route.shell.current?.dataset.academyScreen).toBe('authored-week');
        expect(route.shell.current?.dataset.authoredWeekResumed).toBe('true');
        expect(route.shell.current?.dataset.lessonPhase).toBe('question');
        expect(route.shell.current?.querySelector('[data-activity-id="authored:l1-l01/ex-input-job"]')).not.toBeNull();
        expect(route.shell.current?.querySelector('[data-exposure-kind]')).toBeNull();
        expect(seedVocabularyPrerequisite).not.toHaveBeenCalled();
        expect(route.save).toHaveBeenLastCalledWith({
            authoredWeekProgress: {
                'l1-l01': expect.objectContaining({
                    sourceSha256: saved.authoredWeekProgress['l1-l01'].sourceSha256,
                    position: saved.authoredWeekProgress['l1-l01'].position,
                    savedAt: expect.any(Number),
                }),
            },
        });

        route.shell.current?.querySelector<HTMLButtonElement>('[data-choice-id="a"]')?.click();
        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledOnce());
        expect(recordActivity.mock.calls[0]?.[2]).toEqual(expect.objectContaining({
            id: 'l1-l01-first-name-card-repair',
        }));
    });

    it('heals a stale question cursor when pass evidence committed before the next cursor', async () => {
        vi.stubGlobal('fetch', vi.fn(async (value: string | URL | Request) => {
            const requestPath = String(value);
            const sourcePath = requestPath.endsWith('002-l1-l01.json')
                ? path.resolve('public/academy/content/lessons/002-l1-l01.json')
                : requestPath.endsWith('class-week-cast.v1.json')
                    ? path.resolve('public/academy/content/curriculum/class-week-cast.v1.json')
                    : LESSON_PATH;
            return new Response(fs.readFileSync(sourcePath), { status: 200, headers: { 'content-type': 'application/json' } });
        }));
        const sourceSha256 = sha256File(path.resolve('public/academy/content/lessons/002-l1-l01.json'));
        const saved = {
            authoredWeekProgress: {
                'l1-l01': {
                    sourceSha256,
                    savedAt: 1,
                    position: {
                        phase: 'question' as const,
                        activityId: 'authored:l1-l01/ex-input-job',
                    },
                },
            },
        };
        const attempt = (eventId: string, at: number, outcome: 'lapse' | 'pass') => ({
            schemaVersion: 1 as const,
            eventId,
            at,
            kind: 'attempt-recorded' as const,
            activityId: 'authored:l1-l01/ex-input-job',
            sourceQuestionId: 'l1-l01/ex-input-job',
            conceptIds: ['concept:self-introduction-job'],
            responseKind: 'choice' as const,
            outcome,
            score: outcome === 'pass' ? 1 : 0,
            errorTags: outcome === 'pass' ? [] : ['concept:self-introduction-job:repair'],
        });
        const route = context(
            'authored-week:l1-l01',
            saved,
            projectLearnerRecord([attempt('test:lapse', 1, 'lapse'), attempt('test:pass', 2, 'pass')]),
        );
        const flow = createLessonFlow({
            evidence: {
                seedVocabularyPrerequisite: vi.fn(async () => undefined),
                recordActivity: vi.fn(async () => undefined),
                recordSupportUse: vi.fn(async () => undefined),
                recordEncounter: vi.fn(async () => undefined),
            } as never,
            pronunciation: {} as never,
            kanjiWriting: {} as never,
        });

        await flow.render('lesson-overview', route.value);

        expect(route.shell.current?.dataset.lessonPhase).toBe('support');
        expect(route.shell.current?.dataset.currentActivityId).toBe('authored:l1-l01/ex-vocab-match');
        expect(route.shell.current?.querySelector('.academy-authored-week-progress-value')?.textContent).toBe('1 / 19');
        expect(route.save).toHaveBeenLastCalledWith({
            authoredWeekProgress: {
                'l1-l01': {
                    sourceSha256,
                    position: { phase: 'support', activityId: 'authored:l1-l01/ex-vocab-match' },
                    savedAt: expect.any(Number),
                },
            },
        });
    });

    it('does not skip a replayed question because of pass evidence older than its cursor', async () => {
        vi.stubGlobal('fetch', vi.fn(async (value: string | URL | Request) => {
            const requestPath = String(value);
            const sourcePath = requestPath.endsWith('002-l1-l01.json')
                ? path.resolve('public/academy/content/lessons/002-l1-l01.json')
                : requestPath.endsWith('class-week-cast.v1.json')
                    ? path.resolve('public/academy/content/curriculum/class-week-cast.v1.json')
                    : LESSON_PATH;
            return new Response(fs.readFileSync(sourcePath), { status: 200, headers: { 'content-type': 'application/json' } });
        }));
        const activityId = 'authored:l1-l01/ex-input-job';
        const route = context('authored-week:l1-l01', {
            authoredWeekProgress: {
                'l1-l01': {
                    sourceSha256: sha256File(path.resolve('public/academy/content/lessons/002-l1-l01.json')),
                    savedAt: 3,
                    position: { phase: 'question', activityId },
                },
            },
        }, projectLearnerRecord([{
            schemaVersion: 1,
            eventId: 'test:prior-pass',
            at: 2,
            kind: 'attempt-recorded',
            activityId,
            sourceQuestionId: 'l1-l01/ex-input-job',
            conceptIds: ['concept:self-introduction-job'],
            responseKind: 'choice',
            outcome: 'pass',
            score: 1,
            errorTags: [],
        }]));

        await createLessonFlow({
            evidence: {
                seedVocabularyPrerequisite: vi.fn(async () => undefined),
                recordActivity: vi.fn(async () => undefined),
                recordSupportUse: vi.fn(async () => undefined),
                recordEncounter: vi.fn(async () => undefined),
            } as never,
            pronunciation: {} as never,
            kanjiWriting: {} as never,
        }).render('lesson-overview', route.value);

        expect(route.shell.current?.dataset.lessonPhase).toBe('question');
        expect(route.shell.current?.dataset.currentActivityId).toBe(activityId);
        expect(route.shell.current?.querySelector('.academy-authored-week-progress-value')?.textContent).toBe('0 / 19');
    });

    it('keeps a complete cursor when encounter persistence fails so completion can be retried', async () => {
        vi.stubGlobal('fetch', vi.fn(async (value: string | URL | Request) => {
            const requestPath = String(value);
            const sourcePath = requestPath.endsWith('002-l1-l01.json')
                ? path.resolve('public/academy/content/lessons/002-l1-l01.json')
                : requestPath.endsWith('class-week-cast.v1.json')
                    ? path.resolve('public/academy/content/curriculum/class-week-cast.v1.json')
                    : LESSON_PATH;
            return new Response(fs.readFileSync(sourcePath), { status: 200, headers: { 'content-type': 'application/json' } });
        }));
        const route = context('authored-week:l1-l01', {
            authoredWeekProgress: {
                'l1-l01': {
                    sourceSha256: sha256File(path.resolve('public/academy/content/lessons/002-l1-l01.json')),
                    savedAt: 1,
                    position: { phase: 'complete' },
                },
            },
        });
        const recordEncounter = vi.fn(async () => { throw new Error('encounter persistence failed'); });
        await createLessonFlow({
            evidence: {
                seedVocabularyPrerequisite: vi.fn(async () => undefined),
                recordActivity: vi.fn(async () => undefined),
                recordSupportUse: vi.fn(async () => undefined),
                recordEncounter,
            } as never,
            pronunciation: {} as never,
            kanjiWriting: {} as never,
        }).render('lesson-overview', route.value);

        route.shell.current?.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')?.click();
        await vi.waitFor(() => expect(recordEncounter).toHaveBeenCalledOnce());

        expect(route.save).not.toHaveBeenCalledWith({ authoredWeekProgress: undefined });
        expect(route.go).not.toHaveBeenCalled();
    });

    it('turns the first repaired l1-l01 answer into one Stasi journal memory', async () => {
        vi.stubGlobal('fetch', vi.fn(async (value: string | URL | Request) => {
            const requestPath = String(value);
            const sourcePath = requestPath.endsWith('002-l1-l01.json')
                ? path.resolve('public/academy/content/lessons/002-l1-l01.json')
                : requestPath.endsWith('class-week-cast.v1.json')
                    ? path.resolve('public/academy/content/curriculum/class-week-cast.v1.json')
                    : LESSON_PATH;
            return new Response(fs.readFileSync(sourcePath), { status: 200, headers: { 'content-type': 'application/json' } });
        }));
        const route = context('authored-week:l1-l01');
        const recordActivity = vi.fn(async (
            _evaluation: unknown,
            _lessonId: string,
            _milestone?: unknown,
        ) => undefined);
        const flow = createLessonFlow({
            evidence: {
                seedVocabularyPrerequisite: vi.fn(async () => undefined),
                recordActivity,
                recordSupportUse: vi.fn(async () => undefined),
                recordEncounter: vi.fn(async () => undefined),
            } as never,
            pronunciation: {} as never,
            kanjiWriting: {} as never,
        });

        await flow.render('lesson-overview', route.value);
        route.shell.current?.querySelector<HTMLButtonElement>('[data-vocabulary-prerequisite-continue]')?.click();
        await vi.waitFor(() => expect(route.shell.current?.dataset.academyScreen).toBe('authored-week'));
        for (let index = 0; index < 5; index += 1) {
            route.shell.current?.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')?.click();
        }
        expect(route.shell.current?.dataset.lessonPhase).toBe('support');
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-lesson-activity-continue')?.click();
        route.shell.current?.querySelector<HTMLButtonElement>('[data-choice-id="b"]')?.click();
        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(
            route.shell.current?.querySelector<HTMLButtonElement>('.academy-authored-week-next'),
        ).not.toBeNull());
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-authored-week-next')?.click();
        await vi.waitFor(() => expect(
            route.shell.current?.querySelector<HTMLButtonElement>('[data-choice-id="a"]')?.disabled,
        ).toBe(false));
        route.shell.current?.querySelector<HTMLButtonElement>('[data-choice-id="a"]')?.click();
        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledTimes(2));

        expect(recordActivity.mock.calls[0]?.[2]).toBeUndefined();
        expect(recordActivity.mock.calls[1]?.[2]).toEqual({
            id: 'l1-l01-first-name-card-repair',
            sceneId: 'scene:l1-l01-first-name-card-repair',
            journalLine: expect.objectContaining({
                lineId: 'journal:l1-l01:first-name-card-repair',
                characterId: 'stasi',
                text: {
                    ja: 'スタシさんが待ってくれて、アーカッシュさんの名刺をもう一度読んだ。今度は「エンジニアです」を見つけた。',
                    en: "Stasi waited while I read Aakash's name card again. This time I found the line that says エンジニアです.",
                },
                sourceQuestionId: 'l1-l01/ex-input-job',
            }),
        });
    });

    it('does not claim unrelated routes', async () => {
        const route = context();
        await expect(createLessonFlow().render('review', route.value)).resolves.toBe(false);
    });
});
