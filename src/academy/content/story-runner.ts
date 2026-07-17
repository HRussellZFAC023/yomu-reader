import type {
    StoryActivityBinding,
    StoryArcNode,
    StoryArcScene,
    StoryChoiceOption,
    StoryLineVariant,
    StoryPlayableArc,
} from './story-runtime';

const STORY_CURSOR_PREFIX = 'story-run:v1:';

export type StoryLanguageBand = 'foundation' | 'n5' | 'n4' | 'n3' | 'n2' | 'n1' | 'ngPlus';
export type StoryActivityOutcome = 'pass' | 'lapse';
export type StoryActivityGate = 'passed' | 'placement-equivalent' | 'lapse' | 'missing' | 'story-only';

export interface StoryCursor {
    readonly version: 1;
    readonly arcId: string;
    readonly sceneId: string;
    readonly nodeId: string;
    readonly choices: Readonly<Record<string, string>>;
    readonly storyOnlyActivityIds: readonly string[];
}

export type StoryMoment =
    | StoryNodeMoment<'stage' | 'narration'>
    | (StoryNodeMoment<'line'> & { readonly line: StoryResolvedLine })
    | (StoryNodeMoment<'choice'> & { readonly options: readonly StoryResolvedChoice[] })
    | (StoryNodeMoment<'activity'> & {
        readonly binding: StoryActivityBinding;
        readonly gate: StoryActivityGate;
    })
    | {
        readonly kind: 'complete';
        readonly scene: StoryArcScene;
        readonly completionEligible: boolean;
    };

interface StoryNodeMoment<Kind extends StoryArcNode['kind']> {
    readonly kind: Kind;
    readonly scene: StoryArcScene;
    readonly node: StoryArcNode & { readonly kind: Kind };
}

export interface StoryResolvedLine extends StoryLineVariant {
    readonly band: StoryLanguageBand;
}

export interface StoryResolvedChoice {
    readonly id: string;
    readonly action: string;
    readonly japanese: string;
}

export interface StoryRunnerOptions {
    readonly arc: StoryPlayableArc;
    readonly band: StoryLanguageBand;
    readonly activityOutcomes?: Readonly<Record<string, StoryActivityOutcome>>;
    /** Placement can satisfy a story gate without writing lesson completion. */
    readonly placementEquivalent?: boolean;
    readonly cursor?: StoryCursor;
}

export interface StoryRunner {
    readonly moment: StoryMoment;
    readonly cursor: StoryCursor;
    readonly band: StoryLanguageBand;
    advance(): StoryMoment;
    choose(optionId: string): StoryMoment;
    continueStoryOnly(): StoryMoment;
    updateActivityOutcomes(outcomes: Readonly<Record<string, StoryActivityOutcome>>): StoryMoment;
}

/**
 * Executes authored story packages without knowing about DOM, routes, or learner-event storage.
 * Checkpoints and commands remain in the cursor graph but settle transparently between playable moments.
 */
export function createStoryRunner(options: StoryRunnerOptions): StoryRunner {
    const { arc } = options;
    const address = storyAddressIndex(arc);
    const choices: Record<string, string> = { ...(options.cursor?.choices ?? {}) };
    const storyOnly = new Set(options.cursor?.storyOnlyActivityIds ?? []);
    let activityOutcomes = { ...(options.activityOutcomes ?? {}) };
    let scene = validCursorScene(arc, options.cursor) ?? arc.scene(arc.firstSceneId)!;
    let node = validCursorNode(scene, options.cursor) ?? firstVisibleNode(scene, choices);
    let complete = false;

    const settle = (): StoryMoment => {
        let guard = 0;
        while (node && (node.kind === 'checkpoint' || node.kind === 'command' || !nodeIsVisible(node, choices))) {
            if (++guard > 1_000) throw new Error(`Story graph ${arc.id} did not settle.`);
            moveAfter(node);
        }
        if (!node || complete) {
            complete = true;
            return {
                kind: 'complete',
                scene,
                completionEligible: storyOnly.size === 0,
            };
        }
        if (node.kind === 'line') {
            return { kind: 'line', scene, node: node as StoryArcNode & { kind: 'line' }, line: resolveStoryLine(node, options.band) };
        }
        if (node.kind === 'choice') {
            return {
                kind: 'choice',
                scene,
                node: node as StoryArcNode & { kind: 'choice' },
                options: Object.freeze((node.options ?? []).map(option => resolveChoice(option, options.band))),
            };
        }
        if (node.kind === 'activity') {
            const binding = arc.curriculum.activities.find(candidate => candidate.nodeId === node!.id);
            if (!binding) throw new Error(`Story activity ${node.id} has no compiled source binding.`);
            return {
                kind: 'activity',
                scene,
                node: node as StoryArcNode & { kind: 'activity' },
                binding,
                gate: activityGate(binding.exerciseId),
            };
        }
        return { kind: node.kind, scene, node } as StoryMoment;
    };

    const moveTo = (target: string | null | undefined): void => {
        if (!target) {
            moveAfter(node);
            return;
        }
        const destination = address.get(target);
        if (!destination) throw new Error(`Story target is outside ${arc.id}: ${target}`);
        scene = destination.scene;
        node = destination.node ?? firstVisibleNode(scene, choices);
    };

    const moveAfter = (current: StoryArcNode | undefined): void => {
        if (!current) {
            complete = true;
            return;
        }
        const index = scene.nodes.findIndex(candidate => candidate.id === current.id);
        const next = scene.nodes.slice(index + 1).find(candidate => nodeIsVisible(candidate, choices));
        if (next) {
            node = next;
            return;
        }
        const nextScene = arc.nextScene(scene.id, choices);
        if (!nextScene) {
            node = undefined;
            complete = true;
            return;
        }
        scene = nextScene;
        node = firstVisibleNode(scene, choices);
    };

    const activityGate = (activityId: string): StoryActivityGate => {
        if (storyOnly.has(activityId)) return 'story-only';
        const outcome = activityOutcomes[activityId];
        if (outcome === 'pass') return 'passed';
        if (outcome === 'lapse') return 'lapse';
        return options.placementEquivalent ? 'placement-equivalent' : 'missing';
    };

    const advance = (): StoryMoment => {
        const current = settle();
        if (current.kind === 'complete') return current;
        if (current.kind === 'choice') throw new Error(`Story choice ${current.node.id} requires an option.`);
        if (current.kind === 'activity') {
            if (current.gate === 'missing' || current.gate === 'lapse') {
                throw new Error(`Story activity ${current.binding.exerciseId} still requires evidence.`);
            }
            moveTo(current.node.onReady);
        } else {
            moveAfter(current.node);
        }
        return settle();
    };

    const choose = (optionId: string): StoryMoment => {
        const current = settle();
        if (current.kind !== 'choice') throw new Error('The current story moment is not a choice.');
        const option = current.node.options?.find(candidate => candidate.id === optionId);
        if (!option) throw new Error(`Choice ${current.node.id} has no option ${optionId}.`);
        choices[current.node.id] = option.id;
        moveTo(option.next || current.node.convergence);
        return settle();
    };

    const continueStoryOnly = (): StoryMoment => {
        const current = settle();
        if (current.kind !== 'activity') throw new Error('The current story moment is not an activity.');
        storyOnly.add(current.binding.exerciseId);
        moveTo(current.node.onReady);
        return settle();
    };

    return {
        get moment() { return settle(); },
        get cursor() {
            const current = settle();
            const currentNode = current.kind === 'complete' ? scene.nodes.at(-1) : current.node;
            if (!currentNode) throw new Error(`Story arc ${arc.id} has no cursor node.`);
            return Object.freeze({
                version: 1 as const,
                arcId: arc.id,
                sceneId: scene.id,
                nodeId: currentNode.id,
                choices: Object.freeze({ ...choices }),
                storyOnlyActivityIds: Object.freeze([...storyOnly].sort()),
            });
        },
        band: options.band,
        advance,
        choose,
        continueStoryOnly,
        updateActivityOutcomes(outcomes) {
            activityOutcomes = { ...outcomes };
            return settle();
        },
    };
}

export function serializeStoryCursor(cursor: StoryCursor): string {
    return `${STORY_CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(cursor))}`;
}

export function parseStoryCursor(sectionId: string | undefined): StoryCursor | undefined {
    if (!sectionId?.startsWith(STORY_CURSOR_PREFIX)) return undefined;
    try {
        const value = JSON.parse(decodeURIComponent(sectionId.slice(STORY_CURSOR_PREFIX.length))) as Partial<StoryCursor>;
        if (value.version !== 1
            || typeof value.arcId !== 'string'
            || typeof value.sceneId !== 'string'
            || typeof value.nodeId !== 'string'
            || !value.choices || typeof value.choices !== 'object'
            || !Array.isArray(value.storyOnlyActivityIds)
            || value.storyOnlyActivityIds.some(id => typeof id !== 'string')) return undefined;
        return value as StoryCursor;
    } catch {
        return undefined;
    }
}

export function resolveStoryBand(band: string | undefined): StoryLanguageBand {
    return band === 'n5' || band === 'n4' || band === 'n3' || band === 'n2' || band === 'n1'
        ? band
        : 'foundation';
}

export function storySceneAttendeeIds(
    scene: StoryArcScene,
    choices: Readonly<Record<string, string>>,
): readonly string[] {
    return Object.freeze([...new Set(scene.nodes.flatMap(node =>
        node.kind === 'line' && node.speakerId && node.speakerId !== 'learner' && nodeIsVisible(node, choices)
            ? [node.speakerId]
            : []))]);
}

function resolveStoryLine(node: StoryArcNode, band: StoryLanguageBand): StoryResolvedLine {
    const entries = node.variants ?? {};
    const order: readonly StoryLanguageBand[] = ['foundation', 'n5', 'n4', 'n3', 'n2', 'n1', 'ngPlus'];
    const requested = order.indexOf(band);
    for (let index = requested; index >= 0; index -= 1) {
        const candidateBand = order[index]!;
        const candidate = entries[candidateBand];
        if (candidate) return Object.freeze({ ...candidate, band: candidateBand });
    }
    const first = Object.entries(entries)[0] as [StoryLanguageBand, StoryLineVariant] | undefined;
    if (!first) throw new Error(`Story line ${node.id} has no authored language variant.`);
    return Object.freeze({ ...first[1], band: first[0] });
}

function resolveChoice(option: StoryChoiceOption, band: StoryLanguageBand): StoryResolvedChoice {
    const order: readonly StoryLanguageBand[] = ['foundation', 'n5', 'n4', 'n3', 'n2', 'n1', 'ngPlus'];
    const requested = order.indexOf(band);
    let japanese = '';
    for (let index = requested; index >= 0 && !japanese; index -= 1) {
        japanese = option.japaneseByBand[order[index]!] ?? '';
    }
    japanese ||= Object.values(option.japaneseByBand)[0] ?? '';
    return Object.freeze({ id: option.id, action: option.action, japanese });
}

function nodeIsVisible(node: StoryArcNode, choices: Readonly<Record<string, string>>): boolean {
    if (!node.when) return true;
    const selected = choices[node.when.choiceId];
    if (!selected) return false;
    if (node.when.optionId) return selected === node.when.optionId;
    return node.when.optionIds?.includes(selected) ?? true;
}

function firstVisibleNode(scene: StoryArcScene, choices: Readonly<Record<string, string>>): StoryArcNode | undefined {
    return scene.nodes.find(node => nodeIsVisible(node, choices));
}

function storyAddressIndex(arc: StoryPlayableArc): ReadonlyMap<string, { scene: StoryArcScene; node?: StoryArcNode }> {
    const index = new Map<string, { scene: StoryArcScene; node?: StoryArcNode }>();
    arc.scenes.forEach(scene => {
        index.set(scene.id, { scene });
        scene.nodes.forEach(node => {
            index.set(node.id, { scene, node });
            node.options?.forEach(option => index.set(option.id, { scene, node }));
        });
    });
    return index;
}

function validCursorScene(arc: StoryPlayableArc, cursor: StoryCursor | undefined): StoryArcScene | undefined {
    return cursor?.arcId === arc.id ? arc.scene(cursor.sceneId) : undefined;
}

function validCursorNode(scene: StoryArcScene, cursor: StoryCursor | undefined): StoryArcNode | undefined {
    return cursor?.sceneId === scene.id ? scene.nodes.find(node => node.id === cursor.nodeId) : undefined;
}
