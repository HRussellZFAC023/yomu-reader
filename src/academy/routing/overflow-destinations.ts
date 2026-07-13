export type AcademyOverflowDestinationId = 'class' | 'choose-lesson' | 'end-day' | 'settings' | 'achievements' | 'class-board';

export interface AcademyOverflowDestination {
    readonly id: AcademyOverflowDestinationId;
    readonly label: { readonly en: string; readonly ja: string };
    readonly accountRequired: boolean;
    readonly enrollmentRequired?: boolean;
}

/** Secondary destinations belong in the top-left overflow menu, never a puck/header/footer. */
export const ACADEMY_OVERFLOW_DESTINATIONS: readonly AcademyOverflowDestination[] = [
    { id: 'class', label: { en: 'Class', ja: 'クラス' }, accountRequired: false, enrollmentRequired: true },
    { id: 'choose-lesson', label: { en: 'Choose lesson', ja: 'レッスンを選ぶ' }, accountRequired: false, enrollmentRequired: true },
    { id: 'end-day', label: { en: 'End for today', ja: '今日はここまで' }, accountRequired: false, enrollmentRequired: true },
    { id: 'settings', label: { en: 'Settings', ja: '設定' }, accountRequired: false },
    { id: 'achievements', label: { en: 'Achievements', ja: '実績' }, accountRequired: false },
    { id: 'class-board', label: { en: 'Class Board', ja: 'クラスボード' }, accountRequired: true },
];
