import { APP_NAME, NEW_TAB_PAGE_URL, VIDEO_PLAYER_PAGE_URL } from './constants';
import type { ReaderSettings } from './types';

type UserscriptMenuCommandRegister = (name: string, fn: () => void) => void;

export interface ReaderMenuCommandHandlers {
    factoryReset: () => void;
    getSettings: () => ReaderSettings;
    installFloatingButton: () => void;
    logInfo: (message: string, details?: Record<string, unknown>) => void;
    saveSettings: (settings: ReaderSettings) => Promise<unknown>;
    showSettings: () => void;
    toggleYoutubeImmersion: () => void | Promise<void>;
}

export function registerReaderMenuCommands(handlers: ReaderMenuCommandHandlers): void {
    const register = userscriptMenuCommandRegister();
    if (!register) return;
    register(`${APP_NAME} settings`, () => handlers.showSettings());
    register(`${APP_NAME} open new tab`, () => openReaderNewTabPage(handlers.logInfo));
    register(`${APP_NAME} open video player`, () => openReaderVideoPlayer(handlers.logInfo));
    register(`${APP_NAME} toggle YouTube filter`, () => void handlers.toggleYoutubeImmersion());
    register(`${APP_NAME} toggle puck`, () => {
        const settings = handlers.getSettings();
        settings.showFloatingButton = !settings.showFloatingButton;
        void handlers.saveSettings(settings).then(() => handlers.installFloatingButton());
    });
    register(`${APP_NAME} Factory Reset`, () => handlers.factoryReset());
}

function openReaderNewTabPage(logInfo: ReaderMenuCommandHandlers['logInfo']): void {
    openReaderRuntimePage(NEW_TAB_PAGE_URL, 'New tab page opened', logInfo);
}

function openReaderVideoPlayer(logInfo: ReaderMenuCommandHandlers['logInfo']): void {
    openReaderRuntimePage(VIDEO_PLAYER_PAGE_URL, 'Video player page opened', logInfo);
}

function openReaderRuntimePage(
    url: string,
    message: string,
    logInfo: ReaderMenuCommandHandlers['logInfo'],
): void {
    const opened = window.open(url, '_blank');
    if (opened) opened.opener = null;
    if (!opened) location.href = url;
    logInfo(message, { url });
}

function userscriptMenuCommandRegister(): UserscriptMenuCommandRegister | null {
    if (typeof GM_registerMenuCommand === 'function') return GM_registerMenuCommand;
    if (typeof GM !== 'undefined' && typeof GM?.registerMenuCommand === 'function') {
        return (name, fn) => GM.registerMenuCommand?.(name, fn);
    }
    return null;
}
