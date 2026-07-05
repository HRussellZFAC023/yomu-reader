/* Immersion example media boxes can be wider than the picture they show
   (object-fit: contain letterboxing, min-width floors). Captions are clamped
   in CSS to --yomu-immersion-frame-width, published here from the image's
   contain-fit painted width whenever an example image loads or swaps. */
export function publishImmersionFrameWidth(media: HTMLElement | null): void {
    if (!media) return;
    const rect = media.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const width = immersionPaintedWidth(media, rect);
    if (width) media.style.setProperty('--yomu-immersion-frame-width', `${Math.round(width)}px`);
    else media.style.removeProperty('--yomu-immersion-frame-width');
}

export function immersionPaintedWidth(media: HTMLElement, rect: DOMRect): number {
    const image = media.querySelector<HTMLImageElement>('.jpdb-reader-example-image');
    if (!image || !image.naturalWidth || !image.naturalHeight) return 0;
    return Math.min(rect.width, rect.height * (image.naturalWidth / image.naturalHeight));
}
