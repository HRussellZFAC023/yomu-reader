import DefaultTheme from 'vitepress/theme-without-fonts';
import { useData, type Theme } from 'vitepress';
import { defineComponent, h, onMounted, provide, type Ref } from 'vue';
import {
    sharedContrastRatio,
    sharedHexToRgba,
    sharedMixHex,
} from '../../../src/reader/core/color-math';
import {
    rememberSupportBannerDismissal,
    shouldShowSupportBannerImpression,
} from '../../../src/reader/app/support-banner-policy';
import './custom.css';

type InterfaceLanguage = 'en' | 'ja';
type HostedThemePreference = 'auto' | 'dark' | 'light';
type HostedInterfaceLanguagePreference = InterfaceLanguage | 'auto';
type HostedSettingsChangeDetail = { preview?: unknown; settings?: Record<string, unknown> };
type HostedYomuRuntimeWindow = typeof window & {
    __yomuDevRuntime?: boolean;
    __yomuReaderAppInitialized?: boolean;
};

const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
const VITEPRESS_APPEARANCE_KEY = 'vitepress-theme-appearance';
const SETTINGS_CHANGE_EVENT = 'yomu-settings-change';
const OPEN_SETTINGS_EVENT = 'yomu-open-settings';
const LANGUAGE_EVENT = 'yomu-interface-language-change';
const LANGUAGE_TOGGLE_ID = 'yomu-hud-language-toggle';
const YOMU_HOSTED_RUNTIME_SCRIPT_ID = 'yomu-hosted-runtime';
const YOMU_HOSTED_SETTINGS_COMPANION_SCRIPT_ID = 'yomu-hosted-settings-companion';
const YOMU_HOSTED_VIDEO_COMPANION_SCRIPT_ID = 'yomu-hosted-video-companion';
const YOMU_HOSTED_OCR_MANGA_COMPANION_SCRIPT_ID = 'yomu-hosted-ocr-manga-companion';
const YOMU_HOSTED_UI_COPY_COMPANION_SCRIPT_ID = 'yomu-hosted-ui-copy-companion';
const LEGACY_YOMU_HOSTED_RUNTIME_SCRIPT_ID = 'yomu-hosted-demo-runtime';
const YOMU_SUPPORT_STATUS_URL = 'https://support.yomureader.com/status';
const YOMU_SUPPORT_DONATE_URL = 'https://support.yomureader.com/donate';
const YOMU_SUPPORT_FALLBACK_STATUS_URL = 'https://yomu-support.henry-robert-christopher-russell.workers.dev/status';
const YOMU_SUPPORT_BANNER_ID = 'yomu-support-banner';
const YOMU_SUPPORT_BANNER_DISMISSED_KEY = 'yomu-support-banner-dismissed-version';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const HOSTED_DOCS_TRANSLATION_LEAF_SELECTOR = 'h1, h2, h3, h4, p, li, a, button, span, strong, small, figcaption, dt, dd, th, td, summary, label';
const HOSTED_DOCS_HEAD_TRANSLATION_SELECTOR = [
    'meta[name="description"]',
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[property="og:image:alt"]',
    'meta[name="twitter:title"]',
    'meta[name="twitter:description"]',
    'meta[name="twitter:image:alt"]',
].join(',');
const DEFAULT_ACCENT_COLOR = '#5ea780';
const HOSTED_DOCS_LOCALE_META: Record<InterfaceLanguage, string> = {
    en: 'en_US',
    ja: 'ja_JP',
};
const DOC_COLOR_TOKENS = {
    black: '#000000',
    white: '#ffffff',
    readableInk: '#11161d',
    pageBgDark: '#181b20',
    pageBgLight: '#ffffff',
} as const;
const HOSTED_OVERFLOW_SELECTOR = '[data-yomu-hosted-overflow]';
const HOSTED_MOBILE_SETTINGS_SELECTOR = '[data-yomu-hosted-mobile-settings]';
const HOSTED_RUNTIME_SCROLL_MARGIN_PX = 160;
const HOSTED_JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const HOSTED_DOCS_TRANSLATED_ATTRIBUTES = ['aria-label', 'title', 'alt', 'placeholder'] as const;
type HostedDocsTranslatedAttribute = typeof HOSTED_DOCS_TRANSLATED_ATTRIBUTES[number];
interface HostedSupportProvider {
    id?: string;
    label?: string;
    url?: string;
    kind?: string;
    enabled?: boolean;
}
interface HostedSupportDisplay {
    currency?: string;
    symbol?: string;
    amount?: number;
    goal?: number;
    amountText?: string;
    goalText?: string;
    converted?: boolean;
}
interface HostedSupportStatus {
    dailyBudgetGbp?: number;
    donationGoalGbp?: number;
    donationsTodayGbp?: number;
    donationsThisMonthGbp?: number;
    estimatedMonthlyCostGbp?: number;
    progressRatio?: number;
    donateUrl?: string;
    providers?: HostedSupportProvider[];
    display?: HostedSupportDisplay;
    banner?: {
        enabled?: boolean;
        dismissVersion?: string;
        message?: string;
        costLabel?: string;
        goalLabel?: string;
        ctaLabel?: string;
        donateUrl?: string;
    };
}
const HOSTED_RUNTIME_TARGET_SELECTOR = [
    '[data-yomu-runtime-surface]',
    '.VPHero',
    '.VPHomeHero',
    '.VPFeatures',
    '.yomu-install-panel',
    '.yomu-hosted-overflow-group',
    '.yomu-link-grid',
    '.vp-doc',
].join(',');
const textNodeOriginals = new WeakMap<Text, string>();
const attrOriginals = new WeakMap<Element, Map<string, string>>();
let languageToggleObserver: MutationObserver | undefined;
let accentSyncBound = false;
let hostedThemeSyncBound = false;
let hostedThemeIsDark: Ref<boolean> | undefined;
let hostedSettingsEventPatch: Record<string, any> = {};
let themeClassObserver: MutationObserver | undefined;
let hostedDocsShellSyncPending = false;
let hostedDocsLocalizationPending = false;
let hostedDocsLocalizationResetPending = false;
let hostedAccentSignature = '';
let hostedDocumentTitleOriginal: string | undefined;
let hostedRuntimeIntentController: AbortController | undefined;
let hostedRuntimeIntentTargets: HTMLElement[] | undefined;
let routeSyncBound = false;
let localRuntimeCacheCleanupStarted = false;

const HOSTED_OVERFLOW_LINKS = [
    { text: 'Video Player', href: '/video-player/index.html', target: '_self' },
    { text: 'PDF Reader', href: '/pdf-reader/index.html', target: '_self' },
    { text: 'Stats', href: '/newtab/index.html?mode=stats', target: '_self' },
    { text: 'Local Audio', href: '/local-audio' },
    { text: 'Changelog', href: '/changelog' },
    { text: 'Support', href: '/support' },
] as const;

const HOSTED_LANGUAGE_TOGGLE_STATES: Record<InterfaceLanguage, { lang: InterfaceLanguage; text: string }> = {
    en: { lang: 'en', text: 'A' },
    ja: { lang: 'ja', text: 'あ' },
};

const HOSTED_LANGUAGE_TOGGLE_LABELS: Record<InterfaceLanguage, Record<InterfaceLanguage, string>> = {
    en: {
        en: 'Switch Yomu HUD to English',
        ja: 'Switch Yomu HUD to Japanese',
    },
    ja: {
        en: 'Yomu HUDを英語に切り替え',
        ja: 'Yomu HUDを日本語に切り替え',
    },
};

const HOSTED_THEME_PREFERENCES = new Set<HostedThemePreference>(['auto', 'dark', 'light']);
const HOSTED_DEMO_VIDEO_SETTINGS_PATCH = {
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
    wordUnderlineColorSource: 'pitch',
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleControlsMode: 'always',
    subtitleTranscriptVisible: false,
    ocrEnabled: true,
    ocrVideoPauseFrames: true,
    ocrProvider: 'google-lens',
    ocrOverlayTheme: 'auto',
} as const;
const HOSTED_MANGA_OCR_VOCABULARY = [
    { surface: 'ファントムハイヴ', spelling: 'ファントムハイヴ', reading: 'ファントムハイヴ', pitchPosition: 1 },
    { surface: '家', spelling: '家', reading: 'け', pitchPosition: 1 },
    { surface: '執事', spelling: '執事', reading: 'しつじ', pitchPosition: 2 },
    { surface: 'たる', spelling: 'たる', reading: 'たる', pitchPosition: 0 },
    { surface: 'もの', spelling: 'もの', reading: 'もの', pitchPosition: 0 },
    { surface: 'この', spelling: 'この', reading: 'この', pitchPosition: 0 },
    { surface: '程度', spelling: '程度', reading: 'ていど', pitchPosition: 1 },
    { surface: '技', spelling: '技', reading: 'わざ', pitchPosition: 1 },
    { surface: '使え', spelling: '使える', reading: 'つかえる', pitchPosition: 0 },
    { surface: 'なくて', spelling: 'ない', reading: 'ない', pitchPosition: 1 },
    { surface: 'どうします', spelling: 'どうする', reading: 'どうする', pitchPosition: 2 },
    { surface: 'セバスチャン', spelling: 'セバスチャン', reading: 'セバスチャン', pitchPosition: 2 },
    { surface: 'ミカエリス', spelling: 'ミカエリス', reading: 'ミカエリス' },
    { surface: '訳', spelling: '訳', reading: 'わけ', pitchPosition: 1 },
    { surface: '坊ちゃん', spelling: '坊ちゃん', reading: 'ぼっちゃん', pitchPosition: 1 },
    { surface: '私', spelling: '私', reading: 'わたし', pitchPosition: 0 },
    { surface: '勝ち', spelling: '勝ち', reading: 'かち', pitchPosition: 2 },
    { surface: '約束', spelling: '約束', reading: 'やくそく', pitchPosition: 0 },
    { surface: '通り', spelling: '通り', reading: 'とおり', pitchPosition: 3 },
    { surface: 'これから', spelling: 'これから', reading: 'これから', pitchPosition: 0 },
    { surface: '晩餐', spelling: '晩餐', reading: 'ばんさん', pitchPosition: 0 },
    { surface: '本日', spelling: '本日', reading: 'ほんじつ', pitchPosition: 1 },
    { surface: '復習', spelling: '復習', reading: 'ふくしゅう', pitchPosition: 0 },
    { surface: '明日', spelling: '明日', reading: 'あした', pitchPositions: [0, 3] },
    { surface: '予習', spelling: '予習', reading: 'よしゅう', pitchPosition: 0 },
    { surface: '下さいね', spelling: '下さい', reading: 'ください', pitchPosition: 3 },
    { surface: '当主', spelling: '当主', reading: 'とうしゅ', pitchPosition: 1 },
] as const;
const HOSTED_MANGA_OCR_LINES = [
    { text: 'ファントムハイヴ家の執事たるもの', box: { left: 0.52, top: 0.09, width: 0.38, height: 0.055 } },
    { text: 'この程度の技が使えなくてどうします', box: { left: 0.08, top: 0.47, width: 0.52, height: 0.07 } },
    { text: '約束通りこれから晩餐の復習と予習を下さいね', box: { left: 0.12, top: 0.82, width: 0.72, height: 0.06 } },
] as const;

const HOSTED_DOCS_JA_COPY: Record<string, string> = {
    "Hover dictionary popovers stay open while the pointer remains inside the same hyperlink or link-card control, preventing link-wrapped Japanese text from flashing the popover open and closed as the cursor crosses padding or sibling inline text.": "ポインターが同じリンクまたはリンクカードのコントロール内にある間、ホバー辞書ポップオーバーが開いたままになるようにしました。リンクで囲まれた日本語テキスト上で、余白や隣接するインラインテキストを横切ったときにポップオーバーが開閉して点滅する問題を防ぎます。",
    "The Yomu Gaming desktop app icon no longer degrades into a corrupted blue square at small sizes (window titles, Finder lists, the Dock at small scale): the packager derived the 16px and 32px macOS icon representations from the 512px raster with a broken downscaler, so every rebuild reintroduced the garbled icon. All icon sizes are now rendered directly from the canonical vector artwork and shipped as a prebuilt icon file the packager uses as-is.": "Yomu Gamingデスクトップアプリのアイコンが、小さいサイズ（ウィンドウタイトル、Finderのリスト、縮小表示のDock）で崩れた青い四角になる問題を修正しました。パッケージャーが16pxと32pxのmacOSアイコン表現を512pxのラスター画像から不具合のある縮小処理で生成していたため、ビルドのたびに乱れたアイコンが再発していました。現在はすべてのアイコンサイズを正規のベクター素材から直接レンダリングし、パッケージャーがそのまま使用するビルド済みアイコンファイルとして同梱しています。",
    "Base text no longer disappears from clipped single-line rows when furigana is added: Shorts titles and shelf headings could shift out of their fixed-height clip window leaving only the reading visible. Words inside sub-one-line clipped or ellipsis rows now keep colour and pitch underlines without an in-place reading, so the text itself always stays visible on every engine and layout.": "ふりがなを追加したときに、切り抜き表示の1行テキストから本文が消えることがなくなりました。ショート動画のタイトルや棚見出しが固定高さのクリップ枠から押し出され、読みだけが見える状態になることがありました。1行未満に切り抜かれた行や省略記号（…）付きの行の単語は、行内の読みを付けずに色分けとピッチの下線を維持するため、どのエンジン・どのレイアウトでも本文が必ず表示されたままになります。",
    "Mobile YouTube comment bodies and author handles are now decorated: the comment bottom sheet's current markup (comment threads without the legacy content-text id) is scanned directly, and scrolling inside any panel or bottom sheet now triggers the settle re-scan that previously only ran for whole-page scrolls.": "モバイルYouTubeのコメント本文と投稿者ハンドルが装飾されるようになりました。コメントのボトムシートの現行マークアップ（旧来のcontent-text IDを持たないコメントスレッド）を直接スキャンし、パネルやボトムシート内のスクロールでも、これまでページ全体のスクロールでしか動かなかった静止後の再スキャンが実行されます。",
    "On iPhone and iPad, community-post and description texts are no longer clipped to a sliver of one line: Safari collapses a line-clamped box as soon as a furigana annotation is inserted into it, so on affected browsers those boxes keep colour and pitch underlines while the reading is left off.": "iPhoneとiPadで、コミュニティ投稿や説明文のテキストが1行の断片に切り詰められることがなくなりました。Safariは行数制限（line-clamp）付きのボックスにふりがな注釈が挿入されると、そのボックスを潰してしまうため、影響のあるブラウザーではそうしたボックスには読みを付けず、色分けとピッチの下線だけを維持します。",
    "Dense feeds no longer leave later rows undecorated or stuck on the grey unknown-pitch underline: the per-scan collection cap and the per-page pitch lookup budget were raised so long subscription and channel feeds are covered.": "密度の高いフィードで、後方の行が未装飾のままだったり、灰色の「ピッチ不明」下線のまま止まったりしなくなりました。スキャンごとの収集上限とページごとのピッチ検索予算を引き上げ、長い登録チャンネルフィードやチャンネルページ全体をカバーします。",
    "Immersion Kit example cards now share one set of styles across the popover dictionary, the new-tab study card, the kanji-study card, and dictionary-page add-ons: the caption overlay, target-word highlight, and translation-blur rules live in a single place instead of four diverging copies, so every surface gets the same behaviour and future fixes land everywhere at once.": "Immersion Kitの例文カードのスタイルを、ポップアップ辞書・新しいタブの学習カード・漢字学習カード・辞書ページアドオンで一本化しました。キャプションのオーバーレイ、対象語のハイライト、翻訳のぼかしのルールが4か所に分散する代わりに1か所にまとまったため、どの画面でも同じ挙動になり、今後の修正もすべての画面へ同時に反映されます。",
    "The caption clamp that keeps Immersion Kit subtitles inside the picture now also applies to popover dictionary examples, whose media box has a minimum width that could exceed a narrow screenshot.": "Immersion Kitの字幕を画像の内側に収めるキャプション幅の制限が、ポップアップ辞書の例文にも適用されるようになりました。ポップアップのメディア枠には最小幅があり、幅の狭いスクリーンショットではみ出すことがありました。",
    "Immersion Kit example subtitles no longer spill past the sides of the screenshot: the sentence overlay is now capped to the painted width of the letterboxed image on the new-tab study card, and the kanji-study and in-page example frames shrink-wrap the picture so the caption anchors to the image instead of a wider invisible box.": "Immersion Kitの例文字幕がスクリーンショットの左右にはみ出さなくなりました。新しいタブの学習カードでは、レターボックス表示された画像の実際の描画幅に合わせて字幕オーバーレイの幅を制限し、漢字学習とページ内の例文フレームは画像にぴったり合わせて縮むため、キャプションが見えない広い枠ではなく画像自体に固定されます。",
    "The on-video control rail was slimmed from eight buttons to at most four (frame OCR, subtitle visibility, panel, and style): the previous/next/play-pause cluster and the fullscreen button were removed, so the rail covers far less of the video and has room for future controls.": "動画上のコントロールレールを最大8ボタンから4ボタン（フレームOCR・字幕表示・パネル・スタイル）に整理しました。前へ／次へ／再生・一時停止のクラスターと全画面ボタンを削除したため、レールが動画を覆う面積が大幅に減り、今後のコントロール追加の余地もできました。",
    "Subtitle transport (previous/next/play-pause) now lives only in the subtitle drawer, beside the Lines/Shadow/Mine/Tracks tabs, so the drawer title row shows the full track name instead of truncating it behind the buttons.": "字幕の操作（前へ／次へ／再生・一時停止）は字幕ドロワー専用になり、「行・シャドー・マイニング・トラック」タブの横に移動しました。これによりドロワーのタイトル行では、ボタンに押されて省略されていたトラック名が全幅で表示されます。",
    "While a paused-frame OCR overlay is up, a dedicated play control joins the rail just for the duration of the overlay, replacing the always-present play/pause button that existed only for that conflict.": "一時停止フレームOCRのオーバーレイ表示中は、その間だけ専用の再生ボタンがレールに追加されます。この競合のためだけに常設されていた再生・一時停止ボタンは廃止されました。",
    "Subtitle lines are now mirrored into a native track whenever the video enters native fullscreen, including via the site's own fullscreen button — previously the mirror only engaged through Yomu's rail toggle.": "動画がネイティブ全画面に入ると、サイト自身の全画面ボタン経由でも字幕行がネイティブトラックへミラーリングされるようになりました。以前はYomuのレール上のボタンから入った場合にしかミラーが働きませんでした。",
    "Fullscreen on mobile is now true fullscreen: on iPhone Safari, where the page fullscreen API does not exist, the fullscreen button and site fullscreen requests fall back to the video's native fullscreen instead of the CSS overlay mode that kept the browser bars on screen.": "モバイルの全画面表示が本当の全画面になりました。ページ全画面APIが存在しないiPhoneのSafariでは、全画面ボタンやサイトからの全画面リクエストが、ブラウザのバーが画面に残るCSSオーバーレイ方式ではなく、動画本来のネイティブ全画面にフォールバックします。",
    "While the iPhone system player is showing, Yomu mirrors the loaded subtitle lines into a native subtitle track, so the current line stays visible in native fullscreen.": "iPhoneのシステムプレーヤー表示中は、Yomuが読み込み済みの字幕行をネイティブ字幕トラックへミラーリングするため、ネイティブ全画面でも現在の行が表示され続けます。",
    "The subtitle line can now be dragged below the video frame: the drag stops at the bottom of the screen instead of at the frame edge, so letterboxed and inset players no longer trap the line inside the picture.": "字幕行を動画フレームの下までドラッグできるようになりました。ドラッグはフレームの端ではなく画面の下端で止まるため、レターボックスや小さめのプレーヤーでも字幕が映像内に閉じ込められません。",
    "Offline review caching no longer stalls at \"Cached 1\": each card's warm-up is now raced against a hard timeout, so one hung lookup (for example an unreachable AnkiConnect) can no longer freeze the whole cache queue.": "オフライン復習のキャッシュが「キャッシュ 1」で止まらなくなりました。各カードの事前読み込みにハードタイムアウトを設けたため、応答しないルックアップ（例：接続できないAnkiConnect）が1件あってもキャッシュの列全体が固まることはありません。",
    "The offline warm-up now runs a few cards in parallel and covers your full configured offline review cache limit (up to 500 cards), so a long train-ride session is ready much sooner.": "オフラインの事前読み込みは数枚のカードを並行して処理し、設定したオフライン復習キャッシュ上限（最大500枚）まで全体をカバーするようになりました。長い電車移動のセッションもずっと早く準備が整います。",
    "Cards whose warm-up fails are retried automatically after half a minute instead of being skipped for the rest of the session.": "事前読み込みに失敗したカードは、セッション中ずっとスキップされるのではなく、30秒後に自動で再試行されます。",
    "Once warming finishes, the enriched cards (including fetched pitch accents) are re-saved to the offline review cache, so they survive reloads without a network.": "事前読み込みが完了すると、取得したピッチアクセントを含む強化済みのカードがオフライン復習キャッシュに再保存され、ネットワークなしで再読み込みしても残ります。",
    "The study session's cache indicator now shows live progress as \"Cached N/M\" while warming, collapsing to \"Cached N\" once the whole session is ready for offline use.": "学習セッションのキャッシュ表示は、読み込み中は「キャッシュ N/M」として進捗をリアルタイムに示し、セッション全体がオフラインで使える状態になると「キャッシュ N」にまとまります。",
    "The new-tab study source switcher is now a proper dropdown: the status pill's cycle toggle (⇄) was replaced by a select listing Yomu, JPDB/Jiten, Bunpro, Anki, and Dictionary, with the provider colour dot on the dropdown face.": "新タブ学習の復習ソース切り替えが本格的なドロップダウンになりました。ステータスピルの循環トグル（⇄）は、よむ・JPDB/Jiten・Bunpro・Anki・辞書を一覧するセレクトに置き換わり、ドロップダウンの表面にプロバイダーのカラードットが付きます。",
    "Switching review source no longer looks like flipping between two identical Yomu modes: the dropdown always shows the source you chose, while the status pill reflects the cards actually on screen, so an empty queue falling back to practice words is visible instead of silently re-showing the same cards.": "復習ソースの切り替えが、同じ「よむ」モードを二つ往復しているように見える問題を解消しました。ドロップダウンは常に選んだソースを表示し、ステータスピルは実際に表示中のカードを反映するため、キューが空のときに練習単語へフォールバックしたことが、同じカードの再表示ではなく目に見えるようになりました。",
    "Furigana and pitch-accent decorations now render at rest on every page, including store and video tile grids (BookWalker home, hanime1, and similar catalog layouts) that previously showed decorations only while hovering a word.": "ふりがなとピッチアクセントの装飾が、すべてのページで常時表示されるようになりました。BOOK☆WALKERのトップやhanime1などのカタログ型タイルグリッドでも、これまでのようにホバー中だけ表示されることはありません。",
    "Cropped furigana never disappears or truncates: any site's clamped or clipped text row now grows just enough for its ruby line, a repair that was previously limited to YouTube and Google Search.": "ふりがなが切り取られて消えたり省略されたりしなくなりました。どのサイトでも、クランプ・クリップされたテキスト行がルビの分だけ広がります。この修復は以前はYouTubeとGoogle検索に限定されていました。",
    "Words no longer stay on a grey unknown-pitch underline until clicked: every site now gets the same paced background pitch and reading enrichment budget that YouTube used, including for keyless users.": "クリックするまで単語が灰色のピッチ不明の下線のままになることがなくなりました。キーなしのユーザーを含め、すべてのサイトがYouTubeと同じペース制御されたバックグラウンドのピッチ・読み補完バジェットを利用します。",
    "Automatic image OCR now triggers on ordinary pages with large images, such as the BookWalker storefront, which was hard-excluded before.": "大きな画像がある通常のページでも自動画像OCRが起動するようになりました。以前はハードコードで除外されていたBOOK☆WALKERのストアページも対象です。",
    "Removed the BookWalker-specific ruby suppression and scan gates in favour of generic layout guards, so store pages keep furigana while buttons and menus stay undecorated.": "BOOK☆WALKER専用のルビ抑制とスキャン制限を撤廃し、汎用のレイアウトガードに置き換えました。ストアページはふりがなを保ちつつ、ボタンやメニューは装飾されないままです。",
    "Firefox: the hosted study page no longer loses pitch accents and dictionary lookups when the userscript request bridge is dead — a bridge request that fails at the transport level (timeout or Xray failure, not a real HTTP status) now retries through the hosted proxy fetch path instead of surfacing CORS errors and empty cards.": "Firefox: ユーザースクリプトのリクエストブリッジが機能していない場合でも、ホスト版学習ページでピッチアクセントと辞書検索が失われなくなりました。トランスポートレベルで失敗した（タイムアウトやXray障害で、実際のHTTPステータスではない）ブリッジリクエストは、CORSエラーと空のカードを出す代わりに、ホスト版プロキシのfetch経路で再試行されます。",
    "Firefox: \"Not allowed to define cross-origin object as property\" console errors are fixed at the source — the companion registry is cloned into the page compartment before being published on the page window (and skipped when the clone is refused), and a bridge event payload the page compartment refuses to clone now falls back to a JSON string instead of dispatching a sandbox object that Firefox silently drops.": "Firefox: 「Not allowed to define cross-origin object as property」というコンソールエラーを根本から修正しました。コンパニオンレジストリはページのウィンドウに公開する前にページコンパートメントへクローンされ（クローンが拒否された場合はスキップ）、ページコンパートメントがクローンを拒否するブリッジイベントのペイロードは、Firefoxが黙って破棄するサンドボックスオブジェクトを送出する代わりにJSON文字列へフォールバックします。",
    "Listen and Speak study steps now appear for every review source (JPDB, Jiten, Bunpro, Anki and the local Yomu deck): pitch accent loads from the local dictionary on demand and the steps run inside the card session, so toggling the review source no longer swaps the study flow between a Kanji/Word variant and a Listen/Speak variant.": "「聞く」「話す」の学習ステップが、すべてのレビューソース（JPDB・Jiten・Bunpro・Anki・ローカルのYomuデッキ）で表示されるようになりました。ピッチアクセントは必要に応じてローカル辞書から読み込まれ、ステップはカードセッション内で実行されるため、レビューソースを切り替えても学習フローが「漢字/単語」型と「聞く/話す」型の間で入れ替わることはなくなりました。",
    "The kanji drawing prompt no longer prints the word meaning next to the blanked word, which gave away the answer to the later Word step; the meaning now sits behind the first tier of the Hint button instead.": "漢字書き取りの出題文に、伏せ字の単語の横へ単語の意味を表示しないようにしました（後の「単語」ステップの答えを先に明かしてしまうため）。意味はヒントボタンの最初の段階に移動しました。",
    "The local Yomu review queue keeps serving cards ahead of schedule once the due cards run out, so the study tab offers every mined word instead of stopping at the handful currently due.": "ローカルのYomuレビューキューは、期限到来のカードが尽きた後も予定を先取りしてカードを出し続けるようになりました。学習タブでは、現在期限が来ている数枚で止まらず、マイニングしたすべての単語を練習できます。",
    "Restored word audio for Jiten-backed kana words such as `よむ`: when the hosted audio source has no playable clip, よむ now falls back to the exact Jiten TTS word reference already attached to the rendered word, so hover autoplay and the popover speaker button play real audio.": "Jiten由来のかな単語（`よむ`など）の単語音声を復旧しました。ホスト版音声ソースに再生可能なクリップがない場合、レンダリング済み単語に付いている正確なJiten TTS単語参照へフォールバックするため、ホバー自動再生とポップオーバーのスピーカーボタンで実際の音声が鳴ります。",
    "Restored word audio for Jiten-backed kana words such as": "Jiten由来のかな単語（",
    ": when the hosted audio source has no playable clip, よむ now falls back to the exact Jiten TTS word reference already attached to the rendered word, so hover autoplay and the popover speaker button play real audio.": "など）の単語音声を復旧しました。ホスト版音声ソースに再生可能なクリップがない場合、よむはレンダリング済み単語に付いている正確なJiten TTS単語参照へフォールバックするため、ホバー自動再生とポップオーバーのスピーカーボタンで実際の音声が鳴ります。",
    "Refreshed the Cloudflare-hosted audio corpus from the local Rust audio server and uploaded the sharded R2 index, so the default hosted source now covers the full available Japanese local collection instead of only earlier seeded clips.": "Cloudflareホスト版音声コーパスをローカルのRust音声サーバーから更新し、シャード化したR2索引をアップロードしました。既定のホスト版ソースは、以前のシード済みクリップだけでなく、利用可能な日本語ローカルコレクション全体をカバーするようになりました。",
    "Clicking the headword on an unrevealed study word card now opens the word's own lookup instead of a component kanji card; per-kanji drilldown appears only after the answer is revealed.": "解答表示前の学習単語カードで見出し語をクリックすると、構成漢字のカードではなく単語自体の詳細が開くようになりました。漢字ごとの掘り下げは解答を表示した後にのみ表示されます。",
    "Tapping a \"Composed of\" kanji chip on the new-tab study reveal now switches the study card to that kanji's own step in place — the dictionary sections below swap to the kanji's details — instead of opening a lookup popover over the card.": "新タブ学習の答え表示で「構成漢字」のチップをタップすると、カードの上にルックアップのポップオーバーを開く代わりに、その場でその漢字自身の学習ステップに切り替わるようになりました。下の辞書セクションもその漢字の詳細に入れ替わります。",
    'Hovering a word in the homepage "Try me" sample now opens the dictionary popover immediately: the reader runtime previously only started loading after the pointer crossed the manga or video demo, so hovers over the sample text did nothing until then. Demo pages now boot the already-preloaded runtime as soon as the browser is idle, and hovering or touching any demo surface (including the Try me text) starts it on the spot.': 'ホームページの「Try me」サンプルの単語にカーソルを合わせると、すぐに辞書ポップオーバーが開くようになりました。これまでリーダーのランタイムは、ポインターが漫画や動画のデモを通過して初めて読み込みを開始していたため、それまでサンプルテキストへのホバーは何も起こしませんでした。デモページはブラウザがアイドルになり次第、プリロード済みのランタイムを起動し、（Try meテキストを含む）どのデモ面へのホバーやタッチでもその場で起動が始まります。',
    'The Parsing source setting now offers explicit Jiten API and JPDB API choices alongside Local dictionaries and Automatic, so you can pin one provider instead of relying on the automatic preference order. A pinned provider never silently switches to the other API; if it is unavailable the reader falls back to local parsing.': '解析ソースの設定に、ローカル辞書と自動に加えて、Jiten APIとJPDB APIを明示的に選べる選択肢が追加されました。自動の優先順位に頼らず、ひとつのプロバイダーを固定できます。固定したプロバイダーが黙って別のAPIに切り替わることはなく、利用できない場合はローカル解析にフォールバックします。',
    'When a local pitch-accent dictionary (such as Kanjium from the offline setup) is installed, background pitch enrichment now stays fully local instead of sending paced public jpdb.io lookups, so pitch colouring works offline and pages stop trickling network requests. Word popovers keep the bounded public fallback for terms the local bank misses.': 'ローカルのピッチアクセント辞書（オフラインセットアップのKanjiumなど）がインストールされている場合、バックグラウンドのピッチ補強はペース制御された公開jpdb.ioルックアップを送らず、完全にローカルで行われるようになりました。ピッチの色分けがオフラインでも機能し、ページが少しずつネットワークリクエストを流し続けることもなくなります。単語ポップオーバーでは、ローカル辞書にない語のための上限付き公開フォールバックを引き続き使用します。',
    "Japanese text that no site profile covers is now always decorated: pages with a curated parser (like YouTube) run a residual scan over any remaining visible Japanese, so surfaces such as the mobile watch page's view-count line, hashtag row, and もっと見る expander get furigana and pitch instead of staying bare.": "サイトプロファイルが対象にしていない日本語テキストも、常に装飾されるようになりました。専用パーサーを持つページ（YouTubeなど）でも、残りの可視の日本語に対して残余スキャンが実行されるため、モバイル視聴ページの再生回数の行、ハッシュタグの列、「もっと見る」の展開ボタンなどにも、無装飾のまま残らずにふりがなとピッチが付きます。",
    "The mobile YouTube watch metadata section and channel row are now scanned directly (view count, date, hashtags, description expander), not just the video title.": "モバイルYouTubeの視聴メタデータセクションとチャンネル行（再生回数・日付・ハッシュタグ・説明の展開ボタン）が、動画タイトルだけでなく直接スキャンされるようになりました。",
    "Yomu's video control rail no longer covers YouTube's own CC and settings buttons on phones and tablets: the rail measures the player's native top control row and moves below it.": "スマートフォンやタブレットで、よむの動画コントロールレールがYouTube本体の字幕（CC）ボタンや設定ボタンを覆わなくなりました。レールはプレーヤー本来の上部コントロール列の高さを測り、その下に移動します。",
    "Furigana readings no longer wrap onto two lines inside narrow menus and chips, so 標準 no longer renders its reading as stacked fragments; a reading always stays on one line.": "幅の狭いメニューやチップの中で、ふりがなの読みが2行に折り返されなくなりました。「標準」の読みが分断されて縦に積み重なることはなく、読みは常に1行に収まります。",
    "Adding furigana no longer shifts or breaks compact UI layouts: words in menus, chips, and slider labels keep the host's original line height and draw the reading above it, so the playback-speed 倍 label no longer rides onto the slider handle.": "ふりがなを追加してもコンパクトなUIレイアウトがずれたり崩れたりしなくなりました。メニュー・チップ・スライダーのラベル内の単語はホスト元の行の高さを保ち、その上に読みを描画するため、再生速度の「倍」ラベルがスライダーのつまみに重なることはなくなりました。",
    'jiten.moe search pages no longer break: a no-results parse page (for example jiten.moe/parse with an unknown word) previously treated its "Search …" page title as a dictionary headword and mounted an Immersion Kit media panel above the whole site, pushing the header and search box down the page. The title fallback now refuses page chrome, and the panel only mounts once the real vocabulary column exists.': 'jiten.moeの検索ページが崩れなくなりました。結果なしの解析ページ（未知語を指定したjiten.moe/parseなど）では、これまで「Search …」というページタイトルを辞書の見出し語として扱い、サイト全体の上にImmersion Kitのメディアパネルを取り付けてしまい、ヘッダーと検索ボックスがページの下へ押し出されていました。タイトルのフォールバックはページの装飾文字列を拒否するようになり、パネルは実際の語彙カラムが存在してからのみ取り付けられます。',
    'Dictionary-page add-ons can no longer attach to the top of the page body on any site: if no real anchor element exists yet (for example before a single-page app finishes rendering), the add-on now waits and mounts in place once the content appears.': 'どのサイトでも、辞書ページのアドオンがページ本体の最上部に取り付けられることはなくなりました。実際のアンカー要素がまだ存在しない場合（シングルページアプリの描画が終わる前など）、アドオンは待機し、コンテンツが現れてから所定の位置にマウントされます。',
    "The study page now loads the real Bunpro review queue: Bunpro serves its queue from the reviews quiz endpoint, so the previously used endpoint only returned deck settings and the page silently fell back to other sources.": "学習ページが本物のBunpro復習キューを読み込むようになりました。Bunproは復習キューをクイズ用エンドポイントから配信しているため、以前使用していたエンドポイントはデッキ設定しか返さず、ページが黙って他のソースにフォールバックしていました。",
    "Bunpro grading requests now include the same correct flag Bunpro's own quiz sends, so graded reviews advance reliably.": "Bunproの採点リクエストに、Bunpro本家のクイズが送信するのと同じcorrectフラグを含めるようになり、採点した復習が確実に進むようになりました。",
    'Tightened the homepage install-step cards so the manager step no longer wraps awkwardly and the buttons stay compact on desktop.': 'ホームページのインストール手順カードを引き締め、管理拡張のステップが不自然に折り返されず、デスクトップでもボタンがコンパクトに保たれるようにしました。',
    "Video players hosted in third-party iframes (such as the kaa.lt player) are now detected: Yomu boots inside an embedded frame as soon as a video element appears, instead of only inside YouTube frames.": "サードパーティのiframeに埋め込まれた動画プレーヤー（kaa.ltのプレーヤーなど）を検出できるようになりました。よむはYouTubeのフレームだけでなく、埋め込みフレーム内に動画要素が現れた時点で起動します。",
    "OCR now works inside embedded video frames: the subtitle rail's Read video frame (OCR) button and paused-frame capture are initialized in player iframes, where they previously did nothing.": "埋め込み動画フレーム内でもOCRが動作するようになりました。字幕レールの「動画フレームを読み取る（OCR）」ボタンと一時停止フレームのキャプチャがプレーヤーのiframe内でも初期化されます。これまでは何も起こりませんでした。",
    "The kanji drawing brush now matches the trace template's stroke width and renders smoothed curves, so mouse and Apple Pencil strokes look like the underlying glyph instead of a thin jagged line.": "\u6f22\u5b57\u624b\u66f8\u304d\u306e\u30d6\u30e9\u30b7\u304c\u306a\u305e\u308a\u30c6\u30f3\u30d7\u30ec\u30fc\u30c8\u306e\u7dda\u5e45\u306b\u5408\u308f\u305b\u3066\u6ed1\u3089\u304b\u306a\u66f2\u7dda\u3067\u63cf\u753b\u3055\u308c\u308b\u3088\u3046\u306b\u306a\u308a\u307e\u3057\u305f\u3002\u30de\u30a6\u30b9\u3084Apple Pencil\u306e\u7b46\u8de1\u304c\u7d30\u304f\u30ae\u30b6\u30ae\u30b6\u306a\u7dda\u3067\u306f\u306a\u304f\u3001\u4e0b\u5730\u306e\u5b57\u5f62\u306b\u898b\u5408\u3046\u4ed5\u4e0a\u304c\u308a\u306b\u306a\u308a\u307e\u3059\u3002",
    "Kanji stroke grading is more lenient: a correctly written character with one slightly wobbly stroke now passes instead of failing on \"check stroke shape/order\".": "\u6f22\u5b57\u30b9\u30c8\u30ed\u30fc\u30af\u63a1\u70b9\u304c\u3088\u308a\u5bdb\u5bb9\u306b\u306a\u308a\u307e\u3057\u305f\u3002\u6b63\u3057\u304f\u66f8\u3051\u3066\u3044\u3066\u30821\u753b\u304c\u5c11\u3057\u63fa\u308c\u305f\u3060\u3051\u3067\u300c\u5b57\u5f62\u30fb\u7b46\u9806\u3092\u78ba\u8a8d\u300d\u306b\u306a\u3089\u305a\u3001\u5408\u683c\u306b\u306a\u308a\u307e\u3059\u3002",
    "Advancing between kanji steps in a multi-kanji word no longer shows the previous kanji's trace: a late-loading template can no longer overwrite the active step's ghost or prompt.": "\u8907\u6570\u6f22\u5b57\u306e\u5358\u8a9e\u3067\u6f22\u5b57\u30b9\u30c6\u30c3\u30d7\u3092\u9032\u3081\u305f\u3068\u304d\u306b\u3001\u524d\u306e\u6f22\u5b57\u306e\u306a\u305e\u308a\u304c\u8868\u793a\u3055\u308c\u306a\u304f\u306a\u308a\u307e\u3057\u305f\u3002\u8aad\u307f\u8fbc\u307f\u306e\u9045\u3044\u30c6\u30f3\u30d7\u30ec\u30fc\u30c8\u304c\u73fe\u5728\u306e\u30b9\u30c6\u30c3\u30d7\u306e\u4e0b\u66f8\u304d\u3084\u30d7\u30ed\u30f3\u30d7\u30c8\u3092\u4e0a\u66f8\u304d\u3057\u307e\u305b\u3093\u3002",
    "Added balanced padding to new-tab search suggestions, so wrapped dictionary details no longer sit against the card edge.": "新タブの検索候補に上下左右そろった余白を追加しました。折り返した辞書の詳細がカードの端に張り付かなくなります。",
    "The subtitle drawer's previous/next/play cluster moved into the head's top row beside the options and close buttons, so it no longer wraps onto its own line over the transcript on narrow panels, and it now shares the same bordered button chrome as its neighbours.": "字幕ドロワーの前へ／次へ／再生ボタン群を、ヘッダー上段のオプション・閉じるボタンの横に移動しました。幅の狭いパネルでもトランスクリプトの上に折り返して独立した行になることがなくなり、隣のボタンと同じ枠線付きのボタンスタイルを共有するようになりました。",
    "Every subtitle rail button, the drawer transport, and the panel position selector now respond to hover and keyboard focus with the shared accent highlight.": "字幕レールのすべてのボタン、ドロワーの再生操作、パネルの位置セレクターが、ホバーとキーボードフォーカスに共通のアクセントハイライトで反応するようになりました。",
    "Vertical OCR text no longer spills past its highlight box: the frame now grows to the re-typeset column height, so long vertical lines stay wrapped instead of getting clipped at the overlay edge.": "縦書きのOCRテキストがハイライト枠からはみ出さなくなりました。枠が組み直された列の高さまで広がるため、長い縦の行がオーバーレイの端で切れずに枠内に収まります。",
    "Restored the compact side-panel transport controls: the drawer's previous/next/pause cluster keeps its 32px chrome on touch devices (the 42px iPad sizing applies to the on-video rail only) and now matches the rail's ‹ › pause order.": "サイドパネルのコンパクトな再生操作を復元しました。ドロワーの前へ／次へ／一時停止ボタンはタッチ端末でも32pxの見た目を保ち（42pxのiPad向けサイズは動画上のレールのみに適用）、並び順もレールと同じ「‹ › 一時停止」になりました。",
    "Paused-video OCR is now manual-first: a new Read video frame (OCR) button in the subtitle rail scans the current frame on demand, and the settings checkbox now controls automatic pause scanning, which is off by default.": "一時停止した動画のOCRは手動が基本になりました。字幕レールに追加された「動画フレームを読み取る（OCR）」ボタンで現在のフレームを必要なときに読み取れます。設定のチェックボックスは自動の一時停止スキャンを制御し、既定ではオフです。",
    "The Greasy Fork listing is findable by name: the userscript description now leads with \"Yomu (よむ)\" and names its features (popup dictionary, furigana, pitch accent, manga OCR, video subtitles, Anki/JPDB/Jiten mining) so a search for \"yomu\" surfaces it, instead of the bare \"Japanese reader.\" that matched nothing.": "Greasy Forkのリストが名前で見つかるようになりました。ユーザースクリプトの説明が「Yomu (よむ)」で始まり、主な機能（ポップアップ辞書、ふりがな、ピッチアクセント、漫画のOCR、動画の字幕、Anki/JPDB/Jitenへのマイニング）を明記するようになったため、「yomu」で検索すると表示されます。これまでは何にも一致しない素っ気ない「Japanese reader.」でした。",
    "New-tab accent text now follows custom theme colors. The Search button, active source chips, and selected browser controls no longer fall back to the default green readable-accent token when the userscript theme is set to another color, such as red.": "新タブのアクセント文字色が、カスタムテーマ色に従うようになりました。Searchボタン、アクティブなソースチップ、選択中のブラウザー操作が、ユーザースクリプトのテーマを赤など別の色に設定しているときに既定の緑の読みやすいアクセントトークンへ戻ることはありません。",
    "Added hover, focus, active, and reduced-motion-aware transition coverage across Yomu's popover, settings, new-tab, subtitle, YouTube-filter, and gaming overlay controls, including details summaries and large study-card hit targets that previously felt static.": "よむのポップアップ、設定、新しいタブ、字幕、YouTubeフィルター、Gamingオーバーレイの操作部に、ホバー、フォーカス、押下状態と、動きを抑える設定に対応したトランジションを追加しました。これまで静的に見えていた詳細サマリーや大きな学習カードのヒット対象も含みます。",
    "The study page's Previous word and Continue controls now split the navigation row 50/50 during two-button study steps instead of leaving an empty third column.": "学習ページで2ボタンの学習ステップを表示している間、「前の単語」と「続ける」の操作がナビゲーション行を50/50で分け合うようになりました。空の3列目が残ることはありません。",
    "Study, Search, and Stats now divide the new-tab mode switcher evenly on desktop, mobile, first paint, and the Stats page, removing the invisible extra grid columns that left the tabs looking lopsided.": "Study、Search、Stats が、デスクトップ・モバイル・初回表示・Statsページの新タブモード切り替え内で均等に並ぶようになりました。タブを不揃いに見せていた見えない余分なグリッド列を削除しました。",
    "Grading no longer re-fetches the whole provider queue after every single card: the study page now refreshes when the local pool runs low, every ten grades, or after a minute — a 500-due jpdb/Jiten session previously meant ~500 full-queue API round-trips with the cache invalidated each time, the same request-storm class that once overloaded jiten.moe.": "評価のたびにプロバイダーのキュー全体を再取得しなくなりました。学習ページは、ローカルのプールが少なくなったとき、10回評価するごと、または1分経過後にのみ更新されます。これまでは500枚のjpdb/Jitenセッションで約500回ものキュー全体のAPI取得が発生し、そのたびにキャッシュも無効化されていました。これはかつてjiten.moeに負荷をかけたのと同じ種類のリクエスト集中です。",
    "Keyless installs can start studying for real: the built-in starter cards (labeled \"Yomu\") now offer grade buttons that record into the local Yomu SRS — the deck is created on the first grade, so reviews begin from the starter carousel instead of only after mining words from pages.": "APIキーなしのインストールでも本当に学習を始められるようになりました。内蔵のスターターカード（「Yomu」表示）に評価ボタンが付き、ローカルのYomu SRSに記録されます。最初の評価でデッキが作成されるため、ページから単語をマイニングしなくても、スターターカルーセルからレビューを始められます。",
    "The study personas smoke gained a keyless-grading scenario that reveals a starter card, grades it, and asserts the local deck recorded the review on the real built study page.": "学習ペルソナスモークに、キーなしでの評価シナリオを追加しました。実際にビルドされた学習ページでスターターカードを表示して評価し、ローカルデッキにレビューが記録されることを検証します。",
    "The YouTube ruby-coverage proof records video only outside CI: the recording needs Playwright's downloaded ffmpeg, which the channel-Chrome runners don't have — this was the remaining red step in the 1.6.42 CI and Release runs (verified passing in CI mode locally).": "YouTubeのルビ網羅プルーフは、CI以外でのみ動画を記録するようになりました。録画にはPlaywrightがダウンロードするffmpegが必要で、チャネルChromeのランナーには存在しないためです。これが1.6.42のCIとReleaseで残っていた失敗ステップでした（ローカルのCIモードで成功を確認済み）。",
    "Made the donation/support banners quieter: new users get their first eligible visits banner-free, later impressions are sampled by visit cadence, shown banners cool down for two weeks, and manual dismissal hides the banner for a month.": "寄付／サポートバナーの表示頻度を控えめにしました。新規ユーザーの最初の対象訪問では表示せず、その後も訪問回数に応じて間引き、表示後は2週間、手動で閉じた場合は1か月非表示にします。",
    "Playlists are annotated: the watch-page queue panel, /playlist rows and their legacy header, and search-page channel cards (name plus description) are all scanned, with furigana room in their clamped titles — 1.6.40 underlined the 再生リスト tab while everything behind the click stayed bare.": "再生リストに注釈が付くようになりました。視聴ページのキューパネル、/playlistの行とその旧型ヘッダー、検索ページのチャンネルカード（名前と説明）がすべてスキャンされ、高さ制限されたタイトルにはふりがな用の余白が確保されます。1.6.40では「再生リスト」タブに下線が付いたのに、その先のページは何も注釈されていませんでした。",
    "Search-result description snippets no longer clip furigana: .metadata-snippet-text joined the ruby-room whitelist alongside the playlist and channel-card rows.": "検索結果の説明スニペットでふりがなが欠けなくなりました。.metadata-snippet-textが、再生リストやチャンネルカードの行とともにルビ余白の対象に加わりました。",
    "The YouTube ruby-coverage proof gained a desktop-playlist page plus queue-panel and channel-card fixtures, pinning the new coverage in real Chromium.": "YouTubeのルビ網羅プルーフに、デスクトップの再生リストページとキューパネル・チャンネルカードのフィクスチャを追加し、新しいカバレッジを実際のChromiumで検証するようにしました。",
    "The feed-title recycler smoke serves its synthetic youtube.com via route interception instead of a loopback HTTP server: system Chrome's HSTS preload force-upgrades www.youtube.com to https, which failed the 1.6.41 CI and Release runs on their first execution of the new gate (verified green on both bundled Chromium and channel Chrome).": "フィードタイトルのリサイクラースモークは、ループバックHTTPサーバーの代わりにルートインターセプトで合成youtube.comを配信するようになりました。システムChromeのHSTSプリロードがwww.youtube.comをhttpsに強制昇格させるため、新しいゲートの初回実行となった1.6.41のCIとReleaseが失敗していました（バンドル版ChromiumとチャネルChromeの両方で成功を確認済み）。",
    "Swiping a study card no longer submits a grade while the answer is hidden: swipe reviews obey the same gate as the grade buttons and shortcuts (final-reveal step, answer revealed), so a drag mid Kanji/Recall/Listen step can't silently mark a card \"okay\" on your SRS provider.": "学習カードのスワイプは、答えが隠れている間は評価を送信しなくなりました。スワイプによるレビューは評価ボタンやショートカットと同じ条件（最終表示ステップで答えを表示済み）に従うため、漢字・リコール・リスニングのステップ中のドラッグでカードが勝手に「OK」と採点されることはありません。",
    "Pressing A while a lookup popover is open now replays the word audio instead of seeking the subtitle: the subtitle shortcuts yield to the reader while a lookup is on screen (Play audio and Previous subtitle both default to A), and a/d subtitle seeking is unchanged when no popover is open.": "ルックアップのポップオーバーが開いている間にAキーを押すと、字幕の移動ではなく単語の音声を再生するようになりました。ルックアップ表示中は字幕ショートカットがリーダーに譲ります（「音声を再生」と「前の字幕」はどちらもデフォルトがA）。ポップオーバーが開いていないときのa/dによる字幕移動は変わりません。",
    "Removed the dead \"Image highlight background\" color picker from settings: the OCR highlight background is derived from the accent color, so the picker's choice was silently discarded — the control lied.": "設定から機能していなかった「画像ハイライト背景」のカラーピッカーを削除しました。OCRのハイライト背景はアクセントカラーから導出されるため、選んだ色は黙って破棄されていました。",
    "CI and the release gate now run the three hermetic regression smokes (study-flow stability, YouTube feed-title recycler, YouTube ruby coverage), so their changelog guard claims are enforced, not aspirational; the smokes now honor the CI browser channel.": "CIとリリースゲートで、3つの密閉型リグレッションスモーク（学習フロー安定性・YouTubeフィードタイトルのリサイクラー・YouTubeルビ網羅）を実行するようになりました。チェンジログの「ガード」の記載が実際に強制されます。スモークはCIのブラウザチャネルも尊重するようになりました。",
    "YouTube channel pages are now annotated end to end: the tab strip (ホーム/動画/ショートなど), shelf headings like 人気の動画, the channel header with its description preview (さらに表示), and legacy grid cards are all scanned — and the guide rail no longer needs a watch page to get furigana and pitch.": "YouTubeのチャンネルページ全体に注釈が付くようになりました。タブ列（ホーム/動画/ショートなど）、「人気の動画」のような棚見出し、説明プレビュー（さらに表示）を含むチャンネルヘッダー、旧型のグリッドカードまでスキャンされます。ガイドレールも、視聴ページを開かなくてもふりがなとピッチが付くようになりました。",
    "Words in the channel tab strip keep their pitch underline at rest: the bare-until-hover chrome rule now carves out yt-tab-shape the same way it does chips, the guide, and the watch action row.": "チャンネルのタブ列の単語は、通常時もピッチ下線を保つようになりました。ホバーまで装飾を消すクローム用ルールが、チップ・ガイド・視聴ページのアクション行と同じようにyt-tab-shapeを除外対象にしました。",
    "Cropped channel-page rows no longer clip furigana: clamped grid titles, 10万回視聴 metadata lines, and the channel description preview reserve ruby room like the watch title does.": "チャンネルページの切り詰められた行でふりがなが欠けなくなりました。高さ制限されたグリッドのタイトル、「10万回視聴」のようなメタデータ行、チャンネル説明のプレビューが、視聴ページのタイトルと同様にルビの余白を確保します。",
    "The YouTube ruby-coverage proof gained a desktop-channel page that pins all of the above (scan coverage, at-rest underlines, ruby room) against the built stylesheet in real Chromium.": "YouTubeのルビ網羅プルーフにデスクトップのチャンネルページを追加し、上記のすべて（スキャン範囲・通常時の下線・ルビの余白）を、ビルド済みスタイルシートに対して実際のChromiumで検証するようにしました。",
    'Shortened the hosted homepage action pills to "Guide" and "Game" so the first row stays readable and consistent on iPad.': "ホスト版ホームページのアクションピルを「Guide」と「Game」に短縮し、iPadでも最初の行が読みやすく揃って見えるようにしました。",
    'Made the subtitle rail and drawer playback controls visibly larger on iPad and other touch screens, while keeping the controls aligned with the rest of the drawer chrome.': "iPadなどのタッチ画面で、字幕レールとドロワーの再生コントロールを見た目にも大きくしつつ、ドロワー内の他の操作部品と揃うようにしました。",
    "The study session's step chips are pinned per card: late pitch and sentence enrichment no longer reshapes an on-screen review (four chips silently became six and Recall vanished mid-session).": "学習セッションのステップチップはカードごとに固定されるようになりました。ピッチや例文の遅延取得によって、表示中のレビューの構成が変わることはもうありません(4つのチップが突然6つになり、リコールが消えていました)。",
    "The Kanji 2 chip drills the word's second kanji inside the same session — it previously jumped to the kanji queue's synthetic card and the second doodle never appeared.": "「漢字 2」チップは同じセッション内で単語の2文字目を練習するようになりました。以前は漢字キューの合成カードに飛んでしまい、2文字目の書き取りが表示されませんでした。",
    "The kanji draw prompt blanks every kanji in the word: 図鑑's first step showed ＿鑑, handing the answer to the second draw step.": "漢字書き取りの出題では、単語内のすべての漢字を空欄にするようになりました。図鑑の1文字目のステップで「＿鑑」と表示され、2文字目の答えを見せてしまっていました。",
    "One source switcher: while a card is shown the status pill's ⇄ toggle cycles every source and the select no longer stacks under it — the duplicate control is gone (the select still serves the card-less empty state).": "ソース切り替えは1つだけになりました。カード表示中はステータスピルの⇄トグルがすべてのソースを順番に切り替え、その下にセレクトが重なることはなくなりました(カードがない空の状態ではこれまで通りセレクトを使います)。",
    "A new study-flow stability smoke pins all four behaviours against the real built study page.": "新しい学習フロー安定性スモークが、実際にビルドされた学習ページに対してこれら4つの挙動を検証します。",
    "Internal: the pure lookup, nested-parse, and pitch-enrichment helper functions at the tail of the reader's main module moved into their own main-lookup-helpers module — no behaviour change, just a smaller main file and a testable home for the helpers.": "内部変更: リーダーのメインモジュール末尾にあった検索・ネスト解析・ピッチ強化の純粋ヘルパー関数群を、専用のmain-lookup-helpersモジュールに移動しました。動作の変更はなく、メインファイルが小さくなり、ヘルパーがテストしやすい場所に収まりました。",
    "The getting-started guide now describes the real first-run welcome panel (quick setup plus the two choice buttons), points manga readers at the BookWalker/mokuro guide, and spells out what a mined Anki card carries; the features page documents that YouTube's Subscribe and Join buttons are intentionally left un-annotated to avoid re-render flicker.": "スタートガイドが、実際の初回起動時のウェルカムパネル（クイック設定と2つの選択ボタン）を説明するようになりました。漫画の読者にはBookWalker/mokuroガイドへの案内を追加し、マイニングしたAnkiカードに何が保存されるかを明記しました。機能ページには、YouTubeのチャンネル登録・メンバーになるボタンを再描画のちらつき防止のため意図的に注釈しないことを記載しました。",
    "Hardening: the two remaining unguarded document.elementFromPoint call sites use optional calls, matching their already-guarded siblings.": "堅牢化: 残っていた2箇所の未ガードのdocument.elementFromPoint呼び出しを、既にガード済みの同種の呼び出しに合わせてオプショナル呼び出しにしました。",
    "Canvas page identity has a single home: the OCR controller's per-canvas content-identity helpers moved into a dedicated canvas-page-identity module with an eleven-test invariant suite covering paged, continuous-scroll, and node-reuse modes — a refactor and test hardening of the shipped BookWalker fix, with surface tokens now consistently excluded from real-content comparisons.": "キャンバスのページ識別のロジックを一箇所に集約しました。OCRコントローラーのキャンバスごとのコンテンツ識別ヘルパーを専用のcanvas-page-identityモジュールに移動し、ページ送り・連続スクロール・ノード再利用の各モードを網羅する11件の不変条件テストを追加しました。出荷済みのBookWalker修正のリファクタリングとテスト強化であり、サーフェストークンは実コンテンツ比較から一貫して除外されるようになりました。",
    "Offline keyless first paint no longer waits for a doomed public-Jiten parse round-trip: with no API keys and no local dictionaries, parsing goes straight to segmentation when the browser reports itself offline, and still prefers Jiten's dictionary-correct word boundaries when online.": "APIキーなしのオフライン初回描画で、失敗が確定している公開Jiten解析の往復を待たなくなりました。APIキーもローカル辞書もない状態でブラウザがオフラインを報告している場合、解析はただちに分かち書きに進みます。オンラインの場合はこれまで通り、Jitenの辞書に基づく正確な語境界を優先します。",
    "The onboarding welcome now matches the documented recommendation: Use without API key is the emphasised first button, with Add API key beside it.": "オンボーディングのようこそ画面が、ドキュメントで推奨している選択肢と一致するようになりました。「APIキーなしで使う」が強調された最初のボタンになり、その横に「APIキーを追加」が並びます。",
    "The hover shortcut placeholder is short enough for the onboarding grid column, so it no longer clips on desktop.": "ホバーショートカットのプレースホルダーをオンボーディングのグリッド列に収まる短い文言にし、デスクトップで見切れないようにしました。",
    "The hosted audio worker's v2 sharded-index source is now committed to the repository: production has served shard lookups (index/v2/shards) since 2026-07-02, but the source only existed in the deployed Cloudflare version, so any redeploy from the repo would have silently reverted audio.yomureader.com to the legacy seed manifest.": "ホスト版音声ワーカーのv2シャード索引のソースコードがリポジトリにコミットされました。本番環境は2026年7月2日からシャード検索（index/v2/shards）を提供していましたが、そのソースはデプロイ済みのCloudflareバージョンにしか存在せず、リポジトリから再デプロイするとaudio.yomureader.comが旧来のシードマニフェストに黙って戻ってしまう状態でした。",
    "The audio export script gained a --full mode that streams the local Yomitan audio database into the v2 shard index (with per-file existence verification and generated rclone/aws upload plans), and the worker README documents the three serving modes.": "音声エクスポートスクリプトに--fullモードが追加され、ローカルのYomitan音声データベースをv2シャード索引にストリーム変換します（ファイル存在確認と、rclone/aws用アップロード計画の生成付き）。ワーカーのREADMEには3つの提供モードを記載しました。",
    "The transcript drawer's play/pause and previous/next buttons meet the 44px touch floor on phones: they get the same hit-slop as the on-video rail, and the mobile smoke now measures every drawer-head control so a new control cannot ship under-sized again.": "スマートフォンで、文字起こしドロワーの再生・一時停止ボタンと前へ・次へボタンが44pxのタッチ基準を満たすようになりました。動画上のコントロールバーと同じヒット領域の拡張が適用され、モバイルのスモークテストがドロワーヘッダーの全コントロールを計測するため、新しいコントロールが小さすぎるまま出荷されることはもうありません。",
    "Modifier hover mode always has a modifier: settings payloads with popupActivationMode 'modifier' but no stored hover shortcut now backfill the legacy scan modifier (or Shift) instead of firing hover lookups with no key held.": "修飾キーモードには必ず修飾キーが設定されるようになりました。popupActivationModeが「modifier」なのにホバーショートカットが保存されていない設定データは、キーを押さなくてもホバー検索が発動してしまう代わりに、旧来のスキャン修飾キー（なければShift）で補完されます。",
    "New regression guards: legacy furigana migrations (hideKnownFurigana/showFurigana), the subtitleControlsMode sanitizer, and a foreign-script anomaly gate that fails if Hangul or Cyrillic ever leaks into localized copy.": "新しいリグレッションガードを追加しました。旧来のふりがな設定の移行（hideKnownFurigana/showFurigana）、subtitleControlsModeのサニタイザー、そしてローカライズ済みコピーにハングルやキリル文字が混入した場合に失敗する異種文字ゲートです。",
    "Scrolling the YouTube feed no longer re-parses every annotated title: silent auto-scans skip hosts whose mirror already renders the same text and defer the document-wide ruby sweep, cutting scroll-stress main-thread blocking from seconds to a single sub-100ms task.": "YouTubeフィードのスクロールで、注釈済みのタイトルを毎回解析し直さなくなりました。サイレント自動スキャンは、ミラーが同じテキストを既に描画しているホストをスキップし、文書全体のルビ調整も遅延実行します。スクロール負荷時のメインスレッドのブロックが数秒から100ミリ秒未満のタスク1回に減りました。",
    "The watch page's action row and description expander are scanned reliably, and pitch underlines stay visible at rest across the watch metadata, masthead, and guide — the subscribe and join buttons stay unannotated deliberately, since re-rendering them fought YouTube's own updates.": "視聴ページのアクション行と概要の「もっと見る」が確実にスキャンされるようになり、視聴メタデータ、マストヘッド、ガイドでもピッチの下線が常時表示されます。チャンネル登録とメンバーになるボタンは意図的に注釈しません。再描画がYouTube自身の更新と競合するためです。",
    "Internal: the subtitle drawer-head helpers are module-private again, clearing the dead-export findings that turned CI red on 1.6.30.": "内部変更: 字幕ドロワーヘッダーのヘルパーをモジュール内専用に戻し、1.6.30でCIを赤にした未使用エクスポートの検出を解消しました。",
    "The subtitle drawer head is two rows: the placement options and close button sit beside the title, and the tabs row regained the previous/next cluster plus a new play/pause button — line-by-line review happens in the drawer, so its transport controls live there again.": "字幕ドロワーのヘッダーが2段になりました。配置オプションと閉じるボタンはタイトルの横に移動し、タブの段には「前へ・次へ」ボタンが戻り、新たに再生・一時停止ボタンが加わりました。行ごとの復習はこのドロワーで行うため、再生操作も再びここに置いています。",
    "Remediation for 1.6.28, which was tagged with two style unit tests still asserting the old bare-until-hover selector: the tests now assert the chip and engagement-panel carve-out. No product changes beyond 1.6.28.": "1.6.28の是正リリースです。1.6.28は、旧来のホバーまで非表示セレクターを検証したままの2つのスタイルユニットテストと共にタグ付けされていました。テストはチップとエンゲージメントパネルの除外を検証するようになりました。1.6.28以降の製品変更はありません。",
    "YouTube's feed filter chips and engagement panels (description, transcript, the ask-AI panel) keep their pitch underlines visible at rest instead of hiding them until hover, and the ask-AI panel's centered heading now gets furigana like the panel body.": "YouTubeのフィードのフィルターチップとエンゲージメントパネル（概要、文字起こし、AIに質問パネル）では、ピッチの下線がホバーまで隠れず常時表示されるようになりました。また、AIに質問パネルの中央揃えの見出しにも、本文と同様にふりがなが付きます。",
    "Subtitle words whose pitch has not resolved show the same neutral grey underline as the reader instead of rendering bare next to coloured neighbours.": "ピッチが未解決の字幕の単語は、色付きの隣の単語の横で裸のまま表示されず、リーダーと同じニュートラルなグレーの下線が表示されるようになりました。",
    "Local pitch lookups now match katakana surfaces against hiragana dictionary readings, retry kana-keyed rows by reading, and accept a bank's single stored reading when the parsed one disagrees — resolving pitch for words that silently dropped before.": "ローカルのピッチ検索が、カタカナ表記をひらがなの辞書読みと照合し、かなキーの行を読みで再検索し、解析された読みが一致しない場合も辞書に登録された読みが1つだけならそれを受け入れるようになりました。これまで黙って落ちていた語のピッチが解決されます。",
    "Keyless YouTube feed words outside the local pitch dictionary get pitch from the paced public lane again within the existing page budgets, so titles no longer render a wall of uniform grey.": "APIキーなしのYouTubeで、ローカルのピッチ辞書にない単語は、既存のページ予算内でペース制御された公開レーンから再びピッチを取得します。タイトルが一様なグレー一色にならなくなりました。",
    "Furigana lines no longer crowd the previous line on tight layouts like YouTube titles.": "YouTubeのタイトルのような行間の狭いレイアウトで、ふりがなの行が前の行に密着しなくなりました。",
    "The video pause pill sticks: a competing play() is re-paused for a short window, pause/play/seek route through YouTube's own player API when available, subtitle seek shortcuts run in capture phase so the site cannot swallow them, and the control rail's first paint lands in the right place instead of correcting a frame later.": "動画の一時停止ボタンが確実に効くようになりました。競合するplay()は短い時間内なら再度一時停止され、一時停止・再生・シークは可能な場合YouTube自身のプレイヤーAPIを経由し、字幕シークのショートカットはキャプチャ段階で処理されるためサイト側に奪われず、コントロールバーの初回描画は1フレーム後に修正されることなく正しい位置に表示されます。",
    "The performance profiler measures the local dictionary path end to end instead of reporting the local popover metric as always-null.": "パフォーマンスプロファイラーがローカル辞書経路を端から端まで計測するようになり、ローカルのポップオーバー指標が常にnullと報告されることがなくなりました。",
    "The Recall step's answer box is visible again on the hosted study page: the inline first-paint stylesheet carried a stale copy of the answer-hiding rule without the kanji and recall exceptions and clobbered them, leaving the typed input at opacity zero.": "ホスト版学習ページでリコールステップの回答欄が再び表示されるようになりました。初回描画用のインラインスタイルシートに、漢字とリコールの例外を持たない古い回答非表示ルールが残っており、正しいルールを上書きして入力欄を不透明度ゼロのままにしていました。",
    "The docs' study screenshots are captured from the real study page by one hardened script that asserts the answer input is actually opaque, replacing the jsdom skeleton renderer that had been misrepresenting the shipped layout.": "ドキュメントの学習スクリーンショットは、実際の学習ページから1つの堅牢なスクリプトで撮影されるようになりました。回答入力欄が実際に不透明であることを検証するため、この種の退行は撮影段階で失敗します。出荷済みのレイアウトを誤って伝えていたjsdomスケルトンレンダラーは廃止しました。",
    "The first-run welcome grew a sixth Game feature card and clearer defaults: page scanning and image OCR are now three-way choices, with hover-lookup and manual-scan shortcut fields alongside the existing offline dictionary download.": "初回のようこそ画面に6枚目の機能カード「ゲーム」が加わり、初期設定も分かりやすくなりました。ページスキャンと画像OCRスキャンは3択になり、ホバー検索と手動スキャンのショートカット入力欄が、従来のオフライン辞書ダウンロードと並んで表示されます。",
    "Clicking a highlighted word inside the welcome panel's action buttons now presses the button instead of opening a dictionary popover over it.": "ようこそ画面のアクションボタン内のハイライトされた単語をクリックしたとき、辞書ポップオーバーを開かずにボタンが押されるようになりました。",
    "The performance profiler seeds its local dictionary database at the real store version and full schema again (read from the store source with a drift guard), so it measures the local parse path instead of silently falling back to the network.": "パフォーマンスプロファイラーがローカル辞書データベースを実際のストアバージョンと完全なスキーマで再びシードするようになりました（ストアのソースから読み取り、ドリフトガード付き）。ネットワークへ静かにフォールバックせず、ローカル解析経路を計測します。",
    "Factory reset now derives its key list solely from the managed-state registry: the two legacy hand-maintained enumerations are gone (net minus thirty lines), with the registry proven a strict superset before deletion and the unregistered-key warning kept as the safety net.": "ファクトリーリセットは、キー一覧をマネージド状態レジストリのみから導出するようになりました。手作業で管理していた2つのレガシー列挙は削除され（正味30行減）、削除前にレジストリが厳密なスーパーセットであることを検証し、未登録キーの警告はセーフティネットとして残しています。",
    "Touch targets across the reader now meet the 44px accessibility floor on phones and tablets: the study grade buttons (previously occluded to an effective 41px), every reader button on touch surfaces (a base style with !important had been silently defeating the responsive sizing, leaving onboarding CTAs at 38px), and the subtitle drawer close button (36px). Verified across iPhone, small-Android, and iPad viewports under 6x CPU throttling.": "リーダー全体のタッチターゲットが、スマートフォンとタブレットで44pxのアクセシビリティ基準を満たすようになりました。学習の評価ボタン（実効41pxまで隠れていました）、タッチ環境のすべてのリーダーボタン（!important付きの基本スタイルがレスポンシブなサイズ指定を静かに打ち消し、オンボーディングのCTAが38pxのままでした）、字幕ドロワーの閉じるボタン（36px）が対象です。iPhone・小型Android・iPadの各ビューポートで、6倍のCPUスロットリング下で検証済みです。",
    "Refreshed the documentation to match the shipped product: the study page docs and screenshots now show the real seven-step flow with the cloze recall, hints, and pitch question; a new extension section in Getting Started covers installing the Chrome and Firefox packages with the toolbar popup pictured; and the footer no longer claims store packages are \"being prepared\".": "ドキュメントを出荷済みの製品に合わせて刷新しました。学習ページの説明とスクリーンショットは、穴埋めリコール、ヒント、ピッチ質問を含む実際の7ステップフローを示すようになりました。Getting StartedにはChrome/Firefoxパッケージのインストールを扱う拡張機能セクションがツールバーポップアップの画像付きで加わり、フッターはストアパッケージを「準備中」と表記しなくなりました。",
    "Factory reset now clears every store the reader writes, driven by a central managed-state registry: an invariant test seeds all 44 registered stores plus any future yomu-prefixed keys and fails if anything survives, and debounced writers (pitch progress, the OCR cache) are suppressed during reset so they cannot re-create keys they just cleared.": "ファクトリーリセットは、中央のマネージド状態レジストリに基づき、リーダーが書き込むすべてのストアを消去するようになりました。不変条件テストが登録済みの44ストアと将来のyomuプレフィックスキーをすべてシードし、何かが残れば失敗します。また、デバウンスされた書き込み（ピッチ進捗、OCRキャッシュ）はリセット中に抑制され、消去したばかりのキーを再作成できません。",
    "The kanji drawing step always fronts the word meaning with a blanked cloze (\"drink - one kanji blanked\"), so an ambiguous blank never leaves you guessing which word you are drawing, and a keyword that would just repeat that meaning no longer renders below it.": "漢字書き取りステップは、常に単語の意味と空欄付きクローズを前面に表示するようになりました。曖昧な空欄でどの単語を書くのか迷うことがなくなり、その意味を繰り返すだけのキーワードは下に表示されなくなりました。",
    "Progressive hints on the ambiguous study steps: kanji drawing and typed recall gain a Hint control that reveals one tier at a time (meaning, then a kana cue) without giving the answer away before the reveal, which notes how many hints you used.": "曖昧になりやすい学習ステップに段階的なヒントを追加しました。漢字書き取りと入力式リコールにHintボタンが付き、一度に一段階ずつ（意味、次にかなの手がかり）を明かします。答え表示の前に答えを見せることはなく、答え表示では使ったヒント数が示されます。",
    "The listen step pitch-accent check now shows the word and asks which pitch you heard above the contour choices, your pick is remembered while you move between steps, and the speaking step is labeled as shadowing with its scoring intact.": "リスニングステップのピッチアクセント確認は、輪郭の選択肢の上に単語とどのピッチが聞こえたかの質問を表示するようになりました。選択はステップ間を移動しても記憶され、発話ステップはスコアリングを保ったままシャドーイングとして表記されます。",
    "Every study step visibility condition is spelled out in its settings help, so it is clear why a step is present or absent for a given card.": "すべての学習ステップの表示条件が設定のヘルプに明記され、あるカードでステップが表示される・されない理由が分かるようになりました。",
    "Registered the study-flow screenshot harnesses with the dead-code gate, which had been failing CI since the study enrichment landed.": "学習フローのスクリーンショットハーネスをデッドコードゲートに登録しました。学習フロー強化の反映以降、これがCIを失敗させていました。",
    'The Yomu Gaming gamepad poller now stops when the capture overlay is dismissed and resumes when it reopens; the hidden-and-reused overlay window previously kept polling every frame, wasting battery on handhelds.': 'Yomu Gamingのゲームパッドポーリングは、キャプチャオーバーレイを閉じると停止し、再び開くと再開するようになりました。非表示で再利用されるオーバーレイウィンドウが毎フレームのポーリングを続け、携帯機のバッテリーを浪費していました。',
    'The homepage donation bar now shows a live goal computed from the real monthly operating costs (with a 10 GBP floor), converts it to your local currency, tracks month-to-date progress across providers, and offers Ko-fi, Buy Me a Coffee, PayPal, and Patreon alongside the card checkout. Provider buttons appear as each account goes live.': 'ホームページの寄付バーは、実際の月間運用コストから算出した目標（下限10ポンド）を表示し、現地通貨に換算し、プロバイダー横断の当月進捗を追跡し、カード決済に加えてKo-fi、Buy Me a Coffee、PayPal、Patreonを提供するようになりました。各アカウントが有効になるとプロバイダーのボタンが表示されます。',
    'Yomu Gaming is now playable with a controller: the capture overlay gains gamepad navigation (d-pad or stick moves between recognized words, A opens the full in-overlay dictionary popover, B backs out, Y re-captures), shows Steam Deck-specific guidance when it detects one, and ships a manual Steam Deck test checklist.': 'Yomu Gamingがコントローラーで操作できるようになりました。キャプチャオーバーレイにゲームパッド操作（十字キーまたはスティックで認識済みの単語間を移動、Aでオーバーレイ内の完全な辞書ポップオーバーを開く、Bで戻る、Yで再キャプチャ）が加わり、Steam Deckを検出するとDeck向けの案内を表示し、手動のSteam Deckテストチェックリストが付属します。',
    'An extension boot smoke (npm run smoke:extension-boot) drives the freshly packaged Chrome extension in a real browser: service worker, content-script reader boot, first-run onboarding, scanning, popover, popup, and new tab must all pass with zero console errors.': '拡張機能起動スモーク（npm run smoke:extension-boot）は、パッケージしたばかりのChrome拡張機能を実ブラウザで動かします。Service Worker、コンテンツスクリプトのリーダー起動、初回オンボーディング、スキャン、ポップオーバー、ポップアップ、新しいタブのすべてがコンソールエラーゼロで通らなければなりません。',
    'The browser extension now works end to end: the reader crashed at startup because the extension GM shim returns its CSS resource as a promise where userscript managers return a string, so no page ever scanned. First-run onboarding now also shows in the extension, and the extension pages carry no inline scripts, which manifest v3 forbids.': 'ブラウザ拡張機能が最初から最後まで動作するようになりました。拡張機能のGMシムはCSSリソースをPromiseで返すのに対し、ユーザースクリプトマネージャーは文字列を返すため、リーダーが起動時にクラッシュしてどのページもスキャンされませんでした。初回オンボーディングも拡張機能で表示されるようになり、拡張機能のページはManifest V3が禁止するインラインスクリプトを含みません。',
    'The extension action popup is a real popup — open Study, open settings on the current page, and documentation — instead of the compiler\'s developer stub.': '拡張機能のアクションポップアップが、コンパイラの開発用スタブではなく、本物のポップアップ（Studyを開く、現在のページで設定を開く、ドキュメント）になりました。',
    'The keyless kanji drawing step now shows a word-with-blank prompt instead of the "No kanji keyword found." error heading, the step chips read Kanji 1 and Kanji 2 instead of printing the answer glyph, and the drawing grid is sized to sit under its prompt.': 'キーなしの漢字書き取りステップは、「No kanji keyword found.」というエラー見出しの代わりに空欄付きの単語プロンプトを表示するようになりました。ステップのチップは答えの字を印字せずKanji 1・Kanji 2と表示し、書き取りグリッドはプロンプトの下に収まるサイズになりました。',
    'The typed recall step appears whenever a card carries an example sentence: availability was accidentally tied to the separate front-sentence display toggle, so recall almost never ran. Each study step\'s visibility condition is now stated in its settings help.': '入力式のリコールステップは、カードに例文があれば表示されるようになりました。表示可否が別の「表面に例文を表示」トグルに誤って結び付いていたため、リコールはほとんど実行されていませんでした。各学習ステップの表示条件は設定のヘルプに明記されました。',
    'Keyless study no longer offers both Yomu and Dictionary as review sources for the same starter deck, and starter cards report Yomu as their source.': 'キーなしの学習で、同じスターターデッキに対してYomuとDictionaryの両方を復習ソースとして提示することがなくなり、スターターカードのソースはYomuと表示されます。',
    'Keyless word audio no longer fires a doomed direct request to languagepod101 before trying the working proxy path, removing the console errors and broken playback on hosted pages.': 'キーなしの単語音声が、機能するプロキシ経路を試す前にlanguagepod101へ失敗確定の直接リクエストを送ることがなくなり、ホストページでのコンソールエラーと再生不良が解消しました。',
    'Restored the subtitle panel\'s "open by default" behavior that 1.6.15 broke: the cross-tab leak fix removed the load-time trigger entirely, so the drawer never auto-opened for users who keep it visible. The persisted preference now applies once per page from the track-load path, a manual close still sticks, and opening still never writes the setting back.': '1.6.15で壊れた字幕パネルの「既定で開く」動作を復旧しました。タブ間リーク修正が読み込み時のトリガーごと取り除いたため、パネルを表示したままにしているユーザーでもドロワーが自動で開かなくなっていました。保存済みの設定はトラック読み込み時にページごとに一度だけ適用され、手動で閉じた状態は維持され、開いても設定が書き戻されることはありません。',
    'The subtitle side panel gained a one-tap X close button in its header, matching the other side panels, and the close action left the panel-options menu.': '字幕サイドパネルのヘッダーに、他のサイドパネルと同じワンタップのX閉じるボタンを追加し、閉じる操作をパネルオプションメニューから外しました。',
    'Opening the subtitle panel no longer flips a persisted setting, so a panel opened on one video no longer auto-opens on every other tab and page; the open-by-default preference still applies once per page and a manual close now sticks.': '字幕パネルを開いても保存設定が書き換わらなくなり、ある動画で開いたパネルが他のタブやページで勝手に開くことがなくなりました。「既定で開く」設定はページごとに一度だけ適用され、手動で閉じた状態は維持されます。',
    'The docked subtitle panel keeps a stable height when the video scrolls out of view instead of collapsing into a sliver pinned to the bottom of the screen.': 'ドッキングした字幕パネルは、動画が画面外へスクロールしても安定した高さを保ち、画面下部に細くつぶれることがなくなりました。',
    'Docking the subtitle panel to the left no longer stretches bounded page embeds to the full leftover column width, which was blowing the homepage demo video wide and cropping it.': '字幕パネルを左にドッキングしても、幅が決まっているページ埋め込みを残り列幅いっぱいまで引き伸ばさなくなりました。ホームページのデモ動画が横に広がって切れる問題が解消します。',
    'Tapping a BookWalker page in manual scan mode no longer randomly fails to show the OCR overlay: the background page-turn poll could discard the in-flight tap snapshot mid-capture, and the capture now survives unless a genuinely newer snapshot replaced it.': '手動スキャンモードでBookWalkerのページをタップしたとき、OCRオーバーレイがランダムに表示されない問題を修正しました。バックグラウンドのページ送りポーリングが取得中のタップスナップショットを破棄することがありましたが、本当に新しいスナップショットに置き換えられた場合を除いて取得が維持されるようになりました。',
    'Completed the interface-copy extraction: five same-directory imports still pulled the full Japanese UI copy tables into the core userscript, which now sits about 288 KB under the Greasy Fork limit.': 'インターフェース文言の分離を完了しました。同じディレクトリからの5つのインポートが日本語UI文言テーブル全体をコアユーザースクリプトへ引き込んでいましたが、これによりコアはGreasy Fork制限に対して約288KBの余裕を持つようになりました。',
    'The popover\'s Never forget and Blacklist buttons now appear only when a connected service can actually set that state for the word (JPDB or Jiten backing the card); on Bunpro-only cards they previously rendered but could only produce an error toast.': 'ポップオーバーの「Never forget」と「Blacklist」ボタンは、接続済みサービス（JPDBまたはJitenがその単語を扱っている場合）が実際にその状態を設定できるときだけ表示されるようになりました。Bunproのみのカードでは、以前は表示されてもエラートーストしか出せませんでした。',
    'The CI dead-code gate understands the companion build aliases again, so it stops flagging the alias-substituted companion facades and blocking CI.': 'CIのデッドコードゲートがコンパニオンビルドのエイリアスを再び理解するようになり、エイリアスで差し替えられるコンパニオンファサードを誤検出してCIを止めることがなくなりました。',
    'Converged the keyless public-lookup fallback used by the reader and the new tab into one lookup module, removing the duplicated implementation that had started drifting.': 'リーダーと新しいタブが使うキー不要の公開検索フォールバックを1つの検索モジュールへ統合し、乖離し始めていた重複実装を取り除きました。',
    'OCR no longer strips the spaces out of Latin text when a line happens to contain a Japanese character (code screenshots turned into space-less soup); whitespace is now removed only between Japanese characters, where it is recognition noise.': 'OCRは、行に日本語の文字が含まれているだけで欧文のスペースを取り除くことがなくなりました（コードのスクリーンショットがスペースなしの文字列になっていました）。空白の除去は、認識ノイズである日本語文字間のみに行われます。',
    'The popover no longer presents machine-translation garbage for text that is not actually Japanese: sentence translation now requires the text to be meaningfully Japanese, the translation section hides itself when there is nothing translatable, and a missing study companion returns no translation instead of echoing the input back as one.': 'ポップオーバーは、実際には日本語でないテキストに対して機械翻訳のノイズを表示しなくなりました。文の翻訳はテキストが実質的に日本語であることを必要とし、翻訳できるものがない場合は翻訳セクション自体が非表示になり、学習コンパニオンが見つからない場合も入力をそのまま翻訳として返すことはありません。',
    'Restored paused-video OCR on the hosted video player and PDF reader: the 1.6.10 companion extraction moved OCR into the yomu-ocr-manga companion, but the hosted pages, their service-worker precache, and the docs hosted runtime still loaded the old companion list, so the hosted OCR overlay never appeared. All hosted companion lists now include yomu-ocr-manga and yomu-ui-copy.': 'ホスト版動画プレイヤーとPDFリーダーの一時停止中OCRを復旧しました。1.6.10のコンパニオン分離でOCRはyomu-ocr-mangaコンパニオンへ移動しましたが、ホストページ、そのService Workerのプリキャッシュ、ドキュメントのホストランタイムは古いコンパニオン一覧のままで、ホスト版のOCRオーバーレイが表示されなくなっていました。すべてのホスト版コンパニオン一覧にyomu-ocr-mangaとyomu-ui-copyを追加しました。',
    'The CI dead-code job now verifies the fallow platform binary after install and restores it when npm silently drops the optional dependency on a cold cache, which had been failing CI since 1.6.10.': 'CIのデッドコードジョブは、インストール後にfallowのプラットフォームバイナリを検証し、コールドキャッシュでnpmがオプション依存を黙って取りこぼした場合に復元するようになりました。これが1.6.10以降CIを失敗させていました。',
    'Moved the local (Yomitan) dictionary engine and its ZIP/Dexie import machinery into the Yomu Settings Surface companion, dropping the core userscript to roughly 1.79 MB and growing Greasy Fork headroom from about 39 KB to over 200 KB. Behavior is unchanged: the companion is always required by the userscript and bundled into hosted, extension, new-tab, and gaming builds, and if it ever failed to load, local dictionary lookups would fall through to the online providers instead of breaking.': 'ローカル（Yomitan）辞書エンジンとそのZIP／Dexieインポート機構をYomu Settings Surfaceコンパニオンへ移動し、コアユーザースクリプトを約1.79MBまで縮小して、Greasy Forkの2MB上限に対する余裕を約39KBから200KB超へ拡大しました。動作は変わりません。コンパニオンはユーザースクリプトから常に読み込まれ、ホスト版・拡張機能・新しいタブ・ゲーミングの各ビルドにも同梱されます。万一読み込めない場合も、ローカル辞書の検索は壊れずにオンラインの提供元へ切り替わります。',
    'Moved the OCR/manga reader into a new yomu-ocr-manga companion, the interface copy into a new yomu-ui-copy companion, and the study mining context and sources into the Kanji/Study companion, so the core userscript sits about 39 KB under the Greasy Fork 2 MB limit instead of 143 bytes. Behavior is unchanged: companions are always required by the userscript and bundled into hosted builds.': 'OCR／マンガリーダーを新しいyomu-ocr-mangaコンパニオンへ、インターフェース文言を新しいyomu-ui-copyコンパニオンへ、学習のマイニングコンテキストとソースをKanji/Studyコンパニオンへ移動し、コアユーザースクリプトがGreasy Forkの2MB制限に対して143バイトではなく約39KBの余裕を持つようにしました。動作は変わりません。コンパニオンはユーザースクリプトが常に@requireし、ホスト版にはバンドルされます。',
    'Release-gate test waits now scale their polling budget on CI runners, so four-shard event-loop starvation no longer fails waits that pass in milliseconds locally. This is what blocked the 1.6.8 release build twice.': 'リリースゲートのテスト待機は、CIランナーではポーリング予算をスケールするようになりました。4シャード並列によるイベントループの飢餓状態でも、ローカルではミリ秒で通る待機が失敗しなくなります。これが1.6.8のリリースビルドを2回止めていた原因でした。',
    'The furigana-local-default smoke now opens settings by re-dispatching until the settings surface has registered its listener, instead of losing a single early dispatch on slow runners.': 'furigana-local-defaultスモークは、設定サーフェスがリスナーを登録するまでイベントを再送して設定を開くようになりました。遅いランナーで早すぎる1回きりの送信が失われることがなくなります。',
    'Added two release gates: a YouTube controls-wake smoke (npm run smoke:youtube-controls-wake) proving Yomu never keeps the player controls awake during idle playback, and a keyless local-dictionary furigana smoke (npm run smoke:furigana-local-default) proving a fresh offline install still decorates difficult kanji with furigana and pitch colours. Both run in CI and the release workflow.': 'リリースゲートを2つ追加しました。YouTubeコントロール起こしっぱなし検知スモーク（npm run smoke:youtube-controls-wake）は、再生を放置してもYomuがプレイヤーコントロールを起こし続けないことを保証し、キー不要のローカル辞書ふりがなスモーク（npm run smoke:furigana-local-default）は、オフラインの新規インストールでも難しい漢字にふりがなとピッチ配色が付くことを保証します。どちらもCIとリリースワークフローで実行されます。',
    'Watching YouTube with a JPDB or Jiten API key no longer fires redundant keyless public jpdb.io/jiten.moe lookups for every caption line: the DOM-caption warm parse now routes through the same authoritative provider request the renderer uses, halving idle-playback API traffic.': 'JPDBまたはJitenのAPIキーを設定してYouTubeを視聴しても、字幕行ごとに冗長なキー不要の公開jpdb.io／jiten.moe検索が飛ばなくなりました。DOM字幕のウォームパースがレンダラーと同じ正規プロバイダーのリクエストを通るようになり、放置再生中のAPI通信が半減します。',
    'Mutation batches that stay inside Yomu\'s own overlay now skip the per-mutation fullscreen scan, trimming main-thread work during subtitle playback.': 'Yomu自身のオーバーレイ内で完結するミューテーションのまとまりは、ミューテーションごとのフルスクリーン走査をスキップするようになり、字幕再生中のメインスレッドの負荷を削減します。',
    'Fixed the flaky release-gating BookWalker OCR test: the OCR result cache persisted to localStorage mid-file on slow CI runners, so an earlier test\'s cached scan short-circuited the next test\'s recognizer and failed the release build. Unit tests now reset the persisted OCR cache between tests.': 'リリースを止めていた不安定なBookWalker OCRテストを修正しました。遅いCIランナーではOCR結果キャッシュがファイル実行の途中でlocalStorageへ保存され、前のテストのキャッシュ済みスキャンが次のテストの認識呼び出しを短絡させてリリースビルドを失敗させていました。ユニットテストはテスト間で保存済みOCRキャッシュをリセットするようになりました。',
    'Updated the subtitle player smoke\'s rail expectation to include the 1.6.7 visibility (eye) button, so npm run smoke:subtitles is green again on main.': '字幕プレイヤースモークのレール期待値を1.6.7の表示／非表示（目）ボタンを含むよう更新し、mainでnpm run smoke:subtitlesが再びグリーンになりました。',
    'The hosted donation endpoint now refuses Stripe test-mode secrets and validates checkout URLs, returning a clear service error instead of ever redirecting supporters to a sandbox payment page.': 'ホスト版の寄付エンドポイントはStripeのテストモードのシークレットを拒否し、チェックアウトURLを検証するようになりました。支援者をサンドボックスの決済ページへリダイレクトすることは決してなく、明確なサービスエラーを返します。',
    'Added the merged visual Study flow with reorderable/skippable kanji drawing, word meaning, cloze recall, listening, speaking, reveal, and final grading steps.': '並べ替えやスキップができる漢字書き取り、単語の意味、穴埋め想起、リスニング、発話、答え表示、最終評価をまとめた、視覚的な統合学習フローを追加しました。',
    'Added local-first Yomu SRS, Bunpro queue/mining/lookups, study stats, SRS import groundwork, and local queued grading for users without connected accounts.': 'アカウント接続なしでも使えるローカル優先のYomu SRS、Bunproのキュー・採掘・検索、学習統計、SRSインポートの土台、ローカルに保存される評価キューを追加しました。',
    'Added Yomu-hosted audio/support worker scaffolding, donation budget status UI, and hosted audio as the first default audio source.': 'Yomuホスト音声とサポートWorkerの土台、寄付と運用予算の状況UI、既定の音声ソース先頭としてのホスト音声を追加しました。',
    'Consolidated Study/New Tab settings into a dedicated Study tab and kept no-account learners unblocked by default.': 'Study/New Tab関連の設定を専用の学習タブへまとめ、アカウントがない学習者も最初から進められる既定にしました。',
    'Simplified review UI by moving frequency into dictionary pills, replacing the large replay button with a speaker control, and removing redundant listen prompts/buttons.': '頻度表示を辞書ピルへ移し、大きなReplayボタンをスピーカー操作に置き換え、重複したリスニングの案内やボタンを削除して復習UIを簡素化しました。',
    'Hardened proxy fetch rules and factory reset coverage so account, source, pill, and local SRS settings are reset consistently.': 'プロキシ取得ルールとファクトリーリセット対象を強化し、アカウント、ソース、ピル、ローカルSRSの設定が一貫してリセットされるようにしました。',
    'Derived OCR and Immersion Kit image-caption backgrounds from the user\'s accent color while keeping the rendered backdrop readable with white OCR/caption text.': 'OCRとイマージョンキット画像キャプションの背景をユーザーのアクセントカラーから生成し、白いOCR／字幕テキストで読みやすい実際の背景になるようにしました。',
    "Removed the Study menu's Local Audio trailing slash so local and published link checks resolve to the page instead of a docs 404.": 'Studyメニューのローカル音声リンクの末尾スラッシュを外し、ローカルでも公開後でもリンクチェックがドキュメントの404ではなくページへ解決されるようにしました。',
    'Keeps the YouTube Shorts player at its native size when the subtitle transcript drawer is open, instead of stretching the portrait video far past the viewport and cropping it.': '字幕トランスクリプトドロワーを開いてもYouTube Shortsのプレーヤーを本来のサイズのまま保ち、縦動画がビューポートを大きくはみ出して切り取られて表示される問題を修正しました。',
    'The puck\'s radial menu now offers an "auto subtitles" toggle on video pages, so automatic subtitle injection can be switched on or off without opening settings.': '動画ページのパックのラジアルメニューに「自動字幕」トグルを追加し、設定を開かずに字幕の自動表示をオン／オフできるようにしました。',
    'The subtitle rail gained a show/hide (eye) button to hide the subtitle overlay for the video being watched and bring it back mid-playback.': '字幕レールに表示／非表示（目）ボタンを追加し、視聴中の動画の字幕オーバーレイを再生中に隠したり戻したりできるようにしました。',
    'Batch Mine candidates in the subtitle sidebar can now be graded immediately from each row or batch-graded with the active review scale, including two-button Pass/Fail review setups.': '字幕サイドバーのBatch Mine候補を、各行からすぐ評価したり、現在の復習スケールで選択分を一括評価したりできるようにしました。2ボタンのPass/Fail復習設定にも対応します。',
    'Keeps the Batch Mine header and controls in the sticky top area of the mobile subtitle drawer, so the scan/add/copy/review controls no longer overlap the first mined words on YouTube.': 'モバイル字幕ドロワーでBatch Mineの見出しと操作を上部の固定エリアに保つようにし、YouTubeでスキャン、追加、コピー、復習の操作が最初の採掘候補に重ならないようにしました。',
    'Simplified the Batch Mine panel on video subtitles: the idle panel now shows only the Scan action, review actions appear after candidates are found, compact drawer controls scroll cleanly inside narrow side panels, and the redundant rail Tracks shortcut hides while the side panel already exposes a Tracks tab.': '動画字幕のBatch Mineパネルを簡素化しました。待機中はスキャン操作だけを表示し、候補が見つかった後に確認用の操作を表示します。狭いサイドパネルでもコンパクトなドロワー操作がきれいに横スクロールし、サイドパネル内にTracksタブがある間は重複するレール上のTracksショートカットを隠します。',
    'Added a Batch Mine tab to the video subtitle side panel. It scans the loaded transcript, compares parsed words against existing Jiten/JPDB/Anki states, ranks i+1 candidates first, preselects useful not-in-deck words, and lets you add or copy the selected batch after watching.': '動画字幕サイドパネルにBatch Mineタブを追加しました。読み込んだ文字起こしをスキャンし、解析済み単語を既存のJiten/JPDB/Anki状態と照合して、i+1候補を優先表示し、有用な未追加単語を事前選択し、視聴後に選択した一括候補を追加またはコピーできます。',
    'Re-published the hosted overflow menu and New Tab caption readability release after syncing the video player smoke check with the current drop-video-plus-subtitles copy.': '動画プレイヤーのスモークチェックを現在の「動画と字幕をドロップ」コピーに同期したうえで、ホスト版オーバーフローメニューと新しいタブのキャプション可読性のリリースを再公開しました。',
    'Pointed hosted PDF Reader menu/docs links at the explicit index.html route so local and published link checks resolve to the reader instead of a docs 404.': 'ホスト版PDFリーダーのメニュー／ドキュメントリンクを明示的なindex.htmlルートに向け、ローカルでも公開後でもリンクチェックがドキュメントの404ではなくリーダーへ解決されるようにしました。',
    'Matched the Study, PDF Reader, and Video Player overflow menus to the homepage menu, including compact ellipsis styling, localized labels, and the same working tool/support links.': 'Study、PDFリーダー、動画プレイヤーのオーバーフローメニューをホームページのメニューに揃えました。コンパクトな三点リーダー表示、ローカライズ済みラベル、同じツール／サポートリンクを使います。',
    'Kept New Tab Immersion Kit image captions in white caption text with the video-style fallback/shadow treatment in light mode, matching the readable dark-mode and popup implementations.': '新しいタブのイマージョンキット画像キャプションを、ライトモードでも白い字幕テキストと動画風のフォールバック／影処理で表示し、読みやすいダークモードやポップアップの実装と揃えました。',
    'Restored settings saved under previous storage keys during update/reinstall recovery, including theme and accent color, while preserving any newer settings already changed after the update.': '更新または再インストール後の復旧時に、以前の保存キーに残っていたテーマやアクセントカラーなどの設定を復元し、更新後に変更された新しい設定は保持するようにしました。',
    'Fixed the study mode tab row so all six study tabs including Listen fit on one row instead of pushing the Listen tab onto a second line.': '学習モードのタブ列を修正し、リスニングを含む6つのタブがすべて1行に収まるようにしました。リスニングのタブが2行目に押し出されなくなります。',
    'Removed the note that said nothing uploads from the video player start screen in English and Japanese.': 'ビデオプレーヤーの開始画面から、アップロードはされませんという注記を英語と日本語で削除しました。',
    // Docs JA localization sweep (verified)
    'Made the YouTube subtitle Tracks tab open and resize smoothly on videos with many auto-translated caption tracks by rendering only the rows in view.': '自動翻訳された字幕トラックが大量にある動画でも、表示中の行だけを描画することで、YouTube字幕のトラックタブの開閉とサイズ変更がスムーズになるようにしました。',
    'Kept the new tab study mode switcher on a single row that fits evenly across the available width on phones, tablets, and desktop, instead of wrapping the last tab onto its own line or scrolling it out of view.': '新しいタブの学習モード切り替えを1行に保ち、利用可能な幅に均等に収まるようにしました。スマートフォン・タブレット・デスクトップのいずれでも、最後のタブだけが折り返したり画面外にスクロールしたりしなくなります。',
    'Updated the release smoke for paused-frame video OCR to use the manual Read video frame (OCR) action, matching the current manual-first video player behavior before publishing.': 'リリース用スモークで、停止中の動画フレームOCRを現在の手動優先の動作に合わせ、手動のRead video frame (OCR)操作を使ってから公開するようにしました。',
    'Centered the Listen mode pitch-pattern graphs inside each answer tile, so the mora labels and contour line sit visually under the tile number instead of leaning left.': 'Listenモードのピッチパターン図を各回答タイル内で中央揃えにし、モーラのラベルと輪郭線が左寄りではなくタイル番号の真下に見えるようにしました。',
    'Added a session stats panel to Listen mode that shows how many pitch items are due and your accuracy for each pitch pattern, and ordered the Listen queue to review due items first.': 'リスニングモードにセッション統計パネルを追加し、復習予定のアクセント項目数とアクセント型ごとの正答率を表示し、復習予定の項目を優先する順番にしました。',
    'Added a Listen pitch-accent mode to the Study page with Perceive, Recall, and Shadow practice over a local spaced-repetition deck that grows automatically from the words you review.': '学習ページにアクセントのリスニングモードを追加しました。聞き取り・想起・シャドーイングの練習を、復習した単語から自動的に増えるローカルの間隔反復デッキで行えます。',
    'Added an audio-first downstep picker that plays a word and asks which pitch pattern you heard, and replays both words of a minimal pair when you miss.': '音声優先のアクセント位置セレクターを追加しました。単語を再生してどのアクセントに聞こえたかを尋ね、間違えるとミニマルペアの両方の語を再生します。',
    'Added optional local microphone recording and playback to Shadow practice so you can compare your pronunciation with the model without uploading any audio.': 'シャドーイング練習に任意のローカルマイク録音と再生を追加しました。音声をアップロードせずに自分の発音をお手本と比べられます。',
    'Made the YouTube subtitle drawer open and resize smoothly on videos with many auto-translated caption tracks by skipping layout for off-screen track rows.': '自動翻訳された字幕トラックが大量にある動画でも、画面外のトラック行のレイアウトを省略することで、YouTube字幕ドロワーの開閉とサイズ変更がスムーズになるようにしました。',
    'Added previous and next context lines to the YouTube shadowing drawer, each tappable to move shadowing practice onto that line.': 'YouTube シャドーイングドロワーに前後の行を表示し、タップするとその行に練習を移せるようにしました。',
    'Added local microphone self-recording and playback to the YouTube shadowing drawer so you can compare your pronunciation with the model without uploading any audio.': 'YouTube シャドーイングドロワーにローカルのマイク録音と再生を追加し、音声をアップロードせずに自分の発音をお手本と比べられるようにしました。',
    'Fixed the YouTube shadowing drawer loop control so it repeats the focused line reliably instead of playing on to the next one.': 'YouTube シャドーイングドロワーのループ操作を修正し、次の行へ進んでしまわずに対象の行を確実に繰り返すようにしました。',
    'Fixed the YouTube shadowing drawer hide control so a hidden line is fully blurred over its word highlights instead of staying readable.': 'YouTube シャドーイングドロワーの非表示操作を修正し、単語ハイライトの上でも読めてしまわずに行全体をぼかすようにしました。',
    "Added Recall mode to the Study page: it shows the meaning first, accepts typed or Apple Pencil/Scribble Japanese answers, then reveals the word before submitting the user's chosen JPDB, Jiten, or Anki review grade.": '学習ページに Recall モードを追加しました。最初に意味を表示し、入力または Apple Pencil/Scribble で日本語の答えを書いてから単語を表示し、ユーザーが選んだ JPDB、Jiten、Anki の復習評価を送信します。',
    'Added browser smoke coverage for Recall reviews across JPDB, Jiten, and AnkiConnect, including empty-answer, reading-accepted, wrong-answer, and provider payload checks.': 'JPDB、Jiten、AnkiConnect の Recall 復習をブラウザスモークで検証するようにしました。未入力、読みの許容、不正解、プロバイダー送信内容の確認を含みます。',
    'Fixed Yomu Gaming so full-screen and area captures render recognized Japanese in place over the frozen screen instead of opening the old detached OCR panel.': 'Yomu Gaming で、全画面キャプチャと範囲キャプチャの認識済み日本語を、古い分離型 OCR パネルではなく、凍結した画面上にそのまま表示するように修正しました。',
    'Made Yomu Gaming in-place OCR words readable over captured screens while keeping the detached OCR result panel out of the main flow.': 'Yomu Gaming のインプレース OCR 単語をキャプチャ画面上で読みやすくし、分離型 OCR 結果パネルはメインの流れから外したままにしました。',
    'Kept the Gaming lookup flow secure and native-feeling by moving dictionary lookup back through the Electron main process, preserving renderer sandboxing, and opening a compact in-place lookup popover from invisible OCR line targets.': 'Gaming の検索フローを安全でネイティブらしく保つため、辞書検索を Electron のメインプロセス経由に戻し、レンダラーのサンドボックスを維持しつつ、見えない OCR 行ターゲットからコンパクトなインプレース検索ポップオーバーを開くようにしました。',
    'Guarded broken stdout/stderr pipes in the packaged app so launching Yomu Gaming from a closed terminal or external process does not crash with': 'パッケージ済みアプリで壊れた stdout/stderr パイプを保護し、閉じたターミナルや外部プロセスから Yomu Gaming を起動しても次のエラーでクラッシュしないようにしました:',
    'Made paused-frame OCR overlays on dark video surfaces lighter and more readable by replacing the opaque accent block with a translucent caption-style treatment, visible keyboard focus, and Enter/Space activation for OCR line targets.': '暗い動画面の一時停止フレームOCRオーバーレイを、塗りつぶしの強いアクセントブロックから半透明の字幕風表示に置き換え、キーボードフォーカスとEnter/SpaceでのOCR行ターゲット操作を見やすくしました。',
    'Restored mobile YouTube subtitle control parity by keeping Play/Pause visible while the side panel is open during playback, adding a direct Tracks shortcut to the rail, and keeping Lines, Shadow, Tracks, navigation, placement, and Auto controls compact in one accessible drawer row.': 'モバイルYouTube字幕の操作をデスクトップ相当に戻しました。再生中にサイドパネルを開いてもPlay/Pauseを表示し続け、レールにトラックへの直接ショートカットを追加し、行、シャドー、トラック、移動、配置、Autoの各操作を、アクセシブルな1行のコンパクトなドロワー操作列に収めました。',
    'Improved narrow mobile subtitle wrapping with balanced overlay lines and tidier transcript/shadow wrapping.': '狭いモバイル画面での字幕折り返しを改善しました。オーバーレイ字幕は行のバランスを取り、文字起こしとシャドー表示もより自然に折り返します。',
    'Let keyless YouTube subtitle pre-rendering fetch urgent public JPDB pitch accents outside the shared background page budget, so live-video pitch colors can arrive before the word is tapped.': 'APIキーなしのYouTube字幕プリレンダーで、背景ページ全体の共有予算とは別に緊急の公開JPDBピッチアクセントを取得できるようにしました。ライブ動画でも、単語をタップする前にピッチ色が届きやすくなります。',
    "Kept YouTube homepage section headings and feed title mirrors from clipping or overlapping when furigana makes the rendered mirror taller than YouTube's original text row.": 'YouTubeホームのセクション見出しやフィードタイトルのミラー表示で、ふりがな付きの描画が元のテキスト行より高くなっても、切れたり重なったりしないようにしました。',
    'Rendered Jiten vocabulary-detail pitch accents in the popup header graph instead of dropping them after the Jiten detail lookup.': 'Jiten の語彙詳細で取得したピッチアクセントを、詳細取得後に失わずポップアップ見出しのピッチグラフへ表示するようにしました。',
    'Added a Shadow tab to the YouTube subtitle drawer with current-line replay, cue looping, hide/reveal text, parsed Japanese, and secondary subtitle support for speaking practice.': 'YouTube字幕ドロワーにシャドータブを追加しました。現在行の再生、キューループ、本文の非表示／表示、解析済み日本語、第二字幕を使って発話練習できます。',
    'Removed the experimental subtitle Shadow drawer from the release branch so Yomu Video stays lean and publishable.': '実験的な字幕シャドードロワーをリリースブランチから削除し、Yomu Videoを軽量で公開可能な状態に保ちました。',
    'Made study reviews work fully offline: every due card is warmed into the cache up front, grades are queued locally and sync back automatically when you reconnect, and a cached-card count plus a sync status now sit next to the session timer.': '学習レビューを完全にオフラインで動作するようにしました。期限切れの各カードを事前にキャッシュへ温め、採点はローカルに保存して再接続時に自動で同期し、キャッシュ済み枚数と同期状況をセッションタイマーの隣に表示します。',
    'Cleaned up the study card front: the audio button now sits inline next to the word, the headword block is centered, the source pills are hidden on the front (they stay in the lookup view), and the landscape layout on iPad is tidier.': '学習カードの表面を整理しました。音声ボタンを単語の隣にインライン配置し、見出し語ブロックを中央寄せにし、ソースのピル表示を表面から隠し（検索表示には残ります）、iPadの横向きレイアウトを整えました。',
    'Suppressed furigana on compact stacked app notices and helper rows that sit above action chips, including mobile YouTube AI question prompts, while keeping readable prose and media titles annotated. This keeps ruby from overlapping nearby controls on narrow layouts.': 'モバイルYouTubeのAI質問プロンプトなど、アクションチップの上に重なるコンパクトなアプリ通知や補助行ではふりがなを抑制し、読み物本文やメディアタイトルでは注釈を保つようにしました。狭いレイアウトでふりがなが近くのコントロールに重なるのを防ぎます。',
    'Made YomuYomu lesson support native-first: よむ now leaves the site\'s canvas reader, translation panel, and reading controls visible, uses an invisible passive lookup layer over the canvas fallback text, and lets clicks continue to YomuYomu while still opening よむ lookups.': 'YomuYomuレッスン対応をネイティブ優先にしました。サイト側のキャンバスリーダー、翻訳パネル、読解コントロールを表示したまま、キャンバスのフォールバックテキスト上に見えないパッシブな検索レイヤーを重ね、クリックはYomuYomuへ通しつつよむの検索も開けるようにしました。',
    'Kept a number bound to the counter or unit that follows it when Japanese text wraps, so labels such as the Google video key-moments row no longer leave a digit stranded at the end of a line.': '日本語のテキストが折り返すとき、数字をその後ろに続く助数詞や単位に結び付けるようにしました。Googleの動画の重要なパート行などのラベルで、数字だけが行末に取り残されることがなくなります。',
    'Fixed surrounding words disappearing when a block that mixes non-Japanese prose with an inline CJK run is annotated on framework-managed sites such as React, Vue, Svelte, and custom-element apps like Reddit, where the page overlay now keeps the full host text visible instead of only the scanned CJK fragment.': 'React・Vue・SvelteやRedditのようなカスタム要素アプリなど、フレームワーク管理下のサイトで、非日本語の文章にCJKの連なりが混ざったブロックに注釈を付けた際、周囲の単語が消える問題を修正しました。これらのサイトで使われるページオーバーレイは、走査したCJK部分だけでなくホスト要素の全文を表示したままにします。',
    'Loaded pitch accent for Jiten-only and no-API-key users. The public pitch source needs no API key, but three paths — study and search word pitch, the lookup-card pitch graph, and reading-view pitch enrichment — had hidden it behind a JPDB key, so Jiten and keyless study sessions showed no pitch. It now loads from the keyless source whenever pitch accent is turned on.': 'Jiten専用ユーザーやAPIキーのないユーザーでもピッチアクセントを読み込めるようにしました。公開ピッチのソースはAPIキー不要ですが、学習と検索の単語ピッチ、ルックアップカードのピッチグラフ、リーダー表示のピッチ補完という3つの経路でJPDBキーの背後に隠れていたため、Jiten専用やキーなしの学習セッションではピッチが表示されませんでした。ピッチアクセントが有効な場合は、キー不要のソースから常に読み込むようになりました。',
    'Merged the live Jiten/JPDB site frequency rank inline into the matching lookup pill (e.g. "Jiten #18447") instead of a separate "Jiten live" pill, controlled by a new "Show site frequency in pills" setting that is on by default. The JPDB frequency rank now shows by default too.': 'ライブのJiten/JPDBサイト頻度順位を、別個の「Jiten live」ピルではなく、対応するルックアップピル内に「Jiten #18447」のようにインラインで統合しました。新しい「サイトの頻度をピルに表示」設定で制御でき、デフォルトで有効です。JPDBの頻度順位もデフォルトで表示されるようになりました。',
    'Merged the BookWalker Firefox OCR repair so tainted reader canvases can replay reused source buffers, recover late source-image records, and keep continuous/vertical scrolling from getting stuck on the first page.': 'BookWalkerのFirefox OCR修正を統合し、汚染されたリーダーキャンバスで再利用されたソースバッファを再生し、遅れて届くソース画像記録を回収し、連続／縦スクロールが最初のページで止まらないようにしました。',
    'Split wide non-continuous BookWalker spreads into per-page OCR passes and versioned their OCR cache keys so sparse old single-pass spread results are not reused after page turns.': '連続スクロールではない横長のBookWalker見開きをページごとのOCRパスに分割し、OCRキャッシュキーも更新しました。ページめくり後に、古い単一パスの粗い見開き結果が再利用されないようになります。',
    'Kept BookWalker reader chrome/settings text lookupable with passive annotations while preserving compact controls, and kept storefront annotations contained so product/carousel/sidebar layout is not resized by Yomu.': 'BookWalkerリーダーのツールバーや設定テキストを、コンパクトな操作部を保ったままパッシブ注釈で検索可能にしました。ストアフロントの注釈も閉じ込め、商品、カルーセル、サイドバーのレイアウトがよむによってリサイズされないようにしています。',
    'Recovered BookWalker Firefox OCR when a page-image mirror fetch stalls: pending canvas captures now time out, stale async captures cannot suppress newer retries, and the same visible manga page retries without needing a refresh.': 'ページ画像のミラー取得が停止した場合でも、BookWalkerのFirefox OCRが復帰できるようにしました。保留中のキャンバス取得はタイムアウトし、古い非同期取得が新しい再試行を抑え込まず、同じ表示中マンガページを更新なしで再試行します。',
    'Kept BookWalker canvas scan status visible when capture attempts exhaust, so the indicator no longer silently disappears while the next poll remains able to recover.': 'BookWalkerキャンバスの取得試行が上限に達した場合も、スキャン状態を表示したままにしました。次のポーリングで復帰できる状態を保ちながら、インジケーターが黙って消えることを防ぎます。',
    'Kept BookWalker OCR provider failures terminal until the user retries, preventing repeated scrolling from flashing between Scanning and Could not read text on the same page.': 'BookWalkerのOCRプロバイダー失敗をユーザーが再試行するまで終端状態に保ち、同じページをスクロールするたびに「スキャン中」と「テキストを読み取れません」が点滅するのを防ぎました。',
    'Declared BookWalker viewer and image CDN access explicitly in the userscript metadata so Firefox/Tampermonkey reinstalls do not prompt on every signed page image.': 'Firefox/Tampermonkeyで再インストールしたあと、署名付きページ画像ごとに確認が出ないよう、BookWalkerビューアーと画像CDNへのアクセスをユーザースクリプトのメタデータに明示しました。',
    'Restored bounded public pitch hydration for keyless generic pages such as Google results, so fallback words can pick up Jiten pitch coloring before they are selected.': 'Google検索結果など、APIキーなしの一般ページで公開ピッチ補完を上限付きで復元しました。選択する前のフォールバック単語にも、Jiten由来のピッチ色が付くようになります。',
    'Aligned local-dictionary furigana to the specific kanji inside kana-suffixed words such as 質問する, so mixed terms render as 質[しつ]問[もん]する instead of centering the reading over the whole word.': '質問するのように仮名の接尾辞を持つ語で、ローカル辞書由来のふりがなを各漢字に揃えるようにしました。混在語は語全体に読みを中央寄せするのではなく、質[しつ]問[もん]するのように表示します。',
    'Removed the duplicate study-answer dictionary card on New Tab review words and kept reading, pitch, frequency, dictionary links, and audio in the compact prompt tool row.': '新しいタブの復習単語で重複していた解答側の辞書カードを削除し、読み、ピッチ、頻度、辞書リンク、音声を、出題語のコンパクトなツール列に保つようにしました。',
    'Kept BookWalker-style storefront, gallery, and compact media card text lookupable without letting Yomu highlights or furigana resize carousels, cards, or side login panels.': 'BookWalker風のストアフロント、ギャラリー、コンパクトなメディアカードのテキストを検索可能なままにしつつ、Yomuのハイライトやふりがながカルーセル、カード、サイドログインパネルのサイズを変えないようにしました。',
    'Restored cleaner Study reverse-side word context for Jiten kanji cards: backing words now show inline furigana and the audio button, and Immersion Kit audio replay works on every speaker click.': 'Jiten漢字カードの学習裏面にある単語コンテキストを整理し、関連単語にインラインふりがなと音声ボタンを表示し、Immersion Kit音声がスピーカーを押すたびに再生されるようにしました。',
    'Made Yomu PDF detect image-backed scanned pages with embedded/invisible OCR text and show readable in-place OCR line targets instead of dense word overlays, while keeping real text PDFs on the selectable PDF text layer.': 'Yomu PDFで、埋め込みまたは不可視OCRテキストを持つ画像ベースのスキャンページを検出し、密な単語オーバーレイではなく読みやすいページ上OCR行ターゲットを表示するようにしました。通常のテキストPDFは選択可能なPDFテキストレイヤーのままです。',
    'Tightened the generic layout guard so compact app controls, storefront cards, carousels, and composer mirrors stay lookupable without furigana or highlight styling pushing page UI out of place.': '汎用レイアウト保護を強化し、コンパクトなアプリ操作部、ストアカード、カルーセル、入力ミラーを検索可能なまま保ちつつ、ふりがなやハイライトがページUIを押し出さないようにしました。',
    'Kept Yomu Gaming on the browser image-OCR default and left local OCR as an advanced opt-in path, so the desktop app no longer opens with a tiny forced localhost endpoint as the main setup.': 'Yomu Gamingはブラウザー画像OCRの既定動作を使い、ローカルOCRは高度な任意設定として残しました。デスクトップアプリが小さなlocalhostエンドポイント設定を主なセットアップとして開かないようになります。',
    'Restored local-dictionary furigana and pitch recovery for New Tab study prompts such as 映画, 図鑑, and 混浴, while preserving clean fallback when pitch is unavailable.': '映画、図鑑、混浴などの新しいタブ学習プロンプトで、ローカル辞書からふりがなとピッチを復元するようにしました。ピッチがない場合も表示は自然にフォールバックします。',
    'Fixed Jiten text-to-speech and localhost local-audio playback so GM-capable requests avoid the public proxy/CORS path, and replay clicks restart native audio instead of falling through to browser TTS too early.': 'Jitenの読み上げとlocalhostのローカル音声再生を修正し、GMリクエストが使える場合は公開プロキシやCORSの経路を避けるようにしました。再生ボタンを押し直すと、ブラウザーTTSへ早すぎるフォールバックをせず、ネイティブ音声を再開します。',
    'Stopped New Tab reveal from repeating the same front sentence above Immersion Kit examples, so the prompt stays focused on the word and compact tools.': '新しいタブの答え表示で、Immersion Kitの例の上に同じ表面文を繰り返さないようにしました。プロンプトは単語とコンパクトなツールに集中できます。',
    'Smoothed the YouTube transcript sidebar so the green current-line highlight no longer flickers when playback advances between lines on long transcripts; the virtualized list now keeps its window steady while auto-following instead of re-rendering and recreating the highlighted row each line.': '長い文字起こしで再生が行から行へ進むたびに、YouTube文字起こしサイドバーの緑色の現在行ハイライトがちらついていた問題を解消しました。自動追従中は仮想リストの表示範囲を安定させ、行ごとにリストを再描画してハイライト行を作り直すのをやめました。',
    "Fixed the hosted PDF Reader's initial page navigation state so multi-page PDFs enable Next/Previous immediately after opening, and hardened the scanned-PDF smoke around deterministic page-turn OCR checks.": 'ホスト版PDFリーダーで、複数ページのPDFを開いた直後から前後ページボタンが正しく有効になるようにしました。スキャンPDFのページめくりOCRを安定して確認できるよう、スモークテストも強化しました。',
    'Kept OCR status cards and overlays aligned to canvas/background raster sources when reader pages mirror images through a different visible surface.': 'リーダーページが画像を別の表示面へミラーする場合でも、OCRのステータスカードとオーバーレイがcanvasや背景画像のラスター面に揃うようにしました。',
    'Rebuilt Electron before the Yomu Gaming smoke so GitHub Actions release runners install the Electron binary before launching the desktop app.': 'Yomu Gamingのスモークテスト前にElectronを再ビルドし、GitHub Actionsのリリースランナーがデスクトップアプリを起動する前にElectronバイナリを確実にインストールするようにしました。',
    'Installed Electron directly before the Yomu Gaming smoke so GitHub Actions release runners have the Electron runtime binary before launching and packaging the desktop app.': 'Yomu Gamingのスモークテスト前にElectronを直接インストールし、GitHub Actionsのリリースランナーがデスクトップアプリの起動とパッケージ化の前にElectronランタイムバイナリを確実に持つようにしました。',
    'Verified Electron\'s runtime executable before the Yomu Gaming smoke and release packaging, retrying one clean runtime install when GitHub Actions leaves a stale or skipped Electron binary behind.': 'Yomu Gamingのスモークテストとリリースパッケージ化の前にElectronランタイム実行ファイルを検証し、GitHub Actionsに古い、またはスキップされたElectronバイナリが残っている場合はクリーンなランタイムインストールを1回再試行するようにしました。',
    'Verified Electron\'s runtime executable before the Yomu Gaming smoke and release packaging, then directly downloaded and extracted the Electron runtime when GitHub Actions left a stale or skipped binary behind.': 'Yomu Gamingのスモークテストとリリースパッケージ化の前にElectronランタイム実行ファイルを検証し、GitHub Actionsに古い、またはスキップされたバイナリが残っている場合はElectronランタイムを直接ダウンロードして展開するようにしました。',
    'Verified Electron\'s runtime executable before the Yomu Gaming smoke and release packaging, then downloaded the Electron runtime with curl, checked its SHA-256, and extracted it synchronously when GitHub Actions left a stale or skipped binary behind.': 'Yomu Gamingのスモークテストとリリースパッケージ化の前にElectronランタイム実行ファイルを検証し、GitHub Actionsに古い、またはスキップされたバイナリが残っている場合はcurlでElectronランタイムをダウンロードし、SHA-256を確認してから同期的に展開するようにしました。',
    'Launched the Yomu Gaming smoke with Linux Electron sandbox flags under GitHub Actions so xvfb release runners can start the desktop app.': 'GitHub Actions上のYomu GamingスモークテストでLinux向けElectronサンドボックスフラグを付けて起動し、xvfbのリリースランナーでもデスクトップアプリを開始できるようにしました。',
    'Built Yomu Gaming release packages without rerunning the smoke outside xvfb, keeping the explicit xvfb smoke gate before packaging.': 'Yomu Gamingのリリースパッケージ作成ではxvfb外でスモークテストを再実行せず、パッケージ化の前に明示的なxvfbスモークゲートを通す形にしました。',
    "Uploaded the Yomu Gaming Linux AppImage from the release workflow using electron-builder's": 'リリースワークフローからYomu GamingのLinux AppImageをアップロードする際に、electron-builderの',
    'artifact name, and updated the download docs to match.': 'という成果物名を使い、ダウンロード案内もそれに合わせて更新しました。',
    'Kept the Yomu Gaming artifact workflow from racing the main release publisher, so userscript and browser-extension release assets land before the desktop downloads attach.': 'Yomu Gaming成果物ワークフローがメインのリリース公開処理と競合しないようにし、デスクトップ用ダウンロードを添付する前にユーザースクリプトとブラウザ拡張のリリース成果物が確実に公開されるようにしました。',
    'Stabilized BookWalker continuous/vertical Firefox OCR while mirror records are still warming up: persistent': 'BookWalkerの連続／縦方向Firefox OCRで、ミラー記録がまだ準備中の間も安定するようにしました。永続的な',
    'wideScreen': 'wideScreen',
    'canvases now keep a per-surface identity instead of falling back to the global mirror epoch, and late-arriving mirrored source images are still associated with the visible page so the scanning pill can settle to a usable OCR layer after scroll/page-turn/refocus churn.': 'キャンバスはグローバルなミラーエポックへフォールバックせず、面ごとの識別子を保持します。また、遅れて届いたミラー元画像も表示中ページに紐づけるため、スクロール、ページめくり、再フォーカスの揺れのあとでもスキャン表示が使用可能なOCRレイヤーへ落ち着きます。',
    'Kept Yomu annotations from breaking compact controls, composer/editable placeholders, and carousel/card layouts by skipping placeholder-like surfaces, suppressing ruby in constrained chrome, and preserving native form-control text.': 'コンパクトな操作部品、入力欄やエディターのプレースホルダー、カルーセル／カードレイアウトを、よむの注釈が崩さないようにしました。プレースホルダーらしい面をスキップし、狭いUIではルビを抑え、フォーム部品の本来の文字表示を保ちます。',
    'Added regression coverage for ChatGPT/Claude-like composers, account-picker controls, form placeholders, visible-page scanning, and BookWalker-style carousel overflow.': 'ChatGPT／Claude風の入力コンポーザー、アカウント選択コントロール、フォームのプレースホルダー、表示ページスキャン、BookWalker風カルーセルのはみ出しに対する回帰テストを追加しました。',
    'Extended the Japanese site-language redirect to rewrite existing generic English locale query hints, so multilingual sites that use `locale`, `language`, `region`, `mkt`, or similar parameters request Japanese without needing a site-specific rule.': '日本語サイト言語リダイレクトを拡張し、既存の汎用的な英語ロケールクエリヒントを書き換えるようにしました。`locale`、`language`、`region`、`mkt`などのパラメーターを使う多言語サイトでは、サイト個別のルールがなくても日本語を要求できます。',
    'Extended the Japanese site-language redirect to rewrite existing generic English locale query hints, so multilingual sites that use': '日本語サイト言語リダイレクトを拡張し、既存の汎用的な英語ロケールクエリヒントを書き換えるようにしました。次のようなパラメーターを使う多言語サイトでは',
    ', or similar parameters request Japanese without needing a site-specific rule.': 'など、同種のパラメーターで、サイト個別のルールがなくても日本語を要求できます。',
    'Fixed BookWalker single-viewport vertical reading (cty=2) where OCR re-scanned on every small scroll and never settled past the first page: scroll position and mirror-epoch churn no longer count as a page turn, so the OCR overlay and its hover lookup survive within-page scrolling while genuine page turns still re-OCR the new page.': 'BookWalkerの単一ビューポート縦読み（cty=2）で、少しスクロールするたびにOCRが再スキャンされ、最初のページ以降は安定しなかった問題を修正しました。スクロール位置やミラーエポックの変動をページめくりとして扱わなくなったため、ページ内スクロール中もOCRオーバーレイとそのホバー辞書引きが維持され、実際のページめくりでは引き続き新しいページをOCRします。',
    'Sized the YouTube transcript "jump to current line" button to match the other subtitle panel toolbar buttons under touch/coarse-pointer and narrow layouts (e.g. iPad), where it was rendering noticeably smaller than its neighbours. It still collapses away while auto-follow is active.': 'タッチ／粗いポインターや狭いレイアウト（iPad など）で、YouTube 文字起こしの「現在の行へジャンプ」ボタンが他の字幕パネルのツールバーボタンより明らかに小さく表示されていたため、サイズを揃えるようにしました。自動追従が有効な間は、これまでどおり折りたたまれて非表示になります。',
    'Repaired scanned/image-backed PDFs in the hosted PDF reader so broken embedded OCR text layers are hidden, Yomu image OCR is used for lookup, and passive OCR text/furigana stay invisible until hover or focus.': 'ホスト版PDFリーダーで、スキャン画像ベースのPDFを修正しました。壊れた埋め込みOCRテキストレイヤーを隠し、検索にはよむの画像OCRを使い、受け身のOCRテキストやふりがなはホバーまたはフォーカスまで見えないままにします。',
    'Kept generated page-word highlights light on NHK Easy and other bright pages while still measuring them for readable text contrast, so hover no longer appears to fix an overly dark normal highlight.': 'NHK NEWS WEB EASYなどの明るいページで、生成されたページ単語ハイライトを明るいまま保ちつつ、読みやすい文字コントラストの測定は続けるようにしました。通常時のハイライトが暗すぎて、ホバーすると直ったように見える問題を防ぎます。',
    'Let active scanned page text wrap normally in narrow prose, card, and sidebar containers while keeping passive controls and text mirrors on their compact wrapping rules.': '狭い本文、カード、サイドバー内では、アクティブにスキャンされたページ本文が通常どおり折り返せるようにしました。パッシブな操作部品とテキストミラーは、コンパクトな折り返しルールを維持します。',
    'Treated image-backed PDF OCR text layers as scanned pages, hiding the broken embedded text layer and routing lookup through Yomu image OCR without visible passive overlays.': '画像ベースのPDFに埋め込まれたOCRテキストレイヤーをスキャンページとして扱うようにしました。壊れた埋め込みテキストレイヤーを隠し、見えてしまう常時オーバーレイを出さずに、よむの画像OCRを通して辞書検索を行います。',
    'Published the Reddit Japanese locale fix with the OCR release regression focused on rendered text instead of runner-specific provider timing.': 'ランナー固有のプロバイダー呼び出しタイミングではなく、描画されたテキストに焦点を当てたOCRリリース回帰テストにして、Redditの日本語ロケール修正を公開しました。',
    'Published the Reddit Japanese locale fix with a deterministic OCR release regression test across CI runners.': 'CIランナー間で安定して動く決定的なOCRリリース回帰テストにしたうえで、Redditの日本語ロケール修正を公開しました。',
    'Published the Reddit Japanese locale fix after hardening the release OCR regression test against jsdom image-load timing.': 'jsdomの画像読み込みタイミングに左右されないようリリース用OCR回帰テストを強化したうえで、Redditの日本語ロケール修正を公開しました。',
    'Fixed the docs navbar overflow ("…") menu showing a stray "GitHub" text label next to both the GitHub and Discord icons. The social links are now rendered icon-only, as two separate, evenly spaced links.': 'ドキュメントのナビゲーションバーのオーバーフロー（「…」）メニューで、GitHubとDiscordの両方のアイコン横に余計な「GitHub」テキストが表示されていた問題を修正しました。ソーシャルリンクは、2つの独立した等間隔のリンクとしてアイコンのみで描画されるようになりました。',
    'Fixed BookWalker raster OCR rescans on real reader pages by auto-scanning canvas-only viewers, dropping poisoned empty raster cache entries, retrying transient empty captures, reporting OCR transport failures as failures, and releasing collapsed recycled canvases instead of leaving stale Text ready or No text found pills.': '実際のBookWalkerリーダーページで、ラスターOCRの再スキャンを修正しました。キャンバスのみのビューワーを自動スキャンし、汚染された空のラスターキャッシュを破棄し、一時的な空キャプチャを再試行し、OCR通信エラーを失敗として表示し、折りたたまれた再利用キャンバスを解放することで、古い「テキスト準備完了」や「文字が見つかりません」ピルが残らないようにしました。',
    "Released the Reddit Japanese site-language fix on a fresh version, using Reddit's working Japanese locale URL hint instead of the stripped translation hint.": 'Redditの日本語サイト言語修正を新しいバージョンとしてリリースしました。削除されてしまう翻訳ヒントではなく、Redditが認識する日本語ロケールURLヒントを使用します。',
    'Fixed BookWalker continuous/vertical (': 'BookWalkerの連続／縦方向（',
    ') OCR leaving empty overlays — no hover/tap lookup — and dropping OCR after the window was defocused and refocused. The tainted DRM page canvases keyed their per-page identity on a single global mirror epoch that churns on every composite, so each asynchronous page capture was invalidated before it could land and every epoch tick read as a page turn that wiped the overlay. Each tainted page canvas now derives its own stable source-image fingerprint, so captures land and overlays survive the churn while genuine page turns still refresh.': '）のOCRで空のオーバーレイだけが残り、ホバー／タップ検索ができず、ウィンドウを一度外して戻るとOCRが消えていた問題を修正しました。DRMで汚染されたページキャンバスは、各ページの識別に合成ごとに変化する単一のグローバルミラーエポックを使っていたため、非同期キャプチャが反映される前に毎回無効化され、エポック更新のたびにページめくりと扱われてオーバーレイが消えていました。現在は汚染された各ページキャンバスが安定した元画像フィンガープリントを持つため、キャプチャが反映され、実際のページめくりでは更新しながらオーバーレイも維持されます。',
    'Fixed YouTube subtitle side-panel resizing so left-docked panels reserve space immediately, the video frame shrinks with the panel instead of being overlaid, and transcript current-line/programmatic scrolling no longer disables auto-follow.': 'YouTube字幕サイドパネルのリサイズを修正しました。左ドックのパネルはすぐに領域を確保し、動画フレームはパネルに重ならず一緒に縮み、文字起こしの現在行／プログラムスクロールで自動追従が無効にならないようにしました。',
    'Reduced YouTube transcript lookup churn by enriching subtitle parse batches together before rendering rows, so furigana, pitch, and word status apply line-by-line instead of trickling in word-by-word.': 'YouTube文字起こしの検索負荷を減らしました。字幕解析バッチを行の描画前にまとめて補強するため、ふりがな、ピッチ、単語状態が単語ごとに少しずつ出るのではなく、行単位でそろって反映されます。',
    "Kept paused-frame OCR hitboxes above YouTube's native control strip so native controls remain usable while OCR is visible.": '一時停止フレームOCRのヒットボックスをYouTube本来のコントロールバーより上に保ち、OCR表示中もネイティブ操作を使えるようにしました。',
    'Fixed Jiten/dictionary furigana rendering so ruby readings align to their matching kanji instead of spanning the whole referenced word.': 'Jiten／辞書のふりがな描画を修正し、参照語全体にまたがるのではなく、対応する漢字に読みがそろうようにしました。',
    'Kept BookWalker and other reader-raster OCR status accurate while canvas captures prepare, and handed the scanning pill off to the ready OCR layer without leaving stale loading UI.': 'BookWalkerなどのラスターリーダーOCRで、キャンバスキャプチャの準備中も状態表示を正確に保ち、古い読み込み表示を残さず「スキャン中」ピルから準備完了のOCRレイヤーへ引き継ぐようにしました。',
    'Kept automatic dark-mode OCR word highlights accent-tinted by default, avoiding the unreadable white-text-on-light-highlight combination while preserving the custom color option.': 'ダークモードの自動OCR単語ハイライトは、既定でアクセント色寄りの背景を保つようにしました。読みにくい白文字と明るいハイライトの組み合わせを避けつつ、カスタム色オプションはそのまま使えます。',
    "Replaced Reddit's stripped Japanese translation URL hint with Reddit's working Japanese locale URL hint, so the Japanese site-language preference can load Reddit's Japanese shell instead of normalizing back to the English feed URL.": 'Redditで削除されてしまう日本語翻訳URLヒントを、Redditが認識する日本語ロケールURLヒントに置き換えました。日本語サイト言語の優先設定で、英語フィードURLへ正規化されずにRedditの日本語UIを読み込めるようになります。',
    'Stabilized BookWalker manga OCR in normal and continuous-scroll modes by ignoring hidden canvas buffers, fingerprinting the whole visible page instead of one corner, keeping readiness through equivalent canvas swaps, and preserving the current OCR layer/status through same-page blank or hidden-buffer flicker.': 'BookWalkerマンガのOCRを通常表示と連続スクロール表示で安定化しました。非表示キャンバスバッファを無視し、ページの一部ではなく表示ページ全体でフィンガープリントを作り、同等のキャンバス差し替えでも読み取り準備状態を保ち、同一ページの一時的な空白や非表示バッファのちらつきでも現在のOCRレイヤーとステータスを維持します。',
    'Hover lookup now follows a moving mouse pointer across parsed words instead of restarting the open delay on every word, so the popup opens without requiring the cursor to stop.': 'ホバー検索が、解析済み単語の上を移動中のマウスポインターにも追従するようになりました。単語ごとに開く遅延を最初からやり直さないため、カーソルを止めなくてもポップアップが開きます。',
    'Fixed Discord and other modern dark app shells whose computed colors use OKLab, so Yomu uses the real dark surface instead of falling back to white and turning passive highlights or text black.': 'Discordなど、算出色にOKLabを使う新しいダークUIで、Yomuが実際の暗い面を使うように修正しました。白背景にフォールバックしてパッシブハイライトや文字が黒くなる問題を防ぎます。',
    "Kept Reddit's web-component app shell on non-destructive page-text mirrors, so scrolling feeds and sidebars keep their native DOM while Yomu annotations remain visible.": 'RedditのWeb Componentアプリシェルでは、ページ本文の注釈を非破壊テキストミラーで表示するようにしました。スクロール中のフィードやサイドバーはサイト本来のDOMを保ちつつ、よむの注釈も表示されます。',
    "Added Reddit's Japanese translation parameter to the Japanese site-language preference.": '日本語サイト言語の優先設定に、Redditの日本語翻訳パラメーターを追加しました。',
    'Fixed same-tab Google Drive authorization on Chrome by returning the OAuth token through the URL fragment instead of window.name, so Sync and Restore resume after Google sign-in.': 'Chromeで同じタブのGoogle Drive認証が失敗していた問題を修正しました。OAuthトークンをwindow.nameではなくURLフラグメント経由で返すことで、Googleログイン後に同期と復元が再開されます。',
    'Refreshed fast reader popups after fallback words resolve through the API, so first-load lookups immediately show JPDB/Jiten status and pitch accent details instead of needing repeated taps.': 'フォールバック単語がAPI経由で解決されたあと、高速表示のリーダーポップアップを自動更新するようにしました。初回読み込みの検索でも、何度もタップし直さずにJPDB/Jitenの状態とピッチアクセント詳細がすぐ表示されます。',
    'Preserved kanji popup back navigation when dictionary lookup links wrap an already parsed Yomu word.': '辞書検索リンクがすでに解析済みのYomu単語を包んでいる場合でも、漢字ポップアップの戻るナビゲーションを保つようにしました。',
    'Reworked Google Drive settings sync/restore in userscript contexts to use same-tab OAuth redirects instead of popups, with automatic resume after returning from Google.': 'ユーザースクリプト環境のGoogle Drive設定同期／復元を、ポップアップではなく同じタブのOAuthリダイレクトで行うように作り直しました。Googleから戻ったあとに自動で同期／復元を再開します。',
    'Kept BookWalker product and storefront text native while adding passive lookup spans, so enabling Yomu no longer hides titles, descriptions, cart buttons, registration cards, or sidebar text behind broken mirrors.': 'BookWalkerの商品ページとストアフロントの文字をネイティブのまま保ち、受け身の検索spanだけを追加するようにしました。よむを有効にしても、タイトル、説明文、カートボタン、会員登録カード、サイドバー文字が壊れたミラーの裏に隠れなくなります。',
    'Kept BookWalker reader OCR status pills visible after a page finishes scanning, removing the Scanning → disappear → reappear flicker while the OCR layer is still current.': 'BookWalkerリーダーでページのスキャン完了後もOCR状態ピルを表示したままにし、OCRレイヤーが有効な間に「Scanning」→消える→再表示のようにちらつく問題をなくしました。',
    'Reduced common BookWalker manga page scans to one OCR provider request when the normal pass already found text, while still retrying the inverted dark-panel pass for empty pages.': '通常パスですでに文字が見つかったBookWalker漫画ページでは、一般的なスキャンをOCRプロバイダー1回のリクエストに減らしました。空ページでは暗いコマ向けの反転パスを引き続き再試行します。',
    'Restored continuous side-panel resizing for Yomu Video and YouTube subtitles: hosted videos now use the generic video inset again, while YouTube stable side panels can grow past existing free space by shrinking the player width during resize.': 'Yomu VideoとYouTube字幕のサイドパネルを連続リサイズできるように戻しました。ホスト動画は再び汎用の動画インセットを使い、YouTubeの安定サイドパネルはリサイズ中にプレイヤー幅を縮めることで、既存の空きスペースを超えて広げられます。',
    'Kept the settings puck clickable when it overlaps the YouTube/Yomu Video transcript side panel.': 'YouTube/Yomu Videoの文字起こしサイドパネルに重なっているときも、設定ボタンをクリックできるようにしました。',
    'Kept signed-in YouTube comment bodies on non-destructive text mirrors so comments remain annotated without inline reader spans, preventing YouTube DOM churn from duplicating or rewriting comment text.': 'ログイン済みYouTubeのコメント本文を非破壊テキストミラーで表示し、コメントに注釈を残しながらインラインのリーダーspanを入れないようにしました。YouTube側のDOM更新でコメント文字が重複したり書き換わったりするのを防ぎます。',
    'Aligned review grading shortcuts in Settings > Shortcuts so grade controls start together instead of sharing the row with Study navigation keys.': '設定 > ショートカットでレビュー採点ショートカットの位置をそろえ、採点コントロールが学習ナビゲーションキーと同じ行に入り込まず、まとまって次の行から始まるようにしました。',
    'Guarded early YouTube userscript startup before `document.documentElement`, `document.head`, or `document.body` exists, removing page-load theme/runtime errors during signed-in live/watch smoke runs.': '`document.documentElement`、`document.head`、または`document.body`がまだ存在しない早期のYouTube userscript起動を保護し、ログイン済みライブ／視聴ページのスモーク中に出ていた読み込み時のテーマ／ランタイムエラーを解消しました。',
    'Guarded early YouTube userscript startup before': '早期のYouTube userscript起動で',
    ',': '、',
    ', or': '、または',
    'exists, removing page-load theme/runtime errors during signed-in live/watch smoke runs.': 'がまだ存在しない段階を保護し、読み込み時のテーマ／ランタイムエラーをログイン済みライブ／視聴ページのスモーク中に出さないようにしました。',
    'Repaired BookWalker continuous-scroll OCR in Firefox, WebKit, and Chromium so visible vertical pages show scanning/status feedback and ready OCR words stay selectable.': 'Firefox、WebKit、ChromiumでBookWalkerの連続スクロールOCRを修正し、表示中の縦方向ページにスキャン／状態表示が出て、準備済みのOCR単語を選択できるようにしました。',
    'Kept normal BookWalker page taps working outside OCR text while routing taps on OCR words to lookup instead of page turns.': 'OCRテキスト外では通常のBookWalkerページタップを維持し、OCR単語上のタップはページ送りではなく辞書検索に送るようにしました。',
    'Restored BookWalker title and description annotation with furigana and pitch while keeping reader settings/menu controls passive.': 'BookWalkerのタイトルと説明文にふりがなとピッチ注釈を復旧しつつ、リーダー設定やメニュー操作はパッシブのまま保つようにしました。',
    'Aligned dictionary furigana for mixed kana/kanji headwords such as `あなた達[たち]`, so kana outside the annotated kanji no longer pulls ruby out of position.': '`あなた達[たち]`のようなかな／漢字混在の辞書見出しでふりがなの位置をそろえ、注釈対象の漢字以外のかながルビ位置をずらさないようにしました。',
    'Aligned dictionary furigana for mixed kana/kanji headwords such as': '次のようなかな／漢字混在の辞書見出しでふりがなの位置をそろえました:',
    ', so kana outside the annotated kanji no longer pulls ruby out of position.': '。注釈対象の漢字以外のかながルビ位置をずらさないようにしました。',
    'Kept the default dark-mode OCR word highlight on an accent-tinted background while preserving the explicit dark overlay setting.': 'ダークモードの既定OCR単語ハイライトをアクセント色ベースの背景に戻し、明示的なダークオーバーレイ設定はそのまま残しました。',
    'Stabilized YouTube/Yomu Video side-panel resizing and native fullscreen control hit-testing after transcript rows are rendered.': '文字起こし行の描画後もYouTube/Yomu Videoのサイドパネルリサイズとネイティブ全画面操作のヒット判定が安定するようにしました。',
    'Contained BookWalker storefront annotations in passive, ruby-free text mirrors so enabling Yomu no longer shifts homepage carousels, product grids, clamped titles, or sidebar cards.': 'BookWalkerストアフロントの注釈を、受け身でルビなしのテキストミラー内に閉じ込めました。よむを有効にしてもホームページのカルーセル、商品グリッド、省略表示のタイトル、サイドバーカードの位置やサイズが崩れなくなります。',
    'Dropped stale OCR status/results when BookWalker swaps a canvas frame to a new page, preventing previous-page “Text ready” overlays from surviving page turns.': 'BookWalkerがキャンバスフレームを新しいページへ差し替えたときに古いOCR状態／結果を破棄し、前ページの「テキスト準備完了」オーバーレイがページめくり後に残らないようにしました。',
    'Renamed the root installable docs PWA manifest to visible よむ branding and added the compat live-site smoke command for YomuYomu and current anime player targets.': 'ルートのインストール可能なドキュメントPWAマニフェストを、表示名でもよむブランドになるように変更し、YomuYomuと現在のアニメプレイヤー対象を確認する互換ライブサイトスモークコマンドを追加しました。',
    'Hid Yomu Video subtitles sooner when the tracked video is mostly scrolled away so captions do not follow the user into comments.': '追跡中の動画がほとんど画面外へスクロールされた時点でYomu Videoの字幕をより早く非表示にし、字幕がコメント欄まで付いてこないようにしました。',
    'Kept native/secondary captions on a stable smaller font while Japanese subtitles retain the configured size/readable floor.': 'ネイティブ／第二字幕は安定した小さめのフォントサイズに保ち、日本語字幕は設定されたサイズと読みやすい最小値を維持するようにしました。',
    'Retried active hover audio with the current hover lookup generation so returning to the same hover card keeps real audio eligible instead of treating it as stale duplicate autoplay.': '同じホバーカードへ戻ったときに古い重複自動再生と誤判定されないよう、アクティブなホバー音声の再試行に現在のホバー検索世代を渡すようにしました。',
    'Shared Apple Pencil/stylus control activation across reader popovers and the hosted Study surface so kanji buttons, links, toggles, and trace controls respond on the first pen tap without duplicate clicks.': 'リーダーポップオーバーとホスト版学習画面でApple Pencil／スタイラス用のコントロール起動処理を共通化し、漢字ボタン、リンク、トグル、なぞり表示の操作がペンタップ1回で反応し、重複クリックしないようにしました。',
    'Repaired Yomu Video and YouTube subtitle layout regressions: left/right transcript panels now stay flush without covering the player, subtitles stay anchored to the player or hide while scrolling into comments, and fullscreen geometry updates immediately while video is playing.': 'Yomu VideoとYouTubeの字幕レイアウト退行を修正しました。左／右の文字起こしパネルはプレイヤーを覆わず端にそろい、字幕はプレイヤーに固定されるかコメント欄へスクロールしたときに非表示になり、再生中でも全画面切り替え直後に位置が更新されます。',
    'Restored direct subtitle height dragging, stabilized subtitle font sizing, added a Reset defaults button to subtitle style controls, and contained style popover pointer events so controls no longer activate subtitles underneath.': '字幕の高さを直接ドラッグ調整できる操作を復旧し、字幕フォントサイズを安定させ、字幕スタイル操作に「標準に戻す」ボタンを追加しました。スタイルポップオーバーのポインターイベントも閉じ込め、操作中に下の字幕が反応しないようにしました。',
    'Made the compact subtitle rail buttons consistent and highlighted active fullscreen/zoom state with the accent color.': 'コンパクト字幕レールのボタンサイズと形をそろえ、全画面／ズーム中の有効状態をアクセント色で表示するようにしました。',
    'Study Pass/Fail grading now uses a dedicated two-button mobile layout, so Fail and Pass stay wide, centered, and inside the viewport.': 'StudyのPass/Fail採点は専用の2ボタンモバイルレイアウトを使うようになり、FailとPassが広く中央に配置され、画面内に収まります。',
    'Revealed Study answers recover kana readings from annotated card text such as `前方[ぜんぽう]`, while keeping the front side unspoiled.': 'Studyで答えを表示したとき、`前方[ぜんぽう]`のような注釈付きカードテキストからかな読みを復元します。表面では答えを出さないままです。',
    'Revealed Study answers recover kana readings from annotated card text such as': 'Studyで答えを表示したとき、次のような注釈付きカードテキストからかな読みを復元します:',
    ', while keeping the front side unspoiled.': '。表面では答えを出さないままです。',
    'Hosted/accountless Study search can fetch JPDB public vocabulary pages again, restoring public definitions and keeping recorded audio ahead of browser text-to-speech.': 'ホスト版/アカウントなしのStudy検索でJPDB公開語彙ページを再び取得できるようになり、公開定義が復活し、録音音声がブラウザ読み上げより優先されます。',
    'Study term pitch underlines render through the pseudo underline without stacking native underlines, text shadows, or box shadows.': 'Studyの語句ピッチ下線は疑似下線で描画され、ネイティブ下線、テキストシャドウ、ボックスシャドウが重ならなくなりました。',
    'Settings now puts the review rating scale directly in Study and clarifies Jiten/JPDB credential separation, provider-scoped Study decks, and AnkiConnect setup/CORS guidance.': '設定ではレビュー評価スケールをStudy内に直接配置し、Jiten/JPDB認証情報の分離、サービスごとのStudyデッキ、AnkiConnect設定/CORS案内を明確にしました。',
    'Made the docs homepage installable as the root Yomu PWA shell, with offline navigation fallback and shortcuts into Study, Video, PDF, and setup docs.': 'ドキュメントのホームページをYomu全体のルートPWAシェルとしてインストールできるようにし、オフライン時のナビゲーションフォールバックと、Study、Video、PDF、セットアップ手順へのショートカットを追加しました。',
    'Added a YomuYomu reader parser for canvas-backed story pages, using the page\'s Japanese fallback text to provide popup lookup/mining without fighting the site\'s own custom reader controls.': 'キャンバスで描画されるYomuYomuのストーリーページ向けリーダーパーサーを追加し、ページ内の日本語フォールバックテキストを使って、サイト独自のリーダー操作と衝突せずにポップアップ検索/マイニングできるようにしました。',
    'Broadened generic subtitle language inference so Japanese, JP/JPN, native, English, and Japanese-language labels are classified consistently across page tracks, local subtitle files, and Jimaku-style anime subtitle lookup flows.': '汎用字幕の言語推定を広げ、日本語、JP/JPN、native、English、日本語表記のラベルを、ページ内トラック、ローカル字幕ファイル、Jimaku形式のアニメ字幕検索フローで一貫して分類できるようにしました。',
    'BookWalker OCR now treats visible two-page spreads and vertical continuous-scroll page runs as active surfaces instead of collapsing to a stale currentScreen marker, so tapping either page in horizontal mode or the visible page in continuous mode triggers OCR.': 'BookWalkerのOCRは、表示中の見開きページや縦方向の連続スクロールのページ列を、古いcurrentScreenマーカーだけに絞り込まずアクティブな面として扱うようになりました。横方向モードでは左右どちらのページをタップしても、連続モードでは表示中のページをタップしてもOCRが起動します。',
    'Reduced BookWalker continuous-scroll churn by keeping scroll offset out of the page signature for persistent page stacks, preventing repeated OCR frame teardown while scrolling on iPad.': 'BookWalkerの連続スクロールで、永続的なページ列ではスクロール位置をページ署名から外し、iPadでスクロール中にOCRフレームの破棄と再作成が繰り返されないようにしました。',
    'Stopped Yomu from annotating BookWalker reader settings and menu chrome, so native labels like page movement direction remain compact and furigana no longer wraps controls.': 'よむがBookWalkerリーダーの設定やメニューのUI文字を注釈しないようにしました。ページ移動方向などのネイティブなラベルはコンパクトなまま保たれ、ふりがながコントロール内で折り返さなくなります。',
    'Kept compact app chrome labels and action buttons readable and tappable by suppressing furigana and hover highlight paint only inside short fixed-height navigation/control labels, while preserving ruby on normal prose links and ruby-capable content chips.': '短い固定高のナビゲーション／操作ラベルの中だけふりがなとホバーハイライト描画を抑えることで、コンパクトなアプリUIラベルやアクションボタンを読みやすくタップしやすいまま保ち、通常の本文リンクやルビ対応のコンテンツチップではルビを維持するようにしました。',
    'Local pitch and frequency dictionaries': 'ローカルのピッチ/頻度辞書',
    'The Study answer side now shows the reading with furigana, pitch accent, a frequency pill, and an audio button at the top of the card when those details are available. For the most private and reliable setup, keep those details local:': '学習カードの答え面では、利用可能な場合、カード上部にふりがな付きの読み、ピッチアクセント、頻度ピル、音声ボタンを表示します。もっともプライベートで安定した設定にするには、これらの情報をローカルに置いてください。',
    'Frequency: install JPDBv2㋕ from Settings → Dictionaries. Kuuuube documents it as the recommended JPDB v2.2 frequency package, with kana-frequency display and high corpus coverage.': '頻度: 設定 → 辞書からJPDBv2㋕をインストールします。Kuuuubeはこれを、かな頻度表示と高いコーパスカバー率を備えた推奨JPDB v2.2頻度パッケージとして説明しています。',
    'Frequency:': '頻度:',
    ' install JPDBv2㋕ from Settings → Dictionaries. Kuuuube documents it as the recommended JPDB v2.2 frequency package, with kana-frequency display and high corpus coverage.': ' 設定 → 辞書からJPDBv2㋕をインストールします。Kuuuubeはこれを、かな頻度表示と高いコーパスカバー率を備えた推奨JPDB v2.2頻度パッケージとして説明しています。',
    'Pitch accent: import a Yomitan-compatible pitch dictionary that matches your licensing comfort. The Kanjium source data documents pitch-accent additions under CC BY-SA 4.0, and MarvNC\'s current Yomitan dictionary guide recommends an NHK2016 pitch dictionary; よむ can read pitch metadata from imported Yomitan metadata dictionaries, but the automatic Kanjium/NHK install button is intentionally not shipped until there is a current, license-clear public ZIP URL.': 'ピッチアクセント: ライセンス面で納得できるYomitan互換のピッチ辞書をインポートしてください。Kanjiumの元データはCC BY-SA 4.0でピッチアクセント追加情報を説明しており、MarvNCの現在のYomitan辞書ガイドはNHK2016ピッチ辞書を推奨しています。よむはインポート済みYomitanメタデータ辞書からピッチ情報を読めますが、現在有効でライセンスが明確な公開ZIP URLが確認できるまでは、Kanjium/NHKの自動インストールボタンは意図的に出荷していません。',
    'Pitch accent:': 'ピッチアクセント:',
    ' import a Yomitan-compatible pitch dictionary that matches your licensing comfort. The Kanjium source data documents pitch-accent additions under CC BY-SA 4.0, and MarvNC\'s current Yomitan dictionary guide recommends an NHK2016 pitch dictionary; よむ can read pitch metadata from imported Yomitan metadata dictionaries, but the automatic Kanjium/NHK install button is intentionally not shipped until there is a current, license-clear public ZIP URL.': ' ライセンス面で納得できるYomitan互換のピッチ辞書をインポートしてください。Kanjiumの元データはCC BY-SA 4.0でピッチアクセント追加情報を説明しており、MarvNCの現在のYomitan辞書ガイドはNHK2016ピッチ辞書を推奨しています。よむはインポート済みYomitanメタデータ辞書からピッチ情報を読めますが、現在有効でライセンスが明確な公開ZIP URLが確認できるまでは、Kanjium/NHKの自動インストールボタンは意図的に出荷していません。',
    'Jiten: if you use Jiten, its frequency download remains available in Settings; JPDBv2㋕ is the default local frequency recommendation for users who do not want frequency to depend on a live service.': 'Jiten: Jitenを使う場合、その頻度ダウンロードは引き続き設定で利用できます。頻度をライブサービスに依存させたくないユーザー向けの既定ローカル頻度推奨はJPDBv2㋕です。',
    'Jiten:': 'Jiten:',
    ' if you use Jiten, its frequency download remains available in Settings; JPDBv2㋕ is the default local frequency recommendation for users who do not want frequency to depend on a live service.': ' Jitenを使う場合、その頻度ダウンロードは引き続き設定で利用できます。頻度をライブサービスに依存させたくないユーザー向けの既定ローカル頻度推奨はJPDBv2㋕です。',
    'When the hosted page has been visited once, the PWA cache keeps the Study shell available offline. Cached cards show an Offline cache status, and review grades that cannot reach Jiten, JPDB, or Anki are saved locally and retried when the provider reconnects.': 'ホスト版ページを一度開くと、PWAキャッシュによりStudyのシェルはオフラインでも使えます。キャッシュ済みカードにはOffline cache状態が表示され、Jiten、JPDB、Ankiに届かない採点はローカルに保存され、接続が戻ったときに再試行されます。',
    'When the hosted page has been visited once, the PWA cache keeps the Study shell available offline. Cached cards show an ': 'ホスト版ページを一度開くと、PWAキャッシュによりStudyのシェルはオフラインでも使えます。キャッシュ済みカードには',
    'Offline cache': 'Offline cache',
    ' status, and review grades that cannot reach Jiten, JPDB, or Anki are saved locally and retried when the provider reconnects.': '状態が表示され、Jiten、JPDB、Ankiに届かない採点はローカルに保存され、接続が戻ったときに再試行されます。',
    'Review settings': '復習設定',
    'Open Settings → Study to choose a review source and switch the rating scale between the normal five buttons and a thumb-friendly Fail / Pass mode. On phones, the two-button row uses the full available width so the actions stay centered and easy to hit.': '設定 → 学習を開くと、復習ソースを選び、通常の5ボタン採点と親指で押しやすいFail / Passモードを切り替えられます。スマートフォンでは2ボタン行が利用可能な幅いっぱいを使うため、操作は中央に揃い押しやすく保たれます。',
    'Open Settings → Study to choose a review source and switch the rating scale between the normal five buttons and a thumb-friendly Fail / Pass mode. The same source setting feeds Word, Recall, Listen, and kanji study. On phones, the two-button row uses the full available width so the actions stay centered and easy to hit.': '設定 → 学習を開くと、復習ソースを選び、通常の5ボタン採点と親指で押しやすいFail / Passモードを切り替えられます。同じソース設定がWord、Recall、Listen、漢字学習に使われます。スマートフォンでは2ボタン行が利用可能な幅いっぱいを使うため、操作は中央に揃い押しやすく保たれます。',
    'Open ': '',
    'Settings → Study': '設定 → 学習',
    ' to choose a review source and switch the rating scale between the normal five buttons and a thumb-friendly ': 'を開くと、復習ソースを選び、通常の5ボタン採点と親指で押しやすい',
    'Fail / Pass': 'Fail / Pass',
    ' mode. On phones, the two-button row uses the full available width so the actions stay centered and easy to hit.': 'モードを切り替えられます。スマートフォンでは2ボタン行が利用可能な幅いっぱいを使うため、操作は中央に揃い押しやすく保たれます。',
    ' mode. The same source setting feeds Word, Recall, Listen, and kanji study. On phones, the two-button row uses the full available width so the actions stay centered and easy to hit.': 'モードを切り替えられます。同じソース設定がWord、Recall、Listen、漢字学習に使われます。スマートフォンでは2ボタン行が利用可能な幅いっぱいを使うため、操作は中央に揃い押しやすく保たれます。',
    'Help now shows the current Yomu version, latest available version status, duplicate-script status, and an Update/Reinstall userscript link, with AnkiConnect CORS, mobile, and Brave setup guidance in the same panel.': 'ヘルプに現在のYomuバージョン、利用可能な最新バージョンの状態、重複スクリプト状態、ユーザースクリプトの更新/再インストールリンクを表示するようにし、同じパネルにAnkiConnectのCORS、モバイル、Brave設定ガイドも追加しました。',
    'Collapsed the Help tab\'s long AnkiConnect setup guidance behind an accessible disclosure so the Help section stays compact until setup details are needed.': 'ヘルプタブの長いAnkiConnect設定ガイドをアクセシブルな開閉セクションにまとめ、必要になるまでヘルプ欄をコンパクトに保つようにしました。',
    'Moved Help\'s current version, latest-version check, duplicate-script status, and update link into a compact top strip with shorter copy.': 'ヘルプの現在バージョン、最新版確認、重複スクリプト状態、更新リンクを短い文言のコンパクトな上部ストリップに移しました。',
    'Repaired Study/Newtab reveal so the answer keeps furigana, pitch, frequency, dictionary links, and the study audio button inline without rendering the old duplicate lookup card; local audio clips play/restart without localhost fetch/CORS spam, and optional lookup failures keep their debug logging without surfacing noisy console errors.': 'Study/Newtabの答え表示を修正し、古い重複検索カードを出さずに、ふりがな、ピッチ、頻度、辞書リンク、学習音声ボタンをインラインに保つようにしました。ローカル音声クリップはlocalhostのfetch/CORSノイズなしで再生・再開され、任意の検索失敗はデバッグログに残しつつコンソールに不要なエラーを出しません。',
    'Study answer backs now surface furigana, pitch accents, frequency pills, and audio controls at the top of the revealed word card, matching the popup dictionary layout more closely.': '学習カードの答え面では、表示された単語カードの上部にふりがな、ピッチアクセント、頻度ピル、音声操作を表示し、ポップアップ辞書のレイアウトに近づけました。',
    'Sources settings now includes local pitch and frequency dictionary guidance, a Kanjium pitch guide row, and a JPDBv2 Kana frequency install button so pitch/frequency can be local instead of fetched every time.': 'ソース設定にローカルのピッチ/頻度辞書ガイド、Kanjiumピッチガイド行、JPDBv2 Kana頻度インストールボタンを追加し、ピッチや頻度を毎回取得せずローカルで使えるようにしました。',
    'Two-point Study grading is available in Study settings, and Pass/Fail review controls use the available width with a centered mobile layout.': '学習設定で2段階採点を選べるようになり、Pass/Fail復習操作は利用可能な幅を使ってモバイルでも中央に整うレイアウトになりました。',
    'Fixed hosted Japanese localization coverage for the homepage hero, Read CTA, support cards, updated game-text metadata, media labels, and latest release notes.': 'ホスト版の日本語ローカライズ対象を補強し、ホームページのヒーロー、Read CTA、サポートカード、更新されたゲームテキストのメタデータ、メディアラベル、最新リリースノートが日本語に切り替わるようにしました。',
    'Homepage CTAs now say Install and link directly to Watch and Read tools.': 'ホームページのCTAはInstallと表示し、WatchとReadツールへ直接リンクするようになりました。',
    'Dictionary empty states and recommended dictionary copy now explain that term dictionaries add definitions, while pitch and frequency dictionaries add accents and badges.': '辞書の空状態とおすすめ辞書の文言で、語句辞書は定義を追加し、ピッチ/頻度辞書はアクセントやバッジを追加するものだと説明するようになりました。',
    'Hosted Study now degrades gracefully when userscript bridge, CORS, audio, pitch, or furigana requests are unavailable, including browser coverage for the no-userscript Study reveal path.': 'ホスト版Studyは、ユーザースクリプトブリッジ、CORS、音声、ピッチ、ふりがなのリクエストが使えない場合でも穏やかにフォールバックするようになり、ユーザースクリプトなしのStudy答え表示パスもブラウザでカバーしました。',
    'Offline Study status now makes cached cards and queued grade sync visible after a prior visit.': 'オフラインStudyの状態表示で、以前の訪問後にキャッシュ済みカードと未送信採点の同期が見えるようになりました。',
    'BookWalker canvas OCR now supports both page movement directions, retries manual taps when WebKit only delivers touchstart, and clears stale page captures after turns, reloads, or viewer signature changes.': 'BookWalkerのキャンバスOCRが両方のページ移動方向に対応し、WebKitでtouchstartだけが届く手動タップも再試行し、ページめくり、再読み込み、ビューワー署名の変化後に古いページキャプチャを消すようになりました。',
    'Reduced BookWalker OCR churn and moved translation/status overlays away from the bottom edge so page text remains tappable and visible near the end of the viewport.': 'BookWalkerのOCR再処理の揺れを減らし、翻訳／ステータスのオーバーレイを下端から離したため、ビューポート下部付近のページ本文もタップしやすく見やすいままになります。',
    'Made OCR overlays easier to read on scanned and dark pages with a softer status pill, stronger dark-mode highlight contrast, and a setting to force light, dark, or app-matched overlay styling.': 'スキャンページやダークページでもOCRオーバーレイを読みやすくしました。ステータスピルを控えめにし、ダークモードのハイライトコントラストを強め、ライト／ダーク／アプリ連動のオーバーレイ表示を選べる設定を追加しています。',
    'Centered the Yomu PDF empty drop area, distinguished text PDFs from scanned PDFs, used parsed PDF text where available, and limited OCR canvas overlays to scanned pages so text PDFs stay readable.': 'Yomu PDFの空のドロップ領域を中央に整え、テキストPDFとスキャンPDFを区別するようにしました。利用できる場合はPDFの解析済みテキストを使い、OCRキャンバスのオーバーレイはスキャンページに限定するため、テキストPDFは読みやすいままです。',
    'Recorded ADR 0004 for the gaming distribution strategy and the first Gaming Text Bridge contract sketch.': 'ゲーム配布戦略と最初のGaming Text Bridge契約スケッチをADR 0004として記録しました。',
    'PC & Gaming': 'PC・ゲーム',
    'Use よむ with Steam Deck, PC games, and the lightest OCR or text-hook helper your setup needs.': 'Steam DeckやPCゲームでよむを使い、必要に応じて最小限のOCRまたはテキストフック補助ツールを組み合わせます。',
    'Read games on Steam Deck and PC': 'Steam DeckとPCでゲームを読む',
    'Choose the right handoff path for browser games, copied lines, desktop OCR helpers, and Steam Deck Game Mode.': 'ブラウザゲーム、コピーした行、デスクトップOCR補助ツール、Steam Deck Game Modeに合った受け渡し方法を選びます。',
    'Pick the surface you want to read. よむ keeps the lookup, audio, kanji, and save actions consistent across text, images, games, video, PDFs, and study.': '読みたい対象を選んでください。よむはテキスト、画像、ゲーム、動画、PDF、学習のどこでも、検索、音声、漢字、保存の操作を同じように使えるようにします。',
    'Use よむ with Steam Deck, PC games, and OCR or text-hook helpers when game text needs capture.': 'Steam DeckやPCゲームでよむを使い、ゲームテキストのキャプチャが必要なときはOCRまたはテキストフック補助ツールを組み合わせます。',
    'Read Japanese games on Steam Deck and PC with よむ': 'よむでSteam DeckとPCの日本語ゲームを読む',
    'Open the gaming guide': 'ゲームガイドを開く',
    'Pick the right path': '適切なルートを選ぶ',
    'Steam Deck: safest setup today': 'Steam Deck：今いちばん安全なセットアップ',
    'Why the PWA is not the game overlay yet': 'PWAがまだゲームオーバーレイではない理由',
    'Tool notes': 'ツールメモ',
    'Security checklist': 'セキュリティチェックリスト',
    'What よむ should build next': 'よむが次に作るべきもの',
    'If something feels off': 'うまくいかないとき',
    'Gaming Text Bridge': 'Gaming Text Bridge',
    'Situation': '状況',
    'Use よむ for': 'よむでできること',
    'Add this helper if needed': '必要なら追加する補助ツール',
    'A browser game, web visual novel, text-hook log page, or copied line': 'ブラウザゲーム、Webビジュアルノベル、テキストフックのログページ、コピーした行',
    'Direct lookup, mining, dictionary import, Jiten/JPDB/Anki actions': '直接検索、マイニング、辞書インポート、Jiten／JPDB／Anki操作',
    'None': 'なし',
    'Steam Deck Game Mode with image-only dialogue': '画像だけのセリフがあるSteam Deck Game Mode',
    'Study the copied or exported line after capture': 'キャプチャ後にコピーまたはエクスポートした行を学習',
    'Desktop game or visual novel on Windows/macOS/Linux': 'Windows／macOS／Linuxのデスクトップゲームやビジュアルノベル',
    'Lookup once OCR/text-hook output reaches a browser surface': 'OCRまたはテキストフックの出力がブラウザ面に届いたら検索',
    'A game with subtitles or recorded video': '字幕付きゲームまたは録画した動画',
    'Subtitle lookup, transcript mining, paused-frame OCR': '字幕検索、トランスクリプトのマイニング、一時停止フレームOCR',
    'Yomu Video or the normal userscript on the video page': 'Yomu Video、または動画ページ上の通常ユーザースクリプト',
    'Tool': 'ツール',
    'Useful shape': '役立つ形',
    'License / trust note': 'ライセンス／信頼メモ',
    'Check its current pricing, privacy, and terms before relying on it for sensitive screen content.': '機密性の高い画面内容に使う前に、現在の料金、プライバシー、利用規約を確認してください。',
    'Steam Deck plugin that captures the screen, runs OCR, translates, and shows an overlay.': '画面をキャプチャし、OCRと翻訳を行い、オーバーレイを表示するSteam Deckプラグイン。',
    'GPL-3.0. Review providers before entering API keys; some OCR/translation routes are cloud-based.': 'GPL-3.0。APIキーを入力する前にプロバイダーを確認してください。一部のOCR／翻訳ルートはクラウドベースです。',
    'Desktop OCR overlay with browser dictionary extension support and Yomitan/10ten-style lookup.': 'ブラウザ辞書拡張とYomitan／10ten風検索に対応したデスクトップOCRオーバーレイ。',
    'GPL-3.0. Linux support is X11-focused; Wayland is called out as unsupported for global shortcuts/window positioning.': 'GPL-3.0。Linux対応はX11中心で、Waylandはグローバルショートカットやウィンドウ配置が非対応とされています。',
    'Windows-first game mining stack with OCR/text hooks, overlay lookup, screenshots, audio, and Anki context.': 'OCR／テキストフック、オーバーレイ検索、スクリーンショット、音声、Anki文脈を扱うWindows中心のゲームマイニング環境。',
    'GPL-3.0. Powerful, but it captures screen/audio and talks to Anki or optional AI services.': 'GPL-3.0。強力ですが、画面や音声をキャプチャし、Ankiや任意のAIサービスと通信します。',
    'Desktop companion that brings OCR, texthooker, video subtitle, and clipboard text into a browser UI.': 'OCR、テキストフッカー、動画字幕、クリップボードのテキストをブラウザUIへ持ち込むデスクトップ補助ツール。',
    'AGPL-3.0. It runs a local web UI and has OS-specific capture limits.': 'AGPL-3.0。ローカルWeb UIを動かし、OSごとのキャプチャ制限があります。',
    'Windows real-time screen translator for games and static text.': 'ゲームや静止テキスト向けのWindowsリアルタイム画面翻訳ツール。',
    'Apache-2.0. Translation-focused rather than mining-focused; some translator services may rate-limit or require keys.': 'Apache-2.0。マイニングより翻訳向けです。一部の翻訳サービスはレート制限やキーが必要な場合があります。',
    'Web/Windows app for game OCR, dictionary lookup, translation, and Anki.': 'ゲームOCR、辞書検索、翻訳、Anki向けのWeb／Windowsアプリ。',
    'Commercial service. Check pricing, privacy, and cloud OCR/AI terms before uploading game screenshots.': '商用サービスです。ゲームスクリーンショットをアップロードする前に、料金、プライバシー、クラウドOCR／AI条件を確認してください。',
    'Game2Text Steam Deck guide': 'Game2Text Steam Deckガイド',
    'Reference workflow for Steam Deck mining with Agent.': 'Agentを使ったSteam Deckマイニングの参考ワークフロー。',
    'Good setup reference; verify current tool versions before following older commands.': 'セットアップの参考になります。古いコマンドに従う前に現在のツールバージョンを確認してください。',
    'In Desktop Mode, install a browser plus a userscript manager, then install よむ.': 'Desktop Modeでブラウザとユーザースクリプトマネージャーを入れ、よむをインストールします。',
    'Open Yomu Study or a simple browser note page where copied game lines can live.': 'コピーしたゲームの行を置けるYomu Studyまたは簡単なブラウザメモページを開きます。',
    'If the game text is already copyable, paste it into the browser page and use よむ normally.': 'ゲームテキストがすでにコピーできるなら、ブラウザページに貼り付けて通常どおりよむを使います。',
    'If the game is image-only, use a Steam Deck capture/OCR helper in Game Mode, then copy or retype only the lines worth studying into the browser page.': 'ゲームが画像だけなら、Game ModeでSteam Deck用キャプチャ／OCR補助ツールを使い、学習する価値のある行だけをブラウザページへコピーまたは入力します。',
    'Mine the word or sentence from よむ to Jiten, JPDB, or Anki.': 'よむから単語や文をJiten、JPDB、Ankiへマイニングします。',
    'A browser note or scratch page. Paste an OCR or text-hook line into a local HTML page, note app, or simple web text area.': 'ブラウザメモまたは下書きページ。OCRやテキストフックの行をローカルHTMLページ、メモアプリ、簡単なWebテキスト欄へ貼り付けます。',
    'A text-hooker page. Some visual novel workflows mirror the current line into a browser page. Open よむ there and look up words directly.': 'テキストフッカーページ。一部のビジュアルノベル環境では現在の行をブラウザページにミラーします。そこでよむを開き、単語を直接調べます。',
    'A tool gallery or history page. If your OCR tool stores screenshots or recognized lines in a browser interface, use よむ on the recognized text rather than retyping it.': 'ツールのギャラリーまたは履歴ページ。OCRツールがスクリーンショットや認識済み行をブラウザUIに保存するなら、打ち直さずにその認識テキスト上でよむを使います。',
    'The hosted Study page. Use it for search, review, and mining after you have the word or sentence you want to keep.': 'ホスト版Studyページ。残したい単語や文が決まった後の検索、復習、マイニングに使います。',
    'use the browser/PWA route first when text is already available to a page;': 'テキストがすでにページで使える場合は、まずブラウザ／PWAルートを使います。',
    'keep よむ focused on lookup, dictionaries, mining, and study once text reaches a reader surface.': 'テキストが読み取り面に届いた後は、よむを検索、辞書、マイニング、学習に集中させます。',
    'Do not paste JPDB, Google Cloud, Gemini, or other API keys into tools you have not reviewed.': '確認していないツールにJPDB、Google Cloud、GeminiなどのAPIキーを貼り付けないでください。',
    'Prefer on-device OCR for private game screens when quality is acceptable.': '品質が十分なら、非公開のゲーム画面には端末内OCRを優先してください。',
    'Treat screenshot, audio, clipboard, and AnkiConnect permissions as sensitive. They can expose more than the one sentence you intend to mine.': 'スクリーンショット、音声、クリップボード、AnkiConnectの権限は慎重に扱ってください。マイニングしたい一文以上の情報が露出することがあります。',
    'If a helper uses a local server, bind it to localhost unless you intentionally need LAN access.': '補助ツールがローカルサーバーを使う場合、LANアクセスが明確に必要でない限りlocalhostにバインドしてください。',
    'よむ works on websites but not on the game: that is expected unless the game text has been moved into a browser-readable surface.': 'よむはWebサイトでは動くがゲームでは動かない：ゲームテキストがブラウザで読める面に移されていない限り、それは想定どおりです。',
    'The OCR tool catches too much: shrink the capture region to the dialogue area you actually read.': 'OCRツールが拾いすぎる：実際に読むセリフ領域までキャプチャ範囲を小さくしてください。',
    'A copied line loses spacing or punctuation: clean it before mining; the card should read like a sentence you would want to review.': 'コピーした行の空白や句読点が崩れる：マイニング前に整えてください。カードは復習したい文として読めるべきです。',
    'Open Study': '学習を開く',
    'OCR guide': 'OCRガイド',
    'よむ can look up and mine game dialogue once the line is selectable or browser-readable. It does not yet capture a Steam Deck game window, draw a native in-game overlay, or choose an OCR area by itself.': 'よむは、ゲームのセリフが選択可能またはブラウザで読める状態になれば検索とマイニングができます。現時点ではSteam Deckのゲームウィンドウをキャプチャしたり、ネイティブのゲーム内オーバーレイを描いたり、OCR範囲を自分で選んだりはしません。',
    'This is a handoff workflow, not a live Yomu overlay. You can keep a browser shortcut available in Steam, but the current reliable boundary is still "game text becomes browser text."': 'これは受け渡しワークフローであり、ライブYomuオーバーレイではありません。Steamにブラウザショートカットを置くことはできますが、現在の信頼できる境界は「ゲームテキストがブラウザテキストになる」ことです。',
    'Good browser-readable handoff surfaces include:': 'ブラウザで読める受け渡し面として使いやすいもの：',
    'Browser screen capture APIs are intentionally permission-heavy. The browser asks the user to choose a capture source, permission cannot be persisted for reuse, and each capture needs user activation. Those rules are good for privacy, but they make automatic Game Mode OCR a poor fit for a pure PWA.': 'ブラウザの画面キャプチャAPIは意図的に権限確認が重く作られています。ブラウザはユーザーにキャプチャ元を選ばせ、権限は再利用のために永続化できず、各キャプチャにはユーザー操作が必要です。これはプライバシーには良い設計ですが、純粋なPWAで自動Game Mode OCRを行うには向いていません。',
    'Steam Deck Game Mode adds another boundary: normal web apps do not get Valve overlay privileges such as always-on-top placement, click-through transparency, global hotkeys, or compositor-level game capture. A no-install Yomu page can be a useful companion in the Steam browser or a browser shortcut, but it should be presented as a pause-and-handoff workflow until Yomu has an installed helper.': 'Steam Deck Game Modeにはさらに別の境界があります。通常のWebアプリは、常に手前に出す配置、クリック透過、グローバルホットキー、コンポジターレベルのゲームキャプチャといったValveオーバーレイ権限を得られません。インストール不要のYomuページはSteamブラウザやブラウザショートカット内の補助として役立ちますが、Yomuにインストール型ヘルパーができるまでは、一時停止して受け渡すワークフローとして説明すべきです。',
    'The practical Steam Deck pattern is therefore:': 'そのため、実用的なSteam Deckパターンは次のとおりです：',
    'The product decision is recorded in ADR 0004: Gaming Distribution Strategy.': 'このプロダクト判断はADR 0004：Gaming Distribution Strategyに記録しています。',
    'On desktop, keep the capture region small. Dialogue boxes produce cleaner OCR than whole-screen capture, and a clean sentence makes a better card. You do not need every line in よむ; use the game tool for live play, and bring over the lines that are good cards or worth inspecting.': 'デスクトップではキャプチャ範囲を小さくしてください。画面全体より会話ボックスのほうがきれいなOCRになり、整った文は良いカードになります。すべての行をよむに入れる必要はありません。プレイ中はゲーム用ツールを使い、良いカードになる行や詳しく見たい行だけを持ち込んでください。',
    'The bridge should keep capture and lookup separate. OCR text should be editable before mining, word focus should be keyboard/gamepad reachable, and screenshot or audio context should be saved only after an explicit user action.': 'ブリッジではキャプチャと検索を分けておくべきです。OCRテキストはマイニング前に編集でき、単語フォーカスはキーボードやゲームパッドで到達でき、スクリーンショットや音声の文脈は明示的なユーザー操作の後だけ保存されるべきです。',
    'For now, install よむ for the lookup and mining side, then choose the lightest capture helper your game actually needs.': '今のところは、検索とマイニング側によむを入れ、ゲームに本当に必要な最小限のキャプチャ補助ツールを選んでください。',
    'Made Yomu Study, Yomu Video, and Yomu PDF installable with web app manifests and offline service-worker shells.': 'Yomu Study、Yomu Video、Yomu PDFをWebアプリマニフェストとオフライン用サービスワーカーシェルでインストール可能にしました。',
    'Documented the Cloudflare/Wrangler blocker for a default public Ultimate audio source, including the safe deployment plan and free-tier limits to check before opting in.': '既定の公開Ultimate音声ソースに関するCloudflare/Wrangler上のブロッカーを文書化しました。安全なデプロイ計画と、任意で有効化する前に確認すべき無料枠の制限も含めています。',
    'Improved compatibility with modern anime and app-style sites by treating Vite/Svelte/Astro-style shells as non-destructive scan targets and recognizing more custom video player frames such as Vidstack, Artplayer, XGPlayer, Clappr, and MediaElement wrappers.': 'Vite/Svelte/Astro風のアプリシェルを非破壊スキャン対象として扱い、Vidstack、Artplayer、XGPlayer、Clappr、MediaElementなどのカスタム動画プレーヤーフレームをより多く認識することで、現代的なアニメサイトやアプリ型サイトとの互換性を高めました。',
    'Cleaned streaming-site title noise from Jimaku anime subtitle searches and gave subtitle furigana extra line height to avoid overlap on player overlays.': 'Jimakuのアニメ字幕検索から配信サイト由来のタイトルノイズを取り除き、プレーヤー上の字幕オーバーレイでふりがなが重ならないよう字幕のふりがなに追加の行高を与えました。',
    'Hardened Netflix-shaped reactive DOM captions so Yomu keeps its subtitle foreground stable through brief host caption layer refreshes without repeatedly toggling the site\'s caption controls.': 'Netflix型のリアクティブなDOM字幕を強化し、ホスト側の字幕レイヤーが短時間更新されても、サイトの字幕コントロールを繰り返し切り替えずによむの字幕前景を安定して保つようにしました。',
    'Shipped Google Drive settings sync live for hosted and userscript settings surfaces with the public web OAuth client configured; hosted reader auth runs on Yomu directly, userscripts authenticate through the hosted broker from arbitrary pages, and extension builds keep the extension bridge.': '公開Web OAuthクライアントを設定し、ホスト版とユーザースクリプトの設定画面でGoogle Drive設定同期を有効化しました。ホスト版リーダーはYomu上で直接認証し、ユーザースクリプトは任意のページからホストされたブローカー経由で認証し、拡張機能ビルドは従来の拡張機能ブリッジを使い続けます。',
    'Added a clearer hosted Yomu Video empty state for dropping anime and subtitle files together, with desktop and mobile Playwright screenshots.': '動画と字幕ファイルを一緒にドロップするための、よりわかりやすいホスト版Yomu Videoの空の状態を追加し、デスクトップとモバイルのPlaywrightスクリーンショットを追加しました。',
    'Added "Pause video when mining subtitle" setting option.': '「字幕マイニング時に動画を一時停止」設定オプションを追加しました。',
    'Added Hiragino/Yu Gothic and System UI font family preset settings options.': 'ヒラギノ・遊ゴシックおよびシステムUIのフォントファミリープリセット設定オプションを追加しました。',
    'Themed the subtitle style popover panel to match user theme and accent settings instead of being static dark mode.': '字幕スタイルポップオーバーパネルを、固定のダークモードではなく、ユーザーのテーマとアクセントカラー設定に一致するようにテーマ化しました。',
    'Fixed settings synchronization: updating settings from the subtitle popover now updates the main settings page dialog in real-time.': '設定の同期を修正しました。字幕ポップオーバーから設定を更新すると、メイン設定ダイアログがリアルタイムで更新されるようになります。',
    'Fixed a stale cache-invalidation issue on Chrome (TK\'s bug) by adding version-specific cache keys for reader CSS.': 'リーダーCSSにバージョン固有のキャッシュキーを追加することで、Chromeにおけるキャッシュ無効化の不具合（TK氏から報告されたバグ）を修正しました。',
    'Appearance': '外観',
    'Browser stores': 'ブラウザストア',
    'Preparing': '準備中',
    '. Pick the tool that matches your goal:': '。目的に合ったツールを選んでください：',
    'The loop is always the same:': 'ループはいつも同じです：',
    'Hovering or clicking a subtitle word on a video now pauses the video while the dictionary popover is open, on the homepage demo player and every video site. The default lookup trigger is hover, but only pinned (clicked) lookups paused before — so with the default settings the caption kept scrolling, the popover chased the moving word and never settled, and the wrong word kept getting hit. A hover lookup over a real subtitle/caption surface now pauses too (and resumes when you move off the captions); the popover re-anchors across words while paused, so there is no play/pause flicker. Hover previews over ordinary page text are unchanged.': '動画の字幕の単語にカーソルを合わせるかクリックすると、辞書ポップアップが開いている間は動画が一時停止するようになりました。ホームページのデモプレーヤーでも、あらゆる動画サイトでも有効です。既定のルックアップのトリガーはホバーですが、これまでは固定（クリック）したルックアップしか一時停止しませんでした。そのため既定の設定では字幕が流れ続け、ポップアップが動く単語を追いかけて落ち着かず、違う単語を押してしまっていました。実際の字幕・キャプション面でのホバールックアップでも一時停止するようになり（字幕から離れると再開します）、一時停止中はポップアップが単語間で再アンカーするため、再生・一時停止のちらつきもありません。通常のページテキストへのホバープレビューは変わりません。',
    'Pausing a video in the Yomu player (the homepage demo and the hosted video player) now runs OCR on the paused frame, so on-screen text that is not in the subtitles can be read. Paused-frame OCR was previously suppressed on the Yomu player and now behaves like every other video, while a dictionary or mining pause still skips OCR so a lookup popover is never covered.': 'Yomuプレーヤー（ホームページのデモと埋め込み動画プレーヤー）で動画を一時停止すると、一時停止したフレームをOCRで読み取るようになりました。字幕に含まれない画面内の文字も読めます。これまではYomuプレーヤーでは一時停止フレームのOCRが無効化されていましたが、他の動画と同じように動作します。一方で、辞書・マイニングの一時停止では引き続きOCRをスキップし、ルックアップのポップアップが隠れないようにします。',
    'Tapping a subtitle caption now pauses the video even when the tap lands just off an exact word, such as on the line padding, the furigana, or the gap in a wrapped line. Japanese captions have no spaces between words, so a near-miss tap previously did nothing while the caption kept scrolling, and it now pauses so the word can be tapped cleanly.': '字幕をタップすると、単語の少し外側（行の余白、ふりがな、折り返した行のすき間など）をタップした場合でも動画が一時停止するようになりました。日本語の字幕は単語間にスペースがないため、これまでは少しずれたタップでは何も起こらず字幕が流れ続けていましたが、これからは一時停止するので、単語を正確にタップできます。',
    'On the hosted reader (the homepage demo, the video player, and the New Tab page) Yomu now routes cross-origin dictionary requests through its public CORS proxy when no userscript is installed. Those pages run without the userscript bridge, so they could not reach the jiten and jpdb APIs directly (the browser blocked the requests with no CORS header). As a result the demo video captions fell back to tokens with no reading or pitch, so furigana and pitch accent did not show, and the parse that kept failing re-rendered the caption over and over, which made tapping a word miss and the video keep playing instead of pausing. Routing through the proxy restores readings, pitch, and reliable tap-to-pause.': 'ホスト版リーダー（ホームページのデモ、動画プレーヤー、新しいタブページ）では、ユーザースクリプトが入っていないとき、クロスオリジンの辞書リクエストをよむの公開CORSプロキシ経由で送るようになりました。これらのページはユーザースクリプトのブリッジなしで動くため、jitenやjpdbのAPIに直接アクセスできず（ブラウザがCORSヘッダー無しのリクエストをブロックします）、その結果デモ動画の字幕が読みやピッチのないトークンにフォールバックして、ふりがなとピッチアクセントが表示されず、失敗し続ける解析が字幕を何度も再描画するため、単語をタップしても外れて動画が一時停止せず再生され続けていました。プロキシ経由にすることで、読み・ピッチ・確実なタップでの一時停止が復活します。',
    'iPhone and iPad YouTube caption selections now pause the playing video when the dictionary popover opens, including native YouTube caption text selected through iOS text selection rather than a direct Yomu word tap.': 'iPhoneとiPadでYouTube字幕を選択したとき、辞書ポップアップが開くと再生中の動画を一時停止するようになりました。よむの単語を直接タップした場合だけでなく、iOSのテキスト選択で選んだYouTubeネイティブ字幕にも対応します。',
    "Unknown React/Next/Vue/Angular app shells now use Yomu's non-destructive text mirrors for generic page scans, preventing framework reconciliation crashes such as MCP Market's Critical Application Error while preserving page-text coverage.": '未知の React/Next/Vue/Angular 製アプリシェルでは、汎用ページスキャンに Yomu の非破壊テキストミラーを使うようになりました。ページテキストのカバー範囲を保ちながら、MCP Market の Critical Application Error のようなフレームワーク再調整時のクラッシュを防ぎます。',
    "Clicking a subtitle word on a video now reliably keeps the video paused while the lookup popover is open. Yomu's pause is now self-healing: if the player or a competing extension re-plays the video immediately after the pause, Yomu re-asserts it for a short window (and stands down the moment you close the popover or deliberately resume), so the subtitle no longer keeps advancing past the word you clicked.": '動画の字幕内の単語をクリックすると、ルックアップポップオーバーが開いている間、動画が確実に一時停止したままになるようになりました。Yomu の一時停止は自己修復式になり、プレーヤーや競合する拡張機能が直後に再生しても短時間は再度一時停止します（ポップオーバーを閉じるか自分で再生した瞬間に解除）。そのため、クリックした単語を読んでいる間に字幕が先へ進まなくなります。',
    'Made iPad puck dragging smooth by moving the puck with a compositor-backed transform during touch drags instead of remeasuring layout on every pointer move.': 'iPadでのパックのドラッグを滑らかにしました。タッチドラッグ中は各ポインター移動ごとにレイアウトを測り直さず、コンポジターで処理できるtransformでパックを動かします。',
    'Kept paused-frame OCR status text readable in light mode.': 'ライトモードでも一時停止フレームOCRのステータステキストが読めるようにしました。',
    'Loaded full Jiten study deck vocabulary in the newtab Search/My Cards browser, so source chips and state filters see the whole deck instead of only the current study batch.': '新しいタブの検索／My CardsブラウザーでJiten学習デッキの全語彙を読み込むようにし、ソースチップと状態フィルターが現在の学習バッチだけでなくデッキ全体を見るようにしました。',
    'Removed the standalone Undo study button; Previous now owns recent-review undo and otherwise no-ops on the first card.': '独立した学習用Undoボタンを削除しました。Previousが直近レビューの取り消しを担当し、最初のカードでは何もしません。',
    'Stopped BookWalker canvas OCR from tearing down and re-scanning while the page spread settles, eliminating the hidden reload loop that made the iPad puck feel sluggish.': 'BookWalkerのページ見開きが安定する途中でキャンバスOCRが破棄と再スキャンを繰り返さないようにし、iPadのパック操作を重くしていた見えないリロードループを解消しました。',
    'Kept manually requested BookWalker OCR frames alive when auto-scan gating is off, so hover-triggered OCR text remains usable.': '自動スキャンの条件で止められている場合でも、手動で要求したBookWalkerのOCRフレームを保持し、ホバーで表示したOCRテキストをそのまま使えるようにしました。',
    'Restored hover audio playback for OCR image words.': 'OCR画像内の単語でも、ホバー時の音声再生が動作するようにしました。',
    'Fixed the paused-frame "Text ready" OCR status pill contrast in light mode.': 'ライトモードで一時停止フレームのOCRステータスピル「Text ready」のコントラストを修正しました。',
    'Preserved textarea and text-input selections when dismissing a selection lookup by clicking away, so': '選択ルックアップを外側クリックで閉じても、textareaやテキスト入力内の選択範囲を保持するようにしました。そのため、',
    'selected words stay selected after the Yomu panel closes.': 'よむパネルを閉じた後も選択した単語が選択されたままになります。',
    'Made built-in definition and kanji source display names editable in Settings, and used those custom names in source panels.': '設定で組み込みの定義ソースと漢字ソースの表示名を編集できるようにし、ソースパネルにもそのカスタム名を使うようにしました。',
    'Stabilized BookWalker canvas OCR snapshots in Userscripts/iOS by pinning screenshot-backed OCR frames to the cropped viewport rect immediately and keeping Yomu\'s internal OCR frames out of the generic media refresh loop.': 'Userscripts/iOSのBookWalkerキャンバスOCRスナップショットを安定させました。スクリーンショット由来のOCRフレームを切り抜いたビューポート範囲へすぐ固定し、Yomu内部のOCRフレームを汎用メディア更新ループから外しています。',
    'Updated the hosted homepage video demo copy and Japanese localization to introduce caption reading, word lookup, and paused-screen OCR together.': 'ホスト版ホームページの動画デモ文言と日本語ローカライズを更新し、字幕を読むこと、単語を調べること、一時停止した画面をOCRで読むことをまとめて紹介するようにしました。',
    'Restored paused-frame OCR on hosted Yomu video players, so pausing the homepage sample can snapshot on-screen text for OCR while the subtitle rail still avoids duplicate play controls.': 'ホスト版Yomu動画プレイヤーで一時停止フレームのOCRを復元しました。ホームページのサンプルを一時停止すると画面上のテキストをOCR用にスナップショットでき、字幕レールには重複した再生ボタンを出さないままです。',
    'Restored status highlights on passive link text such as Discord channel names, while keeping compact native controls highlight-free, so pitch underlines no longer leave dark-page text without a readable backing.': 'Discordチャンネル名のような受動的なリンクテキストのステータスハイライトを復元しつつ、コンパクトなネイティブ操作部品にはハイライトを付けないままにしました。これにより、ピッチ下線だけが残って暗いページのテキストが読みにくくなることがなくなりました。',
    'Added a visible Cloud settings synchronization section in Settings -> Sources, beside the settings and dictionary import/export controls, explaining how to use the existing settings JSON export/import as a portable cloud backup.': '設定 → ソースに、設定と辞書のインポート・エクスポート操作のそばへ「クラウド設定同期」セクションを追加しました。既存の設定JSONエクスポート／インポートを、持ち運べるクラウドバックアップとして使う方法を説明します。',
    'YouTube subtitle panels no longer shrink or crop the player when the panel is docked below the video, while left and right panels still reserve player space.': '字幕パネルを動画の下に配置したとき、YouTubeのプレーヤーが縮んだり切り取られたりしなくなりました。左右に配置した場合は、これまで通りプレーヤー用のスペースを確保します。',
    'Mobile subtitle playback is less cramped: long phone-width caption lines wrap inside the screen, the move handle sits out of the central play/pause lane, and tapping the bottom drawer handle closes the subtitle panel.': 'モバイルの字幕再生が窮屈になりにくくなりました。スマホ幅の長い字幕行は画面内で折り返し、移動ハンドルは中央の再生・一時停止操作の邪魔になりにくい位置へ移動し、下部ドロワーのハンドルをタップすると字幕パネルを閉じます。',
    'Tapping a subtitle word now reliably pauses the playing video for dictionary lookup and resumes that same video when the entry closes, even after YouTube swaps or stales the bound video element.': '字幕内の単語をタップすると、辞書を読むために再生中の動画を確実に一時停止し、項目を閉じると同じ動画を再開します。YouTubeが紐づいた動画要素を差し替えたり古くしたりした場合にも対応します。',
    'Mobile YouTube bottom sheets, including expanded descriptions, now hide Yomu\'s player subtitles and rail while they cover the watch page.': '展開した概要欄を含むモバイルYouTubeの下部シートが視聴ページを覆っている間は、よむのプレーヤー字幕と操作レールを隠すようになりました。',
    'A web page, a manga page read through OCR, and a video subtitle line all become the same tappable text, so the dictionary, audio, kanji breakdown, and mining buttons work everywhere — one interface, not six.': 'Webページも、OCRで読み取った漫画のページも、動画の字幕の一行も、すべて同じタップ可能なテキストになるため、辞書、音声、漢字の分解、マイニングのボタンがどこでも機能します。6つではなく、1つのインターフェースです。',
    'How to use these': 'これらの使い方',
    'Japanese Immersion Guides': '日本語没入ガイド',
    'These guides show the': 'これらのガイドでは、',
    'workflows': 'ワークフロー',
    ', then pick a workflow:': 'を紹介します。ワークフローを選んでください：',
    'How to read manga in Japanese': '日本語で漫画を読む方法',
    'The free OCR setup for raw, image-only manga — tap words inside panels and get furigana.': '生の画像のみの漫画のための無料OCRセットアップ。コマの中の単語をタップして、ふりがなを表示します。',
    'Turn anime and YouTube subtitle lines into Anki cards with audio and a screenshot.': 'アニメやYouTubeの字幕の一行を、音声とスクリーンショット付きのAnkiカードに変換します。',
    'Filter YouTube into a Japanese feed, plus a levelled list of channels from N5 to N1.': 'YouTubeを日本語のフィードに絞り込み、さらにN5からN1までのレベル別チャンネルリストを提供します。',
    'Yomitan vs Jiten vs JPDB vs Anki': 'Yomitan・Jiten・JPDB・Ankiの比較',
    'What each one is for, and how to use any or all of them from one popup.': 'それぞれの用途と、1つのポップアップからどれでも、またはすべてを使う方法。',
    'Every guide assumes the same loop:': 'すべてのガイドは同じループを前提としています：',
    'find Japanese you mostly understand, look up only what blocks you, and save the words worth keeping.': 'ほぼ理解できる日本語を見つけ、つまずいたところだけを調べ、残す価値のある単語を保存します。',
    'Read them in any order — jump to today\'s task.': 'どの順番で読んでも構いません。今日のタスクに飛んでください。',
    'How it works': '仕組み',
    'Good for': '向いている用途',
    'Privacy': 'プライバシー',
    'Set it up': 'セットアップ',
    'Questions': 'よくある質問',
    'Japanese OCR & Manga Text Reader': '日本語OCR＆漫画テキストリーダー',
    'in place': 'その場で',
    'for free: tap a word right where you see it and the dictionary opens over the image. That makes it a practical way to read': 'を無料で実現します。見たままの場所で単語をタップすると、画像の上に辞書が開きます。これにより、次のものを実用的に読めるようになります：',
    'manga': '漫画',
    'screenshots': 'スクリーンショット',
    'game captures': 'ゲームのキャプチャ',
    'image-only pages': '画像のみのページ',
    'where normal text selection does nothing.': '通常のテキスト選択が効かない場面で役立ちます。',
    'In one line:': '一言で言うと：',
    'Embedded OCR metadata.': '埋め込み型OCRメタデータ。',
    'A local OCR engine.': 'ローカルOCRエンジン。',
    ', Apple Vision–style results, and': '、Apple Vision式の結果、そして',
    '-shaped responses.': '-型のレスポンス。',
    'Manga': '漫画',
    '— read raw Japanese manga panel by panel, tapping any word you don\'t know.': '— 生の日本語漫画をコマごとに読み、わからない単語をタップできます。',
    'Screenshots & games': 'スクリーンショットとゲーム',
    '— capture a line of dialogue and look it up without retyping.': '— セリフをキャプチャして、打ち直さずに調べられます。',
    'Image-heavy pages': '画像の多いページ',
    '— sites that render Japanese as pictures instead of selectable text.': '— 日本語を選択可能なテキストではなく画像として表示するサイト。',
    'The image itself is': '画像そのものは',
    'not': '決して',
    'uploaded anywhere unless you turn on a local OCR endpoint — and that endpoint is the one you choose in settings, usually running on your own computer. Embedded OCR metadata is read straight from the page.': 'ローカルのOCRエンドポイントを有効にしない限りどこにもアップロードされません。そのエンドポイントは設定で選んだもので、通常はご自身のコンピューター上で動作します。埋め込みのOCRメタデータはページから直接読み取られます。',
    'Install the free': '無料の',
    '(see the': '（',
    'Open a manga or image page with Japanese text.': '日本語テキストのある漫画や画像のページを開きます。',
    'Settings → Images': '設定 → 画像',
    '. For Mokuro and similar embedded data, it just works.': '。Mokuroなどの埋め込みデータなら、そのまま動作します。',
    'Do I need a paid OCR service?': '有料のOCRサービスは必要ですか？',
    'Does my image get uploaded?': '画像はアップロードされますか？',
    'Only if you enable a local OCR endpoint you control. Otherwise nothing leaves your device.': 'ご自身が管理するローカルのOCRエンドポイントを有効にした場合だけです。それ以外は何もデバイスの外に出ません。',
    'OCR details': 'OCRの詳細',
    'Related guide:': '関連ガイド：',
    'How to read manga in Japanese (free setup)': '日本語の漫画を読む方法（無料セットアップ）',
    'You choose how much help': 'どれだけ補助を出すかを選べます',
    'Works everywhere you read': '読む場所すべてで動作します',
    'Furigana Reader for Any Japanese Page': 'あらゆる日本語ページ向けのふりがなリーダー',
    'any': 'あらゆる',
    'Japanese web page for free, with no account, and you control exactly how much shows.': '日本語のWebページで無料・アカウント不要で使え、表示量を細かく自分で調整できます。',
    'Try it:': '試してみる：',
    'Live furigana demo': 'ふりがなのライブデモ',
    'Furigana and word coloring are separate controls, so you can dial reading support to your exact level:': 'ふりがなと単語の色分けは別々のコントロールなので、読みの補助を自分のレベルにぴったり合わせて調整できます：',
    'All words': 'すべての単語',
    '— furigana above everything. Good for absolute beginners and read-alouds.': '— すべての語の上にふりがなを表示します。まったくの初心者や音読に向いています。',
    'Hard kanji only': '難しい漢字のみ',
    '— readings only for less common kanji, so easy words stay clean.': '— あまり一般的でない漢字にだけ読みを表示するので、簡単な単語はすっきりしたままです。',
    'Hide for known words': '既知の単語は非表示',
    '— once you\'ve learned a word (via Jiten, JPDB, or Anki), its furigana disappears, nudging recall.': '— 単語を（Jiten、JPDB、またはAnkiで）覚えると、そのふりがなが消え、思い出すよう促します。',
    'Off': 'オフ',
    '— rely on tap-to-look-up instead.': '— 代わりにタップして調べる方法を使います。',
    'Furigana comes from the same parser that powers lookup, so every word stays': 'ふりがなはルックアップを支えるのと同じ解析器から生成されるため、すべての単語が',
    'tappable': 'タップ可能',
    ': tap for the full meaning, kanji breakdown, pitch, audio, and mining.': 'なままです：タップすれば、詳しい意味、漢字の内訳、ピッチ、音声、マイニングが利用できます。',
    'The same furigana settings apply across every': '同じふりがな設定が、あらゆる',
    'reading surface': '読む場面',
    ': web pages,': '：Webページ、',
    'read through': '読み込んだ',
    'video subtitles': '動画の字幕',
    'on YouTube and your own': 'YouTubeやご自身の',
    'video files': '動画ファイル',
    'Does furigana work on manga and subtitles too?': 'ふりがなは漫画や字幕でも使えますか？',
    'Yes — manga read through': 'はい — 読み込んだ漫画',
    'and video subtitles become the same tappable text, so furigana settings apply there as well.': 'や動画の字幕も同じタップ可能なテキストになるため、ふりがなの設定はそこでも適用されます。',
    'Will it show furigana only for hard words?': '難しい単語だけにふりがなを表示できますか？',
    'Yes — pick "hard kanji only," or hide furigana for words you\'ve already learned in Jiten, JPDB, or Anki.': 'はい —「難しい漢字のみ」を選ぶか、Jiten・JPDB・Ankiですでに学習した単語のふりがなを非表示にできます。',
    'Reading controls': '読書用コントロール',
    'A subtitle overlay built for reading': '読書のために作られた字幕オーバーレイ',
    'Your own video files, no desktop app': 'ご自身の動画ファイルを、デスクトップアプリなしで',
    'Sentence mining to Jiten, JPDB, or Anki': 'Jiten・JPDB・Ankiへの文マイニング',
    'Japanese Subtitle Miner & Video Reader': '日本語字幕マイナー & 動画リーダー',
    'Japanese subtitles become tappable words, with a transcript panel and one-tap sentence mining — on YouTube and on your own video files.': '日本語の字幕がタップ可能な単語になり、文字起こしパネルとワンタップの文マイニングが使えます — YouTubeでも、ご自身の動画ファイルでも。',
    'Tappable Japanese lines': 'タップ可能な日本語の行',
    '— every subtitle word opens the popup dictionary.': '— 字幕のどの単語からもポップアップ辞書が開きます。',
    'A second language track': '2つ目の言語トラック',
    '— show a native-language subtitle line underneath for support.': '— サポートとして母国語の字幕の行を下に表示します。',
    'A transcript panel': '文字起こしパネル',
    '— dock it left, right, or below the video. The active line highlights as it plays, and visible lines are hydrated into the same lookup words, so you can skim, jump to a line, and open a popup without leaving the video.': '— 動画の左、右、または下にドッキングできます。再生中はアクティブな行がハイライトされ、表示されている行は同じルックアップ用の単語として読み込まれるため、ざっと目を通したり、特定の行に飛んだり、動画を離れずにポップアップを開いたりできます。',
    'Shortcuts': 'ショートカット',
    '— previous subtitle, next subtitle, copy subtitle, and mine. The panel can be set to open only while the video is paused, and becomes a bottom sheet on phones so the video stays usable.': '— 前の字幕、次の字幕、字幕のコピー、そしてマイニング。パネルは動画の一時停止中のみ開くように設定でき、スマートフォンではボトムシートになるため動画はそのまま使えます。',
    'Subtitle overlay and transcript on a live Comprehensible Japanese video.': '実際のComprehensible Japaneseの動画上での字幕オーバーレイと文字起こし。',
    'For local files, open the free': 'ローカルファイルの場合は、無料の',
    ', drop in a browser-supported video, and use the': 'を開き、ブラウザ対応の動画を読み込んで、',
    'button to add Japanese or native subtitle files. The page creates normal browser video and text tracks, so the same overlay and transcript tools work': 'ボタンで日本語または母国語の字幕ファイルを追加します。このページは通常のブラウザの動画トラックとテキストトラックを作成するため、同じオーバーレイと文字起こしツールが',
    'without a desktop bridge': 'デスクトップのブリッジなしで',
    'From a subtitle line you can:': '字幕の行から、次のことができます：',
    'Mine to Anki': 'Ankiにマイニング',
    '— with': '—',
    'Mine to Jiten or JPDB': 'JitenまたはJPDBにマイニング',
    '— add the word, mark it, or send a review grade.': '— 単語を追加したり、マークを付けたり、復習の評価を送信したりできます。',
    'asbplayer-style sentence mining, but in the same popup as your dictionary, kanji, and audio.': 'asbplayer風の文マイニングですが、辞書・漢字・音声と同じポップアップ内で行えます。',
    'Open a Japanese video, or open the': '日本語の動画を開くか、',
    'and load a file.': 'を開いてファイルを読み込みます。',
    'Open the subtitle controls, turn on the transcript panel, and tap a word.': '字幕コントロールを開き、文字起こしパネルをオンにして、単語をタップします。',
    'Does it need a desktop app like asbplayer?': 'asbplayerのようなデスクトップアプリは必要ですか？',
    'No — the overlay runs on YouTube, and the in-browser': 'いいえ — オーバーレイはYouTube上で動作し、ブラウザ内蔵の',
    'handles your own files without a desktop bridge.': 'デスクトップブリッジなしでご自身のファイルを扱えます。',
    'Can I mine sentences to Anki?': '文をAnkiにマイニングできますか？',
    'Yes — with AnkiConnect reachable, a subtitle line becomes a card with sentence, audio, and image.': 'はい — AnkiConnectに接続できれば、字幕の1行が文・音声・画像付きのカードになります。',
    'How to mine sentences from anime & YouTube to Anki': 'アニメやYouTubeから文をAnkiにマイニングする方法',
    'What the kanji panel shows': '漢字パネルに表示される内容',
    'Why stroke order in context beats a kanji dictionary': '文脈の中での書き順が漢字辞書に勝る理由',
    'Kanji Stroke Order & Drilldown': '漢字の書き順とドリルダウン',
    'Click a kanji inside the popup headword and the drilldown opens. Depending on your settings and imported data, it can show:': 'ポップアップの見出し語の中の漢字をクリックするとドリルダウンが開きます。設定やインポートしたデータに応じて、次のような内容を表示できます。',
    'Animated stroke order': 'アニメーション付きの書き順',
    'via KanjiVG — watch the correct stroke sequence, then trace it yourself on the built-in pad.': 'KanjiVGを使用 — 正しい書き順を見てから、内蔵のパッドでご自身でなぞれます。',
    'Stroke count, grade, and JLPT level': '画数・学年・JLPTレベル',
    'for placing the kanji.': '漢字の位置づけに役立ちます。',
    'Readings': '読み',
    '(on\'yomi and kun\'yomi).': '（音読みと訓読み）。',
    'RTK data': 'RTKのデータ',
    'for': '対象は',
    'users — keyword and frame.': 'の利用者向け — キーワードとフレーム。',
    'Component hints': '構成要素のヒント',
    'so you can see what the kanji is built from.': 'その漢字が何から構成されているかが分かります。',
    'Related words': '関連語',
    'that use the kanji, so you learn it where it actually appears.': 'その漢字を使う語が分かるので、実際に登場する場面で学べます。',
    'Kanji origin sources are modular and license-aware: you can turn optional public sources on or off independently.': '漢字の出典ソースはモジュール式でライセンスに配慮しており、任意の公開ソースを個別にオン・オフできます。',
    'Open a Japanese page and tap a word that contains kanji.': '日本語のページを開き、漢字を含む語をタップします。',
    'Click the kanji in the popup headword to open the drilldown.': 'ポップアップの見出し語にある漢字をクリックしてドリルダウンを開きます。',
    'Where does the kanji data come from?': '漢字のデータはどこから来ていますか？',
    'Open sources such as KanjiVG. Optional public sources are modular and license-aware — turn each on or off independently.': 'KanjiVGなどのオープンソースです。任意の公開ソースはモジュール式でライセンスに配慮しており、それぞれ個別にオン・オフできます。',
    'Does it show JLPT level and RTK data?': 'JLPTレベルやRTKのデータは表示されますか？',
    'Yes, when those sources are enabled — along with readings, components, and related words.': 'はい、それらのソースを有効にすると表示されます — 読み・構成要素・関連語も併せて表示されます。',
    'Kanji details': '漢字の詳細',
    'Studies whatever you have connected': '接続しているものなら何でも学習',
    'Listen for pitch accent': 'ピッチアクセントを聞き取る',
    'Best daily-review surface on mobile': 'モバイルで最適な毎日の復習画面',
    'new-tab or home page': '新しいタブまたはホームページ',
    'and a Japanese review card greets you every time you open a tab — no app to launch, no streak to babysit. Free, no account.': 'タブを開くたびに日本語の復習カードが迎えてくれます — 起動するアプリも、気にかける連続記録もありません。無料、アカウント不要です。',
    'Open the study page →': '学習ページを開く →',
    'The page tries your sources in order, so it stays useful no matter how much you\'ve set up:': 'このページはソースを順番に試すので、どれだけ設定していても役立ち続けます。',
    'words, when AnkiConnect is reachable.': 'の単語（AnkiConnectに接続できる場合）。',
    'Jiten and JPDB': 'JitenとJPDB',
    'review and status.': 'の復習とステータス。',
    'Local dictionary': 'ローカル辞書',
    'words, from a Yomitan dictionary or JMdict imported into your browser.': 'ブラウザにインポートした Yomitan 辞書や JMdict の単語。',
    'The same source pool feeds Word, Recall, Listen, and Kanji study. Listen builds its local pitch SRS from review words that have classifiable pitch accent, then falls back to local/common words when no provider is connected.': '同じソースプールがWord、Recall、Listen、漢字学習に使われます。Listenは分類できるピッチアクセントを持つ復習語からローカルのピッチSRSを作り、プロバイダーが接続されていない場合はローカル語や一般語にフォールバックします。',
    'Switch to ': '切り替える先: ',
    'Listen': 'Listen',
    ' mode for audio-first pitch practice inspired by Kotu-style downstep drills. Perceive plays a word and asks which downstep position you heard, Recall fronts the word and meaning before you name the contour, and Shadow lets you record yourself locally for comparison.': 'モードでは、Kotu風のダウンステップ練習に着想を得た音声優先のピッチ練習ができます。Perceiveは単語を再生して聞こえたダウンステップ位置を尋ね、Recallは輪郭を答える前に単語と意味を見せ、Shadowは比較用に自分の音声をローカル録音できます。',
    'The Listen deck is local SRS. It grows from the Anki, Jiten, JPDB, or local/common words already feeding study, reviews due pitch items first, and uses minimal-pair contrast replay when よむ can find another word with the same reading and a different accent.': 'ListenデッキはローカルSRSです。学習に使っているAnki、Jiten、JPDB、またはローカル/一般語から増え、期限の来たピッチ項目を優先して復習し、同じ読みでアクセントが異なる別語をよむが見つけられる場合はミニマルペアの対比再生を使います。',
    'A fresh install starts by sending you to': 'インストール直後は、まず次の画面へ案内されます',
    'Settings → Dictionaries': '設定 → 辞書',
    'so JMdict or another Yomitan ZIP can be downloaded into local storage — after that the page works even with no API key or Anki account.': 'そこで JMdict などの Yomitan ZIP をローカルストレージにダウンロードできます。以降は API キーや Anki アカウントがなくてもページが動作します。',
    'On iPhone, iPad, and Android this is often the easiest place to do daily reviews. Add the hosted page as a Home Screen shortcut and study from the habit you already have.': 'iPhone、iPad、Android では、ここが毎日の復習を行う最も手軽な場所になることが多いです。ホストされたページをホーム画面のショートカットに追加し、すでにある習慣の中で学習しましょう。',
    'For full Anki status, note updates, deck scanning, and review queues, keep desktop Anki with AnkiConnect reachable over a LAN or': 'Anki の完全なステータス、ノートの更新、デッキのスキャン、復習キューを使うには、デスクトップ版 Anki を起動し、AnkiConnect に LAN 経由または',
    'URL — see the': 'URL でアクセスできる状態にしておきます。詳しくは',
    'mobile Anki steps': 'モバイル版 Anki の手順',
    '. The hosted page can also bridge local AnkiConnect through the installed userscript on the same computer.': 'をご覧ください。ホストされたページは、同じコンピューター上にインストールされたユーザースクリプトを介して、ローカルの AnkiConnect を橋渡しすることもできます。',
    'and import a dictionary in': '次の画面で辞書をインポートします',
    'Optionally connect Jiten,': '必要に応じて Jiten、',
    ', or Anki, then set the page as your new-tab or Home Screen shortcut.': '、または Anki を接続し、このページを新規タブやホーム画面のショートカットに設定しましょう。',
    'Do I need an account?': 'アカウントは必要ですか？',
    'No — it works with a local Yomitan dictionary or JMdict. Connect Jiten, JPDB, or Anki for richer review and status.': 'いいえ。ローカルの Yomitan 辞書や JMdict で動作します。より充実した復習やステータスを使うには、Jiten、JPDB、または Anki を接続してください。',
    'How does it study Anki on a phone?': 'スマートフォンではどのように Anki を学習するのですか？',
    'Keep desktop AnkiConnect reachable over a LAN or Tailscale URL — see the': 'デスクトップの AnkiConnect に LAN または Tailscale の URL 経由でアクセスできる状態にしておきます。詳しくは',
    'Open study page': '学習ページを開く',
    'Yomitan vs Jiten vs JPDB vs Anki: which to use when': 'Yomitan・Jiten・JPDB・Anki の比較：どれをいつ使うか',
    'How the filter works': 'フィルターの仕組み',
    'A starter guide when you\'re new': '初心者向けのスターターガイド',
    'Read while you watch': '観ながら読む',
    'YouTube Immersion Filter for Japanese': '日本語向け YouTube 没入フィルター',
    'recommendations, search, and sidebars get filtered down to Japanese and comprehensible-input videos — and the subtitles become tappable for lookup.': 'おすすめ、検索、サイドバーが日本語と理解可能なインプットの動画に絞り込まれ、字幕はタップしてルックアップできるようになります。',
    'to keep the filter without the banner, or': 'バナーなしでフィルターを維持するには、または',
    'to toggle it. See': 'で切り替えられます。',
    'all features': 'すべての機能',
    'for the full breakdown.': 'で詳しい内訳をご覧ください。',
    'Filtered recommendations with a temporary reveal and notice control.': '一時的な表示と通知コントロールを備えた、フィルター適用後のおすすめ。',
    'to browse the full 100-channel list with direct subscribe links, or': 'で直接登録できるリンク付きの全 100 チャンネルの一覧を見るには、または',
    'to turn it off.': 'でオフにできます。',
    'Search results stay usable for beginner comprehensible input, including English-titled videos.': '検索結果は、英語タイトルの動画も含め、初心者向けの理解可能なインプットとして使えるまま残ります。',
    'subtitle tools': '字幕ツール',
    ': Japanese lines become tappable words with a transcript panel and one-tap mining to Jiten, JPDB, or Anki. Filtering finds the videos; the subtitle reader makes them comprehensible.': '：日本語のセリフがタップ可能な単語になり、トランスクリプトパネルと、Jiten・JPDB・Anki へのワンタップマイニングが使えます。フィルターが動画を見つけ、字幕リーダーがそれを理解可能にします。',
    'Open YouTube — the filter runs automatically.': 'YouTube を開くと、フィルターが自動的に動作します。',
    'to toggle it, or open subtitle controls to read along.': 'で切り替えるか、字幕コントロールを開いて読みながら進めましょう。',
    'Does it keep English-titled learner channels?': '英語タイトルの学習者向けチャンネルは残りますか？',
    'Yes — comprehensible-input channels like Comprehensible Japanese stay visible even with English titles, because the filter checks the original title via oEmbed.': 'はい。フィルターは oEmbed 経由で元のタイトルを確認するため、Comprehensible Japanese のような理解可能なインプットのチャンネルは、英語タイトルでも表示されたままになります。',
    'Does it break YouTube?': 'YouTube が壊れたりしませんか？',
    'No — playback and subtitles keep working; toggle the filter with': 'いいえ。再生も字幕も問題なく動作します。フィルターは次のキーで切り替えられます',
    'Can I look up the subtitles?': '字幕を調べることはできますか？',
    'Yes — pair it with the': 'はい — 次のものと組み合わせてください：',
    'subtitle reader': '字幕リーダー',
    'to make Japanese lines tappable and minable.': '日本語の行をタップ可能にして、マイニングできるようにします。',
    'Filter details': 'フィルターの詳細',
    'Comprehensible-input Japanese: best YouTube channels': '理解可能なインプットの日本語：おすすめのYouTubeチャンネル',
    'Why manga is great input but hard to read': '漫画が優れたインプットでありながら読みにくい理由',
    'Step 2 — Reading where the text is selectable': 'ステップ2 — テキストを選択できる場所で読む',
    'Step 3 — Tapping words inside image-only panels (OCR)': 'ステップ3 — 画像だけのコマ内の単語をタップする（OCR）',
    'Step 4 — Readings, furigana and meaning on demand': 'ステップ4 — 読み、ふりがな、意味を必要なときに表示',
    'Step 5 — Mine the words worth remembering': 'ステップ5 — 覚える価値のある単語をマイニングする',
    'Where to find legal, free manga to read': '読むための合法で無料の漫画を見つける場所',
    'Practical tips for beginners': '初心者向けの実践的なヒント',
    'FAQ': 'よくある質問',
    'Manga is some of the best reading input you can get: short sentences, lots of repetition, pictures that carry half the meaning, and dialogue that sounds like how people actually talk. The problem is mechanical, not motivational. Raw Japanese manga is made of': '漫画は得られる最良の読解インプットのひとつです。短い文、多くの繰り返し、意味の半分を担う絵、そして実際の話し方に近いセリフがあります。問題はやる気ではなく、仕組みにあります。生の日本語の漫画は次のものでできており',
    'images': '画像',
    ', so you cannot select or copy the text, and furigana is not always printed — exactly the help a learner needs is missing on the page.': '、そのためテキストを選択したりコピーしたりできず、ふりがなも常に印刷されているわけではありません — 学習者が必要とするまさにその助けがページ上にないのです。',
    'The input is good.': 'インプットは優れています。',
    'Speech bubbles are naturally short. Characters repeat vocabulary and grammar across a volume. The art gives you context, so you can often guess a word before you confirm it.': '吹き出しは自然と短くなっています。登場人物は1巻を通して語彙や文法を繰り返します。絵が文脈を与えてくれるので、確認する前に単語を推測できることがよくあります。',
    'The text is locked in pixels.': 'テキストはピクセルの中に閉じ込められています。',
    'A scanned or rendered page is an image. Your browser cannot select it, your dictionary extension cannot see it, and copy-paste does nothing.': 'スキャンまたはレンダリングされたページは画像です。ブラウザでは選択できず、辞書拡張からも認識されず、コピー＆ペーストも効きません。',
    'Furigana is inconsistent.': 'ふりがなは一貫していません。',
    'Shounen titles often print readings over kanji; seinen and many web releases do not. When the reading is missing, a single unknown kanji compound can stop you cold.': '少年向けの作品では漢字の上に読みが印刷されていることが多いですが、青年向けや多くのWeb配信ではそうではありません。読みがないと、たった一つの知らない漢字熟語で完全に行き詰まってしまうことがあります。',
    'Install a userscript manager (': 'ユーザースクリプト管理拡張をインストールしてください（',
    'on desktop, the': 'はデスクトップ向け、',
    'getting started': 'はじめに',
    'page.': 'ページ。',
    'The lookup popup: reading, meaning, pitch, frequency and dictionary entries.': 'ルックアップのポップアップ：読み、意味、ピッチアクセント、頻度、辞書の項目。',
    'Most raw manga, though, is image-only — that is where OCR comes in.': 'とはいえ、ほとんどの生の漫画は画像だけのものです — そこでOCRの出番です。',
    'Embedded OCR (e.g. Mokuro).': '埋め込み型OCR（例：Mokuro）。',
    'Some manga is pre-processed with': '一部の漫画はあらかじめ次のもので処理されています：',
    'For plain images with no embedded text, you run a local OCR engine —': '埋め込みテキストのない通常の画像には、ローカルのOCRエンジンを実行します —',
    'your': 'あなた自身の',
    'local endpoint, and the recognised text becomes tappable.': 'ローカルエンドポイントで、認識されたテキストがタップ可能になります。',
    'Privacy:': 'プライバシー：',
    'you': 'あなた',
    'run on your own machine. If you have not configured a local endpoint, no image is sent anywhere.': 'が自分のマシンで実行します。ローカルエンドポイントを設定していなければ、画像はどこにも送信されません。',
    'You configure all of this in the OCR settings:': 'これらはすべてOCRの設定で行います：',
    'OCR settings: embedded Mokuro detection plus your own local OCR endpoint.': 'OCRの設定：埋め込み型Mokuroの検出に加えて、あなた自身のローカルOCRエンドポイント。',
    'The full reference for OCR engines, endpoints and image handling lives on the': 'OCRエンジン、エンドポイント、画像処理に関する完全なリファレンスは次のページにあります：',
    'Japanese OCR': '日本語OCR',
    'all words': 'すべての単語',
    'hard kanji only': '難しい漢字のみ',
    'hide-for-known': '既知の単語は非表示',
    'so you only see furigana on words you have not learned yet — which keeps an easier title from becoming a wall of kana.': 'まだ覚えていない単語にだけふりがなが表示されるので、易しい作品がかなの壁になってしまうのを防げます。',
    'Stuck on a single kanji rather than a word? Tap it to open the kanji drilldown: stroke count, grade, JLPT level, on/kun readings, RTK data, components, animated KanjiVG stroke order, and a small drawing pad. Details on the': '単語ではなく一つの漢字でつまずいたときは、その漢字をタップすると漢字の詳細表示が開きます。画数、学年、JLPTレベル、音読み・訓読み、RTKデータ、構成要素、KanjiVGによるアニメーション書き順、そして小さな手書きパッドが表示されます。詳しくは',
    'furigana reader': 'ふりがなリーダー',
    'Reading is the point; reviewing makes it stick. When a word matters, save it instead of re-looking it up next chapter:': '読むことが目的ですが、定着させるのは復習です。重要な単語は、次の章でまた調べ直すのではなく保存しましょう。',
    'add the word, mark never-forget, blacklist noise, or send review grades straight from the popup.': 'ポップアップから直接、単語を追加したり、絶対に忘れない印を付けたり、不要なものをブラックリストに入れたり、復習の評価を送ったりできます。',
    'Anki (via AnkiConnect):': 'Anki（AnkiConnect経由）：',
    'create a card with the word, reading, meaning, the': '単語、読み、意味、そして',
    'source sentence from the panel': 'コマからの元の文',
    ', audio, and optionally the panel image.': '、音声、必要に応じてコマの画像を含むカードを作成します。',
    'A sentence mined from manga you actually read beats a wordlist. Full workflow in the': '実際に読んだ漫画からマイニングした文は、単語リストに勝ります。詳しいワークフローは',
    'mine sentences to Anki': 'Ankiへの文のマイニング',
    'guide.': 'ガイドをご覧ください。',
    'Keep it legitimate — there is plenty:': '合法的に利用しましょう。たくさんあります。',
    'Graded readers': 'レベル別読み物',
    'and learner sites publish easy Japanese, often with selectable text and furigana.': 'や学習者向けサイトでは、選択可能なテキストとふりがなが付いていることが多い易しい日本語が公開されています。',
    'Official free chapters.': '公式の無料チャプター。',
    'Many publishers and creators put first chapters or ongoing series online for free.': '多くの出版社やクリエイターが、第1話や連載中の作品をオンラインで無料公開しています。',
    'MangaDex-style readers': 'MangaDexのようなリーダー',
    'host community and officially-permitted releases; some chapters ship Mokuro overlays.': 'では、コミュニティによる公開や公式に許諾された作品が提供されており、一部のチャプターにはMokuroのオーバーレイが付いています。',
    'This guide does not recommend or link to piracy. Read from sources you are entitled to.': 'このガイドは海賊版を推奨したりリンクしたりすることはありません。正当に利用できるソースから読んでください。',
    'Start easy.': '易しいものから始めましょう。',
    'Pick a title that is': '次のような作品を選びましょう。',
    'mostly': 'ほとんど',
    'comprehensible. If every bubble needs three lookups, drop down a level.': '理解できる作品を。すべての吹き出しで3回調べる必要があるなら、レベルを下げましょう。',
    'Look up only what blocks you.': 'つまずいたところだけ調べましょう。',
    'If you got the gist from the art and context, keep reading.': '絵や文脈から大意がつかめたなら、そのまま読み進めましょう。',
    'Lean on hide-for-known furigana': '既知の単語は非表示にするふりがな機能を活用しましょう',
    'so you train recall on familiar words and only get help on new ones.': 'そうすれば、慣れた単語は思い出す練習になり、新しい単語にだけ助けが得られます。',
    'Mine sparingly.': 'マイニングは控えめに。',
    'A handful of good sentence cards per chapter beats fifty you will never review.': '1章につき数枚の良い文カードのほうが、絶対に復習しない50枚よりも価値があります。',
    'Re-read.': '読み返しましょう。',
    'The second pass of a volume is fast and confidence-building — repetition is a feature of manga, not a bug.': '一冊を2回目に読むときは速く、自信もつきます。繰り返しは漫画の欠点ではなく利点です。',
    'When you want more input away from the page, comprehensible video pairs well with reading — see the': 'ページから離れてもっとインプットが欲しいときは、理解可能なインプットの動画が読書とよく合います。詳しくは',
    'comprehensible input on YouTube': 'YouTubeでの理解可能なインプット',
    'Can I tap words inside manga images to look them up?': '漫画の画像内の単語をタップして調べることはできますか？',
    'Yes — via embedded Mokuro metadata (instant) or a local OCR engine like MangaOCR or PaddleOCR. See': 'はい。埋め込まれたMokuroのメタデータ（即時）か、MangaOCRやPaddleOCRなどのローカルOCRエンジンを使って可能です。詳しくは',
    'Tapping words inside image-only panels': '画像のみのコマ内の単語をタップする',
    'above.': 'を参照してください。',
    'Is my manga uploaded anywhere when I use OCR?': 'OCRを使うと漫画はどこかにアップロードされますか？',
    'No. Embedded Mokuro OCR is read locally; image-only OCR sends images only to a local endpoint': 'いいえ。埋め込みのMokuro OCRはローカルで読み取られます。画像のみのOCRでは、画像はローカルのエンドポイントにのみ送信されます',
    'run — there is no cloud service, and nothing is sent if you configure no endpoint.': 'が実行するもので、クラウドサービスはなく、エンドポイントを設定しなければ何も送信されません。',
    'Do I need to know all the words before I start reading manga?': '漫画を読み始める前にすべての単語を知っておく必要がありますか？',
    'No. Pick a mostly-comprehensible manga, look up only what blocks you, and save the words that matter — rather than memorising everything in one sitting.': 'いいえ。ほとんど理解できる漫画を選び、つまずいた単語だけを調べ、重要な単語を保存しましょう。一度にすべてを暗記する必要はありません。',
    'What comprehensible input means (and why i+1 matters)': '理解可能なインプットとは何か（そしてなぜi+1が重要なのか）',
    'Turn YouTube into a Japanese feed': 'YouTubeを日本語のフィードに変える',
    'A levelled channel list (N5 → N1)': 'レベル別のチャンネルリスト（N5 → N1）',
    'How to actually study with these channels': 'これらのチャンネルで実際に学習する方法',
    'Comprehensible input Japanese on YouTube: best channels and how to filter your feed': 'YouTubeで学ぶ理解可能なインプット日本語：おすすめチャンネルとフィードのフィルタリング方法',
    'YouTube is one of the best free Japanese listening resources — once you can find the right videos. This guide explains what': 'YouTubeは、適切な動画を見つけられさえすれば、最も優れた無料の日本語リスニング教材の一つです。このガイドでは、',
    'means, how to retune your feed into a Japanese one, and gives a levelled list of channels from N5 to N1 to subscribe to today.': 'とは何か、フィードを日本語向けに調整し直す方法を説明し、今日登録すべきN5からN1までのレベル別チャンネルリストを紹介します。',
    'Comprehensible input is Japanese you can': '理解可能なインプットとは、あなたが',
    'understand. The idea, often written': '理解できる日本語のことです。この考え方は、しばしば',
    ', is that you learn best from material roughly at your current level (': 'と書かれ、おおよそ今のレベル（',
    ') plus a little new (': '）に少しだけ新しいもの（',
    '): you follow the meaning from context, pictures, gesture and known words, and absorb the new pieces by exposure rather than by memorising rules in isolation.': '）を加えた教材から最もよく学べる、というものです。文脈や絵、身振り、既知の単語から意味を追い、ルールを単独で暗記するのではなく、触れることで新しい要素を吸収していきます。',
    'The practical takeaway: pick videos where you understand most of what is happening. Lost the whole time? Too hard — drop a level. Every word obvious? Nudge up. The list below is grouped by JLPT level so you can do exactly that.': '実践的なポイントは、起きていることのほとんどを理解できる動画を選ぶことです。ずっとわからない？それは難しすぎるので、レベルを下げましょう。どの単語も明らかすぎる？少しレベルを上げましょう。下のリストはJLPTレベルごとに分けてあるので、まさにそのように調整できます。',
    'YouTube immersion filter': 'YouTube没入フィルター',
    'reshapes the feed: it\'s on by default, checks each video\'s original Japanese title via oEmbed (keeping Japanese-learning videos even with English titles), hides non-Japanese cards across the homepage, search and sidebar, and toggles with': 'はフィードを作り変えます。デフォルトでオンになっており、oEmbedを使って各動画の元の日本語タイトルを確認し（英語のタイトルでも日本語学習向けの動画は残します）、ホームページ、検索、サイドバーにわたって日本語以外のカードを非表示にします。切り替えは',
    '— all without touching playback. Full details on the': 'で行えます。すべて再生に影響を与えません。詳しくは',
    'features': '機能',
    'The immersion filter keeps Japanese and comprehensible-input videos and hides the rest.': '没入フィルターは日本語と理解可能なインプットの動画を残し、それ以外を非表示にします。',
    'A beginner CI video with the tappable subtitle overlay running.': 'タップ可能な字幕オーバーレイを表示した初心者向けCI動画。',
    'It also ships a dismissible': 'また、閉じられる',
    'starter guide of about 100 curated Japanese channels': '約100の厳選された日本語チャンネルの入門ガイド',
    'with one-tap subscribe links and a': 'がワンタップの登録リンク付きで付属しており、',
    'JLPT-level filter': 'JLPTレベルフィルター',
    '. The list below is a representative subset.': '。下のリストはその代表的な一部です。',
    'Subscribe to a handful at your level, then let the filter and recommendations do the rest. Each line has a one-word note on what the channel is about.': '自分のレベルのチャンネルをいくつか登録すれば、あとはフィルターとおすすめが残りをやってくれます。各行には、そのチャンネルの内容を一言で記したメモが付いています。',
    'Beginner (N5)': '初心者（N5）',
    '— the canonical CI channel; slow, visual, beginner-first.': '— 定番のCIチャンネル。ゆっくり、視覚的、初心者向け。',
    '— short daily listening podcast.': '— 毎日聴ける短いリスニングポッドキャスト。',
    '— lessons with furigana captions.': '— ふりがな字幕付きのレッスン。',
    '— calm beginner podcast.': '— 落ち着いた初心者向けポッドキャスト。',
    '— everyday phrases and topics.': '— 日常的なフレーズと話題。',
    '— clear beginner explanations.': '— 分かりやすい初心者向けの解説。',
    '— anime-flavoured beginner content.': '— アニメ風の初心者向けコンテンツ。',
    'Upper beginner (N4)': '初級上 (N4)',
    '— short, gentle podcast episodes.': '— 短くて穏やかなポッドキャストのエピソード。',
    '— friendly grammar and conversation.': '— 親しみやすい文法と会話。',
    '— structured lessons for N4.': '— N4向けの体系的なレッスン。',
    '— cooking, natural everyday Japanese.': '— 料理と、自然な日常の日本語。',
    '— kids\' show; simple narration.': '— 子ども向け番組。シンプルなナレーション。',
    '— kids\' content, very clear speech.': '— 子ども向けコンテンツで、とても聞き取りやすい話し方。',
    'Intermediate (N3)': '中級 (N3)',
    '— intermediate listening podcast.': '— 中級向けのリスニングポッドキャスト。',
    '— trains and family travel.': '— 電車と家族旅行。',
    '— fish and cooking, lively narration.': '— 魚と料理、にぎやかなナレーション。',
    '— gaming with a warm, chatty host.': '— 温かくおしゃべりなホストによるゲーム実況。',
    'Upper intermediate (N2)': '中級上 (N2)',
    '— home cooking, relaxed talk.': '— 家庭料理と、リラックスしたトーク。',
    '— fast psychology and self-help talks.': '— テンポの速い心理学と自己啓発のトーク。',
    '— travel vlogs in natural Japanese.': '— 自然な日本語の旅行vlog。',
    '— science explainers, dubbed.': '— 吹き替えの科学解説。',
    'Advanced / native (N1)': '上級・ネイティブ (N1)',
    '— long, dense lecture-style videos.': '— 長くて内容の濃い、講義スタイルの動画。',
    '— fast-paced travel storytelling.': '— テンポの速い旅のストーリーテリング。',
    '— business pitches and debate.': '— ビジネスのプレゼンと討論。',
    '— mystery and entertainment.': '— ミステリーとエンターテインメント。',
    'Watching is the foundation, and looking words up in place makes it stick faster.': '視聴が基本であり、その場で言葉を調べることで、より早く定着します。',
    'Watch for the gist first.': 'まずは大意をつかむために視聴しましょう。',
    'Pick a video you follow most of, and don\'t pause on every word the first time through.': 'おおよそ理解できる動画を選び、最初の視聴では一語ごとに止めないようにしましょう。',
    'Turn on the subtitle overlay.': '字幕オーバーレイをオンにしましょう。',
    'Tap to look up.': 'タップして調べます。',
    'Reading, meaning, pitch accent, frequency and example sentences appear in the popup.': '読み、意味、ピッチアクセント、頻度、例文がポップアップに表示されます。',
    'Mine the keepers.': '残す価値のある語をマイニングします。',
    'When a sentence is': '文が',
    'almost': 'ほぼ',
    'fully known except one new word, send it to Jiten, JPDB, or Anki from the popup — i+1 turned into a flashcard.': '新しい単語が1つだけでほぼ完全に理解できるなら、ポップアップから Jiten、JPDB、または Anki に送ります。i+1 がフラッシュカードになります。',
    'Tip:': 'ヒント：',
    'Re-watch favourites. The second pass of a slightly-hard video is often where it tips from "mostly understood" into "comfortable" — and that is exactly where comprehensible input does its work.': 'お気に入りを見直しましょう。少し難しい動画を2回目に見るときこそ、「だいたい理解できる」から「快適」へと変わる瞬間であり、まさにそこで理解可能なインプットが効果を発揮します。',
    'What is comprehensible input for Japanese?': '日本語における理解可能なインプットとは何ですか？',
    'Japanese you can mostly understand — your current level plus a little new (i+1). See': 'だいたい理解できる日本語、つまり今のレベルに少しだけ新しいものを加えたもの（i+1）です。次を参照してください：',
    'the section above': '上記のセクション',
    '; on YouTube it means channels pitched at or just above your level, like Comprehensible Japanese for beginners.': '。YouTube では、初心者向けの Comprehensible Japanese のように、自分のレベルかその少し上に合わせたチャンネルを指します。',
    'How do I turn YouTube into a Japanese feed?': 'YouTube を日本語のフィードにするにはどうすればいいですか？',
    'above and the': '上記と次の',
    'What are the best Japanese YouTube channels for beginners?': '初心者におすすめの日本語 YouTube チャンネルは何ですか？',
    'For N5, start with Comprehensible Japanese (@cijapanese), then Nihongo con Teppei, WAKU WAKU JAPANESE and Japanese with Shun — see the full N5→N1 list above.': 'N5 なら、まず Comprehensible Japanese（@cijapanese）から始め、続いて Nihongo con Teppei、WAKU WAKU JAPANESE、Japanese with Shun と進みましょう。上記の N5→N1 の完全なリストを参照してください。',
    'YouTube immersion tool': 'YouTube 没入ツール',
    'Subtitle reader': '字幕リーダー',
    'What sentence mining is (and why i+1 works)': 'センテンスマイニングとは何か（そしてなぜ i+1 が効果的なのか）',
    'The free toolchain': '無料のツールチェーン',
    'Workflow on YouTube': 'YouTube でのワークフロー',
    'Workflow on your own video files': '自分の動画ファイルでのワークフロー',
    'What ends up on the card': 'カードに最終的に載るもの',
    'Tips that keep mining sustainable': 'マイニングを長続きさせるためのヒント',
    'Mining from phone or iPad': 'スマホや iPad からのマイニング',
    'Sentence mining is the most reliable way to turn the Japanese you watch into long-term memory. Instead of grinding a generic word list, you collect the exact sentences you meet in shows, podcasts and YouTube videos and study the words in context. This guide walks through a free, browser-based workflow: choose an unknown word in a subtitle line and send a finished Anki card with reading, meaning, audio and a screenshot.': 'センテンスマイニングは、視聴した日本語を長期記憶に定着させる最も確実な方法です。汎用的な単語リストをひたすら覚える代わりに、番組、ポッドキャスト、YouTube 動画で出会ったまさにその文を集め、文脈の中で単語を学習します。このガイドでは、無料でブラウザベースのワークフローを順を追って説明します。字幕の中の知らない単語を選び、読み、意味、音声、スクリーンショットの揃った Anki カードを完成させて送ります。',
    'A good mining card is built around': '良いマイニングカードは、次のものを中心に作られます：',
    'one': '1つの',
    'unknown word in an otherwise understood sentence — an': '他は理解できる文の中にある知らない単語、つまり',
    'sentence (everything you know, plus one new thing). The familiar grammar, topic and situation give the new word somewhere to attach, so it sticks far better than isolated vocabulary: you recall a meaning your brain already has a slot for.': 'の文（知っているものすべてに、新しいものを1つ加えたもの）です。馴染みのある文法、話題、状況が新しい単語の足がかりとなるため、単独で覚える語彙よりもはるかによく定着します。脳にすでに受け入れる枠がある意味を思い出すからです。',
    'The rule of thumb: if a sentence has two or three words you don\'t know, skip it — it\'s not yet i+1, and the card will be hard to review.': '目安として、文に知らない単語が2つや3つあるなら飛ばしましょう。まだ i+1 ではなく、そのカードは復習しづらくなります。',
    'You need three free pieces:': '無料の要素が3つ必要です：',
    '— the free, no-account userscript: popup dictionary, subtitle overlay and the "mine" button.': '— アカウント不要の無料ユーザースクリプト。ポップアップ辞書、字幕オーバーレイ、そして「マイニング」ボタンを備えています。',
    '— the spaced-repetition app, free on desktop.': '— SRS（間隔反復）アプリ。デスクトップでは無料です。',
    '— a free Anki add-on that lets Yomu push cards into your deck automatically.': '— Yomu がカードを自動的にデッキへ送り込めるようにする無料の Anki アドオンです。',
    'Prefer': '次がお好みですか：',
    'Jiten or JPDB': 'Jiten または JPDB',
    '? Yomu mines there instead — same lookup-to-card flow, different destination. Pick whichever you review in daily.': '？ Yomu はそちらにマイニングします。検索からカード化までの流れは同じで、送り先が違うだけです。日々復習している方を選びましょう。',
    'The fastest place to start, with nothing to download.': 'ダウンロード不要で、最も手早く始められる場所です。',
    'Install Yomu and open a Japanese video. The': 'Yomu をインストールして日本語の動画を開きます。',
    'Japanese subtitle reader': '日本語字幕リーダー',
    'overlay turns each subtitle line into lookup-ready words, with an optional second line for your native language and a transcript panel beside the video.': 'オーバーレイは字幕の各行を検索しやすい単語に変換し、母語用の2行目（任意）と、動画の横に並ぶトランスクリプトパネルを表示します。',
    'When a line lands at i+1,': 'ある行がi+1になったら、',
    'choose the one unknown word': 'その1つの未知の単語を選びます',
    '. The popup shows its reading, meaning, pitch accent and frequency.': '。ポップアップにはその読み、意味、ピッチアクセント、頻度が表示されます。',
    'Hit': '押すと',
    'mine': 'マイニング',
    '. Yomu captures the whole subtitle line as the source sentence, pulls the word and reading, and — if you\'ve enabled it — grabs the audio and a screenshot of the frame.': '。Yomuは字幕の行全体を元の文として取り込み、単語と読みを抽出し、有効にしていればフレームの音声とスクリーンショットも取得します。',
    'Choose an unknown word in the subtitle overlay, then mine the whole line.': '字幕オーバーレイで未知の単語を選び、その行全体をマイニングします。',
    'For anime episodes, drama or anything with a local subtitle file, use the free hosted': 'アニメのエピソードやドラマなど、ローカルの字幕ファイルがあるものには、無料でホストされている',
    '— no desktop app required. Open your video and its': 'を使用します。デスクトップアプリは不要です。動画とその',
    'subtitle file in the browser and you get the same overlay, transcript panel and mining flow. Prev/next-line and copy/mine shortcuts let you scrub to the exact line and card it without touching the mouse.': '字幕ファイルをブラウザで開くと、同じオーバーレイ、トランスクリプトパネル、マイニングフローが使えます。前後の行へ移動するショートカットとコピー/マイニングのショートカットで、マウスに触れずに目的の行へ移動してカード化できます。',
    'The lookup popover: reading, meaning, pitch and the mine button.': 'ルックアップのポップオーバー：読み、意味、ピッチ、そしてマイニングボタン。',
    'A mined card carries the pieces you need to recall the word in context:': 'マイニングしたカードには、文脈の中で単語を思い出すために必要な要素が含まれています：',
    'Word': '単語',
    'reading': '読み',
    '(with furigana).': '（ふりがな付き）。',
    'Meaning': '意味',
    '— from Jiten, JPDB, and any': '— Jiten、JPDB、そしてあなたがインポートした',
    'Yomitan dictionaries': 'Yomitan辞書',
    'you\'ve imported.': 'から取得します。',
    'Source sentence': '元の文',
    '— the full subtitle line it came from.': '— その単語が出てきた字幕の行全体です。',
    '— pronunciation of the word, and where available the sentence audio.': '— 単語の発音と、利用できる場合は文の音声です。',
    'Image': '画像',
    '— an optional screenshot of the video frame for a visual cue.': '— 視覚的な手がかりとなる動画フレームのスクリーンショット（任意）です。',
    'You can trim fields to taste in your Anki note type; Yomu just fills what your card asks for.': 'Ankiのノートタイプで好みに合わせてフィールドを調整できます。Yomuはカードが求めるものを埋めるだけです。',
    'One unknown word per card.': '1枚のカードにつき未知の単語は1つにしましょう。',
    'If you find yourself adding glosses for two words, the sentence isn\'t i+1 yet.': '2つの単語に注釈を付けているようなら、その文はまだi+1ではありません。',
    'Don\'t over-mine.': 'マイニングしすぎないようにしましょう。',
    'Ten to twenty good cards from a session beats fifty you\'ll dread. The bottleneck is reviews, not collection.': '1回のセッションで作る良いカード10〜20枚は、うんざりするような50枚に勝ります。ボトルネックは復習であって、収集ではありません。',
    'Review daily.': '毎日復習しましょう。',
    'Mining without review just makes a backlog. Even ten minutes a day keeps the queue honest — the': '復習せずにマイニングするだけでは未消化の山が増えるだけです。1日たった10分でもキューを健全に保てます。',
    'new-tab study page': '新しいタブの学習ページ',
    'is a low-friction place to do it.': 'は、それを手軽に行える場所です。',
    'Keep cards short.': 'カードは短く保ちましょう。',
    'Long sentences with multiple clauses are harder to recall than the single line that taught you the word.': '複数の節を含む長い文は、その単語を教えてくれた1行よりも思い出しにくくなります。',
    'This is a free alternative to the paid mining suites — the same subtitle-to-card loop in your browser, with Jiten, JPDB, and Anki as optional targets. See the': 'これは有料のマイニングスイートに代わる無料の選択肢です。ブラウザ内で同じ字幕からカードへのループを実現し、Jiten、JPDB、Ankiを任意の出力先として利用できます。続きは',
    'AnkiConnect lives on a desktop copy of Anki, so mobile mining sends cards to your computer over the local network. The': 'AnkiConnectはデスクトップ版のAnki上で動作するため、モバイルでのマイニングはローカルネットワーク経由でカードをコンピューターに送信します。',
    'guide covers the full mobile-Anki setup (point Yomu\'s AnkiConnect address at your machine on the LAN, or via Tailscale away from home); cards mined on the phone then land in the same deck you review on desktop.': 'ガイドでは、モバイルでのAnki設定全般を解説しています（YomuのAnkiConnectアドレスをLAN上のご自身のマシンに向けるか、外出先ではTailscale経由で接続します）。スマートフォンでマイニングしたカードは、デスクトップで復習するのと同じデッキに保存されます。',
    'What is sentence mining?': 'センテンスマイニングとは？',
    'Turning real sentences you meet while watching or reading Japanese — the ones with a single unknown word — into flashcards, so the new word is learned in context. See': '日本語を視聴したり読んだりする中で出会う実際の文、つまり未知の単語が1つだけ含まれる文をフラッシュカードにすることで、新しい単語を文脈の中で学ぶ手法です。詳しくは',
    'Do I need a paid app to mine sentences?': 'センテンスマイニングに有料アプリは必要ですか？',
    'No. Yomu is free and browser-based; paired with Anki and the free AnkiConnect add-on it gives a complete subtitle-to-card workflow, with Jiten and JPDB as optional targets.': 'いいえ。Yomuは無料でブラウザ上で動作します。Ankiと無料のAnkiConnectアドオンを組み合わせれば、字幕からカードまでの完全なワークフローが実現でき、JitenやJPDBも任意の送信先として選べます。',
    'Can I mine sentences to Anki on my phone or iPad?': 'スマートフォンやiPadでAnkiにセンテンスをマイニングできますか？',
    'Yes — Yomu on your phone sends cards over the local network to a desktop copy of Anki running AnkiConnect. See': 'はい。スマートフォン上のYomuは、ローカルネットワーク経由でAnkiConnectを実行しているデスクトップのAnkiにカードを送信します。詳しくは',
    'Comprehensible input on YouTube': 'YouTubeでの理解可能なインプット',
    'What each tool actually is': '各ツールの実際の役割',
    'A quick comparison': 'かんたんな比較',
    'Which to use when': 'どんなときにどれを使うか',
    'Anyone around Japanese immersion has seen these names —': '日本語の没入に関わる人なら、誰もがこれらの名前を目にしたことがあるでしょう —',
    '— and wondered whether they need all four or which to start with. They do different jobs, overlap a little, and you can use one, two, or all four. This page explains what each is, gives a plain "use this when…" rule, and shows how the free': '— そして、4つすべてが必要なのか、どれから始めればよいのか迷ったはずです。これらは異なる役割を担い、少しだけ重なる部分もあり、1つ、2つ、あるいは4つすべてを使うことができます。このページでは、それぞれが何であるかを説明し、わかりやすい「こんなときに使う」という指針を示し、無料の',
    'reader lets you use any of them from a single popup.': 'リーダーで、それらのいずれも1つのポップアップから使える方法を紹介します。',
    'Yomitan — the popup dictionary': 'Yomitan — ポップアップ辞書',
    'is a free, open-source': 'は無料のオープンソースの',
    'popup dictionary': 'ポップアップ辞書',
    '. You import dictionary files (JMdict, frequency lists, pitch-accent data, and so on), then hover or tap Japanese text to see the reading, meaning, and other entries instantly. It is brilliant at one thing: getting a definition in front of you the moment you need it.': 'です。辞書ファイル（JMdict、頻度リスト、ピッチアクセントのデータなど）をインポートし、日本語のテキストにカーソルを合わせたりタップしたりすると、読み、意味、その他の項目がすぐに表示されます。1つのことに非常に優れています。必要な瞬間に定義を目の前に出してくれることです。',
    'What it is': '概要',
    'is an SRS. Yomitan shows you a word; it does not schedule that word to come back for review. That is by design — it is a lookup tool, and a very good one.': 'はSRS（間隔反復）ではありません。Yomitanは単語を表示しますが、その単語を復習のために再び呼び戻すようスケジュールすることはありません。これは意図的な設計です。Yomitanはルックアップのツールであり、しかも非常に優れたツールなのです。',
    'Jiten — a Japanese dictionary and review source': 'Jiten — 日本語辞書および復習ソース',
    'Japanese-focused dictionary and study system': '日本語に特化した辞書および学習システム',
    'JPDB — a Japanese-tuned SRS with decks and word states': 'JPDB — デッキと単語の状態を備えた、日本語向けに調整されたSRS（間隔反復）',
    'spaced-repetition system built specifically for Japanese': '日本語専用に作られた間隔反復システム',
    '. It ships prebuilt decks (including decks for specific anime, novels, and games), tracks frequency, and keeps a': 'です。あらかじめ用意されたデッキ（特定のアニメ、小説、ゲーム向けのデッキを含む）が付属し、頻度を追跡し、各単語に',
    'state': '状態',
    'for every word — new, learning, known, and so on. Because the decks and grading are already tuned for Japanese, you can get reviewing quickly without designing cards yourself.': 'を保持します。たとえば未学習、学習中、習得済みなどです。デッキと採点があらかじめ日本語向けに調整されているため、自分でカードを設計しなくてもすぐに復習を始められます。',
    'Anki — a general-purpose SRS you fully control': 'Anki — 自分で完全に管理できる汎用SRS（間隔反復）',
    'general-purpose SRS': '汎用SRS（間隔反復）',
    '. You own the note types, the card templates, and the scheduling. That flexibility is its strength: you can build exactly the cards you want (sentence cards, audio cards, image cards) and they are yours forever, synced across devices. The trade-off is more upfront setup than Jiten or JPDB.': 'です。ノートタイプ、カードテンプレート、スケジューリングのすべてを自分で所有します。その柔軟性が強みです。思いどおりのカード（センテンスカード、音声カード、画像カード）を作成でき、それらは永久に自分のものとして複数のデバイス間で同期されます。その代わり、JitenやJPDBよりも初期設定の手間がかかります。',
    'Main job': '主な役割',
    'Look words up': '単語を調べる',
    'Dictionary-backed word study': '辞書に基づく単語学習',
    'Review words (Japanese-tuned)': '単語の復習（日本語向けに調整）',
    'Review anything (you build it)': '何でも復習（自分で作成）',
    'Popup dictionary': 'ポップアップ辞書',
    'Japanese dictionary + study state': '日本語辞書 + 学習状態',
    'SRS + decks + frequency': 'SRS（間隔反復） + デッキ + 頻度',
    'General SRS': '汎用SRS（間隔反復）',
    'Setup effort': 'セットアップの手間',
    'Import dictionaries once': '辞書を一度インポートするだけ',
    'Low — connect an API key': '低い — APIキーを接続するだけ',
    'Low — prebuilt decks': '低い — 既製のデッキ',
    'Higher — your own note types': 'やや高い — 自分でノートタイプを用意',
    'You own the cards': 'カードを自分で所有',
    'n/a (it is a dictionary)': '該当なし（辞書のため）',
    'Tracked on Jiten': 'Jitenで管理',
    'Tracked on JPDB': 'JPDBで管理',
    'Yes, fully': 'はい、完全に',
    'Account needed': 'アカウントの要否',
    'Yes': 'はい',
    'Optional (local works)': '任意（ローカルでも動作）',
    'This table is about': 'この表が示すのは',
    'fit': '適性',
    ', not "better" — each is excellent at the job it was built for.': 'であって、「優劣」ではありません — それぞれが本来の用途で優れています。',
    'You just want to read and understand.': 'ただ読んで理解したい場合。',
    'You already use Jiten for study.': 'すでにJitenを学習に使っている場合。',
    'Connect': '接続するのは',
    'You want fast, low-effort reviews tuned for Japanese.': '日本語向けに最適化された、手早く負担の少ない復習がしたい場合。',
    'Reach for': '選ぶのは',
    '. The prebuilt decks and word states mean you can start reviewing almost immediately.': '。既製のデッキと単語のステートにより、ほぼすぐに復習を始められます。',
    'You want full control and your own cards.': '完全に制御し、自分のカードを使いたい場合。',
    '. Sentence cards with audio and a source screenshot are easy to maintain once your note type is set.': '。音声とソースのスクリーンショット付きの文章カードは、ノートタイプを設定してしまえば簡単に管理できます。',
    'You want more than one target.': '複数の保存先を使いたい場合。',
    'Plenty of learners use Jiten or JPDB for quick daily reviews': '多くの学習者は、毎日の手早い復習にJitenやJPDBを使い',
    'Anki for hand-crafted sentence cards. They are not mutually exclusive.': '手作りの文章カードにはAnkiを使っています。これらは互いに排他的ではありません。',
    'You do not choose a workflow up front — you read, and the popup gives every option at the moment a word matters.': 'ワークフローを最初に選ぶ必要はありません — 読み進め、ある単語が重要になった瞬間にポップアップがあらゆる選択肢を提示してくれます。',
    'One popup, showing imported dictionary entries plus Jiten and JPDB state together.': '1つのポップアップに、インポートした辞書の項目とJiten・JPDBのステートをまとめて表示。',
    'Use Yomitan dictionaries locally.': 'Yomitan辞書をローカルで使う。',
    'Import your Yomitan dictionary ZIPs or JMdict; the dictionaries stay in your browser and power instant definitions, with no upload anywhere.': 'Yomitan辞書のZIPやJMdictをインポートしましょう。辞書はブラウザ内に保存され、瞬時の語義表示を支えます。どこにもアップロードされません。',
    'Use Jiten as a study source.': 'Jitenを学習ソースとして使う。',
    'Connect Jiten for word state, definitions, audio, kanji facts, and mining or grading actions from the popup.': 'Jitenを接続すると、ポップアップから単語のステート、語義、音声、漢字の情報、マイニングや採点の操作が利用できます。',
    'See and act on JPDB state.': 'JPDBのステートを確認して操作する。',
    'The popup shows a word\'s JPDB state; add the word, mark it never-forget, blacklist it, or send a review grade.': 'ポップアップに単語のJPDBステートが表示され、単語を追加したり、never-forgetに設定したり、ブラックリストに入れたり、復習の評価を送ったりできます。',
    'Mine to Anki via AnkiConnect.': 'AnkiConnect経由でAnkiにマイニングする。',
    'Turn a lookup, subtitle line, or OCR result into an Anki card with the word, reading, meaning, source sentence, audio, and an optional image.': 'ルックアップ、字幕の行、OCRの結果を、単語・読み・意味・ソース文・音声、そして任意で画像を含むAnkiカードに変換します。',
    'All in one popup, so you adopt the tools gradually: read with the dictionary first, add Jiten or JPDB for structured reviews, and bring in Anki for cards you own.': 'すべて1つのポップアップにまとまっているので、ツールを少しずつ取り入れられます。まず辞書で読み、体系的な復習にJitenやJPDBを加え、自分で所有するカードにはAnkiを取り入れる、という流れです。',
    'A reasonable starting point for most people: import a dictionary so reading is comfortable, then pick': '多くの人にとって無理のない出発点はこうです。読みやすくなるよう辞書をインポートし、次に選ぶのは',
    'study target — Jiten or JPDB for speed, Anki for control — and only add another later if you actually miss it.': '学習の保存先です — 手早さならJitenやJPDB、自由度ならAnki — そして本当に必要だと感じたときにだけ後から別のものを追加しましょう。',
    'What is Yomitan and is it the same as an SRS?': 'Yomitanとは何ですか。SRSと同じものですか。',
    'No — Yomitan is a free, open-source popup dictionary for instant lookups, not a spaced-repetition system; it shows meanings but does not schedule reviews. See': 'いいえ。Yomitanは即座にルックアップできる無料のオープンソースのポップアップ辞書であり、SRS（間隔反復）ではありません。意味は表示しますが、復習のスケジュール管理は行いません。詳しくは',
    'Jiten, JPDB, or Anki: which should I pick?': 'Jiten、JPDB、Ankiのどれを選べばよいですか。',
    'Jiten or JPDB for fast, Japanese-tuned reviews with less setup; Anki for full control over your own cards. See': '設定が少なく日本語向けに調整された手早い復習にはJitenかJPDBを、自分のカードを完全に管理したいならAnkiを選びましょう。詳しくは',
    'above — and many learners use both.': '上記をご覧ください。多くの学習者は両方を併用しています。',
    'Do I need all four tools?': '4つのツールすべてが必要ですか。',
    'All features': 'すべての機能',
    'What "the core immersion loop" means': '「中心となる没入ループ」とは何か',
    'An honest comparison': '率直な比較',
    '"Bring your own" — what that means in practice': '「自分で用意する」とは実際にはどういうことか',
    'Looking at': '検討しているのが',
    'and want a': 'で、求めているのが',
    'free option': '無料の選択肢',
    'read-first and free': '読むこと優先で無料',
    ', and expects you to bring your own Jiten, JPDB, Anki and Yomitan dictionaries rather than bundling everything into one subscription.': 'であり、すべてを1つのサブスクリプションにまとめるのではなく、Jiten、JPDB、Anki、Yomitanの辞書を自分で用意することを前提としています。',
    'Popup lookup': 'ポップアップルックアップ',
    '— tap, select or hover Japanese text to see reading, meaning, pitch accent, frequency, Jiten definitions, optional JPDB data, your imported Yomitan entries, audio and example sentences.': '— 日本語のテキストをタップ、選択、またはホバーすると、読み、意味、ピッチアクセント、頻度、Jitenの定義、任意のJPDBデータ、インポートしたYomitanの項目、音声、例文が表示されます。',
    'Furigana and word colouring': 'ふりがなと単語の色分け',
    '— show furigana for all words, hard kanji only, or hide it for words you already know; colour words by Jiten/JPDB/Anki state or by pitch accent.': '— すべての単語、難しい漢字のみにふりがなを表示したり、すでに知っている単語では非表示にしたりできます。単語はJiten/JPDB/Ankiの状態やピッチアクセントで色分けできます。',
    'Subtitle mining on video': '動画での字幕マイニング',
    '— an ASB-style overlay turns Japanese subtitle lines into tappable words, with a second native-language line and a transcript panel. Works on pages like YouTube.': '— ASB方式のオーバーレイが日本語の字幕行をタップ可能な単語に変え、母語の2行目の字幕とトランスクリプトパネルを備えます。YouTubeなどのページで動作します。',
    'Manga and image OCR': '漫画と画像のOCR',
    '— tap Japanese inside images using embedded OCR metadata (e.g. Mokuro) or a local OCR engine you run. The image is not uploaded anywhere unless you enable a local OCR endpoint you control.': '— 埋め込みOCRメタデータ（例：Mokuro）や自分で動かすローカルOCRエンジンを使って、画像内の日本語をタップできます。自分が管理するローカルOCRエンドポイントを有効にしない限り、画像はどこにもアップロードされません。',
    '— create Anki cards via AnkiConnect, or send Jiten/JPDB actions and review grades.': '— AnkiConnect経由でAnkiカードを作成したり、Jiten/JPDBのアクションや復習の評価を送信したりできます。',
    'Popup lookup is the heart of the loop — the same idea any immersion tool sells, here for free in the browser.': 'ポップアップルックアップはこのループの中心です。どの没入ツールも売りにしているのと同じ発想を、ここではブラウザで無料で使えます。',
    'for its current features and pricing rather than trusting a third-party summary.': 'で最新の機能と価格をご確認ください。第三者によるまとめを鵜呑みにしないでください。',
    'Price': '価格',
    'Free': '無料',
    'Platform': 'プラットフォーム',
    'Browser userscript (desktop + iOS/iPad)': 'ブラウザのユーザースクリプト（デスクトップ + iOS/iPad）',
    'Yes — reading, meaning, pitch, frequency': '対応 — 読み、意味、ピッチ、頻度',
    'Anki via AnkiConnect + Jiten/JPDB actions': 'AnkiConnect経由のAnki + Jiten/JPDBのアクション',
    'Import Yomitan ZIPs / JMdict locally': 'YomitanのZIP / JMdictをローカルにインポート',
    'Manga / image OCR': '漫画 / 画像のOCR',
    'Yes — embedded metadata or local engine': '対応 — 埋め込みメタデータまたはローカルエンジン',
    'Video subtitle overlay': '動画の字幕オーバーレイ',
    'Yes — tappable lines + transcript panel': 'はい — タップ可能な字幕行＋トランスクリプトパネル',
    'Account to start': '開始にアカウントが必要か',
    'None required': '不要',
    'The short version.': '手短に言うと。',
    '— import the same Yomitan ZIPs and JMdict files you would use elsewhere. They stay in your browser; nothing is uploaded.': '— 他でも使うのと同じ Yomitan の ZIP や JMdict ファイルをインポートします。それらはブラウザ内に保存され、どこにもアップロードされません。',
    '— if you use either source, add words, mark never-forget or blacklist, and send review grades from the popup.': '— どちらのソースを使う場合でも、ポップアップから単語を追加したり、絶対に忘れないとマークしたり、ブラックリストに入れたり、復習の評価を送信したりできます。',
    'Install a userscript manager (Tampermonkey on desktop, Userscripts on iPhone/iPad).': 'ユーザースクリプト管理拡張をインストールします（デスクトップでは Tampermonkey、iPhone/iPad では Userscripts）。',
    'Open a Japanese page and tap a word to see the popup.': '日本語のページを開いて単語をタップすると、ポップアップが表示されます。',
    'From there, explore': 'そこから、次を試してみてください',
    'subtitle mining on video': '動画での字幕マイニング',
    'manga and image OCR': '漫画と画像の OCR',
    ', or jump into a guide to set up mining.': '、あるいはガイドに進んでマイニングを設定してみてください。',
    'Yes — it covers the': 'はい — 次をカバーしています',
    'core loop above': '上記のコアループ',
    'Next steps:': '次のステップ：',
    'read manga in Japanese': '日本語で漫画を読む',
    // Homepage redesign (hero + demo + manga OCR sections)
    'Read anything in Japanese': '日本語なら何でも読める',
    'よむ opens one popup with the reading, meaning, pitch accent, audio, and example sentences, then saves the word so you can keep going — the same popup on web pages, manga, PDFs, and subtitles.': 'よむは、読み、意味、ピッチアクセント、音声、例文を1つのポップアップで開き、その単語を保存して読み進められます。Webページ、漫画、PDF、字幕でも同じポップアップが使えます。',
    'Manga, screenshots, and image-only pages have no selectable text. よむ reads the Japanese with OCR, adds furigana, and turns every word into the same tappable popup.': '漫画、スクリーンショット、画像だけのページには、選択できる文字がありません。よむはOCRで日本語を読み取り、ふりがなを付け、すべての単語を同じタップ可能なポップアップに変えます。',
    'A manga page in Japanese, read with よむ OCR': 'よむのOCRで読み取った日本語の漫画ページ',
    'Skip to content': '本文へスキップ',
    'Search': '検索',
    'Main Navigation': 'メインナビゲーション',
    'Return to top': 'ページ上部へ戻る',
    'Sidebar Navigation': 'サイドバーナビゲーション',
    'On this page': 'このページの内容',
    'Last updated:': '最終更新:',
    'Previous page': '前のページ',
    'Next page': '次のページ',
    'extra navigation': '追加ナビゲーション',
    'mobile navigation': 'モバイルナビゲーション',
    'Copy Code': 'コードをコピー',
    'Start': '始める',
    'Install': 'インストール',
    'Learn': '学ぶ',
    'Overview': '概要',
    'Getting Started': '使い始める',
    'Getting Started | よむ': '使い始める | よむ',
    'Getting Started · よむ': '使い始める · よむ',
    'Features': '機能',
    'Study': '学習',
    'Watch': '見る',
    'Read/PDF': '読む/PDF',
    'Read': '読む',
    'New Tab': '新しいタブ',
    'More': 'その他',
    '/': '/',
    'Tools': 'ツール',
    'All tools': 'すべてのツール',
    'Guides': 'ガイド',
    'All guides': 'すべてのガイド',
    'Read manga in Japanese': '日本語で漫画を読む',
    'Comprehensible-input YouTube': '理解可能なインプット向けYouTube',
    'Mine sentences to Anki': 'Ankiに例文をマイニング',
    'Menu': 'メニュー',
    'Settings': '設定',
    'Open settings': '設定を開く',
    'Switch to dark theme': 'ダークテーマに切り替え',
    'Switch to light theme': 'ライトテーマに切り替え',
    'Video Player': '動画プレイヤー',
    'PDF Reader': 'PDFリーダー',
    'Local Audio': 'ローカル音声',
    'Support': 'サポート',
    'Stats': '統計',
    'Changelog': '変更履歴',
    'Added': '追加',
    'Kept word highlights hover-only on passive link text so busy pages such as search results are not repainted wall-to-wall, while the pitch underlines and text colours restored in 1.6.1 stay visible at rest.': 'パッシブなリンクテキストの単語ハイライト（背景の塗り）はホバー時のみ表示のままにし、検索結果のような情報量の多いページが一面塗り替えられないようにしました。1.6.1で復活したピッチ下線とテキストの色は、ホバーしていない状態でも表示されたままです。',
    'Restored pitch-accent underlines, state colours, and furigana on link-wrapped content (news headlines, Wikipedia-style prose links, forum titles) at rest. Since 1.5.4 every passive word was stripped of decoration until hovered, which made pitch underlines flicker in on hover and vanish on mouse-out across link-heavy sites; the bare-until-hover treatment now applies only to real chrome (buttons, tabs, menus, nav links, compact controls the scanner marks, and YouTube chip/renderer chrome).': 'リンクで囲まれたコンテンツ（ニュース見出し、Wikipediaのような本文内リンク、フォーラムのタイトル）でも、ホバーしていない状態でピッチアクセントの下線、状態の色、ふりがなが表示されるように戻しました。1.5.4以降、パッシブな単語はすべてホバーするまで装飾が取り除かれていたため、リンクの多いサイトではピッチ下線がホバーで現れてマウスを離すと消えるちらつきになっていました。ホバーまで装飾を隠す扱いは、本物のUIクローム（ボタン、タブ、メニュー、ナビゲーションのリンク、スキャナーがマークするコンパクトなコントロール、YouTubeのチップ／レンダラーのクローム）だけに適用されます。',
    'Annotated words now wrap with overflow-wrap break-word instead of anywhere, so flex/grid/table cells sized by min-content no longer collapse annotated mixed-script text into one-character-per-line stacks, while keeping identical emergency wrapping in constrained boxes.': 'アノテーションされた単語は overflow-wrap anywhere の代わりに break-word で折り返すようになり、min-content でサイズが決まる flex/grid/table のセルで、注釈付きの混在テキストが1文字ずつ縦に積み上がる崩れが起きなくなりました。幅が制限されたボックスでの折り返し挙動は同じままです。',
    'Added a passive-decoration browser smoke (npm run smoke:passive-decoration) that locks in: content links keep underline and furigana at rest and after hover-away, while nav/button chrome stays bare until hover.': 'パッシブ装飾のブラウザスモーク（npm run smoke:passive-decoration）を追加しました。コンテンツのリンクはホバーしていない状態でもホバー後も下線とふりがなを保ち、ナビゲーションやボタンのクロームはホバーまで装飾されないことを固定します。',
    'Bunpro grading parity across the popover and study page. The popover\'s ⇄ provider toggle now cycles through every service that can grade the word — JPDB, Jiten, and Bunpro when the card carries a Bunpro identity — instead of being hardcoded to the jpdb/jiten pair, and the switch shows which service comes next. Bunpro-backed cards can be switched to another connected service per word without flipping the global preference.': 'ポップオーバーと学習ページ全体でBunproの採点パリティを実現しました。ポップオーバーの⇄プロバイダー切り替えは、jpdb/jitenのペアに固定される代わりに、その単語を採点できるすべてのサービス（JPDB、Jiten、そしてカードがBunproのIDを持つ場合はBunpro）を巡回し、次に切り替わるサービスを表示します。Bunproのカードは、全体設定を変えずに単語ごとに別の接続サービスへ切り替えられます。',
    'A "Preferred grading service" select in Settings → API, so the Jiten/JPDB grading choice is discoverable outside the popover toggle.': '設定→APIに「優先採点サービス」の選択を追加し、Jiten/JPDBの採点先の選択がポップオーバーの切り替え以外からも見つけられるようになりました。',
    'The study-page lookup popover now shows the same provider status indicator as the main popover ("Jiten/JPDB/Bunpro + state" with the state dot) instead of a JPDB-only label, so it is always clear which SRS a grade goes to.': '学習ページの検索ポップオーバーに、メインのポップオーバーと同じプロバイダー状態インジケーター（状態ドット付きの「Jiten/JPDB/Bunpro＋状態」）を表示するようにしました。JPDBのみのラベルではなくなり、採点がどのSRSに送られるか常に分かります。',
    'The study page\'s review-source dropdown no longer disappears when the current queue is empty — finishing your Bunpro (or any) reviews keeps one-tap switching to the other connected SRS sources.': '現在のキューが空になっても学習ページのレビューソースのドロップダウンが消えなくなりました。Bunpro（や他の）レビューを終えても、接続済みの他のSRSソースへワンタップで切り替えられます。',
    'Auto study-source selection now treats a Bunpro token as a configured review source instead of forcing Bunpro-only users onto Anki.': '自動の学習ソース選択がBunproトークンを設定済みレビューソースとして扱うようになり、BunproのみのユーザーがAnkiに強制されなくなりました。',
    'Bunpro card state now refreshes from the review response after grading, so the popover status dot recolors like JPDB/Jiten instead of staying stale.': '採点後、Bunproのカード状態がレビュー応答から更新されるようになり、ポップオーバーの状態ドットがJPDB/Jitenと同様に再着色され、古い状態のまま残りません。',
    'Selecting the Bunpro study source without a usable token now explains what is missing ("No Bunpro token…" / "Bunpro token expired…") instead of the generic "Could not load words."': '使用可能なトークンなしでBunpro学習ソースを選ぶと、汎用の「単語を読み込めませんでした」ではなく、何が足りないか（「Bunproトークンなし…」「Bunproトークンの期限切れ…」）を表示するようにしました。',
    'A stored Bunpro grading preference can no longer route words without a Bunpro identity to the Bunpro API (that path previously produced doomed review calls with synthetic ids).': '保存されたBunproの採点設定が、BunproのIDを持たない単語をBunpro APIへ送ることはなくなりました（従来この経路は合成IDによる失敗確定のレビュー呼び出しを生んでいました）。',
    '"Allow Bunpro review/mining" now defaults on, matching the JPDB setting — the imported token remains the real gate.': '「Bunproレビュー/マイニングを許可」がJPDBの設定と同様に既定でオンになりました。実際のゲートはインポートしたトークンのままです。',
    'Moved the study-tool result rendering and mining drawer/deck-picker DOM helpers into the Yomu Kanji/Study companion (ADR-0003 core import-severing), keeping the core userscript under the Greasy Fork 2 MB limit. Behavior is unchanged: the companion is always required by the userscript and bundled into hosted builds.': '学習ツールの結果レンダリングとマイニングドロワー/デッキ選択のDOMヘルパーをYomu Kanji/Studyコンパニオンへ移動しました（ADR-0003のコアインポート分離）。これによりコアユーザースクリプトはGreasy Forkの2MB制限内に収まります。動作は変わりません。コンパニオンはユーザースクリプトが常に@requireし、ホスト版にはバンドルされます。',
    'Made fully local parsing the default parsing source for new installs: with term dictionaries imported, text parsing (segmentation, deinflection, furigana, pitch) runs against local Yomitan dictionaries without contacting Jiten or JPDB, working offline and skipping remote parse latency. A new Settings → Sources → Parsing control switches between Local dictionaries (offline) and the Jiten/JPDB APIs. Existing installs keep API-first parsing until they opt in, so provider-backed word colors and known states do not change underneath them.': '新規インストールでは完全ローカル解析を既定の解析ソースにしました。語句辞書をインポート済みであれば、テキスト解析（分かち書き、活用復元、ふりがな、ピッチ）はJitenやJPDBに接続せずローカルのYomitan辞書に対して実行され、オフラインでも動作し、リモート解析の待ち時間もなくなります。新しい「設定→ソース→解析」でローカル辞書（オフライン）とJiten/JPDB APIを切り替えられます。既存のインストールは自分で切り替えるまでAPI優先の解析を維持するため、プロバイダー由来の単語の色や既知状態が勝手に変わることはありません。',
    'Added an Offline setup step to the onboarding welcome screen (checked by default) that downloads Jitendex and Kanjium pitch accents in the background, so local parsing, definitions, furigana, and pitch colors work out of the box without an API key. Already-imported dictionaries are detected and skipped, and failures leave a toast pointing at Settings → Sources for retry.': 'ようこそ画面に「オフラインセットアップ」ステップ（既定でオン）を追加し、JitendexとKanjiumのピッチアクセントをバックグラウンドでダウンロードするようにしました。これにより、APIキーなしでもローカル解析、定義、ふりがな、ピッチの色が最初から使えます。インポート済みの辞書は検出してスキップし、失敗時は再試行先として設定→ソースを案内するトーストを表示します。',
    'Added a hosted Yomu Video fullscreen button that fullscreen-targets the video frame instead of the bare video, with mobile inline fallback coverage so Yomu subtitles stay visible while watching.': 'ホスト版Yomu Videoに全画面ボタンを追加しました。動画要素単体ではなく動画フレームを全画面対象にするため、視聴中もYomu字幕が表示されます。モバイル向けのインライン全画面フォールバックもカバーしています。',
    'Added compact Yomu Video subtitle style controls beside the player for font preset, background opacity, position, size, and hover-pause behavior, with desktop and mobile Playwright coverage.': 'Yomu Videoに、プレイヤー横で使えるコンパクトな字幕スタイル操作を追加しました。フォントプリセット、背景不透明度、位置、サイズ、ホバー一時停止を調整でき、デスクトップとモバイルのPlaywrightカバレッジも追加しています。',
    'Changed': '変更',
    'Updated default "New and in deck" card/word color to white (#ffffff) to match Canna\'s suggestion.': 'Cannaの提案に合わせて、既定の「新規・デッキ内」のカード／単語の色を白（#ffffff）に更新しました。',
    'The hosted Yomu Video player now accepts a video file and subtitle files in the same picker/drop action. Japanese/native subtitle files are inferred from their names, loaded automatically, and the transcript opens directly to the lines view.': 'ホスト版Yomu Videoプレイヤーは、同じファイル選択またはドロップ操作で動画ファイルと字幕ファイルを一緒に受け取れるようになりました。日本語字幕と母語字幕はファイル名から推定され、自動で読み込まれ、トランスクリプトは直接「行」ビューで開きます。',
    'Added a separate Video setting for pausing on subtitle hover lookup. Clicked/tapped subtitle lookups still pause by default, while hover pause can now be turned off independently.': '字幕ホバールックアップ時に一時停止するための個別の動画設定を追加しました。クリックまたはタップした字幕ルックアップはこれまで通り既定で一時停止し、ホバーによる一時停止だけを独立してオフにできます。',
    'Expanded the hosted homepage and localized metadata copy to describe SRS practice, Japanese site versions, and YouTube Japanese-content filtering as part of Yomu\'s immersion environment.': 'ホスト版ホームページとローカライズ済みメタデータの文言を広げ、SRSでの練習、日本語版サイト、YouTubeの日本語コンテンツ絞り込みを、Yomuの没入環境の一部として説明するようにしました。',
    'Fixed': '修正',
    'Fixed the Yomu Gaming onboarding page-scan controls and release asset checksum job so Manual mode persists through the current settings form and desktop downloads publish to GitHub Releases.': 'Yomu Gamingオンボーディングのページスキャン操作とリリース成果物チェックサムジョブを修正し、Manualモードが現在の設定フォーム経由で保存され、デスクトップ用ダウンロードがGitHub Releasesへ公開されるようにしました。',
    'Fixed the Yomu Gaming desktop artifact workflow to build and package release downloads without depending on a hosted-runner Electron binary launch, which keeps AppImage, Windows, and macOS artifact publishing aligned with the local Electron smoke test.': 'Yomu Gamingデスクトップ成果物ワークフローを修正し、ホストランナー上のElectronバイナリ起動に依存せずにリリース用ダウンロードをビルドしてパッケージ化するようにしました。これにより、AppImage、Windows、macOSの成果物公開がローカルElectronスモークテストと揃います。',
    'Fixed the Yomu Gaming desktop artifact workflow to rebuild Electron through npm before smoke testing, so GitHub Actions installs the Electron runtime binary before packaging AppImage, Windows, and macOS downloads.': 'Yomu Gamingデスクトップ成果物ワークフローを修正し、スモークテスト前にnpm経由でElectronを再ビルドするようにしました。これにより、GitHub ActionsがAppImage、Windows、macOSダウンロードをパッケージ化する前にElectronランタイムバイナリをインストールします。',
    'Fixed the Yomu Gaming release gates so CI recognizes the Electron app entrypoints and the desktop artifact workflow verifies Electron before smoke testing and packaging release downloads.': 'Yomu Gamingのリリースゲートを修正し、CIがElectronアプリのエントリーポイントを認識し、デスクトップ成果物ワークフローがスモークテストとリリース用ダウンロードのパッケージ化前にElectronを検証するようにしました。',
    'Kept compact media carousels, absolute-positioned slides, product cards, and sidebar cards from growing or overflowing when page annotations render, while normal article text still keeps furigana.': 'コンパクトなメディアカルーセル、絶対配置のスライド、商品カード、サイドバーカードがページ注釈の描画で大きくなったりはみ出したりしないようにしました。通常の記事本文では引き続きふりがなを表示します。',
    'Collapsed framework formatting whitespace in YouTube owner/subscriber mirrors so channel rows do not gain visible newline gaps during annotation refreshes.': 'YouTubeの投稿者／登録者数ミラー内で、フレームワーク由来の整形用空白を折りたたむようにしました。注釈の更新中にチャンネル行へ目に見える改行すき間が入らないようになります。',
    'Rendered JPDB frequency ranks in popup headers as frequency metadata pills instead of bare #rank text, matching lookup pill wrapping, contrast, and accessibility labels.': 'ポップアップ見出しのJPDB頻度順位を、裸の #rank テキストではなく頻度メタデータピルとして表示するようにしました。検索ピルと同じ折り返し、コントラスト、アクセシビリティラベルに揃えています。',
    'Stabilized Yomu Video and YouTube subtitle side panels so left/right/bottom placement no longer resizes the player, leaves giant gaps, or keeps the rail visible after the player chrome hides.': 'Yomu VideoとYouTubeの字幕サイドパネルを安定させ、左／右／下配置でプレイヤーがリサイズされたり、大きなすき間が残ったり、プレイヤー操作UIが隠れた後もレールが出続けたりしないようにしました。',
    'Added fullscreen to the themed subtitle rail with mobile inline fallback, kept fullscreen subtitles visible, and made the subtitle style popover stable while sliders are dragged.': 'テーマに沿った字幕レールに全画面ボタンを追加し、モバイルではインライン全画面フォールバックを使えるようにしました。全画面でも字幕が表示され、スライダーをドラッグしている間も字幕スタイルのポップオーバーが安定して開いたままになります。',
    'Restored transcript auto-follow for long virtualized subtitle lists, added a jump-back-to-current-line control after manual scrolling, and kept hidden-video notice dismissal persistent.': '長い仮想化字幕リストでトランスクリプトの自動追従を復元し、手動スクロール後に現在行へ戻る操作を追加しました。非表示動画通知の非表示設定も維持されるようにしました。',
    'Standardized compact subtitle typography controls with Settings font presets, added subtitle weight to the popover, and made subtitle dragging update the same bottom-offset setting shown in Settings.': 'コンパクト字幕の文字設定を設定画面のフォントプリセットと揃え、ポップオーバーに字幕の太さを追加しました。字幕のドラッグ位置も、設定画面に表示される同じ下端オフセット設定を更新するようにしました。',
    'Kept paused-frame OCR inside the active fullscreen player host, including mobile fullscreen shells, so OCR words remain tappable after pausing fullscreen video.': '一時停止フレームOCRを、モバイルの全画面シェルを含むアクティブな全画面プレイヤーホスト内に保持し、全画面動画を一時停止した後もOCR単語をタップできるようにしました。',
    'Stabilized native and loaded subtitle cue selection at adjacent boundaries so the open sidebar current line no longer flickers between neighboring rows.': '隣接する字幕境界でネイティブ字幕と読み込み済み字幕のキュー選択を安定させ、開いているサイドバーの現在行が隣り合う行の間でちらつかないようにしました。',
    'Kept generic reader highlights readable on first hover across light/dark site surfaces, custom word colors, Anki colors, and furigana.': 'ライト／ダークのサイト表面、カスタム単語色、Anki色、ふりがなが混在していても、最初のホバーから汎用リーダーのハイライトが読みやすくなるようにしました。',
    'Tightened parsed word wrapping and compact furigana layout so app labels, names, messages, YouTube channel rows, and modern YouTube shelves do not develop gaps or broken one-character stacks.': '解析済み単語の折り返しとコンパクトなふりがなレイアウトを調整し、アプリのラベル、名前、メッセージ、YouTubeチャンネル行、最新のYouTube棚で、すき間や1文字ずつ縦に崩れる表示が出ないようにしました。',
    'Hover autoplay now waits briefly for fallback lookup cards to resolve before falling through to text-to-speech, so recorded audio that arrives on the first hover can play immediately.': 'ホバー時の自動再生は、読み上げ音声にフォールバックする前にフォールバック検索カードの解決を短く待つようになりました。これにより、最初のホバーで到着した録音音声をすぐ再生できます。',
    'Speaker replays now restart single-source term audio deterministically, including Jiten-only audio setups, instead of sometimes leaving the previous clip unmanaged and producing silence until repeated clicks.': 'スピーカーの再再生は、Jitenのみの音声設定を含む単一ソースの単語音声を確実に最初から再開するようになりました。前のクリップが管理されないままになり、何度もクリックするまで無音になる場合を防ぎます。',
    'Hover autoplay now keeps playing across consecutive word hovers instead of letting earlier audio state dead-end later eligible words.': 'ホバー時の自動再生は、連続して複数の単語をホバーしても再生され続けるようになりました。前の音声状態が後続の再生可能な単語を詰まらせることを防ぎます。',
    'Apple Pencil/stylus taps now activate reader popup controls on the first tap, including dictionary links, kanji buttons, and Show trace / Hide trace toggles, without double-firing follow-up clicks.': 'Apple Pencilやスタイラスのタップで、辞書リンク、漢字ボタン、Show trace / Hide traceトグルなどのリーダーポップアップ操作が初回タップで反応するようになりました。後続クリックの二重発火も防ぎます。',
    'Source-order audio no longer repeats browser text-to-speech on replay when a recorded source has resolved in the meantime; the same word now advances from quick TTS fallback to real audio instead of sounding stuck.': 'ソース順の音声再生で、録音音声が後から解決された場合に再生し直してもブラウザ音声合成を繰り返さないようにしました。同じ単語は、素早いTTSフォールバックから実際の音声へ進むようになり、音声が詰まったように感じにくくなります。',
    'Played vocabulary term audio during subtitle hover lookups if the video is paused (due to "Pause video on subtitle hover" being enabled or general playback states), avoiding clashing audio while allowing standard lookup pronunciations.': '「字幕ホバー時に動画を一時停止」設定が有効な場合や、通常の動画一時停止時に、字幕のホバーポップアップで語句の音声を自動再生するようにしました。動画の音声との衝突を避けつつ、通常のポップアップ同様に発音を確認できます。',
    'Simplified the YouTube hidden-video notice so it visually shows only the reveal and dismiss buttons while keeping the hidden count and visible-item summary available to assistive tech; the YouTube Playwright smoke now verifies the summary is visually clipped in-browser.': 'YouTubeの非表示動画通知を簡素化し、見た目には表示切り替えボタンと通知を隠すボタンだけを表示するようにしました。非表示件数と表示中項目の概要は支援技術向けに残し、YouTubeのPlaywrightスモークでその概要がブラウザー上で視覚的に隠れていることも確認します。',
    'Kept compact host UI labels such as author names, usernames, metadata, and headers passive without making dark-site annotations unreadable; passive content highlights now remain stable on hover, transparent dark app shells no longer get treated as white pages, and normal chat/message prose still receives ruby.': '著者名、ユーザー名、メタ情報、ヘッダーなどのコンパクトなサイトUIラベルをパッシブ扱いのまま、ダークサイト上の注釈が読みにくくならないようにしました。パッシブな本文ハイライトはホバーしても安定し、透明なダークアプリの背景を白いページとして扱わなくなり、通常のチャットやメッセージ本文には引き続きルビが付きます。',
    'Prevented stale BookWalker OCR captures from rendering after a page turn, and expanded the BookWalker Playwright smoke so previous-page OCR must clear before the new page re-OCRs.': 'BookWalkerでページをめくった後に、前ページのOCRキャプチャが遅れて描画される問題を防ぎました。また、BookWalkerのPlaywrightスモークを拡張し、新しいページを再OCRする前に前ページのOCRが必ず消えることを確認するようにしました。',
    'Renamed the subtitle mining pause control to "Pause video on subtitle click" and strengthened Yomu Video Playwright coverage so the compact subtitle popover must expose click pause, hover pause, the full font preset set, themed styling, and Settings-page sync.': '字幕マイニング時の一時停止設定を「Pause video on subtitle click」に分かりやすく改名し、Yomu VideoのPlaywrightカバレッジを強化しました。コンパクト字幕ポップオーバーで、クリック一時停止、ホバー一時停止、全フォントプリセット、テーマに沿った表示、設定ページとの同期が必ず確認されます。',
    'The hosted Yomu Video player now resets stale drawer inset sizing after subtitle panel close/auto-hide, so the video frame and native progress bar stretch back across the full player.': 'ホスト版Yomu Videoプレイヤーは、字幕パネルを閉じたり自動非表示にした後に残るドロワー用インセットサイズをリセットするようになりました。これにより、動画フレームとネイティブの進行バーがプレイヤー全体の幅まで戻ります。',
    'Added the missing hosted Japanese changelog localization for the 1.4.118 Yomu Video release notes, allowing the release check to publish the video improvements cleanly.': '1.4.118のYomu Videoリリースノートに不足していたホスト版日本語変更履歴のローカライズを追加し、動画改善のリリースチェックが正常に公開まで進めるようにしました。',
    'Caption clicks on the homepage "Read captions in any player" demo and Yomu Video now use the fast lookup shell path, so the video pauses immediately and the popover appears without waiting on heavier dictionary/enrichment work. The docs Playwright audit now profiles this path on desktop, iPad, and iPhone.': 'ホームページの「Read captions in any player」デモとYomu Videoで字幕をクリックしたとき、軽量な高速ルックアップシェル経路を使うようになりました。そのため動画はすぐ一時停止し、重い辞書・補強処理を待たずにポップオーバーが表示されます。ドキュメントのPlaywright監査でも、この経路をデスクトップ、iPad、iPhoneで計測するようになりました。',
    'Restored the OCR "Scanning…/Text ready" loading pill on canvas readers (BookWalker, ComicWalker) and the corner status dot on ordinary images. The indicator was removed in 1.4.114 but its absence left users with no feedback that OCR was in progress, which was confusing on slower scans or double-page spreads.': 'キャンバスリーダー（BookWalker、ComicWalker）上のOCR「スキャン中…／テキスト準備完了」読み込みピルと、通常の画像での隅のステータスドットを復元しました。このインジケーターは1.4.114で削除されましたが、表示されないとOCRが進行中かどうかのフィードバックがユーザーに得られず、遅いスキャンや見開きページで分かりにくかったため修正しました。',
    'Loaded full Jiten study deck vocabulary in the newtab Search/My Cards browser, so source chips and state filters see every card in decks such as Vocab 2k instead of only the current study batch.': '新しいタブの検索／My CardsブラウザーでJiten学習デッキ全体の語彙を読み込むようにしました。Vocab 2kのようなデッキでも、ソースチップや状態フィルターが現在の学習バッチだけでなく全カードを参照できます。',
    'Selection lookups now take ownership over hover lookups: dragging across rendered text cancels pending hover work, dismisses active hover popovers, and opens the resulting selection popup as a modal instead of inheriting hover state.': '選択ルックアップがホバールックアップより優先されるようになりました。描画済みテキストをドラッグして選択すると、保留中のホバー処理をキャンセルし、開いているホバーポップアップを閉じ、選択ポップアップをホバー状態から引き継がずモーダルとして開きます。',
    'Audio on strict-CSP sites such as ChatGPT and Claude now decodes the already-fetched clip in memory instead of re-fetching its blob URL (which the page CSP blocked), so the dictionary popup and the settings audio preview play the real audio instead of the fallback chime.': 'ChatGPTやClaudeのようなCSPの厳しいサイトでも、取得済みの音声をその blob URL から取り直すのではなくメモリ上でデコードするようになりました（blob URL の取得はページの CSP にブロックされていました）。これにより、辞書ポップアップと設定の音声プレビューが、フォールバックのチャイムではなく実際の音声を再生します。',
    'Stopped paused-frame OCR from adding a second play button to the subtitle rail when the subtitle playback control is already visible; resuming through that control still clears the OCR overlay.': '字幕の再生コントロールがすでに表示されている場合、停止フレームOCRが字幕レールへ2つ目の再生ボタンを追加しないようにしました。そのコントロールから再開しても、OCRオーバーレイはこれまで通り消えます。',
    'Kept the video play/pause control visible beside the previous/next subtitle buttons while subtitle navigation is showing, and moved the mobile subtitle height drag handle back to the centered subtitle line position now that it no longer conflicts with that control.': '字幕ナビゲーションを表示している間は、前／次の字幕ボタンの横に動画の再生／一時停止コントロールも表示するようにしました。また、そのコントロールと競合しなくなったため、モバイルの字幕高さ調整ハンドルを字幕行中央の位置へ戻しました。',
    'iPhone YouTube fullscreen now keeps Yomu subtitles in the page overlay by intercepting WebKit\'s native video fullscreen entry points and falling back to an inline fullscreen player host when Safari cannot fullscreen the player container.': 'iPhone版YouTubeの全画面表示でも、WebKitのネイティブ動画全画面化の入口を捕捉し、Safariがプレイヤーコンテナを全画面化できない場合はインラインの全画面プレイヤーホストへフォールバックすることで、よむの字幕をページ上のオーバーレイに保つようになりました。',
    'Replaced the placeholder cloud settings section with extension-only Google Drive settings sync in Settings -> Sources, using Google Drive app data for settings backup and restore while keeping dictionaries local.': 'Settings -> Sources のプレースホルダーだったクラウド設定セクションを、拡張機能専用の Google Drive 設定同期に置き換えました。Google Drive のアプリデータを使って設定をバックアップおよび復元し、辞書はローカルに保持します。',
    'Rendered OCR and subtitle words now carry their reading and pitch metadata into the dictionary popup, so clicking a word such as 鯛 keeps the furigana and pitch accent already shown in the overlay instead of falling back to a bare card.': 'OCRや字幕で描画済みの単語が、読みとピッチアクセントのメタデータを辞書ポップアップへ引き継ぐようになりました。たとえば「鯛」をクリックしても、オーバーレイに表示されていたふりがなとピッチアクセントが保たれ、素のカードへ戻りません。',
    'Furigana-only subtitle enrichment now still resolves fallback vocabulary when pitch-accent display is disabled, preventing parsed long/keyless YouTube subtitles from losing ruby.': 'ピッチアクセント表示をオフにしていても、ふりがなだけの字幕補強ではフォールバック語彙を解決するようになりました。長い動画やキーなしのYouTube字幕で、解析済みの単語からルビが抜ける問題を防ぎます。',
    'Jiten only reports "rejected API key" for authenticated reader/SRS 401/403 responses, so public lookup outages and rate limits no longer look like bad keys.': 'Jitenの「APIキーが拒否されました」表示は、認証が必要なreader/SRSエンドポイントの401/403応答だけに限定されました。公開検索の障害やレート制限が、キー不正のように見えなくなります。',
    'Mobile YouTube bottom-sheet detection no longer depends on fragile': 'モバイルYouTubeのボトムシート検出は、壊れやすい',
    'selector parsing while expanded descriptions still hide the subtitle overlay and rail.': 'セレクター解析に依存しなくなりました。展開した概要欄では、これまで通り字幕オーバーレイとレールを隠します。',
    'Added the radial-menu quick actions for pausing annotations, muting term audio, cycling OCR mode, and toggling Japanese site language to the userscript browser icon/context-menu shortcuts.': '注釈の一時停止、単語音声のミュート、OCRモードの切り替え、日本語サイト言語の切り替えに使うラジアルメニューのクイックアクションを、ユーザースクリプトのブラウザーアイコン/コンテキストメニューのショートカットにも追加しました。',
    'Mobile Google Search annotations no longer hide the base text inside compact rounded result controls, and passive result snippets no longer paint pale highlight blocks on dark-mode search results before or after hover.': 'モバイル版Google検索の注釈は、コンパクトな角丸の結果コントロール内で元の文字を隠さなくなり、パッシブな検索結果スニペットもダークモードの検索結果でホバー前後に薄いハイライトの四角を描かなくなりました。',
    'The hosted homepage now uses a tighter “Read Japanese without leaving the page” flow, a compact setup path, native demo video controls, a static pitch-accent demo fallback, and the real manga OCR sample image instead of the temporary illustrated panel.': 'ホスト版ホームページは、一時的なイラスト風パネルではなく、より引き締まった「Read Japanese without leaving the page」の流れ、コンパクトなセットアップ導線、ネイティブのデモ動画コントロール、静的なピッチアクセント付きデモのフォールバック、実際の漫画OCRサンプル画像を使うようになりました。',
    'Hosted docs now emit normal stylesheet links and load the root-hosted userscript assets, so the deployed homepage does not fall back to an unstyled or stale-looking page.': 'ホスト版ドキュメントは通常のスタイルシートリンクを出力し、ルートで配信されるユーザースクリプト資産を読み込むようになりました。そのため、デプロイ済みホームページが未スタイルまたは古く見えるページに戻ることはありません。',
    'BookWalker OCR now works on the main bookwalker.jp address, not only the viewer subdomains. The browser reader is also served there, and iOS Safari hides the subdomain in its address bar, but the tainted-canvas reader was only recognised on viewer hosts, so on iPad the comic page was detected yet no text overlay appeared and only the page title could be looked up. The reader-host check now covers the whole bookwalker.jp site, and a duplicated host check was removed.': 'BookWalker の OCR がビューワーのサブドメインだけでなく、メインの bookwalker.jp アドレスでも動作するようになりました。ブラウザビューワーはこのアドレスでも配信されており、iOS Safari はアドレスバーでサブドメインを隠しますが、判読不能キャンバスのリーダーはビューワーのホストでしか認識されていなかったため、iPad では漫画ページが検出されてもテキストオーバーレイが表示されず、ページタイトルしか辞書引きできませんでした。リーダーのホスト判定が bookwalker.jp サイト全体を対象にするようになり、重複していたホスト判定を削除しました。',
    'Latest changelog entries are now covered by Japanese hosted-docs localization, so the language toggle does not leave fresh release notes in English.': '最新の変更履歴項目もホスト版ドキュメントの日本語ローカライズ対象になり、言語切り替え後に新しいリリースノートが英語のまま残らないようになりました。',
    'Merged the subtitle drawer dock position controls, the auto open-on-pause toggle, and the close action into one panel-options menu in the drawer header, so phone screens keep a single tidy row of controls instead of a wrapped strip.': '字幕ドロワーのドック位置コントロール、一時停止時の自動表示トグル、閉じる操作を、ドロワーヘッダーのひとつのパネル設定メニューに統合しました。スマートフォン画面でも操作列が折り返さず、1行にすっきり収まります。',
    'Removed the duplicate previous/next subtitle buttons from the drawer header; the player rail now keeps line navigation and playback visible while the panel is open.': 'ドロワーヘッダーから重複していた前／次の字幕ボタンを削除しました。パネルを開いている間も、プレイヤーのレールに行移動と再生コントロールが表示され続けます。',
    'Removed the redundant subtitle rail tracks shortcut, which opened the same drawer as the panel toggle; the Tracks tab inside the drawer remains the way to manage tracks.': 'パネルトグルと同じドロワーを開くだけだった字幕レールの重複したトラックショートカットを削除しました。トラックの管理は、これまで通りドロワー内のトラックタブから行えます。',
    'The closed subtitle panel toggle now shows the bottom-sheet icon on phone-width screens where the drawer always opens below the video, instead of the remembered side-dock icon.': 'ドロワーが常に動画の下へ開くスマートフォン幅の画面では、閉じた状態の字幕パネルトグルが、保存されたサイドドックのアイコンではなくボトムシートのアイコンを表示するようになりました。',
    'Drawer header controls keep 44px touch targets on touch devices, and the merged panel-options menu closes on Escape, on outside taps, and after choosing a dock position.': 'タッチデバイスではドロワーヘッダーの操作が44pxのタッチターゲットを維持し、統合されたパネル設定メニューはEscキー、メニュー外のタップ、ドック位置の選択後に閉じるようになりました。',
    'Compact BookWalker-style carousel titles now suppress furigana only when a clipped media rail would overflow, while ordinary scrollable article text keeps ruby and lookup behavior.': 'コンパクトなBookWalker風カルーセルのタイトルでは、切り詰められたメディア列がはみ出す場合だけふりがなを抑制し、通常のスクロール可能な記事本文ではルビと検索動作を維持します。',
    'The hosted homepage and docs language toggle now localize page titles, meta descriptions, navigation chrome, and the current homepage Try Me/OCR sections without stale route metadata or broken image references.': 'ホスト版ホームページとドキュメントの言語切り替えは、古いルートメタデータや壊れた画像参照を残さずに、ページタイトル、メタ説明、ナビゲーションUI、現在のホームページのTry Me/OCRセクションをローカライズします。',
    'The hosted Yomu video player no longer creates paused-frame OCR overlays, so pausing a local video cannot put a captured frame over subtitles or the native progress bar.': 'ホスト版よむ動画プレイヤーは一時停止フレームのOCRオーバーレイを作成しなくなったため、ローカル動画を一時停止しても、字幕やネイティブの進行バーの上にキャプチャ画像が重なることはありません。',
    'Hosted overflow menu links now use the current': 'ホスト版の追加メニューリンクは現在の',
    'root paths instead of the old GitHub Pages': 'ルートパスを使い、古いGitHub Pagesの',
    'prefix.': 'プレフィックスを使わないようになりました。',
    'The Greasy Fork userscript build is back under the 2 MB limit after compacting emitted selector scaffolding without changing reader behavior.': '出力されるセレクター足場をリーダー動作を変えずに圧縮したため、Greasy Fork用ユーザースクリプトビルドは再び2 MB制限内に収まりました。',
    'Fixed the Yomu Gaming release workflow so CI prepares the Electron runtime before smoke-testing packaged desktop builds.': 'Yomu Gamingのリリースワークフローを修正し、CIがパッケージ済みデスクトップビルドをスモークテストする前にElectronランタイムを準備するようにしました。',
    'Stabilized Yomu Video on YouTube and embedded demos: fullscreen now rehosts subtitles and controls immediately on desktop, iPad, and phone; the sidebar no longer stretches the player or leaves the control rail stuck; and subtitle settings stay open while sliders and toggles are used.': 'YouTubeと埋め込みデモ上のYomu Videoを安定させました。デスクトップ、iPad、スマートフォンで全画面化した直後に字幕と操作レールが再配置され、サイドバーがプレイヤーを伸ばしたり操作レールを出しっぱなしにしたりせず、字幕設定もスライダーやトグル操作中に閉じなくなります。',
    'Kept YouTube subtitle sizing more consistent across short and long captions, hid subtitle overlays once the video has scrolled out of view, and made the subtitle panel\'s current-line tracking and jump-back behavior less fragile.': 'YouTube字幕のサイズを短い字幕と長い字幕でより一定にし、動画が画面外へスクロールしたら字幕オーバーレイを隠し、字幕パネルの現在行追跡と戻る動作をより壊れにくくしました。',
    'Fixed Study/newtab audio replay and reverse-side context so word/kanji backing audio uses the right card, repeated speaker clicks play reliably, and furigana, pitch, and frequency details stay available without the extra lookup card clutter.': 'Study/新しいタブの音声再生と裏面コンテキストを修正し、単語／漢字の関連音声が正しいカードを使い、スピーカーを繰り返し押しても確実に再生され、余分な検索カードを出さずにふりがな、ピッチ、頻度情報を利用できるようにしました。',
    'Hardened generic page scanning around compact controls and app chrome so search boxes, Discord-style names, Wikibooks controls, BookWalker galleries, and composer help text stay readable and do not get pushed out by ruby or highlights.': 'コンパクトな操作部やアプリUI周辺の汎用ページスキャンを強化し、検索ボックス、Discord風の名前、Wikibooksの操作部、BookWalkerのギャラリー、入力欄のヘルプ文が、ルビやハイライトで押し出されず読みやすいまま保たれるようにしました。',
    'Rechecked BookWalker and Yomu PDF smoke coverage for spread/continuous manga modes, stale OCR prevention, text-backed PDFs, and scanned PDFs using readable OCR targets instead of dense unreadable PDF text overlays.': 'BookWalkerとYomu PDFのスモーク範囲を見直し、見開き／連続マンガモード、古いOCRの残留防止、テキストPDF、そして読みにくい密なPDFテキストオーバーレイではなく読みやすいOCRターゲットを使うスキャンPDFを確認しました。',
    'Made Yomu Gaming\'s first-party desktop app default to browser image OCR, open as a full-size Yomu settings experience, and ship through the release workflow with Linux AppImage, Windows portable, and macOS zip artifacts.': 'Yomu Gamingのファーストパーティデスクトップアプリを、既定でブラウザー画像OCRを使い、フルサイズのYomu設定体験として開くようにし、Linux AppImage、Windowsポータブル、macOS zip成果物をリリースワークフローから配布できるようにしました。',
    'Project': 'プロジェクト',
    'Use よむ': 'よむを使う',
    'What it does': 'できること',
    'OCR & manga': 'OCRと漫画',
    'Subtitles & video': '字幕と動画',
    'Study setup': '学習設定',
    'Permalink to "Next Steps"': '「次のステップ」への固定リンク',
    'Permalink to "Getting Started"': '「使い始める」への固定リンク',
    'Permalink to "Three words to know"': '「3つの用語」への固定リンク',
    'Permalink to "Step 1: Install a userscript manager"': '「ステップ1: ユーザースクリプト管理拡張をインストール」への固定リンク',
    'Permalink to "Chrome, Edge, or Firefox (computer)"': '「Chrome、Edge、Firefox (PC)」への固定リンク',
    'Permalink to "iPhone or iPad"': '「iPhoneまたはiPad」への固定リンク',
    'Permalink to "Step 2: Install よむ"': '「ステップ2: よむをインストール」への固定リンク',
    'Permalink to "On a computer"': '「PCの場合」への固定リンク',
    'Permalink to "On iPhone or iPad"': '「iPhoneまたはiPadの場合」への固定リンク',
    'Permalink to "Step 3: Your first lookup"': '「ステップ3: 最初の検索」への固定リンク',
    'Permalink to "Add an API source (optional)"': '「APIソースを追加する (任意)」への固定リンク',
    'Permalink to "Turn on more tools"': '「追加ツールをオンにする」への固定リンク',
    'Permalink to "What to read"': '「読むもの」への固定リンク',
    'Permalink to "Using よむ on a phone or tablet"': '「スマートフォンやタブレットでよむを使う」への固定リンク',
    'Permalink to "Use desktop Anki from a phone, iPad, or Android"': '「スマートフォン、iPad、Androidからデスクトップ版Ankiを使う」への固定リンク',
    'Permalink to "Mobile handoff (new notes only)"': '「モバイル連携 (新規ノートのみ)」への固定リンク',
    'Permalink to "Back up your settings"': '「設定をバックアップ」への固定リンク',
    'Permalink to "If something does not work"': '「うまく動かない場合」への固定リンク',
    'よむ - Japanese reader for web, manga, PDFs, and subtitles': 'よむ - Web、漫画、PDF、字幕向け日本語リーダー',
    'よむ - Japanese reader for web, manga, games, PDFs, and subtitles': 'よむ - Web、漫画、ゲーム、PDF、字幕向け日本語リーダー',
    'Yomu helps you read real Japanese in the browser. Look up words on web pages, manga, PDFs, and subtitles, save useful sentences, connect your SRS, prefer Japanese site versions, and filter YouTube for Japanese content.': 'Yomuはブラウザで本物の日本語を読む手助けをします。Webページ、漫画、PDF、字幕の単語を調べ、役に立つ文を保存し、SRSと接続し、日本語版サイトを優先して、YouTubeを日本語コンテンツに絞り込めます。',
    'Yomu helps you read real Japanese in the browser. Look up words on web pages, manga, game text, PDFs, and subtitles, save useful sentences, connect your SRS, prefer Japanese site versions, and filter YouTube for Japanese content.': 'Yomuはブラウザで本物の日本語を読む手助けをします。Webページ、漫画、ゲームテキスト、PDF、字幕の単語を調べ、役に立つ文を保存し、SRSと接続し、日本語版サイトを優先して、YouTubeを日本語コンテンツに絞り込めます。',
    'Read Japanese without leaving the page': 'ページを離れずに日本語を読む',
    'Look up words on web pages, manga, PDFs, and subtitles, then save useful sentences for study. Connect your SRS to practice your words, find new words by visiting the Japanese versions of the websites you use daily, and filter YouTube for Japanese content. Yomu brings the perfect immersion environment, no matter your level.': 'Webページ、漫画、PDF、字幕の単語を調べ、役に立つ文を学習用に保存できます。SRSと接続して単語を練習し、毎日使うWebサイトの日本語版を開いて新しい単語を見つけ、YouTubeを日本語コンテンツに絞り込めます。Yomuはレベルを問わず、理想的な没入環境を届けます。',
    'Look up words on web pages, manga, game text, PDFs, and subtitles, then save useful sentences for study. Connect your SRS to practice your words, find new words by visiting the Japanese versions of the websites you use daily, and filter YouTube for Japanese content. Yomu brings the perfect immersion environment, no matter your level.': 'Webページ、漫画、ゲームテキスト、PDF、字幕の単語を調べ、役に立つ文を学習用に保存できます。SRSと接続して単語を練習し、毎日使うWebサイトの日本語版を開いて新しい単語を見つけ、YouTubeを日本語コンテンツに絞り込めます。Yomuはレベルを問わず、理想的な没入環境を届けます。',
    'Look up words on web pages, manga, game text, PDFs, and subtitles, then save useful sentences for study. Connect your SRS to practice your words, find new words by visiting the Japanese versions of the websites you use daily, and filter YouTube for Japanese content.': 'Webページ、漫画、ゲームテキスト、PDF、字幕の単語を調べ、役に立つ文を学習用に保存できます。SRSと接続して単語を練習し、毎日使うWebサイトの日本語版を開いて新しい単語を見つけ、YouTubeを日本語コンテンツに絞り込めます。',
    'Yomu brings the perfect immersion environment, no matter your level.': 'Yomuはレベルを問わず、理想的な没入環境を届けます。',
    'Get よむ': 'よむを入手',
    'Setup': 'セットアップ',
    'Setup guide': 'セットアップガイド',
    'Guide': 'ガイド',
    'Game': 'ゲーム',
    'Install よむ in about two minutes': '約2分でよむをインストール',
    'よむ runs through a userscript manager such as Tampermonkey. Add the manager once, install よむ, then refresh any Japanese page.': 'よむはTampermonkeyなどのユーザースクリプト管理拡張で動きます。管理拡張を一度入れてよむをインストールし、日本語ページを更新します。',
    'よむ runs in a userscript manager: Tampermonkey on desktop, or Userscripts on iPhone and iPad. Install the manager once, add the よむ userscript, then open a Japanese page and start reading.': 'よむはユーザースクリプト管理拡張で動きます。デスクトップではTampermonkey、iPhoneやiPadではUserscriptsを使います。管理拡張を一度入れ、よむユーザースクリプトを追加して、日本語ページを開けば読み始められます。',
    'Ready in a few steps': '数ステップで準備完了',
    'Choose a manager, add the userscript, then open a Japanese page.': '管理拡張を選び、ユーザースクリプトを追加して、日本語ページを開きます。',
    'Choose a manager, add the userscript, or install the Yomu site as one offline-friendly shell for docs and tools.': '管理拡張を選んでユーザースクリプトを追加するか、Yomuサイトをドキュメントとツール用のオフライン対応シェルとしてインストールできます。',
    'Choose manager': '管理拡張を選ぶ',
    'Manager': '管理拡張',
    'Choose a userscript manager': 'ユーザースクリプト管理拡張を選ぶ',
    'Open a Japanese page': '日本語ページを開く',
    'Read a page': 'ページを読む',
    'Text': 'テキスト',
    'Look up a word, keep your place': '単語を調べても、読む場所を見失わない',
    'Readings, meanings, pitch, audio, examples, kanji, and save actions open in a popover when you press a word.': '単語を押すと、読み、意味、ピッチ、音声、例文、漢字、保存操作がポップオーバーで開きます。',
    'Try me': '試してみる',
    'よむ demo: reading Japanese on an iPhone and opening the dictionary popup. Press Space or Enter to pause or play.': 'iPhoneで日本語を読み、辞書ポップアップを開くよむのデモ。スペースまたはEnterで一時停止/再生できます。',
    'よむ demo: reading Japanese on an iPhone and opening the dictionary popup.': 'iPhoneで日本語を読み、辞書ポップアップを開くよむのデモ。',
    'Read Japanese in images': '画像の中の日本語を読む',
    'OCR': 'OCR',
    'See how image text becomes readable': '画像の文字が読めるようになる仕組み',
    'When reading manga or images that contain Japanese, tap them to trigger OCR. You can then click any word within the panel.': '漫画や日本語を含む画像を読むときは、タップしてOCRを開始します。その後、パネル内の任意の単語をクリックできます。',
    'Japanese manga page with text detected by よむ OCR': 'よむのOCRで文字が検出された日本語漫画ページ',
    'Read captions in any player': 'どのプレイヤーでも字幕を読む',
    'Follow along with your favourite shows, looking up any words you dont understand. If there is some text on the screen, you can pause and read it with OCR': 'お気に入りの番組を見ながら、わからない単語を調べられます。画面上にテキストがあれば、一時停止してOCRで読むこともできます。',
    'Captioned Japanese sample video': '字幕付き日本語サンプル動画',
    'Captioned Peppa Pig Japanese sample video': '字幕付きPeppa Pig日本語サンプル動画',
    'Captioned Peppa Pig Japanese shopping sample video': '字幕付きPeppa Pig日本語ショッピングサンプル動画',
    'YouTube video': 'YouTube動画',
    'Permalink to "Next"': '「次に」への固定リンク',
    'Permalink to "Choose a reading surface"': '「読む対象を選ぶ」への固定リンク',
    'Permalink to "What to do next"': '「次にすること」への固定リンク',
    'Next': '次に',
    'Choose a reading surface': '読む対象を選ぶ',
    'What to do next': '次にすること',
    'Choose desktop, iPhone, or iPad and get the userscript running.': 'デスクトップ、iPhone、iPadの手順を選んで、ユーザースクリプトを動かします。',
    'Review saved words, stats, and Anki-backed queues.': '保存した単語、統計、Anki連携の復習キューを確認できます。',
    'Video': '動画',
    'Open local videos and Japanese subtitles in よむ.': 'ローカル動画と日本語字幕をよむで開けます。',
    'PDF': 'PDF',
    'Read PDFs with the same popup reader.': 'PDFも同じポップアップリーダーで読めます。',
    'Manga OCR': '漫画OCR',
    'Tap words inside manga panels and screenshots.': '漫画のコマやスクリーンショット内の単語をタップできます。',
    'Look up words inside manga panels and screenshots.': '漫画のコマやスクリーンショット内の単語を調べられます。',
    'Tap or hover Japanese text, read manga images, mine subtitles, import dictionaries, and save study cards in one free browser add-on.': '日本語テキストをタップまたはホバーし、漫画画像を読み取り、字幕をマイニングし、辞書をインポートし、学習カードを1つの無料ブラウザーアドオンに保存できます。',
    'Install よむ': 'よむをインストール',
    'Open Study App': '学習アプリを開く',
    'Install in minutes': '数分でインストール',
    'Add Tampermonkey or Userscripts, open the よむ install link, then refresh a Japanese page and tap a word.': 'TampermonkeyまたはUserscriptsを追加し、よむのインストールリンクを開いて、日本語ページを更新したら単語をタップします。',
    'Forever free': 'ずっと無料',
    'No subscription, no account required, and local dictionaries stay in your browser.': 'サブスクもアカウントも不要で、ローカル辞書はブラウザー内に保存されます。',
    'Install よむ as a userscript': 'よむをユーザースクリプトとしてインストール',
    'Use Tampermonkey or Userscripts, install よむ, then refresh a Japanese page and tap or hover a word.': 'TampermonkeyまたはUserscriptsでよむをインストールし、日本語ページを更新して単語をタップまたはホバーします。',
    'Extensions': '拡張機能',
    'Browser extensions': 'ブラウザー拡張',
    'EXTENSIONS': '拡張機能',
    'Chrome extension': 'Chrome拡張',
    'Firefox extension': 'Firefox拡張',
    'Safari extension': 'Safari拡張',
    'Coming soon': '準備中',
    'Extension store status': '拡張ストアの状況',
    'Install steps': 'インストール手順',
    'Add manager': '管理拡張を追加',
    'Open the Tampermonkey install page for your browser': 'ブラウザー用のTampermonkeyインストールページを開く',
    'Open a Japanese page and tap a word for your first lookup': '日本語ページを開き、単語をタップして最初の検索を試す',
    'Refresh page': 'ページを更新',
    'What It Does': 'できること',
    'よむ runs inside your browser. Point it at Japanese text, subtitles, or manga images and it opens a clean popup with readings, meanings, kanji details, examples, audio, and mining actions.': 'よむはブラウザー内で動きます。日本語テキスト、字幕、漫画画像に向けると、読み、意味、漢字詳細、例文、音声、マイニング操作を備えた見やすいポップアップを開きます。',
    'Kanji drilldown with live KanjiVG stroke data.': 'ライブKanjiVG筆順データつきの漢字ドリルダウン。',
    'Next Steps': '次のステップ',
    'Set up よむ': 'よむをセットアップ',
    'Install a userscript manager, add よむ, and try your first lookup.': 'ユーザースクリプト管理拡張を入れ、よむを追加して、最初の検索を試します。',
    'See the tools': 'ツールを見る',
    'Try the tools': 'ツールを試す',
    'Free pages for OCR, furigana, kanji stroke order, subtitles, PDFs, and YouTube.': 'OCR、ふりがな、漢字の書き順、字幕、PDF、YouTube向けの無料ページです。',
    'OCR, furigana, kanji stroke order, subtitles, PDFs, and YouTube helpers.': 'OCR、ふりがな、漢字の書き順、字幕、PDF、YouTube補助ツール。',
    'Free Japanese Learning Tools': '無料の日本語学習ツール',
    'Yomu Gaming': 'Yomu Gaming',
    'Pick the surface you want to read. よむ keeps the lookup, audio, kanji, and save actions consistent across text, images, video, PDFs, and study.': '読みたい対象を選んでください。よむはテキスト、画像、動画、PDF、学習のどこでも、検索、音声、漢字、保存の操作を同じように使えるようにします。',
    'Games': 'ゲーム',
    'Kanji': '漢字',
    'Look up words on web pages for readings, meanings, pitch, audio, and saves.': 'Webページ上の単語を調べ、読み、意味、ピッチ、音声、保存を使えます。',
    'Read manga panels, screenshots, and image-only pages with OCR.': '漫画のコマ、スクリーンショット、画像だけのページをOCRで読めます。',
    'Parse Japanese subtitles and transcripts for lookup on YouTube or local files.': 'YouTubeやローカルファイルの日本語字幕と文字起こしを検索用に解析します。',
    'Use Yomu Gaming for first-party desktop capture, then keep lookup in the Yomu flow.': 'ファーストパーティのデスクトップキャプチャにはYomu Gamingを使い、検索をYomuの流れに保てます。',
    'Open PDFs in the hosted reader and keep the same lookup popup.': 'ホスト版PDFリーダーでPDFを開き、同じ検索ポップアップを使えます。',
    'Review saved words from Jiten, JPDB, Anki, or imported dictionaries.': 'Jiten、JPDB、Anki、インポートした辞書から保存語を復習できます。',
    'Use Yomu Gaming for first-party PC game capture.': 'ファーストパーティのPCゲームキャプチャにはYomu Gamingを使えます。',
    'The loop is always the same: find Japanese → understand it in context → save the useful words. A web page, a manga page read through OCR, and a video subtitle line all become the same lookup surface, so you do not have to switch tools every time the medium changes.': '流れはいつも同じです。日本語を見つける → 文脈で理解する → 役立つ語を保存する。Webページ、OCRで読んだ漫画ページ、動画の字幕行がすべて同じ検索画面になるので、媒体が変わるたびにツールを切り替える必要はありません。',
    'New here? Follow the setup guide.': '初めてですか？セットアップガイドに進んでください。',
    'Use only the parts you need. Start with lookup, add OCR for manga, add subtitles for video, and connect study sources when you want tracking.': '必要な部分だけ使えます。まずは検索から始め、漫画にはOCRを、動画には字幕を追加し、進捗を追いたくなったら学習ソースを接続してください。',
    'Use only the parts you need. Start with lookup, add OCR for manga, use Yomu Gaming for PC game capture, add subtitles for video, and connect study sources when you want tracking.': '必要な部分だけ使えます。まずは検索から始め、漫画にはOCRを、PCゲームキャプチャにはYomu Gamingを、動画には字幕を追加し、進捗を追いたくなったら学習ソースを接続してください。',
    'Kanji stroke order, components, readings, and related words live inside the popup; open the kanji tool from any lookup when you need to slow down on a character.': '漢字の書き順、構成要素、読み、関連語はポップアップ内にあります。文字をじっくり見たいときは、任意の検索から漢字ツールを開けます。',
    'Read games with Yomu Gaming': 'Yomu Gamingでゲームを読む',
    'OCR Japanese game dialogue, then bring useful lines into your browser study flow.': '日本語ゲームの会話をOCRし、役立つ行をブラウザーの学習フローに持ち込めます。',
    'Use the first-party desktop app for PC game capture and lookup.': 'PCゲームのキャプチャと検索にはファーストパーティのデスクトップアプリを使えます。',
    'Added the first-party Yomu Gaming desktop app with branded onboarding/settings, configurable whole-screen capture shortcuts, optional area capture, local OCR handoff, in-place OCR overlay lookup, smoke coverage, packaging scripts, and a GitHub Actions workflow for release artifacts.': 'ブランドに沿ったオンボーディングと設定、設定可能な全画面キャプチャショートカット、任意の範囲キャプチャ、ローカルOCR連携、その場で使えるOCRオーバーレイ検索、スモークテスト、パッケージングスクリプト、リリース成果物用のGitHub Actionsワークフローを備えたファーストパーティのYomu Gamingデスクトップアプリを追加しました。',
    'Replaced the public third-party gaming guide and public ADR/comparison pages with first-party Yomu Gaming install docs and guarded docs builds so public pages do not publish internal strategy or competitor-first app guidance.': '公開していたサードパーティ中心のゲームガイドと公開ADR／比較ページを、ファーストパーティのYomu Gamingインストールドキュメントに置き換え、公開ページに内部戦略や競合アプリ中心の案内が出ないようドキュメントビルドを保護しました。',
    'Kept compact control text and passive footer/navigation links eligible for safe lookup while continuing to skip editable composer surfaces during visible-page scans.': 'コンパクトなコントロールテキストとフッター／ナビゲーション内の受動的なリンクを安全な検索対象に保ちつつ、表示ページスキャンでは編集可能な入力欄を引き続きスキップするようにしました。',
    "よむ bundles a set of free Japanese reading tools into one browser add-on. Each one is built for a real moment of immersion — a word you can't read, a manga panel with no selectable text, a video line going by too fast, a kanji you want to break down. They all share the same popup, so you stay inside whatever you're reading.": 'よむは無料の日本語読解ツールを1つのブラウザーアドオンにまとめます。読めない単語、選択できない漫画のコマ、速すぎる動画字幕、分解して見たい漢字など、実際の没入中の場面に合わせて作られています。すべて同じポップアップを使うので、読んでいるものから離れずに済みます。',
    "よむ bundles a set of Japanese reading tools into one browser add-on, each built for a real moment of immersion: a word you can't read, a manga panel with no selectable text, a fast subtitle line, a kanji to break down. They share one popup, so you stay inside whatever you're reading. Everything here is free, runs in your browser, and needs no account. Pick the tool that matches your goal:": 'よむは日本語読解ツールを1つのブラウザーアドオンにまとめます。読めない単語、選択できない漫画のコマ、速い字幕の1行、分解したい漢字など、実際の没入中の場面に合わせて作られています。同じポップアップを共有するので、読んでいるものから離れずに済みます。ここにあるものはすべて無料で、ブラウザー内で動作し、アカウント不要で始められます。目的に合うツールを選んでください:',
    'Everything here is free, runs in your browser, and needs no account to start. Pick the tool that matches what you\'re trying to do:': 'ここにあるものはすべて無料で、ブラウザー内で動作し、始めるのにアカウントは不要です。やりたいことに合うツールを選んでください:',
    "Everything here is": 'ここにあるものはすべて',
    'free': '無料',
    ', runs': 'で、',
    'in your browser': 'ブラウザー内で動作',
    ', and needs': 'し、始めるのに',
    'no account': 'アカウント不要',
    "to start. Pick the tool that matches what you're trying to do:": 'です。やりたいことに合うツールを選んでください:',
    'Japanese OCR & manga reader': '日本語OCR・漫画リーダー',
    'Tap untranslatable text inside manga panels, screenshots, and image-only pages.': '漫画のコマ、スクリーンショット、画像だけのページにある選択できない文字をタップできます。',
    'Furigana reader': 'ふりがなリーダー',
    'Add furigana to any Japanese web page — all words, hard kanji only, or unknown words.': '任意の日本語Webページにふりがなを追加します。全単語、難しい漢字のみ、未知語のみを選べます。',
    'Kanji stroke order': '漢字の書き順',
    'See stroke order, readings, JLPT level, RTK data, and components for any kanji.': '任意の漢字について、書き順、読み、JLPTレベル、RTKデータ、構成要素を確認できます。',
    'Subtitle miner & video reader': '字幕マイニング・動画リーダー',
    'Turn Japanese subtitles into tappable words on YouTube and your own video files.': 'YouTubeや手元の動画ファイルの日本語字幕を、タップできる単語に変えます。',
    'Study & review': '学習・復習',
    'A new-tab study page that reviews Jiten, JPDB, Anki, or imported dictionary cards.': 'Jiten、JPDB、Anki、インポート辞書カードを復習できる新しいタブ用の学習ページです。',
    'YouTube for Japanese': '日本語向けYouTube',
    'Filter recommendations down to Japanese and comprehensible-input videos.': 'おすすめ動画を日本語と理解可能なインプット動画に絞り込みます。',
    'How the tools fit together': 'ツールのつながり',
    'The workflow is always the same loop:': '流れはいつも同じです:',
    'The workflow is always the same loop: find Japanese → understand it in context → save the useful words. A normal web page, a manga page read through OCR, and a video subtitle line all become the same kind of tappable text, so the dictionary, audio, kanji breakdown, and mining buttons work everywhere without you learning a different interface for each one.': '流れはいつも同じです。日本語を見つけ、文脈で理解し、役に立つ単語を保存します。普通のWebページ、OCRで読んだ漫画ページ、動画字幕の1行がすべて同じ「タップできるテキスト」になります。そのため、辞書、音声、漢字分解、マイニングボタンをどこでも同じ操作で使えます。',
    'The loop is always the same: find Japanese → understand it in context → save the useful words. A web page, a manga page read through OCR, and a video subtitle line all become the same tappable text, so the dictionary, audio, kanji breakdown, and mining buttons work everywhere — one interface, not six.': '流れはいつも同じです。日本語を見つけ、文脈で理解し、役に立つ単語を保存します。Webページ、OCRで読んだ漫画ページ、動画字幕の1行がすべて同じ「タップできるテキスト」になります。そのため、辞書、音声、漢字分解、マイニングボタンをどこでも使えます。必要なのは1つの画面だけで、6つの別々の操作を覚える必要はありません。',
    'find Japanese → understand it in context → save the useful words.': '日本語を見つける → 文脈で理解する → 役に立つ単語を保存する。',
    'A normal web page, a manga page read through OCR, and a video subtitle line all become the same kind of tappable text, so the dictionary, audio, kanji breakdown, and mining buttons work everywhere without you learning a different interface for each one.': '普通のWebページ、OCRで読んだ漫画ページ、動画字幕の1行がすべて同じ「タップできるテキスト」になります。そのため、辞書、音声、漢字分解、マイニングボタンをどこでも同じ操作で使えます。',
    'You can use a single tool and ignore the rest. Read manga with just OCR, or watch YouTube with just the immersion filter, or look words up with just the dictionary. They only connect when you want them to.': '1つのツールだけ使って、残りは無視してもかまいません。OCRだけで漫画を読む、没入フィルターだけでYouTubeを見る、辞書だけで単語を調べることもできます。必要になった時だけ連携します。',
    'Use a single tool and ignore the rest: just OCR for manga, just the immersion filter for YouTube, just the dictionary for lookups. They connect only when you want them to.': '1つのツールだけ使って、残りは無視してもかまいません。漫画にはOCRだけ、YouTubeには没入フィルターだけ、単語検索には辞書だけでも使えます。必要な時だけ連携します。',
    'What you need': '必要なもの',
    'userscript manager': 'ユーザースクリプト管理拡張',
    '(Tampermonkey on desktop, Userscripts on iPhone/iPad) — both are free.': '（デスクトップはTampermonkey、iPhone/iPadはUserscripts）です。どちらも無料です。',
    'The free': '無料の',
    'よむ userscript': 'よむユーザースクリプト',
    'Optionally: a': '任意で',
    'account,': 'アカウント、',
    'with AnkiConnect, or a Yomitan dictionary — all optional.': 'とAnkiConnect、またはYomitan辞書を追加できます。すべて任意です。',
    'New here? Start with the': '初めてですか？まずは',
    'New here? Start with the setup guide — it takes about three minutes.': '初めてですか？まずはセットアップガイドから始めてください。約3分で終わります。',
    'setup guide': 'セットアップ手順',
    '— it takes about three minutes.': 'から始めてください。約3分で終わります。',
    'Install よむ (free)': 'よむをインストール（無料）',
    'See all features': 'すべての機能を見る',
    'Read the guides': 'ガイドを読む',
    'Find things to read': '読むものを探す',
    'Read manga, mine anime & YouTube to Anki, find comprehensible-input channels.': '漫画を読み、アニメやYouTubeをAnkiにマイニングし、理解可能なインプットのチャンネルを見つけられます。',
    'Manga, anime, YouTube, graded readers, and comprehensible-input ideas.': '漫画、アニメ、YouTube、レベル別読み物、理解可能なインプットのアイデア。',
    'Open study app': '学習アプリを開く',
    'Review study cards, Anki cards, or imported dictionary cards from the study app.': '学習アプリで学習カード、Ankiカード、インポート辞書カードを復習します。',
    'Open video player': '動画プレイヤーを開く',
    'Use local browser-supported videos and subtitle files with よむ lookup.': 'ブラウザー対応のローカル動画と字幕ファイルでよむ検索を使えます。',
    'Open PDF reader': 'PDFリーダーを開く',
    'Open any PDF and read it with よむ lookup, mining, and OCR.': '任意のPDFを開き、よむの検索、マイニング、OCRで読めます。',
    'Add audio': '音声を追加',
    'Use hosted Yomitan audio first, or self-host files when you need them.': 'まずはホスト版Yomitan音声を使い、必要なら音声ファイルを自分で配信できます。',
    'Get support': 'サポートを受ける',
    'Report a bug, join Discord, donate, or reinstall the userscript.': 'バグ報告、Discord参加、寄付、ユーザースクリプト再インストールができます。',
    'Free and open source. Install as a userscript, or as a Chrome or Firefox extension.': '無料でオープンソース。ユーザースクリプトとして、またはChrome・Firefox拡張機能としてインストールできます。',
    'Released under the MIT license.': 'MITライセンスで公開されています。',
    'Learn Japanese by reading what you actually like': '好きなものを読んで日本語を学ぶ',
    'Tap a word anywhere, understand it in context, save it for review, and keep reading. よむ turns real Japanese pages, manga, subtitles, and study sites into one connected immersion system.': 'どこでも単語をタップし、文脈で理解し、復習用に保存して、そのまま読み続けられます。よむは実際の日本語ページ、漫画、字幕、学習サイトを1つのつながった没入システムにします。',
    'Read first': 'まず読む',
    'Extensive reading works because you meet vocabulary and grammar repeatedly in meaningful context. よむ removes just enough friction that you can stay inside the story.': '多読が効くのは、意味のある文脈の中で語彙や文法に何度も出会えるからです。よむは物語の中に留まれるだけの摩擦を取り除きます。',
    'Read anything Japanese': '日本語なら何でも読む',
    'Web pages, manga images, PDFs, subtitles, and study sites become tappable reading surfaces.': 'Webページ、漫画画像、PDF、字幕、学習サイトがタップできる読書画面になります。',
    'Bring every tool': '必要なツールをまとめて',
    'Local dictionaries, study cards, audio, example sentences, OCR, PDFs, and subtitles all work from the same popup.': 'ローカル辞書、学習カード、音声、例文、OCR、PDF、字幕を同じポップアップから使えます。',
    'Dictionary lookup, mining, Anki cards, audio, example sentences, OCR, and subtitles all work from the same popup.': '辞書検索、マイニング、Ankiカード、音声、例文、OCR、字幕を同じポップアップから使えます。',
    'Start with simple popup lookup. Later, add Jiten or JPDB for review status, import Yomitan dictionary files for local definitions, or connect Anki when you want flashcards.': 'まずはシンプルなポップアップ検索から始められます。あとからJitenやJPDBの復習ステータス、Yomitan辞書のローカル定義、Anki連携を追加できます。',
    'Popup lookup with live study data and mining controls.': 'ライブ学習データとマイニング操作つきのポップアップ検索。',
    'A free Japanese popup reader for Japanese text, manga, video subtitles, and mining.': '日本語テキスト、漫画、動画字幕、マイニング向けの無料日本語ポップアップリーダー。',
    'よむ includes an optional study page. Use the full address after opening that local or hosted page as a browser home page, new-tab page, or iPad Home Screen shortcut. It uses your accent color and tries Anki study words when AnkiConnect is reachable, then Jiten, then JPDB, then local dictionary words. A new install starts by sending you to Settings > Dictionaries so JMdict or another Yomitan ZIP can be downloaded into local browser storage.': 'よむには任意の学習ページがあります。ローカル版またはホスト版を開き、そのURLをホームページ、新しいタブ、iPadホーム画面に設定できます。アクセントカラーを使い、AnkiConnectが届く場合はAnki学習語、その後Jiten、JPDB、ローカル辞書語の順に表示します。',
    'Study supports a normal Word mode, a Recall mode that shows the meaning first and asks you to type or write the Japanese answer before grading, a Listen mode for pitch-accent perception, recall, and shadowing, and kanji study. Recall grades go through the same JPDB, Jiten, or Anki review path as the normal study card after the answer is revealed; Listen keeps a local pitch SRS that grows from the review words and local/common words already feeding the page.': '学習ページは通常のWordモード、意味を先に表示して採点前に日本語の答えを入力または手書きするRecallモード、ピッチアクセントの知覚・想起・シャドーイングを行うListenモード、漢字学習に対応しています。Recallは答えを表示した後、通常カードと同じJPDB、Jiten、Ankiの復習経路で採点します。Listenはページに入ってくる復習語やローカル/一般語から増えるローカルのピッチSRSを保持します。',
    'Study & Review New-Tab Page': '学習・復習 新しいタブページ',
    'Study & Review': '学習・復習',
    'Review Jiten, JPDB, Anki, or imported-dictionary cards, plus pitch-accent Listen practice, from a clean new-tab study page. Open it as your browser home page or an iPad Home Screen shortcut and study Japanese every time you open a tab. Free, in your browser.': 'Jiten、JPDB、Anki、インポート辞書カードに加え、ピッチアクセントのListen練習を、すっきりした新しいタブ学習ページで復習できます。ブラウザーのホームページやiPadホーム画面ショートカットとして開き、タブを開くたびに日本語を学習できます。無料で、ブラウザー内で動作します。',
    'a clean study screen that reviews your Jiten, JPDB, Anki, or imported-dictionary cards, designed to live on your new-tab page or iPad Home Screen.': 'Jiten、JPDB、Anki、インポート辞書カードを復習できる、すっきりした学習画面です。新しいタブやiPadホーム画面に置くためのページです。',
    'a clean study screen for Jiten, JPDB, Anki, imported-dictionary, and pitch-accent Listen practice, designed to live on your new-tab page or iPad Home Screen.': 'Jiten、JPDB、Anki、インポート辞書、ピッチアクセントのListen練習に対応した、すっきりした学習画面です。新しいタブやiPadホーム画面に置くためのページです。',
    'A clean study screen that reviews your Jiten, JPDB, Anki, or imported-dictionary cards plus pitch-accent Listen practice, designed to live on your new-tab page or iPad Home Screen.': 'Jiten、JPDB、Anki、インポート辞書カードに加え、ピッチアクセントのListen練習を復習できる、すっきりした学習画面です。新しいタブやiPadホーム画面に置くためのページです。',
    'Word, Recall, Listen pitch-accent, and kanji review modes with AnkiConnect cards, mobile Anki handoff, Jiten/JPDB actions, offline cached reviews, and the hosted study page': 'AnkiConnectカード、モバイルAnki受け渡し、Jiten/JPDB操作、オフラインキャッシュ復習、ホスト版学習ページに対応したWord、Recall、Listenピッチアクセント、漢字復習モード',
    'for review cards and Listen pitch-accent practice in a browser tab or mobile Home Screen shortcut.': 'ブラウザータブやモバイルのホーム画面ショートカットで復習カードとListenピッチアクセント練習を行えます。',
    'Kotu': 'Kotu',
    ' for pitch-accent minimal-pair and downstep-practice product inspiration, with no code or data copied.': 'ピッチアクセントのミニマルペアとダウンステップ練習の製品体験の参考として。コードやデータはコピーしていません。',
    'Jiten/JPDB': 'Jiten/JPDB',
    'A fresh install starts by sending you to Settings → Dictionaries so JMdict or another Yomitan ZIP can be downloaded into local storage — after that the page works even with no API key or Anki account.': '初回はSettings → Dictionariesに案内され、JMdictや他のYomitan ZIPをローカル保存できます。その後はAPIキーやAnkiアカウントなしでもページを使えます。',
    'Use the よむ study screen for Jiten, JPDB, Anki, or imported dictionary cards.': 'Jiten、JPDB、Anki、またはインポート辞書カード向けによむの学習画面を使用します。',
    'the hosted': 'ホスト版の',
    'reviews Anki when it is reachable, then Jiten, then JPDB, then your local dictionary words in turn — a single daily-review surface for whatever you have connected.': 'は、Ankiに接続できる場合はAnki、その後Jiten、JPDB、ローカル辞書語の順に復習します。接続しているものをまとめて扱える日々の学習画面です。',
    'よむ brings popup lookup, mining, imported dictionaries, subtitles, image reading, and Anki export into one free userscript. Comparable study suites such as': 'よむは、ポップアップ検索、マイニング、インポート辞書、字幕、画像読み取り、Anki書き出しを1つの無料ユーザースクリプトに統合します。同等の学習スイートである',
    'Understand in context': '文脈で理解する',
    'Readings, meanings, kanji, pitch, audio, examples, and dictionary entries stay in one popup.': '読み、意味、漢字、ピッチ、音声、例文、辞書項目を1つのポップアップで確認できます。',
    'Start anywhere': 'どこからでも始める',
    'Begin with graded readers and easy news, then move into Satori, ebooks, manga, YouTube, web novels, and native sites as your known words grow.': 'まずはレベル別読み物ややさしいニュースから始め、知っている単語が増えたら Satori、電子書籍、漫画、YouTube、Web小説、ネイティブ向けサイトへ進めます。',
    'Use it on desktop or mobile, with no account required. Add dictionaries, Anki, OCR, and study features only when you need them.': 'デスクトップでもモバイルでもアカウント不要で使えます。辞書、Anki、OCR、学習機能は必要になった時だけ追加できます。',
    'The method is simple: read material you can mostly follow, look up only what keeps you moving, and let useful words come back later in reviews. This is the same idea behind graded readers, comprehensible input, and i+1 sentences: new Japanese sticks faster when it is attached to a scene, a sentence, and a reason you cared enough to read it.': 'やり方はシンプルです。だいたい理解できる素材を読み、読み進めるために必要なものだけ調べ、役に立つ単語はあとで復習に戻します。これはレベル別読み物、理解可能なインプット、i+1文と同じ考え方です。新しい日本語は、場面、文、そして読みたいと思った理由と結びつくほど定着しやすくなります。',
    'Most reading tools make you pick an ecosystem first. よむ doesn\'t. Import Yomitan dictionaries for offline definitions, connect your own study workflow, pull example sentences from Immersion Kit or Nadeshiko, play audio, trace kanji stroke by stroke, read manga and PDFs with OCR, and mine subtitles from video — all from the same popup, and all optional. Start reading first, then add what you need.': 'ほとんどの読書ツールでは、まず特定の環境を選ぶ必要がありますが、よむは違います。Yomitan辞書をインポートしてオフライン定義を使い、自分の学習フローに接続し、Immersion Kitやなでしこから例文を取得し、音声を再生し、漢字の書き順をなぞり、OCRで漫画やPDFを読み、動画字幕からマイニングできます。すべて同じポップアップから使え、すべて任意です。まずは読書から始め、必要なものを後から追加できます。',
    'よむ runs inside your browser. Tap or hover Japanese text, subtitle lines, or text inside manga images and PDFs to open a clean popup with readings, meanings, kanji, pitch, audio, examples, and save actions.': 'よむはブラウザー内で動きます。日本語テキスト、字幕行、漫画画像やPDF内の文字をタップまたはホバーすると、読み、意味、漢字、ピッチ、音声、例文、保存操作を備えた見やすいポップアップが開きます。',
    'Start with lookup. Add local dictionaries, Anki, OCR, subtitles, and the study page only when they help you keep reading. On mobile, the floating よむ button stays reachable so settings and tools are never far away.': 'まずは検索から始めます。ローカル辞書、Anki、OCR、字幕、学習ページは、読み続ける助けになる時だけ追加できます。モバイルではフローティングのよむボタンから、設定やツールをすぐ開けます。',
    'For the research behind the approach, see the 2025 meta-analysis on': 'このアプローチの背景研究については、2025年のメタ分析',
    'learning a language through extensive reading': '多読による言語学習',
    'the classic idea of': '古典的な考え方である',
    'comprehensible input': '理解可能なインプット',
    "and Tadoku's practical reading rules for Japanese learners at": 'そして日本語学習者向けのTadoku実践的な読書ルール',
    'This guide assumes you have never installed a userscript before.': 'このガイドは、ユーザースクリプトを初めてインストールする人向けです。',
    'A userscript is a small helper that a browser extension runs for you. You install the manager once, then add よむ to that manager. After that, よむ appears on pages with Japanese text and gives you a popup dictionary, mining buttons, OCR, subtitles, and study tools.': 'ユーザースクリプトは、ブラウザー拡張機能が動かす小さな補助ツールです。管理拡張を一度インストールし、その管理拡張によむを追加します。その後、日本語テキストのあるページでよむが表示され、ポップアップ辞書、マイニングボタン、OCR、字幕、学習ツールを使えるようになります。',
    'Short version:': '短くまとめると:',
    'install a userscript manager, install よむ, open any Japanese page, then tap or hover a word.': 'ユーザースクリプト管理拡張を入れ、よむをインストールし、日本語ページを開いて、単語をタップまたはホバーします。',
    'Words You Will See': 'このガイドで出てくる言葉',
    'Userscript manager:': 'ユーザースクリプト管理拡張:',
    'the browser add-on that runs よむ for you. Tampermonkey and Userscripts are examples.': 'よむを動かすブラウザーアドオンです。TampermonkeyやUserscriptsが例です。',
    'JPDB:': 'JPDB:',
    'an optional online study service for word status, review buttons, and mining.': '単語ステータス、復習ボタン、マイニングに使える任意のオンライン学習サービスです。',
    'Yomitan dictionary:': 'Yomitan辞書:',
    'a downloadable dictionary ZIP. よむ can import these so definitions stay local in your browser.': 'ダウンロードできる辞書ZIPです。よむにインポートすると、定義をブラウザー内にローカル保存できます。',
    'Mining:': 'マイニング:',
    'saving a useful word, sentence, subtitle, or image context for later study.': 'あとで学習するために、役に立つ単語、文、字幕、画像コンテキストを保存することです。',
    'OCR:': 'OCR:',
    'image text reading. This is what lets you tap Japanese inside manga panels or screenshots.': '画像内の文字を読み取る機能です。漫画のコマやスクリーンショット内の日本語をタップできるようにします。',
    'Anki / AnkiConnect:': 'Anki / AnkiConnect:',
    'Anki is a flashcard app. [AnkiConnect](https://ankiweb.net/shared/info/2055492159) is the desktop add-on that gives よむ full Anki access, including existing-card status, updates, deck scans, and reviews.': 'Ankiは暗記カードアプリです。[AnkiConnect](https://ankiweb.net/shared/info/2055492159)は、既存カード状態、更新、デッキスキャン、復習など、よむにAnkiへの完全なアクセスを与えるデスクトップ用アドオンです。',
    'Local server:': 'ローカルサーバー:',
    'a helper app running on your own computer, often for audio, OCR, or Anki.': '自分のコンピューター上で動く補助アプリです。音声、OCR、Anki連携などで使われます。',
    'localhost:': 'localhost:',
    'the device you are using right now. On an iPhone,': '今使っている端末のことです。iPhoneでは',
    'means the iPhone, not your desktop.': 'はiPhoneを指し、デスクトップPCではありません。',
    '1. Choose Your Browser': '1. ブラウザーを選ぶ',
    'Chrome or Edge': 'ChromeまたはEdge',
    'Use Tampermonkey. If the browser asks about user scripts, allow them for Tampermonkey.': 'Tampermonkeyを使います。ブラウザーがユーザースクリプトについて確認したら、Tampermonkeyで許可してください。',
    'Firefox': 'Firefox',
    'Use Tampermonkey from the Firefox add-ons store. Desktop Firefox is the easiest path.': 'FirefoxアドオンストアのTampermonkeyを使います。デスクトップ版Firefoxがいちばん簡単です。',
    'Safari, iPhone, iPad': 'Safari、iPhone、iPad',
    'Use Tampermonkey for Safari, or the free open-source Userscripts app for iOS/iPadOS.': 'Safari用Tampermonkey、またはiOS/iPadOS向けの無料オープンソースアプリUserscriptsを使います。',
    'Browser store installs are coming soon. For normal installation today, use the userscript.': 'ブラウザーストア版は準備中です。現時点で通常インストールする場合は、ユーザースクリプト版を使ってください。',
    '2. Install a Userscript Manager': '2. ユーザースクリプト管理拡張をインストール',
    'Chrome, Edge, or desktop Firefox': 'Chrome、Edge、またはデスクトップ版Firefox',
    'Open': '開く',
    'Tampermonkey': 'Tampermonkey',
    'Pick your browser.': '自分のブラウザーを選びます。',
    'Install it from the official browser store.': '公式ブラウザーストアからインストールします。',
    'Pin Tampermonkey if your browser hides extension icons.': 'ブラウザーが拡張機能アイコンを隠す場合は、Tampermonkeyをピン留めします。',
    'On Chromium browsers, Tampermonkey may ask for permission to run user scripts. Choose the option that allows user scripts, otherwise よむ cannot start.': 'Chromium系ブラウザーでは、Tampermonkeyがユーザースクリプト実行の許可を求めることがあります。ユーザースクリプトを許可する選択肢を選んでください。許可しないと、よむは起動できません。',
    'iPhone or iPad': 'iPhoneまたはiPad',
    'The easiest free option is the': '無料でいちばん簡単なのは',
    'Userscripts': 'Userscripts',
    'app. It runs scripts inside Safari.': 'アプリです。Safari内でスクリプトを実行できます。',
    'Get Userscripts — free on the App Store': 'Userscriptsを入手 - App Storeで無料',
    'One-time setup (takes about a minute):': '初回だけの設定（約1分）:',
    'Install Userscripts and open it once. Current versions create a default scripts folder automatically, so the first screen may look mostly empty. That is expected.': 'Userscriptsをインストールして、一度開きます。現在のバージョンは標準のスクリプトフォルダーを自動作成するため、最初の画面がほとんど空に見えても問題ありません。',
    'Open Settings → Safari → Extensions → Userscripts. On newer iOS versions, this may be under Settings → Apps → Safari → Extensions.': '設定 → Safari → 機能拡張 → Userscriptsを開きます。新しいiOSでは、設定 → アプリ → Safari → 機能拡張にある場合があります。',
    '. On newer iOS versions, this may be under': 'を開きます。新しいiOSでは',
    'On newer iOS versions, this may be under': '新しいiOSでは',
    'Apps': 'アプリ',
    '→ Userscripts. On newer iOS versions, this may be under': '→ Userscriptsを開きます。新しいiOSでは',
    '→ Extensions.': '→ 機能拡張にある場合があります。',
    'Turn Userscripts on, then allow it on All Websites.': 'Userscriptsをオンにし、「すべてのWebサイト」で許可します。',
    'Turn Userscripts': 'Userscriptsを',
    'on': 'オン',
    ', then allow it on': 'にし、',
    'on, then allow it on': 'オンにし、',
    'All Websites': 'すべてのWebサイト',
    "That's the setup done. Jump to step 3 to install よむ.": 'これで設定は完了です。手順3に進んで、よむをインストールしてください。',
    'Tampermonkey for Safari': 'Safari用Tampermonkey',
    'is another option if you prefer it.': 'を使うこともできます。',
    '3. Install よむ': '3. よむをインストール',
    'Install よむ userscript': 'よむユーザースクリプトをインストール',
    'On desktop (Chrome, Edge, Firefox):': 'デスクトップ（Chrome、Edge、Firefox）の場合:',
    'Open the link above. Tampermonkey should show an install screen for a script named よむ. Press Install, then open a page with Japanese text.': '上のリンクを開きます。Tampermonkeyに「よむ」というスクリプトのインストール画面が表示されるはずです。Installを押し、その後日本語テキストのあるページを開きます。',
    'On iPhone or iPad (Userscripts app):': 'iPhoneまたはiPad（Userscriptsアプリ）の場合:',
    'The install flow has one extra Safari step.': 'インストール手順には、Safariでの追加ステップが1つあります。',
    'Tap the install link above. Safari may show a page of code. That is normal.': '上のインストールリンクをタップします。Safariにコードのページが表示される場合がありますが、正常です。',
    'Tap AA on iPhone, or the Safari extensions button on iPad.': 'iPhoneではAA、iPadではSafariの機能拡張ボタンをタップします。',
    'Tap': 'タップします:',
    'on iPhone, or the Safari extensions button on iPad.': 'をiPhoneで、またはiPadではSafariの機能拡張ボタンをタップします。',
    'Tap Userscripts in the menu that appears.': '表示されたメニューでUserscriptsをタップします。',
    'in the menu that appears.': 'を表示されたメニューでタップします。',
    'When Userscripts shows the よむ install prompt, tap Install.': 'Userscriptsによむのインストール確認が表示されたら、Installをタップします。',
    'When Userscripts shows the よむ install prompt, tap': 'Userscriptsによむのインストール確認が表示されたら',
    'Open any Japanese page and try tapping a word.': '任意の日本語ページを開き、単語をタップしてみます。',
    'Still seeing only code?': 'まだコードだけが表示されていますか?',
    "Open Userscripts from Safari's AA or extensions menu. iOS does not show the install prompt until you do. If Userscripts is missing from that menu, enable it in Settings → Safari → Extensions.": 'SafariのAAまたは機能拡張メニューからUserscriptsを開いてください。iOSでは、この操作をするまでインストール確認が表示されません。そのメニューにUserscriptsがない場合は、設定 → Safari → 機能拡張で有効にしてください。',
    '4. Add Jiten/JPDB, Or Skip It For Now': '4. Jiten/JPDBを追加する、または今はスキップ',
    'Add an API source (optional)': 'APIソースを追加する（任意）',
    'Add an API source': 'APIソースを追加',
    'connect Jiten or JPDB for word tracking and mining. Optional, and you can do it later': '単語ステータスとマイニング用にJitenまたはJPDBを接続します。任意で、あとからでも追加できます',
    'Jiten/JPDB are optional for basic local dictionary lookup, but they are the easiest way to get word status and mining.': '基本的なローカル辞書検索にJiten/JPDBは必須ではありませんが、単語ステータスとマイニングを使うにはいちばん簡単です。',
    'Jiten and JPDB can give よむ word status and mining actions. Local dictionary lookup works fine without them, but connecting one makes progress tracking easier.': 'JitenとJPDBを接続すると、よむで単語ステータスやマイニング操作を使えます。ローカル辞書検索は接続なしでも使えますが、どちらかを接続すると進捗管理が楽になります。',
    'Create or open your': '自分の',
    'JPDB account': 'JPDBアカウント',
    'JPDB settings': 'JPDB設定',
    'Copy your API key from the API section.': 'APIセクションからAPIキーをコピーします。',
    'Open your Jiten or JPDB settings and copy your API key.': 'JitenまたはJPDBの設定を開き、APIキーをコピーします。',
    'Open よむ settings with the floating よむ button. The Open settings shortcut is configurable in Settings → Shortcuts.': 'フローティングのよむボタンでよむ設定を開きます。「Open settings」のショートカットは Settings → Shortcuts で変更できます。',
    'Paste the key into the API key field.': 'API key欄にキーを貼り付けます。',
    'Paste the key into the matching': '対応する',
    'Save.': '保存します。',
    'You can use よむ without a Jiten/JPDB key by importing Yomitan dictionaries from Settings > Dictionaries. Source-specific actions such as mining still need that source\'s API key.': 'Settings > DictionariesからYomitan辞書をインポートすれば、Jiten/JPDBキーなしでもよむを使えます。マイニングなど、ソース固有の操作には引き続きそのソースのAPIキーが必要です。',
    "You can also study from imported dictionaries instead — see Settings → Dictionaries. Source-specific mining actions still need that source's key.": 'インポートした辞書から学習することもできます。Settings → Dictionariesを見てください。ソース固有のマイニング操作には、そのソースのキーが必要です。',
    '5. Pick A First Reading Site': '5. 最初に読むサイトを選ぶ',
    'Good よむ sites have selectable Japanese text, interesting short pieces, or images/subtitles that become readable with よむ OCR and subtitle tools. The goal is not to finish the hardest thing you can find. The goal is to read every day at the edge of comfort, where most sentences make sense and the unknown words are worth saving.': 'よむに向いたサイトは、選択できる日本語テキスト、短くて面白い文章、またはよむのOCRや字幕ツールで読める画像・字幕があるサイトです。目的は、見つけた中でいちばん難しいものを読み切ることではありません。多くの文が理解でき、未知語を保存する価値があるくらいの、少し背伸びした素材を毎日読むことです。',
    'These are strong starting points, based on recurring recommendations from r/LearnJapanese reading threads and the sites that work well with popup lookup:': 'r/LearnJapaneseの読書スレッドで繰り返しおすすめされているものや、ポップアップ検索と相性の良いサイトをもとにした、始めやすい候補です:',
    'Tadoku free books': 'Tadoku無料本',
    'Free graded readers from starter level upward. Best first stop when native sites still feel too dense.': '入門レベルから読める無料graded readersです。ネイティブ向けサイトがまだ密度高く感じるときの最初の一歩に向いています。',
    'NHK News Web Easy': 'NHK News Web Easy',
    'Short simplified news with furigana and audio. Great daily habit once basic grammar is in place.': 'ふりがなと音声つきの短いやさしいニュースです。基本文法が身についた後の日課に向いています。',
    'Satori Reader': 'Satori Reader',
    'Polished learner stories with notes and audio. よむ adds your normal Jiten, JPDB, Anki, and Yomitan flow on top.': '注釈と音声つきの洗練された学習者向けストーリーです。よむを重ねると、いつものJiten、JPDB、Anki、Yomitanフローも使えます。',
    'Watanoc': 'Watanoc',
    'Short articles by JLPT-ish level. Useful bridge between graded readers and native web articles.': 'JLPT目安レベル別の短い記事です。graded readersからネイティブ向けWeb記事への橋渡しに役立ちます。',
    'Hukumusume fairy tales': '福娘童話集',
    "Large collection of folk tales and children's stories. Repetition makes it friendly for mining common words.": '昔話や子ども向け物語の大きなコレクションです。繰り返しが多く、よく出る単語のマイニングに向いています。',
    'MATCHA Easy Japanese': 'MATCHA Easy Japanese',
    'Travel and culture articles in simpler Japanese. Nice when you want real-world topics instead of drills.': '旅行や文化の記事をやさしい日本語で読めます。ドリルではなく現実の話題を読みたいときに便利です。',
    'Ttsu Reader': 'Ttsu Reader',
    'Read Japanese EPUBs in the browser with よむ lookup. This is the clean route into light novels and books.': 'ブラウザーで日本語EPUBを読み、よむ検索を使えます。ライトノベルや本へ進むためのすっきりしたルートです。',
    'Learn Natively': 'Learn Natively',
    'Find books, manga, and web material by difficulty so your next read is challenging without being miserable.': '本、漫画、Web素材を難易度別に探せます。次に読むものを、つらすぎず挑戦的なレベルにできます。',
    'Aozora Bunko': '青空文庫',
    'Free public-domain literature. Better for intermediate and advanced readers, or for mining short passages.': '無料のパブリックドメイン文学です。中級・上級者や、短い一節のマイニングに向いています。',
    'Kakuyomu': 'カクヨム',
    'Native web novels with selectable text. Use after easier material, or search for genres you already love.': '選択可能なテキストで読めるネイティブ向けWeb小説です。やさしい素材の後に使うか、好きなジャンルを探してみてください。',
    'Shosetsuka ni Naro': '小説家になろう',
    'Huge native web-novel site. Excellent for long-term immersion once lookup speed feels natural.': '巨大なネイティブ向けWeb小説サイトです。検索速度に慣れてきた後の長期的な没入に向いています。',
    'YouTube with Japanese subtitles': '日本語字幕つきYouTube',
    'Use よむ subtitle lookup and the transcript panel for listening-plus-reading immersion.': 'よむの字幕検索とトランスクリプトパネルを使って、聞くことと読むことを組み合わせた没入学習ができます。',
    'Community threads worth skimming:': 'ざっと読む価値のあるコミュニティスレッド:',
    'Tadoku graded reader update': 'Tadoku graded reader更新情報',
    'beginner reading resources': '初心者向け読書リソース',
    'learning Japanese by reading': '読書で日本語を学ぶ方法',
    '6. Try Your First Lookup': '6. 最初の検索を試す',
    'Open a Japanese article, manga page, Jiten/JPDB page, or video page.': '日本語の記事、漫画ページ、Jiten/JPDBページ、または動画ページを開きます。',
    'Tap or hover a word.': '単語をタップまたはホバーします。',
    'Use the popup to read meanings, play audio, open kanji details, or mine the word.': 'ポップアップで意味を読み、音声を再生し、漢字詳細を開き、単語をマイニングできます。',
    'On phones and tablets, tapping is usually easier than hover. On desktop, hover is faster once you are used to it.': 'スマートフォンやタブレットでは、通常ホバーよりタップの方が簡単です。デスクトップでは、慣れるとホバーの方が速くなります。',
    '7. Turn On More Tools When You Need Them': '7. 必要になったら追加ツールをオンにする',
    'Dictionaries: choose the Dictionaries tab in Settings when you want local dictionary study words. よむ downloads JMdict into local browser storage when the userscript request bridge is available; you can also import any Yomitan ZIP dictionary or settings export manually.': '辞書: ローカル辞書の学習語が欲しいときは、設定のDictionariesタブを選びます。ユーザースクリプトのリクエストブリッジが使える場合、よむはJMdictをブラウザーのローカルストレージにダウンロードできます。任意のYomitan ZIP辞書や設定エクスポートを手動でインポートすることもできます。',
    'Images: enable OCR to tap Japanese text inside manga panels or screenshots.': '画像: OCRを有効にすると、漫画のコマやスクリーンショット内の日本語テキストをタップできます。',
    'Video: enable subtitles to mine words from Japanese subtitle lines. For local files, use the': '動画: 字幕を有効にすると、日本語字幕行から単語をマイニングできます。ローカルファイルでは',
    'Yomu video player': 'Yomu動画プレイヤー',
    '. On iPhone, the transcript opens as a bottom panel so it does not crush the video. On desktop and iPad, move it left, right, or below from the transcript header.': 'を使います。iPhoneでは、動画を圧迫しないようにトランスクリプトが下部パネルとして開きます。デスクトップとiPadでは、トランスクリプトのヘッダーから左、右、下へ移動できます。',
    'On iPhone, the transcript opens as a bottom panel so it does not crush the video. On desktop and iPad, move it left, right, or below from the transcript header.': 'iPhoneでは、動画を圧迫しないようにトランスクリプトが下部パネルとして開きます。デスクトップとiPadでは、トランスクリプトのヘッダーから左、右、下へ移動できます。',
    'Anki: enable Anki mining. Desktop [AnkiConnect](https://ankiweb.net/shared/info/2055492159) is the full path: it can create or update cards, check existing-card status, scan your decks and note types, and feed Anki reviews into the new-tab page. iPhone, iPad, and Android can use mobile Anki handoff when AnkiConnect is not available, but handoff creates new notes only.': 'Anki: Ankiマイニングを有効にします。デスクトップの[AnkiConnect](https://ankiweb.net/shared/info/2055492159)が完全な経路です。カードの作成・更新、既存カード状態の確認、デッキやノートタイプのスキャン、新しいタブページへのAnki復習の供給ができます。iPhone、iPad、AndroidではAnkiConnectが使えない場合にモバイルAnki受け渡しを使えますが、作成できるのは新規ノートのみです。',
    'For existing Anki libraries, open Settings > Anki and use **Check AnkiConnect** to verify the connection, **Create Yomu note type** to prepare a clean よむ deck and note type, or **Scan existing decks** to inspect Core, RTK, anime-card, or other nonstandard note types and suggest field mappings. Scanning helps よむ place expression, reading, meaning, sentence, audio, and image data into familiar fields, but it needs AnkiConnect and does not make mobile handoff pull status, discover mappings, or provide review queues.': '既存のAnkiライブラリでは、Settings > Ankiを開き、**Check AnkiConnect**で接続確認、**Create Yomu note type**できれいなよむデッキとノートタイプの準備、**Scan existing decks**でCore、RTK、アニメカードなどの非標準ノートタイプを調べてフィールド対応付けを提案できます。スキャンにより、表記、読み、意味、文、音声、画像データを慣れたフィールドへ入れやすくなりますが、AnkiConnectが必要で、モバイル受け渡しが状態取得、対応付け検出、復習キューをできるようになるわけではありません。',
    'New tab: use the よむ': '新しいタブ: よむの',
    'new-tab page': '新しいタブページ',
    'as a study screen; opening it turns the study page on automatically.': 'を学習画面として使えます。開くと学習ページが自動的にオンになります。',
    'Audio: the easiest hosted setup is': '音声: いちばん簡単なホスト版設定は',
    'Ultimate Yomitan Audio': 'Ultimate Yomitan Audio',
    '. If you want to self-host the audio files instead, the commonly shared files are here:': 'です。代わりに音声ファイルを自分で配信したい場合、よく共有されているファイルはこちらです:',
    'If you want to self-host the audio files instead, the commonly shared files are here:': '代わりに音声ファイルを自分で配信したい場合、よく共有されているファイルはこちらです:',
    '8. Mobile Notes': '8. モバイルの注意点',
    'iPhone, iPad, and Android browsers can run よむ through a userscript app, but local desktop bridges are different there. Public lookup, local dictionaries, OCR, subtitle taps, the hosted video player, the new-tab study page, and mobile Anki handoff are the friendly mobile paths. Direct AnkiConnect and localhost audio helpers still need a desktop computer that is reachable from the device, for example on the same Wi-Fi or through Tailscale.': 'iPhone、iPad、Androidブラウザーでは、ユーザースクリプトアプリ経由でよむを実行できます。ただし、ローカルのデスクトップブリッジは扱いが異なります。公開検索、ローカル辞書、OCR、字幕タップ、ホスト版動画プレイヤー、新しいタブ学習ページ、モバイルAnki受け渡しが使いやすいモバイル経路です。直接のAnkiConnectやlocalhost音声ヘルパーには、同じWi-FiやTailscaleなどで端末から到達できるデスクトップコンピューターが必要です。',
    'Mobile Anki handoff is one-way: it opens AnkiMobile or AnkiDroid so you can create a new note. It does not read your existing collection, show existing-card status, update old notes, scan decks, discover field mappings, or provide Anki review queues. Saved mappings can still shape AnkiMobile add-note links; use desktop Anki with AnkiConnect for discovery, updates, status, and reviews.': 'モバイルAnki受け渡しは一方向です。AnkiMobileまたはAnkiDroidを開き、新規ノートを作成できるようにします。既存コレクションの読み取り、既存カード状態の表示、既存ノートの更新、デッキスキャン、フィールド対応付けの検出、Anki復習キューの提供はできません。保存済み対応付けはAnkiMobile追加リンクの形には反映できますが、検出、更新、状態、復習にはデスクトップAnkiとAnkiConnectを使ってください。',
    "Localhost on a phone or tablet means that device, not your desktop. If you run AnkiConnect, a local audio server, or OCR on a computer, use that computer's LAN/Tailscale address in よむ settings. Mobile browsers can also block autoplay and protected/cross-origin video capture, so subtitle lookup, copying, mining, and dictionary fallback remain the reliable mobile path.": 'スマートフォンやタブレットでのlocalhostは、その端末自身を指し、デスクトップPCではありません。AnkiConnect、ローカル音声サーバー、OCRをコンピューターで動かす場合は、そのコンピューターのLAN/Tailscaleアドレスをよむ設定で使ってください。モバイルブラウザーは自動再生や保護された動画・クロスオリジン動画のキャプチャをブロックすることもあるため、字幕検索、コピー、マイニング、辞書フォールバックがモバイルで信頼できる経路です。',
    'If a setup step mentions leaving a terminal window or local server running, treat it as optional power-user setup. The hosted audio path, mining, imported dictionaries, and the new-tab page are simpler on mobile.': '設定手順でターミナルウィンドウやローカルサーバーを動かしたままにする説明が出てきた場合、それは任意の上級者向け設定と考えてください。モバイルでは、ホスト版音声、マイニング、インポート辞書、新しいタブページの方が簡単です。',
    '9. Back Up Settings': '9. 設定をバックアップ',
    'After setup, go to Settings > Dictionaries and use Export settings JSON. This gives you a small backup file you can import on another browser later.': 'セットアップ後、Settings > Dictionariesに移動し、Export settings JSONを使います。後で別のブラウザーにインポートできる小さなバックアップファイルが作成されます。',
    'If Something Does Not Work': 'うまく動かない場合',
    'The most common fixes are enabling the userscript manager for the current site, refreshing the page after changing settings, checking that a Jiten/JPDB key was pasted correctly, and remembering that': 'よくある解決策は、現在のサイトでユーザースクリプト管理拡張を有効にすること、設定変更後にページを更新すること、Jiten/JPDBキーが正しく貼り付けられているか確認すること、そして',
    'on an iPhone means the iPhone itself rather than your desktop computer. If the install link or hosted tools are down, check': 'はiPhone上ではデスクトップPCではなくiPhone自身を指すことを思い出すことです。インストールリンクやホスト版ツールが落ちている場合は',
    'for reinstall, Discord, and issue-report options.': 'で再インストール、Discord、問題報告の選択肢を確認してください。',
    'use the hosted option if you want the least fuss. Use the local server only if you are okay keeping a small helper app running on your computer.': '手間を最小にしたいならホスト版を使います。小さな補助アプリをコンピューター上で動かし続けてもよい場合だけ、ローカルサーバーを使ってください。',
    'Easiest: Hosted Audio': 'いちばん簡単: ホスト版音声',
    'Local Audio: What You Need': 'ローカル音声: 必要なもの',
    'Step 1: Download the Server': '手順1: サーバーをダウンロード',
    'Step 2: Add the Audio Files': '手順2: 音声ファイルを追加',
    'Step 3: Start the Server': '手順3: サーバーを起動',
    'Step 4: Check That It Works': '手順4: 動作確認',
    'Step 5: Add It to よむ': '手順5: よむに追加',
    'Using an iPad or Another Device': 'iPadや別の端末で使う',
    'If Audio Does Not Play': '音声が再生されない場合',
    'よむ can play audio from any Yomitan-compatible audio source. There are two good ways to set it up:': 'よむはYomitan互換の音声ソースから音声を再生できます。設定方法は主に2つあります:',
    'What you want': 'やりたいこと',
    'Best choice': 'おすすめ',
    'The easiest setup': 'いちばん簡単な設定',
    'Use the hosted Ultimate Yomitan Audio URL': 'ホスト版Ultimate Yomitan Audio URLを使う',
    'Audio files stored on your own computer': '自分のコンピューターに保存した音声ファイルを使う',
    'Download and run the local audio server': 'ローカル音声サーバーをダウンロードして実行する',
    'よむ is designed around one loop: find Japanese in the wild, understand it quickly, and save the useful bits for study.': 'よむは1つの流れを中心に設計されています。実際の場所で日本語を見つけ、すばやく理解し、役に立つ部分を学習用に保存します。',
    'If you are new to these tools, the short version is:': 'これらのツールが初めてなら、短くまとめると:',
    'lookup': '検索',
    'means opening the popup,': 'はポップアップを開くこと、',
    'mining': 'マイニング',
    'means saving something for later study,': 'はあとで学習するために何かを保存すること、',
    'means reading text from images, and': 'は画像から文字を読むこと、そして',
    'subtitles': '字幕',
    'means Japanese video lines become tappable like normal page text.': 'は日本語の動画字幕行を普通のページテキストのようにタップ可能にすることです。',
    'Popup Lookup And Mining': 'ポップアップ検索とマイニング',
    'Yomitan Dictionaries': 'Yomitan辞書',
    'Audio And Examples': '音声と例文',
    'Kanji Drilldown': '漢字ドリルダウン',
    'Image And Manga OCR': '画像・漫画OCR',
    'Video Subtitle Mining': '動画字幕マイニング',
    'YouTube Immersion Filter': 'YouTube没入フィルター',
    'Anki And Mobile Handoff': 'Ankiとモバイルハンドオフ',
    'New Tab Study Page': '新しいタブ学習ページ',
    'Help And Support In Settings': '設定内のヘルプとサポート',
    'Useful Pages': '便利なページ',
    'Docs': 'ドキュメント',
    'Quick Actions': 'クイックアクション',
    'Install userscript': 'ユーザースクリプトをインストール',
    'Report a bug': 'バグを報告',
    'Join Discord': 'Discordに参加',
    'Donate': '寄付する',
    'View source': 'ソースを見る',
    'Store installs': 'ストア版',
    // New Translations
    'New to the words?': '初めての方へ：',
    'Lookup': 'ルックアップ',
    'is opening the popup.': 'はポップアップを開くこと。',
    'Mining': 'マイニング',
    'is saving a word for later study.': 'は後で学習するために単語を保存すること。',
    'reads text out of images.': 'は画像からテキストを読み取ること。',
    'Subtitles': '字幕',
    'turns Japanese video lines into lookup-ready text, just like a normal page.': 'は日本語の動画字幕行を、通常のページと同じように検索しやすいテキストに変換すること。',
    'Choose Japanese text to open the popup; desktop hover/click and mobile touch/select are supported. It shows the reading and meaning right away, plus whatever you\'ve turned on: Jiten definitions, optional JPDB data, imported dictionary entries, pitch and frequency, audio, example sentences, and kanji details. Mining buttons sit at the bottom.': '日本語のテキストを選ぶとポップアップが開きます。デスクトップではホバーやクリック、モバイルではタッチや選択に対応しています。読み方や意味がすぐに表示されるほか、有効化している機能（Jitenの定義、任意のJPDBデータ、インポートした辞書のエントリ、ピッチと頻度、音声、例文、漢字の詳細など）も表示されます。マイニング用ボタンは下部にあります。',
    'Keyboard shortcuts can move lookup to the previous or next parsed word, and if you have selected a piece of text, navigation stays inside that selection. Popup Japanese font family and weight are configurable, and the default stack matches jpdb.io for kanji, readings, example sentences, grammar snippets, and dictionary terms.': 'キーボードショートカットを使用して、ルックアップ対象を前後の解析された単語に移動できます。テキストを選択している場合、ナビゲーションはその選択範囲内に留まります。ポップアップ内の日本語のフォントファミリーやウェイトは設定可能で、デフォルトの設定は漢字、読み仮名、例文、文法スニペット、辞書用語について jpdb.io の表示スタイルと一致しています。',
    'API mining actions can add a word, mark it Never Forget, blacklist it, or send review grades, and can be turned off while keeping popup lookup. When Anki is enabled, よむ can create a compact note with the word, reading, meaning, source sentence, source link, local dictionary content, optional context images, and Immersion Kit audio. The word-first Anki front can hide the reading, sentence, or image if you want a stricter prompt.': 'APIマイニング操作では、単語の追加、忘れない指定、ブラックリスト登録、復習評価の送信ができます。ポップアップ検索を残したままマイニング操作だけをオフにもできます。Ankiが有効な場合、よむは単語、読み、意味、元の文、ソースリンク、ローカル辞書、任意の文脈画像、Immersion Kit音声を含むコンパクトなノートを作成できます。',
    'Furigana and word colors are separate controls. You can show furigana only for harder kanji, show all parsed readings, hide furigana for known words, color words by Jiten, JPDB, or Anki state, color them by pitch accent, or turn highlight coloring off.': 'ふりがなと単語の色は個別に制御できます。難しい漢字のみにふりがなを表示したり、解析されたすべての読みを表示したり、既知の単語のふりがなを非表示にしたりできます。また、Jiten、JPDB、Ankiの状態やピッチアクセントに基づいて単語を着色することや、ハイライト表示の着色をオフにすることも可能です。',
    'The popup also has optional study helpers for the current sentence. The translation tool generates a plain sentence translation when you open that section, and the grammar tool highlights likely grammar patterns with short explanations and guide links. These tools are meant to help you keep reading, not to replace a dictionary or grammar textbook.': 'ポップアップには、表示中の文に対するオプションの学習支援ツールもあります。翻訳ツールはそのセクションを開いたときに対象文のプレーンな翻訳を生成し、文法ツールは考えられる文法パターンをハイライトして簡単な説明とガイドへのリンクを表示します。これらのツールは読書を続けるのを助けるためのものであり、辞書や文法教科書の代わりになるものではありません。',
    'よむ can import Yomitan dictionary ZIP files, Yomitan settings exports, and dictionary backups. Imported dictionaries stay local in your browser. If you do not have an API source or Anki connected, よむ can still use public lookup and local dictionary words for the study page after you download JMdict or import a Yomitan ZIP in Settings.': 'よむはYomitan辞書ZIP、Yomitan設定エクスポート、辞書バックアップをインポートできます。辞書はブラウザー内に保存されます。APIソースやAnkiに接続していなくても、SettingsでJMdictをダウンロードするかYomitan ZIPをインポートすれば、学習ページで公開検索とローカル辞書の単語を使えます。',
    'This is useful if you want native-language dictionaries, monolingual Japanese definitions, frequency dictionaries, kanji dictionaries, or pitch dictionaries without depending on a remote service for every lookup.': 'これは、検索のたびにリモートサービスに依存することなく、母国語の辞書、国語辞典（日本語一カ国語定義）、頻度辞書、漢字辞書、またはピッチアクセント辞書を使用したい場合に便利です。',
    'Dictionary import and source ordering controls.': '辞書のインポートとソースの順序制御。',
    'The speaker button tries your configured audio sources in order. The default setup uses public Japanese audio sources, Jiten and optional JPDB word audio, and browser text-to-speech as fallbacks. If you already use a Yomitan-style audio source, you can add it as a custom URL.': 'スピーカーボタンは、設定された音声ソースを順番に試します。デフォルト設定では、公開されている日本語音声ソース、Jitenと任意のJPDB単語音声、およびブラウザの音声合成（TTS）を代替用フォールバックとして使用します。すでにYomitanスタイルの音声ソースを使用している場合は、カスタムURLとして追加できます。',
    'Example sentences can come from Jiten/JPDB public example rows, Immersion Kit without an API key, or Nadeshiko when you add your own Nadeshiko key. You can also use Immersion Kit + Nadeshiko together; よむ blends the results in a stable order so the same word does not reshuffle every time you open it.': '例文は、Jiten/JPDBの一般公開されている例文行、APIキー不要のImmersion Kit、または自身のNadeshikoキーを追加した場合はNadeshikoから取得できます。Immersion KitとNadeshikoを併用することも可能です。よむは結果を安定した順序でブレンドするため、ポップアップを開くたびに同じ単語の例文がシャッフルされることはありません。',
    'Examples can show Japanese, translations, thumbnails, audio, and source filters. Settings let you choose categories, length limits, image visibility, translation visibility, playback speed, and one-time hover audio on desktop. To practice without seeing English immediately, turn on blurred example translations and reveal them only when you choose the translation.': '例文には日本語、翻訳、サムネイル、音声、ソースフィルターを表示できます。設定では、カテゴリ、長さ制限、画像の表示/非表示、翻訳の表示/非表示、再生速度、およびデスクトップでのホバー時の自動音声再生を選択できます。英語をすぐに目に入れずに練習したい場合は、例文の翻訳をぼかし、翻訳を選んだときだけ表示します。',
    'Examples, translations, and audio stay inside the normal popup.': '例文、翻訳、音声は通常のポップアップ内に収まります。',
    'Click a kanji inside the popup headword to open a focused kanji panel. Depending on your settings and imported data, it can show Jiten and optional JPDB facts, stroke count, grade, JLPT level, RTK data, related words, component hints, KanjiVG stroke tracing, and a small drawing pad.': 'ポップアップの見出し語の中の漢字をクリックすると、特定の漢字パネルが開きます。設定やインポートされたデータに応じて、Jitenと任意のJPDB情報、画数、学年、JLPTレベル、RTK（Heisig）データ、関連語、構成要素のヒント、KanjiVGの筆順追跡、および小さな描画パッドを表示できます。',
    'Kanji origin sources are modular and license-aware. You can turn off optional public sources independently.': '漢字情報のソースはモジュール化されており、ライセンスが考慮されています。オプションの公開ソースを個別にオフにすることができます。',
    'Recognized text stays lightweight: lookup targets sit over the image without covering it until you choose or hover a word.': '認識されたテキストは軽量な状態を保ちます。単語を選ぶかホバーするまで、検索ターゲットは画像を覆わずに配置されます。',
    'Use this for manga panels, screenshots, and image-heavy pages where normal text selection does not work. The image itself is not sent anywhere unless you enable a local OCR endpoint, and that endpoint is the one you configure in settings.': '通常のテキスト選択が機能しない漫画のコマ、スクリーンショット、画像の多いページでこれを使用します。ローカルOCRエンドポイントを有効にしない限り、画像自体が外部に送信されることはありません。また、そのエンドポイントは設定で構成したものです。',
    'Image OCR settings for manga and embedded image text.': '漫画や埋め込み画像テキスト用の画像OCR設定。',
    'よむ can add an ASB-style subtitle overlay for video pages. Japanese subtitles can be parsed into lookup-ready words, native-language subtitle tracks can be shown as a secondary line, and the transcript panel can sit left, right, or below the video with the active line highlighted while you read.': 'よむは、動画ページにAnimebook（ASB）スタイルの字幕オーバーレイを追加できます。日本語の字幕を検索しやすい単語に解析したり、母国語の字幕トラックを副行として表示したりできるほか、トランスクリプトパネルを動画の左、右、または下に配置して、読んでいるアクティブな行をハイライト表示させることができます。',
    'The transcript works like the overlay: visible Japanese lines are parsed for lookup, so you can skim, jump to a line, and open the popup from the transcript.': 'トランスクリプトもオーバーレイと同じように機能します。表示されている日本語行は検索用に解析されるため、ざっと読み、行へジャンプし、トランスクリプトからポップアップを開けます。',
    'For local files, open the': 'ローカルファイルの場合は、',
    ', drop in a browser-supported video, and use the Subtitles button to add Japanese or native subtitle files. The page creates normal browser video and text tracks, so the same overlay and transcript tools work without a desktop bridge.': 'を開き、ブラウザが対応している動画をドロップして、「字幕」ボタンから日本語または母国語の字幕ファイルを追加します。このページは通常のブラウザ動画とテキストトラックを作成するため、デスクトップブリッジなしで同じオーバーレイとトランスクリプトツールが動作します。',
    'You can use shortcuts for previous subtitle, next subtitle, copy subtitle, and mining. The transcript panel is off by default, opens from the subtitle controls, and can also be set to open only while the video is paused. On phones it becomes a bottom panel so the video stays usable.': '前後の字幕への移動、字幕のコピー、マイニングのショートカットキーを使用できます。トランスクリプトパネルはデフォルトでオフになっており、字幕コントロールから開くことができます。また、動画が一時停止している間のみ開くように設定することも可能です。スマートフォンでは、動画の操作性を保つために下部パネルになります。',
    'Subtitle overlay and transcript controls on a live Comprehensible Japanese video.': 'Comprehensible Japaneseの動画上で動作する字幕オーバーレイとトランスクリプトのコントロール。',
    'The YouTube filter is on by default so recommendations stay focused on Japanese. よむ checks the original YouTube title through oEmbed when a video id is available, keeps Japanese-learning and comprehensible-input titles visible even when they are written in English, then hides cards that do not look Japanese across recommendations, search results, and sidebars. YouTube playback, subtitles, and よむ controls keep working.': 'YouTubeフィルターはデフォルトでオンになっており、おすすめ動画が日本語に集中するようにします。よむは、動画IDが利用可能な場合にoEmbedを通じて元のYouTubeタイトルを確認し、英語で書かれている場合でも日本語学習や理解可能なインプット（Comprehensible Input）のタイトルを表示し続け、おすすめ、検索結果、サイドバー全体で日本語らしくないカードを非表示にします。YouTubeの再生、字幕、およびよむのコントロールはそのまま動作し続けます。',
    'The temporary notice shows how many cards were hidden and disappears after a few seconds. Use': '一時的な通知には、非表示にされたカードの数が表示され、数秒後に消えます。',
    'Show hidden videos': '非表示の動画を表示',
    'to reveal them,': 'でそれらを表示し、',
    'Hide hidden videos': '非表示の動画を隠す',
    'to filter them again,': 'で再びフィルタリングし、',
    'Hide notice': '通知を隠す',
    'to stop showing that notice while keeping the filter enabled, or': 'でフィルターを有効にしたままその通知の表示を停止できます。または、',
    'to toggle the filter itself.': 'でフィルター自体を切り替えることも可能です。',
    'On the YouTube home feed, when よむ hides enough English-heavy recommendations, it can also offer a dismissible starter guide of Japanese YouTube channels. Use': 'YouTubeのホームフィードにおいて、英語の多いおすすめ動画が十分に非表示になると、よむは非表示に設定可能な日本語YouTubeチャンネルのスターターガイドを提示することもできます。',
    'Later': '後で',
    'to hide it for the current page,': 'で現在のページから非表示にし、',
    'Never show': '二度と表示しない',
    'to turn it off, or': 'でオフにするか、',
    'Show all': 'すべて表示',
    'to browse the full 100-channel list with direct subscribe links.': 'で直接の購読リンク付きの100チャンネルのフルリストを閲覧できます。',
    'Search results stay usable for beginner Japanese comprehensible input, including English-titled videos and Shorts.': '検索結果は、英語タイトルの動画やShortsを含め、初心者の日本語の理解可能なインプット向けとして利用可能な状態に保たれます。',
    'Filtered YouTube recommendations with temporary reveal and notice controls visible.': '一時的な表示および通知コントロールが表示された、フィルタリング済みのYouTubeおすすめ動画。',
    'Anki support is optional. With': 'Anki連携はオプションです。',
    'reachable, よむ can create cards from popup lookups, subtitles, and OCR; detect existing cards; update matching notes; adapt to existing decks and note types; and power Anki-backed review/status features in the new-tab page.': 'に接続できる場合、よむはポップアップ検索、字幕、OCRからカードを作成し、既存のカードを検出し、一致するノートを更新し、既存のデッキやノートタイプに適応できます。また、新規タブページでAnkiを活用した復習・ステータス機能を動かすことができます。',
    'On a phone or tablet, the full Anki setup still uses desktop AnkiConnect. Keep Anki open on your computer, connect the phone to that computer over trusted Wi-Fi or': 'スマートフォンやタブレットでの完全なAnkiセットアップでは、引き続きデスクトップのAnkiConnectを使用します。PCでAnkiを開いた状態にし、信頼できるWi-Fiまたは',
    ', then put the computer\'s AnkiConnect URL into よむ. The phone does the reading; the computer does the Anki work.': 'を介してスマートフォンをPCに接続し、PCのAnkiConnectのURLをよむに入力します。スマートフォンは読書画面になり、PCがAnkiの処理を行います。',
    'For a step-by-step phone, iPad, or Android setup, use': 'スマートフォン、iPad、またはAndroidでのステップバイステップのセットアップ手順については、',
    'Mobile handoff is deliberately narrower. On iPhone, iPad, and Android, よむ can open AnkiMobile or AnkiDroid when AnkiConnect is not available, but that path creates new-note drafts only. Existing-card status, note updates, automatic deck scans, media writes, full field mappings, and review queues still need desktop AnkiConnect.': 'モバイルハンドオフは意図的に機能を絞っています。iPhone、iPad、Androidにおいて、AnkiConnectに接続できない場合によむはAnkiMobileやAnkiDroidを開くことができますが、その方法では新規ノートの下書き作成のみが行われます。既存カードのステータス、ノートの更新、自動デッキスキャン、メディアの書き込み、完全なフィールドマッピング、復習キューなどには、依然としてデスクトップのAnkiConnectが必要です。',
    'If you already use RTK, Core, anime-card, or other nonstandard Japanese decks, keep desktop AnkiConnect reachable. よむ inspects existing Anki shapes automatically, suggests field mappings for expression, reading, meaning, sentence, audio, and image fields, and mines into that shape when it can infer a fit. If matching is not enough, the cleanest route is to use the よむ note type or adjust mappings before mining.': 'RTK、Core、anime-cardなどの非標準的な日本語デッキをすでに使用している場合は、デスクトップのAnkiConnectに接続できるようにしておきます。よむは既存のAnkiの構成を自動的に検査し、表記、読み、意味、文、音声、画像の各フィールドに対するフィールドマッピングを提案し、適合すると判断した構成にマイニングを行います。マッピングの提案だけでは不十分な場合、最もスマートな方法は、よむのノートタイプを使用するか、マイニングする前にマッピングを調整することです。',
    'If you do not use Anki, leave it off. Jiten or JPDB mining and local dictionary lookup still work without it.': 'Ankiを使用しない場合は、オフのままにしてください。その場合でも、JitenまたはJPDBのマイニングやローカル辞書の検索は機能します。',
    'よむ includes an optional': 'よむには、オプションの',
    '. Use the full address after opening that local or hosted page as a browser home page, new-tab page, or iPad Home Screen shortcut. It uses your accent color and tries Anki study words when AnkiConnect is reachable, then Jiten, then JPDB, then local dictionary words. A new install starts by sending you to Settings > Dictionaries so JMdict or another Yomitan ZIP can be downloaded into local browser storage.': 'が用意されています。このローカルまたはホストされたページをブラウザのホームページ、新規タブページ、またはiPadのホーム画面ショートカットとして開いた後、その完全なアドレスを使用します。設定したアクセントカラーが使用され、AnkiConnectに接続できる場合はAnkiの学習単語を、次いでJiten、JPDB、最後にローカル辞書の単語を試します。新規インストールの場合は、まず「設定 > 辞書」に移動し、JMdictまたは別のYomitanのZIPファイルをローカルのブラウザストレージにダウンロードします。',
    'On the hosted page, the installed よむ userscript can bridge local AnkiConnect requests on the same computer. For phone and tablet setup, follow the Tailscale steps in': 'ホストされたページでは、インストール済みのよむユーザースクリプトが同じPC上のローカルAnkiConnectリクエストの仲介を行えます。スマートフォンやタブレットのセットアップについては、モバイルのよむに localhost を指定するのではなく、',
    'instead of pointing mobile よむ at': 'に記載されているTailscaleの手順に従ってください。',
    'On iPhone, iPad, and Android, this is often the easiest daily-review surface. For full Anki status, updates, automatic deck scanning, and review queues, keep desktop Anki running with AnkiConnect and use a reachable LAN or Tailscale URL in よむ, such as': 'iPhone、iPad、Androidでは、これが最も手軽な日々の復習用画面となることがよくあります。完全なAnkiのステータス取得、更新、自動デッキスキャン、および復習キューの利用には、PCでAnkiとAnkiConnectを起動したままにして、よむの設定で到達可能なLANまたはTailscaleのURLを指定してください。たとえば、',
    '. If AnkiConnect still uses its default': '. もしAnkiConnectがデフォルトの',
    'address, mobile devices cannot reach it because': 'アドレスのままである場合、モバイル端末からはアクセスできません。なぜなら',
    'means "this device." If AnkiConnect or an API source is not available, dictionary-backed words keep the page useful once a dictionary is installed. The step-by-step mobile Anki setup is in': 'は「この端末自体」を意味するからです。AnkiConnectやAPIソースが利用できない場合でも、辞書がインストールされていれば、辞書ベースの単語学習によってこのページを有効活用できます。モバイルAnkiの段階的な設定手順は、',
    'The hosted new-tab page carries a build id and checks for a fresh': 'ホストされた新規タブページにはビルドIDが含まれており、起動時に新しい',
    'on load. If a mobile shortcut keeps showing an older settings screen after a release, open the full new-tab URL in the browser, refresh, then close and reopen the shortcut. The troubleshooting steps in': 'をチェックします。リリース後にモバイルのショートカットが古い設定画面を表示し続ける場合は、ブラウザで新規タブのフルURLを開いて更新し、その後ショートカットを閉じて開き直してください。',
    'cover the heavier reset path.': 'に記載されているトラブルシューティングの手順で、より徹底的なリセット方法を確認できます。',
    'New-tab study using the current app defaults.': '現在のアプリのデフォルト設定を使用した新しいタブでの学習。',
    'The Help tab includes quick links to the hosted tools and docs, GitHub issues, Discord, donation support, and a Factory Reset action that clears よむ settings, API keys, cached data, and imported dictionaries back to defaults.': 'Helpタブには、ホストされているツールやドキュメント、GitHubのIssue、Discord、寄付による支援へのクイックリンク、およびよむの設定、APIキー、キャッシュデータ、インポートした辞書をすべてデフォルト状態に消去する「Factory Reset（工場出荷時設定へのリセット）」操作が含まれています。',
    'Support links live inside settings.': 'サポートリンクは設定画面内にあります。',
    'New to userscripts? You\'re in the right place — this guide assumes you\'ve never installed one.': 'ユーザースクリプトを使うのは初めてですか？ご安心ください。このガイドは、ユーザースクリプトを一度もインストールしたことがない方を前提に説明しています。',
    'is a small add-on that runs inside your browser. You install a free manager once, add よむ to it, and from then on よむ appears on Japanese pages: tap a word for a popup dictionary, save words for review, read manga with OCR, and look up subtitles on video.': 'は、ブラウザ内で動作する小さなアドオンです。無料の管理ツールを一度インストールしてそこによむを追加すると、それ以降よむが日本語ページ上に表示されるようになります。単語をタップしてポップアップ辞書を開く、復習用に単語を保存する、OCRで漫画を読む、動画の字幕を検索するなどの機能が使えます。',
    'install a userscript manager → install よむ → open a Japanese page → tap a word. It\'s free, and you don\'t need an account to start.': 'ユーザースクリプト管理ツールをインストール → よむをインストール → 日本語ページを開く → 単語をタップ。すべて無料で、開始するためのアカウント作成も不要です。',
    'You\'ll meet more later, but these three get you reading:': '後ほどさらに多くの用語が出てきますが、まずはこの3つがあれば読書を始められます：',
    '— the browser add-on that runs よむ. You\'ll install Tampermonkey (computer) or Userscripts (iPhone/iPad).': ' — よむを実行するブラウザ用アドオンです。PCではTampermonkey、iPhone/iPadではUserscriptsをインストールします。',
    '— tapping or hovering a word to open よむ\'s popup.': ' — 単語をタップまたはホバーして、よむのポップアップを開く操作です。',
    '— saving a word, with its sentence, for later review.': ' — あとで復習するために、単語を文脈となる文と一緒に保存することです。',
    'Jiten, JPDB, Anki, OCR, and audio are optional. Turn them on when you want them;': 'Jiten、JPDB、Anki、OCR、音声機能はオプションです。使いたいときに有効化してください。',
    'covers that.': 'でその手順を説明しています。',
    'Step 1: Install a userscript manager': 'ステップ1：ユーザースクリプト管理ツールのインストール',
    'Pick your setup.': '環境に合わせて選択してください。',
    'and install Tampermonkey for your browser from its official store.': 'を開き、お使いのブラウザ用のTampermonkeyを公式ストアからインストールします。',
    'If your browser hides extensions, pin Tampermonkey so its icon is visible.': 'ブラウザで拡張機能のアイコンが非表示になっている場合は、Tampermonkeyをピン留めしてアイコンが表示されるようにしてください。',
    'On Chrome and Edge, you may be asked to': 'ChromeおよびEdgeでは、初回起動時に',
    'the first time. Say yes — よむ can\'t run otherwise.': 'を求められることがあります。許可（はい）を選択してください。そうしないとよむを実行できません。',
    'Use': '代わりに、無料でオープンソースのアプリである',
    ', a free and open-source app. (Tampermonkey for Safari also works if you prefer it.)': 'をご利用ください。（お好みでSafari用のTampermonkeyもお使いいただけます。）',
    'Userscripts from the App Store': 'App StoreからUserscriptsをインストール',
    'and open it once. A mostly-empty screen is normal.': 'して、一度開きます。画面がほとんど空の状態であっても正常です。',
    'Settings → Apps → Safari → Extensions → Userscripts': '設定 → アプリ → Safari → 拡張機能 → Userscripts',
    '. On older iOS, this is': 'を開きます。古いiOSバージョンの場合は、',
    'Settings → Safari → Extensions → Userscripts': '設定 → Safari → 機能拡張 → Userscripts',
    'On': 'Userscriptsを',
    ', then set it to': 'オンにし、次の項目で',
    'Allow': '「許可」',
    'Don\'t skip step 3.': '手順3をスキップしないでください。',
    'If Userscripts isn\'t turned on and allowed, it won\'t show up in Safari, and the next step won\'t work. This is the most common reason an install seems to "do nothing."': 'Userscriptsをオンにして許可しないと、Safariで有効にならず、次のステップが機能しません。これはインストールしても「何も起きない」ように見える最も一般的な原因です。',
    'Step 2: Install よむ': 'ステップ2：よむのインストール',
    'Install the よむ userscript': 'よむユーザースクリプトをインストール',
    'On a computer': 'PCの場合',
    'Click the link above. Tampermonkey opens an install screen for a script called よむ. Click': '上のリンクをクリックします。Tampermonkeyで「よむ」というスクリプトのインストール画面が開くので、',
    '. That\'s it — open a Japanese page and skip to': 'をクリックします。これで完了です。日本語のページを開いて、',
    'To update later, open the same link again and let Tampermonkey replace the old version.': '将来アップデートする場合は、同じリンクをもう一度開いて、Tampermonkeyに古いバージョンを上書きさせてください。',
    'On iPhone or iPad': 'iPhoneまたはiPadの場合',
    'This is the part people get stuck on, so here\'s exactly what happens.': 'ここは多くの人がつまづく部分ですので、何が起きるかを正確に説明します。',
    'Tap the install link.': 'インストールリンクをタップします。',
    'Safari shows a page full of code': 'Safariにコードで埋め尽くされたページが表示されます',
    '— lines like the ones below.': ' — 以下のような行が表示されます。',
    'This is normal. Don\'t close it.': 'これは正常な動作です。閉じないでください。',
    'This page is what Userscripts reads to install よむ.': 'このページは、Userscriptsがよむをインストールするために読み取るコードです。',
    'Open the Userscripts menu from the address bar:': 'アドレスバーからUserscriptsメニューを開きます：',
    'iPhone:': 'iPhoneの場合：',
    'tap': 'アドレスバーの左側にある',
    'on the left of the address bar, then tap': 'をタップし、次に「Userscripts」をタップします。',
    'iPad:': 'iPadの場合：',
    'tap the': 'アドレスバーにある',
    'extensions icon': '拡張機能アイコン',
    '(a puzzle piece) in the address bar, then tap': '（パズルのピースの形）をタップし、次に「Userscripts」をタップします。',
    'Userscripts shows': 'Userscriptsに',
    '"Userscript Detected — Tap to install."': '「Userscript Detected — Tap to install（ユーザースクリプトが検出されました — タップしてインストール）」',
    'Tap it, review the script, and tap': 'と表示されます。それをタップしてスクリプトを確認し、',
    'Open a Japanese page and try': '任意の日本語ページを開いて、',
    'Seeing "Apps, extensions, and user scripts cannot be added from this website"?': '「このWebサイトからアプリ、拡張機能、ユーザースクリプトを追加することはできません」と表示されますか？',
    'That popup comes from Chrome or Edge, not よむ — the browser is blocking Tampermonkey from installing any userscript. Open your browser\'s extensions page (': 'このポップアップはよむではなく、ChromeまたはEdge本体のものです。ブラウザーがTampermonkeyによるユーザースクリプトのインストールをブロックしています。ブラウザーの拡張機能ページ（',
    '), open Tampermonkey\'s details, and turn on': '）を開き、Tampermonkeyの詳細から次の設定をオンにしてください：',
    'Advances new-tab study steps immediately on every Continue studying click, instead of letting the rapid-click guard meant for word navigation swallow quick step advances through kanji doodle, recall, and listen stages.': '\u65b0\u3057\u3044\u30bf\u30d6\u306e\u5b66\u7fd2\u30b9\u30c6\u30c3\u30d7\u3092\u300c\u5b66\u7fd2\u3092\u7d9a\u3051\u308b\u300d\u306e\u30af\u30ea\u30c3\u30af\u3054\u3068\u306b\u5373\u5ea7\u306b\u9032\u3081\u307e\u3059\u3002\u5358\u8a9e\u30ca\u30d3\u30b2\u30fc\u30b7\u30e7\u30f3\u7528\u306e\u9023\u6253\u30ac\u30fc\u30c9\u304c\u3001\u6f22\u5b57\u306a\u305e\u308a\u30fb\u60f3\u8d77\u30fb\u30ea\u30b9\u30cb\u30f3\u30b0\u306e\u7d20\u65e9\u3044\u30b9\u30c6\u30c3\u30d7\u9001\u308a\u3092\u98f2\u307f\u8fbc\u3080\u3053\u3068\u304c\u306a\u304f\u306a\u308a\u307e\u3057\u305f\u3002',
    'Stops the new-tab study fallback from re-querying a local dictionary that the primary source load already found empty, removing repeated dictionary probes on every new-tab render.': '\u65b0\u3057\u3044\u30bf\u30d6\u306e\u5b66\u7fd2\u30d5\u30a9\u30fc\u30eb\u30d0\u30c3\u30af\u304c\u3001\u4e3b\u8981\u30bd\u30fc\u30b9\u306e\u8aad\u307f\u8fbc\u307f\u3067\u7a7a\u3068\u5224\u660e\u6e08\u307f\u306e\u30ed\u30fc\u30ab\u30eb\u8f9e\u66f8\u3078\u518d\u7167\u4f1a\u3057\u306a\u3044\u3088\u3046\u306b\u3057\u307e\u3057\u305f\u3002\u65b0\u3057\u3044\u30bf\u30d6\u3092\u63cf\u753b\u3059\u308b\u305f\u3073\u306b\u8f9e\u66f8\u3092\u7e70\u308a\u8fd4\u3057\u78ba\u8a8d\u3059\u308b\u3053\u3068\u304c\u306a\u304f\u306a\u308a\u307e\u3059\u3002',
    'Cleared the dead-code gate by removing two unused kanji-study facade wrappers left behind by the companion import-severing.': '\u30b3\u30f3\u30d1\u30cb\u30aa\u30f3\u306e\u30a4\u30f3\u30dd\u30fc\u30c8\u5206\u96e2\u3067\u6b8b\u3063\u3066\u3044\u305f\u672a\u4f7f\u7528\u306e\u6f22\u5b57\u5b66\u7fd2\u30d5\u30a1\u30b5\u30fc\u30c9\u30e9\u30c3\u30d1\u30fc2\u4ef6\u3092\u524a\u9664\u3057\u3001\u30c7\u30c3\u30c9\u30b3\u30fc\u30c9\u30c1\u30a7\u30c3\u30af\u3092\u89e3\u6d88\u3057\u307e\u3057\u305f\u3002',
    'Restored the Greasy Fork listing sync. Since 1.4.82 the build stripped the subresource-integrity hashes from the companion': 'Greasy Forkの掲載ページの同期を復旧しました。1.4.82以降、ビルドがコンパニオンの',
    'URLs, so Greasy Fork rejected every new version as "unapproved external script" and the listing stayed pinned to 1.4.78 (whose hashes had since drifted). Companion': 'URLからサブリソース完全性（SRI）ハッシュを取り除いていたため、Greasy Forkは新しいバージョンをすべて「未承認の外部スクリプト」として拒否し、掲載ページは1.4.78（そのハッシュもその後ずれていました）に固定されたままでした。コンパニオンの',
    'URLs are now hashed as the final build step — after the indent-trimming pass that was silently rewriting the companion files post-hashing — and': 'URLのハッシュ付与はビルドの最終ステップで行うようになりました（ハッシュ計算後にコンパニオンファイルを密かに書き換えていたインデント整形パスの後に実行されます）。ビルドがこれらのハッシュを失ったり不一致にしたりした場合は',
    'Added install troubleshooting for the Chrome/Edge "Apps, extensions, and user scripts cannot be added from this website" popup and for userscript managers that download the': 'Chrome/Edgeの「このWebサイトからアプリ、拡張機能、ユーザースクリプトを追加することはできません」ポップアップと、インストール画面を開かずに',
    'file instead of opening an install screen.': 'ファイルをダウンロードしてしまうユーザースクリプトマネージャーについて、インストールのトラブルシューティングを追加しました。',
    'fails if a build ever drops or mismatches those hashes.': 'が失敗するようになりました。',
    'Allow User Scripts': 'Allow User Scripts（ユーザースクリプトを許可）',
    '(on older browsers, turn on': '（古いブラウザーでは代わりに拡張機能ページ上部の',
    'Developer mode': 'Developer mode（デベロッパーモード）',
    'at the top of the extensions page instead). Then open the install link again.': 'をオンにしてください）。そのあと、もう一度インストールリンクを開いてください。',
    'Clicking the link downloads a': 'リンクをクリックすると',
    'file instead of opening an install screen?': 'ファイルがダウンロードされ、インストール画面が開きませんか？',
    'Your userscript manager didn\'t intercept the download — some managers (for example ScriptCat) miss it. Open the manager\'s dashboard and use its': 'ユーザースクリプトマネージャーがダウンロードを検出できていません（ScriptCatなど一部のマネージャーで発生します）。マネージャーのダッシュボードを開き、',
    'Install from URL': 'Install from URL（URLからインストール）',
    '/ import option with': '／インポート機能に次のURLを指定してください：',
    '. You can delete the downloaded file.': '。ダウンロードされたファイルは削除して構いません。',
    '"Userscripts" isn\'t in the AA or extensions menu?': '「Userscripts」がAAや拡張機能メニューに表示されませんか？',
    'It isn\'t turned on yet. Go back to Step 1, enable Userscripts, and allow it on All Websites. Then reload the code page and open the menu again.': 'まだオンになっていません。ステップ1に戻り、Userscriptsを有効にして「すべてのWebサイト」で許可してください。その後、コードのページを再読み込みして、再度メニューを開いてください。',
    'You\'ll know it worked': 'インストールが成功すると',
    'when a small floating よむ button appears in the corner of Japanese pages — and the first time, よむ greets you with a welcome screen.': '、日本語ページの隅に小さなフローティング「よむ」ボタンが表示されます。また、初回起動時には歓迎画面が表示されます。',
    'Step 3: Your first lookup': 'ステップ3：最初の検索',
    'The first time よむ runs, it shows a short': 'よむが初めて起動したときは、短い',
    'with two buttons:': 'が2つのボタンと共に表示されます：',
    '— start reading right now. よむ looks words up using free public data, with no account needed.': ' — すぐに読書を開始します。アカウント不要で、無料の公開データを使用して単語を検索します。',
    '— connect a Jiten or JPDB account for word tracking and mining. Optional, and you can do it later (': ' — 単語の追跡やマイニングのためにJitenまたはJPDBアカウントを連携します。これはオプションであり、後から行うこともできます（',
    'Choose': '「',
    ', then try a lookup:': '」を選択し、検索を試してみましょう：',
    'Open a Japanese page.': '1. 日本語のページを開きます。',
    'is a gentle first stop — or use the sample line below, right here on this page.': 'は、初心者向けの最初のステップとして最適です。または、このページの下部にあるサンプル行を使用してください。',
    'a word (phone or tablet) or': '単語をタップ（スマートフォンやタブレットの場合）するか、',
    'it (computer).': '（PCの場合）します。',
    'The popup opens with the reading, meaning, and a speaker button. Tap a kanji to see stroke order; tap a mining button to save the word.': 'ポップアップが開き、読み仮名、意味、スピーカーボタンが表示されます。漢字をタップすると書き順が表示され、マイニングボタンをタップすると単語が保存されます。',
    'Try me — tap a word': '試してみる — 単語をタップしてください',
    '青空の下で、静かに本を読む。': '青空の下で、静かに本を読む。',
    'That\'s the whole loop: see a word, understand it, keep reading. Everything below is optional.': '「単語を見て、意味を理解し、読書を続ける」という一連の流れは以上です。これより下の内容はすべてオプションです。',
    'Add Jiten/JPDB (optional)': 'Jiten/JPDBの追加（オプション）',
    'Jiten/JPDB are study services. With either one, よむ shows whether you already know a word, colors words by status, and lets you mine straight into that source. Local dictionary lookup works fine without them, but Jiten/JPDB are the easiest way to track progress.': 'Jiten/JPDBは学習サービスです。どちらかを連携すると、すでに対象語を知っているかどうかの確認、ステータスに応じた単語の色分け、そのソースへの直接マイニングが可能になります。ローカル辞書での検索は連携なしでも問題なく動作しますが、進捗を追跡するにはJiten/JPDBが最も簡単な方法です。',
    'your JPDB settings': 'JPDBの設定画面',
    'and copy your key from the': 'を開き、',
    'section.': 'セクションからキーをコピーします。',
    'In よむ, open settings: tap the floating よむ button, or press': 'よむで設定を開きます：フローティング「よむ」ボタンをタップするか、PCで',
    'on a computer.': 'を押します。',
    'Paste the key into the': 'API key欄にキーを',
    'field and save.': '貼り付けたら保存します。',
    'You can also study from imported dictionaries instead — see Settings → Dictionaries. Source-specific actions like mining still need that source\'s key.': '代わりに、インポートした辞書から学習することもできます。「Settings → Dictionaries（設定 → 辞書）」を参照してください。マイニングなど、ソース固有のアクションには引き続きそのソースのキーが必要です。',
    'Open よむ settings (floating button or': 'よむの設定（フローティングボタンまたは',
    ') to switch these on when you want them. Each is covered in': '）を開き、必要に応じてこれらのツールをオンにします。それぞれの機能の詳細は',
    '— import any Yomitan ZIP dictionary, or download JMdict for offline definitions. Settings → Dictionaries.': ' — Yomitanの辞書ZIPファイルをインポートするか、JMdictをダウンロードしてオフライン定義を使用します。「Settings → Dictionaries（設定 → 辞書）」。',
    '— tap Japanese text inside manga panels and screenshots. Settings → Images.': ' — 漫画のコマやスクリーンショット内の日本語テキストをタップします。「Settings → Images（設定 → 画像）」。',
    '— make Japanese subtitle lines tappable, with a transcript panel. For local files, use the': ' — 日本語の字幕行をタップ可能にし、トランスクリプトパネルを表示します。ローカルファイルの場合は、',
    '— turn lookups into flashcards. Desktop': ' — 検索した言葉を暗記カードに変換します。PC用の',
    'is the full setup; phones and tablets can reach a desktop Anki over Wi-Fi or Tailscale, or hand off new notes to AnkiMobile/AnkiDroid.': 'を使用するのが完全なセットアップ方法です。スマートフォンやタブレットは、Wi-FiまたはTailscaleを介してPC上のAnkiに接続するか、AnkiMobile/AnkiDroidに新しいノートを送信できます。',
    '— the easiest option is': ' — 最も簡単な設定方法は',
    '. To self-host instead, see': 'を使用することです。自分で配信（セルフホスト）する場合は、',
    '— open the': ' — ',
    'for daily review.': 'を開いて日々の復習を行います。',
    'Good よむ sites have selectable Japanese text, or images and subtitles that よむ can make readable. The aim isn\'t to finish the hardest thing you can find — it\'s to read a little every day where most of it makes sense and the new words are worth saving.': 'よむに適したサイトは、選択可能な日本語テキストがあるか、画像や字幕をよむで読めるようにできるサイトです。目的は、見つけた中で最も難しいものを読み切ることではなく、ほとんどの内容が理解でき、未知語を保存する価値がある素材を毎日少しずつ読むことです。',
    'These are reliable starting points, ordered roughly from easiest to hardest:': 'これらは、難易度の低い順から並べたおすすめの出発点です：',
    'Free graded readers from the very beginning. The best first stop when native sites still feel too dense.': '入門レベルから読める無料のgraded readersです。ネイティブ向けサイトがまだ難しすぎると感じるときの最初のステップに最適です。',
    'Short, simplified news with furigana and audio. A great daily habit once basic grammar clicks.': 'ふりがなと音声が付いた、短く簡略化されたニュースです。基本文法を理解した後の日課作りに最適です。',
    'Polished learner stories with notes and audio. よむ adds your usual Jiten, JPDB, Anki, and Yomitan flow on top.': '注釈と音声が付いた、洗練された学習者向けストーリーです。よむを重ねることで、いつものJiten、JPDB、Anki、Yomitanフローも利用できます。',
    'Short articles sorted by rough JLPT level. A useful bridge from graded readers to native articles.': '大まかなJLPTレベル別に分類された短い記事です。graded readersからネイティブ向け記事への橋渡しに役立ちます。',
    'A big collection of folk tales. The repetition makes it friendly for mining common words.': '民話や童話の大きなコレクションです。繰り返しが多く、よく使われる単語のマイニングに向いています。',
    'Read Japanese EPUBs in the browser with よむ lookup — the clean route into light novels and books.': 'ブラウザで日本語EPUBを読み、よむ検索を使用します。ライトノベルや一般書籍へ進むためのスマートなルートです。',
    'Find books and manga graded by difficulty, so your next read is a challenge but not a wall.': '難易度別に書籍や漫画を探せます。次に読むものを、つらすぎず挑戦的なレベルにできます。',
    'Native web novels with selectable text. Search for a genre you already love.': 'テキストを選択できる、ネイティブ向けWeb小説です。好きなジャンルを探してみてください。',
    'Turn on subtitle lookup and the transcript panel for listening-plus-reading immersion.': '字幕の検索とトランスクリプトパネルを有効化して、リスニングとリーディングを組み合わせた没入学習を行いましょう。',
    'For more, skim these community threads:': '詳細については、以下のコミュニティスレッドを参照してください：',
    'Using よむ on a phone or tablet': 'スマートフォンやタブレットでのよむの利用',
    'Most of よむ works the same on mobile: lookup, local dictionaries, Jiten/JPDB, OCR, subtitle taps, the': 'よむのほとんどの機能（ルックアップ、ローカル辞書、Jiten/JPDB、OCR、字幕タップ、',
    'desktop helpers': 'PC用の補助機能（desktop helpers）',
    '. Anything that runs on your computer — AnkiConnect, a self-hosted audio server, a local OCR app — has to be reachable over the network. On a phone,': 'の扱いです。PC上で実行するツール（AnkiConnect、セルフホストの音声サーバー、ローカルOCRアプリなど）は、ネットワーク経由で到達可能でなければなりません。スマートフォンにおいて、',
    'means': 'は',
    'the phone': 'スマートフォン自体',
    ', not your computer, so you point よむ at your computer\'s LAN or Tailscale address instead. The easy mobile paths (public lookup, imported dictionaries, hosted audio, the study page) don\'t need any of that.': 'を指し、PCではありません。そのため、よむの設定でPCのLANまたはTailscaleのアドレスを指定します。シンプルなモバイル利用（公開検索、インポート辞書、ホストされた音声、学習ページ）では、これらは一切不要です。',
    'Use desktop Anki from a phone, iPad, or Android': 'スマートフォン、iPad、またはAndroidからデスクトップ版Ankiを使用する',
    'You don\'t need AnkiMobile or AnkiDroid for full Anki status on mobile. The full setup keeps Anki open on your computer and lets your phone talk to it. Your phone is just the reading screen; desktop AnkiConnect still handles existing-card status, note updates, media, deck scans, and review queues.': 'モバイルで完全なAnkiステータスを利用するために、AnkiMobileやAnkiDroidを導入する必要はありません。完全なセットアップでは、PC上でAnkiを開いたままにし、スマートフォンをそこに接続させます。スマートフォンは単なる読書画面であり、デスクトップのAnkiConnectが既存カード状態のチェック、ノートの更新、メディアの追加、デッキのスキャン、復習キューの管理を引き続き担当します。',
    'The easiest private route is': '最も簡単なプライベート接続の方法は',
    ': it gives your own devices a private address so they can see each other, even away from home. You do not need router setup, port forwarding, or a command line. Install it on the computer that runs Anki and on the phone or tablet that runs よむ.': 'です。これにより、お使いの端末同士が外出先からでも安全に相互接続できるプライベートアドレスが割り当てられます。ルーターの設定、ポート開放、コマンドライン操作などは不要です。Ankiを実行するPCと、よむを実行するスマートフォンやタブレットの双方にインストールしてください。',
    'Below, replace every': '以下では、すべての',
    'with your computer\'s Tailscale address. It usually starts with': 'をお使いのPCのTailscaleアドレスに置き換えてください。通常、アドレスは',
    '. You can also use the Tailscale device name if MagicDNS is enabled, such as': 'から始まります。MagicDNSが有効な場合は、Tailscaleのデバイス名（例：',
    'On your computer, install Anki and the': '1. PCにAnkiと',
    'on the computer, sign in, and copy the computer\'s Tailscale address.': 'をインストールしてサインインし、PCのTailscaleアドレスをコピーします。',
    'Install Tailscale on the phone or tablet and sign in to the': '3. スマートフォンやタブレットにもTailscaleをインストールし、',
    'same': '同じ',
    'account.': 'アカウントでサインインします。',
    'On the computer, open Anki and choose': '4. PCでAnkiを開き、',
    'Find the': '5. 「',
    'line. Replace': '」の行を見つけます。',
    'with your computer\'s Tailscale address, for example': 'をお使いのPCのTailscaleアドレス（例：',
    'Leave': '6. 「',
    'as': '」の値は',
    'If AnkiConnect has an allowed-origins list, keep the existing entries and add': '7. AnkiConnectに「allowed-origins」リストがある場合は、既存のエントリを保持したまま、',
    '. This helps the hosted study page talk to your own Anki.': 'を追加します。これにより、ホストされた学習ページが独自のAnkiと通信できるようになります。',
    'Save, restart Anki, and leave Anki open on the computer.': '8. 保存してAnkiを再起動し、PCでAnkiを開いた状態にします。',
    'On the phone, make sure Tailscale says it is connected. Open': '9. スマートフォンでTailscaleが接続中であることを確認し、ブラウザで',
    'in the mobile browser. A short AnkiConnect message means the phone can reach your computer.': 'を開きます。短いAnkiConnectのメッセージが表示されれば、スマートフォンからPCにアクセスできています。',
    'In よむ settings → Mining, set': '10. よむの設定 → Mining（マイニング）で、',
    'to the same address, such as': 'を同じアドレス（例：',
    'or': 'または',
    'Press': '11. 「',
    '. On success, よむ can read your decks and note types, show existing-card status, update cards, and pull Anki reviews into the study page.': '」を押します。成功すると、よむはデッキとノートタイプを読み込み、既存カード状態の表示、カードの更新、暗記カードの復習キューを学習ページへ取得できるようになります。',
    'If': 'もし',
    'does not work:': 'が機能しない場合：',
    'Make sure Anki is open on the computer. AnkiConnect only answers while Anki is running.': '・PCでAnkiが開いているか確認してください。AnkiConnectはAnkiが起動している間のみ応答します。',
    'Make sure both devices are signed in to the same Tailscale account.': '・双方のデバイスが同じTailscaleアカウントにサインインしているか確認してください。',
    'Try the': '・MagicDNS名の代わりに',
    'address instead of the MagicDNS name.': 'のアドレスを試してください。',
    'Reopen the AnkiConnect config and check that': '・AnkiConnectの設定を再度開き、',
    'is not still': 'がまだ',
    '. A phone cannot reach your computer through': 'のままになっていないか確認してください。スマートフォンから',
    'If the mobile browser cannot open': '・モバイルのブラウザで',
    ', よむ will not be able to reach it either. Check Tailscale, firewall prompts, and whether Anki was restarted after the config change.': 'を開けない場合、よむもそれにアクセスできません。Tailscaleの状態、ファイアウォールの警告、および設定変更後にAnkiが再起動されたかを確認してください。',
    'If the hosted study page works on desktop but not mobile, check that the allowed-origins list includes': '・ホストされた学習ページがデスクトップでは動作するがモバイルでは動作しない場合、「allowed-origins」リストに',
    'Don\'t put AnkiConnect on the public internet or forward port': 'AnkiConnectを公開インターネットにさらしたり、ルーターでポート',
    'on your router. Use Tailscale or a trusted home Wi-Fi address instead.': 'を転送したりしないでください。代わりにTailscaleや信頼できる自宅のWi-Fiアドレスを使用してください。',
    'If you\'d rather not run desktop Anki, よむ can hand a new note to': 'デスクトップ用のAnkiを実行したくない場合は、よむから新しいノートを',
    '. Mobile Anki handoff is one-way: it only starts a new note. It cannot scan existing decks, show existing-card status, update old notes, or provide review queues — those need desktop AnkiConnect. Leave': 'に引き渡すことができます。モバイルハンドオフは一方向の連携であり、新規ノートの作成のみを行います。既存のデッキのスキャン、既存カードのステータス表示、古いノートの更新、復習キューの管理などは行えません（これらにはデスクトップのAnkiConnectが必要です）。',
    'on or off as you like; it only controls this fallback path.': '設定のオン/オフはお好みで決定してください。これはフォールバック経路のみを制御します。',
    'Once you\'re set up, open': '設定が完了したら、',
    '. That saves a small backup file you can import into another browser later.': 'を実行します。これにより、後で別のブラウザにインポートできる小さなバックアップファイルが保存されます。',
    '— make sure your userscript manager is enabled for that site, then refresh.': ' — ユーザースクリプト管理ツールがそのサイトで有効になっているか確認し、ページを更新します。',
    '— refresh the page after saving.': ' — 保存後にページを更新してください。',
    '— recheck that the API key was pasted correctly, with no extra spaces.': ' — APIキーが余分なスペースなしで正しく貼り付けられているか再確認してください。',
    '— keep Anki open on the computer, keep Tailscale connected on both devices, and use your computer\'s Tailscale URL in よむ.': ' — PCでAnkiを開いた状態にし、双方のデバイスでTailscaleを接続したままにし、よむの設定でPCのTailscaleのURLを使用してください。',
    'on a phone mean the phone itself, not your computer.': 'をスマートフォンで使用するとPCではなくスマートフォン自体を指すことになります。',
    '— if you are using the hosted study page, use the Tailscale URL, not': ' — ホストされた学習ページを使用している場合は、',
    '. Also make sure the AnkiConnect allowed-origins list includes': 'ではなくTailscaleのURLを使用してください。また、AnkiConnectの「allowed-origins」リストに',
    'If the hosted study page or a Home Screen shortcut still looks like an old version after an update, open': 'アップデート後にホストされた学習ページやホーム画面のショートカットが古いバージョンのままに見える場合は、',
    'directly, refresh once, then close and reopen the tab or shortcut. よむ checks a small': 'を直接開き、一度リフレッシュ（再読み込み）した後に、タブまたはショートカットを閉じて開き直してください。よむは小さな',
    'and reloads when the build changes, but mobile caches sometimes hold an old copy until the page is reopened. If it\'s still stale, remove and re-add the shortcut, or clear site data for': 'をチェックし、ビルドが変更されたときに自動再読み込みを行いますが、モバイルのキャッシュはページを開き直すまで古いコピーを保持し続けることがあります。それでも古い状態のままであれば、ショートカットを削除して再作成するか、',
    'If the install link or hosted tools are down, check': 'インストールリンクやホストツールが停止している場合は、',
    'for reinstall, Discord, and bug-report options.': 'で再インストール、Discord、問題報告の選択肢を確認してください。',
    // Remaining Documentation Translations
    'A': '',
    'userscript': 'ユーザースクリプト',
    'The whole setup, in one line:': 'セットアップ全体を1行で書くと：',
    'Three words to know': '知っておくべき3つの言葉',
    'Userscript manager': 'ユーザースクリプト管理ツール',
    'Turn on more tools': '追加ツールの有効化',
    'Chrome, Edge, or Firefox (computer)': 'Chrome、Edge、またはFirefox（PC）',
    'tampermonkey.net': 'tampermonkey.net',
    'allow user scripts': 'ユーザースクリプトの許可',
    'your first lookup': '最初の検索',
    'AA': 'AA',
    'welcome screen': '歓迎画面',
    'Use without API key': 'APIキーなしで使用',
    'Pick this one to begin.': 'まずはこちらから始めてください。',
    'Add API key': 'APIキーを追加',
    'Add Jiten/JPDB': 'Jiten/JPDBを追加',
    'hover': 'ホバー',
    'JPDB': 'JPDB',
    'API': 'API',
    'API key': 'APIキー',
    'Dictionaries': '辞書',
    'Images (OCR)': '画像（OCR）',
    'Video subtitles': '動画字幕',
    'video player': '動画プレイヤー',
    'Anki': 'Anki',
    'Audio': '音声',
    'Study page': '学習ページ',
    'new-tab study app': '新規タブ学習アプリ',
    'What to read': '何を読むか',
    'YouTube': 'YouTube',
    'Tadoku graded readers': 'Tadokuの多読向け書籍（graded readers）',
    ', and': '、そして',
    ', and the': '、そして',
    'study page': '学習ページ',
    '. Tapping is the main gesture, since touch screens have no hover. The floating よむ button stays reachable so you can always open settings.': '。タッチスクリーンにはホバー操作がないため、タップが主なジェスチャーになります。フローティングの「よむ」ボタンは常に表示されるため、いつでも設定を開くことができます。',
    'The one thing that\'s different is': '唯一異なるのは、',
    'AnkiConnect add-on': 'AnkiConnectアドオン',
    'Tools → Add-ons → AnkiConnect → Config': 'ツール → アドオン → AnkiConnect → 設定',
    'AnkiConnect URL': 'AnkiConnectのURL',
    'Check AnkiConnect': 'AnkiConnectの接続確認',
    'Mobile handoff (new notes only)': 'モバイルハンドオフ（新規ノートのみ）',
    'Mobile Anki add-note fallback': 'モバイルAnki新規ノート追加フォールバック',
    'Back up your settings': '設定のバックアップ',
    'Settings → Dictionaries → Export settings JSON': 'Settings → Dictionaries → Export settings JSON（設定 → 辞書 → 設定JSONをエクスポート）',
    'If something does not work': 'うまく動かない場合',
    'The usual fixes:': 'よくある解決策：',
    'Nothing appears on a page': 'ページ上に何も表示されない',
    'Settings changes don\'t take effect': '設定の変更が反映されない',
    'Jiten/JPDB features are missing': 'Jiten/JPDB機能が表示されない',
    'AnkiConnect is unreachable on mobile': 'モバイルからAnkiConnectに接続できない',
    'and': 'および',
    'Hosted AnkiConnect checks fail': 'ホスト版のAnkiConnectチェックが失敗する',
    'the new-tab page': '新規タブページ',
    'and sign in again.': 'を開き、再度サインインしてください。',
    'よむ': 'よむ',
    'Tap a word': '単語をタップ',
    ', the classic idea of': '、古典的な考え方である',
    ', and Tadoku\'s practical reading rules for Japanese learners at': '、そして日本語学習者向けのTadokuの実践的な読書ルール（',
    'tadoku.org': 'tadoku.org',
    '青空の下で本を読む': '青空の下で本を読む',
    '今日は静かな喫茶店で新しい本を読みました。': '今日は静かな喫茶店で新しい本を読みました。',
    'gives you a personal audio URL after you subscribe through Patreon and authenticate. That URL already works with よむ, so you do not need to download audio files or run anything on your computer.': 'Patreonを通じて購読し認証すると、個人用の音声URLが提供されます。そのURLはすでによむで機能するため、音声ファイルをダウンロードしたり、コンピューターで何かを実行したりする必要はありません。',
    'Add it to よむ:': 'よむに追加する：',
    'Open よむ settings with the floating よむ button or': 'フローティングの「よむ」ボタンでよむの設定を開くか、',
    'Go to Audio.': '「Audio」に移動します。',
    'Press Add audio source.': '「Add audio source」を押します。',
    'Set Type to Custom URL.': '「Type」を「Custom URL」に設定します。',
    'Paste the personal URL you were given.': '提供された個人用URLを貼り付けます。',
    'Save, look up a word, and press the speaker button.': '保存し、単語を検索してスピーカーボタンを押します。',
    'Local audio means よむ asks a helper app on your computer for the sound file.': 'ローカル音声とは、よむが音声ファイルをコンピューター上の補助アプリに要求することを意味します。',
    'You need:': '必要なもの：',
    'A computer that stays awake while you study.': '学習中にスリープ状態にならないコンピューター。',
    'The audio files.': '音声ファイル。',
    'The local audio server download.': 'ダウンロードしたローカル音声サーバー。',
    'The server download is here:': 'サーバーのダウンロードはこちら：',
    'Yomichan/Yomitan Audio Server releases': 'Yomichan/Yomitan Audio Serverのリリース',
    'Do not use the green Code button on GitHub. That downloads developer source code. Normal users want the latest file from the Releases page.': 'GitHub of 緑色の「Code」ボタンは使用しないでください。これは開発者用のソースコードをダウンロードしてしまいます。一般のユーザーはリリースページから最新のファイルをダウンロードしてください。',
    'Open the release page and download the file that matches your computer:': 'リリースページを開き、お使いのコンピューターに適合するファイルをダウンロードします：',
    'Computer': 'コンピューター',
    'File to download': 'ダウンロードするファイル',
    'the file ending in': '末尾が以下のファイル',
    'Intel Mac': 'Intel Mac',
    'Apple Silicon Mac': 'Apple Silicon Mac',
    'Unzip or open the download. Put the extracted folder somewhere easy to find, such as your Desktop, and rename it to': 'ダウンロードしたファイルを解凍するか開きます。抽出されたフォルダーをデスクトップなどの見つけやすい場所に置き、名前を以下に変更します：',
    'Inside that folder you should see a server file named either:': 'そのフォルダー内に、以下のいずれかの名前のサーバーファイルが表示されるはずです：',
    'or, on Windows:': 'または、Windowsの場合：',
    'Download the audio files:': '音声ファイルをダウンロードします：',
    'nyaa.si/view/1957972': 'nyaa.si/view/1957972',
    'Create a folder named': '以下の名前のフォルダーを作成します：',
    'inside your': '作成先：',
    'folder. Put the downloaded audio source folders inside it.': 'フォルダー。その中にダウンロードした音声ソースのフォルダーを配置します。',
    'The folder should look like this:': 'フォルダー構造は以下のようになります：',
    'On Windows, the server file will usually be': 'Windowsの場合、サーバーファイルは通常以下のものになります：',
    'Keep the audio folder names the same. For example, do not rename': '音声フォルダー名は変更しないでください。たとえば、以下のように名前を変更してはいけません：',
    'The server must stay open while you use local audio. If you close the Terminal or PowerShell window, local audio stops until you start it again.': 'ローカル音声を使用している間は、サーバーを開いたままにする必要があります。ターミナルやPowerShellウィンドウを閉じると、再度起動するまでローカル音声は停止します。',
    'Use port': 'ポート番号',
    '. That avoids a common conflict with other local apps.': 'を使用します。これにより、他のローカルアプリとの競合を避けることができます。',
    'Open the': '開く：',
    'folder in File Explorer.': 'フォルダー（エクスプローラー内）。',
    'Right-click an empty space in the folder.': 'フォルダー内の空いているスペースを右クリックします。',
    'Choose Open in Terminal or Open PowerShell window here.': '「ターミナルで開く」または「PowerShell ウィンドウをここで開く」を選択します。',
    'Paste this command and press Enter:': 'このコマンドを貼り付けてEnterキーを押します：',
    'macOS or Linux': 'macOSまたはLinux',
    'Open Terminal.': 'ターミナルを開きます。',
    'Type': '以下を入力します：',
    ', including the space after': '（最後のスペースも含みます）',
    'Drag your': 'ドラッグします：',
    'folder into Terminal.': 'フォルダー（ターミナルウィンドウ内）。',
    'Press Enter.': 'Enterキーを押します。',
    'Paste these commands and press Enter:': '以下のコマンドを貼り付けてEnterキーを押します：',
    'If macOS blocks the app, open System Settings > Privacy & Security and allow it, or Control-click the server file in Finder and choose Open.': 'macOSがアプリをブロックした場合は、「システム設定 > プライバシーとセキュリティ」を開いて許可するか、FinderでサーバーファイルをControlキーを押しながらクリックし、「開く」を選択してください。',
    'Leave the server window open. Open this test link in your browser:': 'サーバーのウィンドウを開いたままにし、ブラウザでこのテスト用リンクを開きます：',
    'If it works, you will see text containing': '正常に動作する場合、以下を含むテキストが表示されます：',
    'If the browser says the page cannot be reached, the server is not running, the window was closed, or the command used a different port.': 'ブラウザに「このページにアクセスできません」と表示される場合、サーバーが実行されていないか、ウィンドウが閉じられたか、コマンドで異なるポートが使用されています。',
    'Open a page where よむ is running.': 'よむが実行されているページを開きます。',
    'Open settings with the floating よむ button or': 'フローティングの「よむ」ボタンで設定を開くか、',
    'Open Audio.': '「Audio（音声）」を開きます。',
    'Turn on Enable audio playback for terms.': '「Enable audio playback for terms（用語の音声再生を有効にする）」をオンにします。',
    'Paste this exact URL:': '以下のURLを正確に貼り付けます：',
    'Move the local audio source above the built-in sources if you want local audio tried first.': 'ローカル音声を優先して試したい場合は、ビルトインの音声ソースより上にローカル音声ソースを移動します。',
    'Save settings.': '設定を保存します。',
    'exactly as written. よむ replaces those placeholders for each word you look up.': 'を記述通りに指定します。よむは、検索する単語ごとにこれらのプレースホルダーを置き換えます。',
    'Jiten/JPDB and browser text-to-speech rows are fallback-only by default, so': 'Jiten/JPDBとブラウザの音声合成（TTS）はデフォルトでフォールバック専用となっているため、',
    'Shuffle audio': '音声をシャッフル',
    'still prefers recorded clips first. Shuffle mode behaves like a shuffled deck: よむ tries every available candidate for a word before reshuffling, instead of independently picking a random clip each time. In Settings > Audio, change': 'は録音されたクリップを引き続き優先します。シャッフルモードはシャッフルされたデッキのように機能します。よむは、毎回個別にランダムなクリップを選択するのではなく、再シャッフルする前に単語に対して利用可能なすべての候補を試します。「Settings > Audio」で、',
    'Text-to-speech handling': '音声合成（TTS）の処理',
    'to': 'を',
    'Follow source order / shuffle': 'ソース順に従う / シャッフル',
    'if you want TTS rows to follow your source order or shuffled audio setting.': 'に変更すると、TTSの行をソース順やシャッフル音声の設定に従わせることができます。',
    'means "this device."': 'は「このデバイス」を意味します。',
    'That means:': 'つまり：',
    'On your computer,': 'お使いのコンピューター上では、',
    'means the computer running the audio server.': 'は音声サーバーを実行しているコンピューターを指します。',
    'On your iPad,': 'お使いのiPad上では、',
    'means the iPad, not your computer.': 'はコンピューターではなくiPad自身を指します。',
    'To use your computer\'s audio server from an iPad, phone, or second computer, use': 'iPad、スマートフォン、または2台目のコンピューターからお使いのコンピューターの音声サーバーを使用するには、以下を使用します：',
    'Basic setup:': '基本的なセットアップ：',
    'Install Tailscale on the computer running the audio server.': '音声サーバーを実行しているコンピューターにTailscaleをインストールします。',
    'Install Tailscale on the iPad, phone, or other computer.': 'iPad、スマートフォン、またはその他のコンピューターにTailscaleをインストールします。',
    'Sign in with the same Tailscale account on every device.': 'すべてのデバイスで同じTailscaleアカウントを使用してサインインします。',
    'Keep Tailscale connected.': 'Tailscaleを接続状態に保ちます。',
    'Leave the audio-server computer awake.': '音声サーバーを起動しているコンピューターのスリープを解除したままにします。',
    'On the computer running the audio server, run:': '音声サーバーを実行しているコンピューターで、以下を実行します：',
    'prints a private Tailscale URL that looks like this:': '以下のようなプライベートTailscale URLが出力されます：',
    'Use that URL in よむ on the other device:': '他のデバイスのよむでそのURLを使用します：',
    'Tailscale Serve keeps the server private to your own Tailscale account. You do not need Tailscale Funnel.': 'Tailscale Serveは、サーバーをご自身のTailscaleアカウント内でのみ非公開に保ちます。Tailscale Funnelは不要です。',
    'Make sure the server window is still open.': 'サーバーのウィンドウが開いたままであることを確認してください。',
    'Make sure the URL in よむ uses': 'よむで指定するURLに以下が使用されていることを確認してください：',
    'Make sure the audio folders are inside': '音声フォルダーが以下の中にあることを確認してください：',
    'Make sure the audio folder names were not changed.': '音声フォルダー名が変更されていないことを確認してください。',
    'If the browser test does not load, start the server again.': 'ブラウザのテスト用リンクがロードされない場合は、サーバーを再起動してください。',
    'If iPad playback fails, use the Tailscale URL, not': 'iPadでの再生が失敗する場合は、以下ではなくTailscale URLを使用してください：',
    'If this setup feels like too much, use the hosted audio option at the top of this page. It is much easier.': 'このセットアップが難しく感じられる場合は、このページの上部にあるホスト版の音声オプションを使用してください。そちらの方がはるかに簡単です。',
    'Open local browser-supported video and subtitle files in the player.': 'ブラウザがサポートするローカル動画および字幕ファイルをプレイヤーで開きます。',
    'Open PDFs in the hosted reader and use よむ lookup, mining, and OCR where supported.': 'ホスト版PDFリーダーでPDFを開き、対応している場所ではよむの検索、マイニング、OCRを使えます。',
    'Return to the main documentation hub for setup, features, and changelog pages.': 'セットアップ、機能、変更履歴ページのためにメインのドキュメントハブに戻ります。',
    'currently advertise paid plans from $10/month; よむ offers the same core reading-and-mining workflow for free.': 'などは現在月額10ドルからの有料プランを宣伝していますが、よむは同様の核となる読書およびマイニングのワークフローを無料で提供します。',
    'Donations are optional. They help cover the time, testing devices, services, maintenance, and AI tokens that keep the reader polished. Realistically, I have already spent far more on AI/API tokens building よむ than donations are ever likely to make back, but even a small donation helps soften that cost. On a personal level, my dream is to save enough money to move to Japan and marry my long-distance Japanese girlfriend. Every bit of support helps bring that future closer and encourages me to keep maintaining よむ, fixing bugs, and adding the features learners ask for.': '寄付は任意です。寄付は、リーダーの磨き込みを維持するための時間、テスト端末、サービス、メンテナンス、およびAIトークンの費用を賄うのに役立ちます。現実的には、よむの開発でAI/APIトークンに費やした額は、寄付で回収できる見込みの額をはるかに上回っていますが、少額の寄付でもその負担を和らげることができます。個人的には、十分なお金を貯めて日本に移住し、遠距離恋愛中の日本人彼女と結婚するのが私の夢です。皆様からのご支援のすべてが、その未来を引き寄せ、よむのメンテナンス継続、バグ修正、および学習者が求める機能の追加への励みになります。',
    'Service Budget': 'サービス予算',
    'Look up a word and press the speaker button.': '単語を検索してスピーカーボタンを押します。',
    'よむ - Free Japanese popup dictionary & immersion reader': 'よむ - 無料の日本語ポップアップ辞書・没入リーダー',
    'よむ - Free Japanese popup reader': 'よむ - 無料の日本語ポップアップリーダー',
    'よむ is a free Japanese reader for web pages, manga, PDFs, and video subtitles. Tap any word for readings, meanings, kanji, audio, and study actions.': 'よむはWebページ、漫画、PDF、動画字幕向けの無料日本語リーダーです。単語をタップすると、読み、意味、漢字、音声、学習操作を確認できます。',
    'よむ app icon': 'よむのアプリアイコン',
    'よむ app icon and Japanese reader preview card': 'よむのアプリアイコンと日本語リーダーのプレビューカード',
    'よむ demo: reading a Japanese novel on an iPhone and tapping a word to open the dictionary popup': 'よむのデモ: iPhoneで日本語小説を読み、単語をタップして辞書ポップアップを開く',
    'Tap a word, keep reading': '単語をタップして、読み続ける',
    'Tap the text inside a manga page': '漫画ページ内の文字をタップ',
    'Everything よむ does — popup dictionary lookup and mining, Yomitan dictionaries, audio and example sentences, kanji drilldown with stroke order, manga and image OCR, video subtitle mining, a YouTube immersion filter, Anki export, and a study new-tab page.': 'よむでできることの一覧です。ポップアップ辞書検索とマイニング、Yomitan辞書、音声と例文、書き順付き漢字ドリルダウン、漫画・画像OCR、動画字幕マイニング、YouTube没入フィルター、Anki書き出し、新しいタブの学習ページを含みます。',
    'よむ runs one loop: find Japanese in the wild, understand it quickly, and save the useful bits for study.': 'よむの流れは1つだけです。実際の日本語を見つけ、すばやく理解し、役に立つ部分を学習用に保存します。',
    'To let the official jpdb reader, Jiten Reader, or Yomitan own popups, turn off': '公式JPDBリーダー、Jiten Reader、Yomitanにポップアップを任せたい場合は、',
    'Reader -> Show Yomu lookup popup': 'Reader -> Show Yomu lookup popup',
    'in Settings. よむ keeps annotations, media tools, mining, and study features without opening a second popup.': 'を設定でオフにします。よむは2つ目のポップアップを開かずに、注釈、メディアツール、マイニング、学習機能を維持します。',
    'The popup also has optional study helpers for the current sentence. The translation tool generates a plain sentence translation when you open that section, and the grammar tool highlights likely grammar patterns with short explanations and guide links.': 'ポップアップには、現在の文向けの任意の学習補助もあります。翻訳ツールはそのセクションを開いたときに自然な文訳を生成し、文法ツールは可能性の高い文法パターンを短い説明とガイドリンク付きで強調表示します。',
    'This gives you native-language dictionaries, monolingual Japanese definitions, frequency, kanji, or pitch dictionaries without depending on a remote service for every lookup.': 'これにより、検索のたびに外部サービスへ依存せず、母語辞書、日本語単語辞書、頻度、漢字、ピッチ辞書を使えます。',
    'Examples can show Japanese, translations, thumbnails, audio, and source filters. Settings let you choose categories, length limits, image visibility, translation visibility, playback speed, and one-time hover audio on desktop. To practice without seeing English immediately, turn on blurred example translations and reveal them by tapping the translation.': '例文では、日本語、翻訳、サムネイル、音声、ソースフィルターを表示できます。設定では、カテゴリ、長さ制限、画像表示、翻訳表示、再生速度、デスクトップでの一度だけのホバー音声を選べます。すぐ英語を見ずに練習したい場合は、例文翻訳のぼかしをオンにし、翻訳をタップして表示します。',
    'Use this for manga panels, screenshots, and image-heavy pages where normal text selection does not work. The image is not sent anywhere unless you enable a local OCR endpoint, and that endpoint is the one you configure in settings.': '通常のテキスト選択が効かない漫画のコマ、スクリーンショット、画像の多いページで使います。ローカルOCRエンドポイントを有効にしない限り画像は送信されず、送信先は設定で指定したエンドポイントだけです。',
    'The transcript is a reading surface too: visible Japanese lines hydrate into the same lookup words as the overlay, so you can skim, jump to a line, and open a popup.': 'トランスクリプトも読書画面です。表示中の日本語行はオーバーレイと同じ検索可能な単語になり、ざっと読み、行へジャンプし、ポップアップを開けます。',
    'The YouTube filter is on by default so recommendations stay focused on Japanese. When a video id is available, よむ checks the original title via oEmbed, keeps Japanese-learning and comprehensible-input titles even when written in English, and hides non-Japanese-looking cards across recommendations, search results, and sidebars. Playback, subtitles, and よむ controls keep working.': 'YouTubeフィルターは標準でオンになっており、おすすめを日本語中心に保ちます。動画IDがある場合、よむはoEmbedで元のタイトルを確認し、英語で書かれた日本語学習・理解可能なインプットのタイトルは残し、おすすめ、検索結果、サイドバーから日本語らしくないカードを隠します。再生、字幕、よむの操作はそのまま使えます。',
    'The separate': '別の',
    'Prefer Japanese site language and location': '日本語サイト言語と日本の地域を優先',
    'setting asks multilingual pages for their Japanese version by combining browser-language hints, Japan locale/location hints, Japanese preference cookies,': '設定は、ブラウザー言語ヒント、日本のロケール・地域ヒント、日本語優先Cookie、',
    'alternates, existing locale query hints such as': 'alternate情報、次のような既存のロケールクエリヒント',
    ', and common URL patterns such as': '、および次のような一般的なURLパターン',
    '. The よむ puck includes the same toggle so you can turn that request on or off from the page; when よむ knows the original English/default URL, turning it off returns there.': 'を組み合わせて、多言語ページに日本語版を要求します。よむパックにも同じトグルがあり、ページ上で要求をオン/オフできます。よむが元の英語版または標準URLを知っている場合、オフにするとそこへ戻ります。',
    'On a phone or tablet, the full Anki setup still uses desktop AnkiConnect: the phone does the reading, the computer does the Anki work. See the step-by-step phone, iPad, or Android setup in': 'スマートフォンやタブレットでも、完全なAnki設定にはデスクトップ版AnkiConnectを使います。読むのはスマートフォン、Anki処理はPCです。スマートフォン、iPad、Android向けの手順は',
    'On iPhone, iPad, and Android, this is often the easiest daily-review surface. For full Anki status, updates, automatic deck scanning, and review queues, keep desktop Anki running with AnkiConnect and point よむ at a reachable LAN or Tailscale URL such as': 'iPhone、iPad、Androidでは、これが最も簡単な日々の復習画面になることがよくあります。完全なAnkiステータス、更新、自動デッキスキャン、復習キューを使うには、デスクトップ版AnkiをAnkiConnect付きで起動したままにし、よむには到達可能なLANまたはTailscale URLを指定してください。例:',
    '— AnkiConnect\'s default': '— AnkiConnectの標準設定である',
    'means "this device" and is unreachable from a phone. Without AnkiConnect or an API source, dictionary-backed words keep the page useful once a dictionary is installed. Step-by-step mobile Anki setup is in': 'は「この端末」を意味するため、スマートフォンからは到達できません。AnkiConnectやAPIソースがなくても、辞書をインストールすれば辞書ベースの単語でページを活用できます。モバイルAnkiの手順は',
    'Install よむ in three steps — add a free userscript manager (Tampermonkey on desktop, Userscripts on iPhone/iPad), install よむ, then open a Japanese page and tap a word. No account needed. Optional Jiten, JPDB, Anki, OCR, and audio setup included.': 'よむは3ステップでインストールできます。無料のユーザースクリプト管理拡張（デスクトップはTampermonkey、iPhone/iPadはUserscripts）を追加し、よむをインストールし、日本語ページを開いて単語をタップします。アカウント不要。任意のJiten、JPDB、Anki、OCR、音声設定も含みます。',
    'is a small add-on that runs inside your browser. Install a free manager once, add よむ to it, and よむ appears on Japanese pages: tap a word for a popup dictionary, save words for review, read manga with OCR, and look up subtitles on video. It\'s free and needs no account to start.': 'はブラウザー内で動く小さなアドオンです。無料の管理拡張を一度入れ、そこによむを追加すると、日本語ページによむが表示されます。単語をタップしてポップアップ辞書を開き、復習用に単語を保存し、OCRで漫画を読み、動画字幕を検索できます。無料で、始めるのにアカウントは不要です。',
    '— the browser add-on that runs よむ: Tampermonkey (computer) or Userscripts (iPhone/iPad).': '— よむを動かすブラウザーアドオンです。PCではTampermonkey、iPhone/iPadではUserscriptsを使います。',
    'Click the link above. Tampermonkey opens an install screen for よむ. Click': '上のリンクをクリックします。Tampermonkeyでよむのインストール画面が開きます。',
    ', then open a Japanese page and skip to': 'をクリックし、日本語ページを開いて',
    'Userscripts reads this page to install よむ.': 'Userscriptsはこのページを読み取って、よむをインストールします。',
    '— connect Jiten or JPDB for word tracking and mining. Optional, and you can do it later (': '— 単語追跡とマイニングのためにJitenまたはJPDBへ接続します。任意で、あとからでも設定できます（',
    'That\'s the whole loop. Everything below is optional.': 'これで基本の流れは完了です。以下はすべて任意です。',
    'can give よむ word status and mining actions. Local dictionary lookup works fine without them, but connecting one makes progress tracking easier.': 'は、よむに単語ステータスとマイニング操作を提供できます。ローカル辞書検索はそれらなしでも問題なく動きますが、接続すると進捗を追いやすくなります。',
    'The difference is': '違うのは',
    'You don\'t need AnkiMobile or AnkiDroid for full Anki status on mobile. Keep Anki open on your computer and let your phone talk to it; your phone is just the reading screen, while desktop AnkiConnect handles existing-card status, note updates, media, deck scans, and review queues.': 'モバイルで完全なAnkiステータスを使うためにAnkiMobileやAnkiDroidは不要です。PCでAnkiを開いたままにし、スマートフォンからそこへ接続します。スマートフォンは読書画面で、デスクトップ版AnkiConnectが既存カード状態、ノート更新、メディア、デッキスキャン、復習キューを処理します。',
    ': it gives your own devices a private address so they can see each other, even away from home — no router setup, port forwarding, or command line. Install it on the computer that runs Anki and on the phone or tablet that runs よむ.': 'です。自分の端末同士にプライベートアドレスを与え、外出先でも相互に見えるようにします。ルーター設定、ポート開放、コマンドラインは不要です。Ankiを動かすPCと、よむを動かすスマートフォンまたはタブレットにインストールします。',
    '. Mobile Anki handoff is one-way: it only starts a new note. It cannot scan existing decks, show existing-card status, update old notes, or provide review queues — those need desktop AnkiConnect.': 'です。モバイルAnki連携は一方向で、新規ノートを開始するだけです。既存デッキのスキャン、既存カード状態の表示、古いノートの更新、復習キューの提供はできません。それらにはデスクトップ版AnkiConnectが必要です。',
    '. This handoff is one-way: it only starts a new note. It cannot scan existing decks, show existing-card status, update old notes, or provide review queues — those need desktop AnkiConnect.': 'に新しいノートを渡せます。この連携は一方向で、新規ノートを開始するだけです。既存デッキのスキャン、既存カード状態の表示、古いノートの更新、復習キューの提供はできません。それらにはデスクトップ版AnkiConnectが必要です。',
    'controls this path; leave it on or off as you like.': 'がこの経路を制御します。好みに応じてオン/オフしてください。',
    'Add Japanese word audio to よむ. Use a hosted Yomitan-compatible audio URL for the easiest setup, or run a free local audio server to play pronunciation files stored on your own computer.': 'よむに日本語単語の音声を追加します。最も簡単な設定ではホスト版のYomitan互換音声URLを使い、自分のPCに保存した発音ファイルを再生したい場合は無料のローカル音声サーバーを動かします。',
    'The hosted option is the least fuss. Use the local server only if you\'re okay keeping a small helper app running on your computer.': 'ホスト版がいちばん手軽です。PC上で小さな補助アプリを起動したままにできる場合だけ、ローカルサーバーを使ってください。',
    'gives you a personal audio URL after you subscribe through Patreon and authenticate. That URL works with よむ directly — no audio files to download and nothing to run on your computer.': 'は、Patreonで購読して認証した後に個人用の音声URLを発行します。そのURLはよむで直接使えます。音声ファイルのダウンロードも、PC上で動かすものも不要です。',
    'Don\'t use the green Code button on GitHub — that downloads developer source code. Take the latest file from the Releases page.': 'GitHubの緑色のCodeボタンは使わないでください。開発者向けソースコードをダウンロードしてしまいます。Releasesページから最新ファイルを入手してください。',
    'On a phone or iPad,': 'スマートフォンやiPadでは、',
    'that device': 'その端末',
    ', not the computer running the server (see': 'を指し、サーバーを動かしているPCではありません（',
    'desktop helpers on mobile': 'モバイルでのデスクトップ補助機能',
    '). To reach your computer\'s audio server from another device, use': 'を参照）。別の端末からPCの音声サーバーへ接続するには、',
    'If this setup feels like too much, use the': 'この設定が大変に感じる場合は、',
    'hosted audio option': 'ホスト版音声オプション',
    'at the top of this page.': 'をこのページ上部から使ってください。',
    'Get help with よむ — report a bug, join the Discord, view the source on GitHub, or donate. よむ brings popup lookup, mining, dictionaries, subtitles, OCR, and Anki export into one free userscript.': 'よむのヘルプです。バグ報告、Discord参加、GitHubでのソース確認、寄付ができます。よむはポップアップ検索、マイニング、辞書、字幕、OCR、Anki書き出しを1つの無料ユーザースクリプトにまとめます。',
    'よむ brings popup lookup, mining, imported dictionaries, subtitles, image reading, and Anki export into one free userscript. Comparable suites such as': 'よむは、ポップアップ検索、マイニング、インポート辞書、字幕、画像読み取り、Anki書き出しを1つの無料ユーザースクリプトにまとめます。同等のスイートである',
    'currently advertise paid plans from $10/month; よむ offers the same core reading-and-mining workflow for free (': 'は現在、月額10ドルからの有料プランを案内していますが、よむは同じ中心的な読書・マイニングの流れを無料で提供します（',
    'full comparison': '詳しい比較',
    'Donations are optional. They help cover the time, testing devices, services, maintenance, and AI tokens that keep the reader polished. Realistically, I have already spent far more on AI/API tokens building よむ than donations are ever likely to make back, but even a small donation helps soften that cost. On a personal level, my dream is to save enough to move to Japan and marry my long-distance Japanese girlfriend. Every bit of support brings that closer and keeps me maintaining よむ, fixing bugs, and adding the features learners ask for.': '寄付は任意です。リーダーを磨き続けるための時間、テスト端末、サービス、メンテナンス、AIトークン費用を支える助けになります。現実的には、よむの開発でAI/APIトークンに費やした額は、寄付で回収できる見込みを大きく上回っていますが、少額でもその負担を和らげてくれます。個人的には、日本へ移住して遠距離恋愛中の日本人の彼女と結婚できるだけの資金を貯めるのが夢です。どんな支援もその未来を近づけ、よむのメンテナンス、バグ修正、学習者が求める機能追加を続ける励みになります。',
    'Selecting a paragraph that contains a Japanese word no longer collapses the selection back onto that word. The annotated-word auto-lookup popup was hijacking ordinary copy gestures and re-anchoring the live selection, so predominantly non-Japanese passages now stay fully selectable while genuine Japanese selections still open the lookup.': '日本語の単語を含む段落を選択しても、選択範囲がその単語だけに縮んでしまうことがなくなりました。注釈された単語の自動検索ポップアップが通常のコピー操作を奪い、選択範囲を再固定していたためです。これにより、ほとんどが日本語以外の文章でも全体をそのまま選択できるようになり、本来の日本語の選択では引き続き検索が開きます。',
    'Streamlined Study/New Tab into one merged review flow with kanji, word, recall, listen, speak, and final reveal steps, plus cleaner provider grading, speaker audio controls, final-only dictionary reveal, and improved offline/provider smoke coverage.': 'Study/New Tabを、漢字、単語、Recall、Listen、Speak、最終表示の各ステップをまとめた統合復習フローへ整理しました。プロバイダー評価、スピーカー操作、最終時だけの辞書表示、オフライン／プロバイダーのスモーク範囲も改善しています。',
    'Fixed Bunpro API-page token import on SPA navigation and made the helper retry token reads without requiring users to inspect cookies manually.': 'Bunpro APIページでSPA遷移後のトークン取り込みを修正し、ユーザーが手動でCookieを調べなくてもヘルパーがトークン読み取りを再試行するようにしました。',
    'Stopped BookWalker storefront/product pages from auto-OCRing cover art and carousel images when native page text is already available, preventing Yomu from stretching card grids, sidebars, and login/product panels.': 'BookWalkerのストアフロントや商品ページで、ページ本来のテキストが利用できる場合は表紙画像やカルーセル画像を自動OCRしないようにしました。よむによってカードグリッド、サイドバー、ログイン／商品パネルが引き伸ばされるのを防ぎます。',
    'Kept OCR text overlays hidden until the user hovers or focuses OCR hit targets, including automatic reader-raster OCR, so recognized text no longer remains visibly painted over pages.': '自動リーダーラスターOCRを含め、OCRのヒット対象をホバーまたはフォーカスするまでOCR文字オーバーレイを非表示にしました。認識済みテキストがページ上に常時描かれたままにならなくなります。',
    'Stabilized BookWalker Firefox canvas OCR across DOM swaps and same-page scrolling by reusing completed OCR frames for equivalent canvases, dropping stale status pills when the painted page changes, and keeping capped empty/failed pages terminal until the user retries.': 'BookWalkerのFirefoxキャンバスOCRを、DOM差し替えや同一ページスクロールでも安定させました。同等キャンバスには完了済みOCRフレームを再利用し、描画ページが変わったら古いステータスピルを落とし、空または失敗が上限に達したページはユーザーが再試行するまで終端状態に保ちます。',
    'Reduced BookWalker continuous/vertical scroll lag by scanning the dominant visible page surface instead of repeatedly OCRing previous-page slivers during scroll.': 'BookWalkerの連続／縦スクロールの重さを減らしました。スクロール中に前ページの細い残りを繰り返しOCRするのではなく、主に表示されているページ面をスキャンします。',
    'Kept tapped partial-page OCR retry regions aligned through BookWalker scroll and zoom changes instead of discarding and rescanning them.': 'BookWalkerでタップした部分ページOCRの再試行領域が、スクロールやズームの変化後も位置合わせされたままになるようにしました。領域を捨てて再スキャンし直すことがなくなります。',
    'Declared the Jiten, JPDB, Google Lens, and BookWalker image hosts explicitly in userscript metadata so Firefox/Tampermonkey upgrades do not pause OCR behind repeated cross-origin prompts.': 'Jiten、JPDB、Google Lens、BookWalker画像ホストをユーザースクリプトのメタデータに明示しました。Firefox/Tampermonkeyのアップグレード後に、繰り返し出るクロスオリジン確認でOCRが止まらないようにします。',
    'Kept passive page annotations layout-neutral by default so BookWalker and other storefront cards, carousels, sidebars, and compact controls stay lookupable without Yomu changing wrapping, sizing, or permanent highlights.': '受け身のページ注釈を既定でレイアウト中立にしました。BookWalkerなどのストアカード、カルーセル、サイドバー、コンパクトな操作部は、よむが折り返し、サイズ、常時ハイライトを変えずに検索可能なままになります。',
    'Stabilized BookWalker continuous/vertical OCR so capped empty scans stop re-running until the user retries, same-page scroll keeps the current OCR state, and the mostly visible page is scanned ahead of tiny previous-page slivers.': 'BookWalkerの連続／縦方向OCRを安定させました。上限に達した空スキャンはユーザーが再試行するまで繰り返さず、同一ページ内スクロールでは現在のOCR状態を保ち、前ページの細い残りではなく大きく表示されているページを先にスキャンします。',
    'Kept automatic reader-raster OCR text hidden until hover/focus, while adding a Scan again retry affordance to BookWalker canvas status pills and recapturing only useful ready pages after zoom changes.': '自動リーダーラスターOCRの文字はホバー／フォーカスまで非表示にしました。BookWalkerキャンバスの状態ピルには「再スキャン」操作を追加し、ズーム変更後は有用な準備完了ページだけを再取得します。',
    'Keeps automatic BookWalker Firefox OCR aligned to the full page canvas while scrolling, instead of shrinking full-page OCR coordinates into the visible crop and re-scanning the same page on every half-screen movement.': 'BookWalker Firefoxの自動OCRを、スクロール中もページ全体のキャンバスに合わせたままにしました。ページ全体のOCR座標を表示中の切り抜きに縮めたり、半画面動くたびに同じページを再スキャンしたりしません。',
    'Keeps settled BookWalker OCR frames mounted through same-page scroll and size drift, so vertical readers do not replace a ready page with a fresh failed scan while the user moves around the page.': 'BookWalkerの確定済みOCRフレームを、同じページ内のスクロールやサイズ揺れでも保持するようにしました。縦読みでページ内を移動しても、準備完了のページが新しい失敗スキャンに置き換わりません。',
    'Adds the Google Search and hosted Yomu data hosts used by OCR/study fallbacks to userscript connection metadata, preventing Firefox/Tampermonkey from pausing BookWalker OCR behind cross-origin permission prompts.': 'OCR／学習フォールバックで使うGoogle検索ホストとホスト版Yomuデータホストを、ユーザースクリプトの接続メタデータに追加しました。Firefox/Tampermonkeyがクロスオリジン許可プロンプトの裏でBookWalker OCRを停止させないようにします。',
    'Keeps OCR image hit targets visually passive during pointer focus and text selection, so recognized manga text only appears on hover, keyboard focus, or explicit tap pinning instead of staying painted over BookWalker pages.': 'ポインター操作によるフォーカスやテキスト選択中も、OCR画像ヒット対象が見た目上は受け身のままになるようにしました。認識済みマンガ文字はBookWalkerページ上に描かれたままにならず、ホバー、キーボードフォーカス、または明示的なタップ固定時だけ表示されます。',
    'Re-captures ready BookWalker OCR frames after viewer zoom/reflow so hover hit targets do not keep a stale vertical coordinate map while the page is resized.': 'BookWalkerビューアーのズームや再レイアウト後に、準備完了済みのOCRフレームを再取得するようにしました。ページサイズが変わっても、ホバー判定が古い縦方向の座標にずれません。',
    'Treats parsed BookWalker OCR frames as ready for reflow recapture even if the status pill was replaced, fixing Y-axis hover drift after zoom or viewer rerender.': 'ステータスピルが置き換わっていても、解析済みのBookWalker OCRフレームを再レイアウト時の再取得対象として扱います。ズームやビューアー再描画後のY軸ホバーずれを修正しました。',
    'Clears offscreen failed BookWalker scan pills together with their pending capture state, preventing repeated Scanning/Could not read text churn from blocking a clean retry.': '画面外へ出た失敗済みのBookWalkerスキャンピルを、保留中の取得状態ごと消すようにしました。「スキャン中」と「テキストを読み取れません」の繰り返しが残って、きれいな再試行を妨げることを防ぎます。',
    'Re-scans tall/zoomed BookWalker canvases when the visible crop moves to a new half-screen bucket, so continuous scroll pages no longer keep stale OCR text from the previous visible slice while still avoiding per-pixel rescans.': 'BookWalkerの背が高いページやズーム済みキャンバスで、表示範囲が半画面単位の新しい区画へ移動したときに再スキャンするようにしました。連続スクロールで前の表示範囲の古いOCRテキストを保持せず、ピクセル単位の再スキャンも避けます。',
    'Recomputes BookWalker OCR hit-target placement immediately after hover/focus expands ruby or pitch markup, fixing the case where the X hit column was correct but the active text strip appeared at the wrong Y position.': 'ホバーやフォーカスでルビ／ピッチ表示が展開された直後にBookWalker OCRのヒット対象位置を再計算します。X方向の列は合っているのに、アクティブな文字帯だけY方向へずれる問題を修正しました。',
    'Clips BookWalker manual/visible-region OCR captures to the actual reader viewport instead of the full browser window, fixing Y-only overlay drift when the viewer toolbar covers the top of the canvas.': 'BookWalkerの手動／表示領域OCR取得を、ブラウザーウィンドウ全体ではなく実際のリーダービューポートで切り詰めます。ビューアーのツールバーがキャンバス上部を覆うときのY方向だけのオーバーレイずれを修正しました。',
    'Keeps manually cropped BookWalker OCR frames aligned during ordinary scroll without rescanning, while re-capturing them when the underlying canvas scale changes so old crop coordinates are not stretched over a reflowed page.': '手動で切り抜いたBookWalker OCRフレームは通常のスクロール中に再スキャンせず位置合わせを保ちます。一方で、元のキャンバス倍率が変わった場合は再取得し、古い切り抜き座標が再レイアウト後のページへ引き伸ばされないようにしました。',
    'Drops stale BookWalker vertical-scroll OCR frames when the painted page content changes inside a reused stable canvas surface, preventing previous-page OCR from surviving after BookWalker repaints.': '再利用された安定キャンバス面の内部で描画ページ内容が変わったとき、BookWalker縦スクロールの古いOCRフレームを破棄します。BookWalkerの再描画後に前ページのOCRが残ることを防ぎます。',
    'Kept the homepage hero action pills on one row by removing VitePress\' extra action padding, preventing text wrapping inside pills, and letting narrow screens scroll the row without widening the page.': 'ホームページのヒーローアクションピルを1行に保つようにしました。VitePressが追加する余分なアクション余白をなくし、ピル内のテキスト折り返しを防ぎ、狭い画面ではページ幅を広げずに行だけを横スクロールできるようにしました。',
    'Kept the hosted video subtitle panel open as an upload surface before a video is detected, so the Subtitles button exposes the manual Japanese/native subtitle loaders instead of bouncing users back to the file picker.': 'ホスト版動画プレイヤーで、動画検出前でも字幕パネルをアップロード用の面として開いたままにしました。これによりSubtitlesボタンがファイルピッカーへ戻すのではなく、日本語/母語字幕の手動読み込みボタンを表示します。',
    'Fixed manual subtitle uploads from mobile/iPad file pickers by accepting common subtitle MIME types, allowing multi-file selection, and keeping the hidden input alive until .ass, .ssa, .srt, and .vtt reads finish.': 'モバイル/iPadのファイルピッカーからの手動字幕アップロードを修正しました。一般的な字幕MIMEタイプを受け付け、複数ファイル選択を許可し、.ass、.ssa、.srt、.vttの読み込みが終わるまで非表示inputを保持します。',
    'Mirrored Netflix-style DOM captions while the subtitle panel is open, even when the persistent subtitle overlay is off.': '常時表示の字幕オーバーレイがオフでも、字幕パネルが開いている間はNetflix形式のDOM字幕をよむ側へ反映するようにしました。',
    'Refined the hosted docs homepage copy, install CTAs, section spacing, and mobile hero actions so the first screen is clearer, slimmer, centered on small screens, and points directly at the userscript install.': 'ホスト版ドキュメントのホームページ文言、インストールCTA、セクション間隔、モバイルのヒーロー操作を見直し、最初の画面をより明快で細く、小さな画面でも中央に揃い、ユーザースクリプトのインストールへ直接進めるようにしました。',
    'Reworked the homepage demos: the phone demo keeps the clean autoplay loop with click and keyboard pause controls, the manga sample uses the real hosted OCR runtime on the image itself, the video block uses the real subtitle runtime on a controlled player, and the Try me fixture shows the full sample sentence.': 'ホームページのデモを作り直しました。スマートフォンデモはすっきりした自動再生ループを保ちつつクリックとキーボードで一時停止でき、漫画サンプルは画像そのものに対して実際のホスト版OCRランタイムを使い、動画ブロックはコントロール付きプレイヤー上で実際の字幕ランタイムを使い、Try me 例は全文サンプルを表示します。',
    'Improved docs accessibility and mobile behavior across the homepage, hosted video/PDF/study tools, and docs audits with stronger focus rings, larger coarse-pointer targets, reduced-motion handling, darker pitch underlines, and broader guide/tool page audit coverage.': 'ホームページ、ホスト版の動画・PDF・学習ツール、ドキュメント監査全体でアクセシビリティとモバイル挙動を改善しました。フォーカスリング、粗いポインター向けの大きなターゲット、動きを抑える設定への対応、濃いピッチ下線、ガイド・ツールページの監査範囲を強化しています。',
    'Cleaned up docs copy across setup, features, tools, and guides so lookup behavior is explained with clearer device-neutral wording instead of defaulting everything to "tap."': 'セットアップ、機能、ツール、ガイド全体の文言を整理し、検索操作をすべて「タップ」と表現するのではなく、端末を問わない明確な言葉で説明するようにしました。',
    // Brand names to themselves
    'AnkiConnect': 'AnkiConnect',
    'Jiten': 'Jiten',
    'Tailscale': 'Tailscale',
    'AnkiMobile': 'AnkiMobile',
    'AnkiDroid': 'AnkiDroid',
    'oEmbed': 'oEmbed',
    'MangaOCR': 'MangaOCR',
    'PaddleOCR': 'PaddleOCR',
    'Apple Vision': 'Apple Vision',
    'Ultimate Yomitan Audio Source': 'Ultimate Yomitan Audio Source',
    'Chrome': 'Chrome',
    'Safari': 'Safari',
    'Windows': 'Windows',
    'Linux': 'Linux',
};
const HOSTED_DOCS_EN_COPY: Record<string, string> = Object.fromEntries(
    Object.entries(HOSTED_DOCS_JA_COPY).map(([english, japanese]) => [japanese, english]),
);
const HOSTED_DOCS_COPY_BY_LANGUAGE: Record<InterfaceLanguage, Record<string, string>> = {
    en: HOSTED_DOCS_EN_COPY,
    ja: HOSTED_DOCS_JA_COPY,
};
const HOSTED_RESEARCH_LINKS = {
    extensive: {
        fallbackHref: 'https://link.springer.com/article/10.1007/s10648-025-10068-6',
        hrefIncludes: 's10648-025-10068-6',
        en: 'learning a language through extensive reading',
        ja: '多読による言語学習',
    },
    input: {
        fallbackHref: 'https://journals.library.columbia.edu/index.php/SALT/article/view/1278',
        hrefIncludes: 'SALT/article/view/1278',
        en: 'comprehensible input',
        ja: '理解可能なインプット',
    },
    tadoku: {
        fallbackHref: 'https://tadoku.org/japanese/en/what-is-tadoku-en/',
        hrefIncludes: 'tadoku.org/japanese/en/what-is-tadoku-en',
        en: 'tadoku.org',
        ja: 'tadoku.org',
    },
} as const;
type HostedResearchLinkKey = keyof typeof HOSTED_RESEARCH_LINKS;
type HostedResearchCopySegment = string | { readonly link: HostedResearchLinkKey };
type HostedResearchLinks = Record<HostedResearchLinkKey, HTMLAnchorElement>;
const HOSTED_RESEARCH_COPY_SEGMENTS: Record<InterfaceLanguage, readonly HostedResearchCopySegment[]> = {
    en: [
        'For the research behind the approach, see the 2025 meta-analysis on ',
        { link: 'extensive' },
        ', the classic idea of ',
        { link: 'input' },
        ", and Tadoku's practical reading rules for Japanese learners at ",
        { link: 'tadoku' },
        '.',
    ],
    ja: [
        'このアプローチの背景研究については、2025年のメタ分析「',
        { link: 'extensive' },
        '」、古典的な考え方である「',
        { link: 'input' },
        '」、そして日本語学習者向けのTadokuの実践的な読書ルール（',
        { link: 'tadoku' },
        '）を参照してください。',
    ],
};

function syncLandmarks() {
    const content = document.querySelector<HTMLElement>('#VPContent');
    syncSkipLinkLandmark();
    if (!content) return;
    if (content.querySelector('main')) {
        content.removeAttribute('role');
        return;
    }
    content.setAttribute('role', 'main');
}

function syncSkipLinkLandmark(): void {
    const skipLink = document.querySelector<HTMLAnchorElement>('.VPSkipLink');
    if (!skipLink || skipLink.closest('[data-yomu-skip-links]')) return;
    const nav = document.createElement('nav');
    nav.className = 'yomu-skip-links';
    nav.dataset.yomuSkipLinks = 'true';
    nav.setAttribute('aria-label', 'Skip links');
    skipLink.before(nav);
    nav.append(skipLink);
}

function installHostedLanguageToggle() {
    syncHostedLanguageToggle();
    window.requestAnimationFrame(syncHostedLanguageToggle);
    window.setTimeout(syncHostedLanguageToggle, 500);
    if (languageToggleObserver) return;
    languageToggleObserver = new MutationObserver(mutations => {
        localizeHostedAttributeMutations(mutations);
        if (hasHostedDocsShellMutation(mutations)) scheduleHostedDocsShellSync();
    });
    languageToggleObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [...HOSTED_DOCS_TRANSLATED_ATTRIBUTES],
    });
}

function hasHostedDocsShellMutation(mutations: MutationRecord[]): boolean {
    return mutations.some(isHostedDocsShellMutation);
}

function isHostedDocsShellMutation(mutation: MutationRecord): boolean {
    if (mutation.type !== 'childList') return false;
    if (mutation.target instanceof Element && shouldSkipHostedDocsNode(mutation.target)) return false;
    return [...mutation.addedNodes, ...mutation.removedNodes].some(isHostedDocsMutationNode);
}

function isHostedDocsMutationNode(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent?.trim());
    return node instanceof Element && !shouldSkipHostedDocsNode(node);
}

function scheduleHostedDocsShellSync(): void {
    if (hostedDocsShellSyncPending) return;
    hostedDocsShellSyncPending = true;
    window.requestAnimationFrame(() => {
        hostedDocsShellSyncPending = false;
        syncHostedLanguageToggle();
        syncHostedOverflowMenu();
        syncHostedMobileNavSettings();
        localizeHostedDocsCopy();
        syncHostedAccent();
    });
}

function localizeHostedAttributeMutations(mutations: MutationRecord[]): void {
    const language = effectiveInterfaceLanguage();
    mutations.forEach(mutation => {
        if (mutation.type !== 'attributes') return;
        if (!isHostedDocsTranslatedAttribute(mutation.attributeName)) return;
        if (!(mutation.target instanceof HTMLElement)) return;
        translateElementAttribute(mutation.target, mutation.attributeName, language);
    });
}

function isHostedDocsTranslatedAttribute(attribute: string | null): attribute is HostedDocsTranslatedAttribute {
    return typeof attribute === 'string' && HOSTED_DOCS_TRANSLATED_ATTRIBUTES.includes(attribute as HostedDocsTranslatedAttribute);
}

function syncHostedLanguageToggle() {
    const target = hostedLanguageToggleTarget();
    if (!target) return;
    const button = hostedLanguageToggleButton();
    insertHostedLanguageToggle(target, button);
    syncHostedLanguageToggleButton(button);
}

function hostedLanguageToggleTarget(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.VPNavBar .content-body');
}

function hostedLanguageToggleButton(): HTMLButtonElement {
    return (document.getElementById(LANGUAGE_TOGGLE_ID) as HTMLButtonElement | null) ?? createHostedLanguageToggle();
}

function insertHostedLanguageToggle(target: HTMLElement, button: HTMLButtonElement): void {
    if (button.isConnected) return;
    target.insertBefore(button, hostedLanguageToggleAnchor(target));
}

function hostedLanguageToggleAnchor(target: HTMLElement): Element | ChildNode | null {
    return target.querySelector<HTMLElement>('.VPNavBarAppearance') ?? target.firstChild;
}

function createHostedLanguageToggle(): HTMLButtonElement {
    const button = document.createElement('button');
    button.id = LANGUAGE_TOGGLE_ID;
    button.className = 'yomu-language-toggle';
    button.type = 'button';
    button.addEventListener('click', () => {
        const language = nextInterfaceLanguage();
        saveInterfaceLanguage(language);
        syncHostedLanguageToggleButton(button);
    });
    return button;
}

function syncHostedLanguageToggleButton(button: HTMLButtonElement): void {
    const next = nextInterfaceLanguage();
    const state = HOSTED_LANGUAGE_TOGGLE_STATES[next];
    setHostedButtonLanguage(button, state.lang);
    setHostedButtonText(button, state.text);
    button.removeAttribute('title');
    setHostedAttribute(button, 'aria-label', languageToggleLabel(effectiveInterfaceLanguage(), next));
}

function setHostedButtonLanguage(button: HTMLButtonElement, language: InterfaceLanguage): void {
    if (button.lang !== language) button.lang = language;
}

function setHostedButtonText(button: HTMLButtonElement, text: string): void {
    if (button.textContent !== text) button.textContent = text;
}

function setHostedAttribute(element: Element, attribute: string, value: string): void {
    if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
}

function installHostedOverflowMenu() {
    syncHostedOverflowMenu();
    syncHostedMobileNavSettings();
}

function syncHostedOverflowMenu() {
    const extra = document.querySelector<HTMLElement>('.VPNavBarExtra');
    if (!extra) return;
    extra.classList.add('yomu-hosted-extra');
    syncHostedOverflowButton(extra);
    syncHostedOverflowGroup(extra);
}

function syncHostedOverflowButton(extra: HTMLElement): void {
    const button = extra.querySelector<HTMLButtonElement>(':scope > button.button');
    if (!button) return;
    button.setAttribute('aria-label', translateHostedDocsString('Menu', effectiveInterfaceLanguage()));
    button.removeAttribute('title');
}

function syncHostedOverflowGroup(extra: HTMLElement): void {
    const menu = extra.querySelector<HTMLElement>('.VPMenu');
    if (!menu) return;
    if (!menu.querySelector(HOSTED_OVERFLOW_SELECTOR)) menu.prepend(createHostedOverflowGroup());
}

function syncHostedMobileNavSettings() {
    const moreItems = document.querySelector<HTMLElement>('#NavScreenGroup-more');
    if (!moreItems || moreItems.querySelector(HOSTED_MOBILE_SETTINGS_SELECTOR)) return;
    moreItems.prepend(createHostedMobileSettingsItem());
}

function createHostedOverflowGroup(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'group yomu-hosted-overflow-group';
    group.dataset.yomuHostedOverflow = 'true';

    const list = document.createElement('div');
    list.className = 'yomu-hosted-overflow-list';
    list.append(createHostedSettingsItem(), ...HOSTED_OVERFLOW_LINKS.map(createHostedOverflowLink));
    group.append(list);
    return group;
}

function createHostedSettingsItem(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'yomu-hosted-overflow-link';
    button.type = 'button';
    button.textContent = 'Settings';
    button.setAttribute('aria-label', 'Open settings');
    bindHostedSettingsWarmup(button);
    button.addEventListener('click', () => openHostedSettings());
    return button;
}

function createHostedMobileSettingsItem(): HTMLElement {
    const item = document.createElement('div');
    item.className = 'item yomu-hosted-mobile-settings-item';
    item.dataset.yomuHostedMobileSettings = 'true';

    const button = document.createElement('button');
    button.className = 'yomu-hosted-mobile-settings-button';
    button.type = 'button';
    button.textContent = 'Settings';
    button.setAttribute('aria-label', 'Open settings');
    bindHostedSettingsWarmup(button);
    button.addEventListener('click', () => {
        closeHostedMobileNavScreen();
        openHostedSettings();
    });
    item.append(button);
    return item;
}

function closeHostedMobileNavScreen(): void {
    const hamburger = document.querySelector<HTMLButtonElement>('.VPNavBarHamburger[aria-expanded="true"]');
    hamburger?.click();
}

function createHostedOverflowLink(item: typeof HOSTED_OVERFLOW_LINKS[number]): HTMLAnchorElement {
    const link = document.createElement('a');
    link.className = 'yomu-hosted-overflow-link';
    link.href = item.href;
    link.textContent = item.text;
    if (item.target) link.target = item.target;
    return link;
}

function bindHostedSettingsWarmup(button: HTMLElement): void {
    const warm = () => warmHostedSettingsRuntime();
    const options = { passive: true, once: true } as AddEventListenerOptions;
    button.addEventListener('pointerenter', warm, options);
    button.addEventListener('pointerdown', warm, options);
    button.addEventListener('touchstart', warm, options);
    button.addEventListener('focusin', warm, { once: true });
}

function warmHostedSettingsRuntime(): HTMLScriptElement[] {
    const forceLocalRuntime = isLocalHostedRuntime();
    const settings = appendHostedSettingsCompanionScript(forceLocalRuntime);
    const core = loadHostedYomuRuntime();
    return [settings, core].filter(isHostedRuntimeScriptElement);
}

function openHostedSettings(): void {
    const scripts = warmHostedSettingsRuntime();
    const dispatch = () => {
        if (document.querySelector('.jpdb-reader-settings')) return true;
        window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { panel: 'basics' } }));
        return Boolean(document.querySelector('.jpdb-reader-settings'));
    };
    if (dispatch()) return;
    onHostedScriptsReady(scripts, () => window.requestAnimationFrame(dispatch));
    [50, 120, 240, 480, 900, 1500].forEach(delay => window.setTimeout(dispatch, delay));
}

function languageToggleLabel(current: InterfaceLanguage, next: InterfaceLanguage): string {
    return HOSTED_LANGUAGE_TOGGLE_LABELS[current][next];
}

function nextInterfaceLanguage(): InterfaceLanguage {
    return effectiveInterfaceLanguage() === 'ja' ? 'en' : 'ja';
}

function effectiveInterfaceLanguage(): InterfaceLanguage {
    const language = readInterfaceLanguage();
    if (language === 'ja' || language === 'en') return language;
    return browserPrefersJapanese() ? 'ja' : 'en';
}

function readInterfaceLanguage(): string {
    return readEffectiveHostedSettings().interfaceLanguage;
}

function saveInterfaceLanguage(language: InterfaceLanguage): void {
    const settings = readStoredSettings();
    settings.interfaceLanguage = language;
    hostedSettingsEventPatch = { ...hostedSettingsEventPatch, interfaceLanguage: language };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: { language } }));
}

function localizeHostedDocsCopy(options: { resetReaderWords?: boolean } = {}): void {
    const language = effectiveInterfaceLanguage();
    syncHostedDocumentLocale(language);
    if (options.resetReaderWords) unwrapHostedDocsReaderWords();
    localizeHostedStructuredDocsCopy(document.body, language);
    restoreHostedDocsLeafCopy(document.body, language);
    translateTextNodes(document.body, language);
    translateAttributes(document.body, language);
}

function syncHostedDocumentLocale(language: InterfaceLanguage): void {
    document.documentElement.setAttribute('lang', language);
    document.querySelector<HTMLMetaElement>('meta[property="og:locale"]')
        ?.setAttribute('content', HOSTED_DOCS_LOCALE_META[language]);
    translateHostedHeadCopy(language);
}

function translateHostedHeadCopy(language: InterfaceLanguage): void {
    translateHostedDocumentTitle(language);
    document.querySelectorAll<HTMLMetaElement>(HOSTED_DOCS_HEAD_TRANSLATION_SELECTOR).forEach(meta => {
        translateHostedHeadContent(meta, language);
    });
}

function translateHostedDocumentTitle(language: InterfaceLanguage): void {
    const current = document.title;
    const original = canonicalHostedDocsSourceString(current, hostedDocumentTitleOriginal);
    hostedDocumentTitleOriginal = original;
    const translated = translateHostedDocsString(original, language);
    if (translated !== current) document.title = translated;
}

function translateHostedHeadContent(meta: HTMLMetaElement, language: InterfaceLanguage): void {
    const value = meta.getAttribute('content');
    if (!value) return;
    const originals = hostedAttributeOriginals(meta);
    const original = canonicalHostedDocsSourceString(value, originals.get('content'));
    originals.set('content', original);
    const translated = translateHostedDocsString(original, language);
    if (translated !== value) meta.setAttribute('content', translated);
}

function scheduleHostedDocsLocalization(options: { resetReaderWords?: boolean } = {}): void {
    hostedDocsLocalizationResetPending ||= options.resetReaderWords === true;
    if (hostedDocsLocalizationPending) return;
    hostedDocsLocalizationPending = true;
    window.requestAnimationFrame(() => {
        const resetReaderWords = hostedDocsLocalizationResetPending;
        hostedDocsLocalizationPending = false;
        hostedDocsLocalizationResetPending = false;
        localizeHostedDocsCopy({ resetReaderWords });
        window.setTimeout(() => {
            localizeHostedDocsCopy();
        }, 80);
    });
}

function localizeHostedStructuredDocsCopy(root: ParentNode, language: InterfaceLanguage): void {
    const paragraph = hostedResearchParagraph(root);
    if (!paragraph) return;
    if (isHostedResearchCopyCurrent(paragraph, language)) return;
    paragraph.replaceChildren(...hostedResearchCopyNodes(paragraph, language));
    markHostedResearchCopyCurrent(paragraph, language);
    resetHostedDocsTextOriginals(paragraph);
}

function isHostedResearchCopyCurrent(paragraph: HTMLElement, language: InterfaceLanguage): boolean {
    return paragraph.dataset.yomuHostedCopy === 'research' && paragraph.dataset.yomuHostedLanguage === language;
}

function markHostedResearchCopyCurrent(paragraph: HTMLElement, language: InterfaceLanguage): void {
    paragraph.dataset.yomuHostedCopy = 'research';
    paragraph.dataset.yomuHostedLanguage = language;
}

function hostedResearchCopyNodes(paragraph: HTMLElement, language: InterfaceLanguage): Node[] {
    const links = hostedResearchLinks(paragraph, language);
    return HOSTED_RESEARCH_COPY_SEGMENTS[language].map(segment => hostedResearchCopySegmentNode(segment, links));
}

function hostedResearchLinks(paragraph: HTMLElement, language: InterfaceLanguage): HostedResearchLinks {
    return {
        extensive: hostedResearchLink(paragraph, HOSTED_RESEARCH_LINKS.extensive, language),
        input: hostedResearchLink(paragraph, HOSTED_RESEARCH_LINKS.input, language),
        tadoku: hostedResearchLink(paragraph, HOSTED_RESEARCH_LINKS.tadoku, language),
    };
}

function hostedResearchCopySegmentNode(segment: HostedResearchCopySegment, links: HostedResearchLinks): Node {
    if (typeof segment === 'string') return document.createTextNode(segment);
    return links[segment.link];
}

function hostedResearchParagraph(root: ParentNode): HTMLElement | null {
    return Array.from(root.querySelectorAll<HTMLElement>('.vp-doc p, p')).find(paragraph =>
        hostedResearchAnchor(paragraph, HOSTED_RESEARCH_LINKS.extensive.hrefIncludes)
        && hostedResearchAnchor(paragraph, HOSTED_RESEARCH_LINKS.input.hrefIncludes)
        && hostedResearchAnchor(paragraph, HOSTED_RESEARCH_LINKS.tadoku.hrefIncludes),
    ) ?? null;
}

function hostedResearchLink(
    paragraph: HTMLElement,
    link: typeof HOSTED_RESEARCH_LINKS[keyof typeof HOSTED_RESEARCH_LINKS],
    language: InterfaceLanguage,
): HTMLAnchorElement {
    const current = hostedResearchAnchor(paragraph, link.hrefIncludes);
    const next = current ? current.cloneNode(false) as HTMLAnchorElement : document.createElement('a');
    if (!current) next.href = link.fallbackHref;
    next.textContent = language === 'ja' ? link.ja : link.en;
    return next;
}

function hostedResearchAnchor(paragraph: HTMLElement, hrefIncludes: string): HTMLAnchorElement | null {
    return Array.from(paragraph.querySelectorAll<HTMLAnchorElement>('a[href]')).find(anchor =>
        anchor.href.includes(hrefIncludes) || (anchor.getAttribute('href') ?? '').includes(hrefIncludes),
    ) ?? null;
}

function translateTextNodes(root: ParentNode, language: InterfaceLanguage): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent || shouldSkipHostedDocsNode(parent)) return NodeFilter.FILTER_REJECT;
            return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
    });
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const original = textNodeOriginals.get(node) ?? node.nodeValue ?? '';
        textNodeOriginals.set(node, original);
        node.nodeValue = translateHostedDocsString(original, language);
    }
}

function translateAttributes(root: ParentNode, language: InterfaceLanguage): void {
    root.querySelectorAll<HTMLElement>('[aria-label], [title], [alt], [placeholder]').forEach(element => {
        translateElementAttributes(element, language);
    });
}

function translateElementAttributes(element: HTMLElement, language: InterfaceLanguage): void {
    if (shouldSkipHostedDocsNode(element)) return;
    HOSTED_DOCS_TRANSLATED_ATTRIBUTES.forEach(attr => {
        translateElementAttribute(element, attr, language);
    });
}

function translateElementAttribute(
    element: HTMLElement,
    attribute: HostedDocsTranslatedAttribute,
    language: InterfaceLanguage,
): void {
    const value = element.getAttribute(attribute);
    if (!value) return;
    const originals = hostedAttributeOriginals(element);
    const original = canonicalHostedDocsSourceString(value, originals.get(attribute));
    originals.set(attribute, original);
    const translated = translateHostedDocsString(original, language);
    if (translated !== value) element.setAttribute(attribute, translated);
}

function hostedAttributeOriginals(element: HTMLElement): Map<string, string> {
    const current = attrOriginals.get(element);
    if (current) return current;
    const next = new Map<string, string>();
    attrOriginals.set(element, next);
    return next;
}

function canonicalHostedDocsSourceString(value: string, fallback?: string): string {
    if (fallback && hostedDocsTranslationEquivalent(value, fallback)) return fallback;
    const source = hostedDocsSourceString(value);
    if (source) return source;
    return value;
}

function hostedDocsSourceString(value: string): string | undefined {
    const parts = splitHostedDocsString(value);
    const english = HOSTED_DOCS_JA_COPY[parts.core] ? parts.core : HOSTED_DOCS_EN_COPY[parts.core];
    return english ? `${parts.leading}${english}${parts.trailing}` : undefined;
}

function hostedDocsTranslationEquivalent(value: string, source: string): boolean {
    return value === translateHostedDocsString(source, 'en')
        || value === translateHostedDocsString(source, 'ja');
}

function translateHostedDocsString(value: string, language: InterfaceLanguage): string {
    const parts = splitHostedDocsString(value);
    const translated = hostedDocsTranslation(parts.core, language);
    return applyHostedDocsTranslation(value, parts, translated);
}

function splitHostedDocsString(value: string): { leading: string; core: string; trailing: string } {
    const leadingLength = value.length - value.trimStart().length;
    const trailingStart = value.trimEnd().length;
    return {
        leading: value.slice(0, leadingLength),
        core: value.slice(leadingLength, trailingStart),
        trailing: value.slice(trailingStart),
    };
}

function hostedDocsTranslation(value: string, language: InterfaceLanguage): string | undefined {
    return HOSTED_DOCS_COPY_BY_LANGUAGE[language][value];
}

function applyHostedDocsTranslation(
    original: string,
    parts: { leading: string; core: string; trailing: string },
    translated: string | undefined,
): string {
    if (!translated) return original;
    return `${parts.leading}${translated}${parts.trailing}`;
}

function restoreHostedDocsLeafCopy(root: ParentNode, language: InterfaceLanguage): void {
    root.querySelectorAll<HTMLElement>(HOSTED_DOCS_TRANSLATION_LEAF_SELECTOR).forEach(element => {
        restoreHostedDocsLeafElement(element, language);
    });
}

function restoreHostedDocsLeafElement(element: HTMLElement, language: InterfaceLanguage): void {
    if (!isReplaceableHostedDocsLeaf(element)) return;
    const current = element.textContent ?? '';
    const translated = translateHostedDocsString(current, language);
    if (translated !== current) element.textContent = translated;
}

function isReplaceableHostedDocsLeaf(element: HTMLElement): boolean {
    return !shouldSkipHostedDocsNode(element) && canReplaceHostedDocsCopyElement(element);
}

function canReplaceHostedDocsCopyElement(element: HTMLElement): boolean {
    const text = hostedTrimmedText(element);
    if (!text) return false;
    if (!hasHostedDocsTranslation(text)) return false;
    return hostedDocsLeafChildrenAreAnnotations(element);
}

function hostedTrimmedText(element: HTMLElement): string {
    return element.textContent?.trim() ?? '';
}

function hasHostedDocsTranslation(text: string): boolean {
    return Boolean(HOSTED_DOCS_JA_COPY[text] ?? HOSTED_DOCS_EN_COPY[text]);
}

function hostedDocsLeafChildrenAreAnnotations(element: HTMLElement): boolean {
    return Array.from(element.querySelectorAll('*')).every(isHostedReaderAnnotationElement);
}

function isHostedReaderAnnotationElement(element: Element): boolean {
    return element.matches('.jpdb-reader-word, .jpdb-reader-furigana, .jpdb-reader-ruby, ruby, rt, rp');
}

function shouldSkipHostedDocsNode(element: Element): boolean {
    if (element.id === LANGUAGE_TOGGLE_ID) return true;
    return Boolean(element.closest('script, style, pre, code, kbd, samp, textarea, input, [data-yomu-localize="off"], [data-jpdb-reader-root], .jpdb-reader-settings, .jpdb-reader-word, .jpdb-reader-furigana, .jpdb-reader-ruby, .jpdb-ocr-layer, .jpdb-ocr-line'));
}

function unwrapHostedDocsReaderWords(): void {
    const parents = new Set<ParentNode>();
    document.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach(word => {
        if (word.closest('[data-jpdb-reader-root]')) return;
        if (word.closest('[data-yomu-localize="off"]')) return;
        const parent = word.parentNode;
        if (!parent) return;
        parents.add(parent);
        word.replaceWith(document.createTextNode(hostedReaderWordSurfaceText(word)));
    });
    parents.forEach(parent => {
        parent.normalize();
        resetHostedDocsTextOriginals(parent);
    });
}

function resetHostedDocsTextOriginals(root: ParentNode): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        textNodeOriginals.delete(node);
    }
}

function hostedReaderWordSurfaceText(word: HTMLElement): string {
    let text = '';
    word.childNodes.forEach(node => {
        text += hostedReaderSurfaceTextFromNode(node);
    });
    return text || word.textContent || '';
}

function hostedReaderSurfaceTextFromNode(node: ChildNode): string {
    if (isTextNode(node)) return node.textContent ?? '';
    if (!isHostedReaderSurfaceElement(node)) return '';
    return hostedReaderChildrenSurfaceText(node);
}

function isTextNode(node: ChildNode): node is Text {
    return node.nodeType === Node.TEXT_NODE;
}

function isHostedReaderSurfaceElement(node: ChildNode): node is HTMLElement {
    return node instanceof HTMLElement && !isHostedReaderSurfaceIgnoredElement(node);
}

function isHostedReaderSurfaceIgnoredElement(element: HTMLElement): boolean {
    return element.matches('rt, rp, .jpdb-reader-furigana, .jpdb-reader-furi, .jpdb-ocr-furi, [data-jpdb-reader-surface-ignore="true"]');
}

function hostedReaderChildrenSurfaceText(element: HTMLElement): string {
    let text = '';
    element.childNodes.forEach(child => {
        text += hostedReaderSurfaceTextFromNode(child);
    });
    return text;
}

function readStoredSettings(): Record<string, any> {
    return parseHostedSettings(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');
}

function readEffectiveHostedSettings(): Record<string, any> {
    return { ...readStoredSettings(), ...hostedSettingsEventPatch };
}

function parseHostedSettings(value: string): Record<string, any> {
    try {
        return hostedSettingsRecord(JSON.parse(value));
    } catch {
        return {};
    }
}

function hostedSettingsRecord(value: unknown): Record<string, any> {
    if (isHostedSettingsRecord(value)) return value;
    return {};
}

function isHostedSettingsRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function installHostedThemeSync(isDark: Ref<boolean>): void {
    hostedThemeIsDark = isDark;
    syncHostedThemeFromSettings();
    if (hostedThemeSyncBound) return;
    hostedThemeSyncBound = true;
    window.addEventListener(SETTINGS_CHANGE_EVENT, event => {
        const change = settingsFromChangeEvent(event);
        if (!change) return;
        rememberHostedSettingsChange(change.settings, !change.preview);
        const theme = hostedThemePreferenceFromValue(change.settings.theme);
        if (!theme) return;
        syncHostedThemeFromSettings(theme);
    });
    window.addEventListener('storage', event => {
        if (event.key === SETTINGS_STORAGE_KEY || event.key === null) {
            hostedSettingsEventPatch = {};
            syncHostedThemeFromSettings();
        }
    });
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (readStoredThemePreference() === 'auto') syncHostedThemeFromSettings();
    });
}

function installHostedAppearanceProvider(): void {
    provide('toggle-appearance', () => {
        const current = effectiveHostedTheme(readStoredThemePreference());
        setHostedThemePreference(current === 'dark' ? 'light' : 'dark');
    });
}

function setHostedThemePreference(theme: HostedThemePreference): void {
    const settings = writeStoredThemePreference(theme);
    syncHostedThemeFromSettings(theme);
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { settings } }));
}

function writeStoredThemePreference(theme: HostedThemePreference): Record<string, any> {
    return writeStoredSettingsPatch({ theme });
}

function syncHostedThemeFromSettings(theme: unknown = readStoredThemePreference()): void {
    const preference = normalizeHostedThemePreference(theme);
    const effective = effectiveHostedTheme(preference);
    if (hostedThemeIsDark && hostedThemeIsDark.value !== (effective === 'dark')) {
        hostedThemeIsDark.value = effective === 'dark';
    }
    document.documentElement.classList.toggle('dark', effective === 'dark');
    writeVitePressAppearancePreference(preference, effective);
    syncHostedAccent();
}

function writeVitePressAppearancePreference(preference: HostedThemePreference, effective: 'dark' | 'light'): void {
    const stored = preference === 'auto' ? 'auto' : effective;
    localStorage.setItem(VITEPRESS_APPEARANCE_KEY, stored);
    window.requestAnimationFrame?.(() => {
        if (readStoredThemePreference() === preference) localStorage.setItem(VITEPRESS_APPEARANCE_KEY, stored);
    });
}

function settingsFromChangeEvent(event: Event): { settings: Record<string, unknown>; preview: boolean } | undefined {
    const detail = hostedSettingsChangeDetail(event);
    if (!isHostedSettingsRecord(detail.settings)) return undefined;
    return { settings: detail.settings, preview: detail.preview === true };
}

function hostedSettingsChangeDetail(event: Event): HostedSettingsChangeDetail {
    return (event as CustomEvent<HostedSettingsChangeDetail>).detail ?? {};
}

function rememberHostedSettingsChange(settings: Record<string, unknown>, persist: boolean): void {
    const patch = hostedSettingsPatch(settings);
    if (!Object.keys(patch).length) return;
    hostedSettingsEventPatch = { ...hostedSettingsEventPatch, ...patch };
    if (persist) writeStoredSettingsPatch(patch);
}

function hostedSettingsPatch(settings: Record<string, unknown>): Record<string, any> {
    const patch: Record<string, any> = {};
    const theme = hostedThemePreferenceFromValue(settings.theme);
    const accentColor = hostedAccentFromValue(settings.accentColor);
    const interfaceLanguage = hostedInterfaceLanguagePreferenceFromValue(settings.interfaceLanguage);
    if (theme) patch.theme = theme;
    if (accentColor) patch.accentColor = accentColor;
    if (interfaceLanguage) patch.interfaceLanguage = interfaceLanguage;
    return patch;
}

function writeStoredSettingsPatch(patch: Record<string, any>): Record<string, any> {
    const settings = { ...readStoredSettings(), ...patch };
    hostedSettingsEventPatch = { ...hostedSettingsEventPatch, ...patch };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return settings;
}

function readStoredThemePreference(): HostedThemePreference {
    return normalizeHostedThemePreference(readEffectiveHostedSettings().theme);
}

function normalizeHostedThemePreference(value: unknown, fallback: HostedThemePreference | undefined = 'auto'): HostedThemePreference {
    return hostedThemePreferenceFromValue(value) ?? fallback ?? 'auto';
}

function hostedThemePreferenceFromValue(value: unknown): HostedThemePreference | undefined {
    return typeof value === 'string' && HOSTED_THEME_PREFERENCES.has(value as HostedThemePreference)
        ? value as HostedThemePreference
        : undefined;
}

function hostedInterfaceLanguagePreferenceFromValue(value: unknown): HostedInterfaceLanguagePreference | undefined {
    return value === 'auto' || value === 'en' || value === 'ja'
        ? value
        : undefined;
}

function effectiveHostedTheme(theme: HostedThemePreference): 'dark' | 'light' {
    if (theme === 'dark' || theme === 'light') return theme;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function installHostedAccentSync(): void {
    syncHostedAccent();
    if (accentSyncBound) return;
    accentSyncBound = true;
    window.addEventListener(SETTINGS_CHANGE_EVENT, syncHostedAccent);
    window.addEventListener('storage', event => {
        if (event.key === SETTINGS_STORAGE_KEY || event.key === null) {
            hostedSettingsEventPatch = {};
            syncHostedAccent();
        }
    });
    themeClassObserver = new MutationObserver(syncHostedAccent);
    themeClassObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

function syncHostedAccent(source?: unknown): void {
    if (source instanceof Event) {
        const change = settingsFromChangeEvent(source);
        if (change) rememberHostedSettingsChange(change.settings, !change.preview);
    }
    const accent = sanitizeHostedAccent(readEffectiveHostedSettings().accentColor);
    const root = document.documentElement;
    const dark = root.classList.contains('dark');
    const signature = `${accent}|${dark ? 'dark' : 'light'}`;
    if (hostedAccentSignature === signature) return;
    hostedAccentSignature = signature;
    const pageBackground = dark ? DOC_COLOR_TOKENS.pageBgDark : DOC_COLOR_TOKENS.pageBgLight;
    const brandReadable = readableOn(accent, pageBackground, 4.5);
    const brandHover = readableOn(mixHex(accent, dark ? DOC_COLOR_TOKENS.white : DOC_COLOR_TOKENS.black, 0.18), pageBackground, 3.5);
    const brandActive = readableOn(mixHex(accent, DOC_COLOR_TOKENS.black, 0.18), pageBackground, 3.5);
    const brandSoft = hexToRgba(accent, dark ? 0.22 : 0.16);
    const accentText = readableTextOn(accent);

    root.style.setProperty('--yomu-accent', accent);
    root.style.setProperty('--yomu-accent-readable', brandReadable);
    root.style.setProperty('--yomu-accent-ink', accentText);
    root.style.setProperty('--vp-c-brand-1', brandReadable);
    root.style.setProperty('--vp-c-brand-2', brandHover);
    root.style.setProperty('--vp-c-brand-3', accent);
    root.style.setProperty('--vp-c-brand-soft', brandSoft);
    root.style.setProperty('--vp-button-brand-border', brandReadable);
    root.style.setProperty('--vp-button-brand-bg', accent);
    root.style.setProperty('--vp-button-brand-text', accentText);
    root.style.setProperty('--vp-button-brand-hover-border', brandHover);
    root.style.setProperty('--vp-button-brand-hover-bg', brandHover);
    root.style.setProperty('--vp-button-brand-hover-text', accentText);
    root.style.setProperty('--vp-button-brand-active-border', brandActive);
    root.style.setProperty('--vp-button-brand-active-bg', brandActive);
    root.style.setProperty('--vp-button-brand-active-text', accentText);
    root.style.setProperty('--vp-home-hero-name-color', brandReadable);
    root.style.setProperty('--jpdb-reader-accent', accent);
    root.style.setProperty('--jpdb-reader-accent-readable', brandReadable);
    root.style.setProperty('--jpdb-reader-accent-text', accentText);
    root.style.setProperty('--jpdb-reader-accent-soft', brandSoft);

    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', accent);
}

function sanitizeHostedAccent(value: unknown, fallback = DEFAULT_ACCENT_COLOR): string {
    return hostedAccentFromValue(value) ?? fallback;
}

function hostedAccentFromValue(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    return shortHex ? `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase() : undefined;
}

function readableTextOn(background: string): typeof DOC_COLOR_TOKENS.readableInk | typeof DOC_COLOR_TOKENS.white {
    return contrastRatio(background, DOC_COLOR_TOKENS.readableInk) >= contrastRatio(background, DOC_COLOR_TOKENS.white)
        ? DOC_COLOR_TOKENS.readableInk
        : DOC_COLOR_TOKENS.white;
}

function readableOn(color: string, background: string, targetContrast: number): string {
    const safe = sanitizeHostedAccent(color);
    if (hasTargetContrast(safe, background, targetContrast)) return safe;
    return readableMixedColor(safe, background, targetContrast, readableMixTarget(background));
}

function readableMixedColor(color: string, background: string, targetContrast: number, toward: string): string {
    for (let amount = 0.08; amount <= 1; amount += 0.08) {
        const mixed = mixHex(color, toward, amount);
        if (hasTargetContrast(mixed, background, targetContrast)) return mixed;
    }
    return toward;
}

function readableMixTarget(background: string): string {
    return contrastRatio(background, DOC_COLOR_TOKENS.black) > contrastRatio(background, DOC_COLOR_TOKENS.white)
        ? DOC_COLOR_TOKENS.black
        : DOC_COLOR_TOKENS.white;
}

function hasTargetContrast(color: string, background: string, targetContrast: number): boolean {
    return contrastRatio(color, background) >= targetContrast;
}

function contrastRatio(a: string, b: string): number {
    return sharedContrastRatio(a, b, sanitizeHostedAccent);
}

function mixHex(from: string, to: string, amount: number): string {
    return sharedMixHex(from, to, amount, sanitizeHostedAccent);
}

function hexToRgba(color: string, alpha: number): string {
    return sharedHexToRgba(color, alpha, sanitizeHostedAccent);
}

function browserPrefersJapanese(): boolean {
    const languages = [...(navigator.languages ?? []), navigator.language];
    return languages.some(language => language?.toLowerCase().startsWith('ja'));
}

function installHostedDocsEnhancements(): void {
    registerHostedDocsServiceWorker();
    syncLandmarks();
    installHostedLanguageToggle();
    installHostedOverflowMenu();
    installHostedSupportBanner();
    installHostedAccentSync();
    localizeHostedDocsCopy();
    scheduleHostedDocsLocalization();
    prepareHostedYomuRuntime();
    installHostedHomepageInteractions();
    if (routeSyncBound) return;
    routeSyncBound = true;
    window.addEventListener(SETTINGS_CHANGE_EVENT, syncHostedLanguageFromSettingsEvent);
    window.addEventListener(LANGUAGE_EVENT, () => {
        syncHostedLanguageToggle();
        syncHostedOverflowMenu();
        syncHostedMobileNavSettings();
        installHostedSupportBanner();
        scheduleHostedDocsLocalization({ resetReaderWords: true });
    });
    window.addEventListener('hashchange', () => window.requestAnimationFrame(() => {
        syncLandmarks();
        syncHostedLanguageToggle();
        syncHostedOverflowMenu();
        syncHostedMobileNavSettings();
        installHostedSupportBanner();
        scheduleHostedDocsLocalization();
        prepareHostedYomuRuntime();
        installHostedHomepageInteractions();
        syncHostedAccent();
    }));
    window.addEventListener('popstate', () => window.requestAnimationFrame(() => {
        syncLandmarks();
        syncHostedLanguageToggle();
        syncHostedOverflowMenu();
        syncHostedMobileNavSettings();
        installHostedSupportBanner();
        scheduleHostedDocsLocalization();
        prepareHostedYomuRuntime();
        installHostedHomepageInteractions();
        syncHostedAccent();
    }));
}

function registerHostedDocsServiceWorker(): void {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
}

function installHostedSupportBanner(): void {
    const existing = document.getElementById(YOMU_SUPPORT_BANNER_ID);
    if (existing) return;
    void loadHostedSupportStatus()
        .then(status => {
            if (!shouldShowHostedSupportBanner(status)) return;
            const banner = renderHostedSupportBanner(status);
            document.body.prepend(banner);
        })
        .catch(() => undefined);
}

async function loadHostedSupportStatus(): Promise<HostedSupportStatus> {
    let lastError: unknown;
    for (const url of [YOMU_SUPPORT_STATUS_URL, YOMU_SUPPORT_FALLBACK_STATUS_URL]) {
        try {
            return await fetchHostedSupportStatus(url);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error('Support status unavailable');
}

async function fetchHostedSupportStatus(url: string): Promise<HostedSupportStatus> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2400);
    try {
        const response = await fetch(url, {
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
        });
        if (!response.ok) throw new Error('Support status unavailable');
        return await response.json() as HostedSupportStatus;
    } finally {
        window.clearTimeout(timeout);
    }
}

function shouldShowHostedSupportBanner(status: HostedSupportStatus): boolean {
    const banner = status.banner;
    if (banner?.enabled === false) return false;
    const version = hostedSupportDismissVersion(status);
    return shouldShowHostedSupportBannerImpression(version);
}

function renderHostedSupportBanner(status: HostedSupportStatus): HTMLElement {
    const banner = document.createElement('aside');
    banner.id = YOMU_SUPPORT_BANNER_ID;
    banner.className = 'yomu-support-banner';
    banner.setAttribute('aria-label', 'Yomu service funding');
    banner.dataset.yomuSupportBanner = 'true';

    const copy = document.createElement('div');
    copy.className = 'yomu-support-banner-copy';

    const message = document.createElement('strong');
    message.textContent = hostedSupportMessage(status);
    copy.append(message);

    const meta = document.createElement('span');
    meta.textContent = hostedSupportMeta(status);
    copy.append(meta);

    const progress = renderHostedSupportProgress(status);
    if (progress) copy.append(progress);

    const actions = document.createElement('div');
    actions.className = 'yomu-support-banner-actions';

    for (const button of renderHostedSupportProviderButtons(status)) actions.append(button);

    const close = document.createElement('button');
    close.className = 'yomu-support-banner-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss support banner');
    close.textContent = '×';
    close.addEventListener('click', () => {
        rememberHostedSupportDismissal(hostedSupportDismissVersion(status));
        banner.remove();
    });
    actions.append(close);

    banner.append(copy, actions);
    return banner;
}

function renderHostedSupportProgress(status: HostedSupportStatus): HTMLElement | null {
    const ratio = hostedSupportProgressRatio(status);
    if (ratio === null) return null;
    const track = document.createElement('span');
    track.className = 'yomu-support-banner-progress';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', 'This month toward the donation goal');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    const fill = document.createElement('span');
    fill.className = 'yomu-support-banner-progress-fill';
    fill.style.width = `${Math.round(ratio * 100)}%`;
    track.append(fill);
    return track;
}

function hostedSupportProgressRatio(status: HostedSupportStatus): number | null {
    if (typeof status.progressRatio === 'number' && Number.isFinite(status.progressRatio)) {
        return Math.min(1, Math.max(0, status.progressRatio));
    }
    const goal = status.donationGoalGbp;
    const received = status.donationsThisMonthGbp ?? status.donationsTodayGbp;
    if (typeof goal === 'number' && goal > 0 && typeof received === 'number' && received >= 0) {
        return Math.min(1, received / goal);
    }
    return null;
}

function renderHostedSupportProviderButtons(status: HostedSupportStatus): HTMLElement[] {
    const buttons: HTMLElement[] = [];
    const donate = document.createElement('a');
    donate.className = 'yomu-support-banner-donate';
    donate.href = hostedSupportDonateUrl(status);
    donate.target = '_blank';
    donate.rel = 'noopener';
    donate.textContent = status.banner?.ctaLabel || 'Donate';
    buttons.push(donate);

    // Manual providers (Ko-fi/BMAC/PayPal/Patreon) render only when the Worker
    // reports an enabled https URL, so the supervised session only has to fill
    // the provider URLs to light these up.
    for (const provider of status.providers ?? []) {
        if (!provider?.enabled || provider.id === 'stripe') continue;
        const url = safeHostedHttpsUrl(provider.url);
        if (!url) continue;
        const link = document.createElement('a');
        link.className = 'yomu-support-banner-provider';
        link.dataset.provider = provider.id ?? '';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = provider.label || (provider.id ?? 'Support');
        buttons.push(link);
    }
    return buttons;
}

function safeHostedHttpsUrl(value: string | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

function hostedSupportMessage(status: HostedSupportStatus): string {
    return status.banner?.message
        || "Yomu's Ultimate Audio is donation funded. If this month's goal is missed, fast real-audio playback for words and shadowing will switch off next month.";
}

function hostedSupportMeta(status: HostedSupportStatus): string {
    const goalText = hostedSupportGoalText(status);
    const receivedText = hostedSupportReceivedText(status);
    const cost = status.banner?.costLabel || `Donation goal: ${goalText}/month`;
    const goal = status.banner?.goalLabel || `This month: ${receivedText} / ${goalText}`;
    return `${cost} · ${goal}`;
}

function hostedSupportGoalText(status: HostedSupportStatus): string {
    const display = status.display;
    if (display?.goalText) return display.goalText;
    if (display?.converted && typeof display.goal === 'number' && display.currency) {
        return formatHostedLocalCurrency(display.goal, display.currency);
    }
    return formatHostedSupportGbp(status.donationGoalGbp ?? Math.max(status.estimatedMonthlyCostGbp ?? 10, 10));
}

function hostedSupportReceivedText(status: HostedSupportStatus): string {
    const display = status.display;
    if (display?.amountText) return display.amountText;
    if (display?.converted && typeof display.amount === 'number' && display.currency) {
        return formatHostedLocalCurrency(display.amount, display.currency);
    }
    return formatHostedSupportGbp(status.donationsThisMonthGbp ?? status.donationsTodayGbp ?? 0);
}

// Client-side fallback: if the Worker could not localize (FX unavailable), or
// the caller wants the visitor's own locale formatting, use Intl.NumberFormat
// with navigator.language and the currency the Worker reported.
function formatHostedLocalCurrency(value: number, currency: string): string {
    try {
        const locale = (typeof navigator !== 'undefined' && navigator.language) || 'en-GB';
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: value % 1 === 0 ? 0 : 2,
        }).format(value);
    } catch {
        return `${value.toFixed(value % 1 === 0 ? 0 : 2)} ${currency}`;
    }
}

function hostedSupportDonateUrl(status: HostedSupportStatus): string {
    const candidate = status.banner?.donateUrl || status.donateUrl || YOMU_SUPPORT_DONATE_URL;
    try {
        const url = new URL(candidate);
        return url.protocol === 'https:' ? url.href : YOMU_SUPPORT_DONATE_URL;
    } catch {
        return YOMU_SUPPORT_DONATE_URL;
    }
}

function hostedSupportDismissVersion(status: HostedSupportStatus): string {
    return status.banner?.dismissVersion || 'ultimate-audio-monthly-v1';
}

function shouldShowHostedSupportBannerImpression(version: string): boolean {
    return shouldShowSupportBannerImpression({
        storageKey: YOMU_SUPPORT_BANNER_DISMISSED_KEY,
        version,
    });
}

function rememberHostedSupportDismissal(version: string): void {
    rememberSupportBannerDismissal({
        storageKey: YOMU_SUPPORT_BANNER_DISMISSED_KEY,
        version,
    });
}

function formatHostedSupportGbp(value: number): string {
    return `£${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

function syncHostedLanguageFromSettingsEvent(event: Event): void {
    const change = settingsFromChangeEvent(event);
    if (!change) return;
    if (!hostedInterfaceLanguagePreferenceFromValue(change.settings.interfaceLanguage)) return;
    rememberHostedSettingsChange(change.settings, !change.preview);
    syncHostedLanguageToggle();
    syncHostedOverflowMenu();
    syncHostedMobileNavSettings();
    scheduleHostedDocsLocalization({ resetReaderWords: true });
}

// Homepage-only progressive enhancements: scroll reveals and the click-to-play
// homepage reveal sections.
// All are idempotent (guarded by data flags) so they survive route re-runs.
function installHostedHomepageInteractions(): void {
    armHostedRevealElements();
    bindHostedYouTubeLiteEmbeds();
    bindHostedDemoVideos();
}

function bindHostedDemoVideos(): void {
    document.querySelectorAll<HTMLVideoElement>('.yomu-demo-video:not([data-yomu-demo-video-bound])').forEach(video => {
        video.dataset.yomuDemoVideoBound = 'true';
        if (video.controls) return;
        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        let userPaused = false;
        const toggle = () => {
            if (video.paused) {
                userPaused = false;
                video.play().catch(() => {});
                return;
            }
            userPaused = true;
            video.pause();
        };
        video.addEventListener('click', toggle);
        video.addEventListener('keydown', event => {
            if (event.key !== ' ' && event.key !== 'Enter') return;
            event.preventDefault();
            toggle();
        });
        const syncMotionPreference = () => {
            if (!motionQuery.matches) {
                if (!userPaused) video.play().catch(() => {});
                return;
            }
            video.pause();
            video.removeAttribute('autoplay');
        };
        syncMotionPreference();
        motionQuery.addEventListener?.('change', syncMotionPreference);
    });
}

function bindHostedYouTubeLiteEmbeds(): void {
    document.querySelectorAll<HTMLButtonElement>('.yomu-youtube-lite:not([data-yomu-youtube-bound])').forEach(button => {
        button.dataset.yomuYoutubeBound = 'true';
        button.addEventListener('click', () => playHostedYouTubeLiteEmbed(button));
    });
}

const HOSTED_YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function playHostedYouTubeLiteEmbed(button: HTMLButtonElement): void {
    const id = readHostedYouTubeVideoId(button);
    if (!id) return;
    const title = readHostedYouTubeTitle(button);
    const frame = document.createElement('iframe');
    frame.className = 'yomu-youtube-embed';
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?cc_load_policy=1&cc_lang_pref=ja&playsinline=1&rel=0&modestbranding=1`;
    frame.title = title;
    frame.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';

    button.replaceWith(frame);
    frame.focus();
}

function readHostedYouTubeVideoId(button: HTMLButtonElement): string | null {
    const id = button.dataset.yomuYoutubeId;
    if (!id) return null;
    if (!HOSTED_YOUTUBE_VIDEO_ID_PATTERN.test(id)) return null;
    return id;
}

function readHostedYouTubeTitle(button: HTMLButtonElement): string {
    const title = button.dataset.yomuYoutubeTitle;
    if (title) return translateHostedDocsString(title, effectiveInterfaceLanguage());
    const label = button.getAttribute('aria-label');
    if (label) return translateHostedDocsString(label, effectiveInterfaceLanguage());
    return translateHostedDocsString('YouTube video', effectiveInterfaceLanguage());
}

function armHostedRevealElements(): void {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.yomu-reveal:not([data-yomu-revealed])'));
    if (!elements.length) return;
    const reveal = (element: HTMLElement): void => {
        element.dataset.yomuRevealed = 'true';
        delete element.dataset.yomuRevealReady;
        element.classList.add('is-in');
    };
    if (typeof IntersectionObserver !== 'function') {
        elements.forEach(reveal);
        return;
    }
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            reveal(entry.target as HTMLElement);
            obs.unobserve(entry.target);
        });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    elements.forEach(element => {
        element.dataset.yomuRevealReady = 'true';
        observer.observe(element);
    });
    // Failsafe: never leave a section permanently hidden if the observer never fires.
    window.setTimeout(() => elements.forEach(element => {
        if (!element.dataset.yomuRevealed) reveal(element);
    }), 2200);
}

function prepareHostedYomuRuntime(): void {
    const forceLocalRuntime = isLocalHostedRuntime();
    prepareHostedMangaOcrDemo();
    if (shouldLoadHostedRuntimeCompanionsBeforeCore()) appendHostedRuntimeCompanionScripts(forceLocalRuntime);
    if (isHostedYomuRuntimeLoadingOrReady(forceLocalRuntime)) return;
    // The settings companion loads on the settings warm path; normal docs pages
    // should not download every companion before the reader is needed.
    const targets = findHostedYomuRuntimeTargets();
    if (!targets.length) {
        clearHostedYomuRuntimeIntent();
        return;
    }
    bindHostedYomuRuntimeIntent(targets);
    // Demo pages preload yomu.user.js in <head>, so the bytes are already on
    // disk; executing on idle makes the first hover over the Try-me sample and
    // the demo captions open the popover immediately instead of waiting for a
    // pointer to cross a demo surface before the runtime even starts booting.
    if (targets.some(target => target.matches('[data-yomu-runtime-surface], .yomu-try-me-text'))) {
        scheduleIdleHostedYomuRuntimeLoad();
    }
    window.requestAnimationFrame(() => {
        if (hostedRuntimeIntentTargets === targets && targets.some(isElementNearViewport)) loadHostedYomuRuntime();
    });
}

function scheduleIdleHostedYomuRuntimeLoad(): void {
    const load = () => { if (hostedRuntimeIntentTargets) loadHostedYomuRuntime(); };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(load, { timeout: 2500 });
    else window.setTimeout(load, 350);
}

function findHostedYomuRuntimeTargets(): HTMLElement[] {
    const explicit = Array.from(document.querySelectorAll<HTMLElement>('[data-yomu-runtime-surface], .yomu-try-me-text'));
    if (explicit.length) return explicit;
    const fallback = Array.from(document.querySelectorAll<HTMLElement>(HOSTED_RUNTIME_TARGET_SELECTOR))
        .find(element => !element.closest('.VPContent.is-home') && HOSTED_JAPANESE_TEXT_RE.test(element.textContent ?? ''));
    return fallback ? [fallback] : [];
}

function bindHostedYomuRuntimeIntent(targets: HTMLElement[]): void {
    if (hostedRuntimeIntentTargets
        && hostedRuntimeIntentController
        && targets.length === hostedRuntimeIntentTargets.length
        && targets.every((target, index) => hostedRuntimeIntentTargets?.[index] === target)) {
        hostedRuntimeIntentTargets = targets;
        return;
    }
    clearHostedYomuRuntimeIntent();
    const controller = new AbortController();
    hostedRuntimeIntentController = controller;
    hostedRuntimeIntentTargets = targets;
    const options = { passive: true, once: true, signal: controller.signal };
    const load = () => loadHostedYomuRuntime();
    for (const target of targets) {
        target.addEventListener('pointerenter', load, options);
        target.addEventListener('pointerdown', load, options);
        target.addEventListener('touchstart', load, options);
        target.addEventListener('focusin', load, { once: true, signal: controller.signal });
    }
    window.addEventListener('scroll', () => {
        if (targets.some(isElementNearViewport)) loadHostedYomuRuntime();
    }, { passive: true, signal: controller.signal });
}

function isElementNearViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const height = window.innerHeight || document.documentElement.clientHeight;
    return rect.top <= height + HOSTED_RUNTIME_SCROLL_MARGIN_PX && rect.bottom >= -HOSTED_RUNTIME_SCROLL_MARGIN_PX;
}

function loadHostedYomuRuntime(): HTMLScriptElement | undefined {
    clearHostedYomuRuntimeIntent();
    return installHostedYomuRuntime() ?? hostedRuntimeScript() ?? undefined;
}

function clearHostedYomuRuntimeIntent(): void {
    hostedRuntimeIntentController?.abort();
    hostedRuntimeIntentController = undefined;
    hostedRuntimeIntentTargets = undefined;
}

function isHostedYomuRuntimeLoadingOrReady(forceLocalRuntime = false): boolean {
    if (hostedRuntimeScript()) return true;
    if (forceLocalRuntime) return false;
    return Boolean(hostedYomuRuntimeWindow().__yomuReaderAppInitialized);
}

function installHostedYomuRuntime(): HTMLScriptElement | undefined {
    const runtime = hostedYomuRuntimeWindow();
    const forceLocalRuntime = isLocalHostedRuntime();
    const currentScript = hostedRuntimeScript();
    const companionFirst = shouldLoadHostedRuntimeCompanionsBeforeCore();
    prepareLocalHostedRuntime(forceLocalRuntime);
    if (shouldSkipHostedRuntimeInstall(runtime, forceLocalRuntime, currentScript)) return undefined;
    prepareHostedDemoVideoSettings();
    enableLocalHostedRuntime(runtime, forceLocalRuntime);
    if (companionFirst) appendHostedRuntimeCompanionScripts(forceLocalRuntime);
    const script = appendHostedRuntimeScript(YOMU_HOSTED_RUNTIME_SCRIPT_ID, hostedRuntimeScriptSrc(forceLocalRuntime));
    if (!companionFirst) appendHostedSettingsCompanionAfterCoreLoad(script, forceLocalRuntime);
    return script;
}

function prepareHostedDemoVideoSettings(): void {
    if (!document.querySelector('[data-yomu-demo-player]')) return;
    writeStoredSettingsPatch(HOSTED_DEMO_VIDEO_SETTINGS_PATCH);
}

function prepareHostedMangaOcrDemo(): void {
    const image = document.querySelector<HTMLImageElement>('.yomu-manga-image[src*="manga-ocr-sample"]');
    if (!image) return;
    image.dataset.ocrVocabulary = JSON.stringify(HOSTED_MANGA_OCR_VOCABULARY);
    image.dataset.ocrLines = JSON.stringify(HOSTED_MANGA_OCR_LINES);
}

function hostedYomuRuntimeWindow(): HostedYomuRuntimeWindow {
    return window as HostedYomuRuntimeWindow;
}

function hostedRuntimeScript(): HTMLScriptElement | null {
    const element = document.getElementById(YOMU_HOSTED_RUNTIME_SCRIPT_ID);
    return element instanceof HTMLScriptElement ? element : null;
}

function prepareLocalHostedRuntime(forceLocalRuntime: boolean): void {
    if (!forceLocalRuntime) return;
    clearLocalHostedRuntimeCaches();
    document.getElementById(LEGACY_YOMU_HOSTED_RUNTIME_SCRIPT_ID)?.remove();
}

function shouldSkipHostedRuntimeInstall(
    runtime: HostedYomuRuntimeWindow,
    forceLocalRuntime: boolean,
    currentScript: HTMLElement | null,
): boolean {
    if (currentScript) return true;
    return shouldKeepInitializedHostedRuntime(runtime, forceLocalRuntime, currentScript);
}

function shouldKeepInitializedHostedRuntime(
    runtime: HostedYomuRuntimeWindow,
    forceLocalRuntime: boolean,
    currentScript: HTMLElement | null,
): boolean {
    if (!runtime.__yomuReaderAppInitialized) return false;
    if (forceLocalRuntime) return Boolean(currentScript);
    return true;
}

function enableLocalHostedRuntime(runtime: HostedYomuRuntimeWindow, forceLocalRuntime: boolean): void {
    if (forceLocalRuntime) runtime.__yomuDevRuntime = true;
}

function shouldLoadHostedRuntimeCompanionsBeforeCore(): boolean {
    return location.pathname.includes('/video-player/') || Boolean(document.querySelector('[data-yomu-video-frame]'));
}

function appendHostedSettingsCompanionAfterCoreLoad(script: HTMLScriptElement, forceLocalRuntime: boolean): void {
    const append = () => appendHostedSettingsCompanionScript(forceLocalRuntime);
    if (isHostedScriptReady(script)) {
        append();
        return;
    }
    script.addEventListener('load', append, { once: true });
}

function appendHostedRuntimeCompanionScripts(forceLocalRuntime: boolean): HTMLScriptElement[] {
    return hostedRuntimeCompanionScripts(forceLocalRuntime).map(appendHostedRuntimeCompanionScript);
}

function appendHostedSettingsCompanionScript(forceLocalRuntime: boolean): HTMLScriptElement {
    return appendHostedRuntimeCompanionScript(hostedSettingsCompanionScript(forceLocalRuntime));
}

function appendHostedRuntimeCompanionScript(script: { id: string; src: string }): HTMLScriptElement {
    return appendHostedRuntimeScript(script.id, script.src);
}

function hostedRuntimeCompanionScripts(forceLocalRuntime: boolean): Array<{ id: string; src: string }> {
    return [
        hostedSettingsCompanionScript(forceLocalRuntime),
        {
            id: YOMU_HOSTED_VIDEO_COMPANION_SCRIPT_ID,
            src: hostedRuntimeAssetSrc('/greasyfork/yomu-video.user.js', forceLocalRuntime),
        },
        {
            id: YOMU_HOSTED_OCR_MANGA_COMPANION_SCRIPT_ID,
            src: hostedRuntimeAssetSrc('/greasyfork/yomu-ocr-manga.user.js', forceLocalRuntime),
        },
        {
            id: YOMU_HOSTED_UI_COPY_COMPANION_SCRIPT_ID,
            src: hostedRuntimeAssetSrc('/greasyfork/yomu-ui-copy.user.js', forceLocalRuntime),
        },
    ];
}

function hostedSettingsCompanionScript(forceLocalRuntime: boolean): { id: string; src: string } {
    return {
        id: YOMU_HOSTED_SETTINGS_COMPANION_SCRIPT_ID,
        src: hostedRuntimeAssetSrc('/greasyfork/yomu-settings-surface.user.js', forceLocalRuntime),
    };
}

function appendHostedRuntimeScript(id: string, src: string): HTMLScriptElement {
    const existing = document.getElementById(id);
    if (existing instanceof HTMLScriptElement) return existing;
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    script.dataset.yomuHostedRuntimeState = 'loading';
    script.addEventListener('load', () => { script.dataset.yomuHostedRuntimeState = 'loaded'; }, { once: true });
    script.addEventListener('error', () => { script.dataset.yomuHostedRuntimeState = 'error'; }, { once: true });
    document.head.append(script);
    return script;
}

function isHostedRuntimeScriptElement(value: HTMLScriptElement | undefined): value is HTMLScriptElement {
    return value instanceof HTMLScriptElement;
}

function isHostedScriptReady(script: HTMLScriptElement): boolean {
    return script.dataset.yomuHostedRuntimeState === 'loaded' || script.dataset.yomuHostedRuntimeState === 'error';
}

function onHostedScriptsReady(scripts: HTMLScriptElement[], callback: () => void): void {
    const pending = scripts.filter(script => !isHostedScriptReady(script));
    if (!pending.length) {
        callback();
        return;
    }
    let remaining = pending.length;
    let done = false;
    const markReady = () => {
        if (done) return;
        remaining -= 1;
        if (remaining > 0) return;
        done = true;
        callback();
    };
    pending.forEach(script => {
        script.addEventListener('load', markReady, { once: true });
        script.addEventListener('error', markReady, { once: true });
    });
}

function hostedRuntimeScriptSrc(forceLocalRuntime: boolean): string {
    return hostedRuntimeAssetSrc('/yomu.user.js', forceLocalRuntime);
}

function hostedRuntimeAssetSrc(src: string, forceLocalRuntime: boolean): string {
    if (!forceLocalRuntime) return src;
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}t=${Date.now()}`;
}

function isLocalHostedRuntime(): boolean {
    return LOCAL_HOSTS.has(location.hostname);
}

function clearLocalHostedRuntimeCaches(): void {
    if (localRuntimeCacheCleanupStarted) return;
    localRuntimeCacheCleanupStarted = true;
    if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistrations()
            .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
            .catch(() => undefined);
    }
    if ('caches' in window) {
        void caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key.startsWith('yomu-') || key.includes('yomu-reader'))
                .map(key => caches.delete(key))))
            .catch(() => undefined);
    }
}

const YomuLayout = defineComponent({
    name: 'YomuLayout',
    setup(_, { slots }) {
        const { isDark } = useData();
        installHostedAppearanceProvider();
        onMounted(() => {
            installHostedThemeSync(isDark);
            installHostedDocsEnhancements();
        });
        return () => h(DefaultTheme.Layout, null, slots);
    },
});

export default {
    ...DefaultTheme,
    Layout: YomuLayout,
    enhanceApp(ctx) {
        DefaultTheme.enhanceApp?.(ctx);
    },
} satisfies Theme;
