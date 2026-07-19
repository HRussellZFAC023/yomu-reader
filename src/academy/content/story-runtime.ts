import seasonOneSource from './story-sources/season-one-fiction.json';
import openingArrivalSource from './story-sources/opening-arrival-bridge.v2.json';
import blankAtlasSource from './story-sources/s1e01-the-blank-atlas.v2.json';
import { N3_STORY_EPISODES, n3StoryArcForEpisode } from './n3-story-batch';
import { n3StoryPractice } from './n3-story-practice';
import { AUTHORED_STORY_CHAPTER_SOURCES } from './story-chapter-sources';
import { getAcademyCastMember } from '../domain/cast-registry';
import { isWorldPlaceId, type WorldPlaceId } from '../domain/world-locations';

export const STORY_REVIEW_CALENDAR_SECTION = 'calendar:lantern-atlas-review';
export const STORY_OPENING_ARC_ID = 'arc:open-doors:first-route';

export interface StoryCastMember {
    readonly id: string;
    readonly name: string;
}

export interface StoryEpisode {
    readonly id: string;
    readonly ordinal: number;
    readonly curriculum: Readonly<{ stage: string; milestone: string }>;
    readonly title: string;
    readonly location: Readonly<{ id: string; label: string }>;
    readonly storyBeat: string;
    readonly emotionalTurn: string;
    readonly comedyBeat?: string;
    readonly curriculumHooks: readonly string[];
    readonly minigame: Readonly<{ id: string; mechanic: string; prompt: string; success: string }>;
    readonly cast: readonly string[];
    readonly unlocks: readonly string[];
    readonly replayVariants: readonly Readonly<{ id: string; label: string; changes: string }>[];
    readonly eventArt: Readonly<{ id: string; brief: string; safety: string }>;
    readonly sourceSafety: Readonly<{ fictionalComposite: true; realEventClaim: false; note: string }>;
}

export interface StoryReviewDayTemplate {
    readonly id: string;
    readonly dayOfCycle: number;
    readonly mode: string;
    readonly episodeSelection: string;
    readonly mechanicRemix: string;
}

export type StoryArcNodeKind = 'activity' | 'checkpoint' | 'choice' | 'command' | 'line' | 'narration' | 'stage';

export interface StoryLineVariant {
    readonly japanese: string;
    readonly reading: string;
    readonly english: string;
}

export interface StoryChoiceOption {
    readonly id: string;
    readonly action: string;
    readonly japaneseByBand: Readonly<Record<string, string>>;
    readonly records: readonly string[];
    readonly next: string;
}

export interface StoryActivityHook {
    readonly lessonId: string;
    readonly componentType: string;
    readonly exerciseId: string;
}

export interface StoryNodeCondition {
    readonly choiceId: string;
    readonly optionId?: string;
    readonly optionIds?: readonly string[];
}

export interface StoryArcNode {
    readonly kind: StoryArcNodeKind;
    readonly id: string;
    readonly beatId?: string;
    readonly speakerId?: string;
    readonly intent?: string;
    readonly attentionTarget?: string;
    readonly cueId?: string;
    readonly description?: string;
    readonly text?: Readonly<{ en: string; ja: string }>;
    readonly resume?: string;
    readonly variants?: Readonly<Record<string, StoryLineVariant>>;
    readonly question?: string;
    readonly options?: readonly StoryChoiceOption[];
    readonly convergence?: string;
    readonly hook?: StoryActivityHook;
    readonly requiredEvidence?: Readonly<{ kind: string; activityId: string }>;
    readonly resumeContext?: string;
    readonly onReady?: string;
    readonly onRepair?: string;
    readonly onDefer?: string;
    readonly when?: StoryNodeCondition;
    readonly support?: Readonly<{
        readonly reading?: string;
        readonly englishMeaning?: string;
        readonly replay?: boolean;
    }>;
    readonly command?: Readonly<Record<string, unknown> & { readonly type: string }>;
}

export interface StoryArcScene {
    readonly id: string;
    readonly packageId: string;
    readonly packageTitle: string;
    readonly locationId: string;
    readonly timeState: string;
    readonly goal: string;
    readonly dramaticQuestion: string;
    readonly learnerNeed: string;
    readonly curriculum?: Readonly<{ sectionId: string; order: number; missionId?: string }>;
    readonly nodes: readonly StoryArcNode[];
    readonly exit: Readonly<{ checkpoint: true; next: string | null }>;
}

export interface StoryArcPackage {
    readonly id: string;
    readonly canonicality: 'bridge' | 'canon';
    readonly revision: string;
    readonly title: Readonly<{ en: string; ja: string }>;
    readonly synopsis: string;
    readonly sceneIds: readonly string[];
    readonly replay: Readonly<{
        chronologicalMemory: true;
        canonicalWrites: false;
        allowedLayers: readonly string[];
    }>;
}

export interface StoryActivityBinding extends StoryActivityHook {
    /** False when the story beat is authored before its lesson activity exists. */
    readonly registered: boolean;
    readonly nodeId: string;
    readonly sceneId: string;
    readonly requiredEvidence: Readonly<{ kind: 'activity-passed'; activityId: string }>;
    readonly when?: StoryNodeCondition;
}

export interface StoryOpeningArc {
    readonly id: typeof STORY_OPENING_ARC_ID;
    readonly episodeId: 's1e01-the-blank-atlas';
    readonly title: string;
    readonly packages: readonly StoryArcPackage[];
    readonly scenes: readonly StoryArcScene[];
    readonly firstSceneId: string;
    readonly lastSceneId: string;
    readonly curriculum: Readonly<{
        lessonId: 'lesson:foundation-00';
        contentVersion: string;
        contentSha256: string;
        sectionSequence: readonly string[];
        activities: readonly StoryActivityBinding[];
    }>;
    readonly continuity: readonly Readonly<{
        castId: string;
        beat: 'recognition';
        legacyRelationshipChapter: number;
    }>[];
    readonly unlocks: readonly string[];
    readonly nameOnlyCast: readonly string[];
    readonly replay: Readonly<{ canonicalWrites: false; chronologicalMemory: true }>;
    scene(sceneId: string | undefined): StoryArcScene | undefined;
    nextScene(sceneId: string, choices?: Readonly<Record<string, string>>): StoryArcScene | undefined;
}

/** An authored package outcome (bond/story/curriculum-return...); read-only story truth, never a lesson write. */
export interface StoryPackageOutcome {
    readonly kind: string;
    readonly id?: string;
    readonly castId?: string;
    readonly chapter?: number;
    readonly beat?: string;
    readonly lessonId?: string;
    readonly description?: string;
}

/** The runner-facing subset shared by the opening and later authored chapters. */
export interface StoryPlayableArc {
    readonly id: string;
    readonly episodeId: string;
    readonly title: string;
    readonly scenes: readonly StoryArcScene[];
    readonly firstSceneId: string;
    readonly lastSceneId: string;
    readonly curriculum: Readonly<{
        readonly activities: readonly StoryActivityBinding[];
        readonly contentSha256?: string;
    }>;
    readonly outcomes?: readonly StoryPackageOutcome[];
    readonly replay: Readonly<{ canonicalWrites: false; chronologicalMemory: true }>;
    scene(sceneId: string | undefined): StoryArcScene | undefined;
    nextScene(sceneId: string, choices?: Readonly<Record<string, string>>): StoryArcScene | undefined;
}

/** One row of the compiled chapter catalog consumed by the Path/Story UI. */
export interface StoryChapterCatalogEntry {
    readonly id: string;
    readonly season: number;
    readonly chapter?: number;
    readonly title: string;
    /**
     * True only when every activity hook resolves to a registered exercise.
     * 'authored' chapters (content loads; activities pending) stay false so the
     * UI can gate honestly instead of promising ungrounded practice.
     */
    readonly grounded: boolean;
    /** The chapter compiled and playableArc(id) returns an arc for it. */
    readonly playable: boolean;
}

export type StoryOpeningArcMode = 'canonical' | 'chronological-replay';

/** Legacy stateless scene cursor retained for direct memory previews. */
export interface StoryArcSession {
    readonly frame: Readonly<{
        scene: StoryArcScene;
        node: StoryArcNode | undefined;
        nodeIndex: number;
        choices: Readonly<Record<string, string>>;
        complete: boolean;
    }>;
    choose(choiceId: string, optionId: string): StoryArcSession['frame'];
    advance(): StoryArcSession['frame'];
    openScene(sceneId: string): StoryArcSession['frame'];
}

export interface StoryEntryEvidence {
    readonly curriculumEntry: Readonly<{ route: string; band?: string }> | null;
    readonly completedEncounterIds: readonly string[];
}

export interface StoryRuntime {
    readonly id: string;
    readonly title: string;
    readonly disclaimer: Readonly<{
        heading: string;
        message: string;
        sourceBoundary: string;
        likenessBoundary: string;
    }>;
    readonly scope: Readonly<{
        canonicalEpisodeCount: number;
        sequenceStart: string;
        sequenceEnd: string;
        finiteStoryRule: string;
    }>;
    readonly episodes: readonly StoryEpisode[];
    readonly openingArc: StoryOpeningArc;
    readonly playableArc: (episodeId: string | undefined) => StoryPlayableArc | undefined;
    readonly chapterCatalog: readonly StoryChapterCatalogEntry[];
    readonly reviewCalendar: Readonly<{
        id: string;
        startsAfterEpisodeId: string;
        canonicalStoryProgression: false;
        purpose: string;
        cycle: Readonly<{ lengthDays: number; repeat: string; weekAccents: readonly string[] }>;
        dayTemplates: readonly StoryReviewDayTemplate[];
        dayTemplateRule: string;
        continuityRules: readonly string[];
    }>;
    episode(sectionId: string | undefined): StoryEpisode | undefined;
    castMembers(ids: readonly string[]): readonly StoryCastMember[];
}

interface SeasonOneSource {
    readonly schema: string;
    readonly title: string;
    readonly welcomeDisclaimer: StoryRuntime['disclaimer'];
    readonly scope: StoryRuntime['scope'];
    readonly episodes: readonly StoryEpisode[];
    readonly endlessCalendar: StoryRuntime['reviewCalendar'];
}

export interface StoryPackageSource {
    readonly schema: string;
    readonly id: string;
    readonly revision: string;
    readonly canonicality: 'bridge' | 'canon';
    readonly season: number;
    readonly chapter?: number;
    readonly title: { readonly en: string; readonly ja: string };
    readonly synopsis: string;
    readonly sourceSafety: {
        readonly originalYomu: boolean;
        readonly externalDialogueUsed: boolean;
        readonly fictionalComposite: boolean;
        readonly realEventClaim: boolean;
    };
    readonly cast: readonly {
        readonly castId: string;
        readonly portrayal: string;
        readonly portraitAsset?: unknown;
    }[];
    readonly entry: { readonly story: { readonly after?: string } };
    readonly scenes: readonly (Omit<StoryArcScene, 'packageId' | 'packageTitle' | 'nodes'> & {
        readonly checkpointOnEnter: boolean;
        readonly nodes: readonly StoryArcNode[];
    })[];
    readonly callbacks?: readonly {
        readonly id: string;
        readonly state: string;
        readonly priorUse?: unknown;
        readonly meaningNow?: unknown;
    }[];
    readonly outcomes: readonly StoryPackageOutcome[];
    readonly replay: StoryArcPackage['replay'];
    readonly curriculumBinding?: {
        readonly lessonId: string;
        readonly contentVersion: string;
        readonly contentSha256: string;
        readonly sectionSequence: readonly string[];
        readonly sourceSequence: readonly { readonly activityIds?: readonly string[] }[];
        readonly missions: readonly {
            readonly choiceOptionId: string;
            readonly sceneId: string;
            readonly openingActivityId: string;
            readonly transferActivityId: string;
        }[];
    };
}

let cachedRuntime: StoryRuntime | undefined;

export function loadStoryRuntime(): StoryRuntime {
    if (cachedRuntime) return cachedRuntime;
    const source = seasonOneSource as SeasonOneSource;
    validateSeasonOne(source);
    const authoredIds = new Set(AUTHORED_STORY_CHAPTER_SOURCES.map(chapter => chapter.id));
    const episodeById = new Map(source.episodes.map(episode => [episode.id, Object.freeze(episode)]));
    N3_STORY_EPISODES.forEach(episode => {
        if (!authoredIds.has(episode.id)) episodeById.set(episode.id, Object.freeze(episode));
    });
    AUTHORED_STORY_CHAPTER_SOURCES.forEach(chapter => {
        if (!episodeById.has(chapter.id)) episodeById.set(chapter.id, episodeFromStoryPackage(chapter));
    });
    const episodes = Object.freeze([...episodeById.values()]
        .sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id)));
    const byId = new Map(episodes.map(episode => [episode.id, episode]));
    const openingArc = compileOpeningArc(episodes[0]);
    const authoredArcs = compileAuthoredChapters(openingArc.episodeId);
    const chapterCatalog = buildChapterCatalog(openingArc, byId, authoredArcs);
    cachedRuntime = Object.freeze({
        id: source.schema,
        title: source.title,
        disclaimer: Object.freeze(source.welcomeDisclaimer),
        scope: Object.freeze({
            ...source.scope,
            canonicalEpisodeCount: 48,
            sequenceEnd: 'N1 graduation',
            finiteStoryRule: 'The Lantern Atlas has 48 canonical chapters and resolves once at graduation. Later play is read-only practice memory or separately authored alumni material.',
        }),
        episodes,
        openingArc,
        // Resolution order: opening compile, then authored v2 chapters, then the
        // programmatic N3 batch (a v2 file supersedes the batch for the same id).
        playableArc: (episodeId: string | undefined) => episodeId === openingArc.episodeId
            ? openingArc
            : (episodeId ? authoredArcs.get(episodeId) : undefined) ?? n3StoryArcForEpisode(episodeId),
        chapterCatalog,
        reviewCalendar: Object.freeze({
            ...source.endlessCalendar,
            startsAfterEpisodeId: 's4e12-next-page',
        }),
        episode: (sectionId: string | undefined) => sectionId ? byId.get(sectionId) : undefined,
        castMembers: resolveCastMembers,
    });
    return cachedRuntime;
}

function episodeFromStoryPackage(source: StoryPackageSource): StoryEpisode {
    const ordinal = source.chapter;
    if (!ordinal) throw new TypeError(`Story package ${source.id} needs a chapter number for catalog play.`);
    const scene = source.scenes[0];
    if (!scene) throw new TypeError(`Story package ${source.id} has no opening scene.`);
    const activity = source.scenes.flatMap(item => item.nodes)
        .find(node => node.kind === 'activity' && node.hook)?.hook;
    const locationId = resolveStoryLocationId(scene.locationId);
    return Object.freeze({
        id: source.id,
        ordinal,
        curriculum: Object.freeze({
            stage: source.season === 3 ? 'n3-to-n2' : 'n2-to-n1',
            milestone: activity?.componentType ?? 'story transfer',
        }),
        title: source.title.en,
        location: Object.freeze({ id: locationId, label: locationId.replaceAll('-', ' ') }),
        storyBeat: scene.goal,
        emotionalTurn: scene.dramaticQuestion,
        curriculumHooks: Object.freeze(source.scenes.flatMap(item => item.nodes)
            .filter(node => node.kind === 'activity' && node.hook)
            .map(node => node.hook!.exerciseId)),
        minigame: Object.freeze({
            id: activity?.exerciseId ?? `story:${source.id}`,
            mechanic: activity?.componentType ?? 'story transfer',
            prompt: scene.learnerNeed,
            success: 'Return to the story with evidence.',
        }),
        cast: Object.freeze(source.cast.map(member => member.castId)),
        unlocks: Object.freeze(source.outcomes.flatMap(outcome => outcome.id ? [outcome.id] : [])),
        replayVariants: Object.freeze([
            Object.freeze({ id: `replay:${source.id}`, label: 'Language-band replay', changes: 'Dialogue band and learner support only.' }),
        ]),
        eventArt: Object.freeze({
            id: `event-art:${source.id}`,
            brief: `${source.title.en} at ${locationId}`,
            safety: 'Use only approved Academy assets and registered cast portrayals.',
        }),
        sourceSafety: Object.freeze({
            fictionalComposite: true as const,
            realEventClaim: false as const,
            note: 'Compiled from the canonical Yomu Academy story package.',
        }),
    });
}

/**
 * Placement changes the live entry point, never the history of the earlier
 * plot. Only foundation and N5 entries may make a first Chapter 1 pass
 * canonical; every other visit is an explicitly read-only memory.
 */
export function openingArcModeForEntry(evidence: StoryEntryEvidence): StoryOpeningArcMode {
    if (evidence.completedEncounterIds.some(encounterId =>
        encounterId === 'story:s1e01-the-blank-atlas'
        || encounterId.startsWith('story:s1e01-the-blank-atlas:scene:'))) {
        return 'chronological-replay';
    }
    const entry = evidence.curriculumEntry;
    return entry?.route === 'lesson-zero' || entry?.band === 'n5'
        ? 'canonical'
        : 'chronological-replay';
}

export function createStoryArcSession(arc: StoryOpeningArc): StoryArcSession {
    let scene = arc.scene(arc.firstSceneId)!;
    let nodeIndex = 0;
    const choices: Record<string, string> = {};
    const frame = (): StoryArcSession['frame'] => Object.freeze({
        scene,
        node: scene.nodes[nodeIndex],
        nodeIndex,
        choices: Object.freeze({ ...choices }),
        complete: nodeIndex >= scene.nodes.length,
    });
    return {
        get frame() { return frame(); },
        choose(choiceId, optionId) {
            if (scene.nodes[nodeIndex]?.id === choiceId) choices[choiceId] = optionId;
            nodeIndex += 1;
            return frame();
        },
        advance() { nodeIndex += 1; return frame(); },
        openScene(sceneId) {
            const next = arc.scene(sceneId);
            if (next) { scene = next; nodeIndex = 0; }
            return frame();
        },
    };
}


function compileOpeningArc(legacyEpisode: StoryEpisode | undefined): StoryOpeningArc {
    if (!legacyEpisode || legacyEpisode.id !== 's1e01-the-blank-atlas') {
        throw new TypeError('The opening arc must retain the canonical Chapter 1 episode ID.');
    }
    const sources = [
        openingArrivalSource as unknown as StoryPackageSource,
        blankAtlasSource as unknown as StoryPackageSource,
    ] as const;
    validateOpeningPackages(sources, legacyEpisode);

    const packages = Object.freeze(sources.map(source => Object.freeze({
        id: source.id,
        canonicality: source.canonicality,
        revision: source.revision,
        title: Object.freeze({ ...source.title }),
        synopsis: source.synopsis,
        sceneIds: Object.freeze(source.scenes.map(scene => scene.id)),
        replay: Object.freeze({
            chronologicalMemory: source.replay.chronologicalMemory,
            canonicalWrites: source.replay.canonicalWrites,
            allowedLayers: Object.freeze([...source.replay.allowedLayers]),
        }),
    })));
    const scenes = Object.freeze(sources.flatMap(source => source.scenes.map(scene => freezeScene(source, scene))));
    const sceneById = new Map(scenes.map(scene => [scene.id, scene]));
    const addressToScene = new Map<string, StoryArcScene>();
    scenes.forEach(scene => {
        addressToScene.set(scene.id, scene);
        scene.nodes.forEach(node => {
            addressToScene.set(node.id, scene);
            node.options?.forEach(option => addressToScene.set(option.id, scene));
        });
    });
    const chapter = sources[1];
    const binding = chapter.curriculumBinding!;
    const activities = Object.freeze(scenes.flatMap(scene => scene.nodes
        .filter((node): node is StoryArcNode & Required<Pick<StoryArcNode, 'hook' | 'requiredEvidence'>> =>
            node.kind === 'activity' && Boolean(node.hook && node.requiredEvidence))
        .map(node => Object.freeze({
            ...node.hook,
            registered: true,
            nodeId: node.id,
            sceneId: scene.id,
            requiredEvidence: Object.freeze({
                kind: 'activity-passed' as const,
                activityId: node.requiredEvidence.activityId,
            }),
            ...(node.when ? { when: node.when } : {}),
        }))));
    const continuity = Object.freeze(chapter.outcomes
        .filter(outcome => outcome.kind === 'bond' && outcome.castId && outcome.chapter)
        .map(outcome => Object.freeze({
            castId: outcome.castId!,
            beat: 'recognition' as const,
            legacyRelationshipChapter: outcome.chapter!,
        })));
    const firstSceneId = scenes[0].id;
    const lastSceneId = scenes.at(-1)!.id;

    return Object.freeze({
        id: STORY_OPENING_ARC_ID,
        episodeId: 's1e01-the-blank-atlas',
        title: 'Open Doors: The First Route',
        packages,
        scenes,
        firstSceneId,
        lastSceneId,
        curriculum: Object.freeze({
            lessonId: 'lesson:foundation-00' as const,
            contentVersion: binding.contentVersion,
            contentSha256: binding.contentSha256,
            sectionSequence: Object.freeze([...binding.sectionSequence]),
            activities,
        }),
        continuity,
        unlocks: Object.freeze([...legacyEpisode.unlocks]),
        nameOnlyCast: Object.freeze([...new Set(sources.flatMap(source => source.cast
            .filter(use => use.portrayal === 'name-only')
            .map(use => use.castId)))]),
        replay: Object.freeze({ canonicalWrites: false as const, chronologicalMemory: true as const }),
        scene: (sceneId: string | undefined) => sceneId ? sceneById.get(sceneId) : undefined,
        nextScene: (sceneId: string, choices: Readonly<Record<string, string>> = {}) => {
            const scene = sceneById.get(sceneId);
            if (!scene) return undefined;
            const sourceIndex = sources.findIndex(source => source.id === scene.packageId);
            const source = sources[sourceIndex];
            const sourceSceneIndex = source.scenes.findIndex(candidate => candidate.id === scene.id);
            const target = scene.exit.next;
            if (target) {
                const direct = sceneById.get(target);
                if (direct) return direct;
                const choice = scene.nodes.find(node => node.kind === 'choice' && node.id === target);
                const selected = choice?.options?.find(option => option.id === choices[choice.id]);
                if (selected) return addressToScene.get(selected.next);
                return undefined;
            }
            if (sourceSceneIndex === source.scenes.length - 1 && sourceIndex < sources.length - 1) {
                return sceneById.get(sources[sourceIndex + 1].scenes[0].id);
            }
            return undefined;
        },
    });
}

function freezeScene(
    source: StoryPackageSource,
    scene: StoryPackageSource['scenes'][number],
): StoryArcScene {
    return Object.freeze({
        id: scene.id,
        packageId: source.id,
        packageTitle: source.title.en,
        locationId: scene.locationId,
        timeState: scene.timeState,
        goal: scene.goal,
        dramaticQuestion: scene.dramaticQuestion,
        learnerNeed: scene.learnerNeed,
        ...(scene.curriculum ? { curriculum: Object.freeze({ ...scene.curriculum }) } : {}),
        nodes: Object.freeze(scene.nodes.map(freezeNode)),
        exit: Object.freeze({ checkpoint: true as const, next: scene.exit.next }),
    });
}

function freezeNode(node: StoryArcNode): StoryArcNode {
    return Object.freeze({
        ...node,
        ...(node.variants ? {
            variants: Object.freeze(Object.fromEntries(Object.entries(node.variants)
                .map(([band, variant]) => [band, Object.freeze({ ...variant })]))),
        } : {}),
        ...(node.options ? {
            options: Object.freeze(node.options.map(option => Object.freeze({
                ...option,
                japaneseByBand: Object.freeze({ ...option.japaneseByBand }),
                records: Object.freeze([...option.records]),
            }))),
        } : {}),
        ...(node.hook ? { hook: Object.freeze({ ...node.hook }) } : {}),
        ...(node.requiredEvidence ? { requiredEvidence: Object.freeze({ ...node.requiredEvidence }) } : {}),
        ...(node.when ? { when: Object.freeze({ ...node.when, optionIds: node.when.optionIds
            ? Object.freeze([...node.when.optionIds])
            : undefined }) } : {}),
    });
}

function validateOpeningPackages(
    sources: readonly [StoryPackageSource, StoryPackageSource],
    legacyEpisode: StoryEpisode,
): void {
    const [arrival, chapter] = sources;
    if (arrival.schema !== 'yomu-academy.story-package.v2'
        || chapter.schema !== 'yomu-academy.story-package.v2'
        || arrival.id !== 'bridge:opening-arrival'
        || arrival.canonicality !== 'bridge'
        || arrival.season !== 1
        || arrival.chapter !== undefined
        || chapter.id !== legacyEpisode.id
        || chapter.canonicality !== 'canon'
        || chapter.season !== 1
        || chapter.chapter !== 1
        || chapter.entry.story.after !== arrival.id) {
        throw new TypeError('The opening story packages do not form the canonical first arc.');
    }
    sources.forEach(validateStoryPackageSource);
    const binding = chapter.curriculumBinding;
    if (!binding || binding.lessonId !== 'lesson:foundation-00') {
        throw new TypeError('Chapter 1 must bind the registered Lesson 0 package.');
    }
    const activityNodes = chapter.scenes.flatMap(scene => scene.nodes.filter(node => node.kind === 'activity'));
    const activityIds = activityNodes.map(node => node.hook?.exerciseId);
    if (activityIds.some(id => !id) || new Set(activityIds).size !== activityIds.length) {
        throw new TypeError('Chapter 1 activity hooks must be complete and unique.');
    }
    activityNodes.forEach(node => {
        if (node.hook?.lessonId !== binding.lessonId
            || node.requiredEvidence?.kind !== 'activity-passed'
            || node.requiredEvidence.activityId !== node.hook.exerciseId) {
            throw new TypeError(`Activity node ${node.id} does not preserve Lesson 0 evidence truth.`);
        }
    });
    const sectionSequence = [...new Map(chapter.scenes
        .filter(scene => scene.curriculum)
        .sort((left, right) => left.curriculum!.order - right.curriculum!.order)
        .map(scene => [scene.curriculum!.sectionId, scene.curriculum!.order])).keys()];
    if (JSON.stringify(sectionSequence) !== JSON.stringify(binding.sectionSequence)) {
        throw new TypeError('Chapter 1 scene order does not match the registered Lesson 0 sections.');
    }
    const activitySet = new Set(activityIds);
    binding.sourceSequence.flatMap(anchor => anchor.activityIds ?? []).forEach(id => {
        if (!activitySet.has(id)) throw new TypeError(`Pinned source activity ${id} is missing from Chapter 1.`);
    });
    binding.missions.forEach(mission => {
        const scene = chapter.scenes.find(candidate => candidate.id === mission.sceneId);
        const choices = chapter.scenes.flatMap(candidate => candidate.nodes)
            .flatMap(node => node.options ?? []);
        if (!scene
            || !choices.some(option => option.id === mission.choiceOptionId && option.next === mission.sceneId)
            || !activitySet.has(mission.openingActivityId)
            || !activitySet.has(mission.transferActivityId)) {
            throw new TypeError(`Lesson 0 mission ${mission.sceneId} is not wired into the opening arc.`);
        }
    });
    const continuityCast = chapter.outcomes
        .filter(outcome => outcome.kind === 'bond')
        .map(outcome => outcome.castId);
    if (!legacyEpisode.unlocks.includes('rie') || !continuityCast.includes('rie')) {
        throw new TypeError('Chapter 1 must preserve Rie\'s unlock and recognition continuity.');
    }
}

function validatePackageGraph(source: StoryPackageSource): void {
    const nodes = source.scenes.flatMap(scene => scene.nodes);
    const addresses = new Set([
        ...source.scenes.map(scene => scene.id),
        ...nodes.map(node => node.id),
        ...nodes.flatMap(node => node.options?.map(option => option.id) ?? []),
    ]);
    if (addresses.size !== source.scenes.length + nodes.length
        + nodes.reduce((count, node) => count + (node.options?.length ?? 0), 0)) {
        throw new TypeError(`Story package ${source.id} contains duplicate graph addresses.`);
    }
    const requireAddress = (address: string | null | undefined, label: string): void => {
        if (address && !addresses.has(address)) throw new TypeError(`${label} points outside ${source.id}: ${address}`);
    };
    source.scenes.forEach(scene => {
        if (!scene.checkpointOnEnter || !scene.exit.checkpoint) {
            throw new TypeError(`Scene ${scene.id} is not safely resumable.`);
        }
        requireAddress(scene.exit.next, `${scene.id} exit`);
    });
    nodes.forEach(node => {
        requireAddress(node.convergence, `${node.id} convergence`);
        node.options?.forEach(option => requireAddress(option.next, option.id));
        requireAddress(node.onReady, `${node.id} ready`);
        requireAddress(node.onRepair, `${node.id} repair`);
        requireAddress(node.onDefer, `${node.id} defer`);
    });
}

const STORY_VARIANT_BANDS = ['foundation', 'n5', 'n4', 'n3', 'n2', 'n1', 'ngPlus'] as const;

/**
 * The one alias map between the authored "location:" namespace and the bare
 * executable world registry (SCRIPT-ARCHITECTURE.md). Unknown aliases are a
 * validation error; authors never add a second free-string location namespace.
 */
const STORY_LOCATION_ALIASES: Readonly<Record<string, WorldPlaceId>> = Object.freeze({
    'language-lab': 'lab',
    'campus-entrance': 'courtyard',
    'classroom-entrance': 'classroom',
});

export function resolveStoryLocationId(locationId: string): WorldPlaceId {
    const bare = locationId.startsWith('location:') ? locationId.slice('location:'.length) : locationId;
    const resolved = STORY_LOCATION_ALIASES[bare] ?? bare;
    if (!isWorldPlaceId(resolved)) {
        throw new TypeError(`Unknown story location alias: ${locationId}`);
    }
    return resolved;
}

/** Authored hooks bind the curriculum package under either `lessonId` or `packageId`. */
interface StorySourceActivityHook {
    readonly lessonId?: string;
    readonly packageId?: string;
    readonly componentType: string;
    readonly exerciseId: string;
}

function storyHookLessonId(source: StoryPackageSource, node: StoryArcNode): string {
    const hook = node.hook as unknown as StorySourceActivityHook | undefined;
    const lessonId = hook?.lessonId ?? hook?.packageId;
    if (!hook?.exerciseId) {
        throw new TypeError(`Activity ${node.id} in ${source.id} has an incomplete hook.`);
    }
    return lessonId ?? `lesson:pending:${source.id}`;
}

/** Package-local gates shared by the opening compile and every generic chapter. */
function validateStoryPackageSource(source: StoryPackageSource): void {
    if (source.schema !== 'yomu-academy.story-package.v2') {
        throw new TypeError(`Story package ${source.id} uses an unsupported schema: ${source.schema}`);
    }
    if (!source.sourceSafety.originalYomu
        || source.sourceSafety.externalDialogueUsed
        || !source.sourceSafety.fictionalComposite
        || source.sourceSafety.realEventClaim
        || !source.replay.chronologicalMemory
        || source.replay.canonicalWrites !== false) {
        throw new TypeError(`Story package ${source.id} crosses its fiction or replay boundary.`);
    }
    if (source.scenes.length === 0) {
        throw new TypeError(`Story package ${source.id} has no scenes.`);
    }
    validatePackageGraph(source);
    source.scenes.forEach(scene => resolveStoryLocationId(scene.locationId));
    source.cast.forEach(use => {
        const member = getAcademyCastMember(use.castId);
        if (!member.eligibility.story) throw new TypeError(`Cast member ${use.castId} is not story eligible.`);
        if (use.portrayal === 'name-only' && use.portraitAsset !== undefined) {
            throw new TypeError(`Name-only cast member ${use.castId} cannot carry a portrait.`);
        }
        if (use.portrayal === 'likeness-cleared' && !member.eligibility.likenessRuntime) {
            throw new TypeError(`Cast member ${use.castId} is not likeness eligible.`);
        }
    });
    const declaredCast = new Set(source.cast.map(use => use.castId));
    source.scenes.flatMap(scene => scene.nodes).forEach(node => {
        if (node.speakerId && node.speakerId !== 'learner' && !declaredCast.has(node.speakerId)) {
            throw new TypeError(`Speaker ${node.speakerId} is not declared in ${source.id}'s cast.`);
        }
        if (node.kind === 'line') {
            const bands = Object.keys(node.variants ?? {})
                .filter(band => (STORY_VARIANT_BANDS as readonly string[]).includes(band));
            if (bands.length === 0) {
                throw new TypeError(`Line ${node.id} in ${source.id} has no authored band variant.`);
            }
        }
        if (node.kind === 'activity') {
            storyHookLessonId(source, node);
            if (node.requiredEvidence?.kind !== 'activity-passed'
                || node.requiredEvidence.activityId !== node.hook?.exerciseId) {
                throw new TypeError(`Activity ${node.id} in ${source.id} does not preserve evidence truth.`);
            }
        }
    });
    (source.callbacks ?? []).forEach(callback => {
        if (!['seed', 'echo', 'transform', 'payoff'].includes(callback.state)) {
            throw new TypeError(`Callback ${callback.id} in ${source.id} has invalid state ${callback.state}.`);
        }
        if (callback.state !== 'seed' && !callback.priorUse) {
            throw new TypeError(`Callback ${callback.id} in ${source.id} requires priorUse for ${callback.state}.`);
        }
        if (!callback.meaningNow) {
            throw new TypeError(`Callback ${callback.id} in ${source.id} is missing meaningNow.`);
        }
    });
}

/** Compiles one authored story-package.v2 chapter into a runner-ready arc. */
export function compileStoryPackage(source: StoryPackageSource): StoryPlayableArc {
    validateStoryPackageSource(source);
    const scenes = Object.freeze(source.scenes.map(scene => freezeScene(source, scene)));
    const sceneById = new Map(scenes.map(scene => [scene.id, scene]));
    const addressToScene = new Map<string, StoryArcScene>();
    scenes.forEach(scene => {
        addressToScene.set(scene.id, scene);
        scene.nodes.forEach(node => {
            addressToScene.set(node.id, scene);
            node.options?.forEach(option => addressToScene.set(option.id, scene));
        });
    });
    const activities = Object.freeze(scenes.flatMap(scene => scene.nodes
        .filter((node): node is StoryArcNode & Required<Pick<StoryArcNode, 'hook' | 'requiredEvidence'>> =>
            node.kind === 'activity' && Boolean(node.hook && node.requiredEvidence))
        .map(node => Object.freeze({
            lessonId: storyHookLessonId(source, node),
            componentType: node.hook.componentType,
            exerciseId: node.hook.exerciseId,
            registered: storyExerciseRegistered(node.hook.exerciseId),
            nodeId: node.id,
            sceneId: scene.id,
            requiredEvidence: Object.freeze({
                kind: 'activity-passed' as const,
                activityId: node.requiredEvidence.activityId,
            }),
            ...(node.when ? { when: node.when } : {}),
        }))));
    return Object.freeze({
        id: `arc:${source.id}`,
        episodeId: source.id,
        title: source.title.en,
        scenes,
        firstSceneId: scenes[0]!.id,
        lastSceneId: scenes.at(-1)!.id,
        curriculum: Object.freeze({ activities }),
        outcomes: Object.freeze(source.outcomes.map(outcome => Object.freeze({ ...outcome }))),
        replay: Object.freeze({ canonicalWrites: false as const, chronologicalMemory: true as const }),
        scene: (sceneId: string | undefined) => sceneId ? sceneById.get(sceneId) : undefined,
        nextScene: (sceneId: string, choices: Readonly<Record<string, string>> = {}) => {
            const scene = sceneById.get(sceneId);
            const target = scene?.exit.next;
            if (!scene || !target) return undefined;
            const direct = sceneById.get(target);
            if (direct) return direct;
            const choice = scene.nodes.find(node => node.kind === 'choice' && node.id === target);
            if (choice) {
                const selected = choice.options?.find(option => option.id === choices[choice.id]);
                return selected ? addressToScene.get(selected.next) : undefined;
            }
            return addressToScene.get(target);
        },
    });
}

function storyExerciseRegistered(exerciseId: string): boolean {
    // The N3 practice map is the only registered in-bundle story exercise source
    // today; opening-arc activities are grounded separately against Lesson 0.
    return Boolean(n3StoryPractice(exerciseId));
}

function arcIsGrounded(arc: StoryPlayableArc): boolean {
    return arc.curriculum.activities.every(activity => activity.registered);
}

function compileAuthoredChapters(openingEpisodeId: string): ReadonlyMap<string, StoryPlayableArc> {
    const arcs = new Map<string, StoryPlayableArc>();
    for (const source of AUTHORED_STORY_CHAPTER_SOURCES) {
        if (source.id === openingEpisodeId) {
            throw new TypeError('Chapter 1 compiles through the opening arc, not the generic chapter registry.');
        }
        if (arcs.has(source.id)) throw new TypeError(`Duplicate authored story chapter: ${source.id}`);
        arcs.set(source.id, compileStoryPackage(source));
    }
    return arcs;
}

function buildChapterCatalog(
    openingArc: StoryOpeningArc,
    episodesById: ReadonlyMap<string, StoryEpisode>,
    authoredArcs: ReadonlyMap<string, StoryPlayableArc>,
): readonly StoryChapterCatalogEntry[] {
    const authoredEntries = AUTHORED_STORY_CHAPTER_SOURCES.map(source => Object.freeze({
        id: source.id,
        season: source.season,
        ...(source.chapter !== undefined ? { chapter: source.chapter } : {}),
        title: source.title.en,
        grounded: arcIsGrounded(authoredArcs.get(source.id)!),
        playable: true,
    }));
    const batchEntries = N3_STORY_EPISODES
        .filter(episode => !authoredArcs.has(episode.id))
        .map(episode => Object.freeze({
            id: episode.id,
            season: Number(/^s(\d+)e/.exec(episode.id)?.[1] ?? 3),
            chapter: episode.ordinal,
            title: episode.title,
            grounded: arcIsGrounded(n3StoryArcForEpisode(episode.id)!),
            playable: true,
        }));
    return Object.freeze([
        Object.freeze({
            id: openingArc.episodeId,
            season: 1,
            chapter: 1,
            title: episodesById.get(openingArc.episodeId)?.title ?? openingArc.title,
            // The opening compile pins every hook to the registered Lesson 0 package.
            grounded: true,
            playable: true,
        }),
        ...authoredEntries,
        ...batchEntries,
    ]);
}

/** Every compiled chapter, in play order, for the Path/Story UI. */
export function storyChapterCatalog(): readonly StoryChapterCatalogEntry[] {
    return loadStoryRuntime().chapterCatalog;
}

function resolveCastMembers(ids: readonly string[]): readonly StoryCastMember[] {
    return Object.freeze(ids.map((id: string) => {
        const member = getAcademyCastMember(id);
        if (!member.eligibility.story) throw new TypeError(`Cast member ${id} is not story eligible.`);
        return Object.freeze({ id, name: member.firstName });
    }));
}

function validateSeasonOne(source: SeasonOneSource): void {
    if (source.schema !== 'yomu-academy.season-one-fiction.v1') {
        throw new TypeError('Unsupported Season One story schema.');
    }
    if (source.scope.canonicalEpisodeCount !== 24 || source.episodes.length !== 24) {
        throw new TypeError('Season One must contain its 24 canonical episodes.');
    }
    source.episodes.forEach((episode, index) => {
        if (episode.ordinal !== index + 1) throw new TypeError('Season One episode order is invalid.');
        if (!episode.sourceSafety.fictionalComposite || episode.sourceSafety.realEventClaim) {
            throw new TypeError(`Episode ${episode.id} crosses the fiction boundary.`);
        }
        episode.cast.forEach(id => getAcademyCastMember(id));
        episode.unlocks.forEach(id => getAcademyCastMember(id));
    });
    const finale = source.episodes.at(-1);
    if (!finale || source.endlessCalendar.startsAfterEpisodeId !== finale.id) {
        throw new TypeError('The review calendar must begin after the canonical finale.');
    }
    if (source.endlessCalendar.id !== STORY_REVIEW_CALENDAR_SECTION
        || source.endlessCalendar.canonicalStoryProgression !== false
        || source.endlessCalendar.cycle.repeat !== 'unbounded'
        || source.endlessCalendar.dayTemplates.length !== 7) {
        throw new TypeError('The unbounded seven-template review contract is invalid.');
    }
}
