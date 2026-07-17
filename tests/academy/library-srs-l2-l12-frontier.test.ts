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
import { renderLessonVocabularyPrerequisiteScreen } from '../../src/academy/ui/lesson-vocabulary-prerequisite';
import {
    applyAuthoredVocabularyOverrides,
    AUTHORED_VOCABULARY_ATTRIBUTE,
} from '../../src/reader/lookup/authored-vocabulary';
import { fallbackLookupTermsForCard } from '../../src/reader/lookup/japanese-segments';
import { createNewTabStudySession } from '../../src/reader/newtab/study-session';
import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import { getAuthoredWeekRegistration } from '../../src/academy/content/lesson-content-registry';
import { committedAuthoredWeekFetcher } from './helpers/authored-week-package';

const PAYLOAD = 'fc585caf40f28fb6e6ab65bc340e563c12d6526ec06556a5057a12793cb17ef5';
const SOURCE_ID = `moodle-vocabulary:8121261:${PAYLOAD}`;
const SOURCE_PAGES = [
    ['moodle-new-chapter-28-1-vocabulary-page-1.png', '42f00e60069eb85cda745a7ce4dab8a8a92a4f1e55451dd73372c642e7009c85'],
    ['moodle-new-chapter-28-1-vocabulary-page-2.png', 'f370746eb6cb754db370f87e90bc384a675c0c3d399a0791149abbc1888a53a3'],
] as const;

describe('Library SRS l2-l12 exact vocabulary frontier', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => document.body.replaceChildren());

    it('preserves all 24 numbered source rows and routes only the ten source-glossed rows', () => {
        const input = lessonPackage();
        const definition = exactLibraryVocabularyDefinition('l2-l12', input);
        const sheet = createLibraryVocabularySheetFromPackage(input, 'l2-l12');
        const study = libraryStudyVocabulary(sheet);
        const seeds = libraryVocabularyReviewSeeds(sheet);
        const crosswalk = JSON.parse(readFileSync(
            'public/academy/content/source-pipeline/curriculum-crosswalk.v1.json',
            'utf8',
        )) as { lessons: Array<Record<string, unknown>> };

        expect(crosswalk.lessons.find(lesson => lesson.lessonId === 'l2-l12')).toMatchObject({
            moodle: { moduleId: 8121261 },
            minna: { range: [28, 28] },
            genki: null,
            status: 'gap-declared',
            gaps: ['missing-genki-prerequisite-anchor'],
        });
        expect(definition).toMatchObject({
            packageId: 'l2-l12',
            packageOrder: 39,
            moduleId: 8121261,
            payloadSha256: PAYLOAD,
            title: 'Handouts/New_Chapter 28-1 Vocabulary Sheet.pdf',
            requireSourceMeaning: true,
            layoutOnlyRows: [25, 26, 27, 28, 29, 30, 31, 32],
        });
        expect(sheet.items).toHaveLength(24);
        expect(sheet.items.map(item => [item.source.page, item.source.row])).toEqual([
            ...Array.from({ length: 16 }, (_, index) => [1, index + 1]),
            ...Array.from({ length: 8 }, (_, index) => [2, index + 17]),
        ]);
        expect(sheet.items.map(item => item.expression)).toEqual([
            'ねころがります（寝転がります）', 'おどります（踊ります）', 'しょうせつ（⼩説）',
            'しょうせつか（⼩説家）', '〜か（〜家）', 'かよいます（通います）', 'メモ', 'メモします',
            'ガム', 'ガムを かみます', 'ちゅういします（注意します）', 'スピーチ', 'げんこう（原稿）',
            'しょうらい（将来）', 'ゆめ（夢）', 'しょうらい の ゆめ（ 将来 の 夢 ）',
            'うります（売ります）', 'うれます（売れます）', 'ばんぐみ（番組）', 'ドラマ',
            'むすめ（娘）', 'むすこ（息⼦）', 'たいてい', 'よく',
        ]);
        expect(sheet.items.filter(item => item.studyStatus === 'canonical').map(item => item.source.row))
            .toEqual([6, 11, 12, 13, 17, 18, 19, 20, 23, 24]);
        expect(sheet.items.filter(item => item.studyStatus === 'quarantined-source-gap').map(item => item.source.row))
            .toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10, 14, 15, 16, 21, 22]);
        expect(study.map(item => [item.expression, item.meaning])).toEqual([
            ['通う', 'commute from place 1 to place 2 /\nbetween place 1 and place 2, make\na trip to and from, go\nto/visit/attend a place\nfrequently/regularly'],
            ['注意する', 'warn, pay/give attention to\nsomething, carefully, be careful of,\ntake care of'],
            ['スピーチ', 'speech'],
            ['原稿', 'manuscript, draft'],
            ['売る', 'to sell'],
            ['売れる', 'sell, be sold\n*intransitive verb\n(自動詞／じどうし)'],
            ['番組', 'programme'],
            ['ドラマ', 'drama'],
            ['たいてい', 'usually, mostly\nfrequency ratio 70-80%\n*it’s about your habit'],
            ['よく', 'often\nfrequency ratio 70-80%\n*it’s more about how frequents'],
        ]);
        expect(seeds).toHaveLength(10);
        expect(seeds.map(seed => seed.sourceQuestionId)).toEqual(
            sheet.items.filter(item => item.studyStatus === 'canonical').map(item => item.source.id),
        );

        const pages = sourcePages(input);
        expect(String(pages[0]?.verbatimText)).toContain('Chapter 28-1 Vocabulary Sheet');
        expect(String(pages[0]?.verbatimText)).toContain('commute from place 1 to place 2 /');
        expect(String(pages[1]?.verbatimText)).toContain('*it’s more about how frequents');
        for (const row of [25, 26, 27, 28, 29, 30, 31, 32]) {
            expect(String(pages[1]?.verbatimText)).toMatch(new RegExp(`\\n${row}\\n\\n`));
        }
    });

    it('teaches vocabulary before the existing varied, hintable, repairable lesson', async () => {
        const input = lessonPackage();
        const prerequisite = await loadSenseiVocabularyPrerequisite(
            'authored-week:l2-l12',
            committedAuthoredWeekFetcher(getAuthoredWeekRegistration('l2-l12')),
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
        expect(screen.querySelectorAll('.academy-vocabulary-sheet-word')).toHaveLength(24);
        expect(onContinue).not.toHaveBeenCalled();
        screen.querySelector<HTMLButtonElement>('.academy-vocabulary-sheet-start')!.click();
        expect(onContinue).toHaveBeenCalledOnce();

        const sourceComponent = vocabularyComponent(input);
        expect(array(sourceComponent.exercises).map(record)).toContainEqual(expect.objectContaining({
            kind: 'match',
            curriculumPhase: 'assessed-recognition',
        }));
        const chapter = await loadLessonActivityChapter('l2-l12', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.activity.kind)).toEqual([
            'academy-nagara-workshop', 'academy-bank-listening-cloze', 'academy-favor-direction-listening',
        ]);
        const activities = chapter!.beats.map(beat => record(beat.activity));
        expect(activities.every(activity => record(activity.provenance).answerVisibility === 'after-attempt')).toBe(true);
        expect(activities.every(activity => record(activity.answerSupport).earnedHintPolicy === 'explicit-after-attempt')).toBe(true);
        expect(record(activities[0]!.payload).rounds).toEqual(expect.arrayContaining([
            expect.objectContaining({ hints: expect.arrayContaining([expect.any(Object)]) }),
        ]));
        expect(record(record(record(activities[0]!.payload).feedback).lapse).repairPrompt)
            .toEqual(expect.objectContaining({ en: expect.stringContaining('Repair only the visible joins') }));
    });

    it('routes supported rows through Reader and SRS while keeping source gaps quarantined', async () => {
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage(), 'l2-l12');
        const supported = sheet.items[22]!;
        const surface = document.createElement('span');
        surface.textContent = supported.expression;
        attachLibraryReaderVocabulary(surface, supported);
        const [token] = applyAuthoredVocabularyOverrides({ text: supported.expression, parent: surface }, []);

        expect(token?.card).toMatchObject({ spelling: 'たいてい', reading: 'たいてい', source: 'fallback' });
        expect(fallbackLookupTermsForCard(token!.card)).toContain('たいてい');
        const steps = createNewTabStudySession(token!.card, {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasRecallCloze: false,
            stepOrder: ['type-word', 'speaking', 'word'],
        }).steps.map(step => step.kind);
        expect(steps.indexOf('type-word')).toBe(steps.indexOf('word') + 1);

        for (const unsupported of [sheet.items[0]!, sheet.items[20]!]) {
            const unsupportedSurface = document.createElement('span');
            unsupportedSurface.textContent = unsupported.expression;
            attachLibraryReaderVocabulary(unsupportedSurface, unsupported);
            expect(unsupportedSurface.hasAttribute(AUTHORED_VOCABULARY_ATTRIBUTE)).toBe(false);
            expect(applyAuthoredVocabularyOverrides({
                text: unsupported.expression,
                parent: unsupportedSurface,
            }, [])).toEqual([]);
        }

        const startedAt = Date.parse('2026-07-16T12:00:00.000Z');
        let now = startedAt;
        const repository = new LocalYomuSrsRepository(() => now);
        const word = libraryStudyVocabulary(sheet)[0]!;
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
        expect((await repository.queue(1)).cards).toEqual([]);
        now = startedAt + 2 * 86_400_000;
        expect((await repository.queue(1)).cards[0]).toMatchObject({ dueAt: now, state: ['due'] });
    });

    it('pins mirrors, offline claims, and mutation rejection without promoting word cards', () => {
        const sourcePackage = readFileSync('public/academy/content/lessons/039-l2-l12.json');
        expect(createHash('sha256').update(sourcePackage).digest('hex'))
            .toBe('55b200a9a89971ed0f4272bfc53c95c8e318677d9c649d41dc90ad909044af30');
        expect(readFileSync('docs/public/academy/content/lessons/039-l2-l12.json')).toEqual(sourcePackage);
        for (const [filename, sha256] of SOURCE_PAGES) {
            const sourcePage = readFileSync(`public/academy/content/lessons/l2-l12/${filename}`);
            expect(createHash('sha256').update(sourcePage).digest('hex')).toBe(sha256);
            expect(readFileSync(`docs/public/academy/content/lessons/l2-l12/${filename}`)).toEqual(sourcePage);
            for (const worker of [
                readFileSync('public/academy/sw.js', 'utf8'),
                readFileSync('docs/public/academy/sw.js', 'utf8'),
            ]) expect(worker).toContain(`/academy/content/lessons/l2-l12/${filename}`);
        }
        expect(readFileSync('docs/public/academy/content/RESOURCE-LEDGER.json'))
            .toEqual(readFileSync('public/academy/content/RESOURCE-LEDGER.json'));
        const ledger = JSON.parse(readFileSync('public/academy/content/RESOURCE-LEDGER.json', 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l12'))
            .toMatchObject({
                sourcePackage: { sha256: '55b200a9a89971ed0f4272bfc53c95c8e318677d9c649d41dc90ad909044af30' },
                claims: {
                    worksheetPagesRendered: 6,
                    sourceVocabularyRowsPreserved: 24,
                    sourceVocabularyRowsRoutedToStudy: 10,
                    sourceVocabularyRowsQuarantinedForMissingGloss: 14,
                    sourceVocabularyLayoutOnlyRowsPreserved: 8,
                    sourceVocabularyMeaningPolicy: 'source-provided-meanings-only',
                    vocabularyPrerequisite: 'required-before-lesson-assessment',
                },
                unconverted: expect.arrayContaining([
                    expect.stringContaining('word-card rows remain quarantined'),
                ]),
            });

        const wrongOwner = structuredClone(lessonPackage());
        mutableRecord(record(wrongOwner).identity).moduleId = 6974661;
        expect(() => exactLibraryVocabularyDefinition('l2-l12', wrongOwner)).toThrow(/ownership changed/i);

        const wrongWords = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(wrongWords)[0]!)).words = '寝転がる';
        expect(() => exactLibraryVocabularyDefinition('l2-l12', wrongWords))
            .toThrow(/exact source words changed at row 1/i);

        const inventedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(inventedGloss)[0]!)).meaning = 'to lie down';
        expect(() => exactLibraryVocabularyDefinition('l2-l12', inventedGloss))
            .toThrow(/exact source meaning changed at row 1/i);

        const reframedGloss = structuredClone(lessonPackage());
        mutableRecord(exact(vocabularyRows(reframedGloss)[5]!)).meaning = 'commute regularly';
        expect(() => exactLibraryVocabularyDefinition('l2-l12', reframedGloss))
            .toThrow(/exact source meaning changed at row 6/i);

        const wrongPage = structuredClone(lessonPackage());
        const preStudy = mutableRecord(vocabularyComponent(wrongPage).preStudyVocabulary);
        mutableRecord(array(preStudy.sheets)[0]).sourceItemId = `moodle:${PAYLOAD}:page:2`;
        expect(() => exactLibraryVocabularyDefinition('l2-l12', wrongPage))
            .toThrow(/source-page ownership changed/i);
    });
});

function lessonPackage(): unknown {
    return JSON.parse(readFileSync('public/academy/content/lessons/039-l2-l12.json', 'utf8')) as unknown;
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
