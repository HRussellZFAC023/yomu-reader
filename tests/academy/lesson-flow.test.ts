import fs from 'node:fs';
import path from 'node:path';
import { AAKASH_RAINY_DIRECTIONS_SCENE_ID } from '../../src/academy/content/aakash-meet';
import { createLessonZeroHiraganaDefinition } from '../../src/academy/content/lesson-zero-hiragana';
import { createLessonZeroSentenceFrameDefinition } from '../../src/academy/content/lesson-zero-sentence-frames';
import { serializeStoryCursor } from '../../src/academy/content/story-runner';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { createLessonZeroVowelSoundMap } from '../../src/academy/content/lesson-zero-vowel-sound-map';
import { createLessonZeroVowelWritingDefinition } from '../../src/academy/content/lesson-zero-vowel-writing';
import { projectLearnerRecord } from '../../src/academy/domain/learner-record';
import { LESSON_ZERO_VOWEL_WRITING_RECALL_ORDER } from '../../src/academy/domain/lesson-zero-vowel-writing-session';
import {
    startLessonZeroVowelSession,
    transitionLessonZeroVowelSession,
} from '../../src/academy/domain/lesson-zero-vowel-session';
import type { ActivityEvaluation } from '../../src/academy/domain/activity-runtime';
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
    const save = vi.fn(async (_update: Partial<AcademyCheckpoint>) => undefined);
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

    it('saves and leaves the focused repetition request through persisted route history', async () => {
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
        route.shell.current?.querySelector<HTMLButtonElement>('[data-repeat-action="begin"]')?.click();
        await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('practice'));
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-repeat-request-back')?.click();

        await vi.waitFor(() => expect(route.back).toHaveBeenCalledOnce());
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroRepeatRequestProgress: expect.objectContaining({ status: 'paused' }),
        }));
    });

    it('routes the repetition request through two chunks, exact evidence, and changed-context transfer', async () => {
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
        expect(route.shell.current?.dataset.academyScreen).toBe('lesson-zero-repeat-request');
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroRepeatRequestProgress: expect.objectContaining({ stage: 'meet' }),
        }));

        route.shell.current?.querySelector<HTMLButtonElement>('[data-repeat-action="begin"]')?.click();
        await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('practice'));
        clickRepeatChunk(route.shell.current!, 'once-more');
        await vi.waitFor(() => expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroRepeatRequestProgress: expect.objectContaining({
                selectedChunkIds: ['once-more'],
            }),
        })));
        clickRepeatChunk(route.shell.current!, 'please');
        await vi.waitFor(() => expect(
            route.shell.current?.querySelector<HTMLButtonElement>('[data-repeat-action="submit"]')?.disabled,
        ).toBe(false));
        route.shell.current?.querySelector<HTMLButtonElement>('[data-repeat-action="submit"]')?.click();
        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-reconstruct-repair:practice',
                    sourceQuestionId: 'source-question:classroom-phrase-09',
                    outcome: 'pass',
                }),
                reviewSeeds: [
                    expect.objectContaining({ id: 'review:lesson-zero:classroom-09-repeat' }),
                ],
            }),
            'lesson:foundation-00',
            undefined,
            expect.objectContaining({ modeId: 'lesson-zero-repeat-request', skill: 'repair' }),
        ));
        await vi.waitFor(() => expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroRepeatRequestProgress: expect.objectContaining({
                stage: 'transfer-ready',
                practicePassed: true,
            }),
        })));

        route.shell.current?.querySelector<HTMLButtonElement>('[data-repeat-action="begin-transfer"]')?.click();
        await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('transfer'));
        clickRepeatChunk(route.shell.current!, 'once-more');
        await vi.waitFor(() => expect(route.shell.current?.textContent).toContain('Your request'));
        clickRepeatChunk(route.shell.current!, 'please');
        await vi.waitFor(() => expect(
            route.shell.current?.querySelector<HTMLButtonElement>('[data-repeat-action="submit"]')?.disabled,
        ).toBe(false));
        route.shell.current?.querySelector<HTMLButtonElement>('[data-repeat-action="submit"]')?.click();
        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-reconstruct-repair:transfer',
                    outcome: 'pass',
                }),
                reviewSeeds: [],
            }),
            'lesson:foundation-00',
            undefined,
            expect.objectContaining({ skill: 'transfer', independent: true }),
        ));
        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-reconstruct-repair',
                    outcome: 'pass',
                }),
            }),
            'lesson:foundation-00',
            expect.objectContaining({
                id: 'lesson-zero-repeat-request-transfer',
                journalLine: expect.objectContaining({
                    lineId: 'journal:lesson-zero:repeat-request',
                }),
            }),
        ));
    });

    it('routes the two desk papers through guided retrieval, changed layout, exact SRS, and completion', async () => {
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            activityId: 'activity:lesson-zero-desk-language',
        });
        const recordActivity = vi.fn(async () => undefined);
        const recordSupportUse = vi.fn(async () => undefined);
        const flow = createLessonFlow({
            evidence: { recordActivity, recordSupportUse } as never,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);
        expect(route.shell.current?.dataset.academyScreen).toBe('lesson-zero-desk-language');
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroDeskLanguageProgress: expect.objectContaining({
                stage: 'meet-homework',
                status: 'ready',
            }),
        }));

        route.shell.current
            ?.querySelector<HTMLButtonElement>('[data-desk-action="next-introduction"]')
            ?.click();
        await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('meet-example'));
        route.shell.current
            ?.querySelector<HTMLButtonElement>('[data-desk-action="next-introduction"]')
            ?.click();
        await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('practice'));

        route.shell.current?.querySelector<HTMLButtonElement>('[data-choice="option-0"]')?.click();
        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-desk-language:practice:homework',
                    sourceQuestionId: 'source-question:classroom-phrase-13',
                    outcome: 'pass',
                }),
                reviewSeeds: [
                    expect.objectContaining({ id: 'review:lesson-zero:classroom-13-homework' }),
                ],
            }),
            'lesson:foundation-00',
            undefined,
            expect.objectContaining({
                modeId: 'lesson-zero-desk-language',
                skill: 'listening',
                action: 'recognise',
            }),
        ));
        route.shell.current?.querySelector<HTMLButtonElement>('[data-choice="option-1"]')?.click();
        await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('transfer-ready'));
        expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                reviewSeeds: [
                    expect.objectContaining({ id: 'review:lesson-zero:classroom-14-example' }),
                ],
            }),
            'lesson:foundation-00',
            undefined,
            expect.anything(),
        );

        route.shell.current
            ?.querySelector<HTMLButtonElement>('[data-desk-action="begin-transfer"]')
            ?.click();
        await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('transfer'));
        route.shell.current?.querySelector<HTMLButtonElement>('[data-choice="option-0"]')?.click();
        await vi.waitFor(() => expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroDeskLanguageProgress: expect.objectContaining({
                transferPassedWordIds: ['example'],
            }),
        })));
        route.shell.current?.querySelector<HTMLButtonElement>('[data-choice="option-1"]')?.click();
        await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('complete'));

        expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-desk-language:transfer:homework',
                    outcome: 'pass',
                }),
                reviewSeeds: [],
            }),
            'lesson:foundation-00',
            undefined,
            expect.objectContaining({ skill: 'transfer', independent: true }),
        );
        expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-desk-language',
                    outcome: 'pass',
                }),
            }),
            'lesson:foundation-00',
            expect.objectContaining({
                id: 'lesson-zero-desk-language-transfer',
                journalLine: expect.objectContaining({
                    lineId: 'journal:lesson-zero:desk-language',
                }),
            }),
        );
    });

    it('routes Rie\'s seven instructions through embodied listening evidence and durable pause', async () => {
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            activityId: 'activity:lesson-zero-follow-instructions',
        });
        const recordActivity = vi.fn(async () => undefined);
        const recordSupportUse = vi.fn(async () => undefined);
        const play = vi.fn(async (_text: string) => ({ dispose() {} }));
        const flow = createLessonFlow({
            evidence: { recordActivity, recordSupportUse } as never,
            pronunciation: { play } as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);
        expect(route.shell.current?.dataset.academyScreen).toBe('classroom-instruction');
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-classroom-instruction-start')?.click();
        await vi.waitFor(() => expect(play).toHaveBeenCalled());
        expect(play.mock.calls[0]?.[0]).toBe('はじめましょう');
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-classroom-instruction-try')?.click();
        await vi.waitFor(() => expect(route.shell.current?.querySelectorAll('[data-action-id]')).toHaveLength(3));
        route.shell.current?.querySelector<HTMLButtonElement>('[data-action-id="begin"]')?.click();
        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-follow-instructions:begin',
                    sourceQuestionId: 'source-question:classroom-phrase-01',
                    outcome: 'pass',
                }),
            }),
            'lesson:foundation-00',
            undefined,
            expect.objectContaining({ modeId: 'lesson-zero-follow-instructions', skill: 'listening' }),
        ));
        await vi.waitFor(() => expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            classroomInstructionProgress: expect.objectContaining({
                cursor: 1,
                passedCueIds: ['cue:lesson-zero-instruction:begin'],
            }),
        })));

        route.shell.current?.querySelector<HTMLButtonElement>('.academy-classroom-instruction-back')?.click();
        await vi.waitFor(() => expect(route.back).toHaveBeenCalledOnce());
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            classroomInstructionProgress: expect.objectContaining({ status: 'paused' }),
        }));
    });

    it('returns an exact Lesson Zero mission to the same story cursor', async () => {
        const sectionId = serializeStoryCursor({
            version: 1,
            arcId: 'story:lesson-zero-opening',
            sceneId: 'scene:lesson-zero-library',
            nodeId: 'node:lesson-zero-text-input',
            choices: {},
        });
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            activityId: 'activity:lesson-zero-text-input',
            sectionId,
        });
        const recordActivity = vi.fn(async () => undefined);
        const flow = createLessonFlow({
            evidence: { recordActivity, recordSupportUse: vi.fn() } as never,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);
        expect(route.shell.current?.dataset.academyScreen).toBe('lesson-zero-mission');
        clickButton(route.shell.current!, 'の');
        clickButton(route.shell.current!, 'も');
        clickButton(route.shell.current!, 'Check the note');
        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-text-input',
                    outcome: 'pass',
                }),
            }),
            'lesson:foundation-00',
        ));
        await vi.waitFor(() => expect(
            [...route.shell.current!.querySelectorAll<HTMLButtonElement>('button')]
                .some(button => button.textContent?.trim() === 'Back to the story'),
        ).toBe(true));
        clickButton(route.shell.current!, 'Back to the story');
        await vi.waitFor(() => expect(route.go).toHaveBeenCalledWith('story', {
            sectionId,
            lessonId: undefined,
            activityId: undefined,
        }));
    });

    it('persists the name chosen on the final class card', async () => {
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            activityId: 'activity:lesson-zero-write-name-card',
        }, {
            ...projectLearnerRecord([]),
            profile: { displayName: 'Henry', learningReason: 'Read manga', portraitId: 'quality-3' },
        });
        const recordActivity = vi.fn(async () => undefined);
        const saveProfile = vi.fn(async () => ({ firstIntroduction: false }));
        const flow = createLessonFlow({
            evidence: { recordActivity, saveProfile, recordSupportUse: vi.fn() } as never,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);
        route.shell.current?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        await vi.waitFor(() => expect(saveProfile).toHaveBeenCalledWith({
            displayName: 'ヘンリー',
            learningReason: 'Read manga',
            portraitId: 'quality-3',
        }));
        expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({ attempt: expect.objectContaining({ outcome: 'pass' }) }),
            'lesson:foundation-00',
        );
    });

    it('routes the first greeting through named, resumable learning evidence', async () => {
        const projection = projectLearnerRecord([{
            schemaVersion: 1,
            eventId: 'test:profile',
            at: 1,
            kind: 'profile-changed',
            profile: { displayName: 'Henry', learningReason: 'Speak with people', portraitId: 'quality-2' },
        }]);
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            activityId: 'activity:lesson-zero-greet-rie',
        }, projection);
        const recordActivity = vi.fn(async () => undefined);
        const recordSupportUse = vi.fn(async () => undefined);
        const flow = createLessonFlow({
            evidence: { recordActivity, recordSupportUse } as never,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);
        expect(route.shell.current?.dataset.academyScreen).toBe('lesson-zero-greeting');
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroGreetingProgress: expect.objectContaining({ status: 'ready' }),
        }));
        [...route.shell.current!.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent === 'Build my greeting')!.click();
        await vi.waitFor(() => expect(route.shell.current?.querySelector('.academy-greeting-phrase-bank')).not.toBeNull());
        for (const phrase of ['こんばんは', 'はじめまして', 'Henryです', 'よろしくお願いします']) {
            const button = [...route.shell.current!.querySelectorAll<HTMLButtonElement>('.academy-greeting-phrase-bank .academy-greeting-phrase')]
                .find(candidate => candidate.textContent?.includes(phrase))!;
            button.click();
            await vi.waitFor(() => expect(
                [...route.shell.current!.querySelectorAll<HTMLButtonElement>('.academy-greeting-phrase-bank .academy-greeting-phrase')]
                    .some(candidate => candidate.textContent?.includes(phrase)),
            ).toBe(false));
        }
        route.shell.current?.querySelector<HTMLButtonElement>('.academy-greeting-action-primary')?.click();
        await vi.waitFor(() => expect(route.shell.current?.querySelector('[data-mode="typed"]')).not.toBeNull());
        route.shell.current?.querySelector<HTMLButtonElement>('[data-mode="typed"]')?.click();
        await vi.waitFor(() => expect(route.shell.current?.querySelector('.academy-greeting-type-input')).not.toBeNull());
        const input = route.shell.current?.querySelector<HTMLTextAreaElement>('.academy-greeting-type-input')!;
        input.value = 'こんばんは。はじめまして。Henryです。よろしくお願いします。';
        input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-greet-rie',
                    outcome: 'pass',
                    responseKind: 'typed-accessible-speaking-alternative',
                }),
                reviewSeeds: expect.arrayContaining([
                    expect.objectContaining({ id: 'review:lesson-zero:greeting:evening' }),
                ]),
            }),
            'lesson:foundation-00',
            expect.objectContaining({ id: 'lesson-zero-first-greeting' }),
            expect.objectContaining({ skill: 'writing', action: 'produce', independent: true }),
        ));
        expect(recordSupportUse).not.toHaveBeenCalled();
    });

    it('routes all five first-sentence turns through child SRS evidence and one parent milestone', async () => {
        const projection = projectLearnerRecord([{
            schemaVersion: 1,
            eventId: 'test:profile:sentence-frames',
            at: 1,
            kind: 'profile-changed',
            profile: { displayName: 'Henry', learningReason: 'Speak with people', portraitId: 'quality-2' },
        }]);
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            activityId: 'activity:lesson-zero-build-sentence-frames',
        }, projection);
        const recordActivity = vi.fn(async () => undefined);
        const flow = createLessonFlow({
            evidence: { recordActivity, recordSupportUse: vi.fn() } as never,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);
        expect(route.shell.current?.dataset.academyScreen).toBe('lesson-zero-sentence-frames');
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroSentenceFrameProgress: expect.objectContaining({ status: 'ready' }),
        }));

        clickButton(route.shell.current!, 'Start with “I am…”');
        const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8'))).lesson;
        const definition = createLessonZeroSentenceFrameDefinition(
            lesson.activities.find(activity => activity.id === 'activity:lesson-zero-build-sentence-frames')!,
        );
        for (const [index, frame] of definition.frames.entries()) {
            await vi.waitFor(() => expect(route.shell.current?.dataset.frameId).toBe(frame.id));
            await vi.waitFor(() => expect(
                [...route.shell.current!.querySelectorAll<HTMLButtonElement>('button')]
                    .some(button => button.textContent?.trim() === 'Build it'),
            ).toBe(true));
            clickButton(route.shell.current!, 'Build it');
            for (const tokenId of frame.target.correctOrder) {
                await vi.waitFor(() => expect(
                    route.shell.current?.querySelector(`.academy-sentence-frame-bank [data-token-id="${tokenId}"]`),
                ).not.toBeNull());
                route.shell.current!
                    .querySelector<HTMLButtonElement>(`.academy-sentence-frame-bank [data-token-id="${tokenId}"]`)!
                    .click();
                await vi.waitFor(() => expect(
                    route.shell.current?.querySelector(`.academy-sentence-frame-selected-rail [data-token-id="${tokenId}"]`),
                ).not.toBeNull());
            }
            await vi.waitFor(() => expect(
                route.shell.current?.querySelector<HTMLButtonElement>('.academy-sentence-frame-action-primary')?.disabled,
            ).toBe(false));
            clickButton(route.shell.current!, 'Check');
            if (index < definition.frames.length - 1) {
                await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('result'));
                clickButton(route.shell.current!, 'Next sentence');
            } else {
                await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('result'));
                clickButton(route.shell.current!, 'Now try all five from memory');
            }
        }

        for (const [index, frame] of definition.frames.entries()) {
            await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('transfer-build'));
            await vi.waitFor(() => expect(route.shell.current?.dataset.frameId).toBe(frame.id));
            for (const tokenId of frame.target.correctOrder) {
                await vi.waitFor(() => expect(
                    route.shell.current?.querySelector(`.academy-sentence-frame-bank [data-token-id="${tokenId}"]`),
                ).not.toBeNull());
                route.shell.current!
                    .querySelector<HTMLButtonElement>(`.academy-sentence-frame-bank [data-token-id="${tokenId}"]`)!
                    .click();
                await vi.waitFor(() => expect(
                    route.shell.current?.querySelector(`.academy-sentence-frame-selected-rail [data-token-id="${tokenId}"]`),
                ).not.toBeNull());
            }
            await vi.waitFor(() => expect(
                route.shell.current?.querySelector<HTMLButtonElement>('.academy-sentence-frame-action-primary')?.disabled,
            ).toBe(false));
            clickButton(route.shell.current!, 'Check');
            if (index < definition.frames.length - 1) {
                await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('transfer-result'));
                clickButton(route.shell.current!, 'Next sentence');
            }
        }

        await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStatus).toBe('complete'));
        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledTimes(11));
        for (const frame of definition.frames) {
            expect(recordActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    attempt: expect.objectContaining({ activityId: frame.activityId, outcome: 'pass' }),
                    reviewSeeds: [expect.objectContaining({ id: `review:lesson-zero:sentence-frame:${frame.id}` })],
                }),
                'lesson:foundation-00',
                undefined,
                expect.objectContaining({ action: 'produce', independent: true, skill: 'writing' }),
            );
            expect(recordActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    attempt: expect.objectContaining({
                        activityId: frame.activityId,
                        outcome: 'pass',
                        responseKind: 'tapped-token-order-transfer',
                    }),
                    reviewSeeds: [],
                }),
                'lesson:foundation-00',
                undefined,
                expect.objectContaining({ action: 'transfer', independent: true, skill: 'writing' }),
            );
        }
        expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-build-sentence-frames',
                    responseKind: 'sentence-constructions',
                    outcome: 'pass',
                }),
            }),
            'lesson:foundation-00',
            expect.objectContaining({ id: 'lesson-zero-first-sentences' }),
        );
        expect(route.shell.current?.textContent).toContain('はい。わたしたちは同じクラスですね。');
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroSentenceFrameProgress: expect.objectContaining({
                status: 'complete',
                passedFrameIds: ['identity', 'correction', 'question', 'noun-link', 'parallel'],
            }),
        }));
    });

    it('routes the saved name through one durable です transfer without asking for it again', async () => {
        const projection = projectLearnerRecord([{
            schemaVersion: 1,
            eventId: 'test:profile:name-card',
            at: 1,
            kind: 'profile-changed',
            profile: { displayName: 'Henry', learningReason: 'Speak with people', portraitId: 'quality-2' },
        }]);
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            activityId: 'activity:lesson-zero-name-card-draft',
        }, projection);
        const recordActivity = vi.fn(async () => undefined);
        const flow = createLessonFlow({
            evidence: { recordActivity, recordSupportUse: vi.fn(async () => undefined) } as never,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);
        expect(route.shell.current?.dataset.academyScreen).toBe('lesson-zero-name-card');
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroNameCardProgress: expect.objectContaining({ status: 'active', selectedTokenIds: [] }),
        }));
        expect(route.shell.current?.querySelector('input[name="displayName"]')).toBeNull();
        route.shell.current?.querySelector<HTMLButtonElement>('[data-token-id="learner-name"]')?.click();
        await vi.waitFor(() => expect(route.shell.current?.querySelectorAll('.academy-name-card-token-selected')).toHaveLength(1));
        route.shell.current?.querySelector<HTMLButtonElement>('[data-token-id="desu"]')?.click();
        await vi.waitFor(() => expect(route.shell.current?.querySelectorAll('.academy-name-card-token-selected')).toHaveLength(2));
        clickButton(route.shell.current!, 'Check');

        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-name-card-draft',
                    outcome: 'pass',
                    responseKind: 'tapped-name-card-frame',
                }),
                reviewSeeds: [
                    expect.objectContaining({ id: 'review:lesson-zero:name-card:desu' }),
                ],
            }),
            'lesson:foundation-00',
            expect.objectContaining({
                id: 'lesson-zero-first-name-card',
                journalLine: expect.objectContaining({ lineId: 'journal:lesson-zero:first-name-card' }),
            }),
            expect.objectContaining({ skill: 'grammar', action: 'produce', independent: true }),
        ));
        expect(JSON.stringify(route.save.mock.calls)).not.toContain('Henry');
        await vi.waitFor(() => expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroNameCardProgress: expect.objectContaining({ status: 'complete' }),
        })));
        expect(route.shell.current?.dataset.sessionStatus).toBe('complete');
    });

    it('routes Xingyu\'s five sounds through durable SRS evidence and the optional bingo surface', async () => {
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            activityId: 'activity:lesson-zero-vowel-listen',
        });
        const recordActivity = vi.fn(async () => undefined);
        const play = vi.fn(async () => ({ dispose() {} }));
        const flow = createLessonFlow({
            evidence: { recordActivity, recordSupportUse: vi.fn() } as never,
            pronunciation: { play } as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);
        expect(route.shell.current?.dataset.academyScreen).toBe('lesson-zero-vowel-lab');
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroVowelProgress: expect.objectContaining({ status: 'ready' }),
        }));
        const click = (label: string) => [...route.shell.current!.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent?.trim() === label)!.click();
        click('Put on headphones');
        for (let index = 0; index < 5; index += 1) {
            await vi.waitFor(() => expect(route.shell.current?.textContent).toContain('Play word'));
            click('Play word');
        }
        await vi.waitFor(() => expect(route.shell.current?.textContent).toContain('Start'));
        click('Start');

        const model = createLessonZeroVowelSoundMap();
        let expected = transitionLessonZeroVowelSession(
            model,
            startLessonZeroVowelSession(model),
            { kind: 'start' },
            1,
        ).state;
        for (const item of model.payload.items) {
            expected = transitionLessonZeroVowelSession(model, expected, { kind: 'learn-item', itemId: item.id }, 2).state;
        }
        expected = transitionLessonZeroVowelSession(model, expected, { kind: 'begin-attempt' }, 3).state;
        for (const roundId of expected.roundOrder) {
            await vi.waitFor(() => expect(route.shell.current?.textContent).toContain('Play'));
            click('Play');
            await vi.waitFor(() => expect(route.shell.current?.querySelectorAll('.academy-vowel-choice')).toHaveLength(5));
            const kana = model.payload.items.find(item => item.id === roundId)!.kana;
            click(kana);
        }
        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({ activityId: 'activity:lesson-zero-vowel-listen', outcome: 'pass' }),
                reviewSeeds: expect.arrayContaining([expect.objectContaining({ id: 'review:lesson-zero:vowel-sound:hira-a' })]),
            }),
            'lesson:foundation-00',
            expect.objectContaining({ id: 'lesson-zero-five-vowels' }),
            expect.objectContaining({ modeId: 'lesson-zero-vowels:audio:lesson' }),
        ));
        expect(route.shell.current?.textContent).toContain('Play bingo');
    });

    it('routes all 46 hiragana through mixed recall and one durable review seed per kana', async () => {
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            activityId: 'activity:lesson-zero-hiragana-bootcamp',
        });
        const recordActivity = vi.fn(async (
            _evaluation: ActivityEvaluation,
            _lessonId: string,
            _milestone?: unknown,
        ) => undefined);
        const flow = createLessonFlow({
            evidence: { recordActivity, recordSupportUse: vi.fn() } as never,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);
        expect(route.shell.current?.dataset.academyScreen).toBe('lesson-zero-hiragana-bootcamp');
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroHiraganaProgress: expect.objectContaining({ status: 'ready' }),
        }));

        const click = (label: string) => [...route.shell.current!.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent?.trim() === label)!.click();
        click('I know hiragana — test me');
        await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStage).toBe('mastery-ready'));
        click('Turn over the chart');

        const definition = createLessonZeroHiraganaDefinition();
        for (let attempt = 0; attempt < 47; attempt += 1) {
            await vi.waitFor(() => expect(route.shell.current?.querySelector<HTMLInputElement>('input[name="romaji"]')).not.toBeNull());
            const kana = route.shell.current?.querySelector<HTMLElement>('.academy-hiragana-kana-mastery')?.textContent;
            const item = definition.items.find(candidate => candidate.kana === kana);
            if (!item) throw new TypeError(`Missing current hiragana item for ${kana ?? 'unknown'}.`);
            const input = route.shell.current!.querySelector<HTMLInputElement>('input[name="romaji"]')!;
            input.value = attempt === 0 ? 'wrong' : item.romaji;
            route.shell.current!.querySelector<HTMLFormElement>('.academy-hiragana-recall-form')!
                .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
            await vi.waitFor(() => expect(
                route.save.mock.calls.some(([value]) =>
                    value.lessonZeroHiraganaProgress?.attempts?.length === attempt + 1),
            ).toBe(true));
        }

        await vi.waitFor(() => expect(route.shell.current?.dataset.sessionStatus).toBe('complete'));
        expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-hiragana-bootcamp',
                    outcome: 'pass',
                }),
                reviewSeeds: expect.arrayContaining([
                    expect.objectContaining({ id: 'review:lesson-zero:hiragana:hira-a', reason: 'repair' }),
                    expect.objectContaining({ id: 'review:lesson-zero:hiragana:hira-n' }),
                ]),
            }),
            'lesson:foundation-00',
            expect.objectContaining({ id: 'lesson-zero-hiragana-route' }),
        );
        const completion = recordActivity.mock.calls.find(([evaluation]) =>
            evaluation.reviewSeeds?.length === 46)?.[0];
        expect(completion?.reviewSeeds).toHaveLength(46);
        expect(new Set(completion?.reviewSeeds.map(seed => seed.id))).toHaveLength(46);
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroHiraganaProgress: expect.objectContaining({
                status: 'complete',
                masteryPassedItemIds: expect.arrayContaining(definition.items.map(item => item.id)),
            }),
        }));
    });

    it('routes Rie\'s writing desk through five child grades and delayed recall before the parent milestone', async () => {
        const route = context('lesson:foundation-00', {
            route: 'source-activity',
            activityId: 'activity:lesson-zero-vowel-doodle',
        });
        const recordActivity = vi.fn(async () => undefined);
        const flow = createLessonFlow({
            evidence: { recordActivity, recordSupportUse: vi.fn() } as never,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            kanjiWriting: {} as never,
        });

        await flow.render('source-activity', route.value);
        expect(route.shell.current?.dataset.academyScreen).toBe('lesson-zero-vowel-writing');
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroVowelWritingProgress: expect.objectContaining({ status: 'ready' }),
        }));
        const click = (label: string) => [...route.shell.current!.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent?.trim() === label)!.click();
        click('Start with あ');
        await vi.waitFor(() => expect(route.shell.current?.textContent).toContain('Choose the stroke plan'));
        click('Choose the stroke plan');

        const definition = createLessonZeroVowelWritingDefinition();
        for (const item of definition.items) {
            await vi.waitFor(() => expect(route.shell.current?.textContent).toContain('Choose its stroke plan'));
            click('Choose its stroke plan');
            await vi.waitFor(() => expect(route.shell.current?.textContent).toContain('Check the plan'));
            click(item.plans.find(plan => plan.id === item.correctPlanId)!.label.en);
            click('Check the plan');
        }

        await vi.waitFor(() => expect(route.shell.current?.textContent).toContain('Can you find them out of order?'));
        for (const [index, itemId] of LESSON_ZERO_VOWEL_WRITING_RECALL_ORDER.entries()) {
            const item = definition.items.find(candidate => candidate.id === itemId)!;
            click(item.kana);
            click('Check my choice');
            await vi.waitFor(() => {
                if (index === LESSON_ZERO_VOWEL_WRITING_RECALL_ORDER.length - 1) {
                    expect(route.shell.current?.textContent).toContain('Five sounds. Five shapes.');
                } else {
                    expect(route.shell.current?.querySelector('.academy-vowel-progress')?.textContent)
                        .toBe(`Recall ${index + 1}/5`);
                }
            });
        }

        await vi.waitFor(() => expect(recordActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: expect.objectContaining({
                    activityId: 'activity:lesson-zero-vowel-doodle',
                    responseKind: 'stroke-attempts',
                    outcome: 'pass',
                }),
            }),
            'lesson:foundation-00',
            expect.objectContaining({
                id: 'lesson-zero-five-vowel-marks',
                journalLine: expect.objectContaining({ characterId: 'rie' }),
            }),
        ));
        for (const item of definition.items) {
            expect(recordActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    attempt: expect.objectContaining({
                        activityId: `activity:lesson-zero-vowel-doodle:${item.id}`,
                        outcome: 'pass',
                    }),
                    reviewSeeds: [expect.objectContaining({ id: `review:lesson-zero:vowel-writing:${item.id}` })],
                }),
                'lesson:foundation-00',
                undefined,
                expect.objectContaining({ independent: true }),
            );
            expect(recordActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    attempt: expect.objectContaining({
                        activityId: `activity:lesson-zero-vowel-doodle:${item.id}`,
                        responseKind: 'kana-choice',
                        outcome: 'pass',
                    }),
                    reviewSeeds: [expect.objectContaining({ id: `review:lesson-zero:vowel-writing:${item.id}` })],
                }),
                'lesson:foundation-00',
                undefined,
                expect.objectContaining({
                    modeId: 'lesson-zero-vowel-writing:recall',
                    action: 'recall',
                    independent: true,
                }),
            );
        }
        expect(route.save).toHaveBeenCalledWith(expect.objectContaining({
            lessonZeroVowelWritingProgress: expect.objectContaining({
                status: 'complete',
                completedItemIds: ['hira-a', 'hira-i', 'hira-u', 'hira-e', 'hira-o'],
                recalledItemIds: ['hira-u', 'hira-a', 'hira-o', 'hira-i', 'hira-e'],
            }),
        }));
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

function clickButton(root: HTMLElement, label: string): void {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.textContent?.trim() === label);
    if (!button) throw new TypeError(`Missing button ${label}.`);
    button.click();
}

function clickRepeatChunk(root: HTMLElement, chunkId: string): void {
    const button = root.querySelector<HTMLButtonElement>(`[data-chunk-id="${chunkId}"]`);
    if (!button) throw new TypeError(`Missing repeat-request chunk ${chunkId}.`);
    button.click();
}
