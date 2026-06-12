// UT-74: the settings form shows the new-tab toggle only where it can work —
// extension builds override the browser new tab; userscripts cannot. Kept
// dependency-free so settings modules can use it without importing boot.
export function runningAsBrowserExtension(): boolean {
    const global = globalThis as { chrome?: { runtime?: { id?: string } }; browser?: { runtime?: { id?: string } } };
    try {
        return Boolean(global.chrome?.runtime?.id || global.browser?.runtime?.id);
    } catch {
        return false;
    }
}
