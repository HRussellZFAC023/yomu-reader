#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { launchSmokeBrowser } from './lib/smoke-harness.mjs';

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
    word('観光', 'かんこう', 'heiban'),
    word('発行', 'はっこう', 'heiban'),
    word('文字起こし', 'もじおこし', 'heiban'),
    word('タイトル', 'たいとる', 'heiban'),
    word('前', 'まえ', 'heiban'),
    word('日前', 'にちまえ', 'heiban'),
    word('新卒', 'しんそつ', 'heiban'),
    word('エンジニア', 'えんじにあ', 'heiban'),
    word('仕事', 'しごと', 'heiban'),
    word('終わり', 'おわり', 'heiban'),
    word('京都', 'きょうと', 'heiban'),
    word('大阪', 'おおさか', 'heiban'),
    word('食べ歩き', 'たべあるき', 'heiban'),
    word('カフェ', 'かふぇ', 'heiban'),
    word('動画', 'どうが', 'heiban'),
    word('人気', 'にんき', 'heiban'),
    word('視聴', 'しちょう', 'heiban'),
    word('万', 'まん', 'heiban'),
    word('回', 'かい', 'heiban'),
    word('人', 'にん', 'heiban'),
    word('者', 'しゃ', 'heiban'),
    word('数', 'すう', 'heiban'),
    word('登録', 'とうろく', 'heiban'),
    word('チャンネル', 'ちゃんねる', 'heiban'),
    word('ホーム', 'ほーむ', 'heiban'),
    word('ショート', 'しょーと', 'heiban'),
    word('ライブ', 'らいぶ', 'heiban'),
    word('リスト', 'りすと', 'heiban'),
    word('投稿', 'とうこう', 'heiban'),
    word('マイページ', 'まいぺーじ', 'heiban'),
    word('毎日', 'まいにち', 'heiban'),
    word('再生', 'さいせい', 'heiban'),
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
                <ytd-feed-filter-chip-bar-renderer class="chips">
                  <div id="chips-content">
                    <iron-selector id="chips" role="tablist" selected-attribute="selected">
                      <yt-chip-cloud-chip-renderer selected="" chip-style="STYLE_HOME_FILTER">
                        <button role="tab" aria-selected="true" data-proof-target data-proof-text="観光">観光</button>
                      </yt-chip-cloud-chip-renderer>
                      <yt-chip-cloud-chip-renderer chip-style="STYLE_HOME_FILTER">
                        <button role="tab" aria-selected="false" data-proof-target data-proof-text="関連動画">関連動画</button>
                      </yt-chip-cloud-chip-renderer>
                    </iron-selector>
                  </div>
                </ytd-feed-filter-chip-bar-renderer>
                <ytd-rich-grid-renderer class="grid">
                  <ytd-rich-item-renderer class="card">
                    <div class="thumb"></div>
                    <a id="video-title-link" class="title clamped" href="/watch?v=home1" data-proof-target data-proof-text="完全独学で英語を話せる方法">完全独学で英語を話せる方法</a>
                    <ytd-channel-name><a href="/@tokyo" data-proof-target data-proof-text="東京散歩チャンネル">東京散歩チャンネル</a></ytd-channel-name>
                    <div id="metadata-line"><span data-proof-target data-proof-text="3日前">3日前</span></div>
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
                  <ytd-video-renderer class="row">
                    <div class="thumb"></div>
                    <div>
                      <a id="video-title" class="title" href="/watch?v=search4" data-proof-target data-proof-text="毎日配信のニュース">毎日配信のニュース</a>
                      <div class="metadata-snippet-text clamped-snippet" data-proof-target data-proof-text="最新情報を毎日配信します。日本語の勉強と投資のニュースを読む。" data-proof-expect-clip-invariant="true">最新情報を毎日配信します。日本語の勉強と投資のニュースを読む。</div>
                    </div>
                  </ytd-video-renderer>
                  <ytd-channel-renderer class="row">
                    <div class="mini-thumb round"></div>
                    <div id="info">
                      <a class="title" href="/@kyoto" data-proof-target data-proof-text="京都カフェチャンネル">京都カフェチャンネル</a>
                      <div id="description" class="channel-card-description" data-proof-target data-proof-text="京都のカフェで朝ごはんを食べ歩きします">京都のカフェで朝ごはんを食べ歩きします</div>
                    </div>
                  </ytd-channel-renderer>
                </ytd-two-column-search-results-renderer>
              </ytd-search>
            </ytd-app>
        `),
    },
    {
        // /playlist rows + legacy header: the 1.6.40 tab-strip fix underlined
        // 再生リスト while the page behind the click was fully bare.
        name: 'desktop-playlist',
        url: 'https://www.youtube.com/playlist?list=PLproof',
        viewport: { width: 1280, height: 900 },
        html: youtubeShell(`
            <ytd-app>
              <ytd-playlist-header-renderer class="playlist-header">
                <h1 id="title" data-proof-target data-proof-text="日本語の勉強と東京散歩">日本語の勉強と東京散歩</h1>
                <div class="metadata-wrapper" data-proof-target data-proof-text="毎日ニュースを読む">毎日ニュースを読む</div>
              </ytd-playlist-header-renderer>
              <ytd-playlist-video-renderer class="playlist-row">
                <div class="mini-thumb"></div>
                <a id="video-title" class="title clamped" href="/watch?v=pl1" data-proof-target data-proof-text="京都で朝ごはんを食べ歩きしてカフェで日本語を勉強" data-proof-expect-clip-invariant="true">京都で朝ごはんを食べ歩きしてカフェで日本語を勉強</a>
              </ytd-playlist-video-renderer>
              <ytd-playlist-video-renderer class="playlist-row">
                <div class="mini-thumb"></div>
                <a id="video-title" class="title" href="/watch?v=pl2" data-proof-target data-proof-text="大阪で食べ歩き">大阪で食べ歩き</a>
              </ytd-playlist-video-renderer>
            </ytd-app>
        `),
    },
    {
        // Channel page (owner iPad screenshot): tab strip, mini-guide (only
        // scanned on /watch before), shelf headings, header description
        // preview さらに表示, and grid metadata 10万回視聴 with cropped rows.
        name: 'desktop-channel',
        url: 'https://www.youtube.com/@tokyo',
        viewport: { width: 1280, height: 900 },
        html: youtubeShell(`
            <ytd-app>
              <ytd-mini-guide-renderer class="mini-guide">
                <ytd-mini-guide-entry-renderer><a class="guide-entry"><span data-proof-target data-proof-text="ホーム" data-proof-expect-at-rest-decoration="true">ホーム</span></a></ytd-mini-guide-entry-renderer>
                <ytd-mini-guide-entry-renderer><a class="guide-entry"><span data-proof-target data-proof-text="登録チャンネル">登録チャンネル</span></a></ytd-mini-guide-entry-renderer>
                <ytd-mini-guide-entry-renderer><a class="guide-entry"><span>マイページ</span></a></ytd-mini-guide-entry-renderer>
              </ytd-mini-guide-renderer>
              <ytd-browse page-subtype="channels" class="channel">
                <yt-page-header-view-model class="channel-header">
                  <h1 class="channel-name" data-proof-target data-proof-text="東京散歩チャンネル">東京散歩チャンネル</h1>
                  <yt-content-metadata-view-model>
                    <div class="ytContentMetadataViewModelMetadataRow"><span data-proof-target data-proof-text="チャンネル登録者数 10万人">チャンネル登録者数 10万人</span></div>
                  </yt-content-metadata-view-model>
                  <yt-description-preview-view-model class="channel-description">
                    <div class="channel-description-text" data-proof-target data-proof-text="東京の散歩と日本語の勉強について毎日配信します さらに表示" data-proof-expect-clip-invariant="true">東京の散歩と日本語の勉強について毎日配信します さらに表示</div>
                  </yt-description-preview-view-model>
                </yt-page-header-view-model>
                <yt-tab-group-shape class="tab-strip" role="tablist">
                  <yt-tab-shape tab-title="ホーム"><div role="tab" class="tab" data-proof-target data-proof-text="ホーム" data-proof-expect-at-rest-decoration="true">ホーム</div></yt-tab-shape>
                  <yt-tab-shape tab-title="動画"><div role="tab" class="tab" data-proof-target data-proof-text="動画" data-proof-expect-at-rest-decoration="true">動画</div></yt-tab-shape>
                  <yt-tab-shape tab-title="ショート"><div role="tab" class="tab">ショート</div></yt-tab-shape>
                  <yt-tab-shape tab-title="ライブ"><div role="tab" class="tab">ライブ</div></yt-tab-shape>
                  <yt-tab-shape tab-title="再生リスト"><div role="tab" class="tab" data-proof-target data-proof-text="再生リスト">再生リスト</div></yt-tab-shape>
                  <yt-tab-shape tab-title="投稿"><div role="tab" class="tab">投稿</div></yt-tab-shape>
                </yt-tab-group-shape>
                <grid-shelf-view-model class="shelf">
                  <h2 class="shelf-title" data-proof-target data-proof-text="人気の動画">人気の動画</h2>
                  <yt-lockup-view-model class="card">
                    <div class="thumb"></div>
                    <yt-lockup-metadata-view-model>
                      <a class="ytLockupMetadataViewModelTitle title" href="/watch?v=ch1" data-proof-target data-proof-text="東京散歩と春コーデ">東京散歩と春コーデ</a>
                    </yt-lockup-metadata-view-model>
                  </yt-lockup-view-model>
                </grid-shelf-view-model>
                <ytd-shelf-renderer class="shelf">
                  <div id="title" class="shelf-title" data-proof-target data-proof-text="動画">動画</div>
                  <ytd-grid-video-renderer class="card">
                    <div class="thumb"></div>
                    <a id="video-title" class="title clamped" href="/watch?v=ch2" data-proof-target data-proof-text="京都で朝ごはんを食べ歩きしてカフェで日本語を勉強" data-proof-expect-clip-invariant="true">京都で朝ごはんを食べ歩きしてカフェで日本語を勉強</a>
                    <div id="metadata-line" class="grid-meta" data-proof-target data-proof-text="10万回視聴">10万回視聴</div>
                  </ytd-grid-video-renderer>
                </ytd-shelf-renderer>
              </ytd-browse>
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
                  <div id="movie_player" class="html5-video-player">
                    <div class="ytp-caption-window-container" data-proof-native-caption><span class="ytp-caption-segment">字幕だけの表示です。</span></div>
                  </div>
                  <ytd-watch-metadata>
                    <h1 class="style-scope ytd-watch-metadata watch-title-clamped" data-proof-target data-proof-text="${longWatchTitle}" data-proof-expect-clip-invariant="true">
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
                  <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript">
                    <ytd-transcript-renderer>
                      <ytd-transcript-body-renderer>
                        <ytd-transcript-segment-renderer>
                          <yt-formatted-string class="segment-text" data-proof-target data-proof-text="日本語の字幕">日本語の字幕を確認します。</yt-formatted-string>
                        </ytd-transcript-segment-renderer>
                      </ytd-transcript-body-renderer>
                    </ytd-transcript-renderer>
                  </ytd-engagement-panel-section-list-renderer>
                </section>
                <aside id="secondary">
                  <ytd-compact-video-renderer class="compact">
                    <div class="mini-thumb"></div>
                    <a id="video-title" href="/watch?v=side" data-proof-target data-proof-text="関連動画の発行ニュース">関連動画の発行ニュース</a>
                  </ytd-compact-video-renderer>
                  <ytd-playlist-panel-renderer class="queue-panel">
                    <ytd-playlist-panel-video-renderer class="queue-row">
                      <div class="mini-thumb"></div>
                      <a id="video-title" class="queue-title" href="/watch?v=q1" data-proof-target data-proof-text="東京散歩と春コーデの最新情報を毎日配信します" data-proof-expect-clip-invariant="true">東京散歩と春コーデの最新情報を毎日配信します</a>
                    </ytd-playlist-panel-video-renderer>
                    <ytd-playlist-panel-video-renderer class="queue-row">
                      <div class="mini-thumb"></div>
                      <a id="video-title" class="queue-title" href="/watch?v=q2" data-proof-target data-proof-text="字幕で日本語を読む">字幕で日本語を読む</a>
                    </ytd-playlist-panel-video-renderer>
                  </ytd-playlist-panel-renderer>
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

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: process.env.YOMU_YOUTUBE_RUBY_PROOF_HEADED !== '1' });
// Video needs Playwright's downloaded ffmpeg, which CI runners (channel
// Chrome, no browser downloads) don't have — record locally only.
const context = await browser.newContext({
    bypassCSP: true,
    locale: 'ja-JP',
    viewport: { width: 1280, height: 900 },
    ...(process.env.CI ? {} : { recordVideo: { dir: outputRoot, size: { width: 1280, height: 900 } } }),
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
        const clipHover = await auditClipHoverMirrors(page);
        result.clipHover = clipHover;
        result.failures.push(...clipHover.failures);
        result.pass = result.failures.length === 0;
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
    ytd-watch-metadata, ytd-comments, ytd-comment-view-model, yt-live-chat-text-message-renderer,
    ytd-browse, yt-page-header-view-model, yt-content-metadata-view-model, yt-description-preview-view-model,
    grid-shelf-view-model, ytd-shelf-renderer, ytd-grid-video-renderer, ytd-mini-guide-renderer,
    ytd-mini-guide-entry-renderer, yt-tab-shape { display: block; }
    yt-tab-group-shape { display: flex; gap: 26px; }
    .mini-guide { position: fixed; top: 0; left: 0; bottom: 0; width: 76px; padding-top: 70px; background: #0f0f0f; }
    .guide-entry { display: block; padding: 14px 6px; font-size: 11px; color: #f1f1f1; text-align: center; text-decoration: none; }
    .channel { margin-left: 96px; padding: 24px; }
    .channel-header { display: block; max-width: 640px; }
    .channel-name { margin: 0 0 8px; font-size: 24px; }
    .ytContentMetadataViewModelMetadataRow { color: #aaa; font-size: 14px; margin-bottom: 6px; }
    .channel-description-text { max-width: 300px; font-size: 14px; line-height: 1.6; overflow: hidden; height: 40px; max-height: 40px; color: #ddd; }
    .tab-strip { margin: 18px 0; border-bottom: 1px solid #333; }
    .tab { padding: 10px 4px; font-size: 15px; color: #f1f1f1; }
    .shelf { margin: 26px 0; }
    .shelf-title { font-size: 20px; font-weight: 700; margin: 0 0 14px; }
    .grid-meta { overflow: hidden; height: 20px; max-height: 20px; font-size: 13px; color: #aaa; }
    /* Narrow like a real channel grid card so the 44px clamp actually crops
       the two-line title and the ruby-room sweep has work to do. */
    .channel .card { max-width: 320px; }
    ytd-search, ytd-two-column-search-results-renderer, ytd-channel-renderer, ytd-playlist-header-renderer,
    ytd-playlist-video-renderer, ytd-playlist-panel-renderer, ytd-playlist-panel-video-renderer { display: block; }
    .round { border-radius: 50%; width: 88px; min-height: 88px; }
    .clamped-snippet { font-size: 13px; line-height: 1.5; color: #ddd; overflow: hidden; height: 40px; max-height: 40px; max-width: 300px; margin-top: 8px; }
    .channel-card-description { font-size: 13px; line-height: 1.5; color: #aaa; overflow: hidden; height: 20px; max-height: 20px; max-width: 300px; margin-top: 6px; }
    .playlist-header { padding: 12px 28px; }
    .playlist-header h1 { margin: 0 0 8px; font-size: 26px; }
    .playlist-header .metadata-wrapper { color: #aaa; font-size: 14px; }
    .playlist-row { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 14px; padding: 10px 28px; max-width: 560px; }
    .queue-panel { display: block; padding: 10px; border: 1px solid #333; border-radius: 10px; margin-top: 16px; }
    .queue-row { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 10px; margin-bottom: 12px; }
    .queue-title { display: block; font-size: 14px; line-height: 1.35; overflow: hidden; height: 40px; max-height: 40px; color: #f1f1f1; text-decoration: none; }
    .proof-status { position: sticky; top: 0; z-index: 10; padding: 12px 18px; background: #123d24; border-bottom: 2px solid #65d184; font-size: 14px; font-weight: 700; }
    .topbar { height: 64px; display: flex; align-items: center; gap: 18px; padding: 0 24px; background: #0f0f0f; }
    .chips { display: block; padding: 12px 26px 0; }
    #chips { display: flex; gap: 10px; }
    button { border: 1px solid #555; border-radius: 18px; background: #2a2a2a; color: #f1f1f1; padding: 8px 14px; font: inherit; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(260px, 1fr)); gap: 26px; padding: 26px; }
    .list { display: grid; gap: 20px; padding: 28px; }
    .row { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 18px; align-items: start; }
    .card { min-width: 0; }
    .thumb, .player, .mini-thumb, .media-item-thumbnail-container, .short-thumb { background: #303030; border-radius: 10px; }
    .thumb { aspect-ratio: 16 / 9; margin-bottom: 12px; }
    .mini-thumb { width: 150px; min-height: 84px; }
    .player { min-height: 410px; display: grid; place-items: center; color: #aaa; margin-bottom: 18px; }
    #movie_player { position: relative; min-height: 96px; background: #050505; margin-bottom: 18px; }
    .ytp-caption-window-container { position: absolute; left: 0; right: 0; bottom: 20px; text-align: center; }
    .ytp-caption-segment { padding: 4px 10px; background: rgba(0,0,0,.76); color: white; font-size: 22px; text-shadow: 0 2px 4px black; }
    .mobile-player { min-height: 220px; }
    .title, #video-title, #video-title-link { color: #f1f1f1; text-decoration: none; font-size: 22px; line-height: 1.35; font-weight: 700; }
    .clamped { display: block; overflow: hidden; height: 44px; max-height: 44px; }
    .watch { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 24px; padding: 28px; }
    ytd-watch-metadata h1 { margin: 0 0 18px; font-size: 25px; line-height: 1.35; }
    .watch-title-clamped { display: block; overflow: hidden; height: 38px; max-height: 38px; max-width: 760px; }
    #description-inline-expander { background: #272727; border-radius: 8px; padding: 14px; margin: 14px 0; line-height: 1.6; }
    ytd-comment-view-model, yt-live-chat-text-message-renderer { padding: 14px 0; border-top: 1px solid #333; line-height: 1.6; }
    ytd-transcript-renderer, ytd-transcript-body-renderer, ytd-transcript-segment-renderer { display: block; }
    ytd-transcript-segment-renderer { padding: 10px 0; border-top: 1px solid #333; }
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

async function auditClipHoverMirrors(page) {
    const mirrors = page.locator('.jpdb-reader-text-mirror.jpdb-reader-clip-hover-mirror');
    const count = await mirrors.count();
    const entries = [];
    const failures = [];

    for (let index = 0; index < count; index++) {
        const mirror = mirrors.nth(index);
        const host = mirror.locator('xpath=..');
        const label = await mirror.evaluate((element, position) => element.closest('[data-proof-target]')?.getAttribute('data-proof-text')
            || element.getAttribute('data-source-text')
            || element.textContent?.replace(/\s+/g, ' ').trim()
            || `clip mirror ${position}`, index + 1);
        const beforeHeight = await host.evaluate(element => element.getBoundingClientRect().height);

        await host.hover({ force: true });
        await page.waitForTimeout(20);
        const mirrorVisibleOnHostHover = await mirror.evaluate(isPaintedElement);
        const hostGlyphsTransparent = await host.evaluate(element => {
            const style = getComputedStyle(element);
            return isTransparentPaint(style.color) && isTransparentPaint(style.webkitTextFillColor);

            function isTransparentPaint(value) {
                return value === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(value);
            }
        });

        const rubyWords = mirror.locator('.jpdb-reader-word:has(rt)');
        const rubyWordCount = await rubyWords.count();
        let visibleReadingCount = 0;
        if (rubyWordCount > 0) {
            await rubyWords.first().hover({ force: true });
            await page.waitForTimeout(20);
            visibleReadingCount = await mirror.evaluate(element => Array.from(element.querySelectorAll('rt')).filter(reading => {
                if (!(reading instanceof HTMLElement)) return false;
                const style = getComputedStyle(reading);
                if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.01) return false;
                const rect = reading.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }).length);
        }
        const hoverHeight = await host.evaluate(element => element.getBoundingClientRect().height);

        await page.mouse.move(0, 0);
        await page.waitForTimeout(20);
        const mirrorHiddenAfterHover = await mirror.evaluate(element => getComputedStyle(element).visibility === 'hidden');
        const hostGlyphsPaintedAfterHover = await host.evaluate(element => {
            const style = getComputedStyle(element);
            return !isTransparentPaint(style.color) && !isTransparentPaint(style.webkitTextFillColor);

            function isTransparentPaint(value) {
                return value === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(value);
            }
        });
        const afterHeight = await host.evaluate(element => element.getBoundingClientRect().height);
        const entry = {
            label,
            mirrorVisibleOnHostHover,
            hostGlyphsTransparent,
            rubyWordCount,
            visibleReadingCount,
            mirrorHiddenAfterHover,
            hostGlyphsPaintedAfterHover,
            beforeHeight,
            hoverHeight,
            afterHeight,
        };
        entries.push(entry);

        if (!mirrorVisibleOnHostHover) failures.push(`${label}: clip hover mirror did not reveal on host hover`);
        if (!hostGlyphsTransparent) failures.push(`${label}: native host glyphs did not clear while the hover mirror was visible`);
        if (rubyWordCount > 0 && visibleReadingCount === 0) failures.push(`${label}: hover mirror readings did not reveal on word hover`);
        if (!mirrorHiddenAfterHover) failures.push(`${label}: clip hover mirror stayed visible after pointer exit`);
        if (!hostGlyphsPaintedAfterHover) failures.push(`${label}: native host glyphs stayed transparent after pointer exit`);
        if (Math.abs(hoverHeight - beforeHeight) > 1 || Math.abs(afterHeight - beforeHeight) > 1) {
            failures.push(`${label}: hover changed the native host height ${JSON.stringify({ beforeHeight, hoverHeight, afterHeight })}`);
        }
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    return { count, entries, failures };
}

function isPaintedElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.01) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
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
    const targetSnapshots = targets.map(target => {
        markProofTargetScanFlags(target);
        return {
            text: target.text,
            tokenSurfaces: tokensForText(target.text, vocabulary).map(token => token.card.spelling),
            suppressRuby: target.suppressRuby === true,
            passiveInteraction: target.passiveInteraction === true,
            layoutSensitive: target.layoutSensitive === true,
        };
    });

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
    const nativeCaptions = auditNativeCaptionOverlays(targetSnapshots);
    const renderedWords = renderedWordDetails(document.body);
    const failures = [
        ...proofTargets.flatMap(target => target.failures.map(message => target.label + ': ' + message)),
        ...hiddenFeedback.failures,
        ...nativeCaptions.failures,
    ];
    if (!proofTargets.length) failures.push('no visible proof targets found');
    if (targetSnapshots.some(target => HAS_JAPANESE.test(target.text) && !target.tokenSurfaces.length && !/押下中/.test(target.text))) {
        failures.push('a visible Japanese scan target had no JPDB-shaped token match');
    }
    if (renderedWords.some(word => (word.requiresRuby && !word.hasRuby && !word.rubySuppressed) || word.source !== 'jpdb' || !CONCRETE_PITCH_CLASSES.has(word.pitchClass))) {
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
        nativeCaptions,
        renderedWords,
    };
};

function markProofTargetScanFlags(target) {
    const root = target.parent?.closest?.('[data-proof-target]');
    if (!root) return;
    if (!root.dataset.proofInitialHeight) {
        root.dataset.proofInitialHeight = String(root.getBoundingClientRect().height);
    }
    root.dataset.proofScanSuppressRuby = target.suppressRuby === true ? 'true' : 'false';
    root.dataset.proofScanPassiveInteraction = target.passiveInteraction === true ? 'true' : 'false';
    root.dataset.proofScanLayoutSensitive = target.layoutSensitive === true ? 'true' : 'false';
}

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
    return Array.from(document.querySelectorAll('[data-proof-target]')).filter(isVisibleProofTarget);
}

function auditProofTarget(element, vocabulary) {
    const label = element.getAttribute('data-proof-text') || compactText(element.textContent || '');
    const expectedSurfaces = tokensForText(label, vocabulary).map(token => token.card.spelling);
    // Audit every word inside an admitted visible target. Words on a later
    // native-clamped line can have no painted box yet still need complete
    // metadata for a later reveal or reflow.
    const words = renderedWordDetails(element, true);
    const failures = [];
    const missingSurfaces = missingExpectedSurfaces(expectedSurfaces, words.map(word => word.surface));
    const clipped = isBoxClipped(element);
    const rubyOutOfBounds = outOfBoundsRubyCount(element);
    const uncoveredKanji = uncoveredKanjiForText(label, words.map(word => word.surface));
    const expectedClipInvariant = element.getAttribute('data-proof-expect-clip-invariant') === 'true';
    const clipMirror = clipHoverMirror(element);
    const clipConstrained = Boolean(
        clipMirror
        || element.matches('[data-yomu-clip-constrained="true"]')
        || element.closest('[data-yomu-clip-constrained="true"]')
        || element.querySelector('[data-yomu-clip-constrained="true"]'),
    );
    const rubyRoomOwner = element.matches('[data-yomu-ruby-room="true"]')
        ? element
        : element.querySelector('[data-yomu-ruby-room="true"]');
    const rubyRoomHeight = Number(element.dataset.yomuRubyRoomHeight || 0);
    const initialHeight = Number(element.dataset.proofInitialHeight || 0);
    const currentHeight = element.getBoundingClientRect().height;
    const detachedReadings = Array.from(element.querySelectorAll('.jpdb-reader-detached-furi'));
    const detachedReadingCount = detachedReadings.length;
    const detachedReadingClipped = detachedReadings.some(isReadingClipped);
    // A native line clamp intentionally clips paint outside its authored box.
    // The detached-reading contract for that surface is structural: preserve
    // every reading for reveal/reflow and keep it out of line layout. Compact
    // controls with genuine spare leading are covered separately by the chip
    // fidelity proof, which requires their readings to be painted unclipped.
    const layoutNeutralDetached = detachedReadingCount > 0
        && (initialHeight <= 0 || currentHeight <= initialHeight + 1);
    const clipMirrorHiddenAtRest = !clipMirror || getComputedStyle(clipMirror).visibility === 'hidden';
    const nativeHostVisibleAtRest = !clipMirror || Boolean(clipMirror.parentElement && isVisibleElement(clipMirror.parentElement));
    const nativeHostGlyphsPaintedAtRest = !clipMirror || (() => {
        const hostStyle = getComputedStyle(clipMirror.parentElement);
        return !isTransparentColor(hostStyle.color) && !isTransparentColor(hostStyle.webkitTextFillColor);
    })();
    const clipMirrorMaxHeight = Number.parseFloat(clipMirror?.style.maxHeight || '0') || 0;
    const scanSuppressRuby = element.dataset.proofScanSuppressRuby === 'true';
    const renderedSuppressRuby = words.some(word => word.requiresRuby && !word.hasRuby)
        && words.filter(word => word.requiresRuby && !word.hasRuby).every(word => word.rubySuppressed);
    const rubySuppressed = scanSuppressRuby || renderedSuppressRuby;

    if (!expectedSurfaces.length) failures.push('no expected JPDB token surfaces for proof text');
    if (!words.length) failures.push('no rendered reader words');
    if (missingSurfaces.length) failures.push('missing rendered surfaces: ' + missingSurfaces.join(', '));
    if (!rubySuppressed && words.some(word => word.requiresRuby && !word.hasRuby)) failures.push('kanji-bearing rendered word without furigana');
    if (words.some(word => word.source !== 'jpdb')) failures.push('rendered word without JPDB source metadata');
    if (words.some(word => !CONCRETE_PITCH_CLASSES.has(word.pitchClass))) failures.push('rendered word without concrete pitch class');
    if (uncoveredKanji.length) failures.push('uncovered kanji: ' + uncoveredKanji.join(''));
    if (clipped && !rubySuppressed && !clipConstrained && !layoutNeutralDetached) {
        // Environment-sensitive (font metrics decide wrap); carry the numbers
        // so a CI-only failure is diagnosable from the log alone.
        failures.push('target still has scroll clipping after ruby room sweep '
            + JSON.stringify({
                scrollHeight: element.scrollHeight,
                clientHeight: element.clientHeight,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
                rubyRoomHeight,
                styleHeight: element.style.height,
                styleMinHeight: element.style.minHeight,
            }));
    }
    if (rubyOutOfBounds) failures.push(rubyOutOfBounds + ' ruby annotations sit outside target bounds');
    if (clipConstrained && rubyRoomOwner) failures.push('clip-constrained target received forbidden ruby-room growth');
    if (expectedClipInvariant && !clipConstrained && !layoutNeutralDetached) failures.push('expected clipped target to use a layout-neutral render path');
    if (expectedClipInvariant && !clipMirror && !layoutNeutralDetached) failures.push('expected clipped target to retain either detached readings or an annotated hover mirror');
    if (clipMirror && !clipMirrorHiddenAtRest) failures.push('clip-constrained hover mirror is visible at rest');
    if (clipMirror && !nativeHostVisibleAtRest) failures.push('clip-constrained native host text is hidden at rest');
    if (clipMirror && !nativeHostGlyphsPaintedAtRest) failures.push('clip-constrained native host glyphs are transparent at rest');
    if (clipMirror && initialHeight > 0 && currentHeight > initialHeight + 1) {
        failures.push('clip-constrained target grew beyond its native height '
            + JSON.stringify({ initialHeight, currentHeight, clipMirrorMaxHeight }));
    }
    if (clipMirror && clipMirror.dataset.yomuClipConstrained !== 'true') {
        failures.push('clip-constrained hover mirror is missing its constrained-row stamp');
    }
    if (clipMirror && clipMirrorMaxHeight > currentHeight + 1) {
        failures.push('clip-constrained hover mirror exceeds the native clamp box '
            + JSON.stringify({ currentHeight, clipMirrorMaxHeight }));
    }
    if (element.getAttribute('data-proof-expect-at-rest-decoration') === 'true') {
        const wordElements = Array.from(element.querySelectorAll('.jpdb-reader-word')).filter(isVisibleElement);
        const bare = wordElements.filter(wordElement => !hasAtRestDecoration(wordElement));
        if (!wordElements.length || bare.length) failures.push('chrome word missing at-rest underline decoration (carve-out regressed)');
    }

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
        expectedClipInvariant,
        clipConstrained,
        clipMirrorHiddenAtRest,
        nativeHostVisibleAtRest,
        nativeHostGlyphsPaintedAtRest,
        clipMirrorMaxHeight,
        initialHeight,
        currentHeight,
        detachedReadingCount,
        detachedReadingClipped,
        layoutNeutralDetached,
        scanSuppressRuby,
        renderedSuppressRuby,
        rubySuppressed,
        scanPassiveInteraction: element.dataset.proofScanPassiveInteraction === 'true',
        scanLayoutSensitive: element.dataset.proofScanLayoutSensitive === 'true',
        uncoveredKanji,
        words,
        failures,
    };
}

function isVisibleProofTarget(element) {
    return isViewportVisibleElement(element)
        || Boolean(Array.from(element.querySelectorAll('.jpdb-reader-text-mirror')).find(isViewportVisibleElement));
}

// Bare-until-hover suppression forces every decoration channel transparent, so
// a carved-out chrome word must keep at least one visible at rest.
function hasAtRestDecoration(wordElement) {
    const style = getComputedStyle(wordElement);
    const afterStyle = getComputedStyle(wordElement, '::after');
    return !isTransparentColor(style.textDecorationColor)
        || !isTransparentColor(afterStyle.borderBlockEndColor)
        || !isTransparentColor(style.backgroundColor);
}

function isTransparentColor(value) {
    return !value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)';
}

function visibleTextMirror(element) {
    return Array.from(element.querySelectorAll('.jpdb-reader-text-mirror')).find(isVisibleElement) ?? null;
}

function renderedWordDetails(root, includeClampedTail = false) {
    const candidates = Array.from(root.querySelectorAll('.jpdb-reader-word'));
    const words = includeClampedTail ? candidates : candidates.filter(isAuditableReaderWord);
    return words.map(word => ({
        surface: readerWordSurfaceText(word).trim(),
        text: compactText(word.textContent || ''),
        requiresRuby: HAN_RE.test(readerWordSurfaceText(word).trim()),
        hasRuby: Boolean(word.querySelector('rt, .jpdb-reader-detached-furi')),
        rt: Array.from(word.querySelectorAll('rt, .jpdb-reader-detached-furi')).map(rt => rt.textContent || '').join('|'),
        atRestVisible: isVisibleElement(word),
        inClipHoverMirror: Boolean(word.closest('.jpdb-reader-clip-hover-mirror')),
        passiveInteraction: word.classList.contains('jpdb-reader-passive-word'),
        // A word may lack a reading ONLY when its target's scan plan says
        // suppression fired, or a visible text mirror carries the reading for
        // its host. "passive word without rt" alone is NOT suppression — that
        // circular reading made the furigana check vacuous for passive words.
        rubySuppressed: closestProofTargetSuppressesRuby(word)
            || decorationSuppressesReaderWordRuby(word)
            || (!word.querySelector('rt, .jpdb-reader-detached-furi') && hostMirrorCarriesReading(word)),
        decoration: word.closest('[data-yomu-decoration]')?.getAttribute('data-yomu-decoration') || '',
        source: word.dataset.cardSource || '',
        pitchClass: word.dataset.pitchClass || '',
        className: word.className,
    }));
}

function isAuditableReaderWord(word) {
    if (isVisibleElement(word)) return true;
    const mirror = word.closest('.jpdb-reader-clip-hover-mirror');
    return Boolean(mirror?.parentElement && isVisibleElement(mirror.parentElement));
}

function clipHoverMirror(element) {
    return Array.from(element.querySelectorAll('.jpdb-reader-clip-hover-mirror'))
        .find(mirror => mirror instanceof HTMLElement) ?? null;
}

function closestProofTargetSuppressesRuby(word) {
    return word.closest('[data-proof-target]')?.dataset.proofScanSuppressRuby === 'true';
}

function decorationSuppressesReaderWordRuby(word) {
    return word.closest('[data-yomu-decoration]')?.getAttribute('data-yomu-decoration') === 'interactive-passive';
}

// True when the word's host is decorated by a visible text mirror whose rt
// carries a reading — the constrained-row/mirror architecture's legitimate
// replacement for in-place ruby.
function hostMirrorCarriesReading(word) {
    const mirror = word.closest('.jpdb-reader-text-mirror');
    if (mirror) return Boolean(mirror.querySelector('rt, .jpdb-reader-detached-furi')) && isVisibleElement(mirror);
    const host = word.parentElement?.closest?.('[data-proof-target]') ?? word.parentElement;
    const hostMirror = host ? visibleTextMirror(host) : null;
    return Boolean(hostMirror?.querySelector('rt, .jpdb-reader-detached-furi'));
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

function auditNativeCaptionOverlays(scanTargets) {
    const roots = Array.from(document.querySelectorAll('[data-proof-native-caption]'));
    const annotated = roots.reduce((count, root) => count + root.querySelectorAll('.jpdb-reader-word').length, 0);
    const scanned = scanTargets
        .filter(target => /字幕だけの表示です/.test(target.text))
        .map(target => target.text);
    const failures = [];
    if (annotated) failures.push('native YouTube caption overlay received reader words');
    if (scanned.length) failures.push('native YouTube caption overlay appeared in scan targets');
    return { roots: roots.length, annotated, scanned, failures };
}

function isVisibleElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.01) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function isViewportVisibleElement(element) {
    if (!isVisibleElement(element)) return false;
    const rect = element.getBoundingClientRect();
    return rect.bottom >= 0
        && rect.top <= window.innerHeight
        && rect.right >= 0
        && rect.left <= window.innerWidth;
}

function isReadingClipped(reading) {
    if (!(reading instanceof HTMLElement) || !isVisibleElement(reading)) return true;
    const readingRect = reading.getBoundingClientRect();
    let ancestor = reading.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
        const style = getComputedStyle(ancestor);
        const crops = [style.overflow, style.overflowX, style.overflowY]
            .some(value => /hidden|clip/.test(value));
        if (crops) {
            const rect = ancestor.getBoundingClientRect();
            if (readingRect.top < rect.top - 0.5
                || readingRect.bottom > rect.bottom + 0.5
                || readingRect.left < rect.left - 0.5
                || readingRect.right > rect.right + 0.5) return true;
        }
        ancestor = ancestor.parentElement;
    }
    return false;
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
    return Array.from(element.querySelectorAll('rt')).filter(isVisibleElement).filter(rt => {
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
