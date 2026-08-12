const LEGACY_READER_SETTINGS_COPY_KEY = 'jpdb-popup-reader-settings';

/**
 * Remove the page-readable Reader snapshot written by older packaged Gaming
 * overlays. Gaming's own settings record remains the sole upgrade authority.
 */
export function removeLegacyGamingReaderSettingsCopy(): void {
    if (globalThis.location.protocol !== 'file:') return;
    try {
        globalThis.localStorage.removeItem(LEGACY_READER_SETTINGS_COPY_KEY);
    } catch {
        // Storage can be unavailable in a locked renderer. The current launch
        // still uses the in-memory Gaming snapshot and retries next launch.
    }
}
