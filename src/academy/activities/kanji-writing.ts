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
    readonly responseKind: 'doodle-then-reading';
    readonly payload: {
        readonly trace: KanjiWritingModel;
        readonly language: AcademyLanguage;
        readonly reading: string;
        readonly meaning: { readonly en: string; readonly ja: string };
    };
}

export interface KanjiDoodleWritingResponse {
    readonly phase: 'writing';
    readonly inputMode: 'doodle';
    readonly assessment: KanjiStrokeAssessment;
}

export interface KanjiReadingRecallResponse {
    readonly phase: 'reading';
    readonly reading: string;
}

export type KanjiWritingResponse = KanjiDoodleWritingResponse | KanjiReadingRecallResponse;

export function createOpeningKanjiActivity(trace: KanjiWritingModel, language: AcademyLanguage = 'en'): KanjiWritingActivityModel {
    return {
        id: 'activity:lesson-zero-kanji-one',
        kind: 'kanji-writing',
        responseKind: 'doodle-then-reading',
        conceptIds: ['concept:kanji-one'],
        prompt: {
            en: 'Write 一, then enter its reading.',
            ja: '「一」を書いてから、読み方を入力してください。',
        },
        payload: {
            trace,
            language,
            reading: 'いち',
            meaning: { en: 'one', ja: 'ひとつ' },
        },
    };
}

export const kanjiWritingActivityPlugin: ActivityPlugin<KanjiWritingActivityModel, KanjiWritingResponse> = {
    kind: 'kanji-writing',
    validate(model) {
        const issues: ValidationIssue[] = [];
        if (!model.payload?.trace?.svg) issues.push({ path: 'payload.trace.svg', message: 'A KanjiVG trace is required.' });
        if (model.payload?.trace?.strokeCount < 1) issues.push({ path: 'payload.trace.strokeCount', message: 'A stroke count is required.' });
        if (!model.payload?.reading?.trim()) issues.push({ path: 'payload.reading', message: 'A target reading is required.' });
        return issues;
    },
    render(model, host, submit) {
        return renderKanjiWritingActivity(model, host, submit);
    },
    grade(model, response) {
        const parsed = parseKanjiWritingResponse(response);
        if (parsed.phase === 'writing') return gradeWriting(parsed.assessment);
        return gradeReading(model, parsed.reading);
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
    const writing = element('div', 'academy-kanji-writing');
    const cue = element('h2', 'academy-kanji-cue');
    cue.textContent = language === 'ja' ? model.payload.meaning.ja : model.payload.meaning.en;
    cue.dataset.jpdbReaderSurfaceIgnore = '';
    const writingPrompt = localizedElement('p', 'academy-kanji-writing-instruction', language, {
        en: 'Write the character as one stroke from left to right.',
        ja: '左から右へ、一画で書いてください。',
    });
    const practice = renderDoodleShell(model, language);
    const writingStatus = practice.querySelector<HTMLElement>('[data-newtab-doodle-result]')!;
    const continueToReading = localizedElement('button', 'academy-button academy-button-primary academy-kanji-next', language, {
        en: 'Enter the reading',
        ja: '読み方を入力',
    });
    continueToReading.type = 'button';
    continueToReading.hidden = true;
    writing.append(cue, writingPrompt, practice, continueToReading);

    const recall = element('form', 'academy-kanji-recall');
    recall.hidden = true;
    const recallPrompt = localizedElement('h2', '', language, {
        en: 'How do you read 一?',
        ja: '「一」はどう読みますか。',
    });
    const character = element('div', 'academy-kanji-recall-character');
    character.lang = 'ja';
    character.textContent = model.payload.trace.character;
    character.dataset.jpdbReaderSurfaceIgnore = '';
    const readingLabel = localizedElement('label', 'academy-field', language, { en: 'Reading', ja: '読み方' });
    const readingInput = element('input', 'academy-input');
    readingInput.type = 'text';
    readingInput.autocomplete = 'off';
    readingInput.inputMode = 'text';
    readingInput.setAttribute('aria-label', language === 'ja' ? '「一」の読み方' : 'Reading of 一');
    readingLabel.append(readingInput);
    const readingSubmit = localizedElement('button', 'academy-button academy-button-primary', language, { en: 'Check reading', ja: '読み方を確認' });
    readingSubmit.type = 'submit';
    const readingStatus = element('p', 'academy-activity-status');
    readingStatus.setAttribute('role', 'status');
    readingStatus.setAttribute('aria-live', 'polite');
    recall.append(recallPrompt, character, readingLabel, readingSubmit, readingStatus);
    root.append(prompt, writing, recall);
    host.replace(root);

    let disposed = false;
    let writingComplete = false;
    let submittingWriting = false;
    const submitWriting = (assessment: KanjiStrokeAssessment) => {
        if (disposed || writingComplete || submittingWriting) return;
        submittingWriting = true;
        void submit({ phase: 'writing', assessment, inputMode: 'doodle' }).then(evaluation => {
            if (disposed) return;
            writingStatus.textContent = `${localizedFeedback(evaluation, language)} ${Math.round(evaluation.result.score * 100)}% · ${assessment.actualStrokes}/${assessment.expectedStrokes} ${language === 'ja' ? '画' : 'strokes'}`;
            practice.classList.toggle('academy-doodle-pass', evaluation.result.outcome === 'pass');
            practice.classList.toggle('academy-doodle-lapse', evaluation.result.outcome === 'lapse');
            if (evaluation.result.outcome === 'pass') {
                writingComplete = true;
                const canvas = practice.querySelector<HTMLCanvasElement>('canvas');
                if (canvas) canvas.style.pointerEvents = 'none';
                writing.querySelectorAll('button').forEach(button => { button.disabled = true; });
                continueToReading.hidden = false;
                continueToReading.disabled = false;
                requestAnimationFrame(() => continueToReading.focus());
            }
        }).finally(() => { submittingWriting = false; });
    };

    installKanjiDoodle(practice, () => language, {
        onChange(strokes) {
            if (!strokes.some(stroke => stroke.length > 1)) return;
            submitWriting(assessWriting(model.payload.trace, strokes));
        },
        onClear() {
            writingStatus.textContent = '';
            practice.classList.remove('academy-doodle-pass', 'academy-doodle-lapse');
        },
    });
    continueToReading.addEventListener('click', () => {
        writing.hidden = true;
        recall.hidden = false;
        readingInput.focus();
    });
    recall.addEventListener('submit', event => {
        event.preventDefault();
        readingSubmit.disabled = true;
        void submit({ phase: 'reading', reading: readingInput.value }).then(evaluation => {
            if (disposed) return;
            readingStatus.textContent = localizedFeedback(evaluation, language);
            if (evaluation.result.outcome === 'pass') {
                readingInput.disabled = true;
                return;
            }
            readingSubmit.disabled = false;
            readingInput.focus();
            readingInput.select();
        }).catch(error => {
            readingSubmit.disabled = false;
            host.announce(error instanceof Error ? error.message : String(error));
        });
    });

    return {
        focus() { practice.querySelector<HTMLCanvasElement>('canvas')?.focus(); },
        dispose() {
            disposed = true;
            (practice as HTMLElement & { __yomuKanjiDoodleCleanup?: () => void }).__yomuKanjiDoodleCleanup?.();
            root.remove();
        },
    };
}

function renderDoodleShell(model: KanjiWritingActivityModel, language: AcademyLanguage): HTMLElement {
    const root = element('div', 'academy-doodle jpdb-reader-kanjivg');
    const stage = element('div', 'jpdb-reader-doodle-stage');
    stage.dataset.kanji = model.payload.trace.character;
    stage.classList.add('trace-hidden');
    const ghost = element('div', 'jpdb-reader-doodle-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.hidden = true;
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
    trace.textContent = language === 'ja' ? '見本を見る' : 'Show stroke guide';
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

function gradeWriting(assessment: KanjiStrokeAssessment): GradeResult {
    return assessment.passed ? {
        outcome: 'pass',
        score: assessment.score / 100,
        errorTags: ['kanji-writing-complete', 'kanji-writing-doodle'],
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

function gradeReading(model: KanjiWritingActivityModel, reading: string): GradeResult {
    const normalized = reading.trim().normalize('NFKC').replaceAll('イチ', 'いち');
    return normalized === model.payload.reading ? {
        outcome: 'pass',
        score: 1,
        errorTags: ['kanji-reading-recalled'],
        feedback: { explanation: { en: 'Yes: 一 is read いち here.', ja: 'はい。「一」はここでは「いち」と読みます。' } },
    } : {
        outcome: 'lapse',
        score: 0,
        errorTags: ['kanji-reading-recall'],
        feedback: {
            explanation: { en: 'That reading does not match this character yet.', ja: 'その読み方は、まだこの漢字と合っていません。' },
            repairPrompt: { en: 'Say the cue once, then type it in hiragana.', ja: '最初の手がかりを一度声に出してから、ひらがなで入力してください。' },
            nearbyExample: { en: '一月 begins with いち.', ja: '「一月」は「いち」から始まります。' },
        },
    };
}

function parseKanjiWritingResponse(value: unknown): KanjiWritingResponse {
    if (!isRecord(value)) throw new TypeError('A Kanji writing response is required.');
    if (value.phase === 'writing') {
        if (value.inputMode !== 'doodle') {
            throw new TypeError('Handwriting evidence must come from the Yomu Doodle canvas.');
        }
        return {
            phase: 'writing',
            inputMode: 'doodle',
            assessment: parseStrokeAssessment(value.assessment),
        };
    }
    if (value.phase === 'reading') {
        if (typeof value.reading !== 'string') throw new TypeError('A typed reading response is required.');
        return { phase: 'reading', reading: value.reading };
    }
    throw new TypeError('Kanji response phase must be writing or reading.');
}

function parseStrokeAssessment(value: unknown): KanjiStrokeAssessment {
    if (!isRecord(value)
        || typeof value.passed !== 'boolean'
        || !finiteNumber(value.score)
        || !finiteNumber(value.expectedStrokes)
        || !finiteNumber(value.actualStrokes)
        || typeof value.message !== 'string') {
        throw new TypeError('A valid Yomu Doodle stroke assessment is required.');
    }
    if (value.score < 0 || value.score > 100
        || value.expectedStrokes < 1 || !Number.isInteger(value.expectedStrokes)
        || value.actualStrokes < 0 || !Number.isInteger(value.actualStrokes)
        || (value.shapeScore !== undefined && !finiteNumber(value.shapeScore))) {
        throw new TypeError('The Yomu Doodle stroke assessment is outside its valid range.');
    }
    return {
        passed: value.passed,
        score: value.score,
        expectedStrokes: value.expectedStrokes,
        actualStrokes: value.actualStrokes,
        ...(value.shapeScore === undefined ? {} : { shapeScore: value.shapeScore }),
        message: value.message,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
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
