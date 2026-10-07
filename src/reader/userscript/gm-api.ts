// The userscript manager's promise API (`GM.*`) and script info, wherever the
// manager put them. Tampermonkey and Violentmonkey also expose them on the
// sandbox's global object, but the Userscripts app for Safari (Yomu's
// iPhone/iPad install path) runs the script as
//   Function(`{GM,GM_info,...}`, code)(apis)
// so `GM` and `GM_info` are only parameters of that wrapper: `globalThis.GM` is
// undefined there and only a lexical reference reaches them. Dependency-free so
// storage, runtime detection and boot can all share it.

export type UserscriptGmApi = NonNullable<typeof GM>;

export function userscriptGmApi(): UserscriptGmApi | undefined {
    const lexical = typeof GM === 'object' && GM ? GM : undefined;
    return lexical ?? globalRecord<UserscriptGmApi>('GM');
}

export function userscriptGmInfo(): unknown {
    const lexical = typeof GM_info === 'object' && GM_info ? GM_info : undefined;
    return lexical ?? globalRecord('GM_info') ?? userscriptGmApi()?.info;
}

function globalRecord<T>(name: string): T | undefined {
    const value = (globalThis as Record<string, unknown>)[name];
    return value && typeof value === 'object' ? value as T : undefined;
}
