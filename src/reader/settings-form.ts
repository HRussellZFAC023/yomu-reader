import { NEW_TAB_PAGE_URL, SETTINGS_TITLE, SUPPORT_LINKS } from './constants';
import { escapeHtml, setInnerHtml } from './dom';
import { uiText } from './i18n';
import { Logger } from './logger';
import { AUDIO_GUIDE_URL, AUDIO_SOURCE_OPTIONS, DEFAULT_AUDIO_SOURCES, MAX_DICTIONARY_LOOKUP_LINKS, accentToRgba, formatShortcutEvent, normalizeAudioSource, normalizeDictionaryLookupLinks, normalizeOcrProvider, sanitizeAccentColor } from './settings';
import type { AudioSourceSetting, DictionaryLookupLink, DictionaryPreference, InterfaceLanguage, JPDBDeck, ReaderSettings } from './types';
import type { RecommendedDictionary } from './recommended-dictionaries';
import { RECOMMENDED_JAPANESE_DICTIONARIES } from './recommended-dictionaries';
import { definitionSourceRows, kanjiSourceRows, type SettingsSourceRow } from './source-sections';
import type { YomitanDictionaryInfo } from './yomitan';

const log = Logger.scope('SettingsForm');

export function renderSupportPanel(): string {
    return `
        <div class="jpdb-reader-support-card">
            <div>
                <div class="jpdb-reader-support-title">Free Japanese reading and mining tools</div>
                <p>よむ brings popup lookup, JPDB mining, imported dictionaries, subtitles, image reading, and Anki export into one free userscript. Comparable study suites such as <a href="${SUPPORT_LINKS.migakuPricing}" target="_blank" rel="noopener">Migaku</a> currently advertise paid plans from $10/month; よむ offers the same core reading-and-mining workflow for free.</p>
                <p>Donations are optional, but they directly buy maintenance time and make it more realistic for me to keep building よむ. If you donate and leave a よむ feature request in the message, I will personally read it and implement it when it is feasible, legal, and within project scope.</p>
            </div>
            <div class="jpdb-reader-support-actions">
                <a class="jpdb-reader-btn primary" href="${SUPPORT_LINKS.docs}" target="_blank" rel="noopener" data-support-link="docs">Documentation</a>
                <a class="jpdb-reader-btn add" href="${SUPPORT_LINKS.paypal}" target="_blank" rel="noopener" data-support-link="paypal">Donate</a>
                <a class="jpdb-reader-btn" href="${SUPPORT_LINKS.issues}" target="_blank" rel="noopener" data-support-link="issues">Report issue</a>
                <a class="jpdb-reader-btn" href="${SUPPORT_LINKS.github}" target="_blank" rel="noopener" data-support-link="github">GitHub</a>
                <button class="jpdb-reader-btn" type="button" data-action="copy-discord" data-support-link="discord">Copy Discord</button>
            </div>
            <div class="jpdb-reader-help">Discord: ${SUPPORT_LINKS.discordUsername}</div>
            <div class="jpdb-reader-help">Credits: mobile Anki handoff, template, translation, and grammar workflow ideas were informed by <a href="${SUPPORT_LINKS.yomikiri}" target="_blank" rel="noopener">Yomikiri</a>.</div>
        </div>
    `;
}

export function renderSettingsForm(settings: ReaderSettings, jpdbSettingsUrl: string): string {
    log.debug('Rendering settings form', {
        language: settings.interfaceLanguage,
        dictionaries: settings.dictionaryPreferences.length,
        audioSources: settings.audioSources.length,
        enableLogging: settings.enableLogging,
    });
    return `
            <div class="jpdb-reader-settings-head">
                <h2>${SETTINGS_TITLE}</h2>
            </div>
            <div class="jpdb-reader-settings-tabs" role="tablist" aria-label="Settings sections">
                ${settingsTabButton('basics', 'Basics', true)}
                ${settingsTabButton('dictionaries', 'Dictionaries')}
                ${settingsTabButton('media', 'Media')}
                ${settingsTabButton('mining', 'Mining')}
                ${settingsTabButton('shortcuts', 'Shortcuts')}
                ${settingsTabButton('help', 'Help')}
            </div>
            <div class="jpdb-reader-settings-scroll">
            <fieldset data-settings-panel="basics">
                <legend>JPDB</legend>
                ${input('apiKey', `API key <a href="${jpdbSettingsUrl}" target="_blank" rel="noopener">JPDB settings</a>`, settings.apiKey, 'password')}
                <div data-jpdb-decks>
                    ${renderDeckControls(settings, [], Boolean(settings.apiKey.trim()))}
                </div>
                ${checkbox('jpdbMiningEnabled', 'Enable JPDB mining actions', settings.jpdbMiningEnabled)}
                ${checkbox('addToForq', 'Also add mined cards to forq', settings.addToForq)}
                ${checkbox('enableReviews', 'Enable review actions', settings.enableReviews)}
                <div data-review-config ${settings.enableReviews ? '' : 'hidden'}>
                    ${select('twoButtonReviews', 'Review rating scale', settings.twoButtonReviews ? 'true' : 'false', [['false', 'Five point: NOTHING to EASY'], ['true', 'Two point: FAIL / PASS']])}
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">JPDB page add-ons</div>
                    <div class="grid">
                        ${checkbox('jpdbExtensionsEnabled', 'Enable JPDB page add-ons', settings.jpdbExtensionsEnabled)}
                        ${checkbox('jpdbUchisenEnabled', 'Uchisen mnemonic carousel', settings.jpdbUchisenEnabled)}
                        ${checkbox('jpdbRtkEnabled', 'RTK story panel', settings.jpdbRtkEnabled)}
                        ${checkbox('jpdbImmersionKitEnabled', 'Immersion Kit examples on JPDB', settings.jpdbImmersionKitEnabled)}
                        ${checkbox('jpdbImmersionKitAutoPlayReviewAudio', 'Play Immersion Kit audio on JPDB answer reveal', settings.jpdbImmersionKitAutoPlayReviewAudio)}
                        ${checkbox('jpdbLocalDictionariesEnabled', 'Imported dictionary entries on JPDB', settings.jpdbLocalDictionariesEnabled)}
                        ${checkbox('jpdbReviewUiEnabled', 'Compact review navigation', settings.jpdbReviewUiEnabled)}
                        ${checkbox('jpdbAutoRevealSentenceEnabled', 'Auto-reveal answer sentence', settings.jpdbAutoRevealSentenceEnabled)}
                        ${checkbox('jpdbKanjiDoodleEnabled', 'Kanji doodle pad in reviews', settings.jpdbKanjiDoodleEnabled)}
                    </div>
                    <div class="jpdb-reader-help">These only run on jpdb.io. Each add-on can be turned off without disabling the rest of よむ.</div>
                </div>
            </fieldset>
            <fieldset data-settings-panel="basics">
                <legend>Interface</legend>
                <div class="grid">
                    ${select('interfaceLanguage', 'Settings language', settings.interfaceLanguage, [['auto', 'Automatic'], ['en', 'English'], ['ja', '日本語']])}
                    ${select('theme', 'Theme', settings.theme, [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']])}
                    ${select('popupMode', 'Popup mode', settings.popupMode, [['auto', 'Auto'], ['sheet', 'Bottom sheet'], ['popover', 'Popover']])}
                    ${checkbox('enableLogging', 'Enable console logging', settings.enableLogging)}
                    ${input('accentColor', 'Accent color', sanitizeAccentColor(settings.accentColor), 'color')}
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">New tab</div>
                    <div class="grid">
                        ${checkbox('newTabEnabled', 'Use Yomu new tab study page', settings.newTabEnabled)}
                        ${select('newTabSource', 'New tab word source', settings.newTabSource, [['auto', 'Auto: Anki + JPDB + Dictionary'], ['jpdb', 'JPDB'], ['anki', 'Anki'], ['dictionary', 'Dictionary (Top 4000)']])}
                        <label>New tab address<input name="newTabUrl" type="text" value="${escapeHtml(NEW_TAB_PAGE_URL)}" readonly autocomplete="off"></label>
                    </div>
                    <div class="jpdb-reader-settings-actions">
                        <a class="jpdb-reader-btn" href="${NEW_TAB_PAGE_URL}" target="_blank" rel="noopener" data-newtab-url-link>Open new tab page</a>
                        <button class="jpdb-reader-btn" type="button" data-action="copy-newtab-url">Copy address</button>
                    </div>
                    <div class="jpdb-reader-help">Use this page as your browser new-tab URL or add it to the iPad Home Screen. If your browser will not accept the URL directly, set it in Chrome or your browser's new-tab settings using a new-tab redirect/override extension.</div>
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Word colors</div>
                    <div class="grid">
                        ${input('wordColorNew', 'New and suspended', settings.wordColorNew, 'color')}
                        ${input('wordColorLearning', 'Learning', settings.wordColorLearning, 'color')}
                        ${input('wordColorKnown', 'Known and never', settings.wordColorKnown, 'color')}
                        ${input('wordColorDue', 'Due', settings.wordColorDue, 'color')}
                        ${input('wordColorFailed', 'Failed', settings.wordColorFailed, 'color')}
                        ${input('wordColorIgnored', 'Ignored and blacklisted', settings.wordColorIgnored, 'color')}
                    </div>
                </div>
                <div class="jpdb-reader-help">よむ can be used with JPDB first, imported dictionaries first, or local dictionaries only for definitions. Configure source order in Dictionaries.</div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>Audio</legend>
                ${checkbox('audioEnabled', 'Enable audio playback for terms', settings.audioEnabled)}
                ${checkbox('autoPlayAudio', 'Auto-play search result audio', settings.autoPlayAudio)}
                ${checkbox('audioEnableDefaultSources', 'Use built-in audio sources', settings.audioEnableDefaultSources)}
                ${checkbox('audioFallbackChimeEnabled', 'Play a soft chime when no audio is available', settings.audioFallbackChimeEnabled)}
                <div class="grid">
                    ${select('audioSelectionMode', 'When a source has several clips', settings.audioSelectionMode, [['first', 'First audio'], ['random', 'Random audio']])}
                    ${checkbox('audioViaBlob', 'Fetch as blob for iOS Tampermonkey', settings.audioViaBlob)}
                    ${input('audioTimeoutMs', 'Audio timeout (ms)', String(settings.audioTimeoutMs), 'number')}
                </div>
                <div class="jpdb-reader-audio-sources">
                    ${renderAudioSourceEditor(settings.audioSources)}
                </div>
                <div class="jpdb-reader-help">Supports {term}, {reading}, and {language}. See the <a href="${AUDIO_GUIDE_URL}" target="_blank" rel="noopener">Yomitan audio guide</a>.</div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>Immersion Kit</legend>
                <div class="grid">
                    ${checkbox('immersionKitEnabled', 'Show Immersion Kit examples', settings.immersionKitEnabled)}
                    ${checkbox('immersionKitShowTranslation', 'Show example translations', settings.immersionKitShowTranslation)}
                    ${checkbox('immersionKitShowImages', 'Show example thumbnails', settings.immersionKitShowImages)}
                    ${checkbox('immersionKitAutoPlayAudio', 'Play example audio after next/previous', settings.immersionKitAutoPlayAudio)}
                    ${checkbox('immersionKitPlayOnHover', 'Play first example audio on hover', settings.immersionKitPlayOnHover)}
                    ${select('immersionKitCategory', 'Example source', settings.immersionKitCategory, [['all', 'All'], ['anime', 'Anime'], ['drama', 'Drama'], ['games', 'Games']])}
                    ${select('immersionKitSort', 'Example order', settings.immersionKitSort, [['sentence_length:asc', 'Shortest first'], ['sentence_length:desc', 'Longest first'], ['random', 'Random']])}
                    ${input('immersionKitLimit', 'Examples per word', String(settings.immersionKitLimit), 'number', { min: 1, max: 12, step: 1 })}
                    ${input('immersionKitMinLength', 'Minimum sentence length', String(settings.immersionKitMinLength), 'number', { min: 0, max: 120, step: 1 })}
                    ${input('immersionKitMaxLength', 'Maximum sentence length', String(settings.immersionKitMaxLength), 'number', { min: 0, max: 240, step: 1 })}
                    ${input('immersionKitPlaybackRate', 'Example audio speed', String(settings.immersionKitPlaybackRate), 'number', { min: 0.5, max: 2, step: 0.05 })}
                    ${checkbox('immersionKitExactMatch', 'Prefer exact matches', settings.immersionKitExactMatch)}
                </div>
                <div class="jpdb-reader-help">Immersion examples appear inside word popups. Example text is tappable too, so translations can stay off unless you want them.</div>
            </fieldset>
            <fieldset data-settings-panel="basics">
                <legend>Reader</legend>
                <div class="grid">
                    ${checkbox('parseSelection', 'Lookup selected text', settings.parseSelection)}
                    ${checkbox('lookupOnClick', 'Tap or click scanned words', settings.lookupOnClick)}
                    ${checkbox('lookupOnHover', 'Hover scanned words', settings.lookupOnHover)}
                    ${checkbox('lookupOnMiddleMouse', 'Hold middle mouse button to scan words', settings.lookupOnMiddleMouse)}
                    ${checkbox('autoScanJapanese', 'Auto-scan when Japanese is detected', settings.autoScanJapanese)}
                    ${checkbox('scanVisiblePage', 'Scan visible page on load', settings.scanVisiblePage)}
                    ${checkbox('showFloatingButton', 'Toggle floating puck on pages', settings.showFloatingButton)}
                    ${select('furiganaMode', 'Furigana', settings.furiganaMode, [['auto', 'Automatic'], ['difficult-kanji', 'Difficult kanji only'], ['known-status', 'Hide known words'], ['all', 'All parsed words'], ['off', 'Off']])}
                    ${checkbox('showPitchAccent', 'Show pitch accent', settings.showPitchAccent)}
                    ${select('wordHighlightMode', 'Word highlight colors', settings.wordHighlightMode, [['auto', 'Automatic'], ['status', 'Known/mining status'], ['pitch', 'Pitch accent'], ['off', 'Off']])}
                </div>
                <div class="jpdb-reader-help">Hover lookup uses the shortcut below. Leave it blank for plain hover; keep click enabled if you also want tap lookup.</div>
            </fieldset>
            <fieldset data-settings-panel="basics">
                <legend>Kanji</legend>
                <div class="jpdb-reader-kanji-priorities" data-source-editor>
                    ${renderKanjiSourceRows(settings)}
                </div>
                <div class="grid">
                    ${checkbox('kanjiOriginKanjiMapEnabled', 'Use Kanji Alive and Kanji Map facts', settings.kanjiOriginKanjiMapEnabled)}
                    ${checkbox('kanjiOriginGraphEnabled', 'Show component graph', settings.kanjiOriginGraphEnabled)}
                    ${checkbox('kanjiOriginRadicalImagesEnabled', 'Show radical images', settings.kanjiOriginRadicalImagesEnabled)}
                    ${input('similarKanjiWordLimit', 'Similar word limit', String(settings.similarKanjiWordLimit), 'number', { min: 2, max: 24, step: 1 })}
                </div>
                <div class="jpdb-reader-help">Click a kanji inside the popup word to see RTK, local kanji dictionary meanings, component keywords, and related words.</div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>Images</legend>
                <div class="grid">
                    ${checkbox('ocrEnabled', 'Read text in images', settings.ocrEnabled)}
                    ${checkbox('ocrAutoScanImages', 'Read images automatically', settings.ocrAutoScanImages)}
                    ${checkbox('ocrShowTextOverlay', 'Show recognized text on images', settings.ocrShowTextOverlay)}
                    ${select('ocrProvider', 'Image reading', settings.ocrProvider, [['google-lens', 'Google Lens (recommended)'], ['local-service', 'Local OCR app'], ['cloud-vision', 'Google Cloud Vision'], ['off', 'Off']])}
                    ${select('ocrMaxImagesPerPage', 'Images to read per page', String(settings.ocrMaxImagesPerPage), [['3', 'Light'], ['8', 'Normal'], ['16', 'More']])}
                    ${select('ocrMinImageArea', 'Smallest image to read', String(settings.ocrMinImageArea), [['80000', 'Large images only'], ['45000', 'Normal'], ['15000', 'Include small images']])}
                    ${select('ocrMaxImagePixels', 'Image detail', String(settings.ocrMaxImagePixels), [['640000', 'Faster'], ['1200000', 'Balanced'], ['2000000', 'Sharper']])}
                    ${input('ocrTextColor', 'Image text color', settings.ocrTextColor, 'color')}
                    ${input('ocrOutlineColor', 'Image text outline', settings.ocrOutlineColor, 'color')}
                    ${input('ocrBackgroundColor', 'Image highlight background', settings.ocrBackgroundColor, 'color')}
                    ${input('ocrBackgroundOpacity', 'Image highlight opacity', String(settings.ocrBackgroundOpacity), 'number')}
                    ${input('ocrFontScale', 'Image text scale', String(settings.ocrFontScale), 'number')}
                    <label data-local-ocr ${settings.ocrProvider === 'local-service' ? '' : 'hidden'}>Local OCR app URL<input name="ocrEndpointUrl" type="text" value="${escapeHtml(settings.ocrEndpointUrl)}" autocomplete="off"></label>
                    <div data-local-ocr ${settings.ocrProvider === 'local-service' ? '' : 'hidden'}>${select('ocrEngine', 'Local OCR engine', settings.ocrEngine, [['auto', 'Automatic'], ['MangaOCR', 'MangaOCR'], ['PaddleOCR', 'PaddleOCR'], ['AppleVision', 'Apple Vision']])}</div>
                    <label data-cloud-ocr ${settings.ocrProvider === 'cloud-vision' ? '' : 'hidden'}>Cloud Vision API key<input name="ocrCloudVisionApiKey" type="password" value="${escapeHtml(settings.ocrCloudVisionApiKey)}" autocomplete="off"></label>
                    <input type="hidden" name="ocrLanguage" value="${escapeHtml(settings.ocrLanguage)}">
                    <input type="hidden" name="ocrPrefetchMargin" value="${settings.ocrPrefetchMargin}">
                </div>
                <div class="jpdb-reader-help">Images are read quietly near the viewport. Google Lens handles normal images by default; embedded OCR metadata is instant. Recognized areas stay transparent until you tap or hover.</div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>Video</legend>
                <div class="grid">
                    ${checkbox('subtitlePlayerEnabled', 'Enable video subtitle player', settings.subtitlePlayerEnabled)}
                    ${checkbox('subtitleAutoDetect', 'Auto-detect page subtitles', settings.subtitleAutoDetect)}
                    ${checkbox('subtitleOverlayVisible', 'Show subtitle overlay', settings.subtitleOverlayVisible)}
                    ${checkbox('subtitleSecondaryVisible', 'Show native subtitles when available', settings.subtitleSecondaryVisible)}
                    ${checkbox('subtitleTranscriptVisible', 'Open transcript panel by default', settings.subtitleTranscriptVisible)}
                    ${select('subtitleTranscriptPlacement', 'Transcript panel position', settings.subtitleTranscriptPlacement, [['right', 'Right of video'], ['left', 'Left of video'], ['bottom', 'Below video']])}
                    ${checkbox('subtitleTranscriptAutoScroll', 'Scroll transcript with playback', settings.subtitleTranscriptAutoScroll)}
                    ${checkbox('subtitleMiningPause', 'Pause video when mining subtitle', settings.subtitleMiningPause)}
                    ${select('subtitleControlsMode', 'Subtitle controls', settings.subtitleControlsMode, [['auto', 'Compact controls'], ['hidden', 'Hide controls'], ['always', 'Always visible']])}
                    ${input('subtitleFontSize', 'Subtitle font size', String(settings.subtitleFontSize), 'number')}
                    ${input('subtitleBottomOffset', 'Subtitle bottom offset (%)', String(settings.subtitleBottomOffset), 'number')}
                    ${input('subtitleTextColor', 'Subtitle color', settings.subtitleTextColor, 'color')}
                    ${input('subtitleOutlineColor', 'Subtitle outline', settings.subtitleOutlineColor, 'color')}
                    ${input('subtitleBackgroundColor', 'Subtitle background', settings.subtitleBackgroundColor, 'color')}
                    ${input('subtitleBackgroundOpacity', 'Subtitle background opacity', String(settings.subtitleBackgroundOpacity), 'number')}
                    ${input('subtitleFontFamily', 'Subtitle font family', settings.subtitleFontFamily)}
                    ${input('subtitleFontWeight', 'Subtitle font weight', String(settings.subtitleFontWeight), 'number')}
                    ${input('subtitleSeekPadding', 'Subtitle seek padding (seconds)', String(settings.subtitleSeekPadding), 'number')}
                    ${checkbox('mpvSubtitleMiningEnabled', 'Enable MPV subtitle bridge', settings.mpvSubtitleMiningEnabled)}
                    ${checkbox('mpvSubtitleAutoConnect', 'Connect to MPV automatically', settings.mpvSubtitleAutoConnect)}
                    ${input('mpvSubtitleHost', 'MPV bridge host', settings.mpvSubtitleHost)}
                    ${input('mpvSubtitlePorts', 'MPV bridge ports', settings.mpvSubtitlePorts)}
                </div>
                <div class="jpdb-reader-subtitle-preview" data-subtitle-preview>
                    <div class="jpdb-subtitle-primary">
                        <span class="jpdb-reader-word jpdb-new">新しい</span>
                        <span class="jpdb-reader-word jpdb-learning">言葉</span>
                        <span class="jpdb-reader-word jpdb-known">を</span>
                        <span class="jpdb-reader-word jpdb-due">読む</span>
                    </div>
                    <div class="jpdb-subtitle-secondary">Live subtitle preview</div>
                </div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>YouTube</legend>
                <div class="grid">
                    ${checkbox('youtubeImmersionEnabled', 'Only show Japanese-looking YouTube videos', settings.youtubeImmersionEnabled)}
                    ${checkbox('youtubeShowFilterNotice', 'Show reveal control for hidden videos', settings.youtubeShowFilterNotice)}
                </div>
                <div class="jpdb-reader-help">Off by default. Turn it on when you want YouTube recommendations, search, and sidebars to stay focused on Japanese-looking video cards.</div>
            </fieldset>
            <fieldset data-settings-panel="mining" hidden>
                <legend>Anki</legend>
                <div class="grid">
                    ${checkbox('ankiEnabled', 'Enable Anki mining', settings.ankiEnabled)}
                    ${checkbox('ankiMineWithJpdb', 'Also add to Anki when adding to JPDB', settings.ankiMineWithJpdb)}
                    ${checkbox('ankiCaptureScreenshot', 'Attach context image when possible', settings.ankiCaptureScreenshot)}
                    ${checkbox('ankiMobileHandoff', 'Use mobile Anki handoff when AnkiConnect is unavailable', settings.ankiMobileHandoff)}
                    ${input('ankiConnectUrl', 'AnkiConnect URL', settings.ankiConnectUrl)}
                    ${input('ankiDeck', 'Anki deck', settings.ankiDeck)}
                    ${input('ankiModel', 'Anki note type', settings.ankiModel)}
                    ${select('ankiTemplateMode', 'Anki card template', settings.ankiTemplateMode, [['recognition', 'Word first'], ['context', 'Sentence first']])}
                    ${input('ankiTags', 'Tags', settings.ankiTags)}
                </div>
                <div class="jpdb-reader-settings-actions">
                    <button class="jpdb-reader-btn" type="button" data-action="test-anki">Test Anki</button>
                </div>
                <div class="jpdb-reader-help jpdb-reader-status-line" data-anki-status role="status" aria-live="polite">Anki uses AnkiConnect on this device. The default creates a small Yomu note type automatically.</div>
                <div data-anki-template-preview>
                    ${renderAnkiTemplatePreview(settings)}
                </div>
            </fieldset>
            <fieldset data-settings-panel="mining" hidden>
                <legend>Study tools</legend>
                <div class="jpdb-reader-help">Sentence translation and grammar hints now appear automatically as collapsed popup sources. Reorder or toggle them from Dictionaries.</div>
            </fieldset>
            <fieldset data-settings-panel="dictionaries" hidden>
                <legend>Dictionaries</legend>
                <div class="grid">
                    ${checkbox('jpdbDefinitionsEnabled', 'Show JPDB definitions', settings.jpdbDefinitionsEnabled)}
                    ${checkbox('localDictionariesEnabled', 'Show imported dictionary definitions', settings.localDictionariesEnabled)}
                    ${checkbox('dictionarySourcesInitiallyExpanded', 'Open dictionary sources by default', settings.dictionarySourcesInitiallyExpanded)}
                    ${input('localDictionaryMaxResults', 'Dictionary result limit', String(settings.localDictionaryMaxResults), 'number')}
                </div>
                <div class="jpdb-reader-dictionary-status" data-dictionary-status>Checking imported dictionaries...</div>
                <div class="jpdb-reader-dictionary-priorities" data-source-editor>
                    ${renderDictionarySourceRows(settings)}
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Lookup pills</div>
                    <div class="jpdb-reader-help">These small buttons open the current word in an external dictionary. Use {query} for normal search URLs; it fills in the current word. {word} and {reading} are available for sites that need them separately.</div>
                    <div class="jpdb-reader-lookup-links">
                        ${renderDictionaryLookupLinkEditor(settings.dictionaryLookupLinks)}
                    </div>
                </div>
                <div class="jpdb-reader-recommended-dictionaries" data-recommended-dictionaries>
                    ${renderRecommendedDictionaries([])}
                </div>
                <div class="jpdb-reader-settings-actions">
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-settings">Import settings JSON</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-reader-settings">Export settings JSON</button>
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-dictionary">Import dictionaries</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-yomitan-dictionary">Export dictionaries</button>
                </div>
                <input hidden type="file" data-file="settings" accept="application/json,.json">
                <input hidden type="file" data-file="dictionary" accept="application/json,.json,.zip,application/zip">
                <div class="jpdb-reader-help" data-import-status>Import Yomitan settings exports, Yomitan dictionary ZIPs, or exported dictionary backups.</div>
            </fieldset>
            <fieldset data-settings-panel="shortcuts" hidden>
                <legend>Shortcuts</legend>
                <div class="grid">
                    ${shortcutInput('shortcuts.hoverLookup', 'Hold while hovering', settings.shortcuts.hoverLookup, 'Blank means hover without a key')}
                    ${input('hoverOpenDelayMs', 'Hover open delay (ms)', String(settings.hoverOpenDelayMs), 'number')}
                    ${input('hoverCloseDelayMs', 'Hover close delay (ms)', String(settings.hoverCloseDelayMs), 'number')}
                    ${shortcutInput('shortcuts.scanPage', 'Scan page', settings.shortcuts.scanPage)}
                    ${shortcutInput('shortcuts.openSettings', 'Open settings', settings.shortcuts.openSettings)}
                    ${shortcutInput('shortcuts.playAudio', 'Play audio', settings.shortcuts.playAudio)}
                    ${shortcutInput('shortcuts.closePopup', 'Close popup', settings.shortcuts.closePopup)}
                    ${shortcutInput('shortcuts.previousSubtitle', 'Previous subtitle', settings.shortcuts.previousSubtitle)}
                    ${shortcutInput('shortcuts.nextSubtitle', 'Next subtitle', settings.shortcuts.nextSubtitle)}
                    ${shortcutInput('shortcuts.copySubtitle', 'Copy subtitle', settings.shortcuts.copySubtitle)}
                    ${shortcutInput('shortcuts.toggleOcr', 'Toggle image reading', settings.shortcuts.toggleOcr)}
                    ${shortcutInput('shortcuts.toggleYoutubeImmersion', 'Toggle YouTube filter', settings.shortcuts.toggleYoutubeImmersion)}
                    ${shortcutInput('shortcuts.scanImages', 'Read images now', settings.shortcuts.scanImages)}
                    ${renderReviewShortcutInputs(settings)}
                </div>
            </fieldset>
            <fieldset data-settings-panel="help" hidden>
                <legend>Support</legend>
                ${renderSupportPanel()}
            </fieldset>
            </div>
            <div class="footer">
                <button class="jpdb-reader-btn" type="button" data-action="cancel">Cancel</button>
                <button class="jpdb-reader-btn add" type="submit">Save</button>
            </div>
        `;
}

export function input(name: string, label: string, value: string, type = 'text', attributes: Record<string, string | number> = {}): string {
    const attributeHtml = Object.entries(attributes)
        .map(([key, attributeValue]) => ` ${key}="${escapeHtml(String(attributeValue))}"`)
        .join('');
    return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" autocomplete="off"${attributeHtml}></label>`;
}

export function shortcutInput(name: string, label: string, value: string, placeholder = 'Press keys'): string {
    return `<label>${label}<input data-shortcut-input name="${name}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" inputmode="none" aria-label="${escapeHtml(label)}"></label>`;
}

export function checkbox(name: string, label: string, checked: boolean): string {
    return `<label class="inline"><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}>${label}</label>`;
}

export function select(name: string, label: string, value: string, options: [string, string][]): string {
    return `<label>${label}<select name="${name}">${options.map(([optionValue, text]) =>
        `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(text)}</option>`,
    ).join('')}</select></label>`;
}

export function getFormInterfaceLanguage(form: HTMLFormElement, fallback: InterfaceLanguage): InterfaceLanguage {
    const value = getNamedControl<HTMLSelectElement>(form, 'interfaceLanguage')?.value;
    return value === 'auto' || value === 'en' || value === 'ja' ? value : fallback;
}

export function localizeSettingsForm(form: HTMLFormElement, language: InterfaceLanguage): void {
    log.debug('Localizing settings form', { language });
    const text = (key: Parameters<typeof uiText>[1]) => uiText(language, key);
    form.setAttribute('aria-label', text('settingsTitle'));
    form.querySelector('h2')?.replaceChildren(text('settingsTitle'));

    const tabLabels: Record<string, Parameters<typeof uiText>[1]> = {
        basics: 'basics',
        dictionaries: 'dictionaries',
        media: 'media',
        mining: 'mining',
        shortcuts: 'shortcuts',
        help: 'help',
    };
    Object.entries(tabLabels).forEach(([panel, key]) => {
        form.querySelector<HTMLButtonElement>(`[data-action="settings-panel"][data-panel="${panel}"]`)?.replaceChildren(text(key));
    });

    [
        'JPDB',
        text('interface'),
        text('audio'),
        text('immersionKit'),
        text('reader'),
        text('kanji'),
        text('images'),
        text('video'),
        text('youtube'),
        text('anki'),
        text('studyTools'),
        text('dictionaries'),
        text('shortcuts'),
        text('support'),
    ].forEach((label, index) => {
        const legend = form.querySelectorAll('fieldset > legend')[index];
        legend?.replaceChildren(label);
    });

    const labelKeys: Array<[string, Parameters<typeof uiText>[1]]> = [
        ['apiKey', 'apiKey'],
        ['newTabJpdbDeck', 'newTabJpdbDeck'],
        ['jpdbMiningEnabled', 'jpdbMiningEnabled'],
        ['addToForq', 'addToForq'],
        ['enableReviews', 'enableReviews'],
        ['twoButtonReviews', 'reviewRatingScale'],
        ['interfaceLanguage', 'settingsLanguage'],
        ['theme', 'theme'],
        ['popupMode', 'popupMode'],
        ['enableLogging', 'enableLogging'],
        ['accentColor', 'accentColor'],
        ['newTabEnabled', 'newTabEnabled'],
        ['newTabSource', 'newTabSource'],
        ['newTabUrl', 'newTabUrl'],
        ['wordColorNew', 'wordColorNew'],
        ['wordColorLearning', 'wordColorLearning'],
        ['wordColorKnown', 'wordColorKnown'],
        ['wordColorDue', 'wordColorDue'],
        ['wordColorFailed', 'wordColorFailed'],
        ['wordColorIgnored', 'wordColorIgnored'],
        ['parseSelection', 'parseSelection'],
        ['lookupOnClick', 'lookupOnClick'],
        ['lookupOnHover', 'lookupOnHover'],
        ['lookupOnMiddleMouse', 'lookupOnMiddleMouse'],
        ['autoScanJapanese', 'autoScanJapanese'],
        ['scanVisiblePage', 'scanVisiblePage'],
        ['showFloatingButton', 'showFloatingButton'],
        ['furiganaMode', 'furiganaMode'],
        ['showPitchAccent', 'showPitchAccent'],
        ['wordHighlightMode', 'wordHighlightMode'],
        ['kanjivgEnabled', 'kanjivgEnabled'],
        ['kanjiOriginsEnabled', 'kanjiOriginsEnabled'],
        ['kanjiOriginKanjiMapEnabled', 'kanjiOriginKanjiMapEnabled'],
        ['kanjiOriginWiktionaryEnabled', 'kanjiOriginWiktionaryEnabled'],
        ['kanjiOriginGraphEnabled', 'kanjiOriginGraphEnabled'],
        ['kanjiOriginRadicalImagesEnabled', 'kanjiOriginRadicalImagesEnabled'],
        ['rtkEnabled', 'rtkEnabled'],
        ['similarKanjiWords', 'similarKanjiWords'],
        ['similarKanjiWordLimit', 'similarKanjiWordLimit'],
        ['audioEnabled', 'audioEnabled'],
        ['autoPlayAudio', 'autoPlayAudio'],
        ['audioEnableDefaultSources', 'audioEnableDefaultSources'],
        ['audioFallbackChimeEnabled', 'audioFallbackChimeEnabled'],
        ['audioSelectionMode', 'audioSelectionMode'],
        ['audioViaBlob', 'audioViaBlob'],
        ['audioTimeoutMs', 'audioTimeoutMs'],
        ['immersionKitEnabled', 'immersionKitEnabled'],
        ['immersionKitShowTranslation', 'immersionKitShowTranslation'],
        ['immersionKitShowImages', 'immersionKitShowImages'],
        ['immersionKitAutoPlayAudio', 'immersionKitAutoPlayAudio'],
        ['jpdbImmersionKitAutoPlayReviewAudio', 'jpdbImmersionKitAutoPlayReviewAudio'],
        ['immersionKitCategory', 'immersionKitCategory'],
        ['immersionKitSort', 'immersionKitSort'],
        ['immersionKitLimit', 'immersionKitLimit'],
        ['immersionKitMinLength', 'immersionKitMinLength'],
        ['immersionKitMaxLength', 'immersionKitMaxLength'],
        ['immersionKitPlaybackRate', 'immersionKitPlaybackRate'],
        ['immersionKitExactMatch', 'immersionKitExactMatch'],
        ['ocrEnabled', 'ocrEnabled'],
        ['ocrAutoScanImages', 'ocrAutoScanImages'],
        ['ocrShowTextOverlay', 'ocrShowTextOverlay'],
        ['ocrProvider', 'ocrProvider'],
        ['ocrMaxImagesPerPage', 'ocrMaxImagesPerPage'],
        ['ocrMinImageArea', 'ocrMinImageArea'],
        ['ocrMaxImagePixels', 'ocrMaxImagePixels'],
        ['ocrTextColor', 'ocrTextColor'],
        ['ocrOutlineColor', 'ocrOutlineColor'],
        ['ocrBackgroundColor', 'ocrBackgroundColor'],
        ['ocrBackgroundOpacity', 'ocrBackgroundOpacity'],
        ['ocrFontScale', 'ocrFontScale'],
        ['ocrEndpointUrl', 'ocrEndpointUrl'],
        ['ocrEngine', 'ocrEngine'],
        ['ocrCloudVisionApiKey', 'cloudVisionApiKey'],
        ['subtitlePlayerEnabled', 'subtitlePlayerEnabled'],
        ['subtitleAutoDetect', 'subtitleAutoDetect'],
        ['subtitleOverlayVisible', 'subtitleOverlayVisible'],
        ['subtitleSecondaryVisible', 'subtitleSecondaryVisible'],
        ['subtitleTranscriptVisible', 'subtitleTranscriptVisible'],
        ['subtitleTranscriptPlacement', 'subtitleTranscriptPlacement'],
        ['subtitleTranscriptAutoScroll', 'subtitleTranscriptAutoScroll'],
        ['subtitleMiningPause', 'subtitleMiningPause'],
        ['subtitleControlsMode', 'subtitleControlsMode'],
        ['subtitleFontSize', 'subtitleFontSize'],
        ['subtitleBottomOffset', 'subtitleBottomOffset'],
        ['subtitleTextColor', 'subtitleTextColor'],
        ['subtitleOutlineColor', 'subtitleOutlineColor'],
        ['subtitleBackgroundColor', 'subtitleBackgroundColor'],
        ['subtitleBackgroundOpacity', 'subtitleBackgroundOpacity'],
        ['subtitleFontFamily', 'subtitleFontFamily'],
        ['subtitleFontWeight', 'subtitleFontWeight'],
        ['subtitleSeekPadding', 'subtitleSeekPadding'],
        ['mpvSubtitleMiningEnabled', 'mpvSubtitleMiningEnabled'],
        ['mpvSubtitleAutoConnect', 'mpvSubtitleAutoConnect'],
        ['mpvSubtitleHost', 'mpvSubtitleHost'],
        ['mpvSubtitlePorts', 'mpvSubtitlePorts'],
        ['youtubeImmersionEnabled', 'youtubeImmersionEnabled'],
        ['youtubeShowFilterNotice', 'youtubeShowFilterNotice'],
        ['ankiEnabled', 'ankiEnabled'],
        ['ankiMineWithJpdb', 'ankiMineWithJpdb'],
        ['ankiCaptureScreenshot', 'ankiCaptureScreenshot'],
        ['ankiMobileHandoff', 'mobileAnkiHandoff'],
        ['ankiConnectUrl', 'ankiConnectUrl'],
        ['ankiDeck', 'ankiDeck'],
        ['ankiModel', 'ankiModel'],
        ['ankiTemplateMode', 'ankiTemplateMode'],
        ['ankiTags', 'ankiTags'],
        ['studyTranslationEnabled', 'studyTranslationEnabled'],
        ['studyGrammarEnabled', 'studyGrammarEnabled'],
        ['jpdbDefinitionsEnabled', 'jpdbDefinitionsEnabled'],
        ['localDictionariesEnabled', 'localDictionariesEnabled'],
        ['localDictionaryShowKanji', 'localDictionaryShowKanji'],
        ['dictionarySourcesInitiallyExpanded', 'dictionarySourcesInitiallyExpanded'],
        ['localDictionaryMaxResults', 'localDictionaryMaxResults'],
        ['shortcuts.hoverLookup', 'holdWhileHovering'],
        ['hoverOpenDelayMs', 'hoverOpenDelayMs'],
        ['hoverCloseDelayMs', 'hoverCloseDelayMs'],
        ['shortcuts.scanPage', 'scanPage'],
        ['shortcuts.openSettings', 'openSettings'],
        ['shortcuts.playAudio', 'playAudio'],
        ['shortcuts.closePopup', 'closePopup'],
        ['shortcuts.previousSubtitle', 'previousSubtitle'],
        ['shortcuts.nextSubtitle', 'nextSubtitle'],
        ['shortcuts.copySubtitle', 'copySubtitle'],
        ['shortcuts.toggleOcr', 'toggleImageReading'],
        ['shortcuts.toggleYoutubeImmersion', 'toggleYoutubeImmersion'],
        ['shortcuts.scanImages', 'readImagesNow'],
        ['shortcuts.gradeNothing', 'gradeNothing'],
        ['shortcuts.gradeSomething', 'gradeSomething'],
        ['shortcuts.gradeHard', 'gradeHard'],
        ['shortcuts.gradeOkay', 'gradeOkay'],
        ['shortcuts.gradeEasy', 'gradeEasy'],
        ['shortcuts.gradeFail', 'gradeFail'],
        ['shortcuts.gradePass', 'gradePass'],
    ];
    labelKeys.forEach(([name, key]) => setControlLabel(form, name, text(key)));
    const wordColorsTitle = Array.from(form.querySelectorAll<HTMLElement>('.jpdb-reader-local-title'))
        .find(element => /Word colors|単語の色/.test(element.textContent ?? ''));
    wordColorsTitle?.replaceChildren(text('wordColors'));
    form.querySelector<HTMLElement>('[data-subtitle-preview] .jpdb-subtitle-secondary')?.replaceChildren(text('subtitlePreview'));

    const jpdbSettings = form.querySelector<HTMLAnchorElement>('label a[href*="jpdb.io/settings"]');
    if (jpdbSettings) jpdbSettings.textContent = text('jpdbSettings');

    setSelectOptionLabels(form, 'interfaceLanguage', [
        ['auto', text('automatic')],
        ['en', text('english')],
        ['ja', text('japanese')],
    ]);
    setSelectOptionLabels(form, 'theme', [
        ['auto', text('auto')],
        ['dark', text('dark')],
        ['light', text('light')],
    ]);
    setSelectOptionLabels(form, 'popupMode', [
        ['auto', text('auto')],
        ['sheet', text('bottomSheet')],
        ['popover', text('popover')],
    ]);
    setSelectOptionLabels(form, 'wordHighlightMode', [
        ['auto', text('automatic')],
        ['status', text('highlightKnownStatus')],
        ['pitch', text('highlightPitchAccent')],
        ['off', text('off')],
    ]);
    setSelectOptionLabels(form, 'furiganaMode', [
        ['auto', text('automatic')],
        ['difficult-kanji', text('furiganaDifficultKanji')],
        ['known-status', text('furiganaHideKnown')],
        ['all', text('furiganaAllParsed')],
        ['off', text('off')],
    ]);
    setSelectOptionLabels(form, 'newTabSource', [
        ['auto', text('newTabAuto')],
        ['jpdb', 'JPDB'],
        ['anki', 'Anki'],
        ['dictionary', 'Dictionary'],
    ]);
    setSelectOptionLabels(form, 'twoButtonReviews', [
        ['false', text('fivePoint')],
        ['true', text('twoPoint')],
    ]);
    setSelectOptionLabels(form, 'audioSelectionMode', [
        ['first', text('firstAudio')],
        ['random', text('randomAudio')],
    ]);
    setSelectOptionLabels(form, 'immersionKitCategory', [
        ['all', text('allCategories')],
        ['anime', text('anime')],
        ['drama', text('drama')],
        ['games', text('games')],
    ]);
    setSelectOptionLabels(form, 'immersionKitSort', [
        ['sentence_length:asc', text('shortestFirst')],
        ['sentence_length:desc', text('longestFirst')],
        ['random', text('randomOrder')],
    ]);
    setSelectOptionLabels(form, 'ocrProvider', [
        ['google-lens', text('googleLens')],
        ['local-service', text('localOcr')],
        ['cloud-vision', text('cloudVision')],
        ['off', text('off')],
    ]);
    setSelectOptionLabels(form, 'ocrMaxImagesPerPage', [
        ['3', text('lightWork')],
        ['8', text('normal')],
        ['16', text('more')],
    ]);
    setSelectOptionLabels(form, 'ocrMinImageArea', [
        ['80000', text('largeOnly')],
        ['45000', text('normal')],
        ['15000', text('includeSmall')],
    ]);
    setSelectOptionLabels(form, 'ocrMaxImagePixels', [
        ['640000', text('faster')],
        ['1200000', text('balanced')],
        ['2000000', text('sharper')],
    ]);
    setSelectOptionLabels(form, 'ocrEngine', [
        ['auto', text('automatic')],
        ['MangaOCR', 'MangaOCR'],
        ['PaddleOCR', 'PaddleOCR'],
        ['AppleVision', 'Apple Vision'],
    ]);
    setSelectOptionLabels(form, 'subtitleControlsMode', [
        ['auto', text('showWhenNeeded')],
        ['hidden', text('hideControls')],
        ['always', text('alwaysVisible')],
    ]);
    setSelectOptionLabels(form, 'subtitleTranscriptPlacement', [
        ['right', text('right')],
        ['left', text('left')],
        ['bottom', text('bottom')],
    ]);
    setSelectOptionLabels(form, 'ankiTemplateMode', [
        ['recognition', text('wordFirst')],
        ['context', text('sentenceFirst')],
    ]);

    setShortcutPlaceholder(form, 'shortcuts.hoverLookup', text('blankPlainHover'));
    form.querySelectorAll<HTMLInputElement>('[data-shortcut-input]').forEach(inputEl => {
        if (inputEl.name !== 'shortcuts.hoverLookup') inputEl.placeholder = text('pressKeys');
    });

    setFieldsetHelp(form, 1, text('interfaceHelp'));
    setFieldsetHelp(form, 3, text('immersionKitHelp'));
    setFieldsetHelp(form, 4, text('readerHelp'));
    setFieldsetHelp(form, 5, text('kanjiHelp'));
    setFieldsetHelp(form, 6, text('ocrHelp'));
    setFieldsetHelp(form, 8, text('youtubeHelp'));
    setFieldsetHelp(form, 9, text('ankiHelp'));
    const audioHelp = getFieldsetHelp(form, 2);
    if (audioHelp) {
        setInnerHtml(audioHelp, `${escapeHtml(text('audioHelp').replace('Yomitan audio guide.', '').replace('Yomitan音声ガイドも参照できます。', ''))}<a href="${AUDIO_GUIDE_URL}" target="_blank" rel="noopener">Yomitan audio guide</a>.`);
    }
    const importStatus = form.querySelector<HTMLElement>('[data-import-status]');
    if (importStatus && /Import Yomitan|Yomitan設定/.test(importStatus.textContent ?? '')) importStatus.textContent = text('dictionaryImportHelp');

    const localOcrLabel = getNamedControl<HTMLInputElement>(form, 'ocrEndpointUrl')?.closest('label');
    if (localOcrLabel) setBlockLabelText(localOcrLabel, text('ocrEndpointUrl'));
    const cloudOcrLabel = getNamedControl<HTMLInputElement>(form, 'ocrCloudVisionApiKey')?.closest('label');
    if (cloudOcrLabel) setBlockLabelText(cloudOcrLabel, text('cloudVisionApiKey'));

    form.querySelector<HTMLButtonElement>('[data-action="test-anki"]')?.replaceChildren(text('testAnki'));
    form.querySelector<HTMLButtonElement>('[data-action="copy-newtab-url"]')?.replaceChildren(text('copyAddress'));
    form.querySelector<HTMLAnchorElement>('[data-newtab-url-link]')?.replaceChildren(text('openNewTabPage'));
    form.querySelector<HTMLButtonElement>('[data-action="import-yomitan-settings"]')?.replaceChildren(text('importSettings'));
    form.querySelector<HTMLButtonElement>('[data-action="export-reader-settings"]')?.replaceChildren(text('exportSettings'));
    form.querySelector<HTMLButtonElement>('[data-action="import-yomitan-dictionary"]')?.replaceChildren(text('importDictionaries'));
    form.querySelector<HTMLButtonElement>('[data-action="export-yomitan-dictionary"]')?.replaceChildren(text('exportDictionaries'));
    form.querySelector<HTMLButtonElement>('[data-action="audio-source-add"]')?.replaceChildren(text('addAudioSource'));
    form.querySelector<HTMLButtonElement>('[data-action="download-starter-dictionaries"]')?.replaceChildren(text('downloadMissingRecommended'));
    form.querySelector<HTMLButtonElement>('[data-action="refresh-dictionaries"]')?.replaceChildren(text('refreshInstalledList'));
    form.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.replaceChildren(text('cancel'));
    form.querySelector<HTMLButtonElement>('button[type="submit"]')?.replaceChildren(text('save'));

    const audioHead = form.querySelectorAll('.jpdb-reader-audio-source-head span');
    audioHead[1]?.replaceChildren(text('audioSource'));
    audioHead[2]?.replaceChildren(text('urlVoice'));
    const dictionaryTitle = form.querySelector('.jpdb-reader-recommended-title');
    dictionaryTitle?.replaceChildren(text('recommendedDownloads'));
    const newTabTitle = Array.from(form.querySelectorAll<HTMLElement>('.jpdb-reader-local-title'))
        .find(element => /New tab|新規タブ/.test(element.textContent ?? ''));
    newTabTitle?.replaceChildren(text('newTab'));
    form.querySelectorAll<HTMLAnchorElement>('.jpdb-reader-recommended-name a').forEach(link => { link.textContent = text('homepage'); });
    form.querySelectorAll<HTMLButtonElement>('[data-action="download-recommended-dictionary"]').forEach(button => {
        button.textContent = button.dataset.installed === 'true' ? text('update') : text('download');
    });
    const dictionaryStatus = form.querySelector<HTMLElement>('[data-dictionary-status]');
    if (dictionaryStatus && /Checking imported|インポート済み辞書を確認/.test(dictionaryStatus.textContent ?? '')) {
        dictionaryStatus.textContent = text('checkingDictionaries');
    }

    localizeSupportPanel(form, language);
}

function getNamedControl<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(form: HTMLFormElement, name: string): T | null {
    return Array.from(form.elements).find((element): element is T =>
        (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)
        && element.name === name,
    ) ?? null;
}

function setControlLabel(form: HTMLFormElement, name: string, label: string): void {
    const control = getNamedControl(form, name);
    const labelElement = control?.closest('label');
    if (!labelElement) return;
    if (labelElement.classList.contains('inline')) setInlineLabelText(labelElement, label);
    else setBlockLabelText(labelElement, label);
}

function setBlockLabelText(label: Element, text: string): void {
    const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as Text | undefined;
    if (textNode) textNode.textContent = text;
    else label.insertBefore(document.createTextNode(text), label.firstChild);
}

function setInlineLabelText(label: Element, text: string): void {
    const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) as Text | undefined;
    if (textNode) textNode.textContent = text;
    else label.append(document.createTextNode(text));
}

function setSelectOptionLabels(form: HTMLFormElement, name: string, options: Array<[string, string]>): void {
    const selectElement = getNamedControl<HTMLSelectElement>(form, name);
    if (!selectElement) return;
    options.forEach(([value, label]) => {
        const option = Array.from(selectElement.options).find(item => item.value === value);
        if (option) option.textContent = label;
    });
}

function setShortcutPlaceholder(form: HTMLFormElement, name: string, placeholder: string): void {
    const inputElement = getNamedControl<HTMLInputElement>(form, name);
    if (inputElement) inputElement.placeholder = placeholder;
}

function getFieldsetHelp(form: HTMLFormElement, index: number): HTMLElement | null {
    const fieldset = form.querySelectorAll('fieldset')[index];
    return Array.from(fieldset?.children ?? []).find((child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains('jpdb-reader-help'),
    ) ?? null;
}

function setFieldsetHelp(form: HTMLFormElement, index: number, text: string): void {
    const help = getFieldsetHelp(form, index);
    if (help) help.textContent = text;
}

function localizeSupportPanel(form: HTMLFormElement, language: InterfaceLanguage): void {
    const support = form.querySelector<HTMLElement>('.jpdb-reader-support-card');
    if (!support) return;
    const text = (key: Parameters<typeof uiText>[1]) => uiText(language, key);
    support.querySelector('.jpdb-reader-support-title')?.replaceChildren(text('supportTitle'));
    const paragraphs = support.querySelectorAll('p');
    paragraphs[0]?.replaceChildren(text('supportCopy'));
    paragraphs[1]?.replaceChildren(text('supportDonation'));
    support.querySelector<HTMLElement>('[data-support-link="docs"]')?.replaceChildren(text('documentation'));
    support.querySelector<HTMLElement>('[data-support-link="paypal"]')?.replaceChildren(text('donate'));
    support.querySelector<HTMLElement>('[data-support-link="issues"]')?.replaceChildren(text('reportIssue'));
    support.querySelector<HTMLElement>('[data-support-link="github"]')?.replaceChildren(text('github'));
    support.querySelector<HTMLElement>('[data-support-link="discord"]')?.replaceChildren(text('copyDiscord'));
}

export function renderReviewShortcutInputs(settings: ReaderSettings): string {
    const fivePointHidden = !settings.enableReviews || settings.twoButtonReviews;
    const passFailHidden = !settings.enableReviews || !settings.twoButtonReviews;
    return `
        <div class="jpdb-reader-shortcut-group" data-review-scale="five" ${fivePointHidden ? 'hidden' : ''}>
            ${shortcutInput('shortcuts.gradeNothing', 'Grade NOTHING', settings.shortcuts.gradeNothing)}
            ${shortcutInput('shortcuts.gradeSomething', 'Grade SOMETHING', settings.shortcuts.gradeSomething)}
            ${shortcutInput('shortcuts.gradeHard', 'Grade HARD', settings.shortcuts.gradeHard)}
            ${shortcutInput('shortcuts.gradeOkay', 'Grade OKAY', settings.shortcuts.gradeOkay)}
            ${shortcutInput('shortcuts.gradeEasy', 'Grade EASY', settings.shortcuts.gradeEasy)}
        </div>
        <div class="jpdb-reader-shortcut-group" data-review-scale="pass-fail" ${passFailHidden ? 'hidden' : ''}>
            ${shortcutInput('shortcuts.gradeFail', 'Pass/fail: FAIL', settings.shortcuts.gradeFail)}
            ${shortcutInput('shortcuts.gradePass', 'Pass/fail: PASS', settings.shortcuts.gradePass)}
        </div>
    `;
}

export function activateSettingsPanel(form: HTMLFormElement, panel: string): void {
    log.debug('Activating settings panel', { panel });
    form.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach(section => {
        section.hidden = section.dataset.settingsPanel !== panel;
    });
    form.querySelectorAll<HTMLButtonElement>('[data-action="settings-panel"]').forEach(button => {
        const active = button.dataset.panel === panel;
        button.setAttribute('aria-selected', String(active));
    });
}

export function renderAudioSourceEditor(sources: AudioSourceSetting[]): string {
    return `
        <div class="jpdb-reader-audio-source-head">
            <span>#</span>
            <span>Audio source</span>
            <span>URL / voice</span>
            <span></span>
        </div>
        ${renderAudioSourceRows(audioSourceRowsForSettings(sources))}
        <button class="jpdb-reader-btn" type="button" data-action="audio-source-add">Add audio source</button>
    `;
}

function miniIcon(name: 'up' | 'down' | 'remove'): string {
    const paths = {
        up: '<path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path>',
        down: '<path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path>',
        remove: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    } satisfies Record<typeof name, string>;
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}

function renderAudioSourceRows(rows: AudioSourceSetting[]): string {
    const count = rows.length;

    return `
        <input type="hidden" name="audioSourceCount" value="${count}">
        ${rows.map((source, index) => `
            <div class="jpdb-reader-audio-source-row" data-audio-source-row data-index="${index}">
                <label class="inline jpdb-reader-audio-index">
                    <input name="audioSources.${index}.enabled" type="checkbox" ${source.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                <select name="audioSources.${index}.type" aria-label="Audio source ${index + 1}">
                    ${AUDIO_SOURCE_OPTIONS.map(([optionValue, text]) =>
                        `<option value="${escapeHtml(optionValue)}" ${optionValue === source.type ? 'selected' : ''}>${escapeHtml(text)}</option>`,
                    ).join('')}
                </select>
                <div class="jpdb-reader-audio-source-fields">
                    <input data-audio-url-field name="audioSources.${index}.url" type="text" value="${escapeHtml(source.url)}" placeholder="${audioUrlPlaceholder(source.type)}" ${audioSourceUsesUrl(source.type) ? '' : 'hidden'}>
                    <input data-audio-voice-field name="audioSources.${index}.voice" type="text" value="${escapeHtml(source.voice)}" placeholder="${audioVoicePlaceholder(source.type)}" ${audioSourceUsesVoice(source.type) ? '' : 'hidden'}>
                </div>
                <div class="jpdb-reader-row-tools" aria-label="Audio source order">
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-up" title="Move up" aria-label="Move up">${miniIcon('up')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-down" title="Move down" aria-label="Move down">${miniIcon('down')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-remove" title="Remove" aria-label="Remove">${miniIcon('remove')}</button>
                </div>
            </div>
        `).join('')}
    `;
}

export function audioSourceRowsForSettings(sources: AudioSourceSetting[]): AudioSourceSetting[] {
    const rows = sources.map(source => ({ ...source }));
    return rows.length ? rows : DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
}

function audioUrlPlaceholder(type: AudioSourceSetting['type']): string {
    if (type === 'custom' || type === 'custom-json') return 'URL for this custom source';
    return 'Built-in source, no URL needed';
}

function audioVoicePlaceholder(type: AudioSourceSetting['type']): string {
    if (type === 'text-to-speech' || type === 'text-to-speech-reading') return 'Voice name';
    return 'No voice needed';
}

function audioSourceUsesUrl(type: string): boolean {
    return type === 'custom' || type === 'custom-json';
}

function audioSourceUsesVoice(type: string): boolean {
    return type === 'text-to-speech' || type === 'text-to-speech-reading';
}

export function syncAudioSourceRow(row: Element | null, type: string): void {
    if (!row) return;
    row.querySelectorAll<HTMLElement>('[data-audio-url-field]').forEach(node => { node.hidden = !audioSourceUsesUrl(type); });
    row.querySelectorAll<HTMLElement>('[data-audio-voice-field]').forEach(node => { node.hidden = !audioSourceUsesVoice(type); });
}

export function updateAudioSourceEditor(form: HTMLFormElement, action: string, control?: HTMLElement | null): void {
    const container = form.querySelector<HTMLElement>('.jpdb-reader-audio-sources');
    if (!container) return;
    const sources = audioSourceRowsForSettings(readAudioSources(new FormData(form)));
    const row = control?.closest<HTMLElement>('[data-audio-source-row]');
    const index = row ? Array.from(container.querySelectorAll('[data-audio-source-row]')).indexOf(row) : -1;

    if (action === 'audio-source-add' && sources.length < 12) {
        sources.push({ type: 'custom-json', url: '', voice: '', enabled: true });
    }
    if (action === 'audio-source-remove' && index >= 0 && sources.length > 1) {
        sources.splice(index, 1);
    }
    if (action === 'audio-source-up' && index > 0) {
        const [source] = sources.splice(index, 1);
        sources.splice(index - 1, 0, source);
    }
    if (action === 'audio-source-down' && index >= 0 && index < sources.length - 1) {
        const [source] = sources.splice(index, 1);
        sources.splice(index + 1, 0, source);
    }
    setInnerHtml(container, renderAudioSourceEditor(sources));
    log.debug('Updated audio source editor', { action, rows: sources.length });
}

export function renderDictionaryLookupLinkEditor(links: DictionaryLookupLink[]): string {
    const rows = normalizeDictionaryLookupLinks(links);
    return `
        <div class="jpdb-reader-audio-source-head jpdb-reader-lookup-link-head">
            <span>#</span>
            <span>Label</span>
            <span>URL template</span>
            <span></span>
        </div>
        ${renderDictionaryLookupLinkRows(rows)}
        <button class="jpdb-reader-btn" type="button" data-action="lookup-link-add">Add lookup pill</button>
    `;
}

function renderDictionaryLookupLinkRows(rows: DictionaryLookupLink[]): string {
    return `
        <input type="hidden" name="dictionaryLookupLinkCount" value="${rows.length}">
        ${rows.map((link, index) => `
            <div class="jpdb-reader-lookup-link-row" data-lookup-link-row data-index="${index}">
                <label class="inline jpdb-reader-audio-index">
                    <input name="dictionaryLookupLinks.${index}.enabled" type="checkbox" ${link.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                <input name="dictionaryLookupLinks.${index}.label" type="text" value="${escapeHtml(link.label)}" aria-label="Lookup pill label">
                <input name="dictionaryLookupLinks.${index}.urlTemplate" type="text" value="${escapeHtml(link.urlTemplate)}" placeholder="https://takoboto.jp/?q={query}" aria-label="Lookup URL template">
                <input name="dictionaryLookupLinks.${index}.id" type="hidden" value="${escapeHtml(link.id)}">
                <div class="jpdb-reader-row-tools" aria-label="Lookup pill order">
                    <button type="button" class="jpdb-reader-icon-mini" data-action="lookup-link-up" title="Move up" aria-label="Move up">${miniIcon('up')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="lookup-link-down" title="Move down" aria-label="Move down">${miniIcon('down')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="lookup-link-remove" title="Remove" aria-label="Remove">${miniIcon('remove')}</button>
                </div>
            </div>
        `).join('')}
    `;
}

export function readDictionaryLookupLinks(data: FormData): DictionaryLookupLink[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Math.min(MAX_DICTIONARY_LOOKUP_LINKS, Number(get('dictionaryLookupLinkCount')) || 0));
    const links: DictionaryLookupLink[] = [];

    for (let index = 0; index < count; index++) {
        const label = get(`dictionaryLookupLinks.${index}.label`).trim();
        const urlTemplate = get(`dictionaryLookupLinks.${index}.urlTemplate`).trim();
        if (!label && !urlTemplate) continue;
        links.push({
            id: get(`dictionaryLookupLinks.${index}.id`).trim() || `custom-${index}`,
            label,
            urlTemplate,
            enabled: data.has(`dictionaryLookupLinks.${index}.enabled`),
        });
    }

    return normalizeDictionaryLookupLinks(links);
}

export function updateDictionaryLookupLinkEditor(form: HTMLFormElement, action: string, control?: HTMLElement | null): void {
    const container = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links');
    if (!container) return;
    const links = readDictionaryLookupLinks(new FormData(form));
    const row = control?.closest<HTMLElement>('[data-lookup-link-row]');
    const index = row ? Array.from(container.querySelectorAll('[data-lookup-link-row]')).indexOf(row) : -1;

    if (action === 'lookup-link-add' && links.length < MAX_DICTIONARY_LOOKUP_LINKS) {
        links.push({
            id: `custom-${Date.now().toString(36)}`,
            label: '',
            urlTemplate: 'https://takoboto.jp/?q={query}',
            enabled: true,
        });
    }
    if (action === 'lookup-link-remove' && index >= 0 && links.length > 1) links.splice(index, 1);
    if (action === 'lookup-link-up' && index > 0) {
        const [link] = links.splice(index, 1);
        links.splice(index - 1, 0, link);
    }
    if (action === 'lookup-link-down' && index >= 0 && index < links.length - 1) {
        const [link] = links.splice(index, 1);
        links.splice(index + 1, 0, link);
    }
    setInnerHtml(container, renderDictionaryLookupLinkEditor(links));
    log.debug('Updated lookup link editor', { action, rows: links.length });
}

export function updateDictionarySourceEditor(form: HTMLFormElement, action: string, control?: HTMLElement | null): void {
    const row = control?.closest<HTMLElement>('[data-source-row]');
    const container = row?.closest<HTMLElement>('[data-source-editor]');
    if (!container || !row) return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-row]'));
    const index = rows.indexOf(row);
    const targetIndex = action === 'dictionary-source-up' ? index - 1 : index + 1;
    moveDictionarySourceRow(container, index, targetIndex);
    log.debug('Updated dictionary source editor', { action, rows: rows.length });
}

export function installDictionarySourceDrag(form: HTMLFormElement): void {
    let dragged: HTMLElement | null = null;
    form.addEventListener('dragstart', event => {
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-source-row]');
        if (!row) return;
        dragged = row;
        row.classList.add('jpdb-reader-dragging');
        event.dataTransfer?.setData('text/plain', row.dataset.sourceId ?? '');
        event.dataTransfer?.setDragImage(row, 18, 18);
        log.debug('Dictionary source drag started', { sourceId: row.dataset.sourceId });
    });
    form.addEventListener('dragover', event => {
        if (!dragged) return;
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-source-row]');
        if (row && row !== dragged) event.preventDefault();
    });
    form.addEventListener('drop', event => {
        if (!dragged) return;
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-source-row]');
        const container = dragged.closest<HTMLElement>('[data-source-editor]');
        if (!target || !container || target === dragged) return;
        event.preventDefault();
        const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-row]'));
        moveDictionarySourceRow(container, rows.indexOf(dragged), rows.indexOf(target));
        log.debug('Dictionary source dropped', { from: rows.indexOf(dragged), to: rows.indexOf(target) });
    });
    form.addEventListener('dragend', () => {
        dragged?.classList.remove('jpdb-reader-dragging');
        if (dragged) log.debug('Dictionary source drag ended', { sourceId: dragged.dataset.sourceId });
        dragged = null;
    });
}

function moveDictionarySourceRow(container: HTMLElement, index: number, targetIndex: number): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-row]'));
    if (index < 0 || targetIndex < 0 || index >= rows.length || targetIndex >= rows.length || index === targetIndex) return;
    const row = rows[index];
    const target = rows[targetIndex];
    if (targetIndex < index) container.insertBefore(row, target);
    else container.insertBefore(row, target.nextSibling);
    syncDictionarySourcePriorities(container);
}

function syncDictionarySourcePriorities(container: HTMLElement): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-row]'));
    rows.forEach((row, index) => {
        const priority = row.querySelector<HTMLInputElement>('input[name$=".priority"]');
        if (priority) priority.value = String(index);
        const indexLabel = row.querySelector('.jpdb-reader-dictionary-toggle span');
        if (indexLabel) indexLabel.textContent = String(index + 1);
    });
}

export function installShortcutCapture(root: HTMLElement): void {
    root.querySelectorAll<HTMLInputElement>('[data-shortcut-input]').forEach(inputEl => {
        inputEl.addEventListener('keydown', event => {
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Backspace' || event.key === 'Delete') {
                inputEl.value = '';
                log.debug('Shortcut cleared', { name: inputEl.name });
                return;
            }
            inputEl.value = formatShortcutEvent(event);
            log.debug('Shortcut captured', { name: inputEl.name, value: inputEl.value });
        });
        inputEl.addEventListener('paste', event => event.preventDefault());
    });
}

export function syncReviewSettingsVisibility(form: HTMLFormElement): void {
    const reviewsEnabled = form.querySelector<HTMLInputElement>('input[name="enableReviews"]')?.checked ?? true;
    const passFail = form.querySelector<HTMLSelectElement>('select[name="twoButtonReviews"]')?.value === 'true';
    form.querySelectorAll<HTMLElement>('[data-review-config]').forEach(node => { node.hidden = !reviewsEnabled; });
    form.querySelectorAll<HTMLElement>('[data-review-scale="five"]').forEach(node => { node.hidden = !reviewsEnabled || passFail; });
    form.querySelectorAll<HTMLElement>('[data-review-scale="pass-fail"]').forEach(node => { node.hidden = !reviewsEnabled || !passFail; });
}

export function syncSubtitlePreview(form: HTMLFormElement): void {
    const preview = form.querySelector<HTMLElement>('[data-subtitle-preview]');
    if (!preview) return;
    const value = (name: string, fallback: string) => getNamedControl<HTMLInputElement>(form, name)?.value || fallback;
    const numberValue = (name: string, fallback: number) => {
        const number = Number(value(name, String(fallback)));
        return Number.isFinite(number) ? number : fallback;
    };
    preview.style.setProperty('--subtitle-font-size', `${Math.max(16, Math.min(64, numberValue('subtitleFontSize', 32)))}px`);
    preview.style.setProperty('--subtitle-color', sanitizeAccentColor(value('subtitleTextColor', '#ffffff'), '#ffffff'));
    preview.style.setProperty('--subtitle-outline', sanitizeAccentColor(value('subtitleOutlineColor', '#000000'), '#000000'));
    preview.style.setProperty(
        '--subtitle-background-rgba',
        accentToRgba(sanitizeAccentColor(value('subtitleBackgroundColor', '#181b20'), '#181b20'), Math.max(0, Math.min(1, numberValue('subtitleBackgroundOpacity', 0.32)))),
    );
    preview.style.setProperty('--subtitle-family', value('subtitleFontFamily', 'system-ui'));
    preview.style.setProperty('--subtitle-weight', String(Math.max(100, Math.min(900, numberValue('subtitleFontWeight', 850)))));
}

export function renderDeckControls(settings: ReaderSettings, decks: JPDBDeck[], hasApiKey: boolean): string {
    const disabled = !hasApiKey || !decks.length;
    const deckOptions = decks.map(deck => [deck.id, deck.name] as [string, string]);
    const miningOptions = [['forq', 'FORQ'], ...deckOptions] as [string, string][];
    const newTabOptions = [['all', 'All study decks'], ['never-forget', 'Never forget'], ...deckOptions] as [string, string][];
    return `
        <div class="grid">
            ${deckSelect('miningDeck', 'Mining deck', settings.miningDeck, miningOptions, disabled)}
            ${deckSelect('newTabJpdbDeck', 'New tab JPDB deck', settings.newTabJpdbDeck, newTabOptions, disabled)}
            ${deckSelect('neverForgetDeck', 'Never forget deck', settings.neverForgetDeck, deckOptions, disabled)}
            ${deckSelect('blacklistDeck', 'Blacklist deck', settings.blacklistDeck, deckOptions, disabled)}
        </div>
        <div class="jpdb-reader-help">${hasApiKey ? (decks.length ? 'Decks are loaded from your JPDB account.' : 'Could not load decks yet; saved deck IDs will be kept.') : 'Add your JPDB API key to choose decks.'}</div>
    `;
}

function deckSelect(name: string, label: string, value: string, options: [string, string][], disabled: boolean): string {
    const hasValue = options.some(([optionValue]) => optionValue === value);
    const merged = hasValue || !value ? options : [[value, `Saved: ${value}`] as [string, string], ...options];
    return `<label>${label}
        <select name="${name}" ${disabled ? 'disabled' : ''}>
            ${merged.map(([optionValue, text]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}
        </select>
        ${disabled ? `<input type="hidden" name="${name}" value="${escapeHtml(value)}">` : ''}
    </label>`;
}

export function settingsTabButton(panel: string, label: string, active = false): string {
    return `<button class="jpdb-reader-settings-tab" type="button" data-action="settings-panel" data-panel="${escapeHtml(panel)}" role="tab" aria-selected="${active ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
}

export function renderAnkiTemplatePreview(settings: ReaderSettings): string {
    const contextMode = settings.ankiTemplateMode === 'context';
    const front = contextMode
        ? '<div class="jpdb-reader-template-sentence">今日は<span>本を読む</span>。</div><small>Recall the highlighted word from context.</small>'
        : '<div class="jpdb-reader-template-expression">読む</div><div class="jpdb-reader-template-reading">よむ</div><small>Recall the meaning and reading first.</small>';
    return `
        <div class="jpdb-reader-template-preview">
            <div class="jpdb-reader-template-preview-title">${contextMode ? 'Sentence first preset' : 'Word first preset'}</div>
            <div class="jpdb-reader-template-preview-grid">
                <div>
                    <strong>Front</strong>
                    ${front}
                </div>
                <div>
                    <strong>Back</strong>
                    <div class="jpdb-reader-template-expression">読む</div>
                    <div class="jpdb-reader-template-reading">よむ</div>
                    <div class="jpdb-reader-template-meaning">to read</div>
                    <small>Includes dictionary, kanji, pitch, frequency, source, and image fields when available.</small>
                </div>
            </div>
        </div>
    `;
}

export function renderDictionarySourceRows(settings: ReaderSettings): string {
    const rows = definitionSourceRows(settings);
    if (rows.length === 4) return `
        <div class="jpdb-reader-help">Import Yomitan dictionaries to add local or native-language definitions alongside JPDB and Immersion Kit examples.</div>
        ${renderSourceRowsList(rows, { sourceLabel: 'Definition source', countName: 'dictionaryPreferenceCount', showAlias: true })}
    `;
    return renderSourceRowsList(rows, { sourceLabel: 'Definition source', countName: 'dictionaryPreferenceCount', showAlias: true });
}

export function renderKanjiSourceRows(settings: ReaderSettings): string {
    return renderSourceRowsList(kanjiSourceRows(settings), { sourceLabel: 'Kanji section', showAlias: false });
}

function renderSourceRowsList(rows: SettingsSourceRow[], options: { sourceLabel: string; countName?: string; showAlias: boolean }): string {
    const removableCount = rows.filter(row => row.removable).length;
    return `
        <div class="jpdb-reader-dictionary-head ${options.showAlias ? '' : 'compact'}">
            <span>On</span>
            <span>${escapeHtml(options.sourceLabel)}</span>
            ${options.showAlias ? '<span>Alias</span>' : ''}
            <span>Order</span>
            <span>Remove</span>
        </div>
        ${options.countName ? `<input type="hidden" name="${escapeHtml(options.countName)}" value="${removableCount}">` : ''}
        ${rows.map((row, index) => `
            <div class="jpdb-reader-dictionary-row ${options.showAlias ? '' : 'compact'}" draggable="true" data-source-row data-dictionary-source-row data-source-id="${escapeHtml(row.id)}">
                <label class="inline jpdb-reader-dictionary-toggle">
                    <input name="${row.prefix}.enabled" type="checkbox" ${row.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                <input name="${row.prefix}.name" type="text" value="${escapeHtml(row.name)}" readonly aria-label="${escapeHtml(options.sourceLabel)}">
                ${options.showAlias ? `<input name="${row.prefix}.alias" type="text" value="${escapeHtml(row.alias)}" ${row.readonly ? 'readonly' : ''} aria-label="Dictionary alias">` : ''}
                <div class="jpdb-reader-row-tools">
                    <input name="${row.prefix}.priority" type="hidden" value="${index}" aria-label="${escapeHtml(options.sourceLabel)} priority">
                    <button type="button" class="jpdb-reader-icon-mini" data-action="dictionary-source-up" title="Move up" aria-label="Move up">${miniIcon('up')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="dictionary-source-down" title="Move down" aria-label="Move down">${miniIcon('down')}</button>
                </div>
                <div class="jpdb-reader-row-tools">
                    ${row.removable ? `<button type="button" class="jpdb-reader-icon-mini" data-action="delete-yomitan-dictionary" data-dictionary-name="${escapeHtml(row.name)}" title="Remove imported dictionary" aria-label="Remove imported dictionary">${miniIcon('remove')}</button>` : ''}
                </div>
                ${row.help ? `<div class="jpdb-reader-dictionary-row-help">${escapeHtml(row.help)}</div>` : ''}
            </div>
        `).join('')}
    `;
}

export function renderRecommendedDictionaries(installed: YomitanDictionaryInfo[]): string {
    const groups: Array<[RecommendedDictionary['category'], string]> = [
        ['terms', 'Term dictionaries'],
        ['kanji', 'Kanji dictionaries'],
        ['frequency', 'Frequency dictionaries'],
    ];

    return `
        <div class="jpdb-reader-recommended-title">Starter dictionary</div>
        <div class="jpdb-reader-settings-actions">
            <button class="jpdb-reader-btn" type="button" data-action="download-starter-dictionaries">Download JMdict</button>
            <button class="jpdb-reader-btn" type="button" data-action="refresh-dictionaries">Refresh installed list</button>
        </div>
        ${groups.map(([category, label]) => {
            const dictionaries = RECOMMENDED_JAPANESE_DICTIONARIES.filter(dictionary => dictionary.category === category);
            if (!dictionaries.length) return '';
            return `
                <div class="jpdb-reader-recommended-group">
                    <div class="jpdb-reader-recommended-group-title">${escapeHtml(label)}</div>
                    ${dictionaries.map(dictionary => renderRecommendedDictionary(dictionary, installed)).join('')}
                </div>
            `;
        }).join('')}
    `;
}

function renderRecommendedDictionary(dictionary: RecommendedDictionary, installed: YomitanDictionaryInfo[]): string {
    const alreadyInstalled = isRecommendedDictionaryInstalled(dictionary, installed);
    return `
        <div class="jpdb-reader-recommended-item">
            <div>
                <div class="jpdb-reader-recommended-name">
                    <span>${escapeHtml(dictionary.name)}</span>
                    <a href="${dictionary.homepage}" target="_blank" rel="noopener">Homepage</a>
                </div>
                <div class="jpdb-reader-help">${escapeHtml(dictionary.description)}</div>
            </div>
            <button class="jpdb-reader-btn" type="button" data-action="download-recommended-dictionary" data-dictionary-id="${escapeHtml(dictionary.id)}" data-installed="${alreadyInstalled}">
                ${alreadyInstalled ? 'Update' : 'Download'}
            </button>
        </div>
    `;
}

export function isRecommendedDictionaryInstalled(dictionary: RecommendedDictionary, installed: YomitanDictionaryInfo[]): boolean {
    const targetName = normalizedDictionaryName(dictionary.name);
    return installed.some(item => item.downloadUrl === dictionary.downloadUrl || normalizedDictionaryName(item.title).includes(targetName));
}

function normalizedDictionaryName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9ぁ-んァ-ン一-龯]/g, '');
}

export function recommendedDictionaryFilename(dictionary: RecommendedDictionary): string {
    try {
        const parsed = new URL(dictionary.downloadUrl);
        const lastPath = parsed.pathname.split('/').filter(Boolean).pop();
        if (lastPath && /\.zip$/i.test(lastPath)) return decodeURIComponent(lastPath);
    } catch {
        // Fall through to a readable fallback.
    }
    return `${dictionary.id}.zip`;
}

export function readFormSettings(data: FormData, current: ReaderSettings): ReaderSettings {
    const get = (key: string) => String(data.get(key) ?? '');
    const has = (key: string) => data.has(key);
    const number = (key: string, fallback: number) => readNumber(get(key), fallback);
    const audioSources = readAudioSources(data);
    const furiganaMode = ['auto', 'all', 'difficult-kanji', 'known-status', 'off'].includes(get('furiganaMode'))
        ? get('furiganaMode') as ReaderSettings['furiganaMode']
        : current.furiganaMode;
    const wordHighlightMode = ['auto', 'status', 'pitch', 'off'].includes(get('wordHighlightMode'))
        ? get('wordHighlightMode') as ReaderSettings['wordHighlightMode']
        : current.wordHighlightMode;
    const settings: ReaderSettings = {
        ...current,
        apiKey: get('apiKey').trim(),
        interfaceLanguage: ['auto', 'en', 'ja'].includes(get('interfaceLanguage')) ? get('interfaceLanguage') as ReaderSettings['interfaceLanguage'] : current.interfaceLanguage,
        jpdbDefinitionsEnabled: has('jpdbDefinitions.enabled'),
        jpdbDefinitionsPriority: Math.max(0, Math.min(999, number('jpdbDefinitions.priority', current.jpdbDefinitionsPriority))),
        jpdbExtensionsEnabled: has('jpdbExtensionsEnabled'),
        jpdbUchisenEnabled: has('jpdbUchisenEnabled'),
        jpdbRtkEnabled: has('jpdbRtkEnabled'),
        jpdbImmersionKitEnabled: has('jpdbImmersionKitEnabled'),
        jpdbImmersionKitAutoPlayReviewAudio: has('jpdbImmersionKitAutoPlayReviewAudio'),
        jpdbLocalDictionariesEnabled: has('jpdbLocalDictionariesEnabled'),
        jpdbReviewUiEnabled: has('jpdbReviewUiEnabled'),
        jpdbAutoRevealSentenceEnabled: has('jpdbAutoRevealSentenceEnabled'),
        jpdbKanjiDoodleEnabled: has('jpdbKanjiDoodleEnabled'),
        jpdbKanjiEnabled: has('jpdbKanji.enabled'),
        jpdbKanjiPriority: Math.max(0, Math.min(999, number('jpdbKanji.priority', current.jpdbKanjiPriority))),
        rtkEnabled: has('rtk.enabled'),
        rtkPriority: Math.max(0, Math.min(999, number('rtk.priority', current.rtkPriority))),
        kanjivgEnabled: has('kanjivg.enabled'),
        kanjivgPriority: Math.max(0, Math.min(999, number('kanjivg.priority', current.kanjivgPriority))),
        kanjiOriginsEnabled: has('kanjiOrigins.enabled'),
        kanjiOriginsPriority: Math.max(0, Math.min(999, number('kanjiOrigins.priority', current.kanjiOriginsPriority))),
        kanjiOriginKanjiMapEnabled: has('kanjiOriginKanjiMapEnabled'),
        kanjiOriginWiktionaryEnabled: false,
        kanjiOriginGraphEnabled: has('kanjiOriginGraphEnabled'),
        kanjiOriginRadicalImagesEnabled: has('kanjiOriginRadicalImagesEnabled'),
        similarKanjiWords: has('similarKanjiWords.enabled'),
        similarKanjiWordsPriority: Math.max(0, Math.min(999, number('similarKanjiWords.priority', current.similarKanjiWordsPriority))),
        similarKanjiWordLimit: Math.max(2, Math.min(24, number('similarKanjiWordLimit', current.similarKanjiWordLimit))),
        audioEnabled: has('audioEnabled'),
        autoPlayAudio: has('autoPlayAudio'),
        audioSources,
        audioEnableDefaultSources: has('audioEnableDefaultSources'),
        audioSourceUrl: audioSources.find(source => source.url.trim())?.url.trim() ?? current.audioSourceUrl,
        accentColor: sanitizeAccentColor(get('accentColor'), current.accentColor),
        wordColorNew: sanitizeAccentColor(get('wordColorNew'), current.wordColorNew),
        wordColorLearning: sanitizeAccentColor(get('wordColorLearning'), current.wordColorLearning),
        wordColorKnown: sanitizeAccentColor(get('wordColorKnown'), current.wordColorKnown),
        wordColorDue: sanitizeAccentColor(get('wordColorDue'), current.wordColorDue),
        wordColorFailed: sanitizeAccentColor(get('wordColorFailed'), current.wordColorFailed),
        wordColorIgnored: sanitizeAccentColor(get('wordColorIgnored'), current.wordColorIgnored),
        audioViaBlob: has('audioViaBlob'),
        audioFallbackChimeEnabled: has('audioFallbackChimeEnabled'),
        audioTimeoutMs: Math.max(1000, number('audioTimeoutMs', current.audioTimeoutMs)),
        audioSelectionMode: (get('audioSelectionMode') === 'random' ? 'random' : 'first') as ReaderSettings['audioSelectionMode'],
        immersionKitEnabled: has('immersionKitEnabled') && has('immersionKit.enabled'),
        immersionKitPriority: Math.max(0, Math.min(999, number('immersionKit.priority', current.immersionKitPriority))),
        immersionKitLimit: Math.max(1, Math.min(12, number('immersionKitLimit', current.immersionKitLimit))),
        immersionKitMinLength: Math.max(0, Math.min(120, number('immersionKitMinLength', current.immersionKitMinLength))),
        immersionKitMaxLength: Math.max(0, Math.min(240, number('immersionKitMaxLength', current.immersionKitMaxLength))),
        immersionKitCategory: ['all', 'anime', 'drama', 'games'].includes(get('immersionKitCategory')) ? get('immersionKitCategory') as ReaderSettings['immersionKitCategory'] : current.immersionKitCategory,
        immersionKitSort: ['sentence_length:asc', 'sentence_length:desc', 'random'].includes(get('immersionKitSort')) ? get('immersionKitSort') as ReaderSettings['immersionKitSort'] : current.immersionKitSort,
        immersionKitExactMatch: has('immersionKitExactMatch'),
        immersionKitShowTranslation: has('immersionKitShowTranslation'),
        immersionKitShowImages: has('immersionKitShowImages'),
        immersionKitAutoPlayAudio: has('immersionKitAutoPlayAudio'),
        immersionKitPlayOnHover: has('immersionKitPlayOnHover'),
        immersionKitPlaybackRate: Math.max(0.5, Math.min(2, number('immersionKitPlaybackRate', current.immersionKitPlaybackRate))),
        parseSelection: has('parseSelection'),
        lookupOnClick: has('lookupOnClick'),
        lookupOnHover: has('lookupOnHover'),
        lookupOnMiddleMouse: has('lookupOnMiddleMouse'),
        hoverOpenDelayMs: Math.max(0, Math.min(1500, number('hoverOpenDelayMs', current.hoverOpenDelayMs))),
        hoverCloseDelayMs: Math.max(0, Math.min(3000, number('hoverCloseDelayMs', current.hoverCloseDelayMs))),
        popupActivationMode: current.popupActivationMode,
        scanModifierKey: current.scanModifierKey,
        autoScanJapanese: has('autoScanJapanese'),
        scanVisiblePage: has('scanVisiblePage'),
        showFloatingButton: has('showFloatingButton'),
        newTabEnabled: has('newTabEnabled'),
        newTabSource: ['auto', 'jpdb', 'anki', 'dictionary'].includes(get('newTabSource')) ? get('newTabSource') as ReaderSettings['newTabSource'] : current.newTabSource,
        newTabJpdbDeck: get('newTabJpdbDeck').trim() || current.newTabJpdbDeck,
        showFurigana: furiganaMode !== 'off',
        furiganaMode,
        showPitchAccent: has('showPitchAccent'),
        wordHighlightMode,
        hideKnownFurigana: furiganaMode === 'known-status',
        ocrEnabled: has('ocrEnabled'),
        ocrAutoScanImages: has('ocrAutoScanImages'),
        ocrShowTextOverlay: has('ocrShowTextOverlay'),
        ocrProvider: normalizeOcrProvider(get('ocrProvider')),
        ocrEndpointUrl: get('ocrEndpointUrl').trim(),
        ocrEngine: get('ocrEngine').trim() || 'auto',
        ocrCloudVisionApiKey: get('ocrCloudVisionApiKey').trim(),
        ocrLanguage: get('ocrLanguage').trim() || 'ja-JP',
        ocrMaxImagePixels: Math.max(160000, Math.min(2800000, number('ocrMaxImagePixels', current.ocrMaxImagePixels))),
        ocrMinImageArea: Math.max(10000, Math.min(800000, number('ocrMinImageArea', current.ocrMinImageArea))),
        ocrMaxImagesPerPage: Math.max(1, Math.min(30, number('ocrMaxImagesPerPage', current.ocrMaxImagesPerPage))),
        ocrPrefetchMargin: Math.max(0, Math.min(3000, number('ocrPrefetchMargin', current.ocrPrefetchMargin))),
        ocrTextColor: sanitizeAccentColor(get('ocrTextColor'), current.ocrTextColor),
        ocrOutlineColor: sanitizeAccentColor(get('ocrOutlineColor'), current.ocrOutlineColor),
        ocrBackgroundColor: sanitizeAccentColor(get('ocrBackgroundColor'), current.ocrBackgroundColor),
        ocrBackgroundOpacity: Math.max(0, Math.min(1, number('ocrBackgroundOpacity', current.ocrBackgroundOpacity))),
        ocrFontScale: Math.max(0.7, Math.min(1.8, number('ocrFontScale', current.ocrFontScale))),
        localDictionariesEnabled: has('localDictionariesEnabled'),
        localDictionaryShowKanji: has('kanjiDictionaries.enabled'),
        kanjiDictionariesPriority: Math.max(0, Math.min(999, number('kanjiDictionaries.priority', current.kanjiDictionariesPriority))),
        dictionarySourcesInitiallyExpanded: has('dictionarySourcesInitiallyExpanded'),
        localDictionaryMaxResults: Math.max(1, Math.min(64, number('localDictionaryMaxResults', current.localDictionaryMaxResults))),
        dictionaryPreferences: readDictionaryPreferences(data, current.dictionaryPreferences),
        dictionaryLookupLinks: readDictionaryLookupLinks(data),
        subtitlePlayerEnabled: has('subtitlePlayerEnabled'),
        subtitleAutoDetect: has('subtitleAutoDetect'),
        subtitleOverlayVisible: has('subtitleOverlayVisible'),
        subtitleSecondaryVisible: has('subtitleSecondaryVisible'),
        subtitleTranscriptVisible: has('subtitleTranscriptVisible'),
        subtitleTranscriptPlacement: ['right', 'left', 'bottom'].includes(get('subtitleTranscriptPlacement')) ? get('subtitleTranscriptPlacement') as ReaderSettings['subtitleTranscriptPlacement'] : current.subtitleTranscriptPlacement,
        subtitleTranscriptAutoScroll: has('subtitleTranscriptAutoScroll'),
        subtitleControlsMode: ['auto', 'always', 'hidden'].includes(get('subtitleControlsMode')) ? get('subtitleControlsMode') as ReaderSettings['subtitleControlsMode'] : current.subtitleControlsMode,
        subtitleFontSize: Math.max(16, Math.min(64, number('subtitleFontSize', current.subtitleFontSize))),
        subtitleBottomOffset: Math.max(2, Math.min(40, number('subtitleBottomOffset', current.subtitleBottomOffset))),
        subtitleTextColor: sanitizeAccentColor(get('subtitleTextColor'), current.subtitleTextColor),
        subtitleOutlineColor: sanitizeAccentColor(get('subtitleOutlineColor'), current.subtitleOutlineColor),
        subtitleBackgroundColor: sanitizeAccentColor(get('subtitleBackgroundColor'), current.subtitleBackgroundColor),
        subtitleBackgroundOpacity: Math.max(0, Math.min(1, number('subtitleBackgroundOpacity', current.subtitleBackgroundOpacity))),
        subtitleFontFamily: get('subtitleFontFamily').trim() || current.subtitleFontFamily,
        subtitleFontWeight: Math.max(100, Math.min(900, number('subtitleFontWeight', current.subtitleFontWeight))),
        subtitleMiningPause: has('subtitleMiningPause'),
        subtitleSeekPadding: Math.max(-2, Math.min(2, number('subtitleSeekPadding', current.subtitleSeekPadding))),
        mpvSubtitleMiningEnabled: has('mpvSubtitleMiningEnabled'),
        mpvSubtitleAutoConnect: has('mpvSubtitleAutoConnect'),
        mpvSubtitleHost: get('mpvSubtitleHost').trim() || current.mpvSubtitleHost,
        mpvSubtitlePorts: get('mpvSubtitlePorts').trim() || current.mpvSubtitlePorts,
        youtubeImmersionEnabled: has('youtubeImmersionEnabled'),
        youtubeShowFilterNotice: has('youtubeShowFilterNotice'),
        ankiEnabled: has('ankiEnabled'),
        ankiConnectUrl: get('ankiConnectUrl').trim() || current.ankiConnectUrl,
        ankiDeck: get('ankiDeck').trim() || current.ankiDeck,
        ankiModel: get('ankiModel').trim() || current.ankiModel,
        ankiTemplateMode: get('ankiTemplateMode') === 'context' ? 'context' : 'recognition',
        ankiTags: get('ankiTags').trim(),
        ankiMineWithJpdb: has('ankiMineWithJpdb'),
        ankiCaptureScreenshot: has('ankiCaptureScreenshot'),
        ankiMobileHandoff: has('ankiMobileHandoff'),
        studyTranslationEnabled: has('studyTranslation.enabled'),
        studyTranslationPriority: Math.max(0, Math.min(999, number('studyTranslation.priority', current.studyTranslationPriority))),
        studyGrammarEnabled: has('studyGrammar.enabled'),
        studyGrammarPriority: Math.max(0, Math.min(999, number('studyGrammar.priority', current.studyGrammarPriority))),
        enableLogging: has('enableLogging'),
        theme: get('theme') as ReaderSettings['theme'],
        popupMode: get('popupMode') as ReaderSettings['popupMode'],
        jpdbMiningEnabled: has('jpdbMiningEnabled'),
        miningDeck: get('miningDeck').trim() || 'forq',
        neverForgetDeck: get('neverForgetDeck').trim() || 'never-forget',
        blacklistDeck: get('blacklistDeck').trim() || 'blacklist',
        addToForq: has('addToForq'),
        enableReviews: has('enableReviews'),
        twoButtonReviews: get('twoButtonReviews') === 'true',
        shortcuts: {
            scanPage: get('shortcuts.scanPage'),
            hoverLookup: get('shortcuts.hoverLookup'),
            openSettings: get('shortcuts.openSettings'),
            playAudio: get('shortcuts.playAudio'),
            closePopup: get('shortcuts.closePopup'),
            previousSubtitle: get('shortcuts.previousSubtitle'),
            nextSubtitle: get('shortcuts.nextSubtitle'),
            copySubtitle: get('shortcuts.copySubtitle'),
            toggleOcr: get('shortcuts.toggleOcr'),
            toggleYoutubeImmersion: get('shortcuts.toggleYoutubeImmersion'),
            scanImages: get('shortcuts.scanImages'),
            gradeNothing: get('shortcuts.gradeNothing'),
            gradeSomething: get('shortcuts.gradeSomething'),
            gradeHard: get('shortcuts.gradeHard'),
            gradeOkay: get('shortcuts.gradeOkay'),
            gradeEasy: get('shortcuts.gradeEasy'),
            gradeFail: get('shortcuts.gradeFail'),
            gradePass: get('shortcuts.gradePass'),
        },
    };
    log.info('Read settings form data', {
        enableLogging: settings.enableLogging,
        dictionaries: settings.dictionaryPreferences.length,
        lookupLinks: settings.dictionaryLookupLinks.length,
        audioSources: settings.audioSources.length,
        ocrEnabled: settings.ocrEnabled,
        subtitlePlayerEnabled: settings.subtitlePlayerEnabled,
        youtubeImmersionEnabled: settings.youtubeImmersionEnabled,
        ankiEnabled: settings.ankiEnabled,
    });
    return settings;
}

function readNumber(value: string, fallback: number): number {
    if (!value.trim()) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function readDictionaryPreferences(data: FormData, current: DictionaryPreference[]): DictionaryPreference[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Number(get('dictionaryPreferenceCount')) || 0);
    if (!count) return current;

    return Array.from({ length: count }, (_, index) => ({
        name: get(`dictionaryPreferences.${index}.name`).trim(),
        alias: get(`dictionaryPreferences.${index}.alias`).trim() || get(`dictionaryPreferences.${index}.name`).trim(),
        enabled: data.has(`dictionaryPreferences.${index}.enabled`),
        priority: readNumber(get(`dictionaryPreferences.${index}.priority`), index),
    }))
        .filter(item => item.name)
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export function readAudioSources(data: FormData): AudioSourceSetting[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Number(get('audioSourceCount')) || 0);
    const sources: AudioSourceSetting[] = [];
    const builtInTypes = new Set(DEFAULT_AUDIO_SOURCES.map(source => source.type));

    for (let index = 0; index < count; index++) {
        const source = normalizeAudioSource({
            type: get(`audioSources.${index}.type`),
            url: get(`audioSources.${index}.url`).trim(),
            voice: get(`audioSources.${index}.voice`).trim(),
            enabled: data.has(`audioSources.${index}.enabled`),
        });
        if (!source) continue;
        if (!source.enabled && !source.url && !source.voice && !builtInTypes.has(source.type)) continue;
        sources.push(source);
    }

    return sources;
}

export function getReaderSettingsExport(value: unknown): ReaderSettings | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as { formatName?: string; settings?: unknown };
    return (record.formatName === 'yomu-reader-settings' || record.formatName === 'jpdb-popup-reader-settings')
        && record.settings
        && typeof record.settings === 'object'
        ? record.settings as ReaderSettings
        : null;
}

export function pickFile(root: HTMLElement, type: 'settings' | 'dictionary'): Promise<File | null> {
    const inputEl = root.querySelector<HTMLInputElement>(`input[data-file="${type}"]`);
    if (!inputEl) {
        log.warn('File picker input missing', { type });
        return Promise.resolve(null);
    }

    return new Promise(resolve => {
        inputEl.onchange = () => {
            const file = inputEl.files?.[0] ?? null;
            inputEl.value = '';
            log.info('File picker completed', { type, name: file?.name ?? '', size: file?.size ?? 0 });
            resolve(file);
        };
        log.debug('Opening file picker', { type });
        inputEl.click();
    });
}

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    log.info('Downloaded blob', { filename, size: blob.size, type: blob.type });
}

export function dateStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}
