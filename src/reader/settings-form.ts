import { IMMERSION_KIT_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, SETTINGS_TITLE, SUPPORT_LINKS } from './constants';
import { escapeHtml, setInnerHtml } from './dom';
import { uiText } from './i18n';
import { AUDIO_GUIDE_URL, AUDIO_SOURCE_OPTIONS, DEFAULT_AUDIO_SOURCES, accentToRgba, formatShortcutEvent, normalizeAudioSource, normalizeOcrProvider, sanitizeAccentColor } from './settings';
import type { AudioSourceSetting, DictionaryPreference, InterfaceLanguage, JPDBDeck, ReaderSettings } from './types';
import type { RecommendedDictionary } from './recommended-dictionaries';
import { RECOMMENDED_JAPANESE_DICTIONARIES } from './recommended-dictionaries';
import type { YomitanDictionaryInfo } from './yomitan';

export function renderSupportPanel(): string {
    return `
        <div class="jpdb-reader-support-card">
            <div>
                <div class="jpdb-reader-support-title">Free Japanese reading and mining tools</div>
                <p>よむ brings popup lookup, JPDB mining, imported dictionaries, subtitles, image reading, and Anki export into one free userscript. Comparable study suites such as <a href="${SUPPORT_LINKS.migakuPricing}" target="_blank" rel="noopener">Migaku</a> currently advertise paid plans from $10/month; よむ offers the same core reading-and-mining workflow for free.</p>
                <p>Donations are optional. They help cover the time, testing devices, services, and maintenance that keep the reader polished.</p>
            </div>
            <div class="jpdb-reader-support-actions">
                <a class="jpdb-reader-btn add" href="${SUPPORT_LINKS.paypal}" target="_blank" rel="noopener" data-support-link="paypal">Donate</a>
                <a class="jpdb-reader-btn" href="${SUPPORT_LINKS.issues}" target="_blank" rel="noopener" data-support-link="issues">Report issue</a>
                <a class="jpdb-reader-btn" href="${SUPPORT_LINKS.github}" target="_blank" rel="noopener" data-support-link="github">GitHub</a>
                <button class="jpdb-reader-btn" type="button" data-action="copy-discord" data-support-link="discord">Copy Discord</button>
            </div>
            <div class="jpdb-reader-help">Discord: ${SUPPORT_LINKS.discordUsername}</div>
        </div>
    `;
}

export function renderSettingsForm(settings: ReaderSettings, jpdbSettingsUrl: string): string {
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
                    ${input('accentColor', 'Accent color', sanitizeAccentColor(settings.accentColor), 'color')}
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
                    ${select('immersionKitCategory', 'Example source', settings.immersionKitCategory, [['all', 'All'], ['anime', 'Anime'], ['drama', 'Drama'], ['games', 'Games']])}
                    ${select('immersionKitSort', 'Example order', settings.immersionKitSort, [['sentence_length:asc', 'Shortest first'], ['sentence_length:desc', 'Longest first'], ['random', 'Random']])}
                    ${input('immersionKitLimit', 'Examples per word', String(settings.immersionKitLimit), 'number')}
                    ${input('immersionKitMinLength', 'Minimum sentence length', String(settings.immersionKitMinLength), 'number')}
                    ${input('immersionKitMaxLength', 'Maximum sentence length', String(settings.immersionKitMaxLength), 'number')}
                    ${input('immersionKitPlaybackRate', 'Example audio speed', String(settings.immersionKitPlaybackRate), 'number')}
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
                    ${checkbox('showFurigana', 'Enable furigana annotations', settings.showFurigana)}
                    ${checkbox('showPitchAccent', 'Show pitch accent', settings.showPitchAccent)}
                    ${checkbox('hideKnownFurigana', 'Hide furigana for known cards only', settings.hideKnownFurigana)}
                </div>
                <div class="jpdb-reader-help">Hover lookup uses the shortcut below. Leave it blank for plain hover; keep click enabled if you also want tap lookup.</div>
            </fieldset>
            <fieldset data-settings-panel="basics">
                <legend>Kanji</legend>
                <div class="grid">
                    ${checkbox('kanjivgEnabled', 'Show stroke order and drawing pad', settings.kanjivgEnabled)}
                    ${checkbox('kanjiOriginsEnabled', 'Show compact kanji facts and component map', settings.kanjiOriginsEnabled)}
                    ${checkbox('kanjiOriginKanjiMapEnabled', 'Use Kanji Alive and Kanji Map facts', settings.kanjiOriginKanjiMapEnabled)}
                    ${checkbox('kanjiOriginGraphEnabled', 'Show component graph', settings.kanjiOriginGraphEnabled)}
                    ${checkbox('kanjiOriginRadicalImagesEnabled', 'Show radical images', settings.kanjiOriginRadicalImagesEnabled)}
                    ${checkbox('rtkEnabled', 'Show RTK information', settings.rtkEnabled)}
                    ${checkbox('similarKanjiWords', 'Show words using the same kanji', settings.similarKanjiWords)}
                    ${input('similarKanjiWordLimit', 'Similar word limit', String(settings.similarKanjiWordLimit), 'number')}
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
                    ${input('ankiConnectUrl', 'AnkiConnect URL', settings.ankiConnectUrl)}
                    ${input('ankiDeck', 'Anki deck', settings.ankiDeck)}
                    ${input('ankiModel', 'Anki note type', settings.ankiModel)}
                    ${input('ankiTags', 'Tags', settings.ankiTags)}
                </div>
                <div class="jpdb-reader-settings-actions">
                    <button class="jpdb-reader-btn" type="button" data-action="test-anki">Test Anki</button>
                </div>
                <div class="jpdb-reader-help jpdb-reader-status-line" data-anki-status role="status" aria-live="polite">Anki uses AnkiConnect on this device. The default creates a small Yomu note type automatically.</div>
            </fieldset>
            <fieldset data-settings-panel="dictionaries" hidden>
                <legend>Dictionaries</legend>
                <div class="grid">
                    ${checkbox('jpdbDefinitionsEnabled', 'Show JPDB definitions', settings.jpdbDefinitionsEnabled)}
                    ${checkbox('localDictionariesEnabled', 'Show imported dictionary definitions', settings.localDictionariesEnabled)}
                    ${checkbox('localDictionaryShowKanji', 'Show kanji dictionary cards', settings.localDictionaryShowKanji)}
                    ${input('localDictionaryMaxResults', 'Dictionary result limit', String(settings.localDictionaryMaxResults), 'number')}
                </div>
                <div class="jpdb-reader-dictionary-status" data-dictionary-status>Checking imported dictionaries...</div>
                <div class="jpdb-reader-dictionary-priorities">
                    ${renderDictionarySourceRows(settings)}
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

export function input(name: string, label: string, value: string, type = 'text'): string {
    return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" autocomplete="off"></label>`;
}

export function shortcutInput(name: string, label: string, value: string, placeholder = 'Press keys'): string {
    return `<label>${label}<input data-shortcut-input name="${name}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" inputmode="none"></label>`;
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
        text('dictionaries'),
        text('shortcuts'),
        text('support'),
    ].forEach((label, index) => {
        const legend = form.querySelectorAll('fieldset > legend')[index];
        legend?.replaceChildren(label);
    });

    const labelKeys: Array<[string, Parameters<typeof uiText>[1]]> = [
        ['apiKey', 'apiKey'],
        ['addToForq', 'addToForq'],
        ['enableReviews', 'enableReviews'],
        ['twoButtonReviews', 'reviewRatingScale'],
        ['interfaceLanguage', 'settingsLanguage'],
        ['theme', 'theme'],
        ['popupMode', 'popupMode'],
        ['accentColor', 'accentColor'],
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
        ['showFurigana', 'showFurigana'],
        ['showPitchAccent', 'showPitchAccent'],
        ['hideKnownFurigana', 'hideKnownFurigana'],
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
        ['audioSelectionMode', 'audioSelectionMode'],
        ['audioViaBlob', 'audioViaBlob'],
        ['audioTimeoutMs', 'audioTimeoutMs'],
        ['immersionKitEnabled', 'immersionKitEnabled'],
        ['immersionKitShowTranslation', 'immersionKitShowTranslation'],
        ['immersionKitShowImages', 'immersionKitShowImages'],
        ['immersionKitAutoPlayAudio', 'immersionKitAutoPlayAudio'],
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
        ['youtubeImmersionEnabled', 'youtubeImmersionEnabled'],
        ['youtubeShowFilterNotice', 'youtubeShowFilterNotice'],
        ['ankiEnabled', 'ankiEnabled'],
        ['ankiMineWithJpdb', 'ankiMineWithJpdb'],
        ['ankiCaptureScreenshot', 'ankiCaptureScreenshot'],
        ['ankiConnectUrl', 'ankiConnectUrl'],
        ['ankiDeck', 'ankiDeck'],
        ['ankiModel', 'ankiModel'],
        ['ankiTags', 'ankiTags'],
        ['jpdbDefinitionsEnabled', 'jpdbDefinitionsEnabled'],
        ['localDictionariesEnabled', 'localDictionariesEnabled'],
        ['localDictionaryShowKanji', 'localDictionaryShowKanji'],
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
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-up" title="Move up">↑</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-down" title="Move down">↓</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-remove" title="Remove">×</button>
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
}

export function updateDictionarySourceEditor(form: HTMLFormElement, action: string, control?: HTMLElement | null): void {
    const container = form.querySelector<HTMLElement>('.jpdb-reader-dictionary-priorities');
    const row = control?.closest<HTMLElement>('[data-dictionary-source-row]');
    if (!container || !row) return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
    const index = rows.indexOf(row);
    const targetIndex = action === 'dictionary-source-up' ? index - 1 : index + 1;
    moveDictionarySourceRow(container, index, targetIndex);
}

export function installDictionarySourceDrag(form: HTMLFormElement): void {
    let dragged: HTMLElement | null = null;
    form.addEventListener('dragstart', event => {
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-dictionary-source-row]');
        if (!row) return;
        dragged = row;
        row.classList.add('jpdb-reader-dragging');
        event.dataTransfer?.setData('text/plain', row.dataset.sourceId ?? '');
        event.dataTransfer?.setDragImage(row, 18, 18);
    });
    form.addEventListener('dragover', event => {
        if (!dragged) return;
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-dictionary-source-row]');
        if (row && row !== dragged) event.preventDefault();
    });
    form.addEventListener('drop', event => {
        if (!dragged) return;
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-dictionary-source-row]');
        const container = dragged.closest<HTMLElement>('.jpdb-reader-dictionary-priorities');
        if (!target || !container || target === dragged) return;
        event.preventDefault();
        const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
        moveDictionarySourceRow(container, rows.indexOf(dragged), rows.indexOf(target));
    });
    form.addEventListener('dragend', () => {
        dragged?.classList.remove('jpdb-reader-dragging');
        dragged = null;
    });
}

function moveDictionarySourceRow(container: HTMLElement, index: number, targetIndex: number): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
    if (index < 0 || targetIndex < 0 || index >= rows.length || targetIndex >= rows.length || index === targetIndex) return;
    const row = rows[index];
    const target = rows[targetIndex];
    if (targetIndex < index) container.insertBefore(row, target);
    else container.insertBefore(row, target.nextSibling);
    syncDictionarySourcePriorities(container);
}

function syncDictionarySourcePriorities(container: HTMLElement): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
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
    return `
        <div class="grid">
            ${deckSelect('miningDeck', 'Mining deck', settings.miningDeck, miningOptions, disabled)}
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

export function renderDictionarySourceRows(settings: ReaderSettings): string {
    const preferences = settings.dictionaryPreferences;
    const rows = [
        {
            id: JPDB_DEFINITION_SOURCE_ID,
            name: 'JPDB',
            alias: 'JPDB',
            enabled: settings.jpdbDefinitionsEnabled,
            priority: settings.jpdbDefinitionsPriority,
            readonly: true,
            help: 'Built-in JPDB meanings from the parsed card.',
        },
        {
            id: IMMERSION_KIT_SOURCE_ID,
            name: 'Immersion Kit',
            alias: 'Immersion Kit',
            enabled: settings.immersionKitEnabled,
            priority: settings.immersionKitPriority,
            readonly: true,
            help: 'Example sentences, images, and audio for the looked-up word.',
        },
        ...preferences.map(preference => ({
            id: preference.name,
            name: preference.name,
            alias: preference.alias,
            enabled: preference.enabled,
            priority: preference.priority,
            readonly: false,
            help: '',
        })),
    ].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

    if (rows.length === 2) return `
        <div class="jpdb-reader-help">Import Yomitan dictionaries to add local or native-language definitions alongside JPDB and Immersion Kit examples.</div>
        ${renderDictionarySourceRowsList(rows)}
    `;
    return renderDictionarySourceRowsList(rows);
}

function renderDictionarySourceRowsList(rows: Array<{ id: string; name: string; alias: string; enabled: boolean; priority: number; readonly: boolean; help: string }>): string {
    return `
        <div class="jpdb-reader-dictionary-head">
            <span>On</span>
            <span>Definition source</span>
            <span>Alias</span>
            <span>Order</span>
        </div>
        <input type="hidden" name="dictionaryPreferenceCount" value="${rows.filter(row => !isBuiltInDictionarySource(row.id)).length}">
        ${rows.map((row, index) => {
            const localIndex = rows.slice(0, index).filter(item => !isBuiltInDictionarySource(item.id)).length;
            const prefix = dictionarySourcePrefix(row.id, localIndex);
            return `
            <div class="jpdb-reader-dictionary-row" draggable="true" data-dictionary-source-row data-source-id="${escapeHtml(row.id)}">
                <label class="inline jpdb-reader-dictionary-toggle">
                    <input name="${prefix}.enabled" type="checkbox" ${row.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                <input name="${prefix}.name" type="text" value="${escapeHtml(row.name)}" readonly aria-label="Dictionary name">
                <input name="${prefix}.alias" type="text" value="${escapeHtml(row.alias)}" ${row.readonly ? 'readonly' : ''} aria-label="Dictionary alias">
                <div class="jpdb-reader-row-tools">
                    <input name="${prefix}.priority" type="hidden" value="${index}" aria-label="Dictionary priority">
                    <button type="button" class="jpdb-reader-icon-mini" data-action="dictionary-source-up" title="Move up">↑</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="dictionary-source-down" title="Move down">↓</button>
                </div>
                ${row.help ? `<div class="jpdb-reader-dictionary-row-help">${escapeHtml(row.help)}</div>` : ''}
            </div>
        `; }).join('')}
    `;
}

function isBuiltInDictionarySource(id: string): boolean {
    return id === JPDB_DEFINITION_SOURCE_ID || id === IMMERSION_KIT_SOURCE_ID;
}

function dictionarySourcePrefix(id: string, localIndex: number): string {
    if (id === JPDB_DEFINITION_SOURCE_ID) return 'jpdbDefinitions';
    if (id === IMMERSION_KIT_SOURCE_ID) return 'immersionKit';
    return `dictionaryPreferences.${localIndex}`;
}

export function renderRecommendedDictionaries(installed: YomitanDictionaryInfo[]): string {
    const groups: Array<[RecommendedDictionary['category'], string]> = [
        ['terms', 'Term dictionaries'],
        ['kanji', 'Kanji dictionaries'],
        ['frequency', 'Frequency dictionaries'],
    ];

    return `
        <div class="jpdb-reader-recommended-title">Recommended dictionary downloads</div>
        <div class="jpdb-reader-settings-actions">
            <button class="jpdb-reader-btn" type="button" data-action="download-starter-dictionaries">Download missing recommended</button>
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
    return {
        ...current,
        apiKey: get('apiKey').trim(),
        interfaceLanguage: ['auto', 'en', 'ja'].includes(get('interfaceLanguage')) ? get('interfaceLanguage') as ReaderSettings['interfaceLanguage'] : current.interfaceLanguage,
        jpdbDefinitionsEnabled: has('jpdbDefinitions.enabled'),
        jpdbDefinitionsPriority: Math.max(0, Math.min(999, number('jpdbDefinitions.priority', current.jpdbDefinitionsPriority))),
        jpdbExtensionsEnabled: has('jpdbExtensionsEnabled'),
        jpdbUchisenEnabled: has('jpdbUchisenEnabled'),
        jpdbRtkEnabled: has('jpdbRtkEnabled'),
        jpdbImmersionKitEnabled: has('jpdbImmersionKitEnabled'),
        jpdbLocalDictionariesEnabled: has('jpdbLocalDictionariesEnabled'),
        jpdbReviewUiEnabled: has('jpdbReviewUiEnabled'),
        jpdbAutoRevealSentenceEnabled: has('jpdbAutoRevealSentenceEnabled'),
        jpdbKanjiDoodleEnabled: has('jpdbKanjiDoodleEnabled'),
        rtkEnabled: has('rtkEnabled'),
        kanjivgEnabled: has('kanjivgEnabled'),
        kanjiOriginsEnabled: has('kanjiOriginsEnabled'),
        kanjiOriginKanjiMapEnabled: has('kanjiOriginKanjiMapEnabled'),
        kanjiOriginWiktionaryEnabled: false,
        kanjiOriginGraphEnabled: has('kanjiOriginGraphEnabled'),
        kanjiOriginRadicalImagesEnabled: has('kanjiOriginRadicalImagesEnabled'),
        similarKanjiWords: has('similarKanjiWords'),
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
        audioTimeoutMs: Math.max(1000, number('audioTimeoutMs', current.audioTimeoutMs)),
        audioSelectionMode: get('audioSelectionMode') === 'random' ? 'random' : 'first',
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
        showFurigana: has('showFurigana'),
        showPitchAccent: has('showPitchAccent'),
        hideKnownFurigana: has('hideKnownFurigana'),
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
        localDictionaryShowKanji: has('localDictionaryShowKanji'),
        localDictionaryMaxResults: Math.max(1, Math.min(64, number('localDictionaryMaxResults', current.localDictionaryMaxResults))),
        dictionaryPreferences: readDictionaryPreferences(data, current.dictionaryPreferences),
        subtitlePlayerEnabled: has('subtitlePlayerEnabled'),
        subtitleAutoDetect: has('subtitleAutoDetect'),
        subtitleOverlayVisible: has('subtitleOverlayVisible'),
        subtitleSecondaryVisible: has('subtitleSecondaryVisible'),
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
        youtubeImmersionEnabled: has('youtubeImmersionEnabled'),
        youtubeShowFilterNotice: has('youtubeShowFilterNotice'),
        ankiEnabled: has('ankiEnabled'),
        ankiConnectUrl: get('ankiConnectUrl').trim() || current.ankiConnectUrl,
        ankiDeck: get('ankiDeck').trim() || current.ankiDeck,
        ankiModel: get('ankiModel').trim() || current.ankiModel,
        ankiTags: get('ankiTags').trim(),
        ankiMineWithJpdb: has('ankiMineWithJpdb'),
        ankiCaptureScreenshot: has('ankiCaptureScreenshot'),
        theme: get('theme') as ReaderSettings['theme'],
        popupMode: get('popupMode') as ReaderSettings['popupMode'],
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
    return (record.formatName === 'yomu-reader-settings' || record.formatName === 'kotoba-reader-settings' || record.formatName === 'jpdb-popup-reader-settings')
        && record.settings
        && typeof record.settings === 'object'
        ? record.settings as ReaderSettings
        : null;
}

export function pickFile(root: HTMLElement, type: 'settings' | 'dictionary'): Promise<File | null> {
    const inputEl = root.querySelector<HTMLInputElement>(`input[data-file="${type}"]`);
    if (!inputEl) return Promise.resolve(null);

    return new Promise(resolve => {
        inputEl.onchange = () => {
            const file = inputEl.files?.[0] ?? null;
            inputEl.value = '';
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
}

export function dateStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}
