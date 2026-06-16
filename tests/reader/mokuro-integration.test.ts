import { afterEach, describe, expect, it } from 'vitest';

import { defaultMokuroProfileOcrOffOnce, injectMokuroToggleNote, isMokuroReaderHost } from '../../src/reader/app/mokuro-integration';

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
