import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { defineComponent, h, onMounted } from 'vue';
import './custom.css';

type InterfaceLanguage = 'en' | 'ja';

const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
const SETTINGS_CHANGE_EVENT = 'yomu-settings-change';
const OPEN_SETTINGS_EVENT = 'yomu-open-settings';
const LANGUAGE_EVENT = 'yomu-interface-language-change';
const HOSTED_DEMO_LOOKUP_SCAN_EVENT = 'yomu-hosted-demo-lookup-scan';
const LANGUAGE_TOGGLE_ID = 'yomu-hud-language-toggle';
const YOMU_HOSTED_RUNTIME_SCRIPT_ID = 'yomu-hosted-demo-runtime';
const DEFAULT_ACCENT_COLOR = '#5ea780';
const HOSTED_OVERFLOW_SELECTOR = '[data-yomu-hosted-overflow]';
const textNodeOriginals = new WeakMap<Text, string>();
const attrOriginals = new WeakMap<Element, Map<string, string>>();
let languageToggleObserver: MutationObserver | undefined;
let accentSyncBound = false;
let themeClassObserver: MutationObserver | undefined;
let routeSyncBound = false;

const HOSTED_OVERFLOW_LINKS = [
    { text: 'Video Player', href: '/yomu-reader/video-player/index.html', target: '_self' },
    { text: 'Local Audio', href: '/yomu-reader/local-audio' },
    { text: 'Stats', href: '/yomu-reader/newtab/index.html?mode=stats', target: '_self' },
    { text: 'Changelog', href: '/yomu-reader/changelog' },
] as const;

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
        localizeHostedDocsCopy();
        syncHostedAccent();
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

function installHostedOverflowMenu() {
    syncHostedOverflowMenu();
}

function syncHostedOverflowMenu() {
    const extra = document.querySelector<HTMLElement>('.VPNavBarExtra');
    if (!extra) return;
    extra.classList.add('yomu-hosted-extra');
    const button = extra.querySelector<HTMLButtonElement>(':scope > button.button');
    if (button) {
        button.setAttribute('aria-label', translateHostedDocsString('Menu', effectiveInterfaceLanguage()));
        button.removeAttribute('title');
    }

    const menu = extra.querySelector<HTMLElement>('.VPMenu');
    if (!menu) return;
    if (!menu.querySelector(HOSTED_OVERFLOW_SELECTOR)) menu.prepend(createHostedOverflowGroup());
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

function createHostedOverflowLink(item: typeof HOSTED_OVERFLOW_LINKS[number]): HTMLAnchorElement {
    const link = document.createElement('a');
    link.className = 'yomu-hosted-overflow-link';
    link.href = item.href;
    link.textContent = item.text;
    if (item.target) link.target = item.target;
    return link;
}

function openHostedSettings(): void {
    installHostedYomuRuntime();
    const dispatch = () => {
        if (document.querySelector('.jpdb-reader-settings')) return true;
        window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { panel: 'basics' } }));
        return Boolean(document.querySelector('.jpdb-reader-settings'));
    };
    dispatch();
    [120, 360, 900].forEach(delay => window.setTimeout(dispatch, delay));
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
        if (shouldSkipHostedDocsNode(element)) return;
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
    return Boolean(element.closest('script, style, pre, code, kbd, samp, textarea, input, [data-jpdb-reader-root], .jpdb-reader-word, .jpdb-reader-furigana, .jpdb-reader-ruby, .jpdb-ocr-layer, .jpdb-ocr-line'));
}

function readStoredSettings(): Record<string, any> {
    try {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');
        return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
    } catch {
        return {};
    }
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
    const pageBackground = dark ? '#181b20' : '#ffffff';
    const brandReadable = readableOn(accent, pageBackground, 4.5);
    const brandHover = readableOn(mixHex(accent, dark ? '#ffffff' : '#000000', 0.18), pageBackground, 3.5);
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

function readableTextOn(background: string): '#11161d' | '#ffffff' {
    return contrastRatio(background, '#11161d') >= contrastRatio(background, '#ffffff') ? '#11161d' : '#ffffff';
}

function readableOn(color: string, background: string, targetContrast: number): string {
    const safe = sanitizeHostedAccent(color);
    if (contrastRatio(safe, background) >= targetContrast) return safe;
    const toward = contrastRatio(background, '#000000') > contrastRatio(background, '#ffffff') ? '#000000' : '#ffffff';
    for (let amount = 0.08; amount <= 1; amount += 0.08) {
        const mixed = mixHex(safe, toward, amount);
        if (contrastRatio(mixed, background) >= targetContrast) return mixed;
    }
    return toward;
}

function contrastRatio(a: string, b: string): number {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(color: string): number {
    const [red, green, blue] = hexToRgb(color).map(value => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function mixHex(from: string, to: string, amount: number): string {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(color: string): [number, number, number] {
    const safe = sanitizeHostedAccent(color);
    return [
        parseInt(safe.slice(1, 3), 16),
        parseInt(safe.slice(3, 5), 16),
        parseInt(safe.slice(5, 7), 16),
    ];
}

function hexToRgba(color: string, alpha: number): string {
    const [red, green, blue] = hexToRgb(color);
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha)).toFixed(2)})`;
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
    installHostedYomuRuntime();
    scheduleHostedDemoLookupScan();
    if (routeSyncBound) return;
    routeSyncBound = true;
    window.addEventListener(LANGUAGE_EVENT, () => {
        syncHostedLanguageToggle();
        syncHostedOverflowMenu();
        scheduleHostedDocsLocalization();
    });
    window.addEventListener('hashchange', () => window.requestAnimationFrame(() => {
        syncLandmarks();
        syncHostedLanguageToggle();
        syncHostedOverflowMenu();
        scheduleHostedDocsLocalization();
        installHostedYomuRuntime();
        scheduleHostedDemoLookupScan();
        syncHostedAccent();
    }));
    window.addEventListener('popstate', () => window.requestAnimationFrame(() => {
        syncLandmarks();
        syncHostedLanguageToggle();
        syncHostedOverflowMenu();
        scheduleHostedDocsLocalization();
        installHostedYomuRuntime();
        scheduleHostedDemoLookupScan();
        syncHostedAccent();
    }));
}

function scheduleHostedDemoLookupScan(): void {
    window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent(HOSTED_DEMO_LOOKUP_SCAN_EVENT));
    });
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
