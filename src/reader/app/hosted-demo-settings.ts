// These settings are page-local policy on the built-in hosted Reader, not
// learner intent that may be recovered into an installed userscript or extension.
export const HOSTED_LOCAL_SETTINGS_KEYS = [
    'showFurigana',
    'furiganaMode',
    'showPitchAccent',
    'wordUnderlineColorSource',
    'subtitlePlayerEnabled',
    'subtitleAutoDetect',
    'subtitleOverlayVisible',
    'subtitleControlsMode',
    'subtitleTranscriptVisible',
    'ocrEnabled',
    'ocrVideoPauseFrames',
    'ocrProvider',
    'ocrOverlayTheme',
    'preferJapaneseSiteLanguage',
] as const;

export type HostedLocalSettingKey = typeof HOSTED_LOCAL_SETTINGS_KEYS[number];
