import { ReaderApp } from './main';

export function initDemo() {
    const bootWindow = window as any;
    const isRealExtension = typeof GM_getValue === 'function';

    if (isRealExtension) {
        // Real extension will take over naturally
        return;
    }

    if (bootWindow.__yomuDemoApp || bootWindow.__yomuRealApp) {
        return;
    }

    const app = new ReaderApp();
    bootWindow.__yomuDemoApp = app;

    window.addEventListener('yomu-extension-loaded', () => {
        if (bootWindow.__yomuDemoApp === app) {
            app.destroy();
            delete bootWindow.__yomuDemoApp;
        }
    });

    void app.init({ isDemo: true }).catch(console.error);
}
