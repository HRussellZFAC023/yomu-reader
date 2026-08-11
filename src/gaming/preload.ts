import { contextBridge, ipcRenderer } from 'electron';
import { YOMU_GAMING_CHANNELS, type YomuGamingBridge, type YomuGamingOcrRequest } from './ipc';

const bridge: YomuGamingBridge = {
    getEnvironment: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.getEnvironment),
    getFrozenCapture: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.getFrozenCapture),
    recaptureFrozenFrame: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.recaptureFrozenFrame),
    openScreenSettings: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.openScreenSettings),
    requestOcr: (request: YomuGamingOcrRequest) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.requestOcr, request),
    showOverlay: mode => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.showOverlay, mode),
    hideOverlay: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.hideOverlay),
    showApp: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.showApp),
    hideApp: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.hideApp),
    openExternal: (url: string) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.openExternal, url),
    updateCaptureShortcut: (shortcut: string) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.updateCaptureShortcut, shortcut),
    syncSettingsSnapshot: (settings: unknown) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.syncSettingsSnapshot, settings),
    restoreSettingsSnapshot: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.restoreSettingsSnapshot),
    setLearningTargetChosen: (chosen: boolean) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.setLearningTargetChosen, chosen),
    onTargetChoiceRequired: listener => {
        const handler = () => listener();
        ipcRenderer.on(YOMU_GAMING_CHANNELS.targetChoiceRequired, handler);
        return () => ipcRenderer.removeListener(YOMU_GAMING_CHANNELS.targetChoiceRequired, handler);
    },
};

contextBridge.exposeInMainWorld('yomuGaming', bridge);
