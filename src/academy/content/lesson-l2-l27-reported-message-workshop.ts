import lessonPackage from '../../../public/academy/content/lessons/054-l2-l27.json';
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

const PACKAGE_ID = 'l2-l27';
const PACKAGE_ORDER = 54;
const MODULE_ID = 8121291;
const ARCHIVE_ID = 'archive-000059';
const ARCHIVE_SHA256 = 'abfa64a2063a03e9b61aefd45d76668576750d8e0cb92c9d628087ce7bfeaee1';
const MESSAGE_SHA256 = '8c589fc81331f89d5f0d94bfd4914cb9a86c0288b6fad73c330d91337fda4c12';
const MEANING_SHA256 = '31bf02b4a6685556b4d4daf00f3f25946f7cca5a7ad7e5e45f7a7ff1a88af4bb';

export const L2_L27_SOURCE_VISUALS = Object.freeze([
    sourceVisual(MESSAGE_SHA256, 'Chapter 33-2 〜と言っていました_〜と伝えていただけませんか exercise', 1,
        'moodle-chapter-33-2-message-page-1.png', 'c55cc9af4848b91412dee34887a45a617f1d0dbfae414f4935be0d58b91e6fb7'),
    sourceVisual(MESSAGE_SHA256, 'Chapter 33-2 〜と言っていました_〜と伝えていただけませんか exercise', 2,
        'moodle-chapter-33-2-message-page-2.png', 'f4df2db3634229f635d4212d66b51d6de3b9f06369bf61abbcbe78e3dfcd53bc'),
    sourceVisual(MEANING_SHA256, 'Chapter 33-2〜という意味です exercise', 1,
        'moodle-chapter-33-2-meaning-page-1.png', 'cab45501a727940fb1f311dd64b1c6da55135133ae9a186365bbff5c86718af5'),
    sourceVisual(MEANING_SHA256, 'Chapter 33-2〜という意味です exercise', 2,
        'moodle-chapter-33-2-meaning-page-2.png', '1a73615d5b1e1de00a6292f6f8d5bd9e79d5d334a66a4d63b2846d9c145d2296'),
] as const);

type ReportedMessageInteraction = 'message-choice' | 'register-select' | 'typed-quote';
type ReportedMessageTask = 'relay' | 'report' | 'meaning';

interface ReportedMessageOption {
    readonly value: string;
    readonly label: string;
}

export interface ReportedMessageRound {
    readonly id: string;
    readonly sourceOrder: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    readonly sourceTask: ReportedMessageTask;
    readonly sourcePage: 1 | 2;
    readonly interaction: ReportedMessageInteraction;
    readonly sourceQuestionId: string;
    readonly prompt: LocalizedText;
    readonly options: readonly ReportedMessageOption[];
    readonly answer: string;
    readonly conceptId: string;
    readonly errorTag: string;
}

interface ReportedMessageSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 1 | 2;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface ReportedMessageWorkshopModel extends ActivityModel {
    readonly kind: 'academy-reported-message-workshop';
    readonly responseKind: 'moodle-chapter-33-reported-message-workshop';
    readonly curriculumPhase: 'assessed-production';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l2-l27';
        readonly packageOrder: 54;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 8121291;
            readonly archiveId: 'archive-000059';
            readonly sourceSheets: readonly ReportedMessageSourceVisual[];
            readonly media: {
                readonly status: 'six-audio-members-quarantined-unpaired';
                readonly sourceAudioMembers: 6;
                readonly sourceAudioTracksDelivered: 0;
            };
            readonly answerKeyBasis: 'sensei-verbatim-message-and-meaning-examples';
        };
        readonly support: {
            readonly minna: { readonly reference: 'Minna no Nihongo II · Lesson 33'; readonly reuse: 'chronology-and-scope-only' };
            readonly genki: { readonly crosswalk: 'No Genki prerequisite anchor; curriculum crosswalk gap declared'; readonly reuse: 'sequence-only' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string }>[];
        readonly taskHeadings: readonly Readonly<{ sourceTask: ReportedMessageTask; text: string }>[];
        readonly rounds: readonly ReportedMessageRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

interface ReportedMessageResponse {
    readonly answers: readonly Readonly<{ roundId: string; value: string }>[];
}

export function createLessonL2L27ReportedMessageBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = createRounds();
    const activity: ReportedMessageWorkshopModel = {
        id: 'activity:l2-l27-reported-message-workshop',
        kind: 'academy-reported-message-workshop',
        responseKind: 'moodle-chapter-33-reported-message-workshop',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 33-2 の四枚を先に読み、伝言・報告・標識の意味を、原文の形と丁寧さを保って復元してください。',
            en: 'Read Sensei’s four Chapter 33-2 pages first, then restore the message, report, and sign-meaning examples with their source form and register intact.',
        },
        teachingSupport: {
            kind: 'pattern',
            title: { ja: '伝える前に、三つの型', en: 'Three patterns before the relay' },
            entries: [
                { japanese: '普通形＋と伝えていただけませんか', translation: 'A polite request for the listener to convey the speaker’s message.' },
                { japanese: '普通形＋と言っていました', translation: 'A report of what someone said.' },
                { japanese: 'X は Y という意味です', translation: 'A definition of what X means.' },
            ],
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                sourceSheets: L2_L27_SOURCE_VISUALS,
                media: {
                    status: 'six-audio-members-quarantined-unpaired',
                    sourceAudioMembers: 6,
                    sourceAudioTracksDelivered: 0,
                },
                answerKeyBasis: 'sensei-verbatim-message-and-meaning-examples',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 33', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: 'No Genki prerequisite anchor; curriculum crosswalk gap declared', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                {
                    title: 'Plain-form relay',
                    text: 'This is used when the speaker politely asks the listener to convey the speaker’s message to the person the speaker wants to reach.',
                },
                {
                    title: 'Quoted relay',
                    text: 'Sensei also prints the original polite sentence inside Japanese quotation marks before と伝えていただけませんか.',
                },
                {
                    title: 'Report, not fresh quotation',
                    text: '〜と いいました is used for quoting what someone said, while 〜といっていました is used for reporting what someone said.',
                },
                {
                    title: 'Meaning question and definition',
                    text: 'When inquiring as to the meaning of something, the interrogative どういう is used.',
                },
                {
                    title: 'Honest media boundary',
                    text: 'All six audio members remain quarantined: no track, transcript, task pairing, duration relation, or listening answer is claimed in this document-only slice.',
                },
            ],
            taskHeadings: [
                { sourceTask: 'relay', text: 'Sensei’s relay pairs: keep plain-form and direct-quote versions distinct.' },
                { sourceTask: 'report', text: 'Sensei’s report pair: preserve 言っていました and the quotation boundary.' },
                { sourceTask: 'meaning', text: 'Sensei’s sign example: ask with どういう and define with という意味です.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '八つの原文を、伝言・報告・意味の型と丁寧さを変えずに復元できました。',
                        en: 'You restored all eight source lines without changing their relay, report, meaning, or register pattern.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '間違えた行だけ、引用符、普通形、伝えて、言っていました、という意味ですを原本で確認しましょう。',
                        en: 'For only the missed lines, recheck quotation marks, plain form, 伝えて, 言っていました, and という意味です on the source pages.',
                    },
                    repairPrompt: {
                        ja: 'まず、相手に伝言を頼む文か、だれかの発言を報告する文か、意味を定義する文かを決めます。',
                        en: 'First decide whether the line requests a relay, reports what someone said, or defines a meaning.',
                    },
                    nearbyExample: {
                        ja: '先生の型: 普通形＋と伝えていただけませんか／普通形＋と言っていました／Y という意味です',
                        en: 'Sensei’s frames: plain form + と伝えていただけませんか; plain form + と言っていました; Y という意味です.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'reported-message-workshop',
        narrative: {
            ja: 'ルパーナが伝言カードを三つの受け皿へ分けます。リエ先生の原本を開いたまま、ヘンリーは引用符と普通形の境目を確認します。',
            en: 'Ruparna separates the message cards into three trays. With Rie’s originals still open, Henry checks the boundary between quotation marks and plain form.',
        },
        activity: Object.freeze(activity),
    });
}

export const reportedMessageWorkshopPlugin: ActivityPlugin<ReportedMessageWorkshopModel, ReportedMessageResponse> = {
    kind: 'academy-reported-message-workshop',
    validate: validateModel,
    render: renderWorkshop,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const missed = model.payload.rounds.filter(round => normalizeJapanese(answers.get(round.id) ?? '') !== normalizeJapanese(round.answer));
        const score = (model.payload.rounds.length - missed.length) / model.payload.rounds.length;
        return {
            outcome: missed.length ? 'lapse' : 'pass',
            score,
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

function createRounds(): readonly ReportedMessageRound[] {
    const relayPlain = 'さとうさんに あした 休(やす)む と 伝(つた)えて いただけませんか。';
    const relayQuote = 'さとうさんに「あした 休みます」と 伝えて いただけませんか。';
    const phonePlain = 'さとうさんに あとで 電話(でんわ)して と 伝(つた)えて いただけませんか';
    const phoneQuote = 'さとうさんに「 あとで 電話を ください」と 伝えて いただけませんか。';
    const reportPlain = 'たなかさんが あした 休(やす)む と 言(い)っていました。';
    const reportQuote = 'たなかさんが「あした 休みます」と 言(い)っていました。';
    const meaningQuestion = 'このマークは どういう 意味ですか。';
    const meaningAnswer = '写真(しゃしん) を 撮っては いけない と いう 意味です。';
    return Object.freeze([
        round('relay-day-off-plain', 1, 'relay', 1, 'message-choice', MESSAGE_SHA256,
            '先生の最初の伝言ペアから、普通形の行を選んでください。', 'Choose the plain-form line from Sensei’s first relay pair.',
            relayPlain, [relayPlain, relayQuote]),
        round('relay-day-off-quote', 2, 'relay', 1, 'typed-quote', MESSAGE_SHA256,
            '同じ伝言の直接引用の行を、原文どおりに入力してください。', 'Type the direct-quote line from the same relay pair in source wording.',
            relayQuote, []),
        round('relay-call-plain', 3, 'relay', 1, 'register-select', MESSAGE_SHA256,
            '先生の電話の伝言ペアから、普通形の行を選んでください。', 'Choose the plain-form line from Sensei’s telephone relay pair.',
            phonePlain, [phonePlain, phoneQuote]),
        round('relay-call-quote', 4, 'relay', 1, 'typed-quote', MESSAGE_SHA256,
            '電話をくださいを引用する行を、先頭の引用符内の空白も含めて入力してください。', 'Type the line quoting 電話をください, retaining the source space after the opening quote.',
            phoneQuote, []),
        round('report-day-off-plain', 5, 'report', 1, 'message-choice', MESSAGE_SHA256,
            '田中さんの発言を普通形で報告する行を選んでください。', 'Choose the plain-form line reporting what Ms. Tanaka said.',
            reportPlain, [reportPlain, reportQuote]),
        round('report-day-off-quote', 6, 'report', 1, 'register-select', MESSAGE_SHA256,
            '田中さんの発言を直接引用する行を選んでください。', 'Choose the direct-quote report of what Ms. Tanaka said.',
            reportQuote, [reportQuote, reportPlain]),
        round('meaning-question', 7, 'meaning', 1, 'message-choice', MEANING_SHA256,
            'マークの意味をたずねる先生の質問を選んでください。', 'Choose Sensei’s question asking what the mark means.',
            meaningQuestion, [meaningQuestion, 'これは なんと 読むんですか。']),
        round('meaning-no-photography', 8, 'meaning', 1, 'typed-quote', MEANING_SHA256,
            '写真禁止の答えを、ふりがなと空白を含めて原文どおりに入力してください。', 'Type Sensei’s no-photography answer with its printed readings and spacing.',
            meaningAnswer, []),
    ]);
}

function round(
    id: string,
    sourceOrder: ReportedMessageRound['sourceOrder'],
    sourceTask: ReportedMessageTask,
    sourcePage: 1 | 2,
    interaction: ReportedMessageInteraction,
    payloadSha256: string,
    ja: string,
    en: string,
    answer: string,
    values: readonly string[],
): ReportedMessageRound {
    return Object.freeze({
        id,
        sourceOrder,
        sourceTask,
        sourcePage,
        interaction,
        sourceQuestionId: `moodle:${MODULE_ID}:${payloadSha256}:pdf-p${sourcePage}:${id}`,
        prompt: Object.freeze({ ja, en }),
        options: Object.freeze(values.map(value => Object.freeze({ value, label: value }))),
        answer,
        conceptId: `concept:l2-l27:reported-message:${sourceOrder}`,
        errorTag: `l2-l27-reported-message-${sourceOrder}`,
    });
}

function validateModel(model: ReportedMessageWorkshopModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.provenance?.packageId !== PACKAGE_ID || model.provenance.packageOrder !== PACKAGE_ORDER
        || model.provenance.moodle.moduleId !== MODULE_ID || model.provenance.moodle.archiveId !== ARCHIVE_ID) {
        issues.push({ path: 'provenance', message: 'The exact l2-l27 package identity is required.' });
    }
    const visuals = model.provenance?.moodle.sourceSheets;
    if (!Array.isArray(visuals) || visuals.length !== L2_L27_SOURCE_VISUALS.length
        || visuals.some((visual, index) => JSON.stringify(visual) !== JSON.stringify(L2_L27_SOURCE_VISUALS[index]))) {
        issues.push({ path: 'provenance.moodle.sourceSheets', message: 'All four SHA-pinned Chapter 33-2 pages are required.' });
    }
    const media = model.provenance?.moodle.media;
    if (media?.status !== 'six-audio-members-quarantined-unpaired'
        || media.sourceAudioMembers !== 6 || media.sourceAudioTracksDelivered !== 0) {
        issues.push({ path: 'provenance.moodle.media', message: 'All six unpaired audio members must remain quarantined.' });
    }
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id || model.provenance?.answerVisibility !== 'after-attempt') {
        issues.push({ path: 'answerSupport', message: 'Answers and repair support must remain gated until an attempt.' });
    }
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 5
        || model.payload.teaching.some(step => !text(step.title) || !text(step.text))) {
        issues.push({ path: 'payload.teaching', message: 'Five source-grounded teaching steps must precede retrieval.' });
    }
    const rounds = model.payload?.rounds;
    const interactions: readonly ReportedMessageInteraction[] = [
        'message-choice', 'typed-quote', 'register-select', 'typed-quote',
        'message-choice', 'register-select', 'message-choice', 'typed-quote',
    ];
    if (!Array.isArray(rounds) || rounds.length !== 8
        || rounds.some((item, index) => item.sourceOrder !== index + 1 || item.interaction !== interactions[index]
            || !text(item.sourceQuestionId) || !text(item.prompt.en) || !text(item.prompt.ja)
            || !text(item.answer) || !model.conceptIds.includes(item.conceptId)
            || item.options.length !== (item.interaction === 'typed-quote' ? 0 : 2)
            || (item.options.length > 0 && !item.options.some((option: ReportedMessageOption) => option.value === item.answer)))) {
        issues.push({ path: 'payload.rounds', message: 'Eight exact-source rounds with all three interaction modes are required.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function renderWorkshop(
    model: ReportedMessageWorkshopModel,
    host: ActivityHost,
    submit: (response: ReportedMessageResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-state-inspection academy-reported-message-workshop';
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
    check.textContent = host.language === 'ja' ? '八つの伝言を確認する' : 'Check all eight source lines';
    form.append(groups, check);
    const key = renderAnswerKey(model, host.language);
    const feedback = statusRegion('academy-kit-feedback academy-state-inspection-feedback');
    root.append(heading, teaching, sources, form, key, feedback);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            feedback.textContent = host.language === 'ja' ? '八つの行に答えてください。' : 'Complete all eight source lines.';
            return;
        }
        setPending(form, true);
        void submit(response).then(evaluation => {
            root.dataset.outcome = evaluation.result.outcome;
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

function renderTeaching(model: ReportedMessageWorkshopModel): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-teaching';
    section.dataset.lessonPhase = 'teaching';
    model.payload.teaching.forEach(step => {
        const block = document.createElement('section');
        const heading = document.createElement('h3');
        heading.textContent = step.title;
        const copy = document.createElement('p');
        copy.textContent = step.text;
        block.append(heading, copy);
        section.append(block);
    });
    return section;
}

function renderRound(model: ReportedMessageWorkshopModel, round: ReportedMessageRound, host: ActivityHost): HTMLElement {
    const item = document.createElement('li');
    item.className = 'academy-state-inspection-round';
    item.dataset.roundId = round.id;
    item.dataset.interaction = round.interaction;
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.append(...localizedNodes(round.prompt));
    fieldset.append(legend);
    const name = fieldName(model, round);
    if (round.interaction === 'message-choice') {
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
    } else if (round.interaction === 'register-select') {
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

function renderAnswerKey(model: ReportedMessageWorkshopModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.textContent = language === 'ja' ? '試したあとの先生の原文' : 'Sensei’s source wording after your attempt';
    const list = document.createElement('ol');
    model.payload.rounds.forEach(round => {
        const item = document.createElement('li');
        item.lang = 'ja';
        item.textContent = round.answer;
        list.append(item);
    });
    section.append(heading, list);
    return section;
}

function responseFromForm(model: ReportedMessageWorkshopModel, form: HTMLFormElement): ReportedMessageResponse | null {
    const data = new FormData(form);
    const answers = model.payload.rounds.map(round => {
        const value = data.get(fieldName(model, round));
        return typeof value === 'string' && value.trim() ? { roundId: round.id, value } : null;
    });
    return answers.every((answer): answer is { roundId: string; value: string } => answer !== null) ? { answers } : null;
}

function parseResponse(model: ReportedMessageWorkshopModel, response: ReportedMessageResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every reported-message row needs one response.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        if (!model.payload.rounds.some(round => round.id === answer.roundId) || answers.has(answer.roundId) || !text(answer.value)) {
            throw new TypeError('Reported-message responses must use every authored row exactly once.');
        }
        answers.set(answer.roundId, answer.value);
    });
    return answers;
}

function reviewSeed(round: ReportedMessageRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l2-l27:reported-message:${round.id}`,
        conceptId: round.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: round.sourceQuestionId,
        content: { expression: round.answer, meanings: [`Sensei Chapter 33-2 ${round.sourceTask} example`] },
    };
}

function fieldName(model: ReportedMessageWorkshopModel, round: ReportedMessageRound): string {
    return `${model.id}:${round.id}:answer`;
}

function sourceVisual(
    payloadSha256: string,
    title: string,
    page: 1 | 2,
    filename: string,
    sha256: string,
): ReportedMessageSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${payloadSha256}:page:${page}`,
        payloadSha256,
        title,
        page,
        url: `/academy/content/lessons/l2-l27/${filename}`,
        sha256,
        alt: Object.freeze({
            ja: `Moodle 原本: ${title} ${page}ページ。`,
            en: `Moodle original: ${title}, page ${page}.`,
        }),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l27 package');
    const identity = record(root.identity, 'l2-l27 identity');
    const coverage = record(root.sourceCoverage, 'l2-l27 source coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveId !== ARCHIVE_ID || coverage.archiveSha256 !== ARCHIVE_SHA256
        || coverage.memberFileCount !== 18) throw new TypeError('Unexpected l2-l27 package identity.');
    const members = array(coverage.members, 'l2-l27 members').map(member => record(member, 'l2-l27 member'));
    for (const payloadSha256 of [MESSAGE_SHA256, MEANING_SHA256]) {
        if (!members.some(member => member.payloadSha256 === payloadSha256 && member.kind === 'document')) {
            throw new TypeError(`Missing exact l2-l27 Moodle document ${payloadSha256}.`);
        }
    }
    if (members.filter(member => member.kind === 'audio').length !== 6) {
        throw new TypeError('l2-l27 expects six quarantined audio members.');
    }
    const provenance = record(root.provenance, 'l2-l27 provenance');
    if (provenance.unresolvedAnswersPolicy !== 'quarantine' || provenance.unresolvedAudioPolicy !== 'quarantine') {
        throw new TypeError('l2-l27 unresolved answers and audio must remain quarantined.');
    }
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected ${label} record.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`Expected ${label} array.`);
    return value;
}
