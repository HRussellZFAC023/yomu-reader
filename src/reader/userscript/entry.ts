import '../companions/register-build-target';
import { bootReaderApp } from '../app/boot';
import { isYomuNewTabUrl } from '../newtab/url';
import { installPreferredJapaneseSiteLanguageFromStoredSettings } from '../app/preferred-site-language';
import { installUserscriptHttpBridgeWhenReady } from './index';

installPreferredJapaneseSiteLanguageFromStoredSettings();
installUserscriptHttpBridgeWhenReady();
if (!isYomuNewTabUrl(location.href)) bootWhenDocumentIsReady();

function bootWhenDocumentIsReady(): void {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => bootReaderApp(), { once: true });
        return;
    }
    bootReaderApp();
}
