import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setInnerHtml } from '../../src/reader/dom';
import { bindPrivateCommandCapability } from '../../src/reader/dom/private-command-capabilities';
import { mountDeckSelects } from '../../src/reader/study/mining-controls';
import { allowSyntheticReaderInteractionsForTests, dispatchAuthorizedReaderControlEvent } from '../../src/reader/ui/trusted-interaction';
import { createYomuLocalSrsAdapter, LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import { AnkiConnectClient } from '../../src/reader/anki/client';
import { JpdbClient } from '../../src/reader/jpdb/jpdb';
import { JitenApiClient } from '../../src/reader/dictionaries/jiten';
import type { DeckChoice } from '../../src/reader/cards/deck-choice';
import type { DeckChoiceMembership, DeckPickerMembership } from '../../src/reader/cards/deck-choice-membership';
import { DEFAULT_SETTINGS, card, testCardActionController, type JPDBCard } from './jpdb/fixtures';

const LOCAL: DeckChoice = { source: 'yomu-local', id: 'yomu-local', label: 'よむ deck' };
let privateRoot: ShadowRoot;
beforeEach(() => {
    const attach = Element.prototype.attachShadow;
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init) {
        privateRoot = Reflect.apply(attach, this, [init]);
        return privateRoot;
    });
});
afterEach(() => { document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });

function mount(choices: readonly DeckChoice[], membership: DeckPickerMembership, save: () => Promise<void> = async () => undefined, word: JPDBCard = card) {
    setInnerHtml(document.body, '<div class="jpdb-reader-deck-select">Add to deck…</div><button>Next</button>');
    const host = document.querySelector<HTMLElement>('.jpdb-reader-deck-select')!;
    bindPrivateCommandCapability(host, { kind: 'card-ui', action: 'deck-picker', choices });
    mountDeckSelects(document.body, word, '新しい例文。', save, membership);
    return { host, select: privateRoot.querySelector('select')!, root: privateRoot };
}
function open(select: HTMLSelectElement) {
    select.focus();
    dispatchAuthorizedReaderControlEvent(select, new KeyboardEvent('keydown', { key: 'ArrowDown' }));
}
async function settle() { await new Promise(resolve => setTimeout(resolve)); }

describe('private deck picker membership', () => {
    it('reads the real local deck on opening, saves new and existing words, and reads persistence after remount', async () => {
        const adapter = createYomuLocalSrsAdapter(new LocalYomuSrsRepository());
        const controller = testCardActionController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, yomuLocalSrsEnabled: true }),
            srsAdapters: { 'yomu-local': adapter },
        });
        const load = vi.fn((word, choices) => controller.loadDeckMembership(word, choices));
        let sentence = '最初の例文。';
        const save = vi.fn(async () => { await adapter.mine({ expression: card.spelling, reading: card.reading, sentence }); });
        let picker = mount([LOCAL], { language: 'en', load }, save);
        expect(load).not.toHaveBeenCalled();
        expect(picker.root.querySelector('[role="status"]')?.hasAttribute('hidden')).toBe(true);
        open(picker.select);
        expect(picker.select.options[1].text).toContain('Checking');
        await settle();
        expect(picker.select.options[1].text).toBe('よむ deck — Not saved in this deck');
        expect(picker.root.querySelector('li')?.textContent).toContain('Not saved in this deck');
        picker.select.selectedIndex = 1;
        dispatchAuthorizedReaderControlEvent(picker.select, new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
        await settle();
        expect(picker.select.options[1].text).toBe('よむ deck — Saved in this deck');
        sentence = '更新した例文。';
        picker.select.selectedIndex = 1;
        dispatchAuthorizedReaderControlEvent(picker.select, new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
        await settle();
        // A saved destination remains selectable and passes the new sentence
        // through; the destination keeps its existing merge policy.
        expect(save).toHaveBeenCalledTimes(2);
        expect((await adapter.lookupCards!([{ expression: card.spelling, reading: card.reading }]))[0].sentence).toBe('最初の例文。');
        picker = mount([LOCAL], { language: 'en', load });
        open(picker.select);
        await settle();
        expect(picker.select.options[1].text).toContain('Saved in this deck');
        expect(picker.host.shadowRoot).toBeNull();
        expect(picker.host.outerHTML).toBe('<div class="jpdb-reader-deck-select" data-yomu-form-control-host=""></div>');
        expect(document.body.textContent).not.toMatch(/Saved|よむ deck|Checking/);
    });

    it('keeps per-destination status, errors and unsupported reasons private, with Japanese copy and selection intact', async () => {
        const choices: DeckChoice[] = [LOCAL, { source: 'anki', id: 'secret', label: 'Anki: Private Ω' }, { source: 'bunpro', id: 'bunpro', label: 'Bunpro' }];
        const picker = mount(choices, { language: 'ja', load: () => [
            Promise.resolve({ kind: 'saved' }), Promise.reject(new Error('private error')), Promise.resolve({ kind: 'unknown', reason: 'unsupported' }),
        ] });
        open(picker.select);
        picker.select.selectedIndex = 2;
        await settle();
        expect(picker.select.options[1].text).toContain('このデッキに保存済み');
        expect(picker.select.options[2].text).toContain('確認できませんでした');
        expect(picker.select.options[3].text).toContain('確認できません');
        expect(picker.select.selectedIndex).toBe(2);
        expect(privateRoot.activeElement).toBe(picker.select);
        expect(picker.select.getAttribute('aria-describedby')).toBe('membership-status');
        expect(privateRoot.textContent).not.toContain('未翻訳');
        expect(document.body.innerHTML).not.toMatch(/Private|secret|Bunpro|保存/);
    });

    it('ignores passive focus, synthetic openings, stale reopen results and results for a removed card', async () => {
        const pending: ((value: DeckChoiceMembership) => void)[] = [];
        const load = vi.fn(() => [new Promise<DeckChoiceMembership>(resolve => pending.push(resolve))]);
        const picker = mount([LOCAL], { language: 'en', load });
        picker.select.focus();
        expect(load).not.toHaveBeenCalled();
        allowSyntheticReaderInteractionsForTests(false);
        picker.select.dispatchEvent(new Event('pointerdown'));
        expect(load).not.toHaveBeenCalled();
        open(picker.select);
        expect(load).toHaveBeenCalledTimes(1);
        document.querySelector('button')!.focus();
        open(picker.select);
        pending[1]({ kind: 'saved' });
        await settle();
        pending[0]({ kind: 'not-saved' });
        await settle();
        expect(picker.select.options[1].text).toContain('Saved in this deck');
        picker.select.blur(); open(picker.select);
        const nextWord = { ...card, spelling: '別の単語' };
        const nextLoad = vi.fn(() => [Promise.resolve<DeckChoiceMembership>({ kind: 'saved' })]);
        const replacement = mount([LOCAL], { language: 'en', load: nextLoad }, undefined, nextWord);
        open(replacement.select);
        pending[2]({ kind: 'not-saved' });
        await settle();
        expect(replacement.select.options[1].text).toContain('Saved in this deck');
        expect(nextLoad).toHaveBeenCalledWith(nextWord, [LOCAL]);
        allowSyntheticReaderInteractionsForTests(true);
    });
});

describe('authoritative provider reads', () => {
    it('never identifies an Anki word from sentence context or an ambiguous model', async () => {
        const settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, apiKey: '' };
        const client = new AnkiConnectClient(() => settings);
        const controller = testCardActionController({ getSettings: () => settings, anki: client });
        const choices: DeckChoice[] = [{ source: 'anki', id: 'Private A', label: 'Anki: Private A' }];
        let fields = { Expression: { value: '犬' }, Reading: { value: 'いぬ' }, Sentence: { value: '猫' } };
        const invoke = vi.spyOn(client, 'invoke').mockImplementation(async action => {
            if (action === 'findNotes') return [17];
            if (action === 'notesInfo') return [{ noteId: 17, modelName: 'Imported words', fields, cards: [18], tags: [] }];
            if (action === 'cardsInfo') return [{ cardId: 18, deckName: 'Private A', queue: 0, type: 0 }];
            throw new Error('Unexpected action');
        });
        const target = { ...card, spelling: '猫', reading: 'ねこ' };
        try {
            expect(await Promise.all(controller.loadDeckMembership(target, choices))).toEqual([{ kind: 'not-saved' }]);
            fields = { Expression: { value: '猫' }, Reading: { value: 'ねこ' }, Sentence: { value: '犬' } };
            expect(await Promise.all(controller.loadDeckMembership(target, choices))).toEqual([{ kind: 'saved' }]);
            fields = { Expression: { value: '猫' }, Reading: { value: 'びょう' }, Sentence: { value: '犬' } };
            expect(await Promise.all(controller.loadDeckMembership(target, choices))).toEqual([{ kind: 'not-saved' }]);
            fields = { Expression: { value: '猫' }, Reading: { value: '' }, Sentence: { value: '犬' } };
            expect(await Promise.all(controller.loadDeckMembership(target, choices))).toEqual([{ kind: 'unknown', reason: 'unavailable' }]);
            fields = { Expression: { value: '猫 / 犬' }, Reading: { value: 'ねこ' }, Sentence: { value: '犬' } };
            expect(await Promise.all(controller.loadDeckMembership(target, choices))).toEqual([{ kind: 'unknown', reason: 'unavailable' }]);
            fields = { Expression: { value: '猫' }, Reading: { value: 'ねこ / びょう' }, Sentence: { value: '犬' } };
            expect(await Promise.all(controller.loadDeckMembership(target, choices))).toEqual([{ kind: 'unknown', reason: 'unavailable' }]);
            fields = { Expression: { value: '' }, Reading: { value: 'ねこ' }, Sentence: { value: '猫' } };
            expect(await Promise.all(controller.loadDeckMembership(target, choices))).toEqual([{ kind: 'unknown', reason: 'unavailable' }]);
            invoke.mockImplementation(async action => action === 'findNotes' ? [17] : action === 'notesInfo'
                ? [{ noteId: 17, modelName: 'Unmapped cards', fields: { Front: { value: '猫' }, Back: { value: 'dog' } }, cards: [18], tags: [] }]
                : [{ cardId: 18, deckName: 'Private A', queue: 0, type: 0 }]);
            expect(await Promise.all(controller.loadDeckMembership(target, choices))).toEqual([{ kind: 'unknown', reason: 'unavailable' }]);
        } finally { client.destroy(); }
    });

    it('uses configured lexical fields and keeps proven saved notes when another candidate is ambiguous', async () => {
        const settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, apiKey: '', ankiFieldMappings: { 'Custom words': { expression: 'Question', reading: 'Answer', sentence: 'Context' } } };
        const client = new AnkiConnectClient(() => settings);
        let ambiguousDeck = 'Private B';
        vi.spyOn(client, 'invoke').mockImplementation(async action => {
            if (action === 'findNotes') return [17, 19];
            if (action === 'notesInfo') return [
                { noteId: 17, modelName: 'Custom words', fields: { Question: { value: '猫' }, Answer: { value: 'ねこ' }, Context: { value: '犬' } }, cards: [18], tags: [] },
                { noteId: 19, modelName: 'Unmapped', fields: { Front: { value: '猫' }, Back: { value: 'context' } }, cards: [20], tags: [] },
            ];
            if (action === 'cardsInfo') return [{ cardId: 18, deckName: 'Private A' }, { cardId: 20, deckName: ambiguousDeck }];
            throw new Error('Unexpected action');
        });
        const controller = testCardActionController({ getSettings: () => settings, anki: client });
        const choices: DeckChoice[] = ['Private A', 'Private B', 'Private C'].map(id => ({ source: 'anki', id, label: `Anki: ${id}` }));
        try {
            const target = { ...card, spelling: '猫', reading: 'ねこ' };
            expect(await Promise.all(controller.loadDeckMembership(target, choices))).toEqual([{ kind: 'saved' }, { kind: 'unknown', reason: 'unavailable' }, { kind: 'not-saved' }]);
            ambiguousDeck = 'Private A';
            expect(await Promise.all(controller.loadDeckMembership(target, choices))).toEqual([{ kind: 'saved' }, { kind: 'not-saved' }, { kind: 'not-saved' }]);
            settings.ankiFieldMappings['Custom words'].expression = 'Missing';
            expect((await Promise.all(controller.loadDeckMembership(target, choices)))[0]).toEqual({ kind: 'unknown', reason: 'unavailable' });
            settings.ankiFieldMappings['Custom words'].expression = 'Context';
            expect((await Promise.all(controller.loadDeckMembership(target, choices)))[0]).toEqual({ kind: 'unknown', reason: 'unavailable' });
            settings.ankiFieldMappings['Custom words'].expression = 'Question';
            settings.ankiFieldMappings['Custom words'].reading = 'Missing';
            expect((await Promise.all(controller.loadDeckMembership(target, choices)))[0]).toEqual({ kind: 'unknown', reason: 'unavailable' });
            settings.ankiFieldMappings['Custom words'].reading = 'Question';
            expect((await Promise.all(controller.loadDeckMembership(target, choices)))[0]).toEqual({ kind: 'unknown', reason: 'unavailable' });
        } finally { client.destroy(); }
    });

    it.each([[null, null], ['', ''], [0, 1], [9, -1], [9, null], [9, '']])('rejects malformed JPDB membership pair %j rather than claiming absence', async (vid, sid) => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ vocabulary: [[vid, sid]] }), { status: 200 })));
        const client = new JpdbClient(() => 'deterministic-key');
        const controller = testCardActionController({ getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'deterministic-key', jpdbMiningEnabled: true }), jpdb: client });
        expect(await Promise.all(controller.loadDeckMembership({ ...card, vid: 9, sid: 1 }, [{ source: 'jpdb', id: '123', label: 'JPDB: Private' }]))).toEqual([{ kind: 'unknown', reason: 'unavailable' }]);
    });

    it.each([null, '', -1, 'garbage'])('rejects malformed Jiten readingIndex %j rather than claiming membership', async readingIndex => {
        const client = new JitenApiClient(() => 'deterministic-key', { requestImpl: async () => [{ wordId: 9, readingIndex }] });
        const controller = testCardActionController({ getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: 'deterministic-key', jpdbMiningEnabled: true }), jiten: client });
        const target: JPDBCard = { ...card, source: 'jiten', vid: 9, sid: 0, jitenWordId: 9, jitenReadingIndex: 0 };
        expect(await Promise.all(controller.loadDeckMembership(target, [{ source: 'jiten', id: '123', label: 'Jiten: Private' }]))).toEqual([{ kind: 'unknown', reason: 'unavailable' }]);
    });

    it('accepts decimal string IDs in strict reads and retains the legacy Study word-key fallback', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ vocabulary: [['9', '0']] }), { status: 200 })));
        expect(await new JpdbClient(() => 'key').isCardInDeck('123', { ...card, vid: 9, sid: 0 })).toBe(true);
        let response: unknown = [{ wordId: '9', readingIndex: '0' }];
        const client = new JitenApiClient(() => 'key', { requestImpl: async () => response });
        expect(await client.isCardInStudyDeck(123, { wordId: 9, readingIndex: 0 })).toBe(true);
        response = [{ wordId: 9, readingIndex: null }];
        await expect(client.isCardInStudyDeck(123, { wordId: 9, readingIndex: 0 })).rejects.toThrow('Invalid provider');
        expect(await client.studyDeckWordKeys(123)).toEqual(new Set(['9:0']));
        response = null;
        expect(await client.studyDeckWordKeys(123)).toEqual(new Set());
    });
    it('checks Jiten word-list IDs and reading indices, and refuses malformed membership evidence', async () => {
        const request = vi.fn(async (url: string): Promise<unknown> => url.includes('/31/') ? [{ wordId: 123, readingIndex: 2 }] : []);
        const client = new JitenApiClient(() => 'deterministic-key', { requestImpl: request });
        const controller = testCardActionController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: 'deterministic-key', jpdbMiningEnabled: true }),
            jiten: client,
        });
        const word = { ...card, source: 'jiten' as const, vid: 123, sid: 2, reviewSource: 'jiten-api' as const };
        const choices: DeckChoice[] = ['31', '32'].map(id => ({ source: 'jiten', id, label: `Jiten: ${id}` }));
        expect(await Promise.all(controller.loadDeckMembership(word, choices))).toEqual([{ kind: 'saved' }, { kind: 'not-saved' }]);
        request.mockResolvedValue([{ wordId: 123, readingIndex: 1 }]);
        expect(await Promise.all(controller.loadDeckMembership(word, choices))).toEqual(choices.map(() => ({ kind: 'not-saved' })));
        request.mockResolvedValue(null);
        expect(await Promise.all(controller.loadDeckMembership(word, choices))).toEqual(choices.map(() => ({ kind: 'unknown', reason: 'unavailable' })));
        expect(await Promise.all(controller.loadDeckMembership(word, [{ source: 'bunpro', id: 'bunpro', label: 'Bunpro' }]))).toEqual([{ kind: 'unknown', reason: 'unsupported' }]);
    });
    it('checks the requested JPDB deck rather than pooled state, and rejects incomplete replies', async () => {
        const fetch = vi.fn(async (_url, init) => new Response(JSON.stringify({ vocabulary: JSON.parse(init.body).id === 'saved' ? [[card.vid, card.sid]] : [] }), { status: 200 }));
        vi.stubGlobal('fetch', fetch);
        const client = new JpdbClient(() => 'deterministic-key');
        expect(await client.isCardInDeck('saved', card)).toBe(true);
        expect(await client.isCardInDeck('other', card)).toBe(false);
        fetch.mockImplementation(async () => new Response('{}', { status: 200 }));
        await expect(client.isCardInDeck('broken', card)).rejects.toThrow('Invalid JPDB');
    });

    it('uses fresh Anki notes and actual card decks; connection errors and partial card info remain unknown', async () => {
        const settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, ankiDeck: 'Private A', apiKey: '' };
        const client = new AnkiConnectClient(() => settings);
        const invoke = vi.spyOn(client, 'invoke');
        invoke.mockImplementation(async action => {
            if (action === 'findNotes') return [17];
            if (action === 'notesInfo') return [{ noteId: 17, modelName: 'よむ Japanese', fields: { Expression: { value: card.spelling }, Reading: { value: card.reading } }, cards: [18], tags: [] }];
            if (action === 'cardsInfo') return [{ cardId: 18, deckName: 'Private A', queue: 0, type: 0 }];
            throw new Error('Unexpected action');
        });
        const controller = testCardActionController({ getSettings: () => settings, anki: client });
        const choices: DeckChoice[] = ['Private A', 'Private B'].map(id => ({ source: 'anki', id, label: `Anki: ${id}` }));
        expect(await Promise.all(controller.loadDeckMembership(card, choices))).toEqual([{ kind: 'saved' }, { kind: 'not-saved' }]);
        expect(invoke.mock.calls.filter(([action]) => action === 'findNotes')).toHaveLength(1);
        const good = invoke.getMockImplementation()!;
        invoke.mockImplementation(async (action, params) => action === 'cardsInfo' ? [] : good(action, params));
        expect(await Promise.all(controller.loadDeckMembership(card, choices))).toEqual(choices.map(() => ({ kind: 'unknown', reason: 'unavailable' })));
        invoke.mockRejectedValue(new Error('offline'));
        expect(await Promise.all(controller.loadDeckMembership(card, choices))).toEqual(choices.map(() => ({ kind: 'unknown', reason: 'unavailable' })));
        invoke.mockResolvedValue([]);
        expect(await Promise.all(controller.loadDeckMembership(card, choices))).toEqual(choices.map(() => ({ kind: 'not-saved' })));
        client.destroy();
    });
});
