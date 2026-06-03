import { bootReaderApp } from './reader-boot';
import { isYomuNewTabUrl } from './new-tab-url';
import { installPreferredJapaneseSiteLanguageFromStoredSettings } from './preferred-site-language';
import { installUserscriptHttpBridge } from './userscript';

installPreferredJapaneseSiteLanguageFromStoredSettings();
installUserscriptHttpBridge();
if (!isYomuNewTabUrl(location.href)) bootWhenDocumentIsReady();

function bootWhenDocumentIsReady(): void {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => bootReaderApp(), { once: true });
        return;
    }
    bootReaderApp();
}
