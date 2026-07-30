import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ACADEMY_ASSETS } from '../../src/academy/assets';

const UPGRADE_GALLERIES = {
    rie: ACADEMY_ASSETS.characterSpriteGalleries.rie,
    tom2: ACADEMY_ASSETS.characterSpriteGalleries.tom2,
    steve: ACADEMY_ASSETS.characterSpriteGalleries.steve,
} as const;
const UPGRADE_PATHS = Object.values(UPGRADE_GALLERIES).flatMap(gallery => Object.values(gallery));

describe('Academy living-paper character upgrade', () => {
    it('ships unique transparent, portrait-scale performances for each upgraded character', async () => {
        expect(new Set(UPGRADE_PATHS).size).toBe(UPGRADE_PATHS.length);
        for (const assetPath of UPGRADE_PATHS) {
            expect(assetPath.endsWith('.webp'), assetPath).toBe(true);
            const metadata = await sharp(path.resolve('public', assetPath.slice(1))).metadata();
            expect(metadata.format, assetPath).toBe('webp');
            expect(metadata.width, assetPath).toBe(1536);
            expect(metadata.height, assetPath).toBe(2048);
            expect(metadata.hasAlpha, `${assetPath} must carry an alpha channel`).toBe(true);
        }
    });

    it('keeps all three angles visible with contained responsive framing', () => {
        const css = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        expect(css).toMatch(/\.academy-character-sprite-gallery\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
        expect(css).toMatch(/\.academy-character-sprite-gallery-image\s*\{[^}]*height:\s*100%[^}]*max-height:\s*none[^}]*object-fit:\s*contain[^}]*object-position:\s*center bottom/s);
        expect(css).toMatch(/\.academy-character-sprite-gallery-frame\s*\{[^}]*height:\s*clamp\(230px,\s*34vw,\s*330px\)[^}]*max-height:\s*42dvh[^}]*overflow:\s*hidden/s);
        expect(css).toMatch(/\.academy-character-dossier-gallery \.academy-character-sprite-gallery-frame\s*\{[^}]*height:\s*clamp\(190px,\s*42vw,\s*260px\)[^}]*max-height:\s*34dvh/s);
        expect(css).toMatch(/\.academy-character-dossier-gallery \.academy-character-sprite-gallery-frame\s*\{[^}]*height:\s*clamp\(150px,\s*48vw,\s*190px\)/s);
    });

    it('uses distinct left, front, and right character-book slots', () => {
        for (const [character, gallery] of Object.entries(UPGRADE_GALLERIES)) {
            const slots = Object.keys(gallery);
            expect(slots.length, character).toBeGreaterThanOrEqual(3);
            expect(slots.some(slot => slot.endsWith(':left-three-quarter')), character).toBe(true);
            expect(slots.some(slot => slot.endsWith(':front-near-front')), character).toBe(true);
            expect(slots.some(slot => slot.endsWith(':right-three-quarter')), character).toBe(true);
        }
    });
});
