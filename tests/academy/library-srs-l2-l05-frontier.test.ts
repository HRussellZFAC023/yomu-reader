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

const PAYLOAD = 'b2835af1a2c829c0c1827ca1cf4518e0f58e05c2219aa59a5f1d64d5aacb8128';
const SOURCE_ID = `moodle-vocabulary:6974651:${PAYLOAD}`;

describe('Library SRS l2-l05 exact vocabulary frontier', () => {
    beforeEach(() => localStorage.clear());

    it('preserves both verbatim pages and layout rows while admitting only source-glossed rows', () => {
        const input = lessonPackage();
        const definition = exactLibraryVocabularyDefinition('l2-l05', input);
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l05');
        const study = libraryStudyVocabulary(sheet);
        const seeds = libraryVocabularyReviewSeeds(sheet);

        expect(definition).toMatchObject({
            packageId: 'l2-l05',
            moduleId: 6974651,
            payloadSha256: PAYLOAD,
            requireSourceMeaning: true,
            layoutOnlyRows: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
        });
        expect(sheet.items).toHaveLength(19);
        expect(sheet.items.map(item => [item.source.page, item.source.row])).toEqual([
            ...Array.from({ length: 15 }, (_, index) => [1, index + 1]),
            ...Array.from({ length: 4 }, (_, index) => [2, index + 16]),
        ]);
        expect(sheet.items.map(item => item.expression))
            .toEqual(vocabularyRows(input).map(row => exact(row).words));
        expect(sheet.items.slice(1, 7).every(item => item.studyStatus === 'quarantined-source-gap')).toBe(true);
        expect(sheet.items.slice(13, 15).every(item => item.studyStatus === 'quarantined-source-gap')).toBe(true);
        expect(sheet.items.filter(item => item.studyStatus === 'canonical')).toHaveLength(11);
        expect(study.map(item => [item.expression, item.meaning])).toEqual([
            ['要る', 'need, require (a visa)'],
            ['僕', 'I (an informal equivalent of わたし used by men)'],
            ['君', 'you (an informal equivalent of あなた used to address people of equal or lower status)'],
            ['君', 'Mr. (an informal equivalent of 〜さん used to address people of equal or lower status: also often appended to boys’ name)'],
            ['うん', 'Yes (an informal equivalent of はい)'],
            ['ううん', 'No (an informal equivalent of いいえ)'],
            ['みんなで', 'all together'],
            ['初め', 'the beginning'],
            ['終わり', 'the end of 〜, The End'],
            ['よかったら', 'if you like'],
            ['いろいろ', 'variouse'],
        ]);
        expect(seeds).toHaveLength(11);
        expect(seeds.map(seed => seed.content.meanings[0])).toEqual(study.map(item => item.meaning));
        expect(seeds.every(seed => seed.sourceQuestionId?.startsWith(SOURCE_ID))).toBe(true);

        const pages = sourcePages(input);
        expect(pages.map(page => page.page)).toEqual([1, 2]);
        expect(String(pages[0]?.verbatimText)).toContain('とびます（⾶びます）');
        expect(String(pages[0]?.verbatimText)).toContain('（宇宙⾶⾏⼠）');
        expect(String(pages[1]?.verbatimText)).toContain('19   いろいろ                                   variouse');
    });

    it('routes a supported row through Reader, Jiten fallback, and Word to Type only', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l05');
        const supported = sheet.items[7]!;
        const surface = document.createElement('span');
        surface.textContent = supported.expression;
        attachLibraryReaderVocabulary(surface, supported);
        const [token] = applyAuthoredVocabularyOverrides({ text: supported.expression, parent: surface }, []);

        expect(token?.card).toMatchObject({
            spelling: 'ぼく（僕）',
            reading: 'ぼく',
            source: 'fallback',
            fallbackLookupTerms: ['僕'],
        });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('僕');

        const lookupMany = vi.fn(async (_terms: string[]) => new Map());
        await publicLookupFallbackCards([token!.card], {
            jitenApiActive: () => false,
            parse: async () => [],
            lookupMany,
            publicSpellingCard: async () => undefined,
        }, { concurrency: 1, jpdbPublicLookup: false });
        expect(lookupMany.mock.calls[0]?.[0]).toContain('僕');

        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);

        for (const unsupported of [sheet.items[1]!, sheet.items[13]!]) {
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

    it('returns from l2-l05 to the exact originating place', () => {
        const entered = transitionAcademyRoute({
            route: 'station' as const,
            routeHistory: [],
            presentationMode: 'story' as const,
        }, {
            kind: 'push',
            route: 'review',
            context: { lessonId: 'authored-week:l2-l05' },
        });

        expect(entered).toMatchObject({ route: 'review', lessonId: 'authored-week:l2-l05' });
        expect(transitionAcademyRoute(entered, { kind: 'back' })).toEqual({
            route: 'station',
            routeHistory: [],
            presentationMode: 'story',
        });
    });

    it('revisits l2-l05 without duplicating or resetting the scheduled canonical card', async () => {
        let now = Date.parse('2026-07-15T10:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const word = libraryStudyVocabulary(
            createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l05'),
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

    it('pins l2-l05 ownership and rejects row, gloss, page, and layout mutations', () => {
        const wrongOwner = structuredClone(lessonPackage());
        mutableRecord(record(wrongOwner).identity).moduleId = 6974652;
        expect(() => exactLibraryVocabularyDefinition('l2-l05', wrongOwner))
            .toThrow(/ownership changed/i);

        const wrongWords = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(wrongWords)[7]!)).words = '僕';
        expect(() => exactLibraryVocabularyDefinition('l2-l05', wrongWords))
            .toThrow(/exact source words changed at row 8/i);

        const inventedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(inventedGloss)[1]!)).meaning = 'pilot';
        expect(() => exactLibraryVocabularyDefinition('l2-l05', inventedGloss))
            .toThrow(/exact source meaning changed at row 2/i);

        const reframedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(reframedGloss)[7]!)).meaning = 'I';
        expect(() => exactLibraryVocabularyDefinition('l2-l05', reframedGloss))
            .toThrow(/exact source meaning changed at row 8/i);

        const wrongPage = structuredClone(lessonPackage());
        const preStudy = mutableRecord(vocabularyComponent(wrongPage).preStudyVocabulary);
        mutableRecord(array(preStudy.sheets)[0]).sourceItemId = `moodle:${PAYLOAD}:page:2`;
        expect(() => exactLibraryVocabularyDefinition('l2-l05', wrongPage))
            .toThrow(/source-page ownership changed/i);

        const lostLayoutRow = structuredClone(lessonPackage());
        const layout = mutableRecord(vocabularyComponent(lostLayoutRow).preStudyVocabulary);
        const page = mutableRecord(array(layout.sheets)[1]);
        page.verbatimText = String(page.verbatimText).replace('\n20\n', '\n20 invented\n');
        expect(() => exactLibraryVocabularyDefinition('l2-l05', lostLayoutRow))
            .toThrow(/layout-only rows changed/i);
    });
});

function lessonPackage(): unknown {
    return JSON.parse(readFileSync('public/academy/content/lessons/032-l2-l05.json', 'utf8')) as unknown;
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
