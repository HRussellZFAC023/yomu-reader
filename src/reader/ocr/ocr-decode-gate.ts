// Only decoded images are read. An <img> that has a layout box but no decoded
// pixels yet draws as a blank canvas, so reading it early sent a provider a
// blank JPEG, then read the image again once it loaded. A request for an image
// that is still loading waits for its load event instead; a press made in the
// meantime is kept, not dropped.

export function isDecodedImage(image: HTMLImageElement): boolean {
    return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

export class OcrDecodeGate {
    // Whether any held request for the image was the learner's own.
    private readonly held = new WeakMap<HTMLImageElement, boolean>();

    constructor(private readonly onDecoded: (image: HTMLImageElement, userRequested: boolean) => void) {}

    /** Hold a request until the image decodes. A broken or empty image is never read. */
    hold(image: HTMLImageElement, userRequested: boolean): void {
        if (image.complete) return;
        const waiting = this.held.get(image);
        this.held.set(image, Boolean(waiting) || userRequested);
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
