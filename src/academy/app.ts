import type { AcademyLanguage } from '../reader/app/academy-copy';
import { ACADEMY_ACCOUNT_ACTION_EVENT, academyAccountActionDetail } from './account/actions';
import { AcademySyncClient, createSyncingLearnerEventRepository } from './account/sync-client';
import { createAccessGateway, resumeInviteSession, sessionCanResume, type AccessGateway } from './access/gateway';
import { AudioDirector } from './audio/director';
import { createAuthorizedAcademyAudioDirector } from './audio/runtime';
import { WorkerTtsPronunciationService } from './audio/worker-tts';
import { createLearnerEvidence, type LearnerEvidence } from './evidence/learner-evidence';
import { createYomuLocalReviewService } from './integration/yomu-local-review';
import { createCanonicalKanjiWritingService } from './integration/yomu-kanji-writing';
import { quarantineLegacyUngroundedReviews } from './integration/legacy-review-quarantine';
import type { KanjiWritingService, PronunciationService, ReviewQueueService } from './integration/yomu-bridge';
import {
    createMemoryAcademyPersistence,
    loadAcademyCheckpointSafely,
    openAcademyPersistence,
    type AcademyCheckpoint,
    type AcademyCheckpointUpdate,
    type AcademyPersistence,
    type AcademyRoute,
} from './persistence/indexeddb';
import {
    globalNavigationIsAvailable,
    navigationForRoute,
    normalizeResumeCheckpoint,
    themeForRoute,
} from './routing/contract';
import { createEnrollmentFlow } from './routing/enrollment-flow';
import { createLessonFlow } from './routing/lesson-flow';
import {
    transitionAcademyRoute,
    type AcademyRouteContextState,
    type AcademyRouteTransition,
} from './routing/route-history';
import type { AcademyRouteContext, AcademyRouteFlow } from './routing/types';
import { createWorldFlow } from './routing/world-flow';
import { renderLoadingScreen } from './ui/loading-screen';
import { createAcademyShell, type AcademyClassBoardAccess, type AcademyShell } from './ui/shell';

const LANGUAGE_KEY = 'yomu:academy:language:v1';

export interface AcademyAppOptions {
    readonly access?: AccessGateway;
    readonly persistence?: AcademyPersistence;
    readonly review?: ReviewQueueService;
    readonly kanjiWriting?: KanjiWritingService;
    readonly pronunciation?: PronunciationService;
    readonly databaseName?: string;
    /** Explicit localhost-only QA seam supplied by the development entrypoint. */
    readonly devAuthBypass?: boolean;
    readonly onClassBoard?: (access: AcademyClassBoardAccess) => void;
    /** Test/host seam; the browser default always uses the authorized manifest. */
    readonly audio?: AudioDirector;
}

export class AcademyApp {
    private readonly access: AccessGateway;
    private readonly suppliedPersistence?: AcademyPersistence;
    private readonly review: ReviewQueueService;
    private readonly kanjiWriting: KanjiWritingService;
    private readonly pronunciation: PronunciationService;
    private readonly databaseName?: string;
    private readonly devAuthBypass: boolean;
    private readonly audio: AudioDirector;
    private readonly lifecycle = new AbortController();
    private language: AcademyLanguage = loadLanguage();
    private shell: AcademyShell;
    private persistence!: AcademyPersistence;
    private evidence!: LearnerEvidence;
    private sync!: AcademySyncClient;
    private enrollment!: AcademyRouteFlow;
    private lesson!: AcademyRouteFlow;
    private world!: AcademyRouteFlow;
    private checkpoint: AcademyCheckpoint = {
        schemaVersion: 2,
        route: 'access',
        routeHistory: [],
        presentationMode: 'story',
        updatedAt: Date.now(),
    };

    private get projection() { return this.evidence.projection; }
    private get accountLinked() { return this.devAuthBypass || this.sync.hasLinkedAccount; }

    constructor(host: HTMLElement, options: AcademyAppOptions = {}) {
        this.access = options.access ?? createAccessGateway();
        this.suppliedPersistence = options.persistence;
        this.review = options.review ?? createYomuLocalReviewService();
        this.kanjiWriting = options.kanjiWriting ?? createCanonicalKanjiWritingService();
        this.databaseName = options.databaseName;
        this.devAuthBypass = options.devAuthBypass === true;
        this.audio = options.audio ?? createAuthorizedAcademyAudioDirector(safeLocalStorage());
        this.pronunciation = options.pronunciation ?? new WorkerTtsPronunciationService(this.audio);
        this.shell = createAcademyShell(host, {
            language: this.language,
            onLanguage: () => this.toggleLanguage(),
            onMute: () => this.toggleMuted(),
            onNavigate: route => {
                this.audio.playSfx('menu.confirm');
                void this.go(route);
            },
            onPresentationMode: mode => void this.setPresentationMode(mode),
            onEndForToday: () => void this.go('day-end'),
            onClassBoard: options.onClassBoard,
        });
        this.shell.setNavigation(false);
        this.shell.setMuted(this.audio.settings.muted);
    }

    async start(): Promise<void> {
        this.shell.replace(renderLoadingScreen(this.language, navigator.onLine));
        this.persistence = this.suppliedPersistence
            ?? await openAcademyPersistence(indexedDB, this.databaseName).catch(() => createMemoryAcademyPersistence());
        await quarantineLegacyUngroundedReviews({ learnerEvents: this.persistence.events });
        this.sync = new AcademySyncClient({
            events: this.persistence.events,
            onRemoteEvents: async () => { await this.evidence.refresh(); },
        });
        this.evidence = createLearnerEvidence(createSyncingLearnerEventRepository(this.persistence.events, this.sync), this.review);
        await this.evidence.initialize();
        this.enrollment = createEnrollmentFlow({
            access: this.access,
            evidence: this.evidence,
            pronunciation: this.pronunciation,
            audio: this.audio,
            account: this.sync,
            skipAccountGate: this.devAuthBypass,
        });
        this.lesson = createLessonFlow({
            evidence: this.evidence,
            pronunciation: this.pronunciation,
            kanjiWriting: this.kanjiWriting,
            audio: this.audio,
        });
        this.world = createWorldFlow({
            evidence: this.evidence,
            pronunciation: this.pronunciation,
            audio: this.audio,
            sync: this.sync,
        });
        let restoredCheckpoint = await loadAcademyCheckpointSafely(this.persistence.checkpoint, this.checkpoint);
        restoredCheckpoint = await this.refreshExpiredSession(restoredCheckpoint);
        // Account evidence must be settled before the resume checkpoint is
        // normalized: an invite session alone never reopens Academy routes.
        const returnedFromGoogle = await this.sync.completeGoogleReturn();
        if (!returnedFromGoogle && restoredCheckpoint.session && !this.accountLinked && navigator.onLine) {
            await this.sync.connect();
        }
        this.checkpoint = normalizeResumeCheckpoint(
            restoredCheckpoint,
            this.projection,
            Date.now(),
            navigator.onLine,
            this.accountLinked,
        );
        if (this.checkpoint !== restoredCheckpoint) await this.persistence.checkpoint.save(this.checkpoint);
        this.shell.setPresentationMode(this.checkpoint.presentationMode);
        this.bindLifecycle();
        await this.render();
    }

    /**
     * Rotate an expired Worker session cookie before the resume checkpoint is
     * normalized. Within the fixed 30-day offline-resume window the Worker
     * re-issues an eight-hour authorization without spending an invite, so a
     * linked learner returning after the short session lapsed lands back in
     * Academy instead of the invite screen. Refusals leave the checkpoint
     * untouched and fall through to the existing access gate.
     */
    private async refreshExpiredSession(checkpoint: AcademyCheckpoint): Promise<AcademyCheckpoint> {
        const session = checkpoint.session;
        const now = Date.now();
        if (
            !session
            || session.source !== 'cloudflare'
            || !navigator.onLine
            || sessionCanResume(session, now, true)
            || session.offlineResumeUntil <= now
        ) return checkpoint;
        const refreshed = await resumeInviteSession();
        if (!refreshed) return checkpoint;
        const refreshedCheckpoint = { ...checkpoint, session: refreshed, updatedAt: Date.now() };
        await this.persistence.checkpoint.save(refreshedCheckpoint).catch(() => undefined);
        return refreshedCheckpoint;
    }

    dispose(): void {
        this.lifecycle.abort();
        this.audio.dispose();
        this.persistence?.close();
        this.shell.dispose();
    }

    private bindLifecycle(): void {
        const unlock = () => { void this.audio.unlock(); };
        window.addEventListener('pointerdown', unlock, { once: true, capture: true, signal: this.lifecycle.signal });
        window.addEventListener('keydown', unlock, { once: true, capture: true, signal: this.lifecycle.signal });
        window.addEventListener('online', () => {
            void this.audio.setTheme(this.audio.theme);
            void this.sync.resumeOnReconnect().then(() => this.checkpoint.route === 'profile-sync' ? this.render() : undefined);
        }, { signal: this.lifecycle.signal });
        document.addEventListener('visibilitychange', () => void this.audio.handleVisibility(document.hidden), { signal: this.lifecycle.signal });
        document.addEventListener(ACADEMY_ACCOUNT_ACTION_EVENT, event => {
            const detail = academyAccountActionDetail(event);
            if (!detail) return;
            event.preventDefault();
            const operation = detail.action.kind === 'recovery'
                ? this.sync.beginRecovery()
                : detail.action.kind === 'initialize-profile'
                    ? this.sync.initializeAccountProfile().then(() => this.render())
                    : this.sync.redeemCode(detail.action.code).then(() => this.render());
            void operation.then(detail.resolve, detail.reject);
        }, { signal: this.lifecycle.signal });
    }

    private async render(): Promise<void> {
        const route = this.checkpoint.route;
        await this.audio.setTheme(themeForRoute(route, this.checkpoint.worldPlace));
        const navigation = navigationForRoute(route);
        const globalNavigationAvailable = globalNavigationIsAvailable(
            this.checkpoint,
            Boolean(this.projection.profile),
            this.accountLinked,
        );
        this.shell.setNavigation(globalNavigationAvailable, navigation);
        this.shell.setUtilityVisible?.(route !== 'review');
        this.shell.setLearnerActionsVisible(globalNavigationAvailable);
        this.shell.setPresentationMode(this.checkpoint.presentationMode);
        const context = {
            language: this.language,
            checkpoint: this.checkpoint,
            projection: this.projection,
            shell: this.shell,
            go: (next, update) => this.go(next, update),
            back: () => this.back(),
            returnTo: destination => this.returnTo(destination),
            save: update => this.saveRouteState(update),
        } satisfies AcademyRouteContext;
        if (await this.enrollment.render(route, context)) return;
        if (await this.lesson.render(route, context)) return;
        if (await this.world.render(route, context)) return;
        await this.commitNavigation({ kind: 'replace', route: 'class' });
    }

    private async go(
        route: AcademyRoute,
        update: AcademyCheckpointUpdate = {},
    ): Promise<void> {
        const establishesSession = this.checkpoint.route === 'access' && route !== 'access' && update.session !== undefined;
        await this.commitNavigation(
            {
                kind: establishesSession ? 'reset' : 'push',
                route,
                context: routeContextUpdate(update),
            },
            update,
        );
    }

    private async back(): Promise<void> {
        await this.commitNavigation({ kind: 'back' });
    }

    private async returnTo(destination: import('./routing/route-history').AcademyRouteFrame): Promise<void> {
        await this.commitNavigation({ kind: 'return', destination });
    }

    private async saveRouteState(update: AcademyCheckpointUpdate): Promise<void> {
        const navigation = transitionAcademyRoute(this.checkpoint, {
            kind: 'replace',
            route: this.checkpoint.route,
            context: routeContextUpdate(update),
        });
        const now = Date.now();
        const candidate: AcademyCheckpoint = {
            ...navigation,
            ...update,
            schemaVersion: 2,
            updatedAt: now,
        };
        this.checkpoint = normalizeResumeCheckpoint(candidate, this.projection, now, navigator.onLine, this.accountLinked);
        await this.persistence.checkpoint.save(this.checkpoint);
    }

    private async setPresentationMode(mode: AcademyCheckpoint['presentationMode']): Promise<void> {
        await this.commitNavigation({ kind: 'presentation', mode });
    }

    private async commitNavigation(
        transition: AcademyRouteTransition,
        update: AcademyCheckpointUpdate = {},
    ): Promise<void> {
        const navigation = transitionAcademyRoute(this.checkpoint, transition);
        const now = Date.now();
        const candidate: AcademyCheckpoint = {
            ...navigation,
            ...update,
            schemaVersion: 2,
            updatedAt: now,
        };
        this.checkpoint = normalizeResumeCheckpoint(candidate, this.projection, now, navigator.onLine, this.accountLinked);
        await this.persistence.checkpoint.save(this.checkpoint);
        await this.render();
    }

    private toggleLanguage(): void {
        this.language = this.language === 'en' ? 'ja' : 'en';
        try { localStorage.setItem(LANGUAGE_KEY, this.language); } catch { /* current session still updates */ }
        this.shell.setLanguage(this.language);
        void this.render();
    }

    private toggleMuted(): void {
        this.audio.setMuted(!this.audio.settings.muted);
        this.shell.setMuted(this.audio.settings.muted);
    }
}

function loadLanguage(): AcademyLanguage {
    try {
        const stored = localStorage.getItem(LANGUAGE_KEY);
        if (stored === 'en' || stored === 'ja') return stored;
    } catch { /* use browser language */ }
    return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

function safeLocalStorage(): Storage | null {
    try { return localStorage; } catch { return null; }
}

function routeContextUpdate(update: AcademyCheckpointUpdate): Partial<AcademyRouteContextState> {
    const context: Partial<AcademyRouteContextState> = {};
    const keys = ['selectedBand', 'selectedFork', 'placementOverride', 'lessonId', 'sectionId', 'activityId', 'worldPlace'] as const;
    for (const key of keys) {
        if (Object.hasOwn(update, key)) Object.assign(context, { [key]: update[key] });
    }
    return context;
}
