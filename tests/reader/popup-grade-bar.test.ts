// Owner decision 2 (2026-10-07): "Some users want to just use our app as a
// dictionary." The popup's grade bar is for a learner who reviews with a
// connected service; the Yomu deck alone is not one.
import { afterEach, describe, expect, it } from 'vitest';
import { setInnerHtml } from '../../src/reader/dom';
import { readCardCommandCapability } from '../../src/reader/dom/private-command-capabilities';
import { card, emptyCardRenderData, testAnkiExistingNote, testAnkiLookup, testCardPopoverRenderer } from './jpdb/fixtures';
import type { JPDBCard, ReaderSettings } from './jpdb/fixtures';

const WORD: JPDBCard = { ...card, meanings: [{ glosses: ['to eat'], partOfSpeech: ['v1'] }], cardState: ['not-in-deck'] };
const KEYLESS: Partial<ReaderSettings> = { interfaceLanguage: 'en', apiKey: '', jitenApiKey: '', bunproFrontendApiToken: '', yomuLocalSrsEnabled: true, ankiEnabled: false, enableReviews: true };
const JPDB_LEARNER: Partial<ReaderSettings> = { ...KEYLESS, apiKey: 'jpdb-key', jpdbMiningEnabled: true };

afterEach(() => document.body.replaceChildren());

function grades(settings: Partial<ReaderSettings>, trusted: boolean, data = emptyCardRenderData(), word = WORD): HTMLButtonElement[] {
    const html = testCardPopoverRenderer(settings, { accountDataSurfaceTrusted: () => trusted }).render(word, '毎日ご飯を食べる。', 'modal', data);
    setInnerHtml(document.body, `<div class="jpdb-reader-popover">${html}</div>`);
    return [...document.querySelectorAll<HTMLButtonElement>('[data-action="grade"]')];
}

describe('the popup grade bar', () => {
    it.each([['an ordinary page', false], ['Study', true]])('is absent for a dictionary-only learner on %s', (_surface, trusted) => {
        expect(grades(KEYLESS, trusted)).toEqual([]);
        // Not even for a word the learner already keeps in the Yomu deck: it is reviewed in Study.
        expect(grades(KEYLESS, trusted, emptyCardRenderData(), { ...WORD, reviewSource: 'yomu-local', cardState: ['learning'] })).toEqual([]);
    });

    it.each([['an ordinary page', false], ['Study', true]])('grades into a connected service on %s', (_surface, trusted) => {
        expect(grades(JPDB_LEARNER, trusted).map(button => readCardCommandCapability(button)?.grade))
            .toEqual(['nothing', 'something', 'hard', 'okay', 'easy']);
    });

    it('grades a word\'s Anki card on Study for a learner whose only service is Anki', () => {
        const note = testAnkiExistingNote({ primaryCardId: 404 });
        const buttons = grades({ ...KEYLESS, ankiEnabled: true, ankiSectionEnabled: true }, true, emptyCardRenderData({
            ankiLookup: testAnkiLookup({ state: 'known', notes: [note], primary: note }),
        }));
        expect(buttons.length).toBeGreaterThan(0);
        expect(buttons.every(button => readCardCommandCapability(button)?.reviewTarget === 'anki')).toBe(true);
    });

    it('is absent for everyone with reviews turned off', () => {
        expect(grades({ ...JPDB_LEARNER, enableReviews: false }, false)).toEqual([]);
    });
});
