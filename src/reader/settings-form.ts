import { DISCORD_INVITE_URL, DOCS_BASE_URL, DONATE_URL, GITHUB_REPOSITORY_URL, NADESHIKO_DEVELOPER_URL, NEW_TAB_PAGE_URL, SETTINGS_TITLE, VIDEO_PLAYER_PAGE_URL } from './constants';
import { escapeHtml, setInnerHtml } from './dom';
import { resolveUiLanguage, uiText } from './i18n';
import { Logger } from './logger';
import { AUDIO_GUIDE_URL, AUDIO_SOURCE_LABELS, AUDIO_SOURCE_UI_OPTIONS, COPY_LOOKUP_LINK, DEFAULT_AUDIO_SOURCES, MAX_DICTIONARY_LOOKUP_LINKS, accentToRgba, formatShortcutEvent, normalizeAudioSource, normalizeDictionaryLookupLinks, normalizeOcrProvider, sanitizeAccentColor } from './settings';
import type { AudioSourceSetting, DictionaryLookupLink, DictionaryPreference, ImmersionExampleSource, InterfaceLanguage, JPDBDeck, ReaderColorSource, ReaderSettings } from './types';
import type { RecommendedDictionary } from './recommended-dictionaries';
import { RECOMMENDED_JAPANESE_DICTIONARIES } from './recommended-dictionaries';
import { definitionSourceRows, kanjiSourceRows, type SettingsSourceRow } from './source-sections';
import type { YomitanDictionaryInfo } from './yomitan';
import { externalLinkIcon, speakerIcon } from './popup-render';

const log = Logger.scope('SettingsForm');
type SelectableReaderColorSource = Exclude<ReaderColorSource, 'auto'>;
type ColorSourceSettingName =
    | 'wordHighlightColorSource'
    | 'wordUnderlineColorSource'
    | 'wordTextColorSource'
    | 'subtitleHighlightColorSource'
    | 'subtitleUnderlineColorSource'
    | 'subtitleTextColorSource';

const COLOR_SOURCE_VALUES: readonly SelectableReaderColorSource[] = ['status', 'jpdb', 'anki', 'pitch', 'off'];
const COLOR_SOURCE_OPTIONS: [SelectableReaderColorSource, string][] = [
    ['status', 'Available status'],
    ['jpdb', 'JPDB status'],
    ['anki', 'Anki status'],
    ['pitch', 'Pitch accent'],
    ['off', 'Off'],
];
const DEFAULT_COLOR_SOURCE_VALUES: Record<ColorSourceSettingName, SelectableReaderColorSource> = {
    wordHighlightColorSource: 'jpdb',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'off',
    subtitleHighlightColorSource: 'jpdb',
    subtitleUnderlineColorSource: 'pitch',
    subtitleTextColorSource: 'jpdb',
};
const COLOR_SOURCE_CLASS_VALUES: Exclude<ReaderColorSource, 'auto' | 'off'>[] = ['status', 'jpdb', 'anki', 'pitch'];

interface SettingsFormReader {
    get: (key: string) => string;
    has: (key: string) => boolean;
    number: (key: string, fallback: number) => number;
    colorSource: (key: string, fallback: ReaderColorSource) => ReaderColorSource;
}

export function renderHelpLinksPanel(): string {
    return `
        <div class="jpdb-reader-help-card jpdb-reader-help-links-card">
            <div>
                <div class="jpdb-reader-help-title" data-help-links-title>Useful pages</div>
                <p data-help-links-copy>Open the hosted reader tools and docs from here.</p>
            </div>
            <div class="jpdb-reader-help-actions">
                <a class="jpdb-reader-btn" href="${VIDEO_PLAYER_PAGE_URL}" target="_blank" rel="noopener" data-help-link="video-player">${externalButtonLabel('Video Player')}</a>
                <a class="jpdb-reader-btn" href="${NEW_TAB_PAGE_URL}" target="_blank" rel="noopener" data-help-link="new-tab">${externalButtonLabel('New Tab')}</a>
                <a class="jpdb-reader-btn" href="${DOCS_BASE_URL}" target="_blank" rel="noopener" data-help-link="docs">${externalButtonLabel('Docs')}</a>
                <button class="jpdb-reader-btn jpdb-reader-help-reset" type="button" data-action="factory-reset" data-help-link="factory-reset">Factory Reset</button>
            </div>
            <div class="jpdb-reader-help-support">
                <div>
                    <div class="jpdb-reader-help-title" data-help-support-title>Support よむ</div>
                    <p data-help-support-copy>よむ brings popup lookup, JPDB mining, imported dictionaries, subtitles, image reading, and Anki export into one free userscript. Comparable study suites such as Migaku currently advertise paid plans from $10/month; よむ offers the same core reading-and-mining workflow for free.</p>
                    <p data-help-support-copy-extra>Donations are optional. They help cover the time, testing devices, services, maintenance, and AI tokens that keep the reader polished. Realistically, I have already spent far more on AI/API tokens building よむ than donations are ever likely to make back, but even a small donation helps soften that cost. On a personal level, my dream is to save enough money to move to Japan and marry my long-distance Japanese girlfriend. Every bit of support helps bring that future closer and encourages me to keep maintaining よむ, fixing bugs, and adding the features learners ask for.</p>
                </div>
                <div class="jpdb-reader-help-actions">
                    <a class="jpdb-reader-btn jpdb-reader-help-donate" href="${DONATE_URL}" target="_blank" rel="noopener" data-help-link="donate">${externalButtonLabel('Donate')}</a>
                    <a class="jpdb-reader-btn" href="${GITHUB_REPOSITORY_URL}/issues" target="_blank" rel="noopener" data-help-link="issues">${externalButtonLabel('Issues')}</a>
                    <a class="jpdb-reader-btn jpdb-reader-help-discord" href="${DISCORD_INVITE_URL}" target="_blank" rel="noopener" data-help-link="discord">${externalButtonLabel('Discord')}</a>
                </div>
            </div>
        </div>
    `;
}

function renderHelpGlossaryPanel(): string {
    return `
        <div class="jpdb-reader-help-card jpdb-reader-help-glossary-card">
            <div class="jpdb-reader-help-title" data-help-glossary-title>Glossary</div>
            <dl class="jpdb-reader-help-glossary">
                <div>
                    <dt data-help-glossary-term="jpdb">JPDB</dt>
                    <dd data-help-glossary-definition="jpdb">An online Japanese study site. よむ can use it for word status, definitions, review buttons, and mining.</dd>
                </div>
                <div>
                    <dt data-help-glossary-term="yomitan">Yomitan dictionaries</dt>
                    <dd data-help-glossary-definition="yomitan">Downloadable dictionary files. よむ can import them so lookups keep working from local browser storage.</dd>
                </div>
                <div>
                    <dt data-help-glossary-term="mining">Mining</dt>
                    <dd data-help-glossary-definition="mining">Saving a word, sentence, subtitle, or image context so you can study it later.</dd>
                </div>
                <div>
                    <dt data-help-glossary-term="anki">Anki</dt>
                    <dd data-help-glossary-definition="anki">A flashcard app. よむ can send cards to Anki when you choose to connect it.</dd>
                </div>
                <div>
                    <dt data-help-glossary-term="ocr">OCR</dt>
                    <dd data-help-glossary-definition="ocr">Reading text from images, such as manga panels or screenshots.</dd>
                </div>
            </dl>
        </div>
    `;
}

export function renderSettingsForm(settings: ReaderSettings, jpdbSettingsUrl: string): string {
    return `
            <div class="jpdb-reader-settings-head">
                <div class="jpdb-reader-settings-drag-handle"></div>
                <h2>${SETTINGS_TITLE}</h2>
            </div>
            ${renderSettingsTabs()}
            <div class="jpdb-reader-settings-scroll">
            ${renderJpdbSettingsPanel(settings, jpdbSettingsUrl)}
            ${renderInterfaceSettingsPanel(settings)}
            ${renderAudioSettingsPanel(settings)}
            ${renderImmersionKitSettingsPanel(settings)}
            ${renderReaderSettingsPanel(settings)}
            ${renderKanjiSettingsPanel(settings)}
            ${renderImageSettingsPanel(settings)}
            ${renderVideoSettingsPanel(settings)}
            ${renderYoutubeSettingsPanel(settings)}
            ${renderMiningSettingsPanel(settings)}
            ${renderDictionariesSettingsPanel(settings)}
            ${renderShortcutSettingsPanel(settings)}
            ${renderHelpSettingsPanel()}
            </div>
            ${renderSettingsFooter()}
        `;
}

function renderSettingsTabs(): string {
    return `
            <div class="jpdb-reader-settings-tabs" role="tablist" aria-label="Settings sections">
                ${settingsTabButton('basics', 'Basics', true)}
                ${settingsTabButton('dictionaries', 'Dictionaries')}
                ${settingsTabButton('media', 'Media')}
                ${settingsTabButton('mining', 'Mining')}
                ${settingsTabButton('shortcuts', 'Shortcuts')}
                ${settingsTabButton('help', 'Help')}
            </div>
    `;
}

function renderJpdbSettingsPanel(settings: ReaderSettings, jpdbSettingsUrl: string): string {
    return `
            <fieldset data-settings-panel="basics">
                <legend>JPDB</legend>
                ${input('apiKey', `API key <a href="${jpdbSettingsUrl}" target="_blank" rel="noopener">JPDB settings</a>`, settings.apiKey, 'password')}
                <div data-jpdb-decks>
                    ${renderDeckControls(settings, [], Boolean(settings.apiKey.trim()))}
                </div>
                ${checkbox('jpdbMiningEnabled', 'Allow JPDB review/deck changes', settings.jpdbMiningEnabled)}
                ${checkbox('addToForq', 'Also copy JPDB adds to forq', settings.jpdbMiningEnabled && settings.addToForq, { disabled: !settings.jpdbMiningEnabled })}
                ${checkbox('enableReviews', 'Show review buttons', settings.enableReviews)}
                <div data-review-config ${settings.enableReviews ? '' : 'hidden'}>
                    ${select('twoButtonReviews', 'Review rating scale', settings.twoButtonReviews ? 'true' : 'false', [['false', 'Five point: NOTHING to EASY'], ['true', 'Two point: FAIL / PASS']])}
                </div>
            </fieldset>
    `;
}

function renderInterfaceSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="basics">
                <legend>Interface</legend>
                <div class="grid">
                    ${select('interfaceLanguage', 'Settings language', settings.interfaceLanguage, [['auto', 'Automatic'], ['en', 'English'], ['ja', '日本語']])}
                    ${themeSegmentedControl(settings.theme)}
                    ${select('popupMode', 'Popup mode', settings.popupMode, [['auto', 'Auto'], ['sheet', 'Bottom sheet'], ['popover', 'Popover']])}
                    ${renderStickyBottomSheetControl(settings)}
                    ${input('popoverWidth', 'Popover width (px)', String(settings.popoverWidth), 'number', { min: 280, max: 900, step: 10 })}
                    ${input('popoverHeight', 'Popover height (px)', String(settings.popoverHeight), 'number', { min: 220, max: 900, step: 10 })}
                    ${select('popoverHeightMode', 'Popover height', settings.popoverHeightMode, [['available', 'Grow to available space'], ['fixed', 'Use height setting']])}
                    ${checkbox('enableLogging', 'Enable console logging', settings.enableLogging)}
                    ${input('accentColor', 'Accent color', sanitizeAccentColor(settings.accentColor), 'color')}
                </div>
                ${renderNewTabSettingsSubsection(settings)}
                ${renderWordColorSettingsSubsection(settings)}
                ${renderPitchColorSettingsSubsection(settings)}
                ${renderColorChannelSettingsSubsection(settings)}
            </fieldset>
    `;
}

function renderStickyBottomSheetControl(settings: ReaderSettings): string {
    const unavailable = settings.popupMode === 'popover';
    return `
                    <div data-sticky-bottom-sheet-field ${unavailable ? 'hidden' : ''}>
                        ${checkbox('stickyBottomSheet', 'Keep bottom sheet open until closed', settings.stickyBottomSheet && !unavailable, { disabled: unavailable })}
                    </div>`;
}

function renderNewTabSettingsSubsection(settings: ReaderSettings): string {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">New tab</div>
                    <div class="grid">
                        ${checkbox('newTabEnabled', 'Use Yomu new tab study page', settings.newTabEnabled)}
                        ${select('newTabSource', 'New tab review source', settings.newTabSource, [['auto', 'Auto: JPDB + Anki'], ['jpdb', 'JPDB'], ['anki', 'Anki'], ['dictionary', 'Dictionary fallback']])}
                        ${select('newTabJpdbReviewMode', 'JPDB review mode', settings.newTabJpdbReviewMode, [['auto', 'Auto: live kanji + API vocabulary'], ['live-review', 'Live JPDB review session'], ['api-vocabulary', 'API vocabulary only']])}
                        ${select('newTabKanjiKeywordSource', 'Kanji keyword source', settings.newTabKanjiKeywordSource, [['auto', 'Auto: RTK, then JPDB, then local'], ['rtk', 'RTK / Heisig'], ['jpdb', 'JPDB'], ['local', 'Local card meaning']])}
                        ${checkbox('newTabParsingEnabled', 'Parse sentences on new tab', settings.newTabParsingEnabled)}
                        ${checkbox('newTabFrontSentenceEnabled', 'Show sentence on word fronts', settings.newTabFrontSentenceEnabled)}
                        ${checkbox('newTabKanjiAutogradeEnabled', 'Autograde kanji drawing', settings.newTabKanjiAutogradeEnabled)}
                        ${checkbox('newTabKanjiAutoSubmit', 'Submit kanji grade after autograde', settings.newTabKanjiAutoSubmit)}
                        ${checkbox('newTabOfflineEnabled', 'Cache new tab for offline use', settings.newTabOfflineEnabled)}
                        ${input('newTabOfflineLimit', 'Offline review cache limit', String(settings.newTabOfflineLimit), 'number', { min: 0, max: 500, step: 10 })}
                        <label>New tab address<input name="newTabUrl" type="text" value="${escapeHtml(NEW_TAB_PAGE_URL)}" readonly autocomplete="off"></label>
                    </div>
                    <div class="jpdb-reader-settings-actions">
                        <a class="jpdb-reader-btn" href="${NEW_TAB_PAGE_URL}" target="_blank" rel="noopener" data-newtab-url-link>Open new tab page</a>
                        <button class="jpdb-reader-btn" type="button" data-action="copy-newtab-url">Copy address</button>
                    </div>
                    <div class="jpdb-reader-help">Use this page as your browser new-tab URL or add it to the iPad Home Screen. Offline caching is eventually consistent: よむ refreshes the next cached review list and card assets when the source is reachable, uses the last good cache while offline, and queues JPDB or Anki grades until the source reconnects.</div>
                </div>
    `;
}

function renderWordColorSettingsSubsection(settings: ReaderSettings): string {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Word colors</div>
                    <div class="grid">
                        ${input('wordColorNew', 'New and suspended', settings.wordColorNew, 'color')}
                        ${input('wordColorLearning', 'Learning', settings.wordColorLearning, 'color')}
                        ${input('wordColorKnown', 'Known and never forget', settings.wordColorKnown, 'color')}
                        ${input('wordColorDue', 'Due', settings.wordColorDue, 'color')}
                        ${input('wordColorFailed', 'Failed', settings.wordColorFailed, 'color')}
                        ${input('wordColorIgnored', 'Ignored and blacklisted', settings.wordColorIgnored, 'color')}
                    </div>
                </div>
    `;
}

function renderPitchColorSettingsSubsection(settings: ReaderSettings): string {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Pitch accent colors</div>
                    <div class="grid">
                        ${input('pitchColorHeiban', 'Heiban (flat)', settings.pitchColorHeiban, 'color')}
                        ${input('pitchColorAtamadaka', 'Atamadaka (head-high)', settings.pitchColorAtamadaka, 'color')}
                        ${input('pitchColorNakadaka', 'Nakadaka (middle-high)', settings.pitchColorNakadaka, 'color')}
                        ${input('pitchColorOdaka', 'Odaka (tail-high)', settings.pitchColorOdaka, 'color')}
                        ${input('pitchColorKifuku', 'Kifuku (variable)', settings.pitchColorKifuku, 'color')}
                        ${input('pitchColorUnknown', 'Unknown / inherited', settings.pitchColorUnknown, 'color')}
                    </div>
                </div>
    `;
}

function renderColorChannelSettingsSubsection(settings: ReaderSettings): string {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Color channels</div>
                    <div class="grid">
                        ${select('wordHighlightColorSource', 'Word highlight color', settingsColorSourceValue(settings, 'wordHighlightColorSource'), COLOR_SOURCE_OPTIONS)}
                        ${select('wordUnderlineColorSource', 'Word underline color', settingsColorSourceValue(settings, 'wordUnderlineColorSource'), COLOR_SOURCE_OPTIONS)}
                        ${select('wordTextColorSource', 'Word text color', settingsColorSourceValue(settings, 'wordTextColorSource'), COLOR_SOURCE_OPTIONS)}
                        ${select('subtitleHighlightColorSource', 'Subtitle highlight color', settingsColorSourceValue(settings, 'subtitleHighlightColorSource'), COLOR_SOURCE_OPTIONS)}
                        ${select('subtitleUnderlineColorSource', 'Subtitle underline color', settingsColorSourceValue(settings, 'subtitleUnderlineColorSource'), COLOR_SOURCE_OPTIONS)}
                        ${select('subtitleTextColorSource', 'Subtitle text color', settingsColorSourceValue(settings, 'subtitleTextColorSource'), COLOR_SOURCE_OPTIONS)}
                    </div>
                    <div class="jpdb-reader-help" data-color-channels-help>Each channel uses the source shown here. Defaults keep page text readable, show mining status in highlights, and keep subtitle status and pitch visible.</div>
                </div>
    `;
}

function settingsColorSourceValue(settings: ReaderSettings, name: ColorSourceSettingName): SelectableReaderColorSource {
    const source = settings[name];
    return source === 'auto' ? DEFAULT_COLOR_SOURCE_VALUES[name] : source;
}

function renderAudioSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="media" hidden>
                <legend>Audio</legend>
                ${checkbox('audioEnabled', 'Enable audio playback for terms', settings.audioEnabled)}
                ${checkbox('autoPlayAudio', 'Auto-play when a word card opens', settings.autoPlayAudio)}
                ${checkbox('audioEnableDefaultSources', 'Use built-in audio sources', settings.audioEnableDefaultSources)}
                ${checkbox('audioFallbackChimeEnabled', 'Play a soft chime when no audio is available', settings.audioFallbackChimeEnabled)}
                <div class="grid">
                    ${select('audioAutoPlayMode', 'Auto-play trigger', settings.audioAutoPlayMode, [['all', 'Hover and tap/click'], ['hover', 'Hover only'], ['tap', 'Tap/click only']])}
                    ${select('audioSelectionMode', 'When several sources or clips exist', settings.audioSelectionMode, [['first', 'First audio'], ['random', 'Random audio']])}
                    ${select('audioTtsMode', 'Text-to-speech handling', settings.audioTtsMode, [['fallback', 'Fallback after recorded audio'], ['source-order', 'Follow source order / random']])}
                    ${input('audioTimeoutMs', 'Audio timeout (ms)', String(settings.audioTimeoutMs), 'number')}
                    ${input('corsProxyUrl', 'Cross-origin proxy URL', settings.corsProxyUrl, 'url', { placeholder: 'https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev' })}
                </div>
                <div class="jpdb-reader-audio-sources" data-source-editor data-audio-source-editor>
                    ${renderAudioSourceEditor(settings.audioSources)}
                </div>
                <div class="jpdb-reader-help">Supports {term}, {reading}, and {language}. The proxy is shared by hosted-page audio and public lookup requests. In fallback mode, JPDB and browser text-to-speech rows are tried only after recorded audio misses. See the <a href="${AUDIO_GUIDE_URL}" target="_blank" rel="noopener">Yomitan audio guide</a>.</div>
            </fieldset>
    `;
}

function renderImmersionKitSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="media" hidden>
                <legend>Immersion Kit</legend>
                <div class="grid">
                    ${checkbox('immersionKitEnabled', 'Show Immersion Kit examples', settings.immersionKitEnabled)}
                    ${select('immersionKitExampleSource', 'Example provider', settings.immersionKitExampleSource, [['immersion-kit', 'Immersion Kit'], ['nadeshiko', 'Nadeshiko'], ['combined', 'Immersion Kit + Nadeshiko']])}
                    ${renderNadeshikoApiKeyField(settings)}
                    ${checkbox('immersionKitShowTranslation', 'Show example translations', settings.immersionKitShowTranslation)}
                    ${checkbox('immersionKitRevealTranslationOnClick', 'Blur example translations until clicked', settings.immersionKitRevealTranslationOnClick, { disabled: !settings.immersionKitShowTranslation })}
                    ${checkbox('immersionKitShowImages', 'Show example thumbnails', settings.immersionKitShowImages)}
                    ${checkbox('immersionKitAutoPlayAudio', 'Play example audio after reveal or next/previous', settings.immersionKitAutoPlayAudio)}
                    ${checkbox('immersionKitPlayOnHover', 'Play example audio when hovering thumbnails', settings.immersionKitPlayOnHover)}
                    ${checkbox('immersionKitPlayOnImageClick', 'Play example audio when clicking thumbnails', settings.immersionKitPlayOnImageClick)}
                    ${select('immersionKitCategory', 'Immersion Kit category', settings.immersionKitCategory, [['all', 'All'], ['anime', 'Anime'], ['drama', 'Drama'], ['games', 'Games']])}
                    ${select('immersionKitSort', 'Example order', settings.immersionKitSort, [['sentence_length:asc', 'Shortest first'], ['sentence_length:desc', 'Longest first']])}
                    ${radioGroup('immersionKitLimitEnabled', 'Examples per word limit', settings.immersionKitLimitEnabled ? 'on' : 'off', [['off', 'All examples'], ['on', 'Limit examples']])}
                    ${input('immersionKitLimit', 'Examples per word', String(settings.immersionKitLimit), 'number', { min: 1, max: 12, step: 1 })}
                    ${input('immersionKitMinLength', 'Minimum sentence length', String(settings.immersionKitMinLength), 'number', { min: 0, max: 120, step: 1 })}
                    ${input('immersionKitMaxLength', 'Maximum sentence length', String(settings.immersionKitMaxLength), 'number', { min: 0, max: 240, step: 1 })}
                    ${input('immersionKitPlaybackRate', 'Example audio speed', String(settings.immersionKitPlaybackRate), 'number', { min: 0.5, max: 2, step: 0.05 })}
                    ${checkbox('immersionKitExactMatch', 'Prefer exact matches', settings.immersionKitExactMatch)}
                </div>
                <div class="jpdb-reader-help">Immersion examples appear inside word popups and on JPDB pages. Blurred translations reveal when you click or tap the translation text.</div>
            </fieldset>
    `;
}

function renderNadeshikoApiKeyField(settings: ReaderSettings): string {
    return `
                    <div data-nadeshiko-api-key-field ${usesNadeshikoExamples(settings.immersionKitExampleSource) ? '' : 'hidden'}>
                        ${input('nadeshikoApiKey', `Nadeshiko API key <a href="${NADESHIKO_DEVELOPER_URL}" target="_blank" rel="noopener">Get a key</a>`, settings.nadeshikoApiKey, 'password')}
                    </div>`;
}

function usesNadeshikoExamples(source: ImmersionExampleSource): boolean {
    return source === 'nadeshiko' || source === 'combined';
}

function renderReaderSettingsPanel(settings: ReaderSettings): string {
    return `
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
                </div>
                <div class="jpdb-reader-help">Hover lookup uses the shortcut below. Leave it blank for plain hover; keep click enabled if you also want tap lookup.</div>
            </fieldset>
    `;
}

function renderKanjiSettingsPanel(settings: ReaderSettings): string {
    return `
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
    `;
}

function renderImageSettingsPanel(settings: ReaderSettings): string {
    const localOcrHidden = settings.ocrProvider === 'local-service' ? '' : 'hidden';
    const cloudOcrHidden = settings.ocrProvider === 'cloud-vision' ? '' : 'hidden';
    return `
            <fieldset data-settings-panel="media" hidden>
                <legend>OCR</legend>
                <div class="grid">
                    ${checkbox('ocrEnabled', 'Read text in images', settings.ocrEnabled)}
                    ${checkbox('ocrAutoScanImages', 'Read images automatically', settings.ocrAutoScanImages)}
                    ${checkbox('ocrShowTextOverlay', 'Show recognized text on images', settings.ocrShowTextOverlay)}
                    ${select('ocrProvider', 'Image reading', settings.ocrProvider, [['google-lens', 'Google Lens (recommended)'], ['cloud-vision', 'Google Cloud Vision'], ['local-service', 'Local OCR engine'], ['off', 'Off']])}
                    ${select('ocrMaxImagesPerPage', 'Images to read per page', String(settings.ocrMaxImagesPerPage), [['3', 'Light'], ['8', 'Normal'], ['16', 'More']])}
                    ${select('ocrMinImageArea', 'Smallest image to read', String(settings.ocrMinImageArea), [['80000', 'Large images only'], ['45000', 'Normal'], ['15000', 'Include small images']])}
                    ${select('ocrMaxImagePixels', 'Image detail', String(settings.ocrMaxImagePixels), [['640000', 'Faster'], ['1200000', 'Balanced'], ['2000000', 'Sharper']])}
                    ${input('ocrTextColor', 'Image text color', settings.ocrTextColor, 'color')}
                    ${input('ocrOutlineColor', 'Image text outline', settings.ocrOutlineColor, 'color')}
                    ${input('ocrBackgroundColor', 'Image highlight background', settings.ocrBackgroundColor, 'color')}
                    ${input('ocrBackgroundOpacity', 'Image highlight opacity', String(settings.ocrBackgroundOpacity), 'number')}
                    ${input('ocrFontScale', 'Image text scale', String(settings.ocrFontScale), 'number')}
                    <div data-local-ocr ${localOcrHidden}>${select('ocrEngine', 'Local OCR engine', settings.ocrEngine, [['auto', 'Automatic'], ['MangaOCR', 'MangaOCR'], ['PaddleOCR', 'PaddleOCR'], ['AppleVision', 'Apple Vision']])}</div>
                    <details data-local-ocr ${localOcrHidden}>
                        <summary>Custom local OCR server</summary>
                        <label>Custom local OCR URL<input name="ocrEndpointUrl" type="url" value="${escapeHtml(settings.ocrEndpointUrl)}" placeholder="http://127.0.0.1:7331/ocr" autocomplete="off"></label>
                    </details>
                    <label data-cloud-ocr ${cloudOcrHidden}>Cloud Vision API key<input name="ocrCloudVisionApiKey" type="password" value="${escapeHtml(settings.ocrCloudVisionApiKey)}" autocomplete="off"></label>
                    <input type="hidden" name="ocrLanguage" value="${escapeHtml(settings.ocrLanguage)}">
                    <input type="hidden" name="ocrPrefetchMargin" value="${settings.ocrPrefetchMargin}">
                </div>
                <div class="jpdb-reader-help">Images are read quietly near the viewport. Google Lens handles normal images by default; Cloud Vision can be used with an API key, and embedded OCR metadata is instant. Recognized areas stay transparent until you tap or hover.</div>
            </fieldset>
    `;
}

function renderVideoSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="media" hidden>
                <legend>Video</legend>
                <div class="grid">
                    ${checkbox('subtitlePlayerEnabled', 'Enable video subtitle player', settings.subtitlePlayerEnabled)}
                    ${checkbox('subtitleAutoDetect', 'Auto-detect page subtitles', settings.subtitleAutoDetect)}
                    ${checkbox('subtitleOverlayVisible', 'Show subtitle overlay', settings.subtitleOverlayVisible)}
                    ${checkbox('subtitleSecondaryVisible', 'Show native subtitles when available', settings.subtitleSecondaryVisible)}
                    ${checkbox('subtitleNativeBlurred', 'Blur native subtitles until hover', settings.subtitleNativeBlurred)}
                    ${checkbox('subtitleKaraokeMode', 'Karaoke word timing', settings.subtitleKaraokeMode)}
                    ${checkbox('subtitleTranscriptVisible', 'Open transcript panel by default', settings.subtitleTranscriptVisible)}
                    ${checkbox('subtitleTranscriptAutoScroll', 'Scroll transcript with playback', settings.subtitleTranscriptAutoScroll)}
                    ${checkbox('subtitleAutoCopyLine', 'Auto-copy each subtitle line as it plays', settings.subtitleAutoCopyLine)}
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
                </div>
                ${renderSubtitlePreview()}
            </fieldset>
    `;
}

function renderSubtitlePreview(): string {
    return `
                <div class="jpdb-reader-subtitle-preview" data-subtitle-preview>
                    <div class="jpdb-subtitle-primary">
                        <span class="jpdb-reader-word jpdb-new jpdb-pitch-heiban" data-settings-preview-lookup="新しい" data-sentence="新しい言葉を読む" tabindex="0">新しい</span>
                        <span class="jpdb-reader-word jpdb-learning jpdb-pitch-atamadaka" data-settings-preview-lookup="言葉" data-sentence="新しい言葉を読む" tabindex="0">言葉</span>
                        <span class="jpdb-reader-word jpdb-known jpdb-pitch-nakadaka" data-settings-preview-lookup="を" data-sentence="新しい言葉を読む" tabindex="0">を</span>
                        <span class="jpdb-reader-word jpdb-due jpdb-pitch-odaka" data-settings-preview-lookup="読む" data-sentence="新しい言葉を読む" tabindex="0">読む</span>
                    </div>
                    <div class="jpdb-subtitle-secondary">Live subtitle preview</div>
                </div>
    `;
}

function renderYoutubeSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="media" hidden>
                <legend>YouTube</legend>
                <div class="grid">
                    ${checkbox('youtubeImmersionEnabled', 'Only show Japanese-looking YouTube videos', settings.youtubeImmersionEnabled)}
                    ${checkbox('youtubeShowFilterNotice', 'Show reveal control for hidden videos', settings.youtubeShowFilterNotice)}
                </div>
                <div class="jpdb-reader-help" data-youtube-help>Off by default. Turn it on when you want YouTube recommendations, search, and sidebars to stay focused on Japanese-looking video cards.</div>
            </fieldset>
    `;
}

function renderMiningSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="mining" hidden>
                <legend>Anki</legend>
                <div class="grid">
                    ${checkbox('ankiEnabled', 'Enable Anki mining', settings.ankiEnabled)}
                    ${checkbox('ankiMineWithJpdb', 'Also add to Anki when adding to JPDB', settings.jpdbMiningEnabled && settings.ankiMineWithJpdb, { disabled: !settings.jpdbMiningEnabled })}
                    ${checkbox('ankiCaptureScreenshot', 'Attach context image when possible', settings.ankiCaptureScreenshot)}
                    ${checkbox('ankiMobileHandoff', 'Use mobile Anki handoff when AnkiConnect is unavailable', settings.ankiMobileHandoff)}
                    ${input('ankiConnectUrl', 'AnkiConnect URL', settings.ankiConnectUrl)}
                    ${input('ankiDeck', 'Anki deck', settings.ankiDeck)}
                    ${input('ankiModel', 'Anki note type', settings.ankiModel)}
                    ${select('ankiTemplateMode', 'Anki card template', settings.ankiTemplateMode, [['recognition', 'Word first'], ['context', 'Sentence first']])}
                    ${checkbox('ankiFrontReading', 'Word-first front: show reading', settings.ankiFrontReading)}
                    ${checkbox('ankiFrontSentence', 'Word-first front: show sentence', settings.ankiFrontSentence)}
                    ${checkbox('ankiFrontImage', 'Show image on front', settings.ankiFrontImage)}
                    ${input('ankiTags', 'Tags', settings.ankiTags)}
                </div>
                <div class="jpdb-reader-settings-actions jpdb-reader-settings-actions-single">
                    <button class="jpdb-reader-btn" type="button" data-action="test-anki">Test Anki</button>
                </div>
                <div class="jpdb-reader-help jpdb-reader-status-line" data-anki-status role="status" aria-live="polite">Anki uses AnkiConnect on this device. The default creates a small Yomu note type automatically.</div>
                <div data-anki-template-preview>
                    ${renderAnkiTemplatePreview(settings)}
                </div>
            </fieldset>
    `;
}

function renderDictionariesSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="dictionaries" hidden>
                <legend>Dictionaries</legend>
                <div class="grid">
                    ${checkbox('jpdbDefinitionsEnabled', 'Show JPDB definitions', settings.jpdbDefinitionsEnabled)}
                    ${checkbox('localDictionariesEnabled', 'Show imported dictionary definitions', settings.localDictionariesEnabled)}
                    ${checkbox('dictionarySourcesInitiallyExpanded', 'Open popup sources by default', settings.dictionarySourcesInitiallyExpanded)}
                    ${input('localDictionaryMaxResults', 'Dictionary result limit', String(settings.localDictionaryMaxResults), 'number')}
                </div>
                <div class="jpdb-reader-dictionary-status" data-dictionary-status>Checking imported dictionaries...</div>
                <div class="jpdb-reader-dictionary-priorities" data-source-editor>
                    ${renderDictionarySourceRows(settings)}
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Lookup pills</div>
                    <div class="jpdb-reader-help">These small buttons open the current word in an external dictionary. Use {query} for normal search URLs; it fills in the current word. {word} and {reading} are available for sites that need them separately.</div>
                    <div class="jpdb-reader-lookup-links" data-source-editor>
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
    `;
}

function renderShortcutSettingsPanel(settings: ReaderSettings): string {
    return `
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
                <div class="jpdb-reader-help" data-hover-shortcut-help>This shortcut only opens hover lookups when Hover scanned words is enabled in Reader settings.</div>
            </fieldset>
    `;
}

function renderHelpSettingsPanel(): string {
    return `
            <fieldset data-settings-panel="help" hidden>
                <legend>Help</legend>
                ${renderHelpLinksPanel()}
                ${renderHelpGlossaryPanel()}
            </fieldset>
    `;
}

function renderSettingsFooter(): string {
    return `
            <div class="footer">
                <div class="jpdb-reader-settings-save-status" data-settings-save-status role="status" aria-live="polite" hidden></div>
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

export function checkbox(name: string, label: string, checked: boolean, attributes: Record<string, boolean> = {}): string {
    const attributeHtml = Object.entries(attributes)
        .filter(([, value]) => value)
        .map(([key]) => ` ${key}`)
        .join('');
    return `<label class="inline"><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}${attributeHtml}>${label}</label>`;
}

export function select(name: string, label: string, value: string, options: [string, string][]): string {
    return `<label>${label}<select name="${name}">${options.map(([optionValue, text]) =>
        `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(text)}</option>`,
    ).join('')}</select></label>`;
}

function radioGroup(name: string, label: string, value: string, options: [string, string][]): string {
    return `<fieldset class="jpdb-reader-radio-group"><legend>${label}</legend>${options.map(([optionValue, text]) =>
        `<label class="inline"><input name="${name}" type="radio" value="${escapeHtml(optionValue)}" ${optionValue === value ? 'checked' : ''}>${escapeHtml(text)}</label>`,
    ).join('')}</fieldset>`;
}

function themeSegmentedControl(value: ReaderSettings['theme']): string {
    const isLight = value === 'light';
    return `
        <label class="jpdb-reader-theme-field" data-theme-field>
            <span class="jpdb-reader-theme-title" id="jpdb-reader-theme-label" data-theme-title>Theme</span>
            <input type="hidden" name="theme" value="${escapeHtml(value)}" data-theme-value>
            <div class="VPNavBarAppearance appearance jpdb-reader-theme-appearance">
                <button class="VPSwitch VPSwitchAppearance jpdb-reader-theme-switch" type="button" role="switch" data-theme-switch data-newtab-action="theme" aria-label="${isLight ? 'Switch to dark theme' : 'Switch to light theme'}" aria-checked="${isLight}" title="${isLight ? 'Switch to dark theme' : 'Switch to light theme'}">
                    <span class="check">
                        <span class="icon">
                            <span class="vpi-sun sun" aria-hidden="true"></span>
                            <span class="vpi-moon moon" aria-hidden="true"></span>
                        </span>
                    </span>
                </button>
            </div>
        </label>
    `;
}

export function getFormInterfaceLanguage(form: HTMLFormElement, fallback: InterfaceLanguage): InterfaceLanguage {
    const value = getNamedControl<HTMLSelectElement>(form, 'interfaceLanguage')?.value;
    return value === 'auto' || value === 'en' || value === 'ja' ? value : fallback;
}

export function localizeSettingsForm(form: HTMLFormElement, language: InterfaceLanguage): void {
    const text = (key: Parameters<typeof uiText>[1]) => uiText(language, key);
    localizeSettingsShell(form, language, text);
    localizeSettingsLabels(form, text);
    localizeSettingsSectionTitles(form, text);
    localizeSettingsSelects(form, text);
    localizeSettingsShortcuts(form, text);
    localizeSettingsHelpText(form, text);
    localizeSettingsActions(form, text);
    localizeSettingsEditorChrome(form, text);
    localizeHelpLinksPanel(form, language);
}

type SettingsText = (key: Parameters<typeof uiText>[1]) => string;
type SettingsTextKey = Parameters<typeof uiText>[1];

function localizeSettingsShell(form: HTMLFormElement, language: InterfaceLanguage, text: SettingsText): void {
    form.lang = resolveUiLanguage(language);
    form.setAttribute('aria-label', text('settingsTitle'));
    form.querySelector('h2')?.replaceChildren(text('settingsTitle'));
    form.querySelector<HTMLElement>('.jpdb-reader-settings-tabs')?.setAttribute('aria-label', text('settingsSections'));
    localizeThemeSwitch(form, text);
    localizeSettingsTabs(form, text);
    localizeSettingsLegends(form, text);
}

function localizeThemeSwitch(form: HTMLFormElement, text: SettingsText): void {
    const switchButton = form.querySelector<HTMLButtonElement>('[data-theme-switch]');
    if (!switchButton) return;
    const isLight = switchButton.getAttribute('aria-checked') === 'true';
    const label = isLight ? text('switchToDarkTheme') : text('switchToLightTheme');
    switchButton.setAttribute('aria-label', label);
    switchButton.title = label;
}

function localizeSettingsTabs(form: HTMLFormElement, text: SettingsText): void {
    const tabLabels: Record<string, SettingsTextKey> = {
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
}

function localizeSettingsLegends(form: HTMLFormElement, text: SettingsText): void {
    const fieldsets = getSettingsPanelFieldsets(form);
    [
        'JPDB',
        text('interface'),
        text('audio'),
        text('immersionKit'),
        text('reader'),
        text('kanji'),
        text('images'),
        text('video'),
        text('youTube'),
        text('anki'),
        text('dictionaries'),
        text('shortcuts'),
        text('help'),
    ].forEach((label, index) => {
        const legend = directFieldsetLegend(fieldsets[index]);
        legend?.replaceChildren(label);
    });
}

function localizeSettingsLabels(form: HTMLFormElement, text: SettingsText): void {
    settingsControlLabelKeys().forEach(([name, key]) => setControlLabel(form, name, text(key)));
    const jpdbSettings = form.querySelector<HTMLAnchorElement>('label a[href*="jpdb.io/settings"]');
    if (jpdbSettings) jpdbSettings.textContent = text('jpdbSettings');
    const nadeshikoKeyLink = form.querySelector<HTMLAnchorElement>('label a[href*="nadeshiko.co/user/developer"]');
    if (nadeshikoKeyLink) nadeshikoKeyLink.textContent = text('getNadeshikoKey');
    localizeBlockControlLabel(form, 'ocrEndpointUrl', text('ocrEndpointUrl'));
    localizeBlockControlLabel(form, 'ocrCloudVisionApiKey', text('cloudVisionApiKey'));
}

function localizeBlockControlLabel(form: HTMLFormElement, name: string, label: string): void {
    const labelElement = getNamedControl<HTMLInputElement>(form, name)?.closest('label');
    if (labelElement) setBlockLabelText(labelElement, label);
}

function localizeSettingsSectionTitles(form: HTMLFormElement, text: SettingsText): void {
    replaceLocalTitle(form, /Word colors|単語の色/, text('wordColors'));
    replaceLocalTitle(form, /Pitch accent colors|ピッチアクセント/, text('pitchAccentColors'));
    replaceLocalTitle(form, /Color channels|色チャンネル/, text('colorChannels'));
    replaceLocalTitle(form, /New tab|新規タブ/, text('newTab'));
    replaceLocalTitle(form, /Lookup pills|検索ピル/, text('lookupPills'));
    form.querySelector<HTMLElement>('[data-color-channels-help]')?.replaceChildren(text('colorChannelsHelp'));
    form.querySelector<HTMLElement>('[data-subtitle-preview] .jpdb-subtitle-secondary')?.replaceChildren(text('subtitlePreview'));
}

function replaceLocalTitle(form: HTMLFormElement, pattern: RegExp, value: string): void {
    const title = Array.from(form.querySelectorAll<HTMLElement>('.jpdb-reader-local-title'))
        .find(element => pattern.test(element.textContent ?? ''));
    title?.replaceChildren(value);
}

function localizeSettingsSelects(form: HTMLFormElement, text: SettingsText): void {
    localizeBasicSettingsSelects(form, text);
    localizeColorAndReaderSelects(form, text);
    localizeMediaSettingsSelects(form, text);
    localizeMiningSettingsSelects(form, text);
}

function localizeBasicSettingsSelects(form: HTMLFormElement, text: SettingsText): void {
    setSelectOptionLabels(form, 'interfaceLanguage', [
        ['auto', text('automatic')],
        ['en', text('english')],
        ['ja', text('japanese')],
    ]);
    form.querySelector<HTMLElement>('[data-theme-title]')?.replaceChildren(text('theme'));
    setSelectOptionLabels(form, 'popupMode', [
        ['auto', text('auto')],
        ['sheet', text('bottomSheet')],
        ['popover', text('popover')],
    ]);
    setSelectOptionLabels(form, 'popoverHeightMode', [
        ['available', text('popoverHeightAvailable')],
        ['fixed', text('popoverHeightFixed')],
    ]);
    setSelectOptionLabels(form, 'newTabSource', [
        ['auto', text('newTabAuto')],
        ['jpdb', 'JPDB'],
        ['anki', 'Anki'],
        ['dictionary', text('dictionaryFallback')],
    ]);
    setSelectOptionLabels(form, 'newTabJpdbReviewMode', [
        ['auto', text('newTabJpdbReviewAuto')],
        ['live-review', text('newTabLiveReview')],
        ['api-vocabulary', text('newTabApiVocabulary')],
    ]);
    setSelectOptionLabels(form, 'newTabKanjiKeywordSource', [
        ['auto', text('newTabKanjiKeywordAuto')],
        ['rtk', text('newTabKanjiKeywordRtk')],
        ['jpdb', 'JPDB'],
        ['local', text('newTabKanjiKeywordLocal')],
    ]);
    setSelectOptionLabels(form, 'twoButtonReviews', [
        ['false', text('fivePoint')],
        ['true', text('twoPoint')],
    ]);
}

function localizeColorAndReaderSelects(form: HTMLFormElement, text: SettingsText): void {
    localizeColorSourceSelects(form, text);
    setSelectOptionLabels(form, 'furiganaMode', [
        ['auto', text('automatic')],
        ['difficult-kanji', text('furiganaDifficultKanji')],
        ['known-status', text('furiganaHideKnown')],
        ['all', text('furiganaAllParsed')],
        ['off', text('off')],
    ]);
}

function localizeColorSourceSelects(form: HTMLFormElement, text: SettingsText): void {
    [
        'wordHighlightColorSource',
        'wordUnderlineColorSource',
        'wordTextColorSource',
        'subtitleHighlightColorSource',
        'subtitleUnderlineColorSource',
        'subtitleTextColorSource',
    ].forEach(name => setSelectOptionLabels(form, name, [
        ['status', text('colorSourceStatus')],
        ['jpdb', text('colorSourceJpdb')],
        ['anki', text('colorSourceAnki')],
        ['pitch', text('colorSourcePitch')],
        ['off', text('off')],
    ]));
}

function localizeMediaSettingsSelects(form: HTMLFormElement, text: SettingsText): void {
    setSelectOptionLabels(form, 'audioAutoPlayMode', [
        ['all', text('audioAutoPlayAll')],
        ['hover', text('audioAutoPlayHover')],
        ['tap', text('audioAutoPlayTap')],
    ]);
    setSelectOptionLabels(form, 'audioSelectionMode', [
        ['first', text('firstAudio')],
        ['random', text('randomAudio')],
    ]);
    setSelectOptionLabels(form, 'audioTtsMode', [
        ['fallback', text('audioTtsFallback')],
        ['source-order', text('audioTtsSourceOrder')],
    ]);
    setSelectOptionLabels(form, 'immersionKitCategory', [
        ['all', text('allCategories')],
        ['anime', text('anime')],
        ['drama', text('drama')],
        ['games', text('games')],
    ]);
    setSelectOptionLabels(form, 'immersionKitExampleSource', [
        ['immersion-kit', 'Immersion Kit'],
        ['nadeshiko', 'Nadeshiko'],
        ['combined', text('immersionKitAndNadeshiko')],
    ]);
    setSelectOptionLabels(form, 'immersionKitSort', [
        ['sentence_length:asc', text('shortestFirst')],
        ['sentence_length:desc', text('longestFirst')],
    ]);
    localizeOcrSettingsSelects(form, text);
    setSelectOptionLabels(form, 'subtitleControlsMode', [
        ['auto', text('showWhenNeeded')],
        ['hidden', text('hideControls')],
        ['always', text('alwaysVisible')],
    ]);
}

function localizeOcrSettingsSelects(form: HTMLFormElement, text: SettingsText): void {
    setSelectOptionLabels(form, 'ocrProvider', [
        ['google-lens', text('googleLens')],
        ['cloud-vision', text('cloudVision')],
        ['local-service', text('localOcr')],
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
}

function localizeMiningSettingsSelects(form: HTMLFormElement, text: SettingsText): void {
    setSelectOptionLabels(form, 'ankiTemplateMode', [
        ['recognition', text('wordFirst')],
        ['context', text('sentenceFirst')],
    ]);
}

function localizeSettingsShortcuts(form: HTMLFormElement, text: SettingsText): void {
    setShortcutPlaceholder(form, 'shortcuts.hoverLookup', text('blankPlainHover'));
    form.querySelector<HTMLElement>('[data-hover-shortcut-help]')?.replaceChildren(text('hoverShortcutHelp'));
    form.querySelectorAll<HTMLInputElement>('[data-shortcut-input]').forEach(inputEl => {
        if (inputEl.name !== 'shortcuts.hoverLookup') inputEl.placeholder = text('pressKeys');
    });
    const immersionLimitLegend = getNamedControl<HTMLInputElement>(form, 'immersionKitLimitEnabled')
        ?.closest<HTMLFieldSetElement>('.jpdb-reader-radio-group')
        ?.querySelector('legend');
    immersionLimitLegend?.replaceChildren(text('immersionKitLimitEnabled'));
    setRadioLabel(form, 'immersionKitLimitEnabled', 'off', text('allExamples'));
    setRadioLabel(form, 'immersionKitLimitEnabled', 'on', text('limitExamples'));
}

function localizeSettingsHelpText(form: HTMLFormElement, text: SettingsText): void {
    setFieldsetHelp(form, 1, text('interfaceHelp'));
    setFieldsetHelp(form, 3, text('immersionKitHelp'));
    setFieldsetHelp(form, 4, text('readerHelp'));
    setFieldsetHelp(form, 5, text('kanjiHelp'));
    setFieldsetHelp(form, 6, text('ocrHelp'));
    form.querySelector<HTMLElement>('[data-youtube-help]')?.replaceChildren(text('youtubeHelp'));
    setFieldsetHelp(form, 9, text('ankiHelp'));
    localizeNewTabHelp(form, text);
    localizeAudioHelp(form, text);
    localizeDictionaryImportHelp(form, text);
    localizeLookupPillsHelp(form, text);
    form.querySelector<HTMLElement>('details[data-local-ocr] > summary')?.replaceChildren(text('ocrCustomLocalServer'));
}

function localizeNewTabHelp(form: HTMLFormElement, text: SettingsText): void {
    const subsection = getNamedControl<HTMLInputElement>(form, 'newTabUrl')?.closest<HTMLElement>('.jpdb-reader-settings-subsection');
    subsection?.querySelector<HTMLElement>(':scope > .jpdb-reader-help')?.replaceChildren(text('newTabOfflineHelp'));
}

function localizeAudioHelp(form: HTMLFormElement, text: SettingsText): void {
    const audioHelp = getFieldsetHelp(form, 2);
    if (!audioHelp) return;
    const copy = text('audioHelp')
        .replace('Yomitan audio guide.', '')
        .replace('Yomitan音声ガイドも参照できます。', '');
    const linkLabel = resolveUiLanguageFromText(text) === 'ja' ? 'Yomitan音声ガイド' : 'Yomitan audio guide';
    setInnerHtml(audioHelp, `${escapeHtml(copy)}<a href="${AUDIO_GUIDE_URL}" target="_blank" rel="noopener">${escapeHtml(linkLabel)}</a>.`);
}

function resolveUiLanguageFromText(text: SettingsText): 'en' | 'ja' {
    return text('save') === '保存' ? 'ja' : 'en';
}

function localizeLookupPillsHelp(form: HTMLFormElement, text: SettingsText): void {
    const lookupLinks = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links');
    lookupLinks?.closest<HTMLElement>('.jpdb-reader-settings-subsection')
        ?.querySelector<HTMLElement>(':scope > .jpdb-reader-help')
        ?.replaceChildren(text('lookupPillsHelp'));
}

function localizeDictionaryImportHelp(form: HTMLFormElement, text: SettingsText): void {
    const importStatus = form.querySelector<HTMLElement>('[data-import-status]');
    if (importStatus && /Import Yomitan|Yomitan設定/.test(importStatus.textContent ?? '')) importStatus.textContent = text('dictionaryImportHelp');
}

function localizeSettingsActions(form: HTMLFormElement, text: SettingsText): void {
    form.querySelector<HTMLButtonElement>('[data-action="test-anki"]')?.replaceChildren(text('testAnki'));
    form.querySelector<HTMLButtonElement>('[data-action="copy-newtab-url"]')?.replaceChildren(text('copyAddress'));
    form.querySelector<HTMLAnchorElement>('[data-newtab-url-link]')?.replaceChildren(text('openNewTabPage'));
    form.querySelector<HTMLButtonElement>('[data-action="import-yomitan-settings"]')?.replaceChildren(text('importSettings'));
    form.querySelector<HTMLButtonElement>('[data-action="export-reader-settings"]')?.replaceChildren(text('exportSettings'));
    form.querySelector<HTMLButtonElement>('[data-action="import-yomitan-dictionary"]')?.replaceChildren(text('importDictionaries'));
    form.querySelector<HTMLButtonElement>('[data-action="export-yomitan-dictionary"]')?.replaceChildren(text('exportDictionaries'));
    form.querySelector<HTMLButtonElement>('[data-action="audio-source-add"]')?.replaceChildren(text('addAudioSource'));
    form.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.replaceChildren(text('cancel'));
    form.querySelector<HTMLButtonElement>('button[type="submit"]')?.replaceChildren(text('save'));
    localizePreviewAudioButtons(form, text);
}

function localizePreviewAudioButtons(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLButtonElement>('[data-action="preview-audio"]').forEach(button => {
        button.title = text('previewAudio');
        button.setAttribute('aria-label', text('previewAudio'));
    });
}

function localizeSettingsEditorChrome(form: HTMLFormElement, text: SettingsText): void {
    const audioHead = form.querySelectorAll('.jpdb-reader-audio-source-head span');
    audioHead[0]?.replaceChildren(text('enabledHeader'));
    audioHead[1]?.replaceChildren(text('audioSource'));
    audioHead[2]?.replaceChildren(text('urlVoice'));
    audioHead[3]?.replaceChildren(text('orderHeader'));
    audioHead[4]?.replaceChildren(text('removeHeader'));
    form.querySelector<HTMLButtonElement>('[data-action="lookup-link-add"]')?.replaceChildren(text('add'));
    form.querySelector('.jpdb-reader-recommended-title')?.replaceChildren(text('recommendedDownloads'));
    form.querySelector('[data-recommended-dictionary-help]')?.replaceChildren(text('dictionaryInstallQueueHelp'));
    form.querySelectorAll<HTMLAnchorElement>('.jpdb-reader-recommended-name a').forEach(link => { link.textContent = text('homepage'); });
    localizeOrderButtons(form, text);
    localizeLookupLinkEditor(form, text);
    localizeDeckControls(form, text);
    localizeSourceRows(form, text);
    localizeRecommendedDictionaryGroups(form, text);
    localizeRecommendedDictionaryDescriptions(form, text);
    localizeAnkiTemplatePreview(form, text);
    localizeAudioSourceFields(form, text);
    localizeRecommendedDictionaryButtons(form, text);
    localizeDictionaryStatus(form, text);
}

function localizeOrderButtons(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLButtonElement>('[data-source-drag-handle]').forEach(button => setButtonTitle(button, text('dragToReorder')));
    form.querySelectorAll<HTMLButtonElement>('[data-action$="-up"]').forEach(button => setButtonTitle(button, text('moveUp')));
    form.querySelectorAll<HTMLButtonElement>('[data-action$="-down"]').forEach(button => setButtonTitle(button, text('moveDown')));
    form.querySelectorAll<HTMLButtonElement>('[data-action$="-remove"]').forEach(button => setButtonTitle(button, text('remove')));
    form.querySelectorAll<HTMLButtonElement>('[data-action="delete-yomitan-dictionary"]').forEach(button => setButtonTitle(button, text('removeImportedDictionary')));
}

function setButtonTitle(button: HTMLButtonElement, label: string): void {
    button.title = label;
    button.setAttribute('aria-label', label);
}

function localizeLookupLinkEditor(form: HTMLFormElement, text: SettingsText): void {
    const lookupHead = form.querySelectorAll('.jpdb-reader-lookup-link-head span');
    lookupHead[0]?.replaceChildren(text('enabledHeader'));
    lookupHead[1]?.replaceChildren(text('labelHeader'));
    lookupHead[2]?.replaceChildren(text('lookupUrlTemplate'));
    lookupHead[3]?.replaceChildren(text('orderHeader'));
    lookupHead[4]?.replaceChildren(text('removeHeader'));
    form.querySelectorAll<HTMLElement>('.jpdb-reader-lookup-link-note').forEach(note => note.replaceChildren(text('copiesCurrentWord')));
    form.querySelectorAll<HTMLElement>('.jpdb-reader-lookup-link-fixed').forEach(note => note.setAttribute('aria-label', text('builtInAction')));
    form.querySelectorAll<HTMLInputElement>('input[name^="dictionaryLookupLinks."][name$=".label"]').forEach((input, index) => {
        input.setAttribute('aria-label', text('lookupPillLabelNumber').replace('{number}', String(index + 1)));
    });
    form.querySelectorAll<HTMLInputElement>('input[name^="dictionaryLookupLinks."][name$=".urlTemplate"]').forEach((input, index) => {
        input.setAttribute('aria-label', text('lookupUrlTemplateNumber').replace('{number}', String(index + 1)));
    });
    form.querySelectorAll<HTMLElement>('.jpdb-reader-lookup-link-row .jpdb-reader-row-order-tools').forEach(row => {
        row.setAttribute('aria-label', text('lookupPillOrder'));
    });
}

function localizeDeckControls(form: HTMLFormElement, text: SettingsText): void {
    setSelectOptionLabels(form, 'newTabJpdbDeck', [
        ['all', text('allStudyDecks')],
        ['never-forget', text('never')],
    ]);
    const deckHelp = form.querySelector<HTMLElement>('[data-jpdb-decks] .jpdb-reader-help');
    if (!deckHelp) return;
    const content = deckHelp.textContent ?? '';
    if (/Decks are loaded|JPDBアカウント/.test(content)) deckHelp.replaceChildren(text('decksLoaded'));
    else if (/Could not load decks|まだデッキ/.test(content)) deckHelp.replaceChildren(text('decksUnavailable'));
    else if (/Add your JPDB API key|JPDB APIキー/.test(content)) deckHelp.replaceChildren(text('addApiKeyChooseDecks'));
}

function localizeSourceRows(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll('.jpdb-reader-dictionary-head').forEach(head => localizeSourceHead(head, text));
    replaceSourceHelp(form, /Import Yomitan dictionaries|Yomitan辞書をインポート/, text('importLocalDefinitionsHelp'));
    replaceSourceHelp(form, /Frequency, pitch, and kanji metadata|頻度、ピッチ、漢字メタデータ/, text('frequencyMetadataHelp'));
    const rows: Array<[string, SettingsTextKey, SettingsTextKey]> = [
        ['Translation', 'sourceNameTranslation', 'sourceHelpTranslation'],
        ['Grammar', 'sourceNameGrammar', 'sourceHelpGrammar'],
        ['Stroke practice', 'sourceNameStrokePractice', 'sourceHelpStrokePractice'],
        ['Readings and components', 'readingsComponents', 'sourceHelpReadingsComponents'],
        ['Imported kanji dictionaries', 'sourceNameImportedKanjiDictionaries', 'sourceHelpImportedKanjiDictionaries'],
        ['Words using this kanji', 'sourceNameWordsUsingKanji', 'sourceHelpWordsUsingKanji'],
        ['Component graph', 'originStructure', 'sourceHelpComponentGraph'],
    ];
    rows.forEach(([sourceName, nameKey, helpKey]) => {
        form.querySelectorAll<HTMLElement>('[data-dictionary-source-row]').forEach(row => {
            const display = row.querySelector<HTMLElement>('.jpdb-reader-field-display');
            if (display?.textContent === sourceName) display.replaceChildren(text(nameKey));
            const help = row.querySelector<HTMLElement>('.jpdb-reader-dictionary-row-help');
            if (help && sourceRowHelpMatches(help.textContent ?? '', sourceName)) help.replaceChildren(text(helpKey));
        });
    });
    replaceSourceHelp(form, /JPDB meanings shown/, text('sourceHelpJpdb'));
    replaceSourceHelp(form, /Example sentences, images, and audio/, text('sourceHelpImmersionKit'));
    replaceSourceHelp(form, /Remembering the Kanji/, text('sourceHelpRtk'));
    replaceSourceHelp(form, /Uchisen mnemonic/, text('sourceHelpUchisen'));
    replaceSourceHelp(form, /Imported Yomitan kanji dictionary/, text('sourceHelpImportedKanjiDictionary'));
}

function localizeSourceHead(head: Element, text: SettingsText): void {
    const spans = head.querySelectorAll('span');
    spans[0]?.replaceChildren(text('enabledHeader'));
    const sourceLabel = spans[1]?.textContent === 'Kanji section' ? text('kanjiSection') : text('definitionSource');
    spans[1]?.replaceChildren(sourceLabel);
    if (spans.length === 5) {
        spans[2]?.replaceChildren(text('displayName'));
        spans[3]?.replaceChildren(text('orderHeader'));
        spans[4]?.replaceChildren(text('removeHeader'));
    } else {
        spans[2]?.replaceChildren(text('orderHeader'));
    }
}

function replaceSourceHelp(form: HTMLFormElement, pattern: RegExp, value: string): void {
    form.querySelectorAll<HTMLElement>('.jpdb-reader-help, .jpdb-reader-dictionary-row-help').forEach(help => {
        if (pattern.test(help.textContent ?? '')) help.replaceChildren(value);
    });
}

function sourceRowHelpMatches(value: string, sourceName: string): boolean {
    return value.includes(sourceName) || value.includes('Automatic') || value.includes('Stroke') || value.includes('Kanji entries') || value.includes('Related');
}

function localizeRecommendedDictionaryGroups(form: HTMLFormElement, text: SettingsText): void {
    const labels = [text('termDictionaries'), text('kanjiDictionaries'), text('frequencyDictionaries')];
    form.querySelectorAll<HTMLElement>('.jpdb-reader-recommended-group-title').forEach((title, index) => {
        if (labels[index]) title.replaceChildren(labels[index]);
    });
}

function localizeRecommendedDictionaryDescriptions(form: HTMLFormElement, text: SettingsText): void {
    RECOMMENDED_JAPANESE_DICTIONARIES.forEach(dictionary => {
        const button = form.querySelector<HTMLButtonElement>(`[data-action="download-recommended-dictionary"][data-dictionary-id="${dictionary.id}"]`);
        button?.closest<HTMLElement>('.jpdb-reader-recommended-item')
            ?.querySelector<HTMLElement>('.jpdb-reader-help')
            ?.replaceChildren(text(dictionary.descriptionKey));
    });
}

function localizeAnkiTemplatePreview(form: HTMLFormElement, text: SettingsText): void {
    const preview = form.querySelector<HTMLElement>('.jpdb-reader-template-preview');
    if (!preview) return;
    const contextMode = getNamedControl<HTMLSelectElement>(form, 'ankiTemplateMode')?.value === 'context';
    preview.querySelector<HTMLElement>('.jpdb-reader-template-preview-title')?.replaceChildren(text(contextMode ? 'sentenceFirstPreset' : 'wordFirstPreset'));
    const headings = preview.querySelectorAll('strong');
    headings[0]?.replaceChildren(text('front'));
    headings[1]?.replaceChildren(text('back'));
    preview.querySelector<HTMLElement>('.jpdb-reader-template-meaning')?.replaceChildren(text('exampleMeaning'));
    preview.querySelectorAll('small').forEach(small => {
        const value = small.textContent ?? '';
        if (/above the prompt/.test(value)) small.replaceChildren(text('imageAbovePrompt'));
        else if (/highlighted word/.test(value)) small.replaceChildren(text('recallHighlightedWord'));
        else if (/front when available/.test(value)) small.replaceChildren(text('imageOnFront'));
        else if (/meaning first/.test(value)) small.replaceChildren(text('recallMeaning'));
        else if (/Includes dictionary/.test(value)) small.replaceChildren(text('ankiBackIncludes'));
    });
}

function localizeAudioSourceFields(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLSelectElement>('select[name^="audioSources."][name$=".type"]').forEach((select, index) => {
        select.setAttribute('aria-label', text('audioSourceNumber').replace('{number}', String(index + 1)));
        localizeAudioSourceTypeOptions(select, text);
    });
    form.querySelectorAll<HTMLSelectElement>('select[data-audio-voice-field]').forEach((select, index) => {
        select.setAttribute('aria-label', text('textToSpeechVoiceNumber').replace('{number}', String(index + 1)));
    });
    form.querySelectorAll<HTMLInputElement>('[data-audio-url-field]').forEach(input => {
        input.placeholder = localizedAudioUrlPlaceholder(input, text);
    });
}

function localizeAudioSourceTypeOptions(select: HTMLSelectElement, text: SettingsText): void {
    if (resolveUiLanguageFromText(text) !== 'ja') return;
    const labels: Record<string, string> = {
        jpod101: 'JapanesePod101',
        'language-pod-101': 'LanguagePod101',
        jisho: 'Jisho.org',
        'lingua-libre': '(Commons) リングア・リブレ',
        wiktionary: '(Commons) ウィクショナリー',
        'jpdb-tts': 'JPDB読み上げ',
        'text-to-speech': 'ブラウザ読み上げ',
        'text-to-speech-reading': 'ブラウザ読み上げ (かな読み)',
        custom: '直接音声ファイルURL (詳細)',
        'custom-json': 'カスタムURL',
    };
    Array.from(select.options).forEach(option => {
        option.textContent = labels[option.value] ?? option.textContent;
    });
}

function localizedAudioUrlPlaceholder(input: HTMLInputElement, text: SettingsText): string {
    const type = input.closest<HTMLElement>('[data-audio-source-row]')?.querySelector<HTMLSelectElement>('select[name$=".type"]')?.value;
    if (type === 'custom-json') return text('audioCustomJsonPlaceholder');
    if (type === 'custom') return text('audioCustomUrlPlaceholder');
    return text('audioBuiltInPlaceholder');
}

function localizeRecommendedDictionaryButtons(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLButtonElement>('[data-action="download-recommended-dictionary"]').forEach(button => {
        const installed = button.dataset.installed === 'true';
        const state = button.dataset.importState;
        const label = state === 'installing'
            ? text('installing')
            : state === 'queued'
                ? text('queued')
                : installed ? text('update') : text('install');
        button.textContent = label;
        button.title = button.dataset.importMessage || label;
        button.setAttribute('aria-label', button.title);
    });
}

function localizeDictionaryStatus(form: HTMLFormElement, text: SettingsText): void {
    const dictionaryStatus = form.querySelector<HTMLElement>('[data-dictionary-status]');
    if (dictionaryStatus && /Checking imported|インポート済み辞書を確認/.test(dictionaryStatus.textContent ?? '')) {
        dictionaryStatus.textContent = text('checkingDictionaries');
    }
}

function settingsControlLabelKeys(): Array<[string, SettingsTextKey]> {
    return [
        ['apiKey', 'apiKey'],
        ['miningDeck', 'miningDeck'],
        ['newTabJpdbDeck', 'newTabJpdbDeck'],
        ['neverForgetDeck', 'neverForgetDeck'],
        ['blacklistDeck', 'blacklistDeck'],
        ['jpdbMiningEnabled', 'jpdbMiningEnabled'],
        ['addToForq', 'addToForq'],
        ['enableReviews', 'enableReviews'],
        ['twoButtonReviews', 'reviewRatingScale'],
        ['interfaceLanguage', 'settingsLanguage'],
        ['popupMode', 'popupMode'],
        ['stickyBottomSheet', 'stickyBottomSheet'],
        ['popoverWidth', 'popoverWidth'],
        ['popoverHeight', 'popoverHeight'],
        ['popoverHeightMode', 'popoverHeightMode'],
        ['enableLogging', 'enableLogging'],
        ['accentColor', 'accentColor'],
        ['newTabEnabled', 'newTabEnabled'],
        ['newTabSource', 'newTabSource'],
        ['newTabJpdbReviewMode', 'newTabJpdbReviewMode'],
        ['corsProxyUrl', 'corsProxyUrl'],
        ['newTabKanjiKeywordSource', 'newTabKanjiKeywordSource'],
        ['newTabParsingEnabled', 'newTabParsingEnabled'],
        ['newTabFrontSentenceEnabled', 'newTabFrontSentenceEnabled'],
        ['newTabKanjiAutogradeEnabled', 'newTabKanjiAutogradeEnabled'],
        ['newTabKanjiAutoSubmit', 'newTabKanjiAutoSubmit'],
        ['newTabOfflineEnabled', 'newTabOfflineEnabled'],
        ['newTabOfflineLimit', 'newTabOfflineLimit'],
        ['newTabUrl', 'newTabUrl'],
        ['wordColorNew', 'wordColorNew'],
        ['wordColorLearning', 'wordColorLearning'],
        ['wordColorKnown', 'wordColorKnown'],
        ['wordColorDue', 'wordColorDue'],
        ['wordColorFailed', 'wordColorFailed'],
        ['wordColorIgnored', 'wordColorIgnored'],
        ['pitchColorHeiban', 'pitchColorHeiban'],
        ['pitchColorAtamadaka', 'pitchColorAtamadaka'],
        ['pitchColorNakadaka', 'pitchColorNakadaka'],
        ['pitchColorOdaka', 'pitchColorOdaka'],
        ['pitchColorKifuku', 'pitchColorKifuku'],
        ['pitchColorUnknown', 'pitchColorUnknown'],
        ['wordHighlightColorSource', 'wordHighlightColorSource'],
        ['wordUnderlineColorSource', 'wordUnderlineColorSource'],
        ['wordTextColorSource', 'wordTextColorSource'],
        ['subtitleHighlightColorSource', 'subtitleHighlightColorSource'],
        ['subtitleUnderlineColorSource', 'subtitleUnderlineColorSource'],
        ['subtitleTextColorSource', 'subtitleTextColorSource'],
        ['parseSelection', 'parseSelection'],
        ['lookupOnClick', 'lookupOnClick'],
        ['lookupOnHover', 'lookupOnHover'],
        ['lookupOnMiddleMouse', 'lookupOnMiddleMouse'],
        ['autoScanJapanese', 'autoScanJapanese'],
        ['scanVisiblePage', 'scanVisiblePage'],
        ['showFloatingButton', 'showFloatingButton'],
        ['furiganaMode', 'furiganaMode'],
        ['showPitchAccent', 'showPitchAccent'],
        ['kanjivgEnabled', 'kanjivgEnabled'],
        ['kanjiOriginsEnabled', 'kanjiOriginsEnabled'],
        ['kanjiOriginKanjiMapEnabled', 'kanjiOriginKanjiMapEnabled'],
        ['kanjiOriginGraphEnabled', 'kanjiOriginGraphEnabled'],
        ['kanjiOriginRadicalImagesEnabled', 'kanjiOriginRadicalImagesEnabled'],
        ['rtkEnabled', 'rtkEnabled'],
        ['similarKanjiWords', 'similarKanjiWords'],
        ['similarKanjiWordLimit', 'similarKanjiWordLimit'],
        ['audioEnabled', 'audioEnabled'],
        ['autoPlayAudio', 'autoPlayAudio'],
        ['audioAutoPlayMode', 'audioAutoPlayMode'],
        ['audioEnableDefaultSources', 'audioEnableDefaultSources'],
        ['audioFallbackChimeEnabled', 'audioFallbackChimeEnabled'],
        ['audioSelectionMode', 'audioSelectionMode'],
        ['audioTtsMode', 'audioTtsMode'],
        ['audioTimeoutMs', 'audioTimeoutMs'],
        ['immersionKitEnabled', 'immersionKitEnabled'],
        ['immersionKitExampleSource', 'immersionKitExampleSource'],
        ['nadeshikoApiKey', 'nadeshikoApiKey'],
        ['immersionKitShowTranslation', 'immersionKitShowTranslation'],
        ['immersionKitRevealTranslationOnClick', 'immersionKitRevealTranslationOnClick'],
        ['immersionKitShowImages', 'immersionKitShowImages'],
        ['immersionKitAutoPlayAudio', 'immersionKitAutoPlayAudio'],
        ['immersionKitPlayOnHover', 'immersionKitPlayOnHover'],
        ['immersionKitPlayOnImageClick', 'immersionKitPlayOnImageClick'],
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
        ['subtitleNativeBlurred', 'subtitleNativeBlurred'],
        ['subtitleKaraokeMode', 'subtitleKaraokeMode'],
        ['subtitleTranscriptVisible', 'subtitleTranscriptVisible'],
        ['subtitleTranscriptAutoScroll', 'subtitleTranscriptAutoScroll'],
        ['subtitleAutoCopyLine', 'subtitleAutoCopyLine'],
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
        ['ankiEnabled', 'ankiEnabled'],
        ['ankiMineWithJpdb', 'ankiMineWithJpdb'],
        ['ankiCaptureScreenshot', 'ankiCaptureScreenshot'],
        ['ankiMobileHandoff', 'mobileAnkiHandoff'],
        ['ankiConnectUrl', 'ankiConnectUrl'],
        ['ankiDeck', 'ankiDeck'],
        ['ankiModel', 'ankiModel'],
        ['ankiTemplateMode', 'ankiTemplateMode'],
        ['ankiFrontReading', 'ankiFrontReading'],
        ['ankiFrontSentence', 'ankiFrontSentence'],
        ['ankiFrontImage', 'ankiFrontImage'],
        ['ankiTags', 'ankiTags'],
        ['studyTranslationEnabled', 'studyTranslationEnabled'],
        ['studyGrammarEnabled', 'studyGrammarEnabled'],
        ['youtubeImmersionEnabled', 'youtubeImmersionEnabled'],
        ['youtubeShowFilterNotice', 'youtubeShowFilterNotice'],
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

function setRadioLabel(form: HTMLFormElement, name: string, value: string, label: string): void {
    const radio = Array.from(form.elements).find((element): element is HTMLInputElement =>
        element instanceof HTMLInputElement
        && element.type === 'radio'
        && element.name === name
        && element.value === value,
    );
    const labelElement = radio?.closest('label');
    if (labelElement) setInlineLabelText(labelElement, label);
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
    const fieldset = getSettingsPanelFieldsets(form)[index];
    return Array.from(fieldset?.children ?? []).find((child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains('jpdb-reader-help'),
    ) ?? null;
}

function getSettingsPanelFieldsets(form: HTMLFormElement): HTMLFieldSetElement[] {
    return Array.from(form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-settings-panel]'));
}

function directFieldsetLegend(fieldset: HTMLFieldSetElement | undefined): HTMLLegendElement | null {
    return Array.from(fieldset?.children ?? []).find((child): child is HTMLLegendElement =>
        child instanceof HTMLLegendElement,
    ) ?? null;
}

function setFieldsetHelp(form: HTMLFormElement, index: number, text: string): void {
    const help = getFieldsetHelp(form, index);
    if (help) help.textContent = text;
}

function localizeHelpLinksPanel(form: HTMLFormElement, language: InterfaceLanguage): void {
    const panel = form.querySelector<HTMLElement>('.jpdb-reader-help-links-card');
    if (!panel) return;
    const text = (key: Parameters<typeof uiText>[1]) => uiText(language, key);
    panel.querySelector<HTMLElement>('[data-help-links-title]')?.replaceChildren(text('helpLinksTitle'));
    panel.querySelector<HTMLElement>('[data-help-links-copy]')?.replaceChildren(text('helpLinksCopy'));
    panel.querySelector<HTMLElement>('[data-help-support-title]')?.replaceChildren(text('helpSupportTitle'));
    panel.querySelector<HTMLElement>('[data-help-support-copy]')?.replaceChildren(text('helpSupportCopy'));
    panel.querySelector<HTMLElement>('[data-help-support-copy-extra]')?.replaceChildren(text('helpSupportCopyExtra'));
    setExternalButtonLabel(panel.querySelector<HTMLElement>('[data-help-link="video-player"]'), text('videoPlayer'));
    setExternalButtonLabel(panel.querySelector<HTMLElement>('[data-help-link="new-tab"]'), text('newTabPage'));
    setExternalButtonLabel(panel.querySelector<HTMLElement>('[data-help-link="docs"]'), text('docs'));
    panel.querySelector<HTMLElement>('[data-help-link="factory-reset"]')?.replaceChildren(text('factoryReset'));
    setExternalButtonLabel(panel.querySelector<HTMLElement>('[data-help-link="issues"]'), text('issues'));
    setExternalButtonLabel(panel.querySelector<HTMLElement>('[data-help-link="donate"]'), text('donate'));
    setExternalButtonLabel(panel.querySelector<HTMLElement>('[data-help-link="discord"]'), text('discord'));

    const glossary = form.querySelector<HTMLElement>('.jpdb-reader-help-glossary-card');
    glossary?.querySelector<HTMLElement>('[data-help-glossary-title]')?.replaceChildren(text('helpGlossaryTitle'));
    (['jpdb', 'yomitan', 'mining', 'anki', 'ocr'] as const).forEach(term => {
        glossary?.querySelector<HTMLElement>(`[data-help-glossary-term="${term}"]`)?.replaceChildren(text(`helpGlossaryTerm${term}`));
        glossary?.querySelector<HTMLElement>(`[data-help-glossary-definition="${term}"]`)?.replaceChildren(text(`helpGlossaryDefinition${term}`));
    });
}

function externalButtonLabel(label: string): string {
    return `<span>${escapeHtml(label)}</span>${externalLinkIcon()}`;
}

function setExternalButtonLabel(element: HTMLElement | null | undefined, label: string): void {
    if (!element) return;
    setInnerHtml(element, externalButtonLabel(label));
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
        <div class="jpdb-reader-audio-source-head jpdb-reader-order-head">
            <span>On</span>
            <span>Audio source</span>
            <span>URL / voice</span>
            <span>Order</span>
            <span>Remove</span>
        </div>
        ${renderAudioSourceRows(audioSourceRowsForSettings(sources))}
        <button class="jpdb-reader-btn" type="button" data-action="audio-source-add">Add audio source</button>
    `;
}

function miniIcon(name: 'drag' | 'up' | 'down' | 'remove'): string {
    const paths = {
        drag: '<path d="M9 5h.01"></path><path d="M15 5h.01"></path><path d="M9 12h.01"></path><path d="M15 12h.01"></path><path d="M9 19h.01"></path><path d="M15 19h.01"></path>',
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
            <div class="jpdb-reader-audio-source-row jpdb-reader-order-row" data-source-row data-audio-source-row data-source-id="audio-${index}">
                <label class="inline jpdb-reader-audio-index jpdb-reader-order-toggle">
                    <input name="audioSources.${index}.enabled" type="checkbox" ${source.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                <div class="jpdb-reader-audio-source-choice">
                    <select name="audioSources.${index}.type" aria-label="Audio source ${index + 1}">
                        ${audioSourceSelectOptions(source.type).map(([optionValue, text]) =>
                            `<option value="${escapeHtml(optionValue)}" ${optionValue === source.type ? 'selected' : ''}>${escapeHtml(text)}</option>`,
                        ).join('')}
                    </select>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="preview-audio" title="Preview audio" aria-label="Preview audio">${speakerIcon()}</button>
                </div>
                <div class="jpdb-reader-audio-source-fields">
                    <input data-audio-url-field name="audioSources.${index}.url" type="text" value="${escapeHtml(source.url)}" placeholder="${audioUrlPlaceholder(source.type)}" ${audioSourceUsesUrl(source.type) ? '' : 'hidden'}>
                    <select data-audio-voice-field name="audioSources.${index}.voice" aria-label="Text-to-speech voice ${index + 1}" data-selected-voice="${escapeHtml(source.voice)}" ${audioSourceUsesVoice(source.type) ? '' : 'hidden'}>
                        <option value="${escapeHtml(source.voice)}">${escapeHtml(source.voice || 'Automatic browser voice')}</option>
                    </select>
                </div>
                <div class="jpdb-reader-row-tools jpdb-reader-row-order-tools" aria-label="Audio source order">
                    <button type="button" class="jpdb-reader-icon-mini jpdb-reader-drag-handle" data-source-drag-handle title="Drag to reorder" aria-label="Drag to reorder">${miniIcon('drag')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-up" title="Move up" aria-label="Move up">${miniIcon('up')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-down" title="Move down" aria-label="Move down">${miniIcon('down')}</button>
                </div>
                <div class="jpdb-reader-row-tools jpdb-reader-row-remove-tools">
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-remove" title="Remove" aria-label="Remove">${miniIcon('remove')}</button>
                </div>
            </div>
        `).join('')}
    `;
}

function audioSourceSelectOptions(type: AudioSourceSetting['type']): [AudioSourceSetting['type'], string][] {
    if (type === 'custom') {
        return [...AUDIO_SOURCE_UI_OPTIONS, ['custom', `${AUDIO_SOURCE_LABELS.custom} (advanced)`]];
    }
    return AUDIO_SOURCE_UI_OPTIONS;
}

export function audioSourceRowsForSettings(sources: AudioSourceSetting[]): AudioSourceSetting[] {
    const rows = sources.map(source => ({ ...source }));
    return rows.length ? rows : DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
}

function audioUrlPlaceholder(type: AudioSourceSetting['type']): string {
    if (type === 'custom-json') return 'Yomitan or Ultimate audio source URL';
    if (type === 'custom') return 'Direct audio file URL';
    return 'Built-in source, no URL needed';
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

export function syncBrowserTtsVoiceOptions(form: HTMLFormElement): void {
    const voices = 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];
    const language: InterfaceLanguage = form.lang === 'ja' ? 'ja' : 'en';
    const text = (key: SettingsTextKey) => uiText(language, key);
    const sortedVoices = voices.slice().sort((a, b) => {
        const aJapanese = a.lang.toLowerCase().startsWith('ja') ? 0 : 1;
        const bJapanese = b.lang.toLowerCase().startsWith('ja') ? 0 : 1;
        return aJapanese - bJapanese
            || a.lang.localeCompare(b.lang)
            || a.name.localeCompare(b.name);
    });

    form.querySelectorAll<HTMLSelectElement>('select[data-audio-voice-field]').forEach(select => {
        const selected = select.value || select.dataset.selectedVoice || '';
        const options = [
            `<option value="" ${selected ? '' : 'selected'}>${escapeHtml(text('automaticBrowserVoice'))}</option>`,
            ...sortedVoices.map(voice => {
                const label = `${voice.name}${voice.lang ? ` (${voice.lang})` : ''}${voice.default ? (language === 'ja' ? ' - 標準' : ' - default') : ''}`;
                return `<option value="${escapeHtml(voice.name)}" ${voice.name === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
            }),
        ];
        if (selected && !sortedVoices.some(voice => voice.name === selected)) {
            options.push(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(`${text('savedVoice')}: ${selected}`)}</option>`);
        }
        setInnerHtml(select, options.join(''));
    });
}

export function updateAudioSourceEditor(form: HTMLFormElement, action: string, control?: HTMLElement | null): void {
    const container = form.querySelector<HTMLElement>('.jpdb-reader-audio-sources');
    if (!container) return;
    const row = control?.closest<HTMLElement>('[data-audio-source-row]');
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-audio-source-row]'));
    const index = row ? rows.indexOf(row) : -1;

    if (isAudioSourceMoveAction(action)) {
        moveSourceRow(container, index, audioSourceMoveTargetIndex(action, index));
        return;
    }

    const sources = audioSourceRowsForSettings(readAudioSources(new FormData(form)));
    updateAudioSourceRows(sources, action, index);
    setInnerHtml(container, renderAudioSourceEditor(sources));
}

function isAudioSourceMoveAction(action: string): boolean {
    return action === 'audio-source-up' || action === 'audio-source-down';
}

function audioSourceMoveTargetIndex(action: string, index: number): number {
    return action === 'audio-source-up' ? index - 1 : index + 1;
}

function updateAudioSourceRows(sources: AudioSourceSetting[], action: string, index: number): void {
    if (action === 'audio-source-add') addAudioSourceRow(sources);
    if (action === 'audio-source-remove') removeAudioSourceRow(sources, index);
}

function addAudioSourceRow(sources: AudioSourceSetting[]): void {
    if (sources.length < 12) sources.push({ type: 'custom-json', url: '', voice: '', enabled: true });
}

function removeAudioSourceRow(sources: AudioSourceSetting[], index: number): void {
    if (index >= 0 && sources.length > 1) sources.splice(index, 1);
}

export function renderDictionaryLookupLinkEditor(links: DictionaryLookupLink[]): string {
    const rows = normalizeDictionaryLookupLinks(links);
    return `
        <div class="jpdb-reader-lookup-link-head jpdb-reader-order-head">
            <span>On</span>
            <span>Label</span>
            <span>URL template</span>
            <span>Order</span>
            <span>Remove</span>
        </div>
        ${renderDictionaryLookupLinkRows(rows)}
        <div class="jpdb-reader-lookup-link-actions">
            <button class="jpdb-reader-btn add" type="button" data-action="lookup-link-add">Add</button>
        </div>
    `;
}

function renderDictionaryLookupLinkRows(rows: DictionaryLookupLink[]): string {
    return `
        <input type="hidden" name="dictionaryLookupLinkCount" value="${rows.length}">
        ${rows.map((link, index) => {
            const isCopyAction = link.action === 'copy';
            const urlControl = isCopyAction
                ? `<span class="jpdb-reader-lookup-link-note">Copies the current word</span><input name="dictionaryLookupLinks.${index}.urlTemplate" type="hidden" value="">`
                : `<input name="dictionaryLookupLinks.${index}.urlTemplate" type="text" value="${escapeHtml(link.urlTemplate)}" placeholder="https://takoboto.jp/?q={query}" aria-label="Lookup URL template">`;
            const removeControl = isCopyAction
                ? '<span class="jpdb-reader-lookup-link-fixed" aria-label="Built-in action"></span>'
                : `<button type="button" class="jpdb-reader-icon-mini" data-action="lookup-link-remove" title="Remove" aria-label="Remove">${miniIcon('remove')}</button>`;
            return `
                <div class="jpdb-reader-lookup-link-row jpdb-reader-order-row" data-source-row data-lookup-link-row data-source-id="lookup-link-${index}" data-index="${index}">
                    <label class="inline jpdb-reader-dictionary-toggle jpdb-reader-order-toggle">
                        <input name="dictionaryLookupLinks.${index}.enabled" type="checkbox" ${link.enabled ? 'checked' : ''}>
                        <span>${index + 1}</span>
                    </label>
                    <input name="dictionaryLookupLinks.${index}.label" type="text" value="${escapeHtml(link.label)}" aria-label="Lookup pill label">
                    ${urlControl}
                    <input name="dictionaryLookupLinks.${index}.id" type="hidden" value="${escapeHtml(link.id)}">
                    <input name="dictionaryLookupLinks.${index}.action" type="hidden" value="${escapeHtml(link.action ?? 'open')}">
                    <div class="jpdb-reader-row-tools jpdb-reader-row-order-tools" aria-label="Lookup pill order">
                        <button type="button" class="jpdb-reader-icon-mini jpdb-reader-drag-handle" data-source-drag-handle title="Drag to reorder" aria-label="Drag to reorder">${miniIcon('drag')}</button>
                        <button type="button" class="jpdb-reader-icon-mini" data-action="lookup-link-up" title="Move up" aria-label="Move up">${miniIcon('up')}</button>
                        <button type="button" class="jpdb-reader-icon-mini" data-action="lookup-link-down" title="Move down" aria-label="Move down">${miniIcon('down')}</button>
                    </div>
                    <div class="jpdb-reader-row-tools jpdb-reader-row-remove-tools">
                        ${removeControl}
                    </div>
                </div>
            `;
        }).join('')}
    `;
}

export function readDictionaryLookupLinks(data: FormData): DictionaryLookupLink[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Math.min(MAX_DICTIONARY_LOOKUP_LINKS, Number(get('dictionaryLookupLinkCount')) || 0));
    const links: DictionaryLookupLink[] = [];

    for (let index = 0; index < count; index++) {
        const link = readDictionaryLookupLinkRow(data, get, index);
        if (link) links.push(link);
    }

    return normalizeDictionaryLookupLinks(links);
}

function readDictionaryLookupLinkRow(
    data: FormData,
    get: (key: string) => string,
    index: number,
): DictionaryLookupLink | null {
    const label = get(`dictionaryLookupLinks.${index}.label`).trim();
    const urlTemplate = get(`dictionaryLookupLinks.${index}.urlTemplate`).trim();
    const action = dictionaryLookupLinkAction(get(`dictionaryLookupLinks.${index}.action`));
    if (!shouldKeepDictionaryLookupLink(label, urlTemplate, action)) return null;
    return {
        id: get(`dictionaryLookupLinks.${index}.id`).trim() || `custom-${index}`,
        label: dictionaryLookupLinkLabel(label, action),
        urlTemplate: dictionaryLookupLinkUrlTemplate(urlTemplate, action),
        enabled: data.has(`dictionaryLookupLinks.${index}.enabled`),
        action,
    };
}

function dictionaryLookupLinkAction(value: string): DictionaryLookupLink['action'] {
    return value === 'copy' ? 'copy' : 'open';
}

function shouldKeepDictionaryLookupLink(label: string, urlTemplate: string, action: DictionaryLookupLink['action']): boolean {
    return Boolean(label || urlTemplate || action === 'copy');
}

function dictionaryLookupLinkLabel(label: string, action: DictionaryLookupLink['action']): string {
    return action === 'copy' && !label ? COPY_LOOKUP_LINK.label : label;
}

function dictionaryLookupLinkUrlTemplate(urlTemplate: string, action: DictionaryLookupLink['action']): string {
    return action === 'copy' ? '' : urlTemplate;
}

export function updateDictionaryLookupLinkEditor(form: HTMLFormElement, action: string, control?: HTMLElement | null): void {
    const container = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links');
    if (!container) return;
    const links = readDictionaryLookupLinks(new FormData(form));
    const row = control?.closest<HTMLElement>('[data-lookup-link-row]');
    const index = row ? Array.from(container.querySelectorAll('[data-lookup-link-row]')).indexOf(row) : -1;
    updateDictionaryLookupLinks(links, action, index);
    setInnerHtml(container, renderDictionaryLookupLinkEditor(links));
}

function updateDictionaryLookupLinks(links: DictionaryLookupLink[], action: string, index: number): void {
    if (action === 'lookup-link-add') addDictionaryLookupLink(links);
    if (action === 'lookup-link-remove') removeDictionaryLookupLink(links, index);
    if (action === 'lookup-link-up') moveDictionaryLookupLink(links, index, index - 1);
    if (action === 'lookup-link-down') moveDictionaryLookupLink(links, index, index + 1);
}

function addDictionaryLookupLink(links: DictionaryLookupLink[]): void {
    if (links.length >= MAX_DICTIONARY_LOOKUP_LINKS) return;
    links.push({
        id: `custom-${Date.now().toString(36)}`,
        label: '',
        urlTemplate: 'https://takoboto.jp/?q={query}',
        enabled: true,
    });
}

function removeDictionaryLookupLink(links: DictionaryLookupLink[], index: number): void {
    if (index >= 0 && links.length > 1 && links[index]?.action !== 'copy') links.splice(index, 1);
}

function moveDictionaryLookupLink(links: DictionaryLookupLink[], from: number, to: number): void {
    if (from < 0 || to < 0 || from >= links.length || to >= links.length) return;
    const [link] = links.splice(from, 1);
    links.splice(to, 0, link);
}

export function updateSourceRowEditor(action: string, control?: HTMLElement | null): void {
    const row = control?.closest<HTMLElement>('[data-source-row]');
    const container = row?.closest<HTMLElement>('[data-source-editor]');
    if (!container || !row) return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-row]'));
    const index = rows.indexOf(row);
    const targetIndex = action === 'dictionary-source-up' ? index - 1 : index + 1;
    moveSourceRow(container, index, targetIndex);
}

export function installSourceRowDrag(root: HTMLElement): void {
    let drag: SourceRowDragState | null = null;
    const dragDocument = root.ownerDocument;

    root.addEventListener('pointerdown', event => {
        if (drag) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-source-drag-handle]');
        if (!handle || !root.contains(handle)) return;
        const row = handle.closest<HTMLElement>('[data-source-row]');
        const container = row?.closest<HTMLElement>('[data-source-editor]');
        if (!row || !container) return;
        event.preventDefault();
        setSourceRowPointerCapture(handle, event.pointerId);
        drag = { active: false, container, handle, pointerId: event.pointerId, row, startY: event.clientY };
        row.classList.add('jpdb-reader-order-row-drag-pending');
        dragDocument.addEventListener('pointermove', moveDrag);
        dragDocument.addEventListener('pointerup', finishDrag);
        dragDocument.addEventListener('pointercancel', finishDrag);
    });

    const moveDrag = (event: PointerEvent): void => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (!drag.active && Math.abs(event.clientY - drag.startY) < 4) return;
        event.preventDefault();
        drag.active = true;
        drag.row.classList.add('jpdb-reader-order-row-dragging');
        moveSourceRowToPointer(drag.container, drag.row, event.clientY);
    };

    const finishDrag = (event: PointerEvent): void => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        releaseSourceRowPointerCapture(drag.handle, event.pointerId);
        drag.row.classList.remove('jpdb-reader-order-row-drag-pending', 'jpdb-reader-order-row-dragging');
        syncSourceRowOrder(drag.container);
        drag = null;
        dragDocument.removeEventListener('pointermove', moveDrag);
        dragDocument.removeEventListener('pointerup', finishDrag);
        dragDocument.removeEventListener('pointercancel', finishDrag);
    };
    root.addEventListener('pointermove', moveDrag);
    root.addEventListener('pointerup', finishDrag);
    root.addEventListener('pointercancel', finishDrag);
}

interface SourceRowDragState {
    active: boolean;
    container: HTMLElement;
    handle: HTMLElement;
    pointerId: number;
    row: HTMLElement;
    startY: number;
}

function setSourceRowPointerCapture(handle: HTMLElement, pointerId: number): void {
    try {
        handle.setPointerCapture?.(pointerId);
    } catch {
        // Some iPad/Safari contexts expose pointer events without reliable capture.
    }
}

function releaseSourceRowPointerCapture(handle: HTMLElement, pointerId: number): void {
    try {
        handle.releasePointerCapture?.(pointerId);
    } catch {
        // Matching the guarded capture path above keeps drag cleanup best-effort.
    }
}

function moveSourceRowToPointer(container: HTMLElement, row: HTMLElement, clientY: number): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-row]'))
        .filter(candidate => candidate !== row);
    const target = rows.find(candidate => {
        const rect = candidate.getBoundingClientRect();
        return clientY < rect.top + rect.height / 2;
    });
    if (target) container.insertBefore(row, target);
    else container.appendChild(row);
    syncSourceRowOrder(container);
}

function moveSourceRow(container: HTMLElement, index: number, targetIndex: number): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-row]'));
    if (!canMoveSourceRow(index, targetIndex, rows.length)) return;
    const row = rows[index];
    const target = rows[targetIndex];
    if (targetIndex < index) container.insertBefore(row, target);
    else container.insertBefore(row, target.nextSibling);
    syncSourceRowOrder(container);
}

function canMoveSourceRow(index: number, targetIndex: number, rowCount: number): boolean {
    return index >= 0
        && targetIndex >= 0
        && index < rowCount
        && targetIndex < rowCount
        && index !== targetIndex;
}

function syncSourceRowOrder(container: HTMLElement): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-row]'));
    rows.forEach((row, index) => {
        const priority = row.querySelector<HTMLInputElement>('input[name$=".priority"]');
        if (priority) priority.value = String(index);
        const indexLabel = row.querySelector('.jpdb-reader-order-toggle span');
        if (indexLabel) indexLabel.textContent = String(index + 1);
    });
    if (container.matches('[data-audio-source-editor]')) syncAudioSourceIndexes(container, rows);
    if (container.classList.contains('jpdb-reader-lookup-links')) syncDictionaryLookupLinkIndexes(container, rows);
}

function syncAudioSourceIndexes(container: HTMLElement, rows = Array.from(container.querySelectorAll<HTMLElement>('[data-audio-source-row]'))): void {
    rows.forEach((row, index) => {
        row.dataset.sourceId = `audio-${index}`;
        row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[name^="audioSources."]').forEach(control => {
            control.name = control.name.replace(/^audioSources\.\d+\./, `audioSources.${index}.`);
            if (control instanceof HTMLSelectElement && control.name.endsWith('.type')) {
                control.setAttribute('aria-label', `Audio source ${index + 1}`);
            }
            if (control instanceof HTMLSelectElement && control.name.endsWith('.voice')) {
                control.setAttribute('aria-label', `Text-to-speech voice ${index + 1}`);
            }
        });
    });
}

function syncDictionaryLookupLinkIndexes(container: HTMLElement, rows = Array.from(container.querySelectorAll<HTMLElement>('[data-lookup-link-row]'))): void {
    rows.forEach((row, index) => {
        row.dataset.index = String(index);
        row.dataset.sourceId = `lookup-link-${index}`;
        row.querySelectorAll<HTMLInputElement>('[name^="dictionaryLookupLinks."]').forEach(control => {
            control.name = control.name.replace(/^dictionaryLookupLinks\.\d+\./, `dictionaryLookupLinks.${index}.`);
            if (control.name.endsWith('.label')) control.setAttribute('aria-label', `Lookup pill ${index + 1} label`);
            if (control.name.endsWith('.urlTemplate')) control.setAttribute('aria-label', `Lookup pill ${index + 1} URL template`);
        });
    });
}

export function installShortcutCapture(root: HTMLElement): void {
    root.querySelectorAll<HTMLInputElement>('[data-shortcut-input]').forEach(inputEl => {
        inputEl.addEventListener('keydown', event => {
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Backspace' || event.key === 'Delete') {
                inputEl.value = '';
                return;
            }
            inputEl.value = formatShortcutEvent(event);
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

export function syncJpdbMiningDependentSettings(form: HTMLFormElement): void {
    const jpdbDeckActionsEnabled = form.querySelector<HTMLInputElement>('input[name="jpdbMiningEnabled"]')?.checked ?? true;
    for (const name of ['addToForq', 'ankiMineWithJpdb']) {
        const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
        if (!input) continue;
        input.disabled = !jpdbDeckActionsEnabled;
        if (!jpdbDeckActionsEnabled) input.checked = false;
    }
}

export function syncStickyBottomSheetAvailability(form: HTMLFormElement): void {
    const popupMode = form.querySelector<HTMLSelectElement>('select[name="popupMode"]')?.value;
    const unavailable = popupMode === 'popover';
    const input = form.querySelector<HTMLInputElement>('input[name="stickyBottomSheet"]');
    const field = input?.closest<HTMLElement>('[data-sticky-bottom-sheet-field]') ?? input?.closest<HTMLElement>('label');
    if (field) field.hidden = unavailable;
    if (!input) return;
    input.disabled = unavailable;
    if (unavailable) input.checked = false;
}

export function syncSubtitlePreview(form: HTMLFormElement): void {
    const preview = form.querySelector<HTMLElement>('[data-subtitle-preview]');
    if (!preview) return;
    const value = (name: string, fallback: string) => getNamedControl<HTMLInputElement>(form, name)?.value || fallback;
    const numberValue = (name: string, fallback: number) => {
        const number = Number(value(name, String(fallback)));
        return Number.isFinite(number) ? number : fallback;
    };
    preview.style.setProperty('--subtitle-font-size', `${Math.max(16, Math.min(64, numberValue('subtitleFontSize', 28)))}px`);
    preview.style.setProperty('--subtitle-color', sanitizeAccentColor(value('subtitleTextColor', '#ffffff'), '#ffffff'));
    preview.style.setProperty('--subtitle-outline', sanitizeAccentColor(value('subtitleOutlineColor', '#000000'), '#000000'));
    preview.style.setProperty(
        '--subtitle-background-rgba',
        accentToRgba(sanitizeAccentColor(value('subtitleBackgroundColor', '#181b20'), '#181b20'), Math.max(0, Math.min(1, numberValue('subtitleBackgroundOpacity', 0)))),
    );
    preview.style.setProperty('--subtitle-family', value('subtitleFontFamily', 'system-ui'));
    preview.style.setProperty('--subtitle-weight', String(Math.max(100, Math.min(900, numberValue('subtitleFontWeight', 760)))));
    syncSubtitlePreviewColorClasses(form, preview);
}

function syncSubtitlePreviewColorClasses(form: HTMLFormElement, preview: HTMLElement): void {
    const value = (name: string, fallback: string) => getNamedControl<HTMLInputElement | HTMLSelectElement>(form, name)?.value || fallback;
    const classes = {
        highlight: readOption(value('subtitleHighlightColorSource', 'jpdb'), COLOR_SOURCE_VALUES, 'jpdb'),
        underline: readOption(value('subtitleUnderlineColorSource', 'pitch'), COLOR_SOURCE_VALUES, 'pitch'),
        text: readOption(value('subtitleTextColorSource', 'jpdb'), COLOR_SOURCE_VALUES, 'jpdb'),
    };
    (Object.keys(classes) as Array<keyof typeof classes>).forEach(channel => {
        COLOR_SOURCE_CLASS_VALUES.forEach(source => {
            preview.classList.toggle(`jpdb-reader-subtitle-${channel}-${source}`, classes[channel] === source);
        });
    });
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
        ? `${settings.ankiFrontImage ? '<small>Image appears above the prompt when available.</small>' : ''}<div class="jpdb-reader-template-sentence">今日は<span>本を読む</span>。</div><small>Recall the highlighted word from context.</small>`
        : [
            '<div class="jpdb-reader-template-expression">読む</div>',
            settings.ankiFrontReading ? '<div class="jpdb-reader-template-reading">よむ</div>' : '',
            settings.ankiFrontSentence ? '<div class="jpdb-reader-template-sentence">今日は<span>本を読む</span>。</div>' : '',
            settings.ankiFrontImage ? '<small>Image appears on the front when available.</small>' : '',
            '<small>Recall the meaning first.</small>',
        ].filter(Boolean).join('');
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
    const showAlias = rows.some(row => !row.readonly);
    const visibleNames = new Set(rows.filter(row => row.removable).map(row => row.name));
    const hiddenPreferences = settings.dictionaryPreferences.filter(preference => !visibleNames.has(preference.name));
    const hidden = hiddenPreferences.map(preference => {
        const index = settings.dictionaryPreferences.indexOf(preference);
        return `
            <input type="hidden" name="dictionaryPreferences.${index}.name" value="${escapeHtml(preference.name)}">
            <input type="hidden" name="dictionaryPreferences.${index}.alias" value="${escapeHtml(preference.alias)}">
            ${preference.enabled ? `<input type="hidden" name="dictionaryPreferences.${index}.enabled" value="on">` : ''}
            <input type="hidden" name="dictionaryPreferences.${index}.priority" value="${escapeHtml(String(preference.priority))}">
            <input type="hidden" name="dictionaryPreferences.${index}.type" value="${escapeHtml(preference.type ?? 'terms')}">
        `;
    }).join('');
    const metadataHelp = hiddenPreferences.length
        ? '<div class="jpdb-reader-help">Frequency, pitch, and kanji metadata dictionaries are detected automatically and shown as popup badges or kanji data instead of definition source cards.</div>'
        : '';
    if (!rows.some(row => row.removable)) return `
        <div class="jpdb-reader-help">Import Yomitan dictionaries to add local or native-language definitions alongside JPDB and Immersion Kit examples.</div>
        ${renderSourceRowsList(rows, { sourceLabel: 'Definition source', countName: 'dictionaryPreferenceCount', countValue: settings.dictionaryPreferences.length, showAlias })}
        ${metadataHelp}
        ${hidden}
    `;
    return `${renderSourceRowsList(rows, { sourceLabel: 'Definition source', countName: 'dictionaryPreferenceCount', countValue: settings.dictionaryPreferences.length, showAlias })}${metadataHelp}${hidden}`;
}

export function renderKanjiSourceRows(settings: ReaderSettings): string {
    return renderSourceRowsList(kanjiSourceRows(settings), { sourceLabel: 'Kanji section', showAlias: false });
}

function renderSourceRowsList(rows: SettingsSourceRow[], options: { sourceLabel: string; countName?: string; countValue?: number; showAlias: boolean }): string {
    const removableCount = rows.filter(row => row.removable).length;
    const showRemove = removableCount > 0;
    const layoutClass = [
        options.showAlias ? '' : 'compact',
        showRemove ? 'has-remove' : 'no-remove',
    ].filter(Boolean).join(' ');
    return `
        <div class="jpdb-reader-dictionary-head jpdb-reader-order-head ${layoutClass}">
            <span>On</span>
            <span>${escapeHtml(options.sourceLabel)}</span>
            ${options.showAlias ? '<span>Display name</span>' : ''}
            <span>Order</span>
            ${showRemove ? '<span>Remove</span>' : ''}
        </div>
        ${options.countName ? `<input type="hidden" name="${escapeHtml(options.countName)}" value="${options.countValue ?? removableCount}">` : ''}
        ${rows.map((row, index) => `
            <div class="jpdb-reader-dictionary-row jpdb-reader-order-row ${layoutClass}" data-source-row data-dictionary-source-row data-source-id="${escapeHtml(row.id)}">
                <label class="inline jpdb-reader-dictionary-toggle jpdb-reader-order-toggle">
                    <input name="${row.prefix}.enabled" type="checkbox" ${row.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                ${sourceField(sourceRowDisplayName(row, options.showAlias), row.name, row.prefix, 'name', options.sourceLabel)}
                ${options.showAlias ? (row.readonly
                    ? sourceField(row.alias, row.alias, row.prefix, 'alias', 'Display name')
                    : `<input name="${row.prefix}.alias" type="text" value="${escapeHtml(row.alias)}" aria-label="Dictionary display name" placeholder="${escapeHtml(row.name)}">`) : ''}
                <div class="jpdb-reader-row-tools jpdb-reader-row-order-tools">
                    <input name="${row.prefix}.priority" type="hidden" value="${index}" aria-label="${escapeHtml(options.sourceLabel)} priority">
                    <button type="button" class="jpdb-reader-icon-mini jpdb-reader-drag-handle" data-source-drag-handle title="Drag to reorder" aria-label="Drag to reorder">${miniIcon('drag')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="dictionary-source-up" title="Move up" aria-label="Move up">${miniIcon('up')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="dictionary-source-down" title="Move down" aria-label="Move down">${miniIcon('down')}</button>
                </div>
                ${showRemove ? `<div class="jpdb-reader-row-tools jpdb-reader-row-remove-tools">
                    ${row.removable ? `<button type="button" class="jpdb-reader-icon-mini" data-action="delete-yomitan-dictionary" data-dictionary-name="${escapeHtml(row.name)}" title="Remove imported dictionary" aria-label="Remove imported dictionary">${miniIcon('remove')}</button>` : ''}
                </div>` : ''}
                ${row.removable ? `<input name="${row.prefix}.type" type="hidden" value="${escapeHtml(row.dictionaryType ?? 'terms')}">` : ''}
                ${row.help ? `<div class="jpdb-reader-dictionary-row-help">${escapeHtml(row.help)}</div>` : ''}
            </div>
        `).join('')}
    `;
}

function sourceRowDisplayName(row: SettingsSourceRow, showAlias: boolean): string {
    return !showAlias && !row.readonly && row.alias ? row.alias : row.name;
}

function sourceField(displayValue: string, formValue: string, prefix: string, field: 'name' | 'alias', label: string): string {
    return `
        <span class="jpdb-reader-field-display" aria-label="${escapeHtml(label)}">${escapeHtml(displayValue)}</span>
        <input name="${prefix}.${field}" type="hidden" value="${escapeHtml(formValue)}">
    `;
}

export function renderRecommendedDictionaries(installed: YomitanDictionaryInfo[]): string {
    const groups: Array<[RecommendedDictionary['category'], string]> = [
        ['terms', 'Term dictionaries'],
        ['kanji', 'Kanji dictionaries'],
        ['frequency', 'Frequency dictionaries'],
    ];

    return `
        <div class="jpdb-reader-recommended-title">Recommended dictionaries</div>
        <div class="jpdb-reader-help jpdb-reader-recommended-note" data-recommended-dictionary-help>${escapeHtml(uiText('en', 'dictionaryInstallQueueHelp'))}</div>
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
                <div class="jpdb-reader-help">${escapeHtml(uiText('en', dictionary.descriptionKey))}</div>
                <div class="jpdb-reader-recommended-status" data-recommended-dictionary-status role="status" aria-live="polite" hidden></div>
            </div>
            <button class="jpdb-reader-btn" type="button" data-action="download-recommended-dictionary" data-dictionary-id="${escapeHtml(dictionary.id)}" data-installed="${alreadyInstalled}">
                ${alreadyInstalled ? 'Update' : 'Install'}
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
    const furiganaMode = readOption(get('furiganaMode'), ['auto', 'all', 'difficult-kanji', 'known-status', 'off'] as const, current.furiganaMode);
    const colorSource = (key: string, fallback: ReaderColorSource) =>
        readOption(get(key), COLOR_SOURCE_VALUES, colorSourceFallback(key, fallback));
    const reader: SettingsFormReader = { get, has, number, colorSource };
    const jpdbDefinitionsRowPresent = hasJpdbDefinitionsRow(has);
    const dictionaryPreferences = readDictionaryPreferences(data, current.dictionaryPreferences);
    const kanjiDictionaryPreferences = dictionaryPreferences.filter(preference => preference.type === 'kanji');
    const settings: ReaderSettings = {
        ...current,
        apiKey: get('apiKey').trim(),
        interfaceLanguage: readOption(get('interfaceLanguage'), ['auto', 'en', 'ja'] as const, current.interfaceLanguage),
        ...readJpdbFormSettings(reader, current, jpdbDefinitionsRowPresent),
        ...readKanjiAddonFormSettings(reader, current),
        ...readAudioFormSettings(reader, current, audioSources),
        ...readColorFormSettings(reader, current),
        ...readImmersionKitFormSettings(reader, current),
        ...readLookupBehaviorFormSettings(reader, current),
        ...readNewTabFormSettings(reader, current),
        ...readReadingDisplayFormSettings(reader, furiganaMode),
        ...readOcrFormSettings(reader, current),
        ...readLocalDictionaryFormSettings(reader, current, kanjiDictionaryPreferences),
        dictionaryPreferences,
        dictionaryLookupLinks: readDictionaryLookupLinks(data),
        ...readSubtitleFormSettings(reader, current),
        ...readYoutubeFormSettings(reader),
        ...readAnkiFormSettings(reader, current),
        ...readStudyToolFormSettings(reader, current),
        enableLogging: has('enableLogging'),
        ...readPopupFormSettings(reader, current),
        ...readMiningFormSettings(reader),
        shortcuts: readShortcutFormSettings(reader),
    };
    log.info('Read settings form data', {
        enableLogging: settings.enableLogging,
        dictionaries: settings.dictionaryPreferences.length,
        lookupLinks: settings.dictionaryLookupLinks.length,
        audioSources: settings.audioSources.length,
        ocrEnabled: settings.ocrEnabled,
        subtitlePlayerEnabled: settings.subtitlePlayerEnabled,
        ankiEnabled: settings.ankiEnabled,
    });
    return settings;
}

function colorSourceFallback(key: string, fallback: ReaderColorSource): SelectableReaderColorSource {
    if (fallback !== 'auto') return fallback;
    return isColorSourceSettingName(key) ? DEFAULT_COLOR_SOURCE_VALUES[key] : 'jpdb';
}

function isColorSourceSettingName(value: string): value is ColorSourceSettingName {
    return Object.prototype.hasOwnProperty.call(DEFAULT_COLOR_SOURCE_VALUES, value);
}

function hasJpdbDefinitionsRow(has: (key: string) => boolean): boolean {
    return has('jpdbDefinitions.name') || has('jpdbDefinitions.priority') || has('jpdbDefinitions.enabled');
}

function readJpdbFormSettings(reader: SettingsFormReader, current: ReaderSettings, definitionsRowPresent: boolean): Partial<ReaderSettings> {
    const { has, number } = reader;
    return {
        jpdbDefinitionsEnabled: definitionsRowPresent ? has('jpdbDefinitions.enabled') : has('jpdbDefinitionsEnabled'),
        jpdbDefinitionsPriority: Math.max(0, Math.min(999, number('jpdbDefinitions.priority', current.jpdbDefinitionsPriority))),
    };
}

function readKanjiAddonFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { has, number } = reader;
    return {
        jpdbKanjiEnabled: has('jpdbKanji.enabled'),
        jpdbKanjiPriority: Math.max(0, Math.min(999, number('jpdbKanji.priority', current.jpdbKanjiPriority))),
        uchisenEnabled: has('uchisen.enabled'),
        uchisenPriority: Math.max(0, Math.min(999, number('uchisen.priority', current.uchisenPriority))),
        rtkEnabled: has('rtk.enabled'),
        rtkPriority: Math.max(0, Math.min(999, number('rtk.priority', current.rtkPriority))),
        kanjivgEnabled: has('kanjivg.enabled'),
        kanjivgPriority: Math.max(0, Math.min(999, number('kanjivg.priority', current.kanjivgPriority))),
        kanjiOriginsEnabled: has('kanjiOrigins.enabled'),
        kanjiOriginsPriority: Math.max(0, Math.min(999, number('kanjiOrigins.priority', current.kanjiOriginsPriority))),
        kanjiOriginKanjiMapEnabled: has('kanjiOriginKanjiMapEnabled'),
        kanjiOriginGraphEnabled: has('kanjiOriginGraphEnabled'),
        kanjiOriginRadicalImagesEnabled: has('kanjiOriginRadicalImagesEnabled'),
        similarKanjiWords: has('similarKanjiWords.enabled'),
        similarKanjiWordsPriority: Math.max(0, Math.min(999, number('similarKanjiWords.priority', current.similarKanjiWordsPriority))),
        similarKanjiWordLimit: Math.max(2, Math.min(24, number('similarKanjiWordLimit', current.similarKanjiWordLimit))),
    };
}

function readAudioFormSettings(reader: SettingsFormReader, current: ReaderSettings, audioSources: AudioSourceSetting[]): Partial<ReaderSettings> {
    const { get, has, number } = reader;
    return {
        audioEnabled: has('audioEnabled'),
        autoPlayAudio: has('autoPlayAudio'),
        audioAutoPlayMode: readOption(get('audioAutoPlayMode'), ['all', 'hover', 'tap'] as const, current.audioAutoPlayMode),
        audioSources,
        audioEnableDefaultSources: has('audioEnableDefaultSources'),
        audioSourceUrl: audioSources.find(source => source.url.trim())?.url.trim() ?? current.audioSourceUrl,
        audioViaBlob: current.audioViaBlob,
        audioFallbackChimeEnabled: has('audioFallbackChimeEnabled'),
        audioTimeoutMs: Math.max(1000, number('audioTimeoutMs', current.audioTimeoutMs)),
        audioSelectionMode: readOption(get('audioSelectionMode'), ['first', 'random'] as const, current.audioSelectionMode),
        audioTtsMode: readOption(get('audioTtsMode'), ['fallback', 'source-order'] as const, current.audioTtsMode),
    };
}

function readColorFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, colorSource } = reader;
    return {
        accentColor: sanitizeAccentColor(get('accentColor'), current.accentColor),
        wordColorNew: sanitizeAccentColor(get('wordColorNew'), current.wordColorNew),
        wordColorLearning: sanitizeAccentColor(get('wordColorLearning'), current.wordColorLearning),
        wordColorKnown: sanitizeAccentColor(get('wordColorKnown'), current.wordColorKnown),
        wordColorDue: sanitizeAccentColor(get('wordColorDue'), current.wordColorDue),
        wordColorFailed: sanitizeAccentColor(get('wordColorFailed'), current.wordColorFailed),
        wordColorIgnored: sanitizeAccentColor(get('wordColorIgnored'), current.wordColorIgnored),
        pitchColorHeiban: sanitizeAccentColor(get('pitchColorHeiban'), current.pitchColorHeiban),
        pitchColorAtamadaka: sanitizeAccentColor(get('pitchColorAtamadaka'), current.pitchColorAtamadaka),
        pitchColorNakadaka: sanitizeAccentColor(get('pitchColorNakadaka'), current.pitchColorNakadaka),
        pitchColorOdaka: sanitizeAccentColor(get('pitchColorOdaka'), current.pitchColorOdaka),
        pitchColorKifuku: sanitizeAccentColor(get('pitchColorKifuku'), current.pitchColorKifuku),
        pitchColorUnknown: sanitizeAccentColor(get('pitchColorUnknown'), current.pitchColorUnknown),
        wordHighlightColorSource: colorSource('wordHighlightColorSource', current.wordHighlightColorSource),
        wordUnderlineColorSource: colorSource('wordUnderlineColorSource', current.wordUnderlineColorSource),
        wordTextColorSource: colorSource('wordTextColorSource', current.wordTextColorSource),
        subtitleHighlightColorSource: colorSource('subtitleHighlightColorSource', current.subtitleHighlightColorSource),
        subtitleUnderlineColorSource: colorSource('subtitleUnderlineColorSource', current.subtitleUnderlineColorSource),
        subtitleTextColorSource: colorSource('subtitleTextColorSource', current.subtitleTextColorSource),
    };
}

function readLookupBehaviorFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { has, number } = reader;
    return {
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
    };
}

function readNewTabFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, number } = reader;
    return {
        newTabEnabled: has('newTabEnabled'),
        newTabSource: readOption(get('newTabSource'), ['auto', 'jpdb', 'anki', 'dictionary'] as const, current.newTabSource),
        newTabJpdbDeck: get('newTabJpdbDeck').trim() || current.newTabJpdbDeck,
        newTabJpdbReviewMode: readOption(get('newTabJpdbReviewMode'), ['auto', 'api-vocabulary', 'live-review'] as const, current.newTabJpdbReviewMode),
        corsProxyUrl: get('corsProxyUrl').trim(),
        newTabKanjiKeywordSource: readOption(get('newTabKanjiKeywordSource'), ['auto', 'rtk', 'jpdb', 'local'] as const, current.newTabKanjiKeywordSource),
        newTabParsingEnabled: has('newTabParsingEnabled'),
        newTabFrontSentenceEnabled: has('newTabFrontSentenceEnabled'),
        newTabOfflineEnabled: has('newTabOfflineEnabled'),
        newTabOfflineLimit: Math.max(0, Math.min(500, number('newTabOfflineLimit', current.newTabOfflineLimit))),
        newTabKanjiAutogradeEnabled: has('newTabKanjiAutogradeEnabled'),
        newTabKanjiAutoSubmit: has('newTabKanjiAutoSubmit'),
    };
}

function readReadingDisplayFormSettings(
    reader: SettingsFormReader,
    furiganaMode: ReaderSettings['furiganaMode'],
): Partial<ReaderSettings> {
    const { has } = reader;
    return {
        showFurigana: furiganaMode !== 'off',
        furiganaMode,
        showPitchAccent: has('showPitchAccent'),
        hideKnownFurigana: furiganaMode === 'known-status',
    };
}

function readLocalDictionaryFormSettings(reader: SettingsFormReader, current: ReaderSettings, kanjiPreferences: DictionaryPreference[]): Partial<ReaderSettings> {
    const { has, number } = reader;
    return {
        localDictionariesEnabled: has('localDictionariesEnabled'),
        localDictionaryShowKanji: has('kanjiDictionaries.enabled') || kanjiPreferences.some(preference => preference.enabled),
        kanjiDictionariesPriority: Math.max(0, Math.min(999, number('kanjiDictionaries.priority', current.kanjiDictionariesPriority))),
        dictionarySourcesInitiallyExpanded: has('dictionarySourcesInitiallyExpanded'),
        localDictionaryMaxResults: Math.max(1, Math.min(64, number('localDictionaryMaxResults', current.localDictionaryMaxResults))),
    };
}

function readAnkiFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has } = reader;
    return {
        ankiEnabled: has('ankiEnabled'),
        ankiConnectUrl: get('ankiConnectUrl').trim() || current.ankiConnectUrl,
        ankiDeck: get('ankiDeck').trim() || current.ankiDeck,
        ankiModel: get('ankiModel').trim() || current.ankiModel,
        ankiTemplateMode: readOption(get('ankiTemplateMode'), ['recognition', 'context'] as const, current.ankiTemplateMode),
        ankiFrontReading: has('ankiFrontReading'),
        ankiFrontSentence: has('ankiFrontSentence'),
        ankiFrontImage: has('ankiFrontImage'),
        ankiTags: get('ankiTags').trim(),
        ankiMineWithJpdb: has('ankiMineWithJpdb'),
        ankiCaptureScreenshot: has('ankiCaptureScreenshot'),
        ankiMobileHandoff: has('ankiMobileHandoff'),
    };
}

function readStudyToolFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { has, number } = reader;
    return {
        studyTranslationEnabled: has('studyTranslation.enabled'),
        studyTranslationPriority: Math.max(0, Math.min(999, number('studyTranslation.priority', current.studyTranslationPriority))),
        studyGrammarEnabled: has('studyGrammar.enabled'),
        studyGrammarPriority: Math.max(0, Math.min(999, number('studyGrammar.priority', current.studyGrammarPriority))),
    };
}

function readPopupFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, number } = reader;
    const popupMode = readOption(get('popupMode'), ['auto', 'sheet', 'popover'] as const, current.popupMode);
    return {
        theme: readOption(get('theme'), ['auto', 'dark', 'light'] as const, current.theme),
        popupMode,
        stickyBottomSheet: popupMode !== 'popover' && has('stickyBottomSheet'),
        popoverWidth: Math.max(280, Math.min(900, number('popoverWidth', current.popoverWidth))),
        popoverHeight: Math.max(220, Math.min(900, number('popoverHeight', current.popoverHeight))),
        popoverHeightMode: readOption(get('popoverHeightMode'), ['available', 'fixed'] as const, current.popoverHeightMode),
    };
}

function readMiningFormSettings(reader: SettingsFormReader): Partial<ReaderSettings> {
    const { get, has } = reader;
    return {
        jpdbMiningEnabled: has('jpdbMiningEnabled'),
        miningDeck: get('miningDeck').trim() || 'forq',
        neverForgetDeck: get('neverForgetDeck').trim() || 'never-forget',
        blacklistDeck: get('blacklistDeck').trim() || 'blacklist',
        addToForq: has('addToForq'),
        enableReviews: has('enableReviews'),
        twoButtonReviews: get('twoButtonReviews') === 'true',
    };
}

function readOcrFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, number } = reader;
    return {
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
    };
}

function readSubtitleFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, number } = reader;
    return {
        subtitlePlayerEnabled: has('subtitlePlayerEnabled'),
        subtitleAutoDetect: has('subtitleAutoDetect'),
        subtitleOverlayVisible: has('subtitleOverlayVisible'),
        subtitleSecondaryVisible: has('subtitleSecondaryVisible'),
        subtitleNativeBlurred: has('subtitleNativeBlurred'),
        subtitleKaraokeMode: has('subtitleKaraokeMode'),
        subtitleTranscriptVisible: has('subtitleTranscriptVisible'),
        subtitleTranscriptPlacement: readOption(get('subtitleTranscriptPlacement'), ['right', 'left', 'bottom'] as const, current.subtitleTranscriptPlacement),
        subtitleTranscriptAutoScroll: has('subtitleTranscriptAutoScroll'),
        subtitleAutoCopyLine: has('subtitleAutoCopyLine'),
        subtitleControlsMode: readOption(get('subtitleControlsMode'), ['auto', 'always', 'hidden'] as const, current.subtitleControlsMode),
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
    };
}

function readImmersionKitFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, number } = reader;
    const mediaEnabled = has('immersionKitEnabled');
    const sourceRowPresent = Boolean(get('immersionKit.name') || get('immersionKit.priority'));
    const sourceEnabled = sourceRowPresent ? has('immersionKit.enabled') : true;
    return {
        immersionKitEnabled: mediaEnabled && sourceEnabled,
        immersionKitExampleSource: readOption(get('immersionKitExampleSource'), ['immersion-kit', 'nadeshiko', 'combined'] as const, current.immersionKitExampleSource),
        nadeshikoApiKey: get('nadeshikoApiKey').trim(),
        immersionKitPriority: Math.max(0, Math.min(999, number('immersionKit.priority', current.immersionKitPriority))),
        immersionKitLimitEnabled: get('immersionKitLimitEnabled') === 'on',
        immersionKitLimit: Math.max(1, Math.min(12, number('immersionKitLimit', current.immersionKitLimit))),
        immersionKitMinLength: Math.max(0, Math.min(120, number('immersionKitMinLength', current.immersionKitMinLength))),
        immersionKitMaxLength: Math.max(0, Math.min(240, number('immersionKitMaxLength', current.immersionKitMaxLength))),
        immersionKitCategory: readOption(get('immersionKitCategory'), ['all', 'anime', 'drama', 'games'] as const, current.immersionKitCategory),
        immersionKitSort: readOption(get('immersionKitSort'), ['sentence_length:asc', 'sentence_length:desc'] as const, current.immersionKitSort),
        immersionKitExactMatch: has('immersionKitExactMatch'),
        immersionKitShowTranslation: has('immersionKitShowTranslation'),
        immersionKitRevealTranslationOnClick: has('immersionKitShowTranslation') && has('immersionKitRevealTranslationOnClick'),
        immersionKitShowImages: has('immersionKitShowImages'),
        immersionKitAutoPlayAudio: has('immersionKitAutoPlayAudio'),
        immersionKitPlayOnHover: has('immersionKitPlayOnHover'),
        immersionKitPlayOnImageClick: has('immersionKitPlayOnImageClick'),
        immersionKitPlaybackRate: Math.max(0.5, Math.min(2, number('immersionKitPlaybackRate', current.immersionKitPlaybackRate))),
    };
}

function readYoutubeFormSettings(reader: SettingsFormReader): Partial<ReaderSettings> {
    const { has } = reader;
    return {
        youtubeImmersionEnabled: has('youtubeImmersionEnabled'),
        youtubeShowFilterNotice: has('youtubeShowFilterNotice'),
    };
}

function readShortcutFormSettings(reader: SettingsFormReader): ReaderSettings['shortcuts'] {
    const { get } = reader;
    return {
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
    };
}

function readNumber(value: string, fallback: number): number {
    if (!value.trim()) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function readOption<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? value as T : fallback;
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
        type: readDictionaryType(get(`dictionaryPreferences.${index}.type`)),
    }))
        .filter(item => item.name)
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

function readDictionaryType(value: string): DictionaryPreference['type'] {
    return value === 'kanji' || value === 'frequency' || value === 'metadata' ? value : 'terms';
}

export function readAudioSources(data: FormData): AudioSourceSetting[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Number(get('audioSourceCount')) || 0);
    const sources: AudioSourceSetting[] = [];
    const builtInTypes = new Set(DEFAULT_AUDIO_SOURCES.map(source => source.type));

    for (let index = 0; index < count; index++) {
        const source = readAudioSourceRow(data, get, index);
        if (!source || shouldSkipAudioSourceRow(source, builtInTypes)) continue;
        sources.push(source);
    }

    return sources;
}

function readAudioSourceRow(data: FormData, get: (key: string) => string, index: number): AudioSourceSetting | null {
    return normalizeAudioSource({
        type: get(`audioSources.${index}.type`),
        url: get(`audioSources.${index}.url`).trim(),
        voice: get(`audioSources.${index}.voice`).trim(),
        enabled: data.has(`audioSources.${index}.enabled`),
    });
}

function shouldSkipAudioSourceRow(source: AudioSourceSetting, builtInTypes: Set<string>): boolean {
    return !source.enabled && !source.url && !source.voice && !builtInTypes.has(source.type);
}

export function getReaderSettingsExport(value: unknown): ReaderSettings | null {
    const record = readerSettingsExportRecord(value);
    return record && isReaderSettingsExport(record) ? record.settings as ReaderSettings : null;
}

function readerSettingsExportRecord(value: unknown): { formatName?: string; settings?: unknown } | null {
    return value && typeof value === 'object' ? value as { formatName?: string; settings?: unknown } : null;
}

function isReaderSettingsExport(record: { formatName?: string; settings?: unknown }): boolean {
    return isReaderSettingsExportFormat(record.formatName)
        && Boolean(record.settings)
        && typeof record.settings === 'object';
}

function isReaderSettingsExportFormat(formatName: string | undefined): boolean {
    return formatName === 'yomu-reader-settings' || formatName === 'jpdb-popup-reader-settings';
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
