import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userFacingCopyKeyOf } from '../../src/reader/app/user-facing-errors';
import { requestBlob as requestDictionaryBlob } from '../../src/reader/dictionaries/yomitan/file-utils';

// Study with no installed Reader downloads a dictionary with the page's own
// fetch. The mirror answers any origin, so that fetch must be allowed to go
// direct; 2.0.9 refused every cross-origin archive with "No configured proxy."
const MIRROR_ZIP = 'https://dictionaries.yomureader.com/objects/sha256/fixture.zip';

describe('dictionary download from a page with no installed Reader', () => {
    beforeEach(() => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetches the mirror archive directly', async () => {
        const fetchMock = vi.fn(async () => new Response(new Uint8Array([80, 75, 3, 4]), {
            status: 200,
            headers: { 'content-type': 'application/zip' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const blob = await requestDictionaryBlob(MIRROR_ZIP, '');

        expect(blob.size).toBe(4);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(MIRROR_ZIP);
    });

    it('names a blocked cross-origin download so Settings can offer the manual import', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        }));

        const error = await requestDictionaryBlob('https://github.com/example/releases/latest/download/dict.zip', '').catch(caught => caught);

        expect(userFacingCopyKeyOf(error)).toBe('dictionaryDownloadBlocked');
    });
});
