import type { LearnerEvent, LearningSkill } from './learner-record';
import type { AcademyModeId } from './mode-registry';

export type OpeningPreference = 'audio' | 'text' | 'speaking';
export type ActivityFormat = 'reading' | 'reconstruction' | 'listening' | 'video' | 'shadowing' | 'production' | 'writing' | 'mixed';

export interface RecommendationCandidate {
    readonly id: string;
    readonly modeId: AcademyModeId;
    readonly skill: LearningSkill;
    readonly format: ActivityFormat;
    readonly due: boolean;
    readonly mainLesson: boolean;
}

export interface ActivityRecommendation extends RecommendationCandidate {
    readonly score: number;
    readonly reasons: readonly ('main-lesson' | 'due' | 'opening-prior' | 'needs-repair' | 'needs-evidence')[];
}

const FORMAT_PRIORS: Readonly<Record<OpeningPreference, readonly ActivityFormat[]>> = {
    audio: ['listening', 'video', 'shadowing'],
    text: ['reading', 'reconstruction', 'writing'],
    speaking: ['shadowing', 'production', 'mixed'],
};

export function recommendActivities(
    candidates: readonly RecommendationCandidate[],
    events: readonly LearnerEvent[],
    openingPreference: OpeningPreference,
): readonly ActivityRecommendation[] {
    const evidence = evidenceBySkill(events);
    return candidates
        .filter(candidate => candidate.modeId !== 'inferno-pressure')
        .map(candidate => {
            const skill = evidence[candidate.skill] ?? { attempts: 0, repairDebt: 0 };
            const reasons: ActivityRecommendation['reasons'][number][] = [];
            let score = 0;
            if (candidate.mainLesson) { score += 100; reasons.push('main-lesson'); }
            if (candidate.due) { score += 35; reasons.push('due'); }
            const priorIndex = FORMAT_PRIORS[openingPreference].indexOf(candidate.format);
            if (priorIndex >= 0) { score += 12 - priorIndex * 3; reasons.push('opening-prior'); }
            if (skill.repairDebt > 0) { score += Math.min(60, skill.repairDebt * 8); reasons.push('needs-repair'); }
            if (skill.attempts < 3) { score += (3 - skill.attempts) * 6; reasons.push('needs-evidence'); }
            return { ...candidate, score, reasons };
        })
        .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function evidenceBySkill(events: readonly LearnerEvent[]): Partial<Record<LearningSkill, { attempts: number; repairDebt: number }>> {
    const result: Partial<Record<LearningSkill, { attempts: number; repairDebt: number }>> = {};
    events.forEach(event => {
        if (event.kind !== 'learning-evidence-recorded') return;
        const current = result[event.skill] ?? { attempts: 0, repairDebt: 0 };
        result[event.skill] = {
            attempts: current.attempts + 1,
            repairDebt: event.outcome === 'lapse' ? current.repairDebt + 1 : Math.max(0, current.repairDebt - 1),
        };
    });
    return result;
}
