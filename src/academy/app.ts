import type { AcademyLanguage } from '../reader/app/academy-copy';
import { createAccessGateway, type AccessGateway } from './access/gateway';
import { BrowserMediaBus, SilentSfxPlayback } from './audio/browser-media';
import { BrowserSpeechPronunciationService } from './audio/browser-speech';
import { SILENT_AUDIO_CATALOG } from './audio/catalog';
import { AudioDirector } from './audio/director';
import { AAKASH_RAINY_DIRECTIONS_SCENE_ID, createAakashDirectionsActivity } from './content/aakash-meet';
import { loadVerticalSliceContent } from './content/vertical-slice';
import type { ActivityEvaluation } from './domain/activity-runtime';
import { createLearnerEvidence, type LearnerEvidence } from './evidence/learner-evidence';
import { createYomuLocalReviewService } from './integration/yomu-local-review';
import { createCanonicalKanjiWritingService } from './integration/yomu-kanji-writing';
import type { KanjiWritingService, PronunciationService, ReviewQueueService } from './integration/yomu-bridge';
import {
    createMemoryAcademyPersistence,
    openAcademyPersistence,
    type AcademyCheckpoint,
    type AcademyPersistence,
    type AcademyRoute,
} from './persistence/indexeddb';
import { navigationForRoute, normalizeResumeCheckpoint, themeForRoute } from './routing/contract';
import { createEnrollmentFlow } from './routing/enrollment-flow';
import type { AcademyRouteContext, AcademyRouteFlow } from './routing/types';
import { createWorldFlow } from './routing/world-flow';
import { renderAakashMeetScreen } from './ui/character-scenes';
import { renderKanjiDeskScreen, renderLessonFork, renderSourceActivityScreen } from './ui/lesson-screen';
import { renderLoadingScreen } from './ui/loading-screen';
import { createAcademyShell, type AcademyShell } from './ui/shell';

const LANGUAGE_KEY = 'yomu:academy:language:v1';

export interface AcademyAppOptions {
    readonly access?: AccessGateway;
    readonly persistence?: AcademyPersistence;
    readonly review?: ReviewQueueService;
    readonly kanjiWriting?: KanjiWritingService;
    readonly pronunciation?: PronunciationService;
    readonly databaseName?: string;
}

export class AcademyApp {
    private readonly access: AccessGateway;
    private readonly suppliedPersistence?: AcademyPersistence;
    private readonly review: ReviewQueueService;
    private readonly kanjiWriting: KanjiWritingService;
    private readonly pronunciation: PronunciationService;
    private readonly databaseName?: string;
    private readonly audio: AudioDirector;
    private readonly lifecycle = new AbortController();
    private language: AcademyLanguage = loadLanguage();
    private shell: AcademyShell;
    private persistence!: AcademyPersistence;
    private evidence!: LearnerEvidence;
    private enrollment!: AcademyRouteFlow;
    private world!: AcademyRouteFlow;
    private checkpoint: AcademyCheckpoint = { schemaVersion: 1, route: 'access', updatedAt: Date.now() };

    private get projection() { return this.evidence.projection; }

    constructor(host: HTMLElement, options: AcademyAppOptions = {}) {
        this.access = options.access ?? createAccessGateway();
        this.suppliedPersistence = options.persistence;
        this.review = options.review ?? createYomuLocalReviewService();
        this.kanjiWriting = options.kanjiWriting ?? createCanonicalKanjiWritingService();
        this.databaseName = options.databaseName;
        this.audio = new AudioDirector({
            catalog: SILENT_AUDIO_CATALOG,
            music: new BrowserMediaBus(),
            ambience: new BrowserMediaBus(),
            lesson: new BrowserMediaBus(),
            sfx: new SilentSfxPlayback(),
            storage: safeLocalStorage(),
            releaseMode: true,
        });
        this.pronunciation = options.pronunciation ?? new BrowserSpeechPronunciationService(this.audio);
        this.shell = createAcademyShell(host, {
            language: this.language,
            onLanguage: () => this.toggleLanguage(),
            onMute: () => this.toggleMuted(),
            onNavigate: route => void this.go(route),
        });
        this.shell.setNavigation(false);
        this.shell.setMuted(this.audio.settings.muted);
    }

    async start(): Promise<void> {
        this.shell.replace(renderLoadingScreen(this.language, navigator.onLine));
        this.persistence = this.suppliedPersistence
            ?? await openAcademyPersistence(indexedDB, this.databaseName).catch(() => createMemoryAcademyPersistence());
        this.evidence = createLearnerEvidence(this.persistence.events, this.review);
        await this.evidence.initialize();
        this.enrollment = createEnrollmentFlow({
            access: this.access,
            evidence: this.evidence,
            pronunciation: this.pronunciation,
        });
        this.world = createWorldFlow({
            evidence: this.evidence,
            pronunciation: this.pronunciation,
            audio: this.audio,
        });
        this.checkpoint = await this.persistence.checkpoint.load() ?? this.checkpoint;
        this.normalizeResumeRoute();
        this.bindLifecycle();
        await this.render();
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
        window.addEventListener('online', () => this.shell.setNetwork(true), { signal: this.lifecycle.signal });
        window.addEventListener('offline', () => this.shell.setNetwork(false), { signal: this.lifecycle.signal });
        document.addEventListener('visibilitychange', () => void this.audio.handleVisibility(document.hidden), { signal: this.lifecycle.signal });
        this.shell.setNetwork(navigator.onLine);
    }

    private normalizeResumeRoute(): void {
        this.checkpoint = normalizeResumeCheckpoint(this.checkpoint, this.projection, Date.now(), navigator.onLine);
    }

    private async render(): Promise<void> {
        const route = this.checkpoint.route;
        await this.audio.setTheme(themeForRoute(route));
        const navigation = navigationForRoute(route);
        this.shell.setNavigation(Boolean(navigation), navigation);
        const context = {
            language: this.language,
            checkpoint: this.checkpoint,
            projection: this.projection,
            shell: this.shell,
            go: (next, update) => this.go(next, update),
        } satisfies AcademyRouteContext;
        if (await this.enrollment.render(route, context)) return;
        if (await this.world.render(route, context)) return;
        switch (route) {
            case 'lesson-fork':
                this.shell.replace(renderLessonFork(this.language, this.checkpoint.selectedFork, fork => void this.go('source-activity', { selectedFork: fork })));
                break;
            case 'source-activity':
                await this.renderSourceActivity();
                break;
            case 'aakash-meet':
                this.renderAakashMeet();
                break;
            case 'writing-practice':
                await this.renderWritingPractice();
                break;
        }
    }

    private async renderSourceActivity(): Promise<void> {
        this.shell.replace(renderLoadingScreen(this.language, navigator.onLine));
        const content = await loadVerticalSliceContent();
        this.shell.replace(renderSourceActivityScreen(
            this.language,
            content,
            evaluation => this.recordSourceActivity(evaluation),
            () => void this.go('aakash-meet'),
        ));
    }

    private async recordSourceActivity(evaluation: ActivityEvaluation): Promise<void> {
        await this.evidence.recordActivity(evaluation, {
            id: 'lesson-zero-first-repair',
            sceneId: 'scene:lesson-zero-first-repair',
        });
    }

    private renderAakashMeet(): void {
        this.shell.replace(renderAakashMeetScreen({
            language: this.language,
            activity: createAakashDirectionsActivity(),
            completed: this.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID),
            onEvaluation: evaluation => this.recordAakashActivity(evaluation),
            onContinue: () => void this.go('writing-practice'),
        }));
    }

    private async recordAakashActivity(evaluation: ActivityEvaluation): Promise<void> {
        await this.evidence.recordActivity(evaluation, {
            id: 'aakash-rainy-directions',
            sceneId: AAKASH_RAINY_DIRECTIONS_SCENE_ID,
            unlock: { assetId: 'character:aakash', characterId: 'aakash', bondDelta: 1 },
        });
    }

    private async renderWritingPractice(): Promise<void> {
        this.shell.replace(renderLoadingScreen(this.language, navigator.onLine));
        const trace = await this.kanjiWriting.lookup('一');
        if (!trace) throw new Error('The pinned KanjiVG writing trace is unavailable.');
        this.shell.replace(renderKanjiDeskScreen(
            this.language,
            trace,
            evaluation => this.recordWritingActivity(evaluation),
            () => void this.go('campus'),
        ));
    }

    private async recordWritingActivity(evaluation: ActivityEvaluation): Promise<void> {
        await this.evidence.recordActivity(evaluation, {
            id: 'lesson-zero-writing-desk',
            sceneId: 'scene:lesson-zero-writing-desk',
            requiredErrorTag: 'kanji-writing-complete',
        });
    }

    private async go(route: AcademyRoute, update: Partial<AcademyCheckpoint> = {}): Promise<void> {
        this.checkpoint = { ...this.checkpoint, ...update, schemaVersion: 1, route, updatedAt: Date.now() };
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
