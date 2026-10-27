import { afterEach, describe, expect, it } from 'vitest';

import { defaultMokuroProfileOcrOffOnce, injectMokuroToggleNote, isMokuroReaderHost } from '../../src/reader/app/mokuro-integration';
import { beforeEach, vi } from "vitest";
import { watchMokuroOcrToggle } from "../../src/reader/app/mokuro-integration";

function fakeStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> & { data: Record<string, string> } {
    const data = { ...initial };
    return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('mokuro integration', () => {
    it('recognises mokuro reader hosts', () => {
        expect(isMokuroReaderHost('reader.mokuro.app', '/', 'https:')).toBe(true);
        expect(isMokuroReaderHost('mokuro.moe', '/catalog', 'https:')).toBe(true);
        expect(isMokuroReaderHost('localhost', '/x/My-mokuro-vol.html', 'file:')).toBe(true);
        expect(isMokuroReaderHost('example.com', '/', 'https:')).toBe(false);
    });

    it('defaults mokuro displayOCR to false exactly once, then respects the user', () => {
        const storage = fakeStorage({ currentProfile: 'Mobile', profiles: JSON.stringify({ Mobile: { displayOCR: true } }) });
        expect(defaultMokuroProfileOcrOffOnce(storage)).toBe(true);
        expect(JSON.parse(storage.data.profiles).Mobile.displayOCR).toBe(false);
        // user turns mokuro OCR back on
        storage.data.profiles = JSON.stringify({ Mobile: { displayOCR: true } });
        // second call is a no-op (marker set) — the user's choice stands
        expect(defaultMokuroProfileOcrOffOnce(storage)).toBe(false);
        expect(JSON.parse(storage.data.profiles).Mobile.displayOCR).toBe(true);
    });

    it('handles a JSON-quoted currentProfile and a missing profiles store', () => {
        const quoted = fakeStorage({ currentProfile: JSON.stringify('Default'), profiles: JSON.stringify({ Default: { displayOCR: true } }) });
        expect(defaultMokuroProfileOcrOffOnce(quoted)).toBe(true);
        expect(JSON.parse(quoted.data.profiles).Default.displayOCR).toBe(false);
        expect(defaultMokuroProfileOcrOffOnce(fakeStorage())).toBe(false); // no profiles yet
    });

    it('appends a single Yomu/mokuro note to mokuro\'s real "OCR enabled" toggle label', () => {
        // Exact live mokuro structure: text is a bare text node in the <label>,
        // which also contains the checkbox input and the visual toggle span.
        document.body.innerHTML = `<label class="flex items-center"><input type="checkbox" class="sr-only peer"><span class="me-3"></span> OCR enabled </label>`;
        injectMokuroToggleNote(document);
        injectMokuroToggleNote(document); // idempotent
        const notes = document.querySelectorAll('[data-yomu-mokuro-note]');
        expect(notes).toHaveLength(1);
        expect(notes[0].textContent).toContain('Yomu OCR');
        expect(notes[0].textContent).toContain('mokuro OCR');
        // appended inside the label so it sits next to the text
        expect(notes[0].closest('label')).toBeTruthy();
    });
});

describe('watchMokuroOcrToggle', () => {
    /**
     * @vitest-environment jsdom
     * @vitest-environment-options { "url": "https://reader.mokuro.app/" }
     */




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

    it('does not fire a queued next-frame change after dispose', () => {
        setDisplayOcr(false);
        document.body.innerHTML = TOGGLE_HTML;
        let queued: FrameRequestCallback | undefined;
        const cancelAnimationFrame = vi.fn((handle: number) => {
            if (handle === 7) queued = undefined;
        });
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queued = cb; return 7; });
        vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
        const onChange = vi.fn();
        const dispose = watchMokuroOcrToggle(onChange);
        setDisplayOcr(true);
        document.querySelector<HTMLInputElement>('input')!.dispatchEvent(new Event('change', { bubbles: true }));
        dispose();
        queued?.(0);
        expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
        expect(onChange).not.toHaveBeenCalled();
    });
});
