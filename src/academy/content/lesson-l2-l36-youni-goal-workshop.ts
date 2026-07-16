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

const PACKAGE_ID = 'l2-l36';
const PACKAGE_ORDER = 63;
const MODULE_ID = 8824742;
const ARCHIVE_ID = 'archive-000028';
const ARCHIVE_SHA256 = '5864abfd10047d8084bf67dd6aeb921852a98e2c873d66a47bab32640c7ac174';
const GRAMMAR_SHA256 = '8ea569a59c76becff9b7c7320c5c4844e897f518ff4af461e7466510dd309a73';
const VOCABULARY_SHA256 = 'aa2d99c6036efe6f96b766fe682ae06a3f9c9e87e99f92bb687a199de5d902d3';
const EXCLUDED_AUDIO_PAYLOADS = Object.freeze([
    '0de2c7abfe3c7857c9def04b5be3f00a85a60d198c208f116c4660a8d9c7c78e',
    '4fe8f7973ea49725d3bb76988bd5c85f32a2e405bd54280be9806952931ca6aa',
] as const);

export const L2_L36_SOURCE_VISUALS = Object.freeze([
    sourceVisual(GRAMMAR_SHA256, 'Chapter 36-1 〜ように_ないように_Verb2_Grammar exercise', 1,
        'moodle-chapter-36-1-youni-grammar-page-1.png', 'de858644344a91af309b2235c973cacc3a3d76df393382e38bd19a5bc268510d'),
    sourceVisual(GRAMMAR_SHA256, 'Chapter 36-1 〜ように_ないように_Verb2_Grammar exercise', 2,
        'moodle-chapter-36-1-youni-grammar-page-2.png', '332ccf3f9d453c80a26696e929a521db7d3e8c3e3d3bf7804b3573d60a71c58e'),
    sourceVisual(GRAMMAR_SHA256, 'Chapter 36-1 〜ように_ないように_Verb2_Grammar exercise', 3,
        'moodle-chapter-36-1-youni-grammar-page-3.png', 'a90490477ac90bd12911e906791879fc53554e9ce7807a668940d88c17030581'),
    sourceVisual(VOCABULARY_SHA256, 'Chapter 36-1 Vocabulary Sheet', 1,
        'moodle-chapter-36-1-vocabulary-page-1.png', 'e6e3ea9b840146e607d638baf60448d29040f53be96e2d886373bd0261f8c6b0'),
] as const);

type YouniInteraction = 'source-choice' | 'pattern-select' | 'typed-source';
type YouniTask = 'goal' | 'avoidance' | 'model';

interface YouniOption {
    readonly value: string;
    readonly label: string;
}

export interface YouniGoalRound {
    readonly id: string;
    readonly sourceOrder: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    readonly sourceTask: YouniTask;
    readonly sourcePage: 1;
    readonly interaction: YouniInteraction;
    readonly sourceQuestionId: string;
    readonly prompt: LocalizedText;
    readonly options: readonly YouniOption[];
    readonly answer: string;
    readonly conceptId: string;
    readonly errorTag: string;
}

interface YouniSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 1 | 2 | 3;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface YouniGoalWorkshopModel extends ActivityModel {
    readonly kind: 'academy-youni-goal-workshop';
    readonly responseKind: 'moodle-chapter-36-youni-goal-workshop';
    readonly curriculumPhase: 'assessed-production';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l2-l36';
        readonly packageOrder: 63;
        readonly sourcePackageStatus: 'direct-canonical-archive-extension-no-authored-package-json';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 8824742;
            readonly archiveId: 'archive-000028';
            readonly archiveSha256: typeof ARCHIVE_SHA256;
            readonly sourceSheets: readonly YouniSourceVisual[];
            readonly media: {
                readonly status: 'archive-audio-not-attributed-to-chapter-36-slice';
                readonly archiveAudioMembers: 2;
                readonly sourceAudioTracksDelivered: 0;
                readonly excludedPayloadSha256: typeof EXCLUDED_AUDIO_PAYLOADS;
            };
            readonly answerKeyBasis: 'sensei-verbatim-visible-examples-only';
        };
        readonly support: {
            readonly minna: { readonly reference: 'Minna no Nihongo II · Lesson 36'; readonly reuse: 'chronology-and-scope-only' };
            readonly genki: { readonly reference: 'not-used'; readonly reuse: 'no-learner-facing-payload' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string; attribution: 'sensei-source' | 'yomu-boundary' }>[];
        readonly taskHeadings: readonly Readonly<{ sourceTask: YouniTask; text: string }>[];
        readonly rounds: readonly YouniGoalRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

interface YouniGoalResponse {
    readonly answers: readonly Readonly<{ roundId: string; value: string }>[];
}

export function createLessonL2L36YouniGoalWorkshopBeat(): LessonActivityBeat {
    const rounds = createRounds();
    const activity: YouniGoalWorkshopModel = {
        id: 'activity:l2-l36-youni-goal-workshop',
        kind: 'academy-youni-goal-workshop',
        responseKind: 'moodle-chapter-36-youni-goal-workshop',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 36-1 の四枚を先に読み、八つの印刷例を原文どおりに戻してください。',
            en: 'Read Sensei’s four Chapter 36-1 pages first, then restore eight printed examples in their source wording.',
        },
        teachingSupport: {
            kind: 'pattern',
            title: { ja: '目標と、そのための行動', en: 'A goal and the action toward it' },
            entries: [
                { japanese: 'verb 1 dictionary form ように、 verb 2 。', translation: 'Take the verb 2 action toward the goal expressed before ように.' },
                { japanese: 'verb 1 ない form ない ように、 verb 2 。', translation: 'Take the verb 2 action to prevent the situation before ないように.' },
            ],
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            sourcePackageStatus: 'direct-canonical-archive-extension-no-authored-package-json',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                archiveSha256: ARCHIVE_SHA256,
                sourceSheets: L2_L36_SOURCE_VISUALS,
                media: {
                    status: 'archive-audio-not-attributed-to-chapter-36-slice',
                    archiveAudioMembers: 2,
                    sourceAudioTracksDelivered: 0,
                    excludedPayloadSha256: EXCLUDED_AUDIO_PAYLOADS,
                },
                answerKeyBasis: 'sensei-verbatim-visible-examples-only',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 36', reuse: 'chronology-and-scope-only' },
                genki: { reference: 'not-used', reuse: 'no-learner-facing-payload' },
            },
        },
        payload: {
            teaching: [
                {
                    title: 'verb 1 dictionary form ように、 verb 2 。',
                    text: '…, so …',
                    attribution: 'sensei-source',
                },
                {
                    title: 'verb 1 ない form ない ように、 verb 2 。',
                    text: '…, so not …',
                    attribution: 'sensei-source',
                },
                {
                    title: 'Goal or aim',
                    text: 'The usage indicates taking the action denoted by verb 2 in order to achieve the situation expressed by 〜ように.',
                    attribution: 'sensei-source',
                },
                {
                    title: 'The form before ように',
                    text: 'The dictionary form of a non-volitional verbs (such as a potential verb, わかります, みえます, きこえます, なります, etc.,) or a verb’s negative form is used before ように.',
                    attribution: 'sensei-source',
                },
                {
                    title: 'Source boundary',
                    text: 'Only the eight examples visibly printed on page 1 are assessed. Homework blanks, open responses, the animal reading, Chapter 35 material, and both unattributed archive audio members remain unconverted.',
                    attribution: 'yomu-boundary',
                },
            ],
            taskHeadings: [
                { sourceTask: 'goal', text: 'Printed goals: make a possible state achievable.' },
                { sourceTask: 'avoidance', text: 'Printed avoidance goals: prevent an unwanted state.' },
                { sourceTask: 'model', text: 'Sensei’s printed task 1 model.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '八つの印刷例を、目標と行動の関係を保って戻せました。', en: 'You restored all eight printed examples while preserving the relation between each goal and action.' } },
                lapse: {
                    explanation: { ja: '間違えた印刷例だけを、先生の1ページ目でもう一度確認しましょう。', en: 'Recheck only the missed printed example on Sensei’s first page.' },
                    repairPrompt: { ja: '先に、できる状態か、避ける状態かを見つけ、その後の行動を原文どおりにつなぎます。', en: 'First locate the possible or avoided state, then attach the printed action exactly as shown.' },
                    nearbyExample: { ja: '原本の型: V辞書形＋ように／Vない形＋ないように', en: 'Source frames: dictionary form + ように / negative form + ないように.' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'youni-goal-workshop',
        narrative: {
            ja: 'りえ先生が、目標になる状態と、そのためにする行動を二つの列に分けます。原本を読んでから、印刷された八つの例を戻します。',
            en: 'Rie separates goal states from the actions taken toward them. After reading the originals, restore the eight printed examples.',
        },
        activity: Object.freeze(activity),
    });
}

export const youniGoalWorkshopPlugin: ActivityPlugin<YouniGoalWorkshopModel, YouniGoalResponse> = {
    kind: 'academy-youni-goal-workshop',
    validate: validateModel,
    render: renderWorkshop,
    grade(model, response) {
        const answers = parseResponse(model, response);
        const missed = model.payload.rounds.filter(round =>
            normalizeJapanese(answers.get(round.id) ?? '') !== normalizeJapanese(round.answer));
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

function createRounds(): readonly YouniGoalRound[] {
    const bicycle = '自転車(じてんしゃ)に 乗(の)れる ように、毎日(まいにち) 練習(れんしゅう)しました。';
    const japanese = 'もっと日本語(にほんご)が はなせるように、毎日(まいにち) 勉強(べんきょう)しています。';
    const meeting = '会議(かいぎ)に 間(ま)に合(あ)うように、タクシーで 会社へ 行きます。';
    const coldCare = '風邪(かぜ)を ひかないように、いろいろと 気(き)を つけています。';
    const mask = '風邪(かぜ)を ひかないように、必(かなら)ず マスクを します。';
    const memo = '買(か)うものを わすれないように、メモします。';
    const rush = 'ラッシュに 遭(あ)わないように、早(はや)く うちを 出(で)ます。';
    const newspaper = '日本語の 新聞が 読めるように、漢字を 勉強します。';
    return Object.freeze([
        round('bicycle-goal', 1, 'goal', 'source-choice', '自転車に乗る目標の原文を選んでください。', 'Choose the printed bicycle-goal example.', bicycle, [bicycle, meeting]),
        round('japanese-goal', 2, 'goal', 'pattern-select', '日本語を話す目標の原文を選んでください。', 'Select the printed Japanese-speaking goal.', japanese, [japanese, newspaper]),
        round('meeting-goal', 3, 'goal', 'typed-source', '会議の例を原文どおりに入力してください。', 'Type the printed meeting example in source wording.', meeting, []),
        round('cold-care', 4, 'avoidance', 'source-choice', '風邪に気をつける原文を選んでください。', 'Choose the printed line about taking care not to catch a cold.', coldCare, [coldCare, mask]),
        round('mask-avoidance', 5, 'avoidance', 'pattern-select', 'マスクの原文を選んでください。', 'Select the printed mask example.', mask, [mask, memo]),
        round('memo-avoidance', 6, 'avoidance', 'typed-source', '買うものの例を原文どおりに入力してください。', 'Type the printed shopping memo example in source wording.', memo, []),
        round('rush-avoidance', 7, 'avoidance', 'source-choice', 'ラッシュを避ける原文を選んでください。', 'Choose the printed line about avoiding rush hour.', rush, [rush, meeting]),
        round('newspaper-model', 8, 'model', 'typed-source', 'Task 1 の新聞の見本を原文どおりに入力してください。', 'Type Sensei’s newspaper model in source wording.', newspaper, []),
    ]);
}

function round(
    id: string,
    sourceOrder: YouniGoalRound['sourceOrder'],
    sourceTask: YouniTask,
    interaction: YouniInteraction,
    ja: string,
    en: string,
    answer: string,
    values: readonly string[],
): YouniGoalRound {
    return Object.freeze({
        id,
        sourceOrder,
        sourceTask,
        sourcePage: 1,
        interaction,
        sourceQuestionId: `moodle:${MODULE_ID}:${GRAMMAR_SHA256}:pdf-p1:${id}`,
        prompt: Object.freeze({ ja, en }),
        options: Object.freeze(values.map(value => Object.freeze({ value, label: value }))),
        answer,
        conceptId: `concept:l2-l36:youni-goal:${sourceOrder}`,
        errorTag: `l2-l36-youni-goal-${sourceOrder}`,
    });
}

function validateModel(model: YouniGoalWorkshopModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.provenance?.packageId !== PACKAGE_ID || model.provenance.packageOrder !== PACKAGE_ORDER
        || model.provenance.sourcePackageStatus !== 'direct-canonical-archive-extension-no-authored-package-json'
        || model.provenance.moodle.moduleId !== MODULE_ID || model.provenance.moodle.archiveId !== ARCHIVE_ID
        || model.provenance.moodle.archiveSha256 !== ARCHIVE_SHA256) {
        issues.push({ path: 'provenance', message: 'The direct canonical l2-l36 archive extension is required.' });
    }
    const visuals = model.provenance?.moodle.sourceSheets;
    if (!Array.isArray(visuals) || visuals.length !== L2_L36_SOURCE_VISUALS.length
        || visuals.some((visual, index) => JSON.stringify(visual) !== JSON.stringify(L2_L36_SOURCE_VISUALS[index]))) {
        issues.push({ path: 'provenance.moodle.sourceSheets', message: 'All four SHA-pinned Chapter 36-1 pages are required.' });
    }
    const media = model.provenance?.moodle.media;
    if (media?.status !== 'archive-audio-not-attributed-to-chapter-36-slice'
        || media.archiveAudioMembers !== 2 || media.sourceAudioTracksDelivered !== 0
        || JSON.stringify(media.excludedPayloadSha256) !== JSON.stringify(EXCLUDED_AUDIO_PAYLOADS)) {
        issues.push({ path: 'provenance.moodle.media', message: 'Both unattributed archive audio members must remain excluded.' });
    }
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id || model.provenance?.answerVisibility !== 'after-attempt') {
        issues.push({ path: 'answerSupport', message: 'Answers and repair support must remain gated until an attempt.' });
    }
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 5
        || model.payload.teaching.slice(0, 4).some(step => step.attribution !== 'sensei-source' || !text(step.title) || !text(step.text))
        || model.payload.teaching[4]?.attribution !== 'yomu-boundary') {
        issues.push({ path: 'payload.teaching', message: 'Four source teaching blocks and one explicit boundary are required.' });
    }
    const interactions: readonly YouniInteraction[] = [
        'source-choice', 'pattern-select', 'typed-source', 'source-choice',
        'pattern-select', 'typed-source', 'source-choice', 'typed-source',
    ];
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 8
        || rounds.some((item, index) => item.sourceOrder !== index + 1 || item.interaction !== interactions[index]
            || !text(item.sourceQuestionId) || !text(item.prompt.en) || !text(item.prompt.ja) || !text(item.answer)
            || !model.conceptIds.includes(item.conceptId)
            || item.options.length !== (item.interaction === 'typed-source' ? 0 : 2)
            || (item.options.length > 0 && !item.options.some((option: YouniOption) => option.value === item.answer)))) {
        issues.push({ path: 'payload.rounds', message: 'Eight verbatim examples with all three interaction modes are required.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

function renderWorkshop(
    model: YouniGoalWorkshopModel,
    host: ActivityHost,
    submit: (response: YouniGoalResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-state-inspection academy-youni-goal-workshop';
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
    check.textContent = host.language === 'ja' ? '八つの原文を確認する' : 'Check all eight source examples';
    form.append(groups, check);
    const key = renderAnswerKey(model, host.language);
    const feedback = statusRegion('academy-kit-feedback academy-state-inspection-feedback');
    root.append(heading, teaching, sources, form, key, feedback);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            feedback.textContent = host.language === 'ja' ? '八つの例に答えてください。' : 'Complete all eight source examples.';
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

function renderTeaching(model: YouniGoalWorkshopModel): HTMLElement {
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

function renderRound(model: YouniGoalWorkshopModel, round: YouniGoalRound, host: ActivityHost): HTMLElement {
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
        input.setAttribute('aria-label', host.language === 'ja' ? '原文の例' : 'Exact source example');
        fieldset.append(input);
    }
    item.append(fieldset);
    return item;
}

function renderAnswerKey(model: YouniGoalWorkshopModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.textContent = language === 'ja' ? '試したあとの先生の印刷例' : 'Sensei’s printed examples after your attempt';
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

function responseFromForm(model: YouniGoalWorkshopModel, form: HTMLFormElement): YouniGoalResponse | null {
    const data = new FormData(form);
    const answers = model.payload.rounds.map(round => {
        const value = data.get(fieldName(model, round));
        return typeof value === 'string' && value.trim() ? { roundId: round.id, value } : null;
    });
    return answers.every((answer): answer is { roundId: string; value: string } => answer !== null) ? { answers } : null;
}

function parseResponse(model: YouniGoalWorkshopModel, response: YouniGoalResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every l2-l36 source example needs one response.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        if (!model.payload.rounds.some(round => round.id === answer.roundId) || answers.has(answer.roundId) || !text(answer.value)) {
            throw new TypeError('l2-l36 responses must use every authored row exactly once.');
        }
        answers.set(answer.roundId, answer.value);
    });
    return answers;
}

function reviewSeed(round: YouniGoalRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l2-l36:youni-goal:${round.id}`,
        conceptId: round.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: round.sourceQuestionId,
        content: { expression: round.answer, meanings: ['Sensei Chapter 36-1 printed example'] },
    };
}

function fieldName(model: YouniGoalWorkshopModel, round: YouniGoalRound): string {
    return `${model.id}:${round.id}:answer`;
}

function sourceVisual(
    payloadSha256: string,
    title: string,
    page: 1 | 2 | 3,
    filename: string,
    sha256: string,
): YouniSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${payloadSha256}:page:${page}`,
        payloadSha256,
        title,
        page,
        url: `/academy/content/lessons/l2-l36/${filename}`,
        sha256,
        alt: Object.freeze({ ja: `Moodle 原本: ${title} ${page}ページ。`, en: `Moodle original: ${title}, page ${page}.` }),
    });
}
