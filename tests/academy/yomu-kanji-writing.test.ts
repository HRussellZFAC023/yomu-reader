import { createCanonicalKanjiWritingService } from '../../src/academy/integration/yomu-kanji-writing';

const ONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
  <path d="M11,54.25 L96,50"/><text transform="matrix(1 0 0 1 4 54)">1</text>
</svg>`;

describe('canonical Academy Kanji writing bridge', () => {
    it('loads the pinned offline KanjiVG trace and exposes its provenance', async () => {
        const fetcher = vi.fn(async () => new Response(ONE_SVG, { status: 200 }));
        const service = createCanonicalKanjiWritingService({ fetcher: fetcher as typeof fetch });
        const model = await service.lookup('一');
        expect(fetcher).toHaveBeenCalledWith('/academy/vendor/kanjivg/04e00.svg');
        expect(model).toMatchObject({ character: '一', strokeCount: 1 });
        expect(model?.source).toEqual(expect.objectContaining({ name: 'KanjiVG', licence: 'CC BY-SA 3.0' }));
    });

    it('does not invent an unshipped offline trace', async () => {
        const fetcher = vi.fn();
        const service = createCanonicalKanjiWritingService({ fetcher: fetcher as typeof fetch });
        await expect(service.lookup('語')).resolves.toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('sanitizes the vendored SVG before the Doodle shell receives markup', async () => {
        const hostile = `<svg viewBox="0 0 109 109" onload="alert(1)">
          <script>alert(1)</script><path d="M11 54 L96 50" onclick="alert(2)"/>
        </svg>`;
        const service = createCanonicalKanjiWritingService({
            fetcher: vi.fn(async () => new Response(hostile, { status: 200 })) as typeof fetch,
        });
        const model = await service.lookup('一');
        expect(model?.svg).toContain('<path d="M11 54 L96 50"');
        expect(model?.svg).not.toMatch(/script|onload|onclick/i);
    });
});
