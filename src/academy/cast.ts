/**
 * Yomu Academy — the cast.
 *
 * This is an affectionate, first-name-only ensemble inspired by a real UCL
 * evening Japanese class: a gift the maker is building for their classmates.
 * People are defined ONLY by the warm, wholesome things they love — cars and
 * city pop, Pokémon, ramen, knitting, Mt. Fuji. We never encode a phone
 * number, address, employer, relationship, or any sensitive trait. Every
 * character is a caricature drawn with love, never a mockery.
 *
 * The data here drives portraits (via art.ts avatar specs), campus placement,
 * greeting lines, and Study-Link (bond) hooks. The full branching dialogue for
 * each Study Link lives in the story graph; this file is the character bible
 * the rest of the game reads from.
 */

import type { AvatarSpec, PropId } from './art';

export type CampusSpot =
    | 'quad' | 'classroom' | 'library' | 'lab' | 'garden'
    | 'studio' | 'cafe' | 'pub' | 'ramen' | 'konbini' | 'gym' | 'station';

export interface StudyLinkHook {
    /** Short bond-conversation title shown in the UI. */
    title: string;
    /** What the learner practises by talking to this person. */
    focus: string;
    /** The Japanese level the exchange sits at. */
    level: 'N5' | 'N4';
}

export interface CastMember {
    id: string;
    /** First name only, exactly as the class knows them. */
    name: string;
    /** Kana rendering used in Japanese dialogue. */
    kana: string;
    /** One-line "who they are" for a roster card. */
    role: string;
    /** The wholesome hobby that anchors the whole character. */
    hobby: string;
    /** A warm, slightly playful bio — the charm. */
    bio: string;
    /** A signature line they might say (kept N5-friendly). */
    catchphrase: { ja: string; en: string };
    /** Where they hang out on campus (drives placement + "bump into" gags). */
    home: CampusSpot;
    /** Portrait spec for the SVG avatar system. */
    avatar: AvatarSpec;
    /** Whether this is the busy sensei, a classmate, or a textbook cameo. */
    kind: 'sensei' | 'classmate' | 'cameo';
    /** Bond / support-conversation hooks (Persona confidant / Fire Emblem support). */
    studyLinks: readonly StudyLinkHook[];
    /** Running gag or recurring motif tied to this character. */
    runningGag?: string;
}

/* --------------------------------------------------------------- the sensei */

export const RIE_SENSEI: CastMember = {
    id: 'rie',
    name: 'Rie',
    kana: 'りえ先生',
    role: 'Your sensei — and, somehow, everywhere',
    hobby: 'Tea, natto at home, and a secret love of cup noodles',
    bio: 'Warm, quick to laugh, impossibly busy. She grades every worksheet with a hand-drawn 花丸 and remembers what each student is scared of. She works what feels like nine jobs, so you will meet her again in the strangest places.',
    catchphrase: { ja: 'まず、意味からいきましょう。', en: 'Let\'s start from the meaning.' },
    home: 'classroom',
    kind: 'sensei',
    avatar: { skin: 'warm', hair: 'bun', hairColor: 'softBlack', outfit: 'teal', accent: 'sage', expression: 'warm', prop: 'teacup', earrings: '#e6b34a', blush: true },
    runningGag: 'You keep bumping into Rie-sensei working a second job — the midnight konbini till, the ramen counter, the station kiosk. She is always delighted, always exhausted, always kind.',
    studyLinks: [
        { title: 'The teacher\'s desk', focus: 'Classroom requests, polite questions (〜てもいいですか)', level: 'N5' },
        { title: 'The konbini at midnight', focus: 'Shopping, counting, casual small talk', level: 'N5' },
        { title: 'Marking papers together', focus: 'Giving reasons and encouragement (〜から, 〜ように)', level: 'N4' },
    ],
};

/* ------------------------------------------------------------- the students */

export const CLASSMATES: readonly CastMember[] = [
    {
        id: 'henry',
        name: 'Henry',
        kana: 'ヘンリー',
        role: 'The one with too many laptops',
        hobby: 'Building things with AI at 2am',
        bio: 'Always automating something, always a little behind on homework, always convinced there is a smarter way. The Academy is what happens when he finally builds the study tool instead of avoiding studying.',
        catchphrase: { ja: 'あとで、やります…たぶん。', en: 'I\'ll do it later… probably.' },
        home: 'quad',
        kind: 'classmate',
        avatar: { skin: 'light', hair: 'messy', hairColor: 'brown', outfit: 'indigo', accent: 'sky', expression: 'happy', prop: 'laptop' },
        runningGag: 'Every time homework is due, Henry has instead built an elaborate app to avoid it.',
        studyLinks: [{ title: 'The all-nighter', focus: 'Talking about plans and intentions (〜つもり, 〜predict)', level: 'N4' }],
    },
    {
        id: 'aakash',
        name: 'Aakash',
        kana: 'アーカシュ',
        role: 'The stylish one',
        hobby: 'Classic cars, city pop, Hello Kitty, and impeccable anime fashion',
        bio: 'Rolls into evening class like it\'s a Shibuya night drive with Tatsuro Yamashita on the speakers. Warm, generous, and will absolutely judge your playlist — lovingly.',
        catchphrase: { ja: 'いい曲、聞きたい？', en: 'Wanna hear a good song?' },
        home: 'cafe',
        kind: 'classmate',
        avatar: { skin: 'brown', hair: 'undercut', hairColor: 'black', outfit: 'charcoal', accent: 'lilac', expression: 'happy', facialHair: 'beard', prop: 'car' },
        runningGag: 'Aakash rates every scene by "would this be a good city-pop album cover?"',
        studyLinks: [{ title: 'Night drive', focus: 'Likes/dislikes and describing things (〜が好き, adjectives)', level: 'N5' }],
    },
    {
        id: 'alex',
        name: 'Alex',
        kana: 'アレックス',
        role: 'The quiet senpai',
        hobby: 'Climbing mountains (yes, including Fuji)',
        bio: 'Looks completely ordinary; has quietly done more than the rest of the class combined. Says little, but every word is load-bearing. Once mentioned Fuji like it was a weekend errand.',
        catchphrase: { ja: 'ゆっくり、いきましょう。', en: 'Let\'s take it slow.' },
        home: 'quad',
        kind: 'classmate',
        avatar: { skin: 'light', hair: 'short', hairColor: 'brown', outfit: 'slate', accent: 'sky', expression: 'neutral', prop: 'fuji' },
        studyLinks: [{ title: 'The summit', focus: 'Sequencing and past experience (〜たことがある, 〜てから)', level: 'N4' }],
    },
    {
        id: 'tom',
        name: 'Tom',
        kana: 'トム',
        role: 'The one who\'d catch \'em all',
        hobby: 'Nintendo, Pokémon, and a dog named Chestnut',
        bio: 'Pure, unfiltered enthusiasm. Knows every starter\'s Japanese name and will teach them to you whether you asked or not. Chestnut is, canonically, the best dog.',
        catchphrase: { ja: 'クリの写真、見る？', en: 'Wanna see a photo of Chestnut?' },
        home: 'library',
        kind: 'classmate',
        avatar: { skin: 'light', hair: 'short', hairColor: 'blonde', outfit: 'forest', accent: 'mint', expression: 'happy', prop: 'pokeball', blush: true },
        runningGag: 'Tom teaches every new word by finding the Pokémon that has it in its name.',
        studyLinks: [{ title: 'Gotta learn \'em all', focus: 'Katakana, animals, and counters', level: 'N5' }],
    },
    {
        id: 'sam',
        name: 'Sam',
        kana: 'サム',
        role: 'The Saturday athlete',
        hobby: 'Okonomiyaki and a standing tennis match every Saturday',
        bio: 'Easygoing, hungry, competitive in exactly one arena (the court) and nowhere else. Believes okonomiyaki is a personality and he might be right.',
        catchphrase: { ja: 'お好み焼き、食べに行かない？', en: 'Wanna go get okonomiyaki?' },
        home: 'gym',
        kind: 'classmate',
        avatar: { skin: 'light', hair: 'short', hairColor: 'chestnut', outfit: 'forest', accent: 'sage', expression: 'happy', prop: 'okonomiyaki' },
        studyLinks: [{ title: 'Grill night', focus: 'Inviting and suggesting (〜ませんか, 〜ましょう)', level: 'N5' }],
    },
    {
        id: 'francis',
        name: 'Francis',
        kana: 'フランシス',
        role: 'The gentle dreamer',
        hobby: 'Tea, Frieren, manga, and Hatsune Miku',
        bio: 'Feels everything a little more than everyone else. Reads manga on the night bus and cries at the good panels. When Francis finally speaks in class, the whole room leans in.',
        catchphrase: { ja: 'この曲、いいですよ…。', en: 'This song is… really something.' },
        home: 'library',
        kind: 'classmate',
        avatar: { skin: 'light', hair: 'wavy', hairColor: 'sand', outfit: 'plum', accent: 'lilac', expression: 'sleepy', prop: 'music' },
        studyLinks: [{ title: 'Between panels', focus: 'Feelings and reasons (〜と思う, 〜から)', level: 'N4' }],
    },
    {
        id: 'shin',
        name: 'Shin',
        kana: 'シン',
        role: 'The kanji wizard',
        hobby: 'Ramen, and already knowing every kanji you\'re scared of',
        bio: 'Reads a menu like it\'s a picture book. Patient, funny, and secretly proud when he can explain a radical so it finally clicks for you. Will always know a better ramen place.',
        catchphrase: { ja: 'その漢字、簡単だよ。', en: 'That kanji? Easy.' },
        home: 'ramen',
        kind: 'classmate',
        avatar: { skin: 'warm', hair: 'short', hairColor: 'black', outfit: 'navy', accent: 'sky', expression: 'warm', glasses: 'round', prop: 'ramen' },
        runningGag: 'Shin explains every hard kanji as a tiny story, and it always, annoyingly, works.',
        studyLinks: [{ title: 'Ramen before class', focus: 'Kanji radicals and reading menus', level: 'N4' }],
    },
    {
        id: 'jodi',
        name: 'Jodi',
        kana: 'ジョディ',
        role: 'The one who\'s been there',
        hobby: 'Remembering a Japan she lived in years ago',
        bio: 'Studied hardest of anyone because she\'s chasing a memory, not a grade. Tells stories about a Tokyo that half-exists now. The class\'s quiet heart.',
        catchphrase: { ja: '昔ね、日本に住んでいたの。', en: 'You know, I used to live in Japan.' },
        home: 'garden',
        kind: 'classmate',
        avatar: { skin: 'light', hair: 'bob', hairColor: 'silver', outfit: 'plum', accent: 'rose', expression: 'warm', prop: 'book' },
        studyLinks: [{ title: 'The Tokyo she knew', focus: 'Past tense and memory (〜ていた, 〜んです)', level: 'N4' }],
    },
    {
        id: 'christian',
        name: 'Christian',
        kana: 'クリスチャン',
        role: 'The delightfully odd one',
        hobby: 'The gym, volunteering, a desk fan, and a recorder',
        bio: 'Disciplined about the important things and gloriously random about the rest. Yes, he brings a desk fan. Yes, he can play the recorder. No, no one questions it anymore.',
        catchphrase: { ja: '今日は、ジムに行きます。', en: 'Today, I\'m going to the gym.' },
        home: 'gym',
        kind: 'classmate',
        avatar: { skin: 'deep', hair: 'ponytail', hairColor: 'black', outfit: 'slate', accent: 'sage', expression: 'happy', prop: 'dumbbell' },
        runningGag: 'At least once a chapter, Christian produces the recorder. It is never explained.',
        studyLinks: [{ title: 'Reps and routines', focus: 'Daily schedule and frequency (毎日, 〜時に)', level: 'N5' }],
    },
    {
        id: 'jenny',
        name: 'Jenny',
        kana: 'ジェニー',
        role: 'The cozy connector',
        hobby: 'Knitting, and reading a room in one glance',
        bio: 'Always has a half-finished scarf and a spare kind word. Notices when someone\'s gone quiet. Knits while she studies and somehow remembers more than the rest of you.',
        catchphrase: { ja: 'だいじょうぶ？お茶、いる？', en: 'You okay? Want some tea?' },
        home: 'cafe',
        kind: 'classmate',
        avatar: { skin: 'light', hair: 'long', hairColor: 'auburn', outfit: 'rose', accent: 'rose', expression: 'warm', headband: '#c8e6d3', prop: 'knitting' },
        studyLinks: [{ title: 'One row at a time', focus: 'Asking after people and offering (〜ましょうか)', level: 'N5' }],
    },
    {
        id: 'robert',
        name: 'Robert',
        kana: 'ロバート',
        role: 'The bon vivant',
        hobby: 'Fine dining, good restaurants, and organising the pub trip',
        bio: 'The reason the class actually goes for a drink afterward. Has strong opinions about menus and stronger opinions about where to celebrate. Never lets anyone sit alone.',
        catchphrase: { ja: '授業のあと、一杯どう？', en: 'A drink after class?' },
        home: 'pub',
        kind: 'classmate',
        avatar: { skin: 'light', hair: 'sidepart', hairColor: 'brown', outfit: 'navy', accent: 'sand', expression: 'warm', glasses: 'square', prop: 'dining' },
        studyLinks: [{ title: 'The reservation', focus: 'Ordering and preferences (〜をください, 〜ほうがいい)', level: 'N4' }],
    },
    {
        id: 'mika',
        name: 'Mika',
        kana: 'ミカ',
        role: 'The quiet polyglot',
        hobby: 'Collecting languages, one shy word at a time',
        bio: 'Already speaks more languages than he\'ll admit. Precise, thoughtful, and terrified of speaking first — which is exactly why he\'s so good once he starts.',
        catchphrase: { ja: 'ええと…もう一回、いいですか。', en: 'Um… could you say that once more?' },
        home: 'lab',
        kind: 'classmate',
        avatar: { skin: 'light', hair: 'sidepart', hairColor: 'blonde', outfit: 'sky', accent: 'sky', expression: 'thinking', glasses: 'thin', prop: 'globe' },
        studyLinks: [{ title: 'Say it once more', focus: 'Clarifying and repeating (もう一度, 〜という意味)', level: 'N5' }],
    },
    {
        id: 'sophie',
        name: 'Sophie',
        kana: 'ソフィー',
        role: 'Top of the class (and quietly anxious about it)',
        hobby: 'Being brilliant, and pretending it\'s effortless',
        bio: 'Finishes the homework the day it\'s set and re-does it if it\'s not perfect. Kind, sharp, a little too hard on herself. Learns to breathe when the class becomes a team.',
        catchphrase: { ja: 'もう終わりました。次は？', en: 'Already done. What\'s next?' },
        home: 'library',
        kind: 'classmate',
        avatar: { skin: 'tan', hair: 'long', hairColor: 'black', outfit: 'indigo', accent: 'mint', expression: 'happy', prop: 'star' },
        studyLinks: [{ title: 'The perfect draft', focus: 'Writing and self-review (〜なければ, 〜たら)', level: 'N4' }],
    },
    {
        id: 'xingyu',
        name: 'Xingyu',
        kana: 'シンユー',
        role: 'The sunshine',
        hobby: 'Miku, singing, and being relentlessly happy',
        bio: 'Arrives grinning, leaves grinning, hums Miku through the whole listening exercise. Impossible to have a bad evening around. Secretly the glue that keeps the class together.',
        catchphrase: { ja: '今日も、たのしいね！', en: 'Today\'s fun too, right!' },
        home: 'quad',
        kind: 'classmate',
        avatar: { skin: 'warm', hair: 'ponytail', hairColor: 'black', outfit: 'teal', accent: 'lilac', expression: 'happy', prop: 'music', blush: true },
        studyLinks: [{ title: 'Sing it back', focus: 'Listening and repeating rhythm, kana songs', level: 'N5' }],
    },
    {
        id: 'angel',
        name: 'Angel',
        kana: 'エンジェル',
        role: 'The one who keeps everyone organised',
        hobby: 'Tech, tidy spreadsheets, and everyone\'s deadlines memorised',
        bio: 'Ran on big-tech organisation long before she joined the class. Warm and quick, and she somehow already has a colour-coded plan for the group trip nobody has booked yet.',
        catchphrase: { ja: 'だいじょうぶ、リストにしたよ。', en: 'It\'s fine — I already made a list.' },
        home: 'library',
        kind: 'classmate',
        avatar: { skin: 'tan', hair: 'long', hairColor: 'brown', outfit: 'navy', accent: 'sky', expression: 'happy', prop: 'laptop' },
        studyLinks: [{ title: 'The shared doc', focus: 'Time, dates, and plans (〜に, 〜まで)', level: 'N5' }],
    },
    {
        id: 'stasi',
        name: 'Stasi',
        kana: 'スタシ',
        role: 'The bright spark',
        hobby: 'Art, indie music, and a scarf for every mood',
        bio: 'Red hair, red scarf, ideas everywhere. Sketches in the margins of the worksheet, and somehow the sketch explains the grammar better than the textbook did.',
        catchphrase: { ja: 'ちょっと、描いてみる。', en: 'Hang on — let me draw it.' },
        home: 'cafe',
        kind: 'classmate',
        avatar: { skin: 'light', hair: 'wavy', hairColor: 'auburn', outfit: 'rose', accent: 'rose', expression: 'happy', glasses: 'round' },
        studyLinks: [{ title: 'In the margins', focus: 'Colours, descriptions, and adjectives', level: 'N5' }],
    },
    {
        id: 'ruparna',
        name: 'Ruparna',
        kana: 'ルパルナ',
        role: 'The quiet cinephile',
        hobby: 'Films, novels, and the perfect subtitle',
        bio: 'Watches everything with the subtitles on, twice. Gentle and observant, and the first to notice a new grammar point hiding inside a line of dialogue.',
        catchphrase: { ja: 'この字幕、いいね。', en: 'These subtitles are nice.' },
        home: 'library',
        kind: 'classmate',
        avatar: { skin: 'tan', hair: 'long', hairColor: 'softBlack', outfit: 'plum', accent: 'lilac', expression: 'thinking', prop: 'book' },
        studyLinks: [{ title: 'One more subtitle', focus: 'Reading short lines and quotes', level: 'N4' }],
    },
];

/* -------------------------------------------------------- textbook cameos */

/** The "textbook ghosts" — legends who only speak in stiff coursebook lines. */
export const TEXTBOOK_CAMEOS: readonly CastMember[] = [
    {
        id: 'miller',
        name: 'Miller',
        kana: 'ミラーさん',
        role: 'A legend from the textbook',
        hobby: 'Being a businessman, apparently forever',
        bio: 'Materialises whenever a grammar point needs an example sentence, delivers it perfectly, and vanishes. No one knows which company. Everyone knows he is going to Kobe next week.',
        catchphrase: { ja: 'わたしは 会社員です。', en: 'I am a company employee.' },
        home: 'classroom',
        kind: 'cameo',
        avatar: { skin: 'light', hair: 'sidepart', hairColor: 'blonde', outfit: 'navy', accent: 'sand', expression: 'neutral', prop: 'book' },
        runningGag: 'Miller-san appears only to say a flawless textbook sentence, then leaves. He is always "going to Kobe."',
        studyLinks: [{ title: 'Example sentence', focus: 'Textbook set phrases and self-introduction', level: 'N5' }],
    },
    {
        id: 'tawapon',
        name: 'Tawapon',
        kana: 'ワンさん',
        role: 'A legend from the textbook',
        hobby: 'Studying, eternally, at a university that never graduates him',
        bio: 'The most diligent student who ever lived inside a coursebook. Speaks in perfect model answers and is genuinely, sweetly encouraging.',
        catchphrase: { ja: 'わたしは 学生です。', en: 'I am a student.' },
        home: 'library',
        kind: 'cameo',
        avatar: { skin: 'tan', hair: 'short', hairColor: 'black', outfit: 'forest', accent: 'mint', expression: 'happy', prop: 'book' },
        studyLinks: [{ title: 'Model answer', focus: 'Polite plain forms and study vocabulary', level: 'N5' }],
    },
];

/* --------------------------------------------------------------- accessors */

export const ACADEMY_CAST: readonly CastMember[] = [RIE_SENSEI, ...CLASSMATES, ...TEXTBOOK_CAMEOS];

const CAST_BY_ID = new Map(ACADEMY_CAST.map(member => [member.id, member]));

export function castMemberById(id: string): CastMember | undefined {
    return CAST_BY_ID.get(id);
}

/** Classmates whose campus "home" is the given spot (for placing them on the map). */
export function castAtSpot(spot: CampusSpot): readonly CastMember[] {
    return ACADEMY_CAST.filter(member => member.home === spot);
}

/** A stable hobby-emblem lookup for quick UI (roster chips, item drops). */
export function hobbyProp(id: string): PropId | undefined {
    return castMemberById(id)?.avatar.prop;
}
