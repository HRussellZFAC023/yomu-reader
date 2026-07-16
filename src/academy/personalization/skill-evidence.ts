import type { LearnerEvent, LearningSkill } from '../domain/learner-record';
import type { ChallengeLevel, SkillEvidence } from './contracts';

const SKILLS: readonly LearningSkill[] = [
    'kana', 'kanji', 'vocabulary', 'grammar', 'reading',
    'listening', 'speaking', 'writing', 'repair', 'transfer',
];
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

type LearningEvidence = Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }>;

export function projectSkillEvidence(events: readonly LearnerEvent[], now: number): readonly SkillEvidence[] {
    requireTimestamp(now, 'now');
    const learning = events
        .filter((event): event is LearningEvidence => event.kind === 'learning-evidence-recorded' && event.at <= now)
        .slice()
        .sort((left, right) => left.at - right.at || left.eventId.localeCompare(right.eventId));

    return SKILLS.map(skill => evidenceForSkill(skill, learning.filter(event => event.skill === skill), now));
}

function evidenceForSkill(skill: LearningSkill, events: readonly LearningEvidence[], now: number): SkillEvidence {
    const independentPasses = events.filter(event => event.independent && event.outcome === 'pass');
    const supportedPasses = events.filter(event => !event.independent && event.outcome === 'pass');
    const independentLapses = events.filter(event => event.independent && event.outcome === 'lapse').length;
    const days = new Set(independentPasses.map(event => utcDay(event.at))).size;
    const recentIndependentPasses = independentPasses.filter(event => event.at <= now && event.at >= now - RECENT_WINDOW_MS).length;
    const repairDebt = events.reduce((debt, event) => {
        if (event.outcome === 'lapse') return debt + 1;
        return event.independent ? Math.max(0, debt - 1) : debt;
    }, 0);
    const storageLevel = storageLevelFor(independentPasses.length, independentLapses, days);

    return {
        skill,
        attempts: events.length,
        independentPasses: independentPasses.length,
        supportedPasses: supportedPasses.length,
        lapses: events.filter(event => event.outcome === 'lapse').length,
        distinctIndependentDays: days,
        recentIndependentPasses,
        storageLevel,
        fluency: fluencyFor(recentIndependentPasses, repairDebt),
        repairDebt,
        lastAttemptAt: events.at(-1)?.at ?? null,
    };
}

function storageLevelFor(passes: number, lapses: number, days: number): ChallengeLevel {
    const lapseRate = passes + lapses === 0 ? 0 : lapses / (passes + lapses);
    if (passes >= 10 && days >= 6 && lapseRate <= 0.2) return 5;
    if (passes >= 6 && days >= 4 && lapseRate <= 0.3) return 4;
    if (passes >= 4 && days >= 3 && lapseRate <= 0.4) return 3;
    if (passes >= 2 && days >= 2) return 2;
    if (passes >= 1) return 1;
    return 0;
}

function fluencyFor(recentPasses: number, repairDebt: number): SkillEvidence['fluency'] {
    if (!recentPasses) return 'unobserved';
    if (recentPasses < 2 || repairDebt > 0) return 'fragile';
    return 'available';
}

function utcDay(at: number): string {
    return new Date(at).toISOString().slice(0, 10);
}

function requireTimestamp(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer timestamp.`);
}
