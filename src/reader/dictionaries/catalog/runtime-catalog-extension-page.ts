type ExtensionRuntimeApi = {
    runtime: {
        getURL(path: string): string;
    };
};

const extensionGlobals = globalThis as typeof globalThis & {
    browser?: ExtensionRuntimeApi;
    chrome?: ExtensionRuntimeApi;
};
const extensionApi = extensionGlobals.browser ?? extensionGlobals.chrome;
if (!extensionApi) {
    throw new Error('The browser extension runtime is unavailable.');
}
const response = await fetch(extensionApi.runtime.getURL('runtime-catalog.json'));
if (!response.ok) {
    throw new Error(`The packaged dictionary catalog could not be loaded (${response.status}).`);
}

const runtimeCatalog: unknown = await response.json();
export default runtimeCatalog;
