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

// With a Reader installed, Study still reads the archive itself where it can:
// the Reader bridge carries the whole archive in one message, and a 51 MB
// dictionary (Pixiv Light) outlasted its 120 s budget.
describe('dictionary download on Study with an installed Reader', () => {
    const GITHUB_ZIP = 'https://github.com/example/releases/latest/download/dict.zip';
    const installedReader = () => {
        const manager = vi.fn((details: { onload?: (response: unknown) => void }) => {
            details.onload?.({ status: 200, response: new Blob([new Uint8Array([1, 2])], { type: 'application/zip' }) });
            return { abort: vi.fn() };
        });
        vi.stubGlobal('GM_xmlhttpRequest', manager);
        return manager;
    };

    beforeEach(() => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetches any https archive with the page first', async () => {
        const manager = installedReader();
        const fetchMock = vi.fn(async () => new Response(new Uint8Array([80, 75, 3, 4]), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const blob = await requestDictionaryBlob(GITHUB_ZIP, '');

        expect(blob.size).toBe(4);
        expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(GITHUB_ZIP);
        expect(manager).not.toHaveBeenCalled();
    });

    it('asks the Reader only when the page may not read that host', async () => {
        const manager = installedReader();
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        }));

        const blob = await requestDictionaryBlob(GITHUB_ZIP, '');

        expect(blob.size).toBe(2);
        expect(manager).toHaveBeenCalledOnce();
    });

    it('reports a server error from the page fetch without retrying through the Reader', async () => {
        const manager = installedReader();
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

        const error = await requestDictionaryBlob(GITHUB_ZIP, '').catch(caught => caught);

        expect(userFacingCopyKeyOf(error)).toBe('dictionaryDownloadFailed');
        expect(manager).not.toHaveBeenCalled();
    });

    it('leaves an ordinary page on the manager, which is the only way it can reach the host', async () => {
        const manager = installedReader();
        vi.stubGlobal('location', new URL('https://example.com/article'));
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await requestDictionaryBlob(GITHUB_ZIP, '');

        expect(manager).toHaveBeenCalledOnce();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
