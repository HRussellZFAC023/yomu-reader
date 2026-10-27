import { describe, expect, it } from 'vitest';
import type { JPDBCard } from '../../src/reader/app/types';
import {
    renderSubtitleBatchMiningPanel,
    type SubtitleBatchMiningPanelRenderState,
} from '../../src/reader/subtitles/subtitle-batch-mining-panel';
import type { SubtitleBatchMiningCandidate } from '../../src/reader/subtitles/subtitle-batch-mining';
import { buildSubtitleBatchMiningCandidates, subtitleBatchMiningSummary, subtitleBatchMiningTsv, type SubtitleBatchMiningRow } from "../../src/reader/subtitles/subtitle-batch-mining";
import type { CardState, JPDBToken } from "../../src/reader/app/types";

describe('subtitle batch mining panel', () => {
    it('keeps the idle toolbar focused on the next useful action', () => {
        const host = renderPanel(baseState());

        expect(toolbarActions(host)).toEqual(['bm-scan']);
        expect(host.querySelector('.jpdb-subtitle-batch-toolbar')?.getAttribute('role')).toBe('toolbar');
        expect(host.querySelector('.jpdb-subtitle-batch-toolbar')?.getAttribute('aria-label')).toBe('Batch mining actions');
        expect(host.querySelector('.jpdb-subtitle-batch-sticky > .jpdb-subtitle-drawer-head')).not.toBeNull();
        expect(host.querySelector('.jpdb-subtitle-batch-sticky > .jpdb-subtitle-batch-toolbar')).not.toBeNull();
        expect(host.querySelector('.jpdb-subtitle-panel-mode')?.getAttribute('role')).toBe('group');
        expect(host.querySelector('.jpdb-subtitle-panel-options-menu')?.getAttribute('role')).toBe('group');
        expect(host.querySelector('[data-action="panel-options"]')?.getAttribute('aria-haspopup')).toBe('true');
        expect(host.querySelector('.jpdb-subtitle-batch-actions-help')).toBeNull();
    });

    it('shows review actions only after scan candidates exist', () => {
        const candidate = batchCandidate('本', 'ほん');
        const host = renderPanel(baseState({
            status: 'ready',
            candidates: [candidate],
            selectedKeys: new Set([candidate.key]),
            summary: {
                rows: 4,
                parsedRows: 4,
                candidates: 1,
                iPlusOne: 1,
                selected: 1,
            },
        }));

        expect(toolbarActions(host)).toEqual(['bm-scan', 'bm-add', 'bm-copy', 'bm-all', 'bm-clear']);
        expect(host.querySelector<HTMLButtonElement>('[data-action="bm-add"]')?.disabled).toBe(false);
        expect(host.querySelector<HTMLButtonElement>('[data-action="bm-all"]')?.disabled).toBe(true);
        expect(host.querySelector('[role="list"]')).not.toBeNull();
        expect(host.querySelectorAll('[role="listitem"]')).toHaveLength(1);
        expect(host.querySelector('.jpdb-subtitle-batch-check')?.getAttribute('aria-label')).toBe('Deselect word: 本');
        expect(host.querySelector('.jpdb-subtitle-batch-actions-help')?.textContent).toContain('Add selected saves words.');
    });

    it('explains collection and review separately in Japanese', () => {
        const host = renderPanel(baseState({ status: 'ready', language: 'ja', candidates: [batchCandidate('本', 'ほん')] }));
        expect(host.querySelector('.jpdb-subtitle-batch-actions-help')?.textContent)
            .toBe('「選択を追加」は単語を保存し、評価ボタンは復習結果を記録します。');
    });

    it('marks mined TARGET words and sentences with their real direction', () => {
        const candidate = batchCandidate('كتاب', 'كتاب');
        const host = renderPanel(baseState({
            status: 'ready',
            candidates: [candidate],
            targetContent: { lang: 'ar', dir: 'rtl' },
        }));

        for (const selector of ['.jpdb-subtitle-batch-expression', '.jpdb-subtitle-batch-sentence']) {
            expect(host.querySelector(selector)).toMatchObject({ lang: 'ar', dir: 'rtl' });
        }
    });

    it('keeps reselection simple after every candidate has been cleared', () => {
        const host = renderPanel(baseState({
            status: 'ready',
            candidates: [batchCandidate('読む', 'よむ')],
            selectedKeys: new Set(),
            summary: {
                rows: 3,
                parsedRows: 3,
                candidates: 1,
                iPlusOne: 1,
                selected: 0,
            },
        }));

        expect(toolbarActions(host)).toEqual(['bm-scan', 'bm-add', 'bm-copy', 'bm-all']);
        expect(host.querySelector<HTMLButtonElement>('[data-action="bm-add"]')?.disabled).toBe(true);
        expect(host.querySelector<HTMLButtonElement>('[data-action="bm-copy"]')?.disabled).toBe(true);
        expect(host.querySelector<HTMLButtonElement>('[data-action="bm-all"]')?.disabled).toBe(false);
        expect(host.querySelector('[data-action="bm-clear"]')).toBeNull();
    });

    it('renders immediate and selected-batch grade controls from the active review scale', () => {
        const candidate = batchCandidate('去年', 'きょねん');
        const host = renderPanel(baseState({
            status: 'ready',
            candidates: [candidate],
            selectedKeys: new Set([candidate.key]),
            candidatePlans: new Map([[candidate.key, { token: Symbol(), grades: [['fail', 'Fail'], ['pass', 'Pass']], canCollect: true, noDestination: false, uncertain: false, unmatched: false }]]),
            reviewGrades: [
                { grade: 'fail', label: 'Fail' },
                { grade: 'pass', label: 'Pass' },
            ],
            summary: {
                rows: 3,
                parsedRows: 3,
                candidates: 1,
                iPlusOne: 1,
                selected: 1,
            },
        }));

        expect(host.querySelector('.jpdb-subtitle-batch-grade-selected')?.getAttribute('aria-label')).toBe('Grade selected');
        expect(toolbarGradeActions(host)).toEqual(['fail', 'pass']);
        expect(host.querySelector<HTMLButtonElement>('.jpdb-subtitle-batch-grade-selected [data-grade="pass"]')?.disabled).toBe(false);
        expect(host.querySelector('[role="listitem"] .jpdb-subtitle-batch-row-grades')?.getAttribute('aria-label')).toBe('Grade word: 去年');
        expect(host.querySelector<HTMLButtonElement>('[role="listitem"] [data-action="bm-grade"][data-grade="pass"]')?.getAttribute('aria-label')).toBe('Pass: Grade word: 去年');
    });
});

function renderPanel(state: SubtitleBatchMiningPanelRenderState): HTMLElement {
    const host = document.createElement('section');
    host.innerHTML = renderSubtitleBatchMiningPanel(state);
    return host;
}

function toolbarActions(host: ParentNode): string[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>('.jpdb-subtitle-batch-toolbar button'))
        .map(button => button.dataset.action ?? '');
}

function toolbarGradeActions(host: ParentNode): string[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>('.jpdb-subtitle-batch-grade-selected button'))
        .map(button => button.dataset.grade ?? '');
}

function baseState(overrides: Partial<SubtitleBatchMiningPanelRenderState> = {}): SubtitleBatchMiningPanelRenderState {
    return {
        status: 'idle',
        candidates: [],
        selectedKeys: new Set(),
        reviewGrades: [],
        summary: {
            rows: 136,
            parsedRows: 0,
            candidates: 0,
            iPlusOne: 0,
            selected: 0,
        },
        hasTranscriptSurface: true,
        pausePanelEnabled: false,
        placement: 'right',
        optionsMenuOpen: false,
        language: 'en',
        targetContent: { lang: 'ja', dir: 'ltr' },
        ...overrides,
    };
}

function batchCandidate(spelling: string, reading: string): SubtitleBatchMiningCandidate {
    const card: JPDBCard = {
        vid: 1,
        sid: 1,
        rid: 1,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
    };
    return {
        key: `${spelling}:${reading}`,
        card,
        sentence: `${spelling}を勉強します。`,
        rowIndex: 0,
        cueIndex: 0,
        start: 1.5,
        end: 3,
        occurrences: 1,
        sentenceCardCount: 3,
        unknownCardCount: 1,
        iPlusOne: true,
        selected: true,
        state: 'not-in-deck',
    };
}

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
});
