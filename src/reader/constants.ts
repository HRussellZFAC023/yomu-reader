export const APP_NAME = 'よむ';
export const APP_PUCK = 'よむ';
export const APP_SLUG = 'yomu';
export const APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
export const SETTINGS_TITLE = `${APP_NAME} Settings`;
export const GITHUB_OWNER = 'HRussellZFAC023';
export const GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
export const DOCS_BASE_URL = `${GITHUB_PAGES_ORIGIN}/${APP_REPOSITORY_NAME}/`;
export const GITHUB_REPOSITORY_URL = `https://github.com/${GITHUB_OWNER}/${APP_REPOSITORY_NAME}`;
export const RAW_USERSCRIPT_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${APP_REPOSITORY_NAME}/main/dist/yomu.user.js`;
export const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}newtab/`;
export const VIDEO_PLAYER_PAGE_URL = `${DOCS_BASE_URL}video-player/`;
export const FALLBACK_SETUP_SOURCE_ID = '__fallback_setup__';
export const JPDB_DEFINITION_SOURCE_ID = '__jpdb__';
export const JPDB_DEFINITION_EXAMPLES_SOURCE_ID = '__jpdb_examples__';
export const STUDY_TOOLS_SOURCE_ID = '__study_tools__';
export const STUDY_TRANSLATION_SOURCE_ID = '__study_translation__';
export const STUDY_GRAMMAR_SOURCE_ID = '__study_grammar__';
export const IMMERSION_KIT_SOURCE_ID = '__immersion_kit__';

export const SUPPORT_LINKS = {
    discordUsername: 'henry281199',
    docs: DOCS_BASE_URL,
    github: GITHUB_REPOSITORY_URL,
    issues: `${GITHUB_REPOSITORY_URL}/issues`,
    paypal: 'https://paypal.me/HenryRussell163',
    migakuPricing: 'https://migaku.com/pricing',
    yomikiri: 'https://github.com/BlueGreenMagick/yomikiri',
} as const;
