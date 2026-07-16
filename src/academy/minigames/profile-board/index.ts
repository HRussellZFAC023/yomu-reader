import './style.css';

import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type GradeResult,
    type ReviewSeed,
    type ValidationIssue,
} from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import {
    assessedJapanese,
    gradeFromScore,
    localizedNodes,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export interface ProfileBoardOption {
    readonly id: string;
    readonly label: string;
}

export interface ProfileBoardCriterion {
    readonly conceptId: string;
    readonly sourceQuestionId: string;
    readonly correctOptionId: string;
    readonly errorTag: string;
}

export interface ProfileBoardRound {
    readonly id: string;
    readonly name: string;
    readonly country: string;
    readonly occupationClue: LocalizedText;
    readonly nationality: ProfileBoardCriterion;
    readonly occupation: ProfileBoardCriterion;
}

export interface ProfileBoardResponse {
    readonly answers: readonly Readonly<{
        roundId: string;
        nationalityId: string;
        occupationId: string;
    }>[];
}

export interface ProfileBoardModel extends ActivityModel {
    readonly kind: 'academy-profile-board';
    readonly responseKind: 'profile-board-radio-grid';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly sourceId: string;
        readonly payloadSha256: string;
        readonly sourceTitle: string;
        readonly author: string;
        readonly moodleModuleId: number;
        readonly locus: { readonly page: 2; readonly tasks: readonly ['A', 'B'] };
        readonly answerVisibility: 'after-attempt';
        readonly exactFields: readonly ['name', 'country', 'occupation'];
        readonly yomuFraming: string;
        readonly sourceReference: {
            readonly imageUrl: string;
            readonly imageSha256: string;
            readonly alt: LocalizedText;
            readonly caption: LocalizedText;
        };
        readonly support: {
            readonly phase: 'after-moodle-source';
            readonly minna: {
                readonly sourceId: 'source-minna-no-nihongo';
                readonly reference: 'Minna no Nihongo I · Lesson 1';
                readonly reuse: 'sequence-only';
            };
            readonly genki: {
                readonly sourceId: string;
                readonly title: string;
                readonly relation: 'post-instruction-guided-fill';
                readonly prerequisitePolicy: string;
            };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{
            title: LocalizedText;
            pattern: string;
            explanation: LocalizedText;
        }>[];
        readonly nationalityOptions: readonly ProfileBoardOption[];
        readonly occupationOptions: readonly ProfileBoardOption[];
        readonly rounds: readonly ProfileBoardRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

export const profileBoardPlugin: ActivityPlugin<ProfileBoardModel, ProfileBoardResponse> = {
    kind: 'academy-profile-board',
    validate,
    render,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const errorTags: string[] = [];
        let correct = 0;
        for (const round of model.payload.rounds) {
            const answer = answers.get(round.id)!;
            if (answer.nationalityId === round.nationality.correctOptionId) correct += 1;
            else errorTags.push(round.nationality.errorTag);
            if (answer.occupationId === round.occupation.correctOptionId) correct += 1;
            else errorTags.push(round.occupation.errorTag);
        }
        return gradeFromScore(
            correct / (model.payload.rounds.length * 2),
            model.payload.passScore,
            errorTags.sort(),
            model.payload.feedback,
        );
    },
    toReviewSeeds(model, result) {
        return model.payload.rounds.flatMap(round => [
            reviewSeed(model, round, 'nationality', result),
            reviewSeed(model, round, 'occupation', result),
        ].filter((seed): seed is ReviewSeed => seed !== null));
    },
};

function validate(model: ProfileBoardModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The profile board requires assessed answer support.' });
    }
    validateProvenance(model.provenance, issues);
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length < 2) {
        issues.push({ path: 'payload.teaching', message: 'Teach both sentence and nationality formation before assessment.' });
    } else model.payload.teaching.forEach((step, index) => {
        if (!text(step.title?.en) || !text(step.title?.ja) || !text(step.pattern)
            || !text(step.explanation?.en) || !text(step.explanation?.ja)) {
            issues.push({ path: `payload.teaching.${index}`, message: 'Teaching steps require bilingual copy and a Japanese pattern.' });
        }
    });
    const nationalityIds = validateOptions(model.payload?.nationalityOptions, 'payload.nationalityOptions', issues);
    const occupationIds = validateOptions(model.payload?.occupationOptions, 'payload.occupationOptions', issues);
    validateRounds(model, nationalityIds, occupationIds, issues);
    if (model.payload?.passScore !== 1) {
        issues.push({ path: 'payload.passScore', message: 'Every source profile criterion is required.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function validateProvenance(value: ProfileBoardModel['provenance'] | undefined, issues: ValidationIssue[]): void {
    if (!text(value?.sourceId) || !/^[a-f0-9]{64}$/u.test(value?.payloadSha256 ?? '')
        || !text(value?.sourceTitle) || !text(value?.author)) {
        issues.push({ path: 'provenance', message: 'Exact Moodle source identity is required.' });
    }
    if (value?.moodleModuleId !== 5792908 || value?.locus?.page !== 2
        || value?.locus?.tasks?.join(',') !== 'A,B') {
        issues.push({ path: 'provenance.locus', message: 'The profile board must retain Moodle module 5792908, page 2, tasks A and B.' });
    }
    if (value?.answerVisibility !== 'after-attempt'
        || value?.exactFields?.join(',') !== 'name,country,occupation'
        || !text(value?.yomuFraming)) {
        issues.push({ path: 'provenance.answerPolicy', message: 'Source fields and Yomu framing must remain distinguishable.' });
    }
    if (!/^\/academy\/content\/lessons\/l1-l02\/moodle-chapter-1-2-grammar-nationality-occupation-page-2\.png$/u.test(value?.sourceReference?.imageUrl ?? '')
        || !/^[a-f0-9]{64}$/u.test(value?.sourceReference?.imageSha256 ?? '')
        || !text(value?.sourceReference?.alt?.en) || !text(value?.sourceReference?.alt?.ja)
        || !text(value?.sourceReference?.caption?.en) || !text(value?.sourceReference?.caption?.ja)) {
        issues.push({ path: 'provenance.sourceReference', message: 'The exact Moodle worksheet image and bilingual reference label are required.' });
    }
    if (value?.support?.phase !== 'after-moodle-source'
        || value.support.minna?.sourceId !== 'source-minna-no-nihongo'
        || value.support.minna.reference !== 'Minna no Nihongo I · Lesson 1'
        || value.support.minna.reuse !== 'sequence-only'
        || !text(value.support.genki?.sourceId) || !text(value.support.genki.title)
        || value.support.genki.relation !== 'post-instruction-guided-fill'
        || !text(value.support.genki.prerequisitePolicy)) {
        issues.push({ path: 'provenance.support', message: 'Minna and Genki support must remain secondary to the Moodle worksheet.' });
    }
}

function validateOptions(
    options: readonly ProfileBoardOption[] | undefined,
    path: string,
    issues: ValidationIssue[],
): ReadonlySet<string> {
    if (!Array.isArray(options) || options.length < 3) {
        issues.push({ path, message: 'At least three authored options are required.' });
        return new Set();
    }
    const ids = new Set(options.map(option => option.id));
    if (ids.size !== options.length || options.some(option => !text(option.id) || !text(option.label))) {
        issues.push({ path, message: 'Options need unique ids and Japanese labels.' });
    }
    return ids;
}

function validateRounds(
    model: ProfileBoardModel,
    nationalityIds: ReadonlySet<string>,
    occupationIds: ReadonlySet<string>,
    issues: ValidationIssue[],
): void {
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 4) {
        issues.push({ path: 'payload.rounds', message: 'The exact four Moodle profiles are required.' });
        return;
    }
    const roundIds = new Set<string>();
    const sourceIds = new Set<string>();
    const errorTags = new Set<string>();
    rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        if (!text(round.id) || roundIds.has(round.id) || !text(round.name) || !text(round.country)
            || !text(round.occupationClue?.en) || !text(round.occupationClue?.ja)) {
            issues.push({ path, message: 'Each exact profile needs a unique id, name, country, and accessible clue.' });
        }
        roundIds.add(round.id);
        validateCriterion(round.nationality, nationalityIds, model.conceptIds, sourceIds, errorTags, `${path}.nationality`, issues);
        validateCriterion(round.occupation, occupationIds, model.conceptIds, sourceIds, errorTags, `${path}.occupation`, issues);
    });
}

function validateCriterion(
    criterion: ProfileBoardCriterion,
    optionIds: ReadonlySet<string>,
    conceptIds: readonly string[],
    sourceIds: Set<string>,
    errorTags: Set<string>,
    path: string,
    issues: ValidationIssue[],
): void {
    if (!conceptIds.includes(criterion?.conceptId) || !optionIds.has(criterion?.correctOptionId)) {
        issues.push({ path, message: 'Each criterion needs an authored concept and correct option.' });
    }
    if (!text(criterion?.sourceQuestionId) || sourceIds.has(criterion.sourceQuestionId)) {
        issues.push({ path: `${path}.sourceQuestionId`, message: 'Exact source question ids must be unique.' });
    }
    sourceIds.add(criterion.sourceQuestionId);
    if (!text(criterion?.errorTag) || errorTags.has(criterion.errorTag)) {
        issues.push({ path: `${path}.errorTag`, message: 'Criterion error tags must be unique.' });
    }
    errorTags.add(criterion.errorTag);
}

function render(
    model: ProfileBoardModel,
    host: ActivityHost,
    submit: (response: ProfileBoardResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-profile-board';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const sourceReference = renderSourceReference(model, host.language);
    const form = document.createElement('form');
    form.className = 'academy-profile-board-form';
    form.setAttribute('aria-labelledby', heading.id);
    model.payload.rounds.forEach((round, index) => form.append(renderProfile(model, round, index)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-profile-board-check';
    check.textContent = host.language === 'ja' ? 'プロフィールを確認する' : 'Check the profiles';
    const status = statusRegion('academy-kit-feedback academy-profile-board-feedback');
    form.append(check);
    root.append(heading, teaching, sourceReference, form, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja' ? 'すべてのプロフィールを完成させてください。' : 'Complete both fields for every profile.';
            status.textContent = message;
            host.announce(message);
            return;
        }
        setPending(root, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(root, false);
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { form.querySelector<HTMLInputElement>('input')?.focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}

function renderSourceReference(model: ProfileBoardModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const figure = document.createElement('figure');
    figure.className = 'academy-profile-board-source-reference';
    figure.dataset.lessonPhase = 'source-reference';
    const image = document.createElement('img');
    image.src = model.provenance.sourceReference.imageUrl;
    image.alt = text(model.provenance.sourceReference.alt[language === 'ja' ? 'ja' : 'en']);
    image.loading = 'eager';
    image.decoding = 'async';
    const caption = document.createElement('figcaption');
    caption.append(...localizedNodes(model.provenance.sourceReference.caption));
    figure.append(image, caption);
    return figure;
}

function renderTeaching(model: ProfileBoardModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-profile-board-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const block = document.createElement('div');
        block.className = 'academy-profile-board-teaching-step';
        const title = document.createElement('h3');
        title.append(...localizedNodes(step.title));
        const pattern = document.createElement('p');
        pattern.className = 'academy-profile-board-pattern academy-japanese';
        pattern.lang = 'ja';
        pattern.textContent = step.pattern;
        const explanation = document.createElement('p');
        explanation.append(...localizedNodes(step.explanation));
        block.append(title, pattern, explanation);
        section.append(block);
    });
    return section;
}

function renderProfile(model: ProfileBoardModel, round: ProfileBoardRound, index: number): HTMLElement {
    const article = document.createElement('article');
    article.className = 'academy-profile-board-profile';
    article.dataset.profileId = round.id;
    const title = document.createElement('h3');
    title.id = `${model.id}-${round.id}-title`;
    title.append(assessedJapanese(`${index + 1}. ${round.name}`));
    const clues = document.createElement('p');
    clues.id = `${model.id}-${round.id}-clues`;
    clues.className = 'academy-profile-board-clues';
    clues.append(assessedJapanese(round.country), ...localizedNodes(round.occupationClue));
    article.append(title, clues);
    article.append(
        radioGroup(`${model.id}-${round.id}-nationality`, { ja: '国せき', en: 'Nationality' }, model.payload.nationalityOptions, title.id, clues.id),
        radioGroup(`${model.id}-${round.id}-occupation`, { ja: 'しごと', en: 'Occupation' }, model.payload.occupationOptions, title.id, clues.id),
    );
    return article;
}

function radioGroup(
    name: string,
    legendText: LocalizedText,
    options: readonly ProfileBoardOption[],
    titleId: string,
    clueId: string,
): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'academy-profile-board-group';
    fieldset.setAttribute('aria-describedby', `${titleId} ${clueId}`);
    const legend = document.createElement('legend');
    legend.append(...localizedNodes(legendText));
    const choices = document.createElement('div');
    choices.className = 'academy-profile-board-choices';
    options.forEach(option => {
        const label = document.createElement('label');
        label.className = 'academy-profile-board-choice';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.value = option.id;
        input.required = true;
        label.append(input, assessedJapanese(option.label));
        choices.append(label);
    });
    fieldset.append(legend, choices);
    return fieldset;
}

function responseFromForm(model: ProfileBoardModel, form: HTMLFormElement): ProfileBoardResponse | null {
    const answers: ProfileBoardResponse['answers'][number][] = [];
    for (const round of model.payload.rounds) {
        const nationalityId = selected(form, `${model.id}-${round.id}-nationality`);
        const occupationId = selected(form, `${model.id}-${round.id}-occupation`);
        if (!nationalityId || !occupationId) return null;
        answers.push({ roundId: round.id, nationalityId, occupationId });
    }
    return { answers };
}

function selected(form: HTMLFormElement, name: string): string | undefined {
    const value = new FormData(form).get(name);
    return typeof value === 'string' && value ? value : undefined;
}

function parseResponse(
    model: ProfileBoardModel,
    response: ProfileBoardResponse,
): ReadonlyMap<string, ProfileBoardResponse['answers'][number]> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every source profile needs one complete answer.');
    }
    const answers = new Map<string, ProfileBoardResponse['answers'][number]>();
    const nationalityIds = new Set(model.payload.nationalityOptions.map(option => option.id));
    const occupationIds = new Set(model.payload.occupationOptions.map(option => option.id));
    response.answers.forEach(answer => {
        if (!model.payload.rounds.some(round => round.id === answer.roundId) || answers.has(answer.roundId)
            || !nationalityIds.has(answer.nationalityId) || !occupationIds.has(answer.occupationId)) {
            throw new TypeError('Profile answers must use each authored profile and choice exactly once.');
        }
        answers.set(answer.roundId, answer);
    });
    return answers;
}

function reviewSeed(
    model: ProfileBoardModel,
    round: ProfileBoardRound,
    kind: 'nationality' | 'occupation',
    result: GradeResult,
): ReviewSeed | null {
    const criterion = round[kind];
    if (result.outcome === 'lapse' && !result.errorTags.includes(criterion.errorTag)) return null;
    const options = kind === 'nationality' ? model.payload.nationalityOptions : model.payload.occupationOptions;
    const answer = options.find(option => option.id === criterion.correctOptionId)!;
    return {
        id: `review:l1-l02:profile-board:${round.id}:${kind}`,
        conceptId: criterion.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: criterion.sourceQuestionId,
        content: {
            expression: `${round.name}は ${answer.label}です。`,
            meanings: [kind === 'nationality' ? `${round.name}'s nationality` : round.occupationClue.en],
        },
    };
}
