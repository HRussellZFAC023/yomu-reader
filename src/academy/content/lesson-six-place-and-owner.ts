import lessonPackage from '../../../public/academy/content/lessons/007-l1-l06.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    PlaceLocationRound,
    PlaceOwnershipRound,
    PlaceOwnerWorkbookModel,
} from '../minigames/place-and-owner-workbook';
import type { SourceVocabularySheetModel } from '../minigames/source-vocabulary-sheet';

const PACKAGE_ID = 'l1-l06';
const MODULE_ID = 5860335;
const VOCABULARY_COMPONENT_ID = 'sensei-chapter-3-1-vocabulary';
const VOCABULARY_SHA256 = '29e7e4532cd23ba3153138d0a16b60228a50333d056ae51bd664b8851497b80c';
const GRAMMAR_SHA256 = '45db157c1c0c5bdfa5012f238189bdd2f85da3a098acb2d95b2321511fcf573b';
const AUDIO_9_SHA256 = '0449362eb519969bbf72ac6d059e1c3ef344c559b905d1fccfcdf4efe2390460';
const AUDIO_10_SHA256 = 'b19723f688559100d53e2ad71e277bedbea949253c6fc67195f33737fc057d20';
const GENKI_SHA256 = 'e54d3ea575725cfb771f9d9ed2d6b819c7edaa8850c8af1cdd793613012a7d99';
const GENKI_SCRIPT_SHA256 = 'e4d41714713102b1c1fe093588c397950fcadeaf1808d679f7bc93a1d56430d3';
const MINNA_TEXTBOOK_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
const MINNA_VIDEO_SHA256 = '7d0e2b3e0f7b66c44719b2a1dedc0f85ea19d8c3edcd6a5b4565f50d3c253460';

export function createLessonSixSourceVocabularyActivities(): readonly SourceVocabularySheetModel[] {
    const component = sourceVocabularyComponent();
    const provenance = record(component.provenance, 'l1-l06 vocabulary provenance');
    const sourceId = exactText(provenance.sourceId, 'l1-l06 vocabulary sourceId');
    const payloadSha256 = digest(provenance.payloadSha256, 'l1-l06 vocabulary payloadSha256');
    const sourceTitle = exactText(provenance.title, 'l1-l06 vocabulary title');
    if (sourceId !== `moodle-vocabulary:${MODULE_ID}:${VOCABULARY_SHA256}`
        || payloadSha256 !== VOCABULARY_SHA256 || sourceTitle !== 'Chapter 3-1 Vocabulary Sheet'
        || provenance.author !== 'Rie Tsuruta-Barratt' || provenance.pageCount !== 3
        || array(provenance.sourceMissingRowNumbers, 'l1-l06 missing rows').join(',') !== '27'
        || array(provenance.sourceBlankRows, 'l1-l06 blank rows').join(',') !== '40,41,42,43'
        || provenance.answerVisibility !== 'after-attempt') {
        throw new TypeError('Unexpected l1-l06 vocabulary source identity.');
    }

    const items = array(component.items, 'l1-l06 vocabulary items');
    if (items.length !== 38) throw new TypeError('The exact 38 nonblank l1-l06 vocabulary rows are required.');
    const itemIds = new Set<string>();
    let previousPage = 0;
    let previousRow = 0;
    const models = items.map((candidate, index): SourceVocabularySheetModel => {
        const item = record(candidate, `l1-l06 vocabulary row ${index + 1}`);
        const source = record(item.source, `l1-l06 vocabulary row ${index + 1} source`);
        const sourceQuestionId = exactText(source.itemId, `l1-l06 vocabulary row ${index + 1} itemId`);
        if (itemIds.has(sourceQuestionId)) throw new TypeError(`Duplicate l1-l06 vocabulary item ${sourceQuestionId}.`);
        itemIds.add(sourceQuestionId);
        if (source.payloadSha256 !== payloadSha256 || source.title !== sourceTitle
            || source.answerVisibility !== 'after-attempt') {
            throw new TypeError(`Vocabulary source identity changed for ${sourceQuestionId}.`);
        }
        const locus = record(source.locus, `${sourceQuestionId} locus`);
        const page = positiveInteger(locus.page, `${sourceQuestionId} page`);
        const row = positiveInteger(locus.row, `${sourceQuestionId} row`);
        if (page < previousPage || (page === previousPage && row <= previousRow)) {
            throw new TypeError('The l1-l06 vocabulary rows must remain in exact source order.');
        }
        if (row === 27 || row > 39) throw new TypeError('Source omissions must remain omissions.');
        previousPage = page;
        previousRow = row;
        const exact = record(source.exact, `${sourceQuestionId} exact fields`);
        const fieldProvenance = record(source.fieldProvenance, `${sourceQuestionId} field provenance`);
        return Object.freeze({
            id: `authored:${PACKAGE_ID}/${VOCABULARY_COMPONENT_ID}:p${page}:r${row}`,
            kind: 'academy-source-vocabulary-sheet',
            sourceQuestionId,
            conceptIds: [`concept:${PACKAGE_ID}:${VOCABULARY_COMPONENT_ID}:p${page}:r${row}`],
            responseKind: 'source-vocabulary-recall',
            prompt: {
                ja: '先生の行を見て、意味を思い出してから確認しましょう。',
                en: 'Read the teacher row, recall its meaning, then check it.',
            },
            answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
            provenance: {
                packageId: PACKAGE_ID,
                componentId: VOCABULARY_COMPONENT_ID,
                sourceId,
                sourceQuestionId,
                payloadSha256,
                sourceTitle,
                locus: { page, row },
            },
            payload: {
                exact: {
                    words: exactText(exact.words, `${sourceQuestionId} exact words`),
                    pronunciation: nullableText(exact.pronunciation, `${sourceQuestionId} exact pronunciation`),
                    meaning: nullableText(exact.meaning, `${sourceQuestionId} exact meaning`),
                },
                support: {
                    words: exactText(item.ja, `${sourceQuestionId} support words`),
                    reading: exactText(item.reading, `${sourceQuestionId} support reading`),
                    meaning: exactText(item.en, `${sourceQuestionId} support meaning`),
                },
                fieldProvenance: {
                    words: exactText(fieldProvenance.words, `${sourceQuestionId} words provenance`),
                    reading: exactText(fieldProvenance.reading, `${sourceQuestionId} reading provenance`),
                    meaning: exactText(fieldProvenance.meaning, `${sourceQuestionId} meaning provenance`),
                },
            },
        });
    });
    const loci = models.map(model => `${model.provenance.locus.page}:${model.provenance.locus.row}`);
    const expected = [
        ...range(1, 14).map(row => `1:${row}`),
        ...range(15, 26).map(row => `2:${row}`),
        '2:28', '2:29',
        ...range(30, 39).map(row => `3:${row}`),
    ];
    if (loci.join(',') !== expected.join(',')) throw new TypeError('The l1-l06 source row gaps or page boundaries changed.');
    return Object.freeze(models);
}

export function createLessonSixPlaceAndOwnerModel(): PlaceOwnerWorkbookModel {
    assertExactPackageSources();
    const rounds = Object.freeze([
        locationRound(1, 'takeshi-place', 'A：たけしさんはどこですか。', {
            ja: 'たけしさんは A と B の どちらからも とおいです。',
            en: 'Takeshi is far from both A and B.',
        }, 'far', ['あそこです', 'たけしさんはあそこです']),
        locationRound(2, 'sue-place', 'A：スーさんはどこですか。', {
            ja: 'スーさんは A の となりです。あなたは B です。',
            en: 'Sue is next to A. You are B.',
        }, 'listener', ['そこです', 'スーさんはそこです']),
        locationRound(3, 'robert-place', 'A：ロバートさんはどこですか。', {
            ja: 'ロバートさんは B の となりです。あなたは B です。',
            en: 'Robert is next to B. You are B.',
        }, 'speaker', ['ここです', 'ロバートさんはここです']),
        locationRound(4, 'toilet-place', 'A：トイレはどこですか。', {
            ja: 'トイレは A と B の どちらからも とおいです。',
            en: 'The toilet is far from both A and B.',
        }, 'far', ['あそこです', 'トイレはあそこです']),
        ownerRound(5, 'hat-owner', 'ぼうし — in your hand', {
            ja: 'ぼうしは あなたの ての中です。みちこさんに だれのものか ききます。',
            en: 'The hat is in your hand. Ask Michiko whose it is.',
        }, 'これ', 'ぼうし', ownerAnswers('これ', 'ぼうし', '帽子'), 'それはたけしさんのぼうしです'),
        ownerRound(6, 'wallet-owner', 'さいふ — in your hand', {
            ja: 'さいふは あなたの ての中です。みちこさんに だれのものか ききます。',
            en: 'The wallet is in your hand. Ask Michiko whose it is.',
        }, 'これ', 'さいふ', ownerAnswers('これ', 'さいふ', '財布'), 'それはわたしのさいふです'),
        ownerRound(7, 'umbrella-owner', 'かさ — far from both', {
            ja: 'かさは 二人から とおいです。みちこさんに だれのものか ききます。',
            en: 'The umbrella is far from both people. Ask Michiko whose it is.',
        }, 'あれ', 'かさ', ownerAnswers('あれ', 'かさ', '傘'), 'あれはメアリーさんのかさです'),
    ]);
    const model: PlaceOwnerWorkbookModel = {
        id: 'activity:l1-l06-place-and-owner-workbook',
        kind: 'academy-place-and-owner-workbook',
        responseKind: 'mixed-place-owner-workbook',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '場所を四つ答えてから、「だれの」の質問を三つ組み立てましょう。',
            en: 'Answer four place questions, then assemble three だれの questions.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                grammar: {
                    sourceId: `moodle-payload:${GRAMMAR_SHA256}`,
                    payloadSha256: GRAMMAR_SHA256,
                    sourceTitle: 'Chapter 3-1 Grammar Exercise',
                    member: 'Handouts/Chapter 3-1_Grammar Exercise.pdf',
                    author: 'Rie Tsuruta-Barratt',
                    pages: [1, 2, 3, 4, 5, 6],
                },
                audioMembers: [
                    audio('9 A-9', AUDIO_9_SHA256, 'audio materials/9 A-9.mp3', 78.013333),
                    audio('10 A-10', AUDIO_10_SHA256, 'audio materials/10 A-10.mp3', 58.946667),
                ],
                transcriptStatus: 'not-provided-do-not-invent',
            },
            minna: {
                reference: 'Minna no Nihongo I, Lesson 3',
                relation: 'course-sequence-and-byte-identified-primary-sources',
                textbook: {
                    sourceId: `japanese-minna-pdf:${MINNA_TEXTBOOK_SHA256}`,
                    payloadSha256: MINNA_TEXTBOOK_SHA256,
                    title: 'Minna no Nihongo 2nd Edition Shokyu I',
                    author: '3A Network',
                    pageCount: 326,
                    locusStatus: 'scanned-pdf-no-text-locus-do-not-invent',
                },
                conversation: {
                    sourceId: `japanese-minna-video:${MINNA_VIDEO_SHA256}`,
                    payloadSha256: MINNA_VIDEO_SHA256,
                    title: 'Minna no Nihongo Shokyu I Dai 2-Han Kaiwa 03',
                    relativePath: 'Minna no Nihongo Shokyu DVD I, II/Minna no Nihongo Shokyu I Dai 2-Han Kaiwa/03.mp4',
                    durationSeconds: 67.413333,
                },
                transcriptStatus: 'not-provided-do-not-invent',
            },
            genki: {
                sourceId: `japanese-genki-interactive:${GENKI_SHA256}:generateQuiz`,
                taskId: 'genki-2e:l1-l06:lesson-2-workbook-4',
                relativePath: 'lessons/lesson-2/workbook-4/index.html',
                payloadSha256: GENKI_SHA256,
                scriptSha256: GENKI_SCRIPT_SHA256,
                lineLocus: { start: 76, end: 152 },
                engine: 'Genki.generateQuiz',
                sourceType: 'fill',
                responseAdaptation: 'exact-prompts-answer-variants-and-order-with-yomu-mixed-spatial-choice-and-phrase-assembly',
            },
        },
        payload: {
            teaching: [
                {
                    sourceOrder: 1,
                    pattern: 'ここ・そこ・あそこ',
                    rule: {
                        ja: 'ここは話し手の場所、そこは聞き手の場所、あそこは二人から遠い場所です。同じ場所を共有するとき、そこは二人から少し離れた場所になります。',
                        en: 'ここ is the speaker’s place, そこ the listener’s place, and あそこ a place far from both. If both people share one territory, そこ moves to a place a little away from them.',
                    },
                    example: 'ここは がっこうです。／そこは トイレです。／あそこは うけつけです。',
                    source: 'moodle-place-rule',
                },
                {
                    sourceOrder: 2,
                    pattern: 'Noun は どこですか',
                    rule: {
                        ja: '場所を聞くときは「Noun は どこですか」。答えは「ここ／そこ／あそこ です」で十分です。',
                        en: 'Ask a location with Noun は どこですか. A complete short answer is ここ, そこ, or あそこ plus です.',
                    },
                    example: 'エレベーターは どこですか。— そこです。',
                    source: 'moodle-location-question',
                },
                {
                    sourceOrder: 3,
                    pattern: 'Lesson 3 place sequence',
                    rule: {
                        ja: 'Minna の第3課も、場所を指して聞く流れを学習順序として確認します。本文の未確認の言い方は作りません。',
                        en: 'Minna Lesson 3 corroborates the place-and-shopping sequence. Its scanned text and video are byte-identified, but no unverified wording is supplied.',
                    },
                    example: 'ここ・そこ・あそこ・どこ',
                    source: 'minna-sequence',
                },
                {
                    sourceOrder: 4,
                    pattern: 'これは／あれは だれの Noun ですか',
                    rule: {
                        ja: '手元の物には「これは」、二人から遠い物には「あれは」を使い、「だれの＋物」で持ち主を聞きます。',
                        en: 'Use これは for an item in your hand and あれは for one far from both people, then ask its owner with だれの + item.',
                    },
                    example: 'これは だれの ほんですか。',
                    source: 'genki-owner-task',
                },
            ],
            positions: [
                { id: 'speaker', label: { ja: 'ここ', en: 'here by B' } },
                { id: 'listener', label: { ja: 'そこ', en: 'there by A' } },
                { id: 'far', label: { ja: 'あそこ', en: 'far from both' } },
            ],
            ownerPointers: ['これ', 'あれ'],
            ownerItems: ['ぼうし', 'さいふ', 'かさ'],
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: 'Genki の七つの問題を、元の順番と視点どおりに答えました。',
                        en: 'All seven Genki source slots match their original order and viewpoint.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '場所か持ち物の視点が違う問題があります。',
                        en: 'At least one place or ownership answer uses the wrong viewpoint.',
                    },
                    repairPrompt: {
                        ja: 'A と B のどちらに近いか、または二人から遠いかを確認し、違う問題だけ直しましょう。',
                        en: 'Check whether the target is near A, near B, or far from both, then repair only the missed slots.',
                    },
                    nearbyExample: {
                        ja: 'B のそば → ここです。手元のぼうし → これは だれの ぼうしですか。',
                        en: 'Next to B gives ここです; a hat in your hand begins これは.',
                    },
                },
            },
        },
    };
    return Object.freeze(model);
}

function locationRound(
    sourceOrder: number,
    id: string,
    sourcePrompt: string,
    context: { readonly ja: string; readonly en: string },
    correctPositionId: PlaceLocationRound['correctPositionId'],
    acceptedAnswers: readonly string[],
): PlaceLocationRound {
    return Object.freeze({
        mode: 'location-choice',
        id,
        sourceOrder,
        sourceQuestionId: sourceQuestionId(sourceOrder),
        sourcePrompt,
        context,
        correctPositionId,
        acceptedAnswers: Object.freeze([...acceptedAnswers]),
        answerSentence: acceptedAnswers[0],
        conceptId: `concept:l1-l06:place-owner:${id}`,
        errorTag: `l1-l06-place-owner-${id}`,
    });
}

function ownerRound(
    sourceOrder: number,
    id: string,
    sourcePrompt: string,
    context: { readonly ja: string; readonly en: string },
    correctPointer: PlaceOwnershipRound['correctPointer'],
    correctItem: PlaceOwnershipRound['correctItem'],
    acceptedAnswers: readonly string[],
    sourceReply: string,
): PlaceOwnershipRound {
    return Object.freeze({
        mode: 'owner-phrase',
        id,
        sourceOrder,
        sourceQuestionId: sourceQuestionId(sourceOrder),
        sourcePrompt,
        context,
        correctPointer,
        correctItem,
        acceptedAnswers: Object.freeze([...acceptedAnswers]),
        sourceReply,
        conceptId: `concept:l1-l06:place-owner:${id}`,
        errorTag: `l1-l06-place-owner-${id}`,
    });
}

function ownerAnswers(pointer: 'これ' | 'あれ', kana: string, kanji: string): readonly string[] {
    return [
        `${pointer}はだれの${kana}ですか`,
        `${pointer}はだれの${kanji}ですか`,
        `${pointer}は誰の${kanji}ですか`,
        `${pointer}は誰の${kana}ですか`,
    ];
}

function sourceQuestionId(order: number): string {
    return `genki-2e:l1-l06:lesson-2-workbook-4:slot-${order}`;
}

function audio(title: string, payloadSha256: string, member: string, durationSeconds: number) {
    return Object.freeze({
        title,
        sourceId: `moodle-payload:${payloadSha256}`,
        payloadSha256,
        member,
        durationSeconds,
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l06 package');
    const identity = record(root.identity, 'l1-l06 identity');
    if (root.id !== PACKAGE_ID || identity.moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l06 package identity.');
    const coverage = record(root.sourceCoverage, 'l1-l06 source coverage');
    const members = array(coverage.members, 'l1-l06 source members').map((member, index) =>
        record(member, `l1-l06 source member ${index}`));
    for (const [payload, title] of [
        [VOCABULARY_SHA256, 'Chapter 3-1 Vocabulary Sheet'],
        [GRAMMAR_SHA256, 'Chapter 3-1 Grammar Exercise'],
        [AUDIO_9_SHA256, '9 A-9'],
        [AUDIO_10_SHA256, '10 A-10'],
    ] as const) {
        const matches = members.filter(member => member.payloadSha256 === payload && member.title === title);
        if (matches.length !== 1) throw new TypeError(`Expected one exact l1-l06 source member for ${payload}.`);
    }
    const map = array(coverage.coverageMap, 'l1-l06 coverage map').map((item, index) =>
        record(item, `l1-l06 coverage item ${index}`));
    for (const [payload, seconds] of [[AUDIO_9_SHA256, 78.013333], [AUDIO_10_SHA256, 58.946667]] as const) {
        const match = map.find(item => item.payloadSha256 === payload);
        const trace = match ? record(match.sourceTrace, `${payload} trace`) : null;
        const probe = trace ? record(trace.audioProbe, `${payload} probe`) : null;
        if (probe?.durationSeconds !== seconds || probe.codec !== 'mp3' || probe.status !== 'probed') {
            throw new TypeError(`Unexpected l1-l06 audio probe for ${payload}.`);
        }
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l06 Genki activities').map((activity, index) =>
        record(activity, `l1-l06 Genki activity ${index}`));
    const activity = activities.find(candidate => candidate.id === 'genki-2e:l1-l06:lesson-2-workbook-4');
    if (!activity) throw new TypeError('Expected the exact mapped l1-l06 Genki workbook task.');
    const source = record(activity.source, 'l1-l06 Genki source');
    const task = record(activity.exactTask, 'l1-l06 Genki task');
    const config = record(task.config, 'l1-l06 Genki config');
    const quizlet = exactText(config.quizlet, 'l1-l06 Genki quizlet');
    const sourceAnswers = [
        'あそこです', 'たけしさんはあそこです', 'そこです', 'スーさんはそこです',
        'ここです', 'ロバートさんはここです', 'トイレはあそこです',
        ...ownerAnswers('これ', 'ぼうし', '帽子'),
        ...ownerAnswers('これ', 'さいふ', '財布'),
        ...ownerAnswers('あれ', 'かさ', '傘'),
    ];
    if (source.payloadSha256 !== GENKI_SHA256 || source.scriptSha256 !== GENKI_SCRIPT_SHA256
        || task.engine !== 'Genki.generateQuiz' || task.exerciseOrderPreserved !== true
        || config.type !== 'fill' || !exactText(config.info, 'l1-l06 Genki info').includes('ここ, そこ, あそこ')
        || !sourceAnswers.every(answer => quizlet.includes(answer))) {
        throw new TypeError('Unexpected l1-l06 Genki source task.');
    }
}

function sourceVocabularyComponent(): Readonly<Record<string, unknown>> {
    const root = record(lessonPackage, 'l1-l06 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l06 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l1-l06 package identity.');
    }
    const matches = array(root.components, 'l1-l06 components').map((component, index) =>
        record(component, `l1-l06 component ${index}`)).filter(component => {
        if (component.type !== 'vocabulary') return false;
        return record(component.provenance, 'l1-l06 component provenance').payloadSha256 === VOCABULARY_SHA256;
    });
    if (matches.length !== 1) throw new TypeError('Expected one exact l1-l06 source vocabulary component.');
    return matches[0];
}

function range(start: number, end: number): number[] {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}

function exactText(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be nonempty text.`);
    return value;
}

function nullableText(value: unknown, label: string): string | null {
    return value === null ? null : exactText(value, label);
}

function positiveInteger(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new TypeError(`${label} must be a positive integer.`);
    }
    return value;
}

function digest(value: unknown, label: string): string {
    const result = exactText(value, label);
    if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`${label} must be a SHA-256 digest.`);
    return result;
}
