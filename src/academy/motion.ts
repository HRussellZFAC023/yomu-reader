/**
 * Yomu Academy — motion & effects engine.
 *
 * The visual "juice": falling sakura, the hana-maru stamp draw-on, the
 * dialogue typewriter, portrait slides, unlock sparkles, and gentle campus
 * parallax. Techniques adapted from the maker's own shinday / care-a-lot
 * builds (per docs/academy/research/09-animation.md), reimplemented in TS.
 *
 * Every effect is presentation only and degrades to a designed still-frame
 * under reduced motion — nothing here ever carries meaning that isn't also in
 * text, and nothing strobes, shakes, or traps a keyboard/screen-reader user.
 *
 * `MotionGuard` is the single source of truth for "is motion on?": it honours
 * the OS pref AND an in-app toggle, and writes `data-motion` on <html> so the
 * CSS can pick its own still-frames.
 */

const MOTION_KEY = 'yomu:academy:motion:v1';

class MotionGuardImpl {
    private mq: MediaQueryList;
    private _reduced: boolean;

    constructor() {
        this.mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        this._reduced = this.read();
        this.mq.addEventListener?.('change', () => { this._reduced = this.read(); });
    }

    private read(): boolean {
        let stored: string | null = null;
        try { stored = localStorage.getItem(MOTION_KEY); } catch { /* ignore */ }
        const reduced = stored ? stored === 'reduced' : this.mq.matches;
        document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
        return reduced;
    }

    get reduced(): boolean { return this._reduced; }

    setPreference(value: 'reduced' | 'full' | 'system'): void {
        try {
            if (value === 'system') localStorage.removeItem(MOTION_KEY);
            else localStorage.setItem(MOTION_KEY, value);
        } catch { /* ignore */ }
        this._reduced = this.read();
    }

    /** Run `fn` when motion is on, else `fallback` (default no-op). */
    guard<T>(fn: () => T, fallback?: () => T): T | undefined {
        return this._reduced ? fallback?.() : fn();
    }
}

export const MotionGuard = new MotionGuardImpl();

/* ---------------------------------------------------------- live-region a11y */

let liveRegion: HTMLElement | null = null;
export function announce(message: string): void {
    if (!liveRegion) {
        liveRegion = document.createElement('div');
        liveRegion.className = 'academy-visually-hidden';
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        document.body.appendChild(liveRegion);
    }
    liveRegion.textContent = '';
    // Force re-announce even for identical text.
    window.setTimeout(() => { if (liveRegion) liveRegion.textContent = message; }, 30);
}

/* -------------------------------------------------------------- sakura field */

/** Seed a capped, recycling field of drifting blossom into `field`. */
export function seedSakura(field: HTMLElement, count?: number): void {
    field.textContent = '';
    if (MotionGuard.reduced) return;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const n = count ?? (window.innerWidth < 768 ? 8 : 16);
    for (let i = 0; i < n; i++) {
        const p = document.createElement('span');
        p.className = 'petal';
        p.style.setProperty('--x', `${rnd(0, 100)}vw`);
        p.style.setProperty('--size', `${rnd(8, 16)}px`);
        p.style.setProperty('--fall', `${rnd(9, 16)}s`);
        p.style.setProperty('--sway', `${rnd(2, 4)}s`);
        p.style.setProperty('--delay', `${-rnd(0, 16)}s`);
        p.style.setProperty('--spin', `${rnd(0, 360)}deg`);
        p.appendChild(document.createElement('i'));
        field.appendChild(p);
    }
}

/* --------------------------------------------------------------- hana-maru */

/** The 花丸 stamp SVG markup used by the stamp effect. */
export function hanaMaruStampMarkup(): string {
    return `<span class="hanamaru" role="img" aria-label="Correct — hanamaru">
        <svg viewBox="0 0 100 100" aria-hidden="true">
            <path class="hanamaru__petals" d="M50 8c9 0 12 8 20 8s14-2 14 10-6 12-6 24 6 12 6 24-8 10-14 10-11 8-20 8-11-8-20-8-14 2-14-10 6-12 6-24-6-12-6-24 8-10 14-10 11-8 20-8Z"/>
            <path class="hanamaru__swirl" d="M50 30a20 20 0 1 1-14 34 14 14 0 1 1 22-18 8 8 0 1 1-10 12"/>
        </svg>
    </span>`;
}

/** Animate a `.hanamaru` element stamping on; static when motion is reduced. */
export function stampHanaMaru(el: HTMLElement): void {
    const paths = el.querySelectorAll<SVGPathElement>('path');
    paths.forEach(p => p.style.setProperty('--len', String(p.getTotalLength())));
    MotionGuard.guard(
        () => { el.classList.remove('is-stamped'); void el.offsetWidth; el.classList.add('is-stamped'); },
        () => { paths.forEach(p => { p.style.strokeDashoffset = '0'; }); el.style.opacity = '1'; },
    );
    announce('Correct — 花丸!');
}

/* --------------------------------------------------------------- typewriter */

/** Type `text` into `el` grapheme-safe; click completes; instant when reduced. */
export function typeLine(el: HTMLElement, text: string, cps = 46): Promise<void> {
    el.setAttribute('aria-label', text);
    return MotionGuard.guard(
        () => new Promise<void>(resolve => {
            el.classList.add('dbox__caret');
            const graphemes = segment(text);
            let i = 0;
            let last = 0;
            let raf = 0;
            const done = () => {
                el.textContent = text;
                el.classList.remove('dbox__caret');
                el.removeEventListener('click', complete);
                resolve();
            };
            const complete = () => { cancelAnimationFrame(raf); done(); };
            const step = (t: number) => {
                if (t - last >= 1000 / cps) { el.textContent = graphemes.slice(0, ++i).join(''); last = t; }
                if (i >= graphemes.length) { done(); return; }
                raf = requestAnimationFrame(step);
            };
            raf = requestAnimationFrame(step);
            el.addEventListener('click', complete);
        }),
        () => { el.textContent = text; el.classList.remove('dbox__caret'); return Promise.resolve(); },
    ) as Promise<void>;
}

function segment(text: string): string[] {
    const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
    if (Seg) {
        try {
            const seg = new Seg('ja', { granularity: 'grapheme' });
            return Array.from(seg.segment(text), s => s.segment);
        } catch { /* fall through */ }
    }
    return Array.from(text);
}

/* --------------------------------------------------------- unlock sparkle */

/** A gentle bloom of sparkles at (x,y) in `layer`; nothing when reduced. */
export function celebrateUnlock(layer: HTMLElement, x: number, y: number): void {
    MotionGuard.guard(() => {
        const ring = document.createElement('div');
        ring.className = 'spark-ring';
        ring.style.left = `${x}px`; ring.style.top = `${y}px`;
        layer.appendChild(ring);
        window.setTimeout(() => ring.remove(), 700);
        for (let i = 0; i < 10; i++) {
            const s = document.createElement('span');
            s.className = 'spark';
            s.style.left = `${x}px`; s.style.top = `${y}px`;
            s.style.setProperty('--tx', `${(Math.random() - 0.5) * 160}px`);
            s.style.setProperty('--ty', `${(Math.random() - 0.5) * 160}px`);
            layer.appendChild(s);
            window.setTimeout(() => s.remove(), 850);
        }
    });
}

/* --------------------------------------------------------- campus parallax */

/** Bind gentle pointer parallax to a campus root. Returns a cleanup fn. */
export function ambientParallax(root: HTMLElement): () => void {
    if (MotionGuard.reduced) return () => { /* no listeners bound */ };
    let px = 0;
    let py = 0;
    let queued = false;
    const apply = () => {
        root.style.setProperty('--px', px.toFixed(3));
        root.style.setProperty('--py', py.toFixed(3));
        queued = false;
    };
    const onMove = (e: PointerEvent) => {
        px = (e.clientX / window.innerWidth - 0.5) * -2;
        py = (e.clientY / window.innerHeight - 0.5) * -2;
        if (!queued) { queued = true; requestAnimationFrame(apply); }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
}

/* --------------------------------------------------------- doors ceremony */

const GATE_KEY = 'yomu:academy:gate-seen:v1';

export function gateHasPlayed(): boolean {
    try { return localStorage.getItem(GATE_KEY) === '1'; } catch { return false; }
}

export function markGatePlayed(): void {
    try { localStorage.setItem(GATE_KEY, '1'); } catch { /* ignore */ }
}
