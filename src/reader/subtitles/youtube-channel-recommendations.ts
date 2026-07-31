import { stableHashBase36 } from '../core/stable-hash';
import { languageFamilyIncludes } from '../settings/language-gating';
import { targetLanguageOf } from '../languages/selection';

export type YouTubeChannelLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
export type YouTubeChannelCaptionKind = 'soft' | 'hard' | 'furigana';
export type YouTubeChannelRecommendationSource = 'nihongotube' | 'jpdb' | 'reddit' | 'search' | 'user';
export type YouTubeChannelRecommendationFilter = 'all' | 'starter' | 'captions' | 'native' | 'kids' | 'gaming' | 'travel' | 'food';

export interface YouTubeChannelRecommendation {
    handle: string;
    name: string;
    level: YouTubeChannelLevel;
    topics: string[];
    captions: YouTubeChannelCaptionKind[];
    sources: YouTubeChannelRecommendationSource[];
}

export interface YouTubeChannelRecommendationFilterOption {
    id: YouTubeChannelRecommendationFilter;
    label: string;
}

export const YOUTUBE_CHANNEL_RECOMMENDATION_FILTERS: YouTubeChannelRecommendationFilterOption[] = [
    { id: 'all', label: 'All' },
    { id: 'starter', label: 'Starter' },
    { id: 'captions', label: 'Captions' },
    { id: 'native', label: 'Native' },
    { id: 'kids', label: 'Kids' },
    { id: 'gaming', label: 'Gaming' },
    { id: 'travel', label: 'Travel' },
    { id: 'food', label: 'Food' },
];

const YOUTUBE_CHANNEL_RECOMMENDATIONS = [
    { handle: '@SuitTravel', name: 'Suit Travel', level: 'N1', topics: ['Travel', 'Culture'], captions: [], sources: ['nihongotube'] },
    { handle: '@oi_ken', name: 'けんた食堂', level: 'N2', topics: ['Food'], captions: ['soft', 'hard'], sources: ['nihongotube'] },
    { handle: '@ore.fiction', name: '俺フィク', level: 'N2', topics: ['Comedy'], captions: [], sources: ['nihongotube'] },
    { handle: '@higemilk', name: '髭ミルク', level: 'N3', topics: ['Fashion'], captions: [], sources: ['nihongotube'] },
    { handle: '@norunine', name: '兄者弟者', level: 'N2', topics: ['Gaming'], captions: [], sources: ['nihongotube'] },
    { handle: '@mentalistdaigo', name: 'メンタリスト DaiGo', level: 'N2', topics: ['Philosophy', 'Education'], captions: [], sources: ['nihongotube'] },
    { handle: '@zetsubouline', name: '絶望ライン工ch', level: 'N2', topics: ['Comedy', 'Lifestyle'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@android_', name: '散歩するアンドロイド', level: 'N3', topics: ['Travel'], captions: [], sources: ['nihongotube'] },
    { handle: '@musyokutabi_jp', name: 'musyokutabi', level: 'N3', topics: ['Travel'], captions: [], sources: ['nihongotube'] },
    { handle: '@Akane-JapaneseClass', name: 'あかね的日本語教室', level: 'N4', topics: ['Education'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@はいじぃ迷作劇場', name: "Haiji's Japanese Food Collection", level: 'N3', topics: ['Food'], captions: [], sources: ['nihongotube'] },
    { handle: '@SuzukawaAyako', name: '鈴川絢子', level: 'N3', topics: ['Travel', 'Transport'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@NKTofficial', name: '中田敦彦のYouTube大学', level: 'N1', topics: ['Education'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@daihenshinn', name: '大変身ちゃんねる', level: 'N3', topics: ['Fashion'], captions: [], sources: ['nihongotube'] },
    { handle: '@teru5300', name: 'TERUちゃん', level: 'N3', topics: ['Anime & Manga'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@mishima3', name: 'ミシマ.', level: 'N2', topics: ['Anime & Manga'], captions: [], sources: ['nihongotube'] },
    { handle: '@habushiura', name: 'Active Otaku Channel', level: 'N2', topics: ['Anime & Manga', 'Travel'], captions: [], sources: ['nihongotube'] },
    { handle: '@shogo51', name: '森翔吾', level: 'N3', topics: ['Travel', 'Culture'], captions: [], sources: ['nihongotube'] },
    { handle: '@paka_channel', name: 'パーカー / 大学生の日常', level: 'N3', topics: ['Lifestyle'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@haruanne', name: 'はるあん', level: 'N4', topics: ['Food'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@pockysweets', name: 'ポッキー', level: 'N3', topics: ['Gaming', 'Comedy'], captions: [], sources: ['nihongotube'] },
    { handle: '@osho_taigu', name: '大愚和尚の一問一答', level: 'N2', topics: ['Philosophy'], captions: [], sources: ['nihongotube'] },
    { handle: '@ikechan0920', name: 'いけちゃん', level: 'N3', topics: ['Travel', 'Lifestyle'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@JSI55', name: 'Japanese super immersion', level: 'N3', topics: ['Education'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@jarujaruisland8111', name: 'ジャルジャルアイランド', level: 'N1', topics: ['Comedy'], captions: [], sources: ['nihongotube'] },
    { handle: '@YAKISHIMA_TRAVEL_秘境ハンター', name: 'YAKISHIMA TRAVEL TV', level: 'N2', topics: ['Travel'], captions: [], sources: ['nihongotube'] },
    { handle: '@yuuka_chan815', name: 'Yuka', level: 'N2', topics: ['Travel'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@wakuwakujapanese', name: 'WAKU WAKU JAPANESE', level: 'N5', topics: ['Education', 'Drama'], captions: ['hard', 'furigana'], sources: ['nihongotube'] },
    { handle: '@EASYJAPANESE', name: 'EASY JAPANESE PODCAST', level: 'N3', topics: ['Education'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@MaichanJapanesePodcast', name: 'MAIの日本語Podcast', level: 'N3', topics: ['Education'], captions: ['soft', 'hard', 'furigana'], sources: ['nihongotube'] },
    { handle: '@pekopeko_japanese', name: 'peko peko vlog', level: 'N2', topics: ['Education'], captions: ['soft', 'hard'], sources: ['nihongotube'] },
    { handle: '@japanese-listening-podcast', name: '日本語の聴解のためのPodcast', level: 'N4', topics: ['Education'], captions: [], sources: ['nihongotube'] },
    { handle: '@ひよりの虫日記', name: 'ひよりの虫日記', level: 'N2', topics: ['Nature'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@bstbs6ch-inujikan-nekojiman', name: 'いぬじかん&ねこ自慢', level: 'N3', topics: ['Animals', 'Documentary'], captions: [], sources: ['nihongotube'] },
    { handle: '@NipponFoundationPR', name: '日本財団', level: 'N2', topics: ['Lifestyle', 'Documentary'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@JapanesewithShun', name: 'Japanese with Shun', level: 'N5', topics: ['Education'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@kimagurecook', name: 'きまぐれクック', level: 'N3', topics: ['Food'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@kurzgesagt_jp', name: 'Kurzgesagt JP', level: 'N2', topics: ['Education', 'Science'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@KOUSEI0828', name: 'Kousei cooking', level: 'N2', topics: ['Food'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@ShigeTravel', name: 'しげ旅', level: 'N2', topics: ['Travel'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@tsubasa6417', name: 'がみ', level: 'N2', topics: ['Travel', 'Transport'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@shioneru', name: 'しおねる', level: 'N2', topics: ['Travel', 'Transport'], captions: ['soft', 'hard'], sources: ['nihongotube'] },
    { handle: '@anothersky_ntv', name: 'アナザースカイ', level: 'N2', topics: ['Travel', 'Culture'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@BappaShota', name: 'Bappa Shota', level: 'N2', topics: ['Travel', 'Documentary'], captions: ['soft', 'hard'], sources: ['nihongotube'] },
    { handle: '@the_bitesize_japanese_podcast', name: 'Bite Size Japanese', level: 'N4', topics: ['Education'], captions: ['soft', 'hard', 'furigana'], sources: ['nihongotube'] },
    { handle: '@TheNihongoNook', name: 'The Nihongo Nook', level: 'N5', topics: ['Education'], captions: [], sources: ['nihongotube'] },
    { handle: '@afromask', name: 'アフロマスク', level: 'N2', topics: ['Gaming'], captions: [], sources: ['nihongotube'] },
    { handle: '@joevlog7', name: 'JOE VLOG', level: 'N2', topics: ['Travel', 'Documentary'], captions: ['hard'], sources: ['nihongotube'] },
    // Dropped: youtube.com/@chinese-muimui 404s and no replacement handle could
    // be identified. @muimui resolves but is a different channel (nothing on it
    // carries むいむい), so pointing a learner there would be a worse answer than
    // one fewer recommendation. Restore it if the real handle turns up.
    { handle: '@hima_hima', name: 'HIMA HIMA CHANNEL', level: 'N3', topics: ['Lifestyle'], captions: ['hard', 'soft'], sources: ['nihongotube'] },
    { handle: '@tsuchikure-princess', name: '土くれプリンセス さおりの暮らし', level: 'N3', topics: ['Nature', 'Lifestyle'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@DailyJapanese', name: 'Daily Japanese with Naoko', level: 'N5', topics: ['Education'], captions: ['hard', 'soft', 'furigana'], sources: ['nihongotube'] },
    { handle: '@Aki-SenseiJPN', name: 'Akiko Japanese Conversations', level: 'N5', topics: ['Education'], captions: ['hard', 'soft'], sources: ['nihongotube'] },
    { handle: '@Akokitamura', name: 'Ako from Nihongo Picnic', level: 'N4', topics: ['Education'], captions: [], sources: ['nihongotube'] },
    { handle: '@podcast-kotonoha', name: 'ことのは・日本語の会話', level: 'N4', topics: ['Education'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@kensanokaeri', name: 'けんさんおかえり', level: 'N5', topics: ['Education'], captions: ['hard', 'soft', 'furigana'], sources: ['nihongotube'] },
    { handle: '@LearnJapanesewithNoriko', name: 'Learn Japanese with Noriko', level: 'N3', topics: ['Education'], captions: ['soft', 'hard'], sources: ['nihongotube'] },
    { handle: '@OkkeiJapanese', name: 'OkkeiJapanese', level: 'N4', topics: ['Education'], captions: ['hard', 'soft'], sources: ['nihongotube'] },
    { handle: '@06haruna09', name: 'はるちゃんねる', level: 'N3', topics: ['Gaming'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@mitubacraft', name: 'みつば / MitubaCraft', level: 'N2', topics: ['Gaming'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@SHIZUKU-ichu', name: 'しずく', level: 'N4', topics: ['Gaming'], captions: [], sources: ['nihongotube'] },
    { handle: '@Atashinchi', name: 'あたしンち公式チャンネル', level: 'N4', topics: ['Anime & Manga', 'Comedy'], captions: [], sources: ['nihongotube'] },
    { handle: '@CuriousGeorgeJP', name: 'おさるのジョージ', level: 'N4', topics: ['Anime & Manga', 'Kids'], captions: [], sources: ['nihongotube'] },
    { handle: '@SHIMAJIROCH', name: 'しまじろうチャンネル', level: 'N4', topics: ['Kids'], captions: [], sources: ['nihongotube'] },
    { handle: '@iroriro', name: 'いろりろチャンネル', level: 'N4', topics: ['Kids'], captions: [], sources: ['nihongotube'] },
    { handle: '@disneyjuniorjp', name: 'ディズニージュニア公式', level: 'N4', topics: ['Kids'], captions: [], sources: ['nihongotube'] },
    { handle: '@meicari', name: 'メイキャリ', level: 'N1', topics: ['Career', 'Education'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@tentyou', name: '遊楽舎ちゃんねる', level: 'N1', topics: ['Hobby'], captions: [], sources: ['nihongotube'] },
    { handle: '@reiwanotora', name: '令和の虎CHANNEL', level: 'N1', topics: ['Business'], captions: [], sources: ['nihongotube'] },
    { handle: '@MrPsychopass', name: 'サイコパスおじさん', level: 'N1', topics: ['Psychology', 'Society'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@karadayorokobu', name: 'カラダヨロコブ', level: 'N1', topics: ['Health'], captions: [], sources: ['nihongotube'] },
    { handle: '@ICHIKEN1', name: 'イチケン', level: 'N1', topics: ['Technology', 'Hobby'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@tobalog_toba', name: 'トバログ', level: 'N1', topics: ['Technology'], captions: ['soft', 'hard'], sources: ['nihongotube'] },
    { handle: '@bossb5553', name: '天文物理学者BossB', level: 'N1', topics: ['Science', 'Education'], captions: ['hard'], sources: ['nihongotube'] },
    { handle: '@Shimizu_OC', name: '清水貴裕', level: 'N1', topics: ['Hobby', 'Technology'], captions: [], sources: ['nihongotube'] },
    // Renamed: youtube.com/@cijapanese 404s. YouTube's own canonicalBaseUrl for
    // the surviving /c/ComprehensibleJapanese URL is @nijapanese, titled
    // "Natural Japanese (NIJ)" — same creator, new name (cijapanese.com agrees).
    { handle: '@nijapanese', name: 'Natural Japanese', level: 'N5', topics: ['Education'], captions: ['soft'], sources: ['nihongotube', 'jpdb', 'search'] },
    { handle: '@nihongoconteppei', name: 'Teppei', level: 'N5', topics: ['Education'], captions: [], sources: ['nihongotube'] },
    { handle: '@Udonsobakantou', name: 'うどんそば 関東', level: 'N1', topics: ['Travel', 'Food'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@KozueChibaManga', name: '千葉コズエ', level: 'N2', topics: ['Art', 'Anime & Manga'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@namishodo', name: 'Namishodo', level: 'N3', topics: ['Education', 'Culture'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@GamerGrandma', name: 'Gamer Grandma', level: 'N3', topics: ['Gaming'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@NihongoDekita', name: 'NihongoDekita with Sayaka', level: 'N4', topics: ['Education'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@TokyoTrivia', name: '東京限定雑学', level: 'N1', topics: ['Education'], captions: ['soft'], sources: ['nihongotube'] },
    { handle: '@musclearuaru', name: '筋肉あるある', level: 'N1', topics: ['Fitness', 'Science'], captions: [], sources: ['nihongotube'] },
    { handle: '@tomorunblog', name: 'ともらん ! Japan Running', level: 'N1', topics: ['Fitness'], captions: [], sources: ['nihongotube'] },
    { handle: '@Dark-world_Tourist', name: '闇世界のツーリスト', level: 'N1', topics: ['Entertainment', 'Mystery'], captions: [], sources: ['nihongotube'] },
    { handle: '@Rap_EJ', name: 'Rap EJ', level: 'N1', topics: ['Entertainment', 'Music'], captions: [], sources: ['nihongotube'] },
    { handle: '@CROSSROADLAB', name: 'CROSSROAD LAB', level: 'N1', topics: ['Food'], captions: [], sources: ['nihongotube'] },
    { handle: '@soezimaxTV', name: 'ソエジマックスのモトブログ', level: 'N1', topics: ['Transport'], captions: [], sources: ['nihongotube'] },
    { handle: '@shogihoroki', name: '将棋放浪記', level: 'N1', topics: ['Gaming'], captions: [], sources: ['nihongotube'] },
    { handle: '@Taichi25', name: 'たいち', level: 'N1', topics: ['Gaming'], captions: [], sources: ['nihongotube'] },
    { handle: '@programming_tutorial_youtube', name: 'プログラミングチュートリアル', level: 'N1', topics: ['Education', 'Technology'], captions: [], sources: ['nihongotube'] },
    { handle: '@naokimanshow-naokiman', name: 'Naokiman Show', level: 'N1', topics: ['Entertainment', 'Mystery'], captions: [], sources: ['nihongotube'] },
    { handle: '@pokemonkidstvJP', name: 'ポケモン Kids TV', level: 'N4', topics: ['Entertainment', 'Kids'], captions: [], sources: ['nihongotube'] },
    { handle: '@iroironanihongo', name: 'いろいろな日本語', level: 'N5', topics: ['Education', 'Anime & Manga'], captions: [], sources: ['nihongotube'] },
    { handle: '@KahoMiyake', name: '三宅書店', level: 'N2', topics: ['Books'], captions: [], sources: ['nihongotube'] },
    { handle: '@MyLittlePonyJapanese', name: 'My Little Pony JP', level: 'N4', topics: ['Film & Animation'], captions: [], sources: ['nihongotube'] },
    { handle: '@nihongo-no-jikan', name: 'にほんごのじかん', level: 'N5', topics: ['Education', 'Culture', 'Gaming'], captions: ['soft'], sources: ['user', 'search'] },
    { handle: '@nihongo-learning7582', name: 'Nihongo-Learning', level: 'N5', topics: ['Education', 'Travel', 'Culture'], captions: ['soft'], sources: ['reddit'] },
    { handle: '@SpeakJapaneseNaturally', name: 'Speak Japanese Naturally', level: 'N4', topics: ['Education', 'Pronunciation', 'Travel'], captions: ['soft'], sources: ['reddit', 'search'] },
] as const satisfies readonly YouTubeChannelRecommendation[];

/**
 * Whether this shelf's channels are in the language the learner is studying.
 *
 * Every entry below is a Japanese channel graded N5..N1, and there is no
 * equivalent list for any other target, so the shelf follows its DATA rather
 * than its setting: a learner of Russian who turns recommendations on was being
 * offered JLPT channels, and recommending the wrong language is worse than
 * recommending nothing (A48). Per-target channel lists would lift this.
 */
export function channelRecommendationsCoverTarget(settings: unknown): boolean {
    return languageFamilyIncludes('jp-only', targetLanguageOf(settings));
}

export const YOUTUBE_CHANNEL_RECOMMENDATION_COUNT = YOUTUBE_CHANNEL_RECOMMENDATIONS.length;

export function allYouTubeChannelRecommendations(): YouTubeChannelRecommendation[] {
    return [...YOUTUBE_CHANNEL_RECOMMENDATIONS];
}

// Identifies the current curated channel set. The "all subscribed" flag is keyed
// by this signature so editing the list (add/remove/rename a handle) invalidates
// the flag and re-tests against the new set.
export function youTubeChannelListSignature(): string {
    const handles = YOUTUBE_CHANNEL_RECOMMENDATIONS.map(channel => channel.handle.toLowerCase()).sort();
    return `${handles.length}:${stableHashBase36(handles.join('|'))}`;
}

export function youtubeChannelUrl(channel: YouTubeChannelRecommendation): string {
    return `https://www.youtube.com/${encodeURI(channel.handle)}`;
}

export function youtubeChannelRecommendationDescription(channel: YouTubeChannelRecommendation): string {
    const topics = channel.topics.slice(0, 2).join(' and ').toLowerCase();
    const captionHint = channel.captions.length ? ' Captions are often available.' : '';
    return `${topics || 'Japanese'} videos around ${channel.level}.${captionHint}`;
}

export function filterYouTubeChannelRecommendations(filter: YouTubeChannelRecommendationFilter): YouTubeChannelRecommendation[] {
    return YOUTUBE_CHANNEL_RECOMMENDATIONS.filter(channel => matchesYouTubeChannelRecommendationFilter(channel, filter));
}

export function starterYouTubeChannelRecommendations(limit: number): YouTubeChannelRecommendation[] {
    return YOUTUBE_CHANNEL_RECOMMENDATIONS
        .filter(channel => matchesYouTubeChannelRecommendationFilter(channel, 'starter'))
        .slice(0, limit);
}

function matchesYouTubeChannelRecommendationFilter(channel: YouTubeChannelRecommendation, filter: YouTubeChannelRecommendationFilter): boolean {
    if (filter === 'all') return true;
    if (filter === 'starter') return channel.level === 'N5' || channel.level === 'N4';
    if (filter === 'captions') return channel.captions.length > 0;
    if (filter === 'native') return channel.level === 'N3' || channel.level === 'N2' || channel.level === 'N1';
    return channel.topics.some(topic => topic.toLowerCase().includes(filter));
}
