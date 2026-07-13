import { BrowserMediaBus } from '../../src/academy/audio/browser-media';
import type { AudioTrack } from '../../src/academy/audio/types';

class StrictMedia {
    preload = '';
    crossOrigin = '';
    loop = false;
    src = '';
    currentTime = 0;
    private volumeValue = 0;
    readonly played: string[] = [];

    get volume(): number { return this.volumeValue; }
    set volume(value: number) {
        if (value < 0 || value > 1) throw new DOMException('volume out of range', 'IndexSizeError');
        this.volumeValue = value;
    }

    async play(): Promise<void> { this.played.push(this.src); }
    pause(): void {}
    load(): void {}
    removeAttribute(name: string): void { if (name === 'src') this.src = ''; }
}

const track: AudioTrack = {
    id: 'authorized',
    title: 'Authorized track',
    url: '/academy/media/audio/test.flac',
    loop: true,
    gain: 1,
    rights: {
        owner: 'Test',
        licence: 'Test authorization',
        source: 'Test fixture',
        reviewed: true,
        scope: 'release',
    },
};

describe('BrowserMediaBus', () => {
    it('clamps a stale animation-frame timestamp instead of throwing on media volume', async () => {
        const media = new StrictMedia();
        vi.spyOn(performance, 'now').mockReturnValue(100);
        let frame = 0;
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            const timestamp = frame++ === 0 ? 99 : 200;
            queueMicrotask(() => callback(timestamp));
            return frame;
        });
        const bus = new BrowserMediaBus(() => media as unknown as HTMLAudioElement);

        await expect(bus.play(track, 1, 100)).resolves.toBeUndefined();
        expect(media.volume).toBe(1);
        expect(media.played).toEqual(['/academy/media/audio/test.flac']);
    });
});
