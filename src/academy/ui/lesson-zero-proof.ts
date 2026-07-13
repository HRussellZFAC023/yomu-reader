import {
    constructedResponseActivityPlugin,
    normalizeJapaneseResponse,
    type ConstructedResponseActivityModel,
} from '../activities/constructed-response';
import type { LessonZeroContent } from '../content/lesson-zero';
import type { LessonZeroAudioAsset, LessonZeroMission } from '../content/lesson-zero-schema';
import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    createActivityRuntime,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityPlugin,
    type GradeResult,
} from '../domain/activity-runtime';
import type { SourceQuestion } from '../domain/source-library';
import { ACADEMY_ASSETS } from '../assets';
import {
    createAcademyVnStage,
    type AcademyVnCastMember,
} from './vn-stage';
import type { AcademySpriteOptions } from './sprite';

const SURVIVAL_SOURCE_IDS = [
    'source-question:classroom-phrase-04',
    'source-question:classroom-phrase-06',
    'source-question:classroom-phrase-07',
    'source-question:classroom-phrase-09',
] as const;

export const LESSON_ZERO_PROOF_CSS = './styles/lesson-zero-proof.css';

export interface LessonZeroProofAudioState {
    readonly textMission: LessonZeroAudioRequirement;
}

export interface LessonZeroAudioRequirement {
    readonly assetId: string;
    readonly state: LessonZeroAudioAsset['state'];
    readonly ready: boolean;
}

export interface LessonZeroProofOptions {
    readonly language: 'en' | 'ja';
    readonly content: LessonZeroContent;
    readonly rieExpressions: AcademySpriteOptions['expressions'];
    readonly onEvaluation?: (evaluation: ActivityEvaluation) => void | Promise<void>;
    readonly onSupportUse?: (support: Readonly<{
        activityId: string;
        supportKind: 'hint';
        choiceId: string;
    }>) => void | Promise<void>;
    readonly onComplete?: () => void;
}

export interface LessonZeroProof {
    readonly element: HTMLElement;
    /** Internal release state. It is deliberately absent from learner-facing DOM. */
    readonly audioRequired: LessonZeroProofAudioState;
    dispose(): void;
}

/**
 * Isolated proof of the Text mission's classroom-survival handout. It is not
 * a claim that the complete Sound/Speaking missions are ready.
 */
export async function createLessonZeroProof(options: LessonZeroProofOptions): Promise<LessonZeroProof> {
    const lifecycle = new AbortController();
    const mission = requiredMission(options.content, 'text');
    const sourceQuestions = await Promise.all(SURVIVAL_SOURCE_IDS.map(id => options.content.sourceLibrary.getQuestion(id)));
    assertSourceBindings(sourceQuestions);
    const byId = new Map(sourceQuestions.map(question => [question.id, question]));
    const assessment = assessmentModel(options.content, required(byId, SURVIVAL_SOURCE_IDS[3]));
    const paper = createSurvivalPaper(sourceQuestions);
    const stage = createAcademyVnStage({ label: options.language === 'ja' ? 'レッスン0・図書館' : 'Lesson 0 Text mission in the library' });
    const rieSalutation = options.language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    let disposed = false;

    stage.element.classList.add('academy-lesson-zero-proof');
    stage.element.dataset.missionProof = mission.id;
    stage.setDirection({
        plate: {
            id: 'lesson-zero-library',
            wide: ACADEMY_ASSETS.locations.library.wide,
            mobile: ACADEMY_ASSETS.locations.library.mobile,
            label: options.language === 'ja' ? '図書館' : 'Library',
        },
        transition: 'dissolve',
        focus: { x: 58, y: 46 },
    });
    stage.element.setAttribute(
        'aria-label',
        options.language === 'ja' ? '図書館でのレッスン0・テキストミッション' : 'Lesson 0 Text mission in the library',
    );
    const setRie = (expression: AcademyVnCastMember['expression']): void => {
        stage.setCast([{
            characterId: 'rie',
            displayName: rieSalutation,
            alt: options.language === 'ja' ? 'プリントを持つりえ先生' : 'Rie-sensei holding the class handout',
            position: 'left',
            expression,
            expressions: options.rieExpressions,
        }]);
    };
    setRie('neutral');
    stage.setObject({ element: paper.element });

    const setLine = (line: Parameters<typeof stage.setLine>[0]): void => {
        stage.setLine(line);
        if (!line) return;
        stage.element.dispatchEvent(new CustomEvent('academy:announce', {
            bubbles: true,
            detail: { message: `${line.speakerName ? `${line.speakerName}: ` : ''}${line.japanese}` },
        }));
    };

    const showInstruction = (index: 0 | 1 | 2): void => {
        const question = sourceQuestions[index];
        paper.focus(question.id);
        setRie('neutral');
        setLine({
            id: `lesson-zero-proof:${question.id}`,
            speakerId: 'rie',
            speakerName: rieSalutation,
            japanese: instructionText(question),
            reading: readingControl(options, question.id),
        });
        stage.setAction(buttonAction(
            options.language === 'ja' ? '次へ' : 'Next',
            () => index === 2 ? showRepeatInContext() : showInstruction((index + 1) as 1 | 2),
            lifecycle.signal,
        ));
    };

    const showRepeatInContext = (): void => {
        paper.focus(null);
        setRie('encouraging');
        setLine({
            id: 'lesson-zero-proof:repeat-in-context',
            speakerId: 'rie',
            speakerName: rieSalutation,
            japanese: '聞き取れませんでしたか。もう一度言いますね。',
            reading: readingControl(options, 'lesson-zero-proof:repeat-in-context'),
            ...(options.language === 'en'
                ? { translation: "Didn't catch that? I'll say it once more.", translationEarned: true }
                : {}),
        });
        stage.setAction(buttonAction(
            options.language === 'ja' ? '頼んでみる' : 'Your turn',
            mountAssessment,
            lifecycle.signal,
        ));
    };

    const mountAssessment = (): void => {
        paper.focus(SURVIVAL_SOURCE_IDS[3]);
        setRie('neutral');
        setLine({
            id: 'lesson-zero-proof:repair-needed',
            speakerId: 'rie',
            speakerName: rieSalutation,
            japanese: 'では、次へ進みます。',
            reading: readingControl(options, 'lesson-zero-proof:repair-needed'),
        });
        const hostElement = document.createElement('div');
        hostElement.className = 'academy-lesson-zero-response-host';
        const runtime = createActivityRuntime([textMissionResponsePlugin]);
        let controller: ActivityController | null = runtime.mount(assessment, {
            language: options.language,
            replace(view) { hostElement.replaceChildren(view); },
            announce(message) {
                stage.element.dispatchEvent(new CustomEvent('academy:announce', { bubbles: true, detail: { message } }));
            },
            recordSupportUse(support) { return options.onSupportUse?.(support); },
            react(reaction) {
                if (!disposed) setRie(reaction.expression);
            },
        }, async evaluation => {
            await options.onEvaluation?.(evaluation);
            if (disposed || evaluation.result.outcome === 'lapse') return;
            paper.complete(required(byId, SURVIVAL_SOURCE_IDS[3]));
            setLine({
                id: 'lesson-zero-proof:learner-repair',
                speakerName: options.language === 'ja' ? 'あなた' : 'You',
                japanese: 'もう一度お願いします。',
                reading: readingControl(options, 'lesson-zero-proof:learner-repair'),
                translation: 'One more time, please.',
                translationEarned: true,
            });
            const continueButton = document.createElement('button');
            continueButton.type = 'button';
            continueButton.className = 'academy-vn-primary-action academy-lesson-zero-after-pass';
            continueButton.textContent = options.language === 'ja' ? '続ける' : 'Continue';
            continueButton.addEventListener('click', showResolution, { once: true, signal: lifecycle.signal });
            hostElement.replaceChildren(continueButton);
            continueButton.focus();
        });
        stage.setAction({
            element: hostElement,
            dispose() {
                controller?.dispose();
                controller = null;
            },
        });
        controller.focus();
    };

    const showResolution = (): void => {
        stage.setAction(null);
        setRie('happy');
        paper.focus(null);
        setLine({
            id: 'lesson-zero-proof:resolution',
            speakerId: 'rie',
            speakerName: rieSalutation,
            japanese: 'はい。もう一度。',
            reading: readingControl(options, 'lesson-zero-proof:resolution'),
            translation: 'Of course. Once more.',
            translationEarned: true,
        });
        stage.setAction(buttonAction(
            options.language === 'ja' ? '授業を続ける' : 'Continue class',
            () => options.onComplete?.(),
            lifecycle.signal,
        ));
    };

    showInstruction(0);
    return {
        element: stage.element,
        audioRequired: {
            textMission: audioRequirement(options.content, mission.id),
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            lifecycle.abort();
            stage.dispose();
        },
    };
}

const textMissionResponsePlugin: ActivityPlugin<ConstructedResponseActivityModel, string> = {
    ...constructedResponseActivityPlugin,
    grade(model, response): GradeResult {
        const normalized = normalizeJapaneseResponse(response);
        if (normalized === 'もう一度' || normalized === 'もういちど') {
            return {
                outcome: 'pass',
                score: 1,
                errorTags: [],
                feedback: {
                    explanation: {
                        en: 'That works. In class, make it polite: もう一度お願いします。',
                        ja: '伝わります。教室では「もう一度お願いします」と丁寧に言えます。',
                    },
                },
            };
        }
        const result = constructedResponseActivityPlugin.grade(model, response);
        if (result.outcome === 'pass') return result;
        if (!hasRepeatCore(normalized)) {
            const isUnderstoodReply = normalized === 'わかりました';
            return {
                ...result,
                errorTags: ['classroom-repair-missing-repeat'],
                feedback: {
                    explanation: {
                        en: isUnderstoodReply
                            ? 'わかりました tells Rie you understood; it does not ask for the line again.'
                            : 'That does not include the idea “one more time.”',
                        ja: isUnderstoodReply
                            ? '「わかりました」は理解した返事です。もう一度言ってほしいことは伝わりません。'
                            : '「もう一度」という意味がまだ入っていません。',
                    },
                    repairPrompt: {
                        en: 'Begin with もう一度 — “one more time.”',
                        ja: '「もう一度」から始めてください。',
                    },
                    nearbyExample: {
                        en: 'Compare: もう一度言いますね。 — I’ll say it once more.',
                        ja: '近い例：「もう一度言いますね。」',
                    },
                },
            };
        }
        return {
            ...result,
            errorTags: ['classroom-repair-request-form'],
            feedback: {
                explanation: {
                    en: '“One more time” is clear; it is not a request yet.',
                    ja: '「もう一度」は伝わりますが、まだ頼む形ではありません。',
                },
                repairPrompt: {
                    en: 'Now make it a polite request to Rie.',
                    ja: 'りえ先生への丁寧な頼みにしてください。',
                },
                nearbyExample: {
                    en: 'Compare the request 見てください。 — Please look.',
                    ja: '頼み方の例：「見てください。」',
                },
            },
        };
    },
};

function hasRepeatCore(normalized: string): boolean {
    return normalized.includes('もう一度') || normalized.includes('もういちど');
}

function assessmentModel(content: LessonZeroContent, question: SourceQuestion): ConstructedResponseActivityModel {
    const activity = content.lesson.activities.find(candidate => candidate.id === 'activity:lesson-zero-reconstruct-repair');
    if (!activity || !activity.sourceQuestionIds.includes(question.id)) {
        throw new Error('Lesson 0 repair activity is not bound to classroom-expression 09.');
    }
    const acceptedAnswers = activity.expectedEvidence.values;
    if (!acceptedAnswers?.length) throw new Error('Lesson 0 repair activity has no authored accepted responses.');
    return {
        id: activity.id,
        kind: 'constructed-japanese',
        sourceQuestionId: question.id,
        conceptIds: activity.conceptIds,
        responseKind: 'ime',
        prompt: {
            en: 'Rie has moved on. Ask her to repeat.',
            ja: '聞き取れませんでした。りえ先生に頼んでください。',
        },
        payload: {
            acceptedAnswers: [...acceptedAnswers, 'もう一度', 'もういちど'],
            passFeedback: {
                en: 'Rie goes back to the line.',
                ja: 'りえ先生が、前の行に戻ります。',
            },
            lapseFeedback: {
                errorTag: 'classroom-repair-form',
                contrast: {
                    en: 'That does not ask Rie to repeat.',
                    ja: 'まだ、繰り返しを頼む形になっていません。',
                },
                repairPrompt: {
                    en: 'Finish the polite request with お願いします.',
                    ja: '「お願いします」で丁寧な頼みにしてください。',
                },
                nearbyExample: {
                    en: 'Compare the polite requests already used in class.',
                    ja: '授業で使った丁寧な頼み方と比べてください。',
                },
            },
            reviewSeedId: 'review:lesson-zero-repeat',
            reviewContent: {
                expression: 'もう一度お願いします',
                reading: 'もういちどおねがいします',
                meanings: ['One more time, please.'],
                sentence: 'すみません。もう一度お願いします。',
            },
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
    };
}

function createSurvivalPaper(questions: readonly SourceQuestion[]): {
    readonly element: HTMLElement;
    focus(sourceQuestionId: string | null): void;
    complete(question: SourceQuestion): void;
} {
    const paper = document.createElement('figure');
    paper.className = 'academy-lesson-zero-handout';
    paper.dataset.object = 'classroom-survival-handout';
    paper.dataset.jpdbReaderSurfaceIgnore = '';
    const heading = document.createElement('figcaption');
    heading.lang = 'ja';
    heading.textContent = '教室で使うことば';
    const list = document.createElement('ol');
    list.className = 'academy-lesson-zero-handout-lines';
    const rowById = new Map<string, HTMLLIElement>();
    for (const [index, question] of questions.entries()) {
        const row = document.createElement('li');
        row.dataset.sourceQuestionId = question.id;
        row.lang = 'ja';
        if (index === questions.length - 1) {
            row.dataset.answerConcealed = 'true';
            row.textContent = '９）';
        } else {
            row.textContent = question.prompt.ja;
        }
        rowById.set(question.id, row);
        list.append(row);
    }
    const flower = document.createElement('span');
    flower.className = 'academy-lesson-zero-flower';
    flower.dataset.flowerMark = '';
    flower.hidden = true;
    flower.textContent = '❀';
    flower.setAttribute('aria-label', 'Rie-sensei flower mark');
    paper.append(heading, list, flower);
    return {
        element: paper,
        focus(sourceQuestionId) {
            for (const [id, row] of rowById) row.dataset.active = String(id === sourceQuestionId);
        },
        complete(question) {
            const row = required(rowById, question.id);
            row.textContent = question.prompt.ja;
            delete row.dataset.answerConcealed;
            row.dataset.complete = 'true';
            flower.hidden = false;
        },
    };
}

function instructionText(question: SourceQuestion): string {
    return question.prompt.ja.replace(/^\s*[０-９0-9]+[）)]\s*/u, '').trim();
}

function readingControl(options: LessonZeroProofOptions, lineId: string) {
    let recorded = false;
    const labels = options.language === 'ja'
        ? { showLabel: '読み方', hideLabel: '読み方を隠す' }
        : { showLabel: 'Readings', hideLabel: 'Hide readings' };
    return {
        ...labels,
        onChange(visible: boolean) {
            if (!visible || recorded) return;
            recorded = true;
            void options.onSupportUse?.({
                activityId: 'activity:lesson-zero-classroom-actions',
                supportKind: 'hint',
                choiceId: `readings:${lineId}`,
            });
        },
    };
}

function buttonAction(label: string, onClick: () => void, signal: AbortSignal) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-vn-primary-action';
    button.textContent = label;
    button.addEventListener('click', onClick, { once: true, signal });
    return { element: button };
}

function requiredMission(content: LessonZeroContent, id: LessonZeroMission['id']): LessonZeroMission {
    const mission = content.lesson.missions.find(candidate => candidate.id === id);
    if (!mission) throw new Error(`Lesson 0 is missing the selected ${id} mission.`);
    return mission;
}

function audioRequirement(content: LessonZeroContent, missionId: LessonZeroMission['id']): LessonZeroAudioRequirement {
    const assetId = `audio:lesson-zero-${missionId}-hosts`;
    const asset = content.lesson.audioAssets.find(candidate => candidate.id === assetId);
    if (!asset) throw new Error(`Lesson 0 is missing internal audio state for ${missionId}.`);
    return { assetId, state: asset.state, ready: asset.state === 'ready' };
}

function assertSourceBindings(questions: readonly SourceQuestion[]): void {
    for (const [index, id] of SURVIVAL_SOURCE_IDS.entries()) {
        const question = questions[index];
        if (question.id !== id || question.documentId !== 'document:moodle-1e58967e') {
            throw new Error(`Lesson 0 proof received the wrong immutable source record for ${id}.`);
        }
    }
}

function required<K, V>(map: ReadonlyMap<K, V>, key: K): V {
    const value = map.get(key);
    if (!value) throw new Error(`Missing Lesson 0 proof value: ${String(key)}`);
    return value;
}
