import type { JlptBand } from '../domain/learner-record';
import type {
    PlacementAudioProvenance,
    PlacementItem,
    PlacementItemProvenance,
    ReceptivePlacementSkill,
} from './orientation';

interface ExactSourceItem {
    readonly id: string;
    readonly band: JlptBand;
    readonly skill: ReceptivePlacementSkill;
    readonly sourceFile: keyof typeof SOURCE_FILE_SHA256;
    readonly prompt: { readonly en: string; readonly ja: string };
    readonly passage?: string;
    readonly spokenJapanese?: string;
    readonly choices: readonly string[];
    readonly answer: string;
    readonly choiceOrder?: 'deterministic-derived';
    readonly audio?: PlacementAudioProvenance;
}

const SOURCE_FILE_SHA256 = {
    'data/courses/jlpt_n5/mock1_vocab.js': '2ce50c3d647c3f2922d0664e3c52cf764ce56aa4fca2b685b0fa6089af08fee8',
    'data/courses/jlpt_n5/mock1_grammar_reading.js': '6a09b05f90b6894f2f1383f2a135a8cf9f6f0c50c9346811e532601c0f239723',
    'data/courses/jlpt_n5/mock1_listening.js': 'cb767000df4ba433346cb1d9310d1efaa542e908bc256d84d902ca649dbd2412',
    'data/courses/jlpt_n4/mock1_vocab.js': '8a9032265632957d63ffebc3ff4b112dc8053ea0e2b2fb3ea089d941ea728433',
    'data/courses/jlpt_n4/mock1_grammar_reading.js': 'f297d12c00c502f3de3c313b6ae80a54caa875f5d34d2ea583ef44a01fc4fcc8',
    'data/courses/jlpt_n4/mock1_listening.js': '28e86cd5bc7f2914f88fe85dedee6039cc01ab159f85bb8f1339500e029a8753',
    'data/courses/jlpt_n3/mock1_vocab.js': 'd63e939f1c8c6e71834ab37d16e66c437a551dbf6812fa6122407daefda127cd',
    'data/courses/jlpt_n3/mock1_grammar.js': 'f70938aba899028c5712a2f05fcac54bca4bec5353c5e13bf0f04cb4fb655281',
    'data/courses/jlpt_n3/mock1_reading.js': 'b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35',
    'data/courses/jlpt_n3/mock1_listening.js': '2c37b6f24b68c60f1abb234157e3428bad5da7690a3d51b11ee2c0b5cb8a6e71',
    'data/courses/jlpt_n2/mock_test_no1.js': '4665de0aab5656717c930508ee9b92e60d11f71d5030482b86ea31b7a50b5aa5',
    'data/questions_jlpt_n1.js': '323ae01802c200a8353d088f02ca9054c42748b580b585c9cc740cbae2c13dd5',
} as const;

function recorded(
    sourcePath: string,
    remoteUrl: string,
    sha256: string,
    deliveryLocator?: string,
): PlacementAudioProvenance {
    return {
        sourceAvailability: 'recorded-source',
        runtimeDelivery: deliveryLocator ? 'packaged-source-recording' : 'browser-speech-synthesis',
        transcriptFidelity: 'exact-utterance-text',
        ...(deliveryLocator ? { deliveryLocator } : {}),
        sourcePath,
        remoteUrl,
        sha256,
    };
}

const SOURCE_ITEMS: readonly ExactSourceItem[] = [
    {
        id: 'n5_mock1_v_01', band: 'n5', skill: 'language-knowledge',
        sourceFile: 'data/courses/jlpt_n5/mock1_vocab.js',
        prompt: { en: 'きのう 【友だち】 と 映画を 見ました。', ja: 'きのう 【友だち】 と 映画を 見ました。' },
        choices: ['ともだち', 'ゆうだち', 'ともたち', 'ゆうたち'], answer: 'ともだち',
    },
    {
        id: 'n5_mock1_gr_01', band: 'n5', skill: 'language-knowledge',
        sourceFile: 'data/courses/jlpt_n5/mock1_grammar_reading.js',
        prompt: { en: 'わたし （　　　） がくせいです。', ja: 'わたし （　　　） がくせいです。' },
        choices: ['は', 'を', 'に', 'で'], answer: 'は',
    },
    {
        id: 'n5_mock1_gr_27', band: 'n5', skill: 'reading',
        sourceFile: 'data/courses/jlpt_n5/mock1_grammar_reading.js',
        passage: 'わたしの かぞくは ちちと ははと あねが います。わたしは ４にんかぞくです。あねは だいがくせいで、わたしは こうこうせいです。ちちは かいしゃいんで、ははは びょういんで はたらいて います。',
        prompt: { en: 'この 人の おかあさんは どこで はたらいて いますか。', ja: 'この 人の おかあさんは どこで はたらいて いますか。' },
        choices: ['がっこう', 'かいしゃ', 'びょういん', 'だいがく'], answer: 'びょういん',
    },
    {
        id: 'n5_mock1_gr_28', band: 'n5', skill: 'reading',
        sourceFile: 'data/courses/jlpt_n5/mock1_grammar_reading.js',
        passage: '「田中さん、きのうは ありがとうございました。本を かりましたが、まだ よんで いません。あしたの ゆうがた、かえします。」',
        prompt: { en: 'いつ 本を かえしますか。', ja: 'いつ 本を かえしますか。' },
        choices: ['きのう', 'きょうの ゆうがた', 'あしたの あさ', 'あしたの ゆうがた'], answer: 'あしたの ゆうがた',
    },
    {
        id: 'n5_mock1_l_04', band: 'n5', skill: 'listening',
        sourceFile: 'data/courses/jlpt_n5/mock1_listening.js',
        prompt: { en: '男の人と 女の人が 話しています。女の人は どの ケーキを 買いますか。', ja: '男の人と 女の人が 話しています。女の人は どの ケーキを 買いますか。' },
        spokenJapanese: '男の人と 女の人が 話しています。女の人は どの ケーキを 買いますか。\nすみません、この ケーキを ３つ ください。\nわたしも 買いたいです。ええと、いちごの ケーキと チョコレートの ケーキが ありますね。\nいちごの ケーキは ひとつ 400円で、チョコレートの ケーキは ひとつ 300円ですよ。\nじゃあ、わたしは チョコレートの ケーキを ふたつ お願いします。',
        choices: ['いちごの ケーキを ひとつ', 'いちごの ケーキを ふたつ', 'チョコレートの ケーキを ひとつ', 'チョコレートの ケーキを ふたつ'], answer: 'チョコレートの ケーキを ふたつ',
        audio: recorded('/assets/audio/n5_mock1/n5_mock1_l_04.mp3', 'https://soya-eagle-online.com/assets/audio/n5_mock1/n5_mock1_l_04.mp3', 'da546db7dbceaf3eafbe21f69767f2c954d831817fe3f3307c7deb24be12c664', 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_04.mp3'),
    },
    {
        id: 'n5_mock1_l_11', band: 'n5', skill: 'listening',
        sourceFile: 'data/courses/jlpt_n5/mock1_listening.js',
        prompt: { en: '男の人と 女の人が 話しています。男の人は 何が いちばん すきですか。', ja: '男の人と 女の人が 話しています。男の人は 何が いちばん すきですか。' },
        spokenJapanese: '男の人と 女の人が 話しています。男の人は 何が いちばん すきですか。\n田中さんは、くだものが すきですか。\nはい、すきです。\nどんな くだものが すきですか。りんごですか、みかんですか。\nりんごも みかんも すきですが、いちばん 好きなのは ぶどうです。',
        choices: ['りんご', 'みかん', 'ぶどう', 'バナナ'], answer: 'ぶどう',
        audio: recorded('/assets/audio/n5_mock1/n5_mock1_l_11.mp3', 'https://soya-eagle-online.com/assets/audio/n5_mock1/n5_mock1_l_11.mp3', '32c6d0a7692f3d5aec633c615f2c1b727deda0859e5f492fd3f444b56f029ac8', 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_11.mp3'),
    },

    {
        id: 'n4_mock1_v_01', band: 'n4', skill: 'language-knowledge',
        sourceFile: 'data/courses/jlpt_n4/mock1_vocab.js',
        prompt: { en: '部長の【意見】を聞きましょう。', ja: '部長の【意見】を聞きましょう。' },
        choices: ['いげん', 'いけん', 'おげん', 'おけん'], answer: 'いけん',
    },
    {
        id: 'n4_mock1_gr_01', band: 'n4', skill: 'language-knowledge',
        sourceFile: 'data/courses/jlpt_n4/mock1_grammar_reading.js',
        prompt: { en: 'ケーキをたくさん食べたので、もうおなかがいっぱいで（　　）。', ja: 'ケーキをたくさん食べたので、もうおなかがいっぱいで（　　）。' },
        choices: ['食べられません', '食べさせません', '食べません', '食べさせられません'], answer: '食べられません',
    },
    {
        id: 'n4_mock1_gr_26', band: 'n4', skill: 'reading',
        sourceFile: 'data/courses/jlpt_n4/mock1_grammar_reading.js',
        passage: '田中さんへ\n明日の会議の資料ですが、今日の午後5時までに、私の机の上に置いておいてください。もし、間に合わない場合は、メールで送ってください。よろしくお願いします。\n山田',
        prompt: { en: '山田さんは田中さんに、今日の午後5時までに何をしてほしいと言っていますか。', ja: '山田さんは田中さんに、今日の午後5時までに何をしてほしいと言っていますか。' },
        choices: ['会議の資料を山田さんの机の上に置くこと。', '会議の資料をメールで送ること。', '会議の資料を山田さんの机の上に置くか、メールで送ること。', '会議の資料が間に合わないとメールで連絡すること。'], answer: '会議の資料を山田さんの机の上に置くこと。',
    },
    {
        id: 'n4_mock1_gr_27', band: 'n4', skill: 'reading',
        sourceFile: 'data/courses/jlpt_n4/mock1_grammar_reading.js',
        passage: 'この図書館では、本を借りるとき、カードが必要です。カードを作るには、名前と住所がわかるもの（運転免許証など）を持ってきてください。外国人の場合は、在留カードも必要です。カードは、その日に作ることができます。',
        prompt: { en: '外国人がこの図書館でカードを作るとき、何が必要ですか。', ja: '外国人がこの図書館でカードを作るとき、何が必要ですか。' },
        choices: ['運転免許証だけです。', '名前と住所がわかるものと在留カードです。', '在留カードだけです。', '名前と住所がわかるものだけです。'], answer: '名前と住所がわかるものと在留カードです。',
    },
    {
        id: 'n4_mock1_l_07', band: 'n4', skill: 'listening',
        sourceFile: 'data/courses/jlpt_n4/mock1_listening.js',
        prompt: { en: '学生は、まず何をしますか。', ja: '学生は、まず何をしますか。' },
        spokenJapanese: '七番。料理教室で、先生が話しています。学生は、まず何をしますか。\nはい、みなさん。今日はカレーを作ります。まず、野菜を洗いましょう。人参、じゃがいも、玉ねぎですね。きれいに洗ったら、皮をむいて、小さく切ってください。肉は後で切ります。では、始めてください。\n学生は、まず何をしますか。',
        choices: ['1. 野菜を切ります。', '2. 野菜の皮をむきます。', '3. 野菜を洗います。', '4. 肉を切ります。'], answer: '3. 野菜を洗います。',
        audio: recorded('/assets/audio/n4_mock1/n4_mock1_l_07.mp3', 'https://soya-eagle-online.com/assets/audio/n4_mock1/n4_mock1_l_07.mp3', '27b602fbade55bf2c1713da903033945f02e8bacc3bebcc5cdca59c836e8240a'),
    },
    {
        id: 'n4_mock1_l_10', band: 'n4', skill: 'listening',
        sourceFile: 'data/courses/jlpt_n4/mock1_listening.js',
        prompt: { en: '明日の午後の天気はどうなりますか。', ja: '明日の午後の天気はどうなりますか。' },
        spokenJapanese: '二番。天気予報を聞いています。明日の午後の天気はどうなりますか。\n今日の天気は晴れでしたが、明日は天気が変わります。午前中は曇りですが、昼過ぎから雨が降り始めるでしょう。夜には雨が強くなりそうです。傘を忘れないようにしてください。\n明日の午後の天気はどうなりますか。',
        choices: ['1. 晴れです。', '2. 曇りです。', '3. 雨です。', '4. 晴れのち曇りです。'], answer: '3. 雨です。',
        audio: recorded('/assets/audio/n4_mock1/n4_mock1_l_10.mp3', 'https://soya-eagle-online.com/assets/audio/n4_mock1/n4_mock1_l_10.mp3', 'cc15af016afaa7a481b41f86d550f6e68cc220d58b96cbe43d7601a6cd676a52'),
    },

    {
        id: 'mock1_v_01', band: 'n3', skill: 'language-knowledge',
        sourceFile: 'data/courses/jlpt_n3/mock1_vocab.js',
        prompt: { en: '彼と再会を【約束】した。', ja: '彼と再会を【約束】した。' },
        choices: ['やくそく', 'ようそく', 'やっそく', 'よっそく'], answer: 'やくそく',
    },
    {
        id: 'mock1_g_01', band: 'n3', skill: 'language-knowledge',
        sourceFile: 'data/courses/jlpt_n3/mock1_grammar.js',
        prompt: { en: 'このパソコンは、初心者（　　　）使いやすい。', ja: 'このパソコンは、初心者（　　　）使いやすい。' },
        choices: ['にしたら', 'にしては', 'にとっても', 'にすぎない'], answer: 'にとっても',
    },
    {
        id: 'mock1_r_02', band: 'n3', skill: 'reading',
        sourceFile: 'data/courses/jlpt_n3/mock1_reading.js',
        passage: '山田様\n明日の会議ですが、午後2時から午後3時に変更になりました。場所は第1会議室で変わりありません。よろしくお願いいたします。 \n佐藤',
        prompt: { en: "Which is correct about tomorrow's meeting?", ja: '明日の会議について、正しいものはどれか。' },
        choices: ['時間も場所も変わった。', '時間は変わったが、場所は変わらない。', '時間は変わらないが、場所が変わった。', '時間も場所も変わらない。'], answer: '時間は変わったが、場所は変わらない。',
    },
    {
        id: 'mock1_r_03', band: 'n3', skill: 'reading',
        sourceFile: 'data/courses/jlpt_n3/mock1_reading.js',
        passage: '昔の人は夜になると寝て、朝になると起きる生活をしていた。しかし、電気が発明されてから、夜遅くまで起きている人が多くなった。便利になった一方で、睡眠不足で疲れている人も増えているようだ。',
        prompt: { en: 'What happened after electricity was invented?', ja: '電気が発明されてから、どうなったか。' },
        choices: ['夜になるとすぐ寝る人が増えた。', '朝早く起きる人が増えた。', '夜遅くまで起きている人が増えた。', '疲れない人が増えた。'], answer: '夜遅くまで起きている人が増えた。',
    },
    {
        id: 'mock1_l_05', band: 'n3', skill: 'listening',
        sourceFile: 'data/courses/jlpt_n3/mock1_listening.js',
        prompt: { en: 'What do the students need to do during this class?', ja: '学生はこの授業中、何をしなければなりませんか。' },
        spokenJapanese: '教室で先生が話しています。学生はこの授業中、何をしなければなりませんか。\nえー、今日は教科書の20ページから進める予定でしたが、その前に前回配ったプリントの復習をします。今から10分時間を与えますので、プリントの問題を解いてください。宿題の提出は、授業の最後に行います。それと、黒板の字はまだノートに写さなくていいですよ。\n学生はこの授業中（今から）、何をしなければなりませんか。\n1. 教科書の20ページを読む。2. 宿題を提出する。3. プリントの問題を解く。4. ノートを写す。',
        choices: ['教科書の20ページを読む', '宿題を提出する', 'プリントの問題を解く', 'ノートを写す'], answer: 'プリントの問題を解く',
        audio: recorded('/audio/mock1/mock1_l_05.mp3', 'https://soya-eagle-online.com/audio/mock1/mock1_l_05.mp3', '75d494710c9fe11243553ce71a8f30fa7395c456a0b014636ef89054c42e11f6'),
    },
    {
        id: 'mock1_l_10', band: 'n3', skill: 'listening',
        sourceFile: 'data/courses/jlpt_n3/mock1_listening.js',
        prompt: { en: 'Why did the man choose this smartphone?', ja: '男の人がこのスマートフォンを選んだ理由は何ですか。' },
        spokenJapanese: '男の人が携帯電話ショップで話しています。男の人がこのスマートフォンを選んだ理由は何ですか。\nすみません、この機種をください。色々迷ったんですが、これにします。デザインや軽さも魅力的なんですけど、仕事で外に出ていることが多くて、途中で充電が切れるのが一番困るんですよ。これなら夜まで安心して使えそうなので。\n男の人がこのスマートフォンを選んだ理由は何ですか。',
        choices: ['デザインが良いから', '電池が長持ちするから', 'カメラの性能が良いから', '軽いから'], answer: '電池が長持ちするから',
        audio: recorded('/audio/mock1/mock1_l_10.mp3', 'https://soya-eagle-online.com/audio/mock1/mock1_l_10.mp3', '07a2a5a708f5a6ea42e435d8df261fbca7f00e7ffe3cab587a450b177583c4c3'),
    },

    {
        id: 'n2_m1_kanji_reading_0_1', band: 'n2', skill: 'language-knowledge',
        sourceFile: 'data/courses/jlpt_n2/mock_test_no1.js',
        prompt: { en: '最近、___が回復してきた。', ja: '最近、___が回復してきた。' },
        choices: ['けいき', 'けいぎ', 'けしき', 'ふうき'], answer: 'けいき',
    },
    {
        id: 'n2_m1_grammar_form_0_1', band: 'n2', skill: 'language-knowledge',
        sourceFile: 'data/courses/jlpt_n2/mock_test_no1.js',
        prompt: { en: '新しい制度の導入___、働き方が多様化した。', ja: '新しい制度の導入___、働き方が多様化した。' },
        choices: ['に伴って', 'をめぐって', 'ものとして', 'からには'], answer: 'に伴って',
    },
    {
        id: 'n2_m1_reading_short_2_1', band: 'n2', skill: 'reading',
        sourceFile: 'data/courses/jlpt_n2/mock_test_no1.js', choiceOrder: 'deterministic-derived',
        passage: '住民の皆様へ。来月より、燃えるゴミの収集ルールが一部変更になります。これまでは週三回でしたが、週二回（月・木）となります。また、ペットボトルは燃えるゴミと一緒に出せず、金曜日の資源ゴミの日に出すことになりました。分別の徹底にご協力いただけない場合、ゴミが回収されないこともありますので、ご注意ください。',
        prompt: { en: 'What is the main point of this notice?', ja: 'このお知らせで最も伝えたいことは何か。' },
        choices: ['燃えるゴミの収集が週一回に減ること。', 'ペットボトルは燃えるゴミと分けて出す必要があること。', 'ゴミ出しの時間が変更されたこと。', '全てのゴミを同じ日に出す必要があること。'], answer: 'ペットボトルは燃えるゴミと分けて出す必要があること。',
    },
    {
        id: 'n2_m1_reading_short_2_2', band: 'n2', skill: 'reading',
        sourceFile: 'data/courses/jlpt_n2/mock_test_no1.js', choiceOrder: 'deterministic-derived',
        passage: '件名：会議資料のご確認\n鈴木さん\nお疲れ様です。田中です。来週の会議で使うプレゼン資料ですが、私の担当分ができましたので添付します。お忙しいところ恐縮ですが、内容に間違いがないか、特に5ページ目のデータをご確認いただけますでしょうか。ご確認後、鈴木さん担当の売上予測のグラフを追加して、明日の午前中までに私に返信していただけると助かります。よろしくお願いします。',
        prompt: { en: 'What does Tanaka want Suzuki to do?', ja: '田中さんが鈴木さんにしてほしいことは何か。' },
        choices: ['新しいプレゼン資料を一から作成すること。', '売上予測のデータだけを田中さんに送ること。', '資料の内容を確認し、グラフを追加して返信すること。', '今日中に資料の修正を終えること。'], answer: '資料の内容を確認し、グラフを追加して返信すること。',
    },
    {
        id: 'n2_m1_listening_point_3_1', band: 'n2', skill: 'listening',
        sourceFile: 'data/courses/jlpt_n2/mock_test_no1.js', choiceOrder: 'deterministic-derived',
        prompt: { en: 'Why did the woman decide not to apply for this job?', ja: '女の人は、どうしてこの仕事に応募しないことにしましたか。' },
        spokenJapanese: '会社で、女の人と男の人が話しています。女の人は、どうしてこの仕事に応募しないことにしましたか。\n佐藤さん、この求人見た？うちの会社の経理部。佐藤さん、経験もあるし、ぴったりじゃない？\nあ、これね。私も見たわ。給料も悪くないし、勤務地も今より近くなるから、いいなあとは思ったんだけどね。\nじゃあ、応募してみれば？締め切り、明日だよ。\nうーん、それがね…。よく見たら、海外出張が年に数回あるって書いてあって。\nああ、本当だ。でも、海外に行けるなんて、いいじゃないか。\n小さい子供がいるから、今はちょっと難しいのよ。泊まりがけの出張は、国内でも厳しいくらいで。せっかくいい条件だと思ったんだけど、今回は見送ることにしたわ。\nそっかあ。事情があるなら仕方ないね。',
        choices: ['給料が安いから', '勤務地が遠いから', '海外出張があるから', '経理の経験がないから'], answer: '海外出張があるから',
        audio: recorded('/assets/audio/n2_mock1/n2_m1_listening_point_3_1.mp3', 'https://soya-eagle-online.com/assets/audio/n2_mock1/n2_m1_listening_point_3_1.mp3', '2cac29860f4894536fa855d2714c0a04e77ae96fc0a49977fc5f901e180062da'),
    },
    {
        id: 'n2_m1_listening_summary_3_1', band: 'n2', skill: 'listening',
        sourceFile: 'data/courses/jlpt_n2/mock_test_no1.js', choiceOrder: 'deterministic-derived',
        prompt: { en: 'What does the man say is most important regarding time-saving appliances?', ja: '男の人は、時短家電について主に何が大切だと言っていますか。' },
        spokenJapanese: '男の人が話しています。\n最近、ロボット掃除機や自動調理鍋といった、いわゆる「時短家電」が人気を集めていますね。家事にかかる時間を短縮してくれるこれらの製品は、忙しい現代人にとって確かに魅力的です。空いた時間を趣味や家族との対話に使えれば、生活はより豊かになるでしょう。しかし、一方で、こうした家電は高価なものが多く、導入には慎重にならざるを得ません。また、何でも機械任せにすることで、人間が本来持っていた生活の知恵や能力が失われるのではないかという懸念の声も聞かれます。便利さを追求するあまり、大切な何かを見失ってはいないか。単に時間を節約するだけでなく、その生まれた時間をどう有意義に使うか、という視点を持つことが、これからの家電との付き合い方で最も重要になるのではないでしょうか。\n男の人は、時短家電について主に何が大切だと言っていますか。',
        choices: ['できるだけ価格の安い製品を選ぶこと', '生まれた時間をどう活用するかを考えること', '家事の能力が低下しないよう注意すること', '家族と過ごす時間を最優先にすること'], answer: '生まれた時間をどう活用するかを考えること',
        audio: recorded('/assets/audio/n2_mock1/n2_m1_listening_summary_3_1.mp3', 'https://soya-eagle-online.com/assets/audio/n2_mock1/n2_m1_listening_summary_3_1.mp3', '1490d0b5f287864b014fed4ea26e5ad4c10ef702658e5c527943340976ee4d4b'),
    },

    {
        id: 'n1_p_1', band: 'n1', skill: 'language-knowledge', sourceFile: 'data/questions_jlpt_n1.js',
        prompt: { en: '彼の行動は、常識 ___ 考えられない。', ja: '彼の行動は、常識 ___ 考えられない。' },
        choices: ['から言って', 'を問わず', 'からすると', 'からには'], answer: 'からすると',
    },
    {
        id: 'n1_k_1', band: 'n1', skill: 'language-knowledge', sourceFile: 'data/questions_jlpt_n1.js',
        prompt: { en: '貢献', ja: '貢献' },
        choices: ['こうけん', 'こうがん', 'ごうけん', 'きょうけん'], answer: 'こうけん',
    },
    {
        id: 'n1_r_1', band: 'n1', skill: 'reading', sourceFile: 'data/questions_jlpt_n1.js', choiceOrder: 'deterministic-derived',
        passage: '近代化は我々に物質的な豊かさをもたらしたが、同時に精神的な孤立をも深めたと言える。情報機器の発達により、世界中の人々と即座に繋がることが可能になったにもかかわらず、皮肉なことに、身近な他者との対面的なコミュニケーションは減少しつつある。我々は「接続」されているが、「結びついて」はいないのである。',
        prompt: { en: "What is the 'ironic situation' the author describes?", ja: '筆者が述べている「皮肉なこと」とはどのような状況か。' },
        choices: ['物質的な豊かさが手に入ったのに、社会が近代化していないこと', '世界中の人と繋がれるのに、身近な人との直接的な交流が減っていること', '情報機器が発達したせいで、インターネットの接続が悪くなったこと', '精神的に孤立しているため、世界中の誰とも繋がれないこと'], answer: '世界中の人と繋がれるのに、身近な人との直接的な交流が減っていること',
    },
    {
        id: 'n1_r_2', band: 'n1', skill: 'reading', sourceFile: 'data/questions_jlpt_n1.js', choiceOrder: 'deterministic-derived',
        passage: '歴史を学ぶ意義は、過去の事実を暗記することにあるのではない。過去の事例を鏡として、現在の私たちが直面している問題の本質を客観的に見極め、未来への指針を得る点にこそ、その真価がある。歴史を知らない者は、また同じ過ちを繰り返す危険性が高い。',
        prompt: { en: 'According to the author, what is the most important purpose of studying history?', ja: '筆者によれば、歴史を学ぶ最も重要な目的はどれか。' },
        choices: ['過去の事実や年号を正確に暗記してテストに備えること', '過去の偉人の業績を賛美し、後世へと語り継ぐこと', '過去を参考に現在を理解し、未来の方向性を見出すこと', '現代の問題を過去の過ちのせいにして責任を逃れること'], answer: '過去を参考に現在を理解し、未来の方向性を見出すこと',
    },
    {
        id: 'n1_l_1', band: 'n1', skill: 'listening', sourceFile: 'data/questions_jlpt_n1.js',
        prompt: { en: 'As for the agenda of the next meeting', ja: 'As for the agenda of the next meeting' },
        spokenJapanese: 'つぎのかいぎのぎだいですが、しりょうのさくせいがまにあわず、らいしゅうにもちこすことになりました。',
        choices: ['議題は来週の会議へ延期になった', '来週の会議には資料が不要になった', '会議の前に資料を作らなければならない'], answer: '議題は来週の会議へ延期になった',
        audio: {
            sourceAvailability: 'source-text-only',
            runtimeDelivery: 'browser-speech-synthesis',
            transcriptFidelity: 'exact-utterance-text',
        },
    },
    {
        id: 'n1_l_2', band: 'n1', skill: 'listening', sourceFile: 'data/questions_jlpt_n1.js',
        prompt: { en: 'The deadline for this project is the end of this month', ja: 'The deadline for this project is the end of this month' },
        spokenJapanese: 'このプロジェクトはこんげつまつがのうきですので、なんとしてもまにあわせるひつようがあります。みなさん、こんしゅうまつはきゅうじつしゅっきんをおねがいするかもしれません。',
        choices: ['今週末は働く可能性がある', '今月末まで休みはない', 'プロジェクトの納期が延期された'], answer: '今週末は働く可能性がある',
        audio: {
            sourceAvailability: 'source-text-only',
            runtimeDelivery: 'browser-speech-synthesis',
            transcriptFidelity: 'exact-utterance-text',
        },
    },
];

export const ORIENTATION_SOURCE_ITEMS: readonly PlacementItem[] = SOURCE_ITEMS.map(sourceItem => ({
    id: `orientation:${sourceItem.band}:${sourceItem.id}`,
    band: sourceItem.band,
    skill: sourceItem.skill,
    prompt: sourceItem.prompt,
    passage: sourceItem.passage ? { en: sourceItem.passage, ja: sourceItem.passage } : undefined,
    spokenJapanese: sourceItem.spokenJapanese,
    audio: sourceItem.audio,
    referenceId: sourceItem.id,
    provenance: provenance(sourceItem),
    options: sourceItem.choices.map((label, index) => ({
        id: `choice-${index + 1}`,
        label: { en: label, ja: label },
        correct: label === sourceItem.answer,
    })),
}));

function provenance(item: ExactSourceItem): PlacementItemProvenance {
    return {
        sourceScope: 'soya-research',
        sourceItemId: item.id,
        sourceFile: item.sourceFile,
        sourceFileSha256: SOURCE_FILE_SHA256[item.sourceFile],
        contentFidelity: 'exact',
        choiceOrder: item.choiceOrder ?? 'source',
        answerGate: 'after-attempt',
        corpusRightsState: 'item-review-required',
        useAuthorization: 'user-permitted',
    };
}
