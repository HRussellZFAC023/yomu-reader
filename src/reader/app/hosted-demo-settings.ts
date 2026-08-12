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

type HostedLocalSettingKey = typeof HOSTED_LOCAL_SETTINGS_KEYS[number];

export const HOSTED_DEMO_READER_SETTINGS = {
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
