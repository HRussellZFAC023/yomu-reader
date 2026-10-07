import { describe, expect, it } from 'vitest';

import { scanAnkiModelFields } from '../../src/reader/anki/field-mapping';
import { buildYomuAnkiFields } from '../../src/reader/anki/field-render';
import { retargetYomuFieldsToExistingModel } from '../../src/reader/anki/field-retarget';
import { sentenceAroundRange } from '../../src/reader/dom/reader-word';
import type { AnkiFieldRole, AnkiNoteInfo } from '../../src/reader/anki/types';
import type { AnkiFieldMapping, JPDBCard } from '../../src/reader/app/types';

const TEXT_ROLES: readonly AnkiFieldRole[] = ['expression', 'reading', 'meaning', 'sentence'];

const SENTENCE_FIXTURES = [
    {
        id: 'ja-periods-and-url',
        language: 'ja',
        text: '資料は example.jp/v1.2 を参照してください。今日は静かな喫茶店で日本語を読みました。明日も読みます。',
        surface: '日本語',
    },
    {
        id: 'ja-whitespace-section',
        language: 'ja',
        text: '案内 ナビゲーション この項目では日本語について説明します。 次の項目',
        surface: '日本語',
    },
] as const;

const MAPPING_FIXTURES = [
    {
        id: 'ja-en',
        language: 'ja',
        fields: ['Japanese', 'Reading', 'English', 'Example'],
        rows: [
            ['日本語', 'にほんご', 'Japanese language', '今日は静かな喫茶店で日本語を読みました。'],
            ['図書館', 'としょかん', 'library', '駅の近くに新しい図書館があります。'],
        ],
    },
] as const;

function notes(fields: readonly string[], rows: readonly (readonly string[])[]): AnkiNoteInfo[] {
    return rows.map((row, index) => ({
        noteId: index + 1,
        modelName: 'Generic mining fixture',
        tags: [],
        fields: Object.fromEntries(fields.map((field, fieldIndex) => [field, { value: row[fieldIndex] ?? '', order: fieldIndex }])),
        cards: [],
    }));
}

function mappingCorpus() {
    return Object.fromEntries(MAPPING_FIXTURES.map(fixture => {
        const scan = scanAnkiModelFields('Generic mining fixture', [...fixture.fields], notes(fixture.fields, fixture.rows));
        return [fixture.id, Object.fromEntries(scan.suggestions
            .filter(suggestion => TEXT_ROLES.includes(suggestion.role))
            .map(suggestion => [suggestion.role, suggestion.fieldName]))];
    }));
}

function noteCorpus() {
    return Object.fromEntries(MAPPING_FIXTURES
        .map(fixture => {
            const scan = scanAnkiModelFields('Generic mining fixture', [...fixture.fields], notes(fixture.fields, fixture.rows));
            const mapping = Object.fromEntries(scan.suggestions
                .filter(suggestion => suggestion.fieldName)
                .map(suggestion => [suggestion.role, suggestion.fieldName])) as AnkiFieldMapping;
            const sentenceFixture = SENTENCE_FIXTURES.find(item => item.language === fixture.language)!;
            const start = sentenceFixture.text.indexOf(sentenceFixture.surface);
            const sentence = sentenceAroundRange(sentenceFixture.text, start, start + sentenceFixture.surface.length);
            const card = {
                spelling: fixture.rows[0]![0],
                reading: fixture.rows[0]![1],
                meanings: [{ glosses: [fixture.rows[0]![2]], partOfSpeech: [] }],
                partOfSpeech: [],
                cardState: ['not-in-deck'],
                pitchAccent: [],
            } as unknown as JPDBCard;
            return [fixture.id, retargetYomuFieldsToExistingModel(
                buildYomuAnkiFields(card, sentence),
                [...fixture.fields],
                mapping,
            )];
        }));
}

function sentenceCorpus() {
    return Object.fromEntries(SENTENCE_FIXTURES.map(fixture => {
        const start = fixture.text.indexOf(fixture.surface);
        return [fixture.id, sentenceAroundRange(fixture.text, start, start + fixture.surface.length)];
    }));
}

describe('Japanese mining sentences and Anki field mapping', () => {
    it('records the sentence and Anki mapping fixture corpus', () => {
        const corpus = { sentences: sentenceCorpus(), mappings: mappingCorpus(), notes: noteCorpus() };
        if (process.env.YOMU_PRINT_MINING_CORPUS === '1') console.log(`MINING_CORPUS=${JSON.stringify(corpus, null, 2)}`);
        expect(corpus.sentences).toEqual({
            'ja-periods-and-url': '今日は静かな喫茶店で日本語を読みました。',
            'ja-whitespace-section': '案内 ナビゲーション この項目では日本語について説明します。',
        });
        expect(corpus.mappings).toEqual({
            'ja-en': { expression: 'Japanese', reading: 'Reading', meaning: 'English', sentence: 'Example' },
        });
        expect(corpus.notes['ja-en']).toMatchObject({
            Japanese: '日本語',
            Reading: 'にほんご',
            English: expect.stringContaining('Japanese language'),
            Example: expect.stringContaining('今日は静かな喫茶店で'),
        });
    });
});
