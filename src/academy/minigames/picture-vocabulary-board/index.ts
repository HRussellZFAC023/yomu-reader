import './style.css';

import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type ReviewSeed,
    type ValidationIssue,
} from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import {
    gradeFromScore,
    localizedNodes,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export interface PictureVocabularyOption {
    readonly id: string;
    readonly label: string;
}

export interface PictureVocabularyItem {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly sourceRow: string;
    readonly prompt: LocalizedText;
    readonly options: readonly PictureVocabularyOption[];
    readonly correctOptionId: string;
    readonly conceptId: string;
    readonly errorTag: string;
}

export interface PictureVocabularyBoardResponse {
    readonly answers: readonly Readonly<{ itemId: string; optionId: string }> [];
}

export interface PictureVocabularyBoardModel extends ActivityModel {
    readonly kind: 'academy-picture-vocabulary-board';
    readonly responseKind: 'source-picture-vocabulary-select';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l04';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 5822243;
            readonly pictureHandout: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly title: 'Chapter 2 pics for vocabulary';
                readonly locus: { readonly page: 1; readonly pictureNumbers: readonly [1, 2, 3, 4, 5, 6, 7, 8] };
            };
            readonly vocabularySheet: {
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly title: 'Chapter 2-1 Vocabulary Sheet';
                readonly rows: readonly [1, 2, 3, 4, 5, 6, 7, 8];
            };
            readonly sourceImage: { readonly url: string; readonly sha256: string; readonly alt: LocalizedText };
        };
        readonly support: {
            readonly phase: 'after-moodle-picture-vocabulary';
            readonly minna: { readonly reference: 'Minna no Nihongo I · Lessons 1–2'; readonly reuse: 'sequence-only' };
            readonly genki: { readonly sourceId: string; readonly relation: 'post-instruction-guided-fill' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: LocalizedText; instruction: LocalizedText; items: readonly PictureVocabularyItem[] }> [];
        readonly sourceCaption: LocalizedText;
        readonly items: readonly PictureVocabularyItem[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

const PICTURE_SHA256 = '37dc9a453a0dfe5a42ac8f6f29e07136266aeca503aa1edd7a669091e2b9e524';
const VOCABULARY_SHA256 = 'a267243216a4c999d8733ed6febeeed938c47b593f0d1841b1dc8c244f37b253';

export const pictureVocabularyBoardPlugin: ActivityPlugin<PictureVocabularyBoardModel, PictureVocabularyBoardResponse> = {
    kind: 'academy-picture-vocabulary-board',
    validate,
    render,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const errorTags: string[] = [];
        let correct = 0;
        model.payload.items.forEach(item => {
            if (answers.get(item.id) === item.correctOptionId) correct += 1;
            else errorTags.push(item.errorTag);
        });
        return gradeFromScore(correct / model.payload.items.length, model.payload.passScore, errorTags.sort(), model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        return model.payload.items.flatMap(item => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(item.errorTag)) return [];
            const answer = item.options.find(option => option.id === item.correctOptionId)!;
            return [{
                id: `review:l1-l04:picture-vocabulary:${item.id}`,
                conceptId: item.conceptId,
                reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
                sourceQuestionId: item.sourceQuestionId,
                content: { expression: answer.label, meanings: [item.sourceRow] },
            } satisfies ReviewSeed];
        });
    },
};

function validate(model: PictureVocabularyBoardModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The picture vocabulary board requires assessed answer support.' });
    }
    const provenance = model.provenance;
    if (provenance?.packageId !== 'l1-l04' || provenance.answerVisibility !== 'after-attempt'
        || provenance.moodle?.moduleId !== 5822243
        || provenance.moodle.pictureHandout?.payloadSha256 !== PICTURE_SHA256
        || provenance.moodle.pictureHandout.title !== 'Chapter 2 pics for vocabulary'
        || provenance.moodle.pictureHandout.locus?.page !== 1
        || provenance.moodle.pictureHandout.locus.pictureNumbers?.join(',') !== '1,2,3,4,5,6,7,8'
        || provenance.moodle.vocabularySheet?.payloadSha256 !== VOCABULARY_SHA256
        || provenance.moodle.vocabularySheet.title !== 'Chapter 2-1 Vocabulary Sheet'
        || provenance.moodle.vocabularySheet.rows?.join(',') !== '1,2,3,4,5,6,7,8'
        || provenance.moodle.sourceImage?.url !== '/academy/content/lessons/l1-l04/moodle-chapter-2-pics-for-vocabulary-page-1.png'
        || !/^[a-f0-9]{64}$/u.test(provenance.moodle.sourceImage?.sha256 ?? '')
        || !text(provenance.moodle.pictureHandout.sourceId) || !text(provenance.moodle.vocabularySheet.sourceId)
        || !text(provenance.moodle.sourceImage?.alt?.en) || !text(provenance.moodle.sourceImage?.alt?.ja)) {
        issues.push({ path: 'provenance.moodle', message: 'The exact Moodle picture page, vocabulary rows, and source image are required.' });
    }
    if (provenance?.support?.phase !== 'after-moodle-picture-vocabulary'
        || provenance.support.minna?.reference !== 'Minna no Nihongo I · Lessons 1–2'
        || provenance.support.minna.reuse !== 'sequence-only'
        || !text(provenance.support.genki?.sourceId)
        || provenance.support.genki.relation !== 'post-instruction-guided-fill') {
        issues.push({ path: 'provenance.support', message: 'Minna and Genki must remain mapped support after Moodle picture vocabulary.' });
    }
    const teaching = model.payload?.teaching;
    if (!Array.isArray(teaching) || teaching.length !== 1 || !text(teaching[0]?.title?.en) || !text(teaching[0]?.title?.ja)
        || !text(teaching[0]?.instruction?.en) || !text(teaching[0]?.instruction?.ja)
        || teaching[0].items?.length !== 8) {
        issues.push({ path: 'payload.teaching', message: 'All eight exact source mappings must be taught before assessment.' });
    }
    if (!text(model.payload?.sourceCaption?.en) || !text(model.payload?.sourceCaption?.ja)) {
        issues.push({ path: 'payload.sourceCaption', message: 'The source image needs a bilingual caption.' });
    }
    validateItems(model, issues);
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'Every source picture item is required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function validateItems(model: PictureVocabularyBoardModel, issues: ValidationIssue[]): void {
    const items: readonly PictureVocabularyItem[] = model.payload.items;
    if (!Array.isArray(items) || items.length !== 8) {
        issues.push({ path: 'payload.items', message: 'The first eight numbered source pictures are required.' });
        return;
    }
    const ids = new Set<string>();
    const sourceIds = new Set<string>();
    const tags = new Set<string>();
    items.forEach((item: PictureVocabularyItem, index: number) => {
        if (item.sourceOrder !== index + 1 || !text(item.id) || ids.has(item.id) || !text(item.sourceQuestionId)
            || sourceIds.has(item.sourceQuestionId) || !text(item.sourceRow) || !text(item.prompt?.en) || !text(item.prompt?.ja)
            || item.options?.length !== 3 || new Set(item.options.map(option => option.id)).size !== 3
            || item.options.some(option => !text(option.id) || !text(option.label))
            || !item.options.some(option => option.id === item.correctOptionId)
            || !model.conceptIds.includes(item.conceptId) || !text(item.errorTag) || tags.has(item.errorTag)) {
            issues.push({ path: `payload.items.${index}`, message: 'Every taught picture needs three source-row choices and deterministic evidence.' });
        }
        ids.add(item.id);
        sourceIds.add(item.sourceQuestionId);
        tags.add(item.errorTag);
    });
}

function render(
    model: PictureVocabularyBoardModel,
    host: ActivityHost,
    submit: (response: PictureVocabularyBoardResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-picture-vocabulary-board';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const reference = renderSourceReference(model, host.language);
    const form = document.createElement('form');
    form.className = 'academy-picture-vocabulary-board-form';
    form.setAttribute('aria-labelledby', heading.id);
    model.payload.items.forEach(item => form.append(renderItem(model, item)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-picture-vocabulary-board-check';
    check.textContent = host.language === 'ja' ? 'ことばを確認する' : 'Check the vocabulary';
    form.append(check);
    const key = renderAnswerKey(model);
    const status = statusRegion('academy-kit-feedback academy-picture-vocabulary-board-feedback');
    root.append(heading, teaching, reference, form, key, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja' ? '八つの絵すべてにことばを選んでください。' : 'Choose a word for all eight source pictures.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            key.hidden = false;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(root, false);
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { form.querySelector<HTMLSelectElement>('select')?.focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderTeaching(model: PictureVocabularyBoardModel): HTMLElement {
    const step = model.payload.teaching[0];
    const section = document.createElement('section');
    section.className = 'academy-picture-vocabulary-board-teaching';
    section.dataset.lessonPhase = 'teaching';
    const title = document.createElement('h3');
    title.append(...localizedNodes(step.title));
    const instruction = document.createElement('p');
    instruction.append(...localizedNodes(step.instruction));
    const list = document.createElement('ol');
    step.items.forEach(item => {
        const entry = document.createElement('li');
        entry.textContent = item.sourceRow;
        list.append(entry);
    });
    section.append(title, instruction, list);
    return section;
}

function renderSourceReference(model: PictureVocabularyBoardModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const figure = document.createElement('figure');
    figure.className = 'academy-picture-vocabulary-board-source';
    figure.dataset.lessonPhase = 'source-reference';
    const image = document.createElement('img');
    image.src = model.provenance.moodle.sourceImage.url;
    image.alt = text(model.provenance.moodle.sourceImage.alt[language === 'ja' ? 'ja' : 'en']);
    image.loading = 'eager';
    const caption = document.createElement('figcaption');
    caption.append(...localizedNodes(model.payload.sourceCaption));
    figure.append(image, caption);
    return figure;
}

function renderItem(model: PictureVocabularyBoardModel, item: PictureVocabularyItem): HTMLElement {
    const label = document.createElement('label');
    label.className = 'academy-picture-vocabulary-board-item';
    const prompt = document.createElement('span');
    prompt.append(...localizedNodes(item.prompt));
    const select = document.createElement('select');
    select.name = `${model.id}:${item.id}`;
    select.required = true;
    select.setAttribute('aria-label', item.prompt.en);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '...';
    select.append(placeholder);
    item.options.forEach(option => {
        const choice = document.createElement('option');
        choice.value = option.id;
        choice.textContent = option.label;
        select.append(choice);
    });
    label.append(prompt, select);
    return label;
}

function renderAnswerKey(model: PictureVocabularyBoardModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-picture-vocabulary-board-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const title = document.createElement('h3');
    title.textContent = 'Source rows after your attempt';
    const list = document.createElement('ol');
    model.payload.items.forEach(item => {
        const answer = item.options.find(option => option.id === item.correctOptionId)!;
        const entry = document.createElement('li');
        entry.textContent = `${item.sourceOrder}. ${answer.label}`;
        list.append(entry);
    });
    section.append(title, list);
    return section;
}

function responseFromForm(model: PictureVocabularyBoardModel, form: HTMLFormElement): PictureVocabularyBoardResponse | null {
    const answers = model.payload.items.map(item => {
        const value = new FormData(form).get(`${model.id}:${item.id}`);
        return typeof value === 'string' && value ? { itemId: item.id, optionId: value } : null;
    });
    return answers.every((answer): answer is PictureVocabularyBoardResponse['answers'][number] => answer !== null)
        ? { answers }
        : null;
}

function parseResponse(model: PictureVocabularyBoardModel, response: PictureVocabularyBoardResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.items.length) {
        throw new TypeError('Every exact source picture needs one vocabulary choice.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        const item = model.payload.items.find(candidate => candidate.id === answer.itemId);
        if (!item || answers.has(answer.itemId) || !item.options.some(option => option.id === answer.optionId)) {
            throw new TypeError('Picture vocabulary answers must use each source picture once.');
        }
        answers.set(answer.itemId, answer.optionId);
    });
    return answers;
}
