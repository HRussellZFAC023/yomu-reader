import {
    type ActivityModel,
    type ActivityPlugin,
    type ReviewSeed,
    type ValidationIssue,
} from '../domain/activity-runtime';
import {
    BEGINNER_CONSTRUCTED_RESPONSE_HINT_TIERS,
    type BeginnerConstructedResponseHintTier,
} from '../domain/learner-support';
import type { LocalizedText } from '../domain/source-library';
import { renderConstructedResponse } from './constructed-response-view';

export interface ConstructedResponseReadingSupport {
    /** Reading of the authored prompt, never of an accepted answer. */
    readonly reading: string;
    /** Authored pitch description for the prompt. */
    readonly pitch: string;
}

export interface ConstructedResponseLapseFeedback {
    readonly errorTag: string;
    readonly contrast: LocalizedText;
    readonly repairPrompt: LocalizedText;
    /** Retained for the error-to-example bridge; the retry surface stays concise. */
    readonly nearbyExample: LocalizedText;
}

export interface ConstructedResponsePayload {
    /** Kana/kanji variants are accepted only when they are explicitly listed here. */
    readonly acceptedAnswers: readonly string[];
    readonly passFeedback: LocalizedText;
    readonly lapseFeedback: ConstructedResponseLapseFeedback;
    /** Optional post-commit diagnostics, matched in authored order. */
    readonly lapseDiagnostics?: readonly ConstructedResponseDiagnostic[];
    readonly reviewSeedId: string;
    readonly reviewContent: ReviewSeed['content'];
    readonly promptReadingSupport?: ConstructedResponseReadingSupport;
    /** Progressive, learner-requested support. Hint content is mounted only after a request. */
    readonly hints?: readonly ConstructedResponseHint[];
}

export interface ConstructedResponseHint {
    readonly text: LocalizedText;
    /** Strict beginner path: task purpose, then vocabulary/reading, then form. */
    readonly tier?: BeginnerConstructedResponseHintTier;
    /** Required for the vocabulary-reading tier. Each cue stays below a full response. */
    readonly vocabulary?: readonly ConstructedResponseVocabularyCue[];
    /** Required for the form-scaffold tier; it must leave the response to the learner. */
    readonly scaffold?: LocalizedText;
    /** Legacy answer-fill support. New tiered hints must use a scaffold instead. */
    readonly fillResponse?: string;
}

export interface ConstructedResponseVocabularyCue {
    readonly expression: string;
    readonly reading: string;
    readonly meaning: LocalizedText;
}

export interface ConstructedResponseDiagnostic {
    readonly responseIncludesAny: readonly string[];
    readonly feedback: ConstructedResponseLapseFeedback;
}

export interface ConstructedResponseActivityModel extends ActivityModel {
    readonly kind: 'constructed-japanese';
    readonly responseKind: 'ime' | 'reconstruct';
    readonly payload: ConstructedResponsePayload;
}

export const constructedResponseActivityPlugin: ActivityPlugin<ConstructedResponseActivityModel, string> = {
    kind: 'constructed-japanese',
    validate: validateConstructedResponse,
    render(model, host, submit) {
        return renderConstructedResponse(model, host, submit, normalizeJapaneseResponse);
    },
    grade(model, response) {
        if (typeof response !== 'string') throw new TypeError('Constructed Japanese responses must be text.');
        const normalized = normalizeJapaneseResponse(response);
        if (!normalized) throw new TypeError('A constructed Japanese response cannot be empty.');
        const accepted = model.payload.acceptedAnswers.some(answer => normalizeJapaneseResponse(answer) === normalized);
        if (accepted) {
            return {
                outcome: 'pass',
                score: 1,
                errorTags: [],
                feedback: { explanation: model.payload.passFeedback },
            };
        }
        const feedback = diagnosticFeedback(model, normalized) ?? model.payload.lapseFeedback;
        return {
            outcome: 'lapse',
            score: 0,
            errorTags: [feedback.errorTag],
            feedback: {
                explanation: feedback.contrast,
                repairPrompt: feedback.repairPrompt,
                nearbyExample: feedback.nearbyExample,
            },
        };
    },
    toReviewSeeds(model, result): readonly ReviewSeed[] {
        // One expression is one review item. The attempt keeps every Concept;
        // the first authored Concept is the expression's canonical provenance.
        // Keeping the seed id independent of outcome makes retries idempotent.
        const conceptId = model.conceptIds[0];
        if (!conceptId) return [];
        return [{
            id: model.payload.reviewSeedId,
            conceptId,
            reason: result.outcome === 'lapse' ? 'repair' : 'new-learning',
            ...(model.sourceQuestionId ? { sourceQuestionId: model.sourceQuestionId } : {}),
            content: model.payload.reviewContent,
        }];
    },
};

/**
 * Normalise presentation-only differences without silently accepting an
 * unauthored kana, kanji, or lexical variant.
 */
export function normalizeJapaneseResponse(value: string): string {
    return value
        .normalize('NFKC')
        .replace(/[\s\u3000]+/gu, '')
        .replace(/[.,!?;:。、！？「」『』（）()\[\]【】〈〉《》…~～]/gu, '');
}

function validateConstructedResponse(model: ConstructedResponseActivityModel): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const payload = model.payload;
    if (!model.answerSupport) {
        issues.push({ path: 'answerSupport', message: 'Assessed constructed responses require the hidden pre-commit answer-support contract.' });
    }
    if (model.responseKind !== 'ime' && model.responseKind !== 'reconstruct') {
        issues.push({ path: 'responseKind', message: 'Constructed Japanese uses an IME or reconstruction response.' });
    }
    if (!Array.isArray(payload?.acceptedAnswers) || payload.acceptedAnswers.length === 0) {
        issues.push({ path: 'payload.acceptedAnswers', message: 'At least one explicitly authored accepted answer is required.' });
        return issues;
    }

    const normalizedAnswers = new Set<string>();
    for (const [index, answer] of payload.acceptedAnswers.entries()) {
        const normalized = typeof answer === 'string' ? normalizeJapaneseResponse(answer) : '';
        if (!normalized || !containsJapanese(normalized)) {
            issues.push({ path: `payload.acceptedAnswers.${index}`, message: 'Accepted answers must contain Japanese text.' });
        } else if (normalizedAnswers.has(normalized)) {
            issues.push({ path: `payload.acceptedAnswers.${index}`, message: 'Accepted answers must be distinct after spacing and punctuation normalisation.' });
        }
        normalizedAnswers.add(normalized);
    }

    requireLocalized(payload.passFeedback, 'payload.passFeedback', issues);
    const lapse = payload.lapseFeedback;
    if (!text(lapse?.errorTag)) issues.push({ path: 'payload.lapseFeedback.errorTag', message: 'A precise error tag is required.' });
    requireLocalized(lapse?.contrast, 'payload.lapseFeedback.contrast', issues);
    requireLocalized(lapse?.repairPrompt, 'payload.lapseFeedback.repairPrompt', issues);
    requireLocalized(lapse?.nearbyExample, 'payload.lapseFeedback.nearbyExample', issues);
    for (const [index, diagnostic] of (payload.lapseDiagnostics ?? []).entries()) {
        const path = `payload.lapseDiagnostics.${index}`;
        if (!diagnostic.responseIncludesAny?.length
            || diagnostic.responseIncludesAny.some(fragment => !containsJapanese(normalizeJapaneseResponse(fragment)))) {
            issues.push({ path: `${path}.responseIncludesAny`, message: 'A diagnostic needs one or more Japanese response fragments.' });
        }
        if (!text(diagnostic.feedback?.errorTag)) issues.push({ path: `${path}.feedback.errorTag`, message: 'A precise error tag is required.' });
        requireLocalized(diagnostic.feedback?.contrast, `${path}.feedback.contrast`, issues);
        requireLocalized(diagnostic.feedback?.repairPrompt, `${path}.feedback.repairPrompt`, issues);
        requireLocalized(diagnostic.feedback?.nearbyExample, `${path}.feedback.nearbyExample`, issues);
    }

    if (!text(payload.reviewSeedId)) issues.push({ path: 'payload.reviewSeedId', message: 'A review seed id is required.' });
    if (!text(payload.reviewContent?.expression) || !payload.reviewContent?.meanings?.some(text)) {
        issues.push({ path: 'payload.reviewContent', message: 'Reviewable expression and meaning are required.' });
    }

    const readingSupport = payload.promptReadingSupport;
    if (readingSupport && (!text(readingSupport.reading) || !text(readingSupport.pitch))) {
        issues.push({ path: 'payload.promptReadingSupport', message: 'Prompt support needs both a reading and pitch description.' });
    }
    const hints = payload.hints ?? [];
    const usesTieredHints = hints.some(hint => hint.tier !== undefined);
    if (usesTieredHints && (hints.length !== BEGINNER_CONSTRUCTED_RESPONSE_HINT_TIERS.length
        || hints.some((hint, index) => hint.tier !== BEGINNER_CONSTRUCTED_RESPONSE_HINT_TIERS[index]))) {
        issues.push({ path: 'payload.hints', message: 'Beginner constructed-response hints must progress from task meaning to vocabulary/reading to form scaffold.' });
    }
    for (const [index, hint] of hints.entries()) {
        requireLocalized(hint.text, `payload.hints.${index}.text`, issues);
        if (hint.fillResponse !== undefined && !containsJapanese(normalizeJapaneseResponse(hint.fillResponse))) {
            issues.push({ path: `payload.hints.${index}.fillResponse`, message: 'A hint response scaffold must contain Japanese text.' });
        }
        if (!usesTieredHints) continue;
        if (hint.fillResponse !== undefined) {
            issues.push({ path: `payload.hints.${index}.fillResponse`, message: 'Tiered beginner hints must not fill the full answer.' });
        }
        if (hint.tier === 'vocabulary-reading') {
            if (!hint.vocabulary?.length) {
                issues.push({ path: `payload.hints.${index}.vocabulary`, message: 'The vocabulary/reading tier needs at least one required cue.' });
            }
            for (const [cueIndex, cue] of (hint.vocabulary ?? []).entries()) {
                const path = `payload.hints.${index}.vocabulary.${cueIndex}`;
                if (!containsJapanese(normalizeJapaneseResponse(cue.expression)) || !containsJapanese(normalizeJapaneseResponse(cue.reading))) {
                    issues.push({ path, message: 'Vocabulary cues need Japanese expression and reading text.' });
                }
                requireLocalized(cue.meaning, `${path}.meaning`, issues);
                if (normalizedAnswers.has(normalizeJapaneseResponse(cue.expression))) {
                    issues.push({ path: `${path}.expression`, message: 'A vocabulary cue must not be a complete accepted answer.' });
                }
            }
        } else if (hint.vocabulary !== undefined) {
            issues.push({ path: `payload.hints.${index}.vocabulary`, message: 'Vocabulary cues belong only to the vocabulary/reading tier.' });
        }
        if (hint.tier === 'form-scaffold') {
            requireLocalized(hint.scaffold, `payload.hints.${index}.scaffold`, issues);
        } else if (hint.scaffold !== undefined) {
            issues.push({ path: `payload.hints.${index}.scaffold`, message: 'A form scaffold belongs only to the form-scaffold tier.' });
        }
        if (hintLeaksAcceptedAnswer(hint, normalizedAnswers)) {
            issues.push({ path: `payload.hints.${index}`, message: 'A tiered hint must not reveal a complete accepted answer.' });
        }
    }

    const japanesePreCommit = [model.prompt?.ja, readingSupport?.reading, readingSupport?.pitch]
        .map(value => normalizeJapaneseResponse(text(value)))
        .filter(Boolean);
    for (const answer of normalizedAnswers) {
        if (japanesePreCommit.some(copy => copy.includes(answer))) {
            issues.push({ path: 'prompt', message: 'Pre-commit prompt or reading support must not reveal an accepted answer.' });
            break;
        }
    }
    const englishPrompt = normalizeEnglish(model.prompt?.en);
    if (payload.reviewContent?.meanings?.some(meaning => {
        const normalizedMeaning = normalizeEnglish(meaning);
        return normalizedMeaning.length > 0 && ` ${englishPrompt} `.includes(` ${normalizedMeaning} `);
    })) {
        issues.push({ path: 'prompt.en', message: 'Pre-commit English copy must not reveal the answer meaning.' });
    }
    return issues;
}

function hintLeaksAcceptedAnswer(hint: ConstructedResponseHint, answers: ReadonlySet<string>): boolean {
    const surfaces = [hint.text.ja, hint.scaffold?.ja]
        .map(value => normalizeJapaneseResponse(text(value)))
        .filter(Boolean);
    return [...answers].some(answer => surfaces.some(surface => surface.includes(answer)));
}

function diagnosticFeedback(
    model: ConstructedResponseActivityModel,
    normalizedResponse: string,
): ConstructedResponseLapseFeedback | undefined {
    return model.payload.lapseDiagnostics?.find(diagnostic => diagnostic.responseIncludesAny
        .some(fragment => normalizedResponse.includes(normalizeJapaneseResponse(fragment))))?.feedback;
}

function requireLocalized(value: LocalizedText | undefined, path: string, issues: ValidationIssue[]): void {
    if (!text(value?.en) || !text(value?.ja)) {
        issues.push({ path, message: 'Bilingual authored feedback is required.' });
    }
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeEnglish(value: unknown): string {
    return text(value)
        .normalize('NFKC')
        .toLocaleLowerCase('en')
        .replace(/[^a-z0-9]+/gu, ' ')
        .trim();
}

function containsJapanese(value: string): boolean {
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
}
