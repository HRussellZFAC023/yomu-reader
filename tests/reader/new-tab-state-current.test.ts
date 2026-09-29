import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NEW_TAB_UI_STATE, createNewTabStateChannel, loadNewTabUiState, saveNewTabUiState } from '../../src/reader/newtab/state';

const KEY = 'jpdb-reader-newtab-ui';

describe('current Study view state', () => {
    beforeEach(() => localStorage.removeItem(KEY));
    afterEach(() => { localStorage.removeItem(KEY); vi.unstubAllGlobals(); });

    it('round-trips current view choices without persisting a revealed answer', () => {
        saveNewTabUiState({ ...DEFAULT_NEW_TAB_UI_STATE, route: 'search', sort: 'frequency', jpdbDeck: 'chosen', revealAnswer: true });
        expect(loadNewTabUiState()).toEqual({ ...DEFAULT_NEW_TAB_UI_STATE, route: 'search', sort: 'frequency', jpdbDeck: 'chosen' });
    });

    it.each(['word', 'kanji', 'recall', 'listen', 'search', 'stats'])('does not recover the obsolete %s mode', mode => {
        const old = { mode, listenSubMode: 'shadow', source: 'dictionary', sort: 'frequency', revealAnswer: true };
        localStorage.setItem(KEY, JSON.stringify(old));
        expect(loadNewTabUiState()).toEqual(DEFAULT_NEW_TAB_UI_STATE);
        expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(old);
    });

    it.each([{ mode: 'kanji' }, { listenSubMode: 'shadow' }])('rejects a current route carrying obsolete fields %j', obsolete => {
        localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT_NEW_TAB_UI_STATE, route: 'search', ...obsolete }));
        expect(loadNewTabUiState()).toEqual(DEFAULT_NEW_TAB_UI_STATE);
    });

    it('ignores obsolete broadcasts while accepting current view updates', () => {
        let receive!: (event: MessageEvent) => void;
        vi.stubGlobal('BroadcastChannel', class {
            set onmessage(handler: (event: MessageEvent) => void) { receive = handler; }
            postMessage() {}
            close() {}
        });
        const adopt = vi.fn();
        const channel = createNewTabStateChannel(adopt);
        receive(new MessageEvent('message', { data: { type: 'state', state: { mode: 'listen', source: 'dictionary' } } }));
        receive(new MessageEvent('message', { data: { type: 'state', state: { ...DEFAULT_NEW_TAB_UI_STATE, mode: 'kanji' } } }));
        receive(new MessageEvent('message', { data: { type: 'state', state: { ...DEFAULT_NEW_TAB_UI_STATE, listenSubMode: 'shadow' } } }));
        expect(adopt).not.toHaveBeenCalled();
        receive(new MessageEvent('message', { data: { type: 'state', state: { ...DEFAULT_NEW_TAB_UI_STATE, route: 'stats' } } }));
        expect(adopt).toHaveBeenCalledOnce();
        const { revealAnswer: _localAnswer, ...shared } = DEFAULT_NEW_TAB_UI_STATE;
        expect(adopt).toHaveBeenCalledWith({ ...shared, route: 'stats' });
        channel.close();
    });
});
