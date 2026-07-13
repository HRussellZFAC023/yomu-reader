import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { Disposable } from './yomu-bridge';

export const DEFAULT_ACADEMY_STUDY_DURATION_MS = 15 * 60 * 1_000;
const MIN_STUDY_DURATION_MS = 60 * 1_000;
const MAX_STUDY_DURATION_MS = 3 * 60 * 60 * 1_000;

export interface AcademyStudyCountdownSnapshot {
    readonly durationMs: number;
    readonly remainingMs: number;
    readonly label: string;
    readonly complete: boolean;
}

export interface AcademyStudyCountdown {
    readonly mode: 'countdown';
    readonly durationMs: number;
    snapshot(): AcademyStudyCountdownSnapshot;
}

export interface AcademyStudySurface {
    readonly id: 'academy';
    readonly theme: 'living-paper';
}

export interface AcademyStudyMountContext {
    readonly language: AcademyLanguage;
    readonly surface: AcademyStudySurface;
    readonly countdown: AcademyStudyCountdown;
    readonly onExit: () => void;
}

/** The canonical Reader Study module implements this seam; Academy never recreates its cards or grading. */
export interface AcademyStudyModule {
    mount(host: HTMLElement, context: AcademyStudyMountContext): Disposable | Promise<Disposable>;
}

export interface AcademyStudyMountOptions {
    readonly language: AcademyLanguage;
    readonly durationMs?: number;
    readonly now?: () => number;
    readonly onExit: () => void;
    readonly onSessionComplete?: () => void;
}

export function createAcademyStudyCountdown(
    durationMs = DEFAULT_ACADEMY_STUDY_DURATION_MS,
    now: () => number = Date.now,
): AcademyStudyCountdown {
    const safeDuration = academyStudyDuration(durationMs);
    const startedAt = now();
    return {
        mode: 'countdown',
        durationMs: safeDuration,
        snapshot() {
            const elapsedMs = Math.max(0, now() - startedAt);
            const remainingMs = Math.max(0, safeDuration - elapsedMs);
            return {
                durationMs: safeDuration,
                remainingMs,
                label: formatAcademyStudyCountdown(remainingMs),
                complete: remainingMs === 0,
            };
        },
    };
}

export async function mountAcademyStudyModule(
    host: HTMLElement,
    module: AcademyStudyModule,
    options: AcademyStudyMountOptions,
): Promise<Disposable> {
    const countdown = createAcademyStudyCountdown(options.durationMs, options.now);
    const timer = document.createElement('output');
    timer.className = 'academy-study-countdown';
    timer.dataset.studyClock = 'countdown';
    timer.dataset.jpdbReaderSurfaceIgnore = '';
    timer.setAttribute('role', 'timer');
    timer.setAttribute('aria-live', 'off');
    const completionStatus = document.createElement('span');
    completionStatus.className = 'academy-sr-only';
    completionStatus.setAttribute('role', 'status');
    completionStatus.setAttribute('aria-live', 'polite');
    const moduleHost = document.createElement('div');
    moduleHost.className = 'academy-study-module-host';
    moduleHost.dataset.yomuStudyModuleHost = '';
    host.classList.add('academy-study-mount');
    host.dataset.studySurface = 'academy';
    host.dataset.studyTheme = 'living-paper';
    host.dataset.studySessionMode = countdown.mode;
    host.replaceChildren(timer, completionStatus, moduleHost);

    let completionAnnounced = false;
    let interval: number | undefined;
    const renderCountdown = (): boolean => {
        const snapshot = countdown.snapshot();
        timer.value = snapshot.label;
        timer.textContent = snapshot.label;
        timer.dataset.remainingMs = String(snapshot.remainingMs);
        timer.setAttribute('aria-label', options.language === 'ja'
            ? `残り${snapshot.label}`
            : `${snapshot.label} remaining`);
        if (snapshot.complete && !completionAnnounced) {
            completionAnnounced = true;
            completionStatus.textContent = options.language === 'ja' ? '学習時間が終わりました。' : 'Study time complete.';
            if (interval !== undefined) {
                window.clearInterval(interval);
                interval = undefined;
            }
            options.onSessionComplete?.();
        }
        return snapshot.complete;
    };
    if (!renderCountdown()) interval = window.setInterval(renderCountdown, 1_000);
    let mounted: Disposable;
    try {
        mounted = await module.mount(moduleHost, {
            language: options.language,
            surface: { id: 'academy', theme: 'living-paper' },
            countdown,
            onExit: options.onExit,
        });
    } catch (error) {
        if (interval !== undefined) window.clearInterval(interval);
        host.replaceChildren();
        throw error;
    }
    return {
        dispose() {
            if (interval !== undefined) window.clearInterval(interval);
            mounted.dispose();
            host.replaceChildren();
            host.classList.remove('academy-study-mount');
            delete host.dataset.studySurface;
            delete host.dataset.studyTheme;
            delete host.dataset.studySessionMode;
        },
    };
}

export function formatAcademyStudyCountdown(remainingMs: number): string {
    const seconds = Math.max(0, Math.ceil(remainingMs / 1_000));
    const hours = Math.floor(seconds / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    const displaySeconds = seconds % 60;
    return hours > 0
        ? `${hours}:${pad(minutes)}:${pad(displaySeconds)}`
        : `${pad(minutes)}:${pad(displaySeconds)}`;
}

function academyStudyDuration(value: number): number {
    if (!Number.isSafeInteger(value) || value < MIN_STUDY_DURATION_MS || value > MAX_STUDY_DURATION_MS) {
        throw new TypeError('Academy Study duration must be a whole number of milliseconds from 1 minute to 3 hours.');
    }
    return value;
}

function pad(value: number): string {
    return String(value).padStart(2, '0');
}
