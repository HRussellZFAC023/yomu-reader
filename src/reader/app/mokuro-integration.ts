// mokuro reader (reader.mokuro.app) integration.
//
// mokuro's own "OCR enabled" toggle is its `displayOCR` setting, stored per
// profile in localStorage `profiles` and read once into a Svelte store at app
// init (never re-read from localStorage). So:
//   • After the learner has explicitly chosen a Yomu target, we default it OFF
//     exactly once, at document-start, BEFORE mokuro reads it
//     — mokuro then hides its lower-quality text boxes and the reader runs its
//     own sharper, more touch-friendly OCR instead. After that one-time default
//     the user's mokuro toggle is respected (turning it back on makes the reader
//     defer to mokuro again — see siteProvidesNativeTextLayer).
//   • We annotate the "OCR enabled" label so it is obvious the toggle now picks
//     between Yomu OCR (off) and mokuro OCR (on).
//
// `profiles`, `currentProfile`, and the one-time marker are host-app interop,
// deliberately outside Yomu's factory-reset inventory. They must stay raw so
// this document-start hook can run before mokuro hydrates its own Svelte store.

import { mokuroDisplayOcrEnabled } from './site-parsers';

const MOKURO_OCR_DEFAULT_MARKER = 'yomu_mokuro_ocr_default_applied';
const MOKURO_TOGGLE_LABEL = 'OCR enabled';
const MOKURO_TOGGLE_NOTE = 'off = Yomu OCR · on = mokuro OCR';

export function isMokuroReaderHost(hostname: string = location.hostname, pathname: string = location.pathname, protocol: string = location.protocol): boolean {
    return hostname === 'reader.mokuro.app'
        || hostname === 'mokuro.moe' || hostname.endsWith('.mokuro.moe')
        || (protocol === 'file:' && /mokuro/i.test(safeDecode(pathname)));
}

function safeDecode(value: string): string {
    try { return decodeURIComponent(value); } catch { return value; }
}

/**
 * One-time default: turn mokuro's own OCR overlay off so the reader's OCR runs
 * instead. Must be called at document-start, before mokuro's settings module
 * reads localStorage, so its store and localStorage stay consistent (toggle reads
 * OFF, text boxes never render). Returns true if it changed mokuro's setting.
 */
export function defaultMokuroProfileOcrOffOnce(storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
    try {
        if (storage.getItem(MOKURO_OCR_DEFAULT_MARKER)) return false; // defaulted before — respect the user
        storage.setItem(MOKURO_OCR_DEFAULT_MARKER, '1');
        const raw = storage.getItem('profiles');
        if (!raw) return false; // first visit: mokuro creates its own defaults; the note + read-gating cover it
        const profiles = JSON.parse(raw) as Record<string, { displayOCR?: boolean } | undefined>;
        const currentRaw = storage.getItem('currentProfile') ?? 'Default';
        let current = currentRaw;
        try { current = JSON.parse(currentRaw); } catch { /* plain profile name */ }
        const profile = profiles[current] ?? profiles[currentRaw];
        if (!profile || typeof profile !== 'object' || profile.displayOCR === false) return false;
        profile.displayOCR = false;
        storage.setItem('profiles', JSON.stringify(profiles));
        return true;
    } catch {
        return false;
    }
}

export function applyMokuroReaderOcrDefault(): void {
    if (typeof localStorage === 'undefined' || !isMokuroReaderHost()) return;
    defaultMokuroProfileOcrOffOnce(localStorage);
}

/**
 * Append a note to mokuro's "OCR enabled" toggle label so the user knows it now
 * switches between Yomu OCR and mokuro OCR. Idempotent; safe to call repeatedly.
 */
export function injectMokuroToggleNote(root: ParentNode): void {
    // mokuro renders the toggle as <label><input><span/> OCR enabled </label>, so
    // the label's text lives in a bare text node alongside child elements — match
    // on the element's OWN text (not descendants), not childElementCount.
    for (const el of root.querySelectorAll<HTMLElement>('label, span, p, div')) {
        if (elementOwnText(el) !== MOKURO_TOGGLE_LABEL) continue;
        if (el.querySelector('[data-yomu-mokuro-note]')) continue; // already annotated
        const note = document.createElement('span');
        note.dataset.yomuMokuroNote = 'true';
        note.className = 'yomu-mokuro-ocr-note';
        note.textContent = ` (${MOKURO_TOGGLE_NOTE})`;
        el.append(note);
    }
}

function elementOwnText(el: Element): string {
    let text = '';
    el.childNodes.forEach(node => { if (node.nodeType === 3) text += node.textContent ?? ''; });
    return text.trim();
}

function findMokuroOcrToggleInputs(root: ParentNode): HTMLInputElement[] {
    const inputs: HTMLInputElement[] = [];
    for (const el of root.querySelectorAll<HTMLElement>('label, span, p, div')) {
        if (elementOwnText(el) !== MOKURO_TOGGLE_LABEL) continue;
        const input = el.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (input) inputs.push(input);
    }
    return inputs;
}

/**
 * React when mokuro's own "OCR enabled" (displayOCR) toggle flips at runtime.
 * That toggle lives outside the reader's settings, so without this the reader
 * never re-evaluates whether to defer to mokuro: turning mokuro OCR on would
 * leave the reader's own OCR overlay on screen (the reported bug), and turning
 * it off would not start a reader scan. The toggle only exists in the DOM while
 * mokuro's settings drawer is open, and mokuro persists the change to
 * localStorage during its reactive flush — so we (a) (re)bind a change listener
 * whenever drawer nodes appear, (b) also watch cross-tab `storage` events, and
 * (c) defer the check to the next frame (past mokuro's microtask flush) and only
 * fire when the effective value actually changed. Returns a disposer.
 */
export function watchMokuroOcrToggle(onChange: (displayOcrEnabled: boolean) => void): () => void {
    if (typeof document === 'undefined' || typeof window === 'undefined' || !isMokuroReaderHost()) return () => undefined;
    let last = mokuroDisplayOcrEnabled();
    let scheduled = false;
    let disposed = false;
    let scheduledFrame = 0;
    const fireIfChanged = () => {
        if (disposed) return;
        scheduled = false;
        scheduledFrame = 0;
        const next = mokuroDisplayOcrEnabled();
        if (next === last) return;
        last = next;
        onChange(next);
    };
    const schedule = () => {
        if (disposed || scheduled) return;
        scheduled = true;
        scheduledFrame = (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: () => void) => window.setTimeout(cb, 16))(fireIfChanged);
    };
    const bindToggleInputs = () => {
        for (const input of findMokuroOcrToggleInputs(document)) {
            if (input.dataset.yomuMokuroToggleWatched) continue;
            input.dataset.yomuMokuroToggleWatched = 'true';
            input.addEventListener('change', schedule);
        }
    };
    bindToggleInputs();
    const observer = new MutationObserver(records => {
        for (const record of records) {
            if (record.addedNodes.length) { bindToggleInputs(); return; }
        }
    });
    observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
    const onStorage = (event: StorageEvent) => {
        if (event.key === 'profiles' || event.key === 'currentProfile' || event.key === null) schedule();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        disposed = true;
        if (scheduledFrame) {
            (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : window.clearTimeout)(scheduledFrame);
            scheduledFrame = 0;
        }
        observer.disconnect();
        window.removeEventListener('storage', onStorage);
    };
}

/**
 * Watch for mokuro's settings panel. The "OCR enabled" toggle only exists in the
 * DOM while the settings drawer is open, so we inject once now (in case it is
 * already open) and again whenever nodes are added (the drawer opening). The
 * observer reacts only to added nodes and coalesces bursts into one rAF pass, so
 * it stays cheap on the reader's busy, reactive DOM.
 */
export function installMokuroOcrToggleNote(): void {
    if (typeof document === 'undefined' || !isMokuroReaderHost()) return;
    let scheduled = false;
    const run = () => { scheduled = false; injectMokuroToggleNote(document); };
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 16))(run);
    };
    run();
    new MutationObserver(records => {
        for (const record of records) {
            if (record.addedNodes.length) { schedule(); return; }
        }
    }).observe(document.body ?? document.documentElement, { childList: true, subtree: true });
}
