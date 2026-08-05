#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './academy-source-pipeline/io.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = path.resolve(repoRoot, '../..');
const lessonsRoot = path.join(repoRoot, 'public/academy/content/lessons');
const crosswalkPath = path.join(repoRoot, 'public/academy/content/listening/listening-crosswalk.v1.json');
const soyaMapPath = path.join(monorepoRoot, 'references/soya-research/listening-question-audio-map.json');
// public/academy only: scripts/sync-academy.cjs rm -rf's docs/public/academy
// and rewrites it from public/academy on every build:academy.
const publicPath = path.join(repoRoot, 'public/academy/content/listening/listening-task-bindings.v1.json');

const schema = 'yomu-academy.listening-task-bindings/v1';

const MOODLE_A45_TASKS = {
    'ex-l20-a45-ogawa': {
        prompt: '小川さんは １日に {3 4 5} 回 食べます。',
        options: ['3', '4', '5'],
        correct: 'moodle-a45-ogawa-5',
        transcript: [
            { speaker: '小川さん', text: '朝ごはんと 昼ごはんと 晩ごはんを 食べます。' },
            { speaker: '小川さん', text: 'それから １０時と ３時に くだものを 食べます。' },
        ],
    },
    'ex-l20-a45-miller': {
        prompt: 'ミラーさんは １年に {1 10 12} 回 出張します。',
        options: ['1', '10', '12'],
        correct: 'moodle-a45-miller-10',
        transcript: [
            { speaker: 'ミラーさん', text: 'だいたい １か月に １回 出張します。' },
            { speaker: 'ミラーさん', text: '８月と １２月は 行きません。' },
        ],
    },
    'ex-l20-a45-tawapon': {
        prompt: 'タワポンさんは １週間に {4 5 7} 回 アルバイトを します。',
        options: ['4', '5', '7'],
        correct: 'moodle-a45-tawapon-5',
        transcript: [
            { speaker: 'タワポンさん', text: '火曜日と 金曜日は 休みます。' },
            { speaker: 'タワポンさん', text: '土曜日と 日曜日は 働きます。' },
        ],
    },
};

const MOODLE_L19_GRID_TASKS = {
    'ex-l19-a43-order-1': {
        locator: 'academy/content/moodle/audio/l1-l19-a43.mp3',
        audioSha256: '75b031947b395f44f614a544897b2c4f8d5cca0885b8b1a525360dd07cdf0372',
        prompt: '何を いくつ 注文しましたか。',
        fields: ['コーヒー', '紅茶', 'ジュース', 'ミルク', 'ビール', 'サンドイッチ', 'カレーライス'],
        answers: ['', '1', '', '', '1', '2', ''],
        transcript: [
            { speaker: '音声', text: '一番、何をいくつ注文しましたか。' },
            { speaker: '例', text: 'いらっしゃいませ。えーっと、コーヒー一つとミルク一つ。はい、かしこまりました。' },
            { speaker: '１', text: 'いらっしゃいませ、こちらへどうぞ。えーっと、私は紅茶とサンドイッチ。私は、うーん、ビールありますか。はい、あります。じゃあ、ビール。あ、それから私もサンドイッチください。はい、紅茶一つ、ビール一つ、サンドイッチ二つですね。かしこまりました。' },
            { speaker: '２', text: 'いらっしゃいませ。えーっと、私はカレーライス。私も。私はサンドイッチ。はい。それからジュース。私も。はい、カレーライス二つとサンドイッチ一つ、ジュース三つですね。いいえ、ジュースは二つです。かしこまりました。' },
        ],
    },
    'ex-l19-a43-order-2': {
        locator: 'academy/content/moodle/audio/l1-l19-a43.mp3',
        audioSha256: '75b031947b395f44f614a544897b2c4f8d5cca0885b8b1a525360dd07cdf0372',
        prompt: '何を いくつ 注文しましたか。',
        fields: ['コーヒー', '紅茶', 'ジュース', 'ミルク', 'ビール', 'サンドイッチ', 'カレーライス'],
        answers: ['', '', '2', '', '', '1', '2'],
        transcript: [
            { speaker: '音声', text: '一番、何をいくつ注文しましたか。' },
            { speaker: '例', text: 'いらっしゃいませ。えーっと、コーヒー一つとミルク一つ。はい、かしこまりました。' },
            { speaker: '１', text: 'いらっしゃいませ、こちらへどうぞ。えーっと、私は紅茶とサンドイッチ。私は、うーん、ビールありますか。はい、あります。じゃあ、ビール。あ、それから私もサンドイッチください。はい、紅茶一つ、ビール一つ、サンドイッチ二つですね。かしこまりました。' },
            { speaker: '２', text: 'いらっしゃいませ。えーっと、私はカレーライス。私も。私はサンドイッチ。はい。それからジュース。私も。はい、カレーライス二つとサンドイッチ一つ、ジュース三つですね。いいえ、ジュースは二つです。かしこまりました。' },
        ],
    },
    'ex-l19-a44-family-total': {
        locator: 'academy/content/moodle/audio/l1-l19-a44.mp3',
        audioSha256: 'b076fb0e90d9e1b2cdfe7caab6687b22b0eb354c3ee1b0b2b498154c084979bd',
        prompt: '全部で 何枚、何人、何回、何台ですか。',
        fields: ['子ども', '全部で'],
        answers: ['5', '11'],
        transcript: [
            { speaker: '音声', text: '二番、全部で何枚、何人、何回、何台ですか。' },
            { speaker: '例', text: 'わあ、豊田さん、たくさんCDがありますね。何枚ありますか。日本の歌が百枚、クラシックが二百枚、ジャズが三百枚です。妻は音楽の教師ですから。' },
            { speaker: '１', text: 'これは家族の写真ですか。はい。今年の一月一日に撮りました。たくさんいますね。ええ。左から私、妻、私の両親、妻の両親、そして後ろに子どもが五人います。男の子が三人と女の子が二人ですね。いいですね。ええ。一番上は十八歳、一番下は六歳です。賑やかですよ。' },
            { speaker: '２', text: '豊田さんは旅行が好きですね。去年は何回外国へ行きましたか。そうですね。去年はアメリカへ三回、インドへ一回、ヨーロッパへ四回行きました。あ、韓国も二回行きました。' },
            { speaker: '３', text: 'ああ素敵。これは豊田さんの車ですか。ええ。この黒い車と白い車は私のです。あの赤い車は。あれは妻のです。あちらの小さい車は一番上の子どものです。たくさんありますね。ええ。家族はみんな車が好きですから。' },
        ],
    },
    'ex-l19-a44-trip-total': {
        locator: 'academy/content/moodle/audio/l1-l19-a44.mp3',
        audioSha256: 'b076fb0e90d9e1b2cdfe7caab6687b22b0eb354c3ee1b0b2b498154c084979bd',
        prompt: '全部で 何枚、何人、何回、何台ですか。',
        fields: ['アメリカ', 'インド', 'ヨーロッパ', '全部で'],
        answers: ['3', '1', '4', '10'],
        transcript: [
            { speaker: '音声', text: '二番、全部で何枚、何人、何回、何台ですか。' },
            { speaker: '例', text: 'わあ、豊田さん、たくさんCDがありますね。何枚ありますか。日本の歌が百枚、クラシックが二百枚、ジャズが三百枚です。妻は音楽の教師ですから。' },
            { speaker: '１', text: 'これは家族の写真ですか。はい。今年の一月一日に撮りました。たくさんいますね。ええ。左から私、妻、私の両親、妻の両親、そして後ろに子どもが五人います。男の子が三人と女の子が二人ですね。いいですね。ええ。一番上は十八歳、一番下は六歳です。賑やかですよ。' },
            { speaker: '２', text: '豊田さんは旅行が好きですね。去年は何回外国へ行きましたか。そうですね。去年はアメリカへ三回、インドへ一回、ヨーロッパへ四回行きました。あ、韓国も二回行きました。' },
            { speaker: '３', text: 'ああ素敵。これは豊田さんの車ですか。ええ。この黒い車と白い車は私のです。あの赤い車は。あれは妻のです。あちらの小さい車は一番上の子どものです。たくさんありますね。ええ。家族はみんな車が好きですから。' },
        ],
    },
    'ex-l19-a44-car-total': {
        locator: 'academy/content/moodle/audio/l1-l19-a44.mp3',
        audioSha256: 'b076fb0e90d9e1b2cdfe7caab6687b22b0eb354c3ee1b0b2b498154c084979bd',
        prompt: '全部で 何枚、何人、何回、何台ですか。',
        fields: ['わたしの 車', '妻の 車', 'いちばん上の 子どもの 車', '全部で'],
        answers: ['2', '1', '1', '4'],
        transcript: [
            { speaker: '音声', text: '二番、全部で何枚、何人、何回、何台ですか。' },
            { speaker: '例', text: 'わあ、豊田さん、たくさんCDがありますね。何枚ありますか。日本の歌が百枚、クラシックが二百枚、ジャズが三百枚です。妻は音楽の教師ですから。' },
            { speaker: '１', text: 'これは家族の写真ですか。はい。今年の一月一日に撮りました。たくさんいますね。ええ。左から私、妻、私の両親、妻の両親、そして後ろに子どもが五人います。男の子が三人と女の子が二人ですね。いいですね。ええ。一番上は十八歳、一番下は六歳です。賑やかですよ。' },
            { speaker: '２', text: '豊田さんは旅行が好きですね。去年は何回外国へ行きましたか。そうですね。去年はアメリカへ三回、インドへ一回、ヨーロッパへ四回行きました。あ、韓国も二回行きました。' },
            { speaker: '３', text: 'ああ素敵。これは豊田さんの車ですか。ええ。この黒い車と白い車は私のです。あの赤い車は。あれは妻のです。あちらの小さい車は一番上の子どものです。たくさんありますね。ええ。家族はみんな車が好きですから。' },
        ],
    },
};

const MOODLE_L21_COMMUTE_TASKS = {
    'ex-l21-a46-strike-example': {
        prompt: '2hours by bus / 30mins by tube usually',
        answer: 'バスで ２じかん かかりました。いつも ちかてつで ３０ぷん だけ です。',
    },
    'ex-l21-a46-strike-walk-tube': {
        prompt: '1hour and half on foot / only 15 mins by tube usually',
        answer: 'あるいて １じかん はん かかりました。いつも ちかてつで １５ぷん だけ です。',
    },
    'ex-l21-a46-strike-walk-bus-tube': {
        prompt: 'about 3hours on foot / 45mins by bus and tube usually',
        answer: 'あるいて ３じかん ぐらい かかりました。いつも バスと ちかてつで ４５ぷん です。',
    },
};

const MOODLE_L21_SOURCE_SCRIPT = [
    { speaker: 'A', text: 'きのう ちかてつ の ストライキ が ありましたね。' },
    { speaker: 'B', text: 'ええ、わたし は バス で かいしゃ へ いきました。' },
    { speaker: 'A', text: 'え！かいしゃ まで どのくらい かかりましたか。' },
    { speaker: 'B', text: 'バス で ２じかん かかりました。' },
    { speaker: 'A', text: 'そうでしたか。いつも どのくらい かかりますか。' },
    { speaker: 'B', text: 'ちかてつ で ３０ぷん だけ です。' },
    { speaker: 'A', text: 'たいへんでしたね。' },
    { speaker: 'B', text: 'はい、ほんとうに たいへんでした。' },
];

const MOODLE_L2_L03_B22_SCRIPT = [
    { speaker: '音声', text: '二番、今年の夏休みはどうですか。' },
    { speaker: 'A', text: 'もうすぐ夏ですね。山田さんは夏休みに何をしますか。' },
    { speaker: '山田', text: '夏休みですか。八月に一週間ぐらいありますが、いつも両親のうちへ帰ります。' },
    { speaker: 'A', text: '今年も帰りますか。' },
    { speaker: '山田', text: 'ええ。子どもと釣りに行ったり、山に登ったりします。' },
    { speaker: 'A', text: 'クララさんの夏休みは？' },
    { speaker: 'クララ', text: '今年は九月に家族とインドネシアのバリへ行きます。小さいうちを借りて、三週間ゆっくり休みます。' },
    { speaker: 'クララ', text: '海で泳いだり、本を読んだりしたいです。' },
    { speaker: 'A', text: '三週間ですか。いいですね。' },
];

const MOODLE_L2_L03_B22_TASKS = {
    'moodle:7011919:17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a:pdf-p3:summer-holiday:b22:pin-1': { speaker: 'speaker-a', expression: '山田さん: 八月に一週間ぐらいあり、両親のうちへ帰ります。' },
    'moodle:7011919:17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a:pdf-p3:summer-holiday:b22:pin-2': { speaker: 'speaker-a', expression: '山田さん: 子どもと釣りに行ったり、山に登ったりします。' },
    'moodle:7011919:17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a:pdf-p3:summer-holiday:b22:pin-3': { speaker: 'speaker-b', expression: 'クララさん: 九月に家族とインドネシアのバリへ行き、三週間ゆっくり休みます。' },
    'moodle:7011919:17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a:pdf-p3:summer-holiday:b22:pin-4': { speaker: 'speaker-b', expression: 'クララさん: 海で泳いだり、本を読んだりしたいです。' },
};

const MOODLE_L2_L05_B25_SCRIPT = [
    { speaker: '音声', text: '二番、なな子ちゃんは絵日記をかきました。きょうはどんな一日でしたか。' },
    { speaker: '例・なな子', text: 'ただいま。' },
    { speaker: '例・母', text: 'あ、なな子、お帰りなさい。きょうのテスト、どうだった？' },
    { speaker: '例・なな子', text: '難しかった。' },
    { speaker: '例・母', text: 'そう。' },
    { speaker: '１・なな子', text: 'けんちゃん、元気？ ミルク飲んだ？' },
    { speaker: '１・けん', text: '（赤ちゃんの声）' },
    { speaker: '１・なな子', text: 'たくさん飲んだ。おいしかった？' },
    { speaker: '１・けん', text: '（赤ちゃんの声）' },
    { speaker: '１・なな子', text: 'じゃ、ちょっと散歩する？' },
    { speaker: '１・けん', text: '（赤ちゃんの声）' },
    { speaker: '１・なな子', text: 'お母さん、けんちゃんと散歩に行ってもいい？' },
    { speaker: '１・母', text: 'いいよ。でも、遠いところはだめよ。' },
    { speaker: '１・なな子', text: 'はい。' },
    { speaker: '２・なな子', text: 'ただいま。お母さん、きょうの晩ごはん、何？' },
    { speaker: '２・母', text: 'きょうはね、カレーよ。' },
    { speaker: '２・なな子', text: 'わあ、カレーだ、カレーだ。' },
    { speaker: '２・母', text: '手、洗った？' },
    { speaker: '２・なな子', text: 'ううん、まだ。' },
    { speaker: '２・母', text: 'じゃ、手、洗って。' },
    { speaker: '２・なな子', text: 'はい。いただきます。うっ、からい。' },
    { speaker: '３・なな子', text: 'お父さん、日曜日ひま？' },
    { speaker: '３・父', text: '日曜日？' },
    { speaker: '３・なな子', text: 'ディズニーランドへ行きたい。けんちゃんも一緒に。' },
    { speaker: '３・父', text: '日曜日はゴルフだよ。' },
    { speaker: '３・なな子', text: 'また？ お母さん、お父さんまたゴルフだよ。' },
];

const MOODLE_L2_L05_B25_TASKS = {
    'moodle:6974651:a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd:pdf-p1:b25-diary:item-1': {
        prompt: 'けんちゃんは きょうも げんきだ。ミルクを たくさん（　　　）。いっしょに うちの 近くを（　　　）。',
        fields: ['ミルクを たくさん', 'いっしょに うちの 近くを'],
        answers: ['飲んだ', '散歩した'],
    },
    'moodle:6974651:a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd:pdf-p1:b25-diary:item-2': {
        prompt: 'きょうの ばんごはんは（　　　）。とても（　　　）。',
        fields: ['きょうの ばんごはんは', 'とても'],
        answers: ['カレーだった', 'からかった'],
    },
    'moodle:6974651:a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd:pdf-p1:b25-diary:item-3': {
        prompt: '日曜日 ディズニーランドへ（　　　）けど、お父さんは ゴルフに 行くから、だめだ。お父さん、きらい。',
        fields: ['日曜日 ディズニーランドへ'],
        answers: ['行きたかった'],
    },
};

const MINNA_REVIEWED_SOURCES = {
    'source-minna-069-conversation': {
        packageId: 'l2-l05',
        audioSha256: 'f423d074fd31d9efaf34b359c71fde870abc71b850379af3a526758cee9b5d30',
        answerStatus: 'teacher-script-and-original-audio-reviewed',
        transcript: [
            { speaker: '小林', text: '夏休みは 国へ 帰る？' },
            { speaker: 'タワポン', text: 'ううん。帰りたいけど、……。' },
            { speaker: '小林', text: 'そう。' },
            { speaker: '小林', text: 'タワポン君、富士山に 登った こと ある？' },
            { speaker: 'タワポン', text: 'ううん、ない。' },
            { speaker: '小林', text: 'じゃ、よかったら、いっしょに 行かない？' },
            { speaker: 'タワポン', text: 'うん。いつごろ？' },
            { speaker: '小林', text: '８月の 初めごろは どう？' },
            { speaker: 'タワポン', text: 'いいよ。' },
            { speaker: '小林', text: 'じゃ、いろいろ 調べて、また 電話するよ。' },
            { speaker: 'タワポン', text: 'ありがとう。待ってるよ。' },
        ],
        tasks: {
            'moodle:6974651:01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280:pdf-p1:minna069-conversation:item-1': { prompt: 'タワポン君は、夏休みに国へ帰りますか。', answer: 'いいえ。帰りたいけど、帰りません。' },
            'moodle:6974651:01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280:pdf-p1:minna069-conversation:item-2': { prompt: 'タワポン君は富士山に登ったことがありますか。', answer: 'いいえ、ありません。' },
            'moodle:6974651:01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280:pdf-p1:minna069-conversation:item-3': { prompt: 'タワポン君は小林君と富士山に登りたいですか。', answer: 'はい、一緒に登りたいです。' },
            'moodle:6974651:01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280:pdf-p1:minna069-conversation:item-4': { prompt: 'いつごろ富士山へ行きますか。', answer: '８月の初めごろです。' },
            'moodle:6974651:01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280:pdf-p1:minna069-conversation:item-5': { prompt: '小林君は何をしますか。', answer: 'いろいろ調べて、また電話します。' },
        },
        method: 'Verbatim Moodle conversation questions are paired with the teacher review script and byte-verified Minna 069 recording; the reviewed transcript and answers remain available only after an attempt.',
        response: 'conversation-check',
    },
    'source-minna-072-conversation': {
        packageId: 'l2-l06',
        audioSha256: '71cd9a20f51a1c49a53f02fc6080914e6cf229662710f55bd8f9f2dac269d98c',
        answerStatus: 'original-audio-reviewed',
        transcript: [
            { speaker: '音声', text: '第21課 会話「私もそう思います」' },
            { speaker: '松本', text: 'あっ、サントスさん、久しぶりですね。' },
            { speaker: 'サントス', text: 'あっ、松本さん、お元気ですか。' },
            { speaker: '松本', text: 'ええ。ちょっとビールでも飲みませんか。' },
            { speaker: 'サントス', text: 'いいですね。' },
            { speaker: '松本', text: '今晩10時から日本とブラジルのサッカーの試合がありますね。' },
            { speaker: 'サントス', text: 'ああ、そうですね。' },
            { speaker: '松本', text: 'サントスさんはどちらが勝つと思いますか。' },
            { speaker: 'サントス', text: 'もちろんブラジルですよ。' },
            { speaker: '松本', text: 'そうですね。でも最近日本も強くなりましたよ。' },
            { speaker: 'サントス', text: 'ええ、私もそう思いますが……。' },
            { speaker: 'サントス', text: 'あっ、もう帰らないと……。' },
            { speaker: '松本', text: 'ええ、帰りましょう。' },
        ],
        tasks: {
            'moodle:6974652:bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0:pdf-p1:minna072-conversation:item-1': { prompt: 'サントスさんと 松本さんは 何を 飲みますか。', answer: 'ビールです。' },
            'moodle:6974652:bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0:pdf-p1:minna072-conversation:item-2': { prompt: '今晩 何時から、どこと どこの サッカーの 試合が ありますか。', answer: '今晩10時から、日本とブラジルです。' },
            'moodle:6974652:bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0:pdf-p1:minna072-conversation:item-3': { prompt: 'サントスさんは、どちらの 国が 勝つと 思っていますか。', answer: 'ブラジルです。' },
            'moodle:6974652:bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0:pdf-p1:minna072-conversation:item-4': { prompt: '松本さんは、最近 日本の サッカーは どうなったと 思っていますか。', answer: '最近、日本のサッカーも強くなりました。' },
        },
        method: 'Verbatim Moodle Chapter 21 conversation questions are paired with the byte-verified, audio-reviewed Minna 072 recording; the reviewed transcript and written answers remain available only after an attempt. The support PDF is vocabulary and grammar support, not transcript evidence.',
        response: 'conversation-check',
    },
    'source-minna-074-true-false': {
        packageId: 'l2-l07',
        audioSha256: '2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0',
        answerStatus: 'original-audio-reviewed',
        transcript: [
            { item: 1, speaker: 'A', text: '課長は 2階の 会議室です。今 会議を しています。' },
            { item: 1, speaker: 'B', text: '何時ごろ 終わりますか。' },
            { item: 1, speaker: 'A', text: '3時ごろだと 思いますが。' },
            { item: 1, speaker: 'B', text: 'そうですか。じゃ、また あとで 来ます。' },
            { item: 1, speaker: '文', text: '女の人は これから 会議室へ 行きます。' },
            { item: 2, speaker: 'A', text: '次の サッカーの 試合は 大阪で ありますね。' },
            { item: 2, speaker: 'B', text: 'ええ。日本が 勝つと 思いますか。' },
            { item: 2, speaker: 'A', text: 'そうですね。どちらも 強いですからね。' },
            { item: 2, speaker: '文', text: '男の人は 日本が 勝つと 言いました。' },
            { item: 3, speaker: 'A', text: '今 放送が ありましたね。何と 言いましたか。' },
            { item: 3, speaker: 'B', text: '3階に 喫茶店が あると 言いましたよ。' },
            { item: 3, speaker: 'A', text: 'そうですか。ちょっと 疲れましたね。コーヒーを 飲みに 行きませんか。' },
            { item: 3, speaker: 'B', text: 'ええ、そうしましょう。' },
            { item: 3, speaker: '文', text: '男の人と 女の人は 喫茶店で 休みます。' },
            { item: 4, speaker: 'A', text: '7月に 京都で 有名な お祭りが あるでしょう。' },
            { item: 4, speaker: 'B', text: 'ああ、祇園祭ですね。' },
            { item: 4, speaker: 'A', text: '行った ことが ありますか。' },
            { item: 4, speaker: 'B', text: 'いいえ、ありません。' },
            { item: 4, speaker: 'A', text: 'じゃ、ことし いっしょに 行きませんか。' },
            { item: 4, speaker: 'B', text: 'ええ。' },
            { item: 4, speaker: '文', text: '女の人は 祇園祭に 行きます。' },
            { item: 5, speaker: 'A', text: 'その かばん、重いでしょう。持ちましょうか。' },
            { item: 5, speaker: 'B', text: 'ありがとうございます。でも、そんなに 重くないですから、大丈夫です。' },
            { item: 5, speaker: 'A', text: 'そうですか。' },
            { item: 5, speaker: '文', text: '男の人は 女の人の かばんを 持ちます。' },
        ],
        tasks: {
            'moodle:6974653:2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0:audio:minna074-mondai-2:item-1': { prompt: '女の人は これから 会議室へ 行きます。', answer: 'cross' },
            'moodle:6974653:2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0:audio:minna074-mondai-2:item-2': { prompt: '男の人は 日本が 勝つと 言いました。', answer: 'cross' },
            'moodle:6974653:2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0:audio:minna074-mondai-2:item-3': { prompt: '男の人と 女の人は 喫茶店で 休みます。', answer: 'circle' },
            'moodle:6974653:2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0:audio:minna074-mondai-2:item-4': { prompt: '女の人は 祇園祭に 行きます。', answer: 'circle' },
            'moodle:6974653:2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0:audio:minna074-mondai-2:item-5': { prompt: '男の人は 女の人の かばんを 持ちます。', answer: 'cross' },
        },
        method: 'The Moodle member is byte-identical to official Minna 074. Audio review verifies five recording-embedded Mondai 2 dialogue/statement ○/× items; transcript and canonical marks remain available only after an attempt. No Moodle worksheet, Genki task, or Soya task is claimed for this pairing.',
        response: 'true-false',
    },
};

const DIRECT_REVIEWED_MINNA_SOURCES = {
    'source-minna-075-conversation': {
        packageId: 'l2-l09',
        moduleId: 6974657,
        locator: 'academy/content/minna/audio/l2-l09-minna-075.mp3',
        audioSha256: '360cef1923b1e824f22ec5ebdaf18896e87846c8c9019f25228da60675c79834',
        worksheetSha256: 'c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0',
        transcript: [
            { speaker: '音声', text: '第22課 会話「どんな 部屋を お探しですか」' },
            { speaker: '不動産屋', text: 'どんな 部屋を お探しですか。' },
            { speaker: 'ワン', text: 'そうですね。' },
            { speaker: 'ワン', text: '家賃は ８万円ぐらいで、駅から 遠くない 所が いいです。' },
            { speaker: '不動産屋', text: 'では、こちらは いかがですか。' },
            { speaker: '不動産屋', text: '駅から １０分で、家賃は ８万３千円です。' },
            { speaker: 'ワン', text: 'ダイニングキッチンと 和室ですね。' },
            { speaker: 'ワン', text: 'すみません。ここは 何ですか。' },
            { speaker: '不動産屋', text: '押し入れです。布団を 入れる 所ですよ。' },
            { speaker: 'ワン', text: 'そうですか。' },
            { speaker: 'ワン', text: 'この 部屋、きょう 見る ことが できますか。' },
            { speaker: '不動産屋', text: 'ええ。今から 行きましょうか。' },
            { speaker: 'ワン', text: 'ええ、お願いします。' },
        ],
        tasks: {
            'moodle:6974657:c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0:pdf-p1:minna075-conversation:item-1': { prompt: 'ワンさんは どんな 部屋を 探していますか。', answer: '家賃は８万円ぐらいで、駅から遠くない所です。' },
            'moodle:6974657:c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0:pdf-p1:minna075-conversation:item-2': { prompt: 'この 部屋の 家賃は いくらですか。', answer: '８万３千円です。' },
            'moodle:6974657:c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0:pdf-p1:minna075-conversation:item-3': { prompt: '駅から 何分 かかりますか。', answer: '１０分です。' },
            'moodle:6974657:c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0:pdf-p1:minna075-conversation:item-4': { prompt: '今日 この 部屋を 見る ことが できますか。', answer: 'はい、できます。' },
        },
        method: 'The four verbatim Moodle Chapter 22 worksheet questions are paired with Moodle Minna 075 after fresh byte comparison to the official 3A archive and recording review. Transcript and canonical answers remain available only after an attempt; unrelated package documents remain quarantined.',
        response: 'conversation-check',
    },
    'source-minna-077-true-false': {
        packageId: 'l2-l10',
        moduleId: 6974659,
        locator: 'academy/content/minna/audio/l2-l10-minna-077.mp3',
        audioSha256: '3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339',
        sourceTask: 'recording-embedded-mondai-2',
        transcript: [
            { item: 1, speaker: 'A', text: 'これ、私が 作った ケーキですけど、いかがですか。' },
            { item: 1, speaker: 'B', text: 'チョコレートケーキですね。' },
            { item: 1, speaker: 'B', text: 'いただきます。' },
            { item: 1, speaker: 'B', text: 'おいしいですね。' },
            { item: 1, speaker: '文', text: '女の人は チョコレートケーキを 作りました。' },
            { item: 2, speaker: 'A', text: 'あ、そこに 傘を 置かないで ください。' },
            { item: 2, speaker: 'B', text: 'すみません。' },
            { item: 2, speaker: 'B', text: '傘を 置く ところは どこですか。' },
            { item: 2, speaker: 'A', text: '階段の 後ろに 置いて ください。' },
            { item: 2, speaker: 'B', text: 'わかりました。' },
            { item: 2, speaker: '文', text: '傘は 階段の 後ろに 置かなければ なりません。' },
            { item: 3, speaker: 'A', text: 'ミラーさん、ここに あった 新聞は？' },
            { item: 3, speaker: 'B', text: '山田さんが 持って 行きましたよ。' },
            { item: 3, speaker: 'A', text: 'あ、そうですか。' },
            { item: 3, speaker: '文', text: 'ミラーさんは 今、新聞を 読んでいます。' },
            { item: 4, speaker: 'A', text: '山田さん、あした テニスに 行きませんか。' },
            { item: 4, speaker: 'B', text: 'あしたですか。' },
            { item: 4, speaker: 'B', text: 'あしたは ちょっと 子どもと 遊びに 行く 約束が ありますから。' },
            { item: 4, speaker: 'A', text: 'そうですか。じゃ、また 今度。' },
            { item: 4, speaker: '文', text: '男の人は あした 子どもと 遊びますから、テニスに 行きません。' },
            { item: 5, speaker: 'A', text: '旅行の 写真ですね。' },
            { item: 5, speaker: 'A', text: 'この 人は だれですか。' },
            { item: 5, speaker: 'B', text: 'どの 人ですか。' },
            { item: 5, speaker: 'A', text: '佐藤さんの 後ろに いる 髪が 短い 人です。' },
            { item: 5, speaker: 'B', text: 'あ、カリナさんです。' },
            { item: 5, speaker: '文', text: 'カリナさんは 髪が 短いです。' },
        ],
        tasks: {
            'moodle:6974659:3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339:audio:minna077-mondai-2:item-1': { prompt: '女の人は チョコレートケーキを 作りました。', answer: 'circle' },
            'moodle:6974659:3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339:audio:minna077-mondai-2:item-2': { prompt: '傘は 階段の 後ろに 置かなければ なりません。', answer: 'circle' },
            'moodle:6974659:3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339:audio:minna077-mondai-2:item-3': { prompt: 'ミラーさんは 今、新聞を 読んでいます。', answer: 'cross' },
            'moodle:6974659:3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339:audio:minna077-mondai-2:item-4': { prompt: '男の人は あした 子どもと 遊びますから、テニスに 行きません。', answer: 'circle' },
            'moodle:6974659:3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339:audio:minna077-mondai-2:item-5': { prompt: 'カリナさんは 髪が 短いです。', answer: 'circle' },
        },
        method: 'Moodle Lesson 9 homework Minna 077 is byte-identical to official 3A track 077. Audio review verifies five recording-embedded Mondai 2 dialogue/statement ○/× items; transcript and canonical marks remain available only after an attempt. Minna 076 has no package/task relationship, while B-34, B-35, and the repeated Minna 075 remain outside this focused claim.',
        response: 'true-false',
    },
};

const DIRECT_REVIEWED_MOODLE_SOURCES = {
    'source-moodle-track-78-bank': {
        packageId: 'l2-l12',
        moduleId: 8121261,
        locator: 'academy/content/moodle/audio/l2-l12-track-78.mp3',
        audioSha256: '1039d11bef7a0575c6f104f780d1b65c79e63eb50dc292ea8c39f05d241123d2',
        worksheetSha256: '3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617',
        sourceTask: 'worksheet-section-ii-eight-blanks-and-final-choice',
        transcript: [
            { speaker: '音声', text: 'トラック78。男の人は 銀行に います。後で 何を 送ってもらいますか。' },
            { speaker: '男', text: 'あのう、口座を 開きたいんですが…。' },
            { speaker: '女', text: 'ありがとうございます。それでは、こちらの 用紙に ご記入を お願いします。' },
            { speaker: '男', text: '外国からの 送金を 受け取れますか。' },
            { speaker: '女', text: 'はい、大丈夫です。本日は 印鑑と…、パスポートは お持ちでしょうか。' },
            { speaker: '男', text: 'はい。' },
            { speaker: '女', text: 'キャッシュカードは お作りしますか。銀行の ATM だけでなく、コンビニでも お使いいただけますが…。' },
            { speaker: '男', text: 'いくら かかりますか。' },
            { speaker: '女', text: '無料です。2週間ほど かかりますが、郵送で ご自宅に お送りします。' },
            { speaker: '男', text: 'はい、では お願いします。' },
            { speaker: '音声', text: '後で 何を 送ってもらいますか。' },
            { speaker: '1', text: 'パスポート' },
            { speaker: '2', text: '印鑑' },
            { speaker: '3', text: 'お金' },
            { speaker: '4', text: 'キャッシュカード' },
        ],
        tasks: {
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-1': { prompt: '男の人は 銀行に います。①＿＿＿送ってもらいますか。', answer: 'キャッシュカード' },
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-2': { prompt: '外国からの②＿＿＿を 受け取れますか。', answer: '送金' },
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-3': { prompt: '本日は③＿＿＿と…、', answer: '印鑑' },
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-4': { prompt: '④＿＿＿は お持ちでしょうか。', answer: 'パスポート' },
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-5': { prompt: '⑤＿＿＿は お作りしますか。', answer: 'キャッシュカード' },
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-6': { prompt: '2週間ほど かかりますが、⑥＿＿＿で ご自宅に', answer: '郵送' },
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-7': { prompt: '⑦＿＿＿。', answer: 'お送りします' },
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-8': { prompt: '選択肢3：⑧＿＿＿', answer: 'お金' },
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:choice': { prompt: '①＿＿＿送ってもらいますか。1.④ 2.③ 3.⑧ 4.⑤', answer: '4' },
        },
        method: 'Moodle module 8121261 places Track 78 and the bank-account worksheet in the same Homework folder, while worksheet Section II explicitly names Track 78 and defines eight numbered blanks plus a final four-option check. Byte verification and original-audio review establish the completed transcript and deterministic key; both remain gated until an attempt. Track 79 belongs to Section III, while A-9/A-10 and other folder-level repeats remain quarantined.',
        response: 'structured-cloze',
    },
    'source-moodle-track-79-favor-direction': {
        packageId: 'l2-l12',
        moduleId: 8121261,
        locator: 'academy/content/moodle/audio/l2-l12-track-79.mp3',
        audioSha256: '612ff9f8f70e5ce4ac79b3c6826e12e6b2a7c4d2ccccf5a017df7509f474c63e',
        worksheetSha256: '3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617',
        sourceTask: 'worksheet-section-iii-part-2-three-beneficiary-direction-phrases',
        transcript: [
            { speaker: '音声', text: 'トラック79。' },
            { speaker: '音声', text: '（1）' },
            { speaker: '1', text: '口座' },
            { speaker: '2', text: '通帳' },
            { speaker: '3', text: 'キャッシュカード' },
            { speaker: '4', text: '印鑑、はんこ' },
            { speaker: '音声', text: '（2）例' },
            { speaker: '学生', text: '先生、あの作文を書いたんですが、見ていただけますか。' },
            { speaker: '先生', text: 'いいですよ。じゃあ、明日までに見ておきましょう。' },
            { speaker: '学生', text: 'ありがとうございます。' },
            { speaker: '1・男', text: 'としくん、ここ読んでくれる？' },
            { speaker: '1・少年', text: 'うーんとね、これはね、IT産業だよ。' },
            { speaker: '1・男', text: 'ほうほう、なるほど。' },
            { speaker: '2・男', text: 'あ、ひどい雨だよ。まずいな、傘持ってないや。' },
            { speaker: '2・女', text: '私、まだ仕事あるから、これどうぞ。' },
            { speaker: '2・男', text: 'ありがとう。助かった。' },
            { speaker: '3・女', text: 'あー、これ食べられないんだよ。全部食べないと怒られちゃうのに。' },
            { speaker: '3・男', text: 'じゃあ、食べてあげるよ。' },
            { speaker: '3・女', text: '本当？ ありがとう。助かったよ。' },
        ],
        tasks: {
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p2:track79-favor-direction:item-1': { prompt: '1：（　）　ことば', answer: { direction: 'right', phrase: '読んでもらう' } },
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p2:track79-favor-direction:item-2': { prompt: '2：（　）　ことば', answer: { direction: 'left', phrase: '傘を貸してもらう' } },
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p2:track79-favor-direction:item-3': { prompt: '3：（　）　ことば', answer: { direction: 'right', phrase: '食べてもらう' } },
        },
        method: 'Moodle module 8121261 places Track 79 with worksheet Section III, which explicitly names the track, says to skip audio section (1), and starts the assessed picture task from section (2). Original-audio review establishes the three exchanges; the worksheet beneficiary-arrow instruction deterministically establishes each direction and 〜てもらう phrase. Transcript and key remain gated until an attempt. A-9/A-10 remain unrelated and quarantined.',
        response: 'direction-phrase',
    },
    'source-moodle-a11-meal-survey': {
        packageId: 'l2-l13',
        moduleId: 8121266,
        locator: 'academy/content/moodle/audio/l2-l13-a11.mp3',
        audioSha256: '596a4499996bd9599a169a8ae9171a0e78fe22a7f9d92bce7045203b794baf25',
        worksheetSha256: '3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9',
        sourceTask: 'worksheet-upper-section-a11-seven-meal-survey-responses',
        transcript: [
            { speaker: '音声', text: '3番、学生の食事についてアンケートをします。学生の答えを書いてください。' },
            { speaker: '例・聞き手', text: 'すみません、毎日の食事についてちょっと教えていただけませんか。' },
            { speaker: '例・学生', text: '毎日の食事？ いいですよ。' },
            { speaker: '例・聞き手', text: '毎日朝ごはんを食べていますか。' },
            { speaker: '例・学生', text: 'うーん、毎日は食べていません。' },
            { speaker: '例・学生', text: '食べるときはだいたいパンとコーヒーですね。コンビニで買っています。' },
            { speaker: '1・聞き手', text: '昼ごはんは？' },
            { speaker: '1・学生', text: '毎日大学の食堂で食べています。' },
            { speaker: '1・聞き手', text: 'どんなものを食べていますか。' },
            { speaker: '1・学生', text: 'ラーメンやカレーですね。' },
            { speaker: '1・学生', text: '安いから。' },
            { speaker: '1・聞き手', text: 'そうですか。' },
            { speaker: '2・聞き手', text: '晩ごはんはどうしていますか。' },
            { speaker: '2・学生', text: '晩ごはんですか？' },
            { speaker: '2・学生', text: 'いつもうちで食べています。' },
            { speaker: '2・聞き手', text: '自分で料理しますか。' },
            { speaker: '2・学生', text: '時々自分で料理を作りますよ。' },
            { speaker: '2・学生', text: 'でも、大抵コンビニで買ったものを食べていますね。' },
            { speaker: '2・学生', text: '便利だし、いろいろあるしね。' },
            { speaker: '3・聞き手', text: '買い物はいつもどこでしていますか。' },
            { speaker: '3・聞き手', text: 'スーパーですか。' },
            { speaker: '3・学生', text: 'コンビニですね。' },
            { speaker: '3・学生', text: 'コンビニがなかったら生活できませんよ。' },
            { speaker: '聞き手', text: 'そうですか。どうもありがとうございました。' },
            { speaker: '学生', text: 'いいえ。' },
        ],
        tasks: {
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-1': { prompt: '昼ごはんを食べますか。a. 毎日 b. 時々 c. 全然', answer: '毎日' },
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-2': { prompt: 'どこで食べますか。', answer: '大学の食堂' },
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-3': { prompt: 'ラーメンや（　　　）', answer: 'カレー' },
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-4': { prompt: '晩ごはんを食べますか。a. 毎日 b. 時々 c. 全然', answer: '毎日' },
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-5': { prompt: 'どこで食べますか。', answer: 'うち' },
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-6': { prompt: '自分で料理しますか。a. 毎日 b. 時々 c. 全然', answer: '時々' },
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-7': { prompt: '買い物はどこでしますか。a. スーパー b. コンビニ c. その他', answer: 'コンビニ' },
        },
        method: 'Moodle module 8121266 places A-11 and Chapter 28 listening-2.pdf in the same source folder. The worksheet upper section explicitly defines seven meal-survey response loci; byte verification and original-audio review establish all seven deterministic answers. Transcript and key remain gated until an attempt. The lower A-12 section and the other four recordings remain outside this exact pairing.',
        response: 'meal-survey',
    },
    'source-moodle-a13-state-correction': {
        packageId: 'l2-l14',
        moduleId: 8121267,
        locator: 'academy/content/moodle/audio/l2-l14-a13.mp3',
        audioSha256: 'b61ec5374c6c31fb3c1d3cef4fee142e0b6ee2d79e5a7359d70df65f93d44d2d',
        worksheetSha256: 'a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499',
        sourceTask: 'worksheet-a13-three-picture-state-corrections',
        transcript: [
            { speaker: '音声', text: '1番。友達がいずみさんに注意しました。いずみさんはどうしますか。' },
            { item: 'example', speaker: '友達', text: 'あれ？ いずみ、車の電気がついているよ。' },
            { item: 'example', speaker: 'いずみ', text: 'え？ あ、本当。ついているね。ちょっと待っていて。' },
            { item: 1, speaker: '友達', text: 'いずみ、かばんが開いているよ。' },
            { item: 1, speaker: 'いずみ', text: 'え？ 本当。' },
            { item: 1, speaker: '友達', text: '危ないね。気をつけて。' },
            { item: 1, speaker: 'いずみ', text: 'うん。' },
            { item: 2, speaker: '友達', text: 'いずみ、シャツのボタンが外れているよ。' },
            { item: 2, speaker: 'いずみ', text: 'あら、そう？ ありがとう。' },
            { item: 3, speaker: 'いずみ', text: 'ああ、おいしかった。ごちそうさま。' },
            { item: 3, speaker: '友達', text: 'いずみ、アイスクリームがついているよ。' },
            { item: 3, speaker: 'いずみ', text: 'え？ どこ？' },
            { item: 3, speaker: '友達', text: '口の横。違う。右。そうそう。' },
            { item: 3, speaker: 'いずみ', text: 'ありがとう。' },
        ],
        tasks: {
            'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a13-state-correction:item-1': { prompt: '1：a / b（かばんの絵）', answer: 'b' },
            'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a13-state-correction:item-2': { prompt: '2：a / b（シャツのボタンの絵）', answer: 'b' },
            'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a13-state-correction:item-3': { prompt: '3：a / b（アイスクリームの絵）', answer: 'a' },
        },
        method: 'Moodle module 8121267 places A-13, A-14, and the one-page Chapter 29 listening-1 worksheet in the same source folder. The worksheet explicitly labels A-13 and defines three a/b picture rows; byte verification and original-audio review establish the b/b/a key. Transcript and key remain gated until an attempt. The curriculum retains its Minna Chapter 29 sequence anchor, but no separate official Minna, Genki, Soya, or Shin Kanzen byte match is claimed; Track 27/28 and the other documents remain quarantined.',
        response: 'single-choice',
    },
    'source-moodle-a14-defect-replacement': {
        packageId: 'l2-l14',
        moduleId: 8121267,
        locator: 'academy/content/moodle/audio/l2-l14-a14.mp3',
        audioSha256: '72537c6e4c3eb82bb6800a4c52ec906abb0c7b58f94b1663573426289e62cf2d',
        worksheetSha256: 'a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499',
        sourceTask: 'worksheet-a14-three-picture-defect-reasons',
        transcript: [
            { speaker: '音声', text: '2番。店の人はどうして「こちらのをどうぞ」と言いましたか。' },
            { item: 'example', speaker: '客', text: 'すみません。これ、ください。' },
            { item: 'example', speaker: '店員', text: 'はい。ありがとうございます。お皿が5枚ですね。' },
            { item: 'example', speaker: '客', text: 'はい。あ、これは…。' },
            { item: 'example', speaker: '店員', text: 'あれ、割れていますね。すみません。こちらに新しいのがありますから、こちらのをどうぞ。' },
            { item: 1, speaker: '客', text: 'すみません。大きい袋、ください。' },
            { item: 1, speaker: '店員', text: 'はい。これでいいですか。' },
            { item: 1, speaker: '客', text: 'ありがとう。あれ？ これは破れていますよ。' },
            { item: 1, speaker: '店員', text: 'え？ どうもすみません。こちらのをどうぞ。' },
            { item: 2, speaker: '店員', text: 'いらっしゃいませ。' },
            { item: 2, speaker: '客', text: '天ぷら定食、ください。' },
            { item: 2, speaker: '店員', text: 'かしこまりました。お待たせしました。' },
            { item: 2, speaker: '客', text: 'あれ？ すみません。この箸、折れているんですけど。' },
            { item: 2, speaker: '店員', text: 'あ、どうもすみません。こちらのをどうぞ。' },
            { item: 3, speaker: '客', text: 'すみません。昨日こちらで買ったセーターなんですが。' },
            { item: 3, speaker: '店員', text: 'はい。' },
            { item: 3, speaker: '客', text: 'ここ、汚れているんです。' },
            { item: 3, speaker: '店員', text: 'ああ、そうですね。どうもすみません。こちらに同じものがありますから、こちらのをどうぞ。' },
            { item: 3, speaker: '客', text: 'ありがとう。' },
        ],
        tasks: {
            'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a14-defect-replacement:item-1': { prompt: '1：a / b（袋の絵）', answer: 'a' },
            'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a14-defect-replacement:item-2': { prompt: '2：a / b（箸の絵）', answer: 'b' },
            'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a14-defect-replacement:item-3': { prompt: '3：a / b（セーターの絵）', answer: 'b' },
        },
        method: 'The same Moodle Chapter 29 worksheet explicitly labels A-14 and defines three a/b defect pictures. Byte verification and original-audio review establish the torn-bag, broken-chopstick, and stained-sweater choices a/b/b. Transcript and key remain gated until an attempt. No answer is inferred from the folder alone, and Track 27/28 remain outside this exact worksheet/audio pairing.',
        response: 'single-choice',
    },
};

function main() {
    const crosswalk = readJson(crosswalkPath);
    const sourceByLocator = new Map(crosswalk.entries
        .filter(entry => entry.availability === 'source-verified')
        .map(entry => [entry.locator, entry]));
    const soyaById = new Map(readJson(soyaMapPath).questions.map(question => [question.id, question]));
    const entries = [];
    const gaps = [];
    const expectedTaskIds = [];
    for (const fileName of readdirSync(lessonsRoot).filter(name => name.endsWith('.json')).sort()) {
        const lesson = readJson(path.join(lessonsRoot, fileName));
        const questions = lesson.sourceQuestionNormalization?.sourceQuestions ?? [];
        for (const question of questions) {
            if ((question.sourceId !== 'source-soya-eagle' && question.sourceId !== 'source-moodle-a45'
                && question.sourceId !== 'source-moodle-listening-grid' && question.sourceId !== 'source-moodle-a46-commute'
                && question.sourceId !== 'source-moodle-b22-holiday-itinerary' && question.sourceId !== 'source-moodle-b25-diary'
                && !MINNA_REVIEWED_SOURCES[question.sourceId])
                || typeof question.audioRef !== 'string') continue;
            const source = sourceByLocator.get(question.audioRef);
            if (!source) throw new Error(`${lesson.id}/${question.id} has no source-verified locator.`);
            const sourceId = question.audioAssetId ?? source.authoredAssetId;
            if (source.authoredAssetId !== sourceId) throw new Error(`${lesson.id}/${question.id} has no matching crosswalk audio asset.`);
            const isMoodleGrid = question.sourceId === 'source-moodle-listening-grid';
            if (isMoodleGrid) {
                verifyExactMoodleGridTask({ lesson, question, source });
                expectedTaskIds.push(question.id);
                entries.push(createMoodleGridBinding({ lesson, question, source }));
                continue;
            }
            const isMoodleCommute = question.sourceId === 'source-moodle-a46-commute';
            if (isMoodleCommute) {
                verifyExactMoodleCommuteTask({ lesson, question, source });
                expectedTaskIds.push(question.id);
                entries.push(createMoodleCommuteBinding({ lesson, question, source }));
                continue;
            }
            const isMoodleB22 = question.sourceId === 'source-moodle-b22-holiday-itinerary';
            if (isMoodleB22) {
                verifyExactMoodleB22Task({ lesson, question, source });
                expectedTaskIds.push(question.id);
                entries.push(createMoodleB22Binding({ lesson, question, source }));
                continue;
            }
            const isMoodleB25 = question.sourceId === 'source-moodle-b25-diary';
            if (isMoodleB25) {
                verifyExactMoodleB25Task({ lesson, question, source });
                expectedTaskIds.push(question.id);
                entries.push(createMoodleB25Binding({ lesson, question, source }));
                continue;
            }
            const minnaReviewed = MINNA_REVIEWED_SOURCES[question.sourceId];
            if (minnaReviewed) {
                verifyExactMinnaTask({ lesson, question, source, reviewed: minnaReviewed });
                expectedTaskIds.push(question.id);
                entries.push(createMinnaBinding({ lesson, question, source, reviewed: minnaReviewed }));
                continue;
            }
            const exercise = findExercise(lesson, question.id);
            if (!exercise) {
                gaps.push({
                    packageId: lesson.id,
                    sourceQuestionId: question.id,
                    reason: 'source-verified-audio-has-no-retained-authored-task',
                });
                continue;
            }
            const isSoya = question.sourceId === 'source-soya-eagle';
            const soyaId = source.authoredAssetId.replace(/^ex-soya-/, '');
            const soya = isSoya ? soyaById.get(soyaId) : undefined;
            if (isSoya && !soya) throw new Error(`${lesson.id}/${question.id} has no Soya question-map row.`);
            if (isSoya) verifyExactTask({ lesson, question, exercise, source, soya });
            else verifyExactMoodleA45Task({ lesson, question, exercise, source });
            expectedTaskIds.push(question.id);
            const taskEvidence = {
                prompt: exercise.prompt.ja,
                options: exercise.options.map(option => ({ label: option.label.ja, correct: option.correct })),
                transcript: exercise.transcript.script.map(line => ({ speaker: line.speaker, text: line.text })),
            };
            const supportEvidence = {
                explanation: exercise.explanation,
                wrongAnswerExplanations: exercise.wrongAnswerExplanations,
            };
            if (!supportEvidence.explanation || !Array.isArray(supportEvidence.wrongAnswerExplanations)
                || supportEvidence.wrongAnswerExplanations.length === 0) {
                throw new Error(`${lesson.id}/${question.id} must provide post-attempt listening support.`);
            }
            entries.push({
                packageId: lesson.id,
                sourceQuestionId: question.id,
                locator: question.audioRef,
                source: {
                    corpus: source.source.corpus,
                    questionId: isSoya ? soyaId : question.id,
                    questionMapRef: source.source.questionMapRef,
                    audioSha256: source.source.sha256,
                },
                verification: {
                    taskEvidenceSha256: sha256(JSON.stringify(taskEvidence)),
                    supportEvidenceSha256: sha256(JSON.stringify(supportEvidence)),
                    answerGate: 'after-attempt',
                    method: isSoya
                        ? 'Verbatim prompt, options, marked answer, and transcript match the Soya question map and the authored source-question reference.'
                        : 'Verbatim Moodle worksheet prompt and options are paired with the byte-verified A-45 recording; the reviewed recording evidence deterministically establishes the marked count.',
                },
                learnerContract: {
                    response: 'single-choice',
                    transcriptReveal: 'after-attempt',
                    hintReveal: 'after-attempt',
                    grading: 'deterministic',
                },
                delivery: source.delivery?.mode === 'packaged-static'
                    ? { status: 'packaged-static', url: source.delivery.url }
                    : { status: 'source-verified-awaiting-packaging' },
            });
        }
    }
    for (const reviewed of Object.values(DIRECT_REVIEWED_MINNA_SOURCES)) {
        const source = sourceByLocator.get(reviewed.locator);
        if (!source) throw new Error(`${reviewed.packageId}/${reviewed.locator} has no source-verified locator.`);
        if (source.source?.corpus !== 'minna' || source.source.sha256 !== reviewed.audioSha256) {
            throw new Error(`${reviewed.packageId}/${reviewed.locator} does not match its reviewed Minna bytes.`);
        }
        for (const [sourceQuestionId, task] of Object.entries(reviewed.tasks)) {
            expectedTaskIds.push(sourceQuestionId);
            entries.push(createDirectMinnaBinding({ sourceQuestionId, task, source, reviewed }));
        }
    }
    for (const reviewed of Object.values(DIRECT_REVIEWED_MOODLE_SOURCES)) {
        const source = sourceByLocator.get(reviewed.locator);
        if (!source) throw new Error(`${reviewed.packageId}/${reviewed.locator} has no source-verified locator.`);
        if (source.source?.corpus !== 'moodle' || source.source.sha256 !== reviewed.audioSha256) {
            throw new Error(`${reviewed.packageId}/${reviewed.locator} does not match its reviewed Moodle bytes.`);
        }
        for (const [sourceQuestionId, task] of Object.entries(reviewed.tasks)) {
            expectedTaskIds.push(sourceQuestionId);
            entries.push(createDirectMinnaBinding({ sourceQuestionId, task, source, reviewed }));
        }
    }
    entries.sort((left, right) => `${left.packageId}/${left.sourceQuestionId}`.localeCompare(`${right.packageId}/${right.sourceQuestionId}`));
    const expected = expectedTaskIds.sort();
    const actual = [...entries, ...gaps].map(entry => entry.sourceQuestionId).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Verified listening sources and exact task bindings diverged.');
    const manifest = {
        schema,
        generation: {
            deterministic: true,
            generatedAt: null,
            sourceMaps: [
                'references/soya-research/listening-question-audio-map.json',
                'public/academy/content/lessons/021-l1-l20.json#/components/sensei-a45-listening',
                'public/academy/content/lessons/020-l1-l19.json#/sourceQuestionNormalization/sourceQuestions',
                'public/academy/content/lessons/022-l1-l21.json#/sourceQuestionNormalization/sourceQuestions',
                'public/academy/content/lessons/032-l2-l05.json#/sourceQuestionNormalization/sourceQuestions',
                'public/academy/content/lessons/033-l2-l06.json#/sourceQuestionNormalization/sourceQuestions',
                'public/academy/content/lessons/034-l2-l07.json#/sourceQuestionNormalization/sourceQuestions',
                'scripts/academy-listening-task-bindings.mjs#DIRECT_REVIEWED_MINNA_SOURCES/source-minna-075-conversation',
                'scripts/academy-listening-task-bindings.mjs#DIRECT_REVIEWED_MINNA_SOURCES/source-minna-077-true-false',
                'scripts/academy-listening-task-bindings.mjs#DIRECT_REVIEWED_MOODLE_SOURCES/source-moodle-track-78-bank',
                'scripts/academy-listening-task-bindings.mjs#DIRECT_REVIEWED_MOODLE_SOURCES/source-moodle-track-79-favor-direction',
                'scripts/academy-listening-task-bindings.mjs#DIRECT_REVIEWED_MOODLE_SOURCES/source-moodle-a11-meal-survey',
                'scripts/academy-listening-task-bindings.mjs#DIRECT_REVIEWED_MOODLE_SOURCES/source-moodle-a13-state-correction',
                'scripts/academy-listening-task-bindings.mjs#DIRECT_REVIEWED_MOODLE_SOURCES/source-moodle-a14-defect-replacement',
            ],
            answerPolicy: 'Answer identity is verified during generation but not published; learner answers remain gated until after an attempt.',
        },
        entries,
        gaps: [
            ...gaps,
            ...entries.filter(entry => entry.delivery.status !== 'packaged-static').map(entry => ({
                packageId: entry.packageId,
                sourceQuestionId: entry.sourceQuestionId,
                reason: 'source-verified-audio-not-packaged-for-offline-playback',
            })),
        ],
    };
    writeJsonAtomic(publicPath, manifest);
    process.stdout.write(`[listening-task-bindings] ${entries.length} exact task bindings, ${entries.filter(entry => entry.delivery.status === 'packaged-static').length} packaged\n`);
}

function verifyExactTask({ lesson, question, exercise, source, soya }) {
    if ((question.audioAssetId ?? question.id) !== source.authoredAssetId || question.audioRef !== source.locator) {
        throw new Error(`${lesson.id}/${question.id} does not match its crosswalk identity.`);
    }
    if (exercise.audioRef !== source.locator || exercise.prompt?.ja !== soya.question) {
        throw new Error(`${lesson.id}/${question.id} does not verbatim-match the Soya prompt/audio.`);
    }
    const options = exercise.options.map(option => option.label?.ja);
    if (JSON.stringify(options) !== JSON.stringify(soya.options)) {
        throw new Error(`${lesson.id}/${question.id} options do not verbatim-match the Soya question map.`);
    }
    const correct = exercise.options.filter(option => option.correct).map(option => option.label?.ja);
    if (JSON.stringify(correct) !== JSON.stringify([soya.correctAnswer])) {
        throw new Error(`${lesson.id}/${question.id} marked answer does not match the Soya question map.`);
    }
    const transcript = exercise.transcript?.script?.map(line => ({ speaker: line.speaker, text: line.text }));
    const sourceTranscript = soya.script.map(line => ({ speaker: line.speaker, text: line.text }));
    if (JSON.stringify(transcript) !== JSON.stringify(sourceTranscript)) {
        throw new Error(`${lesson.id}/${question.id} transcript does not verbatim-match the Soya question map.`);
    }
}

function verifyExactMoodleA45Task({ lesson, question, exercise, source }) {
    const expected = MOODLE_A45_TASKS[question.id];
    if (!expected) throw new Error(`${lesson.id}/${question.id} is not an approved Moodle A-45 task.`);
    if (source.source.corpus !== 'moodle'
        || source.source.sha256 !== '7a7f9cf7c9d0a10932007df1528f10fdfd7c0f38fe59bb938aa7a6952ccc47c8'
        || question.audioRef !== source.locator
        || question.audioAssetId !== source.authoredAssetId
        || exercise.audioRef !== source.locator
        || exercise.sourcePromptExact !== expected.prompt
        || exercise.prompt?.ja !== expected.prompt) {
        throw new Error(`${lesson.id}/${question.id} does not match the byte-verified Moodle A-45 source.`);
    }
    if (JSON.stringify(exercise.options.map(option => option.label?.ja)) !== JSON.stringify(expected.options)
        || JSON.stringify(exercise.options.filter(option => option.correct).map(option => option.id)) !== JSON.stringify([expected.correct])) {
        throw new Error(`${lesson.id}/${question.id} has an unverified Moodle A-45 answer.`);
    }
    const transcript = exercise.transcript?.script?.map(line => ({ speaker: line.speaker, text: line.text }));
    if (JSON.stringify(transcript) !== JSON.stringify(expected.transcript)) {
        throw new Error(`${lesson.id}/${question.id} has unverified Moodle A-45 post-attempt support.`);
    }
}

function verifyExactMoodleGridTask({ lesson, question, source }) {
    const expected = MOODLE_L19_GRID_TASKS[question.id];
    if (!expected) throw new Error(`${lesson.id}/${question.id} is not an approved Moodle listening-grid task.`);
    if (source.source.corpus !== 'moodle'
        || source.source.sha256 !== expected.audioSha256
        || question.audioRef !== expected.locator
        || question.audioAssetId !== source.authoredAssetId
        || !question.reference?.startsWith('moodle:6223185:797c858bc8070541ec31bae8e631ac03d7c3a28a3409602f331020e1192002e8:pdf-p1:')
        || question.reuse !== 'verbatim-moodle'
        || question.answerStatus !== 'original-audio-reviewed'
        || question.mediaStatus !== 'packaged-static-source-verified') {
        throw new Error(`${lesson.id}/${question.id} does not match its byte-verified Moodle listening-grid source.`);
    }
    if (!expected.fields.length || expected.fields.some(field => typeof field !== 'string' || !field)
        || expected.answers.length !== expected.fields.length
        || !expected.transcript.length) {
        throw new Error(`${lesson.id}/${question.id} has incomplete exact Moodle grid evidence.`);
    }
}

function createMoodleGridBinding({ lesson, question, source }) {
    const expected = MOODLE_L19_GRID_TASKS[question.id];
    const taskEvidence = {
        prompt: expected.prompt,
        fields: expected.fields,
        transcript: expected.transcript,
    };
    const supportEvidence = {
        transcript: expected.transcript,
        answers: expected.answers,
    };
    return {
        packageId: lesson.id,
        sourceQuestionId: question.id,
        locator: question.audioRef,
        source: {
            corpus: source.source.corpus,
            questionId: question.id,
            questionMapRef: source.source.questionMapRef,
            audioSha256: source.source.sha256,
        },
        verification: {
            taskEvidenceSha256: sha256(JSON.stringify(taskEvidence)),
            supportEvidenceSha256: sha256(JSON.stringify(supportEvidence)),
            answerGate: 'after-attempt',
            method: 'Verbatim Moodle worksheet prompt and response-grid labels are paired with the byte-verified A-43/A-44 recording; reviewed source-audio transcription and values remain available only after an attempt.',
        },
        learnerContract: {
            response: 'structured-grid',
            transcriptReveal: 'after-attempt',
            hintReveal: 'after-attempt',
            grading: 'deterministic',
        },
        delivery: source.delivery?.mode === 'packaged-static'
            ? { status: 'packaged-static', url: source.delivery.url }
            : { status: 'source-verified-awaiting-packaging' },
    };
}

function verifyExactMoodleCommuteTask({ lesson, question, source }) {
    const expected = MOODLE_L21_COMMUTE_TASKS[question.id];
    if (!expected) throw new Error(`${lesson.id}/${question.id} is not an approved Moodle A-46 commute task.`);
    if (source.source.corpus !== 'moodle'
        || source.source.sha256 !== '4f292de0dd3a5791bfdafd668df598ea1e0dc20036fcce467d3213d7ab53fb97'
        || question.audioRef !== source.locator
        || question.audioAssetId !== source.authoredAssetId
        || question.reference !== `moodle:6375062:49468890a807f485a2c86cf2c05f6c3e11b6e2bf0cbd2ca50da662de8b91e5f5:pdf-p3:short-dialogues-2:item-${Object.keys(MOODLE_L21_COMMUTE_TASKS).indexOf(question.id) + 1}`
        || question.reuse !== 'verbatim-moodle'
        || question.answerStatus !== 'worksheet-script-and-audio-reviewed'
        || question.mediaStatus !== 'packaged-static-source-verified') {
        throw new Error(`${lesson.id}/${question.id} does not match its byte-verified Moodle A-46 source.`);
    }
    if (!expected.prompt || !expected.answer || !MOODLE_L21_SOURCE_SCRIPT.length) {
        throw new Error(`${lesson.id}/${question.id} has incomplete exact Moodle A-46 evidence.`);
    }
}

function createMoodleCommuteBinding({ lesson, question, source }) {
    const expected = MOODLE_L21_COMMUTE_TASKS[question.id];
    const taskEvidence = { prompt: expected.prompt, sourceScript: MOODLE_L21_SOURCE_SCRIPT };
    const supportEvidence = { sourceScript: MOODLE_L21_SOURCE_SCRIPT, answer: expected.answer };
    return {
        packageId: lesson.id,
        sourceQuestionId: question.id,
        locator: question.audioRef,
        source: {
            corpus: source.source.corpus,
            questionId: question.id,
            questionMapRef: source.source.questionMapRef,
            audioSha256: source.source.sha256,
        },
        verification: {
            taskEvidenceSha256: sha256(JSON.stringify(taskEvidence)),
            supportEvidenceSha256: sha256(JSON.stringify(supportEvidence)),
            answerGate: 'after-attempt',
            method: 'Verbatim Moodle page-3 dialogue and commute labels are paired with the byte-verified A-46 recording; the worksheet script and Japanese answer renderings remain available only after an attempt.',
        },
        learnerContract: {
            response: 'comparison-log',
            transcriptReveal: 'after-attempt',
            hintReveal: 'after-attempt',
            grading: 'deterministic',
        },
        delivery: source.delivery?.mode === 'packaged-static'
            ? { status: 'packaged-static', url: source.delivery.url }
            : { status: 'source-verified-awaiting-packaging' },
    };
}

function verifyExactMoodleB22Task({ lesson, question, source }) {
    const expected = MOODLE_L2_L03_B22_TASKS[question.id];
    if (!expected) throw new Error(`${lesson.id}/${question.id} is not an approved Moodle B-22 speaker pin.`);
    const pinOrder = Object.keys(MOODLE_L2_L03_B22_TASKS).indexOf(question.id) + 1;
    if (source.source.corpus !== 'moodle'
        || source.source.sha256 !== '6dccd9517dc4e10fb1ce3548de2c3c9d07a498f12bbf6e5b734b0e56c1490e6b'
        || question.audioRef !== source.locator
        || question.audioAssetId !== source.authoredAssetId
        || question.reference !== `moodle:7011919:17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a:pdf-p3:summer-holiday:b22:pin-${pinOrder}`
        || question.reuse !== 'verbatim-moodle'
        || question.answerStatus !== 'worksheet-script-and-audio-reviewed'
        || question.mediaStatus !== 'packaged-static-source-verified') {
        throw new Error(`${lesson.id}/${question.id} does not match its byte-verified Moodle B-22 source.`);
    }
    if (!expected.speaker || !expected.expression || !MOODLE_L2_L03_B22_SCRIPT.length) {
        throw new Error(`${lesson.id}/${question.id} has incomplete exact Moodle B-22 evidence.`);
    }
}

function createMoodleB22Binding({ lesson, question, source }) {
    const expected = MOODLE_L2_L03_B22_TASKS[question.id];
    const taskEvidence = { prompt: '夏休みは毎年何をしますか。', sourceScript: MOODLE_L2_L03_B22_SCRIPT, speakerShelf: ['speaker-a', 'speaker-b'] };
    const supportEvidence = { sourceScript: MOODLE_L2_L03_B22_SCRIPT, answer: expected.speaker, expression: expected.expression };
    return {
        packageId: lesson.id,
        sourceQuestionId: question.id,
        locator: question.audioRef,
        source: {
            corpus: source.source.corpus,
            questionId: question.id,
            questionMapRef: source.source.questionMapRef,
            audioSha256: source.source.sha256,
        },
        verification: {
            taskEvidenceSha256: sha256(JSON.stringify(taskEvidence)),
            supportEvidenceSha256: sha256(JSON.stringify(supportEvidence)),
            answerGate: 'after-attempt',
            method: 'Verbatim Moodle summer-holiday prompt and reviewed B-22 script are paired with the byte-verified recording; the speaker-pin answers and transcript remain available only after an attempt.',
        },
        learnerContract: {
            response: 'speaker-shelf',
            transcriptReveal: 'after-attempt',
            hintReveal: 'after-attempt',
            grading: 'deterministic',
        },
        delivery: source.delivery?.mode === 'packaged-static'
            ? { status: 'packaged-static', url: source.delivery.url }
            : { status: 'source-verified-awaiting-packaging' },
    };
}

function verifyExactMoodleB25Task({ lesson, question, source }) {
    const expected = MOODLE_L2_L05_B25_TASKS[question.id];
    if (!expected) throw new Error(`${lesson.id}/${question.id} is not an approved Moodle B-25 diary item.`);
    if (source.source.corpus !== 'moodle'
        || source.source.sha256 !== '2e5d1ee1e18a31b72e826670a3f6aec1c0f513a6e2f05b654e04b199ad4939f3'
        || question.audioRef !== source.locator
        || question.audioAssetId !== source.authoredAssetId
        || question.reference !== question.id
        || question.reuse !== 'verbatim-moodle'
        || question.answerStatus !== 'original-audio-reviewed'
        || question.mediaStatus !== 'packaged-static-source-verified') {
        throw new Error(`${lesson.id}/${question.id} does not match its byte-verified Moodle B-25 source.`);
    }
    if (!expected.prompt || !expected.fields.length || expected.fields.length !== expected.answers.length || !MOODLE_L2_L05_B25_SCRIPT.length) {
        throw new Error(`${lesson.id}/${question.id} has incomplete exact Moodle B-25 evidence.`);
    }
}

function createMoodleB25Binding({ lesson, question, source }) {
    const expected = MOODLE_L2_L05_B25_TASKS[question.id];
    const taskEvidence = { prompt: expected.prompt, fields: expected.fields, sourceScript: MOODLE_L2_L05_B25_SCRIPT };
    const supportEvidence = { sourceScript: MOODLE_L2_L05_B25_SCRIPT, answers: expected.answers };
    return {
        packageId: lesson.id,
        sourceQuestionId: question.id,
        locator: question.audioRef,
        source: {
            corpus: source.source.corpus,
            questionId: question.id,
            questionMapRef: source.source.questionMapRef,
            audioSha256: source.source.sha256,
        },
        verification: {
            taskEvidenceSha256: sha256(JSON.stringify(taskEvidence)),
            supportEvidenceSha256: sha256(JSON.stringify(supportEvidence)),
            answerGate: 'after-attempt',
            method: 'Verbatim Moodle B-25 picture-diary prompts and blank loci are paired with the byte-verified recording; the reviewed transcript and five plain-form answers remain available only after an attempt.',
        },
        learnerContract: {
            response: 'structured-cloze',
            transcriptReveal: 'after-attempt',
            hintReveal: 'after-attempt',
            grading: 'deterministic',
        },
        delivery: source.delivery?.mode === 'packaged-static'
            ? { status: 'packaged-static', url: source.delivery.url }
            : { status: 'source-verified-awaiting-packaging' },
    };
}

function verifyExactMinnaTask({ lesson, question, source, reviewed }) {
    const expected = reviewed.tasks[question.id];
    if (!expected || lesson.id !== reviewed.packageId) {
        throw new Error(`${lesson.id}/${question.id} is not an approved reviewed Minna item.`);
    }
    if (source.source.corpus !== 'minna'
        || source.source.sha256 !== reviewed.audioSha256
        || question.audioRef !== source.locator
        || question.audioAssetId !== source.authoredAssetId
        || question.reference !== question.id
        || question.reuse !== 'verbatim-moodle-minna'
        || question.answerStatus !== reviewed.answerStatus
        || question.mediaStatus !== 'packaged-static-source-verified') {
        throw new Error(`${lesson.id}/${question.id} does not match its byte-verified reviewed Minna source.`);
    }
    if (!expected.prompt || !expected.answer || !reviewed.transcript.length || !reviewed.response) {
        throw new Error(`${lesson.id}/${question.id} has incomplete exact reviewed Minna evidence.`);
    }
}

function createMinnaBinding({ lesson, question, source, reviewed }) {
    const expected = reviewed.tasks[question.id];
    const taskEvidence = { prompt: expected.prompt, sourceTranscript: reviewed.transcript };
    const supportEvidence = { sourceTranscript: reviewed.transcript, answer: expected.answer };
    return {
        packageId: lesson.id,
        sourceQuestionId: question.id,
        locator: question.audioRef,
        source: {
            corpus: source.source.corpus,
            questionId: question.id,
            questionMapRef: source.source.questionMapRef,
            audioSha256: source.source.sha256,
        },
        verification: {
            taskEvidenceSha256: sha256(JSON.stringify(taskEvidence)),
            supportEvidenceSha256: sha256(JSON.stringify(supportEvidence)),
            answerGate: 'after-attempt',
            method: reviewed.method,
        },
        learnerContract: {
            response: reviewed.response,
            transcriptReveal: 'after-attempt',
            hintReveal: 'after-attempt',
            grading: 'deterministic',
        },
        delivery: source.delivery?.mode === 'packaged-static'
            ? { status: 'packaged-static', url: source.delivery.url }
            : { status: 'source-verified-awaiting-packaging' },
    };
}

function createDirectMinnaBinding({ sourceQuestionId, task, source, reviewed }) {
    const taskEvidence = {
        prompt: task.prompt,
        worksheetSha256: reviewed.worksheetSha256,
        sourceTask: reviewed.sourceTask,
        sourceTranscript: reviewed.transcript,
    };
    const supportEvidence = { sourceTranscript: reviewed.transcript, answer: task.answer };
    return {
        packageId: reviewed.packageId,
        sourceQuestionId,
        locator: reviewed.locator,
        source: {
            corpus: source.source.corpus,
            questionId: sourceQuestionId,
            questionMapRef: source.source.questionMapRef,
            audioSha256: source.source.sha256,
        },
        verification: {
            taskEvidenceSha256: sha256(JSON.stringify(taskEvidence)),
            supportEvidenceSha256: sha256(JSON.stringify(supportEvidence)),
            answerGate: 'after-attempt',
            method: reviewed.method,
        },
        learnerContract: {
            response: reviewed.response,
            transcriptReveal: 'after-attempt',
            hintReveal: 'after-attempt',
            grading: 'deterministic',
        },
        delivery: source.delivery?.mode === 'packaged-static'
            ? { status: 'packaged-static', url: source.delivery.url }
            : { status: 'source-verified-awaiting-packaging' },
    };
}

function findExercise(lesson, id) {
    return lesson.components.flatMap(component => component.exercises ?? []).find(candidate => candidate.id === id);
}

function readJson(filePath) {
    return JSON.parse(readFileSync(filePath, 'utf8'));
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

main();
