import DefaultTheme from 'vitepress/theme-without-fonts';
import { useData, type Theme } from 'vitepress';
import { defineComponent, h, onMounted, provide, type Ref } from 'vue';
import pkg from '../../../package.json' with { type: 'json' };
import {
    hostedAccentColorFromValue,
    hostedAccentCssVariables,
    sanitizeHostedAccentColor,
} from '../../../src/reader/core/hosted-accent-css';
import {
    rememberSupportBannerDismissal,
    shouldShowSupportBannerImpression,
} from '../../../src/reader/app/support-banner-policy';
import { shouldInstallHostedReaderRuntime } from '../../../src/reader/app/runtime-presence';
import { applyInterfaceLocaleToDocument, resolveInterfaceLocale } from '../../../src/reader/locales';
import { gmStorageGet, gmStorageSet } from '../../../src/reader/app/storage';
import { HOSTED_DEMO_VIDEO_SETTINGS_PATCH } from '../../../src/reader/app/hosted-demo-settings';
import { cleanupHostedDocsAnnotations } from './chrome-annotation-cleanup';
import { syncHostedAcademyAccountControls } from './academy-account';
import { hostedOverflowLinks } from '../shared/nav';
import { installMembershipPopover } from './membership-popover';
import './custom.css';

type InterfaceLanguage = 'en' | 'ja';
type HostedThemePreference = 'auto' | 'dark' | 'light';
type HostedInterfaceLanguagePreference = InterfaceLanguage | 'auto';
interface HostedHeroStudyLanguage {
    id: string;
    locale: string;
    englishName: string;
    nativeName: string;
    direction: 'ltr' | 'rtl';
}
declare const __YOMU_HERO_LANGUAGES__: readonly HostedHeroStudyLanguage[];
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
const YOMU_HOSTED_KANJI_STUDY_COMPANION_SCRIPT_ID = 'yomu-hosted-kanji-study-companion';
const YOMU_HOSTED_ANKI_COMPANION_SCRIPT_ID = 'yomu-hosted-anki-companion';
const HOSTED_RUNTIME_VERSION = pkg.version;
const LEGACY_YOMU_HOSTED_RUNTIME_SCRIPT_ID = 'yomu-hosted-demo-runtime';
const YOMU_SUPPORT_STATUS_URL = 'https://support.yomureader.com/status';
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
const HOSTED_DOCS_LOCALE_META: Record<InterfaceLanguage, string> = {
    en: 'en_US',
    ja: 'ja_JP',
};
const HOSTED_OVERFLOW_SELECTOR = '[data-yomu-hosted-overflow]';
const HOSTED_MOBILE_SETTINGS_SELECTOR = '[data-yomu-hosted-mobile-settings]';
const HOSTED_RUNTIME_SCROLL_MARGIN_PX = 160;
// The fold promises "press a word". 2.5s is long enough for a cold runtime on a
// slow connection to boot and short enough that nobody presses a dead sample
// first; after 15s a runtime that has not arrived is not going to.
const HOSTED_FOLD_WATCHDOG_TICK_MS = 500;
const HOSTED_FOLD_WATCHDOG_MS = 2500;
const HOSTED_FOLD_WATCHDOG_GIVE_UP_MS = 15000;
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
    goalMet?: boolean;
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
let hostedSupportBannerStatus: HostedSupportStatus | undefined;
let accentSyncBound = false;
let hostedThemeSyncBound = false;
let hostedThemeIsDark: Ref<boolean> | undefined;
let hostedSettingsEventPatch: Record<string, any> = {};
let hostedSharedSettingsWrite: Promise<void> = Promise.resolve();
// The あ toggle's most recent explicit choice. A reader runtime that boots
// AFTER the toggle (the toggle itself boots it on docs pages) loads a stale
// GM-storage settings copy and echoes it back on its first full-settings
// save; without this guard that echo persisted the OLD interfaceLanguage and
// the visitor had to tap the toggle twice. Echoes contradicting a recent
// explicit choice are ignored and the choice is re-broadcast to the runtime.
let hostedExplicitLanguageChoice: { language: InterfaceLanguage; at: number } | null = null;
const HOSTED_LANGUAGE_ECHO_WINDOW_MS = 15000;
let themeClassObserver: MutationObserver | undefined;
let hostedDocsShellSyncPending = false;
let hostedDocsLocalizationPending = false;
let hostedDocsLocalizationResetPending = false;
// Last language actually APPLIED to the document copy. The runtime mirrors new
// settings to localStorage before dispatching its change event (and earlier
// theme/accent listeners patch effective state first), so "effective state
// before the event" already reads the NEW language — comparisons must be made
// against what localization last applied, not against effective state.
let hostedAppliedDocsLanguage: InterfaceLanguage | undefined;
// Fingerprint of the annotation-affecting settings last seen/applied, seeded
// from stored settings at install time (before any change event can fire).
let hostedAppliedAnnotationSettings: string | undefined;
let hostedAccentSignature = '';
let hostedDocumentTitleOriginal: string | undefined;
let hostedRuntimeIntentController: AbortController | undefined;
let hostedRuntimeIntentTargets: HTMLElement[] | undefined;
let hostedRuntimeHoverHandoff: { x: number; y: number } | undefined;
let hostedRuntimeHoverHandoffController: AbortController | undefined;
let routeSyncBound = false;
let localRuntimeCacheCleanupStarted = false;

// Built from docs/.vitepress/shared/nav.ts — the same list the docs nav uses.
// This was a second hand-maintained copy that had already drifted from it: it
// pointed Stats at /newtab/ (the route is /study/), and it was missing the FAQ,
// Guides, Academy and Membership entirely, so the hosted Study, PDF Reader and
// Video Player shells offered a menu the rest of the site did not have.
const HOSTED_OVERFLOW_LINKS = hostedOverflowLinks();

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
    'Faster word lookups: よむ asks browser storage about a third as often per lookup, so definitions land sooner. Most noticeable under Tampermonkey, where every storage request is a round trip to the extension.': '単語検索が高速になりました。よむが検索ごとにブラウザーストレージへ問い合わせる回数が約3分の1になり、定義がより早く表示されます。ストレージへの要求がすべて拡張機能への往復となるTampermonkeyで最も効果を実感できます。',
    'Large Academy decks load faster: reading a deck of N cards now takes about N storage requests instead of three times that.': '大きなアカデミーデッキの読み込みが高速になりました。Nカードのデッキの読み取りに必要なストレージ要求が、従来の約3倍からほぼNになりました。',
    'BookWalker manga OCR works again in browsers that isolate the userscript from the page (Firefox, Safari userscript extensions): 1.8.82 accidentally made the page-side canvas recorder reference a helper that does not exist in the page realm, so the recorder never installed. The nightly cross-engine check that caught this now runs as a permanent test.': 'ユーザースクリプトをページから分離するブラウザー（Firefox、Safariのユーザースクリプト拡張機能）で、BookWalkerマンガOCRが再び動作するようになりました。1.8.82で、ページ側のキャンバスレコーダーがページ側に存在しないヘルパーを誤って参照するようになり、レコーダーがインストールされなくなっていました。これを検出した夜間のクロスエンジンチェックは、恒久的なテストとして実行されるようになりました。',
    'Restores the published release packages: the 1.8.82 and 1.8.83 release pipelines failed after publishing their documentation, so their downloadable packages never appeared. This release carries both versions\' fixes and publishes normally. No new changes beyond 1.8.83.': '公開リリースパッケージを復旧しました。1.8.82と1.8.83のリリースパイプラインはドキュメントの公開後に失敗し、ダウンロード可能なパッケージが公開されませんでした。このリリースは両バージョンの修正を含み、通常どおり公開されます。1.8.83以降の新しい変更はありません。',
    'Tapping or hovering a word\'s furigana now opens that word. The reading above every annotated line was a dead strip whose presses fell through to the page behind it.': '単語のふりがなをタップまたはホバーすると、その単語が開くようになりました。注釈された行の上の読みは、押しても背後のページに突き抜けてしまう反応しない帯になっていました。',
    'Readings projected over mirrored, scrolled, OCR, and button text are pressable too, and resolve to the word they belong to.': 'ミラーリングされたテキスト、スクロールされたテキスト、OCRテキスト、ボタンテキストの上に投影された読みも押せるようになり、属する単語に解決されます。',
    'Buttons and links keep their own clicks: pressing a reading painted over a control still activates the control.': 'ボタンとリンクは自身のクリックを保持します。コントロールの上に描かれた読みを押しても、そのコントロールが動作します。',
    'Hovering across a line no longer starts a dictionary lookup for every word the pointer passes: crossing eleven words now resolves one lookup instead of eleven, and only the word you settle on answers.': '行の上でポインターを動かしても、通過したすべての単語で辞書検索が始まることはなくなりました。11語を横切っても検索は11回ではなく1回だけ実行され、最終的に止まった単語だけが応答します。',
    'Each lookup makes two storage round trips instead of nine, and the debug logger stops re-reading its setting on every message (121 storage reads per lookup down to 43), which is most of the reported lookup latency on the userscript bridge.': '各検索のストレージ往復が9回から2回になり、デバッグロガーがメッセージごとに設定を読み直すこともなくなりました（検索あたりのストレージ読み取りが121回から43回に減少）。これは報告されていたユーザースクリプトブリッジでの検索遅延の大部分を占めていました。',
    'A page left paused or in manual-scan mode no longer does style probing when the site\'s own scripts churn the page, ending the idle lag reported on nyaa.si.': '一時停止中や手動スキャンモードのページでは、サイト自身のスクリプトがページを更新してもスタイルの探査を行わなくなりました。nyaa.siで報告されていたアイドル時の遅延が解消されます。',
    'Pointer handling over OCR-scanned pages does a third of the hit-testing per movement on pages with no scannable images.': 'スキャン可能な画像のないページでは、OCRスキャン対象ページ上のポインター処理が1回の移動あたりのヒットテストを3分の1に削減しました。',
    'Your settings now stay exactly as you set them. Every switch, slider, and choice records that you chose it, the newest choice always wins, and background machinery can no longer quietly put an old value back while the dialog still shows the one you picked. This closes the class behind the native-subtitles toggle turning itself back on and the subtitle size slider reverting.': '設定が、設定したとおりに保持されるようになりました。すべてのスイッチ、スライダー、選択はあなたが選んだことを記録し、最新の選択が常に優先され、バックグラウンドの仕組みがダイアログに選んだ値を表示したまま古い値をこっそり戻すことはできなくなりました。これにより、ネイティブ字幕の切り替えが勝手にオンに戻る問題や、字幕サイズのスライダーが元に戻る問題の原因クラスが解消されました。',
    'The subtitle style panel\'s Reset now really resets: it withdraws your recorded choices instead of pinning the panel\'s defaults as if you had chosen them.': '字幕スタイルパネルのリセットが本当のリセットになりました。パネルの既定値をあなたが選んだかのように固定するのではなく、記録された選択を取り消します。',
    'Dictionary order is finally yours (GitHub #43). Dragging a dictionary above Jiten or JPDB sticks: nothing splices Jiten back to the top, a reordered list is not mistaken for an unmigrated default, newly imported dictionaries no longer tie with the built-ins and win alphabetically, and opening and saving the settings without touching anything leaves the order byte-identical.': '辞書の並び順がついに自分のものになりました（GitHub #43）。辞書をJitenやJPDBの上にドラッグすると、その位置が維持されます。Jitenが先頭に戻されることはなく、並べ替えたリストが未移行の既定値と誤認されることもなく、新しくインポートした辞書が組み込み辞書と同順位になってアルファベット順で勝つこともなく、何も触らずに設定を開いて保存しても並び順はバイト単位で同一のままです。',
    'Dictionary order now also decides which dictionary answers a lookup when several match equally well, instead of the alphabetically first name winning.': '複数の辞書が同等に一致する場合、どの辞書が検索に応答するかも辞書の並び順で決まるようになりました。アルファベット順で最初の名前が勝つことはありません。',
    'An Anki note type that is missing from your collection is only replaced by the suggested one when it was the shipped default, so a renamed custom note type is no longer silently overwritten.': 'コレクションに存在しないAnkiノートタイプは、それが出荷時の既定値だった場合にのみ提案されたものに置き換えられます。名前を変更したカスタムノートタイプが黙って上書きされることはなくなりました。',
    'The popup keeps your scroll position while late results arrive: Anki status, local and Jiten definitions, pitch, frequency, and Bunpro data used to rebuild the popup body and send you back to the top each time one landed.': 'ポップアップは、遅れて届く結果を受け取ってもスクロール位置を保持するようになりました。以前は、Ankiの状態、ローカルとJitenの定義、ピッチ、頻度、Bunproのデータが届くたびにポップアップ本体が再構築され、先頭に戻されていました。',
    'Hover popups no longer close on their own while you read or scroll inside them. The panel locks its position once your pointer enters, growing content extends downward instead of moving the edge under your cursor, and only actually leaving the panel closes it.': 'ホバーポップアップが、中を読んだりスクロールしたりしている間に勝手に閉じることがなくなりました。ポインターが入るとパネルの位置が固定され、内容が増えてもカーソルの下の端が動くのではなく下方向に伸び、実際にパネルから離れたときにのみ閉じます。',
    'Dictionary changes no longer tear annotated words out of the page while a popup is open on one of them; the re-annotation waits until the popup closes.': '辞書の変更が、注釈された単語のポップアップを開いている間にその単語をページから取り除くことがなくなりました。再注釈はポップアップが閉じるまで待機します。',
    'On phones, tapping outside the popup closes it even when the tap lands on よむ\'s own overlays (subtitles, OCR text, page add-ons), and the text selection is cleared instead of staying stuck.': 'スマートフォンで、ポップアップの外側をタップすると、タップがよむ自身のオーバーレイ（字幕、OCRテキスト、ページアドオン）に当たった場合でも閉じるようになりました。テキスト選択も残らずに解除されます。',
    'One span authority now decides which characters every lookup covers: hover, click, and tap resolve through the same longest-match resolution, and dictionary or provider results confirm a span but can never paint it onto neighbouring text. In the reported NHK sentence, hovering 言葉 inside 優しい言葉 answers 言葉, ことば keeps its final ば, and です no longer opens を (GitHub #48).': 'すべての検索がどの文字を対象とするかを、単一のスパン決定機構が判定するようになりました。ホバー、クリック、タップは同じ最長一致の解決を通り、辞書やプロバイダーの結果はスパンを確定できても、隣のテキストに描画することはできません。報告されたNHKの文では、優しい言葉の中の言葉にホバーすると言葉が表示され、ことばは末尾のばを保ち、ですがをを開くことはなくなりました（GitHub #48）。',
    'A provider\'s parse of the sentence still counts: its aligned words confirm spans directly, with guards that keep the provider\'s own segmentation mistakes from freezing — a token cut inside a word, a clause glued into one "word", or a dictionary stem that splits a compound all fall through to real lookups and whole-word fallback.': 'プロバイダーによる文の解析も引き続き活用されます。位置の一致する単語はスパンを直接確定しますが、プロバイダー自身の分割ミスが固定されないよう保護されています。単語の途中で切れたトークン、一語に接着された節、複合語を分割してしまう辞書の語幹は、いずれも実際の検索と単語全体のフォールバックに委ねられます。',
    'Hiragana words inside mixed sentences now segment identically across browser engines, guarded by a recorded ICU boundary fixture, so a word like にほんご no longer splits differently in Firefox than in Chrome.': '漢字かな交じり文の中のひらがな語が、ブラウザーエンジン間で同一に分割されるようになりました。記録済みのICU境界フィクスチャで保護されているため、にほんごのような単語がFirefoxとChromeで異なる分割になることはありません。',
    'Tapping a kana fragment left by an earlier annotation resolves the whole word through the same authority, and words the parser could not confirm re-resolve on interaction instead of staying stuck.': '以前の注釈が残したかなの断片をタップすると、同じ決定機構を通じて単語全体が解決されます。パーサーが確定できなかった単語も、操作時に再解決され、そのまま固まることはありません。',
    'Deinflection carries its grammar conditions across steps, so a conjugated form only matches dictionary entries that can actually inflect that way.': '活用の復元が文法条件を各ステップにわたって保持するようになり、活用形は実際にその活用が可能な辞書項目にのみ一致します。',
    'Clicking an annotated word always opens it: words that have not finished re-annotating (popup reference text, mirrored site chrome) no longer swallow the click, and a word inside a dictionary reference link opens that word instead of the whole compound.': '注釈された単語をクリックすると必ず開くようになりました。再注釈が完了していない単語（ポップアップ内の参照テキストやミラーリングされたサイトUI）がクリックを無視することはなくなり、辞書参照リンク内の単語は複合語全体ではなくその単語を開きます。',
    'Tapping a single kanji in OCR text opens its kanji card again instead of a guessed vocabulary entry.': 'OCRテキストの漢字一文字をタップすると、推測された語彙エントリーではなく、再び漢字カードが開くようになりました。',
    'Pitch colour and furigana hydration reach popup reference words again, not only freshly annotated page words.': 'ピッチの色分けとふりがなの補完が、新しく注釈されたページの単語だけでなく、ポップアップ内の参照単語にも再び適用されるようになりました。',
    'Dictionary lookups scan every index row for a term instead of stopping at the first eight, so entries in very large dictionaries stop silently losing to lower-ranked rows.': '辞書検索が最初の8行で打ち切らず、その語のすべてのインデックス行を走査するようになりました。大規模な辞書の項目が、下位の行に無言で負けることはなくなりました。',
    'Cantonese, Chinese, and Korean dictionary words that cross an automatic segmentation boundary resolve again: the dictionary corrects the segmenter\'s guess instead of being vetoed by it.': '自動分割の境界をまたぐ広東語・中国語・韓国語の辞書語が再び解決されるようになりました。辞書が分割の推測を訂正し、推測によって拒否されることはありません。',
    'Imported dictionaries now stay on the site where you import them. Earlier releases copied the full dictionary set into every site that showed Japanese text, which could quietly consume tens of gigabytes of disk; those copies are no longer created, and sites without one answer lookups from Jiten and the other online sources.': 'インポート済み辞書は、インポートしたサイトにのみ保存されるようになりました。以前のリリースでは、日本語テキストを表示したすべてのサイトに辞書一式がコピーされ、気づかないうちに数十GBのディスクを消費することがありました。このコピーは作成されなくなり、コピーのないサイトではJitenなどのオンラインソースが検索に応答します。',
    'Updating no longer wipes imported dictionaries for learners who ever used Factory Reset. A dictionary database from an older schema is adopted instead of cleared, so Jitendex and other imports stay recognized without a re-import.': 'ファクトリーリセットを使ったことのある学習者のインポート済み辞書が、更新時に消去されなくなりました。古いスキーマの辞書データベースは消去されずに引き継がれるため、Jitendexなどのインポートは再インポートなしで認識され続けます。',
    'Dictionaries discovered by the settings panel or restored from a settings backup stay enabled and keep their position instead of being silently disabled behind the built-in sources.': '設定パネルで検出された辞書や設定バックアップから復元された辞書は、有効なまま位置を保持し、組み込みソースの後ろで無効化されることがなくなりました。',
    'Disabling imported dictionaries now also removes the copies earlier versions left on other sites, one site at a time as you next visit them.': 'インポート済み辞書を無効にすると、以前のバージョンが他のサイトに残したコピーも、次にそのサイトを訪れたときに順次削除されるようになりました。',
    'Factory Reset no longer fails on large dictionary databases: deletion has a realistic time budget, and a deletion blocked by another よむ tab says so instead of failing silently.': 'ファクトリーリセットが大きな辞書データベースで失敗しなくなりました。削除には現実的な時間の余裕が与えられ、別のよむタブによって削除がブロックされた場合はその旨が表示されます。',
    'Off-screen clipped comments and other document-portal annotations no longer run a full Range reprojection after each scroll burst. Their existing furigana and pitch geometry stays intact until the content is visible again, while visible nested scrollers still settle once.': '画面外でクリップされたコメントなどのドキュメントポータル注釈は、スクロールのまとまりごとにRange全体を再投影しなくなりました。既存のふりがなとピッチ表示の位置は、その内容が再び表示されるまで保持されます。一方、表示中のネストしたスクローラーは引き続き一度だけ位置を確定します。',
    "Firefox extension packaging now removes parser-irrelevant whitespace and non-legal comments from the generated content-script body after all runtime hardening, with identifier and syntax minification disabled. The exact reviewer source and license notices remain bundled, and the shipped file stays below addons.mozilla.org's 5 MiB parser limit without affecting the readable userscript, Chrome, or Safari builds.": 'Firefox拡張機能のパッケージでは、すべての実行時保護を適用した後、生成済みコンテンツスクリプト本体から解析に不要な空白と法的表示ではないコメントを取り除くようになりました。識別子と構文の最小化は無効のままです。審査用の正確なソースとライセンス表示は引き続き同梱し、読みやすいユーザースクリプト、Chrome版、Safari版に影響を与えず、配布ファイルをaddons.mozilla.orgの5 MiB解析上限未満に保ちます。',
    'Yomu Gaming and other OCR overlays now isolate recognized lines from competing page scanners on the first annotated paint, before delayed reading or pitch lookup finishes. Kanji, kana particles, punctuation, and unresolved gaps stay visible, tappable, and owned by Yomu instead of flickering between scanner states.': 'Yomu GamingなどのOCRオーバーレイでは、読みやピッチの遅延検索が終わる前の最初の注釈描画時点で、認識した行を競合するページスキャナーから分離するようになりました。漢字、かなの助詞、句読点、解析されなかった部分も表示とタップ操作を保ち、スキャナー間で状態がちらつかず、よむが一貫して操作を担当します。',
    'Late dictionary and study-state responses now reconcile the whole rendered sentence through one shared path. Furigana, pitch patterns, compound pitch, particle classification, known-status display, and i+1 guidance stay consistent after sparse cards become canonical, so annotations such as 名古屋城 no longer disappear while remaining tappable.': '辞書や学習状態の遅延応答は、描画済みの文全体を1つの共通経路で再調整するようになりました。情報の少ないカードが正規のカードに更新された後も、ふりがな、ピッチ型、複合語のピッチ、助詞判定、既知状態の表示、i+1ガイドが一致し続けるため、「名古屋城」のような注釈がタップ可能なまま見えなくなることがなくなりました。',
    'Follow-up annotation work is coalesced by connected text root and detached virtualized rows are skipped. Dynamic feeds, long prose, subtitles, OCR, comments, native labels, Anki, Bunpro, and Academy state updates avoid repeated document walks and mutation-observer feedback while retaining newly rendered duplicates.': '後続の注釈処理は接続中のテキスト領域ごとにまとめ、仮想化によって切り離された行は処理しないようになりました。動的フィード、長文、字幕、OCR、コメント、標準ラベル、Anki、Bunpro、Academyの状態更新では、新しく描画された同じ語も保持しながら、文書の繰り返し走査とMutationObserverのフィードバックを防ぎます。',
    'On iPad YouTube, furigana now stays locked to its source text during page, nested-panel, and visual-viewport scrolling. Search-result readings no longer chase the page or settle a frame late.': 'iPad版YouTubeで、ページ、入れ子のパネル、または表示ビューポートをスクロールしても、ふりがなが元のテキストと同じ位置を保つようになりました。検索結果の読みがページを遅れて追いかけたり、1フレーム後に位置が合ったりすることがなくなりました。',
    'Framework-repainted prose and native YouTube labels now keep annotations in a layout-neutral document layer. Long comments, shelf expanders, the mini-guide, and Shorts actions remain annotated without changing their native text, truncation, hit targets, or DOM identity, preventing missing labels and repeated remount churn.': 'フレームワークによって再描画される本文とYouTube本来のラベルでは、注釈をレイアウトに影響しない文書レイヤーに保持するようになりました。長いコメント、棚の展開ボタン、ミニガイド、Shortsの操作は、本来のテキスト、省略表示、タップ領域、DOM上の同一性を変えずに注釈を保つため、ラベルの欠落と繰り返しの再マウントを防ぎます。',
    'Automatic page scanning now fills missing public Jiten readings in bounded batches without spending the optional pitch-accent budget. Long or frequently updated pages can continue furigana enrichment beyond the first few candidates without blocking interaction or requiring a click.': 'ページの自動スキャンは、欠けている公開Jitenの読みを制限付きのバッチで補完し、任意のピッチアクセント検索枠を使い切らないようになりました。長いページや頻繁に更新されるページでも、操作を妨げたりクリックを必要としたりせず、最初の数語より先までふりがなの補完を続けられます。',
    'Later sparse lookup responses can no longer erase a richer cached reading or pitch accent for the same word. An annotation such as 名古屋城 remains visible after rescans and stays consistent with the click popup.': '後から届く情報の少ない検索結果が、同じ単語のより詳しいキャッシュ済みの読みやピッチアクセントを消さなくなりました。「名古屋城」のような注釈は再スキャン後も表示されたままになり、クリック時のポップアップと一致します。',
    "On iPad YouTube, touching Yomu's subtitle controls no longer leaves YouTube's own controls permanently visible. Yomu releases only focus created by that completed touch—preserving keyboard, assistive-technology, programmatic, style-panel, and long-press interactions—so YouTube's normal auto-hide can finish.": 'iPad版YouTubeで、よむの字幕操作をタップした後にYouTube本来の操作ボタンが表示されたままになる問題を修正しました。よむは完了したタップで生じたフォーカスだけを解除し、キーボード、支援技術、プログラムによるフォーカス、スタイルパネル、長押しの操作は保持するため、YouTubeの通常の自動非表示が動作します。',
    "Firefox example-source cards now refresh through Yomu's sanitized DOM boundary instead of assigning dynamic": 'Firefoxの例文ソースカードは、動的な',
    '. The exact XPI is also linted before GitHub publication, so AMO warnings fail the release before a store submission is attempted.': 'を代入する代わりに、よむのサニタイズ済みDOM境界を通して更新されるようになりました。また、GitHubで公開する前に実際のXPIをlintするため、AMOの警告がある場合はストアへの送信前にリリースが失敗します。',
    "Local Yomitan lookup now queries both the expression and reading indexes even when their kana keys are identical. A Jiten/OCR card for やさしい can therefore hydrate the installed JMdict entries 易しい and 優しい without changing the card's exact pointer range, while duplicate index hits remain collapsed (GitHub #48).": 'ローカルYomitan検索は、かなキーが同一の場合でも、見出し語インデックスと読みインデックスの両方を検索するようになりました。Jiten/OCRの「やさしい」カードは、カードの正確なポインター範囲を変えずに、インストール済みJMdictの「易しい」と「優しい」の項目を取り込めます。両方のインデックスで一致した重複結果は引き続き1件にまとめられます（GitHub #48）。',
    'Status-colour dropdowns keep Pitch accent and None available and give the three study-state policies distinct, stable names: All study statuses, Primary deck status, and Anki status. An Anki-only setup no longer shows several indistinguishable “Anki status” choices (GitHub #40).': 'ステータス色のドロップダウンでは「ピッチアクセント」と「なし」を引き続き選択でき、3つの学習状態ポリシーに「すべての学習ステータス」「メインデッキのステータス」「Ankiのステータス」という個別の安定した名前が付きました。Ankiのみを使う設定でも、区別できない「Ankiのステータス」が複数表示されなくなりました（GitHub #40）。',
    "Reordering a local frequency dictionary now persists in both lookup-pill order and stored dictionary preferences, survives a delayed dictionary refresh, and cannot discard built-in links when imported frequency rows are added. BCCWJ can remain ahead of Jiten after Settings is reopened (GitHub #43).": 'ローカル頻度辞書の並び替えが、検索ピルの順序と保存済みの辞書設定の両方に保持され、遅延した辞書更新後も維持されるようになりました。取り込んだ頻度行を追加しても、組み込みリンクが失われません。「設定」を開き直しても、BCCWJをJitenより前に保てます（GitHub #43）。',
    'Dictionary import now accepts several Yomitan ZIP or JSON files in one file selection. Yomu imports them one at a time, keeps successful imports if another file fails, and reports one combined result (GitHub #41).': '辞書の取り込みで、1回のファイル選択から複数のYomitan ZIPまたはJSONファイルを選べるようになりました。よむは1件ずつ順番に取り込み、途中のファイルが失敗しても成功済みの辞書を残し、最後に結果をまとめて表示します（GitHub #41）。',
    "Recommended JMdict installation now completes in Firefox 153 with Tampermonkey, survives a full browser restart, and answers from the exact 525,069-entry local store instead of failing at Firefox's userscript/page binary boundary (GitHub #39).": 'Firefox 153とTampermonkeyでも推奨JMdictのインストールが完了し、ブラウザーを完全に再起動した後も保持され、Firefoxのユーザースクリプトとページ間のバイナリー境界で失敗せず、525,069件の正確なローカルストアから検索結果を返すようになりました（GitHub #39）。',
    'A new site now retries dictionary replication that an older Firefox import failure had permanently suppressed. If the first lookup opened before replication finished, that same card re-reads the completed local store instead of caching an empty result for 30 seconds (GitHub #43).': '新しいサイトでは、以前のFirefox取り込みエラーによって永久に停止していた辞書の複製を再試行するようになりました。複製が終わる前に最初の検索を開いた場合も、空の結果を30秒間保持せず、同じカードが完成したローカルストアを読み直します（GitHub #43）。',
    'Pausing annotations no longer disables subtitle hover-pause or text selection. Plain overlay and transcript captions remain selectable, pause the intended video while hovered, and do not turn the transparent player overlay into a click target (GitHub #42).': '注釈を一時停止しても、字幕へのホバーによる動画の一時停止やテキスト選択が無効にならなくなりました。注釈のないオーバーレイ字幕と文字起こし字幕を選択でき、ホバー中は対象の動画だけを一時停止し、透明なプレイヤー全体をクリック対象にはしません（GitHub #42）。',
    "With furigana, highlights, underlines, and text colours all off, automatic scanning leaves the page's native CJK text run intact. Turning those channels off also removes earlier word wrappers and number-counter binders so line breaks return to the site's own layout (GitHub #45).": 'ふりがな、背景色、下線、文字色をすべてオフにすると、自動スキャンはページ本来のCJKテキスト列を変更しません。これらの表示をオフへ切り替えた場合も、以前の単語ラッパーと数字・助数詞の結合要素を取り除き、改行をサイト本来の配置へ戻します（GitHub #45）。',
    'Hover popups stay open when Firefox briefly drops CSS hover during scrolling, keep their opening position while definitions hydrate, and give the cursor-to-popup gap a narrow travel corridor that prevents accidental word switches while crossing it (GitHub #44, #46, #47).': 'Firefoxがスクロール中にCSSのホバー状態を一時的に失っても、ホバーポップアップが閉じなくなりました。定義を読み込む間も最初の位置を保ち、カーソルからポップアップまでの隙間には細い移動経路を設け、そこを渡る途中で誤って別の単語へ切り替わらないようにしました（GitHub #44、#46、#47）。',
    'Hover lookup now resolves the glyph under the pointer when the lookup actually runs, including reader-owned OCR text and over-broad rendered tokens. In the reported NHK sentence, ニュース, full ことば including its final ば, and the separate やさしい span can no longer reuse a stale or neighbouring card (GitHub #48).': 'ホバー検索は、処理を実行する時点でポインター直下の文字を解決するようになりました。よむが生成したOCRテキストや、範囲が広すぎる描画済みトークンも対象です。報告されたNHKの文では、「ニュース」、「ば」を末尾に含む完全な「ことば」、独立した「やさしい」の範囲が、古いカードや隣のカードを再利用しなくなりました（GitHub #48）。',
    "Background dictionary replication no longer asks Firefox for persistent-storage permission on every site. Sources can disable imported dictionaries globally, and a confirmed action disables them and removes only the current site's local database while preserving the shared archive for a later re-enable (GitHub #49).": 'バックグラウンドでの辞書複製が、すべてのサイトでFirefoxの永続ストレージ許可を求めることはなくなりました。「出典」では取り込み済み辞書を全体で無効にでき、確認付きの操作から無効化と同時に現在のサイトのローカルデータベースだけを削除できます。共有アーカイブは、後で再度有効にできるよう保持します（GitHub #49）。',
    "Recommended dictionary installation now completes in Firefox 153 with Tampermonkey instead of failing after download on Firefox's cross-realm TypedArray restriction (GitHub #39). Download, integrity, ZIP streaming, decompression, and archive persistence all copy foreign binary results into Yomu's sandbox, while integrity and ZIP parsing reuse the same archive bytes.": 'Firefox 153とTampermonkeyでも、推奨辞書のインストールがダウンロード後にFirefoxの別領域TypedArray制限で失敗せず、最後まで完了するようになりました（GitHub #39）。ダウンロード、整合性確認、ZIPストリーム、展開、アーカイブ保存では、別領域から返されたバイナリをすべてYomuのサンドボックスへコピーし、整合性確認とZIP解析には同じアーカイブのバイト列を再利用します。',
    'Browsers without an automatic dictionary-download bridge now reliably offer the manual ZIP recovery instead of losing the stable recovery error behind a plain exception.': '辞書を自動ダウンロードするブリッジがないブラウザーでも、復旧用の識別可能なエラーが通常の例外に埋もれず、手動でZIPを追加する案内が確実に表示されるようになりました。',
    'Core releases no longer hang indefinitely while installing Playwright browsers: the browser bootstrap uses the CI-proven Node patch with a bounded timeout, then restores the audited release runtime before checks and builds.': 'コアリリースがPlaywrightブラウザーのインストール中に無期限で停止しないようになりました。ブラウザーの準備にはCIで実証済みのNodeパッチ版と制限時間を使い、検査とビルドの前に監査済みのリリース実行環境へ戻します。',
    'Furigana in scrolling panels such as YouTube live chat now moves in the same frame as the underlying text instead of visibly catching up after the scroll.': 'YouTubeのライブチャットなどのスクロールパネルで、ふりがなが元のテキストと同じフレームで移動するようになり、スクロール後に遅れて追いつく見た目のずれを解消しました。',
    'YouTube subtitle readings now stay complete when playback advances to the next line. The visible cue finishes enrichment before successor prefetch, and late lookup results can no longer replace richer cached annotations with a partial parse.': 'YouTube字幕は、再生が次の行へ進んでも読みが欠けず、すべて表示されるようになりました。後続行の先読みを始める前に、現在表示中の行の注釈付けを完了し、遅れて届いた検索結果が、より充実したキャッシュ済み注釈を不完全な解析結果で上書きすることもなくなりました。',
    'On iPad YouTube, Shorts action labels and the left mini-guide stay fully readable instead of gaining an ellipsis when Yomu annotates the page; video titles and reading content remain annotated.': 'iPad版YouTubeで、よむがページに注釈を付けても、Shortsの操作ラベルと左側のミニガイドが「…」で省略されず、最後まで読めるようになりました。動画タイトルと読解対象の本文には、引き続き注釈が付きます。',
    'X/Twitter video subtitles no longer show internal word-timing tags, character ranges, or their translated metadata alongside the dialogue.': 'X/Twitterの動画字幕では、内部の単語タイミングタグ、文字範囲、またはそれらを翻訳したメタデータが台詞と一緒に表示されなくなりました。',
    'Factory Reset now inventories and verifies every declared Yomu store, including the Firefox/Tampermonkey compatibility path, private settings, local study data, caches, dictionaries, and dictionary archives. If a store cannot be enumerated or cleared, reset stops with recovery guidance instead of reporting false success (GitHub #38).': 'Factory Resetでは、Firefox/Tampermonkey互換経路、非公開設定、端末内の学習データ、キャッシュ、辞書、辞書アーカイブを含む、よむが管理対象として宣言しているすべてのストアを一覧化して検証するようになりました。ストアを列挙または消去できない場合は、成功したと誤って報告せず、復旧手順を案内してリセットを中止します（GitHub #38）。',
    'A completed reset now advances a durable state generation, so stale tabs, origins, companion bundles, delayed writes, and surviving dictionary archives cannot restore deleted data.': 'リセットが完了すると永続的な状態世代が進むようになり、古いタブ、オリジン、コンパニオンバンドル、遅延書き込み、残存する辞書アーカイブから削除済みデータが復元されるのを防ぎます。',
    "Support status now has one forecast-backed monthly goal: the checked-in £10.20 bill is shown as £10 or the nearest whole unit in the reader's currency. Verified card, Ko-fi, Buy Me a Coffee, and PayPal receipts share the total with authenticated increases in Patreon's paid campaign-lifetime amount after the support Worker migrations are deployed; unfinished provider links stay hidden.": '支援状況の月間目標が、登録済みの運営費見積もりに基づくようになりました。£10.20の費用は£10、または読者の通貨で最も近い整数として表示されます。支援Workerの移行をデプロイすると、カード、Ko-fi、Buy Me a Coffee、PayPalの確認済み入金と、Patreonの支払い済みキャンペーン累計額の認証済み増分が同じ合計に加わります。準備が整っていないサービスのリンクは表示されません。',
    "Imported IPA now appears in the popup's pronunciation row for non-Japanese targets, while Japanese keeps pitch accent in the same surface. Reading and pronunciation controls follow the selected target, languages without pitch no longer show a pitch-unavailable row, and the catalogue labels IPA dictionaries as pronunciation sources rather than pitch.": '日本語以外の対象言語では、取り込んだIPAがポップアップの発音欄に表示されるようになりました。日本語では同じ場所に引き続きピッチアクセントを表示します。読みと発音の設定は選択中の対象言語に合わせて表示され、ピッチアクセントがない言語には「ピッチ利用不可」の行を表示しません。カタログでもIPA辞書をピッチではなく発音の出典として表示します。',
    'Local Study queues now stay on the selected target, and complete example sentences get the same Recall gap in Spanish and other targets as in Japanese. Card language and part of speech survive grading, reloads, and encrypted sync; when target audio is unavailable, Listen and Speak stay visible with a short availability note.': '端末内のStudyキューが、選択中の対象言語だけを扱うようになりました。スペイン語などの対象言語でも、完全な例文には日本語と同じ穴埋め式Recallが入ります。カードの言語と品詞は採点、再読み込み、暗号化同期を経ても保持されます。対象言語の音声が利用できない場合は、ListenとSpeakを消さず、短い案内とともに表示します。',
    'Subtitle tracks now prepare the active line while its successor starts concurrently, keep the last fully annotated row visible until the next is ready, and preserve that row through fullscreen video hand-offs. This removes the plain/loading flash and disappear/reappear frame around cue and fullscreen transitions.': '字幕トラックでは、現在の行を準備すると同時に次の行の処理を開始し、次の行の準備が整うまでは直前の注釈済みの行を表示したままにし、全画面表示で動画要素が切り替わる間もその行を保持するようになりました。これにより、字幕キューや全画面表示の切り替え時に、注釈のない行や読み込み中の表示が一瞬挟まったり、字幕が消えて再表示されたりする現象がなくなりました。',
    'Compounds without a defensible whole-expression pitch can now show exact pitch evidence for their aligned components while unresolved parts stay neutral. Subtitle component underlines also follow the subtitle pitch setting independently of page-word underline settings.': '語全体として確かなピッチアクセントを示せない複合語でも、対応付けできた構成要素には正確なピッチ情報を表示し、解決できない部分は中立表示のままにできるようになりました。字幕内の構成要素の下線も、ページ上の単語の下線設定とは独立して、字幕のピッチアクセント設定に従うようになりました。',
    'Pressing words now opens the lookup in every study language offered by the target picker, while Japanese keeps its existing boundaries. The homepage language rotator follows that lookup capability, and non-Japanese settings omit Japanese-only reading and pitch controls.': '対象言語ピッカーで選べるすべての学習言語で、単語を押すと検索が開くようになりました。日本語の既存の単語境界はそのまま維持されます。ホームページの言語ローテーターは検索機能の対応状況に連動し、日本語以外の設定では日本語専用の読みとピッチアクセントの操作項目を表示しません。',
    'Explicit annotation, furigana, OCR, YouTube, and subtitle visibility choices now survive refreshes and cannot be replaced by stale listeners or setup defaults. Rejected userscript, extension, and local-storage writes are reported instead of appearing to save successfully.': '明示的に選んだ注釈、ふりがな、OCR、YouTube、字幕表示の設定が再読み込み後も維持され、古いリスナーや初期設定で上書きされなくなりました。ユーザースクリプト、拡張機能、localStorage への書き込みが拒否された場合も、保存に成功したように見せずエラーを表示します。',
    'Reddit and other web components now annotate a painted Japanese control label when the component repeats the same text as its accessible name. This restores furigana and pitch on アワードを贈る without changing the button\'s size or click behavior.': 'RedditなどのWebコンポーネントで、表示されている日本語の操作ラベルとアクセシブル名が同じ場合も、そのラベルに注釈が付くようになりました。ボタンの大きさやクリック動作を変えずに、「アワードを贈る」のふりがなとピッチアクセントが表示されます。',
    'Japanese is the deepest today, with pitch accent, kanji and furigana. The dictionary catalogue now includes installable dictionaries with headwords across all 32 planned study languages. Full study-target reader behavior for all 32 remains in development. The interface itself speaks English and 日本語.': '日本語は現在、ピッチアクセント、漢字、ふりがなの対応が最も充実しています。辞書カタログには、予定されている32の学習言語すべてについて、見出し語を収録したインストール可能な辞書が追加されました。32言語すべてを学習対象として扱うリーダー機能は、引き続き開発中です。インターフェースは英語と日本語に対応しています。',
    'Firefox extension packages now split the packaged Study app into readable local modules and load the dictionary catalogue from a packaged runtime projection, keeping every JavaScript file within Mozilla Add-ons validation limits. This completes store delivery of the first-page onboarding and empty-dictionary setup path from 1.8.31 without minifying the source.': 'Firefox拡張機能では、同梱のStudyアプリを読みやすいローカルモジュールに分割し、辞書カタログを同梱の実行用データから読み込むことで、すべてのJavaScriptファイルをMozilla Add-onsの検証上限内に収めました。ソースを縮小せずに、1.8.31で追加した最初のページでの初期設定と、辞書が空の場合のセットアップ導線をストアへ届けます。',
    'New browser-extension installs now open setup on the first Japanese page and remember completion in shared extension storage. When the offline dictionary is still empty, lookup cards offer Finish setup, which opens Dictionary settings.': 'ブラウザー拡張機能を新しくインストールすると、最初に開いた日本語のページで初期設定が表示され、完了したことが拡張機能の共有ストレージに保存されます。オフライン辞書がまだ空の場合は、検索カードの「セットアップを完了」から辞書設定を開けます。',
    'Added installable Wiktionary dictionaries for all 32 study languages, with every archive mirrored and verified by its content hash.': '32の学習言語すべてに、インストールできるウィクショナリー辞書を追加しました。すべてのアーカイブをミラーし、コンテンツハッシュで検証しています。',
    'Public language claims now follow the shipped study-target roster and published dictionary catalogue. The homepage language fade displays supported study targets from those sources, while the feature guide reports the measured definition-language count.': '公開ページの言語対応表記を、出荷済みの学習言語一覧と公開辞書カタログに合わせました。ホームページの言語フェードには、これらの情報源で対応が確認できる学習言語が表示され、機能ガイドには実測した定義言語数が表示されます。',
    'Academy deck writes can no longer report success after browser storage rejects them. Cards are stored separately instead of rewriting one growing deck value, existing decks migrate safely, and Study shows a clear error if browser storage is full.': 'ブラウザーの保存処理に拒否された後で、Academyデッキの保存が成功したと表示されることはなくなりました。増え続ける1つのデッキ値を毎回書き直さず、カードを別々に保存します。既存のデッキは安全に移行され、保存容量が不足している場合はStudyに明確なエラーが表示されます。',
    'Reduced duplicate target-language registry and settings code so the Firefox extension package remains within AMO\'s content-script parse limit.': '対象言語レジストリと設定コードの重複を減らし、Firefox拡張機能パッケージがAMOのコンテンツスクリプト解析上限内に収まるようにしました。',
    // The ordered learning path. Keys stay verbatim because the hosted docs
    // localizer translates rendered text nodes rather than semantic message ids.
    'Learning path': '学習の道筋',
    'Learn Japanese': '日本語を学ぶ',
    '0. Start here': '0. ここから始める',
    '1. The approach': '1. 学び方',
    '2. Week one': '2. 最初の一週間',
    '3. Building a core': '3. 基礎語彙を作る',
    '4. Reading': '4. 読む',
    '5. Watching': '5. 観る',
    '6. Manga and games': '6. 漫画とゲーム',
    '7. Keeping words': '7. 単語を残す',
    '8. Staying with it': '8. 続ける',
    '9. Your own setup': '9. 自分の環境',
    '10. Reference': '10. リファレンス',
    'Apps overview': 'アプリ一覧',
    'Reference and help': 'リファレンスとヘルプ',
    'Homepage': 'ホームページ',
    'This guide moved': 'このガイドは移動しました',
    "Yomu's documentation now follows one ordered path from your first day to a power-user setup.": 'よむのドキュメントは、初日から上級者向けの設定までを一つの順序でたどる構成になりました。',
    'Permalink to "This guide moved"': '「このガイドは移動しました」へのパーマリンク',
    'Continue in the learning path →': '学習の道筋を続ける →',
    'Next:': '次へ：',
    'Start here': 'ここから始める',
    'An honest starting point for learning Japanese with Yomu, covering how long it takes, what to do each day, what runs without an install, and what Yomu leaves up to you.': 'よむで日本語を学び始めるための率直な案内です。必要な時間、毎日すること、インストールなしで使えるもの、そして自分で決めることを説明します。',
    'Permalink to "Start here"': '「ここから始める」へのパーマリンク',
    'Learning Japanese takes a long time. Not a year, whatever a course sells you. People who read every day for a couple of years get comfortable with ordinary material; people who study in bursts and stop take longer or stop for good. That is the honest shape of it, and everything here is built around making the daily part small enough that you keep doing it.': '日本語の習得には長い時間がかかります。どんな講座が宣伝していても、一年ではありません。数年間毎日読む人は普通の素材に慣れていきます。まとめて勉強して中断する人は、もっと時間がかかるか、そのままやめます。それが正直な姿です。ここにあるものは、毎日の分量を続けられるほど小さくするために作られています。',
    'Yomu is a popup dictionary that follows you around: web pages, videos, manga panels, PDFs and game screens. Press a word and you get its reading, its meaning, how it sounds and how common it is. Press again and you keep it, with the sentence where you found it.': 'よむは、ウェブページ、動画、漫画のコマ、PDF、ゲーム画面についてくるポップアップ辞書です。単語を押すと、読み、意味、音、使用頻度が分かります。もう一度押すと、見つけた文と一緒にその単語を残せます。',
    'That is the whole product. The rest of these pages are about what to do with it.': '製品の全体はこれです。残りのページでは、これをどう使うかを説明します。',
    'What you do': 'すること',
    'Permalink to "What you do"': '「すること」へのパーマリンク',
    'Read and watch things you almost understand, in volume. Look up what stops you. Keep the words that keep stopping you. Come back to them a few times. That is the method, and the next page explains why it works.': 'ほとんど分かるものを、たくさん読み、観ます。止まった所だけ調べます。何度も止める単語を残します。それらに数回戻ります。これが方法です。次のページで、なぜ効くのかを説明します。',
    'What Yomu will not do': 'よむがしないこと',
    'Permalink to "What Yomu will not do"': '「よむがしないこと」へのパーマリンク',
    'Yomu will not teach you kana. Do that first; it takes a few days and': 'よむは仮名を教えません。先に覚えてください。数日ででき、',
    'Week one': '最初の一週間',
    'says how. Yomu will not give you a fixed daily schedule. It will not decide which words matter to you.': 'にやり方があります。よむは固定の毎日計画を与えません。どの単語が自分に大切かも決めません。',
    'Academy is the planned course from first sounds to N1. It is in development and open by invitation while it is built. Until then, this learning path gives you an approach rather than a syllabus.': 'Academyは最初の音からN1までを扱う予定の講座です。開発中で、制作中は招待制です。それまでは、この学習の道筋が、シラバスではなく学び方を示します。',
    'Try Yomu before installing': 'インストール前によむを試す',
    'Permalink to "Try Yomu before installing"': '「インストール前によむを試す」へのパーマリンク',
    'Open the video player': '動画プレイヤーを開く',
    'Open the PDF reader': 'PDFリーダーを開く',
    'Press a word in the live OCR panel': '実際のOCRパネルで単語を押す',
    'When you want the dictionary on every page you visit, the add-on takes about a minute on Chrome or Firefox. Safari, iPhone and iPad use the userscript and take a couple of minutes.': '訪れるすべてのページで辞書を使いたくなったら、ChromeまたはFirefoxのアドオンは約一分で追加できます。Safari、iPhone、iPadではユーザースクリプトを使い、数分かかります。',
    'You do not need an account to read, look words up, keep a local deck or use Study. Yomu is free and open source.': '読む、単語を調べる、端末内のデッキを使う、Studyを使うためにアカウントは要りません。よむは無料のオープンソースです。',
    'The approach: why this works →': '学び方：なぜ効くのか →',
    'The approach': '学び方',
    'Why comprehensible input, frequent reading and a small amount of review work together when you are learning Japanese.': '理解できるインプット、頻繁な読書、少量の復習が、日本語学習でどう一緒に働くかを説明します。',
    'Permalink to "The approach"': '「学び方」へのパーマリンク',
    'You learn Japanese by understanding Japanese.': '日本語を理解することで、日本語を学びます。',
    'When a sentence is mostly words you know plus one you do not, the sentence itself teaches you part of the new word. The scene supplies the rest. Stephen Krashen called this comprehensible input. People often shorten the idea to': '文の大半が知っている単語で、知らない単語が一つだけなら、その文自体が新しい単語の一部を教えます。残りは場面が補います。スティーヴン・クラッシェンはこれを理解可能なインプットと呼びました。この考えはよく',
    ': what you understand now, plus one reachable step.': 'と略されます。今理解できるものに、届く一歩を足すという意味です。',
    'The name is less useful than the test. Can you follow what is happening? Can you guess some missing words before you look them up? If the answer is yes, the material is doing its job.': '名前より判定法の方が役に立ちます。何が起きているか追えますか。調べる前に、知らない単語をいくつか推測できますか。できるなら、その素材は役目を果たしています。',
    'Volume changes the language': '量が言葉を変える',
    'Permalink to "Volume changes the language"': '「量が言葉を変える」へのパーマリンク',
    'The first time you meet a word, it is a fact. The fifth time, it has neighbours. After enough encounters it starts arriving before the translation.': '初めて会う単語は一つの事実です。五回目には周りの言葉ができます。十分に会うと、訳より先に浮かぶようになります。',
    'This is why volume beats a perfect drill. A drill can make one answer available. Reading and listening show you who says the word, what comes before it, which grammar holds it together and what it sounds like at speed.': 'だから、量は完璧な練習問題より強いのです。練習問題は一つの答えを出せるようにします。読んだり聞いたりすると、誰がその単語を言うか、前に何が来るか、どの文法が支えるか、速い発話でどう聞こえるかが分かります。',
    'Most of your first language arrived through thousands of encounters where the meaning was obvious. That machinery still works in adults. You also have something a child lacks: you can notice a pattern, check a word and go straight back to the page.': '母語の大半は、意味が明らかな場面に何千回も出会うことで身につきました。その仕組みは大人にも残っています。大人には子どもにないものもあります。型に気づき、単語を確認し、すぐページへ戻れます。',
    'Keep the interruption short': '中断を短くする',
    'Permalink to "Keep the interruption short"': '「中断を短くする」へのパーマリンク',
    'The practical loop is plain:': '実際の流れは単純です。',
    'Pick something you nearly understand and actually want to finish.': 'ほとんど理解できて、本当に最後まで見たいものを選びます。',
    'Press a word when it blocks the sentence.': '文を止める単語を押します。',
    'Read the meaning and return to the sentence.': '意味を読み、文へ戻ります。',
    'Keep the word if it matters again.': 'もう一度大切になったら、その単語を残します。',
    'Review enough to recognise it next time.': '次に気づけるだけ復習します。',
    'Do not turn every page into a test. Do not mine every unknown word. The point is to get back to the story.': 'すべてのページを試験にしないでください。知らない単語を全部採集しないでください。物語へ戻ることが目的です。',
    'There is no perfect ratio': '完璧な配分はない',
    'Permalink to "There is no perfect ratio"': '「完璧な配分はない」へのパーマリンク',
    'Some people review for an hour and read for two. Some read every day and review only the words that refuse to stick. The only right answer is the approach you are able to keep doing.': '一時間復習して二時間読む人もいます。毎日読み、どうしても覚えない単語だけ復習する人もいます。唯一の正解は、自分が続けられる方法です。',
    'Yomu keeps each part close so changing the balance costs little. You can read with the local dictionary alone, use the built-in deck, or send words to the study system you already trust.': 'よむは各部分を近くに置くので、配分を変える手間が少なく済みます。端末内の辞書だけで読むことも、内蔵デッキを使うことも、信頼している学習システムへ単語を送ることもできます。',
    'Week one: what to do today →': '最初の一週間：今日すること →',
    'Learn kana, install Yomu, look up a first word, leave furigana on, and begin with Japanese you can nearly follow.': '仮名を覚え、よむを入れ、最初の単語を調べ、ふりがなを表示したまま、ほとんど分かる日本語から始めます。',
    'Permalink to "Week one"': '「最初の一週間」へのパーマリンク',
    'Learn hiragana. Start reading before it feels sensible.': 'ひらがなを覚えます。まだ早いと思ううちに読み始めます。',
    'Hiragana will be your bread and butter. Learn to recognise it without turning each character into a picture or an English sound. Katakana comes next. You do not need beautiful handwriting, every kanji or a grammar textbook finished from cover to cover.': 'ひらがなは読むための主食になります。一文字ずつ絵や英語の音に置き換えず、見て分かるようにします。次はカタカナです。きれいな字、すべての漢字、最初から最後まで終えた文法書は要りません。',
    'Use any kana course you will complete. A few short sessions each day for a week is a better start than collecting the perfect course.': '最後まで終えられる仮名教材なら何でも構いません。一週間、毎日短い練習を数回する方が、完璧な教材を集めるより良い出発になります。',
    'Chrome, Edge, Brave and Opera use the': 'Chrome、Edge、Brave、Operaでは',
    'Chrome store': 'Chromeストア',
    '. Firefox and Firefox for Android use the': 'を使います。FirefoxとAndroid版Firefoxでは',
    'Firefox store': 'Firefoxストア',
    '. Choose Add, then open a Japanese page.': 'を使います。追加を選び、日本語のページを開きます。',
    'Safari, iPhone and iPad use the free Userscripts app:': 'Safari、iPhone、iPadでは無料のUserscriptsアプリを使います。',
    'Install Userscripts from the App Store and open it once.': 'App StoreからUserscriptsをインストールし、一度開きます。',
    'Open the Safari extension settings, turn Userscripts on and allow it on all websites.': 'Safariの機能拡張設定を開き、Userscriptsをオンにして、すべてのウェブサイトで許可します。',
    'in Safari.': 'をSafariで開きます。',
    "Open Safari's page menu, choose Userscripts, then install the detected script.": 'Safariのページメニューを開き、Userscriptsを選び、検出されたスクリプトをインストールします。',
    'Other browsers can use Tampermonkey or another userscript manager. If the link downloads a JavaScript file, open the manager and choose Install from URL with': 'ほかのブラウザーではTampermonkeyなどのユーザースクリプト管理ツールを使えます。リンクからJavaScriptファイルがダウンロードされた場合は、管理画面を開き、次のURLで「URLからインストール」を選びます。',
    'Press your first word': '最初の単語を押す',
    'Permalink to "Press your first word"': '「最初の単語を押す」へのパーマリンク',
    'or a': 'または',
    'Tadoku free book': '多読の無料図書',
    '. Press a Japanese word.': 'を開きます。日本語の単語を押してください。',
    'The popup shows the reading, meaning, pitch accent, frequency, audio and example sentences. Press a kanji in the headword when you want its readings or stroke order. Save the word only if you want to meet it again.': 'ポップアップには読み、意味、ピッチアクセント、頻度、音声、例文が表示されます。漢字の読みや筆順が必要なら、見出し語の漢字を押します。また会いたい単語だけ保存してください。',
    'Yomu installs a starter dictionary for your definition language. That dictionary stays on your device and works without a connection. You can add more later.': 'よむは、定義に使う言語の初期辞書をインストールします。その辞書は端末内に残り、オフラインでも動きます。追加は後でできます。',
    'A Yomu word panel open on a real Japanese article, showing the headword, reading, pitch, definition and grading buttons.': '実際の日本語記事で開いたよむの単語パネル。見出し語、読み、ピッチ、定義、評価ボタンが表示されています。',
    'The word panel on a real Japanese article.': '実際の日本語記事上の単語パネル。',
    'Leave furigana on': 'ふりがなを表示したままにする',
    'Permalink to "Leave furigana on"': '「ふりがなを表示したままにする」へのパーマリンク',
    'Start with furigana above every word. A missing reading should never leave you wondering whether Yomu failed or expected you to know it. Later you can show readings only for uncommon kanji, hide them on known words or turn them off.': '最初はすべての単語にふりがなを表示します。読みがないと、よむが失敗したのか、自分が知っている前提なのか迷います。後から、珍しい漢字だけに表示したり、既知語では隠したり、オフにしたりできます。',
    'The coloured underlines show pitch accent. Word colours can show whether a word is new, learning, known or due. Notice them. Do not memorise the legend today.': '色付きの下線はピッチアクセントを示します。単語の色は、新規、学習中、既知、復習期限を示せます。存在だけ見てください。今日は凡例を暗記しなくて構いません。',
    'Ignore the settings': '設定を気にしない',
    'Permalink to "Ignore the settings"': '「設定を気にしない」へのパーマリンク',
    'The defaults are enough for the first week. Do not connect five services. Do not import a shelf of dictionaries. Read one short thing, press a few words and come back tomorrow.': '最初の一週間は初期設定で十分です。五つのサービスをつながないでください。辞書を棚いっぱい取り込まないでください。短いものを一つ読み、いくつかの単語を押し、明日また戻ります。',
    'If Yomu does not appear, allow it on the site in the browser extension or userscript menu, then refresh. The': 'よむが表示されない場合は、ブラウザー拡張機能またはユーザースクリプトのメニューでそのサイトを許可し、再読み込みします。',
    'covers the common failures.': 'には、よくある問題への対処があります。',
    'Building a core: which words matter first →': '基礎語彙を作る：最初に大切な単語 →',
    'Building a core': '基礎語彙を作る',
    'Build a useful base of frequent Japanese words without mistaking a vocabulary count for reading ability.': '語彙数を読解力と取り違えず、頻出する日本語の役立つ土台を作ります。',
    'Permalink to "Building a core"': '「基礎語彙を作る」へのパーマリンク',
    'Learn common words first. Do not wait to finish them.': 'よく使う単語から覚えます。全部終わるまで待たないでください。',
    'Frequency lists are useful because Japanese is uneven. A small group of words appears everywhere; thousands more wait inside particular genres, jobs, games and friendships.': '日本語の出現頻度には偏りがあるため、頻度表は役に立ちます。少数の単語はどこにでも現れます。さらに何千もの単語が、特定のジャンル、仕事、ゲーム、友人関係の中で待っています。',
    'The most common 2,000 words do most of the work: in everyday text roughly four words out of five are drawn from them, and in casual speech even more. The rest is the long tail, and the long tail is what lookups are for.': '最もよく使われる2,000語が大半の仕事をします。日常的な文章では、およそ五語に四語がそこから現れ、くだけた会話ではさらに多くなります。残りは長い裾野です。その裾野のために検索があります。',
    'That does not mean 2,000 words lets you read 80 percent of Japanese comfortably. The familiar figure comes from English word-family research, and Japanese coverage grows differently. A token you recognise is not the same as a sentence you understand. Grammar, names and the shape of the words around it still matter.': 'これは、2,000語で日本語の80パーセントを楽に読めるという意味ではありません。よく知られた数字は英語の語族研究に由来し、日本語のカバー率は違う形で伸びます。語を見分けられることと、文を理解できることは同じではありません。文法、固有名詞、周りの語形も大切です。',
    'Use a list as a ramp': '単語表を助走路にする',
    'Permalink to "Use a list as a ramp"': '「単語表を助走路にする」へのパーマリンク',
    'A frequency deck can make the first months less noisy. Learn enough common verbs, particles, adjectives and everyday nouns that easy sentences have a frame.': '頻度順デッキは最初の数か月の雑音を減らします。簡単な文に骨組みが見える程度まで、よく使う動詞、助詞、形容詞、日常名詞を覚えます。',
    "Pick one source. A beginner textbook deck, a common-word deck in JPDB or Anki, or Yomu's local deck can all do the job. Changing lists every week teaches you how to change lists.": '一つの出典を選びます。初級教科書のデッキ、JPDBやAnkiの頻出語デッキ、よむの端末内デッキのどれでも役目を果たせます。毎週単語表を替えると、単語表の替え方だけが上達します。',
    'Yomu shows frequency evidence in the popup and can tint words by study state. Use those hints when two unknown words compete for your attention. The common one is more likely to pay rent soon.': 'よむはポップアップに頻度の根拠を示し、学習状態で単語に色を付けられます。二つの未知語のどちらを見るか迷ったときに使います。よく使う方が、早く元を取れる可能性があります。',
    'Let your reading correct the list': '読書で単語表を直す',
    'Permalink to "Let your reading correct the list"': '「読書で単語表を直す」へのパーマリンク',
    'A general list does not know what you read. A cooking channel teaches ingredients early. A detective novel teaches alibis. A game teaches the verbs in its menus until they become automatic.': '一般的な単語表は、あなたが何を読むか知りません。料理チャンネルでは材料を早く覚えます。推理小説ではアリバイを覚えます。ゲームではメニューの動詞を自動で分かるまで繰り返します。',
    'Keep words that recur in your material. Leave a rare word alone if the sentence already makes sense. Your personal core starts inside the general core and then grows in the direction of your life.': '自分の素材で繰り返す単語を残します。文の意味がもう分かるなら、珍しい単語は放っておきます。自分の基礎語彙は一般的な基礎の中から始まり、自分の生活の方向へ伸びます。',
    'Stop counting when the count stops helping': '数が役立たなくなったら数えるのをやめる',
    'Permalink to "Stop counting when the count stops helping"': '「数が役立たなくなったら数えるのをやめる」へのパーマリンク',
    'Word totals are useful while they make progress visible. They become a problem when you postpone reading until a number gives you permission.': '総単語数は、進歩を見えるようにする間は役に立ちます。数字が許可を出すまで読書を延期するようになると、問題になります。',
    'Start reading now. Reviews build the floor; pages and scenes build the room.': '今読み始めてください。復習が床を作り、ページと場面が部屋を作ります。',
    'Reading something you cannot quite read →': 'まだ少し読めないものを読む →',
    'Use tadoku, popup lookup, furigana, PDFs and kanji drilldown to read Japanese for the story instead of stopping at every word.': '多読、ポップアップ検索、ふりがな、PDF、漢字の掘り下げを使い、すべての単語で止まらず物語のために日本語を読みます。',
    'Read something easier than your ambition.': '自分の野心より易しいものを読んでください。',
    'Tadoku is extensive reading: lots of easy Japanese, read for the story rather than the study. Sakai Kunihide and the NPO Tadoku Supporters put the method into four plain rules: start with easy books, read without reaching for a dictionary, skip what you do not understand and leave a book when it stops being enjoyable.': '多読とは、勉強のためではなく物語のために、易しい日本語をたくさん読むことです。酒井邦秀とNPO多言語多読は、この方法を四つの分かりやすい約束にまとめました。易しい本から始め、辞書を引かずに読み、分からない所は飛ばし、楽しくなくなった本はやめます。',
    'Yomu changes one part of that without changing the point. The skip has a memory. Press the word, glance at the answer, keep reading, and let the useful ones come back in Study after you finish.': 'よむは目的を変えずに一か所だけ変えます。飛ばしたことを覚えておけます。単語を押し、答えを一目見て、読み続けます。読み終わった後、役立つ単語をStudyで再び出します。',
    'Read for the sentence': '文のために読む',
    'Permalink to "Read for the sentence"': '「文のために読む」へのパーマリンク',
    'Press fewer words than you could. If the picture, grammar or next line gives you the meaning, keep going. Look up the word that blocks the sentence, not every word you could add to a deck.': '押せる単語より少なく押します。絵、文法、次の行から意味が分かるなら、そのまま進みます。デッキに追加できるすべての単語ではなく、文を止める単語を調べます。',
    'Start with graded readers and short learner stories. Move to easy news, web articles, manga with generous context and books ranked near your level. Re-read things you liked. The second pass is where slow Japanese starts feeling like reading.': '段階別読み物と短い学習者向け物語から始めます。易しいニュース、ウェブ記事、文脈の豊かな漫画、自分の水準に近い本へ進みます。好きだったものを読み直してください。二回目に、遅い日本語が読書らしくなり始めます。',
    'Useful places to begin:': '始めやすい場所：',
    'Let the page help': 'ページに助けてもらう',
    'Permalink to "Let the page help"': '「ページに助けてもらう」へのパーマリンク',
    'Furigana can appear above every word, only uncommon kanji or only words you have not learned. Pitch underlines show the accent pattern. Study-state colours show what is new, learning, known or due.': 'ふりがなは、すべての単語、珍しい漢字だけ、まだ覚えていない単語だけに表示できます。ピッチの下線はアクセント型を示します。学習状態の色は、新規、学習中、既知、復習期限を示します。',
    'The popup brings together the reading, meanings in your chosen language, frequency, pitch, audio, examples and the state held by your study services. Imported Yomitan dictionaries answer on your device. Source tabs can add Jiten, Bunpro, JPDB and other entries when you enable them.': 'ポップアップには、読み、選んだ言語の意味、頻度、ピッチ、音声、例文、学習サービスが持つ状態が集まります。取り込んだYomitan辞書は端末上で答えます。出典タブを有効にすると、Jiten、Bunpro、JPDBなどの項目を追加できます。',
    'Slow down on one kanji': '一つの漢字で立ち止まる',
    'Permalink to "Slow down on one kanji"': '「一つの漢字で立ち止まる」へのパーマリンク',
    'Press a kanji in the headword. The drilldown can show on and kun readings, stroke count, school grade, JLPT level, RTK keywords, components, related words and animated KanjiVG stroke order. A drawing pad lets you trace it before returning to the sentence.': '見出し語の漢字を押します。掘り下げ画面には、音読みと訓読み、画数、学年、JLPT水準、RTKキーワード、部品、関連語、KanjiVGの筆順アニメーションを表示できます。文へ戻る前に、描画パッドでなぞれます。',
    'A Yomu kanji drilldown showing readings, source facts and a KanjiVG stroke practice pad.': '読み、出典別情報、KanjiVGの書き取りパッドを表示したよむの漢字掘り下げ画面。',
    'One kanji, opened from the word you were reading.': '読んでいた単語から開いた一つの漢字。',
    'Open a PDF without installing anything': 'インストールなしでPDFを開く',
    'Permalink to "Open a PDF without installing anything"': '「インストールなしでPDFを開く」へのパーマリンク',
    'The': 'この',
    'opens a PDF from your computer and gives its text layer the same popup. Scanned pages can use OCR once you turn image reading on. The file stays on your device.': 'は、コンピューター上のPDFを開き、そのテキスト層で同じポップアップを使えるようにします。画像読み取りをオンにすると、スキャン済みページでもOCRを使えます。ファイルは端末内に残ります。',
    'Browser-supported text, PDF text, furigana and dictionary lookup are different doors into the same room. Pick the one your book needs.': 'ブラウザー対応の文字、PDFの文字、ふりがな、辞書検索は、同じ部屋への別々の扉です。本に必要な扉を選んでください。',
    'Watching things you actually enjoy →': '本当に楽しめるものを観る →',
    'Watching': '観る',
    'Learn from Japanese video with lookup-ready subtitles, a transcript, shadowing, batch mining and a YouTube feed tuned toward useful input.': '検索できる字幕、文字起こし、シャドーイング、一括採集、役立つインプットへ調整したYouTubeフィードで、日本語動画から学びます。',
    'Permalink to "Watching"': '「観る」へのパーマリンク',
    'Watch the thing you would have watched anyway.': 'どのみち観るつもりだったものを観てください。',
    'Choose a video where you can follow the scene before you understand every line. Watch once for the gist. On the second pass, pause where curiosity is stronger than momentum.': 'すべての台詞を理解する前でも場面を追える動画を選びます。一回目は大意のために観ます。二回目は、先へ進む気持ちより好奇心が強い所で止めます。',
    'Read one line': '一行を読む',
    'Permalink to "Read one line"': '「一行を読む」へのパーマリンク',
    "Yomu draws a Japanese subtitle line over the site's own player. Every word can open the same popup you use on a page. A second subtitle track can sit underneath when you need support.": 'よむはサイト本来のプレイヤー上に日本語字幕を描きます。各単語から、ページと同じポップアップを開けます。助けが必要なら、二つ目の字幕トラックを下に表示できます。',
    'Choose how much help that native translation gives you:': '母語訳をどの程度の助けとして使うか選べます：',
    'Blur until reveal': '表示するまでぼかす',
    'keeps it available on hover, keyboard focus or tap;': 'では、ホバー、キーボードフォーカス、タップで必要なときだけ表示できます；',
    'Always show': '常に表示',
    'keeps it readable;': 'では常に読めます；',
    'Hide completely': '完全に隠す',
    'removes it and its space. Blur until reveal is the recommended starting point. Its concealment-strength slider sits in the subtitle-style control beside subtitle size, and Yomu remembers the choice across videos and sites.': 'では母語訳とその表示スペースを取り除きます。最初は「表示するまでぼかす」がおすすめです。ぼかしの強さは、字幕サイズの隣にある字幕スタイル操作で調整でき、よむは動画やサイトをまたいで選択を記憶します。',
    'Open the transcript to see the active line in context and jump back to something you missed. The panel can sit beside or below the player, follows the current cue and becomes a bottom sheet on a phone. Locate returns it to the current line after you scroll away.': '文字起こしを開くと、現在の行を文脈の中で見て、聞き逃した所へ戻れます。パネルはプレイヤーの横か下に置け、現在のキューを追い、スマートフォンでは下部シートになります。離れた所へスクロールした後は「位置へ戻る」で現在の行へ戻ります。',
    'The Shadow tab holds one line. Replay it, loop it, hide the text, say it aloud and reveal it again. Previous-line, next-line, copy and mine shortcuts keep your hands off the mouse.': 'Shadowタブは一行を保ちます。再生し、繰り返し、文字を隠し、声に出し、もう一度表示します。前の行、次の行、コピー、採集のショートカットがあれば、マウスに手を伸ばさずに済みます。',
    'Yomu annotating a real Japanese YouTube subtitle with the transcript panel open beside the player.': '実際の日本語YouTube字幕に読みを付け、プレイヤー横に文字起こしパネルを開いたよむ。',
    'A real YouTube subtitle and its transcript.': '実際のYouTube字幕と文字起こし。',
    'Retune YouTube': 'YouTubeを調整する',
    'Permalink to "Retune YouTube"': '「YouTubeを調整する」へのパーマリンク',
    'Yomu can filter recommendations, search results and sidebars toward Japanese and comprehensible-input videos. English-titled learner channels stay visible. A temporary notice tells you what was hidden, and the configurable YouTube shortcut reveals the full feed again.': 'よむは、おすすめ、検索結果、サイドバーを、日本語と理解可能なインプットの動画へ絞れます。英語の題名を使う学習者向けチャンネルも残ります。一時的な通知で隠した内容を確認でき、設定可能なYouTubeショートカットで全フィードを再表示できます。',
    'When the feed is still empty, the starter guide offers about 100 channels sorted by rough level, from beginner listening to native material. Subscribe to a few you would watch without a study plan.': 'フィードがまだ空なら、初級の聞き取りから母語話者向け素材まで、およその水準で分けた約100チャンネルの入門ガイドがあります。学習計画がなくても観たいものをいくつか登録してください。',
    'Open your own files': '自分のファイルを開く',
    'Permalink to "Open your own files"': '「自分のファイルを開く」へのパーマリンク',
    'runs on the site with nothing installed. Open or drop a browser-supported video and its': 'は、何もインストールせずサイト上で動きます。ブラウザー対応の動画と、その',
    'subtitle files. The files stay on your device. Browser codec support decides which video formats will play.': '字幕ファイルを開くかドロップします。ファイルは端末内に残ります。再生できる動画形式はブラウザーのコーデック対応で決まります。',
    'The player uses the same subtitle line, transcript, second track, Shadow tab and shortcuts. Jimaku search helps you find subtitles you are entitled to use.': 'プレイヤーでは、同じ字幕行、文字起こし、第二トラック、Shadowタブ、ショートカットを使えます。Jimaku検索は、利用権のある字幕を探す手助けになります。',
    'The hosted Yomu video player running a local video and Japanese subtitle file with the transcript open.': '端末内の動画と日本語字幕ファイルを再生し、文字起こしを開いたサイト版よむ動画プレイヤー。',
    'Your file, opened in the hosted player.': 'サイト版プレイヤーで開いた自分のファイル。',
    'Finish the episode first': '先に一話を見終える',
    'Permalink to "Finish the episode first"': '「先に一話を見終える」へのパーマリンク',
    'Batch Mine scans the loaded transcript after you watch. It compares the words with what you know, deduplicates them and puts likely one-unknown-word sentences first. Add, grade or copy the useful candidates in one pass.': 'Batch Mineは視聴後に読み込んだ文字起こしを調べます。単語を既知語と比べ、重複を除き、未知語が一つらしい文を先に並べます。役立つ候補をまとめて追加、評価、コピーできます。',
    'Video lines can already keep their sentence and an optional frame. Broader sentence-audio mining is in development, so treat audio on a mined sentence as source-dependent for now.': '動画の行は、すでに文と任意のフレームを残せます。より広い文音声の採集機能は開発中です。当面、採集した文の音声は出典次第と考えてください。',
    'Manga and games: Japanese inside pictures →': '漫画とゲーム：画像の中の日本語 →',
    'Manga and games': '漫画とゲーム',
    'Read Japanese trapped inside manga panels, screenshots and game frames with OCR, while keeping image requests explicit.': '画像の読み取りを明示的な操作に保ちながら、OCRで漫画のコマ、スクリーンショット、ゲーム画面の中にある日本語を読みます。',
    'Permalink to "Manga and games"': '「漫画とゲーム」へのパーマリンク',
    'Some Japanese is trapped in a picture.': '画像の中に閉じ込められた日本語もあります。',
    'OCR turns the text inside a manga panel, screenshot or game frame into words you can press. The picture stays where it is. The usual lookup opens over it.': 'OCRは漫画のコマ、スクリーンショット、ゲーム画面の文字を押せる単語に変えます。画像はその場に残ります。いつもの検索が画像の上に開きます。',
    'Permalink to "Read manga"': '「漫画を読む」へのパーマリンク',
    'Some manga pages ship recognised text beside the image, as Mokuro pages do. Yomu reads that embedded text immediately. Other pages need an OCR provider after you ask for a scan.': 'Mokuroページのように、画像と一緒に認識済み文字を配信する漫画ページがあります。よむはその埋め込み文字をすぐ読みます。ほかのページでは、スキャンを頼んだ後にOCR提供元が必要です。',
    "Press a panel or use Scan images. Yomu can use Google Lens, your Google Cloud Vision key, a compatible local service or the browser extension's screenshot path. The": 'コマを押すか「画像をスキャン」を使います。よむはGoogle Lens、自分のGoogle Cloud Visionキー、対応するローカルサービス、ブラウザー拡張機能のスクリーンショット経路を使えます。',
    'live OCR panel on the homepage': 'ホームページの実際のOCRパネル',
    'lets you try the loop with nothing installed.': 'では、何もインストールせずこの流れを試せます。',
    "Compatible local endpoints include MangaOCR, PaddleOCR, Apple Vision-style wrappers and services that return Yomu's supported JSON shape. Choose the provider and endpoint under Settings → Images. A local OCR endpoint can run on your own computer; Google Lens and Cloud Vision are network services.": '互換性のあるローカルエンドポイントには、MangaOCR、PaddleOCR、Apple Vision形式のラッパー、よむが対応するJSON形式を返すサービスがあります。設定 → 画像でプロバイダーとエンドポイントを選びます。ローカルOCRエンドポイントは自分のコンピューター上で動かせます。Google LensとCloud Visionはネットワークサービスです。',
    'Image reading is request-driven. A page image is not sent for recognition until you press it or choose a scan command. The provider you chose receives the requested image. Embedded OCR and local services keep that work on the device or endpoint you control.': '画像読み取りは依頼したときだけ動きます。ページ画像は、押すかスキャン命令を選ぶまで認識へ送られません。選んだ提供元が、依頼した画像を受け取ります。埋め込みOCRとローカルサービスでは、処理を自分が管理する端末または接続先に保てます。',
    'Stylised lettering, tiny furigana, sound effects and text crossing artwork can confuse any OCR system. Check the sentence when a result looks wrong. A lookup tool cannot repair a bad scan.': '装飾文字、小さなふりがな、効果音、絵に重なる文字は、どのOCRも迷わせます。結果がおかしければ文を確認してください。検索機能は悪いスキャンを直せません。',
    'Read a game frame': 'ゲーム画面を読む',
    'Permalink to "Read a game frame"': '「ゲーム画面を読む」へのパーマリンク',
    'Yomu Gaming is a separate desktop app for Windows, macOS, Linux and Steam Deck desktop mode. Open it, choose a whole-screen or region capture shortcut, then press that shortcut during a scene. The captured Japanese becomes the same pressable reading surface.': 'Yomu GamingはWindows、macOS、Linux、Steam Deckのデスクトップモード向けの別アプリです。開いて、全画面または範囲撮影のショートカットを選び、場面の途中で押します。撮影した日本語が、同じ押せる読書画面になります。',
    'The default recognition path needs a connection. You can point Gaming at Cloud Vision or a compatible local reader. Busy games are easier when you capture only the dialogue box.': '標準の認識経路には通信が必要です。GamingをCloud Visionまたは対応するローカル読み取り機へ向けられます。画面の情報が多いゲームでは、会話欄だけ撮影すると読みやすくなります。',
    'Keep the source with the word': '単語と出典を一緒に残す',
    'Permalink to "Keep the source with the word"': '「単語と出典を一緒に残す」へのパーマリンク',
    'A saved OCR word can carry its sentence and source image when the mining target supports them. That matters in manga and games because the picture often explains what the line leaves unsaid.': '採集先が対応していれば、保存したOCR単語に文と元画像を付けられます。漫画やゲームでは、台詞に書かれていないことを絵が説明するため、この情報が役立ちます。',
    'Do not mine a broken OCR result. Correct it or let it go.': '間違ったOCR結果は採集しないでください。直すか、手放します。',
    'Keeping words without building a second job →': '第二の仕事を作らずに単語を残す →',
    'Keeping words': '単語を残す',
    'Save words with their original context, review them through active recall, and use Yomu Study with local or connected sources.': '単語を元の文脈と一緒に保存し、能動的に思い出して復習し、端末内または接続した出典とよむStudyを使います。',
    'Permalink to "Keeping words"': '「単語を残す」へのパーマリンク',
    'Keep fewer words than you want to keep.': '残したい数より少ない単語を残してください。',
    'Save a word when it blocks you twice, names something you care about or completes a sentence you want to remember. Leave the rest in the book. Collection is fast. Reviews are where the bill arrives.': '同じ単語に二度止められたとき、大切なものの名前だったとき、覚えたい文を完成させるときに保存します。残りは本に置いてきます。集めるのは速く、支払いは復習で来ます。',
    'Mine the whole moment': '場面全体を採集する',
    'Permalink to "Mine the whole moment"': '「場面全体を採集する」へのパーマリンク',
    'A saved word can carry the word, reading, meaning and source sentence. Video and OCR sources can add an image. Word audio is available from the sources you enable. Fuller sentence-audio mining is in development.': '保存した単語には、単語、読み、意味、出典文を付けられます。動画とOCRの出典は画像も追加できます。有効にした出典から単語音声を使えます。より完全な文音声の採集機能は開発中です。',
    "Send the card to Yomu's local deck, Anki, Jiten, Bunpro or JPDB. WaniKani can supply its kanji and vocabulary state. The popup shows what each connected source already knows so you do not start a duplicate pile by accident.": 'カードをよむの端末内デッキ、Anki、Jiten、Bunpro、JPDBへ送れます。WaniKaniは漢字と語彙の状態を提供できます。ポップアップには各接続先がすでに知っている内容が表示されるため、誤って重複した山を作らずに済みます。',
    'Anki note fields are yours. Yomu can fill the expression, reading, definition, sentence, audio and image fields you map. Mobile handoff can open a new card in AnkiMobile or AnkiDroid; full deck scanning and updates use desktop AnkiConnect.': 'Ankiのノート項目は自分で決められます。よむは割り当てた表記、読み、定義、文、音声、画像の項目を埋められます。モバイル受け渡しはAnkiMobileまたはAnkiDroidで新規カードを開けます。デッキ全体の検査と更新にはデスクトップ版AnkiConnectを使います。',
    'Permalink to "Open Study"': '「Studyを開く」へのパーマリンク',
    'runs on the site with nothing installed. Add it to a phone or tablet Home Screen and it opens like an app. After the first load, the shell and cached cards work offline. Ratings wait and retry when a connected provider comes back; Bunpro needs a live session.': 'は、何もインストールせずサイト上で動きます。スマートフォンやタブレットのホーム画面に追加すると、アプリのように開きます。初回読み込み後は、画面とキャッシュ済みカードがオフラインでも動きます。評価は接続先が戻るまで待って再送されます。Bunproには有効なセッションが必要です。',
    'Study reviews Anki when it is reachable, connected Japanese services when selected, and local dictionary words without an account. Library searches the words. Stats shows the work over time.': 'Studyは、到達できるときにAnkiを、選択したときに接続済みの日本語サービスを、アカウントなしでは端末内辞書の単語を復習します。Libraryでは単語を検索できます。Statsでは時間の経過に沿って学習量を確認できます。',
    'Study runs on the site with nothing installed. Add it to a phone or tablet Home Screen and it opens like an app. After the first load, the shell and cached cards work offline. Ratings wait and retry when a connected provider comes back; Bunpro needs a live session.': 'Studyは何もインストールせずサイト上で動きます。スマートフォンやタブレットのホーム画面に追加すると、アプリのように開きます。初回読み込み後は、画面とキャッシュ済みカードがオフラインでも動きます。評価は接続先が戻るまで待って再送されます。Bunproには有効なセッションが必要です。',
    'The hosted Yomu Study app checking a typed Japanese answer during a real review.': '実際の復習中に入力した日本語の答えを判定するサイト版よむStudy。',
    'One card in the hosted Study app.': 'サイト版Studyアプリの一枚のカード。',
    'Review by doing': '行動して復習する',
    'Permalink to "Review by doing"': '「行動して復習する」へのパーマリンク',
    'A card uses the steps that fit it:': 'カードは、その単語に合う手順を使います。',
    'Draw the kanji from memory.': '記憶から漢字を書きます。',
    'Read the word inside a real sentence.': '実際の文の中で単語を読みます。',
    'Type the spelling or reading, or write the missing kanji.': '表記か読みを入力するか、欠けた漢字を書きます。',
    'Fill the blank with hints that reveal one small piece at a time.': '一度に小さな手掛かりを一つ出しながら空欄を埋めます。',
    'Hear the word and choose the pitch shape.': '単語を聞き、ピッチ型を選びます。',
    'Say it aloud and compare your pitch on the device.': '声に出し、端末上で自分のピッチを比べます。',
    'Kana-only words skip drawing. Words without pitch data skip listening and speaking. Example clips from enabled sources can appear after the reveal.': '仮名だけの単語では書き取りを飛ばします。ピッチ情報のない単語では聞き取りと発話を飛ばします。有効な出典の例文クリップは、答えを表示した後に出せます。',
    'Rate once at the end. The normal scale records Nothing, Something, Hard, Okay or Easy. A thumb-friendly Fail and Pass mode is available. Bunpro uses the choices its live session accepts.': '最後に一度だけ評価します。通常の尺度は「何も分からない」「少し分かる」「難しい」「OK」「簡単」を記録します。親指で押しやすい「失敗／成功」モードもあります。Bunproでは有効なセッションが受け付ける選択肢を使います。',
    'The local deck uses an ease-based spaced schedule from the SM-2 family. Failed cards return soon. Successful cards spread out. Connected services keep their own schedules and receive the grade.': '端末内デッキはSM-2系の難易度に基づく間隔反復を使います。失敗したカードはすぐ戻り、成功したカードは間隔が広がります。接続先はそれぞれの予定を保ち、評価を受け取ります。',
    'Staying with it after the streak breaks →': '連続記録が切れた後も続ける →',
    'Staying with it': '続ける',
    'Return after a break, handle a large review backlog, and use streaks as a record of effort instead of a punishment.': '中断後に戻り、多い復習残を扱い、連続記録を罰ではなく努力の記録として使います。',
    'Permalink to "Staying with it"': '「続ける」へのパーマリンク',
    'Missing two weeks changes one thing: today has cards in it.': '二週間休んでも、変わることは一つだけです。今日はカードがあります。',
    'One learner in the community lost a 1,480-day streak and celebrated the work it recorded. That is the useful meaning of a streak. It tells you that you returned many times. It is not a debt contract with yesterday.': 'コミュニティのある学習者は1,480日の連続記録を失い、そこに記録された努力を祝いました。それが連続記録の役立つ意味です。何度も戻ったことを教えます。昨日と結んだ借金の契約ではありません。',
    'Start with ten': '十枚から始める',
    'Permalink to "Start with ten"': '「十枚から始める」へのパーマリンク',
    'When 400 cards are waiting, do ten. Stop if ten is what fits. Come back tomorrow.': '400枚待っていたら、十枚します。十枚が収まる量なら、そこで止めます。明日また戻ります。',
    'Do not reset a deck because the number looks ugly. Do not grade everything Easy to clear the screen. The schedule can recover if the grades stay honest.': '数字が不格好だからといってデッキをリセットしないでください。画面を空にするため全部を「簡単」と評価しないでください。評価が正直なら、予定は立て直せます。',
    'Failed words return sooner. Known words move away. Each real answer gives the scheduler information, even when the queue is still large.': '失敗した単語は早く戻り、既知語は遠ざかります。待ち行列がまだ多くても、本当の答え一つ一つが予定表に情報を与えます。',
    'Lower the daily number': '一日の数を減らす',
    'Permalink to "Lower the daily number"': '「一日の数を減らす」へのパーマリンク',
    'A daily target should leave room to read. If reviews take all the time you meant to spend with Japanese, mine fewer words and lower the target.': '一日の目標は読む時間を残すべきです。復習が日本語に使うつもりだった時間をすべて取るなら、採集する単語を減らし、目標を下げます。',
    'Use Fail and Pass mode when five grades turn into hesitation. Hide review steps that do not help your current goal. Pick one source instead of mixing every connected queue.': '五段階評価で迷うようなら「失敗／成功」モードを使います。今の目標に役立たない復習手順を隠します。接続したすべての待ち行列を混ぜず、一つの出典を選びます。',
    'There is no daily cap in the local deck. That means you may do as much as you like. It also means the number is not a command.': '端末内デッキには一日の上限がありません。好きなだけ進められます。同時に、その数字は命令ではありません。',
    'Keep an effort record': '努力を記録する',
    'Permalink to "Keep an effort record"': '「努力を記録する」へのパーマリンク',
    'Stats can show reviews, accuracy, time and the days you returned. Use it to notice patterns. A week of short sessions may be healthier than one heroic Sunday.': 'Statsには、復習数、正答率、時間、戻った日を表示できます。傾向に気づくために使います。一週間の短い学習は、英雄的な日曜日一日より健全かもしれません。',
    'The best recovery plan is deliberately boring:': '最良の復帰計画は、わざと退屈にします。',
    'Review a small number.': '少ない数を復習します。',
    'Read or watch something easy.': '易しいものを読むか観ます。',
    'Save almost nothing.': 'ほとんど保存しません。',
    'Repeat tomorrow.': '明日繰り返します。',
    'If the system makes you avoid Japanese, change the system. The method belongs to you.': '仕組みのせいで日本語を避けるなら、仕組みを変えてください。方法はあなたのものです。',
    'Your own setup: keep the services you already use →': '自分の環境：今使っているサービスを続ける →',
    'Connect dictionaries, audio, Anki, Jiten, Bunpro, JPDB and WaniKani, sync devices, and see which planned integrations are still in development.': '辞書、音声、Anki、Jiten、Bunpro、JPDB、WaniKaniを接続し、端末を同期し、予定されている連携のうち開発中のものを確認します。',
    'Permalink to "Your own setup"': '「自分の環境」へのパーマリンク',
    'Keep the study system you already open.': 'すでに開く習慣のある学習システムを使い続けてください。',
    'Yomu works with a starter dictionary and a local deck. Everything after that is a choice. Add one service when it removes friction. Remove it when it adds ceremony.': 'よむは初期辞書と端末内デッキだけで動きます。その先はすべて選択です。手間を減らすサービスを一つ追加し、儀式を増やすなら外します。',
    'Bring your dictionaries': '自分の辞書を持ち込む',
    'Permalink to "Bring your dictionaries"': '「自分の辞書を持ち込む」へのパーマリンク',
    "Install a dictionary from the catalogue or import any compatible Yomitan ZIP. The starter uses both choices in your language profile: an English-speaking learner reading Spanish gets Spanish-headword terms with English definitions and Spanish IPA in the popup's pronunciation row. Japanese uses that same row for pitch accent. Japanese terms, kanji and pitch remain the starter only when Japanese is the selected target. Dictionary files, search indexes and local lookup results stay in the browser. Reorder sources so the answer you trust appears first.": 'カタログから辞書をインストールするか、対応するYomitan ZIPを取り込みます。初期辞書は、言語プロフィールで選んだ二つの言語に合わせて決まります。たとえば、英語を使う学習者がスペイン語を読む場合は、スペイン語の見出し語、英語の語義、ポップアップの発音欄にスペイン語のIPAが入ります。日本語では同じ欄にピッチアクセントを表示します。日本語を対象に選んだ場合は、日本語の単語、漢字、ピッチ辞書が初期設定になります。辞書ファイル、検索索引、端末内の検索結果はブラウザーに残ります。信頼する答えが先に出るよう、出典の順番を変えます。',
    'Study keeps local review cards on the language target selected in your profile. A complete example sentence gets the same Recall gap in Spanish or Japanese, and the card keeps its language through grading, offline storage and encrypted sync. Audio-dependent Listen and Speak modes show when target audio is not yet available instead of silently disappearing. Study also reviews Anki when it is reachable and connected Japanese services when selected. Library searches the words. Stats shows the work over time.': 'Studyのローカル復習カードは、プロフィールで選んだ対象言語だけがキューに入ります。完全な例文があれば、スペイン語でも日本語でも同じRecallの穴埋めが使え、採点、オフライン保存、暗号化同期を通してカードの言語が保たれます。対象言語の音声がまだ利用できない場合も、音声を使うListenとSpeakを黙って消さず、利用状況を表示します。Ankiに接続できるときや、日本語向けの連携サービスを選んだときもStudyから復習できます。Libraryでは単語を検索でき、Statsでは学習履歴を確認できます。',
    'The catalogue includes Japanese dictionaries and growing supply for Chinese, Cantonese, Korean, Spanish, French, German, Russian and Vietnamese. The planned product treats all 32 roster languages as full study targets. That target selection and complete dictionary supply are in development; Japanese remains the deepest learning path today.': 'カタログには日本語辞書があり、中国語、広東語、韓国語、スペイン語、フランス語、ドイツ語、ロシア語、ベトナム語の供給も増えています。計画中の製品では、名簿にある32言語すべてを完全な学習対象として扱います。対象選択と完全な辞書供給は開発中です。現在は日本語の学習経路が最も深く作られています。',
    'Yomu ships definitions in 32 languages.': 'よむは32言語の語義を用意しています。',
    'Bring your audio': '自分の音声を持ち込む',
    'Permalink to "Bring your audio"': '「自分の音声を持ち込む」へのパーマリンク',
    'Yomu Hosted Audio is the default pronunciation source. You can enable source audio from Jiten, Bunpro and other connected providers, import custom JSON sources, or run Ultimate Yomitan Audio on your computer.': 'Yomu Hosted Audioが標準の発音出典です。Jiten、Bunproなど接続した提供元の音声を有効にしたり、独自JSON出典を取り込んだり、コンピューターでUltimate Yomitan Audioを動かしたりできます。',
    'Local Audio guide': 'ローカル音声ガイド',
    'covers the server, audio folders and phone access. Each source can be enabled and ordered separately.': 'では、サーバー、音声フォルダー、スマートフォンからの接続を説明します。各出典は個別に有効化し、順番を変えられます。',
    'Keep one review home': '復習先を一つ決める',
    'Permalink to "Keep one review home"': '「復習先を一つ決める」へのパーマリンク',
    'Jiten supplies dictionary entries, word state, audio, kanji facts and review actions. JPDB supplies Japanese decks, frequency, word state and its five-grade reviews. Bunpro supplies grammar and vocabulary context plus its live review queue. WaniKani supplies level, readings, meanings, mnemonics, components and SRS state. Anki gives you your own note types, templates and schedule.': 'Jitenは辞書項目、単語状態、音声、漢字情報、復習操作を提供します。JPDBは日本語デッキ、頻度、単語状態、五段階復習を提供します。Bunproは文法と語彙の文脈、有効な復習待ち行列を提供します。WaniKaniは水準、読み、意味、記憶術、部品、SRS状態を提供します。Ankiでは、自分のノート型、テンプレート、予定を使えます。',
    'Connect only the accounts you use. Tokens stay on your device and talk directly to the service. Bunpro and WaniKani tokens can change review state, so treat them like passwords.': '使うアカウントだけ接続します。トークンは端末内に残り、サービスと直接通信します。BunproとWaniKaniのトークンは復習状態を変えられるため、パスワードのように扱ってください。',
    'Migaku import is in development. Until it ships, use a supported dictionary export or keep Migaku alongside Yomu without claiming that its deck has been imported.': 'Migaku取り込みは開発中です。提供されるまでは、対応する辞書書き出しを使うか、デッキを取り込んだとは考えずMigakuとよむを並行して使ってください。',
    'RTK learners can keep RTK keywords and frame data. Vocab-only learners can hide kanji steps. Kanji sources such as KanjiVG, Kanji Alive, Uchisen, WaniKani, Jiten, JPDB and imported dictionaries can be enabled and reordered independently.': 'RTK学習者はRTKキーワードとフレーム情報を保てます。語彙だけ学ぶ人は漢字手順を隠せます。KanjiVG、Kanji Alive、Uchisen、WaniKani、Jiten、JPDB、取り込んだ辞書などの漢字出典は、個別に有効化し並べ替えられます。',
    'Keep Anki open on your computer and let the phone talk to AnkiConnect. Tailscale is the simplest route away from home because it gives your devices a private address without opening a router port.': 'コンピューターでAnkiを開いたままにし、スマートフォンからAnkiConnectへ接続します。外出先ではTailscaleが最も簡単です。ルーターのポートを開かず、端末に専用アドレスを与えます。',
    "Below, replace every `100.x.y.z` with your computer's Tailscale address. It usually starts with `100.`.": '以下の`100.x.y.z`はすべて、自分のコンピューターのTailscaleアドレスに置き換えてください。通常は`100.`で始まります。',
    'Install Anki and the AnkiConnect add-on on the computer.': 'コンピューターにAnkiとAnkiConnectアドオンをインストールします。',
    'Install Tailscale on the computer and phone, then sign into the same account.': 'コンピューターとスマートフォンにTailscaleを入れ、同じアカウントでサインインします。',
    "Copy the computer's Tailscale address.": 'コンピューターのTailscaleアドレスをコピーします。',
    'In AnkiConnect config, bind to that address and keep port': 'AnkiConnect設定でそのアドレスにバインドし、ポートは',
    'to it.': 'を追加します。',
    'Restart Anki and leave it open.': 'Ankiを再起動し、開いたままにします。',
    'on the phone. An AnkiConnect message proves the route works.': 'をスマートフォンで開きます。AnkiConnectのメッセージが出れば接続できています。',
    'Put the same URL in Yomu Settings under Mining, then run Check AnkiConnect.': '同じURLをよむの設定の「採集」に入れ、「AnkiConnectを確認」を実行します。',
    'Keep AnkiConnect on Tailscale or your home network. Do not forward port': 'AnkiConnectはTailscaleまたは自宅ネットワーク内に置きます。ポート',
    'to the public internet.': 'を公開インターネットへ転送しないでください。',
    'If you do not want to run desktop Anki, Yomu can hand a new card to AnkiMobile or AnkiDroid. Mobile Anki handoff is one-way: it starts a new card and stops there. It cannot scan existing decks, tell you what is already in them, update an old card or give you review queues. Those jobs need desktop AnkiConnect.': 'デスクトップ版Ankiを動かしたくない場合、よむは新しいカードをAnkiMobileまたはAnkiDroidへ渡せます。モバイルAnkiへの受け渡しは一方向です。新しいカードを始めるだけで、そこで終わります。既存デッキのスキャン、すでにあるカードの確認、古いカードの更新、復習キューの提供はできません。それらにはデスクトップ版AnkiConnectが必要です。',
    'Sync Yomu between devices': '端末間でよむを同期する',
    'Permalink to "Sync Yomu between devices"': '「端末間でよむを同期する」へのパーマリンク',
    'A free Yomu account can pair devices so local cards follow you. Cards are encrypted before they leave the device. Profile and sync can list paired devices, revoke one, export your data or delete the account.': '無料のよむアカウントで端末をペアにし、端末内カードを持ち運べます。カードは端末を離れる前に暗号化されます。「プロフィールと同期」では、ペア端末の一覧、解除、データ書き出し、アカウント削除ができます。',
    'Settings can also be exported as JSON from the Dictionaries screen. Keep that file with your other backups.': '設定は「辞書」画面からJSONとして書き出すこともできます。そのファイルをほかのバックアップと一緒に保管してください。',
    'Know what is still being built': 'まだ制作中のものを知る',
    'Permalink to "Know what is still being built"': '「まだ制作中のものを知る」へのパーマリンク',
    'Sentence-audio mining, complete 32-language study targets and Migaku import are in development. Academy is a story-driven Japanese course from first sounds to N1; it is in development and invitation-only while it is built.': '文音声の採集、32言語すべての学習対象、Migaku取り込みは開発中です。Academyは最初の音からN1までを扱う物語型の日本語講座です。開発中で、制作中は招待制です。',
    'Planned does not mean installed. The': '計画済みは提供済みという意味ではありません。',
    'changelog': '変更履歴',
    'is the record of what has shipped.': 'が、提供済みの内容の記録です。',
    'Reference: find the switch for anything →': 'リファレンス：必要なスイッチを探す →',
    'Reference': 'リファレンス',
    'Find every Yomu setting, feature, app, policy and troubleshooting page after you have learned the main reading and study loop.': '読むことと復習の基本的な流れを覚えた後に、よむの全設定、機能、アプリ、方針、問題解決ページを探せます。',
    'Permalink to "Reference"': '「リファレンス」へのパーマリンク',
    'When you need one switch, use the reference.': '一つのスイッチが必要なときは、リファレンスを使ってください。',
    'The learning path explains when a setting helps. The generated': '学習の道筋では、設定がいつ役立つかを説明します。生成された',
    'lists every current setting from the source that defines it. It changes when the product changes. Do not use a hand-copied list in an old guide.': 'には、設定を定義するソースから現在の全設定が載ります。製品の変更と一緒に変わります。古いガイドの手書き一覧を使わないでください。',
    'Permalink to "Apps"': '「アプリ」へのパーマリンク',
    'These run on the Yomu site:': '次のアプリはよむのサイト上で動きます。',
    'reviews local and connected cards and works offline after its first load.': 'は端末内と接続先のカードを復習し、初回読み込み後はオフラインでも動きます。',
    'opens local video and subtitle files.': 'は端末内の動画と字幕ファイルを開きます。',
    'opens text PDFs and scanned PDFs with OCR enabled.': 'は文字入りPDFを開き、OCRを有効にするとスキャン済みPDFも開けます。',
    'Live OCR': '実際のOCR',
    'makes the words in the homepage panel pressable.': 'では、ホームページのパネル内の単語を押せるようにします。',
    'Yomu Gaming is a separate desktop download. Academy is in development and open by invitation.': 'Yomu Gamingは別のデスクトップ用ダウンロードです。Academyは開発中で招待制です。',
    'Feature map': '機能一覧',
    'Permalink to "Feature map"': '「機能一覧」へのパーマリンク',
    'Feature': '機能',
    'Where it is explained': '説明する場所',
    'Install, first lookup and phone setup': 'インストール、最初の検索、スマートフォン設定',
    'Popup readings, meanings, frequency, pitch, audio and examples': 'ポップアップの読み、意味、頻度、ピッチ、音声、例文',
    'Han-language lookup now searches contiguous ideographs for the earliest longest exact expression in the installed dictionary, instead of treating ICU display boundaries as dictionary word boundaries.': '漢字を使う言語の検索では、ICUの表示上の境界を辞書の語境界として扱わず、連続する表意文字の中から、インストール済み辞書に完全一致する最も左側の最長表現を探すようになりました。',
    'Japanese character cards and Japanese-only enrichment stay scoped to Japanese, including when the learning target changes while an asynchronous lookup is still resolving.': '日本語の文字カードと日本語専用の補足情報は、日本語を選択している場合だけに表示されます。非同期検索の処理中に学習対象を切り替えた場合も、この範囲が保たれます。',
    'Language-aware settings and YouTube labels no longer pull the dictionary catalogue into the main userscript, keeping the Greasy Fork artifact below its 2 MB limit.': '言語に応じた設定とYouTubeのラベルが辞書カタログ全体をメインのユーザースクリプトへ取り込まなくなり、Greasy Forkの2 MB制限内に収まるようになりました。',
    'Dictionary installation keeps its own userscript-manager storage fallback when the core and runtime companion are placed in different sandbox realms.': 'コアとランタイムコンパニオンが別々のサンドボックス領域に配置された場合でも、辞書のインストールはユーザースクリプトマネージャーの保存機能を独自の予備経路として利用できるようになりました。',
    'A missing storage runtime now asks the learner to reload or reinstall よむ instead of reporting a dictionary download failure.': '保存ランタイムが見つからない場合、辞書のダウンロード失敗と誤って表示せず、ページの再読み込みまたはよむの再インストールを案内するようになりました。',
    'Video subtitle controls now offer three explicit translation modes—Blur until reveal (recommended), Always show, and Hide completely—plus a persistent blur-strength slider.': '動画の字幕コントロールで、訳文を「表示するまでぼかす（おすすめ）」「常に表示」「完全に隠す」の3つから明示的に選べるようになり、ぼかしの強さも保存できるようになりました。',
    'Translation display mode and blur strength now survive navigation and stale tabs, and the settings popover stays on-screen when the control rail is moved near a viewport edge.': '訳文の表示モードとぼかしの強さがページ移動や古いタブからの保存後も維持され、コントロールレールを画面端へ移動しても設定ポップオーバーが画面内に収まるようになりました。',
    'Grammar detection and per-language references': '文法検出と言語別リファレンス',
    'The YouTube immersion filter, its hidden-video notice, and opening a site in your target language are now available whatever language you are studying, not only Japanese.': 'YouTubeの没入フィルター、非表示動画のお知らせ、学習中の言語版のサイトを開く機能が、日本語だけでなくどの学習言語でも利用できるようになりました。',
    'The YouTube filter notice now names the language you are studying instead of calling everything else non-Japanese.': 'YouTubeフィルターのお知らせは、他をまとめて「日本語以外」と呼ぶのではなく、学習中の言語名を表示するようになりました。',
    'The YouTube filter toggle now shows its real default-off state for non-Japanese targets and records an opt-in on the first click.': 'YouTubeフィルターの切り替えは、日本語以外の学習言語では実際の初期状態どおりオフで表示され、最初にオンにした操作を明示的な選択として保存するようになりました。',
    'The Hover Lookup hotkey now stays cleared when you clear it, instead of returning to Shift.': 'ホバー辞書のショートカットを消したら消えたままになり、Shiftに戻らなくなりました。',
    'A setting you put back to its default now stays there, instead of an older stored copy restoring it.': '設定を初期値に戻すとその状態が保たれ、古い保存内容で元に戻されなくなりました。',
    'Word colour for ignored, suspended, and blacklisted words can now be turned off like every other state.': '除外・保留・ブラックリストの単語の色も、他の状態と同じようにオフにできるようになりました。',
    'Settings that act on the language you are studying now name that language instead of always saying Japanese.': '学習中の言語に対して働く設定は、常に「日本語」と表示するのではなく、その言語名を表示するようになりました。',
    'Grammar detection now follows the active learning target, with JLPT levels for Japanese and CEFR levels for other checked inventories.': '文法検出は選択中の学習対象に従うようになり、日本語にはJLPTレベル、その他の確認済み項目一覧にはCEFRレベルを表示します。',
    'Spanish, French, German, and Russian now include conservative starter rules, while every other target keeps a checked grammar reference visible.': 'スペイン語、フランス語、ドイツ語、ロシア語には慎重に範囲を限定した入門ルールを追加し、その他すべての学習対象でも確認済み文法リファレンスを引き続き表示します。',
    'Grammar checks now keep an honest result card visible when no local rule matches or local detection is unavailable.': '端末内ルールが一致しない場合や端末内検出を利用できない場合でも、実情を伝える結果カードを表示し続けます。',
    'Lookup cards no longer repeat a Finish setup banner when the offline dictionary store is empty. First-run setup still offers the starter download, and offline dictionaries remain available in Settings → Sources.': 'オフライン辞書ストアが空でも、検索カードに「セットアップを完了」バナーを繰り返し表示しなくなりました。初回セットアップでは引き続きスターター辞書のダウンロードを案内し、オフライン辞書は［設定］→［ソース］からいつでも利用できます。',
    'Grammar coverage': '文法対応状況',
    'See which learning targets have local grammar detection and which open a checked grammar reference.': '学習対象ごとの端末内文法検出の有無と、確認済み文法リファレンスへのリンクを確認できます。',
    "Permalink to \"Grammar coverage\"": '「文法対応状況」への固定リンク',
    'The Grammar card always stays visible after a check. A local match shows the pattern and level. When a target has a checked reference instead of local detection, the card links to that reference.': '文法カードは確認後も表示されたままです。端末内で一致した場合はパターンとレベルを示します。端末内検出の代わりに確認済みリファレンスがある学習対象では、そのリファレンスへのリンクを表示します。',
    'Local detection is deliberately narrow. A match is a prompt to inspect the sentence, not a complete parse. Japanese keeps its established 307-rule JLPT inventory. Spanish, French, German and Russian have small CEFR starter sets checked against the published inventories named below.': '端末内検出は意図的に範囲を絞っています。一致は文を詳しく見るための手がかりであり、完全な構文解析ではありません。日本語は既存のJLPT別307ルールを維持します。スペイン語、フランス語、ドイツ語、ロシア語には、以下の公開項目一覧で確認した小規模なCEFR入門セットがあります。',
    'Current coverage': '現在の対応状況',
    "Permalink to \"Current coverage\"": '「現在の対応状況」への固定リンク',
    'Curated local rules: 5 targets, including Japanese': '精査済み端末内ルール：日本語を含む5言語',
    'Reference only: 28 targets': 'リファレンスのみ：28言語',
    'Nothing available: 0 targets': '利用可能なものなし：0言語',
    'Learning target': '学習対象',
    'Reference or inventory': 'リファレンス／項目一覧',
    'Why this state': 'この状態である理由',
    'Curated rules: 307, JLPT': '精査済みルール：307件、JLPT',
    'Tofugu Japanese Grammar': 'Tofugu日本語文法',
    'The established detector and regression corpus remain unchanged.': '既存の検出器と回帰コーパスを変更せず維持しています。',
    'Albanian': 'アルバニア語',
    'Reference only': 'リファレンスのみ',
    'University of Texas: Albanian Online': 'テキサス大学：Albanian Online',
    'The grammar contents are available while detector patterns await language-specific review.': '文法内容は参照でき、検出パターンは言語別の精査を待っています。',
    'Ancient Greek': '古代ギリシャ語',
    'Ancient Greek grammar': '古代ギリシャ語文法',
    'The reference covers primarily Attic Greek; a local detector needs a declared variety and period.': 'リファレンスは主にアッティカ方言を扱います。端末内検出には対象とする変種と時代の明示が必要です。',
    'Arabic': 'アラビア語',
    'Arabic grammar': 'アラビア語文法',
    'The reference covers Classical Arabic and Modern Standard Arabic; a local detector needs an explicit variety.': 'リファレンスは古典アラビア語と現代標準アラビア語を扱います。端末内検出には対象変種の明示が必要です。',
    'Cantonese grammar': '広東語文法',
    'The grammar reference is available while checked Cantonese patterns are prepared.': '文法リファレンスを利用でき、精査済みの広東語パターンを準備しています。',
    'Chinese grammar': '中国語文法',
    'The reference describes Standard Chinese; checked local patterns are still being reviewed.': 'リファレンスは標準中国語を扱います。精査済みの端末内パターンは確認中です。',
    'Danish': 'デンマーク語',
    'Danish grammar': 'デンマーク語文法',
    'The grammar reference is available while checked Danish patterns are prepared.': '文法リファレンスを利用でき、精査済みのデンマーク語パターンを準備しています。',
    'Dutch': 'オランダ語',
    'Dutch grammar': 'オランダ語文法',
    'The grammar reference is available while checked Dutch patterns are prepared.': '文法リファレンスを利用でき、精査済みのオランダ語パターンを準備しています。',
    'English': '英語',
    'English grammar': '英語文法',
    'The grammar reference is available while checked English patterns are prepared.': '文法リファレンスを利用でき、精査済みの英語パターンを準備しています。',
    'Finnish': 'フィンランド語',
    'Finnish grammar': 'フィンランド語文法',
    'The grammar reference is available while checked Finnish patterns are prepared.': '文法リファレンスを利用でき、精査済みのフィンランド語パターンを準備しています。',
    'Curated rules: 8, CEFR A1': '精査済みルール：8件、CEFR A1',
    'CIEP/Eaquals CEFR inventory': 'CIEP/Eaquals CEFR文法項目一覧',
    'Eight bounded patterns map to constructions named in the published A1 inventory.': '範囲を限定した8パターンを、公開A1項目一覧に記載された構文へ対応付けています。',
    'Curated rules: 7, CEFR A1': '精査済みルール：7件、CEFR A1',
    'Goethe-Institut A1 inventory and Deutsche Welle A1 overview': 'ゲーテ・インスティトゥートA1項目一覧とDeutsche Welle A1概要',
    'Goethe-Institut A1 inventory': 'ゲーテ・インスティトゥートA1項目一覧',
    'Deutsche Welle A1 overview': 'Deutsche Welle A1概要',
    'Goethe-Institut grammar reference': 'ゲーテ・インスティトゥート文法リファレンス',
    'Seven bounded patterns map to constructions named in the two A1 course inventories.': '範囲を限定した7パターンを、2つのA1コース項目一覧に記載された構文へ対応付けています。',
    'Greek': 'ギリシャ語',
    'Modern Greek grammar': '現代ギリシャ語文法',
    'The reference covers modern Demotic Greek; checked local patterns are still being reviewed.': 'リファレンスは現代のディモティキを扱います。精査済みの端末内パターンは確認中です。',
    'Hungarian': 'ハンガリー語',
    'Hungarian grammar': 'ハンガリー語文法',
    'The grammar reference is available while checked Hungarian patterns are prepared.': '文法リファレンスを利用でき、精査済みのハンガリー語パターンを準備しています。',
    'Indonesian': 'インドネシア語',
    'Northern Illinois University: Tata Bahasa': '北イリノイ大学：Tata Bahasa',
    'The university grammar contents are available while detector patterns await language-specific review.': '大学の文法内容を参照でき、検出パターンは言語別の精査を待っています。',
    'Italian': 'イタリア語',
    'Italian grammar': 'イタリア語文法',
    'The grammar reference is available while checked Italian patterns are prepared.': '文法リファレンスを利用でき、精査済みのイタリア語パターンを準備しています。',
    'Khmer': 'クメール語',
    'Khmer grammar': 'クメール語文法',
    'The grammar reference is available while a stronger checked detector inventory is prepared.': '文法リファレンスを利用でき、より確かな精査済み検出項目一覧を準備しています。',
    'Korean grammar': '韓国語文法',
    'The grammar reference is available while checked Korean morphology and patterns are prepared together.': '文法リファレンスを利用でき、精査済みの韓国語形態処理とパターンを一体で準備しています。',
    'Lao': 'ラオ語',
    'Lao grammar': 'ラオ語文法',
    'The grammar reference is available while checked Lao patterns are prepared.': '文法リファレンスを利用でき、精査済みのラオ語パターンを準備しています。',
    'Latin': 'ラテン語',
    'Latin grammar': 'ラテン語文法',
    'The reference covers primarily Classical Latin; a local detector needs a declared variety and period.': 'リファレンスは主に古典ラテン語を扱います。端末内検出には対象とする変種と時代の明示が必要です。',
    'Mongolian': 'モンゴル語',
    'Mongolian Grammar: 44 Basic Rules': 'モンゴル語文法：44の基本ルール',
    'The learner reference covers modern Cyrillic Khalkha while detector patterns await review.': '学習者向けリファレンスは現代キリル文字のハルハ方言を扱い、検出パターンは精査を待っています。',
    'Persian': 'ペルシア語',
    'Persian grammar': 'ペルシア語文法',
    'The reference focuses on Iranian Persian; a local detector needs an explicit variety.': 'リファレンスはイラン・ペルシア語を中心に扱います。端末内検出には対象変種の明示が必要です。',
    'Polish': 'ポーランド語',
    'Polish grammar': 'ポーランド語文法',
    'The grammar reference is available while checked Polish patterns are prepared.': '文法リファレンスを利用でき、精査済みのポーランド語パターンを準備しています。',
    'Portuguese': 'ポルトガル語',
    'Portuguese grammar': 'ポルトガル語文法',
    'A local detector needs reviewed Brazilian and European usage boundaries.': '端末内検出には、ブラジルとヨーロッパの用法境界の精査が必要です。',
    'Romanian': 'ルーマニア語',
    'Romanian grammar': 'ルーマニア語文法',
    'The grammar reference is available while checked Romanian patterns are prepared.': '文法リファレンスを利用でき、精査済みのルーマニア語パターンを準備しています。',
    'RANEPA A1 curriculum and Cornell learner reference': 'RANEPA A1カリキュラムとCornell学習者向けリファレンス',
    'RANEPA A1 curriculum': 'RANEPA A1カリキュラム',
    'Cornell learner reference': 'Cornell学習者向けリファレンス',
    'Eight bounded patterns map to examples and constructions in the published A1 curriculum.': '範囲を限定した8パターンを、公開A1カリキュラムの例文と構文へ対応付けています。',
    'Serbo-Croatian': 'セルボ・クロアチア語',
    'Serbo-Croatian grammar': 'セルボ・クロアチア語文法',
    'The reference states its Shtokavian scope; local detection needs reviewed variety boundaries.': 'リファレンスはシュト方言を対象と明記しています。端末内検出には変種境界の精査が必要です。',
    'Curated rules: 8, CEFR A1-A2': '精査済みルール：8件、CEFR A1〜A2',
    'Instituto Cervantes A1-A2 inventory': 'セルバンテス文化センターA1〜A2文法項目一覧',
    'Eight bounded patterns map directly to named constructions and examples in the inventory.': '範囲を限定した8パターンを、項目一覧に記載された構文と例文へ直接対応付けています。',
    'Swedish': 'スウェーデン語',
    'Swedish grammar': 'スウェーデン語文法',
    'The grammar reference is available while checked Swedish patterns are prepared.': '文法リファレンスを利用でき、精査済みのスウェーデン語パターンを準備しています。',
    'Tagalog': 'タガログ語',
    'Tagalog grammar': 'タガログ語文法',
    'The reference is specific to Tagalog; local Filipino coverage needs an explicit scope.': 'リファレンスはタガログ語に特化しています。端末内のフィリピノ語対応には対象範囲の明示が必要です。',
    'Thai': 'タイ語',
    'Chulalongkorn University Thai grammar guide': 'チュラロンコン大学タイ語文法ガイド',
    'The university learner guide is available while a fuller checked detector inventory is prepared.': '大学の学習者向けガイドを利用でき、より充実した精査済み検出項目一覧を準備しています。',
    'Turkish': 'トルコ語',
    'Turkish grammar': 'トルコ語文法',
    'The grammar reference is available while checked Turkish patterns are prepared.': '文法リファレンスを利用でき、精査済みのトルコ語パターンを準備しています。',
    'Vietnamese grammar': 'ベトナム語文法',
    'The grammar reference is available while checked Vietnamese patterns are prepared.': '文法リファレンスを利用でき、精査済みのベトナム語パターンを準備しています。',
    'Yomu bundles its own bounded detector patterns and links to the sources for construction names, level assignments and further reading.': 'よむは範囲を限定した独自の検出パターンを同梱し、構文名、レベル区分、詳しい説明の出典へリンクしています。',
    'Furigana, pitch underlines and study-state colours': 'ふりがな、ピッチ下線、学習状態の色',
    'Local and imported Yomitan dictionaries': '端末内辞書と取り込んだYomitan辞書',
    'Your own setup': '自分の環境',
    'Kanji readings, RTK, components, stroke order and drawing': '漢字の読み、RTK、部品、筆順、書き取り',
    'Browser pages, graded readers and tadoku': 'ブラウザーページ、段階別読み物、多読',
    'PDF text and scanned-page OCR': 'PDF文字とスキャン済みページのOCR',
    'Subtitle overlay, second track, transcript and shortcuts': '字幕オーバーレイ、第二トラック、文字起こし、ショートカット',
    'Shadowing and Batch Mine': 'シャドーイングとBatch Mine',
    'YouTube filtering and the levelled channel guide': 'YouTube絞り込みと水準別チャンネルガイド',
    'Local video and subtitle files': '端末内の動画と字幕ファイル',
    'Manga, screenshots and OCR providers': '漫画、スクリーンショット、OCR提供元',
    'Yomu Gaming capture': 'Yomu Gamingの撮影',
    'Mining fields and card destinations': '採集項目とカードの保存先',
    'Study steps, grades, schedules, Library and Stats': 'Studyの手順、評価、予定、Library、Stats',
    'Streaks, backlogs and daily review load': '連続記録、復習残、一日の復習量',
    'Jiten, Bunpro, JPDB, WaniKani and Anki': 'Jiten、Bunpro、JPDB、WaniKani、Anki',
    'Local and provider audio': 'ローカル音声と提供元音声',
    'Accounts, encrypted card sync, export and deletion': 'アカウント、暗号化カード同期、書き出し、削除',
    'Sentence-audio mining, 32-language targets, Migaku import and Academy': '文音声の採集、32言語対象、Migaku取り込み、Academy',
    'Settings by screen': '画面別の設定',
    'Permalink to "Settings by screen"': '「画面別の設定」へのパーマリンク',
    'The generated reference follows the settings interface:': '生成されたリファレンスは設定画面の構成に沿っています。',
    'API connections': 'API接続',
    'Audio and Immersion Kit': '音声とImmersion Kit',
    'Reader and furigana': 'リーダーとふりがな',
    'Dictionary and definition sources': '辞書と定義の出典',
    'Kanji sources': '漢字の出典',
    'Image text and OCR': '画像内文字とOCR',
    'Video and YouTube': '動画とYouTube',
    'Anki and mining': 'Ankiと採集',
    'Help and uncategorised compatibility settings': 'ヘルプと未分類の互換設定',
    'Help and records': 'ヘルプと記録',
    'Permalink to "Help and records"': '「ヘルプと記録」へのパーマリンク',
    'answers the common install, reading, review, language and data questions.': 'は、インストール、読書、復習、言語、データについてのよくある質問に答えます。',
    'explains browser permissions, local data, optional network services, encrypted sync and deletion.': 'では、ブラウザー権限、端末内データ、任意のネットワークサービス、暗号化同期、削除を説明します。',
    'links Discord and the GitHub issue tracker.': 'にはDiscordとGitHubの問題追跡へのリンクがあります。',
    'is the shipped record. Planned work stays labelled until it appears there.': 'は提供済みの記録です。予定中の作業は、そこに載るまで予定中と表示されます。',
    'documents the hosted service contract.': 'はサイト版サービスの契約を文書化しています。',
    'covers the optional pronunciation server.': 'では任意の発音サーバーを説明します。',
    'explains ways to fund Yomu and the current Academy access terms.': 'では、よむを支援する方法と現在のAcademy利用条件を説明します。',
    'You have reached the end of the path. Go back to': '学習の道筋の終わりです。',
    'when the setup has become louder than the Japanese.': '設定の方が日本語よりうるさくなったら、ここへ戻ってください。',
    'Open the apps': 'アプリを開く',
    'Get help with Yomu, ask on Discord, report a bug, or open the apps used for reading and study.': 'よむのヘルプを探し、Discordで質問し、バグを報告し、読書と復習に使うアプリを開けます。',
    'Permalink to "Open the apps"': '「アプリを開く」へのパーマリンク',
    'Discord is the fastest way to get an answer. File bugs on GitHub so they do not get lost. If you are stuck installing,': '答えを得るにはDiscordが最も速い場所です。バグは失われないようGitHubへ報告してください。インストールで止まったら、',
    'has the common fixes.': 'によくある問題への対処があります。',
    'What Yomu is, what it costs, how reviews work, which languages and apps it supports, and where your data lives, in plain answers.': 'よむとは何か、費用、復習の仕組み、対応する言語とアプリ、データの保存場所を分かりやすく答えます。',
    '. On Firefox, including Firefox on Android, use the Firefox store. On iPhone, iPad and Safari it takes a couple of minutes with a free helper app.': 'を押します。Android版Firefoxを含むFirefoxではFirefoxストアを使います。iPhone、iPad、Safariでは無料の補助アプリを使い、数分かかります。',
    'walks through it.': 'で手順を説明します。',
    'You can press words before you know kana because Yomu shows furigana. Learn hiragana first anyway. It takes a few days and makes every later lookup easier.': 'よむがふりがなを表示するため、仮名を覚える前でも単語を押せます。それでも先にひらがなを覚えてください。数日ででき、その後の検索がすべて楽になります。',
    'gives you the order.': 'に順番があります。',
    'That is where Yomu is heading. Today Yomu makes real pages readable from day one, with furigana on everything and meanings on press.': 'よむはそこを目指しています。現在は、すべてにふりがなを付け、押すと意味を表示して、初日から実際のページを読めるようにします。',
    'learning path': '学習の道筋',
    'gives you an approach for real content.': 'では、実際の素材で学ぶ方法を示します。',
    'Yes.': 'はい。',
    'Yes. A free Yomu account pairs devices so local cards can follow you. Cards are encrypted before they leave the device. Reviews sent to Anki, jpdb, Bunpro or WaniKani also follow the account rules of that service.': 'はい。無料のよむアカウントで端末をペアにし、端末内カードを持ち運べます。カードは端末を離れる前に暗号化されます。Anki、jpdb、Bunpro、WaniKaniへ送った復習は、そのサービスのアカウント規則に従います。',
    'Japanese is the deepest today, with pitch accent, kanji and furigana. The dictionary catalogue has growing supply for Chinese, Cantonese, Korean, Spanish, French, German, Russian and Vietnamese. Full study targets for all 32 roster languages are in development. The interface itself speaks English and 日本語.': '現在は日本語が最も深く、ピッチアクセント、漢字、ふりがなに対応しています。辞書カタログでは、中国語、広東語、韓国語、スペイン語、フランス語、ドイツ語、ロシア語、ベトナム語の供給が増えています。名簿にある32言語すべての完全な学習対象は開発中です。画面表示は英語と日本語に対応しています。',
    "Existing provider furigana on OCR results now retains scanner isolation, so Gaming's instant and area captures remain clickable without exposing duplicate text to external popup scanners.": 'OCR結果に既存のプロバイダー由来のふりがながある場合も、スキャナー分離が維持されるようになりました。これにより、Gamingの全画面キャプチャと範囲キャプチャは、外部ポップアップスキャナーへ重複テキストを公開せずにクリックできます。',
    "The support banner now reuses the hosted layout's existing navigation offset on tablet and mobile, while phones stack the funding copy above the actions instead of squeezing it into a narrow column.": '支援バナーは、タブレットとモバイルでホスト版レイアウトが既に持つナビゲーション用の余白を再利用するようになりました。スマートフォンでは、支援状況の文言を細い縦列へ押し込まず、操作ボタンの上に重ねず積みます。',
    "The support banner now occupies normal document flow below the live navigation height on every hosted viewport, so the navigation remains fully visible without a sticky or hardcoded top offset.": '支援バナーは、すべてのホスト版画面幅で現在のナビゲーションの高さより下にある通常の文書フロー内へ収まるようになりました。固定表示やハードコードした上端位置を使わず、ナビゲーション全体が常に見える状態を保ちます。',
    "Verified support payments are now recorded before Academy delivery can fail. Ko-fi uses its documented transaction field; provider rows keep the payer's native amount and currency plus a converted amount in the configured reporting currency, or an explicit needs-rate marker when FX is unavailable. Donation totals and goals display as whole units, funded copy appears when the exact goal is met, and the support banner stays in normal flow beneath the navigation.": '確認済みの支援金は、Academyへの配信が失敗する可能性のある処理より先に記録されるようになりました。Ko-fiでは公式の取引フィールドを使用し、プロバイダーの行には支払者の元の金額と通貨に加えて、設定された集計通貨へ換算した金額を保存します。為替レートを取得できない場合も、寄付を消さず、レート待ちとして明示します。寄付総額と目標は整数単位で表示され、正確な目標額を達成すると支援済みの文言に切り替わり、支援バナーはナビゲーションの下の通常フロー内に表示されます。',
    "After a verified Academy payment, the code is sent to the email address supplied by the provider. If no valid address is present, the payment stays in a recovery queue until the owner receives a manual-delivery notice. The code is entered within 30 days, and access stays with the Google account that redeems it. Patreon free trials and future pledge amounts do not grant access.": "Academyの対象となる決済が確認されると、決済サービスから提供されたメールアドレスへコードが送信されるようになりました。有効なアドレスがない場合、所有者が手動送信の通知を受け取るまで決済は復旧キューに残ります。コードは30日以内に入力し、アクセス権はコードを使用したGoogleアカウントに残ります。Patreonの無料トライアルと将来の支援予定額ではアクセス権は付与されません。",
    'Card in the Membership chooser now opens the live checkout and lists its accepted currencies.': 'メンバーシップ選択画面のカード決済から本番の決済画面が開き、利用できる通貨も表示されるようになりました。',
    "Donations are optional and cover hosting, test devices, and the time it takes to keep Yomu improving. Card checkout accepts GBP, USD, EUR, CAD, AUD, and JPY. Every verified donation creates one Yomu Academy code. Enter it within 30 days. Once redeemed, Academy access stays with that Google account.": "寄付は任意です。寄付金はホスティング、テスト端末、よむの改善を続けるための作業に充てられます。カード決済ではGBP、USD、EUR、CAD、AUD、JPYを利用できます。確認済みの寄付ごとによむ Academyコードが1つ発行されます。30日以内に入力してください。使用後のAcademyアクセス権は、そのGoogleアカウントに残ります。",
    "The code is sent to the email in the provider's verified payment notice. Card payments can also show it when the same browser returns from checkout. If a provider omits the email, the payment is flagged for manual delivery. Reader signup creates your account; Academy access starts when you redeem a donation code or one issued by the owner. Your Google account can use a different email.": "コードは、決済サービスの確認済み決済通知に含まれるメールアドレスへ送信されます。カード決済では、同じブラウザで決済から戻った場合にもコードを表示できます。決済サービスがメールアドレスを提供しない場合、その決済は手動送信用として記録されます。Readerへの登録でアカウントが作成され、寄付コードまたは所有者が発行したコードを使用するとAcademyアクセスが始まります。Googleアカウントのメールアドレスは決済時のものと異なっていてもかまいません。",
    "If a code does not arrive, ask on Discord with the provider name and receipt reference. Keep card details out of the message. The owner can recover the payment code or issue a separate code.": "コードが届かない場合は、決済サービス名と領収書の参照番号を添えてDiscordで問い合わせてください。カード情報はメッセージに書かないでください。所有者は決済コードを復旧するか、別のコードを発行できます。",
    "Card": "カード",
    "Ko-fi takes one-off or monthly payments. Patreon is monthly. Card checkout accepts GBP, USD, EUR, CAD, AUD, and JPY. A verified payment creates one Academy code. Enter it within 30 days. Once redeemed, access stays with the Google account you choose.": "Ko-fiでは1回限りまたは月額の支払いを利用できます。Patreonは月額です。カード決済ではGBP、USD、EUR、CAD、AUD、JPYを利用できます。確認済みの決済ごとにAcademyコードが1つ発行されます。30日以内に入力してください。使用後のアクセス権は、選んだGoogleアカウントに残ります。",
    "Account checks on the homepage are quiet now. The protected account and session endpoints correctly return 401 for signed-out visitors, but calling them on every page made an ordinary signed-out state look like a fault in the browser console. The homepage now uses a passive account-status check and resumes an expired session only when one is present. Starting Google sign-in keeps the existing paid or invite session in place.": "ホームページのアカウント確認が静かになりました。保護されたアカウントとセッションのエンドポイントがサインアウト中の利用者に401を返すのは正しい動作でしたが、ページを開くたびにその2つを呼び出していたため、通常のサインアウト状態がブラウザーのコンソールでは不具合のように見えていました。ホームページでは変更を伴わない状態確認を使い、期限切れのセッションが残っている場合にだけ再開します。Googleでのサインインを始めても、すでにある有料または招待セッションはそのまま保たれます。",
    "Text Yomu reads from a paused YouTube video now sits on the words it was read from, including the subtitles along the bottom of the picture. To keep its reading boxes clear of the player's own controls, Yomu held a strip along the bottom of every paused frame, so a line inside that strip, which is where burned-in subtitles almost always sit, was pushed up off its own words by as much as the height of the strip. A reading box now stays on its line and moves only when it would otherwise fall outside the picture, and resuming playback is still one press of Yomu's own play button. Image-based manga readers keep the small bottom clearance they need, where a browser's own furniture covers the page.": "よむが一時停止したYouTubeの映像から読み取った文字が、画面下部の字幕も含めて、読み取り元の語の上に重なって表示されるようになりました。よむは読み取り用のボックスがプレーヤー自体の操作ボタンに重ならないように、一時停止したフレームの下端に帯状の余白を確保していたため、焼き付けの字幕がほぼ必ず置かれるその帯の中にある行が、余白の高さの分だけ本来の語より上へ押し上げられていました。読み取りボックスは自分の行の上にとどまり、映像の外にはみ出す場合にだけ移動します。再生の再開は、これまでどおりよむ自身の再生ボタンを押すだけです。画像ベースのマンガビューアーでは、ブラウザ自体の表示がページを覆う下端の小さな余白をこれまでどおり確保します。",
    "Anki note types that have a word audio field and a sentence audio field now receive each clip in its own field. Yomu recognized only one audio field, so the word's pronunciation and the sentence clip from an example were both written into whichever audio field Yomu matched first: on note types such as Lapis and jp-mining-note one field held both clips and the other stayed empty. Word audio and sentence audio are now matched separately, the Anki field mapping editor offers a row for each, and a note type with only one audio field still receives both clips there. A saved mapping that pointed the word audio row at a sentence audio field moves to the new row once, and a choice you make there afterwards is kept.": "単語音声のフィールドと文音声のフィールドを持つAnkiのノートタイプで、それぞれのクリップが自分のフィールドに入るようになりました。よむは音声フィールドを1つしか認識していなかったため、単語の発音と例文の文音声のどちらも、よむが最初に一致させた音声フィールドへ書き込まれていました。Lapisやjp-mining-noteのようなノートタイプでは、片方のフィールドに両方のクリップが入り、もう片方は空のままになっていました。単語音声と文音声はそれぞれ個別に一致させるようになり、Ankiのフィールド対応の編集画面にはそれぞれの行が表示されます。音声フィールドが1つだけのノートタイプでは、これまでどおり両方のクリップがそこに入ります。単語音声の行が文音声のフィールドを指していた保存済みの対応は一度だけ新しい行へ移され、その後に利用者が選んだ内容はそのまま保たれます。",
    "Turning off Show native subtitles now stays off across reloads. Yomu shows a native subtitle overlay when it picks a track for you, and that reveal also wrote the setting back on, so the switch returned every time a video's tracks were discovered again. Yomu now remembers that the switch is yours once you set it and leaves it alone, while choosing a native track from the track panel still turns the overlay on. Show subtitle overlay keeps its setting the same way, including the eye button on the subtitle rail and its keyboard shortcut.": "「母語字幕を表示」をオフにすると、再読み込みしてもオフのまま維持されるようになりました。よむは字幕トラックを自動で選んだときに母語字幕の表示を開きますが、その処理が設定自体もオンに書き戻していたため、動画の字幕トラックが再検出されるたびにスイッチが元に戻っていました。よむは、利用者が自分でスイッチを操作したことを記憶してその設定に触れないようになり、字幕トラックのパネルから母語トラックを選んだときは今までどおり表示がオンになります。「字幕を表示」も同じように設定を保ち、字幕レール上の目のボタンとそのキーボードショートカットにも適用されます。",
    "Turning off Prefer Japanese sites now stays off on every site and takes effect before the page can snapshot a Japanese locale. A per-site startup cache, a late shared-settings read, a delayed redirect or page injection, and an unrelated save of an older settings object could each turn the preference back on after the user had disabled it. Yomu now keeps that opt-out in its own shared authoritative setting, ignores obsolete startup work, and cancels an armed redirect immediately. It also removes the Japanese URL and cookie markers Yomu added and reloads a Google or YouTube response once when its old preference cookie had already made the current page Japanese.": "「日本語サイトを優先」をオフにすると、どのサイトでもオフのまま維持され、ページが日本語ロケールを読み取る前に反映されるようになりました。サイトごとの起動キャッシュ、遅れて返る共有設定の読み込み、遅延したリダイレクトやページ注入、古い設定オブジェクトによる無関係な保存のいずれでも、利用者が無効にした後に設定が再びオンになる可能性がありました。よむは、このオプトアウトを専用の共有された正規設定として保持し、古くなった起動処理を無視し、予約済みのリダイレクトを直ちに取り消します。また、よむが追加した日本語向けのURLとCookieの印を取り除き、以前の設定Cookieによって現在のGoogleまたはYouTubeページがすでに日本語になっていた場合は、その応答を一度だけ再読み込みします。",
    "Tapping text that Yomu recognized on image-based manga readers such as MangaFire now opens Yomu's own lookup sheet instead of a dark card from another dictionary extension. Yomitan listens for touch at the window before a userscript's document handler and treated Yomu's generated OCR characters as ordinary page text, so it could claim a recognized compound such as 秘密 before Yomu received the tap. When Yomu popup lookup has at least one enabled trigger, the OCR glyphs are now painted without adding caret-scannable text to the page while retaining the exact word targets, furigana, pitch, keyboard label and image geometry. Turning Yomu popup lookup off — including disabling every trigger — still leaves OCR text available to another reader by design.": "MangaFireのような画像型マンガリーダーで、よむが認識した文字をタップすると、別の辞書拡張機能の暗いカードではなく、よむ自身の検索シートが開くようになりました。Yomitanはユーザースクリプトのdocumentハンドラーより先にwindowでタッチを監視し、よむが生成したOCR文字を通常のページ本文として扱っていたため、よむへタップが届く前に「秘密」のような認識済み複合語を取得できていました。よむのポップアップ検索に少なくとも1つの有効な起動方法があるときは、OCRの字形をページへキャレット走査可能な文字を追加せず描画し、正確な単語のタップ対象、ふりがな、ピッチ、キーボード用ラベル、画像上の位置を保ちます。すべての起動方法を無効にした場合を含め、よむのポップアップ検索をオフにすると、設計どおり他のリーダーがOCR文字を利用できます。",
    "The homepage is easier to read at night and shorter to read at all. It carries a dark palette designed for the page rather than an inverted light one, so text keeps its contrast on a dark screen, and it now follows the light or dark setting your device already asks for. The longer explanations moved into the guides, which is where they belong.": "ホームページは夜でも読みやすく、全体も短くなりました。明るい配色を反転させたものではなく、このページのために設計した暗い配色を用いているため、暗い画面でも文字のコントラストが保たれます。お使いの端末が求める明暗の設定にも従うようになりました。長い説明はガイドへ移しました。ガイドが本来の置き場所です。",
    "The language you are studying, the language your definitions come out in, and the language Yomu's own buttons speak are now three separate choices. Ask for Korean definitions and you get Korean definitions, including on example sentences, while the interface stays in whatever language you picked for it. Your current settings carry over exactly as they were.": "学習している言語、定義が出てくる言語、よむ自身のボタンが話す言語が、それぞれ独立した3つの選択になりました。韓国語の定義を選べば、例文の訳も含めて韓国語の定義が表示され、画面の表示言語は選んだままの言語を保ちます。現在の設定はそのまま引き継がれます。",
    "Example sentences now work in the language you are studying, not only Japanese. Pick Spanish, Korean, Arabic, Greek, Lao or any other study language and the popup fetches real sentences from Tatoeba, with the translation in the language you chose for definitions, and a credit link to the sentence and its licence.": "例文が日本語だけでなく、学習している言語でも使えるようになりました。スペイン語、韓国語、アラビア語、ギリシャ語、ラオ語など、どの学習言語を選んでも、ポップアップがTatoebaから実際の文を取得します。訳は定義用に選んだ言語で表示され、文とそのライセンスへのクレジットリンクが付きます。",
    "Sentence audio plays where the recording is openly licensed, and the card says so when it is not. Japanese keeps Immersion Kit exactly as before, with its clips and frames.": "録音が公開ライセンスの場合は文の音声を再生でき、そうでない場合はカードにその旨が表示されます。日本語ではこれまでどおりImmersion Kitを使い、クリップと場面画像もそのままです。",
    "An example source with nothing to show now tells you which of those it is. \"No examples for this word yet\", \"this source has no Spanish sentences\", \"this corpus is small\", \"these sentences came without openly licensed audio\" and \"examples did not load\" each read differently, and the last one offers a retry. Before, all five looked the same: an empty space.": "表示するものがない例文の情報源が、そのどれに当たるのかを伝えるようになりました。「この語の例文はまだありません」「この情報源にスペイン語の例文はありません」「コーパスが小さい」「公開ライセンスの音声が付いていない」「例文を読み込めませんでした」はそれぞれ別の文として表示され、最後のものには再試行が付きます。以前はこの5つがすべて同じ、ただの空白に見えていました。",
    "Yomu's own interface now lists all 33 languages it is built for instead of two. The 31 that are not ready yet are shown greyed out with the reason next to them, in your language and in theirs, so a language you were promised can never be chosen and then silently answered in English. Arabic and Farsi say that right-to-left layout checks are still running; the rest say translation is still in progress.": "よむ自身の表示言語に、対応予定の33言語すべてが並ぶようになりました。これまでは2言語だけでした。まだ準備できていない31言語は薄く表示され、選べない理由をあなたの言語とその言語の両方で示します。約束された言語を選べたのに、黙って英語で答えられることはもうありません。アラビア語とペルシア語は右から左へのレイアウト確認が進行中であること、それ以外は翻訳が進行中であることを示します。",
    "The puck's full three-state cycle now survives a reload. Resuming from paused restores furigana through the same durable preference path as a normal furigana change, so an older explicit \"hide furigana\" choice cannot replace it after the annotation switch is saved.": "パックの3段階の電源切り替えが、再読み込み後も正しく保たれるようになりました。一時停止から再開すると、通常のふりがな変更と同じ確実な設定保存経路でふりがなを復元するため、注釈の切り替えを保存した後に以前の「ふりがなを隠す」という明示設定で上書きされることがなくなりました。",
    "A setting changed while factory reset is already in progress now reports that it could not be saved instead of showing a successful save for a write the reset deliberately discarded.": "初期化の進行中に変更した設定は、保存できなかったことを表示するようになりました。初期化によって破棄された書き込みを、保存に成功したように見せることはありません。",
    "Every study language now has its own row of lookup sites, the way Japanese has had Jisho, Weblio and Immersion Kit all along. Pick Spanish and the pills open the Real Academia and SpanishDict; pick Cantonese and they open 粵典, CantoWords and CantoDict; pick Ancient Greek and they open Logeion, the LSJ and the Perseus corpus.": "学習するどの言語にも、専用の検索サイトの並びが用意されました。日本語がJisho、Weblio、Immersion Kitを備えてきたのと同じです。スペイン語を選べばレアル・アカデミアとSpanishDictが開き、広東語を選べば粵典、CantoWords、CantoDictが開き、古典ギリシャ語を選べばLogeion、LSJ、ペルセウスのコーパスが開きます。",
    "Each site says what it gives you before you click it — definitions, example sentences, audio, images — and Yomu names the ones no site for your language offers, so an empty row is an answer rather than a puzzle. Ancient Greek has no pronunciation site; among these new rows, Chinese is the only target with a verified image source.": "各サイトは、押す前に何が得られるのかを示します。定義、例文、音声、画像です。さらに、その言語ではどのサイトも提供していないものをよむが名指しするので、並びが空いていることが謎ではなく答えになります。古典ギリシャ語には発音のサイトがなく、新しい並びの中で確認済みの画像情報源があるのは中国語だけです。",
    "Changing the language you are studying swaps the row to that language's sites. Any site you added yourself comes with you, and a pill you switched off — including an installed frequency badge — stays off.": "学習する言語を変えると、並びもその言語のサイトに入れ替わります。自分で追加したサイトはそのまま引き継がれ、インストール済みの頻度バッジを含め、オフにしたものはオフのまま維持されます。",
    "Japanese is untouched: same pills, same order, same settings.": "日本語はそのままです。並ぶものも、順番も、設定も変わりません。",
    "Lookup pills now include the twelve Linguee language pairs that returned word results in Chrome. German Linguee and YouGlish will return when their routes show word results.": "検索ピルには、Chromeで単語の結果を返したLingueeの12組の言語ペアが含まれるようになりました。ドイツ語版LingueeとYouGlishは、それぞれの経路で単語の結果が表示されるようになった時点で戻ります。",
    "Arabic, Khmer, Lao and Thai now open native dictionaries: Maajim, Khmer Dictionary, Lao Dictionary and Longdo. Their query paths preserve diacritics.": "アラビア語、クメール語、ラオ語、タイ語で、それぞれMaajim、Khmer Dictionary、Lao Dictionary、Longdoという母語辞書が開くようになりました。検索語のパスではダイアクリティカルマークが保持されます。",
    "Vietnamese Settings labels Tra tu Soha as a plaintext HTTP link before it opens.": "ベトナム語の設定では、Tra tu Sohaを開く前に、プレーンテキストHTTPリンクであることを表示するようになりました。",
    "Hover lookups no longer announce themselves as modal dialogs. Clicked lookups keep keyboard focus inside, hide the page from screen readers while open, and return focus to the word after Escape.": "ホバー検索はモーダルダイアログとして読み上げられなくなりました。クリックで開いた検索では、開いている間はキーボードフォーカスが検索内に保たれ、スクリーンリーダーからページ本文が隠されます。Escapeで閉じるとフォーカスは調べた単語に戻ります。",
    "Error details stay in diagnostics while lookup, review, scan, settings, audio, subtitle-mining, and reset failures now show interface-language copy. JPDB key, rate-limit, connection, and timeout failures have their own messages.": "エラーの詳細は診断ログに残し、検索、レビュー、スキャン、設定、音声、字幕採掘、リセットの失敗はインターフェース言語で表示するようになりました。JPDBのキー、レート制限、接続、タイムアウトには、それぞれ専用のメッセージがあります。",
    "First-run setup now shows progress while downloading the default offline Japanese dictionaries. Before it starts, the option names the dictionary contents and their 35.1 MiB download size.": "初回セットアップで、標準のオフライン日本語辞書をダウンロードしている間の進捗が表示されるようになりました。開始前の選択肢には、辞書の内容と35.1 MiBのダウンロードサイズが表示されます。",
    "OCR text stays aligned with manga pages while scrolling. In the Chromium fixture, the positioning pass for six visible layers from 24 recognised images ran 11.22 times faster.": "スクロール中もOCRテキストが漫画ページの文字位置にそろうようになりました。Chromiumのフィクスチャでは、認識済み画像24枚のうち表示中の6レイヤーを対象とした位置合わせ処理が11.22倍速くなりました。",
    "Study keeps typed answers in the selected language. Spanish stays Spanish, Russian stays Cyrillic, Arabic uses right-to-left input, and Japanese still converts romaji to kana.": "学習の入力式問題では、答えが選んだ言語のまま保たれるようになりました。スペイン語はスペイン語のまま、ロシア語はキリル文字のまま残り、アラビア語には右から左の入力方向が設定されます。日本語では引き続きローマ字をかなに変換します。",
    "On iPad, subtitle font size now applies to the parsed Japanese words that actually paint the cue, including furigana and karaoke text. Mobile page styles can no longer leave the Japanese line tiny while the native subtitle grows.": "iPadで、字幕の文字サイズが、実際に字幕を描画する解析済みの日本語の単語、ふりがな、カラオケ表示にも適用されるようになりました。モバイル向けページのスタイルによって、母語字幕だけが大きくなり、日本語字幕が小さいままになることはありません。",
    "Browser text-to-speech now selects a voice that matches the study language. Russian uses a Russian voice when installed, same-language regional voices are next, and a non-Japanese utterance no longer falls back to a Japanese voice.": "ブラウザーの読み上げ音声が、学習言語に合う声を選ぶようになりました。ロシア語の声がインストールされていればロシア語で読み上げ、次に同じ言語の地域違いの声を使います。日本語以外の文が日本語の声へフォールバックすることもなくなりました。",
    "Japanese site preference now runs only for a Japanese study target and no longer changes timezone or geolocation. It still opens Japanese versions of supported sites and supplies Japanese locale hints without rewriting the browser's physical location.": "日本語サイトの設定は、学習対象が日本語の場合にだけ動作し、タイムゾーンや位置情報を変更しなくなりました。対応サイトの日本語版を開き、日本語のロケール情報を渡す動作は維持しながら、ブラウザーの現在地は書き換えません。",
    "Japanese YouTube filtering and channel suggestions now stay inactive for other study languages until you turn them on. Switching to Russian leaves Russian videos visible, and changing language no longer rewrites your saved choice.": "日本語向けのYouTubeフィルターとチャンネル候補は、自分で有効にするまで他の学習言語では動作しなくなりました。ロシア語に切り替えるとロシア語の動画がそのまま表示され、学習言語を変えても保存済みの選択は書き換えられません。",
    "First-run setup now lets you choose the language you are reading. Japanese is labelled Full Yomu support; the other 32 targets are labelled Reading and lookup, and the offline starter follows that choice.": "初回セットアップで、読む言語を選べるようになりました。日本語は「よむの全機能」、ほかの32言語は「読解と検索」と表示され、オフラインの初期辞書もその選択に合わせて変わります。",
    "Dictionary recommendations now follow both the reading language and the definition language. An English-speaking learner reading Spanish gets Spanish-headword terms with English definitions plus Spanish IPA, and IPA dictionaries appear as pronunciation sources in lookups.": "おすすめ辞書が、読む言語と語義の言語の両方に合わせて変わるようになりました。英語を使う学習者がスペイン語を読む場合は、スペイン語の見出し語、英語の語義、スペイン語のIPAが入り、IPA辞書は検索結果で発音情報として表示されます。",
    "Offline dictionary lookup now preserves Thai and Lao SARA AM, and matches sentence-initial Latin and Cyrillic words. Spanish, German, Russian, Arabic, and Korean also try a bounded list of language-specific affix forms. Korean removes only listed particles; Chinese keeps whole-segment lookup.": "オフライン辞書検索で、タイ語とラオ語のSARA AMを保持し、文頭のラテン文字・キリル文字の単語にも一致するようになりました。スペイン語、ドイツ語、ロシア語、アラビア語、韓国語では、言語ごとの限定された接辞候補も試します。韓国語では一覧にある助詞だけを外し、中国語ではセグメント全体の検索を保ちます。",
    'Choose the language you are reading separately from the language used for definitions. Japanese is labelled': '読む言語と、定義に使う言語は別々に選べます。日本語の表示は',
    // The readiness labels and the two docs sentences they appear in. Rewritten
    // 2026-08-02 when the capability matrix was measured: every one of the 33
    // targets has the full read-mine-review loop, so "Reading and lookup" was
    // telling 32 languages they could not be studied.
    'Read, mine and review': '読んで、集めて、復習',
    '. The other 32 are labelled': '。ほかの32言語は',
    '— the whole loop works in every one of them. Japanese is the deepest rather than the only one: it adds pitch accent, kanji cards and far more grammar.': '——どの言語でも一連の流れがそのまま使えます。日本語は「唯一使える言語」ではなく「もっとも深い言語」で、ピッチアクセント、漢字カード、そして圧倒的に多くの文法項目が加わります。',
    'No — all 33 targets can be read, mined and reviewed. You look a word up, keep it with the sentence you found it in, and review it on a schedule, in any of them. First-run setup and Settings label the other 32': 'いいえ——33の学習言語すべてで、読む・集める・復習するができます。単語を調べ、見つけた文と一緒に保存し、スケジュールに沿って復習する。どの言語でも同じです。初回セットアップと設定では、ほかの32言語を',
    ', and the dictionary catalogue carries headwords across all of them.': 'と表示し、辞書カタログはその全言語の見出し語を収録しています。',
    'Japanese is labelled': '日本語は',
    'because it is the deepest, not because it is the only one that works: it adds pitch accent, kanji cards, and 307 grammar points where Spanish, French and Russian currently have eight. Your recommended starter follows the selected target and definition language; for English plus Spanish, that means Spanish terms with English definitions and Spanish IPA in the pronunciation row where Japanese shows pitch accent. The interface itself speaks English and 日本語.': 'と表示されますが、これは「唯一使える言語」という意味ではなく「もっとも深い」という意味です。ピッチアクセント、漢字カード、そして307の文法項目があり、スペイン語・フランス語・ロシア語は現在8項目です。おすすめの初期辞書は、選んだ対象言語と語義の言語に合わせて変わります。英語とスペイン語なら、スペイン語の単語、英語の語義、そして日本語のピッチアクセントと同じ発音欄にスペイン語のIPAが表示されます。インターフェースは英語と日本語に対応しています。',
    'Full Yomu support': 'よむの全機能',
    '. The other 32 targets are labelled': 'です。ほかの32言語は',
    'Reading and lookup': '読解と検索',
    ', matching the features ready for them today. Japanese remains the deepest path for study and mining.': 'と表示され、現在使える機能と一致しています。学習とマイニングでは、日本語が最も充実しています。',
    'Sentence-audio mining, deeper study tools for the reading-and-lookup targets, and Migaku import are in development. Academy is a story-driven Japanese course from first sounds to N1; it is in development and invitation-only while it is built.': '文音声の採集、読解と検索に対応した言語向けのより深い学習機能、Migaku取り込みは開発中です。Academyは最初の音からN1までを扱う物語型の日本語講座です。開発中で、制作中は招待制です。',
    'Japanese is the deepest today, with pitch accent, kanji and furigana. First-run setup and Settings label it': '現在は日本語が最も充実し、ピッチアクセント、漢字、ふりがなに対応しています。初回セットアップと設定では',
    '. The other 32 study targets are labelled': 'と表示されます。ほかの32の学習言語は',
    ', and the dictionary catalogue carries headwords across all of them. Your recommended starter follows the selected target and definition language; for English plus Spanish, that means Spanish terms with English definitions and Spanish IPA in the pronunciation row where Japanese shows pitch accent. The interface itself speaks English and 日本語.': 'と表示され、辞書カタログにはその全言語の見出し語があります。おすすめの初期辞書は、選んだ対象言語と語義の言語に合わせて変わります。英語とスペイン語なら、スペイン語の単語、英語の語義、そして日本語のピッチアクセントと同じ発音欄にスペイン語のIPAが表示されます。インターフェースは英語と日本語に対応しています。',
    // Homepage (docs/index.md): A28 fold, learning story, proof bands,
    // no-install apps, install band, footer nav.
    'よむ — A complete system for learning Japanese': 'よむ — 日本語学習のための一式',
    'よむ — A complete system for learning 日本語': 'よむ — 日本語学習のための一式',
    'Read Japanese web pages, subtitles, manga and PDFs, save the words you meet, and review them with their original context. Free on computers, phones and tablets.': '日本語のウェブページ、字幕、漫画、PDFを読み、出会った単語を元の文脈と一緒に保存して復習できます。パソコン、スマートフォン、タブレットで無料で使えます。',
    // The demoted multilingual line. Split into three keys because the count
    // between them is rendered by a component and is deliberately not translated.
    'The same loop works in': '同じ流れが使えるのは、日本語のほかに',
    'other languages, from Spanish to Korean.': '言語。スペイン語から韓国語まで。',
    'Which ones': '対応言語を見る',
    // The whole sentence, because Japanese reorders it: 日本語 leads. The old
    // fragment key existed only because a rotator split the headline in two.
    'A complete system for learning 日本語.': '日本語を学ぶための、すべてがそろう。',
    'Japanese': '日本語',
    'Chinese': '中国語',
    'Cantonese': '広東語',
    'Korean': '韓国語',
    'Spanish': 'スペイン語',
    'French': 'フランス語',
    'German': 'ドイツ語',
    'Russian': 'ロシア語',
    'Vietnamese': 'ベトナム語',
    'Japanese.': '日本語。',
    'Chinese.': '中国語。',
    'Cantonese.': '広東語。',
    'Korean.': '韓国語。',
    'Spanish.': 'スペイン語。',
    'French.': 'フランス語。',
    'German.': 'ドイツ語。',
    'Russian.': 'ロシア語。',
    'Vietnamese.': 'ベトナム語。',
    'I studied how to study Japanese for far too long before I read anything': '日本語を読み始めるより先に、勉強の仕方を調べることに時間をかけすぎました',
    'The tools were scattered and each one wanted a different setup, so I built the one I wanted instead: read, watch, press a word, keep it, come back to it. Nothing to wire together.': '道具はばらばらで、どれも別々の設定を求めてきました。そこで、自分がほしかったものを作りました。読む、見る、単語を押す、保存する、また戻る。つなぎ合わせる作業はありません。',
    'Furigana sits above the kanji and the lookup answers from dictionaries on your device. Open a PDF here, scanned pages included, or take the same reader to any web page.': 'ふりがなは漢字の上に付き、意味は端末の中の辞書が答えます。ここでPDFを開けば、スキャンされたページも読めます。同じリーダーをどのウェブページへも持っていけます。',
    'It fits the deck you already review in': 'いま復習しているデッキに、そのまま合わせられます',
    'Learn it the way you learned your first one': '最初の言語を覚えたときと同じやり方で',
    'Read a little above what you know.': '今わかる少し上を読む。',
    'Meet the language in something you wanted to read anyway, often, and slightly beyond you. Grammar tables can wait.': 'もともと読みたかったものの中で、少し背伸びした言葉に何度も出会う。文法表は後でいい。',
    'Get the first two thousand words early.': 'まず最初の二千語をそろえる。',
    'They cover roughly four fifths of ordinary text, so front-loading them makes everything after easier. Ten minutes a day does it.': 'ふつうの文章の五分の四ほどは、この二千語でまかなえる。先に押さえるほど、あとが楽になる。一日十分で足りる。',
    'Then read a lot, and let the hard words go.': 'そのうえで、たくさん読み、難しい語は手放す。',
    'Skip what you do not know and keep moving. Yomu collects what you skipped so you can come back to it later.': 'わからない語は飛ばして進む。飛ばした語はよむが集めておくので、あとで戻ってこられる。',
    'The whole approach, in order': '進め方の全体を順番に',
    'Anki, jpdb, jiten, Bunpro.': 'Anki、jpdb、jiten、Bunpro。',
    'Yomu writes the word there and reads back what that service already knows. Migaku is next.': 'よむはその単語をそちらへ書き込み、そのサービスがすでに知っている内容を読み取ります。次はMigakuに対応します。',
    'Or keep the words in Yomu.': 'または、単語をよむの中に残す。',
    'Its deck schedules on SM-2 and carries the sentence, the audio and the picture with each word.': '内蔵デッキはSM-2で予定を組み、単語ごとに例文、音声、画像を一緒に運びます。',
    'Coming from Migaku or Duolingo?': 'MigakuやDuolingoから移ってきましたか。',
    'The plain comparison, item by item': '項目ごとの率直な比較',
    'The desktop app reads the Japanese on screen with OCR and hands it back as words you can press. Separate download for Windows, macOS, Linux and Steam Deck.': 'デスクトップアプリが画面の日本語をOCRで読み取り、押せる単語として返します。Windows、macOS、Linux、Steam Deck向けの別ダウンロードです。',
    'Academy opens by invitation while it is built': 'Academyは開発中のあいだ、招待制で公開しています',
    "A story-driven course from the first sounds to N1, taught through places and conversations, with Yomu's reading and review underneath.": '最初の音からN1まで進む物語仕立てのコースです。場所と会話を通して学び、その下でよむの読解と復習が動きます。',
    'Everything here runs in this tab, with nothing installed': 'ここにあるものは、何もインストールせずにこのタブで動きます',
    'If the userscript downloads instead of installing,': 'ユーザースクリプトがインストールされずにダウンロードされた場合は、',
    'your manager needs it from the URL': 'マネージャーでURLから入れてください',
    'More from Yomu': 'よむの他のページ',
    'See it working below': '下で実際の動きを見る',
    'Come and say hello.': '気軽に声をかけてください。',
    'Discord is where users compare setups, report rough edges and help shape what comes next. Bring a question or a screenshot. Do not be shy.': 'Discordでは、利用者同士で設定を見せ合い、使いにくいところを報告し、次に作るものを一緒に決めています。質問やスクリーンショットを持ってきてください。遠慮はいりません。',
    'Join the Yomu Discord': 'よむのDiscordに参加する',
    'Look up a word. Keep your place.': '単語を調べる。読んでいた場所はそのまま。',
    'Pause on one line.': '一行で止める。',
    "Press a word in the subtitle, hear it, save the sentence and carry on. Yomu draws over the player already on the site. The hosted player opens your own video and subtitle files too.": '字幕の単語を押し、音を聞き、文を保存して続きを見ます。よむはサイトにあるプレーヤーの上に描画します。ホスト版プレーヤーでは、自分の動画と字幕ファイルも開けます。',
    'Save the sentence around it.': 'その単語を囲む文ごと保存する。',
    // The manga and mobile evidence bands (docs/index.md #manga, #mobile).
    'Press a word inside the picture.': '画像の中の単語を押す。',
    'Tap a panel and よむ finds the Japanese in it, on a laptop or with a thumb on an iPad.': 'コマをタップすると、よむがその中の日本語を見つけます。パソコンでも、iPadなら指でも使えます。',
    'This panel is live. よむ is reading the words in it.': 'このコマは実際に動いています。よむがいま中の単語を読み取っています。',
    'The same reader, on your phone.': '同じリーダーが、スマートフォンでも。',
    'Press a word on your phone or tablet and everything comes with it: the furigana, the pitch colours, the popover and the grading buttons. On Android, よむ is one click from the Firefox store; on iPhone and iPad it runs in Safari through a free userscript manager.': 'スマートフォンやタブレットで単語を押すと、ふりがな、ピッチの色、ポップオーバー、評価ボタンがそのまま付いてきます。Androidでは、よむはFirefoxのストアからワンクリックで入ります。iPhoneとiPadでは、無料のユーザースクリプトマネージャーを通してSafariの中で動きます。',
    'よむ on a phone, showing Japanese Wikipedia with furigana above the kanji and the lookup popover open on コーヒー with its pitch accent, meaning and grading buttons.': 'スマートフォンで動作しているよむ。漢字の上にふりがなが付いた日本語版Wikipediaと、「コーヒー」のピッチアクセント、意味、評価ボタンを表示した検索ポップオーバーが開いています。',
    'よむ on an iPad, showing a Japanese Wikipedia article with furigana and the 喫茶店 popover open with two pitch accent patterns, the dictionary meaning and example sentences.': 'iPadで動作しているよむ。ふりがなの付いた日本語版Wikipediaの記事と、2つのピッチアクセント型、辞書の意味、例文を表示した「喫茶店」のポップオーバーが開いています。',
    'The word returns with the sentence where you found it. A saved show line can carry its audio and picture too. Review by reading, writing, listening and speaking, then choose the grade yourself.': '単語は、見つけたときの文と一緒に戻ります。番組の台詞なら、音声と画像も付けられます。読み、書き、聞き、声に出してから、自分で評価を選びます。',
    'Press one shortcut in a PC game.': 'PCゲームでショートカットを一度押す。',
    'See Yomu Gaming': 'Yomu Gamingを見る',
    'read': '読む',
    'keep': '残す',
    'Visit the Academy': 'Academyを訪れる',
    'Study, the video player, the PDF reader and the live OCR panel all run here with nothing installed.': 'Study、動画プレーヤー、PDFリーダー、ライブOCRパネルは、どれも何もインストールせずにここで動きます。',
    'Open a review card.': '復習カードを開く。',
    'Open a video and subtitles.': '動画と字幕を開く。',
    'Open a PDF.': 'PDFを開く。',
    'Press a word in the panel.': 'コマの単語を押す。',
    'Take Yomu to the rest of the web.': 'よむをウェブの続きへ持っていく。',
    'Install Yomu, open something you wanted to read anyway, and press a word.': 'よむをインストールし、もともと読みたかったものを開いて、単語を押します。',
    ', open something you wanted to read anyway, and': 'し、もともと読みたかったものを開いて、',
    'press a word.': '単語を押します。',
    'Add よむ to your browser': 'よむをブラウザーに追加',
    'The よむ lookup popover for 季語, showing pitch accent, audio, a dictionary definition and example sentences.': 'ピッチアクセント、音声、辞書の意味、例文を表示した「季語」のよむポップオーバー。',
    'Japanese Wikipedia with furigana above the kanji, coloured underlines on every word, and the よむ popover open.': '漢字の上にふりがなが付き、すべての単語に色付きの下線が引かれ、よむのポップオーバーが開いた日本語版Wikipedia。',
    'A YouTube video with the Japanese subtitle annotated on the picture and the full subtitle list open beside it.': '映像の上に日本語字幕が注釈付きで表示され、横に字幕一覧が開いたYouTubeの動画。',
    'Example sentences with audio inside the よむ popover, above the grading buttons that keep the word.': 'よむのポップオーバー内の音声付き例文と、その下にある単語を保存するための評価ボタン。',
    'The よむ Study page on the Type step, with the answer typed in and marked correct.': '入力ステップのよむの学習ページ。解答が入力され、正解と表示されています。',
    'The Yomu Study page on the Type step, with the answer typed in and marked correct.': '入力ステップのよむの学習ページ。解答が入力され、正解と表示されています。',
    'How Yomu compares with Migaku and Duolingo': 'MigakuやDuolingoとの違い',
    'Permalink to "How Yomu compares with Migaku and Duolingo"': '「MigakuやDuolingoとの違い」への固定リンク',
    "Against Migaku: Yomu is free, and that includes Anki export and mobile. Install is one click from the Chrome or Firefox store, with no account before your first lookup. On a phone it runs in the browser you already have. Add any Yomitan dictionary, keep your RTK keywords, or study vocabulary only. Subtitles draw over the site's own player, and switching Yomu off hands the page back untouched. Migaku import is in development.": 'Migakuとの比較。よむは無料で、Ankiへの書き出しとモバイル利用も含まれます。ChromeまたはFirefoxのストアからワンクリックで入り、最初の検索までアカウントは要りません。スマートフォンでは、いつものブラウザーで動きます。好きなYomitan辞書を追加し、RTKのキーワードを残すことも、語彙だけを学ぶこともできます。字幕はサイト本来のプレーヤー上に描かれ、よむを切るとページはそのまま元に戻ります。Migakuの取り込みは開発中です。',
    'Against Duolingo: you pick the words, straight from the shows and manga you were already going to watch and read. Review sentences are the ones you found each word in, so practice sounds like real Japanese rather than a course script. There is no path and no energy meter. Study when you want, as much as you want. Mark a word known once and it stops turning up.': 'Duolingoとの比較。単語を選ぶのはあなたで、これから見る番組や読む漫画からそのまま選びます。復習に出る文は、その単語を見つけたときのものなので、教材用の台本ではなく実際の日本語に触れられます。決められた道順もエネルギーメーターもありません。好きなときに、好きなだけ学べます。一度「既知」にした単語は出なくなります。',
    'Where that option lives depends on the manager. Tampermonkey keeps it under Utilities → Install from URL. Violentmonkey uses + → Install from URL. ScriptCat uses Script list → Create → Install from URL, and will also accept the downloaded file dragged onto its tab.': 'その項目の場所はマネージャーによって違います。TampermonkeyではUtilities → Install from URLにあります。Violentmonkeyは+ → Install from URL、ScriptCatはScript list → Create → Install from URLです。ScriptCatなら、ダウンロードしたファイルをタブにドラッグしても入ります。',
    // FAQ page (docs/faq.md). Fragment keys follow the localizer's text-node
    // segmentation: a paragraph with inline links yields one key per text node,
    // punctuation retained, and the ja fragments are written so that DOM-order
    // concatenation reads as natural Japanese.
    // Membership page (docs/membership.md). 'Membership' rather than 'Donate':
    // contributing is planned to unlock Academy, so it is access, not charity.
    'Membership': 'メンバーシップ',
    'Permalink to "Membership"': '「メンバーシップ」への固定リンク',
    'Help': 'ヘルプ',
    'Yomu is free and stays free. Chip in toward its small monthly bill through a verified support provider.': 'よむは無料で、これからも無料です。確認済みの支援サービスから、少額の月間運営費を支援できます。',
    'Yomu is free and stays free. If it has earned a place in your day, you can chip in through Ko-fi, Patreon or card — whichever you already use.': 'よむは無料で、これからも無料です。毎日の役に立っていると感じたら、Ko-fi、Patreon、カードのうち、使いやすい方法で支援できます。',
    'Yomu is free, and the reader stays free.': 'よむは無料で、リーダーはこれからも無料です。',
    'Everything on this site works without paying: reading, lookups, reviews, manga, subtitles, dictionaries.': 'このサイトのすべてが、支払いなしで使えます。読むこと、検索、復習、漫画、字幕、辞書。',
    'Support is for people who want to keep Yomu being built. It also helps fund Academy.': '支援は、よむの開発を続けてほしい人のためのものです。Academyの開発費にも充てられます。',
    'Choose the service you already use': '普段使っているサービスを選ぶ',
    'Permalink to "Choose the service you already use"': '「普段使っているサービスを選ぶ」への固定リンク',
    'The checked-in forecast for hosting, storage, the domain, APIs, and test devices is exactly £10.20 a month. The public status bar displays the nearest whole unit, £10, and keeps exact GBP values for accounting.': 'ホスティング、ストレージ、ドメイン、API、テスト端末の登録済み見積もりは、月額ちょうど£10.20です。公開ステータスバーでは最も近い整数の£10と表示し、集計には正確なGBP額を使います。',
    'Ko-fi takes one-off or monthly payments. Patreon is monthly. Card checkout accepts GBP, USD, EUR, CAD, AUD, and JPY. Buy Me a Coffee and PayPal appear in the live status bar once their official pages and verified webhooks are ready.': 'Ko-fiは一回限りと毎月の支援に対応し、Patreonは毎月です。カード決済ではGBP、USD、EUR、CAD、AUD、JPYを利用できます。Buy Me a CoffeeとPayPalは、公式ページと確認済みWebhookの準備が整うと公開ステータスバーに表示されます。',
    'After the support migrations and Worker are deployed, verified support from all five services counts toward the monthly bill. Patreon contributes authenticated increases in its paid campaign-lifetime total; the other four services contribute verified receipts. Card, Ko-fi, and qualifying Patreon support can create one Academy code. Buy Me a Coffee and PayPal will join support accounting after activation, without creating a code.': '支援用の移行とWorkerをデプロイすると、5つのサービスから届く確認済み支援が月間運営費に集計されます。Patreonでは支払い済みキャンペーン累計額の認証済み増分を、ほかの4サービスでは確認済み入金を加算します。カード、Ko-fi、条件を満たすPatreon支援ではAcademyコードを1つ発行できます。Buy Me a CoffeeとPayPalは有効化後に、コードを発行せず支援額の集計へ加わります。',
    'Enter an Academy code within 30 days. Once redeemed, access stays with the Google account you choose.': 'Academyコードは30日以内に入力してください。使用後のアクセス権は、選んだGoogleアカウントに残ります。',
    'What support makes possible': '支援でできること',
    'Permalink to "What support makes possible"': '「支援でできること」への固定リンク',
    'Academy access from code-granting support.': 'コードが発行される支援からAcademyへアクセス。',
    'Academy teaches Japanese from zero, in order, and is in development. Card, Ko-fi, and qualifying Patreon support can issue a code.': 'Academyはゼロから順番に日本語を教えるもので、現在開発中です。カード、Ko-fi、条件を満たすPatreon支援ではコードを発行できます。',
    "Supporters' reports and requests get answered first.": '支援者からの報告や要望を先に対応します。',
    'Reader improvements for everyone.': 'すべての人に向けたリーダーの改善。',
    'Lookup, dictionary, subtitle, and review features stay open.': '検索、辞書、字幕、復習の機能は引き続き誰でも使えます。',
    'Reader access stays the same': 'リーダーの利用方法は変わりません',
    'Permalink to "Reader access stays the same"': '「リーダーの利用方法は変わりません」への固定リンク',
    'The reader stays open.': 'リーダーは誰でも使えます。',
    'Reading and study features work without a membership.': '読む機能と学習機能はメンバーシップなしで使えます。',
    'Your saved work stays yours.': '保存した内容は自分のものです。',
    'Stop supporting whenever you like.': '支援はいつでもやめられます。',
    'Sharing Yomu and reporting bugs also help.': 'よむを紹介したり、不具合を報告したりすることも助けになります。',
    'Membership is for people who want to keep it being built — and it is how Academy will be funded, so members get access when it opens.': 'メンバーシップは、開発を続けてほしいと思う人のためのものです。アカデミーの費用もここから出るため、公開時にはメンバーが利用できます。',
    'Pick whichever you already use': '使いやすい方法を選んでください',
    'Permalink to "Pick whichever you already use"': '「使いやすい方法を選んでください」への固定リンク',
    'All three go to the same place. Choose the one you find easiest — there is no better option, and no difference to what you get.': '3つとも同じ場所に届きます。いちばん簡単なものを選んでください。どれが優れているということはなく、得られるものも変わりません。',
    'Ko-fi': 'Ko-fi',
    'Patreon': 'Patreon',
    'One-off or monthly.': '一回限りまたは毎月。',
    'Monthly.': '毎月。',
    'One-off in GBP, USD, EUR, CAD, AUD or JPY.': 'GBP、USD、EUR、CAD、AUD、JPYで一回限り。',
    'Yomu is free and the reader stays free. Membership pays for building it, and includes Academy when it opens.': 'よむは無料で、リーダーはこれからも無料です。メンバーシップは開発を支え、公開時のAcademy利用が含まれます。',
    'Close': '閉じる',
    'Ask about card payment': 'カード決済について問い合わせる',
    'Ko-fi takes one-off or monthly. Patreon is monthly. Card payment is being set up —': 'Ko-fiは一回きりでも毎月でも使えます。Patreonは毎月です。カード決済は準備中です。',
    'and it will be sorted for you.': 'に連絡いただければ対応します。',
    'What members get': 'メンバーが得られるもの',
    'Permalink to "What members get"': '「メンバーが得られるもの」への固定リンク',
    'Academy access when it opens.': '公開時のアカデミー利用。',
    'Academy teaches Japanese from zero, in order, and is in development. Members get in.': 'アカデミーはゼロから順番に日本語を教えるもので、現在開発中です。メンバーは利用できます。',
    'A say in what gets built next.': '次に作るものへの発言権。',
    "Members' reports and requests get answered first.": 'メンバーの報告や要望が先に対応されます。',
    'The reader keeps improving for everyone.': 'リーダーは全員のために良くなり続けます。',
    'Nothing in the reader gets locked behind this.': 'リーダーの機能がこれによって制限されることはありません。',
    'What it does not do': 'これがしないこと',
    'Permalink to "What it does not do"': '「これがしないこと」への固定リンク',
    'It does not unlock reader features.': 'リーダーの機能を解除するものではありません。',
    'No paywalled lookups, dictionaries, subtitles or reviews — now or later.': '検索、辞書、字幕、復習が有料の壁の向こうに行くことは、今も今後もありません。',
    'It is not a subscription you have to keep.': '続けなければならない購読ではありません。',
    'Stop whenever you like; nothing you saved is taken away.': 'いつでもやめられます。保存したものが失われることはありません。',
    'Other ways to help, free': '無料で手伝えること',
    'Permalink to "Other ways to help, free"': '「無料で手伝えること」への固定リンク',
    'Money is not the only useful thing, and for a project this size it is not even the most useful.': '役に立つのはお金だけではありません。この規模のプロジェクトでは、いちばん役に立つものでもありません。',
    'Tell one other learner.': 'ほかの学習者ひとりに伝える。',
    "Yomu's biggest problem is that people who would like it have never heard of it.": 'よむの最大の課題は、気に入ってくれるはずの人に知られていないことです。',
    'Report what broke.': '壊れているところを報告する。',
    'A clear bug report is worth more than a month of coffee:': 'わかりやすい不具合報告は、1か月分のコーヒーより価値があります。',
    'Rate it in the store.': 'ストアで評価する。',
    'reviews are how new learners decide to trust it.': 'のレビューは、新しい学習者が信頼するかどうかを決める材料になります。',
    'Frequently asked questions': 'よくある質問',
    'What is Yomu?': 'よむとは？',
    'Permalink to "What is Yomu?"': '「よむとは？」への固定リンク',
    'Permalink to "Frequently asked questions"': '「よくある質問」への固定リンク',
    'Permalink to "Getting started"': '「はじめに」への固定リンク',
    'Permalink to "Do I need an account?"': '「アカウントは必要ですか？」への固定リンク',
    'Permalink to "Is Yomu free?"': '「よむは無料ですか？」への固定リンク',
    'Permalink to "I\'m not technical. What\'s the easiest way to install it?"': '「詳しくないのですが、いちばん簡単な入れ方は？」への固定リンク',
    'Permalink to "Does it work on my phone?"': '「スマートフォンでも使えますか？」への固定リンク',
    'Permalink to "Do I need to know kana or grammar first?"': '「かなや文法を先に知っておく必要はありますか？」への固定リンク',
    'Permalink to "I\'m a complete beginner. Can Yomu teach me Japanese from zero?"': '「まったくの初心者です。よむはゼロから日本語を教えてくれますか？」への固定リンク',
    'Permalink to "I installed it and nothing happens on a page."': '「インストールしたのに、ページで何も起きません。」への固定リンク',
    'Permalink to "Reading"': '「読む」への固定リンク',
    'Permalink to "Which sites does it work on?"': '「どのサイトで使えますか？」への固定リンク',
    'Permalink to "How does it read manga and pictures?"': '「漫画や画像はどうやって読むのですか？」への固定リンク',
    'Permalink to "Can it read my PC games?"': '「PCゲームの文字も読めますか？」への固定リンク',
    'Permalink to "What do the colours and lines under words mean?"': '「単語の下の色や線は何ですか？」への固定リンク',
    'Permalink to "Keeping and reviewing words"': '「単語の保存と復習」への固定リンク',
    'Permalink to "How do reviews work?"': '「復習はどのように進みますか？」への固定リンク',
    'Permalink to "What spaced-repetition algorithm does Yomu use?"': '「どの間隔反復アルゴリズムを使っていますか？」への固定リンク',
    'Permalink to "What do the card states mean?"': '「カードの状態は何を意味しますか？」への固定リンク',
    'Permalink to "Do I need Anki?"': '「Ankiは必要ですか？」への固定リンク',
    'Permalink to "I already review on jpdb, Bunpro or WaniKani."': '「すでにjpdbやBunpro、WaniKaniで復習しています。」への固定リンク',
    'Permalink to "Can I review on two devices?"': '「2台の端末で復習できますか？」への固定リンク',
    'Permalink to "Languages"': '「対応言語」への固定リンク',
    'Permalink to "Is it only for Japanese?"': '「日本語専用ですか？」への固定リンク',
    'Permalink to "Your data"': '「あなたのデータ」への固定リンク',
    'Permalink to "Where do my words and progress live?"': '「単語や進捗はどこに保存されますか？」への固定リンク',
    'Permalink to "What gets sent when I look things up?"': '「調べるとき、何が送信されますか？」への固定リンク',
    'Permalink to "The project"': '「プロジェクトについて」への固定リンク',
    'Permalink to "Something is broken. Where do I ask?"': '「不具合があります。どこで聞けばいいですか？」への固定リンク',
    'Permalink to "Can I use the dictionary mirror or the code in my own project?"': '「辞書ミラーやコードを自分のプロジェクトで使えますか？」への固定リンク',
    'Permalink to "Will Yomu stay free?"': '「よむはずっと無料ですか？」への固定リンク',
    'Read the FAQ': 'よくある質問を読む',
    'What Yomu is, what it costs, how reviews work, which languages and tools it plays with, and where your data lives — in plain answers.': 'よむとは何か、料金、復習のしくみ、対応する言語とツール、データの保存場所 — わかりやすい答えでまとめました。',
    'Plain answers, grouped by what you came here to find out. If yours is missing,': '知りたいことごとに、わかりやすくまとめました。見つからない質問は',
    'ask on Discord': 'Discordで聞いてください',
    '— real questions are how this page grows.': '— このページは実際の質問で育っていきます。',
    'A reader that turns what you already read into Japanese study.': 'いつも読んでいるものを、そのまま日本語の学習に変えるリーダーです。',
    'Press a word, anywhere.': 'どこでも、単語を押すだけ。',
    'Any Japanese page, YouTube subtitles, manga pictures, PDFs — one press gives the reading, the meaning, the pitch accent and the sound.': '日本語のページ、YouTubeの字幕、漫画の画像、PDF — ひと押しで読み・意味・ピッチアクセント・音声が出ます。',
    'Keep the words you meet.': '出会った単語を、そのまま保存。',
    'One more press saves the word with its sentence, audio and picture, ready to review. Reviews are built in.': 'もうひと押しで、例文・音声・画像ごと保存され、すぐ復習できます。復習機能は内蔵です。',
    'It runs on your phone.': 'スマートフォンでも動きます。',
    'Android installs from the Firefox store; iPhone and iPad run it in Safari. Most tools like this are desktop-only.': 'AndroidはFirefoxのストアから、iPhoneとiPadはSafariの中で動きます。この種のツールでスマートフォンに対応しているものはほとんどありません。',
    'It joins your tools instead of replacing them.': 'いまのツールを置き換えず、つながります。',
    'Anki, jpdb, Bunpro, WaniKani and jiten all connect: Yomu shows their word statuses on every page and sends your grades back.': 'Anki、jpdb、Bunpro、WaniKani、jitenと連携。各サービスの単語ステータスをすべてのページに表示し、採点結果を送り返します。',
    'Hundreds of dictionaries.': '数百の辞書。',
    'Install what you want from the built-in catalogue; installed dictionaries answer on your device.': '内蔵カタログから好きな辞書をインストールでき、インストールした辞書は端末内で応答します。',
    'Free, no account.': '無料、アカウント不要。',
    'Everything above works without signing up for anything.': 'ここまでのすべてが、何にも登録せずに使えます。',
    'Getting started': 'はじめに',
    'No. Install Yomu, open a Japanese page, press a word — that is the whole setup. Connecting Anki, jpdb, Bunpro or WaniKani is optional and only for people who already use them.': 'いいえ。よむをインストールして、日本語のページを開いて、単語を押す — 準備はそれだけです。AnkiやjpdbやBunpro、WaniKaniとの連携は任意で、すでに使っている人のためのものです。',
    'Is Yomu free?': 'よむは無料ですか？',
    'Yes — free and': 'はい。無料で、',
    'open source': 'オープンソース',
    '. There is no paid tier and nothing is locked.': 'です。有料プランはなく、制限された機能もありません。',
    "I'm not technical. What's the easiest way to install it?": '詳しくないのですが、いちばん簡単な入れ方は？',
    'On Chrome, Edge or Brave: press': 'Chrome・Edge・Braveでは、',
    'on the': 'ボタンを',
    'homepage': 'ホームページ',
    '— one click. On Firefox, including Firefox on Android: one click from the Firefox store. On iPhone, iPad and Safari it takes a couple of minutes once, with a free helper app — the': 'で押すだけ。ワンクリックです。Android版を含むFirefoxでは、ストアからワンクリック。iPhone・iPad・Safariでは無料の補助アプリを使い、初回だけ数分かかります — 手順は',
    'getting started page': 'はじめかたページ',
    'walks through it step by step.': 'が一歩ずつ案内します。',
    'Does it work on my phone?': 'スマートフォンでも使えますか？',
    'Yes. On Android, install Firefox and add Yomu from its store. On iPhone and iPad, Yomu runs inside Safari — furigana, the popover, reviews, and manga reading all work by touch.': 'はい。AndroidではFirefoxを入れて、そのストアからよむを追加します。iPhoneとiPadではSafariの中で動き、ふりがな、ポップオーバー、復習、漫画の読み取りまで、すべてタッチで使えます。',
    "installs to your home screen from your browser's menu. Once it is there it opens like any other app and works offline, so reviews still work on the train.": 'はブラウザーのメニューからホーム画面に追加できます。追加すると他のアプリと同じように開き、オフラインでも動くので、電車の中でも復習できます。',
    'Do I need to know kana or grammar first?': 'かなや文法を先に知っておく必要はありますか？',
    'No. Every word Yomu annotates carries furigana, so you can start pressing words from day one. Reading real pages is the study.': 'いいえ。よむが注釈する単語にはすべてふりがなが付くので、初日から単語を押しはじめられます。実際のページを読むこと自体が学習です。',
    "I'm a complete beginner. Can Yomu teach me Japanese from zero?": 'まったくの初心者です。よむはゼロから日本語を教えてくれますか？',
    'That is where Yomu is heading. Today Yomu makes real pages readable from day one — furigana on everything, meanings on press — and': 'それがよむの目指す場所です。今日のよむは、初日から実際のページを読めるようにします — すべてにふりがな、押せば意味。そして',
    ', a structured course that teaches Japanese from zero in order, is in development. Until it opens, the': '（ゼロから順番に日本語を教える体系的なコース）を開発中です。公開までは',
    'walk you through learning with real content.': 'が、実際のコンテンツで学ぶ方法を案内します。',
    'Can I review on two devices?': '2台の端末で復習できますか？',
    'Today your Yomu deck lives on each device, and reviews you send to Anki, jpdb, Bunpro or WaniKani follow you wherever those do. Account sync for the built-in deck is in development, so one deck can follow you from desktop to phone.': '今は、よむのデッキは端末ごとに保存されます。AnkiやjpdbやBunpro、WaniKaniに送った復習は、それらのサービスと一緒にどこへでも付いてきます。内蔵デッキのアカウント同期は開発中で、1つのデッキがパソコンからスマートフォンまで付いてくるようになります。',
    'I installed it and nothing happens on a page.': 'インストールしたのに、ページで何も起きません。',
    "Check that Yomu is allowed on that site — in your browser's extensions menu, or in your userscript manager — then refresh the page. That covers almost every report we get.": 'そのサイトでよむが許可されているか、ブラウザーの拡張機能メニューまたはユーザースクリプトマネージャーで確認して、ページを再読み込みしてください。報告のほとんどはこれで解決します。',
    'Reading': '読む',
    'Which sites does it work on?': 'どのサイトで使えますか？',
    'Any page with Japanese text on it. On top of that, YouTube gets its own subtitle reader with the video, image-based manga readers work through picture reading, and there is a': '日本語の文章があるページならどこでも。さらにYouTubeには動画と並ぶ専用の字幕リーダーがあり、画像型の漫画リーダーは画像読み取りで対応します。手元のファイルには',
    'and a': 'と',
    'for your own files.': 'があります。',
    'How does it read manga and pictures?': '漫画や画像はどうやって読むのですか？',
    'Press a picture — or use the Scan images command — and Yomu recognises the Japanese in it, so every word in the picture becomes a word you can press. Recognition uses Google Lens by default, with no key or account; you can switch to your own Google Cloud Vision key, or to a fully local service, in Settings.': '画像を押すか「画像をスキャン」コマンドを使うと、よむが画像内の日本語を認識し、写っているすべての単語が押せる単語になります。認識は初期設定でGoogle Lensを使い、キーもアカウントも不要です。設定で自分のGoogle Cloud Visionキーや、完全にローカルなサービスにも切り替えられます。',
    'Can it read my PC games?': 'PCゲームの文字も読めますか？',
    'Yes —': 'はい。',
    'is a small desktop app that reads the text on your screen, so the same press-a-word lookup works in any game.': 'は画面上の文字を読み取る小さなデスクトップアプリで、同じ「押して調べる」検索がどのゲームでも使えます。',
    'What do the colours and lines under words mean?': '単語の下の色や線は何ですか？',
    'Underline colours are pitch accent patterns. When a review system is connected, words are also tinted by how well you know them, so a page shows you at a glance what is new and what is due. All of it can be turned off in Settings.': '下線の色はピッチアクセントの型です。復習システムを連携すると、習熟度に応じて単語に色が付き、新しい単語と復習期限の単語がひと目でわかります。すべて設定でオフにできます。',
    'Keeping and reviewing words': '単語の保存と復習',
    'How do reviews work?': '復習はどのように進みますか？',
    'You grade yourself on the same five-point scale jpdb users know:': 'jpdbユーザーにおなじみの5段階で自己採点します。',
    'Grade': '評価',
    'Nothing': '全然',
    "You didn't know it at all.": 'まったく分からなかった。',
    'Something': '少し',
    "You knew something, but couldn't recall it.": '何かは覚えていたが、思い出せなかった。',
    'Hard': '難しい',
    'You knew it, with a struggle.': '分かったが、苦労した。',
    // The ja interface's own button label for this grade is literally 'OK'
    // (gradeOkayLabel), and Discord/GitHub are names — all three are in the
    // test's verbatim list.
    'Okay': 'OK',
    'Discord': 'Discord',
    'GitHub': 'GitHub',
    'You knew it.': '分かった。',
    'Easy': '簡単',
    'You knew it instantly.': 'すぐに分かった。',
    'Failed words come back in ten minutes. Known words come back on a growing schedule.': '間違えた単語は10分後に戻ってきます。覚えている単語は、間隔を伸ばしながら戻ってきます。',
    'What spaced-repetition algorithm does Yomu use?': 'どの間隔反復アルゴリズムを使っていますか？',
    'A proven ease-based scheduler from the SM-2 family — the same lineage as Anki. First intervals are one, two or four days depending on your grade; each card keeps its own ease that grows when a word is easy for you and shrinks when it is not. There is no daily cap: review as few or as many as you like, and a pile of overdue cards is fine — do what you can and the schedule adapts.': 'Ankiと同じ系統の、実績あるSM-2系のease方式です。最初の間隔は評価に応じて1日・2日・4日。カードごとにease値を持ち、簡単だった単語は間隔が伸び、そうでない単語は縮みます。1日の上限はありません。少しでもたくさんでも好きなだけ復習でき、期限切れがたまっても大丈夫 — できる分だけやれば、スケジュールが合わせてくれます。',
    'What do the card states mean?': 'カードの状態は何を意味しますか？',
    'State': '状態',
    'New': '新規',
    'Saved, never reviewed.': '保存済みで、まだ復習していない。',
    'Learning': '学習中',
    'Reviewed, on short intervals.': '復習済みで、短い間隔で回っている。',
    'Known': '既知',
    'Reviewed enough that its interval is three weeks or longer.': '間隔が3週間以上になるまで復習した。',
    'Due': '復習期限',
    'Its interval has lapsed — ready to review.': '間隔が過ぎ、復習できる状態。',
    'Do I need Anki?': 'Ankiは必要ですか？',
    "No — Yomu's reviews are built in and need no setup. If you want Anki, Yomu sends complete cards to it — word, sentence, audio and picture each to the field you choose — through AnkiConnect.": 'いいえ。よむの復習は内蔵で、設定は不要です。Ankiを使いたい場合は、単語・例文・音声・画像をそれぞれ選んだフィールドに入れた完全なカードを、AnkiConnect経由で送れます。',
    'I already review on jpdb, Bunpro or WaniKani.': 'すでにjpdbやBunpro、WaniKaniで復習しています。',
    'Keep doing that. Connect the account in Settings and Yomu becomes their front end: your existing word statuses colour every page you read, and grading a word in Yomu records the review on your system, not beside it.': 'そのまま続けてください。設定でアカウントを連携すると、よむがそのフロントエンドになります。既存の単語ステータスが読むページすべてに色付けされ、よむでの採点はあなたのシステム側に記録されます。',
    'Languages': '対応言語',
    'Is it only for Japanese?': '日本語専用ですか？',
    'Japanese still has the deepest support for pitch accent, kanji and furigana. The dictionary catalogue now includes installable dictionaries for all 32 study languages. The interface itself speaks English and 日本語, with more coming.': 'ピッチアクセント、漢字、ふりがなは、引き続き日本語が最も充実しています。辞書カタログでは、32の学習言語すべてに対応する辞書をインストールできるようになりました。インターフェース自体は英語と日本語に対応し、今後さらに増えていきます。',
    'Your data': 'あなたのデータ',
    'Where do my words and progress live?': '単語や進捗はどこに保存されますか？',
    'In your browser, on your device. Connecting Anki, jpdb, Bunpro or WaniKani sends your grades to that service and nowhere else.': 'あなたのブラウザーの中、あなたの端末の上です。AnkiやjpdbやBunpro、WaniKaniを連携した場合、採点はそのサービスだけに送られます。',
    'What gets sent when I look things up?': '調べるとき、何が送信されますか？',
    'The word you pressed goes to the dictionary sources you have enabled — and any dictionary you install from the catalogue answers on your device. Pictures are read only when you ask: pressing a picture or running Scan images sends that picture to the recognition service you chose, and nothing is read just because it is on the page.': '押した単語が、有効にした辞書ソースに送られます。カタログからインストールした辞書は端末内で応答します。画像が読み取られるのは求めたときだけです。画像を押すか「画像をスキャン」を実行すると、その画像が選んだ認識サービスに送られます。ページにあるというだけで読み取られることはありません。',
    'The project': 'プロジェクトについて',
    'Something is broken. Where do I ask?': '不具合があります。どこで聞けばいいですか？',
    'for questions,': 'は質問に、',
    'GitHub issues': 'GitHubのissue',
    'for bugs. Both are read by the person who builds Yomu.': 'は不具合報告に。どちらも、よむを作っている本人が読んでいます。',
    'Can I use the dictionary mirror or the code in my own project?': '辞書ミラーやコードを自分のプロジェクトで使えますか？',
    'The code is open source on': 'コードは',
    '. The mirrored dictionaries keep their original licences and attributions — each entry shows its source and licence in Settings, so check the one you want to reuse.': 'でオープンソースとして公開しています。ミラーの辞書は元のライセンスと帰属表示を保っており、各辞書の出典とライセンスは設定に表示されるので、使いたいものを確認してください。',
    'Will Yomu stay free?': 'よむはずっと無料ですか？',
    'Yes. It is a tool its maker uses every day, and the core will stay free and open source. If it helps you, the best support is telling another learner about it.': 'はい。作者自身が毎日使う道具なので、核となる機能は無料でオープンソースのままです。役に立ったら、ほかの学習者に伝えてもらえるのがいちばんの応援です。',
    'Mobile': 'モバイル',
    'Get started': 'はじめる',
    'Free, on your computer and your phone.': '無料。パソコンでもスマートフォンでも。',
    'Phone and iPad': 'スマートフォンとiPad',
    // Store install routes 2026-07-27 (docs/index.md fold + install band,
    // docs/getting-started.md). The homepage carries all three routes at once
    // and promotes one, so every label here is rendered on the ja site whatever
    // the visitor's browser turns out to be.
    'Add よむ to Chrome': 'よむをChromeに追加',
    'Add よむ to Firefox': 'よむをFirefoxに追加',
    'Also available:': 'ほかの方法：',
    'Add よむ, open a Japanese page, press a word.': 'よむを追加して、日本語のページを開き、単語を押します。',
    'Userscript downloaded a file instead of installing?': 'ユーザースクリプトがインストールされずにファイルとして保存されましたか？',
    'Add Yomu to Chrome or Firefox in one click, then look up your first Japanese word. Free, no account needed, and it works on Safari, iPhone, and iPad too.': 'ワンクリックでYomuをChromeまたはFirefoxに追加して、最初の日本語の単語を調べましょう。無料でアカウントは不要、Safari、iPhone、iPadでも使えます。',
    'On Chrome and Firefox it is one click from the store. On Safari, iPhone and iPad it takes a couple of minutes. It is free either way, and you do not need an account.': 'ChromeとFirefoxならストアからワンクリックです。Safari、iPhone、iPadでは数分かかります。どちらも無料で、アカウントは必要ありません。',
    'Step 1: Add Yomu to your browser': 'ステップ1：Yomuをブラウザーに追加する',
    'Permalink to "Step 1: Add Yomu to your browser"': '「ステップ1：Yomuをブラウザーに追加する」への固定リンク',
    'Chrome, Edge, Brave, or Opera': 'Chrome、Edge、Brave、Opera',
    'Permalink to "Chrome, Edge, Brave, or Opera"': '「Chrome、Edge、Brave、Opera」への固定リンク',
    ', then choose': 'を開き、',
    'Add extension': '拡張機能を追加',
    'Add': '追加',
    '. That is the whole install.': 'を選びます。インストールはこれだけです。',
    '. That is the whole install, and it is the same on Firefox for Android.': 'を選びます。インストールはこれだけで、Android版Firefoxでも同じです。',
    'Safari, iPhone, and iPad': 'Safari、iPhone、iPad',
    'Permalink to "Safari, iPhone, and iPad"': '「Safari、iPhone、iPad」への固定リンク',
    'Safari has no store version yet, so Yomu arrives here as a': 'Safari向けのストア版はまだないため、ここではYomuは',
    '— one small file that runs inside a free app called a userscript manager.': 'として届きます。ユーザースクリプトマネージャーという無料のアプリの中で動く、小さなファイル1つです。',
    'In Safari, open': 'Safariで',
    'the Yomu userscript': 'Yomuのユーザースクリプト',
    '. You will see Yomu\'s source code — leave that tab open, because Userscripts reads it.': 'を開きます。Yomuのソースコードが表示されます。Userscriptsがそれを読むので、そのタブは開いたままにしてください。',
    'Until Userscripts is turned on and allowed, it will not appear in Safari and step 5 has nothing to work with. This is the most common reason an install seems to do nothing.': 'Userscriptsをオンにして許可するまでSafariのメニューには現れず、ステップ5で使うものがありません。インストールしても何も起きないように見える原因は、たいていこれです。',
    'It isn\'t turned on yet. Go back to step 3, turn Userscripts on, and allow it on All Websites. Then reload the page and open the menu again.': 'まだオンになっていません。ステップ3に戻ってUserscriptsをオンにし、すべてのWebサイトで許可してください。そのあとページを再読み込みして、もう一度メニューを開きます。',
    'Any other browser': 'そのほかのブラウザー',
    'Permalink to "Any other browser"': '「そのほかのブラウザー」への固定リンク',
    'Every other browser takes the userscript. See': 'そのほかのブラウザーではユーザースクリプトを使います。詳しくは下の',
    'Prefer the userscript?': 'ユーザースクリプトのほうがよいですか？',
    'below.': 'をご覧ください。',
    'Step 2: Look up your first word': 'ステップ2：最初の単語を調べる',
    'Permalink to "Step 2: Look up your first word"': '「ステップ2：最初の単語を調べる」への固定リンク',
    'Permalink to "Prefer the userscript?"': '「ユーザースクリプトのほうがよいですか？」への固定リンク',
    'The userscript is the same Yomu, installed through a userscript manager instead of a store. It runs in any browser that has a manager, and it updates itself from one link.': 'ユーザースクリプトは同じYomuを、ストアではなくユーザースクリプトマネージャー経由でインストールしたものです。マネージャーが使えるブラウザーならどれでも動き、1つのリンクから自動で更新されます。',
    'In your browser, open': 'ブラウザーで',
    '. Tampermonkey opens an install screen. Choose': 'を開きます。Tampermonkeyのインストール画面が開くので、',
    'On Chrome and Firefox the store version is the shortest path and keeps itself updated, so it is the default recommendation. The store listings are published at each feature release, so the userscript link is the one that carries every patch as it ships. On Safari, iPhone and iPad the userscript is the only option.': 'ChromeとFirefoxではストア版がいちばん近道で、更新も自動なので、まずはこちらをおすすめします。ストアへの公開は機能リリースごとなので、パッチを出るたびに受け取れるのはユーザースクリプトのリンクのほうです。Safari、iPhone、iPadではユーザースクリプトが唯一の方法です。',
    '— check that Yomu is allowed on that site in your browser\'s extensions menu, or in your userscript manager, then refresh.': '— ブラウザーの拡張機能メニュー、またはユーザースクリプトマネージャーで、そのサイトでYomuが許可されているか確認し、ページを再読み込みします。',
    // Release 1.8.18: figure alt text on docs/features.md.
    "A Yomu word panel open on a Japanese Wikipedia article, showing 日本 with its reading and pitch, a speaker to hear it, the meaning, other words that use it, and a row of buttons to say how well you knew it.": "日本語版ウィキペディアの記事の上に開いたよむの単語パネル。「日本」の読みとピッチ、音声を聞くスピーカー、語義、その語を使った他の単語、そしてどれくらい知っていたかを答えるボタンの列が表示されています。",
    "A Yomu kanji panel open on 日, showing what it means and a pad with its four strokes traced in order.": "「日」を開いたよむの漢字パネル。その意味と、4画を順になぞった練習マスが表示されています。",
    // Release 1.8.18 changelog bullets; pinned verbatim by tests/reader/i18n.test.ts.
    'Pages now load one deduplicated reader runtime instead of twelve overlapping companion scripts, cutting the JavaScript injected before Yomu starts by 40%.': 'ページは重複する12本のコンパニオンスクリプトではなく、重複を除いた1本のリーダーランタイムを読み込むようになり、よむの起動前に注入されるJavaScriptを40%削減しました。',
    'Release builds now measure the whole injected userscript payload and remove unreferenced hashed assets while retaining the current, recent, and browser-store versions.': 'リリースビルドは注入されるユーザースクリプトの総量を計測し、現在版、最近の版、ブラウザーストア版を残しながら、未参照のハッシュ付きアセットを削除するようになりました。',
    'Hosted builds now carry the verified retention set into shallow CI checkouts, so deployment cannot mistake unavailable history for permission to remove pinned files.': 'ホスト版のビルドは検証済みの保持対象一覧を浅いCIチェックアウトにも引き継ぐため、参照できない履歴を、固定されたファイルを削除してよいという意味に取り違えません。',
    'The 1.8.45 release stopped before publishing when its shallow checkout could not reconstruct the retained hash set. No release assets were published from that tag; 1.8.46 carries the same reader change with a committed retention snapshot.': '1.8.45のリリースは、浅いチェックアウトから保持対象のハッシュ一覧を再構築できず、公開前に停止しました。そのタグからリリース成果物は公開されていません。1.8.46では同じリーダー変更を、コミット済みの保持対象スナップショットとともに提供します。',
    "Dictionaries for Spanish, French, German, Russian, Korean and Vietnamese. Every row in the catalogue carried CJK headwords, so a learner of any other language opened Settings, scrolled the whole Sources panel, and found nothing they could install for what they actually read; the code was never the constraint, the supply was. Twenty-four Wiktionary-derived dictionaries now cover six languages across three scripts — bilingual terms with English definitions, the monolingual dictionary a reader graduates to, and IPA pronunciation for both — each on its own shelf, headed in the reader's own language, with a working Install button. These are served by the publishing project rather than mirrored by Yomu, so a row can now say so and link to the project's current build instead of claiming a fixed digest that its next rebuild would break; mirror-served rows keep the exact content-address check they have always had.": "スペイン語、フランス語、ドイツ語、ロシア語、韓国語、ベトナム語の辞書を追加しました。これまでカタログの項目は見出し語がすべてCJKだったため、それ以外の言語の学習者は設定を開いてソースパネルを最後までスクロールしても、実際に読むもののためにインストールできる辞書が一つも見つかりませんでした。制約はコードではなく供給側にありました。Wiktionary由来の24の辞書が、3つの文字体系にまたがる6言語をカバーします。英語の語義が付いた対訳辞書、読み手がやがて移行する単一言語辞書、そしてその両方に対応するIPA発音辞書です。それぞれが専用の棚に並び、見出しは読み手自身の言語で表示され、インストールボタンから導入できます。これらはYomuがミラーするのではなく配布元プロジェクトが配信するため、項目にその旨を記載し、固定のダイジェストを主張する代わりにプロジェクトの最新ビルドへリンクできるようになりました。固定値では次のリビルドで壊れてしまうためです。ミラー配信の項目は、従来どおり厳密なコンテンツアドレス検証を維持します。",
    "A short Yomu Gaming clip, rendered from code rather than screen-recorded. The loop it shows is the real one — one keypress, the overlay reads the frame, a word is looked up, the card opens with its pitch accent and senses, and the word is kept with its sentence, audio and screenshot — and it is drawn with the product's own palette, review-state colours and pitch-graph geometry, so nothing in it advertises a Yomu that does not exist. Retiming a beat is now a number rather than a re-shoot, and the next feature clip reuses the project. It lives in its own folder in the repository, is self-contained, and is outside the release gate.": "Yomu Gamingの短い紹介クリップを追加しました。画面録画ではなく、コードから描画しています。映しているのは実際の流れそのものです。キーを1回押すとオーバーレイがその画面を読み取り、単語を検索し、ピッチアクセントと語義を備えたカードが開き、例文・音声・スクリーンショットとともにその語を保存します。配色、復習状態の色、ピッチグラフの形状は製品自身のものを使っているため、存在しないYomuを宣伝している箇所はありません。テンポの調整は撮り直しではなく数値の変更で済み、次の紹介クリップも同じプロジェクトを再利用できます。リポジトリ内の専用フォルダーに独立して置かれ、リリースゲートの対象外です。",
    "The documentation is rewritten around what a reader gets rather than what the machinery does, and every page now says what Yomu is on its first line. Seventeen of the thirty-eight pages the site published were internal working notes — release runbooks, incident write-ups, QA probes, dated backlog dumps, reviewer notes. Nothing linked to them, but they were built, indexed by the site search, listed in the sitemap, and submitted to search engines. They are now excluded outright, the sitemap is kept to routes the site's own navigation reaches, and a page that lands somewhere the exclusions miss is named in a build warning instead of shipping quietly. The source files stay in the repository. Two how-tos also lose an operator runbook and a set of release notes that were never written for the person reading them, and the mobile-Anki limits that moved out of the settings dialog are now stated plainly where they landed: handoff is one-way, and it cannot read your existing decks, update an old card, or hand you a review queue.": "ドキュメントを、仕組みの説明ではなく読み手が得られるものを中心に書き直し、各ページの1行目でYomuが何であるかを述べるようにしました。サイトが公開していた38ページのうち17ページは社内の作業メモでした。リリース手順書、障害の記録、QAの調査、日付入りのバックログ、審査向けメモです。どこからもリンクされていませんでしたが、ビルドされ、サイト内検索に索引され、サイトマップに載り、検索エンジンにも送信されていました。これらは公開対象から完全に除外され、サイトマップはサイト自身のナビゲーションから辿れるページだけに限定されます。除外の網から漏れた場所にページが置かれた場合は、黙って公開される代わりにビルド時の警告として名前が出ます。元のファイルはリポジトリに残ります。2つの手順ページからは、読み手のために書かれたものではなかった運用手順書とリリースノートを削除しました。また、設定ダイアログから移動したスマートフォン版Ankiの制限を、移動先で明確に記載しています。受け渡しは一方向で、既存のデッキを読むことも、古いカードを更新することも、復習キューを渡すこともできません。",
    "Words are now looked up in the language you are reading. The dictionary engine serves a format carrying dozens of languages but opened every lookup by testing characters against the kana and kanji ranges, so a page of Spanish produced no candidates and every dictionary a Spanish reader could install was unreachable however cleanly it had imported; conjugated forms were expanded by Japanese godan and i-adjective rules and matched against Japanese tags. Detection, word boundaries and morphology now all come from the language you are studying. A language that writes its word boundaries has those segments looked up and nothing else, so \"ella\" is no longer offered on the last four letters of \"botella\". Japanese is unchanged: it declares that its boundaries are inferred, so it keeps the exhaustive sweep and lets the dictionary arbitrate.": "読んでいる言語で単語を検索するようになりました。辞書エンジンは数十の言語を運べる形式を扱うのに、検索のたびにまず文字がかなと漢字の範囲に入るかを判定していました。そのためスペイン語のページでは候補が一つも出ず、スペイン語の読み手がインストールできる辞書は、どれだけ正常に取り込まれていても届きませんでした。活用形の処理も日本語仕様で、五段活用とイ形容詞の規則で展開し、日本語のタグと照合していました。判定、語の区切り、語形変化は、すべて学習中の言語に従うようになりました。語の区切りを表記する言語ではその区切りだけが検索されるため、「botella」の末尾4文字に「ella」が示されることはなくなります。日本語は変わりません。区切りが表記されず推定されるものだと宣言しているため、従来どおり網羅的に走査し、辞書に判断させます。",
    "Text is now split into words for languages that do not write spaces. A language with no segmenter of its own fell back to splitting on spaces, which returned each Thai, Lao, Khmer or Burmese sentence as a single token the length of the sentence, with nothing in it that could be looked up. Every browser already ships dictionary word boundaries for all four, and those are now the default. Space-separated languages get the same words back with punctuation stripped, so \"paella,\" stops being a term no dictionary carries. Japanese supplies its own segmenter and is untouched. Korean still comes back as eojeol rather than morphemes, Vietnamese loses compounds to their syllables, and Cantonese loses them a character at a time; each of those is pinned by a test, so closing one is a visible change rather than a silent one.": "空白で語を区切らない言語でも、文が単語に分割されるようになりました。独自の分割器を持たない言語は空白で区切る処理に戻っていたため、タイ語、ラオ語、クメール語、ビルマ語では1文がそのまま文の長さの1トークンとして返り、その中のどれも検索できませんでした。この4言語の辞書ベースの語境界はどのブラウザーにも標準で入っており、それを既定で使います。空白区切りの言語では同じ語が句読点を取り除いた形で返るため、「paella,」のようなどの辞書にも載っていない語ができなくなります。日本語は独自の分割器を使うため変更ありません。韓国語は形態素ではなく文節単位のまま、ベトナム語は複合語が音節に分かれ、広東語は1文字ずつに分かれます。それぞれテストで固定しているため、解消するときは黙って変わるのではなく目に見える変更になります。",
    "A page that swaps out its animation scheduler no longer freezes projected readings for good. The overlay's refresh pump coalesced on \"a frame is already pending\", and only the frame callback itself could clear that latch — so a frame armed against a scheduler that then went away, which is what happens when a host swaps out a realm, a script manager hands the page from its sandbox to the page world, or a site replaces the browser's animation-frame scheduler, could never run. The latch stayed set, every later refresh was dropped for the rest of the page's life, and readings simply stopped following the words they belong to. The pump now remembers which scheduler owes it the callback, so a request routed through a different one arms its own frame instead of being swallowed.": "アニメーションのスケジューラーを差し替えるページで、投影された読みが以後まったく更新されなくなる問題を修正しました。オーバーレイの更新処理は「フレームは予約済みか」という一つの状態でまとめており、その状態を解除できるのはフレームのコールバック自身だけでした。そのため、予約した後に消えてしまったスケジューラーに対するフレームは決して実行されません。ホストが実行環境を差し替えたとき、スクリプトマネージャーがページをサンドボックスからページ側へ引き渡したとき、サイトがブラウザーのアニメーションフレームのスケジューラーを置き換えたときに起こります。状態は立ったままになり、以降の更新はそのページが開かれている間ずっと破棄され、読みは対応する語を追わなくなっていました。更新処理は、どのスケジューラーがコールバックを返す義務を負っているかを記憶するようになり、別のスケジューラー経由の要求は飲み込まれずに自身のフレームを予約します。",
    "The Japanese site no longer shows English where the prose improved most. The rewrite replaced the English the Japanese map was keyed to without writing the replacements, and a missing key leaves the English text alone, so the features page fell from 88 translated segments to 9 and the guides index from 17 to 6 — visible English holes on pages in the top navigation. Japanese is written for every uncovered segment, and all six Japanese-rendered pages are now checked against the built page rather than the markdown. A key that merely existed was never enough either: an entry translating \"Offline cache\" to \"Offline cache\" satisfied every guard while showing English to a Japanese reader, so values must now carry Japanese unless the key is a brand name, a URL, a verbatim interface label, or a word the Japanese sentence folds into its neighbour.": "日本語サイトで、文章が最も良くなったページに英語が残る状態を解消しました。書き直しの際、日本語マップが対応付けていた英語が置き換えられたのに、置き換え後の日本語が用意されていませんでした。キーがない場合は英語のテキストがそのまま残るため、機能ページは翻訳済みの区切りが88から9へ、ガイド目次は17から6へ減り、上部ナビゲーションにあるページに英語の穴が見える状態になっていました。日本語がなかったすべての区切りに日本語を書き、日本語で表示される6ページすべてを、Markdownではなく実際に組み上がったページに対して検証します。キーが存在するだけでも不十分でした。「Offline cache」を「Offline cache」と訳す項目は、日本語の読み手に英語を見せながらすべての検査を通過していたためです。今後、値は日本語を含む必要があり、例外はブランド名、URL、日本語の画面でもそのまま表示されるラベル、そして日本語の文が隣の区切りに含めてしまう語だけです。",
    "Every screenshot now shows what its caption says. Four pictures contradicted the words beside them, and each is fixed by capturing the state the caption describes rather than by softening the caption: the lookup shot was scrolled past the headword, so the one thing a lookup screenshot exists to show was out of frame; the kanji shot showed an empty practice grid under a caption about stroke data, because the panel opens with the trace off so you draw from memory first; the dictionaries shot said \"No dictionaries imported yet\" on two pages whose subject is dictionaries; and a settings dialog was captioned as a popup. The capture harness could not have produced a publishable shot in the first place — it injected only the main script and none of the companions that supply the interface copy, so the popup rendered raw text keys, and it picked a word by coordinate on a page that reflows as it is annotated, so it often clicked a link and navigated away mid-capture. Each shot now fails rather than saves when it does not show what it claims.": "すべてのスクリーンショットが、説明文どおりのものを写すようになりました。4枚が隣の文章と食い違っており、いずれも説明文を弱めるのではなく、説明文が述べている状態を撮り直して直しています。検索の画像は見出し語より下までスクロールされており、検索の画像が見せるべき唯一のもの、つまり引かれている語が枠の外にありました。漢字の画像は、書き順データについての説明文の下に空の練習マスを写していました。この画面は、まず記憶から書けるようになぞりを消した状態で開くためです。辞書の画像は、辞書について書かれた2つのページで「まだ辞書がインポートされていません」と表示していました。設定ダイアログをポップアップとして説明していたものもありました。そもそも撮影の仕組みが公開できる画像を作れない状態でした。本体スクリプトだけを読み込み、画面の文言を供給するコンパニオンを読み込んでいなかったためポップアップには生の文字列キーが表示され、注釈付けで配置が変わり続けるページ上で座標から語を選んでいたため、リンクを押して撮影の途中でページを離れてしまうことが頻繁にありました。各画像は、主張どおりのものが写っていなければ保存せずに失敗します。",
    "Yomu Gaming now keeps recognized text on the part of the captured picture it came from when the native overlay window changes bounds while OCR is running. Windows could move the picture down by 24 pixels between capture and paint, and the result stored that transient viewport position, so an otherwise correctly sized line appeared one line above its source. OCR geometry is now stored as fractions of the frozen capture and projected through the frame that is actually visible; area selections use only their intersection with the picture, so dragging through or wholly inside a letterbox bar cannot read an unrelated edge strip.": "Yomu GamingでOCRの実行中にネイティブのオーバーレイウィンドウの大きさが変わっても、認識した文字が元のキャプチャ画像上の位置に留まるようになりました。Windowsでは、キャプチャしてから描画するまでの間に画像が24ピクセル下へ移動することがあり、その一時的なビューポート位置を結果に保存していたため、文字の大きさは正しくても元の行より一行上に表示されていました。OCRの位置情報をフリーズしたキャプチャに対する割合として保存し、実際に表示されているフレームへ投影するようにしました。範囲選択は画像と重なる部分だけを使うため、レターボックスの余白をまたいだり余白内だけをドラッグしたりしても、画像端の無関係な部分を読み取ることはありません。",
    "Release packaging now uses the same eight smaller regular-test shards and a genuinely bounded worker. The release runner had folded those tests into four shards twice the size, kept a release-only 1.5 GB heap cap, and asked Vitest for one worker through an option that its explicit fork-pool setting overrode — so the four-core runner still launched four heap-heavy jsdom forks. After splitting the shards, the third group still spent minutes in garbage collection and died without an assertion or summary, while the identical CI shard passed in 41 seconds at its normal 2.3 GB cap. The shared test configuration now puts its default on the CLI-overridable worker setting, Release pins that setting to one, and the single fork gets the proven heap budget, preserving the same isolation and coverage without oversubscribing the runner.": "リリースのパッケージ作成でも、CIと同じ8つの小さな通常テストシャードを使い、ワーカー数を実際に制限するようになりました。これまではリリース用ランナーだけがテストを2倍の大きさの4シャードにまとめ、リリース専用の1.5 GBヒープ上限を残したうえで、Vitestの明示的なフォークプール設定に上書きされる別のオプションからワーカーを1つに指定していました。そのため4コアのランナーでは、ヒープを多く使うjsdomフォークが実際には4つ起動していました。シャードを分割した後も3番目のグループは数分間ガベージコレクションに費やした末、アサーションも結果の要約も出さずに終了しましたが、同じCIシャードは通常の2.3 GB上限で41秒で通過しています。共有テスト設定の既定値をコマンドラインから上書きできるワーカー設定へ移し、リリースではその設定を1に固定し、単一のフォークに実証済みのヒープ容量を与えることで、ランナーを過負荷にせず同じ分離と網羅性を保ちます。",
    "The subtitle font-size slider is now literal: choosing 60px keeps every cue at 60px through long lines, furigana arriving, player zoom and crop changes, fullscreen, narrow portrait video, and leaving and returning to the tab. The saved setting was already still 60px, but a second content-fitting pass silently rewrote the rendered line as low as 14px on each of those transitions, while touch layouts imposed another viewport-width cap. Long lines now wrap and grow upward at the chosen size instead of becoming tiny.": "字幕のフォントサイズスライダーが、表示どおりのピクセル指定になりました。60pxを選ぶと、長い行、ふりがなの追加、プレーヤーのズームや切り抜きの変更、全画面、縦長の狭い動画、タブを離れて戻った後も、すべての字幕が60pxのままです。保存された設定は以前から60pxのままでしたが、別の内容合わせ処理がこれらの切り替わりごとに描画サイズだけを最小14pxまで黙って書き換え、タッチ画面ではさらにビューポート幅による上限が掛かっていました。長い行は小さくならず、選んだ大きさのまま折り返して上方向へ広がります。",
    "The floating reader button and subtitle controls now appear without waiting for optional local-dictionary styling to finish opening its browser database. A delayed storage startup could previously leave no visible sign that Yomu had run until minutes later. If initialization does fail, the abandoned runtime now releases all of its ownership state so a userscript reinjection can retry in the same tab instead of being mistaken for a duplicate.": "浮動リーダーボタンと字幕の操作部が、任意のローカル辞書スタイルがブラウザーのデータベースを開き終えるのを待たずに表示されるようになりました。これまではストレージの起動が遅れると、数分後までYomuが実行されたことを示すものが何も現れない場合がありました。初期化に失敗した場合も、放棄された実行環境が所有状態をすべて解放するため、同じタブへユーザースクリプトを再注入した際に重複と誤認されず再試行できます。",
    "Yomu Gaming now keeps recognized Japanese text aligned across the full source line on Linux systems without a full-width CJK font. The fallback glyphs could advance at about 60% of their expected width, leaving an otherwise correctly sized line floating over only the middle of the dialogue. The gaming overlay now distributes that missing inline width without increasing the source-derived font height, and leaves normal Japanese fonts unchanged.": "Yomu Gaming は、全角 CJK フォントがない Linux 環境でも、認識した日本語を元の行全体に合わせて表示するようになりました。代替フォントの字送りが想定幅の約60%になる場合があり、文字の高さは正しくても台詞の中央部分にしか重ならないことがありました。ゲーム用オーバーレイは、元画像から求めた文字の高さを増やさずに不足する横幅を分配し、通常の日本語フォントには変更を加えません。",
    "One Escape in Yomu Gaming now dismisses an open word card without also hiding the entire capture overlay. The reader removed the card during the event before the overlay's later handler checked for it, so that same key press looked like a second Escape and closed both layers; the overlay now makes that decision before the reader handles the key.": "Yomu Gaming で語句カードを開いているとき、Escape を一度押すとキャプチャのオーバーレイまで一緒に消える問題を修正しました。リーダーがキーイベントの途中でカードを先に取り除き、その後にオーバーレイ側が確認した時には同じ押下が二度目の Escape に見えて、両方を閉じていました。今はリーダーがキーを処理する前にオーバーレイ側が判断します。",
    "The PDF reader no longer annotates invisible embedded OCR text while it is deciding whether a page is a scan. Pending PDF.js text layers stay hidden until they are classified as genuine selectable text, preventing an occasional second dense word layer from appearing over a scanned page when the browser is busy.": "PDF リーダーがページをスキャン画像かどうか判定している途中で、埋め込まれた不可視の OCR 文字に注釈を付けることがなくなりました。PDF.js の判定待ちテキストレイヤーは、本物の選択可能な文字だと確認されるまで非表示に保たれるため、ブラウザーが忙しいときにスキャンページ上へ密な語句レイヤーがもう一枚現れることを防ぎます。",
    // Docs rewrite 2026-07-27: home page and install page copy. Keys are the
    // exact rendered English text node; see tests/reader/i18n.test.ts.
    'instead. Mobile Anki handoff is one-way: it starts a new card and stops there. It cannot scan existing decks, tell you what is already in them, update an old card, or give you review queues. Those need Anki on a computer.': 'に渡せます。スマートフォンのAnkiへの受け渡しは一方向です。新しいカードを作るところまでで止まります。既存のデッキの読み取り、その中身の確認、古いカードの更新、復習キューの取得はできません。これらにはパソコンのAnkiが必要です。',
    // Docs rewrite 2026-07-27: home page and install page copy. Keys are the
    // exact rendered English text node; see tests/reader/i18n.test.ts.
    'Once you have opened Study, it works offline. Cards you have already loaded stay available, and the ratings you give them are held and sent on when you reconnect. Bunpro is the one exception: it needs a live session, so Bunpro reviews wait until you are back online.': '一度学習ページを開けば、オフラインでも使えます。読み込み済みのカードはそのまま使え、付けた評価は保持され、再接続時に送信されます。例外はBunproだけです。接続中のセッションが必要なため、Bunproの復習はオンラインに戻るまで待ちます。',
    'Open Settings → Study to pick which source you are reviewing from, and to swap the five rating buttons for a thumb-friendly Fail / Pass pair. Bunpro keeps its own buttons, because that is what Bunpro accepts.': '設定 → 学習で、どこから復習するかを選べます。5つの評価ボタンを、親指で押しやすい「不合格 / 合格」の2つに切り替えることもできます。BunproはBunproが受け付ける形式に合わせ、独自のボタンのままです。',
    'Yomu userscript': 'よむのユーザースクリプト',
    'install guide': 'インストール手順',
    ', or Anki, then bookmark the page or add it to your Home Screen.': '、Ankiをつなぎ、ページをブックマークするかホーム画面に追加します。',
    // Docs rewrite 2026-07-27: home page and install page copy. Keys are the
    // exact rendered English text node; see tests/reader/i18n.test.ts.
    'Get help with Yomu — ask on Discord, report a bug, or open the tools. Yomu turns any page, video, manga or game screen into a Japanese lesson.': 'よむのサポート — Discordで質問する、不具合を報告する、ツールを開く。よむは、ページも動画もマンガもゲーム画面も、日本語のレッスンに変えます。',
    'Get help': '助けを求める',
    'Open the tools': 'ツールを開く',
    'Chip in': '支援する',
    'Review the words you saved.': '保存した語を復習します。',
    'Open your own video and subtitle files, then read along.': '手持ちの動画と字幕ファイルを開いて、読みながら観られます。',
    'Open a Japanese PDF and press the words in it.': '日本語のPDFを開いて、その中の語を押せます。',
    'Ask on Discord': 'Discordで質問する',
    'Take any one of them': 'どれか一つから始める',
    'Pick what you want to read. It works the same way everywhere: press a word, get the answer, keep it if it is worth keeping.': '読みたいものを選んでください。どこでも同じです。単語を押して答えを見て、覚える価値があれば残します。',
    'You do not have to set all of this up. Install Yomu, start reading web pages, and add the rest when you meet something Yomu cannot read yet.': 'すべてを設定する必要はありません。よむを入れてWebページから読み始め、よむがまだ読めないものに出会ったら、そのとき足していけば十分です。',
    'Kanji works everywhere: press a character inside any lookup to see its stroke order and readings.': '漢字はどこでも同じです。検索結果の中の文字を押せば、書き順と読みが見られます。',
    'That is the whole requirement. Jiten, JPDB, Anki, and your own Yomitan dictionaries all connect if you want them, and none of them are needed to start.': '必要なのはこれだけです。Jiten、JPDB、Anki、手持ちのYomitan辞書は、望めばつなげられますが、始めるのにどれも必要ありません。',
    'New here? Follow the install guide.': '初めての方は、インストール手順に沿って進めてください。',
    'Web pages': 'Webページ',
    'Press any word for its reading, meaning, and sound.': 'どの語を押しても、読み・意味・発音が出ます。',
    'Manga and images': 'マンガと画像',
    'Read the Japanese inside panels and screenshots.': 'コマやスクリーンショットの中の日本語を読めます。',
    'Press words in the subtitles, on YouTube or your own files.': 'YouTubeでも手持ちのファイルでも、字幕の語を押せます。',
    'Read the Japanese on screen with the Yomu Gaming app.': 'Yomu Gamingアプリで、画面上の日本語を読めます。',
    'Open a Japanese textbook or article and press the words in it.': '日本語の教科書や記事を開いて、その中の語を押せます。',
    'Review': '復習',
    'Study the words you saved, one card at a time.': '保存した語を、1枚ずつ復習します。',
    'Install Yomu (free)': 'よむをインストール（無料）',
    'Install guide': 'インストール手順',
    // Docs rewrite 2026-07-27: home page and install page copy. Keys are the
    // exact rendered English text node; see tests/reader/i18n.test.ts.
    'Install Yomu': 'よむをインストール',
    'Two minutes on a computer, iPhone, or iPad. Start here.': 'パソコンでもiPhone/iPadでも2分。ここから始めましょう。',
    'Study your words': '覚えた語を復習する',
    'Review the words you saved. Works offline once it has loaded.': '保存した語を復習できます。一度読み込めばオフラインでも使えます。',
    'Take the course': 'コースで学ぶ',
    'A guided path through Japanese, using the words you already collected.': '集めた語をそのまま使いながら、日本語を順序立てて学べます。',
    'Watch your own videos': '手持ちの動画を観る',
    'Drop in a video and a subtitle file, then read along.': '動画と字幕ファイルを読み込めば、そのまま読みながら観られます。',
    'Read a PDF': 'PDFを読む',
    'Open a Japanese textbook or article and press words in it.': '日本語の教科書や記事を開いて、その中の語を押せます。',
    'Read manga': 'マンガを読む',
    'Look up words inside panels and screenshots.': 'コマやスクリーンショットの中の語を調べられます。',
    'Play in Japanese': '日本語でゲームを遊ぶ',
    'Read the text in PC games with the Yomu Gaming app.': 'Yomu Gamingアプリで、PCゲームの文章を読めます。',
    'よむ - turn anything you read into a Japanese lesson': 'よむ - 読むものすべてを日本語のレッスンに',
    'Yomu turns any page, video, manga or game screen into a Japanese lesson — lookups, readings, and cards you keep. Free, runs in your browser, no account needed.': 'よむは、ページも動画もマンガもゲーム画面も、日本語のレッスンに変えます。意味を調べ、読みを表示し、覚えたい語はカードとして残せます。無料、ブラウザで動作、アカウントは不要です。',
    'Turn anything you read into a Japanese lesson': '読むものすべてを日本語のレッスンに',
    'Yomu turns any page, video, manga or game screen into a Japanese lesson — lookups, readings, and cards you keep.': 'よむは、ページも動画もマンガもゲーム画面も、日本語のレッスンに変えます。意味を調べ、読みを表示し、覚えたい語はカードとして残せます。',
    'Free, runs in your browser, and ready in about two minutes.': '無料、ブラウザで動作、準備は2分ほどです。',
    'Three steps, about two minutes': '3ステップ、約2分',
    'Install Yomu in three steps and look up your first Japanese word. Free, about two minutes, and no account needed. Works on Chrome, Edge, Firefox, iPhone, and iPad.': '3ステップでよむをインストールし、最初の日本語の語を調べてみましょう。無料、約2分、アカウントは不要です。Chrome、Edge、Firefox、iPhone、iPadで使えます。',
    'Permalink to "Install Yomu"': '「よむをインストール」への固定リンク',
    'Getting it takes about two minutes and three steps: add a small browser add-on, install Yomu into it, then open a Japanese page and press a word. It is free and you do not need an account.': '所要時間は約2分、手順は3つです。ブラウザに小さな拡張を入れ、そこによむをインストールし、日本語のページで単語を押します。無料で、アカウントも要りません。',
    'Step 1: Add a userscript manager': 'ステップ1：ユーザースクリプト管理拡張を入れる',
    'Permalink to "Step 1: Add a userscript manager"': '「ステップ1：ユーザースクリプト管理拡張を入れる」への固定リンク',
    'Yomu runs inside a free add-on called a userscript manager. You install that once and forget it.': 'よむは、ユーザースクリプト管理拡張という無料の拡張の中で動きます。最初に一度入れれば、あとは意識せずに済みます。',
    'Chrome, Edge, or Firefox': 'Chrome、Edge、Firefox',
    'Permalink to "Chrome, Edge, or Firefox"': '「Chrome、Edge、Firefox」への固定リンク',
    'and install Tampermonkey for your browser.': 'を開き、お使いのブラウザ用のTampermonkeyをインストールします。',
    'Pin the Tampermonkey icon so you can see it.': 'Tampermonkeyのアイコンをピン留めして、見える状態にします。',
    'On Chrome and Edge you may be asked to': 'ChromeとEdgeでは、',
    '. Say yes — Yomu needs it to run.': 'を求められることがあります。許可してください。よむの動作に必要です。',
    ', a free app.': 'という無料アプリを使います。',
    'and open it once. A mostly empty screen is normal.': 'をインストールし、一度開きます。ほぼ空の画面が出れば正常です。',
    '. On older iOS this is': 'を開きます。古いiOSでは',
    'Until Userscripts is turned on and allowed, it will not appear in Safari and the next step has nothing to work with. This is the most common reason an install seems to do nothing.': 'Userscriptsをオンにして許可するまでは、Safariに表示されず、次の手順も進められません。インストールしても何も起きないように見える原因の多くはこれです。',
    'Step 2: Install Yomu': 'ステップ2：よむをインストールする',
    'Permalink to "Step 2: Install Yomu"': '「ステップ2：よむをインストールする」への固定リンク',
    'Press the link. Tampermonkey opens an install screen. Choose': 'リンクを押すと、Tampermonkeyがインストール画面を開きます。',
    ', and you are done. The same link updates Yomu later.': 'を選べば完了です。更新も同じリンクから行えます。',
    'Got a downloaded': 'インストール画面ではなく',
    'file instead of an install screen?': 'ファイルがダウンロードされた場合',
    "Some managers do not catch the link. Open your manager's dashboard and use its": 'リンクを受け取らない管理拡張もあります。管理拡張のダッシュボードを開き、',
    'option with': 'を次のURLで使ってください：',
    'https://yomureader.com/yomu.user.js': 'https://yomureader.com/yomu.user.js',
    '. In Tampermonkey that is': '。Tampermonkeyでは',
    'Utilities → Install from URL': 'Utilities → Install from URL',
    '; in Violentmonkey,': '、Violentmonkeyでは',
    '+ → Install from URL': '+ → Install from URL',
    '; in ScriptCat,': '、ScriptCatでは',
    'Script list → Create → Install from URL': 'Script list → Create → Install from URL',
    'Chrome or Edge says user scripts cannot be added from this website?': 'ChromeやEdgeが「このウェブサイトからはユーザースクリプトを追加できません」と表示する場合',
    'That message is from the browser, and a different download link will not get around it. Open': 'このメッセージはブラウザ側のもので、別のダウンロードリンクでは回避できません。',
    ", open Tampermonkey's details, and turn on": 'を開き、Tampermonkeyの詳細から',
    '. On older browsers, turn on': 'をオンにします。古いブラウザでは、代わりに拡張機能ページ上部の',
    'at the top of the extensions page instead. Then open the install link again.': 'をオンにしてください。そのうえでインストールリンクをもう一度開きます。',
    "Open the install link in Safari. You will see Yomu's source code. Leave that tab open — Userscripts reads it.": 'Safariでインストールリンクを開きます。よむのソースコードが表示されます。そのタブは開いたままにしてください。Userscriptsがそこから読み取ります。',
    "Open Safari's page menu from the address bar. On iPhone choose": 'アドレスバーからSafariのページメニューを開きます。iPhoneでは',
    '; on iPad choose the puzzle-piece icon. Then choose': '、iPadではパズルピースのアイコンを選び、続いて',
    'Userscripts says': 'Userscriptsが',
    'Choose it, then choose': 'と表示します。それを選び、続いて',
    "\"Userscripts\" isn't in that menu?": 'メニューに「Userscripts」が出てこない場合',
    "It isn't turned on yet. Go back to Step 1, turn Userscripts on, and allow it on All Websites. Then reload the page and open the menu again.": 'まだオンになっていません。ステップ1に戻ってUserscriptsをオンにし、すべてのWebサイトで許可してください。そのうえでページを再読み込みし、メニューを開き直します。',
    'when a small floating Yomu button appears in the corner of Japanese pages, and Yomu greets you the first time.': '日本語のページの隅に小さなよむのボタンが現れ、初回はよむが挨拶を表示します。',
    'Step 3: Look up your first word': 'ステップ3：最初の語を調べる',
    'Permalink to "Step 3: Look up your first word"': '「ステップ3：最初の語を調べる」への固定リンク',
    'The first time Yomu runs it asks a few quick questions: what language you want definitions in, and a colour theme. Everything else is already set sensibly — scroll past it.': 'よむを初めて起動すると、いくつか短い質問が出ます。語義を表示する言語と、配色テーマです。それ以外は適切な初期値が入っているので、読み飛ばして構いません。',
    'At the end you get two buttons. Choose': '最後に2つのボタンが出ます。',
    '. That is the one that starts you reading right away.': 'を選んでください。すぐ読み始められるのはこちらです。',
    'Yomu then installs a starter dictionary for your language so lookups work with no connection. You can add more dictionaries later.': '続いて、よむがあなたの言語向けの入門辞書をインストールします。これで通信がなくても語を調べられます。辞書は後から追加できます。',
    'Now try it:': 'さっそく試してみましょう。',
    'is a gentle first stop — or use the line below, right here.': 'は最初の一歩に向いています。下の一文をこのページで試しても構いません。',
    'Press a word.': '単語を押します。',
    'On a phone or tablet, touch it. On a computer, click or hover.': 'スマートフォンやタブレットでは触れるだけ、パソコンではクリックまたはカーソルを重ねます。',
    'The panel opens with the reading, the meaning, and a speaker button. Press a kanji to see its stroke order. Press save to keep the word.': '読み、意味、スピーカーのボタンが並んだパネルが開きます。漢字を押せば書き順が見られ、保存を押せばその語を残せます。',
    'Try me — press a word': '試してみる — 単語を押してください',
    'That is the whole loop. Everything below is optional.': 'これで一通りです。ここから先はすべて任意です。',
    'What to read next': '次に何を読むか',
    'Permalink to "What to read next"': '「次に何を読むか」への固定リンク',
    'Good Yomu reading has selectable Japanese text, or pictures and subtitles Yomu can read for you. The aim is not to finish the hardest thing you can find. It is to read a little every day, where most of it makes sense and the new words are worth keeping.': 'よむと相性がよいのは、日本語の文字を選択できるページか、よむが読み取れる画像や字幕です。目標はいちばん難しいものを読み切ることではありません。ほとんど意味が取れて、知らない語が覚える価値のある文章を、毎日少しずつ読むことです。',
    'These are reliable places to start, easiest first:': '始めやすい順に、確実な入り口を挙げます。',
    'Free graded readers from the very beginning. The best first stop when real sites still feel too dense.': 'ゼロから読める無料の多読用テキスト。実際のサイトがまだ重く感じるときの最初の一歩に最適です。',
    'Short, simplified news with readings and audio. A good daily habit once basic grammar clicks.': '読みと音声つきの、短くやさしいニュース。基礎文法がつかめたら日課にどうぞ。',
    'Polished learner stories with notes and audio. Yomu adds your usual lookup and saving on top.': '注釈と音声つきの、丁寧に作られた学習者向け読み物。よむがいつもの検索と保存を上に重ねます。',
    'Short articles sorted by rough JLPT level. A useful bridge to real articles.': 'おおよそのJLPTレベル別に並んだ短い記事。実際の記事への橋渡しになります。',
    'A big collection of folk tales. The repetition makes common words stick.': '民話の大きなコレクション。繰り返しが多く、よく使う語が定着します。',
    'Read Japanese ebooks in the browser with Yomu lookup. The clean route into novels.': 'ブラウザで日本語の電子書籍を、よむの検索つきで読めます。小説に入るならここから。',
    'Find books and manga graded by difficulty, so your next read is a challenge and not a wall.': '難易度別に並んだ本とマンガを探せます。次の一冊が、壁ではなく手応えになります。',
    'Japanese web novels with selectable text. Search for a genre you already love.': '文字を選択できる日本語のWeb小説。好きなジャンルで探してみてください。',
    'Turn on subtitle lookup and read along while you listen.': '字幕の検索をオンにすれば、聴きながら読めます。',
    'Or pick a workflow from the': 'あるいは、',
    '— manga, video, and YouTube each have one.': 'から進め方を選んでください。マンガ、動画、YouTubeそれぞれにあります。',
    'Turn on more when you want it': '必要になったら追加する',
    'Permalink to "Turn on more when you want it"': '「必要になったら追加する」への固定リンク',
    "Open Yomu's settings from the floating Yomu button. Everything here is off or optional until you ask for it.": '浮いているよむのボタンから設定を開けます。ここにあるものは、あなたが求めるまではオフか任意のままです。',
    'What Yomu does': 'よむにできること',
    'covers each one.': 'で、それぞれを説明しています。',
    'Reading manga and images': 'マンガと画像を読む',
    '— press a manga panel or screenshot and Yomu reads the Japanese in it. Settings → Images.': '— マンガのコマやスクリーンショットを押すと、よむがその中の日本語を読み取ります。設定 → 画像。',
    '— make subtitle lines pressable and open a transcript beside the video. For your own files, use the': '— 字幕の語を押せるようにし、動画の横に書き起こしを表示します。手持ちのファイルには',
    'when the Japanese is in a textbook or article file.': 'を開いてください。日本語が教科書や記事のファイルにある場合に使います。',
    '— install': '— ',
    'and set a capture shortcut.': 'をインストールし、キャプチャのショートカットを設定します。',
    'More dictionaries': '辞書を増やす',
    '— install more for your language, or add any Yomitan dictionary file. Settings → Dictionaries.': '— あなたの言語向けの辞書を追加するか、Yomitan形式の辞書ファイルを読み込めます。設定 → 辞書。',
    '— turn saved words into flashcards carrying the word, reading, meaning, your sentence, and the sound. See the': '— 保存した語を、単語・読み・意味・出会った文・音声を備えたカードにします。',
    'for daily review of everything you saved.': 'を開けば、保存したすべてを毎日復習できます。',
    'Connect a study app (optional)': '学習サービスをつなぐ（任意）',
    'Permalink to "Connect a study app (optional)"': '「学習サービスをつなぐ（任意）」への固定リンク',
    'If you already review Japanese in': 'すでに',
    ', or WaniKani, Yomu can save words there and show you what each one already knows about a word.': 'やWaniKaniで日本語を復習しているなら、よむはそこに語を保存し、各サービスがその語について持っている情報を表示できます。',
    "Open that service's settings and copy your API key. For Bunpro, open its API settings while signed in and use": 'そのサービスの設定を開き、APIキーをコピーします。Bunproの場合はログインした状態でAPI設定を開き、',
    'In Yomu, open settings from the floating Yomu button.': 'よむでは、浮いているよむのボタンから設定を開きます。',
    'Your key stays on your device and talks straight to that service. Treat the Bunpro and WaniKani tokens like passwords — they can change your reviews.': 'キーは端末に保存され、そのサービスと直接やり取りします。BunproとWaniKaniのトークンは復習内容を変更できるため、パスワードと同じように扱ってください。',
    'Prefer a browser extension?': 'ブラウザ拡張のほうがよければ',
    'Permalink to "Prefer a browser extension?"': '「ブラウザ拡張のほうがよければ」への固定リンク',
    'On a computer you can skip the userscript manager and install Yomu as a normal browser extension. It is the same Yomu with a toolbar menu, and it leaves your new-tab page alone.': 'パソコンでは、ユーザースクリプト管理拡張を使わず、よむを通常のブラウザ拡張として入れられます。中身は同じよむで、ツールバーのメニューが付き、新しいタブのページはそのままです。',
    'Get the packages from the': 'パッケージは',
    'The Yomu browser-extension menu, with buttons to open Study, the video player, settings, and the documentation.': 'よむのブラウザ拡張のメニュー。学習ページ、動画プレーヤー、設定、ドキュメントを開くボタンが並んでいます。',
    'The Yomu toolbar icon opens this menu.': 'ツールバーのよむのアイコンから、このメニューが開きます。',
    'and pick the folder you unzipped.': 'を選び、展開したフォルダを指定します。',
    'Open a Japanese page — the floating Yomu button appears.': '日本語のページを開くと、浮いているよむのボタンが現れます。',
    'The userscript is the easy path and updates itself from one link, so it is the default recommendation. Pick the extension if you would rather not run a userscript manager, or you want Study on your browser toolbar. On iPhone and iPad the userscript is the only option.': 'ユーザースクリプトのほうが手軽で、1本のリンクから自動で更新されるため、こちらを標準としておすすめします。ユーザースクリプト管理拡張を使いたくない場合や、ツールバーから学習ページを開きたい場合は拡張を選んでください。iPhoneとiPadではユーザースクリプトのみです。',
    'Sync your words between devices (optional)': '端末どうしで語を同期する（任意）',
    'Permalink to "Sync your words between devices (optional)"': '「端末どうしで語を同期する（任意）」への固定リンク',
    'You do not need an account to read, look words up, or study locally. Create one if you want the words you save to follow you between devices.': '読む、語を調べる、端末内で復習する——これらにアカウントは要りません。保存した語を端末間で持ち歩きたい場合に作成してください。',
    'and create a pairing code. It lasts ten minutes and works once.': 'を開き、ペアリングコードを作成します。有効期間は10分、使えるのは1回です。',
    'In Yomu, open': 'よむで',
    ', paste the code, and choose': 'を開き、コードを貼り付けて',
    'Settings should now show': '設定に',
    // `**Connected as _your name_**` renders as two text nodes, so the runtime
    // asks for each half separately — the joined 'Connected as _your name_'
    // key below is the markdown, not the DOM, and is never reached.
    'Connected as': '接続中：',
    'your name': 'あなたの名前',
    'and a last-sync time.': 'と最終同期時刻が表示されていれば成功です。',
    'Your cards are encrypted on your device before they are uploaded, so what is stored is unreadable without your key. You can list your paired devices, revoke one, export your data, or delete everything from': 'カードは端末上で暗号化されてからアップロードされるため、保存されている内容はあなたの鍵がなければ読めません。ペアリング済みの端末の一覧表示、解除、データの書き出し、全削除は',
    '. A free account syncs your words; it does not include the Academy course.': 'から行えます。無料アカウントは語の同期のためのもので、Academyのコースは含みません。',
    'You do not need AnkiMobile or AnkiDroid for full Anki support on a phone. Keep Anki open on your computer and let your phone talk to it: the phone is the reading screen, the computer does the Anki work.': 'スマートフォンでAnkiを一通り使うのに、AnkiMobileやAnkiDroidは必要ありません。パソコンでAnkiを開いたままにし、スマートフォンからそこへつなぎます。スマートフォンは読む画面、パソコンがAnkiの処理を担当します。',
    'is the easiest way to connect them. It gives your own devices a private address so they can find each other, even away from home — no router setup and no command line.': 'でつなぐのがいちばん簡単です。自分の端末に専用のアドレスが割り当てられ、外出先でも互いを見つけられます。ルーターの設定もコマンド操作も要りません。',
    'on the computer, sign in, and copy its address.': 'をパソコンにインストールし、サインインしてアドレスをコピーします。',
    'In Anki, open': 'Ankiで',
    "Find the webBindAddress line and change 127.0.0.1 to your computer's Tailscale address.": 'webBindAddressの行を探し、127.0.0.1をパソコンのTailscaleアドレスに変更します。',
    'Leave webBindPort as 8765.': 'webBindPortは8765のままにします。',
    'If there is an allowed-origins list, keep what is there and add': '許可オリジンの一覧がある場合は、既存の項目を残したまま',
    'Save, restart Anki, and leave it open.': '保存してAnkiを再起動し、開いたままにします。',
    'On the phone, open': 'スマートフォンで',
    'in the browser. A short AnkiConnect message means the phone can reach your computer.': 'をブラウザで開きます。AnkiConnectの短いメッセージが出れば、スマートフォンからパソコンに届いています。',
    'In Yomu settings → Mining, set': 'よむの設定 → マイニングで、',
    'to that same address.': 'を同じアドレスにします。',
    'Keep AnkiConnect on Tailscale or your home Wi-Fi. It is not built to face the open internet, so do not forward port': 'AnkiConnectはTailscaleか自宅のWi-Fiの中で使ってください。インターネットに直接向ける前提では作られていないため、ルーターでポート',
    'on your router.': 'を開放しないでください。',
    'If you would rather not run desktop Anki at all, Yomu can hand a new card to': 'パソコンのAnkiを動かしたくない場合、よむは新しいカードを',
    'instead. That path starts new cards only — reviewing and updating existing cards needs the computer.': 'に渡せます。この方法で行えるのは新規カードの作成だけで、既存カードの復習や更新にはパソコンが必要です。',
    '. That saves a small file you can import into another browser later.': 'を開きます。小さなファイルが保存され、後で別のブラウザに読み込めます。',
    '— check that your userscript manager is enabled for that site, then refresh.': '— そのサイトでユーザースクリプト管理拡張が有効かを確認し、再読み込みしてください。',
    "A study service isn't showing up": '学習サービスが表示されない',
    '— check the API key was pasted with no extra spaces.': '— APIキーが余分な空白なしで貼り付けられているか確認してください。',
    'AnkiConnect is unreachable from a phone': 'スマートフォンからAnkiConnectにつながらない',
    "— keep Anki open on the computer, keep Tailscale connected on both devices, and use your computer's Tailscale address. On a phone,": '— パソコンでAnkiを開いたままにし、両方の端末でTailscaleを接続し、パソコンのTailscaleアドレスを使ってください。スマートフォンでの',
    'means the phone itself.': 'は、そのスマートフォン自身を指します。',
    'Study looks like an old version': '学習ページが古いまま表示される',
    'directly and refresh once, then close and reopen the tab. If it is still stale, remove and re-add the Home Screen shortcut.': 'を直接開いて一度再読み込みし、タブを閉じて開き直してください。それでも古いままなら、ホーム画面のショートカットを削除して追加し直します。',
    'Still stuck?': 'それでも解決しない場合は、',
    'has the bug tracker and the Discord.': 'に不具合の報告先とDiscordがあります。',
    "Windows release builds no longer mistake the committed Yomu Gaming icon for a stale asset merely because Git checked its SVG source out with Windows line endings. Icon revision checks now canonicalize line endings on every platform, so the Windows packager uses the already-verified icon instead of unexpectedly entering a browser-based regeneration path.": "Windows のリリースビルドが、Git により SVG の元データを Windows 形式の改行でチェックアウトしただけで、登録済みの Yomu Gaming アイコンを古い成果物と誤認することがなくなりました。アイコンのリビジョン確認はすべての OS で改行を正規化するため、Windows のパッケージ処理は検証済みのアイコンを使い、意図せずブラウザーによる再生成へ入ることがありません。",
    "The list a release stages its build output from now covers the reader's stylesheet. The userscript header pins that stylesheet by a URL carrying a hash of its contents, so the name changes with every release and no entry in the list could ever match the new one; a release staged from the list alone would have published a header pointing at a stylesheet that was never uploaded with it.": "リリース時にビルド成果物を登録する一覧が、リーダーのスタイルシートも対象に含むようになりました。ユーザースクリプトのヘッダーはそのスタイルシートを、内容のハッシュを含む URL で固定します。名前はリリースのたびに変わるため、一覧のどの項目も新しい名前に一致できませんでした。その一覧だけでリリースを用意すると、一緒にアップロードされていないスタイルシートを指すヘッダーを公開してしまうところでした。",
    "Yomu Gaming now waits in the menu bar instead of disappearing when you close its window. Closing a window used to do one of two opposite things: once the overlay had been opened the app lived on with no window, no taskbar entry and no way to quit, and before that the same click ended the session and took the capture shortcut with it. A tray item now holds Read screen, Settings and Quit and is the app's home while its windows are away, closing a window parks it so the shortcut keeps working and Settings reopens instantly, and a second launch shows the copy already running instead of fighting it for the hotkey.": "Yomu Gaming のウィンドウを閉じてもアプリが消えず、メニューバーで待機するようになりました。これまでウィンドウを閉じる操作は正反対の二つの結果を招いていました。一度オーバーレイを開いた後は、ウィンドウもタスクバーの項目も終了手段もないままアプリだけが生き残り、開く前であれば同じ操作でセッションごと終了してキャプチャのショートカットも失われていました。今はトレイの項目に「画面を読む」「設定」「終了」が並び、ウィンドウが出ていない間はそこがアプリの居場所になります。ウィンドウを閉じても破棄ではなく待機になるためショートカットは効き続け、設定もすぐ開き直せます。二重に起動した場合はホットキーを奪い合わず、既に動いているほうを表示します。",
    "Settings now offers to bring an older Yomu note type up to date. A Yomu note type created by an earlier release carries eight fields where this release writes fifteen, so mined audio, pitch and dictionary text had nowhere to land, and the only control that could widen it was a button labelled Create Yomu note type that nothing ever told an existing user to press. Whenever Anki is reachable and the configured note type is short of a field, a line names what it can gain and offers an Update button; accepting adds exactly those fields and leaves your templates and styling as you left them, and the offer disappears as soon as the note type matches, so it cannot nag.": "以前のリリースで作られた Yomu のノートタイプを最新の構成に更新するかどうか、設定が提案するようになりました。以前のノートタイプはフィールドが8つですが、このリリースは15を書き込むため、採取した音声・アクセント・辞書本文の置き場がありませんでした。しかも幅を広げられる操作は「Yomu ノートタイプを作成」というボタンだけで、既存の利用者にそれを押すよう伝えるものはどこにもありませんでした。Anki に接続できていて設定中のノートタイプに足りないフィールドがあるときは、何を追加できるのかを一行で示して更新ボタンを添えます。承認すると足りないフィールドだけが追加され、テンプレートやスタイルは手を入れたままの状態で残ります。ノートタイプが揃った時点で提案は消えるので、しつこく出続けることはありません。",
    "Yomu Gaming now opens on one screen that says what the app is and what to press. The first run said the same thing twice in two visual styles, offered six buttons for three actions, and put two thirds of the window into the reader's Media settings before anyone had read a word of Japanese. Settings is now somewhere you go, it opens on the capture shortcut, it has its own way back, and it keeps the tab you were on. The home screen also names a key only while the keyboard actually has it: where the system refuses the shortcut it points at Settings instead of promising a key that does nothing, and a shortcut the system rolls back is no longer reported as saved.": "Yomu Gaming が、アプリの正体と押すべきキーを伝える一つの画面から始まるようになりました。従来の初回起動は同じ内容を二通りの見た目で二度述べ、三つの操作に六つのボタンを並べ、まだ日本語を一語も読んでいないうちにウィンドウの三分の二をリーダーのメディア設定に充てていました。設定は「行く場所」になり、開くとキャプチャのショートカットが最初に表示され、戻る手段を自前で持ち、開いていたタブも保たれます。ホーム画面がキーの名前を出すのは、キーボードが実際にそれを保持しているときだけです。システムがショートカットを拒む環境では、効かないキーを約束する代わりに設定へ誘導し、システムに巻き戻されたショートカットを保存済みと報告することもなくなりました。",
    "The Yomu Gaming capture shortcut now works on the first press of a session, and reads the screen again on every press after it. macOS returns an empty screen thumbnail on the first request after launch, so the first press found no screen and failed after the main window had already been hidden to take a clean frame, and Yomu Gaming simply disappeared with no overlay and no error on five cold starts out of five. Later presses reused the overlay window without reloading it and so replayed the first capture: the game had moved on while the overlay still showed the first screenshot and the words read out of it.": "Yomu Gaming のキャプチャのショートカットが、セッションの一回目から効き、以降も押すたびにその時点の画面を読み直すようになりました。macOS は起動後の最初の要求に空の画面サムネイルを返すため、一回目の押下は画面を見つけられずに失敗し、しかもきれいなフレームを撮るために既にメインウィンドウを隠した後だったので、Yomu Gaming はオーバーレイもエラーも出さないまま姿を消していました。コールドスタート5回中5回で再現しています。二回目以降はオーバーレイのウィンドウを読み込み直さずに使い回していたため、一回目のキャプチャをそのまま再生していました。ゲームは先へ進んでいるのに、オーバーレイは最初のスクリーンショットとそこから読み取った語を見せ続けていたということです。",
    "Recognized text is now typeset at the size of the text it was read from, and sits on it. The type size was a fixed fraction of the recognized box with a ceiling on it, so a box drawn tightly around 46px of game text produced a 24.5px line covering the middle half of the sentence, and source text above roughly 65px was out of reach at every Image text scale setting. Each line is now measured against the text it covers, centred on that text and dropped onto its baseline with room for its reading, and framed by the picture rather than by the window, so resizing the window no longer walks a line of dialogue down the screen and stretches it.": "認識された文字が、読み取り元の文字と同じ大きさで組まれ、その上に重なるようになりました。文字の大きさは認識された枠の一定割合に上限を掛けたもので、46px のゲーム文字にぴったり付いた枠から 24.5px の行が生まれ、台詞の中央の半分ほどしか覆えず、およそ 65px を超える元の文字は「画像内文字の倍率」をどう設定しても届きませんでした。今は各行を覆う対象の文字に合わせて実測し、その文字の中央に置いてベースラインに載せ、読みの分の余白も確保します。行の基準になる枠もウィンドウではなく表示されている画像そのものになったので、ウィンドウの大きさを変えても台詞の行が画面を下へ歩いて伸びることはありません。",
    "The recognized-text overlay no longer re-typesets every line on every frame. Fitting a vertical column that carried a reading measured a throwaway copy of the line appended to the overlay, and the overlay re-runs its layout pass on any change beneath it, so each measurement scheduled the pass that inserted the next one: 157 of them over 158 frames in a second and a half, over a running game, on a handheld. Vertical columns are now measured as the player sees them, and a line's length is remembered between passes instead of being taken again.": "認識文字のオーバーレイが、毎フレームすべての行を組み直すことがなくなりました。読みを伴う縦書きの列を合わせる際、行の使い捨ての複製をオーバーレイに足して測っていましたが、オーバーレイはその配下の変化すべてでレイアウト処理をやり直すため、一回の計測が次の計測を差し込む処理を予約していました。実測では1.5秒の間に158フレームに対して157回、動作中のゲームの上で、携帯機の上で起きていました。縦書きの列もプレイヤーが見ているままの行として測るようになり、行の長さは毎回取り直さず処理の間で記憶されます。",
    "Yomu Gaming now reads the screen you are playing on. Capture and the overlay were both wired to the primary display, so a player with the game on a second monitor got the overlay on the first one showing a frozen shot of the wrong screen. Every press now resolves the display under the pointer and grabs that one at its own scale factor, so a mixed-resolution setup is captured sharp, and the app names the rule once when more than one display is attached.": "Yomu Gaming が、プレイしている画面を読むようになりました。キャプチャもオーバーレイも主ディスプレイに固定されていたため、二台目のモニターでゲームを遊んでいるプレイヤーには、一台目に別の画面の静止画を映したオーバーレイが出ていました。今は押すたびにポインターのあるディスプレイを特定し、そのディスプレイ自身の拡大率で取り込むので、解像度の異なる環境でも鮮明に取り込めます。ディスプレイが複数あるときは、どの画面を読むのかを一度だけ案内します。",
    "Yomu Gaming keeps the words in the language you study. It was Japanese by construction: the capture asked for Japanese, the filter that decides which recognized lines are worth reading was a Japanese test, lookup ran the Japanese analyser, and the part of the app that parses an answer before anything else sees it kept only Japanese lines, which for the default provider threw away the whole capture. All of that now follows the study target, including a target you switch to while the app is running. The language also stops reverting on the first save: the blank setting that means follow the study target was being replaced with a concrete language the first time anything in Settings was saved, and nothing in the interface could put it back.": "Yomu Gaming が、学習している言語の語を保つようになりました。従来は構造から日本語専用で、キャプチャは日本語を要求し、認識された行のうち読む価値があるものを選ぶ判定も日本語向けの検査で、検索は日本語の解析器を直接呼び、応答を他の何よりも先に解釈する部分は日本語の行だけを残していました。既定のプロバイダーでは、それがキャプチャ全体を捨てることを意味していました。これらはすべて学習ターゲットに従うようになり、アプリの動作中に切り替えたターゲットにも追随します。言語が最初の保存で戻ってしまう問題も直りました。「学習ターゲットに従う」を意味する空の設定値が、設定で何かを保存した最初の一度で具体的な言語に置き換えられており、画面上にそれを元へ戻す手段がありませんでした。",
    "Yomu Gaming now shows its own icon on the Dock. macOS draws the Dock and app-switcher entry from the running bundle and ignores the icon a window asks for, so an unpackaged run wore stock Electron's logo; a packaged build was always correct. The desktop icons are also rebuilt from the app's vector as part of the build now, which is how they came to sit 15px low at 512px after the vector was re-centred.": "Yomu Gaming が Dock に自分のアイコンを表示するようになりました。macOS は Dock とアプリ切り替えの表示を実行中のバンドルから描き、ウィンドウが指定したアイコンを無視するため、パッケージ化していない実行では Electron の既定のロゴのままでした。パッケージ済みのビルドは以前から正しく表示されていました。デスクトップ用のアイコンは、アプリのベクター画像からビルドの一部として作り直すようにもなりました。ベクターの中心を取り直した後もアイコンだけが古いままで、512px で15px 下にずれていたのはこれが理由です。",
    "A row in a video list is now annotated along its whole line. A settle scan could only recognise its own work when a line covered its whole host element, so every row built from several nodes, which is most of a mobile video list, was re-collected and re-parsed on every scroll settle; the phone's parsing budget went on rows that were already decorated and the rows the feed had just recycled queued behind that waste and stayed bare. A line is now judged by the exact text it covered when it was drawn, so a recycled row carrying new text is offered again, a line whose neighbour on the same host was the one that got words is still offered, and neither erases the other's words.": "動画一覧の行が、行全体にわたって注釈されるようになりました。整定後の走査は、一つの行が要素全体を占めている場合しか自分の仕事を認識できず、複数のノードから組み立てられた行——モバイルの動画一覧のほとんどがこれです——はスクロールが落ち着くたびに集め直され、解析し直されていました。スマートフォンの解析の予算は既に装飾済みの行に費やされ、フィードが直前に使い回した行はその無駄の後ろに並んで素のままでした。行は描かれた時点で覆った文字そのもので判定されるようになったので、新しい文字を載せて再利用された行は改めて対象になり、同じ要素を共有する隣の行が語を得ていた場合もその行は対象のままで、どちらも相手の語を消しません。",
    "Words now split on the katakana middle dot. ・ and ゠ live inside the katakana block of Unicode, which every katakana character class is built from, so a run like ボイス・ビデオ・テキストコミュニケーションサービス was read as one headword no dictionary carries and the popover reported no pitch for any of it. The separators now break the word and are dropped rather than kept, which also stops a bare ・ being offered as something to look up.": "中黒でも語が分かれるようになりました。・ と ゠ は Unicode のカタカナブロックの中にあり、あらゆるカタカナの文字クラスはそこから作られているため、ボイス・ビデオ・テキストコミュニケーションサービス のような並びが、どの辞書にも載っていない一つの見出し語として読まれ、ポップオーバーはその全体についてアクセントなしと報告していました。区切りの記号は語を分けたうえで捨てるようにしたので、単独の ・ が調べる対象として提示されることもなくなりました。",
    "The grammar Details disclosure in Study now appears only when there is something behind it. The bundled grammar registry ships no prose, so when the remote rule text does not arrive the fallback filled the summary line and the detail body with the same rule name, and opening Details showed と one line below the と already on screen. With nothing to reveal, the match line and the guide link now sit inline, which also makes the guide directly clickable instead of hidden behind a toggle that opened onto a single link.": "学習画面の文法の「詳細」が、中身があるときだけ表示されるようになりました。同梱の文法データには解説文が一切入っていないため、遠隔の規則本文が届かないと代替の表示が要約の行と詳細の本文の双方を同じ規則名で埋め、詳細を開いても画面に出ている と の一行下に と が現れるだけでした。見せるものがない場合は、一致した行と手引きへのリンクをそのまま並べて表示するようにしたので、手引きもリンク一つのために開く仕掛けの裏に隠れず直接押せます。",
    "One tap now hides the translation on a phone. The annotated line and the video's own caption line were written to the page as one block of markup, so every change to the line above, the next cue, a karaoke tick, a lookup landing, silently rebuilt the caption's toggle underneath your finger, and a browser only reports a tap when the thing you pressed is still there when you lift. Each line now updates on its own and the control is built once and kept, the line is no longer held back by the browser's double-tap-zoom wait, and the peek-on-hover reveal is for mice only, because on touch it answered the first tap with a preview instead of letting the tap through. The controls in the line drawer, replay, loop, auto-pause, record and the line jumps, are held the same way: a rebuild that arrives while your finger is down waits until the tap has been delivered.": "スマートフォンで、一度のタップで訳を隠せるようになりました。注釈付きの行と動画自身の字幕行が一つのまとまりとしてページに書き込まれていたため、上の行に起きる変化——次のキュー、カラオケの進み、検索結果の到着——のたびに、指の下にある字幕の切り替えまで黙って作り直されていました。ブラウザは、押したものが指を離す瞬間にもそこにある場合しかタップとして扱いません。今はそれぞれの行が独立して更新され、操作部は一度作られたら保たれます。行はブラウザのダブルタップ拡大の待ち時間にも縛られなくなり、ホバーで覗ける表示はマウス専用になりました。タッチではそれが最初のタップにプレビューで応え、タップそのものを通していなかったためです。行のドロワーにある操作——再生し直し、繰り返し、自動停止、録音、行の移動——も同じ扱いで、指が触れている間に届いた作り直しはタップが伝わるまで待たされます。",
    "Updating your Anki note type only ever touches the note type it offered. Accepting widened whichever note type the picker happened to be showing rather than the one the offer named, so switching the picker left the message naming the old note type and the update pointed at the new one; and when AnkiConnect could not read a note type's fields, which is what Anki does while a modal holds the collection, the same accept read that as fifteen missing fields and wrote all fifteen, a collection-wide schema change with no cheap undo. The write now re-reads its plan and does only what the plan says, a field list that will not read is a failed request rather than a note type with no fields, and picking a note type retires the offer and earns it again against the new selection.": "Anki のノートタイプの更新が、提案が名指ししたノートタイプ以外に触れることはなくなりました。承認は、提案が名指ししたものではなく、その時点で選択欄に表示されているノートタイプを広げていたため、選択を切り替えるとメッセージは古い名前のままで、更新だけが新しいほうを向いていました。さらに、AnkiConnect がノートタイプのフィールドを読めないとき——Anki がモーダルでコレクションを掴んでいる間はこうなります——同じ承認がそれを15個のフィールド不足と解釈して15個すべてを書き込んでいました。これはコレクション全体のスキーマ変更で、簡単には取り消せません。書き込みは計画を読み直して計画が言うことだけを実行するようになり、読み取れないフィールドの一覧はフィールドのないノートタイプではなく失敗した要求として扱われ、ノートタイプを選び直すと提案はいったん取り下げられて新しい選択に対して取り直されます。",
    "The Anki field-mapping panel now has English help where a blank string used to render. The message shown when a note type's fields cannot be read was written in Japanese and left empty in English, so everyone but Japanese users got an empty help line under the panel. It now says the fields could not be read, which is what an empty answer means there, and points at the AnkiConnect check.": "Anki のフィールド対応パネルに、これまで空の文字列が表示されていた箇所の英語の説明が入りました。ノートタイプのフィールドを読み取れなかったときのメッセージは日本語だけ書かれていて英語は空だったため、日本語以外の利用者にはパネルの下に空の説明行が出ていました。今は、そこで空の応答が意味するとおりフィールドを読み取れなかったことを伝え、AnkiConnect の確認を促します。",
    "Japanese labels are back across batch mining and shadowing. Moving the subtitle copy onto locale overlays left the Japanese table in the file with nothing referencing it, so Japanese users would have seen English labels throughout; it is registered as the Japanese overlay again, and no wording changed.": "一括採取とシャドーイングの日本語ラベルが戻りました。字幕まわりの文言をロケール別の上書き表へ移した際、日本語の表がファイルに残ったまま誰からも参照されなくなっていたため、日本語の利用者にはこの範囲が英語で表示されるところでした。日本語の上書き表として登録し直しただけで、文言はどれも変えていません。",
    "Re-rendered text stays annotated when a frame never arrives. A surface that redraws itself with the same text re-stamps its annotation positions in a pass that waits for the next animation frame, and that wait was held by a single latch which only its own frame callback could release, so a frame that never came turned the re-stamp off for the rest of the page's life and the status tint and the pitch underline stayed pinned to where the glyphs used to be. The frame never came in two ways: the page replaced the scheduler the latch was waiting on, and inside a Firefox userscript sandbox the frame request threw and took the rest of the callback with it. The pass now asks the window that owns the text for its frame, and remembers which scheduler owes it a callback.": "描き直された文字が、フレームが一度も来なかったときでも注釈を保つようになりました。同じ文字のまま自らを描き直す表示は、次の描画フレームを待つ処理で注釈の位置を押し直しますが、その待ちは自分のフレーム処理からしか解除できない一つの掛け金で保持されていました。そのためフレームが来なければ押し直しはそのページの残りの寿命の間ずっと止まり、状態の色付けやアクセントの下線は、文字がかつてあった位置に留まり続けました。フレームが来ない経路は二つありました。掛け金が待っていたスケジューラーをページ側が入れ替えた場合と、Firefox のユーザースクリプトのサンドボックス内でフレームの要求が例外を投げ、その処理の残りごと巻き添えにした場合です。今は文字を持つウィンドウ自身にフレームを要求し、どのスケジューラーが応答を負っているかを覚えておくようにしました。",
    "The Study page on yomureader.com now reports the version you actually installed. It was serving a 1.8.14 build under the 1.8.15 release, and the published API documents advertised 1.8.14 too. The check that was meant to notice could not: it regenerated those files itself before comparing them, so it only ever compared freshly written bytes against freshly written bytes. Both are now checked as they were committed.": "yomureader.com の学習ページが、実際にインストールされているバージョンを表示するようになりました。1.8.15 のリリースの下で 1.8.14 のビルドが配信されており、公開している API 文書も 1.8.14 を名乗っていました。それを見つけるはずの検査は気付けませんでした。比較の前に自分でそれらのファイルを作り直していたため、作りたてのバイト列同士を比べていただけだったからです。今はどちらもコミットされた状態のまま検査されます。",
    "A rebuild no longer rewrites files nobody changed. Building on a clean checkout dirtied eleven committed artifacts, so nobody could tell a real change from build noise: the hosted Study route stamped the wall-clock time into a committed file on every build, and a compression library installed one patch ahead of the version the lockfile pins added a line to every bundle and changed a content-addressed companion's filename. The timestamp is gone, the fields that identify a build were already there, and the build now checks its bundled dependencies against the lockfile before it compares anything.": "再ビルドしても、誰も変更していないファイルが書き換わることがなくなりました。きれいなチェックアウトでビルドするだけでコミット済みの成果物が11個汚れていたため、本当の変更とビルドの雑音を見分けられませんでした。原因は、配信中の学習ページ用のファイルにビルドのたび実時刻が刻まれていたことと、ロックファイルが固定する版より一つ新しい圧縮ライブラリが入っていて、すべてのバンドルに一行加わり、内容から名前を決めるコンパニオンのファイル名まで変わっていたことです。時刻の刻印は削除し——ビルドを識別する項目は元から別にありました——ビルドは比較の前に同梱する依存関係をロックファイルと突き合わせるようになりました。",
    "A failing release gate now says which thing is wrong. It reached its stale-artifact verdict by elimination, so on a machine whose installed packages did not match the lockfile it blamed the commit for the toolchain and advised committing bundles built by the wrong compressor, and it quietly downgraded that check to a note whenever anything in the tree was untracked, including a temporary directory the gate itself writes. It now names the mismatched packages with both versions, says at the start and again in its verdict when the check is not being enforced, and additionally checks the hosted Study route, the published API documents, the Academy shell's cache-busting revision, and that every companion the userscript pins by URL is committed with the hash it pins, which is the check a release staged with git add -u misses because each content-addressed companion is a new file rather than a modified one.": "リリース用の検査が失敗したときに、何が悪いのかを名指しするようになりました。成果物が古いという判定は消去法で導かれていたため、インストール済みのパッケージがロックファイルと一致しない環境では、ツールチェーンの責任をコミットに着せ、誤った圧縮器で作られたバンドルをコミットするよう勧めていました。また、ツリーに追跡外のファイルが一つでもあると——検査自身が書き出す一時ディレクトリも含めて——その判定を黙って注意書きに格下げしていました。今は一致しないパッケージを双方の版とともに名指しし、検査が強制されていない場合は開始時と最終判定の両方でそう述べます。加えて、配信中の学習ページ、公開している API 文書、Academy の外殻がキャッシュを捨てるための版数、そしてユーザースクリプトが URL で固定するコンパニオンがすべて固定どおりのハッシュでコミットされているかも検査します。最後の一つは git add -u で用意したリリースが取りこぼす検査です。内容から名前を決めるコンパニオンは、変更されたファイルではなく新規のファイルだからです。",
    'Buttons, chips, menu items and other interface controls now show their furigana readings all the time, exactly like body text. Two separate problems had left controls bare: a recent change deliberately hid readings on buttons until they were hovered, which made them unreachable on touch screens; and a longer-standing defect where a control\'s own hover and ripple layers were mistaken for a menu covering the word, so the reading was created and then immediately hidden. Controls keep their exact size, spacing and tap targets, and a real menu or dropdown opened over a control still hides the readings beneath it as before.': 'ボタン、チップ、メニュー項目などのインターフェース操作部にも、本文とまったく同じように、ふりがなが常時表示されるようになりました。操作部が素のままになる原因は2つありました。最近の変更でボタンの読みがホバーするまで意図的に隠されており、タッチ画面では読みに到達できなかったこと。そしてより古くからの不具合として、操作部自身のホバーやリップルの層が単語を覆うメニューと誤認され、読みが生成された直後に隠されていたことです。操作部の寸法・間隔・タップ領域は正確に保たれ、操作部の上に実際に開いたメニューやドロップダウンは、これまでどおりその下の読みを隠します。',
    "Every dictionary Yomu mirrors is now listed in Settings, not just the handful it recommends. The catalogue holds 186 titles — Japanese monolingual dictionaries, all eight pitch-accent dictionaries, grammar, thesaurus, encyclopedia and frequency lists — but only fourteen of them had ever been reachable from the interface. They now appear grouped by kind, each installable in one press and each verified against a published checksum as it downloads.": "Yomuがミラーしている辞書が、おすすめの数点だけでなくすべて設定に並ぶようになりました。カタログには186点——日本語の国語辞典、8種すべてのアクセント辞典、文法、類語、百科、頻度リスト——が収められていますが、これまで画面から辿り着けたのはそのうち14点だけでした。今は種類ごとにまとめて表示され、どれも一度の操作で導入でき、ダウンロード時に公開されたチェックサムと照合されます。",
    "Readings no longer stay behind when a page rewrites the text around an annotated word. Yomu ignores the page edits it makes itself, and the test for that was matching Yomu's own word wrappers, so a genuine edit by the site next to an annotated word looked like Yomu's own writing and was discarded — the reading stayed at the old position until something else moved it.": "注釈の付いた語の周辺をページが書き換えたときに、読みが取り残されることがなくなりました。Yomuは自分自身が行った変更を無視しますが、その判定がYomu自身の語ラッパーにも一致していたため、注釈の付いた語の隣でサイトが行った本物の変更までYomu自身の書き込みと見なされて捨てられ、他の何かが動くまで読みが古い位置に留まっていました。",
    "Tapping a video's own subtitle line to blur it no longer unfolds the reader's control rail over the picture. The blur always worked; the rail woke on the same tap because the wake decided purely on where the finger landed, and the platform's caption sits inside the reader's own subtitle area. Tapping blank space in that area still wakes the rail, so a rail dragged out of reach stays recoverable.": "動画自身の字幕行をタップしてぼかしても、映像の上にリーダーの操作バーが開かなくなりました。ぼかし自体は常に動いていましたが、目覚めの判定が指の触れた位置だけで決まっており、プラットフォームの字幕はリーダーの字幕領域の内側にあるため、同じタップで操作バーも起き上がっていました。その領域の何もない場所をタップすればこれまで通り操作バーは開くので、届かない位置に動かしてしまったバーも元に戻せます。",
    "Sites that force their own colours, borders and shadows onto every element on the page no longer strip the reader's interface back to bare text. On such a site the floating button lost its circle, its background and its outline, leaving the label floating loose. The reader now re-asserts its own appearance in a way the page cannot outrank, without changing how the site itself looks anywhere.": "ページ上のすべての要素に自前の色・枠線・影を強制するサイトでも、リーダーの画面が素のテキストまで剥がされなくなりました。そうしたサイトでは浮動ボタンが円も背景も輪郭も失い、ラベルだけが宙に浮いていました。リーダーは自分の見た目を、ページ側が上書きできない形で改めて主張するようになりました。サイト自身の見え方はどこも変わりません。",
    "Subtitle annotations no longer vanish for a moment, or for good, as each line appears. A line whose readings had already been prepared was compared against the wrong record of what was last drawn, so the reader concluded it had nothing ready and repainted the line as plain text — annotations returned only if a second lookup happened to land, and the repaint also wiped the colours applied a moment earlier.": "字幕の注釈が、行が現れるたびに一瞬消えたり、そのまま戻らなくなったりすることがなくなりました。読みの準備が既に済んでいる行が、最後に描画した内容の誤った記録と比較されていたため、リーダーは用意が何もないと判断して行を素のテキストで描き直していました。注釈は二度目の照会がたまたま届いたときだけ戻り、その描き直しは直前に適用された色も消していました。",
    "The reader's own styling now survives a page load that cannot reach its stylesheet. Only two sources were tried, the second of which is blocked on a number of networks, so a reader that missed both rendered as unstyled native controls with no dialog frame. A third always-available source now sits between them, the last known-good stylesheet is kept across updates instead of being discarded on every release, and a load that still ends with no styling now says so in the console instead of failing silently.": "スタイルシートに到達できない読み込みでも、リーダー自身の見た目が保たれるようになりました。取得先は二つしかなく、そのうち二つ目は多くのネットワークで遮断されるため、どちらも取り逃した場合はダイアログの枠もない素のネイティブ部品として表示されていました。常に利用できる三つ目の取得先をその間に置き、最後に成功したスタイルシートを更新のたびに捨てるのではなく跨いで保持するようにし、それでもスタイルが得られなかった場合は黙って失敗せずコンソールに知らせます。",
    "Parts of Yomu that wait on the network no longer hang indefinitely when the browser's userscript manager drops a reply. Yomu asks the manager to fetch on its behalf and to apply a time limit, but several managers silently ignore that limit, so a reply that never arrived left the request waiting forever with no error anywhere — the settings panel reporting that its companion did not load, a study card stuck on translating, page text recognition latched on a failure it could not clear. Every such request now enforces its own limit and cancels the abandoned transfer instead of leaving it running. A large dictionary download still takes as long as it needs, because its limit counts from the last sign of progress rather than from the start.": "ネットワークを待つYomuの各所が、ブラウザのユーザースクリプトマネージャーが応答を取りこぼしたときに無期限で止まらなくなりました。Yomuはマネージャーに取得と制限時間の適用を依頼しますが、いくつかのマネージャーはその制限を黙って無視するため、届かない応答を永遠に待ち続け、どこにもエラーが出ないままでした——設定パネルがコンパニオンを読み込めなかったと報告する、学習カードが翻訳中のまま止まる、ページの文字認識が解除できない失敗に固着する、といった症状です。今はそうした要求のすべてが自身で制限を課し、放棄された転送を走らせたままにせず取り消します。大きな辞書のダウンロードは、制限が開始時点ではなく最後に進捗があった時点から数えられるため、これまで通り必要なだけ時間をかけられます。",
    "A cancelled request no longer keeps contacting servers after it was abandoned. A lookup that tries several hosts in turn checked whether the caller had given up only before the first one, so cancelling part-way through still worked through every remaining host.": "取り消された要求が、放棄された後もサーバーに問い合わせ続けることがなくなりました。複数のホストを順に試す照会は、呼び出し元が中断したかどうかを最初の一つの前でしか確認しておらず、途中で取り消しても残りのホストをすべて試し切っていました。",
    "Every dictionary Yomu mirrors can now be searched, and the shelf it recommends is no longer three entries deep. Settings suggested only a bilingual dictionary, a name dictionary and a kanji dictionary in every one of the thirty-two interface languages, while the monolingual Japanese dictionaries, the pitch-accent dictionaries, and the grammar, frequency and example collections sat mirrored and unreachable. The recommended shelf now spans those kinds, the full catalogue is filterable by name from the panel, and the browsing interface itself is translated into every language the rest of Settings already speaks.": "Yomuがミラーしている辞書を検索できるようになり、おすすめの棚も3件だけではなくなりました。これまでは32の表示言語すべてで対訳辞書・人名辞書・漢字辞書の3件しか提示されず、国語辞典もアクセント辞典も、文法・頻度・用例の各コレクションもミラー済みのまま辿り着けませんでした。おすすめの棚がこれらの種類にまたがるようになり、カタログ全体を名前で絞り込めるようになり、閲覧画面自体も設定の他の部分と同じすべての言語に翻訳されました。",
    "Furigana no longer collide with each other on pages of dense Japanese. A reading wider than the word beneath it overhangs on both sides, and where the next word carried a reading too, the two printed on top of one another and neither could be read. Ordinary web page ruby avoids this by stretching the word itself, which Yomu must not do to text it does not own, so readings that would overlap are now placed on separate rows instead.": "日本語が密集したページで、ふりがな同士が重なることがなくなりました。下の語より長い読みは左右にはみ出すため、隣の語にも読みが付いていると二つが重なって印刷され、どちらも読めませんでした。通常のウェブページのルビは語そのものを引き伸ばして回避しますが、Yomuは自分のものでない文字に手を加えられないため、重なる読みは別の段に配置するようにしました。",
    "Readings now appear on the view counts and dates beside a video title. Yomu builds that line from labels the site exposes for screen readers rather than from the page text, and those labels carry no position information, so there was nothing for a reading to be attached to.": "動画タイトル脇の再生回数や日付にも読みが表示されるようになりました。Yomuはこの行をページ本文ではなくサイトがスクリーンリーダー向けに提供するラベルから組み立てており、そのラベルには位置の情報がないため、読みを結び付ける先がありませんでした。",
    "Kanji carrying furigana no longer look dirtier than the plain characters beside them. The reading's dark outline, which keeps it legible over video, was sized in fixed pixels while everything around it scales with the caption, so on smaller captions it reached past the gap and washed the top of the character it belonged to. The outline now scales with the reading, and its depth is rebuilt close in rather than spread wide, so the reading stays at least as legible over bright video as it was before.": "ふりがなの付いた漢字が、隣の平仮名より汚れて見えることがなくなりました。読みを動画の上でも判読させるための濃い輪郭が、周囲がすべて字幕に合わせて拡大縮小するなかで固定ピクセルのままだったため、字幕が小さいほど隙間を越えて、その読みが属する漢字の上部を汚していました。輪郭は読みに合わせて拡大縮小するようになり、濃さは広げるのではなく近くで重ねて作るようにしたので、明るい映像の上での判読性はこれまでと同等以上に保たれます。",
    "A pitch underline no longer stays behind on the wrong words when a site reuses a line for different content. Video pages recycle the element holding the subscriber count and the view-count row, swapping the text while Yomu's annotation layer survives, and every position that layer held then pointed at characters that were gone — so the underline sat over whatever had taken their place until something else redrew the page. That layer is now taken down as soon as the text beneath it changes, including the word's own underline, which was otherwise handed straight back and repainted in the same wrong place.": "サイトが同じ行を別の内容に使い回したときに、アクセントの下線が誤った語の上に残ることがなくなりました。動画ページはチャンネル登録者数や再生回数の行の要素を再利用してテキストだけを差し替えますが、Yomuの注釈層はそのまま残るため、層が保持していた位置はすべて既に存在しない文字を指すことになり、他の何かがページを描き直すまで下線が入れ替わった文字の上に残っていました。テキストが変わった時点でその層を撤去するようにし、撤去後に語自身の下線がそのまま返されて同じ誤った位置に描き直されていた分も止めました。",
    "install from URL": "URLからインストール",
    "Installing no longer dead-ends when your script manager saves the userscript instead of opening it. Some managers do not take over the install link, so the file lands in Downloads and nothing tells you what to do next; the homepage now shows the install URL and the exact \"install from URL\" step for Tampermonkey, Violentmonkey and ScriptCat.": "スクリプトマネージャーがユーザースクリプトを開かずに保存してしまっても、インストールが行き止まりにならなくなりました。インストールリンクを引き受けないマネージャーがあり、その場合ファイルはダウンロードフォルダに落ちるだけで次にどうすればよいか分かりません。ホームページにインストールURLと、Tampermonkey・Violentmonkey・ScriptCat それぞれの「URLからインストール」の手順を表示するようにしました。",
    "Readings no longer disappear for a second or two when a page redraws itself. Sites that rebuild part of the page as you use them — a video page swapping in new titles, a feed refreshing a row — left every reading hidden until something unrelated happened to redraw them, which on a quiet page could be a long wait.": "ページが自らを描き直したときに、読みが1〜2秒消えることがなくなりました。使用中にページの一部を作り直すサイト——新しいタイトルを差し替える動画ページ、行を更新するフィード——では、無関係な再描画が起きるまで読みがすべて隠れたままで、静かなページでは長く待たされることもありました。",
    "The dictionary catalogue is no longer keyed to a single study language, so dictionaries for other languages are reachable rather than silently filtered out of the panel.": "辞書カタログが単一の学習言語に固定されなくなり、他の言語の辞書もパネルから除外されずに辿り着けるようになりました。",
    'Stray floating furigana no longer linger in odd corners of the page after the text they belonged to has gone. A reading kept at its last known position to bridge a brief relayout depended on some later page activity to be cleaned up; on a quiet page that cleanup never ran, so the stale reading floated indefinitely. The cleanup now schedules itself and the bridging tolerance is capped by time.': '属していたテキストが消えた後も、ふりがなだけがページの隅に浮かんで残り続けることがなくなりました。短い再レイアウトの橋渡しとして直前の位置に保持された読みは、その後のページ上の何らかの動きに掃除を頼っていたため、静かなページでは掃除が一度も走らず、古い読みがいつまでも浮かんでいました。掃除は自ら次の実行を予約するようになり、橋渡しの猶予にも時間の上限を設けました。',
    'Furigana no longer lags behind the page while scrolling through video feeds on tablets. Titles trimmed to a fixed number of lines and bylines shortened with an ellipsis were still being repositioned frame by frame during scrolling; they now travel with the page itself like ordinary text does.': 'タブレットで動画フィードをスクロール中に、ふりがながページ本文から遅れて動くことがなくなりました。行数を固定して切り詰められたタイトルや省略記号で短縮された行は、スクロール中も1フレームずつ位置を描き直し続けていましたが、通常のテキストと同じようにページと一緒に移動するようになりました。',
    'Long video descriptions are now annotated all the way through. Text past roughly the first two hundred and forty characters of a block was silently skipped by the local dictionary lookup, which left the middle of an expanded description completely bare while the top and bottom were annotated.': '長い動画説明文が最後まで注釈されるようになりました。ブロックの先頭からおよそ240文字を超えた部分がローカル辞書の検索で黙って読み飛ばされていたため、展開した説明文の中間だけがまったく注釈されず、先頭と末尾だけに注釈が付いていました。',
    'Dragging the floating subtitle control rail on a phone or tablet now moves the rail instead of scrolling the page. The rail\'s drag handle asked to own its touch gesture, but a general touch-sizing rule for the rail\'s buttons overrode it, leaving the browser in charge of the gesture.': 'スマートフォンやタブレットで字幕操作レールをドラッグすると、ページがスクロールする代わりにレールが動くようになりました。レールのドラッグハンドルはタッチ操作の主導権を宣言していましたが、レールのボタン全体に適用されるタッチ寸法の一般規則がそれを上書きし、操作の主導権がブラウザに残っていました。',
    'Pressing Cancel in the settings dialog while it is open over a playing video now closes the dialog. A protective layer that stops stray taps on displaced subtitles from activating links underneath judged clicks purely by their position on screen, so it also swallowed clicks aimed at the reader\'s own dialogs and focused the player instead, which is why the site\'s player controls appeared rather than the dialog closing.': '再生中の動画の上で設定ダイアログを開いているとき、キャンセルを押すとダイアログが閉じるようになりました。移動した字幕への誤タップが下のリンクを作動させるのを防ぐ保護層が、クリックを画面上の位置だけで判定していたため、リーダー自身のダイアログに向けたクリックまで飲み込み、代わりにプレーヤーへフォーカスを移していました。ダイアログが閉じずにサイトのプレーヤー操作部が現れたのはそのためです。',
    'The subtitle overlay now hides when scrolling down to read comments while the video keeps playing in a small docked mini player. Only pausing used to hide it, because the overlay judged visibility purely by where the player box sat on screen, and the docked box is fully on screen. A mini player opened deliberately keeps its overlay, and an overlay hidden this way returns if the page later puts the player back in the flow of the page.': '動画が小さなドッキング式ミニプレーヤーで再生され続けている間にコメントを読もうとスクロールすると、字幕オーバーレイが隠れるようになりました。以前は一時停止したときしか隠れませんでした。オーバーレイはプレーヤーの枠が画面上のどこにあるかだけで表示可否を判定しており、ドッキングされた枠は完全に画面内にあるためです。意図的に開いたミニプレーヤーのオーバーレイは維持され、この仕組みで隠れたオーバーレイも、ページがプレーヤーを通常の位置に戻せば復帰します。',
    'Kanji inside subtitle words no longer look darker than the rest of the word. The highlight was painted twice over the kanji run, once for the word and once for an inner wrapper, and the two translucent layers stacked.': '字幕内の漢字が同じ単語の他の部分より濃く見えることがなくなりました。ハイライトが漢字の部分にだけ、単語用と内側のラッパー用の2回描かれ、半透明の層が2枚重なっていました。',
    'Some words on dark pages no longer show a noticeably darker highlight than their neighbours until hovered, with the same problem inverted on light pages. Words carrying no colour of their own were losing the sampled page background that every other word mixes its highlight against. Relatedly, a text colour changed by hovering now always reverts when the pointer leaves instead of occasionally sticking.': 'ダークモードのページで一部の単語だけが周囲より目立って濃いハイライトになり、ホバーするまで直らない問題が解消されました（明るいページでは逆方向に発生していました）。固有の色を持たない単語が、他のすべての単語がハイライトを混色する際の基準となるページ背景のサンプルを失っていたためです。関連して、ホバーで変わった文字色が稀に戻らなくなることがありましたが、ポインタが離れれば必ず元に戻るようになりました。',
    'The meaning section of the study card no longer gets stuck showing a translating message forever. When the translation request travelled through a transport that ignored its time limit, a lost message meant the request never finished; the reader now enforces its own deadline and moves on. Sections that finish empty now also hide reliably.': '学習カードの意味セクションが翻訳中の表示のまま永久に止まることがなくなりました。翻訳リクエストが制限時間を無視する経路を通ると、メッセージが失われた時点でリクエストが完了しなくなっていましたが、リーダー自身が期限を強制して先へ進むようになりました。空のまま完了したセクションも確実に非表示になります。',
    'Yomu now goes properly to sleep in background tabs. Several internal observers and timers kept working at full rate while a tab was hidden, which drained battery and warmed the device; they now pause when the tab is hidden and catch up once when it returns.': 'バックグラウンドのタブでYomuが正しく休止するようになりました。タブが隠れている間もいくつかの内部監視やタイマーが全速で動き続け、バッテリーを消耗させ端末を熱くしていましたが、タブが隠れると停止し、戻ったときに一度だけ追いつくようになりました。',
    'The account menu on the Yomu website itself is now annotated like the rest of the page.': 'Yomuのウェブサイト自体のアカウントメニューも、ページの他の部分と同じように注釈されるようになりました。',
    "Scrolling inside Yomu's own panels, such as Settings, no longer stutters on a page full of furigana. Every scroll anywhere on the page made Yomu re-measure the position of every reading it had drawn, including scrolls inside its own windows, which cannot move page text at all. On a manga page carrying hundreds of readings that was a full re-measure per frame of scrolling. Yomu now re-measures only when the thing being scrolled actually holds readings, so page scrolling keeps following the text exactly as before.": '設定などYomu自身のパネル内でのスクロールが、ふりがなの多いページでも引っかからなくなりました。これまではページ上のどこでスクロールしても、描画済みのすべての読みの位置をYomuが測り直していました。Yomu自身のウィンドウ内のスクロールは本文を動かさないにもかかわらず対象に含まれていたため、数百の読みがあるマンガのページでは、スクロールの1フレームごとに全体の再計測が発生していました。現在は、スクロールされた対象が実際に読みを含んでいる場合にのみ測り直すため、ページのスクロールはこれまでどおり本文に追従します。',
    'The providers inside an audio source URL now actually appear in Settings. Opening Media asks the source which providers it offers, so the list fills in, where before it stayed empty unless you happened to play a word in that same tab first.': '音声ソースURLに含まれる提供元が、設定に実際に表示されるようになりました。メディアを開くとそのソースがどの提供元を提供しているかを問い合わせるため、一覧が自動的に埋まります。以前は同じタブで先に単語を再生していない限り、一覧は空のままでした。',
    'Those providers are now listed once each, by name. The hosted source labels every individual clip rather than every source, so one lookup came back as nhk16 ニホ＼ン [2], daijisen にほ＼ん [2], forvo_jp akitomo, and more. Yomu now groups them into nhk16, daijisen, forvo_jp and jpod — one checkbox each, which still means the same thing for every other word instead of changing with the reading, pitch, or Forvo speaker. Turning one off drops all of its clips.': '提供元は名前ごとに1つずつ表示されるようになりました。ホスト型ソースはソース単位ではなく音声クリップ単位で名前を付けるため、ある単語の検索結果はnhk16 ニホ＼ン [2]、daijisen にほ＼ん [2]、forvo_jp akitomoなどとなっていました。Yomuはこれらをnhk16、daijisen、forvo_jp、jpodにまとめ、それぞれ1つのチェックボックスとして表示します。読み方やアクセント、Forvoの話者によって変わることがなくなり、ほかのどの単語でも同じ意味を保ちます。オフにすると、その提供元のクリップはすべて使われなくなります。',
    'in the Study Type step accepts drawing again, including for WaniKani vocabulary reviews. A stale pre-reveal guard made the canvas visible but prevented it from receiving finger, Pencil, stylus, or mouse input; the guard now leaves the active Type handwriting surface interactive while retaining its protection for inactive doodle surfaces.': 'をStudyのTypeステップで再び描けるようにし、WaniKaniの語彙復習にも対応しました。古い回答表示前の保護処理によりキャンバスは見えていても指、Apple Pencil、スタイラス、マウスの入力を受け取れなくなっていました。現在は、使用中のType手書き面では入力でき、使用していない手書き面に対する保護はそのまま維持されます。',
    'Manga pages on BookWalker no longer stop scanning after a few pages of reading. BookWalker only signs each page image for about a minute and fetches upcoming pages ahead of you, so reading at a normal pace meant Yomu was asking for pictures whose access had already lapsed; every page then reported that its text could not be read until the reader was reloaded. Yomu now renews that access when it has lapsed, so pages keep scanning however slowly you read.': 'BookWalkerのマンガのページが、数ページ読んだあとにスキャンされなくなる問題を修正しました。BookWalkerは各ページ画像へのアクセス許可を約1分しか発行せず、先のページを先読みして取得します。そのため普通の速さで読んでいると、Yomuは有効期限の切れた画像を要求することになり、リーダーを再読み込みするまで、どのページも本文を読み取れないと表示していました。Yomuは期限が切れたアクセス許可を取り直すようになったため、どれだけゆっくり読んでもページのスキャンが続きます。',
    'Furigana on pages that hold their own layout, such as the cookie notice on BookWalker, no longer freeze in place in Firefox. A repositioning step failed on the very first scroll and never recovered, leaving readings where they were first drawn.': 'BookWalkerのクッキー通知のように独自の配置を保つ領域で、ふりがながFirefoxで固定されたままになる問題を修正しました。位置を更新する処理が最初のスクロールで失敗し、その後も回復しなかったため、読みが最初に描画された場所に残っていました。',
    'Scrolling a BookWalker book is smoother. Yomu was re-examining every page surface on screen each time any part of the page repainted, and re-reading whole page images it had already found it could not read.': 'BookWalkerの本のスクロールが滑らかになりました。これまでは画面のどこかが再描画されるたびに、表示中のすべてのページ面を調べ直し、読み取れないと分かっている画像全体を繰り返し読み込んでいました。',
    'The providers bundled inside an audio source URL are now listed on their own, with no button to press. Yomu remembers which providers each URL hands out as you look words up, so the list fills itself in from audio you were playing anyway, and it appears straight away when you open Settings or press Preview. A URL Yomu has not heard from yet is checked once in the background when you finish typing or pasting it, switch a source to Custom URL, or switch one on — the moments you are actually asking about that source. Opening Settings never contacts an audio source by itself, so a private or company audio server is only ever reached when you ask for it. The per-provider checkboxes, the overlap markers, and the saved choices behave exactly as before; only the manual detection step is gone.': '音声ソースURLに含まれる提供元が、ボタンを押さなくても一覧表示されるようになりました。単語を調べるたびに、それぞれのURLがどの提供元を返したかをYomuが記憶するため、もともと再生していた音声から一覧が自動的に埋まり、設定を開いたときや試聴を押したときにすぐ表示されます。まだ応答を受け取っていないURLについては、入力や貼り付けを終えたとき、ソースをカスタムURLに切り替えたとき、ソースをオンにしたときという、そのソースについて実際に尋ねている場面に限り、バックグラウンドで一度だけ問い合わせます。設定を開いただけで音声ソースに接続することはないため、プライベートな音声サーバーや社内サーバーには、ユーザーが求めたときにのみアクセスします。提供元ごとのチェックボックス、重複の表示、保存された設定はこれまでと同じ動作で、手動での検出操作だけがなくなりました。',
    "Audio source URLs that bundle several providers can now be inspected and controlled per provider. Aggregator endpoints such as the built-in hosted Yomu source answer a single lookup with clips from several named providers — Yomu's own hosted recordings plus a JapanesePod101 fallback, for example — and until now the whole URL could only be kept or dropped as one block. Every Custom URL row under Settings → Media → Audio sources now has a Detect included sources button that probes the URL with sample lookups and lists every provider it reports, each with its own checkbox. Clips from unticked providers are skipped during playback, and providers that appear later stay enabled until you switch them off, so nothing silently disappears.": '複数の提供元をまとめた音声ソースURLを、提供元ごとに確認してオン・オフできるようになりました。内蔵のYomuホスト音声のような集約エンドポイントは、1回の検索に対して複数の名前付き提供元のクリップ（たとえばYomu自身のホスト録音とJapanesePod101のフォールバック）を返しますが、これまではURL全体を一括で使うか外すかしか選べませんでした。設定 → メディア → 音声ソースの各カスタムURL行に「内部ソースを検出」ボタンが追加され、サンプル検索でそのURLが報告する提供元を一覧化し、それぞれにチェックボックスが付きます。チェックを外した提供元のクリップは再生時にスキップされ、後から現れた提供元はオフにするまで有効のままなので、音声が黙って消えることはありません。',
    'The provider list also marks entries that duplicate another enabled row in the audio source list, such as the JapanesePod101 provider inside the hosted source sitting next to the stand-alone JapanesePod101 row, so overlapping sources are visible at a glance and either the provider checkbox or the duplicate row can be switched off.': '提供元リストでは、音声ソース一覧の別の有効な行と重複する項目（たとえばホストソース内のJapanesePod101と、単独のJapanesePod101行）に印が付くようになり、重複がひと目で分かるため、提供元のチェックか重複行のどちらかをオフにして二重再生を避けられます。',
    "Your accent colour is now painted before the page appears, so yomureader.com no longer flashes its default green before switching to your colour. The accent used to be applied only once the page's scripts had downloaded and run, leaving the built-in green on screen for the first frames of every cold or slow load. The accent, and the light or dark theme it is derived against, are now resolved and applied while the page is still being parsed. The Study page, PDF reader, and video player were fixed the same way, from the one shared definition the rest of the interface already uses, so no surface can drift back to its own copy.": 'アクセントカラーがページの表示前に適用されるようになり、yomureader.comで既定の緑が一瞬表示されてから選んだ色に切り替わることがなくなりました。これまではページのスクリプトが読み込まれて実行された後でしかアクセントが適用されず、初回や低速な読み込みでは最初の数フレームのあいだ内蔵の緑が画面に残っていました。アクセントカラーと、その配色の基準となるライト／ダークテーマは、ページの解析中に決定して適用するようになりました。Studyページ、PDFリーダー、動画プレーヤーも同じ方法で修正し、インターフェースの他の部分と同じ唯一の定義を共有しているため、どの画面も独自の実装に戻ってしまうことはありません。',
    'Furigana readings now stay glued to their words throughout a scroll on tablets and other touch devices, including the fast flings where the previous release could still leave them adrift. The readings are painted in a reader-owned layer floating above the page, and until now that layer was pinned to the screen rather than to the page, so every reading\'s position had to be rewritten by the reader on every single scroll frame. A touch device scrolls the page on its own without waiting for that work, so any frame where the rewrite arrived late showed the readings sitting where the words used to be. Readings belonging to ordinary page text are now placed in page coordinates instead of screen coordinates, so the device carries a reading and its word together as one, with no per-frame work to fall behind on. Readings inside a scrolling panel, a pinned header, or any other separately moving region keep the previous screen-anchored behaviour, which is correct for them.': 'タブレットなどのタッチ端末でスクロールしている間、ふりがなの読みが単語に固定され続けるようになりました。前回のリリースでも残っていた、勢いよくスクロールしたときのズレも解消しています。読みはページの上に浮かぶリーダー専用のレイヤーに描画されますが、これまでそのレイヤーはページではなく画面に固定されていたため、すべての読みの位置を毎スクロールフレームごとにリーダー側で描き直す必要がありました。タッチ端末はその処理を待たずに自力でページをスクロールするため、描き直しが間に合わなかったフレームでは、読みが単語のあった場所に取り残されて見えていました。通常のページ本文に属する読みは画面座標ではなくページ座標に配置されるようになり、端末が読みと単語をひとつのものとして一緒に動かすため、遅れの原因となるフレームごとの処理そのものがなくなりました。スクロールする小さな領域や固定ヘッダーなど、独立して動く領域の中にある読みは、それが正しい挙動であるため従来どおり画面を基準に追従します。',
    'Furigana annotations no longer detach or drift off words while scrolling on tablets and performance-constrained devices. The visible readings were being re-evaluated for page occlusion on every single scroll frame using expensive element inspection; during fast scrolling, main-thread slowdowns dropped refresh frames, temporarily hiding readings until scrolling stopped. Occlusion checks are now cached across frames during pure scrolling and degraded smoothly under heavy load, and transient measurement gaps retain the last painted position for several frames so readings stay glued to their text throughout continuous scrolling.': 'タブレットや処理性能が制限された端末でスクロールした際、ふりがな注釈が単語から外れたりズレたりすることがなくなりました。表示中の読みは毎スクロールフレームで負荷の高い要素検査による遮蔽判定を行っていたため、高速スクロール時にメインスレッドが圧迫されると描画更新が落ち、スクロールが止まるまで一時的に読みが消えていました。通常のスクロール中は遮蔽判定の結果をフレーム間で保持し、高負荷時にも段階的に処理を分散するほか、一時的な測定漏れが生じても数フレーム間は前回の描画位置を維持することで、連続スクロール中も読みがテキストに固定され続けるようになりました。',
    'Framework-driven web applications like YouTube, React, Vue, and Angular dashboards no longer experience heavy main-thread background thrashing from continuous furigana re-checks. Internal annotation changes and unrelated page updates previously triggered document-wide projection refreshes; environmental DOM updates are now filtered to ignore the reader\'s own annotation writes and unrelated page subtrees.': 'YouTube、React、Vue、Angularで構築されたダッシュボードなどのフレームワーク駆動Webアプリケーションにおいて、連続するふりがな再チェックによるメインスレッドのバックグラウンド負荷が解消されました。従来は内部の注釈更新や無関係なページの変更によってドキュメント全体の投影再処理が誘発されていましたが、環境のDOM変更検知を絞り込み、リーダー自身の注釈書き込みや無関係なDOMサブツリーの変更を無視するよう改善しました。',
    'The Firefox add-on package can be reviewed again. Its content script was a few hundred kilobytes over the size Mozilla is willing to parse, so every submission was rejected before a reviewer saw it; the packaged script no longer carries the wrapper indentation that pushed it over, which also restores the exact multi-line text the reader builds. The Chrome and Safari packages are unchanged.': 'Firefoxアドオンのパッケージが再び審査を受けられるようになりました。コンテンツスクリプトがMozillaの解析できる上限を数百キロバイト超えていたため、審査担当者が見る前にすべての申請が却下されていました。パッケージ化されたスクリプトから、上限を超える原因になっていたラッパーのインデントを取り除き、あわせてリーダーが生成する複数行のテキストも本来のとおりに戻しました。ChromeとSafariのパッケージに変更はありません。',
    'Turning off Prefer Japanese site language now stays off on every site. The choice is stored once for the whole browser, but each site also kept its own copy of it, and that copy was read first: any site opened while the preference was on stayed pinned to on, so it had to be turned off again on every site, forever. The shared setting now wins everywhere, and a site that has not heard about the change yet corrects itself as soon as it loads.': '「サイトの言語と地域を日本優先にする」をオフにすると、すべてのサイトでオフのままになります。この設定はブラウザー全体で一度だけ保存されますが、各サイトも独自の控えを持っていて、そちらが先に読まれていました。そのため、設定がオンのときに一度でも開いたサイトはオンに固定され、サイトごとに何度もオフにし直す必要がありました。今後は共有された設定がどこでも優先され、まだ変更を受け取っていないサイトも読み込んだ時点で自動的に直ります。',
    'Turning the preference off now also leaves the Japanese URL it sent you to, instead of stranding you on a page that stays Japanese. Reddit\'s locale=ja-JP, YouTube\'s hl and gl, a leading /ja/ or /ja-jp/ path and the other Japanese locale markers are removed; when the page offers its own default-language link, that link is used instead.': '設定をオフにすると、転送先だった日本語URLからも離れるようになり、日本語のままのページに取り残されることがなくなりました。Redditのlocale=ja-JP、YouTubeのhlとgl、先頭の/ja/や/ja-jp/のパスなど、日本語ロケールを指定する印を取り除きます。ページ自身が既定言語へのリンクを用意している場合は、そのリンクを使います。',
    'Unticking Prefer Japanese site language in Settings, or turning it off in another tab, now undoes the Japanese URL exactly like the puck\'s toggle already did. Saving any unrelated setting still leaves a Japanese page you opened yourself alone.': '設定画面で「サイトの言語と地域を日本優先にする」のチェックを外したときや、別のタブでオフにしたときも、パックの切り替えと同じように日本語URLを元に戻すようになりました。関係のない設定を保存しただけのときは、自分で開いた日本語のページはそのままにします。',
    'Turning the preference back on redirects the site again in the same tab. The once-per-site guard that stops redirect loops was never cleared when the preference was switched off, so switching it on again quietly did nothing until the tab was closed.': '設定をオンに戻すと、同じタブでもサイトがもう一度転送されるようになりました。転送の繰り返しを防ぐためのサイトごとの一度きりの制御が、設定をオフにしても解除されないままだったため、オンに戻してもタブを閉じるまで何も起きませんでした。',
    'Embedded frames are no longer sent to their own Japanese URL. An embedded player, comment box or sign-in frame could navigate itself out from under the page it belongs to; Japanese locale hints still apply inside frames, only the redirect is now reserved for the tab you are looking at.': '埋め込みフレームが単独で日本語URLへ転送されることがなくなりました。埋め込みの再生プレーヤー、コメント欄、サインイン用のフレームが、属しているページの下で勝手に移動してしまうことがありました。フレーム内でも日本語ロケールの指定は引き続き適用され、転送だけを実際に見ているタブに限定します。',
    'Furigana and other projected readings now stay anchored to their source text while scrolling inside YouTube and other dynamic web components. The shared viewport renderer follows the source\'s composed tree across nested and slotted shadow roots, and migrates its listeners when frameworks move existing text, so readings no longer follow the viewport after their source moves.': 'YouTubeなどの動的なWebコンポーネント内をスクロールしても、ふりがななどの投影された読みが元のテキストに追従するようになりました。共通のビューポート描画処理は、入れ子やスロット配置されたShadowRootを含む元テキストの合成ツリーをたどり、フレームワークが既存テキストを移動した際にも監視先を移すため、元のテキストが移動した後に読みだけが古い画面位置へ残りません。',
    'On iPad, the Meaning under a study Translation card no longer gets stuck on Translating forever. A local dictionary lookup that never returned on iPad Safari used to strand it; the Meaning now appears, or the section hides when there is nothing to translate, as soon as the translation is ready, and a stalled lookup can no longer freeze sentence parsing for reading, hover lookups, or page annotation.': 'iPadで、学習用の翻訳カードの「意味」欄が「Translating」の表示のまま止まってしまうことがなくなりました。iPad Safariでローカル辞書の検索が返らないと意味欄が読み込み中のまま取り残されていましたが、翻訳が用意でき次第すぐに意味を表示するか、訳すものがなければその欄を隠すようになり、検索が止まっても本文の読み取り・ホバー辞書・ページ注釈のための解析が固まることはなくなりました。',
    'Words with two pitch-accent readings no longer leave an empty band at the top of the dictionary popup. The compact two-graph pitch block now sits in the top-right beside the play button, the same place a single graph already used, instead of dropping to its own centred row; blocks that are genuinely too wide (three readings, long readings, or multi-part expressions) still move to a full-width row, and every block does so on very narrow popups so the headword is never squeezed.': '2つのピッチアクセント読みを持つ単語で、辞書ポップアップの上部に空白の帯が残らなくなりました。コンパクトな2グラフのピッチ表示は、独立した中央寄せの行に落ちる代わりに、これまで単一グラフが置かれていたのと同じ右上の再生ボタン横に配置されます。本当に幅の広いブロック（3つの読み、長い読み、複数要素からなる表現）は引き続き全幅の行へ移動し、すべてのブロックは非常に狭いポップアップでは見出し語を圧迫しないよう全幅の行へ移動します。',
    'Interface command buttons such as Reddit\'s 質問, 参加, 共有, and アワードを贈る now stay bare at rest, showing their furigana and pitch only on hover or keyboard focus. Tapping still opens the dictionary popup. Post titles, body text, community links, and metadata keep their annotations at rest.': 'Redditの質問・参加・共有・アワードを贈るのような操作用のコマンドボタンは、待機時に注釈を表示せず、ふりがなとピッチをホバー時またはキーボードフォーカス時にのみ表示するようになりました。タップすれば引き続き辞書ポップアップが開きます。投稿タイトル、本文、コミュニティのリンク、メタデータは、待機時も注釈を表示し続けます。',
    'On iPad, the settings puck now keeps its intended size and follows the finger after rotating portrait → landscape → portrait. Viewport scale is reconciled after orientation settles, and drag coordinates use the exact applied scale.': 'iPadで縦向き→横向き→縦向きと回転した後も、設定用パックが本来の大きさを保ち、指の動きに正確に追従するようになりました。向き変更後にビューポート倍率を再同期し、ドラッグ座標には実際に適用した倍率を使用します。',
    'Reader language profiles now separate the learner\'s definition language, the English/Japanese interface, and the fixed Japanese Slice 1 target. Onboarding and Settings expose exactly 32 definition languages with explicit Simplified Chinese, Traditional Cantonese, Latin-script Serbo-Croatian, and Tagalog runtime identities.': 'Readerの言語プロファイルで、利用者の辞書定義言語、英語／日本語のインターフェース、Slice 1で日本語に固定された学習対象を個別に扱うようになりました。オンボーディングと設定には、簡体字中国語、繁体字広東語、ラテン文字のセルボ・クロアチア語、タガログ語の実行時IDを明示した、正確に32の定義言語が表示されます。',
    'Settings recommends a native-language Japanese dictionary where the frozen catalogue has one and an explicit English fallback otherwise. The published catalogue contains 186 entries backed by 167 immutable SHA-256 objects, with a ready recommendation manifest for every Slice 1 language.': '設定では、凍結済みカタログにその言語向けの日本語辞書がある場合は母語の辞書を推奨し、ない場合は英語へのフォールバックを明示します。公開カタログには、不変のSHA-256オブジェクト167件で構成される186件のエントリーがあり、Slice 1の全言語に対応する準備完了済みの推奨マニフェストを収録しています。',
    'Non-native local, Jiten, JPDB, Bunpro, and WaniKani definitions can be translated automatically per source. Translation is off by default, sends only selected definition or gloss text to Google Translate, appears before the untouched original, and fails without hiding the source definition. Personal WaniKani notes, mnemonics, readings, account state, and controls are excluded. Ancient Greek keeps its dictionaries and original definitions without offering Google\'s unavailable target.': '母語と一致しないローカル、Jiten、JPDB、Bunpro、WaniKaniの定義は、ソースごとに自動翻訳できます。翻訳は既定でオフで、選択した定義または語釈のテキストだけをGoogle翻訳へ送信し、変更していない原文より先に表示します。翻訳に失敗しても元の定義は隠しません。WaniKaniの個人メモ、記憶術、読み、アカウント状態、操作項目は送信対象外です。Googleが翻訳先として提供していない古代ギリシア語では、辞書と元の定義をそのまま利用します。',
    'Sentence translation now follows the active learner/definition language instead of treating the English/Japanese interface choice as the translation target. Subtitle translation respects the language chosen for the translated track instead of forcing English.': '例文翻訳は、英語／日本語のインターフェース選択を翻訳先として扱わず、有効な利用者／定義言語に従うようになりました。字幕翻訳は英語を強制せず、翻訳トラックで選んだ言語を尊重します。',
    'Dynamic page text now uses one generic live-range projection path across YouTube, Reddit, consent pages, compact controls, and open web components. The previous site-specific clip opening and passive-control exceptions were removed; enabled furigana, pitch, status, and lookup annotations remain visible without reflowing or resizing page UI.': 'YouTube、Reddit、同意画面、コンパクトなコントロール、オープンなWebコンポーネントを含む動的なページテキストは、サイト共通のライブRange投影経路を使うようになりました。サイト固有のクリップ解除とパッシブコントロールの例外を削除し、有効なふりがな、ピッチ、状態、検索用の注釈を、ページUIの折り返しや寸法を変えずに表示します。',
    'Furigana is centred over its exact source characters, while pitch/status underlines and highlights follow the same measured word fragments with no detached gap. Opaque menus hide only the readings behind them, then restore the background cleanly after closing; compact labels no longer collapse into ellipses or bunch repeated readings together.': 'ふりがなを対応する元の文字の真上に中央揃えし、ピッチ・状態の下線とハイライトも同じ計測済みの単語断片に隙間なく追従します。不透明なメニューは背後にある読みだけを隠し、閉じると背景の注釈を正しく復元します。コンパクトなラベルが省略記号へ崩れたり、繰り返しの読みが一か所に重なったりしません。',
    'Sparse late parses can no longer erase a complete compound reading or pitch pattern. Bounded public Jiten hydration finishes the current small annotation target, so multi-token labels retain complete facts without unbounded requests.': '後から届く情報の少ない解析結果が、完成済みの複合語の読みやピッチ型を消さなくなりました。公開Jitenの上限付き補完は現在の小さな注釈対象を最後まで処理するため、複数トークンのラベルでも、無制限なリクエストを行わず完全な情報を保持します。',
    'A subtitle position saved below a shorter video remains usable there, but is temporarily rebased into the visible viewport when the next player is a full-height Short. The preferred position is preserved and returns when it is reachable again.': '短い動画の下側に保存した字幕位置はその動画では引き続き使えますが、次のプレイヤーが全画面高のショートの場合は、一時的に見える画面内へ戻します。保存した希望位置は保持され、再び到達可能になれば元の位置へ戻ります。',
    'Multiline detached-furigana lanes now retain a visible interline gap across subpixel font rasterization differences in Chromium and WebKit, while single-line text and constrained controls keep their authored dimensions.': '複数行の分離ふりがな表示では、ChromiumとWebKitのサブピクセル単位のフォント描画差があっても見える行間を維持します。一方、1行のテキストや寸法が制約されたコントロールは、ページ本来の大きさを保ちます。',
    'Multiline framework-owned prose now reserves measured room for detached furigana, while clipped previews, titles, and compact controls retain the page\'s dimensions. The shared source-projection path also removes the duplicate pale underline and keeps late compound pitch such as': 'フレームワークが管理する複数行の文章では、分離表示するふりがなのために計測済みの行間を確保する一方、クリップされたプレビュー、タイトル、コンパクトなコントロールはページ本来の寸法を維持します。共通のソース投影経路によって重複した薄い下線も取り除き、',
    'continuous across wrapped fragments.': 'のような後から補完される複合語のピッチも、折り返された断片をまたいで連続表示します。',
    'Detached readings now clear rounded chip and tab edges instead of sitting flush with the clipping boundary. The geometry is shared across sites and verified in Chromium and WebKit.': '分離表示する読みは、クリップ境界に密着せず、角丸のチップやタブの縁を越えて十分な余白を持つようになりました。この配置はサイト間で共通で、ChromiumとWebKitの両方で検証済みです。',
    'Reader-account devices and Academy profiles now share one bounded encrypted export without mixing their independent event cursors. The export freezes both logs, streams Academy then Reader history, includes revocable Reader credential metadata without bearer secrets, and counts both logs in deletion receipts.': 'ReaderアカウントのデバイスとAcademyのプロファイルは、独立したイベントカーソルを混在させず、1つの上限付き暗号化エクスポートにまとめられるようになりました。エクスポートは両方のログを固定し、Academy履歴、Reader履歴の順にストリーミングし、Bearerシークレットを含めずに取り消し可能なReader認証情報のメタデータを収録し、削除受領記録では両方のログを集計します。',
    "Aakash's approved v009 anime-style sprite family is now the runtime source across Academy surfaces; the superseded v005 family is archived outside the repository rather than retained as an active candidate.": 'Aakashの承認済みv009アニメ調スプライト一式をAcademyの各画面で使う正式なランタイム素材にしました。旧v005一式は有効な候補として残さず、リポジトリ外にアーカイブしています。',
    'The Academy production plan now treats the calendar as Day 1 through Day N. A day closes only after every required, optional, revisitable, one-off, social, study, exploration, minigame, and evening activity available on that date is implemented and verified; the 48 core chapters do not cap the calendar.': 'Academyの制作計画では、カレンダーをDay 1からDay Nまでとして扱うようになりました。その日に利用できる必須、任意、再訪可能、一度限り、交流、学習、探索、ミニゲーム、夜の各アクティビティをすべて実装・検証して初めて、その日を完了とします。48の主要チャプターはカレンダーの上限ではありません。',
    'Academy lifecycle proof deletion now requires an expiring, single-use server grant bound to the authenticated production test account and run nonce. The supervised proof compares the active immutable Worker version and script digest with a locally reproduced reviewed bundle, exports large encrypted histories through a bounded stream, protects export creation as a same-origin POST, and prunes 90-day receipts on an observable scheduled retry path.': 'Academyのライフサイクル検証で削除を行うには、認証済みの本番テストアカウントと実行nonceに紐づく、有効期限付き・一度限りのサーバー許可が必要になりました。監督付き検証では、稼働中の不変Workerバージョンとスクリプトダイジェストを、ローカルで再現したレビュー済みバンドルと比較し、大規模な暗号化履歴を上限付きストリームで書き出し、エクスポート作成を同一オリジンPOSTとして保護し、90日間の受領記録を観測可能なスケジュール再試行経路で削除します。',
    "Compact controls with nested layout wrappers or icons now count only real text lines when deciding whether detached furigana can safely escape authored clipping. This restores the complete furigana and pitch presentation on Reddit's": '入れ子のレイアウトラッパーやアイコンを持つコンパクトなコントロールでは、分離表示するふりがなが安全にクリップ領域の外へ出られるかを判断する際、実際のテキスト行だけを数えるようになりました。これにより、Redditの',
    'sort button and the same control structure on other sites, without a Reddit selector or host-specific branch.': '並べ替えボタンと、他サイトの同じ構造を持つコントロールで、ふりがなとピッチ表示が完全に復元されます。Reddit専用セレクターやホスト固有の分岐は使用していません。',
    'Repeated provisional parses can no longer replace a complete non-destructive annotation with missing readings or pitch. Richer and authoritative updates still replace it normally, so dynamic controls remain complete without freezing legitimate dictionary corrections.': '暫定的な再解析によって、完全な非破壊注釈が読みやピッチの欠けた表示に置き換わることはなくなりました。より豊富な情報や確定済みの更新は通常どおり反映されるため、正当な辞書修正を妨げずに動的コントロールの完全な表示を維持します。',
    'Removed the v1.6.406 Jiten detail-limit overrun and restored the ordinary bounded hydration path. Completeness is now enforced in the generic render and clip path instead of requesting past the configured limit.': 'v1.6.406で追加したJiten詳細取得上限の超過処理を削除し、通常の上限付き取得経路に戻しました。設定上限を超えて取得するのではなく、汎用の描画・クリップ経路で完全性を保証します。',
    'Framework-owned text now uses the normal Yomu highlight only on each measured word fragment. The redundant full-mirror highlight was removed, preventing large coloured rectangles across YouTube descriptions while preserving furigana, pitch underlines, and the same generic annotation path on other sites.': 'フレームワークが管理するテキストでは、計測した各単語断片だけに通常のYomuハイライトを使うようになりました。重複していたミラー全体のハイライトを削除し、YouTubeの概要欄に大きな色付き矩形が出る問題を防ぎながら、ふりがな、ピッチ下線、他サイトと共通の汎用注釈経路を維持します。',
    'Type practice now uses a balanced tablet and desktop control scale: the answer field is narrower with restrained text, Check has a normal action-label size, secondary controls share consistent touch targets, and Type/Write clearly shows which mode is selected.': '入力練習では、タブレットとデスクトップの操作サイズを整えました。解答欄は文字と幅を抑え、確認ボタンは通常のアクションラベルサイズにし、補助操作のタップ領域を揃え、入力・手書きのどちらが選択中か明確に表示します。',
    'Handwriting now keeps kana visible as scaffolding and grades only the kanji in mixed words. 飲み物 appears as ＿み＿ and advances from 飲 directly to 物. Kana-only words stay in Type mode with the unavailable Write option disabled.': '手書きでは、混合表記のかなを手がかりとして表示したまま漢字だけを採点します。飲み物は＿み＿と表示され、飲から直接物へ進みます。かなだけの単語は入力モードのままになり、利用できない手書き操作は無効になります。',
    'Produce the word': '単語を再現する',
    '— type its spelling or reading, or choose': '— 表記または読みを入力するか、',
    'Write': '手書き',
    'to draw its kanji with a finger, Pencil, stylus, or mouse before the reveal. This works for every Study source, including WaniKani. Mixed words keep kana in place: 飲み物 becomes ＿み＿. Kana-only words stay in typing mode.': 'を選び、答えを表示する前に指、Apple Pencil、スタイラス、またはマウスで漢字を書きます。WaniKaniを含むすべてのStudyソースで利用できます。混合表記ではかなをそのまま表示し、飲み物は＿み＿になります。かなだけの単語は入力モードのままです。',
    'A fresh standalone session starts at its first enabled learning step —': '新しい単独セッションは、有効な最初の学習ステップ（',
    'Kanji 1': 'Kanji 1',
    'by default — before moving through the rest of the sequence.': 'が既定）から始まり、残りの順序へ進みます。',
    'Short controls, menu rows, and other compact annotation targets now finish Jiten detail hydration when the normal request cap lands inside a multi-token label. Furigana and pitch underlines no longer stop partway through compounds such as': '短いコントロール、メニュー行、その他のコンパクトな注釈対象では、通常のリクエスト上限が複数トークンのラベル途中に達しても、Jitenの詳細取得をその対象の最後まで完了するようになりました。ふりがなとピッチ下線が、次のような複合ラベルの途中で止まらなくなります：',
    'or replace only the first half of': 'また、次のラベルの前半だけが置き換わることもありません：',
    '; the bounded fix applies to the same structure on every site.': '。この上限付き修正は、すべてのサイトで同じ構造に適用されます。',
    "Website account controls and Yomu Gaming's native backup controls now mount relative to their direct container even when the target UI is nested, preventing account setup from breaking alternate navbar and settings shells.": 'WebサイトのアカウントコントロールとYomu Gamingのネイティブバックアップ操作が、対象UIが入れ子の場合でも直接のコンテナを基準に安全に追加されるようになり、アカウント設定によって別形式のナビゲーションバーや設定シェルが壊れないようにしました。',
    'Create a Yomu account and sync Academy words (optional)': 'Yomuアカウントを作成してAcademyの単語を同期する（任意）',
    'Permalink to "Create a Yomu account and sync Academy words (optional)"': '「Yomuアカウントを作成してAcademyの単語を同期する（任意）」への固定リンク',
    'You do not need an account for lookup, local dictionaries, or local Study. If you want the Academy/local SRS deck to stay synchronized between paired Readers:': '検索、ローカル辞書、ローカルStudyにアカウントは必要ありません。Academy・ローカルのSRSデッキをペアリング済みReader間で同期する場合は、次の手順を行います。',
    'yomureader.com': 'yomureader.com',
    'and choose': 'を開き、',
    'Create account': 'アカウント作成',
    'Sign in': 'サインイン',
    'in the navigation. The control changes to': 'をナビゲーションで選びます。Googleとの連携が完了すると、コントロールは',
    'Signed in as _your name_': '「_あなたの名前_としてサインイン中」',
    'when Google linking finishes. English and Japanese interface modes show the same account state and actions.': 'に変わります。英語と日本語のどちらのインターフェースでも、同じアカウント状態と操作が表示されます。',
    'Profile & sync': 'プロフィールと同期',
    'and initialize the profile if asked. Choose the pairing action to create a one-time code; it expires after ten minutes and can be used once.': 'を開き、求められた場合はプロフィールを初期化します。ペアリング操作を選ぶと、10分後に期限切れとなり1回だけ使えるコードが作成されます。',
    'In the userscript or browser extension, open': 'ユーザースクリプトまたはブラウザ拡張機能で、',
    'Study → Settings → Backup & sync': 'Study → 設定 → バックアップと同期',
    ', paste the code under': 'を開き、',
    'Academy account sync': 'Academyアカウント同期',
    ', and choose': 'にコードを貼り付け、',
    '. Firefox may first ask for its optional account-information permission; if the prompt cannot open on the current webpage, repeat this step from the extension\'s bundled Study page.': 'を選びます。Firefoxでは最初に任意のアカウント情報権限を求められる場合があります。現在のWebページで確認画面を開けない場合は、拡張機能に同梱されたStudyページからこの手順をやり直してください。',
    'Check that Settings shows': '設定に',
    'Connected as _your name_': '「_あなたの名前_として接続中」',
    'and a last-sync time. Academy cards, grades, due states, deletions, highlights, and mining changes now reconcile through the encrypted account profile.': 'と最終同期時刻が表示されることを確認します。Academyカード、評価、期限状態、削除、ハイライト、採掘の変更は、暗号化されたアカウントプロフィールを通じて調整されます。',
    'A free Reader account provides account identity and encrypted Reader sync only. It does not grant access to the Academy curriculum. If the website key is lost but a paired Reader survives, choose': '無料のReaderアカウントが提供するのは、アカウントの識別と暗号化されたReader同期だけです。Academyカリキュラムへのアクセス権は付与されません。Webサイトの鍵を失ってもペアリング済みReaderが残っている場合は、Reader設定で',
    'Create website recovery code': 'Webサイト復旧コードを作成',
    'in Reader Settings and enter that code on Profile & sync. You can also list or revoke Readers, export the encrypted profile/account data, delete learning-profile data, or delete the entire account there.': 'を選び、そのコードを「プロフィールと同期」で入力します。そこではReaderの一覧表示や解除、暗号化されたプロフィール・アカウントデータのエクスポート、学習プロフィールデータの削除、アカウント全体の削除もできます。',
    'Study lookup headers no longer repeat a bare frequency value such as': 'Studyの検索見出しで、次のようなラベルなし頻度値を重複表示しないようにしました。',
    ', and Japanese readings are rendered as furigana on the word instead of as a trailing kana label.': '。日本語の読みは後続のかなラベルではなく、単語上のふりがなとして表示されます。',
    'The Yomu website now offers Create account and Sign in controls, shows the current signed-in name, and links directly to Profile & sync. A free Reader account can pair the userscript or browser extension and keep the Academy/local Study deck encrypted and synchronized across devices; Academy curriculum access remains a separate entitlement.': 'YomuのWebサイトに「アカウント作成」と「サインイン」を追加し、現在サインイン中の名前を表示して「プロフィールと同期」へ直接移動できるようにしました。無料のReaderアカウントでユーザースクリプトまたはブラウザ拡張機能をペアリングし、Academy・ローカルのStudyデッキを暗号化したまま端末間で同期できます。Academyカリキュラムへのアクセス権は別のままです。',
    'Reader Settings → Backup & sync can claim a one-time website pairing code, show the connected account and last-sync state, sync immediately, revoke the current Reader device, or create a recovery code that restores the website key from a surviving Reader.': 'Readerの「設定 → バックアップと同期」で、Webサイトの1回限りのペアリングコードの使用、接続中アカウントと最終同期状態の表示、即時同期、現在のReader端末の解除、残っているReaderからWebサイトの鍵を復旧するコードの作成ができるようになりました。',
    'Academy cards now carry their local SRS state, due date, highlighting, and swatch through reading pages and Study, with cross-tab repainting after mining, grading, remote updates, and deletions.': 'AcademyカードのローカルSRS状態、期限、ハイライト、色見本が閲覧ページとStudyに反映され、採掘、評価、リモート更新、削除後に開いているタブも再描画されるようになりました。',
    "Study's former Dictionary source is now Academy. JPDB appears in the source switcher only when a JPDB key is configured; a Jiten-only or keyless setup no longer advertises an unusable JPDB queue.": 'Studyの旧「Dictionary」ソースを「Academy」に変更しました。JPDBはJPDBキーが設定されている場合だけソース切り替えに表示されるため、Jitenのみまたはキー未設定の環境で使用できないJPDBキューが表示されなくなりました。',
    "Reader account sync uses client-side AES-256-GCM encryption. Yomu's Worker stores only hashed device credentials plus opaque encrypted card events and their delivery metadata; the 32-byte profile key remains on paired clients.": 'Readerアカウント同期はクライアント側のAES-256-GCM暗号化を使用します。YomuのWorkerが保存するのはハッシュ化した端末認証情報と不透明な暗号化カードイベントおよび配信メタデータだけで、32バイトのプロフィール鍵はペアリング済みクライアントに残ります。',
    'Study lookup headers no longer repeat a bare frequency value such as `#400`, and Japanese readings are rendered as furigana on the word instead of as a trailing kana label.': 'Studyの検索見出しで「#400」のようなラベルなし頻度値を重複表示しないようにし、日本語の読みを後続のかなラベルではなく単語上のふりがなとして表示するようにしました。',
    'Cross-device deck reconciliation now preserves the newest schedule or deletion even when events arrive out of order, and startup performs a full comparison so a missed cross-tab notification cannot strand a local card.': '端末間デッキの調整で、イベントが順不同に届いても最新のスケジュールまたは削除を保持するようにしました。起動時には完全比較を行い、タブ間通知を取りこぼしてもローカルカードが同期から漏れません。',
    'Source-projected annotations now keep their active underline and highlight colours inside shadow-root controls as well as ordinary page DOM. The projection layer passes the selected annotation paint to each exact source fragment, so web components no longer get correctly positioned but transparent pitch/status decoration.': 'ソース範囲へ投影する注釈が、通常のページDOMだけでなくShadow Root内のコントロールでも、有効な下線色とハイライト色を保つようになりました。投影レイヤーが選択中の注釈色を正確な各ソース断片へ渡すため、Web Componentsで位置は正しいのにピッチ・ステータス装飾だけが透明になることはありません。',
    'Layout regression coverage now enforces the new passive-annotation contract across Chromium and WebKit: furigana stays visible in buttons, metadata, clipped rows, and neighboring-text cases without changing the page\'s authored dimensions.': 'レイアウト回帰テストが、ChromiumとWebKitの両方で新しい受動注釈の契約を検証するようになりました。ページが指定した寸法を変えずに、ボタン・メタデータ・切り抜かれた行・隣接テキストがある場合でも、ふりがなは表示されたままになります。',
    'Removed an unused cache reset hook from the Jiten lookup performance work so the published source passes the repository dead-code gate.': 'Jiten検索の性能改善に残っていた未使用のキャッシュリセット用フックを削除し、公開ソースがリポジトリのデッドコード検査に合格するようにしました。',
    "Immersion Kit now appears inside Bunpro vocabulary and grammar pages, lesson cards, and revealed quiz or review answers, using the same in-page enhancement as jpdb and Jiten. It follows Bunpro's in-place SRS loop as the item changes, stays out of unrevealed question prompts, and removes the previous item's examples before the next question can appear.": 'Immersion KitがBunproの語彙・文法ページ、レッスンカード、そして答えを表示したクイズや復習画面の中にも表示されるようになりました。jpdbやJitenと同じページ内拡張を使用し、BunproのSRSで項目が切り替わるたびに追従します。未表示の問題プロンプトには一切出さず、次の問題が現れる前に前の項目の例文を取り除きます。',
    'The same Immersion Kit section can live directly inside jpdb, Jiten, and Bunpro. On Bunpro it follows vocabulary and grammar details, the lesson carousel, and the lesson-quiz or review SRS loop. Question prompts stay untouched; the section mounts only with revealed answer information and updates for the next item.': '同じImmersion Kitセクションを、jpdb・Jiten・Bunproのページ内に直接表示できます。Bunproでは語彙・文法の詳細、レッスンのカルーセル、レッスンクイズや復習のSRSループに追従します。問題プロンプトには手を加えず、答えの情報を表示したときだけセクションを追加し、次の項目に合わせて更新します。',
    'Overlapping Jiten parsing work is now coalesced into bounded provider batches. Page scans, subtitle preparation, and popup fallbacks that start together share one': '同時に発生するJitenの解析処理を、上限付きのプロバイダーバッチへまとめるようになりました。ページスキャン、字幕の事前処理、ポップアップのフォールバックが同時に始まっても、重複するテキスト行は1回の',
    'request per unique text row instead of each caller issuing its own lookup, while large payloads remain split and concurrency-limited.': 'リクエストを共有します。呼び出し元ごとに個別の検索は行わず、大きなペイロードは分割したうえで同時実行数を制限します。',
    'Repeated Jiten vocabulary details, searches, kanji facts, and kanji word pages now reuse a bounded session cache, including in-flight requests. Failed reads are evicted immediately so a transient outage can still heal on the next lookup.': 'Jitenの語彙詳細、検索、漢字情報、漢字語彙ページを繰り返し取得する際は、処理中のリクエストを含む上限付きセッションキャッシュを再利用するようになりました。取得に失敗した項目はすぐに破棄されるため、一時的な障害の後でも次の検索で復旧できます。',
    "Furigana, pitch underlines, and word highlights on framework-owned text now use the same source-range projection on every site. Yomu no longer injects wrap points or reflows a duplicate line, so annotations stay attached to their exact glyphs even when one Japanese word wraps across two lines; furigana sits directly above its kanji and the underline follows each real line fragment.": 'フレームワークが管理するテキストのふりがな・ピッチ下線・単語ハイライトは、すべてのサイトで同じソース範囲投影を使うようになりました。Yomuは改行位置を挿入したり複製した行を独自に折り返したりしないため、1つの日本語単語が2行にまたがる場合でも注釈が正しい文字に付き続けます。ふりがなは漢字のすぐ上に付き、下線は実際の各行断片に沿って表示されます。',
    'Enabled annotations no longer disappear from buttons, navigation, metadata, or other passive chrome because a collision heuristic considered their lane unsafe. Passive now controls interaction only, never visibility. YouTube-specific scanning is also restricted to actual YouTube app hosts, so consent.youtube.com and other ordinary pages use the standard in-flow annotation path.': '衝突判定が表示位置を安全でないと判断したために、ボタン・ナビゲーション・メタデータなどの受動的なUIから有効な注釈が消えることがなくなりました。「受動的」は操作方法だけを制御し、表示の有無には影響しません。YouTube専用スキャンも実際のYouTubeアプリのホストだけに限定され、consent.youtube.comなどの通常ページでは標準のインフロー注釈経路が使われます。',
    'Immersion example cards now include View on Immersion Kit and View on Nadeshiko links in popup lookup, Study, and enhanced jpdb/Jiten pages. Nadeshiko is also available as an optional Settings lookup pill, and its public website search needs no API key.': 'Immersionの例文カードに「Immersion Kitで見る」と「Nadeshikoで見る」のリンクが追加され、ポップアップ検索・Study・拡張されたjpdb/Jitenページで利用できるようになりました。Nadeshikoは設定で任意の検索ピルとしても選択でき、公開サイトの検索にはAPIキーが不要です。',
    'Immersion Kit no longer stops at the old untouched three-example default. Existing installs using that default move to All, popup and Study surfaces can keep up to 12 examples, and deliberately configured limits stay unchanged.': 'Immersion Kitが、以前の未変更の既定値である3例文で止まらなくなりました。その既定値を使っている既存環境は「すべて」に移行し、ポップアップとStudyでは最大12例文を保持できます。意図して設定した上限は変更されません。',
    'Blurred Immersion Kit translations now reveal reliably with one tap on phones and tablets, remain revealed after the finger lifts, and use a full-size touch target on coarse-pointer devices.': 'ぼかしたImmersion Kitの翻訳が、スマートフォンやタブレットで1回タップするだけで確実に表示され、指を離した後も表示されたままになりました。タッチ端末では十分な大きさのタップ領域も確保されます。',
    'Every Immersion example card also links to public searches on Immersion Kit and Nadeshiko. These links work without API keys in popup lookup, Study, and enhanced jpdb/Jiten/Bunpro pages; Nadeshiko is also available as an opt-in lookup pill in Settings.': 'すべてのImmersion例文カードから、Immersion KitとNadeshikoの公開検索へ移動できます。これらのリンクはポップアップ検索・Study・拡張されたjpdb/Jiten/BunproページでAPIキーなしに使えます。Nadeshikoは設定で任意の検索ピルとしても選択できます。',
    'On revealed review cards, Immersion Kit starts immediately in a centred, height-bounded 16:9 area with full-size phone controls. Jiten prefetches one exact current-card search behind the unrevealed question, reuses that same request on reveal, and leaves alternate/fallback searches until they are actually needed. It removes the previous card as soon as the next question appears and hydrates local and provider dictionaries independently after mounting the stable review shell. Installed and provider dictionaries keep the full content width, while ordinary detail pages keep their established layout.': '答えを表示した復習カードでは、Immersion Kitがスマートフォン向けの十分な大きさの操作を備えた、中央配置・高さ制限付きの16:9領域ですぐに始まります。Jitenでは答えを見せない問題面の裏で現在のカードを完全一致検索として1回だけ先読みし、答えの表示時には同じリクエストを再利用します。別表記やフォールバックの検索は本当に必要になるまで行いません。次の問題が現れた時点で前のカードを取り除き、安定した復習シェルを表示してからローカル辞書と各提供元の辞書を独立して読み込みます。インストール済み辞書と提供元辞書はコンテンツ幅いっぱいを保ち、通常の詳細ページは従来のレイアウトを維持します。',
    'Turning JPDB or Bunpro definitions off in Settings now persists and hides that definition panel. Lookup and frequency pills remain independently configurable.': '設定でJPDBまたはBunproの定義をオフにした状態が保存され、該当する定義パネルも非表示になります。検索ピルと頻度ピルは引き続き個別に設定できます。',
    'On reveal, Immersion Kit uses the same centred, height-bounded 16:9 review frame as jpdb, Jiten, and Bunpro, while dictionary panels keep the full card width. The carousel can retain up to 12 examples, its controls are full-size on phones and tablets, and a blurred translation stays revealed after one tap. View on Immersion Kit and View on Nadeshiko remain available as public searches without an API key.': '答えを表示すると、Immersion Kitはjpdb・Jiten・Bunproと同じ中央配置・高さ制限付きの16:9復習フレームを使い、辞書パネルはカード幅いっぱいを保ちます。カルーセルは最大12件の例文を保持でき、スマートフォンとタブレットでは操作が十分な大きさになり、ぼかした翻訳も1回のタップ後は表示されたままです。「Immersion Kitで見る」と「Nadeshikoで見る」は、APIキー不要の公開検索として引き続き利用できます。',
    'Immersion Kit now mounts immediately in a centred, height-bounded 16:9 area on revealed JPDB, Jiten, and Bunpro review cards, with the same compact treatment on Study. Other dictionaries retain the full card width, and ordinary detail pages keep their established layout.': '答えを表示したJPDB・Jiten・Bunproの復習カードで、Immersion Kitが中央配置・高さ制限付きの16:9領域にすぐ表示されるようになりました。Studyでも同じコンパクトな表示を使います。他の辞書はカード幅いっぱいを保ち、通常の詳細ページは従来のレイアウトを維持します。',
    'Jiten prefetches one exact current-card Immersion Kit search without exposing it on the question side, reuses that in-flight request on reveal, and leaves fallback fan-out until it is needed. Local and provider definitions then hydrate progressively after the stable review shell mounts.': 'Jitenでは問題面に答えを出さず、現在のカードに対するImmersion Kitの完全一致検索を1回だけ先読みします。答えを表示するときは処理中の同じリクエストを再利用し、フォールバックの複数検索は必要になるまで行いません。その後、安定した復習シェルを表示してからローカル定義と各提供元の定義を段階的に読み込みます。',
    'After visible review media decodes, the carousel warms at most one adjacent image; ordinary reader lookups do not make speculative media requests.': '表示中の復習メディアを読み込んだ後、カルーセルが先読みするのは隣接する画像1件までです。通常のリーダー検索ではメディアを推測して先読みしません。',
    'JPDB review questions no longer mistake sentence tokens for the reviewed headword, so definitions and Immersion media stay hidden until the answer is revealed.': 'JPDBの復習問題で、文中のトークンを復習対象の見出し語と誤認しなくなりました。定義とImmersionメディアは、答えを表示するまで隠れたままです。',
    "Review sites that replace the document body while revealing an answer now reattach Yomu's scanner, puck, and answer addon immediately instead of disappearing until a later card transition.": '答えの表示時にドキュメントのbodyを置き換える復習サイトでも、よむのスキャナー・パック・解答アドオンがすぐに再接続され、後のカード遷移まで消えたままになることがなくなりました。',
    'Moving to the next Jiten card removes the previous answer immediately instead of waiting for a resettable 500 ms delay or rebuilding the whole addon after every provider finishes.': '次のJitenカードへ進むと、リセットされる500ミリ秒の待ち時間を置いたり、すべての提供元の完了後にアドオン全体を作り直したりせず、前の答えをすぐに取り除きます。',
    'Turning JPDB or Bunpro definitions off now persists and hides those definition panels; lookup and frequency pills remain independent.': 'JPDBまたはBunproの定義をオフにした状態が保存され、該当する定義パネルも非表示になります。検索ピルと頻度ピルは引き続き独立しています。',
    'Immersion Kit review controls meet the 44 px mobile touch target, blurred translations remain revealed after one tap, and the carousel is no longer limited to two or three examples.': 'Immersion Kitの復習操作はモバイルで44ピクセルのタッチ領域を確保し、ぼかした翻訳は1回タップした後も表示されたままになり、カルーセルも2〜3件の例文に制限されなくなりました。',
    'The hosted Study page is now an installable offline-first Yomu app on iPhone, iPad, and Android, with native-style bottom navigation for Study, Library, Stats, and Connections, an explicit offline state, a stable app identity, and direct launch shortcuts. It keeps the same local cache and supported-provider grade outbox, so warmed reviews keep moving on the train and sync after reconnecting.': 'ホスト版Studyページは、iPhone・iPad・Androidにインストールできるオフライン優先のYomuアプリになりました。Study・単語帳・統計・連携のネイティブ風ボトムナビ、明確なオフライン表示、安定したアプリID、直接起動ショートカットを備えています。従来のローカルキャッシュと対応プロバイダー用採点送信待ちをそのまま使うため、電車内でもキャッシュ済みの復習を続け、再接続後に同期できます。',
    'Every fresh card now starts at its first enabled learning step—Kanji 1 by default—instead of jumping to Word. The numbered step rail stays on one line on desktop and scrolls horizontally on phones, while the prompt, answer, and actions now read as one focused learning surface.': '新しいカードはWordへ飛ばず、有効な最初の学習ステップ（既定ではKanji 1）から始まります。番号付きステップレールはデスクトップでは1行に収まり、スマートフォンでは横スクロールできます。問題・答え・操作も一つの集中した学習面としてまとまりました。',
    'Type practice now keeps the input and its action together, supports audio, accepts typed kana or the reading, gives retry feedback without revealing a missed answer, preserves the first-attempt grade, and turns Check into Continue after a correct response. The navigation label is now the clearer Previous.': 'Type練習では入力欄と操作をひとまとめにし、音声に対応し、かな入力または読みを正解として受け付けます。不正解時は答えを見せずに再試行のフィードバックを出し、最初の評価は保持し、正解後は確認ボタンが続けるに変わります。ナビゲーション表示もより明確なPreviousになりました。',
    'Incomplete subtitle and API sentence fragments, including continuative endings such as 「E組の全員に同じ説明をし」, are rejected before they can become Study clozes.': '「E組の全員に同じ説明をし」のような連用形で途切れた字幕やAPIの不完全な文は、Studyの穴埋め問題になる前に除外されます。',
    'Open the Yomu app for one offline-first place to study, search your Library, inspect combined Stats, and manage Connections. Install it from Share → Add to Home Screen on iPhone or iPad, or your browser\'s Install app action on Android. The browser extension still leaves new tabs alone and offers Open Study from its toolbar.': 'Yomuアプリは、学習・単語帳検索・統合統計・連携管理を一か所で行えるオフライン優先のクライアントです。iPhoneまたはiPadでは「共有 → ホーム画面に追加」、Androidではブラウザーの「アプリをインストール」から追加できます。ブラウザー拡張は引き続き新しいタブを変更せず、ツールバーから「Studyを開く」を提供します。',
    'Study pulls words from Anki, Jiten, Bunpro, JPDB, WaniKani, or local dictionaries, and caches the review queue on the device for the train. A fresh card starts at its first configured learning step — Kanji 1 by default — and the compact step rail, attached answer action, retry feedback, audio, and final grade stay in one focused flow. Grades for supported providers wait in a local outbox and sync after reconnecting; WaniKani writes remain live-only and are never replayed later. The old /newtab/ URL remains a compatibility route.': 'StudyはAnki・Jiten・Bunpro・JPDB・WaniKani・ローカル辞書から単語を取り込み、電車内で使えるよう復習キューを端末にキャッシュします。新しいカードは設定された最初の学習ステップ（既定ではKanji 1）から始まり、コンパクトなステップレール、答えに付属する操作、再試行フィードバック、音声、最終評価が一つの集中した流れに収まります。対応プロバイダーの評価はローカル送信箱で待機し、再接続後に同期されます。WaniKaniへの書き込みはオンライン時のみで、後から再送されません。旧/newtab/ URLは互換ルートとして残ります。',
    'On iPhone, iPad, and Android, the installed app opens as a standalone client and its cached shell, local cards, and warmed review queue remain available without a connection. Full Anki status and review sync on mobile still need desktop AnkiConnect reachable over LAN or Tailscale; the setup guide covers the steps.': 'iPhone・iPad・Androidでは、インストール後のアプリが独立したクライアントとして開き、キャッシュ済みのシェル、ローカルカード、予め読み込んだ復習キューを接続なしで使えます。モバイルでAnkiの完全な状態取得と復習同期を行うには、LANまたはTailscale経由でデスクトップのAnkiConnectに到達できる必要があります。手順はセットアップガイドにあります。',
    'Bunpro, Jiten, and JPDB example sentences now receive furigana across the full Japanese sentence instead of annotating only the highlighted lookup word. Every provider translation is blurred by default and can be revealed with a click, tap, Enter, or Space; when Jiten supplies no translation, よむ fills it with the existing cached sentence translator instead of showing source metadata or an empty row.': 'Bunpro・Jiten・JPDBの例文で、強調表示された検索語だけでなく、日本語の文全体にふりがなが付くようになりました。すべての提供元の翻訳は初期状態でぼかし表示され、クリック、タップ、Enter、またはSpaceで表示できます。Jitenが翻訳を返さない場合は、出典情報や空欄の代わりに、よむ既存のキャッシュ付き文翻訳で補います。',
    'Read examples consistently: Bunpro, Jiten, and JPDB use the same compact example rows, annotate the full Japanese sentence with furigana, and blur translations until you reveal them. Missing provider translations are filled with よむ\'s cached sentence translator. Bunpro also exposes labelled per-corpus frequency and pitch evidence, with pronunciation recordings available as an audio source that stays off until you enable it.': '例文を統一して読む：Bunpro・Jiten・JPDBは同じコンパクトな例文行を使い、日本語の文全体にふりがなを付け、表示するまで翻訳をぼかします。提供元に翻訳がない場合はよむのキャッシュ付き文翻訳で補います。Bunproはさらに、コーパスごとの頻度とピッチ情報をラベル付きで表示し、有効にするまでオフの発音録音ソースも提供します。',
    'When Bunpro is connected, its definitions use the same compact example rows as Jiten and JPDB. All three providers receive よむ furigana across the full Japanese sentence. Their translations are blurred by default and reveal on click, tap, Enter, or Space; if a provider omits the translation, よむ fills it with its cached sentence translator. よむ removes Bunpro\'s inline full-width kana brackets before display, then applies its own furigana and pitch annotations to the Japanese text. Bunpro\'s General, Anime, Novels, Netflix, and Dictionary ranks remain separately labelled because they describe different corpora. Bunpro pronunciation is also available in the audio-source list, disabled by default. Its recordings are fetched at runtime from Bunpro\'s public CDN; hosted/browser playback may use よむ\'s narrow public proxy.': 'Bunproを接続すると、その定義はJitenやJPDBと同じコンパクトな例文行で表示されます。3つの提供元すべてで、日本語の文全体によむのふりがなが付きます。翻訳は初期状態でぼかされ、クリック、タップ、Enter、またはSpaceで表示できます。提供元に翻訳がない場合は、よむのキャッシュ付き文翻訳で補います。よむはBunproの全角括弧によるかな表記を表示前に取り除き、日本語テキストに独自のふりがなとピッチ注釈を付けます。Bunproの一般・アニメ・小説・Netflix・辞書の順位は異なるコーパスを表すため、それぞれ別のラベルで表示されます。Bunpro発音も音声ソース一覧から利用できますが、初期状態では無効です。録音は実行時にBunproの公開CDNから取得され、ホスト版やブラウザ再生ではよむの限定的な公開プロキシを使用する場合があります。',
    'Examples can show Japanese, translations, thumbnails, audio, and source filters. Settings let you choose categories, length limits, image visibility, translation visibility, playback speed, and one-time hover audio on desktop. Example translations are blurred by default; choose the translation to reveal it, or turn the blur setting off if you prefer to see translations immediately.': '例文には日本語、翻訳、サムネイル、音声、ソースフィルターを表示できます。設定ではカテゴリ、長さの上限、画像と翻訳の表示、再生速度、デスクトップでの1度だけのホバー音声を選べます。例文の翻訳は初期状態でぼかされます。翻訳を選ぶと表示でき、すぐに見たい場合はぼかし設定をオフにできます。',
    'Immersion Kit and Nadeshiko may receive a search term or sentence when you request examples. Google Translate may receive subtitle or sentence text when you request a translation, including when an enabled Jiten, Bunpro, or JPDB example omits its own translation and よむ fills the missing line.': 'Immersion KitとNadeshikoは、例文をリクエストすると検索語または文を受信する場合があります。Google翻訳は翻訳をリクエストすると字幕または文のテキストを受信する場合があります。有効なJiten・Bunpro・JPDBの例文に翻訳がなく、よむが欠けた行を補う場合も含みます。',
    'Support contributions now use one production Checkout at support.yomureader.com, with a flexible amount in GBP, USD, EUR, CAD, AUD, or JPY. Academy no longer exposes its old test-mode Checkout; every verified contribution is delivered through the private support bridge as permanent Academy access.': 'サポート寄付はsupport.yomureader.comの単一の本番Checkoutを使用し、GBP・USD・EUR・CAD・AUD・JPYから通貨と金額を選べるようになりました。Academyでは以前のテストモードCheckoutを公開せず、確認済みの寄付はすべて非公開のサポート連携を通じてAcademyの永久アクセスとして付与されます。',
    'Test-mode Stripe sessions can no longer appear in the live monthly support total. The webhook and progress query both require live-mode sessions, and the banner now shows the genuine production total.': 'Stripeのテストモードのセッションが、本番の月間支援額に含まれなくなりました。Webhookと進捗集計の両方で本番モードのセッションを必須とし、バナーには実際の本番寄付額だけが表示されます。',
    "The new-tab support banner follows Yomu's selected interface language instead of remote English copy. Japanese users now see Japanese progress text, labels, and call to action, with currency values formatted for the selected contribution currency.": '新しいタブの支援バナーは、サーバーから届く英語文ではなく、Yomuで選択したインターフェース言語に従うようになりました。日本語ユーザーには進捗文・ラベル・寄付ボタンが日本語で表示され、通貨額も選択した寄付通貨に合わせて書式設定されます。',
    'WaniKani is now a complete optional account integration alongside Jiten, JPDB, and Bunpro. A personal access token connects directly from the browser to WaniKani without a proxy; Yomu respects the account\'s available level, shows WaniKani meanings, readings, mnemonics, hints, components, visually similar kanji, related vocabulary, context sentences, audio, assignment stage and review accuracy, and adds currently due assignments to Study and My Cards. Submitted reviews use WaniKani\'s incorrect meaning/reading counts, are sent only while online, and cannot be accidentally replayed or locally undone.': 'WaniKaniがJiten、JPDB、Bunproと並ぶ完全な任意アカウント連携になりました。個人アクセストークンを使い、プロキシを介さずブラウザーからWaniKaniへ直接接続します。アカウントで利用可能なレベルを守り、意味、読み、語呂合わせ、ヒント、構成要素、類似漢字、関連語彙、例文、音声、課題段階、正答率を表示し、現在復習可能な課題をStudyとMy Cardsへ追加します。復習送信にはWaniKaniの意味・読みの不正解回数を使い、オンライン時だけ送信されるため、誤って再送したりローカルで取り消したりすることはありません。',
    'Uchisen kanji support is available throughout the reader, including normal popovers, the Study experience, and page enhancements, with its keyword, component groups, generated stroke image, and stroke-order carousel kept together as one coherent source.': 'Uchisenの漢字情報を、通常のポップオーバー、Study、ページ拡張を含むリーダー全体で利用できます。キーワード、構成要素グループ、生成された筆順画像、筆順カルーセルを一つのまとまった情報源として表示します。',
    'Security': 'セキュリティ',
    'WaniKani tokens remain in browser storage, are masked in Settings, never appear in request URLs or logs, and are sent only as bearer credentials to': 'WaniKaniトークンはブラウザーストレージ内に保持され、Settingsでは伏せ字で表示されます。リクエストURLやログには一切含まれず、Bearer認証情報として次の送信先だけに送られます：',
    'with the official API revision header.': 'その際、公式APIのリビジョンヘッダーも付与します。',
    "Late vocabulary detail now updates the exact word already on the page instead of only the popup. Jiten's confirmed reading is shared with pitch and provider-frequency enrichment, so a first lookup no longer says exact pitch is unavailable, JPDB no longer loses its frequency number in the identity race, and words such as 毎日, 使える, 漫画, 問わず, and 人気 gain their available furigana and pitch without a refresh or second click.": '遅れて取得された語彙詳細が、ポップアップだけでなく、ページ上にすでにある該当語にも反映されるようになりました。Jitenで確認された読みをピッチと各プロバイダーの頻度補完でも共有するため、最初の検索で「正確なピッチを利用できません」と表示されたり、識別情報の競合でJPDBの頻度順位が消えたりしません。毎日、使える、漫画、問わず、人気などの語も、再読み込みや2回目のタップなしで、利用可能なふりがなとピッチが付きます。',
    'Embedded controls that begin in English and localize later are now noticed on every site. A sign-in button such as “Continue with Google” can change to Japanese after the frame loads and is then parsed normally, while non-Japanese frames retain only a small mutation wake-up check instead of running the full reader.': '最初は英語で表示され、後からローカライズされる埋め込みコントロールを、すべてのサイトで検出できるようになりました。「Continue with Google」のようなログインボタンがフレーム読み込み後に日本語へ変わっても、通常どおり解析されます。日本語のないフレームでは、Reader全体を動かさず、小さな変更検知だけを待機させます。',
    'Safari and WebKit now paint mirrored controls and ordinary page words through one synthetic pitch-underline channel. Furigana stays aligned in compact controls, pitch lines remain visible under segmented ruby, and adjacent differently coloured words sit on the same vertical baseline.': 'SafariとWebKitで、ミラー表示のコントロールと通常のページ内単語が、同じ合成ピッチ下線チャンネルを使って描画されるようになりました。小さなコントロールでもふりがなの位置がそろい、分割されたルビの下でもピッチ線が消えず、色の異なる隣接語の下線も同じ高さに並びます。',
    'Anki-backed Study sessions now open faster and do less work: independent deck checks run together, duplicate note searches are gone, and card details are loaded only as far as the visible study queue needs them. Sparse or incompatible cards still advance through progressively larger bounded windows, so performance does not come at the cost of silently shortening a session.': 'AnkiをソースにしたStudyセッションがより速く開き、処理量も減りました。独立したデッキ確認を並行して行い、重複していたノート検索をなくし、表示する学習キューに必要な範囲だけカード詳細を読み込みます。対象カードがまばらな場合や互換性のないカードが混ざる場合も、上限付きの検索範囲を段階的に広げるため、性能向上のためにセッションが気付かないうちに短くなることはありません。',
    'Reopening Settings after choosing an Anki note type now keeps that saved note type selected. An automatic Anki scan could replace the visible choice with its highest-scoring suggestion even though saving and card creation still used the original choice, making Settings misleading; scans now preserve any saved type that still exists in Anki.': 'Ankiのノートタイプを選んだ後に設定を開き直しても、保存したタイプが選択されたままになりました。保存とカード作成には元の選択が使われているのに、Ankiの自動スキャンが画面上の選択だけを最も評価の高い候補へ置き換え、設定表示が実際の状態と食い違うことがありました。今後は、保存したタイプがAnkiに存在する限り、その選択を維持します。',
    "Review card fronts no longer spoil the answer: the word you are being tested on stays a plain prompt on the question side, with no furigana and no pitch underline, and is annotated as usual once you reveal the answer. Yomu had been annotating the headword on the front of jiten study cards and jpdb reviews, showing the reading you were meant to recall; the hosted study page already behaved correctly and now the native sites match it.": '復習カードの表面で答えが見えてしまうことがなくなりました。出題されている単語は問題面ではふりがなもピッチの下線も付かないただのプロンプトのままになり、答えを表示すると通常どおり注釈が付きます。これまでYomuはjitenの学習カードやjpdbの復習の表面で見出し語に注釈を付けてしまい、思い出すべき読みが見えていました。ホスト版の学習ページは以前から正しく動作しており、ネイティブサイトもそれに揃いました。',
    "Moving to the next card in a jiten study session now scrolls back to the top, so each new card starts at its headword instead of wherever you had scrolled on the previous card. The page only scrolls on a genuinely new card, not when you reveal the answer to the one you are on.": 'jitenの学習セッションで次のカードに進むと、ページが自動で先頭までスクロールするようになりました。前のカードでスクロールした位置ではなく、新しいカードの見出し語から始まります。スクロールするのは本当に新しいカードのときだけで、今のカードの答えを表示したときには動きません。',
    "Furigana and pitch underlines now stay attached to the right word on multi-line titles and descriptions. Where Yomu paints its readings over the page's own text, such as YouTube video titles, Shorts titles, and channel labels, the overlay re-flowed the Japanese text itself and could not reproduce where the page wrapped each line, so on the second and later lines the readings and underlines drifted away from the words they belonged to. Each overlaid word is now pinned to the exact position of the real text it annotates, so alignment stays correct on every line, and it is re-checked when the page reflows after a thumbnail finishes loading or an iPad rotates.": '複数行にわたるタイトルや説明文でも、ふりがなとピッチ下線が正しい単語に付いたままになりました。YouTubeの動画タイトル・ショートのタイトル・チャンネルのラベルなど、ページ自身のテキストの上にYomuが読みを描画する場面では、オーバーレイが日本語テキストを独自に折り返し直していたため、ページがどこで改行したかを再現できず、2行目以降で読みと下線が対象の単語からずれていました。オーバーレイの各単語を、注釈する実際のテキストの位置に正確に固定するようにしたので、どの行でも配置が正しく保たれ、サムネイルの読み込み完了やiPadの回転でページが再レイアウトされたときにも再確認されます。',
    'Safari extension packages no longer claim they can inject into local': 'Safari拡張機能は、ローカルの',
    'pages, which Safari does not support, and Apple review notes are now generated from the final hardened manifest instead of carrying a stale new-tab warning. Yomu still packages Study as an ordinary page and never replaces Safari new tabs.': 'ページにスクリプトを挿入できると表示しなくなりました。Safariがこの動作に対応していないためです。Apple審査用の説明も、古い新規タブの警告を残さず、最終的に強化されたマニフェストから生成されます。Studyは引き続き通常のページとして同梱され、Safariの新規タブを置き換えません。',
    "Firefox packages no longer trigger Mozilla's three “unsafe assignment to innerHTML” warnings. Yomu's owned templates now pass through a local sanitizer before becoming DOM fragments, and the unused compatibility helper treats HTML-looking input as text, so AMO gets the same rendered interface without the ambiguous dynamic HTML assignments.": 'Firefoxパッケージで、Mozillaの「innerHTMLへの安全でない代入」という3件の警告が出なくなりました。Yomuが所有するテンプレートは、DOMフラグメントに変換される前にローカルのサニタイザーを通ります。使われていない互換ヘルパーも、HTMLのように見える入力をテキストとして扱います。これにより、曖昧な動的HTML代入を使わずに、AMOでも同じ表示を保てます。',
    'Feature releases such as': '機能リリース、例えば',
    'can now flow from a protected GitHub Release to Chrome Web Store and Firefox Add-ons without rebuilding the reviewed package. Chrome supports a linked service account, fails closed on new store warnings, and publishes automatically only after approval; Firefox uses its official signed-add-on submission flow. Apple release automation is documented for activation after the developer account and signed container app are available.': 'は、審査対象のパッケージをビルドし直さず、保護されたGitHub ReleaseからChrome Web StoreとFirefox Add-onsへ送れるようになりました。Chromeは連携したサービスアカウントに対応し、新しいストア警告があれば処理を停止します。公開は審査承認後のみ自動で行われます。Firefoxは公式の署名済みアドオン送信フローを使用します。Appleのリリース自動化は、開発者アカウントと署名済みのコンテナアプリを利用できるようになった後に有効化できるよう、手順を文書化しています。',
    "Yomu's GitHub page now offers the same three optional ways to support ongoing development—direct contribution, Patreon, and Ko-fi—and the browser-store listings make clear that every extension feature remains free.": 'YomuのGitHubページで、継続的な開発を任意で支援する3つの方法（直接支援、Patreon、Ko-fi）を同じように選べるようになりました。ブラウザストアの掲載情報でも、拡張機能のすべての機能を無料で利用できることを明記しています。',
    "The Immersion Kit now refreshes when you move to another card on jiten.moe. Every card in an SRS study session lives at the same page address, so Yomu could not tell that the word had changed and left the previous card's video clip and example sentences in place; it now notices when the card on screen no longer matches the Immersion Kit already added to the page and rebuilds it for the new word.": 'jiten.moeで別のカードに移動したとき、Immersion Kitが更新されるようになりました。SRS学習セッションではどのカードも同じページアドレスにあるため、Yomuは単語が変わったことを認識できず、前のカードの動画クリップと例文を表示したままにしていました。画面に表示されているカードが、すでにページに追加されているImmersion Kitと一致しないことを検知し、新しい単語に合わせて作り直すようになりました。',
    "An API key or theme set on the yomureader.com Settings page now reaches youtube.com and every other site. On iPad Safari the hosted-app settings live in that page's own storage while every other site's userscript reads the shared userscript store, so keys and the dark theme were stranded on yomureader.com and other sites fell back to defaults (light theme, no key). The userscript now promotes those stranded values into the shared store the instant it loads on yomureader.com, filling only values still at their default so a choice made on another site is never overwritten.": 'yomureader.comの設定ページで設定したAPIキーやテーマが、youtube.comをはじめ他のすべてのサイトにも反映されるようになりました。iPad Safariではホストアプリの設定がそのページ独自のストレージに保存される一方、他サイトのユーザースクリプトは共有ストレージを読むため、キーやダークテーマがyomureader.comに取り残され、他サイトでは既定値（ライトテーマ・キーなし）に戻っていました。ユーザースクリプトがyomureader.comで読み込まれた瞬間に、取り残された値を共有ストレージへ昇格させるようになりました。既定値のままの項目だけを補うので、他サイトで行った選択が上書きされることはありません。',
    "Safari (including iPad and iPhone) is no longer mistaken for Firefox. A Safari Web Extension exposes the same content-script API shape as a Firefox extension, so Yomu wrongly ran the Firefox data-consent flow and blocked API key entry with an open a Yomu page message. Safari is now told apart by its extension URL scheme, so you can enter your Jiten, JPDB, and other keys directly in Settings on any page, and the JPDB connection status and deck lists load again.": 'Safari（iPad・iPhoneを含む）をFirefoxと誤認しなくなりました。Safari Web Extensionはコンテンツスクリプトのapi構成がFirefox拡張と同じため、YomuがFirefoxのデータ同意フローを誤って実行し、「Yomuのページを開いてください」という表示でAPIキーの入力をブロックしていました。拡張機能のURLスキームでSafariを判別するようにしたので、どのページの設定からでもJiten・JPDBなどのキーを直接入力でき、JPDBの接続状態やデッキ一覧も再び読み込まれます。',
    "SRS status highlighting is visible again on framework controls such as YouTube titles, buttons, and labels. Those overlaid words now show a soft translucent status tint. The earlier solid-block fix had removed every background from overlay words, which left the SRS status with no way to show at all; the restored tint is light enough that the page's own text stays readable through it and the pitch underline is undisturbed.": 'YouTubeのタイトル・ボタン・ラベルなどフレームワーク製の操作部でも、SRSステータスのハイライトが再び表示されるようになりました。重ねて表示される単語に、やわらかな半透明のステータス色が付きます。以前のソリッドブロック修正でこれらの単語から背景がすべて取り除かれ、SRSステータスを示す手段がなくなっていましたが、復元した色はページ本来の文字が透けて読める程度に淡く、ピッチの下線にも影響しません。',
    "On page-owned text such as site buttons, video titles, and labels, the pitch or status underline now runs under the whole word, including the kanji that carry furigana, instead of appearing only under trailing kana. The detached reading box was an atomic inline that swallowed the word's underline, so kanji that paired with a reading lost the line; the box now carries the word's own underline while the reading above it stays undecorated.": 'サイトのボタン・動画タイトル・ラベルなどページ本来の文字では、ピッチやステータスの下線が、末尾のかなだけでなく、ふりがなの付いた漢字を含む単語全体の下に引かれるようになりました。読みを表示する切り離しボックスがアトミックインラインとして単語の下線を飲み込み、読みが付いた漢字だけ下線を失っていましたが、このボックス自体が単語の下線を担うようになり、その上の読みには下線が付きません。',
    "Status highlighting on site buttons, video titles, and other page controls no longer paints a solid coloured block that hides the text underneath. Those overlaid words now show a quiet status underline again instead of an opaque highlight that covered the page's own glyphs.": 'サイトのボタン・動画タイトル・その他のページ操作部のステータスハイライトが、下の文字を隠す不透明な色ブロックを描画しなくなりました。重ねて表示される単語は、ページ本来の文字を覆う不透明なハイライトではなく、控えめなステータス下線を再び表示します。',
    'The floating button steps off an overlapping video immediately on rotation and viewport changes again, scroll flings keep the battery-saving settle delay, and reader boot no longer spends an extra page-wide layout pass.': 'フローティングボタンが、画面回転やビューポート変更の際に重なった動画から即座に退くようになりました。スクロール中は省電力の遅延処理を維持し、リーダー起動時の余分なページ全体レイアウト計算も行いません。',
    'Furigana on clamped title rows no longer appears and then disappears: the layout verdict is now measured after paint, demotes readings only on clear failure evidence, and recovers instead of hiding them permanently.': '行数制限されたタイトル行のふりがなが、表示された後に消えることがなくなりました。レイアウトの判定は描画後に実測され、明確な失敗の証拠がある場合のみ読みを非表示にし、恒久的に隠す代わりに回復します。',
    'Action labels and titles on YouTube no longer widen or truncate into ellipses: shrinkable single-line rows are detected generically and their readings route through the width-neutral detached lane.': 'YouTubeの操作ラベルやタイトルが、幅が広がったり省略記号で切り詰められたりしなくなりました。縮小可能な1行の行を汎用的に検出し、読みを幅に影響しない分離レーンで表示します。',
    'Words like 技術 no longer render with a gap between their kanji: furigana pairs per dictionary-attested segment, and the essential ruby styles now reach shadow roots and pages still waiting for the full stylesheet.': '技術のような単語の漢字の間に隙間ができなくなりました。ふりがなは辞書で裏付けられた区切りごとに対応付けられ、必須のルビスタイルがシャドウルートや完全なスタイルシートの読み込みを待つページにも適用されます。',
    "Compound words paint their pitch underline as soon as any part's accent is known, colouring unknown parts neutrally instead of dropping the whole underline.": '複合語は、一部のアクセントが判明した時点でピッチの下線を描画するようになりました。未解決の部分は中立色で塗り、下線全体を消すことはありません。',
    'Underlines and readings over page-owned text now align to the exact glyphs, correcting for leading icons and re-aligning after font swaps, image loads, and rotations.': 'ページ側のテキストに重ねる下線と読みが、正確な文字位置に揃うようになりました。先頭のアイコンによるずれを補正し、フォントの切り替え・画像の読み込み・画面回転の後にも再整列します。',
    'Visible Japanese inside aria-hidden containers such as badges, thumbnails, and metadata rows is now annotated based on what actually paints on screen.': 'バッジ・サムネイル・メタデータ行などのaria-hiddenコンテナー内に見えている日本語が、実際に画面に描画される内容に基づいて注釈されるようになりました。',
    'Jiten and jpdb status highlighting no longer vanishes when pitch enrichment repaints a word, and words that missed their status receive one batched authenticated backfill.': 'ピッチ情報の適用で単語が再描画されてもJitenやjpdbのステータスハイライトが消えなくなりました。ステータスを取得できなかった単語には、認証済みの一括バックフィルが一度実行されます。',
    'Firefox pages that attach shadow roots no longer break: shadow discovery patches the page realm directly or through an injected page script instead of a cross-realm bridge.': 'シャドウルートを生成するページがFirefoxで壊れなくなりました。シャドウ検出はレルム間ブリッジではなく、ページレルムを直接、または挿入したページスクリプトでパッチします。',
    'The annotation pipeline now reaches zero scheduled timers on hidden or videoless pages, cutting background battery drain.': '非表示のタブや動画のないページでは注釈パイプラインのタイマーがゼロになり、バックグラウンドでのバッテリー消費を削減します。',
    "Newly replicated local dictionaries now replace existing Jiten or fallback annotations immediately, so installed definitions become the page's parsing source without a reload.": '複製されたローカル辞書が、既存のJitenまたはフォールバックの注釈をすぐに置き換えるようになりました。インストール済みの定義が、再読み込みなしでページの解析元になります。',
    'Every verified positive GBP Stripe support or Ko-fi donation now creates a permanent Yomu Academy entitlement, and a verified positive Patreon membership grant remains permanent after expiry, decline, deletion, or refund. Provider signatures, private-ingress authentication, HMAC-at-rest identifiers, and replay idempotency remain mandatory.': '検証済みの1ペンス以上のGBP建てStripeサポートまたはKo-fi寄付は、恒久的なYomu Academy利用権を付与するようになりました。検証済みのPatreonメンバーシップも、最初の有効な支払い後は期限切れ・支払い拒否・削除・返金が発生しても恒久利用権を維持します。プロバイダー署名、非公開の受信認証、HMACで保護された保存識別子、リプレイに対する冪等性は引き続き必須です。',
    'Stripe support Checkout now binds an HttpOnly browser claim to the signed payment, giving the donor a secure self-claim path without making success redirects or transaction IDs into access credentials. PayPal.me remains link-only until a PayPal REST-app webhook can be cryptographically verified.': 'StripeのサポートCheckoutは、HttpOnlyのブラウザークレームを署名済み決済に結び付けるようになりました。これにより、成功時のリダイレクトや取引IDをアクセス資格情報にせず、寄付者が安全に利用権を受け取れます。PayPal.meは、PayPal RESTアプリのWebhookを暗号学的に検証できるようになるまでリンク専用です。',
    "The Update button in Settings Help now sends browser-extension installs to the extension store for the current browser, with Firefox, Safari, and Chromium-family browsers each routed to their own store page. Userscript installs keep opening the hosted script or their manager's update flow as before.": '設定のヘルプにある「更新」ボタンは、ブラウザ拡張機能版では現在のブラウザの拡張機能ストアを開くようになりました。Firefox、Safari、Chromium系ブラウザはそれぞれ専用のストアページへ案内されます。ユーザースクリプト版はこれまでどおりホストされたスクリプトやマネージャーの更新フローを開きます。',
    'The yomu wordmark in the Study and new-tab navigation now leaves enough line-box space for the lowercase y, so its descender is no longer clipped.': 'Studyと新しいタブのナビゲーションにある「yomu」ワードマークで、小文字の「y」に十分な行ボックスの余白を確保し、ディセンダーの先端が見切れなくなりました。',
    "Bunpro grammar entries now list vocabulary that uses the grammar point in a new Used in section; a small bounded set of Bunpro's coverage vocabulary is resolved with caching, so reopening an entry adds no extra requests.": 'Bunproの文法エントリーに、その文法ポイントを使っている語彙を一覧する新しい「使われている単語」セクションが追加されました。Bunproのカバレッジ語彙のうち限られた少数だけをキャッシュ付きで解決するため、エントリーを再度開いても追加のリクエストは発生しません。',
    'Furigana now stays visible on compact buttons, chips, menu labels, metadata rows, and nested clipped controls whenever its measured lane is unclipped and clear of nearby text. Only a reading proven unsafe is hidden; its base word, lookup target, and pitch annotation remain intact.': 'コンパクトなボタン、チップ、メニューのラベル、メタデータ行、入れ子になったクリップ付きコントロールでも、実測した表示レーンがクリップされず周囲の文字と干渉しない限り、ふりがなが表示されるようになりました。安全でないと確認された読みだけを非表示にし、元の単語、辞書引き対象、ピッチ注釈はそのまま残します。',
    'Opening a menu or rescanning a nested control no longer closes an already-safe furigana lane. Clip reclassification is now performed only beside the geometry settle that commits the next visibility verdict, and remains reversible when the page reflows.': 'メニューを開いたり入れ子のコントロールを再スキャンしたりしても、すでに安全と判定されたふりがなレーンが閉じなくなりました。クリップの再判定は、次の表示可否を確定する幾何学的な整列処理と隣接して行い、ページの再レイアウト後も双方向に再評価できるようにしました。',
    'Expanded the Chromium and WebKit layout gates to require painted furigana on known-safe controls and nested metadata, explicit safety verdicts for every hidden reading, preservation of real expandable-panel clipping, and safe-to-unsafe-to-safe reflow recovery.': 'ChromiumとWebKitのレイアウトゲートを拡張し、安全と分かっているコントロールと入れ子のメタデータでふりがなが実際に描画されること、非表示の各読みに明示的な安全判定があること、実際の展開パネルのクリップを維持すること、安全・非安全・安全と変化する再レイアウトから復帰できることを必須にしました。',
    'On yomureader.com, よむ now annotates only declared demos and reading surfaces instead of translated navigation and documentation copy. Japanese interface mode stays responsive while the Try Me and other intentional reader surfaces retain furigana, pitch, and lookups.': 'yomureader.comでは、翻訳済みのナビゲーションやドキュメント本文ではなく、明示されたデモと読書面だけをよむが注釈するようになりました。Try Meなどの意図的なリーダー面では、ふりがな・ピッチ・単語検索を保ちながら、日本語インターフェースモードの応答性を維持します。',
    'Rendered exact one-mora pitch accents as a valid single-point graph instead of rejecting graphs with fewer than two morae, so 自（じ） now shows its high atamadaka point and one-mora heiban words show their low point.': '1モーラの完全一致するピッチアクセントを、2モーラ未満として拒否せず、有効な1点グラフで描画するようにしました。「自（じ）」は高い頭高型の点を表示し、1モーラの平板型語は低い点を表示します。',
    'Dynamic Japanese inside open web components no longer develops random annotation gaps when a component starts empty, hydrates after the first scan, nests behind another component, upgrades after page load, or attaches its shadow root in a later task. Furigana, pitch decoration, and vocabulary status now wake through one globally bounded composed-DOM lifecycle instead of waiting for an unrelated click, scroll, or text mutation.': 'オープンなWebコンポーネント内の動的な日本語で、空の状態から始まる、初回スキャン後に内容が生成される、別のコンポーネント内にネストされる、ページ読み込み後にアップグレードされる、または後続タスクでShadow Rootが接続される場合に、注釈がランダムに欠ける問題を修正しました。ふりがな、ピッチ装飾、語彙ステータスは、無関係なクリック・スクロール・テキスト変更を待たず、全体で上限管理された単一のComposed DOMライフサイクルから起動します。',
    'Detached furigana no longer disappears when an opaque menu covers unrelated page text or when a long reading harmlessly overhangs adjacent words or punctuation on the same authored line. Collision checks now respect visible paint order; genuine clipping and cross-row collisions remain protected, while readings resolved after the first render stay in the compact detached channel and restore its containment correctly when removed.': '不透明なメニューが背後のページ本文を覆っている場合や、長い読みが同じ行の隣接語や句読点にはみ出すだけの場合に、分離表示のふりがなが消える問題を修正しました。衝突判定は実際に見える描画順を考慮し、実際のクリッピングや別行との衝突は引き続き保護します。初回描画後に解決された読みもコンパクトな分離表示チャンネルを維持し、削除時には包含状態を正しく復元します。',
    'Kana-only component labels such as フィード now keep their pitch and vocabulary-status decoration even though their reading correctly produces no redundant furigana overlay. Additive mirror paint also follows pitch or vocabulary state resolved after the mirror mounts and inherits late page-theme colour changes.': '「フィード」のようなかなだけのコンポーネントラベルでも、重複するふりがなを正しく表示しないまま、ピッチと語彙ステータスの装飾を維持するようにしました。加算ミラーの描画も、ミラーのマウント後に解決されたピッチや語彙状態へ追従し、後から変更されたページテーマの文字色を継承します。',
    'Semantic disclosure and sort controls are distinguished from the expandable content they control, so a safe detached-reading lane can open without changing height or click behaviour while actual panels remain clipped.': 'セマンティックな開閉・並べ替えコントロールを、その操作対象である展開可能なコンテンツから区別するようにしました。安全な分離読み表示レーンは高さやクリック動作を変えずに開き、実際のパネルは引き続きクリップします。',
    'Added deterministic Reddit-shaped Chromium and WebKit coverage for nested, initially empty, late-hydrating, and late-upgrading open shadow roots, along with kana-only decoration, opaque-overlay paint order, safe same-line overhang, semantic disclosure controls, asynchronous reading/state repaint, and bounded mutation deliveries.': 'Reddit型の決定的なChromium／WebKitテストを追加し、入れ子・初期状態が空・遅延生成・遅延アップグレードされるオープンなShadow Rootに加え、かなだけの装飾、不透明なオーバーレイの描画順、同一行への安全なはみ出し、セマンティックな開閉コントロール、非同期の読み／状態の再描画、上限付きのMutation配信を検証します。',
    'Reused the matching visible Study card for parsed-word popovers when a portable card has neither a provider lookup target nor a parser cache entry, preventing 自（じ） from falling through to a fresh pitchless text lookup.': '共有用カードに提供元の検索対象もパーサーキャッシュもない場合、解析済み単語のポップオーバーには一致する表示中のStudyカードを再利用するようにしました。「自（じ）」がピッチなしの新しい文字検索へフォールスルーすることを防ぎます。',
    'Fixed apparently random bare words, sentence fragments, and paragraph tails on dynamic pages such as Reddit. Hover and mutation activity now coalesce behind the active annotation pass instead of cancelling it, provider failures retry locally without dropping later batches, and capped scans continue past a failed head.': 'Redditのような動的ページで、単語・文の断片・段落末尾が不規則に未注釈になる問題を修正しました。ホバーやDOM変更による処理は、進行中の注釈パスを中断せず、その後ろにまとめられます。提供元で失敗した場合はローカル処理で再試行し、後続バッチを落としません。件数上限に達したスキャンも、失敗した先頭部分を越えて継続します。',
    'Made parser output lossless and renderer-safe: short provider responses preserve one result per input, malformed or overlapping spans cannot claim coverage the renderer rejects, and uncovered Japanese—including half-width katakana—is repaired even when provider offsets drift across Latin text or punctuation.': 'パーサーの出力を欠落なく描画できる形にしました。提供元の応答が短くても入力ごとに1件の結果を保ち、不正または重複する範囲が描画側で拒否される領域を処理済みとして扱わないようにしました。提供元の位置情報がラテン文字や句読点をまたいでずれても、半角カタカナを含む未処理の日本語を補完します。',
    'Registered open web-component roots before and during hydration, including roots attached after their host entered the page, and included them in delayed furigana, pitch, and word-status updates. Compact rows still hide only furigana that cannot fit safely; their base word and pitch/status annotation remain intact.': 'オープンなWebコンポーネントのルートを、ハイドレーション前と処理中の両方で登録するようにしました。ホストがページへ入った後に追加されたルートも対象です。遅れて届くふりがな・ピッチ・単語状態の更新も、これらのルートへ反映します。幅の狭い行では安全に収まらないふりがなだけを隠し、元の単語とピッチ／状態の注釈は残します。',
    'Kept short annotated labels inside their native ellipsis boxes, fixing the stray': '短い注釈付きラベルをページ本来の省略表示ボックス内に収め、余計な省略記号が表示される問題を修正しました。',
    "that appeared on YouTube navigation and shelf labels on iPad. Reading-free annotation mirrors now remain clipped to the page's authored box, while labels that actually show furigana retain room for it.": 'iPad版YouTubeのナビゲーションやシェルフのラベルで発生していた問題です。読みを表示しない注釈ミラーはページが定めたボックス内に留まり、実際にふりがなを表示するラベルには引き続き必要な空間を確保します。',
    'Restored the exact rendered pitch contour onto the provider source card selected for a Study popover, closing the final path where 自（じ） could show Listen/Speak but still report “Exact pitch unavailable”.': 'Studyポップオーバーで選ばれた提供元カードに、描画済みの完全一致するピッチ輪郭を引き継ぐようにしました。「自（じ）」でListen／Speakが表示されているのに「完全一致するピッチがありません」と出る最後の経路を修正します。',
    'Kept pitch-accent underlines attached to their words while Yomu\'s compact fallback stylesheet is active. Mirrored text with furigana now uses a glyph-anchored native underline immediately instead of positioning the line at the bottom of a taller host box, so YouTube descriptions and multi-line homepage titles no longer draw pitch lines through the row below; the same fix covers equivalent mirrored layouts on other sites.': 'よむの小さなフォールバック用スタイルシートが有効な間も、ピッチアクセントの下線が単語から離れないようにしました。ふりがな付きのミラー文字列では、背の高いホスト要素の下端に線を配置する代わりに、文字に結び付いたブラウザ標準の下線を最初から使います。これにより、YouTubeの説明文や複数行のホーム画面タイトルで、ピッチ線が次の行を横切らなくなりました。同じ構造の他サイトのミラー表示にも適用されます。',
    'Hover lookups no longer flicker open and closed over Japanese words rendered by reactive sites. The popover watchdog now accepts an exact live word hit from Yomu\'s pointer geometry while still closing after the pointer moves away.': 'リアクティブなサイト上に表示された日本語の単語で、ホバー辞書引きが開閉を繰り返す問題を修正しました。ポップアップの監視処理は、よむのポインター位置計算で同じ単語を正確に検出できる間は表示を維持し、ポインターが離れた後はこれまでどおり閉じます。',
    'Preserved exact pitch contours across the rendered Study-word lookup boundary, so clicking 自（じ） reuses the pitch already resolved for Listen/Speak instead of reopening a pitch-empty cached card and claiming “Exact pitch unavailable”.': 'Studyで描画された単語からポップオーバーを開く際にも完全一致するピッチ輪郭を引き継ぐようにしました。「自（じ）」をクリックすると、ピッチなしのキャッシュカードを開き直して「完全一致するピッチがありません」と表示するのではなく、Listen／Speak用に解決済みのピッチを再利用します。',
    'Fixed the hosted docs homepage language toggle from Japanese to English leaving most page copy blank on iPad Safari: language changes now remove the reader\'s Japanese annotations and overlay mirrors, restore hidden native text, and re-canonicalize reconstructed text instead of replacing it with stale pre-annotation fragments.': 'ホスト版ドキュメントのホームページで、言語切り替えボタンを日本語から英語へ切り替えると、ページ内のほとんどの文章が消える不具合を修正しました。言語変更時にリーダーの日本語注釈とオーバーレイミラーを取り除き、非表示になっていた元の文章を戻し、復元したテキストを古い注釈前の断片で置き換えないよう再正規化します。',
    'Treated a shared Study card with exact enriched pitch as authoritative for its own word popover even when the share source has no standard review-provider label, preventing the final fallback text lookup from recreating `自（じ）` without pitch.': '共有Studyカードに完全一致するピッチが付与されている場合、共有元に標準の復習プロバイダー名がなくても、その単語ポップオーバーでは元カードを正として扱うようにしました。最終的なフォールバック文字検索で「自（じ）」がピッチなしで作り直されることを防ぎます。',
    'Fixed shared Study cards losing late-resolved pitch when their word popover reopened the provider source card, which made `自（じ）` offer Listen/Speak but still claim “Exact pitch unavailable” in the popover.': '共有されたStudyカードで、単語ポップオーバーが提供元カードを開き直す際に、後から解決したピッチが失われる問題を修正しました。この問題により「自（じ）」ではListen／Speakが表示される一方、ポップオーバーに「完全一致するピッチがありません」と誤表示されていました。',
    'Fixed shared Study cards losing late-resolved pitch when their word popover reopened the provider source card, which made': '共有されたStudyカードで、単語ポップオーバーが提供元カードを開き直す際に、後から解決したピッチが失われる問題を修正しました。そのため',
    'offer Listen/Speak but still claim “Exact pitch unavailable” in the popover.': 'ではListen／Speakが表示される一方、ポップオーバーに「完全一致するピッチがありません」と誤表示されていました。',
    'Fixed one-mora pitch accents such as 自（じ） across Study and popovers: Yomu now accepts exact single-level JPDB graphs, adds Listen/Speak when local, Jiten, or public JPDB enrichment resolves classifiable pitch, and omits those dead steps when no exact pitch exists.': '「自（じ）」のような1モーラ語のピッチアクセントを、Studyとポップオーバーの両方で修正しました。JPDBの完全一致する1段階のグラフを受け付け、ローカル辞書・Jiten・公開JPDBから分類可能なピッチが解決できた場合だけListen／Speakを追加し、完全一致するピッチがない場合は使えないステップを表示しません。',
    'Pitchless compound popup headwords such as 利用料金 now underline each fully aligned component with that component\'s own sourced pitch colour. Exact whole-word pitch still takes priority, partial or misaligned component evidence stays undecorated, and Yomu never combines component contours into a guessed whole-word accent. A stale popup rule that also hid valid exact-pitch headword underlines has been removed.': '「利用料金」のように語全体のピッチ情報がない複合語でも、すべての構成語が正しく対応していれば、それぞれの出典に基づくピッチ色でポップアップ見出しに個別の下線を表示します。語全体の完全一致ピッチを引き続き優先し、構成語の情報が一部だけの場合や対応がずれている場合は装飾しません。また、構成語の輪郭を結合して語全体のアクセントを推測することはありません。完全一致ピッチの見出し下線まで隠していた古いポップアップ規則も削除しました。',
    'Bunpro dictionary entries now use the same compact example-sentence layout as Jiten and JPDB. Bunpro\'s inline full-width kana brackets are removed before display so よむ can add its own furigana and pitch annotations to the Japanese text.': 'Bunproの辞書エントリーは、JitenやJPDBと同じコンパクトな例文レイアウトを使用するようになりました。Bunproの全角括弧によるかな表記は表示前に取り除かれ、よむ独自のふりがなとピッチ注釈が日本語テキストに付けられます。',
    'Bunpro frequency now shows every available corpus rank as a visible labelled pill, including General, Anime, Novels, Netflix, and Dictionary, while Bunpro pitch variants supplement rather than replace local or JPDB pitch evidence.': 'Bunproの頻度は、一般・アニメ・小説・Netflix・辞書を含む利用可能な各コーパス順位を、ラベル付きの見えるピルとして表示するようになりました。Bunproのピッチ候補は、ローカルまたはJPDBのピッチ情報を置き換えず、補足します。',
    'Bunpro pronunciation recordings are available as a new opt-in audio source. It is added disabled to both new and existing audio-source lists, so the configured pronunciation source makes no requests until enabled; explicit Bunpro audio buttons fetch only when pressed. Recordings are fetched at runtime from Bunpro\'s public CDN; hosted/browser playback may use よむ\'s narrow public proxy.': 'Bunproの発音録音を、新しいオプトイン式音声ソースとして利用できるようになりました。新規・既存どちらの音声ソース一覧にも無効状態で追加されるため、設定された発音ソースは有効にするまでリクエストを行いません。Bunproの明示的な音声ボタンは、押した場合にだけ取得します。録音は実行時にBunproの公開CDNから取得され、ホスト版やブラウザ再生ではよむの限定的な公開プロキシを使用する場合があります。',
    'Keep connected sources consistent: Bunpro definitions use the same compact example rows as Jiten and JPDB, expose labelled per-corpus frequency and pitch evidence, and offer pronunciation recordings as an audio source that stays off until you enable it.': '接続したソースの表示を統一：Bunproの定義はJitenやJPDBと同じコンパクトな例文行を使い、コーパスごとの頻度とピッチ情報をラベル付きで表示します。発音録音は、有効にするまでオフのままの音声ソースとして利用できます。',
    'When Bunpro is connected, its definitions use the same compact example rows as Jiten and JPDB. よむ removes Bunpro\'s inline full-width kana brackets before display, then applies its own furigana and pitch annotations to the Japanese text. Bunpro\'s General, Anime, Novels, Netflix, and Dictionary ranks remain separately labelled because they describe different corpora. Bunpro pronunciation is also available in the audio-source list, disabled by default. Its recordings are fetched at runtime from Bunpro\'s public CDN; hosted/browser playback may use よむ\'s narrow public proxy.': 'Bunproを接続すると、その定義はJitenやJPDBと同じコンパクトな例文行で表示されます。よむはBunproの全角括弧によるかな表記を表示前に取り除き、日本語テキストに独自のふりがなとピッチ注釈を付けます。Bunproの一般・アニメ・小説・Netflix・辞書の順位は異なるコーパスを表すため、それぞれ別のラベルで表示されます。Bunpro発音も音声ソース一覧から利用できますが、初期状態では無効です。録音は実行時にBunproの公開CDNから取得され、ホスト版やブラウザ再生ではよむの限定的な公開プロキシを使用する場合があります。',
    'The same authenticated Bunpro detail can add separately labelled General, Anime, Novels, Netflix, and Dictionary frequency ranks plus supplemental pitch evidence. These are different corpus ranks, not one universal score. Bunpro pronunciation appears in Settings → Audio but is disabled by default. Its recordings are fetched at runtime from Bunpro\'s public CDN; hosted/browser playback may use よむ\'s narrow public proxy.': '同じ認証済みのBunpro詳細情報から、一般・アニメ・小説・Netflix・辞書の頻度順位を個別のラベル付きで追加し、ピッチ情報を補足できます。これらは異なるコーパスの順位であり、単一の共通スコアではありません。「設定 → 音声」にBunpro発音が表示されますが、初期状態では無効です。録音は実行時にBunproの公開CDNから取得され、ホスト版やブラウザ再生ではよむの限定的な公開プロキシを使用する場合があります。',
    'Those dictionary entries follow the same compact example layout as Jiten and JPDB. よむ replaces Bunpro\'s inline kana brackets with its own furigana annotations, labels each Bunpro frequency corpus separately, supplements existing pitch evidence, and offers Bunpro pronunciation as an audio source that is disabled until you opt in.': 'これらの辞書エントリーは、JitenやJPDBと同じコンパクトな例文レイアウトを使用します。よむはBunproの括弧付きかなを独自のふりがな注釈に置き換え、Bunproの各頻度コーパスを個別に表示し、既存のピッチ情報を補足します。また、オプトインするまで無効な音声ソースとしてBunpro発音を提供します。',
    'Optional account-authenticated runtime services; upstream content and terms remain theirs, and よむ bundles none of their corpora or recordings. Bunpro uses a private, unsupported frontend endpoint that may change. Its opt-in pronunciation recordings are fetched at runtime from Bunpro\'s public CDN; hosted/browser playback may use よむ\'s narrow public proxy.': '任意で接続するアカウント認証型の実行時サービスです。上流のコンテンツと利用条件は各サービスに帰属し、よむはそれらのコーパスや録音を同梱しません。Bunproは変更される可能性がある非公開・非サポートのフロントエンド用エンドポイントを使用します。オプトイン式の発音録音は実行時にBunproの公開CDNから取得され、ホスト版やブラウザ再生ではよむの限定的な公開プロキシを使用する場合があります。',
    'Kanji keyword pills are easier to scan: JPDB or Jiten, RTK, and installed kanji dictionaries that agree now merge into one pill with a combined source badge; the primary source is highlighted, and a +N pill summarises any overflow instead of silently dropping it.': '漢字キーワードのピルが見やすくなりました。JPDBまたはJiten、RTK、インストール済み漢字辞書で同じキーワードを持つ出典は、結合された出典バッジ付きの1つのピルにまとまります。主要な出典は強調表示され、表示しきれない項目は黙って省略せず +N ピルでまとめます。',
    'The reader built into yomureader.com is only a no-install fallback. When the よむ userscript or extension is installed, that copy stays in control and keeps using its own language, Jiten/JPDB keys, settings, and progress.': 'yomureader.comに内蔵されているリーダーは、よむをインストールしていない場合だけ使われるフォールバックです。よむのユーザースクリプトまたは拡張機能がインストールされている場合は、インストール版が制御を保ち、独自の言語、Jiten／JPDBキー、設定、進捗を引き続き使用します。',
    'Reused the browser-authorized media element for repeated Apple Pencil and mouse hover audio, so leaving a word and hovering again no longer shows the active speaker state while Safari silently blocks a newly created audio element; stale hover fetches also cannot retarget the shared channel after a newer lookup starts. The speaker now keeps its green accent for the full playback instead of only while audio is loading.': 'Apple Pencilやマウスでホバー音声を繰り返し再生するとき、ブラウザが再生を許可済みのメディア要素を再利用するようにしました。単語から離れてもう一度ホバーしても、Safariが新しく作られた音声要素を無音のまま拒否し、スピーカーだけが再生中表示になることはありません。さらに、古いホバーの取得処理が新しい検索の開始後に共有チャンネルの再生先を書き換えないようにしました。スピーカーの緑色アクセントは、音声の読み込み中だけでなく、再生が終わるまで表示されるようになりました。',
    'Made installed Yomu userscripts and extensions announce themselves at document-start on yomureader.com. The website now keeps its hosted reader strictly as the no-install fallback, so an installed copy remains the runtime owner and retains its own language, Jiten key, and learning progress.': 'yomureader.comで、インストール済みのよむユーザースクリプト／拡張機能がdocument-start時点で自身の存在を通知するようにしました。サイト内蔵リーダーは未インストール環境専用のフォールバックとなり、インストール済みのよむがランタイムの所有権を保って、独自の言語設定・Jitenキー・学習進捗を引き続き使用します。',
    'Restored furigana, pitch, and word-state annotations across Japanese Settings Help copy, including version guidance, useful links, and support text; the Help card had retained a legacy surface-ignore marker that bypassed the newer settings annotation path.': '日本語の設定画面のヘルプ文（バージョン案内、便利なリンク、サポート説明を含む）に、ふりがな・ピッチ・単語状態の注釈が再び付くようになりました。ヘルプカードに古い「注釈対象外」マーカーが残り、新しい設定注釈処理を迂回していたことが原因でした。',
    'Kept Japanese Settings responsive while annotations start: the selected tab now paints first, hidden panels are skipped, and the active panel is enhanced in bounded slices instead of one large main-thread pass.': '日本語の設定画面で注釈を開始するときも操作が固まらないようにしました。選択したタブを先に描画し、非表示のパネルを除外し、表示中のパネルを大きな一括処理ではなく上限付きの小分け処理で注釈します。',
    'Repaired partial remote token boundaries before subtitle and popup-example rendering, so': '字幕およびポップアップの例文を描画する前に、リモート解析の部分的なトークン境界を修復しました。これにより',
    'is resolved as the inflected verb': 'は動詞',
    'instead of the surname': 'の活用形として解決され、姓の',
    '), restoring the correct furigana and pitch underline.': ')ではなくなり、正しいふりがなとピッチ下線が復元されます。',
    'Continued pitch enrichment when Jiten resolves a word but has no accent of its own: exact JPDB pitch now reaches words such as': 'Jitenが単語を解決してもアクセント情報を持たない場合に、ピッチの補完を続行するようにしました。たとえば',
    ', while aligned compounds such as': 'にはJPDBの完全一致ピッチが適用されます。また、',
    'keep one lookup target and show honest per-component pitch segments rather than borrowing a false whole-word accent.': 'のような整列可能な複合語は、1つの検索対象のまま、誤った単語全体のアクセントを借用せず、構成要素ごとの正確なピッチ区間を表示します。',
    'Kept multi-accent and component pitch graphs in the otherwise-unused upper-right header space on wide iPad sheets; narrow phone and desktop-hover popups still use the readable full-width row.': 'iPadの横幅の広いシートでは、複数アクセントおよび構成要素のピッチグラフを、空いていたヘッダー右上に配置するようにしました。幅の狭いスマートフォンやデスクトップのホバーポップアップでは、読みやすい全幅の行を引き続き使用します。',
    'Fixed the remaining double-size Yomu interface on Reddit in iPad Safari by compensating Safari\'s per-site full-page view scale across popovers, sheets, settings, notices, and the puck menu. Anchors, nested lookups, dragging, video avoidance, and screen-edge placement now share one coherent coordinate space, while inline readings, subtitles, OCR, normal-scale Reddit, other browsers, and other sites remain unchanged.': 'iPad版SafariのRedditで、よむの画面がまだ2倍の大きさになる問題を修正しました。Safariのサイトごとのページ全体の表示倍率を、ポップオーバー、シート、設定、通知、パックメニューで補正します。アンカー、入れ子の検索、ドラッグ、動画回避、画面端での配置を一貫した座標空間で扱い、本文内の読み、字幕、OCR、通常倍率のReddit、その他のブラウザー、その他のサイトは変更しません。',
    'Pitch stays attached to the vocabulary it actually describes. A word with an exact accent gets one whole-word underline; an aligned compound with only component accents keeps one clickable lookup target but shows separate component-colour segments. On a wide tablet sheet, multiple pitch graphs use the upper-right header space instead of consuming a full row.': 'ピッチ情報は、それが実際に表す語彙に結び付いたまま表示されます。完全一致のアクセントがある単語には単語全体の下線を1本表示し、構成要素のアクセントだけを持つ整列可能な複合語は、1つの検索対象を保ちながら構成要素ごとに色分けした区間を表示します。横幅の広いタブレットのシートでは、複数のピッチグラフを1行すべてに広げず、ヘッダー右上の空間を使用します。',
    'On Reddit in iPad Safari, Yomu-owned popovers, sheets, settings, notices, and the puck menu compensate Safari\'s per-site full-page view scale. Their text, touch targets, anchors, and screen-edge placement stay at the intended physical size without resizing Reddit content. Inline readings, subtitles, and OCR remain in the page\'s coordinate space so they stay aligned; normal-scale Reddit, other browsers, and other sites are left unchanged.': 'iPad版SafariのRedditでは、よむが所有するポップオーバー、シート、設定、通知、パックメニューがSafariのサイトごとのページ全体の表示倍率を補正します。Redditのコンテンツ自体は拡大縮小せず、文字、タッチ対象、アンカー、画面端での配置を本来の物理サイズに保ちます。本文内の読み、字幕、OCRはページの座標空間に残して位置を合わせ、通常倍率のReddit、その他のブラウザー、その他のサイトは変更しません。',
    'Kept Yomu\'s floating puck and radial controls at their intended size on Reddit mobile and tablet layouts by isolating them from Reddit\'s broad control zoom rules; other sites keep their existing sizing.': 'Redditのモバイル／タブレット表示で広範なコントロール拡大ルールの影響を受けないようにし、よむのフローティングパックとラジアル操作を本来のサイズに保つようにしました。他のサイトでは従来のサイズが維持されます。',
    'Card headwords now always show their reading as furigana when furigana is enabled: page-level furigana modes such as known-status and difficult-kanji no longer strip the ruby off popover, study, and search headwords, which previously made the reading fall back to a plain kana chip beside the word.': 'ふりがなが有効なとき、カードの見出し語には常に読みがふりがなとして表示されるようになりました。既知ステータスや難読漢字などのページ単位のふりがなモードが、ポップアップ・学習・検索の見出し語からルビを取り除くことはなくなり、以前のように読みが単語の横のかな表示に落ちることもありません。',
    'Kana-only headwords no longer repeat the identical kana reading beside the word; katakana headwords keep their hiragana reading.': 'かなのみの見出し語では、同一のかな読みが単語の横に重複表示されなくなりました。カタカナの見出し語にはひらがなの読みが引き続き表示されます。',
    'The study-page search detail header now renders the headword with furigana instead of plain text with the reading underneath.': '学習ページの検索詳細ヘッダーでは、見出し語が読みを下に添えたプレーンテキストではなく、ふりがな付きで表示されるようになりました。',
    'Aligned the Academy character art records with the shipped sprite sets: Rie\'s completed glasses performances and Aakash\'s refreshed portraits are now consistently registered across the runtime, ledgers, and offline manifest, so the character book, journal unlocks, and asset audits all reference art that actually exists.': 'アカデミーのキャラクター立ち絵の記録を、実際に同梱されたスプライト一式に合わせて整えました。リエの完成した眼鏡演技とアーカッシュの刷新された立ち絵が、ランタイム・台帳・オフラインマニフェスト全体で一貫して登録されるようになり、キャラクターブック・ジャーナルの解放・アセット監査のいずれもが実在する画像を参照します。',
    'Stabilized the popup font-stack check in the priority smoke suite: it now waits for the configured Japanese font stack to actually be applied to the popup before reading styles, instead of racing the font application on a loaded machine; this removes an intermittent false failure in CI with no change to what is verified.': '優先スモークテストのポップアップ・フォントスタック検査を安定させました。設定した日本語フォントスタックが実際にポップアップへ適用されるのを待ってからスタイルを読み取るようになり、負荷のかかったマシンでフォント適用と競合することがなくなりました。CIでの断続的な誤検出が解消され、検証内容に変更はありません。',
    'Tidied internal test-fixture and subtitle helper modules so that helpers used only within their own module are no longer exported or re-exported, clearing the dead-code checker warnings introduced by the recent test and controller refactors; no change to behavior or test coverage.': 'テストフィクスチャーと字幕ヘルパーの内部モジュールを整理し、モジュール内でのみ使われるヘルパーを外部に公開・再公開しないようにして、最近のテストとコントローラーのリファクタリングで生じたデッドコード検査の警告を解消しました。動作やテストの網羅性に変更はありません。',
    'Split the three remaining oversized reader test files (JPDB, New Tab review, settings form) into focused per-topic test modules with shared fixtures, and deleted the bespoke test-shard code-generator entirely; the test runner now shards ordinary files, cutting hundreds of lines of brittle harness code with no change to what is tested.': '残っていた3つの肥大化したリーダーのテストファイル（JPDB・新しいタブのレビュー・設定フォーム）を、共有フィクスチャーを用いてトピックごとの小さなテストモジュールに分割し、専用のテストシャード生成コードを完全に削除しました。テストランナーは通常のファイルをシャーディングするようになり、壊れやすいハーネスコードを数百行削減しました。テスト対象に変更はありません。',
    'Restored reliable furigana and pitch annotation across the homepage and every site in keyless mode. Jiten hydration now matches the correct entry key so fetched readings are applied instead of dropped, the background /info lookup timeout was raised from 1.5s to 4s so slower details still arrive, and transient network failures are cached with bounded TTLs plus limited retries and a backoff-aware deferred lane so a single hiccup no longer starves annotation.': 'キーなしモードで、ホームページとすべてのサイトのふりがなとピッチ付与が確実に復元されるようになりました。Jitenのハイドレーションが正しいエントリーキーに一致するようになり、取得した読みが破棄されずに適用されます。背景の `/info` 検索のタイムアウトを1.5秒から4秒に延ばし、遅い詳細情報も届くようにしました。また、一時的なネットワーク障害は上限付きのTTLでキャッシュし、回数制限付きの再試行とバックオフを考慮した遅延レーンを設けたことで、一度の不具合で付与が止まることがなくなりました。',
    'Aligned furigana for conjugated and okurigana-suffixed kanji-only surfaces (e.g. 接続して, 練習し, 理想的な, 追加する, 開始します), which previously rendered with no reading, and added re-resolution for misaligned public vocabulary words.': '活用や送り仮名が付いた漢字のみの表記（例：接続して、練習し、理想的な、追加する、開始します）にふりがなを揃えるようにしました。これらは以前は読みが表示されていませんでした。あわせて、表記がずれた公開語彙の再解決も追加しました。',
    'The release quality gate now runs its independent stages in parallel and reuses test workers, cutting a full check from roughly twenty minutes to a few minutes without dropping any test, build, or verification coverage.': 'リリース品質ゲートは独立した工程を並列に実行し、テストワーカーを再利用するようになりました。テスト・ビルド・検証のカバレッジを一切減らすことなく、フルチェックの所要時間が約20分から数分に短縮されます。',
    'Added a sub-minute advisory quick gate for everyday development that typechecks incrementally and runs only the tests affected by the current change.': '日々の開発向けに、1分未満で完了する参考用のクイックゲートを追加しました。差分に基づく増分型チェックと、現在の変更に関係するテストのみを実行します。',
    'Replaced the oversized rule beneath Academy\'s “Get a class code” action with a normal text underline that follows the label on desktop and mobile.': 'アカデミーの「クラスコードを取得」操作の下に表示されていた長すぎる線を、デスクトップでもモバイルでもラベルの文字に沿う通常の下線へ置き換えました。',
    'Extracted the subtitle parsed-content caches into a dedicated collaborator module, so cache keys, provisional entries, and enrichment retries live behind one narrow interface instead of ten loose fields on the subtitles controller; no behavior changes.': '字幕の解析済みコンテンツキャッシュを専用のコラボレーターモジュールに抽出しました。キャッシュキー・暫定エントリー・エンリッチメントの再試行が、字幕コントローラー上の10個のばらばらなフィールドではなく、1つの狭いインターフェースの背後にまとまりました。動作の変更はありません。',
    'Extracted the fullscreen top-layer host handling for subtitles into a dedicated collaborator module, isolating host discovery, caching, and reader-root reparenting; no behavior changes.': '字幕のフルスクリーン・トップレイヤーホスト処理を専用のコラボレーターモジュールに抽出しました。ホストの検出・キャッシュ・リーダールートの再配置が分離されました。動作の変更はありません。',
    'Extracted the karaoke word-highlight sampling for subtitles into a dedicated collaborator module; no behavior changes.': '字幕のカラオケ式単語ハイライトのサンプリングを専用のコラボレーターモジュールに抽出しました。動作の変更はありません。',
    'Internal working notes under the academy docs folder are now excluded from the documentation site build, so unsanitized note files can no longer break releases.': 'アカデミーのドキュメントフォルダー内の内部作業メモを、ドキュメントサイトのビルドから除外しました。未整理のメモファイルがリリースを壊すことはなくなりました。',
    'Word-plus-particle entries such as 実際は no longer show "Exact pitch unavailable": the reader now infers the pitch from the content word (実際) and also lists it as a navigable component, and expressions whose parts are joined by particles, such as 為すがまま, now show per-component pitch graphs (為す + まま) instead of no pitch at all.': '「実際は」のような単語＋助詞のエントリーで「完全一致のピッチは利用不可」と表示されなくなりました。リーダーが内容語（実際）からピッチを推定し、その単語を検索可能な構成要素としても表示します。また「為すがまま」のように助詞でつながれた表現では、ピッチがまったく表示されない代わりに構成要素ごとのピッチグラフ（為す＋まま）が表示されるようになりました。',
    "Kanji popovers now show each provider's own kanji frequency on the lookup pills, for example Jiten #516 next to JPDB Top 300-400, instead of showing no rank at all.": '漢字ポップアップの検索ピルに、各プロバイダー独自の漢字頻度が表示されるようになりました（例：Jiten #516 と JPDB Top 300-400 を並べて表示）。これまではランクが一切表示されませんでした。',
    'Jiten kanji details (keyword, readings, facts, and the new pill rank) no longer require a Jiten API key; keyless lookups ride the built-in Yomu edge proxy.': 'Jitenの漢字詳細（キーワード・読み・基本情報・新しいピルのランク表示）にJiten APIキーが不要になりました。キーなしの検索は内蔵のYomuエッジプロキシ経由で取得されます。',
    "Lookup pills now show each provider's own frequency rank (for example Jiten #1250 and JPDB #1400 side by side) on hosted pages: keyless Jiten lookups can use the built-in Yomu edge proxy again instead of failing silently, which previously left only one provider's rank visible.": '検索ピルに各プロバイダー独自の頻度ランクが表示されるようになりました（例：Jiten #1250 と JPDB #1400 を並べて表示）。ホスト版ページで、APIキーなしのJiten検索が内蔵のYomuエッジプロキシを再び利用できるようになり、これまで片方のプロバイダーのランクしか表示されなかった問題が修正されました。',
    "Removed a redundant per-word furigana colour measurement from the reader's contrast pass. Since 1.6.192 furigana inherits its base word's already-adjusted colour, so the separate measurement no longer affected anything on screen. No behavior changes.": 'リーダーのコントラスト処理から、単語ごとの冗長なふりがな色の計測を削除しました。1.6.192以降、ふりがなは基本単語の調整済みの色を継承するため、この個別の計測は画面上の表示に影響しなくなっていました。動作の変更はありません。',
    'Furigana readings now use the same colour as the base word they annotate rather than a muted grey, including in pitch-accent and word-status colour modes and in Firefox, where the reading previously stayed grey even when the base word was coloured.': 'ふりがなが、注釈対象の単語と同じ色で表示されるようになりました（従来はくすんだグレーでした）。ピッチアクセントや単語ステータスの色分けモードでも適用され、基本テキストに色が付いていてもふりがながグレーのままになっていたFirefoxの不具合も修正されています。',
    'Yomu popovers, sheets, and other overlay panels no longer render double-sized on mobile and iPad on sites like reddit.com; every Yomu surface now pins its declared text size so mobile-browser font boosting cannot inflate it.': 'reddit.comなどのサイトで、モバイルやiPadにおいてYomuのポップオーバー・シート・その他のオーバーレイパネルが2倍の大きさで表示されなくなりました。すべてのYomuサーフェスが指定された文字サイズを固定するようになり、モバイルブラウザーのフォントブースティングによって拡大されることはありません。',
    'Split the large subtitles-controller test file into focused per-topic test modules with a shared fixtures helper, and removed its bespoke shard-generator hook so the tests now run as ordinary files; no product behavior changes.': '大きくなっていた字幕コントローラーのテストファイルを、共有フィクスチャーヘルパーを用いてトピックごとの小さなテストモジュールに分割し、専用のシャード生成の仕組みを廃止して通常のファイルとして実行されるようにしました。製品の動作に変更はありません。',
    'Unified the New Tab review-submission code so every study provider (JPDB, Jiten, Anki, Bunpro, local Yomu deck) is graded through one table-driven adapter with a uniform credential/review/refresh/undo contract, replacing two near-duplicate provider ladders; grading behavior is unchanged.': '新しいタブのレビュー送信処理を統一し、すべての学習プロバイダー（JPDB・Jiten・Anki・Bunpro・ローカルのYomuデッキ）を、資格情報・レビュー・更新・取り消しの統一された仕組みを持つ1つのテーブル駆動アダプターで採点するようにしました。ほぼ重複していた2つのプロバイダー処理を置き換えたもので、採点の動作は変わりません。',
    'Extracted the subtitle transcript drawer into a dedicated collaborator module, isolating its row rendering and interaction handling; no behavior changes.': '字幕のトランスクリプト・ドロワーを専用のコラボレーターモジュールに抽出し、行の描画と操作処理を分離しました。動作の変更はありません。',
    'Extracted the New Tab word-search surface into a dedicated search controller module, moving search state, query handling, suggestions, handwriting recognition, and result rendering behind a narrow interface; the New Tab controller shrinks by roughly 1,200 lines with no behavior changes.': '新しいタブの単語検索サーフェスを専用の検索コントローラーモジュールに抽出しました。検索の状態・クエリ処理・候補表示・手書き認識・結果の描画が狭いインターフェースの背後にまとまり、新しいタブのコントローラーは約1,200行小さくなりました。動作の変更はありません。',
    'Extracted the New Tab statistics surface into a dedicated stats controller module, shrinking the New Tab controller and isolating stats rendering, source selection, and activity metrics behind a narrow interface; no behavior changes.': '新しいタブの統計サーフェスを専用の統計コントローラーモジュールに抽出しました。新しいタブのコントローラーが小さくなり、統計の描画・ソース選択・アクティビティ指標が狭いインターフェースの背後に分離されました。動作の変更はありません。',
    'Tampermonkey installs no longer stop running everywhere after a new release: companion libraries and the reader stylesheet are now published at immutable content-addressed URLs, so the integrity hashes pinned in the userscript header can never mismatch the served files. Previously each release changed the bytes behind the already-pinned companion URLs, and Tampermonkey silently disabled the whole script on every site; affected installs heal automatically on their next script-update check.': 'Tampermonkeyでのインストールが、新しいリリースのたびにすべてのサイトで動かなくなる問題を修正しました。コンパニオンライブラリとリーダーのスタイルシートは、内容に基づく不変のURLで公開されるようになり、ユーザースクリプトのヘッダーに固定された整合性ハッシュが配信ファイルと食い違うことがなくなりました。以前はリリースのたびに固定済みURLの内容が変わり、Tampermonkeyがすべてのサイトでスクリプト全体を静かに無効化していました。影響を受けたインストールは、次回のスクリプト更新チェックで自動的に復旧します。',
    'Unified the hosted PDF, Video, Study, and Academy navigation chrome with the main site, including consistent language/theme controls, Academy links, and a compact accessible theme switch.': 'ホスト版のPDF・動画・学習・アカデミーのナビゲーションを本サイトと統一しました。言語・テーマの操作、アカデミーへのリンク、コンパクトでアクセシブルなテーマ切り替えが一貫して使えます。',
    'Restored keyless homepage furigana and pitch enrichment after transient public Jiten failures, with bounded recovery for misaligned surface lookups.': '一時的な公開Jitenの障害後も、キーなしのホームページのふりがなとピッチ付与が回復するようになりました。表記がずれた検索にも上限付きの復旧を行います。',
    'Refined Academy utility navigation and destination-labelled presentation controls.': 'アカデミーのユーティリティナビゲーションと、行き先を明示したプレゼンテーション操作を改善しました。',
    "Opening the Speak (or Listen) study step no longer freezes the tab when a word's fetched pitch contour cannot be matched to its reading: the card re-rendered on every resolution of the cached pitch lookup in an endless loop, and now re-renders only when the enriched pitch actually yields a drillable item.": '発音(または聞き取り)の学習ステップを開いたとき、取得したピッチ輪郭が単語の読みと一致しない場合にタブが固まる問題を修正しました。カードがキャッシュ済みピッチ検索の解決のたびに無限に再描画されていましたが、取得したピッチが実際に練習可能な項目になる場合にのみ再描画するようになりました。',
    'Bunpro word-state colouring now follows the Bunpro token alone, matching how JPDB and Jiten colour words from their credentials: turning off Allow Bunpro review/mining no longer silently disables the state colours and hover status for a configured account.': 'Bunproの単語ステータス表示が、JPDBやJitenと同様にBunproトークンだけで動作するようになりました。「Bunproの復習・採掘を許可」をオフにしても、設定済みアカウントのステータス色とホバー表示が無効になることはありません。',
    'Dictionary lookups on the hosted pages (homepage demo, new-tab study) work again without any configured proxy: keyless Jiten parse and detail requests may once more ride the built-in Yomu edge proxy, which an old blanket flag from the third-party-proxy era had been blocking, leaving every lookup dead with "No configured proxy." on browsers without the userscript bridge (e.g. iPad Safari).': 'ホスト版ページ（ホームページのデモ、新しいタブの学習）での辞書検索が、プロキシを設定していなくても再び動作するようになりました。キーなしのJitenの解析・詳細リクエストが内蔵のYomuエッジプロキシを再び利用できるようになります。サードパーティ製プロキシ時代の古い一括フラグがこれを妨げており、ユーザースクリプトのブリッジがないブラウザー（iPadのSafariなど）ではすべての検索が「No configured proxy.」で失敗していました。',
    'Users with a Jiten API key on those same proxy-less hosted pages now degrade gracefully: when the keyed transport has no route at all, word-card and pitch fallback lookups fall back to the capped keyless public path instead of silently returning nothing.': '同じくプロキシのないホスト版ページでJiten APIキーを設定しているユーザーも、適切に段階的へ切り替わるようになりました。キー付きの通信経路がまったくない場合、単語カードとピッチの代替検索は黙って空を返す代わりに、上限付きのキーなし公開経路へ切り替わります。',
    'The new-tab study support banner now localizes its donation goal and monthly-progress line: the cost and goal meta text follows the interface language instead of always rendering the English fallback while the banner message and donate button around it were already translated.': '新しいタブの学習サポートバナーで、寄付目標と今月の進捗の行もローカライズされるようになりました。バナーのメッセージと寄付ボタンはすでに翻訳されていましたが、金額と目標のメタ表示も英語の既定文ではなくインターフェース言語に従うようになりました。',
    'Restored the GitHub Release gate after the annotation architecture changed: release smoke tests now verify source-preserving additive mirrors and no longer block publishing on an invented mini-guide shape that was not backed by live-page evidence.': '注釈アーキテクチャの変更後に停止していたGitHub Releaseのゲートを復旧しました。リリース用スモークテストは、元のテキストを保つ加算型ミラーを検証し、実ページの根拠がない架空のミニガイド形状によって公開を妨げないようになりました。',
    'Compound words now show a whole-word pitch contour only when the dictionary provides an exact whole-word expression-and-reading match. Yomu no longer invents a compound accent by concatenating component contours; independently sourced component pitch remains available as explicitly labelled component evidence.': '複合語の単語全体のピッチ輪郭は、辞書にその表記と読みが完全一致する単語全体の情報がある場合にのみ表示するようになりました。よむは構成語の輪郭を連結して複合語のアクセントを推測しません。各構成語について独立した出典があるピッチは、構成語の根拠であることを明示して引き続き表示します。',
    'Tapping or clicking a visible subtitle now briefly reveals its move handle, even when the caption was dragged below the video and the player controls have faded. Transparent space around captions remains click-through, so Yomu does not cover native player controls.': '表示中の字幕をタップまたはクリックすると、字幕を動画の下まで移動してプレーヤーの操作部が消えている場合でも、移動ハンドルが一時的に表示されます。字幕の周囲にある透明な領域は引き続きクリックを通すため、よむがプレーヤー本来の操作部を覆うことはありません。',
    'The installed userscript no longer decorates the yomureader.com homepage\'s own nav, hero marketing copy, CTA pills, install panel, or "what to do next" link grid with ruby/pitch furigana, which was destroying the tablet layout. The pre-rendered "Try me" sample stays annotated and interactive, and real docs prose is unaffected. As defence in depth, the site itself now strips any annotation an older installed copy already added to that chrome and marks it off-limits, so a not-yet-updated userscript can no longer break the layout.': 'インストール済みのユーザースクリプトは、yomureader.comホームページ自身のナビ、ヒーローの宣伝文、CTAピル、インストールパネル、「次にすること」のリンクグリッドにルビ／ピッチのふりがなを付けなくなりました。これはタブレット表示のレイアウトを崩していました。事前レンダリング済みの「Try me」サンプルは注釈とインタラクションを保ち、実際のドキュメント本文には影響しません。多層防御として、サイト側でも古いインストール済みのコピーがそのクロムに付けた注釈を取り除いて対象外に印を付けるため、まだ更新していないユーザースクリプトでもレイアウトを崩せなくなりました。',
    'The Install buttons and getting-started steps point at the v1.6.151 release asset so a fresh install pulls the current build.': 'インストールボタンと入門手順はv1.6.151のリリースアセットを指すため、新規インストールでは最新ビルドが取得されます。',
    'YouTube action chips and controls — the 質問する ask button, the 視聴 view count, subscribe, and live-chat notices — now render their furigana in a detached lane that never resizes the control, so the button/notice height, width, and baseline stay exactly as YouTube drew them; their pitch underline is anchored to the glyphs instead of dropping to the bottom edge of the chip. Reading content around them (chat messages, descriptions) keeps inline ruby.': 'YouTubeのアクションチップやコントロール（質問するボタン、視聴回数、チャンネル登録、ライブチャットの通知）は、コントロールの大きさを変えない切り離したレーンにふりがなを表示するようになりました。ボタンや通知の高さ・幅・ベースラインはYouTubeが描いたまま保たれ、ピッチの下線はチップの下端に落ちず文字に沿って表示されます。周囲の読み物本文（チャットメッセージや概要）はインラインのルビを保ちます。',
    'A truncated, expandable video description keeps its annotation inside the authored clip height instead of spilling the extra lines over the summary block below it.': '折りたたまれた展開可能な動画概要は、余分な行を下の要約ブロックにはみ出させず、元の切り抜き高さの中に注釈を収めます。',
    'Local-provider pitch accent (Jiten and JPDB) is now taken only from each word\'s own dictionary entry. A word with no listed accent stays uncoloured instead of borrowing the previous word\'s pattern, and the pitch-colour settings row for those words now reads simply "Unknown" rather than "Unknown / inherited".': 'ローカル提供元（JitenとJPDB）のピッチアクセントは、各単語自身の辞書エントリーからのみ取得するようになりました。アクセントが記載されていない単語は前の単語の型を借りず無着色のままになり、それらの単語のピッチ色設定の行は「不明／継承」ではなく単に「不明」と表示します。',
    'When a word has several accepted pitch patterns, the variant cards now share one footprint with each contour and percentage centred, so the first (source-preferred) reading no longer looks larger or more authoritative than the other legitimate readings; source order stays visible through the first card\'s accent-coloured percentage.': '単語に複数の有効なピッチ型がある場合、バリアントのカードは同じ大きさに揃い、各輪郭と割合を中央寄せで表示するようになりました。これにより最初の（出典が優先する）読みが他の正当な読みより大きく、権威があるようには見えなくなります。出典の順序は最初のカードのアクセント色の割合で分かります。',
    'A word\'s direct whole-word pitch now remains the primary top-right graph even when Jiten also exposes navigable inner components; for example 間違い keeps its pitch-3 contour while 間 and 違い remain available as secondary lookups.': 'Jitenが移動可能な内部構成語も示す場合でも、単語全体の直接ピッチを右上の主要グラフとして表示します。たとえば間違いは3型の輪郭を保ち、間と違いは補助的な検索先として引き続き利用できます。',
    'All five review-grade buttons use the same slightly smaller font on narrow phones, so the longer “Something” label fits without crowding its button.': '幅の狭いスマートフォンでは、5つの復習評価ボタンすべてに同じ少し小さめの文字サイズを使い、長い「Something」もボタン内に余裕をもって収まるようにしました。',
    'Long compounds with both whole-word and constituent pitch data now keep one authoritative component view, so inline underlines and popup graphs agree for terms such as 双子座流星群.': '単語全体と構成語の両方にピッチ情報がある長い複合語は、構成語表示を一貫して優先します。これにより、双子座流星群のような語でも本文の下線とポップアップのグラフが一致します。',
    'Multiple accepted pitch patterns now show compact percentages instead of "Most common" and "Also used". Source-order-only data is displayed as relative shares that total 100%, while measured commonality will take precedence when a source supplies it.': '複数の有効なピッチ型は、「最も一般的」「他の型」という文言ではなく、コンパクトな割合で表示します。出典が順序だけを示す場合は合計100%になる相対比率を使い、実測の一般度が提供される場合はその値を優先します。',
    'Furigana in compact single-line tabs and “show more” rows now opens every safe ancestor clip, so readings are no longer cut off even when both the label and its fixed-height parent hide overflow.': 'コンパクトな1行タブや「さらに表示」の行では、安全な祖先要素のクリップをすべて開くようにしました。ラベルと固定高の親要素の両方がオーバーフローを隠していても、ふりがなが切れません。',
    'Furigana no longer writes height or padding into grid and table track sizing, preventing annotated results, fixtures, schedules, and other structured cards from stretching into oversized blank rows while keeping their readings visible.': 'ふりがながグリッドや表のトラックサイズ計算へ高さやパディングを書き込まないようにしました。読みは表示したまま、注釈付きの結果・一覧・予定表などの構造化されたカードが大きな空白行へ引き伸ばされることを防ぎます。',
    "Pitch resolved after a cold popup opens now updates that same connected popup's graph and headword underline without requiring another hover or a page rescan. Exact canonical inflection matches refresh the popup automatically; unresolved fragments show a localized “Exact pitch unavailable” status instead of a silent blank. Late results cannot repaint a superseded popup, cross an unproven expression-and-reading identity, or synthesize compound pitch.": '初回のポップアップ表示後に解決したピッチは、再ホバーやページ全体の再走査を必要とせず、同じ接続中のポップアップのグラフと見出し語の下線を更新します。活用形から正規形への完全一致が確認できた場合はポップアップを自動更新し、解決できない断片には空白のままではなく、ローカライズされた「完全一致のピッチは利用不可」を表示します。遅れて届いた結果が置き換え済みのポップアップを再描画したり、未確認の表記と読みの組み合わせをまたいだり、複合語のピッチを合成したりすることはありません。',
    'Study pool selection (which cards enter the word, recall, kanji, and listen queues, including kanji card synthesis and the pitch-eligibility filter) moved out of the new-tab controller into its own module with an explicit dependency surface, unchanged behavior, and the recent pitch seeding fix carried along.': '学習プールの選択（単語・リコール・漢字・リスニングの各キューにどのカードが入るか。漢字カードの合成やピッチ適格フィルターを含む）が、新しいタブのコントローラーから独自のモジュールへ移りました。依存関係が明示され、動作は変わらず、最近のピッチシード修正もそのまま引き継がれています。',
    'Truncating labels that receive their clipping styles late (mobile YouTube renders its chrome in stages) are now re-examined once the page settles, so detached furigana can no longer sit inside a freshly clipped label and squeeze its text into an ellipsis, and readings anchored before a late layout shift no longer float away from their word.': 'クリップ用スタイルが遅れて適用されるラベル（モバイル版YouTubeはクロームを段階的に描画します）を、ページが落ち着いた時点で再検査するようになりました。分離ふりがなが後からクリップされたラベルの中に残ってテキストを省略記号に押し込むことはなくなり、遅いレイアウト変化の前に固定された読みが単語から離れて浮遊することもありません。',
    'The settings dialog now paints in your interface language on the first frame instead of flashing English and rewriting itself: every option list and label is sourced from one shared table used by both initial render and live language switching, and a third stray copy of the colour-source list was removed.': '設定ダイアログが、英語で表示してから書き換えるのではなく、最初のフレームからインターフェース言語で描画されるようになりました。すべての選択肢リストとラベルは、初回描画とライブ言語切り替えの両方が使う1つの共有テーブルから供給され、カラーソースリストの3つ目の余分なコピーは削除されました。',
    'The OCR engine\'s supporting machinery (Google Lens request encoding, image preprocessing, overlay geometry, page signatures, and the recognizer transports) now lives in five focused modules instead of one 6,000-line file, with byte-identical behavior.': 'OCRエンジンの支援機構（Google Lensリクエストのエンコード、画像前処理、オーバーレイ幾何、ページ署名、認識トランスポート）が、6,000行の1ファイルではなく5つの焦点を絞ったモジュールに分かれました。動作はバイト単位で同一です。',
    'New-tab study bookkeeping was consolidated: the per-step answer and outcome state for each card lives in one structure instead of eight parallel maps, async staleness guards started migrating to a shared latest-wins helper, and eight session caches that previously grew without limit are now bounded (one of them was never cleared at all).': '新しいタブの学習管理を整理しました。カードごとのステップ別回答・結果の状態が8つの並列マップではなく1つの構造にまとまり、非同期の鮮度ガードは共有の最新優先ヘルパーへの移行を開始し、これまで無制限に増えていた8つのセッションキャッシュに上限が付きました（うち1つは一度もクリアされていませんでした）。',
    'The smoke-test harness was fully triaged: 21 verified headless regression guards now run nightly in CI as one aggregate, 38 live-site/manual harnesses moved to a documented manual directory, and 10 scripts whose scenarios are covered by unit tests were removed. Regressions those scripts guarded can no longer slip through silently.': 'スモークテストのハーネスを全面的に仕分けしました。検証済みのヘッドレス回帰ガード21本がCIで毎晩ひとつの集約として実行され、実サイト・手動ハーネス38本は文書化された手動ディレクトリへ移動し、ユニットテストでカバー済みのシナリオを持つスクリプト10本は削除されました。これらのスクリプトが守っていた回帰が音もなくすり抜けることはもうありません。',
    'The jpdb.io proxy-candidate policy now has a single owner module, with tests pinning the candidate order per environment; five verbatim policy copies were removed from the API client without touching its rate-limit and backoff behavior.': 'jpdb.ioのプロキシ候補ポリシーは単一のオーナーモジュールが持つようになり、環境ごとの候補順をテストが固定します。APIクライアントから5つの逐語コピーを削除しましたが、レート制限とバックオフの動作には手を触れていません。',
    'Consolidated duplicated internal helpers into shared modules: the YouTube configuration scraper, string/async/object utilities, abort-error detection (now also recognizing DOMException-based aborts), fullscreen detection, and the new-tab immersion carousel now each live in one place instead of up to seven copies. Behavior is unchanged and the core script shrank slightly.': '重複していた内部ヘルパーを共有モジュールに統合しました。YouTube設定スクレイパー、文字列・非同期・オブジェクトのユーティリティ、中断エラー検出（DOMExceptionベースの中断も認識するようになりました）、フルスクリーン検出、新しいタブの没入カルーセルが、最大7か所のコピーではなくそれぞれ1か所に置かれます。動作は変わらず、コアスクリプトはわずかに軽くなりました。',
    'Detached furigana no longer widens truncating labels or floats away from its word: readings inside a clipped row that cannot safely grow are now rest-hidden on every channel (they remain available on hover and in the popover), fixing the mobile YouTube Shorts action labels rendering as 共… / 高く評… and the floating reading over the watch-page view counter. The clip detection also looks through web-component boundaries so component-based sites resolve the same rows.': '分離表示のふりがなが、省略されるラベルの幅を広げたり単語から離れて浮遊したりしなくなりました。安全に広げられないクリップ行の読みは、どのチャンネルでも静止時に非表示になります（ホバーやポップオーバーでは引き続き表示されます）。これにより、モバイル版YouTubeショートの操作ラベルが「共…」「高く評…」と表示される問題や、視聴回数の上に読みが浮かぶ問題が修正されます。クリップ検出はWebコンポーネントの境界も見通すため、コンポーネントベースのサイトでも同じ行が解決されます。',
    'Immersion example audio now plays on strict-CSP hosts such as claude.ai and chatgpt.com: example playback goes through the shared audio player, whose Web Audio fallback decodes the pre-fetched audio bytes when the page refuses media-element URLs.': 'claude.aiやchatgpt.comのような厳格なCSPを持つホストでも、没入例文の音声が再生されるようになりました。例文の再生は共有オーディオプレイヤーを経由し、ページがメディア要素のURLを拒否した場合はWeb Audioフォールバックが事前取得済みの音声バイトをデコードします。',
    'The kanji-study companion and the study new-tab app each shed ~69KB by moving an embedded grammar example table into the test suite; the table was only ever consumed by tests while real examples load from the remote grammar data.': '漢字学習コンパニオンと学習用新しいタブアプリが、組み込みの文法例文テーブルをテストスイートへ移動することでそれぞれ約69KB軽くなりました。このテーブルはテストからしか使われておらず、実際の例文はリモートの文法データから読み込まれます。',
    'Removed dead code and styles accumulated across releases: the unused gaming capture/lookup IPC surface, superseded CSS selector clusters, and no-op wrappers. A new automated check keeps translation copy keys from going orphaned, and restored regression tests re-pin two long-standing double-image protections.': 'リリースを重ねて蓄積した不要なコードとスタイルを削除しました。未使用のゲーミング用キャプチャ・検索IPC、置き換え済みのCSSセレクタ群、何もしないラッパーなどです。新しい自動チェックが翻訳コピーキーの孤立を防ぎ、復元された回帰テストが長年の二重表示保護を再び固定します。',
    'Duration words stay whole after numbers on the keyless segmentation path: 3時間前 no longer shatters into per-character words with mismatched colours even when no local dictionary is installed (complementing the dictionary-evidence boundary repair, which needs an enabled dictionary), and 年間/分間/日間/月間 are covered by the same counter+間 class rule.': 'キーなしの分かち書きパスでも、数字の後の期間語がひとまとまりのままになりました。ローカル辞書が未導入でも 3時間前 が文字ごとの色違いの単語に砕けることはなくなり（辞書の証拠に基づく境界修復——有効な辞書が必要——を補完します）、年間・分間・日間・月間も同じ「助数詞＋間」の規則でカバーされます。',
    'Yomu popovers and settings are no longer inflated on sites that ship global element resets (Reddit): the reader interface rolls host margins back on every sectioning element it builds from, including during the brief window before the full stylesheet loads.': 'グローバルな要素リセットを持つサイト（Reddit）で、Yomuのポップオーバーや設定が間延びしなくなりました。リーダーのインターフェースは、自身を構成するすべてのセクション要素についてホスト側の余白を巻き戻します。完全なスタイルシートが読み込まれる前の短い時間帯も対象です。',
    'Updating a revisioned local dictionary such as Jitendex now replaces the previous copy instead of installing a second one, and existing duplicate copies are cleaned up automatically, keeping the newest import. Duplicates doubled the stored entries and slowed every lookup.': 'Jitendexのような版付きローカル辞書を更新すると、2つ目としてインストールされるのではなく以前のコピーが置き換えられるようになりました。既存の重複コピーも自動的に整理され、最新のインポートが保持されます。重複は保存エントリを倍増させ、すべての検索を遅くしていました。',
    'A slow local dictionary lookup now fills its popover section late instead of never: the initial render stays fast, and the full result hydrates in when it arrives instead of being discarded at the render deadline.': '遅いローカル辞書の検索結果が、表示されないのではなく遅れてポップオーバーの該当セクションに反映されるようになりました。最初の描画は高速なまま、完全な結果は描画期限で破棄されず、届いた時点で反映されます。',
    'Web-component sites now annotate correctly end to end: Yomu\'s stylesheet reaches open shadow roots (fixing doubled text such as Reddit\'s join button and sort menu), component re-renders schedule rescans so buttons no longer wait for a tap to gain their annotations, and Japanese nested more than four component layers deep (Reddit\'s sort order and pinned labels) is covered by a bounded continuation instead of silently dropped.': 'Webコンポーネントを使うサイト全体で注釈が正しく機能するようになりました。Yomuのスタイルシートがオープンなシャドウルートに届くようになり（Redditの参加ボタンや並べ替えメニューの文字が二重に見える問題を修正）、コンポーネントの再描画が再スキャンを予約するためボタンはタップを待たずに注釈を得られ、4層を超えて入れ子になった日本語（Redditの並び順やピン留めラベル）も黙って切り捨てられずに段階的な継続処理でカバーされます。',
    'Short chrome labels that truncate sideways, such as the mobile YouTube share button, keep their full text: horizontally clipped ellipsis rows now route readings to the detached channel instead of stretching the label into its ellipsis.': 'モバイル版YouTubeの共有ボタンのように横方向に省略される短いラベルが、全文を保つようになりました。横方向にクリップされる省略行は、ラベルを引き伸ばして省略記号にしてしまう代わりに、読みを分離チャンネルに送ります。',
    'Subtitle and reading annotations over video controls disappear together with the controls: overlay mirrors inherit the page\'s own visibility instead of forcing themselves visible, so no stray underline floats over the video after YouTube fades its control bar.': '動画コントロール上の字幕や読みの注釈が、コントロールと一緒に消えるようになりました。オーバーレイのミラーは自らを強制表示せずページ自身の可視状態を継承するため、YouTubeがコントロールバーをフェードアウトした後に下線だけが動画の上に浮遊することはありません。',
    'Yomu subtitles now bind on mobile YouTube Shorts: the player-frame resolver understands the mobile reel cells, so the recycled off-screen video element no longer fails the visibility gates.': 'モバイル版YouTubeショートでYomuの字幕が表示されるようになりました。プレイヤー枠のリゾルバーがモバイルのリールセルを理解するため、再利用される画面外の動画要素が可視判定に落ちることはもうありません。',
    'The hosted docs homepage now annotates its own Japanese chrome: the hero headline and tagline, the navigation bar, the install panel, and the next-step grid receive the same passive residual coverage as every other site, so no visible Japanese text stays bare in Japanese mode. Link navigation is preserved and decoration stays bounded by the per-element layout guards.': 'ホスト版ドキュメントのホームページが、自身の日本語クロームにも注釈を付けるようになりました。ヒーローの見出しとキャッチコピー、ナビゲーションバー、インストールパネル、次のステップのグリッドが、他のすべてのサイトと同じパッシブな残余カバレッジを受けるため、日本語モードで目に見える日本語テキストが未注釈のまま残りません。リンクのナビゲーションは維持され、装飾は要素ごとのレイアウトガードの範囲内に収まります。',
    'The audio service kill-switch now also disables the raw audio object route, so disabling the service stops serving audio bytes instead of only hiding lookups.': '音声サービスの停止スイッチが、生の音声オブジェクトのルートも無効化するようになりました。サービスを無効にすると、検索結果を隠すだけでなく音声バイトの配信も停止します。',
    'Defined the missing success, warning, muted-text, and muted-surface colour tokens, restoring the green confidence badges, the active Anki deck toggle accent, and dictionary card backgrounds that undefined token references silently dropped.': '欠落していた成功・警告・淡色テキスト・淡色サーフェスのカラートークンを定義し、未定義トークンの参照によって暗黙に失われていた緑の信頼度バッジ、有効なAnkiデッキトグルのアクセント、辞書カードの背景を復元しました。',
    'Jiten and JPDB lookup pills now keep independently verified frequency ranks for the exact spelling and reading, so late provider responses cannot overwrite one another and ambiguous matches do not show a misleading rank.': 'JitenとJPDBの検索ピルが、完全一致する表記と読みに対して、それぞれ独立して検証した頻度順位を保持するようになりました。遅れて届いた提供元の応答が互いの順位を上書きせず、曖昧な一致に誤解を招く順位を表示しません。',
    'Exact local Yomitan entries, including Jitendex dictionaries, no longer disappear when another enabled dictionary fills the shared result cap. Bunpro source loading also retains distinct disabled, authentication, no-match, timeout, and error states instead of collapsing them into a missing result.': 'Jitendex辞書を含む完全一致のローカルYomitan項目が、別の有効な辞書だけで共有の結果上限に達した場合でも消えないようになりました。Bunproのソース読み込みも、無効・認証・一致なし・タイムアウト・エラーの各状態を、単なる結果なしへまとめず個別に保持します。',
    "Bunpro definitions now normalize raw JLPT and part-of-speech metadata, avoid repeating vocabulary meanings as accepted answers, and rely on the popup's existing Bunpro action instead of showing a second link.": 'Bunproの定義で、生のJLPTと品詞メタデータを読みやすい形に整え、語彙の意味を正解候補として重複表示しないようにしました。2つ目のリンクは表示せず、ポップアップに既にあるBunpro操作を使います。',
    "Bunpro detail examples now use the same collapsible sentence presentation as Jiten and JPDB while preserving each provider's own sentence identity and highlighting. An authoritative empty example list remains distinct from authentication, network, and response-schema failures, and Yomu does not invent Bunpro composition or usage relations.": 'Bunproの詳細例文を、各提供元固有の文識別と強調表示を保ったまま、JitenやJPDBと同じ折りたたみ式の文表示に統一しました。正式な空の例文一覧と、認証・通信・応答形式の失敗は区別し、よむがBunproの構成関係や使用関係を作り出すことはありません。',
    'On touch/coarse-pointer layouts, clipped multi-line mirrors now keep individually safe detached readings visible at rest while continuing to hide any reading that would clip or overlap another line.': 'タッチ／粗いポインターのレイアウトでは、クリップされた複数行ミラーでも安全な分離読みを通常時に表示し、切れたり他の行と重なったりする読みだけを引き続き非表示にします。',
    'The subtitle control rail no longer flickers over videos that autoplay on hover: a rapidly changing player-chrome fade signal is now debounced, so the rail stays steady instead of strobing in and out.': 'ホバーで自動再生する動画の上でも字幕操作レールがちらつかなくなりました。プレーヤーのコントロール表示が激しく切り替わる信号を抑制するようにしたため、レールが点滅せず安定して表示されます。',
    'The subtitle control rail now fully disappears when idle on players without a native fade signal, instead of leaving a minimised grip stub visible forever.': 'ネイティブのフェード信号がないプレーヤーでは、待機時に字幕操作レールが完全に消えるようにしました。最小化されたつまみだけがいつまでも残ることがなくなります。',
    'The subtitle rail pin and move grip is easier to tap: a small amount of finger jitter is treated as a tap so the pin toggle fires reliably instead of being mistaken for a drag.': '字幕レールのピン兼移動つまみをタップしやすくしました。指の小さなぶれはタップとして扱うため、ドラッグと誤認されずにピンの切り替えが確実に動作します。',
    'A pinned subtitle control rail now stays fully visible and never auto-hides or auto-collapses, even as the pointer moves across the video or the player goes idle.': 'ピン留めした字幕操作レールは常に完全表示のままになり、ポインターが動画上を移動してもプレーヤーが待機状態になっても、自動的に隠れたり折りたたまれたりしません。',
    'Popup audio controls stay pinned to the top-right when a word has multiple pitch-accent graphs. Two or three variants now share a compact full-width row with balanced spacing and wrap cleanly on narrow screens.': '複数のピッチアクセントグラフがある単語でも、音声ボタンを右上に固定しました。2つまたは3つのグラフは余白を揃えたコンパクトな全幅行に並び、狭い画面ではきれいに折り返します。',
    'Repeated compound words keep their constituent pitch-accent segments, so proper compound underlines no longer degrade to one flattened pattern after the first occurrence.': '同じ複合語が繰り返し現れても構成語ごとのピッチアクセントを保持し、2回目以降に下線が単一の平坦なパターンへ崩れないようにしました。',
    'Discord and other framework-managed chats immediately preserve newly appended message text while Yomu refreshes annotations, preventing suffixes such as': 'Discordなどのフレームワーク管理チャットで、よむが注釈を更新している間も追記されたメッセージをすぐ表示し、次のような接尾部が',
    'from briefly disappearing.': '一時的に消えないようにしました。',
    'Help now shows the installed Yomu version in split userscript builds instead of': '分割ユーザースクリプト版のヘルプで、インストール済みのよむバージョンを次の代替表示ではなく正しく表示します：',
    '. On Chromium with Tampermonkey, Update opens the dashboard update-check instructions instead of triggering Chrome’s blocked website-install banner; release verification also rejects a settings companion that loses its version or canonical Study update endpoint.': '。Chromium版Tampermonkeyでは、「更新」からダッシュボードの更新確認手順を開き、Chromeのウェブサイトインストール拒否警告を回避します。リリース検証では、バージョンまたは正規のStudy更新先を失った設定コンパニオンも拒否します。',
    'Popup grammar tags such as': 'ポップアップの文法タグ（例：',
    'are expanded into readable labels instead of exposing dictionary shorthand.': '）を辞書の略号のまま表示せず、読みやすい説明へ展開します。',
    'Unreleased': '未公開',
    '[Unreleased]': '[未公開]',
    'Yomu Academy account/profile deletion now returns a privacy-minimized 90-day receipt while retaining declared minimal payment/redemption audit records, and a credential-gated live proof can bind real Google recovery, two-device pairing, deployed-client export, deletion, hosted app bytes, Worker version, migrations, and reviewed git commit without forging provider callbacks.': 'Yomu Academy のアカウントまたはプロファイルを削除すると、宣言済みの最小限の決済・コード利用監査記録を保持しつつ、プライバシーに配慮した 90 日間の受領記録を返すようになりました。認証情報で保護されたライブ検証では、プロバイダーのコールバックを偽造せずに、実際の Google 復旧、2 台のデバイス連携、デプロイ済みクライアントによるエクスポート、削除、ホスト版アプリのバイト列、Worker バージョン、マイグレーション、レビュー済み Git コミットを紐付けられます。',
    'Academy Google linking now rolls back paid-code redemption and every account/profile write on conflicts or later failures and logs only a fixed failure category. Signed session-bound export traversals terminate beyond 24,000 records without shared-NAT budget coupling, and account holders can delete encrypted profile data without deleting their identity.': 'Academy の Google 連携は、競合や後続処理の失敗時に有料コードの利用とすべてのアカウント・プロファイル書き込みをロールバックし、固定の失敗分類だけをログに記録するようになりました。署名付きでセッションに紐付いたエクスポート巡回は、共有 NAT の予算に影響されず 24,000 件を超えても完了し、アカウント保有者は自分の本人情報を削除せずに暗号化プロファイルデータを削除できます。',
    'Testing': 'テスト',
    'Academy': 'アカデミー',
    "Kanji drilldown keyword pills now add Kanji Alive's official primary gloss alongside Jiten or JPDB, RTK, and imported dictionaries. Matching glosses merge under one source badge; distinct glosses stay separate across reader popups, Study reveals, and kanji search. The compact hosted extract is pinned to Kanji Alive's CC BY 4.0 data and loads only when the optional Kanji Map origin source is enabled.": '漢字詳細のキーワードピルに、JitenまたはJPDB、RTK、インポート済み辞書と並んで、Kanji Alive公式の代表的な英語グロスを追加しました。同じグロスは出典をまとめた1つのピルに統合し、異なるグロスはリーダーのポップアップ、学習ページの答え表示、漢字検索のすべてで別々に表示します。コンパクトなホスト版データはKanji AliveのCC BY 4.0データに固定し、任意のKanji Map由来情報を有効にした場合だけ読み込みます。',
    'At the top, keyword pills compare the primary Jiten or JPDB keyword with RTK, imported dictionaries, and an official Kanji Alive gloss. Matching text merges into one sourced pill; genuinely different glosses remain separate.': '上部のキーワードピルでは、JitenまたはJPDBの代表キーワードを、RTK、インポート済み辞書、Kanji Alive公式のグロスと比較できます。同じ文言は出典付きの1つのピルに統合し、本当に異なるグロスは別々に表示します。',
    'Source-labelled keywords': '出典付きキーワード',
    'from Jiten or JPDB, RTK, imported dictionaries, and Kanji Alive; matching glosses merge while distinct glosses remain separate.': 'JitenまたはJPDB、RTK、インポート済み辞書、Kanji Aliveのキーワードを表示し、同じグロスは統合して異なるグロスは別々に保ちます。',
    "Academy's first Lesson 0 task now records one learner-owned journal line, schedules exactly one Yomu review, and shows both rewards with an immediate answer-concealed replay. On narrow phones, the Yomu puck moves clear of the portrait-selection action strip.": 'アカデミーのレッスン0で最初の課題を終えると、学習者自身の日誌に1行を記録し、Yomuの復習をちょうど1件予定するようになりました。完了画面には両方の獲得内容と、答えを再び隠してすぐに再挑戦できる操作を表示します。幅の狭いスマートフォンでは、Yomuのパックをポートレート選択の操作帯と重ならない位置へ移動します。',
    'Academy Lesson 0 now enters through the sourced Genki greeting and class-present moment before teaching the Moodle hiragana A-row. Its multimodal kana route uses Yomu pronunciation instead of browser speech, accepts romaji or kana with IME-safe feedback, and requeues any supported mastery item before completion.': 'アカデミーのレッスン0は、Moodleのひらがな「あ行」を教える前に、出典付きのGenkiのあいさつと出席の場面から始まるようになりました。複数の感覚を使うかな練習では、ブラウザーの読み上げではなくYomuの発音機能を使い、IMEに配慮したフィードバック付きでローマ字またはかなの入力を受け付けます。ヒントを使った習得問題は、完了前にもう一度自力で答えるためキューへ戻ります。',
    'The Academy N5 placement mock now plays its two byte-verified Soya recordings through the shared listening registry. N4–N1 remain clearly labelled exact-text browser speech until their specific recordings are reviewed and packaged, and changing placement level still preserves story progress.': 'アカデミーのN5レベル判定モックは、バイト単位で検証済みのSoya音声2件を共有リスニングレジストリから再生するようになりました。N4〜N1は、それぞれの専用音声が確認・収録されるまで、原文どおりのブラウザー読み上げであることを明示します。判定レベルを変更しても物語の進行状況は保持されます。',
    'N3 Academy entry now uses the exact Moodle-owned Minna 074 listening task and packaged recording. The existing adaptive learner model chooses guided, placement-backed test-out, repair, or independent support while keeping all story and encounter progress untouched.': 'アカデミーのN3開始ルートは、Moodleで提供されたMinna 074のリスニング課題と収録済み音声をそのまま使用します。既存の適応型学習者モデルが、ガイド付き、レベル判定に基づくテストアウト、復習、または自立学習を選び、物語と出会いの進行はそのまま保持します。',
    'Learn through the guided course with the same vocabulary collection and review history.': '同じ単語コレクションと復習履歴を使い、ガイド付きコースで学べます。',
    "Study no longer exposes an unrevealed card's provider id, spelling, reading, or answer in the address bar. It uses a local opaque history token until reveal, creates a portable link only after reveal, and leaves Academy's embedded Study URL untouched.": '学習ページは、未表示のカードのプロバイダーID、表記、読み、答えをアドレスバーに表示しなくなりました。答えを表示するまではローカルの不透明な履歴トークンを使い、表示後にのみ共有用リンクを作成します。Academy内に埋め込まれた学習画面はAcademyのURLを変更しません。',
    'Furigana no longer paints over the line above inside multi-line clamped rows (Google-style result snippets, feed previews): such rows keep pitch underlines and hover lookup but hide at-rest readings, single-line rows keep their reading lane even when padded, and late-enriched readings obey the same rule instead of flickering in.': '複数行にクランプされた行（Google風の検索結果スニペットやフィードのプレビュー）で、ふりがなが上の行の文字に重なって描画されなくなりました。こうした行はピッチ下線とホバー辞書を保ちつつ通常時の読みを非表示にします。1行の行はパディングがあっても読み表示のスペースを保ち、後から補完された読みも同じルールに従うため、ちらつきません。',
    "A rail button left focused after a tap no longer blocks YouTube's own player controls from fading, in every rail mode including the new stays-expanded one.": 'タップ後にフォーカスが残ったレールのボタンが、YouTube自身のプレーヤーコントロールのフェードを妨げなくなりました。新しい「展開したまま」モードを含む、すべてのレールモードで適用されます。',
    'Grades queued offline can no longer be silently lost when a reconnect sync overlaps a new offline grade: queue writes are serialized, a landed grade re-arms the connection-lost prompt, and partial multi-provider failures keep the silent queue instead of offering a retry that could double-grade.': 'オフラインで保存した採点が、再接続の同期と新しいオフライン採点が重なった際に静かに失われることがなくなりました。キューへの書き込みは直列化され、送信に成功した採点は接続切断ダイアログを再度有効にし、複数プロバイダーの一部だけが失敗した場合は二重採点になり得る再試行を提示せず、静かなキュー保存を維持します。',
    'The Study page now asks what to do when the connection is lost mid-review — Stop Reviewing, Continue Offline, or Retry — and grades made offline queue and sync when you are back online.': '学習ページで、レビュー中に接続が切断された場合の選択肢（レビューを中止・オフラインで続行・再試行）を確認するようになりました。オフラインでの採点はキューに保存され、オンラインに戻ると同期されます。',
    'The writing step shows the full example sentence as a copy-and-fill exercise right after the word step: words you have not graded out keep furigana, the studied word is blanked, and the whole typed sentence is checked with the filled word deciding correct versus accepted.': '書き取りステップは単語ステップの直後に、例文全体を書き写して空所を埋める練習として表示します。まだ習得していない単語にはふりがなが付き、学習中の単語は空欄になります。入力した文全体をチェックし、空欄に入れた単語で「正解」か「許容」かを判定します。',
    'Study example sentences are now chosen n+1 style: candidates from the card, JPDB, and Immersion Kit are scored against your known words, and the sentence introducing at most one new word wins so you always read just above your level.': '学習の例文はn+1方式で選ばれるようになりました。カード自体・JPDB・Immersion Kitの候補を既知単語と照合してスコア付けし、新しい単語が最大1つの文が選ばれるため、常に自分のレベルの少し上を読めます。',
    "Discord and other dark app shells whose computed colors use formats outside Yomu's analytic parsers no longer render annotated text as solid dark bars: every CSS color now normalises through a canvas probe, and an unparseable painted backdrop falls back to the dark page surface instead of white.": '計算済みカラーがYomuの解析パーサー対象外の形式を使うDiscordなどのダークなアプリで、注釈付きテキストが黒い帯のように塗りつぶされる問題を修正しました。すべてのCSSカラーをcanvasプローブで正規化し、解析できない背景は白ではなくダークなページ面へフォールバックします。',
    "Tapping the studied word on the study reveal opens the word's own popover again instead of a per-kanji popup; kanji drilldown stays available through the popover's composed-of chips.": '学習の答え表示で単語をタップすると、漢字ごとのポップアップではなく単語自体のポップオーバーが開くようになりました。漢字の詳細はポップオーバー内の構成チップから引き続き確認できます。',
    'The study reveal no longer repeats the pitch graph after the pitch step — the headword keeps its pitch-coloured underline — and the Immersion Kit example always renders above the dictionary sources.': '学習の答え表示では、ピッチステップの後にピッチグラフを繰り返し表示しなくなりました。見出し語はピッチ色の下線を保ちます。また、Immersion Kitの例文は常に辞書ソースの上に表示されます。',
    "Compound words whose pitch is composed from constituent accents now paint both colours on the one word: the page underline splits per constituent and the popover graph draws each constituent's contour in its own colour, while the composed-of chips keep linking the sub-words.": '構成語のアクセントから合成された複合語のピッチは、1つの単語に両方の色を描くようになりました。ページの下線は構成語ごとに分かれ、ポップオーバーのグラフも各構成語の輪郭をそれぞれの色で描画します。構成チップからは引き続き各構成語を参照できます。',
    'The subtitle control rail lost its pin button: the drag grip itself toggles between stays-expanded and minimised, the rail hides entirely while the player chrome is hidden, starts minimised and less prominent, and no longer appears when you tap subtitle words or move the subtitle line.': '字幕コントロールレールからピンボタンを削除しました。ドラッグ用グリップ自体が「展開したまま」と「最小化」を切り替えます。プレーヤーのコントロールが隠れている間はレールも完全に非表示になり、初期状態は最小化されて控えめです。字幕の単語をタップしたり字幕行を移動してもレールは表示されません。',
    'YouTube and Reddit now share the generic visible-page and web-component scanner: component boundaries, late menus, comments, navigation labels, and residual text no longer disappear behind profile budgets or shared-node deduplication.': 'YouTubeとRedditで汎用の可視ページ／Webコンポーネント走査を共有するようにしました。コンポーネント境界、後から表示されるメニュー、コメント、ナビゲーションラベル、残余テキストが、プロファイルの走査枠や共有ノードの重複排除によって消えなくなりました。',
    'Compact controls keep their native geometry while showing detached furigana and pitch, and pressed words can enrich missing pitch on every site. Composite cards also expose their loaded Jiten subwords when local dictionary segmentation is unavailable.': 'コンパクトな操作部品は本来の形状を保ったまま、分離表示のふりがなとピッチを表示します。押した単語では、すべてのサイトで不足しているピッチ情報を補完します。複合語カードは、ローカル辞書で分割できない場合も、読み込み済みのJiten構成語を表示します。',
    'Subtitle transcript tracking pauses only after direct wheel, touch-drag, native-scrollbar, or scroll-key input; automatic player updates no longer desynchronise the mobile panel, and Locate always restores tracking.': '字幕トランスクリプトの追従は、ホイール、タッチドラッグ、ネイティブスクロールバー、スクロールキーを直接操作した場合だけ一時停止します。プレーヤーの自動更新でモバイルパネルが同期ずれすることはなくなり、「現在位置」操作で必ず追従を復元します。',
    "The subtitle control rail starts on the left, can be moved and keyboard-positioned, can be pinned open or collapsed, stays clear of YouTube's settings control, and no longer duplicates playback with a play button. Transparent subtitle line space is click-through, restoring the native mobile fullscreen button while visible words remain tappable.": '字幕コントロールレールは左側から始まり、ドラッグやキーボードで移動でき、開いたまま固定または折りたたみができます。YouTubeの設定ボタンを避け、重複する再生ボタンも削除しました。字幕行の透明な余白はクリックを通すため、表示中の単語はタップ可能なまま、モバイルの標準全画面ボタンが動作します。',
    'Short functional headings in mirrored app panels are now annotated through the shared residual scanner, including YouTube transcript and engagement surfaces, without reintroducing a panel-specific parser.': 'ミラー表示されるアプリパネル内の短い機能見出しも共有の残余スキャナーで注釈されるようになりました。YouTubeの文字起こしやエンゲージメント画面を含め、パネル専用パーサーは再導入していません。',
    'Removed the separate YouTube guide, engagement-panel, and chrome parsers. YouTube-specific media adapters remain only where the platform API requires them; ordinary page text and controls follow the shared annotation pipeline.': 'YouTube専用のガイド、エンゲージメントパネル、UI用パーサーを削除しました。YouTube固有のメディアアダプターはプラットフォームAPIが必要な箇所だけに残し、通常のページ本文と操作部品は共通の注釈パイプラインを使います。',
    'YouTube buttons, tabs, and filter chips keep their native vertically centred labels while remaining lookupable and pitch-annotated; compact controls no longer reserve or overlay a furigana lane.': 'YouTubeのボタン、タブ、フィルターチップは、単語検索とピッチ注釈を維持しながら、本来の縦中央揃えで表示されます。コンパクトな操作部品にふりがな用の余白や重ね表示を追加しません。',
    'Lazy-loaded YouTube comments and other text revealed near the bottom of long pages are discovered through the generic visible-page scanner instead of being starved by offscreen virtualized cards.': '長いYouTubeページの下部で遅延読み込みされるコメントなどの文字を、画面外の仮想カードに走査枠を奪われず、汎用の可視ページ走査で検出するようにしました。',
    "Expanding annotated descriptions and other collapsible panels preserves the page's authored clipping, preventing annotation paint from escaping underneath neighbouring video content.": '注釈付きの説明欄や折りたたみパネルを展開しても、ページ本来のクリッピングを維持し、注釈が隣接する動画コンテンツの下へはみ出さないようにしました。',
    "Furigana and pitch accents in compact page chrome—buttons, chips, menus, badges, metadata rows, and fixed-height labels—now use detached, glyph-anchored decoration that preserves the site's native spacing, wrapping, centring, and clipping.": 'ボタン、チップ、メニュー、バッジ、メタデータ行、固定高ラベルなどのコンパクトなページUIで、ふりがなとピッチアクセントを文字に固定した分離表示に変更し、サイト本来の間隔・折り返し・中央揃え・クリッピングを維持するようにしました。',
    'Controls and dynamically revealed panels are rescanned through the same generic decoration policy, so their readings remain visible and passive without stealing taps from the page or opening the dictionary.': '操作部品と動的に表示されるパネルも同じ汎用装飾ポリシーで再走査され、ページのタップ操作を奪ったり辞書を開いたりせず、読みを表示し続けるようにしました。',
    'Compound words and entries with multiple pitch patterns retain every pitch-accent pattern instead of losing later alternatives.': '複合語と複数のピッチ型を持つ項目で、後続候補を失わず、すべてのピッチアクセント型を保持するようにしました。',
    'Added Chromium and WebKit release gates for chip fidelity, constrained metadata rows, and Reddit-style compact chrome, including checks for growth, overlap, clipping, and click-through behavior.': 'チップの再現性、制約付きメタデータ行、Reddit形式のコンパクトUIについて、拡大・重なり・切り抜き・クリック透過を検証するChromium／WebKitリリースゲートを追加しました。',
    'Subtitles now freeze at the last presented media time while a video is genuinely buffering or stalled, then resume on actual playback. Ordinary pause, ended, seeking, and background network stalls remain distinct so transcript, karaoke, and shadowing timing stay aligned with the player.': '動画が実際にバッファリングまたは再生停止している間、字幕は最後に表示されたメディア時刻で止まり、再生が本当に再開した時点で進むようになりました。通常の一時停止、再生終了、シーク、バックグラウンドのネットワーク停滞は区別されるため、文字起こし、カラオケ、シャドーイングのタイミングがプレイヤーとずれません。',
    'Turning annotations off now immediately removes ruby, pitch colouring, and parsed word markup from video captions and the open subtitle transcript while preserving the minimum plain subtitle display. Caption parsing, enrichment, cache updates, and late parse-result repainting remain inert until annotations are turned back on.': '注釈をオフにすると、必要最小限のプレーンな字幕表示を保ったまま、動画字幕と開いている文字起こしからルビ、ピッチ色、解析済み単語マークアップが即座に消えるようになりました。注釈を再びオンにするまで、字幕の解析、補強、キャッシュ更新、遅れて完了した解析結果による再描画も停止します。',
    'Subtitle files and YouTube captions now recover from a brief connection drop, interrupted or partial response, rate limit, server error, or timeout with one bounded retry. Permanent client errors still fail immediately, slowly delivered responses are not duplicated, and already loaded cues remain available without another network request.': '字幕ファイルとYouTube字幕は、短時間の接続切れ、中断または部分レスポンス、レート制限、サーバーエラー、タイムアウトから、1回に限定した再試行で復帰するようになりました。永続的なクライアントエラーはこれまで通り即座に失敗し、遅く届くレスポンは重複要求せず、読み込み済みの字幕は再要求なしで利用できます。',
    'Added the hosted Japanese release-note copy for the resilient subtitle loading update, so the newest changelog remains localized when readers switch the documentation language.': '字幕読み込みの耐障害性向上について、ホスト版ドキュメント用の日本語リリースノートを追加しました。読者がドキュメント言語を切り替えても、最新の変更履歴が日本語のまま表示されます。',
    'Reddit no longer becomes progressively hot and sluggish after annotation on iPad Safari. A target-budget stop was walking up to 128 descendants in every untouched component branch to queue work that the already-full scan immediately discarded; bounded scans now stop at the budget and the normal continuation advances to later Japanese and open shadow roots without that repeated page-wide tail work.': 'iPad SafariでRedditを注釈した後、端末が次第に熱くなり操作が重くなる問題を修正しました。走査上限に達した後も未処理の各コンポーネント分岐で最大128個の子孫を調べ、満杯の走査が直ちに破棄する作業をキューへ入れていました。上限付き走査は予算地点で停止し、通常の継続処理が後続の日本語と開いたShadow DOMへ進むため、ページ全体の末尾探索を繰り返しません。',
    'Settings changed on yomureader.com now survive refreshes, site changes, and browser storage resets without creating a competing local profile. The hosted Study runtime adopts a late userscript bridge, website-only changes are recorded as a field-level pending patch and merged once into the newest GM settings, and the resulting GM value is mirrored locally for fast standalone startup. Rapid website theme/language writes are serialized so an older write cannot finish last.': 'yomureader.comで変更した設定が、更新、サイト移動、ブラウザストレージのリセット後も、競合するローカルプロファイルを作らず保持されるようになりました。ホスト版の学習画面は後から利用可能になったユーザースクリプトブリッジを採用し、Webサイトだけで行った変更をフィールド単位の保留パッチとして最新のGM設定へ一度だけ統合します。統合後のGM値は高速な単独起動のためローカルにも複製します。テーマと言語の連続書き込みも直列化し、古い書き込みが最後に完了することを防ぎます。',
    'The dictionary settings panel no longer claims a recommended local dictionary is installed merely because its cross-site preference exists. Installed and Update states now wait for the current origin\'s live IndexedDB summary, matching whether local entries can actually appear in popovers.': '辞書設定パネルは、サイト間で共有される設定が存在するだけで推奨ローカル辞書をインストール済みと表示しなくなりました。「インストール済み」と「更新」の状態は現在のオリジンのIndexedDB実データ概要を待って決まり、ポップオーバーでローカル項目を実際に表示できる状態と一致します。',
    'Yomu Academy now includes a five-stage N3 mock-listening route with original teaching, guided and independent practice, targeted repair, delayed SRS review, changed-context transfer, and speaking prompts. Its 36-item CUR-007 audit records rights, wording, answer, and media decisions item by item while keeping all uncleared source wording and recordings out of the product.': 'Yomu Academyに、オリジナルの指導、ガイド付き・自立練習、的を絞った補習、遅延SRS復習、別文脈での応用、発話課題から成る5段階のN3模擬聴解ルートを追加しました。36項目のCUR-007監査は、権利・文言・解答・メディアの判断を項目ごとに記録し、許諾未確認の元文言と録音はすべて製品から除外しています。',
    'The documentation navbar and README now link to Stripe support, with Patreon and Ko-fi entries ready to appear only after their public pages are verified.': 'ドキュメントのナビゲーションバーとREADMEからStripeのサポートページへ移動できるようになりました。PatreonとKo-fiは、公開ページの確認が完了した後にのみ表示できるよう準備されています。',
    'Yomu Academy now has a canonical, verified-provider foundation for granting payment entitlements without duplicate events. Provider accounts still need to be connected and published, and ordinary Stripe support donations remain support-only unless Academy owns the checkout.': 'Yomu Academyに、検証済み決済プロバイダーから重複イベントなしで利用権を付与するための正規の基盤を追加しました。各プロバイダーのアカウントは引き続き接続と公開が必要で、通常のStripeサポート寄付は、Academyが決済を管理しない限りサポート専用のままです。',
    'Academy now plays four owner-approved, licence-archived native-band Japanese learning voices across the Lesson 0 sound fork, both Cafe practices, and both Language Lab practices; the human review flag remains false. Archived canonical Aivis queries reproduce every query/cache hash and global/local style mapping offline, request-owned playback cancels pending static, worker, and browser fallbacks, and browser proof runs against production-mode bytes identical to the hosted Academy app bundle. Human auditory acceptance and full-corpus voice production remain open.': 'Academyでは、Lesson 0の音声分岐、Cafeの2つの練習、Language Labの2つの練習で、ライセンス証拠を保存してオーナーが承認した4つの日本語ネイティブ帯域学習音声を再生するようになりました。人によるレビューのフラグはfalseのままです。保存済みの正規Aivisクエリから、すべてのクエリとキャッシュのハッシュ、およびグローバルとローカルのスタイル対応をオフラインで再現できます。リクエスト単位の再生は、保留中の静的音声、Worker、ブラウザ音声のフォールバックを中止します。ブラウザ検証は、ホスト版Academyアプリとバイト単位で同一の本番モードビルドに対して実行されます。人による聴覚確認と全コーパスの音声制作は、引き続き未完了です。',
    'New-tab learning now uses one Study stepper for recall, kanji, and listening instead of parallel modes, while safely migrating existing listen, kanji, and recall sessions.': '新しいタブの学習は、並列する複数のモードではなく、想起・漢字・リスニングを1つのStudyステッパーで進めるようになりました。既存のリスニング・漢字・想起セッションも安全に移行されます。',
    'Documentation and release delivery now retry only transient platform failures, and the CI gates cover the shipped layouts, dependencies, nightly smokes, and desktop release assets reliably.': 'ドキュメントとリリースの配信は、一時的なプラットフォーム障害だけを再試行するようになりました。CIゲートは、配布するレイアウト、依存関係、夜間スモークテスト、デスクトップ版リリース成果物を確実に検証します。',
    'Yomu Academy account/profile deletion now returns a privacy-minimized receipt, and a credential-gated live proof can verify real Google recovery, two-device pairing, remote D1 state, export, and deletion without forging provider callbacks.': 'Yomu Academyのアカウント／プロファイル削除は、個人情報を最小限に抑えた削除証明を返すようになりました。認証情報で保護されたライブ検証では、プロバイダーのコールバックを偽装せず、実際のGoogle復旧、2端末のペアリング、リモートD1の状態、書き出し、削除を確認できます。',
    'Academy Google callback failures now return to a scrubbed allowlisted URL, complete exports include every encrypted event page, and account holders can reset corrupt sync data without deleting their identity.': 'AcademyのGoogleコールバックに失敗した場合、認可コードなどを除去した許可済みURLへ戻るようになりました。完全な書き出しには暗号化イベントの全ページが含まれ、アカウント保持者は本人情報を削除せずに破損した同期データをリセットできます。',
    'Reactive pages such as YouTube, Reddit, Twitch, and live chats now keep their native text intact while Yomu paints a source-preserving annotation layer. Hovering, recycling, or rerendering can no longer leave only coloured bars, and tapping a word resolves from that word\'s original text range instead of opening a neighbour.': 'YouTube、Reddit、Twitch、ライブチャットなどのリアクティブなページで、よむが元の文字を保ったまま注釈レイヤーを描画するようになりました。ホバー、再利用、再描画で色付きの線だけが残ることがなくなり、タップした単語自身の元テキスト範囲から辞書を開くため、隣の単語が開きません。',
    'Late-loaded menus, comments, dropdown choices, and content beyond the initial scan budget continue through the generic scanner. Compact controls keep pitch and lookup even when there is no safe lane for furigana; only the unsafe reading is omitted, preventing adjacent readings and previous lines from overlapping.': '後から読み込まれるメニュー、コメント、ドロップダウン項目、初回スキャン上限より後の内容も汎用スキャナーで継続して処理します。コンパクトな操作部品は、ふりがなを安全に置けない場合でもピッチと辞書操作を保ち、安全でない読みだけを省略して、隣の読みや上の行との重なりを防ぎます。',
    'Composite words retain their per-component pitch colours in source-preserving mirrors, while passive and shadow-root content receives an at-rest pitch signal instead of waiting for a press.': '構成語を持つ複合語は、元文字を保つミラーでも構成語ごとのピッチ色を維持します。また、受動的な要素やShadow DOMの内容にも、押す前からピッチ表示が出るようになりました。',
    'YouTube Shorts now expose the movable, persistent subtitle rail. Subtitle annotations return hit testing to overlapping native Share and fullscreen controls, and annotating Share no longer corrupts its label.': 'YouTube Shortsで移動可能かつ位置を保存する字幕レールを表示します。Shareや全画面ボタンと重なる字幕注釈はネイティブ操作へ入力を渡し、Shareのラベルも注釈によって壊れません。',
    'The canonical homepage install link opens the named': 'ホームページの正規インストールリンクは、次の名前の',
    'userscript directly, avoiding generic attachment downloads that some userscript managers fail to recognise.': 'ユーザースクリプトを直接開き、一部のユーザースクリプトマネージャーが認識できない汎用添付ファイルとしてのダウンロードを回避します。',
    'The video subtitle rail shows previous-line and next-line buttons again, but only while the subtitle side panel is closed. When the panel is open its own transport controls take over and the rail hides its copies to avoid duplicate controls.': '動画字幕レールに、前の行・次の行のボタンが再び表示されるようになりました。ただし字幕サイドパネルが閉じているときのみです。パネルを開くとパネル側の操作ボタンが引き継ぎ、操作の重複を避けるためレール側のボタンは非表示になります。',
    'Hover lookups now open as a compact popover by default on every screen size instead of the bottom panel, so passively hovering a word no longer covers the page on small screens; tap and click lookups keep the bottom panel there. A new "Hover popup mode" setting controls the hover surface independently of the existing "Popup mode" setting used for tap and click lookups.': 'ホバーでの辞書引きは、画面サイズにかかわらず下部パネルではなく既定でコンパクトなポップオーバーで開くようになり、小さい画面で単語にホバーしただけでページが覆われることがなくなりました。タップやクリックでの辞書引きは、これまでどおり小さい画面では下部パネルを使います。新しい「ホバー時の表示」設定により、タップ・クリック用の既存「ポップアップ表示」設定とは独立してホバー時の表示方法を制御できます。',
    'The Bunpro dictionary card now shows Bunpro\'s own example sentences with hot-linked audio, matching the Jiten and JPDB sources: each sentence plays its Bunpro recording on tap (with text-to-speech as a fallback), renders furigana as ruby, highlights the looked-up word, and includes the English translation.': 'Bunpro辞書カードに、JitenやJPDBと同じようにBunpro自身の例文が音声リンク付きで表示されるようになりました。各例文はタップでBunproの録音を再生し（再生できない場合は音声合成にフォールバック）、ふりがなをルビとして表示し、検索した単語をハイライトし、英訳も併記します。',
    'JPDB, Jiten, and Bunpro dictionaries all stay enabled by default for new users instead of depending on a single chosen provider; each can still be turned off individually in settings.': '新規ユーザーでは、JPDB・Jiten・Bunproの辞書が単一のプロバイダー選択に依存せず、すべて既定で有効のままになりました。各辞書は設定で個別に無効化できます。',
    'Pitch-accent marks and furigana now appear on Japanese text without selecting or clicking it when the local dictionary database is slow or blocked. Yomu moves on to its bounded public fallback after 500 ms, still tries the direct pitch source when exact vocabulary hydration misses, and retains local-first behavior once the local check finishes.': 'ローカル辞書データベースの応答が遅い、または停止している場合でも、日本語テキストのピッチアクセント記号とふりがなが、選択やクリックをしなくても表示されるようになりました。よむは500ミリ秒後に上限付きの公開フォールバックへ進み、完全一致する語彙情報を取得できない場合も直接ピッチ情報源を試し、ローカル確認が完了すればローカル優先の動作を維持します。',
    'Yomu no longer annotates rapidly rotating marketing headlines or nests a second annotation layer inside a site\'s own Japanese demo words, preventing shifting duplicate text and overlapping elements while ordinary Japanese prose remains lookupable.': 'よむは、高速で切り替わるマーケティング見出しや、サイト独自の日本語デモ単語の内側に二重の注釈レイヤーを追加しなくなりました。これにより、文字のずれや重複、要素の重なりを防ぎながら、通常の日本語本文は引き続き辞書引きできます。',
    'On tablets, long subtitle side panels now keep scrolling through one continuous touch gesture instead of stopping after a few centimetres and requiring another swipe.': 'タブレットで長い字幕サイドパネルを、一度のタッチ操作で最後まで連続してスクロールできるようになりました。数センチ進んだところで止まり、もう一度スワイプし直す必要はありません。',
    'Subtitle auto-follow now keeps its place through gaps, glides between nearby lines, and adds newly loaded lines without flashing a large blank spacer in the panel.': '字幕の自動追従が、字幕のない区間でも位置を保ち、近くの行へ滑らかに移動するようになりました。新しい字幕行が読み込まれたときも、パネルに大きな空白が一瞬表示されません。',
    'Hosted reader pages now detect a stale userscript network bridge before a request hangs and safely fall back to browser fetch or Yomu\'s public proxy, restoring passive pitch decoration for compounds such as もう一度 and KanjiVG stroke diagrams.': 'ホスト型リーダーページは、応答しないユーザースクリプトのネットワークブリッジをリクエストが停止する前に検出し、ブラウザーのfetchまたはYomuの公開プロキシへ安全に切り替えるようになりました。これにより、「もう一度」のような複合語の自動ピッチ装飾とKanjiVGの筆順図が再び読み込まれます。',
    'The hidden-video notice\'s Hide button now dismisses the notice for the current session only instead of silently turning the notice off forever; anyone who previously hid it this way gets it back once.': '非表示動画通知の「非表示」ボタンは、通知を永続的にオフにするのではなく、現在のセッションのみ閉じるようになりました。以前この方法で非表示にした場合も一度だけ復元されます。',
    'Searching for a non-Japanese term no longer spins a filtering loop that hides every result while YouTube keeps loading more: a search whose results are all non-Japanese is shown as searched, with filtering resuming on the next page.': '日本語以外の語句を検索しても、結果を全部隠しながらYouTubeが読み込みを続けるフィルタリングループが起きなくなりました。結果がすべて日本語以外の検索は検索どおりに表示され、次のページからフィルタリングが再開されます。',
    'Toggling the immersion filter from the puck responds immediately: the filter refreshes before settings are persisted, annotation readings on compact controls no longer distort chips or hide their labels, and the mirror visibility heal no longer re-walks hidden sections on every scan.': 'パックからのイマージョンフィルター切り替えが即座に反応するようになりました。設定の保存前にフィルターが更新され、コンパクトなコントロール上の読み仮名がチップを歪めたりラベルを隠したりせず、ミラー表示の復元処理が非表示セクションをスキャンごとに再走査しなくなりました。',
    'Annotated text no longer goes blank after moving between pages on YouTube and other single-page apps. A text mirror hidden while its page section was momentarily concealed is re-shown as soon as the section is visible again, so titles, channel names, and feed chips keep painting.': 'YouTubeなどのシングルページアプリでページを移動した後、注釈付きテキストが空白のままにならなくなりました。セクションが一時的に隠れている間に非表示になったテキストミラーは、セクションが再び表示されるとすぐに再表示されるため、タイトル・チャンネル名・フィードのチップが描画され続けます。',
    'Furigana readings are back on mirrored buttons, chips, and menu labels. The overlay mirror keeps readings without changing the control\'s own layout, and clipped rows still reveal their readings on hover only.': 'ミラー描画されるボタン・チップ・メニューラベルにふりがなが復活しました。オーバーレイミラーはコントロール自体のレイアウトを変えずに読みを保持し、切り詰められた行では従来どおりホバー時のみ読みを表示します。',
    'The YouTube immersion filter now hides in-feed ads and no longer counts Japanese interface metadata (view counts, upload age, watch labels) as Japanese content, so English videos in shelves and ad slots are hidden as intended.': 'YouTubeイマージョンフィルターがフィード内広告を非表示にし、日本語UIのメタデータ（再生回数・投稿時期・視聴ラベル）を日本語コンテンツとして数えなくなったため、棚や広告枠内の英語動画が意図どおり非表示になります。',
    'BookWalker pages on iPad no longer flip to "Could not read text" after the first few pages and stay failed until a page reload. The scan deadline reused the 6-second audio timeout, which killed healthy-but-slow scans on iPad userscript managers and remembered each page as permanently failed; OCR now gets a 30-second attempt floor and a timed-out attempt retries once before showing the tappable retry state.': 'iPadのBookWalkerで、最初の数ページ以降が「テキストを読み取れませんでした」に切り替わり、ページを再読み込みするまで失敗したままになる問題を修正しました。スキャンの期限が6秒の音声タイムアウトを流用していたため、iPadのユーザースクリプトマネージャーでは正常でも遅いスキャンが打ち切られ、各ページが恒久的な失敗として記憶されていました。OCRには30秒の試行下限を設け、タイムアウトした試行は1回だけ再試行してからタップで再試行できる状態を表示します。',
    'BookWalker storefront banners and cover images now scan reliably on iPad instead of failing or timing out: ordinary image OCR shares the same corrected 30-second scan deadline.': 'iPadでBookWalkerストアのバナーやカバー画像が失敗やタイムアウトせずに確実にスキャンされるようになりました。通常の画像OCRも同じ修正済みの30秒スキャン期限を共有します。',
    'BookWalker OCR no longer stays on "Scanning..." for several minutes when Safari or an iPad userscript manager stalls while preparing the image or times out against Google Lens. The whole scan and both Lens transports now share one request deadline, and an exhausted deadline ends in the tappable retry state instead of automatically repeating the same long wait; the reconstructed page image remains in place when it is rescuing BookWalker\'s blank mobile canvas.': 'SafariやiPadのユーザースクリプトマネージャーで画像の準備が停止したりGoogle Lensがタイムアウトしたりしても、BookWalker OCRが「スキャン中...」のまま数分間止まらなくなりました。スキャン全体と2つのLens通信経路で1つの期限を共有し、期限切れ時は同じ長い待機を自動で繰り返さず、タップして再試行できる状態になります。BookWalkerのモバイルキャンバスが空白になる場合に復元画像で補う動作は維持されます。',
    'iPad annotations no longer shift or disappear in fixed-height controls, menus, compact card titles, and web components. Mirrored text now follows the page\'s own padding and vertical centring, and touch layouts use a stable non-ruby line instead of a sticky-hover swap that could clip or reflow the row.': 'iPadの固定高コントロール、メニュー、コンパクトなカードタイトル、Webコンポーネントで、注釈がずれたり消えたりしなくなりました。ミラー文字はページ本来の余白と縦方向の中央揃えに従い、タッチ環境では行を切り取ったり組み直したりする固定ホバーの切り替えではなく、安定したルビなしの行を使います。',
    'Compact YouTube and Reddit titles keep their native wrapping and visible word annotations without overflowing their cards, including content inside open shadow roots.': 'YouTubeやRedditのコンパクトなタイトルが、オープンなShadow DOM内の内容も含め、カードからはみ出さず本来の折り返しと見える単語注釈を保つようになりました。',
    'Pitch-accent component diagrams are centred consistently in the lookup sheet.': '検索シート内のピッチアクセント構成図が一貫して中央揃えになりました。',
    'Immersion Kit example sentences now load reliably instead of showing "No examples" for common words such as 見る: each lookup was downloading the entire example set — one to two megabytes — and timing out before it arrived, and now fetches a small batch that loads in about a second.': 'イマージョンキットの例文が、見るのようなよく使う単語でも「例文なし」と表示されず、確実に読み込まれるようになりました。これまでは検索のたびに例文セット全体（1〜2メガバイト）をダウンロードしており、届く前にタイムアウトしていました。今は小さなまとまりだけを取得するため、約1秒で読み込まれます。',
    'The hosted homepage now loads its reader runtime and companion scripts with the release version in their URLs, so browsers cannot keep executing an older cached OCR build after the site deploys a geometry fix.': 'ホスト版ホームページは、リーダー本体と補助スクリプトのURLにリリース番号を付けて読み込むようになりました。サイトが座標修正を配信した後も、ブラウザーが古いOCRビルドをキャッシュから実行し続けることを防ぎます。',
    'The legacy persistent OCR cache is cleared once during upgrade, so the removed three-box homepage demo geometry cannot survive an update and keep manga text offset from the image.': 'アップグレード時に古い永続OCRキャッシュを一度消去し、削除済みのホームページ用3枠デモ座標が更新後も残って漫画文字を画像からずらし続けることを防ぎます。',
    'Removed': '削除',
    'Selecting Japanese text on a page no longer opens a lookup pop-up. The panel that used to appear on every selection — often unwanted, and covering most of the screen on phones — is gone, so selecting text just selects it. To look up a word, hover or tap it as before: Yomu still shows its reading, meaning, pitch accent, and dictionary links on the words it has parsed.': 'ページ上の日本語を選択しても、検索ポップアップが開かなくなりました。選択のたびに表示されていたパネル（多くの場合は不要で、スマートフォンでは画面の大半を覆っていました）はなくなり、テキストを選択すると通常どおり選択されるだけになります。単語を調べるには、これまでどおりホバーまたはタップしてください。よむは解析済みの単語について、読み・意味・ピッチアクセント・辞書リンクを引き続き表示します。',
    'Removed the "Selection popups" and "Show translation in selection popovers" settings, which no longer had anything to control.': '「選択ポップアップを表示」と「選択ポップアップに翻訳を表示」の設定は、制御する対象がなくなったため削除しました。',
    "Manga OCR on the Yomu homepage uses the OCR provider's real image coordinates again instead of three hand-authored boxes that drifted away from the printed text. The overlay follows the rendered image through page scroll, browser scaling, and object-fit layouts, and recognised text stays transparent until you hover it.": "よむのホームページの漫画OCRは、印刷された文字からずれていた3つの手作業の枠ではなく、OCRプロバイダーが返す実際の画像座標を再び使います。オーバーレイはページのスクロール、ブラウザーの拡大縮小、object-fitレイアウトでも表示画像に追従し、認識された文字はホバーするまで透明のままです。",
    "BookWalker OCR now waits through Firefox's blank-but-readable startup canvas, retries an empty response on the stable captured page instead of rebuilding it, and cancels a capture when the recycled canvas turns to different content. This removes false failures, repeated screenshots, stale previous-page text, and scanning/status flicker.": "BookWalker OCRは、Firefoxで起動直後に読み取り可能だが空のキャンバスを待ち、空の応答時には安定した取得済みページを作り直さず再試行し、再利用キャンバスの内容が別ページに変わった場合は取得を中止します。誤った失敗表示、スクリーンショットの繰り返し、前ページの古い文字、スキャン状態のちらつきを防ぎます。",
    "BookWalker zoom no longer changes page identity just because the viewer rewrites raster size or draw destination coordinates, so a recognised page stays aligned and comes back from cache without another OCR request. Extension screenshot fallback also refuses to capture while the reader tab is not active.": "BookWalkerの拡大縮小で、ビューアーがラスターサイズや描画先座標を書き換えただけではページ識別子が変わらなくなりました。認識済みページは位置が揃ったまま、追加のOCR要求なしでキャッシュから復元されます。拡張機能のスクリーンショット代替経路も、リーダータブがアクティブでない間は取得しません。",
    "Batched public Jiten lookups keep parser results inside their original term boundary, preventing one word in a batch from borrowing another word's vocabulary result.": "公開Jitenの一括検索では、解析結果が元の語の境界内に保たれるようになり、同じ一括処理内の別の語の語彙結果を誤って借用しません。",
    'The word lookup popup now lists Yomu first in its row of dictionary links, before Jiten, JPDB, and Bunpro. If you never re-ordered these pills yourself they follow the new order automatically, and a custom order you set is kept.': '単語のルックアップ ポップアップの辞書リンクの並びで、Jiten・JPDB・Bunproよりも前に「Yomu」が先頭に表示されるようになりました。ピルの並び順をご自身で変更していない場合は自動的に新しい順序に切り替わり、独自に設定した並び順はそのまま保持されます。',
    'The support status banner now explains that the monthly goal keeps fast audio playback and shadowing running, instead of warning that Ultimate Audio will switch off next month.': '支援状況のバナーは、Ultimate Audioが翌月に停止すると警告する代わりに、今月の目標が高速な音声再生とシャドーイングの維持に必要であることを説明するようになりました。',
    'The Jiten frequency number and Jiten dictionary entry now load reliably in the word lookup popup, including on a slow connection: a slow Jiten reply is no longer thrown away, so the Jiten reading, meanings, and rank fill in once they arrive instead of leaving the Jiten pill blank.': '単語のルックアップ ポップアップで、Jitenの頻度番号とJitenの辞書項目が、低速な接続でも確実に読み込まれるようになりました。Jitenの応答が遅くても破棄されなくなったため、Jitenのピルが空欄のままになる代わりに、読み・意味・頻度順位が届き次第表示されます。',
    'BookWalker manga OCR is reliable across a whole book again, in both the page-turn and vertical continuous-scroll modes: recognition no longer stalls on "Scanning…", stops working after a few pages, or only covers the first page.': 'BookWalkerのマンガOCRが、ページめくりモードでも縦の連続スクロールモードでも、一冊を通して安定して動作するようになりました。「Scanning…」で止まったり、数ページで動かなくなったり、最初のページしか認識されなかったりすることはなくなりました。',
    'Pages you have already read are no longer re-scanned on every scroll or page turn, which removes the BookWalker lag and the flicker between "Scanning…" and "No text found".': '一度読んだページがスクロールやページめくりのたびに再スキャンされることはなくなり、BookWalkerのもたつきや、「Scanning…」と「No text found」の間のちらつきが解消されました。',
    'BookWalker pages no longer flash "Could not read text" from the hidden raw page image: on Firefox the page is rebuilt from BookWalker\'s own signed images so recognition matches other browsers.': 'BookWalkerのページが、隠れた生のページ画像のせいで「Could not read text」と一瞬表示されることはなくなりました。Firefoxでは、BookWalker自身の署名付き画像からページを再構成するため、他のブラウザーと同じように認識できます。',
    'Hovering recognised manga text now reliably shows its reading and lookup, instead of the highlight sometimes vanishing when the lookup sheet opens.': '認識されたマンガのテキストにカーソルを合わせると、確実に読みと辞書が表示されるようになりました。ルックアップシートが開いたときにハイライトが消えてしまうことはなくなりました。',
    'Zooming a BookWalker page keeps the text it already recognised instead of discarding it and scanning again, and switching away from the tab and back keeps the recognised text.': 'BookWalkerのページをズームしても、すでに認識したテキストが破棄されて再スキャンされることはなくなりました。また、タブから離れて戻っても、認識したテキストは保持されます。',
    'The Japanese homepage hero pills now centre their labels: plain pills such as インストール and ゲーム no longer sit bottom-heavy inside the capsule, while furigana readings stay tucked inside the pill above the label.': '日本語ホームページのヒーローピルがラベルを中央に配置するようになりました。「インストール」や「ゲーム」のような読み仮名のないピルでラベルがカプセルの下に沈むことはなくなり、ふりがなはラベルの上でピルの内側に収まったままになります。',
    'Collapsing a dictionary section while hovering a word no longer closes the lookup popup: it stays open when the popup resizes under the pointer, and still dismisses once you move the pointer away.': '単語にカーソルを合わせている間に辞書セクションを折りたたんでも、ルックアップのポップアップが閉じなくなりました。ポップアップがポインターの下でサイズ変更されても開いたままになり、ポインターを離せばこれまで通り閉じます。',
    'Feed, watch-page and Shorts rows no longer blow up into giant tiles: rows that clamp their text never grow for hidden readings and never hide the page\'s own text — at rest an annotated row paints exactly as it would without Yomu.': 'フィード・視聴ページ・ショートの行が巨大なタイルに膨れ上がることはもうありません。テキストを切り詰める行は、隠れた読みのために高さが増えることも、ページ本来のテキストを隠すこともなくなりました。通常時、注釈付きの行はYomuがない場合とまったく同じに描画されます。',
    'Vanished text on annotated rows — video titles collapsing to empty tiles, the subscriber count turning invisible — is fixed: the original text always keeps painting.': '注釈付きの行でテキストが消える問題（動画タイトルが空のタイルになる、チャンネル登録者数が見えなくなる）を修正しました。元のテキストは常に描画され続けます。',
    'Cramped rows that clip their text now keep readings hidden at rest and reveal them on hover, instead of painting cropped readings outside the row.': 'テキストが見切れる窮屈な行では、読みは通常時は隠され、ホバーで表示されるようになりました。切れた読みが行の外にはみ出して描画されることはありません。',
    'Mirrored text no longer invents spaces the page never showed, so Discord messages and similar layouts stop splitting Japanese words with stray gaps.': 'ミラー表示のテキストが、ページに存在しなかった空白を勝手に作らなくなりました。Discordのメッセージなどで日本語の単語が余計な隙間で分断されることはもうありません。',
    'Long unbroken annotated lines can wrap again instead of forcing the page to scroll sideways.': '折り返し位置のない長い注釈付きの行が再び折り返せるようになり、ページが横スクロールを強いられることがなくなりました。',
    'Style updates now actually reach existing installs: the stylesheet ships as a versioned, integrity-pinned resource, so each release reliably delivers its matching styles instead of serving a stale cached sheet.': 'スタイルの更新が既存のインストールに確実に届くようになりました。スタイルシートはバージョン付き・整合性検証付きのリソースとして配布されるため、各リリースは古いキャッシュではなく、対応するスタイルを確実に配信します。',
    'Text hidden inside closed menus and dropdowns no longer paints into mirrored annotations.': '閉じたメニューやドロップダウンの中に隠れているテキストが、ミラー表示の注釈に描画されることはなくなりました。',
    'A page\'s own furigana (native ruby) is no longer flattened into the surrounding text when mirrored, so readings stay readings instead of merging into the sentence.': 'ページ自身のふりがな（ネイティブのルビ）がミラー表示で本文に混ざって平坦化されることはなくなりました。読みは文に溶け込まず、読みのまま保たれます。',
    'Hardened the release pipeline so the live site and stylesheet deploy can no longer be silently skipped by a release push.': 'リリースのプッシュによって本番サイトとスタイルシートのデプロイが気づかれないままスキップされることがないよう、リリースパイプラインを強化しました。',
    'Tapping or moving the pointer over the subtitle line now reveals its compact controls and move handle even after the line has been dragged below the video. Blank subtitle space acts as the video focus surface instead of activating links or buttons underneath it. The reveal works while YouTube\'s own chrome is hidden and still hides after a short idle delay instead of becoming permanent.': '字幕行を動画の下へドラッグした後でも、その字幕行をタップするかポインターを動かすと、コンパクトなコントロールと移動ハンドルが表示されるようになりました。字幕の空白部分は動画のフォーカス面として働き、背後のリンクやボタンを誤って作動させません。YouTube本体の操作UIが非表示でも表示でき、常時表示にはならず短い無操作時間の後で再び非表示になります。',
    'The subtitle move handle now has a 44 × 44 px mobile touch target, an explicit keyboard focus ring, and screen-reader instructions for its drag, arrow/Page Up/Page Down, and reset controls. Idle controls stay out of sight without becoming keyboard- or screen-reader-inaccessible: tabbing to the move handle or rail reveals it immediately, deliberate hardware-keyboard focus stays visible on touch devices, and the controls fade again after focus leaves.': '字幕移動ハンドルは、モバイルで44 × 44 pxのタッチ領域、明確なキーボードフォーカスリング、ドラッグ・矢印キー・Page Up/Page Down・リセット操作のスクリーンリーダー向け説明を備えるようになりました。待機中のコントロールは見た目には隠れますが、キーボードやスクリーンリーダーから利用できなくなることはありません。Tabキーで移動ハンドルまたはレールへ移るとすぐに表示され、タッチ端末でもハードウェアキーボードによるフォーカスは表示されたまま保たれ、フォーカスが外れると再びフェードアウトします。',
    'Pausing Yomu from the puck now silences image, canvas and video-frame reading (OCR) too, matching what "paused" promises: no overlays appear and existing ones are cleared while paused, including scans that were already queued or captures still in flight when the pause landed. Everything resumes per your OCR mode when you unpause, and the puck\'s radial OCR button now shows as off while Yomu is paused instead of claiming OCR is on.': 'パック（丸ボタン）からYomuを一時停止すると、画像・キャンバス・動画フレームの読み取り（OCR）も停止するようになり、「一時停止」の約束どおりに動作します。一時停止中はオーバーレイが表示されず、既存のものも消去されます（一時停止時にすでにキュー済みのスキャンや進行中のキャプチャも含む）。再開するとOCRモードの設定どおりに復帰し、パックの放射メニューのOCRボタンは、一時停止中は「オン」と主張せずオフ表示になります。',
    'Interactive controls — buttons, tabs, menu items and other clickable chrome — never receive layout-affecting furigana anymore, so oversized "giant" buttons no longer appear on sites where readings used to inflate a control\'s height.': '操作用のコントロール（ボタン、タブ、メニュー項目などクリック可能なUI）には、レイアウトに影響するふりがなが付かなくなりました。読みがコントロールの高さを押し広げて「巨大なボタン」が現れることはもうありません。',
    'Search boxes and editable fields are now skipped deterministically by the decoration policy, so typing surfaces are never annotated or disturbed.': '検索ボックスや編集可能なフィールドは、装飾ポリシーによって確実にスキップされるようになり、入力欄に注釈が付いたり乱されたりすることはありません。',
    'Rows that clip their text now hide furigana at rest and reveal it on hover, so tight single-line labels stay intact instead of showing cropped readings.': 'テキストが見切れる行では、通常時はふりがなを隠し、ホバーで表示するようになりました。幅の狭い1行ラベルは、切れた読みを見せる代わりに元の見た目を保ちます。',
    'The extra room Yomu reserves for readings (ruby room) is now owned by Yomu and fully reverted when decoration is removed, so pages return to their original layout when Yomu turns off.': 'Yomuが読みのために確保する余白（ルビ用スペース）はYomuが管理するようになり、装飾を外すと完全に元に戻ります。Yomuをオフにするとページは元のレイアウトに戻ります。',
    'The video player\'s native subtitle line is no longer clipped in fullscreen: Yomu reserves a slot for it instead of letting its own subtitle overlay push it out of view.': '全画面表示で動画プレーヤー本来の字幕行が見切れなくなりました。Yomuの字幕オーバーレイが押し出してしまうのではなく、そのための場所をあらかじめ確保します。',
    'A player stuck in inline fullscreen (after an interrupted fullscreen transition) now recovers automatically instead of leaving the page in a broken layout.': '全画面切り替えが中断されてインライン全画面のまま固まったプレーヤーは、ページのレイアウトを壊したままにせず、自動的に復旧するようになりました。',
    'On iPhone, entering the native fullscreen video player keeps Yomu subtitles visible instead of dropping them.': 'iPhoneでネイティブの全画面動画プレーヤーに入っても、Yomuの字幕は消えずに表示され続けるようになりました。',
    'Settings now have a Backup & sync section for exporting, importing and syncing your Yomu data.': '設定に「バックアップと同期」セクションが追加され、Yomuのデータのエクスポート・インポート・同期ができるようになりました。',
    'Settings now show the installed version and a working update check with install steps matched to how you run Yomu, fixing the "Apps, extensions, and user scripts cannot be added" dead-end some users hit when trying to update.': '設定にインストール済みのバージョンと、実際に機能する更新チェックが表示されるようになりました。Yomuの実行方法に合わせたインストール手順を案内し、更新時に一部のユーザーが行き詰まっていた「アプリ、拡張機能、ユーザースクリプトは追加できません」の袋小路を解消します。',
    'When a video-frame scan finds no text, the OCR pill now says "No text found · Scan again" so you can retry immediately instead of wondering whether anything happened.': '動画フレームのスキャンでテキストが見つからなかったとき、OCRピルに「No text found · Scan again（テキストが見つかりません・再スキャン）」と表示されるようになり、何が起きたのか分からないままにならず、すぐに再試行できます。',
    'The scan button on the video subtitle rail is now a toggle for reading paused video frames. Tapping it still reads the current frame immediately, and also keeps frame reading on so every pause is read automatically; tapping it again turns automatic frame reading off. The button shows its state (highlighted while on) and stays in sync with the same setting in the settings panel.': '動画字幕レールのスキャンボタンが、一時停止中の動画フレーム読み取りのトグルになりました。タップすると従来どおりその場でフレームを読み取り、さらにフレーム読み取りがオンのままになるため、以降は一時停止のたびに自動で読み取ります。もう一度タップすると自動フレーム読み取りがオフになります。ボタンは状態を表示し（オンの間はハイライト）、設定パネルの同じ設定と常に同期します。',
    'Google Search on iPad no longer develops large empty gaps or clipped/missing result text. Tight headings and snippets keep their original line geometry and visible base text while still supporting Yomu word highlighting and tap lookup.': 'iPadのGoogle検索で、大きな空白や検索結果テキストの欠け・消失が発生しなくなりました。高さの限られた見出しやスニペットは元の行レイアウトと見える本文を保ちながら、よむの単語ハイライトとタップ検索を引き続き利用できます。',
    'Reddit controls and compact metadata are annotated again without growing or hiding them, including nested web-component buttons such as 参加, sort labels, post age, share, announcement flair, and vote/comment rows.': 'Redditの操作部とコンパクトなメタデータに、サイズを広げたり内容を隠したりせず再び注釈が付くようになりました。参加のような入れ子のWebコンポーネントボタン、並べ替えラベル、投稿時刻、共有、お知らせフレア、賛成票・コメント行を含みます。',
    'Parser offset mistakes can no longer turn Latin labels or punctuation into stray Japanese annotations, fixing floating dots and accidental decoration of text such as r/singularity.': 'パーサーの位置ずれによって、ラテン文字のラベルや句読点が余計な日本語注釈になることはなくなりました。浮いた点や、r/singularityのようなテキストへの誤った装飾を修正しました。',
    'Intermittently missing annotations are fixed: the scanner now detects content revealed by observers, continues where its per-frame budget stopped, and caps how long it waits before scanning, so text no longer slips through unannotated.': '注釈がときどき付かない問題を修正しました。スキャナーはオブザーバーによって表示されたコンテンツを検出し、フレームごとの処理予算で中断した位置から再開し、スキャン前の待ち時間に上限を設けます。これにより、テキストが注釈なしのまま漏れることはなくなりました。',
    'Readings on clamped content rows (Google search snippets and similar) show at rest again, and a new setting lets you choose whether readings on clamped rows are always shown or shown on hover.': '高さが制限されたコンテンツ行（Google検索のスニペットなど）の読みが、通常時にも再び表示されるようになりました。また、新しい設定で、制限された行の読みを常に表示するか、ホバー時に表示するかを選べます。',
    'Pitch accents now appear on the initial parse everywhere, not just after later lookups: enrichment is paced instead of dropped.': 'ピッチアクセントが、後からの検索時だけでなく、どこでも最初の解析時から表示されるようになりました。付加処理は破棄されるのではなくペース配分されます。',
    'Turning annotations off now applies instantly instead of waiting for the next scan.': '注釈をオフにすると、次のスキャンを待たずに即座に反映されるようになりました。',
    'Live-stream chat no longer flickers or churns through re-renders: annotated messages replay from cache, and scrolling no longer shifts content.': 'ライブ配信のチャットがちらついたり再描画を繰り返したりしなくなりました。注釈済みのメッセージはキャッシュから再生され、スクロールでコンテンツがずれることもありません。',
    'Live-chat replay on regular videos (VOD) is now annotated like live chat.': '通常の動画（VOD）のライブチャットリプレイにも、ライブチャットと同じように注釈が付くようになりました。',
    'The comments sort menu no longer grows when annotated.': 'コメントの並べ替えメニューが、注釈によって大きくなることはなくなりました。',
    'YouTube uses noticeably less CPU and generates less heat: fullscreen checks are cached, subtitle timing work is on a diet, OCR machinery is fully inert on non-reader pages, and hover-preview players are excluded from scanning.': 'YouTubeでのCPU使用率と発熱が目に見えて減りました。全画面チェックはキャッシュされ、字幕のタイミング処理は軽量化され、OCR機構はリーダー以外のページでは完全に停止し、ホバープレビューのプレーヤーはスキャン対象から除外されます。',
    'Homepage: pills, navigation and cards are aligned again, the page no longer jumps while scrolling, and changing the interface language updates the page correctly.': 'ホームページ：ピル・ナビゲーション・カードの配置が再び揃い、スクロール中にページが飛ばなくなり、表示言語を変更するとページが正しく更新されるようになりました。',
    'The automated dead-code gate is green again: helpers used only inside their own modules are no longer exported, and the NHK mirror-overlap smoke test is registered as a runnable script.': '自動デッドコードチェックが再びグリーンになりました。モジュール内部でしか使われないヘルパーはエクスポートされなくなり、NHKミラー重なりスモークテストは実行可能なスクリプトとして登録されました。',
    'Releases no longer fail on busy build machines: the YouTube-comment scanner test now waits long enough for slow runners, so a finished release publishes instead of stopping at the final check.': 'ビルドマシンが混雑していてもリリースが失敗しなくなりました。YouTubeコメントスキャナーのテストが遅いランナーでも十分に待つようになり、完成したリリースが最終チェックで止まらずに公開されます。',
    'Bunpro is now a first-class dictionary source beside Jiten and JPDB in the popup and Study search/reveal surfaces. With a Bunpro frontend token, Yomu shows Bunpro vocabulary or grammar meanings, nuance, accepted answers, JLPT/part-of-speech tags, and a direct source link. The source can be enabled, renamed, and reordered with the other dictionaries.': 'Bunproが、ポップアップとStudyの検索・答え表示で、JitenやJPDBと並ぶ正式な辞書ソースになりました。Bunproのフロントエンドトークンを設定すると、Bunproの語彙・文法の意味、ニュアンス、正解として認められる答え、JLPT・品詞タグ、ソースへの直接リンクを表示します。このソースは、ほかの辞書と同じように有効化、名前変更、並べ替えができます。',
    'Fresh installs now show a Bunpro lookup pill beside Jiten and JPDB, with the same per-pill ordering and enable/disable controls.': '新規インストールでは、JitenとJPDBの横にBunproの検索ピルも表示されるようになりました。各ピルは同じ設定で並べ替え、有効化、無効化できます。',
    'Bunpro cards now use Bunpro\'s real two-outcome': 'Bunproのカードでは、Bunpro本来の2段階評価である',
    'Hard / Good': 'Hard / Good',
    'review model in both the popup and Study page instead of displaying JPDB\'s five-point scale. Good sends a correct review and Hard sends an incorrect review; Jiten and JPDB keep their existing grading controls.': 'をポップアップとStudyページの両方で使い、JPDBの5段階評価は表示しません。Goodは正解、Hardは不正解として復習を送信します。JitenとJPDBの既存の評価操作は変わりません。',
    'Bunpro live QA now exercises the actual quiz queue endpoint, verifies definition fields, and can opt in to grading one pending review. The old Bunpro API key is no longer presented as required: the frontend token is the only credential Yomu needs, while saved legacy keys remain preserved for backward compatibility.': 'BunproのライブQAが、実際のクイズキューのエンドポイントを使い、定義フィールドを確認し、必要に応じて未処理の復習を1件採点できるようになりました。旧Bunpro APIキーは必須として表示されなくなり、Yomuに必要な認証情報はフロントエンドトークンだけです。保存済みの旧キーは後方互換性のため保持されます。',
    'Bunpro Study grading now follows the active quiz session instead of pretending Bunpro has JPDB\'s five-point scale: regular self-graded reveal cards use': 'BunproのStudy採点は、JPDBの5段階評価を装うのではなく、現在のクイズセッションに従うようになりました。通常の自己採点式の答え表示カードでは',
    ', while FSRS cards use': '、FSRSカードでは',
    'Again / Hard / Good / Easy': 'Again / Hard / Good / Easy',
    '. Ordinary, ghost, and self-study reviews route to their correct Bunpro endpoints, and each Bunpro obligation stays separate from matching Jiten/JPDB/Anki cards.': 'を使います。通常・ゴースト・自己学習の復習はそれぞれ正しいBunproエンドポイントへ送られ、各Bunproの復習項目は同じ単語のJiten・JPDB・Ankiカードとは別に保持されます。',
    'Bunpro writes are now session-safe: Yomu sends the current review-session context, refuses unsessioned popup writes, refreshes after every Bunpro grade instead of reusing stale failed-review ids, and does not queue Bunpro grades offline. The frontend token is the only Bunpro credential Yomu uses; saved legacy keys remain preserved for backward compatibility.': 'Bunproへの書き込みをセッションに対して安全にしました。Yomuは現在の復習セッション情報を送り、セッションのないポップアップからの書き込みを拒否し、失敗した復習IDを再利用せず採点ごとにキューを更新します。また、Bunproの採点はオフラインキューに保存しません。Yomuが使用するBunpro認証情報はフロントエンドトークンだけで、保存済みの旧APIキーは後方互換性のため保持されます。',
    'Bunpro definition/mining matching is now exact and id/type-aware, so fuzzy search results or grammar/vocabulary collisions cannot display or add the wrong item. Offline cache warming no longer fans out private Bunpro searches, and definition searches no longer request private notes or bookmarks.': 'Bunproの定義・マイニング照合を完全一致かつID・種類を考慮する方式にし、あいまい検索の結果や文法・語彙の衝突によって誤った項目が表示・追加されないようにしました。オフラインキャッシュの事前取得では非公開のBunpro検索を広げず、定義検索でも非公開ノートやブックマークを要求しません。',
    'Bunpro live QA now exercises the actual quiz queue endpoint, verifies required definition fields, and can opt in to one session-aware grade.': 'BunproのライブQAは実際のクイズキューのエンドポイントを検証し、必須の定義フィールドを確認し、必要に応じてセッション情報付きの採点を1件だけ実行できるようになりました。',
    'Release preflight now runs the same browser-smoke set as GitHub before a tag is published. Its YouTube ruby proof follows the current paint-invariant contract for clipped rows: native text stays visible without layout growth, the complete annotated mirror stays hidden at rest, and real hover interaction reveals the mirror and readings without changing row height.': 'タグを公開する前のリリース事前検証で、GitHubと同じブラウザースモーク一式を実行するようになりました。YouTubeのルビ検証は、見切れる行に対する現在の描画不変ルールに従います。元のテキストはレイアウトを広げず表示されたまま、完全な注釈付きミラーは通常時に隠れ、実際のホバー操作で行の高さを変えずにミラーと読みが表示されることを確認します。',
    'When the hosted page has been visited once, the PWA cache keeps the Study shell available offline. Cached cards show an Offline cache status, and review grades that cannot reach Jiten, Bunpro, JPDB, or Anki are saved locally and retried when the provider reconnects.': 'ホスト版ページを一度開くと、PWAキャッシュによりStudyのシェルはオフラインでも使えます。キャッシュ済みカードにはオフラインキャッシュ状態が表示され、Jiten、Bunpro、JPDB、Ankiに届かない採点はローカルに保存され、接続が戻ったときに再試行されます。',
    'When the hosted page has been visited once, the PWA cache keeps the Study shell available offline. Cached cards show an Offline cache status, and Jiten, JPDB, Anki, and local-Yomu grades can be saved locally and retried when the provider reconnects. Bunpro grades require a live queue session and are intentionally unavailable offline because its session and ghost-review ids can change.': 'ホスト版ページを一度開くと、PWAキャッシュによりStudyのシェルはオフラインでも使えます。キャッシュ済みカードにはオフラインキャッシュ状態が表示され、Jiten、JPDB、Anki、ローカルYomuの採点はローカルに保存して、接続が戻ったときに再試行できます。Bunproの採点には有効なキューセッションが必要で、セッションIDやゴースト復習IDが変わる可能性があるため、意図的にオフラインでは利用できません。',
    'Open Settings → Study to choose a review source and switch the general rating scale between the normal five buttons and a thumb-friendly Fail / Pass mode. Bunpro cards always use Hard / Good, matching Bunpro itself. On phones, two-button rows use the full available width so the actions stay centered and easy to hit.': 'Settings → Studyを開くと、復習ソースを選び、全般の評価尺度を通常の5ボタンと親指で押しやすいFail / Passモードの間で切り替えられます。BunproのカードはBunpro本体に合わせて常にHard / Goodを使います。スマートフォンでは、2ボタンの行が利用可能な幅いっぱいに広がり、操作が中央に揃って押しやすくなります。',
    'Open Settings → Study to choose a review source and switch the general rating scale between the normal five buttons and a thumb-friendly Fail / Pass mode. Bunpro ignores that general scale: regular reveal reviews use Hard / Good, and FSRS reviews use Again / Hard / Good / Easy. On phones, two-button rows use the full available width so the actions stay centered and easy to hit.': 'Settings → Studyを開くと、復習ソースを選び、全般の評価尺度を通常の5ボタンと親指で押しやすいFail / Passモードの間で切り替えられます。Bunproではこの全般設定を使わず、通常の答え表示ではHard / Good、FSRS復習ではAgain / Hard / Good / Easyを使います。スマートフォンでは、2ボタンの行が利用可能な幅いっぱいに広がり、操作が中央に揃って押しやすくなります。',
    'Bunpro': 'Bunpro',
    'Yomu now reads Japanese text inside web components (open shadow DOM), so readings appear on parts of a site Yomu previously couldn\'t reach — for example Reddit\'s sort dropdown (賛成票率順) and community header. It only reads open shadow roots, renders the readings through the same non-destructive overlay it uses elsewhere (so a site\'s own components are never disturbed), and skips shadow trees with no Japanese, so pages that don\'t use them are unaffected.': 'Yomuがウェブコンポーネント（オープンなShadow DOM）内の日本語テキストも読み取れるようになり、これまで到達できなかったサイトの部分にも読みが表示されます（例：Redditの並べ替えドロップダウン「賛成票率順」やコミュニティヘッダー）。読み取るのはオープンなshadowルートのみで、読みは他の場所と同じ非破壊のオーバーレイで描画するため（サイト自身のコンポーネントを乱しません）、日本語のないshadowツリーはスキップするので、それらを使っていないページには影響しません。',
    'Yomu no longer slowly leaks memory when it restarts on the same page (single-page-app navigation, embedded video players, or switching between the userscript and the browser extension on one tab). Several page-wide event listeners, an image load handler, the scroll helper used inside Yomu\'s own panels, and the jpdb.io review bridge (its page watcher, heartbeat and cross-tab channel) were not always released when Yomu tore itself down and started again, so they piled up over a long session; every one of them is now cleaned up on teardown.': 'Yomuが同じページ上で再起動する際（シングルページアプリのページ遷移、埋め込み動画プレーヤー、1つのタブでユーザースクリプトとブラウザ拡張機能を切り替えたときなど）に、メモリを少しずつリークすることがなくなりました。いくつかのページ全体のイベントリスナー、画像の読み込みハンドラー、Yomu自身のパネル内で使うスクロール補助、そしてjpdb.ioのレビューブリッジ（ページ監視・ハートビート・タブ間チャンネル）が、Yomuが自身を破棄して再起動する際に必ずしも解放されず、長時間の利用で積み重なっていました。これらはすべて破棄時にクリーンアップされるようになりました。',
    'Furigana readings added later during a scan of a busy page (such as a long YouTube comment thread or a fast-updating feed) no longer stay clipped. A recent speed-up reserved space for readings only once per page scan, so rows that were annotated in a later pass could remain cut off until a delayed cleanup ran; Yomu now reserves room for every newly-annotated row as it lands, including in video subtitles, so readings are never left cropped.': '負荷の高いページ（長いYouTubeのコメント欄や、素早く更新されるフィードなど）のスキャン中に後から付いたふりがなが、見切れたままにならなくなりました。最近の高速化で読みのための余白の確保をページのスキャンごとに一度だけ行っていたため、後の処理で注釈が付いた行は、遅れて実行される後処理まで見切れたままになることがありました。Yomuは新しく注釈を付けた行それぞれに対して、その場で（動画の字幕内も含めて）余白を確保するようになり、ふりがなが見切れて残ることはありません。',
    'Furigana no longer breaks the layout of compact rows on sites like YouTube. On the watch page the channel subscriber count, view count, comment count and sort, individual comments, and the sidebar recommendation details were wrapping onto extra lines or overlapping the line below once readings were added; Yomu now reserves space for the reading in any short, clipped row generally, rather than relying on a hand-maintained list of elements, so the rows grow just enough to fit instead of breaking.': 'YouTubeのようなサイトのコンパクトな行のレイアウトを、ふりがなが崩さなくなりました。視聴ページのチャンネル登録者数・視聴回数・コメント数と並べ替え・個々のコメント・サイドバーのおすすめの詳細が、ふりがなを付けると余分な行に折り返したり下の行に重なったりしていました。Yomuは、要素を手作業で列挙するのではなく、背の低い切り詰められた行全般で読みのための余白を確保するようになり、行が崩れる代わりに収まる分だけ広がります。',
    'Yomu uses much less CPU on busy, constantly-updating pages such as the YouTube watch page, which had been making iPads run hot. It now reserves furigana room once per scan instead of once per batch, briefly caches layout measurements, and throttles rescans on pages that mutate many times a second — roughly halving style recalculations during heavy scrolling, while still annotating new content as it loads.': 'YouTubeの視聴ページのように絶えず更新される負荷の高いページでのCPU使用量を大幅に削減しました（iPadが熱くなる原因でした）。ふりがなの余白確保をバッチごとではなくスキャンごとに一度だけ行い、レイアウトの計測結果を短時間キャッシュし、毎秒何度も変化するページでは再スキャンを間引くようになりました。激しいスクロール中のスタイル再計算がおよそ半分になり、それでも新しいコンテンツは読み込まれ次第注釈が付きます。',
    'Yomu no longer slowly leaks memory and crashes the browser tab during long reading sessions (reported on iOS Safari reading novels on Narou and in the ttsu reader, where the tab would run out of memory roughly every few minutes). The hidden text overlays Yomu uses on some sites kept their page-change watchers, timers, and duplicate copies alive even after the underlying text was gone, and could also keep re-scanning their own edits; Yomu now releases each overlay\'s watchers and timers as soon as its text is detached and no longer re-scans the changes it makes itself.': '長い読書中にYomuが少しずつメモリを消費してブラウザのタブがクラッシュする問題を修正しました（iOS Safariで小説投稿サイト「なろう」やttsuリーダーを読んでいると、数分ごとにタブがメモリ不足になると報告されていました）。一部のサイトでYomuが使う非表示のテキストオーバーレイが、元のテキストがなくなった後も変更の監視・タイマー・複製を保持し続け、自分の編集を再スキャンし続けることもありました。Yomuは、テキストが切り離された時点で各オーバーレイの監視とタイマーを解放し、自分自身が加えた変更を再スキャンしないようになりました。',
    'Copying text from a page Yomu has annotated no longer produces doubled or garbled text. The hidden overlay Yomu adds for some layouts was being included in the selection, so copying picked up two copies of the words (and sometimes the furigana readings); the overlay is now excluded from selection and the clipboard, leaving the original page text clean.': 'Yomuが注釈を付けたページからテキストをコピーしても、文字が二重になったり乱れたりしなくなりました。一部のレイアウトでYomuが追加する非表示オーバーレイが選択に含まれ、単語が二重に（ときにはふりがなの読みも）コピーされていました。オーバーレイは選択とクリップボードから除外され、元のページのテキストがそのままコピーされます。',
    'The welcome/onboarding overlay no longer appears on every website when Yomu is installed as a browser extension. It was showing over ordinary pages because the check that should have limited it to Yomu\'s own new-tab page was inverted for the extension; it now appears only on the Yomu new-tab/study page.': 'Yomuをブラウザ拡張機能としてインストールしている場合に、ようこそ／オンボーディングのオーバーレイがすべてのウェブサイトで表示される問題を修正しました。Yomu専用の新しいタブページだけに限定するはずの判定が拡張機能では反転していたため、通常のページにも表示されていました。今後はYomuの新しいタブ／学習ページにのみ表示されます。',
    'YouTube fullscreen on iPad now behaves like it does without Yomu: the top search bar is hidden, and the player controls fade out on their own instead of staying up permanently. Yomu was dispatching a page resize that YouTube reads as constant activity (which kept the controls awake), and its inline fullscreen wasn\'t hiding YouTube\'s top bar; both are now fixed.': 'iPadでのYouTubeの全画面表示が、Yomuなしのときと同じように動作するようになりました。上部の検索バーが隠れ、プレーヤーのコントロールが出しっぱなしにならず自動的に消えます。Yomuがページのリサイズを発火させ、YouTubeがそれを操作中とみなしてコントロールを表示し続けていたこと、そしてYomuのインライン全画面表示がYouTubeの上部バーを隠していなかったことが原因で、どちらも修正しました。',
    'Discord and other constantly-re-rendering apps no longer slowly break their own layout ("the spaces get bigger and bigger"). When such an app reshuffled a message\'s elements, Yomu could lose track of the hidden text overlay it had added and stack a fresh one on top each time, and each extra copy added height until rows grew unbounded. Yomu now finds and reuses the overlay it already owns no matter where the app moves it, so only one is ever present.': 'Discordのように絶えず再描画されるアプリで、レイアウトが少しずつ崩れる（「余白がどんどん大きくなる」）問題を修正しました。こうしたアプリがメッセージの要素を組み替えると、Yomuが追加した非表示のテキストオーバーレイを見失い、そのたびに新しいものを重ねてしまい、コピーが増えるたびに高さが増えて行が際限なく大きくなっていました。Yomuは、アプリがどこに動かしても既に所有しているオーバーレイを見つけて再利用するようになり、常に1つだけになります。',
    'YouTube Shorts video titles no longer occasionally vanish. When Shorts recycled a title element and swapped in new text, Yomu\'s hidden overlay was cleared without asking for a fresh pass, leaving the title blank; it now re-scans immediately so the new title always appears.': 'YouTube ショートの動画タイトルがときどき消える問題を修正しました。ショートがタイトル要素を再利用して新しいテキストに差し替えると、Yomuの非表示オーバーレイが再スキャンを要求しないまま消去され、タイトルが空白になっていました。今はすぐに再スキャンするため、新しいタイトルが常に表示されます。',
    'The channel/title pill on YouTube Shorts no longer shows furigana readings floating with the word text missing beneath them. The at-rest style for buttons and chrome was overriding the word\'s readable text colour so the base glyphs blended into the pill; the base text now keeps its computed contrast colour.': 'YouTube ショートのチャンネル／タイトルのピルで、単語本体が見えずふりがなだけが浮いて表示される問題を修正しました。ボタンやUIの通常時のスタイルが単語の読みやすい文字色を上書きし、本体の文字がピルに溶け込んでいました。本体の文字は、コントラストを考慮して算出した色を保つようになりました。',
    'Buttons such as Subscribe (チャンネル登録) now keep their pitch-accent underline at rest, matching subtitles and body text. The bare-until-hover treatment for chrome now only removes the background highlight; the pitch/state underline, text colour, and furigana stay visible.': '「チャンネル登録」などのボタンでも、通常時にピッチアクセントの下線が保たれ、字幕や本文と揃うようになりました。UIのホバーするまで装飾を消す処理は背景のハイライトのみを外すようになり、ピッチ／状態の下線・文字色・ふりがなは表示されたままになります。',
    'Browser-extension users can now actually turn off Yomu Study as the new-tab page. The "Set Study as the new tab" setting was silently switching itself back on every time a new tab opened; it now stays exactly as you set it, turning it off shows a plain new tab instead of Study, and the choice is offered during onboarding.': 'ブラウザ拡張機能のユーザーが、Yomuの学習を新しいタブページとして実際にオフにできるようになりました。「学習を新しいタブに設定」がタブを開くたびに勝手にオンに戻っていましたが、設定したとおりに保たれ、オフにすると学習の代わりに何もない新しいタブが表示され、オンボーディングでも選べるようになりました。',
    'Japanese readings (furigana) inside narrow site chrome — such as the buttons in Reddit\'s community header — no longer wrap onto two lines or get cut off on Safari and other WebKit browsers. A reading longer than its kanji (for example しょうさい over 詳細) was stacking onto a second line that a short button then clipped away, which looked like the reading was missing entirely; the annotation now always stays on a single line.': '狭いサイトのUI（Redditのコミュニティヘッダーのボタンなど）の中で、ふりがながSafariなどのWebKitブラウザで2行に折り返したり見切れたりしなくなりました。漢字より長い読み（例：詳細の上のしょうさい）が2行目に回り込み、背の低いボタンでその2行目が切り取られて読みが消えたように見えていました。今後は注釈が常に1行に収まります。',
    'The study session has a new optional "Type the word" step after Speaking: the example sentence appears with the target word blanked out and you fill it in — either by typing, or by handwriting it one kanji at a time (each kanji is graded against its stroke shape, while kana and reference-less characters advance on their own). It grades your first attempt instantly and shows the correct answer, and you can turn it off or skip it per session. Your keyboard/handwriting choice is remembered.': '学習セッションに、発音ステップの後に行う任意の「単語を書く」ステップを追加しました。例文の対象単語が空欄で表示され、入力するか、漢字を一字ずつ手書きして解答します（各漢字は筆画の形で採点され、かなや参照のない文字は自動的に進みます）。最初の解答をその場で採点して正解を表示し、セッションごとにオフにしたりスキップしたりできます。キーボードか手書きかの選択は記憶されます。',
    'The final reveal now shows a per-step results strip — a compact row of ✓ / ✗ / — marks for each step you did this card (Kanji, Recall, Listen, Speak, Type) — and gently highlights a suggested grade based on how those steps went. It is only a suggestion: your own grade always wins, and skipped steps never count against you.': '最終表示で、ステップごとの結果ストリップを表示するようになりました。そのカードで行った各ステップ（漢字・リコール・リスニング・発音・入力）について ✓ / ✗ / — を並べたコンパクトな行で、結果に応じておすすめの評価をそっと強調します。あくまで提案であり、自分の評価が常に優先され、スキップしたステップが不利に働くことはありません。',
    'The Listen pitch step now tells you immediately whether your pick was right instead of waiting until the reveal, and it keeps the picker live so you can explore the other contours afterwards — your recorded result is fixed to your first pick, so exploring never changes your grade. Words that legitimately have more than one accent now accept any of their valid patterns as correct.': 'リスニングのピッチステップは、最終表示を待たずに選択が正しかったかどうかをその場で知らせるようになりました。選択後もピッカーは操作でき、ほかの型を確認できます。記録される結果は最初の選択で確定するため、確認のために触っても評価は変わりません。複数の正しいアクセントを持つ単語は、その有効な型のいずれを選んでも正解として扱われます。',
    'Pitch accents on the reveal and the Listen feedback now label how common each variant is — the primary reading is marked "Most common" and the others "Also used" — and the variant graphs sit in one compact wrapping row that uses space far better on a phone, with the primary pattern emphasised first.': '最終表示とリスニングのフィードバックで、各ピッチアクセントの一般度を表示するようになりました。主要な読みには「最も一般的」、その他には「他の型」と付き、複数の型のグラフは折り返す一列のコンパクトな配置になり、スマートフォンでの余白の使い方が大きく改善します。主要な型が先頭で強調されます。',
    'You can now swipe left and right to move between study steps, not just to grade on the last step: a horizontal swipe on an earlier step steps forward or back, while the final-reveal swipe still grades (left again, right good). Swipes are ignored when they start on the handwriting canvas, a text box, or the pitch buttons, and vertical scrolling is untouched.': '学習ステップ間の移動を、最後の評価だけでなく左右のスワイプで行えるようになりました。手前のステップでの横スワイプは前後に移動し、最終表示でのスワイプはこれまでどおり評価します（左でもう一度、右で良い）。手書きキャンバス・テキスト入力・ピッチのボタン上で始まったスワイプは無視され、縦スクロールはそのまま使えます。',
    'Tapping a "composed of" kanji chip on the reveal page no longer freezes the page or navigates away. The chip now opens the standard kanji popover — with its stroke diagram, meaning, and mnemonic — right next to the word, instead of swapping the whole card into a separate kanji queue.': '最終表示ページで「構成漢字」のチップをタップしても、ページが固まったり別の画面へ移動したりしなくなりました。チップは、カード全体を別の漢字キューに切り替えるのではなく、単語のすぐそばに標準の漢字ポップオーバー（筆順図・意味・語呂合わせ付き）を開くようになりました。',
    'Clicking the headword on an unrevealed study card now opens the word\'s dictionary entry, as intended, instead of a single-kanji popup.': '未表示の学習カードで見出し語をクリックすると、単一漢字のポップアップではなく、意図どおりその単語の辞書項目が開くようになりました。',
    'Compound words built from an okurigana stem, such as 食べ物, no longer lose their pitch-accent underline on the reveal page: their component pitches are now composed correctly instead of being dropped.': '食べ物のように送り仮名を含む語幹から成る複合語が、最終表示ページでピッチアクセントの下線を失わなくなりました。構成要素のピッチが破棄されず、正しく合成されるようになりました。',
    'Pitch variants that differ only by their downstep position (for example the heiban and odaka readings of a word) are no longer collapsed into a single graph, so every distinct accent a word can take is shown.': '下がり目の位置だけが異なるピッチの型（たとえば平板型と尾高型の読み）が、1つのグラフにまとめられなくなりました。単語が取りうるそれぞれのアクセントがすべて表示されます。',
    'The homepage "Try me" demo text now responds to the very first hover even when the page is still loading: a hover that lands during start-up is replayed once the reader is ready, so the popover no longer needs a second pass to appear.': 'ホームページの「Try me」デモのテキストが、ページの読み込み中でも最初のホバーから反応するようになりました。起動中に行われたホバーはリーダーの準備が整った時点で再現されるため、ポップオーバーの表示に二度目のホバーが不要になりました。',
    'The "Hide furigana for" and "Hide color for" appearance controls and their word-category labels (New, Learning, Known, Due, Failed) are now translated when the interface language is Japanese, instead of always appearing in English.': '外観設定の「ふりがなを隠す対象」と「色を隠す対象」の項目と、その単語カテゴリーのラベル（新規・学習中・既知・期限切れ・不正解）が、インターフェース言語が日本語のときに常に英語で表示される代わりに翻訳されるようにしました。',
    'Colour settings now let you switch off highlighting for specific word categories while keeping the rest coloured — for example, stop colouring words you already know but keep new and due words marked. A new "Hide color for" set of checkboxes in the appearance settings covers New, Learning, Known, Due, and Failed, mirroring the existing per-category furigana control. It works across every colour source (JPDB, Jiten, and Anki states).': '色設定で、一部の単語カテゴリーだけハイライトをオフにし、残りは色付けしたままにできるようにしました。たとえば、すでに知っている単語の色付けをやめつつ、新規や期限切れの単語には印を付けたままにできます。外観設定に「色を付けない対象」のチェックボックス（新規・学習中・既知・期限切れ・不正解）を追加しました。これは既存のカテゴリー別ふりがな設定と同じ仕組みで、すべての色ソース（JPDB・Jiten・Ankiの状態）に対応します。',
    'Text on framework-driven articles that live-update (such as NHK news) no longer turns into an unreadable double image. When such a site re-rendered a paragraph, its fresh copy of the text painted on top of Yomu\'s already-annotated words, leaving two overlapping copies. Yomu now detects that duplicate re-insert, drops its stale annotations for that paragraph, and switches it to the non-destructive overlay so later re-renders stay clean. Verified on both Chromium and WebKit.': 'NHKニュースなどのように内容がリアルタイムで更新されるフレームワーク製の記事で、本文が二重に重なって読めなくなる問題を修正しました。こうしたサイトが段落を再描画すると、そのテキストの新しいコピーがYomuの注釈付き単語の上に描画され、2つのコピーが重なっていました。Yomuはこの重複した再挿入を検知し、その段落の古い注釈を取り除いて非破壊的なオーバーレイに切り替えることで、その後の再描画でも表示が乱れないようにしました。ChromiumとWebKitの両方で検証済みです。',
    'The pause icon on the puck is now centred in its badge instead of sitting slightly to the left.': 'パックの一時停止アイコンが、バッジ内で少し左に寄っていたのを中央に配置するようにしました。',
    'Each word and subtitle colour channel (highlight, underline, text) now offers a "None" option — previously labelled "Off" — so it is clear you can turn that channel\'s colour off entirely (for example no underline colour, or no word highlight at all).': '単語・字幕の各色チャンネル（ハイライト・下線・文字色）に「なし」の選択肢を追加しました（以前は「オフ」表記）。チャンネルの色を完全にオフにできることが分かりやすくなりました（例：下線の色をなしにする、単語のハイライトをすべてなしにするなど）。',
    'Jiten parsing no longer sends tiny single-word requests to jiten.moe: short text now parses with your local offline dictionaries (when installed) while longer batched lines still use the Jiten endpoint, cutting request volume and giving better boundaries on long passages.': 'Jitenでの解析が、jiten.moeへ単語1つだけの小さなリクエストを送らなくなりました。短いテキストは（インストールされていれば）ローカルのオフライン辞書で解析し、長いまとまった行はこれまで通りJitenエンドポイントを使うことで、リクエスト数を減らし、長い文章での区切り精度も向上します。',
    'The floating puck is far less distracting at rest — it fades back into the page and only brightens to a crisp, clearly-coloured state when you hover or focus it. The three power states stay distinguishable by their colour, ring, and badge.': 'フローティングパック（よむボタン）が待機時にかなり控えめになりました。普段はページになじんで目立たず、ホバーまたはフォーカスしたときだけくっきりと色付きの状態表示に切り替わります。3つの電源状態は色・リング・バッジで引き続き判別できます。',
    'Local (offline) parsing is significantly faster: word deinflection — the single biggest cost in the local parser\'s per-line work — is now cached, so re-scanning a page or a live subtitle no longer recomputes the same candidates hundreds of times.': 'ローカル（オフライン）解析が大幅に高速化しました。ローカル解析の行ごとの処理で最大のコストである活用の逆引き（deinflection）をキャッシュするようになり、ページやライブ字幕を再スキャンしても同じ候補を何百回も計算し直さなくなりました。',
    'The puck\'s power button now cycles through all three states — annotations on, furigana hidden (colours and lookups stay active), and paused — instead of collapsing to a pause/resume toggle. Resuming from paused always restores furigana, so a furigana-off preference or a mid-session reload can no longer strand you between two states.': 'パックの電源ボタンが、注釈オン・ふりがな非表示（色分けと辞書引きは有効なまま）・一時停止の3つの状態を順に切り替えるようになりました（一時停止と再開だけの切り替えに退化しなくなりました）。一時停止からの再開時に必ずふりがなを復元するため、ふりがなオフの設定やセッション途中のリロードでも2つの状態の間で行き詰まらなくなりました。',
    'Compound words such as 国内向け now show their "Composed of" breakdown into component chips (国内 + 向け) in the lookup popover; kanji-stem compounds with an okurigana or kana tail used to be skipped before segmentation. (Requires imported offline dictionaries.)': '国内向けのような複合語が、辞書ポップアップで「構成」内訳の要素チップ（国内＋向け）を表示するようになりました。送り仮名や仮名で終わる漢字語幹の複合語は、これまで分割前に除外されていました（オフライン辞書のインポートが必要です）。',
    'Compound headwords now show a pitch-accent graph composed from their parts even when only a component\'s reading is in the pitch bank (向け resolves through its reading むけ) instead of staying grey; ambiguous readings are still left uncoloured so a homograph is never mismarked. (Requires an imported pitch bank.)': '複合語の見出し語について、構成要素の一部の読みだけが音高辞書にある場合でも（向け は読み「むけ」で解決）、構成要素から合成した音高アクセントのグラフを表示するようになりました（従来はグレーのまま）。読みが曖昧な場合は同音異義語を誤表示しないよう無色のままにします（音高辞書のインポートが必要です）。',
    'The puck\'s three power states are now unmistakable at a glance: everything on is a green ring with a solid dot, furigana hidden is a distinct amber ring with a crossed-through ふ badge, and paused is greyed with a dashed ring and a pause badge — so on and furigana-off are no longer both green and easy to confuse.': 'パックの3つの電源状態が一目で判別できるようになりました。すべてオンは緑のリングと丸ドット、ふりがな非表示ははっきり異なる琥珀色のリングと取り消し線つき「ふ」バッジ、一時停止は破線リングと一時停止バッジのグレー表示で、「オン」と「ふりがなオフ」がどちらも緑で紛らわしいということがなくなりました。',
    'The Grammar and Translation sections that Yomu adds to dictionary sites such as jpdb.io now actually load: they used to sit on "Finding grammar..." or "Open this section to translate." forever because their lazy loaders were only wired up inside Yomu\'s own popover, not on dictionary-page panels.': 'jpdb.ioなどの辞書サイトにYomuが追加する「文法」と「翻訳」セクションが、実際に読み込まれるようになりました。これまでは遅延ローダーがYomu自身のポップアップ内でしか配線されておらず、「文法を検索中...」や「このセクションを開いて翻訳」のまま永遠に止まっていました。',
    'The YouTube subtitle side panel no longer turns unusable on long videos: word-state colouring passes used to re-measure contrast across every transcript row on every cue (a forced layout over hundreds of rows per second), and now only refresh the lines whose words actually changed.': 'YouTubeの字幕サイドパネルが長い動画で操作不能になる問題を修正しました。単語状態の色付け処理が、字幕の切り替わりごとに全トランスクリプト行のコントラストを再計測（毎秒数百行の強制レイアウト）していましたが、実際に単語が変化した行だけを更新するようになりました。',
    'Deep-scrolling a long transcript no longer runs into blank rows: the virtualized list calibrated its row height from a fixed 80px guess, so furigana-tall rows accumulated thousands of pixels of drift; the estimate is now measured from the rows on screen.': '長いトランスクリプトを深くスクロールしても空白行に突き当たらなくなりました。仮想化リストが行の高さを固定80pxの推定値で計算していたため、ふりがなで高くなった行では数千ピクセルものずれが蓄積していましたが、画面上の実際の行から高さを計測するようになりました。',
    'Bunpro-only setups (no JPDB or Jiten key, no Anki) now get word-state colouring on scanned pages and subtitles: the scan pipeline gated all word-state enrichment behind Anki being enabled, so the Bunpro colouring pass never ran for users who only have a Bunpro token.': 'Bunproのみの構成（JPDB・Jitenキーなし、Ankiなし）でも、スキャンしたページや字幕で単語状態の色付けが行われるようになりました。スキャンパイプラインがすべての単語状態エンリッチメントをAnki有効時に限定していたため、Bunproトークンしか持たないユーザーでは色付け処理が一度も実行されていませんでした。',
    'Words whose reading carries more than one attested pitch accent now show every distinct accent graph instead of silently presenting the first one as the only accent, since the correct pattern often depends on the sentence; multi-graph rows (accent variants and per-component graphs) also break onto their own full-width line under the headword instead of stacking in the narrow corner next to the audio button, and component chips align with the headword text and show a visible keyboard focus ring.': '読みに複数のピッチアクセントが登録されている単語は、最初のパターンだけを唯一のアクセントとして提示するのではなく、異なるアクセントのグラフをすべて表示するようになりました。正しいアクセントは文によって変わることが多いためです。また、複数グラフの行（アクセントの異形や構成要素ごとのグラフ）は、音声ボタンの隣の狭い隅に積み重なるのではなく、見出し語の下の全幅の行に配置されるようになり、構成要素チップは見出し語のテキストと揃い、キーボードフォーカス時にはっきりしたリングが表示されます。',
    'Unknown pitch words no longer paint the neutral grey pitch underline in page annotations or YouTube subtitle/transcript rows; pitch underlines now appear only after a real pitch class is known.': 'ピッチ不明の単語が、ページ注釈やYouTube字幕／トランスクリプト行で中立的な灰色のピッチ下線を描かなくなりました。ピッチ下線は、実際のピッチ種別が分かった後にだけ表示されます。',
    'Local pitch resolution now shares the same whole-word, kana-keyed, and component-composed fallback path across parser annotations, page enrichment, popup cards, and study/search cards, so compound words behave consistently wherever Yomu renders them.': 'ローカルのピッチ解決は、解析注釈・ページ上の補完・ポップアップカード・学習／検索カードのすべてで、単語全体、かな表記キー、構成要素からの合成という同じフォールバック経路を共有するようになりました。これにより、複合語はYomuが表示するどの場所でも一貫して扱われます。',
    'Mining into a custom JPDB deck no longer fails with "JPDB request failed (400)": numeric deck ids are now sent to the deck add/remove API as numbers instead of strings, so grading a word that is not yet in your selected deck adds it and grades it in one tap. Special decks such as the priority list were unaffected.': '独自に作成したJPDBデッキへの単語登録が「JPDB request failed (400)」で失敗しなくなりました。数値のデッキIDを、デッキへの追加・削除APIに文字列ではなく数値として送信するようになったため、選択中のデッキにまだ入っていない単語の採点も、ワンタップで追加と採点が同時に行われます。優先リストなどの特殊デッキには影響ありませんでした。',
    'The puck now shows all three power states unmistakably: annotations on gets an accent ring with a small accent dot, furigana hidden keeps its colour with a larger crossed-ふ badge, and paused stays greyed with a dashed border and pause badge but no longer fades so far that the state is hard to read.': 'パック（丸ボタン）の3つの電源状態が一目で区別できるようになりました。注釈オンではアクセントカラーのリングと小さなアクセントドットが付き、ふりがな非表示では色を保ったまま大きめの「ふ」打ち消しバッジが付き、一時停止ではグレーの破線枠と一時停止バッジのまま、状態が読み取れないほど薄くはならなくなりました。',
    'The "Composed of" breakdown on lookup cards is now an always-visible inline row of tappable component chips joined by middle dots, dropping the collapsible panel and its heading: each part keeps its furigana, pitch colouring, and one-tap lookup while the whole breakdown wraps cleanly and lines up with the rest of the card.': '検索カードの「Composed of」（構成語）の内訳が、中黒でつないだタップ可能な構成要素チップの常時表示インライン行になり、折りたたみパネルと見出しを廃止しました。各構成要素はふりがな・ピッチ色・ワンタップ検索を保ったまま、内訳全体がきれいに折り返し、カードの他の内容と左端がそろいます。',
    'Compound dictionary cards now compose a whole-word pitch graph from local component pitch entries when no whole-word pitch row exists, so the popup graph and pitch underline no longer stay unknown for words such as 登録者数.': '複合語の辞書カードは、単語全体のピッチ行がない場合にローカルの構成要素ピッチから単語全体のピッチグラフを合成するようになりました。これにより、登録者数のような語でもポップアップのグラフやピッチ下線が不明のままになりません。',
    'The "Composed of" panel is more compact and scannable: parts render as wrapped lookup chips with furigana, pitch colouring, and clear separators, so two-part expressions and longer compounds use the popup space without the old loose row layout.': '「Composed of」パネルは、よりコンパクトで見通しよくなりました。構成要素は、ふりがな・ピッチ色・明確な区切りを持つ折り返し可能な検索チップとして表示されるため、二語の表現も長い複合語も、従来の間延びした行レイアウトに頼らずポップアップの空間を使えます。',
    "Kaa and similar custom video players now load subtitle files declared inside player config payloads, including Astro-style": "Kaaなどのカスタム動画プレーヤーで、プレーヤー設定内に宣言された字幕ファイルを読み込めるようになりました。Astro形式の",
    "data, and cross-origin page-file subtitles try anonymous browser CORS before falling back to the userscript bridge. This keeps tracks such as Kaa's": "データにも対応し、クロスオリジンのページファイル字幕はユーザースクリプトブリッジへ戻る前に、ブラウザの匿名CORSを試します。これによりKaaの",
    "VTT files from getting stuck at \"waiting for captions.\"": "VTTファイルのようなトラックが「waiting for captions」のまま止まらなくなります。",
    "Furigana layout stays enabled without clipping or overflowing compact ecommerce rows: Google Search chips, Bloomee product cards, drawer/menu rows, and similar clipped controls now reserve ruby room on the actual control container as well as the mirrored text row.": "コンパクトな通販行でも、ふりがなレイアウトを有効にしたまま切り抜きやはみ出しを防げるようになりました：Google検索チップ、Bloomeeの商品カード、ドロワー／メニュー行などのクリップされた操作要素では、ミラーされたテキスト行だけでなく実際の操作コンテナ側にもルビ用の余白を確保します。",
    "YouTube live chat/card text is parsed at the message/control level instead of as whole live panels, reducing live-page churn while preserving furigana and pitch underlines on readable YouTube chrome.": "YouTubeライブチャットやカードのテキストは、ライブパネル全体ではなくメッセージ／操作テキスト単位で解析されるようになりました。ライブページの処理負荷を抑えながら、読めるYouTubeクローム上のふりがなとピッチ下線は維持されます。",
    "Furigana stays readable without breaking compact ecommerce layouts: short product price rows, breadcrumbs, review links, drawer menus, and similar fixed-height sections now grow only enough for readings instead of clipping, overlapping, or dropping annotated text.": "ふりがなが、コンパクトな通販レイアウトを壊さず読みやすくなりました：短い商品価格行、パンくず、レビューリンク、ドロワーメニューなどの固定高に近いセクションは、注釈テキストを切ったり重ねたり消したりせず、読みの分だけ必要最小限に広がります。",
    "YouTube live chat is lighter and parses subscriber-only notices correctly: live chat scans are scoped to message/control text instead of whole chat containers,": "YouTubeライブチャットが軽くなり、登録者限定のお知らせも正しく解析されるようになりました：ライブチャットのスキャン範囲はチャットコンテナ全体ではなく、メッセージや操作テキストに絞られます。",
    "frames get the same ruby-safe YouTube handling as watch pages, and split notice text such as 登録者 still receives furigana and pitch underlines.": "フレームも通常の視聴ページと同じルビ安全なYouTube処理を受け、登録者のように分割されたお知らせテキストにもふりがなとピッチ下線が付きます。",
    "YouTube transcript rows keep phrase context across adjacent cue fragments without bloating the drawer labels, so words split by transcript row boundaries parse consistently while the panel remains compact.": "YouTubeのトランスクリプト行は、ドロワーのラベルを肥大化させずに隣接するキュー断片をまたぐ文脈を保つようになりました。行境界で分かれた語も一貫して解析され、パネルはコンパクトなままです。",
    "Compound lookup component links now keep their ruby and pitch styling, so composed-of entries remain readable without losing pronunciation detail.": "複合語検索の構成要素リンクでもルビとピッチ装飾が保たれるようになり、Composed of の項目でも発音情報を失わず読みやすくなりました。",
    "Placeholder caption tracks no longer render as subtitles: metadata cues such as \"Captions not needed: There is no dialogue\" (Amazon product videos) are dropped everywhere cues are read, and tracks whose entire payload is a single line are no longer auto-selected, so silent videos stay clean while manual track selection keeps working.": "プレースホルダーの字幕トラックが字幕として表示されなくなりました：「Captions not needed: There is no dialogue」（Amazonの商品動画）のようなメタデータキューはキューを読み込むすべての経路で除外され、内容が1行だけのトラックは自動選択されなくなったため、無音の動画は表示がきれいなまま、手動でのトラック選択は引き続き機能します。",
    "The subtitle overlay on generic sites now anchors to the actual video frame instead of a wider page section containing it: wrappers that extend far past one side of the video (player plus a \"more videos\" sidebar) are rejected, so subtitles centre on the picture and hide when the video scrolls out of view, and scrolling inside nested containers re-anchors the overlay too.": "一般サイトの字幕オーバーレイが、動画を含むより広いページセクションではなく実際の動画フレームに固定されるようになりました：動画の片側に大きくはみ出すラッパー（プレーヤー＋「他の動画」サイドバー）は除外されるため、字幕は映像の中央に表示され、動画が画面外にスクロールすると非表示になります。入れ子のスクロールコンテナ内のスクロールでもオーバーレイが再固定されます。",
    "Dragging the subtitle line upwards is no longer capped at 40% of the video frame: the line can ride as high as the screen allows, matching the freedom the downward direction already had.": "字幕行を上方向へドラッグする際の動画フレーム40%の上限がなくなりました：下方向と同様に、画面が許す限り高い位置まで移動できます。",
    "The subtitle style popover no longer duplicates the bottom-offset slider — drag the line itself to reposition it — and the drag handle now appears only while the video's rail controls are visible instead of hovering permanently over idle videos.": "字幕スタイルのポップオーバーから重複していた下端オフセットのスライダーを削除しました（字幕行そのものをドラッグして位置を変更できます）。また、ドラッグハンドルは動画のレールコントロールが表示されている間のみ表示され、操作していない動画の上に常時表示されることはなくなりました。",
    "Styled chat-app and framework-managed rows keep their look when annotated: instead of hiding the whole row (which erased its background, border, and icons) the row's own text is made transparent while the annotated overlay paints on top — the box, its icons, and its decorations keep rendering, and icons drawn with the text colour keep their colour.": "装飾されたチャットアプリやフレームワーク管理下の行が、注釈時にも見た目を保つようになりました：行全体を隠す（背景・枠線・アイコンが消えていた）代わりに、行自身のテキストを透明にして注釈オーバーレイを上に描画します。ボックス・アイコン・装飾はそのまま描画され、テキスト色で描かれたアイコンも色を保ちます。",
    "Titles that wrap differently once they grow for furigana no longer stay clipped: the cropped-row sweep re-measures after applying room and grows again when the new wrap needs it (this depended on the system's fonts, so some devices saw clipped watch titles that others did not).": "ふりがなのために拡張すると折り返しが変わるタイトルが、クリップされたままになることがなくなりました：クロップ行のスイープが余白適用後に再計測し、新しい折り返しが必要とすれば再度拡張します（これはシステムのフォントに依存していたため、一部のデバイスでのみ視聴タイトルがクリップされていました）。",
    "Improved": "改善",
    "The puck now makes its power-cycle state visible: furigana-hidden mode gets its own small furigana badge and partial-tone power action, while fully paused annotations show a pause badge, so the intermediate \"readings hidden but lookups still active\" state no longer looks the same as turning annotations off.": "パックの電源サイクル状態が見た目で分かるようになりました：ふりがな非表示モードには小さなふりがなバッジと中間トーンの電源アクションを表示し、注釈の完全一時停止には一時停止バッジを表示します。これにより、「読みは隠れているが検索は有効」な中間状態が、注釈をオフにした状態と同じに見えなくなります。",
    "Large wrapped YouTube titles now reserve a small post-measurement cushion after the ruby-room sweep, so Linux/CI Chrome font metrics no longer leave watch titles a few pixels clipped even after the title grows for furigana.": "大きく折り返すYouTubeタイトルでは、ルビ用余白のスイープ後に計測値へ小さな余裕を追加するようになりました。Linux／CI版Chromeのフォント計測でも、ふりがなのためにタイトルを広げたあと数ピクセルだけ欠けることがなくなります。",
    "The puck power button now steps through three states: everything on, furigana hidden, and annotations paused. One press hides readings while the reader stays active for colours, lookups, and mining; a second press pauses everything; a third brings it all back, restoring the furigana mode you were on when the same cycle hid it.": "パックの電源ボタンが、すべてオン、ふりがな非表示、注釈一時停止の3状態を順番に切り替えるようになりました。1回押すと読みを隠しつつ色分け・単語検索・単語登録は有効なまま、2回目で全注釈を一時停止、3回目で再開し、同じサイクルで隠したときのふりがなモードに戻します。",
    "Settings are now stored reliably on userscript managers that hand back copies of saved values instead of the values themselves, such as the Safari and Firefox userscript apps, so preferences and the welcome screen no longer reappear from scratch on each new site. A failed storage write also falls back to local storage now instead of being silently dropped.": "SafariやFirefoxのユーザースクリプトアプリのように、保存値そのものではなくコピーを返すユーザースクリプトマネージャーでも、設定が確実に保存されるようになりました。これにより、設定内容やようこそ画面が新しいサイトごとに最初からやり直しになることはありません。保存の書き込みに失敗した場合も、黙って破棄されるのではなくローカルストレージに退避するようになりました。",
    "An immediate rescan requested right after annotations change, for example from the puck power button, is no longer postponed by the slow rescan throttle that live-updating pages use, so the page re-annotates instantly instead of up to ten seconds later.": "パックの電源ボタンなどで注釈状態が変わった直後に要求される即時再スキャンが、ライブ更新ページ向けの遅い再スキャンスロットルで先延ばしされなくなりました。これにより、最大10秒待つのではなくページがすぐに再注釈されます。",
    "Subtitle transcript rows paint their readings and pitch colouring as soon as each line is parsed, instead of leaving a line bare until every word on it resolved — no more patchwork of coloured and uncoloured lines in the drawer.": "字幕トランスクリプトの行が、各行が解析され次第すぐに読みとピッチ色付けを描画するようになりました。行内のすべての単語が解決するまで行が素のまま残ることがなくなり、ドロワー内で色付きと色なしの行がまだらになることがなくなりました。",
    "Subtitle transcript rows are more compact: cue rows no longer waste vertical space (a two-line cue is roughly 25% shorter) while keeping furigana fully readable.": "字幕トランスクリプトの行がよりコンパクトになりました：キュー行が縦方向のスペースを無駄にせず（2行のキューで約25%短縮）、ふりがなは完全に読める状態を保ちます。",
    "Furigana readings no longer show gaps between words in overlay chips (for example a sort control reading \"新しい順\"): the annotation overhang is measured and tightened so words sit together the way they do in body text.": "オーバーレイチップ（例：並び替えコントロールの「新しい順」）で、ふりがなの読みが単語間に隙間を見せることがなくなりました：注釈のはみ出しを計測して詰めることで、本文と同じように単語が並びます。",
    "Furigana readings are no longer shaved at the top edge of short fixed-height chips and labels (for example \"さらに表示\"): those rows now reserve a little clearance above the reading.": "短い固定高のチップやラベル（例：「さらに表示」）で、ふりがなの読みが上端で削られることがなくなりました：これらの行は読みの上に少し余白を確保するようになりました。",
    "Pitch-accent colouring now covers compounds whose whole-word reading is not in the pitch dictionary (for example 登録者数): the pattern is composed from the pitch of the individual parts, so the word colours and underlines instead of staying grey.": "ピッチアクセントの色付けが、単語全体の読みがピッチ辞書にない複合語（例：登録者数）にも対応するようになりました：個々の構成要素のピッチからパターンを合成するため、単語は灰色のままではなく色と下線が付きます。",
    "The lookup panel's sentence breakdown now reads as a sentence: tokens flow inline and wrap naturally instead of stacking one word per line, numbers and Latin text between words are kept in place, and each word carries the same pitch accent and study-state colouring as words on the page.": "検索パネルの文分解が文として読めるようになりました：トークンが1行1単語で積み重なる代わりにインラインで自然に折り返して流れ、単語間の数字やラテン文字もそのまま保持され、各単語にはページ上の単語と同じピッチアクセントと学習状態の色付けが付きます。",
    "Composed of polish: the section gained breathing room above its header, components render as annotated ruby chips in a wrapping row, chips can be activated by keyboard (Enter and Space) as well as tap, and component pitch colouring survives kana-variant reading differences.": "「構成要素」セクションの仕上げ：ヘッダー上部に余白が追加され、構成要素はルビ付きのチップとして折り返し行に表示され、チップはタップに加えキーボード（EnterとSpace）でも操作でき、かな表記の違いがあっても構成要素のピッチ色付けが維持されます。",
    "YouTube live streams and live chat no longer trigger continuous full-page rescans: overlay-decorated surfaces that update constantly (chat messages, live view counters) now refresh at most once every few seconds after the first fast refresh, instead of forcing a rescan for every update.": "YouTubeのライブ配信とライブチャットで、継続的なページ全体の再スキャンが発生しなくなりました：常に更新されるオーバーレイ装飾面（チャットメッセージ、ライブ視聴者数）は、最初の高速更新の後は数秒に1回までの更新となり、更新のたびに再スキャンを強制しません。",
    "Furigana mode \"All words\" no longer forces in-place readings into rows the browser engine distorts (fixed-height and clamped rows where the base text would shift out of view): those rows keep their reading via the overlay on plain rows and suppress it on styled rows, exactly like other modes. Yomu's own panels still always show readings.": "ふりがなモード「すべての単語」が、ブラウザエンジンがレイアウトを崩す行（本文が見えなくなる固定高・クランプ行）にインライン読みを強制しなくなりました：これらの行は他のモードと同様、素の行ではオーバーレイで読みを保ち、装飾された行では読みを抑制します。Yomu自身のパネルでは常に読みが表示されます。",
    "Less jank while annotating large pages: the cropped-row furigana sweep now measures everything before applying any size change (no more one forced reflow per annotated word), and the short-row overflow check no longer scans whole subtrees from every ancestor.": "大きなページの注釈時のカクつきが軽減：クロップ行のふりがなスイープがサイズ変更を適用する前にすべてを計測するようになり（注釈単語ごとの強制リフローが解消）、短い行のオーバーフロー判定が各祖先からサブツリー全体をスキャンしなくなりました。",
    "Styled clipped rows keep their look: a pill chip, dark section bar, row with an icon, or row with CSS decorations is no longer hidden behind a text overlay when its text is annotated — only visually bare rows (plain clipped titles and labels) use the overlay for furigana, and styled rows render in place with the reading suppressed instead. This fixes chips losing their background and border, dark bars and separators vanishing, icons disappearing, and doubled overlapping text on decorated sites.": "装飾されたクリップ行の見た目が維持されるようになりました：ピル型チップ、暗いセクションバー、アイコン付きの行、CSS装飾のある行が、テキストの注釈時にテキストオーバーレイの背後に隠されなくなりました。視覚的に素の行（プレーンなクリップ済みタイトルやラベル）のみがふりがなにオーバーレイを使用し、装飾された行は読みを抑制してその場で描画されます。これにより、チップの背景や枠線の消失、暗いバーや区切り線の消滅、アイコンの非表示、装飾サイトでの二重に重なるテキストが修正されました。",
    "Smoother annotation on iPhone and iPad: the clipped-row layout check is now memoized per element, so large pages no longer pay a forced layout reflow for every annotated word.": "iPhone・iPadでの注釈がよりスムーズに：クリップ行のレイアウト判定が要素ごとにメモ化され、大きなページで注釈される単語ごとに強制レイアウトリフローが発生しなくなりました。",
    "Overlay-decorated text no longer flickers or tears down on rows with hidden duplicate labels: the mirror staleness check now reads the host through the same visible-text extractor it was seeded with, and hidden or script-only text can no longer be painted into the mirror.": "非表示の重複ラベルを持つ行で、オーバーレイ装飾テキストがちらついたり消えたりしなくなりました：ミラーの陳腐化チェックが、初期化時と同じ可視テキスト抽出でホストを読むようになり、非表示テキストやスクリプトのみのテキストがミラーに描画されることもなくなりました。",
    "Live-updating mirrored rows (view counts, subscriber counts) refresh in place instead of flapping between decorated and bare: the stale-mirror rescan is no longer debounced past the mirror's removal grace window.": "ライブ更新されるミラー行（再生回数・登録者数）が、装飾と素のテキストの間で点滅せずその場で更新されるようになりました：陳腐化ミラーの再スキャンが、ミラー撤去の猶予時間を超えてデバウンスされることがなくなりました。",
    "Safari/WebKit constrained-row handling can no longer lock in a wrong verdict when the reader stylesheet loads late: the ruby layout probe verifies Yomu's own styles are applied before caching its result, so healthy engines keep in-place furigana.": "リーダーのスタイルシートの読み込みが遅れた場合に、Safari/WebKitの制約行処理が誤った判定を固定しなくなりました：ルビレイアウトプローブが結果をキャッシュする前にYomu自身のスタイルが適用されているか検証するため、健全なエンジンではインラインのふりがなが維持されます。",
    "Clipped single-line rows now also grow when furigana clips at the top of the row (Google search chips and similar fixed-height labels), and removing a mirror no longer overwrites styles the page changed while the mirror was up.": "ふりがなが行の上端で切れる場合も、クリップされた1行の行が拡張されるようになりました（Google検索のチップや同様の固定高ラベル）。また、ミラーの撤去時に、ミラー表示中にページ側が変更したスタイルを上書きしなくなりました。",
    "Bunpro colouring hardening: the review index is cached per account so switching tokens can never colour words from the previous account, a failed fetch backs off for five minutes instead of retrying on every scan, and words that leave the Bunpro index restore their original provider state and classes.": "Bunproカラーリングの堅牢化：レビューインデックスがアカウントごとにキャッシュされ、トークンを切り替えても以前のアカウントの状態で単語が色付けされることがなくなりました。取得に失敗した場合はスキャンごとの再試行ではなく5分間バックオフし、Bunproインデックスから外れた単語は元のプロバイダー状態とクラスを復元します。",
    "Smoother scrolling: scroll-triggered rescans are debounced on every site, and scrolling inside Yomu's own panels and popovers no longer triggers page rescans.": "スクロールがよりスムーズに：スクロールで起動する再スキャンがすべてのサイトでデバウンスされ、Yomu自身のパネルやポップオーバー内のスクロールでページ再スキャンが起動しなくなりました。",
    "Rare supplementary-plane kanji (such as 𠮟) are now treated as CJK when collapsing soft line breaks, so words containing them no longer gain a stray space.": "補助面のまれな漢字（𠮟など）もソフト改行の折りたたみ時にCJKとして扱われるようになり、これらを含む単語に余分なスペースが入らなくなりました。",
    "Bunpro word colouring on pages: with a Bunpro API token connected, scanned words that match your Bunpro vocab reviews now colour with the same state tiers as JPDB and Jiten words (new, learning, known for Master items, due, and ghost reviews as failed), so underline, highlight, and text colour sources reflect your Bunpro progress on every site. Bunpro fills in only words your dictionary provider does not already track, and the review index is cached for six hours to keep page loads light.": "ページ上のBunpro単語カラーリング：Bunpro APIトークンを接続すると、Bunproの語彙レビューに一致するスキャン済みの単語が、JPDBやJitenの単語と同じ状態ティア（新規、学習中、Masterアイテムは習得済み、復習期限、ゴーストレビューは失敗）で色付けされるようになり、下線・ハイライト・文字色のカラーソースがすべてのサイトでBunproの進捗を反映します。Bunproは辞書プロバイダーがまだ管理していない単語のみを補完し、レビューインデックスは6時間キャッシュされるためページ読み込みは軽いままです。",
    "Word lookups no longer fail with a \"No configured proxy.\" toast when nothing is configured: the built-in Cloudflare proxy (edge.yomureader.com) now serves allowlisted read-only dictionary and audio requests on every site, not just yomureader.com, so hover lookups, pitch, and audio work out of the box when a direct or userscript request is unavailable.": "プロキシ未設定のときに単語検索が「No configured proxy.」のトーストで失敗しなくなりました。内蔵のCloudflareプロキシ（edge.yomureader.com）が、yomureader.comだけでなくすべてのサイトで、許可リスト内の読み取り専用の辞書・音声リクエストを処理するようになったため、直接リクエストやユーザースクリプト経由のリクエストが使えない場合でも、ホバー検索・ピッチ・音声が設定なしで動作します。",
    "Pitch underlines are visible again on overlay-decorated buttons and chips (subscribe and membership buttons, sort chips): the rule that keeps resting decoration off native page buttons no longer applies to Yomu's own overlay mirrors, which are always decorated surfaces.": "オーバーレイで装飾されたボタンやチップ（登録ボタン、メンバーになるボタン、並べ替えチップ）で、ピッチの下線が再び表示されるようになりました。ページ本来のボタンから静止時の装飾を外すルールが、常に装飾面であるよむ自身のオーバーレイミラーには適用されなくなりました。",
    "Moved the homepage Study CTA directly after Install and made the Study pill label bold.": "ホームページのStudy CTAをInstallの直後に移動し、Studyピルのラベルを太字にしました。",
    "Desktop-layout YouTube chrome that starved behind the video grid is now decorated: the left mini-guide rail entries, the search filter row, search channel cards, and shelf \"+other N\" expanders are collected with the high-value watch text instead of trailing the grids at the scan cap.": "デスクトップレイアウトのYouTubeで、動画グリッドの後回しになって未装飾のままだったクロームが装飾されるようになりました。左のミニガイドレールの項目、検索フィルター行、検索のチャンネルカード、棚の「+他 N 件」展開ボタンは、スキャン上限でグリッドの後ろに並ぶ代わりに、優先度の高い視聴テキストと一緒に収集されます。",
    "Subscriber counts and subscribe buttons are decorated at last: those rows re-render constantly, which used to exclude them entirely; they now ride the passive overlay mirror, which absorbs the re-renders, so チャンネル登録者数 rows get furigana and pitch everywhere.": "登録者数と登録ボタンがついに装飾されるようになりました。これらの行は絶えず再レンダリングされるため、以前は完全に除外されていましたが、再レンダリングを吸収するパッシブなオーバーレイミラーに載るようになり、チャンネル登録者数の行にもどこでもふりがなとピッチが付きます。",
    "A line break inside a Japanese word no longer renders as a space: YouTube wraps metadata like 視聴 across source line breaks, and the overlay used to show \"視 聴\" with the word split for the tokenizer too; line breaks between Japanese characters now collapse to nothing while Latin text keeps its single space.": "日本語の単語内の改行がスペースとして表示されることがなくなりました。YouTubeは視聴のようなメタデータをソース上の改行で折り返しており、オーバーレイでは「視 聴」と表示され、トークナイザーにとっても単語が分断されていました。日本語の文字間の改行は何も残さず畳み込まれ、ラテン文字のテキストは単一のスペースを維持します。",
    "Removed the homepage hero Guide CTA so the primary action row stays focused on Install, Watch, Read, Study, and Game.": "ホームページのヒーローからGuide CTAを削除し、主要なアクション列をInstall、Watch、Read、Study、Gameに絞りました。",
    "Clipped rows get their furigana back without any layout risk: Shorts titles, shelf headings, and line-clamped post bodies now render through the overlay text mirror, which draws the reading on its own line above the row, instead of suppressing the reading on browsers where in-place ruby would collapse or grow the clip window.": "切り抜き表示の行に、レイアウトを崩す心配なくふりがなが戻りました。ショート動画のタイトル、棚見出し、行数制限付きの投稿本文は、行内にルビを挿入するとクリップ枠が潰れたり広がったりするブラウザーでは読みを省略する代わりに、オーバーレイのテキストミラー経由で描画されるようになり、読みは行の上に独自の行として表示されます。",
    "A recycled element no longer keeps showing its old overlay: when YouTube reuses an element for different text (the comments header turning into the comment composer on iPad), the stale overlay used to keep painting the old text over the new content while hiding it. The overlay is now removed the moment the underlying text changes, and the new text is re-decorated on the next scan.": "再利用された要素に古いオーバーレイが表示され続けることがなくなりました。YouTubeが要素を別のテキストに使い回すと（iPadでコメント見出しがコメント入力欄に変わる場合など）、古いオーバーレイが新しい内容を隠したまま古いテキストを描画し続けていました。下のテキストが変わった瞬間にオーバーレイを取り除き、新しいテキストは次のスキャンで再装飾されます。",
    "Hover dictionary popovers stay open while the pointer remains inside the same hyperlink or link-card control, preventing link-wrapped Japanese text from flashing the popover open and closed as the cursor crosses padding or sibling inline text.": "ポインターが同じリンクまたはリンクカードのコントロール内にある間、ホバー辞書ポップオーバーが開いたままになるようにしました。リンクで囲まれた日本語テキスト上で、余白や隣接するインラインテキストを横切ったときにポップオーバーが開閉して点滅する問題を防ぎます。",
    "Compound lookups such as 跳梁跋扈 now show a \"Composed of\" section with clickable component lookups for parts such as 跳梁 and 跋扈, while keeping the full compound as the main card.": "跳梁跋扈のような複合語の検索では、完全な複合語をメインカードとして維持したまま、跳梁や跋扈などの構成要素をクリックして調べられる「構成語」セクションを表示するようになりました。",
    "Compound-style pitch accent is more reliable: local component pitch segmentation no longer mistakes the whole compound for its only component, and Yomitan pitch metadata that stores raw H/L patterns now loads correctly.": "複合語形式のピッチアクセントがより確実になりました。ローカルの構成要素ピッチ分割が、複合語全体を唯一の構成要素と誤認しなくなり、生のH/Lパターンで保存されたYomitanのピッチメタデータも正しく読み込まれるようになりました。",
    "Pitch underlines no longer get stuck grey or hover-only on Discord-style message prose: readable chat/message bodies inside clickable app containers stay active text, and underline contrast refreshes from Yomu's actual painted underline rather than a transparent native fallback.": "Discord風のメッセージ本文で、ピッチ下線が灰色のまま固まったり、ホバー中だけ表示されたりしなくなりました。クリック可能なアプリコンテナ内の読み物としてのチャット／メッセージ本文はアクティブなテキストとして扱われ、下線コントラストも透明なネイティブ下線ではなく、Yomuが実際に描画している下線から更新されます。",
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
    'When the hosted page has been visited once, the PWA cache keeps the Study shell available offline. Cached cards show an Offline cache status, and review grades that cannot reach Jiten, JPDB, or Anki are saved locally and retried when the provider reconnects.': 'ホスト版ページを一度開くと、PWAキャッシュによりStudyのシェルはオフラインでも使えます。キャッシュ済みカードにはオフラインキャッシュ状態が表示され、Jiten、JPDB、Ankiに届かない採点はローカルに保存され、接続が戻ったときに再試行されます。',
    'When the hosted page has been visited once, the PWA cache keeps the Study shell available offline. Cached cards show an ': 'ホスト版ページを一度開くと、PWAキャッシュによりStudyのシェルはオフラインでも使えます。キャッシュ済みカードには',
    'Offline cache': 'オフラインキャッシュ',
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
    'Listen': 'リスニング',
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
    ', or Anki, then bookmark the page or add it as a Home Screen shortcut.': '、または Anki を接続し、このページをブックマークするか、ホーム画面のショートカットに追加しましょう。',
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
    'One popup: the definition, the Jiten and JPDB ranks, and a grade you can send — all on the same word.': '1つのポップアップに、語義とJiten・JPDBの頻度順位、そして送信できる採点まで。すべて同じ単語のまま。',
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
    'Apps': 'アプリ',
    'All apps': 'すべてのアプリ',
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
    // docs/reference/settings.md is generated by scripts/settings-reference.mjs.
    // Its own words live in that script's PAGE_COPY; the 289 table rows take their
    // wording from the reader's own i18n and are already Japanese there.
    'Settings reference': '設定リファレンス',
    'Every setting Yomu stores is listed here, in the order the settings dialog presents them.': 'よむが保存するすべての設定を、設定ダイアログに並ぶ順で掲載しています。',
    'Open the dialog from the Yomu button on any page.': 'ダイアログは、どのページでもよむのボタンから開けます。',
    'Each row gives the label the dialog shows, the explanation the dialog offers, the value a fresh install starts with, and the name the setting takes in an exported settings file.': '各行には、ダイアログに表示されるラベル、ダイアログの説明、インストール直後の値、設定エクスポートでの名前を載せています。',
    'This page is generated from the reader source, so it stays in step with the version you have installed.': 'このページはリーダーのソースから生成しているため、お使いのバージョンと常に一致します。',
    'Some rows say Not yet described. That marks a real stored setting whose wording is still to be written, shown as a gap rather than filled with a guess.': '「説明は未作成」と書かれている行は、実際に保存される設定で、説明文がまだ書かれていないものです。推測で埋めず、空欄のまま示しています。',
    'Settings without a section of their own': '独自のセクションを持たない設定',
    'Yomu stores these the same way, and a settings export carries them. Some are written as you use the app, such as where you dragged the settings puck. Others are set by a control that covers several settings at once, so this page leaves the section blank rather than picking one.': 'これらも同じように保存され、設定エクスポートに含まれます。設定ボタンをどこに動かしたかなど、アプリの使用中に書き込まれるものもあります。複数の設定をまとめて変更するコントロールで設定されるものもあり、その場合はセクションを推測せず空欄にしています。',
    'Setting': '設定項目',
    'Default': '初期値',
    'Stored as': '保存名',
    'Not yet described': '説明は未作成',
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
    'Tapping anywhere inside the open dictionary popover now pins it in sticky mode, so interacting with it no longer lets it close as a transient hover popup; it stays open until a tap outside dismisses it.': '開いている辞書ポップオーバーの内側をどこでもタップすると固定モードに切り替わり、操作中に一時的なホバーポップアップとして閉じてしまうことがなくなりました。外側をタップして閉じるまで開いたままになります。',
    'On Safari, hover audio no longer stays silent until a word is clicked: the first tap anywhere on the page now unlocks the gesture-authorized audio channel that hover playback reuses.': 'Safariでは、単語をクリックするまでホバー音声が鳴らない問題を修正しました。ページ内のどこかを最初にタップした時点で、ホバー再生が再利用するジェスチャー承認済みの音声チャンネルが解放されます。',
    'The browser extension now leaves the browser\'s new-tab page completely alone. Study opens deliberately from Yomu instead, and a fresh standalone Study session begins at the Word step for a more recognition-first flow before returning to the learner\'s configured sequence.': 'ブラウザー拡張機能は、ブラウザーの新しいタブページを一切変更しなくなりました。代わりにYomuから意図的に学習ページを開きます。独立した学習ページを初めて開いたときは、認識を優先する流れとして「単語」ステップから始まり、その後は学習者が設定した順序に戻ります。',
    'Extension settings now describe webpage scanning in plain language: leave pages unchanged, scan Japanese automatically, or scan only when asked.': '拡張機能の設定では、ウェブページの検出方法を分かりやすく説明するようになりました。「ページを変更しない」「日本語を自動で検出」「指示したときだけ日本語を検出」から選べます。',
    'Chrome and Firefox store copy now describes Yomu as providing "a study page," and the extension icon has been re-centred at every generated size.': 'ChromeとFirefoxのストア説明は、Yomuが「学習ページ」を提供するという表現に更新され、拡張機能アイコンも生成されるすべてのサイズで中央に揃え直されました。',
    'Firefox now asks for its built-in website-content and optional account-data consent in the correct extension-owned context before reading or storing account credentials, and fails closed when that consent cannot be requested.': 'Firefoxでは、アカウント認証情報を読み取りまたは保存する前に、拡張機能自身の画面からウェブサイト内容と任意のアカウントデータに関する組み込みの同意を求めるようになりました。同意を求められない場合は、安全側に倒して処理を止めます。',
    'Store packages now carry their reader CSS and third-party notices locally, while the Firefox source bundle and browser archives build reproducibly for review. Major-version publishing is prepared automatically but remains behind a protected human release checkpoint.': 'ストア用パッケージはリーダーのCSSと第三者ライセンス通知をローカルに同梱するようになり、Firefoxのソースバンドルとブラウザー用アーカイブは審査向けに再現可能な形でビルドされます。メジャーバージョンの公開準備は自動化されますが、保護された人間によるリリース確認を必ず通ります。',
    'The hosted Study page metadata now describes a deliberate study session instead of implying that Yomu belongs on every browser new tab.': 'ホスト版の学習ページのメタデータは、Yomuがすべてのブラウザー新規タブに入るべきだと示唆する表現ではなく、意図的に開く学習セッションとして説明するようになりました。',
    'The published privacy policy now uses a real': '公開中のプライバシーポリシーは、実際の',
    'directory route, so browser-store reviewers and users reach the policy instead of a trailing-slash 404.': 'ディレクトリルートを使うようになったため、ブラウザーストアの審査担当者もユーザーも、末尾スラッシュの404ではなくポリシー本文に到達できます。',
    'Userscript updates no longer install a version that is hours out of date. The script now declares explicit update and download endpoints that always revalidate, so a manager that had cached the hosted copy for several hours stops re-offering an older release such as 1.6.241 while a newer one is published.': 'ユーザースクリプトの更新で数時間前の古いバージョンがインストールされることがなくなりました。常に再検証される更新用・ダウンロード用のエンドポイントを明示するようにしたため、配信元のコピーを数時間キャッシュしていたマネージャーが、より新しいリリースの公開後も1.6.241のような古い版を提示し続けることはなくなります。',
    'Japanese in interactive chrome — buttons, tabs, sort chips, menu labels, timestamps, and other compact controls — now honours the configured word-state highlight at rest, exactly like content words. The previous bare-until-hover rule stripped the highlight channel from chrome behind a growing per-site exception list; the highlight setting is now the single switch, with no per-surface exceptions.': 'ボタン・タブ・並べ替えチップ・メニューラベル・タイムスタンプなどのコンパクトな操作要素にある日本語も、本文の単語とまったく同じように、設定した単語状態ハイライトを常時表示するようになりました。従来の「ホバーするまで無地」ルールは、増え続けるサイト別の例外リストの裏で操作要素からハイライトだけを剥がしていましたが、今後はハイライト設定が唯一のスイッチとなり、サイトごとの例外はありません。',
    'Detached furigana that straddled the painted border of a compact control — half on the page background, half on the pill — now lifts fully clear of the control so the reading sits on one background and stays legible; the existing collision checks judge the lifted position.': 'コンパクトなコントロールの描画された境界線をまたいで、半分がページ背景・半分がピルの上に描かれていた分離ふりがなは、コントロールの外へ完全に持ち上げられるようになりました。読みが一つの背景の上に載って読みやすくなり、持ち上げ後の位置は従来どおり衝突判定が検査します。',
    'Component controls whose visible Japanese label lives entirely inside their own shadow root — such as feed action-bar share buttons rendered as slot fallback behind a boxless wrapper — are now annotated with furigana and pitch like any other control. The scanner\'s boxless-wrapper pruning only read light-tree text, which cannot see across a shadow boundary, so the whole branch was dropped before the component was ever walked, registered, or observed; the pruning check now peeks through open shadow boundaries with the same bounded lookahead the shadow walk already uses, which also keeps the component\'s later re-renders observable.': '表示される日本語ラベルが自身のシャドウルートの中だけにあるコンポーネント型コントロール（ボックスを持たないラッパーの中にスロットのフォールバックとして描画されるフィードのアクションバー共有ボタンなど）にも、他のコントロールと同様にふりがなとピッチの注釈が付くようになりました。スキャナーの空ボックスラッパー枝刈りはライトツリーのテキストしか読んでおらず、シャドウ境界の先を見られないため、コンポーネントが走査・登録・監視される前に枝ごと捨てられていました。枝刈り判定はシャドウ走査と同じ上限付き先読みでオープンなシャドウ境界の先を覗くようになり、コンポーネントの後からの再描画も監視され続けます。',
    'A fragment walk that stops on a full target budget now queues the un-walked elements that can host open shadow roots onto the deferred continuation rounds, so a large component tree can no longer permanently strand its trailing controls outside annotation coverage.': '対象数の上限に達して停止したフラグメント走査は、未走査のままのオープンシャドウルートを持ち得る要素を遅延継続ラウンドのキューに入れるようになりました。巨大なコンポーネントツリーの末尾にあるコントロールが注釈対象から恒久的に取り残されることはもうありません。',
    'Immersion Kit example sentences load again on the yomureader.com demo popup instead of sticking at the loading message forever. The example client and its popup controller ship in the kanji-study companion, but the homepage and docs demo never loaded that companion, so the open section had nothing to fetch with. The hosted docs demo now loads the kanji-study and Anki companions like the video player and PDF reader already do, and the reader resolves every kanji-study collaborator lazily so a companion that registers after the reader boots still works.': 'yomureader.comのデモポップアップで、イマージョンキットの例文が「読み込み中」のまま止まらず、再び読み込まれるようになりました。例文クライアントとそのポップアップコントローラーは漢字学習コンパニオンに含まれていますが、ホームページとドキュメントのデモはそのコンパニオンを読み込んでおらず、開いたセクションには取得手段がありませんでした。ホスト版ドキュメントのデモは、動画プレイヤーやPDFリーダーと同様に漢字学習コンパニオンとAnkiコンパニオンを読み込むようになり、リーダーは漢字学習の連携機能を遅延解決するため、リーダー起動後に登録されたコンパニオンでも正しく動作します。',
    'The dictionary popup no longer shows a bottom mining-drawer handle that cannot open. The drawer\'s expand and collapse behaviour lives in the kanji-study companion, so when no companion is available the collapsed pill was dead weight; the drawer and its handle now only render when there are mining options that can actually be revealed.': '辞書ポップアップに、開けないマイニングドロワーのハンドルが下部に表示されることがなくなりました。ドロワーの開閉動作は漢字学習コンパニオン側にあるため、コンパニオンがない環境では折りたたまれたピルはただの飾りでした。ドロワーとそのハンドルは、実際に表示できるマイニングの選択肢がある場合にのみ描画されます。',
    'Bunpro word frequency, pitch accent, and dictionary entries no longer require a fresh Bunpro login. This data is public, yet the popup silently dropped all of it whenever the stored Bunpro session token was missing or expired, which is why the Bunpro frequency evidence could vanish entirely on devices that had never captured a token. Public lookups now attach the login only when one is available and retry anonymously when Bunpro rejects a stale token; review state and grading still require the account.': 'Bunproの単語頻度・ピッチアクセント・辞書エントリの表示に、有効なBunproログインが不要になりました。これらは公開データであるにもかかわらず、保存されたBunproセッショントークンが未設定または期限切れの場合、ポップアップはすべてを黙って破棄していました。トークンを一度も取り込んでいない端末でBunproの頻度情報が丸ごと消えていたのはこのためです。公開データの取得はログインがあるときだけ添付し、古いトークンをBunproが拒否した場合は匿名で再試行します。復習状態と採点には引き続きアカウントが必要です。',
    'The Bunpro frequency rank now shows inline on the Bunpro pill, matching the Jiten and JPDB pills, instead of adding one pill per corpus to the row. The full per-corpus breakdown, such as General, Anime, Novels, Netflix, and Dictionary, moves into the pill tooltip.': 'Bunproの頻度ランクは、コーパスごとにピルを増やす代わりに、JitenやJPDBのピルと同じようにBunproピルの中にインライン表示されるようになりました。一般・アニメ・小説・Netflix・辞書といったコーパス別の内訳は、ピルのツールチップに表示されます。',
    'Yomu popovers, sheets, settings, notices, and the floating puck now keep their intended physical size under real iPad Safari full-page zoom. The previous browser-surface signal never fires on an actual device because iOS answers outerWidth from the web view itself, so the zoom is now inferred from the physical screen against the layout viewport: both axes must shrink together and the ratio must land on one of Safari\'s zoom steps, so Split View, Slide Over, and Stage Manager window shapes are never misread as zoom.': '実機のiPad Safariでページ全体ズームを使っても、よむのポップオーバー・シート・設定・通知・フローティングパックが本来の物理サイズを保つようになりました。従来の判定はブラウザ表面の幅を使っていましたが、iOSはouterWidthをWebビュー自身から返すため実機では一度も発火しません。現在は物理画面とレイアウトビューポートの比較からズームを推定します。縦横両方が同時に縮んでいること、比率がSafariのズーム段階に一致することを要求するため、Split View・Slide Over・Stage Managerのウィンドウ形状がズームと誤認されることはありません。',
    'The page-zoom compensation is no longer Reddit-specific. The same adapter now protects every Yomu overlay on every site in Apple touch browsers, replacing the reddit.com-gated code path with one generic mechanism.': 'ページズーム補正はReddit専用ではなくなりました。reddit.comに限定されていたコードパスを汎用の仕組みに置き換え、Appleタッチブラウザ上のあらゆるサイトで、すべてのよむオーバーレイを同じアダプターが保護します。',
    'Popup headwords whose stored reading brackets interleave kana between annotated kanji now anchor each bracket reading to its own trailing kanji run. Furigana lands over the correct glyph, the pitch underline no longer paints twice across a mis-spanned ruby base, and the plain kana duplicate beside an already ruby-annotated headword is suppressed instead of repeating the same reading.': '注釈付き漢字の間にかなが挟まる読み表記を持つポップアップ見出し語で、各括弧の読みが直前の漢字連続部分に正しく結び付くようになりました。ふりがなは正しい字の上に載り、範囲がずれたルビ土台の上でピッチ下線が二重に描かれることもなくなり、すでにルビ付きの見出し語の横に同じ読みをかなで繰り返す重複表示は抑制されます。',
    'Furigana returns to tall flex-centred controls such as padded pill buttons and banner chips: a clipped control whose base text is proven to be a single untruncated line may open its clip for the reading lane regardless of padding-driven box height, while genuinely tall panels and multi-line clamps stay closed.': '余白の大きいピル型ボタンやバナーチップのような、縦に高い中央寄せコントロールにふりがなが戻りました。本文が省略のない1行だと証明されたコントロールは、余白による箱の高さに関係なく読みのためにクリップを開けます。本当に高いパネルや複数行の省略表示は引き続き閉じたままです。',
    'Slightly larger default popup typography for readability, especially on iPad: popup and dialog base text moves from 14 to 15 pixels, definitions and example sentences from 13 to 14 pixels, the headword from 24 to 26 pixels, the kana reading row from 15 to 16 pixels, and the default popup Japanese font weight from 400 to 450. Settings body text and in-page content sizes are unchanged, so existing layouts keep their geometry.': '特にiPadでの読みやすさのため、ポップアップの既定文字サイズをわずかに拡大しました。ポップアップとダイアログの基本文字は14pxから15pxへ、語義と例文は13pxから14pxへ、見出し語は24pxから26pxへ、かな読み行は15pxから16pxへ、ポップアップの日本語フォントの既定ウェイトは400から450になります。設定画面の本文とページ内コンテンツのサイズは変わらないため、既存のレイアウトはそのまま保たれます。',
    'Word-status highlighting from a connected Jiten, JPDB, or Anki source now shows by default on every content word, including words wrapped in links such as the cards and guides on yomureader.com. Previously linked words revealed their status colour only while hovered and otherwise looked like plain page links; interface chrome such as navigation bars, buttons, and tabs still stays uncoloured until hover.': '接続済みのJiten・JPDB・Ankiソースによる単語状態のハイライトが、yomureader.comのカードやガイドのようなリンクに包まれた単語を含む、すべての本文単語に既定で表示されるようになりました。これまでリンク内の単語はホバー中にだけ状態色を見せ、それ以外では通常のページリンクのように見えていました。ナビゲーションバー、ボタン、タブなどのインターフェースクロームは、引き続きホバーするまで色が付きません。',
    'The homepage Try me sample no longer fakes account word-status colours for visitors without a connected dictionary account: in a fresh or incognito browser it now shows exactly what a keyless install renders, furigana and pitch underlines, and the known/due/new status boxes appear only when the viewer really has a status source connected.': 'ホームページのTry meサンプルは、辞書アカウントを接続していない訪問者に対してアカウント由来の単語状態色を装わなくなりました。新規またはシークレットブラウザーでは、キーなしインストールが実際に描画するもの（ふりがなとピッチ下線）だけを表示し、既知・復習期限・新規の状態ボックスは、閲覧者が本当に状態ソースを接続している場合にのみ表示されます。',
    'Settings saved on yomureader.com, such as the Jiten API key and the site theme, now reach the shared settings store the installed userscript reads on every other site: the storage bridge covers the whole yomureader.com site instead of only the app pages, and the site theme and language toggles write through it too.': 'yomureader.comで保存した設定（Jiten APIキーやサイトテーマなど）は、インストール済みユーザースクリプトが他のすべてのサイトで読む共有設定ストアに届くようになりました。ストレージブリッジがアプリページだけでなくyomureader.com全体をカバーし、サイトのテーマ切り替えや言語切り替えもブリッジ経由で書き込みます。',
    'Settings that earlier versions stranded in yomureader.com\'s own browser storage are recovered on the next visit with the userscript active: values chosen there fill in wherever the shared store still holds its default, while choices made on other sites keep priority, and homepage demo staging values are never copied into real settings.': '以前のバージョンがyomureader.com自身のブラウザーストレージに取り残していた設定は、ユーザースクリプトが有効な次回訪問時に回収されます。そこで選んだ値は共有ストアがまだ既定値のままの項目にだけ反映され、他のサイトで行った選択が優先されます。ホームページのデモ用ステージング値が実際の設定へコピーされることはありません。',
    'When the userscript attaches late on yomureader.com, the page now switches to the shared settings as soon as its storage bridge connects instead of showing the site-local copy until the next reload.': 'ユーザースクリプトがyomureader.comで遅れて起動した場合でも、ストレージブリッジが接続され次第ページは共有設定に切り替わり、次のリロードまでサイトローカルのコピーを表示し続けることはなくなりました。',
    'Clamped multi-line text rows that can grow in place, such as search-result snippets and description rows on many sites, now keep their furigana visible at rest: each line makes room for the reading naturally instead of hiding it until hover.': '検索結果のスニペットや多くのサイトの説明行のように、その場で高さを広げられる複数行の省略表示行では、ふりがなが常時表示されるようになりました。ホバーするまで読みを隠す代わりに、各行が自然に高さを広げて読みの場所を確保します。',
    'On browsers that cannot make room for furigana inside a clamped snippet row, the readings now stay tucked away instead of pushing the row\'s own text out of view. Rows that can grow keep their always-visible furigana.': '省略表示された行の中でふりがなの場所を確保できないブラウザーでは、行本来のテキストを押し出してしまう代わりに、読みを隠したままにするようになりました。高さを広げられる行では、常時表示のふりがなを維持します。',
    'The dictionary popover no longer jumps from one side of the word to the other while its entry loads. Placement is now planned for a full-size entry up front, and once the panel is shown it keeps its side as sections hydrate, so the content shift where a panel briefly appears above the word and then snaps below it is gone.': '辞書ポップオーバーが、内容の読み込み中に単語の反対側へ飛び移ることはなくなりました。表示位置は最初から読み込み後の大きさを見込んで決められ、一度表示されたパネルはセクションが読み込まれても同じ側を保つため、パネルが一瞬単語の上に現れてから下へ跳ねるコンテンツシフトは起きません。',
    'Words that wrap across a line break now keep their pitch or word-state underline on every line, not only the first.': '行の折り返しをまたぐ単語は、最初の行だけでなくすべての行でピッチや単語状態の下線を保つようになりました。',
    'A word that the parser recognised but the page renderer had to drop, for example when other page content interrupts its text, is now re-annotated by the built-in segmenter instead of being left as plain unmarked text between annotated neighbours.': '解析では認識できたものの、他のページ要素が語を分断しているなどの理由でページ描画時に破棄せざるを得なかった単語は、注釈付きの単語に挟まれた無印のテキストとして残らず、内蔵の分かち書きで再注釈されるようになりました。',
    'In Japanese mode the hosted docs now annotate the site chrome as reading material: the top navigation, mobile local nav, and sidebar labels such as 学ぶ, 学習, and アカデミー receive furigana and pitch underlines like the content column, while menu links keep their normal navigation clicks. English mode keeps the chrome out of scope.': '日本語モードのホスト版ドキュメントは、サイトのクロームも読み物として注釈するようになりました。上部ナビゲーション、モバイルのローカルナビ、サイドバーのラベル（学ぶ、学習、アカデミーなど）にも本文と同じようにふりがなとピッチ下線が付き、メニューリンクは通常のナビゲーションクリックを保ちます。英語モードではクロームは対象外のままです。',
    'Moved the Bunpro provider suite, including the API client, SRS adapter, word-state colouring, token importer, and the popup definition section, into a new Yomu Bunpro companion script. Together with the Immersion Kit move this restores the intended safety margin under Greasy Fork\'s 2 MB core-script limit. Behavior is unchanged: the companion is always required by the userscript, bundled into hosted builds, and loaded by the Academy reader runtime.': 'Bunproプロバイダー一式（APIクライアント、SRSアダプター、単語状態の色付け、トークンインポーター、ポップアップの定義セクション）を、新しいYomu Bunproコンパニオンスクリプトへ移動しました。イマージョンキットの移動と合わせて、Greasy Forkのコアスクリプト2MB制限に対する本来の安全マージンを取り戻します。動作は変わりません。コンパニオンはユーザースクリプトが常に必要とし、ホスト版にはバンドルされ、アカデミーのリーダーランタイムにも読み込まれます。',
    'Words whose dictionary entry is itself an inflected form, such as 問わず, no longer sit without a pitch underline. When the exact form is missing from the pitch dictionary, the reader deinflects it and projects the base verb\'s accent onto the surface — only for flat heiban bases, whose contour stays exact in every conjugation, so no word is painted with a guessed accent.': '問わずのように辞書項目自体が活用形の単語が、ピッチ下線なしのまま放置されることはなくなりました。ピッチ辞書にその形が載っていない場合、リーダーは活用を解いて基本形の動詞のアクセントを表層形に投影します。ただし、どの活用でも音形が正確に保たれる平板型の基本形に限るため、推測したアクセントで塗られる単語はありません。',
    'Pitch enrichment that resolves a word in place now records the resolved accent pattern on the rendered word together with its colour class, so the popup, mining data, and the underline can no longer disagree about a word such as 役に立つ or 学習用.': '単語をその場で解決するピッチ付与が、色クラスと一緒に解決済みのアクセント型もレンダリングされた単語に記録するようになりました。これにより、役に立つや学習用のような単語について、ポップアップ、マイニングデータ、下線の情報が食い違うことはなくなります。',
    'Bunpro lookups no longer refire a doomed cross-origin request for every hovered word on pages where the network path is blocked. A transport failure now opens a five-minute circuit breaker, and Bunpro requests may travel through the user\'s own configured CORS proxy, while the shared public proxy stays off-limits for authenticated calls.': 'ネットワーク経路が遮断されたページで、Bunproルックアップがホバーした単語ごとに失敗確実なクロスオリジンリクエストを再発行することはなくなりました。トランスポート障害は5分間のサーキットブレーカーを開き、Bunproリクエストはユーザー自身が設定したCORSプロキシを経由できます。共有パブリックプロキシは認証付き呼び出しには引き続き使用されません。',
    'Hover and modal word cards no longer time out their local dictionary, pitch, and frequency sections while a busy page scan is running: interactive card loads now take priority over the background pitch scan between its chunks, and a blocked dictionary-database upgrade fails fast and retries instead of hanging every local lookup forever.': 'ページスキャンが混み合っている間に、ホバーやモーダルの単語カードのローカル辞書、ピッチ、頻度セクションがタイムアウトすることはなくなりました。対話的なカード読み込みはバックグラウンドのピッチスキャンのチャンク間で優先され、ブロックされた辞書データベースのアップグレードは、すべてのローカル検索を永遠にハングさせる代わりに素早く失敗して再試行します。',
    'On Firefox, the reader no longer logs Not allowed to define cross-origin object errors at page load. Values that cannot be cloned into the page world are skipped instead of written raw, and the OCR frame-request event goes through the shared cross-realm event factory.': 'Firefoxで、ページ読み込み時にNot allowed to define cross-origin objectエラーがログに出ることはなくなりました。ページワールドに複製できない値は生のまま書き込まれる代わりにスキップされ、OCRのフレーム要求イベントは共有のクロスレルムイベントファクトリを通ります。',
    'Status lines in the settings dialog — the version check, live connection results, and the Bunpro token line — now receive furigana and pitch annotation like the rest of the dialog, and re-annotate whenever their text is updated.': '設定ダイアログのステータス行（バージョン確認、接続テストの結果、Bunproトークンの行）にも、ダイアログの他の部分と同じようにふりがなとピッチの注釈が付くようになり、テキストが更新されるたびに再注釈されます。',
    'Hovering an annotated word inside the settings dialog now opens the dictionary popover exactly like on ordinary pages, while buttons, links, and other interactive controls keep their native behaviour.': '設定ダイアログ内の注釈付き単語にカーソルを乗せると、通常のページとまったく同じように辞書ポップオーバーが開くようになりました。ボタン、リンク、その他の操作可能なコントロールは本来の動作を保ちます。',
    'With the theme set to Auto, the reader now resolves light or dark from the page\'s actual paint on every site instead of trusting the operating-system colour scheme, so the popup and settings chrome no longer render white on dark apps whose shell reports a light scheme.': 'テーマをautoにすると、リーダーはOSのカラースキームを信用する代わりに、すべてのサイトでページの実際の描画からライトかダークかを判定するようになりました。シェルがライトスキームを報告するダークなアプリで、ポップアップや設定のクロームが白く表示されることはなくなります。',
    'Grammatical particles are now deliberately accent-neutral everywhere. Previously は, に, and と could wear an underline borrowed from a same-sounding noun while を and の had none; since a particle\'s pitch depends on the word it attaches to, no particle carries a lexical pitch underline anymore.': '助詞はどこでも意図的にアクセント中立として扱われるようになりました。以前は、はやに、とが同音の名詞から借りた下線をまとう一方で、をやのには何も付きませんでした。助詞のピッチは前の単語に依存するため、どの助詞も語彙的なピッチ下線を持ちません。',
    'Moved the Immersion Kit example-sentence client and its popup section controller into the Yomu Kanji/Study companion script, restoring real headroom under Greasy Fork\'s 2 MB core-script limit; the previous release had crossed the limit, which blocked publishing. Behavior is unchanged: the companion is always required by the userscript and bundled into hosted builds.': 'イマージョンキットの例文クライアントとポップアップセクションのコントローラーをYomu Kanji/Studyコンパニオンスクリプトへ移動し、Greasy Forkのコアスクリプト2MB制限に対する実質的な余裕を取り戻しました。直前のリリースはこの制限を超えており、公開がブロックされていました。動作は変わりません。コンパニオンはユーザースクリプトが常に必要とし、ホスト版にはバンドルされます。',
    'The Japanese-site-language preference (locale spoofing, preference cookies, and redirects to Japanese site versions) now ships in the Yomu Video companion, freeing core userscript space under Greasy Fork\'s 2 MB limit. Installs without the companion simply leave the preference inactive.': '日本語サイト言語の設定（ロケールの偽装、設定クッキー、日本語版サイトへのリダイレクト）は、Yomu Videoコンパニオンに同梱されるようになり、Greasy Forkの2MB上限下でコアユーザースクリプトの容量を空けます。コンパニオンのないインストールでは、この設定は単に無効のままになります。',
    'Imported dictionaries now follow you to every site. Dictionary imports keep their source archive in the userscript manager\'s shared storage, and a site whose local store is missing a dictionary listed in settings rebuilds it automatically in the background, then re-annotates the page from it. Until now an import only served the site it ran on, so most pages showed fewer definition sources than settings promised; this also self-heals stores the browser evicted.': 'インポートした辞書が、どのサイトにもついてくるようになりました。辞書のインポートはその元アーカイブをユーザースクリプトマネージャーの共有ストレージに保存し、設定に載っている辞書がローカルストアにないサイトでは、バックグラウンドで自動的に再構築してからページを再注釈します。これまではインポートは実行したサイトでしか有効でなく、ほとんどのページで設定が約束するより少ない定義ソースしか表示されませんでした。ブラウザーに削除されたストアの自己修復にもなります。',
    'The core userscript moved rich mining-context fallbacks behind the Kanji/Study companion, restoring headroom under Greasy Fork\'s 2 MB script limit.': 'コアのユーザースクリプトは、リッチなマイニングコンテキストのフォールバックを漢字／学習コンパニオン側へ移すことで、Greasy Forkの2MBスクリプト上限を再び下回りました。この超過でサイトのデプロイがブロックされていました。',
    'Importing a newer revision of an installed dictionary, such as Jitendex.org [2026-06-06] over [2026-05-05], now upgrades it in place: the old revision\'s settings row retires together with its data and hands its position, alias, and enabled state to the new revision. Previously the old row stayed listed as an enabled definition source that could never render again, so settings promised more popup sources than any lookup could show.': 'インストール済み辞書の新しい版のインポート（例：「Jitendex.org [2026-05-05]」の上に「Jitendex.org [2026-06-06]」）は、その場での更新として扱われるようになりました。旧版の設定行はデータと一緒に引退し、その並び順、表示名、有効状態を新しい版に引き継ぎます。これまでは旧版の行が二度と表示できない有効な定義ソースとして残り続け、設定が実際のルックアップで表示できる以上のポップアップソースを約束していました。',
    'Installs already carrying such stale dictionary rows heal themselves the next time the dictionary list refreshes: rows whose data was replaced by a newer revision are removed, while rows are never dropped merely because the current site has no imported data.': 'すでにこうした古い辞書行を抱えているインストールは、次に辞書一覧が更新されたときに自己修復します。新しい版に置き換えられた行は削除されますが、現在のサイトにインポート済みデータがないというだけで行が消されることはありません。',
    'The word popup header now uses one consistent layout everywhere: the pitch-accent graph sits along the top next to the play button, and the dictionary and frequency pills always occupy a full-width row beneath the headword instead of wrapping inside a squeezed column. Genuinely narrow popups move multi-graph pitch evidence to its own full-width row under the title so nothing crushes the headword.': '単語ポップアップのヘッダーが、どこでも一貫した1つのレイアウトになりました。ピッチアクセントのグラフは上部の再生ボタンの隣に並び、辞書と頻度のピルは狭い列の中で折り返す代わりに、常に見出し語の下の全幅の行を占めます。本当に幅の狭いポップアップでは、複数グラフのピッチ根拠をタイトル下の専用の全幅行へ移し、見出し語が押しつぶされないようにしています。',
    'Browser-extension installs now keep Study off for new tabs until the user explicitly enables Set Study as the new tab on the packaged welcome screen. The checkbox starts unchecked, the disabled local page remains available, and Study can still be enabled later from that page or settings.': 'ブラウザー拡張機能では、同梱のウェルカム画面で「新しいタブを学習ページにする」を明示的に有効にするまで、新しいタブの学習機能をオフに保つようになりました。チェックボックスは未選択で始まり、無効状態のローカルページはそのまま利用でき、後からそのページまたは設定で学習機能を有効にできます。',
    'Chrome, Firefox, and Safari packages now request only the permissions their shipped features use: the browsing-history tabs permission and redundant file host pattern are gone, Firefox has a stable add-on ID, the broken video-player popup shortcut is removed, and Google Drive OAuth code is omitted unless an approved Chrome client is configured.': 'Chrome、Firefox、Safari パッケージは、同梱機能が実際に使用する権限だけを要求するようになりました。閲覧履歴に関わる tabs 権限と重複した file ホストパターンを削除し、Firefox には固定のアドオン ID を設定し、壊れていた動画プレイヤーのポップアップショートカットを除去し、承認済み Chrome クライアントが設定されていない限り Google Drive OAuth コードを含めません。',
    'Public links now use the canonical /study/ route, and the documentation includes a store-ready privacy policy plus reviewer notes explaining site access, local storage, optional network services, and the new-tab opt-in.': '公開リンクは正規の /study/ ルートを使用するようになり、ドキュメントには、サイトアクセス、ローカル保存、任意のネットワークサービス、新しいタブのオプトインを説明するストア提出用プライバシーポリシーと審査担当者向けメモを追加しました。',
    'The self-contained extension build flag now reaches both the reader and Study bundles, preventing the packaged Study page from accidentally using the hosted Google sign-in implementation or loading remote executable code.': '自己完結型拡張機能のビルドフラグがリーダーと学習ページの両バンドルへ届くようになり、同梱の学習ページが誤ってホスト版 Google サインイン実装を使ったり、リモート実行コードを読み込んだりすることを防ぎます。',
    'The Bunpro section no longer renders a word-audio button on a line of its own. Bunpro word pronunciation now plays through the shared audio pipeline like Jiten and JPDB: enable the Bunpro source under Settings → Audio to include its recordings in the popup\'s main play button. Example-sentence audio buttons are unchanged.': 'Bunproセクションが単語音声ボタンを単独の行に表示することはなくなりました。Bunproの単語発音は、JitenやJPDBと同じ共有音声パイプラインで再生されます。設定→音声でBunproソースを有効にすると、その録音がポップアップのメイン再生ボタンに含まれます。例文の音声ボタンは変わりません。',
    'Updated default "New and in deck" card/word color to white (#ffffff) to match Canna\'s suggestion.': 'Cannaの提案に合わせて、既定の「新規・デッキ内」のカード／単語の色を白（#ffffff）に更新しました。',
    'The hosted Yomu Video player now accepts a video file and subtitle files in the same picker/drop action. Japanese/native subtitle files are inferred from their names, loaded automatically, and the transcript opens directly to the lines view.': 'ホスト版Yomu Videoプレイヤーは、同じファイル選択またはドロップ操作で動画ファイルと字幕ファイルを一緒に受け取れるようになりました。日本語字幕と母語字幕はファイル名から推定され、自動で読み込まれ、トランスクリプトは直接「行」ビューで開きます。',
    'Added a separate Video setting for pausing on subtitle hover lookup. Clicked/tapped subtitle lookups still pause by default, while hover pause can now be turned off independently.': '字幕ホバールックアップ時に一時停止するための個別の動画設定を追加しました。クリックまたはタップした字幕ルックアップはこれまで通り既定で一時停止し、ホバーによる一時停止だけを独立してオフにできます。',
    'Expanded the hosted homepage and localized metadata copy to describe SRS practice, Japanese site versions, and YouTube Japanese-content filtering as part of Yomu\'s immersion environment.': 'ホスト版ホームページとローカライズ済みメタデータの文言を広げ、SRSでの練習、日本語版サイト、YouTubeの日本語コンテンツ絞り込みを、Yomuの没入環境の一部として説明するようにしました。',
    'Fixed': '修正',
    'The homepage Try me demo no longer draws every underline twice: the pre-baked sample keeps its single demo underline and the reader runtime\'s second underline is suppressed inside it.': 'ホームページの「試してみる」デモで、すべての下線が二重に描かれることがなくなりました。作り置きのサンプルは単一のデモ下線を保ち、その内側ではリーダーランタイムの二本目の下線を抑制します。',
    'Words the runtime annotates inside demo blocks no longer receive word-state highlight colours as if an API source were connected. Demo status colours are confined to the pre-baked sample sentence, and live annotated words follow your real decoration settings.': 'デモブロック内でランタイムが注釈した単語に、APIソースが接続されているかのような単語状態のハイライト色が付くことはなくなりました。デモの状態色は作り置きのサンプル文だけに限定され、実際に注釈された単語はあなたの本当の装飾設定に従います。',
    'Dictionary source titles in the word popup, such as the Immersion Kit section and Japanese dictionary names, are now annotated with furigana, pitch, and lookup like the rest of the Japanese interface. Clicking the annotated title looks the word up, while the rest of the header still opens and closes the section.': '単語ポップアップの辞書ソースの見出し（イマージョンキットのセクションや日本語の辞書名など）にも、日本語インターフェースの他の部分と同じように、ふりがな・ピッチ・ルックアップの注釈が付くようになりました。注釈された見出しをクリックするとその単語を調べられ、見出しの残りの部分では引き続きセクションを開閉できます。',
    'Katakana compound words are no longer shattered into phonetic fragments by the keyless fallback segmenter, which could even start a fragment on a small kana. A contiguous katakana run such as イマージョンキット now stays one word.': 'キーなしのフォールバック分かち書きが、カタカナの複合語を音の断片に砕くことはなくなりました。以前は断片が小書き仮名から始まることさえありました。イマージョンキットのような連続したカタカナの並びは、ひとつの単語のまま保たれます。',
    'Enabling both Jiten and JPDB definitions now shows both dictionary sources even without a JPDB API key. JPDB vocabulary details use the existing cached, backoff-protected public lookup, and cards owned by Jiten or a local dictionary no longer send their provider-specific ids as false JPDB vocabulary ids.': 'JitenとJPDBの定義を両方有効にすると、JPDB APIキーがなくても両方の辞書ソースが表示されるようになりました。JPDBの語彙詳細には既存のキャッシュ付き・バックオフ保護された公開検索を使い、Jitenまたはローカル辞書が所有するカードのプロバイダー固有IDを誤ったJPDB語彙IDとして送信しなくなりました。',
    'JPDB frequency pills no longer disappear when the public search returns duplicate records for the same exact spelling and reading, such as 今日（きょう）. The first ranked exact-identity result is used while differently read homographs remain excluded, so Jiten and JPDB ranks can appear side by side without borrowing evidence from another word.': '公開検索が「今日（きょう）」のように同じ表記と読みの重複レコードを返しても、JPDBの頻度ピルが消えなくなりました。順位付きの完全一致結果を先頭から採用しつつ、読みの異なる同形語は引き続き除外するため、別の語から根拠を借りずにJitenとJPDBの順位を並べて表示できます。',
    'Inflected verbs that a remote parse skipped, such as 使って and 行います, no longer render without furigana or pitch while their neighbours annotate. When local dictionaries are enabled, remote coverage gaps are filled with deinflected dictionary tokens that carry reading, furigana, and pitch, and only ranges the dictionary also misses fall back to plain segmenter fragments.': 'リモート解析が取りこぼした「使って」「行います」のような活用形の動詞が、周囲だけ注釈される中でふりがなもピッチもないまま表示されることがなくなりました。ローカル辞書が有効な場合、リモート解析の抜けは読み・ふりがな・ピッチを持つ活用復元済みの辞書トークンで埋め、辞書でも見つからない範囲だけが素の分かち書きにフォールバックします。',
    'Dictionary popup sections with nothing to show are hidden entirely: example-sentence groups no longer render a count-zero header or a no-examples placeholder, grammar and translation sections remove themselves when the sentence has no hints or no translation, and the Immersion Kit section disappears instead of announcing that no examples exist.': '表示する内容がない辞書ポップアップのセクションは丸ごと非表示になりました。例文グループが件数0の見出しや「例文はありません」のプレースホルダーを表示することはなくなり、文法と翻訳のセクションは文にヒントや翻訳がなければ自分自身を取り除き、イマージョンキットのセクションも「例文なし」と告げる代わりに消えます。',
    'The Japanese settings dialog now annotates a whole panel in one pass, so furigana no longer trickles in only after clicking around, and rewriting a label can no longer duplicate its text next to a still-annotated copy.': '日本語の設定ダイアログはパネル全体を一度のパスで注釈するようになり、クリックして回った後にだけふりがなが少しずつ増えていくことがなくなりました。また、ラベルの書き換えで、注釈が残ったコピーの隣にテキストが二重に表示されることもなくなりました。',
    'Clicking an annotated word inside the settings dialog now runs a full dictionary lookup instead of showing an empty popup that contained only search links.': '設定ダイアログ内の注釈された単語をクリックすると、検索リンクだけの空のポップアップではなく、完全な辞書ルックアップが実行されるようになりました。',
    'Select-like dropdown triggers, such as language pickers built as role=combobox listbox buttons, are now annotated through the passive control channel, while genuinely editable comboboxes stay untouched. A native select whose only Japanese option is not the selected one now still surfaces that option in its annotated mirror.': 'role=comboboxのリストボックスボタンとして作られた言語ピッカーのようなセレクト型ドロップダウンのトリガーは、パッシブコントロールチャンネル経由で注釈されるようになりました。実際に文字を入力できるコンボボックスはこれまで通り注釈されません。また、唯一の日本語の選択肢が選択中でないネイティブのselectも、その選択肢を注釈付きミラーとして表示するようになりました。',
    'The Academy courtyard notebook now grows with its task instead of trapping the word-order exercise behind an internal scroll panel, on desktop and phones alike, so the chips and the start control are always on the paper.': 'アカデミーの中庭ノートは、課題に合わせて紙面が伸びるようになり、語順練習が内部スクロールパネルに閉じ込められなくなりました。デスクトップでもスマートフォンでも、ことばの札と開始ボタンが常に紙の上に見えます。',
    'Word-order chips on the courtyard notebook are readable paper slips with ink borders instead of grey app chrome, the answer line reads as a ruled handwriting line, and the reset control is a quiet inline link.': '中庭ノートの語順の札は、灰色のアプリ部品ではなく、インクの縁取りが付いた読みやすい紙の札になりました。解答欄は罫線の手書き行として読め、やり直し操作は控えめなインラインリンクになっています。',
    'Rie-sensei stands beside the courtyard notice board instead of behind it, so her clickable name tag is no longer buried under the pinned journal card at narrower windows.': 'りえ先生は中庭の掲示板の後ろではなく横に立つようになり、幅の狭いウィンドウでも、クリックできる名札がピン留めされた日誌カードの下に埋もれなくなりました。',
    'Switching the yomureader.com interface language to Japanese now annotates the site\'s own text. The whole content column becomes a declared reading surface, so furigana, pitch colours, and word lookups work on the hero, install steps, and link cards exactly like on any other Japanese website, with an installed userscript or with the built-in page runtime. Navigation chrome stays unannotated, and English mode keeps the demo-only scope introduced in 1.6.220.': 'yomureader.comの表示言語を日本語に切り替えると、サイト自身のテキストに注釈が付くようになりました。コンテンツ欄全体が読書サーフェスとして宣言されるため、ヒーロー、インストール手順、リンクカードでも、他の日本語サイトと同じように、ふりがな・ピッチの色・単語ルックアップが、インストール済みユーザースクリプトでも内蔵のページランタイムでも機能します。ナビゲーションには注釈が付かず、英語表示では1.6.220で導入したデモ限定のスコープを維持します。',
    'Hosted docs localization no longer rewrites unchanged text nodes on every pass, which previously queued needless mutation records for the annotating reader to re-inspect in Japanese mode.': 'ホスト版ドキュメントのローカライズが、変更のないテキストノードを毎回書き直さなくなりました。以前は日本語表示で、注釈を付けるリーダーが再検査する必要のないミューテーションレコードを積み上げていました。',
    'The Japanese-docs performance smoke now proves the content column annotates at volume while long tasks stay under 200ms and the first Try-me hover stays under one second, and unit coverage pins that a declared content column scans while navigation chrome does not.': '日本語ドキュメントのパフォーマンススモークが、ロングタスクを200ms未満、最初のTry-meホバーを1秒未満に保ちながらコンテンツ欄が大量に注釈されることを証明するようになり、ユニットテストは宣言されたコンテンツ欄がスキャンされ、ナビゲーションはスキャンされないことを固定します。',
    'Payment and wallet buttons, such as Apple Pay on Stripe-powered checkouts, no longer disappear or fail on Firefox while Yomu is enabled. The open shadow root discovery bridge previously replaced the page\'s attachShadow with a sandboxed function that page scripts were not permitted to call, so any web component attaching its UI crashed; the bridge now only patches the page realm with a function the page can actually call and otherwise falls back to bounded polling.': 'Stripeを利用したチェックアウトのApple Payなど、支払い・ウォレットボタンが、Yomu有効時のFirefoxで消えたり動かなくなったりしなくなりました。オープンShadow Root検出ブリッジが、ページのattachShadowをページスクリプトから呼び出せないサンドボックス関数に置き換えていたため、UIをシャドウDOMに取り付けるあらゆるWebコンポーネントがクラッシュしていました。ブリッジは、ページが実際に呼び出せる関数だけでページ側を書き換え、それができない場合は回数制限付きのポーリングにフォールバックするようになりました。',
    'Remote parser fragments are now replaced only when an enabled local dictionary supplies an exact longer expression and reading across their boundary. This repairs evidence-backed splits such as': 'リモート解析で分割された語は、有効なローカル辞書が境界をまたぐ、より長い完全一致の見出し語と読みを返した場合だけ置き換えるようになりました。これにより、たとえば',
    'without a': 'を',
    'exception, adjacent-kanji guessing, full rescans, or synthesized compound pitch.': 'という語句固有の例外、隣接する漢字の推測、全文の再スキャン、合成した複合語ピッチを使わずに修正します。',
    'Boundary evidence is capped at eight left-to-right candidates per paragraph and four IndexedDB lookups across all concurrent parser instances. Ambiguous expression/reading identities stay split, and transient lookup failures are retried on the next scan instead of being cached as permanent misses.': '境界の証拠は、段落ごとに左から最大8候補、同時に動くすべての解析インスタンスを通じてIndexedDB検索を最大4件に制限します。見出し語と読みの組み合わせが曖昧な場合は分割を維持し、一時的な検索失敗は恒久的な未検出としてキャッシュせず、次回のスキャンで再試行します。',
    'Local pitch metadata now requires the same normalized expression and reading as the displayed word. Yomu no longer falls back to a reading-key row or reshapes a lone mismatched reading into a misleading whole-word contour.': 'ローカルのピッチメタデータは、表示中の単語と正規化後の見出し語と読みがともに一致する場合だけ使うようになりました。読みをキーにした別行へフォールバックしたり、単独の不一致な読みを誤解を招く単語全体の音調輪郭へ変形したりしません。',
    'Pitch accent now uses the four positional Tokyo classes—heiban, atamadaka, nakadaka, and odaka—consistently across reader words, popups, subtitles, and study. Malformed contours are treated as unknown, multiple sourced variants remain distinct, and the obsolete “Kifuku (variable)” fifth colour setting is removed while old settings payloads still load safely.': 'ピッチアクセントは、リーダーの単語、ポップアップ、字幕、学習画面のすべてで、東京式の4つの位置分類（平板、頭高、中高、尾高）を一貫して使うようになりました。不正な音調輪郭は不明として扱い、出典のある複数の異形は別々に保持します。廃止された5番目の色設定「起伏（可変）」は削除しましたが、古い設定データは引き続き安全に読み込めます。',
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
    'Popup lookup: the word, its reading and pitch, live Jiten and JPDB ranks, and one row to grade it.': 'ポップアップ検索：単語と読み、ピッチ、JitenとJPDBのライブ頻度順位、そして採点ボタンが1列に。',
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
    'The recommended Japanese set in Settings → Sources: eight dictionaries, one Install each.': '設定 → ソースのおすすめ日本語セット：8つの辞書を、それぞれワンクリックでインストール。',
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
    'The docs language toggle now switches the whole Getting Started page: the rewritten install, update, browser-extension, welcome-panel, and mobile sections all have Japanese copy again, so neither language shows leftover text from the other after toggling.': 'ドキュメントの言語切り替えボタンで「使い始める」ページ全体が切り替わるようになりました。書き直されたインストール、アップデート、ブラウザー拡張機能、ようこそパネル、モバイルの各セクションに日本語コピーが再び揃ったため、切り替え後にどちらの言語でももう一方の言語の文章が残らなくなりました。',
    'Tapping the docs language toggle once is enough again. A reader install that finished booting just after the tap could save its older language preference over the new choice, forcing a second tap; the page now keeps the tapped choice and the reader adopts it instead.': 'ドキュメントの言語切り替えは、再び1回のタップで済むようになりました。タップ直後に起動を終えたリーダーが、古い言語設定を新しい選択の上に保存してしまい、2回目のタップが必要になることがありました。ページはタップされた選択を保持し、リーダー側がそれを取り込むようになりました。',
    // Getting Started (2026-07 rewrite): userscript-first install flow, update
    // guidance, browser-extension section, welcome panel, and mobile guidance.
    'Install よむ in three steps — add a free userscript manager (Tampermonkey on desktop, Userscripts on iPhone/iPad), install よむ, then open a Japanese page and look up a word. No account needed. Optional Jiten, Bunpro, JPDB, Anki, OCR, and audio setup included.': '3つのステップでよむをインストール — 無料のユーザースクリプト管理ツール（PCはTampermonkey、iPhone/iPadはUserscripts）を追加し、よむをインストールして、日本語ページを開いて単語を検索します。アカウントは不要です。Jiten、Bunpro、JPDB、Anki、OCR、音声の設定は任意で追加できます。',
    'is a small add-on that runs inside your browser. Install a free manager once, add よむ to it, and よむ appears on Japanese pages: look up a word in the popup dictionary, save words for review, read manga with OCR, and check subtitles on video. It\'s free and needs no account to start.': 'はブラウザー内で動く小さなアドオンです。無料の管理ツールを一度インストールしてよむを追加すると、日本語ページによむが表示されます。ポップアップ辞書で単語を調べ、復習用に単語を保存し、OCRで漫画を読み、動画の字幕を確認できます。無料で、始めるのにアカウントは不要です。',
    '— opening よむ\'s popup on a word.': ' — 単語の上でよむのポップアップを開く操作です。',
    'Jiten, Bunpro, JPDB, Anki, OCR, and audio are optional. Turn them on when you want them;': 'Jiten、Bunpro、JPDB、Anki、OCR、音声機能はオプションです。使いたいときに有効化してください。',
    'Update an existing install': '既存インストールのアップデート',
    'Permalink to "Update an existing install"': '「既存インストールのアップデート」への固定リンク',
    'On Chrome or Edge with Tampermonkey, update from inside Tampermonkey instead of opening the': 'ChromeまたはEdgeのTampermonkeyでは、Webサイトインストールとして',
    'link as a website install:': 'リンクを開くのではなく、Tampermonkeyの内部からアップデートしてください：',
    'Tampermonkey Dashboard': 'Tampermonkeyダッシュボード',
    'Utilities': 'Utilities（ユーティリティ）',
    'Select': 'そこで',
    'Check for userscript updates': 'Check for userscript updates（ユーザースクリプトの更新を確認）',
    ', then accept the Yomu update.': 'を選択し、よむの更新を承認します。',
    'If Chrome says “Apps, extensions, and user scripts cannot be added from this website,” changing the link to GitHub Raw will not fix it—the browser permission is disabled. Open Tampermonkey’s extension details and enable': 'Chromeに「このWebサイトからアプリ、拡張機能、ユーザースクリプトを追加することはできません」と表示される場合、リンクをGitHub Rawに変えても解決しません。ブラウザー側の権限が無効になっているためです。Tampermonkeyの拡張機能の詳細を開き、',
    '(Chrome 138+) or enable': '（Chrome 138以降）または',
    ', following': 'を有効にしてください。手順は',
    'Tampermonkey’s current permission guide': 'Tampermonkeyの最新の権限ガイドを参照してください',
    'That popup comes from Chrome or Edge, not よむ — changing to GitHub Raw will not bypass it. Open your browser\'s extensions page (': 'このポップアップはよむではなく、ChromeまたはEdge本体のものです。GitHub Rawに変えても回避できません。ブラウザーの拡張機能ページ（',
    'Open the install link in Safari. You will see the よむ userscript source code — lines like the ones below. Leave that tab open; Userscripts reads it to install よむ.': 'インストールリンクをSafariで開きます。よむユーザースクリプトのソースコード（以下のような行）が表示されます。そのタブは開いたままにしてください。Userscriptsがそれを読み取ってよむをインストールします。',
    'Open Safari\'s page menu from the address bar:': 'アドレスバーからSafariのページメニューを開きます：',
    'choose': 'アドレスバーの左側にある',
    'on the left of the address bar, then choose': 'を選択し、次に',
    'choose the': 'アドレスバーにある',
    '(a puzzle piece) in the address bar, then choose': '（パズルのピース型）を選択し、次に',
    '"Userscript Detected."': '「Userscript Detected（ユーザースクリプトが検出されました）」',
    'Choose it, review the script, and choose': 'と表示されます。それを選択してスクリプトを確認し、',
    'Prefer a browser extension? (Chrome and Firefox)': 'ブラウザー拡張機能のほうがいい？（ChromeとFirefox）',
    'Permalink to "Prefer a browser extension? (Chrome and Firefox)"': '「ブラウザー拡張機能のほうがいい？（ChromeとFirefox）」への固定リンク',
    'On a computer, you can skip the userscript manager and install よむ as a normal browser extension instead. It\'s the same よむ, packaged for Chrome and Firefox, with a toolbar menu and a study page. It never replaces your browser\'s new-tab page; open Study when you want it from the よむ toolbar icon. Store links will appear here as they are approved, and the versioned packages on GitHub Releases remain available for direct installation and testing.': 'PCでは、ユーザースクリプト管理ツールを使わずに、よむを通常のブラウザー拡張機能としてインストールすることもできます。ChromeとFirefox向けにパッケージした同じよむで、ツールバーメニューと学習ページが付属します。ブラウザーの新しいタブページを置き換えることはありません。使いたいときに、よむのツールバーアイコンから学習ページを開いてください。ストアのリンクは承認され次第ここに掲載されます。GitHub Releasesのバージョン付きパッケージは、直接のインストールやテスト用に引き続き利用できます。',
    'Grab the latest packages from the': '最新のパッケージは',
    'GitHub releases page': 'GitHubリリースページから入手できます',
    'The よむ browser-extension menu with buttons to open Study, open the video player, open settings on the current page, and open the documentation.': '学習ページ、動画プレーヤー、現在のページの設定、ドキュメントを開くボタンが並ぶ、よむブラウザー拡張機能のメニュー。',
    'Clicking the よむ toolbar icon opens this quick menu.': 'よむのツールバーアイコンをクリックすると、このクイックメニューが開きます。',
    'Permalink to "Chrome or Edge"': '「ChromeまたはEdge」への固定リンク',
    'Download': 'まず',
    'from the latest release and unzip it.': 'を最新リリースからダウンロードして解凍します。',
    '(or': '（または',
    ') and turn on': '）を開き、',
    'in the top corner.': 'を画面の隅で有効にします。',
    'Click': '次に',
    'Load unpacked': 'Load unpacked（パッケージ化されていない拡張機能を読み込む）',
    'and choose the folder you unzipped (the one with': 'をクリックし、解凍したフォルダー（',
    'inside).': 'が入っているもの）を選択します。',
    'Open a Japanese page — the floating よむ button appears, and clicking the よむ toolbar icon opens a quick menu.': '日本語のページを開くと、フローティングのよむボタンが表示され、よむのツールバーアイコンをクリックするとクイックメニューが開きます。',
    'Permalink to "Firefox"': '「Firefox」への固定リンク',
    'from the latest release.': 'を最新リリースからダウンロードします。',
    'Load Temporary Add-on': 'Load Temporary Add-on（一時的なアドオンを読み込む）',
    'and pick the': 'をクリックし、',
    'file.': 'ファイルを選択します。',
    'Open a Japanese page to start reading.': '日本語のページを開いて読み始めます。',
    'Which should I pick?': 'どちらを選べばいい？',
    'The userscript is the easiest path and updates itself from one link, so it\'s the default recommendation. Choose the extension if you\'d rather not run a userscript manager, or if you want quick access to Study from the browser toolbar. On iPhone and iPad, the userscript is the only option — there\'s no iOS extension.': 'ユーザースクリプトは最も簡単な方法で、1つのリンクから自動的に更新されるため、既定のおすすめです。ユーザースクリプト管理ツールを使いたくない場合や、ブラウザーのツールバーから学習ページへすぐアクセスしたい場合は拡張機能を選んでください。iPhoneとiPadではユーザースクリプトが唯一の選択肢です — iOS用の拡張機能はありません。',
    'The first time よむ runs, it shows a': 'よむの初回起動時には',
    'welcome panel': 'ようこそパネル',
    '. Choose': 'が表示されます。',
    'Your language (dictionary definitions)': '辞書の定義言語',
    'from the 32-language list;': 'を32言語の一覧から選んでください。',
    'Language you are learning': '学習中の言語',
    'is fixed to Japanese for Slice 1. This choice is independent from the English/Japanese interface control. The rest of quick setup covers theme and accent colour, Japanese text on webpages, image OCR, video subtitles, and the hover/scan shortcuts — all pre-set to sensible defaults you can scroll straight past. For webpage text, the three choices say exactly what they do:': 'はSlice 1では日本語に固定されています。この選択は英語／日本語のインターフェース設定とは独立しています。クイック設定の残りでは、テーマとアクセントカラー、Webページ上の日本語テキスト、画像OCR、動画字幕、ホバー／スキャンのショートカットを設定できます。いずれも妥当な既定値が設定されているため、そのままスクロールして進めます。Webページのテキストについては、3つの選択肢が動作を明確に示しています：',
    '. The top half is quick setup — language, theme and accent colour, Japanese text on webpages, image OCR, video subtitles, and the hover/scan shortcuts — all pre-set to sensible defaults you can scroll straight past. For webpage text, the three choices say exactly what they do:': 'が表示されます。上半分はクイック設定です — 言語、テーマとアクセントカラー、Webページ上の日本語テキスト、画像OCR、動画字幕、ホバー／スキャンのショートカット — いずれも妥当な既定値があらかじめ設定されているので、そのままスクロールして飛ばせます。Webページのテキストについては、3つの選択肢がそのまま動作を表しています：',
    'Leave pages unchanged': 'ページを変更しない',
    'Scan Japanese automatically': '日本語を自動でスキャン',
    'Scan only when I ask': '指示したときだけスキャン',
    '. Automatic scanning finds Japanese as a page loads; manual scanning waits for your shortcut or menu action. Image OCR is a separate setting. Under the setup sit the two choices:': '。自動スキャンはページの読み込みと同時に日本語を検出します。手動スキャンはショートカットまたはメニュー操作を待ちます。画像OCRは別の設定です。設定の下には2つの選択肢があります：',
    '— the highlighted first button: start reading right now, no account needed.': ' — 強調表示された最初のボタンです。アカウント不要で、今すぐ読み始められます。',
    'Add API source': 'APIソースを追加',
    '— connect Jiten, Bunpro, or JPDB for word tracking and mining. Optional, and you can do it later (': ' — 単語の進捗管理とマイニングのためにJiten、Bunpro、またはJPDBを接続します。任意で、あとからでも設定できます（',
    'A feature grid below the buttons previews what よむ can do; you don\'t need to configure any of it now.': 'ボタンの下の機能グリッドは、よむにできることのプレビューです。今すぐ設定する必要はありません。',
    'The welcome screen also offers': 'ようこそ画面には',
    'Offline setup': 'オフラインセットアップ',
    '(checked by default). よむ installs the native-first starter dictionaries recommended for your language, using an explicit English fallback where the frozen catalogue has no native Japanese dictionary. The archives are downloaded from Yomu\'s public, SHA-256-addressed mirror and then parsing and lookup run locally in your browser. You can change recommendations or import your own dictionaries later in Settings → Dictionaries.': '（既定でオン）があります。よむは選択した言語向けに推奨される母語優先のスターター辞書をインストールし、凍結済みカタログにその言語の日本語辞書がない場合は英語へのフォールバックを明示します。アーカイブはYomuの公開SHA-256アドレス指定ミラーからダウンロードされ、その後の解析と検索はブラウザー内でローカルに動作します。推奨辞書の変更や独自辞書のインポートは、あとから設定 → 辞書で行えます。',
    '(checked by default): よむ downloads the Jitendex dictionary and Kanjium pitch accents in the background, so parsing, lookup, furigana, and pitch colors all run locally in your browser — fast, private, and available offline. Leave it on unless you prefer to import your own dictionaries later in Settings → Sources.': '（既定でオン）もあります。よむがバックグラウンドでJitendex辞書とKanjiumピッチアクセントをダウンロードするため、解析、検索、ふりがな、ピッチの色分けがすべてブラウザー内でローカルに動作します — 高速でプライベート、オフラインでも利用できます。あとで設定→ソースから自分の辞書をインポートしたい場合を除き、オンのままにしてください。',
    'Select or click': '単語を選択またはクリック',
    'a word. On phones and tablets, touch the word; on desktop, hover also works.': 'します。スマートフォンやタブレットでは単語をタッチします。デスクトップではホバーでも動作します。',
    'The popup opens with the reading, meaning, and a speaker button. Choose a kanji to see stroke order; use a mining button to save the word.': '読み、意味、スピーカーボタンの付いたポップアップが開きます。漢字を選ぶと書き順が表示され、マイニングボタンで単語を保存できます。',
    'Try me — look up a word': 'お試し — 単語を調べてみよう',
    'In よむ, open settings with the floating よむ button. The': 'よむでは、フローティングのよむボタンから設定を開きます。',
    'shortcut is configurable in Settings → Shortcuts.': 'のショートカットは設定→ショートカットで変更できます。',
    'For Bunpro, open Bunpro\'s API settings while signed in and use the': 'Bunproの場合は、サインインした状態でBunproのAPI設定を開き、',
    'Import into Yomu': 'Import into Yomu（よむに取り込む）',
    'button. Yomu needs only the imported': 'ボタンを使います。よむに必要なのは取り込まれた',
    'frontend token': 'フロントエンドトークン',
    'for definitions, queue, mining, and Study grading; it does not use the older Bunpro API key. The token grants review read/write access, so treat it like a password. Yomu uses Bunpro\'s private frontend endpoint, which is not a documented public API and may change.': 'だけで、定義、キュー、マイニング、Studyの採点に使われます。旧来のBunpro APIキーは使いません。トークンにはレビューの読み書き権限があるため、パスワードと同じように扱ってください。よむはBunproの非公開フロントエンドエンドポイントを使用しており、これは文書化された公開APIではなく、変更される可能性があります。',
    'The same authenticated Bunpro detail can add separately labelled General, Anime, Novels, Netflix, and Dictionary frequency ranks plus supplemental pitch evidence. These are different corpus ranks, not one universal score.': '同じ認証済みBunpro連携から、General、Anime、Novels、Netflix、Dictionaryとして個別にラベル付けされた頻度ランクと、補助的なピッチ情報を追加できます。これらは異なるコーパスのランクであり、1つの普遍的なスコアではありません。',
    'Bunpro pronunciation': 'Bunpro発音',
    'appears in Settings → Audio but is disabled by default. Its recordings are fetched at runtime from Bunpro\'s public CDN; hosted/browser playback may use よむ\'s narrow public proxy.': 'は設定→音声にありますが、既定では無効です。録音は実行時にBunproの公開CDNから取得されます。ホスト版／ブラウザーでの再生には、よむの限定的な公開プロキシが使われることがあります。',
    'Bunpro grading is deliberately tied to a live Study queue session: regular reveal cards use': 'Bunproの採点は、意図的にライブのStudyキューセッションに結び付けられています。通常のめくりカードは',
    ', and FSRS cards use': 'を、FSRSカードは',
    '. There is no Bunpro five-point scale, and Bunpro grades are not stored for later while offline because session and ghost-review ids can change.': 'を使います。Bunproに5段階評価はなく、セッションIDやゴーストレビューIDが変わる可能性があるため、オフライン中のBunpro採点があとから送信するために保存されることもありません。',
    'Open よむ settings with the floating よむ button to switch these on when you want them. The': 'フローティングのよむボタンからよむの設定を開き、使いたいときにこれらを有効化してください。',
    'shortcut is configurable in Settings → Shortcuts. Each is covered in': 'のショートカットは設定→ショートカットで変更できます。各機能の詳細は',
    '— look up Japanese text inside manga panels and screenshots. Settings → Images. Reading manga on BookWalker or in mokuro volumes? Follow the': ' — 漫画のコマやスクリーンショット内の日本語を検索します。設定→画像。BookWalkerやmokuroで漫画を読むなら、',
    'manga guide': '漫画ガイドを参照してください',
    'PC games': 'PCゲーム',
    '— download the first-party': ' — 公式の',
    'Yomu Gaming release file': 'Yomu Gamingリリースファイル',
    ', finish the first-run setup, and set your capture shortcut. Yomu Gaming uses Yomu\'s default Google Lens-style OCR first; advanced local OCR is optional for offline capture.': 'をダウンロードし、初回セットアップを完了して、キャプチャ用ショートカットを設定します。Yomu Gamingはまずよむ既定のGoogle Lens方式OCRを使います。オフラインキャプチャ向けの高度なローカルOCRは任意です。',
    '— parse Japanese subtitle lines for lookup, with a transcript panel. For local files, use the': ' — 日本語の字幕行を解析して検索でき、トランスクリプトパネルも付きます。ローカルファイルには',
    'PDFs': 'PDF',
    'PDF reader': 'PDFリーダー',
    'when the Japanese is in a textbook, scan, or article file.': 'を開いてください。教科書、スキャン、記事ファイルの日本語に使えます。',
    '— turn lookups into flashcards with one tap: cards carry the word, reading, meaning, the sentence you found it in, and pitch and audio when available (see': ' — 検索した単語をワンタップでフラッシュカードにします。カードには単語、読み、意味、見つけた文が入り、利用可能ならピッチと音声も付きます（',
    'mining guide': 'マイニングガイド',
    '). Desktop': 'を参照）。デスクトップの',
    '— Yomu hosted audio is on by default. Add': ' — よむのホスト版音声は既定でオンです。別のソースが必要な場合のみ',
    'or a local server only if you want another source.': 'またはローカルサーバーを追加してください。',
    '— open': ' — 毎日の復習には',
    'for daily review, or use': 'を開くか、',
    'from the browser-extension toolbar menu. A freshly opened standalone session starts at': 'をブラウザー拡張機能のツールバーメニューから使います。新しく開いた単独セッションは',
    ', a recognition-first prompt that asks you to identify the word before moving through the rest of the card.': 'から始まります。これは認識優先のプロンプトで、カードの残りに進む前にその単語が分かるかを確認します。',
    'For more, use': 'さらに探すには、',
    'to find books near your level, or browse the': 'で自分のレベルに近い本を見つけるか、',
    'guides': 'ガイド',
    'for manga, video, game text, and study workflows.': 'で漫画、動画、ゲームテキスト、学習ワークフローを確認してください。',
    'On mobile, よむ can still do lookup, local dictionaries, Jiten/JPDB, OCR, subtitles, the': 'モバイルでも、よむは検索、ローカル辞書、Jiten/JPDB、OCR、字幕に加えて、',
    '. The floating よむ button stays reachable so you can always open settings.': 'も利用できます。フローティングのよむボタンには常に届くので、いつでも設定を開けます。',
    'The only tricky part is any helper app running on your computer: AnkiConnect, a self-hosted audio server, or a local OCR app. A phone cannot reach your computer through': '唯一の注意点は、PC上で動く補助アプリ（AnkiConnect、自己ホストの音声サーバー、ローカルOCRアプリ）です。スマートフォンは',
    '; use the computer\'s LAN or Tailscale address in よむ settings instead. The easy mobile paths — public lookup, imported dictionaries, hosted audio, the study page — don\'t need any of that.': '経由ではPCに到達できません。代わりに、よむの設定でPCのLANアドレスまたはTailscaleアドレスを使ってください。簡単なモバイル経路 — 公開検索、インポート辞書、ホスト版音声、学習ページ — にはどれも不要です。',
    'If the hosted Study page or a Home Screen shortcut still looks like an old version after an update, open': 'アップデート後もホスト版の学習ページやホーム画面のショートカットが古いバージョンのままに見える場合は、',
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
    '— install the starter set for your selected language or import any Yomitan ZIP dictionary. For a non-native definition source, automatic translation is available per source and is off by default. Google does not provide an Ancient Greek translation target, so that profile keeps original definitions instead. Settings → Dictionaries.': ' — 選択した言語のスターターセットをインストールするか、任意のYomitan ZIP辞書をインポートします。定義言語が一致しないソースでは、ソースごとに自動翻訳を利用でき、既定ではオフです。Google翻訳は古代ギリシア語を翻訳先として提供していないため、そのプロファイルでは元の定義をそのまま表示します。設定 → 辞書。',
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
    // Site chrome: the social row's screen-reader label (config.mts).
    'Donate to Yomu with Stripe': 'Stripeでよむに寄付する',
    // Docs rewrite 2026-07-27: docs/support.md.
    'Permalink to "Support"': '「サポート」への固定リンク',
    'Something not working, or want to ask a question? Start here.': 'うまく動かない、または聞きたいことがある。まずはここから。',
    'Permalink to "Get help"': '「助けを求める」への固定リンク',
    'Discord is the fastest way to get an answer. File bugs on GitHub so they do not get lost. If you are stuck installing, the': '答えが一番早く返ってくるのはDiscordです。不具合はGitHubに登録しておくと埋もれません。インストールで止まっているときは、',
    'has the fixes for the common cases.': 'によくある事例の対処がまとまっています。',
    'Permalink to "Open the tools"': '「ツールを開く」への固定リンク',
    'Permalink to "Chip in"': '「支援する」への固定リンク',
    'Reading, dictionaries you keep on your device, study, and saving cards stay free.': '読むこと、端末に置く辞書、学習、カードの保存は、これからも無料です。',
    "Donations are optional and cover Yomu's shared running costs.": '寄付は任意で、よむの共有サービスの運営費に充てられます。',
    'Monthly running costs': '月間運営費',
    'Permalink to "Monthly running costs"': '「月間運営費」への固定リンク',
    'Monthly running costs {#monthly-running-costs}': '月間運営費',
    'Permalink to "Monthly running costs {#monthly-running-costs}"': '「月間運営費」への固定リンク',
    'Forecast input': '見積もり項目',
    'Monthly estimate': '月間見積もり',
    'Cloudflare Workers Paid plan': 'Cloudflare Workers有料プラン',
    'R2 audio bucket storage': 'R2音声バケットのストレージ',
    'R2 audio read operations': 'R2音声の読み取り処理',
    'yomureader.com domain': 'yomureader.comドメイン',
    'D1 + KV donation state': 'D1 + KVの支援状況データ',
    'API usage and test devices': 'API利用とテスト端末',
    'Exact forecast': '正確な見積もり',
    'The public status bar shows the nearest whole unit, £10, while the support ledger keeps the exact GBP amount.': '公開ステータスバーでは最も近い整数の£10と表示し、支援台帳には正確なGBP額を残します。',
    'After the support migrations and Worker are deployed, verified card, Ko-fi, Buy Me a Coffee, and PayPal receipts count toward that monthly total. Patreon contributes each authenticated increase in its paid campaign-lifetime total. A provider appears in the status bar only when its official HTTPS page, provider verification settings, and ledger connection are ready.': '支援用の移行とWorkerをデプロイすると、カード、Ko-fi、Buy Me a Coffee、PayPalから届いた確認済み入金が月間合計に加わります。Patreonでは支払い済みキャンペーン累計額の認証済み増分を加算します。公式HTTPSページ、サービスの認証設定、台帳接続がすべて整ったサービスだけがステータスバーに表示されます。',
    'Card, Ko-fi, and qualifying Patreon support can create one Yomu Academy code. Once activated, Buy Me a Coffee and PayPal contribute to support accounting without creating a code. Card checkout accepts GBP, USD, EUR, CAD, AUD, and JPY.': 'カード、Ko-fi、条件を満たすPatreon支援では、よむAcademyコードを1つ発行できます。有効化後のBuy Me a CoffeeとPayPalは、コードを発行せず支援額の集計に加わります。カード決済ではGBP、USD、EUR、CAD、AUD、JPYを利用できます。',
    "An Academy code is sent to the email in the provider's verified payment notice and must be entered within 30 days. Card payments can also show it when the same browser returns from checkout. Once redeemed, Academy access stays with the Google account you choose.": 'Academyコードは、サービスから届く確認済みの支払い通知に記載されたメールアドレスへ送られ、30日以内に入力する必要があります。カード決済では、同じブラウザーで決済から戻ったときにも表示できます。使用後のAcademyアクセス権は、選んだGoogleアカウントに残ります。',
    'If a code from card, Ko-fi, or Patreon does not arrive, ask on Discord with the provider name and provider reference. Keep payment details out of the message. The owner can recover the code or issue a separate one.': 'カード、Ko-fi、Patreonのコードが届かない場合は、サービス名とサービス側の参照番号を添えてDiscordで尋ねてください。支払い情報はメッセージに書かないでください。管理者がコードを復元するか、別のコードを発行できます。',
    'Donations are optional and cover hosting, test devices, and the time it takes to keep Yomu improving. Any one-time amount from £5 to £500 works, and every donation includes permanent Yomu Academy access.': '寄付は任意です。ホスティング、検証用の端末、そしてよむを良くし続けるための時間に充てられます。£5から£500までの一度きりの金額に対応し、どの寄付にもYomu Academyの永続アクセスが含まれます。',
    // Docs rewrite 2026-07-27: docs/tools/index.md.
    'Yomu turns any page, video, manga or game screen into a Japanese lesson. Pick what you want to read — web pages, manga, video, PC games, PDFs — and read it with lookups, readings, and cards you keep. Free, no account.': 'よむは、ページも動画もマンガもゲーム画面も、日本語のレッスンに変えます。読みたいもの——Webページ、マンガ、動画、PCゲーム、PDF——を選び、意味を調べ、読みを表示し、覚えたい語をカードに残しながら読めます。無料、アカウント不要。',
    'Permalink to "Free Japanese Learning Tools"': '「無料の日本語学習ツール」への固定リンク',
    'Permalink to "Take any one of them"': '「どれか一つから始める」への固定リンク',
    'Kanji works everywhere: press a character inside any lookup to see its': '漢字はどこでも同じです。検索結果の中の文字を押すと見られます：',
    'stroke order and readings': '書き順と読み',
    'Permalink to "What you need"': '「必要なもの」への固定リンク',
    '— Tampermonkey on a computer, Userscripts on iPhone and iPad. Both are free.': '——パソコンではTampermonkey、iPhoneとiPadではUserscripts。どちらも無料です。',
    'That is the whole requirement.': '必要なのはこれだけです。',
    ', and your own Yomitan dictionaries all connect if you want them, and none of them are needed to start.': '、そして手持ちのYomitan辞書は、望めばつなげられます。始めるのに、どれも必要ありません。',
    'New here? Follow the': '初めての方はこちら：',
    // Docs rewrite 2026-07-27: docs/index.md install panel and showcase copy.
    'Add a userscript manager, install Yomu, then open a Japanese page and press a word.': 'ユーザースクリプト管理拡張を入れ、よむをインストールし、日本語のページを開いて語を押します。',
    'Downloaded a file instead of installing?': 'インストールされずにファイルがダウンロードされましたか。',
    "Some managers don't intercept the link. Copy this URL and use your manager's": '管理拡張によっては、このリンクを受け取らずにファイルとして保存します。そのときはURLをコピーして、お使いの管理拡張の',
    'Tampermonkey:': 'Tampermonkey：',
    '. Violentmonkey:': '。Violentmonkey：',
    '. ScriptCat:': '。ScriptCat：',
    ', or drag the downloaded file onto the ScriptCat tab.': '。ダウンロードしたファイルをScriptCatのタブにドラッグしても入ります。',
    'Press a word, keep your place': '語を押しても、読んでいた場所はそのまま',
    'The reading, the meaning, how it sounds, and a button to save it. You never leave the page you were reading.': '読み、意味、音声、そして保存ボタン。読んでいたページから離れることはありません。',
    'Read manga you cannot select': '選択できないマンガを読む',
    'Tap a manga panel or a screenshot and Yomu reads the Japanese in it. Every word in the picture becomes a word you can look up.': 'マンガのコマやスクリーンショットをタップすると、よむがその中の日本語を読み取ります。絵の中のどの語も、調べられる語になります。',
    'Read the subtitles as you watch': '観ているあいだに字幕を読む',
    'Follow your favourite shows and press any word in the subtitle line. Pause on a sign or a title card and Yomu reads that too.': '好きな番組を観ながら、字幕行のどの語でも押せます。看板やタイトル画面で一時停止すれば、よむがそれも読み取ります。',
    // Docs rewrite 2026-07-27: docs/features.md. Keys are the exact rendered
    // English text-node segments; tests/reader/i18n.test.ts guards the whole
    // page, so a copy edit here must land with its Japanese.
    'Yomu turns any page, video, manga or game screen into a Japanese lesson — lookups, readings, and cards you keep. Here is what that looks like on each thing you read.': 'よむは、ページも動画もマンガもゲーム画面も、日本語のレッスンに変えます。意味を調べ、読みを表示し、覚えたい語はカードとして残せます。読むものごとに、それがどう見えるかを紹介します。',
    'Permalink to "What Yomu does"': '「よむにできること」への固定リンク',
    'It is one loop, repeated everywhere you read:': 'どこで読んでも、繰り返すのは同じ一つの流れです。',
    'meet Japanese, understand it on the spot, keep the words worth keeping.': '日本語に出会い、その場で理解し、残す価値のある語を残す。',
    'Nothing below is required. Install Yomu, start reading, and turn things on when you want them.': '以下はどれも必須ではありません。よむを入れて読み始め、欲しくなったときに足していけば十分です。',
    'Press a word, get an answer': '語を押せば、答えが出る',
    'Permalink to "Press a word, get an answer"': '「語を押せば、答えが出る」への固定リンク',
    'Press or select any Japanese word and a small panel opens over the page. It shows you:': '日本語の語を押すか選択すると、ページの上に小さなパネルが開きます。そこに出るのは次の内容です。',
    'The reading': '読み',
    '— how the word is actually pronounced.': '——その語が実際にどう発音されるか。',
    'The meaning': '意味',
    ', in your language. Yomu ships definitions in 32 languages.': '——あなたの言語で表示されます。よむは32言語の語義を用意しています。',
    'How it sounds': '音声',
    '— press the speaker to hear a real recording.': '——スピーカーを押すと、実際の録音が聞けます。',
    'Real sentences': '実際の例文',
    'using the word, so you see how people use it.': '——その語が使われている文が出るので、使い方が分かります。',
    'The kanji': '漢字',
    ', broken down one character at a time.': '——1文字ずつ分解して見られます。',
    'A save button': '保存ボタン',
    ', so the word comes back later for review.': '——押しておけば、その語は後で復習に出てきます。',
    'You never leave the page. Close the panel and you are exactly where you were.': 'ページから離れることはありません。パネルを閉じれば、さっきまでいた場所にそのまま戻ります。',
    'A Yomu word panel open on a Japanese Wikipedia article, showing the reading, meaning, sound, and a save button.': '日本語版ウィキペディアの記事の上に開いたよむの語パネル。読み、意味、音声、保存ボタンが表示されています。',
    'The word panel, open on a real article.': '実際の記事の上に開いた語パネル。',
    'Readings above the kanji, as much or as little as you want': '漢字の上に読みを、好きな量だけ',
    'Permalink to "Readings above the kanji, as much or as little as you want"': '「漢字の上に読みを、好きな量だけ」への固定リンク',
    'Yomu can print the reading above the kanji on any Japanese page. You choose how much help you get: every word, only the hard kanji, or nothing for words you already know. Words can also be tinted by how well you know them, so a page shows you at a glance what is new.': 'よむは、どの日本語ページでも漢字の上に読みを表示できます。どれだけ助けを受けるかは自由です。すべての語に付ける、難しい漢字だけに付ける、すでに知っている語には付けない、のいずれも選べます。習熟度に応じて語に色を付けることもできるので、そのページで何が新しいかがひと目で分かります。',
    'More about readings and furigana →': 'ふりがなについて詳しく →',
    'Read manga and screenshots': 'マンガもスクリーンショットも読む',
    'Permalink to "Read manga and screenshots"': '「マンガもスクリーンショットも読む」への固定リンク',
    'Manga is a picture, so normally you cannot select the text in it. Yomu reads the Japanese inside the image and turns each word into something you can press. The picture stays exactly as it was until you touch a word.': 'マンガは画像なので、普通はその中の文字を選択できません。よむは画像の中の日本語を読み取り、一語ずつ押せるようにします。語に触れるまで、絵は元のままです。',
    'The same thing works on screenshots, image-only pages, and anywhere else the Japanese is baked into a picture.': 'スクリーンショットや画像だけのページなど、日本語が絵の中に埋め込まれている場所ならどこでも同じように使えます。',
    'More about reading images →': '画像を読むことについて詳しく →',
    'A Japanese manga page with each word in the panel ready to look up.': 'コマの中のどの語も調べられる状態になった日本語のマンガページ。',
    'Every word in the panel becomes a word you can press.': 'コマの中のどの語も、押せる語になります。',
    'Read the subtitles while you watch': '観ながら字幕を読む',
    'Permalink to "Read the subtitles while you watch"': '「観ながら字幕を読む」への固定リンク',
    'On a video, Yomu makes the Japanese subtitle line pressable. Look up a word without pausing, show a second subtitle line in your own language for support, and open a side panel with the whole transcript so you can jump back to a line you missed.': '動画では、よむが日本語の字幕行を押せるようにします。一時停止せずに語を調べられ、支えとして母語の字幕をもう一行表示でき、全文の書き起こしをサイドパネルで開いて聞き逃した行に戻ることもできます。',
    'There is a practice tab that replays one line on a loop for shadowing, and a batch tab that collects the new words from an episode so you can save them all at the end.': 'シャドーイング用に一行を繰り返し再生する練習タブと、1話分の新しい語を集めて最後にまとめて保存できるタブもあります。',
    'For your own video files, open the': '手持ちの動画ファイルなら、',
    ', drop in a video and a subtitle file, and everything above works there too.': 'を開いて動画と字幕ファイルを読み込めば、ここまでの機能がそのまま使えます。',
    'More about video →': '動画について詳しく →',
    'The Yomu subtitle line and transcript panel open on a Japanese YouTube video.': '日本語のYouTube動画で開いた、よむの字幕行と書き起こしパネル。',
    'Subtitles and the transcript panel, on a real video.': '実際の動画で見た字幕と書き起こしパネル。',
    'Make YouTube speak Japanese': 'YouTubeを日本語のフィードにする',
    'Permalink to "Make YouTube speak Japanese"': '「YouTubeを日本語のフィードにする」への固定リンク',
    'Yomu tunes your YouTube recommendations towards Japanese. It keeps Japanese videos and learner channels — including the ones with English titles — and quietly sets the rest aside. Playback is untouched, and one shortcut turns it off again.': 'よむはYouTubeのおすすめを日本語寄りに調整します。日本語の動画と学習者向けチャンネルは——英語のタイトルが付いたものも含めて——残し、それ以外はそっと脇へ寄せます。再生そのものはそのままで、ショートカット一つで元に戻せます。',
    'If you are just starting, Yomu can also offer a list of about 100 Japanese channels with subscribe links, sorted by level.': '始めたばかりなら、レベル順に並べた日本語チャンネル約100件のリストを、登録リンク付きで出すこともできます。',
    'More about the YouTube filter →': 'YouTubeフィルターについて詳しく →',
    'A YouTube results page where Yomu keeps beginner Japanese videos visible.': '初級者向けの日本語動画が表示されたままになっているYouTubeの検索結果ページ。',
    'A YouTube feed retuned towards Japanese.': '日本語寄りに調整されたYouTubeのフィード。',
    'Play games in Japanese': '日本語でゲームを遊ぶ',
    'Permalink to "Play games in Japanese"': '「日本語でゲームを遊ぶ」への固定リンク',
    'is a small desktop app for PC games. Press your capture shortcut and it reads the Japanese on screen, so you can look words up mid-scene the same way you would on a web page.': 'はPCゲーム向けの小さなデスクトップアプリです。取り込み用のショートカットを押すと画面上の日本語を読み取るので、Webページと同じようにシーンの途中で語を調べられます。',
    'Set up Yomu Gaming →': 'Yomu Gamingを設定する →',
    'Slow down on a kanji': '漢字をじっくり見る',
    'Permalink to "Slow down on a kanji"': '「漢字をじっくり見る」への固定リンク',
    'Press any kanji inside the word panel and it opens on its own. You get the stroke order animated, the readings, what level it is usually taught at, the pieces it is built from, and other words that use it. There is a pad to trace it yourself.': '語パネルの中の漢字を押すと、その漢字だけの画面が開きます。書き順のアニメーション、読み、習う時期の目安、組み立てている部品、その漢字を使う他の語が分かります。自分でなぞって書けるパッドもあります。',
    'More about kanji →': '漢字について詳しく →',
    'A Yomu kanji panel showing stroke order and readings for a single character.': '1文字分の書き順と読みを表示しているよむの漢字パネル。',
    'One kanji, taken apart.': '漢字を1文字、分解したところ。',
    'Keep the words you save': '保存した語は残り続ける',
    'Permalink to "Keep the words you save"': '「保存した語は残り続ける」への固定リンク',
    'Every word you save comes back on the': '保存した語はすべて',
    '. It gives you one card at a time and a short run of steps, and you rate yourself once at the end:': 'に戻ってきます。カードは1枚ずつ出て、短いステップをいくつか通り、最後に一度だけ自己採点します。',
    'Draw the kanji': '漢字を書く',
    'from memory on a tracing pad.': '——なぞり書きパッドに、記憶だけで書きます。',
    'Read the word': '語を読む',
    'inside a real sentence.': '——実際の文の中で読みます。',
    'Write or type the word': '語を書く・打つ',
    'from its meaning.': '——意味から語を書くか入力します。',
    'Fill the blank': '空欄を埋める',
    '— the sentence comes back with the word missing. Stuck? A hint gives you the first kana, the length, or the meaning.': '——語を抜いた文が出てきます。詰まったら、最初のかな、文字数、意味のいずれかをヒントとしてもらえます。',
    'Hear the pitch': 'アクセントを聞く',
    'and pick the shape you heard.': '——聞こえた高低の形を選びます。',
    'Say it aloud': '声に出す',
    '— record yourself and Yomu scores your pitch on your device.': '——自分の声を録音すると、よむが端末の中でアクセントを採点します。',
    'Steps that do not fit a card are skipped, so a kana-only word never asks you to draw kanji.': 'そのカードに合わないステップは飛ばされるので、かなだけの語で漢字を書かされることはありません。',
    'Study works offline once it has loaded, so it is usable on the train. Add it to your Home Screen on a phone or tablet and it opens like an app.': '学習ページは一度読み込めばオフラインでも動くので、電車の中でも使えます。スマートフォンやタブレットのホーム画面に追加すれば、アプリのように開きます。',
    'More about Study →': '学習ページについて詳しく →',
    'The Yomu study page with an example sentence and the target word blanked out.': '例文の中の対象語が空欄になっているよむの学習ページ。',
    'One card, one short run of steps.': 'カード1枚と、短いステップの流れ。',
    'Bring your own dictionaries': '手持ちの辞書を持ち込む',
    'Permalink to "Bring your own dictionaries"': '「手持ちの辞書を持ち込む」への固定リンク',
    'Yomu installs a starter dictionary for your language on first run, and you can add any Yomitan dictionary file on top. Dictionaries stay on your device, so lookups keep working with no connection.': 'よむは初回起動時に、あなたの言語向けの入門辞書を入れます。そこにYomitan形式の辞書ファイルをいくつでも追加できます。辞書は端末の中に置かれるので、接続がなくても検索はそのまま動きます。',
    'Compare the dictionary and study options →': '辞書と学習サービスを比べる →',
    'Connect the study apps you already use': '使っている学習アプリをつなぐ',
    'Permalink to "Connect the study apps you already use"': '「使っている学習アプリをつなぐ」への固定リンク',
    'If you already review Japanese somewhere, Yomu saves words there instead of starting a new pile:': 'すでにどこかで日本語を復習しているなら、よむは新しい山を作らず、その場所に語を保存します。',
    '— a saved word becomes a card carrying the word, its reading, its meaning, the sentence you found it in, and the sound.': '——保存した語は、語・読み・意味・見つけた文・音声を持つカードになります。',
    'Jiten, Bunpro, JPDB, and WaniKani': 'Jiten、Bunpro、JPDB、WaniKani',
    '— Yomu shows what each service already knows about a word and sends your reviews back to it.': '——各サービスがその語について既に持っている情報をよむが表示し、復習の結果をそのサービスへ返します。',
    'Reading on a phone but keeping your Anki decks on a computer? That works: keep Anki open on the computer and connect the two, as described in': 'スマートフォンで読みながら、Ankiのデッキはパソコンに置いていますか。それでも使えます。パソコンでAnkiを開いたまま、両方をつなぐだけです。手順はこちら：',
    'All of it is optional. Yomu works fully on its own.': 'どれも任意です。よむは単体でも十分に動きます。',
    'Set these up →': 'これらを設定する →',
    'Sync across your devices': '端末どうしで同期する',
    'Permalink to "Sync across your devices"': '「端末どうしで同期する」への固定リンク',
    'Create a free Yomu account and the words you save follow you between the devices you pair. Your cards are encrypted before they leave your device, so what is stored is unreadable without your key.': 'よむの無料アカウントを作れば、保存した語がペアにした端末の間を移動します。カードは端末を出る前に暗号化されるので、保管されている内容はあなたの鍵があってはじめて読めます。',
    'Read the privacy policy →': 'プライバシーポリシーを読む →',
    'What it runs on': '動作環境',
    'Permalink to "What it runs on"': '「動作環境」への固定リンク',
    'Yomu runs in Chrome, Edge, Firefox, and Safari on a computer, and in Safari on iPhone and iPad. It is free and open source, and the reading loop needs no account.': 'よむはパソコンのChrome、Edge、Firefox、Safariで動き、iPhoneとiPadではSafariで動きます。無料のオープンソースで、読むための流れにアカウントは要りません。',
    'Browse the tools': 'ツールを見る',
    // Docs rewrite 2026-07-27: docs/guides/index.md.
    'Practical guides to learning Japanese by reading, watching, and playing what you already like — raw manga, anime and YouTube subtitles into Anki cards, PC games, and choosing where to study.': '好きなものを読む・観る・遊ぶことで日本語を学ぶための実践ガイド。生のマンガ、アニメやYouTubeの字幕からAnkiカードを作る方法、PCゲーム、そして学習先の選び方まで。',
    'Permalink to "Japanese Immersion Guides"': '「日本語没入ガイド」への固定リンク',
    'Yomu turns any page, video, manga or game screen into a Japanese lesson. These guides show you how to actually spend an evening doing it.': 'よむは、ページも動画もマンガもゲーム画面も、日本語のレッスンに変えます。これらのガイドは、それを使って一晩をどう過ごすかを具体的に示します。',
    'Each one walks a real task end to end, with free software and no account. Pick the one that matches what you want to do tonight.': 'どのガイドも、無料のソフトウェアだけで、アカウントなしに、実際の作業を最初から最後までたどります。今夜やりたいことに合うものを選んでください。',
    'Read raw, untranslated manga: look up words inside the panels and get the readings.': '翻訳されていない生のマンガを読みます。コマの中の語を調べ、読みも表示します。',
    'Turn what you watch into flashcards': '観たものをカードに変える',
    'Make an Anki card from an anime or YouTube subtitle line, with the audio and a screenshot.': 'アニメやYouTubeの字幕の一行から、音声とスクリーンショット付きのAnkiカードを作ります。',
    'Find Japanese worth watching': '観る価値のある日本語を見つける',
    'Retune YouTube into a Japanese feed, with a channel list from N5 to N1.': 'YouTubeを日本語のフィードに調整し、N5からN1までのチャンネルリストも用意します。',
    'Choose where to study': '学習する場所を選ぶ',
    'Yomitan, Jiten, Bunpro, JPDB, Anki: what each is for, and how to use any of them from Yomu.': 'Yomitan、Jiten、Bunpro、JPDB、Anki。それぞれの用途と、よむからどれでも使う方法。',
    'Play PC games in Japanese': 'PCゲームを日本語で遊ぶ',
    'Install Yomu Gaming and read the Japanese on screen while you play.': 'Yomu Gamingを入れて、遊びながら画面上の日本語を読みます。',
    'Permalink to "How to use these"': '「これらの使い方」への固定リンク',
    'find Japanese you mostly understand, look up only what blocks you, and keep the words worth keeping.': 'ほぼ理解できる日本語を見つけ、つまずいたところだけを調べ、残す価値のある語を残す。',
    'Read them in any order.': 'どの順番で読んでも構いません。',
    'They all start from an installed Yomu:': 'どれも、よむが入っているところから始まります。',
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
        syncHostedAcademyAccountControls(effectiveInterfaceLanguage());
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
    hostedExplicitLanguageChoice = { language, at: Date.now() };
    writeStoredSettingsPatch({ interfaceLanguage: language });
    window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: { language } }));
}

function localizeHostedDocsCopy(options: { resetReaderWords?: boolean } = {}): void {
    const language = effectiveInterfaceLanguage();
    hostedAppliedDocsLanguage = language;
    syncHostedDocumentLocale(language);
    if (options.resetReaderWords) unwrapHostedDocsReaderWords();
    localizeHostedStructuredDocsCopy(document.body, language);
    restoreHostedDocsLeafCopy(document.body, language);
    translateTextNodes(document.body, language);
    translateAttributes(document.body, language);
}

function syncHostedDocumentLocale(language: InterfaceLanguage): void {
    // D43: hosted docs is a document Yomu owns, so it takes the full interface
    // locale — `lang`, `dir` and the per-script font stack — from the same
    // manifest the reader chrome uses. Today every available locale is ltr, so
    // this changes nothing visible; it is the seam an RTL locale arrives through,
    // and having it here means enabling Arabic is a ledger flip, not a hunt for
    // every place a direction should have been set.
    applyInterfaceLocaleToDocument(document, resolveInterfaceLocale(language).locale);
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
        const current = node.nodeValue ?? '';
        // Reader annotations split a translated text node into word wrappers.
        // Unwrapping and normalize() can merge those surfaces back into the
        // surviving pre-annotation node, whose WeakMap entry still contains a
        // tiny fragment such as "Web". Canonicalize from the reconstructed
        // current text before accepting that cached fallback.
        const original = canonicalHostedDocsSourceString(current, textNodeOriginals.get(node));
        textNodeOriginals.set(node, original);
        const translated = translateHostedDocsString(original, language);
        // Same-value writes still queue characterData mutation records, and in
        // Japanese mode the annotating reader observes this whole subtree —
        // every localization pass would otherwise trigger a pointless rescan.
        if (node.nodeValue !== translated) node.nodeValue = translated;
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
    cleanupHostedDocsAnnotations(document.body, resetHostedDocsTextOriginals);
}

function resetHostedDocsTextOriginals(root: ParentNode): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        textNodeOriginals.delete(node);
    }
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
    const accentColor = hostedAccentColorFromValue(settings.accentColor);
    const interfaceLanguage = hostedInterfaceLanguagePreferenceFromValue(settings.interfaceLanguage);
    if (theme) patch.theme = theme;
    if (accentColor) patch.accentColor = accentColor;
    if (interfaceLanguage && !isStaleHostedLanguageEcho(interfaceLanguage)) patch.interfaceLanguage = interfaceLanguage;
    return patch;
}

function isStaleHostedLanguageEcho(language: HostedInterfaceLanguagePreference): boolean {
    const choice = hostedExplicitLanguageChoice;
    return Boolean(choice && language !== choice.language && Date.now() - choice.at < HOSTED_LANGUAGE_ECHO_WINDOW_MS);
}

function writeStoredSettingsPatch(patch: Record<string, any>, options: { shared?: boolean } = {}): Record<string, any> {
    const settings = { ...readStoredSettings(), ...patch };
    hostedSettingsEventPatch = { ...hostedSettingsEventPatch, ...patch };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    if (options.shared !== false) propagateSettingsPatchToSharedStorage(patch);
    return settings;
}

// The localStorage write above only reaches this origin. When the userscript's
// storage bridge is active, patch the shared GM settings as well so docs-chrome
// edits (theme toggle, HUD language) follow the user to every other site.
// Read-modify-write against the shared copy so a stale hosted blob never
// clobbers settings saved elsewhere.
function propagateSettingsPatchToSharedStorage(patch: Record<string, any>): void {
    hostedSharedSettingsWrite = hostedSharedSettingsWrite.then(async () => {
        try {
            const shared = await gmStorageGet<Record<string, any> | null>(SETTINGS_STORAGE_KEY, null);
            await gmStorageSet(SETTINGS_STORAGE_KEY, { ...(shared ?? {}), ...patch });
        } catch {
            // Bridge unavailable: the localStorage copy stays authoritative here.
        }
    });
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
    const accent = sanitizeHostedAccentColor(readEffectiveHostedSettings().accentColor);
    const root = document.documentElement;
    const dark = root.classList.contains('dark');
    const signature = `${accent}|${dark ? 'dark' : 'light'}`;
    if (hostedAccentSignature === signature) return;
    hostedAccentSignature = signature;

    // Same variable map the pre-paint bootstrap stamps (see
    // src/reader/core/hosted-appearance-boot.ts), so re-applying it after
    // hydration is a no-op instead of a visible colour correction.
    const variables = hostedAccentCssVariables(accent, dark);
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);

    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', accent);
}


function browserPrefersJapanese(): boolean {
    const languages = [...(navigator.languages ?? []), navigator.language];
    return languages.some(language => language?.toLowerCase().startsWith('ja'));
}

function declareHostedAnnotationScope(): void {
    document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
    syncHostedContentAnnotationSurface();
}

// In Japanese mode the docs are themselves Japanese immersion content, so the
// whole content column becomes a declared Reader Surface and annotates like
// any other Japanese site — for the hosted demo runtime and an installed
// userscript alike. English mode keeps the demo-only scope: outside the demo
// surfaces the chrome holds no meaningful Japanese, and scanning it is what
// made Japanese mode drag before the scope existed.
function syncHostedContentAnnotationSurface(): void {
    const content = document.getElementById('VPContent');
    if (!content) return;
    const japanese = effectiveInterfaceLanguage() === 'ja';
    toggleHostedRuntimeSurface(content, japanese);
    // Japanese mode reads the chrome too: the top navigation, local nav, and
    // sidebar labels are ordinary Japanese vocabulary (学ぶ, 学習, アカデミー)
    // with ruby room, so they join the declared surfaces. English mode keeps
    // them out of scope entirely — there the chrome holds no Japanese.
    for (const selector of ['.VPNav', '.VPLocalNav', '.VPSidebar']) {
        document.querySelectorAll<HTMLElement>(selector).forEach(element => toggleHostedRuntimeSurface(element, japanese));
    }
}

function toggleHostedRuntimeSurface(element: HTMLElement, declared: boolean): void {
    if (declared) element.setAttribute('data-yomu-runtime-surface', '');
    else element.removeAttribute('data-yomu-runtime-surface');
}

function installHostedDocsEnhancements(): void {
    declareHostedAnnotationScope();
    registerHostedDocsServiceWorker();
    syncLandmarks();
    installHostedLanguageToggle();
    syncHostedAcademyAccountControls(effectiveInterfaceLanguage());
    installHostedOverflowMenu();
    installHostedSupportBanner();
    installHostedAccentSync();
    localizeHostedDocsCopy();
    scheduleHostedDocsLocalization();
    prepareHostedYomuRuntime();
    installHostedHomepageInteractions();
    if (routeSyncBound) return;
    routeSyncBound = true;
    // Baseline the annotation-affecting settings from storage now, before the
    // runtime can dispatch a change event (its first event already carries the
    // NEW values mirrored to storage, so seeding from the event would miss the
    // first real change).
    hostedAppliedAnnotationSettings ??= hostedAnnotationSettingsFingerprint(readStoredSettings());
    window.addEventListener(SETTINGS_CHANGE_EVENT, syncHostedLanguageFromSettingsEvent);
    window.addEventListener(LANGUAGE_EVENT, () => {
        syncHostedContentAnnotationSurface();
        syncHostedLanguageToggle();
        syncHostedAcademyAccountControls(effectiveInterfaceLanguage());
        syncHostedOverflowMenu();
        syncHostedMobileNavSettings();
        installHostedSupportBanner();
        scheduleHostedDocsLocalization({ resetReaderWords: true });
        // Entering Japanese turns the content column into a runtime surface;
        // rebind intent targets (and the near-viewport boot check) to it so a
        // reader runtime loads without requiring a pointer over a demo.
        prepareHostedYomuRuntime();
    });
    window.addEventListener('hashchange', () => window.requestAnimationFrame(() => {
        declareHostedAnnotationScope();
        syncLandmarks();
        syncHostedLanguageToggle();
        syncHostedAcademyAccountControls(effectiveInterfaceLanguage());
        syncHostedOverflowMenu();
        syncHostedMobileNavSettings();
        installHostedSupportBanner();
        scheduleHostedDocsLocalization();
        prepareHostedYomuRuntime();
        installHostedHomepageInteractions();
        syncHostedAccent();
    }));
    window.addEventListener('popstate', () => window.requestAnimationFrame(() => {
        declareHostedAnnotationScope();
        syncLandmarks();
        syncHostedLanguageToggle();
        syncHostedAcademyAccountControls(effectiveInterfaceLanguage());
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
    if (existing) {
        if (hostedSupportBannerStatus) {
            existing.replaceWith(renderHostedSupportBanner(hostedSupportBannerStatus));
        }
        return;
    }
    void loadHostedSupportStatus()
        .then(status => {
            if (!shouldShowHostedSupportBanner(status)) return;
            hostedSupportBannerStatus = status;
            const banner = renderHostedSupportBanner(status);
            const content = document.querySelector<HTMLElement>('.VPContent');
            if (content) content.prepend(banner);
            else document.body.prepend(banner);
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
    if (hostedReadySupportProviders(status).length === 0) return false;
    if (!hostedSupportGoalAvailable(status)) return false;
    const version = hostedSupportDismissVersion(status);
    return shouldShowHostedSupportBannerImpression(version);
}

function renderHostedSupportBanner(status: HostedSupportStatus): HTMLElement {
    const banner = document.createElement('aside');
    banner.id = YOMU_SUPPORT_BANNER_ID;
    banner.className = 'yomu-support-banner';
    banner.setAttribute(
        'aria-label',
        effectiveInterfaceLanguage() === 'ja' ? 'よむの運営支援' : 'Yomu running-cost support',
    );
    banner.dataset.yomuSupportBanner = 'true';

    const copy = document.createElement('div');
    copy.className = 'yomu-support-banner-copy';

    const message = document.createElement('strong');
    message.textContent = hostedSupportMessage(status);
    copy.append(message);

    const meta = document.createElement('span');
    meta.textContent = hostedSupportMeta(status);
    copy.append(meta);

    const breakdown = document.createElement('a');
    breakdown.className = 'yomu-support-banner-breakdown';
    breakdown.href = '/support#monthly-running-costs';
    breakdown.textContent = effectiveInterfaceLanguage() === 'ja'
        ? '内訳'
        : 'What this covers';
    copy.append(breakdown);

    const progress = renderHostedSupportProgress(status);
    if (progress) copy.append(progress);

    const actions = document.createElement('div');
    actions.className = 'yomu-support-banner-actions';

    for (const button of renderHostedSupportProviderButtons(status)) actions.append(button);

    const close = document.createElement('button');
    close.className = 'yomu-support-banner-close';
    close.type = 'button';
    close.setAttribute(
        'aria-label',
        effectiveInterfaceLanguage() === 'ja' ? '支援状況を閉じる' : 'Dismiss support status',
    );
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
    track.setAttribute(
        'aria-label',
        effectiveInterfaceLanguage() === 'ja'
            ? '今月の運営費に対する支援額'
            : 'Support received toward this month’s running costs',
    );
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
    return hostedReadySupportProviders(status).map(provider => {
        const link = document.createElement('a');
        link.className = provider.id === 'stripe'
            ? 'yomu-support-banner-donate'
            : 'yomu-support-banner-provider';
        link.dataset.provider = provider.id ?? '';
        link.href = provider.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = provider.id === 'stripe'
            ? (effectiveInterfaceLanguage() === 'ja' ? '寄付する' : 'Donate')
            : (provider.label || (provider.id ?? 'Support'));
        return link;
    });
}

function hostedReadySupportProviders(
    status: HostedSupportStatus,
): Array<HostedSupportProvider & { url: string }> {
    return (status.providers ?? []).flatMap(provider => {
        if (!provider?.enabled) return [];
        const url = safeHostedHttpsUrl(provider.url);
        return url ? [{ ...provider, url }] : [];
    });
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
    if (effectiveInterfaceLanguage() === 'ja') {
        return status.goalMet
            ? '今月分の高速音声の運営費が集まりました。ありがとうございます。'
            : '今月のご支援で、単語・シャドーイング向けの高速音声を運営します。';
    }
    return status.goalMet
        ? "This month's fast audio bill is covered. Thank you."
        : "This month's support keeps fast word and shadowing audio running.";
}

function hostedSupportMeta(status: HostedSupportStatus): string {
    const goalText = hostedSupportGoalText(status);
    const receivedText = hostedSupportReceivedText(status);
    const japanese = effectiveInterfaceLanguage() === 'ja';
    const cost = japanese
        ? `月の運営費：${goalText}`
        : `Monthly running costs: ${goalText}`;
    const goal = japanese
        ? `今月のご支援：${receivedText} / ${goalText}`
        : `Received this month: ${receivedText} / ${goalText}`;
    return `${cost} · ${goal}`;
}

function hostedSupportGoalText(status: HostedSupportStatus): string {
    const display = status.display;
    if (display?.goalText) return display.goalText;
    if (display?.converted && typeof display.goal === 'number' && display.currency) {
        return formatHostedLocalCurrency(display.goal, display.currency);
    }
    const goal = status.donationGoalGbp ?? status.estimatedMonthlyCostGbp;
    return typeof goal === 'number' && Number.isFinite(goal)
        ? formatHostedSupportGbp(goal)
        : '';
}

function hostedSupportReceivedText(status: HostedSupportStatus): string {
    const display = status.display;
    if (display?.amountText) return display.amountText;
    if (display?.converted && typeof display.amount === 'number' && display.currency) {
        return formatHostedLocalCurrency(display.amount, display.currency);
    }
    return formatHostedSupportGbp(status.donationsThisMonthGbp ?? status.donationsTodayGbp ?? 0);
}

function hostedSupportGoalAvailable(status: HostedSupportStatus): boolean {
    if (typeof status.display?.goalText === 'string' && status.display.goalText.trim()) return true;
    if (typeof status.display?.goal === 'number' && Number.isFinite(status.display.goal)) return true;
    return [status.donationGoalGbp, status.estimatedMonthlyCostGbp]
        .some(value => typeof value === 'number' && Number.isFinite(value));
}

// Client-side fallback: if the Worker could not localize (FX unavailable), or
// the caller wants the visitor's own locale formatting, use Intl.NumberFormat
// with navigator.language and the currency the Worker reported.
function formatHostedLocalCurrency(value: number, currency: string): string {
    const rounded = Math.round(value);
    try {
        const locale = (typeof navigator !== 'undefined' && navigator.language) || 'en-GB';
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(rounded);
    } catch {
        return `${rounded} ${currency}`;
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
    return formatHostedLocalCurrency(value, 'GBP');
}

// Settings whose values are baked into rendered reader-word DOM (ruby rt
// presence, pitch classes, token boundaries). When one of these changes, the
// existing annotations are stale and must be torn down so the runtime's next
// scan rebuilds them (destructively painted words are excluded from rescan
// collection, so without a teardown old rt would linger after e.g.
// Furigana → Off). CSS-driven channels (theme, accent, colour sources) and
// subtitle state have their own refresh paths and are deliberately absent.
const HOSTED_ANNOTATION_SETTINGS_KEYS = [
    'furiganaMode',
    'showFurigana',
    'hideKnownFurigana',
    'showPitchAccent',
    'parserProvider',
    'dictionaryPreferences',
] as const;

function hostedAnnotationSettingsFingerprint(settings: Record<string, unknown>): string {
    return JSON.stringify(HOSTED_ANNOTATION_SETTINGS_KEYS.map(key => settings[key] ?? null));
}

function syncHostedLanguageFromSettingsEvent(event: Event): void {
    const change = settingsFromChangeEvent(event);
    if (!change) return;
    const annotationFingerprint = hostedAnnotationSettingsFingerprint(change.settings);
    const annotationSettingsChanged = hostedAppliedAnnotationSettings !== undefined
        && hostedAppliedAnnotationSettings !== annotationFingerprint;
    hostedAppliedAnnotationSettings = annotationFingerprint;
    const language = hostedInterfaceLanguagePreferenceFromValue(change.settings.interfaceLanguage);
    if (language && isStaleHostedLanguageEcho(language)) {
        // A runtime that booted after the あ toggle just echoed its stale
        // stored language; hostedSettingsPatch drops that value, and
        // re-broadcasting the choice lets the (now booted) runtime adopt it.
        const choice = hostedExplicitLanguageChoice;
        if (choice) window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: { language: choice.language } }));
    }
    if (language) {
        rememberHostedSettingsChange(change.settings, !change.preview);
        syncHostedLanguageToggle();
        syncHostedOverflowMenu();
        syncHostedMobileNavSettings();
    }
    // The runtime persists its full settings object for reasons unrelated to
    // the page copy (e.g. the demo video's subtitle module saving state), and
    // it mirrors the new values to storage BEFORE dispatching this event — so
    // effective state always reads the NEW values here. Compare the payload
    // against what was last APPLIED instead: re-localize (with annotation
    // teardown, since the wrapped text is about to be replaced) only when the
    // language actually changed, and tear down annotations only when an
    // annotation-affecting setting changed. Every other save is layout-inert;
    // stripping annotations on it collapsed ruby line heights page-wide and
    // yanked the scroll position on engines without scroll anchoring
    // (iOS Safari).
    // effectiveInterfaceLanguage() resolves an 'auto' preference via the
    // browser locale, and after rememberHostedSettingsChange it reflects the
    // event payload — so this compares "language the page should show" against
    // "language the copy last rendered in".
    const languageChanged = language !== undefined && effectiveInterfaceLanguage() !== hostedAppliedDocsLanguage;
    if (!languageChanged && !annotationSettingsChanged) return;
    scheduleHostedDocsLocalization({ resetReaderWords: true });
}

// Homepage-only progressive enhancements: scroll reveals and the click-to-play
// homepage reveal sections.
// All are idempotent (guarded by data flags) so they survive route re-runs.
function installHostedHomepageInteractions(): void {
    armHostedRevealElements();
    bindHostedYouTubeLiteEmbeds();
    bindHostedDemoVideos();
    watchHostedFoldRuntime();
    installHostedHeroLanguageRotator();
}

// The headline rotator, restored by owner decision 2026-08-04. The SSR
// headline stays "…learning 日本語." so crawlers, social unfurls and the no-JS
// page never see a language chosen by a timer; only a booted client rotates,
// and it starts from the same 日本語 the static page shows. Japanese word order
// puts the study target first (日本語を学ぶための…), so the rotator owns the
// WHOLE headline per interface language instead of swapping a word at a fixed
// position inside a translated template.
const HOSTED_HERO_HEADLINES: Record<InterfaceLanguage, readonly [string, string]> = {
    en: ['A complete system for learning ', '.'],
    ja: ['', 'を学ぶための、すべてがそろう。'],
};
const HOSTED_HERO_ROTATION_MS = 2800;

function installHostedHeroLanguageRotator(): void {
    const heading = document.querySelector<HTMLElement>('#yomu-home-title:not([data-yomu-hero-rotator])');
    if (!heading) return;
    const languages = __YOMU_HERO_LANGUAGES__;
    if (languages.length < 2) return;
    heading.dataset.yomuHeroRotator = 'on';
    // The rotator owns the headline from here on; without the localize opt-out
    // the docs localizer would rewrite the same text on every language toggle.
    heading.dataset.yomuLocalize = 'off';
    let index = 0;
    const render = () => {
        if (!heading.isConnected) return;
        const [before, after] = HOSTED_HERO_HEADLINES[effectiveInterfaceLanguage()];
        const language = languages[index];
        // A fresh span every tick so the entry animation replays.
        const word = document.createElement('span');
        word.className = 'yomu-fold-h1-lang';
        word.lang = language.locale;
        word.dir = language.direction;
        word.textContent = language.nativeName;
        heading.replaceChildren(document.createTextNode(before), word, document.createTextNode(after));
    };
    render();
    window.addEventListener(LANGUAGE_EVENT, () => window.requestAnimationFrame(render));
    window.setInterval(() => {
        if (document.hidden || !heading.isConnected) return;
        index = (index + 1) % languages.length;
        render();
    }, HOSTED_HERO_ROTATION_MS);
}

// The fold's live line is pre-annotated static markup, so it still looks
// correct when the reader never executes — but the "press a word" prompt would
// then be a lie. Poll for a reader that has both booted and will actually
// answer a press on the sample; if it has not, swap the prompt for a quiet link
// to the section that shows the same thing working.
function watchHostedFoldRuntime(): void {
    const prompt = document.querySelector<HTMLElement>('[data-yomu-fold-prompt]:not([data-yomu-fold-watched])');
    if (!prompt) return;
    prompt.dataset.yomuFoldWatched = 'true';
    let elapsed = 0;
    const timer = window.setInterval(() => {
        elapsed += HOSTED_FOLD_WATCHDOG_TICK_MS;
        if (isHostedFoldSampleLive()) {
            // Only ever un-stamp before the fallback has been offered. Once a
            // visitor has been shown "see it working below", swapping it back to
            // the shorter live label moves the target out from under their
            // pointer mid-press: the two states are 180px and 113px wide at the
            // same origin, so the press lands on the label instead of the link
            // and appears to do nothing. A late-booting runtime is not worth
            // that; the link still goes somewhere true.
            if (!prompt.dataset.yomuFoldFallbackShown) prompt.removeAttribute('data-yomu-runtime-missing');
            window.clearInterval(timer);
            return;
        }
        if (elapsed >= HOSTED_FOLD_WATCHDOG_MS) {
            prompt.setAttribute('data-yomu-runtime-missing', '');
            prompt.dataset.yomuFoldFallbackShown = 'true';
        }
        if (elapsed >= HOSTED_FOLD_WATCHDOG_GIVE_UP_MS) window.clearInterval(timer);
    }, HOSTED_FOLD_WATCHDOG_TICK_MS);
}

// A booted runtime is necessary but not sufficient. The reader refuses every
// lookup inside [data-jpdb-reader-surface-ignore] (its own document-click
// ignore list), so a sample marked that way leaves __yomuReaderAppInitialized
// true while pressing a word does nothing at all — the exact failure the prompt
// exists to disclose. Treat a sample the reader will not serve as no runtime.
function isHostedFoldSampleLive(): boolean {
    if (!isAnyYomuRuntimeClaimed()) return false;
    const sample = document.querySelector<HTMLElement>('.yomu-try-me-text');
    return Boolean(sample)
        && !sample?.closest('[data-jpdb-reader-surface-ignore]')
        && !sample?.querySelector('[data-jpdb-reader-surface-ignore]');
}

/**
 * Whether ANY Yomu runtime owns this page — the hosted copy, an installed
 * extension, or a userscript.
 *
 * `__yomuReaderAppInitialized` is written to the runtime's OWN `window`
 * (`bootWindow = window` in src/reader/app/boot.ts), so it is realm-local. An
 * extension content script runs in an isolated world and a userscript manager
 * may hand the script a sandboxed window, and in both cases the page's `window`
 * never receives the flag. Checking only the flag therefore reported "no
 * runtime" to visitors who had Yomu installed and working, and the fold swapped
 * its live "press a word" prompt for "see it working below" — telling someone to
 * go look elsewhere at the exact moment the thing was working in front of them.
 *
 * The runtime also claims the page with a `<meta id="jpdb-reader-runtime-owner">`
 * carrying `data-yomu-runtime-owner` (runtime-claim in boot.ts). The DOM is the
 * one thing every realm shares, so that marker is the honest signal. The window
 * flag stays as a fast path for the hosted runtime's own boot.
 */
function isAnyYomuRuntimeClaimed(): boolean {
    if (hostedYomuRuntimeWindow().__yomuReaderAppInitialized) return true;
    const marker = document.getElementById(READER_RUNTIME_MARKER_ID);
    return Boolean(marker?.dataset.yomuRuntimeOwner);
}

// Copied rather than imported: the id's home, src/reader/app/runtime-health.ts,
// pulls in the whole companion registry, and the docs bundle must not carry the
// reader's companions to read one string. tests/reader/i18n.test.ts asserts this
// literal still equals READER_RUNTIME_MARKER_ID, so the copy cannot drift.
const READER_RUNTIME_MARKER_ID = 'jpdb-reader-runtime-owner';

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
    if (!shouldInstallHostedReaderRuntime(forceLocalRuntime)) {
        clearHostedYomuRuntimeIntent();
        clearHostedRuntimeHoverHandoff();
        return;
    }
    if (shouldLoadHostedRuntimeCompanionsBeforeCore()) appendHostedRuntimeCompanionScripts(forceLocalRuntime);
    if (isHostedYomuRuntimeLoadingOrReady(forceLocalRuntime)) {
        // Only a live reader makes the tracker moot; a mid-boot re-entry must
        // leave it running so the pending replay can still fire.
        if (hostedYomuRuntimeWindow().__yomuReaderAppInitialized) clearHostedRuntimeHoverHandoff();
        return;
    }
    // The settings companion loads on the settings warm path; normal docs pages
    // should not download every companion before the reader is needed.
    const targets = findHostedYomuRuntimeTargets();
    if (!targets.length) {
        clearHostedYomuRuntimeIntent();
        clearHostedRuntimeHoverHandoff();
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
    if (document.documentElement.getAttribute('data-yomu-annotation-scope') === 'surface') return [];
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
    trackHostedRuntimeHoverHandoff(targets);
}

// The runtime usually starts on idle/near-viewport with no pointer, so a hover
// already resting on a demo word never triggered the boot — and even a hover
// that does trigger it is consumed before the reader attaches its
// document-level hover listener. Track where the pointer rests over a demo word
// (from bind until the runtime is live) so the post-boot handoff can replay it
// and open the popover without a second hover. A move off the surface clears
// the handoff so a stale position is never replayed.
function trackHostedRuntimeHoverHandoff(targets: HTMLElement[]): void {
    hostedRuntimeHoverHandoffController?.abort();
    const controller = new AbortController();
    hostedRuntimeHoverHandoffController = controller;
    hostedRuntimeHoverHandoff = undefined;
    const track = (event: PointerEvent): void => {
        if (event.pointerType === 'touch') return;
        if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return;
        const target = event.target instanceof Element ? event.target : null;
        const word = target?.closest<HTMLElement>('.jpdb-reader-word') ?? null;
        hostedRuntimeHoverHandoff = word && targets.some(surface => surface.contains(word))
            ? { x: event.clientX, y: event.clientY }
            : undefined;
    };
    window.addEventListener('pointermove', track, { passive: true, signal: controller.signal });
    window.addEventListener('pointerover', track, { passive: true, signal: controller.signal });
}

function clearHostedRuntimeHoverHandoff(): void {
    hostedRuntimeHoverHandoffController?.abort();
    hostedRuntimeHoverHandoffController = undefined;
    hostedRuntimeHoverHandoff = undefined;
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
    if (!shouldInstallHostedReaderRuntime(forceLocalRuntime)) return true;
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
    armHostedRuntimeHoverHandoff();
    return script;
}

// Once the reader boots, replay whatever demo word the pointer is resting on so
// its popover opens without a second hover. The pointer tracker keeps updating
// through the whole boot window (a hover often arrives during the async load),
// so this stays armed regardless of what triggered the boot. Generic across
// every demo surface; a no-op unless the pointer ends up on a demo word.
function armHostedRuntimeHoverHandoff(): void {
    const controller = new AbortController();
    let done = false;
    const cleanup = (): void => {
        if (done) return;
        done = true;
        controller.abort();
        window.clearInterval(poll);
        window.clearTimeout(timeout);
    };
    const tryReplay = (): void => {
        if (done || !hostedYomuRuntimeWindow().__yomuReaderAppInitialized) return;
        cleanup();
        // Let the reader's first page scan settle before replaying — a hover
        // lookup fired into the middle of the initial scan is dropped.
        window.setTimeout(() => window.requestAnimationFrame(replayHostedRuntimeHoverHandoff), 250);
    };
    window.addEventListener('yomu-extension-loaded', () => window.requestAnimationFrame(tryReplay), {
        once: true,
        signal: controller.signal,
    });
    // Fallbacks: the ready event can precede this listener, and the local dev
    // runtime never dispatches it. Poll briefly, then give up so a stale gesture
    // is never replayed into an unrelated page state.
    const poll = window.setInterval(tryReplay, 100);
    const timeout = window.setTimeout(cleanup, 6000);
    tryReplay();
}

function replayHostedRuntimeHoverHandoff(): void {
    const point = hostedRuntimeHoverHandoff;
    clearHostedRuntimeHoverHandoff();
    if (!point) return;
    const target = document.elementFromPoint(point.x, point.y);
    if (!(target instanceof Element) || !target.closest('.jpdb-reader-word')) return;
    // Dispatch on the leaf under the pointer (not the word wrapper) so the
    // reader's capture-phase hover handler sees the same event.target a real
    // pointer would. pointerover then pointermove mirrors a genuine hover, which
    // the reader's move-driven lookup requires.
    const shared: PointerEventInit = { bubbles: true, cancelable: true, view: window, clientX: point.x, clientY: point.y, pointerType: 'mouse' };
    target.dispatchEvent(hostedPointerEvent('pointerover', shared));
    target.dispatchEvent(hostedPointerEvent('pointermove', shared));
}

// PointerEvent exists in every browser the docs runtime hovers in, but fall back
// to MouseEvent so the replay still fires in a stripped-down webview.
function hostedPointerEvent(type: string, init: PointerEventInit): Event {
    if (typeof PointerEvent === 'function') return new PointerEvent(type, init);
    return new MouseEvent(type, init);
}

function prepareHostedDemoVideoSettings(): void {
    if (!document.querySelector('[data-yomu-demo-player]')) return;
    // Demo-player staging only: never replicate these into the shared GM store.
    writeStoredSettingsPatch(HOSTED_DEMO_VIDEO_SETTINGS_PATCH, { shared: false });
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
    if (!shouldInstallHostedReaderRuntime(forceLocalRuntime)) return true;
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

// Companion registration is read lazily by the reader, so appending the full
// companion set after the core script keeps docs first paint lean while still
// giving the demo popup its settings dialog, Immersion Kit examples, mining
// drawer, and Anki sections.
function appendHostedSettingsCompanionAfterCoreLoad(script: HTMLScriptElement, forceLocalRuntime: boolean): void {
    const append = () => appendHostedRuntimeCompanionScripts(forceLocalRuntime);
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
        // The kanji-study companion carries the Immersion Kit example client,
        // its popup controller, and the mining drawer helpers; the anki
        // companion carries the popup Anki sections. Without them the hosted
        // demo popup shows "Loading examples..." forever and a mining drawer
        // handle that can never open (the video-player and PDF pages already
        // load both — this list is the homepage/docs demo).
        {
            id: YOMU_HOSTED_KANJI_STUDY_COMPANION_SCRIPT_ID,
            src: hostedRuntimeAssetSrc('/greasyfork/yomu-kanji-study.user.js', forceLocalRuntime),
        },
        {
            id: YOMU_HOSTED_ANKI_COMPANION_SCRIPT_ID,
            src: hostedRuntimeAssetSrc('/greasyfork/yomu-anki.user.js', forceLocalRuntime),
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
    const separator = src.includes('?') ? '&' : '?';
    if (!forceLocalRuntime) return `${src}${separator}v=${encodeURIComponent(HOSTED_RUNTIME_VERSION)}`;
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
        // Delegated from document, so it survives VitePress's client-side route
        // changes without re-binding per page. Guarded because enhanceApp also
        // runs during SSR, where there is no document to listen on.
        if (typeof document !== 'undefined') installMembershipPopover();
    },
} satisfies Theme;
