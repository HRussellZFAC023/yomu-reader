import type { AcademyCopy } from './content';

export const CURRICULUM_REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;

export const curriculumModalities = [
    'vocabulary',
    'grammar',
    'kanji',
    'listening',
    'reading',
    'writing',
    'speaking',
] as const;

export type CurriculumModality = (typeof curriculumModalities)[number];
export type CurriculumLevelBand = 'pre-N5' | 'N5' | 'N4' | 'N4+' | 'N3-bridge';
export type JlptBand = 'pre-N5' | 'N5' | 'N4' | 'N3-on-ramp';
export type CurriculumSourceKind =
    | 'moodle-catalog'
    | 'moodle-manifest'
    | 'local-library'
    | 'research-report'
    | 'textbook-sequence'
    | 'academy-content'
    | 'authentic-input'
    | 'framework';
export type SourceReusePolicy =
    | 'metadata-only'
    | 'structure-only'
    | 'sequence-only'
    | 'scope-only'
    | 'original-yomu'
    | 'public-domain-retelling'
    | 'rights-review-required'
    | 'direct-copy';
export type LessonStatus = 'encoded' | 'source-audited' | 'mapped' | 'planned-continuation';
export type LessonPhase = 'explanation' | 'input' | 'guided-practice' | 'production' | 'review' | 'checkpoint';
export type LessonComponentKind =
    | 'explanation'
    | 'authentic-input'
    | 'vocabulary'
    | 'grammar'
    | 'kanji'
    | 'listening'
    | 'reading'
    | 'writing'
    | 'speaking'
    | 'review-checkpoint';
export type DeterministicResponseKind = 'exact' | 'contains' | 'select-one' | 'select-many' | 'matching' | 'ordering' | 'cloze';
export type ModelAnswerPolicy = 'available-after-first-attempt' | 'teacher-facing-only' | 'not-applicable';
export type ReviewHook = 'academy-checkpoint' | 'yomu-vocab' | 'lesson-concept';
export type SourceMappingRelation =
    | 'chronology'
    | 'sequence'
    | 'scope'
    | 'placement'
    | 'input-bank'
    | 'practice-shape'
    | 'continuation';
export type DigitizationWorkKind =
    | 'ocr'
    | 'metadata-normalization'
    | 'audio-segmentation'
    | 'quizlet-ingest'
    | 'rubric-authoring'
    | 'rights-review'
    | 'content-encoding';

export interface CurriculumSourceRights {
    readonly publicationMode: SourceReusePolicy;
    readonly directReuse: 'allowed' | 'not-authorized' | 'requires-review';
    readonly excluded: readonly string[];
    readonly note: string;
}

export interface CurriculumSourceMetric {
    readonly label: string;
    readonly value: number;
}

export interface CurriculumSource {
    readonly id: string;
    readonly kind: CurriculumSourceKind;
    readonly label: string;
    readonly locator: string;
    readonly capturedAt?: string;
    readonly rights: CurriculumSourceRights;
    readonly metrics: readonly CurriculumSourceMetric[];
    readonly notes: readonly string[];
}

export interface UclChronologyNode {
    readonly id: string;
    readonly sourceId: string;
    readonly courseId: string;
    readonly courseYear: string;
    readonly sectionTitle: string;
    readonly sequence: number;
    readonly levelBand: CurriculumLevelBand;
    readonly manifestModuleCount: number;
    readonly downloadedModuleCount: number;
    readonly note: string;
}

export interface SourceMapping {
    readonly sourceId: string;
    readonly relation: SourceMappingRelation;
    readonly reference: string;
    readonly reuse: SourceReusePolicy;
    readonly note: string;
}

export interface UclLessonChronology {
    readonly kind: 'ucl';
    readonly uclNodeId: string;
    readonly localOrder: number;
}

export interface YomuContinuationChronology {
    readonly kind: 'yomu-continuation';
    readonly afterLessonId: string;
}

export type LessonChronology = UclLessonChronology | YomuContinuationChronology;

export interface NoLessonAssessment {
    readonly kind: 'none';
}

export interface DeterministicLessonAssessment {
    readonly kind: 'deterministic';
    readonly responseKinds: readonly DeterministicResponseKind[];
    readonly note: string;
}

export interface OpenRubricLessonAssessment {
    readonly kind: 'open-rubric';
    readonly rubricId: string;
    readonly modelAnswerPolicy: Exclude<ModelAnswerPolicy, 'not-applicable'>;
    readonly reviewMode: 'self-review' | 'teacher-review' | 'peer-review';
}

export interface SelfAssessmentLessonAssessment {
    readonly kind: 'self-assessment';
    readonly checkpoint: boolean;
}

export type LessonAssessment =
    | NoLessonAssessment
    | DeterministicLessonAssessment
    | OpenRubricLessonAssessment
    | SelfAssessmentLessonAssessment;

export interface LessonComponent {
    readonly id: string;
    readonly kind: LessonComponentKind;
    readonly phase: LessonPhase;
    readonly order: number;
    readonly title: AcademyCopy;
    readonly modalities: readonly CurriculumModality[];
    readonly assessment: LessonAssessment;
    readonly provenanceNote: string;
}

export interface LessonDeliveryContract {
    readonly mobileFirst: boolean;
    readonly offlineReady: boolean;
    readonly audioOffEquivalent: boolean;
    readonly reducedMotionEquivalent: boolean;
    readonly screenReaderLabels: boolean;
    readonly lowBandwidthMode: boolean;
}

export interface LessonReviewPlan {
    readonly hooks: readonly ReviewHook[];
    readonly checkpointTaskIds: readonly string[];
    readonly srsIntervalDays: typeof CURRICULUM_REVIEW_INTERVAL_DAYS;
    readonly note: string;
}

export interface CurriculumLesson {
    readonly id: string;
    readonly order: number;
    readonly title: AcademyCopy;
    readonly summary: AcademyCopy;
    readonly levelBand: CurriculumLevelBand;
    readonly jlptBand: JlptBand;
    readonly status: LessonStatus;
    readonly chronology: LessonChronology;
    readonly sourceMappings: readonly SourceMapping[];
    readonly components: readonly LessonComponent[];
    readonly delivery: LessonDeliveryContract;
    readonly review: LessonReviewPlan;
    readonly implementationRefs: readonly string[];
    readonly provenanceSummary: string;
}

export interface LessonQualityContract {
    readonly id: string;
    readonly requiredPhaseOrder: readonly LessonPhase[];
    readonly requiredModalities: readonly CurriculumModality[];
    readonly explanationMustPrecedePractice: boolean;
    readonly deterministicKinds: readonly LessonComponentKind[];
    readonly openWorkKinds: readonly LessonComponentKind[];
    readonly requiredReviewHooks: readonly ReviewHook[];
    readonly requiredDelivery: readonly (keyof LessonDeliveryContract)[];
    readonly modelAnswerPolicy: Exclude<ModelAnswerPolicy, 'not-applicable'>;
    readonly sourcePolicy: string;
}

export interface SourceMappingRule {
    readonly id: string;
    readonly sourceKind: CurriculumSourceKind;
    readonly precedence: number;
    readonly rule: string;
    readonly output: string;
    readonly privacy: string;
}

export interface DigitizationQueueItem {
    readonly id: string;
    readonly priority: number;
    readonly impact: 'high' | 'medium' | 'low';
    readonly effort: 'small' | 'medium' | 'large';
    readonly workKinds: readonly DigitizationWorkKind[];
    readonly lessonIds: readonly string[];
    readonly sourceIds: readonly string[];
    readonly title: string;
    readonly rationale: string;
    readonly privacyHandling: string;
    readonly rightsGate: 'clear-original-only' | 'metadata-only' | 'requires-review-before-publication';
}

export interface CurriculumGraph {
    readonly schemaVersion: '1';
    readonly lessonQualityContract: LessonQualityContract;
    readonly sources: readonly CurriculumSource[];
    readonly uclChronology: readonly UclChronologyNode[];
    readonly sourceMappingRules: readonly SourceMappingRule[];
    readonly lessons: readonly CurriculumLesson[];
    readonly digitizationQueue: readonly DigitizationQueueItem[];
}

export type CurriculumValidationCode =
    | 'blank-field'
    | 'duplicate-id'
    | 'unknown-reference'
    | 'invalid-chronology'
    | 'missing-contract'
    | 'invalid-grading'
    | 'invalid-provenance'
    | 'privacy-risk'
    | 'invalid-digitization-queue';

export interface CurriculumValidationIssue {
    readonly code: CurriculumValidationCode;
    readonly path: string;
    readonly message: string;
}

export interface LessonQualityChecklist {
    readonly lessonId: string;
    readonly missingModalities: readonly CurriculumModality[];
    readonly hasExplanationBeforePractice: boolean;
    readonly deterministicComponentIds: readonly string[];
    readonly openRubricComponentIds: readonly string[];
    readonly missingReviewHooks: readonly ReviewHook[];
    readonly deliveryReady: boolean;
    readonly passed: boolean;
}

export interface CurriculumCoverageSummary {
    readonly lessonCount: number;
    readonly encodedLessonCount: number;
    readonly continuationLessonCount: number;
    readonly byStatus: Readonly<Partial<Record<LessonStatus, number>>>;
    readonly byJlptBand: Readonly<Partial<Record<JlptBand, number>>>;
    readonly sourceUsage: readonly {
        readonly sourceId: string;
        readonly lessonCount: number;
    }[];
}

interface LessonComponentFocus {
    readonly explanation: string;
    readonly authenticInput: string;
    readonly vocabulary: string;
    readonly grammar: string;
    readonly kanji: string;
    readonly listening: string;
    readonly reading: string;
    readonly writing: string;
    readonly speaking: string;
    readonly review: string;
}

type LessonInput = Omit<CurriculumLesson, 'components' | 'delivery' | 'review'> & {
    readonly componentFocus: LessonComponentFocus;
};

const copy = (en: string, ja?: string): AcademyCopy => ja ? { en, ja } : { en };

const standardDelivery: LessonDeliveryContract = {
    mobileFirst: true,
    offlineReady: true,
    audioOffEquivalent: true,
    reducedMotionEquivalent: true,
    screenReaderLabels: true,
    lowBandwidthMode: true,
};

export const lessonQualityContract = {
    id: 'yomu-academy-lesson-quality-v1',
    requiredPhaseOrder: ['explanation', 'input', 'guided-practice', 'production', 'review', 'checkpoint'],
    requiredModalities: curriculumModalities,
    explanationMustPrecedePractice: true,
    deterministicKinds: ['vocabulary', 'grammar', 'kanji', 'listening', 'reading'],
    openWorkKinds: ['writing', 'speaking'],
    requiredReviewHooks: ['academy-checkpoint', 'yomu-vocab', 'lesson-concept'],
    requiredDelivery: [
        'mobileFirst',
        'offlineReady',
        'audioOffEquivalent',
        'reducedMotionEquivalent',
        'screenReaderLabels',
        'lowBandwidthMode',
    ],
    modelAnswerPolicy: 'available-after-first-attempt',
    sourcePolicy: 'Use source material for chronology, scope, and structure. Publish only original Yomu wording or separately cleared/public-domain adaptations.',
} as const satisfies LessonQualityContract;

export const curriculumSources = [
    {
        id: 'source-ucl-moodle-publishable-catalog',
        kind: 'moodle-catalog',
        label: 'Publishable UCL Moodle archive catalog',
        locator: 'public/academy/catalog.json',
        capturedAt: '2026-07-11T00:28:00.000Z',
        rights: {
            publicationMode: 'metadata-only',
            directReuse: 'not-authorized',
            excluded: [
                'archive-byte-content',
                'archive-source-paths',
                'member-byte-content',
                'member-names',
                'manifest-titles-urls-notes',
                'zip-comments-and-member-timestamps',
            ],
            note: 'Catalog exposes hashes, counts, safe classes, and aggregate patterns only.',
        },
        metrics: [
            { label: 'archive occurrences', value: 96 },
            { label: 'member occurrences', value: 916 },
            { label: 'unique payload assets', value: 688 },
            { label: 'pdf member occurrences', value: 716 },
            { label: 'mp3 member occurrences', value: 185 },
        ],
        notes: [
            'Use for aggregate coverage, duplicate detection, and media-type balance.',
            'Do not use member names or source paths from private manifests in public lesson data.',
        ],
    },
    {
        id: 'source-ucl-moodle-raw-manifest',
        kind: 'moodle-manifest',
        label: 'UCL Moodle raw manifest',
        locator: '/Users/heru/Documents/Projects/yomu/resources/yomu-academy/moodle-raw/manifest.json',
        capturedAt: '2026-07-05',
        rights: {
            publicationMode: 'metadata-only',
            directReuse: 'not-authorized',
            excluded: ['module-private-urls', 'notes', 'raw-download-paths', 'contact-data'],
            note: 'Local-only manifest for preserving course and section order.',
        },
        metrics: [
            { label: 'courses inventoried', value: 3 },
            { label: 'manifest modules', value: 148 },
            { label: 'downloaded folder/resource modules indexed', value: 99 },
            { label: 'internal files indexed', value: 919 },
        ],
        notes: [
            'Course order spans 2023/24, 2024/25, and 2025/26.',
            'URL modules are references and were not downloaded by the raw harvester.',
        ],
    },
    {
        id: 'source-japanese-library-inventory',
        kind: 'research-report',
        label: 'Maker Japanese library corpus inventory',
        locator: 'docs/academy/research/04-corpus-inventory.md',
        capturedAt: '2026-07-11',
        rights: {
            publicationMode: 'structure-only',
            directReuse: 'requires-review',
            excluded: ['large-binary-content', 'raw-vocab-2k-bulk-import', 'private-download-path-publication'],
            note: 'Use the inventory for source selection, filtering warnings, and digitization order.',
        },
        metrics: [
            { label: 'Genki lessons present', value: 24 },
            { label: 'Genki workbook audio files', value: 150 },
            { label: 'maker Minna class audio files', value: 39 },
            { label: 'curated N5 seed words documented', value: 45 },
        ],
        notes: [
            'Vocab 2k is an adult-immersion frequency signal and must not be surfaced wholesale.',
            'Genki Study Resources is the cleanest structured N5 to N4 corpus.',
        ],
    },
    {
        id: 'source-genki-study-resources',
        kind: 'textbook-sequence',
        label: 'Genki Study Resources interactive lesson sequence',
        locator: '/Users/heru/Documents/Japanese/Resource Packs/genki-study-resources-master 2',
        rights: {
            publicationMode: 'structure-only',
            directReuse: 'requires-review',
            excluded: ['verbatim-quiz-items-unless-cleared', 'audio-byte-content'],
            note: 'Use lesson order and parseable quizlet structure; write original Academy items unless rights are cleared.',
        },
        metrics: [
            { label: 'lesson directories including lesson 0', value: 24 },
            { label: 'second-edition audio files', value: 71 },
            { label: 'third-edition audio files', value: 79 },
        ],
        notes: ['Vocabulary quizlets use kana/gloss objects; grammar quizlets use answer arrays with an A-prefixed correct answer.'],
    },
    {
        id: 'source-minna-live-lessons',
        kind: 'local-library',
        label: 'Maker live Minna no Nihongo II class files',
        locator: '/Users/heru/Documents/Japanese/Lessons',
        capturedAt: '2026-03-10',
        rights: {
            publicationMode: 'structure-only',
            directReuse: 'requires-review',
            excluded: ['worksheet-byte-content', 'teacher-authored-verbatim-prompts', 'class-audio-byte-content'],
            note: 'Use filenames and folder structure to align topics; convert only after rights and privacy review.',
        },
        metrics: [
            { label: 'chapter 28 lesson folders', value: 2 },
            { label: 'chapter 29 lesson folders', value: 2 },
            { label: 'chapter 30 lesson folders', value: 2 },
        ],
        notes: ['Verified local live track covers Minna II chapters 28 to 30: ながら, し, ている states, てしまう, てある, ておく.'],
    },
    {
        id: 'source-soya-research-audit',
        kind: 'research-report',
        label: 'Soya Eagle research mirror audit',
        locator: '/Users/heru/Documents/Projects/yomu/references/soya-research',
        rights: {
            publicationMode: 'structure-only',
            directReuse: 'not-authorized',
            excluded: ['question-wording', 'answer-sequences', 'scripts', 'audio', 'images', 'urls'],
            note: 'Use for activity categories and delivery patterns only.',
        },
        metrics: [
            { label: 'JLPT levels represented', value: 5 },
            { label: 'official script PDFs sampled', value: 3 },
        ],
        notes: ['Existing JLPT placement catalog already records this boundary as structure-only.'],
    },
    {
        id: 'source-existing-yomu-academy-content',
        kind: 'academy-content',
        label: 'Existing original Yomu Academy content graph and story pack',
        locator: 'src/academy/content.ts; docs/academy/story/LESSON-CONTENT-ch1-3.md',
        rights: {
            publicationMode: 'original-yomu',
            directReuse: 'allowed',
            excluded: ['none'],
            note: 'Original Yomu Academy dialogue, models, rubrics, and lesson scripts can be reused in Academy.',
        },
        metrics: [
            { label: 'encoded Level 3+ lesson activities', value: 8 },
            { label: 'planned N5 story chapters', value: 3 },
        ],
        notes: ['The encoded Level 3+ Lesson 9 slice already includes listening, grammar, speaking, writing, kanji, reflection, model answers, and a rubric.'],
    },
    {
        id: 'source-authentic-subtitles',
        kind: 'authentic-input',
        label: 'Local subtitle corpus for authentic listening and reading',
        locator: '/Users/heru/Documents/Japanese/Subtitles',
        rights: {
            publicationMode: 'rights-review-required',
            directReuse: 'requires-review',
            excluded: ['subtitle-verbatim-before-rights-review', 'media-byte-content'],
            note: 'Use as an inventory of candidate authentic input; publish only cleared clips or short original replacements.',
        },
        metrics: [
            { label: 'subtitle files inventoried', value: 14 },
            { label: 'Pepper and Carrot narrated VTT files', value: 2 },
            { label: 'Unpacking VTT files', value: 6 },
        ],
        notes: ['Pepper and Carrot is the first candidate for N5-friendly listening if rights are confirmed.'],
    },
    {
        id: 'source-jlpt-framework',
        kind: 'framework',
        label: 'JLPT placement and recommendation framework',
        locator: 'src/academy/jlpt.ts',
        rights: {
            publicationMode: 'original-yomu',
            directReuse: 'allowed',
            excluded: ['external-mock-exam-claims'],
            note: 'Yomu uses original representative items and treats placement as a heuristic, not an official score conversion.',
        },
        metrics: [
            { label: 'covered JLPT bands in app', value: 2 },
            { label: 'representative placement activities', value: 16 },
        ],
        notes: ['Current app has original N5/N4 representative placement lessons across vocabulary, grammar, reading, and listening.'],
    },
] as const satisfies readonly CurriculumSource[];

export const uclChronology = [
    {
        id: 'ucl-2023-welcome',
        sourceId: 'source-ucl-moodle-raw-manifest',
        courseId: 'ucl-japanese-2023-2024',
        courseYear: '2023/24',
        sectionTitle: 'Welcome',
        sequence: 10,
        levelBand: 'pre-N5',
        manifestModuleCount: 2,
        downloadedModuleCount: 1,
        note: 'Orientation and access material; use only as a chronology anchor.',
    },
    {
        id: 'ucl-2023-rie-level-1',
        sourceId: 'source-ucl-moodle-raw-manifest',
        courseId: 'ucl-japanese-2023-2024',
        courseYear: '2023/24',
        sectionTitle: 'Rie level 1',
        sequence: 20,
        levelBand: 'N5',
        manifestModuleCount: 24,
        downloadedModuleCount: 18,
        note: 'Earliest classroom sequence; aligns with kana, introductions, basic particles, and survival interaction.',
    },
    {
        id: 'ucl-2023-rie-level-1-plus-thu-5',
        sourceId: 'source-ucl-moodle-raw-manifest',
        courseId: 'ucl-japanese-2023-2024',
        courseYear: '2023/24',
        sectionTitle: 'Rie level 1+ Thursday 5pm',
        sequence: 30,
        levelBand: 'N5',
        manifestModuleCount: 19,
        downloadedModuleCount: 12,
        note: 'Parallel Level 1+ run; use to confirm topic order and repeated assets.',
    },
    {
        id: 'ucl-2023-rie-level-1-plus-thu-7',
        sourceId: 'source-ucl-moodle-raw-manifest',
        courseId: 'ucl-japanese-2023-2024',
        courseYear: '2023/24',
        sectionTitle: 'Rie level 1+ Thursday 7pm',
        sequence: 40,
        levelBand: 'N5',
        manifestModuleCount: 29,
        downloadedModuleCount: 17,
        note: 'Parallel Level 1+ run with fuller archive coverage.',
    },
    {
        id: 'ucl-2024-welcome',
        sourceId: 'source-ucl-moodle-raw-manifest',
        courseId: 'ucl-japanese-2024-2025',
        courseYear: '2024/25',
        sectionTitle: 'Welcome',
        sequence: 50,
        levelBand: 'pre-N5',
        manifestModuleCount: 2,
        downloadedModuleCount: 1,
        note: 'Orientation and access material; not a lesson source.',
    },
    {
        id: 'ucl-2024-rie-level-2-plus',
        sourceId: 'source-ucl-moodle-raw-manifest',
        courseId: 'ucl-japanese-2024-2025',
        courseYear: '2024/25',
        sectionTitle: 'Rie level 2+ Thursday 7pm',
        sequence: 60,
        levelBand: 'N4',
        manifestModuleCount: 19,
        downloadedModuleCount: 12,
        note: 'Intermediate bridge; confirms Level 2+ continuity before the 2025/26 archive.',
    },
    {
        id: 'ucl-2025-welcome',
        sourceId: 'source-ucl-moodle-raw-manifest',
        courseId: 'ucl-japanese-2025-2026',
        courseYear: '2025/26',
        sectionTitle: 'Welcome',
        sequence: 70,
        levelBand: 'pre-N5',
        manifestModuleCount: 2,
        downloadedModuleCount: 1,
        note: 'Orientation and access material; not a lesson source.',
    },
    {
        id: 'ucl-2025-rie-level-2-plus',
        sourceId: 'source-ucl-moodle-raw-manifest',
        courseId: 'ucl-japanese-2025-2026',
        courseYear: '2025/26',
        sectionTitle: 'Rie level 2+',
        sequence: 80,
        levelBand: 'N4',
        manifestModuleCount: 19,
        downloadedModuleCount: 12,
        note: 'Current-year Level 2+ archive; map after Genki II opening and before Minna II live units.',
    },
    {
        id: 'ucl-2025-rie-level-3-2',
        sourceId: 'source-ucl-moodle-raw-manifest',
        courseId: 'ucl-japanese-2025-2026',
        courseYear: '2025/26',
        sectionTitle: 'Rie level 3-2',
        sequence: 90,
        levelBand: 'N4',
        manifestModuleCount: 18,
        downloadedModuleCount: 14,
        note: 'Current live-course neighborhood for Minna II chapters 28 to 30.',
    },
    {
        id: 'ucl-2025-rie-level-3-plus',
        sourceId: 'source-ucl-moodle-raw-manifest',
        courseId: 'ucl-japanese-2025-2026',
        courseYear: '2025/26',
        sectionTitle: 'Rie Level 3+ Thursday 7pm',
        sequence: 100,
        levelBand: 'N4+',
        manifestModuleCount: 14,
        downloadedModuleCount: 11,
        note: 'Existing encoded Lesson 9 belongs here and maps to Genki 22-23 / Minna 35-36.',
    },
] as const satisfies readonly UclChronologyNode[];

export const sourceMappingRules = [
    {
        id: 'rule-ucl-first',
        sourceKind: 'moodle-manifest',
        precedence: 1,
        rule: 'Preserve UCL course-year and section sequence as the canonical chronology whenever a lesson has a UCL anchor.',
        output: 'Lesson chronology.uclNodeId and localOrder.',
        privacy: 'Use course year and section label only; do not publish private module URLs, notes, or contact data.',
    },
    {
        id: 'rule-genki-structure',
        sourceKind: 'textbook-sequence',
        precedence: 2,
        rule: 'Use Genki lesson numbers and parseable quizlet shapes as sequence and activity templates for N5 to N4, not as a verbatim public question bank.',
        output: 'Source mappings with sequence-only or structure-only reuse.',
        privacy: 'No private data; rights review is required before copying source wording or audio.',
    },
    {
        id: 'rule-minna-live',
        sourceKind: 'local-library',
        precedence: 3,
        rule: 'Use Minna II class filenames and folders to align the maker live track, prioritizing chapters 28 to 30 before later inferred material.',
        output: 'Minna scope mappings and digitization queue priority.',
        privacy: 'Do not publish worksheet bytes, teacher wording, or raw class audio before review.',
    },
    {
        id: 'rule-jlpt-band',
        sourceKind: 'framework',
        precedence: 4,
        rule: 'Attach JLPT bands as pedagogical heuristics. Do not claim official score equivalence.',
        output: 'Lesson jlptBand and recommendation grouping.',
        privacy: 'Only original Yomu placement items are public.',
    },
    {
        id: 'rule-yomu-continuation',
        sourceKind: 'academy-content',
        precedence: 5,
        rule: 'After mapped Genki and Minna coverage ends, continue with original Yomu projects using cleared authentic input, public-domain retellings, and reader/study workflows.',
        output: 'Yomu continuation lessons with no invented textbook mapping.',
        privacy: 'Authentic subtitles remain inventory-only until rights are cleared.',
    },
] as const satisfies readonly SourceMappingRule[];

export const academyCurriculumGraph: CurriculumGraph = {
    schemaVersion: '1',
    lessonQualityContract,
    sources: curriculumSources,
    uclChronology,
    sourceMappingRules,
    lessons: [
        lesson({
            id: 'lesson-kana-on-ramp',
            order: 10,
            title: copy('Kana on-ramp and classroom survival', 'かな入門と教室のことば'),
            summary: copy('A pre-N5 bridge from UCL orientation into hiragana, katakana, greetings, and audio-safe classroom language.'),
            levelBand: 'pre-N5',
            jlptBand: 'pre-N5',
            status: 'mapped',
            chronology: { kind: 'ucl', uclNodeId: 'ucl-2023-welcome', localOrder: 1 },
            sourceMappings: [
                sourceMap('source-ucl-moodle-raw-manifest', 'chronology', '2023/24 Welcome -> Rie level 1 entry', 'metadata-only', 'Preserves UCL starting point without private module data.'),
                sourceMap('source-genki-study-resources', 'sequence', 'Genki lesson 0', 'sequence-only', 'Use lesson-0 kana/greetings structure as a scope map.'),
                sourceMap('source-ucl-moodle-publishable-catalog', 'input-bank', 'Kana practice pattern: hiragana, katakana, answer-key aggregates', 'metadata-only', 'Catalog shows kana practice coverage without exposing source files.'),
                sourceMap('source-jlpt-framework', 'placement', 'pre-N5 readiness', 'original-yomu', 'Not a JLPT score claim; prepares for N5 placement.'),
            ],
            implementationRefs: ['docs/academy/story/SCRIPT-prologue.md'],
            provenanceSummary: 'Chronology from UCL manifest; kana structure from Genki lesson 0; all app wording should be original.',
            componentFocus: componentFocus({
                explanation: 'what kana unlocks before any quiz',
                authenticInput: 'short classroom greetings and names',
                vocabulary: 'greetings, classroom verbs, numbers',
                grammar: 'polite sentence endings and question intonation',
                kanji: 'orthographic awareness: kana, kanji, and radicals',
                listening: 'hear and distinguish greeting phrases',
                reading: 'recognise kana in short classroom signs',
                writing: 'write a short self-label and classroom request',
                speaking: 'record a greeting and one request',
                review: 'kana recognition and greeting recall checkpoints',
            }),
        }),
        lesson({
            id: 'lesson-n5-hajimemashite',
            order: 20,
            title: copy('N5 introductions: はじめまして', 'N5自己紹介：はじめまして'),
            summary: copy('Topic は, です, names, and first identity sentences, aligned to the opening Yomu story chapter.'),
            levelBand: 'N5',
            jlptBand: 'N5',
            status: 'mapped',
            chronology: { kind: 'ucl', uclNodeId: 'ucl-2023-rie-level-1', localOrder: 1 },
            sourceMappings: [
                sourceMap('source-ucl-moodle-raw-manifest', 'chronology', '2023/24 Rie level 1 opening sequence', 'metadata-only', 'Keeps UCL Level 1 first.'),
                sourceMap('source-genki-study-resources', 'sequence', 'Genki lesson 1', 'sequence-only', 'Use self-introduction and noun sentence ordering.'),
                sourceMap('source-minna-live-lessons', 'scope', 'Minna no Nihongo I lessons 1-2', 'scope-only', 'Reference scope only; local live files begin later.'),
                sourceMap('source-existing-yomu-academy-content', 'scope', 'docs/academy/story/LESSON-CONTENT-ch1-3.md Chapter 1', 'original-yomu', 'Original Chapter 1 lesson pack is available for encoding.'),
                sourceMap('source-jlpt-framework', 'placement', 'N5 foundations', 'original-yomu', 'Maps to N5 vocabulary/grammar foundation recommendations.'),
            ],
            implementationRefs: ['docs/academy/story/LESSON-CONTENT-ch1-3.md#chapter-1--はじめまして-nice-to-meet-you'],
            provenanceSummary: 'Original Yomu Chapter 1 content can be encoded; Genki/Minna are sequence references.',
            componentFocus: componentFocus({
                explanation: 'topic は and です before identity practice',
                authenticInput: 'first-night classroom introduction dialogue',
                vocabulary: 'names, people, classroom roles',
                grammar: 'X は Y です and これは何ですか',
                kanji: '人, 名, 子, 学, 生, 先',
                listening: 'identify who is speaking and who owns the notebook',
                reading: 'read the first notebook page',
                writing: 'self-introduction with name and one reason',
                speaking: 'record a short self-introduction',
                review: 'topic particle, greeting, and self-intro recall',
            }),
        }),
        lesson({
            id: 'lesson-n5-town-prices',
            order: 30,
            title: copy('N5 town, places, and prices', 'N5：まち・場所・値段'),
            summary: copy('Demonstratives, location, price, and basic town navigation from the Level 1 sequence.'),
            levelBand: 'N5',
            jlptBand: 'N5',
            status: 'mapped',
            chronology: { kind: 'ucl', uclNodeId: 'ucl-2023-rie-level-1', localOrder: 2 },
            sourceMappings: [
                sourceMap('source-ucl-moodle-raw-manifest', 'chronology', '2023/24 Rie level 1 early place/price lessons', 'metadata-only', 'Keeps Level 1 order.'),
                sourceMap('source-genki-study-resources', 'sequence', 'Genki lesson 2', 'sequence-only', 'Use demonstrative/location sequence and auto-gradable quiz shapes.'),
                sourceMap('source-minna-live-lessons', 'scope', 'Minna no Nihongo I lessons 3-4', 'scope-only', 'Reference scope only.'),
                sourceMap('source-existing-yomu-academy-content', 'scope', 'docs/academy/story/LESSON-CONTENT-ch1-3.md Chapter 2', 'original-yomu', 'Original story pack has a town chapter ready for encoding.'),
                sourceMap('source-jlpt-framework', 'placement', 'N5 reading and vocabulary routines', 'original-yomu', 'Maps to everyday vocabulary and reading recommendations.'),
            ],
            implementationRefs: ['docs/academy/story/LESSON-CONTENT-ch1-3.md#chapter-2'],
            provenanceSummary: 'Original Yomu Chapter 2 should carry the public lesson; textbook mappings are scope only.',
            componentFocus: componentFocus({
                explanation: 'location words before map practice',
                authenticInput: 'finding a place in town',
                vocabulary: 'places, prices, counters, here/there',
                grammar: 'ここ/そこ/あそこ, どこ, いくら',
                kanji: '中, 上, 下, 左, 右',
                listening: 'follow simple place and price information',
                reading: 'read a simple map note',
                writing: 'write a place-and-price message',
                speaking: 'ask where something is',
                review: 'place words, demonstratives, and price questions',
            }),
        }),
        lesson({
            id: 'lesson-n5-food-invitations',
            order: 40,
            title: copy('N5 food and invitations', 'N5：食べ物と誘い'),
            summary: copy('Verbs, particles, and invitations, with the first cooking/meal kanji spine that later connects to Level 3+.'),
            levelBand: 'N5',
            jlptBand: 'N5',
            status: 'mapped',
            chronology: { kind: 'ucl', uclNodeId: 'ucl-2023-rie-level-1-plus-thu-5', localOrder: 1 },
            sourceMappings: [
                sourceMap('source-ucl-moodle-raw-manifest', 'chronology', '2023/24 Rie level 1+ food and action sequence', 'metadata-only', 'Uses the first Level 1+ section as a chronology anchor.'),
                sourceMap('source-genki-study-resources', 'sequence', 'Genki lessons 3-6', 'sequence-only', 'Use action/invitation sequence and workbook listening categories.'),
                sourceMap('source-minna-live-lessons', 'scope', 'Minna no Nihongo I lessons 5-10', 'scope-only', 'Reference scope only.'),
                sourceMap('source-existing-yomu-academy-content', 'scope', 'docs/academy/story/LESSON-CONTENT-ch1-3.md Chapter 3', 'original-yomu', 'Original food chapter overlaps the encoded Level 3+ kanji set.'),
                sourceMap('source-jlpt-framework', 'placement', 'N5 listening routines', 'original-yomu', 'Maps to N5 listening and grammar foundations.'),
            ],
            implementationRefs: ['docs/academy/story/LESSON-CONTENT-ch1-3.md#chapter-3'],
            provenanceSummary: 'Original Yomu Chapter 3 should be encoded first because it bridges N5 food language into the Level 3+ plan lesson.',
            componentFocus: componentFocus({
                explanation: 'verbs and particles before invitation drills',
                authenticInput: 'short meal-planning dialogue',
                vocabulary: 'food, drink, motion, invitations',
                grammar: 'を, に, で, ませんか',
                kanji: '食, 飲, 肉, 料, 理, 野',
                listening: 'hear who eats/drinks/goes where',
                reading: 'read a menu or lunch note',
                writing: 'write an invitation to eat together',
                speaking: 'invite someone to eat or drink',
                review: 'food vocabulary, invitation formulae, and meal kanji',
            }),
        }),
        lesson({
            id: 'lesson-n5-te-form-past-and-routines',
            order: 50,
            title: copy('N5 routines, past, and te-form bridge', 'N5：習慣・過去・て形への橋'),
            summary: copy('A consolidation block for the rest of N5 before Level 2+, drawing from the fuller Level 1+ archive.'),
            levelBand: 'N5',
            jlptBand: 'N5',
            status: 'source-audited',
            chronology: { kind: 'ucl', uclNodeId: 'ucl-2023-rie-level-1-plus-thu-7', localOrder: 1 },
            sourceMappings: [
                sourceMap('source-ucl-moodle-raw-manifest', 'chronology', '2023/24 Rie level 1+ Thursday 7pm fuller archive', 'metadata-only', 'Uses the richer Level 1+ archive for consolidation order.'),
                sourceMap('source-genki-study-resources', 'sequence', 'Genki lessons 7-12', 'sequence-only', 'Use N5 completion sequence: adjectives, past, te-form, comparisons.'),
                sourceMap('source-minna-live-lessons', 'scope', 'Minna no Nihongo I lessons 11-20', 'scope-only', 'Reference scope only.'),
                sourceMap('source-japanese-library-inventory', 'input-bank', 'Vocab 2k safe-filtered N5 seed list and Genki workbook audio', 'structure-only', 'Use the curated safe subset only.'),
                sourceMap('source-jlpt-framework', 'placement', 'N5 secure readiness', 'original-yomu', 'Feeds N5 placement confidence.'),
            ],
            implementationRefs: ['docs/academy/research/04-corpus-inventory.md#4-first-batch--ready-to-use-content'],
            provenanceSummary: 'No source wording should be copied; convert safe N5 inventory into original Academy tasks.',
            componentFocus: componentFocus({
                explanation: 'routine and past-time meaning before te-form practice',
                authenticInput: 'daily routine audio and short diary notes',
                vocabulary: 'days, times, home, school, routine verbs',
                grammar: 'past polite, te-form, adjectives, comparisons',
                kanji: '今, 来, 帰, 会, 社, 聞, 読, 書, 話',
                listening: 'confirm routine order from workbook-style audio',
                reading: 'read a simple diary or schedule',
                writing: 'write yesterday/today routine notes',
                speaking: 'describe a routine and one past event',
                review: 'te-form, past forms, routine vocabulary, and kanji 6',
            }),
        }),
        lesson({
            id: 'lesson-n4-genki-ii-transition',
            order: 60,
            title: copy('N4 Genki II transition', 'N4：Genki II への移行'),
            summary: copy('A Level 2+ bridge through Genki II opening material and N4 placement practice before the maker live Minna II track.'),
            levelBand: 'N4',
            jlptBand: 'N4',
            status: 'source-audited',
            chronology: { kind: 'ucl', uclNodeId: 'ucl-2024-rie-level-2-plus', localOrder: 1 },
            sourceMappings: [
                sourceMap('source-ucl-moodle-raw-manifest', 'chronology', '2024/25 Rie level 2+ Thursday 7pm', 'metadata-only', 'Preserves the Level 2+ bridge between N5 and current-year N4 material.'),
                sourceMap('source-ucl-moodle-publishable-catalog', 'input-bank', 'Grammar/listening/vocabulary aggregate patterns', 'metadata-only', 'Use aggregate pattern counts to plan conversion balance.'),
                sourceMap('source-genki-study-resources', 'sequence', 'Genki lessons 13-18', 'sequence-only', 'Use Genki II opening progression for N4 bridge.'),
                sourceMap('source-minna-live-lessons', 'scope', 'Minna no Nihongo I/II transition lessons 21-27', 'scope-only', 'Reference scope only until local source coverage is verified.'),
                sourceMap('source-jlpt-framework', 'placement', 'N4 emerging', 'original-yomu', 'Maps to N4 vocabulary, grammar, reading, and listening recommendations.'),
            ],
            implementationRefs: ['docs/academy/research/04-corpus-inventory.md#2-material--lesson-slot-mapping'],
            provenanceSummary: 'Level 2+ is the bridge where generated original tasks should cover N4 foundations before Minna II chapter 28.',
            componentFocus: componentFocus({
                explanation: 'N4 sentence linking before longer tasks',
                authenticInput: 'short advice and obligation scenarios',
                vocabulary: 'plans, reasons, permissions, obligations',
                grammar: 'potential, giving/receiving, must/need not, because',
                kanji: 'N4 bridge kanji from Genki II opening literacy sets',
                listening: 'understand a practical advice exchange',
                reading: 'read a short notice or advice message',
                writing: 'write a reasoned recommendation',
                speaking: 'give one reason and one suggestion',
                review: 'N4 bridge grammar, vocabulary, and lesson concepts',
            }),
        }),
        lesson({
            id: 'lesson-n4-minna-28',
            order: 70,
            title: copy('N4 Minna II 28: parallel actions and reasons', 'N4：みんなII 28 同時動作と理由'),
            summary: copy('The first live-course Minna II block: ながら, habitual ている, and し/し reason stacking.'),
            levelBand: 'N4',
            jlptBand: 'N4',
            status: 'source-audited',
            chronology: { kind: 'ucl', uclNodeId: 'ucl-2025-rie-level-3-2', localOrder: 1 },
            sourceMappings: [
                sourceMap('source-ucl-moodle-raw-manifest', 'chronology', '2025/26 Rie level 3-2', 'metadata-only', 'Preserves current live-course order.'),
                sourceMap('source-minna-live-lessons', 'scope', 'Local Lessons 1-2, Chapter 28: ながら, habitual ている, し/し', 'structure-only', 'Use filenames and task categories only until rights review.'),
                sourceMap('source-genki-study-resources', 'sequence', 'Genki lessons 19-20 adjacent N4 review', 'sequence-only', 'Genki supports sequence comparison, not direct content.'),
                sourceMap('source-japanese-library-inventory', 'input-bank', 'Maker live N4 track summary', 'structure-only', 'Inventory verifies chapter-topic mapping from filenames.'),
                sourceMap('source-jlpt-framework', 'placement', 'N4 grammar connections', 'original-yomu', 'Maps to N4 grammar recommendations.'),
            ],
            implementationRefs: ['/Users/heru/Documents/Japanese/Lessons/Lesson 1-20260310', '/Users/heru/Documents/Japanese/Lessons/Lesson 2-20260310'],
            provenanceSummary: 'Digitize as original Yomu explanations and practice after OCR; keep class worksheets private until reviewed.',
            componentFocus: componentFocus({
                explanation: 'parallel action and reason stacking before practice',
                authenticInput: 'daily-life multi-tasking and refusal conversation',
                vocabulary: 'routines, requests, reasons, study/work nouns',
                grammar: 'ながら, habitual ている, し...し',
                kanji: 'routine and communication kanji from class set',
                listening: 'hear reasons in a refusal or schedule exchange',
                reading: 'read a short explanation with multiple reasons',
                writing: 'write a polite refusal with two reasons',
                speaking: 'explain what you do while doing something else',
                review: 'ながら, し/し, and habitual ている checkpoints',
            }),
        }),
        lesson({
            id: 'lesson-n4-minna-29',
            order: 80,
            title: copy('N4 Minna II 29: states and completion', 'N4：みんなII 29 状態と完了'),
            summary: copy('The second live-course block: intransitive state ている and てしまう for completion/regret.'),
            levelBand: 'N4',
            jlptBand: 'N4',
            status: 'source-audited',
            chronology: { kind: 'ucl', uclNodeId: 'ucl-2025-rie-level-3-2', localOrder: 2 },
            sourceMappings: [
                sourceMap('source-ucl-moodle-raw-manifest', 'chronology', '2025/26 Rie level 3-2', 'metadata-only', 'Keeps chapter 29 after chapter 28.'),
                sourceMap('source-minna-live-lessons', 'scope', 'Local Lessons 3-4, Chapter 29: states in effect and てしまいました', 'structure-only', 'Use local file tree as audit evidence only.'),
                sourceMap('source-genki-study-resources', 'sequence', 'Genki lessons 20-21 adjacent N4 review', 'sequence-only', 'Genki supports comparative ordering.'),
                sourceMap('source-japanese-library-inventory', 'input-bank', 'Chapter 29 reading and listening filenames', 'structure-only', 'Reading/listening source candidates require conversion and rights review.'),
                sourceMap('source-jlpt-framework', 'placement', 'N4 reading information and grammar connections', 'original-yomu', 'Maps to N4 placement recommendations.'),
            ],
            implementationRefs: ['/Users/heru/Documents/Japanese/Lessons/Lesson 3-20260310', '/Users/heru/Documents/Japanese/Lessons/Lesson 4-20260310'],
            provenanceSummary: 'Prioritize original state/completion explanations; only metadata from class PDFs is safe now.',
            componentFocus: componentFocus({
                explanation: 'state-result meaning before translation drills',
                authenticInput: 'a small mishap report and visual state description',
                vocabulary: 'appearance, mistakes, broken/open/closed states',
                grammar: 'intransitive ている states and てしまう',
                kanji: 'appearance and action-result kanji',
                listening: 'identify what happened and what state remains',
                reading: 'read a brief mistake report',
                writing: 'write a short apology or incident note',
                speaking: 'describe a room or object state',
                review: 'state verbs, completion/regret, and reading checkpoints',
            }),
        }),
        lesson({
            id: 'lesson-n4-minna-30',
            order: 90,
            title: copy('N4 Minna II 30: prepared states and preparation', 'N4：みんなII 30 準備された状態と準備'),
            summary: copy('The third live-course block: てある and ておく with listening, information-gap, and reading candidates.'),
            levelBand: 'N4',
            jlptBand: 'N4',
            status: 'source-audited',
            chronology: { kind: 'ucl', uclNodeId: 'ucl-2025-rie-level-3-2', localOrder: 3 },
            sourceMappings: [
                sourceMap('source-ucl-moodle-raw-manifest', 'chronology', '2025/26 Rie level 3-2', 'metadata-only', 'Keeps chapter 30 after chapter 29.'),
                sourceMap('source-minna-live-lessons', 'scope', 'Local Lessons 5-6, Chapter 30: てある and ておく', 'structure-only', 'Use filenames and task categories only.'),
                sourceMap('source-genki-study-resources', 'sequence', 'Genki lesson 21 adjacent N4 review', 'sequence-only', 'Genki supports comparative ordering.'),
                sourceMap('source-japanese-library-inventory', 'input-bank', 'Chapter 30 local readings/audio: 日本で一番, バスのたび', 'structure-only', 'Candidate content requires OCR, segmentation, and rights review.'),
                sourceMap('source-jlpt-framework', 'placement', 'N4 listening decisions and grammar connections', 'original-yomu', 'Maps to N4 listening and grammar recommendations.'),
            ],
            implementationRefs: ['/Users/heru/Documents/Japanese/Lessons/Lesson 5-20260310', '/Users/heru/Documents/Japanese/Lessons/Lesson 6-20260310'],
            provenanceSummary: 'This is the highest-priority live-course digitization block because it has grammar, listening, speaking, reading, and homework candidates.',
            componentFocus: componentFocus({
                explanation: 'prepared state vs preparatory action before practice',
                authenticInput: 'trip preparation and information-gap setup',
                vocabulary: 'preparation, travel, signs, arranged objects',
                grammar: 'てある and ておく',
                kanji: 'preparation and travel kanji from class materials',
                listening: 'follow a preparation or travel checklist',
                reading: 'read a short travel/preparation note',
                writing: 'write a checklist for a trip or class event',
                speaking: 'explain what has been prepared and what to do ahead',
                review: 'てある/ておく contrast and travel-prep vocabulary',
            }),
        }),
        lesson({
            id: 'lesson-n4-level-3-plus-lesson-09',
            order: 100,
            title: copy('N4+ Level 3+ Lesson 9: plans that work for everyone', 'N4+：第9課 みんなのための計画'),
            summary: copy('The current encoded Yomu vertical slice: listening-first planning with なら, ありませんか, ように, writing, speaking, and kanji.'),
            levelBand: 'N4+',
            jlptBand: 'N4',
            status: 'encoded',
            chronology: { kind: 'ucl', uclNodeId: 'ucl-2025-rie-level-3-plus', localOrder: 9 },
            sourceMappings: [
                sourceMap('source-ucl-moodle-raw-manifest', 'chronology', '2025/26 Rie Level 3+ Thursday 7pm, Lesson 9', 'metadata-only', 'Preserves the UCL Lesson 9 placement.'),
                sourceMap('source-existing-yomu-academy-content', 'scope', 'unit-level-3-plus-lesson-09', 'original-yomu', 'Encoded original lesson graph is available now.'),
                sourceMap('source-genki-study-resources', 'sequence', 'Genki lessons 22-23', 'sequence-only', 'Sequence reference only.'),
                sourceMap('source-minna-live-lessons', 'scope', 'Minna no Nihongo II lessons 35-36', 'scope-only', 'Scope reference only; no source copying.'),
                sourceMap('source-jlpt-framework', 'placement', 'N4 secure / N3 on-ramp', 'original-yomu', 'Maps to N4 recommendation surface without official score claims.'),
            ],
            implementationRefs: ['src/academy/content.ts#unit-level-3-plus-lesson-09', 'tests/academy/content.test.ts'],
            provenanceSummary: 'All lesson wording, transcript, audio locator, model answer, rubric, and kanji references are original Yomu Academy material.',
            componentFocus: componentFocus({
                explanation: 'planning grammar before listening and production',
                authenticInput: 'original weekend-plan dialogue',
                vocabulary: 'plans, food, weather, map/support words',
                grammar: 'なら, noun は ありませんか, ように/ないように',
                kanji: '肉, 料, 理, 野, 半, 大, 小',
                listening: 'gist first, details on replay, transcript after attempt',
                reading: 'read the optional transcript and model plan',
                writing: 'write a shared-plan message with fallback',
                speaking: 'adapt the two-person exchange into one voice',
                review: 'planning grammar, kanji 7, and reflection checkpoints',
            }),
        }),
        lesson({
            id: 'lesson-yomu-continuation-authentic-plans',
            order: 110,
            title: copy('Yomu continuation: authentic plans and shadowing', 'よむ継続：本物の予定とシャドーイング'),
            summary: copy('The first post-mapped Yomu lesson: cleared authentic input, shadowing, and reader-backed sentence mining after Genki/Minna alignment ends.'),
            levelBand: 'N4+',
            jlptBand: 'N3-on-ramp',
            status: 'planned-continuation',
            chronology: { kind: 'yomu-continuation', afterLessonId: 'lesson-n4-level-3-plus-lesson-09' },
            sourceMappings: [
                sourceMap('source-existing-yomu-academy-content', 'continuation', 'Yomu Academy original continuation after Level 3+ Lesson 9', 'original-yomu', 'Defines the continuation as Yomu-owned, not textbook-mapped.'),
                sourceMap('source-authentic-subtitles', 'input-bank', 'Candidate subtitles: Pepper and Carrot, Unpacking, She and Her Cat', 'rights-review-required', 'Authentic lines require rights review or replacement with original lines.'),
                sourceMap('source-soya-research-audit', 'practice-shape', 'Listening/roleplay delivery patterns', 'structure-only', 'Use only delivery categories, not source items.'),
                sourceMap('source-jlpt-framework', 'placement', 'N3 on-ramp heuristic', 'original-yomu', 'Use as a growth path beyond current N4 placement.'),
            ],
            implementationRefs: ['docs/academy/research/06-learning-tools.md', 'docs/academy/research/07-study-hall.md'],
            provenanceSummary: 'Continuation content must be original or separately cleared; subtitle inventory is not a license to copy.',
            componentFocus: componentFocus({
                explanation: 'how to mine a real line before practising it',
                authenticInput: 'cleared short clip or original replacement based on authentic-plan shape',
                vocabulary: 'planning, time, contingencies, media-source words',
                grammar: 'sentence-linking review plus first N3-style compression',
                kanji: 'recurring planning/media kanji from mined lines',
                listening: 'listen-shadow-listen loop with transcript reveal',
                reading: 'read mined lines with furigana/gloss toggles',
                writing: 'write a mined-line diary or plan',
                speaking: 'shadow and record a short clip',
                review: 'reader SRS import plus Academy checkpoint',
            }),
        }),
        lesson({
            id: 'lesson-yomu-continuation-project-portfolio',
            order: 120,
            title: copy('Yomu continuation: project portfolio', 'よむ継続：プロジェクト・ポートフォリオ'),
            summary: copy('A Yomu-owned project layer for N3-bridge work: public-domain retellings, learner plans, and rubric-scored open production.'),
            levelBand: 'N3-bridge',
            jlptBand: 'N3-on-ramp',
            status: 'planned-continuation',
            chronology: { kind: 'yomu-continuation', afterLessonId: 'lesson-yomu-continuation-authentic-plans' },
            sourceMappings: [
                sourceMap('source-existing-yomu-academy-content', 'continuation', 'Public-domain Kaguya retelling and Yomu story bible direction', 'public-domain-retelling', 'Use original retellings, not modern copyrighted versions.'),
                sourceMap('source-authentic-subtitles', 'input-bank', 'Rights-reviewed authentic input as optional comparison material', 'rights-review-required', 'Rights-gated and optional.'),
                sourceMap('source-soya-research-audit', 'practice-shape', 'Roleplay and speaking activity shapes', 'structure-only', 'Structure-only inspiration.'),
                sourceMap('source-jlpt-framework', 'placement', 'N3 on-ramp heuristic', 'original-yomu', 'Guides difficulty only.'),
            ],
            implementationRefs: ['docs/academy/story/STORY-BIBLE.md', 'docs/academy/research/02-folktales.md'],
            provenanceSummary: 'The portfolio layer continues beyond mapped textbooks with original, rubric-scored projects and public-domain retellings.',
            componentFocus: componentFocus({
                explanation: 'project goal and model analysis before production',
                authenticInput: 'public-domain tale retelling plus optional cleared comparison',
                vocabulary: 'story, opinion, sequence, project reflection',
                grammar: 'paragraph linking and quotation/reporting basics',
                kanji: 'story and reflection kanji from the project text',
                listening: 'listen to an original retelling and identify sequence',
                reading: 'read the original retelling with reveal tools',
                writing: 'write a short project reflection',
                speaking: 'present the project in a short recorded talk',
                review: 'portfolio rubric, mined vocabulary, and checkpoint reflection',
            }),
        }),
    ],
    digitizationQueue: [
        {
            id: 'digitize-level-3-plus-lesson-09-bindings',
            priority: 1,
            impact: 'high',
            effort: 'small',
            workKinds: ['content-encoding', 'metadata-normalization'],
            lessonIds: ['lesson-n4-level-3-plus-lesson-09'],
            sourceIds: ['source-existing-yomu-academy-content', 'source-ucl-moodle-raw-manifest'],
            title: 'Bind encoded Level 3+ Lesson 9 into the canonical curriculum route',
            rationale: 'The full vertical slice already exists and proves the lesson-quality contract end to end.',
            privacyHandling: 'Expose only original Yomu content and aggregate UCL chronology.',
            rightsGate: 'clear-original-only',
        },
        {
            id: 'digitize-minna-30-tearu-teoku',
            priority: 2,
            impact: 'high',
            effort: 'medium',
            workKinds: ['ocr', 'audio-segmentation', 'rubric-authoring', 'rights-review', 'content-encoding'],
            lessonIds: ['lesson-n4-minna-30'],
            sourceIds: ['source-minna-live-lessons', 'source-japanese-library-inventory'],
            title: 'Digitize Minna II chapter 30: てある / ておく',
            rationale: 'Best live-course bundle: grammar, speaking, listening, reading, homework, and audio candidates are all present.',
            privacyHandling: 'Do not publish worksheet prompts, class audio, or file paths beyond source labels until rights review completes.',
            rightsGate: 'requires-review-before-publication',
        },
        {
            id: 'digitize-minna-29-state-shimau',
            priority: 3,
            impact: 'high',
            effort: 'medium',
            workKinds: ['ocr', 'audio-segmentation', 'rubric-authoring', 'rights-review', 'content-encoding'],
            lessonIds: ['lesson-n4-minna-29'],
            sourceIds: ['source-minna-live-lessons', 'source-japanese-library-inventory'],
            title: 'Digitize Minna II chapter 29: states and てしまう',
            rationale: 'Needed before chapter 30 for the live-course grammar ladder and incident-report writing.',
            privacyHandling: 'Use original Yomu examples after OCR; keep raw PDFs/audio private.',
            rightsGate: 'requires-review-before-publication',
        },
        {
            id: 'digitize-minna-28-nagara-shi',
            priority: 4,
            impact: 'medium',
            effort: 'medium',
            workKinds: ['ocr', 'audio-segmentation', 'rights-review', 'content-encoding'],
            lessonIds: ['lesson-n4-minna-28'],
            sourceIds: ['source-minna-live-lessons', 'source-japanese-library-inventory'],
            title: 'Digitize Minna II chapter 28: ながら and し/し',
            rationale: 'Completes the local live-course chapter 28 to 30 run.',
            privacyHandling: 'Convert structure into original activities; do not copy class worksheet wording.',
            rightsGate: 'requires-review-before-publication',
        },
        {
            id: 'ingest-genki-n5-structured-sequence',
            priority: 5,
            impact: 'high',
            effort: 'large',
            workKinds: ['quizlet-ingest', 'metadata-normalization', 'rights-review', 'content-encoding'],
            lessonIds: [
                'lesson-kana-on-ramp',
                'lesson-n5-hajimemashite',
                'lesson-n5-town-prices',
                'lesson-n5-food-invitations',
                'lesson-n5-te-form-past-and-routines',
            ],
            sourceIds: ['source-genki-study-resources', 'source-japanese-library-inventory'],
            title: 'Build the Genki-backed N5 structured sequence',
            rationale: 'Genki lesson 0 to 12 is the cleanest parseable route to a full N5 backbone.',
            privacyHandling: 'Ingest structure and glossary candidates; publish original questions unless explicit rights allow reuse.',
            rightsGate: 'requires-review-before-publication',
        },
        {
            id: 'clear-authentic-subtitle-continuation',
            priority: 6,
            impact: 'medium',
            effort: 'large',
            workKinds: ['rights-review', 'audio-segmentation', 'rubric-authoring', 'content-encoding'],
            lessonIds: ['lesson-yomu-continuation-authentic-plans'],
            sourceIds: ['source-authentic-subtitles', 'source-soya-research-audit'],
            title: 'Rights-review and segment the first authentic-input continuation lesson',
            rationale: 'This unlocks the Yomu continuation after mapped textbook material without pretending the subtitles are automatically reusable.',
            privacyHandling: 'Inventory-only until rights are confirmed; replace with original dialogue if clearance is not practical.',
            rightsGate: 'requires-review-before-publication',
        },
    ],
};

export function validateCurriculumGraph(graph: CurriculumGraph): readonly CurriculumValidationIssue[] {
    const issues: CurriculumValidationIssue[] = [];
    const sourcesById = indexById(graph.sources, 'sources', issues);
    const uclById = indexById(graph.uclChronology, 'uclChronology', issues);
    const lessonsById = indexById(graph.lessons, 'lessons', issues);
    indexById(graph.sourceMappingRules, 'sourceMappingRules', issues);
    indexById(graph.digitizationQueue, 'digitizationQueue', issues);

    validateContract(graph.lessonQualityContract, issues);

    graph.sources.forEach((source, index) => {
        const path = `sources[${index}]`;
        validateText(source.label, `${path}.label`, issues);
        validateText(source.locator, `${path}.locator`, issues);
        validateText(source.rights.note, `${path}.rights.note`, issues);
        validatePublicText(source.label, `${path}.label`, issues);
        validatePublicText(source.locator, `${path}.locator`, issues);
        if (source.kind === 'moodle-catalog' && source.rights.publicationMode !== 'metadata-only') {
            issue(issues, 'invalid-provenance', `${path}.rights.publicationMode`, 'Moodle catalog sources must stay metadata-only.');
        }
    });

    graph.uclChronology.forEach((node, index) => {
        const path = `uclChronology[${index}]`;
        validateText(node.sectionTitle, `${path}.sectionTitle`, issues);
        validatePublicText(node.sectionTitle, `${path}.sectionTitle`, issues);
        if (!sourcesById.has(node.sourceId)) issue(issues, 'unknown-reference', `${path}.sourceId`, `Unknown source ${node.sourceId}.`);
        if (!Number.isFinite(node.sequence) || node.sequence <= 0) issue(issues, 'invalid-chronology', `${path}.sequence`, 'UCL sequence must be positive.');
        if (node.downloadedModuleCount > node.manifestModuleCount) {
            issue(issues, 'invalid-chronology', `${path}.downloadedModuleCount`, 'Downloaded module count cannot exceed manifest module count.');
        }
    });
    validateStrictlyIncreasing(
        [...graph.uclChronology].sort((left, right) => left.sequence - right.sequence).map(node => node.sequence),
        'uclChronology.sequence',
        issues,
    );

    graph.sourceMappingRules.forEach((rule, index) => {
        validateText(rule.rule, `sourceMappingRules[${index}].rule`, issues);
        validatePublicText(rule.rule, `sourceMappingRules[${index}].rule`, issues);
    });

    graph.lessons.forEach((lessonItem, index) => {
        validateLesson(lessonItem, index, graph, sourcesById, uclById, lessonsById, issues);
    });
    validateStrictlyIncreasing(
        [...graph.lessons].sort((left, right) => left.order - right.order).map(lessonItem => lessonItem.order),
        'lessons.order',
        issues,
    );

    graph.digitizationQueue.forEach((item, index) => {
        const path = `digitizationQueue[${index}]`;
        validateText(item.title, `${path}.title`, issues);
        validatePublicText(item.title, `${path}.title`, issues);
        if (!Number.isInteger(item.priority) || item.priority <= 0) {
            issue(issues, 'invalid-digitization-queue', `${path}.priority`, 'Queue priority must be a positive integer.');
        }
        item.lessonIds.forEach((lessonId, lessonIndex) => {
            if (!lessonsById.has(lessonId)) issue(issues, 'unknown-reference', `${path}.lessonIds[${lessonIndex}]`, `Unknown lesson ${lessonId}.`);
        });
        item.sourceIds.forEach((sourceId, sourceIndex) => {
            if (!sourcesById.has(sourceId)) issue(issues, 'unknown-reference', `${path}.sourceIds[${sourceIndex}]`, `Unknown source ${sourceId}.`);
        });
        if (item.rightsGate === 'clear-original-only' && item.sourceIds.some(sourceId => {
            const rights = sourcesById.get(sourceId)?.rights;
            return rights?.directReuse !== 'allowed' && rights?.publicationMode !== 'metadata-only';
        })) {
            issue(issues, 'invalid-provenance', `${path}.rightsGate`, 'Clear-original queue items may reference only sources with allowed direct reuse.');
        }
    });

    return issues;
}

export function assertValidCurriculumGraph(graph: CurriculumGraph): void {
    const issues = validateCurriculumGraph(graph);
    if (issues.length > 0) {
        throw new Error(`Invalid Yomu Academy curriculum graph: ${issues.map(item => `${item.path} ${item.code}`).join('; ')}`);
    }
}

export function canonicalLessonsInOrder(graph: CurriculumGraph): readonly CurriculumLesson[] {
    return [...graph.lessons].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

export function sourceMappingsForLesson(graph: CurriculumGraph, lessonId: string): readonly SourceMapping[] {
    return graph.lessons.find(lessonItem => lessonItem.id === lessonId)?.sourceMappings ?? [];
}

export function lessonsForUclSection(graph: CurriculumGraph, uclNodeId: string): readonly CurriculumLesson[] {
    return canonicalLessonsInOrder(graph).filter(lessonItem => (
        lessonItem.chronology.kind === 'ucl' && lessonItem.chronology.uclNodeId === uclNodeId
    ));
}

export function lessonQualityChecklist(graph: CurriculumGraph, lessonId: string): LessonQualityChecklist | null {
    const lessonItem = graph.lessons.find(candidate => candidate.id === lessonId);
    if (!lessonItem) return null;

    const modalities = new Set(lessonItem.components.flatMap(component => component.modalities));
    const missingModalities = graph.lessonQualityContract.requiredModalities.filter(modality => !modalities.has(modality));
    const explanation = lessonItem.components.find(component => component.kind === 'explanation');
    const practiceComponents = lessonItem.components.filter(component => component.phase !== 'explanation' && component.assessment.kind !== 'none');
    const hasExplanationBeforePractice = Boolean(explanation) && practiceComponents.every(component => explanation!.order < component.order);
    const deterministicComponentIds = lessonItem.components
        .filter(component => component.assessment.kind === 'deterministic')
        .map(component => component.id);
    const openRubricComponentIds = lessonItem.components
        .filter(component => component.assessment.kind === 'open-rubric')
        .map(component => component.id);
    const missingReviewHooks = graph.lessonQualityContract.requiredReviewHooks.filter(hook => !lessonItem.review.hooks.includes(hook));
    const deliveryReady = graph.lessonQualityContract.requiredDelivery.every(key => lessonItem.delivery[key]);

    return {
        lessonId,
        missingModalities,
        hasExplanationBeforePractice,
        deterministicComponentIds,
        openRubricComponentIds,
        missingReviewHooks,
        deliveryReady,
        passed: missingModalities.length === 0
            && hasExplanationBeforePractice
            && deterministicComponentIds.length > 0
            && openRubricComponentIds.length >= graph.lessonQualityContract.openWorkKinds.length
            && missingReviewHooks.length === 0
            && deliveryReady,
    };
}

export function curriculumCoverageSummary(graph: CurriculumGraph): CurriculumCoverageSummary {
    const byStatus: Partial<Record<LessonStatus, number>> = {};
    const byJlptBand: Partial<Record<JlptBand, number>> = {};
    const sourceUsage = new Map<string, Set<string>>();

    for (const lessonItem of graph.lessons) {
        byStatus[lessonItem.status] = (byStatus[lessonItem.status] ?? 0) + 1;
        byJlptBand[lessonItem.jlptBand] = (byJlptBand[lessonItem.jlptBand] ?? 0) + 1;
        for (const mapping of lessonItem.sourceMappings) {
            const lessonIds = sourceUsage.get(mapping.sourceId) ?? new Set<string>();
            lessonIds.add(lessonItem.id);
            sourceUsage.set(mapping.sourceId, lessonIds);
        }
    }

    return {
        lessonCount: graph.lessons.length,
        encodedLessonCount: graph.lessons.filter(lessonItem => lessonItem.status === 'encoded').length,
        continuationLessonCount: graph.lessons.filter(lessonItem => lessonItem.chronology.kind === 'yomu-continuation').length,
        byStatus,
        byJlptBand,
        sourceUsage: [...sourceUsage.entries()]
            .map(([sourceId, lessonIds]) => ({ sourceId, lessonCount: lessonIds.size }))
            .sort((left, right) => right.lessonCount - left.lessonCount || left.sourceId.localeCompare(right.sourceId)),
    };
}

export function prioritizedDigitizationQueue(graph: CurriculumGraph): readonly DigitizationQueueItem[] {
    const impactRank: Record<DigitizationQueueItem['impact'], number> = { high: 0, medium: 1, low: 2 };
    const effortRank: Record<DigitizationQueueItem['effort'], number> = { small: 0, medium: 1, large: 2 };
    return [...graph.digitizationQueue].sort((left, right) => (
        left.priority - right.priority
        || impactRank[left.impact] - impactRank[right.impact]
        || effortRank[left.effort] - effortRank[right.effort]
        || left.id.localeCompare(right.id)
    ));
}

function lesson(input: LessonInput): CurriculumLesson {
    return {
        ...input,
        components: lessonComponents(input.id, input.componentFocus),
        delivery: standardDelivery,
        review: standardReview(input.id),
    };
}

function componentFocus(focus: LessonComponentFocus): LessonComponentFocus {
    return focus;
}

function sourceMap(
    sourceId: string,
    relation: SourceMappingRelation,
    reference: string,
    reuse: SourceReusePolicy,
    note: string,
): SourceMapping {
    return { sourceId, relation, reference, reuse, note };
}

function standardReview(lessonId: string): LessonReviewPlan {
    return {
        hooks: ['academy-checkpoint', 'yomu-vocab', 'lesson-concept'],
        checkpointTaskIds: [
            `${lessonId}:listening`,
            `${lessonId}:deterministic-practice`,
            `${lessonId}:open-production`,
            `${lessonId}:reflection`,
        ],
        srsIntervalDays: CURRICULUM_REVIEW_INTERVAL_DAYS,
        note: 'Academy checkpoints use the progress ladder; vocabulary and lesson concepts flow through the study bridge to Yomu SRS.',
    };
}

function lessonComponents(lessonId: string, focus: LessonComponentFocus): readonly LessonComponent[] {
    return [
        {
            id: `${lessonId}:explanation`,
            kind: 'explanation',
            phase: 'explanation',
            order: 10,
            title: copy(`Explain: ${focus.explanation}`),
            modalities: [],
            assessment: { kind: 'none' },
            provenanceNote: 'Teacher-authored explanation appears before any practice.',
        },
        {
            id: `${lessonId}:authentic-input`,
            kind: 'authentic-input',
            phase: 'input',
            order: 20,
            title: copy(`Input: ${focus.authenticInput}`),
            modalities: ['listening', 'reading'],
            assessment: { kind: 'none' },
            provenanceNote: 'Input is original or rights-reviewed and has audio-off text equivalence.',
        },
        deterministicComponent(lessonId, 'vocabulary', 30, `Vocabulary: ${focus.vocabulary}`, ['matching', 'exact']),
        deterministicComponent(lessonId, 'grammar', 40, `Grammar: ${focus.grammar}`, ['select-one', 'ordering', 'contains']),
        deterministicComponent(lessonId, 'kanji', 50, `Kanji: ${focus.kanji}`, ['matching', 'ordering']),
        deterministicComponent(lessonId, 'listening', 60, `Listening: ${focus.listening}`, ['select-one', 'select-many']),
        deterministicComponent(lessonId, 'reading', 70, `Reading: ${focus.reading}`, ['select-one', 'ordering', 'cloze']),
        {
            id: `${lessonId}:writing`,
            kind: 'writing',
            phase: 'production',
            order: 80,
            title: copy(`Writing: ${focus.writing}`),
            modalities: ['writing'],
            assessment: {
                kind: 'open-rubric',
                rubricId: `${lessonId}:writing-rubric`,
                modelAnswerPolicy: 'available-after-first-attempt',
                reviewMode: 'self-review',
            },
            provenanceNote: 'Open writing uses a rubric and model answer after first attempt.',
        },
        {
            id: `${lessonId}:speaking`,
            kind: 'speaking',
            phase: 'production',
            order: 90,
            title: copy(`Speaking: ${focus.speaking}`),
            modalities: ['speaking'],
            assessment: {
                kind: 'open-rubric',
                rubricId: `${lessonId}:speaking-rubric`,
                modelAnswerPolicy: 'available-after-first-attempt',
                reviewMode: 'self-review',
            },
            provenanceNote: 'Open speaking uses a model, rubric, transcript alternative, and no mandatory microphone path.',
        },
        {
            id: `${lessonId}:review-checkpoint`,
            kind: 'review-checkpoint',
            phase: 'checkpoint',
            order: 100,
            title: copy(`Review: ${focus.review}`),
            modalities: ['vocabulary', 'grammar', 'kanji', 'listening', 'reading', 'writing', 'speaking'],
            assessment: { kind: 'self-assessment', checkpoint: true },
            provenanceNote: 'Checkpoint writes to Academy progress and can seed Yomu SRS through the study bridge.',
        },
    ];
}

function deterministicComponent(
    lessonId: string,
    kind: Extract<LessonComponentKind, 'vocabulary' | 'grammar' | 'kanji' | 'listening' | 'reading'>,
    order: number,
    title: string,
    responseKinds: readonly DeterministicResponseKind[],
): LessonComponent {
    return {
        id: `${lessonId}:${kind}`,
        kind,
        phase: 'guided-practice',
        order,
        title: copy(title),
        modalities: [kind],
        assessment: {
            kind: 'deterministic',
            responseKinds,
            note: 'Deterministic grading is used only where the answer space is constrained.',
        },
        provenanceNote: 'Practice item wording should be original even when the sequence is source-aligned.',
    };
}

function validateContract(contract: LessonQualityContract, issues: CurriculumValidationIssue[]): void {
    validateText(contract.id, 'lessonQualityContract.id', issues);
    if (contract.requiredModalities.length !== curriculumModalities.length) {
        issue(issues, 'missing-contract', 'lessonQualityContract.requiredModalities', 'Contract must include every curriculum modality.');
    }
    if (!contract.explanationMustPrecedePractice) {
        issue(issues, 'missing-contract', 'lessonQualityContract.explanationMustPrecedePractice', 'Explanation-before-practice must be required.');
    }
}

function validateLesson(
    lessonItem: CurriculumLesson,
    index: number,
    graph: CurriculumGraph,
    sourcesById: ReadonlyMap<string, CurriculumSource>,
    uclById: ReadonlyMap<string, UclChronologyNode>,
    lessonsById: ReadonlyMap<string, CurriculumLesson>,
    issues: CurriculumValidationIssue[],
): void {
    const path = `lessons[${index}]`;
    validateCopy(lessonItem.title, `${path}.title`, issues);
    validateCopy(lessonItem.summary, `${path}.summary`, issues);
    validatePublicText(lessonItem.provenanceSummary, `${path}.provenanceSummary`, issues);

    if (lessonItem.chronology.kind === 'ucl') {
        const uclNode = uclById.get(lessonItem.chronology.uclNodeId);
        if (!uclNode) issue(issues, 'unknown-reference', `${path}.chronology.uclNodeId`, `Unknown UCL chronology node ${lessonItem.chronology.uclNodeId}.`);
        if (!Number.isInteger(lessonItem.chronology.localOrder) || lessonItem.chronology.localOrder <= 0) {
            issue(issues, 'invalid-chronology', `${path}.chronology.localOrder`, 'UCL local lesson order must be a positive integer.');
        }
    } else {
        const previous = lessonsById.get(lessonItem.chronology.afterLessonId);
        if (!previous) {
            issue(issues, 'unknown-reference', `${path}.chronology.afterLessonId`, `Unknown continuation predecessor ${lessonItem.chronology.afterLessonId}.`);
        } else if (lessonItem.order <= previous.order) {
            issue(issues, 'invalid-chronology', `${path}.order`, 'Yomu continuation lessons must sort after the lesson they continue.');
        }
    }

    if (lessonItem.sourceMappings.length === 0) {
        issue(issues, 'invalid-provenance', `${path}.sourceMappings`, 'Every lesson needs at least one source mapping.');
    }

    lessonItem.sourceMappings.forEach((mapping, mappingIndex) => {
        const mappingPath = `${path}.sourceMappings[${mappingIndex}]`;
        const source = sourcesById.get(mapping.sourceId);
        if (!source) {
            issue(issues, 'unknown-reference', `${mappingPath}.sourceId`, `Unknown source ${mapping.sourceId}.`);
            return;
        }
        validateText(mapping.reference, `${mappingPath}.reference`, issues);
        validatePublicText(mapping.reference, `${mappingPath}.reference`, issues);
        validatePublicText(mapping.note, `${mappingPath}.note`, issues);
        if (mapping.reuse === 'direct-copy' && source.rights.directReuse !== 'allowed') {
            issue(issues, 'invalid-provenance', `${mappingPath}.reuse`, `Source ${mapping.sourceId} is not authorized for direct copy.`);
        }
        if (source.kind === 'moodle-catalog' && mapping.reuse !== 'metadata-only') {
            issue(issues, 'invalid-provenance', `${mappingPath}.reuse`, 'Publishable Moodle catalog mappings must be metadata-only.');
        }
    });

    if (!lessonItem.sourceMappings.some(mapping => mapping.sourceId === 'source-jlpt-framework')) {
        issue(issues, 'missing-contract', `${path}.sourceMappings`, 'Each lesson needs a JLPT/framework heuristic mapping.');
    }

    validateLessonComponents(lessonItem, path, graph.lessonQualityContract, issues);
    validateLessonDelivery(lessonItem, path, graph.lessonQualityContract, issues);
    validateLessonReview(lessonItem, path, graph.lessonQualityContract, issues);
}

function validateLessonComponents(
    lessonItem: CurriculumLesson,
    lessonPath: string,
    contract: LessonQualityContract,
    issues: CurriculumValidationIssue[],
): void {
    indexById(lessonItem.components, `${lessonPath}.components`, issues);
    const modalitySet = new Set(lessonItem.components.flatMap(component => component.modalities));
    contract.requiredModalities.forEach(modality => {
        if (!modalitySet.has(modality)) {
            issue(issues, 'missing-contract', `${lessonPath}.components`, `Lesson is missing ${modality}.`);
        }
    });
    contract.deterministicKinds.forEach(kind => {
        if (!lessonItem.components.some(component => component.kind === kind)) {
            issue(issues, 'missing-contract', `${lessonPath}.components`, `Lesson is missing a ${kind} component.`);
        }
    });
    contract.openWorkKinds.forEach(kind => {
        if (!lessonItem.components.some(component => component.kind === kind)) {
            issue(issues, 'missing-contract', `${lessonPath}.components`, `Lesson is missing a ${kind} component.`);
        }
    });

    const explanation = lessonItem.components.find(component => component.kind === 'explanation');
    if (!explanation) {
        issue(issues, 'missing-contract', `${lessonPath}.components`, 'Lesson needs an explanation component.');
    }

    lessonItem.components.forEach((component, componentIndex) => {
        const componentPath = `${lessonPath}.components[${componentIndex}]`;
        validateCopy(component.title, `${componentPath}.title`, issues);
        validatePublicText(component.provenanceNote, `${componentPath}.provenanceNote`, issues);
        if (explanation && contract.explanationMustPrecedePractice && component.assessment.kind !== 'none' && component.order <= explanation.order) {
            issue(issues, 'missing-contract', `${componentPath}.order`, 'Explanation must precede practice and assessment.');
        }
        if (contract.deterministicKinds.includes(component.kind) && component.assessment.kind !== 'deterministic') {
            issue(issues, 'invalid-grading', `${componentPath}.assessment`, `${component.kind} should have deterministic grading.`);
        }
        if (component.assessment.kind === 'deterministic' && component.assessment.responseKinds.length === 0) {
            issue(issues, 'invalid-grading', `${componentPath}.assessment.responseKinds`, 'Deterministic components need at least one response kind.');
        }
        if (contract.openWorkKinds.includes(component.kind)) {
            if (component.assessment.kind !== 'open-rubric') {
                issue(issues, 'invalid-grading', `${componentPath}.assessment`, `${component.kind} needs rubric/model-answer handling.`);
            } else {
                validateText(component.assessment.rubricId, `${componentPath}.assessment.rubricId`, issues);
                if (component.assessment.modelAnswerPolicy !== contract.modelAnswerPolicy) {
                    issue(issues, 'invalid-grading', `${componentPath}.assessment.modelAnswerPolicy`, 'Open work model answers should be available after the first attempt.');
                }
            }
        }
    });
}

function validateLessonDelivery(
    lessonItem: CurriculumLesson,
    lessonPath: string,
    contract: LessonQualityContract,
    issues: CurriculumValidationIssue[],
): void {
    contract.requiredDelivery.forEach(key => {
        if (!lessonItem.delivery[key]) {
            issue(issues, 'missing-contract', `${lessonPath}.delivery.${key}`, `Delivery contract requires ${key}.`);
        }
    });
}

function validateLessonReview(
    lessonItem: CurriculumLesson,
    lessonPath: string,
    contract: LessonQualityContract,
    issues: CurriculumValidationIssue[],
): void {
    contract.requiredReviewHooks.forEach(hook => {
        if (!lessonItem.review.hooks.includes(hook)) {
            issue(issues, 'missing-contract', `${lessonPath}.review.hooks`, `Review plan needs ${hook}.`);
        }
    });
    if (lessonItem.review.checkpointTaskIds.length === 0) {
        issue(issues, 'missing-contract', `${lessonPath}.review.checkpointTaskIds`, 'Review plan needs checkpoint task ids.');
    }
}

function indexById<T extends { readonly id: string }>(
    items: readonly T[],
    path: string,
    issues: CurriculumValidationIssue[],
): Map<string, T> {
    const byId = new Map<string, T>();
    items.forEach((item, index) => {
        const itemPath = `${path}[${index}].id`;
        validateText(item.id, itemPath, issues);
        if (byId.has(item.id)) {
            issue(issues, 'duplicate-id', itemPath, `Duplicate id ${item.id}.`);
        } else {
            byId.set(item.id, item);
        }
    });
    return byId;
}

function validateStrictlyIncreasing(values: readonly number[], path: string, issues: CurriculumValidationIssue[]): void {
    values.forEach((value, index) => {
        if (index > 0 && value <= values[index - 1]!) {
            issue(issues, 'invalid-chronology', `${path}[${index}]`, 'Sequence values must be strictly increasing.');
        }
    });
}

function validateCopy(value: AcademyCopy, path: string, issues: CurriculumValidationIssue[]): void {
    validateText(value.en, `${path}.en`, issues);
    validatePublicText(value.en, `${path}.en`, issues);
    if (value.ja !== undefined) {
        validateText(value.ja, `${path}.ja`, issues);
        validatePublicText(value.ja, `${path}.ja`, issues);
    }
}

function validateText(value: string, path: string, issues: CurriculumValidationIssue[]): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
        issue(issues, 'blank-field', path, 'Required text must not be blank.');
    }
}

function validatePublicText(value: string, path: string, issues: CurriculumValidationIssue[]): void {
    if (PRIVATE_CONTACT_PATTERN.test(value)) {
        issue(issues, 'privacy-risk', path, 'Public curriculum metadata must not contain private contact data.');
    }
}

function issue(
    issues: CurriculumValidationIssue[],
    code: CurriculumValidationCode,
    path: string,
    message: string,
): void {
    issues.push({ code, path, message });
}

const PRIVATE_CONTACT_PATTERN = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(?:\b(?:\+?\d[\s().-]*){9,}\b)/i;
