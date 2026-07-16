import { readFileSync } from 'node:fs';

import {
    createLibraryVocabularySheetFromPackage,
    libraryStudyVocabulary,
    libraryVocabularyReviewSeeds,
} from '../../src/academy/content/library-vocabulary-sheet';
import { exactLibraryVocabularyDefinition } from '../../src/academy/content/lesson-27-31-library-vocabulary';
import { attachLibraryReaderVocabulary } from '../../src/academy/integration/library-reader-vocabulary';
import { transitionAcademyRoute } from '../../src/academy/routing/route-history';
import {
    applyAuthoredVocabularyOverrides,
    AUTHORED_VOCABULARY_ATTRIBUTE,
} from '../../src/reader/lookup/authored-vocabulary';
import { fallbackLookupTermsForCard } from '../../src/reader/lookup/japanese-segments';
import { publicLookupFallbackCards } from '../../src/reader/lookup/public-fallback-cards';
import { createNewTabStudySession } from '../../src/reader/newtab/study-session';
import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';

const PAYLOAD = '5e7880ecbaa49b880eae7d78f938bb313bbd3f1eced59ccece97a221a64f0899';
const SOURCE_ID = `moodle-vocabulary:7011919:${PAYLOAD}`;

describe('Library SRS l2-l03 exact vocabulary frontier', () => {
    beforeEach(() => localStorage.clear());

    it('preserves exact and layout-only rows while admitting only supported source glosses', () => {
        const input = lessonPackage();
        const definition = exactLibraryVocabularyDefinition('l2-l03', input);
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l03');
        const study = libraryStudyVocabulary(sheet);
        const seeds = libraryVocabularyReviewSeeds(sheet);

        expect(definition).toMatchObject({
            packageId: 'l2-l03',
            moduleId: 7011919,
            payloadSha256: PAYLOAD,
            requireSourceMeaning: true,
            ambiguousSourceMeaningRows: [1, 2, 3, 4, 5, 6],
            layoutOnlyRows: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
        });
        expect(sheet.items).toHaveLength(20);
        expect(sheet.items.slice(0, 6).map(item => item.studyStatus))
            .toEqual(Array(6).fill('quarantined-source-ambiguity'));
        expect(sheet.items.slice(6, 12).every(item => item.studyStatus === 'canonical')).toBe(true);
        expect(sheet.items.slice(12, 17).map(item => item.studyStatus))
            .toEqual(Array(5).fill('quarantined-source-gap'));
        expect(sheet.items.slice(17).every(item => item.studyStatus === 'canonical')).toBe(true);
        expect(study.map(item => [item.expression, item.meaning])).toEqual([
            ['日', 'day, date'],
            ['休みの日', 'day off → lit: a day of off'],
            ['いい天気の日', 'sunny day\n→ lit: a day of good weather'],
            ['でも', '‘but’ in casual speach'],
            ['もうすぐ', 'soon'],
            ['だんだん', 'gradually'],
            ['乾杯', 'Cheers! Toast!'],
            ['ダイエット', 'diet (〜を します: go on a diet)'],
            ['体にいい', 'good for one’s health'],
        ]);
        expect(seeds).toHaveLength(9);
        expect(seeds.map(seed => seed.content.meanings[0])).toEqual(study.map(item => item.meaning));
        expect(seeds.every(seed => seed.sourceQuestionId?.startsWith(SOURCE_ID))).toBe(true);
    });

    it('routes a supported row through Reader, Jiten fallback, and Word to Type only', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l03');
        const supported = sheet.items[6]!;
        const surface = document.createElement('span');
        surface.textContent = supported.expression;
        attachLibraryReaderVocabulary(surface, supported);
        const [token] = applyAuthoredVocabularyOverrides({ text: supported.expression, parent: surface }, []);

        expect(token?.card).toMatchObject({
            spelling: 'ひ（日）',
            reading: 'ひ',
            source: 'fallback',
            fallbackLookupTerms: ['日'],
        });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('日');

        const lookupMany = vi.fn(async (_terms: string[]) => new Map());
        await publicLookupFallbackCards([token!.card], {
            jitenApiActive: () => false,
            parse: async () => [],
            lookupMany,
            publicSpellingCard: async () => undefined,
        }, { concurrency: 1, jpdbPublicLookup: false });
        expect(lookupMany.mock.calls[0]?.[0]).toContain('日');

        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);

        for (const unsupported of [sheet.items[0]!, sheet.items[12]!]) {
            const unsupportedSurface = document.createElement('span');
            unsupportedSurface.textContent = unsupported.expression;
            attachLibraryReaderVocabulary(unsupportedSurface, unsupported);
            expect(unsupportedSurface.hasAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)).toBe(false);
            expect(applyAuthoredVocabularyOverrides({
                text: unsupported.expression,
                parent: unsupportedSurface,
            }, [])).toEqual([]);
        }
    });

    it('returns from l2-l03 to the exact originating place', () => {
        const entered = transitionAcademyRoute({
            route: 'station' as const,
            routeHistory: [],
            presentationMode: 'story' as const,
        }, {
            kind: 'push',
            route: 'review',
            context: { lessonId: 'authored-week:l2-l03' },
        });

        expect(entered).toMatchObject({ route: 'review', lessonId: 'authored-week:l2-l03' });
        expect(transitionAcademyRoute(entered, { kind: 'back' })).toEqual({
            route: 'station',
            routeHistory: [],
            presentationMode: 'story',
        });
    });

    it('revisits l2-l03 without duplicating or resetting the scheduled canonical card', async () => {
        let now = Date.parse('2026-07-15T10:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const word = libraryStudyVocabulary(
            createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l03'),
        )[0]!;
        const collect = () => repository.collectAcademyVocabulary({
            expression: word.expression,
            reading: word.reading,
            meanings: [word.meaning],
            provenance: {
                id: `academy:study-syllabus:${word.id}`,
                kind: 'study-encounter' as const,
                sourceId: word.source,
            },
        });

        await collect();
        const first = (await repository.queue(1)).cards[0]!;
        await repository.review({ card: first, grade: 'good' });
        now += 1;
        await collect();

        expect((await repository.queue(1)).cards).toEqual([]);
        expect(Object.keys((first.raw as { academyProvenance?: object }).academyProvenance ?? {}))
            .toEqual([`academy:study-syllabus:${word.id}`]);
    });

    it('pins l2-l03 ownership and rejects row, gloss, and page-two layout mutations', () => {
        const wrongOwner = structuredClone(lessonPackage());
        mutableRecord(record(wrongOwner).identity).moduleId = 7011918;
        expect(() => exactLibraryVocabularyDefinition('l2-l03', wrongOwner))
            .toThrow(/ownership changed/i);

        const wrongWords = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(wrongWords)[6]!)).words = '日';
        expect(() => exactLibraryVocabularyDefinition('l2-l03', wrongWords))
            .toThrow(/exact source words changed at row 7/i);

        const obscuredAmbiguity = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(obscuredAmbiguity)[0]!)).meaning = 'cleaning';
        expect(() => exactLibraryVocabularyDefinition('l2-l03', obscuredAmbiguity))
            .toThrow(/exact source meaning changed at row 1/i);

        const inventedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(inventedGloss)[12]!)).meaning = 'to become';
        expect(() => exactLibraryVocabularyDefinition('l2-l03', inventedGloss))
            .toThrow(/exact source meaning changed at row 13/i);

        const reframedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(reframedGloss)[6]!)).meaning = 'day';
        expect(() => exactLibraryVocabularyDefinition('l2-l03', reframedGloss))
            .toThrow(/exact source meaning changed at row 7/i);

        const lostLayoutRow = structuredClone(lessonPackage());
        const component = mutableRecord(vocabularyComponent(lostLayoutRow));
        const preStudy = mutableRecord(component.preStudyVocabulary);
        const page = mutableRecord(array(preStudy.sheets)[1]);
        page.verbatimText = String(page.verbatimText).replace('\n21\n', '\n21 invented\n');
        expect(() => exactLibraryVocabularyDefinition('l2-l03', lostLayoutRow))
            .toThrow(/layout-only rows changed/i);
    });
});

function lessonPackage(): unknown {
    return JSON.parse(readFileSync('public/academy/content/lessons/030-l2-l03.json', 'utf8')) as unknown;
}

function vocabularyComponent(input: unknown): Readonly<Record<string, unknown>> {
    const component = array(record(input).components).map(record).find(candidate =>
        record(candidate.provenance).sourceId === SOURCE_ID);
    return record(component);
}

function vocabularyRows(input: unknown): readonly Readonly<Record<string, unknown>>[] {
    return array(vocabularyComponent(input).items).map(record);
}

function exact(row: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return record(record(row.source).exact);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object.');
    return value as Readonly<Record<string, unknown>>;
}

function mutableRecord(value: unknown): Record<string, unknown> {
    return record(value) as Record<string, unknown>;
}

function array(value: unknown): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError('Expected an array.');
    return value;
}
