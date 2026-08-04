import type { FakeSegmenterSegment, FakeSegmenterSegments } from './jpdb/fixtures';

export type RecordedJapaneseBoundaryTable = {
    engine: string;
    captured: string;
    runs: Readonly<Record<string, readonly FakeSegmenterSegment[]>>;
};

export type JapaneseSegmentationCorpusCase = {
    text: string;
    expected: readonly { surface: string; start: number; end: number }[];
};

// Raw `Intl.Segmenter('ja', { granularity: 'word' })` boundaries recorded in
// real Chrome 150 (ICU4C) and Firefox 153 (ICU4X) on 2026-08-04. Firefox's
// Japanese `isWordLike` flags are retained even though Yomu deliberately keeps
// Japanese-script segments regardless of that flag.
export const RECORDED_JAPANESE_BOUNDARY_TABLES: readonly RecordedJapaneseBoundaryTable[] = [
    {
        engine: 'Chrome 150 / ICU4C',
        captured: '2026-08-04',
        runs: {
            'やさしいことばで書いたニュースです': [
                { segment: 'やさしい', index: 0, isWordLike: true },
                { segment: 'ことば', index: 4, isWordLike: true },
                { segment: 'で', index: 7, isWordLike: true },
                { segment: '書', index: 8, isWordLike: true },
                { segment: 'い', index: 9, isWordLike: true },
                { segment: 'た', index: 10, isWordLike: true },
                { segment: 'ニュース', index: 11, isWordLike: true },
                { segment: 'です', index: 15, isWordLike: true },
            ],
            'にほんごのニュースです': [
                { segment: 'に', index: 0, isWordLike: true },
                { segment: 'ほん', index: 1, isWordLike: true },
                { segment: 'ご', index: 3, isWordLike: true },
                { segment: 'の', index: 4, isWordLike: true },
                { segment: 'ニュース', index: 5, isWordLike: true },
                { segment: 'です', index: 9, isWordLike: true },
            ],
            '好きなものを読んで日本語を学ぶ': [
                { segment: '好き', index: 0, isWordLike: true },
                { segment: 'な', index: 2, isWordLike: true },
                { segment: 'もの', index: 3, isWordLike: true },
                { segment: 'を', index: 5, isWordLike: true },
                { segment: '読', index: 6, isWordLike: true },
                { segment: 'んで', index: 7, isWordLike: true },
                { segment: '日本語', index: 9, isWordLike: true },
                { segment: 'を', index: 12, isWordLike: true },
                { segment: '学ぶ', index: 13, isWordLike: true },
            ],
        },
    },
    {
        engine: 'Firefox 153 / ICU4X',
        captured: '2026-08-04',
        runs: {
            'やさしいことばで書いたニュースです': [
                { segment: 'やさしい', index: 0, isWordLike: true },
                { segment: 'ことば', index: 4, isWordLike: true },
                { segment: 'で', index: 7, isWordLike: true },
                { segment: '書', index: 8, isWordLike: true },
                { segment: 'い', index: 9, isWordLike: false },
                { segment: 'た', index: 10, isWordLike: true },
                { segment: 'ニュース', index: 11, isWordLike: true },
                { segment: 'です', index: 15, isWordLike: true },
            ],
            'にほんごのニュースです': [
                { segment: 'に', index: 0, isWordLike: true },
                { segment: 'ほん', index: 1, isWordLike: true },
                { segment: 'ご', index: 3, isWordLike: true },
                { segment: 'の', index: 4, isWordLike: false },
                { segment: 'ニュース', index: 5, isWordLike: true },
                { segment: 'です', index: 9, isWordLike: true },
            ],
            '好きなものを読んで日本語を学ぶ': [
                { segment: '好き', index: 0, isWordLike: true },
                { segment: 'な', index: 2, isWordLike: true },
                { segment: 'もの', index: 3, isWordLike: true },
                { segment: 'を', index: 5, isWordLike: true },
                { segment: '読', index: 6, isWordLike: true },
                { segment: 'んで', index: 7, isWordLike: true },
                { segment: '日本語', index: 9, isWordLike: true },
                { segment: 'を', index: 12, isWordLike: true },
                { segment: '学ぶ', index: 13, isWordLike: true },
            ],
        },
    },
];

export const NHK_STYLE_SEGMENTATION_CORPUS: readonly JapaneseSegmentationCorpusCase[] = [
    {
        text: 'やさしいことばで書いたニュースです',
        expected: [
            { surface: 'やさしい', start: 0, end: 4 },
            { surface: 'ことば', start: 4, end: 7 },
            { surface: 'で', start: 7, end: 8 },
            { surface: '書いた', start: 8, end: 11 },
            { surface: 'ニュース', start: 11, end: 15 },
            { surface: 'です', start: 15, end: 17 },
        ],
    },
    {
        text: 'にほんごのニュースです',
        expected: [
            { surface: 'にほんご', start: 0, end: 4 },
            { surface: 'の', start: 4, end: 5 },
            { surface: 'ニュース', start: 5, end: 9 },
            { surface: 'です', start: 9, end: 11 },
        ],
    },
    {
        text: '好きなものを読んで日本語を学ぶ',
        expected: [
            { surface: '好き', start: 0, end: 2 },
            { surface: 'な', start: 2, end: 3 },
            { surface: 'もの', start: 3, end: 5 },
            { surface: 'を', start: 5, end: 6 },
            { surface: '読んで', start: 6, end: 9 },
            { surface: '日本語', start: 9, end: 12 },
            { surface: 'を', start: 12, end: 13 },
            { surface: '学ぶ', start: 13, end: 15 },
        ],
    },
];

export function fakeSegmenterFromRecordedTable(table: RecordedJapaneseBoundaryTable): FakeSegmenterSegments {
    return value => {
        const segments = table.runs[value];
        if (!segments) throw new Error(`No recorded ${table.engine} Segmenter boundaries for: ${value}`);
        return segments.map(segment => ({ ...segment }));
    };
}
