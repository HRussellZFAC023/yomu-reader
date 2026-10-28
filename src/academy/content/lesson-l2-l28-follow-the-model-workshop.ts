import lessonPackage from '../../../public/academy/content/lessons/055-l2-l28.json';
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

const PACKAGE_ID = 'l2-l28';
const PACKAGE_ORDER = 55;
const MODULE_ID = 8121293;
const ARCHIVE_ID = 'archive-000096';
const ARCHIVE_SHA256 = 'fef6a7e4dab4bfc85a5f02e7713837f771ab4a32b316522c5640896d94063c02';
const TOORI_SHA256 = '561925130d7136e174d858aabb997f36b701f4db5702c925933ed5697c39464e';
const ATODE_SHA256 = '09c6524d120d34b0d88bf7ee062602d95cfdfa465eab54b64438584a0fd3312e';
const AUDIO_PAYLOADS = Object.freeze([
    '5e3d9fcbfd843a730842a2caab870424745d22d8be524b41129f5d34a57c8d84',
    '0c71fe46c3b30f053a46e1d9ab49750992c76dd12a1c870ff8b957312f896fee',
    'be296a3de4f5e02e962ddea398aeeca904b60b0e3b8b6fa2745165fc4d7664bb',
] as const);

export const L2_L28_SOURCE_VISUALS = Object.freeze([
    sourceVisual(TOORI_SHA256, 'Chapter 34-1_〜たとおり_のとおり grammar exercise', 1,
        'moodle-chapter-34-1-toori-page-1.png', '00ffd31387ae408c1713a132502a57ed20b23ca75f2882b44e7bd0ffae6d2ceb'),
    sourceVisual(TOORI_SHA256, 'Chapter 34-1_〜たとおり_のとおり grammar exercise', 2,
        'moodle-chapter-34-1-toori-page-2.png', '739d5731be16c5d9281005e8fc67f6e5394a34fac47455ff6128b4460e28ef80'),
    sourceVisual(ATODE_SHA256, 'Chapter 34-1_〜たあとで_のあとで_grammar exercise', 1,
        'moodle-chapter-34-1-atode-page-1.png', '59f457456021579209149e2d596171fe3452b211f82d47127d2959d2fae9f956'),
    sourceVisual(ATODE_SHA256, 'Chapter 34-1_〜たあとで_のあとで_grammar exercise', 2,
        'moodle-chapter-34-1-atode-page-2.png', '747800474673c50ce6f5565a00ffe8ee48fafc2772800b7d171955f2e069c653'),
    sourceVisual(ATODE_SHA256, 'Chapter 34-1_〜たあとで_のあとで_grammar exercise', 3,
        'moodle-chapter-34-1-atode-page-3.png', '4e73e5f088f5025ff62e6c35c2d71e784631282cce42a13578d4e81b1c8453df'),
] as const);

type FollowModelInteraction = 'source-choice' | 'pattern-select' | 'typed-source';
type FollowModelTask = 'same-way' | 'after' | 'contrast';

interface FollowModelOption {
    readonly value: string;
    readonly label: string;
}

export interface FollowModelRound {
    readonly id: string;
    readonly sourceOrder: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    readonly sourceTask: FollowModelTask;
    readonly sourcePage: 1 | 2 | 3;
    readonly interaction: FollowModelInteraction;
    readonly sourceQuestionId: string;
    readonly prompt: LocalizedText;
    readonly options: readonly FollowModelOption[];
    readonly answer: string;
    readonly conceptId: string;
    readonly errorTag: string;
}

interface FollowModelSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 1 | 2 | 3;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface FollowModelWorkshopModel extends ActivityModel {
    readonly kind: 'academy-follow-the-model-workshop';
    readonly responseKind: 'moodle-chapter-34-toori-atode-workshop';
    readonly curriculumPhase: 'assessed-production';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l2-l28';
        readonly packageOrder: 55;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 8121293;
            readonly archiveId: 'archive-000096';
            readonly sourceSheets: readonly FollowModelSourceVisual[];
            readonly media: {
                readonly status: 'three-audio-members-quarantined-unpaired';
                readonly sourceAudioMembers: 3;
                readonly sourceAudioTracksDelivered: 0;
                readonly quarantinedPayloadSha256: typeof AUDIO_PAYLOADS;
            };
            readonly answerKeyBasis: 'sensei-verbatim-visible-examples-only';
        };
        readonly support: {
            readonly minna: { readonly reference: 'Minna no Nihongo II · Lesson 34'; readonly reuse: 'chronology-and-scope-only' };
            readonly genki: { readonly crosswalk: '≈ Genki II · parallel N4 scope'; readonly reuse: 'sequence-only' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string; attribution: 'sensei-source' | 'yomu-boundary' }>[];
        readonly taskHeadings: readonly Readonly<{ sourceTask: FollowModelTask; text: string }>[];
        readonly rounds: readonly FollowModelRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

interface FollowModelResponse {
    readonly answers: readonly Readonly<{ roundId: string; value: string }>[];
}

export function createLessonL2L28FollowModelBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = createRounds();
    const activity: FollowModelWorkshopModel = {
        id: 'activity:l2-l28-follow-the-model-workshop',
        kind: 'academy-follow-the-model-workshop',
        responseKind: 'moodle-chapter-34-toori-atode-workshop',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 34-1 の五枚を先に読み、「とおり」と「あとで」の原文例を、形と順序を変えずに戻してください。',
            en: 'Read Sensei’s five Chapter 34-1 pages first, then restore the printed とおり and あとで examples without changing their form or order.',
        },
        teachingSupport: {
            kind: 'pattern',
            title: { ja: '原本を読む前の二つの型', en: 'Two source patterns before retrieval' },
            entries: [
                { japanese: 'Verb 1 た-form とおりに、 Verb 2 。', translation: 'Do Verb 2 by the same method or conditions as Verb 1.' },
                { japanese: 'Noun の とおりに、 Verb 2 。', translation: 'Act without deviating from the preceding standard.' },
                { japanese: 'Verb た-form あとで、 Verb 2.', translation: 'Verb 2 happens after Verb 1.' },
                { japanese: 'Noun の あとで、 Verb 2.', translation: 'Verb 2 happens after the noun situation.' },
            ],
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                sourceSheets: L2_L28_SOURCE_VISUALS,
                media: {
                    status: 'three-audio-members-quarantined-unpaired',
                    sourceAudioMembers: 3,
                    sourceAudioTracksDelivered: 0,
                    quarantinedPayloadSha256: AUDIO_PAYLOADS,
                },
                answerKeyBasis: 'sensei-verbatim-visible-examples-only',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 34', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · parallel N4 scope', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                {
                    title: 'Verb 1 た-form とおりに、 Verb 2 。',
                    text: '①This indicates doing Verb 2 by the same method or under the same conditions as Verb 1',
                    attribution: 'sensei-source',
                },
                {
                    title: 'Noun の とおりに、 Verb 2 。',
                    text: '②This indicates performing an action without deviating from the standard indicated by the preceding phrase.',
                    attribution: 'sensei-source',
                },
                {
                    title: 'このとおり／そのとおり',
                    text: 'As とおり is a noun, it can be used with an demonstrative such as あの、その、この directly attached, to mean ‘by the same method or in the same way as specified by that demonstrative.',
                    attribution: 'sensei-source',
                },
                {
                    title: 'Verb た-form あとで、 Verb 2. ／ Noun の あとで、 Verb 2.',
                    text: 'This indicates that the action denoted by Verb 2 happens after the action or situation denoted by Verb 1 or Noun.',
                    attribution: 'sensei-source',
                },
                {
                    title: 'あとで and て-form から',
                    text: 'This puts more emphasis on the time context in which the events happen than Verb て-form から, which has the same meaning. Also, unlike Verb て-form から, there is no implication that Verb 1 or Noun is a precondition of, or preparatory action for Verb 2.',
                    attribution: 'sensei-source',
                },
                {
                    title: 'Source boundary',
                    text: 'The three archived audio members, two answer PDFs, blank completions, and free conversations remain quarantined or unassessed; this workshop uses only examples visibly printed on the five displayed pages.',
                    attribution: 'yomu-boundary',
                },
            ],
            taskHeadings: [
                { sourceTask: 'same-way', text: 'Sensei’s とおり examples: distinguish verb and noun standards.' },
                { sourceTask: 'after', text: 'Sensei’s あとで examples: distinguish verb and noun situations.' },
                { sourceTask: 'contrast', text: 'Sensei’s contrast: separate a later event from a preparatory step.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '七つの原文項目を、型、順序、句読点を変えずに戻せました。', en: 'You restored all seven source items without changing their pattern, order, or punctuation.' } },
                lapse: {
                    explanation: { ja: '間違えた原文だけを、五枚のページでもう一度確認しましょう。', en: 'Recheck only the missed source item on the five displayed pages.' },
                    repairPrompt: { ja: '先に、とおりの基準か、あとでの時間関係か、てからの準備かを決めます。', en: 'First decide whether the item marks a とおり standard, an あとで time relation, or a てから preparatory step.' },
                    nearbyExample: { ja: '原本の型: Vた＋とおりに／Nの＋とおりに／Vた＋あとで／Nの＋あとで', en: 'Source frames: Vた + とおりに / Nの + とおりに / Vた + あとで / Nの + あとで.' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'follow-the-model-workshop',
        narrative: {
            ja: 'リエ先生が二つの文型を別々の列に置きます。見本どおりにすることと、ある出来事のあとですることを、原本の行で確かめます。',
            en: 'Rie places the two patterns in separate columns. Use the source lines to distinguish following a model from acting after an event.',
        },
        activity: Object.freeze(activity),
    });
}

export const followTheModelWorkshopPlugin: ActivityPlugin<FollowModelWorkshopModel, FollowModelResponse> = {
    kind: 'academy-follow-the-model-workshop',
    validate: validateModel,
    render: renderWorkshop,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const missed = model.payload.rounds.filter(round => normalizeJapanese(answers.get(round.id) ?? '') !== normalizeJapanese(round.answer));
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

function createRounds(): readonly FollowModelRound[] {
    const verbToori = '母(はは)に おしえてもらったとおりに、作(つく)ります。';
    const nounToori = '(この) 図(ず)の とおりに、折(お)りました。';
    const dottedLine = 'この 点線(てんせん)の とおりに、折(お)ってください。';
    const nounAtode = 'シャワーの あとで、ごはんを 食(た)べます。';
    const verbAtode = '宿題(しゅくだい)を したあとで、テレビを 見(み)ます。';
    const preparatory = 'ここに お金(かね)を 入(い)れてから、ボタンを 押(お)してください。';
    const laterEvent = 'あたらしい時計(とけい)を 買(か)ったあとで、なくした 時計が 見(み)つかりました。';
    return Object.freeze([
        round('verb-toori-example', 1, 'same-way', 1, 'source-choice', TOORI_SHA256,
            'Vた-form とおりにの例を選んでください。', 'Choose Sensei’s Verb た-form とおりに example.',
            verbToori, [verbToori, nounToori]),
        round('noun-toori-pattern', 2, 'same-way', 1, 'pattern-select', TOORI_SHA256,
            '図の例に使われた基本文を選んでください。', 'Select the basic sentence used by the 図 example.',
            'Noun の とおりに、 Verb 2 。', ['Verb 1 た-form とおりに、 Verb 2 。', 'Noun の とおりに、 Verb 2 。']),
        round('dotted-line-source', 3, 'same-way', 1, 'typed-source', TOORI_SHA256,
            '点線の例を、原文どおりに入力してください。', 'Type Sensei’s dotted-line example in source wording.',
            dottedLine, []),
        round('verb-atode-example', 4, 'after', 1, 'source-choice', ATODE_SHA256,
            'Vた-form あとでの例を選んでください。', 'Choose Sensei’s Verb た-form あとで example.',
            verbAtode, [nounAtode, verbAtode]),
        round('noun-atode-pattern', 5, 'after', 1, 'pattern-select', ATODE_SHA256,
            'シャワーの例に使われた基本文を選んでください。', 'Select the basic sentence used by the shower example.',
            'Noun の あとで、 Verb 2.', ['Verb た-form あとで、 Verb 2.', 'Noun の あとで、 Verb 2.']),
        round('preparatory-tekara', 6, 'contrast', 1, 'source-choice', ATODE_SHA256,
            '前の動作が準備になる「てから」の原文を選んでください。', 'Choose the source てから line where the first action is preparatory.',
            preparatory, [laterEvent, preparatory]),
        round('later-event-source', 7, 'contrast', 1, 'typed-source', ATODE_SHA256,
            'なくした時計の例を、原文どおりに入力してください。', 'Type Sensei’s lost-watch example in source wording.',
            laterEvent, []),
    ]);
}

function round(
    id: string,
    sourceOrder: FollowModelRound['sourceOrder'],
    sourceTask: FollowModelTask,
    sourcePage: FollowModelRound['sourcePage'],
    interaction: FollowModelInteraction,
    payloadSha256: string,
    ja: string,
    en: string,
    answer: string,
    values: readonly string[],
): FollowModelRound {
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
        conceptId: `concept:l2-l28:follow-model:${sourceOrder}`,
        errorTag: `l2-l28-follow-model-${sourceOrder}`,
    });
}

function validateModel(model: FollowModelWorkshopModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.provenance?.packageId !== PACKAGE_ID || model.provenance.packageOrder !== PACKAGE_ORDER
        || model.provenance.moodle.moduleId !== MODULE_ID || model.provenance.moodle.archiveId !== ARCHIVE_ID) {
        issues.push({ path: 'provenance', message: 'The exact l2-l28 package identity is required.' });
    }
    const visuals = model.provenance?.moodle.sourceSheets;
    if (!Array.isArray(visuals) || visuals.length !== L2_L28_SOURCE_VISUALS.length
        || visuals.some((visual, index) => JSON.stringify(visual) !== JSON.stringify(L2_L28_SOURCE_VISUALS[index]))) {
        issues.push({ path: 'provenance.moodle.sourceSheets', message: 'All five SHA-pinned Chapter 34-1 pages are required.' });
    }
    const media = model.provenance?.moodle.media;
    if (media?.status !== 'three-audio-members-quarantined-unpaired'
        || media.sourceAudioMembers !== 3 || media.sourceAudioTracksDelivered !== 0
        || JSON.stringify(media.quarantinedPayloadSha256) !== JSON.stringify(AUDIO_PAYLOADS)) {
        issues.push({ path: 'provenance.moodle.media', message: 'All three unpaired audio members must remain quarantined.' });
    }
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id || model.provenance?.answerVisibility !== 'after-attempt') {
        issues.push({ path: 'answerSupport', message: 'Answers and repair support must remain gated until an attempt.' });
    }
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 6
        || model.payload.teaching.some(step => !text(step.title) || !text(step.text))) {
        issues.push({ path: 'payload.teaching', message: 'Five source teaching steps and one boundary must precede retrieval.' });
    }
    const interactions: readonly FollowModelInteraction[] = [
        'source-choice', 'pattern-select', 'typed-source', 'source-choice', 'pattern-select', 'source-choice', 'typed-source',
    ];
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 7
        || rounds.some((item, index) => item.sourceOrder !== index + 1 || item.interaction !== interactions[index]
            || !text(item.sourceQuestionId) || !text(item.prompt.en) || !text(item.prompt.ja) || !text(item.answer)
            || !model.conceptIds.includes(item.conceptId)
            || item.options.length !== (item.interaction === 'typed-source' ? 0 : 2)
            || (item.options.length > 0 && !item.options.some((option: FollowModelOption) => option.value === item.answer)))) {
        issues.push({ path: 'payload.rounds', message: 'Seven exact-source rounds with all three interaction modes are required.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function renderWorkshop(
    model: FollowModelWorkshopModel,
    host: ActivityHost,
    submit: (response: FollowModelResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-state-inspection academy-follow-the-model-workshop';
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
    check.textContent = host.language === 'ja' ? '七つの原文を確認する' : 'Check all seven source items';
    form.append(groups, check);
    const key = renderAnswerKey(model, host.language);
    const feedback = statusRegion('academy-kit-feedback academy-state-inspection-feedback');
    root.append(heading, teaching, sources, form, key, feedback);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            feedback.textContent = host.language === 'ja' ? '七つの項目に答えてください。' : 'Complete all seven source items.';
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

function renderTeaching(model: FollowModelWorkshopModel): HTMLElement {
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

function renderRound(model: FollowModelWorkshopModel, round: FollowModelRound, host: ActivityHost): HTMLElement {
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

function renderAnswerKey(model: FollowModelWorkshopModel, language: 'ja' | 'en' | undefined): HTMLElement {
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

function responseFromForm(model: FollowModelWorkshopModel, form: HTMLFormElement): FollowModelResponse | null {
    const data = new FormData(form);
    const answers = model.payload.rounds.map(round => {
        const value = data.get(fieldName(model, round));
        return typeof value === 'string' && value.trim() ? { roundId: round.id, value } : null;
    });
    return answers.every((answer): answer is { roundId: string; value: string } => answer !== null) ? { answers } : null;
}

function parseResponse(model: FollowModelWorkshopModel, response: FollowModelResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every follow-the-model row needs one response.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        if (!model.payload.rounds.some(round => round.id === answer.roundId) || answers.has(answer.roundId) || !text(answer.value)) {
            throw new TypeError('Follow-the-model responses must use every authored row exactly once.');
        }
        answers.set(answer.roundId, answer.value);
    });
    return answers;
}

function reviewSeed(round: FollowModelRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l2-l28:follow-model:${round.id}`,
        conceptId: round.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: round.sourceQuestionId,
        content: { expression: round.answer, meanings: [`Sensei Chapter 34-1 ${round.sourceTask} example`] },
    };
}

function fieldName(model: FollowModelWorkshopModel, round: FollowModelRound): string {
    return `${model.id}:${round.id}:answer`;
}

function sourceVisual(
    payloadSha256: string,
    title: string,
    page: 1 | 2 | 3,
    filename: string,
    sha256: string,
): FollowModelSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${payloadSha256}:page:${page}`,
        payloadSha256,
        title,
        page,
        url: `/academy/content/lessons/l2-l28/${filename}`,
        sha256,
        alt: Object.freeze({ ja: `Moodle 原本: ${title} ${page}ページ。`, en: `Moodle original: ${title}, page ${page}.` }),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l28 package');
    const identity = record(root.identity, 'l2-l28 identity');
    const coverage = record(root.sourceCoverage, 'l2-l28 source coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveModuleId !== MODULE_ID || coverage.archiveId !== ARCHIVE_ID
        || coverage.archiveSha256 !== ARCHIVE_SHA256 || coverage.memberFileCount !== 14) {
        throw new TypeError('Unexpected l2-l28 package identity.');
    }
    const members = array(coverage.members, 'l2-l28 members').map(member => record(member, 'l2-l28 member'));
    for (const payloadSha256 of [TOORI_SHA256, ATODE_SHA256]) {
        if (!members.some(member => member.payloadSha256 === payloadSha256 && member.kind === 'document' && member.extension === '.pdf')) {
            throw new TypeError(`Missing exact l2-l28 Moodle document ${payloadSha256}.`);
        }
    }
    const audioMembers = members.filter(member => member.kind === 'audio');
    if (audioMembers.length !== 3 || AUDIO_PAYLOADS.some(payload => !audioMembers.some(member => member.payloadSha256 === payload))) {
        throw new TypeError('l2-l28 expects exactly three quarantined audio members.');
    }
    const provenance = record(root.provenance, 'l2-l28 provenance');
    if (provenance.unresolvedAnswersPolicy !== 'quarantine' || provenance.unresolvedAudioPolicy !== 'quarantine') {
        throw new TypeError('l2-l28 unresolved answers and audio must remain quarantined.');
    }
    const mappings = array(provenance.sourceMappings, 'l2-l28 source mappings').map(mapping => record(mapping, 'l2-l28 mapping'));
    const minna = mappings.find(mapping => mapping.sourceId === 'source-minna-no-nihongo');
    if (!minna || minna.reference !== 'Minna no Nihongo II · Lesson 34' || minna.reuse !== 'sequence-only') {
        throw new TypeError('l2-l28 Minna use must remain sequence-only.');
    }
    if (root.genkiInteractiveActivities !== undefined || array(coverage.externalUrlModules, 'l2-l28 external URL modules').length !== 0) {
        throw new TypeError('l2-l28 must not invent Genki or external media support.');
    }
    const canonical = record(provenance.canonicalMoodle, 'l2-l28 canonical Moodle');
    const sourceItems = array(canonical.sourceItems, 'l2-l28 canonical items').map(item => record(item, 'l2-l28 canonical item'));
    for (const payloadSha256 of AUDIO_PAYLOADS) {
        const item = sourceItems.find(candidate => candidate.payloadSha256 === payloadSha256);
        if (!item || item.sourceType !== 'audio' || item.projectionStatus !== 'requires-pairing-projection'
            || item.pairingStatus !== 'source-audio-recorded-task-pairing-unverified') {
            throw new TypeError(`l2-l28 audio ${payloadSha256} must remain unpaired.`);
        }
    }
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}
