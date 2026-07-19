import type { AudioDirector } from '../audio/director';
import type { AcademySyncClient } from '../account/sync-client';
import { loadClassWeekCastPlan } from '../content/class-week-cast-plan-loader';
import { loadClassWeekDeliveryCatalog } from '../content/class-week-delivery-catalog';
import { advancedCurriculumForBand, advancedLessonId } from '../content/advanced-curriculum';
import { ACADEMY_LESSON_CONTENT_REGISTRY } from '../content/lesson-content-registry';
import {
    loadLibraryVocabularySheet,
    libraryStudyVocabulary,
    libraryVocabularyReviewSeeds,
    type LibraryVocabularySheet,
} from '../content/library-vocabulary-sheet';
import { serializeStoryCursor } from '../content/story-runner';
import { loadStoryRuntime, openingArcModeForEntry, STORY_REVIEW_CALENDAR_SECTION } from '../content/story-runtime';
import { n3StoryPractice } from '../content/n3-story-practice';
import { storyReplayReviewSeed } from '../content/story-replay-catalog';
import type { JlptBand } from '../domain/learner-record';
import { canonicalGroundedReviewKey } from '../domain/review-identity';
import type { ReplayLanguageBand } from '../domain/story-replay-projection';
import { projectCharacterDirectory, type CharacterRevisitPath } from '../domain/progress-projections';
import { markWorldVisit, worldRouteForPlace, type WorldPlaceId, type WorldRoute } from '../domain/world-locations';
import type { LearnerEvidence } from '../evidence/learner-evidence';
import {
    projectDailyLearningRoute,
    type DailyLearningCandidate,
    type DailyLearningRoute,
    type DailyRouteAction,
} from '../domain/daily-learning-loop';
import {
    createCanonicalAcademyStudyModule,
    mountAcademyStudyModule,
    type AcademyStudyVocabulary,
    type AcademyStudyModule,
} from '../integration/study-module';
import type { PronunciationService } from '../integration/yomu-bridge';
import type { AcademyRoute } from '../persistence/indexeddb';
import { renderAakashMemory } from '../ui/character-scenes';
import { renderClassPathScreen } from '../ui/class-path-screen';
import { renderClassBoardScreen } from '../ui/class-board-screen';
import { renderDayEndScene } from '../ui/day-end-scene';
import { renderOpeningMemory } from '../ui/lesson-screen';
import { renderLoadingScreen } from '../ui/loading-screen';
import { renderProfileSyncScreen } from '../ui/profile-sync-screen';
import { openVocabularySheet, renderLibraryIntroduction, renderLibraryScreen } from '../ui/library-screen';
import { renderStoryScreen } from '../ui/story-screen';
import {
    renderJournalScreen,
    renderWorldPlaceScreen,
    type WorldLessonContext,
} from '../ui/world-screen';
import { createWorldLocationAudioSession, type WorldLocationAudioSession } from '../vn/world-location-audio';
import type { AcademyRouteContext, AcademyRouteFlow } from './types';
import { hasSeenIntroduction, introductionId, markIntroductionSeen } from './location-introductions';

export interface WorldFlowOptions {
    readonly evidence: LearnerEvidence;
    readonly pronunciation: PronunciationService;
    readonly audio: AudioDirector;
    readonly study?: AcademyStudyModule;
    readonly sync?: AcademySyncClient;
}

export function createWorldFlow(options: WorldFlowOptions): AcademyRouteFlow {
    return new WorldFlow(options);
}

class WorldFlow implements AcademyRouteFlow {
    private readonly locationAudio: WorldLocationAudioSession;

    constructor(private readonly options: WorldFlowOptions) {
        this.locationAudio = createWorldLocationAudioSession({ director: options.audio });
    }

    async render(route: AcademyRoute, context: AcademyRouteContext): Promise<boolean> {
        switch (route) {
            case 'campus':
                return this.renderWorldPlace('courtyard', context);
            case 'classroom':
            case 'cafe':
            case 'lab':
            case 'street':
            case 'station':
            case 'konbini':
            case 'ramen':
            case 'home':
                return this.renderWorldPlace(route, context);
            case 'world':
                return this.renderWorldPlace(context.checkpoint.worldPlace ?? 'courtyard', context);
            case 'story':
                await this.renderStory(context);
                return true;
            case 'class':
                await this.renderClassPath(context);
                return true;
            case 'review':
                this.locationAudio.enter('library');
                await this.renderReview(context);
                return true;
            case 'journal':
                await this.renderJournal(context);
                return true;
            case 'profile-sync':
                this.renderProfileSync(context);
                return true;
            case 'class-board':
                this.renderClassBoard(context);
                return true;
            case 'day-end':
                context.shell.replace(renderDayEndScene({
                    language: context.language,
                    onReturn: () => void context.go('campus'),
                }));
                return true;
            default:
                return false;
        }
    }

    private async renderStory(context: AcademyRouteContext): Promise<void> {
        context.shell.setNavigation(true, 'story');
        const story = loadStoryRuntime();
        const replayEvents = await this.options.evidence.history?.() ?? [];
        context.shell.replace(renderStoryScreen({
            language: context.language,
            story,
            ...(context.projection.profile ? { learner: context.projection.profile } : {}),
            sectionId: context.checkpoint.sectionId,
            openingArcMode: openingArcModeForEntry(context.projection),
            arcModeForEpisode: episodeId => n3ArcMode(episodeId, replayEvents, context.projection),
            onOpenEpisode: episodeId => void context.go('story', { sectionId: episodeId }),
            onCompleteEpisode: episodeId => {
                const episode = story.episode(episodeId);
                if (episode?.id === story.openingArc.episodeId) return;
                if (!episode || !this.options.evidence.recordEncounter) return;
                return this.options.evidence.recordEncounter({
                    encounterId: `story:${episode.id}`,
                    sceneId: `scene:story:${episode.id}`,
                    attendeeIds: episode.cast,
                });
            },
            onArcSceneEncounter: (episodeId, sceneId, attendeeIds) => {
                if (!this.options.evidence.recordEncounter || !attendeeIds.length) return;
                return this.options.evidence.recordEncounter({
                    encounterId: `story:${episodeId}:scene:${sceneId}`,
                    sceneId,
                    attendeeIds,
                });
            },
            activityOutcomes: storyActivityOutcomes(context.projection, replayEvents),
            selectedBand: context.checkpoint.selectedBand ?? context.projection.curriculumEntry?.band,
            audio: { playSfx: cue => this.options.audio.playSfx(cue) },
            onCheckpoint: cursor => context.save?.({ sectionId: serializeStoryCursor(cursor) }),
            onOpenActivity: (lessonId, activityId, cursor) => void context.go('source-activity', {
                lessonId,
                activityId,
                sectionId: cursor ? serializeStoryCursor(cursor) : context.checkpoint.sectionId,
                selectedFork: storyForkForActivity(activityId),
            }),
            onCompleteStoryPractice: (activityId, outcome) => {
                const practice = n3StoryPractice(activityId);
                if (!practice) throw new Error(`Unknown authored story practice: ${activityId}`);
                return this.options.evidence.recordAuthoredStoryPractice({
                    ...practice,
                    reviewSeed: storyReplayReviewSeed(practice),
                }, outcome);
            },
            onOpenReviewCalendar: () => void context.go('story', { sectionId: STORY_REVIEW_CALENDAR_SECTION }),
            replayEvents,
            onOpenReplayChapter: (chapterId, band) => void context.go('story', {
                sectionId: chapterId,
                ...(replayCheckpointBand(band) ? { selectedBand: replayCheckpointBand(band) } : {}),
            }),
            onOpenReplayLesson: lessonId => void context.go('lesson-overview', { lessonId }),
            onBack: () => void context.back(),
            onReturnToEpisodes: () => void context.go('story', { sectionId: undefined }),
        }));
    }

    private async renderWorldPlace(place: WorldPlaceId, context: AcademyRouteContext): Promise<true> {
        this.locationAudio.enter(place);
        const characters = projectCharacterDirectory(context.projection);
        const lessonContext = await this.classroomWeekContext(place, context);
        let speech: { dispose(): void } | undefined;
        // `context.checkpoint` is a render-time snapshot. Handlers below can fire
        // in sequence within ONE render (arrival dialogue -> practice completion),
        // and a later write based on the stale snapshot would drop introductions
        // the earlier handler already saved — live symptom: finishing a practice
        // resurrected the first-visit arrival dialogue. Track the working list.
        let seenIntroductions = context.checkpoint.seenIntroductions;
        const markSeen = (id: string): readonly string[] => {
            seenIntroductions = markIntroductionSeen(seenIntroductions, id);
            return seenIntroductions;
        };
        const screen = renderWorldPlaceScreen({
            language: context.language,
            place,
            route: context.checkpoint.route,
            ...(lessonContext ? { lessonContext } : {}),
            progress: {
                completedScenes: context.projection.completedScenes,
                completedEncounterIds: context.projection.completedEncounterIds,
                metCharacterIds: characters.filter(character => character.unlocked).map(character => character.characterId),
                worldVisits: context.checkpoint.worldVisits,
                seenIntroductions: context.checkpoint.seenIntroductions,
            },
            onTravel: destination => {
                this.locationAudio.leave(place);
                void this.travelWorldPlace(destination, context);
            },
            onActivity: route => {
                this.locationAudio.confirm(place);
                void this.openWorldActivity(route, context);
            },
            onClaimStamp: stampId => void context.go(context.checkpoint.route, {
                seenIntroductions: markSeen(stampId),
            }),
            onIntroductionComplete: introduction => {
                this.locationAudio.confirm(place);
                // The arrival dialogue is local state, not a navigation event.
                // Saving it in place preserves Back's existing route frame.
                const update = {
                    seenIntroductions: markSeen(introduction),
                };
                void (context.save
                    ? context.save(update)
                    : context.go(context.checkpoint.route, update));
            },
            onListen: async line => {
                try {
                    const next = await this.options.pronunciation.play(line);
                    speech?.dispose();
                    speech = next;
                    return true;
                } catch {
                    return false;
                }
            },
            onObjectInteract: () => { this.locationAudio.toggleObject(place); },
            onPaperTurn: () => { this.options.audio?.playSfx?.('page.turn'); },
            onPracticeComplete: (_practiceId, stampId, evaluation) => {
                this.locationAudio.succeed(place);
                if (evaluation) void this.options.evidence.recordWorldPractice?.(evaluation);
                const update = { seenIntroductions: markSeen(stampId) };
                if (context.save) {
                    // Keep the completed prop and success state mounted. A route-local save
                    // records the stamp without replacing the screen the learner just changed.
                    void context.save(update).catch(() => context.go(context.checkpoint.route, update));
                    return;
                }
                // Compatibility fallback for older embedded hosts without route-local save.
                setTimeout(() => {
                    void context.go(context.checkpoint.route, update);
                }, 1200);
            },
            // Route-flow harnesses and older embedded hosts may not mount an audio director.
            // The in-world radio remains optional in that case instead of blocking travel.
            audioMuted: this.options.audio?.settings?.muted ?? false,
            onToggleAudio: () => {
                const muted = !(this.options.audio?.settings?.muted ?? false);
                this.options.audio?.setMuted?.(muted);
                if (!muted) this.locationAudio.toggleObject(place);
                return muted;
            },
            ...(context.checkpoint.route === 'campus' ? {} : { onBack: () => void context.back() }),
        });
        screen.addEventListener('academy:dispose', () => speech?.dispose(), { once: true });
        context.shell.replace(screen);
        return true;
    }

    private async classroomWeekContext(
        place: WorldPlaceId,
        context: AcademyRouteContext,
    ): Promise<WorldLessonContext | undefined> {
        if (place !== 'classroom' || context.checkpoint.lessonId !== 'authored-week:l1-l01') return undefined;
        const plan = await loadClassWeekCastPlan();
        const week = plan.weeks.find(candidate => candidate.weekId === 'l1-l01');
        if (!week || week.status !== 'source-backed' || !week.primary || !week.supporting[0]) {
            throw new Error('Class Week l1-l01 has no grounded classroom roster.');
        }
        const primary = week.primary;
        const supporting = week.supporting[0];
        return {
            lessonId: 'authored-week:l1-l01',
            introductionId: 'week:l1-l01:classroom',
            people: ['rie', primary.id, supporting.id],
            activity: {
                label: {
                    en: `Week 1 · ${week.source.title.en}`,
                    ja: `第1週・${week.source.title.ja}`,
                },
                detail: {
                    en: `Meet ${primary.firstName}-san and ${supporting.firstName}-san, then ask and answer one name question.`,
                    ja: `${primary.firstName}さん、${supporting.firstName}さんと、名前を聞いて答える。`,
                },
                curriculum: {
                    id: 'authored-week:l1-l01',
                    surface: 'moodle',
                    state: 'grounded',
                    label: {
                        en: 'Chapter 1 · self-introduction and classroom phrases',
                        ja: '第1課・自己紹介と教室のことば',
                    },
                },
            },
            arrivalDialogue: {
                speakerId: 'rie',
                line: {
                    en: `“Tonight begins with はじめまして. ${primary.firstName}-san and ${supporting.firstName}-san have their name cards ready, so start with one greeting.”`,
                    ja: `「今夜は『はじめまして』から始めます。${primary.firstName}さんと${supporting.firstName}さんの名札を見て、最初のあいさつから始めましょう。」`,
                },
                action: { en: 'Read the name cards', ja: '名札を見る' },
            },
            presence: {
                rie: {
                    id: 'writing-week-one-heading',
                    label: { en: 'Writing はじめまして on the board', ja: '黒板に「はじめまして」と書いている' },
                },
                [primary.id]: {
                    id: 'setting-out-name-cards',
                    label: { en: 'Setting out two name cards', ja: '二枚の名札を並べている' },
                },
                [supporting.id]: {
                    id: 'waiting-for-name-answer',
                    label: { en: 'Waiting for the first name answer', ja: '最初の名前の答えを待っている' },
                },
            },
        };
    }

    private async travelWorldPlace(place: WorldPlaceId, context: AcademyRouteContext): Promise<void> {
        const route = worldRouteForPlace(place);
        const isFirstArrival = !hasSeenIntroduction(
            context.checkpoint.seenIntroductions,
            introductionId('place', place),
        );
        await context.go(route, {
            worldVisits: isFirstArrival
                ? context.checkpoint.worldVisits ?? {}
                : markWorldVisit(context.checkpoint.worldVisits, place),
            ...(route === 'world' ? { worldPlace: place } : {}),
        });
    }

    private async openWorldActivity(route: WorldRoute, context: AcademyRouteContext): Promise<void> {
        if (route === 'class') {
            if (context.checkpoint.lessonId) {
                await context.go('lesson-overview');
                return;
            }
            await context.go('class', {
                ...(context.projection.curriculumEntry?.band
                    ? { selectedBand: context.projection.curriculumEntry.band }
                    : {}),
                lessonId: undefined,
                sectionId: undefined,
                activityId: undefined,
            });
            return;
        }
        await context.go(route);
    }

    private async renderClassPath(context: AcademyRouteContext): Promise<void> {
        context.shell.replace(renderLoadingScreen(context.language, navigator.onLine));
        const plan = await loadClassWeekCastPlan();
        const delivery = await loadClassWeekDeliveryCatalog(plan);
        const playableWeeks = delivery.weeks.filter(week => week.state === 'grounded-playable');
        const playableWeekIds = new Set(playableWeeks.map(week => week.weekId));
        const completedWeekIds = completedClassWeekIds(playableWeeks, context.projection.completedEncounterIds);
        const selectedBand = context.checkpoint.selectedBand ?? context.projection.curriculumEntry?.band;
        const requestedOrder = classOrderForBand(selectedBand);
        const replayEvents = await this.options.evidence.history?.() ?? [];
        const schedulerDueReviews = this.options.evidence.dueReviews
            ? await this.options.evidence.dueReviews(50).catch(() => undefined)
            : undefined;
        const dailyRoute = dailyLearningRoute(
            plan,
            playableWeeks,
            loadStoryRuntime().episodes,
            replayEvents,
            context.language,
            requestedOrder,
            schedulerDueReviews,
        );
        const currentOrder = nextIncompletePlayableOrder(
            plan.weeks,
            playableWeekIds,
            completedWeekIds,
            requestedOrder,
        );
        context.shell.replace(renderClassPathScreen({
            language: context.language,
            plan,
            currentOrder,
            playableWeekIds,
            completedWeekIds,
            characters: projectCharacterDirectory(context.projection),
            selectedBand,
            advancedPackages: advancedCurriculumForBand(selectedBand),
            ...(dailyRoute ? { dailyRoute } : {}),
            ...(context.projection.profile?.learningReason
                ? { learningReason: context.projection.profile.learningReason }
                : {}),
            onBack: () => void context.back(),
            onOpenWeek: weekId => {
                const lesson = delivery.weeks.find(entry => entry.weekId === weekId);
                if (!lesson || lesson.state !== 'grounded-playable') {
                    this.options.audio?.playSfx?.('action.unavailable');
                    return;
                }
                this.options.audio?.playSfx?.('menu.confirm');
                if (weekId === 'l1-l01') {
                    void context.go('classroom', {
                        lessonId: lesson.lessonId,
                        sectionId: undefined,
                        activityId: undefined,
                    });
                    return;
                }
                void context.go('lesson-overview', { lessonId: lesson.lessonId });
            },
            onOpenAdvanced: packageId => {
                this.options.audio?.playSfx?.('menu.confirm');
                void context.go('source-activity', {
                    selectedBand,
                    lessonId: advancedLessonId(packageId),
                    sectionId: undefined,
                    activityId: undefined,
                });
            },
            onOpenDailyAction: action => this.openDailyAction(action, context),
        }));
    }

    private openDailyAction(action: DailyRouteAction, context: AcademyRouteContext): void {
        this.options.audio?.playSfx?.('menu.confirm');
        if (action.kind === 'repair') {
            void context.go('review');
            return;
        }
        if (action.kind === 'lesson') {
            void context.go('lesson-overview', { lessonId: action.id });
            return;
        }
        if (action.id.startsWith('story:')) {
            void context.go('story', { sectionId: action.id.slice('story:'.length) });
        }
    }

    private async renderReview(context: AcademyRouteContext): Promise<void> {
        const libraryIntroduction = introductionId('place', 'library');
        if (!hasSeenIntroduction(context.checkpoint.seenIntroductions, libraryIntroduction)) {
            context.shell.replace(renderLibraryIntroduction(
                context.language,
                () => void this.completeLibraryIntroduction(context, libraryIntroduction),
                () => void context.back(),
            ));
            return;
        }
        await this.renderLibrary(context);
    }

    private async completeLibraryIntroduction(
        context: AcademyRouteContext,
        introduction: string,
    ): Promise<void> {
        const update = {
            seenIntroductions: markIntroductionSeen(context.checkpoint.seenIntroductions, introduction),
        };
        if (!context.save) {
            await context.go('review', update);
            return;
        }
        await context.save(update);
        await this.renderLibrary(context);
    }

    private async renderLibrary(context: AcademyRouteContext): Promise<void> {
        const sheet = await loadLibraryVocabularySheet(await this.libraryPackageId(context));
        if (Object.keys(context.projection.scheduledReviews).length) {
            await this.restoreDueLibrarySyllabus(context, sheet);
        }
        const due = toSessionVocabulary(await this.options.evidence.dueReviews(50));
        const sheetVocabulary = libraryStudyVocabulary(sheet);
        const syllabusState = due.length ? 'due' : await this.options.evidence.syllabusState?.(sheetVocabulary);
        let speech: { dispose(): void } | undefined;
        const play = (word: Pick<AcademyStudyVocabulary, 'expression' | 'reading'>) => {
            void this.options.pronunciation.play(word.expression, word.reading)
                .then(next => { speech?.dispose(); speech = next; })
                .catch(() => undefined);
        };
        const screen = renderLibraryScreen({
            language: context.language,
            sheet,
            due,
            ...(syllabusState ? { syllabusState } : {}),
            onBack: () => void context.back(),
            onStart: () => void this.startLibraryStudy(context, sheet, sheetVocabulary, play),
            onPlay: play,
        });
        screen.addEventListener('academy:dispose', () => speech?.dispose(), { once: true });
        context.shell.replace(screen);
    }

    private async restoreDueLibrarySyllabus(
        context: AcademyRouteContext,
        sheet: LibraryVocabularySheet,
    ): Promise<void> {
        const dueSeeds = libraryVocabularyReviewSeeds(sheet).filter(seed => {
            const itemId = canonicalGroundedReviewKey(seed.content.expression, seed.content.reading);
            const schedule = context.projection.scheduledReviews[itemId];
            return Boolean(schedule && schedule.dueAt <= Date.now() && !context.projection.reviewRatings[itemId]);
        });
        if (!dueSeeds.length) return;
        await this.options.evidence.seedVocabularyPrerequisite(
            `authored-week:${sheet.lessonId}`,
            dueSeeds,
        );
    }

    private async startLibraryStudy(
        context: AcademyRouteContext,
        sheet: LibraryVocabularySheet,
        sheetVocabulary: readonly AcademyStudyVocabulary[],
        play: (word: Pick<AcademyStudyVocabulary, 'expression' | 'reading'>) => void,
    ): Promise<void> {
        await this.options.evidence.seedVocabularyPrerequisite(
            `authored-week:${sheet.lessonId}`,
            libraryVocabularyReviewSeeds(sheet),
        );
        await this.mountStudy(context, sheet, sheetVocabulary, play);
    }

    private async libraryPackageId(context: AcademyRouteContext): Promise<string> {
        const revisited = context.checkpoint.lessonId?.startsWith('authored-week:')
            ? context.checkpoint.lessonId.slice('authored-week:'.length)
            : undefined;
        if (revisited) return revisited;

        const band = context.projection.curriculumEntry?.band;
        if (!band) return 'l1-l01';
        const plan = await loadClassWeekCastPlan();
        return currentLibraryPackageId(plan.weeks, band);
    }

    private async mountStudy(
        context: AcademyRouteContext,
        sheet: LibraryVocabularySheet,
        sheetVocabulary: readonly AcademyStudyVocabulary[],
        play: (word: Pick<AcademyStudyVocabulary, 'expression' | 'reading'>) => void,
    ): Promise<void> {
        const screen = document.createElement('section');
        screen.className = 'academy-study-screen';
        screen.dataset.academyScreen = 'study';
        screen.dataset.academyRoute = 'review';
        context.shell.replace(screen);
        let lifecycle: { dispose(): void } | undefined;
        let disposed = false;
        screen.addEventListener('academy:dispose', () => {
            disposed = true;
            lifecycle?.dispose();
        }, { once: true });
        const mounted = await mountAcademyStudyModule(
            screen,
            this.options.study ?? createCanonicalAcademyStudyModule(),
            {
                language: context.language,
                onExit: () => void context.back(),
                sessionVocabulary: sheetVocabulary,
                onOpenVocabularySheet: () => void this.openStudyVocabularySheet(
                    screen,
                    context.language,
                    sheet,
                    sheetVocabulary,
                    play,
                ),
            },
        );
        if (disposed) mounted.dispose();
        else lifecycle = mounted;
    }

    private async openStudyVocabularySheet(
        host: HTMLElement,
        language: AcademyRouteContext['language'],
        sheet: LibraryVocabularySheet,
        syllabus: readonly AcademyStudyVocabulary[],
        play: (word: Pick<AcademyStudyVocabulary, 'expression' | 'reading'>) => void,
    ): Promise<void> {
        const due = toSessionVocabulary(await this.options.evidence.dueReviews(50));
        const syllabusState = due.length ? 'due' : await this.options.evidence.syllabusState?.(syllabus);
        if (!host.isConnected) return;
        openVocabularySheet(host, {
            language,
            sheet,
            due,
            ...(syllabusState ? { syllabusState } : {}),
            onPlay: play,
        });
    }

    private async renderJournal(context: AcademyRouteContext): Promise<void> {
        const profile = context.projection.profile;
        if (!profile) {
            await context.go('profile');
            return;
        }
        const journal = renderJournalScreen(
            context.language,
            profile,
            {
                characters: projectCharacterDirectory(context.projection),
                journalLines: Object.values(context.projection.journalLines),
            },
            {
                onReplayRie: () => this.replayOpening(context),
                onReplayAakash: () => this.replayAakash(context),
                onRevisit: path => this.revisitCharacter(path, context),
                onProfileSync: () => void context.go('profile-sync'),
            },
        );
        context.shell.replace(journal);
    }

    private renderProfileSync(context: AcademyRouteContext): void {
        const sync = this.options.sync;
        if (!sync) {
            void context.back();
            return;
        }
        context.shell.replace(renderProfileSyncScreen({
            language: context.language,
            status: sync.status,
            onBack: () => void context.back(),
            onConnect: async () => { await sync.connect(); this.renderProfileSync(context); },
            onRetry: async () => { await sync.retry(); this.renderProfileSync(context); },
            onGoogleLink: () => sync.beginGoogleLink(),
            onStartPairing: () => sync.startPairing(),
            onClaimPairing: async code => { await sync.claimPairing(code); this.renderProfileSync(context); },
            onExport: async () => downloadExport(await sync.exportData()),
            onSignOut: async () => { await sync.signOut(); this.renderProfileSync(context); },
            onDelete: async scope => { await sync.deleteRemoteData(scope); this.renderProfileSync(context); },
            onClassBoard: sync.status.account?.classes.length
                ? () => void context.go('class-board')
                : undefined,
            onContinue: context.checkpoint.routeHistory.length === 0
                ? () => void context.go(context.projection.profile ? 'start' : 'profile')
                : undefined,
        }));
    }

    private renderClassBoard(context: AcademyRouteContext): void {
        const sync = this.options.sync;
        if (!sync) {
            void context.back();
            return;
        }
        const account = sync.status.account;
        if (!account) {
            context.shell.replace(renderLoadingScreen(context.language, navigator.onLine));
            void sync.connect().then(() => {
                if (sync.status.account) this.renderClassBoard(context);
                else this.renderProfileSync(context);
            }).catch(() => this.renderProfileSync(context));
            return;
        }
        context.shell.replace(renderClassBoardScreen({
            language: context.language,
            account,
            onBack: () => void context.back(),
            onLoad: (classId, metric, page) => sync.loadClassLeaderboard(classId, metric, page, 20),
            onSaveProfile: update => sync.updateClassBoardProfile(update),
        }));
    }

    private replayOpening(context: AcademyRouteContext): void {
        context.shell.setNavigation(true, 'journal');
        context.shell.replace(renderOpeningMemory(context.language, () => void context.go('journal')));
    }

    private replayAakash(context: AcademyRouteContext): void {
        context.shell.setNavigation(true, 'journal');
        context.shell.replace(renderAakashMemory(context.language, () => void context.go('journal')));
    }

    private revisitCharacter(path: CharacterRevisitPath, context: AcademyRouteContext): void {
        if (path.kind === 'memory') {
            if (path.targetId === 'rie-opening') this.replayOpening(context);
            else if (path.targetId === 'aakash-rainy-directions') this.replayAakash(context);
            return;
        }
        if (path.kind === 'class-week') {
            void context.go('lesson-overview', { lessonId: `authored-week:${path.targetId}` });
            return;
        }
        void context.go('story', { sectionId: path.targetId });
    }

}

function dailyLearningRoute(
    plan: Awaited<ReturnType<typeof loadClassWeekCastPlan>>,
    playableWeeks: readonly Extract<
        Awaited<ReturnType<typeof loadClassWeekDeliveryCatalog>>['weeks'][number],
        { state: 'grounded-playable' }
    >[],
    episodes: ReturnType<typeof loadStoryRuntime>['episodes'],
    events: Parameters<typeof projectDailyLearningRoute>[0]['events'],
    language: AcademyRouteContext['language'],
    minimumLessonOrder: number,
    schedulerDueReviews: Parameters<typeof projectDailyLearningRoute>[0]['schedulerDueReviews'],
): DailyLearningRoute | undefined {
    const candidates: DailyLearningCandidate[] = playableWeeks.flatMap(delivery => {
        if (delivery.order < minimumLessonOrder) return [];
        const week = plan.weeks.find(candidate => candidate.weekId === delivery.weekId);
        if (!week) return [];
        const packageId = classWeekPackageId(delivery.lessonId);
        const conceptIds = week.source.topicEvidence.map(
            (_, index) => `source:${week.source.sha256}:topic:${index + 1}`,
        );
        return [{
            kind: 'lesson' as const,
            id: delivery.lessonId,
            sequence: delivery.order,
            completionActivityId: `complete:${delivery.lessonId}`,
            completionEncounterIds: [`class-week:${delivery.weekId}`, `class-week:${packageId}`],
            label: week.source.title[language],
            conceptIds: conceptIds.length ? conceptIds : [`class-week:${delivery.weekId}`],
            grounding: { sourceId: `moodle:${week.source.sha256}` },
            modeId: 'normal-challenge' as const,
            skill: 'grammar' as const,
            format: 'mixed' as const,
            incentive: {
                kind: 'journal-memory' as const,
                id: `class-week:${delivery.weekId}`,
            },
        }];
    });
    episodes.forEach(episode => {
        const characterId = episode.cast[0];
        candidates.push({
            kind: 'encounter',
            id: `story:${episode.id}`,
            label: episode.title,
            conceptIds: episode.curriculumHooks.length ? episode.curriculumHooks : [`story:${episode.id}`],
            modeId: 'mixed-range',
            skill: 'reading',
            format: 'reading',
            encounterKind: characterId ? 'bond' : 'world',
            ...(characterId ? { characterId } : {}),
            incentive: characterId
                ? { kind: 'bond-scene', id: `bond:${characterId}:${episode.id}` }
                : { kind: 'place-discovery', id: `story-place:${episode.location.id}` },
        });
    });
    if (!candidates.length && !events.length && !schedulerDueReviews?.length) return undefined;
    try {
        return projectDailyLearningRoute({
            events,
            evidence: [],
            candidates,
            ...(schedulerDueReviews ? { schedulerDueReviews } : {}),
            now: Date.now(),
            dayBoundary: { timeZone: 'Europe/London', dayBoundaryHour: 4 },
        });
    } catch {
        return undefined;
    }
}

function replayCheckpointBand(band: ReplayLanguageBand): JlptBand | undefined {
    return band === 'ngPlus' ? 'n1'
        : band === 'n5' || band === 'n4' || band === 'n3' || band === 'n2' || band === 'n1'
        ? band
        : undefined;
}

function n3ArcMode(
    episodeId: string,
    events: readonly import('../domain/learner-record').LearnerEvent[],
    projection: import('../domain/learner-record').LearnerProjection,
): 'canonical' | 'chronological-replay' {
    const seen = events.some(event => event.kind === 'characters-encountered'
        && (event.encounterId === `story:${episodeId}` || event.encounterId.startsWith(`story:${episodeId}:scene:`)));
    if (seen) return 'chronological-replay';
    if (episodeId === 's3e01-after-the-applause' && projection.curriculumEntry?.band === 'n3') return 'canonical';
    const ordinal = loadStoryRuntime().episode(episodeId)?.ordinal ?? 0;
    const prior = loadStoryRuntime().episodes.find(episode => episode.ordinal === ordinal - 1);
    return prior && events.some(event => event.kind === 'characters-encountered'
        && (event.encounterId === `story:${prior.id}` || event.encounterId.startsWith(`story:${prior.id}:scene:`)))
        ? 'canonical'
        : 'chronological-replay';
}

function storyActivityOutcomes(
    projection: import('../domain/learner-record').LearnerProjection,
    events: readonly import('../domain/learner-record').LearnerEvent[],
): Readonly<Record<string, 'pass' | 'lapse'>> {
    const outcomes: Record<string, 'pass' | 'lapse'> = Object.fromEntries(Object.values(projection.activities)
        .map(activity => [activity.activityId, activity.lastOutcome]));
    events.forEach(event => {
        if (event.kind === 'learning-evidence-recorded' && event.modeId === 'authored-story-n3') {
            outcomes[event.activityId] = event.outcome;
        }
    });
    return outcomes;
}

function toSessionVocabulary(items: readonly { readonly id: string; readonly expression: string; readonly reading?: string; readonly meaning?: string; readonly provenance: Readonly<Record<string, string>> }[]): AcademyStudyVocabulary[] {
    return items.map(item => ({
        id: item.id,
        expression: item.expression,
        ...(item.reading ? { reading: item.reading } : {}),
        ...(item.meaning ? { meaning: item.meaning } : {}),
        ...(sourceContext(item.provenance) ? { source: sourceContext(item.provenance) } : {}),
        audioAvailable: true,
    }));
}

function sourceContext(provenance: Readonly<Record<string, string>>): string | undefined {
    return provenance.sourceId ?? provenance.lesson;
}

function classOrderForBand(band: JlptBand | undefined): number {
    return band === 'n5' ? 19
        : band === 'n4' ? 36
            : band === 'n3' ? 48
                : band === 'n2' || band === 'n1' ? 62
                    : 0;
}

export function currentLibraryPackageId(
    weeks: readonly { readonly weekId: string; readonly order: number }[],
    band: JlptBand,
): string {
    const authored = ACADEMY_LESSON_CONTENT_REGISTRY.filter(registration => registration.kind === 'authored-week');
    const authoredWeekIds = new Set(authored.map(registration => registration.classWeekId));
    const currentOrder = nearestPlayableOrder(weeks, authoredWeekIds, classOrderForBand(band));
    const currentWeek = weeks.find(week => week.order === currentOrder)?.weekId;
    return authored.find(registration => registration.classWeekId === currentWeek)?.packageId ?? 'l1-l01';
}

function storyForkForActivity(activityId: string): 'sound' | 'text' | 'speaking' {
    if (activityId.includes('sound') || activityId.includes('vowel-listen')) return 'sound';
    if (activityId.includes('speaking') || activityId.includes('greet-rie')) return 'speaking';
    return 'text';
}

function nearestPlayableOrder(
    weeks: readonly { readonly weekId: string; readonly order: number }[],
    playableWeekIds: ReadonlySet<string>,
    requestedOrder: number,
): number {
    const playableOrders = weeks
        .filter(week => playableWeekIds.has(week.weekId))
        .map(week => week.order)
        .sort((left, right) => left - right);
    if (playableOrders.length === 0) return requestedOrder;
    return playableOrders.find(candidate => candidate >= requestedOrder) ?? playableOrders.at(-1)!;
}

function nextIncompletePlayableOrder(
    weeks: readonly { readonly weekId: string; readonly order: number }[],
    playableWeekIds: ReadonlySet<string>,
    completedWeekIds: ReadonlySet<string>,
    requestedOrder: number,
): number {
    const next = weeks
        .filter(week => playableWeekIds.has(week.weekId)
            && !completedWeekIds.has(week.weekId)
            && week.order >= requestedOrder)
        .sort((left, right) => left.order - right.order)[0];
    return next?.order ?? nearestPlayableOrder(weeks, playableWeekIds, requestedOrder);
}

function completedClassWeekIds(
    deliveries: readonly { readonly weekId: string; readonly lessonId: string }[],
    completedEncounterIds: readonly string[],
): ReadonlySet<string> {
    const completed = new Set(completedEncounterIds);
    return new Set(deliveries.flatMap(delivery => {
        const packageId = classWeekPackageId(delivery.lessonId);
        return completed.has(`class-week:${delivery.weekId}`) || completed.has(`class-week:${packageId}`)
            ? [delivery.weekId]
            : [];
    }));
}

function classWeekPackageId(lessonId: string): string {
    return lessonId.startsWith('authored-week:')
        ? lessonId.slice('authored-week:'.length)
        : lessonId;
}

function downloadExport(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'yomu-academy-export.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
