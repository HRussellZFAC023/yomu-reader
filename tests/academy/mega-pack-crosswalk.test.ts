// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { MEGA_PACK_CROSSWALK_SCHEMA, buildMegaPackCrosswalk, resolveMegaPackRoot, validateMegaPackCrosswalk } from '../../scripts/academy-mega-pack-crosswalk.mjs';

const publicPath = path.resolve('public/academy/content/source-pipeline/mega-pack-crosswalk.v1.json');
const docsPath = path.resolve('docs/public/academy/content/source-pipeline/mega-pack-crosswalk.v1.json');

describe('Mega Pack curriculum crosswalk', () => {
    it('publishes byte-identical mirrors with eight mapped source fingerprints', () => {
        const publicBytes = readFileSync(publicPath, 'utf8');
        const docsBytes = readFileSync(docsPath, 'utf8');
        const published = JSON.parse(publicBytes);

        expect(docsBytes).toBe(publicBytes);
        expect(published.schema).toBe(MEGA_PACK_CROSSWALK_SCHEMA);
        expect(published.coverage).toMatchObject({
            requestedFolderCount: 8,
            mappedFolderCount: 8,
            mappedSegmentCount: 8,
        });
        expect(published.coverage.folders.map((folder: any) => folder.fileCount)).toEqual([
            30, 409, 296, 189, 299, 66, 37, 103,
        ]);
        expect(new Set(published.segments.map((item: any) => item.source.payloadSha256)).size).toBe(8);
        expect(validateMegaPackCrosswalk(published)).toEqual([]);
        expect(JSON.stringify(published)).not.toContain('/Users/');
    });

    it.runIf(existsSync(resolveMegaPackRoot()))('regenerates from the eight hash-verified local source files', () => {
        const generated = buildMegaPackCrosswalk();
        const published = JSON.parse(readFileSync(publicPath, 'utf8'));
        expect(generated).toEqual(published);
    });

    it('maps every segment in both directions by skill, JLPT, concept, and Academy chapter', () => {
        const catalog = JSON.parse(readFileSync(publicPath, 'utf8'));
        const dimensions = [
            ['skills', 'skill'],
            ['jlpt', 'jlpt'],
            ['concepts', 'concept'],
            ['chapters', 'chapter'],
        ] as const;

        for (const segment of catalog.segments) {
            for (const [mappingKey, indexKey] of dimensions) {
                expect(segment.mapping[mappingKey].length).toBeGreaterThan(0);
                for (const value of segment.mapping[mappingKey]) {
                    expect(catalog.indexes[indexKey][value]).toContain(segment.id);
                }
            }
        }

        expect(catalog.indexes.chapter['mega-particles-01']).toEqual([
            'mega-pack-03-topic-particle-wa',
            'mega-pack-08-particle-cheatsheet',
        ]);
        expect(catalog.indexes.concept['particle:wa']).toEqual([
            'mega-pack-03-topic-particle-wa',
            'mega-pack-08-particle-cheatsheet',
        ]);
        expect(catalog.playableSlice.segmentIds).toEqual([
            'mega-pack-01-hiragana-quiz-a-ko',
            'mega-pack-05-momotarou-opening',
            'mega-pack-08-particle-cheatsheet',
        ]);
    });
});
