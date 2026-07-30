import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ACADEMY_APPROVED_CHARACTER_SPRITES } from '../../src/academy/assets';
import {
    ACADEMY_SPRITE_COVERAGE_SUMMARY,
    ACADEMY_SPRITE_PERFORMANCE_CONTRACT,
    SPRITE_ANGLES,
    SPRITE_EXPRESSIONS,
    validateSpritePerformanceContract,
    type CastSpritePerformanceContract,
} from '../../src/academy/domain/sprite-performance-contract';
import { ACADEMY_CAST } from '../../src/academy/domain/cast-registry';

describe('Academy VN sprite performance contract', () => {
    it('covers every cast member with varied silhouettes and the complete performance matrix', () => {
        const expectedIds = ACADEMY_CAST.map(member => member.id);

        expect(Object.keys(ACADEMY_SPRITE_PERFORMANCE_CONTRACT)).toEqual(expectedIds);
        expect(validateSpritePerformanceContract(ACADEMY_SPRITE_PERFORMANCE_CONTRACT)).toEqual([]);
        for (const member of Object.values(ACADEMY_SPRITE_PERFORMANCE_CONTRACT)) {
            expect(member.poses.map(pose => pose.angle)).toEqual(SPRITE_ANGLES);
            for (const pose of member.poses) {
                expect(Object.keys(pose.expressions)).toEqual(SPRITE_EXPRESSIONS);
            }
        }
    });

    it('reports raster evidence without promoting review candidates', () => {
        const status = (castId: keyof typeof ACADEMY_SPRITE_PERFORMANCE_CONTRACT, expression: string) =>
            ACADEMY_SPRITE_PERFORMANCE_CONTRACT[castId].poses
                .find(pose => pose.angle === 'front-near-front')
                ?.expressions[expression as keyof (typeof ACADEMY_SPRITE_PERFORMANCE_CONTRACT)[typeof castId]['poses'][number]['expressions']]
                .status;

        expect(status('rie', 'neutral')).toBe('approved');
        expect(status('rie', 'happy')).toBe('approved');
        expect(status('rie', 'encouraging-listening')).toBe('missing');
        expect(status('aakash', 'neutral')).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.aakash.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.aakash.poses[0].expressions.thoughtful.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.aakash.poses[1].expressions.neutral.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.aakash.poses[2].expressions['encouraging-listening'].status)
            .toBe('approved');
        expect(status('peter', 'neutral')).toBe('approved');
        expect(status('rose', 'neutral')).toBe('approved');
        expect(status('jodi', 'neutral')).toBe('approved');
        expect(status('nanako', 'neutral')).toBe('approved');
        expect(status('felix', 'neutral')).toBe('approved');
        expect(status('shaun', 'neutral')).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.shaun.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.xingyu.poses[2].expressions['encouraging-listening'].status)
            .toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rie.poses[0].expressions.determined.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rie.poses[0].expressions['sad-vulnerable'].status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rie.unmappedRasters)
            .toContainEqual(expect.objectContaining({
                label: 'comedic:right-three-quarter',
                status: 'approved',
            }));
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.sophie.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.sophie.poses[0].expressions.determined.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.sophie.poses[1].expressions.neutral.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.sophie.poses[2].expressions['encouraging-listening'].status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.henry.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.henry.poses[0].expressions.thoughtful.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.henry.poses[1].expressions.happy.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.henry.poses[2].expressions['surprised-shocked'].status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.jenny.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.jenny.poses[0].expressions.thoughtful.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.jenny.poses[1].expressions.neutral.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.jenny.poses[2].expressions['encouraging-listening'].status)
            .toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.tom.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.tom.poses[0].expressions.thoughtful.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.tom.poses[1].expressions.neutral.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.tom.poses[2].expressions['encouraging-listening'].status)
            .toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.sam.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.sam.poses[0].expressions.thoughtful.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.sam.poses[1].expressions.neutral.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.sam.poses[2].expressions['encouraging-listening'].status)
            .toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.alex.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.alex.poses[0].expressions.thoughtful.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.alex.poses[1].expressions.neutral.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.alex.poses[2].expressions['encouraging-listening'].status)
            .toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.peter.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.peter.poses[0].expressions.thoughtful.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.peter.poses[1].expressions.neutral.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.peter.poses[2].expressions['encouraging-listening'].status)
            .toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rose.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rose.poses[0].expressions.thoughtful.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rose.poses[1].expressions.neutral.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rose.poses[2].expressions['encouraging-listening'].status)
            .toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.jodi.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.jodi.poses[0].expressions.thoughtful.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.jodi.poses[1].expressions.neutral.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.jodi.poses[2].expressions['encouraging-listening'].status)
            .toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.nanako.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.nanako.poses[0].expressions.thoughtful.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.nanako.poses[1].expressions.neutral.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.nanako.poses[2].expressions['encouraging-listening'].status)
            .toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.tom2.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.steve.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.xingyu.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        expect(ACADEMY_SPRITE_COVERAGE_SUMMARY.approved).toBeGreaterThanOrEqual(22);
        expect(Object.values(ACADEMY_SPRITE_COVERAGE_SUMMARY)
            .reduce((total, count) => total + count, 0))
            .toBe(ACADEMY_CAST.length * SPRITE_ANGLES.length * SPRITE_EXPRESSIONS.length);
    });

    it('keeps textbook-legend previews separate from approved runtime art', () => {
        for (const castId of ['miller', 'tawapon', 'mary', 'takeshi'] as const) {
            expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT[castId].coverage)
                .toEqual({ approved: 0, reviewCandidates: 2, missing: 19 });
        }
    });

    it('locks Felix to his complete approved performance family', () => {
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.felix.coverage)
            .toEqual({ approved: 7, reviewCandidates: 0, missing: 14 });
        const approved = ACADEMY_SPRITE_PERFORMANCE_CONTRACT.felix.poses
            .flatMap(pose => Object.values(pose.expressions))
            .filter(cell => cell.status === 'approved');
        expect(approved).toHaveLength(7);
        expect(approved.every(candidate => 'approvedAssetId' in candidate)).toBe(true);
    });

    it('keeps Rie’s useful comedic extra visible outside the seven core performances', () => {
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rie.unmappedRasters.map(asset => asset.label))
            .toEqual(['comedic:right-three-quarter']);
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rie.unmappedRasters.every(asset =>
            asset.status === 'approved')).toBe(true);
    });

    it('accounts for every physical cast raster and approves only registered art', () => {
        const cells = Object.values(ACADEMY_SPRITE_PERFORMANCE_CONTRACT)
            .flatMap(member => member.poses)
            .flatMap(pose => Object.values(pose.expressions));
        const mappedPaths = cells.flatMap(cell => cell.status === 'missing' ? [] : [cell.assetPath]);
        const unmappedPaths = Object.values(ACADEMY_SPRITE_PERFORMANCE_CONTRACT)
            .flatMap(member => member.unmappedRasters.map(asset => asset.assetPath));
        const physicalPaths = fs.readdirSync(path.resolve('public/academy/art/characters'), { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .flatMap(entry => fs.readdirSync(path.resolve('public/academy/art/characters', entry.name))
                .filter(file => file.endsWith('.webp'))
                .map(file => `/academy/art/characters/${entry.name}/${file}`))
            .sort();
        const approvedPaths = [
            ...cells.flatMap(cell => cell.status === 'approved' ? [cell.assetPath] : []),
            ...Object.values(ACADEMY_SPRITE_PERFORMANCE_CONTRACT)
                .flatMap(member => member.unmappedRasters)
                .flatMap(asset => asset.status === 'approved' ? [asset.assetPath] : []),
        ];

        expect([...mappedPaths, ...unmappedPaths].sort()).toEqual(physicalPaths);
        const approvedPathSet = new Set<string>(approvedPaths);
        expect(Object.values(ACADEMY_APPROVED_CHARACTER_SPRITES)
            .every(assetPath => approvedPathSet.has(assetPath))).toBe(true);
    });

    it('keeps every delivered character raster as a non-empty transparent cutout', async () => {
        const files = fs.readdirSync(path.resolve('public/academy/art/characters'), { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .flatMap(entry => fs.readdirSync(path.resolve('public/academy/art/characters', entry.name))
                .filter(file => file.endsWith('.webp'))
                .map(file => path.resolve('public/academy/art/characters', entry.name, file)));

        for (const file of files) {
            const alpha = await readRasterAlpha(file);
            expect(alpha.minimum, `${file} needs transparent pixels`).toBe(0);
            expect(alpha.maximum, `${file} needs visible pixels`).toBe(255);
            expect(alpha.corners, `${file} needs a clear no-background perimeter`).toEqual([0, 0, 0, 0]);
        }
    }, 30_000);

    it('preserves corrected briefs and separates Xingyu\'s rejected reference from approved listening art', () => {
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.peter.likenessBrief).toBe('About 26, with lighter remaining hair.');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.felix.likenessBrief)
            .toBe('White, glasses, longer curly dark-blond to light-brown hair; likes cats.');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.xingyu).toMatchObject({
            referencePolicy: 'owner-rejected-old-image-do-not-reference',
        });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.xingyu.poses[2].expressions['encouraging-listening'])
            .toMatchObject({
                status: 'approved',
                assetPath: '/academy/art/characters/xingyu/xingyu__encouraging-listening-short-hair-round-glasses__right-three-quarter__fullbody__v002.webp',
                approvedAssetId: 'character.xingyu.listening',
            });
        const approvedPerformances = ACADEMY_SPRITE_PERFORMANCE_CONTRACT.xingyu.poses
            .flatMap(pose => Object.values(pose.expressions))
            .filter(cell => cell.status === 'approved');
        expect(approvedPerformances).toHaveLength(7);
    });

    it('rejects a silhouette descriptor reused anywhere in the cast', () => {
        const clone = structuredClone(ACADEMY_SPRITE_PERFORMANCE_CONTRACT) as Record<string, CastSpritePerformanceContract>;
        const duplicated = clone.rie.poses[0].silhouette;
        clone.henry = {
            ...clone.henry,
            poses: clone.henry.poses.map((pose, index) => index === 0 ? { ...pose, silhouette: duplicated } : pose),
        };

        expect(validateSpritePerformanceContract(clone)).toContainEqual(expect.objectContaining({
            code: 'duplicate-silhouette',
        }));
    });
});

async function readRasterAlpha(file: string): Promise<Readonly<{
    minimum: number;
    maximum: number;
    corners: readonly number[];
}>> {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.channels, `${file} must decode to RGBA`).toBe(4);
    let minimum = 255;
    let maximum = 0;
    for (let index = info.channels - 1; index < data.length; index += info.channels) {
        const value = data[index];
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
    }
    return {
        minimum,
        maximum,
        corners: [
            data[info.channels - 1],
            data[(info.width - 1) * info.channels + info.channels - 1],
            data[(info.height - 1) * info.width * info.channels + info.channels - 1],
            data[data.length - 1],
        ],
    };
}
