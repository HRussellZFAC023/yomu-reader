import { describe, expect, it } from 'vitest';

import { clearRenderedWordFurigana, replaceRenderedWordFurigana } from '../../src/reader/dom';
import { syncRubyEdgeOverhang } from '../../src/reader/dom/ruby-overhang';
import { renderRuby } from '../../src/reader/dom/token-text-rendering';
import type { JPDBToken } from '../../src/reader/app/types';

// A reading at least half a character wider than its kanji, with no reading
// beside it inside the word, is marked for overhang, along with the word edges
// it touches. dom/ruby-overhang.ts lets an edge reading overhang only while the
// word beside it carries no reading. Geometry in real engines:
// scripts/annotation-typography-smoke.mjs.
function token(surface: string, rubies: Array<[base: string, reading: string]>): JPDBToken {
    let offset = 0;
    const placed = rubies.map(([base, text]) => {
        const start = surface.indexOf(base, offset);
        offset = start + base.length;
        return { start, end: offset, length: base.length, text };
    });
    return {
        start: 0,
        end: surface.length,
        length: surface.length,
        rubies: placed,
        card: { spelling: surface, reading: '' },
    } as unknown as JPDBToken;
}

function rubyClasses(surface: string, rubies: Array<[string, string]>): string[] {
    const host = document.createElement('div');
    host.innerHTML = renderRuby(surface, token(surface, rubies));
    return Array.from(host.querySelectorAll('ruby'), ruby => ruby.className);
}

type WordSpec = string | [surface: string, rubies: Array<[string, string]>];

// A paragraph of page words, the way the scanner paints them: a plain word is
// its text, a word with a reading carries jpdb-reader-has-furi and its ruby.
function paragraph(...words: WordSpec[]): HTMLElement[] {
    const line = document.createElement('p');
    const spans = words.map(spec => {
        const span = document.createElement('span');
        span.className = 'jpdb-reader-word jpdb-reader-scan-word';
        if (typeof spec === 'string') {
            span.textContent = spec;
        } else {
            span.classList.add('jpdb-reader-has-furi');
            span.innerHTML = renderRuby(spec[0], token(spec[0], spec[1]));
        }
        line.append(span);
        return span;
    });
    document.body.replaceChildren(line);
    return spans;
}

function overhangs(word: HTMLElement): boolean[] {
    return Array.from(word.querySelectorAll('ruby'), ruby => ruby.classList.contains('jpdb-reader-ruby-edge-overhang'));
}

describe('ruby overhang markers', () => {
    it('marks a wide reading and the word edges it touches', () => {
        expect(rubyClasses('間', [['間', 'あいだ']])).toEqual(['jpdb-reader-ruby-overhang jpdb-reader-ruby-at-start jpdb-reader-ruby-at-end']);
        expect(rubyClasses('新しい', [['新', 'あたら']])).toEqual(['jpdb-reader-ruby-overhang jpdb-reader-ruby-at-start']);
        expect(rubyClasses('お頭', [['頭', 'あたま']])).toEqual(['jpdb-reader-ruby-overhang jpdb-reader-ruby-at-end']);
        expect(rubyClasses('お頭さん', [['頭', 'あたま']])).toEqual(['jpdb-reader-ruby-overhang']);
        expect(rubyClasses('学習', [['学習', 'がくしゅう']])).toEqual(['jpdb-reader-ruby-overhang jpdb-reader-ruby-at-start jpdb-reader-ruby-at-end']);
    });

    it('leaves a reading no wider than half a character past its kanji alone', () => {
        expect(rubyClasses('本', [['本', 'ほん']])).toEqual(['']);
        expect(rubyClasses('移住者', [['移住者', 'いじゅうしゃ']])).toEqual(['']);
    });

    it('never marks a reading that has another reading beside it in the word', () => {
        expect(rubyClasses('頭体', [['頭', 'あたま'], ['体', 'からだ']])).toEqual(['', '']);
        expect(rubyClasses('頭の体', [['頭', 'あたま'], ['体', 'からだ']])).toEqual([
            'jpdb-reader-ruby-overhang jpdb-reader-ruby-at-start',
            'jpdb-reader-ruby-overhang jpdb-reader-ruby-at-end',
        ]);
    });
});

describe('ruby edge overhang', () => {
    it('lets an edge reading overhang only plain words beside it', () => {
        const [, between, , study, , read] = paragraph('の', ['間', [['間', 'あいだ']]], 'で', ['学習', [['学習', 'がくしゅう']]], 'を', ['行う', [['行', 'おこな']]]);
        syncRubyEdgeOverhang(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(overhangs(between)).toEqual([true]);
        expect(overhangs(study)).toEqual([true]);
        // 行 opens 行う, so only its start faces a neighbour.
        expect(overhangs(read)).toEqual([true]);
    });

    it('keeps two readings side by side from meeting', () => {
        const [head, body] = paragraph(['頭', [['頭', 'あたま']]], ['体', [['体', 'からだ']]]);
        syncRubyEdgeOverhang([head, body]);
        expect(overhangs(head)).toEqual([false]);
        expect(overhangs(body)).toEqual([false]);
        // A word at the edge of its line has nothing known beside it.
        const [alone] = paragraph(['間', [['間', 'あいだ']]]);
        syncRubyEdgeOverhang([alone]);
        expect(overhangs(alone)).toEqual([false]);
    });

    it('re-decides the words beside a painted word', () => {
        const [before, between, after] = paragraph('の', ['間', [['間', 'あいだ']]], 'で');
        syncRubyEdgeOverhang([before, between, after]);
        expect(overhangs(between)).toEqual([true]);
        after.classList.add('jpdb-reader-has-furi');
        syncRubyEdgeOverhang([after]);
        expect(overhangs(between)).toEqual([false]);
    });

    it('follows a neighbour that gains or loses its reading late', () => {
        const [, between, after] = paragraph('の', ['間', [['間', 'あいだ']]], '手');
        syncRubyEdgeOverhang(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(overhangs(between)).toEqual([true]);
        expect(replaceRenderedWordFurigana(after, '手', token('手', [['手', 'て']]))).toBe(true);
        expect(overhangs(between)).toEqual([false]);
        clearRenderedWordFurigana(after, '手');
        expect(overhangs(between)).toEqual([true]);
    });
});
