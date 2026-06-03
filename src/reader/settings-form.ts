import { DISCORD_INVITE_URL, DOCS_BASE_URL, DONATE_URL, GITHUB_REPOSITORY_URL, NADESHIKO_DEVELOPER_URL, NEW_TAB_PAGE_URL, SETTINGS_TITLE, VIDEO_PLAYER_PAGE_URL } from './constants';
import { escapeHtml, setInnerHtml, unwrapReaderWords } from './dom';
import { audioSourceLabel, resolveUiLanguage, uiText } from './i18n';
import { externalLinkIcon, speakerIcon } from './icons';
import { AUDIO_GUIDE_URL, AUDIO_SOURCE_UI_TYPE_VALUES, DEFAULT_AUDIO_SOURCES, DEFAULT_OVERLAY_BACKGROUND_COLOR, DEFAULT_OVERLAY_OUTLINE_COLOR, DEFAULT_OVERLAY_TEXT_COLOR, DEFAULT_POPUP_FONT_FAMILY, DEFAULT_READER_FONT_FAMILY, MAX_DICTIONARY_LOOKUP_LINKS, accentToRgba, formatShortcutEvent, normalizeDictionaryLookupLinks, sanitizeAccentColor } from './settings';
import { COLOR_SOURCE_OPTIONS, COLOR_SOURCE_VALUES, CUSTOM_FONT_FAMILY_VALUE, readAudioSources, readDictionaryLookupLinks, readOption, settingsColorSourceValue } from './settings-form-read';
import { uniqueStrings } from './string-utils';
import type { AnkiFieldMappingRole, AudioSourceSetting, DictionaryLookupLink, ImmersionExampleSource, InterfaceLanguage, JPDBDeck, ReaderColorSource, ReaderSettings } from './types';
import type { RecommendedDictionary } from './recommended-dictionaries';
import { RECOMMENDED_JAPANESE_DICTIONARIES } from './recommended-dictionaries';
import { definitionSourceRows, kanjiSourceRows, type SettingsSourceRow } from './source-sections';
import type { YomitanDictionaryInfo } from './yomitan';

export { readAudioSources, readDictionaryLookupLinks, readFormSettings } from './settings-form-read';

const SETTINGS_LABEL_TEXT_CLASS = 'jpdb-reader-settings-label-text';
const COLOR_SOURCE_CLASS_VALUES: Exclude<ReaderColorSource, 'auto' | 'off'>[] = ['status', 'jpdb', 'anki', 'pitch'];
const ANKI_FIELD_MAPPING_ROLES: AnkiFieldMappingRole[] = ['expression', 'reading', 'meaning', 'sentence', 'audio', 'image'];
const PROXY_WORKER_SOURCE_URL = `${GITHUB_REPOSITORY_URL}/blob/main/workers/jpdb-public-proxy/src/index.ts`;
const PROXY_WORKER_README_URL = `${GITHUB_REPOSITORY_URL}/tree/main/workers/jpdb-public-proxy`;
type FontFamilySettingName = 'readerFontFamily' | 'popupFontFamily' | 'subtitleFontFamily';
export type SettingsStatusTone = 'pending' | 'success' | 'error';
export interface SettingsStatusLine {
    message: string;
    tone: SettingsStatusTone;
}
type AnkiMappingConfidence = 'high' | 'medium' | 'low';
type AnkiMappingConfidenceByRole = Partial<Record<AnkiFieldMappingRole, AnkiMappingConfidence>>;
const DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID = 'jpdb-reader-disabled-control-description';
const JAPANESE_SANS_FONT_FAMILY = '"Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
const HIRAGINO_YU_GOTHIC_FONT_FAMILY = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
const JAPANESE_SERIF_FONT_FAMILY = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", YuMincho, serif';
const FONT_FAMILY_PRESETS = [
    { value: DEFAULT_POPUP_FONT_FAMILY, labelKey: 'fontPresetYomuDefault', fallbackLabel: 'Yomu default' },
    { value: JAPANESE_SANS_FONT_FAMILY, labelKey: 'fontPresetJapaneseSans', fallbackLabel: 'Japanese sans' },
    { value: HIRAGINO_YU_GOTHIC_FONT_FAMILY, labelKey: 'fontPresetHiraginoYuGothic', fallbackLabel: 'Hiragino / Yu Gothic' },
    { value: JAPANESE_SERIF_FONT_FAMILY, labelKey: 'fontPresetJapaneseSerif', fallbackLabel: 'Japanese serif' },
    { value: DEFAULT_READER_FONT_FAMILY, labelKey: 'fontPresetSystemUi', fallbackLabel: 'System UI' },
] as const satisfies readonly { value: string; labelKey: Parameters<typeof uiText>[1]; fallbackLabel: string }[];

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
                    <p data-help-support-copy>よむ brings popup lookup, JPDB, OCR, subtitles, dictionaries, and Anki.</p>
                    <p data-help-support-copy-extra>Donations are optional.</p>
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

export function renderSettingsForm(settings: ReaderSettings, jpdbSettingsUrl: string): string {
    return `
            <div class="jpdb-reader-settings-head">
                <div class="jpdb-reader-settings-drag-handle"></div>
                <h2>${SETTINGS_TITLE}</h2>
            </div>
            ${renderSettingsTabs()}
            ${renderSettingsSearch(settings.interfaceLanguage)}
            <div class="jpdb-reader-settings-scroll">
            ${renderJpdbSettingsPanel(settings, jpdbSettingsUrl)}
            ${renderInterfaceSettingsPanel(settings)}
            ${renderNewTabSettingsPanel(settings)}
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
            ${renderHelpSettingsPanel(settings)}
            </div>
            ${renderSettingsFooter()}
        `;
}

function renderSettingsTabs(): string {
    return `
            <div class="jpdb-reader-settings-tabs" role="toolbar" aria-label="Settings sections">
                ${settingsTabButton('jpdb', 'JPDB', true)}
                ${settingsTabButton('newTab', 'New tab')}
                ${settingsTabButton('appearance', 'Appearance')}
                ${settingsTabButton('reading', 'Reading')}
                ${settingsTabButton('dictionaries', 'Dictionaries')}
                ${settingsTabButton('media', 'Media')}
                ${settingsTabButton('mining', 'Mining')}
                ${settingsTabButton('shortcuts', 'Shortcuts')}
                ${settingsTabButton('help', 'Help')}
            </div>
    `;
}

function renderSettingsSearch(language: InterfaceLanguage): string {
    return `
            <div class="jpdb-reader-settings-search">
                <label>
                    <span class="jpdb-reader-settings-label-text">${escapeHtml(uiText(language, 'settingsSearch'))}</span>
                    <input type="search" data-settings-search placeholder="${escapeHtml(uiText(language, 'settingsSearchPlaceholder'))}" autocomplete="off">
                </label>
            </div>
            <div class="jpdb-reader-settings-search-empty" data-settings-search-empty hidden>${escapeHtml(uiText(language, 'settingsSearchNoResults'))}</div>
    `;
}

function renderJpdbSettingsPanel(settings: ReaderSettings, jpdbSettingsUrl: string): string {
    const jpdbStatus = renderJpdbStatusLine(settings);
    return `
            <fieldset data-settings-panel="jpdb" data-legend-key="jpdb">
                <legend>JPDB</legend>
                ${input('apiKey', `API key <a href="${jpdbSettingsUrl}" target="_blank" rel="noopener">JPDB settings</a>`, settings.apiKey, 'password')}
                ${jpdbStatus}
                <div data-jpdb-decks>
                    ${renderDeckControls(settings, [], Boolean(settings.apiKey.trim()), settings.interfaceLanguage)}
                </div>
                ${checkbox('jpdbMiningEnabled', 'Allow JPDB review/deck changes', settings.jpdbMiningEnabled)}
                ${checkbox('addToForq', 'Also copy JPDB adds to forq', settings.jpdbMiningEnabled && settings.addToForq, { disabled: !settings.jpdbMiningEnabled })}
                ${checkbox('enableReviews', 'Show review buttons', settings.enableReviews)}
                <div data-review-config ${settings.enableReviews ? '' : 'hidden'}>
                    ${select('twoButtonReviews', 'Review rating scale', settings.twoButtonReviews ? 'true' : 'false', [['false', 'Five point: NOTHING to EASY'], ['true', 'Two point: FAIL / PASS']])}
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">JPDB page enhancements</div>
                    <div class="grid">
                        ${checkbox('jpdbPageEnhancementsEnabled', 'Enhance JPDB pages', settings.jpdbPageEnhancementsEnabled)}
                        ${checkbox('jpdbPageWordEnhancementsEnabled', 'Add sources to JPDB word/search pages', settings.jpdbPageEnhancementsEnabled && settings.jpdbPageWordEnhancementsEnabled, { disabled: !settings.jpdbPageEnhancementsEnabled })}
                        ${checkbox('jpdbPageKanjiEnhancementsEnabled', 'Add sources to JPDB kanji pages', settings.jpdbPageEnhancementsEnabled && settings.jpdbPageKanjiEnhancementsEnabled, { disabled: !settings.jpdbPageEnhancementsEnabled })}
                    </div>
                    <div class="jpdb-reader-help" data-jpdb-page-enhancements-help>JPDB page additions use the same source order as the Dictionaries and Kanji panels.</div>
                </div>
            </fieldset>
    `;
}

function renderJpdbStatusLine(settings: ReaderSettings): string {
    const { message, tone } = jpdbStatusLineForSettings(settings, settings.interfaceLanguage);
    return `<div class="jpdb-reader-help jpdb-reader-status-line" data-jpdb-status data-status-tone="${tone}" role="status" aria-live="polite">${formatSettingsStatusLine({ message, tone }, settings.interfaceLanguage)}</div>`;
}

export function jpdbStatusLineForSettings(settings: Pick<ReaderSettings, 'apiKey' | 'enableReviews' | 'jpdbMiningEnabled'>, language: InterfaceLanguage): SettingsStatusLine {
    return jpdbStatusLineFromValues(Boolean(settings.apiKey.trim()), settings.enableReviews, settings.jpdbMiningEnabled, language);
}

function jpdbStatusLineFromValues(hasApiKey: boolean, reviewsEnabled: boolean, deckSyncEnabled: boolean, language: InterfaceLanguage): SettingsStatusLine {
    if (!hasApiKey) {
        return {
            message: uiText(language, 'jpdbApiKeyMissing'),
            tone: 'pending',
        };
    }
    return {
        message: formatStatusTemplate(uiText(language, 'jpdbApiKeyConfigured'), {
            reviews: uiText(language, reviewsEnabled ? 'statusEnabled' : 'statusDisabled'),
            deckSync: uiText(language, deckSyncEnabled ? 'statusEnabled' : 'statusDisabled'),
        }),
        tone: reviewsEnabled || deckSyncEnabled ? 'success' : 'pending',
    };
}

export function ankiStatusLineForSettings(settings: Pick<ReaderSettings, 'ankiEnabled' | 'ankiConnectUrl' | 'ankiMobileHandoff'>, language: InterfaceLanguage): SettingsStatusLine {
    return ankiStatusLineFromValues(settings.ankiEnabled, settings.ankiConnectUrl, settings.ankiMobileHandoff, language);
}

export function formatSettingsStatusLine(line: SettingsStatusLine, language: InterfaceLanguage): string {
    return `${escapeHtml(uiText(language, settingsStatusToneLabelKey(line.tone)))}: ${escapeHtml(line.message)}`;
}

function settingsStatusToneLabelKey(tone: SettingsStatusTone): Parameters<typeof uiText>[1] {
    if (tone === 'success') return 'statusReady';
    if (tone === 'error') return 'statusError';
    return 'statusAttention';
}

function ankiStatusLineFromValues(ankiEnabled: boolean, ankiConnectUrl: string, mobileHandoffEnabled: boolean, language: InterfaceLanguage): SettingsStatusLine {
    const handoff = uiText(language, mobileHandoffEnabled ? 'ankiMobileHandoffEnabledStatus' : 'ankiMobileHandoffDisabledStatus');
    if (!ankiEnabled) {
        return {
            message: formatStatusTemplate(uiText(language, 'ankiMiningDisabledStatus'), { handoff }),
            tone: 'pending',
        };
    }
    return {
        message: formatStatusTemplate(uiText(language, 'ankiCheckingConnection'), {
            url: ankiConnectUrl.trim(),
            handoff,
        }),
        tone: 'pending',
    };
}

function renderInterfaceSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="appearance" data-legend-key="appearance">
                <legend>Appearance</legend>
                <div class="grid">
                    ${select('interfaceLanguage', 'Settings language', settings.interfaceLanguage, [['auto', 'Automatic'], ['en', 'English'], ['ja', '日本語']])}
                    ${themeSegmentedControl(settings.theme)}
                    ${select('popupMode', 'Popup mode', settings.popupMode, [['auto', 'Auto'], ['sheet', 'Bottom sheet'], ['popover', 'Popover']])}
                    ${renderStickyBottomSheetControl(settings)}
                    ${checkbox('popoverBackdropEnabled', 'Dim page behind popover', settings.popoverBackdropEnabled)}
                    ${input('popoverWidth', 'Popover width (px)', String(settings.popoverWidth), 'number', { min: 280, max: 900, step: 10 })}
                    ${input('popoverHeight', 'Popover height (px)', String(settings.popoverHeight), 'number', { min: 220, max: 900, step: 10 })}
                    ${select('popoverHeightMode', 'Popover height behavior', settings.popoverHeightMode, [['available', 'Grow to available space'], ['fixed', 'Use height setting']])}
                    ${fontFamilyControl('readerFontFamily', 'Reader interface font', settings.readerFontFamily)}
                    ${fontFamilyControl('popupFontFamily', 'Popup Japanese font', settings.popupFontFamily)}
                    ${input('popupFontWeight', 'Popup Japanese weight', String(settings.popupFontWeight), 'number', { min: 300, max: 900, step: 10 })}
                    ${input('accentColor', 'Accent color', sanitizeAccentColor(settings.accentColor), 'color')}
                </div>
                ${renderWordColorSettingsSubsection(settings)}
                ${renderColorChannelSettingsSubsection(settings)}
            </fieldset>
    `;
}

function renderStickyBottomSheetControl(settings: ReaderSettings): string {
    const unavailable = settings.popupMode === 'popover';
    return `
                    <div data-sticky-bottom-sheet-field ${unavailable ? 'hidden' : ''}>
                        ${checkbox('stickyBottomSheet', 'Keep bottom sheet open until closed', settings.stickyBottomSheet)}
                    </div>`;
}

function renderNewTabSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="newTab" data-legend-key="newTab" hidden>
                <legend>New tab</legend>
                ${renderNewTabSettingsSubsection(settings)}
            </fieldset>
    `;
}

function renderNewTabSettingsSubsection(settings: ReaderSettings): string {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">New tab</div>
                    <div class="grid">
                        ${checkbox('newTabEnabled', 'Use Yomu new tab study page', settings.newTabEnabled)}
                        ${checkbox('newTabAnkiEnabled', 'Use Anki cards on new tab', settings.newTabAnkiEnabled)}
                        ${renderNewTabAnkiDisabledDecksInput(settings)}
                        ${select('newTabSource', 'New tab review source', settings.newTabSource, [['auto', 'Auto: Anki if no JPDB'], ['jpdb', 'JPDB'], ['anki', 'Anki'], ['dictionary', 'Dictionary fallback']])}
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
                    <div class="jpdb-reader-help">Use this page as your new-tab URL or iPad Home Screen app. よむ refreshes cache when online and queues grades while offline.</div>
                </div>
    `;
}

function renderNewTabAnkiDisabledDecksInput(settings: ReaderSettings): string {
    const disabled = canonicalNewTabAnkiDisabledDecks(settings.newTabAnkiDisabledDecks);
    return `<input type="hidden" name="newTabAnkiDisabledDecks" value="${escapeHtml(disabled.join(', '))}">`;
}

export function renderNewTabAnkiDeckToggles(settings: ReaderSettings, deckNames: string[] = []): string {
    const disabled = canonicalNewTabAnkiDisabledDecks(settings.newTabAnkiDisabledDecks);
    const decks = [...new Set(deckNames.map(deck => deck.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const staleDisabled = disabled.filter(deck => !decks.includes(deck));
    const toggles = decks.length
        ? decks.map(deck => {
            const checked = !isNewTabAnkiDeckDisabled(deck, disabled);
            return `
                            <label class="jpdb-reader-settings-deck-toggle" data-active="${checked ? 'true' : 'false'}">
                                <input type="checkbox" data-newtab-anki-deck="${escapeHtml(deck)}" ${checked ? 'checked' : ''}>
                                <span>${escapeHtml(deck)}</span>
                            </label>`;
        }).join('')
        : `<div class="jpdb-reader-help">Scan Anki to load deck toggles. All decks are included by default.</div>`;
    const stale = staleDisabled.length
        ? `<div class="jpdb-reader-help">Skipped decks not currently loaded: ${escapeHtml(staleDisabled.join(', '))}</div>`
        : '';
    return `
                        <div class="jpdb-reader-settings-wide" data-newtab-anki-decks>
                            <input type="hidden" name="newTabAnkiDisabledDecks" value="${escapeHtml(disabled.join(', '))}">
                            ${staleDisabled.map(deck => `<input type="hidden" data-newtab-anki-retained-disabled-deck value="${escapeHtml(deck)}">`).join('')}
                            <div class="jpdb-reader-settings-label-text">Anki review decks</div>
                            <div class="jpdb-reader-settings-deck-grid">
${toggles}
                            </div>
                            ${stale}
                            <div class="jpdb-reader-settings-actions jpdb-reader-settings-actions-single">
                                <button class="jpdb-reader-btn secondary" type="button" data-action="scan-anki">Scan Anki library</button>
                            </div>
                        </div>`;
}

function renderWordColorSettingsSubsection(settings: ReaderSettings): string {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Word colors</div>
                    <div class="grid">
                        ${input('wordColorNew', 'New and in deck', settings.wordColorNew, 'color')}
                        ${input('wordColorLearning', 'Learning', settings.wordColorLearning, 'color')}
                        ${input('wordColorKnown', 'Known and never forget', settings.wordColorKnown, 'color')}
                        ${input('wordColorDue', 'Due', settings.wordColorDue, 'color')}
                        ${input('wordColorFailed', 'Failed', settings.wordColorFailed, 'color')}
                        ${input('wordColorIgnored', 'Ignored, suspended, and blacklisted', settings.wordColorIgnored, 'color')}
                    </div>
                </div>
    `;
}

export function canonicalNewTabAnkiDisabledDecks(deckNames: string[]): string[] {
    const unique: string[] = [];
    deckNames
        .map(deck => deck.trim())
        .filter(Boolean)
        .forEach(deck => {
            if (!unique.includes(deck)) unique.push(deck);
        });
    return unique.filter(deck => !unique.some(parent => parent !== deck && isAnkiSubdeckOf(deck, parent)));
}

export function isNewTabAnkiDeckDisabled(deck: string, disabledDecks: string[]): boolean {
    return disabledDecks.some(disabled => deck === disabled || isAnkiSubdeckOf(deck, disabled));
}

function isAnkiSubdeckOf(deck: string, parent: string): boolean {
    return Boolean(parent && deck.startsWith(`${parent}::`));
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

function renderAudioSettingsPanel(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    return `
            <fieldset data-settings-panel="media" data-legend-key="audio" aria-describedby="settings-help-audio" hidden>
                <legend>${escapeHtml(uiText(language, 'audio'))}</legend>
                <div class="grid">
                    ${checkbox('audioEnabled', uiText(language, 'audioEnabled'), settings.audioEnabled)}
                    ${checkbox('suppressAutoAudioOnVideo', uiText(language, 'suppressAutoAudioOnVideo'), settings.suppressAutoAudioOnVideo)}
                    ${checkbox('audioEnableDefaultSources', uiText(language, 'audioEnableDefaultSources'), settings.audioEnableDefaultSources)}
                    ${checkbox('audioFallbackChimeEnabled', uiText(language, 'audioFallbackChimeEnabled'), settings.audioFallbackChimeEnabled)}
                    ${select('audioAutoPlayMode', uiText(language, 'audioAutoPlayMode'), settings.autoPlayAudio ? settings.audioAutoPlayMode : 'off', [['off', uiText(language, 'off')], ['all', uiText(language, 'audioAutoPlayAll')], ['hover', uiText(language, 'audioAutoPlayHover')], ['tap', uiText(language, 'audioAutoPlayTap')]])}
                    ${select('audioSelectionMode', uiText(language, 'audioSelectionMode'), settings.audioSelectionMode, [['first', uiText(language, 'firstAudio')], ['random', uiText(language, 'randomAudio')]])}
                    ${select('audioTtsMode', uiText(language, 'audioTtsMode'), settings.audioTtsMode, [['fallback', uiText(language, 'audioTtsFallback')], ['source-order', uiText(language, 'audioTtsSourceOrder')]])}
                    ${input('audioTimeoutMs', uiText(language, 'audioTimeoutMs'), String(settings.audioTimeoutMs), 'number', { min: 1000, max: 30000, step: 500 })}
                    ${input('corsProxyUrl', uiText(language, 'corsProxyUrl'), settings.corsProxyUrl, 'url', { placeholder: 'https://your-worker.workers.dev' })}
                </div>
                ${renderProxySetupGuide(language)}
                <div class="jpdb-reader-audio-sources" data-source-editor data-audio-source-editor>
                    ${renderAudioSourceEditor(settings.audioSources, language)}
                </div>
                <div id="settings-help-audio" class="jpdb-reader-help" data-help-key="audioHelp">${audioHelpHtml(language)}</div>
            </fieldset>
    `;
}

function renderProxySetupGuide(language: InterfaceLanguage): string {
    return `
                <details class="jpdb-reader-proxy-guide">
                    <summary>${escapeHtml(uiText(language, 'audioProxyGuideSummary'))}</summary>
                    <div class="jpdb-reader-proxy-guide-body">
                        <p>${escapeHtml(uiText(language, 'audioProxyGuideIntro'))}</p>
                        <ol>
                            <li>${escapeHtml(uiText(language, 'audioProxyGuideCloudflare'))}</li>
                            <li>${escapeHtml(uiText(language, 'audioProxyGuideWorkers'))}</li>
                            <li>${escapeHtml(uiText(language, 'audioProxyGuideCreateWorker'))}</li>
                            <li>${escapeHtml(uiText(language, 'audioProxyGuideEditCode'))}</li>
                            <li>${escapeHtml(uiText(language, 'audioProxyGuideDeploy'))}</li>
                            <li>${escapeHtml(uiText(language, 'audioProxyGuideCopyUrl'))}</li>
                            <li>${escapeHtml(uiText(language, 'audioProxyGuidePasteUrl'))}</li>
                            <li>${escapeHtml(uiText(language, 'audioProxyGuideTest'))}</li>
                        </ol>
                        <p>${escapeHtml(uiText(language, 'audioProxyGuideNote'))}</p>
                        <div class="jpdb-reader-help-actions">
                            <a class="jpdb-reader-btn" href="${PROXY_WORKER_SOURCE_URL}" target="_blank" rel="noopener">${externalButtonLabel(uiText(language, 'audioProxyWorkerSource'))}</a>
                            <a class="jpdb-reader-btn" href="${PROXY_WORKER_README_URL}" target="_blank" rel="noopener">${externalButtonLabel(uiText(language, 'audioProxyDeployGuide'))}</a>
                        </div>
                    </div>
                </details>
    `;
}

function renderImmersionKitSettingsPanel(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    return `
            <fieldset data-settings-panel="media" data-legend-key="immersionKit" aria-describedby="settings-help-immersion-kit" hidden>
                <legend>${escapeHtml(uiText(language, 'immersionKit'))}</legend>
                <div class="grid">
                    ${checkbox('immersionKitEnabled', uiText(language, 'immersionKitEnabled'), settings.immersionKitEnabled)}
                    ${select('immersionKitExampleSource', uiText(language, 'immersionKitExampleSource'), settings.immersionKitExampleSource, [['immersion-kit', uiText(language, 'immersionKit')], ['nadeshiko', 'Nadeshiko'], ['combined', uiText(language, 'immersionKitAndNadeshiko')]])}
                    ${renderNadeshikoApiKeyField(settings)}
                    ${checkbox('immersionKitShowTranslation', uiText(language, 'immersionKitShowTranslation'), settings.immersionKitShowTranslation)}
                    ${checkbox('immersionKitRevealTranslationOnClick', uiText(language, 'immersionKitRevealTranslationOnClick'), settings.immersionKitRevealTranslationOnClick, { disabled: !settings.immersionKitShowTranslation })}
                    ${checkbox('immersionKitShowImages', uiText(language, 'immersionKitShowImages'), settings.immersionKitShowImages)}
                    ${select('immersionKitCategory', uiText(language, 'immersionKitCategory'), settings.immersionKitCategory, [['all', uiText(language, 'allCategories')], ['anime', uiText(language, 'anime')], ['drama', uiText(language, 'drama')], ['games', uiText(language, 'games')]])}
                    ${select('immersionKitSort', uiText(language, 'immersionKitSort'), settings.immersionKitSort, [['sentence_length:asc', uiText(language, 'shortestFirst')], ['sentence_length:desc', uiText(language, 'longestFirst')]])}
                    ${radioGroup('immersionKitLimitEnabled', uiText(language, 'immersionKitLimitEnabled'), settings.immersionKitLimitEnabled ? 'on' : 'off', [['off', uiText(language, 'allExamples')], ['on', uiText(language, 'limitExamples')]])}
                    ${input('immersionKitLimit', uiText(language, 'immersionKitLimit'), String(settings.immersionKitLimit), 'number', { min: 1, max: 12, step: 1 })}
                    ${input('immersionKitMinLength', uiText(language, 'immersionKitMinLength'), String(settings.immersionKitMinLength), 'number', { min: 0, max: 120, step: 1 })}
                    ${input('immersionKitMaxLength', uiText(language, 'immersionKitMaxLength'), String(settings.immersionKitMaxLength), 'number', { min: 0, max: 240, step: 1 })}
                    ${input('immersionKitPlaybackRate', uiText(language, 'immersionKitPlaybackRate'), String(settings.immersionKitPlaybackRate), 'number', { min: 0.5, max: 2, step: 0.05 })}
                    ${checkbox('immersionKitExactMatch', uiText(language, 'immersionKitExactMatch'), settings.immersionKitExactMatch)}
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapeHtml(uiText(language, 'audioPlayback'))}</div>
                    <div class="grid">
                        ${checkbox('immersionKitAutoPlayAudio', uiText(language, 'immersionKitAutoPlayAudio'), settings.immersionKitAutoPlayAudio)}
                        ${checkbox('immersionKitPlayOnHover', uiText(language, 'immersionKitPlayOnHover'), settings.immersionKitPlayOnHover)}
                        ${checkbox('immersionKitPlayOnImageClick', uiText(language, 'immersionKitPlayOnImageClick'), settings.immersionKitPlayOnImageClick)}
                    </div>
                </div>
                <div id="settings-help-immersion-kit" class="jpdb-reader-help" data-help-key="immersionKitHelp">${escapeHtml(uiText(language, 'immersionKitHelp'))}</div>
            </fieldset>
    `;
}

function renderNadeshikoApiKeyField(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    return `
                    <div data-nadeshiko-api-key-field ${usesNadeshikoExamples(settings.immersionKitExampleSource) ? '' : 'hidden'}>
                        ${input('nadeshikoApiKey', `${escapeHtml(uiText(language, 'nadeshikoApiKey'))} <a href="${NADESHIKO_DEVELOPER_URL}" target="_blank" rel="noopener">${externalButtonLabel(uiText(language, 'getNadeshikoKey'))}</a>`, settings.nadeshikoApiKey, 'password')}
                    </div>`;
}

function usesNadeshikoExamples(source: ImmersionExampleSource): boolean {
    return source === 'nadeshiko' || source === 'combined';
}

function renderReaderSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="reading" data-legend-key="reader" aria-describedby="settings-help-reader" hidden>
                <legend>Reader</legend>
                <div class="grid">
                    ${checkbox('parseSelection', 'Look up selected text', settings.parseSelection)}
                    ${checkbox('lookupOnClick', 'Look up on tap or click', settings.lookupOnClick)}
                    ${checkbox('lookupOnHover', 'Look up on hover', settings.lookupOnHover)}
                    ${checkbox('lookupOnMiddleMouse', 'Look up with middle-mouse hold', settings.lookupOnMiddleMouse)}
                    ${checkbox('showFloatingButton', 'Toggle floating puck on pages', settings.showFloatingButton)}
                    ${select('furiganaMode', 'Furigana', settings.furiganaMode, [['auto', 'Automatic'], ['difficult-kanji', 'Difficult kanji only'], ['known-status', 'Hide known words'], ['all', 'All parsed words'], ['off', 'Off']])}
                    ${checkbox('showPitchAccent', 'Show pitch accent', settings.showPitchAccent)}
                </div>
                ${renderPitchColorSettingsSubsection(settings)}
                ${renderHoverLookupSettingsSubsection(settings)}
                <div id="settings-help-reader" class="jpdb-reader-help" data-help-key="readerHelp">Hover lookup uses the Hold while hovering shortcut in this panel. Leave it blank for plain hover. Middle-button scanning blocks browser autoscroll while held, but still leaves normal middle-clicks on links alone.</div>
            </fieldset>
    `;
}

function renderHoverLookupSettingsSubsection(settings: ReaderSettings): string {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-hover-lookup-title>Hover lookup</div>
                    <div class="grid">
                        ${shortcutInput('shortcuts.hoverLookup', 'Hold while hovering', settings.shortcuts.hoverLookup, 'Blank means hover without a key')}
                        ${input('hoverOpenDelayMs', 'Hover open delay (ms)', String(settings.hoverOpenDelayMs), 'number')}
                        ${input('hoverCloseDelayMs', 'Hover close delay (ms)', String(settings.hoverCloseDelayMs), 'number')}
                    </div>
                </div>
    `;
}

function renderKanjiSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="reading" data-legend-key="kanji" aria-describedby="settings-help-kanji" hidden>
                <legend>Kanji</legend>
                <div class="jpdb-reader-kanji-priorities" data-source-editor>
                    ${renderKanjiSourceRows(settings)}
                </div>
                <div class="grid">
                    ${checkbox('kanjiOriginKanjiMapEnabled', 'Show kanji facts and component graph', settings.kanjiOriginKanjiMapEnabled)}
                    ${checkbox('kanjiOriginGraphEnabled', 'Show component graph', settings.kanjiOriginGraphEnabled)}
                    ${checkbox('kanjiOriginRadicalImagesEnabled', 'Show radical images', settings.kanjiOriginRadicalImagesEnabled)}
                    ${input('similarKanjiWordLimit', 'Similar word limit', String(settings.similarKanjiWordLimit), 'number', { min: 2, max: 24, step: 1 })}
                </div>
                <div id="settings-help-kanji" class="jpdb-reader-help" data-help-key="kanjiHelp">Click a kanji inside a popup word to open its detail view. Toggle and reorder the kanji sources here: stroke practice, readings and components, RTK, imported kanji dictionaries, related words, and the component graph.</div>
            </fieldset>
    `;
}

function renderImageSettingsPanel(settings: ReaderSettings): string {
    const localOcrHidden = settings.ocrProvider === 'local-service' ? '' : 'hidden';
    const cloudOcrHidden = settings.ocrProvider === 'cloud-vision' ? '' : 'hidden';
    return `
            <fieldset data-settings-panel="media" data-legend-key="images" aria-describedby="settings-help-ocr" hidden>
                <legend>Image text (OCR)</legend>
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
                <div id="settings-help-ocr" class="jpdb-reader-help" data-help-key="ocrHelp">Images are read quietly near the viewport. Google Lens handles normal images by default; Cloud Vision can be used with an API key, and embedded OCR metadata is instant. Recognized areas stay transparent until you tap or hover.</div>
            </fieldset>
    `;
}

function renderVideoSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="media" data-legend-key="video" hidden>
                <legend>Video</legend>
                <div class="grid">
                    ${checkbox('subtitlePlayerEnabled', 'Enable video subtitle player', settings.subtitlePlayerEnabled)}
                    ${checkbox('subtitleAutoDetect', 'Auto-detect page subtitles', settings.subtitleAutoDetect)}
                    ${checkbox('subtitleOverlayVisible', 'Show subtitle overlay', settings.subtitleOverlayVisible)}
                    ${checkbox('subtitleSecondaryVisible', 'Show native subtitles when available', settings.subtitleSecondaryVisible)}
                    ${checkbox('subtitleNativeBlurred', 'Blur native subtitles until hover', settings.subtitleNativeBlurred)}
                    ${checkbox('subtitleKaraokeMode', 'Karaoke word timing', settings.subtitleKaraokeMode)}
                    ${checkbox('subtitleTranscriptVisible', 'Open transcript panel by default', settings.subtitleTranscriptVisible)}
                    ${checkbox('subtitlePausePanel', 'Open side panel when paused', settings.subtitlePausePanel)}
                    ${checkbox('subtitleTranscriptAutoScroll', 'Scroll transcript with playback', settings.subtitleTranscriptAutoScroll)}
                    ${checkbox('subtitleAutoCopyLine', 'Auto-copy each subtitle line as it plays', settings.subtitleAutoCopyLine)}
                    ${checkbox('subtitleMiningPause', 'Pause video when mining subtitle', settings.subtitleMiningPause)}
                    ${select('subtitleControlsMode', 'Subtitle controls', settings.subtitleControlsMode, [['auto', 'Compact controls'], ['hidden', 'Hide controls'], ['always', 'Always visible']])}
                    ${input('subtitleFontSize', 'Subtitle font size (px)', String(settings.subtitleFontSize), 'number')}
                    ${input('subtitleBottomOffset', 'Subtitle bottom offset (%)', String(settings.subtitleBottomOffset), 'number')}
                    ${input('subtitleTextColor', 'Subtitle color', settings.subtitleTextColor, 'color')}
                    ${input('subtitleOutlineColor', 'Subtitle outline', settings.subtitleOutlineColor, 'color')}
                    ${input('subtitleBackgroundColor', 'Subtitle background', settings.subtitleBackgroundColor, 'color')}
                    ${input('subtitleBackgroundOpacity', 'Subtitle background opacity', String(settings.subtitleBackgroundOpacity), 'number')}
                    ${fontFamilyControl('subtitleFontFamily', 'Subtitle font family', settings.subtitleFontFamily)}
                    ${input('subtitleFontWeight', 'Subtitle font weight', String(settings.subtitleFontWeight), 'number')}
                    ${input('subtitleSeekPadding', 'Subtitle seek padding (s)', String(settings.subtitleSeekPadding), 'number')}
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
            <fieldset data-settings-panel="media" data-legend-key="youTube" aria-describedby="settings-help-youtube" hidden>
                <legend>YouTube</legend>
                <div class="grid">
                    ${checkbox('youtubeImmersionEnabled', 'Only show Japanese YouTube videos', settings.youtubeImmersionEnabled)}
                    ${checkbox('preferJapaneseSiteLanguage', 'Prefer Japanese site language and location', settings.preferJapaneseSiteLanguage)}
                    ${checkbox('youtubeShowFilterNotice', 'Show a temporary hidden-video notice', settings.youtubeShowFilterNotice)}
                </div>
                <div id="settings-help-youtube" class="jpdb-reader-help" data-youtube-help>On by default. The language preference asks sites for Japanese UI and Japan-local content where a userscript can.</div>
            </fieldset>
    `;
}

function renderMiningSettingsPanel(settings: ReaderSettings): string {
    const ankiStatus = ankiStatusLineForSettings(settings, settings.interfaceLanguage);
    return `
            <fieldset data-settings-panel="mining" data-legend-key="anki" aria-describedby="settings-help-anki" hidden>
                <legend>Anki</legend>
                <input type="hidden" name="ankiFieldMappings" value="${escapeHtml(JSON.stringify(settings.ankiFieldMappings))}">
                <input type="hidden" data-anki-scan-fields value="{}">
                <input type="hidden" data-anki-scan-confidence value="{}">
                <div class="jpdb-reader-anki-layout">
                    <div class="jpdb-reader-anki-main">
                        <div class="grid jpdb-reader-anki-connection-grid">
                            ${checkbox('ankiEnabled', 'Enable Anki mining', settings.ankiEnabled)}
                            ${checkbox('ankiMineWithJpdb', 'Also add to Anki when adding to JPDB', settings.jpdbMiningEnabled && settings.ankiMineWithJpdb, { disabled: !settings.jpdbMiningEnabled })}
                            ${checkbox('ankiCaptureScreenshot', 'Attach context image when possible', settings.ankiCaptureScreenshot)}
                            <div class="jpdb-reader-settings-wide">${checkbox('ankiMobileHandoff', 'Use mobile Anki handoff fallback', settings.ankiMobileHandoff)}</div>
                            ${input('ankiConnectUrl', 'AnkiConnect URL', settings.ankiConnectUrl)}
                            <div class="jpdb-reader-settings-wide jpdb-reader-help jpdb-reader-status-line" data-anki-status data-status-tone="${ankiStatus.tone}" role="status" aria-live="polite">${formatSettingsStatusLine(ankiStatus, settings.interfaceLanguage)}</div>
                        </div>
                        <div class="jpdb-reader-settings-subsection">
                            <div id="settings-help-anki" class="jpdb-reader-help" data-anki-setup-help></div>
                            <div class="jpdb-reader-settings-actions jpdb-reader-anki-actions">
                                <button class="jpdb-reader-btn" type="button" data-action="test-anki">Check</button>
                                <button class="jpdb-reader-btn secondary" type="button" data-action="scan-anki">Scan</button>
                                <button class="jpdb-reader-btn secondary" type="button" data-action="prepare-anki">Create</button>
                            </div>
                        </div>
                        <div class="jpdb-reader-settings-subsection jpdb-reader-anki-library-choice">
                            <div class="jpdb-reader-local-title" data-anki-library-choices-title>${escapeHtml(uiText(settings.interfaceLanguage, 'ankiLibraryChoices'))}</div>
                            <div class="jpdb-reader-help" data-anki-library-choices-help>${escapeHtml(uiText(settings.interfaceLanguage, 'ankiLibraryChoicesHelp'))}</div>
                            <div class="jpdb-reader-anki-choice-grid">
                                <label><span class="jpdb-reader-settings-label-text">Anki deck</span><select name="ankiDeck" data-anki-deck-options>${renderAnkiLibraryOptions([settings.ankiDeck].filter(Boolean), settings.ankiDeck, settings.interfaceLanguage)}</select></label>
                                <label><span class="jpdb-reader-settings-label-text">Anki note type</span><select name="ankiModel" data-anki-model-options>${renderAnkiLibraryOptions([settings.ankiModel, ...Object.keys(settings.ankiFieldMappings)].filter(Boolean), settings.ankiModel, settings.interfaceLanguage)}</select></label>
                            </div>
                        </div>
                        <div class="jpdb-reader-settings-subsection jpdb-reader-anki-template-settings">
                            <div class="jpdb-reader-local-title" data-anki-template-settings-title>${escapeHtml(uiText(settings.interfaceLanguage, 'ankiTemplateSettings'))}</div>
                            <div class="jpdb-reader-help" data-anki-template-settings-help>${escapeHtml(uiText(settings.interfaceLanguage, 'ankiTemplateSettingsHelp'))}</div>
                            <div class="grid jpdb-reader-anki-card-grid">
                                ${select('ankiTemplateMode', 'Anki card template', settings.ankiTemplateMode, [['recognition', 'Word first'], ['context', 'Sentence first']])}
                                ${checkbox('ankiFrontReading', 'Word-first front: show reading', settings.ankiFrontReading)}
                                ${checkbox('ankiFrontSentence', 'Word-first front: show sentence', settings.ankiFrontSentence)}
                                ${checkbox('ankiFrontImage', 'Show image on front', settings.ankiFrontImage)}
                                ${input('ankiTags', 'Tags', settings.ankiTags)}
                            </div>
                            <div data-anki-template-preview>
                                ${renderAnkiTemplatePreview(settings)}
                            </div>
                        </div>
                    </div>
                    <div class="jpdb-reader-settings-subsection jpdb-reader-anki-adapter" data-anki-library-adapter>
                        <div class="jpdb-reader-local-title" data-anki-library-adapter-title>Existing library adapter</div>
                        <div class="jpdb-reader-help" data-anki-library-availability>AnkiConnect availability controls deck scans, field mapping, existing-note updates, and new-tab Anki reviews. AnkiMobile/AnkiDroid handoff can only create new notes.</div>
                        <div data-anki-field-mapping-editor>
                            ${renderAnkiFieldMappingEditor(settings, settings.ankiModel, [], settings.interfaceLanguage)}
                        </div>
                    </div>
                </div>
            </fieldset>
    `;
}

export function renderAnkiLibraryOptions(options: string[], value: string, language: InterfaceLanguage = 'en'): string {
    const values = uniqueStrings([value, ...options].filter(Boolean));
    const rows = values.map(option => `<option value="${escapeHtml(option)}" ${option === value ? 'selected' : ''}>${escapeHtml(option)}</option>`);
    return rows.length ? rows.join('') : `<option value="" selected>${escapeHtml(uiText(language, 'scanAnkiFirst'))}</option>`;
}

function formatStatusTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

export function renderAnkiFieldMappingEditor(
    settings: ReaderSettings,
    modelName = settings.ankiModel,
    scannedFields: string[] = [],
    language: InterfaceLanguage = settings.interfaceLanguage,
    confidenceByRole: AnkiMappingConfidenceByRole = {},
): string {
    const model = modelName.trim();
    const mapping = model ? settings.ankiFieldMappings[model] ?? {} : {};
    const fields = uniqueStrings([...scannedFields, ...Object.values(mapping).filter(Boolean)]);
    const options = (selected = '') => [
        `<option value="" ${selected ? '' : 'selected'}>${escapeHtml(uiText(language, 'notMapped'))}</option>`,
        ...fields.map(field => `<option value="${escapeHtml(field)}" ${field === selected ? 'selected' : ''}>${escapeHtml(field)}</option>`),
    ].join('');
    const rows = ANKI_FIELD_MAPPING_ROLES.map(role => {
        const value = mapping[role] ?? '';
        const roleLabel = ankiFieldMappingRoleLabel(role, language);
        const confidence = value ? confidenceByRole[role] : undefined;
        return `
                <label>
                    <span class="jpdb-reader-anki-field-role-row">
                        <span>${escapeHtml(roleLabel)}</span>
                        ${confidence ? renderAnkiMappingConfidence(confidence, language) : ''}
                    </span>
                    <select data-anki-field-role="${escapeHtml(role)}" aria-label="${escapeHtml(uiText(language, 'ankiFieldMappingSelect').replace('{role}', roleLabel))}">
                        ${options(value)}
                    </select>
                </label>
        `;
    }).join('');
    const emptyState = fields.length ? '' : `<div class="jpdb-reader-help">${escapeHtml(uiText(language, 'noScannedFields'))}</div>`;
    return `
            <div data-anki-field-mapping-model="${escapeHtml(model)}">
                <div class="jpdb-reader-help">${escapeHtml(uiText(language, 'mappingForNoteType').replace('{model}', model || uiText(language, 'currentNoteType')))}</div>
                <div class="grid">
                    ${rows}
                </div>
                ${fields.length ? `<div class="jpdb-reader-help">${escapeHtml(uiText(language, 'ankiMappingConfidenceHelp'))}</div>` : ''}
                ${emptyState}
            </div>
    `;
}

function renderAnkiMappingConfidence(confidence: AnkiMappingConfidence, language: InterfaceLanguage): string {
    const key = confidence === 'high' ? 'ankiMappingHighConfidence' : confidence === 'medium' ? 'ankiMappingMediumConfidence' : 'ankiMappingLowConfidence';
    return `<span class="jpdb-reader-anki-confidence" data-confidence="${confidence}">${escapeHtml(uiText(language, key))}</span>`;
}

function ankiFieldMappingRoleLabel(role: AnkiFieldMappingRole, language: InterfaceLanguage): string {
    return {
        expression: uiText(language, 'ankiRoleExpression'),
        reading: uiText(language, 'ankiRoleReading'),
        meaning: uiText(language, 'ankiRoleMeaning'),
        sentence: uiText(language, 'ankiRoleSentence'),
        audio: uiText(language, 'ankiRoleAudio'),
        image: uiText(language, 'ankiRoleImage'),
    }[role];
}

function renderDictionariesSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="dictionaries" data-legend-key="dictionaries" hidden>
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
                    <div class="jpdb-reader-help">Open the current word in external dictionaries. Use {query}, or {word} and {reading} when a site needs them separately.</div>
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
            <fieldset data-settings-panel="shortcuts" data-legend-key="shortcuts" hidden>
                <legend>Shortcuts</legend>
                <div class="grid">
                    ${shortcutInput('shortcuts.scanPage', 'Scan page', settings.shortcuts.scanPage)}
                    ${shortcutInput('shortcuts.openSettings', 'Open settings', settings.shortcuts.openSettings)}
                    ${shortcutInput('shortcuts.playAudio', 'Play audio', settings.shortcuts.playAudio)}
                    ${shortcutInput('shortcuts.closePopup', 'Close popup', settings.shortcuts.closePopup)}
                    ${shortcutInput('shortcuts.previousLookupWord', 'Previous word', settings.shortcuts.previousLookupWord)}
                    ${shortcutInput('shortcuts.nextLookupWord', 'Next word', settings.shortcuts.nextLookupWord)}
                    ${shortcutInput('shortcuts.previousSubtitle', 'Previous subtitle', settings.shortcuts.previousSubtitle)}
                    ${shortcutInput('shortcuts.nextSubtitle', 'Next subtitle', settings.shortcuts.nextSubtitle)}
                    ${shortcutInput('shortcuts.copySubtitle', 'Copy subtitle', settings.shortcuts.copySubtitle)}
                    ${shortcutInput('shortcuts.toggleOcr', 'Toggle image reading', settings.shortcuts.toggleOcr)}
                    ${shortcutInput('shortcuts.toggleYoutubeImmersion', 'Toggle YouTube filter', settings.shortcuts.toggleYoutubeImmersion)}
                    ${shortcutInput('shortcuts.scanImages', 'Read images now', settings.shortcuts.scanImages)}
                    ${renderReviewShortcutInputs(settings)}
                </div>
            </fieldset>
    `;
}

function renderHelpSettingsPanel(settings: ReaderSettings): string {
    return `
            <fieldset data-settings-panel="help" data-legend-key="help" hidden>
                <legend>Help</legend>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-diagnostics-title>Diagnostics</div>
                    <div class="grid">
                        ${checkbox('enableLogging', 'Enable console logging', settings.enableLogging)}
                    </div>
                    <div class="jpdb-reader-help" data-diagnostics-help>Use this only when troubleshooting. It prints reader diagnostics to the browser console.</div>
                </div>
                ${renderHelpLinksPanel()}
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

// Settings labels should use sentence case, action-first verbs for toggles,
// and explicit unit suffixes such as (px), (ms), (%), or (s) where relevant.
function input(name: string, label: string, value: string, type = 'text', attributes: Record<string, string | number> = {}): string {
    const attributeHtml = Object.entries(attributes)
        .map(([key, attributeValue]) => ` ${key}="${escapeHtml(String(attributeValue))}"`)
        .join('');
    return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" autocomplete="off"${attributeHtml}></label>`;
}

function shortcutInput(name: string, label: string, value: string, placeholder = 'Press keys'): string {
    return `<label>${label}<input data-shortcut-input name="${name}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" inputmode="none" aria-label="${escapeHtml(label)}"></label>`;
}

function checkbox(name: string, label: string, checked: boolean, attributes: Record<string, boolean> = {}): string {
    const attributeHtml = Object.entries(attributes)
        .filter(([, value]) => value)
        .map(([key]) => ` ${key}`)
        .join('');
    return `<label class="inline"><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}${attributeHtml}>${label}</label>`;
}

function select(name: string, label: string, value: string, options: [string, string][]): string {
    return `<label>${label}<select name="${name}">${options.map(([optionValue, text]) =>
        `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(text)}</option>`,
    ).join('')}</select></label>`;
}

function fontFamilyControl(name: FontFamilySettingName, label: string, value: string): string {
    const selectedValue = fontFamilyPresetValue(value);
    return `
        <div class="jpdb-reader-font-family-control" data-font-family-control="${name}">
            ${select(name, label, selectedValue, fontFamilyOptions())}
            <label class="jpdb-reader-font-family-custom" data-font-family-custom ${selectedValue === CUSTOM_FONT_FAMILY_VALUE ? '' : 'hidden'}>
                Custom font stack
                <input name="${name}Custom" type="text" value="${escapeHtml(value)}" placeholder="&quot;Noto Sans JP&quot;, sans-serif" autocomplete="off">
            </label>
        </div>
    `;
}

function fontFamilyPresetValue(value: string): string {
    return FONT_FAMILY_PRESETS.some(preset => preset.value === value) ? value : CUSTOM_FONT_FAMILY_VALUE;
}

function fontFamilyOptions(text?: SettingsText): [string, string][] {
    return [
        ...FONT_FAMILY_PRESETS.map(preset => [
            preset.value,
            text ? text(preset.labelKey) : preset.fallbackLabel,
        ] as [string, string]),
        [CUSTOM_FONT_FAMILY_VALUE, text ? text('fontPresetCustom') : 'Custom...'],
    ];
}

function radioGroup(name: string, label: string, value: string, options: [string, string][]): string {
    return `<fieldset class="jpdb-reader-radio-group"><legend>${label}</legend>${options.map(([optionValue, text]) =>
        `<label class="inline"><input name="${name}" type="radio" value="${escapeHtml(optionValue)}" ${optionValue === value ? 'checked' : ''}>${escapeHtml(text)}</label>`,
    ).join('')}</fieldset>`;
}

function themeSegmentedControl(value: ReaderSettings['theme']): string {
    const isDark = value === 'dark';
    return `
        <label class="jpdb-reader-theme-field" data-theme-field>
            <span class="jpdb-reader-theme-title" id="jpdb-reader-theme-label" data-theme-title>Theme</span>
            <input type="hidden" name="theme" value="${escapeHtml(value)}" data-theme-value>
            <div class="VPNavBarAppearance appearance jpdb-reader-theme-appearance">
                <button class="VPSwitch VPSwitchAppearance jpdb-reader-theme-switch" type="button" role="switch" data-theme-switch data-newtab-action="theme" aria-label="${isDark ? 'Switch to light theme' : 'Switch to dark theme'}" aria-describedby="jpdb-reader-theme-label" aria-checked="${isDark}" title="${isDark ? 'Switch to light theme' : 'Switch to dark theme'}">
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
    unwrapReaderWords(form, { includeReaderRoot: true, excludeSelector: '[data-settings-preview-lookup]' });
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
    syncSettingsSelectOptionMeta(form, language);
    normalizeSettingsLabelTextContainers(form);
    syncDisabledSettingsControlDescriptions(form, language);
}

export function syncDisabledSettingsControlDescriptions(form: HTMLFormElement, language: InterfaceLanguage): void {
    const description = ensureDisabledControlDescription(form);
    description.textContent = uiText(language, 'disabledControlDescription');
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:disabled, select:disabled, textarea:disabled').forEach(control => {
        appendDescribedBy(control, DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID);
    });
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)').forEach(control => {
        removeDescribedBy(control, DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID);
    });
}

function ensureDisabledControlDescription(form: HTMLFormElement): HTMLElement {
    let description = form.querySelector<HTMLElement>(`#${DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID}`);
    if (description) return description;
    description = document.createElement('div');
    description.id = DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID;
    description.className = 'jpdb-reader-sr-only';
    form.prepend(description);
    return description;
}

function appendDescribedBy(control: HTMLElement, id: string): void {
    const ids = new Set((control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
    ids.add(id);
    control.setAttribute('aria-describedby', Array.from(ids).join(' '));
}

function removeDescribedBy(control: HTMLElement, id: string): void {
    const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).filter(value => value !== id);
    if (ids.length) control.setAttribute('aria-describedby', ids.join(' '));
    else control.removeAttribute('aria-describedby');
}

type SettingsText = (key: Parameters<typeof uiText>[1]) => string;
type SettingsTextKey = Parameters<typeof uiText>[1];

function localizeSettingsShell(form: HTMLFormElement, language: InterfaceLanguage, text: SettingsText): void {
    form.lang = resolveUiLanguage(language);
    form.setAttribute('aria-label', text('settingsTitle'));
    form.querySelector('h2')?.replaceChildren(text('settingsTitle'));
    form.querySelector<HTMLElement>('.jpdb-reader-settings-tabs')?.setAttribute('aria-label', text('settingsSections'));
    form.querySelector<HTMLElement>('.jpdb-reader-settings-drag-handle')?.setAttribute('aria-label', text('resizeSettings'));
    localizeThemeSwitch(form, text);
    localizeSettingsTabs(form, text);
    localizeSettingsSearch(form, text);
    localizeSettingsLegends(form, text);
}

function localizeThemeSwitch(form: HTMLFormElement, text: SettingsText): void {
    const switchButton = form.querySelector<HTMLButtonElement>('[data-theme-switch]');
    if (!switchButton) return;
    const isDark = switchButton.getAttribute('aria-checked') === 'true';
    const label = isDark ? text('switchToLightTheme') : text('switchToDarkTheme');
    switchButton.setAttribute('aria-label', label);
    switchButton.title = label;
}

function localizeSettingsTabs(form: HTMLFormElement, text: SettingsText): void {
    const tabLabels: Record<string, SettingsTextKey> = {
        jpdb: 'jpdb',
        newTab: 'newTab',
        appearance: 'appearance',
        reading: 'reading',
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

function localizeSettingsSearch(form: HTMLFormElement, text: SettingsText): void {
    const input = form.querySelector<HTMLInputElement>('[data-settings-search]');
    input?.closest('label')?.querySelector<HTMLElement>(':scope > .jpdb-reader-settings-label-text')?.replaceChildren(text('settingsSearch'));
    if (input) {
        input.placeholder = text('settingsSearchPlaceholder');
        input.setAttribute('aria-label', text('settingsSearch'));
    }
    form.querySelector<HTMLElement>('[data-settings-search-empty]')?.replaceChildren(text('settingsSearchNoResults'));
    applySettingsSearch(form, input?.value ?? '');
}

function localizeSettingsLegends(form: HTMLFormElement, text: SettingsText): void {
    getSettingsPanelFieldsets(form).forEach(fieldset => {
        const key = fieldset.dataset.legendKey;
        if (!isSettingsTextKey(key)) return;
        directFieldsetLegend(fieldset)?.replaceChildren(text(key));
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
    localizeFontFamilyCustomLabels(form, text);
}

function localizeBlockControlLabel(form: HTMLFormElement, name: string, label: string): void {
    const labelElement = getNamedControl<HTMLInputElement>(form, name)?.closest('label');
    if (labelElement) setBlockLabelText(labelElement, label);
}

function localizeFontFamilyCustomLabels(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLLabelElement>('.jpdb-reader-font-family-custom').forEach(label => {
        setBlockLabelText(label, text('customFontFamily'));
    });
}

function localizeSettingsSectionTitles(form: HTMLFormElement, text: SettingsText): void {
    replaceLocalTitle(form, /Word colors|単語の色/, text('wordColors'));
    replaceLocalTitle(form, /Pitch accent colors|ピッチアクセント/, text('pitchAccentColors'));
    replaceLocalTitle(form, /Color channels|色チャンネル/, text('colorChannels'));
    replaceLocalTitle(form, /New tab|新規タブ/, text('newTab'));
    replaceLocalTitle(form, /JPDB page enhancements|JPDBページ拡張/, text('jpdbPageEnhancements'));
    replaceLocalTitle(form, /Lookup pills|検索ピル/, text('lookupPills'));
    form.querySelector<HTMLElement>('[data-hover-lookup-title]')?.replaceChildren(text('hoverLookupSettings'));
    form.querySelector<HTMLElement>('[data-diagnostics-title]')?.replaceChildren(text('diagnostics'));
    form.querySelector<HTMLElement>('[data-anki-library-adapter-title]')?.replaceChildren(text('ankiLibraryAdapter'));
    form.querySelector<HTMLElement>('[data-color-channels-help]')?.replaceChildren(text('colorChannelsHelp'));
    form.querySelector<HTMLElement>('[data-jpdb-page-enhancements-help]')?.replaceChildren(text('jpdbPageEnhancementsHelp'));
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
    setSelectOptionLabels(form, 'readerFontFamily', fontFamilyOptions(text));
    setSelectOptionLabels(form, 'popupFontFamily', fontFamilyOptions(text));
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
        ['off', text('off')],
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
        ['immersion-kit', text('immersionKit')],
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
    setSelectOptionLabels(form, 'subtitleTranscriptPlacement', [
        ['right', text('right')],
        ['left', text('left')],
        ['bottom', text('bottom')],
    ]);
    setSelectOptionLabels(form, 'subtitleFontFamily', fontFamilyOptions(text));
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
    form.querySelector<HTMLElement>('[data-anki-library-choices-title]')?.replaceChildren(text('ankiLibraryChoices'));
    form.querySelector<HTMLElement>('[data-anki-library-choices-help]')?.replaceChildren(text('ankiLibraryChoicesHelp'));
    form.querySelector<HTMLElement>('[data-anki-template-settings-title]')?.replaceChildren(text('ankiTemplateSettings'));
    form.querySelector<HTMLElement>('[data-anki-template-settings-help]')?.replaceChildren(text('ankiTemplateSettingsHelp'));
    form.querySelectorAll<HTMLElement>('[data-confidence]').forEach(chip => {
        const confidence = chip.dataset.confidence;
        if (confidence === 'high') chip.replaceChildren(text('ankiMappingHighConfidence'));
        else if (confidence === 'medium') chip.replaceChildren(text('ankiMappingMediumConfidence'));
        else if (confidence === 'low') chip.replaceChildren(text('ankiMappingLowConfidence'));
    });
}

function localizeSettingsShortcuts(form: HTMLFormElement, text: SettingsText): void {
    setShortcutPlaceholder(form, 'shortcuts.hoverLookup', text('blankPlainHover'));
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
    localizeKeyedHelpText(form, text);
    form.querySelector<HTMLElement>('[data-youtube-help]')?.replaceChildren(text('youtubeHelp'));
    localizeNewTabHelp(form, text);
    localizeDictionaryImportHelp(form, text);
    localizeLookupPillsHelp(form, text);
    form.querySelector<HTMLElement>('[data-anki-setup-help]')?.replaceChildren(text('ankiHelp'));
    form.querySelector<HTMLElement>('[data-anki-library-availability]')?.replaceChildren(text('ankiLibraryAdapterStatus'));
    form.querySelector<HTMLElement>('[data-diagnostics-help]')?.replaceChildren(text('diagnosticsHelp'));
    form.querySelector<HTMLElement>('details[data-local-ocr] > summary')?.replaceChildren(text('ocrCustomLocalServer'));
}

function localizeNewTabHelp(form: HTMLFormElement, text: SettingsText): void {
    const subsection = getNamedControl<HTMLInputElement>(form, 'newTabUrl')?.closest<HTMLElement>('.jpdb-reader-settings-subsection');
    subsection?.querySelector<HTMLElement>(':scope > .jpdb-reader-help')?.replaceChildren(text('newTabOfflineHelp'));
}

function resolveUiLanguageFromText(text: SettingsText): 'en' | 'ja' {
    return text('save') === '保存' ? 'ja' : 'en';
}

function localizeKeyedHelpText(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLElement>('[data-help-key]').forEach(help => {
        const key = help.dataset.helpKey;
        if (!isSettingsTextKey(key)) return;
        if (key === 'audioHelp') {
            setInnerHtml(help, audioHelpHtml(resolveUiLanguageFromText(text)));
            return;
        }
        help.replaceChildren(text(key));
    });
}

function isSettingsTextKey(value: string | undefined): value is SettingsTextKey {
    return Boolean(value);
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
    form.querySelectorAll<HTMLButtonElement>('[data-action="test-anki"]').forEach(button => button.replaceChildren(text('testAnki')));
    form.querySelectorAll<HTMLButtonElement>('[data-action="prepare-anki"]').forEach(button => button.replaceChildren(text('prepareAnki')));
    form.querySelectorAll<HTMLButtonElement>('[data-action="scan-anki"]').forEach(button => button.replaceChildren(text('scanAnki')));
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
    localizeJpdbStatus(form, text);
    localizeInitialAnkiStatus(form, text);
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
    form.querySelectorAll<HTMLElement>('[data-source-name-key]').forEach(element => {
        const key = element.dataset.sourceNameKey;
        if (isSettingsTextKey(key)) element.replaceChildren(text(key));
    });
    form.querySelectorAll<HTMLElement>('[data-source-help-key]').forEach(element => {
        const key = element.dataset.sourceHelpKey;
        if (isSettingsTextKey(key)) element.replaceChildren(text(key));
    });
    replaceSourceHelp(form, /Import Yomitan dictionaries|Yomitan辞書をインポート/, text('importLocalDefinitionsHelp'));
    replaceSourceHelp(form, /Frequency, pitch, and kanji metadata|頻度、ピッチ、漢字メタデータ/, text('frequencyMetadataHelp'));
    // Keep these fallback English names paired with the sourceName*/sourceHelp* i18n keys.
    const rows: Array<[string, SettingsTextKey, SettingsTextKey]> = [
        ['Translation', 'sourceNameTranslation', 'sourceHelpTranslation'],
        ['Grammar', 'sourceNameGrammar', 'sourceHelpGrammar'],
        ['Immersion Kit', 'sourceNameImmersionKit', 'sourceHelpImmersionKit'],
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
    form.querySelectorAll<HTMLInputElement>('input[name^="audioSources."][name$=".enabled"]').forEach((input, index) => {
        input.setAttribute('aria-label', text('enableAudioSourceNumber').replace('{number}', String(index + 1)));
    });
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
    const language = resolveUiLanguageFromText(text);
    Array.from(select.options).forEach(option => {
        if (!isAudioSourceTypeValue(option.value)) return;
        const label = audioSourceLabel(language, option.value);
        option.textContent = option.value === 'custom'
            ? text('customAdvanced').replace('{label}', label)
            : label;
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

function localizeJpdbStatus(form: HTMLFormElement, text: SettingsText): void {
    const status = form.querySelector<HTMLElement>('[data-jpdb-status]');
    if (!status) return;
    const hasApiKey = Boolean(form.querySelector<HTMLInputElement>('input[name="apiKey"]')?.value.trim());
    const reviewsEnabled = form.querySelector<HTMLInputElement>('input[name="enableReviews"]')?.checked ?? true;
    const deckSyncEnabled = form.querySelector<HTMLInputElement>('input[name="jpdbMiningEnabled"]')?.checked ?? true;
    const line = jpdbStatusLineFromValues(hasApiKey, reviewsEnabled, deckSyncEnabled, resolveUiLanguageFromText(text));
    status.dataset.statusTone = line.tone;
    status.replaceChildren(line.message);
}

function localizeInitialAnkiStatus(form: HTMLFormElement, text: SettingsText): void {
    const status = form.querySelector<HTMLElement>('[data-anki-status]');
    if (!status || !isInitialAnkiSettingsStatus(status.textContent ?? '')) return;
    const ankiEnabled = form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]')?.checked ?? false;
    const ankiConnectUrl = form.querySelector<HTMLInputElement>('input[name="ankiConnectUrl"]')?.value ?? '';
    const mobileHandoffEnabled = form.querySelector<HTMLInputElement>('input[name="ankiMobileHandoff"]')?.checked ?? false;
    const line = ankiStatusLineFromValues(ankiEnabled, ankiConnectUrl, mobileHandoffEnabled, resolveUiLanguageFromText(text));
    status.dataset.statusTone = line.tone;
    status.replaceChildren(line.message);
}

function isInitialAnkiSettingsStatus(value: string): boolean {
    return /Checking AnkiConnect|Anki mining disabled|AnkiConnect.*確認中|Ankiマイニングは無効/.test(value);
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
        ['jpdbPageEnhancementsEnabled', 'jpdbPageEnhancementsEnabled'],
        ['jpdbPageWordEnhancementsEnabled', 'jpdbPageWordEnhancementsEnabled'],
        ['jpdbPageKanjiEnhancementsEnabled', 'jpdbPageKanjiEnhancementsEnabled'],
        ['interfaceLanguage', 'settingsLanguage'],
        ['popupMode', 'popupMode'],
        ['stickyBottomSheet', 'stickyBottomSheet'],
        ['popoverBackdropEnabled', 'popoverBackdropEnabled'],
        ['popoverWidth', 'popoverWidth'],
        ['popoverHeight', 'popoverHeight'],
        ['popoverHeightMode', 'popoverHeightMode'],
        ['readerFontFamily', 'readerFontFamily'],
        ['popupFontFamily', 'popupFontFamily'],
        ['popupFontWeight', 'popupFontWeight'],
        ['enableLogging', 'enableLogging'],
        ['accentColor', 'accentColor'],
        ['newTabEnabled', 'newTabEnabled'],
        ['newTabAnkiEnabled', 'newTabAnkiEnabled'],
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
        ['showFloatingButton', 'showFloatingButton'],
        ['furiganaMode', 'furiganaMode'],
        ['showPitchAccent', 'showPitchAccent'],
        ['kanjiOriginKanjiMapEnabled', 'kanjiOriginKanjiMapEnabled'],
        ['kanjiOriginGraphEnabled', 'kanjiOriginGraphEnabled'],
        ['kanjiOriginRadicalImagesEnabled', 'kanjiOriginRadicalImagesEnabled'],
        ['similarKanjiWordLimit', 'similarKanjiWordLimit'],
        ['audioEnabled', 'audioEnabled'],
        ['suppressAutoAudioOnVideo', 'suppressAutoAudioOnVideo'],
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
        ['subtitlePausePanel', 'subtitlePausePanel'],
        ['subtitleTranscriptPlacement', 'subtitleTranscriptPlacement'],
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
        ['youtubeImmersionEnabled', 'youtubeImmersionEnabled'],
        ['preferJapaneseSiteLanguage', 'preferJapaneseSiteLanguage'],
        ['youtubeShowFilterNotice', 'youtubeShowFilterNotice'],
        ['jpdbDefinitionsEnabled', 'jpdbDefinitionsEnabled'],
        ['localDictionariesEnabled', 'localDictionariesEnabled'],
        ['dictionarySourcesInitiallyExpanded', 'dictionarySourcesInitiallyExpanded'],
        ['localDictionaryMaxResults', 'localDictionaryMaxResults'],
        ['shortcuts.hoverLookup', 'holdWhileHovering'],
        ['hoverOpenDelayMs', 'hoverOpenDelayMs'],
        ['hoverCloseDelayMs', 'hoverCloseDelayMs'],
        ['shortcuts.scanPage', 'scanPage'],
        ['shortcuts.openSettings', 'openSettings'],
        ['shortcuts.playAudio', 'playAudio'],
        ['shortcuts.closePopup', 'closePopup'],
        ['shortcuts.previousLookupWord', 'previousLookupWord'],
        ['shortcuts.nextLookupWord', 'nextLookupWord'],
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
    const container = directSettingsLabelTextContainer(label);
    if (container) {
        setLeadingText(container, text);
        return;
    }
    const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as Text | undefined;
    if (textNode) textNode.textContent = text;
    else label.insertBefore(document.createTextNode(text), label.firstChild);
}

function setInlineLabelText(label: Element, text: string): void {
    const container = directSettingsLabelTextContainer(label);
    if (container) {
        container.replaceChildren(text);
        return;
    }
    const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) as Text | undefined;
    if (textNode) textNode.textContent = text;
    else label.append(document.createTextNode(text));
}

function directSettingsLabelTextContainer(label: Element): HTMLElement | null {
    return Array.from(label.children).find((child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains(SETTINGS_LABEL_TEXT_CLASS),
    ) ?? null;
}

function setLeadingText(container: HTMLElement, text: string): void {
    const textNode = Array.from(container.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as Text | undefined;
    if (textNode) textNode.textContent = text;
    else container.insertBefore(document.createTextNode(text), container.firstChild);
}

function normalizeSettingsLabelTextContainers(form: HTMLFormElement): void {
    form.querySelectorAll<HTMLLabelElement>('label').forEach(normalizeSettingsLabelTextContainer);
}

function normalizeSettingsLabelTextContainer(label: HTMLLabelElement): void {
    let pending: ChildNode[] = [];
    const flush = () => {
        if (!pending.length) return;
        const wrapper = document.createElement('span');
        wrapper.className = SETTINGS_LABEL_TEXT_CLASS;
        label.insertBefore(wrapper, pending[0]);
        pending.forEach(node => wrapper.append(node));
        pending = [];
    };

    for (const node of Array.from(label.childNodes)) {
        if (isWrappableSettingsLabelNode(node)) {
            pending.push(node);
            continue;
        }
        flush();
    }
    flush();
}

function isWrappableSettingsLabelNode(node: ChildNode): boolean {
    if (node.nodeType === Node.TEXT_NODE) return Boolean((node.textContent ?? '').trim());
    return node instanceof HTMLAnchorElement;
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

function syncSettingsSelectOptionMeta(form: HTMLFormElement, language: InterfaceLanguage): void {
    const showMeta = resolveUiLanguage(language) === 'ja';
    form.querySelectorAll<HTMLSelectElement>('select').forEach(selectElement => {
        const existing = selectElement.nextElementSibling;
        if (existing instanceof HTMLElement && existing.matches('[data-settings-select-options-meta]')) existing.remove();
        if (!showMeta) return;
        const labels = Array.from(selectElement.options)
            .map(option => option.textContent?.replace(/\s+/g, ' ').trim() ?? '')
            .filter(label => /[\u3040-\u30ff\u3400-\u9fff]/.test(label));
        if (!labels.length) return;
        const meta = document.createElement('div');
        meta.className = 'jpdb-reader-select-options-meta';
        meta.dataset.settingsSelectOptionsMeta = '';
        meta.textContent = `${uiText(language, 'selectOptions')}: ${labels.join(' / ')}`;
        selectElement.insertAdjacentElement('afterend', meta);
    });
}

function setShortcutPlaceholder(form: HTMLFormElement, name: string, placeholder: string): void {
    const inputElement = getNamedControl<HTMLInputElement>(form, name);
    if (inputElement) inputElement.placeholder = placeholder;
}

function getSettingsPanelFieldsets(form: HTMLFormElement): HTMLFieldSetElement[] {
    return Array.from(form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-settings-panel]'));
}

function directFieldsetLegend(fieldset: HTMLFieldSetElement | undefined): HTMLLegendElement | null {
    return Array.from(fieldset?.children ?? []).find((child): child is HTMLLegendElement =>
        child instanceof HTMLLegendElement,
    ) ?? null;
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
}

function externalButtonLabel(label: string): string {
    return `<span>${escapeHtml(label)}</span>${externalLinkIcon()}`;
}

function setExternalButtonLabel(element: HTMLElement | null | undefined, label: string): void {
    if (!element) return;
    setInnerHtml(element, externalButtonLabel(label));
}

function renderReviewShortcutInputs(settings: ReaderSettings): string {
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
    const normalizedPanel = normalizeSettingsPanel(panel);
    const search = form.querySelector<HTMLInputElement>('[data-settings-search]');
    if (search?.value.trim()) {
        search.value = '';
        applySettingsSearch(form, '');
    }
    form.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach(section => {
        section.hidden = section.dataset.settingsPanel !== normalizedPanel;
    });
    form.querySelectorAll<HTMLButtonElement>('[data-action="settings-panel"]').forEach(button => {
        const active = button.dataset.panel === normalizedPanel;
        button.setAttribute('aria-pressed', String(active));
        button.tabIndex = active ? 0 : -1;
    });
}

export function applySettingsSearch(form: HTMLFormElement, query: string): void {
    const searchInput = form.querySelector<HTMLInputElement>('[data-settings-search]');
    const empty = form.querySelector<HTMLElement>('[data-settings-search-empty]');
    const normalizedQuery = normalizeSettingsSearchText(query);
    if (searchInput && searchInput.value !== query) searchInput.value = query;
    form.dataset.settingsSearching = normalizedQuery ? 'true' : 'false';

    if (!normalizedQuery) {
        if (empty) empty.hidden = true;
        activateSettingsPanelWithoutClearingSearch(form, activeSettingsPanel(form));
        return;
    }

    let visibleCount = 0;
    getSettingsPanelFieldsets(form).forEach(fieldset => {
        const matches = normalizeSettingsSearchText(fieldset.textContent ?? '').includes(normalizedQuery);
        fieldset.hidden = !matches;
        if (matches) visibleCount += 1;
    });
    if (empty) empty.hidden = visibleCount > 0;
}

function activateSettingsPanelWithoutClearingSearch(form: HTMLFormElement, panel: string): void {
    const normalizedPanel = normalizeSettingsPanel(panel);
    form.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach(section => {
        section.hidden = section.dataset.settingsPanel !== normalizedPanel;
    });
    form.querySelectorAll<HTMLButtonElement>('[data-action="settings-panel"]').forEach(button => {
        const active = button.dataset.panel === normalizedPanel;
        button.setAttribute('aria-pressed', String(active));
        button.tabIndex = active ? 0 : -1;
    });
}

function activeSettingsPanel(form: HTMLFormElement): string {
    return form.querySelector<HTMLButtonElement>('[data-action="settings-panel"][aria-pressed="true"]')?.dataset.panel ?? 'jpdb';
}

function normalizeSettingsPanel(panel: string): string {
    return panel === 'basics' ? 'jpdb' : panel;
}

function normalizeSettingsSearchText(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function renderAudioSourceEditor(sources: AudioSourceSetting[], language: InterfaceLanguage = 'en'): string {
    return `
        <div class="jpdb-reader-audio-source-head jpdb-reader-order-head">
            <span>${escapeHtml(uiText(language, 'enabledHeader'))}</span>
            <span>${escapeHtml(uiText(language, 'audioSource'))}</span>
            <span>${escapeHtml(uiText(language, 'urlVoice'))}</span>
            <span>${escapeHtml(uiText(language, 'orderHeader'))}</span>
            <span>${escapeHtml(uiText(language, 'removeHeader'))}</span>
        </div>
        ${renderAudioSourceRows(audioSourceRowsForSettings(sources), language)}
        <button class="jpdb-reader-btn" type="button" data-action="audio-source-add">${escapeHtml(uiText(language, 'addAudioSource'))}</button>
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

function renderAudioSourceRows(rows: AudioSourceSetting[], language: InterfaceLanguage): string {
    const count = rows.length;

    return `
        <input type="hidden" name="audioSourceCount" value="${count}">
        ${rows.map((source, index) => `
            <div class="jpdb-reader-audio-source-row jpdb-reader-order-row" data-source-row data-audio-source-row data-source-id="audio-${index}">
                <label class="inline jpdb-reader-audio-index jpdb-reader-order-toggle">
                    <input name="audioSources.${index}.enabled" type="checkbox" aria-label="${escapeHtml(uiText(language, 'enableAudioSourceNumber').replace('{number}', String(index + 1)))}" ${source.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                <div class="jpdb-reader-audio-source-choice">
                    <select name="audioSources.${index}.type" aria-label="${escapeHtml(uiText(language, 'audioSourceNumber').replace('{number}', String(index + 1)))}">
                        ${audioSourceSelectOptions(source.type, language).map(([optionValue, text]) =>
                            `<option value="${escapeHtml(optionValue)}" ${optionValue === source.type ? 'selected' : ''}>${escapeHtml(text)}</option>`,
                        ).join('')}
                    </select>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="preview-audio" title="${escapeHtml(uiText(language, 'previewAudio'))}" aria-label="${escapeHtml(uiText(language, 'previewAudio'))}">${speakerIcon()}</button>
                </div>
                <div class="jpdb-reader-audio-source-fields">
                    <input data-audio-url-field name="audioSources.${index}.url" type="text" value="${escapeHtml(source.url)}" placeholder="${escapeHtml(audioUrlPlaceholder(source.type, language))}" ${audioSourceUsesUrl(source.type) ? '' : 'hidden'}>
                    <select data-audio-voice-field name="audioSources.${index}.voice" aria-label="${escapeHtml(uiText(language, 'textToSpeechVoiceNumber').replace('{number}', String(index + 1)))}" data-selected-voice="${escapeHtml(source.voice)}" ${audioSourceUsesVoice(source.type) ? '' : 'hidden'}>
                        <option value="${escapeHtml(source.voice)}">${escapeHtml(source.voice || uiText(language, 'automaticBrowserVoice'))}</option>
                    </select>
                </div>
                <div class="jpdb-reader-row-tools jpdb-reader-row-order-tools" aria-label="${escapeHtml(uiText(language, 'audioSourceOrder'))}">
                    <button type="button" class="jpdb-reader-icon-mini jpdb-reader-drag-handle" data-source-drag-handle tabindex="-1" title="${escapeHtml(uiText(language, 'dragToReorder'))}" aria-label="${escapeHtml(uiText(language, 'dragToReorder'))}">${miniIcon('drag')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-up" title="${escapeHtml(uiText(language, 'moveUp'))}" aria-label="${escapeHtml(uiText(language, 'moveUp'))}">${miniIcon('up')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-down" title="${escapeHtml(uiText(language, 'moveDown'))}" aria-label="${escapeHtml(uiText(language, 'moveDown'))}">${miniIcon('down')}</button>
                </div>
                <div class="jpdb-reader-row-tools jpdb-reader-row-remove-tools">
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-remove" title="${escapeHtml(uiText(language, 'remove'))}" aria-label="${escapeHtml(uiText(language, 'remove'))}">${miniIcon('remove')}</button>
                </div>
            </div>
        `).join('')}
    `;
}

function audioSourceSelectOptions(type: AudioSourceSetting['type'], language: InterfaceLanguage): [AudioSourceSetting['type'], string][] {
    if (type === 'custom') {
        return [
            ...AUDIO_SOURCE_UI_TYPE_VALUES.map(value => [value, audioSourceLabel(language, value)] as [AudioSourceSetting['type'], string]),
            ['custom', uiText(language, 'customAdvanced').replace('{label}', audioSourceLabel(language, 'custom'))],
        ];
    }
    return AUDIO_SOURCE_UI_TYPE_VALUES.map(value => [value, audioSourceLabel(language, value)] as [AudioSourceSetting['type'], string]);
}

function audioSourceRowsForSettings(sources: AudioSourceSetting[]): AudioSourceSetting[] {
    const rows = sources.map(source => ({ ...source }));
    return rows.length ? rows : DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
}

function audioHelpHtml(language: InterfaceLanguage): string {
    const copy = uiText(language, 'audioHelp');
    const linkLabel = uiText(language, 'audioGuideLinkLabel');
    const [before, after = ''] = copy.split(linkLabel);
    return `${escapeHtml(before)}<a href="${AUDIO_GUIDE_URL}" target="_blank" rel="noopener">${escapeHtml(linkLabel)}</a>${escapeHtml(after)}`;
}

function audioUrlPlaceholder(type: AudioSourceSetting['type'], language: InterfaceLanguage): string {
    if (type === 'custom-json') return uiText(language, 'audioCustomJsonPlaceholder');
    if (type === 'custom') return uiText(language, 'audioCustomUrlPlaceholder');
    return uiText(language, 'audioBuiltInPlaceholder');
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
                const label = `${voice.name}${voice.lang ? ` (${voice.lang})` : ''}${voice.default ? ` - ${text('defaultVoiceSuffix')}` : ''}`;
                return `<option value="${escapeHtml(voice.name)}" ${voice.name === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
            }),
        ];
        if (selected && !sortedVoices.some(voice => voice.name === selected)) {
            options.push(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(text('savedVoiceLabel').replace('{voice}', selected))}</option>`);
        }
        setInnerHtml(select, options.join(''));
    });
}

function isAudioSourceTypeValue(value: string): value is AudioSourceSetting['type'] {
    return (AUDIO_SOURCE_UI_TYPE_VALUES as readonly string[]).includes(value) || value === 'custom';
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
    setInnerHtml(container, renderAudioSourceEditor(sources, form.lang === 'ja' ? 'ja' : 'en'));
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
                        <button type="button" class="jpdb-reader-icon-mini jpdb-reader-drag-handle" data-source-drag-handle tabindex="-1" title="Drag to reorder" aria-label="Drag to reorder">${miniIcon('drag')}</button>
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
    const language = settingsLanguageForElement(container);
    rows.forEach((row, index) => {
        row.dataset.sourceId = `audio-${index}`;
        row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[name^="audioSources."]').forEach(control => {
            control.name = control.name.replace(/^audioSources\.\d+\./, `audioSources.${index}.`);
            if (control instanceof HTMLSelectElement && control.name.endsWith('.type')) {
                control.setAttribute('aria-label', uiText(language, 'audioSourceNumber').replace('{number}', String(index + 1)));
            }
            if (control instanceof HTMLInputElement && control.name.endsWith('.enabled')) {
                control.setAttribute('aria-label', uiText(language, 'enableAudioSourceNumber').replace('{number}', String(index + 1)));
            }
            if (control instanceof HTMLSelectElement && control.name.endsWith('.voice')) {
                control.setAttribute('aria-label', uiText(language, 'textToSpeechVoiceNumber').replace('{number}', String(index + 1)));
            }
        });
    });
}

function syncDictionaryLookupLinkIndexes(container: HTMLElement, rows = Array.from(container.querySelectorAll<HTMLElement>('[data-lookup-link-row]'))): void {
    const language = settingsLanguageForElement(container);
    rows.forEach((row, index) => {
        row.dataset.index = String(index);
        row.dataset.sourceId = `lookup-link-${index}`;
        row.querySelectorAll<HTMLInputElement>('[name^="dictionaryLookupLinks."]').forEach(control => {
            control.name = control.name.replace(/^dictionaryLookupLinks\.\d+\./, `dictionaryLookupLinks.${index}.`);
            if (control.name.endsWith('.label')) control.setAttribute('aria-label', uiText(language, 'lookupPillLabelNumber').replace('{number}', String(index + 1)));
            if (control.name.endsWith('.urlTemplate')) control.setAttribute('aria-label', uiText(language, 'lookupUrlTemplateNumber').replace('{number}', String(index + 1)));
        });
    });
}

function settingsLanguageForElement(element: HTMLElement): InterfaceLanguage {
    const form = element.closest<HTMLFormElement>('form');
    return form ? getFormInterfaceLanguage(form, 'en') : 'en';
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

export function syncFontFamilyControls(form: HTMLFormElement): void {
    form.querySelectorAll<HTMLElement>('[data-font-family-control]').forEach(control => {
        const selectElement = control.querySelector<HTMLSelectElement>('select');
        const customField = control.querySelector<HTMLElement>('[data-font-family-custom]');
        if (customField) customField.hidden = selectElement?.value !== CUSTOM_FONT_FAMILY_VALUE;
    });
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
    preview.style.setProperty('--subtitle-color', sanitizeAccentColor(value('subtitleTextColor', DEFAULT_OVERLAY_TEXT_COLOR), DEFAULT_OVERLAY_TEXT_COLOR));
    preview.style.setProperty('--subtitle-outline', sanitizeAccentColor(value('subtitleOutlineColor', DEFAULT_OVERLAY_OUTLINE_COLOR), DEFAULT_OVERLAY_OUTLINE_COLOR));
    preview.style.setProperty(
        '--subtitle-background-rgba',
        accentToRgba(
            sanitizeAccentColor(value('subtitleBackgroundColor', DEFAULT_OVERLAY_BACKGROUND_COLOR), DEFAULT_OVERLAY_BACKGROUND_COLOR),
            Math.max(0, Math.min(1, numberValue('subtitleBackgroundOpacity', 0))),
        ),
    );
    preview.style.setProperty('--subtitle-family', formFontFamilyValue(form, 'subtitleFontFamily', 'system-ui'));
    preview.style.setProperty('--subtitle-weight', String(Math.max(100, Math.min(900, numberValue('subtitleFontWeight', 760)))));
    syncSubtitlePreviewColorClasses(form, preview);
}

function formFontFamilyValue(form: HTMLFormElement, name: FontFamilySettingName, fallback: string): string {
    const value = getNamedControl<HTMLInputElement | HTMLSelectElement>(form, name)?.value.trim() ?? '';
    if (value === CUSTOM_FONT_FAMILY_VALUE) return getNamedControl<HTMLInputElement>(form, `${name}Custom`)?.value.trim() || fallback;
    return value || fallback;
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

export function renderDeckControls(settings: ReaderSettings, decks: JPDBDeck[], hasApiKey: boolean, language: InterfaceLanguage = settings.interfaceLanguage): string {
    const disabled = !hasApiKey || !decks.length;
    const deckOptions = decks.map(deck => [deck.id, deck.name] as [string, string]);
    const miningOptions = [['forq', 'FORQ'], ...deckOptions] as [string, string][];
    const newTabOptions = [['all', 'All study decks'], ['never-forget', 'Never forget'], ...deckOptions] as [string, string][];
    return `
        <div class="grid">
            ${deckSelect('miningDeck', 'Mining deck', settings.miningDeck, miningOptions, disabled, language)}
            ${deckSelect('newTabJpdbDeck', 'New tab JPDB deck', settings.newTabJpdbDeck, newTabOptions, disabled, language)}
            ${deckSelect('neverForgetDeck', 'Never forget deck', settings.neverForgetDeck, deckOptions, disabled, language)}
            ${deckSelect('blacklistDeck', 'Blacklist deck', settings.blacklistDeck, deckOptions, disabled, language)}
        </div>
        <div class="jpdb-reader-help">${hasApiKey ? (decks.length ? 'Decks are loaded from your JPDB account.' : 'Could not load decks yet; saved deck IDs will be kept.') : 'Add your JPDB API key to choose decks.'}</div>
    `;
}

function deckSelect(name: string, label: string, value: string, options: [string, string][], disabled: boolean, language: InterfaceLanguage): string {
    const hasValue = options.some(([optionValue]) => optionValue === value);
    const savedLabel = uiText(language, 'savedValue').replace('{value}', value);
    const merged = hasValue || !value ? options : [[value, savedLabel] as [string, string], ...options];
    return `<label>${label}
        <select name="${name}" ${disabled ? 'disabled' : ''}>
            ${merged.map(([optionValue, text]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}
        </select>
        ${disabled ? `<input type="hidden" name="${name}" value="${escapeHtml(value)}">` : ''}
    </label>`;
}

function settingsTabButton(panel: string, label: string, active = false): string {
    return `<button class="jpdb-reader-settings-tab" type="button" data-action="settings-panel" data-panel="${escapeHtml(panel)}" aria-pressed="${active ? 'true' : 'false'}" tabindex="${active ? '0' : '-1'}">${escapeHtml(label)}</button>`;
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
        ${rows.map((row, index) => {
        const keys = sourceRowCopyKeys(row);
        return `
            <div class="jpdb-reader-dictionary-row jpdb-reader-order-row ${layoutClass}" data-source-row data-dictionary-source-row data-source-id="${escapeHtml(row.id)}">
                <label class="inline jpdb-reader-dictionary-toggle jpdb-reader-order-toggle">
                    <input name="${row.prefix}.enabled" type="checkbox" ${row.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                ${sourceField(sourceRowDisplayName(row, options.showAlias), row.name, row.prefix, 'name', options.sourceLabel, keys?.nameKey)}
                ${options.showAlias ? (row.readonly
                    ? sourceField(row.alias, row.alias, row.prefix, 'alias', 'Display name', keys?.nameKey)
                    : `<input name="${row.prefix}.alias" type="text" value="${escapeHtml(row.alias)}" aria-label="Dictionary display name" placeholder="${escapeHtml(row.name)}">`) : ''}
                <div class="jpdb-reader-row-tools jpdb-reader-row-order-tools">
                    <input name="${row.prefix}.priority" type="hidden" value="${index}" aria-label="${escapeHtml(options.sourceLabel)} priority">
                    <button type="button" class="jpdb-reader-icon-mini jpdb-reader-drag-handle" data-source-drag-handle tabindex="-1" title="Drag to reorder" aria-label="Drag to reorder">${miniIcon('drag')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="dictionary-source-up" title="Move up" aria-label="Move up">${miniIcon('up')}</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="dictionary-source-down" title="Move down" aria-label="Move down">${miniIcon('down')}</button>
                </div>
                ${showRemove ? `<div class="jpdb-reader-row-tools jpdb-reader-row-remove-tools">
                    ${row.removable ? `<button type="button" class="jpdb-reader-icon-mini" data-action="delete-yomitan-dictionary" data-dictionary-name="${escapeHtml(row.name)}" title="Remove imported dictionary" aria-label="Remove imported dictionary">${miniIcon('remove')}</button>` : ''}
                </div>` : ''}
                ${row.removable ? `<input name="${row.prefix}.type" type="hidden" value="${escapeHtml(row.dictionaryType ?? 'terms')}">` : ''}
                ${row.help ? `<div class="jpdb-reader-dictionary-row-help" ${keys?.helpKey ? `data-source-help-key="${escapeHtml(keys.helpKey)}"` : ''}>${escapeHtml(row.help)}</div>` : ''}
            </div>
        `;
    }).join('')}
    `;
}

function sourceRowDisplayName(row: SettingsSourceRow, showAlias: boolean): string {
    return !showAlias && !row.readonly && row.alias ? row.alias : row.name;
}

function sourceField(displayValue: string, formValue: string, prefix: string, field: 'name' | 'alias', label: string, nameKey?: SettingsTextKey): string {
    return `
        <span class="jpdb-reader-field-display" aria-label="${escapeHtml(label)}" ${nameKey ? `data-source-name-key="${escapeHtml(nameKey)}"` : ''}>${escapeHtml(displayValue)}</span>
        <input name="${prefix}.${field}" type="hidden" value="${escapeHtml(formValue)}">
    `;
}

function sourceRowCopyKeys(row: SettingsSourceRow): { nameKey?: SettingsTextKey; helpKey?: SettingsTextKey } | undefined {
    if (row.id === '__jpdb__') return { helpKey: 'sourceHelpJpdb' };
    if (row.id === '__anki__') return { nameKey: 'sourceNameAnki', helpKey: 'sourceHelpAnki' };
    if (row.id === '__study_translation__') return { nameKey: 'sourceNameTranslation', helpKey: 'sourceHelpTranslation' };
    if (row.id === '__study_grammar__') return { nameKey: 'sourceNameGrammar', helpKey: 'sourceHelpGrammar' };
    if (row.id === '__immersion_kit__') return { nameKey: 'sourceNameImmersionKit', helpKey: 'sourceHelpImmersionKit' };
    if (row.id === '__kanji_stroke__') return { nameKey: 'sourceNameStrokePractice', helpKey: 'sourceHelpStrokePractice' };
    if (row.id === '__kanji_jpdb__') return { nameKey: 'readingsComponents', helpKey: 'sourceHelpReadingsComponents' };
    if (row.id === '__kanji_rtk__') return { helpKey: 'sourceHelpRtk' };
    if (row.id === '__kanji_uchisen__') return { helpKey: 'sourceHelpUchisen' };
    if (row.id === '__kanji_dictionaries__') return { nameKey: 'sourceNameImportedKanjiDictionaries', helpKey: 'sourceHelpImportedKanjiDictionaries' };
    if (row.id === '__kanji_similar_words__') return { nameKey: 'sourceNameWordsUsingKanji', helpKey: 'sourceHelpWordsUsingKanji' };
    if (row.id === '__kanji_origins__') return { nameKey: 'originStructure', helpKey: 'sourceHelpComponentGraph' };
    if (row.id.startsWith('__kanji_dictionary__:')) return { helpKey: 'sourceHelpImportedKanjiDictionary' };
    return undefined;
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

function isRecommendedDictionaryInstalled(dictionary: RecommendedDictionary, installed: YomitanDictionaryInfo[]): boolean {
    const targetName = normalizedDictionaryName(dictionary.name);
    return installed.some(item => item.downloadUrl === dictionary.downloadUrl || normalizedDictionaryName(item.title).includes(targetName));
}

function normalizedDictionaryName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9ぁ-んァ-ン一-龯]/g, '');
}
