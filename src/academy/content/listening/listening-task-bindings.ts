import manifestJson from '../../../../public/academy/content/listening/listening-task-bindings.v1.json';
import { resolvePackagedAcademyListeningLocator } from './listening-crosswalk';

export interface ListeningTaskBinding {
    readonly packageId: string;
    readonly sourceQuestionId: string;
    readonly locator: string;
    readonly source: {
        readonly corpus: 'soya' | 'moodle' | 'minna';
        readonly questionId: string;
        readonly questionMapRef: string;
        readonly audioSha256: string;
    };
    readonly verification: {
        readonly taskEvidenceSha256: string;
        readonly supportEvidenceSha256: string;
        readonly answerGate: 'after-attempt';
        readonly method: string;
    };
    readonly learnerContract: {
        readonly response: 'single-choice' | 'structured-grid' | 'structured-cloze' | 'direction-phrase' | 'meal-survey' | 'comparison-log' | 'speaker-shelf' | 'conversation-check' | 'true-false';
        readonly transcriptReveal: 'after-attempt';
        readonly hintReveal: 'after-attempt';
        readonly grading: 'deterministic';
    };
    readonly delivery: Readonly<{ status: 'packaged-static'; url: string } | { status: 'source-verified-awaiting-packaging' }>;
}

interface ListeningTaskBindingsManifest {
    readonly schema: 'yomu-academy.listening-task-bindings/v1';
    readonly entries: readonly ListeningTaskBinding[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const bindings = parseListeningTaskBindings(manifestJson);
const bindingByTask = new Map(bindings.entries.map(entry => [`${entry.packageId}/${entry.sourceQuestionId}`, entry]));

export function resolvePackagedListeningTask(packageId: string, sourceQuestionId: string, locator: string): string | undefined {
    const binding = bindingByTask.get(`${packageId}/${sourceQuestionId}`);
    if (!binding || binding.locator !== locator || binding.delivery.status !== 'packaged-static') return undefined;
    const delivery = resolvePackagedAcademyListeningLocator(locator);
    if (delivery.status !== 'ready'
        || delivery.url !== binding.delivery.url
        || delivery.entry.source.corpus !== binding.source.corpus
        || delivery.entry.source.sha256 !== binding.source.audioSha256
        || delivery.entry.source.questionMapRef !== binding.source.questionMapRef) return undefined;
    return delivery.url;
}

function parseListeningTaskBindings(value: unknown): ListeningTaskBindingsManifest {
    if (!isRecord(value) || value.schema !== 'yomu-academy.listening-task-bindings/v1' || !Array.isArray(value.entries)) {
        throw new TypeError('Listening task bindings must declare the v1 schema and entries array.');
    }
    const entries = value.entries.map((entry, index) => parseEntry(entry, `entries[${index}]`));
    const keys = entries.map(entry => `${entry.packageId}/${entry.sourceQuestionId}`);
    if (new Set(keys).size !== keys.length) throw new TypeError('Listening task bindings must be unique per source question.');
    return { schema: 'yomu-academy.listening-task-bindings/v1', entries };
}

function parseEntry(value: unknown, owner: string): ListeningTaskBinding {
    if (!isRecord(value) || !isRecord(value.source) || !isRecord(value.verification)
        || !isRecord(value.learnerContract) || !isRecord(value.delivery)) {
        throw new TypeError(`Listening task binding ${owner} is invalid.`);
    }
    const packageId = text(value.packageId, `${owner}.packageId`);
    const sourceQuestionId = text(value.sourceQuestionId, `${owner}.sourceQuestionId`);
    const locator = text(value.locator, `${owner}.locator`);
    const audioSha256 = text(value.source.audioSha256, `${owner}.source.audioSha256`);
    const taskEvidenceSha256 = text(value.verification.taskEvidenceSha256, `${owner}.verification.taskEvidenceSha256`);
    const supportEvidenceSha256 = text(value.verification.supportEvidenceSha256, `${owner}.verification.supportEvidenceSha256`);
    if ((value.source.corpus !== 'soya' && value.source.corpus !== 'moodle' && value.source.corpus !== 'minna') || !SHA256.test(audioSha256)) {
        throw new TypeError(`Listening task binding ${owner} has invalid source evidence.`);
    }
    if (value.verification.answerGate !== 'after-attempt' || !SHA256.test(taskEvidenceSha256) || !SHA256.test(supportEvidenceSha256)) {
        throw new TypeError(`Listening task binding ${owner} has invalid verification evidence.`);
    }
    if ((value.learnerContract.response !== 'single-choice' && value.learnerContract.response !== 'structured-grid'
        && value.learnerContract.response !== 'structured-cloze' && value.learnerContract.response !== 'direction-phrase'
        && value.learnerContract.response !== 'meal-survey'
        && value.learnerContract.response !== 'comparison-log'
        && value.learnerContract.response !== 'speaker-shelf' && value.learnerContract.response !== 'conversation-check'
        && value.learnerContract.response !== 'true-false')
        || value.learnerContract.transcriptReveal !== 'after-attempt'
        || value.learnerContract.hintReveal !== 'after-attempt'
        || value.learnerContract.grading !== 'deterministic') {
        throw new TypeError(`Listening task binding ${owner} has an invalid learner contract.`);
    }
    const response: ListeningTaskBinding['learnerContract']['response'] = value.learnerContract.response;
    const learnerContract = {
        response,
        transcriptReveal: 'after-attempt' as const,
        hintReveal: 'after-attempt' as const,
        grading: 'deterministic' as const,
    };
    if (value.delivery.status === 'packaged-static') {
        const url = text(value.delivery.url, `${owner}.delivery.url`);
        return {
            packageId,
            sourceQuestionId,
            locator,
            source: {
                corpus: value.source.corpus, questionId: text(value.source.questionId, `${owner}.source.questionId`),
                questionMapRef: text(value.source.questionMapRef, `${owner}.source.questionMapRef`), audioSha256,
            },
            verification: {
                taskEvidenceSha256, supportEvidenceSha256,
                answerGate: 'after-attempt', method: text(value.verification.method, `${owner}.verification.method`),
            },
            learnerContract,
            delivery: { status: 'packaged-static', url },
        };
    }
    if (value.delivery.status !== 'source-verified-awaiting-packaging') {
        throw new TypeError(`Listening task binding ${owner} has invalid delivery status.`);
    }
    return {
        packageId,
        sourceQuestionId,
        locator,
        source: {
            corpus: value.source.corpus, questionId: text(value.source.questionId, `${owner}.source.questionId`),
            questionMapRef: text(value.source.questionMapRef, `${owner}.source.questionMapRef`), audioSha256,
        },
        verification: {
            taskEvidenceSha256, supportEvidenceSha256,
            answerGate: 'after-attempt', method: text(value.verification.method, `${owner}.verification.method`),
        },
        learnerContract,
        delivery: { status: 'source-verified-awaiting-packaging' },
    };
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty text.`);
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
