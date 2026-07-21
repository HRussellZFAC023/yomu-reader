export const APP_NAME = 'よむ';
export const APP_PUCK = 'よむ';
export const ACADEMY_SRS_LABEL = 'Academy';
const APP_SLUG = 'yomu';
export const APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
export const SETTINGS_TITLE = `${APP_NAME} Settings`;
const GITHUB_OWNER = 'HRussellZFAC023';
export const GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
export const DOCS_ORIGIN = 'https://yomureader.com';
export const DOCS_BASE_URL = `${DOCS_ORIGIN}/`;
export const GITHUB_REPOSITORY_URL = `https://github.com/${GITHUB_OWNER}/${APP_REPOSITORY_NAME}`;
export const ANKI_CONNECT_ADDON_URL = 'https://ankiweb.net/shared/info/2055492159';
export const DISCORD_INVITE_URL = 'https://discord.gg/jD6NPURewD';
export const DONATE_URL = 'https://support.yomureader.com/donate';
export const SUPPORT_STATUS_URL = 'https://support.yomureader.com/status';
export const YOMU_HOSTED_AUDIO_URL = 'https://audio.yomureader.com/?term={term}&reading={reading}';
export const USERSCRIPT_INSTALL_URL = `${DOCS_BASE_URL}yomu.user.js`;
// Stable per-browser store routes on the docs origin. The hosted stubs under
// docs/public/store/ redirect to the live listing for each browser's store,
// so listing URLs can change without shipping a new build.
export const EXTENSION_STORE_URLS = {
    chrome: `${DOCS_BASE_URL}store/chrome/`,
    firefox: `${DOCS_BASE_URL}store/firefox/`,
    safari: `${DOCS_BASE_URL}store/safari/`,
} as const;
export type ExtensionStoreBrowser = keyof typeof EXTENSION_STORE_URLS;
/** Canonical hosted Study route. `/newtab/` remains a compatibility route. */
export const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}study/`;
export const NEW_TAB_VERSION_URL = `${NEW_TAB_PAGE_URL}version.json`;
export const VIDEO_PLAYER_PAGE_URL = `${DOCS_BASE_URL}video-player/index.html`;
export const PDF_READER_PAGE_URL = `${DOCS_BASE_URL}pdf-reader/index.html`;
export const SUPPORT_COPY = 'よむ is a free userscript for popup lookup, dictionaries, OCR, subtitles, study, and Anki.';
export const SUPPORT_COPY_EXTRA = 'Donations are optional and help cover development, devices, services, maintenance, and API costs.';
const NADESHIKO_URL = 'https://nadeshiko.co/';
export const NADESHIKO_DEVELOPER_URL = `${NADESHIKO_URL}user/developer`;
export const USERSCRIPT_HTTP_BRIDGE_READY_EVENT = 'yomu-userscript-http-bridge-ready';
export const USERSCRIPT_STORAGE_BRIDGE_READY_EVENT = 'yomu-userscript-storage-bridge-ready';
export const INTERFACE_LANGUAGE_CHANGE_EVENT = 'yomu-interface-language-change';
export const OPEN_SETTINGS_EVENT = 'yomu-open-settings';
export const OPEN_SUBTITLE_TRACKS_EVENT = 'yomu-open-subtitle-tracks';
export const LOAD_SUBTITLE_FILES_EVENT = 'yomu-load-subtitle-files';
export const SETTINGS_CHANGE_EVENT = 'yomu-settings-change';
export const JPDB_DEFINITION_SOURCE_ID = '__jpdb__';
export const JITEN_DEFINITION_SOURCE_ID = '__jiten__';
export const BUNPRO_DEFINITION_SOURCE_ID = '__bunpro__';
export const WANIKANI_DEFINITION_SOURCE_ID = '__wanikani__';
export const ANKI_SOURCE_ID = '__anki__';
export const STUDY_TRANSLATION_SOURCE_ID = '__study_translation__';
export const STUDY_GRAMMAR_SOURCE_ID = '__study_grammar__';
export const IMMERSION_KIT_SOURCE_ID = '__immersion_kit__';
