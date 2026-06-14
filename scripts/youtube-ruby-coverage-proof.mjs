#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const outputRoot = resolve(process.env.YOMU_YOUTUBE_RUBY_PROOF_DIR ?? join(appRoot, 'qa-artifacts/youtube-ruby-coverage-proof'));
const bundlePath = join(outputRoot, 'proof-runner.bundle.js');
const reportPath = join(outputRoot, 'youtube-ruby-coverage-report.json');
const videoPath = join(outputRoot, 'youtube-ruby-coverage-proof.webm');
const cssPath = join(appRoot, 'dist/yomu.css');
const vocabularyIndexSeed = vocabularyIndexes();

const vocabulary = [
    word('完全独学', 'かんぜんどくがく', 'nakadaka'),
    word('留学', 'りゅうがく', 'heiban'),
    word('お金', 'おかね', 'heiban'),
    word('家', 'いえ', 'odaka'),
    word('英語', 'えいご', 'heiban'),
    word('話せる', 'はなせる', 'nakadaka'),
    word('方法', 'ほうほう', 'heiban'),
    word('字幕', 'じまく', 'heiban'),
    word('表示', 'ひょうじ', 'heiban'),
    word('東京', 'とうきょう', 'heiban'),
    word('散歩', 'さんぽ', 'heiban'),
    word('春', 'はる', 'atamadaka'),
    word('コーデ', 'こーで', 'heiban'),
    word('朝ごはん', 'あさごはん', 'heiban'),
    word('朝', 'あさ', 'atamadaka'),
    word('ニュース', 'にゅーす', 'heiban'),
    word('最新', 'さいしん', 'heiban'),
    word('情報', 'じょうほう', 'heiban'),
    word('日本語', 'にほんご', 'heiban'),
    word('読む', 'よむ', 'heiban'),
    word('投資', 'とうし', 'heiban'),
    word('貯金', 'ちょきん', 'heiban'),
    word('勉強', 'べんきょう', 'heiban'),
    word('復習', 'ふくしゅう', 'heiban'),
    word('用', 'よう', 'heiban'),
    word('説明文', 'せつめいぶん', 'heiban'),
    word('説明', 'せつめい', 'heiban'),
    word('先生', 'せんせい', 'heiban'),
    word('今日', 'きょう', 'heiban'),
    word('配信', 'はいしん', 'heiban'),
    word('質問', 'しつもん', 'heiban'),
    word('関連動画', 'かんれんどうが', 'heiban'),
    word('発行', 'はっこう', 'heiban'),
    word('文字起こし', 'もじおこし', 'heiban'),
    word('タイトル', 'たいとる', 'heiban'),
    word('前', 'まえ', 'heiban'),
    word('新卒', 'しんそつ', 'heiban'),
    word('エンジニア', 'えんじにあ', 'heiban'),
    word('仕事', 'しごと', 'heiban'),
    word('終わり', 'おわり', 'heiban'),
    word('京都', 'きょうと', 'heiban'),
    word('大阪', 'おおさか', 'heiban'),
    word('食べ歩き', 'たべあるき', 'heiban'),
    word('カフェ', 'かふぇ', 'heiban'),
];

const longWatchTitle = '【完全独学】留学なし・お金をかけずに家で英語を話せるようになった方法｜日本語でニュースを読む勉強と投資と貯金の方法';

const pages = [
    {
        name: 'desktop-home',
        url: 'https://www.youtube.com/',
        viewport: { width: 1280, height: 900 },
        html: youtubeShell(`
            <ytd-app>
              <ytd-masthead class="topbar"><strong>YouTube</strong><button data-proof-hidden>字幕を表示</button></ytd-masthead>
              <ytd-rich-grid-renderer class="grid">
                <ytd-rich-item-renderer class="card">
                  <div class="thumb"></div>
                  <a id="video-title-link" class="title clamped" href="/watch?v=home1" data-proof-target data-proof-text="完全独学で英語を話せる方法">完全独学で英語を話せる方法</a>
                </ytd-rich-item-renderer>
                <ytd-rich-item-renderer class="card">
                  <div class="thumb"></div>
                  <a id="video-title-link" class="title" href="/watch?v=home2">
                    <yt-touch-feedback-shape aria-hidden="true" data-proof-hidden><div>押下中</div></yt-touch-feedback-shape>
                    <span data-proof-target data-proof-text="東京散歩と春コーデ">東京散歩と春コーデ</span>
                  </a>
                </ytd-rich-item-renderer>
                <yt-lockup-view-model class="card">
                  <div class="thumb"></div>
                  <yt-lockup-metadata-view-model>
                    <a class="ytLockupMetadataViewModelTitle title" href="/watch?v=home3" data-proof-target data-proof-text="朝のニュース最新情報">朝のニュース最新情報</a>
                  </yt-lockup-metadata-view-model>
                </yt-lockup-view-model>
              </ytd-rich-grid-renderer>
            </ytd-app>
        `),
    },
    {
        name: 'desktop-search',
        url: 'https://www.youtube.com/results?search_query=%E6%97%A5%E6%9C%AC%E8%AA%9E',
        viewport: { width: 1280, height: 900 },
        html: youtubeShell(`
            <ytd-app>
              <ytd-search>
                <ytd-two-column-search-results-renderer class="list">
                  <ytd-video-renderer class="row">
                    <div class="thumb"></div>
                    <a id="video-title" class="title" href="/watch?v=search1" data-proof-target data-proof-text="日本語でニュースを読む">日本語でニュースを読む</a>
                  </ytd-video-renderer>
                  <ytd-video-renderer class="row">
                    <div class="thumb"></div>
                    <a id="video-title" class="title" href="/watch?v=search2" data-proof-target data-proof-text="英語を話せる方法">英語を話せる方法</a>
                  </ytd-video-renderer>
                  <yt-lockup-view-model class="row">
                    <div class="thumb"></div>
                    <yt-lockup-metadata-view-model>
                      <a class="ytLockupMetadataViewModelTitle title" href="/watch?v=search3" data-proof-target data-proof-text="投資と貯金の勉強">投資と貯金の勉強</a>
                    </yt-lockup-metadata-view-model>
                  </yt-lockup-view-model>
                </ytd-two-column-search-results-renderer>
              </ytd-search>
            </ytd-app>
        `),
    },
    {
        name: 'desktop-watch',
        url: 'https://www.youtube.com/watch?v=proof',
        viewport: { width: 1365, height: 950 },
        html: youtubeShell(`
            <ytd-watch-flexy>
              <main class="watch">
                <section>
                  <div class="player">YouTube watch fixture</div>
                  <ytd-watch-metadata>
                    <h1 class="style-scope ytd-watch-metadata watch-title-clamped" data-proof-target data-proof-text="${longWatchTitle}" data-proof-expect-ruby-room="true">
                      <yt-formatted-string force-default-style="" class="style-scope ytd-watch-metadata" title="${longWatchTitle}">${longWatchTitle}</yt-formatted-string>
                    </h1>
                    <div id="description-inline-expander" data-proof-target data-proof-text="復習用の説明で日本語を勉強します">復習用の説明で日本語を勉強します</div>
                    <button type="button">
                      <yt-touch-feedback-shape aria-hidden="true" class="ytSpecTouchFeedbackShapeHost ytSpecTouchFeedbackShapeTouchResponse" data-proof-hidden><div>押下中</div></yt-touch-feedback-shape>
                      <span data-proof-hidden>字幕を表示</span>
                    </button>
                  </ytd-watch-metadata>
                  <ytd-comments>
                    <ytd-comment-view-model>
                      <yt-attributed-string id="content-text" data-proof-target data-proof-text="先生いつもありがとうございました">先生いつもありがとうございました</yt-attributed-string>
                    </ytd-comment-view-model>
                  </ytd-comments>
                  <yt-live-chat-text-message-renderer>
                    <span id="message" data-proof-target data-proof-text="今日は配信で質問します">今日は配信で質問します</span>
                  </yt-live-chat-text-message-renderer>
                </section>
                <aside id="secondary">
                  <ytd-compact-video-renderer class="compact">
                    <div class="mini-thumb"></div>
                    <a id="video-title" href="/watch?v=side" data-proof-target data-proof-text="関連動画の発行ニュース">関連動画の発行ニュース</a>
                  </ytd-compact-video-renderer>
                </aside>
              </main>
            </ytd-watch-flexy>
        `),
    },
    {
        name: 'mobile-watch',
        url: 'https://m.youtube.com/watch?v=proof',
        viewport: { width: 390, height: 844 },
        html: youtubeShell(`
            <ytm-app>
              <main class="mobile">
                <div class="player mobile-player">Mobile watch fixture</div>
                <ytm-slim-video-metadata-section-renderer>
                  <h1><span class="slim-video-metadata-title" data-proof-target data-proof-text="日本語タイトルと字幕">日本語タイトルと字幕</span></h1>
                  <div class="slim-video-metadata-info">52,551回視聴 2026/06/12</div>
                  <ytm-button-renderer><button data-proof-hidden>文字起こしを表示</button></ytm-button-renderer>
                </ytm-slim-video-metadata-section-renderer>
                <ytm-expandable-video-description-body-renderer>
                  <p data-proof-target data-proof-text="説明文で復習します">説明文で復習します</p>
                </ytm-expandable-video-description-body-renderer>
                <ytm-comment-section-renderer>
                  <ytm-comment-renderer><span id="content-text" data-proof-target data-proof-text="質問する前に勉強します">質問する前に勉強します</span></ytm-comment-renderer>
                </ytm-comment-section-renderer>
              </main>
            </ytm-app>
        `),
    },
    {
        name: 'mobile-feed',
        url: 'https://m.youtube.com/',
        viewport: { width: 390, height: 844 },
        html: youtubeShell(`
            <ytm-app>
              <ytm-rich-grid-renderer class="mobile-grid">
                <ytm-video-with-context-renderer class="mobile-card">
                  <a class="media-item-thumbnail-container" href="/watch?v=mobile1"></a>
                  <h3 class="media-item-headline"><a href="/watch?v=mobile1" class="title clamped mobile-title" data-proof-target data-proof-text="新卒エンジニアが仕事終わりに勉強する方法">新卒エンジニアが仕事終わりに勉強する方法</a></h3>
                </ytm-video-with-context-renderer>
                <ytm-video-with-context-renderer class="mobile-card">
                  <a class="media-item-thumbnail-container" href="/watch?v=mobile2"></a>
                  <h3 class="media-item-headline"><a href="/watch?v=mobile2" class="title" data-proof-target data-proof-text="東京散歩と春コーデ">東京散歩と春コーデ</a></h3>
                </ytm-video-with-context-renderer>
                <ytm-shorts-lockup-view-model class="short-card">
                  <a class="shortsLockupViewModelHostEndpoint" href="/shorts/mobile3">
                    <span class="short-thumb"></span>
                    <span class="shortsLockupViewModelHostMetadataTitle title" data-proof-target data-proof-text="京都で朝ごはん">京都で朝ごはん</span>
                  </a>
                </ytm-shorts-lockup-view-model>
              </ytm-rich-grid-renderer>
            </ytm-app>
        `),
    },
    {
        name: 'shorts-gallery',
        url: 'https://www.youtube.com/feed/shorts',
        viewport: { width: 430, height: 932 },
        html: youtubeShell(`
            <ytd-app>
              <ytd-rich-grid-renderer class="shorts-grid">
                <ytd-reel-item-renderer class="short-card">
                  <a class="short-thumb" href="/shorts/one"></a>
                  <a id="video-title" class="title" href="/shorts/one" data-proof-target data-proof-text="大阪で食べ歩き">大阪で食べ歩き</a>
                </ytd-reel-item-renderer>
                <ytd-reel-item-renderer class="short-card">
                  <a class="short-thumb" href="/shorts/two"></a>
                  <a id="video-title" class="title" href="/shorts/two" data-proof-target data-proof-text="京都の朝カフェ">京都の朝カフェ</a>
                </ytd-reel-item-renderer>
              </ytd-rich-grid-renderer>
            </ytd-app>
        `),
    },
];

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });
await buildProofRunner();

const browser = await chromium.launch({ headless: process.env.YOMU_YOUTUBE_RUBY_PROOF_HEADED !== '1' });
const context = await browser.newContext({
    bypassCSP: true,
    locale: 'ja-JP',
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: outputRoot, size: { width: 1280, height: 900 } },
});

const page = await context.newPage();
const video = page.video();
const report = {
    generatedAt: new Date().toISOString(),
    outputRoot,
    pages: [],
    pass: false,
};

try {
    await routeProofPages(page);
    for (const spec of pages) {
        await page.setViewportSize(spec.viewport);
        await page.goto(spec.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.addStyleTag({ content: proofCss() });
        await page.addScriptTag({ path: bundlePath });
        const result = await runProofAcrossScroll(page);
        const screenshotPath = join(outputRoot, `${spec.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        report.pages.push({
            name: spec.name,
            url: spec.url,
            viewport: spec.viewport,
            screenshotPath,
            ...result,
        });
    }
    report.pass = report.pages.every(item => item.pass);
} finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
}

const rawVideoPath = video ? await video.path().catch(() => null) : null;
if (rawVideoPath && existsSync(rawVideoPath)) renameSync(rawVideoPath, videoPath);
report.videoPath = existsSync(videoPath) ? videoPath : rawVideoPath;
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
    pass: report.pass,
    reportPath,
    videoPath: report.videoPath,
    screenshots: report.pages.map(pageReport => pageReport.screenshotPath),
    failures: report.pages.flatMap(pageReport => pageReport.failures.map(message => `${pageReport.name}: ${message}`)),
}, null, 2));

if (!report.pass) process.exitCode = 1;

function word(surface, reading, pitchClass) {
    const index = vocabularyIndexSeed.next().value;
    return {
        surface,
        spelling: surface,
        reading,
        pitchClass,
        pitchAccent: ['LHH'],
        partOfSpeech: ['n'],
        vid: 5000 + index,
        sid: 7000 + index,
    };
}

function* vocabularyIndexes() {
    let index = 0;
    while (true) yield index++;
}

function youtubeShell(body) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube Ruby Proof</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, "Noto Sans JP", sans-serif; }
    ytd-app, ytm-app, ytd-watch-flexy, ytd-rich-grid-renderer, ytd-rich-item-renderer, ytd-video-renderer,
    ytd-compact-video-renderer, yt-lockup-view-model, yt-lockup-metadata-view-model, ytm-rich-grid-renderer,
    ytm-video-with-context-renderer, ytm-shorts-lockup-view-model, ytd-reel-item-renderer, ytm-slim-video-metadata-section-renderer,
    ytd-watch-metadata, ytd-comments, ytd-comment-view-model, yt-live-chat-text-message-renderer { display: block; }
    .proof-status { position: sticky; top: 0; z-index: 10; padding: 12px 18px; background: #123d24; border-bottom: 2px solid #65d184; font-size: 14px; font-weight: 700; }
    .topbar { height: 64px; display: flex; align-items: center; gap: 18px; padding: 0 24px; background: #0f0f0f; }
    button { border: 1px solid #555; border-radius: 18px; background: #2a2a2a; color: #f1f1f1; padding: 8px 14px; font: inherit; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(260px, 1fr)); gap: 26px; padding: 26px; }
    .list { display: grid; gap: 20px; padding: 28px; }
    .row { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 18px; align-items: start; }
    .card { min-width: 0; }
    .thumb, .player, .mini-thumb, .media-item-thumbnail-container, .short-thumb { background: #303030; border-radius: 10px; }
    .thumb { aspect-ratio: 16 / 9; margin-bottom: 12px; }
    .mini-thumb { width: 150px; min-height: 84px; }
    .player { min-height: 410px; display: grid; place-items: center; color: #aaa; margin-bottom: 18px; }
    .mobile-player { min-height: 220px; }
    .title, #video-title, #video-title-link { color: #f1f1f1; text-decoration: none; font-size: 22px; line-height: 1.35; font-weight: 700; }
    .clamped { display: block; overflow: hidden; height: 44px; max-height: 44px; }
    .watch { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 24px; padding: 28px; }
    ytd-watch-metadata h1 { margin: 0 0 18px; font-size: 25px; line-height: 1.35; }
    .watch-title-clamped { display: block; overflow: hidden; height: 38px; max-height: 38px; max-width: 760px; }
    #description-inline-expander { background: #272727; border-radius: 8px; padding: 14px; margin: 14px 0; line-height: 1.6; }
    ytd-comment-view-model, yt-live-chat-text-message-renderer { padding: 14px 0; border-top: 1px solid #333; line-height: 1.6; }
    .compact { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; margin-bottom: 16px; }
    .mobile { padding: 14px; }
    .mobile h1 { font-size: 20px; line-height: 1.35; }
    .mobile-grid { display: grid; gap: 20px; padding: 12px; }
    .mobile-card { min-height: 230px; }
    .mobile-title { font-size: 17px; }
    .media-item-thumbnail-container { display: block; aspect-ratio: 16 / 9; margin-bottom: 10px; }
    .shorts-grid { display: grid; grid-template-columns: repeat(2, minmax(150px, 1fr)); gap: 18px; padding: 22px; }
    .short-card .short-thumb, .short-thumb { display: block; aspect-ratio: 9 / 16; margin-bottom: 10px; }
    [aria-hidden="true"] { pointer-events: none; }
    [data-proof-hidden] { display: none !important; }
  </style>
</head>
<body>
  <div class="proof-status" data-proof-status>Ruby coverage proof pending</div>
  ${body}
</body>
</html>`;
}

async function routeProofPages(page) {
    const byUrl = new Map(pages.map(spec => [spec.url, spec]));
    await page.route('**/*', route => {
        const requestUrl = route.request().url();
        const spec = byUrl.get(requestUrl);
        return route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: spec?.html ?? youtubeShell('<main></main>'),
        });
    });
}

async function runProofAcrossScroll(page) {
    let result = null;
    const viewport = page.viewportSize() ?? { width: 1280, height: 900 };
    const scrollHeight = await page.evaluate(() => Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.scrollingElement?.scrollHeight ?? 0,
    ));
    const maxY = Math.max(0, scrollHeight - viewport.height);
    const step = Math.max(240, Math.floor(viewport.height * 0.72));
    const stops = new Set([0, maxY]);
    for (let y = 0; y < maxY; y += step) stops.add(Math.min(maxY, y));
    for (const y of [...stops].sort((a, b) => a - b)) {
        await page.evaluate(scrollY => window.scrollTo(0, scrollY), y);
        await page.waitForTimeout(80);
        result = await page.evaluate(options => window.__yomuRubyCoverageProof(options), { vocabulary });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    return result;
}

async function buildProofRunner() {
    await build({
        stdin: {
            contents: browserRunnerSource(),
            resolveDir: appRoot,
            loader: 'ts',
        },
        bundle: true,
        outfile: bundlePath,
        platform: 'browser',
        format: 'iife',
        target: ['chrome120'],
        logLevel: 'silent',
    });
}

function proofCss() {
    const yomuCss = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';
    return `${yomuCss}
:root {
  --jpdb-reader-pitch-heiban: #62d27d;
  --jpdb-reader-pitch-atamadaka: #ff6b6b;
  --jpdb-reader-pitch-nakadaka: #ffd166;
  --jpdb-reader-pitch-odaka: #5bbcff;
  --jpdb-reader-pitch-kifuku: #c084fc;
  --jpdb-reader-pitch-unknown: #999;
  --jpdb-reader-jpdb-color: #8bd3ff;
  --jpdb-reader-jpdb-readable: #e7f7ff;
  --jpdb-reader-muted: #b7b7b7;
}
.jpdb-reader-word-underline-pitch .jpdb-reader-word {
  text-decoration-thickness: 3px !important;
  text-underline-offset: 0.18em !important;
}
.proof-status.pass { background: #123d24; border-color: #65d184; }
.proof-status.fail { background: #4a1414; border-color: #ff7777; }
`;
}

function browserRunnerSource() {
    return `
import { collectScanTargets } from './src/reader/app/site-parsers.ts';
import { applyTokensToScanTarget, makeRoomForRubyInCroppedRows, readerWordSurfaceText } from './src/reader/dom/index.ts';
import { DEFAULT_SETTINGS } from './src/reader/settings/index.ts';

const HAS_JAPANESE = /[\\u3040-\\u30ff\\u3400-\\u9fff]/u;
const HAN_RE = /\\p{Script=Han}/u;
const CONCRETE_PITCH_CLASSES = new Set(['heiban', 'atamadaka', 'nakadaka', 'odaka', 'kifuku']);

window.__yomuRubyCoverageProof = function runRubyCoverageProof(options) {
    const vocabulary = [...options.vocabulary].sort((a, b) => b.surface.length - a.surface.length);
    document.documentElement.classList.add('jpdb-reader-word-underline-pitch', 'jpdb-reader-word-text-jpdb');
    const targets = collectScanTargets(800, location.href).filter(target => HAS_JAPANESE.test(target.text));
    const targetSnapshots = targets.map(target => ({
        text: target.text,
        tokenSurfaces: tokensForText(target.text, vocabulary).map(token => token.card.spelling),
    }));

    for (const target of targets) {
        const tokens = tokensForText(target.text, vocabulary);
        if (tokens.length) applyTokensToScanTarget(target, tokens, {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'all',
            wordTextColorSource: 'jpdb',
            wordUnderlineColorSource: 'pitch',
            wordHighlightColorSource: 'off',
        });
    }

    const rubyRoomAdjustments = makeRoomForRubyInCroppedRows(document);
    const proofTargets = visibleProofTargets().map(element => auditProofTarget(element, vocabulary));
    const hiddenFeedback = auditHiddenFeedback(targetSnapshots);
    const renderedWords = renderedWordDetails(document.body);
    const failures = [
        ...proofTargets.flatMap(target => target.failures.map(message => target.label + ': ' + message)),
        ...hiddenFeedback.failures,
    ];
    if (!proofTargets.length) failures.push('no visible proof targets found');
    if (targetSnapshots.some(target => HAS_JAPANESE.test(target.text) && !target.tokenSurfaces.length && !/押下中/.test(target.text))) {
        failures.push('a visible Japanese scan target had no JPDB-shaped token match');
    }
    if (renderedWords.some(word => (word.requiresRuby && !word.hasRuby) || word.source !== 'jpdb' || !CONCRETE_PITCH_CLASSES.has(word.pitchClass))) {
        failures.push('at least one rendered word is missing ruby, JPDB source, or concrete pitch');
    }

    const pass = failures.length === 0;
    const status = document.querySelector('[data-proof-status]');
    if (status) {
        status.classList.toggle('pass', pass);
        status.classList.toggle('fail', !pass);
        status.textContent = (pass ? 'Ruby coverage proof: PASS' : 'Ruby coverage proof: FAIL')
            + ' | targets ' + proofTargets.length
            + ' | words ' + renderedWords.length
            + ' | pitch words ' + renderedWords.filter(word => CONCRETE_PITCH_CLASSES.has(word.pitchClass)).length
            + ' | hidden feedback annotated ' + hiddenFeedback.annotated;
    }

    return {
        pass,
        failures,
        rubyRoomAdjustments,
        scanTargets: targetSnapshots,
        proofTargets,
        hiddenFeedback,
        renderedWords,
    };
};

function tokensForText(text, vocabulary) {
    const tokens = [];
    for (let index = 0; index < text.length;) {
        const entry = vocabulary.find(candidate => text.startsWith(candidate.surface, index));
        if (!entry) {
            index += 1;
            continue;
        }
        tokens.push(tokenForEntry(entry, index, text));
        index += entry.surface.length;
    }
    return tokens;
}

function tokenForEntry(entry, start, sentence) {
    return {
        card: {
            vid: entry.vid,
            sid: entry.sid,
            rid: 0,
            spelling: entry.spelling || entry.surface,
            reading: entry.reading,
            frequencyRank: 1000,
            partOfSpeech: entry.partOfSpeech || ['n'],
            meanings: [],
            cardState: ['known'],
            pitchAccent: entry.pitchAccent || ['LHH'],
            wordWithReading: null,
            source: 'jpdb',
        },
        start,
        end: start + entry.surface.length,
        length: entry.surface.length,
        rubies: [{
            text: entry.reading,
            start,
            end: start + entry.surface.length,
            length: entry.surface.length,
        }],
        pitchClass: entry.pitchClass,
        sentence,
    };
}

function visibleProofTargets() {
    return Array.from(document.querySelectorAll('[data-proof-target]')).filter(isVisibleElement);
}

function auditProofTarget(element, vocabulary) {
    const label = element.getAttribute('data-proof-text') || compactText(element.textContent || '');
    const expectedSurfaces = tokensForText(label, vocabulary).map(token => token.card.spelling);
    const words = renderedWordDetails(element);
    const failures = [];
    const missingSurfaces = missingExpectedSurfaces(expectedSurfaces, words.map(word => word.surface));
    const clipped = isBoxClipped(element);
    const rubyOutOfBounds = outOfBoundsRubyCount(element);
    const uncoveredKanji = uncoveredKanjiForText(label, words.map(word => word.surface));
    const expectedRubyRoom = element.getAttribute('data-proof-expect-ruby-room') === 'true';
    const rubyRoomHeight = Number(element.dataset.yomuRubyRoomHeight || 0);

    if (!expectedSurfaces.length) failures.push('no expected JPDB token surfaces for proof text');
    if (!words.length) failures.push('no rendered reader words');
    if (missingSurfaces.length) failures.push('missing rendered surfaces: ' + missingSurfaces.join(', '));
    if (words.some(word => word.requiresRuby && !word.hasRuby)) failures.push('kanji-bearing rendered word without furigana');
    if (words.some(word => word.source !== 'jpdb')) failures.push('rendered word without JPDB source metadata');
    if (words.some(word => !CONCRETE_PITCH_CLASSES.has(word.pitchClass))) failures.push('rendered word without concrete pitch class');
    if (uncoveredKanji.length) failures.push('uncovered kanji: ' + uncoveredKanji.join(''));
    if (clipped) failures.push('target still has scroll clipping after ruby room sweep');
    if (rubyOutOfBounds) failures.push(rubyOutOfBounds + ' ruby annotations sit outside target bounds');
    if (expectedRubyRoom && element.dataset.yomuRubyRoom !== 'true') failures.push('expected clipped title to receive ruby room');
    if (expectedRubyRoom && rubyRoomHeight <= 38) failures.push('expected clipped title ruby room height to grow beyond the original title height');

    return {
        label,
        text: compactText(element.textContent || ''),
        expectedSurfaces,
        wordCount: words.length,
        rubyWordCount: words.filter(word => word.hasRuby).length,
        jpdbWordCount: words.filter(word => word.source === 'jpdb').length,
        pitchWordCount: words.filter(word => CONCRETE_PITCH_CLASSES.has(word.pitchClass)).length,
        clipped,
        rubyOutOfBounds,
        rubyRoom: element.dataset.yomuRubyRoom || '',
        rubyRoomHeight,
        uncoveredKanji,
        words,
        failures,
    };
}

function renderedWordDetails(root) {
    return Array.from(root.querySelectorAll('.jpdb-reader-word')).filter(isVisibleElement).map(word => ({
        surface: readerWordSurfaceText(word).trim(),
        text: compactText(word.textContent || ''),
        requiresRuby: HAN_RE.test(readerWordSurfaceText(word).trim()),
        hasRuby: Boolean(word.querySelector('rt')),
        rt: Array.from(word.querySelectorAll('rt')).map(rt => rt.textContent || '').join('|'),
        source: word.dataset.cardSource || '',
        pitchClass: word.dataset.pitchClass || '',
        className: word.className,
    }));
}

function missingExpectedSurfaces(expected, actual) {
    const counts = new Map();
    for (const value of actual) counts.set(value, (counts.get(value) || 0) + 1);
    const missing = [];
    for (const value of expected) {
        const count = counts.get(value) || 0;
        if (count <= 0) {
            missing.push(value);
            continue;
        }
        counts.set(value, count - 1);
    }
    return missing;
}

function uncoveredKanjiForText(text, coveredSurfaces) {
    const covered = new Map();
    for (const surface of coveredSurfaces) {
        for (const char of Array.from(surface).filter(char => HAN_RE.test(char))) {
            covered.set(char, (covered.get(char) || 0) + 1);
        }
    }
    const uncovered = [];
    for (const char of Array.from(text).filter(char => HAN_RE.test(char))) {
        const count = covered.get(char) || 0;
        if (count <= 0) {
            uncovered.push(char);
            continue;
        }
        covered.set(char, count - 1);
    }
    return uncovered;
}

function auditHiddenFeedback(scanTargets) {
    const hiddenRoots = Array.from(document.querySelectorAll('[data-proof-hidden]'));
    const annotated = hiddenRoots.reduce((count, root) => count + root.querySelectorAll('.jpdb-reader-word').length, 0);
    const scanned = scanTargets.filter(target => /押下中/.test(target.text)).map(target => target.text);
    const failures = [];
    if (annotated) failures.push('aria-hidden touch feedback received reader words');
    if (scanned.length) failures.push('aria-hidden touch feedback appeared in scan targets');
    return { roots: hiddenRoots.length, annotated, scanned, failures };
}

function isVisibleElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.01) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function isBoxClipped(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const crops = [style.overflow, style.overflowX, style.overflowY].some(value => /hidden|clip|auto|scroll/.test(value));
    return crops && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1);
}

function outOfBoundsRubyCount(element) {
    if (!isPotentialCropBox(element)) return 0;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return 0;
    return Array.from(element.querySelectorAll('rt')).filter(rt => {
        const rubyRect = rt.getBoundingClientRect();
        if (rubyRect.width <= 0 || rubyRect.height <= 0) return true;
        return rubyRect.top < rect.top - 4
            || rubyRect.left < rect.left - 4
            || rubyRect.right > rect.right + 4
            || rubyRect.bottom > rect.bottom + 4;
    }).length;
}

function isPotentialCropBox(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return [style.overflow, style.overflowX, style.overflowY].some(value => /hidden|clip|auto|scroll/.test(value));
}

function compactText(value) {
    return String(value || '').replace(/\\s+/g, ' ').trim();
}
`;
}
