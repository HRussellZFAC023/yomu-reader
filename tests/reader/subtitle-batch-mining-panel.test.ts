import { describe, expect, it } from 'vitest';
import type { JPDBCard } from '../../src/reader/app/types';
import {
    renderSubtitleBatchMiningPanel,
    type SubtitleBatchMiningPanelRenderState,
} from '../../src/reader/subtitles/subtitle-batch-mining-panel';
import type { SubtitleBatchMiningCandidate } from '../../src/reader/subtitles/subtitle-batch-mining';

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
