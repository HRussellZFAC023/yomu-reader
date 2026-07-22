import { createPrivatePracticeRecorder } from '../../src/academy/audio/private-practice-recorder';

class TestMediaRecorder extends EventTarget {
    static latest?: TestMediaRecorder;
    readonly mimeType = 'audio/webm;codecs=opus';
    state: 'inactive' | 'recording' | 'paused' = 'inactive';

    constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {
        super();
        TestMediaRecorder.latest = this;
    }

    start(): void {
        this.state = 'recording';
    }

    stop(): void {
        if (this.state === 'inactive') return;
        const data = new Event('dataavailable');
        Object.defineProperty(data, 'data', { value: new Blob(['voice'], { type: this.mimeType }) });
        this.dispatchEvent(data);
        this.state = 'inactive';
        this.dispatchEvent(new Event('stop'));
    }
}

describe('private practice recorder', () => {
    it('keeps a take in memory, stops the microphone and revokes it on disposal', async () => {
        const stopTrack = vi.fn();
        const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream));
        const createObjectURL = vi.fn(() => 'blob:yomu-private-take');
        const revokeObjectURL = vi.fn();
        const times = [100, 450];
        const recorder = createPrivatePracticeRecorder({
            mediaDevices: { getUserMedia } as never,
            MediaRecorder: TestMediaRecorder,
            createObjectURL,
            revokeObjectURL,
            now: () => times.shift() ?? 450,
            maxDurationMs: 10_000,
        });

        expect(recorder.supported).toBe(true);
        const capture = await recorder.start();
        capture.stop();
        const recording = await capture.completion;

        expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
        expect(recording).toMatchObject({
            url: 'blob:yomu-private-take',
            mimeType: 'audio/webm;codecs=opus',
            durationMs: 350,
        });
        expect(stopTrack).toHaveBeenCalledOnce();
        recording?.dispose();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:yomu-private-take');
        recorder.dispose();
    });

    it('cancels an active take without creating a URL', async () => {
        const stopTrack = vi.fn();
        const createObjectURL = vi.fn(() => 'blob:unexpected');
        const recorder = createPrivatePracticeRecorder({
            mediaDevices: {
                getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream)),
            } as never,
            MediaRecorder: TestMediaRecorder,
            createObjectURL,
            revokeObjectURL: vi.fn(),
        });
        const capture = await recorder.start();
        capture.cancel();
        await expect(capture.completion).resolves.toBeNull();
        expect(createObjectURL).not.toHaveBeenCalled();
        expect(stopTrack).toHaveBeenCalledOnce();
        recorder.dispose();
    });
});
