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
const MODULE_ID = 8870527;
const ARCHIVE_SHA256 = '57ca13bfffee06933f2dc4ee47d9b3ce168fd6d37475c12e0e7f243c9658265';
const VOCABULARY_2_SHA256 = '76f2f2707d8da2b8969c6c3e093e4cf7b31fa9f6b01dee421697e725ffc321f6';
const ABILITY_SHA256 = '8d6f8d9d1d1b8a2efb262cf3a19dae448b7cb6c4cef91f11cdd181e725aa4975';
const LISTENING_SHA256 = 'effc91302dfc989ccb21189fdde96a900a50b13c3540a9f8b16748b5424f6fdd';
const SPEAKING_SHA256 = 'efe978ce9bb4c95f40791b9b04d8fbd3a5cff92eafed76847e36d64cd3813044';
const VOCABULARY_3_SHA256 = '64411286b0e584fa17925521aba2f6e33b26e5797b68ab7ea12f188efcbac82a';
const POSSIBILITY_SHA256 = '40139ac093fee2dd598cba016bb168f55d23ea4dfab16f930e3b53787ee1af86';
const SUMMARY_SHA256 = '4019edaedbecea1cb3f364dc49495e15991c4f63d9c8cd9042b6d09667745bf9';

interface LessonTenSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: number;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

interface LessonTenAudio {
    readonly id: 'b5' | 'b6';
    readonly label: 'CD B-5' | 'CD B-6';
    readonly worksheetQuestion: 1 | 2;
    readonly url: string;
    readonly payloadSha256: string;
}

interface ChangeRound {
    readonly id: string;
    readonly sourceOrder: 1 | 2 | 3 | 4 | 5;
    readonly sourceQuestionId: string;
    readonly prompt: LocalizedText;
    readonly stem: string;
    readonly sourceVerb: string;
    readonly answer: string;
    readonly conceptId: string;
    readonly errorTag: string;
}

interface LessonTenVocabularyEntry {
    readonly expression: string;
    readonly meaning: string;
    readonly note?: string;
}

export interface YounarimasuChangeWorkshopModel extends ActivityModel {
    readonly kind: 'academy-younarimasu-change-workshop';
    readonly responseKind: 'moodle-lesson-10-chapter-36-change-workshop';
    readonly curriculumPhase: 'assessed-production';
    readonly answerSupport: typeof ACADEMY_ASSESSED_ANSWER_SUPPORT;
    readonly provenance: {
        readonly packageId: 'l2-l36';
        readonly packageOrder: 63;
        readonly sourcePackageStatus: 'numbered-authored-package';
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 8870527;
            readonly moodleLesson: 'Level 3+ Lesson 10';
            readonly archiveSha256: typeof ARCHIVE_SHA256;
            readonly sourceSheets: readonly LessonTenSourceVisual[];
            readonly media: {
                readonly status: 'worksheet-numbered-audio-pairing';
                readonly worksheetPayloadSha256: typeof LISTENING_SHA256;
                readonly tracks: readonly LessonTenAudio[];
            };
            readonly answerKeyBasis: 'sensei-verbatim-visible-task-one-transformations';
            readonly sourceCorrection: 'row-2-zettaini-soon-is-a-visible-source-typo';
        };
        readonly support: {
            readonly minna: { readonly reference: 'Minna no Nihongo II · Lesson 36'; readonly reuse: 'chronology-and-scope-only' };
        };
    };
    readonly payload: {
        readonly vocabulary: readonly LessonTenVocabularyEntry[];
        readonly rounds: readonly ChangeRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

interface ChangeResponse {
    readonly answers: readonly Readonly<{ roundId: string; value: string }>[];
}

function sourceVisual(
    payloadSha256: string,
    title: string,
    page: number,
    filename: string,
    sha256: string,
): LessonTenSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${payloadSha256}:page:${page}`,
        payloadSha256,
        title,
        page,
        url: `/academy/content/lessons/l2-l36/${filename}`,
        sha256,
        alt: Object.freeze({ ja: `Moodle Lesson 10 原本: ${title} ${page}ページ。`, en: `Moodle Lesson 10 original: ${title}, page ${page}.` }),
    });
}

function visualSeries(
    payloadSha256: string,
    title: string,
    filenameStem: string,
    hashes: readonly string[],
): readonly LessonTenSourceVisual[] {
    return hashes.map((sha256, index) => sourceVisual(
        payloadSha256,
        title,
        index + 1,
        `${filenameStem}-${index + 1}.png`,
        sha256,
    ));
}

export const L2_L36_LESSON_TEN_SOURCE_VISUALS = Object.freeze([
    ...visualSeries(VOCABULARY_2_SHA256, 'Chapter 36-2 Vocabulary Sheet', 'moodle-lesson-10-chapter-36-2-vocabulary-page', [
        '67c93ad62c81e07c38688e29785a93fc79606691f14b5dad632cfc0cfd93799a',
    ]),
    ...visualSeries(ABILITY_SHA256, 'Chapter 36-2 〜ようになります Ability', 'moodle-lesson-10-chapter-36-2-ability-page', [
        '0157dea90f0443b34605bb8a97564cbeec6f1025b788a96be447cb3bf14a285c',
        '656430fa5ef0959bf2412a6d7565463efb5cea250ec789f12ee0aef89e0d2b99',
        'fc928459cd97da1244a4095da509840236a497ac0574a8a52b601160bcf94dbd',
    ]),
    ...visualSeries(LISTENING_SHA256, 'Chapter 36 listening-1', 'moodle-lesson-10-chapter-36-listening-1-page', [
        'a9713e931608af5676d15a6b3d52e95239c78e219d4f1c72cf227df66a1a8389',
    ]),
    ...visualSeries(SPEAKING_SHA256, 'Chapter 36-2 〜ように speaking exercise', 'moodle-lesson-10-chapter-36-2-speaking-page', [
        'ecbe69776f26fbb74fd97ecf3f872a71e0b99215e321ea523f0287da8c761a96',
    ]),
    ...visualSeries(VOCABULARY_3_SHA256, 'Chapter 36-3 Vocabulary Sheet', 'moodle-lesson-10-chapter-36-3-vocabulary-page', [
        '07c0ffb26588dae35b64b352dcc2c89d5e9fb030de5328358746beb2bc143b3b',
        '648c9f53fef4658eda01cc0f53c35e5bebf18dd3ea9d5fbe7c87d5894bd6ba42',
    ]),
    ...visualSeries(POSSIBILITY_SHA256, 'Chapter 36-3 〜ようになります Possibility', 'moodle-lesson-10-chapter-36-3-possibility-page', [
        'ea47a0cf7be51e706fe5cab81dff4efc8e761fd6a1f7466715e90a757466764f',
        '7ad598ae5ff118d0d29a1014cd47389cd0ed98d445c57a054baeb0da25fcf9d5',
    ]),
    ...visualSeries(SUMMARY_SHA256, 'Chapter 36 summary', 'moodle-lesson-10-chapter-36-summary-page', [
        '39d633d642fa01fa90fc366c232a07ff667eb979e4ff466ab70f0b5d5ce3e748',
        '869e1665b31a2d0fcffcd10c22d40e7daf1fa5861aa1eafe9976200db7a19b47',
        '9007fe6bde0076c41080e37c1b936bb4694bdef236d143cf5c5e73e958282c55',
        '2dfe4958fd4d5083e52595c58e7f76ecfd67eb19e8e2f9140e5fe552bc265606',
        'df8465ac89b1131a229b505af2cb235b64ead8c7ce2aea45a4541887f710c892',
        '9f84d8439d75dd39a1a94ac7ecf5ed71bab63c8c44587d0b3d6ce81c53dfb65b',
        'd6121800db42ca6eda296bbcdcc4329e526b5f797e3e5bcffa978c320f1ed1f5',
        '51cf3816aca3b488567f9d983f2a4ad210d6fae79dd842ec92f5105f0c144327',
        '4c32fd7f97ed67f723e08d8e548d3aa72bbe8ea9de5be13233e19bcc0886fff0',
    ]),
] as const);

export const L2_L36_LESSON_TEN_AUDIO = Object.freeze([
    Object.freeze({
        id: 'b5',
        label: 'CD B-5',
        worksheetQuestion: 1,
        url: '/academy/content/lessons/l2-l36/moodle-lesson-10-chapter-36-listening-b5.mp3',
        payloadSha256: '1ef9ab11057ec00cda9fb488ecb9a112e9194817865ab73575e570ab8be6164c',
    }),
    Object.freeze({
        id: 'b6',
        label: 'CD B-6',
        worksheetQuestion: 2,
        url: '/academy/content/lessons/l2-l36/moodle-lesson-10-chapter-36-listening-b6.mp3',
        payloadSha256: '0ac4399d9d642db81dabe2a40faa08e279f8b4b5ea508765a8b13332c038dea8',
    }),
] as const satisfies readonly LessonTenAudio[]);

export function createLessonL2L36YounarimasuChangeWorkshopBeat(): LessonActivityBeat {
    const rounds = createRounds();
    const activity: YounarimasuChangeWorkshopModel = {
        id: 'activity:l2-l36-younarimasu-change-workshop',
        kind: 'academy-younarimasu-change-workshop',
        responseKind: 'moodle-lesson-10-chapter-36-change-workshop',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: 'Lesson 10 の語彙と原本を読み、B-5・B-6 を聞いてから、先生の五つの文を完成してください。',
            en: 'Study Lesson 10 vocabulary and originals, listen to B-5 and B-6, then complete Sensei’s five printed transformations.',
        },
        teachingSupport: {
            kind: 'pattern',
            title: { ja: 'できなかったことが、できるようになる', en: 'Becoming able to do what was not possible before' },
            entries: [
                { japanese: 'potential verb + ように なります', translation: 'become able to do something' },
                { japanese: '日本語で 本が 読めるように なりました。', translation: 'I became able to read books in Japanese.' },
                { japanese: 'カタカナが 書けるように なりました。', translation: 'I became able to write katakana.' },
            ],
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            sourcePackageStatus: 'numbered-authored-package',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                moodleLesson: 'Level 3+ Lesson 10',
                archiveSha256: ARCHIVE_SHA256,
                sourceSheets: L2_L36_LESSON_TEN_SOURCE_VISUALS,
                media: {
                    status: 'worksheet-numbered-audio-pairing',
                    worksheetPayloadSha256: LISTENING_SHA256,
                    tracks: L2_L36_LESSON_TEN_AUDIO,
                },
                answerKeyBasis: 'sensei-verbatim-visible-task-one-transformations',
                sourceCorrection: 'row-2-zettaini-soon-is-a-visible-source-typo',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 36', reuse: 'chronology-and-scope-only' },
            },
        },
        payload: {
            vocabulary: createVocabulary(),
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '五つの文で、可能形と「ようになります」を正しくつなげられました。', en: 'Across all five source sentences, you connected the potential form to ようになります correctly.' } },
                lapse: {
                    explanation: { ja: '間違えた文だけを、先生の Chapter 36-2 の一ページ目でもう一度確認しましょう。', en: 'Recheck only the missed sentence on the first Chapter 36-2 ability page.' },
                    repairPrompt: { ja: '括弧の動詞を可能形にして、「ように」をつけます。', en: 'Put the verb in brackets into its potential form, then add ように.' },
                    nearbyExample: { ja: '食べます → 食べられるように／読みます → 読めるように', en: '食べます → 食べられるように / 読みます → 読めるように' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'younarimasu-change-workshop',
        narrative: {
            ja: 'りえ先生が Lesson 10 の束を開きます。新しい語彙を確認し、二つの音声を聞き、前にはできなかったことを話します。',
            en: 'Rie opens the Lesson 10 bundle. Check its new vocabulary, listen to both recordings, then describe what has become possible.',
        },
        activity: Object.freeze(activity),
    });
}

export const younarimasuChangeWorkshopPlugin: ActivityPlugin<YounarimasuChangeWorkshopModel, ChangeResponse> = {
    kind: 'academy-younarimasu-change-workshop',
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

function createVocabulary(): readonly LessonTenVocabularyEntry[] {
    return Object.freeze([
        { expression: 'だんだん', meaning: 'gradually' },
        { expression: '絶対(ぜったい)に', meaning: 'absolutely', note: 'The source prints “soon” in row 2 and “absolutely” in row 12. “Soon” is a source typo.' },
        { expression: 'リハビリ', meaning: 'rehabilitation' },
        { expression: '曲(きょく)', meaning: 'piece of music; song' },
        { expression: '曲(きょく)を 弾(ひ)きます', meaning: 'play a piece of music' },
        { expression: 'お茶(ちゃ)を たてます', meaning: 'prepare matcha' },
        { expression: '7時(じ)を 過(す)ぎます', meaning: 'pass seven o’clock' },
        { expression: 'やっと', meaning: 'finally' },
        { expression: '最近(さいきん)', meaning: 'recently' },
        { expression: '出来(でき)るだけ', meaning: 'as much as possible' },
        { expression: '必(かなら)ず', meaning: 'without fail; always' },
        { expression: 'この頃(ごろ)', meaning: 'these days' },
        { expression: 'かなり', meaning: 'fairly; considerably' },
        { expression: 'ほとんど', meaning: 'almost all; hardly (with a negative)' },
        { expression: '上手(じょうず)に', meaning: 'well; skillfully' },
    ].map(entry => Object.freeze(entry)));
}

function createRounds(): readonly ChangeRound[] {
    return Object.freeze([
        changeRound('natto', 1, 'なっとうが（　）なりました。', '食べます', '食べられるように'),
        changeRound('rehabilitation', 2, '毎日リハビリしたら（　）なりました。', '歩きます', '歩けるように'),
        changeRound('newspaper', 3, 'たくさん勉強しましたから、日本語の新聞が（　）なりました。', '読みます', '読めるように'),
        changeRound('news', 4, 'リスニングの練習をしたら、日本語のニュースが（　）なりました。', 'わかります', 'わかるように'),
        changeRound('ski', 5, '練習したらスキーが（　）なりました。', 'します', 'できるように'),
    ]);
}

function changeRound(id: string, sourceOrder: ChangeRound['sourceOrder'], stem: string, sourceVerb: string, answer: string): ChangeRound {
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `moodle:${MODULE_ID}:${ABILITY_SHA256}:pdf-p1:task-1:${sourceOrder}`,
        prompt: Object.freeze({ ja: `${stem}（${sourceVerb}）`, en: `Complete Sensei’s printed sentence: ${stem} (${sourceVerb})` }),
        stem,
        sourceVerb,
        answer,
        conceptId: `concept:l2-l36:younarimasu-change:${sourceOrder}`,
        errorTag: `l2-l36-younarimasu-change-${sourceOrder}`,
    });
}

function validateModel(model: YounarimasuChangeWorkshopModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.provenance?.packageId !== PACKAGE_ID || model.provenance.packageOrder !== PACKAGE_ORDER
        || model.provenance.sourcePackageStatus !== 'numbered-authored-package'
        || model.provenance.moodle.moduleId !== MODULE_ID || model.provenance.moodle.archiveSha256 !== ARCHIVE_SHA256) {
        issues.push({ path: 'provenance', message: 'The canonical Level 3+ Lesson 10 archive is required.' });
    }
    if (model.provenance.moodle.sourceSheets.length !== 19
        || model.provenance.moodle.sourceSheets.some((visual, index) => JSON.stringify(visual) !== JSON.stringify(L2_L36_LESSON_TEN_SOURCE_VISUALS[index]))) {
        issues.push({ path: 'provenance.moodle.sourceSheets', message: 'All nineteen SHA-pinned Lesson 10 teaching pages are required.' });
    }
    if (model.provenance.moodle.media.status !== 'worksheet-numbered-audio-pairing'
        || model.provenance.moodle.media.tracks.length !== 2
        || model.provenance.moodle.media.tracks.some((track, index) => JSON.stringify(track) !== JSON.stringify(L2_L36_LESSON_TEN_AUDIO[index]))) {
        issues.push({ path: 'provenance.moodle.media', message: 'The worksheet-linked B-5 and B-6 recordings are required.' });
    }
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id || model.provenance.answerVisibility !== 'after-attempt') {
        issues.push({ path: 'answerSupport', message: 'Answers must remain hidden until an attempt.' });
    }
    if (model.payload.vocabulary.length !== 15 || !model.payload.vocabulary.some(entry => entry.note?.includes('source typo'))) {
        issues.push({ path: 'payload.vocabulary', message: 'The corrected Chapter 36-2 source vocabulary is required.' });
    }
    if (model.payload.rounds.length !== 5 || model.payload.rounds.some((round, index) =>
        round.sourceOrder !== index + 1 || !text(round.prompt.en) || !text(round.prompt.ja)
        || !text(round.answer) || !model.conceptIds.includes(round.conceptId))) {
        issues.push({ path: 'payload.rounds', message: 'The five printed ability transformations are required.' });
    }
    validateFeedback(model.payload.feedback, issues);
    return issues;
}

function renderWorkshop(
    model: YounarimasuChangeWorkshopModel,
    host: ActivityHost,
    submit: (response: ChangeResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-state-inspection academy-younarimasu-change-workshop';
    root.dataset.activityId = model.id;

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(...localizedNodes(model.prompt));

    const vocabulary = document.createElement('section');
    vocabulary.className = 'academy-state-inspection-teaching';
    vocabulary.dataset.lessonPhase = 'vocabulary';
    const vocabularyHeading = document.createElement('h3');
    vocabularyHeading.textContent = host.language === 'ja' ? '先生の Chapter 36-2 語彙' : 'Sensei’s Chapter 36-2 vocabulary';
    const vocabularyList = document.createElement('dl');
    model.payload.vocabulary.forEach(entry => {
        const term = document.createElement('dt');
        term.lang = 'ja';
        term.textContent = entry.expression;
        const meaning = document.createElement('dd');
        meaning.textContent = entry.note ? `${entry.meaning} — ${entry.note}` : entry.meaning;
        vocabularyList.append(term, meaning);
    });
    vocabulary.append(vocabularyHeading, vocabularyList);

    const sources = document.createElement('section');
    sources.className = 'academy-state-inspection-sources';
    sources.dataset.lessonPhase = 'source-reference';
    model.provenance.moodle.sourceSheets.forEach(visual => sources.append(
        renderInspectableSourceVisual(visual, host.language, 'academy-state-inspection-source', 'lazy'),
    ));

    const listening = renderListening(model, host);
    const form = document.createElement('form');
    form.className = 'academy-state-inspection-form';
    form.setAttribute('aria-labelledby', heading.id);
    const list = document.createElement('ol');
    list.className = 'academy-state-inspection-rounds';
    model.payload.rounds.forEach(round => list.append(renderRound(model, round, host)));
    const check = document.createElement('button');
    check.type = 'submit';
    check.className = 'academy-button academy-button-primary';
    check.textContent = host.language === 'ja' ? '五つの文を確認する' : 'Check the five source sentences';
    form.append(list, check);

    const key = renderAnswerKey(model, host.language);
    const feedback = statusRegion('academy-kit-feedback academy-state-inspection-feedback');
    root.append(heading, vocabulary, sources, listening, form, key, feedback);
    host.replace(root);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const response = responseFromForm(model, form);
        if (!response) {
            feedback.textContent = host.language === 'ja' ? '五つの文に答えてください。' : 'Complete all five source sentences.';
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
                    const item = list.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`);
                    if (item) item.hidden = !evaluation.result.errorTags.includes(round.errorTag);
                });
            }
        }).catch(error => {
            setPending(form, false);
            feedback.textContent = error instanceof Error ? error.message : String(error);
        });
    }, { signal: lifecycle.signal });

    return {
        focus() { form.querySelector<HTMLInputElement>('input')?.focus(); },
        dispose() {
            lifecycle.abort();
            root.remove();
        },
    };
}

function renderListening(model: YounarimasuChangeWorkshopModel, host: ActivityHost): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-teaching academy-lesson-ten-listening';
    section.dataset.lessonPhase = 'listening';
    const heading = document.createElement('h3');
    heading.textContent = host.language === 'ja' ? '原本を見ながら聞く' : 'Listen with the original worksheet';
    const copy = document.createElement('p');
    copy.textContent = host.language === 'ja'
        ? '問題1は B-5、問題2は B-6 です。先に答えを予想してから、一つずつ聞いてください。'
        : 'Question 1 uses B-5 and question 2 uses B-6. Predict first, then listen to each recording.';
    section.append(heading, copy);
    model.provenance.moodle.media.tracks.forEach(track => {
        const figure = document.createElement('figure');
        const caption = document.createElement('figcaption');
        caption.textContent = `${host.language === 'ja' ? '問題' : 'Question'} ${track.worksheetQuestion} · ${track.label}`;
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'metadata';
        audio.src = track.url;
        audio.dataset.sourceSha256 = track.payloadSha256;
        audio.setAttribute('aria-label', `${track.label} · ${host.language === 'ja' ? 'Moodle 原音声' : 'original Moodle audio'}`);
        figure.append(caption, audio);
        section.append(figure);
    });
    return section;
}

function renderRound(model: YounarimasuChangeWorkshopModel, round: ChangeRound, host: ActivityHost): HTMLElement {
    const item = document.createElement('li');
    item.className = 'academy-state-inspection-round';
    item.dataset.roundId = round.id;
    const label = document.createElement('label');
    label.append(...localizedNodes(round.prompt));
    const input = document.createElement('input');
    input.type = 'text';
    input.lang = 'ja';
    input.name = fieldName(model, round);
    input.autocomplete = 'off';
    input.inputMode = 'text';
    input.dataset.roundControl = '';
    input.setAttribute('aria-label', host.language === 'ja' ? `${round.sourceOrder}番の答え` : `Answer ${round.sourceOrder}`);
    label.append(input);
    item.append(label);
    return item;
}

function renderAnswerKey(model: YounarimasuChangeWorkshopModel, language: 'ja' | 'en' | undefined): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-state-inspection-key';
    section.dataset.answerVisibility = 'after-attempt';
    section.hidden = true;
    const heading = document.createElement('h3');
    heading.textContent = language === 'ja' ? '試したあとの先生の答え' : 'Sensei’s answers after your attempt';
    const list = document.createElement('ol');
    model.payload.rounds.forEach(round => {
        const item = document.createElement('li');
        item.lang = 'ja';
        item.textContent = `${round.stem.replace('（　）', round.answer)}（${round.sourceVerb}）`;
        list.append(item);
    });
    section.append(heading, list);
    return section;
}

function responseFromForm(model: YounarimasuChangeWorkshopModel, form: HTMLFormElement): ChangeResponse | null {
    const data = new FormData(form);
    const answers = model.payload.rounds.map(round => {
        const value = data.get(fieldName(model, round));
        return typeof value === 'string' && value.trim() ? { roundId: round.id, value } : null;
    });
    return answers.every((answer): answer is { roundId: string; value: string } => answer !== null) ? { answers } : null;
}

function parseResponse(model: YounarimasuChangeWorkshopModel, response: ChangeResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Every Lesson 10 source transformation needs one response.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        if (!model.payload.rounds.some(round => round.id === answer.roundId) || answers.has(answer.roundId) || !text(answer.value)) {
            throw new TypeError('Lesson 10 responses must use every authored row exactly once.');
        }
        answers.set(answer.roundId, answer.value);
    });
    return answers;
}

function reviewSeed(round: ChangeRound, result: GradeResult): ReviewSeed {
    return {
        id: `review:l2-l36:younarimasu-change:${round.id}`,
        conceptId: round.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        sourceQuestionId: round.sourceQuestionId,
        content: { expression: round.answer, meanings: ['Sensei Lesson 10 potential form + ようになります transformation'] },
    };
}

function fieldName(model: YounarimasuChangeWorkshopModel, round: ChangeRound): string {
    return `${model.id}:${round.id}:answer`;
}
