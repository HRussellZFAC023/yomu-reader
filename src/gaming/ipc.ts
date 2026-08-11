export const YOMU_GAMING_CHANNELS = {
    getEnvironment: 'yomu-gaming:get-environment',
    getFrozenCapture: 'yomu-gaming:get-frozen-capture',
    recaptureFrozenFrame: 'yomu-gaming:recapture-frozen-frame',
    openScreenSettings: 'yomu-gaming:open-screen-settings',
    requestOcr: 'yomu-gaming:request-ocr',
    showOverlay: 'yomu-gaming:show-overlay',
    hideOverlay: 'yomu-gaming:hide-overlay',
    showApp: 'yomu-gaming:show-app',
    hideApp: 'yomu-gaming:hide-app',
    openExternal: 'yomu-gaming:open-external',
    updateCaptureShortcut: 'yomu-gaming:update-capture-shortcut',
    syncSettingsSnapshot: 'yomu-gaming:sync-settings-snapshot',
    restoreSettingsSnapshot: 'yomu-gaming:restore-settings-snapshot',
    setLearningTargetChosen: 'yomu-gaming:set-learning-target-chosen',
    targetChoiceRequired: 'yomu-gaming:target-choice-required',
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
}

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
    selection?: YomuGamingSelectionRect;
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
    /**
     * The learning target the player is studying, as its bare language tag.
     *
     * Electron's main process parses every provider response before the
     * renderer sees it, and that parse keeps only lines in the language being
     * studied. Main has no settings of its own and no DOM to read them from, so
     * the target rides along with the request that needs it: the renderer reads
     * the live target when it builds the request, and main adopts it before
     * parsing. Sending it per request is also what makes a target change reach
     * main — the next capture simply carries the new one.
     */
    targetLanguage: string;
}

export interface YomuGamingOcrResponse {
    ok: boolean;
    status: number;
    body: unknown;
    error?: string;
}

export type YomuGamingCaptureMode = 'instant' | 'area';

export interface YomuGamingSettingsSnapshot {
    version: 1;
    syncedAt: string;
    settings: unknown;
}

export interface YomuGamingSettingsSyncMetadata {
    syncedAt: string;
    storagePath: string;
}

export interface YomuGamingBridge {
    getEnvironment(): Promise<YomuGamingEnvironment>;
    getFrozenCapture(): Promise<YomuGamingCaptureSource>;
    recaptureFrozenFrame(): Promise<YomuGamingCaptureSource>;
    openScreenSettings(): Promise<void>;
    requestOcr(request: YomuGamingOcrRequest): Promise<YomuGamingOcrResponse>;
    showOverlay(mode?: YomuGamingCaptureMode): Promise<void>;
    hideOverlay(): Promise<void>;
    showApp(): Promise<void>;
    hideApp(): Promise<void>;
    openExternal(url: string): Promise<void>;
    updateCaptureShortcut(shortcut: string): Promise<YomuGamingEnvironment>;
    syncSettingsSnapshot(settings: unknown): Promise<YomuGamingSettingsSyncMetadata>;
    restoreSettingsSnapshot(): Promise<YomuGamingSettingsSnapshot | null>;
    setLearningTargetChosen(chosen: boolean): Promise<void>;
    onTargetChoiceRequired(listener: () => void): () => void;
}
