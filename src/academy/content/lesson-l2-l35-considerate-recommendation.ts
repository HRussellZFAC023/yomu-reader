import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type GradeResult,
    type ReviewSeed,
    type ValidationIssue,
} from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import {
    localizedNodes,
    normalizeJapanese,
    setPending,
    showEvaluation,
    statusRegion,
    text,
    validateFeedback,
    type ActivityFeedbackSet,
} from '../minigames/activity-kit/shared';
import { renderInspectableSourceVisual } from '../minigames/source-visual';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l35';
const PACKAGE_ORDER = 62;
const MODULE_ID = 8824742;
const ARCHIVE_ID = 'archive-000028';
const ARCHIVE_SHA256 = '5864abfd10047d8084bf67dd6aeb921852a98e2c873d66a47bab32640c7ac174';
const SOURCE_PACKAGE_STATUS = 'direct-canonical-archive-extension-no-authored-package-json';
const GRAMMAR_SHA256 = 'b531dcfee3d58e65650ec0dff7eaa271a30721d410e935a47132fb565119808a';
const SCRIPT_SHA256 = '1571d04cee3a179b55cb202e519d5a366f7c62c0a1ec2483c26cfc1f6b9f5376';
const WORKSHEET_SHA256 = 'd2efe791fb0fbb9693574aa6c3f5f388a2564484978cabc6d0d40ab74d10bbc5';

export const L2_L35_QUARANTINED_AUDIO = Object.freeze([
    Object.freeze({
        member: 'Track 28',
        payloadSha256: '0de2c7abfe3c7857c9def04b5be3f00a85a60d198c208f116c4660a8d9c7c78e',
        durationSeconds: 53.506667,
    }),
    Object.freeze({
        member: 'B-4',
        payloadSha256: '4fe8f7973ea49725d3bb76988bd5c85f32a2e405bd54280be9806952931ca6aa',
        durationSeconds: 124.12,
    }),
] as const);

export const L2_L35_SOURCE_VISUALS = Object.freeze([
    sourceVisual(GRAMMAR_SHA256, 'Chapter 35-3_〜ありませんか grammar exercise', 1,
        'moodle-chapter-35-3-arimasenka-grammar-page-1.png', '7f5a7b07b7e2fa070e2599f60eddff2ed2722b23d4ce03a88c351c485065364c'),
    sourceVisual(GRAMMAR_SHA256, 'Chapter 35-3_〜ありませんか grammar exercise', 2,
        'moodle-chapter-35-3-arimasenka-grammar-page-2.png', '171d78773d6a5c28e3f14d80264764174ae248223d33a8682a538ad182a04254'),
    sourceVisual(SCRIPT_SHA256, 'Chapter 35_Conversation listening script', 1,
        'moodle-chapter-35-conversation-listening-script-page-1.png', '750cf34684a764a0376e395751680d9e6dc64d8b1cd5bda0c32e9b8c86eec3f2'),
    sourceVisual(WORKSHEET_SHA256, 'Chapter 35_Conversation listening', 1,
        'moodle-chapter-35-conversation-listening-worksheet-page-1.png', 'a08aee2d88c59e24afc626f8aae2f79a6f014b22c9c6cf81f43067ece76ff3ce'),
] as const);

type ConsiderateRecommendationInteraction = 'source-choice' | 'pattern-select' | 'typed-source';
type ConsiderateRecommendationTask = 'desire-duration' | 'recommendation-reason' | 'transport-uncertainty' | 'equipment-reservation';

interface ConsiderateRecommendationOption {
    readonly value: string;
    readonly label: string;
    /** Only the answer is source text; every other option is Yomu scaffolding. */
    readonly origin: 'sensei-source' | 'yomu-scaffolding';
}

export interface ConsiderateRecommendationRound {
    readonly id: string;
    readonly sourceOrder: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    readonly sourceTask: ConsiderateRecommendationTask;
    readonly sourcePage: 1;
    readonly interaction: ConsiderateRecommendationInteraction;
    readonly sourceQuestionId: string;
    readonly prompt: LocalizedText;
    readonly options: readonly ConsiderateRecommendationOption[];
    readonly answer: string;
    readonly conceptId: string;
    readonly errorTag: string;
}

interface ConsiderateRecommendationSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 1 | 2;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface ConsiderateRecommendationModel extends ActivityModel {
    readonly kind: 'academy-considerate-recommendation';
    readonly responseKind: 'moodle-chapter-35-arimasenka-conversation-script';
    readonly curriculumPhase: 'assessed-production';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l2-l35';
        readonly packageOrder: 62;
        readonly answerVisibility: 'after-attempt';
        readonly sourcePackageStatus: typeof SOURCE_PACKAGE_STATUS;
        readonly moodle: {
            readonly moduleId: 8824742;
            readonly moodleLesson: 'Level 3+ Lesson 9';
            readonly archiveId: 'archive-000028';
            readonly archiveSha256: typeof ARCHIVE_SHA256;
            readonly sourceSheets: readonly ConsiderateRecommendationSourceVisual[];
            readonly media: {
                readonly status: 'two-audio-members-quarantined-unverified-task-binding';
                readonly sourceAudioMembers: 2;
                readonly sourceAudioTracksDelivered: 0;
                readonly quarantinedAudio: typeof L2_L35_QUARANTINED_AUDIO;
            };
            readonly answerKeyBasis: 'sensei-verbatim-visible-transcript-segments-only';
        };
        readonly support: {
            readonly minna: { readonly reference: 'Minna no Nihongo II · Lesson 35'; readonly reuse: 'chronology-and-scope-only' };
            readonly genki: { readonly used: false; readonly learnerFacingPayload: 'none' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string; attribution: 'sensei-source' | 'yomu-boundary' }>[];
        readonly taskHeadings: readonly Readonly<{ sourceTask: ConsiderateRecommendationTask; text: string }>[];
        readonly rounds: readonly ConsiderateRecommendationRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

interface ConsiderateRecommendationResponse {
    readonly answers: readonly Readonly<{ roundId: string; value: string }>[];
}

export function createLessonL2L35ConsiderateRecommendationBeat(): LessonActivityBeat {
    const rounds = createRounds();
    const activity: ConsiderateRecommendationModel = {
        id: 'activity:l2-l35-considerate-recommendation',
        kind: 'academy-considerate-recommendation',
        responseKind: 'moodle-chapter-35-arimasenka-conversation-script',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 35 の四枚を先に読み、印刷された会話スクリプトの八つの部分を、形と順序を変えずに戻してください。',
            en: 'Read Sensei’s four Chapter 35 pages first, then restore the eight printed conversation-script segments without changing their form or order.',
        },
        teachingSupport: {
            kind: 'vocabulary',
            title: { ja: '原本を読む前の先生の語彙', en: 'Sensei’s vocabulary before retrieval' },
            entries: [
                { japanese: 'それなら', translation: 'In that case' },
                { japanese: 'さあ', translation: 'Well, let me see. (used when unsure of something)' },
                { japanese: '詳(くわ)しい', translation: 'detailed' },
                { japanese: '夜行(やこう)バス', translation: 'Overnight bus' },
                { japanese: '旅行社(りょこうしゃ)／旅行会社(りょこうがいしゃ)', translation: 'Travel agency' },
                { japanese: 'スキー場(じょう)', translation: 'ski resort, ski area' },
            ],
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            sourcePackageStatus: SOURCE_PACKAGE_STATUS,
            moodle: {
                moduleId: MODULE_ID,
                moodleLesson: 'Level 3+ Lesson 9',
                archiveId: ARCHIVE_ID,
                archiveSha256: ARCHIVE_SHA256,
                sourceSheets: L2_L35_SOURCE_VISUALS,
                media: {
                    status: 'two-audio-members-quarantined-unverified-task-binding',
                    sourceAudioMembers: 2,
                    sourceAudioTracksDelivered: 0,
                    quarantinedAudio: L2_L35_QUARANTINED_AUDIO,
                },
                answerKeyBasis: 'sensei-verbatim-visible-transcript-segments-only',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 35', reuse: 'chronology-and-scope-only' },
                genki: { used: false, learnerFacingPayload: 'none' },
            },
        },
        payload: {
            teaching: [
                {
                    title: '〜は ありませんか。＊negative question',
                    text: 'The いい ところは ありませんか in example means the same as いい ところは ありますか, but it is a more considerate way of asking something because using ありませんか makes it easier for the listener to answer in the negative.',
                    attribution: 'sensei-source',
                },
                { title: 'それなら', text: 'In that case', attribution: 'sensei-source' },
                { title: 'さあ', text: 'Well, let me see. (used when unsure of something)', attribution: 'sensei-source' },
                { title: '詳(くわ)しい', text: 'detailed', attribution: 'sensei-source' },
                { title: '夜行(やこう)バス', text: 'Overnight bus', attribution: 'sensei-source' },
                { title: '旅行社(りょこうしゃ)／旅行会社(りょこうがいしゃ)', text: 'Travel agency', attribution: 'sensei-source' },
                { title: 'スキー場(じょう)', text: 'ski resort, ski area', attribution: 'sensei-source' },
                {
                    title: 'Sequence boundary',
                    text: 'The script moves from desire and duration to recommendation and reason, then transport uncertainty, then equipment and reservation. Only the eight visibly printed script segments are assessed; the open picture prompts and free recommendations are not. Choice and select distractors are Yomu scaffolding, not source text.',
                    attribution: 'yomu-boundary',
                },
                {
                    title: 'Audio boundary',
                    text: 'This is exact script reading, not claimed listening: neither archived recording (Track 28 nor B-4) is verified to this owned worksheet and script by a task binding, transcript match, answer relation, or rights review, so both remain quarantined and no audio is delivered.',
                    attribution: 'yomu-boundary',
                },
            ],
            taskHeadings: [
                { sourceTask: 'desire-duration', text: 'Sensei’s opening: the desire to go and the length of the trip.' },
                { sourceTask: 'recommendation-reason', text: 'Sensei’s recommendation: the places and one reason offered.' },
                { sourceTask: 'transport-uncertainty', text: 'Sensei’s transport advice and the honest moment of not knowing.' },
                { sourceTask: 'equipment-reservation', text: 'Sensei’s close: equipment rental and the reassuring reservation.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '八つの原文スクリプト部分を、形、順序、句読点を変えずに戻せました。', en: 'You restored all eight source script segments without changing their form, order, or punctuation.' } },
                lapse: {
                    explanation: { ja: '間違えた原文の部分だけを、表示された四枚のページでもう一度確認しましょう。', en: 'Recheck only the missed source segments on the four displayed pages.' },
                    repairPrompt: { ja: '先に、その部分が希望・期間か、提案・理由か、交通の不確かさか、道具・予約かを決めます。', en: 'First decide whether the segment marks desire or duration, a recommendation with its reason, transport uncertainty, or equipment and reservation.' },
                    nearbyExample: { ja: '原本の型: 〜たいんですが、／それなら〜が いいと 思いますよ／〜なら、〜し……。', en: 'Source frames: 〜たいんですが、 / それなら〜が いいと 思いますよ / 〜なら、〜し……。' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'considerate-recommendation',
        narrative: {
            ja: 'ジョディ先生がスキー旅行の会話スクリプトを開きます。行きたい気持ちから、思いやりのある質問と提案まで、原本の部分で確かめます。',
            en: 'Jodi opens the ski-trip conversation script. From the wish to go through the considerate question and its recommendations, the class checks each printed source segment.',
        },
        activity: Object.freeze(activity),
    });
}

export const considerateRecommendationPlugin: ActivityPlugin<ConsiderateRecommendationModel, ConsiderateRecommendationResponse> = {
    kind: 'academy-considerate-recommendation',
    validate: validateModel,
    render: renderWorkshop,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const missed = model.payload.rounds.filter(round => normalizeSourceResponse(answers.get(round.id) ?? '') !== normalizeSourceResponse(round.answer));
        return {
            outcome: missed.length ? 'lapse' : 'pass',
            score: (model.payload.rounds.length - missed.length) / model.payload.rounds.length,
            errorTags: missed.map(round => round.errorTag),
            feedback: structuredClone(missed.length ? model.payload.feedback.lapse : model.payload.feedback.pass),
        };
    },
    toReviewSeeds(model, result) {
        return model.payload.rounds.flatMap(round => result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)
            ? []
            : [reviewSeed(round, result)]);
    },
};

function createRounds(): readonly ConsiderateRecommendationRound[] {
    const desire = '友達(ともだち)と スキーに 行(い)きたいんですが、';
    const duration = '３日(みっか)ぐらいです。';
    const recommendation = 'それなら、草津(くさつ)か 志賀高原(しがこうげん)が いいと 思(おも)いますよ。';
    const onsen = '温泉(おんせん)も あるし……。';
    const transport = 'ＪＲでも 行(い)けますが、夜行(やこう)バスなら、朝(あさ) 着(つ)きますから、便利(べんり)ですよ。';
    const agency = 'さあ……。旅行社(りょこうしゃ)へ 行(い)けば もっと 詳(くわ)しい ことが わかりますよ。';
    const rental = '全部(ぜんぶ) スキー場(じょう)で 借(か)りられますよ。';
    const reservation = '心配(しんぱい)なら、旅行社(りょこうしゃ)で 予約(よやく)も できるし……。';
    return Object.freeze([
        round('desire-line', 1, 'desire-duration', 'source-choice',
            '行きたい気持ちを伝える原文の行を選んでください。', 'Choose the source line that states the wish to go.',
            desire, ['友達(ともだち)と 海(うみ)に 行(い)きたいんですが、']),
        round('duration-line', 2, 'desire-duration', 'pattern-select',
            '旅行の長さを答える原文の行を選んでください。', 'Select the source line that answers how long the trip is.',
            duration, ['１週間(いっしゅうかん)ぐらいです。']),
        round('recommendation-line', 3, 'recommendation-reason', 'typed-source',
            '場所を勧める原文の行を、原文どおりに入力してください。', 'Type the source line that recommends the places, in source wording.',
            recommendation, []),
        round('onsen-reason-line', 4, 'recommendation-reason', 'source-choice',
            '理由を添える原文の行を選んでください。', 'Choose the source line that adds the reason.',
            onsen, ['温泉(おんせん)は ありません。']),
        round('transport-line', 5, 'transport-uncertainty', 'pattern-select',
            '交通手段を勧める原文の行を選んでください。', 'Select the source line that recommends the transport.',
            transport, ['ＪＲなら、夜(よる) 着(つ)きますから、便利(べんり)ですよ。']),
        round('agency-line', 6, 'transport-uncertainty', 'typed-source',
            '知らないと答えて旅行社を勧める原文の行を、原文どおりに入力してください。', 'Type the source line that admits not knowing and points to the travel agency, in source wording.',
            agency, []),
        round('rental-line', 7, 'equipment-reservation', 'source-choice',
            '道具について答える原文の行を選んでください。', 'Choose the source line that answers about the equipment.',
            rental, ['全部(ぜんぶ) 家(いえ)から 持(も)って行(い)きますよ。']),
        round('reservation-line', 8, 'equipment-reservation', 'typed-source',
            '予約について安心させる原文の行を、原文どおりに入力してください。', 'Type the reassuring source line about the reservation, in source wording.',
            reservation, []),
    ]);
}

function round(
    id: string,
    sourceOrder: ConsiderateRecommendationRound['sourceOrder'],
    sourceTask: ConsiderateRecommendationTask,
    interaction: ConsiderateRecommendationInteraction,
    ja: string,
    en: string,
    answer: string,
    scaffolding: readonly string[],
): ConsiderateRecommendationRound {
    const options = interaction === 'typed-source'
        ? []
        : [
            Object.freeze({ value: answer, label: answer, origin: 'sensei-source' as const }),
            ...scaffolding.map(value => Object.freeze({ value, label: value, origin: 'yomu-scaffolding' as const })),
        ].sort((left, right) => left.value.localeCompare(right.value, 'ja'));
    return Object.freeze({
        id,
        sourceOrder,
        sourceTask,
        sourcePage: 1,
        interaction,
        sourceQuestionId: `moodle:${MODULE_ID}:${SCRIPT_SHA256}:png-p1:${id}`,
        prompt: Object.freeze({ ja, en }),
        options: Object.freeze(options),
        answer,
        conceptId: `concept:l2-l35:considerate-recommendation:${sourceOrder}`,
        errorTag: `l2-l35-considerate-recommendation-${sourceOrder}`,
    });
}

function validateModel(model: ConsiderateRecommendationModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.provenance?.packageId !== PACKAGE_ID || model.provenance.packageOrder !== PACKAGE_ORDER
        || model.provenance.sourcePackageStatus !== SOURCE_PACKAGE_STATUS
        || model.provenance.moodle.moduleId !== MODULE_ID || model.provenance.moodle.archiveId !== ARCHIVE_ID
        || model.provenance.moodle.archiveSha256 !== ARCHIVE_SHA256) {
        issues.push({ path: 'provenance', message: 'The exact l2-l35 direct-archive-extension identity is required.' });
    }
    const visuals = model.provenance?.moodle.sourceSheets;
    if (!Array.isArray(visuals) || visuals.length !== L2_L35_SOURCE_VISUALS.length
        || visuals.some((visual, index) => JSON.stringify(visual) !== JSON.stringify(L2_L35_SOURCE_VISUALS[index]))) {
        issues.push({ path: 'provenance.moodle.sourceSheets', message: 'All four SHA-pinned Chapter 35 pages are required.' });
    }
    const media = model.provenance?.moodle.media;
    if (media?.status !== 'two-audio-members-quarantined-unverified-task-binding'
        || media.sourceAudioMembers !== 2 || media.sourceAudioTracksDelivered !== 0
        || JSON.stringify(media.quarantinedAudio) !== JSON.stringify(L2_L35_QUARANTINED_AUDIO)) {
        issues.push({ path: 'provenance.moodle.media', message: 'Both unverified audio members must remain quarantined with zero tracks delivered.' });
    }
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id || model.provenance?.answerVisibility !== 'after-attempt'
        || model.provenance?.moodle.answerKeyBasis !== 'sensei-verbatim-visible-transcript-segments-only') {
        issues.push({ path: 'answerSupport', message: 'Answers and repair support must remain gated until an attempt.' });
    }
    if (model.provenance?.support.genki.used !== false || model.provenance.support.genki.learnerFacingPayload !== 'none') {
        issues.push({ path: 'provenance.support.genki', message: 'Genki is not used and contributes no learner-facing payload.' });
    }
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 9
        || model.payload.teaching.slice(0, 7).some(step => step.attribution !== 'sensei-source')
        || model.payload.teaching.slice(7).some(step => step.attribution !== 'yomu-boundary')
        || model.payload.teaching.some(step => !text(step.title) || !text(step.text))) {
        issues.push({ path: 'payload.teaching', message: 'Seven source teaching steps and two boundaries must precede retrieval.' });
    }
    const interactions: readonly ConsiderateRecommendationInteraction[] = [
        'source-choice', 'pattern-select', 'typed-source', 'source-choice',
        'pattern-select', 'typed-source', 'source-choice', 'typed-source',
    ];
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 8
        || rounds.some((item, index) => item.sourceOrder !== index + 1 || item.interaction !== interactions[index]
            || !text(item.sourceQuestionId) || !text(item.prompt.en) || !text(item.prompt.ja) || !text(item.answer)
            || !model.conceptIds.includes(item.conceptId)
            || item.options.length !== (item.interaction === 'typed-source' ? 0 : 2)
            || (item.options.length > 0
                && (!item.options.some((option: ConsiderateRecommendationOption) => option.value === item.answer && option.origin === 'sensei-source')
                    || item.options.some((option: ConsiderateRecommendationOption) => option.value !== item.answer && option.origin !== 'yomu-scaffolding'))))) {
        issues.push({ path: 'payload.rounds', message: 'Eight exact-source script lines with all three interaction modes are required.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function renderWorkshop(
    model: ConsiderateRecommendationModel,
    host: ActivityHost,
    submit: (response: ConsiderateRecommendationResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-state-inspection academy-considerate-recommendation';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));
    const teaching = renderTeaching(model);
    const sources = document.createElement('section');
    sources.className = 'academy-state-inspection-sources';
    sources.dataset.lessonPhase = 'source-reference';
    model.provenance.moodle.sourceSheets.forEach(visual => sources.append(
        renderInspectableSourceVisual(visual, host.language, 'academy-state-inspection-source', 'lazy'),
    ));
    const form = document.createElement('form');
    form.className = 'academy-state-inspection-form';
    form.setAttribute('aria-labelledby', heading.id);
    const groups = document.createElement('div');
    groups.className = 'academy-state-inspection-round-groups';
    model.payload.taskHeadings.forEach(group => {
        const section = document.createElement('section');
        const title = document.createElement('h3');
        title.textContent = group.text;
        const list = document.createElement('ol');
        list.className = 'academy-state-inspection-rounds';
        model.payload.rounds.filter(round => round.sourceTask === group.sourceTask)
            .forEach(round => list.append(renderRound(model, round, host)));
        section.append(title, list);
        groups.append(section);
    });
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary';
    check.textContent = host.language === 'ja' ? '八つの原文部分を確認する' : 'Check all eight source segments';
    form.append(groups, check);
    const key = renderAnswerKey(host.language);
    const feedback = statusRegion('academy-kit-feedback academy-state-inspection-feedback');
    root.append(heading, teaching, sources, form, key, feedback);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            feedback.textContent = host.language === 'ja' ? '八つの原文部分に答えてください。' : 'Complete all eight source segments.';
            return;
        }
        setPending(form, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
            revealAnswerKey(key, model);
            key.hidden = false;
            showEvaluation(feedback, evaluation, host);
            if (evaluation.result.outcome === 'lapse') {
                setPending(form, false);
                model.payload.rounds.forEach(round => {
                    const item = groups.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
                    if (item) item.hidden = !evaluation.result.errorTags.includes(round.errorTag);
                });
            }
        }).catch(error => {
            setPending(form, false);
            feedback.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });
    return {
        focus() { form.querySelector<HTMLElement>('[data-round-control]')?.focus(); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}

function renderTeaching(model: ConsiderateRecommendationModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const block = document.createElement('section');
        block.dataset.attribution = step.attribution;
        const heading = document.createElement('h3');
        heading.textContent = step.title;
        const copy = document.createElement('p');
        copy.textContent = step.text;
        block.append(heading, copy);
        section.append(block);
    });
    return section;
}

function renderRound(model: ConsiderateRecommendationModel, round: ConsiderateRecommendationRound, host: ActivityHost): HTMLElement {
    const item = document.createElement('li');
    item.className = 'academy-state-inspection-round';
    item.dataset.roundId = round.id;
    item.dataset.interaction = round.interaction;
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.append(...localizedNodes(round.prompt));
    fieldset.append(legend);
    const name = fieldName(model, round);
    if (round.interaction === 'source-choice') {
        const choices = document.createElement('div');
        choices.className = 'academy-state-inspection-choices';
        round.options.forEach(option => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = name;
            input.value = option.value;
            input.dataset.roundControl = '';
            const copy = document.createElement('span');
            copy.lang = 'ja';
            copy.textContent = option.label;
            label.append(input, copy);
            choices.append(label);
        });
        fieldset.append(choices);
    } else if (round.interaction === 'pattern-select') {
        const select = document.createElement('select');
        select.name = name;
        select.dataset.roundControl = '';
        select.append(new Option('—', ''), ...round.options.map(option => new Option(option.label, option.value)));
        fieldset.append(select);
    } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.lang = 'ja';
        input.name = name;
        input.autocomplete = 'off';
        input.dataset.roundControl = '';
        input.setAttribute('aria-label', host.language === 'ja' ? '原文の行' : 'Exact source line');
        fieldset.append(input);
    }
    item.append(fieldset);
    return item;
}

function renderAnswerKey(language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.textContent = language === 'ja' ? '試したあとの先生の原文' : 'Sensei’s source wording after your attempt';
    const list = document.createElement('ol');
    section.append(heading, list);
    return section;
}

function revealAnswerKey(section: HTMLElement, model: ConsiderateRecommendationModel): void {
    const list = section.querySelector('ol');
    if (!list || list.childElementCount > 0) return;
    model.payload.rounds.forEach(round => {
        const item = document.createElement('li');
        item.lang = 'ja';
        item.textContent = round.answer;
        list.append(item);
    });
}

function responseFromForm(model: ConsiderateRecommendationModel, form: HTMLFormElement): ConsiderateRecommendationResponse | null {
    const data = new FormData(form);
    const answers = model.payload.rounds.map(round => {
        const value = data.get(fieldName(model, round));
        return typeof value === 'string' && value.trim() ? { roundId: round.id, value } : null;
    });
    return answers.every((answer): answer is { roundId: string; value: string } => answer !== null) ? { answers } : null;
}

function parseResponse(
    model: ConsiderateRecommendationModel,
    response: ConsiderateRecommendationResponse,
): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every conversation-script row needs one response.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        if (!model.payload.rounds.some(round => round.id === answer.roundId) || answers.has(answer.roundId) || !text(answer.value)) {
            throw new TypeError('Conversation-script responses must use every authored row exactly once.');
        }
        answers.set(answer.roundId, answer.value);
    });
    return answers;
}

function normalizeSourceResponse(value: string): string {
    return normalizeJapanese(value.normalize('NFKC').replace(/\([^)]*\)/gu, ''));
}

function reviewSeed(round: ConsiderateRecommendationRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l2-l35:considerate-recommendation:${round.id}`,
        conceptId: round.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: round.sourceQuestionId,
        content: { expression: round.answer, meanings: [`Sensei Chapter 35 conversation-script ${round.sourceTask} segment`] },
    };
}

function fieldName(model: ConsiderateRecommendationModel, round: ConsiderateRecommendationRound): string {
    return `${model.id}:${round.id}:answer`;
}

function sourceVisual(
    payloadSha256: string,
    title: string,
    page: 1 | 2,
    filename: string,
    sha256: string,
): ConsiderateRecommendationSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${payloadSha256}:page:${page}`,
        payloadSha256,
        title,
        page,
        url: `/academy/content/lessons/l2-l35/${filename}`,
        sha256,
        alt: Object.freeze({ ja: `Moodle 原本: ${title} ${page}ページ。`, en: `Moodle original: ${title}, page ${page}.` }),
    });
}
