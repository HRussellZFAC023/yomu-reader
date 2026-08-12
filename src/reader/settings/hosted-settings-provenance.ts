import { hasOwn } from './values';

/**
 * Static hosted controls can run before the Reader. Their very first settings
 * write must say that no target was chosen; non-empty unmarked records are left
 * alone because identical partial writers shipped before 1.9.
 */
export function mergeHostedSettingsPatch(
    existing: Record<string, unknown>,
    patch: Record<string, unknown>,
): Record<string, unknown> {
    const firstWriteTarget = Object.keys(existing).length === 0 && !hasOwn(patch, 'learningTargetChosen')
        ? { learningTargetChosen: false }
        : {};
    return { ...existing, ...firstWriteTarget, ...patch };
}

/**
 * The shared GM record is authoritative. Passive hosted appearance state never
 * creates a shared learner profile: an empty shared record stays untouched,
 * while an existing explicit or legacy-unmarked target keeps its provenance.
 */
export function mergeHostedSharedSettingsPatch(
    shared: Record<string, unknown>,
    patch: Record<string, unknown>,
): Record<string, unknown> | null {
    return Object.keys(shared).length > 0 ? { ...shared, ...patch } : null;
}
