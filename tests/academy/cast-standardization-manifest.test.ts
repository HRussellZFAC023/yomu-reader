import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
    ACADEMY_ASSETS,
    ACADEMY_CAST_SPRITE_COVERAGE,
    ACADEMY_RUNTIME_ASSET_REGISTRY,
} from '../../src/academy/assets';
import { ACADEMY_CAST } from '../../src/academy/domain/cast-registry';
import {
    ACADEMY_CAST_STANDARDIZATION_GALLERIES,
    ACADEMY_CAST_STANDARDIZATION_JOURNAL_REVIEW,
    ACADEMY_CAST_STANDARDIZATION_MANIFEST,
    ACADEMY_CAST_STANDARDIZATION_REJECTED,
    ACADEMY_CAST_STANDARDIZATION_SUMMARY,
} from '../../src/academy/domain/cast-standardization-manifest';

describe('Academy cast standardization manifest', () => {
    it('leaves zero production cast orphans across files, manifest, registry, and consumers', () => {
        const physical = productionCastPaths();
        const manifest = ACADEMY_CAST_STANDARDIZATION_MANIFEST.map(slot => slot.assetPath).sort();
        const runtime = runtimeCastPaths().sort();
        const coverage = Object.keys(ACADEMY_CAST_SPRITE_COVERAGE)
            .flatMap(id => Object.values(ACADEMY_RUNTIME_ASSET_REGISTRY[id as keyof typeof ACADEMY_RUNTIME_ASSET_REGISTRY].files))
            .sort();

        expect(ACADEMY_CAST_STANDARDIZATION_SUMMARY.orphanCount).toBe(0);
        expect(manifest).toEqual(physical);
        expect(runtime).toEqual(physical);
        expect(coverage).toEqual(physical);
        expect(new Set(physical).size).toBe(physical.length);
        expect(ACADEMY_CAST_STANDARDIZATION_SUMMARY.productionSpriteFiles).toBe(physical.length);
        expect(ACADEMY_CAST_STANDARDIZATION_SUMMARY.manifestSlots).toBe(physical.length);
        expect(ACADEMY_CAST_STANDARDIZATION_SUMMARY.runtimeAssetMappings).toBe(physical.length);

        const manifestPaths = new Set<string>(manifest);
        for (const assetPath of collectAcademyArtPaths(ACADEMY_CAST_STANDARDIZATION_JOURNAL_REVIEW)) {
            expect(manifestPaths.has(assetPath), `journal preview is not manifest-bound: ${assetPath}`).toBe(true);
        }
        for (const assetPath of collectAcademyArtPaths(ACADEMY_CAST_STANDARDIZATION_GALLERIES)) {
            expect(manifestPaths.has(assetPath), `gallery sprite is not manifest-bound: ${assetPath}`).toBe(true);
        }
        for (const assetPath of collectAcademyArtPaths(ACADEMY_ASSETS.characters.journalReview)) {
            expect(manifestPaths.has(assetPath), `runtime journal sprite is not manifest-bound: ${assetPath}`).toBe(true);
        }
    });

    it('covers every canonical cast member with neutral and listening art', () => {
        expect(ACADEMY_CAST_STANDARDIZATION_SUMMARY.canonicalCast).toBe(ACADEMY_CAST.length);
        expect(ACADEMY_CAST_STANDARDIZATION_SUMMARY.castWithNeutral).toBe(ACADEMY_CAST.length);
        expect(ACADEMY_CAST_STANDARDIZATION_SUMMARY.castWithListening).toBe(ACADEMY_CAST.length);

        for (const member of ACADEMY_CAST) {
            const slots = ACADEMY_CAST_STANDARDIZATION_MANIFEST.filter(slot => slot.castId === member.id);
            expect(slots.some(slot => slot.expression === 'neutral'), `${member.id} lacks neutral`).toBe(true);
            expect(slots.some(slot => slot.expression === 'encouraging-listening'), `${member.id} lacks listening`).toBe(true);
            expect(ACADEMY_CAST_STANDARDIZATION_JOURNAL_REVIEW).toHaveProperty(member.id);
            expect(ACADEMY_CAST_STANDARDIZATION_GALLERIES).toHaveProperty(member.id);
        }
    });

    it('keeps every QA-passed production file local, mirrored, hashed, and transparent', () => {
        for (const slot of ACADEMY_CAST_STANDARDIZATION_MANIFEST) {
            expect(slot.qa).toMatchObject({ verdict: 'pass', inspected: true });
            expect(slot.assetPath).toMatch(/^\/academy\/art\/characters\/.+\.png$/u);
            expect(slot.assetPath).not.toMatch(/^https?:/u);
            const publicFile = path.resolve('public', slot.assetPath.slice(1));
            const docsFile = path.resolve('docs/public', slot.assetPath.slice(1));
            expect(fs.existsSync(publicFile), slot.assetPath).toBe(true);
            expect(fs.existsSync(docsFile), slot.assetPath).toBe(true);
            expect(fs.readFileSync(docsFile).equals(fs.readFileSync(publicFile)), slot.assetPath).toBe(true);
            expect(sha256File(publicFile), slot.assetPath).toBe(slot.sha256);
            expect(pngInfo(publicFile), slot.assetPath).toMatchObject({
                width: slot.qa.dimensions.width,
                height: slot.qa.dimensions.height,
                colorType: 6,
            });
        }
    });

    it('keeps rejected and superseded sprite candidates outside production', () => {
        expect(ACADEMY_CAST_STANDARDIZATION_REJECTED).toHaveLength(ACADEMY_CAST_STANDARDIZATION_SUMMARY.rejectedPreQa);
        for (const rejected of ACADEMY_CAST_STANDARDIZATION_REJECTED) {
            expect(rejected.retainedOutsideProduction).toBe(true);
            expect(rejected.path).toMatch(/^artifacts\/yomu-academy\/cast-standardization\/rejected\//u);
            expect(rejected.path).not.toContain('/public/academy/art/characters/');
            const file = path.resolve(rejected.path);
            expect(fs.existsSync(file), rejected.path).toBe(true);
            expect(sha256File(file), rejected.path).toBe(rejected.sha256);
        }
    });
});

function productionCastPaths(): string[] {
    return fs.readdirSync(path.resolve('public/academy/art/characters'), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .flatMap(entry => fs.readdirSync(path.resolve('public/academy/art/characters', entry.name))
            .filter(file => file.endsWith('.png'))
            .map(file => `/academy/art/characters/${entry.name}/${file}`))
        .sort();
}

function runtimeCastPaths(): string[] {
    return Object.values(ACADEMY_RUNTIME_ASSET_REGISTRY)
        .filter(asset => asset.kind === 'character-sprite')
        .flatMap(asset => Object.values(asset.files));
}

function collectAcademyArtPaths(value: unknown): string[] {
    if (typeof value === 'string') return value.startsWith('/academy/art/') ? [value] : [];
    if (!value || typeof value !== 'object') return [];
    return Object.values(value).flatMap(collectAcademyArtPaths);
}

function sha256File(file: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function pngInfo(file: string): Readonly<{ width: number; height: number; colorType: number }> {
    const source = fs.readFileSync(file);
    expect(source.subarray(0, 8).toString('hex'), file).toBe('89504e470d0a1a0a');
    return {
        width: source.readUInt32BE(16),
        height: source.readUInt32BE(20),
        colorType: source[25],
    };
}
