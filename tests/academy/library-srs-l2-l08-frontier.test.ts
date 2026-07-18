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

const PAYLOAD = 'd15120789831ab8a2cac59a1b90e70faf828abec0457d2fad519cee44b9bce82';
const SOURCE_ID = `moodle-vocabulary:6974656:${PAYLOAD}`;
const SOURCE_PAGE = 'public/academy/content/lessons/l2-l08/moodle-chapter-22-1-vocabulary-page-1.png';
const SOURCE_PAGE_SHA256 = 'a0961cc3b6d648da8624198a5d3112f57229f9b769d9e22b5f0f45229e4438ad';

describe('Library SRS l2-l08 exact vocabulary frontier', () => {
    beforeEach(() => localStorage.clear());

    it('preserves all 18 source rows while admitting only the one source-glossed word', () => {
        const input = lessonPackage();
        const definition = exactLibraryVocabularyDefinition('l2-l08', input);
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l08');
        const study = libraryStudyVocabulary(sheet);
        const seeds = libraryVocabularyReviewSeeds(sheet);

        expect(definition).toMatchObject({
            packageId: 'l2-l08',
            packageOrder: 35,
            moduleId: 6974656,
            payloadSha256: PAYLOAD,
            requireSourceMeaning: true,
        });
        expect(sheet.items).toHaveLength(18);
        expect(sheet.items.map(item => [item.source.page, item.source.row]))
            .toEqual(Array.from({ length: 18 }, (_, index) => [1, index + 1]));
        expect(sheet.items.map(item => item.expression)).toEqual([
            'きょうかしょ（教科書）', 'ケーキ', 'コート', 'セーター', 'スーツ', 'ドレス',
            'きます（着ます）', 'ずぼん', 'はきます（履きます）', 'ぼうし（帽子）',
            'かぶります（被ります）', 'めがね（眼鏡）', 'かけます（掛けます）',
            '[ネクタイを]します', 'うまれます（生まれます）', 'おべんとう（お弁当）',
            'わたしたち', 'よく',
        ]);
        expect(sheet.items.filter(item => item.studyStatus === 'quarantined-source-gap')).toHaveLength(17);
        expect(sheet.items[17]).toMatchObject({
            expression: 'よく',
            studyExpression: 'よく',
            reading: 'よく',
            sourceMeaning: 'often',
            studyStatus: 'canonical',
        });
        expect(study).toEqual([{
            id: sheet.items[17]!.id,
            expression: 'よく',
            meaning: 'often',
            source: sheet.items[17]!.source.id,
            audioAvailable: true,
        }]);
        expect(seeds).toHaveLength(1);
        expect(seeds[0]).toMatchObject({
            sourceQuestionId: `${SOURCE_ID}:p1:row-18`,
            content: { expression: 'よく', meanings: ['often'] },
        });

        const page = sourcePages(input)[0]!;
        expect(String(page.verbatimText)).toContain('Chapter 22-1 Vocabulary Sheet');
        expect(String(page.verbatimText)).toContain('1\n     （教科書）');
        expect(String(page.verbatimText)).toContain('18   よく                                          often');
        expect(sha256File(SOURCE_PAGE)).toBe(SOURCE_PAGE_SHA256);
        expect(filesHaveSameContent(`docs/${SOURCE_PAGE}`, SOURCE_PAGE)).toBe(true);
        expect(readFileSync('public/academy/sw.js', 'utf8'))
            .toContain('/academy/content/lessons/l2-l08/moodle-chapter-22-1-vocabulary-page-1.png');
    });

    it('routes only よく through Reader, Jiten fallback, and Word to Type', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l08');
        const supported = sheet.items[17]!;
        const surface = document.createElement('span');
        surface.textContent = supported.expression;
        attachLibraryReaderVocabulary(surface, supported);
        const [token] = applyAuthoredVocabularyOverrides({ text: supported.expression, parent: surface }, []);

        expect(token?.card).toMatchObject({
            spelling: 'よく',
            reading: 'よく',
            source: 'fallback',
            fallbackLookupTerms: ['よく'],
        });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('よく');

        const lookupMany = vi.fn(async (_terms: string[]) => new Map());
        await publicLookupFallbackCards([token!.card], {
            jitenApiActive: () => false,
            parse: async () => [],
            lookupMany,
            publicSpellingCard: async () => undefined,
        }, { concurrency: 1, jpdbPublicLookup: false });
        expect(lookupMany.mock.calls[0]?.[0]).toContain('よく');

        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);

        for (const unsupported of [sheet.items[0]!, sheet.items[16]!]) {
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

    it('returns from l2-l08 to its originating current-place route', () => {
        const entered = transitionAcademyRoute({
            route: 'street' as const,
            routeHistory: [],
            presentationMode: 'story' as const,
        }, {
            kind: 'push',
            route: 'review',
            context: { lessonId: 'authored-week:l2-l08' },
        });

        expect(entered).toMatchObject({ route: 'review', lessonId: 'authored-week:l2-l08' });
        expect(transitionAcademyRoute(entered, { kind: 'back' })).toEqual({
            route: 'street',
            routeHistory: [],
            presentationMode: 'story',
        });
    });

    it('revisits l2-l08 without duplicating provenance or resetting its schedule', async () => {
        const startedAt = Date.parse('2026-07-15T10:00:00.000Z');
        let now = startedAt;
        const repository = new LocalYomuSrsRepository(() => now);
        const word = libraryStudyVocabulary(
            createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l08'),
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

    it('pins ownership and rejects row, gloss, page, and provenance mutations', () => {
        const wrongOwner = structuredClone(lessonPackage());
        mutableRecord(record(wrongOwner).identity).moduleId = 6974655;
        expect(() => exactLibraryVocabularyDefinition('l2-l08', wrongOwner)).toThrow(/ownership changed/i);

        const wrongWords = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(wrongWords)[0]!)).words = '教科書';
        expect(() => exactLibraryVocabularyDefinition('l2-l08', wrongWords))
            .toThrow(/exact source words changed at row 1/i);

        const inventedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(inventedGloss)[0]!)).meaning = 'textbook';
        expect(() => exactLibraryVocabularyDefinition('l2-l08', inventedGloss))
            .toThrow(/exact source meaning changed at row 1/i);

        const reframedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(reframedGloss)[17]!)).meaning = 'frequently';
        expect(() => exactLibraryVocabularyDefinition('l2-l08', reframedGloss))
            .toThrow(/exact source meaning changed at row 18/i);

        const wrongPage = structuredClone(lessonPackage());
        const preStudy = mutableRecord(vocabularyComponent(wrongPage).preStudyVocabulary);
        mutableRecord(array(preStudy.sheets)[0]).sourceItemId = `moodle:${PAYLOAD}:page:2`;
        expect(() => exactLibraryVocabularyDefinition('l2-l08', wrongPage))
            .toThrow(/source-page ownership changed/i);

        const relabeledProvenance = structuredClone(lessonPackage());
        const source = mutableRecord(record(vocabularyRows(relabeledProvenance)[17]!).source);
        mutableRecord(source.fieldProvenance).meaning = 'yomu-support';
        expect(() => exactLibraryVocabularyDefinition('l2-l08', relabeledProvenance))
            .toThrow(/field provenance changed at row 18/i);
    });
});

function lessonPackage(): unknown {
    return JSON.parse(readFileSync('public/academy/content/lessons/035-l2-l08.json', 'utf8')) as unknown;
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
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object.');
    return value as Record<string, unknown>;
}

function array(value: unknown): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError('Expected an array.');
    return value;
}
