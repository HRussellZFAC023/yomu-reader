const READER_CSS_RESOURCE = 'yomuCss';

export const READER_CSS = resourceReaderCss();

function resourceReaderCss(): string {
    try {
        return typeof GM_getResourceText === 'function'
            ? GM_getResourceText(READER_CSS_RESOURCE)
            : '';
    } catch {
        return '';
    }
}
