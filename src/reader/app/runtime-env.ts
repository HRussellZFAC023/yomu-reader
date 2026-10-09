// Kept dependency-free so settings modules can detect the packaged extension
// runtime without importing the full boot path.

/**
 * Whether an extension runtime visible in this realm can be Yomu's own. Builds
 * that are not the browser extension (the userscript, its @require companions,
 * hosted Study, the desktop app) can still see one: the Userscripts app for
 * Safari runs userscripts in its own extension's content world, where
 * `browser.runtime.id` and `browser.storage` belong to the manager. Treating
 * that as Yomu's extension hid the real GM store and left Study unable to save.
 */
export function extensionRuntimeMayBeYomu(): boolean {
    return !(typeof __YOMU_EXTENSION_BUILD__ === 'boolean' && !__YOMU_EXTENSION_BUILD__);
}

export function runningAsBrowserExtension(): boolean {
    if (!extensionRuntimeMayBeYomu()) return false;
    const global = globalThis as { chrome?: { runtime?: { id?: string } }; browser?: { runtime?: { id?: string } } };
    try {
        return Boolean(global.chrome?.runtime?.id || global.browser?.runtime?.id);
    } catch {
        return false;
    }
}
