import { describe, expect, it } from 'vitest';

import {
    buildSubtitleBatchMiningCandidates,
    subtitleBatchMiningSummary,
    subtitleBatchMiningTsv,
    type SubtitleBatchMiningRow,
} from '../../src/reader/subtitles/subtitle-batch-mining';
import type { CardState, JPDBCard, JPDBToken } from '../../src/reader/app/types';

describe('subtitle batch mining', () => {
    it('ranks i+1 unknown words first and selects them by default', () => {
        const known = card('映画', 'えいが', ['known'], 1000);
        const due = card('見る', 'みる', ['due'], 300);
        const target = card('退屈', 'たいくつ', ['not-in-deck'], 2200);
        const noisy = card('難解', 'なんかい', ['not-in-deck'], 1500);

        const candidates = buildSubtitleBatchMiningCandidates([
            row(0, '映画を見る。', [known, due]),
            row(1, '映画を見ると退屈だ。', [known, due, particle('と'), target]),
            row(2, '難解な退屈話。', [noisy, target]),
        ]);

        expect(candidates.map(candidate => candidate.card.spelling)).toEqual(['退屈', '難解']);
        expect(candidates[0]?.iPlusOne).toBe(true);
        expect(candidates[0]?.selected).toBe(true);
        expect(candidates[0]?.occurrences).toBe(2);
        expect(subtitleBatchMiningSummary([], candidates)).toMatchObject({ candidates: 2, iPlusOne: 1, selected: 1 });
    });

    it('dedupes repeated words and keeps the best context sentence', () => {
        const town = card('街', 'まち', ['known'], 600);
        const walk = card('歩く', 'あるく', ['known'], 700);
        const alley = card('路地', 'ろじ', ['not-in-deck'], 2400);
        const fog = card('霧', 'きり', ['not-in-deck'], 1900);

        const candidates = buildSubtitleBatchMiningCandidates([
            row(0, '路地だ。', [alley]),
            row(1, '街の路地を歩く。', [town, particle('の'), alley, particle('を'), walk]),
            row(2, '霧の路地。', [fog, particle('の'), alley]),
        ]);

        const alleyCandidate = candidates.find(candidate => candidate.card.spelling === '路地');
        expect(alleyCandidate?.sentence).toBe('街の路地を歩く。');
        expect(alleyCandidate?.iPlusOne).toBe(true);
        expect(alleyCandidate?.occurrences).toBe(3);
    });

    it('filters particles and blocked vocabulary states', () => {
        const known = card('本', 'ほん', ['known'], 500);
        const blacklisted = card('苦手', 'にがて', ['blacklisted'], 3000);
        const redundant = card('今日', 'きょう', ['redundant'], 80);

        const candidates = buildSubtitleBatchMiningCandidates([
            row(0, '本は苦手だ。', [known, particle('は'), blacklisted]),
            row(1, '今日の本。', [redundant, particle('の'), known]),
        ]);

        expect(candidates).toEqual([]);
    });

    it('exports selected candidates as TSV', () => {
        const target = card('退屈', 'たいくつ', ['not-in-deck'], 2200);
        const [candidate] = buildSubtitleBatchMiningCandidates([
            row(0, '映画を見ると退屈だ。', [card('映画', 'えいが', ['known'], 1000), card('見る', 'みる', ['known'], 300), particle('と'), target]),
        ]);

        expect(subtitleBatchMiningTsv([candidate!])).toContain('退屈\tたいくつ\tnot-in-deck\t1\t映画を見ると退屈だ。');
    });
});

function row(rowIndex: number, text: string, cards: JPDBCard[]): SubtitleBatchMiningRow {
    return {
        rowIndex,
        cueIndex: rowIndex,
        start: rowIndex * 2,
        end: rowIndex * 2 + 1.5,
        text,
        tokens: cards.map((card, index): JPDBToken => ({
            card,
            start: index,
            end: index + card.spelling.length,
            length: card.spelling.length,
            rubies: [],
            pitchClass: 'unknown',
            sentence: text,
        })),
    };
}

function particle(spelling: string): JPDBCard {
    return card(spelling, spelling, ['known'], null, ['prt']);
}

function card(
    spelling: string,
    reading: string,
    cardState: CardState[],
    frequencyRank: number | null,
    partOfSpeech: string[] = [],
): JPDBCard {
    const id = stableId(`${spelling}:${reading}`);
    return {
        vid: id,
        sid: id,
        rid: 0,
        spelling,
        reading,
        frequencyRank,
        partOfSpeech,
        meanings: [],
        cardState,
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
    };
}

function stableId(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = ((hash * 31) + value.charCodeAt(index)) >>> 0;
    return hash || 1;
}
