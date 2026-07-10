import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectScanTargets } from '../../src/reader/app/site-parsers';

// Class Z: the /live_chat (and /live_chat_replay) iframe is same-origin and
// boots a restricted reader instance; its frame profile must collect the
// framework-owned chat renderer shapes so messages annotate. The renderers
// are live custom elements — targets stay non-destructive (mirror channel),
// which the conversation-context routing already enforces at apply time.
describe('YouTube live-chat frame collection (class Z)', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    function stubChatFrame(pathname: '/live_chat' | '/live_chat_replay'): void {
        vi.stubGlobal('location', {
            href: `https://www.youtube.com${pathname}?continuation=test`,
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname,
        });
    }

    function chatDom(): void {
        document.body.innerHTML = `
            <yt-live-chat-app>
                <yt-live-chat-renderer>
                    <div id="items">
                        <yt-live-chat-text-message-renderer>
                            <span id="author-name">視聴者さん</span>
                            <span id="message">意外な所でヤシの木が見えた</span>
                        </yt-live-chat-text-message-renderer>
                        <yt-live-chat-paid-message-renderer>
                            <span id="author-name">支援者</span>
                            <span id="message">配信ありがとうございます</span>
                        </yt-live-chat-paid-message-renderer>
                        <yt-live-chat-membership-item-renderer>
                            <span id="message">メンバーになりました</span>
                        </yt-live-chat-membership-item-renderer>
                    </div>
                </yt-live-chat-renderer>
            </yt-live-chat-app>
        `;
    }

    for (const pathname of ['/live_chat', '/live_chat_replay'] as const) {
        it(`collects chat message and author text inside the ${pathname} frame as non-destructive targets`, () => {
            stubChatFrame(pathname);
            const restore = mockVisibleRects();
            try {
                chatDom();
                const targets = collectScanTargets(80, `https://www.youtube.com${pathname}?continuation=test`);
                const texts = targets.map(target => target.text).join('\n');
                expect(texts).toContain('意外な所でヤシの木が見えた');
                expect(texts).toContain('配信ありがとうございます');
                expect(texts).toContain('メンバーになりました');
                expect(texts).toContain('視聴者さん');
                // Framework-owned chat renderers must never be destructively
                // painted — every collected target rides the mirror channel.
                for (const target of targets) {
                    expect(target.nonDestructive, `${target.text} must be non-destructive`).toBe(true);
                }
            } finally {
                restore();
            }
        });
    }
});

function mockVisibleRects(): () => void {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function rect() {
        return { x: 0, y: 0, width: 320, height: 20, top: 0, right: 320, bottom: 20, left: 0, toJSON: () => ({}) } as DOMRect;
    };
    return () => {
        HTMLElement.prototype.getBoundingClientRect = original;
    };
}
