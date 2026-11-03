import { afterEach, expect, it } from 'vitest';
import { ReaderApp } from '../../src/reader/app/main';
import { normalizeReaderSettings } from '../../src/reader/settings';

let app: ReaderApp | undefined;
afterEach(() => { app?.destroy(); app = undefined; document.body.replaceChildren(); });

it('initializes the real Reader with a packaged stylesheet when hosted CSS is unavailable', async () => {
    const css = '.jpdb-reader-popover{--packaged-selection-proof:1}.jpdb-reader-settings{}.jpdb-reader-source-card{}.jpdb-subtitle-player{}.jpdb-ocr-layer{}';
    app = new ReaderApp(async () => undefined, false);
    await app.init({ readerCss: css, startupSettings: normalizeReaderSettings({ showFloatingButton: false, ocrEnabled: false, annotationsPaused: true }) });
    expect([...document.querySelectorAll('style')].some(style => style.textContent?.includes('--packaged-selection-proof:1'))).toBe(true);
});
