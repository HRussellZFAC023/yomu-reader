import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JPDBCard } from '../../src/reader/app/types';
import { DEFAULT_NEW_TAB_UI_STATE, type NewTabUiState } from '../../src/reader/newtab/state';
import {
    allowSyntheticReaderInteractionsForTests, dispatchAuthorizedReaderControlClick,
    installTrustedReaderRootBoundary,
} from '../../src/reader/ui/trusted-interaction';
import {
    DEFAULT_SETTINGS, newTabPromptController, newTabTestCard,
    registerNewTabReviewCleanup, renderEnabledNewTabRoot,
} from './new-tab-review/fixtures';

// Only transport is controlled: controllers construct the production state channel.
class ControlledBroadcastChannel {
    static instances: ControlledBroadcastChannel[] = [];
    readonly sent: unknown[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    closed = false;
    constructor(readonly name: string) { ControlledBroadcastChannel.instances.push(this); }
    postMessage(data: unknown): void { this.sent.push(structuredClone(data)); }
    close(): void { this.closed = true; }
    deliverTo(receiver: ControlledBroadcastChannel, data = this.sent.at(-1)): void {
        expect(this.closed).toBe(false);
        expect(receiver.closed).toBe(false);
        expect(receiver).not.toBe(this);
        expect(receiver.name).toBe(this.name);
        expect(data).toBeDefined();
        receiver.onmessage?.(new MessageEvent('message', { data: structuredClone(data) }));
    }
}

interface ControllerProbe {
    state: NewTabUiState;
    allWords: JPDBCard[];
    visibleWords: JPDBCard[];
    index: number;
    bindRootEvents(root: HTMLElement): void;
    applyWords(root: HTMLElement, preferStoredWord: boolean): void;
    setState(patch: Partial<NewTabUiState>, root: HTMLElement, options: { preserveWord: boolean }): void;
    loadWordsWithProgress(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
}

describe('standalone Study view isolation', () => {
    registerNewTabReviewCleanup();
    const cleanups: Array<() => void> = [];
    let boundary: AbortController;
    beforeEach(() => {
        ControlledBroadcastChannel.instances = [];
        vi.stubGlobal('BroadcastChannel', ControlledBroadcastChannel);
        boundary = new AbortController();
        installTrustedReaderRootBoundary(document, boundary.signal);
        allowSyntheticReaderInteractionsForTests(false);
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });
    afterEach(() => {
        cleanups.splice(0).reverse().forEach(cleanup => cleanup());
        boundary.abort();
        allowSyntheticReaderInteractionsForTests(true);
        vi.restoreAllMocks();
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        document.body.replaceChildren();
    });

    function nativeCard(spelling: string, state: 'due' | 'new' = 'due'): JPDBCard {
        return newTabTestCard({ spelling, source: 'jpdb', reviewSource: 'jpdb-live',
            jpdbReviewId: `v,${spelling.charCodeAt(0)},1`, cardState: [state] });
    }

    function mount(cards: JPDBCard[]) {
        const host = document.createElement('section');
        document.body.append(host);
        const bridge = { onUpdate: () => () => {}, latestStatus: () => ({ connected: true }),
            reveal: vi.fn(), grade: vi.fn(), requestCurrent: vi.fn() };
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS, apiKey: 'test-key', enableReviews: true,
            newTabSource: 'jpdb', newTabJpdbReviewMode: 'live-review',
            immersionKitEnabled: false, audioEnabled: false, newTabAnkiEnabled: false,
            newTabParsingEnabled: false, newTabFrontSentenceEnabled: false,
        }, { jpdbReviewBridge: bridge as never }, { host, surface: 'standalone' });
        cleanups.push(() => { controller.destroy(); host.remove(); });
        const channel = ControlledBroadcastChannel.instances.filter(item => item.name === 'jpdb-reader-newtab-ui').at(-1)!;
        expect(channel).toBeDefined();
        const root = renderEnabledNewTabRoot(controller);
        host.append(root);
        const probe = controller as unknown as ControllerProbe;
        Object.assign(probe, {
            allWords: cards, visibleWords: cards, index: 0, sourceLabel: 'JPDB', reviewCountMode: true,
            state: { ...DEFAULT_NEW_TAB_UI_STATE, route: 'study', source: 'jpdb', filter: 'all' },
        });
        probe.applyWords(root, false);
        probe.bindRootEvents(root);
        const reveal = () => {
            const button = root.querySelector<HTMLButtonElement>('[data-newtab-controls] [data-newtab-action="reveal"]');
            expect(button).not.toBeNull();
            dispatchAuthorizedReaderControlClick(button!);
        };
        const preference = (patch: Partial<NewTabUiState>) => probe.setState(patch, root, { preserveWord: true });
        return { host, root, probe, bridge, channel, reveal, preference,
            current: () => probe.visibleWords[probe.index] };
    }

    function pair() {
        const a = mount([nativeCard('水')]);
        const b = mount([nativeCard('火'), nativeCard('木', 'new')]);
        expect(a.host).not.toBe(b.host);
        expect(a.current().jpdbReviewId).not.toBe(b.current().jpdbReviewId);
        expect(a.channel).not.toBe(b.channel);
        return { a, b };
    }

    function expectVisibility(view: ReturnType<typeof mount>, revealed: boolean) {
        expect.soft(view.probe.state.revealAnswer).toBe(revealed);
        expect.soft(view.root.classList.contains('jpdb-reader-newtab-revealed')).toBe(revealed);
        expect.soft(Boolean(view.root.querySelector('[data-newtab-controls] [data-grade]'))).toBe(revealed);
    }

    function expectNoBridgeActions(view: ReturnType<typeof mount>) {
        expect.soft(view.bridge.reveal).not.toHaveBeenCalled();
        expect.soft(view.bridge.grade).not.toHaveBeenCalled();
        expect.soft(view.bridge.requestCurrent).not.toHaveBeenCalled();
    }

    it('keeps B concealed when A reveals its different native card through bound controls', () => {
        const { a, b } = pair();
        const original = b.current();
        a.reveal();
        expectVisibility(a, true);
        expect(a.bridge.reveal).toHaveBeenCalledOnce();
        a.channel.deliverTo(b.channel);
        expect(b.current()).toBe(original);
        expectVisibility(b, false);
        expectNoBridgeActions(b);
    });

    it('preserves B’s locally revealed answer across an unrelated A preference update', () => {
        const { a, b } = pair();
        b.reveal();
        expectVisibility(b, true);
        b.bridge.reveal.mockClear();
        const original = b.current();
        a.preference({ keyHintsDismissed: true });
        a.channel.deliverTo(b.channel);
        expect(b.probe.state.keyHintsDismissed).toBe(true);
        expect(b.current()).toBe(original);
        expectVisibility(b, true);
        expectNoBridgeActions(b);
    });

    it('conceals B’s replacement native card when a received filter changes selection', () => {
        const { a, b } = pair();
        a.reveal();
        b.reveal();
        b.bridge.reveal.mockClear();
        const original = b.current();
        a.preference({ filter: 'new' });
        a.channel.deliverTo(b.channel);
        expect(b.current().jpdbReviewId).not.toBe(original.jpdbReviewId);
        expect(b.current().spelling).toBe('木');
        expectVisibility(b, false);
        expectNoBridgeActions(b);
    });

    it('conceals B’s replacement card after a received source change loads a new queue', async () => {
        const { a, b } = pair();
        a.reveal();
        b.reveal();
        b.bridge.reveal.mockClear();
        const replacement = newTabTestCard({ spelling: '金', source: 'anki', reviewSource: 'anki', ankiCardId: 123, cardState: ['due'] });
        // Stub the queue acquisition seam, retaining reset, load application and rendering.
        const load = vi.spyOn(b.probe, 'loadWordsWithProgress').mockResolvedValue({
            cards: [replacement], sourceLabel: 'Anki', reviewCountMode: true,
        });
        a.preference({ source: 'anki' });
        a.channel.deliverTo(b.channel);
        await vi.waitFor(() => expect(b.current()?.ankiCardId).toBe(123));
        expect(load).toHaveBeenCalledOnce();
        expectVisibility(b, false);
        expectNoBridgeActions(b);
    });

    it('does not carry a reveal through an empty filtered pool to a different card', () => {
        const { a, b } = pair();
        b.reveal();
        b.bridge.reveal.mockClear();
        a.preference({ filter: 'known' });
        a.channel.deliverTo(b.channel);
        expect(b.probe.visibleWords).toEqual([]);
        expect(b.probe.state.revealAnswer).toBe(false);
        a.preference({ filter: 'new' });
        a.channel.deliverTo(b.channel);
        expect(b.current().spelling).toBe('木');
        expectVisibility(b, false);
        expectNoBridgeActions(b);
    });

    it('does not publish local answer visibility', () => {
        const { a } = pair();
        a.reveal();
        const message = a.channel.sent.at(-1) as { type: string; state: Record<string, unknown> };
        expect(message.type).toBe('state');
        expect(message.state).not.toHaveProperty('revealAnswer');
        expect(message.state.route).toBe('study');
    });

    it.each([false, true])('ignores received answer visibility while B is locally revealed=%s', revealed => {
        const { a, b } = pair();
        if (revealed) b.reveal();
        b.bridge.reveal.mockClear();
        a.preference({ keyHintsDismissed: true });
        const message = a.channel.sent.at(-1) as { type: string; state: Record<string, unknown> };
        a.channel.deliverTo(b.channel, { ...message, state: { ...message.state, revealAnswer: !revealed } });
        expect(b.probe.state.keyHintsDismissed).toBe(true);
        expectVisibility(b, revealed);
        expectNoBridgeActions(b);
    });
});
