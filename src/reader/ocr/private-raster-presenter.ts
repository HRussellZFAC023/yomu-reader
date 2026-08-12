type PrivateRasterSourceOptions = {
    /** Only revoke object URLs created for this presentation, never page-owned blob URLs. */
    revokeOnRelease?: boolean;
};

type PrivateRasterPresentation = {
    host: HTMLElement;
    image: HTMLImageElement;
    root: ShadowRoot;
    ownedObjectUrl?: string;
};

const presentationsByImage = new WeakMap<HTMLImageElement, PrivateRasterPresentation>();
const imagesByHost = new WeakMap<Element, HTMLImageElement>();

/**
 * Creates an OCR image whose pixels live only inside a closed shadow root.
 *
 * The light-DOM host deliberately carries geometry/classes only. Page scripts can
 * observe or reposition that host, but cannot query a pixel-bearing element, read
 * its source, or obtain the closed root through `host.shadowRoot`.
 */
export function createPrivateRasterImage(className: string): HTMLImageElement {
    const host = document.createElement('div');
    host.className = className;
    host.dataset.yomuPrivateRasterHost = 'true';
    host.setAttribute('aria-hidden', 'true');
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = ':host{display:block}img{display:block;width:100%;height:100%;margin:0;padding:0;border:0;object-fit:fill;pointer-events:none}';
    const image = document.createElement('img');
    image.alt = '';
    root.append(style, image);
    const presentation = { host, image, root };
    presentationsByImage.set(image, presentation);
    imagesByHost.set(host, image);
    return image;
}

export function privateRasterHost(image: HTMLImageElement): HTMLElement {
    const host = presentationsByImage.get(image)?.host;
    if (!host) throw new Error('OCR raster image has no private presentation.');
    return host;
}

export function setPrivateRasterClass(image: HTMLImageElement, className: string, enabled: boolean): void {
    image.classList.toggle(className, enabled);
    privateRasterHost(image).classList.toggle(className, enabled);
}

export function setPrivateRasterSource(
    image: HTMLImageElement,
    source: string,
    options: PrivateRasterSourceOptions = {},
): void {
    const presentation = presentationsByImage.get(image);
    if (!presentation) throw new Error('OCR raster image has no private presentation.');
    releaseOwnedObjectUrl(presentation);
    image.src = source;
    if (options.revokeOnRelease && source.startsWith('blob:')) presentation.ownedObjectUrl = source;
}

export function positionPrivateRasterImage(image: HTMLImageElement, rect: DOMRect): void {
    for (const element of [privateRasterHost(image), image]) {
        element.style.left = `${rect.left}px`;
        element.style.top = `${rect.top}px`;
        element.style.width = `${rect.width}px`;
        element.style.height = `${rect.height}px`;
    }
}

export function releasePrivateRasterImage(image: HTMLImageElement): void {
    const presentation = presentationsByImage.get(image);
    if (!presentation) {
        image.removeAttribute('src');
        image.remove();
        return;
    }
    releaseOwnedObjectUrl(presentation);
    image.removeAttribute('src');
    presentation.root.replaceChildren();
    presentation.host.remove();
    presentationsByImage.delete(image);
    imagesByHost.delete(presentation.host);
}

function releaseOwnedObjectUrl(presentation: PrivateRasterPresentation): void {
    const url = presentation.ownedObjectUrl;
    presentation.ownedObjectUrl = undefined;
    if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}

/** Trusted module/test bridge; it is not installed on window or any DOM node. */
export function privateRasterImageForHost(host: Element | null): HTMLImageElement | undefined {
    return host ? imagesByHost.get(host) : undefined;
}
