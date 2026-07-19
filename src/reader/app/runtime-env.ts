// Kept dependency-free so settings modules can detect the packaged extension
// runtime without importing the full boot path.
export function runningAsBrowserExtension(): boolean {
    const global = globalThis as { chrome?: { runtime?: { id?: string } }; browser?: { runtime?: { id?: string } } };
    try {
        return Boolean(global.chrome?.runtime?.id || global.browser?.runtime?.id);
    } catch {
        return false;
    }
}
