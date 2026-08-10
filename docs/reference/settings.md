---
title: Settings reference
description: Every Yomu setting, its default, and the part of the settings dialog that holds it.
editLink: false
---

# Settings reference

Every setting Yomu stores is listed here, in the order the settings dialog presents them.

Open the dialog from the Yomu button on any page.

Each row gives the label the dialog shows, the explanation the dialog offers, the value a fresh install starts with, and the name the setting takes in an exported settings file.

This page is generated from the reader source, so it stays in step with the version you have installed.

Some rows say Not yet described. That marks a real stored setting whose wording is still to be written, shown as a gap rather than filled with a guess.

## API

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| API key | — | empty | `apiKey` |
| Bunpro frontend API token | — | empty | `bunproFrontendApiToken` |
| Not yet described | — | empty | `bunproFrontendApiTokenExpiresAt` |
| WaniKani personal access token | — | empty | `wanikaniApiToken` |
| Enhance dictionary pages | — | on | `jpdbPageEnhancementsEnabled` |
| Add sources to word/search pages | — | on | `jpdbPageWordEnhancementsEnabled` |
| Add sources to kanji pages | — | on | `jpdbPageKanjiEnhancementsEnabled` |
| New tab JPDB deck | — | All study decks (`all`) | `newTabJpdbDeck` |
| Allow API review/deck changes | — | on | `jpdbMiningEnabled` |
| Allow Bunpro review/mining | — | on | `bunproMiningEnabled` |
| Allow WaniKani review (due assignments only) | — | on | `wanikaniReviewEnabled` |
| Preferred grading service | — | Jiten (`jiten`) | `apiGradingProvider` |
| Mining deck | — | FORQ (`forq`) | `miningDeck` |
| Add reviewed words to the mining deck automatically | — | off | `autoMineOnReview` |
| Never forget deck | — | Saved: never-forget (`never-forget`) | `neverForgetDeck` |
| Blacklist deck | — | Saved: blacklist (`blacklist`) | `blacklistDeck` |
| Also copy JPDB adds to forq | — | off | `addToForq` |
| Show review buttons | — | on | `enableReviews` |

## Appearance

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Settings language | — | English (`en`) | `interfaceLanguage` |
| Not yet described | — | 1 entry | `languageProfiles` |
| Not yet described | — | `default-ja` | `activeLanguageProfileId` |
| Accent color | — | `#5ea780` | `accentColor` |
| New and in deck | — | `#ffffff` | `wordColorNew` |
| Learning | — | `#ffd166` | `wordColorLearning` |
| Known and never forget | — | `#7bd88f` | `wordColorKnown` |
| Due | — | `#5fb3b3` | `wordColorDue` |
| Failed | — | `#ff6b6b` | `wordColorFailed` |
| Ignored, suspended, and blacklisted | — | `#b8a7ff` | `wordColorIgnored` |
| Word highlight color | — | Primary deck status (`jpdb`) | `wordHighlightColorSource` |
| Word underline color | — | Pitch accent (`pitch`) | `wordUnderlineColorSource` |
| Word text color | — | Anki status (`anki`) | `wordTextColorSource` |
| Subtitle highlight color | — | Primary deck status (`jpdb`) | `subtitleHighlightColorSource` |
| Subtitle underline color | — | Pitch accent (`pitch`) | `subtitleUnderlineColorSource` |
| Subtitle text color | — | Anki status (`anki`) | `subtitleTextColorSource` |
| Not yet described | — | `#223c2e` | `ocrBackgroundColor` |
| Not yet described | — | 16 entries | `dictionaryLookupLinks` |
| Theme | — | `auto` | `theme` |
| Popup mode | — | Auto (`auto`) | `popupMode` |
| Hover popup mode | — | Popover (`popover`) | `hoverPopupMode` |
| Keep sheet open after lookup | — | off | `stickyBottomSheet` |
| Dim page behind popover | — | on | `popoverBackdropEnabled` |
| Popover width (px) | — | `520` | `popoverWidth` |
| Popover height (px) | — | `540` | `popoverHeight` |
| Popover height behavior | — | Use height setting (`fixed`) | `popoverHeightMode` |
| Reader interface font | — | System UI (`system-ui, -apple-system, BlinkMacSystemFon…`) | `readerFontFamily` |
| Popup font | — | Built-in font (`"Nunito Sans", "Extra Sans JP", "Noto Sans …`) | `popupFontFamily` |
| Popup font weight | — | `450` | `popupFontWeight` |

## Study

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Use Anki cards in Study | — | off | `newTabAnkiEnabled` |
| Not yet described | — | empty list | `newTabAnkiDisabledDecks` |
| Study review source | — | Auto: Academy, accounts, then study words (`auto`) | `newTabSource` |
| API review mode | — | Auto: live kanji + API vocabulary (`auto`) | `newTabJpdbReviewMode` |
| Kanji keyword source | — | Auto: RTK, then JPDB kanji facts, then local (`auto`) | `newTabKanjiKeywordSource` |
| Enable sentence parsing on Study | — | on | `newTabParsingEnabled` |
| Show sentence on word fronts | — | on | `newTabFrontSentenceEnabled` |
| Cache Study for offline use | — | on | `newTabOfflineEnabled` |
| Offline review cache limit | — | `50` | `newTabOfflineLimit` |
| Daily study goal (minutes, 0 = off) | — | `60` | `newTabDailyGoalMinutes` |
| Study kanji before unlocking words | — | on | `newTabKanjiUnlockEnabled` |
| Stop at the end of each batch | — | off | `newTabStopAtBatchEnd` |
| Swipe cards to grade (left = fail, right = pass) | — | on | `newTabSwipeReviews` |
| Show Study keyboard shortcut hints | — | on | `newTabShortcutHintsEnabled` |
| Auto-grade kanji drawing | — | on | `newTabKanjiAutogradeEnabled` |
| Auto-submit kanji grade | — | off | `newTabKanjiAutoSubmit` |
| Not yet described | — | 6 entries | `newTabStudyStepOrder` |
| Not yet described | — | empty list | `newTabStudyDisabledSteps` |
| Not yet described | — | off | `newTabStudyTourSeen` |
| Enable Academy | — | on | `yomuLocalSrsEnabled` |
| Review rating scale | — | off | `twoButtonReviews` |

## Audio (Media tab)

URL tokens: {term}, {reading}, {language}.

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Enable term audio | — | on | `audioEnabled` |
| Auto-play term audio | — | on | `autoPlayAudio` |
| Disable lookup audio on video pages | — | on | `suppressAutoAudioOnVideo` |
| Auto-play trigger | — | Hover and tap/click (`all`) | `audioAutoPlayMode` |
| Not yet described | — | 8 entries | `audioSources` |
| Enable built-in audio sources | — | on | `audioEnableDefaultSources` |
| Enable fallback chime | — | on | `audioFallbackChimeEnabled` |
| Audio timeout (ms) | — | `6000` | `audioTimeoutMs` |
| When several sources or clips exist | — | Shuffle audio (`random`) | `audioSelectionMode` |
| Text-to-speech handling | — | Fallback after recorded audio (`fallback`) | `audioTtsMode` |
| Cross-origin proxy URL | — | empty | `corsProxyUrl` |

## Immersion Kit (Media tab)

Examples appear in popups. Nadeshiko needs a key.

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Show Immersion Kit examples | — | on | `immersionKitEnabled` |
| Example provider | — | Immersion Kit (`immersion-kit`) | `immersionKitExampleSource` |
| Nadeshiko API key | — | empty | `nadeshikoApiKey` |
| Examples per word limit | — | off | `immersionKitLimitEnabled` |
| Examples per word | — | `12` | `immersionKitLimit` |
| Minimum sentence length | — | `8` | `immersionKitMinLength` |
| Maximum sentence length | — | `80` | `immersionKitMaxLength` |
| Immersion Kit category | — | All (`all`) | `immersionKitCategory` |
| Example order | — | Shortest first (`sentence_length:asc`) | `immersionKitSort` |
| Prefer exact matches | — | off | `immersionKitExactMatch` |
| Show example translations | — | on | `immersionKitShowTranslation` |
| Blur example translations until clicked | — | on | `immersionKitRevealTranslationOnClick` |
| Show example thumbnails | — | on | `immersionKitShowImages` |
| Play example audio after reveal or next/previous | — | on | `immersionKitAutoPlayAudio` |
| Play example audio when hovering thumbnails | — | on | `immersionKitPlayOnHover` |
| Play example audio when clicking thumbnails | — | on | `immersionKitPlayOnImageClick` |
| Example audio speed | — | `1` | `immersionKitPlaybackRate` |

## Reader (Appearance tab)

Set a hover key. Blank means plain hover.

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Heiban (flat) | — | `#359eff` | `pitchColorHeiban` |
| Atamadaka (head-high) | — | `#fe4b74` | `pitchColorAtamadaka` |
| Nakadaka (middle-high) | — | `#fba840` | `pitchColorNakadaka` |
| Odaka (tail-high) | — | `#57ccb7` | `pitchColorOdaka` |
| Unknown | — | `#94a3b8` | `pitchColorUnknown` |
| Look up on tap or click | — | on | `lookupOnClick` |
| Look up on hover | — | on | `lookupOnHover` |
| Look up with middle-mouse hold | — | on | `lookupOnMiddleMouse` |
| Hover open delay (ms) | — | `0` | `hoverOpenDelayMs` |
| Hover close delay (ms) | — | `80` | `hoverCloseDelayMs` |
| Show Yomu lookup popup | — | `hover` | `popupActivationMode` |
| Show settings puck | — | on | `showFloatingButton` |
| Japanese text on webpages | — | off | `annotationsPaused` |
| Furigana | — | Show on every parsed word (`all`) | `furiganaMode` |
| Readings on clamped rows | — | Show (row grows) (`show`) | `clampedRowReadings` |
| Not yet described | — | 3 entries | `furiganaHiddenStateGroups` |
| Color words | — | Use all learning states (`all`) | `wordColorStates` |
| Not yet described | — | empty list | `wordColorHiddenStateGroups` |
| Show pronunciation | — | on | `showPitchAccent` |
| Hide JPDB-redundant styling | — | off | `suppressRedundantWordUi` |
| Sheet close button on left | — | off | `sheetCloseButtonOnLeft` |
| Hide furigana for known cards only | — | on | `hideKnownFurigana` |
| Manual page scan shortcut | — | `Shift+J` | `shortcuts.scanPage` |
| Hold while hovering | — | empty | `shortcuts.hoverLookup` |

## Sources

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| JPDB: shown in the popup | JPDB meanings from the current card. | on | `jpdbDefinitionsEnabled` |
| JPDB: display name | JPDB meanings from the current card. | empty | `jpdbDefinitionsAlias` |
| JPDB: order in the popup | JPDB meanings from the current card. | `1` | `jpdbDefinitionsPriority` |
| Jiten: shown in the popup | Jiten meanings, examples, and related words. | on | `jitenDefinitionsEnabled` |
| Jiten: display name | Jiten meanings, examples, and related words. | empty | `jitenDefinitionsAlias` |
| Jiten: order in the popup | Jiten meanings, examples, and related words. | `0` | `jitenDefinitionsPriority` |
| Bunpro: shown in the popup | Bunpro vocabulary and grammar meanings, nuance, and examples. | on | `bunproDefinitionsEnabled` |
| Bunpro: display name | Bunpro vocabulary and grammar meanings, nuance, and examples. | empty | `bunproDefinitionsAlias` |
| Bunpro: order in the popup | Bunpro vocabulary and grammar meanings, nuance, and examples. | `2` | `bunproDefinitionsPriority` |
| WaniKani: shown in the popup | WaniKani vocabulary meanings, mnemonics, and SRS status for subjects on your account. | on | `wanikaniDefinitionsEnabled` |
| WaniKani: display name | WaniKani vocabulary meanings, mnemonics, and SRS status for subjects on your account. | empty | `wanikaniDefinitionsAlias` |
| WaniKani: order in the popup | WaniKani vocabulary meanings, mnemonics, and SRS status for subjects on your account. | `3` | `wanikaniDefinitionsPriority` |
| Immersion Kit: display name | Example sentences, images, and audio. | empty | `immersionKitAlias` |
| Immersion Kit: order in the popup | Example sentences, images, and audio. | `80` | `immersionKitPriority` |
| Show site frequency in pills | — | on | `showLookupPillFrequency` |
| Show imported dictionary definitions | — | on | `localDictionariesEnabled` |
| Parsing source | — | Local dictionaries (offline) (`local`) | `parserProvider` |
| Anki: shown in the popup | Matching Anki card content and status. | off | `ankiSectionEnabled` |
| Anki: display name | Matching Anki card content and status. | empty | `ankiSectionAlias` |
| Anki: order in the popup | Matching Anki card content and status. | `90` | `ankiSectionPriority` |
| Translation: shown in the popup | Sentence translation. | on | `studyTranslationEnabled` |
| Translation: display name | Sentence translation. | empty | `studyTranslationAlias` |
| Grammar: shown in the popup | Local grammar hints. | on | `studyGrammarEnabled` |
| Grammar: display name | Local grammar hints. | empty | `studyGrammarAlias` |
| Translation: order in the popup | Sentence translation. | `10` | `studyTranslationPriority` |
| Grammar: order in the popup | Local grammar hints. | `20` | `studyGrammarPriority` |

## Kanji (Sources tab)

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Readings and components: shown in the popup | JPDB readings, components, and mnemonic. | on | `jpdbKanjiEnabled` |
| Readings and components: display name | JPDB readings, components, and mnemonic. | empty | `jpdbKanjiAlias` |
| Readings and components: order in the popup | JPDB readings, components, and mnemonic. | `10` | `jpdbKanjiPriority` |
| Immersion Kit: shown in the popup | Example sentences, images, and audio. | on | `kanjiImmersionKitEnabled` |
| Immersion Kit: display name | Example sentences, images, and audio. | empty | `kanjiImmersionKitAlias` |
| Immersion Kit: order in the popup | Example sentences, images, and audio. | `60` | `kanjiImmersionKitPriority` |
| Uchisen: shown in the popup | Uchisen mnemonic image carousel. | on | `uchisenEnabled` |
| Uchisen: display name | Uchisen mnemonic image carousel. | empty | `uchisenAlias` |
| Uchisen: order in the popup | Uchisen mnemonic image carousel. | `50` | `uchisenPriority` |
| WaniKani: shown in the popup | WaniKani kanji meaning/reading mnemonics, level, and SRS status. | on | `wanikaniKanjiEnabled` |
| WaniKani: display name | WaniKani kanji meaning/reading mnemonics, level, and SRS status. | empty | `wanikaniKanjiAlias` |
| WaniKani: order in the popup | WaniKani kanji meaning/reading mnemonics, level, and SRS status. | `55` | `wanikaniKanjiPriority` |
| RTK: shown in the popup | RTK keywords, elements, and stories. | on | `rtkEnabled` |
| RTK: display name | RTK keywords, elements, and stories. | empty | `rtkAlias` |
| RTK: order in the popup | RTK keywords, elements, and stories. | `20` | `rtkPriority` |
| Stroke practice: shown in the popup | Stroke order preview and drawing pad. | on | `kanjivgEnabled` |
| Stroke practice: display name | Stroke order preview and drawing pad. | empty | `kanjivgAlias` |
| Stroke practice: order in the popup | Stroke order preview and drawing pad. | `0` | `kanjivgPriority` |
| Component graph: shown in the popup | Kanji facts, components, radical images. | on | `kanjiOriginsEnabled` |
| Component graph: display name | Kanji facts, components, radical images. | empty | `kanjiOriginsAlias` |
| Component graph: order in the popup | Kanji facts, components, radical images. | `30` | `kanjiOriginsPriority` |
| Not yet described | — | on | `kanjiOriginKanjiMapEnabled` |
| Not yet described | — | on | `kanjiOriginGraphEnabled` |
| Not yet described | — | on | `kanjiOriginRadicalImagesEnabled` |
| Not yet described | — | `8` | `similarKanjiWordLimit` |
| Not yet described | — | on | `localDictionaryShowKanji` |
| Imported kanji dictionaries: display name | Imported Yomitan kanji entries. | empty | `kanjiDictionariesAlias` |
| Imported kanji dictionaries: order in the popup | Imported Yomitan kanji entries. | `30` | `kanjiDictionariesPriority` |

## Image text (OCR) (Media tab)

Reads nearby images. Google Lens needs no setup.

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Image OCR scanning | — | on | `ocrAutoScanImages` |
| Auto-read paused video frames | — | off | `ocrVideoPauseFrames` |
| Show recognized text areas | — | off | `ocrShowTextOverlay` |
| OCR overlay theme | — | Match app theme (`auto`) | `ocrOverlayTheme` |
| Image reading | — | Google Lens (free, recommended) (`google-lens`) | `ocrProvider` |
| Local OCR server URL | — | empty | `ocrEndpointUrl` |
| Local OCR engine | — | Automatic (`auto`) | `ocrEngine` |
| Google Cloud Vision API key | — | empty | `ocrCloudVisionApiKey` |
| Not yet described | — | empty | `ocrLanguage` |
| Image detail | — | Balanced (`1200000`) | `ocrMaxImagePixels` |
| Smallest image to read | — | Normal (`45000`) | `ocrMinImageArea` |
| Images to read per page | — | Light (`3`) | `ocrMaxImagesPerPage` |
| Not yet described | — | `700` | `ocrPrefetchMargin` |
| Not yet described | — | `2` | `ocrPrefetchPages` |
| Not yet described | — | `3` | `ocrConcurrency` |
| Read light text on dark panels | — | on | `ocrInvertDarkPanels` |
| Image text color | — | `#ffffff` | `ocrTextColor` |
| Image text outline | — | `#000000` | `ocrOutlineColor` |
| Image highlight opacity | — | `0.68` | `ocrBackgroundOpacity` |
| Image text scale | — | `1` | `ocrFontScale` |

## Video (Media tab)

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Enable video subtitle player | — | on | `subtitlePlayerEnabled` |
| Auto-detect page subtitles | — | on | `subtitleAutoDetect` |
| Show subtitle overlay | — | off | `subtitleOverlayVisible` |
| Not yet described | — | off | `subtitleOverlayVisibleChosen` |
| Not yet described | — | off | `subtitleSecondaryVisibleChosen` |
| Blur native subtitles until hover | — | on | `subtitleNativeBlurred` |
| Blur strength | — | `12` | `subtitleNativeBlurStrength` |
| Karaoke word timing | — | on | `subtitleKaraokeMode` |
| Open transcript panel by default | — | off | `subtitleTranscriptVisible` |
| Open side panel when paused | — | off | `subtitlePausePanel` |
| Auto-pause after each shadow line | — | off | `subtitleShadowAutoPause` |
| Scroll transcript with playback | — | on | `subtitleTranscriptAutoScroll` |
| Resume auto-scroll delay (s) | — | `30` | `subtitleTranscriptAutoScrollResumeSeconds` |
| Auto-copy subtitle lines | — | off | `subtitleAutoCopyLine` |
| Copy line translation too | — | on | `subtitleCopyIncludeTranslation` |
| Subtitle controls | — | Compact controls (`auto`) | `subtitleControlsMode` |
| Subtitle font size (px) | — | `28` | `subtitleFontSize` |
| Subtitle bottom offset (%) | — | `16` | `subtitleBottomOffset` |
| Subtitle color | — | `#ffffff` | `subtitleTextColor` |
| Subtitle outline | — | `#000000` | `subtitleOutlineColor` |
| Subtitle background | — | `#181b20` | `subtitleBackgroundColor` |
| Subtitle background opacity | — | `0` | `subtitleBackgroundOpacity` |
| Subtitle font family | — | System UI (`system-ui, -apple-system, BlinkMacSystemFon…`) | `subtitleFontFamily` |
| Subtitle font weight | — | `760` | `subtitleFontWeight` |
| Pause video on subtitle click | — | on | `subtitleMiningPause` |
| Pause video on subtitle hover | — | on | `subtitleHoverPause` |
| Subtitle seek padding (s) | — | `0.08` | `subtitleSeekPadding` |

## YouTube (Media tab)

Filter YouTube for Japanese and open Japanese versions of sites.

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Japanese YouTube only | — | on | `youtubeImmersionEnabled` |
| Not yet described | — | off | `youtubeImmersionEnabledChosen` |
| Show hidden-video notice | — | on | `youtubeShowFilterNotice` |
| Show Japanese channel suggestions | — | on | `youtubeShowChannelRecommendations` |
| Not yet described | — | off | `youtubeShowChannelRecommendationsChosen` |
| Open Japanese versions of sites | — | off | `preferJapaneseSiteLanguage` |

## Anki (Mining tab)

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Enable Anki mining | — | off | `ankiEnabled` |
| AnkiConnect URL | — | `http://127.0.0.1:8765` | `ankiConnectUrl` |
| Anki deck | — | よむ | `ankiDeck` |
| Anki note type | — | よむ Japanese | `ankiModel` |
| Anki card template | — | Word first (`recognition`) | `ankiTemplateMode` |
| Word-first front: show reading | — | on | `ankiFrontReading` |
| Word-first front: show sentence | — | on | `ankiFrontSentence` |
| Show image on front | — | on | `ankiFrontImage` |
| Mobile Anki add-note fallback | — | off | `ankiMobileHandoff` |
| Not yet described | — | `yomu` | `ankiTags` |
| Also add to Anki when adding via API | — | off | `ankiMineWithJpdb` |
| Attach context image when possible | — | on | `ankiCaptureScreenshot` |
| Not yet described | — | empty | `ankiFieldMappings` |

## Shortcuts

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Open settings | — | `Ctrl+Shift+J` | `shortcuts.openSettings` |
| Play audio | — | `A` | `shortcuts.playAudio` |
| Close popup | — | `Escape` | `shortcuts.closePopup` |
| Previous word | — | `Shift+ArrowLeft` | `shortcuts.previousLookupWord` |
| Next word | — | `Shift+ArrowRight` | `shortcuts.nextLookupWord` |
| Previous subtitle | — | `A` | `shortcuts.previousSubtitle` |
| Next subtitle | — | `D` | `shortcuts.nextSubtitle` |
| Copy subtitle | — | `Shift+C` | `shortcuts.copySubtitle` |
| Toggle image reading | — | `Shift+O` | `shortcuts.toggleOcr` |
| Toggle subtitle overlay | — | `Shift+H` | `shortcuts.toggleSubtitleOverlay` |
| Toggle YouTube filter | — | `Shift+Y` | `shortcuts.toggleYoutubeImmersion` |
| Read images now | — | `Shift+I` | `shortcuts.scanImages` |
| Mass review visible words (Jiten) | — | `Shift+M` | `shortcuts.massReviewVisible` |
| Study: reveal card | — | `Space` | `shortcuts.studyReveal` |
| Study: reveal card (alternate) | — | `Enter` | `shortcuts.studyRevealAlternate` |
| Study: undo last review | — | `U` | `shortcuts.studyUndo` |
| Study: previous card | — | `ArrowLeft` | `shortcuts.studyPrevious` |
| Study: previous card (alternate) | — | `P` | `shortcuts.studyPreviousAlternate` |
| Study: next card | — | `ArrowRight` | `shortcuts.studyNext` |
| Study: next card (alternate) | — | `N` | `shortcuts.studyNextAlternate` |
| Grade NOTHING | — | `1` | `shortcuts.gradeNothing` |
| Grade SOMETHING | — | `2` | `shortcuts.gradeSomething` |
| Grade HARD | — | `3` | `shortcuts.gradeHard` |
| Grade OKAY | — | `4` | `shortcuts.gradeOkay` |
| Grade EASY | — | `5` | `shortcuts.gradeEasy` |
| Pass/fail: FAIL | — | `1` | `shortcuts.gradeFail` |
| Pass/fail: PASS | — | `2` | `shortcuts.gradePass` |

## Help

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Enable diagnostic logging | — | off | `enableLogging` |

## Settings without a section of their own

Yomu stores these the same way, and a settings export carries them. Some are written as you use the app, such as where you dragged the settings puck. Others are set by a control that covers several settings at once, so this page leaves the section blank rather than picking one.

| Setting | What it does | Default | Stored as |
| --- | --- | --- | --- |
| Jiten API key | — | empty | `jitenApiKey` |
| Not yet described | — | empty | `bunproApiKey` |
| Not yet described | — | off | `onboardingSeen` |
| Not yet described | — | on | `similarKanjiWords` |
| Not yet described | — | `40` | `similarKanjiWordsPriority` |
| Not yet described | — | `https://audio.yomureader.com/?term={term}&r…` | `audioSourceUrl` |
| Not yet described | — | on | `audioViaBlob` |
| Not yet described | — | on | `immersionKitExpandedLimitMigrated20260721` |
| Not yet described | — | `shift` | `scanModifierKey` |
| Not yet described | — | off | `newTabEnabled` |
| Not yet described | — | `keyboard` | `newTabTypeWordInputMode` |
| Not yet described | — | unset | `puckPositionX` |
| Not yet described | — | unset | `puckPositionY` |
| Manual page scanning | — | off | `manualScanEnabled` |
| Enable furigana annotations | — | on | `showFurigana` |
| Not yet described | — | empty | `puckFuriganaModeBeforeHide` |
| Read text in images | — | on | `ocrEnabled` |
| Dictionary result limit | — | `12` | `localDictionaryMaxResults` |
| Open sources by default | — | on | `dictionarySourcesInitiallyExpanded` |
| Not yet described | — | empty list | `dictionaryPreferences` |
| Show native subtitles | — | off | `subtitleSecondaryVisible` |
| Transcript panel position | — | `right` | `subtitleTranscriptPlacement` |
| Not yet described | — | on | `youtubeFilterNoticeRestored20260711` |
| Not yet described | — | on | `themeAutoRestored20260730` |
| Not yet described | — | on | `ankiSentenceAudioMappingMigrated` |
