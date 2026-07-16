import type {
    ActivityController,
    ActivityEvaluation,
    ActivityHost,
    ActivityModel,
    ActivityPlugin,
    ValidationIssue,
} from '../../domain/activity-runtime';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import {
    assessedJapanese,
    gradeFromScore,
    localizedNodes,
    normalizeJapanese,
    reviewSeeds,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    validateReviewTargets,
    type ActivityFeedbackSet,
    type ReviewableTarget,
} from './shared';

export interface TypedResponseModel extends ActivityModel {
    readonly kind: 'academy-typed-response';
    readonly responseKind: 'kana-input' | 'written-description';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly payload: {
        readonly inputLabel: LocalizedText;
        readonly multiline?: boolean;
        readonly acceptedAnswers?: readonly string[];
        readonly requiredGroups?: readonly (readonly string[])[];
        readonly errorTag: string;
        readonly feedback: ActivityFeedbackSet;
        readonly reviewTargets: readonly ReviewableTarget[];
    };
}

export const typedResponsePlugin: ActivityPlugin<TypedResponseModel, string> = {
    kind: 'academy-typed-response',
    validate: validate,
    render: render,
    grade(model, response) {
        if (typeof response !== 'string' || !normalizeJapanese(response)) throw new TypeError('A Japanese response is required.');
        const normalized = normalizeJapanese(response);
        const exact = model.payload.acceptedAnswers?.some(answer => normalizeJapanese(answer) === normalized) ?? false;
        const groups = model.payload.requiredGroups ?? [];
        const containsGroups = groups.length > 0 && groups.every(group => group.some(term => normalized.includes(normalizeJapanese(term))));
        return gradeFromScore(exact || containsGroups ? 1 : 0, 1, [model.payload.errorTag], model.payload.feedback);
    },
    toReviewSeeds(model, result) {
        return reviewSeeds(model.payload.reviewTargets, result, model.sourceQuestionId);
    },
};

function validate(model: TypedResponseModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model.answerSupport) issues.push({ path: 'answerSupport', message: 'Assessed typing requires the answer-support contract.' });
    if (!text(model.payload?.inputLabel?.en) || !text(model.payload?.inputLabel?.ja)) {
        issues.push({ path: 'payload.inputLabel', message: 'A bilingual input label is required.' });
    }
    const accepted = model.payload?.acceptedAnswers ?? [];
    const groups = model.payload?.requiredGroups ?? [];
    if (!accepted.length && !groups.length) issues.push({ path: 'payload', message: 'Exact answers or required term groups are required.' });
    if (accepted.some(answer => !normalizeJapanese(answer))) issues.push({ path: 'payload.acceptedAnswers', message: 'Accepted answers cannot be blank.' });
    if (groups.some(group => !group.length || group.some(term => !normalizeJapanese(term)))) {
        issues.push({ path: 'payload.requiredGroups', message: 'Required groups need non-empty alternatives.' });
    }
    if (!text(model.payload?.errorTag)) issues.push({ path: 'payload.errorTag', message: 'A deterministic error tag is required.' });
    validateFeedback(model.payload?.feedback, issues);
    validateReviewTargets(model.payload?.reviewTargets, model.conceptIds, issues);
    return issues;
}

function render(
    model: TypedResponseModel,
    host: ActivityHost,
    submit: (response: string) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-typed-response';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const form = document.createElement('form');
    form.setAttribute('aria-labelledby', heading.id);
    const label = document.createElement('label');
    label.append(...localizedNodes(model.payload.inputLabel));
    const input = model.payload.multiline ? document.createElement('textarea') : document.createElement('input');
    input.className = 'academy-input academy-typed-response-input';
    input.lang = 'ja';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.jpdbReaderSurfaceIgnore = '';
    if (input instanceof HTMLInputElement) {
        input.type = 'text';
        input.inputMode = 'text';
        input.enterKeyHint = 'send';
    } else input.rows = 4;
    const commit = document.createElement('button');
    commit.type = 'submit';
    commit.className = 'academy-button academy-button-primary';
    commit.textContent = host.language === 'ja' ? '答えを確認' : 'Check answer';
    const status = statusRegion('academy-kit-feedback');
    input.setAttribute('aria-describedby', `${model.id}-status`);
    status.id = `${model.id}-status`;
    label.append(input);
    form.append(label, commit);
    root.append(heading, form, status);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!normalizeJapanese(input.value)) {
            status.replaceChildren(assessedJapanese(host.language === 'ja' ? '日本語を入力してください。' : 'Enter a Japanese answer.'));
            input.focus();
            return;
        }
        setPending(form, true);
        void submit(input.value).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                setPending(form, false);
                input.focus();
                input.select();
            }
        }).catch(error => {
            setPending(form, false);
            status.textContent = error instanceof Error ? error.message : String(error);
            input.focus();
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { input.focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}
