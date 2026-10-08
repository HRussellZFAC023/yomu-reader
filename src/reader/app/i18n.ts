import { ACADEMY_SRS_LABEL, APP_NAME, SUPPORT_COPY, SUPPORT_COPY_EXTRA } from './constants';
import { loadJaGrammarRuleCopy } from './ja-grammar-rule-copy';
import { formatIsolated, isRtlInterface } from '../locales/direction';
import { GRAMMAR_UI_COPY } from '../study/grammar-copy';
import { SUBTITLE_SETTINGS_COPY } from './subtitle-settings-copy';
import { LOCAL_DICTIONARY_STORAGE_COPY } from './local-dictionary-storage-copy';
import { SETTINGS_RECOVERY_COPY } from './settings-recovery-copy';
import { PRACTICE_SESSION_COPY } from './practice-session-copy';
import { SAVE_WAIT_COPY } from './save-wait-copy';
import { GRADING_SERVICE_COPY } from './grading-service-copy';
import { COLLECTION_COPY } from './collection-copy';
import { OCR_STATUS_COPY } from './ocr-status-copy';
import type { AudioSourceType, InterfaceLanguage } from './types';
export { academyCopyHasMissingJapanese, academyText } from './academy-copy';
export type { AcademyCopyKey, AcademyLanguage } from './academy-copy';
type UiLanguage = 'en' | 'ja';
const COPY = {
    en: {
        ...PRACTICE_SESSION_COPY.en, ...COLLECTION_COPY.en,
        settingsTitle: `${APP_NAME} Settings`,
        manualPageScanShortcut: 'Manual page scan shortcut',
        scanPage: 'Scan page',
        noUnscannedJapaneseText: 'No unscanned Japanese text found.',
        statsEmptyHelp: 'Your reviews and progress show up here after your first session.',
        libraryEmpty: 'Save a word while you read and it shows up here.',
        audioSourcesTitle: 'Audio sources',
        contextOccurrences: 'In context ×{count}',
        puckAutoDetectSubtitles: 'Auto-detect subtitles',
        loadTargetSubtitles: 'Load Japanese subtitles',
        loadOutputSubtitles: 'Load English subtitles',
        jpdbScanFailed: 'Page scan failed.',
        pageCoverageSummary: '{percent}% known · {known}/{total} · {unknown} new · {iPlusOne} i+1',
        settings: 'Settings',
        settingsSaved: 'Settings saved.',
        settingsSaveFailed: 'Settings save failed.',
        settingsCompanionUnavailable: 'Settings could not be opened.', ...SETTINGS_RECOVERY_COPY.en, ...SAVE_WAIT_COPY.en,
        firefoxAuthenticationInfoDenied: 'Those account details were not saved because Firefox permission was not granted.',
        firefoxAuthenticationInfoExtensionPageRequired: 'Firefox can only ask for that permission on a Yomu page. Open Study, then add the account details in Settings.',
        settingsSections: 'Settings sections',
        settingsSearch: 'Search settings',
        settingsSearchPlaceholder: 'Search settings',
        settingsSearchNoResults: 'No matches.',
        accountSettingsTrustedSurfaceTitle: 'Open Settings in Study', accountSettingsTrustedSurfaceHelp: 'This page can read and change its own controls, so Yomu does not put settings, account details, imports, or recovery codes here. Open the Yomu-owned Study page to edit and save them safely.', openAccountSettingsTrustedSurface: 'Open Study settings',
        save: 'Save',
        cancel: 'Cancel',
        closeSettings: 'Close settings',
        settingsLauncherHelp: 'Settings open in Study, where this site can\'t read them.',
        openInStudy: 'Open in Study',
        show: 'Show',
        hide: 'Hide',
        appearance: 'Appearance',
        reading: 'Reading',
        dictionaries: 'Dictionaries',
        sources: 'Sources',
        backupSync: 'Backup & sync',
        media: 'Media',
        mining: 'Mining',
        shortcuts: 'Shortcuts',
        help: 'Help',
        reader: 'Reader',
        kanji: 'Kanji',
        audio: 'Audio',
        images: 'Image text (OCR)',
        video: 'Video',
        youTube: 'YouTube',
        anki: 'Anki',
        jpdb: 'JPDB',
        api: 'API',
        apiCredential: 'API key',
        apiCredentialJpdb: 'JPDB API key',
        apiCredentialJiten: 'Jiten API key',
        apiCredentialBunpro: 'Bunpro frontend API token',
        apiCredentialBunproLegacy: 'Bunpro API key',
        apiCredentialWanikani: 'WaniKani personal access token',
        apiKey: 'API key',
        jitenApiKey: 'Jiten API key',
        apiAccess: 'API access',
        storedCredentialPlaceholder: 'Saved — enter a replacement',
        clearStoredCredential: 'Remove saved credential',
        apiAccessHelp: 'Add each service credential here. Bunpro only needs the frontend token: import it from Bunpro settings, treat it like a password, and note that it is saved before it is verified. Academy reviews work locally without an account.',
        wanikaniTokenHelp: 'Create a read/write personal access token on WaniKani and paste it here. It is stored only in your browser, sent directly to api.wanikani.com (never through a proxy), and never logged.',
        jpdbSettings: 'JPDB settings',
        jitenSettings: 'Jiten settings',
        bunproSettings: 'Bunpro settings',
        wanikaniSettings: 'WaniKani settings',
        jpdbApiKeyConfigured: 'JPDB key set.',
        jpdbAndJitenApiKeysConfigured: 'Jiten and JPDB keys are set.',
        jpdbConnected: 'Connected to JPDB.',
        jpdbAndJitenConnected: 'Connected to Jiten and JPDB.',
        jpdbConnectionFailed: 'JPDB did not accept the key (network or invalid key).',
        statusReady: 'Ready',
        statusAttention: 'Needs setup',
        statusError: 'Error',
        disabledControlDescription: 'Controlled by another setting.',
        jpdbMiningEnabled: 'Allow API review/deck changes',
        bunproMiningEnabled: 'Allow Bunpro review/mining',
        wanikaniReviewEnabled: 'Allow WaniKani review (due assignments only)',
        wanikaniGradeMappingHelp: 'Yomu maps its grade to WaniKani’s pass/fail answer counts: Okay, Good, and Easy submit a clean pass. Anything below Okay submits one incorrect meaning answer and, unless the subject is a radical, one incorrect reading answer.',
        yomuLocalSrsEnabled: `Enable ${ACADEMY_SRS_LABEL}`,
        addToForq: 'Also copy JPDB adds to forq',
        enableReviews: 'Show review buttons',
        reviewRatingScale: 'Review rating scale',
        gradeTargetSelector: 'Grade target',
        gradeTargetBoth: 'Both',
        gradeTargetJpdb: 'Grades JPDB',
        gradeTargetJiten: 'Grades Jiten',
        gradeTargetBunpro: 'Grades Bunpro',
        gradeTargetWanikani: 'Grades WaniKani',
        gradeTargetYomuLocal: `Grades ${ACADEMY_SRS_LABEL}`,
        gradeTargetAnki: 'Grades Anki card: {target}',
        gradeTargetJpdbAndAnki: 'Grades JPDB + Anki card: {target}',
        gradeTargetJitenAndAnki: 'Grades Jiten + Anki card: {target}',
        gradeTargetBunproAndAnki: 'Grades Bunpro + Anki card: {target}',
        gradeTargetYomuLocalAndAnki: `Grades ${ACADEMY_SRS_LABEL} + Anki card: {target}`,
        missingAnkiCardId: 'Missing Anki card id.',
        jpdbPageEnhancements: 'Dictionary site enhancements',
        jpdbPageEnhancementsEnabled: 'Enhance JPDB and Jiten pages',
        jpdbPageWordEnhancementsEnabled: 'Add sources to word/search pages',
        jpdbPageKanjiEnhancementsEnabled: 'Add sources to kanji pages',
        fivePoint: 'Provider default',
        fourGradeShortcutsHelp: 'Four-grade reviews use the first four shortcuts: Again, Hard, Good, Easy.',
        twoPoint: 'Two point: FAIL / PASS',
        settingsLanguage: 'Settings language',
        automatic: 'Automatic',
        english: 'English',
        japanese: '日本語',
        theme: 'Theme',
        auto: 'Auto',
        dark: 'Dark',
        light: 'Light',
        switchToDarkTheme: 'Switch to dark theme',
        switchToLightTheme: 'Switch to light theme',
        popupMode: 'Popup mode',
        hoverPopupMode: 'Hover popup mode',
        bottomSheet: 'Bottom sheet',
        popover: 'Popover',
        stickyBottomSheet: 'Keep sheet open after lookup',
        popoverWidth: 'Popover width (px)',
        popoverHeight: 'Popover height (px)',
        popoverHeightMode: 'Popover height behavior',
        popoverHeightAvailable: 'Grow to available space',
        popoverHeightFixed: 'Use height setting',
        readerFontFamily: 'Reader interface font',
        popupFontFamily: 'Popup font',
        fontPresetYomuDefault: 'Built-in font',
        fontPresetJapaneseSans: 'Japanese sans',
        fontPresetHiraginoYuGothic: 'Hiragino / Yu Gothic',
        fontPresetJapaneseRounded: 'Japanese rounded',
        fontPresetJapaneseSerif: 'Japanese serif',
        fontPresetSystemUi: 'System UI',
        fontPresetCustom: 'Custom...',
        customFontFamily: 'Custom font stack',
        popupFontWeight: 'Popup font weight',
        enableLogging: 'Enable diagnostic logging',
        diagnostics: 'Diagnostics',
        diagnosticsHelp: 'Print diagnostics to the console.',
        accentColor: 'Accent color',
        newTab: 'Study',
        newTabAnkiEnabled: 'Use Anki cards in Study',
        newTabAnkiReviewDecks: 'Anki review decks',
        newTabAnkiReviewDecksHelp: 'Uncheck decks to skip.',
        newTabSource: 'Study review source',
        newTabAuto: 'Automatic',
        newTabApiSrs: 'API SRS (Jiten / JPDB)',
        newTabBunpro: 'Bunpro',
        newTabWanikani: 'WaniKani',
        newTabYomuLocal: ACADEMY_SRS_LABEL,
        dictionaryFallback: 'Dictionary fallback',
        newTabJpdbReviewMode: 'API review mode',
        newTabJpdbReviewAuto: 'Automatic',
        newTabLiveReview: 'Live JPDB review session',
        newTabApiVocabulary: 'API vocabulary only',
        corsProxyUrl: 'Cross-origin proxy URL',
        newTabKanjiKeywordSource: 'Kanji keyword source',
        newTabKanjiKeywordAuto: 'Automatic',
        newTabKanjiKeywordRtk: 'RTK / Heisig',
        newTabKanjiKeywordApiFacts: '{service} kanji facts (Jiten / JPDB)',
        newTabKanjiKeywordLocal: 'Local card meaning',
        newTabParsingEnabled: 'Enable sentence parsing on Study',
        newTabFrontSentenceEnabled: 'Show sentence on word fronts',
        newTabKanjiAutogradeEnabled: 'Auto-grade kanji drawing',
        newTabOfflineEnabled: 'Cache Study for offline use',
        newTabOfflineLimit: 'Offline review cache limit',
        newTabDailyGoalMinutes: 'Daily study goal (minutes, 0 = off)',
        newTabKanjiUnlockEnabled: 'Study kanji before unlocking words',
        newTabStopAtBatchEnd: 'Stop at the end of each batch',
        newTabSwipeReviews: 'Swipe cards to grade (left = fail, right = pass)',
        newTabShortcutHintsEnabled: 'Show Study keyboard shortcut hints',
        newTabOfflineHelp: 'Caches due cards and queued grades.',
        newTabJpdbDeck: 'Study JPDB deck',
        wordColors: 'Word colors',
        wordColorNew: 'New and in deck',
        wordColorLearning: 'Learning',
        wordColorKnown: 'Known and never forget',
        wordColorDue: 'Due',
        wordColorFailed: 'Failed',
        wordColorIgnored: 'Ignored, suspended, and blacklisted',
        pitchAccentColors: 'Pitch accent colors',
        pitchColorHeiban: 'Heiban (flat)',
        pitchColorAtamadaka: 'Atamadaka (head-high)',
        pitchColorNakadaka: 'Nakadaka (middle-high)',
        pitchColorOdaka: 'Odaka (tail-high)',
        pitchColorUnknown: 'Unknown',
        pronunciation: 'Pronunciation',
        noExactPitch: 'Exact pitch unavailable',
        colorChannels: 'Color channels',
        wordHighlightColorSource: 'Word highlight color',
        wordUnderlineColorSource: 'Word underline color',
        wordTextColorSource: 'Word text color',
        subtitleHighlightColorSource: 'Subtitle highlight color',
        subtitleUnderlineColorSource: 'Subtitle underline color',
        subtitleTextColorSource: 'Subtitle text color',
        colorSourceStatus: 'All study statuses',
        colorSourceJpdb: 'Primary deck status',
        colorSourceAnki: 'Anki status',
        colorSourcePitch: 'Pitch accent',
        colorSourceNone: 'None',
        popupLookup: 'Popup lookup',
        popupLookupEnabled: 'Show Yomu lookup popup',
        popupLookupHelp: "Off for another reader's popups. Yomu tools stay on.",
        lookupOnClick: 'Look up on tap or click',
        lookupOnHover: 'Look up on hover',
        lookupOnMiddleMouse: 'Look up with middle-mouse hold',
        showFloatingButton: 'Show settings puck',
        pageScanMode: 'Japanese text on webpages',
        pageScanModeAuto: 'Scan Japanese automatically',
        pageScanModeManual: 'Scan only when I ask',
        manualScanEnabled: 'Manual page scanning',
        ocrInteractionMode: 'Image OCR scanning',
        ocrInteractionModeAuto: 'Auto',
        ocrInteractionModeManual: 'Tap or hover',
        ocrInteractionModeOff: 'Off',
        puckMenuLabel: `${APP_NAME} menu`,
        puckPowerOnFurigana: `${APP_NAME} on · furigana shown`,
        puckPowerOnNoFurigana: `${APP_NAME} on · furigana hidden`,
        puckPowerOff: `${APP_NAME} off`,
        puckOcrAuto: 'OCR: Auto',
        puckOcrManual: 'OCR: Tap/Hover',
        puckOcrOff: 'OCR: Off',
        autoplayAudioOn: 'Auto-play audio on',
        autoplayAudioOff: 'Auto-play audio off',
        showFurigana: 'Enable furigana annotations',
        furiganaMode: 'Furigana',
        wordColorStates: 'Color words',
        appearancePreset: 'Quick setup',
        appearancePresetCustom: 'Custom',
        appearancePresetBalanced: 'Balanced reading',
        appearancePresetNoColors: 'Plain text',
        appearancePresetNewOnly: 'Focus on new words',
        appearancePresetUnderlineNew: 'Minimal highlights',
        wordColorStatesAll: 'All learning states',
        wordColorStatesNewOnly: 'Only new / not-in-deck words',
        hideFuriganaFor: 'Hide furigana for',
        hideColorFor: 'Hide color for',
        furiganaDifficultKanji: 'Hard kanji only',
        furiganaDifficultKanjiHelp: `${APP_NAME} keeps a fixed beginner kanji list and shows readings on everything outside it. A bare kanji means that character sits on the list.`,
        statusColorNoSourceHelp: `Status colors read from a deck. Enable ${ACADEMY_SRS_LABEL} in Study, or add a JPDB, Jiten, or Anki source, and words take the color of their learning state.`,
        furiganaHideKnown: 'Hide familiar words',
        furiganaHoverOnly: 'Show on hover',
        furiganaAllParsed: 'All parsed words',
        clampedRowReadings: 'Readings on clamped rows',
        clampedRowReadingsShow: 'Show (row grows)',
        clampedRowReadingsHover: 'Hover only',
        showPitchAccent: 'Show pronunciation',
        showLookupPillFrequency: 'Show site frequency in pills',
        suppressRedundantWordUi: 'Hide JPDB-redundant styling',
        sheetCloseButtonOnLeft: 'Sheet close button on left',
        hideKnownFurigana: 'Hide furigana for known cards only',
        readerHelp: 'Set a hover key. Blank means plain hover.',
        hoverLookupSettings: 'Hover lookup',
        kanjiOriginKanjiMapEnabled: 'Show kanji facts and component graph',
        kanjiOriginGraphEnabled: 'Show component graph',
        kanjiOriginRadicalImagesEnabled: 'Show radical images',
        noSimilarWords: 'No additional words found.',
        audioEnabled: 'Enable term audio',
        autoPlayAudio: 'Auto-play term audio',
        suppressAutoAudioOnVideo: 'Disable lookup audio on video pages',
        audioAutoPlayMode: 'Auto-play term audio',
        audioEnableDefaultSources: 'Enable built-in audio sources',
        audioFallbackChimeEnabled: 'Enable fallback chime',
        audioPlayback: 'Audio playback',
        audioTtsMode: 'Text-to-speech handling',
        audioTtsFallback: 'Fallback after recorded audio',
        audioTtsSourceOrder: 'Follow source order / shuffle',
        previewAudio: 'Preview audio',
        audioHelp: 'URL tokens: {term}, {reading}, {language}.',
        audioSource: 'Audio source',
        urlVoice: 'URL / voice',
        addAudioSource: 'Add audio source',
        audioAutoPlayAll: 'Hover and tap/click',
        audioAutoPlayHover: 'Hover only',
        audioAutoPlayTap: 'Tap/click only',
        automaticBrowserVoice: 'Automatic browser voice',
        savedVoiceLabel: 'Saved voice: {voice}',
        audioSourceOrder: 'Audio source order',
        audioSourceNumber: 'Audio source {number}',
        enableAudioSourceNumber: 'Enable audio source {number}',
        enableLookupPillName: 'Enable lookup pill: {name}',
        enableSourceName: 'Enable source: {name}',
        textToSpeechVoiceNumber: 'Text-to-speech voice {number}',
        audioSourceJpod101: 'JapanesePod101',
        audioSourceLanguagePod101: 'LanguagePod101',
        audioSourceJisho: 'Jisho.org',
        audioSourceBunpro: 'Bunpro',
        audioSourceLinguaLibre: '(Commons) Lingua Libre',
        audioSourceWiktionary: '(Commons) Wiktionary',
        audioSourceJitenTts: 'Jiten text-to-speech',
        audioSourceJpdbTts: 'JPDB text-to-speech',
        audioSourceTextToSpeech: 'Text-to-speech',
        audioSourceTextToSpeechReading: 'Text-to-speech (reading)',
        audioSourceCustom: 'Custom direct audio file URL',
        audioSourceCustomJson: 'Custom URL',
        audioCustomJsonPlaceholder: 'Yomitan or Ultimate audio source URL',
        audioCustomUrlPlaceholder: 'Direct audio file URL',
        audioBuiltInPlaceholder: 'Built-in source, no URL needed',
        audioDetectingSubSources: 'Checking included sources…',
        audioNoSubSourcesDetected: 'No named sources reported by this URL.',
        audioSubSourcesHelp: 'Sources offered by this URL — untick any you don’t want:',
        audioSubSourceOverlapHint: 'also listed as its own source',
        defaultVoiceSuffix: 'default',
        audioGuideLinkLabel: 'Yomitan audio guide',
        audioProxyDeployGuide: 'Proxy setup',
        immersionKit: 'Immersion Kit',
        immersionKitEnabled: 'Show Immersion Kit examples',
        immersionKitExampleSource: 'Example provider',
        immersionKitAndNadeshiko: 'Immersion Kit + Nadeshiko',
        nadeshikoApiKey: 'Nadeshiko API key',
        getNadeshikoKey: 'Get a key',
        immersionKitShowTranslation: 'Show example translations',
        immersionKitRevealTranslationOnClick: 'Blur example translations until clicked',
        immersionKitShowImages: 'Show example thumbnails',
        immersionKitAutoPlayAudio: 'Play example audio after reveal or next/previous',
        immersionKitPlayOnHover: 'Play example audio when hovering thumbnails',
        immersionKitPlayOnImageClick: 'Play example audio when clicking thumbnails',
        immersionKitLimitEnabled: 'Examples per word limit',
        immersionKitLimit: 'Examples per word (0 = all)',
        immersionKitPlaybackRate: 'Example audio speed',
        immersionKitHelp: 'Examples appear in popups. Nadeshiko needs a key.',
        loadingExamples: 'Loading examples...',
        noImmersionExamplesCompact: 'No examples',
        immersionKitRateLimited: 'Immersion Kit rate-limited; retrying later.',
        immersionKitRequest: 'Immersion Kit request',
        immersionKitRequestFailed: 'Immersion Kit request failed.',
        immersionKitRequestFailedWithStatus: 'Immersion Kit request failed ({status}).',
        immersionKitRequestTimedOut: 'Immersion Kit request timed out.',
        immersionKitSearchBlocked: 'Immersion Kit blocked. Configure CORS.',
        immersionKitMediaRequest: 'Media request',
        immersionKitMediaRequestFailed: 'Media request failed.',
        immersionKitMediaRequestFailedWithStatus: 'Media request failed ({status}).',
        immersionKitMediaRequestTimedOut: 'Media request timed out.',
        immersionKitMediaRequestReturnedNonMedia: 'Media request returned an error page.',
        immersionKitNoMediaCandidate: 'No Immersion Kit media loaded.',
        nadeshikoRequest: 'Nadeshiko request',
        nadeshikoRequestFailed: 'Nadeshiko request failed.',
        nadeshikoRequestFailedWithStatus: 'Nadeshiko request failed ({status}).',
        nadeshikoRequestTimedOut: 'Nadeshiko request timed out.',
        previousExample: 'Previous example',
        nextExample: 'Next example',
        playExampleAudio: 'Play example audio',
        anime: 'Anime',
        drama: 'Drama',
        games: 'Games',
        ocrEnabled: 'Read text in images',
        ocrAutoScanImages: 'Read images automatically',
        ocrShowTextOverlay: 'Show recognized text areas',
        ocrVideoPauseFrames: 'Auto-read paused video frames',
        ocrInvertDarkPanels: 'Read light text on dark panels',
        ocrProvider: 'Image reading',
        ocrOverlayTheme: 'OCR overlay theme',
        ocrOverlayThemeAuto: 'Match app theme',
        ocrOverlayThemeLight: 'Light overlay',
        ocrOverlayThemeDark: 'Dark overlay',
        googleLens: 'Google Lens (free, recommended)',
        cloudVision: 'Google Cloud Vision (API key)',
        localOcr: 'Local OCR server',
        off: 'Off',
        ocrMaxImagesPerPage: 'Images to read per page',
        ocrMinImageArea: 'Smallest image to read',
        ocrMaxImagePixels: 'Image detail',
        lightWork: 'Light',
        normal: 'Normal',
        more: 'More',
        largeOnly: 'Large images only',
        includeSmall: 'Include small images',
        faster: 'Faster',
        balanced: 'Balanced',
        sharper: 'Sharper',
        ocrTextColor: 'Image text color',
        ocrOutlineColor: 'Image text outline',
        ocrBackgroundOpacity: 'Image highlight opacity',
        ocrFontScale: 'Image text scale',
        ocrEndpointUrl: 'Local OCR server URL',
        ocrEngine: 'Local OCR engine',
        ocrEngineMangaOcr: 'MangaOCR (best for manga)',
        ocrEngineAppleVision: 'Apple Vision (macOS)',
        cloudVisionApiKey: 'Google Cloud Vision API key',
        ocrHelp: 'Reads nearby images. Google Lens needs no setup.',
        ocrCloudHelp: 'Paste a Google Cloud Vision API key.',
        ocrLocalHelp: 'Run MangaOCR/Apple Vision locally and enter its URL.',
        ...SUBTITLE_SETTINGS_COPY.en,
        right: 'Right',
        left: 'Left',
        bottom: 'Below',
        showWhenNeeded: 'Compact controls',
        hideControls: 'Hide controls',
        alwaysVisible: 'Always visible',
        preview: 'Preview',
        youtubeImmersionEnabled: 'Japanese YouTube only',
        preferJapaneseSiteLanguage: 'Request Japanese sites',
        youtubeShowChannelRecommendations: 'Show Japanese channel suggestions',
        youtubeShowFilterNotice: 'Show hidden-video notice',
        youtubeHelp: 'Filter YouTube for Japanese.',
        youtubeShowHiddenVideos: 'Show hidden videos',
        youtubeHideHiddenVideos: 'Hide hidden videos',
        youtubeHideNotice: 'Hide notice',
        youtubeFilterShowing: '{appName} shows {count} hidden item{plural}',
        youtubeFilterHid: '{appName} hid {count} other-language item{plural}',
        youtubeFilterVisible: '{count} Japanese items stayed visible.',
        youtubeToggleToastOn: 'YouTube immersion filter enabled.',
        youtubeToggleToastOff: 'YouTube immersion filter disabled.',
        ankiEnabled: 'Enable Anki mining',
        ankiMineWithJpdb: 'Also add to Anki when adding via API',
        ankiCaptureScreenshot: 'Attach context image when possible',
        ankiConnectUrl: 'AnkiConnect URL',
        ankiDeck: 'Anki deck',
        ankiModel: 'Anki note type',
        mobileAnkiHandoff: 'Mobile Anki add-note fallback',
        ankiTemplateMode: 'Anki card template',
        ankiFrontReading: 'Show reading on word-first front',
        ankiFrontSentence: 'Show sentence on word-first front',
        ankiFrontImage: 'Show image on front',
        wordFirst: 'Word first',
        sentenceFirst: 'Sentence first',
        ankiTags: 'Tags',
        sentenceFirstPreset: 'Sentence first preset',
        wordFirstPreset: 'Word first preset',
        front: 'Front',
        back: 'Back',
        imageAbovePrompt: 'Image appears above the prompt when available.',
        recallHighlightedWord: 'Recall the highlighted word from context.',
        imageOnFront: 'Image appears on the front when available.',
        recallMeaning: 'Recall the meaning first.',
        ankiBackIncludes: 'Includes dictionary, kanji, pitch, source, image.',
        exampleMeaning: 'to read',
        scanAnkiFirst: 'Connect Anki first',
        notMapped: 'Not mapped',
        noScannedFields: 'Check AnkiConnect to load this note type\'s fields.',
        mappingForNoteType: 'Mapping for {model}',
        currentNoteType: 'current note type',
        ankiFieldMappingSelect: '{role} field',
        ankiRoleExpression: 'Expression',
        ankiRoleReading: 'Reading',
        ankiRoleMeaning: 'Meaning',
        ankiRoleSentence: 'Sentence',
        ankiRoleAudio: 'Word audio',
        ankiRoleSentenceAudio: 'Sentence audio',
        ankiRoleImage: 'Image',
        testAnki: 'Check AnkiConnect',
        prepareAnki: 'Set up Yomu note type',
        updateAnkiModel: 'Update note type',
        ankiModelUpdateAvailable: 'New fields are ready for "{model}": {fields}.',
        ankiModelUpdating: 'Adding note type fields...',
        ankiModelUpdated: 'Note type updated. Added {fields}.',
        ankiModelUpToDate: 'Note type is up to date.',
        ankiCheckingConnection: 'Checking AnkiConnect at {url}.',
        ankiMiningDisabledStatus: 'Anki mining disabled.',
        ankiTesting: 'Checking AnkiConnect...',
        ankiPreparing: 'Setting up Yomu deck and note type...',
        ankiScanning: 'Reading decks, note types, fields...',
        ankiScanSummary: 'Decks {decks}, types {models}. Best: {model}. {fields}',
        ankiScanNoModels: 'Found {decks} decks. Note types unavailable.',
        ankiScanFieldSummary: 'Fields: {fields}',
        ankiUnreachable: 'Open desktop Anki and check again.',
        ankiCorsBlocked: 'Add "{origin}" to webCorsOriginList; restart Anki.',
        ankiSettingsUnreachable: 'AnkiConnect not reached.',
        ankiHostedBridgeMissing: `Enable ${APP_NAME}, refresh, then check again.`,
        ankiStatusOpenDesktop: 'Open desktop Anki',
        ankiStatusInstallAddon: 'Install/enable AnkiConnect',
        ankiStatusMobileDocs: 'Mobile setup docs',
        ankiStatusUseDesktopUrl: 'Use the LAN/Tailscale URL on mobile',
        ankiStatusEnableUserscript: `Enable installed ${APP_NAME}`,
        ankiStatusRefreshAndCheck: 'Refresh and check',
        ankiHostedCorsHint: 'Add {origin} to webCorsOriginList.',
        ankiLibraryAdapter: 'Existing library adapter',
        ankiLibraryAdapterStatus: 'Scans decks/types and suggests mappings.',
        ankiLibraryChoices: 'Deck and note type',
        ankiLibraryChoicesHelp: 'Pick where mining saves notes.',
        ankiTemplateSettings: 'Yomu card template',
        ankiTemplateSettingsHelp: 'For Yomu note types. Templates stay in Anki.',
        ankiMappingConfidenceHelp: 'Based on fields/samples. Edit weak mappings.',
        ankiMappingHighConfidence: 'High',
        ankiMappingMediumConfidence: 'Medium',
        ankiMappingLowConfidence: 'Low',
        ankiHelp: 'Install AnkiConnect and keep desktop Anki open. If CORS appears, add this site to webCorsOriginList. Mobile handoff creates notes only.',
        jpdbDefinitionsEnabled: 'Show JPDB definitions',
        ...LOCAL_DICTIONARY_STORAGE_COPY.enSettings,
        localDictionaryMaxResults: 'Dictionary result limit',
        cloudSettingsSync: 'Google Drive settings sync',
        cloudSettingsSyncHelp: 'Stores your Yomu settings and local SRS progress in Google Drive app data. Dictionaries stay local.',
        academyAccountSync: 'Academy account sync',
        academyAccountSyncHelp: 'Keep Academy SRS progress in sync across the Reader and your signed-in Yomu account. Create or manage your account on the website, then generate a one-time pairing code.',
        academyAccountManage: 'Manage account & pairing code',
        academyPairingCode: 'One-time pairing code',
        academyPairingCodePlaceholder: 'XXXX-XXXX-XXXX-XXXX-XXXX',
        academyAccountConnect: 'Connect',
        academyAccountSyncNow: 'Sync now',
        academyRecoveryCodeCreate: 'Create website recovery code',
        academyRecoveryCodeCreating: 'Creating a one-time website recovery code...',
        academyRecoveryCodeReady: 'Website recovery code: {code}. Enter it in Profile & sync within 10 minutes.',
        academyRecoveryCodeDone: 'Website recovery code created.',
        academyAccountDisconnect: 'Disconnect',
        academyAccountChecking: 'Checking Academy account connection...',
        academyAccountDisconnected: 'Not connected. Academy reviews stay on this device until you connect an account.',
        academyAccountConnected: 'Connected as {name}.',
        academyAccountConnectedNoName: 'Academy account connected.',
        academyAccountLastSynced: 'Last synced {time}.',
        academyAccountNeverSynced: 'Not synced yet.',
        academyAccountConnectionProblem: 'Could not refresh the account status: {message}',
        academyAccountConnecting: 'Connecting and syncing Academy progress...',
        academyAccountSyncing: 'Syncing Academy progress...',
        academyAccountDisconnecting: 'Disconnecting this Reader...',
        academyPairingCodeRequired: 'Enter the one-time pairing code from your Yomu account.',
        academyAccountConnectedDone: 'Academy account connected and progress synced.',
        academyAccountSyncedDone: 'Academy progress synced.',
        academyAccountDisconnectedDone: 'This Reader is disconnected. Local Academy progress is still available.',
        importSettings: 'Import settings JSON',
        exportSettings: 'Export settings JSON',
        importDictionaries: 'Import dictionaries',
        exportDictionaries: 'Export dictionaries',
        lookupPills: 'Lookup pills',
        lookupPillsHelp: 'External links and frequency badges in one order. Local frequency dictionaries replace matching live Jiten/JPDB badges. Tokens: {query}, {word}, {reading}.',
        parserProvider: 'Parsing source',
        parserProviderLocal: 'Local dictionaries (offline)',
        parserProviderJiten: 'Jiten API',
        parserProviderJpdb: 'JPDB API',
        parserProviderAuto: 'Automatic (Jiten/JPDB)',
        parserProviderHelp: 'Local parses with imported dictionaries, offline. Jiten and JPDB always use that API when its key is set. Automatic uses your preferred grading service when both keys are set, otherwise Jiten, then JPDB.',
        copiesCurrentWord: 'Copies the current word',
        plaintextHttpLink: 'Opens over plaintext HTTP.',
        lookupPillLabelNumber: 'Lookup pill {number} label',
        lookupUrlTemplate: 'Lookup URL template',
        lookupUrlTemplateNumber: 'Pill {number} URL',
        lookupPillOrder: 'Lookup pill order',
        builtInAction: 'Built-in action',
        recommendedDownloads: 'Dictionaries',
        termDictionaries: 'Term dictionaries',
        kanjiDictionaries: 'Kanji dictionaries',
        pitchDictionaries: 'Pitch dictionaries',
        pronunciationDictionaries: 'Pronunciation dictionaries',
        frequencyDictionaries: 'Frequency dictionaries',
        nameDictionaries: 'Name dictionaries',
        grammarDictionaries: 'Grammar dictionaries',
        exampleDictionaries: 'Example sentence dictionaries',
        thesaurusDictionaries: 'Thesauruses',
        encyclopediaDictionaries: 'Encyclopedias',
        utilityDictionaries: 'Utility dictionaries',
        mirroredDictionaries: 'All mirrored dictionaries',
        mirroredDictionariesSummary: '{count} more dictionaries · {size} total',
        mirroredDictionarySearch: 'Search dictionaries',
        mirroredDictionarySearchNoResults: 'No dictionaries match your search.',
        install: 'Install',
        installing: 'Installing',
        installed: 'Installed',
        queued: 'Queued',
        dictionaryGuide: 'Guide',
        saveAfterInstall: 'Save after install',
        download: 'Download',
        update: 'Update',
        checkingDictionaries: 'Checking imported dictionaries...',
        dictionaryDownloading: 'Downloading',
        dictionaryReadingZip: 'Reading dictionary ZIP...',
        dictionaryCheckingIndex: 'Checking index...',
        dictionaryBanksFound: '{count} bank{plural} found.',
        dictionaryRemovingExisting: 'removing old entries',
        dictionaryReadingBank: 'Reading',
        dictionaryParsingBank: 'Parsing',
        dictionarySavingBank: 'Saving',
        dictionaryImporting: 'Importing',
        importingBundledDictionaries: 'Importing bundled dictionaries...',
        dictionaryImported: 'Imported',
        dictionaryPreparingImport: 'Preparing import',
        dictionaryRecords: 'dictionary records',
        dictionaryEntries: 'entries',
        dictionaryTotal: 'total',
        dictionaryDownloadProgress: 'Downloading',
        dictionaryStatusSummary: 'Dicts {dictionaries}, terms {terms}, kanji {kanji}, meta {metadata}',
        dictionaryStatusUnavailable: 'Unavailable.',
        noLocalDictionariesImported: 'No dictionaries imported yet. Start with a term dictionary for definitions.',
        dictionaryDownloadFailed: 'Dictionary download failed.',
        storageRuntimeUnavailable: 'よむ storage is unavailable. Reload the page; if this continues, reinstall よむ.',
        dictionaryDownloadTimedOut: 'Dictionary download timed out.',
        dictionaryDownloadNotZip: 'Download was not a ZIP.',
        dictionaryStorageFull: 'Not enough storage space for this dictionary. Free up space or remove a dictionary, then try again.',
        dictionaryDownloadNeedsBridge: 'Download needs bridge; else import ZIP.',
        dictionaryDownloadBlocked: 'Download blocked. Import the ZIP.',
        dictionaryManualDownloadHint: 'Enable userscript or import the ZIP.',
        dictionaryInstallQueueHelp: 'Install a term dictionary first for definitions. Pronunciation (IPA), Japanese pitch, and frequency dictionaries add pronunciations, pitch accents, and badges, not normal definition text.',
        dictionaryInstallQueued: '{dictionary} queued.',
        dictionaryInstallSaveBlocked: 'Import running. Save unlocks when done.',
        dictionaryImportQueueStatus: '{count} install{plural} running.',
        dictionaryInstallRunning: '{count} install{plural} running.',
        dictionaryRemoveConfirm: 'Remove "{dictionary}"?',
        dictionaryRemoving: 'Removing {dictionary}...',
        dictionaryRemoved: 'Removed {dictionary}.',
        ...LOCAL_DICTIONARY_STORAGE_COPY.enImport,
        dictionaryRecordsImported: '{dictionary}: {records} records.',
        settingsImported: 'Settings imported.',
        settingsImportedWithDetails: 'Settings imported; {details}.',
        settingsExported: 'Settings exported.',
        restoredStoredChoices: 'restored {count} stored choice{plural}',
        importedDictionaryRecordCount: 'imported {count} dictionary record{plural}',
        dictionaryNoSupportedBanks: 'No supported banks found.',
        dictionaryUnsupportedJson: 'Use Dexie, ZIP, or export.',
        dictionaryZipMissingIndex: 'ZIP missing index.json.',
        localWordSingular: 'entry',
        localWordPlural: 'entries',
        decksLoaded: 'Decks are loaded from your JPDB account.',
        decksUnavailable: 'Could not load decks; saved IDs kept.',
        addApiKeyChooseDecks: 'Add your JPDB API key to choose decks.',
        miningDeck: 'Mining deck',
        neverForgetDeck: 'Never forget deck',
        blacklistDeck: 'Blacklist deck',
        allStudyDecks: 'All study decks',
        savedValue: 'Saved: {value}',
        holdWhileHovering: 'Hold while hovering',
        hoverOpenDelayMs: 'Hover open delay (ms)',
        hoverCloseDelayMs: 'Hover close delay (ms)',
        pressKeys: 'Press keys',
        blankPlainHover: 'Blank = hover, no key',
        openSettings: 'Open settings',
        resizeSettings: 'Resize settings',
        playAudio: 'Play audio',
        playingAudioPreview: `Playing ${APP_NAME}...`,
        audioPreviewFailed: 'Audio preview failed.',
        audioPlaybackDisabled: 'Audio playback is disabled',
        audioPlaybackDisabledToast: 'Audio playback is disabled.',
        audioPlaybackFailed: 'Audio playback failed.',
        noSentenceToRead: 'No sentence to read aloud.',
        noTextToRead: 'No text to read aloud.',
        jpdbExampleAudioUnavailable: 'No JPDB audio is available for this example.',
        jpdbAudioPlayableFileMissing: 'JPDB audio returned no playable file.',
        jpdbAudioResponseNotPlayable: 'JPDB audio was not playable.',
        audioSourceReturnedNoAudio: 'Audio source did not return audio.',
        audioJsonMissingPlayableUrl: 'Audio JSON had no playable URL.',
        textToSpeechUnavailable: 'Text-to-speech is unavailable.',
        textToSpeechFailed: 'Text-to-speech failed.',
        audioRequest: 'Audio request',
        audioRequestTimedOut: 'Audio request timed out.',
        audioRequestReturnedNonAudioWithType: 'Audio request returned non-audio: {type}.',
        audioUnknownContentType: 'an unknown content type',
        japanesePod101NoAudio: 'JapanesePod101 has no audio for this term.',
        invalidJpdbAudioId: 'Invalid JPDB audio id.',
        couldNotReadAudio: 'Could not read audio.',
        couldNotReadAudioBlob: 'Could not read audio blob.',
        closeDrawer: 'Close drawer',
        closePopup: 'Close popup',
        previousLookupWord: 'Previous word',
        nextLookupWord: 'Next word',
        previousSubtitle: 'Previous subtitle',
        nextSubtitle: 'Next subtitle',
        jumpToCurrentSubtitle: 'Jump to current subtitle',
        pauseVideo: 'Pause video',
        readVideoFrame: 'Read video frame (OCR)',
        readVideoFrameStop: 'Stop reading video frames (OCR)',
        copySubtitle: 'Copy subtitle',
        subtitleFallbackLabel: 'Subtitle',
        subtitlesTitle: 'Subtitles',
        openSubtitlePanel: 'Open subtitle panel',
        closeSubtitlePanel: 'Close subtitle panel',
        subtitleStyle: 'Subtitle style',
        subtitleResetDefaults: 'Reset defaults',
        enableSubtitleAutoHide: 'Auto-hide panel while playing',
        disableSubtitleAutoHide: 'Keep panel open while playing',
        subtitlePanelOptions: 'Panel options',
        searchAnimeSubtitles: 'Search anime subtitles',
        toggleNativeSubtitleBlur: 'Toggle native subtitle blur',
        subtitleTrackDetectedSingular: '1 subtitle track detected',
        subtitleTracksDetected: 'subtitle tracks detected',
        noSubtitleTracksDetected: 'No subtitle tracks detected yet.',
        resizeTranscriptPanel: 'Resize transcript panel',
        resizeSubtitleTracksPanel: 'Resize subtitle tracks panel',
        subtitlePanelMode: 'Mode',
        subtitleLines: 'Lines',
        shadow: 'Shadow',
        subtitleTracks: 'Tracks',
        subtitleTrackTiming: 'Subtitle timing',
        subtitleOffsetPrevious: 'Align previous subtitle to current time',
        subtitleOffsetNext: 'Align next subtitle to current time',
        subtitleOffsetPreviousShort: 'Prev',
        subtitleOffsetNextShort: 'Next',
        subtitleOffsetEarlier: 'Show subtitles 100 ms earlier',
        subtitleOffsetLater: 'Show subtitles 100 ms later',
        resetSubtitleOffset: 'Reset subtitle timing',
        copySubtitleLine: 'Copy subtitle line',
        subtitleCopyIncludeTranslation: 'Copy line translation too',
        peekSubtitleTranslation: 'Show translation',
        hideSubtitleTranslation: 'Hide translation',
        loadingSubtitleLines: 'Loading subtitle lines',
        waitingForCaptionLines: 'Waiting for caption lines',
        subtitleCurrentLineWillAppear: 'Current line appears when captions load.',
        seekSubtitleLine: 'Seek subtitle line',
        subtitleTracksHint: 'Choose a primary track. Use Lines to jump.',
        autoDetectedTracksWillAppear: 'Subtitle tracks appear here.',
        autoDetectedOptionSingular: '1 subtitle option',
        autoDetectedOptions: 'subtitle options',
        detected: 'Detected',
        primaryOverlay: 'primary overlay',
        nativeOverlay: 'native overlay',
        unsetPrimarySubtitles: 'Unset primary',
        primarySubtitles: 'Primary',
        unsetNativeSubtitles: 'Unset native',
        nativeSubtitles: 'Native',
        choosePrimarySubtitles: 'Choose primary subtitles',
        transcript: 'Transcript',
        subtitleOptionSingular: 'option',
        subtitleOptionPlural: 'options',
        subtitleLineSingular: 'line',
        subtitleLinePlural: 'lines',
        trackKindPageTrack: 'page track',
        trackKindPageFile: 'page file',
        trackKindYouTubeCaptions: 'YouTube captions',
        youTubeSubtitles: 'YouTube subtitles',
        autoGeneratedSubtitle: 'auto-generated',
        trackKindLoadedFile: 'loaded file',
        trackStatusLoading: 'loading',
        trackStatusWaiting: 'waiting for captions',
        trackStatusFailed: 'failed',
        moveSubtitles: 'Move subtitles',
        moveSubtitlesAccessible: 'Move subtitles. Drag, or use the arrow and Page Up/Page Down keys. Press Home or 0 to reset.',
        moveSubtitleControls: 'Subtitle controls. Tap to expand or collapse. Drag, or use the arrow keys, to move. Press Home or 0 to reset.',
        toggleImageReading: 'Toggle image reading',
        toggleSubtitleOverlay: 'Toggle subtitle overlay',
        toggleYoutubeImmersion: 'Toggle YouTube filter',
        readImagesNow: 'Read images now',
        massReviewVisible: 'Mass review visible words (Jiten)',
        studyReveal: 'Study: reveal card',
        studyRevealAlternate: 'Study: reveal card (alternate)',
        studyUndo: 'Study: undo last review',
        studyPrevious: 'Study: previous card',
        studyPreviousAlternate: 'Study: previous card (alternate)',
        studyNext: 'Study: next card',
        studyNextAlternate: 'Study: next card (alternate)',
        massReviewNoWords: 'No due Jiten words on screen.',
        massReviewNoKey: 'Add a Jiten API key to mass review.',
        massReviewDone: 'Reviewed {count} words as Good.',
        massReviewFailed: 'Mass review failed.',
        adapterStateDisabled: 'Off',
        adapterStateProbing: 'Probing',
        adapterStateUnreachable: 'Unreachable',
        adapterStateConnected: 'Connected',
        adapterStateScanning: 'Scanning',
        adapterStateSuggested: 'Mapped',
        adapterStateStale: 'Needs review',
        adapterStateReady: 'Ready',
        ankiMappingConfidenceHigh: 'high match',
        ankiMappingConfidenceMedium: 'fuzzy match',
        ankiMappingConfidenceLow: 'unmapped',
        ankiMappingStaleField: 'saved field missing',
        ...OCR_STATUS_COPY.en,
        gradeNothing: 'Grade NOTHING',
        gradeSomething: 'Grade SOMETHING',
        gradeHard: 'Grade HARD',
        gradeOkay: 'Grade OKAY',
        gradeEasy: 'Grade EASY',
        gradeFail: 'Pass/fail: FAIL',
        gradePass: 'Pass/fail: PASS',
        helpLinksTitle: 'Useful pages',
        versionAndUpdates: 'Version',
        currentYomuVersion: 'Yomu',
        updateStatusIdle: 'Current {current}. Latest check pending.',
        updateStatusChecking: 'Current {current}. Checking latest...',
        updateStatusCurrent: 'Current {current}. Latest {latest}. Up to date.',
        updateStatusAvailable: 'Current {current}. Latest {latest}. Update available.',
        updateStatusUnknown: 'Current {current}. Latest check failed; reinstall if needed.',
        updateStatusIncomparable: 'Current {current}. Latest {latest}. Cannot compare versions; use Update if this install is old.',
        updateHelpNotesManager: 'Keep one Yomu script enabled. Update opens your userscript manager’s install screen. If the browser shows a blocked-install banner instead, open your extensions page, open the manager’s details, and turn on "Allow user scripts" (or Developer mode), then retry.',
        updateHelpNotesManagerDashboard: 'On Chrome or Edge, Update opens the Tampermonkey dashboard instructions: Utilities → Check for userscript updates. This avoids the browser’s blocked website-install banner.',
        updateHelpNotesExternalManager: 'Keep one Yomu script enabled. Update opens the script source; your userscript app reads it from the open tab to update. If updates stall on iPhone/iPad, open this link in Safari and leave the tab open.',
        updateHelpNotesNoManager: 'No userscript manager was detected here, and browsers block direct script installs — Update opens the install guide with per-browser steps.',
        updateHelpNotesExtensionStore: 'Updates come from the browser extension store.',
        updateUserscript: 'Update',
        duplicateStatusSingle: 'One Yomu runtime active ({kind}).',
        duplicateStatusUnknown: 'Duplicate check unavailable. If Yomu appears twice, disable the older script.',
        ankiConnectSetupTitle: 'AnkiConnect setup',
        ankiConnectSetupCopy: 'Keep desktop Anki open with AnkiConnect enabled. Hosted Study needs AnkiConnect to allow the Yomu origin.',
        ankiConnectSetupConfig: "Add these origins to AnkiConnect's webCorsOriginList, keeping any existing entries:",
        ankiConnectSetupMobile: "For phone or iPad, use the desktop computer's LAN or Tailscale URL; localhost on a phone means the phone itself.",
        ankiConnectSetupBrave: 'In Brave, disable Shields for the Study page if local Anki checks are blocked.',
        helpSupportTitle: 'Support よむ',
        helpSupportCopy: SUPPORT_COPY,
        helpSupportCopyExtra: SUPPORT_COPY_EXTRA,
        videoPlayer: 'Video Player',
        pdfReader: 'PDF Reader',
        newTabPage: 'Study',
        github: 'GitHub',
        word: 'Word',
        search: 'Search',
        loading: 'Loading...',
        reveal: 'Reveal',
        revealTranslation: 'Reveal translation',
        immersionExampleControls: 'Immersion Kit example controls',
        exampleSearchLinks: 'Example searches',
        loadingKanjiDetails: 'Loading kanji details...',
        lookupDialog: `${APP_NAME} lookup`,
        resizeLookupSheet: 'Drag to resize lookup sheet, or tap to close',
        showMiningActions: 'More actions',
        hideMiningActions: 'Fewer actions',
        ...GRADING_SERVICE_COPY.en,
        jpdbKanjiUpdated: 'JPDB kanji updated.',
        jpdbKanjiUpdateFailedRuntime: 'Could not update JPDB kanji. Check kanji reviews.',
        apiSrsActionsDisabled: 'API mining actions are disabled in settings.',
        addJpdbApiKeyReview: 'Add a JPDB API key to review JPDB cards.',
        addJitenApiKeyReview: 'Add a Jiten API key to review Jiten cards.',
        addBunproApiKeyReview: 'Add a Bunpro frontend API token to review Bunpro cards.',
        addWanikaniApiKeyReview: 'Add a WaniKani personal access token to review due WaniKani assignments.',
        actionFailed: 'Action failed.',
        dictionary: 'Dictionary',
        dictionariesExported: 'Dictionaries exported.',
        local: 'Local',
        dict: 'dict',
        filterStudy: 'Study',
        filterAll: 'All',
        sortFrequency: 'Frequency',
        stateNew: 'New',
        stateLearning: 'Learning',
        stateYoung: 'Young',
        stateMature: 'Mature',
        stateDue: 'Due',
        stateFailed: 'Failed',
        stateKnown: 'Known',
        stateMastered: 'Mastered',
        stateNeverForget: 'Never forget',
        stateSuspended: 'Suspended',
        stateLocked: 'Locked',
        stateBlacklisted: 'Blacklisted',
        stateRedundant: 'Redundant',
        stateFrequent: 'Frequent',
        stateUnparsed: 'Unparsed',
        stateInDeck: 'In deck',
        stateNotInDeck: 'Not in deck',
        ankiReviewSingular: 'review',
        ankiReviewPlural: 'reviews',
        ankiLapseSingular: 'lapse',
        ankiLapsePlural: 'lapses',
        gradeNothingLabel: 'Nothing',
        gradeAgainLabel: 'Again',
        gradeGoodLabel: 'Good',
        gradeSomethingLabel: 'Something',
        gradeHardLabel: 'Hard',
        gradeOkayLabel: 'Okay',
        gradeEasyLabel: 'Easy',
        gradeFailLabel: 'Fail',
        gradePassLabel: 'Pass',
        factKeyword: 'Keyword',
        factType: 'Type',
        factFrequency: 'Frequency',
        factMeaning: 'Meaning',
        factGrade: 'Grade',
        factOldForms: 'Old forms',
        docs: 'Docs',
        factoryReset: 'Factory Reset',
        factoryResetConfirm: 'Reset all {appName} data?\n\nDeletes settings, keys, cache, dicts.',
        factoryResetFailed: 'Reset failed.',
        factoryResetStorageIncomplete: 'Reset stopped because not every saved item could be found or deleted. Close other よむ tabs and retry. If it still fails, clear よむ storage in your userscript manager.',
        factoryResetOtherTabReloading: 'よむ reset elsewhere. Reloading...',
        issues: 'Issues',
        donate: 'Donate',
        discord: 'Discord',
        openOnJpdb: 'Open on JPDB',
        openOnLookup: 'Open on {label}',
        viewOnLookup: 'View on {label}',
        copyWordTitle: 'Copy word',
        copiedWord: 'Copied word.',
        backToWord: 'Back to word',
        backToKanji: 'Back to kanji',
        previousKanji: 'Previous kanji',
        nextKanji: 'Next kanji',
        openKanjiOnJpdb: 'Open kanji on JPDB',
        strokePractice: 'Stroke order + practice',
        practiceDrawing: 'Practice drawing',
        strokes: 'strokes',
        textTrace: 'text trace',
        hideTrace: 'Hide trace',
        showTrace: 'Show trace',
        clear: 'Clear',
        originStructure: 'Component graph',
        originMapLabel: '2D kanji origin and component map',
        originShowSubcomponents: 'Subcomponents',
        originShowOutbound: 'Outbounds',
        kanjiAlive: 'Kanji Alive',
        wiktionary: 'Wiktionary',
        radical: 'Radical',
        readingsComponents: 'Readings and components',
        showKanji: 'Show kanji',
        jpdbMnemonic: 'JPDB mnemonic',
        rtkComponentKeywords: 'RTK component keywords',
        onReading: 'On',
        kunReading: 'Kun',
        heisigStory: 'Heisig story',
        heisigComment: 'Heisig comment',
        koohiiStories: 'Koohii stories',
        add: 'Add',
        addToDeck: 'Add to deck…',
        deck: 'Deck',
        deckActions: 'Deck actions',
        reviewBlockedBlacklisted: 'Blacklisted. Unlist before reviewing.',
        reviewBlockedNeverForget: 'Never-forget. Remove before reviewing.',
        reviewBlockedRedundant: 'JPDB marks this redundant.',
        ankiCardsSuspended: 'Suspended in Anki (works like a blacklist).',
        ankiCardsUnsuspended: 'Unsuspended in Anki.',
        ankiNeverForgetTagAdded: 'Tagged yomu-never-forget.',
        ankiNeverForgetTagRemoved: 'Removed yomu-never-forget.',
        forget: 'Forget',
        never: 'Never forget',
        unlist: 'Unlist',
        blacklist: 'Blacklist',
        vocabularyStatusUpdated: 'Vocabulary status updated.',
        addToAnki: 'Add to Anki',
        sendToMobileAnki: 'Send to {app}',
        ankiAudioFileNotFound: 'Anki audio file not found.',
        ankiAudioPlaybackUnavailable: 'Anki audio playback is not available here.',
        ankiAudioUnavailablePreview: 'Audio not available in preview',
        ankiAudioFilenameLabel: 'Anki audio {filename}',
        ankiStoredFields: 'Stored fields',
        ankiCardDetailsPending: 'Matched in Anki. Loading details...',
        ankiCardDetailsUnavailable: 'Matched in Anki. showing cached status.',
        ankiNewCard: 'New card',
        ankiMatches: 'Anki matches',
        gradeAnkiCardTarget: 'Grades Anki card: {target}',
        ankiNoteNotFound: 'Anki note not found.',
        mergeYomu: 'Merge Yomu',
        mergeYomuTitle: 'Update matching fields and add Yomu media to this note',
        editInAnki: 'Edit in Anki',
        keepBothAudio: 'Keep both',
        keepAnkiAudio: 'Keep Anki',
        useYomuAudio: 'Use Yomu',
        lastSeen: 'Last seen',
        unavailable: 'Unavailable',
        openedInAnki: 'Opened in Anki.',
        addedToDeckAndReviewed: 'Added to deck and reviewed.',
        sentToAnki: 'Sent to Anki.',
        openedMobileAnkiHandoff: 'Opened Anki handoff. Continue in Anki.',
        alreadyInAnki: 'Already in Anki. Use Edit in Anki instead.',
        removedFromDeck: 'Removed from deck.',
        addedToDeckToast: 'Added to deck.',
        apiDeckMediaNotSupported: 'Media stays in Yomu; no media API.',
        sentToAnkiWithContextImageAndAudio: 'Sent to Anki with image and audio.',
        sentToAnkiWithContextImage: 'Sent to Anki with image.',
        sentToAnkiWithAudio: 'Sent to Anki with audio.',
        ankiMergeNoNewData: 'Anki note already has the Yomu data.',
        ankiMergeFieldSingular: 'field',
        ankiMergeFieldPlural: 'fields',
        ankiMergeAudio: 'audio',
        ankiMergeImage: 'image',
        ankiMergeComplete: 'Merged Yomu data into Anki ({parts}).',
        ankiHandoffCancelled: 'Anki handoff cancelled.',
        ankiConnectActionFailed: 'AnkiConnect action failed.',
        ankiConnectRequestFailed: 'AnkiConnect request failed.',
        ankiConnectTimedOut: 'AnkiConnect timed out.',
        mobileAnkiReady: 'Anki offline. Handoff can create notes.',
        ankiConnectionReady: 'Connected. AnkiConnect is reachable.',
        ankiConnectedReady: 'Connected. "{deck}" / "{model}" ready.',
        ankiPromptRecallWord: 'Recall the highlighted word.',
        ankiMeaningHeading: 'Meaning',
        ankiPitchHeading: 'Pitch',
        ankiPartOfSpeechHeading: 'Part of speech',
        ankiLinksHeading: 'Links',
        ankiSourceHeading: 'Source',
        ankiLocalDictionaryStatus: 'local dictionary',
        composedOf: 'Composed of',
        ocrModeAutoToast: 'Image OCR automatic.',
        ocrModeManualToast: 'Image OCR on tap or hover.',
        ocrModeOffToast: 'Image OCR off.',
        subtitleOverlayEnabled: 'Subtitle overlay enabled.',
        subtitleOverlayHidden: 'Subtitle overlay hidden.',
        reviewFailed: 'Review failed.',
        reviewActionsDisabled: 'Review actions are disabled in settings.',
        jpdbLookupFailed: 'JPDB lookup failed.',
        jpdbApiKeyMissingError: 'Add a JPDB API key in Settings.',
        jpdbApiKeyRejectedError: 'JPDB rejected the API key. Check it in Settings.',
        jpdbRateLimitedError: 'JPDB is busy. Try again in a moment.',
        jpdbConnectionCoolingDownError: 'JPDB is temporarily unreachable. Try again in a moment.',
        jpdbRequestTimedOutError: 'JPDB took too long to respond. Try again.',
        jpdbRequestFailedError: 'JPDB request failed. Try again.',
        jpdbDeckStateApiKeyRequired: 'Add a JPDB API key to change JPDB deck state.',
        jitenDeckStateApiKeyRequired: 'Add a Jiten API key to change Jiten vocabulary state.',
        wanikaniAddApiKeyRequired: 'Add a WaniKani personal access token to review due assignments.',
        addedToWanikani: 'Recorded on WaniKani.',
        kanjiDetailsUnavailable: 'Kanji details are not available yet.',
        loadingDictionaryDetails: 'Loading dictionary details...',
        jitenCompositeWords: 'Composite words',
        usedInVocabulary: 'Used in vocabulary',
        exampleSentences: 'Example sentences',
        moreMeanings: 'More meanings',
        moreExamples: 'More examples',
        // U46: every one of these is a state a learner can reach. They exist
        // because an example source with nothing to show used to render nothing
        // at all, so an unsupported language looked exactly like a broken one.
        exampleSourceEmpty: 'No examples for this word yet.',
        exampleSourceEmptyShort: 'None yet',
        exampleSourceLimitedCorpus: 'This corpus is small, so many words have no example yet.',
        exampleSourceUnsupported: 'This source has no {language} sentences.',
        exampleSourceUnsupportedShort: 'Other languages',
        exampleSourceFailed: 'Examples did not load.',
        exampleSourceFailedShort: 'Not loaded',
        exampleSourceRetry: 'Try again',
        exampleSourceAudioPerItem: 'Audio plays where the recording is openly licensed.',
        exampleSourceNoSentenceAudio: 'Open {language} sentence audio is not available yet.',
        exampleSourceNoLicensedAudio: 'These sentences came without openly licensed audio.',
        exampleSourceNoImage: 'Scene images are Japanese only for now.',
        exampleSourceNoTranslation: 'No {language} translation yet.',
        exampleSourceMachineTranslation: 'Machine translation',
        exampleSourceIndirectTranslation: 'Translated via another language',
        exampleSourcePlayAudio: 'Play sentence audio',
        acceptedInputs: 'Accepted inputs',
        relatedWords: 'Related words',
        bunproUsedInVocab: 'Used in',
        relatedGrammar: 'Related grammar',
        antonymWord: 'Antonym',
        bunproCaution: 'Caution',
        bunproStructure: 'Structure',
        playJpdbExampleAudio: 'Play JPDB example audio',
        contextVideo: 'Video',
        contextImage: 'Image',
        contextCurrentPage: 'Current page',
        jpdbKanjiActionMine: 'Add',
        jpdbKanjiActionKnown: 'Known',
        jpdbKanjiActionNeverForget: 'Never forget',
        jpdbKanjiActionForget: 'Forget',
        jpdbKanjiActionBlacklist: 'Blacklist',
        jpdbKanjiActionReview: 'Review',
        noDefinitions: 'No enabled definition source returned results.',
        enabledHeader: 'On',
        labelHeader: 'Label',
        displayName: 'Display name',
        orderHeader: 'Order',
        removeHeader: 'Remove',
        definitionSource: 'Definition source',
        popupOrderTitle: 'Popup order',
        kanjiSection: 'Kanji section',
        dragToReorder: 'Drag to reorder',
        moveUp: 'Move up',
        moveDown: 'Move down',
        remove: 'Remove',
        removeImportedDictionary: 'Remove imported dictionary',
        customAdvanced: '{label} (advanced)',
        importLocalDefinitionsHelp: 'Import Yomitan for local definitions.',
        metadataDictionariesHelp: 'Metadata dictionaries appear as badges or kanji data.',
        sourceHelpJpdb: 'JPDB meanings from the current card.',
        sourceHelpJiten: 'Jiten meanings, examples, and related words.',
        sourceHelpBunpro: 'Bunpro vocabulary and grammar meanings, nuance, and examples.',
        sourceHelpWanikani: 'WaniKani vocabulary meanings, mnemonics, and SRS status for subjects on your account.',
        sourceHelpAnki: 'Matching Anki card content and status.',
        sourceHelpTranslation: 'Sentence translation.',
        sourceHelpGrammar: 'Local grammar hints.',
        sourceHelpImmersionKit: 'Example sentences, images, and audio.',
        sourceNameImmersionKit: 'Immersion Kit',
        sourceNameAnki: 'Anki',
        sourceNameTranslation: 'Translation',
        sourceNameGrammar: 'Grammar',
        sourceNameStrokePractice: 'Stroke practice',
        sourceNameImportedKanjiDictionaries: 'Imported kanji dictionaries',
        sourceNameWordsUsingKanji: 'Related vocabulary',
        sourceNameJitenKanjiFacts: 'Jiten kanji facts',
        sourceHelpImportedKanjiDictionary: 'Imported Yomitan kanji dictionary.',
        sourceHelpStrokePractice: 'Stroke order preview and drawing pad.',
        sourceHelpReadingsComponents: 'JPDB readings, components, and mnemonic.',
        sourceHelpJitenKanjiFacts: 'Jiten kanji facts, frequency, readings, words.',
        sourceHelpRtk: 'RTK keywords, elements, and stories.',
        sourceHelpWanikaniKanji: 'WaniKani kanji meaning/reading mnemonics, level, and SRS status.',
        sourceHelpImportedKanjiDictionaries: 'Imported Yomitan kanji entries.',
        sourceHelpWordsUsingKanji: 'Related vocabulary.',
        sourceHelpComponentGraph: 'Kanji facts, components, radical images.',
        recommendedJitendex: 'Term definitions with examples.',
        recommendedWtyJapaneseJapanese: 'Japanese-to-Japanese term definitions.',
        recommendedPixivLight: 'Pixiv terms.',
        recommendedJpdbKanji: 'JPDB kanji.',
        recommendedKanjiumPitch: 'Pitch accents only; add a term dictionary for definitions.',
        recommendedBccwj: 'Frequency badges from BCCWJ.',
        recommendedJiten: 'Frequency badges from Jiten.',
        lines: 'Lines',
        tracks: 'Tracks',
        native: 'Native',
        options: 'options',
        option: 'option',
        line: 'line',
        translation: 'Translation',
        grammar: 'Grammar',
        meaning: 'Meaning',
        readSentenceAloud: 'Read sentence aloud',
        openSectionToTranslate: 'Open this section to translate.',
        translationUnavailable: 'Translation unavailable.',
        translating: 'Translating...',
        ...GRAMMAR_UI_COPY.en,
    },
} as const;
export type UiCopyKey = keyof typeof COPY.en;

export const CARD_STATE_LABEL_KEYS: Record<string, UiCopyKey> = {
    new: 'stateNew',
    learning: 'stateLearning',
    young: 'stateYoung',
    mature: 'stateMature',
    known: 'stateKnown',
    mastered: 'stateMastered',
    due: 'stateDue',
    failed: 'stateFailed',
    locked: 'stateLocked',
    'never-forget': 'stateNeverForget',
    blacklisted: 'stateBlacklisted',
    suspended: 'stateSuspended',
    'in-deck': 'stateInDeck',
    'not-in-deck': 'stateNotInDeck',
    redundant: 'stateRedundant',
    frequent: 'stateFrequent',
    unparsed: 'stateUnparsed',
};

/**
 * Parses a `key<TAB>text` copy table. Rows are read without their leading
 * indentation: the extension compiler indents the whole userscript body, the
 * text inside these template literals included, and a key that kept those
 * spaces never matched, so the packaged extension fell back to English for
 * every table-held Japanese string while still reporting language=ja.
 */
export function parseUiCopyTable(rows: string): Partial<Record<UiCopyKey, string>> {
    const copy: Partial<Record<UiCopyKey, string>> = {};
    rows.trim().split('\n').map(row => row.replace(/^ +/u, '')).forEach(row => {
        const tab = row.indexOf('\t');
        if (tab < 0) {
            const key = row.trim();
            if (key) copy[key as UiCopyKey] = '';
            return;
        }
        if (tab === 0) return;
        copy[row.slice(0, tab) as UiCopyKey] = row.slice(tab + 1).replaceAll('{APP_NAME}', APP_NAME);
    });
    return copy;
}
const JA_COPY: Partial<Record<UiCopyKey, string>> = {
    ...parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
automatic	自動
english	英語
japanese	日本語
settings	設定
settingsSaved	設定を保存しました。
statsEmptyHelp	最初の学習のあと、復習の記録と進み具合がここに表示されます。
libraryEmpty	読みながら単語を保存すると、ここに表示されます。
audioSourcesTitle	音声ソース
settingsSaveFailed	設定を保存できませんでした。
settingsCompanionUnavailable	設定を開けませんでした。
firefoxAuthenticationInfoDenied	Firefoxの許可がなかったため、アカウント情報は保存しませんでした。
firefoxAuthenticationInfoExtensionPageRequired	Firefoxでこの許可を求めるにはYomuのページが必要です。学習ページを開き、設定からアカウント情報を追加してください。
dictionaries	辞書
sources	ソース
localWordSingular	項目
localWordPlural	項目
kanji	漢字
audio	音声
front	表面
back	裏面
newTabPage	学習
word	単語
search	検索
switchToLightTheme	ライトテーマに切り替え
switchToDarkTheme	ダークテーマに切り替え
loading	読み込み中...
reveal	表示
revealTranslation	翻訳を表示
immersionExampleControls	イマージョンキット例文の操作
exampleSearchLinks	例文検索リンク
loadingKanjiDetails	漢字情報を読み込み中...
lookupDialog	{APP_NAME}検索
resizeLookupSheet	検索シートをリサイズ。タップで閉じる
showMiningActions	その他の操作
hideMiningActions	操作を閉じる
closeDrawer	ドロワーを閉じる
copiedWord	単語をコピーしました。
jpdbKanjiUpdated	JPDB漢字を更新しました。
jpdbKanjiUpdateFailedRuntime	JPDB漢字を更新できません。
apiSrsActionsDisabled	設定でAPI採掘操作が無効です。
addJpdbApiKeyReview	JPDBレビューにはAPIキーが必要です。
addJitenApiKeyReview	JitenレビューにはAPIキーが必要です。
addBunproApiKeyReview	Bunproレビューにはfrontend_api_tokenが必要です。
addWanikaniApiKeyReview	期限が来たWaniKaniの課題を復習するには、パーソナルアクセストークンを追加してください。
actionFailed	操作に失敗しました。
noDefinitions	有効な定義ソースから結果が返りませんでした。
dictionary	辞書
dictionariesExported	辞書をエクスポートしました。
saveAfterInstall	インストール後に保存
dictionaryDownloading	ダウンロード中
dictionaryReadingZip	辞書ZIPを読み取り中...
dictionaryCheckingIndex	インデックス確認中...
dictionaryBanksFound	{count}件のバンクを検出
dictionaryRemovingExisting	既存項目を削除中
dictionaryReadingBank	読み取り中
dictionaryParsingBank	解析中
dictionarySavingBank	保存中
dictionaryImporting	インポート中
importingBundledDictionaries	同梱辞書をインポート中...
dictionaryImported	インポート済み
dictionaryPreparingImport	インポート準備中
dictionaryRecords	辞書レコード
dictionaryEntries	件
dictionaryTotal	合計
dictionaryDownloadProgress	辞書をダウンロード中
dictionaryStatusSummary	辞書{dictionaries}、語{terms}、漢字{kanji}、メタ{metadata}
dictionaryStatusUnavailable	辞書状態を取得不可。
noLocalDictionariesImported	辞書は未追加です。まず定義用の語句辞書を追加してください。
dictionaryDownloadFailed	辞書のダウンロードに失敗しました。
storageRuntimeUnavailable	よむの保存機能を利用できません。ページを再読み込みし、解決しない場合はよむを再インストールしてください。
dictionaryDownloadTimedOut	辞書のダウンロードがタイムアウトしました。
dictionaryDownloadNotZip	ダウンロード結果がZIPではありません。
dictionaryStorageFull	この辞書を保存する空き容量が足りません。空き容量を増やすか辞書を削除してから、もう一度お試しください。
dictionaryDownloadNeedsBridge	ブリッジが必要です。失敗時はZIPを追加。
dictionaryDownloadBlocked	ダウンロード不可。ZIPを追加。
dictionaryManualDownloadHint	ユーザースクリプト有効化かZIP追加。
dictionaryInstallQueueHelp	まず定義用の語句辞書をインストールしてください。発音（IPA）/日本語ピッチ/頻度辞書は発音、ピッチアクセント、バッジを追加しますが、通常の定義文は追加しません。
dictionaryInstallQueued	{dictionary}待機中。
dictionaryInstallSaveBlocked	インポート中。完了後に保存できます。
dictionaryImportQueueStatus	{count}件インストール中。完了後に保存。
dictionaryInstallRunning	{count}件インストール中。
dictionaryRemoveConfirm	「{dictionary}」を削除？
dictionaryRemoving	{dictionary}を削除中...
dictionaryRemoved	{dictionary}を削除しました。
${Object.entries(LOCAL_DICTIONARY_STORAGE_COPY.jaImport).map(([key, value]) => `${key}\t${value}`).join('\n')}
dictionaryRecordsImported	{dictionary}: {records}件
settingsImported	設定をインポートしました。
settingsImportedWithDetails	設定をインポートしました。{details}
settingsExported	設定をエクスポートしました。
restoredStoredChoices	保存済み選択肢を{count}件復元
importedDictionaryRecordCount	辞書レコードを{count}件インポート
dictionaryNoSupportedBanks	対応辞書バンクがありません。
dictionaryUnsupportedJson	Dexie、ZIP、出力を使ってください。
dictionaryZipMissingIndex	ZIPにindex.jsonがありません。
local	ローカル
dict	辞書
scanPage	ページをスキャン
noUnscannedJapaneseText	未スキャンの日本語テキストはありません。
contextOccurrences	文脈内 ×{count}
puckAutoDetectSubtitles	字幕を自動検出
loadTargetSubtitles	日本語字幕を読み込む
loadOutputSubtitles	英語字幕を読み込む
jpdbScanFailed	ページスキャンに失敗しました。
pageCoverageSummary	{percent}%・{known}/{total}・新{unknown}・i+1 {iPlusOne}
noImmersionExamplesCompact	例文なし
kanjiAlive	カンジアライブ
wiktionary	ウィクショナリー
lines	行
tracks	トラック
native	母語
options	件
option	件
line	行
filterStudy	学習
filterAll	すべて
sortFrequency	頻度
stateNew	新規
stateLearning	学習中
stateYoung	若い
stateMature	成熟
stateDue	復習予定
stateFailed	失敗
stateKnown	既知
stateMastered	習得済み
stateNeverForget	忘れない
jpdbAndJitenApiKeysConfigured	JitenとJPDBキーあり。
stateSuspended	停止中
stateLocked	ロック中
stateBlacklisted	ブラックリスト
stateRedundant	重複
stateFrequent	頻出
stateUnparsed	未解析
stateInDeck	デッキ内
stateNotInDeck	デッキ外
gradeAnkiCardTarget	Ankiカードを採点: {target}
ankiReviewSingular	回復習
ankiReviewPlural	回復習
ankiLapseSingular	回失敗
ankiLapsePlural	回失敗
gradeNothingLabel	全然
gradeAgainLabel	もう一度
gradeGoodLabel	良い
gradeSomethingLabel	少し
gradeHardLabel	難しい
gradeOkayLabel	OK
gradeEasyLabel	簡単
gradeFailLabel	失敗
gradePassLabel	合格
gradeNothing	採点: 全然
gradeSomething	採点: 少し
gradeHard	採点: 難しい
gradeOkay	採点: OK
gradeEasy	採点: 簡単
gradeFail	合否: 失敗
gradePass	合否: 合格
studyReveal	学習: カードを表示
studyRevealAlternate	学習: カードを表示（代替）
studyUndo	学習: 直前のレビューを取り消す
studyPrevious	学習: 前のカード
studyPreviousAlternate	学習: 前のカード（代替）
studyNext	学習: 次のカード
studyNextAlternate	学習: 次のカード（代替）
factKeyword	キーワード
factType	種類
factFrequency	頻度
factMeaning	意味
factGrade	学年
factOldForms	旧字体
noSimilarWords	追加の単語は見つかりませんでした。
loadingExamples	例文を読み込み中...
immersionKitRateLimited	Immersion Kit制限中。あとで再試行。
immersionKitRequest	Immersion Kitリクエスト
immersionKitRequestFailed	Immersion Kitリクエストに失敗しました。
immersionKitRequestFailedWithStatus	Immersion Kitリクエストに失敗しました（{status}）。
immersionKitRequestTimedOut	Immersion Kitリクエストがタイムアウトしました。
immersionKitSearchBlocked	Immersion Kit検索がブロック中です。CORSを設定してください。
immersionKitMediaRequest	メディアリクエスト
immersionKitMediaRequestFailed	メディアリクエストに失敗しました。
immersionKitMediaRequestFailedWithStatus	メディアリクエストに失敗しました（{status}）。
immersionKitMediaRequestTimedOut	メディアリクエストがタイムアウトしました。
immersionKitMediaRequestReturnedNonMedia	メディアリクエストがエラードキュメントを返しました。
immersionKitNoMediaCandidate	読み込めるメディア候補なし。
nadeshikoRequest	Nadeshikoリクエスト
nadeshikoRequestFailed	Nadeshikoリクエストに失敗しました。
nadeshikoRequestFailedWithStatus	Nadeshikoリクエストに失敗しました（{status}）。
nadeshikoRequestTimedOut	Nadeshikoリクエストがタイムアウトしました。
previousExample	前の例文
nextExample	次の例文
playExampleAudio	例文音声を再生
openOnJpdb	JPDBで開く
openOnLookup	{label}で開く
viewOnLookup	{label}で見る
copyWordTitle	単語をコピー
backToWord	単語に戻る
backToKanji	漢字に戻る
previousKanji	前の漢字
nextKanji	次の漢字
openKanjiOnJpdb	JPDBで漢字を開く
playAudio	音声を再生
audioPlaybackDisabled	音声再生は無効です
audioPlaybackDisabledToast	音声再生は無効です。
audioPlaybackFailed	音声の再生に失敗しました。
noSentenceToRead	読み上げる例文がありません。
noTextToRead	読み上げるテキストがありません。
jpdbExampleAudioUnavailable	この例文にJPDB音声なし。
jpdbAudioPlayableFileMissing	JPDB音声に再生ファイルなし。
jpdbAudioResponseNotPlayable	JPDB音声は再生不可。
audioSourceReturnedNoAudio	音声ソースに音声なし。
audioJsonMissingPlayableUrl	音声JSONに再生URLなし。
textToSpeechUnavailable	読み上げを利用できません。
textToSpeechFailed	読み上げに失敗しました。
audioRequest	音声リクエスト
audioRequestTimedOut	音声リクエストがタイムアウトしました。
audioRequestReturnedNonAudioWithType	音声ではない応答です: {type}。
audioUnknownContentType	不明なコンテンツ種別
japanesePod101NoAudio	JapanesePod101に音声なし。
invalidJpdbAudioId	JPDB音声IDが無効です。
couldNotReadAudio	音声を読み取れませんでした。
couldNotReadAudioBlob	音声データを読み取れませんでした。
previousSubtitle	前の字幕
nextSubtitle	次の字幕
jumpToCurrentSubtitle	現在の字幕へ移動
pauseVideo	動画を一時停止
readVideoFrame	動画フレームを読み取る（OCR）
readVideoFrameStop	動画フレームの読み取りを停止（OCR）
copySubtitle	字幕をコピー
subtitleFallbackLabel	字幕
subtitlesTitle	字幕
openSubtitlePanel	字幕パネルを開く
closeSubtitlePanel	字幕パネルを閉じる
subtitleStyle	字幕スタイル
subtitleResetDefaults	標準に戻す
enableSubtitleAutoHide	再生中はパネルを自動で隠す
disableSubtitleAutoHide	再生中もパネルを開いたままにする
subtitlePanelOptions	パネル設定
searchAnimeSubtitles	アニメ字幕を検索
toggleNativeSubtitleBlur	母語字幕のぼかしを切り替え
subtitleTrackDetectedSingular	字幕トラックを1件検出
subtitleTracksDetected	件の字幕トラックを検出
noSubtitleTracksDetected	字幕トラックは未検出です。
resizeTranscriptPanel	文字起こしパネルのサイズ変更
resizeSubtitleTracksPanel	字幕トラックパネルのサイズ変更
subtitlePanelMode	表示
subtitleLines	行
shadow	シャドー
subtitleTracks	トラック
subtitleTrackTiming	字幕タイミング
subtitleOffsetPrevious	前の字幕を現在時刻に合わせる
subtitleOffsetNext	次の字幕を現在時刻に合わせる
subtitleOffsetPreviousShort	前
subtitleOffsetNextShort	次
subtitleOffsetEarlier	字幕を100ミリ秒早く表示
subtitleOffsetLater	字幕を100ミリ秒遅く表示
resetSubtitleOffset	字幕タイミングをリセット
copySubtitleLine	字幕行をコピー
subtitleCopyIncludeTranslation	行コピー時に翻訳も含める
peekSubtitleTranslation	翻訳を表示
hideSubtitleTranslation	翻訳を隠す
loadingSubtitleLines	字幕行を読み込み中
waitingForCaptionLines	字幕行を待機中
subtitleCurrentLineWillAppear	字幕が来ると現在行を表示します。
seekSubtitleLine	字幕行へ移動
subtitleTracksHint	主字幕を選び、「行」で移動。
autoDetectedTracksWillAppear	字幕トラックはここに出ます。
autoDetectedOptionSingular	字幕オプション1件
autoDetectedOptions	件の字幕オプション
detected	検出済み
primaryOverlay	主字幕オーバーレイ
nativeOverlay	母語オーバーレイ
unsetPrimarySubtitles	主字幕を解除
primarySubtitles	主字幕
unsetNativeSubtitles	母語を解除
nativeSubtitles	母語
choosePrimarySubtitles	主字幕を選択
transcript	文字起こし
subtitleOptionSingular	件
subtitleOptionPlural	件
subtitleLineSingular	行
subtitleLinePlural	行
trackKindPageTrack	ページ内トラック
trackKindPageFile	ページ内ファイル
trackKindYouTubeCaptions	YouTube字幕
youTubeSubtitles	YouTube字幕
autoGeneratedSubtitle	自動生成
trackKindLoadedFile	読み込んだファイル
trackStatusLoading	読み込み中
trackStatusWaiting	字幕待機中
trackStatusFailed	失敗
showKanji	漢字を表示
strokePractice	筆順と練習
practiceDrawing	手書き練習
strokes	画
textTrace	筆順ガイド
hideTrace	ガイドを隠す
showTrace	ガイドを表示
clear	クリア
originStructure	部品グラフ
originMapLabel	2D漢字由来・部品マップ
originShowSubcomponents	下位部品
originShowOutbound	派生先
radical	部首
readingsComponents	読みと部品
jpdbMnemonic	JPDBの覚え方
rtkComponentKeywords	RTK部品キーワード
onReading	音
kunReading	訓
heisigStory	Heisigストーリー
heisigComment	Heisigコメント
koohiiStories	Koohiiストーリー
add	追加
addToDeck	デッキに追加…
deck	デッキ
deckActions	デッキ操作
reviewBlockedBlacklisted	ブラックリスト入りです。解除するとレビューできます。
reviewBlockedNeverForget	「忘れない」設定です。解除するとレビューできます。
reviewBlockedRedundant	JPDBで冗長のためレビューできません。
ankiCardsSuspended	Ankiで保留にしました。
ankiCardsUnsuspended	Ankiの保留を解除しました。
ankiNeverForgetTagAdded	Ankiにyomu-never-forgetタグを付けました。
ankiNeverForgetTagRemoved	Ankiのyomu-never-forgetタグを外しました。
forget	忘れる
never	忘れない
unlist	解除
blacklist	ブラックリスト
vocabularyStatusUpdated	語彙状態を更新しました。
addToAnki	Ankiに追加
sendToMobileAnki	{app}へ送る
ankiAudioFileNotFound	Anki音声ファイルが見つかりません。
ankiAudioPlaybackUnavailable	ここではAnki音声を再生できません。
ankiAudioUnavailablePreview	プレビューで音声を利用できません
ankiAudioFilenameLabel	Anki 音声 {filename}
ankiStoredFields	保存フィールド
ankiCardDetailsPending	Ankiで一致。カード詳細を読み込み中...
ankiCardDetailsUnavailable	Ankiで一致。キャッシュ状態を表示します。
ankiNewCard	新規カード
ankiMatches	Ankiの一致
ankiNoteNotFound	Ankiノートが見つかりません。
ankiHandoffCancelled	Ankiへの受け渡しがキャンセルされました。
ankiConnectActionFailed	AnkiConnectの操作に失敗しました。
ankiConnectRequestFailed	AnkiConnectリクエストに失敗しました。
ankiConnectTimedOut	AnkiConnectがタイムアウトしました。
ankiHostedCorsHint	webCorsOriginListに{origin}を追加してください。
mobileAnkiReady	Anki未接続。受け渡しでカード作成できます。
ankiConnectionReady	接続しました。AnkiConnectに到達できます。
ankiConnectedReady	接続済み。「{deck}」/「{model}」準備完了。
ankiPromptRecallWord	ハイライトされた単語を思い出してください。
ankiMeaningHeading	意味
ankiPitchHeading	ピッチ
ankiPartOfSpeechHeading	品詞
ankiLinksHeading	リンク
ankiSourceHeading	出典
ankiLocalDictionaryStatus	ローカル辞書
mergeYomu	Yomuを統合
mergeYomuTitle	一致フィールドを更新し、Yomuメディアを追加
editInAnki	Ankiで編集
keepBothAudio	両方残す
keepAnkiAudio	Ankiを残す
useYomuAudio	Yomuを使う
lastSeen	最後に見た場所
unavailable	利用不可
openedInAnki	Ankiで開きました。
addedToDeckAndReviewed	デッキに追加してレビューしました。
sentToAnki	Ankiに送信しました。
openedMobileAnkiHandoff	モバイルAnki受け渡しを開きました。
alreadyInAnki	すでにAnkiにあります。
removedFromDeck	デッキから削除しました。
addedToDeckToast	デッキに追加しました。
apiDeckMediaNotSupported	メディアはYomuに残ります。
sentToAnkiWithContextImageAndAudio	画像と音声付きでAnkiに送信しました。
sentToAnkiWithContextImage	画像付きでAnkiに送信しました。
sentToAnkiWithAudio	音声付きでAnkiに送信しました。
ankiMergeNoNewData	Yomuデータは反映済みです。
ankiMergeFieldSingular	フィールド
ankiMergeFieldPlural	フィールド
ankiMergeAudio	音声
ankiMergeImage	画像
ankiMergeComplete	YomuデータをAnkiに統合しました ({parts})。
composedOf	構成語
ocrModeAutoToast	画像OCRを自動にしました。
ocrModeManualToast	画像OCRをタップ/ホバーにしました。
ocrModeOffToast	画像OCRをオフにしました。
subtitleOverlayEnabled	字幕オーバーレイを有効にしました。
subtitleOverlayHidden	字幕オーバーレイを非表示にしました。
reviewFailed	レビューに失敗しました。
reviewActionsDisabled	設定でレビュー操作が無効です。
jpdbLookupFailed	JPDB検索に失敗しました。
jpdbApiKeyMissingError	設定でJPDB APIキーを追加してください。
jpdbApiKeyRejectedError	JPDBがAPIキーを拒否しました。設定でキーを確認してください。
jpdbRateLimitedError	JPDBへのリクエストが多すぎます。しばらくしてからもう一度お試しください。
jpdbConnectionCoolingDownError	JPDBに一時的に接続できません。しばらくしてからもう一度お試しください。
jpdbRequestTimedOutError	JPDBからの応答に時間がかかりすぎました。もう一度お試しください。
jpdbRequestFailedError	JPDBへのリクエストに失敗しました。もう一度お試しください。
jpdbDeckStateApiKeyRequired	JPDBデッキ変更にはAPIキーが必要です。
jitenDeckStateApiKeyRequired	Jiten状態変更にはAPIキーが必要です。
wanikaniAddApiKeyRequired	期限が来た課題を復習するには、WaniKaniのパーソナルアクセストークンを追加してください。
addedToWanikani	WaniKaniに記録しました。
kanjiDetailsUnavailable	漢字情報はまだ利用できません。
loadingDictionaryDetails	辞書詳細を読み込み中...
jitenCompositeWords	複合語
usedInVocabulary	使われる単語
exampleSentences	例文
moreMeanings	ほかの意味
moreExamples	ほかの例文
exampleSourceEmpty	この語の例文はまだありません。
exampleSourceEmptyShort	例文なし
exampleSourceLimitedCorpus	コーパスが小さいため、例文がまだない語もあります。
exampleSourceUnsupported	この情報源に{language}の例文はありません。
exampleSourceUnsupportedShort	他言語のみ
exampleSourceFailed	例文を読み込めませんでした。
exampleSourceFailedShort	読み込み失敗
exampleSourceRetry	もう一度試す
exampleSourceAudioPerItem	公開ライセンスの録音がある例文では音声を再生できます。
exampleSourceNoSentenceAudio	{language}の文音声は公開ライセンスのものがまだありません。
exampleSourceNoLicensedAudio	公開ライセンスの音声が付いていない例文です。
exampleSourceNoImage	場面画像は今のところ日本語のみです。
exampleSourceNoTranslation	{language}の訳はまだありません。
exampleSourceMachineTranslation	機械翻訳
exampleSourceIndirectTranslation	別の言語を経由した訳
exampleSourcePlayAudio	例文の音声を再生
acceptedInputs	入力として認められる表現
relatedWords	関連語
bunproUsedInVocab	使われている単語
relatedGrammar	関連文法
antonymWord	対義語
bunproCaution	注意
bunproStructure	構造
playJpdbExampleAudio	JPDB例文音声を再生
kanjiDictionaries	漢字辞書
sourceNameWordsUsingKanji	関連語彙
contextVideo	動画
contextImage	画像
contextCurrentPage	現在のページ
jpdbKanjiActionMine	追加
jpdbKanjiActionKnown	既知
jpdbKanjiActionNeverForget	忘れない
jpdbKanjiActionForget	忘れる
jpdbKanjiActionBlacklist	ブラックリスト
jpdbKanjiActionReview	レビュー
immersionKit	イマージョンキット
translation	翻訳
grammar	文法
meaning	意味
readSentenceAloud	文を読み上げ
openSectionToTranslate	開くと翻訳します。
translationUnavailable	翻訳を利用できません。
translating	翻訳中...
`),
    ...GRAMMAR_UI_COPY.ja, ...SETTINGS_RECOVERY_COPY.ja, ...PRACTICE_SESSION_COPY.ja, ...SAVE_WAIT_COPY.ja, ...GRADING_SERVICE_COPY.ja, ...COLLECTION_COPY.ja, ...OCR_STATUS_COPY.ja,
};

const JA_SETTINGS_COPY: Partial<Record<UiCopyKey, string>> = {
    accountSettingsTrustedSurfaceTitle: 'Studyで設定を開く', accountSettingsTrustedSurfaceHelp: 'このページは自身の入力欄を読み書きできるため、よむは設定、アカウント情報、インポート、復旧コードをここに表示しません。よむが管理するStudyページで安全に編集・保存してください。', openAccountSettingsTrustedSurface: 'Studyの設定を開く',
    ...parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
settingsSections	設定セクション
settingsSearch	設定を検索
settingsSearchPlaceholder	設定を検索
settingsSearchNoResults	一致なし。
save	保存
cancel	キャンセル
closeSettings	設定を閉じる
settingsLauncherHelp	設定は、このサイトから読み取れないStudyで開きます。
openInStudy	Studyで開く
show	表示
hide	隠す
appearance	外観
reading	読解
sources	ソース
backupSync	バックアップと同期
media	メディア
mining	採掘
shortcuts	ショートカット
help	ヘルプ
reader	リーダー
images	画像テキスト (OCR)
video	動画
youTube	YouTube
anki	Anki
jpdb	JPDB
api	API
apiCredential	APIキー
apiCredentialJpdb	JPDB APIキー
apiCredentialJiten	Jiten APIキー
apiCredentialBunpro	BunproフロントエンドAPIトークン
apiCredentialWanikani	WaniKaniパーソナルアクセストークン
wanikaniTokenHelp	WaniKaniでread/write権限のパーソナルアクセストークンを作成し、ここに貼り付けてください。ブラウザ内にのみ保存され、プロキシを経由せずapi.wanikani.comへ直接送信され、ログに残ることはありません。
apiCredentialBunproLegacy	Bunpro APIキー
apiKey	APIキー
jitenApiKey	Jiten APIキー
apiAccess	APIアクセス
storedCredentialPlaceholder	保存済み — 変更する場合のみ入力
clearStoredCredential	保存済みの認証情報を削除
apiAccessHelp	各サービスの認証情報を設定します。Bunproに必要なのはフロントエンドトークンだけです。Bunpro設定から取り込み、パスワードと同様に扱ってください。保存時点では未確認です。Academyの復習はアカウントなしでも使えます。
jpdbSettings	JPDB設定
jitenSettings	Jiten設定
bunproSettings	Bunpro設定
wanikaniSettings	WaniKani設定
jpdbApiKeyConfigured	JPDBキーあり。
jpdbConnected	JPDBに接続しました。
jpdbAndJitenConnected	JitenとJPDBに接続しました。
jpdbConnectionFailed	JPDBキーが無効か接続不可です。
statusReady	準備完了
statusAttention	設定が必要
statusError	エラー
disabledControlDescription	別設定で制御中。
jpdbMiningEnabled	APIの復習・デッキ変更を許可
bunproMiningEnabled	Bunproの復習・採掘を許可
wanikaniReviewEnabled	WaniKaniの復習を許可(期限が来た課題のみ)
wanikaniGradeMappingHelp	よむの採点結果はWaniKaniの正誤カウントに変換されます。Okay、Good、Easyは正解として送信します。Okay未満は意味を1回不正解として送信し、ラジカル以外では読みも1回不正解として送信します。
yomuLocalSrsEnabled	Academyを有効化
addToForq	JPDB追加時にforqにもコピー
enableReviews	復習ボタンを表示
reviewRatingScale	復習評価の段階
gradeTargetSelector	採点先
gradeTargetBoth	両方
gradeTargetJpdb	JPDBを採点
gradeTargetJiten	Jitenを採点
gradeTargetBunpro	Bunproを採点
gradeTargetWanikani	WaniKaniを採点
gradeTargetYomuLocal	Academyに記録
gradeTargetAnki	Ankiカードを採点: {target}
gradeTargetJpdbAndAnki	JPDB + Ankiカードを採点: {target}
gradeTargetJitenAndAnki	Jiten + Ankiカードを採点: {target}
gradeTargetBunproAndAnki	Bunpro + Ankiカードを採点: {target}
gradeTargetYomuLocalAndAnki	Academy + Ankiカードに記録: {target}
missingAnkiCardId	AnkiカードIDがありません。
jpdbPageEnhancements	辞書サイト拡張
jpdbPageEnhancementsEnabled	JPDB・Jitenのページを拡張
jpdbPageWordEnhancementsEnabled	単語・検索ページにソースを追加
jpdbPageKanjiEnhancementsEnabled	漢字ページにソースを追加
fivePoint	サービスの標準評価
fourGradeShortcutsHelp	4段階の復習では、最初の4つのショートカットを「もう一度・難しい・良い・簡単」に使います。
twoPoint	2段階: 失敗 / 合格
settingsLanguage	設定の表示言語
theme	テーマ
auto	自動
dark	ダーク
light	ライト
popupMode	ポップアップ表示
hoverPopupMode	ホバー時の表示
bottomSheet	下部シート
popover	ポップオーバー
stickyBottomSheet	検索後も開く
popoverWidth	ポップオーバー幅 (px)
popoverHeight	ポップオーバー高さ (px)
popoverHeightMode	ポップオーバー高さの動作
popoverHeightAvailable	空き領域まで
popoverHeightFixed	高さ設定を使う
readerFontFamily	リーダーUIフォント
popupFontFamily	ポップアップのフォント
fontPresetYomuDefault	内蔵フォント
fontPresetJapaneseSans	日本語サンセリフ
fontPresetHiraginoYuGothic	ヒラギノ / 游ゴシック
fontPresetJapaneseRounded	日本語丸ゴシック
fontPresetJapaneseSerif	日本語明朝
fontPresetSystemUi	システムUI
fontPresetCustom	カスタム...
customFontFamily	カスタムフォント
popupFontWeight	ポップアップのフォントの太さ
enableLogging	診断ログを有効にする
diagnostics	診断
diagnosticsHelp	診断をコンソールへ出力します。
accentColor	アクセントカラー
newTab	学習
newTabAnkiEnabled	学習でAnkiカードを使う
newTabAnkiReviewDecks	Anki復習デッキ
newTabAnkiReviewDecksHelp	不要なデッキを外します。
newTabSource	学習の復習ソース
newTabAuto	自動
newTabApiSrs	API SRS（Jiten / JPDB）
newTabBunpro	Bunpro
newTabWanikani	WaniKani
newTabYomuLocal	Academy
dictionaryFallback	辞書フォールバック
newTabJpdbReviewMode	API復習モード
newTabJpdbReviewAuto	自動
newTabLiveReview	ライブJPDB復習セッション
newTabApiVocabulary	API語彙のみ（デッキ順）
corsProxyUrl	クロスオリジンプロキシURL
newTabKanjiKeywordSource	漢字キーワードのソース
newTabKanjiKeywordAuto	自動
newTabKanjiKeywordRtk	RTK / Heisig
newTabKanjiKeywordApiFacts	{service}漢字情報（Jiten / JPDB）
newTabKanjiKeywordLocal	ローカルカードの意味
newTabParsingEnabled	学習の文解析を有効にする
newTabFrontSentenceEnabled	単語カード表面に文を表示
newTabKanjiAutogradeEnabled	漢字書き取りを自動採点
newTabOfflineEnabled	学習をオフライン用にキャッシュ
newTabOfflineLimit	オフライン復習キャッシュ上限
newTabDailyGoalMinutes	1日の学習目標（分・0で無効）
newTabKanjiUnlockEnabled	漢字後に単語を解放
newTabStopAtBatchEnd	バッチの終わりで停止
newTabSwipeReviews	スワイプ採点（左=失敗、右=合格）
newTabShortcutHintsEnabled	学習のキーボードショートカットヒントを表示
newTabOfflineHelp	カードと未送信採点を保存。
newTabJpdbDeck	学習のJPDBデッキ
wordColors	単語の色
wordColorNew	新規・デッキ内
wordColorLearning	学習中
wordColorKnown	既知・忘れない
wordColorDue	期限到来
wordColorFailed	失敗
wordColorIgnored	無視・保留・ブラックリスト中
pitchAccentColors	ピッチアクセントの色
pitchColorHeiban	平板
pitchColorAtamadaka	頭高
pitchColorNakadaka	中高
pitchColorOdaka	尾高
pitchColorUnknown	不明
pronunciation	発音
noExactPitch	完全一致のピッチは利用不可
colorChannels	色チャンネル
wordHighlightColorSource	単語ハイライトの色
wordUnderlineColorSource	単語下線の色
wordTextColorSource	単語テキストの色
subtitleHighlightColorSource	字幕ハイライトの色
subtitleUnderlineColorSource	字幕下線の色
subtitleTextColorSource	字幕テキストの色
colorSourceStatus	すべての学習状態
colorSourceJpdb	メインデッキの学習状態
colorSourceAnki	Ankiの学習状態
colorSourcePitch	ピッチアクセント
colorSourceNone	なし
popupLookup	ポップアップ検索
popupLookupEnabled	よむの検索ポップアップを表示
popupLookupHelp	他リーダーのポップアップ用。オフでも他機能は有効。
lookupOnClick	タップまたはクリックで検索
lookupOnHover	ホバーで検索
lookupOnMiddleMouse	中央ボタン長押しで検索
showFloatingButton	設定ボタンを表示
pageScanMode	ウェブページの日本語
pageScanModeAuto	日本語を自動で検出
pageScanModeManual	指示したときだけ日本語を検出
manualPageScanShortcut	手動ページスキャンのショートカット
manualScanEnabled	手動ページスキャン
ocrInteractionMode	画像OCRスキャン
ocrInteractionModeAuto	自動
ocrInteractionModeManual	タップ/ホバー
ocrInteractionModeOff	オフ
puckMenuLabel	よむ メニュー
puckPowerOnFurigana	{APP_NAME} オン・ふりがな表示
puckPowerOnNoFurigana	{APP_NAME} オン・ふりがな非表示
puckPowerOff	{APP_NAME} オフ
puckOcrAuto	OCR: 自動
puckOcrManual	OCR: タップ/ホバー
puckOcrOff	OCR: オフ
autoplayAudioOn	音声の自動再生 オン
autoplayAudioOff	音声の自動再生 オフ
showFurigana	ふりがな注釈を有効にする
furiganaMode	ふりがな
wordColorStates	色を付ける単語
appearancePreset	かんたん設定
appearancePresetCustom	カスタム
appearancePresetBalanced	読みやすいバランス
appearancePresetNoColors	プレーンテキスト
appearancePresetNewOnly	新規単語に集中
appearancePresetUnderlineNew	控えめなハイライト
wordColorStatesAll	すべての学習状態
wordColorStatesNewOnly	新規・未追加のみ
hideFuriganaFor	ふりがなを隠す対象
hideColorFor	色を隠す対象
furiganaDifficultKanji	難しい漢字のみ
furiganaDifficultKanjiHelp	Yomuは初級漢字の固定リストを持ち、その外側の漢字にふりがなを表示します。ふりがなのない漢字は、そのリストに載っています。
statusColorNoSourceHelp	学習状態の色はデッキから読み取ります。StudyでAcademyを有効にするか、JPDB・Jiten・Ankiのいずれかを追加すると、単語が学習状態の色になります。
furiganaHideKnown	なじみのある語を非表示
furiganaHoverOnly	ホバー時に表示
furiganaAllParsed	解析済みの全単語
clampedRowReadings	省略行の読み
clampedRowReadingsShow	表示（行が広がる）
clampedRowReadingsHover	ホバー時のみ
showPitchAccent	発音を表示
showLookupPillFrequency	サイトの頻度をピルに表示
suppressRedundantWordUi	JPDBの冗長語のスタイルを非表示
sheetCloseButtonOnLeft	閉じるボタンを左に
hideKnownFurigana	既知カードのふりがなを非表示
readerHelp	ホバーキーを設定。空欄なら通常ホバー。
hoverLookupSettings	ホバー検索
kanjiOriginKanjiMapEnabled	漢字情報と部品グラフを表示
kanjiOriginGraphEnabled	部品グラフを表示
kanjiOriginRadicalImagesEnabled	部首画像を表示
audioEnabled	語句の音声を有効にする
autoPlayAudio	語句の音声を自動再生
suppressAutoAudioOnVideo	動画では検索音声オフ
audioAutoPlayMode	単語音声の自動再生
audioEnableDefaultSources	内蔵音声ソースを有効
audioFallbackChimeEnabled	フォールバック音を有効
audioPlayback	音声再生
audioTtsMode	読み上げの扱い
audioTtsFallback	録音音声の後のフォールバック
audioTtsSourceOrder	ソース順/シャッフルに含める
previewAudio	音声を試聴
audioHelp	URL: {term}、{reading}、{language}。
audioSource	音声ソース
urlVoice	URL / 音声
addAudioSource	音声ソースを追加
audioAutoPlayAll	ホバーとタップ/クリック
audioAutoPlayHover	ホバーのみ
audioAutoPlayTap	タップ/クリックのみ
automaticBrowserVoice	ブラウザの自動音声
savedVoiceLabel	保存済み音声: {voice}
audioSourceOrder	音声ソースの順序
audioSourceNumber	音声ソース {number}
enableAudioSourceNumber	音声ソース {number} を有効にする
enableLookupPillName	検索ピル「{name}」を有効にする
enableSourceName	ソース「{name}」を有効にする
textToSpeechVoiceNumber	読み上げ音声 {number}
audioSourceJpod101	JapanesePod101
audioSourceLanguagePod101	LanguagePod101
audioSourceJisho	Jisho.org
audioSourceBunpro	Bunpro
audioSourceLinguaLibre	(Commons) Lingua Libre
audioSourceWiktionary	(Commons) Wiktionary
audioSourceJitenTts	Jiten読み上げ
audioSourceJpdbTts	JPDB読み上げ
audioSourceTextToSpeech	ブラウザ読み上げ
audioSourceTextToSpeechReading	ブラウザ読み上げ (読み)
audioSourceCustom	直接音声ファイルURL
audioSourceCustomJson	カスタムURL
audioCustomJsonPlaceholder	Yomitan/Ultimate音声URL
audioCustomUrlPlaceholder	直接音声ファイルURL
audioBuiltInPlaceholder	内蔵ソースはURL不要
audioDetectingSubSources	内部ソースを確認中…
audioNoSubSourcesDetected	このURLは名前付きソースを返しませんでした。
audioSubSourcesHelp	このURLが提供するソース。不要なものはオフに:
audioSubSourceOverlapHint	下の単独ソースと重複
defaultVoiceSuffix	標準
audioGuideLinkLabel	Yomitan音声ガイド
audioProxyDeployGuide	プロキシの設定
immersionKitEnabled	イマージョンキット例文を表示
immersionKitExampleSource	例文プロバイダー
immersionKitAndNadeshiko	イマージョンキット + なでしこ
nadeshikoApiKey	なでしこAPIキー
getNadeshikoKey	キーを取得
immersionKitShowTranslation	例文の翻訳を表示
immersionKitRevealTranslationOnClick	クリックまで翻訳をぼかす
immersionKitShowImages	例文サムネイルを表示
immersionKitAutoPlayAudio	表示後や移動時に音声再生
immersionKitPlayOnHover	ホバーで例文音声を再生
immersionKitPlayOnImageClick	クリックで例文音声を再生
immersionKitLimitEnabled	単語ごとの例文数制限
immersionKitLimit	単語ごとの例文数（0 = すべて）
immersionKitPlaybackRate	例文音声速度
immersionKitHelp	例文を表示。Nadeshikoはキー必須。
anime	アニメ
drama	ドラマ
games	ゲーム
ocrEnabled	画像内テキストを読む
ocrAutoScanImages	画像を自動で読む
ocrShowTextOverlay	認識した画像テキスト領域を表示
ocrVideoPauseFrames	一時停止した動画フレームを自動で読む
ocrInvertDarkPanels	暗いコマの白い文字を読む
ocrProvider	画像読み取り
ocrOverlayTheme	OCRオーバーレイテーマ
ocrOverlayThemeAuto	アプリのテーマに合わせる
ocrOverlayThemeLight	ライトオーバーレイ
ocrOverlayThemeDark	ダークオーバーレイ
googleLens	Google Lens — 無料・設定不要（おすすめ）
cloudVision	Google Cloud Vision — APIキーが必要
localOcr	ローカルOCRサーバー — 上級者向け
off	オフ
ocrMaxImagesPerPage	ページごとに読む画像数
ocrMinImageArea	読む画像の最小サイズ
ocrMaxImagePixels	画像の精細さ
lightWork	軽め
normal	標準
more	多め
largeOnly	大きい画像のみ
includeSmall	小さい画像も含める
faster	高速
balanced	バランス
sharper	高精細
ocrTextColor	画像テキストの色
ocrOutlineColor	画像テキストの縁取り
ocrBackgroundOpacity	画像ハイライト不透明度
ocrFontScale	画像テキスト倍率
ocrEndpointUrl	ローカルOCRサーバーURL
ocrEngine	ローカルOCRエンジン
ocrEngineMangaOcr	MangaOCR（マンガに最適）
ocrEngineAppleVision	Apple Vision（macOS）
cloudVisionApiKey	Google Cloud Vision APIキー
ocrHelp	近くの画像を読み取ります。Google Lensは設定不要です。
ocrCloudHelp	Google Cloud Vision APIキーを貼ります。
ocrLocalHelp	MangaOCR/Apple VisionのローカルURLを入力します。
subtitleStyle	字幕スタイル
subtitleResetDefaults	標準に戻す
moveSubtitles	字幕を移動
moveSubtitlesAccessible	字幕を移動します。ドラッグするか、矢印キーまたはPage Up/Page Downキーを使います。Homeまたは0でリセットします。
moveSubtitleControls	字幕コントロール。タップで展開・折りたたみ。ドラッグまたは矢印キーで移動します。Homeまたは0でリセットします。
right	右
left	左
bottom	下
showWhenNeeded	コンパクト表示
hideControls	コントロールを隠す
alwaysVisible	常に表示
preview	プレビュー
youtubeImmersionEnabled	日本語のYouTubeのみ
preferJapaneseSiteLanguage	日本語版サイトをリクエスト
youtubeShowChannelRecommendations	日本語チャンネル候補を表示
youtubeShowFilterNotice	非表示動画の通知を表示
youtubeHelp	YouTubeを日本語向けに絞ります。
youtubeShowHiddenVideos	非表示動画を表示
youtubeHideHiddenVideos	非表示動画を隠す
youtubeHideNotice	通知を隠す
youtubeFilterShowing	{appName}は非表示のYouTube項目{count}件を表示中
youtubeFilterHid	{appName}は他の言語のYouTube項目{count}件を非表示
youtubeFilterVisible	日本語らしい項目{count}件は表示したままです。
youtubeToggleToastOn	YouTube没入フィルターをオンにしました。
youtubeToggleToastOff	YouTube没入フィルターをオフにしました。
ankiEnabled	Anki採掘を有効にする
ankiMineWithJpdb	API経由で追加するときAnkiにも追加
ankiCaptureScreenshot	可能なら文脈画像を添付
ankiConnectUrl	AnkiConnect URL
ankiDeck	Ankiデッキ
ankiModel	Ankiノートタイプ
mobileAnkiHandoff	モバイルAnki新規ノート作成
ankiTemplateMode	Ankiカードテンプレート
ankiFrontReading	単語優先の表面に読みを表示
ankiFrontSentence	単語優先の表面に文を表示
ankiFrontImage	表面に画像を表示
wordFirst	単語を先に表示
sentenceFirst	文を先に表示
ankiTags	タグ
sentenceFirstPreset	文を先に表示するプリセット
wordFirstPreset	単語を先に表示するプリセット
imageAbovePrompt	画像があれば問題文の上に表示します。
recallHighlightedWord	文脈からハイライト語を思い出します。
imageOnFront	利用可能な場合、画像は表面に表示されます。
recallMeaning	まず意味を思い出します。
ankiBackIncludes	辞書、漢字、ピッチ、頻度、出典、画像を含みます。
exampleMeaning	読む
scanAnkiFirst	先にAnkiConnectに接続
notMapped	対応付けなし
noScannedFields	読み取れるフィールドがありません。
mappingForNoteType	{model} の対応付け
currentNoteType	現在のノートタイプ
ankiFieldMappingSelect	{role}フィールド
ankiRoleExpression	表記
ankiRoleReading	読み
ankiRoleMeaning	意味
ankiRoleSentence	文
ankiRoleAudio	単語音声
ankiRoleSentenceAudio	文音声
ankiRoleImage	画像
testAnki	AnkiConnectを確認
prepareAnki	よむノートタイプを準備
updateAnkiModel	ノートタイプを更新
ankiModelUpdateAvailable	「{model}」に追加できる新しいフィールドがあります: {fields}
ankiModelUpdating	ノートタイプにフィールドを追加中...
ankiModelUpdated	ノートタイプを更新しました。{fields} を追加しました。
ankiModelUpToDate	ノートタイプは最新です。
ankiCheckingConnection	{url} のAnkiConnectを確認中。
ankiMiningDisabledStatus	Ankiマイニングは無効です。
ankiTesting	AnkiConnectを確認中...
ankiPreparing	よむデッキとノートタイプを作成または更新中...
ankiScanning	Ankiデッキ、ノートタイプ、フィールドを読み込み中...
ankiScanSummary	デッキ{decks}、ノート{models}。候補: {model}。{fields}
ankiScanNoModels	デッキ{decks}件を検出。ノートタイプは未取得です。
ankiScanFieldSummary	フィールド: {fields}
ankiUnreachable	デスクトップAnkiとAnkiConnectを確認してください。
ankiCorsBlocked	webCorsOriginListに「{origin}」を追加し再起動してください。
ankiSettingsUnreachable	AnkiConnectに接続できません。
ankiHostedBridgeMissing	よむを有効化し、更新してください。
ankiStatusOpenDesktop	デスクトップAnkiを開く
ankiStatusInstallAddon	AnkiConnectをインストール/有効化
ankiStatusMobileDocs	モバイル設定ドキュメント
ankiStatusUseDesktopUrl	モバイルではLAN/Tailscale URLを使う
ankiStatusEnableUserscript	よむを有効化
ankiStatusRefreshAndCheck	更新して再確認
ankiLibraryAdapter	既存ライブラリアダプター
ankiLibraryAdapterStatus	既存デッキから対応付けを提案します。
ankiLibraryChoices	デッキとノートタイプ
ankiLibraryChoicesHelp	作成・更新先を選びます。
ankiTemplateSettings	よむカードテンプレート
ankiTemplateSettingsHelp	よむノートタイプ用。テンプレートはAnkiに残ります。
ankiMappingConfidenceHelp	フィールド名とサンプルで判断します。
ankiMappingHighConfidence	高
ankiMappingMediumConfidence	中
ankiMappingLowConfidence	低
ankiHelp	AnkiConnectを入れてデスクトップ版Ankiを開きます。CORS表示が出る場合はこのサイトをwebCorsOriginListに追加してください。モバイル受け渡しは新規ノート作成のみです。
jpdbDefinitionsEnabled	JPDB定義を表示
${Object.entries(LOCAL_DICTIONARY_STORAGE_COPY.jaSettings).map(([key, value]) => `${key}\t${value}`).join('\n')}
localDictionaryMaxResults	辞書結果の上限
cloudSettingsSync	Google Drive設定同期
cloudSettingsSyncHelp	Yomuの設定をGoogle Driveのアプリデータに保存します。辞書は端末内に残ります。
academyAccountSync	Academyアカウント同期
academyAccountSyncHelp	ReaderのAcademy SRS進捗を、ログイン中のYomuアカウントと端末間で同期します。Webサイトでアカウントを作成または管理し、1回限りのペアリングコードを発行してください。
academyAccountManage	アカウントとペアリングコードを管理
academyPairingCode	1回限りのペアリングコード
academyPairingCodePlaceholder	XXXX-XXXX-XXXX-XXXX-XXXX
academyAccountConnect	接続
academyAccountSyncNow	今すぐ同期
academyRecoveryCodeCreate	Webサイト復旧コードを作成
academyRecoveryCodeCreating	1回限りのWebサイト復旧コードを作成中...
academyRecoveryCodeReady	Webサイト復旧コード: {code}。10分以内に「プロフィールと同期」で入力してください。
academyRecoveryCodeDone	Webサイト復旧コードを作成しました。
academyAccountDisconnect	接続解除
academyAccountChecking	Academyアカウントの接続を確認中...
academyAccountDisconnected	未接続です。アカウントに接続するまで、Academyの復習データはこの端末に保存されます。
academyAccountConnected	{name}として接続中です。
academyAccountConnectedNoName	Academyアカウントに接続中です。
academyAccountLastSynced	最終同期: {time}。
academyAccountNeverSynced	まだ同期していません。
academyAccountConnectionProblem	アカウント状態を更新できませんでした: {message}
academyAccountConnecting	接続してAcademyの進捗を同期中...
academyAccountSyncing	Academyの進捗を同期中...
academyAccountDisconnecting	このReaderの接続を解除中...
academyPairingCodeRequired	Yomuアカウントで1回限りのペアリングコードを発行し、入力してください。
academyAccountConnectedDone	Academyアカウントに接続し、進捗を同期しました。
academyAccountSyncedDone	Academyの進捗を同期しました。
academyAccountDisconnectedDone	このReaderの接続を解除しました。Academyの進捗は端末に残ります。
importSettings	設定JSONをインポート
exportSettings	設定JSONをエクスポート
importDictionaries	辞書をインポート
exportDictionaries	辞書をエクスポート
lookupPills	検索ピル
parserProvider	解析ソース
parserProviderLocal	ローカル辞書（オフライン）
parserProviderJiten	Jiten API
parserProviderJpdb	JPDB API
parserProviderAuto	自動（Jiten/JPDB）
parserProviderHelp	ローカルはインポート済み辞書でオフライン解析します。JitenとJPDBはキー設定時に必ずそのAPIを使います。自動は両方のキーがあれば優先採点サービスを使い、それ以外はJiten、次にJPDBを優先します。
lookupPillsHelp	外部リンクと頻度バッジを同じ順序で表示します。ローカル頻度辞書は一致するJiten/JPDBライブバッジを置き換えます。トークン: {query}、{word}、{reading}。
copiesCurrentWord	現在の単語をコピーします
plaintextHttpLink	プレーンテキストHTTPで開きます。
lookupPillLabelNumber	検索ピル{number}のラベル
lookupUrlTemplate	検索URLテンプレート
lookupUrlTemplateNumber	ピル{number} URL
lookupPillOrder	検索ピルの順序
builtInAction	内蔵アクション
recommendedDownloads	辞書
termDictionaries	語句辞書
kanjiDictionaries	漢字辞書
pitchDictionaries	ピッチ辞書
pronunciationDictionaries	発音辞書
frequencyDictionaries	頻度辞書
nameDictionaries	固有名詞辞書
grammarDictionaries	文法辞書
exampleDictionaries	例文辞書
thesaurusDictionaries	類語辞書
encyclopediaDictionaries	百科事典
utilityDictionaries	補助辞書
mirroredDictionaries	配信中のすべての辞書
mirroredDictionariesSummary	他{count}件の辞書 · 合計{size}
mirroredDictionarySearch	辞書を検索
mirroredDictionarySearchNoResults	検索に一致する辞書がありません。
install	インストール
installing	インストール中
installed	インストール済み
queued	待機中
dictionaryGuide	ガイド
download	ダウンロード
update	更新
checkingDictionaries	インポート済み辞書を確認中...
decksLoaded	JPDBアカウントからデッキを読み込みました。
decksUnavailable	デッキを読み込めません。保存IDは保持します。
addApiKeyChooseDecks	デッキを選ぶにはJPDB APIキーを追加してください。
miningDeck	採掘デッキ
neverForgetDeck	忘れないデッキ
blacklistDeck	ブラックリストデッキ
allStudyDecks	すべての学習デッキ
savedValue	保存済み: {value}
holdWhileHovering	ホバー中に押すキー
hoverOpenDelayMs	ホバーで開く遅延 (ms)
hoverCloseDelayMs	ホバーを閉じる遅延 (ms)
pressKeys	キーを押してください
blankPlainHover	空欄ならキーなしホバー
openSettings	設定を開く
resizeSettings	設定パネルのサイズ変更
closePopup	ポップアップを閉じる
previousLookupWord	前の単語
nextLookupWord	次の単語
playingAudioPreview	{APP_NAME}を再生中...
audioPreviewFailed	音声プレビューに失敗しました。
previousSubtitle	前の字幕
nextSubtitle	次の字幕
pauseVideo	動画を一時停止
readVideoFrame	動画フレームを読み取る（OCR）
readVideoFrameStop	動画フレームの読み取りを停止（OCR）
copySubtitle	字幕をコピー
toggleImageReading	画像読み取りを切り替え
toggleSubtitleOverlay	字幕オーバーレイを切り替え
toggleYoutubeImmersion	YouTubeフィルターを切り替え
readImagesNow	今すぐ画像を読む
massReviewVisible	画面内の単語を一括レビュー（Jiten）
massReviewNoWords	画面内に復習対象のJiten単語がありません。
massReviewNoKey	一括レビューにはJiten APIキーが必要です。
massReviewDone	{count}語を「Good」でレビューしました。
massReviewFailed	一括レビューに失敗しました。
adapterStateDisabled	オフ
adapterStateProbing	接続確認中
adapterStateUnreachable	接続不可
adapterStateConnected	接続済み
adapterStateScanning	スキャン中
adapterStateSuggested	対応付け済み
adapterStateStale	要確認
adapterStateReady	準備完了
ankiMappingConfidenceHigh	完全一致
ankiMappingConfidenceMedium	曖昧一致
ankiMappingConfidenceLow	未対応
ankiMappingStaleField	保存済みフィールドなし
helpLinksTitle	便利なページ
versionAndUpdates	バージョン
currentYomuVersion	Yomu
updateStatusIdle	現在 {current}。確認待ち。
updateStatusChecking	現在 {current}。確認中...
updateStatusCurrent	現在 {current}。最新 {latest}。最新です。
updateStatusAvailable	現在 {current}。最新 {latest}。更新できます。
updateStatusUnknown	現在 {current}。確認できません。必要なら再インストールしてください。
updateStatusIncomparable	現在 {current}。最新 {latest}。バージョンを比較できません。古い場合は「更新」を使ってください。
updateHelpNotesManager	よむスクリプトは1つだけ有効にしてください。「更新」でユーザースクリプトマネージャーのインストール画面が開きます。ブラウザにインストールブロックの警告が出る場合は、拡張機能ページでマネージャーの詳細を開き、「ユーザースクリプトを許可」（または開発者モード）を有効にしてから再試行してください。
updateHelpNotesManagerDashboard	Chrome または Edge では、「更新」を押すと Tampermonkey の更新手順が開きます。ダッシュボードの「ユーティリティ」→「ユーザースクリプトの更新を確認」を使うため、ウェブサイトからのインストールをブロックする警告を回避できます。
updateHelpNotesExternalManager	よむスクリプトは1つだけ有効にしてください。「更新」でスクリプトのソースが開き、ユーザースクリプトアプリが開いたタブから読み取って更新します。iPhone/iPadで更新が止まる場合は、このリンクをSafariで開いてタブを開いたままにしてください。
updateHelpNotesNoManager	この環境ではユーザースクリプトマネージャーが検出されませんでした。ブラウザはスクリプトの直接インストールをブロックするため、「更新」ではブラウザ別の手順があるインストールガイドを開きます。
updateHelpNotesExtensionStore	更新はブラウザの拡張機能ストアから届きます。
updateUserscript	更新
duplicateStatusSingle	有効なYomuランタイムは1つです（{kind}）。
duplicateStatusUnknown	重複確認はできません。よむが2つ表示される場合は古いスクリプトを無効にしてください。
ankiConnectSetupTitle	AnkiConnect設定
ankiConnectSetupCopy	デスクトップAnkiを開き、AnkiConnectを有効にしてください。ホスト版StudyではAnkiConnect側でYomuのオリジンを許可する必要があります。
ankiConnectSetupConfig	AnkiConnectのwebCorsOriginListに次のオリジンを追加してください。既存の項目は残します:
ankiConnectSetupMobile	スマホやiPadでは、デスクトップPCのLANまたはTailscale URLを使います。スマホ上のlocalhostはPCではなくスマホ自身を指します。
ankiConnectSetupBrave	BraveでローカルAnki確認がブロックされる場合は、StudyページのShieldsをオフにしてください。
helpSupportTitle	よむをサポート
helpSupportCopy	よむは検索、OCR、字幕、辞書、学習、Ankiをまとめた無料のツールです。
helpSupportCopyExtra	寄付は開発とサービス費用を支えます。
videoPlayer	動画プレイヤー
pdfReader	PDFリーダー
newTabPage	学習
github	GitHub
docs	ドキュメント
factoryReset	初期状態に戻す
factoryResetConfirm	{appName}の全データをリセットしますか？\n\n設定、キー、キャッシュ、辞書を削除。
factoryResetFailed	リセットに失敗しました。
factoryResetStorageIncomplete	保存データをすべて検出または削除できなかったため、リセットを中止しました。ほかのよむタブを閉じて再試行してください。解決しない場合は、ユーザースクリプトマネージャーでよむのストレージを消去してください。
factoryResetOtherTabReloading	別タブでリセット。再読み込み...
issues	Issue
donate	寄付
discord	Discord
enabledHeader	有効
labelHeader	ラベル
displayName	表示名
orderHeader	順序
removeHeader	削除
definitionSource	定義ソース
popupOrderTitle	ポップアップの順序
kanjiSection	漢字セクション
dragToReorder	ドラッグして並べ替え
moveUp	上へ移動
moveDown	下へ移動
remove	削除
removeImportedDictionary	インポート済み辞書を削除
customAdvanced	{label} (詳細)
importLocalDefinitionsHelp	ローカル定義にはYomitan辞書を使います。
metadataDictionariesHelp	メタデータ辞書は、バッジや漢字データとして表示されます。
sourceHelpJpdb	現在のカードのJPDB定義です。
sourceHelpJiten	Jiten定義、例文、関連語です。
sourceHelpBunpro	Bunproの語彙・文法の意味、ニュアンス、例文です。
sourceHelpWanikani	あなたのアカウントのWaniKani語彙の意味、覚え方、SRS状態です。
sourceHelpAnki	一致するAnkiカード内容と状態です。
sourceHelpTranslation	文の自動翻訳です。
sourceHelpGrammar	ローカル文法ヒントです。
sourceHelpImmersionKit	例文、画像、音声です。
sourceNameImmersionKit	イマージョンキット
sourceNameAnki	Anki
sourceNameTranslation	翻訳
sourceNameGrammar	文法
sourceNameStrokePractice	筆順練習
sourceNameImportedKanjiDictionaries	インポート済み漢字辞書
sourceNameWordsUsingKanji	相关词汇
sourceNameJitenKanjiFacts	Jiten漢字情報
sourceHelpImportedKanjiDictionary	インポート済みYomitan漢字辞書です。
sourceHelpStrokePractice	筆順プレビューと書き取りパッドです。
sourceHelpReadingsComponents	JPDBの読み、部品、語呂合わせです。
sourceHelpJitenKanjiFacts	Jitenの漢字情報、頻度、読み、使用語です。
sourceHelpRtk	RTKキーワード、要素、ストーリーです。
sourceHelpWanikaniKanji	WaniKaniの漢字の意味・読みの覚え方、レベル、SRS状態です。
sourceHelpImportedKanjiDictionaries	インポート済み漢字項目です。
sourceHelpWordsUsingKanji	関連語彙です。
sourceHelpComponentGraph	漢字情報、部品、部首画像です。
recommendedJitendex	例文付きの語句定義です。
recommendedWtyJapaneseJapanese	日本語で読む語句定義です。
recommendedPixivLight	Pixiv用語辞書です。
recommendedJpdbKanji	JPDB漢字情報です。
recommendedKanjiumPitch	ピッチアクセント専用です。定義には語句辞書も追加してください。
recommendedBccwj	BCCWJ由来の頻度バッジです。
recommendedJiten	Jiten由来の頻度バッジです。
`),
    ...SUBTITLE_SETTINGS_COPY.ja,
};

export interface GrammarRuleCopy {
    kind: string;
    short: string;
    detail: string;
}
export { resetJaGrammarRuleCopyCacheForTests } from './ja-grammar-rule-copy';

export function resolveUiLanguage(language: InterfaceLanguage): UiLanguage {
    if (language === 'ja' || language === 'en') return language;
    return browserPrefersJapanese() ? 'ja' : 'en';
}

export function nextExplicitUiLanguage(language: InterfaceLanguage): Exclude<InterfaceLanguage, 'auto'> {
    return resolveUiLanguage(language) === 'ja' ? 'en' : 'ja';
}

function browserPrefersJapanese(): boolean {
    const navigatorLanguages = typeof navigator === 'undefined'
        ? []
        : [
            ...(Array.isArray(navigator.languages) ? navigator.languages : []),
            navigator.language,
        ];
    return navigatorLanguages.some(isJapaneseLocale);
}

function isJapaneseLocale(value: unknown): boolean {
    return typeof value === 'string' && value.toLowerCase().startsWith('ja');
}

export async function grammarRuleText(language: InterfaceLanguage, ruleId: string): Promise<GrammarRuleCopy | undefined> {
    if (resolveUiLanguage(language) !== 'ja') return undefined;
    const copy = await loadJaGrammarRuleCopy();
    return copy[ruleId];
}

export function uiText(language: InterfaceLanguage, key: UiCopyKey): string {
    return resolveUiLanguage(language) === 'ja'
        // D43: the last resort is the English source, not the literal string
        // `未翻訳`. A placeholder reads as a bug and tells a learner nothing;
        // falling back down the chain to the source locale is the behaviour the
        // unified pipeline specifies (`src/reader/locales/resolve.ts`).
        ? JA_SETTINGS_COPY[key] ?? JA_COPY[key] ?? COPY.en[key]
        : COPY.en[key];
}

/**
 * The reader-chrome message inventory, for the D43 coverage gate.
 *
 * `src/reader/locales/registry.ts` needs the English source of every chrome
 * string to classify it into a copy tier and to measure per-locale coverage. It
 * reads it through these two functions rather than importing the maps, so the
 * maps stay private and the gate measures the same values the reader renders.
 */
export function chromeMessageSource(): Readonly<Record<string, string>> {
    return COPY.en;
}

export function chromeMessageSourceForLocale(
    locale: 'en' | 'ja',
): Readonly<Record<string, string>> {
    if (locale === 'en') return COPY.en;
    const japanese: Record<string, string> = {};
    for (const key of Object.keys(COPY.en) as UiCopyKey[]) {
        const value = JA_SETTINGS_COPY[key] ?? JA_COPY[key];
        if (typeof value === 'string' && value.length > 0) japanese[key] = value;
    }
    return japanese;
}

export function cardStateLabel(state: string, language: InterfaceLanguage, fallback = state): string {
    const key = CARD_STATE_LABEL_KEYS[state];
    return key ? uiText(language, key) : fallback;
}

export function audioSourceLabel(language: InterfaceLanguage, type: AudioSourceType): string {
    return uiText(language, AUDIO_SOURCE_LABEL_KEYS[type]);
}

export function formatUiText(language: InterfaceLanguage, key: UiCopyKey, values: Record<string, string | number>): string {
    const message = uiText(language, key);
    // D43 bidi isolation. A substituted value is almost always foreign to the
    // sentence around it — a Japanese term, a Latin source name, a URL, a
    // version, a count. Dropped raw into an Arabic or Farsi sentence it reorders
    // the sentence: a trailing bracket jumps to the wrong end, `1.8.40` reverses.
    // Isolation is applied only when the interface itself is RTL, so English and
    // Japanese output stays byte-identical and no test or snapshot moves.
    return isRtlInterface(language)
        ? formatIsolated(message, values)
        : Object.entries(values).reduce(
            (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
            message,
        );
}

export function uiList(language: InterfaceLanguage, parts: string[]): string {
    return new Intl.ListFormat(resolveUiLanguage(language), { style: 'short', type: 'conjunction' }).format(parts);
}

const AUDIO_SOURCE_LABEL_KEYS: Record<AudioSourceType, UiCopyKey> = {
    jpod101: 'audioSourceJpod101',
    'language-pod-101': 'audioSourceLanguagePod101',
    jisho: 'audioSourceJisho',
    bunpro: 'audioSourceBunpro',
    'lingua-libre': 'audioSourceLinguaLibre',
    wiktionary: 'audioSourceWiktionary',
    'jiten-tts': 'audioSourceJitenTts',
    'jpdb-tts': 'audioSourceJpdbTts',
    'text-to-speech': 'audioSourceTextToSpeech',
    'text-to-speech-reading': 'audioSourceTextToSpeechReading',
    custom: 'audioSourceCustom',
    'custom-json': 'audioSourceCustomJson',
};
