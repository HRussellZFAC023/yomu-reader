import { describe, expect, it } from 'vitest';

import { getReaderDictionaryExport, readerDictionaryExportHasData } from '../../src/reader/settings-file-io';

describe('settings file IO', () => {
    it('detects legacy bundled dictionary backups with entries rows', () => {
        const dictionaryData = {
            formatName: 'jpdb-reader-yomitan-dictionaries',
            entries: [{
                expression: '読む',
                reading: 'よむ',
                glossary: ['to read'],
                dictionary: 'Legacy Dictionary',
            }],
        };
        const exportJson = {
            formatName: 'jpdb-popup-reader-settings',
            settings: { apiKey: 'restored' },
            dictionaryData,
        };

        const extracted = getReaderDictionaryExport(exportJson);

        expect(extracted).toBe(dictionaryData);
        expect(readerDictionaryExportHasData(extracted)).toBe(true);
    });
});
