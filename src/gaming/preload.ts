import { contextBridge, ipcRenderer } from 'electron';
import { YOMU_GAMING_CHANNELS, type YomuGamingBridge, type YomuGamingOcrRequest } from './ipc';

const bridge: YomuGamingBridge = {
    getEnvironment: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.getEnvironment),
    getFrozenCapture: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.getFrozenCapture),
    recaptureFrozenFrame: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.recaptureFrozenFrame),
    openScreenSettings: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.openScreenSettings),
    requestOcr: (request: YomuGamingOcrRequest) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.requestOcr, request),
    showOverlay: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.showOverlay),
    setLayerShortcuts: keys => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.setLayerShortcuts, keys),
    onLayerShortcut: listener => {
        const handler = (_event: Electron.IpcRendererEvent, key: string) => listener(key);
        ipcRenderer.on(YOMU_GAMING_CHANNELS.layerShortcut, handler);
        return () => ipcRenderer.removeListener(YOMU_GAMING_CHANNELS.layerShortcut, handler);
    },
    setLayerRegions: regions => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.setLayerRegions, regions),
    hideOverlay: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.hideOverlay),
    showApp: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.showApp),
    hideApp: () => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.hideApp),
    openExternal: (url: string) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.openExternal, url),
    updateCaptureShortcut: (shortcut: string) => ipcRenderer.invoke(YOMU_GAMING_CHANNELS.updateCaptureShortcut, shortcut),
};

contextBridge.exposeInMainWorld('yomuGaming', bridge);
