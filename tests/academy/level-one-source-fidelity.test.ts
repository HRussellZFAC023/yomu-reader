import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { parseAuthoredWeekPackage } from '../../src/academy/content/authored-week-schema';

const REPOSITORY_ROOT = path.resolve('.');
const LESSON_DIRECTORY = path.join(REPOSITORY_ROOT, 'public/academy/content/lessons');
const GENKI_ROOT = '/Users/heru/Documents/Japanese/Resource Packs/genki-study-resources-master 2';
const LESSONS_ROOT = '/Users/heru/Documents/Japanese/Lessons';
const VOCABULARY_ROOT = '/Users/heru/Documents/Japanese/Vocabulary';
const REQUESTED_SOURCE_ROOTS = [GENKI_ROOT, LESSONS_ROOT, VOCABULARY_ROOT] as const;
const PUBLIC_SOURCE_REFERENCES = [
    'japanese-resources://Resource Packs/genki-study-resources-master 2',
    'japanese-resources://Lessons',
    'japanese-resources://Vocabulary',
] as const;
const PUBLIC_CATALOG_PATH = path.join(
    REPOSITORY_ROOT,
    'public/academy/content/source-pipeline/catalog.v2.json',
);
const PRIVATE_LEDGER_PATH = path.join(
    REPOSITORY_ROOT,
    'artifacts/yomu-academy/source-pipeline/private-ledger.v1.json',
);
const LEVEL_ONE_FILES = Array.from({ length: 26 }, (_, index) =>
    `${String(index + 2).padStart(3, '0')}-l1-l${String(index + 1).padStart(2, '0')}.json`);
const EXPECTED_VOCABULARY_GAPS = new Set([
    'l1-l11',
    'l1-l12',
    'l1-l13',
    'l1-l14',
    'l1-l21',
    'l1-l22',
    'l1-l23',
    'l1-l24',
    'l1-l25',
    'l1-l26',
]);

type RecordValue = Record<string, unknown>;

interface LessonEntry {
    readonly filename: string;
    readonly value: RecordValue;
}

interface ExerciseEntry {
    readonly filename: string;
    readonly lesson: RecordValue;
    readonly component: RecordValue;
    readonly exercise: RecordValue;
}

function record(value: unknown, label = 'value'): RecordValue {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} must be an object.`);
    }
    return value as RecordValue;
}

function array(value: unknown, label = 'value'): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}

function text(value: unknown, label = 'value'): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new TypeError(`${label} must be a non-empty string.`);
    }
    return value;
}

function sha256(value: string | Buffer): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function loadJson(filePath: string): RecordValue {
    return record(JSON.parse(fs.readFileSync(filePath, 'utf8')), filePath);
}

function componentRecords(lesson: RecordValue): readonly RecordValue[] {
    return array(lesson.components, `${lesson.id}.components`).map((value, index) =>
        record(value, `${lesson.id}.components[${index}]`));
}

function exerciseEntries(entry: LessonEntry): readonly ExerciseEntry[] {
    return componentRecords(entry.value).flatMap(component =>
        ((component.exercises as readonly unknown[] | undefined) ?? []).map(exercise => ({
            filename: entry.filename,
            lesson: entry.value,
            component,
            exercise: record(exercise, `${entry.filename}.exercise`),
        })));
}

function sourceHashPrefixes(lesson: RecordValue): ReadonlySet<string> {
    const coverage = record(lesson.sourceCoverage, `${lesson.id}.sourceCoverage`);
    return new Set(array(coverage.members, `${lesson.id}.sourceCoverage.members`).map(member =>
        text(record(member).payloadSha256).slice(0, 8)));
}

function declaredVocabularyHashes(lesson: RecordValue): ReadonlySet<string> {
    const preStudy = record(lesson.preStudyVocabulary, `${lesson.id}.preStudyVocabulary`);
    const sourceIds = [
        preStudy.primarySourceId,
        ...((preStudy.additionalSourceIds as readonly unknown[] | undefined) ?? []),
    ];
    return new Set(sourceIds.flatMap(value => {
        if (typeof value !== 'string' || !value.startsWith('moodle-vocabulary:')) return [];
        const hash = value.match(/:([a-f0-9]{64})$/u)?.[1];
        return hash ? [hash] : [];
    }));
}

function getGenkiAlternatives(
    template: string,
    replacements: string,
    asArray?: boolean,
): string | readonly string[] {
    const replacementValues = replacements.split('|');
    const values: string[] = [];
    for (let mask = 0; mask < 2 ** replacementValues.length; mask += 1) {
        let replacementIndex = 0;
        values.push(template.replace(/\{(.*?)\}/gu, (_whole, original: string) => {
            const index = replacementIndex;
            replacementIndex += 1;
            return ((1 << (replacementValues.length - 1 - index)) & mask)
                ? replacementValues[index]
                : original;
        }));
    }
    return asArray ? values : `%(${values.join('/')})|`;
}

const lessons: readonly LessonEntry[] = LEVEL_ONE_FILES.map(filename => ({
    filename,
    value: loadJson(path.join(LESSON_DIRECTORY, filename)),
}));
const allExercises = lessons.flatMap(exerciseEntries);
const sourceQuestions = allExercises.filter(({ exercise }) =>
    typeof exercise.sourceQuestionId === 'string');
const moodleSourceQuestions = sourceQuestions.filter(({ exercise }) =>
    text(exercise.sourceQuestionId).startsWith('moodle:'));
const publicCatalog = loadJson(PUBLIC_CATALOG_PATH);
const privateLedger = loadJson(PRIVATE_LEDGER_PATH);
const catalogMembers = new Map(
    array(publicCatalog.memberOccurrences).map(value => {
        const member = record(value);
        return [text(member.id), member] as const;
    }),
);
const catalogArchives = new Map(
    array(publicCatalog.archiveOccurrences).map(value => {
        const archive = record(value);
        return [text(archive.id), archive] as const;
    }),
);
const privateMembers = new Map(
    array(privateLedger.memberOccurrences).map(value => {
        const member = record(value);
        return [text(member.id), member] as const;
    }),
);
const privateArchives = new Map(
    array(privateLedger.archiveOccurrences).map(value => {
        const archive = record(value);
        return [text(archive.id), archive] as const;
    }),
);

describe('Level 1 source fidelity and production readiness', () => {
    it('owns exactly 26 parseable packages with unique titles, components, and exercise IDs', () => {
        expect(lessons.map(entry => entry.filename)).toEqual(LEVEL_ONE_FILES);
        const lessonTitles = { en: new Set<string>(), ja: new Set<string>() };
        const globalExerciseIds = new Set<string>();

        for (const { filename, value: lesson } of lessons) {
            expect(parseAuthoredWeekPackage(lesson).id, filename).toBe(lesson.id);
            const titleValue = record(lesson.title, `${filename}.title`);
            for (const language of ['en', 'ja'] as const) {
                const lessonTitle = text(titleValue[language], `${filename}.title.${language}`);
                expect(lessonTitles[language].has(lessonTitle), filename).toBe(false);
                lessonTitles[language].add(lessonTitle);
            }

            const componentIds = new Set<string>();
            const componentOrders = new Set<number>();
            const componentTitles = { en: new Set<string>(), ja: new Set<string>() };
            for (const component of componentRecords(lesson)) {
                expect(typeof component.order, filename).toBe('number');
                expect(componentOrders.has(Number(component.order)), filename).toBe(false);
                componentOrders.add(Number(component.order));
                if (typeof component.id === 'string') {
                    expect(componentIds.has(component.id), `${filename}:${component.id}`).toBe(false);
                    componentIds.add(component.id);
                }
                const componentTitle = record(component.title, `${filename}.component.title`);
                for (const language of ['en', 'ja'] as const) {
                    const value = text(componentTitle[language]);
                    expect(componentTitles[language].has(value), `${filename}:${value}`).toBe(false);
                    componentTitles[language].add(value);
                }
            }

            for (const { exercise } of exerciseEntries({ filename, value: lesson })) {
                const exerciseId = text(exercise.id, `${filename}.exercise.id`);
                const globalId = `${lesson.id}/${exerciseId}`;
                expect(globalExerciseIds.has(globalId), globalId).toBe(false);
                globalExerciseIds.add(globalId);
            }
        }
    });

    it('tags every component and exercise with an accurate curriculum phase', () => {
        const allowedPhases = new Set([
            'context',
            'prestudy',
            'instruction',
            'guided-practice',
            'constrained-practice',
            'supported-production',
            'assessed-production',
            'transfer',
        ]);
        for (const { filename, value: lesson } of lessons) {
            for (const component of componentRecords(lesson)) {
                expect(allowedPhases.has(text(component.phase)), filename).toBe(true);
            }
            for (const { exercise } of exerciseEntries({ filename, value: lesson })) {
                expect(allowedPhases.has(text(exercise.phase)), `${filename}:${exercise.id}`).toBe(true);
            }
        }
    });

    it('traces every public Moodle coverage row back to the harvested archive ledger', () => {
        const coverageRows: { filename: string; row: RecordValue }[] = [];
        for (const { filename, value: lesson } of lessons) {
            const coverage = record(lesson.sourceCoverage);
            expect(coverage.harvested, filename).toBe(true);
            const members = array(coverage.members, `${filename}.members`);
            expect(members.length, filename).toBeGreaterThan(0);
            if (typeof coverage.memberFileCount === 'number') {
                expect(coverage.memberFileCount, filename).toBeGreaterThanOrEqual(members.length);
            }
            for (const memberValue of members) {
                expect(text(record(memberValue).payloadSha256), filename).toMatch(/^[a-f0-9]{64}$/u);
            }

            const packageRows = (coverage.coverageMap as readonly unknown[] | undefined) ?? [];
            if (packageRows.length) {
                // Archive member occurrences may carry the same byte payload in
                // multiple folders. Generated ownership is payload-canonical,
                // while coverage rows retain each pedagogical mapping.
                expect(packageRows.length, filename).toBeGreaterThanOrEqual(members.length);
                expect(new Set(packageRows.map(row => text(record(row).payloadSha256))), filename)
                    .toEqual(new Set(members.map(member => text(record(member).payloadSha256))));
            }
            packageRows.forEach(row => coverageRows.push({ filename, row: record(row) }));
        }

        expect(coverageRows.length).toBeGreaterThan(40);
        for (const { filename, row } of coverageRows) {
            const payloadSha256 = text(row.payloadSha256);
            const trace = record(row.sourceTrace, `${filename}:${payloadSha256}.sourceTrace`);
            expect(trace.payloadSha256, filename).toBe(payloadSha256);
            expect(trace.answerVisibility, filename).toBe('after-attempt');
            expect(trace.directReadStatus, filename).toBe('raw-ledger-and-census-verified');
            expect(row.status, filename).not.toBe('covered');

            const memberId = text(trace.memberOccurrenceId);
            const archiveId = text(trace.archiveOccurrenceId);
            const catalogMember = catalogMembers.get(memberId);
            const catalogArchive = catalogArchives.get(archiveId);
            const privateMember = privateMembers.get(memberId);
            const privateArchive = privateArchives.get(archiveId);
            expect(catalogMember, `${filename}:${memberId}`).toBeDefined();
            expect(catalogArchive, `${filename}:${archiveId}`).toBeDefined();
            expect(privateMember, `${filename}:${memberId}`).toBeDefined();
            expect(privateArchive, `${filename}:${archiveId}`).toBeDefined();
            expect(catalogMember?.archiveOccurrenceId).toBe(archiveId);
            expect(catalogMember?.payloadSha256).toBe(payloadSha256);
            expect(catalogMember?.centralDirectoryIndex).toBe(trace.centralDirectoryIndex);
            expect(catalogMember?.classification).toEqual(trace.classification);
            expect(catalogArchive?.sha256).toBe(trace.archiveSha256);
            expect(privateMember?.name).toBe(trace.member);
            expect(privateMember?.payloadSha256).toBe(payloadSha256);
            const relativePath = text(privateArchive?.relativePath)
                .replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
            expect(text(trace.archivePath)).toMatch(new RegExp(`${relativePath}$`, 'u'));
            expect(record(privateArchive?.mapping).moduleId).toBe(trace.moduleId);

            if (String(row.status).includes('gap')) {
                // The status, not a particular sentence, is the contract for an
                // unresolved source field. Copy may change as the projection improves.
                expect(text(row.howCovered), filename).toBeTruthy();
            }
            if (row.status === 'exact-source-vocabulary-preserved') {
                expect(declaredVocabularyHashes(
                    lessons.find(entry => entry.filename === filename)!.value,
                ).has(payloadSha256), filename).toBe(true);
            }
        }
    });

    it('keeps every digitized Moodle question exact, page-traceable, unique, and answer-gated', () => {
        expect(moodleSourceQuestions.length).toBeGreaterThan(40);
        const sourceQuestionIds = new Set<string>();

        for (const { lesson, exercise } of moodleSourceQuestions) {
            const sourceQuestionId = text(exercise.sourceQuestionId);
            expect(sourceQuestionIds.has(sourceQuestionId), sourceQuestionId).toBe(false);
            sourceQuestionIds.add(sourceQuestionId);
            const source = record(exercise.source, `${sourceQuestionId}.source`);
            const prefix = sourceQuestionId.match(/^moodle:\d+:([a-f0-9]{8}):/u)?.[1];
            expect(prefix, sourceQuestionId).toBeDefined();
            expect(text(source.payloadSha256).startsWith(prefix!), sourceQuestionId).toBe(true);
            expect(sourceHashPrefixes(lesson).has(prefix!), sourceQuestionId).toBe(true);
            expect(source.moduleId, sourceQuestionId).toBe(record(lesson.identity).moduleId);
            expect(text(source.archivePath), sourceQuestionId).toContain('/moodle-raw/');
            expect(text(source.archiveSha256), sourceQuestionId).toMatch(/^[a-f0-9]{64}$/u);
            expect(text(source.member), sourceQuestionId).toMatch(/\.(?:docx|pdf)$/u);
            expect(text(source.locus), sourceQuestionId).toBeTruthy();
            expect(exercise.answerVisibility, sourceQuestionId).toBe('after-attempt');

            if (typeof exercise.sourcePromptStatus === 'string') {
                if (sourceQuestionId.includes(':derived-')) {
                    expect(exercise.sourcePromptStatus).toBe(
                        'yomu-derived-guided-question-over-verbatim-source-passage',
                    );
                    expect(exercise.sourceCueExact).toBeUndefined();
                } else {
                    expect(exercise.sourcePromptStatus).toBe('verbatim-source-cue-preserved');
                    expect(text(exercise.sourceCueExact), sourceQuestionId)
                        .toBe(text(record(exercise.prompt).ja));
                }
                const page = Number(source.page);
                expect(page, sourceQuestionId).toBeGreaterThan(0);
                expect(source.pageRenderStatus).toBe('review-artifact-present-not-runtime-asset');
                expect(fs.existsSync(path.join(REPOSITORY_ROOT, text(source.pageRenderArtifact))),
                    sourceQuestionId).toBe(true);
                expect(source.answerVisibility, sourceQuestionId).toBe('after-attempt');
            } else {
                expect(text(exercise.sourcePromptExact), sourceQuestionId).toBeTruthy();
            }
        }
    });

    it('binds every source class task once to a natural cast group and world place', () => {
        for (const { filename, value: lesson } of lessons) {
            const activityIds = exerciseEntries({ filename, value: lesson })
                .filter(({ exercise }) => typeof exercise.sourceQuestionId === 'string')
                .map(({ exercise }) => text(exercise.id));
            if (!activityIds.length) continue;

            const bindings = array(lesson.sourceActivityBindings, `${filename}.sourceActivityBindings`);
            const boundIds: string[] = [];
            for (const value of bindings) {
                const binding = record(value);
                expect(text(binding.place), filename).toMatch(/^academy\/world\//u);
                expect(array(binding.cast).length, filename).toBeGreaterThan(0);
                array(binding.cast).forEach(castId => expect(text(castId), filename).toBeTruthy());
                expect(text(binding.grouping), filename).toBeTruthy();
                expect(text(binding.beat), filename).toBeTruthy();
                expect(binding.sourceTaskPreserved, filename).toBe(true);
                expect(binding.answerVisibility, filename).toBe('after-attempt');
                array(binding.activityIds).forEach(id => boundIds.push(text(id)));
            }
            expect(new Set(boundIds).size, filename).toBe(boundIds.length);
            expect(boundIds.sort(), filename).toEqual(activityIds.sort());
        }
    });

    it('executes every mapped Genki quiz from the requested week-sorted source root verbatim', () => {
        const activities = lessons.flatMap(({ filename, value: lesson }) =>
            array(lesson.genkiInteractiveActivities, `${filename}.genkiInteractiveActivities`)
                .map(value => ({ filename, lesson, activity: record(value) })));
        expect(activities).toHaveLength(27);
        expect(array(lessons.at(-1)!.value.genkiInteractiveActivities)).toHaveLength(2);

        for (const { filename, activity } of activities) {
            const source = record(activity.source);
            const exactTask = record(activity.exactTask);
            const delivery = record(activity.delivery);
            const runtime = record(activity.runtime);
            expect(source.rootId, filename).toBe('japanese-genki-study-resources-2e');
            expect(source.reuse, filename).toBe('verbatim-generated-quiz-configuration');
            const sourcePath = path.resolve(GENKI_ROOT, text(source.relativePath));
            expect(sourcePath.startsWith(`${GENKI_ROOT}${path.sep}`), filename).toBe(true);
            const html = fs.readFileSync(sourcePath, 'utf8');
            expect(sha256(html), filename).toBe(source.payloadSha256);
            const match = html.match(/<script>(Genki\.generateQuiz\([\s\S]*?\);)<\/script>/u);
            expect(match, sourcePath).not.toBeNull();
            const script = match![1].trim();
            expect(sha256(script), sourcePath).toBe(source.scriptSha256);

            let captured: unknown;
            vm.runInNewContext(script, {
                Genki: {
                    generateQuiz(config: unknown) {
                        captured = config;
                    },
                    getAlts: getGenkiAlternatives,
                },
            }, { timeout: 1_000 });
            expect(JSON.parse(JSON.stringify(captured)), sourcePath).toEqual(exactTask.config);

            const lineLocus = record(source.lineLocus);
            const sourceLines = html.split(/\r?\n/u);
            const sourceWindow = sourceLines.slice(
                Number(lineLocus.start) - 1,
                Number(lineLocus.end),
            ).join('\n');
            expect(sourceWindow, sourcePath).toContain('Genki.generateQuiz');
            expect(exactTask.engine, filename).toBe('Genki.generateQuiz');
            expect(exactTask.taskIntentPreserved, filename).toBe(true);
            expect(exactTask.exerciseOrderPreserved, filename).toBe(true);
            expect(text(delivery.place), filename).toMatch(/^academy\/world\//u);
            expect(array(delivery.cast).length, filename).toBeGreaterThan(0);
            expect(text(delivery.grouping), filename).toBeTruthy();
            expect(text(delivery.beat), filename).toBeTruthy();
            expect(delivery.answerVisibility, filename).toBe('after-attempt');
            expect(delivery.prerequisitePolicy, filename)
                .toBe('deliver-only-after-the-mapped-Moodle-Minna-instruction-and-worked-example');
            expect(runtime.preservesSourceTask, filename).toBe(true);
            expect(runtime.answerGate, filename).toBe('after-attempt');
            expect(text(runtime.pluginKind), filename).toBeTruthy();
            expect(runtime.bindingStatus, filename)
                .toBe('package-declared-catalog-registration-outside-owned-scope');
        }

        const slices = activities.filter(({ activity }) =>
            record(activity.exactTask).sourceSlice !== null);
        expect(slices.map(({ activity }) => activity.id)).toEqual([
            'genki-2e:l1-l13:lesson-5-workbook-8',
            'genki-2e:l1-l22:lesson-2-literacy-wb-1',
        ]);
        expect(record(record(slices[0].activity.exactTask).sourceSlice).values).toEqual([7, 8, 9]);
        expect(record(record(slices[1].activity.exactTask).sourceSlice).values)
            .toEqual(['ア', 'イ', 'ウ', 'エ', 'オ']);
    });

    it('audits all three requested source roots with the same exact hashes in every package', () => {
        expect(REQUESTED_SOURCE_ROOTS.every(root => fs.existsSync(root))).toBe(true);
        expect(sha256(fs.readFileSync(path.join(GENKI_ROOT, 'LICENSE'))))
            .toBe('78ce1f38ce4e700e0f2e50f80d549db0798cbdac9dfd5873dfb87c66a711f839');
        expect(sha256(fs.readFileSync(path.join(GENKI_ROOT, 'README.md'))))
            .toBe('82a4dc2c809de43b9bd36580b03e521686b6c92023a3dadd65f1ade968c409ab');

        for (const { filename, value: lesson } of lessons) {
            const audit = record(lesson.sourceRootAudit);
            expect(audit.permittedCorpusAuthority, filename)
                .toBe('public/academy/content/source-pipeline/permitted-corpus.v1.json');
            expect(audit.precedence, filename).toEqual([
                'moodle-chronology',
                'minna-no-nihongo-i',
                'genki-i',
                'supplemental-enrichment',
            ]);
            const roots = array(audit.roots).map(value => record(value));
            expect(roots.map(root => root.path), filename).toEqual(PUBLIC_SOURCE_REFERENCES);
            expect(roots[0].treeSha256AtAudit, filename)
                .toBe('a1f88b0c1554c2d25aa4a0fc7a502537d298a2534b72a73bd84210f09c74a1de');
            expect(roots[1].treeSha256AtAudit, filename)
                .toBe('8927e980e5efc8181cd1316b97548ce6a06de0b40157500cb0bfcd674ff8e42c');
            expect(roots[2].treeSha256AtAudit, filename)
                .toBe('b564cf823e41f89d92be4cd2fb3d2224e889d9ee4a2d082505272b4c4190edc4');
            expect(roots[1].status, filename).toBe('audited-no-selected-level-one-material');
            expect(roots[2].status, filename).toBe('excluded-from-level-one-prestudy');
        }
    });

    it('keeps exact Sensei pre-study rows in source order and marks missing sheets honestly', () => {
        const sourceItemIds = new Set<string>();
        for (const { filename, value: lesson } of lessons) {
            const lessonId = text(lesson.id);
            const preStudy = record(lesson.preStudyVocabulary);
            if (EXPECTED_VOCABULARY_GAPS.has(lessonId)) {
                expect(preStudy.status, filename).toBe('gap-declared');
                expect(preStudy.gap, filename).toBe('no-exact-source-vocabulary-sheet');
                for (const component of componentRecords(lesson)) {
                    const provenance = component.provenance === undefined
                        ? undefined
                        : record(component.provenance);
                    if (typeof provenance?.sourceId === 'string') {
                        expect(provenance.sourceId, filename).not.toMatch(/^moodle-vocabulary:/u);
                    }
                    for (const item of (component.items as readonly unknown[] | undefined) ?? []) {
                        const tags = record(item).tags;
                        if (tags !== undefined) {
                            expect(array(tags).includes('source-prestudy'), filename).toBe(false);
                        }
                    }
                }
                continue;
            }

            expect(preStudy.status, filename).toBe('source-exact-with-yomu-support');
            expect(preStudy.answerVisibility, filename).toBe('after-attempt');
            const primarySourceId = text(preStudy.primarySourceId);
            const primaryHash = primarySourceId.match(/:([a-f0-9]{64})$/u)?.[1];
            expect(primaryHash, filename).toBeDefined();
            const primary = componentRecords(lesson).find(component =>
                component.order === preStudy.primaryComponentOrder);
            expect(primary, filename).toBeDefined();
            const provenance = record(primary!.provenance);
            expect(provenance.sourceId, filename).toBe(primarySourceId);
            expect(provenance.payloadSha256, filename).toBe(primaryHash);
            expect(provenance.answerVisibility, filename).toBe('after-attempt');
            const items = array(primary!.items, `${filename}.primaryVocabulary.items`);
            const orderedItemIds = array(preStudy.orderedItemIds).map(value => text(value));
            expect(items.length, filename).toBe(orderedItemIds.length);

            const actualItemIds = items.map(value => {
                const item = record(value);
                const source = record(item.source);
                const exact = record(source.exact);
                const fieldProvenance = record(source.fieldProvenance);
                const itemId = text(source.itemId);
                expect(sourceItemIds.has(itemId), itemId).toBe(false);
                sourceItemIds.add(itemId);
                expect(source.payloadSha256, itemId).toBe(primaryHash);
                expect(source.title, itemId).toBe(provenance.title);
                expect(record(source.locus).page, itemId).toEqual(expect.any(Number));
                expect(record(source.locus).row, itemId).toEqual(expect.any(Number));
                expect(text(exact.words), itemId).toBeTruthy();
                const displaySurface = typeof source.normalizedStudySurface === 'string'
                    ? source.normalizedStudySurface
                    : exact.words;
                expect(item.ja, itemId).toBe(displaySurface);
                expect(text(item.reading), itemId).toBeTruthy();
                expect(text(item.en), itemId).toBeTruthy();
                expect(text(fieldProvenance.words), itemId).toMatch(/^source-provided/u);
                expect(source.answerVisibility, itemId).toBe('after-attempt');
                return itemId;
            });
            expect(actualItemIds, filename).toEqual(orderedItemIds);
        }
    });

    it('proves every assessed-production concept has context, teaching, guided practice, hints, and retry feedback', () => {
        for (const { filename, value: lesson } of lessons) {
            const sequence = record(lesson.productionSequence, `${filename}.productionSequence`);
            const steps = array(sequence.steps).map(value => record(value));
            const exerciseIds = new Set(exerciseEntries({ filename, value: lesson })
                .map(({ exercise }) => text(exercise.id)));
            const componentOrders = new Set(componentRecords(lesson).map(component =>
                Number(component.order)));

            steps.forEach((assessment, assessmentIndex) => {
                if (assessment.phase !== 'assessed-production') return;
                expect(assessment.revealAnswer, filename).toBe('after-attempt');
                const support = record(assessment.support);
                const hints = array(support.progressiveHints).map(value => text(value));
                expect(hints, `${filename}:${assessment.id}`).toHaveLength(3);
                expect(new Set(hints).size, `${filename}:${assessment.id}`).toBe(3);
                const feedback = record(support.feedback);
                expect(text(feedback.error), filename).toBeTruthy();
                expect(text(feedback.retry), filename).toBeTruthy();

                for (const conceptValue of array(assessment.conceptIds)) {
                    const conceptId = text(conceptValue);
                    const earlier = steps.slice(0, assessmentIndex);
                    const contextIndex = earlier.findIndex(step =>
                        step.phase === 'context'
                        && array(step.conceptIds).includes(conceptId));
                    expect(contextIndex, `${filename}:${assessment.id}:${conceptId}`).toBeGreaterThanOrEqual(0);
                    expect(text(earlier[contextIndex].evidence), filename).toBeTruthy();

                    const instructionIndex = earlier
                        .map(step => step.phase === 'instruction' && array(step.conceptIds).includes(conceptId))
                        .lastIndexOf(true);
                    expect(instructionIndex, `${filename}:${assessment.id}:${conceptId}`)
                        .toBeGreaterThan(contextIndex);
                    const instruction = earlier[instructionIndex];
                    expect(text(instruction.form), filename).toBeTruthy();
                    expect(text(instruction.meaning), filename).toBeTruthy();
                    expect(text(instruction.contrast), filename).toBeTruthy();
                    expect(text(instruction.workedExample), filename).toBeTruthy();

                    const guided = earlier.slice(instructionIndex + 1).find(step =>
                        (step.phase === 'guided-practice' || step.phase === 'constrained-practice')
                        && array(step.conceptIds).includes(conceptId));
                    expect(guided, `${filename}:${assessment.id}:${conceptId}`).toBeDefined();
                    expect(text(guided!.activity), filename).toBeTruthy();
                }

                for (const assessmentIdValue of array(assessment.assessmentIds)) {
                    const assessmentId = text(assessmentIdValue);
                    if (assessmentId.startsWith('component:')) {
                        expect(componentOrders.has(Number(assessmentId.split(':')[1])),
                            `${filename}:${assessmentId}`).toBe(true);
                    } else {
                        expect(exerciseIds.has(assessmentId), `${filename}:${assessmentId}`).toBe(true);
                    }
                }
            });
        }
    });

    it('uses broad assessment modalities instead of defaulting Level 1 to typing', () => {
        const componentTypes = new Set(lessons.flatMap(({ value: lesson }) =>
            componentRecords(lesson).map(component => text(component.type))));
        for (const type of ['reading', 'listening', 'speaking', 'writing', 'kanji', 'game']) {
            expect(componentTypes.has(type), type).toBe(true);
        }

        const exerciseKinds = new Set(allExercises.map(({ exercise }) => text(exercise.kind)));
        for (const kind of [
            'choice',
            'match',
            'cloze',
            'exact',
            'order',
            'multi-choice',
            'drag-sort',
            'ordering',
            'class-simulation',
            'quarantined-listening-choice',
            'image-fill-blank',
            'matching',
            'character-doodle',
        ]) {
            expect(exerciseKinds.has(kind), kind).toBe(true);
        }
        const genkiTypes = new Set(lessons.flatMap(({ value: lesson }) =>
            array(lesson.genkiInteractiveActivities).map(value => {
                const task = record(record(value).exactTask);
                return text(record(task.config).type);
            })));
        expect(genkiTypes).toEqual(new Set(['fill', 'multi', 'drag', 'writing']));
    });

    it('preserves Lesson 20 Word/PDF/media fidelity and binds only the exactly paired A-45 tasks', () => {
        const lesson = lessons.find(entry => entry.value.id === 'l1-l20')!.value;
        const questions = exerciseEntries({ filename: '021-l1-l20.json', value: lesson })
            .filter(({ exercise }) => typeof exercise.sourceQuestionId === 'string');
        expect(questions).toHaveLength(47);
        const sourceDocuments = array(record(lesson.provenance).sourceDocuments)
            .map(value => record(value));
        expect(sourceDocuments.length).toBeGreaterThan(5);
        sourceDocuments.forEach(document => {
            expect(text(document.payloadSha256), document.id as string)
                .toMatch(/^[a-f0-9]{64}$/u);
        });
        const wordDocument = sourceDocuments.find(document =>
            document.id === 'moodle-l20-chapter11-3-docx')!;
        const extraction = record(wordDocument.extraction);
        expect(array(extraction.paragraphs).length).toBeGreaterThan(100);
        expect(array(extraction.embeddedMedia).length).toBeGreaterThan(0);
        array(extraction.embeddedMedia).forEach(value =>
            expect(text(record(value).sha256)).toMatch(/^[a-f0-9]{64}$/u));

        const components = componentRecords(lesson);
        const a45 = components.find(component => component.id === 'sensei-a45-listening')!;
        const a45Provenance = record(a45.provenance);
        expect(text(a45Provenance.answerKeyStatus)).toMatch(/not-present-in-digitized-corpus; answers reviewed/i);
        expect(text(a45Provenance.transcriptStatus)).toMatch(/post-attempt support reviewed/i);
        for (const exerciseValue of array(a45.exercises)) {
            const exercise = record(exerciseValue);
            expect(exercise.kind).toBe('quarantined-listening-choice');
            expect(exercise.audioRef).toBe('academy/content/moodle/audio/l1-l20-a45.mp3');
            expect(exercise.autoGraded).toBe(true);
            expect(exercise.answerStatus).toBe('original-audio-reviewed-after-exact-worksheet-pairing');
            expect(exercise.answer).toBeUndefined();
            expect(exercise.answerVisibility).toBe('after-attempt');
            expect(record(exercise.transcript).revealAfterFirstAttempt).toBe(true);
        }

        const katakana = components.find(component =>
            component.id === 'sensei-katakana-writing-challenge')!;
        expect(array(katakana.workedExamples)).toHaveLength(12);
        const challenges = array(katakana.exercises).map(value => record(value))
            .filter(exercise => exercise.kind === 'character-doodle');
        expect(challenges).toHaveLength(2);
        challenges.forEach(challenge => {
            expect(challenge.answerVisibility).toBe('after-attempt');
            array(challenge.targets).forEach(value =>
                expect(record(record(value).answer).visibility).toBe('after-attempt'));
        });
    });

    it('records the remaining adapter, package-hash, plugin, media, and audio blockers honestly', () => {
        for (const { filename, value: lesson } of lessons) {
            const reachability = record(lesson.runtimeReachability);
            expect(reachability.packageSchema, filename).toBe('parseable-authored-week-v1');
            if (lesson.id === 'l1-l19') {
                expect(reachability).toMatchObject({
                    exactExerciseAdapter: 'academy-sentence-builder with Moodle teaching-material provenance',
                    packageHashRegistration: 'registered in authored-week adapter',
                    pluginCatalogRegistration: 'registered in the Lesson 19 chapter catalog',
                    sourceMediaRegistration: 'public and docs source page plus byte-verified Moodle MP3s',
                });
                expect(text(reachability.audioPairing), filename).toMatch(/without a claimed transcript/i);
                expect(text(reachability.honestResult), filename).toMatch(/exact Moodle page, model line, and audio are reachable/i);
                continue;
            }
            expect(reachability.packageHashRegistration, filename).toBe('blocked-outside-owned-scope');
            expect(reachability.pluginCatalogRegistration, filename).toBe('blocked-outside-owned-scope');
            expect(reachability.sourceMediaRegistration, filename).toBe('blocked-outside-owned-scope');
            expect(text(reachability.audioPairing), filename).toContain('adapter');
            expect(text(reachability.honestResult), filename)
                .toMatch(/runtime reachability still requires forbidden adapter, (?:hash, )?catalog, and media registration edits/iu);
            expect(text(reachability.exactExerciseAdapter), filename).toMatch(
                /^(?:not-delivered-by-current-authored-week-adapter-for-this-week|supported-for-(?:this-week|l1-l20)-once-(?:the-)?package-hash-is-registered)$/u,
            );
        }
    });
});
