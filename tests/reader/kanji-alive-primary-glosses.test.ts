import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface KanjiAlivePrimaryGlosses {
    _meta: {
        source: string;
        sourceCommit: string;
        license: string;
        licenseUrl: string;
        attribution: string;
        field: string;
    };
    meanings: Record<string, string>;
}

describe('Kanji Alive primary gloss asset', () => {
    it('keeps the compact hosted extract attributed and pinned to the official CC BY source', () => {
        const payload = JSON.parse(readFileSync('docs/public/data/kanji-alive-primary-glosses.json', 'utf8')) as KanjiAlivePrimaryGlosses;
        expect(payload._meta).toMatchObject({
            license: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            attribution: 'Kanji Alive',
            field: 'Primary comma-delimited gloss from kmeaning',
        });
        expect(payload._meta.source).toBe(`https://raw.githubusercontent.com/kanjialive/kanji-data-media/${payload._meta.sourceCommit}/language-data/ka_data.csv`);
        expect(Object.keys(payload.meanings).length).toBeGreaterThanOrEqual(1_200);
        expect(payload.meanings).toMatchObject({ 読: 'read', 生: 'life', 森: 'forest', 水: 'water', 葉: 'leaf', 尺: 'shaku (unit of length, about 30 cm)' });
        expect(Object.values(payload.meanings).every(meaning => balancedParentheses(meaning))).toBe(true);
        expect(payload.meanings['貼']).toBeUndefined();
    });
});

function balancedParentheses(value: string): boolean {
    let depth = 0;
    for (const character of value) {
        if (character === '(') depth += 1;
        else if (character === ')') depth -= 1;
        if (depth < 0) return false;
    }
    return depth === 0;
}
