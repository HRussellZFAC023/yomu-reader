import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
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
        for (const castId of ['peter', 'felix', 'shaun'] as const) {
            expect(status(castId, 'neutral')).toBe('review-candidate');
        }
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.xingyu.poses[1].expressions['encouraging-listening'].status)
            .toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rie.poses[0].expressions.determined.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rie.poses[0].expressions['sad-vulnerable'].status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rie.poses[2].expressions.comedic.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.sophie.coverage)
            .toEqual({ approved: 3, reviewCandidates: 0, missing: 18 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.sophie.poses[0].expressions.determined.status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.sophie.poses[1].expressions['encouraging-listening'].status).toBe('approved');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.sophie.poses[2].expressions.neutral.status).toBe('approved');
        const totalPerformanceCells = ACADEMY_CAST.length * SPRITE_ANGLES.length * SPRITE_EXPRESSIONS.length;
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.tom2.coverage)
            .toEqual({ approved: 0, reviewCandidates: 3, missing: 18 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.steve.coverage)
            .toEqual({ approved: 3, reviewCandidates: 0, missing: 18 });
        expect(ACADEMY_SPRITE_COVERAGE_SUMMARY).toEqual({
            approved: 15,
            reviewCandidates: 10,
            missing: totalPerformanceCells - 25,
        });
    });

    it('keeps every textbook legend fully missing until original Yomu art is approved', () => {
        for (const castId of ['miller', 'tawapon', 'mary', 'takeshi'] as const) {
            expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT[castId].coverage)
                .toEqual({ approved: 0, reviewCandidates: 0, missing: 21 });
        }
    });

    it('makes the Peter and Felix approval gap explicit', () => {
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.peter.coverage)
            .toEqual({ approved: 0, reviewCandidates: 3, missing: 18 });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.felix.coverage)
            .toEqual({ approved: 0, reviewCandidates: 3, missing: 18 });
        for (const castId of ['peter', 'felix'] as const) {
            const candidates = ACADEMY_SPRITE_PERFORMANCE_CONTRACT[castId].poses
                .flatMap(pose => Object.values(pose.expressions))
                .filter(cell => cell.status === 'review-candidate');
            expect(candidates.every(candidate => !('approvedAssetId' in candidate))).toBe(true);
        }
    });

    it('keeps the sole off-contract Rie review raster visible without counting it as coverage', () => {
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rie.unmappedRasters.map(asset => asset.label))
            .toEqual(['thinking']);
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.rie.unmappedRasters.every(asset =>
            asset.status === 'review-candidate')).toBe(true);
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
                .filter(file => file.endsWith('.png'))
                .map(file => `/academy/art/characters/${entry.name}/${file}`))
            .sort();
        const approvedPaths = cells.flatMap(cell => cell.status === 'approved' ? [cell.assetPath] : []);

        expect([...mappedPaths, ...unmappedPaths].sort()).toEqual(physicalPaths);
        expect(approvedPaths.sort()).toEqual(Object.values(ACADEMY_APPROVED_CHARACTER_SPRITES).sort());
    });

    it('keeps every delivered character raster as a non-empty transparent cutout', () => {
        const files = fs.readdirSync(path.resolve('public/academy/art/characters'), { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .flatMap(entry => fs.readdirSync(path.resolve('public/academy/art/characters', entry.name))
                .filter(file => file.endsWith('.png'))
                .map(file => path.resolve('public/academy/art/characters', entry.name, file)));

        for (const file of files) {
            const alpha = readRgbaPngAlpha(file);
            expect(alpha.minimum, `${file} needs transparent pixels`).toBe(0);
            expect(alpha.maximum, `${file} needs visible pixels`).toBe(255);
            expect(alpha.corners, `${file} needs a clear no-background perimeter`).toEqual([0, 0, 0, 0]);
        }
    });

    it('preserves corrected briefs and separates Xingyu\'s rejected reference from approved listening art', () => {
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.peter.likenessBrief).toBe('About 26, with lighter remaining hair.');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.felix.likenessBrief)
            .toBe('White, glasses, longer curly dark-blond to light-brown hair; likes cats.');
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.xingyu).toMatchObject({
            referencePolicy: 'owner-rejected-old-image-do-not-reference',
        });
        expect(ACADEMY_SPRITE_PERFORMANCE_CONTRACT.xingyu.poses[1].expressions['encouraging-listening'])
            .toMatchObject({
                status: 'approved',
                assetPath: '/academy/art/characters/xingyu/xingyu__listening-halfbody-v2__v001.png',
                approvedAssetId: 'character.xingyu.listening',
            });
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

function readRgbaPngAlpha(file: string): Readonly<{ minimum: number; maximum: number; corners: readonly number[] }> {
    const png = fs.readFileSync(file);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    let offset = 8;
    let width = 0;
    let height = 0;
    const data: Buffer[] = [];
    while (offset < png.length) {
        const length = png.readUInt32BE(offset);
        const type = png.subarray(offset + 4, offset + 8).toString('ascii');
        const chunk = png.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = chunk.readUInt32BE(0);
            height = chunk.readUInt32BE(4);
            expect(chunk[8], `${file} must use 8-bit channels`).toBe(8);
            expect(chunk[9], `${file} must use RGBA pixels`).toBe(6);
        } else if (type === 'IDAT') data.push(chunk);
        offset += length + 12;
    }
    const bytesPerPixel = 4;
    const stride = width * bytesPerPixel;
    const inflated = inflateSync(Buffer.concat(data));
    const alpha = new Uint8Array(width * height);
    let input = 0;
    let previous = Buffer.alloc(stride);
    for (let y = 0; y < height; y += 1) {
        const filter = inflated[input++];
        const row = Buffer.from(inflated.subarray(input, input + stride));
        input += stride;
        for (let x = 0; x < stride; x += 1) {
            const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
            const up = previous[x] ?? 0;
            const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] ?? 0 : 0;
            if (filter === 1) row[x] = (row[x] + left) & 0xff;
            else if (filter === 2) row[x] = (row[x] + up) & 0xff;
            else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 0xff;
            else if (filter === 4) row[x] = (row[x] + paeth(left, up, upperLeft)) & 0xff;
            else if (filter !== 0) throw new TypeError(`Unsupported PNG filter ${filter} in ${file}.`);
        }
        for (let x = 0; x < width; x += 1) alpha[y * width + x] = row[x * bytesPerPixel + 3];
        previous = row;
    }
    let minimum = 255;
    let maximum = 0;
    for (const value of alpha) {
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
    }
    return {
        minimum,
        maximum,
        corners: [alpha[0], alpha[width - 1], alpha[(height - 1) * width], alpha[alpha.length - 1]],
    };
}

function paeth(left: number, up: number, upperLeft: number): number {
    const estimate = left + up - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const upDistance = Math.abs(estimate - up);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    return leftDistance <= upDistance && leftDistance <= upperLeftDistance
        ? left
        : upDistance <= upperLeftDistance ? up : upperLeft;
}
