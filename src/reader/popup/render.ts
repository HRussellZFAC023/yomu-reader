// ADR-0003 phase 2: the kanji render layer lives in the Yomu Kanji/Study
// companion; these delegators are the single seam between core and the
// extracted modules. Greasy Fork builds drop the modules from core (vite
// aliases register-build-target to register-empty) and the @require'd
// companion registers them; absence degrades to empty sections.
import { yomuKanjiStudyCompanion, type BuildKanjiFactsFn, type BuildKanjiOriginGraphFn, type BuildRtkComponentSummariesFn, type InstallOriginGraphInteractionsFn, type RenderJpdbKanjiInfoFn, type RenderJpdbKanjiMiningControlsFn, type RenderKanjiKeywordLineFn, type RenderKanjiOriginsFn, type RenderKanjiPracticeFn, type RenderRtkInfoFn } from '../companions/registry';

export function renderJpdbKanjiInfo(...args: Parameters<RenderJpdbKanjiInfoFn>): string {
    return yomuKanjiStudyCompanion()?.renderJpdbKanjiInfo(...args) ?? '';
}

export function renderJpdbKanjiMiningControls(...args: Parameters<RenderJpdbKanjiMiningControlsFn>): string {
    return yomuKanjiStudyCompanion()?.renderJpdbKanjiMiningControls(...args) ?? '';
}

export function renderKanjiPractice(...args: Parameters<RenderKanjiPracticeFn>): string {
    return yomuKanjiStudyCompanion()?.renderKanjiPractice(...args) ?? '';
}

export function renderKanjiOrigins(...args: Parameters<RenderKanjiOriginsFn>): string {
    return yomuKanjiStudyCompanion()?.renderKanjiOrigins(...args) ?? '';
}

export function buildRtkComponentSummaries(...args: Parameters<BuildRtkComponentSummariesFn>): ReturnType<BuildRtkComponentSummariesFn> {
    return yomuKanjiStudyCompanion()?.buildRtkComponentSummaries(...args) ?? [];
}

export function renderKanjiKeywordLine(...args: Parameters<RenderKanjiKeywordLineFn>): string {
    return yomuKanjiStudyCompanion()?.renderKanjiKeywordLine(...args) ?? '';
}

export function renderRtkInfo(...args: Parameters<RenderRtkInfoFn>): string {
    return yomuKanjiStudyCompanion()?.renderRtkInfo(...args) ?? '';
}

export function installOriginGraphInteractions(...args: Parameters<InstallOriginGraphInteractionsFn>): void {
    yomuKanjiStudyCompanion()?.installOriginGraphInteractions(...args);
}

export function buildKanjiFacts(...args: Parameters<BuildKanjiFactsFn>): ReturnType<BuildKanjiFactsFn> {
    return yomuKanjiStudyCompanion()?.buildKanjiFacts(...args) ?? [];
}

export function buildKanjiOriginGraph(...args: Parameters<BuildKanjiOriginGraphFn>): ReturnType<BuildKanjiOriginGraphFn> | null {
    return yomuKanjiStudyCompanion()?.buildKanjiOriginGraph(...args) ?? null;
}
export { cardPronunciationReading, isKanjiCharacter, renderExpressionComponentPitches, renderPitch, uniqueKanji } from './pitch';
export { pickTokenForSelection, tokensOverlappingSelection } from './token-selection';
