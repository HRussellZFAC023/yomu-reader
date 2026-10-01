import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import { uiList } from '../app/i18n';
import type { SubtitleCommandCapability } from '../dom/private-command-capabilities';
import { commonBatchGrades, type BatchMutation, type BatchMutationResult, type PreparedBatchPlan } from '../cards/prepared-batch-actions';
import type { SubtitleBatchMiningCandidate } from './subtitle-batch-mining';
import { formatSubtitleText, subtitleText } from './i18n';
import { primaryCardState } from '../cards/state';

export interface SubtitleBatchActionCallbacks {
    beginBatchMiningGeneration?: () => boolean;
    prepareBatchMiningCandidates?: (candidates: readonly SubtitleBatchMiningCandidate[]) => PreparedBatchPlan[];
    executeBatchMiningCandidates?: (plans: readonly symbol[], action: BatchMutation, grade?: SubtitleCommandCapability['grade']) => Promise<BatchMutationResult>;
}
export interface SubtitleBatchActionView {
    batchGroup: symbol;
    candidatePlans: ReadonlyMap<string, PreparedBatchPlan>;
    selectedPlans: readonly symbol[];
    reviewGrades: Array<{ grade: NonNullable<SubtitleCommandCapability['grade']>; label: string }>;
    canCollect: boolean;
    incompatible: boolean;
    busy: boolean;
}
interface Dependencies {
    getSettings(): ReaderSettings;
    getCandidates(): SubtitleBatchMiningCandidate[];
    getSelected(): Set<string>;
    callbacks(): SubtitleBatchActionCallbacks;
    available?(): boolean;
    render(): void;
    toast(message: string): void;
}

/** Own one rendered selection and reconcile only its completed mutations. */
export class SubtitleBatchActions {
    busy = false;
    private view: SubtitleBatchActionView = {
        batchGroup: Symbol('batch-view'), candidatePlans: new Map(), selectedPlans: [], reviewGrades: [],
        canCollect: false, incompatible: false, busy: false,
    };
    private candidates = new Map<symbol, SubtitleBatchMiningCandidate>();
    constructor(private deps: Dependencies) {}

    beginGeneration(): boolean {
        if (this.busy || this.deps.callbacks().beginBatchMiningGeneration?.() === false) return false;
        this.view = { ...this.view, batchGroup: Symbol('batch-view'), candidatePlans: new Map(), selectedPlans: [], reviewGrades: [], canCollect: false };
        this.candidates.clear();
        return true;
    }

    renderState(candidates: SubtitleBatchMiningCandidate[], selected: ReadonlySet<string>): SubtitleBatchActionView {
        if (this.busy) return { ...this.view, busy: true };
        const plans = this.deps.callbacks().prepareBatchMiningCandidates?.(candidates) ?? [];
        this.candidates.clear();
        const candidatePlans = new Map<string, PreparedBatchPlan>();
        candidates.forEach((candidate, index) => {
            const plan = plans[index];
            if (!plan) return;
            candidatePlans.set(candidate.key, plan);
            this.candidates.set(plan.token, candidate);
        });
        const chosen = candidates.filter(candidate => selected.has(candidate.key)).map(candidate => candidatePlans.get(candidate.key));
        const complete = chosen.length > 0 && chosen.every((plan): plan is PreparedBatchPlan => Boolean(plan));
        const grades = complete ? commonBatchGrades(chosen) : [];
        this.view = {
            batchGroup: Symbol('batch-view'), candidatePlans, selectedPlans: chosen.flatMap(plan => plan ? [plan.token] : []),
            reviewGrades: grades.map(([grade, label]) => ({ grade, label })),
            canCollect: complete && chosen.every(plan => plan.canCollect),
            incompatible: chosen.length > 0 && (!complete || !grades.length), busy: false,
        };
        return this.view;
    }

    async run(action: BatchMutation, command: SubtitleCommandCapability): Promise<void> {
        if (this.busy) return;
        const language = this.deps.getSettings().interfaceLanguage;
        const execute = this.deps.callbacks().executeBatchMiningCandidates;
        if (!execute || this.deps.available?.() === false || !this.matches(command)) {
            this.deps.toast(subtitleText(language, 'bmPlanChanged'));
            return;
        }
        const plans = [...command.batchPlans!];
        this.busy = true;
        this.deps.render();
        try {
            const result = await execute(plans, action, command.grade);
            let completed = 0;
            const notFound: string[] = [];
            for (const item of result.items) {
                const candidate = this.candidates.get(item.token);
                if (!candidate || (item.state !== 'completed' && item.state !== 'unmatched')) continue;
                if (item.state === 'completed') completed += 1;
                else notFound.push(candidate.card.spelling);
                // A word the grading service does not have leaves the selection too:
                // retrying cannot grade it, and its row now says why.
                const current = this.deps.getCandidates().find(current => current.key === candidate.key && current.card === candidate.card);
                if (current) {
                    current.state = primaryCardState(current.card.cardState);
                    this.deps.getSelected().delete(candidate.key);
                }
            }
            this.deps.toast(batchResultMessage(language, action, result, { completed, total: plans.length, notFound }));
        } catch {
            this.deps.toast(subtitleText(language, action === 'collect' ? 'bmAddFailed' : 'bmGradeFailed'));
        } finally {
            this.busy = false;
            this.deps.render();
        }
    }

    private matches(command: SubtitleCommandCapability): boolean {
        if (command.batchGroup !== this.view.batchGroup || !command.batchPlans?.length) return false;
        const expected = command.candidateKey ? [this.view.candidatePlans.get(command.candidateKey)?.token]
            : this.deps.getCandidates().filter(candidate => this.deps.getSelected().has(candidate.key)).map(candidate => this.view.candidatePlans.get(candidate.key)?.token);
        return expected.length === command.batchPlans.length && expected.every((token, index) => token === command.batchPlans![index])
            && command.batchPlans.every(token => {
                const planned = this.candidates.get(token);
                return planned && this.deps.getCandidates().some(candidate => candidate.key === planned.key && candidate.card === planned.card);
            });
    }
}

function batchResultMessage(
    language: InterfaceLanguage,
    action: BatchMutation,
    result: BatchMutationResult,
    counts: { completed: number; total: number; notFound: string[] },
): string {
    if (result.rejected) {
        return subtitleText(language, result.rejected === 'busy' ? 'bmBusy' : result.rejected === 'capacity' ? 'bmCapacity'
            : result.rejected === 'stale' ? 'bmPlanChanged' : 'bmIncompatible');
    }
    const { completed, total, notFound } = counts;
    const outcome = completed + notFound.length < total ? formatSubtitleText(language, 'bmPartial', { count: completed, total })
        : completed ? formatSubtitleText(language, action === 'collect' ? 'bmAdded' : 'bmGraded', { count: completed }) : '';
    if (!notFound.length) return outcome;
    const missing = formatSubtitleText(language, 'bmNotFound', { words: uiList(language, notFound) });
    // Japanese sentences follow one another without a space.
    return outcome ? `${outcome}${outcome.endsWith('。') ? '' : ' '}${missing}` : missing;
}
