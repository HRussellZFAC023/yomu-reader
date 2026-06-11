import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJpdbReviewBridgeClient, type JpdbReviewBridgeStatus } from '../../src/reader/jpdb/jpdb-review-bridge';

// Minimal in-process BroadcastChannel: every instance on the same name sees
// every message (including its own poster's peers, like the real API).
class FakeBroadcastChannel {
    static channels = new Map<string, Set<FakeBroadcastChannel>>();
    onmessage: ((event: MessageEvent) => void) | null = null;
    private peers: Set<FakeBroadcastChannel>;

    constructor(public name: string) {
        this.peers = FakeBroadcastChannel.channels.get(name) ?? new Set();
        this.peers.add(this);
        FakeBroadcastChannel.channels.set(name, this.peers);
    }

    postMessage(data: unknown): void {
        for (const peer of this.peers) {
            if (peer !== this) peer.onmessage?.({ data } as MessageEvent);
        }
    }

    close(): void {
        this.peers.delete(this);
    }
}

function connectedStatus(): JpdbReviewBridgeStatus {
    return {
        connected: true,
        loginRequired: false,
        message: '',
        card: {
            id: 'v1',
            kind: 'vocabulary',
            phase: 'front',
            prompt: '読む',
            answer: '',
            spelling: '読む',
            reading: 'よむ',
            sentence: '',
            kanji: '',
            keyword: '',
            itemsLeft: 3,
            href: 'https://jpdb.io/review',
        },
    };
}

function postStatusFromReviewPage(status: JpdbReviewBridgeStatus): void {
    const page = new FakeBroadcastChannel('yomu-jpdb-review-bridge');
    page.postMessage({ type: 'status', source: 'jpdb', status });
    page.close();
}

describe('jpdb review bridge staleness', () => {
    afterEach(() => {
        FakeBroadcastChannel.channels.clear();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('flips a silent review tab to a stale disconnected status', () => {
        vi.useFakeTimers();
        vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
        const client = createJpdbReviewBridgeClient();
        const seen: JpdbReviewBridgeStatus[] = [];
        client.onUpdate(status => seen.push(status));

        postStatusFromReviewPage(connectedStatus());
        expect(client.latestStatus().connected).toBe(true);
        expect(client.latestStatus().card?.spelling).toBe('読む');

        vi.advanceTimersByTime(30_000);

        const latest = client.latestStatus();
        expect(latest.connected).toBe(false);
        expect(latest.stale).toBe(true);
        expect(latest.card).toBeNull();
        expect(seen.at(-1)?.stale).toBe(true);
        client.close();
    });

    it('keeps the status fresh while heartbeats keep arriving', () => {
        vi.useFakeTimers();
        vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
        const client = createJpdbReviewBridgeClient();

        postStatusFromReviewPage(connectedStatus());
        vi.advanceTimersByTime(20_000);
        postStatusFromReviewPage(connectedStatus());
        vi.advanceTimersByTime(20_000);

        expect(client.latestStatus().connected).toBe(true);
        expect(client.latestStatus().stale).toBeUndefined();
        client.close();
    });

    it('treats an explicit closed broadcast as disconnected immediately', () => {
        vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
        const client = createJpdbReviewBridgeClient();

        postStatusFromReviewPage(connectedStatus());
        postStatusFromReviewPage({
            connected: false,
            loginRequired: false,
            card: null,
            message: 'JPDB review tab closed. Reopen jpdb.io/review to continue live reviews.',
        });

        const latest = client.latestStatus();
        expect(latest.connected).toBe(false);
        expect(latest.card).toBeNull();
        expect(latest.message).toContain('closed');
        client.close();
    });

    it('re-requests the current card when the study tab becomes visible again', () => {
        vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
        const client = createJpdbReviewBridgeClient();
        const requests: unknown[] = [];
        const observer = new FakeBroadcastChannel('yomu-jpdb-review-bridge');
        observer.onmessage = event => requests.push(event.data);

        document.dispatchEvent(new Event('visibilitychange'));

        expect(requests.some(message => (message as { type?: string }).type === 'request-current')).toBe(true);
        observer.close();
        client.close();
    });
});
