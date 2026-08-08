import { describe, expect, it, vi } from 'vitest';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import {
    registerReaderHelpersCleanup,
    DEFAULT_SETTINGS,
    READER_WORD_CSS,
    YOUTUBE_WATCH_TEST_URL,
    applyTokensToScanTarget,
    card,
    collectScanTargets,
    collectTextTargetsIn,
    collectYouTubeTargets,
    collectYouTubeWatchTargets,
    expectBodyPassiveTextTargets,
    expectBodyTextTargets,
    expectRenderedPitchWord,
    getMatchingSiteParsers,
    mockElementBoundingClientRect,
    normalizeOcrResult,
    readerWordSurfaceText,
    readerTextMirrorForSource,
    readerWordsForSource,
} from './fixtures';
import type {
    JPDBToken,
    ReaderSettings,
    ScanTextTarget,
} from './fixtures';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('keeps YouTube owner subscriber chrome out of non-destructive mirrors across rescans', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 1000, height: 240 });
        try {
            document.body.innerHTML = `
                <ytd-watch-metadata>
                    <div id="owner">
                        <ytd-channel-name>
                            <yt-formatted-string id="text">
                                にほんごのじかん
                            </yt-formatted-string>
                        </ytd-channel-name>
                        <yt-formatted-string id="owner-sub-count">
                            チャンネル登録者数 2040人
                        </yt-formatted-string>
                    </div>
                </ytd-watch-metadata>
            `;

            const targets = collectScanTargets(10, YOUTUBE_WATCH_TEST_URL);
            const channel = targets.find(target => target.text.includes('にほんごのじかん'))!;
            expect(channel).toMatchObject({ nonDestructive: true });
            expect(channel.text).not.toContain('チャンネル登録者数');
            // Volatile subscriber chrome is no longer dropped: it rides the
            // passive non-destructive mirror, which absorbs the re-renders.
            const subCount = targets.find(target => target.text.includes('チャンネル登録者数 2040人'));
            expect(subCount).toMatchObject({ nonDestructive: true, passiveInteraction: true });

            const settings: ReaderSettings = { ...DEFAULT_SETTINGS, furiganaMode: 'all' };
            const channelToken: JPDBToken = {
                card: { ...card, cardState: ['known'], spelling: 'にほんご', reading: 'にほんご', source: 'jpdb' },
                start: channel.text.indexOf('にほんご'),
                end: channel.text.indexOf('にほんご') + 'にほんご'.length,
                length: 'にほんご'.length,
                rubies: [],
                pitchClass: 'heiban',
                sentence: channel.text,
            };
            applyTokensToScanTarget(channel, [channelToken], settings);

            const ownerHost = document.querySelector<HTMLElement>('#owner')!;
            const channelHost = document.querySelector<HTMLElement>('ytd-channel-name yt-formatted-string')!;
            const subscriberHost = document.querySelector<HTMLElement>('#owner-sub-count')!;
            let mirror = channelHost.querySelector<HTMLElement>(':scope > .jpdb-reader-text-mirror')!;
            expect(ownerHost.querySelectorAll(':scope > .jpdb-reader-text-mirror')).toHaveLength(0);
            expect(channelHost.querySelectorAll(':scope > .jpdb-reader-text-mirror')).toHaveLength(1);
            expect(mirror.textContent).not.toMatch(/\n|\s{2,}/u);
            expect(readerWordSurfaceText(mirror.querySelector<HTMLElement>('.jpdb-reader-word')!)).toBe('にほんご');
            expect(subscriberHost.querySelector('.jpdb-reader-word')).toBeNull();

            applyTokensToScanTarget(channel, [channelToken], settings);

            mirror = channelHost.querySelector<HTMLElement>(':scope > .jpdb-reader-text-mirror')!;
            expect(channelHost.querySelectorAll(':scope > .jpdb-reader-text-mirror')).toHaveLength(1);
            expect(subscriberHost.querySelector('.jpdb-reader-word')).toBeNull();
            expect(document.querySelector('.jpdb-reader-word .jpdb-reader-word')).toBeNull();
            expect(document.querySelector('ruby ruby')).toBeNull();
        } finally {
            rectSpy.mockRestore();
        }
    });

    it('scans YouTube live-chat frame fallback text', () => {
        const targets = collectYouTubeTargets(`
            <main>
                <h1>チャットをご利用いただけません</h1>
                <p>お使いのブラウザのバージョンが古いようです。チャットを使用するには、ブラウザをアップデートしてください。</p>
            </main>
        `, 'https://www.youtube.com/live_chat?continuation=test', undefined);

        const unavailable = targets.find(target => target.text.includes('チャットをご利用いただけません'))!;
        expect(unavailable).toMatchObject({ nonDestructive: true });
        applyTokensToScanTarget(unavailable, [{
            card: { ...card, cardState: ['known'], spelling: 'チャット', reading: 'チャット', source: 'jpdb' },
            start: 0,
            end: 4,
            length: 4,
            rubies: [{ text: 'チャット', start: 0, end: 4, length: 4 }],
            pitchClass: 'heiban',
            sentence: 'チャットをご利用いただけません',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const chatWord = document.querySelector<HTMLElement>('main .jpdb-reader-text-mirror .jpdb-reader-word')!;
        expect(readerWordSurfaceText(chatWord)).toBe('チャット');
        expectRenderedPitchWord(chatWord, 'heiban');
    });

    it('scans YouTube live-chat frame notices without mirroring chat containers', () => {
        const notice = 'チャンネル登録者のみモード。このチャンネルの登録期間が5分以上のユーザーからのメッセージが表示されます。';
        const targets = collectYouTubeTargets(`
            <main>
                <yt-live-chat-app>
                    <yt-live-chat-renderer>
                        <div id="chat-messages">
                            <yt-live-chat-restricted-participation-renderer>
                                <yt-formatted-string id="message">チャンネル登<span>録者</span>のみモード。このチャンネルの登録期間が5分以上のユーザーからのメッセージが表示されます。</yt-formatted-string>
                                <span id="subtext" role="button">詳細</span>
                            </yt-live-chat-restricted-participation-renderer>
                        </div>
                    </yt-live-chat-renderer>
                </yt-live-chat-app>
            </main>
        `, 'https://www.youtube.com/live_chat?continuation=test', undefined);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            notice,
            '詳細',
        ]));
        expect(targets.filter(target => target.text.includes('チャンネル登録者のみ'))).toHaveLength(1);
        expect(targets.some(target => target.parent === document.body)).toBe(false);
        expect(targets.some(target => target.parent.matches('main,[role="main"]'))).toBe(false);
        expect(targets.some(target => target.parent.matches('yt-live-chat-renderer #chat-messages'))).toBe(false);

        const noticeTarget = targets.find(target => target.text === notice)!;
        const detailTarget = targets.find(target => target.text === '詳細')!;
        expect(noticeTarget).toMatchObject({ nonDestructive: true });
        expect(detailTarget).toMatchObject({ nonDestructive: true, passiveInteraction: true });
        expect('fragments' in noticeTarget ? noticeTarget.fragments.length : 0).toBeGreaterThan(1);

        applyTokensToScanTarget(noticeTarget, [{
            card: { ...card, cardState: ['known'], spelling: '登録者', reading: 'とうろくしゃ', source: 'jpdb' },
            start: notice.indexOf('登録者'),
            end: notice.indexOf('登録者') + '登録者'.length,
            length: '登録者'.length,
            rubies: [{ text: 'とうろくしゃ', start: notice.indexOf('登録者'), end: notice.indexOf('登録者') + '登録者'.length, length: '登録者'.length }],
            pitchClass: 'heiban',
            sentence: notice,
        }, {
            card: { ...card, vid: card.vid + 1, sid: card.sid + 1, cardState: ['known'], spelling: '表示', reading: 'ひょうじ', source: 'jpdb' },
            start: notice.indexOf('表示'),
            end: notice.indexOf('表示') + '表示'.length,
            length: '表示'.length,
            rubies: [{ text: 'ひょうじ', start: notice.indexOf('表示'), end: notice.indexOf('表示') + '表示'.length, length: '表示'.length }],
            pitchClass: 'heiban',
            sentence: notice,
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(detailTarget, [{
            card: { ...card, cardState: ['known'], spelling: '詳細', reading: 'しょうさい', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'しょうさい', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '詳細',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const noticeHost = document.querySelector<HTMLElement>('yt-live-chat-restricted-participation-renderer #message')!;
        const noticeMirror = readerTextMirrorForSource(noticeHost)!;
        const noticeWords = readerWordsForSource(noticeHost);
        expect(noticeWords.map(word => readerWordSurfaceText(word))).toEqual(['登録者', '表示']);
        expect(noticeWords.map(word => word.querySelector('rt, .jpdb-reader-detached-furi')?.textContent)).toEqual(['とうろくしゃ', 'ひょうじ']);
        expect(noticeHost.contains(noticeMirror)).toBe(false);
        expect(document.querySelectorAll('yt-live-chat-renderer #chat-messages > .jpdb-reader-text-mirror')).toHaveLength(0);
        expect(document.querySelectorAll('yt-live-chat-restricted-participation-renderer > .jpdb-reader-text-mirror')).toHaveLength(0);
        const detailWord = document.querySelector<HTMLElement>('yt-live-chat-restricted-participation-renderer #subtext .jpdb-reader-word')!;
        expect(readerWordSurfaceText(detailWord)).toBe('詳細');
        expect(detailWord.dataset.jpdbReaderPassive).toBe('true');
        // The 詳細 subtext is a control (role="button"): detached reading, no
        // inline ruby, so the notice row keeps its authored height.
        expect(detailWord.querySelector('rt')).toBeNull();
        expect(document.querySelector('yt-live-chat-restricted-participation-renderer #subtext .jpdb-reader-detached-furi')?.textContent).toBe('しょうさい');
    });

    it('scans YouTube watch metadata live-chat teaser carousel text', () => {
        const targets = collectYouTubeWatchTargets(`
            <ytd-watch-metadata>
                <div id="teaser-carousel">
                    <yt-video-metadata-carousel-view-model>
                        <yt-carousel-title-view-model>
                            <h2>チャット</h2>
                        </yt-carousel-title-view-model>
                        <yt-text-carousel-item-view-model>
                            <span class="ytAttributedStringHost">会話に参加して、クリエイターや、このライブ配信を視聴している人たちと交流する。</span>
                            <button>パネルを開く</button>
                        </yt-text-carousel-item-view-model>
                    </yt-video-metadata-carousel-view-model>
                </div>
            </ytd-watch-metadata>
        `);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            'チャット',
            '会話に参加して、クリエイターや、このライブ配信を視聴している人たちと交流する。',
            'パネルを開く',
        ]));

        const engagement = targets.find(target => target.text.startsWith('会話に参加して'))!;
        applyTokensToScanTarget(engagement, [{
            card: { ...card, cardState: ['known'], spelling: '会話', reading: 'かいわ', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'かいわ', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '会話に参加して、クリエイターや、このライブ配信を視聴している人たちと交流する。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const engagementWord = document.querySelector<HTMLElement>('yt-text-carousel-item-view-model .jpdb-reader-text-mirror .jpdb-reader-word')!;
        expect(readerWordSurfaceText(engagementWord)).toBe('会話');
        expect(engagementWord.querySelector('rt, .jpdb-reader-detached-furi')?.textContent).toBe('かいわ');
        expectRenderedPitchWord(engagementWord, 'heiban');
    });

    it('scans YouTube player settings submenu labels', () => {
        const targets = collectYouTubeWatchTargets(`
            <div id="movie_player" class="html5-video-player">
                <div class="ytp-popup ytp-settings-menu">
                    <div class="ytp-panel">
                        <div class="ytp-panel-menu">
                            <div class="ytp-menuitem" role="menuitemcheckbox">
                                <div class="ytp-menuitem-icon"></div>
                                <div class="ytp-menuitem-label">一定音量</div>
                                <div class="ytp-menuitem-content">オン</div>
                            </div>
                            <div class="ytp-menuitem" role="menuitem">
                                <div class="ytp-menuitem-label">音声ブースト</div>
                            </div>
                            <div class="ytp-menuitem" role="menuitemcheckbox">
                                <div class="ytp-menuitem-label">シネマティック ライティング</div>
                            </div>
                            <div class="ytp-menuitem" role="menuitem">
                                <div class="ytp-menuitem-label">字幕 (1)</div>
                                <div class="ytp-menuitem-content">オフ</div>
                            </div>
                            <div class="ytp-menuitem" role="menuitem">
                                <div class="ytp-menuitem-label">再生速度</div>
                                <div class="ytp-menuitem-content">標準</div>
                            </div>
                            <div class="ytp-menuitem" role="menuitem">
                                <div class="ytp-menuitem-label">画質</div>
                                <div class="ytp-menuitem-content">自動 (1080p HD)</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '一定音量',
            '音声ブースト',
            'シネマティック ライティング',
            '字幕 (1)',
            '再生速度',
            '画質',
        ]));
        expect(document.querySelector('.ytp-menuitem-label .jpdb-reader-word')).toBeNull();
    });

    it('scans dynamic player panel headings and keeps preset labels passive', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 330, height: 57 });
        document.body.innerHTML = `
            <main>
                <div id="movie_player" class="html5-video-player">
                    <div class="ytp-popup ytp-settings-menu">
                        <div class="ytp-panel">
                            <div class="ytp-panel-header">
                                <div class="ytp-panel-back-button-container">
                                    <button class="ytp-panel-back-button" aria-label="前のメニューに戻る"></button>
                                </div>
                                <span class="ytp-panel-title" role="heading">再生速度</span>
                            </div>
                            <div class="ytp-variable-speed-panel-content">
                                <div class="ytp-variable-speed-panel-chips">
                                    <div class="ytp-variable-speed-panel-preset-button-wrapper">
                                        <button><span>1.0</span></button>
                                        <div class="ytp-variable-speed-panel-preset-button-label-text">標準</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        `;
        let targets: ReturnType<typeof collectScanTargets>;
        try {
            targets = collectScanTargets(10, YOUTUBE_WATCH_TEST_URL);
        } finally {
            rectSpy.mockRestore();
        }

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining(['再生速度', '標準']));
        expect(targets.find(target => target.text === '再生速度')?.decoration).toBe('interactive-passive');
        expect(targets.find(target => target.text === '標準')?.decoration).toBe('interactive-passive');
        expect(targets.find(target => target.text === '標準')?.suppressRuby).toBe(true);
    });

    it('scans YouTube homepage, Shorts gallery, and suggested video titles without losing base text', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        try {
            const targets = collectYouTubeTargets(`
                <ytd-app>
                    <ytd-rich-grid-renderer>
                        <ytd-rich-item-renderer>
                            <a id="video-title-link" href="/watch?v=jp">服代が月1万から20万円！？東京の春コーデ</a>
                            <ytd-channel-name><a href="/@tokyo">東京散歩チャンネル</a></ytd-channel-name>
                            <div id="metadata-line"><span>3日前</span></div>
                        </ytd-rich-item-renderer>
                        <ytd-rich-item-renderer>
                            <a id="video-title-link" href="/watch?v=podcast">弱いままの自分で大丈夫。Japanese Podcast</a>
                        </ytd-rich-item-renderer>
                    </ytd-rich-grid-renderer>
                </ytd-app>
                <ytm-app>
                    <ytm-rich-grid-renderer>
                        <ytm-video-with-context-renderer>
                            <a href="/watch?v=mobile-jp"><h3 class="media-item-headline">東京散歩</h3></a>
                        </ytm-video-with-context-renderer>
                    </ytm-rich-grid-renderer>
                </ytm-app>
                <ytd-watch-next-secondary-results-renderer>
                    <ytd-compact-video-renderer>
                        <a id="video-title" href="/watch?v=side">関連動画の発行ニュース</a>
                    </ytd-compact-video-renderer>
                </ytd-watch-next-secondary-results-renderer>
            `, 'https://www.youtube.com/', 10);

            expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
                '服代が月1万から20万円！？東京の春コーデ',
                '弱いままの自分で大丈夫。Japanese Podcast',
                '東京散歩',
                '関連動画の発行ニュース',
                '東京散歩チャンネル',
                '3日前',
            ]));

            const title = targets.find(target => target.text === '服代が月1万から20万円！？東京の春コーデ')!;
            applyTokensToScanTarget(title, [{
                card: { ...card, cardState: ['known'], spelling: '東京', reading: 'とうきょう', source: 'jpdb' },
                start: 14,
                end: 16,
                length: 2,
                rubies: [{ text: 'とうきょう', start: 14, end: 16, length: 2 }],
                pitchClass: 'heiban',
                sentence: '服代が月1万から20万円！？東京の春コーデ',
            }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

            const word = document.querySelector<HTMLElement>('a#video-title-link .jpdb-reader-word')!;
            expect(readerWordSurfaceText(word)).toBe('東京');
            expect(word.querySelector('rt, .jpdb-reader-detached-furi')?.textContent).toBe('とうきょう');
            expectRenderedPitchWord(word, 'heiban');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('leaves clipped Shorts Share and Remix controls entirely page-owned', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/shorts/abc123',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/shorts/abc123',
        });
        try {
            const targets = collectYouTubeTargets(`
                <ytd-shorts>
                    <ytd-reel-player-overlay-renderer>
                        <div id="actions" role="toolbar">
                            <button id="share" aria-label="共有">
                                <span style="display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">共有</span>
                            </button>
                            <button id="remix" aria-label="リミックス">
                                <span style="display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">リミックス</span>
                            </button>
                        </div>
                        <div id="description">日本語の説明</div>
                    </ytd-reel-player-overlay-renderer>
                </ytd-shorts>
            `, 'https://www.youtube.com/shorts/abc123', 20);
            const before = document.querySelector('#actions')?.innerHTML;

            expect(targets.some(target => target.text === '日本語の説明')).toBe(true);
            expect(targets.some(target => target.text === '共有')).toBe(false);
            expect(targets.some(target => target.text === 'リミックス')).toBe(false);
            expect(document.querySelector('#actions')?.innerHTML).toBe(before);
            expect(document.querySelector('#actions .jpdb-reader-word')).toBeNull();
            expect(document.querySelector('#actions .jpdb-reader-text-mirror')).toBeNull();
            expect(document.querySelector('.jpdb-reader-youtube-chrome-portal')).toBeNull();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('flushes production fragment runs around a page-owned mobile Shorts action rail before CSS hydration', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/feed/shorts',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/feed/shorts',
        });
        try {
            const targets = collectYouTubeTargets(`
                <ytd-rich-grid-renderer>
                    <a id="video-title" href="/shorts/one">大阪で食べ歩き</a>
                </ytd-rich-grid-renderer>
                <ytm-shorts>
                    <div id="actions" role="toolbar">
                        <button aria-label="共有">
                            <span id="share" class="proof-shorts-action-label">共有</span>
                        </button>
                    </div>
                    <section id="details">日本語の説明</section>
                </ytm-shorts>
            `, 'https://www.youtube.com/feed/shorts', 40);

            expect(targets.some(target => target.text.includes('大阪で食べ歩き'))).toBe(true);
            expect(targets.some(target => target.text.includes('日本語の説明'))).toBe(true);
            expect(targets.some(target => target.text.includes('共有'))).toBe(false);
            expect(document.querySelector('#actions .jpdb-reader-word')).toBeNull();
            expect(document.querySelector('#actions .jpdb-reader-text-mirror')).toBeNull();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps native Shorts chrome page-owned when the active target and UI are non-Japanese', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/shorts/espanol',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/shorts/espanol',
        });
        expect(setActiveLearningTargetLanguage('es')).not.toBeNull();
        try {
            const targets = collectYouTubeTargets(`
                <ytm-shorts>
                    <div class="shorts-action-rail" role="toolbar">
                        <button aria-label="Compartir"><span>Compartir</span></button>
                    </div>
                    <section>Estudio palabras nuevas cada día</section>
                </ytm-shorts>
            `, 'https://www.youtube.com/shorts/espanol', 20);

            expect(targets.some(target => target.text.includes('Estudio palabras nuevas'))).toBe(true);
            expect(targets.some(target => target.text.includes('Compartir'))).toBe(false);
        } finally {
            resetActiveLearningTargetLanguage();
            vi.unstubAllGlobals();
        }
    });

    it('prioritizes YouTube watch sidebar recommendations before busy live chat at low limits', () => {
        vi.stubGlobal('location', {
            href: YOUTUBE_WATCH_TEST_URL,
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/watch',
        });
        try {
            const targets = collectYouTubeWatchTargets(`
                <ytd-watch-metadata>
                    <h1>日本の習慣｜おばあちゃんが今も大切にしていること</h1>
                    <div id="description-inline-expander">説明では日本語で詳しく紹介しています。</div>
                </ytd-watch-metadata>
                <section id="comments">
                    <ytd-comment-view-model><yt-attributed-string id="content-text">先生いつもありがとうございました。</yt-attributed-string></ytd-comment-view-model>
                    <ytd-comment-view-model><yt-attributed-string id="content-text">今日も本を読みます。</yt-attributed-string></ytd-comment-view-model>
                </section>
                <yt-live-chat-app>
                    <yt-live-chat-text-message-renderer>
                        <span id="author-name">先生</span>
                        <yt-formatted-string id="message">今日はライブで日本語を聞いています。</yt-formatted-string>
                    </yt-live-chat-text-message-renderer>
                    <yt-live-chat-text-message-renderer>
                        <span id="author-name">生徒</span>
                        <yt-formatted-string id="message">復習用の会話を続けています。</yt-formatted-string>
                </yt-live-chat-text-message-renderer>
            </yt-live-chat-app>
            <aside id="secondary">
                <ytd-compact-video-renderer>
                    <a id="video-title" href="/watch?v=side-jp">東京で見る関連動画ニュース</a>
                </ytd-compact-video-renderer>
            </aside>
        `, 8);

            expect(targets.map(target => target.text)).toContain('東京で見る関連動画ニュース');

            const sidebar = targets.find(target => target.text === '東京で見る関連動画ニュース')!;
            applyTokensToScanTarget(sidebar, [{
                card: { ...card, cardState: ['known'], spelling: '東京', reading: 'とうきょう', source: 'jpdb' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'とうきょう', start: 0, end: 2, length: 2 }],
                pitchClass: 'heiban',
                sentence: '東京で見る関連動画ニュース',
            }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

            const word = document.querySelector<HTMLElement>('ytd-compact-video-renderer .jpdb-reader-word')!;
            expect(readerWordSurfaceText(word)).toBe('東京');
            expect(word.querySelector('rt, .jpdb-reader-detached-furi')?.textContent).toBe('とうきょう');
            expectRenderedPitchWord(word, 'heiban');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('scans YouTube transcript rows while leaving native caption overlays untouched', () => {
        const targets = collectYouTubeWatchTargets(`
            <div id="movie_player" class="html5-video-player">
                <div class="ytp-caption-window-container">
                    <span class="ytp-caption-segment">先生いつもありがとうございました。</span>
                </div>
            </div>
            <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript">
                <ytd-transcript-renderer>
                    <ytd-transcript-body-renderer>
                        <ytd-transcript-segment-renderer>
                            <div class="segment-timestamp">0:12</div>
                            <yt-formatted-string class="segment-text">日本語の字幕を確認します。</yt-formatted-string>
                        </ytd-transcript-segment-renderer>
                    </ytd-transcript-body-renderer>
                </ytd-transcript-renderer>
            </ytd-engagement-panel-section-list-renderer>
        `);

        expect(targets.map(target => target.text)).toContain('日本語の字幕を確認します。');
        expect(targets.map(target => target.text)).not.toContain('先生いつもありがとうございました。');

        const transcript = targets.find(target => target.text === '日本語の字幕を確認します。')!;
        applyTokensToScanTarget(transcript, [{
            card: { ...card, cardState: ['known'], spelling: '字幕', reading: 'じまく', source: 'jpdb' },
            start: 4,
            end: 6,
            length: 2,
            rubies: [{ text: 'じまく', start: 4, end: 6, length: 2 }],
            pitchClass: 'heiban',
            sentence: '日本語の字幕を確認します。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const transcriptHost = document.querySelector<HTMLElement>('ytd-transcript-segment-renderer .segment-text')!;
        const transcriptMirror = readerTextMirrorForSource(transcriptHost)!;
        const word = readerWordsForSource(transcriptHost)[0]!;
        expect(readerWordSurfaceText(word)).toBe('字幕');
        expect(word.querySelector('rt, .jpdb-reader-detached-furi')?.textContent).toBe('じまく');
        expectRenderedPitchWord(word, 'heiban');
        expect(transcriptHost.contains(transcriptMirror)).toBe(false);
        expect(document.querySelector('.ytp-caption-segment .jpdb-reader-word')).toBeNull();
    });

    it('prioritizes YouTube watch title, description, and transcript ahead of large virtualized grids', () => {
        const targets = collectYouTubeTargets(`
            <ytd-rich-grid-renderer>
                ${Array.from({ length: 80 }, (_, index) => `
                    <ytd-rich-item-renderer>
                        <a id="video-title-link" href="/watch?v=${index}">関連動画${index}の日本語タイトル</a>
                    </ytd-rich-item-renderer>
                `).join('')}
            </ytd-rich-grid-renderer>
            <ytd-watch-metadata>
                <h1 id="title"><yt-attributed-string>日本語タイトルを読む</yt-attributed-string></h1>
                <div id="description">
                    <yt-attributed-string id="attributed-description-text">説明文で日本語を勉強します。</yt-attributed-string>
                </div>
            </ytd-watch-metadata>
            <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript">
                <ytd-transcript-segment-renderer>
                    <yt-formatted-string class="segment-text">字幕で確認します。</yt-formatted-string>
                </ytd-transcript-segment-renderer>
            </ytd-engagement-panel-section-list-renderer>
        `, YOUTUBE_WATCH_TEST_URL, 6);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '日本語タイトルを読む',
            '説明文で日本語を勉強します。',
            '字幕で確認します。',
        ]));
    });

    it('keeps YouTube watch metadata and comments header ahead of long transcript batches', () => {
        const targets = collectYouTubeTargets(`
            <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript">
                ${Array.from({ length: 150 }, (_, index) => `
                    <ytd-transcript-segment-renderer>
                        <yt-formatted-string class="segment-text">字幕${index}で日本語を確認します。</yt-formatted-string>
                    </ytd-transcript-segment-renderer>
                `).join('')}
            </ytd-engagement-panel-section-list-renderer>
            <ytd-watch-metadata>
                <h1 id="title"><yt-attributed-string>大学は新しい学生寮を作りました</yt-attributed-string></h1>
                <div id="description">
                    <yt-attributed-string id="attributed-description-text">説明文で日本語を勉強します。</yt-attributed-string>
                </div>
            </ytd-watch-metadata>
            <ytd-comments-header-renderer>
                <h2 id="title"><yt-formatted-string>443 件のコメント</yt-formatted-string></h2>
            </ytd-comments-header-renderer>
        `, YOUTUBE_WATCH_TEST_URL, 12);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '大学は新しい学生寮を作りました',
            '説明文で日本語を勉強します。',
            '443 件のコメント',
            '字幕0で日本語を確認します。',
        ]));

        const commentsHeader = targets.find(target => target.text === '443 件のコメント')!;
        applyTokensToScanTarget(commentsHeader, [{
            card: { ...card, cardState: ['known'], spelling: '件', reading: 'けん', source: 'jpdb' },
            start: 4,
            end: 5,
            length: 1,
            rubies: [{ text: 'けん', start: 4, end: 5, length: 1 }],
            pitchClass: 'heiban',
            sentence: '443 件のコメント',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const headerWord = document.querySelector<HTMLElement>('ytd-comments-header-renderer .jpdb-reader-word')!;
        expect(readerWordSurfaceText(headerWord)).toBe('件');
        expect(headerWord.querySelector('rt, .jpdb-reader-detached-furi')?.textContent).toBe('けん');
        expectRenderedPitchWord(headerWord, 'heiban');
    });

    it('scans YouTube masthead and mini-guide chrome passively', () => {
        const targets = collectYouTubeTargets(`
            <ytd-masthead>
                <yt-button-shape>
                    <button aria-label="作成">
                        <div aria-hidden="true"><span><svg></svg></span></div>
                        <div class="ytSpecButtonShapeNextButtonTextContent">
                            <span class="ytAttributedStringHost" role="text">作成</span>
                        </div>
                        <yt-touch-feedback-shape aria-hidden="true"><div>押下中</div></yt-touch-feedback-shape>
                    </button>
                </yt-button-shape>
            </ytd-masthead>
            <ytd-mini-guide-renderer role="navigation" mini-guide-visible>
                <div id="items">
                    <ytd-mini-guide-entry-renderer>
                        <a id="endpoint" class="yt-simple-endpoint" aria-label="ホーム" title="ホーム" href="/">
                            <yt-icon aria-hidden="true"></yt-icon>
                            <span class="title">ホーム</span>
                            <tp-yt-paper-tooltip hidden><div id="tooltip">ホーム</div></tp-yt-paper-tooltip>
                        </a>
                    </ytd-mini-guide-entry-renderer>
                    <ytd-mini-guide-entry-renderer>
                        <a id="endpoint" class="yt-simple-endpoint" aria-label="登録チャンネル" title="登録チャンネル" href="/feed/subscriptions">
                            <yt-icon aria-hidden="true"></yt-icon>
                            <span class="title">登録チャンネル</span>
                            <tp-yt-paper-tooltip hidden><div id="tooltip">登録チャンネル</div></tp-yt-paper-tooltip>
                        </a>
                    </ytd-mini-guide-entry-renderer>
                </div>
            </ytd-mini-guide-renderer>
        `, 'https://www.youtube.com/', 10);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '作成',
            'ホーム',
            '登録チャンネル',
        ]));
        expect(targets.map(target => target.text)).not.toEqual(expect.arrayContaining([
            '押下中',
        ]));
        expect(targets.every(target => target.passiveInteraction === true)).toBe(true);

        const create = targets.find(target => target.text === '作成')!;
        applyTokensToScanTarget(create, [{
            card: { ...card, cardState: ['known'], spelling: '作成', reading: 'さくせい', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'さくせい', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '作成',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const createWord = document.querySelector<HTMLElement>('ytd-masthead .jpdb-reader-word')!;
        expect(readerWordSurfaceText(createWord)).toBe('作成');
        expect(createWord.dataset.jpdbReaderPassive).toBe('true');
        expect(createWord.tabIndex).toBe(-1);
        const home = targets.find(target => target.text === 'ホーム')!;
        applyTokensToScanTarget(home, [{
            card: { ...card, cardState: ['known'], spelling: 'ホーム', reading: 'ほーむ', source: 'jpdb' },
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'ほーむ', start: 0, end: 3, length: 3 }],
            pitchClass: 'heiban',
            sentence: 'ホーム',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        const homeWord = document.querySelector<HTMLElement>('ytd-mini-guide-renderer .jpdb-reader-word')!;
        expect(readerWordSurfaceText(homeWord)).toBe('ホーム');
        expect(homeWord.dataset.jpdbReaderPassive).toBe('true');
    });

    it('scans modern YouTube view-model chrome passively', () => {
        const targets = collectYouTubeTargets(`
            <ytd-masthead>
                <yt-button-view-model>
                    <button type="button" aria-label="作成">
                        <span class="yt-core-attributed-string ytAttributedStringHost">作成</span>
                    </button>
                </yt-button-view-model>
            </ytd-masthead>
            <ytd-mini-guide-renderer role="navigation">
                <yt-mini-guide-entry-renderer>
                    <a href="/" aria-label="ホーム"><span class="title">ホーム</span></a>
                </yt-mini-guide-entry-renderer>
            </ytd-mini-guide-renderer>
            <yt-chip-cloud-chip-view-model>
                <button role="tab" aria-selected="false">
                    <span class="yt-core-attributed-string ytAttributedStringHost">関連動画</span>
                </button>
            </yt-chip-cloud-chip-view-model>
        `, 'https://www.youtube.com/', 10);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '作成',
            '関連動画',
            'ホーム',
        ]));
        expect(targets.every(target => target.passiveInteraction === true)).toBe(true);

        const related = targets.find(target => target.text === '関連動画')!;
        applyTokensToScanTarget(related, [{
            card: { ...card, cardState: ['known'], spelling: '関連動画', reading: 'かんれんどうが', source: 'jpdb' },
            start: 0,
            end: 4,
            length: 4,
            rubies: [{ text: 'かんれんどうが', start: 0, end: 4, length: 4 }],
            pitchClass: 'heiban',
            sentence: '関連動画',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const chipWord = document.querySelector<HTMLElement>('yt-chip-cloud-chip-view-model .jpdb-reader-word')!;
        expect(readerWordSurfaceText(chipWord)).toBe('関連動画');
        expect(chipWord.dataset.jpdbReaderPassive).toBe('true');
        expectRenderedPitchWord(chipWord, 'heiban');
    });

    it('scans YouTube chip cloud tabs passively while ignoring feedback chrome', () => {
        const targets = collectYouTubeTargets(`
            <iron-selector id="chips" role="tablist" selected-attribute="selected">
                <yt-chip-cloud-chip-renderer selected="">
                    <div id="chip-shape-container">
                        <chip-shape>
                            <button role="tab" aria-selected="true">
                                <div class="ytChipShapeChip ytChipShapeActive ytChipShapeOnlyTextPadding">
                                    <div>すべて</div>
                                    <yt-touch-feedback-shape aria-hidden="true"><div>押下中</div></yt-touch-feedback-shape>
                                </div>
                            </button>
                        </chip-shape>
                    </div>
                </yt-chip-cloud-chip-renderer>
                <yt-chip-cloud-chip-renderer>
                    <div id="chip-shape-container">
                        <chip-shape>
                            <button role="tab" aria-selected="false">
                                <div class="ytChipShapeChip ytChipShapeInactive ytChipShapeOnlyTextPadding"><div>関連動画</div></div>
                            </button>
                        </chip-shape>
                    </div>
                </yt-chip-cloud-chip-renderer>
                <yt-chip-cloud-chip-renderer>
                    <div id="chip-shape-container">
                        <chip-shape>
                            <button role="tab" aria-selected="false">
                                <div class="ytChipShapeChip ytChipShapeInactive ytChipShapeOnlyTextPadding"><div>最近アップロードされた動画</div></div>
                            </button>
                        </chip-shape>
                    </div>
                </yt-chip-cloud-chip-renderer>
            </iron-selector>
        `, YOUTUBE_WATCH_TEST_URL, 10);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            'すべて',
            '関連動画',
            '最近アップロードされた動画',
        ]));
        expect(targets.map(target => target.text)).not.toContain('押下中');

        const related = targets.find(target => target.text === '関連動画')!;
        applyTokensToScanTarget(related, [{
            card: { ...card, cardState: ['known'], spelling: '関連動画', reading: 'かんれんどうが', source: 'jpdb' },
            start: 0,
            end: 4,
            length: 4,
            rubies: [{ text: 'かんれんどうが', start: 0, end: 4, length: 4 }],
            pitchClass: 'heiban',
            sentence: '関連動画',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const chipWord = document.querySelector<HTMLElement>('yt-chip-cloud-chip-renderer .jpdb-reader-word')!;
        expect(readerWordSurfaceText(chipWord)).toBe('関連動画');
        expect(chipWord.dataset.jpdbReaderPassive).toBe('true');
        expect(chipWord.tabIndex).toBe(-1);

        const feedTargets = collectYouTubeTargets(`
            <div id="chips-content" class="style-scope ytd-feed-filter-chip-bar-renderer">
                <div id="left-arrow">
                    <ytd-button-renderer><yt-button-shape><button aria-label="前へ"><div aria-hidden="true"></div></button></yt-button-shape></ytd-button-renderer>
                </div>
                <div id="scroll-container">
                    <iron-selector id="chips" role="tablist" selected-attribute="selected">
                        <yt-chip-cloud-chip-renderer selected="" chip-style="STYLE_HOME_FILTER">
                            <div id="chip-shape-container"><chip-shape><button role="tab" aria-selected="true"><div class="ytChipShapeChip"><div>すべて</div></div></button></chip-shape></div>
                        </yt-chip-cloud-chip-renderer>
                        <yt-chip-cloud-chip-renderer chip-style="STYLE_HOME_FILTER">
                            <div id="chip-shape-container"><chip-shape><button role="tab" aria-selected="false"><div class="ytChipShapeChip"><div>観光</div></div></button></chip-shape></div>
                        </yt-chip-cloud-chip-renderer>
                        <yt-chip-cloud-chip-renderer chip-style="STYLE_HOME_FILTER">
                            <div id="chip-shape-container"><chip-shape><button role="tab" aria-selected="false"><div class="ytChipShapeChip"><div>新しい動画の発見</div></div></button></chip-shape></div>
                        </yt-chip-cloud-chip-renderer>
                    </iron-selector>
                </div>
            </div>
        `, 'https://www.youtube.com/', 10);

        expect(feedTargets.map(target => target.text)).toEqual(expect.arrayContaining([
            'すべて',
            '観光',
            '新しい動画の発見',
        ]));
        expect(feedTargets.map(target => target.text)).not.toContain('前へ');

        const sightseeing = feedTargets.find(target => target.text === '観光')!;
        applyTokensToScanTarget(sightseeing, [{
            card: { ...card, cardState: ['known'], spelling: '観光', reading: 'かんこう', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'かんこう', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '観光',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const feedChipWord = document.querySelector<HTMLElement>('ytd-feed-filter-chip-bar-renderer .jpdb-reader-word, #chips-content .jpdb-reader-word')!;
        expect(readerWordSurfaceText(feedChipWord)).toBe('観光');
        expect(feedChipWord.dataset.jpdbReaderPassive).toBe('true');
        expect(feedChipWord.tabIndex).toBe(-1);
    });

    it('scans modern YouTube lockup titles without hiding title text', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/results?search_query=%E6%97%A5%E6%9C%AC',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        try {
            const targets = collectYouTubeTargets(`
                <yt-lockup-view-model>
                    <a class="ytLockupViewModelContentImage" href="/watch?v=news"></a>
                    <div class="ytLockupMetadataViewModelMetadata">
                        <h3 class="ytLockupMetadataViewModelHeadingReset">
                            <a href="/watch?v=news"><span class="ytAttributedStringHost">【LIVE】朝のニュース（Japan News Digest Live）最新情報など</span></a>
                        </h3>
                    </div>
                </yt-lockup-view-model>
                <ytm-shorts-lockup-view-model>
                    <a class="shortsLockupViewModelHostEndpoint" href="/shorts/mobile">
                        <h3 class="shortsLockupViewModelHostMetadataTitle">日本語が難しい理由</h3>
                    </a>
                </ytm-shorts-lockup-view-model>
            `, 'https://www.youtube.com/results?search_query=%E6%97%A5%E6%9C%AC', 10);

            expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
                '【LIVE】朝のニュース（Japan News Digest Live）最新情報など',
                '日本語が難しい理由',
            ]));
            expect(targets.find(target => target.text.includes('朝のニュース'))).toMatchObject({ passiveInteraction: true, nonDestructive: true });
            expect(targets.find(target => target.text === '日本語が難しい理由')).toMatchObject({ passiveInteraction: true, nonDestructive: true });

            const lockupTitle = targets.find(target => target.text.includes('朝のニュース'))!;
            const shortsTitle = targets.find(target => target.text === '日本語が難しい理由')!;
            expect(lockupTitle.suppressRuby).not.toBe(true);
            expect(shortsTitle.suppressRuby).not.toBe(true);
            applyTokensToScanTarget(lockupTitle, [{
                card: { ...card, cardState: ['known'], spelling: '朝', reading: 'あさ', source: 'jpdb' },
                start: 6,
                end: 7,
                length: 1,
                rubies: [{ text: 'あさ', start: 6, end: 7, length: 1 }],
                pitchClass: 'heiban',
                sentence: '【LIVE】朝のニュース（Japan News Digest Live）最新情報など',
            }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
            applyTokensToScanTarget(shortsTitle, [{
                card: { ...card, cardState: ['known'], spelling: '日本語', reading: 'にほんご', source: 'jpdb' },
                start: 0,
                end: 3,
                length: 3,
                rubies: [{ text: 'にほんご', start: 0, end: 3, length: 3 }],
                pitchClass: 'heiban',
                sentence: '日本語が難しい理由',
            }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

            const lockupWord = document.querySelector<HTMLElement>('yt-lockup-view-model .jpdb-reader-word')!;
            expect(readerWordSurfaceText(lockupWord)).toBe('朝');
            expect(lockupWord.querySelector('rt, .jpdb-reader-detached-furi')?.textContent).toBe('あさ');
            expect(document.querySelector('yt-lockup-view-model .jpdb-reader-text-mirror')).not.toBeNull();
            const word = document.querySelector<HTMLElement>('ytm-shorts-lockup-view-model .jpdb-reader-word')!;
            expect(readerWordSurfaceText(word)).toBe('日本語');
            expect(word.querySelector('rt, .jpdb-reader-detached-furi')?.textContent).toBe('にほんご');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('renders ruby in compact YouTube title mirrors even without collector metadata', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/results?search_query=jlpt',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        try {
            document.body.innerHTML = `
                <yt-lockup-view-model>
                    <h3 class="ytLockupMetadataViewModelHeadingReset">
                        <a class="ytLockupMetadataViewModelTitle" href="/watch?v=jlpt">
                            <span class="ytAttributedStringHost">直前対策</span>
                        </a>
                    </h3>
                </yt-lockup-view-model>`;
            const host = document.querySelector<HTMLElement>('.ytAttributedStringHost')!;
            const target: ScanTextTarget = {
                node: host.firstChild as Text,
                parent: host,
                text: '直前対策',
                nonDestructive: true,
            };

            applyTokensToScanTarget(target, [{
                card: { ...card, cardState: ['known'], spelling: '直前', reading: 'ちょくぜん', source: 'jpdb' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'ちょくぜん', start: 0, end: 2, length: 2 }],
                pitchClass: 'heiban',
                sentence: '直前対策',
            }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

            const word = document.querySelector<HTMLElement>('yt-lockup-view-model .jpdb-reader-word')!;
            expect(readerWordSurfaceText(word)).toBe('直前');
            expect(word.querySelector('rt,.jpdb-reader-furi')?.textContent).toBe('ちょくぜん');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('renders furigana in compact non-YouTube media tile titles', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 220, height: 36 });
        document.body.innerHTML = `
            <main>
                <section style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));">
                    <a href="/items/nihongo-lesson">
                        <img alt="" src="/thumb.jpg">
                        <span data-card-title style="display: -webkit-box; -webkit-line-clamp: 2; overflow: hidden; line-height: 18px; max-height: 36px;">日本語の動画タイトル</span>
                    </a>
                </section>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://video.example.jp/');
        rectSpy.mockRestore();
        const target = targets.find(candidate => candidate.text === '日本語の動画タイトル')!;

        expect(target).toMatchObject({ passiveInteraction: true });
        expect(target.suppressRuby).toBeFalsy();

        applyTokensToScanTarget(target, [{
            card: { ...card, cardState: ['known'], spelling: '日本語', reading: 'にほんご', source: 'jpdb' },
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'にほんご', start: 0, end: 3, length: 3 }],
            pitchClass: 'heiban',
            sentence: '日本語の動画タイトル',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('[data-card-title] .jpdb-reader-word')!;
        expect(readerWordSurfaceText(word)).toBe('日本語');
        expect(word.dataset.jpdbReaderPassive).toBe('true');
        expect(word.querySelector('rt,.jpdb-reader-furi')).not.toBeNull();
        expectRenderedPitchWord(word, 'heiban');
    });

    it('renders furigana in compact media tile titles when the cover is a sibling link', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 149, height: 36 });
        document.body.innerHTML = `
            <main>
                <section class="book-carousel" style="display:flex">
                    <article class="book-card">
                        <div class="book-tile" style="display:flex;width:149px">
                            <a class="book-cover" href="/books/nihongo-manga">
                                <img alt="日本語の漫画タイトル" src="/cover.jpg">
                            </a>
                            <h3 class="book-title">
                                <a data-book-title class="book-title-link" href="/books/nihongo-manga" style="display:flow-root;overflow:hidden;line-height:18px;height:36px">
                                    日本語の漫画タイトル
                                </a>
                            </h3>
                        </div>
                    </article>
                </section>
                <article><p>今日は新しい本を読みました。</p></article>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://books.example.jp/');
        rectSpy.mockRestore();
        const target = targets.find(candidate => candidate.text === '日本語の漫画タイトル')!;

        expect(target).toMatchObject({ passiveInteraction: true });
        expect(target.suppressRuby).toBeFalsy();

        applyTokensToScanTarget(target, [{
            card: { ...card, cardState: ['known'], spelling: '日本語', reading: 'にほんご', source: 'jpdb' },
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'にほんご', start: 0, end: 3, length: 3 }],
            pitchClass: 'heiban',
            sentence: '日本語の漫画タイトル',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('[data-book-title] .jpdb-reader-word')!;
        expect(readerWordSurfaceText(word)).toBe('日本語');
        expect(word.dataset.jpdbReaderPassive).toBe('true');
        expect(word.querySelector('rt,.jpdb-reader-furi')).not.toBeNull();
        expectRenderedPitchWord(word, 'heiban');
    });

    it('suppresses ruby in compact centered media menu labels up to product-carousel widths', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 210, height: 80 });
        document.body.innerHTML = `
            <main>
                <div class="center-menu" style="display:flex">
                    <a class="center-menu-icon-button" href="/media-mix/" style="display:flex;text-align:center;width:210px">
                        <img alt="" src="/media.png">
                        メディア化
                    </a>
                </div>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://store.example.jp/');
        rectSpy.mockRestore();
        const target = targets.find(candidate => candidate.text === 'メディア化')!;

        expect(target).toMatchObject({ suppressRuby: true, passiveInteraction: true });

        applyTokensToScanTarget(target, [
            {
                card: { ...card, cardState: ['known'], spelling: 'メディア', reading: 'メディア', source: 'jpdb' },
                start: 0,
                end: 4,
                length: 4,
                rubies: [],
                pitchClass: 'heiban',
                sentence: 'メディア化',
            },
            {
                card: { ...card, cardState: ['known'], spelling: '化', reading: 'か', source: 'jpdb' },
                start: 4,
                end: 5,
                length: 1,
                rubies: [{ text: 'か', start: 4, end: 5, length: 1 }],
                pitchClass: 'heiban',
                sentence: 'メディア化',
            },
        ], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const link = document.querySelector<HTMLElement>('.center-menu-icon-button')!;
        expect(Array.from(link.children).filter(child => child.classList.contains('jpdb-reader-word'))).toHaveLength(0);
        const words = Array.from(link.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(words[0]?.parentElement).not.toBe(link);
        expect(words[0]?.parentElement?.tagName).toBe('SPAN');
        expect(words.map(readerWordSurfaceText)).toEqual(['メディア', '化']);
        expect(words.every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
        expect(words.every(word => word.querySelector('ruby rt') === null)).toBe(true);
        expect(words[1]?.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('か');
        expect(link.querySelector('[data-yomu-ruby-room]')).toBeNull();
    });

    it('keeps compact image navigation labels inline against page span display rules', () => {
        document.head.innerHTML = `
            <style>${READER_WORD_CSS}</style>
            <style>
                #globalnav a div span {
                    display: block;
                }
            </style>
        `;
        const rectSpy = mockElementBoundingClientRect({ width: 96, height: 132 });
        document.body.innerHTML = `
            <header>
                <nav id="globalnav">
                    <ul>
                        <li>
                            <a href="/optional_tour/">
                                <div>現地ツアー</div>
                                <span class="mobile-none"><img src="/tour.png" alt="現地ツアー・オプショナルツアー"></span>
                            </a>
                        </li>
                    </ul>
                </nav>
            </header>
        `;

        const targets = collectScanTargets(10, 'https://www.traveldonkey.jp/blog/australia/26220/');
        rectSpy.mockRestore();
        const target = targets.find(candidate => candidate.text === '現地ツアー')!;

        expect(target).toMatchObject({ suppressRuby: true, passiveInteraction: true });

        applyTokensToScanTarget(target, [
            {
                card: { ...card, cardState: ['known'], spelling: '現地', reading: 'げんち', source: 'jpdb' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'げんち', start: 0, end: 2, length: 2 }],
                pitchClass: 'heiban',
                sentence: '現地ツアー',
            },
            {
                card: { ...card, cardState: ['known'], spelling: 'ツアー', reading: 'ツアー', source: 'jpdb' },
                start: 2,
                end: 5,
                length: 3,
                rubies: [],
                pitchClass: 'heiban',
                sentence: '現地ツアー',
            },
        ], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const words = Array.from(document.querySelectorAll<HTMLElement>('#globalnav .jpdb-reader-word'));
        expect(words).toHaveLength(2);
        expect(words.every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
        expect(words.every(word => word.closest<HTMLElement>('[data-jpdb-reader-passive-atomic="true"]'))).toBe(true);
        expect(words.map(readerWordSurfaceText)).toEqual(['現地', 'ツアー']);
        expect(words.every(word => word.querySelector('ruby rt') === null)).toBe(true);
        expect(words[0]?.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('げんち');
        expect(document.querySelector('#globalnav [data-yomu-ruby-room]')).toBeNull();
        expect(words.map(word => getComputedStyle(word).display)).toEqual(['inline', 'inline']);
        expect(words.map(word => getComputedStyle(word).whiteSpace)).toEqual(['nowrap', 'nowrap']);
        expectRenderedPitchWord(words[0]!, 'heiban');
    });

    it('suppresses ruby in tight generic controls while preserving passive pitch styling', () => {
        document.head.innerHTML = `<style>${READER_WORD_CSS}</style>`;
        const rectSpy = mockElementBoundingClientRect({ width: 220, height: 34 });
        try {
            document.body.innerHTML = `
                <header>
                    <nav class="market-categories" style="display:flex;gap:8px">
                        <a data-category-row href="/category/elections" style="display:inline-flex;align-items:center;height:32px;max-height:32px;overflow:hidden;line-height:20px;white-space:nowrap">選挙</a>
                        <a data-neighbor-row href="/category/sports" style="display:inline-flex;align-items:center;height:32px;max-height:32px;overflow:hidden;line-height:20px;white-space:nowrap">スポーツ</a>
                    </nav>
                </header>
                <main>
                    <article>
                        <p><a data-prose-link href="/analysis/elections">選挙について詳しく読む</a></p>
                    </article>
                </main>
                <div role="dialog" aria-label="reader settings">
                    <button data-settings-row type="button" style="display:flex;align-items:center;height:34px;max-height:34px;overflow:hidden;line-height:20px;white-space:nowrap">表示設定</button>
                    <button data-market-row type="button" style="display:flex;align-items:center;height:32px;max-height:32px;overflow:hidden;line-height:20px;white-space:nowrap">市場予測</button>
                </div>
            `;

            const targets = collectScanTargets(20, 'https://markets.example/');
            const category = targets.find(candidate => candidate.text === '選挙')!;
            const settings = targets.find(candidate => candidate.text === '表示設定')!;
            const market = targets.find(candidate => candidate.text === '市場予測')!;
            const prose = targets.find(candidate => candidate.text === '選挙について詳しく読む')!;

            expect(category).toMatchObject({ suppressRuby: true, passiveInteraction: true });
            expect(settings).toMatchObject({ suppressRuby: true, passiveInteraction: true });
            expect(market).toMatchObject({ suppressRuby: true, passiveInteraction: true });
            expect(prose.suppressRuby).not.toBe(true);

            applyTokensToScanTarget(category, [{
                card: { ...card, cardState: ['known'], spelling: '選挙', reading: 'せんきょ', source: 'jpdb' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'せんきょ', start: 0, end: 2, length: 2 }],
                pitchClass: 'heiban',
                sentence: '選挙',
            }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
            applyTokensToScanTarget(settings, [{
                card: { ...card, cardState: ['known'], spelling: '表示', reading: 'ひょうじ', source: 'jpdb' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'ひょうじ', start: 0, end: 2, length: 2 }],
                pitchClass: 'heiban',
                sentence: '表示設定',
            }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
            applyTokensToScanTarget(market, [{
                card: { ...card, cardState: ['known'], spelling: '市場', reading: 'しじょう', source: 'jpdb' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'しじょう', start: 0, end: 2, length: 2 }],
                pitchClass: 'heiban',
                sentence: '市場予測',
            }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
            applyTokensToScanTarget(prose, [{
                card: { ...card, cardState: ['known'], spelling: '選挙', reading: 'せんきょ', source: 'jpdb' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'せんきょ', start: 0, end: 2, length: 2 }],
                pitchClass: 'heiban',
                sentence: '選挙について詳しく読む',
            }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

            const categoryWord = document.querySelector<HTMLElement>('[data-category-row] .jpdb-reader-word')!;
            const settingsWord = document.querySelector<HTMLElement>('[data-settings-row] .jpdb-reader-word')!;
            const marketWord = document.querySelector<HTMLElement>('[data-market-row] .jpdb-reader-word')!;
            const proseWord = document.querySelector<HTMLElement>('[data-prose-link] .jpdb-reader-word')!;
            expect(document.querySelector<HTMLElement>('[data-category-row]')?.dataset.jpdbReaderPassiveChrome).toBe('true');
            expect(document.querySelector<HTMLElement>('[data-settings-row]')?.dataset.jpdbReaderPassiveChrome).toBe('true');
            expect(document.querySelector<HTMLElement>('[data-market-row]')?.dataset.jpdbReaderPassiveChrome).toBe('true');
            expect(document.querySelector<HTMLElement>('[data-prose-link]')?.dataset.jpdbReaderPassiveChrome).toBeUndefined();
            [categoryWord, settingsWord, marketWord].forEach(word => {
                expect(word.dataset.jpdbReaderPassive).toBe('true');
                expect(word.querySelector('ruby rt')).toBeNull();
                expect(word.querySelector('.jpdb-reader-detached-furi')).not.toBeNull();
                expectRenderedPitchWord(word, 'heiban');
            });
            expect(document.querySelector('[data-yomu-ruby-room]')).toBeNull();
            expect(proseWord.querySelector('rt')?.textContent).toBe('せんきょ');
        } finally {
            rectSpy.mockRestore();
            document.head.innerHTML = '';
            document.body.innerHTML = '';
        }
    });

    it('ignores aria-hidden feedback chrome while wrapping YouTube feed titles', () => {
        const targets = collectYouTubeTargets(`
            <ytd-rich-grid-renderer>
                <ytd-rich-item-renderer>
                    <a id="video-title-link" href="/watch?v=jp">
                        <yt-touch-feedback-shape aria-hidden="true">
                            <div>押下中</div>
                        </yt-touch-feedback-shape>
                        <span>英語を話せる方法</span>
                    </a>
                </ytd-rich-item-renderer>
            </ytd-rich-grid-renderer>
        `, 'https://www.youtube.com/', 10);

        expect(targets.map(target => target.text)).toContain('英語を話せる方法');
        expect(targets.map(target => target.text)).not.toContain('押下中');
        const title = targets.find(target => target.text === '英語を話せる方法')!;
        applyTokensToScanTarget(title, [{
            card: { ...card, cardState: ['known'], spelling: '英語', reading: 'えいご', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'えいご', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '英語を話せる方法',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const titleWord = document.querySelector<HTMLElement>('a#video-title-link .jpdb-reader-word')!;
        expect(readerWordSurfaceText(titleWord)).toBe('英語');
        expect(titleWord.querySelector('rt, .jpdb-reader-detached-furi')?.textContent).toBe('えいご');
        expect(document.querySelector('yt-touch-feedback-shape .jpdb-reader-word')).toBeNull();
    });

    it('scans YouTube watch buttons while ignoring aria-hidden feedback', () => {
        const targets = collectYouTubeWatchTargets(`
            <ytd-watch-metadata>
                <button type="button">
                    <yt-touch-feedback-shape aria-hidden="true">
                        <div>押下中</div>
                    </yt-touch-feedback-shape>
                    <span>字幕を表示</span>
                </button>
            </ytd-watch-metadata>
        `);

        expect(targets.map(target => target.text)).toContain('字幕を表示');
        expect(targets.map(target => target.text)).not.toContain('押下中');
        expect(document.querySelector('ytd-watch-metadata button .jpdb-reader-word')).toBeNull();
    });

    it('ignores CSS-hidden YouTube controls even on non-visible-only parser roots', () => {
        const targets = collectYouTubeWatchTargets(`
            <ytd-watch-metadata>
                <button type="button" style="display:none">字幕を表示</button>
                <button type="button" style="visibility:hidden">文字起こしを表示</button>
                <button type="button" style="opacity:0">共有</button>
                <button type="button">質問する</button>
            </ytd-watch-metadata>
        `);

        expect(targets.map(target => target.text)).toContain('質問する');
        expect(targets.map(target => target.text)).not.toEqual(expect.arrayContaining([
            '字幕を表示',
            '文字起こしを表示',
            '共有',
        ]));
    });

    it('falls back to generic scanning for parser sites that opt into page text', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 800,
            top: 0,
            bottom: 160,
            width: 800,
            height: 160,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = '<main><p>今日は静かな部屋で本を読みます。</p></main>';

        // Google search opts into generic page text (includeGenericPageText), so
        // prose outside its curated result roots still gets a generic-scan pass —
        // unlike the hosted docs profile, which is curated `.vp-doc` only.
        const targets = collectScanTargets(10, 'https://www.google.com/search?q=reading');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toContain('今日は静かな部屋で本を読みます。');
    });

    it('only enables the asbplayer parser when asbplayer subtitle roots exist', () => {
        document.body.innerHTML = '<main><p>今日は本を読みます。</p></main>';
        expect(getMatchingSiteParsers('http://127.0.0.1:5174/article/').map(profile => profile.id))
            .not.toContain('asbplayer-parser');

        document.body.innerHTML += '<div class="asbplayer-offscreen">今日は読む</div>';
        expect(getMatchingSiteParsers('http://127.0.0.1:5174/article/').map(profile => profile.id))
            .toContain('asbplayer-parser');
    });

    it('scans Google search AI cards and related-search chips outside the main results list', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 900, height: 260 });
        document.body.innerHTML = `
            <div id="rcnt">
                <div id="search">
                    <div class="MjjYud">
                        <div class="g">
                            <button type="button" style="overflow:hidden;height:36px;max-height:36px">検索結果を表示</button>
                        </div>
                    </div>
                    <div class="g">
                        <h3 class="LC20lb">英語での test の意味</h3>
                        <div class="VwiC3b">このページを訳す</div>
                    </div>
                </div>
                <div id="bres">
                    <div role="heading">AI による概要</div>
                    <div>テストを受信しました。正常に応答が可能です。</div>
                    <a href="/aclk">プライム上場企業からベンチャー企業まで</a>
                </div>
                <div id="botstuff">
                    <a href="/search?q=test+plural">Test 複数形</a>
                    <a href="/search?q=test+company">Test 会社</a>
                </div>
            </div>
        `;

        const targets = collectScanTargets(12, 'https://www.google.com/search?q=test');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '英語での test の意味',
            'このページを訳す',
            '検索結果を表示',
            'AI による概要',
            'テストを受信しました。正常に応答が可能です。',
            'プライム上場企業からベンチャー企業まで',
            'Test 複数形',
            'Test 会社',
        ]));

        const chip = targets.find(target => target.text === 'Test 複数形')!;
        expect(chip).toBeTruthy();
        applyTokensToScanTarget(chip, [{
            card: { ...card, cardState: ['known'], spelling: '複数形', reading: 'ふくすうけい', source: 'jpdb' },
            start: 5,
            end: 8,
            length: 3,
            rubies: [{ text: 'ふくすうけい', start: 5, end: 8, length: 3 }],
            pitchClass: 'heiban',
            sentence: 'Test 複数形',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('#botstuff .jpdb-reader-word')!;
        expect(readerWordSurfaceText(word)).toBe('複数形');
        expect(word.querySelector('rt')?.textContent).toBe('ふくすうけい');
        expectRenderedPitchWord(word, 'heiban');

        const resultControl = targets.find(target => target.text === '検索結果を表示')!;
        expect(resultControl.passiveInteraction).toBe(true);
        expect(resultControl.layoutSensitive).toBe(true);
    });

    it('prioritizes Google AI cards and bottom chips before busy result lists at low limits', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 900, height: 260 });
        document.body.innerHTML = `
            <div id="rcnt">
                <div id="search">
                    ${Array.from({ length: 12 }, (_, index) => `
                        <div class="g">
                            <h3 class="LC20lb">検索結果${index}の日本語タイトル</h3>
                            <div class="VwiC3b">検索結果${index}の説明文です。</div>
                        </div>
                    `).join('')}
                </div>
                <div id="bres">
                    <div data-attrid="ai-overview">AI による概要 テストを受信しました。</div>
                </div>
                <div id="botstuff">
                    <a href="/search?q=test+plural">Test 複数形</a>
                    <a href="/search?q=test+company">Test 会社</a>
                </div>
            </div>
        `;

        const targets = collectScanTargets(4, 'https://www.google.com/search?q=test');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            'Test 複数形',
            'Test 会社',
            'AI による概要 テストを受信しました。',
        ]));
    });

    it('uses Jisho-specific fragment parsing for result text split across furigana spans', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 900,
            top: 0,
            bottom: 220,
            width: 900,
            height: 220,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <div id="main_results">
                <div class="concept_light clearfix">
                    <div class="concept_light-readings japanese japanese_gothic" lang="ja">
                        <div class="concept_light-representation">
                            <span class="furigana"><span>きのう</span></span>
                            <span class="text">昨日</span>
                        </div>
                    </div>
                </div>
                <div class="sentence_content">
                    <ul class="japanese_sentence japanese japanese_gothic" lang="ja">
                        <li style="display:inline"><span class="furigana">きのう</span><span class="unlinked">昨日</span></li>すき焼きを食べました。
                    </ul>
                    <div class="english">I ate sukiyaki yesterday.</div>
                </div>
            </div>
        `;

        const targets = collectScanTargets(10, 'https://jisho.org/search/%E6%98%A8%E6%97%A5');
        rectSpy.mockRestore();

        const normalizedTargets = targets.map(target => target.text.replace(/\s+/g, ''));
        expect(normalizedTargets).toContain('昨日');
        expect(normalizedTargets).toContain('昨日すき焼きを食べました。');
        expect(normalizedTargets.some(text => text.includes('きのう昨日'))).toBe(false);
    });

    it('scans Jiten dictionary, parse text, and native controls with passive actions', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 900, height: 260 });
        document.body.innerHTML = `
            <main id="app">
                <div class="p-card">
                    <div class="text-3xl font-noto-sans" lang="ja"><ruby>読む<rt>よむ</rt></ruby></div>
                    <button class="tts-button" aria-label="音声を再生">音声</button>
                    <blockquote>
                        <div class="md:text-lg text-sm" lang="ja">今日は本を読みました。</div>
                    </blockquote>
                </div>
                <div class="flex items-center gap-0.5 flex-wrap">
                    <span class="pr-1.5 font-noto-sans" lang="ja"><span>読む</span></span>
                    <button title="Deselect word">選択解除</button>
                </div>
                <button>次へ</button>
                <a role="button" href="/parse">戻る</a>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://jiten.moe/parse?text=%E8%AA%AD%E3%82%80');
        rectSpy.mockRestore();

        const texts = targets.map(target => target.text);
        expect(texts).toEqual(expect.arrayContaining(['読む', '今日は本を読みました。', '音声', '選択解除', '次へ', '戻る']));
        expect(texts).not.toContain('よむ');
        expect(targets.every(target => 'parserId' in target && target.parserId === 'jiten-parser')).toBe(true);
        for (const text of ['音声', '選択解除', '次へ', '戻る']) {
            expect(targets.find(target => target.text === text)).toMatchObject({ passiveInteraction: true });
        }
    });

    it('renders Jiten highlighted sentence words even when a token crosses inline spans', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 900, height: 260 });
        document.body.innerHTML = `
            <main id="app">
                <blockquote>
                    <div lang="ja" class="md:text-lg text-sm transition-filter duration-200 flex-1">
                        <span class="text-primary-500 font-bold">席</span>へと<span class="text-primary-500 font-bold">受け</span>取る。
                    </div>
                </blockquote>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://jiten.moe/parse?text=%E5%B8%AD');
        rectSpy.mockRestore();
        expect(targets.map(target => target.text)).toContain('席へと受け取る。');

        const target = targets.find(item => item.text === '席へと受け取る。')!;
        applyTokensToScanTarget(target, [
            {
                card: { ...card, cardState: ['known'], spelling: '席', reading: 'せき' },
                start: 0,
                end: 1,
                length: 1,
                rubies: [{ text: 'せき', start: 0, end: 1, length: 1 }],
                pitchClass: '',
                sentence: target.text,
            },
            {
                card: { ...card, cardState: ['known'], spelling: '受け取る', reading: 'うけとる' },
                start: 3,
                end: 7,
                length: 4,
                rubies: [
                    { text: 'う', start: 3, end: 4, length: 1 },
                    { text: 'と', start: 5, end: 6, length: 1 },
                ],
                pitchClass: '',
                sentence: target.text,
            },
        ], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(words.map(word => readerWordSurfaceText(word))).toEqual(['席', '受け取る']);
        expect(Array.from(document.querySelectorAll('rt.jpdb-reader-furi')).map(rt => rt.textContent)).toEqual(['せき', 'う', 'と']);
    });

    it('scans major dictionary result pages and native controls with domain-scoped parser profiles', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 900, height: 260 });
        const cases: Array<[string, string, string, string, string[]]> = [
            ['https://www.weblio.jp/content/%E8%AA%AD%E3%82%80', 'weblio-parser', '<div id="main"><div class="NetDicBody">今日は本を読む。</div><button class="audio">音声</button><button>次へ</button><a role="button" href="/content">戻る</a></div>', '今日は本を読む。', ['音声', '次へ', '戻る']],
            ['https://kotobank.jp/word/%E8%AA%AD%E3%82%80', 'kotobank-parser', '<main><article><p class="description">文章を読む。</p><button class="speaker">音声</button><div role="tab">漢字タブ</div></article></main>', '文章を読む。', ['音声', '漢字タブ']],
            ['https://takoboto.jp/?q=%E8%AA%AD%E3%82%80', 'takoboto-parser', '<div id="SearchResultList"><div class="entry">本を読みます。</div><button class="sound">音声</button><button onclick="next()">次へ</button></div>', '本を読みます。', ['音声', '次へ']],
            ['https://ja.wiktionary.org/wiki/%E8%AA%AD%E3%82%80', 'wiktionary-ja-parser', '<h1 id="firstHeading">読む</h1><div id="mw-content-text"><div class="mw-parser-output"><p>文字や文章を読む。</p><sup class="reference">脚注</sup><button>編集する</button></div></div>', '文字や文章を読む。', ['編集する']],
        ];

        try {
            for (const [url, parserId, html, expectedText, passiveControls] of cases) {
                document.body.innerHTML = html;
                const targets = collectScanTargets(10, url);
                expect(targets.map(target => 'parserId' in target ? target.parserId : '')).toContain(parserId);
                expect(targets.map(target => target.text)).toContain(expectedText);
                for (const control of passiveControls) {
                    expect(targets.map(target => target.text)).toContain(control);
                    expect(targets.find(target => target.text === control)).toMatchObject({ passiveInteraction: true });
                }
            }
        } finally {
            rectSpy.mockRestore();
        }
    });

    it('scans JPDB native-ruby primary spellings as one word and skips alternate spellings', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 900, height: 260 });
        document.body.innerHTML = `
            <div class="result vocabulary">
                <div class="subsection-spelling with-furigana">
                    <div class="primary-spelling"><ruby class="v">母<rt>はは</rt></ruby></div>
                    <div>ハハ</div>
                </div>
                <div class="subsection-meanings">
                    <h6 class="subsection-label">Meanings</h6>
                    <div class="description">かか was used by children</div>
                </div>
            </div>
        `;

        const targets = collectScanTargets(10, 'https://jpdb.io/search?q=HAHA&lang=english#a');
        rectSpy.mockRestore();

        const texts = targets.map(target => target.text);
        expect(texts).toContain('かか was used by children');
        expect(texts).toContain('母');
        expect(texts).not.toContain('ハハ');
    });

    it('scans JPDB example sentences so word color settings apply there too', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <div class="subsection-examples">
                <div class="subsection">
                    <div class="used-in">
                        <div class="jp">あの仕事は少なくとも１０日はかかるな。</div>
                        <div class="en">That job will take at least ten days.</div>
                    </div>
                </div>
            </div>
        `;

        const targets = collectScanTargets(10, 'https://jpdb.io/review');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toContain('あの仕事は少なくとも１０日はかかるな。');
    });

    it('keeps form chrome out of scans but collects compact UI chips as passive', () => {
        expectBodyPassiveTextTargets(`
            <form><label>パスワードの設定<span class="required">必須</span></label></form>
            <span class="badge">予約</span>
            <p>今日は本を読みます。</p>
        `, ['予約']);
        const texts = collectTextTargetsIn(document.body, 10, false).map(target => target.text);
        // Form labels stay excluded by the form-chrome gate (unchanged).
        expect(texts).not.toContain('パスワードの設定');
        expect(texts).toContain('今日は本を読みます。');
    });

    it('keeps prose parseable when content class names contain UI-ish words', () => {
        expectBodyTextTargets(`
            <main>
                <article>
                    <p class="article-label">今日は静かな部屋で本を読みます。</p>
                    <p class="story-tag">猫と暮らすための日本語を読みます。</p>
                </article>
            </main>
        `, [
            '今日は静かな部屋で本を読みます。',
            '猫と暮らすための日本語を読みます。',
        ]);
    });

    it('collects short centered display headings on the passive channel (never ruby that breaks layout)', () => {
        expectBodyPassiveTextTargets(`
            <h2 style="text-align:center;font-size:22px;line-height:1.1">ポストに届いて、受取ラクラク</h2>
            <p>食卓やリビングなど、おうちのちょっとしたところに飾れる。</p>
        `, ['ポストに届いて、受取ラクラク']);
        expect(collectTextTargetsIn(document.body, 10, false).map(target => target.text)).toContain('食卓やリビングなど、おうちのちょっとしたところに飾れる。');
    });

    it('keeps primary readable h1 text in main parseable even when centered', () => {
        document.body.innerHTML = `
            <main>
                <h1 style="text-align:center;font-size:48px;line-height:1.1">
                    <span class="name">よむ</span>
                    <span class="text">好きなものを読んで日本語を学ぶ</span>
                </h1>
            </main>
        `;
        const targets = collectTextTargetsIn(document.body, 10, false);
        const hero = targets.find(target => target.text === '好きなものを読んで日本語を学ぶ');
        expect(hero).toBeTruthy();
        // The readable primary heading is NOT downgraded: full decoration.
        expect(hero?.decoration).not.toBe('interactive-passive');
    });

    it('collects nested text inside short centered headings as passive', () => {
        expectBodyPassiveTextTargets(`
            <main>
                <h2 style="text-align:center;font-size:22px;line-height:1.1"><span>お花のプラン</span></h2>
            </main>
        `, ['お花のプラン']);
    });

    it('keeps short centered display headings out of broad page scans too', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <h2 style="text-align:center;font-size:22px;line-height:1.1">ポストに届いて、受取ラクラク</h2>
            <p>食卓やリビングなど、おうちのちょっとしたところに飾れる。</p>
        `;

        const targets = collectScanTargets(10, 'https://bloomeelife.com/');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(['食卓やリビングなど、おうちのちょっとしたところに飾れる。']);
    });

    it('normalizes structured OCR responses for image overlays', () => {
        const result = normalizeOcrResult({
            context_resolution: { width: 800, height: 1200 },
            results: [{
                text_lines: [{ content: '学校へ行く' }],
                is_vertical: true,
                box: {
                    top_left: { x: 650, y: 120 },
                    top_right: { x: 720, y: 120 },
                    bottom_right: { x: 720, y: 760 },
                    bottom_left: { x: 650, y: 760 },
                },
            }],
        });

        expect(result?.lines[0]).toMatchObject({
            text: '学校へ行く',
            vertical: true,
            box: { left: 650, top: 120, width: 70, height: 640 },
        });
    });

    it('drops separate OCR furigana rows when a larger kanji title row is present', () => {
        const result = normalizeOcrResult({
            width: 1000,
            height: 1200,
            lines: [
                { text: 'かがみ', box: { left: 180, top: 110, width: 150, height: 34 } },
                { text: 'むら', box: { left: 670, top: 104, width: 120, height: 34 } },
                { text: '鏡のない村', box: { left: 170, top: 145, width: 620, height: 120 } },
            ],
        }, 1000, 1200);

        expect(result?.lines.map(line => line.text)).toEqual(['鏡のない村']);
    });

    it('drops vertical OCR furigana columns next to larger kanji title columns', () => {
        const result = normalizeOcrResult({
            width: 1000,
            height: 1200,
            lines: [
                { text: 'かがみ', vertical: true, box: { left: 300, top: 120, width: 28, height: 150 } },
                { text: '鏡のない村', vertical: true, box: { left: 335, top: 110, width: 90, height: 520 } },
            ],
        }, 1000, 1200);

        expect(result?.lines.map(line => line.text)).toEqual(['鏡のない村']);
    });

    it('keeps a short full-size kana column beside a kanji column (not furigana)', () => {
        // Reported manga panel: それにしても is a real dialogue column, just shorter
        // (fewer glyphs) than its neighbour. It must survive — the old height/glyph
        // -count clause wrongly deleted it as a furigana strip for こんなに若くて可愛い.
        // Both columns share the same glyph width (~70px), so neither is a thin
        // half-size reading strip.
        const result = normalizeOcrResult({
            width: 1000,
            height: 1200,
            lines: [
                { text: 'それにしても', vertical: true, box: { left: 720, top: 120, width: 70, height: 360 } },
                { text: 'こんなに若くて可愛い', vertical: true, box: { left: 640, top: 110, width: 70, height: 600 } },
            ],
        }, 1000, 1200);

        expect(result?.lines.map(line => line.text)).toEqual(['それにしても', 'こんなに若くて可愛い']);
    });

});
