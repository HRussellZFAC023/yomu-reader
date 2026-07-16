import vocabularyParity from '../../../public/academy/content/source-pipeline/vocabulary-parity.v1.json';
import {
    loadLibraryVocabularySheet,
    type LibraryVocabularySheet,
} from './library-vocabulary-sheet';
import { ACADEMY_LESSON_CONTENT_REGISTRY } from './lesson-content-registry';
import type { AuthoredWeekId } from './authored-week-adapter';
import { requiresExactLibraryVocabulary } from './lesson-27-31-library-vocabulary';
import { requiresEarlyLibraryVocabulary } from './lesson-8-10-library-vocabulary';

export const PLAYABLE_SENSEI_VOCABULARY_LESSON_IDS = Object.freeze([
    'lesson:foundation-00',
    ...ACADEMY_LESSON_CONTENT_REGISTRY.flatMap(registration => registration.kind === 'authored-week'
        ? [`authored-week:${registration.packageId}` as const]
        : []),
] satisfies readonly PlayableSenseiVocabularyLessonId[]);

export type PlayableSenseiVocabularyLessonId = 'lesson:foundation-00' | `authored-week:${AuthoredWeekId}`;

export interface SenseiVocabularySourceEvidence {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly extractionStatus: 'partial' | 'complete';
    readonly rowCount: number;
    readonly completeRowCount: number;
}

export interface SenseiVocabularyPrerequisiteEvidence {
    readonly status: 'gap-declared' | 'no-moodle-vocabulary-sheet';
    readonly gaps: readonly string[];
    readonly sourceSheets: readonly SenseiVocabularySourceEvidence[];
}

export interface SenseiVocabularyPrerequisite {
    readonly lessonId: PlayableSenseiVocabularyLessonId;
    readonly packageId?: string;
    readonly sheet: LibraryVocabularySheet;
    readonly evidence: SenseiVocabularyPrerequisiteEvidence;
}

interface VocabularyParityRecord {
    readonly lessonId: string;
    readonly sheets: readonly {
        readonly sourceId: string;
        readonly payloadSha256: string;
        readonly extractionStatus: 'partial' | 'complete';
        readonly rowCount: number;
        readonly completeRowCount: number;
    }[];
    readonly parityStatus: 'gap-declared';
    readonly gaps: readonly string[];
}

const PARITY_BY_PACKAGE = new Map<string, VocabularyParityRecord>(
    (vocabularyParity.lessons as readonly VocabularyParityRecord[])
        .map(record => [record.lessonId, record]),
);

/** The only pre-activity vocabulary prerequisites currently playable in Academy. */
export function isPlayableSenseiVocabularyLessonId(value: string): value is PlayableSenseiVocabularyLessonId {
    return (PLAYABLE_SENSEI_VOCABULARY_LESSON_IDS as readonly string[]).includes(value);
}

/**
 * Binds an authored lesson to its actual source-row projection and its source
 * pipeline evidence. A source-id mismatch is a release error, never a fallback.
 */
export async function loadSenseiVocabularyPrerequisite(
    lessonId: PlayableSenseiVocabularyLessonId,
    fetcher: typeof fetch = fetch,
): Promise<SenseiVocabularyPrerequisite> {
    if (lessonId === 'lesson:foundation-00') {
        return {
            lessonId,
            sheet: noMoodleSheet(),
            evidence: {
                status: 'no-moodle-vocabulary-sheet',
                gaps: Object.freeze(['lesson-zero-has-no-moodle-vocabulary-sheet']),
                sourceSheets: Object.freeze([]),
            },
        };
    }

    const packageId = lessonId.slice('authored-week:'.length);
    const parity = PARITY_BY_PACKAGE.get(packageId);
    if (!parity) throw new TypeError(`Missing vocabulary parity evidence for ${packageId}.`);
    const sheet = await loadLibraryVocabularySheet(packageId, fetcher);
    const sourceSheets = Object.freeze(parity.sheets.map(source => Object.freeze({ ...source })));
    validateSenseiVocabularyLinkage(packageId, sheet, sourceSheets, parity.gaps);
    return {
        lessonId,
        packageId,
        sheet,
        evidence: {
            status: parity.parityStatus,
            gaps: Object.freeze([...parity.gaps]),
            sourceSheets,
        },
    };
}

export function validateSenseiVocabularyLinkage(
    packageId: string,
    sheet: LibraryVocabularySheet,
    sourceSheets: readonly SenseiVocabularySourceEvidence[],
    gaps: readonly string[],
): void {
    if (sheet.sourceStatus === 'exact-source') {
        if (!sourceSheets.some(source => source.sourceId === sheet.sourceId)) {
            throw new TypeError(`${packageId} vocabulary prerequisite is not mapped to a Moodle parity source.`);
        }
        if (!sheet.items.length || sheet.items.some(item => !item.source.id.startsWith(`${sheet.sourceId}:`))) {
            throw new TypeError(`${packageId} exact vocabulary rows are not linked to their Moodle source.`);
        }
        return;
    }
    if (requiresEarlyLibraryVocabulary(packageId) || requiresExactLibraryVocabulary(packageId)) {
        throw new TypeError(`${packageId} is inside the delivered vocabulary frontier but has no exact Library projection.`);
    }
    if (sourceSheets.length === 0 && !gaps.includes('no-exact-source-vocabulary-sheet')) {
        throw new TypeError(`${packageId} lacks both an exact sheet and an honest source gap.`);
    }
    if (sourceSheets.length > 0 && !gaps.includes('source-sheet-extraction-incomplete')) {
        throw new TypeError(`${packageId} has unlinked Moodle vocabulary evidence without an extraction gap.`);
    }
}

function noMoodleSheet(): LibraryVocabularySheet {
    return Object.freeze({
        id: 'lesson-zero:no-moodle-vocabulary-sheet',
        lessonId: 'lesson:foundation-00',
        title: 'Lesson 0 vocabulary status',
        sourceId: 'academy:lesson-zero:no-moodle-vocabulary-sheet',
        sourceStatus: 'not-provided',
        items: Object.freeze([]),
    });
}
