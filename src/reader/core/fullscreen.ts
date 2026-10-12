type FullscreenDocument = Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
};

export function currentFullscreenElement(sourceDocument: Document = document): Element | null {
    const fullscreenDocument = sourceDocument as FullscreenDocument;
    return sourceDocument.fullscreenElement
        ?? fullscreenDocument.webkitFullscreenElement
        ?? fullscreenDocument.mozFullScreenElement
        ?? fullscreenDocument.msFullscreenElement
        ?? null;
}
