import type { ReaderSettings } from '../app/types';
import { OVERLAY_COLOR_TOKENS } from '../theme/color-tokens';

export function createDefaultSubtitleSettings(fontFamily: string) {
    return {
        subtitlePlayerEnabled: true,
        subtitleAutoDetect: true,
        subtitleOverlayVisible: false,
        subtitleSecondaryVisible: false,
        subtitleOverlayVisibleChosen: false,
        subtitleSecondaryVisibleChosen: false,
        subtitleNativeBlurred: true,
        subtitleNativeBlurStrength: 12,
        subtitleKaraokeMode: true,
        subtitleTranscriptVisible: false,
        subtitlePausePanel: false,
        subtitleShadowAutoPause: false,
        subtitleTranscriptPlacement: 'right',
        subtitleTranscriptAutoScroll: true,
        subtitleTranscriptAutoScrollResumeSeconds: 30,
        subtitleAutoCopyLine: false,
        subtitleCopyIncludeTranslation: true,
        subtitleControlsMode: 'auto',
        subtitleFontSize: 28,
        subtitleBottomOffset: 16,
        subtitleTextColor: OVERLAY_COLOR_TOKENS.text,
        subtitleOutlineColor: OVERLAY_COLOR_TOKENS.outline,
        subtitleBackgroundColor: OVERLAY_COLOR_TOKENS.background,
        subtitleBackgroundOpacity: 0,
        subtitleFontFamily: fontFamily,
        subtitleFontWeight: 760,
        subtitleMiningPause: true,
        subtitleHoverPause: true,
        subtitleSeekPadding: 0.08,
    } satisfies Partial<ReaderSettings>;
}
