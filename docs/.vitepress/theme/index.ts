import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { defineComponent, h, onMounted } from 'vue';
import './custom.css';

type InterfaceLanguage = 'en' | 'ja';

const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
const LANGUAGE_EVENT = 'yomu-interface-language-change';
const LANGUAGE_TOGGLE_ID = 'yomu-hud-language-toggle';
const YOMU_HOSTED_RUNTIME_SCRIPT_ID = 'yomu-hosted-demo-runtime';
const textNodeOriginals = new WeakMap<Text, string>();
const attrOriginals = new WeakMap<Element, Map<string, string>>();
let languageToggleObserver: MutationObserver | undefined;
let routeSyncBound = false;

const HOSTED_DOCS_JA_COPY: Record<string, string> = {
    'Skip to content': '本文へスキップ',
    'Search': '検索',
    'Main Navigation': 'メインナビゲーション',
    'Start': '始める',
    'Overview': '概要',
    'Getting Started': '使い始める',
    'Features': '機能',
    'New Tab': '新しいタブ',
    'More': 'その他',
    'Video Player': '動画プレイヤー',
    'Local Audio': 'ローカル音声',
    'Support': 'サポート',
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
        localizeHostedDocsCopy();
    });
    languageToggleObserver.observe(document.body, { childList: true, subtree: true });
}

function syncHostedLanguageToggle() {
    const target = document.querySelector<HTMLElement>('.VPNavBar .content-body');
    if (!target) return;
    const appearance = target.querySelector<HTMLElement>('.VPNavBarAppearance');
    const existing = document.getElementById(LANGUAGE_TOGGLE_ID) as HTMLButtonElement | null;
    const button = existing ?? createHostedLanguageToggle();
    if (!button.isConnected) target.insertBefore(button, appearance ?? target.firstChild);
    syncHostedLanguageToggleButton(button);
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
        localizeHostedDocsCopy();
    });
    return button;
}

function syncHostedLanguageToggleButton(button: HTMLButtonElement): void {
    const next = nextInterfaceLanguage();
    const current = effectiveInterfaceLanguage();
    const lang = next === 'ja' ? 'ja' : 'en';
    const text = next === 'ja' ? 'あ' : 'A';
    const label = languageToggleLabel(current, next);
    if (button.lang !== lang) button.lang = lang;
    if (button.textContent !== text) button.textContent = text;
    if (button.hasAttribute('title')) button.removeAttribute('title');
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
}

function languageToggleLabel(current: InterfaceLanguage, next: InterfaceLanguage): string {
    if (current === 'ja') return next === 'ja' ? 'Yomu HUDを日本語に切り替え' : 'Yomu HUDを英語に切り替え';
    return next === 'ja' ? 'Switch Yomu HUD to Japanese' : 'Switch Yomu HUD to English';
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

function localizeHostedDocsCopy(): void {
    const language = effectiveInterfaceLanguage();
    document.documentElement.setAttribute('lang', language);
    translateTextNodes(document.body, language);
    translateAttributes(document.body, language);
}

function scheduleHostedDocsLocalization(): void {
    window.requestAnimationFrame(() => {
        localizeHostedDocsCopy();
        window.setTimeout(localizeHostedDocsCopy, 80);
    });
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
        ['aria-label', 'title', 'alt', 'placeholder'].forEach(attr => {
            const value = element.getAttribute(attr);
            if (!value) return;
            const originals = attrOriginals.get(element) ?? new Map<string, string>();
            if (!attrOriginals.has(element)) attrOriginals.set(element, originals);
            const original = originals.get(attr) ?? value;
            originals.set(attr, original);
            element.setAttribute(attr, translateHostedDocsString(original, language));
        });
    });
}

function translateHostedDocsString(value: string, language: InterfaceLanguage): string {
    if (language !== 'ja') return value;
    const leading = value.match(/^\s*/)?.[0] ?? '';
    const trailing = value.match(/\s*$/)?.[0] ?? '';
    const core = value.trim();
    return HOSTED_DOCS_JA_COPY[core] ? `${leading}${HOSTED_DOCS_JA_COPY[core]}${trailing}` : value;
}

function shouldSkipHostedDocsNode(element: Element): boolean {
    return Boolean(element.closest('script, style, pre, code, kbd, samp, textarea, input'));
}

function readStoredSettings(): Record<string, any> {
    try {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');
        return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
    } catch {
        return {};
    }
}

function browserPrefersJapanese(): boolean {
    const languages = [...(navigator.languages ?? []), navigator.language];
    return languages.some(language => language?.toLowerCase().startsWith('ja'));
}

function installHostedDocsEnhancements(): void {
    syncLandmarks();
    installHostedLanguageToggle();
    localizeHostedDocsCopy();
    scheduleHostedDocsLocalization();
    installHostedYomuRuntime();
    if (routeSyncBound) return;
    routeSyncBound = true;
    window.addEventListener(LANGUAGE_EVENT, () => {
        syncHostedLanguageToggle();
        scheduleHostedDocsLocalization();
    });
    window.addEventListener('hashchange', () => window.requestAnimationFrame(() => {
        syncLandmarks();
        syncHostedLanguageToggle();
        scheduleHostedDocsLocalization();
        installHostedYomuRuntime();
    }));
    window.addEventListener('popstate', () => window.requestAnimationFrame(() => {
        syncLandmarks();
        syncHostedLanguageToggle();
        scheduleHostedDocsLocalization();
        installHostedYomuRuntime();
    }));
}

function installHostedYomuRuntime(): void {
    const runtime = window as typeof window & { __yomuReaderAppInitialized?: boolean };
    if (runtime.__yomuReaderAppInitialized || document.getElementById(YOMU_HOSTED_RUNTIME_SCRIPT_ID)) return;
    const script = document.createElement('script');
    script.id = YOMU_HOSTED_RUNTIME_SCRIPT_ID;
    script.src = '/yomu-reader/yomu.user.js';
    script.async = true;
    document.head.append(script);
}

const YomuLayout = defineComponent({
    name: 'YomuLayout',
    setup(_, { slots }) {
        onMounted(installHostedDocsEnhancements);
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
