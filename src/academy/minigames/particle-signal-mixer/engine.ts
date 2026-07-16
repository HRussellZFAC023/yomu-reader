import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type {
    ParticleSignalMixerModel,
    ParticleSignalMixerResponse,
    ParticleSignalRound,
    ParticleSignalSourceVisual,
} from './manifest';

const SOURCE_PAYLOAD_SHA256 = 'e2e34dd1605354d4e533c936105f391125a6db82f4610365b286ad6f8286c213';
const SOURCE_TITLE = 'Handouts/Chapter 22-2 modifying clauses-2_grammar exercise.pdf';
const SOURCE_VISUALS = Object.freeze({
    1: {
        url: '/academy/content/lessons/l2-l09/moodle-chapter-22-2-particle-mixer-page-1.png',
        sha256: '5257d4151ac5111057e4ffe7a227e208adc5bd0b8ca4c5532687266b0a8df406',
    },
    3: {
        url: '/academy/content/lessons/l2-l09/moodle-chapter-22-2-particle-mixer-page-3.png',
        sha256: '3084a14e5136c6ee654d0d984ed11697f7bf757833f99354aa2f7f03159efea6',
    },
});

export function validateParticleSignalMixer(model: ParticleSignalMixerModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The particle signal mixer requires assessed answer support.' });
    }
    const moodle = model.provenance?.moodle;
    if (model.provenance?.packageId !== 'l2-l09'
        || model.provenance.packageOrder !== 36
        || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== 6974657
        || moodle.answerKeyBasis !== 'yomu-derived-transformations-over-verbatim-source-teaching-and-prompts') {
        issues.push({ path: 'provenance.moodle', message: 'Lesson 34 requires the exact l2-l09 package and Chapter 22-2 source.' });
    }
    if (!Array.isArray(moodle?.sourceSheets)
        || moodle.sourceSheets.length !== 2
        || !validVisual(moodle.sourceSheets[0], 1)
        || !validVisual(moodle.sourceSheets[1], 3)) {
        issues.push({ path: 'provenance.moodle.sourceSheets', message: 'The exact canonical Chapter 22-2 pages 1 and 3 are required.' });
    }
    if (moodle?.audio.status !== 'quarantined-unresolved-pairing'
        || moodle.audio.sourceAudioMembers !== 1
        || moodle.audio.sourceAudioTracksDelivered !== 0) {
        issues.push({ path: 'provenance.moodle.audio', message: 'The unresolved Moodle audio member must remain quarantined.' });
    }
    if (model.provenance?.support.minna.reference !== 'Minna no Nihongo I · Lesson 22'
        || model.provenance.support.minna.reuse !== 'chronology-and-scope-only'
        || model.provenance.support.genki.crosswalk !== '≈ Genki II · L15'
        || model.provenance.support.genki.reuse !== 'sequence-only') {
        issues.push({ path: 'provenance.support', message: 'Minna and Genki may support sequence only; neither supplies prompts or answers.' });
    }
    if (!Array.isArray(model.payload?.teaching)
        || model.payload.teaching.length !== 4
        || model.payload.teaching.some(step => !text(step.title) || !text(step.text))) {
        issues.push({ path: 'payload.teaching', message: 'All four verbatim teaching blocks must precede assessment.' });
    }
    if (model.payload?.taskHeadings?.join('|') !== '1: Following examples, create noun-modifying clause sentences.|4: Following examples, create sentences.') {
        issues.push({ path: 'payload.taskHeadings', message: 'The two verbatim source task headings are required.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 4 || rounds.map(round => round.sourceOrder).join(',') !== '1,2,3,4') {
        issues.push({ path: 'payload.rounds', message: 'The four selected source transformations must remain in source order.' });
    } else {
        const ids = new Set<string>();
        const sourceIds = new Set<string>();
        const errorTags = new Set<string>();
        rounds.forEach((round, index) => validateRound(model, round, index, ids, sourceIds, errorTags, issues));
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All modifier and particle signals are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeParticleSignalMixer(
    model: ParticleSignalMixerModel,
    response: ParticleSignalMixerResponse,
): GradeResult {
    const signals = parseResponse(model, response);
    const errors: string[] = [];
    let correct = 0;
    model.payload.rounds.forEach(round => {
        const signal = signals.get(round.id);
        if (signal?.optionId === round.correctOptionId && signal.particle === round.correctParticle) correct += 1;
        else errors.push(round.errorTag);
    });
    return gradeFromScore(correct / model.payload.rounds.length, model.payload.passScore, errors.sort(), model.payload.feedback);
}

export function particleSignalMixerReviewSeeds(
    model: ParticleSignalMixerModel,
    result: GradeResult,
): readonly ReviewSeed[] {
    return model.payload.rounds.flatMap(round => result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)
        ? []
        : [{
            id: `review:l2-l09:particle-signal:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: {
                expression: round.answerExpression,
                meanings: [`Sensei Chapter 22-2 source item ${round.sourceTask}-${round.sourceItem}`],
            },
        } satisfies ReviewSeed]);
}

function validateRound(
    model: ParticleSignalMixerModel,
    round: ParticleSignalRound,
    index: number,
    ids: Set<string>,
    sourceIds: Set<string>,
    errorTags: Set<string>,
    issues: ValidationIssue[],
): void {
    const optionIds = new Set(round.options?.map(option => option.id));
    if (!text(round.id) || ids.has(round.id)
        || !text(round.sourceQuestionId) || sourceIds.has(round.sourceQuestionId)
        || !text(round.sourcePrompt) || !text(round.phraseTail) || !text(round.answerExpression)
        || !Array.isArray(round.options) || round.options.length !== 3
        || optionIds.size !== 3 || round.options.some(option => !text(option.id) || !text(option.label))
        || !optionIds.has(round.correctOptionId)
        || (round.correctParticle !== 'を' && round.correctParticle !== 'が')
        || !model.conceptIds.includes(round.conceptId)
        || !text(round.errorTag) || errorTags.has(round.errorTag)
        || !Array.isArray(round.hints) || round.hints.length !== 3
        || round.hints.some(hint => !text(hint.en) || !text(hint.ja))) {
        issues.push({ path: `payload.rounds.${index}`, message: 'Each source signal needs three forms, one particle channel, one derived answer, and three bilingual hints.' });
    }
    ids.add(round.id);
    sourceIds.add(round.sourceQuestionId);
    errorTags.add(round.errorTag);
}

function parseResponse(
    model: ParticleSignalMixerModel,
    response: ParticleSignalMixerResponse,
): ReadonlyMap<string, Readonly<{ optionId: string; particle: 'を' | 'が' }>> {
    if (!response || !Array.isArray(response.signals) || response.signals.length !== model.payload.rounds.length) {
        throw new TypeError('Tune all four Chapter 22-2 signals.');
    }
    const signals = new Map<string, Readonly<{ optionId: string; particle: 'を' | 'が' }>>();
    response.signals.forEach(signal => {
        const round = model.payload.rounds.find(candidate => candidate.id === signal.roundId);
        if (!round || signals.has(signal.roundId)
            || !round.options.some(option => option.id === signal.optionId)
            || (signal.particle !== 'を' && signal.particle !== 'が')) {
            throw new TypeError('Each Chapter 22-2 source row needs one unique form and one particle channel.');
        }
        signals.set(signal.roundId, { optionId: signal.optionId, particle: signal.particle });
    });
    return signals;
}

function validVisual(value: ParticleSignalSourceVisual | undefined, page: 1 | 3): boolean {
    const expected = SOURCE_VISUALS[page];
    return Boolean(value && text(value.sourceId) && value.title === SOURCE_TITLE && value.page === page
        && value.payloadSha256 === SOURCE_PAYLOAD_SHA256
        && value.url === expected.url && value.sha256 === expected.sha256
        && text(value.alt.en) && text(value.alt.ja));
}
