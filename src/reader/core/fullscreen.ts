type FullscreenDocument = Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
};

export function currentFullscreenElement(): Element | null {
    const fullscreenDocument = document as FullscreenDocument;
    return document.fullscreenElement
        ?? fullscreenDocument.webkitFullscreenElement
        ?? fullscreenDocument.mozFullScreenElement
        ?? fullscreenDocument.msFullscreenElement
        ?? null;
}
