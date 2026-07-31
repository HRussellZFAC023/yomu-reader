import { isUnifiedIdeograph } from './han';
import { activeLearningTarget } from './target-runtime';

/** Whether the active target has trustworthy per-character data. */
export function targetSupportsCharacterLookup(): boolean {
    return activeLearningTarget().capabilities['character-lookup'];
}

/**
 * Whether Japanese-only lookup providers may run for the active target.
 *
 * This is deliberately separate from character lookup. A future Chinese
 * target may gain trustworthy per-character data without thereby becoming
 * eligible for JPDB, Jiten, Japanese pitch, or the Japanese parser.
 */
export function usesJapaneseProviders(): boolean {
    return activeLearningTarget().language === 'ja';
}

/**
 * Defensive execution gate for character-card entry points.
 *
 * Rendering also uses the capability, but stale DOM and direct controller
 * calls must not reach Japanese providers after the target changes.
 */
export function targetCanLookupCharacter(value: string): boolean {
    return targetSupportsCharacterLookup() && isUnifiedIdeograph(value);
}
