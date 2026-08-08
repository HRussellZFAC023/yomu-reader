import type { SubtitleLanguageContext } from './subtitle-language-context';
import { sameSubtitleLanguageContext } from './subtitle-language-context';
import { compareSubtitleTrackOptions, isOutputLanguageSubtitleTrack, isSubtitleTrackLanguage } from './subtitle-track-metadata';
import type { SubtitleTrackOption } from './subtitle-track-options';

export interface SubtitleLanguageReconciliation {
    removedTrackIds: Set<string>;
    resetPrimary: boolean;
    resetSecondary: boolean;
}

export interface SubtitleLanguageAction {
    type: 'reset-primary' | 'reset-secondary' | 'select-primary' | 'select-secondary';
    trackId: string;
}

export function planSubtitleLanguageReconciliation(
    tracks: SubtitleTrackOption[],
    selectedTrackId: string,
    secondaryTrackId: string,
    previous: SubtitleLanguageContext,
    next: SubtitleLanguageContext,
): SubtitleLanguageReconciliation | null {
    if (sameSubtitleLanguageContext(previous, next)) return null;
    const removedTrackIds = translatedTrackIdsForChangedSelection(tracks, previous, next);
    const targetChanged = targetLanguageChanged(previous, next);
    const selected = tracks.find(track => track.id === selectedTrackId);
    const secondary = tracks.find(track => track.id === secondaryTrackId);
    const resetPrimary = targetChanged || invalidSelection(selected, selectedTrackId, removedTrackIds, next.targetLanguage);
    const resetSecondary = shouldResetSecondary(targetChanged, previous, next, secondary, secondaryTrackId, removedTrackIds);
    return { removedTrackIds, resetPrimary, resetSecondary };
}

function translatedTrackIdsForChangedSelection(
    tracks: SubtitleTrackOption[],
    previous: SubtitleLanguageContext,
    next: SubtitleLanguageContext,
): Set<string> {
    if (!subtitleLanguageSelectionChanged(previous, next)) return new Set();
    return new Set(tracks
        .filter(track => Boolean(track.translatedFromTrackId) || track.sourceType === 'translation')
        .map(track => track.id));
}

function subtitleLanguageSelectionChanged(previous: SubtitleLanguageContext, next: SubtitleLanguageContext): boolean {
    return previous.generation !== next.generation
        || previous.targetLanguage !== next.targetLanguage
        || previous.outputLanguage !== next.outputLanguage;
}

function targetLanguageChanged(previous: SubtitleLanguageContext, next: SubtitleLanguageContext): boolean {
    return previous.generation !== next.generation || previous.targetLanguage !== next.targetLanguage;
}

function invalidSelection(
    track: SubtitleTrackOption | undefined,
    trackId: string,
    removedTrackIds: ReadonlySet<string>,
    expectedLanguage: string,
): boolean {
    if (removedTrackIds.has(trackId)) return true;
    return Boolean(track && !isSubtitleTrackLanguage(track, expectedLanguage));
}

function shouldResetSecondary(
    targetChanged: boolean,
    previous: SubtitleLanguageContext,
    next: SubtitleLanguageContext,
    track: SubtitleTrackOption | undefined,
    trackId: string,
    removedTrackIds: ReadonlySet<string>,
): boolean {
    if (targetChanged) return true;
    if (previous.outputLanguage !== next.outputLanguage) return true;
    return invalidOutputSelection(track, trackId, removedTrackIds, next.outputLanguage);
}

function invalidOutputSelection(
    track: SubtitleTrackOption | undefined,
    trackId: string,
    removedTrackIds: ReadonlySet<string>,
    outputLanguage: string,
): boolean {
    if (removedTrackIds.has(trackId)) return true;
    return Boolean(track && !isOutputLanguageSubtitleTrack(track, outputLanguage));
}

export function automaticSubtitleLanguagePair(
    tracks: SubtitleTrackOption[],
    context: SubtitleLanguageContext,
): { primary?: SubtitleTrackOption; secondary?: SubtitleTrackOption } {
    const primary = preferredTrack(tracks, context.targetLanguage);
    const secondary = context.outputLanguage === context.targetLanguage
        ? undefined
        : preferredOutputTrack(tracks.filter(track => track.id !== primary?.id), context.outputLanguage);
    return { primary, secondary };
}

export function subtitleLanguageActions(
    plan: SubtitleLanguageReconciliation,
    pair: { primary?: SubtitleTrackOption; secondary?: SubtitleTrackOption },
    selectedTrackId: string,
    secondaryTrackId: string,
): SubtitleLanguageAction[] {
    return [
        ...subtitleLanguageResetActions(plan, selectedTrackId, secondaryTrackId),
        ...subtitleLanguageSelectionActions(plan, pair),
    ];
}

export function disableSubtitleTextTrack(track: TextTrack | undefined): void {
    if (track) track.mode = 'disabled';
}

function subtitleLanguageResetActions(
    plan: SubtitleLanguageReconciliation,
    selectedTrackId: string,
    secondaryTrackId: string,
): SubtitleLanguageAction[] {
    const actions: SubtitleLanguageAction[] = [];
    if (primaryResetActionNeeded(plan, selectedTrackId)) actions.push({ type: 'reset-primary', trackId: '' });
    if (secondaryResetActionNeeded(plan, secondaryTrackId)) actions.push({ type: 'reset-secondary', trackId: '' });
    return actions;
}

function subtitleLanguageSelectionActions(
    plan: SubtitleLanguageReconciliation,
    pair: { primary?: SubtitleTrackOption; secondary?: SubtitleTrackOption },
): SubtitleLanguageAction[] {
    const actions: SubtitleLanguageAction[] = [];
    if (shouldSelectPrimary(plan, pair.primary)) actions.push({ type: 'select-primary', trackId: pair.primary.id });
    if (shouldSelectSecondary(plan, pair.secondary)) actions.push({ type: 'select-secondary', trackId: pair.secondary.id });
    return actions;
}

function primaryResetActionNeeded(plan: SubtitleLanguageReconciliation, trackId: string): boolean {
    return plan.resetPrimary && Boolean(trackId);
}

function secondaryResetActionNeeded(plan: SubtitleLanguageReconciliation, trackId: string): boolean {
    return plan.resetSecondary && Boolean(trackId);
}

function shouldSelectPrimary(
    plan: SubtitleLanguageReconciliation,
    track: SubtitleTrackOption | undefined,
): track is SubtitleTrackOption {
    return plan.resetPrimary && Boolean(track);
}

function shouldSelectSecondary(
    plan: SubtitleLanguageReconciliation,
    track: SubtitleTrackOption | undefined,
): track is SubtitleTrackOption {
    return plan.resetSecondary && Boolean(track);
}

function preferredTrack(tracks: SubtitleTrackOption[], language: string): SubtitleTrackOption | undefined {
    return [...tracks]
        .filter(track => isSubtitleTrackLanguage(track, language))
        .sort((left, right) => Number(Boolean(left.translatedFromTrackId)) - Number(Boolean(right.translatedFromTrackId))
            || compareSubtitleTrackOptions(left, right))[0];
}

function preferredOutputTrack(tracks: SubtitleTrackOption[], language: string): SubtitleTrackOption | undefined {
    return [...tracks]
        .filter(track => isOutputLanguageSubtitleTrack(track, language))
        .sort((left, right) => Number(!isSubtitleTrackLanguage(left, language)) - Number(!isSubtitleTrackLanguage(right, language))
            || compareSubtitleTrackOptions(left, right))[0];
}
