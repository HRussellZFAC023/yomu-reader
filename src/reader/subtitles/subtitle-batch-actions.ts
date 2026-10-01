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
            // A word no enabled destination can take does not block the others.
            canCollect: complete && chosen.some(plan => plan.canCollect) && chosen.every(plan => plan.canCollect || plan.noDestination),
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
            const skipped: SkippedWords = { unmatched: [], 'no-destination': [] };
            for (const item of result.items) {
                const candidate = this.candidates.get(item.token);
                if (!candidate || !['completed', 'unmatched', 'no-destination'].includes(item.state)) continue;
                if (item.state === 'completed') completed += 1;
                else skipped[item.state as keyof SkippedWords].push(candidate.card.spelling);
                // A word the grading service does not have, or no deck can take,
                // leaves the selection too: retrying cannot change it.
                const current = this.deps.getCandidates().find(current => current.key === candidate.key && current.card === candidate.card);
                if (current) {
                    current.state = primaryCardState(current.card.cardState);
                    this.deps.getSelected().delete(candidate.key);
                }
            }
            this.deps.toast(batchResultMessage(language, action, result, { completed, total: plans.length, skipped }));
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
    counts: { completed: number; total: number; skipped: SkippedWords },
): string {
    if (result.rejected) {
        return subtitleText(language, result.rejected === 'busy' ? 'bmBusy' : result.rejected === 'capacity' ? 'bmCapacity'
            : result.rejected === 'stale' ? 'bmPlanChanged' : 'bmIncompatible');
    }
    const { completed, total, skipped } = counts;
    const outcome = completed + skipped.unmatched.length + skipped['no-destination'].length < total ? formatSubtitleText(language, 'bmPartial', { count: completed, total })
        : completed ? formatSubtitleText(language, action === 'collect' ? 'bmAdded' : 'bmGraded', { count: completed }) : '';
    // A word the grading service lacks is named apart from one no deck can take.
    const notes = [
        [action === 'collect' ? 'bmNotFoundAdd' : 'bmNotFound', skipped.unmatched] as const,
        ['bmNoDestination', skipped['no-destination']] as const,
    ].filter(([, words]) => words.length).map(([key, words]) => formatSubtitleText(language, key, { words: uiList(language, words) }));
    // Japanese sentences follow one another without a space.
    return [outcome, ...notes].reduce((message, next) => !next ? message : !message ? next : `${message}${message.endsWith('。') ? '' : ' '}${next}`, '');
}

type SkippedWords = Record<'unmatched' | 'no-destination', string[]>;
