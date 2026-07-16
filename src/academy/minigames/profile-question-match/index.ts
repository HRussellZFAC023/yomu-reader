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
    gradeFromScore,
    localizedNodes,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../activity-kit/shared';

export interface ProfileQuestionTeachingStep {
    readonly sourceOrder: number;
    readonly title: LocalizedText;
    readonly pattern: string;
    readonly example: string;
    readonly explanation: LocalizedText;
}

export interface ProfileQuestionFact {
    readonly id: string;
    readonly label: LocalizedText;
    readonly value: string;
}

export interface ProfileQuestionAnswer {
    readonly id: string;
    readonly label: string;
    readonly meaning: string;
}

export interface ProfileQuestionRound {
    readonly id: string;
    readonly sourceOrder: number;
    readonly sourceQuestionId: string;
    readonly question: string;
    readonly clue: string;
    readonly correctAnswerId: string;
    readonly conceptId: string;
    readonly errorTag: string;
}

export interface ProfileQuestionMatchResponse {
    readonly pairs: readonly Readonly<{ questionId: string; answerId: string }>[];
}

export interface ProfileQuestionMatchModel extends ActivityModel {
    readonly kind: 'academy-profile-question-match';
    readonly responseKind: 'profile-question-one-to-one-match';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l1-l03';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 5804931;
            readonly sourceId: string;
            readonly payloadSha256: string;
            readonly sourceTitle: string;
            readonly locus: { readonly page: 1; readonly sections: readonly ['の', 'も', 'だれ', 'どなた'] };
        };
        readonly minna: {
            readonly reference: 'Minna no Nihongo I, Lesson 1';
            readonly relation: 'course-sequence-and-byte-identified-audio-only';
            readonly audioMember: {
                readonly title: 'minna shokyu 1 001';
                readonly sourceId: string;
                readonly payloadSha256: string;
                readonly archiveOrder: 4;
                readonly durationSeconds: 23.980417;
            };
            readonly transcriptStatus: 'not-provided-do-not-invent';
        };
        readonly genki: {
            readonly sourceId: string;
            readonly relativePath: 'lessons/lesson-1/workbook-7/index.html';
            readonly payloadSha256: string;
            readonly scriptSha256: string;
            readonly lineLocus: { readonly start: 76; readonly end: 119 };
            readonly engine: 'Genki.generateQuiz';
            readonly responseAdaptation: 'exact-prompts-answers-and-order-with-yomu-one-to-one-matching';
        };
    };
    readonly payload: {
        readonly teaching: readonly ProfileQuestionTeachingStep[];
        readonly profileFacts: readonly ProfileQuestionFact[];
        readonly answers: readonly ProfileQuestionAnswer[];
        readonly rounds: readonly ProfileQuestionRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

export const profileQuestionMatchPlugin: ActivityPlugin<ProfileQuestionMatchModel, ProfileQuestionMatchResponse> = {
    kind: 'academy-profile-question-match',
    validate,
    render,
    grade(model, response) {
        const pairs = parseResponse(model, response);
        const errorTags: string[] = [];
        let correct = 0;
        for (const round of model.payload.rounds) {
            if (pairs.get(round.id) === round.correctAnswerId) correct += 1;
            else errorTags.push(round.errorTag);
        }
        return gradeFromScore(
            correct / model.payload.rounds.length,
            model.payload.passScore,
            errorTags.sort(),
            model.payload.feedback,
        );
    },
    toReviewSeeds(model, result) {
        return model.payload.rounds.flatMap(round => {
            if (result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)) return [];
            const answer = model.payload.answers.find(candidate => candidate.id === round.correctAnswerId)!;
            return [reviewSeed(round, answer, result)];
        });
    },
};

function validate(model: ProfileQuestionMatchModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The source profile match requires assessed answer support.' });
    }
    validateProvenance(model.provenance, issues);
    validateTeaching(model.payload?.teaching, issues);
    const answerIds = validateAnswers(model.payload?.answers, issues);
    validateFacts(model.payload?.profileFacts, issues);
    validateRounds(model, answerIds, issues);
    if (model.payload?.passScore !== 1) {
        issues.push({ path: 'payload.passScore', message: 'Every exact Genki profile response is required.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function validateProvenance(
    value: ProfileQuestionMatchModel['provenance'] | undefined,
    issues: ValidationIssue[],
): void {
    const moodle = value?.moodle;
    const minna = value?.minna;
    const genki = value?.genki;
    if (value?.packageId !== 'l1-l03' || value?.answerVisibility !== 'after-attempt') {
        issues.push({ path: 'provenance', message: 'Lesson 3 and after-attempt answer gating are required.' });
    }
    if (moodle?.moduleId !== 5804931
        || moodle.payloadSha256 !== '4c9b251ade1fc39cd2d9e31a28575e18f894f3425f8b01584d03ee9c8038da2e'
        || moodle.locus?.page !== 1
        || moodle.locus.sections?.join(',') !== 'の,も,だれ,どなた'
        || !text(moodle.sourceId) || !text(moodle.sourceTitle)) {
        issues.push({ path: 'provenance.moodle', message: 'The exact Moodle Lesson 3 instruction handout is required.' });
    }
    if (minna?.reference !== 'Minna no Nihongo I, Lesson 1'
        || minna.relation !== 'course-sequence-and-byte-identified-audio-only'
        || minna.transcriptStatus !== 'not-provided-do-not-invent'
        || minna.audioMember?.title !== 'minna shokyu 1 001'
        || minna.audioMember.payloadSha256 !== '5534e1b822942b8b3806c6555fa2c2355457ed4db3c54442525b65c337644e7f'
        || minna.audioMember.archiveOrder !== 4
        || minna.audioMember.durationSeconds !== 23.980417
        || !text(minna.audioMember.sourceId)) {
        issues.push({ path: 'provenance.minna', message: 'Minna must remain an exact byte-identified, transcript-free source anchor.' });
    }
    if (genki?.relativePath !== 'lessons/lesson-1/workbook-7/index.html'
        || genki.payloadSha256 !== '341b1eca3ef498d9c5890601ef4dd5965478675e97fa7dc3a9012bbdd7b292cd'
        || genki.scriptSha256 !== '474d1b1ae113e6136e9e6b1110804aea1d8637abd91f77992e910d93a96e3949'
        || genki.lineLocus?.start !== 76 || genki.lineLocus.end !== 119
        || genki.engine !== 'Genki.generateQuiz'
        || genki.responseAdaptation !== 'exact-prompts-answers-and-order-with-yomu-one-to-one-matching'
        || !text(genki.sourceId)) {
        issues.push({ path: 'provenance.genki', message: 'The mapped Genki workbook task and adaptation policy are required.' });
    }
}

function validateTeaching(
    steps: readonly ProfileQuestionTeachingStep[] | undefined,
    issues: ValidationIssue[],
): void {
    if (!Array.isArray(steps) || steps.length !== 4 || steps.some((step, index) =>
        step.sourceOrder !== index + 1 || !text(step.title?.en) || !text(step.title?.ja)
        || !text(step.pattern) || !text(step.example)
        || !text(step.explanation?.en) || !text(step.explanation?.ja))) {
        issues.push({ path: 'payload.teaching', message: 'The four exact Moodle teaching moves must remain complete and in source order.' });
    }
}

function validateFacts(
    facts: readonly ProfileQuestionFact[] | undefined,
    issues: ValidationIssue[],
): void {
    if (!Array.isArray(facts) || facts.length !== 6
        || new Set(facts.map(fact => fact.id)).size !== 6
        || facts.some(fact => !text(fact.id) || !text(fact.label?.en) || !text(fact.label?.ja) || !text(fact.value))) {
        issues.push({ path: 'payload.profileFacts', message: 'Mary’s six source-provided profile clues are required.' });
    }
}

function validateAnswers(
    answers: readonly ProfileQuestionAnswer[] | undefined,
    issues: ValidationIssue[],
): ReadonlySet<string> {
    if (!Array.isArray(answers) || answers.length !== 6
        || new Set(answers.map(answer => answer.id)).size !== 6
        || answers.some(answer => !text(answer.id) || !text(answer.label) || !text(answer.meaning))) {
        issues.push({ path: 'payload.answers', message: 'Six unique exact Genki answer cards are required.' });
        return new Set();
    }
    return new Set(answers.map(answer => answer.id));
}

function validateRounds(
    model: ProfileQuestionMatchModel,
    answerIds: ReadonlySet<string>,
    issues: ValidationIssue[],
): void {
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 6) {
        issues.push({ path: 'payload.rounds', message: 'The exact six Genki questions are required.' });
        return;
    }
    const roundIds = new Set<string>();
    const sourceIds = new Set<string>();
    const correctIds = new Set<string>();
    const errorTags = new Set<string>();
    rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        if (round.sourceOrder !== index + 1 || !text(round.id) || roundIds.has(round.id)
            || !text(round.question) || !text(round.clue)) {
            issues.push({ path, message: 'Genki questions need unique ids and exact source order.' });
        }
        roundIds.add(round.id);
        if (!text(round.sourceQuestionId) || sourceIds.has(round.sourceQuestionId)) {
            issues.push({ path: `${path}.sourceQuestionId`, message: 'Source question ids must be unique.' });
        }
        sourceIds.add(round.sourceQuestionId);
        if (!answerIds.has(round.correctAnswerId) || correctIds.has(round.correctAnswerId)) {
            issues.push({ path: `${path}.correctAnswerId`, message: 'Each exact answer must be matched once.' });
        }
        correctIds.add(round.correctAnswerId);
        if (!model.conceptIds.includes(round.conceptId) || !text(round.errorTag) || errorTags.has(round.errorTag)) {
            issues.push({ path: `${path}.evidence`, message: 'Each question needs a unique concept and error tag.' });
        }
        errorTags.add(round.errorTag);
    });
}

function render(
    model: ProfileQuestionMatchModel,
    host: ActivityHost,
    submit: (response: ProfileQuestionMatchResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-profile-question-match';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const facts = renderFacts(model);
    const form = document.createElement('form');
    form.className = 'academy-profile-question-match-form';
    form.setAttribute('aria-labelledby', heading.id);
    model.payload.rounds.forEach(round => form.append(renderRound(model, round)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary academy-profile-question-match-check';
    check.textContent = host.language === 'ja' ? 'カードを確認する' : 'Check the matches';
    const status = statusRegion('academy-kit-feedback academy-profile-question-match-feedback');
    form.append(check);
    root.append(heading, teaching, facts, form, status);
    host.replace(root);

    form.addEventListener('change', () => updateAvailableAnswers(form), { signal: lifecycle.signal });
    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            const message = host.language === 'ja'
                ? '六つの質問に、それぞれ違う答えカードを選んでください。'
                : 'Match a different answer card to each of the six questions.';
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
        focus() { form.querySelector<HTMLSelectElement>('select')?.focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}

function renderTeaching(model: ProfileQuestionMatchModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-profile-question-match-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const article = document.createElement('article');
        article.className = 'academy-profile-question-match-teaching-step';
        article.dataset.sourceOrder = String(step.sourceOrder);
        const title = document.createElement('h3');
        title.append(...localizedNodes(step.title));
        const pattern = document.createElement('p');
        pattern.className = 'academy-profile-question-match-pattern academy-japanese';
        pattern.lang = 'ja';
        pattern.textContent = step.pattern;
        const example = document.createElement('p');
        example.className = 'academy-profile-question-match-example academy-japanese';
        example.lang = 'ja';
        example.textContent = step.example;
        const explanation = document.createElement('p');
        explanation.append(...localizedNodes(step.explanation));
        article.append(title, pattern, example, explanation);
        section.append(article);
    });
    return section;
}

function renderFacts(model: ProfileQuestionMatchModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-profile-question-match-facts';
    section.dataset.lessonPhase = 'reference';
    const heading = document.createElement('h3');
    heading.append(...localizedNodes({ ja: 'メアリーの プロフィール', en: 'Mary’s profile' }));
    const list = document.createElement('dl');
    model.payload.profileFacts.forEach(fact => {
        const term = document.createElement('dt');
        term.append(...localizedNodes(fact.label));
        const detail = document.createElement('dd');
        detail.textContent = fact.value;
        list.append(term, detail);
    });
    section.append(heading, list);
    return section;
}

function renderRound(model: ProfileQuestionMatchModel, round: ProfileQuestionRound): HTMLElement {
    const article = document.createElement('article');
    article.className = 'academy-profile-question-match-round';
    article.dataset.sourceOrder = String(round.sourceOrder);
    const label = document.createElement('label');
    label.htmlFor = `${model.id}-${round.id}`;
    const question = document.createElement('span');
    question.className = 'academy-profile-question-match-question academy-japanese';
    question.lang = 'ja';
    question.textContent = `${round.sourceOrder}. ${round.question}`;
    const clue = document.createElement('span');
    clue.className = 'academy-profile-question-match-clue';
    clue.textContent = round.clue;
    label.append(question, clue);
    const select = document.createElement('select');
    select.id = `${model.id}-${round.id}`;
    select.name = round.id;
    select.required = true;
    select.setAttribute('aria-label', `${round.sourceOrder}. ${round.question}`);
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '—';
    select.append(empty);
    model.payload.answers.forEach(answer => {
        const option = document.createElement('option');
        option.value = answer.id;
        option.textContent = answer.label;
        select.append(option);
    });
    article.append(label, select);
    return article;
}

function updateAvailableAnswers(form: HTMLFormElement): void {
    const selects = [...form.querySelectorAll<HTMLSelectElement>('select')];
    const selected = new Set(selects.map(select => select.value).filter(Boolean));
    selects.forEach(select => [...select.options].forEach(option => {
        option.disabled = Boolean(option.value && option.value !== select.value && selected.has(option.value));
    }));
}

function responseFromForm(
    model: ProfileQuestionMatchModel,
    form: HTMLFormElement,
): ProfileQuestionMatchResponse | null {
    const pairs = model.payload.rounds.map(round => ({
        questionId: round.id,
        answerId: String(new FormData(form).get(round.id) ?? ''),
    }));
    if (pairs.some(pair => !pair.answerId) || new Set(pairs.map(pair => pair.answerId)).size !== pairs.length) return null;
    return { pairs };
}

function parseResponse(
    model: ProfileQuestionMatchModel,
    response: ProfileQuestionMatchResponse,
): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.pairs) || response.pairs.length !== model.payload.rounds.length) {
        throw new TypeError('Every exact Genki question needs one answer card.');
    }
    const questionIds = new Set(model.payload.rounds.map(round => round.id));
    const answerIds = new Set(model.payload.answers.map(answer => answer.id));
    const pairs = new Map<string, string>();
    const usedAnswers = new Set<string>();
    response.pairs.forEach(pair => {
        if (!questionIds.has(pair.questionId) || pairs.has(pair.questionId)
            || !answerIds.has(pair.answerId) || usedAnswers.has(pair.answerId)) {
            throw new TypeError('Profile matching must use every authored question and answer card exactly once.');
        }
        pairs.set(pair.questionId, pair.answerId);
        usedAnswers.add(pair.answerId);
    });
    return pairs;
}

function reviewSeed(
    round: ProfileQuestionRound,
    answer: ProfileQuestionAnswer,
    result: GradeResult,
): ReviewSeed {
    return {
        id: `review:l1-l03:profile-question:${round.id}`,
        conceptId: round.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: round.sourceQuestionId,
        content: {
            expression: `${round.question} ${answer.label}`,
            meanings: [answer.meaning],
        },
    };
}
