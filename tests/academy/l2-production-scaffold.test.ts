import fs from 'node:fs';
import path from 'node:path';

const LESSON_DIRECTORY = path.resolve('public/academy/content/lessons');
const RANGE = Array.from({ length: 34 }, (_, index) => index + 28);

type RecordValue = Record<string, unknown>;

describe('Level 2 production scaffold contract', () => {
    it('gives every independent production task an ordered, answer-safe support path', () => {
        const packages = RANGE.map(loadLesson);

        expect(packages.map(lesson => lesson.id)).toEqual(
            RANGE.map(order => `l2-l${String(order - 27).padStart(2, '0')}`),
        );

        for (const lesson of packages) {
            expect(lesson.provenance.authoringPolicy).toBe('canonical-moodle-source-with-yomu-scaffolds');
            expect(array(lesson.provenance.sourceMappings)).not.toHaveLength(0);

            const pedagogy = record(lesson.pedagogy, `${lesson.id}.pedagogy`);
            expect(pedagogy.schema).toBe('yomu-academy.pedagogy.v1');
            const concepts = array(pedagogy.concepts).map((concept, index) =>
                record(concept, `${lesson.id}.pedagogy.concepts[${index}]`));
            expect(concepts).toHaveLength(1);

            const concept = concepts[0];
            const context = record(concept.context, `${lesson.id}.pedagogy.context`);
            const instruction = record(concept.instruction, `${lesson.id}.pedagogy.instruction`);
            const guided = record(concept.guidedPractice, `${lesson.id}.pedagogy.guidedPractice`);
            const contextOrder = number(context.componentOrder);
            const instructionOrder = number(instruction.componentOrder);
            const guidedOrder = number(guided.componentOrder);
            expect(contextOrder).toBeLessThan(instructionOrder);
            expect(instructionOrder).toBeLessThan(guidedOrder);
            expect(text(context.purpose)).not.toHaveLength(0);
            expect(text(instruction.form)).not.toHaveLength(0);
            expect(text(instruction.meaning)).not.toHaveLength(0);
            expect(text(instruction.register)).not.toHaveLength(0);
            expect(text(instruction.commonContrast)).not.toHaveLength(0);
            expect(text(guided.mode)).toBe('notice-then-supported-retrieval');
            expect(text(guided.prompt)).toMatch(/hidden until after the attempt/i);

            const examples = array(instruction.workedExamples);
            expect(examples).not.toHaveLength(0);
            for (const example of examples) {
                const value = record(example, `${lesson.id}.pedagogy.workedExample`);
                expect(text(value.ja)).not.toHaveLength(0);
                expect(text(value.reading)).not.toHaveLength(0);
                expect(text(value.en)).not.toHaveLength(0);
            }

            const components = array(lesson.components).map((component, index) =>
                record(component, `${lesson.id}.components[${index}]`));
            expect(componentAt(components, contextOrder).curriculumPhase).toBe('context');
            expect(componentAt(components, instructionOrder).curriculumPhase).toBe('instruction');
            expect(componentAt(components, guidedOrder).curriculumPhase).toBe('guided-practice');

            // Exact-form checks are explicitly guided retrieval, so they do not
            // pretend to be independent production before the lesson output.
            for (const component of components) {
                for (const exercise of array(component.exercises)) {
                    const value = record(exercise, `${lesson.id}.exercise`);
                    if (value.kind === 'exact') {
                        expect(value.curriculumPhase).toBe('guided-practice');
                        expect(number(component.order)).toBeGreaterThanOrEqual(instructionOrder);
                    }
                }
            }

            const support = record(pedagogy.productionSupport, `${lesson.id}.pedagogy.productionSupport`);
            expect(support.curriculumPhase).toBe('assessed-production');
            expect(array(support.appliesTo)).toEqual(['component:speaking', 'component:writing', 'mission']);
            expect(support.deferredModelPolicy).toBe('reveal-after-first-attempt');

            const hints = array(support.progressiveHints).map((hint, index) =>
                record(hint, `${lesson.id}.pedagogy.progressiveHints[${index}]`));
            expect(hints.map(hint => hint.level)).toEqual([1, 2, 3]);
            expect(hints.map(hint => text(hint.text).length)).toEqual(expect.arrayContaining([
                expect.any(Number), expect.any(Number), expect.any(Number),
            ]));
            expect(hints.every(hint => text(hint.text).length > 20)).toBe(true);

            const retry = record(support.retryFeedback, `${lesson.id}.pedagogy.retryFeedback`);
            expect(text(retry.diagnostic)).toMatch(/check|mix-up/i);
            expect(text(retry.retryPrompt)).toMatch(/try again/i);

            const productionComponents = components.filter(component =>
                component.type === 'speaking' || component.type === 'writing');
            for (const component of productionComponents) {
                expect(component.curriculumPhase).toBe('assessed-production');
                expect(number(component.order)).toBeGreaterThan(guidedOrder);
                const model = component.model ?? component.modelAnswer;
                if (model !== undefined && model !== null) {
                    expect(record(model, `${lesson.id}.${String(component.type)}.model`).revealAfterFirstAttempt).toBe(true);
                }
            }

            const mission = record(lesson.mission, `${lesson.id}.mission`);
            const missionModel = record(mission.modelAnswer, `${lesson.id}.mission.modelAnswer`);
            expect(missionModel.revealAfterFirstAttempt).toBe(true);
            const withheldAnswer = text(missionModel.ja).replace(/\s/gu, '');
            expect(withheldAnswer).not.toHaveLength(0);
            for (const hint of hints) {
                expect(text(hint.text).replace(/\s/gu, '')).not.toContain(withheldAnswer);
            }
        }
    });

    it('records canonical Moodle evidence without relabelling a scaffold as source coverage', () => {
        const packages = RANGE.map(loadLesson);
        let previousClassOrder = 0;

        for (const lesson of packages) {
            const mapping = record(lesson.mapping, `${lesson.id}.mapping`);
            const classOrder = number(mapping.canonicalClassOrder);
            expect(classOrder).toBeGreaterThan(previousClassOrder);
            previousClassOrder = classOrder;
            expect(text(mapping.minna)).not.toHaveLength(0);
            expect(array(mapping.customOrders)[0]).toBe('chronology');

            const canonical = record(lesson.provenance.canonicalMoodle, `${lesson.id}.provenance.canonicalMoodle`);
            expect(canonical.schema).toBe('yomu-academy.canonical-moodle.v1');
            expect(canonical.reuse).toBe('verbatim-authorised');
            expect(canonical.learnerSurfacePolicy).toBe('canonical-source-first');
            expect(text(canonical.augmentationPolicy)).toMatch(/may not replace or paraphrase/i);

            const members = array(record(lesson.sourceCoverage, `${lesson.id}.sourceCoverage`).members)
                .map((member, index) => record(member, `${lesson.id}.sourceCoverage.members[${index}]`));
            const items = array(canonical.sourceItems).map((item, index) =>
                record(item, `${lesson.id}.provenance.canonicalMoodle.sourceItems[${index}]`));
            const payloads = new Set(items.map(item => text(item.payloadSha256)));
            for (const member of members) {
                const payload = text(member.payloadSha256);
                if (payload) expect(payloads).toContain(payload);
            }
            expect(items).not.toHaveLength(0);
            for (const item of items) {
                expect(text(item.id)).toMatch(/^moodle:[a-f0-9]{64}:/);
                expect(text(item.payloadSha256)).toMatch(/^[a-f0-9]{64}$/);
                expect(item.answerPolicy).toBe('gate-until-attempt');
                expect(array(item.crossSourceArchiveIds)).not.toContain(record(lesson.sourceCoverage, 'sourceCoverage').archiveId);
                if (item.sourceType === 'pdf-page') {
                    expect(PDF_PROJECTION_STATUSES).toContain(text(item.projectionStatus));
                    if (item.projectionStatus !== 'requires-item-projection') {
                        expect(item.verbatimPolicy).toBe('render-verbatim-from-canonical-payload');
                    }
                    const coordinates = record(item.pageCoordinates, `${lesson.id}.pageCoordinates`);
                    expect(number(coordinates.page)).toBeGreaterThan(0);
                    expect(coordinates.coordinateSystem).toBe('pdf-census-layout-pixels');
                    expect(coordinates.region).toBe('full-page');
                    expect(text(coordinates.textExtraction)).not.toHaveLength(0);
                    expect(record(item.visualFidelity, `${lesson.id}.visualFidelity`).policy)
                        .toBe('retain-the-canonical-page-layout-and-diagrams-with-the-item');
                }
                if (item.sourceType === 'audio') {
                    const expectedPairing = AUDIO_PROJECTION_PAIRINGS[text(item.projectionStatus)];
                    expect(expectedPairing).toBeDefined();
                    expect(item.pairingStatus).toBe(expectedPairing);
                }
            }

            const coverage = array(record(lesson.sourceCoverage, `${lesson.id}.sourceCoverage`).coverageMap)
                .map((entry, index) => record(entry, `${lesson.id}.sourceCoverage.coverageMap[${index}]`));
            for (const entry of coverage.filter(entry => payloads.has(text(entry.payloadSha256)))) {
                const status = text(entry.status);
                if (status.startsWith('canonical-recorded-awaiting-')) {
                    expect(array(entry.coveredBy)).toEqual([]);
                    expect(text(entry.howCovered)).toMatch(status === 'canonical-recorded-awaiting-pairing'
                        ? /remains unavailable until its original task pairing is verified/i
                        : /not claimed to replace, paraphrase, or cover/i);
                } else if (status === 'canonical-paired-reviewed-slice') {
                    expect(array(entry.coveredBy).map(text)).toEqual([
                        expect.stringMatching(/^moodle:\d+:[a-f0-9]{64}:pdf-p3:summer-holiday:b22:pin-1$/),
                        expect.stringMatching(/^moodle:\d+:[a-f0-9]{64}:pdf-p3:summer-holiday:b22:pin-2$/),
                        expect.stringMatching(/^moodle:\d+:[a-f0-9]{64}:pdf-p3:summer-holiday:b22:pin-3$/),
                        expect.stringMatching(/^moodle:\d+:[a-f0-9]{64}:pdf-p3:summer-holiday:b22:pin-4$/),
                    ]);
                    expect(text(entry.howCovered)).toMatch(/byte-verified and paired only with the reviewed four speaker pins/i);
                } else if (status === 'canonical-page-rendered-with-derived-completion-support') {
                    expect(array(entry.coveredBy).map(text)).toEqual(['activity:l2-l04-sensei-plain-style-matrix']);
                    expect(text(entry.howCovered)).toMatch(/exact page-three verb matrix is rendered before four bounded Yomu-derived completion checks/i);
                    expect(text(entry.howCovered)).toMatch(/derived forms are never represented as Moodle answers/i);
                } else if (status === 'canonical-vocabulary-page-rendered-before-matrix') {
                    expect(array(entry.coveredBy).map(text)).toEqual(['activity:l2-l04-sensei-plain-style-matrix']);
                    expect(text(entry.howCovered)).toMatch(/exact page-one Sensei vocabulary sheet is rendered before the source matrix/i);
                    expect(text(entry.howCovered)).toMatch(/no vocabulary item is reordered or substituted/i);
                } else if (status === 'canonical-paired-reviewed-and-packaged') {
                    const sourceTitle = text(entry.sourceTitle);
                    if (/track 072 is byte-verified and audio-reviewed/iu.test(text(entry.howCovered))) {
                        expect(array(entry.coveredBy).map(text)).toEqual([
                            expect.stringMatching(/^moodle:6974652:[a-f0-9]{64}:pdf-p1:minna072-conversation:item-1$/),
                            expect.stringMatching(/^moodle:6974652:[a-f0-9]{64}:pdf-p1:minna072-conversation:item-2$/),
                            expect.stringMatching(/^moodle:6974652:[a-f0-9]{64}:pdf-p1:minna072-conversation:item-3$/),
                            expect.stringMatching(/^moodle:6974652:[a-f0-9]{64}:pdf-p1:minna072-conversation:item-4$/),
                        ]);
                    } else {
                        expect(sourceTitle).toBe('Homework/minna_shokyu_1_074.mp3');
                        expect(array(entry.coveredBy).map(text)).toEqual(Array.from({ length: 5 }, (_, index) =>
                            expect.stringMatching(new RegExp(`^moodle:6974653:[a-f0-9]{64}:audio:minna074-mondai-2:item-${index + 1}$`))));
                        expect(text(entry.howCovered)).toMatch(/byte-identical to official Minna track 074/i);
                        expect(text(entry.howCovered)).toMatch(/five recording-embedded dialogue\/statement ○\/× items/i);
                    }
                    expect(text(entry.howCovered)).toMatch(/gated until an attempt/i);
                } else if (status === 'canonical-page-and-four-questions-delivered') {
                    expect(array(entry.coveredBy).map(text)).toEqual([
                        expect.stringMatching(/^moodle:6974652:[a-f0-9]{64}:pdf-p1:minna072-conversation:item-1$/),
                        expect.stringMatching(/^moodle:6974652:[a-f0-9]{64}:pdf-p1:minna072-conversation:item-2$/),
                        expect.stringMatching(/^moodle:6974652:[a-f0-9]{64}:pdf-p1:minna072-conversation:item-3$/),
                        expect.stringMatching(/^moodle:6974652:[a-f0-9]{64}:pdf-p1:minna072-conversation:item-4$/),
                    ]);
                    expect(text(entry.howCovered)).toMatch(/exact first worksheet page is rendered before Minna 072/i);
                    expect(text(entry.howCovered)).toMatch(/after an attempt/i);
                } else if (status === 'verbatim-source-rows-projected-with-labeled-yomu-support') {
                    expect(array(entry.coveredBy).map(text)).toEqual([
                        expect.stringMatching(/^moodle-vocabulary:\d+:[a-f0-9]{64}$/),
                    ]);
                    expect(text(entry.howCovered)).toMatch(/source rows.*exact page order/i);
                    expect(text(entry.howCovered)).toMatch(/blank-meaning rows.*quarantined/i);
                } else if (status === 'canonical-rendered-and-vocabulary-projected') {
                    expect(array(entry.coveredBy).map(text)).toEqual(expect.arrayContaining([
                        expect.stringMatching(/^activity:/),
                        expect.stringMatching(/^reader-srs:/),
                    ]));
                    expect(text(entry.howCovered)).toMatch(/canonical pages.*rendered before assessment/i);
                    expect(text(entry.howCovered)).toMatch(/numbered lexical rows.*Reader.*SRS/i);
                    expect(text(entry.howCovered)).toMatch(/provenance/i);
                } else if (status === 'canonical-rendered-reference-only') {
                    expect(array(entry.coveredBy).map(text)).toEqual([
                        expect.stringMatching(/^activity:/),
                    ]);
                    expect(text(entry.howCovered)).toMatch(/canonical.*rendered.*source reference/i);
                    expect(text(entry.howCovered)).toMatch(/no .*prompt.*claimed as playable/i);
                } else if (status === 'canonical-rendered-three-prompts-playable') {
                    expect(array(entry.coveredBy).map(text)).toEqual([
                        expect.stringMatching(/^activity:/),
                    ]);
                    expect(text(entry.howCovered)).toMatch(/three canonical pages.*rendered before assessment/i);
                    expect(text(entry.howCovered)).toMatch(/page 2 bracket items 1-3.*verbatim/i);
                    expect(text(entry.howCovered)).toMatch(/answers gated until an attempt/i);
                } else if (status === 'canonical-audio-delivered-structural-pairing') {
                    expect(array(entry.coveredBy).map(text)).toEqual([
                        expect.stringMatching(/^activity:/),
                    ]);
                    expect(text(entry.howCovered)).toMatch(/exact .*second payload.*delivered/i);
                    expect(text(entry.howCovered)).toMatch(/archive\/task identity/i);
                    expect(text(entry.howCovered)).toMatch(/no independent transcript-match claim/i);
                } else if (status === 'canonical-rendered-five-listening-prompts-playable') {
                    expect(array(entry.coveredBy).map(text)).toEqual([
                        expect.stringMatching(/^activity:/),
                    ]);
                    expect(text(entry.howCovered)).toMatch(/exact script page.*rendered.*Track 27/i);
                    expect(text(entry.howCovered)).toMatch(/five adjacent worksheet questions/i);
                    expect(text(entry.howCovered)).toMatch(/hidden until an attempt/i);
                } else {
                    throw new TypeError(`${lesson.id} has an unrecognised canonical coverage status: ${status}`);
                }
            }

            const augmentation = record(lesson.yomuAugmentation, `${lesson.id}.yomuAugmentation`);
            expect(augmentation.role).toBe('scaffold-only');
            expect(augmentation.appliesAfterCanonicalItem).toBe(true);
            expect(text(augmentation.note)).toMatch(/not a substitute/i);
        }
    });

    it('binds every canonical source activity to classmates and a world place', () => {
        for (const lesson of RANGE.map(loadLesson)) {
            const orchestration = record(lesson.assessmentOrchestration, `${lesson.id}.assessmentOrchestration`);
            const activities = array(orchestration.activities).map((activity, index) =>
                record(activity, `${lesson.id}.assessmentOrchestration.activities[${index}]`));
            const bindings = array(lesson.sourceActivityBindings).map((binding, index) =>
                record(binding, `${lesson.id}.sourceActivityBindings[${index}]`));
            const participants = new Set(array(record(lesson.casting, `${lesson.id}.casting`).participants).map(String));
            const boundIds = new Set<string>();

            expect(bindings).toHaveLength(activities.length);
            for (const binding of bindings) {
                expect(text(binding.place)).toMatch(/^academy\/world\//u);
                expect(array(binding.activityIds)).toHaveLength(1);
                expect(array(binding.sourceItemIds)).not.toHaveLength(0);
                expect(array(binding.cast).map(String).every(characterId => participants.has(characterId))).toBe(true);
                expect(text(binding.grouping)).toMatch(/^peer-pair/u);
                expect(text(binding.beat)).not.toHaveLength(0);
                expect(text(binding.sourceTaskPolicy)).toMatch(/exact canonical Moodle task/i);
                expect(binding.answerPolicy).toBe('gate-until-attempt');
                expect(text(binding.peerSimulationPolicy)).toMatch(/live peer is unavailable/i);
                boundIds.add(String(array(binding.activityIds)[0]));
            }
            expect([...boundIds].sort()).toEqual(activities.map(activity => text(activity.id)).sort());
        }
    });

    it('keeps pre-study vocabulary verbatim and anchors varied non-typing practice in a source and story beat', () => {
        const packages = RANGE.map(loadLesson);
        const modes = new Set<string>();

        for (const lesson of packages) {
            const vocabulary = array(lesson.components).map((component, index) =>
                record(component, `${lesson.id}.components[${index}]`))
                .find(component => component.type === 'vocabulary');
            if (!vocabulary) throw new TypeError(`${lesson.id} has no vocabulary component.`);

            const preStudy = record(vocabulary.preStudyVocabulary, `${lesson.id}.preStudyVocabulary`);
            expect(preStudy.schema).toBe('yomu-academy.canonical-vocabulary-sheet.v1');
            expect(preStudy.sourceOrderPolicy).toBe('sensei-sheet-order');
            const sheets = array(preStudy.sheets).map((sheet, index) =>
                record(sheet, `${lesson.id}.preStudyVocabulary.sheets[${index}]`));
            const canonicalItems = array(lesson.provenance.canonicalMoodle && record(lesson.provenance.canonicalMoodle, 'canonical').sourceItems)
                .map(item => record(item, `${lesson.id}.canonicalItem`));
            const canonicalIds = new Set(canonicalItems.map(item => text(item.id)));
            if (!sheets.length) {
                expect(preStudy.projectionStatus).toBe('source-sheet-not-present-in-harvest');
                expect(text(preStudy.itemPolicy)).toMatch(/No pre-study vocabulary list is inferred/i);
                expect(array(vocabulary.items)).toEqual([]);
            }
            for (const sheet of sheets) {
                expect(text(sheet.sourceItemId)).toMatch(/^moodle:[a-f0-9]{64}:/);
                expect(text(sheet.payloadSha256)).toMatch(/^[a-f0-9]{64}$/);
                expect(canonicalIds).toContain(text(sheet.sourceItemId));
                if (sheet.status === 'verbatim-source-page-recorded') {
                    expect(text(sheet.verbatimText)).not.toHaveLength(0);
                    expect(record(sheet.pageCoordinates, `${lesson.id}.vocabularyPage`).region).toBe('full-page');
                    expect(record(sheet.visualFidelity, `${lesson.id}.vocabularyVisual`).policy)
                        .toBe('render-the-canonical-vocabulary-sheet-page-with-its-original-layout');
                }
            }

            const sheetByPage = new Map(sheets.map(sheet => {
                return [`${text(sheet.payloadSha256)}:${number(sheet.page)}`, sheet] as const;
            }));
            const lastRowByPage = new Map<string, number>();
            for (const [index, item] of array(vocabulary.items).entries()) {
                const value = record(item, `${lesson.id}.vocabulary.items[${index}]`);
                const source = record(value.source, `${lesson.id}.vocabulary.items[${index}].source`);
                const exact = record(source.exact, `${lesson.id}.vocabulary.items[${index}].source.exact`);
                const fieldProvenance = record(
                    source.fieldProvenance,
                    `${lesson.id}.vocabulary.items[${index}].source.fieldProvenance`,
                );
                const locus = record(source.locus, `${lesson.id}.vocabulary.items[${index}].source.locus`);
                const payload = text(source.payloadSha256);
                const page = number(locus.page);
                const row = number(locus.row);
                const pageKey = `${payload}:${page}` as const;
                const sourceSheet = sheetByPage.get(pageKey);

                expect([
                    'verbatim-sheet-pages-recorded-awaiting-item-renderer',
                    'verbatim-page-one-rendered-before-plain-style-matrix',
                    'verbatim-source-rows-projected-with-labeled-yomu-support',
                ]).toContain(preStudy.projectionStatus);
                expect(sourceSheet).toBeDefined();
                expect(text(source.title)).toBe(text(sourceSheet?.sourceTitle));
                expect(text(source.itemId)).toMatch(/^moodle-vocabulary:\d+:[a-f0-9]{64}:p[1-9]\d*:row-[1-9]\d*$/);
                expect(text(exact.words)).toBe(text(value.ja));
                expect(array(value.tags).map(text)).toEqual(expect.arrayContaining(['prestudy', 'source-vocabulary']));
                expect(fieldProvenance.words).toBe('source-provided');
                expect(['source-provided', 'yomu-support']).toContain(text(fieldProvenance.reading));
                expect(['source-provided', 'yomu-support']).toContain(text(fieldProvenance.meaning));
                expect(source.answerVisibility).toBe('after-attempt');
                if (fieldProvenance.reading === 'source-provided') {
                    expect(text(exact.pronunciation)).toBe(text(value.reading));
                }
                if (fieldProvenance.meaning === 'source-provided') {
                    // Sensei's Meaning column can be an exact Japanese usage frame rather
                    // than an English gloss. Frontier tests pin the verbatim cell value;
                    // this shared contract only requires that source-provided content is
                    // present and never replaced by Yomu's support translation.
                    expect(text(exact.meaning)).not.toHaveLength(0);
                }

                const previousRow = lastRowByPage.get(pageKey);
                if (previousRow !== undefined) expect(row).toBeGreaterThan(previousRow);
                lastRowByPage.set(pageKey, row);
            }
            expect(record(lesson.srs, `${lesson.id}.srs`).canonicalVocabularyPolicy)
                .toBe('derive-only-from-verbatim-source-sheet-items-after-item-level-projection');

            const plan = record(lesson.assessmentOrchestration, `${lesson.id}.assessmentOrchestration`);
            expect(plan.schema).toBe('yomu-academy.source-anchored-assessment.v1');
            expect(plan.canonicalSequencePolicy).toBe('complete-the-verbatim-Moodle-item-before-any-Yomu-mode');
            const anchor = record(plan.sourceAnchor, `${lesson.id}.assessmentOrchestration.sourceAnchor`);
            expect(canonicalIds).toContain(text(anchor.sourceItemId));
            expect(anchor.answerPolicy).toBe('gate-until-attempt');
            const narrative = record(plan.narrativeIntroduction, `${lesson.id}.assessmentOrchestration.narrativeIntroduction`);
            expect(text(narrative.location)).not.toHaveLength(0);
            expect(text(narrative.characterId)).not.toHaveLength(0);
            expect(text(narrative.beat)).not.toHaveLength(0);
            expect(text(narrative.role)).toMatch(/do not rewrite/i);

            const activities = array(plan.activities).map((activity, index) =>
                record(activity, `${lesson.id}.assessmentOrchestration.activities[${index}]`));
            expect(activities).toHaveLength(3);
            for (const [index, activity] of activities.entries()) {
                expect(number(activity.sequence)).toBe(index + 1);
                modes.add(text(activity.mode));
                expect(text(activity.responseMode)).not.toMatch(/type|text|ime/i);
                expect(array(activity.sourceItemIds)).toEqual([anchor.sourceItemId]);
                expect(activity.answerPolicy).toBe('gate-until-attempt');
                expect(text(activity.taskIntentPolicy)).toMatch(/Do not substitute a new prompt, answer, example, or ordering/i);
            }
        }

        expect(modes).toEqual(new Set([
            'matching',
            'ordering',
            'contextual-task',
            'longer-reading',
            'choice',
            'speaking-pronunciation',
            'drag-drop',
            'kanji-doodle',
            'listening',
        ]));
    });
});

const AUDIO_PROJECTION_PAIRINGS: Readonly<Record<string, string>> = {
    'requires-pairing-projection': 'source-audio-recorded-task-pairing-unverified',
    'verified-b21-picture-selection-projection-delivered':
        'source-audio-reviewed-with-three-picture-selection-keys-gated-until-attempt',
    'reviewed-paired-slice': 'exact-b22-speaker-pins-reviewed',
    'packaged-static-source-verified': 'source-audio-reviewed-and-task-paired',
};

const PDF_PROJECTION_STATUSES = [
    'requires-item-projection',
    'rendered-page-delivered-with-verified-b21-picture-selection-projection',
    'rendered-vocabulary-page-delivered-before-b21-listening',
    'rendered-page-delivered-with-derived-plain-form-completion-support',
    'rendered-vocabulary-page-delivered-before-plain-style-matrix',
] as const;

function loadLesson(order: number): RecordValue & {
    id: string;
    provenance: RecordValue;
    mapping: RecordValue;
    sourceCoverage: RecordValue;
} {
    const filename = `${String(order).padStart(3, '0')}-l2-l${String(order - 27).padStart(2, '0')}.json`;
    const value = record(JSON.parse(fs.readFileSync(path.join(LESSON_DIRECTORY, filename), 'utf8')), filename);
    return {
        ...value,
        id: text(value.id),
        provenance: record(value.provenance, `${filename}.provenance`),
        mapping: record(value.mapping, `${filename}.mapping`),
        sourceCoverage: record(value.sourceCoverage, `${filename}.sourceCoverage`),
    };
}

function componentAt(components: readonly RecordValue[], order: number): RecordValue {
    const component = components.find(candidate => candidate.order === order);
    if (!component) throw new TypeError(`Missing component at order ${order}.`);
    return component;
}

function record(value: unknown, path: string): RecordValue {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
    return value as RecordValue;
}

function array(value: unknown): readonly unknown[] {
    if (!Array.isArray(value)) return [];
    return value;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Expected a finite number.');
    return value;
}
