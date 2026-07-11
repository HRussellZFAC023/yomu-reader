declare const __YOMU_VERSION__: string;

const ACADEMY_BASE_PATH = '/academy/';
const ACADEMY_SERVICE_WORKER_PATH = `${ACADEMY_BASE_PATH}sw.js`;
const ACADEMY_CACHE_PREFIX = 'yomu-academy-shell-';
const DEFAULT_CACHE_VERSION = 'v1';

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice?: Promise<{ outcome?: string }>;
};

export type AcademyInstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface AcademyPwaHooks {
    onControllerChange?: () => void;
    onInstalled?: () => void;
    onInstallPromptAvailable?: (promptInstall: () => Promise<AcademyInstallOutcome>) => void;
    onUpdateAvailable?: (activateUpdate: () => boolean) => void;
}

export interface AcademyPwaOptions {
    hooks?: AcademyPwaHooks;
    version?: string;
    warmUrls?: readonly string[];
}

export interface AcademyPwaHandle {
    activateUpdate(): boolean;
    checkForUpdate(): Promise<void>;
    dispose(): void;
    promptInstall(): Promise<AcademyInstallOutcome>;
    registration: ServiceWorkerRegistration;
}

/**
 * Register only after the authenticated Academy shell has mounted. The worker
 * receives its allowlisted warm-up URLs after it becomes active.
 */
export async function registerAcademyPwa(options: AcademyPwaOptions = {}): Promise<AcademyPwaHandle | null> {
    const serviceWorkers = academyServiceWorkers();
    if (!serviceWorkers) return null;

    const pageWindow = typeof window === 'undefined' ? null : window;
    const version = academyCacheVersion(options.version);
    let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
    let registration: ServiceWorkerRegistration | null = null;
    let announcedUpdate: ServiceWorker | null = null;
    const warmedWorkers = new WeakSet<ServiceWorker>();
    const installingListeners = new Map<ServiceWorker, EventListener>();

    const promptInstall = async (): Promise<AcademyInstallOutcome> => {
        const prompt = deferredInstallPrompt;
        if (!prompt) return 'unavailable';
        deferredInstallPrompt = null;
        try {
            await prompt.prompt();
            const choice = await prompt.userChoice;
            return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
        } catch {
            return 'unavailable';
        }
    };

    const onBeforeInstallPrompt = (event: Event): void => {
        const prompt = event as BeforeInstallPromptEvent;
        if (typeof prompt.prompt !== 'function') return;
        event.preventDefault();
        deferredInstallPrompt = prompt;
        options.hooks?.onInstallPromptAvailable?.(promptInstall);
    };
    const onInstalled = (): void => {
        deferredInstallPrompt = null;
        options.hooks?.onInstalled?.();
    };
    const onControllerChange = (): void => {
        if (registration) warmAcademyShell(registration, serviceWorkers, version, options.warmUrls, warmedWorkers);
        options.hooks?.onControllerChange?.();
    };

    pageWindow?.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    pageWindow?.addEventListener('appinstalled', onInstalled);
    serviceWorkers.addEventListener('controllerchange', onControllerChange);

    try {
        registration = await serviceWorkers.register(academyServiceWorkerUrl(version), {
            scope: ACADEMY_BASE_PATH,
            updateViaCache: 'none',
        });
    } catch (error) {
        removeLifecycleListeners(pageWindow, serviceWorkers, onBeforeInstallPrompt, onInstalled, onControllerChange);
        throw error;
    }

    const activateUpdate = (): boolean => {
        const waiting = registration?.waiting;
        if (!waiting) return false;
        waiting.postMessage({ type: 'SKIP_WAITING' });
        return true;
    };
    const announceWaitingUpdate = (): void => {
        const waiting = registration?.waiting;
        if (!waiting || !serviceWorkers.controller || waiting === announcedUpdate) return;
        announcedUpdate = waiting;
        options.hooks?.onUpdateAvailable?.(activateUpdate);
    };
    const onUpdateFound = (): void => {
        const installing = registration?.installing;
        if (!installing || installingListeners.has(installing)) return;
        const onStateChange = (): void => {
            if (installing.state === 'installed') announceWaitingUpdate();
        };
        installingListeners.set(installing, onStateChange);
        installing.addEventListener('statechange', onStateChange);
    };

    registration.addEventListener('updatefound', onUpdateFound);
    onUpdateFound();
    announceWaitingUpdate();
    warmAcademyShell(registration, serviceWorkers, version, options.warmUrls, warmedWorkers);

    return {
        activateUpdate,
        checkForUpdate: async (): Promise<void> => {
            try {
                await registration.update();
            } catch {
                // A later navigation or visibility change can retry the update check.
            }
        },
        dispose: (): void => {
            registration?.removeEventListener('updatefound', onUpdateFound);
            for (const [worker, listener] of installingListeners) worker.removeEventListener('statechange', listener);
            removeLifecycleListeners(pageWindow, serviceWorkers, onBeforeInstallPrompt, onInstalled, onControllerChange);
        },
        promptInstall,
        registration,
    };
}

/** Remove Academy shell data and its worker after the server confirms logout. */
export async function purgeAcademyPwa(): Promise<void> {
    const serviceWorkers = academyServiceWorkers();
    const registrations = serviceWorkers ? await academyRegistrations(serviceWorkers) : [];

    await Promise.allSettled(registrations
        .filter(isAcademyRegistration)
        .map(async registration => {
            postToRegistration(registration, { type: 'PURGE' });
            await registration.unregister();
        }));
    await clearAcademyCaches();
}

export function academyServiceWorkerUrl(version?: string): string {
    return `${ACADEMY_SERVICE_WORKER_PATH}?v=${encodeURIComponent(academyCacheVersion(version))}`;
}

function academyCacheVersion(value?: string): string {
    const candidate = (value ?? academyShellVersion() ?? buildVersion()).trim();
    return candidate || DEFAULT_CACHE_VERSION;
}

function academyShellVersion(): string | null {
    if (typeof document === 'undefined' || typeof location === 'undefined') return null;
    for (const script of document.querySelectorAll<HTMLScriptElement>('script[src]')) {
        try {
            const url = new URL(script.src, location.origin);
            if (url.origin === location.origin && url.pathname === `${ACADEMY_BASE_PATH}app.js`) return url.searchParams.get('v');
        } catch {
            // Ignore malformed markup and use the build version below.
        }
    }
    return null;
}

function buildVersion(): string {
    return typeof __YOMU_VERSION__ === 'string' ? __YOMU_VERSION__ : DEFAULT_CACHE_VERSION;
}

function academyServiceWorkers(): ServiceWorkerContainer | null {
    return typeof navigator !== 'undefined' && navigator.serviceWorker ? navigator.serviceWorker : null;
}

function warmAcademyShell(
    registration: ServiceWorkerRegistration,
    serviceWorkers: ServiceWorkerContainer,
    version: string,
    additionalUrls: readonly string[] | undefined,
    warmedWorkers: WeakSet<ServiceWorker>,
): void {
    const sendWarmMessage = (worker: ServiceWorker | null): void => {
        if (!worker || warmedWorkers.has(worker) || workerCacheVersion(worker) !== version) return;
        warmedWorkers.add(worker);
        worker.postMessage({ type: 'WARM_SHELL', urls: academyWarmUrls(additionalUrls) });
    };

    sendWarmMessage(registration.active);
    void serviceWorkers.ready.then(ready => sendWarmMessage(ready.active)).catch(() => undefined);
}

function academyWarmUrls(additionalUrls: readonly string[] | undefined): string[] {
    if (typeof location === 'undefined') return [];

    const urls = new Set<string>([
        new URL(ACADEMY_BASE_PATH, location.origin).href,
        new URL(`${ACADEMY_BASE_PATH}manifest.webmanifest`, location.origin).href,
    ]);
    if (typeof document !== 'undefined') {
        const resources = document.querySelectorAll<HTMLElement>(
            'script[src], link[rel~="stylesheet"][href], link[rel="manifest"][href], audio[src], audio source[src]',
        );
        for (const resource of resources) {
            const value = resource.getAttribute('src') ?? resource.getAttribute('href');
            if (!value) continue;
            try {
                urls.add(new URL(value, location.origin).href);
            } catch {
                // The worker validates every URL again, but malformed markup is not useful to send.
            }
        }
    }
    for (const url of additionalUrls ?? []) urls.add(url);
    return [...urls].slice(0, 12);
}

function workerCacheVersion(worker: ServiceWorker): string | null {
    try {
        return new URL(worker.scriptURL).searchParams.get('v');
    } catch {
        return null;
    }
}

async function academyRegistrations(serviceWorkers: ServiceWorkerContainer): Promise<readonly ServiceWorkerRegistration[]> {
    try {
        return await serviceWorkers.getRegistrations();
    } catch {
        return [];
    }
}

function isAcademyRegistration(registration: ServiceWorkerRegistration): boolean {
    try {
        const scope = new URL(registration.scope);
        return scope.origin === location.origin && scope.pathname === ACADEMY_BASE_PATH;
    } catch {
        return false;
    }
}

function postToRegistration(registration: ServiceWorkerRegistration, message: { type: string }): void {
    const workers = new Set([registration.active, registration.installing, registration.waiting]);
    for (const worker of workers) {
        try {
            worker?.postMessage(message);
        } catch {
            // Page-side cache removal below still makes logout safe.
        }
    }
}

async function clearAcademyCaches(): Promise<void> {
    if (typeof caches === 'undefined') return;
    try {
        const names = await caches.keys();
        await Promise.allSettled(names
            .filter(name => name.startsWith(ACADEMY_CACHE_PREFIX))
            .map(name => caches.delete(name)));
    } catch {
        // Cache Storage is optional and must not hold up a completed logout.
    }
}

function removeLifecycleListeners(
    pageWindow: Window | null,
    serviceWorkers: ServiceWorkerContainer,
    onBeforeInstallPrompt: EventListener,
    onInstalled: EventListener,
    onControllerChange: EventListener,
): void {
    pageWindow?.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    pageWindow?.removeEventListener('appinstalled', onInstalled);
    serviceWorkers.removeEventListener('controllerchange', onControllerChange);
}
