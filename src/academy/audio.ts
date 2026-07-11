/**
 * Yomu Academy — audio.
 *
 * Everything here is synthesised at runtime with the Web Audio API: soft UI
 * clicks, the hana-maru "thunk", page turns, unlock chimes, a level-up
 * arpeggio, and a gentle per-location ambient pad. No audio files ship, so
 * there is nothing to license and nothing to download — and it all respects
 * the learner's sound preference (full / quiet / off) and reduced-motion.
 *
 * An OPTIONAL "jukebox" lets a user point each location at a YouTube video id
 * of their own choosing (e.g. their favourite study lofi). It is off by
 * default, muteable, and never ships any third-party track — it just embeds a
 * hidden player the user configured for themselves.
 */

export type SoundLevel = 'full' | 'quiet' | 'off';

export type SfxName =
    | 'click' | 'confirm' | 'back' | 'page' | 'stamp' | 'unlock'
    | 'levelup' | 'error' | 'door' | 'petal' | 'coin' | 'select';

export type AmbientScene =
    | 'campus' | 'classroom' | 'library' | 'lab' | 'garden' | 'studio'
    | 'cafe' | 'pub' | 'ramen' | 'konbini' | 'gym' | 'studyhall' | 'tender' | 'title';

/** Base drone note (Hz) + colour per location — a calm, distinct mood each. */
const AMBIENT_SCENES: Record<AmbientScene, { root: number; fifth: number; tone: OscillatorType; cutoff: number; gain: number }> = {
    title:     { root: 174.6, fifth: 261.6, tone: 'sine',     cutoff: 900,  gain: 0.05 },
    campus:    { root: 196.0, fifth: 293.7, tone: 'sine',     cutoff: 800,  gain: 0.045 },
    classroom: { root: 220.0, fifth: 329.6, tone: 'triangle', cutoff: 1100, gain: 0.04 },
    library:   { root: 164.8, fifth: 246.9, tone: 'sine',     cutoff: 700,  gain: 0.04 },
    lab:       { root: 233.1, fifth: 349.2, tone: 'sine',     cutoff: 1200, gain: 0.038 },
    garden:    { root: 174.6, fifth: 261.6, tone: 'sine',     cutoff: 820,  gain: 0.045 },
    studio:    { root: 207.7, fifth: 311.1, tone: 'triangle', cutoff: 1000, gain: 0.04 },
    cafe:      { root: 246.9, fifth: 370.0, tone: 'triangle', cutoff: 1300, gain: 0.045 },
    pub:       { root: 146.8, fifth: 220.0, tone: 'triangle', cutoff: 900,  gain: 0.05 },
    ramen:     { root: 196.0, fifth: 261.6, tone: 'triangle', cutoff: 1000, gain: 0.045 },
    konbini:   { root: 293.7, fifth: 440.0, tone: 'sine',     cutoff: 1600, gain: 0.035 },
    gym:       { root: 130.8, fifth: 196.0, tone: 'sawtooth', cutoff: 700,  gain: 0.035 },
    studyhall: { root: 185.0, fifth: 277.2, tone: 'sine',     cutoff: 780,  gain: 0.05 },
    tender:    { root: 155.6, fifth: 233.1, tone: 'sine',     cutoff: 640,  gain: 0.055 },
};

interface JukeboxConfig {
    enabled: boolean;
    /** Per-scene YouTube video ids the USER supplies for themselves. */
    tracks: Partial<Record<AmbientScene, string>>;
}

const JUKEBOX_KEY = 'yomu:academy:jukebox:v1';

export class AcademyAudio {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private level: SoundLevel;
    private ambient: { osc: OscillatorNode[]; gain: GainNode; lfo: OscillatorNode; scene: AmbientScene } | null = null;
    private jukebox: JukeboxConfig;
    private jukeboxFrame: HTMLIFrameElement | null = null;
    private started = false;

    constructor(level: SoundLevel = 'full') {
        this.level = level;
        this.jukebox = readJukebox();
    }

    /** Must be called from a user gesture (browsers block audio otherwise). */
    unlock(): void {
        if (this.started || this.level === 'off') return;
        try {
            const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            this.ctx = new Ctor();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.level === 'quiet' ? 0.35 : 0.8;
            this.master.connect(this.ctx.destination);
            this.started = true;
        } catch {
            this.ctx = null;
        }
    }

    setLevel(level: SoundLevel): void {
        this.level = level;
        if (level === 'off') {
            this.stopAmbient();
            this.stopJukebox();
            if (this.master && this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        } else if (this.master && this.ctx) {
            this.master.gain.setTargetAtTime(level === 'quiet' ? 0.35 : 0.8, this.ctx.currentTime, 0.05);
        }
    }

    getLevel(): SoundLevel { return this.level; }

    /* ------------------------------------------------------------------ sfx */

    play(name: SfxName): void {
        if (this.level === 'off') return;
        if (!this.started) this.unlock();
        const ctx = this.ctx, master = this.master;
        if (!ctx || !master) return;
        const t = ctx.currentTime;
        switch (name) {
            case 'click':   return this.blip(320, 0.05, 'triangle', 0.10);
            case 'select':  return this.blip(420, 0.06, 'sine', 0.10);
            case 'confirm': this.arp([392, 523.3], 0.07, 'sine'); return;
            case 'back':    return this.blip(260, 0.06, 'sine', 0.09);
            case 'page':    return this.noise(0.09, 2200, 0.06);
            case 'stamp':   this.thunk(); return;
            case 'unlock':  this.arp([523.3, 659.3, 784.0], 0.09, 'triangle'); return;
            case 'levelup': this.arp([523.3, 659.3, 784.0, 1046.5], 0.11, 'triangle', 0.09); return;
            case 'coin':    this.arp([784.0, 1046.5], 0.06, 'square', 0.07); return;
            case 'error':   return this.blip(180, 0.12, 'sawtooth', 0.06);
            case 'door':    this.door(); return;
            case 'petal':   return this.blip(660 + Math.round((t * 37) % 120), 0.05, 'sine', 0.04);
        }
    }

    private blip(freq: number, dur: number, type: OscillatorType, gain: number): void {
        const ctx = this.ctx!, master = this.master!;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = type; o.frequency.value = freq;
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }

    private arp(freqs: number[], step: number, type: OscillatorType, gain = 0.08): void {
        freqs.forEach((f, i) => window.setTimeout(() => this.blip(f, step * 1.6, type, gain), i * step * 1000));
    }

    private thunk(): void {
        // A soft rubber-stamp: low body + short noise tap.
        this.blip(140, 0.10, 'sine', 0.14);
        this.noise(0.05, 1400, 0.05);
    }

    private door(): void {
        const ctx = this.ctx!, master = this.master!;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sawtooth'; const t = ctx.currentTime;
        o.frequency.setValueAtTime(70, t);
        o.frequency.exponentialRampToValueAtTime(120, t + 1.1);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
        o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + 1.4);
    }

    private noise(dur: number, cutoff: number, gain: number): void {
        const ctx = this.ctx!, master = this.master!;
        const frames = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
        const g = ctx.createGain(); g.gain.value = gain;
        src.connect(lp); lp.connect(g); g.connect(master); src.start();
    }

    /* -------------------------------------------------------------- ambient */

    setScene(scene: AmbientScene): void {
        if (this.jukebox.enabled && this.jukebox.tracks[scene]) {
            this.stopAmbient();
            this.startJukebox(this.jukebox.tracks[scene]!);
            return;
        }
        this.stopJukebox();
        if (this.level === 'off') return;
        if (!this.started) this.unlock();
        if (!this.ctx || !this.master) return;
        if (this.ambient?.scene === scene) return;
        this.stopAmbient();
        const ctx = this.ctx;
        const cfg = AMBIENT_SCENES[scene];
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(cfg.gain, ctx.currentTime, 1.4);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cfg.cutoff;
        const o1 = ctx.createOscillator(); o1.type = cfg.tone; o1.frequency.value = cfg.root;
        const o2 = ctx.createOscillator(); o2.type = cfg.tone; o2.frequency.value = cfg.fifth; o2.detune.value = 4;
        const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = cfg.root / 2;
        // Slow tremolo so the pad breathes.
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = cfg.gain * 0.4;
        lfo.connect(lfoGain); lfoGain.connect(gain.gain);
        o1.connect(lp); o2.connect(lp); o3.connect(lp); lp.connect(gain); gain.connect(this.master);
        [o1, o2, o3, lfo].forEach(o => o.start());
        this.ambient = { osc: [o1, o2, o3], gain, lfo, scene };
    }

    stopAmbient(): void {
        if (!this.ambient || !this.ctx) return;
        const { osc, gain, lfo } = this.ambient;
        gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
        const stopAt = this.ctx.currentTime + 1.2;
        [...osc, lfo].forEach(o => { try { o.stop(stopAt); } catch { /* already stopped */ } });
        this.ambient = null;
    }

    /* -------------------------------------------------------------- jukebox */

    getJukebox(): JukeboxConfig { return this.jukebox; }

    configureJukebox(config: JukeboxConfig): void {
        this.jukebox = config;
        try { localStorage.setItem(JUKEBOX_KEY, JSON.stringify(config)); } catch { /* ignore */ }
        if (!config.enabled) this.stopJukebox();
    }

    private startJukebox(videoId: string): void {
        if (this.level === 'off') return;
        if (this.jukeboxFrame?.dataset.video === videoId) return;
        this.stopJukebox();
        const frame = document.createElement('iframe');
        frame.dataset.video = videoId;
        frame.title = 'Academy background music';
        frame.setAttribute('aria-hidden', 'true');
        frame.width = '0'; frame.height = '0';
        frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px;bottom:0;';
        frame.allow = 'autoplay';
        const mute = this.level === 'quiet' ? 0 : 0;
        frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&loop=1&playlist=${encodeURIComponent(videoId)}&controls=0&mute=${mute}`;
        document.body.appendChild(frame);
        this.jukeboxFrame = frame;
    }

    private stopJukebox(): void {
        this.jukeboxFrame?.remove();
        this.jukeboxFrame = null;
    }
}

function readJukebox(): JukeboxConfig {
    try {
        const raw = localStorage.getItem(JUKEBOX_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as JukeboxConfig;
            if (parsed && typeof parsed === 'object') return { enabled: Boolean(parsed.enabled), tracks: parsed.tracks ?? {} };
        }
    } catch { /* fall through */ }
    return { enabled: false, tracks: {} };
}
