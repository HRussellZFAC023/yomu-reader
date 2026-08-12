type ManualVideoFrameRequestListener = (video: HTMLVideoElement) => void;

interface ManualVideoFrameRequestBus {
    readonly listeners: Set<ManualVideoFrameRequestListener>;
}

const MANUAL_VIDEO_FRAME_REQUEST_SLOT = Symbol.for('yomu.private-manual-video-frame-request.v1');
type ManualVideoFrameRequestRealm = typeof globalThis & { [key: symbol]: unknown };

/** Request a manual OCR snapshot without exposing the video capability to page scripts. */
export function requestManualVideoFrameOcr(video: HTMLVideoElement): void {
    for (const listener of manualVideoFrameRequestBus().listeners) listener(video);
}

export function subscribeToManualVideoFrameOcrRequests(
    listener: ManualVideoFrameRequestListener,
): () => void {
    const listeners = manualVideoFrameRequestBus().listeners;
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function manualVideoFrameRequestBus(): ManualVideoFrameRequestBus {
    const realm = globalThis as ManualVideoFrameRequestRealm;
    const existing = realm[MANUAL_VIDEO_FRAME_REQUEST_SLOT];
    if (isManualVideoFrameRequestBus(existing)) return existing;
    const bus: ManualVideoFrameRequestBus = { listeners: new Set() };
    Object.defineProperty(realm, MANUAL_VIDEO_FRAME_REQUEST_SLOT, {
        configurable: true,
        enumerable: false,
        value: bus,
        writable: false,
    });
    return bus;
}

function isManualVideoFrameRequestBus(value: unknown): value is ManualVideoFrameRequestBus {
    return Boolean(value && typeof value === 'object'
        && (value as ManualVideoFrameRequestBus).listeners instanceof Set);
}
