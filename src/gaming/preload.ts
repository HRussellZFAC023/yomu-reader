import { contextBridge, ipcRenderer } from 'electron';
import { YOMU_GAMING_CHANNELS, type YomuGamingBridge, type YomuGamingCaptureRequest, type YomuGamingCaptureSource, type YomuGamingOcrRequest } from './ipc';

const bridge: YomuGamingBridge = {
    getEnvironment: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.getEnvironment),
    listCaptureSources: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.listCaptureSources),
    captureSource: (request: YomuGamingCaptureRequest) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.captureSource, request),
    capturePrimaryScreen: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.capturePrimaryScreen),
    requestOcr: (request: YomuGamingOcrRequest) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.requestOcr, request),
    showOverlay: mode => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.showOverlay, mode),
    hideOverlay: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.hideOverlay),
    completeOverlayCapture: (capture: YomuGamingCaptureSource) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.completeOverlayCapture, capture),
    showApp: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.showApp),
    hideApp: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.hideApp),
    openExternal: (url: string) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.openExternal, url),
    updateCaptureShortcut: (shortcut: string) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.updateCaptureShortcut, shortcut),
    syncSettingsSnapshot: (settings: unknown) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.syncSettingsSnapshot, settings),
    restoreSettingsSnapshot: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.restoreSettingsSnapshot),
    onOverlayCaptureCompleted(callback: (capture: YomuGamingCaptureSource) => void) {
        const listener = (_event: Electron.IpcRendererEvent, capture: YomuGamingCaptureSource) => callback(capture);
        ipcRenderer.on(YOMU_GAMING_CHANNELS.overlayCaptureCompleted, listener);
        return () => ipcRenderer.off(YOMU_GAMING_CHANNELS.overlayCaptureCompleted, listener);
    },
};

contextBridge.exposeInMainWorld('yomuGaming', bridge);
