import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { installKanjiDoodle, type DoodleStroke } from '../../reader/kanji/doodle';
import { assessKanjiStrokes, type KanjiStrokeAssessment } from '../../reader/kanji/stroke-grader';
import type { KanjiVGStrokeShape } from '../../reader/kanji/vg';
import type {
    ActivityController,
    ActivityEvaluation,
    ActivityHost,
    ActivityModel,
    ActivityPlugin,
    GradeResult,
    ReviewSeed,
    ValidationIssue,
} from '../domain/activity-runtime';
import type { KanjiWritingModel } from '../integration/yomu-bridge';
import { element, localizedElement } from '../ui/dom';

export interface KanjiWritingActivityModel extends ActivityModel {
    readonly kind: 'kanji-writing';
    readonly responseKind: 'recognition-or-doodle';
    readonly payload: {
        readonly trace: KanjiWritingModel;
        readonly language: AcademyLanguage;
        readonly reading: string;
        readonly meaning: { readonly en: string; readonly ja: string };
        readonly recognitionOptions: readonly {
            readonly character: string;
            readonly label: { readonly en: string; readonly ja: string };
        }[];
    };
}

type KanjiWritingResponse =
    | { readonly phase: 'recognition'; readonly character: string }
    | { readonly phase: 'writing'; readonly assessment: KanjiStrokeAssessment; readonly inputMode: 'doodle' | 'keyboard' };

export function createOpeningKanjiActivity(trace: KanjiWritingModel, language: AcademyLanguage = 'en'): KanjiWritingActivityModel {
    return {
        id: 'activity:lesson-zero-kanji-one',
        kind: 'kanji-writing',
        responseKind: 'recognition-or-doodle',
        conceptIds: ['concept:kanji-one'],
        prompt: {
            en: 'Recognise 一, then write it from left to right.',
            ja: '「一」を見分けてから、左から右へ書きましょう。',
        },
        payload: {
            trace,
            language,
            reading: 'いち',
            meaning: { en: 'one', ja: 'ひとつ' },
            recognitionOptions: [
                { character: '一', label: { en: '一 · one', ja: '一・ひとつ' } },
                { character: '二', label: { en: '二 · two', ja: '二・ふたつ' } },
                { character: '口', label: { en: '口 · mouth', ja: '口・くち' } },
            ],
        },
    };
}

export const kanjiWritingActivityPlugin: ActivityPlugin<KanjiWritingActivityModel, KanjiWritingResponse> = {
    kind: 'kanji-writing',
    validate(model) {
        const issues: ValidationIssue[] = [];
        if (!model.payload?.trace?.svg) issues.push({ path: 'payload.trace.svg', message: 'A KanjiVG trace is required.' });
        if (model.payload?.trace?.strokeCount < 1) issues.push({ path: 'payload.trace.strokeCount', message: 'A stroke count is required.' });
        if (!model.payload?.recognitionOptions?.some(option => option.character === model.payload.trace.character)) {
            issues.push({ path: 'payload.recognitionOptions', message: 'The target character must be an option.' });
        }
        return issues;
    },
    render(model, host, submit) {
        return renderKanjiWritingActivity(model, host, submit);
    },
    grade(model, response) {
        if (response.phase === 'recognition') return gradeRecognition(model, response.character);
        return gradeWriting(response.assessment, response.inputMode);
    },
    toReviewSeeds(model, result) {
        if (result.outcome !== 'pass' || !result.errorTags.includes('kanji-writing-complete')) return [];
        return [openingKanjiReviewSeed(model)];
    },
};

function renderKanjiWritingActivity(
    model: KanjiWritingActivityModel,
    host: ActivityHost,
    submit: (response: KanjiWritingResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const language = model.payload.language;
    const root = element('section', 'academy-kanji-activity');
    root.dataset.yomuRuntimeSurface = 'kanji-writing';
    const prompt = localizedElement('p', 'academy-kanji-prompt', language, model.prompt);
    const recognition = element('div', 'academy-kanji-recognition');
    const recognitionQuestion = localizedElement('h2', '', language, {
        en: 'Which character means “one”?',
        ja: '「ひとつ」という意味の漢字はどれですか。',
    });
    const recognitionOptions = element('div', 'academy-kanji-options');
    const status = element('p', 'academy-activity-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    recognition.append(recognitionQuestion, recognitionOptions, status);

    const writing = element('div', 'academy-kanji-writing');
    writing.hidden = true;
    const writingPrompt = localizedElement('h2', '', language, {
        en: 'Now write 一 from left to right.',
        ja: 'では、「一」を左から右へ書いてください。',
    });
    const practice = renderDoodleShell(model, language);
    const keyboard = renderKeyboardWritingAlternative(language);
    const keyboardButton = keyboard.querySelector<HTMLButtonElement>('[data-keyboard-stroke]')!;
    const keyboardStatus = keyboard.querySelector<HTMLElement>('[role="status"]')!;
    const writingStatus = practice.querySelector<HTMLElement>('[data-newtab-doodle-result]')!;
    writing.append(writingPrompt, practice, keyboard);
    root.append(prompt, recognition, writing);
    host.replace(root);

    let disposed = false;
    let writingComplete = false;
    let submittingWriting = false;
    model.payload.recognitionOptions.forEach(option => {
        const button = localizedElement('button', 'academy-button academy-button-secondary academy-kanji-option', language, option.label);
        button.type = 'button';
        button.dataset.character = option.character;
        button.addEventListener('click', () => {
            recognitionOptions.querySelectorAll('button').forEach(candidate => { (candidate as HTMLButtonElement).disabled = true; });
            void submit({ phase: 'recognition', character: option.character }).then(evaluation => {
                if (disposed) return;
                status.textContent = localizedFeedback(evaluation, language);
                if (evaluation.result.outcome === 'pass') {
                    recognition.classList.add('academy-kanji-recognition-complete');
                    writing.hidden = false;
                    requestAnimationFrame(() => keyboardButton.focus());
                    return;
                }
                recognitionOptions.querySelectorAll('button').forEach(candidate => { (candidate as HTMLButtonElement).disabled = false; });
            });
        });
        recognitionOptions.append(button);
    });

    const submitWriting = (assessment: KanjiStrokeAssessment, inputMode: 'doodle' | 'keyboard') => {
        if (disposed || writingComplete || submittingWriting) return;
        submittingWriting = true;
        void submit({ phase: 'writing', assessment, inputMode }).then(evaluation => {
            if (disposed) return;
            const targetStatus = inputMode === 'keyboard' ? keyboardStatus : writingStatus;
            targetStatus.textContent = localizedFeedback(evaluation, language);
            practice.classList.toggle('academy-doodle-pass', evaluation.result.outcome === 'pass');
            practice.classList.toggle('academy-doodle-lapse', evaluation.result.outcome === 'lapse');
            if (evaluation.result.outcome === 'pass') {
                writingComplete = true;
                const canvas = practice.querySelector<HTMLCanvasElement>('canvas');
                if (canvas) canvas.style.pointerEvents = 'none';
                writing.querySelectorAll('button').forEach(button => { button.disabled = true; });
            }
        }).finally(() => { submittingWriting = false; });
    };

    installKanjiDoodle(practice, () => language, {
        onChange(strokes) {
            if (!strokes.some(stroke => stroke.length > 1)) return;
            submitWriting(assessWriting(model.payload.trace, strokes), 'doodle');
        },
        onClear() {
            writingStatus.textContent = '';
            practice.classList.remove('academy-doodle-pass', 'academy-doodle-lapse');
        },
    });
    let keyboardSteps = 0;
    const advanceKeyboardStroke = () => {
        if (disposed || writingComplete || submittingWriting) return;
        keyboardSteps += 1;
        keyboardStatus.textContent = language === 'ja'
            ? `右向きの動き ${keyboardSteps}/3`
            : `Rightward movement ${keyboardSteps}/3`;
        if (keyboardSteps < 3) return;
        keyboardButton.disabled = true;
        submitWriting({
            passed: true,
            score: 100,
            expectedStrokes: 1,
            actualStrokes: 1,
            shapeScore: 1,
            message: 'Keyboard trace: one left-to-right stroke',
        }, 'keyboard');
    };
    keyboardButton.addEventListener('click', advanceKeyboardStroke);
    keyboardButton.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        event.preventDefault();
        advanceKeyboardStroke();
    });

    return {
        focus() { recognitionOptions.querySelector<HTMLButtonElement>('button')?.focus(); },
        dispose() {
            disposed = true;
            (practice as HTMLElement & { __yomuKanjiDoodleCleanup?: () => void }).__yomuKanjiDoodleCleanup?.();
            root.remove();
        },
    };
}

function renderKeyboardWritingAlternative(language: AcademyLanguage): HTMLElement {
    const root = element('section', 'academy-keyboard-writing');
    const heading = localizedElement('h3', '', language, {
        en: 'Keyboard alternative',
        ja: 'キーボードで書く代替方法',
    });
    const instructions = localizedElement('p', '', language, {
        en: 'Focus the button and press Enter or Space three times to trace one stroke from left to right.',
        ja: 'ボタンにフォーカスし、Enterまたはスペースを3回押して、左から右への一画をたどってください。',
    });
    const button = localizedElement('button', 'academy-button academy-button-secondary', language, {
        en: 'Trace one step to the right',
        ja: '右へ一段階たどる',
    });
    button.type = 'button';
    button.dataset.keyboardStroke = '';
    button.dataset.jpdbReaderSurfaceIgnore = '';
    const status = element('p', 'academy-activity-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.append(heading, instructions, button, status);
    return root;
}

function renderDoodleShell(model: KanjiWritingActivityModel, language: AcademyLanguage): HTMLElement {
    const root = element('div', 'academy-doodle jpdb-reader-kanjivg');
    const stage = element('div', 'jpdb-reader-doodle-stage');
    stage.dataset.kanji = model.payload.trace.character;
    const ghost = element('div', 'jpdb-reader-doodle-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = model.payload.trace.svg;
    const canvas = element('canvas', 'jpdb-reader-doodle-canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', language === 'ja' ? '「一」を書くキャンバス' : 'Canvas for writing 一');
    stage.append(ghost, canvas);
    const tools = element('div', 'jpdb-reader-doodle-tools');
    const help = element('span', 'jpdb-reader-help');
    help.textContent = language === 'ja' ? '1画・左から右' : '1 stroke · left to right';
    const trace = element('button', 'academy-button academy-button-quiet jpdb-reader-doodle-control');
    trace.type = 'button';
    trace.dataset.doodleTrace = '';
    trace.dataset.jpdbReaderSurfaceIgnore = '';
    trace.textContent = language === 'ja' ? '見本を隠す' : 'Hide trace';
    const clear = element('button', 'academy-button academy-button-quiet jpdb-reader-doodle-control');
    clear.type = 'button';
    clear.dataset.doodleClear = '';
    clear.dataset.jpdbReaderSurfaceIgnore = '';
    clear.textContent = language === 'ja' ? '消す' : 'Clear';
    tools.append(help, trace, clear);
    const result = element('div', 'academy-doodle-result');
    result.dataset.newtabDoodleResult = '';
    result.setAttribute('role', 'status');
    root.append(stage, tools, result);
    return root;
}

function assessWriting(trace: KanjiWritingModel, strokes: DoodleStroke[]): KanjiStrokeAssessment {
    return assessKanjiStrokes(
        strokes,
        trace.strokeCount,
        trace.strokeShapes as KanjiVGStrokeShape[],
    );
}

function gradeRecognition(model: KanjiWritingActivityModel, character: string): GradeResult {
    const passed = character === model.payload.trace.character;
    return passed ? {
        outcome: 'pass',
        score: 1,
        errorTags: ['kanji-recognition-complete'],
        feedback: { explanation: { en: 'Yes—一 means “one”.', ja: 'はい。「一」は「ひとつ」です。' } },
    } : {
        outcome: 'lapse',
        score: 0,
        errorTags: ['kanji-recognition-confusion'],
        feedback: {
            explanation: { en: 'That is a different character.', ja: 'それは別の漢字です。' },
            repairPrompt: { en: 'Look for one horizontal line.', ja: '横線が一本の漢字を探してください。' },
            nearbyExample: { en: '一人 means “one person”.', ja: '「一人」は「ひとり」です。' },
        },
    };
}

function gradeWriting(assessment: KanjiStrokeAssessment, inputMode: 'doodle' | 'keyboard'): GradeResult {
    return assessment.passed ? {
        outcome: 'pass',
        score: assessment.score / 100,
        errorTags: ['kanji-writing-complete', `kanji-writing-${inputMode}`],
        feedback: { explanation: { en: 'One clean stroke, left to right.', ja: '左から右へ、きれいな一画です。' } },
    } : {
        outcome: 'lapse',
        score: assessment.score / 100,
        errorTags: [assessment.actualStrokes === assessment.expectedStrokes ? 'stroke-shape-or-direction' : 'stroke-count'],
        feedback: {
            explanation: { en: assessment.message, ja: '画数・形・書く方向をもう一度確認しましょう。' },
            repairPrompt: { en: 'Clear the desk, then draw one long line from left to right.', ja: '消してから、左から右へ長い線を一本書いてください。' },
            nearbyExample: { en: 'The KanjiVG ghost shows the exact path and direction.', ja: 'KanjiVGの見本で、線の形と方向を確認できます。' },
        },
    };
}

function openingKanjiReviewSeed(model: KanjiWritingActivityModel): ReviewSeed {
    return {
        id: 'review:kanji-one',
        conceptId: 'concept:kanji-one',
        reason: 'new-learning',
        content: {
            expression: model.payload.trace.character,
            reading: model.payload.reading,
            meanings: [model.payload.meaning.en],
        },
    };
}

function localizedFeedback(evaluation: ActivityEvaluation, language: AcademyLanguage): string {
    const feedback = evaluation.result.feedback;
    const text = language === 'ja' ? feedback.explanation.ja : feedback.explanation.en;
    const repair = evaluation.result.outcome === 'lapse'
        ? language === 'ja' ? feedback.repairPrompt?.ja : feedback.repairPrompt?.en
        : '';
    return [text, repair].filter(Boolean).join(' ');
}
