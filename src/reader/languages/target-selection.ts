import { setActiveLearningTargetLanguage } from './active';
import { resolveLanguageProfile } from './profiles';
import { defaultLearningTargetModule } from './registry';
import type { LearningTargetModule } from './types';

/**
 * Where the active learning target comes from.
 *
 * The stored language profile is the only durable statement of what Yomu is
 * teaching, so this module is the one place that turns it into runtime state.
 * Core reads the target through `activeLearningTarget()`; nothing else writes
 * it. Keeping the read and the write on opposite sides of this seam is what
 * stops "which language is this" from becoming a settings lookup at every call
 * site.
 *
 * Callers: the reader's startup settings load (every boot, including embedded
 * frames) and the runtime settings-change handler (every persisted write, the
 * settings dialog, and cross-tab storage sync).
 */
export function adoptLearningTargetFromSettings(value: unknown): LearningTargetModule {
    return adoptLearningTargetLanguage(resolveLanguageProfile(value).targetLanguage);
}

/**
 * Unlike `setActiveLearningTargetLanguage`, an unusable tag here falls back to
 * the default rather than leaving the previous target in place. This runs
 * against whatever was actually stored, so "the profile names a target this
 * build cannot serve" must land on Japanese, not on whichever target the
 * previous profile happened to select.
 */
export function adoptLearningTargetLanguage(value: unknown): LearningTargetModule {
    const requested = setActiveLearningTargetLanguage(value);
    if (requested) return requested;
    const fallback = defaultLearningTargetModule();
    return setActiveLearningTargetLanguage(fallback.language) ?? fallback;
}
