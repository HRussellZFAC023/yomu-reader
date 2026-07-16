import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type ValidationIssue,
} from '../domain/activity-runtime';

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

export type SourceVocabularySheetResponse = 'remembered' | 'reveal';

export const sourceVocabularySheetPlugin: ActivityPlugin<SourceVocabularySheetModel, SourceVocabularySheetResponse> = {
    kind: 'academy-source-vocabulary-sheet',
    validate,
    render,
    grade(model, response) {
        if (response !== 'remembered' && response !== 'reveal') {
            throw new TypeError('A source vocabulary recall decision is required.');
        }
        const passed = response === 'remembered';
        return {
            outcome: passed ? 'pass' : 'lapse',
            score: passed ? 1 : 0,
            errorTags: passed ? [] : [`source-vocabulary:${model.provenance.componentId}:repair`],
            feedback: {
                explanation: passed
                    ? { ja: '思い出してから、先生の行を確認しました。', en: 'You recalled the row before checking the teacher sheet.' }
                    : { ja: '先生の行を確認しました。もう一度、意味を隠して思い出しましょう。', en: 'The teacher row is now visible. Hide it and recall it once more.' },
                ...(passed ? {} : {
                    repairPrompt: { ja: '語と読みを声に出してから、意味をもう一度思い出してください。', en: 'Say the word and reading, then recall the meaning once more.' },
                    nearbyExample: { ja: model.payload.support.words, en: model.payload.support.meaning },
                }),
            },
        };
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
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-source-vocabulary-sheet';
    root.dataset.activityId = model.id;
    root.dataset.sourceQuestionId = model.sourceQuestionId;
    root.dataset.sourcePage = String(model.provenance.locus.page);
    root.dataset.sourceRow = String(model.provenance.locus.row);

    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    heading.append(localized(model.prompt.ja, 'ja', 'academy-japanese'));
    heading.append(localized(model.prompt.en, 'en', 'academy-support'));

    const source = document.createElement('p');
    source.className = 'academy-source-record';
    source.textContent = host.language === 'ja'
        ? `先生のワークシート · ${model.provenance.locus.page}ページ · ${model.provenance.locus.row}行目`
        : `Teacher worksheet · page ${model.provenance.locus.page} · row ${model.provenance.locus.row}`;
    source.dataset.jpdbReaderSurfaceIgnore = '';

    const word = document.createElement('p');
    word.className = 'academy-japanese academy-source-vocabulary-word';
    word.lang = 'ja';
    word.textContent = model.payload.exact.words;
    word.dataset.yomuRuntimeSurface = 'academy-activity';
    word.dataset.yomuFuriganaMode = 'all';

    const sourceReading = model.payload.exact.pronunciation
        ? revealedField('Source pronunciation', '先生の発音表記', model.payload.exact.pronunciation, 'source')
        : null;
    const actions = document.createElement('div');
    actions.className = 'academy-activity-actions';
    const remembered = action(host.language === 'ja' ? '思い出せた' : 'I remembered', 'remembered');
    const reveal = action(host.language === 'ja' ? '答えを確認' : 'Reveal meaning', 'reveal');
    actions.append(remembered, reveal);

    const feedback = document.createElement('div');
    feedback.className = 'academy-activity-feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    root.append(heading, source, word);
    if (sourceReading) root.append(sourceReading);
    root.append(actions, feedback);
    host.replace(root);

    let pending = false;
    const commit = (response: SourceVocabularySheetResponse): void => {
        if (pending) return;
        pending = true;
        setDisabled(actions, true);
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
                setDisabled(actions, false);
                reveal.disabled = true;
                remembered.focus();
            }
        }).catch(() => {
            pending = false;
            setDisabled(actions, false);
            feedback.textContent = host.language === 'ja'
                ? '答えを保存できませんでした。もう一度お試しください。'
                : 'Your answer was not saved. Try again.';
            feedback.setAttribute('role', 'alert');
            (response === 'remembered' ? remembered : reveal).focus();
        });
    };
    remembered.addEventListener('click', () => commit('remembered'), { signal: lifecycle.signal });
    reveal.addEventListener('click', () => commit('reveal'), { signal: lifecycle.signal });

    return {
        focus() { remembered.focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}

function revealedAnswer(model: SourceVocabularySheetModel): HTMLElement {
    const root = document.createElement('div');
    root.className = 'academy-source-vocabulary-answer';
    const reading = model.payload.exact.pronunciation ?? model.payload.support.reading;
    const meaning = model.payload.exact.meaning ?? model.payload.support.meaning;
    root.append(
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
        ),
    );
    return root;
}

function revealedField(en: string, ja: string, value: string, provenance: 'source' | 'yomu-support'): HTMLElement {
    const row = document.createElement('p');
    row.className = 'academy-source-vocabulary-field';
    row.dataset.fieldProvenance = provenance;
    const label = document.createElement('strong');
    label.textContent = `${ja} / ${en}: `;
    const content = document.createElement('span');
    content.lang = 'ja';
    content.textContent = value;
    row.append(label, content);
    return row;
}

function action(label: string, response: SourceVocabularySheetResponse): HTMLButtonElement {
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
    root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = disabled; });
}

function positiveInteger(value: unknown): value is number {
    return Number.isInteger(value) && Number(value) > 0;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}
