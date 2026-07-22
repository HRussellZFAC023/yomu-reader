export interface PrivatePracticeRecording {
    readonly url: string;
    readonly mimeType: string;
    readonly durationMs: number;
    dispose(): void;
}

export interface PrivatePracticeCapture {
    /** Resolves with an in-memory take, or null when the learner cancels. */
    readonly completion: Promise<PrivatePracticeRecording | null>;
    stop(): void;
    cancel(): void;
}

export interface PrivatePracticeRecorder {
    readonly supported: boolean;
    start(): Promise<PrivatePracticeCapture>;
    dispose(): void;
}

interface MediaRecorderLike extends EventTarget {
    readonly mimeType: string;
    readonly state: 'inactive' | 'recording' | 'paused';
    start(): void;
    stop(): void;
}

type MediaRecorderConstructor = new (
    stream: MediaStream,
    options?: MediaRecorderOptions,
) => MediaRecorderLike;

export interface PrivatePracticeRecorderOptions {
    readonly mediaDevices?: Pick<MediaDevices, 'getUserMedia'>;
    readonly MediaRecorder?: MediaRecorderConstructor;
    readonly maxDurationMs?: number;
    readonly now?: () => number;
    readonly createObjectURL?: (blob: Blob) => string;
    readonly revokeObjectURL?: (url: string) => void;
}

const DEFAULT_MAX_DURATION_MS = 12_000;

/**
 * Local rehearsal only: bytes remain in memory, are never persisted, and are
 * destroyed when the take or owning screen is disposed.
 */
export function createPrivatePracticeRecorder(
    options: PrivatePracticeRecorderOptions = {},
): PrivatePracticeRecorder {
    const mediaDevices = options.mediaDevices ?? globalThis.navigator?.mediaDevices;
    const Recorder = options.MediaRecorder ?? globalThis.MediaRecorder;
    const now = options.now ?? Date.now;
    const createObjectURL = options.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
    const revokeObjectURL = options.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
    const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
    const recordings = new Set<PrivatePracticeRecording>();
    let active: PrivatePracticeCapture | null = null;
    let disposed = false;

    const supported = Boolean(mediaDevices)
        && typeof mediaDevices?.getUserMedia === 'function'
        && typeof Recorder === 'function'
        && maxDurationMs > 0;

    return {
        supported,
        async start(): Promise<PrivatePracticeCapture> {
            if (!supported || !mediaDevices || !Recorder) {
                throw new DOMException('Private recording is not available in this browser.', 'NotSupportedError');
            }
            if (disposed) throw new DOMException('Recorder has been disposed.', 'InvalidStateError');
            active?.cancel();
            const stream = await mediaDevices.getUserMedia({ audio: true });
            if (disposed) {
                stopTracks(stream);
                throw new DOMException('Recorder has been disposed.', 'AbortError');
            }
            const chunks: Blob[] = [];
            const startedAt = now();
            const recorder = createMediaRecorder(Recorder, stream);
            let cancelled = false;
            let settled = false;
            let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
            let resolveCompletion: (recording: PrivatePracticeRecording | null) => void = () => undefined;
            const completion = new Promise<PrivatePracticeRecording | null>(resolve => {
                resolveCompletion = resolve;
            });
            const finish = (): void => {
                if (settled) return;
                settled = true;
                if (timeout !== undefined) globalThis.clearTimeout(timeout);
                stopTracks(stream);
                if (active === capture) active = null;
                if (cancelled || chunks.length === 0) {
                    resolveCompletion(null);
                    return;
                }
                const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' });
                const url = createObjectURL(blob);
                let released = false;
                const recording: PrivatePracticeRecording = {
                    url,
                    mimeType: blob.type,
                    durationMs: Math.max(0, now() - startedAt),
                    dispose() {
                        if (released) return;
                        released = true;
                        recordings.delete(recording);
                        revokeObjectURL(url);
                    },
                };
                recordings.add(recording);
                resolveCompletion(recording);
            };
            const capture: PrivatePracticeCapture = {
                completion,
                stop() {
                    if (recorder.state !== 'inactive') recorder.stop();
                },
                cancel() {
                    cancelled = true;
                    if (recorder.state !== 'inactive') recorder.stop();
                    else finish();
                },
            };
            recorder.addEventListener('dataavailable', event => {
                const data = (event as BlobEvent).data;
                if (!cancelled && data.size > 0) chunks.push(data);
            });
            recorder.addEventListener('stop', finish, { once: true });
            recorder.addEventListener('error', () => {
                cancelled = true;
                finish();
            }, { once: true });
            active = capture;
            recorder.start();
            timeout = globalThis.setTimeout(() => capture.stop(), maxDurationMs);
            return capture;
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            active?.cancel();
            active = null;
            for (const recording of [...recordings]) recording.dispose();
        },
    };
}

function createMediaRecorder(
    Recorder: MediaRecorderConstructor,
    stream: MediaStream,
): MediaRecorderLike {
    try {
        return new Recorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    } catch {
        return new Recorder(stream);
    }
}

function stopTracks(stream: MediaStream): void {
    for (const track of stream.getTracks()) track.stop();
}
