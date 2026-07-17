import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import {
    createLibraryVocabularySheetFromPackage,
    libraryStudyVocabulary,
    libraryVocabularyReviewSeeds,
} from '../../src/academy/content/library-vocabulary-sheet';
import { exactLibraryVocabularyDefinition } from '../../src/academy/content/lesson-27-31-library-vocabulary';
import { loadSenseiVocabularyPrerequisite } from '../../src/academy/content/lesson-vocabulary-prerequisite';
import { attachLibraryReaderVocabulary } from '../../src/academy/integration/library-reader-vocabulary';
import { transitionAcademyRoute } from '../../src/academy/routing/route-history';
import { renderLessonVocabularyPrerequisiteScreen } from '../../src/academy/ui/lesson-vocabulary-prerequisite';
import {
    applyAuthoredVocabularyOverrides,
    AUTHORED_VOCABULARY_ATTRIBUTE,
} from '../../src/reader/lookup/authored-vocabulary';
import { fallbackLookupTermsForCard } from '../../src/reader/lookup/japanese-segments';
import { publicLookupFallbackCards } from '../../src/reader/lookup/public-fallback-cards';
import { createNewTabStudySession } from '../../src/reader/newtab/study-session';
import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import { getAuthoredWeekRegistration } from '../../src/academy/content/lesson-content-registry';
import { committedAuthoredWeekFetcher } from './helpers/authored-week-package';

const PAYLOAD = 'd1296c24f28bc57a83b8c09ce5c591e76d8bae0ea97cf928e4a1b079329a2af4';
const SOURCE_ID = `moodle-vocabulary:6974661:${PAYLOAD}`;
const SOURCE_PAGE = 'public/academy/content/lessons/l2-l11/moodle-new-chapter-23-1-vocabulary-page-1.png';
const SOURCE_PAGE_SHA256 = '4374602cc92bd1a04c8409e3a6a7392fb706f3e038f6afeb9a42aa4ec5ced2f9';

describe('Library SRS l2-l11 exact vocabulary frontier', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => document.body.replaceChildren());

    it('anchors Moodle, Minna 20-25, and Genki 17 while preserving all 16 source rows', () => {
        const input = lessonPackage();
        const definition = exactLibraryVocabularyDefinition('l2-l11', input);
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l11');
        const study = libraryStudyVocabulary(sheet);
        const seeds = libraryVocabularyReviewSeeds(sheet);
        const crosswalk = JSON.parse(readFileSync(
            'public/academy/content/source-pipeline/curriculum-crosswalk.v1.json',
            'utf8',
        )) as { lessons: Array<Record<string, unknown>> };

        expect(crosswalk.lessons.find(lesson => lesson.lessonId === 'l2-l11')).toMatchObject({
            moodle: { moduleId: 6974661 },
            minna: { range: [20, 25] },
            genki: { range: [17, 17] },
            status: 'anchored',
            gaps: [],
        });
        expect(definition).toMatchObject({
            packageId: 'l2-l11',
            packageOrder: 38,
            moduleId: 6974661,
            payloadSha256: PAYLOAD,
            title: 'Handouts/New_Chapter 23-1 Vocabulary Sheet.pdf',
            requireSourceMeaning: true,
        });
        expect(sheet.items).toHaveLength(16);
        expect(sheet.items.map(item => [item.source.page, item.source.row]))
            .toEqual(Array.from({ length: 16 }, (_, index) => [1, index + 1]));
        expect(sheet.items.map(item => item.expression)).toEqual([
            'ききます（聞きます）', 'ききます（聞きます）', 'あるきます（歩きます）',
            'しんごう（信号）', 'おうだんほどう（横断歩道）', 'みち（道）',
            'わたります（渡ります）', 'き を つけます（気を付けます）',
            'かぜ を ひきます（⾵邪を引きます）', 'さびしい（寂しい）',
            'なんかいも（何回も）', 'サイズ', 'かえます（変えます）',
            'こしょうします（故障します）', 'でんしじしょ（電⼦辞書）', 'どうしますか',
        ]);
        expect(sheet.items.filter(item => item.studyStatus === 'canonical').map(item => item.source.row))
            .toEqual([1, 2, 11, 12, 14, 16]);
        expect(sheet.items.filter(item => item.studyStatus === 'quarantined-source-gap').map(item => item.source.row))
            .toEqual([3, 4, 5, 6, 7, 8, 9, 10, 13, 15]);
        expect(study.map(item => [item.expression, item.meaning])).toEqual([
            ['聞く', 'to listen'],
            ['聞く', 'to ask someone about something,\nto inquire, to put a question to\nsomeone'],
            ['何回も', 'many times'],
            ['サイズ', 'size'],
            ['故障する', 'break, fail, break down, be out of\norder'],
            ['どうしますか', 'What will you do, what should I\ndo, what do you/I do etc,\ndepends on the situation.'],
        ]);
        expect(seeds).toHaveLength(6);
        expect(seeds.map(seed => seed.sourceQuestionId)).toEqual(
            sheet.items.filter(item => item.studyStatus === 'canonical').map(item => item.source.id),
        );

        const page = sourcePages(input)[0]!;
        expect(String(page.verbatimText)).toContain('Chapter 23-1 Vocabulary Sheet');
        expect(String(page.verbatimText)).toContain('1                                                    to listen');
        expect(String(page.verbatimText)).toContain('14   こしょうします');
        expect(String(page.verbatimText)).toContain('depends on the situation.');
        const sourcePage = readFileSync(SOURCE_PAGE);
        expect(createHash('sha256').update(sourcePage).digest('hex')).toBe(SOURCE_PAGE_SHA256);
        expect(readFileSync(`docs/${SOURCE_PAGE}`)).toEqual(sourcePage);
        for (const worker of [
            readFileSync('public/academy/sw.js', 'utf8'),
            readFileSync('docs/public/academy/sw.js', 'utf8'),
        ]) {
            expect(worker).toContain('/academy/content/lessons/l2-l11/moodle-new-chapter-23-1-vocabulary-page-1.png');
        }
    });

    it('requires the source rows before the existing varied, repairable lesson chapter', async () => {
        const input = lessonPackage();
        const prerequisite = await loadSenseiVocabularyPrerequisite(
            'authored-week:l2-l11',
            committedAuthoredWeekFetcher(getAuthoredWeekRegistration('l2-l11')),
        );
        const onContinue = vi.fn();
        const screen = renderLessonVocabularyPrerequisiteScreen({
            language: 'en',
            prerequisite,
            onContinue,
        });
        document.body.append(screen);
        screen.querySelector<HTMLButtonElement>('[data-vocabulary-prerequisite-open]')!.click();

        expect(screen.dataset.sourceStatus).toBe('exact-source');
        expect(screen.querySelectorAll('.academy-vocabulary-sheet-word')).toHaveLength(16);
        expect(onContinue).not.toHaveBeenCalled();
        screen.querySelector<HTMLButtonElement>('.academy-vocabulary-sheet-start')!.click();
        expect(onContinue).toHaveBeenCalledOnce();

        const sourceComponent = vocabularyComponent(input);
        expect(array(sourceComponent.exercises).map(record)).toContainEqual(expect.objectContaining({
            kind: 'match',
            curriculumPhase: 'assessed-recognition',
        }));
        const chapter = await loadLessonActivityChapter('l2-l11', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.activity.kind)).toEqual(['academy-occasion-route']);
        expect(chapter?.beats[0]?.activity).toMatchObject({
            provenance: { answerVisibility: 'after-attempt' },
            answerSupport: { earnedHintPolicy: 'explicit-after-attempt' },
        });
        expect(chapter?.beats[0]?.activity.payload).toMatchObject({
            rounds: expect.arrayContaining([
                expect.objectContaining({ hints: expect.arrayContaining([expect.any(Object)]) }),
            ]),
        });
    });

    it('routes only source-glossed rows through Reader, Jiten fallback, and Word to Type', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l11');
        const supported = sheet.items[10]!;
        const surface = document.createElement('span');
        surface.textContent = supported.expression;
        attachLibraryReaderVocabulary(surface, supported);
        const [token] = applyAuthoredVocabularyOverrides({ text: supported.expression, parent: surface }, []);

        expect(token?.card).toMatchObject({
            spelling: 'なんかいも（何回も）',
            reading: 'なんかいも',
            source: 'fallback',
        });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('何回も');

        const lookupMany = vi.fn(async (_terms: string[]) => new Map());
        await publicLookupFallbackCards([token!.card], {
            jitenApiActive: () => false,
            parse: async () => [],
            lookupMany,
            publicSpellingCard: async () => undefined,
        }, { concurrency: 1, jpdbPublicLookup: false });
        expect(lookupMany.mock.calls[0]?.[0]).toContain('何回も');

        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);

        for (const unsupported of [sheet.items[2]!, sheet.items[14]!]) {
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

    it('returns to station and revisits without duplicating provenance or resetting SRS', async () => {
        const entered = transitionAcademyRoute({
            route: 'station' as const,
            routeHistory: [],
            presentationMode: 'story' as const,
        }, {
            kind: 'push',
            route: 'review',
            context: { lessonId: 'authored-week:l2-l11' },
        });
        expect(transitionAcademyRoute(entered, { kind: 'back' })).toEqual({
            route: 'station',
            routeHistory: [],
            presentationMode: 'story',
        });

        const startedAt = Date.parse('2026-07-16T12:00:00.000Z');
        let now = startedAt;
        const repository = new LocalYomuSrsRepository(() => now);
        const word = libraryStudyVocabulary(
            createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l11'),
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

    it('pins mirrors and ledger claims while rejecting unsupported source mutations', () => {
        const sourcePackage = readFileSync('public/academy/content/lessons/038-l2-l11.json');
        expect(createHash('sha256').update(sourcePackage).digest('hex'))
            .toBe('56e2fcdb5952819c2a3958121d23cdd3e75fd8c8eec0a6593165ae990be3dfd6');
        expect(readFileSync('docs/public/academy/content/lessons/038-l2-l11.json')).toEqual(sourcePackage);
        expect(readFileSync('docs/public/academy/content/RESOURCE-LEDGER.json'))
            .toEqual(readFileSync('public/academy/content/RESOURCE-LEDGER.json'));
        const ledger = JSON.parse(readFileSync('public/academy/content/RESOURCE-LEDGER.json', 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l11'))
            .toMatchObject({
                sourcePackage: { sha256: '56e2fcdb5952819c2a3958121d23cdd3e75fd8c8eec0a6593165ae990be3dfd6' },
                claims: {
                    worksheetPagesRendered: 2,
                    sourceVocabularyRowsPreserved: 16,
                    sourceVocabularyRowsRoutedToStudy: 6,
                    sourceVocabularyRowsQuarantinedForMissingGloss: 10,
                    sourceVocabularyMeaningPolicy: 'source-provided-meanings-only',
                    vocabularyPrerequisite: 'required-before-lesson-assessment',
                },
            });

        const wrongOwner = structuredClone(lessonPackage());
        mutableRecord(record(wrongOwner).identity).moduleId = 6974657;
        expect(() => exactLibraryVocabularyDefinition('l2-l11', wrongOwner)).toThrow(/ownership changed/i);

        const wrongWords = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(wrongWords)[0]!)).words = '聞きます';
        expect(() => exactLibraryVocabularyDefinition('l2-l11', wrongWords))
            .toThrow(/exact source words changed at row 1/i);

        const inventedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(inventedGloss)[2]!)).meaning = 'to walk';
        expect(() => exactLibraryVocabularyDefinition('l2-l11', inventedGloss))
            .toThrow(/exact source meaning changed at row 3/i);

        const reframedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(reframedGloss)[13]!)).meaning = 'broken';
        expect(() => exactLibraryVocabularyDefinition('l2-l11', reframedGloss))
            .toThrow(/exact source meaning changed at row 14/i);

        const wrongPage = structuredClone(lessonPackage());
        const preStudy = mutableRecord(vocabularyComponent(wrongPage).preStudyVocabulary);
        mutableRecord(array(preStudy.sheets)[0]).sourceItemId = `moodle:${PAYLOAD}:page:2`;
        expect(() => exactLibraryVocabularyDefinition('l2-l11', wrongPage))
            .toThrow(/source-page ownership changed/i);

        const relabeledProvenance = structuredClone(lessonPackage());
        const source = mutableRecord(record(vocabularyRows(relabeledProvenance)[13]!).source);
        mutableRecord(source.fieldProvenance).meaning = 'yomu-support';
        expect(() => exactLibraryVocabularyDefinition('l2-l11', relabeledProvenance))
            .toThrow(/field provenance changed at row 14/i);
    });
});

function lessonPackage(): unknown {
    return JSON.parse(readFileSync('public/academy/content/lessons/038-l2-l11.json', 'utf8')) as unknown;
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
