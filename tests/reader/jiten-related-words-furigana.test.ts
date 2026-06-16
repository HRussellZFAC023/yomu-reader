import { describe, expect, it } from 'vitest';
import { renderJitenDefinitionSource } from '../../src/reader/jiten/jiten-definition-source-render';
import type { JPDBCard } from '../../src/reader/app/types';
import type { JitenVocabularyInfo, JitenVocabularyWordSummary } from '../../src/reader/dictionaries/jiten';

const card = {
    vid: 1456130, sid: 0, rid: 0, spelling: '読み', reading: 'よみ', frequencyRank: 1,
    partOfSpeech: [], meanings: [{ glosses: ['reading'], partOfSpeech: [] }], cardState: ['not-in-deck'],
    pitchAccent: [], wordWithReading: null, source: 'jiten', reviewSource: 'jiten-api',
    jitenWordId: 1456130, jitenReadingIndex: 0,
} as unknown as JPDBCard;

function summary(reading: string, readingFurigana: string, surface: string): JitenVocabularyWordSummary {
    return { wordId: 1, readingIndex: 0, reading, readingFurigana, mainDefinition: 'x', frequencyRank: 1, matchSurface: surface };
}

function infoWith(usedIn: JitenVocabularyWordSummary[]): JitenVocabularyInfo {
    return {
        wordId: 1456130, mainReading: null, alternativeReadings: [], partsOfSpeech: [], definitions: [],
        pitchAccents: [], knownStates: [], composedOf: [], usedIn, usedInTotal: usedIn.length, examples: [],
    } as unknown as JitenVocabularyInfo;
}

function relatedHeads(html: string): HTMLElement[] {
    document.body.innerHTML = html;
    return [...document.querySelectorAll<HTMLElement>('.jpdb-reader-jiten-related-head')];
}

describe('Jiten related-words furigana', () => {
    it('distributes ruby per kanji and keeps okurigana as base text', () => {
        // 読み取る (よみとる): よ over 読, と over 取; み and る stay as base kana.
        const [head] = relatedHeads(renderJitenDefinitionSource(card, () => '', infoWith([
            summary('よみとる', '読[よ]み取[と]る', '読み取る'),
        ]), 'en'));
        const rts = [...head!.querySelectorAll('rt')].map(rt => rt.textContent);
        const bases = [...head!.querySelectorAll('.jpdb-reader-ruby-base')].map(b => b.textContent);
        expect(rts).toEqual(['よ', 'と']);
        expect(bases).toEqual(['読', '取']);
        // The whole compound reading must NOT sit over the whole word.
        expect(rts).not.toContain('よみとる');
        expect(head!.textContent?.replace(/\s+/g, '')).toContain('読(よ)み取(と)る');
    });

    it('handles a leading-okurigana compound (立ち読み)', () => {
        const [head] = relatedHeads(renderJitenDefinitionSource(card, () => '', infoWith([
            summary('たちよみ', '立[た]ち読[よ]み', '立ち読み'),
        ]), 'en'));
        expect([...head!.querySelectorAll('rt')].map(rt => rt.textContent)).toEqual(['た', 'よ']);
        expect([...head!.querySelectorAll('.jpdb-reader-ruby-base')].map(b => b.textContent)).toEqual(['立', '読']);
    });
});
