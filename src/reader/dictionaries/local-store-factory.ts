import type { InterfaceLanguage } from '../app/types';
import type { LocalDictionaryStore } from './local-store';
import { YomitanDictionaryStore } from './yomitan/index';

/**
 * The one constructor of a realm's own LocalDictionaryStore. Study, its
 * settings recovery, the extension background and (through the settings-surface
 * companion) the userscript core all make their store here, so the Dictionary
 * Engine behind every surface is chosen in this function alone (ADR-0022).
 * The Reader in an extension content script does not own a store; it reaches
 * the background's through createReaderDictionaryStore (ADR-0010).
 */
export function createLocalDictionaryStore(
    getCorsProxyUrl: () => string = () => '',
    getInterfaceLanguage: () => InterfaceLanguage = () => 'en',
): LocalDictionaryStore {
    return new YomitanDictionaryStore(getCorsProxyUrl, getInterfaceLanguage);
}
