import { describe, expect, it } from 'vitest';
import { fallbackJapaneseSegments } from '../../src/reader/lookup/parser';
import { withFakeSegmenter } from './jpdb/fixtures';
import {
    fakeSegmenterFromRecordedTable,
    NHK_STYLE_SEGMENTATION_CORPUS,
    RECORDED_JAPANESE_BOUNDARY_TABLES,
} from './japanese-icu-boundary-fixture';

describe('Japanese segmentation engine parity', () => {
    it('normalizes recorded ICU4C and ICU4X boundaries to identical NHK-style tokens', async () => {
        const outputs: Array<readonly unknown[]> = [];
        for (const table of RECORDED_JAPANESE_BOUNDARY_TABLES) {
            const output = await withFakeSegmenter(fakeSegmenterFromRecordedTable(table), () => (
                NHK_STYLE_SEGMENTATION_CORPUS.map(({ text }) => fallbackJapaneseSegments(text).map(segment => ({
                    surface: segment.surface,
                    start: segment.start,
                    end: segment.end,
                })))
            ));
            expect(output, table.engine).toEqual(NHK_STYLE_SEGMENTATION_CORPUS.map(item => item.expected));
            outputs.push(output);
        }

        expect(outputs[1]).toEqual(outputs[0]);
        expect(outputs.flat(2)).toEqual(expect.arrayContaining([
            expect.objectContaining({ surface: 'ことば' }),
            expect.objectContaining({ surface: 'にほんご' }),
            expect.objectContaining({ surface: 'ニュース' }),
        ]));
    });
});
