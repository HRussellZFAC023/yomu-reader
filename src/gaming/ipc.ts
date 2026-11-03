export const YOMU_GAMING_CHANNELS = {
    getEnvironment: 'yomu-gaming:get-environment',
    getFrozenCapture: 'yomu-gaming:get-frozen-capture',
    recaptureFrozenFrame: 'yomu-gaming:recapture-frozen-frame',
    openScreenSettings: 'yomu-gaming:open-screen-settings',
    requestOcr: 'yomu-gaming:request-ocr',
    showOverlay: 'yomu-gaming:show-overlay',
    hideOverlay: 'yomu-gaming:hide-overlay',
    setLayerRegions: 'yomu-gaming:set-layer-regions',
    setLayerShortcuts: 'yomu-gaming:set-layer-shortcuts',
    layerShortcut: 'yomu-gaming:layer-shortcut',
    showApp: 'yomu-gaming:show-app',
    hideApp: 'yomu-gaming:hide-app',
    openExternal: 'yomu-gaming:open-external',
    updateCaptureShortcut: 'yomu-gaming:update-capture-shortcut',
    getSelectedText: 'yomu-gaming:get-selected-text',
    closeTextLookup: 'yomu-gaming:close-text-lookup',
    retryTextLookup: 'yomu-gaming:retry-text-lookup',
    updateTextLookupShortcut: 'yomu-gaming:update-text-lookup-shortcut',
    updateDesktopShortcuts: 'yomu-gaming:update-desktop-shortcuts',
} as const;

export type YomuGamingScreenAccess = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown' | 'unsupported';

export interface YomuGamingEnvironment {
    platform: string;
    displayServer: string;
    desktop: string;
    isSteamDeckSession: boolean;
    isPackaged: boolean;
    displayCount: number;
    hotkey: string;
    hotkeyRegistered: boolean;
    hotkeyError?: string;
    // True while a tray/menu-bar item is live, which is what keeps Yomu reachable — and the
    // capture shortcut working — after its window is closed.
    trayActive: boolean;
    screenAccess: YomuGamingScreenAccess;
    textLookupShortcut?: YomuGamingTextLookupShortcut;
}

export type YomuGamingSelectedText = { kind: 'text'; text: string }
    | { kind: 'empty' | 'permission' | 'unsupported' | 'unavailable' | 'too-long' | 'expired' };

export interface YomuGamingTextLookupShortcut {
    enabled: boolean;
    shortcut: string;
    language: 'en' | 'ja';
    registered: boolean;
    error?: 'invalid' | 'taken';
}

export interface YomuGamingShortcutPatch {
    captureShortcut?: string;
    textLookupShortcut?: Pick<YomuGamingTextLookupShortcut, 'enabled' | 'shortcut' | 'language'>;
}

export type YomuGamingShortcutPair = Required<YomuGamingShortcutPatch>;
export type YomuGamingShortcutUpdate =
    { kind: 'saved'; environment: YomuGamingEnvironment; undo: { shortcuts: YomuGamingShortcutPair; revision: number } }
    | { kind: 'invalid' | 'taken' | 'save-failed' | 'changed'; environment: YomuGamingEnvironment };

export interface YomuGamingImageSize {
    width: number;
    height: number;
}

export interface YomuGamingSelectionRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface YomuGamingCaptureSource {
    id: string;
    name: string;
    kind: 'screen' | 'window' | 'unknown';
    displayId: string;
    thumbnailDataUrl: string;
    size: YomuGamingImageSize;
}

export type YomuGamingOcrProvider = 'google-lens' | 'cloud-vision' | 'local-service' | 'off';

export interface YomuGamingOcrRequest {
    provider?: YomuGamingOcrProvider;
    endpointUrl: string;
    cloudVisionApiKey?: string;
    imageDataUrl: string;
    width: number;
    height: number;
    engine: string;
    /** BCP-47 tag the OCR provider is asked to read in. */
    language: string;
}

export interface YomuGamingOcrResponse {
    ok: boolean;
    status: number;
    body: unknown;
    error?: string;
}

export interface YomuGamingBridge {
    getEnvironment(): Promise<YomuGamingEnvironment>;
    getFrozenCapture(): Promise<YomuGamingCaptureSource>;
    recaptureFrozenFrame(): Promise<YomuGamingCaptureSource>;
    openScreenSettings(): Promise<void>;
    requestOcr(request: YomuGamingOcrRequest): Promise<YomuGamingOcrResponse>;
    showOverlay(): Promise<void>;
    hideOverlay(): Promise<void>;
    setLayerRegions?(regions: YomuGamingSelectionRect[]): Promise<void>;
    setLayerShortcuts?(keys: string[]): Promise<string[]>;
    onLayerShortcut?(listener: (key: string) => void): () => void;
    showApp(): Promise<void>;
    hideApp(): Promise<void>;
    openExternal(url: string): Promise<void>;
    updateCaptureShortcut(shortcut: string): Promise<YomuGamingEnvironment>;
    getSelectedText(session: number): Promise<YomuGamingSelectedText>;
    closeTextLookup(): Promise<void>;
    retryTextLookup(): Promise<void>;
    updateTextLookupShortcut(settings: unknown): Promise<YomuGamingEnvironment>;
    updateDesktopShortcuts(shortcuts: YomuGamingShortcutPatch, expectedRevision?: number): Promise<YomuGamingShortcutUpdate>;
}
