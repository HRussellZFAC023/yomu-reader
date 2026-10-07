# Settings simplification for 2.1

This branch reduces the settings model and checks the existing UI. It does not
change release metadata or publish builds. The baseline is origin/main 2.0.12
(1,842,725 bytes). Screenshots and gate logs remain untracked.

## Decisions

Remove 23 stored options: 15 built-in source aliases, five example-search
filters, two audio tuning knobs, and the global source-expansion default.
Use the existing defaults, including the existing per-surface example budgets.
Keep source enablement, provider credentials, write destinations, privacy controls,
font/colour/input/timing accessibility, imported dictionary identities and ordering.
Merge autoplay into one selector without losing old silent profiles. Merge the
example-limit switch and count into one number (0 means all). Built-in source rows use translated names; an imported dictionary
can still have its own shorter display name in the same name cell.

Retired keys are absent from `ReaderSettings` and `DEFAULT_SETTINGS`, so the existing
normalizer drops them. Real v1.9.3 file and Drive backup bytes are tested through the
existing loader/export path; unknown keys and old intent cannot revive a control.
No storage authority, bridge or restore-transaction code is changed.

The table inventories all 279 baseline reference rows, including every shortcut.
The “Purpose” column comes from the real form/reference; internal fields that had
no reference wording are described explicitly here. “Other branch” identifies
protected language/onboarding work, not a completed removal on this branch.

## Inventory

| Stored key | Purpose | Who needs it | Decision | Reason / chosen behavior |
| --- | --- | --- | --- | --- |
| `apiKey` | API key | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `jitenApiKey` | Jiten API key | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `bunproApiKey` | Legacy Bunpro credential slot; preserve credential input on load. | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `bunproFrontendApiToken` | Bunpro frontend API token | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `bunproFrontendApiTokenExpiresAt` | Bunpro token expiry used to refuse expired credentials. | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `wanikaniApiToken` | WaniKani personal access token | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `onboardingSeen` | Records whether welcome was completed. | Setup and language selection | Other branch | Preserve here; Japanese-only/onboarding work owns this choice. |
| `learningTargetChosen` | Records explicit learning-target choice. | Setup and language selection | Other branch | Preserve here; Japanese-only/onboarding work owns this choice. |
| `interfaceLanguage` | Settings language | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `languageProfiles` | Target and definition-language profile records. | Setup and language selection | Other branch | Preserve here; Japanese-only/onboarding work owns this choice. |
| `activeLanguageProfileId` | Selected learning-language profile. | Setup and language selection | Other branch | Preserve here; Japanese-only/onboarding work owns this choice. |
| `accentColor` | Accent color | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `wordColorNew` | New and in deck | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `wordColorLearning` | Learning | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `wordColorKnown` | Known and never forget | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `wordColorDue` | Due | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `wordColorFailed` | Failed | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `wordColorIgnored` | Ignored, suspended, and blacklisted | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `pitchColorHeiban` | Heiban (flat) | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `pitchColorAtamadaka` | Atamadaka (head-high) | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `pitchColorNakadaka` | Nakadaka (middle-high) | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `pitchColorOdaka` | Odaka (tail-high) | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `pitchColorUnknown` | Unknown | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `wordHighlightColorSource` | Word highlight color | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `wordUnderlineColorSource` | Word underline color | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `wordTextColorSource` | Word text color | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleHighlightColorSource` | Subtitle highlight color | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleUnderlineColorSource` | Subtitle underline color | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleTextColorSource` | Subtitle text color | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `jpdbDefinitionsEnabled` | JPDB: shown in the popup | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `jpdbDefinitionsAlias` | JPDB: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `jpdbDefinitionsPriority` | JPDB: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `jitenDefinitionsEnabled` | Jiten: shown in the popup | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `jitenDefinitionsAlias` | Jiten: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `jitenDefinitionsPriority` | Jiten: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `bunproDefinitionsEnabled` | Bunpro: shown in the popup | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `bunproDefinitionsAlias` | Bunpro: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `bunproDefinitionsPriority` | Bunpro: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `wanikaniDefinitionsEnabled` | WaniKani: shown in the popup | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `wanikaniDefinitionsAlias` | WaniKani: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `wanikaniDefinitionsPriority` | WaniKani: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `jpdbPageEnhancementsEnabled` | Enhance dictionary pages | Learners using API | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `jpdbPageWordEnhancementsEnabled` | Add sources to word/search pages | Learners using API | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `jpdbPageKanjiEnhancementsEnabled` | Add sources to kanji pages | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `jpdbKanjiEnabled` | Readings and components: shown in the popup | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `jpdbKanjiAlias` | Readings and components: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `jpdbKanjiPriority` | Readings and components: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `kanjiImmersionKitEnabled` | Immersion Kit: shown in the popup | Learners using Kanji | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `kanjiImmersionKitAlias` | Immersion Kit: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `kanjiImmersionKitPriority` | Immersion Kit: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `wanikaniKanjiEnabled` | WaniKani: shown in the popup | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `wanikaniKanjiAlias` | WaniKani: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `wanikaniKanjiPriority` | WaniKani: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `rtkEnabled` | RTK: shown in the popup | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `rtkAlias` | RTK: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `rtkPriority` | RTK: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `kanjivgEnabled` | Stroke practice: shown in the popup | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `kanjivgAlias` | Stroke practice: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `kanjivgPriority` | Stroke practice: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `kanjiOriginsEnabled` | Component graph: shown in the popup | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `kanjiOriginsAlias` | Component graph: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `kanjiOriginsPriority` | Component graph: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `kanjiOriginKanjiMapEnabled` | Allow the external kanji map source. | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `kanjiOriginGraphEnabled` | Show the component graph. | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `kanjiOriginRadicalImagesEnabled` | Allow external radical images. | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `audioEnabled` | Enable term audio | Readers managing distraction, hearing access and practice pace | Keep | Preserve explicit sound, translation concealment, image and playback choices. |
| `autoPlayAudio` | Auto-play term audio | People choosing when sound starts | Merge UI | Merge the checkbox and trigger picker into one autoplay selector. Keep the stored boolean as compatibility state so old silent profiles remain silent. |
| `suppressAutoAudioOnVideo` | Disable lookup audio on video pages | Readers managing distraction, hearing access and practice pace | Keep | Preserve explicit sound, translation concealment, image and playback choices. |
| `audioAutoPlayMode` | Auto-play trigger | People choosing when sound starts | Merge UI | One selector offers Off, Hover, Tap/click, and Both. Read old boolean-off profiles as Off; retain existing backup fields. |
| `audioSources` | Enabled audio providers, order, endpoint, voice and subsource preferences. | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `audioEnableDefaultSources` | Enable built-in audio sources | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `audioSourceUrl` | Derived first audio-source URL for runtime compatibility. | Readers managing distraction, hearing access and practice pace | Keep | Preserve explicit sound, translation concealment, image and playback choices. |
| `audioViaBlob` | Controls authenticated/cross-origin audio acquisition; preserve the transport preference. | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `audioFallbackChimeEnabled` | Enable fallback chime | Readers managing distraction, hearing access and practice pace | Keep | Preserve explicit sound, translation concealment, image and playback choices. |
| `audioTimeoutMs` | Audio timeout (ms) | No learner-specific need | Remove | Use a 6,000 ms audio request budget. A millisecond tuning control does not help a learner choose audio. |
| `audioSelectionMode` | When several sources or clips exist | No learner-specific need | Remove | Shuffle clips when a source offers alternatives, as the existing default does. Source order and voice selection remain available. |
| `audioTtsMode` | Text-to-speech handling | Readers managing distraction, hearing access and practice pace | Keep | Preserve explicit sound, translation concealment, image and playback choices. |
| `immersionKitEnabled` | Show Immersion Kit examples | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `immersionKitAlias` | Immersion Kit: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `immersionKitExampleSource` | Example provider | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `nadeshikoApiKey` | Nadeshiko API key | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `immersionKitPriority` | Immersion Kit: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `immersionKitLimitEnabled` | Examples per word limit | Readers controlling response size | Merge UI | Merge into the examples count: 0 means all. Preserve stored flags and counts for older backups. |
| `immersionKitLimit` | Examples per word | Readers controlling response size | Merge UI | Keep a response-volume cap for slow or metered connections, expressed as a single number. Zero disables the extra cap; surface acquisition budgets still apply. |
| `immersionKitMinLength` | Minimum sentence length | No learner-specific need | Remove | Use at least 8 characters, the existing default, to avoid context-free example fragments. |
| `immersionKitMaxLength` | Maximum sentence length | No learner-specific need | Remove | Use at most 80 characters, the existing default, to keep example sentences readable. |
| `immersionKitCategory` | Immersion Kit category | No learner-specific need | Remove | Include all categories, the existing default. The example provider remains a learner choice. |
| `immersionKitSort` | Example order | No learner-specific need | Remove | Show shortest examples first, the existing default, so usable context comes first. |
| `immersionKitExactMatch` | Prefer exact matches | No learner-specific need | Remove | Keep normal matching, the existing default, so inflected uses remain discoverable. |
| `immersionKitShowTranslation` | Show example translations | Readers managing distraction, hearing access and practice pace | Keep | Preserve explicit sound, translation concealment, image and playback choices. |
| `immersionKitRevealTranslationOnClick` | Blur example translations until clicked | Readers managing distraction, hearing access and practice pace | Keep | Preserve explicit sound, translation concealment, image and playback choices. |
| `immersionKitShowImages` | Show example thumbnails | Readers managing distraction, hearing access and practice pace | Keep | Preserve explicit sound, translation concealment, image and playback choices. |
| `immersionKitAutoPlayAudio` | Play example audio after reveal or next/previous | Readers managing distraction, hearing access and practice pace | Keep | Preserve explicit sound, translation concealment, image and playback choices. |
| `immersionKitPlayOnHover` | Play example audio when hovering thumbnails | Readers managing distraction, hearing access and practice pace | Keep | Preserve explicit sound, translation concealment, image and playback choices. |
| `immersionKitPlayOnImageClick` | Play example audio when clicking thumbnails | Readers managing distraction, hearing access and practice pace | Keep | Preserve explicit sound, translation concealment, image and playback choices. |
| `immersionKitPlaybackRate` | Example audio speed | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `lookupOnClick` | Look up on tap or click | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `lookupOnHover` | Look up on hover | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `lookupOnMiddleMouse` | Look up with middle-mouse hold | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `hoverOpenDelayMs` | Hover open delay (ms) | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `hoverCloseDelayMs` | Hover close delay (ms) | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `popupActivationMode` | Show Yomu lookup popup | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `scanModifierKey` | Modifier used for guarded word scanning. | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `showFloatingButton` | Show settings puck | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `newTabAnkiEnabled` | Use Anki cards in Study | Learners using Study | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `newTabAnkiDisabledDecks` | Anki decks excluded from Study. | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `newTabSource` | Study review source | Learners using Study | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `newTabJpdbDeck` | New tab JPDB deck | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `newTabJpdbReviewMode` | API review mode | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `corsProxyUrl` | Cross-origin proxy URL | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `newTabKanjiKeywordSource` | Kanji keyword source | Learners using Study | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `newTabParsingEnabled` | Enable sentence parsing on Study | Learners using Study | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `newTabFrontSentenceEnabled` | Show sentence on word fronts | Learners using Study | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `newTabOfflineEnabled` | Cache Study for offline use | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `newTabOfflineLimit` | Offline review cache limit | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `newTabDailyGoalMinutes` | Daily study goal (minutes, 0 = off) | Learners using Study | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `newTabKanjiUnlockEnabled` | Study kanji before unlocking words | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `newTabStopAtBatchEnd` | Stop at the end of each batch | Learners using Study | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `newTabSwipeReviews` | Swipe cards to grade (left = fail, right = pass) | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `newTabShortcutHintsEnabled` | Show Study keyboard shortcut hints | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `newTabKanjiAutogradeEnabled` | Auto-grade kanji drawing | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `newTabTypeWordInputMode` | Keyboard or handwriting input for the current practice flow. | The existing runtime and older backups | Keep internal | Runtime or compatibility state, not an additional learner-facing control. |
| `puckPositionX` | Saved horizontal floating-button position. | The existing runtime and older backups | Keep internal | Runtime or compatibility state, not an additional learner-facing control. |
| `puckPositionY` | Saved vertical floating-button position. | The existing runtime and older backups | Keep internal | Runtime or compatibility state, not an additional learner-facing control. |
| `manualScanEnabled` | Manual page scanning | Learners using Reader/Study | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `annotationsPaused` | Selected learning-language text on webpages | Learners using Reader | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `showFurigana` | Enable furigana annotations | Learners using Reader/Study | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `furiganaMode` | Furigana | Learners using Reader | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `clampedRowReadings` | Readings on clamped rows | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `puckFuriganaModeBeforeHide` | Furigana mode restored by the floating button. | The existing runtime and older backups | Keep internal | Runtime or compatibility state, not an additional learner-facing control. |
| `furiganaHiddenStateGroups` | Learning states whose readings are concealed. | The existing runtime and older backups | Keep internal | Runtime or compatibility state, not an additional learner-facing control. |
| `wordColorStates` | Color words | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `wordColorHiddenStateGroups` | Learning states excluded from word colouring. | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `showPitchAccent` | Show pronunciation | Learners using Reader | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `showLookupPillFrequency` | Show site frequency in pills | Learners using Sources | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `suppressRedundantWordUi` | Hide JPDB-redundant styling | Learners using Reader | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `sheetCloseButtonOnLeft` | Sheet close button on left | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `hideKnownFurigana` | Hide furigana for known cards only | Learners using Reader/Study | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `ocrEnabled` | Read text in images | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrAutoScanImages` | Image OCR scanning | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrVideoPauseFrames` | Auto-read paused video frames | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrShowTextOverlay` | Show recognized text areas | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrOverlayTheme` | OCR overlay theme | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrProvider` | Image reading | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrEndpointUrl` | Local OCR server URL | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ocrEngine` | Local OCR engine | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrCloudVisionApiKey` | Google Cloud Vision API key | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ocrLanguage` | OCR language hint; owned by the Japanese-only work. | Setup and language selection | Other branch | Preserve here; Japanese-only/onboarding work owns this choice. |
| `ocrMaxImagePixels` | Image detail | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrMinImageArea` | Smallest image to read | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrMaxImagesPerPage` | Images to read per page | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrPrefetchMargin` | Image prefetch distance in pixels. | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrPrefetchPages` | Pages eligible for image prefetch. | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrConcurrency` | Maximum concurrent OCR jobs. | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrInvertDarkPanels` | Read light text on dark panels | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `ocrTextColor` | Image text color | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `ocrOutlineColor` | Image text outline | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `ocrBackgroundColor` | Derived accessible OCR background colour. | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `ocrBackgroundOpacity` | Image highlight opacity | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `ocrFontScale` | Image text scale | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `localDictionariesEnabled` | Show imported dictionary definitions | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `parserProvider` | Parsing source | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `localDictionaryMaxResults` | Dictionary result limit | Internal lookup budget | Keep internal | Already fixed to 12 by normalization and absent from the form; target-language consumers are owned by another branch. |
| `localDictionaryShowKanji` | Whether imported kanji dictionaries appear. | The existing runtime and older backups | Keep internal | Runtime or compatibility state, not an additional learner-facing control. |
| `kanjiDictionariesAlias` | Imported kanji dictionaries: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `kanjiDictionariesPriority` | Imported kanji dictionaries: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `dictionarySourcesInitiallyExpanded` | Open sources by default | No learner-specific need | Remove | Open sources initially; retain each source’s remembered expand/collapse action. No global expansion preference is needed. |
| `dictionaryPreferences` | Imported dictionary identity, display name, enablement, order, and metadata preferences. | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `dictionaryLookupLinks` | Outbound lookup destinations and their labels/order. | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `subtitlePlayerEnabled` | Enable video subtitle player | Video learners using subtitles or shadowing | Keep | Preserve subtitle access, navigation, playback and deliberate copy behavior. |
| `subtitleAutoDetect` | Auto-detect page subtitles | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `subtitleOverlayVisible` | Show subtitle overlay | Video learners using subtitles or shadowing | Keep | Preserve subtitle access, navigation, playback and deliberate copy behavior. |
| `subtitleSecondaryVisible` | Show native subtitles | Video learners using subtitles or shadowing | Keep | Preserve subtitle access, navigation, playback and deliberate copy behavior. |
| `subtitleOverlayVisibleChosen` | Records explicit subtitle-overlay visibility choice. | Video learners using subtitles or shadowing | Keep | Preserve subtitle access, navigation, playback and deliberate copy behavior. |
| `subtitleSecondaryVisibleChosen` | Records explicit secondary-subtitle visibility choice. | Video learners using subtitles or shadowing | Keep | Preserve subtitle access, navigation, playback and deliberate copy behavior. |
| `subtitleNativeBlurred` | Blur native subtitles until hover | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleNativeBlurStrength` | Blur strength | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleKaraokeMode` | Karaoke word timing | Video learners using subtitles or shadowing | Keep | Preserve subtitle access, navigation, playback and deliberate copy behavior. |
| `subtitleTranscriptVisible` | Open transcript panel by default | Video learners using subtitles or shadowing | Keep | Preserve subtitle access, navigation, playback and deliberate copy behavior. |
| `subtitlePausePanel` | Open side panel when paused | Video learners using subtitles or shadowing | Keep | Preserve subtitle access, navigation, playback and deliberate copy behavior. |
| `subtitleShadowAutoPause` | Auto-pause after each shadow line | Video learners using subtitles or shadowing | Keep | Preserve subtitle access, navigation, playback and deliberate copy behavior. |
| `subtitleTranscriptPlacement` | Transcript panel position | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleTranscriptAutoScroll` | Scroll transcript with playback | Video learners using subtitles or shadowing | Keep | Preserve subtitle access, navigation, playback and deliberate copy behavior. |
| `subtitleTranscriptAutoScrollResumeSeconds` | Resume auto-scroll delay (s) | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleAutoCopyLine` | Auto-copy subtitle lines | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `subtitleCopyIncludeTranslation` | Copy line translation too | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `subtitleControlsMode` | Subtitle controls | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleFontSize` | Subtitle font size (px) | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleBottomOffset` | Subtitle bottom offset (%) | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleTextColor` | Subtitle color | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleOutlineColor` | Subtitle outline | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleBackgroundColor` | Subtitle background | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleBackgroundOpacity` | Subtitle background opacity | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleFontFamily` | Subtitle font family | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleFontWeight` | Subtitle font weight | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `subtitleMiningPause` | Pause video on subtitle click | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `subtitleHoverPause` | Pause video on subtitle hover | Video learners using subtitles or shadowing | Keep | Preserve subtitle access, navigation, playback and deliberate copy behavior. |
| `subtitleSeekPadding` | Subtitle seek padding (s) | Readers adapting text, contrast, pace or layout | Keep | Preserve visual access, readable timing and placement instead of imposing one physical setup. |
| `youtubeImmersionEnabled` | Filter YouTube to the selected learning language | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `youtubeImmersionEnabledChosen` | Records explicit YouTube filter choice. | Setup and language selection | Other branch | Preserve here; Japanese-only/onboarding work owns this choice. |
| `youtubeShowFilterNotice` | Show hidden-video notice | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `youtubeShowChannelRecommendations` | Show Japanese channel suggestions | Privacy-conscious readers and users with limited connectivity | Keep | Preserve control over network use, local data, clipboard access or automatic processing. |
| `youtubeShowChannelRecommendationsChosen` | Records explicit Japanese channel-suggestion choice. | Setup and language selection | Other branch | Preserve here; Japanese-only/onboarding work owns this choice. |
| `preferJapaneseSiteLanguage` | Open Japanese versions of sites | Setup and language selection | Other branch | Preserve here; Japanese-only/onboarding work owns this choice. |
| `ankiEnabled` | Enable Anki mining | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ankiSectionEnabled` | Anki: shown in the popup | Learners using Sources | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `ankiSectionAlias` | Anki: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `ankiSectionPriority` | Anki: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `ankiConnectUrl` | AnkiConnect URL | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ankiDeck` | Anki deck | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ankiModel` | Anki note type | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ankiTemplateMode` | Anki card template | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ankiFrontReading` | Word-first front: show reading | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ankiFrontSentence` | Word-first front: show sentence | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ankiFrontImage` | Show image on front | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ankiMobileHandoff` | Mobile Anki add-note fallback | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `studyTranslationEnabled` | Translation: shown in the popup | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `studyTranslationAlias` | Translation: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `studyGrammarEnabled` | Grammar: shown in the popup | Learners choosing trusted sources and reference methods | Keep | Source enablement controls optional lookups and what content is shown. |
| `studyGrammarAlias` | Grammar: display name | No learner-specific need | Remove | Use the source’s translated name. Renaming built-in services obscures provenance and duplicates a name learners already know. |
| `enableLogging` | Enable diagnostic logging | People diagnosing a problem | Keep | Explicit diagnostic logging opt-in is a privacy choice. |
| `ankiTags` | Tags attached to mined Anki notes. | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ankiMineWithJpdb` | Also add to Anki when adding via API | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ankiCaptureScreenshot` | Attach context image when possible | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `ankiFieldMappings` | Mappings from captured content to each Anki note type. | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `theme` | Theme | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `popupMode` | Popup mode | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `hoverPopupMode` | Hover popup mode | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `stickyBottomSheet` | Keep sheet open after lookup | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `popoverBackdropEnabled` | Dim page behind popover | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `popoverWidth` | Popover width (px) | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `popoverHeight` | Popover height (px) | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `popoverHeightMode` | Popover height behavior | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `readerFontFamily` | Reader interface font | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `popupFontFamily` | Popup font | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `popupFontWeight` | Popup font weight | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `jpdbMiningEnabled` | Allow API review/deck changes | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `bunproMiningEnabled` | Allow Bunpro review/mining | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `wanikaniReviewEnabled` | Allow WaniKani review (due assignments only) | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `yomuLocalSrsEnabled` | Enable Academy | Learners using Study | Keep | Retains an explicit reading or learning behavior with a distinct effect. |
| `apiGradingProvider` | Preferred grading service | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `miningDeck` | Mining deck | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `autoMineOnReview` | Add reviewed words to the mining deck automatically | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `neverForgetDeck` | Never forget deck | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `blacklistDeck` | Blacklist deck | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `addToForq` | Also copy JPDB adds to forq | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `enableReviews` | Show review buttons | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `twoButtonReviews` | Review rating scale | Learners connecting a review service or saving cards | Keep | Preserve credentials, explicit write destinations, review ownership and saved-content choices. |
| `studyTranslationPriority` | Translation: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `studyGrammarPriority` | Grammar: order in the popup | Learners with multiple dictionaries or reference sources | Keep | Keep source order and imported-dictionary identity; dictionaries and learning methods differ. Use reorder buttons rather than numeric inputs. |
| `shortcuts.scanPage` | Manual page scan shortcut | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.hoverLookup` | Hold while hovering | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.openSettings` | Open settings | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.playAudio` | Play audio | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.closePopup` | Close popup | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.previousLookupWord` | Previous word | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.nextLookupWord` | Next word | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.previousSubtitle` | Previous subtitle | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.nextSubtitle` | Next subtitle | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.copySubtitle` | Copy subtitle | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.toggleOcr` | Toggle image reading | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.toggleSubtitleOverlay` | Toggle subtitle overlay | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.toggleYoutubeImmersion` | Toggle YouTube filter | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.scanImages` | Read images now | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.massReviewVisible` | Mass review visible words (Jiten) | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.studyReveal` | Study: reveal card | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.studyRevealAlternate` | Study: reveal card (alternate) | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.studyUndo` | Study: undo last review | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.studyPrevious` | Study: previous card | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.studyPreviousAlternate` | Study: previous card (alternate) | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.studyNext` | Study: next card | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.studyNextAlternate` | Study: next card (alternate) | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.gradeNothing` | Grade NOTHING | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.gradeSomething` | Grade SOMETHING | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.gradeHard` | Grade HARD | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.gradeOkay` | Grade OKAY | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.gradeEasy` | Grade EASY | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.gradeFail` | Pass/fail: FAIL | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |
| `shortcuts.gradePass` | Pass/fail: PASS | Keyboard, touch, low-vision and motor-access users | Keep | Accessibility, readable presentation, or reliable input across devices; do not remove. |

## Layout and flow changes

- Credential settings links are siblings of their field labels. Each field keeps its associated label; clicking a link cannot also focus the credential input.
- Selecting a Settings tab resets its shared scroll container, so a newly opened panel begins at its heading.
- Built-in source names are plain text. Imported dictionary names remain editable. Mobile rows use one shared two-column layout and 44 px reorder buttons.
- Autoplay has one selector. Example count uses 0 for no additional cap. Search keeps an accessible name without repeating its placeholder as a caption.
- Removed the Popup order explanation and the Backup introduction; the controls already name their actions. Search includes control titles and accessible names, so icon actions remain discoverable without extra visible prose.
- Proxy setup uses the native disclosure marker instead of a second Show/Hide label. A usage search confirmed its custom toggle selectors and localization entries had no remaining owner; those rules were deleted. The larger CSS reduction consolidates repeated responsive source-row rules rather than claiming all removed rules were unused.
- Practice is reachable from phone navigation. The offline starter set contains 12 authored words with readings, meanings and sentences. Read, Write and Complete sentences use that same real selection, and Start is disabled when a chosen purpose has no eligible material. Provider review schedules are untouched.

## Verification boundary

The October 7 takeover began with 214 passing settings tests and a passing typecheck. A broader run passed 1,613 tests and exposed stale alias expectations, a timer test still assuming the retired 1-second budget, and an assertion read while its source was being edited. The final focused rerun passed all 310 tests across 17 files. The typecheck and build also passed. Detailed logs and actual-build captures are untracked under `artifacts/settings-takeover/`.

The first takeover capture used the actual built Study app, Chromium, 390 × 844, light theme, English, with live provider requests; it saved 91 states. Reviewed Settings API, Sources, Media and Backup images have legible controls and bounded icons. This is not a claim that the full original cross-browser/theme/language matrix, packaged extension, or integrated release has passed. Integration removes intentional Settings self-annotation separately, so final visual acceptance must use that combined build.

Measured against 2.0.12 after this source build: reader CSS 491,465 → 481,161 bytes (−10,304), Study CSS 660,315 → 650,071 (−10,244), settings CSS source 82,920 → 72,671 (−10,249), userscript 1,842,725 → 1,842,020 (−705). Generated assets are not part of this source-only commit.
