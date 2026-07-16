import type {
    ActivityController,
    ActivityEvaluation,
    ActivityHost,
    ActivityModel,
    ActivityPlugin,
    ValidationIssue,
} from '../../domain/activity-runtime';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import { setAcademyTooltip } from '../../ui/tooltip';
import {
    assessedJapanese,
    gradeFromScore,
    localizedNodes,
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

export interface SequenceItem {
    readonly id: string;
    readonly label: string;
}

export interface SequenceModel extends ActivityModel {
    readonly kind: 'academy-sequence';
    readonly responseKind: 'ordered-items';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly payload: {
        readonly items: readonly SequenceItem[];
        readonly correctOrder: readonly string[];
        readonly errorTag: string;
        readonly feedback: ActivityFeedbackSet;
        readonly reviewTargets: readonly ReviewableTarget[];
    };
}

export interface SequenceResponse {
    readonly order: readonly string[];
}

export const sequencePlugin: ActivityPlugin<SequenceModel, SequenceResponse> = {
    kind: 'academy-sequence',
    validate,
    render,
    grade(model, response) {
        const order = parseResponse(model, response);
        const correct = order.filter((id, index) => model.payload.correctOrder[index] === id).length;
        return gradeFromScore(
            correct / order.length,
            1,
            [model.payload.errorTag],
            model.payload.feedback,
        );
    },
    toReviewSeeds(model, result) {
        return reviewSeeds(model.payload.reviewTargets, result, model.sourceQuestionId);
    },
};

function validate(model: SequenceModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model.answerSupport) issues.push({ path: 'answerSupport', message: 'Assessed ordering requires the answer-support contract.' });
    const items = model.payload?.items;
    if (!Array.isArray(items) || items.length < 2) {
        issues.push({ path: 'payload.items', message: 'At least two sequence items are required.' });
        return issues;
    }
    const ids = items.map(item => item.id);
    if (new Set(ids).size !== ids.length || items.some(item => !text(item.id) || !text(item.label))) {
        issues.push({ path: 'payload.items', message: 'Sequence items need unique ids and Japanese labels.' });
    }
    if (model.payload.correctOrder?.length !== items.length
        || new Set(model.payload.correctOrder).size !== items.length
        || model.payload.correctOrder.some(id => !ids.includes(id))) {
        issues.push({ path: 'payload.correctOrder', message: 'The answer must order every item exactly once.' });
    }
    if (!text(model.payload.errorTag)) issues.push({ path: 'payload.errorTag', message: 'A deterministic error tag is required.' });
    validateFeedback(model.payload.feedback, issues);
    validateReviewTargets(model.payload.reviewTargets, model.conceptIds, issues);
    return issues;
}

function render(
    model: SequenceModel,
    host: ActivityHost,
    submit: (response: SequenceResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-sequence';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const list = document.createElement('ol');
    list.className = 'academy-sequence-list';
    list.setAttribute('aria-labelledby', heading.id);
    const check = document.createElement('button');
    check.type = 'button';
    check.className = 'academy-button academy-button-primary';
    check.textContent = host.language === 'ja' ? '順番を確認' : 'Check order';
    const status = statusRegion('academy-kit-feedback');
    status.id = `${model.id}-status`;
    list.setAttribute('aria-describedby', status.id);
    root.append(heading, list, check, status);
    host.replace(root);

    const order = [...model.payload.items.map(item => item.id)];
    let draggedId: string | null = null;
    const renderList = (focusId?: string): void => {
        list.replaceChildren(...order.map((id, index) => {
            const item = model.payload.items.find(candidate => candidate.id === id)!;
            const row = document.createElement('li');
            row.className = 'academy-sequence-item';
            row.draggable = true;
            row.dataset.sequenceId = id;
            const label = assessedJapanese(item.label);
            const controls = document.createElement('div');
            controls.className = 'academy-sequence-controls';
            const up = moveButton('↑', host.language === 'ja' ? `${item.label}を前へ` : `Move ${item.label} earlier`, index === 0);
            const down = moveButton('↓', host.language === 'ja' ? `${item.label}を後へ` : `Move ${item.label} later`, index === order.length - 1);
            up.addEventListener('click', () => moveItem(index, index - 1, id), { signal: lifecycle.signal });
            down.addEventListener('click', () => moveItem(index, index + 1, id), { signal: lifecycle.signal });
            controls.append(up, down);
            row.addEventListener('dragstart', event => {
                draggedId = id;
                event.dataTransfer?.setData('text/plain', id);
            }, { signal: lifecycle.signal });
            row.addEventListener('dragover', event => event.preventDefault(), { signal: lifecycle.signal });
            row.addEventListener('drop', event => {
                event.preventDefault();
                const sourceId = event.dataTransfer?.getData('text/plain') || draggedId;
                const from = sourceId ? order.indexOf(sourceId) : -1;
                if (from >= 0) moveItem(from, index, sourceId!);
                draggedId = null;
            }, { signal: lifecycle.signal });
            row.append(label, controls);
            return row;
        }));
        if (focusId) queueMicrotask(() => list.querySelector<HTMLButtonElement>(`[data-sequence-id="${focusId}"] button:not(:disabled)`)?.focus());
    };
    const moveItem = (from: number, to: number, id: string): void => {
        if (to < 0 || to >= order.length || from === to) return;
        order.splice(from, 1);
        order.splice(to, 0, id);
        renderList(id);
        host.announce(host.language === 'ja' ? `${to + 1}番に移動しました。` : `Moved to position ${to + 1}.`);
    };

    check.addEventListener('click', () => {
        setPending(root, true);
        void submit({ order }).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                setPending(root, false);
                // Keep the attempted order in place and return to the recovery action.
                check.focus();
            }
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });
    renderList();
    return {
        focus() { list.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}

function parseResponse(model: SequenceModel, response: SequenceResponse): readonly string[] {
    if (!response || !Array.isArray(response.order)
        || response.order.length !== model.payload.items.length
        || new Set(response.order).size !== response.order.length
        || response.order.some(id => !model.payload.items.some(item => item.id === id))) {
        throw new TypeError('A sequence response must order every authored item once.');
    }
    return response.order;
}

function moveButton(symbol: string, label: string, disabled: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-sequence-move';
    button.textContent = symbol;
    setAcademyTooltip(button, label);
    button.disabled = disabled;
    return button;
}
