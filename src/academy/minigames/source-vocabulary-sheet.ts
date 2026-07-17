import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type ValidationIssue,
} from '../domain/activity-runtime';
import { normalizeJapaneseStudyAnswer } from '../../reader/newtab/japanese-input';

export interface SourceVocabularySheetModel extends ActivityModel {
    readonly kind: 'academy-source-vocabulary-sheet';
    readonly responseKind: 'source-vocabulary-recall';
    readonly sourceQuestionId: string;
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: string;
        readonly componentId: string;
        readonly sourceId: string;
        readonly sourceQuestionId: string;
        readonly payloadSha256: string;
        readonly sourceTitle: string;
        readonly locus: { readonly page: number; readonly row: number };
    };
    readonly payload: {
        readonly exact: {
            readonly words: string;
            readonly pronunciation: string | null;
            readonly meaning: string | null;
        };
        readonly support: {
            readonly words: string;
            readonly reading: string;
            readonly meaning: string;
        };
        readonly fieldProvenance: {
            readonly words: string;
            readonly reading: string;
            readonly meaning: string;
        };
    };
}

export type SourceVocabularySheetDirection = 'japanese-to-english' | 'english-to-japanese';
export type SourceVocabularySheetResponse = string | Readonly<{ answer: string }>;

export const sourceVocabularySheetPlugin: ActivityPlugin<SourceVocabularySheetModel, SourceVocabularySheetResponse> = {
    kind: 'academy-source-vocabulary-sheet',
    validate,
    render,
    grade(model, response) {
        if (response === 'reveal') return lapseResult(model, true);
        // Retain persisted and direct legacy evaluations. The live activity no
        // longer offers this self-reported route.
        if (response === 'remembered') return passResult();

        const answer = responseText(response);
        if (!answer) throw new TypeError('A source vocabulary answer is required.');
        const passed = sourceVocabularyDirection(model) === 'japanese-to-english'
            ? acceptedEnglishAnswers(model).has(normalizeEnglishAnswer(answer))
            : acceptedJapaneseAnswers(model).has(normalizeJapaneseStudyAnswer(answer));
        return passed ? passResult() : lapseResult(model, false);
    },
    toReviewSeeds(model, result) {
        return [{
            id: `review:${model.provenance.packageId}:${model.provenance.componentId}:p${model.provenance.locus.page}:r${model.provenance.locus.row}`,
            conceptId: model.conceptIds[0],
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: model.sourceQuestionId,
            content: {
                expression: model.payload.support.words,
                ...(model.payload.support.reading !== model.payload.support.words
                    ? { reading: model.payload.support.reading }
                    : {}),
                meanings: [model.payload.support.meaning],
            },
        }];
    },
};

function passResult() {
    return {
        outcome: 'pass' as const,
        score: 1,
        errorTags: [],
        feedback: { explanation: { ja: '正解です。', en: 'Correct.' } },
    };
}

function lapseResult(model: SourceVocabularySheetModel, revealed: boolean) {
    const repairPrompt = sourceVocabularyDirection(model) === 'japanese-to-english'
        ? { ja: 'ことばを見て、英語の意味をもう一度入力してください。', en: 'Look at the word, then type its English meaning again.' }
        : { ja: '意味を見て、日本語の単語か読み方をもう一度入力してください。', en: 'Look at the meaning, then type the Japanese word or reading again.' };
    return {
        outcome: 'lapse' as const,
        score: 0,
        errorTags: [`source-vocabulary:${model.provenance.componentId}:repair`],
        feedback: {
            explanation: revealed
                ? { ja: '先生の行を確認しました。もう一度答えましょう。', en: 'The teacher row is visible. Try it once more.' }
                : { ja: 'まだ違います。先生の行を確認して、もう一度答えましょう。', en: 'Not quite. Check the teacher row and try again.' },
            repairPrompt,
            nearbyExample: { ja: model.payload.support.words, en: model.payload.support.meaning },
        },
    };
}

export function sourceVocabularyDirection(model: SourceVocabularySheetModel): SourceVocabularySheetDirection {
    return model.provenance.locus.row % 2 === 1 ? 'japanese-to-english' : 'english-to-japanese';
}

function responseText(response: SourceVocabularySheetResponse): string {
    if (typeof response === 'string') return response.trim();
    return typeof response?.answer === 'string' ? response.answer.trim() : '';
}

function acceptedEnglishAnswers(model: SourceVocabularySheetModel): ReadonlySet<string> {
    return new Set([model.payload.support.meaning, model.payload.exact.meaning]
        .filter((value): value is string => typeof value === 'string')
        .flatMap(value => {
            const variants = [value, ...value.split(/(?:\s*[/;,]\s*|\r?\n+)/u)];
            return variants.flatMap(variant => [
                variant,
                variant.replace(/\s*(?:\([^)]*\)|\[[^\]]*\])/gu, ' '),
            ]);
        })
        .map(normalizeEnglishAnswer)
        .filter(Boolean));
}

function acceptedJapaneseAnswers(model: SourceVocabularySheetModel): ReadonlySet<string> {
    return new Set([
        model.payload.support.words,
        model.payload.support.reading,
        model.payload.exact.pronunciation,
    ].filter((value): value is string => typeof value === 'string')
        .map(normalizeVocabularyJapaneseAnswer)
        .filter(Boolean));
}

function normalizeVocabularyJapaneseAnswer(value: string): string {
    return normalizeJapaneseStudyAnswer(value
        .replace(/^\s*\*?review\s*/iu, '')
        .replace(/^[\-\u2010-\u2015]+/u, ''));
}

function normalizeEnglishAnswer(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/\p{Mark}+/gu, '')
        .toLocaleLowerCase('en')
        .replace(/[^a-z0-9]+/gu, ' ')
        .trim();
}

function validate(model: SourceVocabularySheetModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'Source vocabulary recall requires the assessed answer-support contract.' });
    }
    if (!text(model.sourceQuestionId) || model.sourceQuestionId !== model.provenance?.sourceQuestionId) {
        issues.push({ path: 'sourceQuestionId', message: 'The exact source item id must be preserved.' });
    }
    if (!text(model.provenance?.componentId) || !text(model.provenance?.sourceId)) {
        issues.push({ path: 'provenance', message: 'Source component and document ids are required.' });
    }
    if (!/^[a-f0-9]{64}$/u.test(model.provenance?.payloadSha256 ?? '')) {
        issues.push({ path: 'provenance.payloadSha256', message: 'A source payload SHA-256 is required.' });
    }
    if (!text(model.provenance?.sourceTitle)) {
        issues.push({ path: 'provenance.sourceTitle', message: 'The source title is required.' });
    }
    if (!positiveInteger(model.provenance?.locus?.page) || !positiveInteger(model.provenance?.locus?.row)) {
        issues.push({ path: 'provenance.locus', message: 'Positive source page and row numbers are required.' });
    }
    if (!text(model.payload?.exact?.words)) {
        issues.push({ path: 'payload.exact.words', message: 'Exact source words are required.' });
    }
    for (const field of ['pronunciation', 'meaning'] as const) {
        const value = model.payload?.exact?.[field];
        if (value !== null && !text(value)) {
            issues.push({ path: `payload.exact.${field}`, message: 'An exact source cell must be text or null.' });
        }
    }
    for (const field of ['words', 'reading', 'meaning'] as const) {
        if (!text(model.payload?.support?.[field])) {
            issues.push({ path: `payload.support.${field}`, message: 'A non-empty learner support field is required.' });
        }
        if (!text(model.payload?.fieldProvenance?.[field])) {
            issues.push({ path: `payload.fieldProvenance.${field}`, message: 'Field provenance is required.' });
        }
    }
    return issues;
}

function render(
    model: SourceVocabularySheetModel,
    host: ActivityHost,
    submit: (response: SourceVocabularySheetResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const direction = sourceVocabularyDirection(model);
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-source-vocabulary-sheet';
    root.dataset.activityId = model.id;
    root.dataset.sourceQuestionId = model.sourceQuestionId;
    root.dataset.sourcePage = String(model.provenance.locus.page);
    root.dataset.sourceRow = String(model.provenance.locus.row);
    root.dataset.direction = direction;

    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    const instruction = direction === 'japanese-to-english'
        ? { ja: '英語の意味を入力しましょう。', en: 'Type the English meaning.' }
        : { ja: '日本語の単語か読み方を入力しましょう。', en: 'Type the Japanese word or reading.' };
    heading.append(localized(instruction.ja, 'ja', 'academy-japanese'));
    heading.append(localized(instruction.en, 'en', 'academy-support'));

    const source = document.createElement('p');
    source.className = 'academy-source-record';
    source.textContent = host.language === 'ja'
        ? `先生のワークシート · ${model.provenance.locus.page}ページ · ${model.provenance.locus.row}行目`
        : `Teacher worksheet · page ${model.provenance.locus.page} · row ${model.provenance.locus.row}`;
    source.dataset.jpdbReaderSurfaceIgnore = '';

    const cue = direction === 'japanese-to-english'
        ? japaneseCue(model)
        : englishCue(model);
    const sourceReading = direction === 'japanese-to-english' && model.payload.exact.pronunciation
        ? revealedField('Source pronunciation', '先生の発音表記', model.payload.exact.pronunciation, 'source')
        : null;

    const form = document.createElement('form');
    form.className = 'academy-source-vocabulary-form academy-activity-actions';
    const label = document.createElement('label');
    label.htmlFor = `${model.id}-answer`;
    label.textContent = direction === 'japanese-to-english'
        ? (host.language === 'ja' ? '英語の意味' : 'English meaning')
        : (host.language === 'ja' ? '日本語のことば・読み方' : 'Japanese word or reading');
    const input = document.createElement('input');
    input.id = label.htmlFor;
    input.name = 'source-vocabulary-answer';
    input.type = 'text';
    input.required = true;
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.className = 'academy-source-vocabulary-input';
    input.dataset.sourceVocabularyAnswer = '';
    const help = document.createElement('p');
    help.className = 'academy-source-vocabulary-help';
    help.textContent = direction === 'english-to-japanese'
        ? (host.language === 'ja' ? 'ローマ字でも入力できます。' : 'Romaji is accepted.')
        : (host.language === 'ja' ? '短い英語で答えてください。' : 'Use the worksheet meaning.');
    help.dataset.jpdbReaderSurfaceIgnore = '';
    const check = action(host.language === 'ja' ? '確認' : 'Check', 'answer');
    check.type = 'submit';
    const reveal = action(host.language === 'ja' ? '答えを確認' : 'Reveal answer', 'reveal');
    form.append(label, input, help, check, reveal);

    const feedback = document.createElement('div');
    feedback.className = 'academy-activity-feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    root.append(heading, source, cue);
    if (sourceReading) root.append(sourceReading);
    root.append(form, feedback);
    host.replace(root);

    let pending = false;
    const commit = (response: SourceVocabularySheetResponse): void => {
        if (pending) return;
        pending = true;
        setDisabled(form, true);
        feedback.setAttribute('role', 'status');
        feedback.textContent = host.language === 'ja' ? '確認しています…' : 'Checking…';
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            feedback.replaceChildren(revealedAnswer(model));
            const summary = document.createElement('p');
            summary.className = 'academy-authored-week-feedback-summary';
            summary.append(localized(evaluation.result.feedback.explanation.ja, 'ja', 'academy-japanese'));
            summary.append(localized(evaluation.result.feedback.explanation.en, 'en', 'academy-support'));
            feedback.prepend(summary);
            pending = evaluation.result.outcome === 'pass';
            if (!pending) {
                setDisabled(form, false);
                reveal.disabled = true;
                input.select();
            }
        }).catch(() => {
            pending = false;
            setDisabled(form, false);
            feedback.textContent = host.language === 'ja'
                ? '答えを保存できませんでした。もう一度お試しください。'
                : 'Your answer was not saved. Try again.';
            feedback.setAttribute('role', 'alert');
            (response === 'reveal' ? reveal : input).focus();
        });
    };
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!input.value.trim()) return;
        commit({ answer: input.value });
    }, { signal: lifecycle.signal });
    reveal.addEventListener('click', () => commit('reveal'), { signal: lifecycle.signal });
    return {
        focus() { input.focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}

function japaneseCue(model: SourceVocabularySheetModel): HTMLElement {
    const word = document.createElement('p');
    word.className = 'academy-japanese academy-source-vocabulary-word';
    word.lang = 'ja';
    word.textContent = model.payload.exact.words;
    word.dataset.fieldProvenance = 'source';
    word.dataset.yomuRuntimeSurface = 'academy-activity';
    word.dataset.yomuFuriganaMode = 'all';
    return word;
}

function englishCue(model: SourceVocabularySheetModel): HTMLElement {
    const meaning = document.createElement('p');
    meaning.className = 'academy-support academy-source-vocabulary-meaning';
    meaning.lang = 'en';
    meaning.textContent = model.payload.support.meaning;
    meaning.dataset.fieldProvenance = model.payload.fieldProvenance.meaning === 'source-provided'
        ? 'source'
        : 'yomu-support';
    meaning.dataset.jpdbReaderSurfaceIgnore = '';
    return meaning;
}

function revealedAnswer(model: SourceVocabularySheetModel): HTMLElement {
    const root = document.createElement('div');
    root.className = 'academy-source-vocabulary-answer';
    const reading = model.payload.exact.pronunciation ?? model.payload.support.reading;
    const meaning = model.payload.exact.meaning ?? model.payload.support.meaning;
    root.append(
        revealedField('Source word', '先生のことば', model.payload.exact.words, 'source'),
        revealedField(
            model.payload.exact.pronunciation ? 'Source pronunciation' : 'Yomu reading support',
            model.payload.exact.pronunciation ? '先生の発音表記' : 'よむの読み方サポート',
            reading,
            model.payload.exact.pronunciation ? 'source' : 'yomu-support',
        ),
        revealedField(
            model.payload.exact.meaning ? 'Source meaning' : 'Yomu meaning support',
            model.payload.exact.meaning ? '先生の意味' : 'よむの意味サポート',
            meaning,
            model.payload.exact.meaning ? 'source' : 'yomu-support',
            'en',
        ),
    );
    return root;
}

function revealedField(
    en: string,
    ja: string,
    value: string,
    provenance: 'source' | 'yomu-support',
    lang: 'en' | 'ja' = 'ja',
): HTMLElement {
    const row = document.createElement('p');
    row.className = 'academy-source-vocabulary-field';
    row.dataset.fieldProvenance = provenance;
    const label = document.createElement('strong');
    label.textContent = `${ja} / ${en}: `;
    const content = document.createElement('span');
    content.lang = lang;
    content.textContent = value;
    row.append(label, content);
    return row;
}

function action(label: string, response: 'answer' | 'remembered' | 'reveal'): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-button academy-button-primary';
    button.dataset.sourceVocabularyResponse = response;
    button.textContent = label;
    return button;
}

function localized(value: string, lang: 'en' | 'ja', className: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = className;
    span.lang = lang;
    span.textContent = value;
    if (lang === 'en') span.dataset.jpdbReaderSurfaceIgnore = '';
    return span;
}

function setDisabled(root: ParentNode, disabled: boolean): void {
    root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')
        .forEach(control => { control.disabled = disabled; });
}

function positiveInteger(value: unknown): value is number {
    return Number.isInteger(value) && Number(value) > 0;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}
