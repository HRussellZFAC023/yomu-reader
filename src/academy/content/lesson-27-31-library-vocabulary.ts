export interface ExactLibraryVocabularyRow {
    readonly page: number;
    readonly row: number;
    readonly exactWords: string;
    readonly studyExpression: string;
    readonly reading: string;
    readonly studyMeaning: string;
    readonly sourceMeaning: string | null;
    readonly studyStatus: 'canonical' | 'quarantined-source-ambiguity' | 'quarantined-source-gap';
}

export interface ExactLibraryVocabularyDefinition {
    readonly packageId: string;
    readonly packageOrder: number;
    readonly moduleId: number;
    readonly payloadSha256: string;
    readonly title: string;
    readonly requireSourceMeaning?: true;
    readonly ambiguousSourceMeaningRows?: readonly number[];
    readonly layoutOnlyRows?: readonly number[];
    readonly rows: readonly ExactLibraryVocabularyRow[];
}

type RowInput = readonly [
    page: number,
    row: number,
    exactWords: string,
    studyExpression: string,
    reading: string,
    studyMeaning: string,
    sourceMeaning?: string,
];

interface SheetOptions {
    readonly requireSourceMeaning?: true;
    readonly ambiguousSourceMeaningRows?: readonly number[];
    readonly layoutOnlyRows?: readonly number[];
}

const DEFINITIONS = Object.freeze({
    'l2-l02': sheet('l2-l02', 29, 7011918,
        '34763479d18b72f20bf7618aa691b3a5d0f5855ae7f09ebd5799703b7d714097',
        'Handouts from last lesson/Chapter 19-1 Vocabulary Sheet.pdf', [
            [1, 1, 'のぼります（登ります）', '登る', 'のぼる', 'to climb'],
            [1, 2, 'のぼります（上ります）', '上る', 'のぼる', 'to go up'],
            [1, 3, 'とまります（泊まります）', '泊まる', 'とまる', 'to stay overnight'],
            [1, 4, 'かぶき（歌舞伎）', '歌舞伎', 'かぶき', 'kabuki'],
            [1, 5, 'すもう（相撲）', '相撲', 'すもう', 'sumo wrestling'],
            [1, 6, 'なっとう（納豆）', '納豆', 'なっとう', 'natto'],
            [1, 7, 'いちど（一度）', '一度', 'いちど', 'once', 'once'],
            [1, 8, 'いっかい（一回）', '一回', 'いっかい', 'once', 'once'],
            [1, 9, 'いちども 〜ない（一度も 〜ない）', '一度も', 'いちども', 'not even once; never', 'not once, never\n*used with negatives'],
            [1, 10, 'いっかいも 〜ない（一回も 〜ない）', '一回も', 'いっかいも', 'not even once; never', 'not once, never\n*used with negatives'],
            [1, 11, 'ぜひ', 'ぜひ', 'ぜひ', 'by all means; definitely', 'By all means, really'],
            [1, 12, 'はじめて（初めて）', '初めて', 'はじめて', 'for the first time', 'for the first time'],
            [1, 13, 'なんども（何度も）', '何度も', 'なんども', 'many times; repeatedly', 'many times, over and over, again\nand again'],
            [1, 14, 'なんかいも（何回も）', '何回も', 'なんかいも', 'many times; repeatedly', 'many times, over and over, again\nand again'],
        ], {
            requireSourceMeaning: true,
            layoutOnlyRows: [15, 16],
        }),
    'l2-l03': sheet('l2-l03', 30, 7011919,
        '5e7880ecbaa49b880eae7d78f938bb313bbd3f1eced59ccece97a221a64f0899',
        'Handouts from last week/Chapter 19-2,3 Vocabulary Sheet.pdf', [
            [1, 1, 'そうじ（掃除）', '掃除', 'そうじ', 'cleaning', '＊〜の 掃除を します'],
            [1, 2, 'そうじします（掃除します）', '掃除する', 'そうじする', 'to clean', '＊〜を 掃除します'],
            [1, 3, 'せんたく（洗濯）', '洗濯', 'せんたく', 'laundry', '＊〜の 洗濯を します'],
            [1, 4, 'せんたくします（洗濯します）', '洗濯する', 'せんたくする', 'to do laundry', '＊〜を 洗濯します'],
            [1, 5, 'れんしゅう（練習）', '練習', 'れんしゅう', 'practice', '＊〜の 練習を します'],
            [1, 6, 'れんしゅうします（練習します）', '練習する', 'れんしゅうする', 'to practise', '＊〜を 練習します'],
            [1, 7, 'ひ（日）', '日', 'ひ', 'day; date', 'day, date'],
            [1, 8, 'やすみ の ひ（休みの日）', '休みの日', 'やすみのひ', 'day off', 'day off → lit: a day of off'],
            [1, 9, 'いい てんきの ひ（いい天気の日）', 'いい天気の日', 'いいてんきのひ', 'sunny day', 'sunny day\n→ lit: a day of good weather'],
            [1, 10, 'でも', 'でも', 'でも', 'but', '‘but’ in casual speach'],
            [1, 11, 'もうすぐ', 'もうすぐ', 'もうすぐ', 'soon', 'soon'],
            [1, 12, 'だんだん', 'だんだん', 'だんだん', 'gradually', 'gradually'],
            [1, 13, 'なります', 'なる', 'なる', 'to become'],
            [1, 14, 'ねむい（眠い）', '眠い', 'ねむい', 'sleepy'],
            [1, 15, 'つよい（強い）', '強い', 'つよい', 'strong'],
            [1, 16, 'よわい（弱い）', '弱い', 'よわい', 'weak'],
            [2, 17, 'むりな（無理な）', '無理', 'むり', 'unreasonable; impossible'],
            [2, 18, 'かんぱい（乾杯）', '乾杯', 'かんぱい', 'cheers; a toast', 'Cheers! Toast!'],
            [2, 19, 'ダイエット', 'ダイエット', 'ダイエット', 'diet', 'diet (〜を します: go on a diet)'],
            [2, 20, 'からだ に いい（体 に いい）', '体にいい', 'からだにいい', 'good for one’s health', 'good for one’s health'],
        ], {
            requireSourceMeaning: true,
            ambiguousSourceMeaningRows: [1, 2, 3, 4, 5, 6],
            layoutOnlyRows: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
        }),
    'l2-l04': sheet('l2-l04', 31, 7011920,
        'eadb985342ee844a845bdb8ba0c8eeadc28d23e7e44fc05a025b65b701de9088',
        'Handouts/Chapter 20-1 Vocabulary Sheet.pdf', [
            [1, 1, '（ビザが）いります（要ります）', '要る', 'いる', 'to need; to require', 'need, require (a visa)'],
            [1, 2, 'パイロット', 'パイロット', 'パイロット', 'pilot'],
            [1, 3, 'そら（空）', '空', 'そら', 'sky'],
            [1, 4, 'とびます（飛びます）', '飛ぶ', 'とぶ', 'to fly'],
            [1, 5, 'うちゅう（宇宙）', '宇宙', 'うちゅう', 'space; the universe'],
            [1, 6, 'うちゅうひこうし（宇宙飛行士）', '宇宙飛行士', 'うちゅうひこうし', 'astronaut'],
            [1, 7, 'つき（月）', '月', 'つき', 'moon'],
            [1, 8, 'ぼく（僕）', '僕', 'ぼく', 'I; me (informal, used by men)', 'I (an informal equivalent of わたし used by men)'],
            [1, 9, 'きみ（君）', '君', 'きみ', 'you (informal)', 'you (an informal equivalent of あなた used to address people of equal or lower status)'],
            [1, 10, '〜くん（〜君）', '君', 'くん', 'Mr; a familiar name suffix', 'Mr. (an informal equivalent of 〜さん used to address people of equal or lower status: also often appended to boys’ name)'],
            [1, 11, 'うん', 'うん', 'うん', 'yes (informal)', 'Yes (an informal equivalent of はい)'],
            [1, 12, 'ううん', 'ううん', 'ううん', 'no (informal)', 'No (an informal equivalent of いいえ)'],
            [1, 13, 'こっち', 'こっち', 'こっち', 'this way; this place', 'this way, this place (an informal equivalent of こちら)'],
            [1, 14, 'そっち', 'そっち', 'そっち', 'that way; that place near you', 'that way, that place near the listener (an informal equivalent of そちら)'],
            [1, 15, 'あっち', 'あっち', 'あっち', 'that way; that place over there', 'that way, that place over there (an informal equivalent of あちら)'],
            [1, 16, 'どっち', 'どっち', 'どっち', 'which one; which way; where', 'which one (of two things), which way, where (an informal equivalent of どちら)'],
            [2, 17, 'おなか が いっぱいです', 'お腹がいっぱい', 'おなかがいっぱい', 'to be full', '(I am) full'],
            [2, 18, '〜けど、', 'けど', 'けど', 'but; though', '〜 but, (an informal equivalent of 〜ですが、)'],
            [2, 19, 'ぶんか（文化）', '文化', 'ぶんか', 'culture', 'Culture'],
            [2, 20, 'ことば（言葉）', '言葉', 'ことば', 'word; language'],
            [2, 21, 'きもの（着物）', '着物', 'きもの', 'kimono'],
            [2, 22, 'さどう（茶道）', '茶道', 'さどう', 'tea ceremony'],
            [2, 23, 'まっちゃ（抹茶）', '抹茶', 'まっちゃ', 'matcha; powdered green tea'],
            [2, 24, 'おちゃ（お茶）を たてます', 'お茶を点てる', 'おちゃをたてる', 'to make ceremonial tea'],
            [2, 25, 'あし（足）が しびれます', '足がしびれる', 'あしがしびれる', 'one’s leg goes numb'],
            [2, 26, 'みんよう（民謡）', '民謡', 'みんよう', 'folk song'],
            [2, 27, 'おきなわみんよう（沖縄民謡）', '沖縄民謡', 'おきなわみんよう', 'Okinawan folk song'],
            [2, 28, 'はじめ（初め）', '初め', 'はじめ', 'the beginning', 'the beginning'],
            [2, 29, 'おわり（終わり）', '終わり', 'おわり', 'the end', 'the end of 〜, The End'],
        ], {
            requireSourceMeaning: true,
            layoutOnlyRows: [30, 31, 32],
        }),
    'l2-l05': sheet('l2-l05', 32, 6974651,
        'b2835af1a2c829c0c1827ca1cf4518e0f58e05c2219aa59a5f1d64d5aacb8128',
        'Handouts/New_Chapter 20-2 Vocabulary Sheet.pdf', [
            [1, 1, '(ビザが)いります（要ります）', '要る', 'いる', 'to need; to require', 'need, require (a visa)'],
            [1, 2, 'パイロット', 'パイロット', 'パイロット', 'pilot'],
            [1, 3, 'そら（空）', '空', 'そら', 'sky'],
            [1, 4, 'とびます（⾶びます）', '飛ぶ', 'とぶ', 'to fly'],
            [1, 5, 'うちゅう（宇宙）', '宇宙', 'うちゅう', 'space; the universe'],
            [1, 6, 'うちゅうひこうし（宇宙⾶⾏⼠）', '宇宙飛行士', 'うちゅうひこうし', 'astronaut'],
            [1, 7, 'つき（⽉）', '月', 'つき', 'moon'],
            [1, 8, 'ぼく（僕）', '僕', 'ぼく', 'I; me (informal, used by men)', 'I (an informal equivalent of わたし used by men)'],
            [1, 9, 'きみ（君）', '君', 'きみ', 'you (informal)', 'you (an informal equivalent of あなた used to address people of equal or lower status)'],
            [1, 10, '〜くん（〜君）', '君', 'くん', 'Mr; a familiar name suffix', 'Mr. (an informal equivalent of 〜さん used to address people of equal or lower status: also often appended to boys’ name)'],
            [1, 11, 'うん', 'うん', 'うん', 'yes (informal)', 'Yes (an informal equivalent of はい)'],
            [1, 12, 'ううん', 'ううん', 'ううん', 'no (informal)', 'No (an informal equivalent of いいえ)'],
            [1, 13, 'みんなで', 'みんなで', 'みんなで', 'all together', 'all together'],
            [1, 14, 'しらべます（調べます）', '調べる', 'しらべる', 'to investigate; to look up'],
            [1, 15, 'しゅうりします（修理します）', '修理する', 'しゅうりする', 'to repair'],
            [2, 16, 'はじめ（初め）', '初め', 'はじめ', 'the beginning', 'the beginning'],
            [2, 17, 'おわり（終わり）', '終わり', 'おわり', 'the end', 'the end of 〜, The End'],
            [2, 18, 'よかったら', 'よかったら', 'よかったら', 'if you like', 'if you like'],
            [2, 19, 'いろいろ', 'いろいろ', 'いろいろ', 'various; all sorts', 'variouse'],
        ], {
            requireSourceMeaning: true,
            layoutOnlyRows: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
        }),
    'l2-l06': sheet('l2-l06', 33, 6974652,
        '32097fd886f557806cbecf84e943bf8b0b919ff32c6367ba4fddab5c88b11283',
        'Handouts/Chapter 21-1 Vocabulary Sheet.pdf', [
            [1, 1, 'おもいます（思います）', '思う', 'おもう', 'to think'],
            [1, 2, 'しあい（試合）', '試合', 'しあい', 'match; game'],
            [1, 3, '[試合に]かちます（勝ちます）', '勝つ', 'かつ', 'to win'],
            [1, 4, '[試合に]まけます（負けます）', '負ける', 'まける', 'to lose'],
            [1, 5, '[パーティが]あります', 'ある', 'ある', 'there is; to take place'],
            [1, 6, '[仕事を]やめます（辞めます）', '辞める', 'やめる', 'to quit; to resign'],
            [1, 7, 'かいぎしつ（会議室）', '会議室', 'かいぎしつ', 'meeting room'],
            [1, 8, 'じむしょ（事務所）', '事務所', 'じむしょ', 'office'],
            [1, 9, 'ぶちょう（部⻑）', '部長', 'ぶちょう', 'department manager'],
            [1, 10, 'さいきん（最近）', '最近', 'さいきん', 'recently; these days', 'recently, these days'],
            [1, 11, 'たぶん', 'たぶん', 'たぶん', 'probably; perhaps; maybe', 'probably, perhaps, maybe'],
            [1, 12, 'きっと', 'きっと', 'きっと', 'surely; definitely', 'surely, definitely'],
            [1, 13, 'やくに たちます（役に⽴ちます）', '役に立つ', 'やくにたつ', 'to be useful', 'be useful'],
            [1, 14, 'ぶっか（物価）', '物価', 'ぶっか', 'prices; cost of living'],
            [1, 15, 'いけん（意⾒）', '意見', 'いけん', 'opinion'],
            [1, 16, 'べんりな（便利な）', '便利', 'べんり', 'convenient'],
            [1, 17, 'ふべんな（不便な）', '不便', 'ふべん', 'inconvenient'],
            [2, 18, 'むだな（無駄な）', '無駄', 'むだ', 'wasteful; useless'],
            [2, 19, 'ほんとうに', '本当に', 'ほんとうに', 'really', 'really'],
            [2, 20, 'ほんとう（本当）', '本当', 'ほんとう', 'truth; real', 'true, real'],
            [2, 21, 'うそ', '嘘', 'うそ', 'lie; falsehood', 'lie, fake'],
            [2, 22, 'こうつう（交通）', '交通', 'こうつう', 'traffic; transportation'],
            [2, 23, 'じどうしゃ（⾃動⾞）', '自動車', 'じどうしゃ', 'automobile'],
            [2, 24, 'き を つけます（気をつけます）', '気をつける', 'きをつける', 'to pay attention; to take care', 'pay attention, take care'],
            [2, 25, '〜に ついて', 'について', 'について', 'about; concerning', 'about 〜, concerning 〜'],
            [2, 26, 'クイズ', 'クイズ', 'クイズ', 'quiz', 'Quiz'],
            [2, 27, 'ちり（地理）', '地理', 'ちり', 'geography', 'geography'],
            [2, 28, 'しまぐに（島国）', '島国', 'しまぐに', 'island country', 'island country'],
            [2, 29, 'しま（島）', '島', 'しま', 'island', 'island'],
            [2, 30, 'かいがんせん（海岸線）', '海岸線', 'かいがんせん', 'coastline', 'Coast line'],
            [2, 31, '〜キロメートル', 'キロメートル', 'キロメートル', 'kilometre', '- kilometer'],
            [2, 32, '久しぶりですね。', '久しぶり', 'ひさしぶり', 'It has been a long time.', 'It’s been a long time (since we last met).'],
            [2, 33, '〜でも 飲みませんか。', '飲む', 'のむ', 'How about drinking something?', 'How about drinking 〜 or something?'],
            [2, 34, 'もちろん', 'もちろん', 'もちろん', 'of course', 'もちろん'],
            [2, 35, 'もう、帰らないと…。', '帰る', 'かえる', 'I have to get home now.', 'I have to get home now…'],
        ], {
            requireSourceMeaning: true,
            ambiguousSourceMeaningRows: [34],
            layoutOnlyRows: [],
        }),
    'l2-l07': sheet('l2-l07', 34, 6974653,
        'f6b10fcf6b0ae20a54814eb96bd8c8a779286137ae761b0249de88c9d5c261fa',
        'Handouts/Chapter 21-2 Vocabulary Sheet.pdf', [
            [1, 1, 'こうつう（交通）', '交通', 'こうつう', 'traffic; transportation'],
            [1, 2, 'いいます（⾔います）', '言う', 'いう', 'to say'],
            [1, 3, 'りゅうがくします（留学します）', '留学する', 'りゅうがくする', 'to study abroad'],
            [1, 4, 'ゆめ（夢）', '夢', 'ゆめ', 'dream'],
            [1, 5, 'てんさい（天才）', '天才', 'てんさい', 'genius'],
            [1, 6, 'ちきゅう（地球）', '地球', 'ちきゅう', 'Earth; the globe'],
            [1, 7, 'つき（⽉）', '月', 'つき', 'moon'],
            [1, 8, 'じどうしゃ（⾃動⾞）', '自動車', 'じどうしゃ', 'automobile'],
            [1, 9, 'うごきま（動きます）', '動く', 'うごく', 'to move', 'to move'],
            [1, 10, 'ほうそう（放送）', '放送', 'ほうそう', 'broadcast'],
            [1, 11, 'おやしらず（親知らず）', '親知らず', 'おやしらず', 'wisdom tooth'],
            [1, 12, 'ぬきます（抜きます）', '抜く', 'ぬく', 'to pull out; to extract'],
            [1, 13, 'ぎおんまつり（祇園祭）', '祇園祭', 'ぎおんまつり', 'Gion Festival'],
            [1, 14, 'はも りょうり（鱧 料理）', '鱧料理', 'はもりょうり', 'pike conger cuisine'],
            [1, 15, 'よしのやま（吉野⼭）', '吉野山', 'よしのやま', 'Mount Yoshino'],
        ], {
            requireSourceMeaning: true,
            layoutOnlyRows: [16, 17, 18],
        }),
    'l2-l08': sheet('l2-l08', 35, 6974656,
        'd15120789831ab8a2cac59a1b90e70faf828abec0457d2fad519cee44b9bce82',
        'Handouts/Chapter 22-1 Vocabulary Sheet.pdf', [
            [1, 1, 'きょうかしょ（教科書）', '教科書', 'きょうかしょ', 'textbook'],
            [1, 2, 'ケーキ', 'ケーキ', 'ケーキ', 'cake'],
            [1, 3, 'コート', 'コート', 'コート', 'coat'],
            [1, 4, 'セーター', 'セーター', 'セーター', 'sweater'],
            [1, 5, 'スーツ', 'スーツ', 'スーツ', 'suit'],
            [1, 6, 'ドレス', 'ドレス', 'ドレス', 'dress'],
            [1, 7, 'きます（着ます）', '着る', 'きる', 'to wear; to put on (upper body)'],
            [1, 8, 'ずぼん', 'ズボン', 'ズボン', 'trousers; pants'],
            [1, 9, 'はきます（履きます）', '履く', 'はく', 'to wear; to put on (lower body)'],
            [1, 10, 'ぼうし（帽子）', '帽子', 'ぼうし', 'hat; cap'],
            [1, 11, 'かぶります（被ります）', '被る', 'かぶる', 'to wear; to put on (head)'],
            [1, 12, 'めがね（眼鏡）', '眼鏡', 'めがね', 'glasses'],
            [1, 13, 'かけます（掛けます）', '掛ける', 'かける', 'to wear; to put on (glasses)'],
            [1, 14, '[ネクタイを]します', 'ネクタイをする', 'ネクタイをする', 'to wear a tie'],
            [1, 15, 'うまれます（生まれます）', '生まれる', 'うまれる', 'to be born'],
            [1, 16, 'おべんとう（お弁当）', 'お弁当', 'おべんとう', 'boxed lunch'],
            [1, 17, 'わたしたち', '私たち', 'わたしたち', 'we; us'],
            [1, 18, 'よく', 'よく', 'よく', 'often', 'often'],
        ], {
            requireSourceMeaning: true,
        }),
    'l2-l09': sheet('l2-l09', 36, 6974657,
        'ccd43883779254dcb24807ec490f07ca47224b7b41b3f3260e99171d98687dc6',
        'Handouts/Chapter 22-2 Vocabulary Sheet.pdf', [
            [1, 1, 'すきな（好きな）', '好き', 'すき', 'liked; favourite'],
            [1, 2, 'ほしい（欲しい）', '欲しい', 'ほしい', 'wanted; desired'],
            [1, 3, 'わかります', '分かる', 'わかる', 'to understand'],
            [1, 4, 'いります（要ります）', '要る', 'いる', 'to need; to require'],
            [1, 5, 'ロボット', 'ロボット', 'ロボット', 'robot'],
            [1, 6, 'ユーモア', 'ユーモア', 'ユーモア', 'humour', 'humor'],
            [1, 7, 'つごう（都合）', '都合', 'つごう', 'circumstances; convenience', 'personal reasons, one’s\nconvenience'],
            [1, 8, 'つごうが わるい（都合が悪い）', '都合が悪い', 'つごうがわるい', 'inconvenient; not a good time', 'inconvenient, bad day/time and\netc (it depends on context)'],
            [1, 9, 'せいじんしき（成人式）', '成人式', 'せいじんしき', 'coming-of-age ceremony'],
            [1, 10, 'せいじん（成人）', '成人', 'せいじん', 'adult'],
            [1, 11, 'おめでとう ございます', 'おめでとうございます', 'おめでとうございます', 'congratulations', 'Congratulations (used on\nbirthdays, at weddings, New\nYear’s Day, etc)'],
            [1, 12, 'しょうらい（将来）', '将来', 'しょうらい', 'future', 'the future, times/days to come'],
            [1, 13, 'おさがしですか。（お探しですか）', '探す', 'さがす', 'to look for; to search for', 'Are you looking for 〜？'],
            [1, 14, 'では、', 'では', 'では', 'well then', 'Well then,'],
            [1, 15, 'こちら', 'こちら', 'こちら', 'this; this one; here', 'this (polite equivalent of これ)'],
            [1, 16, 'やちん（家賃）', '家賃', 'やちん', 'rent', 'rent'],
            [2, 17, 'ダイニングキッチン', 'ダイニングキッチン', 'ダイニングキッチン', 'kitchen with a dining area', 'kitchen with a dining area'],
            [2, 18, 'わしつ（和室）', '和室', 'わしつ', 'Japanese-style room', 'Japanese –style room'],
            [2, 19, 'おしいれ（押し入れ）', '押し入れ', 'おしいれ', 'Japanese-style closet', 'Japanese –style closet'],
            [2, 20, 'ふとん（布団）', '布団', 'ふとん', 'Japanese-style mattress and quilt', 'Japanese –style mattress and quilt'],
        ], {
            requireSourceMeaning: true,
            layoutOnlyRows: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
        }),
    'l2-l10': sheet('l2-l10', 37, 6974659,
        'd1296c24f28bc57a83b8c09ce5c591e76d8bae0ea97cf928e4a1b079329a2af4',
        'Handouts/Chapter 23-1 Vocabulary Sheet.pdf', [
            [1, 1, 'ききます（聞きます）', '聞く', 'きく', 'to listen', 'to listen'],
            [1, 2, 'ききます（聞きます）', '聞く', 'きく', 'to ask; to inquire', 'to ask someone about something,\nto inquire, to put a question to\nsomeone'],
            [1, 3, 'あるきます（歩きます）', '歩く', 'あるく', 'to walk'],
            [1, 4, 'しんごう（信号）', '信号', 'しんごう', 'traffic light'],
            [1, 5, 'おうだんほどう（横断歩道）', '横断歩道', 'おうだんほどう', 'pedestrian crossing'],
            [1, 6, 'みち（道）', '道', 'みち', 'road; street; way'],
            [1, 7, 'わたります（渡ります）', '渡る', 'わたる', 'to cross'],
            [1, 8, 'き を つけます（気を付けます）', '気を付ける', 'きをつける', 'to be careful'],
            [1, 9, 'かぜ を ひきます（⾵邪を引きます）', '風邪を引く', 'かぜをひく', 'to catch a cold'],
            [1, 10, 'さびしい（寂しい）', '寂しい', 'さびしい', 'lonely'],
            [1, 11, 'なんかいも（何回も）', '何回も', 'なんかいも', 'many times', 'many times'],
            [1, 12, 'サイズ', 'サイズ', 'サイズ', 'size', 'size'],
            [1, 13, 'かえます（変えます）', '変える', 'かえる', 'to change'],
            [1, 14, 'こしょうします（故障します）', '故障する', 'こしょうする', 'to break down; to be out of order', 'break, fail, break down, be out of\norder'],
            [1, 15, 'でんしじしょ（電⼦辞書）', '電子辞書', 'でんしじしょ', 'electronic dictionary'],
            [1, 16, 'どうしますか', 'どうしますか', 'どうしますか', 'what will you do?', 'What will you do, what should I\ndo, what do you/I do etc,\ndepends on the situation.'],
        ], {
            requireSourceMeaning: true,
        }),
    'l2-l11': sheet('l2-l11', 38, 6974661,
        'd1296c24f28bc57a83b8c09ce5c591e76d8bae0ea97cf928e4a1b079329a2af4',
        'Handouts/New_Chapter 23-1 Vocabulary Sheet.pdf', [
            [1, 1, 'ききます（聞きます）', '聞く', 'きく', 'to listen', 'to listen'],
            [1, 2, 'ききます（聞きます）', '聞く', 'きく', 'to ask; to inquire', 'to ask someone about something,\nto inquire, to put a question to\nsomeone'],
            [1, 3, 'あるきます（歩きます）', '歩く', 'あるく', 'to walk'],
            [1, 4, 'しんごう（信号）', '信号', 'しんごう', 'traffic light'],
            [1, 5, 'おうだんほどう（横断歩道）', '横断歩道', 'おうだんほどう', 'pedestrian crossing'],
            [1, 6, 'みち（道）', '道', 'みち', 'road; street; way'],
            [1, 7, 'わたります（渡ります）', '渡る', 'わたる', 'to cross'],
            [1, 8, 'き を つけます（気を付けます）', '気を付ける', 'きをつける', 'to be careful'],
            [1, 9, 'かぜ を ひきます（⾵邪を引きます）', '風邪を引く', 'かぜをひく', 'to catch a cold'],
            [1, 10, 'さびしい（寂しい）', '寂しい', 'さびしい', 'lonely'],
            [1, 11, 'なんかいも（何回も）', '何回も', 'なんかいも', 'many times', 'many times'],
            [1, 12, 'サイズ', 'サイズ', 'サイズ', 'size', 'size'],
            [1, 13, 'かえます（変えます）', '変える', 'かえる', 'to change'],
            [1, 14, 'こしょうします（故障します）', '故障する', 'こしょうする', 'to break down; to be out of order', 'break, fail, break down, be out of\norder'],
            [1, 15, 'でんしじしょ（電⼦辞書）', '電子辞書', 'でんしじしょ', 'electronic dictionary'],
            [1, 16, 'どうしますか', 'どうしますか', 'どうしますか', 'what will you do?', 'What will you do, what should I\ndo, what do you/I do etc,\ndepends on the situation.'],
        ], {
            requireSourceMeaning: true,
        }),
    'l2-l12': sheet('l2-l12', 39, 8121261,
        'fc585caf40f28fb6e6ab65bc340e563c12d6526ec06556a5057a12793cb17ef5',
        'Handouts/New_Chapter 28-1 Vocabulary Sheet.pdf', [
            [1, 1, 'ねころがります（寝転がります）', '寝転がる', 'ねころがる', 'to lie down'],
            [1, 2, 'おどります（踊ります）', '踊る', 'おどる', 'to dance'],
            [1, 3, 'しょうせつ（⼩説）', '小説', 'しょうせつ', 'novel'],
            [1, 4, 'しょうせつか（⼩説家）', '小説家', 'しょうせつか', 'novelist'],
            [1, 5, '〜か（〜家）', '〜家', 'か', 'specialist; professional (suffix)'],
            [1, 6, 'かよいます（通います）', '通う', 'かよう', 'to commute; to attend regularly',
                'commute from place 1 to place 2 /\nbetween place 1 and place 2, make\na trip to and from, go\nto/visit/attend a place\nfrequently/regularly'],
            [1, 7, 'メモ', 'メモ', 'メモ', 'memo; note'],
            [1, 8, 'メモします', 'メモする', 'メモする', 'to take notes'],
            [1, 9, 'ガム', 'ガム', 'ガム', 'chewing gum'],
            [1, 10, 'ガムを かみます', 'ガムをかむ', 'ガムをかむ', 'to chew gum'],
            [1, 11, 'ちゅういします（注意します）', '注意する', 'ちゅういする', 'to warn; to pay attention',
                'warn, pay/give attention to\nsomething, carefully, be careful of,\ntake care of'],
            [1, 12, 'スピーチ', 'スピーチ', 'スピーチ', 'speech', 'speech'],
            [1, 13, 'げんこう（原稿）', '原稿', 'げんこう', 'manuscript; draft', 'manuscript, draft'],
            [1, 14, 'しょうらい（将来）', '将来', 'しょうらい', 'future'],
            [1, 15, 'ゆめ（夢）', '夢', 'ゆめ', 'dream'],
            [1, 16, 'しょうらい の ゆめ（ 将来 の 夢 ）', '将来の夢', 'しょうらいのゆめ', 'dream for the future'],
            [2, 17, 'うります（売ります）', '売る', 'うる', 'to sell', 'to sell'],
            [2, 18, 'うれます（売れます）', '売れる', 'うれる', 'to sell; to be sold',
                'sell, be sold\n*intransitive verb\n(自動詞／じどうし)'],
            [2, 19, 'ばんぐみ（番組）', '番組', 'ばんぐみ', 'programme', 'programme'],
            [2, 20, 'ドラマ', 'ドラマ', 'ドラマ', 'drama', 'drama'],
            [2, 21, 'むすめ（娘）', '娘', 'むすめ', 'daughter'],
            [2, 22, 'むすこ（息⼦）', '息子', 'むすこ', 'son'],
            [2, 23, 'たいてい', 'たいてい', 'たいてい', 'usually; mostly',
                'usually, mostly\nfrequency ratio 70-80%\n*it’s about your habit'],
            [2, 24, 'よく', 'よく', 'よく', 'often',
                'often\nfrequency ratio 70-80%\n*it’s more about how frequents'],
        ], {
            requireSourceMeaning: true,
            layoutOnlyRows: [25, 26, 27, 28, 29, 30, 31, 32],
        }),
    'l2-l13': sheet('l2-l13', 40, 8121266,
        '40568a1fe04d69eb9454ad6718e1f1b33a9d0e0036bcc5c3c6970532d4a28707',
        'Handouts/New_Chapter 28-2 Vocabulary Sheet.pdf', [
            [1, 1, 'まじめな（真⾯⽬な）', '真面目', 'まじめ', 'serious; diligent; earnest'],
            [1, 2, 'ねっしんな（熱⼼な）', '熱心', 'ねっしん', 'enthusiastic; eager', 'usually, mostly'],
            [1, 3, 'かしゅ（歌⼿）', '歌手', 'かしゅ', 'singer'],
            [1, 4, 'にんき（⼈気）', '人気', 'にんき', 'popularity', 'popularity'],
            [1, 5, '⼈気が あります', '人気がある', 'にんきがある', 'to be popular', 'be popular'],
            [1, 6, 'あかるい（明るい）', '明るい', 'あかるい', 'bright; cheerful',
                '*this adjectives is used to express\npeople’s characteristics.'],
            [1, 7, 'けいけん（経験）', '経験', 'けいけん', 'experience', 'experience'],
            [1, 8, '経験が あります', '経験がある', 'けいけんがある', 'to be experienced', 'be experienced'],
            [1, 9, '経験を します', '経験をする', 'けいけんをする', 'to experience', 'to experience'],
            [1, 10, 'ちょうどいい', 'ちょうどいい', 'ちょうどいい', 'proper; just right', 'proper, just right'],
            [1, 12, 'けしき（景⾊）', '景色', 'けしき', 'scenery; view'],
            [1, 13, 'びよういん（美容院）', '美容院', 'びよういん', 'beauty salon'],
            [1, 14, 'だいどころ（台所）', '台所', 'だいどころ', 'kitchen'],
            [1, 15, 'かたち（形）', '形', 'かたち', 'shape; form'],
            [1, 16, 'いろ（⾊）', '色', 'いろ', 'colour'],
            [2, 17, 'しなもの（品物）', '品物', 'しなもの', 'goods; merchandise'],
            [2, 18, 'ねだん（値段）', '値段', 'ねだん', 'price'],
            [2, 19, 'きゅうりょう（給料）', '給料', 'きゅうりょう', 'salary; pay'],
            [2, 20, 'ボーナス', 'ボーナス', 'ボーナス', 'bonus', 'bouns'],
            [2, 21, 'しばらく', 'しばらく', 'しばらく', 'a little while', 'a little while'],
            [2, 22, 'それに', 'それに', 'それに', 'in addition', 'in addition'],
            [2, 23, 'それで', 'それで', 'それで', 'and so', 'and so'],
            [2, 24, 'ちょっと お願いが あるんですが。', 'ちょっとお願いがあるんですが', 'ちょっとおねがいがあるんですが',
                'I have a small favour to ask', 'I have a (small) favour to ask,'],
            [2, 25, 'じつは（実は）', '実は', 'じつは', 'as a matter of fact', 'as a matter of fact, in fact, actually'],
            [2, 26, 'かいわ（会話）', '会話', 'かいわ', 'conversation', 'conversation'],
            [2, 27, 'うーん、、、', 'うーん', 'うーん', 'well; let me see; hmm', 'well,,, let me see,,, hmmm,,,'],
            [3, 26, 'いっしょうけんめい（⼀⽣懸命）', '一生懸命', 'いっしょうけんめい', 'with all one’s effort',
                'with all one’s effort'],
        ], {
            requireSourceMeaning: true,
            ambiguousSourceMeaningRows: [2, 6],
            layoutOnlyRows: [28, 29, 31, 32],
        }),
    'l2-l18': sheet('l2-l18', 45, 8121271,
        '0da41a083ba196d0b8dab00b5ccd06baf4e649bdb9c1ea047b926277a0690851',
        'Chapter 30-3 Vocabulary Sheet', [
            [1, 1, 'たいふう（台⾵）', '台風', 'たいふう', 'typhoon'],
            [1, 2, 'かぜ が つよい（⾵が強い）', '風が強い', 'かぜがつよい', 'the wind is strong'],
            [1, 3, 'うえき（植⽊）', '植木', 'うえき', 'garden plant; potted plant'],
            [1, 4, 'ひあたり が いい（⽇当たり が いい）', '日当たりがいい', 'ひあたりがいい', 'to get good sunlight'],
            [1, 5, 'でんごん（伝⾔）', '伝言', 'でんごん', 'verbal message', 'a verbale message'],
            [1, 6, '伝⾔メモ', '伝言メモ', 'でんごんメモ', 'written message; memo', 'a written message on a piece of paper, memorandum'],
            [1, 7, 'してん（⽀店）', '支店', 'してん', 'branch office', '= ししゃ（支社）\na branch office'],
            [1, 8, 'ぶか（部下）', '部下', 'ぶか', 'subordinate', 'a subordinate, a follower'],
            [1, 9, 'じょうし（上司）', '上司', 'じょうし', 'boss; superior', 'one’s boss, one’s superior'],
            [1, 10, 'おさきに しつれい します（お先に失礼します）', 'お先に失礼します', 'おさきにしつれいします',
                'Excuse me for leaving before you.',
                'lit; excuse me for leaving before you. This is very common greeting when you leave office/work before someone.'],
            [1, 11, 'とどきます（届きます）', '届く', 'とどく', 'to arrive', 'to arrive'],
            [1, 12, 'うかがいます（伺います）', '伺う', 'うかがう', 'to ask; to visit (humble)', 'to ask, to visit\n(humble for たずねる)'],
            [1, 13, 'ぜったいに 〜ない（絶対に 〜ない）', '絶対に〜ない', 'ぜったいに〜ない', 'never; absolutely not', 'never'],
            [1, 14, 'かせいふ（家政婦）', '家政婦', 'かせいふ', 'housekeeper'],
            [1, 15, 'リュック', 'リュック', 'リュック', 'rucksack; backpack'],
            [1, 16, 'ひじょうぶくろ（⾮常袋）', '非常袋', 'ひじょうぶくろ', 'emergency bag; emergency kit'],
            [2, 17, 'ひじょうじ（⾮常時）', '非常時', 'ひじょうじ', 'in an emergency'],
            [2, 18, 'かいちゅうでんとう（懐中電灯）', '懐中電灯', 'かいちゅうでんとう', 'torch; flashlight'],
            [2, 19, 'じゅんびします（準備します）', '準備する', 'じゅんびする', 'to prepare'],
            [2, 20, 'せいかつします（⽣活します）', '生活する', 'せいかつする', 'to live; conduct daily life'],
        ]),
    'l2-l21': sheet('l2-l21', 48, 8121277,
        '8c1351970eebe85982be7e175f957914d21bd30abfcb16e21098b00b9cbea8a9',
        'Chapter 31-2 Vocabulary Sheet', [
            [1, 1, 'よてい（予定）', '予定', 'よてい', 'plan; schedule'],
            [1, 2, 'よていを たてます（予定を⽴てます）', '予定を立てる', 'よていをたてる', 'to make a plan'],
            [1, 3, 'ねんりょうサーチャージ（燃料）', '燃料サーチャージ', 'ねんりょうサーチャージ', 'energy surcharge', 'Energy surcharge'],
            [1, 4, 'ちょっこうびん（直⾏便）', '直行便', 'ちょっこうびん', 'direct flight'],
            [1, 5, 'けいゆびん（経由便）', '経由便', 'けいゆびん', 'connecting flight'],
            [1, 6, 'じょうじゅん（上旬）', '上旬', 'じょうじゅん', 'early in the month'],
            [1, 7, 'げじゅん（下旬）', '下旬', 'げじゅん', 'late in the month'],
            [1, 8, 'ずっと', 'ずっと', 'ずっと', 'all the time', 'The whole time'],
            [1, 9, 'やすみ を とります（休みを取ります）', '休みを取る', 'やすみをとる', 'to take leave'],
            [1, 10, 'けっこんしき（結婚式）', '結婚式', 'けっこんしき', 'wedding ceremony'],
            [1, 11, 'おそうしき（お葬式）', 'お葬式', 'おそうしき', 'funeral'],
            [1, 12, '〜しき（〜式）', '〜式', 'しき', 'ceremony', 'ceremony'],
            [1, 13, 'だいがくいん（⼤学院）', '大学院', 'だいがくいん', 'graduate school', 'Master degree course,\npost graduate'],
            [1, 14, 'いいわけ（⾔い訳）', '言い訳', 'いいわけ', 'excuse'],
            [1, 15, 'のりおくれます（乗り遅れます）', '乗り遅れる', 'のりおくれる', 'to miss a train or bus'],
            [1, 16, 'てんきん（転勤）', '転勤', 'てんきん', 'job transfer'],
            [2, 17, '転勤します', '転勤する', 'てんきんする', 'to transfer jobs'],
            [2, 18, 'たんしんふにん（単⾝赴任）', '単身赴任', 'たんしんふにん', 'solo job assignment'],
            [2, 19, 'てんしょく（転職）', '転職', 'てんしょく', 'career change'],
            [2, 20, '転職します', '転職する', 'てんしょくする', 'to change jobs'],
            [2, 22, 'じつは 〜んです。（実は、〜んです。）', '実は〜んです', 'じつは〜んです', 'as a matter of fact', 'As a matter of fact, -.'],
            [2, 23, 'のこります（残ります）', '残る', 'のこる', 'to remain; stay behind', 'remain, be left, stay behind'],
            [2, 24, 'にゅうがくしけん（⼊学試験）', '入学試験', 'にゅうがくしけん', 'entrance examination', 'Entrance examination'],
            [2, 25, 'つきに ２、3 かい（⽉に２、３回）', '月に2、3回', 'つきにに、さんかい', 'two or three times a month', '2-3 times per month'],
        ]),
    'l2-l29': sheet('l2-l29', 56, 8121295,
        'ba7cab72fb58a1573c5c721fef0d7bd11c5258a11a395c4a27f6a37c8503bd9f',
        'Chapter 34-2 Vocabulary Sheet', [
            [1, 1, '[傘 を]さします', '傘を差す', 'かさをさす', 'to put up; to use an umbrella'],
            [1, 2, 'ゆうべ（昨夜）', '昨夜', 'ゆうべ', 'last night', 'from evening to night of yesterday = last night'],
            [1, 3, 'ゆうべ（⼣べ）', '夕べ', 'ゆうべ', 'evening; dusk', 'Evening, dusk Event which is start from early evening'],
            [1, 4, 'しお（塩）', '塩', 'しお', 'salt'],
            [1, 5, 'さとう（砂糖）', '砂糖', 'さとう', 'sugar'],
            [1, 6, 'ぎゅうにゅう（⽜乳）', '牛乳', 'ぎゅうにゅう', 'milk'],
            [1, 7, 'ソース', 'ソース', 'ソース', 'sauce'],
            [1, 8, 'しょうゆ（醤油）', '醤油', 'しょうゆ', 'soy sauce'],
            [1, 9, '[醤油を・塩を]かけます（掛けます）', '掛ける', 'かける', 'to pour; to sprinkle', 'pour, sprinkle soy sauce, salt and etc on food'],
            [1, 10, '[醤油を]いれます（入れます）', '入れる', 'いれる', 'to put in; to add', 'put in, add soy sauce and etc'],
            [1, 11, '[醤油を]つけます（付けます）', '付ける', 'つける', 'to dip; to apply', 'dip food in soy sauce and etc'],
            [1, 12, 'ひ に かけます（火にかけます）', '火にかける', 'ひにかける', 'to put on the heat', 'put something on fire/heat'],
            [1, 13, 'にます（煮ます）', '煮る', 'にる', 'to simmer; to boil'],
            [1, 14, 'やきます（焼きます）', '焼く', 'やく', 'to grill; to bake; to roast', 'grill, bake, roast'],
            [1, 15, 'あげます（揚げます）', '揚げる', 'あげる', 'to deep-fry'],
            [1, 16, 'いためます（炒めます）', '炒める', 'いためる', 'to stir-fry'],
            [1, 17, 'ゆでます（茹でます）', '茹でる', 'ゆでる', 'to boil'],
            [2, 18, 'むします（蒸します）', '蒸す', 'むす', 'to steam'],
            [2, 19, 'たきます（炊きます）', '炊く', 'たく', 'to cook rice', 'boil, cook rice'],
            [2, 20, 'むきます（剥きます）', '剥く', 'むく', 'to peel'],
            [2, 21, 'きざみます（刻みます）', '刻む', 'きざむ', 'to chop; to mince'],
            [2, 22, 'かきまぜます（かき混ぜます）', 'かき混ぜる', 'かきまぜる', 'to stir; to mix'],
            [2, 23, 'できあがります（出来上がります）', '出来上がる', 'できあがる', 'to be completed; to be ready'],
            [2, 24, 'かいがいりょこう（海外旅行）', '海外旅行', 'かいがいりょこう', 'travel abroad', 'travel abroad'],
            [2, 25, 'こくないりょこう（国内旅行）', '国内旅行', 'こくないりょこう', 'domestic travel', 'travel in the country where you are staying/living'],
            [2, 26, 'けんこうしんだん（健康診断）', '健康診断', 'けんこうしんだん', 'health check', 'physical check-up, annual health check'],
            [2, 27, 'レントゲン', 'レントゲン', 'レントゲン', 'X-ray', 'X-Ray'],
            [2, 28, 'もくひょう（目標）', '目標', 'もくひょう', 'goal', 'goal'],
            [2, 29, 'むだ を なくします（無駄を無くします）', '無駄を無くす', 'むだをなくす', 'to eliminate waste', 'get lid of...'],
            [2, 30, '〜。また、〜。', 'また', 'また', 'also; additionally; or', 'also, additionally, or...'],
            [2, 31, 'さんかします（参加します）', '参加する', 'さんかする', 'to participate', 'participate, attend, take part in...'],
            [2, 32, 'できるだけ', 'できるだけ', 'できるだけ', 'as much as possible'],
        ]),
} satisfies Readonly<Record<string, ExactLibraryVocabularyDefinition>>);

/** Advance this frontier only when the next L2 package has an evidence-linked exact projection. */
const EXACT_LIBRARY_VOCABULARY_DELIVERY_FRONTIER = 11;
export const EXACT_LIBRARY_VOCABULARY_PACKAGE_IDS = Object.freeze(
    Array.from(
        { length: EXACT_LIBRARY_VOCABULARY_DELIVERY_FRONTIER - 1 },
        (_, index) => `l2-l${String(index + 2).padStart(2, '0')}` as keyof typeof DEFINITIONS,
    ),
);
const EXACT_LIBRARY_VOCABULARY_EXTENSION_PACKAGE_IDS = Object.freeze([
    'l2-l12', 'l2-l13', 'l2-l18', 'l2-l21', 'l2-l29',
] as const);

const ALL_EXACT_LIBRARY_VOCABULARY_PACKAGE_IDS = Object.freeze([
    ...EXACT_LIBRARY_VOCABULARY_PACKAGE_IDS,
    ...EXACT_LIBRARY_VOCABULARY_EXTENSION_PACKAGE_IDS,
]);

export function requiresExactLibraryVocabulary(packageId: string): boolean {
    return (ALL_EXACT_LIBRARY_VOCABULARY_PACKAGE_IDS as readonly string[]).includes(packageId);
}

export function exactLibraryVocabularyDefinition(
    packageId: string,
    input: unknown,
): ExactLibraryVocabularyDefinition | undefined {
    const definition = DEFINITIONS[packageId as keyof typeof DEFINITIONS];
    if (!definition) return undefined;
    const root = record(input, `${packageId} package`);
    const coverage = record(root.sourceCoverage, `${packageId} source coverage`);
    if (root.id !== definition.packageId
        || root.order !== definition.packageOrder
        || coverage.archiveModuleId !== definition.moduleId) {
        throw new TypeError(`Unexpected ${packageId} source package identity.`);
    }
    const members = array(coverage.members, `${packageId} source members`).map((value, index) =>
        record(value, `${packageId} source member ${index + 1}`));
    const source = members.find(member => member.payloadSha256 === definition.payloadSha256);
    if (!source || source.title !== definition.title
        || (source.role !== 'vocabulary' && source.role !== 'source-vocabulary')) {
        throw new TypeError(`${packageId} is missing its exact Library vocabulary source.`);
    }
    if (definition.requireSourceMeaning) validateExactSourceProjection(root, definition);
    return definition;
}

function sheet(
    packageId: string,
    packageOrder: number,
    moduleId: number,
    payloadSha256: string,
    title: string,
    rows: readonly RowInput[],
    options: SheetOptions = {},
): ExactLibraryVocabularyDefinition {
    return Object.freeze({
        packageId,
        packageOrder,
        moduleId,
        payloadSha256,
        title,
        ...(options.requireSourceMeaning ? { requireSourceMeaning: true as const } : {}),
        ...(options.ambiguousSourceMeaningRows
            ? { ambiguousSourceMeaningRows: Object.freeze(options.ambiguousSourceMeaningRows) }
            : {}),
        ...(options.layoutOnlyRows ? { layoutOnlyRows: Object.freeze(options.layoutOnlyRows) } : {}),
        rows: Object.freeze(rows.map(([page, row, exactWords, studyExpression, reading, studyMeaning, sourceMeaning]) => {
            const exactSourceMeaning = sourceMeaning ?? null;
            return Object.freeze({
                page,
                row,
                exactWords,
                studyExpression,
                reading,
                studyMeaning,
                sourceMeaning: exactSourceMeaning,
                studyStatus: options.requireSourceMeaning && exactSourceMeaning === null
                    ? 'quarantined-source-gap' as const
                    : options.ambiguousSourceMeaningRows?.includes(row)
                        ? 'quarantined-source-ambiguity' as const
                        : 'canonical' as const,
            });
        })),
    });
}

function validateExactSourceProjection(
    root: Readonly<Record<string, unknown>>,
    definition: ExactLibraryVocabularyDefinition,
): void {
    const identity = record(root.identity, `${definition.packageId} identity`);
    const coverage = record(root.sourceCoverage, `${definition.packageId} source coverage`);
    if (identity.moduleId !== definition.moduleId || coverage.archiveModuleId !== definition.moduleId) {
        throw new TypeError(`${definition.packageId} Library vocabulary ownership changed.`);
    }

    const sourceId = `moodle-vocabulary:${definition.moduleId}:${definition.payloadSha256}`;
    const components = array(root.components, `${definition.packageId} components`)
        .map((value, index) => record(value, `${definition.packageId} component ${index + 1}`));
    const matches = components.filter(component => component.type === 'vocabulary'
        && record(component.provenance, `${definition.packageId} vocabulary provenance`).sourceId === sourceId);
    if (matches.length !== 1) {
        throw new TypeError(`${definition.packageId} must expose exactly one evidence-linked Library vocabulary component.`);
    }
    const component = matches[0]!;
    const provenance = record(component.provenance, `${definition.packageId} vocabulary provenance`);
    if (provenance.payloadSha256 !== definition.payloadSha256
        || provenance.title !== definition.title
        || provenance.answerVisibility !== 'after-attempt') {
        throw new TypeError(`${definition.packageId} Library vocabulary provenance changed.`);
    }

    const rows = array(component.items, `${definition.packageId} vocabulary rows`);
    if (rows.length !== definition.rows.length) {
        throw new TypeError(`${definition.packageId} Library study support no longer matches its exact source rows.`);
    }
    rows.forEach((value, index) => validateExactSourceRow(value, definition, definition.rows[index]!, sourceId));
    validateLayoutOnlyRows(component, definition);
}

function validateExactSourceRow(
    value: unknown,
    definition: ExactLibraryVocabularyDefinition,
    expected: ExactLibraryVocabularyRow,
    sourceId: string,
): void {
    const row = record(value, `${definition.packageId} vocabulary row ${expected.row}`);
    const source = record(row.source, `${definition.packageId} vocabulary row ${expected.row} source`);
    const locus = record(source.locus, `${definition.packageId} vocabulary row ${expected.row} locus`);
    const exact = record(source.exact, `${definition.packageId} vocabulary row ${expected.row} exact fields`);
    const fieldProvenance = record(source.fieldProvenance,
        `${definition.packageId} vocabulary row ${expected.row} field provenance`);
    const expectedId = `${sourceId}:p${expected.page}:row-${expected.row}`;
    if (source.itemId !== expectedId
        || source.payloadSha256 !== definition.payloadSha256
        || source.title !== definition.title
        || source.answerVisibility !== 'after-attempt'
        || locus.page !== expected.page
        || locus.row !== expected.row) {
        throw new TypeError(`${definition.packageId} Library source-row identity changed at row ${expected.row}.`);
    }
    if (exact.words !== expected.exactWords) {
        throw new TypeError(`${definition.packageId} Library exact source words changed at row ${expected.row}.`);
    }
    if (exact.meaning !== expected.sourceMeaning) {
        throw new TypeError(`${definition.packageId} Library exact source meaning changed at row ${expected.row}.`);
    }
    const expectedMeaningProvenance = expected.sourceMeaning === null ? 'yomu-support' : 'source-provided';
    if (fieldProvenance.words !== 'source-provided' || fieldProvenance.meaning !== expectedMeaningProvenance) {
        throw new TypeError(`${definition.packageId} Library field provenance changed at row ${expected.row}.`);
    }
}

function validateLayoutOnlyRows(
    component: Readonly<Record<string, unknown>>,
    definition: ExactLibraryVocabularyDefinition,
): void {
    const preStudy = record(component.preStudyVocabulary, `${definition.packageId} pre-study vocabulary`);
    const sourcePages = array(preStudy.sheets, `${definition.packageId} pre-study sheets`)
        .map((value, index) => record(value, `${definition.packageId} pre-study sheet ${index + 1}`));
    const matchingPages = sourcePages.filter(page => page.payloadSha256 === definition.payloadSha256);
    const pageNumbers = new Set(matchingPages.map(page => page.page));
    const lexicalPages = new Set(definition.rows.map(row => row.page));
    if (!matchingPages.length || matchingPages.some(page =>
        !Number.isInteger(page.page)
        || page.sourceItemId !== `moodle:${definition.payloadSha256}:page:${page.page}`
        || page.sourceTitle !== definition.title
        || page.sourceRole !== 'vocabulary'
        || page.sourceOrder !== page.page
        || typeof page.verbatimText !== 'string')
        || pageNumbers.size !== matchingPages.length
        || [...lexicalPages].some(page => !pageNumbers.has(page))) {
        throw new TypeError(`${definition.packageId} Library source-page ownership changed.`);
    }
    if (!definition.layoutOnlyRows?.length) return;
    const preservesLayoutRow = (row: number) => {
        return matchingPages.some(page => {
            const lines = String(page.verbatimText).split(/\r?\n/u);
            const index = lines.findIndex(line => line.trim() === String(row));
            return index >= 0 && lines[index + 1]?.trim() === '';
        });
    };
    if (!definition.layoutOnlyRows.every(preservesLayoutRow)) {
        throw new TypeError(`${definition.packageId} Library layout-only rows changed.`);
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
