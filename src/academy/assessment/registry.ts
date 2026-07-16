import { SOYA_JLPT_ASSESSMENT, SOYA_JLPT_ASSESSMENT_ID } from './soya-jlpt-assessment';

export type AcademyAssessmentPackage = typeof SOYA_JLPT_ASSESSMENT;

export const ACADEMY_ASSESSMENT_PACKAGES: readonly AcademyAssessmentPackage[] = [
    SOYA_JLPT_ASSESSMENT,
];

export function resolveAcademyAssessmentPackage(id: string): AcademyAssessmentPackage {
    if (id === SOYA_JLPT_ASSESSMENT_ID) return SOYA_JLPT_ASSESSMENT;
    throw new TypeError(`Unknown Academy assessment package: ${id}`);
}
