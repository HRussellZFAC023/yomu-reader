import { academyText, type AcademyLanguage } from '../../reader/app/academy-copy';
import { constructedResponseActivityPlugin, type ConstructedResponseActivityModel } from '../activities/constructed-response';
import { ACADEMY_ASSETS } from '../assets';
import { AAKASH_DIRECTIONS_CONTENT } from '../content/aakash-meet';
import { canRenderAcademyCastPortrait } from '../domain/cast-registry';
import { createActivityRuntime, type ActivityController, type ActivityEvaluation } from '../domain/activity-runtime';
import { createAcademyVnStage, type AcademyVnLine, type AcademyVnSlotContent } from './vn-stage';

export interface AakashMeetScreenOptions {
    readonly language: AcademyLanguage;
    readonly activity: ConstructedResponseActivityModel;
    readonly completed: boolean;
    readonly onEvaluation: (evaluation: ActivityEvaluation) => void | Promise<void>;
    readonly onSupportUse?: (support: Readonly<{ activityId: string; supportKind: 'hint'; choiceId: string }>) => void | Promise<void>;
    readonly onContinue: () => void;
}

interface GuidedOption {
    readonly id: string;
    readonly japanese: string;
    readonly reading: string;
    readonly correct: boolean;
}

interface GuidedFeedback {
    readonly correct: Readonly<{ en: string; ja: string }>;
    readonly lapse: Readonly<{ en: string; ja: string }>;
    readonly next: Readonly<{ en: string; ja: string }>;
}

/** A complete teaching-to-production character beat behind the AcademyApp interface. */
export function renderAakashMeetScreen(options: AakashMeetScreenOptions): HTMLElement {
    const lifecycle = new AbortController();
    const stage = createAcademyVnStage({
        label: options.language === 'ja' ? '雨の中の道案内' : 'Directions in the rain',
        uiLanguage: options.language,
    });
    const runtime = createActivityRuntime([constructedResponseActivityPlugin]);
    const paper = createDirectionsPaper();
    const recordedReadings = new Set<string>();
    let controller: ActivityController | null = null;
    let paperMounted = false;
    let passed = options.completed;

    stage.element.classList.add('academy-aakash-directions-vn');
    stage.element.dataset.academyScreen = 'aakash-directions-vn';
    stage.element.dataset.sceneTransition = 'rainy-directions';
    stage.setDirection({
        plate: {
            id: 'cafe-rain',
            wide: ACADEMY_ASSETS.locations.cafe.wide,
            mobile: ACADEMY_ASSETS.locations.cafe.mobile,
            label: options.language === 'ja' ? '雨のカフェ前' : 'Outside the cafe in the rain',
        },
        transition: 'dissolve',
        focus: { x: 52, y: 48 },
    });
    const aakashSprite = canRenderAcademyCastPortrait('aakash', 'story-runtime')
        ? (ACADEMY_ASSETS.characters.approved as Readonly<Record<string, string>>).aakash
        : undefined;
    if (aakashSprite) {
        stage.setCast([{
            characterId: 'aakash',
            displayName: 'Aakash',
            alt: options.language === 'ja' ? '雨の中で道を尋ねるAakash' : 'Aakash asking for directions in the rain',
            position: 'left',
            expression: 'neutral',
            expressions: { neutral: { still: aakashSprite } },
        }]);
    }

    const reading = (id: string): AcademyVnLine['reading'] => ({
        showLabel: options.language === 'ja' ? '読み方' : 'Readings',
        hideLabel: options.language === 'ja' ? '読み方を隠す' : 'Hide readings',
        onChange(visible) {
            if (!visible || recordedReadings.has(id)) return;
            recordedReadings.add(id);
            void options.onSupportUse?.({ activityId: options.activity.id, supportKind: 'hint', choiceId: `reading:${id}` });
        },
    });

    const mountPaper = (): void => {
        if (paperMounted) return;
        paperMounted = true;
        let unbindReadings = (): void => undefined;
        stage.setObject({
            element: paper.element,
            dispose() { unbindReadings(); },
        });
        unbindReadings = paper.bindReadingSupport(stage.registerReadingSurface);
    };

    const showContext = (): void => {
        const content = AAKASH_DIRECTIONS_CONTENT.context;
        stage.setLine({
            id: content.id,
            japanese: content.japanese,
            reading: reading(content.id),
            ...translation(content.translation, options.language),
        });
        stage.setAction(buttonAction(
            options.language === 'ja' ? '声をかける' : 'See what he needs',
            showQuestion,
            lifecycle.signal,
        ));
    };

    const showQuestion = (): void => {
        mountPaper();
        paper.focus('question');
        const content = AAKASH_DIRECTIONS_CONTENT.question;
        stage.setLine(aakashLine(content.id, content.japanese, content.translation, options, reading));
        stage.setAction(buttonAction(
            options.language === 'ja' ? '道順を習う' : 'Learn the route',
            showVocabulary,
            lifecycle.signal,
        ));
    };

    const showVocabulary = (): void => {
        paper.showVocabulary();
        paper.focus('vocabulary');
        const content = AAKASH_DIRECTIONS_CONTENT.vocabularyPrompt;
        stage.setLine({
            id: content.id,
            japanese: content.japanese,
            reading: reading(content.id),
            ...translation(content.translation, options.language),
        });
        stage.setAction(buttonAction(
            options.language === 'ja' ? '右を見つける' : 'Find “right”',
            showRecognition,
            lifecycle.signal,
        ));
    };

    const showRecognition = (): void => {
        paper.focus('right');
        const content = AAKASH_DIRECTIONS_CONTENT.recognition;
        stage.setLine({
            id: content.id,
            japanese: content.japanese,
            reading: reading(content.id),
            ...translation(content.translation, options.language),
        });
        stage.setAction(guidedChoiceAction(
            content.id,
            content.options,
            {
                correct: { en: 'Yes. 右 (migi) means right.', ja: 'はい。「右（みぎ）」が right です。' },
                lapse: { en: 'That is 左 (hidari), left. Check the directions and try again.', ja: 'それは「左（ひだり）」です。道順を見て、もう一度。' },
                next: { en: 'Learn the frame', ja: '文の形を見る' },
            },
            showFrame,
            options.language,
            lifecycle.signal,
        ));
    };

    const showFrame = (): void => {
        paper.showFrame();
        paper.focus('frame');
        const content = AAKASH_DIRECTIONS_CONTENT.frame;
        stage.setLine({
            id: content.id,
            japanese: content.japanese,
            reading: reading(content.id),
            ...translation(content.translation, options.language),
        });
        stage.setAction(buttonAction(
            options.language === 'ja' ? '文の形を練習する' : 'Practice the frame',
            showGuidedPractice,
            lifecycle.signal,
        ));
    };

    const showGuidedPractice = (): void => {
        paper.focus('frame');
        const content = AAKASH_DIRECTIONS_CONTENT.guidedPractice;
        stage.setLine({
            id: content.id,
            japanese: content.japanese,
            reading: reading(content.id),
            ...translation(content.translation, options.language),
        });
        stage.setAction(guidedChoiceAction(
            content.id,
            content.options,
            {
                correct: { en: 'Path first, final side second. That frame is ready.', ja: '道を先に、最後の向きを後に。文の形ができました。' },
                lapse: { en: 'Keep the route order: go straight first, then give the final side.', ja: '道順どおりに、先にまっすぐ進み、最後に向きを伝えます。' },
                next: { en: 'Help Aakash', ja: 'Aakashを案内する' },
            },
            mountAssessment,
            options.language,
            lifecycle.signal,
        ));
    };

    const showResolution = (): void => {
        passed = true;
        const content = AAKASH_DIRECTIONS_CONTENT.resolution;
        stage.setLine(aakashLine(content.id, content.japanese, content.translation, options, reading));
        stage.setAction(continueAction(options, lifecycle.signal));
    };

    function mountAssessment(): void {
        stage.setObject(null);
        const content = AAKASH_DIRECTIONS_CONTENT.assessment;
        stage.setLine(aakashLine(content.id, content.japanese, content.translation, options, reading));
        const hostElement = document.createElement('div');
        hostElement.className = 'academy-aakash-response-host';
        controller = runtime.mount(options.activity, {
            language: options.language,
            replace(view) { hostElement.replaceChildren(view); },
            announce(message) {
                stage.element.dispatchEvent(new CustomEvent('academy:announce', { bubbles: true, detail: { message } }));
            },
            recordSupportUse: options.onSupportUse,
            registerReadingSurface: stage.registerReadingSurface,
        }, async evaluation => {
            await options.onEvaluation(evaluation);
            if (evaluation.result.outcome !== 'pass' || passed) return;
            passed = true;
            const resolution = AAKASH_DIRECTIONS_CONTENT.resolution;
            stage.setLine(aakashLine(
                resolution.id,
                resolution.japanese,
                resolution.translation,
                options,
                reading,
            ));
            const action = continueButton(options, lifecycle.signal);
            hostElement.replaceChildren(action);
            action.focus();
        });
        stage.setAction({
            element: hostElement,
            dispose() {
                controller?.dispose();
                controller = null;
            },
        });
        controller.focus();
    }

    if (options.completed) showResolution();
    else showContext();
    stage.element.addEventListener('academy:dispose', () => lifecycle.abort(), { once: true });

    return stage.element;
}

function createDirectionsPaper(): {
    readonly element: HTMLElement;
    showVocabulary(): void;
    showFrame(): void;
    focus(target: 'question' | 'vocabulary' | 'right' | 'frame'): void;
    bindReadingSupport(register: (surface: HTMLElement) => () => void): () => void;
} {
    const paper = document.createElement('figure');
    paper.className = 'academy-aakash-route-note';
    paper.dataset.object = 'aakash-route-note';
    const title = document.createElement('figcaption');
    title.textContent = '道案内 / Directions';
    const question = learningLine(
        AAKASH_DIRECTIONS_CONTENT.question.japanese,
        AAKASH_DIRECTIONS_CONTENT.question.reading,
        AAKASH_DIRECTIONS_CONTENT.question.translation,
    );
    question.dataset.learningTarget = 'question';
    const vocabulary = document.createElement('dl');
    vocabulary.className = 'academy-aakash-vocabulary';
    vocabulary.hidden = true;
    const rows = new Map<string, HTMLElement>();
    const japaneseSurfaces: HTMLElement[] = [question.querySelector<HTMLElement>('.academy-japanese')!];
    for (const item of AAKASH_DIRECTIONS_CONTENT.vocabulary) {
        const row = document.createElement('div');
        row.className = 'academy-aakash-vocabulary-row';
        const term = document.createElement('dt');
        const japanese = document.createElement('span');
        japanese.className = 'academy-japanese academy-aakash-note-japanese';
        japanese.lang = 'ja';
        japanese.textContent = item.japanese;
        const reading = document.createElement('span');
        reading.className = 'academy-aakash-note-reading';
        reading.textContent = item.reading;
        term.append(japanese, reading);
        const meaning = document.createElement('dd');
        meaning.textContent = item.meaning;
        row.append(term, meaning);
        vocabulary.append(row);
        japaneseSurfaces.push(japanese);
        if (item.japanese === '右') rows.set('right', row);
    }
    rows.set('vocabulary', vocabulary);
    rows.set('question', question);
    const frame = document.createElement('section');
    frame.className = 'academy-aakash-frame-note';
    frame.hidden = true;
    frame.dataset.learningTarget = 'frame';
    const frameLine = learningLine(
        AAKASH_DIRECTIONS_CONTENT.frame.japanese,
        AAKASH_DIRECTIONS_CONTENT.frame.reading,
        AAKASH_DIRECTIONS_CONTENT.frame.translation,
    );
    const frameNote = document.createElement('p');
    frameNote.className = 'academy-aakash-frame-note-copy';
    frameNote.textContent = AAKASH_DIRECTIONS_CONTENT.frame.note;
    frame.append(frameLine, frameNote);
    japaneseSurfaces.push(frameLine.querySelector<HTMLElement>('.academy-japanese')!);
    rows.set('frame', frame);
    paper.append(title, question, vocabulary, frame);

    return {
        element: paper,
        showVocabulary() { vocabulary.hidden = false; },
        showFrame() { frame.hidden = false; },
        focus(target) {
            rows.forEach(row => { row.dataset.active = 'false'; });
            const active = rows.get(target);
            if (active) {
                active.dataset.active = 'true';
                active.scrollIntoView?.({ block: 'nearest' });
            }
        },
        bindReadingSupport(register) {
            const disposers = japaneseSurfaces.map(register);
            return () => disposers.forEach(dispose => dispose());
        },
    };
}

function learningLine(japaneseText: string, readingText: string, meaningText: string): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'academy-aakash-learning-line';
    const japanese = document.createElement('span');
    japanese.className = 'academy-japanese academy-aakash-note-japanese';
    japanese.lang = 'ja';
    japanese.textContent = japaneseText;
    const reading = document.createElement('span');
    reading.className = 'academy-aakash-note-reading';
    reading.textContent = readingText;
    const meaning = document.createElement('span');
    meaning.className = 'academy-aakash-note-meaning';
    meaning.textContent = meaningText;
    root.append(japanese, reading, meaning);
    return root;
}

function guidedChoiceAction(
    stepId: string,
    options: readonly GuidedOption[],
    feedback: GuidedFeedback,
    onContinue: () => void,
    language: AcademyLanguage,
    signal: AbortSignal,
): AcademyVnSlotContent {
    const root = document.createElement('section');
    root.className = 'academy-aakash-guided-action';
    root.dataset.guidedStep = stepId;
    const choices = document.createElement('div');
    choices.className = 'academy-choice-options academy-aakash-guided-options';
    choices.setAttribute('role', 'group');
    const outcome = document.createElement('div');
    outcome.className = 'academy-aakash-guided-feedback';
    outcome.setAttribute('role', 'status');
    outcome.setAttribute('aria-live', 'polite');

    for (const option of options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'academy-choice-option academy-aakash-guided-option';
        button.dataset.choiceId = option.id;
        const japanese = document.createElement('span');
        japanese.className = 'academy-japanese academy-aakash-choice-japanese';
        japanese.lang = 'ja';
        japanese.textContent = option.japanese;
        const reading = document.createElement('span');
        reading.className = 'academy-aakash-choice-reading';
        reading.textContent = option.reading;
        button.append(japanese, reading);
        button.addEventListener('click', () => {
            const message = document.createElement('p');
            message.textContent = localized(option.correct ? feedback.correct : feedback.lapse, language);
            if (!option.correct) {
                root.dataset.outcome = 'lapse';
                outcome.replaceChildren(message);
                return;
            }
            root.dataset.outcome = 'pass';
            choices.querySelectorAll<HTMLButtonElement>('button').forEach(choice => { choice.disabled = true; });
            const next = document.createElement('button');
            next.type = 'button';
            next.className = 'academy-vn-primary-action';
            next.textContent = localized(feedback.next, language);
            next.addEventListener('click', onContinue, { once: true, signal });
            outcome.replaceChildren(message, next);
            next.focus();
        }, { signal });
        choices.append(button);
    }
    root.append(choices, outcome);
    return { element: root };
}

function aakashLine(
    id: string,
    japanese: string,
    english: string,
    options: AakashMeetScreenOptions,
    reading: (id: string) => AcademyVnLine['reading'],
): AcademyVnLine {
    return {
        id,
        speakerId: 'aakash',
        speakerName: 'Aakash',
        japanese,
        reading: reading(id),
        ...translation(english, options.language),
    };
}

function translation(english: string, language: AcademyLanguage): Partial<AcademyVnLine> {
    return language === 'en' ? { translation: english, translationEarned: true } : {};
}

function localized(value: Readonly<{ en: string; ja: string }>, language: AcademyLanguage): string {
    return value[language];
}

function buttonAction(label: string, onClick: () => void, signal: AbortSignal): AcademyVnSlotContent {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-vn-primary-action';
    button.textContent = label;
    button.addEventListener('click', onClick, { once: true, signal });
    return { element: button };
}

function continueAction(options: AakashMeetScreenOptions, signal: AbortSignal): AcademyVnSlotContent {
    return { element: continueButton(options, signal) };
}

function continueButton(options: AakashMeetScreenOptions, signal: AbortSignal): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-vn-primary-action academy-aakash-continue';
    button.textContent = academyText(options.language, 'aakashContinue');
    button.addEventListener('click', options.onContinue, { once: true, signal });
    return button;
}
