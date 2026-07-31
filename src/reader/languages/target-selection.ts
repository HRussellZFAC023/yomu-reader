import { adoptLearningTargetLanguage } from './target-runtime';
import { resolveLanguageProfile } from './profiles';
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
 * frames), the runtime settings-change handler (every persisted write, the
 * settings dialog, and cross-tab storage sync), and Yomu Gaming's own settings
 * loader.
 *
 * A process that holds no settings cannot come through here. Electron's main
 * process is the one such caller: the target it should answer for arrives on
 * the capture request, and it adopts that tag with
 * `adoptLearningTargetLanguage` in `active.ts`.
 */
export function adoptLearningTargetFromSettings(value: unknown): LearningTargetModule {
    return adoptLearningTargetLanguage(resolveLanguageProfile(value).targetLanguage);
}
