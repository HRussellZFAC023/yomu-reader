// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { MEGA_PACK_STREAM_SCHEMA, validateMegaPackStreamCatalog } from '../../scripts/academy-source-pipeline/catalogs/mega-pack-stream.mjs';

const catalogPath = path.resolve('public/academy/content/source-pipeline/mega-pack-stream.v1.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

describe('Mega Pack stream source catalog', () => {
    it('censuses every requested source group without leaking private filesystem paths', () => {
        expect(catalog.schema).toBe(MEGA_PACK_STREAM_SCHEMA);
        expect(catalog.census.requestedSourceCount).toBe(13);
        expect(catalog.census.megaPackFolderCount).toBe(8);
        expect(catalog.census.sources).toHaveLength(13);
        expect(catalog.census.sources.filter((source: any) => source.id.startsWith('mega-'))).toHaveLength(8);
        expect(catalog.census.sources.map((source: any) => source.rank)).toEqual(
            Array.from({ length: 13 }, (_, index) => index + 1),
        );
        expect(JSON.stringify(catalog)).not.toContain('/Users/');
        expect(validateMegaPackStreamCatalog(catalog)).toEqual([]);
    });

    it('records exact counts for the highest-value licensed and course sources', () => {
        expect(source('genki-study-resources').counts).toMatchObject({
            files: 1909,
            uniquePayloads: 1909,
            instructionalCandidates: 1016,
        });
        expect(source('lessons').counts).toMatchObject({ files: 129, uniquePayloads: 75 });
        expect(source('vocabulary-loose-lists').counts.files).toBe(2);
        expect(source('subtitles').counts).toMatchObject({ files: 14, included: 13 });
        expect(source('kanji-look-and-learn').counts).toMatchObject({ files: 5, uniquePayloads: 4 });
    });

    it('selects only MIT-permitted verbatim content and maps it to week, skill, and JLPT', () => {
        expect(catalog.policy.sourcePreference).toEqual(['genki', 'minna', 'moodle']);
        expect(catalog.policy.excludedPathPatterns).toContain('(^|/)typer(/|$)');
        expect(catalog.selectedSlice).toMatchObject({
            id: 'l1-l01-genki-sentence-builder',
            pluginKind: 'academy-sentence-builder',
            source: {
                payloadSha256: 'b909643450ead83af08d8dd22f717f9d320b165e5accf790514a31212d155451',
                rights: 'permitted-mit',
            },
            mapping: {
                academyWeek: 'l1-l01',
                moodleModuleId: 5777762,
                jlpt: 'N5',
            },
        });
        expect(catalog.selectedSlice.mapping.skills).toEqual(['grammar', 'reading', 'sentence-construction']);
        expect(catalog.selectedSlice.exercises).toEqual([
            expect.objectContaining({ prompt: 'Ms. Ogawa is Japanese.', answer: 'おがわさんはにほんじんです。' }),
            expect.objectContaining({ prompt: 'Mr. Takeda is a teacher.', answer: 'たけださんはせんせいです。' }),
        ]);
    });

    it('keeps copyrighted reference packs ranked but non-playable until review', () => {
        const reviewSources = catalog.census.sources.filter((item: any) => item.rights.includes('review-required'));
        expect(reviewSources.length).toBeGreaterThan(0);
        expect(reviewSources.every((item: any) => item.lane !== 'primary-permitted')).toBe(true);
        expect(catalog.curriculumCrosswalk.find((item: any) => item.id === 'kanji-look-and-learn-main')).toMatchObject({
            decision: 'defer-until-kanji-crosswalk',
            mapping: { academyWeek: null },
        });
    });
});

function source(id: string): any {
    const found = catalog.census.sources.find((item: any) => item.id === id);
    if (!found) throw new Error(`Missing source ${id}`);
    return found;
}
