import { afterEach, describe, expect, it, vi } from 'vitest';

import { KanjiVGClient } from '../../src/reader/kanji/vg';
import { USERSCRIPT_EVENT_BRIDGE_PROBE_TIMEOUT_MS } from '../../src/reader/userscript';

const KANJIVG_RESPONSE = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
        <g kvg:element="自">
            <path d="M20 15L80 15" />
            <path d="M50 15L50 90" />
        </g>
        <text transform="matrix(1 0 0 1 10 10)">1</text>
        <text transform="matrix(1 0 0 1 45 25)">2</text>
    </svg>
`;

afterEach(() => {
    vi.useRealTimers();
    delete document.documentElement.dataset.yomuUserscriptHttpBridge;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('KanjiVG hosted transport', () => {
    it('renders stroke SVG through direct fetch when the hosted bridge marker is stale', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('location', new URL('https://yomureader.com/academy/'));
        document.documentElement.dataset.yomuUserscriptHttpBridge = 'true';
        const fetchMock = vi.fn().mockResolvedValue(new Response(KANJIVG_RESPONSE, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const lookup = new KanjiVGClient().lookup('自');
        await vi.advanceTimersByTimeAsync(USERSCRIPT_EVENT_BRIDGE_PROBE_TIMEOUT_MS + 1);
        const info = await lookup;

        expect(fetchMock).toHaveBeenCalledWith(
            'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/081ea.svg',
            expect.objectContaining({ credentials: 'omit' }),
        );
        expect(info).toMatchObject({ kanji: '自', strokeCount: 2 });
        expect(info?.svg).toContain('jpdb-reader-kanjivg-svg');
        expect(info?.svg.match(/<path /g)).toHaveLength(2);
    });
});
