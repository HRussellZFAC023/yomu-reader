export type CurriculumActivityKind =
    | 'READ'
    | 'FLASHCARDS'
    | 'QUIZ'
    | 'GAME'
    | 'CHAT';

export interface CurriculumSourceReceipt {
    readonly sourceId: string;
    readonly sha256: string;
    readonly itemId: string;
    readonly versionId: string;
}

export interface CurriculumAugmentation {
    readonly provider: 'honen';
    readonly courseId: string;
    readonly unitId: string;
    readonly topicId: string;
    readonly activityId: string;
    readonly activityKind: CurriculumActivityKind;
    readonly mappedLessonId: string;
    readonly mappedActivityId: string;
    readonly renderOwner: 'yomu';
    readonly sourceReceipts: readonly CurriculumSourceReceipt[];
}
