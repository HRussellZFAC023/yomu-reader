import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnkiConnectClient, buildYomuAnkiPreviewFields, canDirectFetchAnkiConnectFrom, canUseMobileAnkiHandoff, YOMU_MODEL_FIELDS, type AnkiExistingNote, type AnkiLookupResult } from '../../src/reader/anki/index';
import { ankiStatusIndexSettingsKey } from '../../src/reader/anki/account-context';
import { ankiExistingNoteFromInfo } from '../../src/reader/anki/card-details';
import { applyComputedAnkiNextReviews, reviewGradeIntervalsFromAnkiCards } from '../../src/reader/anki/card-details';
import { applyNewCardStepPreviews } from '../../src/reader/anki/new-tab';
import { renderAnkiExistingSection } from '../../src/reader/anki/render';
import { renderReviewButtons } from '../../src/reader/anki/render-impl';
import { ANKI_STATUS_INDEX_STORAGE_KEY, claimAnkiStatusIndexRebuildLease, shouldReplaceAnkiStatusIndexEntry } from '../../src/reader/anki/status-index';
import { testEnSettings } from './helpers/settings-fixture';

// These tests assert English UI copy; pin the interface language since the
// shipped default is now 'ja'.
const DEFAULT_SETTINGS = testEnSettings();
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import {
    existingAnkiNote,
    expectFirstRenderedAnkiCardOpen,



    renderExistingAnkiNote,
} from './helpers/anki-render';

afterEach(() => {
    vi.restoreAllMocks();
});

type MockAnkiAction = {
    action: string;
    params?: {
        actions?: Array<{ action: string; params?: Record<string, unknown> }>;
        cards?: number[];
        decks?: string[];
        notes?: number[];
        query?: string;
    };
};

type RecordedMockAnkiAction = { body: MockAnkiAction; query: string };
type MockAnkiConnectRequest = { action: string; params: Record<string, unknown> };
type MockAnkiNotePayload = {
    audio?: Array<Record<string, unknown>>;
    picture?: Array<Record<string, unknown>>;
    fields: Record<string, string>;
};
type ExistingCardLookupFetchOptions = {
    findQuery: string;
    noteId: number;
    noteInfo: unknown;
    cardInfo: unknown;
};
type DirtyStatusIndexOptions = {
    settingsKey: string;
    checkedAt: number;
    dirtyAt: number;
    updatedAt: number;
};
type StatusIndexRefreshInternals = { statusIndexRefreshQueued: boolean };

const HOSTED_NEW_TAB_URL = 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html';

function parseMockAnkiAction(init?: RequestInit): MockAnkiAction {
    return JSON.parse(String(init?.body ?? '{}')) as MockAnkiAction;
}

function ankiJsonResponse(result: unknown) {
    return new Response(JSON.stringify({ result, error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function stubGmAnkiConnect(resultByAction: Record<string, unknown>): MockAnkiConnectRequest[] {
    const requests: MockAnkiConnectRequest[] = [];
    vi.stubGlobal('GM', {
        xmlHttpRequest: ({ data }: { data: string }) => {
            const request = JSON.parse(data) as MockAnkiConnectRequest;
            requests.push(request);
            return Promise.resolve({ status: 200, response: { result: resultByAction[request.action] ?? null, error: null } });
        },
    });
    return requests;
}

function mockAnkiActionResult(body: MockAnkiAction, handlers: Record<string, () => unknown>): unknown {
    const handler = handlers[body.action];
    if (handler) return handler();
    throw new Error(`Unexpected Anki action: ${body.action}`);
}

function ankiClientAfterBackgroundCooldown(settings: Partial<ReaderSettings> = {}): AnkiConnectClient {
    const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ...settings }));
    (client as unknown as { unavailableUntil: number }).unavailableUntil = Date.now() + 60_000;
    return client;
}

async function expectMissingStatusLookupQueuesRefresh(
    client: AnkiConnectClient,
    card: JPDBCard,
    actions: string[],
    internals: StatusIndexRefreshInternals,
): Promise<void> {
    await expect(client.findCachedStatusBatch([card])).resolves.toMatchObject([{
        state: 'not-in-deck',
        primary: null,
    }]);
    expect(actions).toEqual(['multi']);
    expect(actions).not.toContain('findCards:deck:*');
    expect(internals.statusIndexRefreshQueued).toBe(true);
}

function yomuModelSetupResults(canAddNotes: boolean[]) {
    return {
        createDeck: null,
        modelNames: ['よむ Japanese'],
        modelFieldNames: YOMU_MODEL_FIELDS,
        updateModelTemplates: null,
        updateModelStyling: null,
        canAddNotes,
    };
}

function mockAnkiAddNotePayload(requests: MockAnkiConnectRequest[]): MockAnkiNotePayload {
    return requests.find(request => request.action === 'addNote')?.params.note as MockAnkiNotePayload;
}

function mockAnkiCanAddNotePayload(requests: MockAnkiConnectRequest[]): MockAnkiNotePayload {
    return (requests.find(request => request.action === 'canAddNotes')?.params.notes as MockAnkiNotePayload[])[0];
}

function stubBrowserAnkiConnectCheck(href: string): {
    client: AnkiConnectClient;
    fetchMock: ReturnType<typeof vi.fn<[], Promise<Response>>>;
} {
    vi.stubGlobal('location', { href });
    const fetchMock = vi.fn(async () => ankiJsonResponse(6));
    vi.stubGlobal('fetch', fetchMock);
    const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }));
    return { client, fetchMock };
}

function stubHostedLoopbackBridgeMocks(message = 'hosted bridge requests should not direct-fetch loopback AnkiConnect') {
    vi.stubGlobal('location', { href: HOSTED_NEW_TAB_URL });
    const fetchMock = vi.fn(async () => {
        throw new Error(message);
    });
    const bridgeRequest = vi.fn(async () => ({
        status: 200,
        response: { result: 6, error: null },
    }));
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, bridgeRequest };
}

async function expectHostedLoopbackBridgeSuccess(
    connected: Promise<boolean>,
    bridgeRequest: unknown,
    fetchMock: unknown,
): Promise<void> {
    await expect(connected).resolves.toBe(true);
    expect(bridgeRequest).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        url: 'http://127.0.0.1:8765',
    }));
    expect(fetchMock).not.toHaveBeenCalled();
}

function recordedMockAnkiAction(init: RequestInit | undefined, actions: string[]): RecordedMockAnkiAction {
    const body = parseMockAnkiAction(init);
    const query = String(body.params?.query ?? '');
    actions.push(mockAnkiActionLabel(body, query));
    return { body, query };
}

function mockAnkiActionLabel(body: MockAnkiAction, query: string): string {
    return body.action === 'findCards' ? `findCards:${query}` : body.action;
}

function exactStatusLookupFetchMock(actions: string[], broadScanMessage: string) {
    return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const { body, query } = recordedMockAnkiAction(init, actions);
        rejectDeckWideExactLookup(body, query, broadScanMessage);
        if (body.action !== 'multi') throw new Error(`Unexpected Anki action: ${body.action}`);
        return ankiJsonResponse(emptyMultiActionResults(body));
    });
}

function activeRebuildExactStatusLookupFetchMock(actions: string[]) {
    return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const { body, query } = recordedMockAnkiAction(init, actions);
        const handler = activeRebuildExactStatusLookupHandlers(body)[body.action];
        if (handler) return ankiJsonResponse(handler());
        rejectDeckWideExactLookup(body, query, 'active rebuild status lookup should not scan deck:*');
        throw new Error(`Unexpected Anki action: ${body.action}`);
    });
}

function rejectDeckWideExactLookup(body: MockAnkiAction, query: string, message: string): void {
    if (body.action === 'findCards' && query === 'deck:*') throw new Error(message);
}

function emptyMultiActionResults(body: MockAnkiAction): Array<{ result: unknown[]; error: null }> {
    return (body.params?.actions ?? []).map(() => ({ result: [], error: null }));
}

function activeRebuildExactStatusLookupHandlers(body: MockAnkiAction): Record<string, () => unknown> {
    return {
        multi: () => (body.params?.actions ?? []).map(activeRebuildMultiActionResult),
        notesInfo: () => activeRebuildNotesInfo(body),
        cardsInfo: () => activeRebuildCardsInfo(body),
        areDue: () => [true],
    };
}

function activeRebuildMultiActionResult(action: { params?: Record<string, unknown> }): { result: number[]; error: null } {
    const query = String(action.params?.query ?? '');
    return { result: /動画|どうが/.test(query) ? [55] : [], error: null };
}

function activeRebuildNotesInfo(body: MockAnkiAction) {
    expect(body.params?.notes).toEqual([55]);
    return [mockAnkiNoteInfo({ noteId: 55, word: '動画', reading: 'どうが', cardId: 7701 })];
}

function activeRebuildCardsInfo(body: MockAnkiAction) {
    expect(body.params?.cards).toEqual([7701]);
    return [mockAnkiCardInfo({
        cardId: 7701,
        noteId: 55,
        deckName: 'Anime::Mining',
        queue: 2,
        type: 2,
        reps: 16,
    })];
}

function noteIdsForLibraryScanQuery(query: string): number[] {
    const match = [
        ['Core 2k/6k', 101],
        ['Kaishi', 201],
        ['RRTK', 301],
    ].find(([needle]) => query.includes(String(needle)));
    return match ? [Number(match[1])] : [];
}

function statusIndexWarmupActionResult(
    body: MockAnkiAction,
    query: string,
    cardIds: number[],
    totalCards: number,
    cardInfoChunkSizes: number[],
    noteInfoChunkSizes: number[],
): unknown {
    const handlers: Record<string, () => unknown> = {
        version: () => 6,
        findCards: () => statusIndexFindCardsResult(query, cardIds, totalCards),
        cardsInfo: () => statusIndexCardsInfoResult(body.params?.cards ?? [], totalCards, cardInfoChunkSizes),
        notesInfo: () => statusIndexNotesInfoResult(body.params?.notes ?? [], noteInfoChunkSizes),
    };
    return mockAnkiActionResult(body, handlers);
}

function statusIndexFindCardsResult(query: string, cardIds: number[], totalCards: number): number[] {
    return ({
        'deck:*': cardIds,
        'deck:* is:due': [totalCards],
        'deck:* is:new': [7],
        'deck:* is:learn': [],
        'deck:* is:suspended': [],
    } as Record<string, number[]>)[query] ?? [];
}

function statusIndexCardsInfoResult(cards: number[], totalCards: number, chunkSizes: number[]) {
    chunkSizes.push(cards.length);
    return cards.map(cardId => statusIndexCardInfo(cardId, totalCards));
}

function statusIndexCardInfo(cardId: number, totalCards: number) {
    const isNewCard = cardId === 7;
    return {
        cardId,
        note: 10000 + cardId,
        deckName: 'Big Mining',
        queue: isNewCard ? 0 : 2,
        type: isNewCard ? 0 : 2,
        due: cardId === totalCards ? 0 : 999999,
        reps: cardId,
        lapses: cardId % 3,
    };
}

function statusIndexNotesInfoResult(notes: number[], chunkSizes: number[]) {
    chunkSizes.push(notes.length);
    return notes.map(statusIndexNoteInfo);
}

function statusIndexNoteInfo(noteId: number) {
    const cardId = noteId - 10000;
    return {
        noteId,
        modelName: 'Core 2k',
        tags: ['core'],
        cards: [cardId],
        fields: {
            Expression: { value: `単語${cardId}` },
            Reading: { value: `たんご${cardId}` },
            Meaning: { value: `word ${cardId}` },
        },
    };
}

function mockAnkiNoteInfo({ noteId, word, reading, cardId }: { noteId: number; word: string; reading: string; cardId: number }) {
    return {
        noteId,
        modelName: 'Imported Core',
        tags: [],
        fields: {
            Word: { value: word },
            Reading: { value: reading },
        },
        cards: [cardId],
    };
}

function mockAnkiCardInfo({
    cardId,
    noteId,
    deckName,
    queue,
    type,
    reps,
    lapses = 0,
}: {
    cardId: number;
    noteId: number;
    deckName: string;
    queue: number;
    type: number;
    reps: number;
    lapses?: number;
}) {
    return {
        cardId,
        note: noteId,
        deckName,
        queue,
        type,
        reps,
        lapses,
    };
}

function stubExistingCardLookupFetch({
    findQuery,
    noteId,
    noteInfo,
    cardInfo,
}: ExistingCardLookupFetchOptions) {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = parseMockAnkiAction(init);
        const resultForAction = (): unknown => {
            if (body.action === 'multi') {
                const actions = body.params?.actions ?? [];
                return actions.map(action => ({
                    result: action.action === 'findNotes' && action.params?.query === findQuery ? [noteId] : [],
                    error: null,
                }));
            }
            if (body.action === 'notesInfo') return [noteInfo];
            if (body.action === 'cardsInfo') return [cardInfo];
            if (body.action === 'areDue') return [true];
            throw new Error(`Unexpected Anki action: ${body.action}`);
        };
        return ankiJsonResponse(resultForAction());
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function storeDirtyStatusIndex({
    settingsKey,
    checkedAt,
    dirtyAt,
    updatedAt,
}: DirtyStatusIndexOptions): void {
    localStorage.setItem(ANKI_STATUS_INDEX_STORAGE_KEY, JSON.stringify({
        version: 1,
        settingsKey,
        syncedAt: 0,
        checkedAt,
        dirtyAt,
        cardCount: 1,
        entryCount: 1,
        readingKeys: true,
        entries: {
            [String('動画').toLocaleLowerCase()]: {
                state: 'due',
                noteId: 55,
                primaryCardId: 7701,
                deckNames: ['Anime::Mining'],
                reps: 14,
                lapses: 0,
                modelName: 'Imported Core',
                updatedAt,
            },
        },
    }));
}

async function warmStatusIndexWithFetch(ankiConnectUrl: string, fetchMock: unknown) {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('fetch', fetchMock);

    const settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, ankiConnectUrl };
    const client = new AnkiConnectClient(() => settings);
    const index = await client.warmStatusIndex();

    return { settings, client, index };
}

describe('AnkiConnect browser fetch eligibility', () => {
    it('keeps mobile Anki handoff hidden until Anki and handoff are both enabled', () => {
        vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 });

        try {
            expect(canUseMobileAnkiHandoff(DEFAULT_SETTINGS)).toBe(false);
            expect(canUseMobileAnkiHandoff({ ...DEFAULT_SETTINGS, ankiMobileHandoff: true })).toBe(false);
            expect(canUseMobileAnkiHandoff({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: true })).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('treats same-origin AnkiConnect endpoints as directly fetchable without a bridge', () => {
        expect(canDirectFetchAnkiConnectFrom(
            'https://hrussellzfac023.github.io/anki-connect',
            'https://hrussellzfac023.github.io/yomu-reader/newtab/',
        )).toBe(true);
        expect(canDirectFetchAnkiConnectFrom(
            'http://127.0.0.1:8765',
            'http://127.0.0.1:8765/',
        )).toBe(true);
    });

    it('requires the bridge for cross-origin AnkiConnect endpoints so hosted pages do not spam CORS errors', () => {
        // Hosted yomu-site page -> loopback AnkiConnect (the reported case).
        expect(canDirectFetchAnkiConnectFrom('http://127.0.0.1:8765', 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html')).toBe(false);
        // Hosted new-tab -> non-local configured endpoint.
        expect(canDirectFetchAnkiConnectFrom('http://tailscale-host.ts.net:8765', 'https://hrussellzfac023.github.io/yomu-reader/newtab/')).toBe(false);
        // Arbitrary content page -> loopback.
        expect(canDirectFetchAnkiConnectFrom('http://127.0.0.1:8765', 'https://example.com/article')).toBe(false);
        // Local dev page on a different port is still cross-origin.
        expect(canDirectFetchAnkiConnectFrom('http://127.0.0.1:8765', 'http://127.0.0.1:5174/newtab/')).toBe(false);
        expect(canDirectFetchAnkiConnectFrom('http://127.0.0.1:8765', 'file:///Users/heru/Documents/Projects/yomu/apps/yomu-reader/public/newtab/index.html')).toBe(false);
        // Non-http endpoints are never directly fetchable.
        expect(canDirectFetchAnkiConnectFrom('ftp://127.0.0.1:8765', 'http://127.0.0.1:8765/')).toBe(false);
    });

    it('skips the cross-origin AnkiConnect request when no bridge exists, reporting not connected without a fetch', async () => {
        const { client, fetchMock } = stubBrowserAnkiConnectCheck('https://hrussellzfac023.github.io/yomu-reader/newtab/index.html');

        try {
            await expect(client.isConnected()).resolves.toBe(false);
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('still direct-fetches a same-origin AnkiConnect endpoint when no bridge exists', async () => {
        const { client, fetchMock } = stubBrowserAnkiConnectCheck('http://127.0.0.1:8765/');

        try {
            await expect(client.isConnected()).resolves.toBe(true);
            expect(fetchMock).toHaveBeenCalledWith(
                'http://127.0.0.1:8765',
                expect.objectContaining({ method: 'POST' }),
            );
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('prefers the userscript bridge over direct hosted fetch when the bridge exists', async () => {
        const { fetchMock, bridgeRequest } = stubHostedLoopbackBridgeMocks('hosted bridge requests should not fall through to fetch');
        vi.stubGlobal('GM', { xmlHttpRequest: bridgeRequest });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }));

            await expectHostedLoopbackBridgeSuccess(client.isConnected(), bridgeRequest, fetchMock);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses a newly available bridge for word lookup even after a background cooldown', async () => {
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html',
        });
        const bridgeRequest = vi.fn(async ({ data }: { data: string }) => {
            const body = JSON.parse(data) as MockAnkiAction;
            const handlers: Record<string, () => unknown> = {
                multi: () => (body.params?.actions ?? []).map(activeRebuildMultiActionResult),
                notesInfo: () => [mockAnkiNoteInfo({ noteId: 55, word: '動画', reading: 'どうが', cardId: 7701 })],
                cardsInfo: () => [mockAnkiCardInfo({
                    cardId: 7701,
                    noteId: 55,
                    deckName: 'Anime::Mining',
                    queue: 2,
                    type: 2,
                    reps: 16,
                })],
                areDue: () => [false],
            };
            const handler = handlers[body.action];
            if (!handler) throw new Error(`Unexpected Anki action: ${body.action}`);
            return {
                status: 200,
                response: { result: handler(), error: null },
            };
        });
        vi.stubGlobal('GM', { xmlHttpRequest: bridgeRequest });

        try {
            const client = ankiClientAfterBackgroundCooldown();

            await expect(client.findExistingCards(jpdbCard({ spelling: '動画', reading: 'どうが' }))).resolves.toMatchObject({
                state: 'known',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                    reps: 16,
                },
            });
            expect(bridgeRequest).toHaveBeenCalled();
            client.destroy();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('retries detailed browser lookups after a background cooldown so clicked words can hydrate card details', async () => {
        const ankiConnectUrl = `${window.location.origin}/anki-connect`;
        const fetchMock = stubExistingCardLookupFetch({
            findQuery: '"どうが"',
            noteId: 55,
            noteInfo: mockAnkiNoteInfo({ noteId: 55, word: '動画', reading: 'どうが', cardId: 7701 }),
            cardInfo: {
                ...mockAnkiCardInfo({
                    cardId: 7701,
                    noteId: 55,
                    deckName: 'Anime::Mining',
                    queue: 2,
                    type: 2,
                    reps: 16,
                }),
                question: '<div>動画</div>',
                answer: '<div>video</div>',
            },
        });

        try {
            const client = ankiClientAfterBackgroundCooldown({ ankiConnectUrl });

            await expect(client.findExistingCards(jpdbCard({ spelling: '動画', reading: 'どうが' }))).resolves.toMatchObject({
                state: 'due',
                primary: {
                    noteId: 55,
                    fields: {
                        Word: '動画',
                        Reading: 'どうが',
                    },
                    renderedCards: [{
                        cardId: 7701,
                        question: '<div>動画</div>',
                        answer: '<div>video</div>',
                    }],
                },
            });
            expect(fetchMock).toHaveBeenCalled();
            client.destroy();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('Anki note creation', () => {
    it('scans Core Kaishi and RRTK-style models into confident automatic mappings', async () => {
        const ankiConnectUrl = `${window.location.origin}/anki-library-scan`;
        const fieldsByModel: Record<string, string[]> = {
            'Core 2k/6k Optimized Japanese Vocabulary': ['Vocabulary-Kanji', 'Vocabulary-Kana', 'Vocabulary-English', 'Sentence', 'Audio', 'Picture'],
            'Kaishi 1.5k': ['Word', 'Kana', 'Meaning', 'Example Sentence', 'Word Audio', 'Picture'],
            'RRTK Recognition Remembering The Kanji v2': ['Kanji', 'Keyword', 'Story'],
        };
        const notesById: Record<number, unknown> = {
            101: {
                noteId: 101,
                modelName: 'Core 2k/6k Optimized Japanese Vocabulary',
                tags: [],
                fields: {
                    'Vocabulary-Kanji': { value: '始める' },
                    'Vocabulary-Kana': { value: 'はじめる' },
                    'Vocabulary-English': { value: 'to start' },
                    Sentence: { value: '勉強を始める。' },
                    Audio: { value: '[sound:core-start.mp3]' },
                    Picture: { value: '<img src="start.jpg">' },
                },
                cards: [1001],
            },
            201: {
                noteId: 201,
                modelName: 'Kaishi 1.5k',
                tags: [],
                fields: {
                    Word: { value: '泳ぐ' },
                    Kana: { value: 'およぐ' },
                    Meaning: { value: 'to swim' },
                    'Example Sentence': { value: '海で泳ぐ。' },
                    'Word Audio': { value: '[sound:kaishi-swim.mp3]' },
                    Picture: { value: '<img src="swim.webp">' },
                },
                cards: [2001],
            },
            301: {
                noteId: 301,
                modelName: 'RRTK Recognition Remembering The Kanji v2',
                tags: [],
                fields: {
                    Kanji: { value: '読' },
                    Keyword: { value: 'read' },
                    Story: { value: 'A personal mnemonic story.' },
                },
                cards: [3001],
            },
        };
        vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            const body = parseMockAnkiAction(init);
            const modelName = String((body.params as { modelName?: string } | undefined)?.modelName ?? '');
            const query = String((body.params as { query?: string } | undefined)?.query ?? '');
            const actionHandlers: Record<string, () => unknown> = {
                deckNames: () => ['Core 2k/6k', 'Kaishi 1.5k', 'RRTK Recognition Remembering The Kanji v2'],
                modelNames: () => Object.keys(fieldsByModel),
                modelFieldNames: () => fieldsByModel[modelName] ?? [],
                findNotes: () => noteIdsForLibraryScanQuery(query),
                notesInfo: () => (body.params?.notes ?? []).map(noteId => notesById[Number(noteId)]).filter(Boolean),
            };
            return ankiJsonResponse(mockAnkiActionResult(body, actionHandlers));
        }));

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiConnectUrl }));
            const scan = await client.scanLibrary();
            const model = (name: string) => scan.models.find(item => item.modelName === name);
            const suggestion = (name: string, role: string) => model(name)?.suggestions.find(item => item.role === role);

            expect(suggestion('Core 2k/6k Optimized Japanese Vocabulary', 'expression')).toMatchObject({ fieldName: 'Vocabulary-Kanji', confidence: 'high' });
            expect(suggestion('Core 2k/6k Optimized Japanese Vocabulary', 'reading')).toMatchObject({ fieldName: 'Vocabulary-Kana', confidence: 'high' });
            expect(suggestion('Kaishi 1.5k', 'sentence')).toMatchObject({ fieldName: 'Example Sentence', confidence: 'high' });
            expect(suggestion('RRTK Recognition Remembering The Kanji v2', 'expression')).toMatchObject({ fieldName: 'Kanji', confidence: 'high' });
            expect(suggestion('RRTK Recognition Remembering The Kanji v2', 'meaning')).toMatchObject({ fieldName: 'Keyword', confidence: 'high' });
            expect(suggestion('RRTK Recognition Remembering The Kanji v2', 'sentence')?.fieldName).toBeNull();
            expect(scan.deckNames).toEqual(['Core 2k/6k', 'Kaishi 1.5k', 'RRTK Recognition Remembering The Kanji v2']);
            client.destroy();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('retargets new cards to Kaishi-style fields without a manual mapping scan', async () => {
        const requests = stubGmAnkiConnect({
            createDeck: null,
            modelNames: ['Kaishi 1.5k'],
            modelFieldNames: ['Word', 'Kana', 'Definition', 'Example Sentence', 'Word Audio', 'Picture'],
            canAddNotes: [true],
            addNote: 42,
            notesInfo: [{
                noteId: 42,
                modelName: 'Kaishi 1.5k',
                tags: [],
                fields: {
                    Word: { value: '始める' },
                    Kana: { value: 'はじめる' },
                    Definition: { value: 'to start' },
                },
                cards: [99],
            }],
            cardsInfo: [{
                cardId: 99,
                note: 42,
                deckName: 'Kaishi 1.5k',
                queue: 0,
                type: 0,
                reps: 0,
                lapses: 0,
            }],
        });

        try {
            const client = new AnkiConnectClient(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiDeck: 'Kaishi 1.5k',
                ankiModel: 'Kaishi 1.5k',
                ankiMobileHandoff: false,
            }));
            await client.addCard(jpdbCard({
                spelling: '始める',
                reading: 'はじめる',
                meanings: [{ glosses: ['to start'], partOfSpeech: [] }],
            }), '勉強を始める。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                imageDataUrl: 'data:image/jpeg;base64,image-data',
            });

            const addNote = mockAnkiAddNotePayload(requests);
            expect(addNote.fields.Word).toBe('始める');
            expect(addNote.fields.Kana).toBe('はじめる');
            expect(addNote.fields.Definition).toContain('to start');
            expect(addNote.fields['Example Sentence']).toContain('始める');
            expect(addNote.audio?.[0]).toMatchObject({ fields: ['Word Audio'], data: 'word-audio' });
            expect(addNote.picture?.[0]).toMatchObject({ fields: ['Picture'], data: 'image-data' });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('previews the retargeted fields a non-Yomu model write will actually use, before any write', async () => {
        stubGmAnkiConnect({
            modelNames: ['Kaishi 1.5k'],
            modelFieldNames: ['Word', 'Kana', 'Definition', 'Example Sentence', 'Word Audio', 'Picture'],
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiDeck: 'Kaishi 1.5k',
                ankiModel: 'Kaishi 1.5k',
                ankiMobileHandoff: false,
            };
            const client = new AnkiConnectClient(() => settings);
            const plan = await client.noteFieldTargetPlan();
            expect(plan).toMatchObject({ modelName: 'Kaishi 1.5k', yomuManaged: false });
            expect(plan?.fieldNames).toContain('Word');

            const fields = buildYomuAnkiPreviewFields(jpdbCard({
                spelling: '始める',
                reading: 'はじめる',
                meanings: [{ glosses: ['to start'], partOfSpeech: [] }],
            }), '勉強を始める。', settings, {}, plan);
            // The preview shows the same field targets the write path retargets
            // into, not silent Yomu field names that will never be written.
            expect(fields.Word).toBe('始める');
            expect(fields.Kana).toBe('はじめる');
            expect(fields.Definition).toContain('to start');
            expect(fields['Example Sentence']).toContain('始める');
            expect(fields.Expression).toBeUndefined();
            expect(fields.Meaning).toBeUndefined();
            client.destroy();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps Yomu preview fields for Yomu-managed models and when the field target plan is unavailable', () => {
        const settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false };
        const card = jpdbCard();

        const withoutPlan = buildYomuAnkiPreviewFields(card, '', settings, {}, null);
        expect(withoutPlan.Expression).toBe('日本語');

        const managed = buildYomuAnkiPreviewFields(card, '', settings, {}, { modelName: 'よむ Japanese', yomuManaged: true, fieldNames: [] });
        expect(managed.Expression).toBe('日本語');
    });

    it('merges missing RRTK Kanji and Keyword fields without writing Yomu kanji-definition HTML into the kanji slot', async () => {
        const requests = stubGmAnkiConnect({
            notesInfo: [{
                noteId: 77,
                modelName: 'RRTK Recognition Remembering The Kanji v2',
                tags: ['rrtk'],
                fields: {
                    Kanji: { value: '' },
                    Keyword: { value: '' },
                    Story: { value: 'Keep my mnemonic.' },
                },
                cards: [7700],
            }],
            updateNoteFields: null,
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.mergeYomuData(77, jpdbCard({
                spelling: '読',
                reading: '',
                meanings: [{ glosses: ['read'], partOfSpeech: [] }],
            }));

            const update = requests.find(request => request.action === 'updateNoteFields')?.params.note as {
                fields: Record<string, string>;
            };
            expect(update.fields.Kanji).toBe('読');
            expect(update.fields.Keyword).toContain('read');
            expect(update.fields.Story).toBeUndefined();
            expect(update.fields.Kanji).not.toContain('yomu-kanji-entry');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('checks duplicates without media before adding the media-bearing note', async () => {
        const requests = stubGmAnkiConnect({
            ...yomuModelSetupResults([true]),
            addNote: 42,
            notesInfo: [{
                noteId: 42,
                modelName: 'よむ Japanese',
                tags: [],
                fields: {
                    Expression: { value: '日本語' },
                    Reading: { value: 'にほんご' },
                },
                cards: [99],
            }],
            cardsInfo: [{
                cardId: 99,
                note: 42,
                deckName: 'よむ',
                queue: 0,
                type: 0,
                reps: 0,
                lapses: 0,
            }],
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.addCard(jpdbCard(), '日本語を読む。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                imageDataUrl: 'data:image/png;base64,image-data',
            });

            const canAddNote = mockAnkiCanAddNotePayload(requests);
            const addNote = mockAnkiAddNotePayload(requests);
            expect(requests.findIndex(request => request.action === 'canAddNotes')).toBeLessThan(requests.findIndex(request => request.action === 'addNote'));
            expect(canAddNote.audio).toBeUndefined();
            expect(canAddNote.picture).toBeUndefined();
            expect(canAddNote.fields).toMatchObject({ Expression: '日本語', Reading: 'にほんご' });
            expect(addNote.audio?.[0]).toMatchObject({ data: 'word-audio', fields: ['Audio'] });
            expect(addNote.picture?.[0]).toMatchObject({ data: 'image-data', fields: ['Image'] });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('stops before addNote when Anki reports the note is a duplicate', async () => {
        const requests = stubGmAnkiConnect({
            ...yomuModelSetupResults([false]),
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await expect(client.addCard(jpdbCard(), '日本語を読む。')).rejects.toThrow('Already in Anki');
            expect(requests.map(request => request.action)).not.toContain('addNote');
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('Anki existing-card lookup', () => {
    it('matches a kana page term to an existing kanji Anki note by reading', async () => {
        const ankiConnectUrl = `${window.location.origin}/anki-connect`;
        const fetchMock = stubExistingCardLookupFetch({
            findQuery: '"よむ"',
            noteId: 959,
            noteInfo: {
                noteId: 959,
                modelName: 'Simple Model',
                tags: ['core'],
                cards: [123],
                fields: {
                    Japanese_Word: { value: '読む' },
                    Readings: { value: 'よむ' },
                    Translation_1: { value: 'to read' },
                },
            },
            cardInfo: {
                cardId: 123,
                note: 959,
                deckName: 'Vocab 2k',
                queue: 2,
                type: 2,
                due: 0,
                reps: 12,
                lapses: 1,
                buttons: [1, 2, 3, 4],
                nextReviews: ['1m', '5m', '10m', '4.1y'],
                question: '<div>読む</div>',
                answer: '<div>to read</div>',
            },
        });

        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ankiConnectUrl }));
        const result = await client.findExistingCards(jpdbCard({ spelling: 'よむ', reading: '' }));

        expect(result.state).toBe('due');
        expect(result.primary?.noteId).toBe(959);
        expect(result.primary?.fields.Japanese_Word).toBe('読む');
        expect(result.primary?.fields.Readings).toBe('よむ');
        expect(result.primary?.reviewGradeIntervals).toMatchObject({
            nothing: { label: 'Again 1m', source: 'anki-next-reviews' },
            hard: { label: 'Hard 5m', source: 'anki-next-reviews' },
            okay: { label: 'Good 10m', source: 'anki-next-reviews' },
            easy: { label: 'Easy 4.1y', source: 'anki-next-reviews' },
        });
        expect(fetchMock).toHaveBeenCalledWith(
            ankiConnectUrl,
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('prefers known over new when multiple Anki notes match the same word', async () => {
        const ankiConnectUrl = `${window.location.origin}/anki-connect`;
        const notes = [
            mockAnkiNoteInfo({ noteId: 101, word: '動画', reading: 'どうが', cardId: 1001 }),
            mockAnkiNoteInfo({ noteId: 102, word: '動画', reading: 'どうが', cardId: 1002 }),
        ];
        const cards = [
            mockAnkiCardInfo({ cardId: 1001, noteId: 101, deckName: 'New Mining', queue: 0, type: 0, reps: 0 }),
            mockAnkiCardInfo({ cardId: 1002, noteId: 102, deckName: 'Known Mining', queue: 2, type: 2, reps: 12 }),
        ];
        vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            const body = parseMockAnkiAction(init);
            const resultForAction = (): unknown => {
                if (body.action === 'multi') {
                    const actions = body.params?.actions ?? [];
                    return actions.map(action => ({
                        result: action.action === 'findNotes' ? [101, 102] : [],
                        error: null,
                    }));
                }
                if (body.action === 'notesInfo') {
                    const requested = new Set((body.params?.notes ?? []).map(Number));
                    return notes.filter(note => requested.has(note.noteId));
                }
                if (body.action === 'cardsInfo') {
                    const requested = new Set((body.params?.cards ?? []).map(Number));
                    return cards.filter(card => requested.has(card.cardId));
                }
                if (body.action === 'areDue') return [false];
                throw new Error(`Unexpected Anki action: ${body.action}`);
            };
            return ankiJsonResponse(resultForAction());
        }));

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ankiConnectUrl }));
            const result = await client.findExistingCards(jpdbCard({ spelling: '動画', reading: 'どうが' }));

            expect(result.state).toBe('known');
            expect(result.primary).toMatchObject({
                noteId: 102,
                state: 'known',
                deckNames: ['Known Mining'],
            });
            expect(result.notes.map(note => note.noteId)).toEqual([101, 102]);
            expect(result.notes.map(note => note.state)).toEqual(['new', 'known']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not match a kanji page term to a different expression with the same reading', async () => {
        const ankiConnectUrl = `${window.location.origin}/anki-connect`;
        stubExistingCardLookupFetch({
            findQuery: '"うる"',
            noteId: 960,
            noteInfo: {
                noteId: 960,
                modelName: 'Simple Model',
                tags: [],
                cards: [124],
                fields: {
                    Japanese_Word: { value: '得る' },
                    Readings: { value: 'うる' },
                    Translation_1: { value: 'to obtain' },
                },
            },
            cardInfo: {
                cardId: 124,
                note: 960,
                deckName: 'Vocab 2k',
                queue: 2,
                type: 2,
                due: 0,
            },
        });

        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ankiConnectUrl }));
        const result = await client.findExistingCards(jpdbCard({ spelling: '売る', reading: 'うる' }));

        expect(result.state).toBe('not-in-deck');
        expect(result.primary).toBeNull();
    });
});

describe('Anki status-only lookup cache', () => {
    it('lets exact refreshed status entries replace older entries from the same Anki note', () => {
        expect(shouldReplaceAnkiStatusIndexEntry({
            state: 'due',
            noteId: 55,
            primaryCardId: 7701,
            deckNames: ['Mining'],
            reps: 8,
            lapses: 0,
            modelName: 'Imported Core',
            updatedAt: 100,
        }, {
            state: 'known',
            noteId: 55,
            primaryCardId: 7701,
            deckNames: ['Mining'],
            reps: 9,
            lapses: 0,
            modelName: 'Imported Core',
            updatedAt: 200,
        })).toBe(true);

        expect(shouldReplaceAnkiStatusIndexEntry({
            state: 'due',
            noteId: 55,
            primaryCardId: 7701,
            deckNames: ['Mining'],
            reps: 8,
            lapses: 0,
            modelName: 'Imported Core',
            updatedAt: 200,
        }, {
            state: 'known',
            noteId: 55,
            primaryCardId: 7701,
            deckNames: ['Mining'],
            reps: 7,
            lapses: 0,
            modelName: 'Imported Core',
            updatedAt: 100,
        })).toBe(false);
    });

    it('keeps known status ahead of new status for competing lookup index entries', () => {
        const newEntry = {
            state: 'new' as const,
            noteId: 55,
            primaryCardId: 7701,
            deckNames: ['New Mining'],
            reps: 0,
            lapses: 0,
            modelName: 'Imported Core',
        };
        const knownEntry = {
            state: 'known' as const,
            noteId: 56,
            primaryCardId: 7702,
            deckNames: ['Known Mining'],
            reps: 8,
            lapses: 0,
            modelName: 'Imported Core',
        };

        expect(shouldReplaceAnkiStatusIndexEntry(newEntry, knownEntry)).toBe(true);
        expect(shouldReplaceAnkiStatusIndexEntry(knownEntry, newEntry)).toBe(false);
    });

    it('dedupes duplicate lookup keys before loading status index entries', async () => {
        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
        const indexEntry = {
            state: 'known' as const,
            noteId: 55,
            primaryCardId: 7701,
            deckNames: ['Mining'],
            reps: 8,
            lapses: 0,
            modelName: 'Imported Core',
        };
        const internals = client as unknown as {
            statusIndex?: {
                version: number;
                settingsKey: string;
                syncedAt: number;
                checkedAt: number;
                cardCount: number;
                readingKeys: boolean;
                entries: Record<string, typeof indexEntry>;
            };
            loadStatusEntriesForCards(index: unknown, cards: JPDBCard[]): Promise<Map<string, typeof indexEntry> | null>;
        };
        internals.statusIndex = {
            version: 1,
            settingsKey: ankiStatusIndexSettingsKey(DEFAULT_SETTINGS),
            syncedAt: Date.now(),
            checkedAt: Date.now(),
            cardCount: 1,
            readingKeys: true,
            entries: {
                '動画': indexEntry,
            },
        };
        const loadStatusEntriesForCards = vi.spyOn(internals, 'loadStatusEntriesForCards');
        const first = jpdbCard({ vid: 10, sid: 1, spelling: '動画', reading: 'どうが' });
        const duplicate = jpdbCard({ vid: 11, sid: 2, spelling: '動画', reading: 'どうが' });
        const missing = jpdbCard({ vid: 12, sid: 3, spelling: '字幕', reading: 'じまく' });

        const results = await client.findCachedStatusBatch([first, duplicate, missing]);

        expect(results).toMatchObject([
            { state: 'known', primary: { noteId: 55 } },
            { state: 'known', primary: { noteId: 55 } },
            { state: 'not-in-deck' },
        ]);
        expect(results[2]).toEqual({ state: 'not-in-deck', notes: [], primary: null });
        expect(loadStatusEntriesForCards).toHaveBeenCalledTimes(1);
        expect(loadStatusEntriesForCards.mock.calls[0]?.[1]).toEqual([first, missing]);
    });

    it('warms a complete status index automatically without a 2k cap', async () => {
        localStorage.clear();
        const totalCards = 2050;
        const cardIds = Array.from({ length: totalCards }, (_, index) => index + 1);
        const actions: string[] = [];
        const cardInfoChunkSizes: number[] = [];
        const noteInfoChunkSizes: number[] = [];
        const ankiConnectUrl = `${window.location.origin}/anki-full-status`;
        const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            const { body, query } = recordedMockAnkiAction(init, actions);
            return ankiJsonResponse(statusIndexWarmupActionResult(body, query, cardIds, totalCards, cardInfoChunkSizes, noteInfoChunkSizes));
        });

        try {
            const { settings, client, index } = await warmStatusIndexWithFetch(ankiConnectUrl, fetchMock);

            expect(index?.cardCount).toBe(totalCards);
            expect(actions).toEqual(expect.arrayContaining([
                'version',
                'findCards:deck:*',
                'findCards:deck:* is:due',
                'findCards:deck:* is:new',
                'findCards:deck:* is:learn',
                'findCards:deck:* is:suspended',
                'cardsInfo',
                'notesInfo',
            ]));
            expect(actions).not.toContain('findNotes');
            expect(Math.max(...cardInfoChunkSizes)).toBeLessThanOrEqual(500);
            expect(Math.max(...noteInfoChunkSizes)).toBeLessThanOrEqual(500);
            client.destroy();

            vi.unstubAllGlobals();
            vi.stubGlobal('indexedDB', undefined);
            vi.stubGlobal('fetch', vi.fn(async () => {
                throw new Error('complete warmed Anki status index should be served from storage');
            }));
            const persistedClient = new AnkiConnectClient(() => settings);
            await expect(persistedClient.findCachedStatusBatch([
                jpdbCard({ vid: totalCards, sid: totalCards, spelling: `単語${totalCards}`, reading: `たんご${totalCards}` }),
            ])).resolves.toMatchObject([{
                state: 'due',
                primary: {
                    noteId: 10000 + totalCards,
                    deckNames: ['Big Mining'],
                    reps: totalCards,
                },
            }]);
            persistedClient.destroy();
        } finally {
            localStorage.clear();
            vi.unstubAllGlobals();
        }
    });

    it('rebuilds recently checked dirty status indexes instead of trusting checkedAt', async () => {
        localStorage.clear();
        const actions: string[] = [];
        const ankiConnectUrl = `${window.location.origin}/anki-dirty-rebuild`;
        const settingsKey = ankiStatusIndexSettingsKey({ ...DEFAULT_SETTINGS, ankiConnectUrl });
        const now = Date.now();
        storeDirtyStatusIndex({
            settingsKey,
            checkedAt: now,
            dirtyAt: now - 1,
            updatedAt: now - 1,
        });
        const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            const { body, query } = recordedMockAnkiAction(init, actions);
            const actionHandlers: Record<string, () => unknown> = {
                version: () => 6,
                deckNames: () => ['Anime::Mining'],
                getDeckStats: () => ({ 1: { name: 'Anime::Mining', total_in_deck: 1 } }),
                findCards: () => ({
                    'deck:*': [7701],
                    'deck:* is:due': [],
                    'deck:* is:new': [],
                    'deck:* is:learn': [],
                    'deck:* is:suspended': [],
                } as Record<string, number[]>)[query] ?? [],
                cardsInfo: () => {
                    expect(body.params?.cards).toEqual([7701]);
                    return [mockAnkiCardInfo({
                        cardId: 7701,
                        noteId: 55,
                        deckName: 'Anime::Mining',
                        queue: 2,
                        type: 2,
                        reps: 15,
                    })];
                },
                notesInfo: () => {
                    expect(body.params?.notes).toEqual([55]);
                    return [mockAnkiNoteInfo({ noteId: 55, word: '動画', reading: 'どうが', cardId: 7701 })];
                },
            };
            const handler = actionHandlers[body.action];
            if (!handler) throw new Error(`Unexpected Anki action: ${body.action}`);
            return ankiJsonResponse(handler());
        });

        try {
            const { client, index } = await warmStatusIndexWithFetch(ankiConnectUrl, fetchMock);

            expect(index?.syncedAt).toBeGreaterThan(0);
            expect(index?.cardCount).toBe(1);
            expect(actions).toEqual(expect.arrayContaining([
                'version',
                'deckNames',
                'getDeckStats',
                'findCards:deck:*',
                'findCards:deck:* is:due',
                'cardsInfo',
                'notesInfo',
            ]));
            expect(actions).not.toContain('findNotes');
            await expect(client.findCachedStatusBatch([
                jpdbCard({ vid: 10, sid: 1, spelling: '動画', reading: 'どうが' }),
            ])).resolves.toMatchObject([{
                state: 'known',
                primary: {
                    noteId: 55,
                    reps: 15,
                },
            }]);
            client.destroy();
        } finally {
            localStorage.clear();
            vi.unstubAllGlobals();
        }
    });

    it('trusts complete empty status indexes without AnkiConnect fallback', async () => {
        const fetchMock = vi.fn(async () => {
            throw new Error('complete empty status index should not call AnkiConnect');
        });
        vi.stubGlobal('fetch', fetchMock);
        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
        const now = Date.now();
        const internals = client as unknown as {
            statusIndex?: {
                version: number;
                settingsKey: string;
                syncedAt: number;
                checkedAt: number;
                cardCount: number;
                entryCount: number;
                readingKeys: boolean;
                entries: Record<string, never>;
            };
        };
        internals.statusIndex = {
            version: 1,
            settingsKey: JSON.stringify({ url: DEFAULT_SETTINGS.ankiConnectUrl || 'http://127.0.0.1:8765' }),
            syncedAt: now,
            checkedAt: now,
            cardCount: 0,
            entryCount: 0,
            readingKeys: true,
            entries: {},
        };

        try {
            await expect(client.findCachedStatusBatch([jpdbCard({ vid: 12, sid: 3, spelling: '字幕', reading: 'じまく' })])).resolves.toEqual([{
                state: 'not-in-deck',
                notes: [],
                primary: null,
            }]);
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            client.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('uses a batched exact lookup for missing status indexes without broad scans', async () => {
        vi.useFakeTimers();
        localStorage.clear();
        const ankiConnectUrl = `${window.location.origin}/anki-missing-status`;
        const actions: string[] = [];
        const fetchMock = exactStatusLookupFetchMock(actions, 'missing status index lookup should not scan deck:*');
        vi.stubGlobal('fetch', fetchMock);
        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiConnectUrl }));
        const internals = client as unknown as StatusIndexRefreshInternals;

        try {
            await expectMissingStatusLookupQueuesRefresh(
                client,
                jpdbCard({ vid: 13, sid: 4, spelling: '読む', reading: 'よむ' }),
                actions,
                internals,
            );
        } finally {
            client.destroy();
            localStorage.clear();
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });

    it('uses a batched exact lookup for status misses while a status index rebuild lease is active', async () => {
        vi.useFakeTimers();
        localStorage.clear();
        const ankiConnectUrl = `${window.location.origin}/anki-active-rebuild`;
        const settingsKey = JSON.stringify({ url: ankiConnectUrl });
        const actions: string[] = [];
        const fetchMock = activeRebuildExactStatusLookupFetchMock(actions);
        vi.stubGlobal('fetch', fetchMock);

        try {
            expect(claimAnkiStatusIndexRebuildLease(settingsKey)).toBeTruthy();
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiConnectUrl }));

            await expect(client.findCachedStatusBatch([
                jpdbCard({ vid: 13, sid: 4, spelling: '動画', reading: 'どうが' }),
            ])).resolves.toMatchObject([{
                state: 'due',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                    deckNames: ['Anime::Mining'],
                    reps: 16,
                },
            }]);
            expect(actions).toEqual(['multi', 'notesInfo', 'cardsInfo', 'areDue']);
            expect(actions).not.toContain('findCards:deck:*');
            client.destroy();
        } finally {
            localStorage.clear();
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });

    it('uses exact Anki status lookups for dirty indexed hits after mutations', async () => {
        vi.useFakeTimers();
        localStorage.clear();
        const ankiConnectUrl = `${window.location.origin}/anki-dirty-hit`;
        const settingsKey = JSON.stringify({ url: ankiConnectUrl });
        const now = Date.now();
        const actions: string[] = [];
        const fetchMock = activeRebuildExactStatusLookupFetchMock(actions);
        storeDirtyStatusIndex({
            settingsKey,
            checkedAt: now,
            dirtyAt: now - 1,
            updatedAt: now - 1,
        });
        vi.stubGlobal('fetch', fetchMock);
        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiConnectUrl }));

        try {
            await expect(client.findCachedStatusBatch([
                jpdbCard({ vid: 13, sid: 4, spelling: '動画', reading: 'どうが' }),
            ])).resolves.toMatchObject([{
                state: 'due',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                    deckNames: ['Anime::Mining'],
                    reps: 16,
                },
            }]);
            expect(actions).toEqual(['multi', 'notesInfo', 'cardsInfo', 'areDue']);
            expect(actions).not.toContain('findCards:deck:*');
        } finally {
            client.destroy();
            localStorage.clear();
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });

    it('uses a batched exact lookup for max-stale status misses without broad scans', async () => {
        vi.useFakeTimers();
        const ankiConnectUrl = `${window.location.origin}/anki-stale-status`;
        const actions: string[] = [];
        const fetchMock = exactStatusLookupFetchMock(actions, 'stale status miss lookup should not scan deck:*');
        vi.stubGlobal('fetch', fetchMock);
        const now = Date.now();
        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiConnectUrl }));
        const internals = client as unknown as StatusIndexRefreshInternals & {
            statusIndex?: {
                version: number;
                settingsKey: string;
                syncedAt: number;
                checkedAt: number;
                cardCount: number;
                entryCount: number;
                readingKeys: boolean;
                entries: Record<string, {
                    state: 'known';
                    noteId: number;
                    primaryCardId: number;
                    deckNames: string[];
                    reps: number;
                    lapses: number;
                    modelName: string;
                }>;
            };
        };
        internals.statusIndex = {
            version: 1,
            settingsKey: JSON.stringify({ url: ankiConnectUrl }),
            syncedAt: now - 31 * 60 * 1000,
            checkedAt: now,
            cardCount: 1,
            entryCount: 1,
            readingKeys: true,
            entries: {
                [String('動画').toLocaleLowerCase()]: {
                    state: 'known',
                    noteId: 55,
                    primaryCardId: 7701,
                    deckNames: ['Anime::Mining'],
                    reps: 14,
                    lapses: 0,
                    modelName: 'Imported Core',
                },
            },
        };

        try {
            await expectMissingStatusLookupQueuesRefresh(
                client,
                jpdbCard({ vid: 13, sid: 4, spelling: '難波', reading: 'なにわ' }),
                actions,
                internals,
            );
        } finally {
            client.destroy();
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });

    it('refreshes dirty indexed status hits from detailed lookups after Anki reviews without scanning the deck', async () => {
        localStorage.clear();
        const actions: string[] = [];
        const ankiConnectUrl = `${window.location.origin}/anki-dirty-status`;
        const dirtyAt = Date.now() - 1000;
        const settingsKey = JSON.stringify({ url: ankiConnectUrl });
        localStorage.setItem(ANKI_STATUS_INDEX_STORAGE_KEY, JSON.stringify({
            version: 1,
            settingsKey,
            syncedAt: 0,
            checkedAt: 0,
            dirtyAt,
            cardCount: 1,
            entryCount: 1,
            readingKeys: true,
            entries: {
                [String('動画').toLocaleLowerCase()]: {
                    state: 'due',
                    noteId: 55,
                    primaryCardId: 7701,
                    deckNames: ['Anime::Mining'],
                    reps: 14,
                    lapses: 0,
                    modelName: 'Imported Core',
                    updatedAt: dirtyAt - 1,
                },
            },
        }));
        const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            const body = parseMockAnkiAction(init);
            actions.push(body.action);
            const actionHandlers: Record<string, () => unknown> = {
                deckNames: () => ['Anime::Mining'],
                getDeckStats: () => ({ 1: { name: 'Anime::Mining', total_in_deck: 1 } }),
                findCards: () => { throw new Error('dirty status refresh should not scan deck:*'); },
                multi: () => (body.params?.actions ?? []).map(activeRebuildMultiActionResult),
                notesInfo: () => {
                    expect(body.params?.notes).toEqual([55]);
                    return [mockAnkiNoteInfo({ noteId: 55, word: '動画', reading: 'どうが', cardId: 7701 })];
                },
                cardsInfo: () => {
                    expect(body.params?.cards).toEqual([7701]);
                    return [mockAnkiCardInfo({
                        cardId: 7701,
                        noteId: 55,
                        deckName: 'Anime::Mining',
                        queue: 2,
                        type: 2,
                        reps: 15,
                    })];
                },
                areDue: () => [false],
            };
            return ankiJsonResponse(mockAnkiActionResult(body, actionHandlers));
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, ankiConnectUrl };
            const lookupCard = jpdbCard({ vid: 10, sid: 1, spelling: '動画', reading: 'どうが' });
            const client = new AnkiConnectClient(() => settings);
            await expect(client.findExistingCards(lookupCard)).resolves.toMatchObject({
                state: 'known',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                    reps: 15,
                },
            });
            expect(actions).toEqual(expect.arrayContaining(['multi', 'notesInfo', 'cardsInfo', 'areDue']));
            expect(actions).not.toContain('version');
            expect(actions).not.toContain('findCards');
            expect(actions).not.toContain('deckNames');
            expect(actions).not.toContain('getDeckStats');
            client.destroy();

            vi.unstubAllGlobals();
            vi.stubGlobal('fetch', vi.fn(async () => {
                throw new Error('refreshed dirty status hit should be served from storage');
            }));
            const persistedClient = new AnkiConnectClient(() => settings);
            await expect(persistedClient.findCachedStatusBatch([lookupCard])).resolves.toMatchObject([{
                state: 'known',
                primary: {
                    noteId: 55,
                    reps: 15,
                },
            }]);
            persistedClient.destroy();
        } finally {
            localStorage.clear();
            vi.unstubAllGlobals();
        }
    });
});


describe('Anki rendered card details', () => {
    it('renders stored fields instead of a pending state when rendered card HTML is blank', () => {
        const note = existingAnkiNote({
            fields: {
                Expression: '日本語',
                Meaning: 'Japanese language',
                Audio: '[sound:nihongo.mp3]',
            },
            renderedCards: [{ cardId: 123, deckName: 'Mining', question: ' ', answer: '' }],
        });
        const section = renderExistingAnkiSection(note);

        expect(section.querySelector('.jpdb-reader-anki-details-pending')).toBeNull();
        expect(section.querySelector('.jpdb-reader-anki-stored-fields')?.textContent).toContain('Japanese language');
        const audio = section.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"][data-anki-media-name="nihongo.mp3"]');
        expect(audio?.classList.contains('jpdb-reader-audio-control')).toBe(true);
        expect(audio?.querySelector('svg')).not.toBeNull();
        expect(audio?.getAttribute('aria-label')).toBe('Anki audio nihongo.mp3');
    });

    it('falls back to stored fields when a rendered card is only an empty template shell', () => {
        const note = existingAnkiNote({
            fields: {
                Expression: '泳ぐ',
                Reading: 'およぐ',
                Meaning: 'to swim',
            },
            renderedCards: [{
                cardId: 321,
                deckName: 'Sentence Mining',
                question: '<div class="card"><span class="front"></span></div><script>renderCard()</script>',
                answer: '<section><div></div></section>',
            }],
        });
        const section = renderExistingAnkiSection(note);

        expect(section.querySelector('.jpdb-reader-anki-rendered-card')).toBeNull();
        expect(section.querySelector('.jpdb-reader-anki-details-pending')).toBeNull();
        expect(section.querySelector('.jpdb-reader-anki-stored-fields')?.textContent).toContain('to swim');
    });

    it('keeps media-only rendered cards visible instead of falling back to fields', () => {
        const note = existingAnkiNote({
            fields: {
                Expression: '写真',
                Meaning: 'photo',
            },
            renderedCards: [{
                cardId: 654,
                deckName: 'Visual Mining',
                question: '<div><img src="photo.jpg" alt=""></div>',
                answer: '',
            }],
        });
        const section = renderExistingAnkiSection(note);

        expect(section.querySelector('.jpdb-reader-anki-rendered-card')).not.toBeNull();
        expect(section.querySelector('.jpdb-reader-anki-stored-fields')).toBeNull();
        expect(section.querySelector<HTMLImageElement>('img')?.dataset.ankiMediaName).toBe('photo.jpg');
    });

    it('turns literal sound markers in rendered card HTML into Anki audio controls', () => {
        const note = existingAnkiNote({
            fields: { Audio: '[sound:nihongo.mp3]' },
            renderedCards: [{
                cardId: 456,
                deckName: 'Mining',
                question: '<div>日本語 [sound:nihongo.mp3]</div>',
                answer: '<span>Japanese language</span>',
            }],
        });
        const section = renderExistingAnkiSection(note);
        const renderedBody = section.querySelector<HTMLElement>('.jpdb-reader-anki-rendered-side-body');
        const audio = renderedBody?.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"][data-anki-media-name="nihongo.mp3"]');

        expect(renderedBody?.textContent).not.toContain('[sound:nihongo.mp3]');
        expect(audio?.textContent?.trim()).toBe('');
        expect(audio?.querySelector('svg')).not.toBeNull();
        expect(audio?.title).toBe('Anki audio nihongo.mp3');
        expect(audio?.getAttribute('aria-label')).toBe('Anki audio nihongo.mp3');
    });

    it('renders multiple Anki cards as collapsible separators while preserving card content', () => {
        const note = existingAnkiNote({
            primaryCardId: 456,
            cardIds: [123, 456],
            renderedCards: [
                { cardId: 123, deckName: 'Mining', question: '<div>日本語</div>', answer: '<div>Japanese</div>' },
                { cardId: 456, deckName: 'Mining', question: '<div>Japanese</div>', answer: '<div>日本語</div>' },
            ],
        });
        const section = renderExistingAnkiSection(note);
        const renderedCards = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-card')];
        const summaries = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-card-title')];

        expect(renderedCards).toHaveLength(2);
        expect(renderedCards.map(element => element.dataset.ankiRenderedCardId)).toEqual(['456', '123']);
        expectFirstRenderedAnkiCardOpen(renderedCards);
        expect(summaries).toHaveLength(2);
        expect(section.querySelector('.jpdb-reader-anki-rendered-side-body')?.textContent).toContain('Japanese');
    });

    it('keeps Anki card template names from card details for duplicate targets', () => {
        const note = ankiExistingNoteFromInfo({
            noteId: 201,
            modelName: 'Sentence Mining',
            tags: [],
            cards: [456],
            fields: {
                Expression: { value: '日本語' },
                Reading: { value: 'にほんご' },
                Meaning: { value: 'Japanese language' },
            },
        }, [{
            cardId: 456,
            deckName: 'Mining',
            card: 'Production',
            ord: 1,
            queue: 2,
            type: 2,
            note: 201,
            question: '<div>日本語</div>',
            answer: '<div>Japanese language</div>',
        }]);

        expect(note.renderedCards?.[0]).toMatchObject({
            cardId: 456,
            deckName: 'Mining',
            cardName: 'Production',
        });
    });

    it('ranks notes tagged yomu-never-forget as never-forget regardless of queue state', () => {
        const dueCard = {
            cardId: 456,
            deckName: 'Mining',
            card: 'Recognition',
            ord: 0,
            // a due review-queue card would normally rank the note 'due'
            queue: 2,
            type: 2,
            due: 0,
            note: 201,
            question: '<div>日本語</div>',
            answer: '<div>Japanese</div>',
        };
        const noteInfo = {
            noteId: 201,
            modelName: 'Sentence Mining',
            cards: [456],
            fields: { Expression: { value: '日本語' } },
        };

        const tagged = ankiExistingNoteFromInfo({ ...noteInfo, tags: ['yomu-never-forget'] }, [dueCard]);
        expect(tagged.state).toBe('never-forget');

        const untagged = ankiExistingNoteFromInfo({ ...noteInfo, tags: ['other'] }, [dueCard]);
        expect(untagged.state).not.toBe('never-forget');
    });

    it('uses Anki template names in collapsible card headings and grade target labels', () => {
        const note = existingAnkiNote({
            primaryCardId: 456,
            cardIds: [123, 456],
            renderedCards: [
                { cardId: 123, deckName: 'Mining', cardName: 'Recognition', question: '<div>日本語</div>', answer: '<div>Japanese</div>' },
                { cardId: 456, deckName: 'Mining', cardName: 'Production', question: '<div>Japanese</div>', answer: '<div>日本語</div>' },
            ],
        });
        const section = renderExistingAnkiSection(note, { ...ankiRenderSettings(), enableReviews: true });
        const titles = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-card-title')]
            .map(element => element.textContent?.trim());
        const target = section.querySelector<HTMLElement>('.jpdb-reader-review-target');
        const easy = section.querySelector<HTMLButtonElement>('[data-grade="easy"]');

        expect(titles).toEqual(['Mining · Production', 'Mining · Recognition']);
        expect(target?.textContent).toBe('Grades Anki card: Mining · Production #456');
        expect(easy?.dataset.ankiCardId).toBe('456');
        expect(easy?.getAttribute('aria-label')).toBe('Easy: Grades Anki card: Mining · Production #456');
    });

    it('caps oversized Anki inline font declarations without flattening normal card text', () => {
        const note = existingAnkiNote({
            renderedCards: [{
                cardId: 789,
                deckName: 'Mining',
                question: '<div style="font-size: 96px">Big</div><p style="font: italic 700 72px/1.2 serif">Huge</p><span>Normal</span>',
                answer: '',
            }],
        });
        const section = renderExistingAnkiSection(note);
        const body = section.querySelector<HTMLElement>('.jpdb-reader-anki-rendered-side-body')!;
        const shorthand = body.querySelector<HTMLElement>('p')?.getAttribute('style') ?? '';

        expect(body.innerHTML).toContain('font-size: 30px');
        expect(shorthand).toMatch(/font:\s*italic\s+700\s+30px\/1\.2\s+serif/i);
        expect(body.innerHTML).not.toContain('96px');
        expect(body.innerHTML).not.toContain('72px');
        expect(body.textContent).toContain('Normal');
    });

    it('does not duplicate Anki fronts when an answer already contains the question', () => {
        const note = existingAnkiNote({
            modelName: 'RRTK Recognition Remembering The Kanji v2',
            deckNames: ['RRTK Recognition Remembering The Kanji v2'],
            fields: {
                Kanji: '読',
                Keyword: 'read',
                Story: "People will say almost anything to sell you something; don't believe everything you read.",
            },
            renderedCards: [{
                cardId: 1300,
                deckName: 'RRTK Recognition Remembering The Kanji v2',
                question: '<div class="rtk-kanji" style="font-size: 96px">読 読</div><div class="rtk-kanji" style="font-size: 96px">読 読</div>',
                answer: '<div class="rtk-kanji" style="font-size: 96px">読 読</div><div class="rtk-kanji" style="font-size: 96px">読 読</div><hr><strong>read</strong><p>People will say almost anything to <em>sell</em> you something; do not believe everything you <strong>read</strong>.</p>',
            }],
        });
        const section = renderExistingAnkiSection(note);
        const bodies = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-side-body')];

        expect(bodies).toHaveLength(1);
        expect(bodies[0]?.textContent).toContain('read');
        expect(bodies[0]?.innerHTML).not.toContain('96px');
        expect(section.querySelector('.jpdb-reader-anki-existing > summary')?.textContent).toContain('RRTK Recognition Remembering The Kanji v2');
    });

    it('keeps Core-style Anki card media and audio distinct from lookup audio', () => {
        const note = existingAnkiNote({
            modelName: 'Core 2k/6k Optimized Japanese Vocabulary',
            deckNames: ['Vocab 2k'],
            fields: {
                Expression: '始める',
                Reading: 'はじめる',
                Meaning: 'to start',
                Audio: '[sound:core-start.mp3]',
            },
            renderedCards: [{
                cardId: 2050,
                deckName: 'Vocab 2k',
                question: '<div class="expression">始める</div><button>[sound:core-start.mp3]</button><img src="start.jpg">',
                answer: '<div class="expression">始める</div><button>[sound:core-start.mp3]</button><img src="start.jpg"><hr><div>Please start the test.</div>',
                mediaDataUrls: {
                    'start.jpg': 'data:image/jpeg;base64,start',
                },
            }],
        });
        const section = renderExistingAnkiSection(note);
        const body = section.querySelector<HTMLElement>('.jpdb-reader-anki-rendered-side-body')!;

        expect(body.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"][data-anki-media-name="core-start.mp3"]')).not.toBeNull();
        expect(body.querySelector<HTMLImageElement>('img')?.src).toBe('data:image/jpeg;base64,start');
        expect(body.textContent).toContain('Please start the test.');
        expect(section.textContent).not.toContain('WORD AUDIO');
    });

    it('summarizes multiple existing Anki matches by deck model kind and status', () => {
        const word = existingAnkiNote({
            noteId: 101,
            modelName: 'Core 2k',
            deckNames: ['Vocab 2k'],
            state: 'due',
            reps: 12,
        });
        const kanji = existingAnkiNote({
            noteId: 102,
            modelName: 'RRTK Recognition',
            deckNames: ['RRTK'],
            state: 'new',
            fields: {
                Kanji: '下',
                On: 'カ',
                Keyword: 'below',
            },
            reps: 0,
        });
        const lookup: AnkiLookupResult = { state: 'due', primary: word, notes: [word, kanji], trusted: true };
        const container = document.createElement('div');
        container.innerHTML = renderAnkiExistingSection(lookup, null, ankiRenderSettings());

        const summary = container.querySelector<HTMLElement>('.jpdb-reader-anki-match-summary');
        expect(summary?.textContent).toContain('Vocab 2k · Core 2k · Word');
        expect(summary?.textContent).toContain('RRTK · RRTK Recognition · Kanji');
        expect(summary?.textContent).toContain('Due');
        expect(summary?.textContent).toContain('New');
    });

    it('threads persisted collapse state through the Anki section and per-deck cards', () => {
        const word = existingAnkiNote({ noteId: 201, modelName: 'Core 2k', deckNames: ['Vocab 2k'], state: 'due' });
        const kanji = existingAnkiNote({ noteId: 202, modelName: 'RRTK', deckNames: ['RRTK'], state: 'new', fields: { Kanji: '下', Keyword: 'below' } });
        const lookup: AnkiLookupResult = { state: 'due', primary: word, notes: [word, kanji], trusted: true };
        const container = document.createElement('div');
        container.innerHTML = renderAnkiExistingSection(lookup, null, ankiRenderSettings(), {
            sourceAttributes: (key, open) => `data-source-state-key="${key}" data-source-initial-open="${String(open ?? true)}"${(open ?? true) ? ' open' : ''}`,
        });

        const section = container.querySelector<HTMLElement>('.jpdb-reader-anki-existing');
        expect(section?.dataset.sourceStateKey).toBe('__anki__');
        const deckKeys = Array.from(container.querySelectorAll<HTMLElement>('.jpdb-reader-anki-existing-note'))
            .map(card => card.dataset.sourceStateKey);
        expect(deckKeys).toContain('__anki__:deck:Vocab 2k');
        expect(deckKeys).toContain('__anki__:deck:RRTK');
    });

    it('uses the aggregate Anki status in the section header when one duplicate is known', () => {
        const newMatch = existingAnkiNote({
            noteId: 101,
            modelName: 'Core 2k',
            deckNames: ['Vocab 2k'],
            state: 'new',
            reps: 0,
        });
        const knownMatch = existingAnkiNote({
            noteId: 102,
            modelName: 'Yomu Japanese',
            deckNames: ['Yomu'],
            state: 'known',
            reps: 12,
        });
        const lookup: AnkiLookupResult = { state: 'known', primary: newMatch, notes: [newMatch, knownMatch], trusted: true };
        const container = document.createElement('div');
        container.innerHTML = renderAnkiExistingSection(lookup, null, ankiRenderSettings());

        const header = container.querySelector<HTMLElement>('.jpdb-reader-anki-existing > summary');
        const matches = container.querySelector<HTMLElement>('.jpdb-reader-anki-match-summary');
        expect(header?.querySelector('.jpdb-reader-state-dot')?.className).toContain('anki-known');
        expect(header?.textContent).toContain('Known');
        expect(header?.textContent).toContain('2 matches');
        expect(matches?.textContent).toContain('New');
        expect(matches?.textContent).toContain('Known');
    });
});

function renderExistingAnkiSection(note: AnkiExistingNote, settings: ReaderSettings = ankiRenderSettings()): HTMLElement {
    return renderExistingAnkiNote(note, settings);
}

function ankiRenderSettings(): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        ankiEnabled: true,
        ankiSectionEnabled: true,
        enableReviews: false,
    };
}


function jpdbCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 1,
        sid: 0,
        rid: 0,
        spelling: '日本語',
        reading: 'にほんご',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{ glosses: ['Japanese language'], partOfSpeech: [] }],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'local',
        ...overrides,
    };
}

describe('Anki computed next-review previews', () => {
    it('computes Hard/Good/Easy previews for review cards the way Anki answer buttons do', () => {
        const card = { cardId: 1, queue: 2, type: 2, interval: 10, factor: 2500 } as never as Parameters<typeof applyComputedAnkiNextReviews>[0];
        applyComputedAnkiNextReviews(card);
        // Hard 10x1.2=12d, Good 10x2.5=25d, Easy 25x1.3=32.5d -> ~1.1mo
        expect(card.buttons).toEqual([2, 3, 4]);
        expect(card.nextReviews).toEqual(['12d', '25d', '1.1mo']);
        // ...and the grade-bar extraction maps them onto grades.
        const intervals = reviewGradeIntervalsFromAnkiCards([card as never]);
        expect(intervals?.okay?.buttonLabel ?? intervals?.okay?.intervalLabel ?? JSON.stringify(intervals)).toBeTruthy();
    });

    it('never invents intervals for learning or new cards', () => {
        const learning = { cardId: 2, queue: 1, type: 1, interval: 0, factor: 0 } as never as Parameters<typeof applyComputedAnkiNextReviews>[0];
        applyComputedAnkiNextReviews(learning);
        expect(learning.nextReviews).toBeUndefined();
        const fresh = { cardId: 3, queue: 0, type: 0 } as never as Parameters<typeof applyComputedAnkiNextReviews>[0];
        applyComputedAnkiNextReviews(fresh);
        expect(fresh.nextReviews).toBeUndefined();
    });

    it('keeps provider-sent nextReviews untouched', () => {
        const card = { cardId: 4, queue: 2, type: 2, interval: 10, factor: 2500, nextReviews: ['<10m', '12d', '25d', '1.2mo'] } as never as Parameters<typeof applyComputedAnkiNextReviews>[0];
        applyComputedAnkiNextReviews(card);
        expect(card.nextReviews).toEqual(['<10m', '12d', '25d', '1.2mo']);
        expect(card.buttons).toBeUndefined();
    });
});

describe('popover review-button intervals', () => {
    it('shows due-in previews on the grade row when intervals are provided (Jiten/Anki parity)', () => {
        const html = renderReviewButtons({ ...DEFAULT_SETTINGS, ankiEnabled: true }, null, {
            targetLabel: 'Anki',
            intervals: {
                okay: { buttonLabel: '25d' },
                easy: { buttonLabel: '1.1mo' },
            } as never,
        });
        expect(html).toContain('jpdb-reader-grade-interval');
        expect(html).toContain('25d');
        expect(html).toContain('1.1mo');
    });

    it('renders plain buttons when no intervals exist', () => {
        const html = renderReviewButtons({ ...DEFAULT_SETTINGS, ankiEnabled: true }, null, { targetLabel: 'JPDB' });
        expect(html).not.toContain('jpdb-reader-grade-interval');
    });
});

describe('Anki new-card step previews', () => {
    it('derives Again/Hard/Good/Easy for unseen cards from the deck learning steps', async () => {
        const invoke = vi.fn(async (action: string) => {
            if (action === 'getDeckConfig') return { new: { delays: [1, 10], ints: [1, 4] } };
            throw new Error(`unexpected ${action}`);
        });
        const card = { cardId: 1, deckName: 'Core', queue: 0, type: 0 } as never;
        await applyNewCardStepPreviews({ invoke } as never, [card]);
        expect((card as { nextReviews?: string[] }).nextReviews).toEqual(['<1m', '<6m', '<10m', '4d']);
        expect((card as { buttons?: number[] }).buttons).toEqual([1, 2, 3, 4]);
        // One config fetch per distinct deck.
        expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('omits Hard with a single learning step and never touches non-new cards', async () => {
        const invoke = vi.fn(async () => ({ new: { delays: [10], ints: [3, 5] } }));
        const fresh = { cardId: 2, deckName: 'Mining', queue: 0, type: 0 } as never;
        const review = { cardId: 3, deckName: 'Mining', queue: 2, type: 2, interval: 10, factor: 2500, nextReviews: ['12d'] } as never;
        await applyNewCardStepPreviews({ invoke } as never, [fresh, review]);
        expect((fresh as { nextReviews?: string[] }).nextReviews).toEqual(['<10m', '3d', '5d']);
        expect((fresh as { buttons?: number[] }).buttons).toEqual([1, 3, 4]);
        expect((review as { nextReviews?: string[] }).nextReviews).toEqual(['12d']);
    });
});

describe('field-scoped Anki candidate lookup', () => {
    function lookupClient(mapping: Record<string, string> | undefined, findNotesByQuery: (query: string) => number[]) {
        const queries: string[] = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ data }: { data: string }) => {
                const request = JSON.parse(data) as { action: string; params: { actions?: Array<{ action: string; params: { query: string } }> } };
                let result: unknown = null;
                if (request.action === 'multi') {
                    result = (request.params.actions ?? []).map(action => {
                        queries.push(action.params.query);
                        return { result: findNotesByQuery(action.params.query), error: null };
                    });
                }
                return Promise.resolve({ status: 200, response: { result, error: null } });
            },
        });
        const client = new AnkiConnectClient(() => ({
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiModel: 'Kaishi 1.5k',
            ankiMobileHandoff: false,
            ...(mapping ? { ankiFieldMappings: { 'Kaishi 1.5k': mapping } } : {}),
        }));
        return { client, queries };
    }

    it('searches mapped expression/reading fields first and skips the raw probe on a hit', async () => {
        const { client, queries } = lookupClient({ expression: 'Word', reading: 'Kana' }, query => query.includes('Word:') ? [11] : [99]);
        const internals = client as unknown as { findCandidateNoteIdsByLookupKey(groups: Array<{ cacheKey: string; card: JPDBCard }>): Promise<Map<string, Set<number>>> };
        const result = await internals.findCandidateNoteIdsByLookupKey([{ cacheKey: 'k1', card: jpdbCard({ spelling: '読む', reading: 'よむ' }) }]);
        expect([...result.get('k1')!]).toEqual([11]);
        expect(queries.every(query => query.includes('Word:') || query.includes('Kana:'))).toBe(true);
        client.destroy();
        vi.unstubAllGlobals();
    });

    it('falls back to the raw-term probe only when field-scoped search finds nothing', async () => {
        const { client, queries } = lookupClient({ expression: 'Word', reading: 'Kana' }, query => query.includes(':') ? [] : [42]);
        const internals = client as unknown as { findCandidateNoteIdsByLookupKey(groups: Array<{ cacheKey: string; card: JPDBCard }>): Promise<Map<string, Set<number>>> };
        const result = await internals.findCandidateNoteIdsByLookupKey([{ cacheKey: 'k1', card: jpdbCard({ spelling: '読む', reading: 'よむ' }) }]);
        expect([...result.get('k1')!]).toEqual([42]);
        // raw probes ran after the scoped ones
        expect(queries.some(query => !query.includes(':'))).toBe(true);
        client.destroy();
        vi.unstubAllGlobals();
    });

    it('keeps the raw probe as the only pass when no mapping exists', async () => {
        const { client, queries } = lookupClient(undefined, () => [7]);
        const internals = client as unknown as { findCandidateNoteIdsByLookupKey(groups: Array<{ cacheKey: string; card: JPDBCard }>): Promise<Map<string, Set<number>>> };
        const result = await internals.findCandidateNoteIdsByLookupKey([{ cacheKey: 'k1', card: jpdbCard({ spelling: '読む', reading: 'よむ' }) }]);
        expect([...result.get('k1')!]).toEqual([7]);
        expect(queries.every(query => !query.includes('Word:'))).toBe(true);
        client.destroy();
        vi.unstubAllGlobals();
    });
});

describe('incremental status-index refresh (edited-card mod-time sweep)', () => {
    type RefreshInternals = {
        statusIndexEditedSinceSync(index: unknown, now: number): Promise<boolean>;
        refreshStatusIndexFromCollectionCount(index: unknown, needsReadingKeyRefresh: boolean, now: number, options: Record<string, unknown>): Promise<{ handled: boolean; index: { syncedAt: number; dirtyAt?: number } | null }>;
    };

    function sweepClient(handlers: Record<string, (params: Record<string, unknown>) => unknown>) {
        const actions: string[] = [];
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ data }: { data: string }) => {
                const request = JSON.parse(data) as { action: string; params: Record<string, unknown> };
                actions.push(request.action);
                const handler = handlers[request.action];
                if (!handler) return Promise.resolve({ status: 200, response: { result: null, error: `unsupported: ${request.action}` } });
                return Promise.resolve({ status: 200, response: { result: handler(request.params), error: null } });
            },
        });
        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }));
        return { client, actions };
    }

    function countCurrentIndex(now: number, cardCount = 1) {
        return {
            settingsKey: 'k',
            version: 1,
            entries: {},
            entryCount: 0,
            cardCount,
            syncedAt: now - 60_000,
            checkedAt: now - 1,
            updatedAt: now - 60_000,
        };
    }

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reports edits when a recently-edited card moved after the last sync', async () => {
        const now = Date.now();
        const { client, actions } = sweepClient({
            findCards: () => [3001],
            cardsModTime: () => [{ cardId: 3001, mod: Math.floor(now / 1000) }],
        });
        const internals = client as unknown as RefreshInternals;
        await expect(internals.statusIndexEditedSinceSync(countCurrentIndex(now), now)).resolves.toBe(true);
        expect(actions).toEqual(['findCards', 'cardsModTime']);
        client.destroy();
    });

    it('stays quiet with no edited cards and skips the mod-time call', async () => {
        const now = Date.now();
        const { client, actions } = sweepClient({ findCards: () => [] });
        const internals = client as unknown as RefreshInternals;
        await expect(internals.statusIndexEditedSinceSync(countCurrentIndex(now), now)).resolves.toBe(false);
        expect(actions).toEqual(['findCards']);
        client.destroy();
    });

    it('falls back to the count gate when cardsModTime is unsupported', async () => {
        const now = Date.now();
        const { client } = sweepClient({ findCards: () => [3001] });
        const internals = client as unknown as RefreshInternals;
        await expect(internals.statusIndexEditedSinceSync(countCurrentIndex(now), now)).resolves.toBe(false);
        client.destroy();
    });

    it('dirties a count-current index when the sweep finds same-count edits', async () => {
        const now = Date.now();
        const { client } = sweepClient({
            getDeckStats: () => ({ 1: { name: 'Mining', total_in_deck: 1 } }),
            deckNames: () => ['Mining'],
            findCards: () => [3001],
            cardsModTime: () => [{ cardId: 3001, mod: Math.floor(now / 1000) }],
        });
        const internals = client as unknown as RefreshInternals;
        const decision = await internals.refreshStatusIndexFromCollectionCount(countCurrentIndex(now), false, now, {});
        // handled:false hands the dirty index to the rebuild path.
        expect(decision.handled).toBe(false);
        expect(decision.index?.syncedAt).toBe(0);
        expect(decision.index?.dirtyAt).toBe(now);
        client.destroy();
    });
});

describe('AnkiConnect media data-url cache', () => {
    it('serves repeat media requests from the filename cache (one retrieveMediaFile)', async () => {
        const requests = stubGmAnkiConnect({ retrieveMediaFile: 'YXVkaW8=' });
        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }));

        const first = await client.mediaFileDataUrl('yomu.mp3');
        const second = await client.mediaFileDataUrl(' yomu.mp3 ');

        expect(first).toBe('data:audio/mpeg;base64,YXVkaW8=');
        expect(second).toBe(first);
        expect(requests.filter(request => request.action === 'retrieveMediaFile')).toHaveLength(1);
    });

    it('does not cache media failures, so a retry can succeed', async () => {
        let calls = 0;
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ data }: { data: string }) => {
                JSON.parse(data);
                calls += 1;
                return Promise.resolve({ status: 200, response: { result: calls === 1 ? false : 'YXVkaW8=', error: null } });
            },
        });
        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }));

        await expect(client.mediaFileDataUrl('retry.mp3')).rejects.toThrow();
        await expect(client.mediaFileDataUrl('retry.mp3')).resolves.toBe('data:audio/mpeg;base64,YXVkaW8=');
        expect(calls).toBe(2);
    });
});
