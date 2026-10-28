import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JPDBCard } from '../../src/reader/app/types';
import { ensureManagedWebStorageCurrent, managedLocalStorage } from '../../src/reader/app/storage';
import {
    cardWithRememberedReading,
    forgetRememberedReadingsForTests,
    rememberReading,
} from '../../src/reader/dictionaries/jiten-reading-memory';

const STORAGE_KEY = 'yomu:jiten-readings:v1';

const sparse: JPDBCard = {
    vid: 1464530,
    sid: 0,
    rid: 0,
    spelling: '日本語',
    reading: '',
    frequencyRank: null,
    partOfSpeech: [],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: [],
    wordWithReading: null,
    source: 'jiten',
    jitenWordId: 1464530,
    jitenReadingIndex: 0,
};
const read: JPDBCard = { ...sparse, reading: 'にほんご', wordWithReading: '日本[にほん]語[ご]', pitchAccent: ['LHHH'], partOfSpeech: ['n'], frequencyRank: 1500 };

// A new page: its memory is whatever storage holds.
function nextPage(): void {
    forgetRememberedReadingsForTests({ keepStored: true });
}

beforeEach(async () => {
    await ensureManagedWebStorageCurrent();
    forgetRememberedReadingsForTests();
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    forgetRememberedReadingsForTests();
});

describe('Reading Memory', () => {
    it('gives a word read on one page its reading on the next, by word id', async () => {
        expect(cardWithRememberedReading(sparse)).toBeNull();
        rememberReading(read);
        vi.advanceTimersByTime(2_000);

        nextPage();
        expect(cardWithRememberedReading(sparse)).toMatchObject({
            reading: 'にほんご',
            wordWithReading: '日本[にほん]語[ご]',
            pitchAccent: ['LHHH'],
            frequencyRank: 1500,
        });
        expect(cardWithRememberedReading({ ...sparse, jitenReadingIndex: 1 })).toBeNull();
    });

    it('forgets a reading after thirty days', async () => {
        rememberReading(read);
        vi.advanceTimersByTime(2_000);
        vi.setSystemTime(Date.now() + 31 * 86_400_000);

        nextPage();
        expect(cardWithRememberedReading(sparse)).toBeNull();
    });

    it('keeps nothing for a card without a reading or an id', async () => {
        rememberReading(sparse);
        rememberReading({ ...read, vid: -4, jitenWordId: undefined });
        vi.advanceTimersByTime(2_000);

        expect(managedLocalStorage.getItem(STORAGE_KEY)).toBeNull();
    });
});
