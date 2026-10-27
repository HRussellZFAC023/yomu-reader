// Only decoded images are read. An <img> that has a layout box but no decoded
// pixels yet draws as a blank canvas, so reading it early sent a provider a
// blank JPEG, then read the image again once it loaded. A request for an image
// that is still loading waits for its load event instead; a press made in the
// meantime is kept, not dropped.

/** Who asked for a read: nobody (automatic), a pointer passing over, or a press. */
export type OcrAsk = 'auto' | 'hover' | 'press';

const ASK_RANK: Record<OcrAsk, number> = { auto: 0, hover: 1, press: 2 };

export function isDecodedImage(image: HTMLImageElement): boolean {
    return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

export class OcrDecodeGate {
    // The strongest ask held for the image while it loads.
    private readonly held = new WeakMap<HTMLImageElement, OcrAsk>();

    constructor(private readonly onDecoded: (image: HTMLImageElement, ask: OcrAsk) => void) {}

    /** Hold a request until the image decodes. A broken or empty image is never read. */
    hold(image: HTMLImageElement, ask: OcrAsk): void {
        if (image.complete) return;
        const waiting = this.held.get(image);
        this.held.set(image, waiting && ASK_RANK[waiting] > ASK_RANK[ask] ? waiting : ask);
        if (waiting !== undefined) return;
        const settle = (): void => {
            image.removeEventListener('load', settle);
            image.removeEventListener('error', settle);
            const requested = this.held.get(image);
            this.held.delete(image);
            if (requested !== undefined && isDecodedImage(image)) this.onDecoded(image, requested);
        };
        image.addEventListener('load', settle);
        image.addEventListener('error', settle);
    }
}
