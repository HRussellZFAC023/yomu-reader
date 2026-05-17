import { bootReaderApp } from './reader-boot';
import { isYomuNewTabUrl } from './new-tab-url';
import { installUserscriptHttpBridge } from './userscript';

installUserscriptHttpBridge();
if (!isYomuNewTabUrl(location.href)) bootReaderApp();
