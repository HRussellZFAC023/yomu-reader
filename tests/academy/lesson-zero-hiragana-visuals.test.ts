import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLessonZeroHiraganaDefinition } from '../../src/academy/content/lesson-zero-hiragana';
import {
    getLessonZeroHiraganaVisualAnchor,
    LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS,
} from '../../src/academy/content/lesson-zero-hiragana-visuals';

function publicPath(imagePath: string): string {
    return path.join(process.cwd(), 'public', imagePath.replace(/^\/+/, ''));
}

describe('Lesson 0 hiragana visual anchors', () => {
    it('covers the canonical 46 items once and in canonical order', () => {
        const definition = createLessonZeroHiraganaDefinition();
        expect(LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS).toHaveLength(46);
        expect(LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS.map(candidate => candidate.itemId))
            .toEqual(definition.items.map(candidate => candidate.id));
        expect(new Set(LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS.map(candidate => candidate.itemId)).size)
            .toBe(46);
        expect(new Set(LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS.map(candidate => candidate.kana)).size)
            .toBe(46);
    });

    it('uses the exact five Studio A anchor words', () => {
        expect(LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS.slice(0, 5).map(candidate => candidate.reading))
            .toEqual(['あさ', 'いぬ', 'うみ', 'えほん', 'おちゃ']);
    });

    it('uses real word-initial anchors except for the honest を and ん cases', () => {
        for (const candidate of LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS) {
            if (candidate.kind === 'word-start') {
                expect(candidate.reading.startsWith(candidate.kana), candidate.itemId).toBe(true);
                expect(candidate.noteEn, candidate.itemId).toBeUndefined();
                continue;
            }

            expect(candidate.noteEn?.trim().length, candidate.itemId).toBeGreaterThan(20);
        }

        expect(getLessonZeroHiraganaVisualAnchor('hira-wo').kind).toBe('object-particle');
        expect(getLessonZeroHiraganaVisualAnchor('hira-n').kind).toBe('word-internal');
    });

    it('points every anchor at a local, nonempty WebP image with useful alt text', () => {
        for (const candidate of LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS) {
            expect(candidate.imagePath, candidate.itemId).toMatch(
                /^\/academy\/art\/lesson-zero\/hiragana-anchors\/hira-[a-z]+\.webp$/,
            );
            expect(candidate.imagePath, candidate.itemId).not.toMatch(/^https?:\/\//);
            expect(candidate.imageAlt.trim().length, candidate.itemId).toBeGreaterThan(12);
            expect(candidate.meaningEn.trim().length, candidate.itemId).toBeGreaterThan(0);
            expect(candidate.pronunciation.trim().length, candidate.itemId).toBeGreaterThan(0);

            const bytes = fs.readFileSync(publicPath(candidate.imagePath));
            expect(bytes.length, candidate.itemId).toBeGreaterThan(1_000);
            expect(bytes.subarray(0, 4).toString('ascii'), candidate.itemId).toBe('RIFF');
            expect(bytes.subarray(8, 12).toString('ascii'), candidate.itemId).toBe('WEBP');
        }
    });

    it('keeps the production directory and typed inventory in exact lockstep', () => {
        const directory = path.dirname(publicPath(LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS[0]!.imagePath));
        const files = fs.readdirSync(directory)
            .filter(file => file.endsWith('.webp'))
            .sort();
        const registered = LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS
            .map(candidate => path.basename(candidate.imagePath))
            .sort();

        expect(files).toEqual(registered);

        const hostedDirectory = path.join(
            process.cwd(),
            'docs/public',
            path.dirname(LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS[0]!.imagePath).replace(/^\/+/, ''),
        );
        const hostedFiles = fs.readdirSync(hostedDirectory)
            .filter(file => file.endsWith('.webp'))
            .sort();
        expect(hostedFiles).toEqual(registered);
    });

    it('rejects an unknown item instead of silently showing the wrong picture', () => {
        expect(() => getLessonZeroHiraganaVisualAnchor('hira-missing'))
            .toThrow('Missing Lesson 0 hiragana visual anchor: hira-missing');
    });
});
