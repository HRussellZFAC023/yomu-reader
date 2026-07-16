/**
 * Checkpoint-backed first-visit state. The identifier is deliberately generic
 * so a future location, character interaction, or tool can reuse it.
 */
export function introductionId(scope: 'place' | 'action', id: string): string {
    const normalized = id.trim();
    if (!normalized) throw new TypeError('Introduction ids must not be empty.');
    return `${scope}:${normalized}`;
}

export function hasSeenIntroduction(
    seen: readonly string[] | undefined,
    id: string,
): boolean {
    return seen?.includes(id) ?? false;
}

export function markIntroductionSeen(
    seen: readonly string[] | undefined,
    id: string,
): readonly string[] {
    return hasSeenIntroduction(seen, id) ? (seen ?? []) : [...(seen ?? []), id];
}
