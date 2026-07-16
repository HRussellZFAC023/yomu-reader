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
    localized,
    localizedNodes,
    reviewSeeds,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    validatePassScore,
    validateReviewTargets,
    type ActivityFeedbackSet,
    type ReviewableTarget,
} from './shared';

export interface DragSortItem {
    readonly id: string;
    readonly label: string;
    readonly correctZoneId: string | null;
}

export interface DragSortZone {
    readonly id: string;
    readonly label: LocalizedText;
    readonly appearance?: 'bag' | 'tray';
}

export interface DragSortResponse {
    readonly placements: readonly Readonly<{ itemId: string; zoneId: string | null }>[];
}

export interface DragSortModel extends ActivityModel {
    readonly kind: 'academy-drag-sort';
    readonly responseKind: 'drag-or-keyboard-sort';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly payload: {
        readonly sourceLabel: LocalizedText;
        readonly items: readonly DragSortItem[];
        readonly zones: readonly DragSortZone[];
        readonly passScore: number;
        readonly errorTag: string;
        readonly feedback: ActivityFeedbackSet;
        readonly reviewTargets: readonly ReviewableTarget[];
    };
}

export const dragSortPlugin: ActivityPlugin<DragSortModel, DragSortResponse> = {
    kind: 'academy-drag-sort',
    validate,
    render,
    grade(model, response) {
        const placements = parseResponse(model, response);
        const correct = model.payload.items.filter(item => placements.get(item.id) === item.correctZoneId).length;
        return gradeFromScore(
            correct / model.payload.items.length,
            model.payload.passScore,
            [model.payload.errorTag],
            model.payload.feedback,
        );
    },
    toReviewSeeds(model, result) {
        return reviewSeeds(model.payload.reviewTargets, result, model.sourceQuestionId);
    },
};

function validate(model: DragSortModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model.answerSupport) issues.push({ path: 'answerSupport', message: 'Assessed sorting requires the answer-support contract.' });
    if (!text(model.payload?.sourceLabel?.en) || !text(model.payload?.sourceLabel?.ja)) {
        issues.push({ path: 'payload.sourceLabel', message: 'A bilingual source label is required.' });
    }
    const items = model.payload?.items;
    const zones = model.payload?.zones;
    if (!Array.isArray(items) || items.length < 2) issues.push({ path: 'payload.items', message: 'At least two sortable items are required.' });
    if (!Array.isArray(zones) || zones.length === 0) issues.push({ path: 'payload.zones', message: 'At least one destination is required.' });
    if (!Array.isArray(items) || !Array.isArray(zones)) return issues;
    const itemIds = new Set(items.map(item => item.id));
    const zoneIds = new Set(zones.map(zone => zone.id));
    if (itemIds.size !== items.length || items.some(item => !text(item.id) || !text(item.label))) {
        issues.push({ path: 'payload.items', message: 'Items need unique ids and Japanese labels.' });
    }
    if (zoneIds.size !== zones.length || zones.some(zone => !text(zone.id) || !text(zone.label.en) || !text(zone.label.ja))) {
        issues.push({ path: 'payload.zones', message: 'Destinations need unique ids and bilingual labels.' });
    }
    if (items.some(item => item.correctZoneId !== null && !zoneIds.has(item.correctZoneId))) {
        issues.push({ path: 'payload.items.correctZoneId', message: 'Every target destination must exist.' });
    }
    if (!text(model.payload.errorTag)) issues.push({ path: 'payload.errorTag', message: 'A deterministic error tag is required.' });
    validatePassScore(model.payload.passScore, issues);
    validateFeedback(model.payload.feedback, issues);
    validateReviewTargets(model.payload.reviewTargets, model.conceptIds, issues);
    return issues;
}

function render(
    model: DragSortModel,
    host: ActivityHost,
    submit: (response: DragSortResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-kit academy-drag-sort';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const workspace = document.createElement('div');
    workspace.className = 'academy-drag-workspace';
    workspace.setAttribute('aria-labelledby', heading.id);
    const moveControls = document.createElement('div');
    moveControls.className = 'academy-drag-keyboard-controls';
    const destination = document.createElement('select');
    destination.setAttribute('aria-label', host.language === 'ja' ? '移動先' : 'Move selected item to');
    destination.append(option('', host.language === 'ja' ? '元の場所' : 'Source tray'));
    model.payload.zones.forEach(zone => destination.append(option(zone.id, localized(zone.label, host))));
    const move = document.createElement('button');
    move.type = 'button';
    move.className = 'academy-button academy-button-quiet';
    move.textContent = host.language === 'ja' ? '選んだものを移動' : 'Move selected item';
    move.disabled = true;
    moveControls.append(destination, move);
    const check = document.createElement('button');
    check.type = 'button';
    check.className = 'academy-button academy-button-primary academy-drag-check';
    check.textContent = host.language === 'ja' ? '確認する' : 'Check arrangement';
    const status = statusRegion('academy-kit-feedback');
    root.append(heading, workspace, moveControls, check, status);
    host.replace(root);

    const placements = new Map(model.payload.items.map(item => [item.id, null as string | null]));
    let selectedId: string | null = null;
    let draggedId: string | null = null;

    const select = (itemId: string): void => {
        selectedId = itemId;
        move.disabled = false;
        renderWorkspace(itemId);
        const item = model.payload.items.find(candidate => candidate.id === itemId)!;
        host.announce(host.language === 'ja' ? `${item.label}を選びました。` : `Selected ${item.label}.`);
    };
    const place = (itemId: string, zoneId: string | null): void => {
        placements.set(itemId, zoneId);
        selectedId = itemId;
        renderWorkspace(itemId);
        const label = zoneId
            ? localized(model.payload.zones.find(zone => zone.id === zoneId)!.label, host)
            : localized(model.payload.sourceLabel, host);
        host.announce(host.language === 'ja' ? `${label}へ移動しました。` : `Moved to ${label}.`);
    };

    const renderWorkspace = (focusId?: string): void => {
        const source = zone(model.payload.sourceLabel, null, 'tray');
        const zones = model.payload.zones.map(target => zone(target.label, target.id, target.appearance ?? 'tray'));
        workspace.replaceChildren(source, ...zones);
        model.payload.items.forEach(item => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'academy-drag-item';
            card.draggable = true;
            card.dataset.itemId = item.id;
            card.setAttribute('aria-pressed', String(item.id === selectedId));
            card.append(assessedJapanese(item.label));
            card.addEventListener('click', () => select(item.id), { signal: lifecycle.signal });
            card.addEventListener('dragstart', event => {
                draggedId = item.id;
                event.dataTransfer?.setData('text/plain', item.id);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
            }, { signal: lifecycle.signal });
            const target = workspace.querySelector<HTMLElement>(`[data-zone-id="${placements.get(item.id) ?? ''}"]`)!;
            target.querySelector('.academy-drag-items')?.append(card);
        });
        if (focusId) queueMicrotask(() => workspace.querySelector<HTMLElement>(`[data-item-id="${focusId}"]`)?.focus());
    };

    const zone = (label: LocalizedText, zoneId: string | null, appearance: 'bag' | 'tray'): HTMLElement => {
        const section = document.createElement('section');
        section.className = `academy-drag-zone academy-drag-zone-${appearance}`;
        section.dataset.zoneId = zoneId ?? '';
        const title = document.createElement('h3');
        title.append(...localizedNodes(label));
        const items = document.createElement('div');
        items.className = 'academy-drag-items';
        items.setAttribute('role', 'list');
        section.addEventListener('dragover', event => {
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        }, { signal: lifecycle.signal });
        section.addEventListener('drop', event => {
            event.preventDefault();
            const itemId = event.dataTransfer?.getData('text/plain') || draggedId;
            if (itemId && placements.has(itemId)) place(itemId, zoneId);
            draggedId = null;
        }, { signal: lifecycle.signal });
        section.append(title, items);
        return section;
    };

    move.addEventListener('click', () => {
        if (selectedId) place(selectedId, destination.value || null);
    }, { signal: lifecycle.signal });
    check.addEventListener('click', () => {
        setPending(root, true);
        void submit({
            placements: model.payload.items.map(item => ({ itemId: item.id, zoneId: placements.get(item.id) ?? null })),
        }).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            if (evaluation.result.outcome === 'lapse') setPending(root, false);
        }).catch(error => {
            setPending(root, false);
            status.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    renderWorkspace();
    return {
        focus() { workspace.querySelector<HTMLElement>('.academy-drag-item')?.focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}

function parseResponse(model: DragSortModel, response: DragSortResponse): ReadonlyMap<string, string | null> {
    if (!response || !Array.isArray(response.placements) || response.placements.length !== model.payload.items.length) {
        throw new TypeError('Every sortable item needs one placement.');
    }
    const itemIds = new Set(model.payload.items.map(item => item.id));
    const zoneIds = new Set(model.payload.zones.map(zone => zone.id));
    const placements = new Map<string, string | null>();
    response.placements.forEach(placement => {
        if (!itemIds.has(placement.itemId) || placements.has(placement.itemId)) throw new TypeError('Sort placements must use each authored item once.');
        if (placement.zoneId !== null && !zoneIds.has(placement.zoneId)) throw new TypeError('Sort placements must use an authored destination.');
        placements.set(placement.itemId, placement.zoneId);
    });
    return placements;
}

function option(value: string, label: string): HTMLOptionElement {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    return node;
}
