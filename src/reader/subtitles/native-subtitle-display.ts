import type { ReaderSettings } from '../app/types';

export const NATIVE_SUBTITLE_DISPLAY_MODES = ['blurred', 'shown', 'hidden'] as const;

export type NativeSubtitleDisplayMode = typeof NATIVE_SUBTITLE_DISPLAY_MODES[number];

export function isNativeSubtitleDisplayMode(value: string): value is NativeSubtitleDisplayMode {
    return NATIVE_SUBTITLE_DISPLAY_MODES.includes(value as NativeSubtitleDisplayMode);
}

type NativeSubtitleDisplaySettings = Pick<
    ReaderSettings,
    'subtitleSecondaryVisible' | 'subtitleSecondaryVisibleChosen' | 'subtitleNativeBlurred'
>;

export function nativeSubtitleDisplayMode(
    settings: Pick<ReaderSettings, 'subtitleSecondaryVisible' | 'subtitleSecondaryVisibleChosen' | 'subtitleNativeBlurred'>,
): NativeSubtitleDisplayMode {
    // Before a learner makes a visibility choice, a missing secondary track is
    // merely unavailable, not deliberately hidden. Keep showing the preferred
    // reveal mode so the control does not appear to change itself when an
    // automatically paired translation arrives.
    if (!settings.subtitleSecondaryVisible && settings.subtitleSecondaryVisibleChosen) return 'hidden';
    return settings.subtitleNativeBlurred ? 'blurred' : 'shown';
}

export function applyNativeSubtitleDisplayMode(
    settings: NativeSubtitleDisplaySettings,
    mode: NativeSubtitleDisplayMode,
    options: { markVisibilityChosen?: boolean } = {},
): boolean {
    const visible = mode !== 'hidden';
    const blurred = mode === 'blurred';
    const markVisibilityChosen = options.markVisibilityChosen ?? true;
    const changed = settings.subtitleSecondaryVisible !== visible
        || settings.subtitleNativeBlurred !== blurred
        || (markVisibilityChosen && !settings.subtitleSecondaryVisibleChosen);
    settings.subtitleSecondaryVisible = visible;
    settings.subtitleNativeBlurred = blurred;
    if (markVisibilityChosen) settings.subtitleSecondaryVisibleChosen = true;
    return changed;
}
