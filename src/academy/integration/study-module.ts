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

/** Production Adapter: lazily mounts the real Reader Study composition root. */
export function createCanonicalAcademyStudyModule(
    loadRuntime: CanonicalStudyRuntimeLoader = () => import('../../reader/newtab/runtime'),
): AcademyStudyModule {
    return {
        async mount(host, context) {
            const runtime = await loadRuntime();
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

    let mounted: Disposable;
    try {
        mounted = await module.mount(moduleHost, {
            language: options.language,
            surface: { id: 'academy', theme: 'living-paper' },
            countdown,
            sessionVocabulary: options.sessionVocabulary ?? [],
            onExit: options.onExit,
        });
    } catch (error) {
        back.removeEventListener('click', onExit);
        clockControl.dispose();
        countdown.dispose();
        host.replaceChildren();
        throw error;
    }
    return {
        dispose() {
            back.removeEventListener('click', onExit);
            mounted.dispose();
            clockControl.dispose();
            countdown.dispose();
            host.replaceChildren();
            host.classList.remove('academy-study-mount');
            delete host.dataset.studySurface;
            delete host.dataset.studyTheme;
            delete host.dataset.studySessionMode;
        },
    };
}
