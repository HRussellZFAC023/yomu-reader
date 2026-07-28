import { describe, expect, it } from 'vitest';

import { fieldNameForRole, scanAnkiModelFields } from '../../src/reader/anki/field-mapping';
import {
    ankiAudioFieldTargets,
    applyMediaFieldClears,
    audioFilesFromContext,
    mergeAudioFilesForNote,
    retargetAudioFilesByKind,
} from '../../src/reader/anki/media-files';
import { migrateAnkiSentenceAudioMappings } from '../../src/reader/settings/anki-field-mappings';
import { normalizeReaderSettings } from '../../src/reader/settings/index';
import type { AnkiFieldSuggestion } from '../../src/reader/anki/types';
import type { AnkiFieldMappings, JPDBCard } from '../../src/reader/app/types';

// Word audio and sentence audio shared a single `audio` field role until the
// sentenceAudio role landed, and mergeAudioFilesForNote forced EVERY audio file
// into whichever field matched first. On note types exposing both (Lapis,
// jp-mining-note) the word pronunciation could be written into the
// sentence-audio field. These tests pin the split and the collapse behaviour
// that keeps single-audio-field note types working.

const BOTH_AUDIO_FIELDS = ['Expression', 'Reading', 'Meaning', 'Sentence', 'WordAudio', 'SentenceAudio', 'Image'];

function testCard(): JPDBCard {
    return {
        spelling: '始める',
        reading: 'はじめる',
        cardState: ['not-in-deck'],
        partOfSpeech: ['v1'],
        meanings: [{ glosses: ['to start'], partOfSpeech: [] }],
    } as unknown as JPDBCard;
}

function bothKindsContext() {
    return {
        wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
        audioDataUrl: 'data:audio/mpeg;base64,sentence-audio',
    };
}

function fieldByData(files: Array<{ fields: string[]; data?: string }>, data: string): string | undefined {
    return files.find(file => file.data === data)?.fields[0];
}

function suggestionFor(suggestions: AnkiFieldSuggestion[], role: string): AnkiFieldSuggestion | undefined {
    return suggestions.find(suggestion => suggestion.role === role);
}

describe('Anki sentence-audio field role', () => {
    describe('role resolution', () => {
        it('resolves word audio and sentence audio to their own fields', () => {
            expect(fieldNameForRole(BOTH_AUDIO_FIELDS, 'audio')).toBe('WordAudio');
            expect(fieldNameForRole(BOTH_AUDIO_FIELDS, 'sentenceAudio')).toBe('SentenceAudio');
        });

        it('never lets the word-audio role claim a sentence-audio field when both exist', () => {
            for (const fields of [
                ['Expression', 'Word Audio', 'Sentence Audio'],
                ['Expression', 'Audio', 'SentenceAudio'],
                ['Expression', 'WordAudio', 'SentAudio'],
            ]) {
                const word = fieldNameForRole(fields, 'audio');
                const sentence = fieldNameForRole(fields, 'sentenceAudio');
                expect(word).not.toBe(sentence);
                expect(sentence).not.toBe('');
            }
        });

        it('scans a note type with both audio fields into distinct roles', () => {
            const { suggestions } = scanAnkiModelFields('jp-mining-note', BOTH_AUDIO_FIELDS);
            expect(suggestionFor(suggestions, 'audio')?.fieldName).toBe('WordAudio');
            expect(suggestionFor(suggestions, 'sentenceAudio')?.fieldName).toBe('SentenceAudio');
        });

        it('keeps an explicit mapping ahead of name matching for both roles', () => {
            const mapping = { audio: 'SentenceAudio', sentenceAudio: 'WordAudio' };
            expect(fieldNameForRole(BOTH_AUDIO_FIELDS, 'audio', mapping)).toBe('SentenceAudio');
            expect(fieldNameForRole(BOTH_AUDIO_FIELDS, 'sentenceAudio', mapping)).toBe('WordAudio');
        });
    });

    describe('two-field routing', () => {
        it('writes word audio and sentence audio to different fields', () => {
            const files = mergeAudioFilesForNote(BOTH_AUDIO_FIELDS, bothKindsContext(), testCard());
            expect(files).toHaveLength(2);
            expect(fieldByData(files, 'word-audio')).toBe('WordAudio');
            expect(fieldByData(files, 'sentence-audio')).toBe('SentenceAudio');
        });

        it('routes by kind rather than by the order the files were built', () => {
            const files = mergeAudioFilesForNote(BOTH_AUDIO_FIELDS, { audioDataUrl: 'data:audio/mpeg;base64,sentence-only' }, testCard());
            expect(files).toEqual([expect.objectContaining({ fields: ['SentenceAudio'], data: 'sentence-only' })]);
        });

        it('honours a mapping that swaps the two audio roles', () => {
            const mapping = { audio: 'SentenceAudio', sentenceAudio: 'WordAudio' };
            const files = mergeAudioFilesForNote(BOTH_AUDIO_FIELDS, bothKindsContext(), testCard(), mapping);
            expect(fieldByData(files, 'word-audio')).toBe('SentenceAudio');
            expect(fieldByData(files, 'sentence-audio')).toBe('WordAudio');
        });

        it('strips the internal routing marker so it cannot reach AnkiConnect', () => {
            const tagged = audioFilesFromContext(bothKindsContext(), testCard());
            expect(tagged.map(file => file.yomuAudioKind)).toEqual(['word', 'context']);
            const routed = retargetAudioFilesByKind(tagged, { word: 'WordAudio', context: 'SentenceAudio' });
            for (const file of routed) expect('yomuAudioKind' in file).toBe(false);
        });
    });

    describe('single-audio-field collapse', () => {
        it('collapses both kinds onto a lone generic audio field', () => {
            const fields = ['Expression', 'Sentence', 'Audio'];
            expect(ankiAudioFieldTargets(fields)).toEqual({ word: 'Audio', context: 'Audio' });
            const files = mergeAudioFilesForNote(fields, bothKindsContext(), testCard());
            expect(files.map(file => file.fields[0])).toEqual(['Audio', 'Audio']);
        });

        it('collapses both kinds onto a lone sentence-audio field', () => {
            const fields = ['Expression', 'Sentence', 'SentenceAudio'];
            expect(ankiAudioFieldTargets(fields)).toEqual({ word: 'SentenceAudio', context: 'SentenceAudio' });
            const files = mergeAudioFilesForNote(fields, bothKindsContext(), testCard());
            expect(files.map(file => file.fields[0])).toEqual(['SentenceAudio', 'SentenceAudio']);
        });

        it('still falls back to a Pronunciation field when no audio-named field exists', () => {
            const files = mergeAudioFilesForNote(['Expression', 'Pronunciation'], bothKindsContext(), testCard());
            expect(files.map(file => file.fields[0])).toEqual(['Pronunciation', 'Pronunciation']);
        });

        it('writes nothing when the note type has no audio field at all', () => {
            expect(ankiAudioFieldTargets(['Expression', 'Sentence'])).toBeNull();
            expect(mergeAudioFilesForNote(['Expression', 'Sentence'], bothKindsContext(), testCard())).toEqual([]);
        });
    });

    describe('field clears', () => {
        it('clears every audio field the write touches, not just the first', () => {
            const files = mergeAudioFilesForNote(BOTH_AUDIO_FIELDS, bothKindsContext(), testCard());
            const fields: Record<string, string> = { WordAudio: '[sound:old-word.mp3]', SentenceAudio: '[sound:old-sentence.mp3]' };
            applyMediaFieldClears(fields, files, [], 'ours', true);
            expect(fields).toEqual({ WordAudio: '', SentenceAudio: '' });
        });

        it('leaves both audio fields alone when merging keeps existing media', () => {
            const files = mergeAudioFilesForNote(BOTH_AUDIO_FIELDS, bothKindsContext(), testCard());
            const fields: Record<string, string> = { WordAudio: '[sound:old-word.mp3]' };
            applyMediaFieldClears(fields, files, [], 'both', true);
            expect(fields).toEqual({ WordAudio: '[sound:old-word.mp3]' });
        });
    });

    describe('mapping migration', () => {
        it('moves a sentence-audio field off the word-audio role', () => {
            const { mappings, movedModels } = migrateAnkiSentenceAudioMappings({
                'jp-mining-note': { expression: 'Word', audio: 'SentenceAudio' },
            });
            expect(movedModels).toEqual(['jp-mining-note']);
            expect(mappings['jp-mining-note']).toEqual({ expression: 'Word', sentenceAudio: 'SentenceAudio' });
        });

        it('leaves a genuine word-audio mapping untouched', () => {
            const mappings: AnkiFieldMappings = { Lapis: { audio: 'Word Audio' } };
            const migration = migrateAnkiSentenceAudioMappings(mappings);
            expect(migration.movedModels).toEqual([]);
            expect(migration.mappings).toEqual(mappings);
        });

        it('never overwrites a sentenceAudio mapping the user already chose', () => {
            const mappings: AnkiFieldMappings = { Lapis: { audio: 'SentenceAudio', sentenceAudio: 'WordAudio' } };
            const migration = migrateAnkiSentenceAudioMappings(mappings);
            expect(migration.movedModels).toEqual([]);
            expect(migration.mappings).toEqual(mappings);
        });

        it('is idempotent: re-running finds nothing left to move', () => {
            const once = migrateAnkiSentenceAudioMappings({ Lapis: { audio: 'Sentence Audio' } });
            const twice = migrateAnkiSentenceAudioMappings(once.mappings);
            expect(twice.movedModels).toEqual([]);
            expect(twice.mappings).toEqual(once.mappings);
        });

        it('migrates a saved payload once and then respects a deliberate re-point', () => {
            const migrated = normalizeReaderSettings({
                ankiFieldMappings: { Lapis: { audio: 'SentenceAudio' } },
            });
            expect(migrated.ankiFieldMappings.Lapis).toEqual({ sentenceAudio: 'SentenceAudio' });
            expect(migrated.ankiSentenceAudioMappingMigrated).toBe(true);

            // Marker set: a later deliberate choice in the mapping editor sticks.
            const repointed = normalizeReaderSettings({
                ...migrated,
                ankiFieldMappings: { Lapis: { audio: 'SentenceAudio' } },
            });
            expect(repointed.ankiFieldMappings.Lapis).toEqual({ audio: 'SentenceAudio' });
        });

        it('marks fresh installs as already migrated', () => {
            expect(normalizeReaderSettings(null).ankiSentenceAudioMappingMigrated).toBe(true);
        });
    });
});
