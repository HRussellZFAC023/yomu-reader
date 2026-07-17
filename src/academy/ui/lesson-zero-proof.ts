import {
    constructedResponseActivityPlugin,
    type ConstructedResponseActivityModel,
} from '../activities/constructed-response';
import { ACADEMY_ASSETS } from '../assets';
import type { LessonZeroContent } from '../content/lesson-zero';
import {
    LESSON_ZERO_CLASSROOM_SOURCE_IDS,
    LESSON_ZERO_SOURCE_MEDIA,
    LESSON_ZERO_SOURCE_PROVENANCE,
} from '../content/lesson-zero-source-material';
import type { LessonZeroAudioAsset, LessonZeroMission } from '../content/lesson-zero-schema';
import { createLessonZeroVowelDictation } from '../content/lesson-zero-vowel-dictation';
import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    createActivityRuntime,
    type ActivityController,
    type ActivityEvaluation,
} from '../domain/activity-runtime';
import type { LearnerProfileSnapshot } from '../domain/learner-record';
import type { SourceQuestion } from '../domain/source-library';
import type { PronunciationService } from '../integration/yomu-bridge';
import { createAcademyActivityRuntime } from '../minigames';
import type { AcademySpriteOptions } from './sprite';
import {
    createLessonZeroKanaGame,
    createLessonZeroSourcePage,
} from './lesson-zero-kana-game';
import { createLessonZeroKanaMasteryGate } from './lesson-zero-kana-mastery';
import {
    createAcademyVnStage,
    type AcademyVnCastMember,
} from './vn-stage';

const REPAIR_SOURCE_INDEX = 8;

export interface LessonZeroProofAudioState {
    readonly sourceGreetings: LessonZeroAudioRequirement;
    readonly textMission: LessonZeroAudioRequirement;
}

export interface LessonZeroAudioRequirement {
    readonly assetId: string;
    readonly state: LessonZeroAudioAsset['state'] | 'ready';
    readonly ready: boolean;
}

export interface LessonZeroProofOptions {
    readonly language: 'en' | 'ja';
    readonly content: LessonZeroContent;
    readonly rieExpressions: AcademySpriteOptions['expressions'];
    readonly pronunciation?: PronunciationService;
    readonly learner?: Pick<LearnerProfileSnapshot, 'displayName' | 'portraitId'>;
    readonly onEvaluation?: (evaluation: ActivityEvaluation) => void | Promise<void>;
    readonly onSupportUse?: (support: Readonly<{
        activityId: string;
        supportKind: 'hint';
        choiceId: string;
    }>) => void | Promise<void>;
    readonly onBack?: () => void;
    readonly onComplete?: () => void;
}

export interface LessonZeroProof {
    readonly element: HTMLElement;
    /** Internal release state. It is deliberately absent from learner-facing DOM. */
    readonly audioRequired: LessonZeroProofAudioState;
    dispose(): void;
}

/** Source-led Lesson Zero proof, kept isolated from the later academy missions. */
export async function createLessonZeroProof(options: LessonZeroProofOptions): Promise<LessonZeroProof> {
    const lifecycle = new AbortController();
    const mission = requiredMission(options.content, 'text');
    const sourceQuestions = await Promise.all(
        LESSON_ZERO_CLASSROOM_SOURCE_IDS.map(id => options.content.sourceLibrary.getQuestion(id)),
    );
    assertSourceBindings(sourceQuestions);
    const repairQuestion = sourceQuestions[REPAIR_SOURCE_INDEX]!;
    const assessment = assessmentModel(options.content, repairQuestion);
    const paper = createSurvivalPaper(sourceQuestions, repairQuestion.id);
    const stage = createAcademyVnStage({
        label: options.language === 'ja' ? 'レッスン0' : 'Lesson 0',
        uiLanguage: options.language,
        backLabel: options.language === 'ja' ? '授業案内へ戻る' : 'Back to lesson plan',
        onBack: options.onBack,
    });
    const rieSalutation = options.language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    const learnerName = options.learner?.displayName.trim() || (options.language === 'ja' ? '学習者' : 'Learner');
    const learnerExpressions = learnerExpressionSources(options.learner?.portraitId);
    let disposed = false;
    let learnerVisible = false;
    let rieExpression: AcademyVnCastMember['expression'] = 'neutral';
    let unbindPaperReadings: (() => void) | null = null;
    let kanaMasteryGate: ReturnType<typeof createLessonZeroKanaMasteryGate> | null = null;
    let dictationController: ActivityController | null = null;

    stage.element.classList.add('academy-lesson-zero-proof');
    stage.element.dataset.missionProof = mission.id;
    stage.element.dataset.provenance = LESSON_ZERO_SOURCE_MEDIA.provenance;
    stage.element.setAttribute('aria-label', options.language === 'ja' ? 'レッスン0' : 'Lesson 0');

    const renderCast = (): void => {
        const cast: AcademyVnCastMember[] = [{
            characterId: 'rie',
            displayName: rieSalutation,
            alt: options.language === 'ja' ? 'りえ先生' : 'Rie-sensei',
            position: 'left',
            expression: rieExpression,
            expressions: options.rieExpressions,
        }];
        if (learnerVisible) {
            cast.push({
                characterId: 'learner',
                displayName: learnerName,
                alt: options.language === 'ja' ? `${learnerName}の物語スプライト` : `${learnerName}'s story sprite`,
                position: 'right',
                expression: 'encouraging',
                expressions: learnerExpressions,
            });
        }
        stage.setCast(cast);
    };
    const setRie = (expression: AcademyVnCastMember['expression']): void => {
        rieExpression = expression;
        renderCast();
    };
    const showLearner = (): void => {
        learnerVisible = true;
        stage.element.dataset.learnerPresent = 'true';
        renderCast();
    };
    const setLine = (line: Parameters<typeof stage.setLine>[0]): void => {
        stage.setLine(line);
        if (!line) return;
        stage.element.dispatchEvent(new CustomEvent('academy:announce', {
            bubbles: true,
            detail: { message: `${line.speakerName ? `${line.speakerName}: ` : ''}${line.japanese}` },
        }));
    };

    const showInstruction = (index: number): void => {
        const question = sourceQuestions[index];
        if (!question) {
            showKanaMasteryGate();
            return;
        }
        paper.focus(question.id);
        setRie('neutral');
        setLine({
            id: `lesson-zero-proof:${question.id}`,
            speakerId: 'rie',
            speakerName: rieSalutation,
            japanese: instructionText(question),
            reading: readingControl(options, question.id),
            translation: question.prompt.en,
            translationEarned: true,
        });
        const nextIndex = index + 1;
        stage.setAction(buttonAction(
            options.language === 'ja' ? '次へ' : 'Next',
            () => nextIndex === REPAIR_SOURCE_INDEX ? mountAssessment() : showInstruction(nextIndex),
            lifecycle.signal,
        ));
    };

    const showKanaMasteryGate = (): void => {
        setRie('encouraging');
        setLine({
            id: 'lesson-zero-proof:kana-mastery-gate',
            speakerId: 'rie',
            speakerName: rieSalutation,
            japanese: 'さいごに、最初の五文字を もう一度。ぜんぶ自分で読めたら、白い地図帳へ進みましょう。',
            reading: readingControl(options, 'lesson-zero-proof:kana-mastery-gate'),
            translation: 'One last pass through the first five characters. Read each one without help, then the Blank Atlas can open.',
            translationEarned: true,
        });
        kanaMasteryGate?.dispose();
        kanaMasteryGate = createLessonZeroKanaMasteryGate({
            language: options.language,
            onEvaluation: evaluation => options.onEvaluation?.(evaluation),
            onComplete() { showVowelDictation(); },
        });
        stage.setAction({
            element: kanaMasteryGate.element,
            dispose() {
                kanaMasteryGate?.dispose();
                kanaMasteryGate = null;
            },
        });
    };

    const showVowelDictation = (): void => {
        setRie('encouraging');
        setLine({
            id: 'lesson-zero-proof:vowel-dictation', speakerId: 'rie', speakerName: rieSalutation,
            japanese: 'こんどは、音だけを聞いて書きましょう。',
            reading: readingControl(options, 'lesson-zero-proof:vowel-dictation'),
            translation: 'Now listen without looking and write the sounds.', translationEarned: true,
        });
        const hostElement = document.createElement('div');
        hostElement.className = 'academy-lesson-zero-dictation-host';
        const model = createLessonZeroVowelDictation();
        dictationController?.dispose();
        dictationController = createAcademyActivityRuntime().mount(model, {
            language: options.language,
            replace(view) { hostElement.replaceChildren(view); },
            announce(message) { stage.element.dispatchEvent(new CustomEvent('academy:announce', { bubbles: true, detail: { message } })); },
            playPronunciation(term, reading) { return (options.pronunciation ?? UNAVAILABLE_PRONUNCIATION).play(term, reading); },
            react(reaction) { setRie(reaction.expression); },
        }, async evaluation => {
            await options.onEvaluation?.(evaluation);
            if (evaluation.result.outcome === 'pass') options.onComplete?.();
        });
        stage.setAction({ element: hostElement, dispose() { dictationController?.dispose(); dictationController = null; } });
        dictationController.focus();
    };

    const mountAssessment = (): void => {
        paper.focus(repairQuestion.id);
        paper.conceal(repairQuestion.id);
        setRie('neutral');
        setLine({
            id: 'lesson-zero-proof:classroom-repair-prompt',
            speakerId: 'rie',
            speakerName: rieSalutation,
            japanese: instructionText(sourceQuestions[REPAIR_SOURCE_INDEX - 1]!),
            reading: readingControl(options, 'lesson-zero-proof:classroom-repair-prompt'),
            translation: sourceQuestions[REPAIR_SOURCE_INDEX - 1]!.prompt.en,
            translationEarned: true,
        });
        const hostElement = document.createElement('div');
        hostElement.className = 'academy-lesson-zero-response-host';
        const runtime = createActivityRuntime([constructedResponseActivityPlugin]);
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
            registerReadingSurface(surface) {
                return stage.registerReadingSurface(surface);
            },
        }, async evaluation => {
            await options.onEvaluation?.(evaluation);
            if (disposed || evaluation.result.outcome === 'lapse') return;
            paper.complete(repairQuestion);
            showLearner();
            setLine({
                id: 'lesson-zero-proof:learner-repair',
                speakerId: 'learner',
                speakerName: learnerName,
                japanese: repairQuestion.prompt.ja,
                reading: readingControl(options, 'lesson-zero-proof:learner-repair'),
                translation: repairQuestion.prompt.en,
                translationEarned: true,
            });
            const reward = firstTaskReward({
                language: options.language,
                reviewCount: evaluation.reviewSeeds.length,
                signal: lifecycle.signal,
                onReplay: mountAssessment,
                onContinue: () => showInstruction(REPAIR_SOURCE_INDEX + 1),
            });
            hostElement.replaceChildren(reward);
            reward.querySelector<HTMLButtonElement>('.academy-lesson-zero-replay-task')?.focus();
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

    const startClassroom = (): void => {
        stage.setDirection({
            plate: {
                id: 'lesson-zero-library',
                wide: ACADEMY_ASSETS.locations.library.wide,
                mobile: ACADEMY_ASSETS.locations.library.mobile,
                label: options.language === 'ja' ? '図書館' : 'Library',
            },
            transition: 'travel-right',
            focus: { x: 58, y: 46 },
        });
        stage.element.setAttribute(
            'aria-label',
            options.language === 'ja' ? '図書館でのレッスン0・テキストミッション' : 'Lesson 0 Text mission in the library',
        );
        stage.setObject({ element: paper.element });
        unbindPaperReadings = paper.bindReadingSupport(stage.registerReadingSurface);
        showInstruction(0);
    };

    const showKanaLesson = (): void => {
        stage.setDirection({
            plate: {
                id: 'lesson-zero-writing-studio',
                wide: ACADEMY_ASSETS.locations.writingStudio.wide,
                mobile: ACADEMY_ASSETS.locations.writingStudio.mobile,
                label: options.language === 'ja' ? '書道室' : 'Writing studio',
            },
            transition: 'travel-right',
            focus: { x: 56, y: 45 },
        });
        setRie('neutral');
        setLine({
            id: 'lesson-zero-proof:writing-system',
            speakerId: 'rie',
            speakerName: rieSalutation,
            japanese: 'ひらがな／Hiragana',
            reading: readingControl(options, 'lesson-zero-proof:writing-system'),
            translation: 'A phonetic syllabary. The symbols are Japanese origin and curvilinear in style.',
            translationEarned: true,
        });
        const kanaGame = createLessonZeroKanaGame({
            language: options.language,
            pronunciation: options.pronunciation ?? UNAVAILABLE_PRONUNCIATION,
            onReferenceChange(page) {
                stage.setObject(page ? { element: createLessonZeroSourcePage(page) } : null);
            },
            onComplete: startClassroom,
        });
        stage.setAction({ element: kanaGame.element, dispose: kanaGame.dispose });
    };

    const showClassPresentCeremony = (): void => {
        showLearner();
        stage.element.dataset.classPresentCeremony = 'complete';
        setRie('encouraging');
        setLine({
            id: 'lesson-zero-proof:class-present',
            speakerId: 'rie',
            speakerName: rieSalutation,
            japanese: `${learnerName}さん、出席です。ようこそ。`,
            reading: readingControl(options, 'lesson-zero-proof:class-present'),
            translation: `${learnerName} is present. Welcome to class.`,
            translationEarned: true,
        });
        stage.setAction(buttonAction(
            options.language === 'ja' ? '席について、かなを学ぶ' : 'Take your place and learn kana',
            showKanaLesson,
            lifecycle.signal,
        ));
    };

    const showGenkiGreeting = (): void => {
        stage.setDirection({
            plate: {
                id: 'lesson-zero-entrance',
                wide: ACADEMY_ASSETS.locations.entrance.wide,
                mobile: ACADEMY_ASSETS.locations.entrance.mobile,
                label: options.language === 'ja' ? '入口' : 'Entrance',
            },
            transition: 'travel-right',
            focus: { x: 54, y: 48 },
        });
        stage.setObject({ element: sourceFigure(
            LESSON_ZERO_SOURCE_MEDIA.genkiGreetings,
            'Genki I, Greetings page',
            'genki-greetings',
            LESSON_ZERO_SOURCE_PROVENANCE.genkiTextbookSha256,
        ) });
        setRie('encouraging');
        setLine({
            id: 'lesson-zero-proof:genki-greeting',
            speakerId: 'rie',
            speakerName: rieSalutation,
            japanese: 'はじめまして。よろしく おねがいします。',
            reading: readingControl(options, 'lesson-zero-proof:genki-greeting'),
            translation: 'How do you do? Nice to meet you.',
            translationEarned: true,
        });
        stage.setAction(greetingAudioAction(options.language, showClassPresentCeremony, lifecycle.signal));
    };

    showGenkiGreeting();

    return {
        element: stage.element,
        audioRequired: {
            sourceGreetings: { assetId: 'audio:genki-k00-g', state: 'ready', ready: true },
            textMission: audioRequirement(options.content, mission.id),
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            lifecycle.abort();
            unbindPaperReadings?.();
            kanaMasteryGate?.dispose();
            dictationController?.dispose();
            stage.dispose();
        },
    };
}

const UNAVAILABLE_PRONUNCIATION: PronunciationService = Object.freeze({
    async play() {
        throw new Error('Pronunciation service unavailable.');
    },
});

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
            en: 'Rie-sensei asks: “Do you understand?” Respond with the next classroom phrase.',
            ja: 'りえ先生：「わかりますか？」次の教室のことばで答えてください。',
        },
        payload: {
            acceptedAnswers,
            passFeedback: {
                en: '(very) good. Fine',
                ja: '１０）（とても）いいです。',
            },
            lapseFeedback: {
                errorTag: 'classroom-repair-form',
                contrast: {
                    en: 'No, I don\'t.',
                    ja: '８）A：いいえ、わかりません。',
                },
                repairPrompt: {
                    en: 'Once more/again (Please).',
                    ja: '９）もう いちど（おねがいします）。',
                },
                nearbyExample: {
                    en: 'Please listen to me.',
                    ja: '６）きいてください。',
                },
            },
            reviewSeedId: 'review:lesson-zero-repeat',
            reviewContent: {
                expression: 'もう いちど（おねがいします）',
                reading: 'もう いちど（おねがいします）',
                meanings: ['Once more/again (Please).'],
                sentence: '９）もう いちど（おねがいします）。',
            },
            hints: [{
                text: {
                    en: 'Once more/again (Please).',
                    ja: '９）もう いちど（おねがいします）。',
                },
                fillResponse: 'もう一度お願いします',
            }],
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
    };
}

function createSurvivalPaper(questions: readonly SourceQuestion[], concealedQuestionId: string): {
    readonly element: HTMLElement;
    focus(sourceQuestionId: string | null): void;
    conceal(sourceQuestionId: string): void;
    complete(question: SourceQuestion): void;
    bindReadingSupport(register: (surface: HTMLElement) => () => void): () => void;
} {
    const paper = document.createElement('figure');
    paper.className = 'academy-lesson-zero-handout';
    paper.tabIndex = 0;
    paper.dataset.object = 'classroom-survival-handout';
    paper.dataset.sourceDocumentId = 'document:moodle-1e58967e';
    paper.dataset.sourceSha256 = LESSON_ZERO_SOURCE_PROVENANCE.classroomPhrasesSha256;
    const heading = document.createElement('figcaption');
    heading.textContent = 'Chapter 1_Classroom phrases';
    const pages = document.createElement('div');
    pages.className = 'academy-lesson-zero-source-pages';
    const pageElements = LESSON_ZERO_SOURCE_MEDIA.classroomPhrases.map((src, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'academy-lesson-zero-source-page-frame';
        wrapper.dataset.page = String(index + 1);
        const image = document.createElement('img');
        image.src = src;
        image.alt = `Chapter 1_Classroom phrases, page ${index + 1}`;
        wrapper.append(image);
        pages.append(wrapper);
        return wrapper;
    });
    const list = document.createElement('ol');
    list.className = 'academy-lesson-zero-handout-lines academy-visually-hidden';
    const rowById = new Map<string, HTMLLIElement>();
    const readingSurfaceById = new Map<string, HTMLElement>();
    const readingDisposers = new Map<string, () => void>();
    let readingRegistration: ((surface: HTMLElement) => () => void) | null = null;
    const registerReadingSurface = (id: string): void => {
        readingDisposers.get(id)?.();
        readingDisposers.delete(id);
        const surface = readingSurfaceById.get(id);
        if (surface && readingRegistration) readingDisposers.set(id, readingRegistration(surface));
    };
    for (const question of questions) {
        const row = document.createElement('li');
        row.dataset.sourceQuestionId = question.id;
        row.lang = 'ja';
        const phrase = document.createElement('span');
        phrase.className = 'academy-lesson-zero-handout-phrase';
        if (question.id !== concealedQuestionId) phrase.textContent = instructionText(question);
        else row.dataset.answerConcealed = 'true';
        row.append(phrase);
        rowById.set(question.id, row);
        readingSurfaceById.set(question.id, phrase);
        list.append(row);
    }
    pageElements[1]!.dataset.answerConcealed = 'true';
    const flower = document.createElement('span');
    flower.className = 'academy-lesson-zero-flower';
    flower.dataset.flowerMark = '';
    flower.hidden = true;
    flower.textContent = '❀';
    flower.setAttribute('aria-label', 'Rie-sensei flower mark');
    paper.append(heading, pages, list, flower);
    return {
        element: paper,
        focus(sourceQuestionId) {
            const index = sourceQuestionId ? questions.findIndex(question => question.id === sourceQuestionId) : 0;
            const page = index >= 7 ? 2 : 1;
            paper.dataset.activePage = String(page);
            for (const wrapper of pageElements) wrapper.hidden = wrapper.dataset.page !== String(page);
            for (const [id, row] of rowById) row.dataset.active = String(id === sourceQuestionId);
        },
        conceal(sourceQuestionId) {
            const row = required(rowById, sourceQuestionId);
            required(readingSurfaceById, sourceQuestionId).textContent = '';
            row.dataset.answerConcealed = 'true';
            pageElements[1]!.dataset.answerConcealed = 'true';
        },
        complete(question) {
            const row = required(rowById, question.id);
            required(readingSurfaceById, question.id).textContent = instructionText(question);
            registerReadingSurface(question.id);
            delete row.dataset.answerConcealed;
            delete pageElements[1]!.dataset.answerConcealed;
            row.dataset.complete = 'true';
            flower.hidden = false;
        },
        bindReadingSupport(register) {
            readingRegistration = register;
            for (const id of readingSurfaceById.keys()) registerReadingSurface(id);
            return () => {
                readingRegistration = null;
                for (const dispose of readingDisposers.values()) dispose();
                readingDisposers.clear();
            };
        },
    };
}

function greetingAudioAction(language: 'en' | 'ja', onContinue: () => void, signal: AbortSignal) {
    const wrapper = document.createElement('div');
    wrapper.className = 'academy-lesson-zero-source-audio';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = LESSON_ZERO_SOURCE_MEDIA.genkiGreetingsAudio;
    audio.setAttribute('aria-label', 'Genki I K00-G');
    audio.dataset.sourceSha256 = LESSON_ZERO_SOURCE_PROVENANCE.genkiAudioSha256;
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'academy-vn-primary-action';
    next.textContent = language === 'ja' ? '次へ' : 'Next';
    next.disabled = true;
    const unlock = (): void => {
        next.disabled = false;
        wrapper.dataset.audioCommitted = 'true';
    };
    audio.addEventListener('play', unlock, { once: true, signal });
    audio.addEventListener('ended', unlock, { once: true, signal });
    next.addEventListener('click', onContinue, { once: true, signal });
    wrapper.append(audio, next);
    return { element: wrapper, dispose: () => { if (!audio.paused) audio.pause(); } };
}

function sourceFigure(src: string, alt: string, id: string, sourceSha256: string): HTMLElement {
    const figure = document.createElement('figure');
    figure.className = 'academy-lesson-zero-source-page';
    figure.tabIndex = 0;
    figure.setAttribute('aria-label', alt);
    figure.dataset.sourcePage = id;
    figure.dataset.sourceSha256 = sourceSha256;
    figure.dataset.sourceLocus = 'PDF page 35';
    const image = document.createElement('img');
    image.src = src;
    image.alt = alt;
    figure.append(image);
    return figure;
}

function instructionText(question: SourceQuestion): string {
    return question.prompt.ja;
}

function learnerExpressionSources(portraitId: string | undefined): AcademySpriteOptions['expressions'] {
    const portraits = ACADEMY_ASSETS.portraits as Readonly<Record<string, string>>;
    const still = portraitId ? portraits[portraitId] : undefined;
    const source = { still: still ?? ACADEMY_ASSETS.portraits['quality-2'] };
    return { neutral: source, encouraging: source, happy: source, repair: source };
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

function firstTaskReward(options: Readonly<{
    language: 'en' | 'ja';
    reviewCount: number;
    signal: AbortSignal;
    onReplay: () => void;
    onContinue: () => void;
}>): HTMLElement {
    if (options.reviewCount !== 1) {
        throw new Error(`Lesson 0 first task must award exactly one review; received ${options.reviewCount}.`);
    }
    const reward = document.createElement('section');
    reward.className = 'academy-lesson-zero-first-task-reward';
    reward.dataset.firstTaskReward = 'complete';
    reward.dataset.journalLinesAwarded = '1';
    reward.dataset.srsReviewsAwarded = '1';
    reward.setAttribute('aria-label', options.language === 'ja' ? '最初の課題の記録' : 'First task rewards');

    const heading = document.createElement('h3');
    heading.textContent = options.language === 'ja' ? '最初の課題、完了' : 'First task complete';
    const journal = document.createElement('p');
    journal.className = 'academy-lesson-zero-reward-journal';
    journal.textContent = options.language === 'ja'
        ? '日誌に1行：「もう一度お願いします」と言って、授業を続けられた。'
        : 'Journal · 1 line: I asked Rie-sensei to repeat it, and class kept moving.';
    const review = document.createElement('p');
    review.className = 'academy-lesson-zero-reward-review';
    review.textContent = options.language === 'ja'
        ? 'よむの復習に1件：もう一度お願いします'
        : 'Yomu SRS · 1 review: もう一度お願いします';

    const actions = document.createElement('div');
    actions.className = 'academy-lesson-zero-reward-actions';
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'academy-vn-primary-action academy-lesson-zero-replay-task';
    replay.textContent = options.language === 'ja' ? 'この課題をもう一度' : 'Replay this task';
    replay.addEventListener('click', options.onReplay, { once: true, signal: options.signal });
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'academy-vn-primary-action academy-lesson-zero-after-pass';
    next.textContent = options.language === 'ja' ? '授業を続ける' : 'Continue class';
    next.addEventListener('click', options.onContinue, { once: true, signal: options.signal });
    actions.append(replay, next);
    reward.append(heading, journal, review, actions);
    return reward;
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
    for (const [index, id] of LESSON_ZERO_CLASSROOM_SOURCE_IDS.entries()) {
        const question = questions[index];
        if (question?.id !== id || question.documentId !== 'document:moodle-1e58967e') {
            throw new Error(`Lesson 0 proof received the wrong immutable source record for ${id}.`);
        }
    }
}

function required<K, V>(map: ReadonlyMap<K, V>, key: K): V {
    const value = map.get(key);
    if (!value) throw new Error(`Missing Lesson 0 proof value: ${String(key)}`);
    return value;
}
