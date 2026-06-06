import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    installNewTabSwipeGesture,
    newTabSwipeActionFromDirection,
    newTabSwipeGrade,
    type NewTabSwipeAction,
    type NewTabSwipeDirection,
    type NewTabSwipeProgress,
} from '../../src/reader/newtab/swipe-gesture';

const SWIPE_PROGRESS_PROPERTY = '--jpdb-reader-newtab-swipe-progress';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
});

describe('new-tab swipe gesture', () => {
    it('maps swipe directions to compact review actions and grades', () => {
        expect(newTabSwipeActionFromDirection('left')).toBe('again');
        expect(newTabSwipeActionFromDirection('right')).toBe('good');
        expect(newTabSwipeGrade('again', { twoButtonReviews: true })).toBe('fail');
        expect(newTabSwipeGrade('good', { twoButtonReviews: true })).toBe('pass');
        expect(newTabSwipeGrade('again', { twoButtonReviews: false })).toBe('nothing');
        expect(newTabSwipeGrade('good', { twoButtonReviews: false })).toBe('okay');
    });

    it('tracks pointer movement and commits a thresholded left swipe', () => {
        stubPointerEvents();
        const { root, card } = renderSwipeCard();
        const swipes: Array<[NewTabSwipeAction, NewTabSwipeDirection]> = [];
        const progress: NewTabSwipeProgress[] = [];
        installNewTabSwipeGesture({
            root,
            target: card,
            thresholdPx: 80,
            onProgress: update => progress.push(update),
            onSwipe: (action, direction) => swipes.push([action, direction]),
        });

        card.dispatchEvent(pointerEvent('pointerdown', 0, 0));
        window.dispatchEvent(pointerEvent('pointermove', -40, 4));

        expect(progress.at(-1)).toMatchObject({ action: 'again', direction: 'left', progress: 0.5 });
        expect(root.dataset.newtabSwipeDirection).toBe('left');
        expect(card.dataset.newtabSwipeAction).toBe('again');
        expect(root.style.getPropertyValue(SWIPE_PROGRESS_PROPERTY)).toBe('0.5');
        expect(card.style.transform).toContain('translate3d(-40px, 0.96px, 0)');

        window.dispatchEvent(pointerEvent('pointerup', -96, 4));

        expect(swipes).toEqual([['again', 'left']]);
        expect(card.style.opacity).toBe('0.35');
    });

    it('commits a right swipe as a good action', () => {
        stubPointerEvents();
        const { root, card } = renderSwipeCard();
        const swipes: Array<[NewTabSwipeAction, NewTabSwipeDirection]> = [];
        installNewTabSwipeGesture({
            root,
            target: () => card,
            thresholdPx: 72,
            onSwipe: (action, direction) => swipes.push([action, direction]),
        });

        card.dispatchEvent(pointerEvent('pointerdown', 20, 0));
        window.dispatchEvent(pointerEvent('pointermove', 98, 0));
        window.dispatchEvent(pointerEvent('pointerup', 98, 0));

        expect(root.dataset.newtabSwipeDirection).toBe('right');
        expect(card.dataset.newtabSwipeAction).toBe('good');
        expect(swipes).toEqual([['good', 'right']]);
    });

    it('snaps back below the threshold without firing a swipe', () => {
        vi.useFakeTimers();
        stubPointerEvents();
        const { root, card } = renderSwipeCard();
        const swipes: NewTabSwipeAction[] = [];
        installNewTabSwipeGesture({
            root,
            target: card,
            thresholdPx: 80,
            onSwipe: action => swipes.push(action),
        });

        card.dispatchEvent(pointerEvent('pointerdown', 0, 0));
        window.dispatchEvent(pointerEvent('pointermove', 48, 0));
        window.dispatchEvent(pointerEvent('pointerup', 48, 0));

        expect(swipes).toEqual([]);
        expect(root.dataset.newtabSwipeDirection).toBeUndefined();
        expect(card.style.transform).toBe('');

        vi.advanceTimersByTime(160);

        expect(card.style.transition).toBe('');
    });

    it('uses touch events when pointer events are unavailable', () => {
        vi.stubGlobal('PointerEvent', undefined);
        const { root, card } = renderSwipeCard();
        const swipes: Array<[NewTabSwipeAction, NewTabSwipeDirection]> = [];
        installNewTabSwipeGesture({
            root,
            target: card,
            thresholdPx: 70,
            onSwipe: (action, direction) => swipes.push([action, direction]),
        });

        card.dispatchEvent(touchEvent('touchstart', [touch(7, 10, 0)]));
        window.dispatchEvent(touchEvent('touchmove', [touch(7, 92, 0)], [touch(7, 92, 0)]));
        window.dispatchEvent(touchEvent('touchend', [], [touch(7, 92, 0)]));

        expect(swipes).toEqual([['good', 'right']]);
        expect(root.dataset.newtabSwipeDirection).toBe('right');
    });

    it('leaves keyboard events untouched', () => {
        stubPointerEvents();
        const { root, card } = renderSwipeCard();
        const swipes: NewTabSwipeAction[] = [];
        installNewTabSwipeGesture({
            root,
            target: card,
            onSwipe: action => swipes.push(action),
        });

        const wasNotCanceled = card.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowLeft',
            bubbles: true,
            cancelable: true,
        }));

        expect(wasNotCanceled).toBe(true);
        expect(swipes).toEqual([]);
        expect(root.dataset.newtabSwipeDirection).toBeUndefined();
    });
});

function renderSwipeCard(): { root: HTMLElement; card: HTMLElement } {
    const root = document.createElement('main');
    root.className = 'jpdb-reader-newtab';
    const card = document.createElement('section');
    card.dataset.newtabStudy = 'true';
    card.append(document.createElement('h1'));
    root.append(card);
    Object.defineProperty(root, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            bottom: 240,
            height: 240,
            left: 0,
            right: 400,
            top: 0,
            width: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }),
    });
    document.body.append(root);
    return { root, card };
}

function stubPointerEvents(): void {
    vi.stubGlobal('PointerEvent', MouseEvent as unknown as typeof PointerEvent);
}

function pointerEvent(type: string, clientX: number, clientY: number): PointerEvent {
    const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX,
        clientY,
    });
    Object.defineProperties(event, {
        isPrimary: { value: true },
        pointerId: { value: 1 },
    });
    return event as PointerEvent;
}

function touch(identifier: number, clientX: number, clientY: number): Touch {
    return { identifier, clientX, clientY } as Touch;
}

function touchEvent(type: string, touches: Touch[], changedTouches = touches): TouchEvent {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
        changedTouches: { value: touchList(changedTouches) },
        touches: { value: touchList(touches) },
    });
    return event as TouchEvent;
}

function touchList(touches: Touch[]): TouchList {
    Object.defineProperty(touches, 'item', {
        configurable: true,
        value: (index: number) => touches[index] ?? null,
    });
    return touches as unknown as TouchList;
}
