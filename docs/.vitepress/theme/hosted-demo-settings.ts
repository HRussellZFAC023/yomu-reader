import type { HostedLocalSettingKey } from '../../../src/reader/app/hosted-demo-settings';

// The public homepage deliberately stages these values for its Reader demos.
// They remain page-local policy and are never recovered into an installed copy.
export const HOSTED_DEMO_VIDEO_SETTINGS_PATCH = {
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
    wordUnderlineColorSource: 'pitch',
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleControlsMode: 'always',
    subtitleTranscriptVisible: false,
    ocrEnabled: true,
    ocrVideoPauseFrames: true,
    ocrProvider: 'google-lens',
    ocrOverlayTheme: 'auto',
    preferJapaneseSiteLanguage: false,
} as const satisfies Record<HostedLocalSettingKey, unknown>;
