import { afterEach, describe, expect, it } from 'vitest';

import { scanAnkiModelFields } from '../../src/reader/anki/field-mapping';
import { buildYomuAnkiFields } from '../../src/reader/anki/field-render';
import { retargetYomuFieldsToExistingModel } from '../../src/reader/anki/field-retarget';
import { sentenceAroundRange } from '../../src/reader/dom/reader-word';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
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
    {
        id: 'es-full-stop',
        language: 'es',
        text: 'La biblioteca abre temprano. Esta mañana estudiamos español con nuestros amigos en una cafetería tranquila. Después volvimos a casa.',
        surface: 'español',
    },
    {
        id: 'ru-full-stop',
        language: 'ru',
        text: 'Библиотека открывается рано. Сегодня утром мы долго изучали русский язык вместе с друзьями в тихом кафе. Потом мы вернулись домой.',
        surface: 'русский',
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
    {
        id: 'es-en',
        language: 'es',
        fields: ['Spanish', 'English', 'Example'],
        rows: [
            ['español', 'Spanish language', 'Esta mañana estudiamos español con nuestros amigos en una cafetería tranquila.'],
            ['biblioteca', 'library', 'La biblioteca del barrio abre temprano todos los días laborables.'],
        ],
    },
    {
        id: 'ru-en',
        language: 'ru',
        fields: ['Russian', 'English', 'Example'],
        rows: [
            ['русский', 'Russian language', 'Сегодня утром мы долго изучали русский язык вместе с друзьями в тихом кафе.'],
            ['библиотека', 'library', 'Новая библиотека рядом с вокзалом открывается очень рано.'],
        ],
    },
    {
        id: 'es-en-unnamed',
        language: 'es',
        fields: ['Field1', 'Field2', 'Field3'],
        rows: [
            ['español', 'Spanish language', 'Esta mañana estudiamos español con nuestros amigos en una cafetería tranquila.'],
            ['biblioteca', 'library', 'La biblioteca del barrio abre temprano todos los días laborables.'],
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
        setActiveLearningTargetLanguage(fixture.language);
        const scan = scanAnkiModelFields('Generic mining fixture', [...fixture.fields], notes(fixture.fields, fixture.rows));
        return [fixture.id, Object.fromEntries(scan.suggestions
            .filter(suggestion => TEXT_ROLES.includes(suggestion.role))
            .map(suggestion => [suggestion.role, suggestion.fieldName]))];
    }));
}

function noteCorpus() {
    return Object.fromEntries(MAPPING_FIXTURES
        .filter(fixture => fixture.id !== 'es-en-unnamed')
        .map(fixture => {
            setActiveLearningTargetLanguage(fixture.language);
            const scan = scanAnkiModelFields('Generic mining fixture', [...fixture.fields], notes(fixture.fields, fixture.rows));
            const mapping = Object.fromEntries(scan.suggestions
                .filter(suggestion => suggestion.fieldName)
                .map(suggestion => [suggestion.role, suggestion.fieldName])) as AnkiFieldMapping;
            const sentenceFixture = SENTENCE_FIXTURES.find(item => item.language === fixture.language)!;
            const start = sentenceFixture.text.indexOf(sentenceFixture.surface);
            const sentence = sentenceAroundRange(sentenceFixture.text, start, start + sentenceFixture.surface.length);
            const card = {
                spelling: fixture.rows[0]![0],
                reading: fixture.language === 'ja' ? fixture.rows[0]![1] : fixture.rows[0]![0],
                meanings: [{ glosses: [fixture.rows[0]![fixture.language === 'ja' ? 2 : 1]], partOfSpeech: [] }],
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
        setActiveLearningTargetLanguage(fixture.language);
        const start = fixture.text.indexOf(fixture.surface);
        return [fixture.id, sentenceAroundRange(fixture.text, start, start + fixture.surface.length)];
    }));
}

describe('mining across target-language script classes', () => {
    afterEach(() => resetActiveLearningTargetLanguage());

    it('records the sentence and Anki mapping fixture corpus', () => {
        const corpus = { sentences: sentenceCorpus(), mappings: mappingCorpus(), notes: noteCorpus() };
        if (process.env.YOMU_PRINT_MINING_CORPUS === '1') console.log(`MINING_CORPUS=${JSON.stringify(corpus, null, 2)}`);
        expect(corpus.sentences).toEqual({
            'ja-periods-and-url': '今日は静かな喫茶店で日本語を読みました。',
            'ja-whitespace-section': '案内 ナビゲーション この項目では日本語について説明します。',
            'es-full-stop': 'Esta mañana estudiamos español con nuestros amigos en una cafetería tranquila.',
            'ru-full-stop': 'Сегодня утром мы долго изучали русский язык вместе с друзьями в тихом кафе.',
        });
        expect(corpus.mappings).toEqual({
            'ja-en': { expression: 'Japanese', reading: 'Reading', meaning: 'English', sentence: 'Example' },
            'es-en': { expression: 'Spanish', reading: null, meaning: 'English', sentence: 'Example' },
            'ru-en': { expression: 'Russian', reading: null, meaning: 'English', sentence: 'Example' },
            'es-en-unnamed': { expression: 'Field1', reading: null, meaning: null, sentence: 'Field3' },
        });
        expect(corpus.notes['es-en']).toMatchObject({
            Spanish: 'español',
            English: expect.stringContaining('Spanish language'),
            Example: expect.stringContaining('Esta mañana estudiamos'),
        });
        expect(corpus.notes['ru-en']).toMatchObject({
            Russian: 'русский',
            English: expect.stringContaining('Russian language'),
            Example: expect.stringContaining('Сегодня утром мы долго изучали'),
        });
        expect(corpus.notes['ja-en']).toMatchObject({
            Japanese: '日本語',
            Reading: 'にほんご',
            English: expect.stringContaining('Japanese language'),
            Example: expect.stringContaining('今日は静かな喫茶店で'),
        });
    });

    it('reports a supported dictionary-reading slot when the Anki model has no reading field', () => {
        const fixture = MAPPING_FIXTURES.find(item => item.id === 'es-en')!;
        setActiveLearningTargetLanguage(fixture.language);

        const scan = scanAnkiModelFields(
            'Generic mining fixture',
            [...fixture.fields],
            notes(fixture.fields, fixture.rows),
        );

        expect(scan.suggestions.find(suggestion => suggestion.role === 'reading')).toEqual({
            role: 'reading',
            fieldName: null,
            confidence: 'low',
        });
    });
});
