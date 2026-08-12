import { describe, expect, it } from 'vitest';
import { setInnerHtml } from '../../src/reader/dom/html';
import { createPrivateElementStateSlot, remintPrivateElementStateTokens } from '../../src/reader/dom/private-element-state';

describe('private element state', () => {
    it('remints a replayable reader-owned cached string without rearming its old token', () => {
        const slot = createPrivateElementStateSlot((value: { id: number }) => Object.freeze({ ...value }), { replayable: true });
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
        const slot = createPrivateElementStateSlot((value: string) => value);
        const html = `<button${slot.attributes('delete')}>Delete</button>`;
        expect(remintPrivateElementStateTokens(html)).toBe(html);
    });
});
