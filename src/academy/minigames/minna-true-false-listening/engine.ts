import type { GradeResult, ReviewSeed, ValidationIssue } from '../../domain/activity-runtime';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type {
    MinnaTrueFalseListeningModel,
    MinnaTrueFalseListeningResponse,
    MinnaTruthMark,
} from './manifest';

type ResponseKind = MinnaTrueFalseListeningModel['responseKind'];

interface ExactSourceContract {
    readonly shortLabel: string;
    readonly packageId: MinnaTrueFalseListeningModel['provenance']['packageId'];
    readonly packageOrder: MinnaTrueFalseListeningModel['provenance']['packageOrder'];
    readonly moduleId: MinnaTrueFalseListeningModel['provenance']['moodle']['moduleId'];
    readonly audioSha256: string;
    readonly audioLocator: string;
    readonly audioUrl: string;
    readonly durationSeconds: number;
    readonly audioLabel: string;
    readonly sourcePrefix: string;
    readonly transcriptLineCount: number;
    readonly tasks: readonly (readonly [id: string, statement: string, mark: MinnaTruthMark])[];
}

const EXACT_SOURCE_CONTRACTS: Readonly<Record<ResponseKind, ExactSourceContract>> = Object.freeze({
    'minna-074-mondai-2-true-false': contract({
        shortLabel: 'Minna 074', packageId: 'l2-l07', packageOrder: 34, moduleId: 6974653,
        audioSha256: '2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0',
        audioLocator: 'academy/content/minna/audio/l2-l07-minna-074.mp3',
        audioUrl: '/academy/content/listening/media/academy-listening-2a287bcef237d1e3.mp3',
        durationSeconds: 109.688167, audioLabel: 'Five-dialogue listening check', transcriptLineCount: 25,
        tasks: [
            ['woman-goes-now', '女の人は これから 会議室へ 行きます。', 'cross'],
            ['man-predicts-japan', '男の人は 日本が 勝つと 言いました。', 'cross'],
            ['pair-rests-at-cafe', '男の人と 女の人は 喫茶店で 休みます。', 'circle'],
            ['woman-goes-to-gion', '女の人は 祇園祭に 行きます。', 'circle'],
            ['man-carries-bag', '男の人は 女の人の かばんを 持ちます。', 'cross'],
        ],
    }),
    'minna-077-mondai-2-true-false': contract({
        shortLabel: 'Minna 077', packageId: 'l2-l10', packageOrder: 37, moduleId: 6974659,
        audioSha256: '3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339',
        audioLocator: 'academy/content/minna/audio/l2-l10-minna-077.mp3',
        audioUrl: '/academy/content/listening/media/academy-listening-3be2ca818292e685.mp3',
        durationSeconds: 96.235125, audioLabel: 'Minna no Nihongo track 077', transcriptLineCount: 26,
        tasks: [
            ['woman-made-cake', '女の人は チョコレートケーキを 作りました。', 'circle'],
            ['umbrella-behind-stairs', '傘は 階段の 後ろに 置かなければ なりません。', 'circle'],
            ['miller-reading-paper', 'ミラーさんは 今、新聞を 読んでいます。', 'cross'],
            ['man-keeps-child-plan', '男の人は あした 子どもと 遊びますから、テニスに 行きません。', 'circle'],
            ['karina-short-hair', 'カリナさんは 髪が 短いです。', 'circle'],
        ],
    }),
});

export function validateMinnaTrueFalseListening(model: MinnaTrueFalseListeningModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const contract = EXACT_SOURCE_CONTRACTS[model.responseKind];
    const audio = model.provenance?.moodle?.audio;
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'Assessed answer support is required.' });
    }
    if (!contract
        || model.provenance?.packageId !== contract.packageId || model.provenance.packageOrder !== contract.packageOrder
        || model.provenance.answerVisibility !== 'after-attempt'
        || model.provenance.moodle?.moduleId !== contract.moduleId
        || model.provenance.moodle.sourceTask !== 'recording-embedded-mondai-2'
        || model.provenance.moodle.answerKeyBasis !== 'reviewed-original-audio-statements-and-dialogues'
        || audio?.sourceId !== `moodle:${contract?.audioSha256}:audio`
        || audio.payloadSha256 !== contract?.audioSha256 || audio.locator !== contract?.audioLocator || audio.url !== contract?.audioUrl
        || audio.durationSeconds !== contract?.durationSeconds || audio.label !== contract?.audioLabel) {
        issues.push({ path: 'provenance.moodle', message: 'An exact reviewed Moodle Minna recording and embedded task contract are required.' });
    }
    if (!text(model.payload?.sourceCaption?.ja) || !text(model.payload?.sourceCaption?.en)) {
        issues.push({ path: 'payload.sourceCaption', message: 'A bilingual source caption is required.' });
    }
    const tasks = model.payload?.tasks;
    if (!contract || !Array.isArray(tasks) || tasks.length !== contract.tasks.length) {
        issues.push({ path: 'payload.tasks', message: 'All five exact Minna statements are required.' });
    } else {
        const ids = new Set<string>();
        const sourceIds = new Set<string>();
        tasks.forEach((task, index) => {
            const [id, statement, mark] = contract.tasks[index]!;
            const sourceQuestionId = `${contract.sourcePrefix}:item-${index + 1}`;
            if (task.id !== id || task.sourceOrder !== index + 1 || task.sourceQuestionId !== sourceQuestionId
                || task.statement !== statement || task.correctMark !== mark || ids.has(task.id)
                || sourceIds.has(task.sourceQuestionId) || !model.conceptIds.includes(task.conceptId)
                || !text(task.errorTag) || !text(task.reviewExpression)) {
                issues.push({ path: `payload.tasks.${index}`, message: 'Each source statement needs its exact order, mark, and evidence identity.' });
            }
            ids.add(task.id);
            sourceIds.add(task.sourceQuestionId);
        });
    }
    if (!contract || !Array.isArray(model.payload?.transcript) || model.payload.transcript.length !== contract.transcriptLineCount
        || model.payload.transcript.some(line => ![1, 2, 3, 4, 5].includes(line.item)
            || !['A', 'B', '文'].includes(line.speaker) || !text(line.text))) {
        issues.push({ path: 'payload.transcript', message: 'The reviewed five-item source transcript is required after an attempt.' });
    } else {
        for (const task of tasks ?? []) {
            if (!model.payload.transcript.some(line => line.item === task.sourceOrder && line.speaker === '文' && line.text === task.statement)) {
                issues.push({ path: `payload.transcript.${task.sourceOrder}`, message: 'Every assessed statement must be pinned in the reviewed transcript.' });
            }
        }
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All five source judgements are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeMinnaTrueFalseListening(
    model: MinnaTrueFalseListeningModel,
    response: MinnaTrueFalseListeningResponse,
): GradeResult {
    const answers = parseResponse(model, response);
    const errors = model.payload.tasks.flatMap(task => answers.get(task.id) === task.correctMark ? [] : [task.errorTag]);
    return gradeFromScore((model.payload.tasks.length - errors.length) / model.payload.tasks.length, model.payload.passScore, errors, model.payload.feedback);
}

export function minnaTrueFalseListeningReviewSeeds(
    model: MinnaTrueFalseListeningModel,
    result: GradeResult,
): readonly ReviewSeed[] {
    const contract = EXACT_SOURCE_CONTRACTS[model.responseKind];
    return model.payload.tasks.flatMap(task => {
        if (result.outcome === 'lapse' && !result.errorTags.includes(task.errorTag)) return [];
        return [{
            id: `review:${contract.packageId}:${model.responseKind}:${task.id}`,
            conceptId: task.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: task.sourceQuestionId,
            content: {
                expression: task.reviewExpression,
                meanings: [task.correctMark === 'circle' ? '○ true' : '× false'],
                sentence: task.statement,
            },
        } satisfies ReviewSeed];
    });
}

function parseResponse(
    model: MinnaTrueFalseListeningModel,
    response: MinnaTrueFalseListeningResponse,
): ReadonlyMap<string, MinnaTruthMark> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.tasks.length) {
        throw new TypeError(`Every exact ${sourceLabel(model)} statement needs one circle or cross response.`);
    }
    const answers = new Map<string, MinnaTruthMark>();
    response.answers.forEach(answer => {
        if (!model.payload.tasks.some(task => task.id === answer.taskId) || answers.has(answer.taskId)
            || (answer.mark !== 'circle' && answer.mark !== 'cross')) {
            throw new TypeError(`${sourceLabel(model)} responses must address each source statement once.`);
        }
        answers.set(answer.taskId, answer.mark);
    });
    return answers;
}

function contract(value: Omit<ExactSourceContract, 'sourcePrefix'>): ExactSourceContract {
    return Object.freeze({
        ...value,
        sourcePrefix: `moodle:${value.moduleId}:${value.audioSha256}:audio:minna${value.shortLabel.slice(-3)}-mondai-2`,
        tasks: Object.freeze(value.tasks),
    });
}

function sourceLabel(model: MinnaTrueFalseListeningModel): string {
    return EXACT_SOURCE_CONTRACTS[model.responseKind]?.shortLabel ?? 'Minna';
}
