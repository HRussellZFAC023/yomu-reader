import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../src/reader/companions/settings-surface';
import { ReaderApp } from '../../src/reader/app/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { CardState, JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';

// Minimal surface of ReaderApp internals the backfill (Cluster I1) touches.
interface BackfillInternals {
    settings: ReaderSettings;
    jiten: { parse: (surfaces: string[]) => Promise<JPDBToken[][]> };
    knownStateBackfillTimer?: number;
    runReaderKnownStateBackfill(): Promise<void>;
    scheduleReaderKnownStateBackfill(): void;
    handleAutoScanVisibilityChange(): void;
}

// A provisional word as the LOCAL parser fallback renders it: a negative hash id
// and data-state-provenance="provisional". Only an authenticated surface parse
// can resolve its real Jiten state.
function provisionalLocalWord(id: number, surface: string): HTMLElement {
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word jpdb-not-in-deck local-not-in-deck';
    word.dataset.vid = String(id);
    word.dataset.sid = String(id);
    word.dataset.cardSource = 'local';
    word.dataset.cardState = 'not-in-deck';
    word.dataset.stateProvenance = 'provisional';
    word.dataset.expression = surface;
    word.textContent = surface;
    return word;
}

// A parsed authenticated Jiten card for `surface` carrying real known-state.
function jitenCard(wordId: number, surface: string, state: CardState): JPDBCard {
    return {
        vid: wordId,
        sid: 0,
        rid: 0,
        spelling: surface,
        reading: surface,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: [state],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
        reviewSource: 'jiten-api',
        jitenWordId: wordId,
        jitenReadingIndex: 0,
    };
}

function makeApp(stateBySurface: Record<string, { wordId: number; state: CardState }>) {
    const app = new ReaderApp() as unknown as BackfillInternals;
    app.settings = { ...DEFAULT_SETTINGS, jitenApiKey: 'ak_test_key' };
    const parse = vi.fn(async (surfaces: string[]): Promise<JPDBToken[][]> => surfaces.map(surface => {
        const hit = stateBySurface[surface];
        if (!hit) return [];
        return [{
            card: jitenCard(hit.wordId, surface, hit.state),
            start: 0,
            end: surface.length,
            length: surface.length,
            rubies: [],
            pitchClass: '',
            sentence: surface,
        }];
    }));
    app.jiten = { parse };
    return { app, parse };
}

function setHidden(hidden: boolean): void {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

afterEach(() => {
    document.body.innerHTML = '';
    setHidden(false);
    vi.restoreAllMocks();
});

describe('known-state backfill (Cluster I1)', () => {
    it('upgrades provisional words — including one inside an additive text mirror — with the authenticated state', async () => {
        const { app, parse } = makeApp({
            読む: { wordId: 1001, state: 'known' },
            書く: { wordId: 1002, state: 'learning' },
        });

        const prose = document.createElement('p');
        prose.appendChild(provisionalLocalWord(-11, '読む'));
        document.body.appendChild(prose);

        // A mirror word: the additive text mirror overlays a framework label.
        const mirror = document.createElement('span');
        mirror.className = 'jpdb-reader-text-mirror jpdb-reader-additive-text-mirror';
        mirror.appendChild(provisionalLocalWord(-22, '書く'));
        document.body.appendChild(mirror);

        await app.runReaderKnownStateBackfill();

        expect(parse).toHaveBeenCalledTimes(1);
        expect([...parse.mock.calls[0][0]].sort()).toEqual(['書く', '読む']);

        const prosework = document.querySelector<HTMLElement>('p .jpdb-reader-word')!;
        expect(prosework.dataset.cardState).toBe('known');
        expect(prosework.classList.contains('jiten-known')).toBe(true);
        expect(prosework.classList.contains('jpdb-known')).toBe(true);
        expect(prosework.classList.contains('local-not-in-deck')).toBe(false);
        expect(prosework.dataset.stateProvenance).toBe('authoritative');
        // Identity was upgraded to the real Jiten ids so grading can reach it.
        expect(prosework.dataset.vid).toBe('1001');
        expect(prosework.dataset.cardSource).toBe('jiten');

        const mirrorWord = document.querySelector<HTMLElement>('.jpdb-reader-additive-text-mirror .jpdb-reader-word')!;
        expect(mirrorWord.dataset.cardState).toBe('learning');
        expect(mirrorWord.classList.contains('jiten-learning')).toBe(true);
        expect(mirrorWord.dataset.stateProvenance).toBe('authoritative');
        expect(mirrorWord.dataset.vid).toBe('1002');
    });

    it('does not re-request a surface whose authenticated state resolved to not-in-deck', async () => {
        const { app, parse } = makeApp({ 見る: { wordId: 1003, state: 'not-in-deck' } });
        document.body.appendChild(provisionalLocalWord(-33, '見る'));

        await app.runReaderKnownStateBackfill();
        expect(parse).toHaveBeenCalledTimes(1);

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        // Genuine authenticated not-in-deck: marked authoritative so it leaves
        // the provisional pool and is never looked up again.
        expect(word.dataset.stateProvenance).toBe('authoritative');

        await app.runReaderKnownStateBackfill();
        expect(parse).toHaveBeenCalledTimes(1);
    });

    it('never re-requests a surface already parsed this URL even if a fresh provisional word appears', async () => {
        const { app, parse } = makeApp({ 話す: { wordId: 1004, state: 'known' } });
        document.body.appendChild(provisionalLocalWord(-44, '話す'));

        await app.runReaderKnownStateBackfill();
        expect(parse).toHaveBeenCalledTimes(1);

        // A recycler re-renders the same surface as a fresh provisional word: no
        // second parse, but the new word is still upgraded from the resolved-card
        // cache so the status does not vanish on re-render.
        const recycled = provisionalLocalWord(-45, '話す');
        document.body.appendChild(recycled);
        await app.runReaderKnownStateBackfill();
        expect(parse).toHaveBeenCalledTimes(1);
        expect(recycled.dataset.cardState).toBe('known');
        expect(recycled.dataset.stateProvenance).toBe('authoritative');
    });

    it('clears its pending timer on hide and refuses to schedule while hidden (zero-timer idle)', () => {
        const { app } = makeApp({});
        document.body.appendChild(provisionalLocalWord(-55, '来る'));

        app.scheduleReaderKnownStateBackfill();
        // Node's setTimeout returns a Timeout object; assert a handle exists.
        expect(app.knownStateBackfillTimer).toBeDefined();

        setHidden(true);
        app.handleAutoScanVisibilityChange();
        expect(app.knownStateBackfillTimer).toBeUndefined();

        // A schedule attempt while hidden is a no-op — nothing re-arms.
        app.scheduleReaderKnownStateBackfill();
        expect(app.knownStateBackfillTimer).toBeUndefined();
    });

    it('does nothing without an authenticated Jiten session', async () => {
        const { app, parse } = makeApp({ 出る: { wordId: 1005, state: 'known' } });
        app.settings = { ...DEFAULT_SETTINGS, jitenApiKey: '', apiKey: '' };
        document.body.appendChild(provisionalLocalWord(-66, '出る'));

        await app.runReaderKnownStateBackfill();
        expect(parse).not.toHaveBeenCalled();
    });
});
