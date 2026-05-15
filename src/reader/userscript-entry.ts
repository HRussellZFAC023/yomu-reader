import { bootReaderApp } from './reader-boot';
import { isYomuNewTabUrl } from './new-tab';
import { installUserscriptHttpBridge } from './userscript';

installUserscriptHttpBridge();
if (!isYomuNewTabUrl(location.href)) bootReaderApp();
