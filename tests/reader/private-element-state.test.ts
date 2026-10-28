import { describe, expect, it, vi } from 'vitest';
import { setInnerHtml } from '../../src/reader/dom/html';
import { createPrivateElementStateSlot, remintPrivateElementStateTokens } from '../../src/reader/dom/private-element-state';

describe('private element state', () => {
    it('remints a replayable reader-owned cached string without rearming its old token', () => {
        const slot = createPrivateElementStateSlot('test-replayable', (value: { id: number }) => Object.freeze({ ...value }), { replayable: true });
        const cachedHtml = `<span${slot.attributes({ id: 41 })}>word</span>`;
        const firstRoot = document.createElement('div');
        setInnerHtml(firstRoot, cachedHtml);
        const first = firstRoot.querySelector('span')!;
        expect(slot.read(first)).toEqual({ id: 41 });

        const rawReplayRoot = document.createElement('div');
        setInnerHtml(rawReplayRoot, cachedHtml);
        expect(slot.read(rawReplayRoot.querySelector('span'))).toBeUndefined();

        const reminted = remintPrivateElementStateTokens(cachedHtml);
        expect(reminted).not.toBe(cachedHtml);
        const secondRoot = document.createElement('div');
        setInnerHtml(secondRoot, reminted);
        expect(slot.read(secondRoot.querySelector('span'))).toEqual({ id: 41 });
        expect(secondRoot.querySelector('span')?.hasAttribute('data-yomu-private-token')).toBe(false);

        const thirdRoot = document.createElement('div');
        setInnerHtml(thirdRoot, remintPrivateElementStateTokens(cachedHtml));
        expect(slot.read(thirdRoot.querySelector('span'))).toEqual({ id: 41 });
        expect(remintPrivateElementStateTokens(reminted)).toBe(reminted);
    });

    it('does not remint non-replayable command tokens', () => {
        const slot = createPrivateElementStateSlot('test-commands', (value: string) => value);
        const html = `<button${slot.attributes('delete')}>Delete</button>`;
        expect(remintPrivateElementStateTokens(html)).toBe(html);
    });

    it('keeps domains apart even when they share the one registry', () => {
        const commands = createPrivateElementStateSlot('test-commands', (value: string) => value);
        const identity = createPrivateElementStateSlot('test-identity', (value: string) => value);
        const root = document.createElement('div');
        setInnerHtml(root, `<button${commands.attributes('grade')}>Good</button>`);
        expect(commands.read(root.querySelector('button'))).toBe('grade');
        expect(identity.read(root.querySelector('button'))).toBeUndefined();
    });

    // The userscript ships the aggregate @require runtime and the split core as
    // separate IIFEs, so each carries its own copy of this Module. A grade or
    // kanji button the runtime renders is parsed by the core's setInnerHtml;
    // with one registry per copy its command never bound and clicks did nothing
    // on ordinary pages.
    it('binds a command minted by a separately bundled copy of the Module', async () => {
        vi.resetModules();
        const runtime = await import('../../src/reader/dom/private-command-capabilities');
        vi.resetModules();
        const core = await import('../../src/reader/dom/private-command-capabilities');
        const coreHtml = await import('../../src/reader/dom/html');
        expect(core.privateCommandAttributes).not.toBe(runtime.privateCommandAttributes);

        const root = document.createElement('div');
        coreHtml.setInnerHtml(root, `<button${runtime.privateCommandAttributes({ kind: 'card-action', action: 'grade', grade: 'okay' })}>Good</button>`);
        const button = root.querySelector('button');

        expect(button?.hasAttribute('data-yomu-private-token')).toBe(false);
        expect(core.readCardCommandCapability(button)).toEqual({ kind: 'card-action', action: 'grade', grade: 'okay' });
        expect(runtime.readCardCommandCapability(button)).toEqual({ kind: 'card-action', action: 'grade', grade: 'okay' });
    });
});
