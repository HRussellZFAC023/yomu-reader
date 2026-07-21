import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { MiningRequest } from '../../integration/yomu-bridge';
import {
    N3_MOCK_LISTENING_BATCH_ID,
    N3_MOCK_LISTENING_PACKAGE_IDS,
    type N3MockListeningMechanic,
    type N3MockListeningPackage,
    type N3MockListeningPackageId,
    type N3MockListeningPracticePhase,
    type N3MockListeningPrerequisite,
    type N3MockListeningProduction,
    type N3MockListeningQuestion,
    type N3MockListeningReaderSrsProjection,
    type N3MockListeningReviewTarget,
    type N3MockListeningTeachingPoint,
} from './types';

const ACTION_CONCEPTS = Object.freeze(['listening:n3-action-state', 'listening:n3-action-priority']);
const POINT_CONCEPTS = Object.freeze(['listening:n3-key-point', 'listening:n3-distractor-elimination']);
const OVERVIEW_CONCEPTS = Object.freeze(['listening:n3-overview-intent', 'listening:n3-outline-shift']);
const EXPRESSION_CONCEPTS = Object.freeze(['speaking:n3-pragmatic-fit', 'speaking:n3-register']);
const RESPONSE_CONCEPTS = Object.freeze(['speaking:n3-turn-response', 'listening:n3-response-implication']);

const ACTION_QUESTIONS = Object.freeze([
    question(1, 'action', 'guided',
        '文化祭の準備室です。先輩が学生に作業の変更を伝えます。席札は並べ終わり、入口の案内も貼ってあります。ただ、受付名簿に一人追加されました。まず新しい名簿を三十部印刷してください。そのあと、マイクを舞台へ運びます。',
        '学生はまず何をしますか。', 'What will the student do first?',
        [['名簿を印刷する', 'Print the roster'], ['マイクを運ぶ', 'Carry the microphone'], ['案内を貼る', 'Put up the sign'], ['席札を並べる', 'Arrange the name cards']], 0,
        '完了した作業を消し、「まず」の直後にある名簿の印刷を選びます。', 'Eliminate completed work and follow the action immediately after mazu.', 'action-completed-state', ACTION_CONCEPTS[0], 'official-jlpt:n3-2009-listening:p1-i1'),
    question(2, 'action', 'guided',
        '撮影に出かける前に、二人が機材を確認しています。予備の電池は充電済みで、三脚も車に積みました。でも、メモリーカードがまだカメラに入っていません。出発する前に、それを入れてください。レンズは現地で交換します。',
        '出発前に何をしますか。', 'What must they do before leaving?',
        [['電池を充電する', 'Charge the battery'], ['三脚を車に積む', 'Load the tripod'], ['カードをカメラに入れる', 'Insert the memory card'], ['レンズを交換する', 'Change the lens']], 2,
        '充電と積み込みは完了済みです。出発前に残っているのはカードです。', 'Charging and loading are complete; the card is the remaining pre-departure action.', 'action-remaining-task', ACTION_CONCEPTS[0], 'official-jlpt:n3-2009-listening:p1-i2'),
    question(3, 'action', 'independent',
        '図書館で展示の準備をしています。返却本は棚に戻し、紹介カードも置きました。ところが、入口のポスターの日付が先月のままです。日付を直してから、ポスターを入口へ持っていきましょう。',
        '次に必要な作業は何ですか。', 'What task is needed next?',
        [['本を棚に戻す', 'Return books to the shelves'], ['カードを置く', 'Place the introduction cards'], ['日付を直す', 'Correct the date'], ['展示を中止する', 'Cancel the display']], 2,
        '「〜してから」の前の作業が先です。ポスターを運ぶ前に日付を直します。', 'The action before shite kara comes first: correct the date before moving the poster.', 'action-sequence', ACTION_CONCEPTS[1]),
    question(4, 'action', 'independent',
        '料理交流会の準備について話しています。材料とレシピは届いていますが、参加者一人のアレルギー欄が空白です。お菓子を注文する前に、その人へ連絡して確認してください。',
        '担当者はまず何を確認しますか。', 'What will the organiser confirm first?',
        [['材料の値段', 'The ingredient prices'], ['レシピの枚数', 'The number of recipe copies'], ['参加者のアレルギー', 'A participant allergy'], ['会場の住所', 'The venue address']], 2,
        '注文の前提になっている未確認情報は、参加者のアレルギーです。', 'The unresolved information required before ordering is the participant allergy.', 'action-prerequisite', ACTION_CONCEPTS[1]),
    question(5, 'action', 'delayed-revisit',
        'オンライン講座の公開前チェックです。スライドはアップロードされ、音量も調整されました。自動字幕には人名の誤りが残っています。公開ボタンを押す前に、そこだけ直しましょう。',
        '公開前に何を直しますか。', 'What will be corrected before publication?',
        [['スライドの順番', 'The slide order'], ['動画の音量', 'The video volume'], ['字幕の人名', 'Names in the captions'], ['講座の料金', 'The course fee']], 2,
        '完了済みの項目ではなく、「誤りが残っている」字幕を選びます。', 'Choose the captions where an error remains, not the completed checks.', 'action-completed-state', ACTION_CONCEPTS[0]),
    question(6, 'action', 'changed-context-transfer',
        '町歩きツアーの直前に、雨の日の道順へ変わりました。名札と地図はもう用意できています。まず案内役全員に新しい道順を送ってください。確認の返信が来たら、予備の地図を印刷します。',
        '変更後、最初にすることは何ですか。', 'After the change, what happens first?',
        [['名札を作る', 'Make name tags'], ['新しい道順を送る', 'Send the new route'], ['返信を待たず地図を印刷する', 'Print maps without waiting'], ['ツアーを中止する', 'Cancel the tour']], 1,
        '変更後の指示は「道順を送る」から始まり、印刷は返信の後です。', 'The revised sequence starts by sending the route; printing follows the replies.', 'action-sequence', ACTION_CONCEPTS[1]),
]);

const POINT_QUESTIONS = Object.freeze([
    question(7, 'point', 'guided',
        '資料室へ来た人が遅れた理由を話しています。電車は時間どおりで、駅からの道にも迷いませんでした。ただ、建物の入口が工事中で、反対側の入口まで回らなければならなかったんです。',
        '到着が遅くなった原因を選んでください。', 'Choose what caused the late arrival.',
        [['電車が遅れたから', 'The train was delayed'], ['道に迷ったから', 'They got lost'], ['反対側の入口へ回ったから', 'They had to use the opposite entrance'], ['資料を忘れたから', 'They forgot the materials']], 2,
        '否定された理由を除き、入口工事による遠回りを選びます。', 'Remove the denied reasons and select the detour caused by entrance work.', 'point-elimination', POINT_CONCEPTS[1], 'official-jlpt:n3-2009-listening:p2-i1'),
    question(8, 'point', 'guided',
        '学生が自習室を選んだ理由を話しています。新しい部屋ではなく、広さも普通で、料金も少し高めでした。それでも夜九時まで静かに使えることが、選択を左右しました。',
        '自習室を選ぶうえで最も重要だった条件は何ですか。', 'Which condition mattered most when choosing the study room?',
        [['新しいこと', 'It is new'], ['広いこと', 'It is spacious'], ['料金が安いこと', 'It is inexpensive'], ['夜まで静かに使えること', 'It is quiet and open late']], 3,
        '「それでも」の後に示される、選択を左右した条件を取ります。', 'Take the condition that shaped the choice after soredemo.', 'point-deciding-factor', POINT_CONCEPTS[0], 'official-jlpt:n3-2009-listening:p2-i2'),
    question(9, 'point', 'independent',
        '地域イベントの感想です。スタッフは親切で、参加費も安く、内容も面白かったです。ただ、会場までの案内表示が少なくて、入口を見つけるのに時間がかかりました。',
        '話し手が改善してほしい点は何ですか。', 'What does the speaker want improved?',
        [['スタッフの対応', 'Staff service'], ['参加費', 'The entry fee'], ['案内表示', 'Direction signs'], ['イベントの内容', 'The event content']], 2,
        '肯定的な評価を除き、「ただ」の後の案内表示を選びます。', 'Exclude the positive evaluations and follow the concern after tada.', 'point-contrast', POINT_CONCEPTS[1]),
    question(10, 'point', 'independent',
        '出張の経路を選んだ人が話しています。この電車は少し時間がかかり、窓からの景色も特別ではありません。でも、途中で乗り換えなくてよいので、荷物が多い今日はこの経路にしました。',
        'この人がこの経路にした最大の要因を選んでください。', 'Choose the main factor behind this route choice.',
        [['最も速いから', 'It is fastest'], ['景色が良いから', 'The scenery is good'], ['乗り換えがないから', 'There is no transfer'], ['荷物を預けられるから', 'Luggage can be checked']], 2,
        '弱点の後にある実用上の利点、乗り換え不要が理由です。', 'The practical advantage after the drawbacks is having no transfer.', 'point-deciding-factor', POINT_CONCEPTS[0]),
    question(11, 'point', 'delayed-revisit',
        '聞き取り練習について相談しています。長い番組を週末だけ聞くより、通勤中に短い会話を毎日まねして言うほうが続けやすいですよ。まず一分の会話から始めてみてください。',
        '勧めている練習方法は何ですか。', 'What practice method is recommended?',
        [['長い番組を週末だけ聞く', 'Listen to a long programme only on weekends'], ['短い会話を毎日まねする', 'Imitate a short dialogue every day'], ['文法問題だけを解く', 'Do only grammar questions'], ['通勤中は何もしない', 'Do nothing while commuting']], 1,
        '比較の後に具体的に勧められた、短い会話の毎日の反復です。', 'The explicit recommendation after the comparison is daily imitation of short dialogue.', 'point-recommendation', POINT_CONCEPTS[0]),
    question(12, 'point', 'changed-context-transfer',
        '写真展を見た人の感想です。会場は少し狭かったけれど、受付は丁寧で、作品の並べ方も分かりやすかったです。特に、写真の横の短い説明が作品の背景を理解する助けになりました。',
        '最も高く評価しているものは何ですか。', 'What does the speaker value most?',
        [['会場の広さ', 'The venue size'], ['受付の服装', 'The reception clothing'], ['作品横の説明', 'The captions beside the works'], ['出口の場所', 'The exit location']], 2,
        '「特に」が評価の中心を示します。', 'Tokuni marks the focus of the positive evaluation.', 'point-emphasis', POINT_CONCEPTS[0]),
]);

const OVERVIEW_QUESTIONS = Object.freeze([
    question(13, 'overview', 'guided',
        '地域の図書館では、仕事帰りの人にも利用してもらうため、今月から金曜日だけ閉館時間を二時間遅くしています。利用者は増えましたが、職員の負担も確認する必要があります。来月、利用状況を見て続けるか決める予定です。',
        '話の中心は何ですか。', 'What is the main focus?',
        [['新しい本の紹介', 'Introducing new books'], ['夜間開館の試行と今後の判断', 'A late-opening trial and its review'], ['職員の採用方法', 'How staff are hired'], ['図書館の移転', 'Moving the library']], 1,
        '目的、現状、次の判断をまとめる選択肢が中心です。', 'The main idea combines the purpose, current result, and next decision.', 'overview-main-thread', OVERVIEW_CONCEPTS[0], 'official-jlpt:n3-2009-listening:p3-i1'),
    question(14, 'overview', 'delayed-revisit',
        '明日の屋外発表会は、午後に気温が高くなる予報のため、開始を午前十時に変更します。会場は同じですが、水を持参し、体調が悪い場合は無理をしないでください。参加できない方には後日録画を共有します。',
        'この案内の主な目的は何ですか。', 'What is the main purpose of this announcement?',
        [['会場の変更を知らせる', 'Announce a venue change'], ['発表内容を募集する', 'Invite presentation proposals'], ['時間変更と安全上の注意を伝える', 'Give a time change and safety advice'], ['録画を販売する', 'Sell a recording']], 2,
        '複数の詳細を、時間変更と安全という一つの目的にまとめます。', 'Group the details under the single purpose of schedule change and safety.', 'overview-purpose', OVERVIEW_CONCEPTS[0]),
    question(15, 'overview', 'changed-context-transfer',
        'グループ学習では、全員が同じノートを取る必要はありません。ある人は例を集め、別の人は分からない点を記録します。最後に情報を合わせれば、一人では気づかなかった関係が見えてきます。役割を決めることが共同ノートを役立てる鍵です。',
        '話し手が最も伝えたいことは何ですか。', 'What does the speaker most want to convey?',
        [['全員が同じ文を書くべきだ', 'Everyone should write the same sentences'], ['一人で勉強すべきだ', 'People should study alone'], ['役割分担で共同ノートが有効になる', 'Assigned roles make shared notes useful'], ['例を集めてはいけない', 'Examples should not be collected']], 2,
        '例の列挙ではなく、最後に示された全体の主張を選びます。', 'Choose the concluding claim, not one example from the list.', 'overview-conclusion', OVERVIEW_CONCEPTS[1]),
]);

const EXPRESSION_QUESTIONS = Object.freeze([
    question(16, 'expression', 'guided',
        '先生に、応募メールの日本語を確認してもらいたいです。先生への頼み方を考えます。',
        'この依頼に合う発話を選びましょう。', 'Choose the utterance that fits this request.',
        [['このメール、今すぐ直して。', 'Fix this email right now.'], ['恐れ入りますが、このメールを確認していただけないでしょうか。', 'Could you please check this email?'], ['このメールは確認しなくてもいいです。', 'You do not need to check this email.']], 1,
        '負担のある依頼なので、前置きと「いただけないでしょうか」を使います。', 'A preface plus itadakenai deshou ka fits a request that imposes on the listener.', 'expression-request-register', EXPRESSION_CONCEPTS[1], 'official-jlpt:n3-2009-listening:p4-i1'),
    question(17, 'expression', 'independent',
        'オンライン発表中とは気づかず、共有画面に通知を出してしまいました。発表者にどう声をかけますか。',
        '迷惑を認める発話を選びましょう。', 'Choose the utterance that acknowledges the interruption.',
        [['発表中とは気づかず、失礼しました。', 'I am sorry; I did not realise the presentation was in progress.'], ['通知をもう一度出してください。', 'Please show the notification again.'], ['発表が止まってよかったですね。', 'It was good that the presentation stopped.']], 0,
        '事情を短く示し、「失礼しました」で発表を妨げたことを認めます。', 'State the circumstance briefly and acknowledge interrupting the presentation with shitsurei shimashita.', 'expression-apology', EXPRESSION_CONCEPTS[0]),
    question(18, 'expression', 'delayed-revisit',
        '出先で電池が少なくなりました。同僚の予備の充電器を会議が終わるまで借りたいです。どう頼みますか。',
        '相手が断れる依頼を選びましょう。', 'Choose the request that leaves room to decline.',
        [['その充電器、使います。', 'I will use that charger.'], ['もしよければ、会議が終わるまで充電器をお借りしてもいいでしょうか。', 'If possible, may I borrow the charger until the meeting ends?'], ['充電器を買ってきてください。', 'Please go buy a charger.']], 1,
        '相手の都合を残す「もしよければ」と許可を求める形が合います。', 'Moshi yokereba leaves room for the listener, and the permission form fits borrowing.', 'expression-permission', EXPRESSION_CONCEPTS[0]),
    question(19, 'expression', 'changed-context-transfer',
        '大学の公開講座の片付け中ですが、終電に間に合うため、残っている運営仲間より先に会場を出ます。仲間に声をかけます。',
        '共同作業を先に抜ける発話を選びましょう。', 'Choose what to say when leaving shared work before the others.',
        [['お先に失礼します。', 'Excuse me for leaving before you.'], ['少々お待ちください。', 'Please wait a moment.'], ['お疲れではありません。', 'You are not tired.']], 0,
        '共同作業を先に抜けるときの定型として「お先に失礼します」が合います。', 'Osaki ni shitsurei shimasu is the conventional formula for leaving shared work before the others.', 'expression-workplace', EXPRESSION_CONCEPTS[0]),
]);

const RESPONSE_QUESTIONS = Object.freeze([
    question(20, 'response', 'guided',
        '資料の最新版、もう共有しましたか。',
        '最も自然な返事はどれですか。', 'Which reply is most natural?',
        [['はい、今共有したところです。', 'Yes, I just shared it.'], ['はい、あとで共有してもらえますか。', 'Yes; could you share it later?'], ['いいえ、最新版でお願いします。', 'No; please use the latest version.']], 0,
        '完了直後を表す「〜たところです」が質問に直接答えます。', 'Ta tokoro desu directly answers that the action has just been completed.', 'response-aspect', RESPONSE_CONCEPTS[1], 'official-jlpt:n3-2009-listening:p5-i1'),
    question(21, 'response', 'guided',
        '打ち合わせは三時からで大丈夫ですか。',
        '最も自然な返事はどれですか。', 'Which reply is most natural?',
        [['三時までに終わりました。', 'It finished by three.'], ['三時なら大丈夫です。', 'Three o\'clock works for me.'], ['打ち合わせは会議室でした。', 'The meeting was in the meeting room.']], 1,
        '確認に対して、条件を受ける「三時なら」で簡潔に答えます。', 'Sanji nara accepts the proposed condition and answers the confirmation directly.', 'response-confirmation', RESPONSE_CONCEPTS[0], 'official-jlpt:n3-2009-listening:p5-i2'),
    question(22, 'response', 'independent',
        '窓側の席、代わりましょうか。',
        '最も自然な返事はどれですか。', 'Which reply is most natural?',
        [['いいえ、窓側に代わってください。', 'No; please switch to the window seat.'], ['窓側の席は空いていました。', 'The window seat was open.'], ['ありがとうございます。助かります。', 'Thank you, that helps.']], 2,
        '申し出を受ける感謝として自然です。', 'This naturally accepts the offer with thanks.', 'response-offer', RESPONSE_CONCEPTS[0]),
    question(23, 'response', 'independent',
        'この漢字の読み方、分かりますか。',
        '最も自然な返事はどれですか。', 'Which reply is most natural?',
        [['確かではないので、辞書で確認しましょう。', 'I am not certain, so let us check a dictionary.'], ['はい、書き方なら知っています。', 'Yes, I know how to write it.'], ['いいえ、この漢字は昨日習いました。', 'No, I learned this kanji yesterday.']], 0,
        '不確かさを示し、次の行動を提案する返事が会話を進めます。', 'The reply marks uncertainty and proposes a useful next action.', 'response-uncertainty', RESPONSE_CONCEPTS[1]),
    question(24, 'response', 'delayed-revisit',
        '新しい写真展、もう見ましたか。',
        '最も自然な返事はどれですか。', 'Which reply is most natural?',
        [['はい、週末に行くつもりです。', 'Yes, I plan to go this weekend.'], ['まだですが、週末に行くつもりです。', 'Not yet, but I plan to go this weekend.'], ['いいえ、写真展は駅の近くでした。', 'No, the exhibition was near the station.']], 1,
        '未経験の「まだ」と今後の予定を組み合わせています。', 'The response combines mada for not yet with a future plan.', 'response-yet-plan', RESPONSE_CONCEPTS[1]),
    question(25, 'response', 'independent',
        '資料の締め切りは金曜日ですよね。',
        '最も自然な返事はどれですか。', 'Which reply is most natural?',
        [['はい、金曜日から作り始めます。', 'Yes, I will start making it on Friday.'], ['いいえ、資料はもう提出しましたか。', 'No; have you submitted the materials already?'], ['いいえ、木曜日に変わりました。', 'No, it was changed to Thursday.']], 2,
        '誤った前提を否定し、更新後の情報を示します。', 'The reply rejects the incorrect assumption and supplies the updated information.', 'response-correction', RESPONSE_CONCEPTS[0]),
    question(26, 'response', 'independent',
        '先に休憩してもいいですか。',
        '最も自然な返事はどれですか。', 'Which reply is most natural?',
        [['ええ、戻ったら声をかけてください。', 'Yes; let me know when you return.'], ['ええ、私も先に戻りました。', 'Yes, I also returned first.'], ['すみません、休憩は十分でした。', 'Sorry, the break was enough.']], 0,
        '許可を与え、戻った後の条件を自然に付けています。', 'The response grants permission and adds a natural condition for returning.', 'response-permission', RESPONSE_CONCEPTS[0]),
    question(27, 'response', 'changed-context-transfer',
        'ここから駅まで歩くと、二十分ぐらいかかりますよ。',
        '最も自然な返事はどれですか。', 'Which reply is most natural?',
        [['それでは、駅で二十分待ちました。', 'Then, I waited at the station for twenty minutes.'], ['それなら、少し早めに出ましょう。', 'In that case, let us leave a little early.'], ['でも、駅はもう閉まっていますか。', 'But is the station already closed?']], 1,
        '新しい所要時間を受け、「それなら」で計画を調整します。', 'Sore nara uses the new travel time to adjust the plan.', 'response-implication', RESPONSE_CONCEPTS[1]),
    question(28, 'response', 'changed-context-transfer',
        'さっきの録音、声が少し小さかったですね。',
        '最も自然な返事はどれですか。', 'Which reply is most natural?',
        [['では、音量をもう少し下げます。', 'Then I will lower the volume a little more.'], ['そうですね、録音は昨日終わりました。', 'That is true; the recording finished yesterday.'], ['では、マイクを近づけて録り直します。', 'Then I will move the microphone closer and record again.']], 2,
        '問題点から必要な修正を推論し、次の行動を示します。', 'The reply infers the needed fix and states the next action.', 'response-implication', RESPONSE_CONCEPTS[1]),
]);

const EXPRESSION_PRODUCTION: N3MockListeningProduction = Object.freeze({
    id: 'n3-expression-spoken-transfer',
    prompt: Object.freeze({
        ja: '係の人に、最後の案内をもう一度言ってもらう一文を声に出してから、その文を入力してください。',
        en: 'Say one sentence asking the staff member to repeat the final announcement, then type the sentence you used.',
    }),
    scenario: Object.freeze({ ja: '駅の案内所で、最後の部分だけ聞き取れませんでした。', en: 'At a station information desk, you missed only the final part.' }),
    modelAnswer: '恐れ入りますが、最後の案内をもう一度言っていただけますか。',
    minimumCharacters: 18,
    acceptedFragments: Object.freeze([
        Object.freeze(['恐れ入りますが', 'すみませんが']),
        Object.freeze(['もう一度', '繰り返して']),
        Object.freeze(['いただけますか', 'くださいませんか']),
    ]),
    errorTag: 'expression-spoken-transfer',
    conceptId: EXPRESSION_CONCEPTS[1],
});

const RESPONSE_PRODUCTION: N3MockListeningProduction = Object.freeze({
    id: 'n3-response-spoken-transfer',
    prompt: Object.freeze({
        ja: '今夜の集まりに行けない理由と、次に会える予定を短く声に出してから、その返事を入力してください。',
        en: 'Say a short reply explaining why you cannot attend tonight and when you can meet next, then type it.',
    }),
    scenario: Object.freeze({ ja: '友達：今夜の勉強会、来られますか。', en: 'Friend: Can you come to the study meeting tonight?' }),
    modelAnswer: 'すみません、今日は仕事が遅くなるので行けませんが、明日の夕方なら会えます。',
    minimumCharacters: 22,
    acceptedFragments: Object.freeze([
        Object.freeze(['今日は', '今夜は']),
        Object.freeze(['行けません', '難しいです']),
        Object.freeze(['明日', '来週']),
    ]),
    errorTag: 'response-spoken-transfer',
    conceptId: RESPONSE_CONCEPTS[0],
});

const ACTION_REVIEW_TARGETS = Object.freeze([
    review('n3-mock-listening-01-action', 'state', ACTION_CONCEPTS[0], 'もう〜ました', ['already did ...'], ACTION_QUESTIONS[0].audioText, ['action-completed-state', 'action-remaining-task']),
    review('n3-mock-listening-01-action', 'priority', ACTION_CONCEPTS[1], 'まず〜、そのあと〜', ['first ..., then ...'], ACTION_QUESTIONS[5].audioText, ['action-sequence', 'action-prerequisite']),
]);
const POINT_REVIEW_TARGETS = Object.freeze([
    review('n3-mock-listening-02-point', 'elimination', POINT_CONCEPTS[1], '〜わけではない', ['it is not that ...'], POINT_QUESTIONS[0].audioText, ['point-elimination', 'point-contrast']),
    review('n3-mock-listening-02-point', 'factor', POINT_CONCEPTS[0], '一番の決め手', ['the deciding factor'], POINT_QUESTIONS[1].audioText, ['point-deciding-factor', 'point-recommendation', 'point-emphasis']),
]);
const OVERVIEW_REVIEW_TARGETS = Object.freeze([
    review('n3-mock-listening-03-overview', 'thread', OVERVIEW_CONCEPTS[0], '目的・現状・次の判断', ['purpose, current state, next decision'], OVERVIEW_QUESTIONS[0].audioText, ['overview-main-thread', 'overview-purpose']),
    review('n3-mock-listening-03-overview', 'claim', OVERVIEW_CONCEPTS[1], '鍵は〜です', ['the key is ...'], OVERVIEW_QUESTIONS[2].audioText, ['overview-conclusion']),
]);
const EXPRESSION_REVIEW_TARGETS = Object.freeze([
    review('n3-mock-listening-04-expression', 'request', EXPRESSION_CONCEPTS[1], '恐れ入りますが', ['I am sorry to trouble you, but ...'], EXPRESSION_PRODUCTION.modelAnswer, ['expression-request-register', 'expression-spoken-transfer']),
    review('n3-mock-listening-04-expression', 'fit', EXPRESSION_CONCEPTS[0], 'お先に失礼します', ['excuse me for leaving before you'], EXPRESSION_QUESTIONS[3].audioText, ['expression-apology', 'expression-permission', 'expression-workplace']),
]);
const RESPONSE_REVIEW_TARGETS = Object.freeze([
    review('n3-mock-listening-05-response', 'turn', RESPONSE_CONCEPTS[0], '〜なら大丈夫です', ['... works for me'], RESPONSE_QUESTIONS[1].audioText, ['response-confirmation', 'response-offer', 'response-correction', 'response-permission', 'response-spoken-transfer']),
    review('n3-mock-listening-05-response', 'implication', RESPONSE_CONCEPTS[1], 'それなら', ['in that case'], RESPONSE_QUESTIONS[7].audioText, ['response-aspect', 'response-uncertainty', 'response-yet-plan', 'response-implication']),
]);

const PACKAGES = Object.freeze([
    packageRecord(1, 'n3-mock-listening-01-action', 'task-comprehension', ACTION_CONCEPTS, ACTION_QUESTIONS, [], [], undefined,
        [
            teaching('終わったことを消す', 'Remove completed actions', 'もう〜ました／〜てあります', '完了した作業は答えの候補から外します。', 'Remove actions already marked complete.'),
            teaching('順序語を固定する', 'Anchor sequence words', 'まず／そのあと／〜してから', '順序語の前後を一つの線として追います。', 'Follow what comes before and after each sequence cue.'),
        ],
        ACTION_REVIEW_TARGETS),
    packageRecord(2, 'n3-mock-listening-02-point', 'point-comprehension', POINT_CONCEPTS, POINT_QUESTIONS, ACTION_CONCEPTS, ACTION_REVIEW_TARGETS, 'n3-mock-listening-01-action',
        [
            teaching('否定された候補を消す', 'Eliminate denied candidates', '〜ではありません／〜わけではない', '会話に出た語でも、否定されたものは根拠になりません。', 'A mentioned option is not evidence when the speaker rejects it.'),
            teaching('評価の中心を取る', 'Find the centre of evaluation', '一番の決め手／特に／ただ', '比較や対比の後に残る一点を取ります。', 'Take the one point left after comparison or contrast.'),
        ],
        POINT_REVIEW_TARGETS),
    packageRecord(3, 'n3-mock-listening-03-overview', 'overview-comprehension', OVERVIEW_CONCEPTS, OVERVIEW_QUESTIONS, POINT_CONCEPTS, POINT_REVIEW_TARGETS, 'n3-mock-listening-02-point',
        [
            teaching('詳細を三段に分ける', 'Group details into three moves', '目的→現状→次の判断', '数字や例を取る前に、話の進み方を三段で捉えます。', 'Capture the three-part movement before collecting details.'),
            teaching('最後の主張へ戻る', 'Return to the final claim', '大切なのは〜／鍵は〜', '最後のまとめが、それまでの例を束ねます。', 'The final summary ties the preceding examples together.'),
        ],
        OVERVIEW_REVIEW_TARGETS),
    packageRecord(4, 'n3-mock-listening-04-expression', 'expression-choice', EXPRESSION_CONCEPTS, EXPRESSION_QUESTIONS, OVERVIEW_CONCEPTS, OVERVIEW_REVIEW_TARGETS, 'n3-mock-listening-03-overview',
        [
            teaching('相手の負担を先に見る', 'Notice the burden on the listener', '恐れ入りますが／もしよければ', '依頼では、内容だけでなく相手が断れる余地も作ります。', 'A request should leave the listener room to decline.'),
            teaching('場面に合う定型を選ぶ', 'Choose the expression for the setting', '失礼しました／お先に失礼します', '似た謝罪でも、割り込みと退勤では定型が変わります。', 'Related apologies use different conventions for interruption and departure.'),
        ],
        EXPRESSION_REVIEW_TARGETS, EXPRESSION_PRODUCTION),
    packageRecord(5, 'n3-mock-listening-05-response', 'quick-response', RESPONSE_CONCEPTS, RESPONSE_QUESTIONS, EXPRESSION_CONCEPTS, EXPRESSION_REVIEW_TARGETS, 'n3-mock-listening-04-expression',
        [
            teaching('返事の役割を一つに決める', 'Name the reply function', '確認／訂正／許可／提案', '文法を見る前に、相手が何を求めているか決めます。', 'Decide what the speaker needs before inspecting grammar.'),
            teaching('含まれた条件を受ける', 'Act on the implied condition', 'それなら／〜たところです', '直前の情報から、自然な次の一手を選びます。', 'Use the preceding information to choose the natural next move.'),
        ],
        RESPONSE_REVIEW_TARGETS, RESPONSE_PRODUCTION),
]);

export function createN3MockListeningPackage(id: N3MockListeningPackageId): N3MockListeningPackage {
    const found = PACKAGES.find(packageRecord => packageRecord.id === id);
    if (!found) throw new TypeError(`Unknown N3 mock-listening package: ${id}`);
    return found;
}

export const N3_MOCK_LISTENING_PACKAGES: readonly N3MockListeningPackage[] = PACKAGES;

function packageRecord(
    ordinal: 1 | 2 | 3 | 4 | 5,
    id: N3MockListeningPackageId,
    mechanic: N3MockListeningMechanic,
    concepts: readonly string[],
    questions: readonly N3MockListeningQuestion[],
    delayedReviewOf: readonly string[],
    delayedReviewTargets: readonly N3MockListeningReviewTarget[],
    previousPackageId: N3MockListeningPackageId | undefined,
    teachingPoints: readonly N3MockListeningTeachingPoint[],
    reviewTargets: readonly N3MockListeningReviewTarget[],
    production?: N3MockListeningProduction,
): N3MockListeningPackage {
    const conceptIds = Object.freeze([...new Set([
        ...concepts,
        ...delayedReviewOf,
        ...(production ? [production.conceptId] : []),
    ])]);
    const activity = Object.freeze({
        id: `activity:${id}`,
        kind: 'academy-n3-mock-listening' as const,
        sourceQuestionId: `source:cur-007-n3-mock-listening-v1:${id}`,
        conceptIds,
        responseKind: 'n3-mock-listening-v1' as const,
        curriculumPhase: production ? 'assessed-production' as const : 'assessed-recognition' as const,
        prompt: promptFor(mechanic),
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: Object.freeze({
            kind: 'pattern' as const,
            title: Object.freeze({ ja: 'N3聴解の手がかり', en: 'N3 listening cues' }),
            entries: Object.freeze(teachingPoints.map(point => Object.freeze({ japanese: point.cue, translation: point.explanation.en }))),
        }),
        provenance: Object.freeze({
            batchId: N3_MOCK_LISTENING_BATCH_ID,
            packageId: id,
            sourceRecord: 'module-local:n3-mock-listening/audit.ts' as const,
            sourceCandidateIds: Object.freeze(questions.map(item => item.sourceCandidateId)),
            officialCalibrationIds: Object.freeze(questions.flatMap(item => item.officialCalibrationId ? [item.officialCalibrationId] : [])),
            contentAuthorship: 'original-yomu-with-disclosed-conventional-language' as const,
            protectedSourceWordingDelivered: false as const,
            sourceMediaDelivered: false as const,
            conventionalLanguage: id === 'n3-mock-listening-04-expression'
                ? Object.freeze([Object.freeze({
                    phrase: 'お先に失礼します',
                    policy: 'allowed-conventional-formula' as const,
                    sourceCandidateId: 'soya:n3-mock1:mock1_l_19',
                })])
                : Object.freeze([]),
        }),
        payload: Object.freeze({
            mechanic,
            teaching: Object.freeze(teachingPoints),
            questions: Object.freeze(questions),
            ...(production ? { production } : {}),
            delayedReviewOf: Object.freeze([...delayedReviewOf]),
            delayedReviewTargets: Object.freeze([...delayedReviewTargets]),
            passScore: 1,
            feedback: feedbackFor(mechanic),
            reviewTargets: Object.freeze(reviewTargets),
        }),
    });
    return Object.freeze({
        id,
        band: 'N3' as const,
        sequence: Object.freeze({ ordinal, ...(previousPackageId ? { previousPackageId } : {}) }),
        prerequisites: prerequisites(previousPackageId, delayedReviewOf),
        activity,
        readerSrs: readerSrs(id, questions, reviewTargets, delayedReviewOf),
    });
}

function question(
    sourceOrdinal: number,
    slug: string,
    phase: N3MockListeningPracticePhase,
    audioText: string,
    promptJa: string,
    promptEn: string,
    labels: readonly (readonly [string, string])[],
    answerIndex: number,
    explanationJa: string,
    explanationEn: string,
    errorTag: string,
    conceptId: string,
    officialCalibrationId?: string,
): N3MockListeningQuestion {
    const id = `n3-${slug}-${String(sourceOrdinal < 7 ? sourceOrdinal : sourceOrdinal - ({ point: 6, overview: 12, expression: 15, response: 19 } as const)[slug as 'point' | 'overview' | 'expression' | 'response']).padStart(2, '0')}`;
    const options = Object.freeze(labels.map(([ja, en], index) => Object.freeze({ id: `${id}-option-${index + 1}`, label: Object.freeze({ ja, en }) })));
    return Object.freeze({
        id,
        sourceCandidateId: `soya:n3-mock1:mock1_l_${String(sourceOrdinal).padStart(2, '0')}`,
        ...(officialCalibrationId ? { officialCalibrationId } : {}),
        phase,
        audioText,
        prompt: Object.freeze({ ja: promptJa, en: promptEn }),
        options,
        correctOptionId: options[answerIndex].id,
        explanation: Object.freeze({ ja: explanationJa, en: explanationEn }),
        errorTag,
        conceptId,
    });
}

function teaching(ja: string, en: string, cue: string, explanationJa: string, explanationEn: string): N3MockListeningTeachingPoint {
    return Object.freeze({ title: Object.freeze({ ja, en }), cue, explanation: Object.freeze({ ja: explanationJa, en: explanationEn }) });
}

function review(
    packageId: N3MockListeningPackageId,
    suffix: string,
    conceptId: string,
    expression: string,
    meanings: readonly string[],
    sentence: string,
    repairFor: readonly string[],
): N3MockListeningReviewTarget {
    return Object.freeze({ id: `review:${packageId}:${suffix}`, conceptId, expression, meanings: Object.freeze([...meanings]), sentence, repairFor: Object.freeze([...repairFor]) });
}

function prerequisites(previousPackageId: N3MockListeningPackageId | undefined, delayedReviewOf: readonly string[]): readonly N3MockListeningPrerequisite[] {
    if (!previousPackageId) {
        return Object.freeze([prerequisite('listening:n4-sequence-cues', '「まず」「そのあと」で順序を追った経験があること。', 'Has practised following mazu and sono ato.')]);
    }
    return Object.freeze([
        prerequisite(delayedReviewOf[0] ?? 'listening:n3-action-priority', `前段の${previousPackageId}を試行済みであること。`, `Has attempted the preceding package ${previousPackageId}.`),
    ]);
}

function prerequisite(conceptId: string, ja: string, en: string): N3MockListeningPrerequisite {
    return Object.freeze({ conceptId, minimumEvidence: 'introduced-and-attempted', reason: Object.freeze({ ja, en }) });
}

function readerSrs(
    packageId: N3MockListeningPackageId,
    questions: readonly N3MockListeningQuestion[],
    targets: readonly N3MockListeningReviewTarget[],
    delayedReviewOf: readonly string[],
): N3MockListeningReaderSrsProjection {
    const miningRequests: MiningRequest[] = targets.map(target => ({
        expression: target.expression,
        sentence: target.sentence,
        sourceTitle: 'Yomu original N3 mock-listening adaptation',
        conceptIds: [target.conceptId],
    }));
    return Object.freeze({
        readerSurfaceIds: Object.freeze(questions.map(question => `reader:${packageId}:${question.id}:transcript`)),
        miningRequests: Object.freeze(miningRequests),
        delayedReviewOf: Object.freeze([...delayedReviewOf]),
    });
}

function promptFor(mechanic: N3MockListeningMechanic) {
    return ({
        'task-comprehension': Object.freeze({ ja: '完了した作業と、これから最初にする作業を聞き分けましょう。', en: 'Separate completed work from the first action that remains.' }),
        'point-comprehension': Object.freeze({ ja: '否定や対比を越えて、話し手の決め手を聞き取りましょう。', en: 'Listen through denials and contrasts to the speaker\'s decisive point.' }),
        'overview-comprehension': Object.freeze({ ja: '細部をまとめ、話の目的と最後の主張を捉えましょう。', en: 'Group the details to identify purpose and the final claim.' }),
        'expression-choice': Object.freeze({ ja: '相手・負担・場面に合う表現を選び、別の場面で声に出しましょう。', en: 'Choose language that fits the listener, burden, and setting, then say it in a new context.' }),
        'quick-response': Object.freeze({ ja: '短い発話の役割を捉え、自然な次の一言へつなぎましょう。', en: 'Identify what a short turn does and supply the natural next response.' }),
    } as const)[mechanic];
}

function feedbackFor(mechanic: N3MockListeningMechanic) {
    const label = mechanic.replaceAll('-', ' ');
    return Object.freeze({
        pass: Object.freeze({ explanation: Object.freeze({ ja: '手がかりを使い、オリジナルのN3聴解課題を別の場面まで運べました。', en: `You used the cues and transferred the ${label} mechanic into new contexts.` }) }),
        lapse: Object.freeze({
            explanation: Object.freeze({ ja: '聞こえた単語だけで決めず、否定・順序・対比・場面の役割をもう一度確認しましょう。', en: 'Check negation, sequence, contrast, and conversational function instead of choosing from a single heard word.' }),
            repairPrompt: Object.freeze({ ja: '間違えた項目だけ、決め手になる合図を一つメモしてから聞き直してください。', en: 'Replay only the missed items and note one decisive cue before choosing again.' }),
            nearbyExample: Object.freeze({ ja: '準備は終わりました。ただ、名簿が変わったので、まず印刷し直します。', en: 'Preparation is finished. However, the roster changed, so first I will print it again.' }),
        }),
    });
}

if (PACKAGES.map(packageRecord => packageRecord.id).join('|') !== N3_MOCK_LISTENING_PACKAGE_IDS.join('|')) {
    throw new TypeError('N3 mock-listening package order must match the canonical route order.');
}
