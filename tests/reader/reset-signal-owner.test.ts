import { afterEach, expect, it, vi } from 'vitest';
import { clearFactoryResetSignal, createFactoryResetSignal, publishFactoryResetSignal, subscribeToFactoryResetSignals } from '../../src/reader/app/storage';

type Owner = 'standalone' | 'userscript' | 'extension';
const owners: Owner[] = ['standalone', 'userscript', 'extension'];
const cleanups: Array<() => void> = [];
const channels = new Set<TestChannel>();

class TestChannel {
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor(readonly name: string) { channels.add(this); }
    postMessage(data: unknown) {
        for (const peer of channels) if (peer !== this && peer.name === this.name) peer.onmessage?.({ data } as MessageEvent);
    }
    close() { channels.delete(this); }
}

function select(owner: Owner) {
    vi.stubGlobal('GM_getValue', owner === 'standalone' ? undefined : (_key: string, fallback: unknown) => fallback);
    vi.stubGlobal('GM_setValue', owner === 'standalone' ? undefined : vi.fn(async () => undefined));
    vi.stubGlobal('GM_deleteValue', owner === 'standalone' ? undefined : vi.fn(async () => undefined));
    vi.stubGlobal('chrome', owner === 'extension' ? { runtime: { id: 'installed' } } : undefined);
}

afterEach(() => {
    cleanups.splice(0).forEach(cleanup => cleanup());
    channels.clear(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear();
});

it('delivers reset broadcasts only to the selected storage owner', async () => {
    vi.stubGlobal('BroadcastChannel', TestChannel);
    vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
    const listeners = new Map(owners.map(owner => [owner, vi.fn()]));
    for (const owner of owners) { select(owner); cleanups.push(subscribeToFactoryResetSignals(listeners.get(owner)!)); }
    for (const owner of owners) {
        for (const listener of listeners.values()) listener.mockClear();
        select(owner);
        const before = localStorage.getItem('yomu:factory-reset-signal');
        await publishFactoryResetSignal(createFactoryResetSignal('prepare', owner));
        for (const [candidate, listener] of listeners) expect(listener).toHaveBeenCalledTimes(candidate === owner ? 1 : 0);
        if (owner !== 'standalone') expect(localStorage.getItem('yomu:factory-reset-signal')).toBe(before);
    }
});

it('does not deliver standalone storage events to installed owners', () => {
    vi.stubGlobal('BroadcastChannel', TestChannel);
    const listeners = new Map(owners.map(owner => [owner, vi.fn()]));
    for (const owner of owners) { select(owner); cleanups.push(subscribeToFactoryResetSignals(listeners.get(owner)!)); }
    window.dispatchEvent(new StorageEvent('storage', {
        key: 'yomu:factory-reset-signal', newValue: JSON.stringify(createFactoryResetSignal('prepare', 'standalone')),
    }));
    expect(listeners.get('standalone')).toHaveBeenCalledOnce();
    expect(listeners.get('userscript')).not.toHaveBeenCalled();
    expect(listeners.get('extension')).not.toHaveBeenCalled();
});

it('rejects a mismatched owner payload even on the selected broadcast channel', () => {
    vi.stubGlobal('BroadcastChannel', TestChannel);
    select('userscript');
    const receive = vi.fn();
    cleanups.push(subscribeToFactoryResetSignals(receive));
    const sender = new TestChannel([...channels][0]!.name);
    const signal = createFactoryResetSignal('prepare', 'wrong-owner');
    sender.postMessage({ owner: 'standalone', signal });
    sender.postMessage(signal);
    expect(receive).not.toHaveBeenCalled();
    sender.postMessage({ owner: 'userscript', signal });
    expect(receive).toHaveBeenCalledOnce();
});

it('clears only the selected store reset signal', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    select('standalone');
    await publishFactoryResetSignal(createFactoryResetSignal('prepare', 'website-reset'));
    const before = localStorage.getItem('yomu:factory-reset-signal');
    select('userscript');
    await clearFactoryResetSignal();
    expect(localStorage.getItem('yomu:factory-reset-signal')).toBe(before);
    select('standalone');
    await clearFactoryResetSignal();
    expect(localStorage.getItem('yomu:factory-reset-signal')).toBeNull();
});
