// Settings the hosted docs site force-enables so its demo video player shows
// furigana/subtitles/OCR regardless of what the visitor has configured. The
// docs theme writes these into the hosted origin's localStorage settings copy,
// which means that copy is NOT a faithful record of user intent for these keys
// — stranded-settings recovery must never promote them into the shared GM
// store, or a homepage visit would flip the user's real settings everywhere.
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
} as const;

export const HOSTED_DEMO_SETTINGS_KEYS: ReadonlySet<string> = new Set(Object.keys(HOSTED_DEMO_VIDEO_SETTINGS_PATCH));
