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
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

const PAYLOAD = 'f6b10fcf6b0ae20a54814eb96bd8c8a779286137ae761b0249de88c9d5c261fa';
const SOURCE_ID = `moodle-vocabulary:6974653:${PAYLOAD}`;
const SOURCE_PAGE = 'public/academy/content/lessons/l2-l07/moodle-chapter-21-2-vocabulary-page-1.png';
const SOURCE_PAGE_SHA256 = '581d2bbfb615b0436f47e2f8f3a680395b2b122b6a559211ec079cdc05a1fd5a';

describe('Library SRS l2-l07 exact vocabulary frontier', () => {
    beforeEach(() => localStorage.clear());

    it('preserves the verbatim sheet, source glyphs, and layout-only rows while admitting one supported gloss', () => {
        const input = lessonPackage();
        const definition = exactLibraryVocabularyDefinition('l2-l07', input);
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l07');
        const study = libraryStudyVocabulary(sheet);
        const seeds = libraryVocabularyReviewSeeds(sheet);

        expect(definition).toMatchObject({
            packageId: 'l2-l07',
            moduleId: 6974653,
            payloadSha256: PAYLOAD,
            requireSourceMeaning: true,
            layoutOnlyRows: [16, 17, 18],
        });
        expect(sheet.items).toHaveLength(15);
        expect(sheet.items.map(item => [item.source.page, item.source.row]))
            .toEqual(Array.from({ length: 15 }, (_, index) => [1, index + 1]));
        expect(sheet.items.map(item => item.expression))
            .toEqual(vocabularyRows(input).map(row => exact(row).words));
        expect(sheet.items.map(item => item.expression)).toEqual([
            'こうつう（交通）', 'いいます（⾔います）', 'りゅうがくします（留学します）', 'ゆめ（夢）',
            'てんさい（天才）', 'ちきゅう（地球）', 'つき（⽉）', 'じどうしゃ（⾃動⾞）',
            'うごきま（動きます）', 'ほうそう（放送）', 'おやしらず（親知らず）', 'ぬきます（抜きます）',
            'ぎおんまつり（祇園祭）', 'はも りょうり（鱧 料理）', 'よしのやま（吉野⼭）',
        ]);
        expect(sheet.items.filter(item => item.studyStatus === 'quarantined-source-gap')).toHaveLength(14);
        expect(sheet.items.filter(item => item.studyStatus === 'quarantined-source-ambiguity')).toEqual([]);
        expect(sheet.items[8]).toMatchObject({
            expression: 'うごきま（動きます）',
            studyExpression: '動く',
            reading: 'うごく',
            sourceMeaning: 'to move',
            studyStatus: 'canonical',
        });
        expect(study).toEqual([{
            id: sheet.items[8]!.id,
            expression: '動く',
            reading: 'うごく',
            meaning: 'to move',
            source: sheet.items[8]!.source.id,
            audioAvailable: true,
        }]);
        expect(seeds).toHaveLength(1);
        expect(seeds[0]).toMatchObject({
            sourceQuestionId: `${SOURCE_ID}:p1:row-9`,
            content: { expression: '動く', reading: 'うごく', meanings: ['to move'] },
        });

        const page = sourcePages(input)[0]!;
        const verbatimText = String(page.verbatimText);
        expect(verbatimText).toContain('Chapter 21-2 Vocabulary Sheet');
        expect(verbatimText).toContain('いいます（⾔います）');
        expect(verbatimText).toContain('うごきま（動きます）                                           to move');
        expect(verbatimText).toContain('はも りょうり\n     （鱧 料理）');
        expect(verbatimText).toContain('16\n\n17\n\n18\n');
        expect(sha256File(SOURCE_PAGE)).toBe(SOURCE_PAGE_SHA256);
        expect(filesHaveSameContent(`docs/${SOURCE_PAGE}`, SOURCE_PAGE)).toBe(true);
        expect(readFileSync('public/academy/sw.js', 'utf8'))
            .toContain('/academy/content/lessons/l2-l07/moodle-chapter-21-2-vocabulary-page-1.png');
    });

    it('routes only the supported row through Reader, Jiten fallback, and Word to Type', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l07');
        const supported = sheet.items[8]!;
        const surface = document.createElement('span');
        surface.textContent = supported.expression;
        attachLibraryReaderVocabulary(surface, supported);
        const [token] = applyAuthoredVocabularyOverrides({ text: supported.expression, parent: surface }, []);

        expect(token?.card).toMatchObject({
            spelling: 'うごきま（動きます）',
            reading: 'うごく',
            source: 'fallback',
            fallbackLookupTerms: ['動く'],
        });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('動く');

        const lookupMany = vi.fn(async (_terms: string[]) => new Map());
        await publicLookupFallbackCards([token!.card], {
            jitenApiActive: () => false,
            parse: async () => [],
            lookupMany,
            publicSpellingCard: async () => undefined,
        }, { concurrency: 1, jpdbPublicLookup: false });
        expect(lookupMany.mock.calls[0]?.[0]).toContain('動く');

        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);

        for (const unsupported of [sheet.items[0]!, sheet.items[14]!]) {
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

    it('returns from l2-l07 to its exact originating station route', () => {
        const entered = transitionAcademyRoute({
            route: 'station' as const,
            routeHistory: [],
            presentationMode: 'story' as const,
        }, {
            kind: 'push',
            route: 'review',
            context: { lessonId: 'authored-week:l2-l07' },
        });

        expect(entered).toMatchObject({ route: 'review', lessonId: 'authored-week:l2-l07' });
        expect(transitionAcademyRoute(entered, { kind: 'back' })).toEqual({
            route: 'station',
            routeHistory: [],
            presentationMode: 'story',
        });
    });

    it('revisits l2-l07 idempotently without duplicating provenance or resetting its schedule', async () => {
        const startedAt = Date.parse('2026-07-15T10:00:00.000Z');
        let now = startedAt;
        const repository = new LocalYomuSrsRepository(() => now);
        const word = libraryStudyVocabulary(
            createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l07'),
        )[0]!;
        const provenanceId = `academy:study-syllabus:${word.id}`;
        const collect = () => repository.collectAcademyVocabulary({
            expression: word.expression,
            reading: word.reading,
            meanings: [word.meaning],
            provenance: {
                id: provenanceId,
                kind: 'study-encounter' as const,
                sourceId: word.source,
            },
        });

        expect(await collect()).toMatchObject({ cardCreated: true, provenanceAdded: true, provenanceCount: 1 });
        expect(await collect()).toMatchObject({ cardCreated: false, provenanceAdded: false, provenanceCount: 1 });
        const first = (await repository.queue(1)).cards[0]!;
        await repository.review({ card: first, grade: 'good' });
        now += 1;
        expect(await collect()).toMatchObject({ cardCreated: false, provenanceAdded: false, provenanceCount: 1 });
        expect((await repository.queue(1)).cards).toEqual([]);

        now = startedAt + 2 * 86_400_000;
        const revisited = (await repository.queue(1)).cards[0]!;
        expect(revisited).toMatchObject({ dueAt: now, state: ['due'] });
        expect((revisited.raw as { reviews?: number }).reviews).toBe(1);
        expect(Object.keys((revisited.raw as { academyProvenance?: object }).academyProvenance ?? {}))
            .toEqual([provenanceId]);
    });

    it('pins l2-l07 ownership and rejects row, glyph, gloss, page, layout, and provenance mutations', () => {
        const wrongOwner = structuredClone(lessonPackage());
        mutableRecord(record(wrongOwner).identity).moduleId = 6974652;
        expect(() => exactLibraryVocabularyDefinition('l2-l07', wrongOwner))
            .toThrow(/ownership changed/i);

        const wrongWords = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(wrongWords)[1]!)).words = 'いいます（言います）';
        expect(() => exactLibraryVocabularyDefinition('l2-l07', wrongWords))
            .toThrow(/exact source words changed at row 2/i);

        const inventedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(inventedGloss)[0]!)).meaning = 'traffic';
        expect(() => exactLibraryVocabularyDefinition('l2-l07', inventedGloss))
            .toThrow(/exact source meaning changed at row 1/i);

        const reframedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(reframedGloss)[8]!)).meaning = 'move';
        expect(() => exactLibraryVocabularyDefinition('l2-l07', reframedGloss))
            .toThrow(/exact source meaning changed at row 9/i);

        const wrongPage = structuredClone(lessonPackage());
        const preStudy = mutableRecord(vocabularyComponent(wrongPage).preStudyVocabulary);
        mutableRecord(array(preStudy.sheets)[0]).sourceItemId = `moodle:${PAYLOAD}:page:2`;
        expect(() => exactLibraryVocabularyDefinition('l2-l07', wrongPage))
            .toThrow(/source-page ownership changed/i);

        const lostLayoutRow = structuredClone(lessonPackage());
        const layout = mutableRecord(vocabularyComponent(lostLayoutRow).preStudyVocabulary);
        const page = mutableRecord(array(layout.sheets)[0]);
        page.verbatimText = String(page.verbatimText).replace('\n16\n', '\n16 invented\n');
        expect(() => exactLibraryVocabularyDefinition('l2-l07', lostLayoutRow))
            .toThrow(/layout-only rows changed/i);

        const relabeledProvenance = structuredClone(lessonPackage());
        const source = mutableRecord(record(vocabularyRows(relabeledProvenance)[8]!).source);
        mutableRecord(source.fieldProvenance).meaning = 'yomu-support';
        expect(() => exactLibraryVocabularyDefinition('l2-l07', relabeledProvenance))
            .toThrow(/field provenance changed at row 9/i);
    });
});

function lessonPackage(): unknown {
    return JSON.parse(readFileSync('public/academy/content/lessons/034-l2-l07.json', 'utf8')) as unknown;
}

function vocabularyComponent(input: unknown): Readonly<Record<string, unknown>> {
    const component = array(record(input).components).map(record).find(candidate =>
        record(candidate.provenance).sourceId === SOURCE_ID);
    return record(component);
}

function vocabularyRows(input: unknown): readonly Readonly<Record<string, unknown>>[] {
    return array(vocabularyComponent(input).items).map(record);
}

function sourcePages(input: unknown): readonly Readonly<Record<string, unknown>>[] {
    return array(record(vocabularyComponent(input).preStudyVocabulary).sheets).map(record);
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
