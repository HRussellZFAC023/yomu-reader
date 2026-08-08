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
const proofScrollSettleMs = 160;
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
    word('共有', 'きょうゆう', 'heiban'),
    word('他', 'ほか', 'heiban'),
    word('件', 'けん', 'heiban'),
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
                <ytd-mini-guide-entry-renderer><a class="guide-entry" href="/"><span data-proof-page-owned data-proof-text="ホーム">ホーム</span></a></ytd-mini-guide-entry-renderer>
                <ytd-mini-guide-entry-renderer><a class="guide-entry" href="/feed/subscriptions"><span data-proof-page-owned data-proof-text="登録チャンネル">登録チャンネル</span></a></ytd-mini-guide-entry-renderer>
                <ytd-mini-guide-entry-renderer><a class="guide-entry" href="/feed/you"><span>マイページ</span></a></ytd-mini-guide-entry-renderer>
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
                <ytd-shelf-renderer class="proof-shelf-expansion">
                  <ytd-vertical-list-renderer>
                    <div id="more">
                      <yt-formatted-string role="button" data-proof-page-owned data-proof-text="+ 他 3 件"><span>+ 他 </span><span>3</span><span> 件</span></yt-formatted-string>
                    </div>
                  </ytd-vertical-list-renderer>
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
              <ytm-shorts class="proof-shorts-root">
                <div class="proof-shorts-actions" role="toolbar">
                  <button aria-label="共有" data-proof-page-owned data-proof-text="共有"><span class="proof-shorts-action-label">共有</span></button>
                </div>
              </ytm-shorts>
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
    .guide-entry > span { display: block; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
    .queue-row .mini-thumb { width: 100px; min-height: 56px; }
    .queue-title { display: block; font-size: 14px; line-height: 1.35; overflow: hidden; height: 40px; max-height: 40px; color: #f1f1f1; text-decoration: none; }
    .proof-shelf-expansion { display: block; width: 400px; margin: 48px 0 80px; }
    .proof-shelf-expansion > ytd-vertical-list-renderer { display: block; }
    .proof-shelf-expansion > ytd-vertical-list-renderer > #more { box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: 400px; height: 40px; overflow: hidden; border-bottom: 1px solid #333; }
    .proof-shelf-expansion yt-formatted-string { display: inline-flex; align-items: center; white-space: pre; overflow: visible; font: 500 14px/20px Roboto, sans-serif; }
    .proof-shorts-root { display: block; position: relative; width: 120px; height: 180px; margin: 24px; }
    .proof-shorts-actions { display: flex; flex-direction: column; width: 48px; }
    .proof-shorts-actions button { box-sizing: border-box; width: 48px; height: 48px; padding: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .proof-shorts-action-label { display: block; width: 34px; margin: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 14px/20px Roboto, sans-serif; }
    .proof-status { position: sticky; top: 0; z-index: 10; box-sizing: border-box; height: 44px; overflow: hidden; white-space: nowrap; padding: 12px 18px; background: #123d24; border-bottom: 2px solid #65d184; font-size: 14px; font-weight: 700; }
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
    [data-proof-scroll-tail] { display: block; height: 900px; pointer-events: none; }
  </style>
</head>
<body>
  <div class="proof-status" data-proof-status>Ruby coverage proof pending</div>
  ${body}
  <div data-proof-scroll-tail aria-hidden="true"></div>
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
    const snapshots = [];
    const viewport = page.viewportSize() ?? { width: 1280, height: 900 };
    const scrollHeight = await page.evaluate(() => Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.scrollingElement?.scrollHeight ?? 0,
    ));
    const maxY = Math.max(0, scrollHeight - viewport.height);
    const step = Math.max(240, Math.floor(viewport.height * 0.72));
    // Every fixture gets a meaningful partial scroll while annotations remain
    // on screen, plus the ordinary stepped walk and the furthest offset where
    // stale clones must retire. The authored tail makes this non-vacuous even
    // for compact pages whose content otherwise fits in one viewport.
    const stops = new Set([0, Math.min(maxY, 160), maxY]);
    for (let y = 0; y < maxY; y += step) stops.add(Math.min(maxY, y));
    for (const y of [...stops].sort((a, b) => a - b)) {
        await page.evaluate(scrollY => window.scrollTo(0, scrollY), y);
        // Production deliberately settles clipped document portals after 96ms
        // at a scroll boundary; audit the stable state beyond that boundary.
        await page.waitForTimeout(proofScrollSettleMs);
        const result = await page.evaluate(options => window.__yomuRubyCoverageProof(options), { vocabulary });
        snapshots.push({ y, phase: 'outbound', result });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(proofScrollSettleMs);
    const returned = await page.evaluate(options => window.__yomuRubyCoverageProof(options), { vocabulary });
    snapshots.push({ y: 0, phase: 'return', result: returned });
    return mergeScrollProofSnapshots(snapshots);
}

function mergeScrollProofSnapshots(snapshots) {
    const final = snapshots.at(-1)?.result ?? { failures: [], proofTargets: [] };
    const targets = new Map();
    const failures = [];
    let targetTotal = 0;
    for (const snapshot of snapshots) {
        targetTotal = Math.max(targetTotal, snapshot.result.targetTotal ?? 0);
        snapshot.result.failures.forEach(message => failures.push(`[${snapshot.phase} y=${snapshot.y}] ${message}`));
        for (const target of snapshot.result.proofTargets) {
            const previous = targets.get(target.targetId);
            targets.set(target.targetId, {
                ...target,
                observations: (previous?.observations ?? 0) + 1,
                observedScrollStops: [...(previous?.observedScrollStops ?? []), `${snapshot.phase}:${snapshot.y}`],
            });
        }
    }
    if (targets.size !== targetTotal) {
        failures.push(`scroll proof observed ${targets.size} of ${targetTotal} fixture targets`);
    }
    if (targetTotal === 0) failures.push('scroll proof fixture contains no proof targets');
    return {
        ...final,
        pass: failures.length === 0,
        failures,
        proofTargets: [...targets.values()].sort((left, right) => Number(left.targetId) - Number(right.targetId)),
        scrollSnapshots: snapshots.map(snapshot => ({
            y: snapshot.y,
            phase: snapshot.phase,
            pass: snapshot.result.pass,
            targetCount: snapshot.result.proofTargets.length,
            failureCount: snapshot.result.failures.length,
            projectedReadingInventory: snapshot.result.projectedReadingInventory,
            failureTargets: snapshot.result.proofTargets.filter(target => target.failures.length > 0),
        })),
    };
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
import './src/reader/companions/annotations.ts';
import { collectScanTargets } from './src/reader/app/site-parsers.ts';
import {
    applyTokensToScanTarget,
    documentPortalReaderWordScopeForSource,
    makeRoomForRubyInCroppedRows,
    readerWordSurfaceText,
} from './src/reader/dom/index.ts';
import { DEFAULT_SETTINGS } from './src/reader/settings/index.ts';

const HAS_JAPANESE = /[\\u3040-\\u30ff\\u3400-\\u9fff]/u;
const HAN_RE = /\\p{Script=Han}/u;
const CONCRETE_PITCH_CLASSES = new Set(['heiban', 'atamadaka', 'nakadaka', 'odaka']);
let proofInitialized = false;
let proofTargetSnapshots = [];
let proofRubyRoomAdjustments = 0;
let nextProofTargetId = 0;
const proofAppliedScanParents = new WeakSet();
const proofPageOwnedInitialSnapshots = new WeakMap();
const proofPageOwnedScanAdmissions = new WeakMap();

window.__yomuRubyCoverageProof = async function runRubyCoverageProof(options) {
    const vocabulary = [...options.vocabulary].sort((a, b) => b.surface.length - a.surface.length);
    document.documentElement.classList.add('jpdb-reader-word-underline-pitch', 'jpdb-reader-word-text-jpdb');
    const allProofTargets = Array.from(document.querySelectorAll('[data-proof-target]'));
    const pageOwnedChromeElements = Array.from(document.querySelectorAll('[data-proof-page-owned]'));
    pageOwnedChromeElements.forEach(element => {
        if (!proofPageOwnedInitialSnapshots.has(element)) {
            proofPageOwnedInitialSnapshots.set(element, pageOwnedChromeSnapshot(element));
        }
    });
    allProofTargets.forEach(element => {
        if (element.dataset.proofTargetId === undefined) {
            element.dataset.proofTargetId = String(nextProofTargetId);
            nextProofTargetId += 1;
        }
    });
    // Mirror the visible-page scanner's scroll continuation without ever
    // re-applying an already-rendered static fixture target. Newly revealed
    // nodes may mount once; existing portals then have to survive and align
    // through the production scroll scheduler on their own.
    const targets = collectScanTargets(800, location.href, { skipMirroredHosts: proofInitialized })
        .filter(target => HAS_JAPANESE.test(target.text))
        .filter(target => !proofAppliedScanParents.has(target.parent));
    pageOwnedChromeElements.forEach(element => {
        let admitted = proofPageOwnedScanAdmissions.get(element);
        if (!admitted) {
            admitted = new Set();
            proofPageOwnedScanAdmissions.set(element, admitted);
        }
        targets.filter(target => scanTargetTouchesElement(target, element))
            .forEach(target => admitted.add(target.text));
    });
    if (targets.length) {
        const snapshots = targets.map(target => {
            markProofTargetScanFlags(target);
            return {
                text: target.text,
                tokenSurfaces: tokensForText(target.text, vocabulary).map(token => token.card.spelling),
                suppressRuby: target.suppressRuby === true,
                passiveInteraction: target.passiveInteraction === true,
                layoutSensitive: target.layoutSensitive === true,
            };
        });
        proofTargetSnapshots.push(...snapshots);

        for (const target of targets) {
            const tokens = tokensForText(target.text, vocabulary);
            if (tokens.length) applyTokensToScanTarget(target, tokens, {
                ...DEFAULT_SETTINGS,
                furiganaMode: 'all',
                wordTextColorSource: 'jpdb',
                wordUnderlineColorSource: 'pitch',
                wordHighlightColorSource: 'off',
            });
            proofAppliedScanParents.add(target.parent);
        }

        proofRubyRoomAdjustments += makeRoomForRubyInCroppedRows(document);
        // The production mount path owns its coalesced post-paint projection.
        // A lane reservation can deliberately defer exact projection by one
        // frame and the overlay owns a following coalesced paint. Let those
        // production callbacks settle; do not invoke either writer directly.
        await settleProductionProjection();
    }
    proofInitialized = true;
    const proofTargets = visibleProofTargets().map(element => auditProofTarget(element, vocabulary));
    const pageOwnedChrome = pageOwnedChromeElements.map(auditPageOwnedChrome);
    const hiddenFeedback = auditHiddenFeedback(proofTargetSnapshots);
    const nativeCaptions = auditNativeCaptionOverlays(proofTargetSnapshots);
    const projectedReadingInventory = auditProjectedReadingInventory();
    const renderedWords = renderedWordDetails(document.body);
    const failures = [
        ...proofTargets.flatMap(target => target.failures.map(message => target.label + ': ' + message)),
        ...pageOwnedChrome.flatMap(target => target.failures.map(message => target.label + ': ' + message)),
        ...hiddenFeedback.failures,
        ...nativeCaptions.failures,
        ...projectedReadingInventory.failures,
    ];
    if (proofTargetSnapshots.some(target => HAS_JAPANESE.test(target.text) && !target.tokenSurfaces.length && !/押下中/.test(target.text))) {
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
        rubyRoomAdjustments: proofRubyRoomAdjustments,
        targetTotal: allProofTargets.length,
        scanTargets: proofTargetSnapshots,
        proofTargets,
        pageOwnedChrome,
        hiddenFeedback,
        nativeCaptions,
        projectedReadingInventory,
        renderedWords,
    };
};

const PAGE_OWNED_ANNOTATION_SELECTOR = [
    '.jpdb-reader-word',
    '.jpdb-reader-text-mirror',
    '.jpdb-reader-source-fragment',
    '.jpdb-reader-detached-furi',
    'ruby',
    'rt',
    '[data-yomu-source-projected]',
].join(',');

function pageOwnedChromeSnapshot(element) {
    const rect = element.getBoundingClientRect();
    return {
        text: compactText(element.textContent || ''),
        html: element.innerHTML,
        attributes: Array.from(element.attributes)
            .map(attribute => attribute.name + '=' + attribute.value)
            .sort(),
        width: rect.width,
        height: rect.height,
    };
}

function auditPageOwnedChrome(element) {
    const label = element.getAttribute('data-proof-text') || compactText(element.textContent || '');
    const initial = proofPageOwnedInitialSnapshots.get(element);
    const current = pageOwnedChromeSnapshot(element);
    const sourceElements = [element, ...element.querySelectorAll('*')];
    const documentPortal = sourceElements.some(source => {
        const wordScope = documentPortalReaderWordScopeForSource(source);
        return Boolean(wordScope?.classList.contains('jpdb-reader-document-annotation-portal'));
    });
    const productionScanTexts = [...(proofPageOwnedScanAdmissions.get(element) ?? [])];
    const nativeAnnotationCount = element.querySelectorAll(PAGE_OWNED_ANNOTATION_SELECTOR).length;
    const failures = [];
    if (!initial) failures.push('missing initial page-owned snapshot');
    if (initial && JSON.stringify(current) !== JSON.stringify(initial)) {
        failures.push('native page-owned subtree or geometry changed');
    }
    if (productionScanTexts.length) failures.push('page-owned chrome entered the production scan');
    if (documentPortal) failures.push('page-owned chrome received a document annotation portal');
    if (nativeAnnotationCount) failures.push('page-owned chrome received inline reader annotations');
    return { label, productionScanTexts, documentPortal, nativeAnnotationCount, initial, current, failures };
}

function scanTargetTouchesElement(target, element) {
    if (element.contains(target.parent)) return true;
    return 'fragments' in target && target.fragments.some(fragment => {
        const parent = fragment.node.parentElement;
        return Boolean(parent && element.contains(parent));
    });
}

function nextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function settleProductionProjection() {
    for (let frame = 0; frame < 4; frame += 1) await nextPaint();
}

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
    // Source-preserving prose and page-owned chrome deliberately mount their
    // reader words in a body portal, outside the framework-owned source DOM.
    // Audit the registered source scope instead of mistaking that ownership
    // boundary for missing annotation coverage.
    const wordScope = documentPortalReaderWordScopeForSource(element) ?? element;
    const expectsDocumentPortal = element.dataset.proofExpectDocumentPortal === 'true';
    const documentPortal = wordScope !== element
        && wordScope.classList.contains('jpdb-reader-document-annotation-portal');
    const portalScopeMatchesTarget = wordScope === element
        || compactText(wordScope.dataset.sourceText || '') === compactText(element.textContent || '');
    const sourceFragmentCount = wordScope.querySelectorAll('.jpdb-reader-source-fragment').length;
    const nativeAnnotationWordCount = element.querySelectorAll('.jpdb-reader-word').length;
    // Audit every word inside an admitted visible target. Words on a later
    // native-clamped line can have no painted box yet still need complete
    // metadata for a later reveal or reflow.
    const words = renderedWordDetails(wordScope, true);
    const failures = [];
    const missingSurfaces = missingExpectedSurfaces(expectedSurfaces, words.map(word => word.surface));
    const clipped = isBoxClipped(element);
    const rubyOutOfBounds = outOfBoundsRubyCount(element);
    const uncoveredKanji = uncoveredKanjiForText(label, words.map(word => word.surface));
    const expectedClipInvariant = element.getAttribute('data-proof-expect-clip-invariant') === 'true';
    const clipMirror = clipHoverMirror(wordScope);
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
    const detachedReadings = Array.from(wordScope.querySelectorAll('.jpdb-reader-detached-furi'));
    const detachedReadingCount = detachedReadings.length;
    const expectedProjectedReadingSources = detachedReadings.filter(detachedReadingNeedsProjection);
    const projectedReadingAssociations = associateProjectedReadings(expectedProjectedReadingSources, element);
    const associatedSources = new Set(projectedReadingAssociations.map(association => association.source));
    const missingProjectedReadings = expectedProjectedReadingSources.filter(source => !associatedSources.has(source));
    const missingProjectedReadingCount = missingProjectedReadings.length;
    const misalignedProjectedReadings = projectedReadingAssociations.filter(association => (
        // The crowding solver intentionally shifts an edge reading when its
        // natural-width kana would collide with the next annotation. The exact
        // shift varies with the installed font, so a pixel delta is not a valid
        // cross-platform oracle. The reading must still cover the centre of its
        // own base while the source stamp and baseline remain exact.
        !association.sourceCentreCovered
        || !association.projectionTransformIntact
        || Math.abs(association.baselineDelta) > 1
        || !association.sourceStampMatchesBase
        || !association.sourceStampIntersectsTarget
    ));
    const clippedProjectedReadings = projectedReadingAssociations.filter(association => association.clipped);
    const projectedReadingMisaligned = misalignedProjectedReadings.length > 0;
    const detachedReadingClipped = clippedProjectedReadings.length > 0;
    const projectedReadingsComplete = expectedProjectedReadingSources.length > 0
        && missingProjectedReadingCount === 0
        && !projectedReadingMisaligned
        && !detachedReadingClipped;
    // A native line clamp intentionally clips paint outside its authored box.
    // A layout-neutral portal only satisfies that contract when its visible
    // source ranges have live, aligned, unclipped projected readings. Merely
    // retaining hidden source spans would let disappeared-but-clickable
    // furigana pass this release proof.
    const layoutNeutralDetached = detachedReadingCount > 0
        && projectedReadingsComplete
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
    if (expectsDocumentPortal && !documentPortal) failures.push('expected page-owned source to render through a document portal');
    if (expectsDocumentPortal && sourceFragmentCount === 0) failures.push('document portal has no painted source fragments');
    if (expectsDocumentPortal && nativeAnnotationWordCount > 0) failures.push('document portal annotation mutated the page-owned source subtree');
    if (!portalScopeMatchesTarget) failures.push('resolved portal scope belongs to a broader native source');
    if (!words.length) failures.push('no rendered reader words');
    if (missingSurfaces.length) failures.push('missing rendered surfaces: ' + missingSurfaces.join(', '));
    if (!rubySuppressed && words.some(word => word.requiresRuby && !word.hasRuby)) failures.push('kanji-bearing rendered word without furigana');
    if (words.some(word => word.source !== 'jpdb')) failures.push('rendered word without JPDB source metadata');
    if (words.some(word => !CONCRETE_PITCH_CLASSES.has(word.pitchClass))) failures.push('rendered word without concrete pitch class');
    if (uncoveredKanji.length) failures.push('uncovered kanji: ' + uncoveredKanji.join(''));
    if (missingProjectedReadingCount) failures.push(missingProjectedReadingCount + ' visible detached readings have no painted projection');
    if (projectedReadingMisaligned) {
        failures.push('projected reading/source alignment mismatch ' + JSON.stringify(
            misalignedProjectedReadings.map(projectedReadingAssociationDetails),
        ));
    }
    if (detachedReadingClipped) {
        failures.push('projected reading clipped by paint layer ' + JSON.stringify(
            clippedProjectedReadings.map(projectedReadingAssociationDetails),
        ));
    }
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
        const wordElements = Array.from(wordScope.querySelectorAll('.jpdb-reader-word')).filter(wordElement => (
            isVisibleElement(wordElement)
            || Array.from(wordElement.querySelectorAll('.jpdb-reader-source-fragment')).some(isVisibleElement)
        ));
        const bare = wordElements.filter(wordElement => !hasAtRestDecoration(wordElement));
        if (!wordElements.length || bare.length) failures.push('chrome word missing at-rest underline decoration (carve-out regressed)');
    }

    return {
        targetId: element.dataset.proofTargetId || '',
        label,
        text: compactText(element.textContent || ''),
        expectedSurfaces,
        expectsDocumentPortal,
        documentPortal,
        documentPortalClassName: documentPortal ? wordScope.className : '',
        portalScopeMatchesTarget,
        sourceFragmentCount,
        nativeAnnotationWordCount,
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
        targetRect: rectSnapshot(element.getBoundingClientRect()),
        detachedReadingCount,
        expectedProjectedReadingCount: expectedProjectedReadingSources.length,
        projectedReadingCount: projectedReadingAssociations.length,
        missingProjectedReadingCount,
        missingProjectedReadings: missingProjectedReadings.map(source => {
            const word = source.closest('.jpdb-reader-word');
            const base = source.closest('.jpdb-reader-detached-ruby') || word;
            return {
                reading: source.textContent || '',
                surface: word?.dataset.expression || word?.dataset.surface || '',
                baseRect: base ? rectSnapshot(base.getBoundingClientRect()) : null,
                sourceFragments: word
                    ? Array.from(word.querySelectorAll('.jpdb-reader-source-fragment'))
                        .map(fragment => rectSnapshot(fragment.getBoundingClientRect()))
                    : [],
                candidates: projectedReadingCandidates(source).map(projectedReadingCandidateDetails),
            };
        }),
        projectedReadingMisaligned,
        detachedReadingClipped,
        projectedReadings: projectedReadingAssociations.map(projectedReadingAssociationDetails),
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
    return isProofContentViewportVisibleElement(element)
        || Boolean(Array.from(element.querySelectorAll('.jpdb-reader-text-mirror'))
            .find(isProofContentViewportVisibleElement));
}

function detachedReadingNeedsProjection(reading) {
    const word = reading.closest('.jpdb-reader-word');
    if (!word) return false;
    const base = reading.closest('.jpdb-reader-detached-ruby') || word;
    const baseRect = base.getBoundingClientRect();
    const readingFontSize = Number.parseFloat(getComputedStyle(reading).fontSize)
        || Math.max(1, baseRect.height / 2);
    // The reading paints above its base. A base glyph can peek out below the
    // sticky proof header while the entire kana lane is still correctly
    // occluded; only demand a clone once that lane reaches usable content.
    if (baseRect.top - readingFontSize < proofContentViewportTop() - 0.5) return false;
    const fragments = Array.from(word.querySelectorAll('.jpdb-reader-source-fragment'));
    if (fragments.length) return fragments.some(isProofContentViewportVisibleElement);
    return isProofContentViewportVisibleElement(word);
}

function associateProjectedReadings(sources, target) {
    const targetRect = target.getBoundingClientRect();
    const available = new Set(
        Array.from(document.querySelectorAll('[data-yomu-projected-reading="true"]'))
            .filter(isPaintedProjectedReading),
    );
    const associations = [];
    for (const source of sources) {
        const base = source.closest('.jpdb-reader-detached-ruby')
            || source.closest('.jpdb-reader-word');
        const word = source.closest('.jpdb-reader-word');
        if (!base || !word) continue;
        const surface = word.dataset.expression || word.dataset.surface || '';
        const baseRect = base.getBoundingClientRect();
        const candidates = Array.from(available)
            .filter(clone => clone.textContent === source.textContent)
            .filter(clone => !surface || clone.dataset.yomuExpression === surface)
            // Duplicate labels are common across sibling YouTube cards. A
            // same-reading clone belongs here only when its production source
            // stamp identifies this exact base; proximity alone let one row's
            // 食べ歩き satisfy another row after scrolling.
            .filter(clone => projectedReadingCloneMatchesSource(clone, source))
            .map(clone => {
                const rect = clone.getBoundingClientRect();
                return {
                    clone,
                    score: Math.abs((rect.left + rect.right - baseRect.left - baseRect.right) / 2)
                        + Math.abs(rect.bottom - baseRect.top),
                };
            })
            .sort((left, right) => left.score - right.score);
        const clone = candidates[0]?.clone;
        if (!clone) continue;
        available.delete(clone);
        const cloneRect = clone.getBoundingClientRect();
        const sourceStamp = {
            left: Number(clone.dataset.yomuSourceLeft),
            top: Number(clone.dataset.yomuSourceTop),
            width: Number(clone.dataset.yomuSourceWidth),
            height: Number(clone.dataset.yomuSourceHeight),
        };
        const sourceStampIntersectsTarget = Object.values(sourceStamp).every(Number.isFinite)
            && sourceStamp.width > 0
            && sourceStamp.height > 0
            && sourceStamp.left < targetRect.right + 0.5
            && sourceStamp.left + sourceStamp.width > targetRect.left - 0.5
            && sourceStamp.top < targetRect.bottom + 0.5
            && sourceStamp.top + sourceStamp.height > targetRect.top - 0.5;
        const sourceStampMatchesBase = Object.values(sourceStamp).every(Number.isFinite)
            && Math.abs(sourceStamp.left + sourceStamp.width / 2 - (baseRect.left + baseRect.right) / 2) <= 1
            && Math.abs(sourceStamp.top - baseRect.top) <= 1
            && Math.abs(sourceStamp.width - baseRect.width) <= 1
            && Math.abs(sourceStamp.height - baseRect.height) <= 1;
        associations.push({
            source,
            clone,
            reading: source.textContent || '',
            surface,
            centerDelta: (cloneRect.left + cloneRect.right - baseRect.left - baseRect.right) / 2,
            sourceCentreCovered: projectedReadingCoversSourceCentre(cloneRect, baseRect),
            projectionTransformIntact: clone.style.getPropertyValue('transform')
                .startsWith('translate(-50%, -100%)')
                && clone.style.getPropertyPriority('transform') === 'important',
            baselineDelta: cloneRect.bottom - baseRect.top,
            sourceStampMatchesBase,
            sourceStampIntersectsTarget,
            clipped: isReadingClipped(clone),
        });
    }
    return associations;
}

function projectedReadingAssociationDetails(association) {
    return {
        reading: association.reading,
        surface: association.surface,
        centerDelta: association.centerDelta,
        sourceCentreCovered: association.sourceCentreCovered,
        projectionTransformIntact: association.projectionTransformIntact,
        baselineDelta: association.baselineDelta,
        sourceStampMatchesBase: association.sourceStampMatchesBase,
        sourceStampIntersectsTarget: association.sourceStampIntersectsTarget,
        clipped: association.clipped,
    };
}

function auditProjectedReadingInventory() {
    const clones = Array.from(document.querySelectorAll('[data-yomu-projected-reading="true"]'))
        .filter(isPaintedProjectedReading);
    const availableSources = new Set(document.querySelectorAll('.jpdb-reader-detached-furi'));
    const orphaned = [];
    const mispainted = [];
    for (const clone of clones) {
        const source = Array.from(availableSources)
            .find(candidate => projectedReadingCloneMatchesSource(clone, candidate));
        if (!source) {
            orphaned.push(clone);
            continue;
        }
        // Projection is a one-source/one-clone contract. Consuming the source
        // means a duplicate stale clone cannot borrow the same live source and
        // disappear from this inventory.
        availableSources.delete(source);
        if (!projectedReadingClonePaintMatchesSource(clone, source)) mispainted.push(clone);
    }
    const failures = [];
    if (orphaned.length) {
        failures.push(orphaned.length + ' painted projected readings have no live source '
            + JSON.stringify(orphaned.map(projectedReadingCandidateDetails)));
    }
    if (mispainted.length) {
        failures.push(mispainted.length + ' projected readings paint away from their live source '
            + JSON.stringify(mispainted.map(projectedReadingCandidateDetails)));
    }
    return {
        painted: clones.length,
        orphaned: orphaned.map(projectedReadingCandidateDetails),
        mispainted: mispainted.map(projectedReadingCandidateDetails),
        failures,
    };
}

function projectedReadingCandidates(source) {
    const word = source.closest('.jpdb-reader-word');
    const surface = word?.dataset.expression || word?.dataset.surface || '';
    return Array.from(document.querySelectorAll('[data-yomu-projected-reading="true"]'))
        .filter(clone => clone.textContent === source.textContent)
        .filter(clone => !surface || clone.dataset.yomuExpression === surface);
}

function projectedReadingCloneMatchesSource(clone, source) {
    const word = source.closest('.jpdb-reader-word');
    const surface = word?.dataset.expression || word?.dataset.surface || '';
    if (clone.textContent !== source.textContent) return false;
    if (surface && clone.dataset.yomuExpression !== surface) return false;
    const base = source.closest('.jpdb-reader-detached-ruby')
        || source.closest('.jpdb-reader-word');
    if (!base) return false;
    const baseRect = base.getBoundingClientRect();
    const left = Number(clone.dataset.yomuSourceLeft);
    const top = Number(clone.dataset.yomuSourceTop);
    const width = Number(clone.dataset.yomuSourceWidth);
    const height = Number(clone.dataset.yomuSourceHeight);
    return [left, top, width, height].every(Number.isFinite)
        && width > 0
        && height > 0
        && Math.abs(left + width / 2 - (baseRect.left + baseRect.right) / 2) <= 1
        && Math.abs(top - baseRect.top) <= 1
        && Math.abs(width - baseRect.width) <= 1
        && Math.abs(height - baseRect.height) <= 1;
}

function projectedReadingClonePaintMatchesSource(clone, source) {
    const base = source.closest('.jpdb-reader-detached-ruby')
        || source.closest('.jpdb-reader-word');
    if (!base) return false;
    const baseRect = base.getBoundingClientRect();
    const cloneRect = clone.getBoundingClientRect();
    return projectedReadingCoversSourceCentre(cloneRect, baseRect)
        && clone.style.getPropertyValue('transform').startsWith('translate(-50%, -100%)')
        && clone.style.getPropertyPriority('transform') === 'important'
        && Math.abs(cloneRect.bottom - baseRect.top) <= 1
        && !isReadingClipped(clone);
}

function projectedReadingCoversSourceCentre(cloneRect, baseRect) {
    const sourceCentre = (baseRect.left + baseRect.right) / 2;
    return cloneRect.left <= sourceCentre + 0.5
        && cloneRect.right >= sourceCentre - 0.5;
}

function projectedReadingCandidateDetails(clone) {
    const style = getComputedStyle(clone);
    return {
        reading: clone.textContent || '',
        surface: clone.dataset.yomuExpression || '',
        rect: rectSnapshot(clone.getBoundingClientRect()),
        sourceStamp: {
            left: Number(clone.dataset.yomuSourceLeft),
            top: Number(clone.dataset.yomuSourceTop),
            width: Number(clone.dataset.yomuSourceWidth),
            height: Number(clone.dataset.yomuSourceHeight),
        },
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        color: style.color,
        textFillColor: style.webkitTextFillColor,
        painted: isPaintedProjectedReading(clone),
    };
}

function isPaintedProjectedReading(element) {
    if (!isViewportVisibleElement(element)) return false;
    const style = getComputedStyle(element);
    return !isTransparentColor(style.color)
        && !isTransparentColor(style.webkitTextFillColor);
}

// Bare-until-hover suppression forces every decoration channel transparent, so
// a carved-out chrome word must keep at least one visible at rest.
function hasAtRestDecoration(wordElement) {
    const style = getComputedStyle(wordElement);
    const afterStyle = getComputedStyle(wordElement, '::after');
    return (style.textDecorationLine.includes('underline') && !isTransparentColor(style.textDecorationColor))
        || paintedPseudoUnderline(afterStyle)
        || Array.from(wordElement.querySelectorAll('.jpdb-reader-source-fragment'))
            .some(fragment => {
                if (!isVisibleElement(fragment)) return false;
                const fragmentAfterStyle = getComputedStyle(fragment, '::after');
                return paintedPseudoUnderline(fragmentAfterStyle);
            });
}

function paintedPseudoUnderline(style) {
    if (style.content === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity || 1) <= 0.01) return false;
    const borderPainted = Number.parseFloat(style.borderBlockEndWidth || '0') > 0
        && style.borderBlockEndStyle !== 'none'
        && !isTransparentColor(style.borderBlockEndColor);
    const imageSize = Number.parseFloat((style.backgroundSize || '').split(/\\s+/u)[0] || '0');
    const imagePainted = style.backgroundImage !== 'none'
        && Number.isFinite(imageSize)
        && imageSize > 0;
    return borderPainted || imagePainted;
}

function isTransparentColor(value) {
    const compact = String(value || '').replace(/\\s+/gu, '').toLowerCase();
    return !compact
        || compact === 'transparent'
        || /^rgba\\([^)]*,0(?:\\.0+)?\\)$/u.test(compact)
        || /^#[0-9a-f]{6}00$/u.test(compact);
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

function isProofContentViewportVisibleElement(element) {
    if (!isVisibleElement(element)) return false;
    const rect = element.getBoundingClientRect();
    const contentTop = proofContentViewportTop();
    return rect.bottom > contentTop + 0.5
        && rect.top < window.innerHeight - 0.5
        && rect.right > 0.5
        && rect.left < window.innerWidth - 0.5;
}

function proofContentViewportTop() {
    const status = document.querySelector('[data-proof-status]');
    const statusRect = status instanceof HTMLElement && isVisibleElement(status)
        ? status.getBoundingClientRect()
        : null;
    return statusRect && statusRect.bottom > 0 && statusRect.top < window.innerHeight
        ? Math.max(0, statusRect.bottom)
        : 0;
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

function rectSnapshot(rect) {
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
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
