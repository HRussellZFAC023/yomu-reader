import seasonOneSource from './story-sources/season-one-fiction.json';
import openingArrivalSource from './story-sources/opening-arrival-bridge.v2.json';
import blankAtlasSource from './story-sources/s1e01-the-blank-atlas.v2.json';
import { N3_STORY_EPISODES, n3StoryArcForEpisode } from './n3-story-batch';
import { getAcademyCastMember } from '../domain/cast-registry';

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
    readonly replay: Readonly<{ canonicalWrites: false; chronologicalMemory: true }>;
    scene(sceneId: string | undefined): StoryArcScene | undefined;
    nextScene(sceneId: string, choices?: Readonly<Record<string, string>>): StoryArcScene | undefined;
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

interface StoryPackageSource {
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
    readonly outcomes: readonly {
        readonly kind: string;
        readonly castId?: string;
        readonly chapter?: number;
    }[];
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
    const episodes = Object.freeze([...source.episodes, ...N3_STORY_EPISODES].map(episode => Object.freeze(episode)));
    const byId = new Map(episodes.map(episode => [episode.id, episode]));
    const openingArc = compileOpeningArc(episodes[0]);
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
        playableArc: (episodeId: string | undefined) => episodeId === openingArc.episodeId
            ? openingArc
            : n3StoryArcForEpisode(episodeId),
        reviewCalendar: Object.freeze({
            ...source.endlessCalendar,
            startsAfterEpisodeId: 's4e12-next-page',
        }),
        episode: (sectionId: string | undefined) => sectionId ? byId.get(sectionId) : undefined,
        castMembers: resolveCastMembers,
    });
    return cachedRuntime;
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
    for (const source of sources) {
        if (!source.sourceSafety.originalYomu
            || source.sourceSafety.externalDialogueUsed
            || !source.sourceSafety.fictionalComposite
            || source.sourceSafety.realEventClaim
            || !source.replay.chronologicalMemory
            || source.replay.canonicalWrites !== false) {
            throw new TypeError(`Story package ${source.id} crosses its fiction or replay boundary.`);
        }
        validatePackageGraph(source);
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
            if (node.speakerId && !declaredCast.has(node.speakerId)) {
                throw new TypeError(`Speaker ${node.speakerId} is not declared in ${source.id}'s cast.`);
            }
        });
    }
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
