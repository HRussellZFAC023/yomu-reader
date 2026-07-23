import type { JlptBand } from './learner-record';

export type PlacementListeningMode = 'audio' | 'transcript-alternative';
export type PlacementSpeakingMode = 'aloud' | 'typed-alternative';
export type PlacementWritingMode = 'typed' | 'paper-alternative';

export interface PlacementProductionAttempt<Mode extends string> {
    readonly mode: Mode;
    readonly completed: boolean;
    readonly response: string;
    readonly confidence: number;
    readonly rated: boolean;
}

export interface PlacementMockDraft {
    readonly targetBand: JlptBand;
    readonly responses: Readonly<Record<string, string>>;
    readonly listeningModes: Readonly<Record<string, PlacementListeningMode>>;
    readonly production: Readonly<{
        speaking: PlacementProductionAttempt<PlacementSpeakingMode>;
        writing: PlacementProductionAttempt<PlacementWritingMode>;
    }>;
}

export interface PlacementMockProgress {
    readonly schemaVersion: 1;
    /** Zero is the level chooser; the final numbered step is the production desk. */
    readonly step: number;
    readonly submitted: boolean;
    readonly draft: PlacementMockDraft;
}

export function emptyPlacementProduction(): PlacementMockDraft['production'] {
    return {
        speaking: { mode: 'aloud', completed: false, response: '', confidence: 0.5, rated: false },
        writing: { mode: 'typed', completed: false, response: '', confidence: 0.5, rated: false },
    };
}

export function placementMockProgressShapeIsValid(value: unknown): value is PlacementMockProgress {
    if (!isRecord(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.step)
        || Number(value.step) < 0 || Number(value.step) > 8 || typeof value.submitted !== 'boolean') return false;
    const draft = value.draft;
    if (!isRecord(draft) || !isJlptBand(draft.targetBand) || !stringRecord(draft.responses)) return false;
    if (!isRecord(draft.listeningModes) || Object.entries(draft.listeningModes).some(([key, mode]) => (
        !key.trim() || (mode !== 'audio' && mode !== 'transcript-alternative')
    ))) return false;
    if (!isRecord(draft.production)) return false;
    return productionAttemptIsValid(draft.production.speaking, ['aloud', 'typed-alternative'])
        && productionAttemptIsValid(draft.production.writing, ['typed', 'paper-alternative']);
}

function productionAttemptIsValid(value: unknown, modes: readonly string[]): boolean {
    return isRecord(value)
        && typeof value.mode === 'string'
        && modes.includes(value.mode)
        && typeof value.completed === 'boolean'
        && typeof value.response === 'string'
        && value.response.length <= 2_000
        && typeof value.confidence === 'number'
        && Number.isFinite(value.confidence)
        && value.confidence >= 0
        && value.confidence <= 1
        && typeof value.rated === 'boolean';
}

function stringRecord(value: unknown): value is Readonly<Record<string, string>> {
    return isRecord(value) && Object.entries(value).every(([key, entry]) => key.trim() && typeof entry === 'string');
}

function isJlptBand(value: unknown): value is JlptBand {
    return value === 'n5' || value === 'n4' || value === 'n3' || value === 'n2' || value === 'n1';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
