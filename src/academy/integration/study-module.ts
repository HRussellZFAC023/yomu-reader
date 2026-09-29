import { academyText, type AcademyLanguage } from '../../reader/app/academy-copy';
import { newTabText } from '../../reader/newtab/i18n';
import {
    createStudySessionClock,
    mountStudySessionClockControl,
    type StudySessionClock,
} from '../../reader/newtab/session-clock';
import { DEFAULT_STUDY_DURATION_MS } from '../../reader/srs/shared';
import type { Disposable } from './yomu-bridge';

export const DEFAULT_ACADEMY_STUDY_DURATION_MS = DEFAULT_STUDY_DURATION_MS;

export type AcademyStudyCountdown = StudySessionClock;

export interface AcademyStudySurface {
    readonly id: 'academy';
    readonly theme: 'living-paper';
}

export interface AcademyStudyMountContext {
    readonly language: AcademyLanguage;
    readonly surface: AcademyStudySurface;
    /** The canonical Study clock; Academy and Reader controls share this instance. */
    readonly countdown: AcademyStudyCountdown;
    /** Academy's grounded snapshot for this session; scheduling stays in Reader Study. */
    readonly sessionVocabulary?: readonly AcademyStudyVocabulary[];
    readonly onExit: () => void;
    readonly signal?: AbortSignal;
}

export interface AcademyStudyVocabulary {
    readonly id: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meaning?: string;
    readonly source?: string;
    readonly audioAvailable: boolean;
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
    readonly sessionVocabulary?: readonly AcademyStudyVocabulary[];
    readonly onOpenVocabularySheet?: () => void;
}

interface CanonicalStudyRuntimeModule {
    mountNewTabStudySurface(host: HTMLElement, options: {
        readonly language: AcademyLanguage;
        readonly sessionClock: StudySessionClock;
        readonly sessionVocabulary?: readonly AcademyStudyVocabulary[];
    }): Promise<Disposable>;
}

type CanonicalStudyRuntimeLoader = () => Promise<CanonicalStudyRuntimeModule>;

class StudyRuntimeLoadFailure extends Error {}

/** Production Adapter: lazily mounts the real Reader Study composition root. */
export function createCanonicalAcademyStudyModule(
    loadRuntime: CanonicalStudyRuntimeLoader = () => import('../../reader/newtab/runtime'),
): AcademyStudyModule {
    return {
        async mount(host, context) {
            let runtime: CanonicalStudyRuntimeModule;
            try {
                // Do not memoize a rejected load. A retry calls import() again;
                // Reload remains available for browser-cached evaluation errors.
                runtime = await loadRuntime();
            } catch (cause) {
                throw new StudyRuntimeLoadFailure('Study runtime could not be loaded.', { cause });
            }
            if (context.signal?.aborted) return { dispose() {} };
            return runtime.mountNewTabStudySurface(host, {
                language: context.language,
                sessionClock: context.countdown,
                ...(context.sessionVocabulary?.length ? { sessionVocabulary: context.sessionVocabulary } : {}),
            });
        },
    };
}

export function createAcademyStudyCountdown(
    durationMs = DEFAULT_ACADEMY_STUDY_DURATION_MS,
    now: () => number = Date.now,
): AcademyStudyCountdown {
    return createStudySessionClock({ durationMs, now });
}

export async function mountAcademyStudyModule(
    host: HTMLElement,
    module: AcademyStudyModule,
    options: AcademyStudyMountOptions,
): Promise<Disposable> {
    const countdown = createStudySessionClock({
        durationMs: options.durationMs ?? DEFAULT_ACADEMY_STUDY_DURATION_MS,
        now: options.now,
        visibility: document,
    });
    const chrome = document.createElement('div');
    chrome.className = 'academy-study-chrome';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'academy-study-back';
    back.textContent = academyText(options.language, 'back');
    const vocabulary = document.createElement('button');
    vocabulary.type = 'button';
    vocabulary.className = 'academy-study-vocabulary';
    vocabulary.textContent = options.language === 'ja' ? '単語帳' : 'Words';
    vocabulary.hidden = !options.onOpenVocabularySheet;
    const clockHost = document.createElement('div');
    clockHost.className = 'academy-study-clock-host';
    chrome.append(back, vocabulary, clockHost);
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
    host.replaceChildren(chrome, completionStatus, moduleHost);

    const onExit = (): void => options.onExit();
    back.addEventListener('click', onExit);
    vocabulary.addEventListener('click', () => options.onOpenVocabularySheet?.());
    const clockControl = mountStudySessionClockControl(clockHost, countdown, {
        labels: {
            pause: newTabText(options.language, 'sessionPause'),
            resume: newTabText(options.language, 'sessionResume'),
        },
        className: 'academy-study-clock',
        outputClassName: 'academy-study-countdown',
        buttonClassName: 'academy-study-clock-toggle',
        onComplete: () => {
            completionStatus.textContent = newTabText(options.language, 'sessionComplete');
            options.onSessionComplete?.();
        },
    });

    const lifecycle = new AbortController();
    let mounted: Disposable | undefined;
    let disposed = false;
    let loading = false;
    const clockButton = clockHost.querySelector<HTMLButtonElement>('button');
    countdown.pause();
    if (clockButton) clockButton.disabled = true;

    function dispose(): void {
        if (disposed) return;
        disposed = true;
        lifecycle.abort();
        host.removeEventListener('academy:dispose', dispose);
        back.removeEventListener('click', onExit);
        mounted?.dispose();
        clockControl.dispose();
        countdown.dispose();
        host.replaceChildren();
        host.classList.remove('academy-study-mount');
        delete host.dataset.studySurface;
        delete host.dataset.studyTheme;
        delete host.dataset.studySessionMode;
    }
    host.addEventListener('academy:dispose', dispose, { once: true });

    async function attemptLoad(): Promise<void> {
        if (disposed || loading) return;
        loading = true;
        moduleHost.textContent = academyText(options.language, 'loading');
        moduleHost.setAttribute('aria-busy', 'true');
        moduleHost.inert = true;
        try {
            const view = await module.mount(moduleHost, {
                language: options.language,
                surface: { id: 'academy', theme: 'living-paper' },
                countdown,
                sessionVocabulary: options.sessionVocabulary ?? [],
                onExit: options.onExit,
                signal: lifecycle.signal,
            });
            if (disposed) { view.dispose(); return; }
            mounted = view;
            if (clockButton) clockButton.disabled = false;
            countdown.resume();
        } catch (error) {
            if (disposed) return;
            const status = document.createElement('p');
            status.setAttribute('role', 'alert');
            status.textContent = options.language === 'ja'
                ? '学習画面を読み込めませんでした。接続を確認するか、ページを再読み込みしてください。'
                : 'Study could not load. Check your connection or reload the page.';
            moduleHost.replaceChildren(status);
            // Retry missing code without replaying initialization failures;
            // those can require page/setup reconciliation through Reload.
            if (error instanceof StudyRuntimeLoadFailure) {
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.className = 'academy-button-primary';
                retry.dataset.academyStudyRetry = '';
                retry.textContent = academyText(options.language, 'retry');
                retry.addEventListener('click', () => { void attemptLoad(); }, { once: true });
                moduleHost.append(retry);
            }
            const reload = document.createElement('a');
            reload.className = 'academy-button-secondary';
            reload.href = location.href;
            reload.textContent = options.language === 'ja' ? 'Academyを再読み込み' : 'Reload Academy';
            moduleHost.append(reload);
        } finally {
            loading = false;
            if (!disposed) {
                moduleHost.removeAttribute('aria-busy');
                moduleHost.inert = false;
            }
        }
    }
    await attemptLoad();
    return { dispose };
}
