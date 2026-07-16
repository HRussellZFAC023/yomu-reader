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

const PAYLOAD = '34763479d18b72f20bf7618aa691b3a5d0f5855ae7f09ebd5799703b7d714097';
const SOURCE_ID = `moodle-vocabulary:7011918:${PAYLOAD}`;

describe('Library SRS l2-l02 exact vocabulary frontier', () => {
    beforeEach(() => localStorage.clear());

    it('keeps every exact and layout-only row while admitting only source-glossed rows to Study and SRS', () => {
        const input = lessonPackage();
        const definition = exactLibraryVocabularyDefinition('l2-l02', input);
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l02');
        const study = libraryStudyVocabulary(sheet);
        const seeds = libraryVocabularyReviewSeeds(sheet);

        expect(definition).toMatchObject({
            packageId: 'l2-l02',
            moduleId: 7011918,
            payloadSha256: PAYLOAD,
            requireSourceMeaning: true,
            layoutOnlyRows: [15, 16],
        });
        expect(sheet.items).toHaveLength(14);
        expect(sheet.items.slice(0, 6).map(item => item.studyStatus))
            .toEqual(Array(6).fill('quarantined-source-gap'));
        expect(sheet.items.slice(6).every(item => item.studyStatus === 'canonical')).toBe(true);
        expect(study.map(item => [item.expression, item.meaning])).toEqual([
            ['一度', 'once'],
            ['一回', 'once'],
            ['一度も', 'not once, never\n*used with negatives'],
            ['一回も', 'not once, never\n*used with negatives'],
            ['ぜひ', 'By all means, really'],
            ['初めて', 'for the first time'],
            ['何度も', 'many times, over and over, again\nand again'],
            ['何回も', 'many times, over and over, again\nand again'],
        ]);
        expect(seeds).toHaveLength(8);
        expect(seeds.map(seed => seed.content.meanings[0])).toEqual(study.map(item => item.meaning));
        expect(seeds.every(seed => seed.sourceQuestionId?.startsWith(SOURCE_ID))).toBe(true);
    });

    it('carries a canonical row through Reader, Jiten fallback, and Word to Type while withholding source gaps', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l02');
        const canonical = sheet.items[6]!;
        const surface = document.createElement('span');
        surface.textContent = canonical.expression;
        attachLibraryReaderVocabulary(surface, canonical);
        const [token] = applyAuthoredVocabularyOverrides({ text: canonical.expression, parent: surface }, []);

        expect(token?.card).toMatchObject({
            spelling: 'いちど（一度）',
            reading: 'いちど',
            source: 'fallback',
            fallbackLookupTerms: ['一度'],
        });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('一度');

        const lookupMany = vi.fn(async (_terms: string[]) => new Map());
        await publicLookupFallbackCards([token!.card], {
            jitenApiActive: () => false,
            parse: async () => [],
            lookupMany,
            publicSpellingCard: async () => undefined,
        }, { concurrency: 1, jpdbPublicLookup: false });
        expect(lookupMany.mock.calls[0]?.[0]).toContain('一度');

        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);

        const unsupported = sheet.items[0]!;
        const unsupportedSurface = document.createElement('span');
        unsupportedSurface.textContent = unsupported.expression;
        attachLibraryReaderVocabulary(unsupportedSurface, unsupported);
        expect(unsupportedSurface.hasAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)).toBe(false);
        expect(applyAuthoredVocabularyOverrides({
            text: unsupported.expression,
            parent: unsupportedSurface,
        }, [])).toEqual([]);
    });

    it('returns from l2-l02 to the exact originating place', () => {
        const entered = transitionAcademyRoute({
            route: 'station' as const,
            routeHistory: [],
            presentationMode: 'story' as const,
        }, {
            kind: 'push',
            route: 'review',
            context: { lessonId: 'authored-week:l2-l02' },
        });

        expect(entered).toMatchObject({ route: 'review', lessonId: 'authored-week:l2-l02' });
        expect(transitionAcademyRoute(entered, { kind: 'back' })).toEqual({
            route: 'station',
            routeHistory: [],
            presentationMode: 'story',
        });
    });

    it('revisits l2-l02 without duplicating or resetting the scheduled canonical card', async () => {
        let now = Date.parse('2026-07-15T10:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const word = libraryStudyVocabulary(
            createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l02'),
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

    it('pins l2-l02 ownership and rejects row, gloss, and layout-only mutations', () => {
        const wrongOwner = structuredClone(lessonPackage());
        mutableRecord(record(wrongOwner).identity).moduleId = 7011919;
        expect(() => exactLibraryVocabularyDefinition('l2-l02', wrongOwner))
            .toThrow(/ownership changed/i);

        const wrongWords = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(wrongWords)[6]!)).words = '一度';
        expect(() => exactLibraryVocabularyDefinition('l2-l02', wrongWords))
            .toThrow(/exact source words changed at row 7/i);

        const inventedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(inventedGloss)[0]!)).meaning = 'to climb';
        expect(() => exactLibraryVocabularyDefinition('l2-l02', inventedGloss))
            .toThrow(/exact source meaning changed at row 1/i);

        const reframedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(reframedGloss)[6]!)).meaning = 'one time';
        expect(() => exactLibraryVocabularyDefinition('l2-l02', reframedGloss))
            .toThrow(/exact source meaning changed at row 7/i);

        const lostLayoutRow = structuredClone(lessonPackage());
        const component = mutableRecord(vocabularyComponent(lostLayoutRow));
        const preStudy = mutableRecord(component.preStudyVocabulary);
        const page = mutableRecord(array(preStudy.sheets)[0]);
        page.verbatimText = String(page.verbatimText).replace('\n15\n', '\n15 invented\n');
        expect(() => exactLibraryVocabularyDefinition('l2-l02', lostLayoutRow))
            .toThrow(/layout-only rows changed/i);
    });
});

function lessonPackage(): unknown {
    return JSON.parse(readFileSync('public/academy/content/lessons/029-l2-l02.json', 'utf8')) as unknown;
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
