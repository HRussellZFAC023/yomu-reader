import DefaultTheme from 'vitepress/theme-without-fonts';
import { useData, type Theme } from 'vitepress';
import { defineComponent, h, onMounted, provide, type Ref } from 'vue';
import {
    sharedContrastRatio,
    sharedHexToRgba,
    sharedMixHex,
} from '../../../src/reader/core/color-math';
import './custom.css';

type InterfaceLanguage = 'en' | 'ja';
type HostedThemePreference = 'auto' | 'dark' | 'light';
type HostedSettingsChangeDetail = { preview?: unknown; settings?: { theme?: unknown } };
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
const LEGACY_YOMU_HOSTED_RUNTIME_SCRIPT_ID = 'yomu-hosted-demo-runtime';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const HOSTED_DOCS_TRANSLATION_LEAF_SELECTOR = 'h1, h2, h3, h4, p, li, a, button, span, strong, small, figcaption, dt, dd, th, td, summary, label';
const DEFAULT_ACCENT_COLOR = '#5ea780';
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
const HOSTED_RUNTIME_TARGET_SELECTOR = [
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
let themeClassObserver: MutationObserver | undefined;
let hostedRuntimeIntentController: AbortController | undefined;
let hostedRuntimeIntentTarget: HTMLElement | undefined;
let routeSyncBound = false;
let localRuntimeCacheCleanupStarted = false;

const HOSTED_OVERFLOW_LINKS = [
    { text: 'Video Player', href: '/yomu-reader/video-player/index.html', target: '_self' },
    { text: 'Local Audio', href: '/yomu-reader/local-audio' },
    { text: 'Stats', href: '/yomu-reader/newtab/index.html?mode=stats', target: '_self' },
    { text: 'Changelog', href: '/yomu-reader/changelog' },
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

const HOSTED_DOCS_JA_COPY: Record<string, string> = {
    'Skip to content': '本文へスキップ',
    'Search': '検索',
    'Main Navigation': 'メインナビゲーション',
    'Start': '始める',
    'Overview': '概要',
    'Getting Started': '使い始める',
    'Features': '機能',
    'Study': '学習',
    'New Tab': '新しいタブ',
    'More': 'その他',
    'Menu': 'メニュー',
    'Settings': '設定',
    'Open settings': '設定を開く',
    'Video Player': '動画プレイヤー',
    'Local Audio': 'ローカル音声',
    'Support': 'サポート',
    'Stats': '統計',
    'Changelog': '変更履歴',
    'Project': 'プロジェクト',
    'Free Japanese lookup and mining for the web': 'Webで使える無料の日本語ルックアップとマイニング',
    'Tap or hover Japanese text, read manga images, mine subtitles, import dictionaries, and save study cards without paying for a full study suite.': '日本語テキストをタップまたはホバーし、漫画画像を読み取り、字幕から採掘し、辞書をインポートし、学習カードを保存できます。',
    'Install よむ': 'よむをインストール',
    'Setup Guide': 'セットアップガイド',
    'Open Study App': '学習アプリを開く',
    'Install in minutes': '数分でインストール',
    'Add Tampermonkey or Userscripts, open the よむ install link, then refresh a Japanese page and tap a word.': 'TampermonkeyまたはUserscriptsを追加し、よむのインストールリンクを開いて、日本語ページを更新したら単語をタップします。',
    'Study from real material': '実際の素材で学習',
    'Look up words on websites, manga images, subtitles, JPDB pages, and example sentences. Add Yomitan dictionaries, JPDB, or Anki when you want more study tools.': 'Webサイト、漫画画像、字幕、JPDBページ、例文から単語を調べられます。必要に応じてYomitan辞書、JPDB、Ankiを追加できます。',
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
    'Add manager': '管理拡張を追加',
    'Refresh page': 'ページを更新',
    'What It Does': 'できること',
    'よむ runs inside your browser. Point it at Japanese text, subtitles, or manga images and it opens a clean popup with readings, meanings, kanji details, examples, audio, and mining actions.': 'よむはブラウザー内で動きます。日本語テキスト、字幕、漫画画像に向けると、読み、意味、漢字詳細、例文、音声、マイニング操作を備えた見やすいポップアップを開きます。',
    'Start with simple popup lookup. Later, add JPDB for review status, import Yomitan dictionary files for local definitions, or connect Anki when you want flashcards.': 'まずはシンプルなポップアップ検索から始められます。あとからJPDBの復習ステータス、Yomitan辞書のローカル定義、Anki連携を追加できます。',
    'Try me': '試してみる',
    'Popup lookup with live JPDB data and mining controls.': 'ライブJPDBデータとマイニング操作つきのポップアップ検索。',
    'Kanji drilldown with live KanjiVG stroke data.': 'ライブKanjiVG筆順データつきの漢字ドリルダウン。',
    'Next Steps': '次のステップ',
    'Set up よむ': 'よむをセットアップ',
    'Install a userscript manager, add よむ, and try your first lookup.': 'ユーザースクリプト管理拡張を入れ、よむを追加して、最初の検索を試します。',
    'See the tools': 'ツールを見る',
    'Lookup, OCR, subtitles, kanji pages, JPDB, dictionaries, and Anki.': '検索、OCR、字幕、漢字ページ、JPDB、辞書、Anki。',
    'Open study app': '学習アプリを開く',
    'Review JPDB, Anki, or imported dictionary cards from the hosted app.': 'ホスト版アプリでJPDB、Anki、インポート辞書カードを復習します。',
    'Open video player': '動画プレイヤーを開く',
    'Use local browser-supported videos and subtitle files with よむ lookup.': 'ブラウザー対応のローカル動画と字幕ファイルでよむ検索を使えます。',
    'Add audio': '音声を追加',
    'Use hosted Yomitan audio first, or self-host files when you need them.': 'まずはホスト版Yomitan音声を使い、必要なら音声ファイルを自分で配信できます。',
    'Get support': 'サポートを受ける',
    'Report a bug, join Discord, donate, or reinstall the userscript.': 'バグ報告、Discord参加、寄付、ユーザースクリプト再インストールができます。',
    'Free userscript now. Chrome, Firefox, and Safari packages are being prepared for store submission.': '現在は無料ユーザースクリプト版です。Chrome、Firefox、Safari版はストア提出準備中です。',
    'Released under the GPL-3.0-or-later license.': 'GPL-3.0-or-laterライセンスで公開されています。',
    'A free JPDB and Yomitan popup reader for Japanese text, manga, video subtitles, and mining.': '日本語テキスト、漫画、動画字幕、マイニング向けの無料JPDB/Yomitanポップアップリーダー。',
    'Learn Japanese by reading what you actually like': '好きなものを読んで日本語を学ぶ',
    'Tap a word anywhere, understand it in context, save it for review, and keep reading. よむ turns real Japanese pages, manga, subtitles, and study sites into one connected immersion system.': 'どこでも単語をタップし、文脈で理解し、復習用に保存して、そのまま読み続けられます。よむは実際の日本語ページ、漫画、字幕、学習サイトを1つのつながった没入システムにします。',
    'Read first': 'まず読む',
    'Extensive reading works because you meet vocabulary and grammar repeatedly in meaningful context. よむ removes just enough friction that you can stay inside the story.': '多読が効くのは、意味のある文脈の中で語彙や文法に何度も出会えるからです。よむは物語の中に留まれるだけの摩擦を取り除きます。',
    'Bring every tool': '必要なツールをまとめて',
    'JPDB status and mining, Yomitan dictionaries, Anki cards, audio, example sentences, OCR, and subtitles all work from the same popup.': 'JPDBのステータスとマイニング、Yomitan辞書、Ankiカード、音声、例文、OCR、字幕を同じポップアップから使えます。',
    'Start anywhere': 'どこからでも始める',
    'Begin with graded readers and easy news, then move into Satori, ebooks, manga, YouTube, web novels, and native sites as your known words grow.': 'まずは graded readers ややさしいニュースから始め、知っている単語が増えたら Satori、電子書籍、漫画、YouTube、Web小説、ネイティブ向けサイトへ進めます。',
    'The method is simple: read material you can mostly follow, look up only what keeps you moving, and let useful words come back later in reviews. This is the same idea behind graded readers, comprehensible input, and i+1 sentences: new Japanese sticks faster when it is attached to a scene, a sentence, and a reason you cared enough to read it.': 'やり方はシンプルです。だいたい理解できる素材を読み、読み進めるために必要なものだけ調べ、役に立つ単語はあとで復習に戻します。これは graded readers、理解可能なインプット、i+1文と同じ考え方です。新しい日本語は、場面、文、そして読みたいと思った理由と結びつくほど定着しやすくなります。',
    'よむ gives you the superset of the usual Japanese reading stack. Use JPDB for mining and global word status, import Yomitan dictionaries for local definitions, connect Anki when you want your own cards, pull example sentences from Immersion Kit or Nadeshiko, play audio, trace kanji, OCR manga panels, and mine subtitles from video. You do not have to choose one ecosystem before you start reading.': 'よむは一般的な日本語リーディング環境をまとめて扱える上位セットです。JPDBでマイニングと全体の単語ステータスを管理し、Yomitan辞書をインポートしてローカル定義を使い、自分のカードが欲しいときはAnkiに接続できます。Immersion KitやNadeshikoから例文を取り込み、音声を再生し、漢字をなぞり、漫画コマをOCRし、動画字幕からマイニングできます。読み始める前に、どれか1つのエコシステムを選ぶ必要はありません。',
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
    '4. Add JPDB, Or Skip It For Now': '4. JPDBを追加する、または今はスキップ',
    'JPDB is optional for basic local dictionary lookup, but it is the easiest way to get word status and mining.': '基本的なローカル辞書検索にJPDBは必須ではありませんが、単語ステータスとマイニングを使うにはいちばん簡単です。',
    'Create or open your': '自分の',
    'JPDB account': 'JPDBアカウント',
    'JPDB settings': 'JPDB設定',
    'Copy your API key from the API section.': 'APIセクションからAPIキーをコピーします。',
    'Open よむ settings with the floating よむ button or the shortcut Alt+Shift+J.': 'フローティングのよむボタン、またはショートカットAlt+Shift+Jでよむ設定を開きます。',
    'Paste the key into the API key field.': 'API key欄にキーを貼り付けます。',
    'Save.': '保存します。',
    'You can use よむ without a JPDB key by importing Yomitan dictionaries from Settings > Dictionaries. JPDB-only actions such as mining to JPDB still need a JPDB API key.': 'Settings > DictionariesからYomitan辞書をインポートすれば、JPDBキーなしでもよむを使えます。JPDBへのマイニングなど、JPDB専用の操作には引き続きJPDB APIキーが必要です。',
    '5. Pick A First Reading Site': '5. 最初に読むサイトを選ぶ',
    'Good よむ sites have selectable Japanese text, interesting short pieces, or images/subtitles that become readable with よむ OCR and subtitle tools. The goal is not to finish the hardest thing you can find. The goal is to read every day at the edge of comfort, where most sentences make sense and the unknown words are worth saving.': 'よむに向いたサイトは、選択できる日本語テキスト、短くて面白い文章、またはよむのOCRや字幕ツールで読める画像・字幕があるサイトです。目的は、見つけた中でいちばん難しいものを読み切ることではありません。多くの文が理解でき、未知語を保存する価値があるくらいの、少し背伸びした素材を毎日読むことです。',
    'These are strong starting points, based on recurring recommendations from r/LearnJapanese reading threads and the sites that work well with popup lookup:': 'r/LearnJapaneseの読書スレッドで繰り返しおすすめされているものや、ポップアップ検索と相性の良いサイトをもとにした、始めやすい候補です:',
    'Tadoku free books': 'Tadoku無料本',
    'Free graded readers from starter level upward. Best first stop when native sites still feel too dense.': '入門レベルから読める無料graded readersです。ネイティブ向けサイトがまだ密度高く感じるときの最初の一歩に向いています。',
    'NHK News Web Easy': 'NHK News Web Easy',
    'Short simplified news with furigana and audio. Great daily habit once basic grammar is in place.': 'ふりがなと音声つきの短いやさしいニュースです。基本文法が身についた後の日課に向いています。',
    'Satori Reader': 'Satori Reader',
    'Polished learner stories with notes and audio. よむ adds your normal JPDB, Yomitan, and Anki flow on top.': '注釈と音声つきの洗練された学習者向けストーリーです。よむを重ねると、いつものJPDB、Yomitan、Ankiフローも使えます。',
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
    'Open a Japanese article, manga page, JPDB page, or video page.': '日本語の記事、漫画ページ、JPDBページ、または動画ページを開きます。',
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
    'iPhone, iPad, and Android browsers can run よむ through a userscript app, but local desktop bridges are different there. JPDB lookup, local dictionaries, OCR, subtitle taps, the hosted video player, the new-tab study page, and mobile Anki handoff are the friendly mobile paths. Direct AnkiConnect and localhost audio helpers still need a desktop computer that is reachable from the device, for example on the same Wi-Fi or through Tailscale.': 'iPhone、iPad、Androidブラウザーでは、ユーザースクリプトアプリ経由でよむを実行できます。ただし、ローカルのデスクトップブリッジは扱いが異なります。JPDB検索、ローカル辞書、OCR、字幕タップ、ホスト版動画プレイヤー、新しいタブ学習ページ、モバイルAnki受け渡しが使いやすいモバイル経路です。直接のAnkiConnectやlocalhost音声ヘルパーには、同じWi-FiやTailscaleなどで端末から到達できるデスクトップコンピューターが必要です。',
    'Mobile Anki handoff is one-way: it opens AnkiMobile or AnkiDroid so you can create a new note. It does not read your existing collection, show existing-card status, update old notes, scan decks, discover field mappings, or provide Anki review queues. Saved mappings can still shape AnkiMobile add-note links; use desktop Anki with AnkiConnect for discovery, updates, status, and reviews.': 'モバイルAnki受け渡しは一方向です。AnkiMobileまたはAnkiDroidを開き、新規ノートを作成できるようにします。既存コレクションの読み取り、既存カード状態の表示、既存ノートの更新、デッキスキャン、フィールド対応付けの検出、Anki復習キューの提供はできません。保存済み対応付けはAnkiMobile追加リンクの形には反映できますが、検出、更新、状態、復習にはデスクトップAnkiとAnkiConnectを使ってください。',
    "Localhost on a phone or tablet means that device, not your desktop. If you run AnkiConnect, a local audio server, or OCR on a computer, use that computer's LAN/Tailscale address in よむ settings. Mobile browsers can also block autoplay and protected/cross-origin video capture, so subtitle lookup, copying, JPDB mining, and dictionary fallback remain the reliable mobile path.": 'スマートフォンやタブレットでのlocalhostは、その端末自身を指し、デスクトップPCではありません。AnkiConnect、ローカル音声サーバー、OCRをコンピューターで動かす場合は、そのコンピューターのLAN/Tailscaleアドレスをよむ設定で使ってください。モバイルブラウザーは自動再生や保護された動画・クロスオリジン動画のキャプチャをブロックすることもあるため、字幕検索、コピー、JPDBマイニング、辞書フォールバックがモバイルで信頼できる経路です。',
    'If a setup step mentions leaving a terminal window or local server running, treat it as optional power-user setup. The hosted audio path, JPDB mining, imported dictionaries, and the new-tab page are simpler on mobile.': '設定手順でターミナルウィンドウやローカルサーバーを動かしたままにする説明が出てきた場合、それは任意の上級者向け設定と考えてください。モバイルでは、ホスト版音声、JPDBマイニング、インポート辞書、新しいタブページの方が簡単です。',
    '9. Back Up Settings': '9. 設定をバックアップ',
    'After setup, go to Settings > Dictionaries and use Export settings JSON. This gives you a small backup file you can import on another browser later.': 'セットアップ後、Settings > Dictionariesに移動し、Export settings JSONを使います。後で別のブラウザーにインポートできる小さなバックアップファイルが作成されます。',
    'If Something Does Not Work': 'うまく動かない場合',
    'The most common fixes are enabling the userscript manager for the current site, refreshing the page after changing settings, checking that a JPDB key was pasted correctly, and remembering that': 'よくある解決策は、現在のサイトでユーザースクリプト管理拡張を有効にすること、設定変更後にページを更新すること、JPDBキーが正しく貼り付けられているか確認すること、そして',
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
    if (!content) return;
    if (content.querySelector('main')) {
        content.removeAttribute('role');
        return;
    }
    content.setAttribute('role', 'main');
}

function installHostedLanguageToggle() {
    syncHostedLanguageToggle();
    if (languageToggleObserver) return;
    languageToggleObserver = new MutationObserver(() => {
        syncHostedLanguageToggle();
        syncHostedOverflowMenu();
        syncHostedMobileNavSettings();
        localizeHostedDocsCopy();
        syncHostedAccent();
    });
    languageToggleObserver.observe(document.body, { childList: true, subtree: true });
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

function openHostedSettings(): void {
    loadHostedYomuRuntime();
    const dispatch = () => {
        if (document.querySelector('.jpdb-reader-settings')) return true;
        window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { panel: 'basics' } }));
        return Boolean(document.querySelector('.jpdb-reader-settings'));
    };
    dispatch();
    [120, 360, 900].forEach(delay => window.setTimeout(dispatch, delay));
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
    return readStoredSettings().interfaceLanguage;
}

function saveInterfaceLanguage(language: InterfaceLanguage): void {
    const settings = readStoredSettings();
    settings.interfaceLanguage = language;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: { language } }));
}

function localizeHostedDocsCopy(options: { resetReaderWords?: boolean } = {}): void {
    const language = effectiveInterfaceLanguage();
    document.documentElement.setAttribute('lang', language);
    if (options.resetReaderWords) unwrapHostedDocsReaderWords();
    localizeHostedStructuredDocsCopy(document.body, language);
    restoreHostedDocsLeafCopy(document.body, language);
    translateTextNodes(document.body, language);
    translateAttributes(document.body, language);
}

function scheduleHostedDocsLocalization(options: { resetReaderWords?: boolean } = {}): void {
    window.requestAnimationFrame(() => {
        localizeHostedDocsCopy(options);
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
    const original = originals.get(attribute) ?? value;
    originals.set(attribute, original);
    element.setAttribute(attribute, translateHostedDocsString(original, language));
}

function hostedAttributeOriginals(element: HTMLElement): Map<string, string> {
    const current = attrOriginals.get(element);
    if (current) return current;
    const next = new Map<string, string>();
    attrOriginals.set(element, next);
    return next;
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
    return Boolean(element.closest('script, style, pre, code, kbd, samp, textarea, input, [data-jpdb-reader-root], .jpdb-reader-word, .jpdb-reader-furigana, .jpdb-reader-ruby, .jpdb-ocr-layer, .jpdb-ocr-line'));
}

function unwrapHostedDocsReaderWords(): void {
    const parents = new Set<ParentNode>();
    document.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach(word => {
        if (word.closest('[data-jpdb-reader-root]')) return;
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
        const change = settingsThemeFromEvent(event);
        if (!change) return;
        if (!change.preview) writeStoredThemePreference(change.theme);
        syncHostedThemeFromSettings(change.theme);
    });
    window.addEventListener('storage', event => {
        if (event.key === SETTINGS_STORAGE_KEY || event.key === null) syncHostedThemeFromSettings();
    });
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (readStoredThemePreference() === 'auto') syncHostedThemeFromSettings();
    });
}

function installHostedAppearanceProvider(isDark: Ref<boolean>): void {
    provide('toggle-appearance', () => {
        setHostedThemePreference(isDark.value ? 'light' : 'dark');
    });
}

function setHostedThemePreference(theme: HostedThemePreference): void {
    const settings = writeStoredThemePreference(theme);
    syncHostedThemeFromSettings(theme);
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { settings } }));
}

function writeStoredThemePreference(theme: HostedThemePreference): Record<string, any> {
    const settings = readStoredSettings();
    settings.theme = theme;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return settings;
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

function settingsThemeFromEvent(event: Event): { theme: HostedThemePreference; preview: boolean } | undefined {
    const detail = hostedSettingsChangeDetail(event);
    const theme = hostedThemePreferenceFromValue(detail.settings?.theme);
    if (!theme) return undefined;
    return { theme, preview: detail.preview === true };
}

function hostedSettingsChangeDetail(event: Event): HostedSettingsChangeDetail {
    return (event as CustomEvent<HostedSettingsChangeDetail>).detail ?? {};
}

function readStoredThemePreference(): HostedThemePreference {
    return normalizeHostedThemePreference(readStoredSettings().theme);
}

function normalizeHostedThemePreference(value: unknown, fallback: HostedThemePreference | undefined = 'auto'): HostedThemePreference {
    return hostedThemePreferenceFromValue(value) ?? fallback ?? 'auto';
}

function hostedThemePreferenceFromValue(value: unknown): HostedThemePreference | undefined {
    return typeof value === 'string' && HOSTED_THEME_PREFERENCES.has(value as HostedThemePreference)
        ? value as HostedThemePreference
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
        if (event.key === SETTINGS_STORAGE_KEY || event.key === null) syncHostedAccent();
    });
    themeClassObserver = new MutationObserver(syncHostedAccent);
    themeClassObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

function syncHostedAccent(): void {
    const accent = sanitizeHostedAccent(readStoredSettings().accentColor);
    const root = document.documentElement;
    const dark = root.classList.contains('dark');
    const pageBackground = dark ? DOC_COLOR_TOKENS.pageBgDark : DOC_COLOR_TOKENS.pageBgLight;
    const brandReadable = readableOn(accent, pageBackground, 4.5);
    const brandHover = readableOn(mixHex(accent, dark ? DOC_COLOR_TOKENS.white : DOC_COLOR_TOKENS.black, 0.18), pageBackground, 3.5);
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
    root.style.setProperty('--vp-button-brand-active-text', accentText);
    root.style.setProperty('--vp-home-hero-name-color', brandReadable);
    root.style.setProperty('--jpdb-reader-accent', accent);
    root.style.setProperty('--jpdb-reader-accent-text', accentText);
    root.style.setProperty('--jpdb-reader-accent-soft', brandSoft);

    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', accent);
}

function sanitizeHostedAccent(value: unknown, fallback = DEFAULT_ACCENT_COLOR): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    return shortHex ? `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase() : fallback;
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
    syncLandmarks();
    installHostedLanguageToggle();
    installHostedOverflowMenu();
    installHostedAccentSync();
    localizeHostedDocsCopy();
    scheduleHostedDocsLocalization();
    prepareHostedYomuRuntime();
    if (routeSyncBound) return;
    routeSyncBound = true;
    window.addEventListener(LANGUAGE_EVENT, () => {
        syncHostedLanguageToggle();
        syncHostedOverflowMenu();
        syncHostedMobileNavSettings();
        scheduleHostedDocsLocalization({ resetReaderWords: true });
    });
    window.addEventListener('hashchange', () => window.requestAnimationFrame(() => {
        syncLandmarks();
        syncHostedLanguageToggle();
        syncHostedOverflowMenu();
        syncHostedMobileNavSettings();
        scheduleHostedDocsLocalization();
        prepareHostedYomuRuntime();
        syncHostedAccent();
    }));
    window.addEventListener('popstate', () => window.requestAnimationFrame(() => {
        syncLandmarks();
        syncHostedLanguageToggle();
        syncHostedOverflowMenu();
        syncHostedMobileNavSettings();
        scheduleHostedDocsLocalization();
        prepareHostedYomuRuntime();
        syncHostedAccent();
    }));
}

function prepareHostedYomuRuntime(): void {
    const forceLocalRuntime = isLocalHostedRuntime();
    appendHostedRuntimeCompanionScripts(forceLocalRuntime);
    if (isHostedYomuRuntimeLoadingOrReady()) return;
    const target = findHostedYomuRuntimeTarget();
    if (!target) {
        clearHostedYomuRuntimeIntent();
        return;
    }
    bindHostedYomuRuntimeIntent(target);
    window.requestAnimationFrame(() => {
        if (hostedRuntimeIntentTarget === target && isElementNearViewport(target)) loadHostedYomuRuntime();
    });
}

function findHostedYomuRuntimeTarget(): HTMLElement | undefined {
    return Array.from(document.querySelectorAll<HTMLElement>(HOSTED_RUNTIME_TARGET_SELECTOR))
        .find(element => HOSTED_JAPANESE_TEXT_RE.test(element.textContent ?? ''));
}

function bindHostedYomuRuntimeIntent(target: HTMLElement): void {
    if (hostedRuntimeIntentTarget === target && hostedRuntimeIntentController) return;
    clearHostedYomuRuntimeIntent();
    const controller = new AbortController();
    hostedRuntimeIntentController = controller;
    hostedRuntimeIntentTarget = target;
    const options = { passive: true, once: true, signal: controller.signal };
    const load = () => loadHostedYomuRuntime();
    target.addEventListener('pointerenter', load, options);
    target.addEventListener('pointerdown', load, options);
    target.addEventListener('touchstart', load, options);
    target.addEventListener('focusin', load, { once: true, signal: controller.signal });
    window.addEventListener('scroll', () => {
        if (isElementNearViewport(target)) loadHostedYomuRuntime();
    }, { passive: true, signal: controller.signal });
}

function isElementNearViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const height = window.innerHeight || document.documentElement.clientHeight;
    return rect.top <= height + HOSTED_RUNTIME_SCROLL_MARGIN_PX && rect.bottom >= -HOSTED_RUNTIME_SCROLL_MARGIN_PX;
}

function loadHostedYomuRuntime(): void {
    clearHostedYomuRuntimeIntent();
    installHostedYomuRuntime();
}

function clearHostedYomuRuntimeIntent(): void {
    hostedRuntimeIntentController?.abort();
    hostedRuntimeIntentController = undefined;
    hostedRuntimeIntentTarget = undefined;
}

function isHostedYomuRuntimeLoadingOrReady(): boolean {
    return Boolean(hostedYomuRuntimeWindow().__yomuReaderAppInitialized || hostedRuntimeScript());
}

function installHostedYomuRuntime(): HTMLScriptElement | undefined {
    const runtime = hostedYomuRuntimeWindow();
    const forceLocalRuntime = isLocalHostedRuntime();
    const currentScript = hostedRuntimeScript();
    prepareLocalHostedRuntime(forceLocalRuntime);
    if (shouldSkipHostedRuntimeInstall(runtime, forceLocalRuntime, currentScript)) return undefined;
    enableLocalHostedRuntime(runtime, forceLocalRuntime);
    appendHostedRuntimeCompanionScripts(forceLocalRuntime);
    return appendHostedRuntimeScript(YOMU_HOSTED_RUNTIME_SCRIPT_ID, hostedRuntimeScriptSrc(forceLocalRuntime));
}

function hostedYomuRuntimeWindow(): HostedYomuRuntimeWindow {
    return window as HostedYomuRuntimeWindow;
}

function hostedRuntimeScript(): HTMLElement | null {
    return document.getElementById(YOMU_HOSTED_RUNTIME_SCRIPT_ID);
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

function appendHostedRuntimeCompanionScripts(forceLocalRuntime: boolean): void {
    for (const script of hostedRuntimeCompanionScripts(forceLocalRuntime)) {
        if (document.getElementById(script.id)) continue;
        appendHostedRuntimeScript(script.id, script.src);
    }
}

function hostedRuntimeCompanionScripts(forceLocalRuntime: boolean): Array<{ id: string; src: string }> {
    return [
        {
            id: YOMU_HOSTED_SETTINGS_COMPANION_SCRIPT_ID,
            src: hostedRuntimeAssetSrc('/yomu-reader/greasyfork/yomu-settings-surface.user.js', forceLocalRuntime),
        },
        {
            id: YOMU_HOSTED_VIDEO_COMPANION_SCRIPT_ID,
            src: hostedRuntimeAssetSrc('/yomu-reader/greasyfork/yomu-video.user.js', forceLocalRuntime),
        },
    ];
}

function appendHostedRuntimeScript(id: string, src: string): HTMLScriptElement {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    document.head.append(script);
    return script;
}

function hostedRuntimeScriptSrc(forceLocalRuntime: boolean): string {
    return hostedRuntimeAssetSrc('/yomu-reader/yomu.user.js', forceLocalRuntime);
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
        installHostedAppearanceProvider(isDark);
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
