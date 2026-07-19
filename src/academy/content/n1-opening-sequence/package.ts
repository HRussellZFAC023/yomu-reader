import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { MiningRequest } from '../../integration/yomu-bridge';
import {
    N1_OPENING_SEQUENCE_AUTHORED,
    N1_OPENING_SEQUENCE_DELIVERED_SOURCE,
    N1_OPENING_SEQUENCE_PACKAGE_ID,
    N1_OPENING_SEQUENCE_PROVENANCE,
} from './source';
import type {
    N1OpeningSequenceModality,
    N1OpeningSequencePackage,
    N1OpeningSequencePrerequisite,
    N1OpeningSequenceProductionCheckId,
    N1OpeningSequenceReaderSrsProjection,
    N1OpeningSequenceStimulusRole,
} from './types';

const CONCEPT_DEMAND_VS_EXCLUSION = 'reading:n1-demand-vs-exclusion';
const CONCEPT_DISCOURSE_CONTRAST = 'reading:n1-discourse-contrast-tracking';
const CONCEPT_SOURCE_CONTRAST = 'reading:n1-source-visible-invisible-contrast';
const CONCEPT_SUCCESSION_REGISTER = 'grammar:n1-immediate-succession-register';
const CONCEPT_PRIORITY_UPDATE = 'listening:n1-priority-task-update';
const CONCEPT_SOURCE_LISTENING_DETAIL = 'listening:n1-source-broadcast-detail-check';
const CONCEPT_BOUNDED_RECOMMENDATION = 'production:n1-evidence-bounded-recommendation';

const PREREQUISITES: readonly N1OpeningSequencePrerequisite[] = Object.freeze([
    prerequisite(
        'grammar:n2-immediate-totan',
        '「〜とたんに」で二つの出来事の直後関係を追える。',
        'Can follow immediate succession expressed with totan ni.',
    ),
    prerequisite(
        'reading:n2-contrast-ippou',
        '「〜一方で」の前後を別々の主張として読み分けられる。',
        'Can keep the two sides of an ippou-de contrast separate while reading.',
    ),
    prerequisite(
        'listening:n2-task-order',
        '指示を聞いて、やるべきことの順番を組み立てられる。',
        'Can reconstruct task order from spoken instructions.',
    ),
]);

export function createN1OpeningSequencePackage(): N1OpeningSequencePackage {
    const authored = N1_OPENING_SEQUENCE_AUTHORED;
    const source = N1_OPENING_SEQUENCE_DELIVERED_SOURCE;
    const audio = N1_OPENING_SEQUENCE_PROVENANCE.deliveredAudio;
    const activity = Object.freeze({
        id: 'activity:n1-opening-sequence',
        kind: 'academy-n1-opening-sequence' as const,
        sourceQuestionId: N1_OPENING_SEQUENCE_PROVENANCE.sourceSetId,
        conceptIds: [
            CONCEPT_DEMAND_VS_EXCLUSION,
            CONCEPT_DISCOURSE_CONTRAST,
            CONCEPT_SOURCE_CONTRAST,
            CONCEPT_SUCCESSION_REGISTER,
            CONCEPT_PRIORITY_UPDATE,
            CONCEPT_SOURCE_LISTENING_DETAIL,
            CONCEPT_BOUNDED_RECOMMENDATION,
        ],
        responseKind: 'n1-opening-sequence-v1' as const,
        curriculumPhase: 'assessed-production' as const,
        prompt: {
            ja: '正確な原典を読み・聞いてから、よむが作った転移課題に取り組み、根拠の範囲を守った提言までたどり着きましょう。',
            en: 'Read and listen to the exact source anchors, then work through the original Yomu transfer task and write a recommendation that stays within the evidence.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        provenance: N1_OPENING_SEQUENCE_PROVENANCE,
        payload: {
            prerequisiteRefresh: [
                refresh(
                    'grammar:n2-immediate-totan',
                    'N2の「〜とたんに」は話し言葉でも使える直後表現でした。N1では、書き言葉に寄った「〜が早いか」「〜や否や」「〜なり」を、文体と主語の性質で選び分けます。',
                    'At N2, totan ni provided a broadly used immediate-succession pattern. At N1 you distinguish ga hayai ka, ya ina ya, and nari by register and event structure.',
                    'ドアを開けたとたんに、風が吹き込んだ。',
                    'authored',
                ),
                refresh(
                    'reading:n2-contrast-ippou',
                    'N2では「〜一方で」の前後を分けて読みました。N1の評論・読み物では、対比の両側が同じ文章の中で並置され、地理的な対比のような具体例にも応用されます。',
                    'At N2 you separated the two sides of ippou de. In N1 essays and readings, both sides of a contrast are placed within the same passage, including concrete cases like a geographic contrast.',
                    source.tobiraBridgeSentence,
                    'exact-source-tobira',
                ),
                refresh(
                    'listening:n2-task-order',
                    'N2では指示の順番を聞き取りました。N1の課題理解では、途中で届いた新情報がどの作業を最優先に押し上げるかまで判断します。',
                    'At N2 you tracked task order. N1 task comprehension asks which task a mid-conversation update pushes to the top.',
                    'まず資料を配って、それから会場を開けてください。',
                    'authored',
                ),
            ],
            reading: {
                sourceAnchor: {
                    title: {
                        ja: `${source.readingAnchorTitleJa}（新完全マスター読解 N1・原文）`,
                        en: 'Contrast: grasping the whole passage (exact Shin Kanzen Reading N1 excerpt)',
                    },
                    paragraphs: source.readingAnchorParagraphs,
                    authorship: 'exact-source-shin-kanzen-reading' as const,
                },
                transfer: {
                    title: { ja: authored.readingTitleJa, en: 'The people the cooling centre did not count' },
                    paragraphs: authored.readingParagraphs,
                    authorship: 'original-yomu-n1-reading' as const,
                },
            },
            grammar: {
                title: { ja: '直後を表す三つの書き言葉（新完全マスター文法 N1 の例文）', en: 'Three written forms for immediate succession (exact Shin Kanzen Grammar N1 examples)' },
                forms: [
                    form(
                        'ga-hayai-ka',
                        '〜が早いか',
                        source.grammarExamples[0],
                        '書き言葉・報道や物語の地の文に多く、会話では硬すぎます。',
                        'Written style, common in narrative and reportage; too stiff for conversation.',
                        '前件と後件の主語が同じ場合にも異なる場合にも使えます。主語より、二つの出来事の間隔の短さに焦点があります。',
                        'The two clauses may have the same or different subjects; the focus is the near-zero interval between events.',
                        '後件には実際に起きた、やや意外な出来事が来ます。意向・命令・依頼には使えません。',
                        'The second clause reports an actual, somewhat unexpected event; intentions, commands, and requests are excluded.',
                    ),
                    form(
                        'ya-ina-ya',
                        '〜や／〜や否や',
                        source.grammarExamples[1],
                        '最も文語的で、論説文や記録文に現れます。「〜や」は「〜や否や」の短い形です。',
                        'The most literary of the three, found in essays and records; ya is the shorter form of ya ina ya.',
                        '前件の主語は人でも催しや窓口などの事態でもよく、後件は別の主体の反応でも構いません。',
                        'The trigger may be a person or an event such as an opening, and the second clause may be another party\'s reaction.',
                        '後件には予想外・制御できない展開が来ることが多く、話し手の計画には使いません。',
                        'The second clause is typically an unexpected or uncontrolled development, never the speaker\'s own plan.',
                    ),
                    form(
                        'nari',
                        '〜なり',
                        source.grammarExamples[2],
                        '書き言葉寄りですが、観察を語る文章では会話の引用にも入り込みます。',
                        'Leans written, though it appears in quoted observation of others.',
                        '前件と後件の主語は同じで、ふつう話し手以外の人の意外な行動を外から描写します。',
                        'Both clauses share one subject, usually someone other than the speaker, whose surprising move is observed from outside.',
                        '直後の一回の行動を描き、命令文や自分の予定には使えません。',
                        'It frames one immediate action; commands and one\'s own schedule are excluded.',
                    ),
                ],
            },
            listening: {
                sourceAudio: {
                    title: { ja: '正確な原典音声（日本語総まとめ N1 聴解, CD1-55）', en: 'Exact source audio (Nihongo So-matome N1 Listening, CD1 track 55)' },
                    packageUrl: audio.packageUrl,
                    sha256: audio.sha256,
                    byteLength: audio.byteLength,
                    durationSeconds: audio.durationSeconds,
                    track: audio.track,
                    transcript: source.listeningSourceTranscript,
                    rationale: authored.sourceListeningRationale,
                    authorship: 'exact-source-somatome-listening' as const,
                },
                transfer: {
                    title: { ja: '職場アップデート: 試行報告の準備', en: 'Workplace update: preparing the pilot report' },
                    scenario: {
                        ja: '係長が部下に、涼み処試行の報告書づくりの状況変化を伝えます。聞こえた内容だけを根拠に答えてください。',
                        en: 'A supervisor updates a staff member on the cooling-centre pilot report. Answer only from what you hear.',
                    },
                    script: authored.listeningScript,
                    authorship: 'original-yomu-n1-listening' as const,
                },
            },
            production: {
                prompt: {
                    ja: '涼み処の試行を続ける・広げるかどうか、よむの転移本文と業務連絡の根拠を使って提言を書いてください。',
                    en: 'Recommend whether and how to continue or expand the cooling-centre pilot, using evidence from the Yomu transfer reading and workplace update.',
                },
                guidance: {
                    ja: 'これは限定された自動チェックです。長さ、需要と到達の両方への言及、限定表現、暫定的な次の一歩の四点だけを機械的に確認し、文章力そのものは評価しません。',
                    en: 'This is a constrained deterministic check, not a general writing assessment. It verifies only four things mechanically: length band, evidence from both the demand side and the access side, a qualification marker, and a provisional next step without overclaiming.',
                },
                fieldLabel: { ja: '根拠を守った提言', en: 'Evidence-bounded recommendation' },
                authorship: 'learner-authored-deterministically-checked' as const,
                minLengthChars: 70,
                maxLengthChars: 180,
                demandAnchors: ['受付簿', '利用者数', '需要', '定員に達した'],
                accessAnchors: ['徒歩', '送迎', '来られない', '戸別訪問', '記録の外'],
                contrastMarkers: ['一方', 'とはいえ', 'ものの', 'にもかかわらず', 'ただし', 'しかし'],
                provisionalMarkers: ['まずは', '当面', '次の段階', 'のが望ましい', 'べきだろう', 'てはどうか', 'ことから始め'],
                overclaimTerms: ['必ず', '絶対に', '間違いなく', '疑いなく', '完全に解決'],
                checks: [
                    check('length-band', 'production-length-band',
                        '長さが70〜180字（空白を除く）に収まっている。',
                        'Length falls in the 70–180 character band (whitespace excluded).'),
                    check('evidence-balance', 'production-evidence-balance',
                        '需要側と到達側の両方の根拠に触れている。',
                        'Mentions evidence from both the demand side and the access side.'),
                    check('qualification-marker', 'production-qualification-marker',
                        '対比・限定の標識を少なくとも一つ使っている。',
                        'Uses at least one contrast or qualification marker.'),
                    check('provisional-no-overclaim', 'production-provisional-no-overclaim',
                        '暫定的な提言の標識があり、断定しすぎる語を使っていない。',
                        'Marks the recommendation as provisional and avoids overclaiming terms.'),
                ],
                modelAnswer: authored.productionModelAnswer,
            },
            questions: [
                question('rs1', 'reading', 'source-reading',
                    '本文が対比しているのはどのような二つの状態ですか。',
                    'What two states does the passage contrast?',
                    [
                        opt('visible-vs-invisible-control', '目にみえる権力やモラルによる規制と、目にみえない情報による支配。', 'Regulation by visible power and morals versus control by invisible information.'),
                        opt('info-scarcity-vs-overload', '昔の情報不足と、今の情報過多。', 'Past information scarcity versus present information overload.'),
                        opt('material-poverty-vs-wealth', '昔の物質的な貧しさと、今の経済的な豊かさ。', 'Past material poverty versus present economic wealth.'),
                    ],
                    'visible-vs-invisible-control', 'reading-source-contrast'),
                question('rs2', 'reading', 'source-reading',
                    '本文の内容から論理的に導ける説明として正しいものはどれですか。',
                    'Which explanation follows logically from the passage?',
                    [
                        opt('harder-to-build-autonomy', '見えない情報に支配される今の方が、主体性と価値観を築くのが難しい。', 'Now that control comes from invisible information, it is harder to build autonomy and values.'),
                        opt('easier-because-invisible', '規制が目に見えなくなった分、今の方が人は自由に主体性を築きやすい。', 'Because the regulation is no longer visible, people can now build autonomy more freely.'),
                        opt('no-regulation-now', '権力やモラルによる規制は、今はまったく存在しない。', 'Regulation by power and morals no longer exists at all today.'),
                    ],
                    'harder-to-build-autonomy', 'reading-source-invalid-inference'),
                question('r1', 'reading', 'transfer-reading',
                    '本文の中心的な主張はどれですか。',
                    'What is the central claim of the passage?',
                    [
                        opt('separate-records', '利用者数と、来られなかった人の事情は別々の資料として扱うべきだ。', 'Attendance and the circumstances of those who could not come must be treated as separate records.'),
                        opt('pilot-failed', '涼み処の開放は失敗であり、直ちに中止すべきだ。', 'The cooling-centre opening failed and should be stopped at once.'),
                        opt('numbers-prove-safety', '利用者数が多ければ地域全体の安全は確保されたといえる。', 'High attendance shows that community-wide safety was secured.'),
                    ],
                    'separate-records', 'reading-thesis-scope'),
                question('r2', 'reading', 'transfer-reading',
                    '「扉を開けるや否や定員に達した日もあった一方」という部分の談話上の役割はどれですか。',
                    'What discourse role does the clause about reaching capacity as soon as the doors opened play?',
                    [
                        opt('contrast-first-half', '需要の証拠を示しつつ、続く限界の指摘と対になる対比の前半。', 'The first half of a contrast: evidence of demand paired with the limitation that follows.'),
                        opt('success-conclusion', '施策が成功したという最終的な結論。', 'The final conclusion that the policy succeeded.'),
                        opt('schedule-proposal', '開放時間を変更するべきだという提案。', 'A proposal to change the opening hours.'),
                    ],
                    'contrast-first-half', 'reading-contrast-role'),
                question('r3', 'reading', 'transfer-reading',
                    '「その数字が含まない人」とは、どのような人ですか。',
                    'Who are "the people the number does not include"?',
                    [
                        opt('excluded-residents', '会場まで移動できず、最初から記録に現れない住民。', 'Residents who cannot travel to the site and never appear in the records.'),
                        opt('repeat-visitors', '受付簿に繰り返し名を連ねた高齢者。', 'Older adults who signed the reception sheet repeatedly.'),
                        opt('cooled-households', '冷房のある住宅に住んでいて来る必要のない世帯。', 'Households with air conditioning who never needed to come.'),
                    ],
                    'excluded-residents', 'reading-excluded-referent'),
                question('g1', 'grammar', 'grammar',
                    '「〜なり」の使い方として適切な文はどれですか。',
                    'Which sentence uses nari appropriately?',
                    [
                        opt('nari-observed', '部長は電話を切るなり、会議室へ向かった。', 'The department head hung up and, the moment he did, headed for the meeting room.'),
                        opt('nari-intention', '私は家に着くなり、シャワーを浴びるつもりだ。', 'I intend to shower as soon as I get home.'),
                        opt('nari-command', '資料が届くなり、すぐ破棄してください。', 'Please discard the documents as soon as they arrive.'),
                    ],
                    'nari-observed', 'grammar-nari'),
                question('g2', 'grammar', 'grammar',
                    '「〜や否や」の説明として正しいものはどれですか。',
                    'Which description of ya ina ya is accurate?',
                    [
                        opt('ya-ina-ya', '硬い書き言葉で、前件が成立するとほぼ同時に後件が起きた事実を述べる。', 'In formal written style, it reports that the second event occurred almost as soon as the first was established.'),
                        opt('ga-hayai-ka-wrong', '前件と後件の主語が必ず同じでなければならない。', 'The two clauses must always have the same subject.'),
                        opt('nari-wrong', 'これからする予定や、相手への依頼にも使える。', 'It can describe a future plan or a request to the listener.'),
                    ],
                    'ya-ina-ya', 'grammar-ya-ina-ya'),
                question('g3', 'grammar', 'grammar',
                    '「〜が早いか」が使える文はどれですか。',
                    'In which sentence can ga hayai ka be used?',
                    [
                        opt('hayaika-observed', 'ベルが鳴るのを聞くが早いか、生徒たちは廊下へ駆け出した。', 'The instant they heard the bell, the students dashed into the corridor.'),
                        opt('hayaika-future', '明日は会議が終わるが早いか帰宅しようと思う。', 'Tomorrow I plan to head home the moment the meeting ends.'),
                        opt('hayaika-request', '雨が降るが早いか、窓を閉めてください。', 'Please close the windows the moment it rains.'),
                    ],
                    'hayaika-observed', 'grammar-ga-hayai-ka'),
                question('ls1', 'listening', 'source-listening',
                    source.listeningSourceQuestionPromptJa,
                    'Which statement does not match the broadcast?',
                    [
                        opt(source.listeningSourceOptions[0].id, source.listeningSourceOptions[0].ja, 'Northern Okinawa observed seismic intensity 4.'),
                        opt(source.listeningSourceOptions[1].id, source.listeningSourceOptions[1].ja, 'A tsunami warning was issued for Okinawa.'),
                        opt(source.listeningSourceOptions[2].id, source.listeningSourceOptions[2].ja, 'The earthquake occurred at about 5:41 a.m.'),
                        opt(source.listeningSourceOptions[3].id, source.listeningSourceOptions[3].ja, 'A three-metre tsunami is predicted.'),
                    ],
                    source.listeningSourceCorrectOptionId, 'listening-source-tsunami-mismatch',
                    authored.sourceListeningRationale),
                question('l1', 'listening', 'transfer-listening',
                    '音声の指示によると、この後まず何をしますか。',
                    'According to the update, what is the first task now?',
                    [
                        opt('send-criteria', '分類基準の案を福祉課に送る。', 'Send the draft classification criteria to the welfare department.'),
                        opt('anonymise-first', '自由記述の回答の匿名化を始める。', 'Start anonymising the free-text responses.'),
                        opt('merge-records', '訪問記録と受付簿を一つにまとめる。', 'Merge the visit records with the reception sheet.'),
                    ],
                    'send-criteria', 'listening-first-priority'),
                question('l2', 'listening', 'transfer-listening',
                    '記録をすぐに一つにまとめてはいけないのはなぜですか。',
                    'Why must the records not be merged immediately?',
                    [
                        opt('criteria-unconfirmed', '基準の確認前にまとめると、確定した基準で分類をやり直せなくなるから。', 'Merging before the criteria are confirmed makes it impossible to reclassify under the final criteria.'),
                        opt('printing-tomorrow', '印刷が明日に迫っていて時間がないから。', 'Because printing is tomorrow and there is no time.'),
                        opt('tally-unfinished', '受付簿の集計がまだ終わっていないから。', 'Because the reception-sheet tally is not finished.'),
                    ],
                    'criteria-unconfirmed', 'listening-merge-reason'),
            ],
            passScore: 13 / 15,
            modalityFloors: { reading: 4, grammar: 2, listening: 2, production: 3 },
            feedback: {
                pass: {
                    explanation: {
                        ja: '正確な原典の対比と音声、よむの転移課題、時間関係の文体判断、更新された優先課題、根拠を守った提言までを一続きでこなせました。',
                        en: 'You tracked the exact source contrast and audio, worked the Yomu transfer task, judged the register of the time-relation forms, caught the updated priority, and kept your recommendation inside the evidence.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '答え合わせの欄で、原典読解・転移読解・文法・原典聴解・転移聴解・提言のどの確認が外れたかを見てから、もう一度確定してください。',
                        en: 'Use the answer key to see which source reading, transfer reading, grammar, source listening, transfer listening, or production check missed, then commit again.',
                    },
                    repairPrompt: {
                        ja: '外れた項目ごとに、原典の対比、本文の対比標識、三つの形の使用条件、原典音声の数値、音声の「まず」、提言の四つの条件を読み直しましょう。',
                        en: 'For each missed item, reread the source contrast, the transfer contrast markers, the usage conditions of the three forms, the exact figure in the source audio, the spoken mazu, and the four recommendation conditions.',
                    },
                    nearbyExample: {
                        ja: '見えない情報に支配されるほど、主体性を築くのは難しくなる。利用は多かった。一方で、来られない人の記録はまだない。まずは基準を確かめるのが望ましい。',
                        en: 'The more one is controlled by invisible information, the harder it becomes to build autonomy. Attendance was high. On the other hand, there is still no record of those who could not come. Confirming the criteria first is the sound next step.',
                    },
                },
            },
            reviewTargets: [
                target('source-contrast', CONCEPT_SOURCE_CONTRAST,
                    '目にみえない情報に支配されている',
                    ['controlled by invisible information'],
                    source.readingAnchorParagraphs[1],
                    ['reading-source-contrast', 'reading-source-invalid-inference', 'floor-reading'],
                    'exact-source'),
                target('ya-ina-ya', CONCEPT_SUCCESSION_REGISTER,
                    '始まるや否や',
                    ['no sooner had (it) started than …'],
                    source.grammarExamples[1],
                    ['grammar-ya-ina-ya'],
                    'exact-source'),
                target('ga-hayai-ka', CONCEPT_SUCCESSION_REGISTER,
                    '並べられたが早いか',
                    ['the instant (it) was placed on display …'],
                    source.grammarExamples[0],
                    ['grammar-ga-hayai-ka'],
                    'exact-source'),
                target('nari', CONCEPT_SUCCESSION_REGISTER,
                    '入ってくるなり',
                    ['upon coming in, (he) immediately …'],
                    source.grammarExamples[2],
                    ['grammar-nari', 'floor-grammar'],
                    'exact-source'),
                target('kazu-ga-fukumanai', CONCEPT_DEMAND_VS_EXCLUSION,
                    'その数字が含まない人',
                    ['the people the number does not include'],
                    authored.readingParagraphs[1],
                    ['reading-excluded-referent', 'reading-thesis-scope', 'floor-reading'],
                    'yomu-authored'),
                target('tsunami-mismatch', CONCEPT_SOURCE_LISTENING_DETAIL,
                    '予想される津波の高さは1mです',
                    ['the predicted tsunami height is 1m'],
                    source.listeningSourceTranscript,
                    ['listening-source-tsunami-mismatch', 'floor-listening'],
                    'exact-source'),
                target('mazu-kijun', CONCEPT_PRIORITY_UPDATE,
                    'まず分類基準の案を福祉課に送ってください',
                    ['first, send the draft classification criteria to the welfare department'],
                    authored.listeningScript,
                    ['listening-first-priority', 'listening-merge-reason', 'floor-listening'],
                    'yomu-authored'),
                target('nozomashii', CONCEPT_BOUNDED_RECOMMENDATION,
                    '次の段階として検討するのが望ましい',
                    ['it is preferable to consider it as the next stage'],
                    authored.productionModelAnswer,
                    ['production-length-band', 'production-evidence-balance', 'production-qualification-marker', 'production-provisional-no-overclaim', 'floor-production'],
                    'yomu-authored'),
            ],
        },
    });
    return Object.freeze({
        id: N1_OPENING_SEQUENCE_PACKAGE_ID,
        band: 'N1' as const,
        prerequisites: PREREQUISITES,
        activity,
        readerSrs: readerSrsProjection(),
    });
}

function prerequisite(conceptId: string, ja: string, en: string): N1OpeningSequencePrerequisite {
    return Object.freeze({ conceptId, minimumEvidence: 'introduced-and-attempted', reason: Object.freeze({ ja, en }) });
}
function refresh(conceptId: string, ja: string, en: string, example: string, exampleSource: 'authored' | 'exact-source-tobira') {
    return Object.freeze({ conceptId, bridge: Object.freeze({ ja, en }), example, exampleSource });
}
function form(
    id: string, formText: string, example: string,
    registerJa: string, registerEn: string,
    agentJa: string, agentEn: string,
    eventJa: string, eventEn: string,
) {
    return Object.freeze({
        id,
        form: formText,
        example,
        exampleAuthorship: 'exact-source-shin-kanzen-grammar' as const,
        registerNote: Object.freeze({ ja: registerJa, en: registerEn }),
        agentNote: Object.freeze({ ja: agentJa, en: agentEn }),
        eventNote: Object.freeze({ ja: eventJa, en: eventEn }),
    });
}
function check(id: N1OpeningSequenceProductionCheckId, errorTag: string, ja: string, en: string) {
    return Object.freeze({ id, errorTag, label: Object.freeze({ ja, en }) });
}
function opt(id: string, ja: string, en: string) {
    return Object.freeze({ id, label: Object.freeze({ ja, en }) });
}
function question(
    id: string,
    modality: N1OpeningSequenceModality,
    stimulusRole: N1OpeningSequenceStimulusRole,
    ja: string,
    en: string,
    options: readonly Readonly<{ id: string; label: LocalizedText }>[],
    correctOptionId: string,
    errorTag: string,
    rationale?: LocalizedText,
) {
    return Object.freeze({
        id, modality, stimulusRole, prompt: Object.freeze({ ja, en }),
        options: Object.freeze([...options]), correctOptionId, errorTag,
        ...(rationale ? { rationale } : {}),
    });
}
function target(
    suffix: string,
    conceptId: string,
    expression: string,
    meanings: readonly string[],
    sentence: string,
    repairFor: readonly string[],
    attribution: 'yomu-authored' | 'exact-source',
) {
    return Object.freeze({
        id: `review:${N1_OPENING_SEQUENCE_PACKAGE_ID}:${suffix}`,
        conceptId,
        expression,
        meanings: Object.freeze([...meanings]),
        sentence,
        repairFor: Object.freeze([...repairFor]),
        attribution,
    });
}
function readerSrsProjection(): N1OpeningSequenceReaderSrsProjection {
    return Object.freeze({
        readerSurfaceIds: Object.freeze([
            'reader:n1-opening-sequence-01:reading:source-paragraph-1',
            'reader:n1-opening-sequence-01:reading:source-paragraph-2',
            'reader:n1-opening-sequence-01:reading:source-paragraph-3',
            'reader:n1-opening-sequence-01:reading:transfer-paragraph-1',
            'reader:n1-opening-sequence-01:reading:transfer-paragraph-2',
            'reader:n1-opening-sequence-01:reading:transfer-paragraph-3',
            'reader:n1-opening-sequence-01:grammar:example-1',
            'reader:n1-opening-sequence-01:grammar:example-2',
            'reader:n1-opening-sequence-01:grammar:example-3',
            'reader:n1-opening-sequence-01:listening:source-transcript-1',
            'reader:n1-opening-sequence-01:listening:transfer-transcript-1',
        ]),
        miningRequests: Object.freeze(miningRequests()),
    });
}
function miningRequests(): MiningRequest[] {
    const authored = N1_OPENING_SEQUENCE_AUTHORED;
    const source = N1_OPENING_SEQUENCE_DELIVERED_SOURCE;
    const authoredSourceTitle = 'Yomu original N1 opening sequence: 涼み処が数えなかった人';
    return [
        {
            expression: '目にみえない情報',
            sentence: source.readingAnchorParagraphs[1],
            sourceTitle: '新完全マスター読解 N1 (exact source excerpt)',
            conceptIds: [CONCEPT_SOURCE_CONTRAST],
        },
        {
            expression: '並べられたが早いか',
            sentence: source.grammarExamples[0],
            sourceTitle: '新完全マスター文法 N1 (exact source excerpt)',
            conceptIds: [CONCEPT_SUCCESSION_REGISTER],
        },
        {
            expression: '入ってくるなり',
            sentence: source.grammarExamples[2],
            sourceTitle: '新完全マスター文法 N1 (exact source excerpt)',
            conceptIds: [CONCEPT_SUCCESSION_REGISTER],
        },
        {
            expression: '扉を開けるや否や',
            sentence: authored.readingParagraphs[0],
            sourceTitle: authoredSourceTitle,
            conceptIds: [CONCEPT_SUCCESSION_REGISTER, CONCEPT_DISCOURSE_CONTRAST],
        },
        {
            expression: 'その数字が含まない人',
            sentence: authored.readingParagraphs[1],
            sourceTitle: authoredSourceTitle,
            conceptIds: [CONCEPT_DEMAND_VS_EXCLUSION, CONCEPT_BOUNDED_RECOMMENDATION],
        },
    ];
}
