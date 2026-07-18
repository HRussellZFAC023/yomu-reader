import { existsSync } from 'node:fs';
import path from 'node:path';
import lessonPackage from '../../public/academy/content/lessons/002-l1-l01.json';
import resourceLedger from '../../public/academy/content/RESOURCE-LEDGER.json';
import {
    createLessonOneGreetingWorksheetBeat,
    createLessonOneSourceVocabularyActivities,
} from '../../src/academy/content/lesson-one-greeting-worksheet';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { greetingWorksheetPlugin, type GreetingWorksheetModel } from '../../src/academy/minigames/greeting-worksheet';
import { sourceVocabularySheetPlugin } from '../../src/academy/minigames/source-vocabulary-sheet';
import { createLibraryVocabularySheet } from '../../src/academy/content/library-vocabulary-sheet';
import { loadSenseiVocabularyPrerequisite } from '../../src/academy/content/lesson-vocabulary-prerequisite';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { renderLessonVocabularyPrerequisiteScreen } from '../../src/academy/ui/lesson-vocabulary-prerequisite';
import type { KanjiWritingService } from '../../src/academy/integration/yomu-bridge';
import { sha256File } from './helpers/hash-memo';

const runtime = createActivityRuntime([greetingWorksheetPlugin]);
const vocabularyRuntime = createActivityRuntime([sourceVocabularySheetPlugin]);

afterEach(() => document.body.replaceChildren());

describe('Lesson 1 Moodle greeting worksheet digitisation', () => {
    it('preserves the whole source vocabulary sheet in exact page and row order', () => {
        const rows = createLessonOneSourceVocabularyActivities();
        expect(rows).toHaveLength(27);
        expect(rows.every(row => vocabularyRuntime.validate(row).length === 0)).toBe(true);
        expect(rows.map(row => row.provenance.locus)).toEqual([
            ...Array.from({ length: 15 }, (_, index) => ({ page: 1, row: index + 1 })),
            ...Array.from({ length: 12 }, (_, index) => ({ page: 2, row: index + 16 })),
        ]);
        expect(rows[0]?.payload.exact).toEqual({
            words: '(お)なまえ は？', pronunciation: 'o-namae wa?', meaning: 'May I have your name?',
        });
        expect(rows[6]?.payload.exact).toEqual({ words: 'こんにちは', pronunciation: null, meaning: null });
        expect(rows.at(-1)?.payload.exact.words).toBe('〜さん');

        const library = createLibraryVocabularySheet();
        expect(library.title).toBe('Chapter 1-1 Vocabulary Sheet');
        expect(library.items).toHaveLength(27);
        expect(library.items[0]?.source).toEqual({
            id: rows[0]?.sourceQuestionId,
            title: 'Chapter 1-1 Vocabulary Sheet',
            page: 1,
            row: 1,
        });
    });

    it('keeps the handout’s source instruction and examples before the source-image worksheet', () => {
        const model = worksheet();
        expect(runtime.validate(model)).toEqual([]);
        expect(model.payload.sourceInstruction).toBe(
            'What are these people saying? Write appropriate expressions for each situation in Japanese with Romaji. *if you want to try to write them in Hiragana, please do so ☺',
        );
        expect(model.payload.teaching.map(step => [step.pattern, step.example])).toEqual([
            ['Noun 1 は Noun 2 です。', 'わたし は マイク・ミラー です。'],
            ['こんにちは。（わたし は）マイク・ミラー です。', 'B さん はじめまして。どうぞ よろしく おねがいします。'],
        ]);
        expect(model.payload.prompts.map(prompt => prompt.sourceQuestionId)).toEqual(
            Array.from({ length: 6 }, (_, index) =>
                `moodle-worksheet:0e047a101c7607ffc74a0b64e5b1a1ccafc6227bf0e99c7698017ac727c1e66b:p1:prompt-${index + 1}`),
        );
        expect(model.provenance.homework).toMatchObject({
            sourceAnswerKeyStatus: 'not-present-in-digitized-corpus',
            gradingKey: 'yomu-contextual-key-derived-from-taught-source-expressions',
        });
        expect(existsSync(path.resolve(`public${model.provenance.homework.imageUrl}`))).toBe(true);
    });

    it('grades the six image prompts deterministically and permits the two taught morning variants', () => {
        const model = worksheet();
        const pass = runtime.evaluate(model, response(['ohayou-gozaimasu', 'konnichiwa', 'konbanwa', 'itadakimasu', 'itadakimasu', 'gochisousama']));
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds).toHaveLength(6);

        const lapse = runtime.evaluate(model, response(['konnichiwa', 'konnichiwa', 'konbanwa', 'itadakimasu', 'itadakimasu', 'gochisousama']));
        expect(lapse.result).toMatchObject({ outcome: 'lapse', score: 5 / 6, errorTags: ['l1-l01-greeting-morning-school'] });
        expect(lapse.reviewSeeds).toEqual([
            expect.objectContaining({ sourceQuestionId: model.payload.prompts[0]?.sourceQuestionId, reason: 'repair' }),
        ]);
        expect(() => runtime.evaluate(model, { answers: [] })).toThrow(/Every source image prompt/i);
    });

    it('renders teaching, the original worksheet image, and all six selections in that order', async () => {
        const host = document.createElement('main');
        document.body.append(host);
        const controller = runtime.mount(worksheet(), {
            language: 'en', replace(view) { host.replaceChildren(view); }, announce() {},
        }, vi.fn());
        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!;
        const image = host.querySelector<HTMLImageElement>('.academy-greeting-worksheet-image')!;
        const form = host.querySelector('form')!;
        expect(teaching.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(image.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(image.getAttribute('src')).toBe('/academy/content/lessons/l1-l01/moodle-hw-chapter-1-1-greeting-page-1.png');
        expect(form.querySelectorAll('select')).toHaveLength(6);
        expect(host.textContent).toContain('Thank you for the meal. (before eating)');
        expect(host.textContent).not.toContain('not-present-in-digitized-corpus');
        controller.dispose();
    });

    it('places the Moodle worksheet before the Genki and class practice beats', async () => {
        const chapter = await loadLessonActivityChapter('l1-l01', {
            lookup: async () => null,
        } satisfies KanjiWritingService);
        expect(chapter?.beats.map(beat => beat.activity.kind)).toEqual([
            'academy-greeting-worksheet',
            'academy-sentence-builder',
            'academy-sentence-builder',
            'academy-class-simulator',
        ]);
    });

    it('opens all 27 source rows before l1-l01 practice can continue', async () => {
        const prerequisite = await loadSenseiVocabularyPrerequisite('authored-week:l1-l01');
        const onContinue = vi.fn(async () => undefined);
        const screen = renderLessonVocabularyPrerequisiteScreen({
            language: 'en',
            prerequisite,
            onContinue,
        });
        document.body.append(screen);

        await new Promise(resolve => requestAnimationFrame(resolve));

        const layer = screen.querySelector<HTMLElement>('.academy-vocabulary-sheet-layer');
        expect(layer).not.toBeNull();
        expect(layer?.querySelectorAll('.academy-vocabulary-sheet-word')).toHaveLength(27);
        expect(layer?.querySelector<HTMLElement>('.academy-vocabulary-sheet-word')?.dataset).toMatchObject({
            sourcePage: '1',
            sourceRow: '1',
        });
        expect(onContinue).not.toHaveBeenCalled();

        layer?.querySelector<HTMLButtonElement>('.academy-vocabulary-sheet-start')?.click();
        await vi.waitFor(() => expect(onContinue).toHaveBeenCalledOnce());
    });

    it('records local coverage without inflating global legacy totals or fabricating a source answer key', () => {
        const handout = lessonPackage.sourceCoverage.coverageMap.find(row =>
            row.payloadSha256 === '42776eb5736dc44caff1809419e41eb189998d3dda04401262cde705676c3fe9');
        const homework = lessonPackage.sourceCoverage.coverageMap.find(row =>
            row.payloadSha256 === '0e047a101c7607ffc74a0b64e5b1a1ccafc6227bf0e99c7698017ac727c1e66b');
        const greetingReference = lessonPackage.sourceCoverage.coverageMap.find(row =>
            row.payloadSha256 === '843ee30241b15d04c7b1990e8c0f76640379e81be778fbb4bfdf082565e08d6c');
        expect(handout).toMatchObject({ status: 'exact-source-instruction-and-examples-preserved' });
        expect(greetingReference).toMatchObject({ status: 'exact-source-expression-reference-preserved' });
        expect(homework).toMatchObject({ status: 'source-image-preserved-yomu-contextual-key' });
        expect(resourceLedger.worksheetDigitisation).toMatchObject({
            lessonId: 'l1-l01',
            moodleModuleId: 5777762,
            claims: {
                sourceVocabularyRowsPreserved: 27,
                imageDependentSourcePromptsDelivered: 6,
                sourceAnswerKeysVerified: 0,
                yomuContextualAnswerKeys: 6,
                listeningLinksVerified: 0,
            },
        });
    });

    it('measures cumulative JLPT readiness from assessed source evidence rather than filler count', () => {
        const readiness = lessonPackage.curriculumReadiness;
        expect(readiness.measurementPolicy.unit).toBe('assessed-source-grounded-skill-evidence');
        expect(readiness.measurementPolicy.excludedFromReadiness).toContain('raw-exercise-count');
        expect(readiness.measurementPolicy.cumulativeBandInvariant).toEqual({
            N5: ['N5'],
            N4: ['N5', 'N4'],
            N3: ['N5', 'N4', 'N3'],
            N2: ['N5', 'N4', 'N3', 'N2'],
            N1: ['N5', 'N4', 'N3', 'N2', 'N1'],
        });

        const domains = readiness.weekEvidence.jlptDomains;
        expect(domains.map(domain => domain.domain)).toEqual(['vocabulary', 'grammar', 'reading', 'listening']);
        expect(domains.filter(domain => domain.status.startsWith('assessed-source-grounded'))).toHaveLength(
            readiness.weekEvidence.assessedSourceGroundedJlptDomainCount,
        );
        expect(readiness.weekEvidence).toMatchObject({
            band: 'N5',
            readinessStatus: 'insufficient-evidence-for-band-readiness',
            assessedSourceGroundedJlptDomainCount: 2,
            jlptDomainCount: 4,
        });
        expect(readiness.validationBacklog.map(item => item.id)).toEqual([
            'l1-l01-readiness-vocabulary',
            'l1-l01-readiness-reading',
            'l1-l01-readiness-speaking',
            'l1-l01-genki-workbook-parity',
            'l1-l01-moodle-member-parity',
        ]);
    });

    it('keeps Moodle gaps, Genki delivery, and the byte-audited Minna scope reference honest', () => {
        const mappedGaps = lessonPackage.sourceCoverage.coverageMap
            .filter(row => row.status.includes('gap'))
            .map(row => row.payloadSha256);
        expect(lessonPackage.sourceCoverage.gaps.map(gap => gap.payloadSha256)).toEqual(mappedGaps);
        expect(lessonPackage.provenance).toMatchObject({
            authoringPolicy: 'source-faithful-yomu-adaptation',
        });
        expect(lessonPackage.runtimeReachability).toMatchObject({
            exactExerciseAdapter: '13-answer-gated-authored-activities-delivered',
            packageHashRegistration: 'registered-in-authored-week-adapter',
            pluginCatalogRegistration: 'registered-in-lesson-content-and-activity-catalogs',
            audioPairing: 'two-question-map-and-byte-verified-soya-task-bindings;original-yomu-dialogue-text-only',
        });

        const genki = lessonPackage.genkiInteractiveActivities[0]!.runtime;
        expect(genki).toMatchObject({
            bindingStatus: 'first-two-source-items-delivered-by-lesson-activity-catalog',
            remainingSourceItemCount: 4,
            deliveredSourceQuestionIds: [
                'genki-2e:l1-l01:workbook-5:ogawa-japanese',
                'genki-2e:l1-l01:workbook-5:takeda-teacher',
            ],
        });

        const minna = lessonPackage.sourceRootAudit.roots.find(root => root.id === 'japanese-minna-shokyu-i-2e');
        expect(minna).toMatchObject({
            status: 'audited-scope-reference',
            fileSha256: '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229',
            title: 'Minna no Nihongo 2nd Edition Shokyu I',
            pageCount: 326,
        });

        const minnaPath = '/Users/heru/Documents/Japanese/Resource Packs/Japanese Language Learning Pack - Learn Japanese!/03 Grammar and Vocabulary/02 Minna no Nihongo Shokyu/Minna no Nihongo Shokyu I/Minna no Nihongo Shokyu I Dai 2-Han Honsatsu Kanji-Kana.pdf';
        if (existsSync(minnaPath)) {
            expect(sha256File(minnaPath)).toBe(minna?.fileSha256);
        }
    });
});

function worksheet(): GreetingWorksheetModel {
    return createLessonOneGreetingWorksheetBeat().activity as GreetingWorksheetModel;
}

function response(optionIds: readonly string[]) {
    return {
        answers: worksheet().payload.prompts.map((prompt, index) => ({
            promptId: prompt.id,
            optionId: optionIds[index]!,
        })),
    };
}
