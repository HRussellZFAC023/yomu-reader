import type { AnkiExistingNote, AnkiLookupResult } from '../../../src/reader/anki';
import { renderAnkiExistingSection } from '../../../src/reader/anki-render';
import type { ReaderSettings } from '../../../src/reader/types';

export function renderExistingAnkiLookup(notes: AnkiExistingNote[], settings: ReaderSettings): HTMLElement {
    const primary = notes[0] ?? null;
    const lookup: AnkiLookupResult = { state: primary?.state ?? 'not-in-deck', notes, primary, trusted: true };
    const container = document.createElement('div');
    container.innerHTML = renderAnkiExistingSection(lookup, null, settings);
    const section = container.querySelector<HTMLElement>('.jpdb-reader-anki-existing');
    if (!section) throw new Error('Expected rendered Anki section');
    return section;
}

export function renderExistingAnkiNote(note: AnkiExistingNote, settings: ReaderSettings): HTMLElement {
    return renderExistingAnkiLookup([note], settings);
}

export function existingAnkiNote(overrides: Partial<AnkiExistingNote> = {}): AnkiExistingNote {
    return {
        noteId: 99,
        modelName: 'Yomu Japanese',
        deckNames: ['Mining'],
        cardIds: [123],
        primaryCardId: 123,
        state: 'due',
        fields: {
            Expression: '日本語',
            Reading: 'にほんご',
            Meaning: 'Japanese language',
        },
        renderedCards: [],
        tags: [],
        reps: 3,
        lapses: 0,
        ...overrides,
    };
}
