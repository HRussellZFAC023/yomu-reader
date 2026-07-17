import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    ClassActivityRole,
    ClassActivitySimulatorModel,
    ClassActivitySource,
    ClassActivityTurn,
} from '../minigames/class-activity-simulator';

export const CLASS_ACTIVITY_PACKAGES = Object.freeze([
    'l1-l01',
    'l1-l15',
    'l2-l09',
    'l2-l13',
    'l1-l08',
    'l1-l23',
] as const);

type ClassActivityPackageId = typeof CLASS_ACTIVITY_PACKAGES[number];

const PROMPTS: Readonly<Record<ClassActivityPackageId, string>> = Object.freeze({
    'l1-l01': "Jenny's idea: before the break, go and introduce yourself to three people you haven't met. Say はじめまして, your name, where you're from (〜じん) and what you do — then ask one of them a ですか question and listen for はい or いいえ.",
    'l1-l15': "Robert opens a shared board: everyone writes one line inviting the class somewhere. Say one thing you like (〜が すきです), give a reason (〜から), and say where to meet with a place word (〜の まえ, 〜の となり). Then reply warmly to one classmate's plan.",
    'l2-l09': 'Two people hold incomplete descriptions of four fictional programmes. Ask only spoken questions, fill every missing field, and agree on the one programme that meets three audience conditions.',
    'l2-l13': 'Invite a partner to a simple activity and give two appealing reasons. Your partner declines with two reasons and suggests another possibility. Swap roles.',
    'l1-l08': "Jodi's setting up a study meet-up and needs everyone's free times. In Japanese, post when you're free on two different days — use a day name and 〜から〜まで — then reply to one classmate to suggest a time you could both meet.",
    'l1-l23': 'Find four katakana labels around you: on food, a screen, a book, or an imagined shop shelf. Read them aloud and keep one that you want to remember.',
});

export function createClassActivityModel(packageId: ClassActivityPackageId): ClassActivitySimulatorModel {
    switch (packageId) {
        case 'l1-l01': return pairIntroduction();
        case 'l1-l15': return groupInvitation();
        case 'l2-l09': return programmeInformationGap();
        case 'l2-l13': return invitationRoleCards();
        case 'l1-l08': return freeTimeBoard();
        case 'l1-l23': return katakanaRace();
    }
}

function pairIntroduction(): ClassActivitySimulatorModel {
    const conceptIds = ['concept:l1-l01:self-introduction', 'concept:l1-l01:desu-question'];
    const roles = [
        role('learner', 'henry', 'Henry', 'learner', 'New classmate', '新しいクラスメート'),
        role('aakash', 'aakash', 'Aakash', 'classmate', 'Partner', 'パートナー'),
    ];
    const turns: readonly ClassActivityTurn[] = [
        learnerText('introduce', 'learner', 'Introduce yourself before Aakash turns over the next atlas card.', '次の地図カードをめくる前に、アーカッシュさんに自己紹介してください。', 'Your introduction', '自己紹介', [
            ['はじめまして'], ['ヘンリー'], ['イギリスじん'], ['かいしゃいん'], ['よろしく'],
        ], conceptIds[0], 'pair-introduction-details'),
        classmate('aakash-introduction', 'aakash', 'はじめまして。アーカッシュです。エンジニアです。どうぞ よろしく。', 'Aakash introduces himself as an engineer and greets you warmly.'),
        learnerChoice('ask-aakash', 'learner', 'Ask the promised ですか question.', '約束した「ですか」の質問をしてください。', [
            option('student', 'アーカッシュさんは がくせいですか。', 'Aakash, are you a student?'),
            option('statement', 'アーカッシュさんは がくせいです。', 'Aakash is a student.'),
            option('name', 'アーカッシュさんですか。', 'Are you Aakash?'),
        ], ['student'], conceptIds[1], 'pair-desu-question'),
        classmate('aakash-answer', 'aakash', 'いいえ、がくせいじゃ ありません。エンジニアです。', 'No, I am not a student. I am an engineer.'),
    ];
    return model('l1-l01', 'pair', 'Meet three classmates', '三人のクラスメートに会う', {
        en: 'Academy library, at the Blank Atlas name-card table',
        ja: 'アカデミー図書館・白い地図帳の名札テーブル',
    }, conceptIds, source('l1-l01', 'course ucl-japanese · level 1 · module 5777762', 'Minna no Nihongo I · Lesson 1', '≈ Genki L1', {
        title: 'Chapter 1 self introduction Grammar and Exercise',
        payloadSha256: '42776eb5736dc44caff1809419e41eb189998d3dda04401262cde705676c3fe9',
    }), roles, turns);
}

function groupInvitation(): ClassActivitySimulatorModel {
    const conceptIds = ['concept:l1-l15:invitation-reason', 'concept:l1-l15:warm-reply'];
    const roles = [
        role('xingyu', 'xingyu', 'Xingyu', 'classmate', 'Music fan', '音楽が好きな人'),
        role('learner', 'henry', 'Henry', 'learner', 'Board contributor', 'ボードに書く人'),
        role('francis', 'francis', 'Francis', 'classmate', 'Careful planner', 'ていねいに考える人'),
        role('mika', 'mika', 'Mika', 'classmate', 'Question keeper', '質問をする人'),
    ];
    const turns: readonly ClassActivityTurn[] = [
        classmate('xingyu-post', 'xingyu', 'わたしは カラオケが すきです。たのしいですから、えきの まえで あいませんか。', 'Xingyu likes karaoke because it is fun and suggests meeting in front of the station.'),
        learnerText('learner-post', 'learner', 'Add your invitation to Robert’s shared board.', 'ロバートの共有ボードに、自分の誘いを書いてください。', 'Invitation with reason and place', '理由と場所がある誘い', [
            ['が すき', 'がすき'], ['から'], ['まえ', 'となり', 'なか'], ['ませんか'],
        ], conceptIds[0], 'group-invitation-parts'),
        classmate('francis-reply', 'francis', 'いいですね。どようびなら ひまです。', 'Francis likes the plan and says Saturday works.'),
        learnerChoice('warm-reply', 'learner', 'Reply to Francis without making his plan the joke.', 'フランシスの予定を笑いものにせず、あたたかく返事をしてください。', [
            option('warm', 'いいですね。どようびに いっしょに いきましょう。', 'Sounds good. Let’s go together on Saturday.'),
            option('cold', 'それは だめです。', 'That is no good.'),
            option('ignore', 'カラオケが あります。', 'There is karaoke.'),
        ], ['warm'], conceptIds[1], 'group-warm-reply'),
        classmate('mika-question', 'mika', 'どうして その みせが すきですか。', 'Mika asks why you like that place.'),
        learnerText('give-reason', 'learner', 'Give Mika one clear reason.', 'ミカに、はっきりした理由を一つ伝えてください。', 'Reason', '理由', [['から']], conceptIds[0], 'group-reason-response'),
    ];
    return model('l1-l15', 'group', 'The get-together board', '小さな集まりのボード', {
        en: 'Academy cafe, at Robert’s invitation board',
        ja: 'アカデミーカフェ・ロバートの誘いボード',
    }, conceptIds, source('l1-l15', 'course ucl-japanese-2023-2024 · section rie-level-1-plus · module 6134871', 'Minna no Nihongo I · Lessons 9–10', '≈ Genki I · L4 (existence) + L5 (likes)', {
        title: 'Chapter 10-1 Exercise on the map います あります',
        payloadSha256: '86b77affbef2a78f0db1db7fcbadb667260bf22dd39890081b6982e94a1c0700',
    }), roles, turns);
}

function programmeInformationGap(): ClassActivitySimulatorModel {
    const conceptIds = ['concept:l2-l09:noun-modifying-question', 'concept:l2-l09:programme-evidence'];
    const roles = [
        role('learner', 'henry', 'Henry', 'learner', 'Viewer A', '視聴者A', { en: 'Your sheet is missing who appears and who recorded Town Kitchen.', ja: '「町の 台所」に出る人と録画した人が空欄です。' }),
        role('ruparna', 'ruparna', 'Ruparna', 'classmate', 'Viewer B', '視聴者B', { en: 'Your sheet says a person working in a small shop appears, and Ruparna recorded it. Do not reveal both fields until asked.', ja: '小さい店で働く人が出演し、ルパーナが録画しました。質問されるまで両方を言いません。' }),
        role('francis', 'francis', 'Francis', 'classmate', 'Audience brief', '視聴者の条件', { en: 'The audience wants a programme about town cooking, with readable subtitles, recorded by Ruparna.', ja: '町の料理、読みやすい字幕、ルパーナの録画が三つの条件です。' }),
    ];
    const turns: readonly ClassActivityTurn[] = [
        classmate('ruparna-ready', 'ruparna', 'わたしの カードには、あなたの 空欄の 答えが あります。質問してください。', 'Ruparna has the missing fields and asks you to question her.'),
        learnerChoice('ask-who', 'learner', 'Ask who appears using a noun-modifying clause.', '名詞修飾節を使って、だれが出るか質問してください。', [
            option('who', '小さい 店で 働く 人が 出る 番組は どれですか。', 'Which programme features a person who works in a small shop?'),
            option('flat', '小さい 店は どれですか。', 'Which is the small shop?'),
            option('recorded', 'だれを 録画しましたか。', 'Whom did you record?'),
        ], ['who'], conceptIds[0], 'info-gap-modifying-question'),
        classmate('ruparna-who', 'ruparna', '小さい 店で 働く 人が 出るのは、「町の 台所」です。', 'The programme featuring someone who works in a small shop is Town Kitchen.'),
        learnerChoice('ask-recorder', 'learner', 'Recover the second missing field.', '二つ目の空欄を質問で取り戻してください。', [
            option('recorder', '「町の 台所」を 録画した 人は だれですか。', 'Who recorded Town Kitchen?'),
            option('time', '何時に 見ますか。', 'What time will you watch?'),
            option('place', '台所は どこですか。', 'Where is the kitchen?'),
        ], ['recorder'], conceptIds[0], 'info-gap-recorder-question'),
        classmate('ruparna-recorder', 'ruparna', 'わたしが 録画しました。字幕も 読みやすいです。', 'Ruparna recorded it, and its subtitles are easy to read.'),
        classmate('francis-conditions', 'francis', '町の 料理、読みやすい 字幕、ルパーナさんの 録画。この 三つが 条件です。', 'Francis repeats the three audience conditions.'),
        learnerText('justify-programme', 'learner', 'Choose and justify the programme with all three recovered facts.', '三つの情報を使って番組を選び、理由を説明してください。', 'Three-clue justification', '三つの手がかりの説明', [
            ['町の 台所', '町の台所'], ['小さい 店で 働く 人', '小さい店で働く人'], ['料理'], ['ルパーナ'], ['字幕'],
        ], conceptIds[1], 'info-gap-three-clue-justification'),
    ];
    return model('l2-l09', 'info-gap', 'The programme information gap', '番組の情報ギャップ', {
        en: 'Academy media room, behind the no-spoilers curtain',
        ja: 'アカデミーメディア室・ネタバレ禁止のカーテンの内側',
    }, conceptIds, source('l2-l09', 'Moodle archive archive-000002 · module 6974657', 'Minna no Nihongo I · Lesson 22', '≈ Genki II · L15', {
        title: 'Handouts/Chapter 22_review_info gap_AB_answer.pdf',
        payloadSha256: 'bbb44fbe37ee915824376156f1e66eef7662afa27fd04527fe8379610b62cc23',
    }, true), roles, turns);
}

function invitationRoleCards(): ClassActivitySimulatorModel {
    const conceptIds = ['concept:l2-l13:shi-invitation', 'concept:l2-l13:soft-refusal'];
    const roles = [
        role('learner', 'henry', 'Henry', 'learner', 'First inviter, then responder', '最初は誘う人、次は答える人', { en: 'First invite Robert to a quiet inexpensive cafe. After the swap, decline because of work and tiredness, then offer another day.', ja: '最初は静かで安い店に誘います。交代後は仕事と疲れを理由に断り、別の日を提案します。' }),
        role('robert', 'robert', 'Robert', 'classmate', 'First responder, then inviter', '最初は答える人、次は誘う人', { en: 'First decline gently with two reasons and suggest next week. After the swap, invite Henry to karaoke with two positive reasons.', ja: '最初は理由を二つ述べて来週を提案します。交代後はよい理由を二つ使ってカラオケに誘います。' }),
    ];
    const turns: readonly ClassActivityTurn[] = [
        learnerText('invite-robert', 'learner', 'Use your first card: invite Robert with two appealing reasons.', '最初のカードで、よい理由を二つ述べてロバートを誘ってください。', 'Invitation', '誘い', [
            ['安い'], ['静か'], ['し'], ['ませんか'],
        ], conceptIds[0], 'role-card-two-positive-reasons'),
        classmate('robert-declines', 'robert', '行きたいんですが、仕事が あるし、家族と 約束が あるし…。来週でも いいですか。', 'Robert would like to go, but has work and a family promise. He suggests next week.'),
        learnerChoice('accept-alternative', 'learner', 'Keep the refusal warm and answer the alternative.', '断りをあたたかく受け止め、別の案に答えてください。', [
            option('warm', 'もちろんです。では、来週に しましょう。', 'Of course. Let’s make it next week.'),
            option('abrupt', 'だめです。今日 行きます。', 'No. We are going today.'),
            option('unrelated', '店は 三つ あります。', 'There are three shops.'),
        ], ['warm'], conceptIds[1], 'role-card-warm-alternative'),
        classmate('swap-cards', 'robert', 'では、カードを 交換しましょう。カラオケは 楽しいし、駅から 近いし、いっしょに 行きませんか。', 'Robert swaps cards and invites you to karaoke because it is fun and near the station.'),
        learnerText('decline-after-swap', 'learner', 'Now use the responder card: decline with two reasons and leave a warm alternative.', '今度は答えるカードで、理由を二つ述べて断り、あたたかい別案を残してください。', 'Soft refusal after swapping roles', '役割交代後のやわらかい断り', [
            ['仕事'], ['疲れて', 'つかれて'], ['し'], ['今度', '来週', 'また'],
        ], conceptIds[1], 'role-card-swapped-refusal'),
    ];
    return model('l2-l13', 'role-card', 'The invitation with room to say no', '断ってもよい誘い', {
        en: 'Academy cafe, at the Invitation Chain table',
        ja: 'アカデミーカフェ・誘いの鎖のテーブル',
    }, conceptIds, source('l2-l13', 'Moodle archive archive-000092 · module 8121266', 'Minna no Nihongo II · Lesson 28', '≈ Genki II · Listing reasons and soft refusal', {
        title: 'Handouts/Chapter 28_Conversation_refuse someones request using many reason.pdf',
        payloadSha256: '1bbab7f1d57fe82b5ef9402ce242b1ad9183590599d5be628c1805c1f37a4da4',
    }, true), roles, turns);
}

function freeTimeBoard(): ClassActivitySimulatorModel {
    const conceptIds = ['concept:l1-l08:kara-made-schedule', 'concept:l1-l08:mutual-time'];
    const roles = [
        role('jodi', 'jodi', 'Jodi', 'classmate', 'Board keeper', 'ボード係'),
        role('learner', 'henry', 'Henry', 'learner', 'Schedule token', '予定のコマ'),
        role('angel', 'angel', 'Onke', 'classmate', 'Clock checker', '時計を確認する人'),
    ];
    const turns: readonly ClassActivityTurn[] = [
        { ...classmate('jodi-opens', 'jodi', 'どようびは ごご 一時から 五時まで ひまです。', 'Jodi is free Saturday from 1 p.m. to 5 p.m.'), boardSpaceId: 'jodi' },
        { ...learnerText('post-times', 'learner', 'Post two days and a 〜から〜まで time range.', '二つの曜日と「〜から〜まで」の時間を投稿してください。', 'Two-day availability', '二日分の空き時間', [
            ['どようび', 'にちようび', 'げつようび', 'かようび', 'すいようび', 'もくようび', 'きんようび'], ['から'], ['まで'],
        ], conceptIds[0], 'board-two-day-range'), boardSpaceId: 'learner' },
        { ...classmate('angel-posts', 'angel', 'どようびは 三時から ひまです。にちようびは いそがしいです。', 'Onke is free from 3 p.m. Saturday and busy Sunday.'), boardSpaceId: 'angel' },
        { ...learnerChoice('choose-time', 'learner', 'Move to a time both you and Jodi can use.', '自分とジョディが会える時間へ進んでください。', [
            option('three', 'どようびの 三時に あいましょう。', 'Let’s meet at 3 p.m. Saturday.'),
            option('six', 'どようびの 六時に あいましょう。', 'Let’s meet at 6 p.m. Saturday.'),
            option('busy', 'にちようびに あいましょう。', 'Let’s meet Sunday.'),
        ], ['three'], conceptIds[1], 'board-mutual-time'), boardSpaceId: 'meet' },
        { ...classmate('jodi-confirms', 'jodi', 'はい、どようびの 三時ですね。ボードに 星を つけます。', 'Jodi confirms Saturday at 3 and marks it with a star.'), boardSpaceId: 'finish' },
    ];
    const base = model('l1-l08', 'board', 'The free-time board', '空き時間ボード', {
        en: 'Academy sound room doorway, beside the timetable board',
        ja: 'アカデミー音響室の入口・時間表ボードの横',
    }, conceptIds, source('l1-l08', 'course ucl-japanese-2023-2024 · section rie-level-1 · module 5866381', 'Minna no Nihongo I · Lessons 1, 3, 4', '≈ Genki L3 (time) + L4 (daily schedule)', {
        title: 'New Chapter 4-1 from time to time Grammar Exercise',
        payloadSha256: '26f0f7c3397e7a4903e8c62fc79bdd3ecceca09bb7302826c5e7497dbd83ccd7',
    }), roles, turns);
    return { ...base, payload: { ...base.payload, board: { spaces: [
        { id: 'jodi', label: { en: 'Jodi posts', ja: 'ジョディの投稿' } },
        { id: 'learner', label: { en: 'Your post', ja: '自分の投稿' } },
        { id: 'angel', label: { en: 'Onke checks', ja: 'エンジェルの確認' } },
        { id: 'meet', label: { en: 'Find overlap', ja: '同じ時間を探す' } },
        { id: 'finish', label: { en: 'Meet-up fixed', ja: '集まる時間が決定' } },
    ] } } };
}

function katakanaRace(): ClassActivitySimulatorModel {
    const conceptIds = ['concept:l1-l23:katakana-label-race'];
    const roles = [
        role('tom', 'tom', 'Tom', 'classmate', 'Clue caller', '手がかりを読む人'),
        role('learner', 'henry', 'Henry', 'learner', 'Label reader', 'ラベルを読む人'),
        role('mika', 'mika', 'Mika', 'classmate', 'Sound checker', '音を確認する人'),
    ];
    const turns: readonly ClassActivityTurn[] = [
        { ...classmate('camera-clue', 'tom', '写真を とる ものの ラベルです。急がなくて いいですよ。', 'This label belongs to something used to take photos. There is no timer.'), checkpoint: 1 },
        { ...learnerText('camera-label', 'learner', 'Read and enter the first label.', '一つ目のラベルを読み、入力してください。', 'Katakana label', 'カタカナのラベル', [['カメラ']], conceptIds[0], 'race-camera-label'), checkpoint: 2 },
        { ...classmate('cake-clue', 'mika', '誕生日に 食べる あまい ものです。音を 三つに 分けてください。', 'It is a sweet thing eaten at birthdays. Separate its three sounds.'), checkpoint: 3 },
        { ...learnerText('cake-label', 'learner', 'Read and enter the second label.', '二つ目のラベルを読み、入力してください。', 'Katakana label', 'カタカナのラベル', [['ケーキ']], conceptIds[0], 'race-cake-label'), checkpoint: 4 },
        { ...classmate('game-clue', 'tom', 'ゲーム部の はこの ラベルです。長い音を のこしてください。', 'It is on a game-club box. Keep the long vowel.'), checkpoint: 5 },
        { ...learnerText('game-label', 'learner', 'Read and enter the third label.', '三つ目のラベルを読み、入力してください。', 'Katakana label', 'カタカナのラベル', [['ゲーム']], conceptIds[0], 'race-game-label'), checkpoint: 6 },
        { ...classmate('guitar-clue', 'mika', '音楽室の 楽器です。キではなく、てんてんが あります。', 'It is a music-room instrument. The first sound has dakuten.'), checkpoint: 7 },
        { ...learnerText('guitar-label', 'learner', 'Read and enter the final label.', '最後のラベルを読み、入力してください。', 'Katakana label', 'カタカナのラベル', [['ギター']], conceptIds[0], 'race-guitar-label'), checkpoint: 8 },
    ];
    const base = model('l1-l23', 'race', 'The label finder', 'ラベル探し', {
        en: 'Game club table, beside Tom’s final card deck',
        ja: 'ゲーム部のテーブル・トムの最後のカードの横',
    }, conceptIds, source('l1-l23', 'course archive · module 5489604', 'Minna no Nihongo I · Katakana strand', 'Academy Genki crosswalk · beginner katakana labels', {
        title: 'Katakana worksheets ア、カ、ガ',
        payloadSha256: '3d91645a697548f64c9d7e6d5b95d3ec6b70341fab204954114fd897727d603b',
    }), roles, turns);
    return { ...base, payload: { ...base.payload, race: { pace: 'untimed', checkpointCount: 8, finishLabel: { en: 'Four labels, no clock', ja: '四つのラベル・時間制限なし' } } } };
}

function model(
    packageId: ClassActivityPackageId,
    format: ClassActivitySimulatorModel['payload']['format'],
    en: string,
    ja: string,
    location: ClassActivitySimulatorModel['payload']['location'],
    conceptIds: readonly string[],
    activitySource: ClassActivitySource,
    roles: readonly ClassActivityRole[],
    turns: readonly ClassActivityTurn[],
): ClassActivitySimulatorModel {
    return {
        id: `activity:${packageId}:class-${format}`,
        kind: 'academy-class-simulator',
        responseKind: 'class-activity-turns',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds,
        prompt: { en, ja },
        payload: {
            format,
            source: activitySource,
            location,
            roles,
            turns,
            feedback: {
                pass: { explanation: { en: 'The exchange is complete and every required language cue is supported by the transcript.', ja: '会話が最後まで続き、必要な表現が記録に残りました。' } },
                lapse: {
                    explanation: { en: 'One or more turns did not yet provide the required evidence.', ja: '必要な表現がまだ足りない番があります。' },
                    repairPrompt: { en: 'Review the role cards and replay the exchange in the authored turn order.', ja: '役割カードを確認し、決められた順番でもう一度会話してください。' },
                    nearbyExample: { en: 'Keep the source task unchanged; repair only the turn named in the feedback.', ja: '元の課題は変えず、フィードバックに示された番だけ直します。' },
                },
            },
            reviewTargets: conceptIds.map((conceptId, index) => ({
                id: `review:${packageId}:class-${format}:${index + 1}`,
                conceptId,
                expression: ja,
                meanings: [en],
            })),
        },
    };
}

function source(
    packageId: ClassActivityPackageId,
    moodle: string,
    minna: string,
    genki: string,
    evidenceItem?: ClassActivitySource['evidenceItem'],
    canonical = false,
): ClassActivitySource {
    return {
        lessonPackageId: packageId,
        exactPrompt: PROMPTS[packageId],
        promptLanguage: 'en',
        mappings: [
            { corpus: 'moodle', reference: moodle, relation: canonical ? 'canonical-material' : 'scope' },
            { corpus: 'minna', reference: minna, relation: 'scope' },
            { corpus: 'genki', reference: genki, relation: 'crosswalk' },
        ],
        ...(evidenceItem ? { evidenceItem } : {}),
    };
}

function role(
    id: string,
    characterId: string,
    name: string,
    controller: ClassActivityRole['controller'],
    en: string,
    ja: string,
    privateCard?: ClassActivityRole['privateCard'],
): ClassActivityRole {
    return { id, characterId, name, controller, label: { en, ja }, ...(privateCard ? { privateCard } : {}) };
}

function classmate(id: string, actorRoleId: string, ja: string, en: string): ClassActivityTurn {
    return { id, kind: 'classmate', actorRoleId, line: { en, ja } };
}

function learnerText(
    id: string,
    actorRoleId: string,
    en: string,
    ja: string,
    labelEn: string,
    labelJa: string,
    requiredGroups: readonly (readonly string[])[],
    conceptId: string,
    errorTag: string,
): ClassActivityTurn {
    return { id, kind: 'learner-text', actorRoleId, prompt: { en, ja }, inputLabel: { en: labelEn, ja: labelJa }, requiredGroups, evidence: { conceptId, errorTag } };
}

function learnerChoice(
    id: string,
    actorRoleId: string,
    en: string,
    ja: string,
    options: readonly ReturnType<typeof option>[],
    acceptedOptionIds: readonly string[],
    conceptId: string,
    errorTag: string,
): ClassActivityTurn {
    return { id, kind: 'learner-choice', actorRoleId, prompt: { en, ja }, options, acceptedOptionIds, evidence: { conceptId, errorTag } };
}

function option(id: string, ja: string, en: string) {
    return { id, label: { en, ja } } as const;
}
