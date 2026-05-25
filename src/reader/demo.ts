import { ReaderApp } from './main';
import { addWindowEventListener } from './window-events';

type YomuDemoWindow = typeof window & {
    __yomuDemoApp?: ReaderApp;
    __yomuRealApp?: ReaderApp;
};

export function initDemo() {
    const bootWindow = window as YomuDemoWindow;
    const isRealRuntime = hasUserscriptRuntime() || hasExtensionRuntime();

    if (isRealRuntime) {
        // Real extension will take over naturally
        return;
    }

    if (bootWindow.__yomuDemoApp || bootWindow.__yomuRealApp) {
        return;
    }

    const app = new ReaderApp();
    bootWindow.__yomuDemoApp = app;

    addWindowEventListener('yomu-extension-loaded', () => {
        if (bootWindow.__yomuDemoApp === app) {
            app.destroy({ preservePageWords: true });
            delete bootWindow.__yomuDemoApp;
        }
    });

    void app.init({ isDemo: true }).catch(console.error);
}

function hasUserscriptRuntime(): boolean {
    const runtime = globalThis as {
        GM?: {
            getValue?: unknown;
            xmlHttpRequest?: unknown;
            xmlhttpRequest?: unknown;
        };
        GM_info?: unknown;
    };
    return typeof GM_getValue === 'function'
        || typeof runtime.GM?.getValue === 'function'
        || typeof runtime.GM?.xmlHttpRequest === 'function'
        || typeof runtime.GM?.xmlhttpRequest === 'function'
        || Boolean(runtime.GM_info);
}

function hasExtensionRuntime(): boolean {
    const runtime = globalThis as {
        chrome?: { runtime?: { id?: string } };
        browser?: { runtime?: { id?: string } };
    };
    return Boolean(runtime.chrome?.runtime?.id || runtime.browser?.runtime?.id);
}
