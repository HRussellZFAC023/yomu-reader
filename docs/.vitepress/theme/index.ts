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
let hostedSettingsEventPatch: Record<string, any> = {};
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
    'Install よむ': 'インストール',
    'Setup Guide': 'セットアップガイド',
    'Open Study App': '学習',
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
    'Open a Japanese page and tap a word for your first lookup': '日本語ページを開き、単語をタップして最初の検索を試す',
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
    'Open study app': '学習',
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
    // New Translations
    'New to the words?': '初めての方へ：',
    'Lookup': 'ルックアップ',
    'is opening the popup.': 'はポップアップを開くこと。',
    'Mining': 'マイニング',
    'is saving a word for later study.': 'は後で学習するために単語を保存すること。',
    'OCR': 'OCR',
    'reads text out of images.': 'は画像からテキストを読み取ること。',
    'Subtitles': '字幕',
    'turns Japanese video lines into tappable text, just like a normal page.': 'は日本語の動画字幕行を、通常のページと同じようにタップ可能なテキストに変換すること。',
    'Tap, select, or hover Japanese text to open the popup. It shows the reading and meaning right away, plus whatever you\'ve turned on: JPDB definitions, imported dictionary entries, pitch and frequency, audio, example sentences, and kanji details. Mining buttons sit at the bottom.': '日本語のテキストをタップ、選択、またはホバーするとポップアップが開きます。読み方や意味がすぐに表示されるほか、有効化している機能（JPDBの定義、インポートした辞書のエントリ、ピッチと頻度、音声、例文、漢字の詳細など）も表示されます。マイニング用ボタンは下部にあります。',
    'Keyboard shortcuts can move lookup to the previous or next parsed word, and if you have selected a piece of text, navigation stays inside that selection. Popup Japanese font family and weight are configurable, and the default stack matches jpdb.io for kanji, readings, example sentences, grammar snippets, and dictionary terms.': 'キーボードショートカットを使用して、ルックアップ対象を前後の解析された単語に移動できます。テキストを選択している場合、ナビゲーションはその選択範囲内に留まります。ポップアップ内の日本語のフォントファミリーやウェイトは設定可能で、デフォルトの設定は漢字、読み仮名、例文、文法スニペット、辞書用語について jpdb.io の表示スタイルと一致しています。',
    'JPDB mining actions can add a word, mark it Never Forget, blacklist it, or send review grades, and can be turned off while keeping JPDB-powered popup lookup. When Anki is enabled, よむ can create a compact note with the word, reading, meaning, source sentence, JPDB link, local dictionary content, optional context images, and Immersion Kit audio. The word-first Anki front can hide the reading, sentence, or image if you want a stricter prompt.': 'JPDBのマイニング操作では、単語の追加、「Never Forget（忘れない）」としてのマーク、ブラックリストへの登録、復習評価の送信が可能で、JPDB連携のポップアップ検索を維持したままマイニング操作のみをオフにすることもできます。Ankiが有効な場合、よむは単語、読み、意味、元の文、JPDBリンク、ローカル辞書の内容、オプションの文脈画像、Immersion Kitの音声を含むコンパクトなノートを作成できます。より厳格なプロンプトが必要な場合は、単語を最初に示すAnkiカードの表面で読み、文、または画像を非表示にできます。',
    'Furigana and word colors are separate controls. You can show furigana only for harder kanji, show all parsed readings, hide furigana for known words, color words by JPDB/Anki state, color them by pitch accent, or turn highlight coloring off.': 'ふりがなと単語の色は個別に制御できます。難しい漢字のみにふりがなを表示したり、解析されたすべての読みを表示したり、既知の単語のふりがなを非表示にしたりできます。また、JPDB/Ankiの状態やピッチアクセントに基づいて単語を着色することや、ハイライト表示の着色をオフにすることも可能です。',
    'The popup also has optional study helpers for the current sentence. The translation tool generates a plain sentence translation when you open that section, and the grammar tool highlights likely grammar patterns with short explanations and guide links. These tools are meant to help you keep reading, not to replace a dictionary or grammar textbook.': 'ポップアップには、表示中の文に対するオプションの学習支援ツールもあります。翻訳ツールはそのセクションを開いたときに対象文のプレーンな翻訳を生成し、文法ツールは考えられる文法パターンをハイライトして簡単な説明とガイドへのリンクを表示します。これらのツールは読書を続けるのを助けるためのものであり、辞書や文法教科書の代わりになるものではありません。',
    'よむ can import Yomitan dictionary ZIP files, Yomitan settings exports, and dictionary backups. Imported dictionaries stay local in your browser. If you do not have JPDB or Anki connected, よむ can still use public JPDB lookup and local dictionary words for the new-tab study page after you download JMdict or import a Yomitan ZIP in Settings.': 'よむは、Yomitanの辞書ZIPファイル、Yomitan設定のエクスポート、辞書のバックアップをインポートできます。インポートされた辞書はブラウザ内にローカルに保存されます。JPDBやAnkiに接続していない場合でも、設定でJMdictをダウンロードするかYomitanのZIPをインポートすれば、新規タブの学習ページで公開JPDB検索やローカル辞書の単語を利用できます。',
    'This is useful if you want native-language dictionaries, monolingual Japanese definitions, frequency dictionaries, kanji dictionaries, or pitch dictionaries without depending on a remote service for every lookup.': 'これは、検索のたびにリモートサービスに依存することなく、母国語の辞書、国語辞典（日本語一カ国語定義）、頻度辞書、漢字辞書、またはピッチアクセント辞書を使用したい場合に便利です。',
    'Dictionary import and source ordering controls.': '辞書のインポートとソースの順序制御。',
    'The speaker button tries your configured audio sources in order. The default setup uses public Japanese audio sources, JPDB word audio, and browser text-to-speech as fallbacks. If you already use a Yomitan-style audio source, you can add it as a custom URL.': 'スピーカーボタンは、設定された音声ソースを順番に試します。デフォルト設定では、公開されている日本語音声ソース、JPDBの単語音声、およびブラウザの音声合成（TTS）を代替用フォールバックとして使用します。すでにYomitanスタイルの音声ソースを使用している場合は、カスタムURLとして追加できます。',
    'Example sentences can come from JPDB\'s public example rows, Immersion Kit without an API key, or Nadeshiko when you add your own Nadeshiko key. You can also use Immersion Kit + Nadeshiko together; よむ blends the results in a stable order so the same word does not reshuffle every time you open it.': '例文は、JPDBの一般公開されている例文行、APIキー不要のImmersion Kit、または自身のNadeshikoキーを追加した場合はNadeshikoから取得できます。Immersion KitとNadeshikoを併用することも可能です。よむは結果を安定した順序でブレンドするため、ポップアップを開くたびに同じ単語の例文がシャッフルされることはありません。',
    'Examples can show Japanese, translations, thumbnails, audio, and source filters. Settings let you choose categories, length limits, image visibility, translation visibility, playback speed, and one-time hover audio on desktop. If you want to practice without seeing English immediately, turn on blurred example translations and reveal them by tapping or clicking the translation.': '例文には日本語、翻訳、サムネイル、音声、ソースフィルターを表示できます。設定では、カテゴリ、長さ制限、画像の表示/非表示、翻訳の表示/非表示、再生速度、およびデスクトップでのホバー時の自動音声再生を選択できます。英語をすぐに目に入れずに練習したい場合は、例文の翻訳をぼかすように設定し、翻訳をタップまたはクリックして表示させることができます。',
    'Examples, translations, and audio stay inside the normal popup.': '例文、翻訳、音声は通常のポップアップ内に収まります。',
    'Click a kanji inside the popup headword to open a focused kanji panel. Depending on your settings and imported data, it can show JPDB facts, stroke count, grade, JLPT level, RTK data, related words, component hints, KanjiVG stroke tracing, and a small drawing pad.': 'ポップアップの見出し語の中の漢字をクリックすると、特定の漢字パネルが開きます。設定やインポートされたデータに応じて、JPDBの情報、画数、学年、JLPTレベル、RTK（Heisig）データ、関連語、構成要素のヒント、KanjiVGの筆順追跡、および小さな描画パッドを表示できます。',
    'Kanji origin sources are modular and license-aware. You can turn off optional public sources independently.': '漢字情報のソースはモジュール化されており、ライセンスが考慮されています。オプションの公開ソースを個別にオフにすることができます。',
    'OCR lets you tap Japanese text inside images. よむ can use embedded OCR metadata when a site provides it, or a local OCR app/server for engines such as MangaOCR, PaddleOCR, Apple Vision style results, and YomiNinja-shaped responses.': 'OCR機能により、画像内の日本語テキストをタップできます。よむは、サイトが提供している埋め込みOCRメタデータを使用するか、MangaOCR、PaddleOCR、Apple Vision形式の結果、YomiNinja形式のレスポンスなどのエンジンのためのローカルOCRアプリ/サーバーを使用できます。',
    'Recognized text stays lightweight: touch targets sit over the image without covering it until you tap or hover.': '認識されたテキストは軽量な状態を維持します。タップまたはホバーするまで、タッチターゲットは画像を覆うことなく画像の上に配置されます。',
    'Use this for manga panels, screenshots, and image-heavy pages where normal text selection does not work. The image itself is not sent anywhere unless you enable a local OCR endpoint, and that endpoint is the one you configure in settings.': '通常のテキスト選択が機能しない漫画のコマ、スクリーンショット、画像の多いページでこれを使用します。ローカルOCRエンドポイントを有効にしない限り、画像自体が外部に送信されることはありません。また、そのエンドポイントは設定で構成したものです。',
    'Image OCR settings for manga and embedded image text.': '漫画や埋め込み画像テキスト用の画像OCR設定。',
    'よむ can add an ASB-style subtitle overlay for video pages. Japanese subtitles can be parsed into tappable words, native-language subtitle tracks can be shown as a secondary line, and the transcript panel can sit left, right, or below the video with the active line highlighted while you read.': 'よむは、動画ページにAnimebook（ASB）スタイルの字幕オーバーレイを追加できます。日本語の字幕をタップ可能な単語に解析したり、母国語의字幕トラックを副行として表示したりできるほか、トランスクリプトパネルを動画の左、右、または下に配置して、読んでいるアクティブな行をハイライト表示させることができます。', // Wait, let's fix '母国語의字幕' to '母国語の字幕' in replacement content!
    'The transcript is meant to work as a reading surface too: visible Japanese lines are hydrated into the same lookup words as the overlay, so you can skim, jump to a line, and open a popup without leaving the video.': 'トランスクリプトは読み物画面としても機能します。表示されている日本語の行はオーバーレイと同じ検索用単語に変換されるため、動画を離れることなく、ざっと読んだり、特定の行にジャンプしたり、ポップアップを開いたりできます。',
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
    'If you do not use Anki, leave it off. JPDB mining and local dictionary lookup still work without it.': 'Ankiを使用しない場合は、オフのままにしてください。その場合でも、JPDBのマイニングやローカル辞書の検索は機能します。',
    'よむ includes an optional': 'よむには、オプションの',
    '. Use the full address after opening that local or hosted page as a browser home page, new-tab page, or iPad Home Screen shortcut. It uses your accent color and tries Anki study words when AnkiConnect is reachable, then JPDB, then local dictionary words. A new install starts by sending you to Settings > Dictionaries so JMdict or another Yomitan ZIP can be downloaded into local browser storage.': 'が用意されています。このローカルまたはホストされたページをブラウザのホームページ、新規タブページ、またはiPadのホーム画面ショートカットとして開いた後、その完全なアドレスを使用します。設定したアクセントカラーが使用され、AnkiConnectに接続できる場合はAnkiの学習単語を、次いでJPDBの単語、最後にローカル辞書の単語を試します。新規インストールの場合は、まず「設定 > 辞書」に移動し、JMdictまたは別のYomitanのZIPファイルをローカルのブラウザストレージにダウンロードします。',
    'On the hosted page, the installed よむ userscript can bridge local AnkiConnect requests on the same computer. For phone and tablet setup, follow the Tailscale steps in': 'ホストされたページでは、インストール済みのよむユーザースクリプトが同じPC上のローカルAnkiConnectリクエストの仲介を行えます。スマートフォンやタブレットのセットアップについては、モバイルのよむに localhost を指定するのではなく、',
    'instead of pointing mobile よむ at': 'に記載されているTailscaleの手順に従ってください。',
    'On iPhone, iPad, and Android, this is often the easiest daily-review surface. For full Anki status, updates, automatic deck scanning, and review queues, keep desktop Anki running with AnkiConnect and use a reachable LAN or Tailscale URL in よむ, such as': 'iPhone、iPad、Androidでは、これが最も手軽な日々の復習用画面となることがよくあります。完全なAnkiのステータス取得、更新、自動デッキスキャン、および復習キューの利用には、PCでAnkiとAnkiConnectを起動したままにして、よむの設定で到達可能なLANまたはTailscaleのURLを指定してください。たとえば、',
    '. If AnkiConnect still uses its default': '. もしAnkiConnectがデフォルトの',
    'address, mobile devices cannot reach it because': 'アドレスのままである場合、モバイル端末からはアクセスできません。なぜなら',
    'means "this device." If AnkiConnect or JPDB is not available, dictionary-backed words keep the page useful once a dictionary is installed. The step-by-step mobile Anki setup is in': 'は「この端末自体」を意味するからです。AnkiConnectやJPDBが利用できない場合でも、辞書がインストールされていれば、辞書ベースの単語学習によってこのページを有効活用できます。モバイルAnkiの段階的な設定手順は、',
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
    'JPDB, Anki, OCR, and audio are optional. Turn them on when you want them;': 'JPDB、Anki、OCR、音声機能はオプションです。使いたいときに有効化してください。',
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
    '"Userscripts" isn\'t in the AA or extensions menu?': '「Userscripts」がAAや拡張機能メニューに表示されませんか？',
    'It isn\'t turned on yet. Go back to Step 1, enable Userscripts, and allow it on All Websites. Then reload the code page and open the menu again.': 'まだオンになっていません。ステップ1に戻り、Userscriptsを有効にして「すべてのWebサイト」で許可してください。その後、コードのページを再読み込みして、再度メニューを開いてください。',
    'You\'ll know it worked': 'インストールが成功すると',
    'when a small floating よむ button appears in the corner of Japanese pages — and the first time, よむ greets you with a welcome screen.': '、日本語ページの隅に小さなフローティング「よむ」ボタンが表示されます。また、初回起動時には歓迎画面が表示されます。',
    'Step 3: Your first lookup': 'ステップ3：最初の検索',
    'The first time よむ runs, it shows a short': 'よむが初めて起動したときは、短い',
    'with two buttons:': 'が2つのボタンと共に表示されます：',
    '— start reading right now. よむ looks words up using free public data, with no account needed.': ' — すぐに読書を開始します。アカウント不要で、無料の公開データを使用して単語を検索します。',
    '— connect a JPDB account for word tracking and mining. Optional, and you can do it later (': ' — 単語の追跡やマイニングのためにJPDBアカウントを連携します。これはオプションであり、後から行うこともできます（',
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
    'Add JPDB (optional)': 'JPDBの追加（オプション）',
    'is a free study service. With it, よむ shows whether you already know a word, colors words by status, and lets you mine straight into JPDB. Local dictionary lookup works fine without it, but JPDB is the easiest way to track progress.': 'は無料の学習サービスです。連携すると、すでに対象語を知っているかどうかの確認、ステータスに応じた単語の色分け、JPDBへの直接のマイニングが可能になります。ローカル辞書での検索は連携なしでも問題なく動作しますが、進捗を追跡するにはJPDBが最も簡単な方法です。',
    'your JPDB settings': 'JPDBの設定画面',
    'and copy your key from the': 'を開き、',
    'section.': 'セクションからキーをコピーします。',
    'In よむ, open settings: tap the floating よむ button, or press': 'よむで設定を開きます：フローティング「よむ」ボタンをタップするか、PCで',
    'on a computer.': 'を押します。',
    'Paste the key into the': 'API key欄にキーを',
    'field and save.': '貼り付けたら保存します。',
    'You can also study from imported dictionaries instead — see Settings → Dictionaries. JPDB-only actions like mining to JPDB still need the key.': '代わりに、インポートした辞書から学習することもできます。「Settings → Dictionaries（設定 → 辞書）」を参照してください。JPDBへのマイニングなど、JPDB専用のアクションには引き続きキーが必要です。',
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
    'Polished learner stories with notes and audio. よむ adds your usual JPDB, Yomitan, and Anki flow on top.': '注釈と音声が付いた、洗練された学習者向けストーリーです。よむを重ねることで、いつものJPDB、Yomitan、Ankiフローも利用できます。',
    'Short articles sorted by rough JLPT level. A useful bridge from graded readers to native articles.': '大まかなJLPTレベル別に分類された短い記事です。graded readersからネイティブ向け記事への橋渡しに役立ちます。',
    'A big collection of folk tales. The repetition makes it friendly for mining common words.': '民話や童話の大きなコレクションです。繰り返しが多く、よく使われる単語のマイニングに向いています。',
    'Read Japanese EPUBs in the browser with よむ lookup — the clean route into light novels and books.': 'ブラウザで日本語EPUBを読み、よむ検索を使用します。ライトノベルや一般書籍へ進むためのスマートなルートです。',
    'Find books and manga graded by difficulty, so your next read is a challenge but not a wall.': '難易度別に書籍や漫画を探せます。次に読むものを、つらすぎず挑戦的なレベルにできます。',
    'Native web novels with selectable text. Search for a genre you already love.': 'テキストを選択できる、ネイティブ向けWeb小説です。好きなジャンルを探してみてください。',
    'Turn on subtitle lookup and the transcript panel for listening-plus-reading immersion.': '字幕の検索とトランスクリプトパネルを有効化して、リスニングとリーディングを組み合わせた没入学習を行いましょう。',
    'For more, skim these community threads:': '詳細については、以下のコミュニティスレッドを参照してください：',
    'Using よむ on a phone or tablet': 'スマートフォンやタブレットでのよむの利用',
    'Most of よむ works the same on mobile: lookup, local dictionaries, JPDB, OCR, subtitle taps, the': 'よむのほとんどの機能（ルックアップ、ローカル辞書、JPDB、OCR、字幕タップ、',
    'desktop helpers': 'PC用の補助機能（desktop helpers）',
    '. Anything that runs on your computer — AnkiConnect, a self-hosted audio server, a local OCR app — has to be reachable over the network. On a phone,': 'の扱いです。PC上で実行するツール（AnkiConnect、セルフホストの音声サーバー、ローカルOCRアプリなど）は、ネットワーク経由で到達可能でなければなりません。スマートフォンにおいて、',
    'means': 'は',
    'the phone': 'スマートフォン自体',
    ', not your computer, so you point よむ at your computer\'s LAN or Tailscale address instead. The easy mobile paths (public JPDB lookup, imported dictionaries, hosted audio, the study page) don\'t need any of that.': 'を指し、PCではありません。そのため、よむの設定でPCのLANまたはTailscaleのアドレスを指定します。シンプルなモバイル利用（公開JPDB検索、インポート辞書、ホストされた音声、学習ページ）では、これらは一切不要です。',
    'Use desktop Anki from a phone, iPad, or Android': 'スマートフォン、iPad、またはAndroidからデスクトップ版Ankiを使用する',
    'You don\'t need AnkiMobile or AnkiDroid for full Anki status on mobile. The full setup keeps Anki open on your computer and lets your phone talk to it. Your phone is just the reading screen; desktop AnkiConnect still handles existing-card status, note updates, media, deck scans, and review queues.': 'モバイルで完全なAnkiステータスを利用するために、AnkiMobileやAnkiDroidを導入する必要はありません。完全なセットアップでは、PC上でAnkiを開いたままにし、スマートフォンをそこに接続させます。スマートフォンは単なる読書画面であり、デスクトップのAnkiConnectが既存カード状態のチェック、ノートの更新、メディアの追加、デッキのスキャン、復習キューの管理を引き続き担当します。',
    'The easiest private route is': '最も簡単なプライベート接続の方法は',
    ': it gives your own devices a private address so they can see each other, even away from home. You do not need router setup, port forwarding, or a command line. Install it on the computer that runs Anki and on the phone or tablet that runs よむ.': 'です。これにより、お使いの端末同士が外出先からでも安全に相互接続できるプライベートアドレスが割り当てられます。ルーターの設定、ポート開放、コマンドライン操作などは不要です。Ankiを実行するPCと、よむを実行するスマートフォンやタブレットの双方にインストールしてください。',
    'Below, replace every': '以下では、すべての',
    'with your computer\'s Tailscale address. It usually starts with': 'をお使いのPCのTailscaleアドレスに置き換えてください。通常、アドレスは',
    '. You can also use the Tailscale device name if MagicDNS is enabled, such as': 'から始まります。MagicDNSが有効な場合は、Tailscaleのデバイス名（例：',
    'On your computer, install Anki and the': '1. PCにAnkiと',
    'Install': '2. PCに',
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
    'Add JPDB': 'JPDBを追加',
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
    'JPDB features are missing': 'JPDB機能が表示されない',
    'AnkiConnect is unreachable on mobile': 'モバイルからAnkiConnectに接続できない',
    'and': 'および',
    'Hosted AnkiConnect checks fail': 'ホスト版のAnkiConnectチェックが失敗する',
    'the new-tab page': '新規タブページ',
    'and sign in again.': 'を開き、再度サインインしてください。',
    'よむ': 'よむ',
    'Tap a word': '単語をタップ',
    'Most reading tools make you pick an ecosystem first. よむ doesn\'t. Use JPDB for word status and mining, import Yomitan dictionaries for offline definitions, connect Anki for your own cards, pull example sentences from Immersion Kit or Nadeshiko, play audio, trace kanji stroke by stroke, read manga with OCR, and mine subtitles from video — all from the same popup, and all optional. Start reading first, then add what you need.': 'ほとんどの読書ツールでは、まず特定のエコシステムを選択する必要がありますが、よむは異なります。単語ステータスの確認やマイニングにJPDBを使用し、オフラインでの定義表示にYomitan辞書をインポートし、独自のカード作成のためにAnkiを接続し、Immersion Kitやなでしこから例文を取得し、音声を再生し、漢字の書き順をなぞり、OCRで漫画を読み、動画の字幕からマイニングすることができます。これらすべてを同じポップアップから行え、すべてオプションです。まずは読書から始め、必要なものを順次追加していきましょう。',
    ', the classic idea of': '、古典的な考え方である',
    ', and Tadoku\'s practical reading rules for Japanese learners at': '、そして日本語学習者向けのTadokuの実践的な読書ルール（',
    'tadoku.org': 'tadoku.org',
    '青空の下で本を読む': '青空の下で本を読む',
    '今日は静かな喫茶店で新しい本を読みました。': '今日は静かな喫茶店で新しい本を読みました。',
    'Review JPDB, Anki, or imported dictionary cards from the study app.': '学習アプリからJPDB、Anki、またはインポートされた辞書のカードを復習します。',
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
    'JPDB and browser text-to-speech rows are fallback-only by default, so': 'JPDBとブラウザの音声合成（TTS）はデフォルトでフォールバック専用となっているため、',
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
    'Use the よむ study screen for JPDB, Anki, or imported dictionary cards.': 'JPDB、Anki、またはインポートされた辞書カード向けによむの学習画面を使用します。',
    'Return to the main documentation hub for setup, features, and changelog pages.': 'セットアップ、機能、変更履歴ページのためにメインのドキュメントハブに戻ります。',
    'よむ brings popup lookup, JPDB mining, imported dictionaries, subtitles, image reading, and Anki export into one free userscript. Comparable study suites such as': 'よむは、ポップアップ検索、JPDBマイニング、インポートされた辞書、字幕、画像読み取り、およびAnki書き出しを1つの無料ユーザースクリプトに統合します。同等の学習スイートである',
    'currently advertise paid plans from $10/month; よむ offers the same core reading-and-mining workflow for free.': 'などは現在月額10ドルからの有料プランを宣伝していますが、よむは同様の核となる読書およびマイニングのワークフローを無料で提供します。',
    'Donations are optional. They help cover the time, testing devices, services, maintenance, and AI tokens that keep the reader polished. Realistically, I have already spent far more on AI/API tokens building よむ than donations are ever likely to make back, but even a small donation helps soften that cost. On a personal level, my dream is to save enough money to move to Japan and marry my long-distance Japanese girlfriend. Every bit of support helps bring that future closer and encourages me to keep maintaining よむ, fixing bugs, and adding the features learners ask for.': '寄付は任意です。寄付は、リーダーの磨き込みを維持するための時間、テスト端末、サービス、メンテナンス、およびAIトークンの費用を賄うのに役立ちます。現実的には、よむの開発でAI/APIトークンに費やした額は、寄付で回収できる見込みの額をはるかに上回っていますが、少額の寄付でもその負担を和らげることができます。個人的には、十分なお金を貯めて日本に移住し、遠距離恋愛中の日本人彼女と結婚するのが私の夢です。皆様からのご支援のすべてが、その未来を引き寄せ、よむのメンテナンス継続、バグ修正、および学習者が求める機能の追加への励みになります。',
    'Look up a word and press the speaker button.': '単語を検索してスピーカーボタンを押します。',
    // Brand names to themselves
    'AnkiConnect': 'AnkiConnect',
    'Tailscale': 'Tailscale',
    'Migaku': 'Migaku',
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
    if (theme) patch.theme = theme;
    if (accentColor) patch.accentColor = accentColor;
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
