export type LessonLevel = 'pre-N5' | 'N5' | 'N4' | 'N4+';
export type PracticeKind = 'choice' | 'text' | 'order';

export interface CourseMapping {
    readonly ucl: string;
    readonly genki: string;
    readonly minna: string;
    readonly jlpt: string;
}

export interface VocabularyItem {
    readonly japanese: string;
    readonly reading: string;
    readonly meaning: string;
    readonly example: string;
    readonly exampleMeaning: string;
}

export interface GrammarExample {
    readonly japanese: string;
    readonly meaning: string;
    readonly note?: string;
}

export interface GrammarPoint {
    readonly pattern: string;
    readonly meaning: string;
    readonly explanation: string;
    readonly examples: readonly GrammarExample[];
    readonly watchFor: string;
}

export interface DialogueLine {
    readonly speaker: string;
    readonly japanese: string;
    readonly meaning: string;
}

export interface PracticeItem {
    readonly id: string;
    readonly kind: PracticeKind;
    readonly prompt: string;
    readonly japanese?: string;
    readonly options?: readonly string[];
    readonly answer: string | readonly string[];
    readonly explanation: string;
    readonly reviewTag: string;
}

export interface FoundationLesson {
    readonly id: string;
    readonly routeNumber: number;
    readonly title: string;
    readonly japaneseTitle: string;
    readonly level: LessonLevel;
    readonly minutes: number;
    readonly scene: string;
    readonly sceneImage: string;
    readonly cast: readonly string[];
    readonly opening: readonly DialogueLine[];
    readonly objectives: readonly string[];
    readonly mapping: CourseMapping;
    readonly vocabulary: readonly VocabularyItem[];
    readonly grammar: readonly GrammarPoint[];
    readonly kanji: readonly { character: string; reading: string; word: string; meaning: string }[];
    readonly practice: readonly PracticeItem[];
    readonly reviewFrom: readonly string[];
    readonly finalTask: {
        readonly title: string;
        readonly prompt: string;
        readonly success: readonly string[];
        readonly model: string;
    };
}

const vocab = (
    japanese: string,
    reading: string,
    meaning: string,
    example: string,
    exampleMeaning: string,
): VocabularyItem => ({ japanese, reading, meaning, example, exampleMeaning });

const grammar = (
    pattern: string,
    meaning: string,
    explanation: string,
    examples: readonly GrammarExample[],
    watchFor: string,
): GrammarPoint => ({ pattern, meaning, explanation, examples, watchFor });

const choice = (
    id: string,
    prompt: string,
    japanese: string,
    options: readonly string[],
    answer: string,
    explanation: string,
    reviewTag: string,
): PracticeItem => ({ id, kind: 'choice', prompt, japanese, options, answer, explanation, reviewTag });

const text = (
    id: string,
    prompt: string,
    japanese: string,
    answer: string,
    explanation: string,
    reviewTag: string,
): PracticeItem => ({ id, kind: 'text', prompt, japanese, answer, explanation, reviewTag });

const order = (
    id: string,
    prompt: string,
    options: readonly string[],
    answer: readonly string[],
    explanation: string,
    reviewTag: string,
): PracticeItem => ({ id, kind: 'order', prompt, options, answer, explanation, reviewTag });

export const kanaOnRamp: FoundationLesson = {
    id: 'kana-on-ramp',
    routeNumber: 0,
    title: 'Kana and classroom survival',
    japaneseTitle: 'かなと教室のことば',
    level: 'pre-N5',
    minutes: 55,
    scene: 'The first evening outside the classroom',
    sceneImage: './art/environments/classroom/evening-lamplit-wide.webp',
    cast: ['Rie-sensei', 'Henry', 'Aakash'],
    opening: [
        { speaker: 'Rie-sensei', japanese: 'こんばんは。入ってください。', meaning: 'Good evening. Please come in.' },
        { speaker: 'Aakash', japanese: 'すみません。もう一度お願いします。', meaning: 'Sorry. One more time, please.' },
        { speaker: 'Rie-sensei', japanese: 'はい。ゆっくり言います。', meaning: 'Of course. I will say it slowly.' },
    ],
    objectives: [
        'Read and distinguish the core hiragana rows used in class.',
        'Use three repair phrases without switching the whole exchange to English.',
        'Recognise when Japanese is written in kana, kanji, or both.',
        'Write your name and one classroom request.',
    ],
    mapping: { ucl: 'Welcome and Level 1 entry', genki: 'Lesson 0', minna: 'Pre-lesson kana', jlpt: 'Pre-N5 readiness' },
    vocabulary: [
        vocab('こんばんは', 'こんばんは', 'good evening', 'こんばんは、リエ先生。', 'Good evening, Rie-sensei.'),
        vocab('おはようございます', 'おはようございます', 'good morning', '先生、おはようございます。', 'Good morning, sensei.'),
        vocab('ありがとうございます', 'ありがとうございます', 'thank you', 'もう一度、ありがとうございます。', 'Thank you for saying it again.'),
        vocab('すみません', 'すみません', 'excuse me / sorry', 'すみません、質問があります。', 'Excuse me, I have a question.'),
        vocab('お願いします', 'おねがいします', 'please', 'ゆっくりお願いします。', 'Slowly, please.'),
        vocab('もう一度', 'もういちど', 'one more time', 'もう一度言ってください。', 'Please say it one more time.'),
        vocab('ゆっくり', 'ゆっくり', 'slowly', 'ゆっくり読んでください。', 'Please read slowly.'),
        vocab('分かります', 'わかります', 'understand', 'はい、分かります。', 'Yes, I understand.'),
        vocab('分かりません', 'わかりません', 'do not understand', 'まだ分かりません。', 'I do not understand yet.'),
        vocab('聞いてください', 'きいてください', 'please listen', '会話を聞いてください。', 'Please listen to the conversation.'),
        vocab('読んでください', 'よんでください', 'please read', 'この文を読んでください。', 'Please read this sentence.'),
        vocab('書いてください', 'かいてください', 'please write', '名前を書いてください。', 'Please write your name.'),
    ],
    grammar: [
        grammar('〜てください', 'Please do ...', 'Attach ください to a verb in its て-form. In the first lesson, learn these classroom phrases as complete chunks before studying the full conjugation.', [
            { japanese: '聞いてください。', meaning: 'Please listen.' },
            { japanese: 'ゆっくり言ってください。', meaning: 'Please speak slowly.' },
        ], 'ください is a request, not the word for “please” in every situation.'),
        grammar('もう一度 + お願いします', 'One more time, please', 'This short repair phrase keeps a Japanese conversation moving even when you missed the sentence.', [
            { japanese: 'すみません、もう一度お願いします。', meaning: 'Sorry, one more time, please.' },
            { japanese: 'もう一度、ゆっくりお願いします。', meaning: 'One more time, slowly, please.' },
        ], 'Use a calm falling tone; it is a request, not a command.'),
    ],
    kanji: [
        { character: '一', reading: 'いち', word: 'もう一度', meaning: 'one' },
        { character: '日', reading: 'にち／ひ', word: '日本語', meaning: 'day / sun' },
        { character: '本', reading: 'ほん', word: '日本語', meaning: 'book / origin' },
        { character: '語', reading: 'ご', word: '日本語', meaning: 'language' },
    ],
    practice: [
        choice('kana-1', 'Choose the phrase that asks for repetition.', '聞こえませんでした。＿＿＿。', ['もう一度お願いします', 'いただきます', 'いってきます'], 'もう一度お願いします', 'もう一度 means “one more time.”', 'repair'),
        choice('kana-2', 'Choose the classroom request.', 'Please read.', ['読んでください', '聞いてください', '書いてください'], '読んでください', '読む becomes 読んで before ください.', 'classroom-verbs'),
        choice('kana-3', 'Which line means “I do not understand yet”?', '', ['まだ分かりません', 'もう分かります', 'よく読みます'], 'まだ分かりません', 'まだ + negative means “not yet.”', 'repair'),
        text('kana-4', 'Complete the repair phrase.', 'すみません、＿＿＿お願いします。', 'もう一度', 'The full phrase is すみません、もう一度お願いします。', 'repair'),
        order('kana-5', 'Put the polite request in order.', ['ください', 'ゆっくり', '言って'], ['ゆっくり', '言って', 'ください'], 'Adverb + て-form + ください.', 'classroom-verbs'),
        choice('kana-6', 'Choose the best response after you now understand.', '分かりますか。', ['はい、分かります', 'いいえ、読みます', 'こんばんは'], 'はい、分かります', 'Answer the question directly and keep the exchange in Japanese.', 'repair'),
    ],
    reviewFrom: [],
    finalTask: {
        title: 'Enter the classroom',
        prompt: 'Record a greeting, say your name, and use one repair phrase as if the teacher spoke too quickly.',
        success: ['A natural evening greeting', 'Your name', 'One request such as もう一度 or ゆっくり', 'A clear closing ありがとうございます'],
        model: 'こんばんは。ヘンリーです。すみません、もう一度ゆっくりお願いします。ありがとうございます。',
    },
};

export const foundationLessons: readonly FoundationLesson[] = [
    {
        id: 'lesson-01-hajimemashite',
        routeNumber: 1,
        title: 'First introductions',
        japaneseTitle: 'はじめまして',
        level: 'N5',
        minutes: 70,
        scene: 'Your first evening class in Bloomsbury',
        sceneImage: './art/environments/classroom/evening-lamplit-wide.webp',
        cast: ['Rie-sensei', 'Mika', 'Tom'],
        opening: [
            { speaker: 'Rie-sensei', japanese: 'みなさん、こんばんは。自己紹介をしましょう。', meaning: 'Good evening, everyone. Let us introduce ourselves.' },
            { speaker: 'Mika', japanese: 'はじめまして。ミカです。外国語が好きです。', meaning: 'Nice to meet you. I am Mika. I like foreign languages.' },
            { speaker: 'Tom', japanese: 'トムです。ゲームが好きです。よろしくお願いします。', meaning: 'I am Tom. I like games. Nice to meet you.' },
        ],
        objectives: ['Introduce yourself in three connected sentences.', 'Use は to set a topic and です to identify it.', 'Ask and answer a simple identity question.', 'Recognise six people-and-study kanji.'],
        mapping: { ucl: 'Level 1 Lesson 1', genki: 'Lesson 1', minna: 'Lessons 1–2', jlpt: 'N5 foundations' },
        vocabulary: [
            vocab('はじめまして', 'はじめまして', 'nice to meet you', 'はじめまして。トムです。', 'Nice to meet you. I am Tom.'),
            vocab('よろしくお願いします', 'よろしくおねがいします', 'pleased to meet you', 'どうぞよろしくお願いします。', 'I am pleased to meet you.'),
            vocab('名前', 'なまえ', 'name', 'お名前は何ですか。', 'What is your name?'),
            vocab('学生', 'がくせい', 'student', '私は学生です。', 'I am a student.'),
            vocab('先生', 'せんせい', 'teacher', 'リエ先生は日本語の先生です。', 'Rie-sensei is a Japanese teacher.'),
            vocab('会社員', 'かいしゃいん', 'company employee', 'アレックスさんは会社員です。', 'Alex is a company employee.'),
            vocab('イギリス人', 'イギリスじん', 'British person', 'ヘンリーさんはイギリス人です。', 'Henry is British.'),
            vocab('日本人', 'にほんじん', 'Japanese person', 'リエ先生は日本人です。', 'Rie-sensei is Japanese.'),
            vocab('日本語', 'にほんご', 'Japanese language', '日本語を勉強します。', 'I study Japanese.'),
            vocab('好き', 'すき', 'liked / fond of', '音楽が好きです。', 'I like music.'),
            vocab('何', 'なに／なん', 'what', 'これは何ですか。', 'What is this?'),
            vocab('私', 'わたし', 'I / me', '私はミカです。', 'I am Mika.'),
        ],
        grammar: [
            grammar('X は Y です', 'X is Y', 'は marks the topic: the thing you are talking about. です politely identifies or describes that topic.', [
                { japanese: '私はヘンリーです。', meaning: 'I am Henry.', note: 'The topic 私 can be omitted when obvious.' },
                { japanese: 'トムさんは会社員です。', meaning: 'Tom is a company employee.' },
            ], 'Write は but pronounce it わ when it marks the topic.'),
            grammar('X は Y ですか', 'Is X Y?', 'Add か to a polite sentence to make a question. Japanese usually keeps the same word order.', [
                { japanese: 'ミカさんは学生ですか。', meaning: 'Is Mika a student?' },
                { japanese: 'お名前は何ですか。', meaning: 'What is your name?' },
            ], 'Do not add English-style “do” or reverse the word order.'),
            grammar('N が好きです', 'like N', 'The thing liked is marked by が. Treat 好き as a description: “As for me, N is liked.”', [
                { japanese: '音楽が好きです。', meaning: 'I like music.' },
                { japanese: '何が好きですか。', meaning: 'What do you like?' },
            ], 'Use が, not を, with 好き.'),
        ],
        kanji: [
            { character: '人', reading: 'ひと／じん', word: '日本人', meaning: 'person' },
            { character: '名', reading: 'な', word: '名前', meaning: 'name' },
            { character: '学', reading: 'がく', word: '学生', meaning: 'study' },
            { character: '生', reading: 'せい', word: '学生', meaning: 'life / student' },
            { character: '先', reading: 'せん', word: '先生', meaning: 'previous / ahead' },
            { character: '私', reading: 'わたし', word: '私', meaning: 'I' },
        ],
        practice: [
            choice('l1-1', 'Choose the correct topic particle.', '私＿ソフィーです。', ['は', 'を', 'で'], 'は', 'は sets 私 as the topic.', 'topic-wa'),
            choice('l1-2', 'Choose the natural answer.', 'お名前は何ですか。', ['ミカです', '学生ですか', '何が好きです'], 'ミカです', 'The question asks for a name.', 'introductions'),
            text('l1-3', 'Complete the like sentence.', '音楽＿好きです。', 'が', '好き takes the liked thing with が.', 'suki'),
            order('l1-4', 'Build “I am a student.”', ['です', '私は', '学生'], ['私は', '学生', 'です'], 'Topic + identity + です.', 'topic-wa'),
            choice('l1-5', 'Which question asks whether Alex is a company employee?', '', ['アレックスさんは会社員ですか。', 'アレックスさんの会社です。', '会社員は何ですか。'], 'アレックスさんは会社員ですか。', 'Add か to the identification sentence.', 'questions'),
            text('l1-6', 'Complete the closing greeting.', 'どうぞよろしく＿＿＿。', 'お願いします', 'よろしくお願いします closes a first introduction.', 'introductions'),
            choice('l1-7', 'Which is read にほんじん?', '', ['日本人', '日本語', '学生'], '日本人', '人 is read じん in nationalities.', 'kanji-people'),
        ],
        reviewFrom: ['kana-on-ramp: greetings', 'kana-on-ramp: repair phrases'],
        finalTask: {
            title: 'Meet the class',
            prompt: 'Give a 20–30 second introduction: name, role or home, one interest, and a closing greeting.',
            success: ['は used for one topic', 'です used naturally', 'One が好きです sentence', 'A clear はじめまして / よろしくお願いします frame'],
            model: 'はじめまして。ヘンリーです。ロンドンに住んでいます。日本語とAIが好きです。どうぞよろしくお願いします。',
        },
    },
    {
        id: 'lesson-02-town-prices',
        routeNumber: 2,
        title: 'Finding things in town',
        japaneseTitle: 'まちでさがす',
        level: 'N5',
        minutes: 75,
        scene: 'A lunch errand around Tottenham Court Road',
        sceneImage: './art/environments/street/day-route-wide.webp',
        cast: ['Aakash', 'Sophie', 'Henry'],
        opening: [
            { speaker: 'Aakash', japanese: 'すみません、コンビニはどこですか。', meaning: 'Excuse me, where is the convenience store?' },
            { speaker: 'Sophie', japanese: 'あそこです。銀行のとなりです。', meaning: 'It is over there, next to the bank.' },
            { speaker: 'Henry', japanese: 'このおにぎりはいくらですか。', meaning: 'How much is this rice ball?' },
        ],
        objectives: ['Point to things near you, near the listener, and far from both.', 'Ask where a place is and understand a landmark answer.', 'Ask and understand a price.', 'Follow left, right, above, below, inside, and next-to clues.'],
        mapping: { ucl: 'Level 1 Lesson 2', genki: 'Lesson 2', minna: 'Lessons 3–4', jlpt: 'N5 places and prices' },
        vocabulary: [
            vocab('ここ', 'ここ', 'here', 'トイレはここです。', 'The toilet is here.'),
            vocab('そこ', 'そこ', 'there, near you', 'かばんはそこです。', 'The bag is there.'),
            vocab('あそこ', 'あそこ', 'over there', '駅はあそこです。', 'The station is over there.'),
            vocab('どこ', 'どこ', 'where', '図書館はどこですか。', 'Where is the library?'),
            vocab('これ', 'これ', 'this one', 'これはいくらですか。', 'How much is this?'),
            vocab('それ', 'それ', 'that one', 'それは私の本です。', 'That is my book.'),
            vocab('いくら', 'いくら', 'how much', 'コーヒーはいくらですか。', 'How much is the coffee?'),
            vocab('駅', 'えき', 'station', '駅の前で会いましょう。', 'Let us meet in front of the station.'),
            vocab('店', 'みせ', 'shop', 'あの店は安いです。', 'That shop is cheap.'),
            vocab('となり', 'となり', 'next to', 'カフェは本屋のとなりです。', 'The cafe is next to the bookshop.'),
            vocab('右', 'みぎ', 'right', '右に曲がってください。', 'Please turn right.'),
            vocab('左', 'ひだり', 'left', '左に銀行があります。', 'There is a bank on the left.'),
            vocab('中', 'なか', 'inside', 'かばんの中にあります。', 'It is inside the bag.'),
            vocab('前', 'まえ', 'front / before', '駅の前です。', 'It is in front of the station.'),
        ],
        grammar: [
            grammar('ここ・そこ・あそこ・どこ', 'here / there / over there / where', 'These words name places directly. Choose by distance from speaker and listener.', [
                { japanese: '受付はここです。', meaning: 'Reception is here.' },
                { japanese: 'ATMはどこですか。', meaning: 'Where is the ATM?' },
            ], 'Use どこ for an unknown place; use どれ for an unknown item among choices.'),
            grammar('N は place です', 'N is at place', 'Set the item or destination as the topic, then give its location.', [
                { japanese: 'カフェは駅のとなりです。', meaning: 'The cafe is next to the station.' },
                { japanese: '教室は二階です。', meaning: 'The classroom is on the second floor.' },
            ], 'の links the landmark and position: 駅のとなり.'),
            grammar('N は いくらですか', 'How much is N?', 'Use this fixed question for prices. The answer normally uses 円です.', [
                { japanese: 'この本はいくらですか。', meaning: 'How much is this book?' },
                { japanese: '六百円です。', meaning: 'It is 600 yen.' },
            ], 'いくら asks price; いくつ asks number or age in some contexts.'),
        ],
        kanji: [
            { character: '上', reading: 'うえ', word: '机の上', meaning: 'above' },
            { character: '下', reading: 'した', word: 'いすの下', meaning: 'below' },
            { character: '中', reading: 'なか', word: 'かばんの中', meaning: 'inside' },
            { character: '右', reading: 'みぎ', word: '右側', meaning: 'right' },
            { character: '左', reading: 'ひだり', word: '左側', meaning: 'left' },
            { character: '円', reading: 'えん', word: '五百円', meaning: 'yen / circle' },
        ],
        practice: [
            choice('l2-1', 'You are holding the item. Choose “this one.”', '', ['これ', 'それ', 'あれ'], 'これ', 'これ is close to the speaker.', 'demonstratives'),
            choice('l2-2', 'Complete the location question.', '図書館は＿ですか。', ['どこ', 'いくら', 'だれ'], 'どこ', 'どこ asks for a place.', 'location'),
            text('l2-3', 'Complete the price question.', 'この本は＿＿＿ですか。', 'いくら', 'いくらですか asks the price.', 'prices'),
            order('l2-4', 'Build “The cafe is next to the station.”', ['駅のとなり', 'です', 'カフェは'], ['カフェは', '駅のとなり', 'です'], 'Topic + linked location + です.', 'location'),
            choice('l2-5', 'Where is something described by かばんの中?', '', ['inside the bag', 'under the bag', 'beside the bag'], 'inside the bag', '中 means inside.', 'position-kanji'),
            choice('l2-6', 'Choose the natural price answer.', 'これはいくらですか。', ['八百円です', '駅の前です', 'これですか'], '八百円です', 'A price answer uses a number + 円.', 'prices'),
            text('l2-7', 'Complete “Turn right, please.”', '＿に曲がってください。', '右', '右 is みぎ, right.', 'directions'),
        ],
        reviewFrom: ['Lesson 1: X は Y です', 'Lesson 1: questions with か'],
        finalTask: {
            title: 'Find lunch before class',
            prompt: 'Read a tiny map, ask where the shop is, follow two position clues, then buy one item by asking the price.',
            success: ['One どこ question', 'One landmark + の + position', 'One いくら question', 'Correct use of これ/それ'],
            model: 'すみません、コンビニはどこですか。駅の左ですか。ありがとうございます。このおにぎりはいくらですか。',
        },
    },
    {
        id: 'lesson-03-food-invitations',
        routeNumber: 3,
        title: 'Food and invitations',
        japaneseTitle: 'いっしょに食べませんか',
        level: 'N5',
        minutes: 80,
        scene: 'Ramen before the evening class',
        sceneImage: './art/environments/ramen/evening-steam-wide.webp',
        cast: ['Shin', 'Sam', 'Francis'],
        opening: [
            { speaker: 'Shin', japanese: '授業の前に、ラーメンを食べませんか。', meaning: 'Would you like to eat ramen before class?' },
            { speaker: 'Sam', japanese: 'いいですね。六時半に店で会いましょう。', meaning: 'Sounds good. Let us meet at the shop at 6:30.' },
            { speaker: 'Francis', japanese: 'すみません。今日はお茶だけ飲みます。', meaning: 'Sorry. Today I will only drink tea.' },
        ],
        objectives: ['Invite someone with ませんか and respond naturally.', 'Use を for an object, で for an action place, and に for time/destination.', 'Read a short menu and identify a practical choice.', 'Connect 食, 飲, 肉, 料, 理, and 野 to useful food words.'],
        mapping: { ucl: 'Level 1+ food sequence', genki: 'Lessons 3–6', minna: 'Lessons 5–10', jlpt: 'N5 actions and invitations' },
        vocabulary: [
            vocab('食べます', 'たべます', 'eat', 'ラーメンを食べます。', 'I eat ramen.'),
            vocab('飲みます', 'のみます', 'drink', 'お茶を飲みます。', 'I drink tea.'),
            vocab('行きます', 'いきます', 'go', '店に行きます。', 'I go to the shop.'),
            vocab('会います', 'あいます', 'meet', '駅で友だちに会います。', 'I meet a friend at the station.'),
            vocab('ラーメン', 'ラーメン', 'ramen', '味噌ラーメンが好きです。', 'I like miso ramen.'),
            vocab('野菜', 'やさい', 'vegetables', '野菜をたくさん食べます。', 'I eat lots of vegetables.'),
            vocab('肉料理', 'にくりょうり', 'meat dish', '肉料理はありますか。', 'Do you have a meat dish?'),
            vocab('お茶', 'おちゃ', 'tea', '温かいお茶をください。', 'Hot tea, please.'),
            vocab('いっしょに', 'いっしょに', 'together', 'いっしょに行きませんか。', 'Would you like to go together?'),
            vocab('前に', 'まえに', 'before', '授業の前に食べます。', 'I eat before class.'),
            vocab('あとで', 'あとで', 'later', 'あとで連絡します。', 'I will contact you later.'),
            vocab('いいですね', 'いいですね', 'sounds good', '六時ですか。いいですね。', 'Six o’clock? Sounds good.'),
            vocab('ちょっと…', 'ちょっと', 'that is a little difficult...', '今日はちょっと…。', 'Today is a little difficult...'),
            vocab('半', 'はん', 'half / half past', '六時半に会いましょう。', 'Let us meet at 6:30.'),
        ],
        grammar: [
            grammar('N を V', 'do V to N', 'を marks the direct object of an action.', [
                { japanese: 'お好み焼きを食べます。', meaning: 'I eat okonomiyaki.' },
                { japanese: 'コーヒーを飲みます。', meaning: 'I drink coffee.' },
            ], 'Pronounce the particle を as お.'),
            grammar('place で V / time に V', 'do an action at a place / at a time', 'で marks where an action happens. に marks a specific time or destination.', [
                { japanese: '店で食べます。', meaning: 'We eat at the shop.' },
                { japanese: '六時半に会います。', meaning: 'We meet at 6:30.' },
            ], 'Use で for action location; use に for destination with 行きます.'),
            grammar('Vませんか / Vましょう', 'Would you like to ...? / Let us ...', 'ませんか is a gentle invitation. ましょう accepts or proposes a shared action.', [
                { japanese: 'ラーメンを食べませんか。', meaning: 'Would you like to eat ramen?' },
                { japanese: 'はい、食べましょう。', meaning: 'Yes, let us eat.' },
            ], 'A soft decline such as 今日はちょっと… is often more natural than a blunt いいえ.'),
        ],
        kanji: [
            { character: '食', reading: 'しょく／た', word: '食べます', meaning: 'eat / food' },
            { character: '飲', reading: 'の', word: '飲みます', meaning: 'drink' },
            { character: '肉', reading: 'にく', word: '肉料理', meaning: 'meat' },
            { character: '料', reading: 'りょう', word: '料理', meaning: 'materials / fee' },
            { character: '理', reading: 'り', word: '料理', meaning: 'reason / manage' },
            { character: '野', reading: 'や', word: '野菜', meaning: 'field' },
        ],
        practice: [
            choice('l3-1', 'Choose the object particle.', 'ラーメン＿食べます。', ['を', 'で', 'に'], 'を', 'ラーメン is what is eaten.', 'particle-wo'),
            choice('l3-2', 'Choose the action-place particle.', '店＿食べます。', ['を', 'で', 'に'], 'で', 'The eating happens at the shop.', 'particle-de'),
            choice('l3-3', 'Choose the time particle.', '六時半＿会います。', ['を', 'で', 'に'], 'に', 'A specific meeting time takes に.', 'particle-ni'),
            text('l3-4', 'Complete the invitation.', 'いっしょに食べ＿＿＿。', 'ませんか', 'ませんか makes a polite invitation.', 'invitation'),
            choice('l3-5', 'Choose the warm acceptance.', 'ラーメンを食べませんか。', ['いいですね。食べましょう。', 'ラーメンを食べません。', 'どこですか。'], 'いいですね。食べましょう。', 'Acknowledge the idea, then accept with ましょう.', 'invitation'),
            order('l3-6', 'Build “Let us meet at the shop at 6:30.”', ['会いましょう', '六時半に', '店で'], ['六時半に', '店で', '会いましょう'], 'Time + place + action is a clear neutral order.', 'planning'),
            choice('l3-7', 'Which word means vegetables?', '', ['野菜', '料理', '半分'], '野菜', '野 is field and 菜 is greens.', 'food-kanji'),
            text('l3-8', 'Complete the gentle decline.', 'すみません。今日は＿＿＿…。', 'ちょっと', 'ちょっと leaves the difficulty understood and sounds less abrupt.', 'invitation'),
        ],
        reviewFrom: ['Lesson 1: が好きです', 'Lesson 2: time and place words'],
        finalTask: {
            title: 'Arrange ramen before class',
            prompt: 'Invite a classmate, agree on what to eat, then settle a time and place. Include a graceful alternative if they cannot come.',
            success: ['One ませんか invitation', 'A natural acceptance or soft decline', 'Correct で and に', 'A specific time and place'],
            model: '授業の前にラーメンを食べませんか。いいですね。六時半に駅の近くの店で会いましょう。今日はだめなら、来週行きましょう。',
        },
    },
    {
        id: 'lesson-04-routines-past-te',
        routeNumber: 4,
        title: 'Yesterday, today, and the て-form',
        japaneseTitle: 'きのう何をしましたか',
        level: 'N5',
        minutes: 90,
        scene: 'Monday morning messages after a busy weekend',
        sceneImage: './art/environments/home/morning-desk-wide.webp',
        cast: ['Jenny', 'Christian', 'Henry'],
        opening: [
            { speaker: 'Jenny', japanese: '土曜日に友だちと会って、カフェで編み物をしました。', meaning: 'On Saturday I met a friend and knitted at a cafe.' },
            { speaker: 'Christian', japanese: '私はジムに行きました。それから、日本語を勉強しました。', meaning: 'I went to the gym. Then I studied Japanese.' },
            { speaker: 'Henry', japanese: '宿題をしませんでした。でも、動画を見ました。', meaning: 'I did not do the homework. But I watched a video.' },
        ],
        objectives: ['Describe one past event in positive and negative polite forms.', 'Join two actions with the て-form.', 'Read a short diary and reconstruct event order.', 'Use time words without adding に where it is not needed.'],
        mapping: { ucl: 'Level 1+ consolidation', genki: 'Lessons 7–12', minna: 'Lessons 11–20', jlpt: 'N5 secure' },
        vocabulary: [
            vocab('きのう', 'きのう', 'yesterday', 'きのう映画を見ました。', 'I watched a film yesterday.'),
            vocab('今日', 'きょう', 'today', '今日は仕事があります。', 'I have work today.'),
            vocab('明日', 'あした', 'tomorrow', '明日勉強します。', 'I will study tomorrow.'),
            vocab('起きます', 'おきます', 'wake up', '七時に起きました。', 'I woke up at seven.'),
            vocab('帰ります', 'かえります', 'return home', '十時に帰りました。', 'I returned home at ten.'),
            vocab('見ます', 'みます', 'see / watch', '動画を見ました。', 'I watched a video.'),
            vocab('読みます', 'よみます', 'read', '漫画を読みました。', 'I read manga.'),
            vocab('書きます', 'かきます', 'write', '日記を書きました。', 'I wrote a diary.'),
            vocab('話します', 'はなします', 'speak', '友だちと話しました。', 'I spoke with a friend.'),
            vocab('勉強します', 'べんきょうします', 'study', '日本語を勉強しています。', 'I am studying Japanese.'),
            vocab('それから', 'それから', 'after that', '食べました。それから、帰りました。', 'I ate. After that, I went home.'),
            vocab('でも', 'でも', 'but', '忙しかったです。でも、楽しかったです。', 'I was busy. But it was fun.'),
            vocab('忙しい', 'いそがしい', 'busy', '先週は忙しかったです。', 'Last week was busy.'),
            vocab('楽しい', 'たのしい', 'fun', 'パーティーは楽しかったです。', 'The party was fun.'),
        ],
        grammar: [
            grammar('Vました / Vませんでした', 'did / did not do', 'Replace ます with ました for polite past, and ません with ませんでした for polite past negative.', [
                { japanese: '本を読みました。', meaning: 'I read a book.' },
                { japanese: '宿題をしませんでした。', meaning: 'I did not do the homework.' },
            ], 'Time meaning comes from the ending; do not keep ます with a past time.'),
            grammar('Vて、V', 'do V and then V', 'The て-form links actions by the same subject. It often implies sequence but can simply list connected actions.', [
                { japanese: '起きて、コーヒーを飲みました。', meaning: 'I woke up and drank coffee.' },
                { japanese: '友だちに会って、映画を見ました。', meaning: 'I met a friend and watched a film.' },
            ], 'The final verb carries tense for the whole chain.'),
            grammar('い-adjective past: 〜かったです', 'was ...', 'Remove final い and add かったです. The negative past is くなかったです.', [
                { japanese: '楽しかったです。', meaning: 'It was fun.' },
                { japanese: '高くなかったです。', meaning: 'It was not expensive.' },
            ], 'Do not say 楽しいでした.'),
        ],
        kanji: [
            { character: '今', reading: 'いま／こん', word: '今日', meaning: 'now' },
            { character: '来', reading: 'く／らい', word: '来週', meaning: 'come' },
            { character: '帰', reading: 'かえ', word: '帰ります', meaning: 'return' },
            { character: '会', reading: 'あ', word: '会います', meaning: 'meet' },
            { character: '読', reading: 'よ', word: '読みます', meaning: 'read' },
            { character: '書', reading: 'か', word: '書きます', meaning: 'write' },
            { character: '話', reading: 'はな', word: '話します', meaning: 'speak' },
        ],
        practice: [
            choice('l4-1', 'Choose the polite past form.', 'きのう漫画を＿。', ['読みました', '読みます', '読みません'], '読みました', 'きのう calls for past here.', 'polite-past'),
            choice('l4-2', 'Choose the past negative.', '宿題を＿。', ['しませんでした', 'しません', 'しました'], 'しませんでした', 'ませんでした is polite past negative.', 'polite-past'),
            text('l4-3', 'Make 行きます into the linking form.', 'ジムに＿＿、運動しました。', '行って', '行く has the irregular て-form 行って.', 'te-form'),
            order('l4-4', 'Put the weekend events in order.', ['お茶を飲みました', '友だちに会って', 'カフェに行って'], ['友だちに会って', 'カフェに行って', 'お茶を飲みました'], 'Linked actions use て; only the last verb carries past tense.', 'te-form'),
            choice('l4-5', 'Choose the correct past adjective.', 'パーティーは＿。', ['楽しかったです', '楽しいでした', '楽しいですでした'], '楽しかったです', 'Drop い and add かったです.', 'adjective-past'),
            choice('l4-6', 'Which time word normally needs no に?', '', ['きのう', '七時', '月曜日'], 'きのう', 'Relative times such as today, yesterday, and tomorrow normally omit に.', 'time'),
            text('l4-7', 'Complete the sequence connector.', '映画を見ました。＿＿＿、家に帰りました。', 'それから', 'それから means “after that.”', 'sequence'),
            choice('l4-8', 'Which line means “I wrote a diary”?', '', ['日記を書きました。', '日記を読みました。', '日記を話しました。'], '日記を書きました。', '書 is writing.', 'literacy-verbs'),
        ],
        reviewFrom: ['Lesson 2: time phrases', 'Lesson 3: action particles', 'Lesson 3: meeting plans'],
        finalTask: {
            title: 'Weekend voice note',
            prompt: 'Tell a classmate about Saturday in four connected sentences, including one thing you did not do and one reaction.',
            success: ['Two correct past verbs', 'One ませんでした', 'One て-form link', 'One past adjective'],
            model: '土曜日に九時に起きて、友だちとカフェに行きました。宿題はしませんでした。ちょっと忙しかったですが、楽しかったです。',
        },
    },
    {
        id: 'lesson-05-n4-bridge',
        routeNumber: 5,
        title: 'Advice, reasons, and what is possible',
        japaneseTitle: 'できること・したほうがいいこと',
        level: 'N4',
        minutes: 95,
        scene: 'The library table before a difficult week',
        sceneImage: './art/environments/library/rain-evening-wide.webp',
        cast: ['Sophie', 'Robert', 'Mika'],
        opening: [
            { speaker: 'Mika', japanese: '漢字が多くて、全部覚えられません。', meaning: 'There are many kanji, and I cannot remember all of them.' },
            { speaker: 'Sophie', japanese: '毎日少しずつ復習したほうがいいですよ。', meaning: 'It is better to review a little every day.' },
            { speaker: 'Robert', japanese: 'このアプリなら、電車でも練習できます。', meaning: 'With this app, you can practise even on the train.' },
        ],
        objectives: ['Say what you can and cannot do.', 'Give supportive advice with ほうがいい.', 'Explain a reason with から.', 'Distinguish obligation from permission and lack of necessity.'],
        mapping: { ucl: 'Level 2+ bridge', genki: 'Lessons 13–18', minna: 'Lessons 21–27', jlpt: 'N4 emerging' },
        vocabulary: [
            vocab('復習します', 'ふくしゅうします', 'review', '毎晩ことばを復習します。', 'I review vocabulary every evening.'),
            vocab('練習します', 'れんしゅうします', 'practise', '電車で聞く練習をします。', 'I practise listening on the train.'),
            vocab('覚えます', 'おぼえます', 'memorise', '例文で漢字を覚えます。', 'I memorise kanji through example sentences.'),
            vocab('忘れます', 'わすれます', 'forget', '宿題を忘れました。', 'I forgot the homework.'),
            vocab('できます', 'できます', 'can do', '日本語で注文できます。', 'I can order in Japanese.'),
            vocab('必要', 'ひつよう', 'necessary', '予約が必要です。', 'A booking is necessary.'),
            vocab('大丈夫', 'だいじょうぶ', 'all right', '辞書を見ても大丈夫です。', 'It is all right to look at a dictionary.'),
            vocab('少しずつ', 'すこしずつ', 'little by little', '少しずつ上手になります。', 'You improve little by little.'),
            vocab('毎日', 'まいにち', 'every day', '毎日十分勉強します。', 'I study ten minutes every day.'),
            vocab('理由', 'りゆう', 'reason', '理由を二つ書いてください。', 'Please write two reasons.'),
            vocab('予約', 'よやく', 'reservation', 'レストランを予約しました。', 'I booked the restaurant.'),
            vocab('辞書', 'じしょ', 'dictionary', '辞書で調べます。', 'I look it up in a dictionary.'),
            vocab('自信', 'じしん', 'confidence', '話す自信がありません。', 'I do not have confidence speaking.'),
            vocab('間違い', 'まちがい', 'mistake', '間違いから学びます。', 'I learn from mistakes.'),
        ],
        grammar: [
            grammar('potential form / ことができます', 'can do', 'Use a potential verb or dictionary form + ことができます to express ability or possibility.', [
                { japanese: 'ひらがなが読めます。', meaning: 'I can read hiragana.' },
                { japanese: '日本語で予約することができます。', meaning: 'It is possible to book in Japanese.' },
            ], 'Potential verbs usually mark the thing possible with が, though を also appears in modern usage.'),
            grammar('Vた / Vない + ほうがいい', 'it is better to do / not do', 'Use past plain form before ほうがいい for positive advice, and plain negative for advice not to do something.', [
                { japanese: '早く寝たほうがいいです。', meaning: 'You should go to bed early.' },
                { japanese: '一度に全部覚えないほうがいいです。', meaning: 'It is better not to memorise everything at once.' },
            ], 'This can sound strong. Add よ or と思います when you want a softer supportive tone.'),
            grammar('plain sentence + から', 'because ...', 'Put the reason before から. A request or conclusion often follows.', [
                { japanese: '明日テストがありますから、今晩復習します。', meaning: 'Because there is a test tomorrow, I will review tonight.' },
                { japanese: '雨ですから、傘を持っていったほうがいいです。', meaning: 'Because it is raining, you should take an umbrella.' },
            ], 'から explains your basis; avoid stacking it after です unnecessarily in casual plain speech.'),
            grammar('Vなければなりません / Vなくてもいい', 'must do / do not have to do', 'These forms contrast obligation with permission to omit an action.', [
                { japanese: '宿題を出さなければなりません。', meaning: 'I must submit the homework.' },
                { japanese: '全部書かなくてもいいです。', meaning: 'You do not have to write everything.' },
            ], 'なくてもいい means “it is okay not to,” not “must not.”'),
        ],
        kanji: [
            { character: '勉', reading: 'べん', word: '勉強', meaning: 'exertion' },
            { character: '強', reading: 'きょう', word: '勉強', meaning: 'strong' },
            { character: '習', reading: 'しゅう', word: '復習', meaning: 'learn' },
            { character: '必', reading: 'ひつ', word: '必要', meaning: 'certain / must' },
            { character: '要', reading: 'よう', word: '必要', meaning: 'need' },
            { character: '忘', reading: 'わす', word: '忘れます', meaning: 'forget' },
        ],
        practice: [
            choice('l5-1', 'Choose the potential sentence.', 'I can read this kanji.', ['この漢字が読めます。', 'この漢字を読みました。', 'この漢字が読みたいです。'], 'この漢字が読めます。', '読めます is the potential form of 読みます.', 'potential'),
            choice('l5-2', 'Choose supportive positive advice.', '毎日少しずつ＿ほうがいいです。', ['復習した', '復習する', '復習して'], '復習した', 'Positive advice takes plain past + ほうがいい.', 'advice'),
            text('l5-3', 'Complete the negative advice.', '一度に全部覚え＿＿＿ほうがいいです。', 'ない', 'Plain negative + ほうがいい advises against the action.', 'advice'),
            order('l5-4', 'Build a reason and decision.', ['復習します', '明日テストがありますから', '今晩'], ['明日テストがありますから', '今晩', '復習します'], 'Reason + から comes before the decision.', 'reasons'),
            choice('l5-5', 'Which means “You do not have to write everything”?', '', ['全部書かなくてもいいです。', '全部書かなければなりません。', '全部書いてはいけません。'], '全部書かなくてもいいです。', 'なくてもいい removes obligation.', 'obligation'),
            choice('l5-6', 'Choose the best advice for someone overwhelmed by 50 cards.', '', ['十枚ずつ勉強したほうがいいです。', '全部忘れたほうがいいです。', '勉強しなくても読みます。'], '十枚ずつ勉強したほうがいいです。', 'Small batches are concrete and the grammar is correct.', 'advice'),
            text('l5-7', 'Complete the ability sentence.', '日本語で注文することが＿＿＿。', 'できます', 'Dictionary form + ことができます expresses ability.', 'potential'),
            choice('l5-8', 'Which form expresses obligation?', '', ['行かなければなりません', '行かなくてもいいです', '行かないほうがいいです'], '行かなければなりません', 'なければなりません means must.', 'obligation'),
        ],
        reviewFrom: ['Lesson 4: plain and polite past awareness', 'Lesson 4: linked reasons and sequence', 'Lesson 3: invitations'],
        finalTask: {
            title: 'Help a classmate make a study plan',
            prompt: 'Respond to a learner who is overwhelmed. Say what they can do, give two pieces of advice, and explain one reason.',
            success: ['One potential form', 'One positive ほうがいい', 'One negative ほうがいい', 'One reason with から'],
            model: '全部覚えなくてもいいです。毎日十枚ずつ復習したほうがいいです。寝る前に長く勉強しないほうがいいです。短い練習なら続けられますから。',
        },
    },
    {
        id: 'lesson-06-parallel-reasons',
        routeNumber: 6,
        title: 'Doing two things and giving reasons',
        japaneseTitle: '〜ながら・〜し',
        level: 'N4',
        minutes: 90,
        scene: 'A conversation on the way to class',
        sceneImage: './art/environments/station/day-commute-wide.webp',
        cast: ['Aakash', 'Alex', 'Xingyu'],
        opening: [
            { speaker: 'Aakash', japanese: 'シティポップを聞きながら、古い車の写真を見ています。', meaning: 'I look at photos of classic cars while listening to city pop.' },
            { speaker: 'Alex', japanese: 'この仕事は日本語を使うし、日本の会社と話すし、おもしろいです。', meaning: 'This job is interesting because I use Japanese and speak with Japanese companies.' },
            { speaker: 'Xingyu', japanese: 'ミクも好きだし、歌も覚えやすいし、日本語の練習になります。', meaning: 'I like Miku, the songs are easy to remember, and it becomes Japanese practice.' },
        ],
        objectives: ['Describe simultaneous actions with ながら.', 'Distinguish an action happening now from a habitual ている state.', 'Give more than one reason with し.', 'Listen for which reason carries the speaker’s real decision.'],
        mapping: { ucl: 'Current course Lessons 1–2', genki: 'Lessons 19–20 review', minna: 'Lesson 28', jlpt: 'N4 grammar connections' },
        vocabulary: [
            vocab('働きます', 'はたらきます', 'work', '会社で働いています。', 'I work at a company.'),
            vocab('通います', 'かよいます', 'commute / attend regularly', '毎週日本語学校に通っています。', 'I attend Japanese school every week.'),
            vocab('運転します', 'うんてんします', 'drive', '音楽を聞きながら運転します。', 'I drive while listening to music.'),
            vocab('育てます', 'そだてます', 'raise / grow', '家で野菜を育てています。', 'I grow vegetables at home.'),
            vocab('選びます', 'えらびます', 'choose', '安いし、近いし、この店を選びます。', 'It is cheap and close, so I choose this shop.'),
            vocab('経験', 'けいけん', 'experience', '日本で働いた経験があります。', 'I have experience working in Japan.'),
            vocab('便利', 'べんり', 'convenient', 'この駅は便利です。', 'This station is convenient.'),
            vocab('近い', 'ちかい', 'near', '大学から近いです。', 'It is close to the university.'),
            vocab('遠い', 'とおい', 'far', '家から少し遠いです。', 'It is a little far from home.'),
            vocab('静か', 'しずか', 'quiet', '図書館は静かです。', 'The library is quiet.'),
            vocab('それに', 'それに', 'besides / moreover', '安いです。それに、おいしいです。', 'It is cheap. Besides, it is delicious.'),
            vocab('理由', 'りゆう', 'reason', '理由を二つ言います。', 'I give two reasons.'),
            vocab('普段', 'ふだん', 'usually', '普段は電車で通っています。', 'I usually commute by train.'),
            vocab('最近', 'さいきん', 'recently', '最近、毎日歩いています。', 'Recently, I walk every day.'),
        ],
        grammar: [
            grammar('Vます-stem + ながら', 'while doing V', 'The verb before ながら is the background action. The final verb is usually the main action and controls the tense.', [
                { japanese: '音楽を聞きながら勉強します。', meaning: 'I study while listening to music.' },
                { japanese: '歩きながら話しました。', meaning: 'We talked while walking.' },
            ], 'Both actions normally have the same subject.'),
            grammar('Vています: now vs habit', 'is doing / does regularly', 'Context tells whether ています describes an action in progress or a repeated habit.', [
                { japanese: '今、電車を待っています。', meaning: 'I am waiting for the train now.' },
                { japanese: '毎週テニスをしています。', meaning: 'I play tennis every week.' },
            ], 'Look for time words such as 今 or 毎週 before deciding the meaning.'),
            grammar('plain + し、plain + し', 'and / because ... and ...', 'し lists parallel facts, often reasons. The final clause gives the conclusion or leaves it understood.', [
                { japanese: '安いし、近いし、この店がいいです。', meaning: 'It is cheap and close, so this shop is good.' },
                { japanese: '雨だし、疲れたし、今日は帰ります。', meaning: 'It is raining and I am tired, so I will go home today.' },
            ], 'Use だし after nouns and な-adjectives in plain style: 学生だし、便利だし.'),
        ],
        kanji: [
            { character: '働', reading: 'はたら', word: '働きます', meaning: 'work' },
            { character: '通', reading: 'かよ／つう', word: '通います', meaning: 'pass / commute' },
            { character: '運', reading: 'うん', word: '運転', meaning: 'carry / fortune' },
            { character: '転', reading: 'てん', word: '運転', meaning: 'turn' },
            { character: '近', reading: 'ちか', word: '近い', meaning: 'near' },
            { character: '静', reading: 'しず', word: '静か', meaning: 'quiet' },
        ],
        practice: [
            text('l6-1', 'Complete “I study while listening to music.”', '音楽を聞き＿＿＿、勉強します。', 'ながら', 'Use the ます-stem 聞き + ながら.', 'nagara'),
            choice('l6-2', 'Choose the main action.', '歩きながら友だちと話しました。', ['talked with a friend', 'walked', 'arrived'], 'talked with a friend', 'The final verb is usually the foreground action.', 'nagara'),
            choice('l6-3', 'Is this now or habitual?', '毎週土曜日にテニスをしています。', ['habitual', 'happening only now', 'completed past'], 'habitual', '毎週 signals a repeated habit.', 'teiru-habit'),
            choice('l6-4', 'Choose the correct noun + し form.', '学生＿、時間もないし、安い店がいいです。', ['だし', 'し', 'でし'], 'だし', 'Nouns take だ before し in plain style.', 'shi-reasons'),
            order('l6-5', 'Build a two-reason recommendation.', ['このカフェがいいです', '静かだし', '駅から近いし'], ['静かだし', '駅から近いし', 'このカフェがいいです'], 'Two reasons lead to the conclusion.', 'shi-reasons'),
            choice('l6-6', 'Choose the sentence where both actions share one subject.', '', ['私は音楽を聞きながら歩きます。', '私は歩きながら、友だちは走ります。', '雨ながら歩きます。'], '私は音楽を聞きながら歩きます。', 'ながら normally links two actions by the same person.', 'nagara'),
            text('l6-7', 'Complete the habitual form.', '毎日、電車で会社に通っ＿＿＿。', 'ています', '通っています describes the regular commute.', 'teiru-habit'),
            choice('l6-8', 'Which conclusion best follows 安いし、おいしいし?', '', ['この店にしましょう。', '高くなかったですか。', '店を食べます。'], 'この店にしましょう。', 'The reasons support choosing the shop.', 'shi-reasons'),
        ],
        reviewFrom: ['Lesson 4: action sequencing', 'Lesson 5: reasons with から', 'Lesson 5: recommendations'],
        finalTask: {
            title: 'Recommend an after-class place',
            prompt: 'Choose between the library, cafe, pub, or ramen shop. Give two reasons, describe one usual activity there, and say what you can do at the same time.',
            success: ['One ながら sentence', 'One habitual ています', 'Two reasons with し', 'A clear choice'],
            model: '駅のカフェがいいです。近いし、遅くまで開いているし、便利です。普段そこで復習しています。お茶を飲みながら会話の練習もできます。',
        },
    },
    {
        id: 'lesson-07-states-completion',
        routeNumber: 7,
        title: 'What happened, and what state remains',
        japaneseTitle: '〜ています・〜てしまいました',
        level: 'N4',
        minutes: 95,
        scene: 'A small classroom mishap before everyone arrives',
        sceneImage: './art/environments/classroom/day-overcast-wide.webp',
        cast: ['Christian', 'Jenny', 'Rie-sensei'],
        opening: [
            { speaker: 'Christian', japanese: 'あっ、窓が開いています。机の紙も落ちてしまいました。', meaning: 'Oh, the window is open. The papers on the desk have fallen too.' },
            { speaker: 'Jenny', japanese: '録音機が壊れています。だれか使ってしまったんですか。', meaning: 'The recorder is broken. Did somebody end up using it?' },
            { speaker: 'Rie-sensei', japanese: '大丈夫です。写真を撮って、別の部屋を使いましょう。', meaning: 'It is all right. Let us take a photo and use another room.' },
        ],
        objectives: ['Describe a visible result with an intransitive verb + ています.', 'Use てしまう for completion, regret, or an unwanted result.', 'Choose between transitive and intransitive viewpoints.', 'Write a concise incident message with evidence and next action.'],
        mapping: { ucl: 'Current course Lessons 3–4', genki: 'Lessons 20–21 review', minna: 'Lesson 29', jlpt: 'N4 states and completion' },
        vocabulary: [
            vocab('開きます', 'あきます', 'open (intransitive)', 'ドアが開いています。', 'The door is open.'),
            vocab('閉まります', 'しまります', 'close (intransitive)', '窓が閉まっています。', 'The window is closed.'),
            vocab('壊れます', 'こわれます', 'break (intransitive)', '時計が壊れています。', 'The clock is broken.'),
            vocab('割れます', 'われます', 'shatter (intransitive)', 'コップが割れています。', 'The glass is shattered.'),
            vocab('落ちます', 'おちます', 'fall', '紙が床に落ちています。', 'Paper has fallen on the floor.'),
            vocab('なくします', 'なくします', 'lose', '鍵をなくしてしまいました。', 'I lost my key.'),
            vocab('汚れます', 'よごれます', 'become dirty', 'シャツが汚れています。', 'The shirt is dirty.'),
            vocab('直します', 'なおします', 'repair / correct', 'あとで機械を直します。', 'I will repair the machine later.'),
            vocab('片づけます', 'かたづけます', 'tidy up', '教室を片づけます。', 'I tidy the classroom.'),
            vocab('事故', 'じこ', 'accident', '小さい事故がありました。', 'There was a small accident.'),
            vocab('状態', 'じょうたい', 'state / condition', '今の状態を説明します。', 'I explain the current state.'),
            vocab('床', 'ゆか', 'floor', '本が床に落ちています。', 'A book has fallen on the floor.'),
            vocab('別の', 'べつの', 'another / different', '別の部屋を使います。', 'We use another room.'),
            vocab('すぐ', 'すぐ', 'immediately', 'すぐ先生に連絡します。', 'I contact the teacher immediately.'),
        ],
        grammar: [
            grammar('intransitive Vて + います', 'is in the resulting state', 'With change-of-state verbs, ています describes the visible state left by a completed change.', [
                { japanese: 'ドアが開いています。', meaning: 'The door is open.' },
                { japanese: '電気が消えています。', meaning: 'The light is off.' },
            ], 'This is not necessarily “is opening.” The lexical verb and context determine state vs action.'),
            grammar('Vてしまいます / Vてしまいました', 'finish completely / unfortunately did', 'てしまう can mark full completion. In a mishap context it also carries regret or “ended up doing.”', [
                { japanese: '宿題を全部してしまいました。', meaning: 'I finished all the homework.' },
                { japanese: '鍵をなくしてしまいました。', meaning: 'I unfortunately lost my key.' },
            ], 'Regret comes from context and tone; the grammar itself can simply mean completion.'),
            grammar('N が state / N を action', 'thing changes / person changes it', 'Intransitive sentences focus on the affected thing with が. Transitive sentences focus on an actor doing something to an object with を.', [
                { japanese: '窓が開きました。', meaning: 'The window opened.' },
                { japanese: 'クリスチャンさんが窓を開けました。', meaning: 'Christian opened the window.' },
            ], 'Learn common pairs together: 開く/開ける, 閉まる/閉める, 壊れる/壊す.'),
        ],
        kanji: [
            { character: '開', reading: 'あ／ひら', word: '開いています', meaning: 'open' },
            { character: '閉', reading: 'し', word: '閉まっています', meaning: 'close' },
            { character: '落', reading: 'お', word: '落ちます', meaning: 'fall' },
            { character: '直', reading: 'なお', word: '直します', meaning: 'fix / direct' },
            { character: '別', reading: 'べつ', word: '別の部屋', meaning: 'separate' },
            { character: '部', reading: 'ぶ', word: '部屋', meaning: 'section' },
            { character: '屋', reading: 'や', word: '部屋', meaning: 'roof / shop' },
        ],
        practice: [
            choice('l7-1', 'Describe the visible state: the door is open.', '', ['ドアが開いています。', 'ドアを開いています。', 'ドアが開けています。'], 'ドアが開いています。', 'Intransitive 開く focuses on the door’s state.', 'state-teiru'),
            choice('l7-2', 'Choose the regrettable result.', '鍵を＿。', ['なくしてしまいました', 'なくしていますか', 'なくしながら'], 'なくしてしまいました', 'てしまいました fits an unwanted completed event.', 'teshimau'),
            choice('l7-3', 'Choose the transitive sentence.', '', ['リエ先生が窓を閉めました。', '窓が閉まりました。', '窓が閉まっています。'], 'リエ先生が窓を閉めました。', 'An actor closes the object marked with を.', 'transitivity'),
            text('l7-4', 'Complete the state report.', '録音機が壊れ＿＿＿。', 'ています', '壊れています means it is in a broken state.', 'state-teiru'),
            order('l7-5', 'Build a useful incident message.', ['すぐ片づけます', '窓が開いていて', '紙が落ちてしまいました'], ['窓が開いていて', '紙が落ちてしまいました', 'すぐ片づけます'], 'State, result, then next action.', 'incident-report'),
            choice('l7-6', 'Which use of てしまう is neutral completion?', '', ['レポートを全部書いてしまいました。', '財布をなくしてしまいました。', '電車に遅れてしまいました。'], 'レポートを全部書いてしまいました。', 'Finishing all of a report can be plain completion.', 'teshimau'),
            text('l7-7', 'Complete the intransitive pair: 開ける →', '', '開く', '開ける is transitive; 開く is intransitive.', 'transitivity'),
            choice('l7-8', 'What should follow a clear incident description?', '', ['a practical next action', 'three unrelated adjectives', 'a new greeting'], 'a practical next action', 'A useful message helps the reader know what will happen next.', 'incident-report'),
        ],
        reviewFrom: ['Lesson 4: て-form links', 'Lesson 6: habitual ています', 'Lesson 5: advice and next actions'],
        finalTask: {
            title: 'Send the classroom incident message',
            prompt: 'Describe two visible states, say what unfortunately happened, and give one next action. Keep it to 3–4 sentences.',
            success: ['Two state ています forms', 'One てしまいました', 'Correct が/を viewpoint', 'One concrete next action'],
            model: '教室の窓が開いていて、紙が床に落ちています。録音機も壊れてしまいました。写真を撮って、すぐリエ先生に連絡します。',
        },
    },
    {
        id: 'lesson-08-preparation',
        routeNumber: 8,
        title: 'What is ready, and what to do in advance',
        japaneseTitle: '〜てあります・〜ておきます',
        level: 'N4',
        minutes: 100,
        scene: 'Preparing a class trip and the end-of-term table',
        sceneImage: './art/environments/station/blue-hour-rain-wide.webp',
        cast: ['Sam', 'Jodi', 'Rie-sensei'],
        opening: [
            { speaker: 'Jodi', japanese: '切符はもう買ってあります。ホテルも予約してあります。', meaning: 'The tickets have already been bought. The hotel has been booked too.' },
            { speaker: 'Sam', japanese: 'じゃあ、天気を調べておきます。雨なら、傘も用意しておきましょう。', meaning: 'Then I will check the weather in advance. If it rains, let us prepare umbrellas too.' },
            { speaker: 'Rie-sensei', japanese: '名簿はテーブルの上に置いてあります。', meaning: 'The name list has been placed on the table.' },
        ],
        objectives: ['Use てある to describe an intentional prepared state.', 'Use ておく for an action done in advance or left as it is.', 'Contrast ている, てある, and ておく from viewpoint and intention.', 'Build and follow a travel or event checklist.'],
        mapping: { ucl: 'Current course Lessons 5–6', genki: 'Lesson 21 review', minna: 'Lesson 30', jlpt: 'N4 preparation and states' },
        vocabulary: [
            vocab('準備します', 'じゅんびします', 'prepare', '旅行の準備をします。', 'I prepare for the trip.'),
            vocab('予約します', 'よやくします', 'reserve', 'ホテルを予約してあります。', 'The hotel has been reserved.'),
            vocab('用意します', 'よういします', 'get ready', '飲み物を用意しておきます。', 'I will prepare drinks in advance.'),
            vocab('調べます', 'しらべます', 'check / research', '電車の時間を調べておきます。', 'I will check the train times in advance.'),
            vocab('置きます', 'おきます', 'put / place', '地図が机に置いてあります。', 'A map has been placed on the desk.'),
            vocab('貼ります', 'はります', 'stick / post', '予定が壁に貼ってあります。', 'The schedule has been posted on the wall.'),
            vocab('並べます', 'ならべます', 'line up / arrange', 'いすが並べてあります。', 'The chairs have been arranged.'),
            vocab('切符', 'きっぷ', 'ticket', '切符を先に買っておきます。', 'I will buy the ticket in advance.'),
            vocab('名簿', 'めいぼ', 'name list', '名簿を確認してください。', 'Please check the name list.'),
            vocab('予定', 'よてい', 'plan / schedule', '予定を共有しておきます。', 'I will share the plan in advance.'),
            vocab('確認します', 'かくにんします', 'confirm', '時間をもう一度確認します。', 'I confirm the time once more.'),
            vocab('そのまま', 'そのまま', 'as it is', 'いすはそのままにしておいてください。', 'Please leave the chairs as they are.'),
            vocab('先に', 'さきに', 'in advance / first', '先に注文しておきます。', 'I will order in advance.'),
            vocab('間に合います', 'まにあいます', 'be in time', '七時の電車に間に合います。', 'I will be in time for the seven o’clock train.'),
        ],
        grammar: [
            grammar('transitive Vて + あります', 'has been intentionally done and remains', 'てある describes the present result of someone’s intentional preparation. The prepared object is commonly marked with が.', [
                { japanese: '地図が机に置いてあります。', meaning: 'A map has been placed on the desk.' },
                { japanese: 'ホテルが予約してあります。', meaning: 'The hotel has been booked.' },
            ], 'Use a transitive verb. てある highlights intention; ている can simply report a state.'),
            grammar('Vて + おきます', 'do in advance / leave as is', 'Use ておく for preparation before a future need. With そのまま it can mean leaving a state unchanged.', [
                { japanese: '切符を買っておきます。', meaning: 'I will buy the ticket in advance.' },
                { japanese: '窓を開けておいてください。', meaning: 'Please leave the window open.' },
            ], 'In speech, ておく often contracts to とく: 買っとく.'),
            grammar('ている / てある / ておく', 'state / prepared state / preparatory action', 'Choose by viewpoint: what state exists, whether it was intentionally arranged, or what action you will do before it is needed.', [
                { japanese: 'ドアが開いています。', meaning: 'The door is open.' },
                { japanese: 'ドアが開けてあります。', meaning: 'The door has been left open intentionally.' },
                { japanese: 'ドアを開けておきます。', meaning: 'I will open the door in advance / leave it open.' },
            ], 'The particles and verb transitivity change with the viewpoint.'),
        ],
        kanji: [
            { character: '準', reading: 'じゅん', word: '準備', meaning: 'standard / prepare' },
            { character: '備', reading: 'び', word: '準備', meaning: 'provide / equip' },
            { character: '予', reading: 'よ', word: '予定', meaning: 'beforehand' },
            { character: '定', reading: 'てい', word: '予定', meaning: 'decide' },
            { character: '置', reading: 'お', word: '置きます', meaning: 'place' },
            { character: '確', reading: 'かく', word: '確認', meaning: 'certain' },
            { character: '認', reading: 'にん', word: '確認', meaning: 'recognise' },
        ],
        practice: [
            choice('l8-1', 'Choose the prepared state.', 'ホテルが予約＿。', ['してあります', 'しています', 'しておきます'], 'してあります', 'The booking was intentionally completed and remains ready.', 'tearu'),
            choice('l8-2', 'Choose the action you will do in advance.', '電車の時間を調べ＿。', ['ておきます', 'てあります', 'ています'], 'ておきます', 'You will check before the information is needed.', 'teoku'),
            choice('l8-3', 'Choose the neutral visible state.', 'ドアが開い＿。', ['ています', 'てあります', 'ておきます'], 'ています', 'Intransitive 開く + ています reports the state.', 'state-contrast'),
            text('l8-4', 'Complete the intentional arrangement.', '地図が机に置い＿＿＿。', 'てあります', '置く is transitive; てあります highlights prepared placement.', 'tearu'),
            order('l8-5', 'Build a travel preparation.', ['用意しておきます', '雨が降るかもしれませんから', '傘を'], ['雨が降るかもしれませんから', '傘を', '用意しておきます'], 'Reason, object, preparatory action.', 'teoku'),
            choice('l8-6', 'What does そのままにしておいてください mean?', '', ['Please leave it as it is.', 'Please prepare it now.', 'It was accidentally left.'], 'Please leave it as it is.', 'ておく can preserve a state for later.', 'teoku'),
            choice('l8-7', 'Which verb type does てある normally use?', '', ['transitive', 'intransitive only', 'copula only'], 'transitive', 'The form implies someone intentionally arranged the object.', 'transitivity'),
            text('l8-8', 'Complete “The chairs have been arranged.”', 'いすが並べ＿＿＿。', 'てあります', '並べる is transitive and the arrangement remains.', 'tearu'),
        ],
        reviewFrom: ['Lesson 7: result states and transitivity', 'Lesson 5: reasons', 'Lesson 3: time and place planning'],
        finalTask: {
            title: 'Prepare the class trip',
            prompt: 'Inspect what is already ready, choose three actions to do in advance, and leave one clear instruction for the group.',
            success: ['Two prepared states with てある', 'Two future preparations with ておく', 'One accurate state contrast', 'A usable instruction'],
            model: '切符とホテルは予約してあります。地図もグループに送ってあります。前日に天気を調べておきます。雨なら、傘を用意しておきましょう。名簿は机の上に置いておいてください。',
        },
    },
    {
        id: 'lesson-09-shared-plans',
        routeNumber: 9,
        title: 'A plan everyone can follow',
        japaneseTitle: 'みんなが分かる予定',
        level: 'N4+',
        minutes: 75,
        scene: 'Sunday plans change when the rain starts',
        sceneImage: './art/key-scenes/lesson-09-rain-cafe-v1.jpg',
        cast: ['Rie-sensei', 'Sam', 'Mika'],
        opening: [
            { speaker: 'Sam', japanese: '日曜日、雨なら駅のカフェで会いませんか。', meaning: 'On Sunday, if it rains, shall we meet at the station cafe?' },
            { speaker: 'Mika', japanese: 'いいですね。迷わないように、地図を送ってもらえますか。', meaning: 'Sounds good. Could you send a map so I do not get lost?' },
            { speaker: 'Rie-sensei', japanese: '食べられないものはありませんか。先に聞いておきましょう。', meaning: 'Is there anything anyone cannot eat? Let us ask in advance.' },
        ],
        objectives: ['Respond to a condition with なら.', 'Ask a considerate negative question with ありませんか.', 'Express an enabling or preventative purpose with ように / ないように.', 'Write and say one complete shared plan with a fallback.'],
        mapping: { ucl: 'Level 3+ Lesson 9', genki: 'Lessons 22–23', minna: 'Lessons 35–36', jlpt: 'N4 secure / N3 on-ramp' },
        vocabulary: [
            vocab('予定', 'よてい', 'plan / schedule', '日曜日の予定を決めます。', 'We decide Sunday’s plan.'),
            vocab('変更', 'へんこう', 'change', '雨なら、場所を変更します。', 'If it rains, we change the place.'),
            vocab('場合', 'ばあい', 'case / situation', '雨の場合はカフェで会います。', 'In case of rain, we meet at the cafe.'),
            vocab('迷います', 'まよいます', 'get lost / hesitate', '駅で迷わないように地図を見ます。', 'I look at a map so I do not get lost at the station.'),
            vocab('間に合います', 'まにあいます', 'be in time', '電車に間に合うように早く出ます。', 'I leave early so I can catch the train.'),
            vocab('連絡します', 'れんらくします', 'contact', '遅れる場合は連絡してください。', 'Please contact us if you will be late.'),
            vocab('地図', 'ちず', 'map', 'グループに地図を送ります。', 'I send the map to the group.'),
            vocab('案内', 'あんない', 'guidance / information', '駅からの案内を書きます。', 'I write directions from the station.'),
            vocab('苦手', 'にがて', 'not good with / dislike', '辛い料理が苦手です。', 'I am not good with spicy food.'),
            vocab('食べられません', 'たべられません', 'cannot eat', '肉は食べられません。', 'I cannot eat meat.'),
            vocab('念のため', 'ねんのため', 'just in case', '念のため、傘を持っていきます。', 'I will take an umbrella just in case.'),
            vocab('集合', 'しゅうごう', 'meeting / assembly', '集合時間は十時です。', 'The meeting time is ten.'),
            vocab('参加します', 'さんかします', 'participate', '三人が参加します。', 'Three people will participate.'),
            vocab('全員', 'ぜんいん', 'everyone', '全員が分かるように書きます。', 'I write so everyone can understand.'),
        ],
        grammar: [
            grammar('N / plain + なら', 'if that is the case / as for', 'なら takes information already raised and responds to that condition with a relevant suggestion or judgement.', [
                { japanese: '雨なら、駅のカフェに変えませんか。', meaning: 'If it rains, shall we change to the station cafe?' },
                { japanese: '日曜日なら、参加できます。', meaning: 'If it is Sunday, I can participate.' },
            ], 'なら is responsive. It does not always mean the same timeline as と, たら, or ば.'),
            grammar('N は ありませんか', 'Is there not / do you have any ...?', 'A negative question can invite the listener to supply a missing option or mention a concern without presuming the answer.', [
                { japanese: '食べられないものはありませんか。', meaning: 'Is there anything you cannot eat?' },
                { japanese: 'ほかにいい場所はありませんか。', meaning: 'Is there another good place?' },
            ], 'Use it because the negative framing serves the interaction, not as a word-for-word English template.'),
            grammar('V dictionary + ように / Vない + ように', 'so that / so as not to', 'Use ように for a desired result that is not fully under direct control, such as ability, understanding, or avoiding a mistake.', [
                { japanese: '間に合うように、早く出ます。', meaning: 'I leave early so that I will be on time.' },
                { japanese: '迷わないように、地図を送ります。', meaning: 'I send a map so that nobody gets lost.' },
            ], 'For a deliberate action goal, ために may fit better. ように often targets a state, ability, or prevention.'),
        ],
        kanji: [
            { character: '肉', reading: 'にく', word: '肉料理', meaning: 'meat' },
            { character: '料', reading: 'りょう', word: '料理', meaning: 'materials / fee' },
            { character: '理', reading: 'り', word: '料理', meaning: 'reason / manage' },
            { character: '野', reading: 'や', word: '野菜', meaning: 'field' },
            { character: '半', reading: 'はん', word: '十時半', meaning: 'half' },
            { character: '大', reading: 'だい／おお', word: '大きい', meaning: 'big' },
            { character: '小', reading: 'しょう／ちい', word: '小さい', meaning: 'small' },
        ],
        practice: [
            choice('l9-1', 'Choose the relevant condition response.', '雨＿、駅のカフェに変えませんか。', ['なら', 'まで', 'より'], 'なら', 'The rain is the condition being answered.', 'nara'),
            choice('l9-2', 'Ask whether anyone has a food restriction.', '', ['食べられないものはありませんか。', '食べられないものを食べますか。', '食べ物はありません。'], '食べられないものはありませんか。', 'The negative question leaves space for someone to mention a restriction.', 'negative-question'),
            text('l9-3', 'Complete the preventative purpose.', '迷わない＿＿＿、地図を送ります。', 'ように', 'ないように expresses “so that [someone] does not.”', 'youni'),
            order('l9-4', 'Build the fallback.', ['十時半に会いましょう', '雨なら', '駅のカフェで'], ['雨なら', '駅のカフェで', '十時半に会いましょう'], 'Condition, place, then meeting action.', 'nara'),
            choice('l9-5', 'Choose the enabling purpose.', '電車に＿ように、九時に家を出ます。', ['間に合う', '間に合って', '間に合った'], '間に合う', 'Dictionary form + ように names the desired result.', 'youni'),
            choice('l9-6', 'Which message is easiest for the whole group to act on?', '', ['雨なら十時半に駅の中のカフェで会いましょう。地図を送ります。', '雨ならたぶん何かします。', 'カフェがいいと思うこともあります。'], '雨なら十時半に駅の中のカフェで会いましょう。地図を送ります。', 'It gives a condition, time, place, and support action.', 'shared-plan'),
            text('l9-7', 'Complete the option-seeking question.', 'ほかに静かな場所は＿＿＿か。', 'ありません', 'ありませんか asks whether another option exists.', 'negative-question'),
            choice('l9-8', 'Choose the best “just in case” action.', '念のため、＿。', ['傘を持っていきます', '雨が好きではありませんか', '駅は大きかったです'], '傘を持っていきます', 'A concrete precaution follows 念のため.', 'shared-plan'),
        ],
        reviewFrom: ['Lesson 8: preparation with ておく', 'Lesson 7: states and changes', 'Lesson 6: multiple reasons', 'Lesson 3: invitations and meeting details'],
        finalTask: {
            title: 'Publish the Sunday plan',
            prompt: 'Write a group message with the main plan, a rain fallback, one considerate question, and one support action. Then record it as a voice message.',
            success: ['Time, place, and activity', 'One なら fallback', 'One ありませんか question', 'One ように / ないように support action'],
            model: '日曜日は十時に駅の北口で会いましょう。雨なら、駅の中のカフェで会いませんか。食べられないものはありませんか。みんなが迷わないように、土曜日に地図を送ります。',
        },
    },
] as const;

export const academyFoundationRoute: readonly FoundationLesson[] = [kanaOnRamp, ...foundationLessons];

export function lessonByRouteNumber(routeNumber: number): FoundationLesson | undefined {
    return academyFoundationRoute.find(lesson => lesson.routeNumber === routeNumber);
}

export function validateFoundationCourse(lessons: readonly FoundationLesson[] = academyFoundationRoute): readonly string[] {
    const issues: string[] = [];
    const ids = new Set<string>();
    const routeNumbers = new Set<number>();

    lessons.forEach(lesson => {
        if (ids.has(lesson.id)) issues.push(`Duplicate lesson id: ${lesson.id}`);
        if (routeNumbers.has(lesson.routeNumber)) issues.push(`Duplicate route number: ${lesson.routeNumber}`);
        ids.add(lesson.id);
        routeNumbers.add(lesson.routeNumber);

        if (lesson.objectives.length < 4) issues.push(`${lesson.id}: fewer than four objectives`);
        if (lesson.vocabulary.length < 12) issues.push(`${lesson.id}: fewer than twelve vocabulary items`);
        if (lesson.grammar.length < 2) issues.push(`${lesson.id}: fewer than two grammar explanations`);
        if (lesson.practice.length < 6) issues.push(`${lesson.id}: fewer than six practice items`);
        if (lesson.opening.length < 3) issues.push(`${lesson.id}: opening scene is too short`);
        if (lesson.finalTask.success.length < 4) issues.push(`${lesson.id}: final task has fewer than four success checks`);

        lesson.practice.forEach(item => {
            if (item.kind === 'choice' && (!item.options || !item.options.includes(item.answer as string))) {
                issues.push(`${lesson.id}/${item.id}: choice answer is missing from options`);
            }
            if (item.kind === 'order' && (!item.options || !Array.isArray(item.answer))) {
                issues.push(`${lesson.id}/${item.id}: order task is incomplete`);
            }
            if (!item.explanation.trim()) issues.push(`${lesson.id}/${item.id}: missing answer explanation`);
        });
    });

    const expectedRoute = Array.from({ length: 10 }, (_, index) => index);
    expectedRoute.forEach(routeNumber => {
        if (!routeNumbers.has(routeNumber)) issues.push(`Missing route number: ${routeNumber}`);
    });

    return issues;
}
