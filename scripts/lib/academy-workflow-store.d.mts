export interface WorkflowFileTransitionInspection {
    status: 'clean' | 'invalid-journal' | 'recoverable' | 'ambiguous' | 'recovered';
    journalPath: string;
    journal?: Record<string, any>;
    files?: Array<Record<string, any>>;
    recommended?: 'rollback' | 'roll-forward' | null;
    action?: 'none' | 'rollback' | 'roll-forward';
    error?: string;
}

export function writeFileDurably(target: string, value: string | Uint8Array): void;
export function inspectFileTransition(stateRoot: string): WorkflowFileTransitionInspection;
export function recoverFileTransition(
    stateRoot: string,
    mode?: 'auto' | 'rollback' | 'roll-forward',
): WorkflowFileTransitionInspection;
export function commitFileTransition(
    stateRoot: string,
    kind: string,
    writes: Array<{ path: string; value?: string | Uint8Array; remove?: boolean }>,
    metadata?: Record<string, unknown>,
): Record<string, any>;
