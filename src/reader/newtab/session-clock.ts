import { DEFAULT_STUDY_DURATION_MS } from '../srs/shared';

export type StudySessionClockState = 'running' | 'paused' | 'complete';
export type StudySessionPauseReason = 'user' | 'visibility';

export interface StudySessionClockSnapshot {
    readonly mode: 'countdown';
    readonly durationMs: number;
    readonly elapsedMs: number;
    readonly remainingMs: number;
    readonly label: string;
    readonly state: StudySessionClockState;
    readonly complete: boolean;
    readonly pausedByUser: boolean;
    readonly pausedByVisibility: boolean;
}

export interface StudySessionClock {
    readonly mode: 'countdown';
    readonly durationMs: number;
    snapshot(): StudySessionClockSnapshot;
    pause(reason?: StudySessionPauseReason): StudySessionClockSnapshot;
    resume(reason?: StudySessionPauseReason): StudySessionClockSnapshot;
    toggleUserPause(): StudySessionClockSnapshot;
    setVisible(visible: boolean): StudySessionClockSnapshot;
    subscribe(listener: (snapshot: StudySessionClockSnapshot) => void): { dispose(): void };
    dispose(): void;
}

export interface StudySessionVisibilitySource {
    readonly hidden: boolean;
    addEventListener(type: 'visibilitychange', listener: () => void): void;
    removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface StudySessionClockOptions {
    readonly durationMs?: number;
    readonly now?: () => number;
    readonly tickEveryMs?: number;
    readonly visibility?: StudySessionVisibilitySource;
    readonly schedule?: (listener: () => void, intervalMs: number) => number;
    readonly cancel?: (handle: number) => void;
}

export interface StudySessionClockControlLabels {
    readonly pause: string;
    readonly resume: string;
}

export interface StudySessionClockControlOptions {
    readonly labels: StudySessionClockControlLabels;
    readonly className?: string;
    readonly outputClassName?: string;
    readonly buttonClassName?: string;
    readonly onComplete?: () => void;
}

const MIN_STUDY_DURATION_MS = 60 * 1_000;
const MAX_STUDY_DURATION_MS = 3 * 60 * 60 * 1_000;

/**
 * One monotonic countdown for every Study surface.
 *
 * User pause and document visibility are independent reasons: returning to a
 * visible tab never resumes a clock the learner paused. Completion clamps the
 * clock only; callers remain responsible for queue and evidence state.
 */
export function createStudySessionClock(options: StudySessionClockOptions = {}): StudySessionClock {
    const durationMs = studySessionDuration(options.durationMs ?? DEFAULT_STUDY_DURATION_MS);
    const now = options.now ?? (() => Date.now());
    const tickEveryMs = options.tickEveryMs ?? 1_000;
    const schedule = options.schedule ?? defaultSchedule;
    const cancel = options.cancel ?? defaultCancel;
    const pauseReasons = new Set<StudySessionPauseReason>();
    const listeners = new Set<(snapshot: StudySessionClockSnapshot) => void>();
    let accumulatedMs = 0;
    let runningSince: number | null = now();
    let ticker: number | undefined;
    let disposed = false;

    const elapsedAt = (time: number): number => {
        const runningMs = runningSince === null ? 0 : Math.max(0, time - runningSince);
        return Math.min(durationMs, accumulatedMs + runningMs);
    };
    const stopTicker = (): void => {
        if (ticker === undefined) return;
        cancel(ticker);
        ticker = undefined;
    };
    const stateAt = (elapsedMs: number): StudySessionClockState => {
        if (elapsedMs >= durationMs) return 'complete';
        return pauseReasons.size ? 'paused' : 'running';
    };
    const snapshotAt = (time: number): StudySessionClockSnapshot => {
        const elapsedMs = elapsedAt(time);
        const remainingMs = Math.max(0, durationMs - elapsedMs);
        const state = stateAt(elapsedMs);
        if (state === 'complete') {
            accumulatedMs = durationMs;
            runningSince = null;
            stopTicker();
        }
        return {
            mode: 'countdown',
            durationMs,
            elapsedMs,
            remainingMs,
            label: formatStudySessionRemaining(remainingMs),
            state,
            complete: state === 'complete',
            pausedByUser: pauseReasons.has('user'),
            pausedByVisibility: pauseReasons.has('visibility'),
        };
    };
    const notify = (): StudySessionClockSnapshot => {
        const snapshot = snapshotAt(now());
        listeners.forEach(listener => listener(snapshot));
        return snapshot;
    };
    const startTicker = (): void => {
        if (disposed || ticker !== undefined || !listeners.size) return;
        const snapshot = snapshotAt(now());
        if (snapshot.complete) return;
        ticker = schedule(notify, tickEveryMs);
    };
    const pause = (reason: StudySessionPauseReason): StudySessionClockSnapshot => {
        if (disposed) return snapshotAt(now());
        const time = now();
        const before = snapshotAt(time);
        if (before.complete || pauseReasons.has(reason)) return before;
        if (!pauseReasons.size) {
            accumulatedMs = before.elapsedMs;
            runningSince = null;
        }
        pauseReasons.add(reason);
        return notify();
    };
    const resume = (reason: StudySessionPauseReason): StudySessionClockSnapshot => {
        if (disposed || !pauseReasons.has(reason)) return snapshotAt(now());
        pauseReasons.delete(reason);
        if (!pauseReasons.size && accumulatedMs < durationMs) runningSince = now();
        const snapshot = notify();
        startTicker();
        return snapshot;
    };

    const visibility = options.visibility;
    const onVisibilityChange = (): void => {
        if (visibility?.hidden) pause('visibility');
        else resume('visibility');
    };
    if (visibility) {
        visibility.addEventListener('visibilitychange', onVisibilityChange);
        if (visibility.hidden) {
            accumulatedMs = 0;
            runningSince = null;
            pauseReasons.add('visibility');
        }
    }

    return {
        mode: 'countdown',
        durationMs,
        snapshot: () => snapshotAt(now()),
        pause: (reason = 'user') => pause(reason),
        resume: (reason = 'user') => resume(reason),
        toggleUserPause: () => pauseReasons.has('user') ? resume('user') : pause('user'),
        setVisible: visible => visible ? resume('visibility') : pause('visibility'),
        subscribe(listener) {
            if (disposed) throw new Error('Study session clock is disposed.');
            listeners.add(listener);
            const snapshot = snapshotAt(now());
            listener(snapshot);
            startTicker();
            return {
                dispose() {
                    listeners.delete(listener);
                    if (!listeners.size) stopTicker();
                },
            };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            stopTicker();
            listeners.clear();
            visibility?.removeEventListener('visibilitychange', onVisibilityChange);
        },
    };
}

/** Mounts the same compact clock control on standalone and Academy surfaces. */
export function mountStudySessionClockControl(
    host: HTMLElement,
    clock: StudySessionClock,
    options: StudySessionClockControlOptions,
): { dispose(): void } {
    const root = document.createElement('div');
    root.className = ['jpdb-reader-study-clock', options.className].filter(Boolean).join(' ');
    root.dataset.studySessionClock = '';
    const output = document.createElement('output');
    output.className = ['jpdb-reader-study-clock-output', options.outputClassName].filter(Boolean).join(' ');
    output.dataset.studyClock = 'countdown';
    output.setAttribute('role', 'timer');
    output.setAttribute('aria-live', 'off');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = ['jpdb-reader-study-clock-toggle', options.buttonClassName].filter(Boolean).join(' ');
    toggle.dataset.studyClockAction = 'toggle';
    root.append(output, toggle);
    host.replaceChildren(root);

    let completeAnnounced = false;
    const render = (snapshot: StudySessionClockSnapshot): void => {
        output.value = snapshot.label;
        output.textContent = snapshot.label;
        output.dataset.remainingMs = String(snapshot.remainingMs);
        output.dataset.elapsedMs = String(snapshot.elapsedMs);
        output.dataset.clockState = snapshot.state;
        output.setAttribute('aria-label', snapshot.label);
        toggle.textContent = snapshot.pausedByUser ? options.labels.resume : options.labels.pause;
        toggle.setAttribute('aria-label', toggle.textContent);
        toggle.setAttribute('aria-pressed', String(snapshot.pausedByUser));
        toggle.disabled = snapshot.complete;
        if (snapshot.complete && !completeAnnounced) {
            completeAnnounced = true;
            options.onComplete?.();
        }
    };
    const subscription = clock.subscribe(render);
    const onToggle = (): void => { clock.toggleUserPause(); };
    toggle.addEventListener('click', onToggle);

    return {
        dispose() {
            toggle.removeEventListener('click', onToggle);
            subscription.dispose();
            host.replaceChildren();
        },
    };
}

export function formatStudySessionRemaining(remainingMs: number): string {
    const seconds = Math.max(0, Math.ceil(remainingMs / 1_000));
    const hours = Math.floor(seconds / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    const displaySeconds = seconds % 60;
    return hours > 0
        ? `${hours}:${padClockPart(minutes)}:${padClockPart(displaySeconds)}`
        : `${padClockPart(minutes)}:${padClockPart(displaySeconds)}`;
}

function studySessionDuration(value: number): number {
    if (!Number.isSafeInteger(value) || value < MIN_STUDY_DURATION_MS || value > MAX_STUDY_DURATION_MS) {
        throw new TypeError('Study duration must be a whole number of milliseconds from 1 minute to 3 hours.');
    }
    return value;
}

function defaultSchedule(listener: () => void, intervalMs: number): number {
    return typeof window === 'undefined' ? -1 : window.setInterval(listener, intervalMs);
}

function defaultCancel(handle: number): void {
    if (typeof window !== 'undefined' && handle >= 0) window.clearInterval(handle);
}

function padClockPart(value: number): string {
    return String(value).padStart(2, '0');
}
