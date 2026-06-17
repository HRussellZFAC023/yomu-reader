/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://reader.mokuro.app/" }
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { watchMokuroOcrToggle } from '../../src/reader/app/mokuro-integration';

// mokuro's own "OCR enabled" toggle lives outside the reader's settings, so the
// reader has to watch it directly to know when to defer to mokuro's text layer
// (toggle on) or run its own OCR (toggle off). These tests pin that the watcher
// fires only on a real value change, picks up the toggle when the settings
// drawer (re)opens, and reacts to cross-tab writes.

const TOGGLE_HTML = '<label class="flex items-center"><input type="checkbox" class="sr-only peer"><span class="me-3"></span> OCR enabled </label>';

function setDisplayOcr(enabled: boolean): void {
    localStorage.setItem('currentProfile', 'Default');
    localStorage.setItem('profiles', JSON.stringify({ Default: { displayOCR: enabled } }));
}

function flushMutations(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    // Run our rAF-deferred check synchronously so assertions can follow the event.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
});

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
});

describe('watchMokuroOcrToggle', () => {
    it('fires when the toggle flips, with the new effective value', () => {
        setDisplayOcr(false);
        document.body.innerHTML = TOGGLE_HTML;
        const onChange = vi.fn();
        const dispose = watchMokuroOcrToggle(onChange);
        try {
            // user turns mokuro OCR on: mokuro persists the change, then the input fires
            setDisplayOcr(true);
            document.querySelector<HTMLInputElement>('input')!.dispatchEvent(new Event('change', { bubbles: true }));
            expect(onChange).toHaveBeenCalledTimes(1);
            expect(onChange).toHaveBeenLastCalledWith(true);
        } finally {
            dispose();
        }
    });

    it('does not fire when the toggle event does not change the value', () => {
        setDisplayOcr(false);
        document.body.innerHTML = TOGGLE_HTML;
        const onChange = vi.fn();
        const dispose = watchMokuroOcrToggle(onChange);
        try {
            // a change event that left displayOCR unchanged (e.g. an unrelated re-render)
            document.querySelector<HTMLInputElement>('input')!.dispatchEvent(new Event('change', { bubbles: true }));
            expect(onChange).not.toHaveBeenCalled();
        } finally {
            dispose();
        }
    });

    it('binds the toggle when the settings drawer opens after the watcher starts', async () => {
        setDisplayOcr(true); // mokuro OCR currently on (reader deferring)
        const onChange = vi.fn();
        const dispose = watchMokuroOcrToggle(onChange);
        try {
            // drawer opens later, adding the toggle to the DOM
            document.body.innerHTML = TOGGLE_HTML;
            await flushMutations();
            setDisplayOcr(false);
            document.querySelector<HTMLInputElement>('input')!.dispatchEvent(new Event('change', { bubbles: true }));
            expect(onChange).toHaveBeenCalledTimes(1);
            expect(onChange).toHaveBeenLastCalledWith(false);
        } finally {
            dispose();
        }
    });

    it('reacts to cross-tab storage writes and stops after dispose', () => {
        setDisplayOcr(false);
        const onChange = vi.fn();
        const dispose = watchMokuroOcrToggle(onChange);
        try {
            setDisplayOcr(true);
            window.dispatchEvent(new StorageEvent('storage', { key: 'profiles' }));
            expect(onChange).toHaveBeenCalledTimes(1);
            dispose();
            setDisplayOcr(false);
            window.dispatchEvent(new StorageEvent('storage', { key: 'profiles' }));
            expect(onChange).toHaveBeenCalledTimes(1); // no further calls after dispose
        } finally {
            dispose();
        }
    });
});
