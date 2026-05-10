export type CardState =
    | 'new'
    | 'learning'
    | 'known'
    | 'due'
    | 'failed'
    | 'locked'
    | 'never-forget'
    | 'blacklisted'
    | 'suspended'
    | 'not-in-deck'
    | 'redundant';

export type JPDBGrade = 'nothing' | 'something' | 'hard' | 'okay' | 'easy' | 'fail' | 'pass';

export type AudioSourceType =
    | 'jpod101'
    | 'language-pod-101'
    | 'jisho'
    | 'lingua-libre'
    | 'wiktionary'
    | 'text-to-speech'
    | 'text-to-speech-reading'
    | 'custom'
    | 'custom-json';

export type AudioSelectionMode = 'first' | 'random';

export type OcrProvider = 'google-lens' | 'cloud-vision' | 'local-service' | 'page-text' | 'off';

export type PopupActivationMode = 'click' | 'hover' | 'modifier';

export type ScanModifierKey = 'shift' | 'alt' | 'ctrl' | 'meta';

export type SubtitleControlsMode = 'auto' | 'always' | 'hidden';

export type InterfaceLanguage = 'auto' | 'en' | 'ja';

export type ImmersionKitCategory = 'all' | 'anime' | 'drama' | 'games';

export type ImmersionKitSort = 'sentence_length:asc' | 'sentence_length:desc' | 'random';

export interface AudioSourceSetting {
    type: AudioSourceType;
    url: string;
    voice: string;
    enabled: boolean;
}

export interface DictionaryPreference {
    name: string;
    alias: string;
    enabled: boolean;
    priority: number;
    allowSecondarySearches?: boolean;
}

export interface JPDBMeaning {
    glosses: string[];
    partOfSpeech: string[];
}

export interface JPDBCard {
    vid: number;
    sid: number;
    rid: number;
    spelling: string;
    reading: string;
    frequencyRank: number | null;
    partOfSpeech: string[];
    meanings: JPDBMeaning[];
    cardState: CardState[];
    pitchAccent: string[];
    wordWithReading: string | null;
}

export interface JPDBDeck {
    id: string;
    name: string;
}

export interface JPDBRuby {
    text: string;
    start: number;
    end: number;
    length: number;
}

export interface JPDBToken {
    card: JPDBCard;
    start: number;
    end: number;
    length: number;
    rubies: JPDBRuby[];
    pitchClass: string;
    sentence?: string;
}

export type JPDBRawVocabulary = [
    number,
    number,
    number,
    string,
    string,
    number | null,
    string[],
    string[][],
    string[][],
    CardState[] | null,
    string[] | null,
];

export type JPDBRawToken = [
    number,
    number,
    number,
    null | Array<string | [string, string]>,
];

export interface JPDBParseResult {
    vocabulary: JPDBRawVocabulary[];
    tokens: JPDBRawToken[][];
}

export interface ReaderSettings {
    apiKey: string;
    onboardingSeen: boolean;
    interfaceLanguage: InterfaceLanguage;
    accentColor: string;
    jpdbDefinitionsEnabled: boolean;
    jpdbDefinitionsPriority: number;
    rtkEnabled: boolean;
    kanjivgEnabled: boolean;
    kanjiOriginsEnabled: boolean;
    kanjiOriginKanjiMapEnabled: boolean;
    kanjiOriginWiktionaryEnabled: boolean;
    kanjiOriginGraphEnabled: boolean;
    kanjiOriginRadicalImagesEnabled: boolean;
    similarKanjiWords: boolean;
    similarKanjiWordLimit: number;
    audioEnabled: boolean;
    autoPlayAudio: boolean;
    audioSources: AudioSourceSetting[];
    audioEnableDefaultSources: boolean;
    audioSourceUrl?: string;
    audioViaBlob: boolean;
    audioTimeoutMs: number;
    audioSelectionMode: AudioSelectionMode;
    immersionKitEnabled: boolean;
    immersionKitLimit: number;
    immersionKitMinLength: number;
    immersionKitMaxLength: number;
    immersionKitCategory: ImmersionKitCategory;
    immersionKitSort: ImmersionKitSort;
    immersionKitExactMatch: boolean;
    immersionKitShowTranslation: boolean;
    immersionKitShowImages: boolean;
    immersionKitAutoPlayAudio: boolean;
    immersionKitPlaybackRate: number;
    parseSelection: boolean;
    lookupOnClick: boolean;
    lookupOnHover: boolean;
    hoverOpenDelayMs: number;
    hoverCloseDelayMs: number;
    popupActivationMode: PopupActivationMode;
    scanModifierKey: ScanModifierKey;
    autoScanJapanese: boolean;
    scanVisiblePage: boolean;
    showFloatingButton: boolean;
    puckPositionX?: number;
    puckPositionY?: number;
    showFurigana: boolean;
    showPitchAccent: boolean;
    hideKnownFurigana: boolean;
    ocrEnabled: boolean;
    ocrAutoScanImages: boolean;
    ocrShowTextOverlay: boolean;
    ocrProvider: OcrProvider;
    ocrEndpointUrl: string;
    ocrEngine: string;
    ocrCloudVisionApiKey: string;
    ocrLanguage: string;
    ocrMaxImagePixels: number;
    ocrMinImageArea: number;
    ocrMaxImagesPerPage: number;
    ocrPrefetchMargin: number;
    ocrTextColor: string;
    ocrOutlineColor: string;
    ocrBackgroundColor: string;
    ocrBackgroundOpacity: number;
    ocrFontScale: number;
    localDictionariesEnabled: boolean;
    localDictionaryMaxResults: number;
    localDictionaryShowKanji: boolean;
    dictionaryPreferences: DictionaryPreference[];
    yomitanSettingsBackup?: unknown;
    subtitlePlayerEnabled: boolean;
    subtitleAutoDetect: boolean;
    subtitleOverlayVisible: boolean;
    subtitleSecondaryVisible: boolean;
    subtitleControlsMode: SubtitleControlsMode;
    subtitleFontSize: number;
    subtitleBottomOffset: number;
    subtitleTextColor: string;
    subtitleOutlineColor: string;
    subtitleBackgroundColor: string;
    subtitleBackgroundOpacity: number;
    subtitleFontFamily: string;
    subtitleFontWeight: number;
    subtitleMiningPause: boolean;
    subtitleSeekPadding: number;
    youtubeImmersionEnabled: boolean;
    youtubeShowFilterNotice: boolean;
    ankiEnabled: boolean;
    ankiConnectUrl: string;
    ankiDeck: string;
    ankiModel: string;
    ankiTags: string;
    ankiMineWithJpdb: boolean;
    ankiCaptureScreenshot: boolean;
    theme: 'auto' | 'light' | 'dark';
    popupMode: 'auto' | 'sheet' | 'popover';
    miningDeck: string;
    neverForgetDeck: string;
    blacklistDeck: string;
    addToForq: boolean;
    enableReviews: boolean;
    twoButtonReviews: boolean;
    shortcuts: {
        scanPage: string;
        hoverLookup: string;
        openSettings: string;
        playAudio: string;
        closePopup: string;
        previousSubtitle: string;
        nextSubtitle: string;
        copySubtitle: string;
        toggleOcr: string;
        toggleYoutubeImmersion: string;
        scanImages: string;
        gradeNothing: string;
        gradeSomething: string;
        gradeHard: string;
        gradeOkay: string;
        gradeEasy: string;
        gradeFail: string;
        gradePass: string;
    };
}

declare global {
    const GM_xmlhttpRequest: undefined | ((details: {
        method?: string;
        url: string;
        headers?: Record<string, string>;
        data?: string | Blob | FormData | ArrayBuffer;
        responseType?: 'blob' | 'json' | 'text' | 'arraybuffer';
        timeout?: number;
        onload?: (response: { status: number; response: unknown; responseText?: string; finalUrl?: string }) => void;
        onprogress?: (event: { lengthComputable?: boolean; loaded: number; total: number }) => void;
        onerror?: (error: unknown) => void;
        ontimeout?: () => void;
    }) => void);
    const GM_setValue: undefined | ((key: string, value: unknown) => void | Promise<void>);
    const GM_getValue: undefined | (<T>(key: string, defaultValue: T) => T | Promise<T>);
    const GM_addStyle: undefined | ((css: string) => void);
    const GM_registerMenuCommand: undefined | ((name: string, fn: () => void) => void);
}
