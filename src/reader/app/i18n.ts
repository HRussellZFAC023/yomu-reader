import { APP_NAME, DOCS_BASE_URL, SUPPORT_COPY, SUPPORT_COPY_EXTRA } from './constants';
import { requestJson } from '../network/http';
import type { AudioSourceType, InterfaceLanguage } from './types';

type UiLanguage = 'en' | 'ja';

const COPY = {
    en: {
        settingsTitle: `${APP_NAME} Settings`,
        welcomeLabel: `${APP_NAME} welcome`,
        onboardingEyebrow: 'Japanese, wherever it appears',
        onboardingCopy: 'Make Japanese text, subtitles, and images tappable.',
        onboardingLanguage: 'Settings language',
        onboardingAccentColor: 'Accent color',
        customAccentColor: 'Custom color',
        onboardingImmersionOptions: 'Immersion defaults',
        onboardingHoverShortcut: 'Lookup hover modifier',
        manualPageScanShortcut: 'Manual page scan shortcut',
        onboardingAddApiKey: 'Add API key',
        onboardingAddLocalDictionaries: 'Add local dictionaries',
        onboardingUseWithoutApiKey: 'Use without API key',
        closeOnboarding: 'Close welcome',
        featureText: 'Text',
        featureTextBody: 'Hover or tap scanned Japanese.',
        featureImages: 'Images',
        featureImagesBody: 'Read any image by tapping it.',
        featureVideo: 'Video',
        featureVideoBody: 'Make subtitle words tappable.',
        featureControl: 'Control',
        featureControlBody: 'Tune features, shortcuts, and color.',
        featureStudy: 'Study',
        featureStudyBody: 'Review words and kanji on the study page.',
        scanPage: 'Scan page',
        noUnscannedJapaneseText: 'No unscanned Japanese text found.',
        jpdbScanFailed: 'Page scan failed.',
        pageCoverageSummary: '{percent}% known · {known}/{total} · {unknown} new · {iPlusOne} i+1',
        settings: 'Settings',
        settingsSaved: 'Settings saved.',
        settingsSaveFailed: 'Settings save failed.',
        settingsSections: 'Settings sections',
        settingsSearch: 'Search settings',
        settingsSearchPlaceholder: 'Search settings',
        settingsSearchNoResults: 'No matches.',
        selectOptions: 'Options',
        save: 'Save',
        cancel: 'Cancel',
        show: 'Show',
        hide: 'Hide',
        appearance: 'Appearance',
        reading: 'Reading',
        dictionaries: 'Dictionaries',
        sources: 'Sources',
        media: 'Media',
        mining: 'Mining',
        shortcuts: 'Shortcuts',
        help: 'Help',
        interface: 'Interface',
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
        apiKey: 'API key',
        jitenApiKey: 'Jiten API key',
        apiAccess: 'API access',
        apiAccessHelp: 'Paste separate Jiten and JPDB keys. Study decks stay scoped to the selected provider; local dictionaries still work without keys.',
        jpdbSettings: 'JPDB settings',
        jitenSettings: 'Jiten settings',
        jpdbApiKeyConfigured: 'JPDB key set.',
        jpdbAndJitenApiKeysConfigured: 'Jiten and JPDB keys are set.',
        jpdbApiKeyMissing: 'No JPDB key.',
        jpdbConnected: 'Connected to JPDB.',
        jpdbAndJitenConnected: 'Connected to Jiten and JPDB.',
        jpdbConnectionFailed: 'JPDB did not accept the key (network or invalid key).',
        jitenApiKeyConfigured: 'Jiten key set.',
        jitenApiKeyMissing: 'No Jiten key.',
        statusEnabled: 'enabled',
        statusDisabled: 'disabled',
        statusReady: 'Ready',
        statusAttention: 'Needs setup',
        statusError: 'Error',
        disabledControlDescription: 'Controlled by another setting.',
        jpdbMiningEnabled: 'Allow API review/deck changes',
        addToForq: 'Also copy JPDB adds to forq',
        enableReviews: 'Show review buttons',
        reviewRatingScale: 'Review rating scale',
        gradeTargetSelector: 'Grade target',
        gradeTargetBoth: 'Both',
        gradeTargetJpdb: 'Grades JPDB',
        gradeTargetJiten: 'Grades Jiten',
        gradeTargetAnki: 'Grades Anki card: {target}',
        gradeTargetJpdbAndAnki: 'Grades JPDB + Anki card: {target}',
        gradeTargetJitenAndAnki: 'Grades Jiten + Anki card: {target}',
        missingAnkiCardId: 'Missing Anki card id.',
        jpdbPageEnhancements: 'Dictionary site enhancements',
        jpdbPageEnhancementsEnabled: 'Enhance dictionary pages',
        jpdbPageWordEnhancementsEnabled: 'Add sources to word/search pages',
        jpdbPageKanjiEnhancementsEnabled: 'Add sources to kanji pages',
        jpdbPageEnhancementsHelp: '',
        fivePoint: 'Five point: NOTHING to EASY',
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
        bottomSheet: 'Bottom sheet',
        popover: 'Popover',
        stickyBottomSheet: 'Keep sheet open after lookup',
        popoverBackdropEnabled: 'Dim page behind popover',
        popoverWidth: 'Popover width (px)',
        popoverHeight: 'Popover height (px)',
        popoverHeightMode: 'Popover height behavior',
        popoverHeightAvailable: 'Grow to available space',
        popoverHeightFixed: 'Use height setting',
        readerFontFamily: 'Reader interface font',
        popupFontFamily: 'Popup Japanese font',
        fontPresetYomuDefault: 'Built-in font',
        fontPresetJapaneseSans: 'Japanese sans',
        fontPresetHiraginoYuGothic: 'Hiragino / Yu Gothic',
        fontPresetJapaneseRounded: 'Japanese rounded',
        fontPresetJapaneseSerif: 'Japanese serif',
        fontPresetSystemUi: 'System UI',
        fontPresetCustom: 'Custom...',
        customFontFamily: 'Custom font stack',
        popupFontWeight: 'Popup Japanese weight',
        enableLogging: 'Enable diagnostic logging',
        diagnostics: 'Diagnostics',
        diagnosticsHelp: 'Print diagnostics to the console.',
        accentColor: 'Accent color',
        newTab: 'Study',
        newTabEnabled: 'Set Study as the new tab',
        newTabAnkiEnabled: 'Use Anki cards in Study',
        newTabAnkiReviewDecks: 'Anki review decks',
        newTabAnkiReviewDecksHelp: 'Uncheck decks to skip.',
        newTabSource: 'Study review source',
        newTabAuto: 'Auto: API/Anki, then study words',
        newTabApiSrs: 'API SRS (Jiten / JPDB)',
        dictionaryFallback: 'Dictionary fallback',
        newTabJpdbReviewMode: 'API review mode',
        newTabJpdbReviewAuto: 'Auto: live kanji + API vocabulary',
        newTabLiveReview: 'Live JPDB review session',
        newTabApiVocabulary: 'API vocabulary only',
        corsProxyUrl: 'Cross-origin proxy URL',
        newTabKanjiKeywordSource: 'Kanji keyword source',
        newTabKanjiKeywordAuto: 'Auto: RTK, then {service} kanji facts, then local',
        newTabKanjiKeywordRtk: 'RTK / Heisig',
        newTabKanjiKeywordApiFacts: '{service} kanji facts (Jiten / JPDB)',
        newTabKanjiKeywordLocal: 'Local card meaning',
        newTabParsingEnabled: 'Enable sentence parsing on Study',
        newTabFrontSentenceEnabled: 'Show sentence on word fronts',
        newTabKanjiAutogradeEnabled: 'Auto-grade kanji drawing',
        newTabKanjiAutoSubmit: 'Auto-submit kanji grade',
        newTabOfflineEnabled: 'Cache Study for offline use',
        newTabOfflineLimit: 'Offline review cache limit',
        newTabDailyGoalMinutes: 'Daily study goal (minutes, 0 = off)',
        newTabKanjiUnlockEnabled: 'Study kanji before unlocking words',
        newTabStopAtBatchEnd: 'Stop at the end of each batch',
        newTabSwipeReviews: 'Swipe cards to grade (left = fail, right = pass)',
        newTabUrl: 'Study address',
        newTabOfflineHelp: 'Caches due cards and queued grades.',
        newTabAddressHelp: 'Use as a start page or iPad shortcut.',
        newTabJpdbDeck: 'Study JPDB deck',
        openNewTabPage: 'Open Study',
        copyAddress: 'Copy address',
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
        pitchColorKifuku: 'Kifuku (variable)',
        pitchColorUnknown: 'Unknown / inherited',
        colorChannels: 'Color channels',
        wordHighlightColorSource: 'Word highlight color',
        wordUnderlineColorSource: 'Word underline color',
        wordTextColorSource: 'Word text color',
        subtitleHighlightColorSource: 'Subtitle highlight color',
        subtitleUnderlineColorSource: 'Subtitle underline color',
        subtitleTextColorSource: 'Subtitle text color',
        colorSourceStatus: 'JPDB + Anki status',
        colorSourceJpdb: 'JPDB status',
        colorSourceAnki: 'Anki status',
        colorSourcePitch: 'Pitch accent',
        colorChannelsHelp: '',
        interfaceHelp: '',
        popupLookup: 'Popup lookup',
        popupLookupEnabled: 'Show Yomu lookup popup',
        popupLookupHelp: "Off for another reader's popups. Yomu tools stay on.",
        parseSelection: 'Selection popups',
        lookupOnClick: 'Look up on tap or click',
        lookupOnHover: 'Look up on hover',
        lookupOnMiddleMouse: 'Look up with middle-mouse hold',
        showFloatingButton: 'Show settings puck',
        pageScanMode: 'Page scanning',
        pageScanModeOff: 'Off',
        pageScanModeAuto: 'Auto',
        pageScanModeManual: 'Manual',
        manualScanEnabled: 'Manual page scanning',
        ocrInteractionMode: 'Image OCR scanning',
        ocrInteractionModeAuto: 'Auto',
        ocrInteractionModeManual: 'Tap or hover',
        ocrInteractionModeOff: 'Off',
        puckMenuLabel: `${APP_NAME} menu`,
        puckStudyPage: 'Study page',
        puckPauseAnnotations: 'Pause annotations',
        puckResumeAnnotations: 'Resume annotations',
        puckOcrAuto: 'OCR: Auto',
        puckOcrManual: 'OCR: Tap/Hover',
        puckOcrOff: 'OCR: Off',
        annotationsPausedToast: 'Annotations paused.',
        annotationsResumedToast: 'Annotations resumed.',
        puckMuteAudio: 'Mute auto-play audio',
        puckUnmuteAudio: 'Unmute auto-play audio',
        autoplayAudioOnToast: 'Auto-play audio on.',
        autoplayAudioOffToast: 'Auto-play audio muted.',
        showFurigana: 'Enable furigana annotations',
        furiganaMode: 'Furigana',
        wordColorStates: 'Color words',
        appearancePresetCustom: 'Keep current custom settings',
        appearancePresetBalanced: 'Balanced reading',
        appearancePresetNoColors: 'Plain text',
        appearancePresetNewOnly: 'Focus on new words',
        appearancePresetUnderlineNew: 'Minimal highlights',
        wordColorStatesAll: 'Use all learning states',
        wordColorStatesNewOnly: 'Only new / not-in-deck words',
        furiganaDifficultKanji: 'Hard kanji only',
        furiganaHideKnown: 'Hide familiar words',
        furiganaHoverOnly: 'Show on hover',
        furiganaAllParsed: 'Show on every parsed word',
        showPitchAccent: 'Show pitch accent',
        showLookupPillFrequency: 'Show site frequency in pills',
        suppressRedundantWordUi: 'Hide JPDB-redundant styling',
        sheetCloseButtonOnLeft: 'Sheet close button on left',
        hideKnownFurigana: 'Hide furigana for known cards only',
        readerHelp: 'Set a hover key. Blank means plain hover.',
        hoverLookupSettings: 'Hover lookup',
        kanjiOriginKanjiMapEnabled: 'Show kanji facts and component graph',
        kanjiOriginGraphEnabled: 'Show component graph',
        kanjiOriginRadicalImagesEnabled: 'Show radical images',
        similarKanjiWordLimit: 'Similar word limit',
        loadingSimilarWords: 'Loading words...',
        openToLoadSimilarWords: 'Open to load words.',
        noSimilarWords: 'No additional words found.',
        kanjiHelp: '',
        audioEnabled: 'Enable term audio',
        autoPlayAudio: 'Auto-play term audio',
        suppressAutoAudioOnVideo: 'Disable lookup audio on video pages',
        audioAutoPlayMode: 'Auto-play trigger',
        audioEnableDefaultSources: 'Enable built-in audio sources',
        audioFallbackChimeEnabled: 'Enable fallback chime',
        audioSelectionMode: 'When several sources or clips exist',
        audioPlayback: 'Audio playback',
        firstAudio: 'First audio',
        randomAudio: 'Shuffle audio',
        audioTtsMode: 'Text-to-speech handling',
        audioTtsFallback: 'Fallback after recorded audio',
        audioTtsSourceOrder: 'Follow source order / shuffle',
        audioTimeoutMs: 'Audio timeout (ms)',
        previewAudio: 'Preview audio',
        audioHelp: 'URL tokens: {term}, {reading}, {language}.',
        audioSource: 'Audio source',
        urlVoice: 'URL / voice',
        addAudioSource: 'Add audio source',
        audioAutoPlayAll: 'Hover and tap/click',
        audioAutoPlayHover: 'Hover only',
        audioAutoPlayTap: 'Tap/click only',
        automaticBrowserVoice: 'Automatic browser voice',
        savedVoice: 'Saved voice',
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
        audioSourceLinguaLibre: '(Commons) Lingua Libre',
        audioSourceWiktionary: '(Commons) Wiktionary',
        audioSourceJitenTts: 'Jiten text-to-speech',
        audioSourceJpdbTts: 'JPDB text-to-speech',
        audioSourceTextToSpeech: 'Text-to-speech',
        audioSourceTextToSpeechReading: 'Text-to-speech (Kana reading)',
        audioSourceCustom: 'Custom direct audio file URL',
        audioSourceCustomJson: 'Custom URL',
        audioCustomJsonPlaceholder: 'Yomitan or Ultimate audio source URL',
        audioCustomUrlPlaceholder: 'Direct audio file URL',
        audioBuiltInPlaceholder: 'Built-in source, no URL needed',
        defaultVoiceSuffix: 'default',
        audioGuideLinkLabel: 'Yomitan audio guide',
        audioProxyGuideSummary: 'Make your own Cloudflare proxy',
        audioProxyGuideIntro: 'Use a Worker when you want a private proxy.',
        audioProxyGuideCloudflare: 'Open Cloudflare.',
        audioProxyGuideWorkers: 'Open Workers & Pages, then Create.',
        audioProxyGuideCreateWorker: 'Choose Worker, name it, deploy.',
        audioProxyGuideEditCode: 'Paste the Yomu Worker source.',
        audioProxyGuideDeploy: 'Deploy.',
        audioProxyGuideCopyUrl: 'Copy the Worker URL.',
        audioProxyGuidePasteUrl: 'Paste it into Cross-origin proxy URL.',
        audioProxyGuideTest: 'Save, then test lookup/import/audio.',
        audioProxyGuideNote: 'Limit hosts before sharing.',
        audioProxyWorkerSource: 'Worker source',
        audioProxyDeployGuide: 'Deploy guide',
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
        immersionKitCategory: 'Immersion Kit category',
        immersionKitSort: 'Example order',
        immersionKitLimitEnabled: 'Examples per word limit',
        allExamples: 'All examples',
        limitExamples: 'Limit examples',
        immersionKitLimit: 'Examples per word',
        immersionKitMinLength: 'Minimum sentence length',
        immersionKitMaxLength: 'Maximum sentence length',
        immersionKitPlaybackRate: 'Example audio speed',
        immersionKitExactMatch: 'Prefer exact matches',
        immersionKitHelp: 'Examples appear in popups. Nadeshiko needs a key.',
        loadingExamples: 'Loading examples...',
        noImmersionExamples: 'No Immersion Kit examples found.',
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
        allCategories: 'All',
        anime: 'Anime',
        drama: 'Drama',
        games: 'Games',
        shortestFirst: 'Shortest first',
        longestFirst: 'Longest first',
        randomOrder: 'Random',
        ocrEnabled: 'Read text in images',
        ocrAutoScanImages: 'Read images automatically',
        ocrShowTextOverlay: 'Show recognized text areas',
        ocrVideoPauseFrames: 'Read paused video frames',
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
        ocrBackgroundColor: 'Image highlight',
        ocrBackgroundOpacity: 'Image highlight opacity',
        ocrFontScale: 'Image text scale',
        ocrEndpointUrl: 'Local OCR server URL',
        ocrCustomLocalServer: 'Local OCR server URL',
        ocrEngine: 'Local OCR engine',
        ocrEngineMangaOcr: 'MangaOCR (best for manga)',
        ocrEngineAppleVision: 'Apple Vision (macOS)',
        cloudVisionApiKey: 'Google Cloud Vision API key',
        ocrHelp: 'Reads nearby images. Google Lens needs no setup.',
        ocrCloudHelp: 'Paste a Google Cloud Vision API key.',
        ocrLocalHelp: 'Run MangaOCR/Apple Vision locally and enter its URL.',
        subtitlePlayerEnabled: 'Enable video subtitle player',
        subtitleAutoDetect: 'Auto-detect page subtitles',
        subtitleOverlayVisible: 'Show subtitle overlay',
        subtitleSecondaryVisible: 'Show native subtitles',
        subtitleNativeBlurred: 'Blur native subtitles until hover',
        subtitleKaraokeMode: 'Karaoke word timing',
        subtitleTranscriptVisible: 'Open transcript panel by default',
        subtitlePausePanel: 'Open side panel when paused',
        subtitleTranscriptPlacement: 'Transcript panel position',
        subtitleTranscriptAutoScroll: 'Scroll transcript with playback',
        subtitleTranscriptAutoScrollResumeSeconds: 'Resume auto-scroll delay (s)',
        subtitleAutoCopyLine: 'Auto-copy subtitle lines',
        subtitleMiningPause: 'Pause video on subtitle click',
        subtitleHoverPause: 'Pause video on subtitle hover',
        subtitleControlsMode: 'Subtitle controls',
        right: 'Right',
        left: 'Left',
        bottom: 'Below',
        showWhenNeeded: 'Compact controls',
        hideControls: 'Hide controls',
        alwaysVisible: 'Always visible',
        subtitleFontSize: 'Subtitle font size (px)',
        subtitleBottomOffset: 'Subtitle bottom offset (%)',
        subtitleTextColor: 'Subtitle color',
        subtitleOutlineColor: 'Subtitle outline',
        subtitleBackgroundColor: 'Subtitle background',
        subtitleBackgroundOpacity: 'Subtitle background opacity',
        subtitleFontFamily: 'Subtitle font family',
        subtitleFontWeight: 'Subtitle font weight',
        subtitleSeekPadding: 'Subtitle seek padding (s)',
        subtitlePreview: 'Live subtitle preview',
        preview: 'Preview',
        youtubeImmersionEnabled: 'Japanese YouTube only',
        preferJapaneseSiteLanguage: 'Prefer Japanese site language and location',
        youtubeShowChannelRecommendations: 'Show Japanese channel suggestions',
        youtubeShowFilterNotice: 'Show hidden-video notice',
        youtubeHelp: 'Prefer Japanese UI and Japan-local content.',
        youtubeFilterOn: 'YouTube filter on',
        youtubeFilterOff: 'YouTube filter off',
        youtubeShowHiddenVideos: 'Show hidden videos',
        youtubeHideHiddenVideos: 'Hide hidden videos',
        youtubeHideNotice: 'Hide notice',
        youtubeFilterShowing: '{appName} shows {count} hidden item{plural}',
        youtubeFilterHid: '{appName} hid {count} non-Japanese item{plural}',
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
        noScannedFields: '',
        mappingForNoteType: 'Mapping for {model}',
        currentNoteType: 'current note type',
        ankiFieldMappingSelect: '{role} field',
        ankiRoleExpression: 'Expression',
        ankiRoleReading: 'Reading',
        ankiRoleMeaning: 'Meaning',
        ankiRoleSentence: 'Sentence',
        ankiRoleAudio: 'Audio',
        ankiRoleImage: 'Image',
        testAnki: 'Check AnkiConnect',
        prepareAnki: 'Create Yomu note type',
        ankiCheckingConnection: 'Checking AnkiConnect at {url}.',
        ankiMiningDisabledStatus: 'Anki mining disabled.',
        ankiTesting: 'Checking AnkiConnect...',
        ankiPreparing: 'Creating Yomu deck/note type...',
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
        localDictionariesEnabled: 'Show imported dictionary definitions',
        dictionarySourcesInitiallyExpanded: 'Open sources by default',
        localDictionaryMaxResults: 'Dictionary result limit',
        cloudSettingsSync: 'Google Drive settings sync',
        cloudSettingsSyncHelp: 'Stores your Yomu settings in Google Drive app data. Dictionaries stay local.',
        importSettings: 'Import settings JSON',
        exportSettings: 'Export settings JSON',
        importDictionaries: 'Import dictionaries',
        exportDictionaries: 'Export dictionaries',
        dictionaryImportHelp: 'Import a Yomitan ZIP, settings export, or backup. Term, pitch, and frequency dictionaries add definitions, accents, and badges.',
        lookupPills: 'Lookup pills',
        lookupPillsHelp: 'External links and frequency badges in one order. Local frequency dictionaries replace matching live Jiten/JPDB badges. Tokens: {query}, {word}, {reading}.',
        copiesCurrentWord: 'Copies the current word',
        lookupPillLabel: 'Lookup pill label',
        lookupPillLabelNumber: 'Lookup pill {number} label',
        lookupUrlTemplate: 'Lookup URL template',
        lookupUrlTemplateNumber: 'Pill {number} URL',
        lookupPillOrder: 'Lookup pill order',
        builtInAction: 'Built-in action',
        recommendedDownloads: 'Dictionaries',
        termDictionaries: 'Term dictionaries',
        kanjiDictionaries: 'Kanji dictionaries',
        pitchDictionaries: 'Pitch dictionaries',
        frequencyDictionaries: 'Frequency dictionaries',
        install: 'Install',
        installing: 'Installing',
        queued: 'Queued',
        dictionaryGuide: 'Guide',
        saveAfterInstall: 'Save after install',
        download: 'Download',
        downloadAndImport: 'Download and import',
        update: 'Update',
        noLocalDictionaries: 'No term dictionary imported yet. Install JMdict, Jitendex, or WTY for definitions; pitch/frequency dictionaries only add accents or badges.',
        checkingDictionaries: 'Checking imported dictionaries...',
        dictionaryOnlyJpdb: 'Only JPDB is enabled. Import JMdict, Jitendex, WTY, or another term dictionary for local definitions.',
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
        dictionaryDownloadTimedOut: 'Dictionary download timed out.',
        dictionaryDownloadNotZip: 'Download was not a ZIP.',
        dictionaryDownloadNeedsBridge: 'Download needs bridge; else import ZIP.',
        dictionaryDownloadBlocked: 'Download blocked. Import the ZIP.',
        dictionaryManualDownloadHint: 'Enable userscript or import the ZIP.',
        dictionaryInstallQueueHelp: 'Install a term dictionary first for definitions. Pitch and frequency dictionaries add accents and badges, not normal definition text.',
        dictionaryInstallQueued: '{dictionary} queued.',
        dictionaryInstallSaveBlocked: 'Import running. Save unlocks when done.',
        dictionaryImportQueueStatus: '{count} install{plural} running.',
        dictionaryRemoveConfirm: 'Remove "{dictionary}"?',
        dictionaryRemoving: 'Removing {dictionary}...',
        dictionaryRemoved: 'Removed {dictionary}.',
        dictionaryImportComplete: 'Imported {records} from {sources} source{plural}.',
        dictionaryRecordsImported: '{dictionary}: {records} records.',
        settingsImported: 'Settings imported.',
        settingsImportedWithDetails: 'Settings imported; {details}.',
        settingsExported: 'Settings exported.',
        restoredStoredChoices: 'restored {count} stored choice{plural}',
        importedDictionaryRecordCount: 'imported {count} dictionary record{plural}',
        dictionaryNoSupportedBanks: 'No supported banks found.',
        dictionaryUnsupportedJson: 'Use Dexie, ZIP, or export.',
        dictionaryZipMissingIndex: 'ZIP missing index.json.',
        yomitanSettingsInvalid: 'Not a Yomitan settings export.',
        localDictionaryText: 'Dictionary text',
        localSenseSingular: 'meaning',
        localSensePlural: 'meanings',
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
        blankPlainHover: 'Blank means hover without a key',
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
        audioRequestReturnedNonAudio: 'Audio request returned non-audio',
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
        playVideo: 'Play video',
        pauseVideo: 'Pause video',
        enterFullscreen: 'Enter fullscreen',
        exitFullscreen: 'Exit fullscreen',
        copySubtitle: 'Copy subtitle',
        subtitleFallbackLabel: 'Subtitle',
        subtitlesTitle: 'Subtitles',
        openSubtitlePanel: 'Open subtitle panel',
        closeSubtitlePanel: 'Close subtitle panel',
        subtitleStyle: 'Subtitle style',
        subtitleResetDefaults: 'Reset defaults',
        closeSubtitleDrawer: 'Close subtitle drawer',
        enableSubtitleAutoHide: 'Auto-hide panel while playing',
        disableSubtitleAutoHide: 'Keep panel open while playing',
        subtitleAutoHideShort: 'Auto',
        loadJapaneseSubtitles: 'Load Japanese subtitles',
        loadPrimarySubtitles: 'Load primary subtitles',
        loadNativeSubtitles: 'Load native subtitles',
        searchAnimeSubtitles: 'Search anime subtitles',
        toggleNativeSubtitleBlur: 'Toggle native subtitle blur',
        subtitleTrackDetectedSingular: '1 subtitle track detected',
        subtitleTracksDetected: 'subtitle tracks detected',
        noSubtitleTracksDetected: 'No subtitle tracks detected yet.',
        resizeTranscriptPanel: 'Resize transcript panel',
        resizeSubtitleTracksPanel: 'Resize subtitle tracks panel',
        subtitleNavigation: 'Subtitle nav',
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
        noAutoDetectedSubtitleTracks: '',
        autoDetectedTracksWillAppear: 'Subtitle tracks appear here.',
        autoDetectedOptionSingular: '1 subtitle option',
        autoDetectedOptions: 'subtitle options',
        detected: 'Detected',
        japaneseOverlay: 'Japanese overlay',
        primaryOverlay: 'primary overlay',
        nativeOverlay: 'native overlay',
        unsetJapaneseSubtitles: 'Unset Japanese',
        unsetPrimarySubtitles: 'Unset primary',
        japaneseSubtitles: 'Japanese',
        primarySubtitles: 'Primary',
        unsetNativeSubtitles: 'Unset native',
        nativeSubtitles: 'Native',
        chooseJapaneseSubtitles: 'Choose Japanese subtitles',
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
        ocrEnabledToast: 'Image reading enabled.',
        ocrHiddenToast: 'Image reading hidden.',
        ocrPlayVideo: 'Play video',
        ocrResumeVideo: 'Resume video',
        ocrPausedFrameScanning: 'Scanning...',
        ocrPausedFrameReady: 'Text ready',
        ocrPausedFrameNoText: 'No text found',
        ocrPausedFrameFailed: 'Could not read text',
        ocrNoReadableImages: 'No readable images nearby.',
        gradeNothing: 'Grade NOTHING',
        gradeSomething: 'Grade SOMETHING',
        gradeHard: 'Grade HARD',
        gradeOkay: 'Grade OKAY',
        gradeEasy: 'Grade EASY',
        gradeFail: 'Pass/fail: FAIL',
        gradePass: 'Pass/fail: PASS',
        helpLinksTitle: 'Useful pages',
        helpLinksCopy: 'Open reader tools and docs from here.',
        versionAndUpdates: 'Version',
        currentYomuVersion: 'Yomu',
        updateStatusIdle: 'Current {current}. Latest check pending.',
        updateStatusChecking: 'Current {current}. Checking latest...',
        updateStatusCurrent: 'Current {current}. Latest {latest}. Up to date.',
        updateStatusAvailable: 'Current {current}. Latest {latest}. Update available.',
        updateStatusUnknown: 'Current {current}. Latest check failed; reinstall if needed.',
        updateHelpNotes: 'Keep one Yomu script enabled. If updates stall on iPhone/iPad, open this link in Safari.',
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
        localAudio: 'Local Audio',
        changelog: 'Changelog',
        support: 'Support',
        github: 'GitHub',
        word: 'Word',
        search: 'Search',
        statsImportJpdbHistory: 'Import JPDB review history',
        openYomuSettings: `Open ${APP_NAME} settings`,
        newTabAddressCopied: 'Study address copied.',
        loading: 'Loading...',
        refreshing: 'Refreshing...',
        reveal: 'Reveal',
        revealTranslation: 'Reveal translation',
        immersionExampleControls: 'Immersion Kit example controls',
        loadingKanjiDetails: 'Loading kanji details...',
        loadingMnemonicImages: 'Loading mnemonic images...',
        lookupDialog: `${APP_NAME} lookup`,
        resizeLookupSheet: 'Drag to resize lookup sheet, or tap to close',
        showMiningActions: 'Show mining actions',
        hideMiningActions: 'Hide mining actions',
        switchReviewTarget: 'Switch review target',
        switchGradingProvider: 'Switch grading provider',
        jpdbKanjiUpdated: 'JPDB kanji updated.',
        jpdbKanjiUpdateFailedRuntime: 'Could not update JPDB kanji. Check kanji reviews.',
        apiSrsActionsDisabled: 'API mining actions are disabled in settings.',
        addJpdbApiKeyReview: 'Add a JPDB API key to review JPDB cards.',
        addJitenApiKeyReview: 'Add a Jiten API key to review Jiten cards.',
        actionFailed: 'Action failed.',
        dictionary: 'Dictionary',
        dictionariesExported: 'Dictionaries exported.',
        local: 'Local',
        dict: 'dict',
        filterStudy: 'Study',
        filterAll: 'All',
        sourceAuto: 'Auto',
        sortRandom: 'Random',
        sortFrequency: 'Frequency',
        sortState: 'State',
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
        factoryResetDictionaryWarning: 'Settings reset. Close other tabs.',
        factoryResetOtherTabReloading: 'よむ reset elsewhere. Reloading...',
        factoryResetDeleteSettingsFailed: 'Could not delete settings.',
        issues: 'Issues',
        donate: 'Donate',
        discord: 'Discord',
        documentation: 'Documentation',
        openOnJpdb: 'Open on JPDB',
        openOnLookup: 'Open on {label}',
        copyWord: 'Copy',
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
        kanjiMapData: 'Kanji Map data',
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
        addToMining: 'Add to deck',
        addToMiningHint: 'Add to selected API SRS deck.',
        addToDeck: 'Add to deck',
        addToDeckHint: 'Add without grading.',
        deck: 'Deck',
        deckActions: 'Deck actions',
        reviewAddsToDeck: 'Reviewing will add new words to',
        reviewBlockedBlacklisted: 'Blacklisted. Unlist before reviewing.',
        reviewBlockedNeverForget: 'Never-forget. Remove before reviewing.',
        reviewBlockedLocked: 'Locked. Unlock before reviewing.',
        reviewBlockedRedundant: 'JPDB marks this redundant.',
        ankiCardsSuspended: 'Suspended in Anki (works like a blacklist).',
        ankiCardsUnsuspended: 'Unsuspended in Anki.',
        ankiNeverForgetTagAdded: 'Tagged yomu-never-forget.',
        ankiNeverForgetTagRemoved: 'Removed yomu-never-forget.',
        forget: 'Forget',
        never: 'Never forget',
        neverHint: 'Move to never-forget and count as known.',
        forgetHint: 'Remove from never-forget to mine/review.',
        unlist: 'Unlist',
        unlistHint: 'Remove from blacklist to mine/review.',
        blacklist: 'Blacklist',
        blacklistHint: 'Ignore this exact word.',
        vocabularyStatusUpdated: 'Vocabulary status updated.',
        addToAnki: 'Add to Anki',
        checkingAnki: 'Checking Anki...',
        sendToMobileAnki: 'Send to {app}',
        mobileAnkiActionHint: 'Opens mobile Anki for a new note.',
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
        gradeJpdbCardTarget: 'Grades API SRS card',
        ankiMergeNeedsDesktop: 'Merging needs desktop AnkiConnect.',
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
        ankiConnectNeedsBridge: 'AnkiConnect needs the userscript bridge.',
        mobileAnkiReady: 'Anki offline. Handoff can create notes.',
        ankiConnectionReady: 'Connected. AnkiConnect is reachable.',
        ankiConnectedReady: 'Connected. "{deck}" / "{model}" ready.',
        ankiPromptRecallWord: 'Recall the highlighted word.',
        ankiMeaningHeading: 'Meaning',
        ankiPitchHeading: 'Pitch',
        ankiPartOfSpeechHeading: 'Part of speech',
        ankiLinksHeading: 'Links',
        ankiSourceHeading: 'Source',
        ankiTemplateContext: 'Context',
        ankiTemplateRecognition: 'Recognition',
        ankiLocalDictionaryStatus: 'local dictionary',
        selection: 'Selection',
        parsedFrom: 'Parsed from',
        selectionPopoverShowTranslation: 'Show translation in selection popovers',
        imageReadingEnabled: 'Image reading enabled.',
        imageReadingHidden: 'Image reading hidden.',
        ocrModeAutoToast: 'Image OCR automatic.',
        ocrModeManualToast: 'Image OCR on tap or hover.',
        ocrModeOffToast: 'Image OCR off.',
        subtitleOverlayEnabled: 'Subtitle overlay enabled.',
        subtitleOverlayHidden: 'Subtitle overlay hidden.',
        reviewFailed: 'Review failed.',
        reviewActionsDisabled: 'Review actions are disabled in settings.',
        jpdbLookupFailed: 'JPDB lookup failed.',
        jpdbDeckStateApiKeyRequired: 'Add a JPDB API key to change JPDB deck state.',
        jpdbAddApiKeyRequired: 'Add a JPDB API key, or use Add to Anki.',
        addedToJpdb: 'Added to JPDB.',
        jitenDeckStateApiKeyRequired: 'Add a Jiten API key to change Jiten vocabulary state.',
        jitenAddApiKeyRequired: 'Add a Jiten API key, or use Add to Anki.',
        chooseJitenStudyDeck: 'Choose a Jiten study deck first.',
        addedToJiten: 'Added to Jiten.',
        kanjiDetailsUnavailable: 'Kanji details are not available yet.',
        loadingDictionaryDetails: 'Loading dictionary details...',
        sourceSingular: 'source',
        sourcePlural: 'sources',
        jitenCompositeWords: 'Composite words',
        usedInVocabulary: 'Used in vocabulary',
        exampleSentences: 'Example sentences',
        playJpdbExampleAudio: 'Play JPDB example audio',
        wordsUsingKanji: 'Words using {kanji}',
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
        kanjiSection: 'Kanji section',
        dictionaryDisplayName: 'Dictionary display name',
        sourcePriority: '{source} priority',
        dragToReorder: 'Drag to reorder',
        moveUp: 'Move up',
        moveDown: 'Move down',
        remove: 'Remove',
        removeImportedDictionary: 'Remove imported dictionary',
        customAdvanced: '{label} (advanced)',
        importLocalDefinitionsHelp: 'Import Yomitan for local definitions.',
        frequencyMetadataHelp: 'Frequency, pitch, and kanji metadata for badges.',
        sourceHelpJpdb: 'JPDB meanings from the current card.',
        sourceHelpJiten: 'Jiten meanings, examples, and related words.',
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
        sourceHelpUchisen: 'Uchisen mnemonic image carousel.',
        uchisenMnemonicImages: 'Uchisen mnemonic images',
        uchisenMnemonicFor: 'Uchisen mnemonic for {kanji}',
        noUchisenImagesYet: 'No Uchisen images yet.',
        generateUchisenImage: 'Generate image',
        generateUchisenImageToggle: 'Generate image +',
        uchisenMnemonicStory: 'Mnemonic story',
        uchisenImagePrompt: 'Image prompt',
        uchisenGenerateHint: 'Edit story/prompt, then publish a Uchisen image.',
        uchisenGeneratingImage: 'Generating image...',
        uchisenPublishingMnemonic: 'Publishing mnemonic...',
        uchisenGeneratedImage: 'Uchisen image published.',
        uchisenGenerateFailed: 'Could not generate Uchisen image.',
        uchisenLoginRequired: 'Log in to Uchisen to generate images.',
        noStoryAvailable: 'No story available',
        sourceHelpImportedKanjiDictionaries: 'Imported Yomitan kanji entries.',
        sourceHelpWordsUsingKanji: 'Related vocabulary.',
        sourceHelpComponentGraph: 'Kanji facts, components, radical images.',
        recommendedJitendex: 'Term definitions with examples.',
        recommendedJmdict: 'Core term definitions.',
        recommendedJmnedict: 'Proper names.',
        recommendedWtyJapaneseJapanese: 'Japanese-to-Japanese term definitions.',
        recommendedPixivLight: 'Pixiv terms.',
        recommendedKanjidic: 'Kanji facts.',
        recommendedJpdbKanji: 'JPDB kanji.',
        recommendedKanjiumPitch: 'Pitch accents only; add a term dictionary for definitions.',
        recommendedJpdbv2Kana: 'Recommended frequency badges from JPDB.',
        recommendedBccwj: 'Frequency badges from BCCWJ.',
        recommendedJiten: 'Frequency badges from Jiten.',
        recommendedMarvncMonolingual: 'Monolingual collection.',
        fallbackSetupTitle: 'Public lookup',
        fallbackSetupCopy: 'Search without a JPDB key. Add dictionaries offline.',
        fallbackSetupDictionaries: 'Add dictionaries',
        fallbackSetupJpdb: 'Add JPDB key',
        getApp: `Get ${APP_NAME}`,
        offlineCacheGradesDisabled: 'Offline cache. Grades sync on reconnect.',
        recognizing: 'Recognizing...',
        noHandwritingMatch: 'No match yet. Type or paste kanji.',
        yourKanjiDrawing: 'Your kanji drawing',
        jpdbKanjiActions: 'JPDB kanji actions',
        couldNotSearchLocalDictionaries: 'Could not search local dictionaries.',
        subtitlePanel: 'Subtitles',
        lines: 'Lines',
        tracks: 'Tracks',
        currentLineWillAppear: 'The current line appears when captions are available.',
        native: 'Native',
        unsetJapanese: 'Unset Japanese',
        unsetNative: 'Unset native',
        options: 'options',
        option: 'option',
        line: 'line',
        subtitleTrackDetected: 'subtitle track detected',
        translation: 'Translation',
        grammar: 'Grammar',
        meaning: 'Meaning',
        japaneseLabel: 'Japanese',
        readSentenceAloud: 'Read sentence aloud',
        openSectionToTranslate: 'Open this section to translate.',
        translationUnavailable: 'Translation unavailable.',
        translating: 'Translating...',
        findingGrammar: 'Finding grammar...',
        grammarKnown: 'Known',
        grammarReview: 'Review',
        grammarDetails: 'Details',
        grammarFoundIn: 'Found in',
        grammarExample: 'Example',
        grammarGuide: 'Guide',
        grammarHideKnown: 'Hide known',
        grammarShowKnown: 'Show known',
        allDetectedGrammarKnown: 'All detected grammar is marked known.',
        grammarShown: 'shown',
        grammarKnownHidden: 'known hidden',
        grammarGenericShort: 'Grammar point: {name}',
        grammarGenericDetail: 'Uses {name} in 「{match}」.',
        grammarKindHanabira: 'Hanabira grammar',
        grammarLevelCore: 'Core',
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

function parseUiCopyTable(rows: string): Partial<Record<UiCopyKey, string>> {
    const copy: Partial<Record<UiCopyKey, string>> = {};
    rows.trim().split('\n').forEach(row => {
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

const JA_COPY: Partial<Record<UiCopyKey, string>> = parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
welcomeLabel	{APP_NAME} ようこそ
onboardingEyebrow	日本語がある場所ならどこでも
onboardingCopy	本文、字幕、画像の日本語をタップ可能にします。
onboardingLanguage	表示言語
onboardingAccentColor	アクセントカラー
customAccentColor	カスタムカラー
onboardingImmersionOptions	没入設定の初期値
onboardingHoverShortcut	ホバー検索の修飾キー
onboardingAddApiKey	APIキーを追加
onboardingAddLocalDictionaries	ローカル辞書を追加
onboardingUseWithoutApiKey	APIキーなしで使う
closeOnboarding	ようこそ画面を閉じる
featureText	テキスト
featureTextBody	日本語をホバー/タップできます。
featureImages	画像
featureImagesBody	画像をタップして読み取れます。
featureVideo	動画
featureVideoBody	字幕内の語もタップできます。
featureControl	調整
featureControlBody	機能、キー、色を調整できます。
featureStudy	学習
featureStudyBody	学習ページで単語と漢字を復習。
automatic	自動
english	英語
japanese	日本語
settings	設定
settingsSaved	設定を保存しました。
settingsSaveFailed	設定を保存できませんでした。
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
statsImportJpdbHistory	JPDB復習履歴を読み込む
switchToLightTheme	ライトテーマに切り替え
switchToDarkTheme	ダークテーマに切り替え
openYomuSettings	{APP_NAME}の設定を開く
newTabAddressCopied	学習ページのアドレスをコピーしました。
getApp	{APP_NAME}を入手
loading	読み込み中...
refreshing	更新中...
reveal	表示
revealTranslation	翻訳を表示
immersionExampleControls	イマージョンキット例文の操作
loadingKanjiDetails	漢字情報を読み込み中...
loadingMnemonicImages	覚え方画像を読み込み中...
lookupDialog	{APP_NAME}検索
resizeLookupSheet	検索シートをリサイズ。タップで閉じる
showMiningActions	マイニング操作を表示
hideMiningActions	マイニング操作を隠す
switchReviewTarget	採点先を切り替える
switchGradingProvider	採点サービスを切り替える
closeDrawer	ドロワーを閉じる
copiedWord	単語をコピーしました。
jpdbKanjiUpdated	JPDB漢字を更新しました。
jpdbKanjiUpdateFailedRuntime	JPDB漢字を更新できません。
apiSrsActionsDisabled	設定でAPI採掘操作が無効です。
addJpdbApiKeyReview	JPDBレビューにはAPIキーが必要です。
addJitenApiKeyReview	JitenレビューにはAPIキーが必要です。
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
dictionaryDownloadTimedOut	辞書のダウンロードがタイムアウトしました。
dictionaryDownloadNotZip	ダウンロード結果がZIPではありません。
dictionaryDownloadNeedsBridge	ブリッジが必要です。失敗時はZIPを追加。
dictionaryDownloadBlocked	ダウンロード不可。ZIPを追加。
dictionaryManualDownloadHint	ユーザースクリプト有効化かZIP追加。
dictionaryInstallQueueHelp	まず定義用の語句辞書をインストールしてください。ピッチ/頻度辞書はアクセントやバッジを追加しますが、通常の定義文は追加しません。
dictionaryInstallQueued	{dictionary}待機中。
dictionaryInstallSaveBlocked	インポート中。完了後に保存できます。
dictionaryImportQueueStatus	{count}件インストール中。完了後に保存。
dictionaryRemoveConfirm	「{dictionary}」を削除？
dictionaryRemoving	{dictionary}を削除中...
dictionaryRemoved	{dictionary}を削除しました。
dictionaryImportComplete	{sources}から{records}件インポートしました。
dictionaryRecordsImported	{dictionary}: {records}件
settingsImported	設定をインポートしました。
settingsImportedWithDetails	設定をインポートしました。{details}
settingsExported	設定をエクスポートしました。
restoredStoredChoices	保存済み選択肢を{count}件復元
importedDictionaryRecordCount	辞書レコードを{count}件インポート
dictionaryNoSupportedBanks	対応辞書バンクがありません。
dictionaryUnsupportedJson	Dexie、ZIP、出力を使ってください。
dictionaryZipMissingIndex	ZIPにindex.jsonがありません。
yomitanSettingsInvalid	Yomitan設定ではありません。
local	ローカル
dict	辞書
scanPage	ページをスキャン
noUnscannedJapaneseText	未スキャンの日本語テキストはありません。
jpdbScanFailed	ページスキャンに失敗しました。
pageCoverageSummary	{percent}%・{known}/{total}・新{unknown}・i+1 {iPlusOne}
noImmersionExamples	イマージョンキットの例文が見つかりません。
noImmersionExamplesCompact	例文なし
noLocalDictionaries	語句辞書は未追加です。定義にはJMdict、Jitendex、WTYなどを追加してください。ピッチ/頻度辞書だけでは定義文は増えません。
kanjiMapData	漢字マップデータ
kanjiAlive	カンジアライブ
wiktionary	ウィクショナリー
fallbackSetupTitle	辞書から始める
fallbackSetupCopy	JPDBキーなしで検索。辞書でオフライン対応。
fallbackSetupDictionaries	辞書を追加
fallbackSetupJpdb	JPDBキーを追加
offlineCacheGradesDisabled	オフラインです。採点は再接続時に同期されます。
recognizing	認識中...
noHandwritingMatch	候補なし。漢字を入力/貼り付け。
yourKanjiDrawing	あなたの手書き
jpdbKanjiActions	JPDB漢字操作
couldNotSearchLocalDictionaries	ローカル辞書を検索できませんでした。
subtitlePanel	字幕
lines	行
tracks	トラック
currentLineWillAppear	字幕が来ると現在行を表示。
native	母語
unsetJapanese	日本語を解除
unsetNative	母語字幕を解除
options	件
option	件
line	行
subtitleTrackDetected	字幕トラックを検出
filterStudy	学習
filterAll	すべて
sourceAuto	自動
sortRandom	ランダム
sortFrequency	頻度
sortState	状態
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
gradeJpdbCardTarget	API SRSカードを採点
ankiReviewSingular	回復習
ankiReviewPlural	回復習
ankiLapseSingular	回失敗
ankiLapsePlural	回失敗
gradeNothingLabel	全然
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
loadingSimilarWords	単語を読み込み中...
openToLoadSimilarWords	開くと単語を読み込みます。
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
copyWord	コピー
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
audioRequestReturnedNonAudio	音声ではない応答です
audioRequestReturnedNonAudioWithType	音声ではない応答です: {type}。
audioUnknownContentType	不明なコンテンツ種別
japanesePod101NoAudio	JapanesePod101に音声なし。
invalidJpdbAudioId	JPDB音声IDが無効です。
couldNotReadAudio	音声を読み取れませんでした。
couldNotReadAudioBlob	音声データを読み取れませんでした。
previousSubtitle	前の字幕
nextSubtitle	次の字幕
jumpToCurrentSubtitle	現在の字幕へ移動
playVideo	動画を再生
pauseVideo	動画を一時停止
enterFullscreen	全画面表示
exitFullscreen	全画面表示を終了
copySubtitle	字幕をコピー
subtitleFallbackLabel	字幕
subtitlesTitle	字幕
openSubtitlePanel	字幕パネルを開く
closeSubtitlePanel	字幕パネルを閉じる
subtitleStyle	字幕スタイル
subtitleResetDefaults	標準に戻す
closeSubtitleDrawer	字幕ドロワーを閉じる
enableSubtitleAutoHide	再生中はパネルを自動で隠す
disableSubtitleAutoHide	再生中もパネルを開いたままにする
subtitleAutoHideShort	自動
loadJapaneseSubtitles	日本語字幕を読み込む
loadPrimarySubtitles	主字幕を読み込む
loadNativeSubtitles	母語字幕を読み込む
searchAnimeSubtitles	アニメ字幕を検索
toggleNativeSubtitleBlur	母語字幕のぼかしを切り替え
subtitleTrackDetectedSingular	字幕トラックを1件検出
subtitleTracksDetected	件の字幕トラックを検出
noSubtitleTracksDetected	字幕トラックは未検出です。
resizeTranscriptPanel	文字起こしパネルのサイズ変更
resizeSubtitleTracksPanel	字幕トラックパネルのサイズ変更
subtitleNavigation	字幕ナビ
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
noAutoDetectedSubtitleTracks	自動検出字幕はありません。
autoDetectedTracksWillAppear	字幕トラックはここに出ます。
autoDetectedOptionSingular	字幕オプション1件
autoDetectedOptions	件の字幕オプション
detected	検出済み
japaneseOverlay	日本語オーバーレイ
primaryOverlay	主字幕オーバーレイ
nativeOverlay	母語オーバーレイ
unsetJapaneseSubtitles	日本語を解除
unsetPrimarySubtitles	主字幕を解除
japaneseSubtitles	日本語
primarySubtitles	主字幕
unsetNativeSubtitles	母語を解除
nativeSubtitles	母語
chooseJapaneseSubtitles	日本語字幕を選択
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
ocrEnabledToast	画像読み取りを有効にしました。
ocrHiddenToast	画像読み取りを非表示にしました。
ocrPlayVideo	動画を再生
ocrResumeVideo	動画を再開
ocrPausedFrameScanning	スキャン中...
ocrPausedFrameReady	テキスト準備完了
ocrPausedFrameNoText	テキストが見つかりません
ocrPausedFrameFailed	テキストを読み取れませんでした
ocrNoReadableImages	近くに読み取れる画像がありません。
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
addToDeck	デッキに追加
addToDeckHint	採点せずに追加します。
deck	デッキ
deckActions	デッキ操作
reviewAddsToDeck	レビューすると新しい単語を追加します:
reviewBlockedBlacklisted	ブラックリスト入りです。解除するとレビューできます。
reviewBlockedNeverForget	「忘れない」設定です。解除するとレビューできます。
reviewBlockedLocked	JPDBでロック中です。解除するとレビューできます。
reviewBlockedRedundant	JPDBで冗長のためレビューできません。
ankiCardsSuspended	Ankiで保留にしました。
ankiCardsUnsuspended	Ankiの保留を解除しました。
ankiNeverForgetTagAdded	Ankiにyomu-never-forgetタグを付けました。
ankiNeverForgetTagRemoved	Ankiのyomu-never-forgetタグを外しました。
forget	忘れる
never	忘れない
neverHint	忘れないデッキへ移動します。
forgetHint	忘れないデッキから外します。
unlist	解除
unlistHint	ブラックリストから外します。
blacklist	ブラックリスト
blacklistHint	この単語を無視します。
vocabularyStatusUpdated	語彙状態を更新しました。
addToAnki	Ankiに追加
checkingAnki	Ankiを確認中...
sendToMobileAnki	{app}へ送る
mobileAnkiActionHint	モバイルAnkiで新規ノートを作成します。
ankiAudioFileNotFound	Anki音声ファイルが見つかりません。
ankiAudioPlaybackUnavailable	ここではAnki音声を再生できません。
ankiAudioUnavailablePreview	プレビューで音声を利用できません
ankiAudioFilenameLabel	Anki 音声 {filename}
ankiStoredFields	保存フィールド
ankiCardDetailsPending	Ankiで一致。カード詳細を読み込み中...
ankiCardDetailsUnavailable	Ankiで一致。キャッシュ状態を表示します。
ankiNewCard	新規カード
ankiMatches	Ankiの一致
ankiMergeNeedsDesktop	ノート統合にはデスクトップAnkiConnectが必要です。
ankiNoteNotFound	Ankiノートが見つかりません。
ankiHandoffCancelled	Ankiへの受け渡しがキャンセルされました。
ankiConnectActionFailed	AnkiConnectの操作に失敗しました。
ankiConnectRequestFailed	AnkiConnectリクエストに失敗しました。
ankiConnectTimedOut	AnkiConnectがタイムアウトしました。
ankiConnectNeedsBridge	AnkiConnectにはブリッジが必要です。
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
ankiTemplateContext	文脈
ankiTemplateRecognition	認識
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
selection	選択範囲
parsedFrom	解析元
selectionPopoverShowTranslation	選択ポップアップに翻訳を表示
imageReadingEnabled	画像読み取りを有効にしました。
imageReadingHidden	画像読み取りを非表示にしました。
ocrModeAutoToast	画像OCRを自動にしました。
ocrModeManualToast	画像OCRをタップ/ホバーにしました。
ocrModeOffToast	画像OCRをオフにしました。
subtitleOverlayEnabled	字幕オーバーレイを有効にしました。
subtitleOverlayHidden	字幕オーバーレイを非表示にしました。
reviewFailed	レビューに失敗しました。
reviewActionsDisabled	設定でレビュー操作が無効です。
jpdbLookupFailed	JPDB検索に失敗しました。
jpdbDeckStateApiKeyRequired	JPDBデッキ変更にはAPIキーが必要です。
jpdbAddApiKeyRequired	JPDB APIキーかAnki追加が必要です。
addedToJpdb	JPDBに追加しました。
jitenDeckStateApiKeyRequired	Jiten状態変更にはAPIキーが必要です。
jitenAddApiKeyRequired	Jiten APIキーかAnki追加が必要です。
chooseJitenStudyDeck	先にJiten学習デッキを選択してください。
addedToJiten	Jitenに追加しました。
kanjiDetailsUnavailable	漢字情報はまだ利用できません。
loadingDictionaryDetails	辞書詳細を読み込み中...
sourceSingular	ソース
sourcePlural	ソース
jitenCompositeWords	複合語
usedInVocabulary	使われる単語
exampleSentences	例文
playJpdbExampleAudio	JPDB例文音声を再生
wordsUsingKanji	{kanji}を使う単語
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
japaneseLabel	日本語
readSentenceAloud	文を読み上げ
openSectionToTranslate	開くと翻訳します。
translationUnavailable	翻訳を利用できません。
translating	翻訳中...
findingGrammar	文法を検索中...
grammarKnown	既知
grammarReview	復習
grammarDetails	詳細
grammarFoundIn	検出箇所
grammarExample	例
grammarGuide	ガイド
grammarHideKnown	既知を隠す
grammarShowKnown	既知を表示
allDetectedGrammarKnown	検出文法はすべて既知です。
grammarShown	件表示
grammarKnownHidden	件の既知を非表示
grammarGenericShort	文法項目: {name}
grammarGenericDetail	「{match}」に「{name}」。
grammarKindHanabira	Hanabira文法
grammarLevelCore	基本
`);

const JA_SETTINGS_COPY: Partial<Record<UiCopyKey, string>> = parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
settingsSections	設定セクション
settingsSearch	設定を検索
settingsSearchPlaceholder	設定を検索
settingsSearchNoResults	一致なし。
selectOptions	選択肢
save	保存
cancel	キャンセル
show	表示
hide	隠す
appearance	外観
reading	読解
sources	ソース
media	メディア
mining	採掘
shortcuts	ショートカット
help	ヘルプ
interface	インターフェイス
interfaceHelp	インターフェイス設定です。
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
apiKey	APIキー
jitenApiKey	Jiten APIキー
apiAccess	APIアクセス
apiAccessHelp	JitenとJPDBのキーを別々に貼ります。学習デッキは選択中のサービスに適用され、キーなしでもローカル辞書は使えます。
jpdbSettings	JPDB設定
jitenSettings	Jiten設定
jpdbApiKeyConfigured	JPDBキーあり。
jpdbApiKeyMissing	JPDBキーなし。
jpdbConnected	JPDBに接続しました。
jpdbAndJitenConnected	JitenとJPDBに接続しました。
jpdbConnectionFailed	JPDBキーが無効か接続不可です。
jitenApiKeyConfigured	Jitenキーあり。
jitenApiKeyMissing	Jitenキーなし。
statusEnabled	有効
statusDisabled	無効
statusReady	準備完了
statusAttention	設定が必要
statusError	エラー
disabledControlDescription	別設定で制御中。
jpdbMiningEnabled	APIの復習・デッキ変更を許可
addToForq	JPDB追加時にforqにもコピー
enableReviews	復習ボタンを表示
reviewRatingScale	復習評価の段階
gradeTargetSelector	採点先
gradeTargetBoth	両方
gradeTargetJpdb	JPDBを採点
gradeTargetJiten	Jitenを採点
gradeTargetAnki	Ankiカードを採点: {target}
gradeTargetJpdbAndAnki	JPDB + Ankiカードを採点: {target}
gradeTargetJitenAndAnki	Jiten + Ankiカードを採点: {target}
missingAnkiCardId	AnkiカードIDがありません。
jpdbPageEnhancements	辞書サイト拡張
jpdbPageEnhancementsEnabled	辞書ページを拡張
jpdbPageWordEnhancementsEnabled	単語・検索ページにソースを追加
jpdbPageKanjiEnhancementsEnabled	漢字ページにソースを追加
jpdbPageEnhancementsHelp	
fivePoint	5段階: 全然から簡単まで
twoPoint	2段階: 失敗 / 合格
settingsLanguage	設定の表示言語
theme	テーマ
auto	自動
dark	ダーク
light	ライト
popupMode	ポップアップ表示
bottomSheet	下部シート
popover	ポップオーバー
stickyBottomSheet	検索後も開く
popoverBackdropEnabled	背後を暗くする
popoverWidth	ポップオーバー幅 (px)
popoverHeight	ポップオーバー高さ (px)
popoverHeightMode	ポップオーバー高さの動作
popoverHeightAvailable	空き領域まで
popoverHeightFixed	高さ設定を使う
readerFontFamily	リーダーUIフォント
popupFontFamily	ポップアップの日本語フォント
fontPresetYomuDefault	内蔵フォント
fontPresetJapaneseSans	日本語サンセリフ
fontPresetHiraginoYuGothic	ヒラギノ / 游ゴシック
fontPresetJapaneseRounded	日本語丸ゴシック
fontPresetJapaneseSerif	日本語明朝
fontPresetSystemUi	システムUI
fontPresetCustom	カスタム...
customFontFamily	カスタムフォント
popupFontWeight	ポップアップの日本語の太さ
enableLogging	診断ログを有効にする
diagnostics	診断
diagnosticsHelp	診断をコンソールへ出力します。
accentColor	アクセントカラー
newTab	学習
newTabEnabled	学習を新しいタブに設定
newTabAnkiEnabled	学習でAnkiカードを使う
newTabAnkiReviewDecks	Anki復習デッキ
newTabAnkiReviewDecksHelp	不要なデッキを外します。
newTabSource	学習の復習ソース
newTabAuto	自動: API/Anki後に学習語
newTabApiSrs	API SRS（Jiten / JPDB）
dictionaryFallback	辞書フォールバック
newTabJpdbReviewMode	API復習モード
newTabJpdbReviewAuto	自動: ライブ漢字+API語彙
newTabLiveReview	ライブJPDB復習セッション
newTabApiVocabulary	API語彙のみ（デッキ順）
corsProxyUrl	クロスオリジンプロキシURL
newTabKanjiKeywordSource	漢字キーワードのソース
newTabKanjiKeywordAuto	自動: RTK、{service}、ローカル
newTabKanjiKeywordRtk	RTK / Heisig
newTabKanjiKeywordApiFacts	{service}漢字情報（Jiten / JPDB）
newTabKanjiKeywordLocal	ローカルカードの意味
newTabParsingEnabled	学習の文解析を有効にする
newTabFrontSentenceEnabled	単語カード表面に文を表示
newTabKanjiAutogradeEnabled	漢字書き取りを自動採点
newTabKanjiAutoSubmit	漢字評価を自動送信
newTabOfflineEnabled	学習をオフライン用にキャッシュ
newTabOfflineLimit	オフライン復習キャッシュ上限
newTabDailyGoalMinutes	1日の学習目標（分・0で無効）
newTabKanjiUnlockEnabled	漢字後に単語を解放
newTabStopAtBatchEnd	バッチの終わりで停止
newTabSwipeReviews	スワイプ採点（左=失敗、右=合格）
newTabUrl	学習ページのアドレス
newTabOfflineHelp	カードと未送信採点を保存。
newTabAddressHelp	新規タブやiPadホーム画面用。
newTabJpdbDeck	学習のJPDBデッキ
openNewTabPage	学習を開く
copyAddress	アドレスをコピー
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
pitchColorKifuku	起伏
pitchColorUnknown	不明 / 継承
colorChannels	色チャンネル
wordHighlightColorSource	単語ハイライトの色
wordUnderlineColorSource	単語下線の色
wordTextColorSource	単語テキストの色
subtitleHighlightColorSource	字幕ハイライトの色
subtitleUnderlineColorSource	字幕下線の色
subtitleTextColorSource	字幕テキストの色
colorSourceStatus	JPDB + Ankiの状態
colorSourceJpdb	JPDBの状態
colorSourceAnki	Ankiの状態
colorSourcePitch	ピッチアクセント
colorChannelsHelp	
interfaceHelp	インターフェイス設定です。
popupLookup	ポップアップ検索
popupLookupEnabled	よむの検索ポップアップを表示
popupLookupHelp	他リーダーのポップアップ用。オフでも他機能は有効。
parseSelection	選択ポップアップを表示
lookupOnClick	タップまたはクリックで検索
lookupOnHover	ホバーで検索
lookupOnMiddleMouse	中央ボタン長押しで検索
showFloatingButton	設定ボタンを表示
pageScanMode	ページスキャン
pageScanModeOff	オフ
pageScanModeAuto	自動
pageScanModeManual	手動
manualPageScanShortcut	手動ページスキャンのショートカット
manualScanEnabled	手動ページスキャン
ocrInteractionMode	画像OCRスキャン
ocrInteractionModeAuto	自動
ocrInteractionModeManual	タップ/ホバー
ocrInteractionModeOff	オフ
puckMenuLabel	よむ メニュー
puckStudyPage	学習ページ
puckPauseAnnotations	注釈を一時停止
puckResumeAnnotations	注釈を再開
puckOcrAuto	OCR: 自動
puckOcrManual	OCR: タップ/ホバー
puckOcrOff	OCR: オフ
annotationsPausedToast	注釈を一時停止しました。
annotationsResumedToast	注釈を再開しました。
puckMuteAudio	音声の自動再生をミュート
puckUnmuteAudio	音声の自動再生のミュートを解除
autoplayAudioOnToast	音声の自動再生をオンにしました。
autoplayAudioOffToast	音声の自動再生をミュートしました。
showFurigana	ふりがな注釈を有効にする
furiganaMode	ふりがな
wordColorStates	色を付ける単語
appearancePresetCustom	現在のカスタム設定を保持
appearancePresetBalanced	読みやすいバランス
appearancePresetNoColors	プレーンテキスト
appearancePresetNewOnly	新規単語に集中
appearancePresetUnderlineNew	控えめなハイライト
wordColorStatesAll	すべての学習状態
wordColorStatesNewOnly	新規・未追加のみ
furiganaDifficultKanji	難しい漢字のみ
furiganaHideKnown	なじみのある語を非表示
furiganaHoverOnly	ホバー時に表示
furiganaAllParsed	解析済みの全単語に表示
showPitchAccent	ピッチアクセントを表示
showLookupPillFrequency	サイトの頻度をピルに表示
suppressRedundantWordUi	JPDBの冗長語のスタイルを非表示
sheetCloseButtonOnLeft	閉じるボタンを左に
hideKnownFurigana	既知カードのふりがなを非表示
readerHelp	ホバーキーを設定。空欄なら通常ホバー。
hoverLookupSettings	ホバー検索
kanjiOriginKanjiMapEnabled	漢字情報と部品グラフを表示
kanjiOriginGraphEnabled	部品グラフを表示
kanjiOriginRadicalImagesEnabled	部首画像を表示
similarKanjiWordLimit	類似語の上限
kanjiHelp	
audioEnabled	語句の音声を有効にする
autoPlayAudio	語句の音声を自動再生
suppressAutoAudioOnVideo	動画では検索音声オフ
audioAutoPlayMode	自動再生のきっかけ
audioEnableDefaultSources	内蔵音声ソースを有効
audioFallbackChimeEnabled	フォールバック音を有効
audioSelectionMode	複数音声があるとき
audioPlayback	音声再生
firstAudio	最初の音声
randomAudio	シャッフル音声
audioTtsMode	読み上げの扱い
audioTtsFallback	録音音声の後のフォールバック
audioTtsSourceOrder	ソース順/シャッフルに含める
audioTimeoutMs	音声タイムアウト (ms)
previewAudio	音声を試聴
audioHelp	URL: {term}、{reading}、{language}。
audioSource	音声ソース
urlVoice	URL / 音声
addAudioSource	音声ソースを追加
audioAutoPlayAll	ホバーとタップ/クリック
audioAutoPlayHover	ホバーのみ
audioAutoPlayTap	タップ/クリックのみ
automaticBrowserVoice	ブラウザの自動音声
savedVoice	保存済み音声
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
audioSourceLinguaLibre	(Commons) Lingua Libre
audioSourceWiktionary	(Commons) Wiktionary
audioSourceJitenTts	Jiten読み上げ
audioSourceJpdbTts	JPDB読み上げ
audioSourceTextToSpeech	ブラウザ読み上げ
audioSourceTextToSpeechReading	ブラウザ読み上げ (かな読み)
audioSourceCustom	直接音声ファイルURL
audioSourceCustomJson	カスタムURL
audioCustomJsonPlaceholder	Yomitan/Ultimate音声URL
audioCustomUrlPlaceholder	直接音声ファイルURL
audioBuiltInPlaceholder	内蔵ソースはURL不要
defaultVoiceSuffix	標準
audioGuideLinkLabel	Yomitan音声ガイド
audioProxyGuideSummary	Cloudflareプロキシ
audioProxyGuideIntro	専用プロキシにはWorkerを使います。
audioProxyGuideCloudflare	Cloudflareを開きます。
audioProxyGuideWorkers	Workers & PagesでCreateします。
audioProxyGuideCreateWorker	Workerを選び、名前を付けてDeploy。
audioProxyGuideEditCode	Yomu Workerソースを貼ります。
audioProxyGuideDeploy	Deployします。
audioProxyGuideCopyUrl	Worker URLをコピーします。
audioProxyGuidePasteUrl	Cross-origin proxy URLに貼ります。
audioProxyGuideTest	保存後、検索・インポート・音声で確認。
audioProxyGuideNote	共有前にホストを絞ります。
audioProxyWorkerSource	Workerソース
audioProxyDeployGuide	デプロイガイド
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
immersionKitCategory	例文ソース
immersionKitSort	例文の並び順
immersionKitLimitEnabled	単語ごとの例文数制限
allExamples	すべての例文
limitExamples	例文数を制限
immersionKitLimit	単語ごとの例文数
immersionKitMinLength	最小文長
immersionKitMaxLength	最大文長
immersionKitPlaybackRate	例文音声速度
immersionKitExactMatch	完全一致を優先
immersionKitHelp	例文を表示。Nadeshikoはキー必須。
allCategories	すべて
anime	アニメ
drama	ドラマ
games	ゲーム
shortestFirst	短い順
longestFirst	長い順
randomOrder	ランダム
ocrEnabled	画像内テキストを読む
ocrAutoScanImages	画像を自動で読む
ocrShowTextOverlay	認識した画像テキスト領域を表示
ocrVideoPauseFrames	一時停止した動画フレームを読む
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
ocrBackgroundColor	画像ハイライト背景
ocrBackgroundOpacity	画像ハイライト不透明度
ocrFontScale	画像テキスト倍率
ocrEndpointUrl	ローカルOCRサーバーURL
ocrCustomLocalServer	ローカルOCRサーバーURL
ocrEngine	ローカルOCRエンジン
ocrEngineMangaOcr	MangaOCR（マンガに最適）
ocrEngineAppleVision	Apple Vision（macOS）
cloudVisionApiKey	Google Cloud Vision APIキー
ocrHelp	近くの画像を読み取ります。Google Lensは設定不要です。
ocrCloudHelp	Google Cloud Vision APIキーを貼ります。
ocrLocalHelp	MangaOCR/Apple VisionのローカルURLを入力します。
subtitlePlayerEnabled	動画字幕プレイヤーを有効にする
subtitleAutoDetect	ページの字幕を自動検出
subtitleOverlayVisible	字幕オーバーレイを表示
subtitleSecondaryVisible	利用可能ならネイティブ字幕を表示
subtitleNativeBlurred	ホバーするまでネイティブ字幕をぼかす
subtitleKaraokeMode	カラオケ風の単語タイミング
subtitleTranscriptVisible	文字起こしパネルを標準で開く
subtitlePausePanel	一時停止時にサイドパネルを開く
subtitleTranscriptPlacement	文字起こしパネル位置
subtitleTranscriptAutoScroll	再生に合わせて文字起こしをスクロール
subtitleTranscriptAutoScrollResumeSeconds	手動スクロール後の再開 (秒)
subtitleAutoCopyLine	各字幕行を再生時に自動コピー
subtitleMiningPause	字幕クリック時に動画を一時停止
subtitleHoverPause	字幕ホバー時に動画を一時停止
subtitleControlsMode	字幕コントロール
subtitleStyle	字幕スタイル
subtitleResetDefaults	標準に戻す
moveSubtitles	字幕を移動
right	右
left	左
bottom	下
showWhenNeeded	コンパクト表示
hideControls	コントロールを隠す
alwaysVisible	常に表示
subtitleFontSize	字幕フォントサイズ (px)
subtitleBottomOffset	字幕下端オフセット (%)
subtitleTextColor	字幕の色
subtitleOutlineColor	字幕の縁取り
subtitleBackgroundColor	字幕背景
subtitleBackgroundOpacity	字幕背景の不透明度
subtitleFontFamily	字幕フォントファミリー
subtitleFontWeight	字幕フォントの太さ
subtitleSeekPadding	字幕シーク余白 (s)
subtitlePreview	字幕ライブプレビュー
preview	プレビュー
youtubeImmersionEnabled	日本語YouTubeのみ
preferJapaneseSiteLanguage	サイトの言語と地域を日本優先にする
youtubeShowChannelRecommendations	日本語チャンネル候補を表示
youtubeShowFilterNotice	非表示動画の通知を表示
youtubeHelp	日本語UIと日本向け内容を優先します。
youtubeFilterOn	YouTubeフィルター: オン
youtubeFilterOff	YouTubeフィルター: オフ
youtubeShowHiddenVideos	非表示動画を表示
youtubeHideHiddenVideos	非表示動画を隠す
youtubeHideNotice	通知を隠す
youtubeFilterShowing	{appName}は非表示のYouTube項目{count}件を表示中
youtubeFilterHid	{appName}は日本語らしくないYouTube項目{count}件を非表示
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
noScannedFields	
mappingForNoteType	{model} の対応付け
currentNoteType	現在のノートタイプ
ankiFieldMappingSelect	{role}フィールド
ankiRoleExpression	表記
ankiRoleReading	読み
ankiRoleMeaning	意味
ankiRoleSentence	文
ankiRoleAudio	音声
ankiRoleImage	画像
testAnki	AnkiConnectを確認
prepareAnki	よむノートタイプを作成
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
localDictionariesEnabled	インポート済み辞書の定義を表示
dictionarySourcesInitiallyExpanded	ポップアップのソースを標準で開く
localDictionaryMaxResults	辞書結果の上限
cloudSettingsSync	Google Drive設定同期
cloudSettingsSyncHelp	Yomuの設定をGoogle Driveのアプリデータに保存します。辞書は端末内に残ります。
importSettings	設定JSONをインポート
exportSettings	設定JSONをエクスポート
importDictionaries	辞書をインポート
exportDictionaries	辞書をエクスポート
dictionaryImportHelp	Yomitan ZIP、設定エクスポート、バックアップを読み込みます。語句/ピッチ/頻度辞書で定義、アクセント、バッジを追加します。
lookupPills	検索ピル
lookupPillsHelp	外部リンクと頻度バッジを同じ順序で表示します。ローカル頻度辞書は一致するJiten/JPDBライブバッジを置き換えます。トークン: {query}、{word}、{reading}。
copiesCurrentWord	現在の単語をコピーします
lookupPillLabel	検索ピルのラベル
lookupPillLabelNumber	検索ピル{number}のラベル
lookupUrlTemplate	検索URLテンプレート
lookupUrlTemplateNumber	ピル{number} URL
lookupPillOrder	検索ピルの順序
builtInAction	内蔵アクション
recommendedDownloads	辞書
termDictionaries	語句辞書
kanjiDictionaries	漢字辞書
pitchDictionaries	ピッチ辞書
frequencyDictionaries	頻度辞書
install	インストール
installing	インストール中
queued	待機中
dictionaryGuide	ガイド
download	ダウンロード
downloadAndImport	ダウンロードしてよむにインポート
update	更新
checkingDictionaries	インポート済み辞書を確認中...
dictionaryOnlyJpdb	JPDBのみです。JMdict、Jitendex、WTYなどの語句辞書でローカル定義を追加してください。
localDictionaryText	辞書テキスト
localSenseSingular	意味
localSensePlural	意味
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
playVideo	動画を再生
pauseVideo	動画を一時停止
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
helpLinksCopy	リーダーツールとドキュメントをここから開けます。
versionAndUpdates	バージョン
currentYomuVersion	Yomu
updateStatusIdle	現在 {current}。確認待ち。
updateStatusChecking	現在 {current}。確認中...
updateStatusCurrent	現在 {current}。最新 {latest}。最新です。
updateStatusAvailable	現在 {current}。最新 {latest}。更新できます。
updateStatusUnknown	現在 {current}。確認できません。必要なら再インストールしてください。
updateHelpNotes	よむスクリプトは1つだけ有効にしてください。iPhone/iPadで更新が止まる場合は、このリンクをSafariで開いてください。
updateUserscript	更新
duplicateStatusSingle	有効なYomuランタイムは1つです（{kind}）。
duplicateStatusUnknown	重複確認はできません。よむが2つ表示される場合は古いスクリプトを無効にしてください。
ankiConnectSetupTitle	AnkiConnect設定
ankiConnectSetupCopy	デスクトップAnkiを開き、AnkiConnectを有効にしてください。ホスト版StudyではAnkiConnect側でYomuのオリジンを許可する必要があります。
ankiConnectSetupConfig	AnkiConnectのwebCorsOriginListに次のオリジンを追加してください。既存の項目は残します:
ankiConnectSetupMobile	スマホやiPadでは、デスクトップPCのLANまたはTailscale URLを使います。スマホ上のlocalhostはPCではなくスマホ自身を指します。
ankiConnectSetupBrave	BraveでローカルAnki確認がブロックされる場合は、StudyページのShieldsをオフにしてください。
helpSupportTitle	よむをサポート
helpSupportCopy	よむは検索、OCR、字幕、辞書、学習、Ankiをまとめた無料ユーザースクリプトです。
helpSupportCopyExtra	寄付は開発とサービス費用を支えます。
videoPlayer	動画プレイヤー
pdfReader	PDFリーダー
newTabPage	学習
localAudio	ローカル音声
changelog	変更履歴
support	サポート
github	GitHub
docs	ドキュメント
factoryReset	初期状態に戻す
factoryResetConfirm	{appName}の全データをリセットしますか？\n\n設定、キー、キャッシュ、辞書を削除。
factoryResetFailed	リセットに失敗しました。
factoryResetDictionaryWarning	設定をリセットしました。他のタブを閉じてください。
factoryResetOtherTabReloading	別タブでリセット。再読み込み...
factoryResetDeleteSettingsFailed	設定を削除できません。他のタブを閉じてください。
issues	Issue
donate	寄付
discord	Discord
documentation	ドキュメント
addToMining	デッキに追加
addToMiningHint	選択中のAPI SRSデッキに追加します。
enabledHeader	有効
labelHeader	ラベル
displayName	表示名
orderHeader	順序
removeHeader	削除
definitionSource	定義ソース
kanjiSection	漢字セクション
dictionaryDisplayName	辞書表示名
sourcePriority	{source}の優先度
dragToReorder	ドラッグして並べ替え
moveUp	上へ移動
moveDown	下へ移動
remove	削除
removeImportedDictionary	インポート済み辞書を削除
customAdvanced	{label} (詳細)
importLocalDefinitionsHelp	ローカル定義にはYomitan辞書を使います。
frequencyMetadataHelp	頻度、ピッチ、漢字メタデータをバッジや漢字データに表示。
sourceHelpJpdb	現在のカードのJPDB定義です。
sourceHelpJiten	Jiten定義、例文、関連語です。
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
sourceHelpUchisen	Uchisen語呂合わせ画像カルーセルです。
uchisenMnemonicImages	Uchisen語呂合わせ画像
uchisenMnemonicFor	{kanji}のUchisen語呂合わせ
noUchisenImagesYet	Uchisen画像はまだありません。
generateUchisenImage	画像を生成
generateUchisenImageToggle	画像を生成 +
uchisenMnemonicStory	語呂合わせストーリー
uchisenImagePrompt	画像プロンプト
uchisenGenerateHint	ストーリーとプロンプトを編集し、Uchisen画像を公開します。
uchisenGeneratingImage	画像を生成中...
uchisenPublishingMnemonic	語呂合わせを公開中...
uchisenGeneratedImage	Uchisen画像を公開しました。
uchisenGenerateFailed	Uchisen画像を生成できませんでした。
uchisenLoginRequired	画像生成にはUchisenへのログインが必要です。
noStoryAvailable	ストーリーはありません
sourceHelpImportedKanjiDictionaries	インポート済み漢字項目です。
sourceHelpWordsUsingKanji	関連語彙です。
sourceHelpComponentGraph	漢字情報、部品、部首画像です。
recommendedJitendex	例文付きの語句定義です。
recommendedJmdict	基本語句定義です。
recommendedJmnedict	固有名詞辞書です。
recommendedWtyJapaneseJapanese	日本語で読む語句定義です。
recommendedPixivLight	Pixiv用語辞書です。
recommendedKanjidic	漢字情報です。
recommendedMarvncMonolingual	日本語辞書集です。
recommendedJpdbKanji	JPDB漢字情報です。
recommendedKanjiumPitch	ピッチアクセント専用です。定義には語句辞書も追加してください。
recommendedJpdbv2Kana	JPDB由来のおすすめ頻度バッジです。
recommendedBccwj	BCCWJ由来の頻度バッジです。
recommendedJiten	Jiten由来の頻度バッジです。
`);

export interface GrammarRuleCopy {
    kind: string;
    short: string;
    detail: string;
}

const JA_GRAMMAR_RULE_COPY_URL = `${DOCS_BASE_URL}data/ja-grammar-rule-copy.json`;
let jaGrammarRuleCopyPromise: Promise<Record<string, GrammarRuleCopy>> | undefined;


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
        ? JA_SETTINGS_COPY[key] ?? JA_COPY[key] ?? '未翻訳'
        : COPY.en[key];
}

export function cardStateLabel(state: string, language: InterfaceLanguage, fallback = state): string {
    const key = CARD_STATE_LABEL_KEYS[state];
    return key ? uiText(language, key) : fallback;
}

export function audioSourceLabel(language: InterfaceLanguage, type: AudioSourceType): string {
    return uiText(language, AUDIO_SOURCE_LABEL_KEYS[type]);
}

export function formatUiText(language: InterfaceLanguage, key: UiCopyKey, values: Record<string, string | number>): string {
    return Object.entries(values).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        uiText(language, key),
    );
}

export function uiList(language: InterfaceLanguage, parts: string[]): string {
    return new Intl.ListFormat(resolveUiLanguage(language), { style: 'short', type: 'conjunction' }).format(parts);
}

const AUDIO_SOURCE_LABEL_KEYS: Record<AudioSourceType, UiCopyKey> = {
    jpod101: 'audioSourceJpod101',
    'language-pod-101': 'audioSourceLanguagePod101',
    jisho: 'audioSourceJisho',
    'lingua-libre': 'audioSourceLinguaLibre',
    wiktionary: 'audioSourceWiktionary',
    'jiten-tts': 'audioSourceJitenTts',
    'jpdb-tts': 'audioSourceJpdbTts',
    'text-to-speech': 'audioSourceTextToSpeech',
    'text-to-speech-reading': 'audioSourceTextToSpeechReading',
    custom: 'audioSourceCustom',
    'custom-json': 'audioSourceCustomJson',
};

async function loadJaGrammarRuleCopy(): Promise<Record<string, GrammarRuleCopy>> {
    jaGrammarRuleCopyPromise ??= requestJson(JA_GRAMMAR_RULE_COPY_URL, {
        failureLabel: 'Japanese grammar copy request',
        timeoutMs: 15000,
        allowDirectCrossOrigin: true,
        credentials: 'omit',
        anonymous: true,
    })
        .then(normalizeGrammarRuleCopy)
        .catch(() => {
            jaGrammarRuleCopyPromise = undefined;
            return {};
        });
    return jaGrammarRuleCopyPromise;
}

function normalizeGrammarRuleCopy(value: unknown): Record<string, GrammarRuleCopy> {
    if (!isGrammarRuleCopyRecord(value)) return {};
    const copy: Record<string, GrammarRuleCopy> = {};
    for (const [ruleId, item] of Object.entries(value)) {
        const ruleCopy = normalizeGrammarRuleCopyItem(item);
        if (!ruleCopy) continue;
        copy[ruleId] = ruleCopy;
    }
    return copy;
}

function normalizeGrammarRuleCopyItem(value: unknown): GrammarRuleCopy | null {
    if (!isGrammarRuleCopyRecord(value)) return null;
    const kind = grammarRuleCopyText(value.kind);
    const short = grammarRuleCopyText(value.short);
    const detail = grammarRuleCopyText(value.detail);
    if (kind === undefined || short === undefined || detail === undefined) return null;
    return { kind, short, detail };
}

function grammarRuleCopyText(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function isGrammarRuleCopyRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
