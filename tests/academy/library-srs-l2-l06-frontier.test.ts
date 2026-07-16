import { readFileSync } from 'node:fs';

import {
    createLibraryVocabularySheetFromPackage,
    libraryStudyVocabulary,
    libraryVocabularyReviewSeeds,
} from '../../src/academy/content/library-vocabulary-sheet';
import { exactLibraryVocabularyDefinition } from '../../src/academy/content/lesson-27-31-library-vocabulary';
import { worldRouteForPlace } from '../../src/academy/domain/world-locations';
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

const PAYLOAD = '32097fd886f557806cbecf84e943bf8b0b919ff32c6367ba4fddab5c88b11283';
const SOURCE_ID = `moodle-vocabulary:6974652:${PAYLOAD}`;

describe('Library SRS l2-l06 exact vocabulary frontier', () => {
    beforeEach(() => localStorage.clear());

    it('preserves both verbatim pages and admits only unambiguous source-glossed rows', () => {
        const input = lessonPackage();
        const definition = exactLibraryVocabularyDefinition('l2-l06', input);
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l06');
        const study = libraryStudyVocabulary(sheet);
        const seeds = libraryVocabularyReviewSeeds(sheet);

        expect(definition).toMatchObject({
            packageId: 'l2-l06',
            moduleId: 6974652,
            payloadSha256: PAYLOAD,
            requireSourceMeaning: true,
            ambiguousSourceMeaningRows: [34],
            layoutOnlyRows: [],
        });
        expect(sheet.items).toHaveLength(35);
        expect(sheet.items.map(item => [item.source.page, item.source.row])).toEqual([
            ...Array.from({ length: 17 }, (_, index) => [1, index + 1]),
            ...Array.from({ length: 18 }, (_, index) => [2, index + 18]),
        ]);
        expect(sheet.items.map(item => item.expression))
            .toEqual(vocabularyRows(input).map(row => exact(row).words));
        expect(sheet.items.filter(item => item.studyStatus === 'quarantined-source-gap').map(item => item.source.row))
            .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15, 16, 17, 18, 22, 23]);
        expect(sheet.items[33]?.studyStatus).toBe('quarantined-source-ambiguity');
        expect(sheet.items.filter(item => item.studyStatus === 'canonical')).toHaveLength(18);
        expect(study.map(item => [item.expression, item.meaning])).toEqual([
            ['最近', 'recently, these days'],
            ['たぶん', 'probably, perhaps, maybe'],
            ['きっと', 'surely, definitely'],
            ['役に立つ', 'be useful'],
            ['本当に', 'really'],
            ['本当', 'true, real'],
            ['嘘', 'lie, fake'],
            ['気をつける', 'pay attention, take care'],
            ['について', 'about 〜, concerning 〜'],
            ['クイズ', 'Quiz'],
            ['地理', 'geography'],
            ['島国', 'island country'],
            ['島', 'island'],
            ['海岸線', 'Coast line'],
            ['キロメートル', '- kilometer'],
            ['久しぶり', 'It’s been a long time (since we last met).'],
            ['飲む', 'How about drinking 〜 or something?'],
            ['帰る', 'I have to get home now…'],
        ]);
        expect(seeds).toHaveLength(18);
        expect(seeds.map(seed => seed.content.meanings[0])).toEqual(study.map(item => item.meaning));
        expect(seeds.every(seed => seed.sourceQuestionId?.startsWith(SOURCE_ID))).toBe(true);

        const pages = sourcePages(input);
        expect(pages.map(page => page.page)).toEqual([1, 2]);
        expect(String(pages[0]?.verbatimText)).toContain('Chapter 21-1 Vocabulary Sheet');
        expect(String(pages[0]?.verbatimText)).toContain('ぶちょう（部⻑）');
        expect(String(pages[1]?.verbatimText)).toContain('For reading exercise');
        expect(String(pages[1]?.verbatimText)).toContain('For conversation listening exercise');
        expect(String(pages[1]?.verbatimText)).toContain('34   もちろん');
    });

    it('routes a supported row through Reader, Jiten fallback, and Word to Type only', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l06');
        const supported = sheet.items[9]!;
        const surface = document.createElement('span');
        surface.textContent = supported.expression;
        attachLibraryReaderVocabulary(surface, supported);
        const [token] = applyAuthoredVocabularyOverrides({ text: supported.expression, parent: surface }, []);

        expect(token?.card).toMatchObject({
            spelling: 'さいきん（最近）',
            reading: 'さいきん',
            source: 'fallback',
            fallbackLookupTerms: ['最近'],
        });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('最近');

        const lookupMany = vi.fn(async (_terms: string[]) => new Map());
        await publicLookupFallbackCards([token!.card], {
            jitenApiActive: () => false,
            parse: async () => [],
            lookupMany,
            publicSpellingCard: async () => undefined,
        }, { concurrency: 1, jpdbPublicLookup: false });
        expect(lookupMany.mock.calls[0]?.[0]).toContain('最近');

        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);

        for (const unsupported of [sheet.items[0]!, sheet.items[33]!]) {
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

    it('returns from l2-l06 to the exact originating library', () => {
        const libraryRoute = worldRouteForPlace('library');
        expect(libraryRoute).toBe('review');
        const entered = transitionAcademyRoute({
            route: libraryRoute,
            routeHistory: [],
            presentationMode: 'story' as const,
        }, {
            kind: 'push',
            route: 'review',
            context: { lessonId: 'authored-week:l2-l06' },
        });

        expect(entered).toMatchObject({ route: 'review', lessonId: 'authored-week:l2-l06' });
        expect(transitionAcademyRoute(entered, { kind: 'back' })).toEqual({
            route: 'review',
            routeHistory: [],
            presentationMode: 'story',
        });
    });

    it('revisits l2-l06 idempotently without duplicating or resetting a scheduled card', async () => {
        const startedAt = Date.parse('2026-07-15T10:00:00.000Z');
        let now = startedAt;
        const repository = new LocalYomuSrsRepository(() => now);
        const word = libraryStudyVocabulary(
            createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l06'),
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

    it('pins l2-l06 ownership and rejects row, gloss, ambiguity, and page mutations', () => {
        const wrongOwner = structuredClone(lessonPackage());
        mutableRecord(record(wrongOwner).identity).moduleId = 6974653;
        expect(() => exactLibraryVocabularyDefinition('l2-l06', wrongOwner))
            .toThrow(/ownership changed/i);

        const wrongWords = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(wrongWords)[9]!)).words = '最近';
        expect(() => exactLibraryVocabularyDefinition('l2-l06', wrongWords))
            .toThrow(/exact source words changed at row 10/i);

        const inventedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(inventedGloss)[0]!)).meaning = 'to think';
        expect(() => exactLibraryVocabularyDefinition('l2-l06', inventedGloss))
            .toThrow(/exact source meaning changed at row 1/i);

        const reframedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(reframedGloss)[9]!)).meaning = 'recently';
        expect(() => exactLibraryVocabularyDefinition('l2-l06', reframedGloss))
            .toThrow(/exact source meaning changed at row 10/i);

        const resolvedWithoutEvidence = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(resolvedWithoutEvidence)[33]!)).meaning = 'of course';
        expect(() => exactLibraryVocabularyDefinition('l2-l06', resolvedWithoutEvidence))
            .toThrow(/exact source meaning changed at row 34/i);

        const wrongPage = structuredClone(lessonPackage());
        const preStudy = mutableRecord(vocabularyComponent(wrongPage).preStudyVocabulary);
        mutableRecord(array(preStudy.sheets)[0]).sourceItemId = `moodle:${PAYLOAD}:page:2`;
        expect(() => exactLibraryVocabularyDefinition('l2-l06', wrongPage))
            .toThrow(/source-page ownership changed/i);
    });
});

function lessonPackage(): unknown {
    return JSON.parse(readFileSync('public/academy/content/lessons/033-l2-l06.json', 'utf8')) as unknown;
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
